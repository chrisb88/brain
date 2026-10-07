import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchLevel } from '../src/search.ts';

const valid: Array<[string | undefined, string]> = [
    [undefined, 'hybrid'],
    ['', 'hybrid'],
    ['hybrid', 'hybrid'],
    ['keyword', 'keyword'],
    ['Keyword', 'keyword'],
    [' off ', 'off'],
];
for (const [input, expected] of valid) {
    test(`searchLevel(${JSON.stringify(input)}) is ${expected}`, () => {
        assert.equal(searchLevel(input), expected);
    });
}

test('searchLevel rejects unknown values', () => {
    assert.throws(() => searchLevel('fast'), /BRAIN_SEARCH=fast ist ungültig – erlaubt: hybrid, keyword, off/);
});
