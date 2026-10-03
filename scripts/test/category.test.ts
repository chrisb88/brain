import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { addCategory, listCategories } from '../src/category.ts';
import { CATEGORIES, entry, GARMIN, makeBrain, NOW, read, runCli, validBrain } from './helpers.ts';

test('addCategory appends the category, logs it and rebuilds the index', () => {
    const root = validBrain();
    addCategory(root, 'urlaub', 'Urlaub', 'Reisen und Ausflüge.', NOW);
    assert.deepEqual(loadCategories(root).map((c) => c.slug), ['gesundheit', 'technik', 'urlaub']);
    assert.deepEqual(loadCategories(root)[2], { slug: 'urlaub', name: 'Urlaub', description: 'Reisen und Ausflüge.' });
    assert.equal(read(root, 'LOG.md'), '2026-10-03 15:30 | category | urlaub | Urlaub\n');
    assert.ok(read(root, 'INDEX.md').includes('## Urlaub (`urlaub`)\nReisen und Ausflüge.\n(noch leer)\n'));
});

test('addCategory works without categories.yml and without description', () => {
    const root = makeBrain();
    addCategory(root, 'ideen', '  Ideen & Konzepte ', '', NOW);
    assert.deepEqual(loadCategories(root), [{ slug: 'ideen', name: 'Ideen & Konzepte', description: '' }]);
});

const invalid: Array<[string, string, string, RegExp]> = [
    ['uppercase slug', 'Urlaub', 'Urlaub', /Ungültiger Slug/],
    ['slug with umlaut', 'reisen-ä', 'Reisen', /Ungültiger Slug/],
    ['reserved slug', '_uncategorized', 'Ohne', /Ungültiger Slug/],
    ['existing slug', 'technik', 'Technik 2', /existiert bereits/],
    ['empty name', 'urlaub', '  ', /Name fehlt/],
];
for (const [label, slug, name, error] of invalid) {
    test(`addCategory rejects ${label} without writing`, () => {
        const root = makeBrain({ 'categories.yml': CATEGORIES });
        assert.throws(() => addCategory(root, slug, name, '', NOW), error);
        assert.equal(read(root, 'categories.yml'), CATEGORIES);
    });
}

test('listCategories shows names, descriptions and entry counts incl. _uncategorized', () => {
    const root = validBrain({
        'wiki/_uncategorized/idee.md': entry({ title: 'Idee', category: '_uncategorized', sources: [GARMIN] }),
    });
    assert.equal(listCategories(root), [
        'gesundheit – Gesundheit (2 Einträge): Arztbefunde, Training.',
        'technik – Technik (1 Eintrag): Software und Infrastruktur.',
        '_uncategorized – Ohne Kategorie (1 Eintrag)',
    ].join('\n'));
});

test('listCategories reports an empty list', () => {
    assert.equal(listCategories(makeBrain()), 'Noch keine Kategorien angelegt.');
});

test('cli category add and list', () => {
    const root = validBrain();
    const add = runCli(root, ['category', 'add', 'urlaub', '--name', 'Urlaub', '--description', 'Reisen.']);
    assert.equal(add.status, 0, add.stderr);
    assert.match(add.stdout, /Kategorie urlaub angelegt/);
    const list = runCli(root, ['category', 'list']);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /urlaub – Urlaub \(0 Einträge\): Reisen\./);
    for (const args of [['category'], ['category', 'add', 'x'], ['category', 'remove', 'x']]) {
        assert.equal(runCli(root, args).status, 1, args.join(' '));
    }
});
