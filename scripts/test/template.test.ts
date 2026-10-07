import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const template = join(import.meta.dirname, '..', '..', 'template');
const read = (rel: string): string => readFileSync(join(template, rel), 'utf8');

test('template contains only the knowledge folder files', () => {
    assert.deepEqual(readdirSync(template).sort(), ['CLAUDE.md', '_gitattributes', '_gitignore']);
});

test('template files keep archive bytes and local files out of git', () => {
    assert.match(read('_gitattributes'), /^archive\/\*\* -text$/m);
    for (const line of ['INDEX.md', 'graph.json', 'LOG.md', 'inbox/*', '!inbox/.gitkeep']) {
        assert.match(read('_gitignore'), new RegExp(`^${line.replace(/[.*!]/g, '\\$&')}$`, 'm'), line);
    }
    assert.match(read('CLAUDE.md'), /Skill `brain`/);
});
