import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cliVersion } from '../src/version.ts';

const repo = join(import.meta.dirname, '..', '..');
const json = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(repo, rel), 'utf8')) as Record<string, unknown>;
const text = (rel: string): string => readFileSync(join(repo, rel), 'utf8');
const MISSING_CLI = 'Brain: CLI brain fehlt – einmal ./install.sh aus dem brain-Klon ausführen';
const MISSING_CLI_JSON = JSON.stringify({ systemMessage: MISSING_CLI, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: MISSING_CLI } });
const HOOK_COMMAND = `if command -v brain >/dev/null 2>&1; then brain session-start "\${CLAUDE_PLUGIN_ROOT}"; else echo '${MISSING_CLI_JSON}'; fi`;

test('hook shows the user a hint instead of failing when the brain CLI is missing', () => {
    const result = spawnSync('/bin/sh', ['-c', HOOK_COMMAND], { env: { PATH: '/nonexistent', CLAUDE_PLUGIN_ROOT: '/x' }, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${MISSING_CLI_JSON}\n`);
});

test('marketplace lists the brain plugin from ./plugin', () => {
    assert.deepEqual(json('.claude-plugin/marketplace.json').plugins, [
        { name: 'brain', source: './plugin', description: 'Ingest notes into a condensed wiki and answer questions from it.' },
    ]);
    assert.equal(json('.claude-plugin/marketplace.json').name, 'brain');
});

test('plugin version equals the CLI version', () => {
    const plugin = json('plugin/.claude-plugin/plugin.json');
    assert.equal(plugin.name, 'brain');
    assert.equal(plugin.version, cliVersion());
});

test('plugin wires the hook and the qmd MCP server to the brain CLI', () => {
    assert.deepEqual(json('plugin/hooks/hooks.json'), {
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }] },
    });
    assert.deepEqual(json('plugin/.mcp.json'), { mcpServers: { qmd: { command: 'brain', args: ['qmd', 'mcp'] } } });
});

test('commands never commit or push and follow the search level', () => {
    for (const rel of ['plugin/commands/ingest.md', 'plugin/commands/ask.md', 'plugin/skills/brain/SKILL.md', 'plugin/skills/brain/writing.md']) {
        const content = text(rel);
        assert.doesNotMatch(content, /git add -A|git push/, rel);
        assert.doesNotMatch(content, /docs\/superpowers|Code-Repository `second-brain`/, rel);
    }
    assert.match(text('plugin/commands/ingest.md'), /Nicht committen/);
    assert.match(text('plugin/commands/ingest.md'), /`git status --porcelain -- \.`/);
    assert.match(text('plugin/skills/brain/SKILL.md'), /^name: brain$/m);
    for (const level of ['hybrid', 'keyword', 'off']) {
        assert.match(text('plugin/skills/brain/SKILL.md'), new RegExp(`\\| \`${level}\` \\|`), level);
    }
});

test('cli.ts is committed as executable so npm link works after git pull', () => {
    const entry = execFileSync('git', ['-C', repo, 'ls-files', '-s', 'scripts/src/cli.ts'], { encoding: 'utf8' });
    assert.match(entry, /^100755 /);
});
