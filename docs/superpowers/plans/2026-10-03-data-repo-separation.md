# Trennung Code-/Daten-Repository – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brain-Daten in ein eigenes, nie zu pushendes Repository `/mnt/f/second-brain-data` auslagern; das Code-Repo `/mnt/f/second-brain` enthält nur noch CLI, Doku und Vorlagen. Jedes Brain bekommt einen eigenen qmd-Index.

**Architecture:** `brain` findet sein Brain über `BRAIN_ROOT` oder durch Aufwärtssuche nach `categories.yml`. Neue Module: `guard.ts` (Push-Schutz), `qmd.ts` (Index pro Brain, `brain qmd`), `init.ts` (`brain init`, `--update` aus `template/`). `brain check` prüft Remote, Hook und qmd-Index.

**Tech Stack:** Node.js 24 (Type-Stripping), TypeScript (`tsc --noEmit`), `yaml`, `node:test`, Git, qmd.

**Spec:** `docs/superpowers/specs/2026-10-03-data-repo-separation-design.md` (ergänzt `docs/superpowers/specs/2026-10-03-second-brain-design.md`).

## Global Constraints

- Branch `feat/data-repo-separation` im Code-Repo; niemals `git push` (auch nicht im Code-Repo – das macht der Nutzer).
- Code-Repo: `/mnt/f/second-brain`; Daten-Repo: `/mnt/f/second-brain-data`.
- Wurzel-Reihenfolge: `BRAIN_ROOT` → Aufwärtssuche nach `categories.yml` ab `INIT_CWD ?? cwd` (zusätzlich ab `CLAUDE_PROJECT_DIR`) → Fehler „Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen.“
- Push-Schutz-Markierung exakt: `# second-brain: this repository must never be pushed.`
- qmd-Indexname: `brain-<slugify(basename(root))>`; Konfiguration `${QMD_CONFIG_DIR ?? $XDG_CONFIG_HOME/qmd ?? ~/.config/qmd}/<name>.yml`.
- Embedding-Modell: `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf`.
- qmd-Index nie auf `/mnt/f` (kein `qmd init`).
- Sprachregel: Maschinenlesbares Englisch, Nutzertexte Deutsch; `brain help` Englisch; Anweisungsdateien (`CLAUDE.md`, Commands) Deutsch.
- PHP-Regeln des Nutzers gelten hier nicht (TypeScript); Stil wie im bestehenden Code (4 Leerzeichen, einfache Anführungszeichen, `.ts`-Importe).

## Review Focus

1. **Globales `core.hooksPath`** (z. B. aus `~/.gitconfig`) – Git würde `.git/hooks/pre-push` ignorieren, der Push-Schutz wäre wirkungslos. Erwartet: `installPushGuard` setzt lokal `core.hooksPath=.git/hooks`; `brain check` meldet einen Fehler, wenn der wirksame Hook-Pfad ein anderer ist. Test in Task 2.
2. **`brain` im Code-Repo oder ohne Brain aufgerufen** – erwartet: klare Fehlermeldung, `brain help` funktioniert trotzdem. Test in Task 1.
3. **Aufruf aus einem Unterordner des Daten-Repos** (z. B. `wiki/technik/`) – erwartet: Wurzel wird gefunden, relative Pfade gelten relativ zum Aufrufort. Test in Task 1.
4. **`brain init --update` in einem befüllten Brain** – erwartet: nur Konfigurationsdateien ändern sich; Wiki-Einträge, Archiv, `categories.yml`, Inbox bleiben byte-identisch. Test in Task 5.
5. **qmd nicht installiert** – erwartet: `brain init` legt das Brain trotzdem an und gibt einen Hinweis; `brain qmd …` meldet „qmd nicht gefunden“ mit Exit 1. Tests in Task 3 und Task 5.

---

## Dateistruktur (nach dem Umbau)

```
/mnt/f/second-brain/                 Code-Repo
├── CLAUDE.md                        Entwicklung (neu)
├── .gitignore                       nur Code-Belange
├── docs/superpowers/…
├── template/                        Vorlagen für das Daten-Repo (1:1-Pfade)
│   ├── CLAUDE.md                    (aus bisherigem Root-CLAUDE.md)
│   ├── wiki/CLAUDE.md
│   ├── .claude/commands/ingest.md, ask.md
│   ├── .mcp.json
│   ├── _gitignore                   → .gitignore im Daten-Repo
│   └── _gitattributes               → .gitattributes im Daten-Repo
└── scripts/src/
    ├── paths.ts      + findBrainRoot
    ├── guard.ts      neu: Push-Schutz
    ├── qmd.ts        neu: Index pro Brain, runQmd, setupQmd
    ├── init.ts       neu: initBrain, updateBrainConfig
    ├── check.ts      + Push-Schutz-Fehler, qmd-Hinweis
    └── cli.ts        + init, qmd; Wurzel erst bei Bedarf

/mnt/f/second-brain-data/            Daten-Repo (kein Remote)
├── CLAUDE.md, wiki/CLAUDE.md, .claude/commands/, .mcp.json, .gitignore, .gitattributes
├── categories.yml, inbox/.gitkeep, archive/, wiki/<kategorie>/…
└── lokal: INDEX.md, graph.json, LOG.md, .obsidian/
```

`_gitignore`/`_gitattributes` statt Punktdateien, damit sie im Code-Repo nicht selbst als Git-Regeln wirken.

---

### Task 1: Brain-Wurzel finden, CLI ohne festes Wurzelverzeichnis

**Files:**
- Modify: `scripts/src/paths.ts`, `scripts/src/cli.ts`
- Test: `scripts/test/root.test.ts`

**Interfaces:**
- Produces: `findBrainRoot(starts: string[], envRoot: string | undefined): string | null`; `brainRoot(): string` (wirft „Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen.“). In `cli.ts` erhält `run(argv: string[], now: Date): number` die Wurzel erst über `brainRoot()`, wenn ein Befehl sie braucht.

- [ ] **Step 1: Fehlschlagende Tests**

`scripts/test/root.test.ts`:
```ts
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
```

In `scripts/test/helpers.ts` `runCli` um Umgebungs-Overrides erweitern (leerer String = Variable entfernen):
```ts
export function runCli(root: string, args: string[], input = '', cwd = root, envOverrides: Record<string, string> = {}): CliResult {
    const cli = join(import.meta.dirname, '..', 'src', 'cli.ts');
    const env: Record<string, string | undefined> = { ...process.env, BRAIN_ROOT: root, INIT_CWD: cwd, CLAUDE_PROJECT_DIR: undefined };
    for (const [key, value] of Object.entries(envOverrides)) {
        env[key] = value === '' ? undefined : value;
    }
    const result = spawnSync(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', cli, ...args],
        { cwd, env, input, encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
```

- [ ] **Step 2: Rot prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test`
Expected: FAIL – `findBrainRoot` nicht exportiert.

- [ ] **Step 3: Implementierung**

`scripts/src/paths.ts` – Importe und `brainRoot` ersetzen:
```ts
import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Returns BRAIN_ROOT, or the first directory (walking up from each start) that contains categories.yml. */
export function findBrainRoot(starts: string[], envRoot: string | undefined): string | null {
    if (envRoot !== undefined && envRoot !== '') {
        return resolve(envRoot);
    }
    for (const start of starts) {
        let dir = resolve(start);
        for (;;) {
            if (existsSync(join(dir, 'categories.yml'))) {
                return dir;
            }
            const parent = dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }
    return null;
}

export function brainRoot(): string {
    const starts = [process.env.INIT_CWD ?? process.cwd(), process.env.CLAUDE_PROJECT_DIR]
        .filter((start): start is string => start !== undefined && start !== '');
    const root = findBrainRoot(starts, process.env.BRAIN_ROOT);
    if (root === null) {
        throw new Error('Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen.');
    }
    return root;
}
```

`scripts/src/cli.ts`:
- Signatur `function run(argv: string[], now: Date): number`; direkt nach `const [command, ...rest] = argv;` und **nach** dem `help`-Block (der `case undefined/'help'/'--help'/'-h'` bleibt im `switch`) die Wurzel lazy holen. Umsetzung: vor dem `switch` einfügen
```ts
    const isHelp = command === undefined || command === 'help' || command === '--help' || command === '-h';
    if (isHelp) {
        console.log(HELP);
        return 0;
    }
    const root = command === 'init' ? '' : brainRoot();
```
  und den bisherigen `case undefined: case 'help': case '--help': case '-h': {…}` aus dem `switch` entfernen.
- Aufruf am Dateiende: `process.exitCode = run(process.argv.slice(2), new Date());`
- Im `HELP`-Text die Zeile `Run it from the repository root. Entries are addressed as wiki/<category>/<entry>,` ersetzen durch `Run it inside a brain data repository (or set BRAIN_ROOT). Entries are addressed as wiki/<category>/<entry>,`.

- [ ] **Step 4: Grün prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: alle Tests PASS, tsc ohne Fehler.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/paths.ts scripts/src/cli.ts scripts/test/root.test.ts scripts/test/helpers.ts
git commit -m "feat: locate brain root via BRAIN_ROOT or categories.yml lookup"
```

---

### Task 2: Push-Schutz (`guard.ts`) und Prüfung in `brain check`

**Files:**
- Create: `scripts/src/guard.ts`
- Modify: `scripts/src/check.ts`, `scripts/test/helpers.ts` (`initGit`)
- Test: `scripts/test/guard.test.ts`

**Interfaces:**
- Produces: `PUSH_GUARD_MARKER: string`; `installPushGuard(root: string): void`; `pushGuardErrors(root: string): string[]` (deutsche Fehlermeldungen). `checkBrain` hängt `pushGuardErrors` an, wenn `isGitRepo(root)`.

- [ ] **Step 1: Fehlschlagende Tests**

`scripts/test/guard.test.ts`:
```ts
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { installPushGuard, PUSH_GUARD_MARKER, pushGuardErrors } from '../src/guard.ts';
import { git, initGit, validBrain } from './helpers.ts';

test('a guarded repository has no guard errors', () => {
    const root = validBrain();
    initGit(root);
    assert.deepEqual(pushGuardErrors(root), []);
    assert.deepEqual(checkBrain(root).errors, []);
});

test('push is rejected by the hook', () => {
    const root = validBrain();
    initGit(root);
    const bare = mkdtempSync(join(tmpdir(), 'bare-'));
    execFileSync('git', ['init', '-q', '--bare', bare]);
    const result = spawnSync('git', ['-C', root, 'push', bare, 'HEAD:refs/heads/main'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /darf nicht gepusht werden/);
});

const broken: Array<[string, (root: string) => void, RegExp]> = [
    ['remote configured', (root) => git(root, 'remote', 'add', 'origin', 'https://example.com/x.git'), /hat ein Remote \(origin\)/],
    ['hook missing', (root) => rmSync(join(git(root, 'rev-parse', '--absolute-git-dir').trim(), 'hooks', 'pre-push')), /Push-Schutz fehlt/],
    ['foreign hook', (root) => writeFileSync(join(git(root, 'rev-parse', '--absolute-git-dir').trim(), 'hooks', 'pre-push'), '#!/bin/sh\nexit 0\n'), /Push-Schutz fehlt/],
    ['other hooksPath', (root) => git(root, 'config', 'core.hooksPath', '/tmp/elsewhere'), /core\.hooksPath/],
];
for (const [label, mutate, error] of broken) {
    test(`check reports ${label}`, () => {
        const root = validBrain();
        initGit(root);
        mutate(root);
        assert.match(checkBrain(root).errors.join('\n'), error);
    });
}

test('installPushGuard is idempotent and writes the marker', () => {
    const root = validBrain();
    initGit(root);
    installPushGuard(root);
    const hook = join(git(root, 'rev-parse', '--absolute-git-dir').trim(), 'hooks', 'pre-push');
    assert.match(execFileSync('cat', [hook], { encoding: 'utf8' }), new RegExp(PUSH_GUARD_MARKER));
    assert.equal(git(root, 'config', '--local', 'core.hooksPath').trim(), '.git/hooks');
});
```

`scripts/test/helpers.ts` – `initGit` installiert den Schutz (Import `import { installPushGuard } from '../src/guard.ts';` oben ergänzen):
```ts
export function initGit(root: string): void {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'core.autocrlf', 'false');
    installPushGuard(root);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
}
```

- [ ] **Step 2: Rot prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test`
Expected: FAIL – Modul `guard.ts` fehlt.

- [ ] **Step 3: Implementierung**

`scripts/src/guard.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PUSH_GUARD_MARKER = '# second-brain: this repository must never be pushed.';

const HOOK = [
    '#!/bin/sh',
    PUSH_GUARD_MARKER,
    'echo "Second Brain: Dieses Daten-Repository darf nicht gepusht werden." >&2',
    'exit 1',
    '',
].join('\n');

function git(root: string, args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hookFile(root: string): string {
    return join(git(root, ['rev-parse', '--absolute-git-dir']), 'hooks', 'pre-push');
}

/** Installs a pre-push hook that rejects every push and pins core.hooksPath to .git/hooks. */
export function installPushGuard(root: string): void {
    git(root, ['config', '--local', 'core.hooksPath', '.git/hooks']);
    const file = hookFile(root);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, HOOK, 'utf8');
    chmodSync(file, 0o755);
}

export function pushGuardErrors(root: string): string[] {
    const errors: string[] = [];
    const remotes = git(root, ['remote']).split('\n').filter((name) => name !== '');
    if (remotes.length > 0) {
        errors.push(`Daten-Repository hat ein Remote (${remotes.join(', ')}) – entfernen mit: git remote remove <name>`);
    }
    let hooksPath = '';
    try {
        hooksPath = git(root, ['config', '--get', 'core.hooksPath']);
    } catch {
        hooksPath = '';
    }
    if (hooksPath !== '' && hooksPath !== '.git/hooks') {
        errors.push(`core.hooksPath zeigt auf „${hooksPath}“ – Push-Schutz wäre wirkungslos (brain init --update ausführen)`);
    }
    const file = hookFile(root);
    if (!existsSync(file) || !readFileSync(file, 'utf8').includes(PUSH_GUARD_MARKER)) {
        errors.push('Push-Schutz fehlt (.git/hooks/pre-push) – brain init --update ausführen');
    }
    return errors;
}
```

`scripts/src/check.ts`:
- Import: `import { pushGuardErrors } from './guard.ts';`
- Im Block `if (isGitRepo(root)) { … }` nach `errors.push(...archiveIntegrityErrors(root));` ergänzen: `errors.push(...pushGuardErrors(root));`

- [ ] **Step 4: Grün prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: alle Tests PASS (bestehende Git-Tests bleiben grün, da `initGit` den Schutz installiert).

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/guard.ts scripts/src/check.ts scripts/test/guard.test.ts scripts/test/helpers.ts
git commit -m "feat: add push guard for the data repository and check it"
```

---

### Task 3: qmd-Index pro Brain (`qmd.ts`, `brain qmd`, Hinweis in `brain check`)

**Files:**
- Create: `scripts/src/qmd.ts`
- Modify: `scripts/src/cli.ts`, `scripts/src/check.ts`
- Test: `scripts/test/qmd.test.ts`

**Interfaces:**
- Consumes: `slugify` (slug.ts)
- Produces: `QMD_EMBED_MODEL`, `qmdIndexName(root: string): string`, `qmdConfigPath(root: string): string`, `isQmdInstalled(): boolean`, `runQmd(root: string, args: string[], stdio?: 'inherit' | 'ignore'): number` (wirft „qmd nicht gefunden – Installation: npm install -g @tobilu/qmd“), `setupQmd(root: string): void`.

- [ ] **Step 1: Fehlschlagende Tests**

`scripts/test/qmd.test.ts`:
```ts
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
        Object.assign(process.env, saved);
        if (saved.QMD_CONFIG_DIR === undefined) {
            delete process.env.QMD_CONFIG_DIR;
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
```

- [ ] **Step 2: Rot prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test`
Expected: FAIL – Modul `qmd.ts` fehlt.

- [ ] **Step 3: Implementierung**

`scripts/src/qmd.ts`:
```ts
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseDocument } from 'yaml';
import { slugify } from './slug.ts';

export const QMD_EMBED_MODEL = 'hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf';

const WIKI_CONTEXT = 'Verdichtete, aktuelle Wissenseinträge (Deutsch), gegliedert nach Kategorien in Unterordnern. Primäre Quelle für Antworten.';
const ARCHIVE_CONTEXT = 'Originalnotizen (Deutsch), unverdichtet und unverändert archiviert; können durch das Wiki überholt sein.';

export function qmdIndexName(root: string): string {
    return `brain-${slugify(basename(root))}`;
}

export function qmdConfigPath(root: string): string {
    const dir = process.env.QMD_CONFIG_DIR
        ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'qmd');
    return join(dir, `${qmdIndexName(root)}.yml`);
}

export function isQmdInstalled(): boolean {
    return spawnSync('qmd', ['--version'], { stdio: 'ignore' }).error === undefined;
}

/** Runs qmd with the index of this brain in the brain root; returns qmd's exit code. */
export function runQmd(root: string, args: string[], stdio: 'inherit' | 'ignore' = 'inherit'): number {
    const result = spawnSync('qmd', ['--index', qmdIndexName(root), ...args], { cwd: root, stdio });
    if (result.error !== undefined) {
        throw new Error('qmd nicht gefunden – Installation: npm install -g @tobilu/qmd');
    }
    return result.status ?? 1;
}

function mustRunQmd(root: string, args: string[]): void {
    const status = runQmd(root, args);
    if (status !== 0) {
        throw new Error(`qmd ${args.join(' ')} fehlgeschlagen (Exit ${status})`);
    }
}

function setEmbedModel(root: string): void {
    const file = qmdConfigPath(root);
    mkdirSync(dirname(file), { recursive: true });
    const doc = parseDocument(existsSync(file) ? readFileSync(file, 'utf8') : '');
    if (doc.contents === null) {
        doc.contents = doc.createNode({});
    }
    doc.setIn(['models', 'embed'], QMD_EMBED_MODEL);
    writeFileSync(file, String(doc), 'utf8');
}

/** (Re)creates the wiki and archive collections of this brain's qmd index and embeds them. */
export function setupQmd(root: string): void {
    mkdirSync(join(root, 'wiki'), { recursive: true });
    mkdirSync(join(root, 'archive'), { recursive: true });
    runQmd(root, ['collection', 'remove', 'wiki'], 'ignore');
    runQmd(root, ['collection', 'remove', 'archive'], 'ignore');
    mustRunQmd(root, ['collection', 'add', join(root, 'wiki'), '--name', 'wiki', '--mask', '*/*.md']);
    mustRunQmd(root, ['collection', 'add', join(root, 'archive'), '--name', 'archive', '--mask', '**/*.md']);
    mustRunQmd(root, ['context', 'add', 'qmd://wiki', WIKI_CONTEXT]);
    mustRunQmd(root, ['context', 'add', 'qmd://archive', ARCHIVE_CONTEXT]);
    setEmbedModel(root);
    mustRunQmd(root, ['update']);
    mustRunQmd(root, ['embed']);
}
```

`scripts/src/check.ts`:
- Importe: `import { existsSync } from 'node:fs';` (zu den bestehenden fs-Importen), `import { qmdConfigPath, qmdIndexName } from './qmd.ts';`
- Vor `return { errors, hints };` in `checkBrain`:
```ts
    if (!existsSync(qmdConfigPath(root))) {
        hints.push(`qmd-Index für dieses Brain fehlt (${qmdIndexName(root)}) – brain qmd setup ausführen`);
    }
```

`scripts/src/cli.ts`:
- Import: `import { runQmd, setupQmd } from './qmd.ts';`
- `case` vor `default:`:
```ts
        case 'qmd': {
            if (rest.length === 1 && rest[0] === 'setup') {
                setupQmd(root);
                console.log('qmd-Index eingerichtet');
                return 0;
            }
            if (rest.length === 0) {
                throw new Error('Verwendung: brain qmd setup | brain qmd <qmd-argumente>');
            }
            return runQmd(root, rest);
        }
```
- `HELP`: vor `  index` einfügen:
```
  qmd setup
      Create this brain's qmd index (collections wiki/archive, contexts, Qwen3
      embedding model) and embed all files.
  qmd <qmd-arguments>
      Run qmd on this brain's own index, e.g. "brain qmd search Ingress -c wiki",
      "brain qmd update", "brain qmd mcp".
```
  und in `Examples:` ergänzen: `  brain qmd search "Ingress" -c wiki`.
- Den Hilfetext-Test in `scripts/test/cli.test.ts` erweitern: `'qmd setup'` in `helpCommands` aufnehmen.

- [ ] **Step 4: Grün prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/qmd.ts scripts/src/cli.ts scripts/src/check.ts scripts/test/qmd.test.ts scripts/test/cli.test.ts
git commit -m "feat: per-brain qmd index with brain qmd and brain qmd setup"
```

---

### Task 4: Vorlagen (`template/`) und Code-Repo-Konfiguration

**Files:**
- Move: `CLAUDE.md` → `template/CLAUDE.md`, `wiki/CLAUDE.md` → `template/wiki/CLAUDE.md`, `.claude/commands/` → `template/.claude/commands/`, `.mcp.json` → `template/.mcp.json`, `.gitattributes` → `template/_gitattributes`
- Create: `template/_gitignore`, `CLAUDE.md` (Entwicklung), Test `scripts/test/template.test.ts`
- Modify: `.gitignore`
- Delete: `categories.yml`, `inbox/.gitkeep`

**Interfaces:**
- Produces: Verzeichnis `template/` mit genau diesen Dateien: `CLAUDE.md`, `wiki/CLAUDE.md`, `.claude/commands/ingest.md`, `.claude/commands/ask.md`, `.mcp.json`, `_gitignore`, `_gitattributes`. Task 5 kopiert sie (`_gitignore` → `.gitignore`, `_gitattributes` → `.gitattributes`).

- [ ] **Step 1: Fehlschlagender Test**

`scripts/test/template.test.ts`:
```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const template = join(import.meta.dirname, '..', '..', 'template');
const read = (rel: string): string => readFileSync(join(template, rel), 'utf8');

test('template contains all data repository config files', () => {
    for (const rel of ['CLAUDE.md', 'wiki/CLAUDE.md', '.claude/commands/ingest.md', '.claude/commands/ask.md', '.mcp.json', '_gitignore', '_gitattributes']) {
        assert.ok(read(rel).length > 0, rel);
    }
});

test('template uses the per-brain qmd index', () => {
    assert.deepEqual(JSON.parse(read('.mcp.json')), { mcpServers: { qmd: { command: 'brain', args: ['qmd', 'mcp'] } } });
    assert.match(read('.claude/commands/ingest.md'), /`brain qmd update && brain qmd embed`/);
    assert.doesNotMatch(read('.claude/commands/ingest.md'), /`qmd update/);
    assert.match(read('_gitattributes'), /^archive\/\*\* -text$/m);
    assert.match(read('_gitignore'), /^LOG\.md$/m);
    assert.match(read('CLAUDE.md'), /nie ein Git-Remote anlegen/);
});
```

- [ ] **Step 2: Rot prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test`
Expected: FAIL – `template/…` existiert nicht (ENOENT).

- [ ] **Step 3: Dateien verschieben**

```bash
cd /mnt/f/second-brain
mkdir -p template/wiki template/.claude
git mv CLAUDE.md template/CLAUDE.md
git mv wiki/CLAUDE.md template/wiki/CLAUDE.md
git mv .claude/commands template/.claude/commands
git mv .mcp.json template/.mcp.json
git mv .gitattributes template/_gitattributes
git rm -q categories.yml inbox/.gitkeep
```

`template/_gitignore`:
```
INDEX.md
graph.json
LOG.md
inbox/*
!inbox/.gitkeep
.obsidian/
.claude/settings.local.json
```

`template/.mcp.json`:
```json
{
  "mcpServers": {
    "qmd": {
      "command": "brain",
      "args": ["qmd", "mcp"]
    }
  }
}
```

`template/.claude/commands/ingest.md`: Zeile `3. \`qmd update && qmd embed\`` ersetzen durch `3. \`brain qmd update && brain qmd embed\``.

`template/CLAUDE.md`:
- Abschnitt `## Aufbau`: Zeile `` - `scripts/` – das CLI `brain` (Node/TypeScript, Tests: `npm --prefix scripts test`) `` ersetzen durch `` - Das CLI `brain` stammt aus dem Code-Repository `second-brain` (`brain help`); Konfigurationsdateien dieses Repos (`CLAUDE.md`, `wiki/CLAUDE.md`, `.claude/commands/`, `.mcp.json`, `.gitignore`, `.gitattributes`) werden dort gepflegt und mit `brain init --update` übernommen – hier nicht von Hand ändern. ``
- Abschnitt `## Einrichtung (frischer Clone oder neuer Rechner)` vollständig ersetzen durch:
```markdown
## Einrichtung

1. CLI aus dem Code-Repository installieren: dort `npm --prefix scripts install && npm --prefix scripts link` (danach `brain help`).
2. qmd installieren (`npm install -g @tobilu/qmd`, GPU-Hinweise im Code-Repo unter `docs/superpowers/notes/2026-10-03-qmd-spike.md`) und in diesem Repo `brain qmd setup` ausführen – legt den eigenen qmd-Index dieses Brains an (`brain-<ordnername>`, im Linux-Home, nicht in Git).
3. `brain index` – erzeugt `INDEX.md` und `graph.json` (nicht in Git).
4. Claude Code in diesem Repo starten und den Projekt-MCP-Server `qmd` (`.mcp.json` → `brain qmd mcp`) freigeben; mit `/mcp` prüfen.
5. Optional Obsidian: Ordner als Vault öffnen; `.obsidian/app.json` mit `"newLinkFormat": "absolute"` (lokal, nicht in Git).
6. Neues Brain an anderem Ort: `brain init <pfad>`; Konfiguration nach Updates des CLI: `brain init --update`.
```
- Abschnitt `## Feste Regeln`: Zeile `- Nie \`git push\` ausführen.` ersetzen durch `- Nie \`git push\` ausführen und nie ein Git-Remote anlegen. Dieses Daten-Repository darf nie gepusht werden (Push-Schutz per Hook; \`brain check\` meldet Verstöße).`.
- Tabelle `## CLI \`brain\``: Überschrift auf `## CLI \`brain\` (im Daten-Repo)` ändern und vor `| \`brain help\` |` einfügen:
```markdown
| `brain qmd setup` | qmd-Index dieses Brains einrichten (Collections, Kontexte, Modell) und indexieren |
| `brain qmd <argumente>` | qmd auf dem Index dieses Brains, z. B. `brain qmd search "…" -c wiki` |
| `brain init --update` | Konfigurationsdateien aus dem Code-Repo übernehmen (ändert keine Daten) |
```

- [ ] **Step 4: Code-Repo-Konfiguration**

`.gitignore` (Code-Repo) vollständig ersetzen:
```
scripts/node_modules/
.claude/settings.local.json
```

`CLAUDE.md` (Code-Repo, neu):
```markdown
# Second Brain – Code-Repository

Entwicklung des CLI `brain` und der Vorlagen für Brain-Daten-Repositories. **Hier liegen keine Brain-Daten.** Das Brain selbst liegt in einem eigenen Daten-Repository (Standard: `/mnt/f/second-brain-data`), das nie gepusht wird.

## Aufbau

- `scripts/` – CLI `brain` (Node 24, TypeScript per Type-Stripping, Abhängigkeit nur `yaml`). Tests: `npm --prefix scripts test`, Typprüfung: `npm --prefix scripts run typecheck`.
- `template/` – Konfiguration für Daten-Repos, Pfade 1:1 (`_gitignore` → `.gitignore`, `_gitattributes` → `.gitattributes`). Änderungen hier landen per `brain init --update` im Daten-Repo.
- `docs/superpowers/` – Specs, Pläne, Notizen. Datenvertrag: `specs/2026-10-03-second-brain-design.md`; Trennung Code/Daten: `specs/2026-10-03-data-repo-separation-design.md`.

## Einrichtung

1. `npm --prefix scripts install && npm --prefix scripts link` → `brain` im PATH.
2. Neues Brain: `brain init /mnt/f/second-brain-data` (legt Git-Repo ohne Remote mit Push-Schutz an und richtet den qmd-Index ein).
3. Benutzung (`/ingest`, `/ask`): Claude Code im Daten-Repo starten, nicht hier.

## Regeln für die Entwicklung

- Nie Brain-Daten (`inbox/`, `archive/`, `wiki/`-Einträge, `categories.yml`) in dieses Repository legen oder committen.
- Tests nie gegen das echte Brain laufen lassen; Tests nutzen temporäre Ordner (`scripts/test/helpers.ts`).
- Zum Ausprobieren ein Wegwerf-Brain: `brain init /tmp/brain-test` bzw. `BRAIN_ROOT=/tmp/brain-test brain …`.
- `git push` führt der Nutzer selbst aus.
- Sprache: Code, CLI und `brain help` Englisch; Meldungen an den Nutzer und Anweisungsdateien Deutsch.
```

```bash
cd /mnt/f/second-brain && rm -f INDEX.md graph.json LOG.md && rmdir wiki inbox archive 2>/dev/null; ls -A
```
Expected: keine `INDEX.md`, `graph.json`, `wiki/`, `inbox/`, `archive/`, `categories.yml` mehr im Code-Repo (`.obsidian/` bleibt vorerst, Task 6 verschiebt es).

- [ ] **Step 5: Grün prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /mnt/f/second-brain
git add -A
git status --short
git commit -m "refactor: move data repository config into template/, code-only repo"
```
Expected vor dem Commit: `git status` zeigt nur Umbenennungen nach `template/`, die neuen Dateien, Löschungen von `categories.yml`/`inbox/.gitkeep` und die geänderten `.gitignore`/`CLAUDE.md`/Testdatei.

---

### Task 5: `brain init` und `brain init --update`

**Files:**
- Create: `scripts/src/init.ts`
- Modify: `scripts/src/cli.ts`
- Test: `scripts/test/init.test.ts`

**Interfaces:**
- Consumes: `saveCategories` (categories.ts), `installPushGuard` (guard.ts), `runIndex` (indexer.ts), `isQmdInstalled`, `setupQmd` (qmd.ts), Vorlagen aus Task 4.
- Produces: `TEMPLATE_DIR: string`; `initBrain(target: string, templateDir?: string): string` (gibt absolute Wurzel zurück); `updateBrainConfig(root: string, templateDir?: string): string[]` (geänderte Pfade relativ zur Wurzel).

- [ ] **Step 1: Fehlschlagende Tests**

`scripts/test/init.test.ts`:
```ts
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { initBrain, updateBrainConfig } from '../src/init.ts';
import { entry, git, LAUF, makeBrain, read, runCli, writeFile } from './helpers.ts';

process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

function target(): string {
    return join(mkdtempSync(join(tmpdir(), 'init-')), 'brain-data');
}

test('initBrain creates a guarded, committed, valid brain from the template', () => {
    const root = initBrain(target());
    for (const rel of ['CLAUDE.md', 'wiki/CLAUDE.md', '.claude/commands/ingest.md', '.claude/commands/ask.md', '.mcp.json', '.gitignore', '.gitattributes', 'categories.yml', 'inbox/.gitkeep', 'INDEX.md', 'graph.json']) {
        assert.ok(existsSync(join(root, rel)), rel);
    }
    assert.ok(existsSync(join(root, 'archive')));
    assert.deepEqual(loadCategories(root), []);
    assert.match(read(root, 'categories.yml'), /nicht von Hand bearbeiten/);
    assert.equal(git(root, 'status', '--porcelain'), '');
    assert.match(git(root, 'log', '--oneline'), /init: second brain data repository/);
    assert.equal(git(root, 'remote').trim(), '');
    assert.deepEqual(checkBrain(root).errors, []);
});

test('initBrain refuses an existing brain', () => {
    const root = initBrain(target());
    assert.throws(() => initBrain(root), /existiert bereits ein Brain/);
});

test('updateBrainConfig only touches config files, never data', () => {
    const root = initBrain(target());
    writeFile(root, `${LAUF}.md`, 'Original\r\n');
    writeFile(root, 'categories.yml', read(root, 'categories.yml').replace('categories: []', 'categories:\n  - slug: gesundheit\n    name: Gesundheit\n    description: x'));
    writeFile(root, 'wiki/gesundheit/laufen.md', entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF] }));
    writeFile(root, 'inbox/neu.md', 'Notiz');
    writeFile(root, 'CLAUDE.md', 'veraltet');
    const data = ['categories.yml', `${LAUF}.md`, 'wiki/gesundheit/laufen.md', 'inbox/neu.md'].map((rel) => [rel, readFileSync(join(root, rel))] as const);
    const changed = updateBrainConfig(root);
    assert.deepEqual(changed, ['CLAUDE.md']);
    for (const [rel, bytes] of data) {
        assert.deepEqual(readFileSync(join(root, rel)), bytes, rel);
    }
    assert.notEqual(read(root, 'CLAUDE.md'), 'veraltet');
});

test('updateBrainConfig reinstalls a removed push guard', () => {
    const root = initBrain(target());
    writeFileSync(join(root, '.git', 'hooks', 'pre-push'), '#!/bin/sh\nexit 0\n');
    updateBrainConfig(root);
    assert.deepEqual(checkBrain(root).errors, []);
});

test('cli init works without qmd and prints a hint', () => {
    const dir = target();
    const result = runCli(makeBrain(), ['init', dir], '', tmpdir(), { BRAIN_ROOT: '', PATH: '/usr/bin:/bin' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd nicht gefunden/);
    assert.ok(existsSync(join(dir, 'categories.yml')));
});

test('cli init --update runs inside an existing brain', () => {
    const root = initBrain(target());
    writeFile(root, '.mcp.json', '{}');
    const result = runCli(root, ['init', '--update'], '', root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\.mcp\.json/);
});
```

Hinweis: `/usr/bin` muss `git` enthalten (Ubuntu: ja), darf aber kein `qmd` enthalten (qmd liegt unter nvm). Node wird nicht über `PATH` gesucht – `runCli` startet `process.execPath` direkt.

- [ ] **Step 2: Rot prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test`
Expected: FAIL – Modul `init.ts` fehlt.

- [ ] **Step 3: Implementierung**

`scripts/src/init.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { saveCategories } from './categories.ts';
import { installPushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';

export const TEMPLATE_DIR = resolve(import.meta.dirname, '..', '..', 'template');

const RENAMES: Record<string, string> = { _gitignore: '.gitignore', _gitattributes: '.gitattributes' };

/** Lists template files as [source path relative to template, target path relative to brain]. */
function templateFiles(templateDir: string, prefix = ''): Array<[string, string]> {
    const result: Array<[string, string]> = [];
    for (const dirent of readdirSync(join(templateDir, prefix), { withFileTypes: true })) {
        const rel = prefix === '' ? dirent.name : `${prefix}/${dirent.name}`;
        if (dirent.isDirectory()) {
            result.push(...templateFiles(templateDir, rel));
        } else {
            result.push([rel, prefix === '' ? (RENAMES[dirent.name] ?? rel) : rel]);
        }
    }
    return result.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function git(root: string, args: string[]): void {
    execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
}

/** Copies changed template files into the brain; returns the changed target paths. */
export function updateBrainConfig(root: string, templateDir = TEMPLATE_DIR): string[] {
    const changed: string[] = [];
    for (const [source, targetRel] of templateFiles(templateDir)) {
        const content = readFileSync(join(templateDir, source));
        const file = join(root, targetRel);
        if (existsSync(file) && readFileSync(file).equals(content)) {
            continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        changed.push(targetRel);
    }
    installPushGuard(root);
    return changed;
}

/** Creates a new brain data repository (git, template, guard, empty categories, index, first commit). */
export function initBrain(target: string, templateDir = TEMPLATE_DIR): string {
    const root = resolve(target);
    if (existsSync(join(root, 'categories.yml'))) {
        throw new Error(`Dort existiert bereits ein Brain: ${root}`);
    }
    mkdirSync(root, { recursive: true });
    if (!existsSync(join(root, '.git'))) {
        git(root, ['init', '-q']);
    }
    updateBrainConfig(root, templateDir);
    for (const dir of ['inbox', 'archive', 'wiki']) {
        mkdirSync(join(root, dir), { recursive: true });
    }
    writeFileSync(join(root, 'inbox', '.gitkeep'), '');
    saveCategories(root, []);
    runIndex(root);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'init: second brain data repository']);
    return root;
}
```

`scripts/src/cli.ts`:
- Importe: `import { initBrain, updateBrainConfig } from './init.ts';` und `isQmdInstalled` zum qmd-Import ergänzen.
- `case` vor `default:`:
```ts
        case 'init': {
            if (rest.length === 1 && rest[0] === '--update') {
                const updateRoot = brainRoot();
                const changed = updateBrainConfig(updateRoot);
                console.log(changed.length === 0
                    ? 'Konfiguration ist aktuell.'
                    : ['Aktualisiert (bitte prüfen und committen):', ...changed.map((rel) => `  - ${rel}`)].join('\n'));
                return 0;
            }
            if (rest.length !== 1 || rest[0].startsWith('-')) {
                throw new Error('Verwendung: brain init <pfad> | brain init --update');
            }
            const created = initBrain(callerPath(rest[0]));
            console.log(`Brain angelegt: ${created} (Git-Repo ohne Remote, Push-Schutz aktiv)`);
            if (isQmdInstalled()) {
                setupQmd(created);
                console.log('qmd-Index eingerichtet.');
            } else {
                console.log('Hinweis: qmd nicht gefunden – später im Brain „brain qmd setup“ ausführen.');
            }
            console.log(`Nächster Schritt: Claude Code in ${created} starten und den MCP-Server „qmd“ freigeben.`);
            return 0;
        }
```
- `HELP`: nach `  help` einfügen:
```
  init <path>
      Create a new brain data repository: git without remote, push guard, config
      from the code repository's template/, empty categories, qmd index.
  init --update
      Refresh the config files of the current brain from template/ and reinstall
      the push guard. Never touches data.
```
  und in `Examples:` `  brain init /mnt/f/second-brain-data` ergänzen; in `scripts/test/cli.test.ts` `'init'` zu `helpCommands` hinzufügen.

- [ ] **Step 4: Grün prüfen**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/init.ts scripts/src/cli.ts scripts/test/init.test.ts scripts/test/cli.test.ts
git commit -m "feat: add brain init and brain init --update"
```

---

### Task 6: Umzug auf das echte Daten-Repo und Doku

**Files:**
- Create (außerhalb des Code-Repos): `/mnt/f/second-brain-data/`
- Modify: `docs/superpowers/specs/2026-10-03-second-brain-design.md`, `docs/superpowers/notes/2026-10-03-qmd-spike.md`

**Interfaces:**
- Consumes: alles aus Tasks 1–5.

- [ ] **Step 1: Alten Standardindex von qmd leeren**

```bash
qmd collection remove wiki; qmd collection remove archive; qmd cleanup
qmd collection list
```
Expected: `Collections (0)` bzw. keine `wiki`/`archive` mehr im Standardindex.

- [ ] **Step 2: Daten-Repo anlegen**

```bash
cd /mnt/f/second-brain && brain init /mnt/f/second-brain-data
```
Expected: „Brain angelegt …“, „qmd-Index eingerichtet.“ (GPU-Embedding auf leerem Brain), „Nächster Schritt …“.

- [ ] **Step 3: Obsidian-Einstellungen mitnehmen**

```bash
mv /mnt/f/second-brain/.obsidian /mnt/f/second-brain-data/.obsidian
python3 - <<'EOF'
import json
p='/mnt/f/second-brain-data/.obsidian/app.json'
d=json.load(open(p,encoding='utf-8'))
d['userIgnoreFilters']=[f for f in d.get('userIgnoreFilters',[]) if f not in ('docs/','scripts/')]
if not d['userIgnoreFilters']:
    del d['userIgnoreFilters']
open(p,'w',encoding='utf-8').write(json.dumps(d,indent=2)+'\n')
EOF
```

- [ ] **Step 4: Prüfen**

```bash
cd /mnt/f/second-brain-data
brain check
git status --short; git remote; git log --oneline
brain qmd status
bare=$(mktemp -d) && git init -q --bare "$bare" && git push "$bare" HEAD:refs/heads/main; echo "push exit=$?"; rm -r "$bare"
cd /mnt/f/second-brain && git status --short && brain check; echo "exit=$?"
```
Expected:
- Daten-Repo: `brain check` → „Keine Fehler.“; `git status` leer; kein Remote; ein Commit `init: …`; `brain qmd status` zeigt Collections `wiki`/`archive` im Index `brain-second-brain-data`; Push → „darf nicht gepusht werden“, `push exit=1`.
- Code-Repo: `git status` leer; `brain check` → „Kein Brain gefunden …“, `exit=1`.

- [ ] **Step 5: MCP-Start im Daten-Repo prüfen**

```bash
cd /mnt/f/second-brain-data && timeout 30 sh -c 'printf "%s\n" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"t\",\"version\":\"1\"}}}" "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}" "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}" | env -u INIT_CWD brain qmd mcp 2>/dev/null' | grep -oE '"name":"(query|get|multi_get|status)"' | sort -u
```
Expected: die vier Tool-Namen. Die Freigabe in einer echten Claude-Code-Session im Daten-Repo (`/mcp`) übernimmt der Nutzer.

- [ ] **Step 6: Haupt-Spec und Notizen anpassen, committen**

In `docs/superpowers/specs/2026-10-03-second-brain-design.md`:
- Abschnitt 2, Tabellenzeile Brain-Ordner: `| Brain-Ordner (Git-Repo) | \`/mnt/f/second-brain\` |` → `| Brain-Daten (Git-Repo ohne Remote) | \`/mnt/f/second-brain-data\` |` und neue Zeile `| Code (CLI, Vorlagen, Doku) | \`/mnt/f/second-brain\` |`.
- Unter `## 3. Ordnerstruktur` als erste Zeile: `> Seit der Trennung (siehe \`2026-10-03-data-repo-separation-design.md\`) liegt diese Struktur im Daten-Repo; \`scripts/\` und \`docs/\` liegen im Code-Repo, Konfiguration kommt aus \`template/\`.`
- Abschnitt 7 (qmd), erste Aufzählung ergänzen: `- Jedes Brain hat einen eigenen Index \`brain-<ordner>\`; Aufrufe über \`brain qmd …\` (siehe Trennungs-Spec Abschnitt 6).`
- Abschnitt 5, Tabelle: Zeilen für `brain init <pfad>` / `brain init --update` und `brain qmd setup` / `brain qmd <argumente>` mit je einem Satz aus der Trennungs-Spec ergänzen.

In `docs/superpowers/notes/2026-10-03-qmd-spike.md` unter `## Einrichtung` ergänzen: `Seit der Trennung Code/Daten: pro Brain eigener Index über \`brain qmd setup\` (ersetzt die obigen Befehle); der Standardindex wird nicht mehr benutzt.`

```bash
cd /mnt/f/second-brain
git add docs
git commit -m "docs: update main spec and notes for the separate data repository"
```

---

### Task 7: Abschluss-Verifikation

- [ ] **Step 1: Volle Testsuite und Typprüfung**

Run: `npm --prefix /mnt/f/second-brain/scripts test && npm --prefix /mnt/f/second-brain/scripts run typecheck`
Expected: alle Tests PASS, tsc ohne Fehler.

- [ ] **Step 2: Keine Brain-Daten im Code-Repo**

```bash
cd /mnt/f/second-brain && git ls-files | grep -E '^(wiki|archive|inbox)/|^categories\.yml$' ; echo "matches=$?"
```
Expected: keine Ausgabe, `matches=1`.

- [ ] **Step 3: Übergabe an den Nutzer**

Nutzer startet Claude Code in `/mnt/f/second-brain-data`, gibt den MCP-Server `qmd` frei, prüft `/mcp`, legt optional eine Notiz in `inbox/` und ruft `/ingest` und `/ask` auf.
