import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseYesNo } from '../src/prompt.ts';

const cases: Array<[string, boolean | null]> = [['', true], ['Y', true], ['ja', true], ['n', false], ['Nein', false], ['vielleicht', null]];
for (const [answer, expected] of cases) {
    test(`parseYesNo("${answer}")`, () => assert.equal(parseYesNo(answer, true), expected));
}
