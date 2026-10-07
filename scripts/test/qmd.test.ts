import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { checkBrain } from '../src/check.ts';
import { QMD_EMBED_MODEL, qmdConfigPath, qmdIndexName, setupQmd } from '../src/qmd.ts';
import { slugify } from '../src/slug.ts';
import { CATEGORIES, makeBrain, projectWithBrain, runCli, validBrain } from './helpers.ts';

function stubQmd(): { bin: string; log: string } {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    const log = join(bin, 'calls.log');
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\necho "$PWD|$*" >> "$QMD_STUB_LOG"\nexit ${QMD_STUB_EXIT:-0}\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    return { bin, log };
}

test('qmdIndexName uses the repository folder name and a hash of the knowledge folder', () => {
    const { repo, brain } = projectWithBrain();
    const name = qmdIndexName(brain);
    assert.match(name, new RegExp(`^brain-${slugify(basename(repo))}-[0-9a-f]{8}$`));
    assert.equal(qmdIndexName(brain), name);
    const other = projectWithBrain();
    assert.notEqual(qmdIndexName(other.brain), name);
});

test('qmdConfigPath honors QMD_CONFIG_DIR', () => {
    const root = makeBrain();
    process.env.QMD_CONFIG_DIR = '/tmp/qmd-config';
    assert.equal(qmdConfigPath(root), `/tmp/qmd-config/${qmdIndexName(root)}.yml`);
    delete process.env.QMD_CONFIG_DIR;
});

test('brain qmd passes arguments, index and exit code through', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const { bin, log } = stubQmd();
    const env = { PATH: `${bin}:${process.env.PATH}`, QMD_STUB_LOG: log, QMD_STUB_EXIT: '3' };
    const result = runCli(root, ['qmd', 'search', 'Ingress TLS', '-c', 'wiki'], '', root, env);
    assert.equal(result.status, 3);
    assert.equal(readFileSync(log, 'utf8'), `${root}|--index ${qmdIndexName(root)} search Ingress TLS -c wiki\n`);
});

test('brain qmd without qmd installed fails clearly', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const result = runCli(root, ['qmd', 'status'], '', root, { PATH: '/nonexistent' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /qmd nicht gefunden/);
});

test('setupQmd creates collections, contexts, sets the embed model and indexes', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const { bin, log } = stubQmd();
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const name = qmdIndexName(root);
    writeFileSync(join(config, `${name}.yml`), 'collections: {}\nmodels:\n  embed: old\n  rerank: keep-me\n');
    const saved = { PATH: process.env.PATH, QMD_CONFIG_DIR: process.env.QMD_CONFIG_DIR, QMD_STUB_LOG: process.env.QMD_STUB_LOG };
    process.env.PATH = `${bin}:${process.env.PATH}`;
    process.env.QMD_CONFIG_DIR = config;
    process.env.QMD_STUB_LOG = log;
    try {
        setupQmd(root, 'hybrid');
    } finally {
        process.env.PATH = saved.PATH;
        for (const key of ['QMD_CONFIG_DIR', 'QMD_STUB_LOG'] as const) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => line.split('|')[1]);
    assert.deepEqual(calls, [
        `--index ${name} collection remove wiki`,
        `--index ${name} collection remove archive`,
        `--index ${name} collection add ${join(root, 'wiki')} --name wiki --mask */*.md`,
        `--index ${name} collection add ${join(root, 'archive')} --name archive --mask **/*.md`,
        `--index ${name} context add qmd://wiki Verdichtete, aktuelle Wissenseinträge (Deutsch), gegliedert nach Kategorien in Unterordnern. Primäre Quelle für Antworten.`,
        `--index ${name} context add qmd://archive Originalnotizen (Deutsch), unverdichtet und unverändert archiviert; können durch das Wiki überholt sein.`,
        `--index ${name} update`,
        `--index ${name} embed`,
    ]);
    const yml = parse(readFileSync(join(config, `${name}.yml`), 'utf8'));
    assert.equal(yml.models.embed, QMD_EMBED_MODEL);
    assert.equal(yml.models.rerank, 'keep-me');
});

test('check hints when the qmd index of the brain is missing', () => {
    const root = validBrain();
    process.env.QMD_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const hints = checkBrain(root).hints.join('\n');
    delete process.env.QMD_CONFIG_DIR;
    assert.match(hints, new RegExp(`qmd-Index für diesen Wissens-Ordner fehlt \\(${qmdIndexName(root)}\\) – brain qmd setup ausführen`));
});

test('setupQmd keyword creates collections without embedding model and embed', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const { bin, log } = stubQmd();
    const config = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    const name = qmdIndexName(root);
    const saved = { PATH: process.env.PATH, QMD_CONFIG_DIR: process.env.QMD_CONFIG_DIR, QMD_STUB_LOG: process.env.QMD_STUB_LOG };
    process.env.PATH = `${bin}:${process.env.PATH}`;
    process.env.QMD_CONFIG_DIR = config;
    process.env.QMD_STUB_LOG = log;
    try {
        setupQmd(root, 'keyword');
    } finally {
        process.env.PATH = saved.PATH;
        for (const key of ['QMD_CONFIG_DIR', 'QMD_STUB_LOG'] as const) {
            if (saved[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = saved[key];
            }
        }
    }
    const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => line.split('|')[1]);
    assert.equal(calls.at(-1), `--index ${name} update`);
    assert.equal(calls.some((call) => call.endsWith(' embed')), false);
    assert.equal(existsSync(join(config, `${name}.yml`)), false);
});

test('brain qmd setup with BRAIN_SEARCH=off does nothing', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const { bin, log } = stubQmd();
    const result = runCli(root, ['qmd', 'setup'], '', root, { PATH: `${bin}:/usr/bin:/bin`, QMD_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /BRAIN_SEARCH=off – qmd wird nicht eingerichtet\./);
    assert.equal(existsSync(log), false);
});

test('brain qmd mcp with BRAIN_SEARCH=off fails with a hint', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const result = runCli(root, ['qmd', 'mcp'], '', root, { BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BRAIN_SEARCH=off – qmd-MCP-Server bitte über \/mcp deaktivieren/);
});

test('brain qmd rejects an invalid BRAIN_SEARCH', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const result = runCli(root, ['qmd', 'status'], '', root, { BRAIN_SEARCH: 'fast' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BRAIN_SEARCH=fast ist ungültig/);
});

test('brain qmd never passes INDEX_PATH to qmd', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    const log = join(bin, 'env.log');
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\necho "INDEX_PATH=${INDEX_PATH:-unset}" > "$QMD_STUB_LOG"\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    const result = runCli(root, ['qmd', 'status'], '', root, { PATH: `${bin}:/usr/bin:/bin`, QMD_STUB_LOG: log, INDEX_PATH: '/tmp/other.sqlite' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(log, 'utf8'), 'INDEX_PATH=unset\n');
});
