import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { saveCategories } from './categories.ts';
import { CONFIG_FILE, type BrainMode, formatBrainConfig } from './config.ts';
import { installPushGuard, removePushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';
import { relativeInside } from './paths.ts';

/** Root of the brain code repository this CLI runs from. */
export const CODE_ROOT = resolve(import.meta.dirname, '..', '..');

export const TEMPLATE_DIR = join(CODE_ROOT, 'template');

const RENAMES: Record<string, string> = { _gitignore: '.gitignore', _gitattributes: '.gitattributes' };

/** Files and folders that must not exist in the target knowledge folder before init. */
const RESERVED = ['categories.yml', 'wiki', 'archive', 'inbox', '.gitignore', '.gitattributes', 'CLAUDE.md'];

export interface InitOptions {
    /** Directory brain init was called from. */
    cwd: string;
    /** Knowledge folder relative to the repository root; asked for when missing. */
    path?: string;
    /** true: private, false: project, undefined: ask (askMode) or project. */
    private?: boolean;
    askMode?: () => BrainMode;
    /** Private mode without push guard: no question, a remote is allowed. */
    allowPush?: boolean;
    askPath?: () => string;
    /** brain code repository, where no knowledge folder may be created (default: CODE_ROOT). */
    codeRoot?: string;
    /** Asks whether a private knowledge folder stays local only; without it the push guard is on. */
    askPushGuard?: () => boolean;
    templateDir?: string;
}

export interface InitResult {
    configRoot: string;
    brainDir: string;
    mode: BrainMode;
    pushGuard: boolean;
    createdRepo: boolean;
}

/** Lists template files as [source path relative to template, target path relative to the knowledge folder]. */
function templateFiles(templateDir: string, prefix = ''): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    for (const dirent of readdirSync(join(templateDir, prefix), { withFileTypes: true })) {
        const rel = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`;
        if (dirent.isDirectory()) {
            result.push(...templateFiles(templateDir, rel));
        } else {
            result.push([rel, prefix === '' ? (RENAMES[dirent.name] ?? rel) : rel]);
        }
    }
    return result.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function gitOutput(dir: string, args: string[]): string | null {
    try {
        return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
        return null;
    }
}

/** Copies changed template files into the knowledge folder, installs or removes the push guard; returns changed paths. */
export function updateBrainConfig(brainDir: string, pushGuard: boolean, templateDir = TEMPLATE_DIR): string[] {
    const changed: string[] = [];
    for (const [source, targetRel] of templateFiles(templateDir)) {
        const content = readFileSync(join(templateDir, source));
        const file = join(brainDir, targetRel);
        if (existsSync(file) && readFileSync(file).equals(content)) {
            continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        changed.push(targetRel);
    }
    if (pushGuard) {
        installPushGuard(brainDir);
    } else {
        removePushGuard(brainDir);
    }
    return changed;
}

/** Creates brain.yml at the repository root and a new knowledge folder; never commits. */
export function initBrain(options: InitOptions): InitResult {
    const cwd = resolve(options.cwd);
    const top = gitOutput(cwd, ['rev-parse', '--show-toplevel']);
    const configRoot = top ?? cwd;
    if (realpathSync(configRoot) === realpathSync(options.codeRoot ?? CODE_ROOT)) {
        throw new Error('Das ist das brain-Code-Repository – hier keinen Wissens-Ordner anlegen. '
            + 'Zum Ausprobieren: mkdir /tmp/brain-test && cd /tmp/brain-test && brain init --private .');
    }
    if (existsSync(join(configRoot, CONFIG_FILE))) {
        throw new Error(`Hier gibt es bereits einen Wissens-Ordner: ${join(configRoot, CONFIG_FILE)}`);
    }
    const mode: BrainMode = options.private === undefined
        ? options.askMode?.() ?? 'project'
        : options.private ? 'private' : 'project';
    const isPrivate = mode === 'private';
    if (top === null && !isPrivate) {
        throw new Error('brain init muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private');
    }
    if (options.allowPush === true && !isPrivate) {
        throw new Error('--allow-push nur mit --private');
    }
    const requested = options.path ?? options.askPath?.();
    if (requested === undefined || requested.trim() === '') {
        throw new Error('Pfad angeben: brain init [--private] <pfad>');
    }
    const pushGuard = isPrivate && options.allowPush !== true && (options.askPushGuard?.() ?? true);
    if (pushGuard && top !== null && (gitOutput(top, ['remote']) ?? '') !== '') {
        throw new Error('Privater Wissens-Ordner nur in einem Repository ohne Remote – Remote entfernen, ohne --private anlegen oder --allow-push verwenden');
    }
    const brainDir = resolve(configRoot, requested.trim());
    const path = brainDir === configRoot ? '.' : relativeInside(configRoot, brainDir);
    if (path === null) {
        throw new Error(`${requested} liegt außerhalb des Repositorys ${configRoot}`);
    }
    for (let dir = brainDir; dir !== configRoot; dir = dirname(dir)) {
        if (existsSync(dir) && !statSync(dir).isDirectory()) {
            throw new Error(`${requested} ist kein Ordner – anderen Wissens-Ordner wählen`);
        }
    }
    for (const name of RESERVED) {
        if (existsSync(join(brainDir, name))) {
            throw new Error(`${name} existiert bereits in ${brainDir} – anderen Wissens-Ordner wählen`);
        }
    }
    const createdRepo = top === null;
    if (createdRepo) {
        execFileSync('git', ['-C', cwd, 'init', '-q'], { stdio: 'pipe' });
    }
    mkdirSync(brainDir, { recursive: true });
    updateBrainConfig(brainDir, pushGuard, options.templateDir);
    for (const dir of ['inbox', 'archive', 'wiki']) {
        mkdirSync(join(brainDir, dir), { recursive: true });
    }
    writeFileSync(join(brainDir, 'inbox', '.gitkeep'), '');
    saveCategories(brainDir, []);
    runIndex(brainDir);
    writeFileSync(join(configRoot, CONFIG_FILE), formatBrainConfig(path, mode, pushGuard));
    return { configRoot, brainDir, mode, pushGuard, createdRepo };
}
