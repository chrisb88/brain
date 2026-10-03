import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildGraph, renderIndex, runIndex } from '../src/indexer.ts';
import { loadBrain } from '../src/scan.ts';
import { entry, GARMIN, LAUF, read, runCli, setMtimes, validBrain, writeFile } from './helpers.ts';

const FILES = [
    'wiki/gesundheit/ernaehrung.md',
    'wiki/gesundheit/laufen.md',
    'wiki/technik/garmin.md',
    `${LAUF}.md`,
    `${GARMIN}.md`,
];

test('renderIndex matches the golden catalog', () => {
    assert.equal(renderIndex(loadBrain(validBrain())), [
        '# Index',
        '<!-- generiert von `brain index` – nicht bearbeiten -->',
        '',
        '## Gesundheit (`gesundheit`)',
        'Arztbefunde, Training.',
        '- [[wiki/gesundheit/ernaehrung]] **Ernährung** — Proteinbedarf beim Ausdauersport. · ↔ [[wiki/gesundheit/laufen]]',
        '- [[wiki/gesundheit/laufen]] **Laufen** — Trainingspläne für 10-km-Läufe. · ↔ [[wiki/gesundheit/ernaehrung]]',
        '',
        '## Technik (`technik`)',
        'Software und Infrastruktur.',
        '- [[wiki/technik/garmin]] **Garmin** — Uhr-Einstellungen.',
        '',
        '## Referenz-Map',
        '(keine großen Dokumente)',
        '',
    ].join('\n'));
});

test('renderIndex shows empty categories, uncategorized entries and large documents', () => {
    const longBody = ['## Ingress', ...Array.from({ length: 80 }, (_, i) => `Zeile ${i}`), '## Storage', ...Array.from({ length: 80 }, (_, i) => `Zeile ${i}`)].join('\n');
    const root = validBrain({
        'categories.yml': 'categories:\n  - slug: gesundheit\n    name: Gesundheit\n  - slug: technik\n    name: Technik\n  - slug: urlaub\n    name: Urlaub\n    description: Reisen.\n',
        'wiki/_uncategorized/steuer-idee.md': entry({ title: 'Steuer-Idee', category: '_uncategorized', summary: 'Idee zur Steuer.', sources: [GARMIN] }),
        'wiki/technik/kubernetes.md': entry({ title: 'Kubernetes', category: 'technik', summary: 'Cluster-Wissen.', sources: [GARMIN], body: longBody }),
    });
    const index = renderIndex(loadBrain(root));
    assert.ok(index.includes('## Urlaub (`urlaub`)\nReisen.\n(noch leer)\n'));
    assert.ok(index.includes('## Ohne Kategorie (`_uncategorized`)\n- [[wiki/_uncategorized/steuer-idee]] **Steuer-Idee** — Idee zur Steuer.\n'));
    assert.ok(index.includes('## Referenz-Map\n- [[wiki/technik/kubernetes]] **Kubernetes**\n  - [[wiki/technik/kubernetes#Ingress]]\n  - [[wiki/technik/kubernetes#Storage]]\n'));
    assert.ok(index.indexOf('## Urlaub') < index.indexOf('## Ohne Kategorie'));
});

test('buildGraph matches the golden graph', () => {
    const root = validBrain();
    setMtimes(root, FILES);
    const size = (rel: string): number => statSync(join(root, rel)).size;
    const mtime = '2026-10-02T15:30:00Z';
    assert.deepEqual(buildGraph(loadBrain(root)), {
        version: 1,
        nodes: [
            { id: LAUF, type: 'source', category: 'gesundheit', label: '2026-10-02-1530-lauf', path: `${LAUF}.md`, size: size(`${LAUF}.md`), mtime },
            { id: GARMIN, type: 'source', category: 'technik', label: '2026-10-02-1600-garmin', path: `${GARMIN}.md`, size: size(`${GARMIN}.md`), mtime },
            { id: 'category:gesundheit', type: 'category', category: 'gesundheit', label: 'Gesundheit', path: null, size: 2, mtime: null },
            { id: 'category:technik', type: 'category', category: 'technik', label: 'Technik', path: null, size: 1, mtime: null },
            { id: 'wiki/gesundheit/ernaehrung', type: 'entry', category: 'gesundheit', label: 'Ernährung', path: 'wiki/gesundheit/ernaehrung.md', size: size('wiki/gesundheit/ernaehrung.md'), mtime },
            { id: 'wiki/gesundheit/laufen', type: 'entry', category: 'gesundheit', label: 'Laufen', path: 'wiki/gesundheit/laufen.md', size: size('wiki/gesundheit/laufen.md'), mtime },
            { id: 'wiki/technik/garmin', type: 'entry', category: 'technik', label: 'Garmin', path: 'wiki/technik/garmin.md', size: size('wiki/technik/garmin.md'), mtime },
        ],
        edges: [
            { source: 'wiki/gesundheit/ernaehrung', target: LAUF, type: 'source' },
            { source: 'wiki/gesundheit/ernaehrung', target: 'category:gesundheit', type: 'member' },
            { source: 'wiki/gesundheit/ernaehrung', target: 'wiki/gesundheit/laufen', type: 'related' },
            { source: 'wiki/gesundheit/laufen', target: LAUF, type: 'source' },
            { source: 'wiki/gesundheit/laufen', target: 'category:gesundheit', type: 'member' },
            { source: 'wiki/gesundheit/laufen', target: 'wiki/technik/garmin', type: 'link' },
            { source: 'wiki/technik/garmin', target: GARMIN, type: 'source' },
            { source: 'wiki/technik/garmin', target: 'category:technik', type: 'member' },
        ],
    });
});

test('buildGraph ignores links in code, to missing entries and self links', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({
            title: 'Garmin',
            category: 'technik',
            sources: [GARMIN],
            body: '`[[wiki/gesundheit/laufen]]` [[wiki/technik/fehlt]] [[wiki/technik/garmin]]',
        }),
    });
    const edges = buildGraph(loadBrain(root)).edges.filter((edge) => edge.source === 'wiki/technik/garmin');
    assert.deepEqual(edges.map((edge) => edge.type), ['source', 'member']);
});

test('runIndex is deterministic and cli index writes both files', () => {
    const root = validBrain();
    setMtimes(root, FILES);
    runIndex(root);
    const index = read(root, 'INDEX.md');
    const graph = read(root, 'graph.json');
    writeFile(root, 'INDEX.md', 'manuell kaputt gemacht');
    const result = runCli(root, ['index']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(root, 'INDEX.md'), index);
    assert.equal(read(root, 'graph.json'), graph);
    assert.ok(graph.endsWith('}\n'));
    assert.equal(JSON.parse(graph).version, 1);
});
