import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', '..', 'uninstall.sh');

/** Fake home with qmd config/cache files and stub npm/claude that only log their calls. */
function fakeMachine(): { env: Record<string, string>; config: string; cache: string; log: string } {
    const home = mkdtempSync(join(tmpdir(), 'home-'));
    const bin = join(home, 'bin');
    const log = join(home, 'calls.log');
    mkdirSync(bin);
    for (const name of ['npm', 'claude']) {
        writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${log}"\n`);
        chmodSync(join(bin, name), 0o755);
    }
    const config = join(home, '.config', 'qmd');
    const cache = join(home, '.cache', 'qmd');
    mkdirSync(join(cache, 'models'), { recursive: true });
    mkdirSync(config, { recursive: true });
    for (const file of ['brain-kb-1234abcd.yml', 'index.yml', 'other.yml']) {
        writeFileSync(join(config, file), '');
    }
    for (const file of ['brain-kb-1234abcd.sqlite', 'brain-kb-1234abcd.sqlite-wal', 'index.sqlite', 'models/model.gguf']) {
        writeFileSync(join(cache, file), '');
    }
    const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin` };
    return { env, config, cache, log };
}

function uninstall(env: Record<string, string>, args: string[] = []): ReturnType<typeof spawnSync> {
    return spawnSync('/bin/sh', [SCRIPT, ...args], { env, input: '', encoding: 'utf8' });
}

test('uninstall.sh removes the CLI, lists brain qmd indexes without a terminal and keeps them', () => {
    const { env, config, cache, log } = fakeMachine();
    const result = uninstall(env);
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(readFileSync(log, 'utf8'), 'npm rm -g brain-cli\n');
    assert.match(String(result.stdout), /brain-kb-1234abcd\.yml/);
    assert.match(String(result.stdout), /--yes/);
    assert.ok(existsSync(join(config, 'brain-kb-1234abcd.yml')));
    assert.ok(existsSync(join(cache, 'brain-kb-1234abcd.sqlite')));
    assert.match(String(result.stdout), /claude plugin uninstall brain@brain --scope project/);
    assert.match(String(result.stdout), /Wissens-Ordner/);
    assert.match(String(result.stdout), /npm rm -g @tobilu\/qmd/);
});

test('uninstall.sh --yes deletes only brain qmd indexes', () => {
    const { env, config, cache, log } = fakeMachine();
    const result = uninstall(env, ['--yes']);
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(readFileSync(log, 'utf8'), 'npm rm -g brain-cli\n', 'claude must not be called');
    assert.equal(existsSync(join(config, 'brain-kb-1234abcd.yml')), false);
    assert.equal(existsSync(join(cache, 'brain-kb-1234abcd.sqlite')), false);
    assert.equal(existsSync(join(cache, 'brain-kb-1234abcd.sqlite-wal')), false);
    for (const kept of [join(config, 'index.yml'), join(config, 'other.yml'), join(cache, 'index.sqlite'), join(cache, 'models', 'model.gguf')]) {
        assert.ok(existsSync(kept), kept);
    }
});

test('uninstall.sh follows QMD_CONFIG_DIR and XDG_CACHE_HOME', () => {
    const { env, config, cache } = fakeMachine();
    const result = uninstall({ ...env, HOME: mkdtempSync(join(tmpdir(), 'other-home-')), QMD_CONFIG_DIR: config, XDG_CACHE_HOME: join(cache, '..') }, ['--yes']);
    assert.equal(result.status, 0, String(result.stderr));
    assert.equal(existsSync(join(config, 'brain-kb-1234abcd.yml')), false);
    assert.equal(existsSync(join(cache, 'brain-kb-1234abcd.sqlite')), false);
});

test('uninstall.sh rejects unknown arguments', () => {
    const { env, log } = fakeMachine();
    const result = uninstall(env, ['--force']);
    assert.equal(result.status, 1);
    assert.match(String(result.stderr), /Verwendung: \.\/uninstall\.sh \[--yes\]/);
    assert.equal(existsSync(log), false);
});
