import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkEntries, toEntryId } from '../src/link.ts';
import { getRelated } from '../src/markdown.ts';
import { NOW, read, runCli, validBrain } from './helpers.ts';

function related(root: string, id: string): string[] {
    return getRelated(read(root, `${id}.md`)).map((link) => link.target);
}

test('linkEntries links all given entries pairwise on both sides', () => {
    const root = validBrain();
    const changed = linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen.md', 'wiki/gesundheit/ernaehrung'], false, NOW);
    assert.equal(changed, 2);
    assert.deepEqual(related(root, 'wiki/technik/garmin'), ['wiki/gesundheit/ernaehrung', 'wiki/gesundheit/laufen']);
    assert.deepEqual(related(root, 'wiki/gesundheit/laufen'), ['wiki/gesundheit/ernaehrung', 'wiki/technik/garmin']);
    assert.deepEqual(related(root, 'wiki/gesundheit/ernaehrung'), ['wiki/gesundheit/laufen', 'wiki/technik/garmin']);
    assert.equal(
        read(root, 'LOG.md'),
        '2026-10-03 15:30 | link | wiki/gesundheit/ernaehrung ↔ wiki/technik/garmin |\n'
        + '2026-10-03 15:30 | link | wiki/gesundheit/laufen ↔ wiki/technik/garmin |\n',
    );
});

test('linkEntries is idempotent and touches only the Related section', () => {
    const root = validBrain();
    linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW);
    const before = read(root, 'wiki/technik/garmin.md');
    assert.equal(linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW), 0);
    assert.equal(read(root, 'wiki/technik/garmin.md'), before);
    assert.ok(before.startsWith('---\ntitle: Garmin\n'));
    assert.ok(before.includes('## Related\n- [[wiki/gesundheit/laufen]]\n\n## Sources\n'));
});

test('linkEntries --remove deletes both sides and drops an empty section', () => {
    const root = validBrain();
    const original = read(root, 'wiki/technik/garmin.md');
    linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW);
    assert.equal(linkEntries(root, ['wiki/gesundheit/laufen', 'wiki/technik/garmin'], true, NOW), 1);
    assert.equal(read(root, 'wiki/technik/garmin.md'), original);
    assert.deepEqual(related(root, 'wiki/gesundheit/laufen'), ['wiki/gesundheit/ernaehrung']);
    assert.match(read(root, 'LOG.md'), /\| unlink \| wiki\/gesundheit\/laufen ↔ wiki\/technik\/garmin \|\n$/);
});

const invalid: Array<[string[], RegExp]> = [
    [['wiki/technik/garmin'], /Mindestens zwei/],
    [['wiki/technik/garmin', 'wiki/technik/garmin.md'], /Mindestens zwei/],
    [['wiki/technik/garmin', 'wiki/technik/fehlt'], /nicht gefunden/],
    [['wiki/technik/garmin', 'archive/technik/x'], /Kein gültiger Eintrag/],
    [['wiki/technik/garmin', 'wiki/../categories'], /Kein gültiger Eintrag/],
];
for (const [inputs, error] of invalid) {
    test(`linkEntries rejects ${inputs.join(' ')}`, () => {
        assert.throws(() => linkEntries(validBrain(), inputs, false, NOW), error);
    });
}

test('toEntryId normalizes input', () => {
    assert.equal(toEntryId(validBrain(), './wiki/technik/garmin.md'), 'wiki/technik/garmin');
});

test('cli link', () => {
    const root = validBrain();
    const result = runCli(root, ['link', 'wiki/technik/garmin', 'wiki/gesundheit/laufen']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 Beziehung\(en\) gesetzt/);
    assert.equal(runCli(root, ['link', '--remove', 'wiki/technik/garmin', 'wiki/gesundheit/laufen']).status, 0);
});
