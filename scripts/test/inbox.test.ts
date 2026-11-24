import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listInbox } from '../src/inbox.ts';
import { initGit, runCli, writeFile } from './helpers.ts';

/** Knowledge folder at the root of a fresh git repository with an empty, tracked inbox/.gitkeep. */
function repoWithInbox(): string {
    const dir = mkdtempSync(join(tmpdir(), 'inbox-'));
    initGit(dir);
    writeFile(dir, 'brain.yml', 'path: .\nmode: project\ninbox: committed\n');
    writeFile(dir, 'inbox/.gitkeep', '');
    commitAll(dir, '2026-11-01T08:00:00Z');
    return dir;
}

function commitAll(dir: string, isoDate: string): void {
    const env = { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate };
    execFileSync('git', ['-C', dir, 'add', '-A'], { env });
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `commit ${isoDate}`], { env });
}

function touch(dir: string, rel: string, iso: string): void {
    const time = new Date(iso);
    utimesSync(join(dir, rel), time, time);
}

test('listInbox committed sorts by add commit time, not by mtime or name', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/b.md', 'b\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    writeFile(dir, 'inbox/a.md', 'a\n');
    commitAll(dir, '2026-11-03T08:00:00Z');
    writeFile(dir, 'inbox/c.md', 'c\n');
    commitAll(dir, '2026-11-04T08:00:00Z');
    touch(dir, 'inbox/b.md', '2026-12-03T00:00:00Z');
    touch(dir, 'inbox/a.md', '2026-12-02T00:00:00Z');
    touch(dir, 'inbox/c.md', '2026-12-01T00:00:00Z');
    assert.deepEqual(listInbox(dir, 'committed'), ['inbox/b.md', 'inbox/a.md', 'inbox/c.md']);
});

test('listInbox committed sorts notes of the same commit by file name', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/zz.md', 'z\n');
    writeFile(dir, 'inbox/aa.md', 'a\n');
    writeFile(dir, 'inbox/mm.txt', 'm\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    assert.deepEqual(listInbox(dir, 'committed'), ['inbox/aa.md', 'inbox/mm.txt', 'inbox/zz.md']);
});

test('listInbox committed puts uncommitted notes after committed ones, ordered by mtime then name', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/old.md', 'old\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    writeFile(dir, 'inbox/new-b.md', 'b\n');
    writeFile(dir, 'inbox/new-a.md', 'a\n');
    writeFile(dir, 'inbox/new-early.md', 'e\n');
    touch(dir, 'inbox/old.md', '2026-12-31T00:00:00Z');
    touch(dir, 'inbox/new-early.md', '2026-01-01T00:00:00Z');
    touch(dir, 'inbox/new-a.md', '2026-02-01T00:00:00Z');
    touch(dir, 'inbox/new-b.md', '2026-02-01T00:00:00Z');
    assert.deepEqual(listInbox(dir, 'committed'), ['inbox/old.md', 'inbox/new-early.md', 'inbox/new-a.md', 'inbox/new-b.md']);
});

test('listInbox local sorts by mtime (oldest first), ties by name, ignoring commits', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/first-commit.md', 'x\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    writeFile(dir, 'inbox/second-commit.md', 'y\n');
    commitAll(dir, '2026-11-03T08:00:00Z');
    touch(dir, 'inbox/first-commit.md', '2026-12-02T00:00:00Z');
    touch(dir, 'inbox/second-commit.md', '2026-12-01T00:00:00Z');
    assert.deepEqual(listInbox(dir, 'local'), ['inbox/second-commit.md', 'inbox/first-commit.md']);
    touch(dir, 'inbox/first-commit.md', '2026-12-01T00:00:00Z');
    assert.deepEqual(listInbox(dir, 'local'), ['inbox/first-commit.md', 'inbox/second-commit.md']);
});

test('listInbox returns nothing for an empty inbox or one with only .gitkeep', () => {
    const dir = repoWithInbox();
    assert.deepEqual(listInbox(dir, 'committed'), []);
    assert.deepEqual(listInbox(dir, 'local'), []);
    const bare = mkdtempSync(join(tmpdir(), 'inbox-'));
    writeFile(bare, 'inbox/.gitkeep', '');
    assert.deepEqual(listInbox(bare, 'committed'), []);
});

test('listInbox handles spaces and umlauts in file names', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/größe notiz.md', 'g\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    writeFile(dir, 'inbox/zweite Notiz.md', 'z\n');
    commitAll(dir, '2026-11-03T08:00:00Z');
    assert.deepEqual(listInbox(dir, 'committed'), ['inbox/größe notiz.md', 'inbox/zweite Notiz.md']);
});

test('listInbox committed falls back to mtime outside of a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inbox-'));
    writeFile(dir, 'inbox/b.md', 'b\n');
    writeFile(dir, 'inbox/a.md', 'a\n');
    touch(dir, 'inbox/b.md', '2026-01-01T00:00:00Z');
    touch(dir, 'inbox/a.md', '2026-02-01T00:00:00Z');
    assert.deepEqual(listInbox(dir, 'committed'), ['inbox/b.md', 'inbox/a.md']);
});

test('listInbox ignores subfolders', () => {
    const dir = repoWithInbox();
    writeFile(dir, 'inbox/sub/x.md', 'x\n');
    writeFile(dir, 'inbox/y.md', 'y\n');
    assert.deepEqual(listInbox(dir, 'local'), ['inbox/y.md']);
});

test('cli list-inbox prints one path per line in committed order and nothing for an empty inbox', () => {
    const dir = repoWithInbox();
    const empty = runCli(dir, ['list-inbox']);
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(empty.stdout, '');
    writeFile(dir, 'inbox/b.md', 'b\n');
    commitAll(dir, '2026-11-02T08:00:00Z');
    writeFile(dir, 'inbox/a.md', 'a\n');
    commitAll(dir, '2026-11-03T08:00:00Z');
    const result = runCli(dir, ['list-inbox']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'inbox/b.md\ninbox/a.md\n');
});

test('cli list-inbox rejects arguments', () => {
    const result = runCli(repoWithInbox(), ['list-inbox', 'x']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Verwendung: brain list-inbox/);
});
