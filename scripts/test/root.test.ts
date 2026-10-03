import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBrainRoot } from '../src/paths.ts';
import { CATEGORIES, makeBrain, runCli } from './helpers.ts';

test('findBrainRoot prefers BRAIN_ROOT', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    assert.equal(findBrainRoot(['/'], root), root);
});

test('findBrainRoot walks up from a subdirectory', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    mkdirSync(join(root, 'wiki', 'technik'), { recursive: true });
    assert.equal(findBrainRoot([join(root, 'wiki', 'technik')], undefined), root);
});

test('findBrainRoot tries further start directories and returns null without a brain', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    const empty = makeBrain();
    assert.equal(findBrainRoot([empty, root], undefined), root);
    assert.equal(findBrainRoot([empty], undefined), null);
});

test('cli finds the brain from a subdirectory without BRAIN_ROOT', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    mkdirSync(join(root, 'wiki', 'technik'), { recursive: true });
    const result = runCli(root, ['category', 'list'], '', join(root, 'wiki', 'technik'), { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gesundheit – Gesundheit/);
});

test('cli without a brain fails clearly, help still works', () => {
    const empty = makeBrain();
    const fail = runCli(empty, ['check'], '', empty, { BRAIN_ROOT: '' });
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen\./);
    assert.equal(runCli(empty, ['help'], '', empty, { BRAIN_ROOT: '' }).status, 0);
});
