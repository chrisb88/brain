import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isKnownCategory, loadCategories, saveCategories, UNCATEGORIZED } from '../src/categories.ts';
import { CATEGORIES, makeBrain } from './helpers.ts';

test('loadCategories returns an empty list without file or for "categories: []"', () => {
    assert.deepEqual(loadCategories(makeBrain()), []);
    assert.deepEqual(loadCategories(makeBrain({ 'categories.yml': 'categories: []\n' })), []);
});

test('loadCategories reads slug, name and description', () => {
    const categories = loadCategories(makeBrain({ 'categories.yml': CATEGORIES }));
    assert.deepEqual(categories[0], { slug: 'gesundheit', name: 'Gesundheit', description: 'Arztbefunde, Training.' });
    assert.equal(categories.length, 2);
});

const invalidFiles: Array<[string, RegExp]> = [
    ['categories: {}\n', /Liste/],
    ['categories:\n  - slug: Gross\n    name: X\n', /slug/],
    ['categories:\n  - slug: _intern\n    name: X\n', /slug/],
    ['categories:\n  - slug: a\n    name: A\n  - slug: a\n    name: B\n', /doppelt/],
    ['categories:\n  - slug: a\n', /name/],
];
for (const [yml, error] of invalidFiles) {
    test(`loadCategories rejects ${JSON.stringify(yml)}`, () => {
        assert.throws(() => loadCategories(makeBrain({ 'categories.yml': yml })), error);
    });
}

test('isKnownCategory accepts registered slugs and _uncategorized only', () => {
    const categories = loadCategories(makeBrain({ 'categories.yml': CATEGORIES }));
    assert.equal(isKnownCategory(categories, 'technik'), true);
    assert.equal(isKnownCategory(categories, UNCATEGORIZED), true);
    assert.equal(isKnownCategory(categories, 'urlaub'), false);
});

test('saveCategories round-trips', () => {
    const root = makeBrain();
    const categories = [{ slug: 'urlaub', name: 'Urlaub', description: 'Reisen.' }];
    saveCategories(root, categories);
    assert.deepEqual(loadCategories(root), categories);
});
