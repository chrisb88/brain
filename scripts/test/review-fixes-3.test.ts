import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { initBrain } from '../src/init.ts';
import { CATEGORIES, git, makeBrain, runCli } from './helpers.ts';

process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

const fresh = (): string => join(mkdtempSync(join(tmpdir(), 'init-')), 'brain-data');

// 1 + 2: init only into a missing or empty directory
test('initBrain refuses a non-empty directory and leaves it untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-'));
    writeFileSync(join(dir, 'CLAUDE.md'), 'meins');
    assert.throws(() => initBrain(dir), /nicht leer/);
    assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'meins');
    assert.deepEqual(readdirSync(dir), ['CLAUDE.md']);
});

test('initBrain refuses an existing git repository with a remote and secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repo-'));
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://example.com/x.git']);
    writeFileSync(join(dir, '.env'), 'SECRET=1');
    assert.throws(() => initBrain(dir), /nicht leer/);
    assert.equal(existsSync(join(dir, 'categories.yml')), false);
});

test('initBrain accepts an existing empty directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'empty-'));
    assert.equal(initBrain(dir), dir);
    assert.deepEqual(checkBrain(dir).errors, []);
});

// 3: stale INIT_CWD outside npm must not redirect brain
test('a stale INIT_CWD is ignored outside npm scripts', () => {
    const b1 = makeBrain({ 'categories.yml': CATEGORIES });
    const b2 = makeBrain({ 'categories.yml': 'categories:\n  - slug: urlaub\n    name: Urlaub\n' });
    mkdirSync(join(b1, 'wiki'), { recursive: true });
    const result = runCli(b1, ['category', 'list'], '', join(b1, 'wiki'), { BRAIN_ROOT: '', INIT_CWD: b2, npm_lifecycle_event: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gesundheit/);
    assert.doesNotMatch(result.stdout, /urlaub/);
});

test('relative paths resolve against cwd when INIT_CWD is stale', () => {
    const b1 = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    const b2 = makeBrain({ 'categories.yml': CATEGORIES });
    const result = runCli(b1, ['archive', 'n.md', '--category', 'technik'], '', join(b1, 'inbox'), { BRAIN_ROOT: '', INIT_CWD: b2, npm_lifecycle_event: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^archive\/technik\//);
});

// 4: pushes from a linked worktree are rejected too
test('push from a linked worktree is rejected', () => {
    const root = initBrain(fresh());
    const wt = join(mkdtempSync(join(tmpdir(), 'wt-')), 'wt');
    git(root, 'worktree', 'add', '-q', wt);
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    execFileSync('git', ['init', '-q', '--bare', bare]);
    const result = spawnSync('git', ['-C', wt, 'push', bare, 'HEAD:refs/heads/wt'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /darf nicht gepusht werden/);
    assert.deepEqual(checkBrain(root).errors, []);
});

// 5: failed preconditions write nothing; qmd failure does not fail init
test('initBrain without git identity fails before writing anything', () => {
    const dir = fresh();
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.useConfigOnly', GIT_CONFIG_VALUE_0: 'true' };
    for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) {
        delete env[key];
    }
    const saved = process.env;
    process.env = env;
    try {
        assert.throws(() => initBrain(dir), /Git-Identität/);
    } finally {
        process.env = saved;
    }
    assert.equal(existsSync(dir), false);
});

test('cli init succeeds with a hint when qmd setup fails', () => {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    const dir = fresh();
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const result = runCli(makeBrain(), ['init', dir], '', tmpdir(), { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, QMD_CONFIG_DIR: config });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd-Einrichtung fehlgeschlagen/);
    assert.ok(existsSync(join(dir, 'categories.yml')));
});
