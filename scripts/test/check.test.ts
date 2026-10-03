import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { entry, GARMIN, git, initGit, LAUF, runCli, validBrain, writeFile } from './helpers.ts';

function conflict(id: string, affects: string[]): string {
    return `> [!warning] Conflict ${id}\n> Affects: ${affects.map((a) => `[[${a}]]`).join(', ')}\n> Text`;
}

test('a valid brain has no errors (wiki/CLAUDE.md and code links ignored)', () => {
    const root = validBrain({
        'wiki/technik/code.md': entry({ title: 'Code', category: 'technik', sources: [GARMIN], body: '`[[wiki/x/y]]`\n```\n[[wiki/x/z]]\n```' }),
    });
    assert.deepEqual(checkBrain(root).errors, []);
});

const broken: Array<[string, Record<string, string>, RegExp]> = [
    ['broken link', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '[[wiki/technik/fehlt]]' }) }, /Link-Ziel fehlt: \[\[wiki\/technik\/fehlt\]\]/],
    ['missing heading', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '[[wiki/gesundheit/laufen#Gibtsnicht]]' }) }, /Abschnitt fehlt/],
    ['missing frontmatter', { 'wiki/technik/garmin.md': '# Garmin\n' }, /Frontmatter fehlt/],
    ['missing title', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN] }).replace('title: Garmin\n', '') }, /title fehlt/],
    ['category mismatch', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'gesundheit', sources: [GARMIN] }) }, /passt nicht zum Ordner/],
    ['empty summary', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', summary: '""', sources: [GARMIN] }) }, /summary/],
    ['invalid date', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN] }).replace('updated: 2026-10-01', 'updated: gestern') }, /updated/],
    ['no sources', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [] }) }, /sources fehlt/],
    ['missing source file', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: ['archive/technik/2026/10/fehlt'] }) }, /Quelle nicht gefunden/],
    ['unregistered folder', { 'wiki/urlaub/norwegen.md': entry({ title: 'Norwegen', category: 'urlaub', sources: [GARMIN] }) }, /wiki\/urlaub: Ordner ist keine registrierte Kategorie/],
    ['stray file', { 'wiki/lose.md': '# lose\n' }, /wiki\/lose\.md: Datei liegt nicht/],
    ['asymmetric related', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], related: ['wiki/gesundheit/laufen'] }) }, /Related nicht symmetrisch/],
    ['related with anchor', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '## Laufen\n', related: ['wiki/technik/garmin#Laufen'] }) }, /keine Abschnitts-Anker/],
    ['malformed callout', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '> [!warning] Conflict\n> Affects: [[wiki/technik/garmin]]' }) }, /ungültiger Callout/],
    ['open point missing in affected entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/technik/garmin', 'wiki/gesundheit/laufen']) }) }, /C-20261003-1: fehlt in wiki\/gesundheit\/laufen/],
    ['open point in unlisted entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']) }), 'wiki/gesundheit/laufen.md': entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']), related: ['wiki/gesundheit/ernaehrung'] }) }, /C-20261003-1: steht in wiki\/technik\/garmin/],
    ['differing affects lists', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/technik/garmin', 'wiki/gesundheit/laufen']) }), 'wiki/gesundheit/laufen.md': entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']), related: ['wiki/gesundheit/ernaehrung'] }) }, /C-20261003-1: Affects-Listen bzw\. Typ weichen ab/],
    ['duplicate id in one entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: `${conflict('C-20261003-1', ['wiki/technik/garmin'])}\n\n${conflict('C-20261003-1', ['wiki/technik/garmin'])}` }) }, /ID C-20261003-1 doppelt vergeben/],
    ['invalid categories.yml', { 'categories.yml': 'categories: {}\n' }, /Liste/],
];
for (const [label, files, error] of broken) {
    test(`check reports ${label}`, () => {
        const report = checkBrain(validBrain(files));
        assert.match(report.errors.join('\n'), error);
    });
}

test('check hints list open points, uncategorized entries and the missing git repo', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '> [!question] Unclear Q-20261003-1\n> Affects: [[wiki/technik/garmin]]\n> Welche Uhr?' }),
        'wiki/_uncategorized/idee.md': entry({ title: 'Idee', category: '_uncategorized', sources: [GARMIN] }),
    });
    const report = checkBrain(root);
    assert.deepEqual(report.errors, []);
    const hints = report.hints.join('\n');
    assert.match(hints, /Offen: Q-20261003-1 \(Unklarheit\) – betrifft wiki\/technik\/garmin/);
    assert.match(hints, /Ohne Kategorie: wiki\/_uncategorized\/idee – bitte kategorisieren/);
    assert.match(hints, /Kein Git-Repository/);
});

test('check: committed CRLF original produces no phantom change', () => {
    const root = validBrain();
    initGit(root);
    assert.deepEqual(checkBrain(root).errors, []);
    assert.equal(git(root, 'status', '--porcelain'), '');
});

const archiveCases: Array<[string, (root: string) => void, RegExp | null]> = [
    ['modified file', (root) => writeFile(root, `${GARMIN}.md`, 'geändert\n'), /wurde verändert/],
    ['deleted file', (root) => rmSync(join(root, `${GARMIN}.md`)), /wurde gelöscht/],
    ['identical git mv', (root) => {
        mkdirSync(join(root, 'archive/technik/2026/11'), { recursive: true });
        git(root, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
    }, null],
    ['git mv with change', (root) => {
        mkdirSync(join(root, 'archive/technik/2026/11'), { recursive: true });
        git(root, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
        writeFile(root, 'archive/technik/2026/11/x.md', 'anders\n');
    }, /mit Inhaltsänderung/],
    ['new untracked file', (root) => writeFile(root, 'archive/technik/2026/10/neu.md', 'neu\n'), null],
];
for (const [label, mutate, error] of archiveCases) {
    test(`check archive integrity: ${label}`, () => {
        const root = validBrain();
        initGit(root);
        mutate(root);
        const archiveErrors = checkBrain(root).errors.filter((e) => e.startsWith('archive: '));
        if (error === null) {
            assert.deepEqual(archiveErrors, []);
        } else {
            assert.match(archiveErrors.join('\n'), error);
        }
    });
}

test('cli check exit codes and output', () => {
    const ok = runCli(validBrain(), ['check']);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /Keine Fehler\./);
    const bad = runCli(validBrain({ 'wiki/lose.md': 'x' }), ['check']);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^Fehler:\n {2}- wiki\/lose\.md/);
});
