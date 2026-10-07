import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PUSH_GUARD_MARKER = '# brain: this repository must never be pushed.';

const HOOK = [
    '#!/bin/sh',
    PUSH_GUARD_MARKER,
    'echo "Brain: Dieses Repository ist privat (mode: private) und darf nicht gepusht werden." >&2',
    'exit 1',
    '',
].join('\n');

function git(root: string, args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Hooks directory shared by the main checkout and all linked worktrees. */
function hooksDir(root: string): string {
    return join(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']), 'hooks');
}

function hookFile(root: string): string {
    return join(hooksDir(root), 'pre-push');
}

/** Installs a pre-push hook that rejects every push and pins core.hooksPath to the absolute shared hooks dir. */
export function installPushGuard(root: string): void {
    git(root, ['config', '--local', 'core.hooksPath', hooksDir(root)]);
    const file = hookFile(root);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, HOOK, 'utf8');
    chmodSync(file, 0o755);
}

export function pushGuardErrors(root: string): string[] {
    const errors: string[] = [];
    const remotes = git(root, ['remote']).split('\n').filter((name) => name !== '');
    if (remotes.length > 0) {
        errors.push(`Daten-Repository hat ein Remote (${remotes.join(', ')}) – entfernen mit: git remote remove <name>`);
    }
    let hooksPath = '';
    try {
        hooksPath = git(root, ['config', '--get', 'core.hooksPath']);
    } catch {
        hooksPath = '';
    }
    if (hooksPath !== hooksDir(root)) {
        errors.push(`core.hooksPath zeigt auf „${hooksPath}“ – Push-Schutz wäre wirkungslos (brain init --update ausführen)`);
    }
    const file = hookFile(root);
    if (!existsSync(file) || !readFileSync(file, 'utf8').includes(PUSH_GUARD_MARKER)) {
        errors.push('Push-Schutz fehlt (.git/hooks/pre-push) – brain init --update ausführen');
    }
    return errors;
}
