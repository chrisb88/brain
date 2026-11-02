import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { hasPushGuard, installPushGuard, PUSH_GUARD_MARKER, pushGuardErrors, removePushGuard } from '../src/guard.ts';
import { git, initGit, validBrain } from './helpers.ts';

const hookPath = (root: string): string => join(git(root, 'rev-parse', '--absolute-git-dir').trim(), 'hooks', 'pre-push');

test('a guarded repository has no guard errors', () => {
    const root = validBrain();
    initGit(root);
    assert.deepEqual(pushGuardErrors(root), []);
    assert.deepEqual(checkBrain(root, 'private').errors, []);
});

test('push is rejected by the hook', () => {
    const root = validBrain();
    initGit(root);
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    execFileSync('git', ['init', '-q', '--bare', bare]);
    const result = spawnSync('git', ['-C', root, 'push', bare, 'HEAD:refs/heads/main'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /darf nicht gepusht werden/);
    assert.match(result.stderr, /Pushen erlauben: in brain\.yml „push_guard: false“ setzen, dann „brain init --update“ ausführen\./);
});

const broken: Array<[string, (root: string) => void, RegExp]> = [
    ['remote configured', (root) => git(root, 'remote', 'add', 'origin', 'https://example.com/x.git'), /hat ein Remote \(origin\)/],
    ['hook missing', (root) => rmSync(hookPath(root)), /Push-Schutz fehlt/],
    ['foreign hook', (root) => writeFileSync(hookPath(root), '#!/bin/sh\nexit 0\n'), /Push-Schutz fehlt/],
    ['other hooksPath', (root) => git(root, 'config', 'core.hooksPath', '/tmp/elsewhere'), /core\.hooksPath/],
];
for (const [label, mutate, error] of broken) {
    test(`check reports ${label}`, () => {
        const root = validBrain();
        initGit(root);
        mutate(root);
        assert.match(checkBrain(root, 'private').errors.join('\n'), error);
    });
}

test('installPushGuard is idempotent and writes the marker', () => {
    const root = validBrain();
    initGit(root);
    installPushGuard(root);
    assert.ok(readFileSync(hookPath(root), 'utf8').includes(PUSH_GUARD_MARKER));
    assert.equal(git(root, 'config', '--local', 'core.hooksPath').trim(), join(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(), 'hooks'));
});

test('removePushGuard deletes the brain hook', () => {
    const root = validBrain();
    initGit(root);
    assert.equal(hasPushGuard(root), true);
    assert.equal(removePushGuard(root), true);
    assert.equal(hasPushGuard(root), false);
    assert.equal(removePushGuard(root), false);
});

test('removePushGuard keeps a foreign hook', () => {
    const root = validBrain();
    initGit(root);
    writeFileSync(hookPath(root), '#!/bin/sh\nexit 0\n');
    assert.equal(removePushGuard(root), false);
    assert.equal(readFileSync(hookPath(root), 'utf8'), '#!/bin/sh\nexit 0\n');
    assert.doesNotMatch(checkBrain(root, 'private', 'off', false).hints.join('\n'), /Push-Schutz noch installiert/);
});

test('hasPushGuard is false outside a git repository', () => {
    assert.equal(hasPushGuard(validBrain()), false);
});

test('check without push guard accepts a remote and hints at a leftover guard', () => {
    const root = validBrain();
    initGit(root);
    git(root, 'remote', 'add', 'origin', 'https://example.com/x.git');
    const report = checkBrain(root, 'private', 'off', false);
    assert.deepEqual(report.errors, []);
    assert.match(report.hints.join('\n'), /Push-Schutz noch installiert, obwohl push_guard: false – brain init --update ausführen/);
    removePushGuard(root);
    assert.doesNotMatch(checkBrain(root, 'private', 'off', false).hints.join('\n'), /Push-Schutz noch installiert/);
});
