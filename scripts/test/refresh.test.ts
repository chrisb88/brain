import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { qmdIndexName } from '../src/qmd.ts';
import { projectWithBrain, runCli } from './helpers.ts';

/** Fake qmd that appends its arguments (without "--index <name>") to a log file. */
function stubQmd(): { bin: string; log: string } {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    const log = join(bin, 'log');
    writeFileSync(join(bin, 'qmd'), `#!/bin/sh\nshift 2\necho "$*" >> "${log}"\n`);
    chmodSync(join(bin, 'qmd'), 0o755);
    return { bin, log };
}

/** Knowledge folder in a project with a ready qmd index config. */
function brainWithIndex(): { repo: string; brain: string; config: string } {
    const { repo, brain } = projectWithBrain();
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    writeFileSync(join(config, `${qmdIndexName(brain)}.yml`), stringify({ collections: { wiki: { path: join(brain, 'wiki') } } }));
    return { repo, brain, config };
}

function qmdCalls(log: string): string[] {
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
}

const levels: Array<[string, string[]]> = [
    ['hybrid', ['update', 'embed']],
    ['keyword', ['update']],
    ['off', []],
];
for (const [level, calls] of levels) {
    test(`brain refresh with BRAIN_SEARCH=${level} rebuilds the index and runs qmd ${calls.join(' + ') || 'not at all'}`, () => {
        const { repo, brain, config } = brainWithIndex();
        const { bin, log } = stubQmd();
        const result = runCli(repo, ['refresh'], '', repo, { BRAIN_SEARCH: level, PATH: `${bin}:/usr/bin:/bin`, QMD_CONFIG_DIR: config });
        assert.equal(result.status, 0, result.stderr);
        assert.ok(existsSync(join(brain, 'INDEX.md')));
        assert.match(result.stdout, /^INDEX\.md und graph\.json erzeugt$/m);
        assert.deepEqual(qmdCalls(log), calls);
    });
}

test('brain refresh without a qmd index refreshes INDEX.md and hints at brain qmd setup', () => {
    const { repo, brain } = projectWithBrain();
    const { bin, log } = stubQmd();
    const result = runCli(repo, ['refresh'], '', repo, { BRAIN_SEARCH: 'hybrid', PATH: `${bin}:/usr/bin:/bin` });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(brain, 'INDEX.md')));
    assert.match(result.stdout, /qmd-Index fehlt – brain qmd setup ausführen/);
    assert.deepEqual(qmdCalls(log), []);
});

test('brain refresh rejects arguments', () => {
    const { repo } = projectWithBrain();
    const result = runCli(repo, ['refresh', 'x'], '', repo, { BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Verwendung: brain refresh/);
});
