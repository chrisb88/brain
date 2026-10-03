import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { checkBrain } from '../src/check.ts';
import { QMD_EMBED_MODEL, qmdConfigPath, qmdIndexName, setupQmd } from '../src/qmd.ts';
import { CATEGORIES, makeBrain, runCli, validBrain } from './helpers.ts';

function stubQmd(): { bin: string; log: string } {
    const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
    const log = join(bin, 'calls.log');
    writeFileSync(join(bin, 'qmd'), '#!/bin/sh\necho "$PWD|$*" >> "$QMD_STUB_LOG"\nexit ${QMD_STUB_EXIT:-0}\n');
    chmodSync(join(bin, 'qmd'), 0o755);
    return { bin, log };
}

test('qmdIndexName derives from the root folder name', () => {
    assert.equal(qmdIndexName('/mnt/f/second-brain-data'), 'brain-second-brain-data');
    assert.equal(qmdIndexName('/x/Mein Brain'), 'brain-mein-brain');
});

test('qmdConfigPath honors QMD_CONFIG_DIR', () => {
    process.env.QMD_CONFIG_DIR = '/tmp/qmd-config';
    assert.equal(qmdConfigPath('/mnt/f/second-brain-data'), '/tmp/qmd-config/brain-second-brain-data.yml');
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
        setupQmd(root);
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
    assert.match(hints, new RegExp(`qmd-Index für dieses Brain fehlt \\(brain-${basename(root).toLowerCase()}\\) – brain qmd setup ausführen`));
});
