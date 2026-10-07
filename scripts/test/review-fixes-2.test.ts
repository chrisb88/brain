import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories, saveCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { toEntryId } from '../src/link.ts';
import { headings, replaceLinkTargets } from '../src/markdown.ts';
import { existsExactCase } from '../src/paths.ts';
import { renameCategory } from '../src/recategorize.ts';
import { remember } from '../src/remember.ts';
import { caseInsensitiveParent, entry, GARMIN, git, initGit, LAUF, makeBrain, NOW, read, validBrain } from './helpers.ts';

// 1. Headings with a trailing "#" that is part of the text
test('headings keep a trailing # without preceding space (C#, F#)', () => {
    assert.deepEqual(headings('## C#\n## F# ##\n## Teil 2 #\n## B ##\n').map((h) => h.title), ['C#', 'F#', 'Teil 2', 'B']);
});

test('check accepts a link to a "## C#" section', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '## C#\nText' }),
        'wiki/gesundheit/laufen.md': entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF], body: '[[wiki/technik/garmin#C#]]', related: ['wiki/gesundheit/ernaehrung'] }),
    });
    assert.deepEqual(checkBrain(root).errors, []);
});

// 2. Archive integrity independent of status.renames
test('check detects identical git mv even with status.renames=false', () => {
    const root = validBrain();
    initGit(root);
    git(root, 'config', 'status.renames', 'false');
    mkdirSync(join(root, 'archive/technik/2026/11'), { recursive: true });
    git(root, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
    assert.deepEqual(checkBrain(root).errors.filter((e) => e.startsWith('archive: ')), []);
});

// 3. Exact case on case-insensitive drives
test('existsExactCase requires the exact spelling of every segment', () => {
    const root = validBrain();
    assert.equal(existsExactCase(root, 'wiki/technik/garmin.md'), true);
    assert.equal(existsExactCase(root, 'wiki/Technik/garmin.md'), false);
    assert.equal(existsExactCase(root, 'wiki/technik/fehlt.md'), false);
});

const ci = caseInsensitiveParent();
test('check rejects wrong-case links and sources on case-insensitive drives', { skip: ci === null }, () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: ['archive/Technik/2026/10/2026-10-02-1600-garmin'], body: '[[wiki/Gesundheit/Laufen]]' }),
    }, ci ?? undefined);
    const errors = checkBrain(root).errors.join('\n');
    assert.match(errors, /Link-Ziel fehlt: \[\[wiki\/Gesundheit\/Laufen\]\]/);
    assert.match(errors, /Quelle nicht gefunden: archive\/Technik/);
});

test('link and remember reject wrong-case ids on case-insensitive drives', { skip: ci === null }, () => {
    const root = validBrain({}, ci ?? undefined);
    assert.throws(() => toEntryId(root, 'wiki/Technik/Garmin'), /nicht gefunden/);
    assert.throws(() => remember(root, {
        category: 'technik', title: 'Neu', summary: 'Neu.', sources: ['archive/Technik/2026/10/2026-10-02-1600-garmin'], tags: [], related: [], body: '',
    }, NOW), /Quelle nicht gefunden/);
});

// 5. Aborted move prints exact recovery commands
test('recategorize reports reverse commands when a move fails midway', () => {
    const root = validBrain();
    initGit(root);
    writeFileSync(join(root, 'archive', 'koerper'), 'blockiert');
    let message = '';
    try {
        renameCategory(root, 'gesundheit', 'koerper', NOW);
    } catch (error) {
        message = (error as Error).message;
    }
    assert.match(message, /Verschieben abgebrochen/);
    assert.match(message, /git mv wiki\/koerper\/ernaehrung\.md wiki\/gesundheit\/ernaehrung\.md/);
    assert.equal(read(root, 'categories.yml'), readFileSync(join(root, 'categories.yml'), 'utf8'));
    assert.deepEqual(loadCategories(root).map((c) => c.slug), ['gesundheit', 'technik']);
    for (const line of message.split('\n').filter((l) => l.trim().startsWith('git mv '))) {
        const [, , from, to] = line.trim().split(' ');
        git(root, 'mv', from, to);
    }
    assert.equal(git(root, 'status', '--porcelain', '--', 'wiki', 'archive/gesundheit'), '');
});

// 7. Inline code untouched by link rewriting
test('replaceLinkTargets leaves links in inline code alone', () => {
    const map = new Map([['wiki/a/b', 'wiki/c/b']]);
    assert.equal(
        replaceLinkTargets('`[[wiki/a/b]]` und ``x [[wiki/a/b]]`` und [[wiki/a/b]]', map),
        '`[[wiki/a/b]]` und ``x [[wiki/a/b]]`` und [[wiki/c/b]]',
    );
});

// categories.yml header
test('saveCategories writes a fixed "do not edit by hand" header that survives rewrites', () => {
    const root = makeBrain();
    saveCategories(root, []);
    saveCategories(root, [{ slug: 'urlaub', name: 'Urlaub', description: 'Reisen.' }]);
    const text = read(root, 'categories.yml');
    assert.ok(text.startsWith('# Erlaubte Kategorien dieses Wissens-Ordners – nicht von Hand bearbeiten.\n'));
    assert.match(text, /brain category add/);
    assert.equal(text.match(/nicht von Hand bearbeiten/g)?.length, 1);
    assert.deepEqual(loadCategories(root), [{ slug: 'urlaub', name: 'Urlaub', description: 'Reisen.' }]);
});
