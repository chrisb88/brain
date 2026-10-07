import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { emptyDir, runCli } from './helpers.ts';

function setup(): { config: string; cache: string; env: Record<string, string>; alive: string } {
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const xdgCache = mkdtempSync(join(tmpdir(), 'xdg-cache-'));
    const cache = join(xdgCache, 'qmd');
    mkdirSync(cache);
    const alive = emptyDir();
    writeFileSync(join(config, 'brain-alive-11111111.yml'), `collections:\n  wiki:\n    path: ${alive}\n`);
    writeFileSync(join(config, 'brain-dead-22222222.yml'), 'collections:\n  wiki:\n    path: /nonexistent/brain/wiki\n');
    writeFileSync(join(config, 'other.yml'), 'collections:\n  wiki:\n    path: /nonexistent/other\n');
    for (const file of ['brain-alive-11111111.sqlite', 'brain-dead-22222222.sqlite', 'brain-dead-22222222.sqlite-wal', 'other.sqlite']) {
        writeFileSync(join(cache, file), '');
    }
    return { config, cache, env: { QMD_CONFIG_DIR: config, XDG_CACHE_HOME: xdgCache, BRAIN_ROOT: '' }, alive };
}

test('qmd prune without a terminal only lists orphans', () => {
    const { config, env } = setup();
    const dir = emptyDir();
    const result = runCli(dir, ['qmd', 'prune'], '', dir, env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /brain-dead-22222222 \(\/nonexistent\/brain\/wiki\)/);
    assert.doesNotMatch(result.stdout, /brain-alive|other/);
    assert.match(result.stdout, /Ohne Terminal wird nichts gelöscht – brain qmd prune --yes/);
    assert.ok(existsSync(join(config, 'brain-dead-22222222.yml')));
});

test('qmd prune --yes removes only orphaned brain indexes', () => {
    const { config, cache, env } = setup();
    const dir = emptyDir();
    const result = runCli(dir, ['qmd', 'prune', '--yes'], '', dir, env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 Index\(e\) gelöscht\./);
    assert.equal(existsSync(join(config, 'brain-dead-22222222.yml')), false);
    assert.equal(existsSync(join(cache, 'brain-dead-22222222.sqlite')), false);
    assert.equal(existsSync(join(cache, 'brain-dead-22222222.sqlite-wal')), false);
    for (const kept of [join(config, 'brain-alive-11111111.yml'), join(config, 'other.yml'), join(cache, 'brain-alive-11111111.sqlite'), join(cache, 'other.sqlite')]) {
        assert.ok(existsSync(kept), kept);
    }
});

test('qmd prune with nothing to do', () => {
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const dir = emptyDir();
    const result = runCli(dir, ['qmd', 'prune'], '', dir, { QMD_CONFIG_DIR: config, BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Nichts zu tun.\n');
});
