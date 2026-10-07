import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toPosix } from './paths.ts';

function git(root: string, args: string[]): Buffer {
    return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

export function isGitRepo(root: string): boolean {
    try {
        return git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim() !== '';
    } catch {
        return false;
    }
}

function hasHead(root: string): boolean {
    try {
        git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
        return true;
    } catch {
        return false;
    }
}

function repoTop(root: string): string {
    return git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
}

/** Converts a path relative to the repository top into a path relative to the knowledge folder. */
function brainRelative(root: string, top: string): (path: string) => string {
    const base = realpathSync(root);
    return (path) => toPosix(relative(base, join(top, path)));
}

/** Changed or untracked (not ignored) files inside the knowledge folder, relative to it. */
export function uncommittedChanges(root: string): string[] {
    const toBrain = brainRelative(root, repoTop(root));
    const output = git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', '.']).toString('utf8');
    return output.split('\0').filter((token) => token !== '').map((token) => toBrain(token.slice(3)));
}

/** Compares the working tree of archive/ against HEAD: only new files and identical renames are allowed. */
export function archiveIntegrityErrors(root: string): string[] {
    if (!hasHead(root)) {
        return [];
    }
    const top = repoTop(root);
    const toBrain = brainRelative(root, top);
    const output = git(root, ['status', '--porcelain=v1', '-z', '--find-renames', '--untracked-files=no', '--', 'archive']).toString('utf8');
    const tokens = output.split('\0').filter((token) => token !== '');
    const errors: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const status = tokens[i].slice(0, 2);
        const path = tokens[i].slice(3);
        if (status[0] === 'R' || status[0] === 'C') {
            const from = tokens[++i];
            const original = git(root, ['show', `HEAD:${from}`]);
            const current = existsSync(join(top, path)) ? readFileSync(join(top, path)) : Buffer.alloc(0);
            if (!original.equals(current)) {
                errors.push(`archive: ${toBrain(from)} → ${toBrain(path)} mit Inhaltsänderung umbenannt`);
            }
        } else if (status.includes('D')) {
            errors.push(`archive: ${toBrain(path)} wurde gelöscht (Verschieben nur per brain recategorize)`);
        } else if (status.includes('M') || status.includes('T')) {
            errors.push(`archive: ${toBrain(path)} wurde verändert`);
        }
    }
    return errors;
}
