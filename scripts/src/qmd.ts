import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { findConfigRoot } from './config.ts';
import type { SearchLevel } from './search.ts';
import { slugify } from './slug.ts';

export const QMD_EMBED_MODEL = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';

const WIKI_CONTEXT = 'Verdichtete, aktuelle Wissenseinträge (Deutsch), gegliedert nach Kategorien in Unterordnern. Primäre Quelle für Antworten.';
const ARCHIVE_CONTEXT = 'Originalnotizen (Deutsch), unverdichtet und unverändert archiviert; können durch das Wiki überholt sein.';

function realPath(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
}

/** brain-<repository folder>-<first 8 hex chars of sha256 over the real knowledge folder path>. */
export function qmdIndexName(root: string): string {
    const repo = findConfigRoot(root) ?? root;
    const hash = createHash('sha256').update(realPath(root)).digest('hex').slice(0, 8);
    return `brain-${slugify(basename(repo))}-${hash}`;
}

/** Same rules as qmd: QMD_CONFIG_DIR, then $XDG_CONFIG_HOME/qmd, then ~/.config/qmd. */
export function qmdConfigDir(): string {
    return process.env.QMD_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'qmd');
}

/** Same rules as qmd: $XDG_CACHE_HOME/qmd, then ~/.cache/qmd. */
export function qmdCacheDir(): string {
    return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'qmd');
}

export function qmdConfigPath(root: string): string {
    return join(qmdConfigDir(), `${qmdIndexName(root)}.yml`);
}

export function isQmdInstalled(): boolean {
    return spawnSync('qmd', ['--version'], { stdio: 'ignore' }).error === undefined;
}

/** Runs qmd with the index of this knowledge folder; INDEX_PATH is never passed on. */
export function runQmd(root: string, args: string[], stdio: 'inherit' | 'ignore' = 'inherit'): number {
    const env = { ...process.env };
    delete env.INDEX_PATH;
    const result = spawnSync('qmd', ['--index', qmdIndexName(root), ...args], { cwd: root, stdio, env });
    if (result.error !== undefined) {
        throw new Error('qmd nicht gefunden – Installation: npm install -g @tobilu/qmd');
    }
    return result.status ?? 1;
}

function mustRunQmd(root: string, args: string[]): void {
    const status = runQmd(root, args);
    if (status !== 0) {
        throw new Error(`qmd ${args.join(' ')} fehlgeschlagen (Exit ${status})`);
    }
}

function setEmbedModel(root: string): void {
    const file = qmdConfigPath(root);
    mkdirSync(dirname(file), { recursive: true });
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const doc = parseDocument(existing.trim() === '' ? '{}' : existing);
    doc.setIn(['models', 'embed'], QMD_EMBED_MODEL);
    writeFileSync(file, String(doc), 'utf8');
}

/** (Re)creates the wiki and archive collections of this knowledge folder's qmd index; hybrid also sets the model and embeds. */
export function setupQmd(root: string, level: Exclude<SearchLevel, 'off'>): void {
    mkdirSync(join(root, 'wiki'), { recursive: true });
    mkdirSync(join(root, 'archive'), { recursive: true });
    runQmd(root, ['collection', 'remove', 'wiki'], 'ignore');
    runQmd(root, ['collection', 'remove', 'archive'], 'ignore');
    mustRunQmd(root, ['collection', 'add', join(root, 'wiki'), '--name', 'wiki', '--mask', '*/*.md']);
    mustRunQmd(root, ['collection', 'add', join(root, 'archive'), '--name', 'archive', '--mask', '**/*.md']);
    mustRunQmd(root, ['context', 'add', 'qmd://wiki', WIKI_CONTEXT]);
    mustRunQmd(root, ['context', 'add', 'qmd://archive', ARCHIVE_CONTEXT]);
    if (level === 'hybrid') {
        setEmbedModel(root);
    }
    mustRunQmd(root, ['update']);
    if (level === 'hybrid') {
        mustRunQmd(root, ['embed']);
    }
}

function readYaml(file: string): unknown {
    try {
        return parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function field(value: unknown, ...keys: string[]): unknown {
    let current = value;
    for (const key of keys) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

/** True when this knowledge folder's qmd index config exists and has a wiki collection path. */
export function qmdIndexReady(root: string): boolean {
    return typeof field(readYaml(qmdConfigPath(root)), 'collections', 'wiki', 'path') === 'string';
}

/** Index checks for brain check: foreign collection paths are errors, everything else hints. */
export function qmdCheck(root: string, level: SearchLevel): { errors: string[]; hints: string[] } {
    const errors: string[] = [];
    const hints: string[] = [];
    if (level === 'off') {
        return { errors, hints };
    }
    const name = qmdIndexName(root);
    const file = qmdConfigPath(root);
    if (!existsSync(file)) {
        hints.push(`qmd-Index für diesen Wissens-Ordner fehlt (${name}) – brain qmd setup ausführen`);
        return { errors, hints };
    }
    const config = readYaml(file);
    for (const collection of ['wiki', 'archive']) {
        const path = field(config, 'collections', collection, 'path');
        const expected = join(root, collection);
        if (typeof path !== 'string') {
            hints.push(`qmd-Index ${name}: Collection ${collection} fehlt – brain qmd setup ausführen`);
        } else if (realPath(path) !== realPath(expected)) {
            errors.push(`qmd-Index ${name}: Collection ${collection} zeigt auf ${path} statt ${expected} – brain qmd setup ausführen`);
        }
    }
    if (level === 'hybrid' && field(config, 'models', 'embed') !== QMD_EMBED_MODEL) {
        hints.push(`qmd-Index ${name}: Embedding-Modell fehlt oder veraltet – brain qmd setup ausführen`);
    }
    return { errors, hints };
}

export interface OrphanIndex {
    name: string;
    path: string;
}

/** brain-* indexes whose wiki collection no longer exists. */
export function findOrphanIndexes(): OrphanIndex[] {
    const dir = qmdConfigDir();
    if (!existsSync(dir)) {
        return [];
    }
    const orphans: OrphanIndex[] = [];
    for (const file of readdirSync(dir).sort()) {
        if (!file.startsWith('brain-') || !file.endsWith('.yml')) {
            continue;
        }
        const path = field(readYaml(join(dir, file)), 'collections', 'wiki', 'path');
        if (typeof path !== 'string' || !existsSync(path)) {
            orphans.push({ name: file.slice(0, -'.yml'.length), path: typeof path === 'string' ? path : '(unbekannt)' });
        }
    }
    return orphans;
}

/** Deletes the config and the database files of a brain-* index. */
export function removeIndex(name: string): void {
    if (!name.startsWith('brain-')) {
        throw new Error(`Kein Brain-Index: ${name}`);
    }
    rmSync(join(qmdConfigDir(), `${name}.yml`), { force: true });
    for (const suffix of ['.sqlite', '.sqlite-shm', '.sqlite-wal']) {
        rmSync(join(qmdCacheDir(), `${name}${suffix}`), { force: true });
    }
}
