import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { CATEGORIES, makeBrain, read, runCli } from './helpers.ts';

test('cli archive prints the archive path', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    const result = runCli(root, ['archive', 'inbox/n.md', '--category', 'technik']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^archive\/technik\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-\d{4}-n\.md\n$/);
});

test('cli resolves relative paths against the caller directory (INIT_CWD)', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    const result = runCli(root, ['archive', 'n.md', '--category', 'technik'], '', join(root, 'inbox'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^archive\/technik\/.*-n\.md\n$/);
});

test('cli log appends a line and rejects unknown operations', () => {
    const root = makeBrain();
    assert.equal(runCli(root, ['log', 'update', 'wiki/a/b', 'Text', 'mit', 'Leerzeichen']).status, 0);
    assert.match(read(root, 'LOG.md'), / \| update \| wiki\/a\/b \| Text mit Leerzeichen\n$/);
    const bad = runCli(root, ['log', 'delete', 'x']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Unbekannte Operation/);
});

test('cli reports usage errors with exit code 1', () => {
    const root = makeBrain();
    for (const args of [['unbekannt'], ['archive'], ['archive', 'inbox/x.md', '--falsch']]) {
        const result = runCli(root, args);
        assert.equal(result.status, 1, args.join(' '));
        assert.match(result.stderr, /^Fehler: /);
    }
    assert.match(runCli(root, ['unbekannt']).stderr, /brain help/);
});

const helpCommands = ['setup', 'archive', 'remember', 'link', 'category add', 'category list', 'recategorize', 'qmd setup', 'qmd prune', 'index', 'check', 'log', 'help', 'init', 'session-start'];
for (const args of [[], ['help'], ['--help'], ['-h']]) {
    test(`cli ${args.join(' ') || '(no arguments)'} prints the English help`, () => {
        const result = runCli(makeBrain(), args);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^Usage: brain <command> \[options\]/m);
        for (const command of helpCommands) {
            assert.match(result.stdout, new RegExp(`^  ${command}\\b`, 'm'), command);
        }
        assert.match(result.stdout, /^Examples:/m);
        assert.match(result.stdout, /BRAIN_SEARCH/);
        assert.match(result.stdout, /^  --version\b/m);
    });
}
