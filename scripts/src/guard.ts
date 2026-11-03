import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PUSH_GUARD_MARKER = '# brain: this repository must never be pushed.';

const HOOK = [
    '#!/bin/sh',
    PUSH_GUARD_MARKER,
    'echo "Brain: Dieses Repository ist privat (mode: private, push_guard: true) und darf nicht gepusht werden." >&2',
    'echo "Brain: Pushen erlauben: in brain.yml „push_guard: false“ setzen, dann „brain init --update“ ausführen." >&2',
    'exit 1',
    '',
].join('\n');

/** Hook contents written by brain, including earlier versions; only these are deleted. */
const BRAIN_HOOKS = [
    HOOK,
    [
        '#!/bin/sh',
        PUSH_GUARD_MARKER,
        'echo "Brain: Dieses Repository ist privat (mode: private) und darf nicht gepusht werden." >&2',
        'exit 1',
        '',
    ].join('\n'),
];

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

/** True when the brain pre-push hook (with marker) is installed; false outside a git repository. */
export function hasPushGuard(root: string): boolean {
    let file: string;
    try {
        file = hookFile(root);
    } catch {
        return false;
    }
    return existsSync(file) && readFileSync(file, 'utf8').includes(PUSH_GUARD_MARKER);
}

/**
 * Deletes the brain pre-push hook; a foreign hook and core.hooksPath stay. Returns true when deleted.
 * Throws when the hook carries the marker but was changed, so foreign lines are never lost.
 */
export function removePushGuard(root: string): boolean {
    if (!hasPushGuard(root)) {
        return false;
    }
    const file = hookFile(root);
    if (!BRAIN_HOOKS.includes(readFileSync(file, 'utf8'))) {
        throw new Error(`Push-Schutz nicht entfernt: ${file} enthält mehr als den brain-Hook – brain-Zeilen von Hand entfernen`);
    }
    rmSync(file);
    return true;
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
