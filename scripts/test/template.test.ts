import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const template = join(import.meta.dirname, '..', '..', 'template');
const read = (rel: string): string => readFileSync(join(template, rel), 'utf8');

test('template contains all data repository config files', () => {
    for (const rel of ['CLAUDE.md', 'wiki/CLAUDE.md', '.claude/commands/ingest.md', '.claude/commands/ask.md', '.mcp.json', '_gitignore', '_gitattributes']) {
        assert.ok(read(rel).length > 0, rel);
    }
});

test('template uses the per-brain qmd index', () => {
    assert.deepEqual(JSON.parse(read('.mcp.json')), { mcpServers: { qmd: { command: 'brain', args: ['qmd', 'mcp'] } } });
    assert.match(read('.claude/commands/ingest.md'), /`brain qmd update && brain qmd embed`/);
    assert.doesNotMatch(read('.claude/commands/ingest.md'), /`qmd update/);
    assert.match(read('_gitattributes'), /^archive\/\*\* -text$/m);
    assert.match(read('_gitignore'), /^LOG\.md$/m);
    assert.match(read('CLAUDE.md'), /nie ein Git-Remote anlegen/);
});
