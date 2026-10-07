import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { stringify } from 'yaml';
import { qmdIndexName } from '../src/qmd.ts';
import { cliVersion } from '../src/version.ts';
import { emptyDir, projectWithBrain, runCli, writeFile } from './helpers.ts';

function pluginDir(version: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-'));
    mkdirSync(join(dir, '.claude-plugin'));
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), version === null ? '{kaputt' : JSON.stringify({ name: 'brain', version }));
    return dir;
}

interface HookOutput {
    systemMessage: string;
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
}

/** Parses the JSON hook output that session-start prints when there are warnings. */
function hookOutput(stdout: string): HookOutput {
    const output = JSON.parse(stdout) as HookOutput;
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    return output;
}

function sessionStart(cwd: string, plugin: string, env: Record<string, string> = {}): ReturnType<typeof runCli> {
    return runCli(cwd, ['session-start', plugin], '', cwd, { BRAIN_ROOT: '', BRAIN_SEARCH: 'off', ...env });
}

test('brain --version prints the CLI version', () => {
    const result = runCli(emptyDir(), ['--version'], '', emptyDir(), { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${cliVersion()}\n`);
    assert.equal(cliVersion(), '0.3.1');
});

test('session-start without a knowledge folder prints nothing', () => {
    const dir = emptyDir();
    const result = sessionStart(dir, pluginDir(cliVersion()));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
});

test('session-start prints the context line', () => {
    const { repo } = projectWithBrain();
    const result = sessionStart(repo, pluginDir(cliVersion()));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Brain: knowledge/ (mode: project, search: off)\n');
});

const warnings: Array<[string, string | null, Record<string, string>, RegExp]> = [
    ['version mismatch', '0.0.1', {}, /Warnung: Plugin 0\.0\.1 und CLI \d+\.\d+\.\d+ passen nicht zusammen/],
    ['broken plugin.json', null, {}, /Warnung: Plugin-Version nicht lesbar/],
    ['invalid BRAIN_SEARCH', '0.3.1', { BRAIN_SEARCH: 'fast' }, /Brain: Hinweis – BRAIN_SEARCH=fast ist ungültig/],
];
for (const [label, version, env, expected] of warnings) {
    test(`session-start warns on ${label} and still exits 0`, () => {
        const { repo } = projectWithBrain();
        const result = sessionStart(repo, pluginDir(version), env);
        assert.equal(result.status, 0, result.stderr);
        const output = hookOutput(result.stdout);
        assert.match(output.systemMessage, expected);
        assert.doesNotMatch(output.systemMessage, /^Brain: knowledge\//m, 'the context line is not shown to the user');
        assert.match(output.hookSpecificOutput.additionalContext, expected);
    });
}

function stubQmd(delay: number): { bin: string; marker: string } {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    const marker = join(bin, 'marker');
    writeFileSync(join(bin, 'qmd'), `#!/bin/sh\nsleep ${delay}\necho "$*" > "${marker}"\n`);
    chmodSync(join(bin, 'qmd'), 0o755);
    return { bin, marker };
}

for (const folder of ['knowledge', 'Mein Wissen']) {
    test(`session-start refreshes index and qmd in the background without waiting (${folder})`, async () => {
        const { repo, brain } = projectWithBrain(folder);
        const nested = join(repo, 'docs');
        writeFile(nested, 'x.md', 'x');
        const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
        writeFileSync(join(config, `${qmdIndexName(brain)}.yml`), stringify({ collections: { wiki: { path: join(brain, 'wiki') } } }));
        const { bin, marker } = stubQmd(5);
        const result = sessionStart(nested, pluginDir(cliVersion()), { BRAIN_SEARCH: 'keyword', PATH: `${bin}:/usr/bin:/bin`, QMD_CONFIG_DIR: config });
        assert.doesNotMatch(result.stdout, /qmd-Index fehlt/);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(marker), false, 'session-start must not wait for the refresh');
        for (let i = 0; i < 150 && !existsSync(marker); i++) {
            await sleep(100);
        }
        assert.match(readFileSync(marker, 'utf8'), /^--index brain-.* update\n$/);
        assert.ok(existsSync(join(brain, 'INDEX.md')));
    });
}

test('session-start without a qmd index hints at brain setup and only refreshes the index', async () => {
    const { repo, brain } = projectWithBrain();
    const { bin, marker } = stubQmd(0);
    const result = sessionStart(repo, pluginDir(cliVersion()), { BRAIN_SEARCH: 'keyword', PATH: `${bin}:/usr/bin:/bin` });
    assert.equal(result.status, 0, result.stderr);
    const output = hookOutput(result.stdout);
    assert.equal(output.systemMessage, 'Brain: Hinweis – qmd-Index fehlt – einmal „brain setup“ im Repository ausführen');
    assert.equal(output.hookSpecificOutput.additionalContext, [
        'Brain: knowledge/ (mode: project, search: keyword)',
        'Brain: Hinweis – qmd-Index fehlt – einmal „brain setup“ im Repository ausführen',
    ].join('\n'));
    for (let i = 0; i < 150 && !existsSync(join(brain, 'INDEX.md')); i++) {
        await sleep(100);
    }
    assert.ok(existsSync(join(brain, 'INDEX.md')));
    // Grace period: a wrongly started qmd update would write the marker about 2 s after INDEX.md appears.
    for (let i = 0; i < 40 && !existsSync(marker); i++) {
        await sleep(100);
    }
    assert.equal(existsSync(marker), false, 'qmd must not be called without an index');
});
