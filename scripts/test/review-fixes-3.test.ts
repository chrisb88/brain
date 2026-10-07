import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { installPushGuard } from '../src/guard.ts';
import { CATEGORIES, git, makeBrain, runCli } from './helpers.ts';

process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

const fresh = (): string => join(mkdtempSync(join(tmpdir(), 'init-')), 'brain-data');

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
    const root = fresh();
    mkdirSync(root, { recursive: true });
    git(root, 'init', '-q');
    installPushGuard(root);
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
    const wt = join(mkdtempSync(join(tmpdir(), 'wt-')), 'wt');
    git(root, 'worktree', 'add', '-q', wt);
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    execFileSync('git', ['init', '-q', '--bare', bare]);
    const result = spawnSync('git', ['-C', wt, 'push', bare, 'HEAD:refs/heads/wt'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /darf nicht gepusht werden/);
    assert.deepEqual(checkBrain(root, 'private', 'off').errors, []);
});

// qmd failure does not fail init
test('cli init succeeds with a hint when qmd setup fails', () => {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\nexit 1\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const repo = mkdtempSync(join(tmpdir(), 'project-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    writeFileSync(join(repo, 'README.md'), '# Project\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'project');
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', BRAIN_SEARCH: 'keyword', PATH: `${bin}:/usr/bin:/bin`, QMD_CONFIG_DIR: config });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd-Einrichtung fehlgeschlagen/);
    assert.ok(existsSync(join(repo, 'knowledge', 'categories.yml')));
});
