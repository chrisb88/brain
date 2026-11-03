import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { formatBrainConfig, loadBrainConfig } from '../src/config.ts';
import { hasPushGuard } from '../src/guard.ts';
import { initBrain, type InitOptions, updateBrainConfig } from '../src/init.ts';
import { emptyDir, entry, git, LAUF, read, runCli, stubClaude, writeFile } from './helpers.ts';

const PROJECT_FILES: Record<string, string> = {
    'README.md': '# Projekt\n',
    '.gitignore': 'node_modules/\n',
    'CLAUDE.md': '# Projektregeln\n',
    '.mcp.json': '{"mcpServers":{}}\n',
};

function project(): string {
    const repo = mkdtempSync(join(tmpdir(), 'project-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    for (const [rel, content] of Object.entries(PROJECT_FILES)) {
        writeFile(repo, rel, content);
    }
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'project');
    return repo;
}

function hooksPath(repo: string): string {
    try {
        return git(repo, 'config', '--get', 'core.hooksPath').trim();
    } catch {
        return '';
    }
}

test('initBrain creates a project brain in a subfolder without touching the project or committing', () => {
    const repo = project();
    const result = initBrain({ cwd: repo, path: 'knowledge', private: false });
    assert.deepEqual(result, { configRoot: repo, brainDir: join(repo, 'knowledge'), mode: 'project', pushGuard: false, createdRepo: false });
    assert.deepEqual(loadBrainConfig(repo), { configRoot: repo, brainDir: join(repo, 'knowledge'), path: 'knowledge', mode: 'project', pushGuard: false });
    for (const rel of ['.gitignore', '.gitattributes', 'CLAUDE.md', 'categories.yml', 'inbox/.gitkeep', 'INDEX.md', 'graph.json']) {
        assert.ok(existsSync(join(repo, 'knowledge', rel)), rel);
    }
    for (const [rel, content] of Object.entries(PROJECT_FILES)) {
        assert.equal(read(repo, rel), content, rel);
    }
    assert.deepEqual(loadCategories(join(repo, 'knowledge')), []);
    assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '1');
    assert.equal(hooksPath(repo), '');
    assert.deepEqual(checkBrain(join(repo, 'knowledge'), 'project', 'off').errors, []);
});

test('initBrain accepts folder names with spaces and umlauts', () => {
    const repo = project();
    const result = initBrain({ cwd: join(repo), path: 'docs/Mein Wissen', private: false });
    assert.equal(result.brainDir, join(repo, 'docs', 'Mein Wissen'));
    assert.equal(loadBrainConfig(repo).path, 'docs/Mein Wissen');
});

test('initBrain asks for the path when none is given', () => {
    const repo = project();
    const result = initBrain({ cwd: repo, private: false, askPath: () => 'kb' });
    assert.equal(result.brainDir, join(repo, 'kb'));
});

test('initBrain --private creates the repository with push guard', () => {
    const dir = emptyDir();
    const result = initBrain({ cwd: dir, path: '.', private: true });
    assert.deepEqual(result, { configRoot: dir, brainDir: dir, mode: 'private', pushGuard: true, createdRepo: true });
    assert.equal(hasPushGuard(dir), true);
    assert.equal(read(dir, 'brain.yml'), formatBrainConfig('.', 'private', true));
    assert.notEqual(hooksPath(dir), '');
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

test('initBrain --private with allowPush accepts a remote and pushes', () => {
    const dir = emptyDir();
    const bare = emptyDir();
    git(bare, 'init', '-q', '--bare');
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', bare);
    const result = initBrain({ cwd: dir, path: '.', private: true, allowPush: true });
    assert.equal(result.pushGuard, false);
    assert.equal(hasPushGuard(dir), false);
    assert.match(read(dir, 'brain.yml'), /push_guard: false/);
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-q', '-m', 'init');
    git(dir, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
    assert.notEqual(git(bare, 'rev-parse', 'refs/heads/main').trim(), '');
});

test('initBrain asks for the push guard after the path', () => {
    const asked: string[] = [];
    const result = initBrain({
        cwd: emptyDir(),
        private: true,
        askPath: () => { asked.push('path'); return '.'; },
        askPushGuard: () => { asked.push('guard'); return false; },
    });
    assert.deepEqual(asked, ['path', 'guard']);
    assert.equal(result.pushGuard, false);
});

test('initBrain asks for the mode first, then path and push guard', () => {
    const asked: string[] = [];
    const result = initBrain({
        cwd: emptyDir(),
        askMode: () => { asked.push('mode'); return 'private'; },
        askPath: () => { asked.push('path'); return '.'; },
        askPushGuard: () => { asked.push('guard'); return true; },
    });
    assert.deepEqual(asked, ['mode', 'path', 'guard']);
    assert.equal(result.mode, 'private');
    assert.equal(result.pushGuard, true);
});

test('initBrain without mode and without question creates a project brain', () => {
    const repo = project();
    assert.equal(initBrain({ cwd: repo, path: 'knowledge' }).mode, 'project');
});

test('initBrain asks for the mode only after checking for an existing brain.yml', () => {
    const repo = project();
    writeFile(repo, 'brain.yml', 'path: .\nmode: project\n');
    let asked = false;
    assert.throws(() => initBrain({ cwd: repo, path: 'knowledge', askMode: () => { asked = true; return 'project'; } }), /Hier gibt es bereits einen Wissens-Ordner/);
    assert.equal(asked, false);
});

test('initBrain refuses the brain code repository before asking or writing', () => {
    const repo = project();
    let asked = false;
    assert.throws(
        () => initBrain({ cwd: join(repo), path: 'knowledge', codeRoot: repo, askMode: () => { asked = true; return 'project'; } }),
        /Das ist das brain-Code-Repository – hier keinen Wissens-Ordner anlegen\. Zum Ausprobieren: mkdir \/tmp\/brain-test && cd \/tmp\/brain-test && brain init --private \./,
    );
    assert.equal(asked, false);
    assert.equal(existsSync(join(repo, 'brain.yml')), false);
    assert.equal(existsSync(join(repo, 'knowledge')), false);
});

test('initBrain refuses the brain code repository from a subfolder', () => {
    const repo = project();
    writeFile(repo, 'scripts/x.txt', '');
    assert.throws(() => initBrain({ cwd: join(repo, 'scripts'), path: 'knowledge', private: false, codeRoot: repo }), /brain-Code-Repository/);
});

const refusals: Array<[string, () => InitOptions, RegExp]> = [
    ['outside a git repository', () => ({ cwd: emptyDir(), path: 'knowledge', private: false }), /muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private/],
    ['an existing brain.yml', () => {
        const repo = project();
        writeFile(repo, 'brain.yml', 'path: .\nmode: project\n');
        return { cwd: repo, path: 'knowledge', private: false };
    }, /Hier gibt es bereits einen Wissens-Ordner/],
    ['a path outside the repository', () => ({ cwd: project(), path: '../elsewhere', private: false }), /liegt außerhalb des Repositorys/],
    ['"." in project mode', () => ({ cwd: project(), path: '.', private: false }), /Im Projekt-Modus braucht der Wissens-Ordner einen eigenen Unterordner/],
    ['a path resolving to the repository root in project mode', () => ({ cwd: project(), path: 'docs/..', private: false }), /Im Projekt-Modus braucht der Wissens-Ordner einen eigenen Unterordner/],
    ['a path that is an existing file', () => ({ cwd: project(), path: 'README.md', private: false }), /^Error: README\.md ist kein Ordner – anderen Wissens-Ordner wählen$/],
    ['a path below an existing file', () => ({ cwd: project(), path: 'README.md/kb', private: false }), /^Error: README\.md\/kb ist kein Ordner – anderen Wissens-Ordner wählen$/],
    ['a missing path without prompt', () => ({ cwd: project(), private: false }), /Pfad angeben: brain init \[--private\] <pfad>/],
    ['--private with a remote', () => {
        const repo = project();
        git(repo, 'remote', 'add', 'origin', 'https://example.com/x.git');
        return { cwd: repo, path: 'knowledge', private: true };
    }, /Privater Wissens-Ordner nur in einem Repository ohne Remote/],
    ['--allow-push without --private', () => ({ cwd: project(), path: 'knowledge', private: false, allowPush: true }), /--allow-push nur mit --private/],
];
for (const [label, options, error] of refusals) {
    test(`initBrain refuses ${label} without writing anything`, () => {
        const opts = options();
        const before = existsSync(join(opts.cwd, 'brain.yml')) ? read(opts.cwd, 'brain.yml') : null;
        assert.throws(() => initBrain(opts), error);
        assert.equal(existsSync(join(opts.cwd, 'brain.yml')) ? read(opts.cwd, 'brain.yml') : null, before);
        assert.equal(existsSync(join(opts.cwd, 'knowledge')), false);
    });
}

test('updateBrainConfig only touches template files, never data', () => {
    const repo = project();
    const { brainDir } = initBrain({ cwd: repo, path: 'knowledge', private: false });
    writeFile(brainDir, `${LAUF}.md`, 'Original\r\n');
    writeFile(brainDir, 'wiki/gesundheit/laufen.md', entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF] }));
    writeFile(brainDir, 'CLAUDE.md', 'veraltet');
    const data = ['categories.yml', `${LAUF}.md`, 'wiki/gesundheit/laufen.md'].map((rel) => [rel, readFileSync(join(brainDir, rel))] as const);
    assert.deepEqual(updateBrainConfig(brainDir, false), ['CLAUDE.md']);
    for (const [rel, bytes] of data) {
        assert.deepEqual(readFileSync(join(brainDir, rel)), bytes, rel);
    }
    assert.equal(hooksPath(repo), '');
});

test('updateBrainConfig reinstalls a removed push guard in private mode', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    git(dir, 'config', '--unset', 'core.hooksPath');
    updateBrainConfig(dir, true);
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

test('updateBrainConfig removes the push guard when push_guard is false', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    updateBrainConfig(dir, false);
    assert.equal(hasPushGuard(dir), false);
    updateBrainConfig(dir, true);
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

test('cli init activates the plugin in project scope', () => {
    const repo = project();
    const { bin, log } = stubClaude();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wissens-Ordner angelegt: .*knowledge \(mode: project\)/);
    assert.match(result.stdout, /BRAIN_SEARCH=off – qmd wird nicht eingerichtet\./);
    assert.match(result.stdout, /Plugin brain@brain für dieses Projekt aktiviert\./);
    assert.match(result.stdout, /Nächster Schritt: Änderungen prüfen \(git status\) und im Repo-Root committen: git add brain\.yml knowledge && git commit -m "brain: Wissens-Ordner anlegen" – dann Claude Code im Repo-Root starten\./);
    assert.equal(readFileSync(log, 'utf8'), [
        `${repo}|plugin marketplace add chrisb88/brain --scope project`,
        `${repo}|plugin install brain@brain --scope project`,
        '',
    ].join('\n'));
});

test('cli init stops after a failing marketplace registration and prints both commands', () => {
    const repo = project();
    const { bin, log } = stubClaude(1);
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(log, 'utf8'), `${repo}|plugin marketplace add chrisb88/brain --scope project\n`);
    assert.match(result.stdout, /claude plugin marketplace add chrisb88\/brain --scope project && claude plugin install brain@brain --scope project/);
});

test('cli init without claude and qmd prints hints', () => {
    const repo = project();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: '/usr/bin:/bin', BRAIN_SEARCH: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd nicht gefunden/);
    assert.match(result.stdout, /claude plugin marketplace add chrisb88\/brain --scope project && claude plugin install brain@brain --scope project/);
});

test('cli init without a path and without a terminal fails', () => {
    const repo = project();
    const result = runCli(repo, ['init'], '', repo, { BRAIN_ROOT: '', PATH: '/usr/bin:/bin' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pfad angeben/);
});

test('cli init --update runs inside an existing knowledge folder', () => {
    const repo = project();
    const { brainDir } = initBrain({ cwd: repo, path: 'knowledge', private: false });
    writeFile(brainDir, 'CLAUDE.md', 'veraltet');
    const result = runCli(repo, ['init', '--update'], '', repo, { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CLAUDE\.md/);
});

test('cli init turns on auto-update for the brain marketplace in .claude/settings.json', () => {
    const repo = project();
    const settings = '{"extraKnownMarketplaces":{"brain":{"source":{"source":"github","repo":"chrisb88/brain"}}},"enabledPlugins":{"brain@brain":true}}';
    const { bin, log } = stubClaude(0, `mkdir -p .claude && printf '%s' '${settings}' > .claude/settings.json`);
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')), {
        extraKnownMarketplaces: { brain: { source: { source: 'github', repo: 'chrisb88/brain' }, autoUpdate: true } },
        enabledPlugins: { 'brain@brain': true },
    });
    assert.match(result.stdout, /git add brain\.yml knowledge \.claude\/settings\.json && git commit -m "brain: Wissens-Ordner anlegen"/);
});

const CLI_ENV = { BRAIN_ROOT: '', PATH: '/usr/bin:/bin', BRAIN_SEARCH: 'off' };

test('cli init --private without a terminal keeps the push guard', () => {
    const dir = emptyDir();
    const result = runCli(dir, ['init', '--private', '.'], '', dir, CLI_ENV);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\(mode: private, push guard: on\)/);
    assert.match(read(dir, 'brain.yml'), /push_guard: true/);
});

test('cli init --private --allow-push prints the remote hint', () => {
    const dir = emptyDir();
    const result = runCli(dir, ['init', '--private', '--allow-push', '.'], '', dir, CLI_ENV);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\(mode: private, push guard: off\)/);
    assert.match(result.stdout, /Hinweis: brain prüft nicht, wer das Remote lesen kann – für privates Wissen kein öffentliches Repository verwenden\./);
});

test('cli init --update rewrites an old brain.yml', () => {
    const repo = project();
    initBrain({ cwd: repo, path: 'knowledge', private: false });
    writeFile(repo, 'brain.yml', 'path: knowledge\nmode: project\n');
    const first = runCli(repo, ['init', '--update'], '', repo);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^  - brain\.yml$/m);
    assert.match(first.stdout, /^Im Repo-Root committen: git add brain\.yml && git commit -m "brain: Konfiguration aktualisieren"$/m);
    assert.equal(read(repo, 'brain.yml'), formatBrainConfig('knowledge', 'project'));
    assert.equal(existsSync(join(repo, 'knowledge', 'brain.yml')), false);
    assert.equal(runCli(repo, ['init', '--update'], '', repo).stdout, 'Konfiguration ist aktuell.\n');
});

test('cli init --update follows push_guard', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    writeFile(dir, 'brain.yml', formatBrainConfig('.', 'private', false));
    const off = runCli(dir, ['init', '--update']);
    assert.equal(off.status, 0, off.stderr);
    assert.match(off.stdout, /Push-Schutz entfernt/);
    assert.equal(hasPushGuard(dir), false);
    writeFile(dir, 'brain.yml', formatBrainConfig('.', 'private', true));
    assert.match(runCli(dir, ['init', '--update']).stdout, /Push-Schutz installiert/);
    assert.equal(hasPushGuard(dir), true);
});

test('cli init --update rejects an invalid brain.yml', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\npush_guard: no\n');
    const result = runCli(dir, ['init', '--update']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /push_guard muss true oder false sein/);
    assert.equal(read(dir, 'brain.yml'), 'path: .\nmode: private\npush_guard: no\n');
});

test('cli init --update --allow-push is refused', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    const result = runCli(dir, ['init', '--update', '--allow-push']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Verwendung: brain init --update/);
});

test('cli init --project creates a project brain', () => {
    const repo = project();
    const result = runCli(repo, ['init', '--project', 'knowledge'], '', repo, CLI_ENV);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\(mode: project\)/);
});

const cliRefusals: Array<[string, string[], RegExp]> = [
    ['--private and --project', ['init', '--private', '--project', '.'], /--private und --project schließen sich aus/],
    ['--project with --allow-push', ['init', '--project', '--allow-push', 'knowledge'], /--allow-push nur mit --private/],
    ['--update with --project', ['init', '--update', '--project'], /Verwendung: brain init --update/],
];
for (const [label, args, error] of cliRefusals) {
    test(`cli init refuses ${label}`, () => {
        const repo = project();
        const result = runCli(repo, args, '', repo, CLI_ENV);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, error);
        assert.equal(existsSync(join(repo, 'brain.yml')), false);
    });
}

test('cli init --private in a new repository suggests git add -A', () => {
    const dir = emptyDir();
    const result = runCli(dir, ['init', '--private', '.'], '', dir, CLI_ENV);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /git add -A && git commit -m "brain: Wissens-Ordner anlegen"/);
});

test('cli init --update names the changed files relative to the repository root', () => {
    const repo = project();
    initBrain({ cwd: repo, path: 'docs/Mein Wissen', private: false });
    writeFile(repo, 'docs/Mein Wissen/CLAUDE.md', 'veraltet');
    const result = runCli(repo, ['init', '--update'], '', repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Im Repo-Root committen: git add 'docs\/Mein Wissen\/CLAUDE\.md' && git commit -m "brain: Konfiguration aktualisieren"$/m);
});
