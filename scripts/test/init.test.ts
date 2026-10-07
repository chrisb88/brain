import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { loadBrainConfig } from '../src/config.ts';
import { initBrain, type InitOptions, updateBrainConfig } from '../src/init.ts';
import { emptyDir, entry, git, LAUF, read, runCli, writeFile } from './helpers.ts';

const PROJECT_FILES: Record<string, string> = {
    'README.md': '# Projekt\n',
    '.gitignore': 'node_modules/\n',
    'CLAUDE.md': '# Projektregeln\n',
    '.mcp.json': '{"mcpServers":{}}\n',
};

function project(): string {
    const repo = mkdtempSync(join(tmpdir(), 'project-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    for (const [rel, content] of Object.entries(PROJECT_FILES)) {
        writeFile(repo, rel, content);
    }
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'project');
    return repo;
}

function hooksPath(repo: string): string {
    try {
        return git(repo, 'config', '--get', 'core.hooksPath').trim();
    } catch {
        return '';
    }
}

test('initBrain creates a project brain in a subfolder without touching the project or committing', () => {
    const repo = project();
    const result = initBrain({ cwd: repo, path: 'knowledge', private: false });
    assert.deepEqual(result, { configRoot: repo, brainDir: join(repo, 'knowledge'), mode: 'project', createdRepo: false });
    assert.deepEqual(loadBrainConfig(repo), { configRoot: repo, brainDir: join(repo, 'knowledge'), path: 'knowledge', mode: 'project' });
    for (const rel of ['.gitignore', '.gitattributes', 'CLAUDE.md', 'categories.yml', 'inbox/.gitkeep', 'INDEX.md', 'graph.json']) {
        assert.ok(existsSync(join(repo, 'knowledge', rel)), rel);
    }
    for (const [rel, content] of Object.entries(PROJECT_FILES)) {
        assert.equal(read(repo, rel), content, rel);
    }
    assert.deepEqual(loadCategories(join(repo, 'knowledge')), []);
    assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '1');
    assert.equal(hooksPath(repo), '');
    assert.deepEqual(checkBrain(join(repo, 'knowledge'), 'project', 'off').errors, []);
});

test('initBrain accepts folder names with spaces and umlauts', () => {
    const repo = project();
    const result = initBrain({ cwd: join(repo), path: 'docs/Mein Wissen', private: false });
    assert.equal(result.brainDir, join(repo, 'docs', 'Mein Wissen'));
    assert.equal(loadBrainConfig(repo).path, 'docs/Mein Wissen');
});

test('initBrain asks for the path when none is given', () => {
    const repo = project();
    const result = initBrain({ cwd: repo, private: false, askPath: () => 'kb' });
    assert.equal(result.brainDir, join(repo, 'kb'));
});

test('initBrain --private creates the repository with push guard', () => {
    const dir = emptyDir();
    const result = initBrain({ cwd: dir, path: '.', private: true });
    assert.deepEqual(result, { configRoot: dir, brainDir: dir, mode: 'private', createdRepo: true });
    assert.notEqual(hooksPath(dir), '');
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

const refusals: Array<[string, () => InitOptions, RegExp]> = [
    ['outside a git repository', () => ({ cwd: emptyDir(), path: 'knowledge', private: false }), /muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private/],
    ['an existing brain.yml', () => {
        const repo = project();
        writeFile(repo, 'brain.yml', 'path: .\nmode: project\n');
        return { cwd: repo, path: 'knowledge', private: false };
    }, /Hier gibt es bereits einen Wissens-Ordner/],
    ['a path outside the repository', () => ({ cwd: project(), path: '../elsewhere', private: false }), /liegt außerhalb des Repositorys/],
    ['"." in a project with .gitignore and CLAUDE.md', () => ({ cwd: project(), path: '.', private: false }), /\.gitignore existiert bereits/],
    ['a path that is an existing file', () => ({ cwd: project(), path: 'README.md', private: false }), /^Error: README\.md ist kein Ordner – anderen Wissens-Ordner wählen$/],
    ['a path below an existing file', () => ({ cwd: project(), path: 'README.md/kb', private: false }), /^Error: README\.md\/kb ist kein Ordner – anderen Wissens-Ordner wählen$/],
    ['a missing path without prompt', () => ({ cwd: project(), private: false }), /Pfad angeben: brain init \[--private\] <pfad>/],
    ['--private with a remote', () => {
        const repo = project();
        git(repo, 'remote', 'add', 'origin', 'https://example.com/x.git');
        return { cwd: repo, path: 'knowledge', private: true };
    }, /Privater Wissens-Ordner nur in einem Repository ohne Remote/],
];
for (const [label, options, error] of refusals) {
    test(`initBrain refuses ${label} without writing anything`, () => {
        const opts = options();
        const before = existsSync(join(opts.cwd, 'brain.yml')) ? read(opts.cwd, 'brain.yml') : null;
        assert.throws(() => initBrain(opts), error);
        assert.equal(existsSync(join(opts.cwd, 'brain.yml')) ? read(opts.cwd, 'brain.yml') : null, before);
        assert.equal(existsSync(join(opts.cwd, 'knowledge')), false);
    });
}

test('updateBrainConfig only touches template files, never data', () => {
    const repo = project();
    const { brainDir } = initBrain({ cwd: repo, path: 'knowledge', private: false });
    writeFile(brainDir, `${LAUF}.md`, 'Original\r\n');
    writeFile(brainDir, 'wiki/gesundheit/laufen.md', entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF] }));
    writeFile(brainDir, 'CLAUDE.md', 'veraltet');
    const data = ['categories.yml', `${LAUF}.md`, 'wiki/gesundheit/laufen.md'].map((rel) => [rel, readFileSync(join(brainDir, rel))] as const);
    assert.deepEqual(updateBrainConfig(brainDir, 'project'), ['CLAUDE.md']);
    for (const [rel, bytes] of data) {
        assert.deepEqual(readFileSync(join(brainDir, rel)), bytes, rel);
    }
    assert.equal(hooksPath(repo), '');
});

test('updateBrainConfig reinstalls a removed push guard in private mode', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    git(dir, 'config', '--unset', 'core.hooksPath');
    updateBrainConfig(dir, 'private');
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

function stubClaude(): { bin: string; log: string } {
    const bin = mkdtempSync(join(tmpdir(), 'claude-bin-'));
    const log = join(bin, 'calls.log');
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "$(pwd)|$*" >> "$CLAUDE_STUB_LOG"\n');
    chmodSync(join(bin, 'claude'), 0o755);
    return { bin, log };
}

test('cli init activates the plugin in project scope', () => {
    const repo = project();
    const { bin, log } = stubClaude();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wissens-Ordner angelegt: .*knowledge \(mode: project\)/);
    assert.match(result.stdout, /BRAIN_SEARCH=off – qmd wird nicht eingerichtet\./);
    assert.match(result.stdout, /Plugin brain@brain für dieses Projekt aktiviert\./);
    assert.match(result.stdout, /Änderungen prüfen und committen/);
    assert.equal(readFileSync(log, 'utf8'), `${repo}|plugin install brain@brain --scope project\n`);
});

test('cli init without claude and qmd prints hints', () => {
    const repo = project();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: '/usr/bin:/bin', BRAIN_SEARCH: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd nicht gefunden/);
    assert.match(result.stdout, /claude plugin install brain@brain --scope project/);
});

test('cli init without a path and without a terminal fails', () => {
    const repo = project();
    const result = runCli(repo, ['init'], '', repo, { BRAIN_ROOT: '', PATH: '/usr/bin:/bin' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pfad angeben/);
});

test('cli init --update runs inside an existing knowledge folder', () => {
    const repo = project();
    const { brainDir } = initBrain({ cwd: repo, path: 'knowledge', private: false });
    writeFile(brainDir, 'CLAUDE.md', 'veraltet');
    const result = runCli(repo, ['init', '--update'], '', repo, { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CLAUDE\.md/);
});
