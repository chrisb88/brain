import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { getRelated, splitFrontmatter } from '../src/markdown.ts';
import { type RememberInput, remember } from '../src/remember.ts';
import { LAUF, NOW, read, runCli, validBrain } from './helpers.ts';

function input(overrides: Partial<RememberInput> = {}): RememberInput {
    return {
        category: 'gesundheit',
        title: 'Schlaf & Erholung',
        summary: 'Schlafdauer und Regeneration.',
        sources: [LAUF],
        tags: ['schlaf'],
        related: [],
        body: 'Sieben Stunden sind das Minimum.\n',
        ...overrides,
    };
}

test('remember writes a complete entry, logs it and rebuilds the index', () => {
    const root = validBrain();
    const id = remember(root, input(), NOW);
    assert.equal(id, 'wiki/gesundheit/schlaf-erholung');
    const parsed = splitFrontmatter(read(root, `${id}.md`));
    assert.equal(parsed.frontmatterError, null);
    assert.deepEqual(parsed.frontmatter, {
        title: 'Schlaf & Erholung',
        category: 'gesundheit',
        tags: ['schlaf'],
        summary: 'Schlafdauer und Regeneration.',
        sources: [`${LAUF}.md`],
        created: '2026-10-03',
        updated: '2026-10-03',
    });
    assert.equal(
        parsed.body,
        `# Schlaf & Erholung\n\nSieben Stunden sind das Minimum.\n\n## Sources\n- [[${LAUF}]]\n`,
    );
    assert.match(read(root, 'LOG.md'), /\| create \| wiki\/gesundheit\/schlaf-erholung \| aus archive\//);
    assert.match(read(root, 'INDEX.md'), /\[\[wiki\/gesundheit\/schlaf-erholung\]\] \*\*Schlaf & Erholung\*\*/);
});

test('remember --related links both sides', () => {
    const root = validBrain();
    const id = remember(root, input({ related: ['wiki/technik/garmin.md'], tags: [] }), NOW);
    assert.deepEqual(getRelated(read(root, `${id}.md`)).map((l) => l.target), ['wiki/technik/garmin']);
    assert.deepEqual(getRelated(read(root, 'wiki/technik/garmin.md')).map((l) => l.target), [id]);
    assert.equal('tags' in splitFrontmatter(read(root, `${id}.md`)).frontmatter, false);
});

const invalid: Array<[string, Partial<RememberInput>, RegExp]> = [
    ['unknown category', { category: 'urlaub' }, /Unbekannte Kategorie/],
    ['empty title', { title: '  ' }, /Titel fehlt/],
    ['empty summary', { summary: ' ' }, /Summary/],
    ['multi-line summary', { summary: 'Satz eins.\nSatz zwei.' }, /Summary/],
    ['no source', { sources: [] }, /--source/],
    ['missing source', { sources: ['archive/gesundheit/2026/10/fehlt'] }, /Quelle nicht gefunden/],
    ['source outside archive', { sources: ['categories'] }, /Quelle nicht gefunden/],
    ['source traversal', { sources: ['archive/../categories'] }, /Quelle nicht gefunden/],
    ['missing related', { related: ['wiki/technik/fehlt'] }, /nicht gefunden/],
    ['existing entry', { title: 'Laufen' }, /existiert bereits/],
];
for (const [label, overrides, error] of invalid) {
    test(`remember rejects ${label} without writing`, () => {
        const root = validBrain();
        assert.throws(() => remember(root, input(overrides), NOW), error);
        assert.equal(existsSync(join(root, 'wiki/gesundheit/schlaf-erholung.md')), false);
        assert.equal(existsSync(join(root, 'LOG.md')), false);
    });
}

test('cli remember reads the body from stdin', () => {
    const root = validBrain();
    const result = runCli(root, [
        'remember', '--category', 'technik', '--title', 'Uhr-Akku', '--summary', 'Akkulaufzeit der Uhr.',
        '--source', `${LAUF}.md`, '--tags', 'garmin, akku', '--related', 'wiki/technik/garmin',
    ], 'Akku hält 10 Tage.\n');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'wiki/technik/uhr-akku\n');
    assert.match(read(root, 'wiki/technik/uhr-akku.md'), /Akku hält 10 Tage\./);
    assert.deepEqual(splitFrontmatter(read(root, 'wiki/technik/uhr-akku.md')).frontmatter.tags, ['garmin', 'akku']);
});
