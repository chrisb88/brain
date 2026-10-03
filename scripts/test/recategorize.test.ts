import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { splitFrontmatter } from '../src/markdown.ts';
import { mergeCategory, moveEntry, renameCategory } from '../src/recategorize.ts';
import { entry, GARMIN, initGit, LAUF, NOW, read, runCli, validBrain } from './helpers.ts';

const exists = (root: string, rel: string): boolean => existsSync(join(root, rel));

test('renameCategory moves files, rewrites links, sources, category and categories.yml', () => {
    const root = validBrain();
    initGit(root);
    renameCategory(root, 'gesundheit', 'koerper', NOW);
    assert.equal(exists(root, 'wiki/gesundheit'), false);
    assert.equal(exists(root, 'archive/gesundheit'), false);
    assert.equal(read(root, 'archive/koerper/2026/10/2026-10-02-1530-lauf.md'), 'Laufnotiz\r\nzweite Zeile\r\n');
    const laufen = read(root, 'wiki/koerper/laufen.md');
    assert.deepEqual(splitFrontmatter(laufen).frontmatter.sources, ['archive/koerper/2026/10/2026-10-02-1530-lauf.md']);
    assert.equal(splitFrontmatter(laufen).frontmatter.category, 'koerper');
    assert.ok(laufen.includes('- [[wiki/koerper/ernaehrung]]'));
    assert.ok(laufen.includes('- [[archive/koerper/2026/10/2026-10-02-1530-lauf]]'));
    assert.ok(laufen.includes('[[wiki/technik/garmin]]'));
    assert.deepEqual(loadCategories(root).map((c) => [c.slug, c.name]), [['koerper', 'Gesundheit'], ['technik', 'Technik']]);
    assert.deepEqual(checkBrain(root).errors, []);
    assert.match(read(root, 'LOG.md'), /\| recategorize \| gesundheit → koerper \| Kategorie umbenannt/);
    assert.match(read(root, 'INDEX.md'), /\[\[wiki\/koerper\/laufen\]\]/);
});

test('mergeCategory moves everything into the target and removes the source category', () => {
    const root = validBrain();
    initGit(root);
    mergeCategory(root, 'gesundheit', 'technik', NOW);
    assert.ok(exists(root, 'wiki/technik/laufen.md'));
    assert.ok(exists(root, 'archive/technik/2026/10/2026-10-02-1530-lauf.md'));
    assert.deepEqual(loadCategories(root).map((c) => c.slug), ['technik']);
    assert.equal(splitFrontmatter(read(root, 'wiki/technik/ernaehrung.md')).frontmatter.category, 'technik');
    assert.deepEqual(checkBrain(root).errors, []);
});

test('moveEntry moves the entry and its exclusive sources, updates links elsewhere', () => {
    const root = validBrain();
    initGit(root);
    moveEntry(root, 'wiki/technik/garmin', 'gesundheit', NOW);
    assert.ok(exists(root, 'wiki/gesundheit/garmin.md'));
    assert.ok(exists(root, 'archive/gesundheit/2026/10/2026-10-02-1600-garmin.md'));
    assert.equal(exists(root, 'archive/technik'), false);
    assert.ok(read(root, 'wiki/gesundheit/laufen.md').includes('[[wiki/gesundheit/garmin]]'));
    assert.deepEqual(checkBrain(root).errors, []);
});

test('moveEntry keeps shared sources in place and works out of _uncategorized without git', () => {
    const root = validBrain({
        'wiki/_uncategorized/idee.md': entry({ title: 'Idee', category: '_uncategorized', sources: [GARMIN] }),
    });
    moveEntry(root, 'wiki/_uncategorized/idee', 'gesundheit', NOW);
    assert.ok(exists(root, 'wiki/gesundheit/idee.md'));
    assert.ok(exists(root, `${GARMIN}.md`));
    moveEntry(root, 'wiki/gesundheit/laufen', 'technik', NOW);
    assert.ok(exists(root, `${LAUF}.md`));
    assert.deepEqual(checkBrain(root).errors, []);
});

const invalid: Array<[string, (root: string) => void, RegExp]> = [
    ['rename unknown', (root) => renameCategory(root, 'urlaub', 'reisen', NOW), /Unbekannte Kategorie/],
    ['rename to existing', (root) => renameCategory(root, 'gesundheit', 'technik', NOW), /existiert bereits/],
    ['rename to invalid slug', (root) => renameCategory(root, 'gesundheit', 'Körper', NOW), /Ungültiger Slug/],
    ['rename _uncategorized', (root) => renameCategory(root, '_uncategorized', 'x', NOW), /Unbekannte Kategorie/],
    ['merge into itself', (root) => mergeCategory(root, 'technik', 'technik', NOW), /verschieden/],
    ['merge into unknown', (root) => mergeCategory(root, 'technik', 'urlaub', NOW), /Unbekannte Kategorie/],
    ['move to same category', (root) => moveEntry(root, 'wiki/technik/garmin', 'technik', NOW), /bereits in/],
    ['move unknown entry', (root) => moveEntry(root, 'wiki/technik/fehlt', 'gesundheit', NOW), /nicht gefunden/],
    ['move to unknown category', (root) => moveEntry(root, 'wiki/technik/garmin', 'urlaub', NOW), /Unbekannte Kategorie/],
];
for (const [label, action, error] of invalid) {
    test(`recategorize rejects ${label}`, () => {
        assert.throws(() => action(validBrain()), error);
    });
}

test('moveEntry refuses to overwrite an existing entry', () => {
    const root = validBrain({
        'wiki/technik/laufen.md': entry({ title: 'Laufen', category: 'technik', sources: [GARMIN] }),
    });
    assert.throws(() => moveEntry(root, 'wiki/gesundheit/laufen', 'technik', NOW), /Ziel existiert bereits/);
    assert.ok(exists(root, 'wiki/gesundheit/laufen.md'));
});

test('cli recategorize', () => {
    const root = validBrain();
    initGit(root);
    const result = runCli(root, ['recategorize', '--rename', 'technik', 'software']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(exists(root, 'wiki/software/garmin.md'));
    assert.equal(runCli(root, ['recategorize', '--rename', '--move', 'a', 'b']).status, 1);
});
