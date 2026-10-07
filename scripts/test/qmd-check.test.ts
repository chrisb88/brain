import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { QMD_EMBED_MODEL, qmdCheck, qmdIndexName } from '../src/qmd.ts';
import { emptyDir, validBrain } from './helpers.ts';

function withConfig(root: string, content: object | null): void {
    const dir = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    process.env.QMD_CONFIG_DIR = dir;
    if (content !== null) {
        writeFileSync(join(dir, `${qmdIndexName(root)}.yml`), stringify(content));
    }
}

function collections(root: string, wiki = join(root, 'wiki'), archive = join(root, 'archive')): object {
    return { collections: { wiki: { path: wiki, pattern: '*/*.md' }, archive: { path: archive, pattern: '**/*.md' } } };
}

const cases: Array<[string, 'hybrid' | 'keyword' | 'off', (root: string) => object | null, RegExp | null, RegExp | null]> = [
    ['missing config hints', 'hybrid', () => null, null, /qmd-Index für diesen Wissens-Ordner fehlt/],
    ['missing config ignored when off', 'off', () => null, null, null],
    ['foreign wiki path is an error', 'keyword', (root) => collections(root, emptyDir()), /Collection wiki zeigt auf .* statt /, null],
    ['matching keyword index is fine', 'keyword', (root) => collections(root), null, null],
    ['hybrid without model hints', 'hybrid', (root) => collections(root), null, /Embedding-Modell fehlt oder veraltet/],
    ['hybrid with model is fine', 'hybrid', (root) => ({ ...collections(root), models: { embed: QMD_EMBED_MODEL } }), null, null],
];
for (const [label, level, content, error, hint] of cases) {
    test(`qmdCheck: ${label}`, () => {
        const root = validBrain();
        withConfig(root, content(root));
        const report = qmdCheck(root, level);
        delete process.env.QMD_CONFIG_DIR;
        if (error === null) {
            assert.deepEqual(report.errors, []);
        } else {
            assert.match(report.errors.join('\n'), error);
        }
        if (hint === null) {
            assert.deepEqual(report.hints, []);
        } else {
            assert.match(report.hints.join('\n'), hint);
        }
    });
}
