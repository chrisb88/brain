import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { initBrain, updateBrainConfig } from '../src/init.ts';
import { entry, git, LAUF, makeBrain, read, runCli, writeFile } from './helpers.ts';

process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

function target(): string {
    return join(mkdtempSync(join(tmpdir(), 'init-')), 'brain-data');
}

test('initBrain creates a guarded, committed, valid brain from the template', () => {
    const root = initBrain(target());
    for (const rel of ['CLAUDE.md', 'wiki/CLAUDE.md', '.claude/commands/ingest.md', '.claude/commands/ask.md', '.mcp.json', '.gitignore', '.gitattributes', 'categories.yml', 'inbox/.gitkeep', 'INDEX.md', 'graph.json']) {
        assert.ok(existsSync(join(root, rel)), rel);
    }
    assert.ok(existsSync(join(root, 'archive')));
    assert.deepEqual(loadCategories(root), []);
    assert.match(read(root, 'categories.yml'), /nicht von Hand bearbeiten/);
    assert.equal(git(root, 'status', '--porcelain'), '');
    assert.match(git(root, 'log', '--oneline'), /init: second brain data repository/);
    assert.equal(git(root, 'remote').trim(), '');
    assert.deepEqual(checkBrain(root).errors, []);
});

test('initBrain refuses an existing brain', () => {
    const root = initBrain(target());
    assert.throws(() => initBrain(root), /existiert bereits ein Brain/);
});

test('updateBrainConfig only touches config files, never data', () => {
    const root = initBrain(target());
    writeFile(root, `${LAUF}.md`, 'Original\r\n');
    writeFile(root, 'categories.yml', read(root, 'categories.yml').replace('categories: []', 'categories:\n  - slug: gesundheit\n    name: Gesundheit\n    description: x'));
    writeFile(root, 'wiki/gesundheit/laufen.md', entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF] }));
    writeFile(root, 'inbox/neu.md', 'Notiz');
    writeFile(root, 'CLAUDE.md', 'veraltet');
    const data = ['categories.yml', `${LAUF}.md`, 'wiki/gesundheit/laufen.md', 'inbox/neu.md'].map((rel) => [rel, readFileSync(join(root, rel))] as const);
    const changed = updateBrainConfig(root);
    assert.deepEqual(changed, ['CLAUDE.md']);
    for (const [rel, bytes] of data) {
        assert.deepEqual(readFileSync(join(root, rel)), bytes, rel);
    }
    assert.notEqual(read(root, 'CLAUDE.md'), 'veraltet');
});

test('updateBrainConfig reinstalls a removed push guard', () => {
    const root = initBrain(target());
    writeFileSync(join(root, '.git', 'hooks', 'pre-push'), '#!/bin/sh\nexit 0\n');
    updateBrainConfig(root);
    assert.deepEqual(checkBrain(root).errors, []);
});

test('cli init works without qmd and prints a hint', () => {
    const dir = target();
    const result = runCli(makeBrain(), ['init', dir], '', tmpdir(), { BRAIN_ROOT: '', PATH: '/usr/bin:/bin' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd nicht gefunden/);
    assert.ok(existsSync(join(dir, 'categories.yml')));
});

test('cli init --update runs inside an existing brain', () => {
    const root = initBrain(target());
    writeFile(root, '.mcp.json', '{}');
    const result = runCli(root, ['init', '--update'], '', root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.mcp\.json/);
});
