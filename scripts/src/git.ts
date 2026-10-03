import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Compares the working tree of archive/ against HEAD: only new files and identical renames are allowed. */
export function archiveIntegrityErrors(root: string): string[] {
    if (!hasHead(root)) {
        return [];
    }
    const output = git(root, ['status', '--porcelain=v1', '-z', '--find-renames', '--untracked-files=no', '--', 'archive']).toString('utf8');
    const tokens = output.split('\0').filter((token) => token !== '');
    const errors: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const status = tokens[i].slice(0, 2);
        const path = tokens[i].slice(3);
        if (status[0] === 'R' || status[0] === 'C') {
            const from = tokens[++i];
            const original = git(root, ['show', `HEAD:${from}`]);
            const current = existsSync(join(root, path)) ? readFileSync(join(root, path)) : Buffer.alloc(0);
            if (!original.equals(current)) {
                errors.push(`archive: ${from} → ${path} mit Inhaltsänderung umbenannt`);
            }
        } else if (status.includes('D')) {
            errors.push(`archive: ${path} wurde gelöscht (Verschieben nur per brain recategorize)`);
        } else if (status.includes('M') || status.includes('T')) {
            errors.push(`archive: ${path} wurde verändert`);
        }
    }
    return errors;
}
