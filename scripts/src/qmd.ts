import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseDocument } from 'yaml';
import { slugify } from './slug.ts';

export const QMD_EMBED_MODEL = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';

const WIKI_CONTEXT = 'Verdichtete, aktuelle Wissenseinträge (Deutsch), gegliedert nach Kategorien in Unterordnern. Primäre Quelle für Antworten.';
const ARCHIVE_CONTEXT = 'Originalnotizen (Deutsch), unverdichtet und unverändert archiviert; können durch das Wiki überholt sein.';

export function qmdIndexName(root: string): string {
    return `brain-${slugify(basename(root))}`;
}

export function qmdConfigPath(root: string): string {
    const dir = process.env.QMD_CONFIG_DIR
        ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'qmd');
    return join(dir, `${qmdIndexName(root)}.yml`);
}

export function isQmdInstalled(): boolean {
    return spawnSync('qmd', ['--version'], { stdio: 'ignore' }).error === undefined;
}

/** Runs qmd with the index of this brain in the brain root; returns qmd's exit code. */
export function runQmd(root: string, args: string[], stdio: 'inherit' | 'ignore' = 'inherit'): number {
    const result = spawnSync('qmd', ['--index', qmdIndexName(root), ...args], { cwd: root, stdio });
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

/** (Re)creates the wiki and archive collections of this brain's qmd index and embeds them. */
export function setupQmd(root: string): void {
    mkdirSync(join(root, 'wiki'), { recursive: true });
    mkdirSync(join(root, 'archive'), { recursive: true });
    runQmd(root, ['collection', 'remove', 'wiki'], 'ignore');
    runQmd(root, ['collection', 'remove', 'archive'], 'ignore');
    mustRunQmd(root, ['collection', 'add', join(root, 'wiki'), '--name', 'wiki', '--mask', '*/*.md']);
    mustRunQmd(root, ['collection', 'add', join(root, 'archive'), '--name', 'archive', '--mask', '**/*.md']);
    mustRunQmd(root, ['context', 'add', 'qmd://wiki', WIKI_CONTEXT]);
    mustRunQmd(root, ['context', 'add', 'qmd://archive', ARCHIVE_CONTEXT]);
    setEmbedModel(root);
    mustRunQmd(root, ['update']);
    mustRunQmd(root, ['embed']);
}
