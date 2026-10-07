import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { git, projectWithBrain, runCli, stubClaude, writeFile } from './helpers.ts';

const SETTINGS = '{\n  "extraKnownMarketplaces": {\n    "brain": {\n      "source": {\n        "source": "github",\n        "repo": "chrisb88/brain"\n      }\n    }\n  },\n  "enabledPlugins": {\n    "brain@brain": true\n  }\n}\n';
const REORDERED = '{"enabledPlugins":{"brain@brain":true},"extraKnownMarketplaces":{"brain":{"source":{"source":"github","repo":"chrisb88/brain"}}}}';

/** Committed project with brain.yml, knowledge/ and .claude/settings.json, as a team member clones it. */
function clonedProject(): { repo: string; brain: string } {
    const { repo, brain } = projectWithBrain();
    writeFile(repo, '.claude/settings.json', SETTINGS);
    writeFile(brain, '.gitignore', 'INDEX.md\ngraph.json\nLOG.md\n');
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'project');
    return { repo, brain };
}

function stubQmd(): string {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    return bin;
}

function setup(repo: string, cwd: string, env: Record<string, string>): ReturnType<typeof runCli> {
    return runCli(repo, ['setup'], '', cwd, { BRAIN_ROOT: '', ...env });
}

const STEPS = (repo: string): string => [
    `${repo}|plugin marketplace add chrisb88/brain --scope project`,
    `${repo}|plugin install brain@brain --scope project`,
    '',
].join('\n');

for (const sub of ['', 'knowledge']) {
    test(`brain setup installs the plugin for the repository root, builds the index (cwd: ${sub || 'root'})`, () => {
        const { repo, brain } = clonedProject();
        const { bin, log } = stubClaude();
        assert.equal(existsSync(join(brain, 'INDEX.md')), false);
        const result = setup(repo, join(repo, sub), { PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(log, 'utf8'), STEPS(repo));
        assert.ok(existsSync(join(brain, 'INDEX.md')));
        assert.match(result.stdout, /Plugin brain@brain für dieses Projekt aktiviert\./);
        assert.match(result.stdout, /BRAIN_SEARCH=off – qmd wird nicht eingerichtet\./);
        assert.match(result.stdout, /Claude Code im Repo-Root \(neu\) starten/);
        assert.equal(git(repo, 'status', '--porcelain'), '');
    });
}

test('brain setup keeps .claude/settings.json byte-identical when claude only reorders it', () => {
    const { repo } = clonedProject();
    const { bin, log } = stubClaude(0, `case "$*" in *install*) printf '%s' '${REORDERED}' > .claude/settings.json;; esac`);
    const result = setup(repo, repo, { PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'), SETTINGS);
});

test('brain setup keeps real changes to .claude/settings.json', () => {
    const { repo } = clonedProject();
    const changed = '{"enabledPlugins":{"brain@brain":true,"other@x":true}}';
    const { bin, log } = stubClaude(0, `case "$*" in *install*) printf '%s' '${changed}' > .claude/settings.json;; esac`);
    const result = setup(repo, repo, { PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'), changed);
});

test('brain setup without claude prints the install command and still builds the index', () => {
    const { repo, brain } = clonedProject();
    const result = setup(repo, repo, { PATH: '/usr/bin:/bin', BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /claude plugin marketplace add chrisb88\/brain --scope project && claude plugin install brain@brain --scope project/);
    assert.ok(existsSync(join(brain, 'INDEX.md')));
});

test('brain setup warns about the model download only for hybrid', () => {
    const { repo } = clonedProject();
    const { bin, log } = stubClaude();
    const path = `${stubQmd()}:${bin}:/usr/bin:/bin`;
    const hybrid = setup(repo, repo, { PATH: path, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'hybrid' });
    assert.equal(hybrid.status, 0, hybrid.stderr);
    assert.match(hybrid.stdout, /~2\.5 GB/);
    assert.match(hybrid.stdout, /BRAIN_SEARCH=keyword brain setup/);
    assert.match(hybrid.stdout, /qmd-Index eingerichtet \(hybrid\)/);
    const keyword = setup(repo, repo, { PATH: path, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'keyword' });
    assert.equal(keyword.status, 0, keyword.stderr);
    assert.doesNotMatch(keyword.stdout, /GB/);
    assert.match(keyword.stdout, /qmd-Index eingerichtet \(keyword\)/);
});

test('brain setup outside a knowledge folder fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'empty-'));
    const result = setup(dir, dir, { PATH: '/usr/bin:/bin', BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Kein Wissens-Ordner gefunden/);
});
