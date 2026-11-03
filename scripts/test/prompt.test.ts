import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMode, parseYesNo } from '../src/prompt.ts';

const cases: Array<[string, boolean | null]> = [['', true], ['Y', true], ['ja', true], ['n', false], ['Nein', false], ['vielleicht', null]];
for (const [answer, expected] of cases) {
    test(`parseYesNo("${answer}")`, () => assert.equal(parseYesNo(answer, true), expected));
}

const modes: Array<[string, 'project' | 'private' | null]> = [
    ['project', 'project'], ['Projekt', 'project'], ['private', 'private'], [' PRIVAT ', 'private'], ['', null], ['p', null],
];
for (const [answer, expected] of modes) {
    test(`parseMode("${answer}")`, () => assert.equal(parseMode(answer), expected));
}
