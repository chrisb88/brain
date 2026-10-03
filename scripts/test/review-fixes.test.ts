import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkEntries } from '../src/link.ts';
import { extractLinks, getRelated, parseOpenPoints, replaceLinkTargets, setRelated } from '../src/markdown.ts';
import { entry, GARMIN, NOW, read, validBrain } from './helpers.ts';

const fencedRelated = '# T\n\n```md\n## Related\n- [[wiki/a/y]]\n```\n\nWichtiger Text.\n\n## Sources\n- [[archive/x]]\n';

test('setRelated ignores a ## Related heading inside a code fence and keeps all text', () => {
    assert.equal(
        setRelated(fencedRelated, ['wiki/b/z']),
        '# T\n\n```md\n## Related\n- [[wiki/a/y]]\n```\n\nWichtiger Text.\n\n## Related\n- [[wiki/b/z]]\n\n## Sources\n- [[archive/x]]\n',
    );
    assert.deepEqual(getRelated(fencedRelated), []);
});

test('brain link does not delete text after a fenced ## Related example', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '```md\n## Related\n- [[wiki/technik/garmin]]\n```\n\nWichtiger Text.' }),
    });
    linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW);
    const text = read(root, 'wiki/technik/garmin.md');
    assert.ok(text.includes('```\n\nWichtiger Text.\n'));
    assert.deepEqual(getRelated(text).map((l) => l.target), ['wiki/gesundheit/laufen']);
});

const codeCases: Array<[string, string]> = [
    ['indented fence in a list item', '1. Schritt\n   ```bash\n   [[ -f "$x" ]] && echo ok\n   ```\n'],
    ['four-backtick fence containing a three-backtick fence', '````md\n```\n[[wiki/x/y]]\n```\n[[wiki/x/z]]\n````\n'],
    ['double-backtick inline code', 'Beispiel ``[[wiki/a/y]]`` im Text'],
    ['unclosed fence', '```\n[[wiki/x/y]]\n'],
];
for (const [label, text] of codeCases) {
    test(`extractLinks ignores ${label}`, () => {
        assert.deepEqual(extractLinks(text), []);
    });
}

test('parseOpenPoints ignores callout examples inside code fences', () => {
    assert.deepEqual(parseOpenPoints('```\n> [!warning] Conflict C-20261003-1\n```\n'), { points: [], malformed: [] });
});

const wrongTypes = [
    '> [!note] Conflict C-20261003-1',
    '> [!WARNING] Conflict C-20261003-1',
    '> [!warning]- Conflict C-20261003-1',
    '> [!caution] Conflict C-20261003-1',
    '> [!faq] Unclear Q-20261003-1',
];
for (const head of wrongTypes) {
    test(`parseOpenPoints flags ${head}`, () => {
        const result = parseOpenPoints(`${head}\n> Affects: [[wiki/a/x]]\n`);
        assert.equal(result.points.length, 0);
        assert.equal(result.malformed.length, 1);
    });
}

test('replaceLinkTargets matches normalized link forms and skips fenced code', () => {
    const map = new Map([['wiki/a/b', 'wiki/c/b']]);
    assert.equal(
        replaceLinkTargets('[[wiki/a/b.md]] [[./wiki/a/b#H|X]]\n```\n[[wiki/a/b]]\n```\n', map),
        '[[wiki/c/b]] [[wiki/c/b#H|X]]\n```\n[[wiki/a/b]]\n```\n',
    );
});
