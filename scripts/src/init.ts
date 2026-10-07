import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { saveCategories } from './categories.ts';
import { CONFIG_FILE, type BrainMode, formatBrainConfig } from './config.ts';
import { installPushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';
import { relativeInside } from './paths.ts';

export const TEMPLATE_DIR = resolve(import.meta.dirname, '..', '..', 'template');

const RENAMES: Record<string, string> = { _gitignore: '.gitignore', _gitattributes: '.gitattributes' };

/** Files and folders that must not exist in the target knowledge folder before init. */
const RESERVED = ['categories.yml', 'wiki', 'archive', 'inbox', '.gitignore', '.gitattributes', 'CLAUDE.md'];

export interface InitOptions {
    /** Directory brain init was called from. */
    cwd: string;
    /** Knowledge folder relative to the repository root; asked for when missing. */
    path?: string;
    private: boolean;
    askPath?: () => string;
    templateDir?: string;
}

export interface InitResult {
    configRoot: string;
    brainDir: string;
    mode: BrainMode;
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

/** Copies changed template files into the knowledge folder, installs the push guard in private mode; returns changed paths. */
export function updateBrainConfig(brainDir: string, mode: BrainMode, templateDir = TEMPLATE_DIR): string[] {
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
    if (mode === 'private') {
        installPushGuard(brainDir);
    }
    return changed;
}

/** Creates brain.yml at the repository root and a new knowledge folder; never commits. */
export function initBrain(options: InitOptions): InitResult {
    const cwd = resolve(options.cwd);
    const mode: BrainMode = options.private ? 'private' : 'project';
    const top = gitOutput(cwd, ['rev-parse', '--show-toplevel']);
    if (top === null && !options.private) {
        throw new Error('brain init muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private');
    }
    const configRoot = top ?? cwd;
    if (existsSync(join(configRoot, CONFIG_FILE))) {
        throw new Error(`Hier gibt es bereits einen Wissens-Ordner: ${join(configRoot, CONFIG_FILE)}`);
    }
    if (options.private && top !== null && (gitOutput(top, ['remote']) ?? '') !== '') {
        throw new Error('Privater Wissens-Ordner nur in einem Repository ohne Remote – Remote entfernen oder ohne --private anlegen');
    }
    const requested = options.path ?? options.askPath?.();
    if (requested === undefined || requested.trim() === '') {
        throw new Error('Pfad angeben: brain init [--private] <pfad>');
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
    updateBrainConfig(brainDir, mode, options.templateDir);
    for (const dir of ['inbox', 'archive', 'wiki']) {
        mkdirSync(join(brainDir, dir), { recursive: true });
    }
    writeFileSync(join(brainDir, 'inbox', '.gitkeep'), '');
    saveCategories(brainDir, []);
    runIndex(brainDir);
    writeFileSync(join(configRoot, CONFIG_FILE), formatBrainConfig(path, mode));
    return { configRoot, brainDir, mode, createdRepo };
}
