import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    extractLinks,
    getRelated,
    headings,
    parseOpenPoints,
    replaceLinkTargets,
    setRelated,
    splitFrontmatter,
} from '../src/markdown.ts';

test('splitFrontmatter parses YAML and keeps dates as strings', () => {
    const parsed = splitFrontmatter('---\ntitle: A\ncreated: 2026-10-02\n---\n# A\n');
    assert.equal(parsed.frontmatterError, null);
    assert.deepEqual(parsed.frontmatter, { title: 'A', created: '2026-10-02' });
    assert.equal(parsed.body, '# A\n');
});

test('splitFrontmatter reports missing and invalid frontmatter', () => {
    assert.match(splitFrontmatter('# A\n').frontmatterError ?? '', /fehlt/);
    assert.match(splitFrontmatter('---\ntitle: [unclosed\n---\n').frontmatterError ?? '', /ungültig/);
});

const linkCases: Array<[string, Array<[string, string | null, string | null]>]> = [
    ['[[wiki/a/b]]', [['wiki/a/b', null, null]]],
    ['[[wiki/a/b#Ingress]]', [['wiki/a/b', 'Ingress', null]]],
    ['[[wiki/a/b|Alias]]', [['wiki/a/b', null, 'Alias']]],
    ['[[wiki/a/b#Teil 2|Alias]] und [[wiki/c/d]]', [['wiki/a/b', 'Teil 2', 'Alias'], ['wiki/c/d', null, null]]],
    ['Code `[[wiki/x/y]]` ist kein Link', []],
    ['```\n[[wiki/x/y]]\n```\nnach [[wiki/a/b]]', [['wiki/a/b', null, null]]],
    ['~~~md\n[[wiki/x/y]]\n~~~\n', []],
];
for (const [text, expected] of linkCases) {
    test(`extractLinks ${JSON.stringify(text)}`, () => {
        assert.deepEqual(
            extractLinks(text).map((link) => [link.target, link.anchor, link.alias]),
            expected,
        );
    });
}

test('replaceLinkTargets keeps anchor and alias', () => {
    const map = new Map([['wiki/a/b', 'wiki/c/b']]);
    assert.equal(
        replaceLinkTargets('[[wiki/a/b#H|X]] [[wiki/a/bb]] [[wiki/a/b]]', map),
        '[[wiki/c/b#H|X]] [[wiki/a/bb]] [[wiki/c/b]]',
    );
});

test('headings ignores code blocks', () => {
    assert.deepEqual(headings('# A\n## B ##\n```\n## C\n```\n### C# Basics\n'), [
        { level: 1, title: 'A' },
        { level: 2, title: 'B' },
        { level: 3, title: 'C# Basics' },
    ]);
});

const base = '# T\n\nText\n\n## Sources\n- [[archive/x]]\n';

test('setRelated inserts the section before ## Sources, sorted and unique', () => {
    assert.equal(
        setRelated(base, ['wiki/b/z', 'wiki/a/y', 'wiki/b/z']),
        '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n- [[wiki/b/z]]\n\n## Sources\n- [[archive/x]]\n',
    );
});

test('setRelated replaces an existing section and is idempotent', () => {
    const once = setRelated(base, ['wiki/a/y']);
    const twice = setRelated(once, ['wiki/a/y', 'wiki/c/q']);
    assert.equal(twice, '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n- [[wiki/c/q]]\n\n## Sources\n- [[archive/x]]\n');
    assert.equal(setRelated(twice, ['wiki/a/y', 'wiki/c/q']), twice);
});

test('setRelated removes the section when empty', () => {
    assert.equal(setRelated(setRelated(base, ['wiki/a/y']), []), base);
});

test('setRelated appends at the end when there is no ## Sources', () => {
    assert.equal(setRelated('# T\n\nText\n', ['wiki/a/y']), '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n');
});

test('getRelated reads only the Related section', () => {
    const text = setRelated(`${base}[[wiki/q/q]]\n`, ['wiki/a/y']);
    assert.deepEqual(getRelated(text).map((link) => link.target), ['wiki/a/y']);
});

test('parseOpenPoints reads conflicts and unclear points', () => {
    const body = [
        '# T',
        '',
        '> [!warning] Conflict C-20261003-1',
        '> Affects: [[wiki/a/x]], [[wiki/b/y]]',
        '> Text',
        '',
        '> [!question] Unclear Q-20261003-2',
        '> Affects: [[wiki/a/x]]',
        '',
        '> [!warning] Achtung',
        '> normaler Hinweis-Callout',
    ].join('\n');
    assert.deepEqual(parseOpenPoints(body), {
        points: [
            { kind: 'conflict', id: 'C-20261003-1', affects: ['wiki/a/x', 'wiki/b/y'] },
            { kind: 'unclear', id: 'Q-20261003-2', affects: ['wiki/a/x'] },
        ],
        malformed: [],
    });
});

const malformedCallouts = [
    '> [!warning] Conflict\n> Affects: [[wiki/a/x]]',
    '> [!warning] Conflict C-2026-1\n> Affects: [[wiki/a/x]]',
    '> [!question] Conflict C-20261003-1\n> Affects: [[wiki/a/x]]',
    '> [!warning] Unclear Q-20261003-1\n> Affects: [[wiki/a/x]]',
    '> [!warning] Conflict C-20261003-1\n> Text ohne Affects',
];
for (const callout of malformedCallouts) {
    test(`parseOpenPoints flags malformed ${JSON.stringify(callout)}`, () => {
        const result = parseOpenPoints(`# T\n\n${callout}\n`);
        assert.equal(result.points.length, 0);
        assert.equal(result.malformed.length, 1);
    });
}
