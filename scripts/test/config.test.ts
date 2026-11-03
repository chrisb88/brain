import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBrainConfig, formatBrainConfig, loadBrainConfig, rewriteBrainConfig } from '../src/config.ts';
import { CATEGORIES, emptyDir, makeBrain, projectWithBrain, read, runCli, writeFile } from './helpers.ts';

test('loadBrainConfig reads path and mode', () => {
    const { repo, brain } = projectWithBrain();
    assert.deepEqual(loadBrainConfig(repo), { configRoot: repo, brainDir: brain, path: 'knowledge', mode: 'project', pushGuard: false });
});

test('loadBrainConfig accepts "." and round-trips formatBrainConfig', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', formatBrainConfig('docs/Mein Wissen', 'private'));
    assert.deepEqual(loadBrainConfig(dir), { configRoot: dir, brainDir: join(dir, 'docs', 'Mein Wissen'), path: 'docs/Mein Wissen', mode: 'private', pushGuard: true });
    writeFile(dir, 'brain.yml', formatBrainConfig('.', 'project'));
    assert.equal(loadBrainConfig(dir).brainDir, dir);
});

const invalid: Array<[string, string, RegExp]> = [
    ['path outside', 'path: ../elsewhere\nmode: project\n', /liegt außerhalb/],
    ['absolute path outside', 'path: /tmp\nmode: project\n', /liegt außerhalb/],
    ['unknown mode', 'path: .\nmode: public\n', /mode muss project oder private sein/],
    ['unknown key', 'path: .\nmode: project\nlanguage: de\n', /unbekannter Schlüssel „language“/],
    ['missing path', 'mode: project\n', /path fehlt/],
    ['not a mapping', '- a\n', /path und mode fehlen/],
    ['push_guard in project mode', 'path: .\nmode: project\npush_guard: true\n', /push_guard nur bei mode: private/],
    ['push_guard not boolean (no)', 'path: .\nmode: private\npush_guard: no\n', /push_guard muss true oder false sein/],
    ['push_guard not boolean (string)', 'path: .\nmode: private\npush_guard: "false"\n', /push_guard muss true oder false sein/],
    ['push_guard not boolean (0)', 'path: .\nmode: private\npush_guard: 0\n', /push_guard muss true oder false sein/],
];
for (const [label, content, error] of invalid) {
    test(`loadBrainConfig rejects: ${label}`, () => {
        const dir = emptyDir();
        writeFile(dir, 'brain.yml', content);
        assert.throws(() => loadBrainConfig(dir), error);
    });
}

test('formatBrainConfig writes the update hint and push_guard only in private mode', () => {
    const header = '# Brain configuration. Created by brain init.\n# After changing this file run: brain init --update\n'
        + '# brain init --update rewrites this file - your own comments will be lost.\n';
    assert.equal(formatBrainConfig('.', 'private', false), `${header}path: .\nmode: private\npush_guard: false\n`);
    assert.equal(formatBrainConfig('knowledge', 'project'), `${header}path: knowledge\nmode: project\n`);
});

test('loadBrainConfig defaults push_guard to true in private mode and reads false', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\n');
    assert.equal(loadBrainConfig(dir).pushGuard, true);
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\npush_guard: false\n');
    assert.equal(loadBrainConfig(dir).pushGuard, false);
    writeFile(dir, 'brain.yml', 'path: .\nmode: project\n');
    assert.equal(loadBrainConfig(dir).pushGuard, false);
});

test('rewriteBrainConfig writes the current format once', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\n');
    assert.equal(rewriteBrainConfig(loadBrainConfig(dir)), true);
    assert.equal(read(dir, 'brain.yml'), formatBrainConfig('.', 'private', true));
    assert.equal(rewriteBrainConfig(loadBrainConfig(dir)), false);
});

test('findBrainConfig walks up from a project subdirectory and from the knowledge folder', () => {
    const { repo, brain } = projectWithBrain();
    mkdirSync(join(repo, 'src', 'app'), { recursive: true });
    assert.equal(findBrainConfig([join(repo, 'src', 'app')], undefined)?.brainDir, brain);
    assert.equal(findBrainConfig([join(brain, 'wiki', 'technik')], undefined)?.brainDir, brain);
});

test('findBrainConfig prefers BRAIN_ROOT and tries further starts', () => {
    const { repo, brain } = projectWithBrain();
    const other = makeBrain();
    assert.equal(findBrainConfig([other], repo)?.brainDir, brain);
    assert.equal(findBrainConfig([emptyDir(), other], undefined)?.brainDir, other);
    assert.equal(findBrainConfig([emptyDir()], undefined), null);
});

test('findBrainConfig fails when BRAIN_ROOT has no brain.yml', () => {
    assert.throws(() => findBrainConfig([], emptyDir()), /enthält keine brain\.yml/);
});

test('cli finds a project knowledge folder from a project subdirectory without BRAIN_ROOT', () => {
    const { repo, brain } = projectWithBrain();
    mkdirSync(join(repo, 'src', 'app'), { recursive: true });
    const result = runCli(brain, ['category', 'list'], '', join(repo, 'src', 'app'), { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gesundheit – Gesundheit/);
});

test('cli without a knowledge folder fails clearly, help still works', () => {
    const empty = emptyDir();
    const fail = runCli(empty, ['check'], '', empty, { BRAIN_ROOT: '' });
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /Kein Wissens-Ordner gefunden – im Repository ausführen oder BRAIN_ROOT setzen\./);
    assert.equal(runCli(empty, ['help'], '', empty, { BRAIN_ROOT: '' }).status, 0);
});

test('makeBrain brains work with BRAIN_ROOT', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    assert.equal(runCli(root, ['category', 'list']).status, 0);
});
