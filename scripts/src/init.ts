import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { saveCategories } from './categories.ts';
import { CONFIG_FILE, formatBrainConfig } from './config.ts';
import { installPushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';

export const TEMPLATE_DIR = resolve(import.meta.dirname, '..', '..', 'template');

const RENAMES: Record<string, string> = { _gitignore: '.gitignore', _gitattributes: '.gitattributes' };

/** Lists template files as [source path relative to template, target path relative to brain]. */
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

function git(root: string, args: string[]): void {
    execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
}

/** Copies changed template files into the brain; returns the changed target paths. */
export function updateBrainConfig(root: string, templateDir = TEMPLATE_DIR): string[] {
    const changed: string[] = [];
    for (const [source, targetRel] of templateFiles(templateDir)) {
        const content = readFileSync(join(templateDir, source));
        const file = join(root, targetRel);
        if (existsSync(file) && readFileSync(file).equals(content)) {
            continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        changed.push(targetRel);
    }
    installPushGuard(root);
    return changed;
}

/** Creates a new brain data repository (git, template, guard, empty categories, index, first commit). */
export function initBrain(target: string, templateDir = TEMPLATE_DIR): string {
    const root = resolve(target);
    if (existsSync(join(root, 'categories.yml'))) {
        throw new Error(`Dort existiert bereits ein Brain: ${root}`);
    }
    if (existsSync(root) && readdirSync(root).length > 0) {
        throw new Error(`Zielordner ist nicht leer: ${root} – brain init nur in einen neuen oder leeren Ordner`);
    }
    try {
        execFileSync('git', ['var', 'GIT_AUTHOR_IDENT'], { stdio: 'pipe' });
        execFileSync('git', ['var', 'GIT_COMMITTER_IDENT'], { stdio: 'pipe' });
    } catch {
        throw new Error('Git-Identität fehlt – zuerst git config --global user.name "…" und user.email "…" setzen');
    }
    mkdirSync(root, { recursive: true });
    git(root, ['init', '-q']);
    updateBrainConfig(root, templateDir);
    writeFileSync(join(root, CONFIG_FILE), formatBrainConfig('.', 'private'));
    for (const dir of ['inbox', 'archive', 'wiki']) {
        mkdirSync(join(root, dir), { recursive: true });
    }
    writeFileSync(join(root, 'inbox', '.gitkeep'), '');
    saveCategories(root, []);
    runIndex(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'init: second brain data repository']);
    return root;
}
