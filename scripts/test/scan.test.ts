import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBrain, relatedIds, sourceIds } from '../src/scan.ts';
import { GARMIN, LAUF, validBrain } from './helpers.ts';

test('loadBrain reads entries, sources and folders, ignoring wiki/CLAUDE.md', () => {
    const brain = loadBrain(validBrain());
    assert.deepEqual(brain.entries.map((e) => e.id), [
        'wiki/gesundheit/ernaehrung',
        'wiki/gesundheit/laufen',
        'wiki/technik/garmin',
    ]);
    assert.deepEqual(brain.sources.map((s) => [s.id, s.category]), [
        [LAUF, 'gesundheit'],
        [GARMIN, 'technik'],
    ]);
    assert.deepEqual(brain.folders, { wiki: ['gesundheit', 'technik'], archive: ['gesundheit', 'technik'] });
    assert.deepEqual(brain.strayFiles, []);
    const laufen = brain.entries[1];
    assert.equal(laufen.title, 'Laufen');
    assert.equal(laufen.category, 'gesundheit');
    assert.equal(laufen.summary, 'Trainingspläne für 10-km-Läufe.');
    assert.equal(laufen.path, 'wiki/gesundheit/laufen.md');
});

test('loadBrain falls back to the file name as title and lists stray files', () => {
    const brain = loadBrain(validBrain({
        'wiki/technik/ohne-titel.md': '# Kein Frontmatter\n',
        'wiki/lose.md': 'x',
        'wiki/technik/tief/x.md': 'x',
        'archive/lose.md': 'x',
    }));
    assert.equal(brain.entries.find((e) => e.id === 'wiki/technik/ohne-titel')?.title, 'ohne-titel');
    assert.deepEqual(brain.strayFiles, ['archive/lose.md', 'wiki/lose.md', 'wiki/technik/tief/x.md']);
});

test('loadBrain works without wiki/ and archive/', () => {
    const brain = loadBrain(validBrain().concat('/does-not-exist'));
    assert.deepEqual(brain.entries, []);
    assert.deepEqual(brain.sources, []);
});

test('sourceIds and relatedIds are normalized', () => {
    const laufen = loadBrain(validBrain()).entries[1];
    assert.deepEqual(sourceIds(laufen), [LAUF]);
    assert.deepEqual(relatedIds(laufen), ['wiki/gesundheit/ernaehrung']);
});
