import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { hasParentSegment, normalizeId, relativeInside } from '../src/paths.ts';
import { slugify } from '../src/slug.ts';
import { formatDate, formatIsoUtc, formatLogTime, formatStamp } from '../src/time.ts';
import { NOW } from './helpers.ts';

test('time formats use local time', () => {
    assert.equal(formatDate(NOW), '2026-10-03');
    assert.equal(formatStamp(NOW), '2026-10-03-1530');
    assert.equal(formatLogTime(NOW), '2026-10-03 15:30');
});

test('formatIsoUtc drops milliseconds', () => {
    assert.equal(formatIsoUtc(new Date('2026-10-02T15:30:00.123Z')), '2026-10-02T15:30:00Z');
});

const slugCases: Array<[string, string]> = [
    ['Kubernetes Ingress', 'kubernetes-ingress'],
    ['Größe & Maß', 'groesse-mass'],
    ['ÄRGER über Öl', 'aerger-ueber-oel'],
    ['  --Hallo   Welt--  ', 'hallo-welt'],
    ['Café crème', 'cafe-creme'],
    ['2026 Plan v2', '2026-plan-v2'],
    ['???', 'note'],
    ['🎉🎉', 'note'],
];
for (const [input, expected] of slugCases) {
    test(`slugify(${JSON.stringify(input)}) === ${expected}`, () => {
        assert.equal(slugify(input), expected);
    });
}

const idCases: Array<[string, string]> = [
    ['wiki/a/b.md', 'wiki/a/b'],
    ['./wiki/a/b', 'wiki/a/b'],
    ['wiki\\a\\b.MD', 'wiki/a/b'],
    ['archive/x/2026/10/n.md', 'archive/x/2026/10/n'],
];
for (const [input, expected] of idCases) {
    test(`normalizeId(${JSON.stringify(input)}) === ${expected}`, () => {
        assert.equal(normalizeId(input), expected);
    });
}

test('hasParentSegment detects ..', () => {
    assert.equal(hasParentSegment('archive/../x'), true);
    assert.equal(hasParentSegment('archive/a..b/x'), false);
});

test('relativeInside', () => {
    assert.equal(relativeInside('/r', join('/r', 'inbox', 'a.md')), 'inbox/a.md');
    assert.equal(relativeInside('/r', '/r'), null);
    assert.equal(relativeInside('/r', '/other/a.md'), null);
    assert.equal(relativeInside('/r', join('/r', 'inbox', '..', '..', 'x')), null);
});
