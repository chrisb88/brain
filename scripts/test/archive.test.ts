import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { archiveNote } from '../src/archive.ts';
import { CATEGORIES, makeBrain, NOW, read } from './helpers.ts';

function brainWithInbox(files: Record<string, string>): string {
    const inbox: Record<string, string> = { 'categories.yml': CATEGORIES };
    for (const [name, content] of Object.entries(files)) {
        inbox[`inbox/${name}`] = content;
    }
    return makeBrain(inbox);
}

test('archiveNote moves a CRLF note byte-identically and logs it', () => {
    const root = brainWithInbox({ 'Ingress TLS.md': 'Zeile 1\r\nZeile 2\r\n' });
    const target = archiveNote(root, join(root, 'inbox', 'Ingress TLS.md'), 'technik', NOW);
    assert.equal(target, 'archive/technik/2026/10/2026-10-03-1530-ingress-tls.md');
    assert.deepEqual(readFileSync(join(root, target)), Buffer.from('Zeile 1\r\nZeile 2\r\n'));
    assert.equal(existsSync(join(root, 'inbox', 'Ingress TLS.md')), false);
    assert.equal(read(root, 'LOG.md'), `2026-10-03 15:30 | archive | ${target} | aus inbox/Ingress TLS.md\n`);
});

const nameCases: Array<[string, string]> = [
    ['notiz.txt', 'archive/gesundheit/2026/10/2026-10-03-1530-notiz.md'],
    ['???.txt', 'archive/gesundheit/2026/10/2026-10-03-1530-note.md'],
    ['Übung.MD', 'archive/gesundheit/2026/10/2026-10-03-1530-uebung.md'],
];
for (const [name, expected] of nameCases) {
    test(`archiveNote names ${name} as ${expected}`, () => {
        const root = brainWithInbox({ [name]: 'x' });
        assert.equal(archiveNote(root, join(root, 'inbox', name), 'gesundheit', NOW), expected);
    });
}

test('archiveNote appends -2, -3 on collisions', () => {
    const root = brainWithInbox({ 'a.md': '1', 'a.txt': '2', 'A!.md': '3' });
    assert.equal(archiveNote(root, join(root, 'inbox', 'a.md'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a.md');
    assert.equal(archiveNote(root, join(root, 'inbox', 'a.txt'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a-2.md');
    assert.equal(archiveNote(root, join(root, 'inbox', 'A!.md'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a-3.md');
});

test('archiveNote accepts _uncategorized', () => {
    const root = brainWithInbox({ 'x.md': 'x' });
    assert.equal(archiveNote(root, join(root, 'inbox', 'x.md'), '_uncategorized', NOW), 'archive/_uncategorized/2026/10/2026-10-03-1530-x.md');
});

const rejected: Array<[string, string, string, RegExp]> = [
    ['unknown category', 'inbox/x.md', 'urlaub', /Unbekannte Kategorie/],
    ['file outside inbox', 'categories.yml', 'technik', /nicht direkt in inbox/],
    ['traversal', 'inbox/../categories.yml', 'technik', /nicht direkt in inbox/],
    ['subfolder of inbox', 'inbox/sub/x.md', 'technik', /nicht direkt in inbox/],
    ['missing file', 'inbox/fehlt.md', 'technik', /nicht gefunden/],
    ['unsupported format', 'inbox/scan.pdf', 'technik', /Nicht unterstütztes Format/],
];
for (const [label, file, category, error] of rejected) {
    test(`archiveNote rejects ${label} and moves nothing`, () => {
        const root = brainWithInbox({ 'x.md': 'x', 'scan.pdf': 'pdf', 'sub/x.md': 'x' });
        assert.throws(() => archiveNote(root, join(root, file), category, NOW), error);
        assert.equal(existsSync(join(root, 'archive')), false);
        assert.equal(existsSync(join(root, 'LOG.md')), false);
    });
}
