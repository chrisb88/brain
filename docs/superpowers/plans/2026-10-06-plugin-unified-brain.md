# Plugin und einheitliche Brain-Struktur – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** brain legt Wissen – privat oder im Projekt-Repo – immer gleich ab: `brain.yml` im Repo-Root + Wissens-Ordner; Befehle, Regeln, MCP und Hook kommen aus dem Claude-Code-Plugin `brain`; qmd-Indexe sind pro Wissens-Ordner eindeutig und die Suche ist pro Maschine abstufbar.

**Architecture:** Neues Modul `config.ts` liest `brain.yml` und findet es aufwärts; alle bestehenden Module arbeiten weiter auf dem Wissens-Ordner (`root`). `init.ts` wird auf „im aktuellen Git-Repo anlegen, kein Commit“ umgebaut; `--private` ergänzt nur den Push-Schutz. Das Plugin liegt unter `plugin/`, der Marketplace unter `.claude-plugin/` im Repo-Root; der Hook ruft `brain session-start`.

**Tech Stack:** Node ≥ 24 (TypeScript per Type-Stripping), `yaml`, `node:test`, Git, qmd (`@tobilu/qmd`), Claude Code Plugins.

**Spec:** `docs/superpowers/specs/2026-10-06-plugin-unified-brain-design.md`

## Global Constraints

- Node ≥ 24, einzige Laufzeitabhängigkeit `yaml`; kein Build-Schritt.
- Code, CLI-Hilfe, Bezeichner, Kommentare: Englisch. Meldungen an den Nutzer (Fehler, Hinweise, Ausgaben) und Anweisungsdateien (Skill, Commands, README-Abschnitte für Nutzer): Deutsch.
- Tests nur in temporären Ordnern (`scripts/test/helpers.ts`), nie gegen echte Daten; Tests, die `claude` oder `qmd` aufrufen könnten, setzen `PATH` explizit auf Stub-Ordner bzw. `/usr/bin:/bin`.
- `brain.yml`: Schlüssel genau `path` (relativ, innerhalb der Konfigurationswurzel, `.` erlaubt) und `mode` (`project` | `private`); unbekannte Schlüssel → Fehler.
- `BRAIN_ROOT` zeigt auf den Ordner mit `brain.yml`.
- `BRAIN_SEARCH` = `hybrid` (Standard) | `keyword` | `off`.
- qmd-Indexname: `brain-<slugify(Ordnername der Konfigurationswurzel)>-<sha256(realpath Wissens-Ordner)[:8]>`.
- Embedding-Modell: `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf`.
- Plugin-ID: `brain@brain`; Aktivierung `claude plugin install brain@brain --scope project`.
- Push-Schutz-Markierung: `# brain: this repository must never be pushed.`
- Weder `brain init` noch `/brain:ingest` committen. Nie `git push`.
- Versionen: `scripts/package.json` und `plugin/.claude-plugin/plugin.json` haben dieselbe `version` (`0.2.0`).

## Review Focus

1. **Wissens-Ordner mit Leerzeichen/Umlauten** (`docs/Mein Wissen`): `init`, `brain.yml`-Rundreise und die Hintergrund-Aktualisierung (Shell-Quoting) müssen funktionieren → Tests in Task 1, Task 5 und Task 6 (`projectWithBrain('Mein Wissen')`).
2. **Teammitglied hat das Plugin angenommen, aber `install.sh` nicht ausgeführt** (kein `brain` im PATH): Der Hook darf die Sitzung nicht stören, sondern gibt eine Hinweiszeile aus → Hook-Befehl und Test in Task 7.
3. **Claude startet in einem Unterordner des Projekts** (`src/app/`): der Wissens-Ordner wird aufwärts gefunden → Test in Task 1.
4. **Projekt hat schon `.gitignore`/`CLAUDE.md` und der Nutzer wählt `.` als Pfad**: `init` bricht ab statt Projektdateien zu überschreiben → Test in Task 5.
5. **`BRAIN_SEARCH` mit anderer Schreibweise** (`Keyword`, ` off `): wird akzeptiert (getrimmt, klein geschrieben) → Test in Task 3.
6. **Nutzer hat `INDEX_PATH` gesetzt** (qmd-Override auf eine andere Datenbank): `brain qmd …` darf ihn nicht an qmd weitergeben, sonst mischen sich Indexe → Test in Task 3.

---

### Task 1: `brain.yml` lesen und den Wissens-Ordner finden

**Files:**
- Create: `scripts/src/config.ts`
- Modify: `scripts/src/paths.ts` (entfernen: `findBrainRoot`, `brainRoot`)
- Modify: `scripts/src/cli.ts` (Import und Ermittlung von `root`)
- Modify: `scripts/src/init.ts` (Übergang: `initBrain` schreibt `brain.yml`)
- Modify: `scripts/test/helpers.ts`
- Delete: `scripts/test/root.test.ts`
- Create: `scripts/test/config.test.ts`

**Interfaces:**
- Produces:
  - `CONFIG_FILE = 'brain.yml'`
  - `type BrainMode = 'project' | 'private'`, `BRAIN_MODES`
  - `interface BrainConfig { configRoot: string; brainDir: string; path: string; mode: BrainMode }`
  - `loadBrainConfig(configRoot: string): BrainConfig`
  - `formatBrainConfig(path: string, mode: BrainMode): string`
  - `findConfigRoot(start: string): string | null`
  - `findBrainConfig(starts: string[], envRoot: string | undefined): BrainConfig | null`
  - `brainStarts(): string[]`
  - `brainConfig(): BrainConfig`
  - Test-Helfer: `BRAIN_YML`, `emptyDir()`, `projectWithBrain(path = 'knowledge'): { repo: string; brain: string }`; `makeBrain` legt immer `brain.yml` (`path: .`, `mode: project`) an.

- [ ] **Step 1: Test-Helfer anpassen**

In `scripts/test/helpers.ts` Importe ergänzen (`cpSync` zu `node:fs`) und folgendes ändern/ergänzen:

```ts
export const BRAIN_YML = 'path: .\nmode: project\n';

export function emptyDir(): string {
    return mkdtempSync(join(tmpdir(), 'empty-'));
}

export function makeBrain(files: Record<string, string> = {}, parent = tmpdir()): string {
    const root = mkdtempSync(join(parent, 'brain-'));
    writeFile(root, 'brain.yml', BRAIN_YML);
    for (const [rel, content] of Object.entries(files)) {
        writeFile(root, rel, content);
    }
    return root;
}

/** Project repository (not yet a git repo) with brain.yml at its root and the valid test brain in <path>. */
export function projectWithBrain(path = 'knowledge'): { repo: string; brain: string } {
    const repo = mkdtempSync(join(tmpdir(), 'project-'));
    writeFile(repo, 'brain.yml', `path: ${JSON.stringify(path)}\nmode: project\n`);
    writeFile(repo, 'README.md', '# Project\n');
    const source = validBrain();
    const brain = join(repo, path);
    cpSync(source, brain, { recursive: true });
    rmSync(join(brain, 'brain.yml'));
    return { repo, brain };
}
```

- [ ] **Step 2: Failing Tests schreiben**

`scripts/test/root.test.ts` löschen (`git rm scripts/test/root.test.ts`). Neu `scripts/test/config.test.ts`:

```ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBrainConfig, formatBrainConfig, loadBrainConfig } from '../src/config.ts';
import { CATEGORIES, emptyDir, makeBrain, projectWithBrain, runCli, writeFile } from './helpers.ts';

test('loadBrainConfig reads path and mode', () => {
    const { repo, brain } = projectWithBrain();
    assert.deepEqual(loadBrainConfig(repo), { configRoot: repo, brainDir: brain, path: 'knowledge', mode: 'project' });
});

test('loadBrainConfig accepts "." and round-trips formatBrainConfig', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', formatBrainConfig('docs/Mein Wissen', 'private'));
    assert.deepEqual(loadBrainConfig(dir), { configRoot: dir, brainDir: join(dir, 'docs', 'Mein Wissen'), path: 'docs/Mein Wissen', mode: 'private' });
    writeFile(dir, 'brain.yml', formatBrainConfig('.', 'project'));
    assert.equal(loadBrainConfig(dir).brainDir, dir);
});

const invalid: Array<[string, string, RegExp]> = [
    ['path outside', 'path: ../elsewhere\nmode: project\n', /liegt außerhalb/],
    ['absolute path outside', 'path: /tmp\nmode: project\n', /liegt außerhalb/],
    ['unknown mode', 'path: .\nmode: public\n', /mode muss project oder private sein/],
    ['unknown key', 'path: .\nmode: project\nlanguage: de\n', /unbekannter Schlüssel „language“/],
    ['missing path', 'mode: project\n', /path fehlt/],
    ['not a mapping', '- a\n', /path und mode fehlen/],
];
for (const [label, content, error] of invalid) {
    test(`loadBrainConfig rejects: ${label}`, () => {
        const dir = emptyDir();
        writeFile(dir, 'brain.yml', content);
        assert.throws(() => loadBrainConfig(dir), error);
    });
}

test('findBrainConfig walks up from a project subdirectory and from the knowledge folder', () => {
    const { repo, brain } = projectWithBrain();
    mkdirSync(join(repo, 'src', 'app'), { recursive: true });
    assert.equal(findBrainConfig([join(repo, 'src', 'app')], undefined)?.brainDir, brain);
    assert.equal(findBrainConfig([join(brain, 'wiki', 'technik')], undefined)?.brainDir, brain);
});

test('findBrainConfig prefers BRAIN_ROOT and tries further starts', () => {
    const { repo, brain } = projectWithBrain();
    const other = makeBrain();
    assert.equal(findBrainConfig([other], repo)?.brainDir, brain);
    assert.equal(findBrainConfig([emptyDir(), other], undefined)?.brainDir, other);
    assert.equal(findBrainConfig([emptyDir()], undefined), null);
});

test('findBrainConfig fails when BRAIN_ROOT has no brain.yml', () => {
    assert.throws(() => findBrainConfig([], emptyDir()), /enthält keine brain\.yml/);
});

test('cli finds a project knowledge folder from a project subdirectory without BRAIN_ROOT', () => {
    const { repo, brain } = projectWithBrain();
    mkdirSync(join(repo, 'src', 'app'), { recursive: true });
    const result = runCli(brain, ['category', 'list'], '', join(repo, 'src', 'app'), { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /gesundheit – Gesundheit/);
});

test('cli without a knowledge folder fails clearly, help still works', () => {
    const empty = emptyDir();
    const fail = runCli(empty, ['check'], '', empty, { BRAIN_ROOT: '' });
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /Kein Wissens-Ordner gefunden – im Repository ausführen oder BRAIN_ROOT setzen\./);
    assert.equal(runCli(empty, ['help'], '', empty, { BRAIN_ROOT: '' }).status, 0);
});

test('makeBrain brains work with BRAIN_ROOT', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES });
    assert.equal(runCli(root, ['category', 'list']).status, 0);
});
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `Cannot find module '../src/config.ts'`.

- [ ] **Step 4: `config.ts` implementieren**

`scripts/src/config.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { callerDir, relativeInside } from './paths.ts';

export const CONFIG_FILE = 'brain.yml';
export const BRAIN_MODES = ['project', 'private'] as const;
export type BrainMode = (typeof BRAIN_MODES)[number];

export interface BrainConfig {
    /** Directory that contains brain.yml (root of the knowledge repository). */
    configRoot: string;
    /** Knowledge folder with categories.yml, wiki/, archive/ and inbox/. */
    brainDir: string;
    /** Knowledge folder relative to configRoot (posix), "." for configRoot itself. */
    path: string;
    mode: BrainMode;
}

const KEYS = ['path', 'mode'];

function isMode(value: unknown): value is BrainMode {
    return typeof value === 'string' && (BRAIN_MODES as readonly string[]).includes(value);
}

export function loadBrainConfig(configRoot: string): BrainConfig {
    const root = resolve(configRoot);
    const file = join(root, CONFIG_FILE);
    let data: unknown;
    try {
        data = parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${file}: ${(error as Error).message}`);
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`${file}: path und mode fehlen`);
    }
    const record = data as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (!KEYS.includes(key)) {
            throw new Error(`${file}: unbekannter Schlüssel „${key}“`);
        }
    }
    if (typeof record.path !== 'string' || record.path.trim() === '') {
        throw new Error(`${file}: path fehlt`);
    }
    if (!isMode(record.mode)) {
        throw new Error(`${file}: mode muss project oder private sein`);
    }
    const brainDir = resolve(root, record.path);
    const path = brainDir === root ? '.' : relativeInside(root, brainDir);
    if (path === null) {
        throw new Error(`${file}: path „${record.path}“ liegt außerhalb von ${root}`);
    }
    return { configRoot: root, brainDir, path, mode: record.mode };
}

export function formatBrainConfig(path: string, mode: BrainMode): string {
    return `# Brain configuration. Created by brain init.\n${stringify({ path, mode })}`;
}

/** Returns the nearest directory at or above start that contains brain.yml, or null. */
export function findConfigRoot(start: string): string | null {
    let dir = resolve(start);
    for (;;) {
        if (existsSync(join(dir, CONFIG_FILE))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/** BRAIN_ROOT (directory with brain.yml) wins; otherwise the first brain.yml found walking up from each start. */
export function findBrainConfig(starts: string[], envRoot: string | undefined): BrainConfig | null {
    if (envRoot !== undefined && envRoot !== '') {
        const root = resolve(envRoot);
        if (!existsSync(join(root, CONFIG_FILE))) {
            throw new Error(`BRAIN_ROOT (${root}) enthält keine ${CONFIG_FILE}`);
        }
        return loadBrainConfig(root);
    }
    for (const start of starts) {
        const root = findConfigRoot(start);
        if (root !== null) {
            return loadBrainConfig(root);
        }
    }
    return null;
}

export function brainStarts(): string[] {
    return [callerDir(), process.env.CLAUDE_PROJECT_DIR]
        .filter((start): start is string => start !== undefined && start !== '');
}

export function brainConfig(): BrainConfig {
    const config = findBrainConfig(brainStarts(), process.env.BRAIN_ROOT);
    if (config === null) {
        throw new Error('Kein Wissens-Ordner gefunden – im Repository ausführen oder BRAIN_ROOT setzen.');
    }
    return config;
}
```

In `scripts/src/paths.ts` die Funktionen `findBrainRoot` und `brainRoot` löschen (und die dadurch ungenutzten Importe `existsSync`, `dirname` entfernen, sofern nicht mehr verwendet – `existsExactCase` nutzt `readdirSync`, `join`).

- [ ] **Step 5: CLI umstellen**

In `scripts/src/cli.ts`:
- Import `brainRoot` aus `./paths.ts` entfernen, `import { brainConfig } from './config.ts';` ergänzen.
- `const root = command === 'init' ? '' : brainRoot();` ersetzen durch:

```ts
    const config = command === 'init' ? null : brainConfig();
    const root = config?.brainDir ?? '';
```

- Im `init --update`-Zweig `const updateRoot = brainRoot();` ersetzen durch `const updateRoot = brainConfig().brainDir;`.

- [ ] **Step 6: Übergang in `init.ts`**

Damit bis Task 5 mit `initBrain` erzeugte Brains gefunden werden: in `initBrain` direkt nach `updateBrainConfig(root, templateDir);` einfügen:

```ts
    writeFileSync(join(root, CONFIG_FILE), formatBrainConfig('.', 'private'));
```

mit `import { CONFIG_FILE, formatBrainConfig } from './config.ts';`.

- [ ] **Step 7: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS. Schlägt ein bestehender Test fehl, weil er ein leeres Verzeichnis per `makeBrain()` erwartet, dort `emptyDir()` verwenden.

- [ ] **Step 8: Commit**

```bash
git add -A scripts
git commit -m "feat: find the knowledge folder via brain.yml (path, mode)"
```

---

### Task 2: Git im Wissens-Ordner als Unterordner, Modus in `brain check`

**Files:**
- Modify: `scripts/src/git.ts`
- Modify: `scripts/src/guard.ts:5-13`
- Modify: `scripts/src/check.ts` (`checkBrain`)
- Modify: `scripts/src/cli.ts` (`check`-Zweig)
- Modify: `scripts/test/guard.test.ts`
- Test: `scripts/test/subfolder.test.ts` (neu)

**Interfaces:**
- Consumes: `BrainMode` (Task 1), `projectWithBrain(path?)`, `initGit()`.
- Produces:
  - `uncommittedChanges(root: string): string[]` (Pfade relativ zum Wissens-Ordner)
  - `checkBrain(root: string, mode: BrainMode = 'project'): CheckReport`
  - `PUSH_GUARD_MARKER = '# brain: this repository must never be pushed.'`

- [ ] **Step 1: Failing Tests schreiben**

`scripts/test/subfolder.test.ts`:

```ts
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { uncommittedChanges } from '../src/git.ts';
import { GARMIN, git, initGit, projectWithBrain, writeFile } from './helpers.ts';

const cases: Array<[string, (brain: string) => void, RegExp | null]> = [
    ['modified file', (brain) => writeFile(brain, `${GARMIN}.md`, 'geändert\n'), new RegExp(`^archive: ${GARMIN}\\.md wurde verändert$`, 'm')],
    ['deleted file', (brain) => rmSync(join(brain, `${GARMIN}.md`)), new RegExp(`^archive: ${GARMIN}\\.md wurde gelöscht`, 'm')],
    ['identical git mv', (brain) => {
        mkdirSync(join(brain, 'archive/technik/2026/11'), { recursive: true });
        git(brain, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
    }, null],
    ['git mv with change', (brain) => {
        mkdirSync(join(brain, 'archive/technik/2026/11'), { recursive: true });
        git(brain, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
        writeFile(brain, 'archive/technik/2026/11/x.md', 'anders\n');
    }, new RegExp(`^archive: ${GARMIN}\\.md → archive/technik/2026/11/x\\.md mit Inhaltsänderung umbenannt$`, 'm')],
];
for (const [label, mutate, error] of cases) {
    test(`archive integrity in a knowledge subfolder: ${label}`, () => {
        const { repo, brain } = projectWithBrain();
        initGit(repo);
        mutate(brain);
        const errors = checkBrain(brain).errors.filter((e) => e.startsWith('archive: '));
        if (error === null) {
            assert.deepEqual(errors, []);
        } else {
            assert.match(errors.join('\n'), error);
        }
    });
}

test('uncommittedChanges lists only changes inside the knowledge folder', () => {
    const { repo, brain } = projectWithBrain();
    initGit(repo);
    writeFile(repo, 'src/app.ts', 'x');
    assert.deepEqual(uncommittedChanges(brain), []);
    writeFile(brain, 'wiki/technik/neu.md', 'x');
    assert.deepEqual(uncommittedChanges(brain), ['wiki/technik/neu.md']);
    assert.match(checkBrain(brain).hints.join('\n'), /Nicht committete Änderungen im Wissens-Ordner \(1 Datei\(en\)\) – prüfen und committen/);
});

test('project mode ignores remotes and the push guard', () => {
    const { repo, brain } = projectWithBrain();
    initGit(repo);
    git(repo, 'config', '--unset', 'core.hooksPath');
    git(repo, 'remote', 'add', 'origin', 'https://example.com/x.git');
    assert.deepEqual(checkBrain(brain, 'project').errors, []);
    assert.match(checkBrain(brain, 'private').errors.join('\n'), /hat ein Remote \(origin\)/);
});
```

In `scripts/test/guard.test.ts` jeden Aufruf `checkBrain(root)` durch `checkBrain(root, 'private')` ersetzen.

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `uncommittedChanges` nicht exportiert; Archivfehler enthalten `knowledge/archive/…`.

- [ ] **Step 3: `git.ts` implementieren**

`scripts/src/git.ts` – Importe und neue Hilfsfunktionen:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { toPosix } from './paths.ts';
```

```ts
function repoTop(root: string): string {
    return git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
}

/** Converts a path relative to the repository top into a path relative to the knowledge folder. */
function brainRelative(root: string, top: string): (path: string) => string {
    const base = realpathSync(root);
    return (path) => toPosix(relative(base, join(top, path)));
}

/** Changed or untracked (not ignored) files inside the knowledge folder, relative to it. */
export function uncommittedChanges(root: string): string[] {
    const toBrain = brainRelative(root, repoTop(root));
    const output = git(root, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', '.']).toString('utf8');
    return output.split('\0').filter((token) => token !== '').map((token) => toBrain(token.slice(3)));
}
```

`archiveIntegrityErrors` so ändern (Pfade aus `git status` sind relativ zum Repo-Top; `HEAD:<pfad>` ebenfalls):

```ts
export function archiveIntegrityErrors(root: string): string[] {
    if (!hasHead(root)) {
        return [];
    }
    const top = repoTop(root);
    const toBrain = brainRelative(root, top);
    const output = git(root, ['status', '--porcelain=v1', '-z', '--find-renames', '--untracked-files=no', '--', 'archive']).toString('utf8');
    const tokens = output.split('\0').filter((token) => token !== '');
    const errors: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const status = tokens[i].slice(0, 2);
        const path = tokens[i].slice(3);
        if (status[0] === 'R' || status[0] === 'C') {
            const from = tokens[++i];
            const original = git(root, ['show', `HEAD:${from}`]);
            const current = existsSync(join(top, path)) ? readFileSync(join(top, path)) : Buffer.alloc(0);
            if (!original.equals(current)) {
                errors.push(`archive: ${toBrain(from)} → ${toBrain(path)} mit Inhaltsänderung umbenannt`);
            }
        } else if (status.includes('D')) {
            errors.push(`archive: ${toBrain(path)} wurde gelöscht (Verschieben nur per brain recategorize)`);
        } else if (status.includes('M') || status.includes('T')) {
            errors.push(`archive: ${toBrain(path)} wurde verändert`);
        }
    }
    return errors;
}
```

- [ ] **Step 4: Push-Schutz nur privat, Hinweis auf Uncommittetes**

`scripts/src/guard.ts`:

```ts
export const PUSH_GUARD_MARKER = '# brain: this repository must never be pushed.';

const HOOK = [
    '#!/bin/sh',
    PUSH_GUARD_MARKER,
    'echo "Brain: Dieses Repository ist privat (mode: private) und darf nicht gepusht werden." >&2',
    'exit 1',
    '',
].join('\n');
```

`scripts/src/check.ts`: Import `import type { BrainMode } from './config.ts';` und `uncommittedChanges` aus `./git.ts`; Signatur und Git-Block:

```ts
export function checkBrain(root: string, mode: BrainMode = 'project'): CheckReport {
```

```ts
    if (isGitRepo(root)) {
        errors.push(...archiveIntegrityErrors(root));
        if (mode === 'private') {
            errors.push(...pushGuardErrors(root));
        }
        const changed = uncommittedChanges(root);
        if (changed.length > 0) {
            hints.push(`Nicht committete Änderungen im Wissens-Ordner (${changed.length} Datei(en)) – prüfen und committen`);
        }
    } else {
        hints.push('Kein Git-Repository – Archiv-Integrität wurde nicht geprüft.');
    }
```

`scripts/src/cli.ts`, `check`-Zweig: `const report = checkBrain(root, config?.mode);`

- [ ] **Step 5: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS (der bestehende Test „push is rejected by the hook“ prüft `/darf nicht gepusht werden/` und passt weiter).

- [ ] **Step 6: Commit**

```bash
git add -A scripts
git commit -m "feat: support knowledge folders in a repository subfolder; push guard only in private mode"
```

---

### Task 3: Suchstufe, eindeutiger qmd-Indexname, `qmd setup`/`mcp` je Stufe

**Files:**
- Create: `scripts/src/search.ts`
- Modify: `scripts/src/qmd.ts`
- Modify: `scripts/src/cli.ts` (`qmd`-Zweig, `init`-Zweig ruft `setupQmd` mit Stufe)
- Modify: `scripts/test/qmd.test.ts`
- Test: `scripts/test/search.test.ts` (neu)

**Interfaces:**
- Consumes: `findConfigRoot` (Task 1).
- Produces:
  - `type SearchLevel = 'hybrid' | 'keyword' | 'off'`, `SEARCH_LEVELS`
  - `searchLevel(value: string | undefined = process.env.BRAIN_SEARCH): SearchLevel`
  - `qmdIndexName(root: string): string` (neues Schema)
  - `qmdConfigDir(): string`, `qmdCacheDir(): string`
  - `setupQmd(root: string, level: Exclude<SearchLevel, 'off'>): void`
  - `runQmd` gibt `INDEX_PATH` nie an qmd weiter.

- [ ] **Step 1: Failing Tests schreiben**

`scripts/test/search.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchLevel } from '../src/search.ts';

const valid: Array<[string | undefined, string]> = [
    [undefined, 'hybrid'],
    ['', 'hybrid'],
    ['hybrid', 'hybrid'],
    ['keyword', 'keyword'],
    ['Keyword', 'keyword'],
    [' off ', 'off'],
];
for (const [input, expected] of valid) {
    test(`searchLevel(${JSON.stringify(input)}) is ${expected}`, () => {
        assert.equal(searchLevel(input), expected);
    });
}

test('searchLevel rejects unknown values', () => {
    assert.throws(() => searchLevel('fast'), /BRAIN_SEARCH=fast ist ungültig – erlaubt: hybrid, keyword, off/);
});
```

In `scripts/test/qmd.test.ts`:
- Import ergänzen: `import { slugify } from '../src/slug.ts';` und `projectWithBrain` aus `./helpers.ts`; `basename` bleibt.

In `scripts/test/helpers.ts` direkt nach den Importen ergänzen, damit Umgebungswerte des Entwicklers keine Tests beeinflussen:

```ts
delete process.env.BRAIN_SEARCH;
delete process.env.INDEX_PATH;
```
- Die Tests „qmdIndexName derives from the root folder name“ und „qmdConfigPath honors QMD_CONFIG_DIR“ ersetzen durch:

```ts
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
```

- Im Test „setupQmd creates collections…“ den Aufruf `setupQmd(root);` durch `setupQmd(root, 'hybrid');` ersetzen.
- Neue Tests anhängen:

```ts
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
```

`existsSync` zum `node:fs`-Import der Datei ergänzen.

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `../src/search.ts` fehlt; Indexname ohne Hash.

- [ ] **Step 3: `search.ts` implementieren**

```ts
export const SEARCH_LEVELS = ['hybrid', 'keyword', 'off'] as const;
export type SearchLevel = (typeof SEARCH_LEVELS)[number];

/** Search level of this machine from BRAIN_SEARCH; default hybrid. */
export function searchLevel(value: string | undefined = process.env.BRAIN_SEARCH): SearchLevel {
    const level = (value ?? '').trim().toLowerCase();
    if (level === '') {
        return 'hybrid';
    }
    if (!(SEARCH_LEVELS as readonly string[]).includes(level)) {
        throw new Error(`BRAIN_SEARCH=${value} ist ungültig – erlaubt: ${SEARCH_LEVELS.join(', ')}`);
    }
    return level as SearchLevel;
}
```

- [ ] **Step 4: `qmd.ts` anpassen**

Importe:

```ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { findConfigRoot } from './config.ts';
import type { SearchLevel } from './search.ts';
import { slugify } from './slug.ts';
```

Ersetzen von `qmdIndexName`, `qmdConfigPath`, `runQmd`:

```ts
function realPath(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
}

/** brain-<repository folder>-<first 8 hex chars of sha256 over the real knowledge folder path>. */
export function qmdIndexName(root: string): string {
    const repo = findConfigRoot(root) ?? root;
    const hash = createHash('sha256').update(realPath(root)).digest('hex').slice(0, 8);
    return `brain-${slugify(basename(repo))}-${hash}`;
}

/** Same rules as qmd: QMD_CONFIG_DIR, then $XDG_CONFIG_HOME/qmd, then ~/.config/qmd. */
export function qmdConfigDir(): string {
    return process.env.QMD_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'qmd');
}

/** Same rules as qmd: $XDG_CACHE_HOME/qmd, then ~/.cache/qmd. */
export function qmdCacheDir(): string {
    return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'qmd');
}

export function qmdConfigPath(root: string): string {
    return join(qmdConfigDir(), `${qmdIndexName(root)}.yml`);
}

/** Runs qmd with the index of this knowledge folder; INDEX_PATH is never passed on. */
export function runQmd(root: string, args: string[], stdio: 'inherit' | 'ignore' = 'inherit'): number {
    const env = { ...process.env };
    delete env.INDEX_PATH;
    const result = spawnSync('qmd', ['--index', qmdIndexName(root), ...args], { cwd: root, stdio, env });
    if (result.error !== undefined) {
        throw new Error('qmd nicht gefunden – Installation: npm install -g @tobilu/qmd');
    }
    return result.status ?? 1;
}
```

`setupQmd`:

```ts
/** (Re)creates the wiki and archive collections of this knowledge folder's qmd index; hybrid also sets the model and embeds. */
export function setupQmd(root: string, level: Exclude<SearchLevel, 'off'>): void {
    mkdirSync(join(root, 'wiki'), { recursive: true });
    mkdirSync(join(root, 'archive'), { recursive: true });
    runQmd(root, ['collection', 'remove', 'wiki'], 'ignore');
    runQmd(root, ['collection', 'remove', 'archive'], 'ignore');
    mustRunQmd(root, ['collection', 'add', join(root, 'wiki'), '--name', 'wiki', '--mask', '*/*.md']);
    mustRunQmd(root, ['collection', 'add', join(root, 'archive'), '--name', 'archive', '--mask', '**/*.md']);
    mustRunQmd(root, ['context', 'add', 'qmd://wiki', WIKI_CONTEXT]);
    mustRunQmd(root, ['context', 'add', 'qmd://archive', ARCHIVE_CONTEXT]);
    if (level === 'hybrid') {
        setEmbedModel(root);
    }
    mustRunQmd(root, ['update']);
    if (level === 'hybrid') {
        mustRunQmd(root, ['embed']);
    }
}
```

- [ ] **Step 5: CLI anpassen**

`scripts/src/cli.ts`: `import { searchLevel } from './search.ts';` und der `qmd`-Zweig:

```ts
        case 'qmd': {
            const level = searchLevel();
            if (rest.length === 1 && rest[0] === 'setup') {
                if (level === 'off') {
                    console.log('BRAIN_SEARCH=off – qmd wird nicht eingerichtet.');
                    return 0;
                }
                setupQmd(root, level);
                console.log(`qmd-Index eingerichtet (${level})`);
                return 0;
            }
            if (rest.length === 0) {
                throw new Error('Verwendung: brain qmd setup | brain qmd prune [--yes] | brain qmd <qmd-argumente>');
            }
            if (rest[0] === 'mcp' && level === 'off') {
                throw new Error('BRAIN_SEARCH=off – qmd-MCP-Server bitte über /mcp deaktivieren');
            }
            return runQmd(root, rest);
        }
```

Im `init`-Zweig `setupQmd(created);` durch `setupQmd(created, 'hybrid');` ersetzen (wird in Task 5 komplett neu geschrieben).

- [ ] **Step 6: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS. Der bestehende Test „check hints when the qmd index of the brain is missing“ erwartet noch `brain-<ordnername>` – Regex auf `qmdIndexName(root)` umstellen:

```ts
    assert.match(hints, new RegExp(`qmd-Index für diesen Wissens-Ordner fehlt \\(${qmdIndexName(root)}\\) – brain qmd setup ausführen`));
```

- [ ] **Step 7: Commit**

```bash
git add -A scripts
git commit -m "feat: BRAIN_SEARCH levels and unique qmd index names per knowledge folder"
```

---

### Task 4: qmd-Prüfungen in `brain check` und `brain qmd prune`

**Files:**
- Modify: `scripts/src/qmd.ts`
- Modify: `scripts/src/check.ts`
- Modify: `scripts/src/cli.ts`
- Create: `scripts/src/prompt.ts`
- Test: `scripts/test/qmd-check.test.ts` (neu), `scripts/test/prune.test.ts` (neu)

**Interfaces:**
- Consumes: `searchLevel`, `SearchLevel`, `qmdIndexName`, `qmdConfigDir`, `qmdCacheDir`, `QMD_EMBED_MODEL` (Task 3).
- Produces:
  - `qmdCheck(root: string, level: SearchLevel): { errors: string[]; hints: string[] }`
  - `interface OrphanIndex { name: string; path: string }`, `findOrphanIndexes(): OrphanIndex[]`, `removeIndex(name: string): void`
  - `checkBrain(root: string, mode: BrainMode = 'project', level: SearchLevel = searchLevel()): CheckReport`
  - `promptLine(question: string): string` (synchron, liest eine Zeile von stdin)

- [ ] **Step 1: Failing Tests schreiben**

`scripts/test/qmd-check.test.ts`:

```ts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify } from 'yaml';
import { QMD_EMBED_MODEL, qmdCheck, qmdIndexName } from '../src/qmd.ts';
import { emptyDir, validBrain } from './helpers.ts';

function withConfig(root: string, content: object | null): void {
    const dir = mkdtempSync(join(tmpdir(), 'qmd-config-'));
    process.env.QMD_CONFIG_DIR = dir;
    if (content !== null) {
        writeFileSync(join(dir, `${qmdIndexName(root)}.yml`), stringify(content));
    }
}

function collections(root: string, wiki = join(root, 'wiki'), archive = join(root, 'archive')): object {
    return { collections: { wiki: { path: wiki, pattern: '*/*.md' }, archive: { path: archive, pattern: '**/*.md' } } };
}

const cases: Array<[string, 'hybrid' | 'keyword' | 'off', (root: string) => object | null, RegExp | null, RegExp | null]> = [
    ['missing config hints', 'hybrid', () => null, null, /qmd-Index für diesen Wissens-Ordner fehlt/],
    ['missing config ignored when off', 'off', () => null, null, null],
    ['foreign wiki path is an error', 'keyword', (root) => collections(root, emptyDir()), /Collection wiki zeigt auf .* statt /, null],
    ['matching keyword index is fine', 'keyword', (root) => collections(root), null, null],
    ['hybrid without model hints', 'hybrid', (root) => collections(root), null, /Embedding-Modell fehlt oder veraltet/],
    ['hybrid with model is fine', 'hybrid', (root) => ({ ...collections(root), models: { embed: QMD_EMBED_MODEL } }), null, null],
];
for (const [label, level, content, error, hint] of cases) {
    test(`qmdCheck: ${label}`, () => {
        const root = validBrain();
        withConfig(root, content(root));
        const report = qmdCheck(root, level);
        delete process.env.QMD_CONFIG_DIR;
        if (error === null) {
            assert.deepEqual(report.errors, []);
        } else {
            assert.match(report.errors.join('\n'), error);
        }
        if (hint === null) {
            assert.deepEqual(report.hints, []);
        } else {
            assert.match(report.hints.join('\n'), hint);
        }
    });
}
```

`scripts/test/prune.test.ts`:

```ts
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
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `qmdCheck` nicht exportiert; `qmd prune` sucht einen Wissens-Ordner („Kein Wissens-Ordner gefunden“).

- [ ] **Step 3: `qmd.ts` erweitern**

Importe ergänzen: `readdirSync`, `rmSync` aus `node:fs`; `parse` aus `yaml`.

```ts
function readYaml(file: string): unknown {
    try {
        return parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function field(value: unknown, ...keys: string[]): unknown {
    let current = value;
    for (const key of keys) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

/** Index checks for brain check: foreign collection paths are errors, everything else hints. */
export function qmdCheck(root: string, level: SearchLevel): { errors: string[]; hints: string[] } {
    const errors: string[] = [];
    const hints: string[] = [];
    if (level === 'off') {
        return { errors, hints };
    }
    const name = qmdIndexName(root);
    const file = qmdConfigPath(root);
    if (!existsSync(file)) {
        hints.push(`qmd-Index für diesen Wissens-Ordner fehlt (${name}) – brain qmd setup ausführen`);
        return { errors, hints };
    }
    const config = readYaml(file);
    for (const collection of ['wiki', 'archive']) {
        const path = field(config, 'collections', collection, 'path');
        const expected = join(root, collection);
        if (typeof path !== 'string') {
            hints.push(`qmd-Index ${name}: Collection ${collection} fehlt – brain qmd setup ausführen`);
        } else if (realPath(path) !== realPath(expected)) {
            errors.push(`qmd-Index ${name}: Collection ${collection} zeigt auf ${path} statt ${expected} – brain qmd setup ausführen`);
        }
    }
    if (level === 'hybrid' && field(config, 'models', 'embed') !== QMD_EMBED_MODEL) {
        hints.push(`qmd-Index ${name}: Embedding-Modell fehlt oder veraltet – brain qmd setup ausführen`);
    }
    return { errors, hints };
}

export interface OrphanIndex {
    name: string;
    path: string;
}

/** brain-* indexes whose wiki collection no longer exists. */
export function findOrphanIndexes(): OrphanIndex[] {
    const dir = qmdConfigDir();
    if (!existsSync(dir)) {
        return [];
    }
    const orphans: OrphanIndex[] = [];
    for (const file of readdirSync(dir).sort()) {
        if (!file.startsWith('brain-') || !file.endsWith('.yml')) {
            continue;
        }
        const path = field(readYaml(join(dir, file)), 'collections', 'wiki', 'path');
        if (typeof path !== 'string' || !existsSync(path)) {
            orphans.push({ name: file.slice(0, -'.yml'.length), path: typeof path === 'string' ? path : '(unbekannt)' });
        }
    }
    return orphans;
}

/** Deletes the config and the database files of a brain-* index. */
export function removeIndex(name: string): void {
    if (!name.startsWith('brain-')) {
        throw new Error(`Kein Brain-Index: ${name}`);
    }
    rmSync(join(qmdConfigDir(), `${name}.yml`), { force: true });
    for (const suffix of ['.sqlite', '.sqlite-shm', '.sqlite-wal']) {
        rmSync(join(qmdCacheDir(), `${name}${suffix}`), { force: true });
    }
}
```

- [ ] **Step 4: `checkBrain` nutzt `qmdCheck`**

`scripts/src/check.ts`: Importe `qmdCheck` (statt `qmdConfigPath`, `qmdIndexName`) und `import { searchLevel, type SearchLevel } from './search.ts';`. Signatur:

```ts
export function checkBrain(root: string, mode: BrainMode = 'project', level: SearchLevel = searchLevel()): CheckReport {
```

Den Block `if (!existsSync(qmdConfigPath(root))) { … }` ersetzen durch:

```ts
    const qmd = qmdCheck(root, level);
    errors.push(...qmd.errors);
    hints.push(...qmd.hints);
```

(Ist `existsSync` danach in `check.ts` ungenutzt, den Import entfernen.)

- [ ] **Step 5: `prompt.ts` und `qmd prune` im CLI**

`scripts/src/prompt.ts`:

```ts
import { readSync } from 'node:fs';

/** Reads one line from stdin synchronously (only call when stdin is a terminal). */
export function promptLine(question: string): string {
    process.stdout.write(question);
    const bytes: number[] = [];
    const buffer = Buffer.alloc(1);
    for (;;) {
        let read: number;
        try {
            read = readSync(0, buffer, 0, 1, null);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EAGAIN') {
                continue;
            }
            throw error;
        }
        if (read === 0 || buffer[0] === 0x0a) {
            break;
        }
        bytes.push(buffer[0]);
    }
    return Buffer.from(bytes).toString('utf8').replace(/\r$/, '').trim();
}
```

`scripts/src/cli.ts`:
- Importe: `findOrphanIndexes`, `removeIndex` aus `./qmd.ts`; `promptLine` aus `./prompt.ts`.
- Wissens-Ordner-Ermittlung: `prune` braucht keinen:

```ts
    const needsBrain = !(command === 'init' || (command === 'qmd' && rest[0] === 'prune'));
    const config = needsBrain ? brainConfig() : null;
    const root = config?.brainDir ?? '';
```

- Im `qmd`-Zweig vor `const level = searchLevel();` einfügen:

```ts
            if (rest[0] === 'prune') {
                return pruneIndexes(rest.slice(1));
            }
```

- Neue Funktion oberhalb von `run`:

```ts
function pruneIndexes(args: string[]): number {
    const { values } = parseArgs({ args, options: { yes: { type: 'boolean', default: false } } });
    const orphans = findOrphanIndexes();
    if (orphans.length === 0) {
        console.log('Nichts zu tun.');
        return 0;
    }
    console.log(['Verwaiste qmd-Indexe:', ...orphans.map((orphan) => `  - ${orphan.name} (${orphan.path})`)].join('\n'));
    let remove = values.yes === true;
    if (!remove) {
        if (process.stdin.isTTY !== true) {
            console.log('Ohne Terminal wird nichts gelöscht – brain qmd prune --yes');
            return 0;
        }
        remove = /^(y|yes|j|ja)$/i.test(promptLine('Löschen? [y/N] '));
    }
    if (!remove) {
        console.log('Nichts gelöscht.');
        return 0;
    }
    for (const orphan of orphans) {
        removeIndex(orphan.name);
    }
    console.log(`${orphans.length} Index(e) gelöscht.`);
    return 0;
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A scripts
git commit -m "feat: verify qmd collections per knowledge folder and add brain qmd prune"
```

---

### Task 5: `brain init` im Git-Repo, `--private`, Plugin-Aktivierung, Template verkleinern

**Files:**
- Modify: `scripts/src/init.ts` (vollständig neu)
- Create: `scripts/src/plugin.ts`
- Modify: `scripts/src/cli.ts` (`init`-Zweig)
- Modify: `template/CLAUDE.md`, `template/_gitignore`
- Move: `template/CLAUDE.md` (alter Inhalt) → `plugin/skills/brain/SKILL.md`, `template/wiki/CLAUDE.md` → `plugin/skills/brain/writing.md`, `template/.claude/commands/ingest.md` → `plugin/commands/ingest.md`, `template/.claude/commands/ask.md` → `plugin/commands/ask.md`
- Delete: `template/.mcp.json`
- Modify: `scripts/src/categories.ts:17` (Kommentarkopf), `scripts/test/review-fixes-2.test.ts:100`
- Modify: `scripts/test/init.test.ts` (vollständig neu), `scripts/test/template.test.ts`, `scripts/test/review-fixes-3.test.ts` (zwei alte `initBrain`-Tests entfernen)

**Interfaces:**
- Consumes: `CONFIG_FILE`, `formatBrainConfig`, `brainConfig`, `BrainMode` (Task 1); `installPushGuard`; `setupQmd`, `isQmdInstalled`, `searchLevel` (Task 3); `promptLine` (Task 4).
- Produces:
  - `interface InitOptions { cwd: string; path?: string; private: boolean; askPath?: () => string; templateDir?: string }`
  - `interface InitResult { configRoot: string; brainDir: string; mode: BrainMode; createdRepo: boolean }`
  - `initBrain(options: InitOptions): InitResult`
  - `updateBrainConfig(brainDir: string, mode: BrainMode, templateDir = TEMPLATE_DIR): string[]`
  - `PLUGIN_ID = 'brain@brain'`, `activatePlugin(configRoot: string): boolean`

- [ ] **Step 1: Dateien verschieben (Inhalt wird in Task 7 überarbeitet)**

```bash
mkdir -p plugin/skills/brain plugin/commands
git mv template/CLAUDE.md plugin/skills/brain/SKILL.md
git mv template/wiki/CLAUDE.md plugin/skills/brain/writing.md
git mv template/.claude/commands/ingest.md plugin/commands/ingest.md
git mv template/.claude/commands/ask.md plugin/commands/ask.md
git rm -q template/.mcp.json
rm -rf template/.claude template/wiki   # leere Ordner, die git mv zurücklässt
```

Neu `template/CLAUDE.md`:

```md
# Wissens-Ordner

Dieser Ordner enthält Wissen als Markdown-Dateien, gepflegt mit dem Claude-Code-Plugin `brain` und dem CLI `brain`.

- Regeln, Suchleiter und Befehle stehen im Skill `brain` des Plugins. Neue Notizen: `/brain:ingest`, Fragen: `/brain:ask`.
- Dateien nur über `/brain:ingest` bzw. `brain …` ändern. `INDEX.md`, `graph.json` und `LOG.md` nie bearbeiten.
- In `archive/` nie etwas ändern oder löschen.
```

`template/_gitignore` (vollständig):

```
INDEX.md
graph.json
LOG.md
inbox/*
!inbox/.gitkeep
.obsidian/
.claude/settings.local.json
```

`scripts/test/template.test.ts` (vollständig):

```ts
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const template = join(import.meta.dirname, '..', '..', 'template');
const read = (rel: string): string => readFileSync(join(template, rel), 'utf8');

test('template contains only the knowledge folder files', () => {
    assert.deepEqual(readdirSync(template).sort(), ['CLAUDE.md', '_gitattributes', '_gitignore']);
});

test('template files keep archive bytes and local files out of git', () => {
    assert.match(read('_gitattributes'), /^archive\/\*\* -text$/m);
    for (const line of ['INDEX.md', 'graph.json', 'LOG.md', 'inbox/*', '!inbox/.gitkeep']) {
        assert.match(read('_gitignore'), new RegExp(`^${line.replace(/[.*!]/g, '\\$&')}$`, 'm'), line);
    }
    assert.match(read('CLAUDE.md'), /Skill `brain`/);
});
```

Kommentarkopf von `categories.yml` ohne „Second Brain“: in `scripts/test/review-fixes-2.test.ts` die erwartete erste Zeile auf `'# Erlaubte Kategorien dieses Wissens-Ordners – nicht von Hand bearbeiten.\n'` ändern, dann in `scripts/src/categories.ts` die erste Zeile von `HEADER`:

```ts
    '# Erlaubte Kategorien dieses Wissens-Ordners – nicht von Hand bearbeiten.',
```

- [ ] **Step 2: Failing Tests für `initBrain` schreiben**

In `scripts/test/review-fixes-3.test.ts` die Tests „initBrain refuses an existing git repository with a remote and secrets“ und „initBrain accepts an existing empty directory“ löschen (ersetzt durch die neuen Tests) und ungenutzte Importe entfernen. Dann `grep -rn "initBrain\|updateBrainConfig" scripts/test` – außer `init.test.ts` darf nichts übrig sein.

`scripts/test/init.test.ts` (vollständig):

```ts
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { loadBrainConfig } from '../src/config.ts';
import { initBrain, type InitOptions, updateBrainConfig } from '../src/init.ts';
import { emptyDir, entry, git, LAUF, read, runCli, writeFile } from './helpers.ts';

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
    assert.deepEqual(result, { configRoot: repo, brainDir: join(repo, 'knowledge'), mode: 'project', createdRepo: false });
    assert.deepEqual(loadBrainConfig(repo), { configRoot: repo, brainDir: join(repo, 'knowledge'), path: 'knowledge', mode: 'project' });
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
    assert.deepEqual(result, { configRoot: dir, brainDir: dir, mode: 'private', createdRepo: true });
    assert.notEqual(hooksPath(dir), '');
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

const refusals: Array<[string, () => InitOptions, RegExp]> = [
    ['outside a git repository', () => ({ cwd: emptyDir(), path: 'knowledge', private: false }), /muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private/],
    ['an existing brain.yml', () => {
        const repo = project();
        writeFile(repo, 'brain.yml', 'path: .\nmode: project\n');
        return { cwd: repo, path: 'knowledge', private: false };
    }, /Hier gibt es bereits einen Wissens-Ordner/],
    ['a path outside the repository', () => ({ cwd: project(), path: '../elsewhere', private: false }), /liegt außerhalb des Repositorys/],
    ['"." in a project with .gitignore and CLAUDE.md', () => ({ cwd: project(), path: '.', private: false }), /\.gitignore existiert bereits/],
    ['a missing path without prompt', () => ({ cwd: project(), private: false }), /Pfad angeben: brain init \[--private\] <pfad>/],
    ['--private with a remote', () => {
        const repo = project();
        git(repo, 'remote', 'add', 'origin', 'https://example.com/x.git');
        return { cwd: repo, path: 'knowledge', private: true };
    }, /Privater Wissens-Ordner nur in einem Repository ohne Remote/],
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
    assert.deepEqual(updateBrainConfig(brainDir, 'project'), ['CLAUDE.md']);
    for (const [rel, bytes] of data) {
        assert.deepEqual(readFileSync(join(brainDir, rel)), bytes, rel);
    }
    assert.equal(hooksPath(repo), '');
});

test('updateBrainConfig reinstalls a removed push guard in private mode', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    git(dir, 'config', '--unset', 'core.hooksPath');
    updateBrainConfig(dir, 'private');
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});

function stubClaude(): { bin: string; log: string } {
    const bin = mkdtempSync(join(tmpdir(), 'claude-bin-'));
    const log = join(bin, 'calls.log');
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "$(pwd)|$*" >> "$CLAUDE_STUB_LOG"\n');
    chmodSync(join(bin, 'claude'), 0o755);
    return { bin, log };
}

test('cli init activates the plugin in project scope', () => {
    const repo = project();
    const { bin, log } = stubClaude();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: `${bin}:/usr/bin:/bin`, CLAUDE_STUB_LOG: log, BRAIN_SEARCH: 'off' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Wissens-Ordner angelegt: .*knowledge \(mode: project\)/);
    assert.match(result.stdout, /BRAIN_SEARCH=off – qmd wird nicht eingerichtet\./);
    assert.match(result.stdout, /Plugin brain@brain für dieses Projekt aktiviert\./);
    assert.match(result.stdout, /Änderungen prüfen und committen/);
    assert.equal(readFileSync(log, 'utf8'), `${repo}|plugin install brain@brain --scope project\n`);
});

test('cli init without claude and qmd prints hints', () => {
    const repo = project();
    const result = runCli(repo, ['init', 'knowledge'], '', repo, { BRAIN_ROOT: '', PATH: '/usr/bin:/bin', BRAIN_SEARCH: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /qmd nicht gefunden/);
    assert.match(result.stdout, /claude plugin install brain@brain --scope project/);
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
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `initBrain` erwartet noch einen Pfad-String.

- [ ] **Step 4: `init.ts` neu schreiben**

`scripts/src/init.ts` (vollständig):

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { saveCategories } from './categories.ts';
import { CONFIG_FILE, type BrainMode, formatBrainConfig } from './config.ts';
import { installPushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';
import { relativeInside } from './paths.ts';

export const TEMPLATE_DIR = resolve(import.meta.dirname, '..', '..', 'template');

const RENAMES: Record<string, string> = { _gitignore: '.gitignore', _gitattributes: '.gitattributes' };

/** Files and folders that must not exist in the target knowledge folder before init. */
const RESERVED = ['categories.yml', 'wiki', 'archive', 'inbox', '.gitignore', '.gitattributes', 'CLAUDE.md'];

export interface InitOptions {
    /** Directory brain init was called from. */
    cwd: string;
    /** Knowledge folder relative to the repository root; asked for when missing. */
    path?: string;
    private: boolean;
    askPath?: () => string;
    templateDir?: string;
}

export interface InitResult {
    configRoot: string;
    brainDir: string;
    mode: BrainMode;
    createdRepo: boolean;
}

/** Lists template files as [source path relative to template, target path relative to the knowledge folder]. */
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

function gitOutput(dir: string, args: string[]): string | null {
    try {
        return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
        return null;
    }
}

/** Copies changed template files into the knowledge folder, installs the push guard in private mode; returns changed paths. */
export function updateBrainConfig(brainDir: string, mode: BrainMode, templateDir = TEMPLATE_DIR): string[] {
    const changed: string[] = [];
    for (const [source, targetRel] of templateFiles(templateDir)) {
        const content = readFileSync(join(templateDir, source));
        const file = join(brainDir, targetRel);
        if (existsSync(file) && readFileSync(file).equals(content)) {
            continue;
        }
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
        changed.push(targetRel);
    }
    if (mode === 'private') {
        installPushGuard(brainDir);
    }
    return changed;
}

/** Creates brain.yml at the repository root and a new knowledge folder; never commits. */
export function initBrain(options: InitOptions): InitResult {
    const cwd = resolve(options.cwd);
    const mode: BrainMode = options.private ? 'private' : 'project';
    const top = gitOutput(cwd, ['rev-parse', '--show-toplevel']);
    if (top === null && !options.private) {
        throw new Error('brain init muss in einem Git-Repository laufen – für einen privaten Wissens-Ordner: brain init --private');
    }
    const configRoot = top ?? cwd;
    if (existsSync(join(configRoot, CONFIG_FILE))) {
        throw new Error(`Hier gibt es bereits einen Wissens-Ordner: ${join(configRoot, CONFIG_FILE)}`);
    }
    if (options.private && top !== null && (gitOutput(top, ['remote']) ?? '') !== '') {
        throw new Error('Privater Wissens-Ordner nur in einem Repository ohne Remote – Remote entfernen oder ohne --private anlegen');
    }
    const requested = options.path ?? options.askPath?.();
    if (requested === undefined || requested.trim() === '') {
        throw new Error('Pfad angeben: brain init [--private] <pfad>');
    }
    const brainDir = resolve(configRoot, requested.trim());
    const path = brainDir === configRoot ? '.' : relativeInside(configRoot, brainDir);
    if (path === null) {
        throw new Error(`${requested} liegt außerhalb des Repositorys ${configRoot}`);
    }
    for (const name of RESERVED) {
        if (existsSync(join(brainDir, name))) {
            throw new Error(`${name} existiert bereits in ${brainDir} – anderen Wissens-Ordner wählen`);
        }
    }
    const createdRepo = top === null;
    if (createdRepo) {
        execFileSync('git', ['-C', cwd, 'init', '-q'], { stdio: 'pipe' });
    }
    writeFileSync(join(configRoot, CONFIG_FILE), formatBrainConfig(path, mode));
    mkdirSync(brainDir, { recursive: true });
    updateBrainConfig(brainDir, mode, options.templateDir);
    for (const dir of ['inbox', 'archive', 'wiki']) {
        mkdirSync(join(brainDir, dir), { recursive: true });
    }
    writeFileSync(join(brainDir, 'inbox', '.gitkeep'), '');
    saveCategories(brainDir, []);
    runIndex(brainDir);
    return { configRoot, brainDir, mode, createdRepo };
}
```

Hinweis: `git rev-parse --show-toplevel` liefert den echten Pfad; liegt das Testverzeichnis hinter einem Symlink, unterscheiden sich `configRoot` und `repo`. Unter WSL (`/tmp`) ist das nicht der Fall. Schlägt der `deepEqual` in einer anderen Umgebung deswegen fehl, im Test `realpathSync(repo)` vergleichen.

- [ ] **Step 5: `plugin.ts` und CLI-`init`**

`scripts/src/plugin.ts`:

```ts
import { spawnSync } from 'node:child_process';

export const PLUGIN_ID = 'brain@brain';
export const PLUGIN_INSTALL_COMMAND = `claude plugin install ${PLUGIN_ID} --scope project`;

/** Enables the brain plugin for the project at configRoot; false if claude is missing or fails. */
export function activatePlugin(configRoot: string): boolean {
    const result = spawnSync('claude', ['plugin', 'install', PLUGIN_ID, '--scope', 'project'], { cwd: configRoot, stdio: 'ignore' });
    return result.error === undefined && result.status === 0;
}
```

`scripts/src/cli.ts`: Importe `activatePlugin`, `PLUGIN_INSTALL_COMMAND` aus `./plugin.ts`; `initBrain`, `updateBrainConfig` bleiben. Den `init`-Zweig vollständig ersetzen:

```ts
        case 'init': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: { update: { type: 'boolean', default: false }, private: { type: 'boolean', default: false } },
            });
            if (values.update === true) {
                if (positionals.length > 0 || values.private === true) {
                    throw new Error('Verwendung: brain init --update');
                }
                const current = brainConfig();
                const changed = updateBrainConfig(current.brainDir, current.mode);
                console.log(changed.length === 0
                    ? 'Konfiguration ist aktuell.'
                    : ['Aktualisiert (bitte prüfen und committen):', ...changed.map((rel) => `  - ${rel}`)].join('\n'));
                return 0;
            }
            if (positionals.length > 1) {
                throw new Error('Verwendung: brain init [--private] [<pfad>] | brain init --update');
            }
            const result = initBrain({
                cwd: callerDir(),
                path: positionals[0],
                private: values.private === true,
                askPath: process.stdin.isTTY === true ? () => promptLine('Wissens-Ordner [knowledge]: ') || 'knowledge' : undefined,
            });
            console.log(`Wissens-Ordner angelegt: ${result.brainDir} (mode: ${result.mode})`);
            if (result.createdRepo) {
                console.log(`Git-Repository angelegt: ${result.configRoot}`);
            }
            initQmd(result.brainDir);
            console.log(activatePlugin(result.configRoot)
                ? 'Plugin brain@brain für dieses Projekt aktiviert.'
                : `Hinweis: Plugin nicht aktiviert – im Repo ausführen: ${PLUGIN_INSTALL_COMMAND}`);
            console.log('Nächster Schritt: Änderungen prüfen und committen, dann Claude Code im Repo starten.');
            return 0;
        }
```

Neue Funktion oberhalb von `run`:

```ts
function initQmd(brainDir: string): void {
    const level = searchLevel();
    if (level === 'off') {
        console.log('BRAIN_SEARCH=off – qmd wird nicht eingerichtet.');
        return;
    }
    if (!isQmdInstalled()) {
        console.log('Hinweis: qmd nicht gefunden – später im Wissens-Ordner „brain qmd setup“ ausführen.');
        return;
    }
    try {
        setupQmd(brainDir, level);
        console.log(`qmd-Index eingerichtet (${level}).`);
    } catch (error) {
        console.log(`Hinweis: qmd-Einrichtung fehlgeschlagen (${(error as Error).message}) – später im Wissens-Ordner „brain qmd setup“ ausführen.`);
    }
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A scripts template plugin
git commit -m "feat: brain init inside a git repository (project default, --private), activate plugin, no commit"
```

---

### Task 6: `brain --version` und `brain session-start`

**Files:**
- Create: `scripts/src/version.ts`, `scripts/src/session.ts`
- Modify: `scripts/src/cli.ts`, `scripts/package.json` (`"version": "0.2.0"`, `"name": "brain-cli"`)
- Test: `scripts/test/session.test.ts` (neu)

**Interfaces:**
- Consumes: `findBrainConfig`, `brainStarts`, `BrainConfig` (Task 1); `searchLevel`, `SearchLevel` (Task 3).
- Produces:
  - `cliVersion(): string`
  - `pluginVersion(pluginRoot: string): string`
  - `sessionLines(config: BrainConfig, pluginRoot: string, level: SearchLevel): string[]`
  - `startBackgroundRefresh(config: BrainConfig, level: SearchLevel): void`
  - CLI: `brain --version`, `brain session-start <plugin-root>`

- [ ] **Step 1: `package.json` anpassen**

In `scripts/package.json` `"name": "brain-cli"` setzen und direkt darunter `"version": "0.2.0",` einfügen. `bin` bleibt `{ "brain": "src/cli.ts" }`.

- [ ] **Step 2: Failing Tests schreiben**

`scripts/test/session.test.ts`:

```ts
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { cliVersion } from '../src/version.ts';
import { emptyDir, projectWithBrain, runCli, writeFile } from './helpers.ts';

function pluginDir(version: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-'));
    mkdirSync(join(dir, '.claude-plugin'));
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), version === null ? '{kaputt' : JSON.stringify({ name: 'brain', version }));
    return dir;
}

function sessionStart(cwd: string, plugin: string, env: Record<string, string> = {}): ReturnType<typeof runCli> {
    return runCli(cwd, ['session-start', plugin], '', cwd, { BRAIN_ROOT: '', BRAIN_SEARCH: 'off', ...env });
}

test('brain --version prints the CLI version', () => {
    const result = runCli(emptyDir(), ['--version'], '', emptyDir(), { BRAIN_ROOT: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${cliVersion()}\n`);
    assert.equal(cliVersion(), '0.2.0');
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
    ['invalid BRAIN_SEARCH', '0.2.0', { BRAIN_SEARCH: 'fast' }, /brain: Hinweis – BRAIN_SEARCH=fast ist ungültig/],
];
for (const [label, version, env, expected] of warnings) {
    test(`session-start warns on ${label} and still exits 0`, () => {
        const { repo } = projectWithBrain();
        const result = sessionStart(repo, pluginDir(version), env);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, expected);
    });
}

for (const folder of ['knowledge', 'Mein Wissen']) {
    test(`session-start refreshes index and qmd in the background without waiting (${folder})`, async () => {
        const { repo, brain } = projectWithBrain(folder);
        const nested = join(repo, 'docs');
        writeFile(nested, 'x.md', 'x');
        const bin = mkdtempSync(join(tmpdir(), 'qmd-bin-'));
        const marker = join(bin, 'marker');
        writeFileSync(join(bin, 'qmd'), `#!/bin/sh\nsleep 5\necho "$*" > "${marker}"\n`);
        chmodSync(join(bin, 'qmd'), 0o755);
        const result = sessionStart(nested, pluginDir(cliVersion()), { BRAIN_SEARCH: 'keyword', PATH: `${bin}:/usr/bin:/bin` });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(marker), false, 'session-start must not wait for the refresh');
        for (let i = 0; i < 150 && !existsSync(marker); i++) {
            await sleep(100);
        }
        assert.match(readFileSync(marker, 'utf8'), /^--index brain-.* update\n$/);
        assert.ok(existsSync(join(brain, 'INDEX.md')));
    });
}
```

- [ ] **Step 3: Tests laufen lassen – müssen fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `../src/version.ts` fehlt.

- [ ] **Step 4: Implementieren**

`scripts/src/version.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function cliVersion(): string {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}
```

`scripts/src/session.ts`:

```ts
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrainConfig } from './config.ts';
import type { SearchLevel } from './search.ts';
import { cliVersion } from './version.ts';

const CLI = join(import.meta.dirname, 'cli.ts');

export function pluginVersion(pluginRoot: string): string {
    const data = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: unknown };
    if (typeof data.version !== 'string') {
        throw new Error('version fehlt');
    }
    return data.version;
}

/** Lines the SessionStart hook prints into Claude's context. */
export function sessionLines(config: BrainConfig, pluginRoot: string, level: SearchLevel): string[] {
    const folder = config.path === '.' ? './' : `${config.path}/`;
    const lines = [`Brain: ${folder} (mode: ${config.mode}, search: ${level})`];
    const cli = cliVersion();
    let plugin: string;
    try {
        plugin = pluginVersion(pluginRoot);
    } catch {
        lines.push(`Warnung: Plugin-Version nicht lesbar (${pluginRoot}) – claude plugin update brain@brain`);
        return lines;
    }
    if (plugin !== cli) {
        lines.push(`Warnung: Plugin ${plugin} und CLI ${cli} passen nicht zusammen – Klon aktualisieren (git pull) bzw. claude plugin update brain@brain.`);
    }
    return lines;
}

function quote(arg: string): string {
    return `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** Runs brain index (and qmd update unless off) in a detached process; returns immediately. */
export function startBackgroundRefresh(config: BrainConfig, level: SearchLevel): void {
    const brain = (...args: string[]): string => [process.execPath, '--disable-warning=ExperimentalWarning', CLI, ...args].map(quote).join(' ');
    const script = level === 'off' ? brain('index') : `${brain('index')} && ${brain('qmd', 'update')}`;
    const child = spawn('sh', ['-c', script], {
        cwd: config.brainDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, BRAIN_ROOT: config.configRoot },
    });
    child.unref();
}
```

`scripts/src/cli.ts`:
- Importe: `findBrainConfig`, `brainStarts` aus `./config.ts`; `sessionLines`, `startBackgroundRefresh` aus `./session.ts`; `cliVersion` aus `./version.ts`.
- Direkt nach dem `isHelp`-Block:

```ts
    if (command === '--version') {
        console.log(cliVersion());
        return 0;
    }
```

- `needsBrain` erweitern: `const needsBrain = !(command === 'init' || command === 'session-start' || (command === 'qmd' && rest[0] === 'prune'));`
- Neuer `case` vor `default`:

```ts
        case 'session-start': {
            try {
                const found = findBrainConfig(brainStarts(), process.env.BRAIN_ROOT);
                if (found === null) {
                    return 0;
                }
                const level = searchLevel();
                console.log(sessionLines(found, rest[0] ?? '', level).join('\n'));
                startBackgroundRefresh(found, level);
            } catch (error) {
                console.log(`Brain: Hinweis – ${(error as Error).message}`);
            }
            return 0;
        }
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A scripts
git commit -m "feat: brain --version and brain session-start for the plugin hook"
```

---

### Task 7: Plugin und Marketplace

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `plugin/.mcp.json`
- Modify (Inhalt neu): `plugin/skills/brain/SKILL.md`, `plugin/skills/brain/writing.md`, `plugin/commands/ingest.md`, `plugin/commands/ask.md`
- Test: `scripts/test/plugin.test.ts` (neu)

**Interfaces:**
- Consumes: `cliVersion()` (Task 6); CLI-Befehle `brain session-start`, `brain qmd mcp`.
- Produces: Plugin `brain` im Marketplace `brain`; Befehle `/brain:ingest`, `/brain:ask`; Skill `brain`.

- [ ] **Step 1: Failing Test schreiben**

`scripts/test/plugin.test.ts`:

```ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cliVersion } from '../src/version.ts';

const repo = join(import.meta.dirname, '..', '..');
const json = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(repo, rel), 'utf8')) as Record<string, unknown>;
const text = (rel: string): string => readFileSync(join(repo, rel), 'utf8');
const HOOK_COMMAND = 'if command -v brain >/dev/null 2>&1; then brain session-start "${CLAUDE_PLUGIN_ROOT}"; else echo "Brain: CLI brain fehlt – einmal ./install.sh aus dem brain-Klon ausführen"; fi';

test('hook prints a hint instead of failing when the brain CLI is missing', () => {
    const result = spawnSync('sh', ['-c', HOOK_COMMAND], { env: { PATH: '/nonexistent', CLAUDE_PLUGIN_ROOT: '/x' }, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'Brain: CLI brain fehlt – einmal ./install.sh aus dem brain-Klon ausführen\n');
});

test('marketplace lists the brain plugin from ./plugin', () => {
    assert.deepEqual(json('.claude-plugin/marketplace.json').plugins, [
        { name: 'brain', source: './plugin', description: 'Ingest notes into a condensed wiki and answer questions from it.' },
    ]);
    assert.equal(json('.claude-plugin/marketplace.json').name, 'brain');
});

test('plugin version equals the CLI version', () => {
    const plugin = json('plugin/.claude-plugin/plugin.json');
    assert.equal(plugin.name, 'brain');
    assert.equal(plugin.version, cliVersion());
});

test('plugin wires the hook and the qmd MCP server to the brain CLI', () => {
    assert.deepEqual(json('plugin/hooks/hooks.json'), {
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HOOK_COMMAND }] }] },
    });
    assert.deepEqual(json('plugin/.mcp.json'), { mcpServers: { qmd: { command: 'brain', args: ['qmd', 'mcp'] } } });
});

test('commands never commit or push and follow the search level', () => {
    for (const rel of ['plugin/commands/ingest.md', 'plugin/commands/ask.md', 'plugin/skills/brain/SKILL.md', 'plugin/skills/brain/writing.md']) {
        const content = text(rel);
        assert.doesNotMatch(content, /git add -A|git push/, rel);
        assert.doesNotMatch(content, /docs\/superpowers|Code-Repository `second-brain`/, rel);
    }
    assert.match(text('plugin/commands/ingest.md'), /Nicht committen/);
    assert.match(text('plugin/commands/ingest.md'), /`git status --porcelain -- \.`/);
    assert.match(text('plugin/skills/brain/SKILL.md'), /^name: brain$/m);
    for (const level of ['hybrid', 'keyword', 'off']) {
        assert.match(text('plugin/skills/brain/SKILL.md'), new RegExp(`\\| \`${level}\` \\|`), level);
    }
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npm --prefix scripts test`
Expected: FAIL – `.claude-plugin/marketplace.json` fehlt.

- [ ] **Step 3: Manifest-Dateien anlegen**

`.claude-plugin/marketplace.json`:

```json
{
  "name": "brain",
  "owner": { "name": "chris" },
  "plugins": [
    {
      "name": "brain",
      "source": "./plugin",
      "description": "Ingest notes into a condensed wiki and answer questions from it."
    }
  ]
}
```

`plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "brain",
  "version": "0.2.0",
  "description": "Ingest notes into a condensed wiki and answer questions from it. Requires the brain CLI (install.sh)."
}
```

`plugin/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "if command -v brain >/dev/null 2>&1; then brain session-start \"${CLAUDE_PLUGIN_ROOT}\"; else echo \"Brain: CLI brain fehlt – einmal ./install.sh aus dem brain-Klon ausführen\"; fi" }] }
    ]
  }
}
```

`plugin/.mcp.json`:

```json
{
  "mcpServers": {
    "qmd": { "command": "brain", "args": ["qmd", "mcp"] }
  }
}
```

- [ ] **Step 4: `SKILL.md` schreiben**

`plugin/skills/brain/SKILL.md` (vollständig):

````md
---
name: brain
description: Wissen aus dem Wissens-Ordner dieses Repositories nutzen und pflegen. Verwenden bei Fragen zu Projekt- oder persönlichem Wissen (Architektur- und Designentscheidungen, Fachbegriffe, Abläufe, „warum ist das so“, „was wissen wir über …“), wenn der Nutzer eine Notiz diktiert, und für /brain:ingest und /brain:ask.
---

# brain

brain legt Wissen als Markdown-Dateien in einem Wissens-Ordner dieses Repositories ab. Die Markdown-Dateien sind die einzige Wahrheit.

## Wo der Wissens-Ordner liegt

- Beim Sitzungsstart steht im Kontext eine Zeile wie `Brain: knowledge/ (mode: project, search: hybrid)`: Wissens-Ordner (relativ zum Repo-Root), Modus und Suchstufe. Fehlt sie: `brain check` ausführen; meldet es „Kein Wissens-Ordner gefunden“, gibt es hier keinen.
- Alle Pfade in diesem Skill sind relativ zum Wissens-Ordner. Shell-Befehle immer im Wissens-Ordner ausführen: `cd <Wissens-Ordner> && …`.
- Steht in der Kontextzeile eine Warnung (Versionen passen nicht, ungültige Suchstufe), den Nutzer einmal darauf hinweisen.

## Aufbau

- `inbox/` – Rohnotizen, die auf `/brain:ingest` warten (nicht in Git)
- `archive/<kategorie>/YYYY/MM/` – Originalnotizen, byte-identisch, nie ändern oder löschen
- `wiki/<kategorie>/<eintrag>.md` – verdichtete Wissenseinträge; Schreibregeln in [writing.md](writing.md)
- `categories.yml` – die einzigen erlaubten Kategorien; `_uncategorized` ist der reservierte Auffangordner
- `INDEX.md`, `graph.json` – abgeleitet von `brain index` (nicht in Git)
- `LOG.md` – Änderungsprotokoll, nur anhängen, nur über `brain` (nicht in Git)

## Feste Regeln

- Außerhalb von `/brain:ingest` den Wissens-Ordner nur lesen. Ausnahme: Diktiert der Nutzer im Chat eine Notiz, sie wörtlich als `inbox/chat-note.md` speichern (`chat-note-2.md`, … falls belegt) und den `/brain:ingest`-Ablauf ausführen.
- `INDEX.md` und `graph.json` nie bearbeiten – `brain index` ausführen.
- Nie direkt in `LOG.md` schreiben – `brain log` nutzen; die übrigen `brain`-Befehle protokollieren selbst.
- In `archive/` nie etwas ändern oder löschen. Verschieben nur per `brain recategorize`.
- Nie eine Kategorie ohne ausdrückliche Freigabe des Nutzers anlegen; angelegt wird nur mit `brain category add`, nie durch direktes Bearbeiten von `categories.yml`. Passt keine und wird keine freigegeben: `_uncategorized`.
- Nie committen und nie pushen – das macht der Nutzer. Bei `mode: private` zusätzlich nie ein Git-Remote anlegen (Push-Schutz per Hook; `brain check` meldet Verstöße).
- Sprache: Was eine Maschine auswertet, ist Englisch (Code, CLI, Datei- und Ordnernamen, Frontmatter-Felder, die Marker `## Related`, `## Sources`, `Conflict C-…`, `Unclear Q-…`, `Affects:`). Was der Nutzer liest (Titel, Summary, Fließtext, Callout-Text, Antworten), ist Deutsch.

## Suche je Suchstufe

| Stufe | Kandidaten finden (Collection `wiki`, außer ausdrücklich verlangt) |
|---|---|
| `hybrid` | `INDEX.md` und MCP-Tool `query` des Servers `qmd` mit `query: "<Frage>"`, `collections: ["wiki"]` |
| `keyword` | `INDEX.md` und MCP-Tool `query` mit `searches: [{type: "lex", query: "<Stichwörter>"}]`, `rerank: false`, `collections: ["wiki"]` |
| `off` | `INDEX.md` und Grep in `wiki/` |

Ist der MCP-Server nicht erreichbar: mit `INDEX.md` und Grep weiterarbeiten und den Nutzer informieren.

## Wissen-zuerst-Protokoll (Suchleiter)

Für jede Wissensfrage genau so vorgehen:

1. Keywords aus der Frage bestimmen.
2. Kandidaten gemäß Suchstufe scoren – noch KEINE Dateien öffnen.
3. Genau EINE Top-Datei öffnen.
4. Nur den relevanten Abschnitt lesen (Referenz-Map und Überschriften nutzen).
5. Höchstens EINEM Pointer folgen (`[[Link]]`, ein Eintrag aus `## Related` oder ein `sources`-Pfad).
6. Nur aus dem Gelesenen antworten, mit `[[…]]`-Quellenlinks. Reicht das nicht: „Dazu steht nichts im Wissen.“

Kommt eine Wissensfrage während anderer Arbeit (z. B. beim Programmieren) auf, dieselbe Suchleiter nutzen und die Fundstelle mit `[[…]]`-Link nennen; findet sich nichts, das kurz sagen und normal weiterarbeiten.

## CLI `brain`

| Befehl | Zweck |
|---|---|
| `brain archive <inbox-datei> --category <slug>` | Notiz ins Archiv verschieben, gibt den Archivpfad aus |
| `brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> [--related <eintrag> …] [--tags a,b] < body` | neuen Eintrag anlegen und Index neu erzeugen |
| `brain link <eintrag> <eintrag> […]` / `brain link --remove …` | gegenseitige `## Related`-Links setzen/entfernen |
| `brain log <op> <ziel> [<beschreibung>]` | Zeile an `LOG.md` anhängen (Ops: archive, create, update, link, unlink, conflict, resolve, recategorize, category, ingest) |
| `brain index` | `INDEX.md` und `graph.json` neu erzeugen |
| `brain check` | Fehler (Exit 1) und Hinweise (offene Punkte, Einträge ohne Kategorie, uncommittete Änderungen, qmd-Index) |
| `brain category add <slug> --name <name> [--description <text>]` | neue Kategorie registrieren – nur nach Freigabe durch den Nutzer |
| `brain category list` | Kategorien mit Anzahl der Einträge anzeigen |
| `brain recategorize --rename a b \| --merge a b \| --move <eintrag> <kategorie>` | nur auf Anweisung des Nutzers |
| `brain qmd setup` | qmd-Index dieses Wissens-Ordners gemäß Suchstufe einrichten |
| `brain qmd <argumente>` | qmd auf dem Index dieses Wissens-Ordners, z. B. `brain qmd update` |
| `brain help` | Übersicht aller Befehle (englisch) |

Einträge schreiben: [writing.md](writing.md).
````

- [ ] **Step 5: `writing.md` anpassen**

In `plugin/skills/brain/writing.md` genau diese Änderungen:
- Zeile 3 `Gilt für jede Datei in \`wiki/<kategorie>/\`. Format: Spec Abschnitt 4.3.` → `Gilt für jede Datei in \`wiki/<kategorie>/\` des Wissens-Ordners.`
- `(INDEX.md, qmd \`query\` auf \`wiki\`)` → `(Suchleiter im Skill, Schritt 1–2, gemäß Suchstufe)`
- `vorher prüfen, dass die ID frei ist: \`grep -rn "C-YYYYMMDD-" wiki/\`` → `vorher prüfen, dass die ID frei ist: \`cd <Wissens-Ordner> && grep -rn "C-YYYYMMDD-" wiki/\``
- `Links immer als vollständiger Pfad ab Repo-Wurzel ohne \`.md\`` → `Links immer als vollständiger Pfad ab Wissens-Ordner ohne \`.md\``

- [ ] **Step 6: `ingest.md` schreiben**

`plugin/commands/ingest.md` (vollständig):

````md
---
description: Alle Notizen aus der Inbox ins Wiki einarbeiten
argument-hint: [Notiztext, der vorher aufgenommen wird]
---

Verarbeite die Inbox gemäß Skill `brain` (Regeln, Suchleiter) und dessen `writing.md`. Wissens-Ordner, Modus und Suchstufe stehen in der Kontextzeile `Brain: …`. Alle Pfade sind relativ zum Wissens-Ordner; Shell-Befehle laufen als `cd <Wissens-Ordner> && …`.

Ist `$ARGUMENTS` nicht leer: zuerst wörtlich als `inbox/chat-note.md` speichern (`chat-note-2.md`, … falls belegt); den Zeitstempel ergänzt später `brain archive`.

## 1. Vorprüfung – bei Fehlschlag abbrechen

1. `git status --porcelain -- .` (im Wissens-Ordner) muss leer sein. Sonst abbrechen, die Ausgabe zeigen und den Nutzer bitten, die Änderungen zuerst zu committen oder zu verwerfen.
2. `brain check` muss mit Exit 0 enden. Sonst abbrechen und den Bericht zeigen.
3. `brain index`
4. `ls -tr inbox/` (`.gitkeep` ignorieren). Leer → „Nichts zu tun.“ und Ende. Andere Formate als `.md`/`.txt` bleiben in der Inbox; darauf hinweisen.

## 2. Pro Notiz, älteste zuerst

1. Notiz lesen. Genau eine Kategorie aus `categories.yml` wählen (Hauptthema gewinnt).
   Passt keine: anhalten und den Nutzer fragen (AskUserQuestion) – neue Kategorie vorschlagen (Slug, deutscher Name, ein Satz Beschreibung) sowie die bestpassende bestehende.
   - Neue Kategorie freigegeben → `brain category add <slug> --name "<Name>" --description "<ein Satz>"` (protokolliert selbst).
   - Nichts freigegeben → `_uncategorized`.
2. `brain archive inbox/<datei> --category <slug>` → ausgegebenen Archivpfad merken.
3. Verwandtes Wissen mit Schritt 1–2 der Suchleiter finden (gemäß Suchstufe).
4. Einarbeiten gemäß `writing.md`:
   - bestehendes Thema → Eintrag verdichtend bearbeiten, Quelle ergänzen, dann `brain log update …`
   - neues Thema → `brain remember --category … --title "…" --summary "…" --source <archivpfad> [--related …] <<'EOF'` … `EOF`
   - Beziehungen → `brain link …`
5. Widersprüche oder Unklarheiten → Nutzer fragen; ungeklärt → Callouts in allen betroffenen Einträgen und `brain log conflict …`.
6. Geheimnisse → nicht übernehmen, Nutzer informieren.

## 3. Abschluss

1. `brain index`
2. `brain check` – Fehler, die in diesem Lauf entstanden sind, beheben. Sonst abbrechen und den Bericht zeigen.
3. Suchindex gemäß Suchstufe: `hybrid` → `brain qmd update && brain qmd embed`; `keyword` → `brain qmd update`; `off` → nichts.
4. Zusammenfassung für den Nutzer: neue Einträge, geänderte Einträge, neue Verknüpfungen, Hinweise aus `brain check` (offene Punkte, Einträge ohne Kategorie).
5. `brain log ingest "<n> Notizen" "<Kategorien>"`
6. Nicht committen. Dem Nutzer sagen: „Änderungen im Wissens-Ordner prüfen und committen“ und als Vorschlag ausgeben: `git add <Wissens-Ordner> && git commit -m "ingest: <n> Notizen – <Themen>"`. Nie pushen.

## Wiederaufsetzen nach Abbruch

Dem Nutzer erklären: Das Original ist bereits archiviert (nicht committet); `git status -- .` / `git diff -- .` im Wissens-Ordner zeigen den Stand. Für einen neuen Versuch im Wissens-Ordner: `git restore wiki/ categories.yml`, neue Einträge entfernen (`git clean -n wiki/` zeigt sie, `git clean -f wiki/` löscht sie), die archivierte Datei zurück nach `inbox/` verschieben, `brain index`.
````

- [ ] **Step 7: `ask.md` schreiben**

`plugin/commands/ask.md` (vollständig):

````md
---
description: Das Wissen befragen – Antworten nur aus dem Wissen
argument-hint: [--archive | --all] <Frage>
---

Beantworte die Frage AUSSCHLIESSLICH aus dem Wissen (Skill `brain`). Nur lesen: kein `brain index`, kein `brain check`, kein `brain qmd update`, keine Dateiänderungen, keine Log-Einträge. Wissens-Ordner und Suchstufe stehen in der Kontextzeile `Brain: …`.

Eingabe: `$ARGUMENTS`

- beginnt mit `--archive` → nur Collection `archive` durchsuchen
- beginnt mit `--all` → Collections `wiki` und `archive`
- sonst → Collection `wiki` (nur wechseln, wenn die Frage ausdrücklich nach dem Archiv oder nach allem fragt)

Existiert `INDEX.md` im Wissens-Ordner nicht: den Nutzer bitten, einmal `brain index` auszuführen, und abbrechen.

Die Suchleiter aus dem Skill `brain` exakt befolgen, Kandidaten gemäß Suchstufe (`hybrid`, `keyword`, `off`) mit der gewählten Collection finden:

1. Keywords bestimmen.
2. Kandidaten scoren, ohne Dateien zu öffnen.
3. Genau EINE Top-Datei öffnen.
4. Nur den relevanten Abschnitt lesen.
5. Höchstens EINEM Pointer folgen.
6. Antworten.

Antwort auf Deutsch, jede Aussage mit `[[…]]`-Quellenlink. Bei Antworten aus dem Archiv darauf hinweisen, dass Originale durch das Wiki überholt sein können.
Passt nichts: „Dazu steht nichts im Wissen.“ und ggf. thematisch nahe Einträge aus `INDEX.md` nennen. Lücken nie mit Allgemeinwissen füllen.
Ist der qmd-MCP-Server bei `hybrid`/`keyword` nicht erreichbar: das sagen und mit `INDEX.md` und Grep weitersuchen, statt still schlechter zu antworten.
````

- [ ] **Step 8: Tests laufen lassen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck`
Expected: PASS. Zusätzlich JSON-Syntax prüfen: `for f in .claude-plugin/marketplace.json plugin/.claude-plugin/plugin.json plugin/hooks/hooks.json plugin/.mcp.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" || echo "FEHLER $f"; done` – keine Ausgabe.

Falls `claude` installiert ist: `claude plugin validate plugin` bzw. `claude plugin validate .` ausführen (falls der Befehl in dieser Version existiert, `claude plugin --help`); Fehler beheben.

- [ ] **Step 9: Commit**

```bash
git add -A .claude-plugin plugin scripts/test/plugin.test.ts
git commit -m "feat: brain plugin (commands, skill, hook, qmd MCP) and brain marketplace"
```

---

### Task 8: `install.sh`, Hilfe, README, Entwicklungs-`CLAUDE.md`

**Files:**
- Create: `install.sh`
- Modify: `scripts/src/cli.ts` (`HELP`)
- Modify: `scripts/test/cli.test.ts` (`helpCommands`)
- Modify: `README.md`, `CLAUDE.md`, `docs/superpowers/notes/offene-punkte.md`

**Interfaces:**
- Consumes: alle CLI-Befehle aus Task 1–6.

- [ ] **Step 1: Hilfe-Test anpassen (failing)**

In `scripts/test/cli.test.ts`:

```ts
const helpCommands = ['archive', 'remember', 'link', 'category add', 'category list', 'recategorize', 'qmd setup', 'qmd prune', 'index', 'check', 'log', 'help', 'init', 'session-start'];
```

und im Hilfe-Test zusätzlich:

```ts
        assert.match(result.stdout, /BRAIN_SEARCH/);
        assert.match(result.stdout, /^  --version\b/m);
```

Run: `npm --prefix scripts test` → FAIL (`qmd prune`, `session-start`, `BRAIN_SEARCH` fehlen).

- [ ] **Step 2: `HELP` ersetzen**

In `scripts/src/cli.ts` die Konstante `HELP` vollständig ersetzen:

```ts
const HELP = `brain – command line tool for knowledge folders

Usage: brain <command> [options]

Knowledge lives in a git repository: brain.yml at the repository root names the knowledge folder
(path) and the mode (project: shared with the repository; private: never pushed). brain finds
brain.yml by walking up from the current directory (or set BRAIN_ROOT to the folder containing
brain.yml). Entries are addressed as wiki/<category>/<entry>, sources as
archive/<category>/YYYY/MM/<file> (".md" is optional), relative to the knowledge folder.

Environment:
  BRAIN_SEARCH=hybrid|keyword|off
      Search level of this machine: hybrid (qmd with embedding models, default), keyword
      (qmd BM25 only, no models) or off (INDEX.md and grep, no qmd).

Commands:
  init [--private] [<path>]
      Create a knowledge folder in the current git repository: brain.yml at the repository root and the
      knowledge folder at <path> (asked for when missing, default "knowledge"). --private also
      installs the push guard, requires a repository without remote and creates the
      repository if needed. Never commits.
  init --update
      Refresh the knowledge folder files from template/ (and the push guard in private mode).
      Never touches data.
  archive <inbox-file> --category <slug>
      Move a note from inbox/ to archive/<category>/YYYY/MM/ without changing its
      content. Prints the new archive path.
  remember --category <slug> --title <title> --summary <sentence> --source <archive-path>
           [--source <archive-path> …] [--tags a,b] [--related <entry> …]  < body.md
      Create a new wiki entry (body from stdin), link related entries on both sides
      and rebuild the index.
  link <entry> <entry> [<entry> …] [--remove]
      Add (or remove) symmetric "## Related" links between all given entries.
  category add <slug> --name <name> [--description <text>]
      Register a new category in categories.yml. Only with the user's approval.
  category list
      List all categories with their number of entries.
  recategorize --rename <old> <new> | --merge <from> <to> | --move <entry> <category>
      Rename or merge categories, or move an entry to another category. Rewrites
      links; archive files keep their exact content.
  qmd setup
      Create this knowledge folder's qmd index for the current BRAIN_SEARCH level (collections
      wiki/archive, contexts; hybrid also sets the Qwen3 embedding model and embeds).
  qmd prune [--yes]
      List qmd indexes of knowledge folders that no longer exist and delete them after confirmation.
  qmd <qmd-arguments>
      Run qmd on this knowledge folder's own index, e.g. "brain qmd search Ingress -c wiki",
      "brain qmd update", "brain qmd mcp".
  index
      Rebuild INDEX.md and graph.json from the markdown files.
  check
      Validate the knowledge folder. Errors exit with 1; hints list open conflicts/unclear
      points, uncategorized entries, uncommitted changes and qmd index problems.
  log <op> <target> [<description>]
      Append a line to LOG.md. Ops: archive, create, update, link, unlink,
      conflict, resolve, recategorize, category, ingest.
  session-start <plugin-root>
      Internal: used by the plugin's SessionStart hook.
  --version
      Print the CLI version.
  help
      Show this help (also: --help, -h, no arguments).

Examples:
  brain init knowledge
  brain init --private .
  brain archive inbox/ingress-notes.md --category tech
  brain remember --category tech --title "Kubernetes Ingress" --summary "TLS setup for the ingress controller." \\
      --source archive/tech/2026/10/2026-10-03-1530-ingress-notes --related wiki/tech/azure-aks <<'EOF'
  The NGINX ingress controller terminates TLS with certificates from cert-manager.
  EOF
  brain link wiki/tech/kubernetes-ingress wiki/tech/azure-aks
  brain category add travel --name "Urlaub" --description "Reisen, Ausflüge, Urlaubsplanung."
  brain recategorize --move wiki/_uncategorized/tax-idea finance
  BRAIN_SEARCH=keyword brain qmd setup
  brain index && brain check`;
```

Run: `npm --prefix scripts test` → PASS.

- [ ] **Step 3: `install.sh` anlegen**

`install.sh` (ausführbar, `chmod +x install.sh`):

```sh
#!/bin/sh
# Installs the brain CLI (npm link) and registers the brain plugin marketplace in Claude Code.
set -eu
cd "$(dirname "$0")"

command -v git >/dev/null 2>&1 || { echo "Fehler: git fehlt." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Fehler: Node.js fehlt (benötigt ≥ 24)." >&2; exit 1; }
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || { echo "Fehler: Node.js $major gefunden, benötigt ≥ 24." >&2; exit 1; }

npm --prefix scripts install
npm --prefix scripts link

if command -v claude >/dev/null 2>&1; then
    claude plugin marketplace add chrisb88/brain \
        || echo "Hinweis: Marketplace brain ist bereits registriert oder nicht erreichbar."
else
    echo "Hinweis: claude nicht gefunden – später ausführen: claude plugin marketplace add chrisb88/brain"
fi

command -v qmd >/dev/null 2>&1 \
    || echo "Hinweis: qmd fehlt – npm install -g @tobilu/qmd (oder ohne qmd: export BRAIN_SEARCH=off)"

echo "Fertig: brain $(brain --version 2>/dev/null || echo '– nicht im PATH, npm-Prefix prüfen')"
```

Prüfen: `sh -n install.sh` (keine Ausgabe); falls vorhanden `shellcheck install.sh`.

- [ ] **Step 4: README neu schreiben**

`README.md` vollständig ersetzen. Englisch wie bisher (öffentliches Repo), Gliederung und Inhalt:

````md
# brain

brain keeps your knowledge (a "second brain") in plain Markdown files, maintained by [Claude Code](https://claude.com/claude-code) and searchable with [qmd](https://github.com/tobi/qmd).

Use it **per project** – the knowledge lives in a folder of the project repository and is shared with everyone who works on it – or **privately** in its own repository that is protected against pushing. Both have the same layout.

You drop raw notes into an inbox; `/brain:ingest` archives the originals unchanged and works the knowledge into condensed, categorized, cross-linked wiki entries. `/brain:ask` answers questions strictly from the brain, with source links. While you code, Claude consults the brain on its own when a question touches project knowledge.

Based on the approach by [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg) – see [Credits](#credits).

> **Note:** Instructions, slash commands and wiki entries are written in German. Code, CLI and file formats are English.

## Features

- **Markdown is the single source of truth** – Obsidian-compatible (`[[wiki links]]`, YAML frontmatter, callouts).
- **Originals are never modified** – notes are archived byte-identical under `archive/<category>/YYYY/MM/`.
- **Condense, don't accumulate** – new knowledge is merged into existing entries; conflicts and open questions are marked and reported by `brain check`.
- **Strict categories** – new categories only with approval, otherwise `_uncategorized`.
- **Fast search** – `INDEX.md` catalog plus a qmd index per knowledge folder; search level per machine (`BRAIN_SEARCH`).
- **Claude Code plugin** – commands, skill, qmd MCP server and a session hook; nothing is copied into your project's own Claude configuration.
- **Never commits** – you review and commit knowledge changes like code.

## Requirements

- Linux or WSL, Git, Node.js ≥ 24
- [Claude Code](https://claude.com/claude-code)
- [qmd](https://github.com/tobi/qmd) (`npm install -g @tobilu/qmd`) – optional with `BRAIN_SEARCH=off`

## Installation (every user)

```bash
git clone git@github.com:chrisb88/brain.git
cd brain
./install.sh        # brain CLI on your PATH, plugin marketplace registered in Claude Code
```

Update: `git pull && ./install.sh` and `claude plugin update brain@brain`.

## Create a knowledge folder

In a project repository:

```bash
cd my-project
brain init knowledge          # brain.yml + knowledge/, plugin enabled for this project
git add brain.yml knowledge .claude/settings.json && git commit -m "Add project knowledge"
```

Private knowledge (own repository, never pushed):

```bash
mkdir ~/knowledge && cd ~/knowledge
brain init --private .
```

`brain init` never commits. Team members who clone the project get the plugin offered when they start Claude Code; they only need `./install.sh` once. Until they have, the plugin prints a hint at session start (and the `qmd` MCP server cannot start).

## Usage

Start Claude Code anywhere in the repository:

- `/brain:ingest [note text]` – process `inbox/` (and an optional note given inline). Review and commit the changes afterwards.
- `/brain:ask [--archive | --all] <question>` – answer from the knowledge only.
- Ask project questions while you work – the `brain` skill searches the knowledge first.

## Search levels

Set per machine, e.g. in `~/.zshrc`:

| `BRAIN_SEARCH` | Search | Needs |
|---|---|---|
| `hybrid` (default) | qmd with query expansion, embeddings, reranking | qmd + ~2.5 GB models, GPU recommended |
| `keyword` | qmd BM25 only | qmd, no models |
| `off` | `INDEX.md` and grep | nothing – disable the `qmd` MCP server once via `/mcp` |

After changing the level run `brain qmd setup` in the repository. Each knowledge folder has its own qmd index (`brain-<repo>-<hash>`); `brain qmd prune` removes indexes of knowledge folders that no longer exist.

## CLI

`brain help` lists all commands. Highlights: `brain check`, `brain index`, `brain category list`, `brain recategorize`, `brain init --update`, `brain qmd setup`, `brain qmd prune`.

## Repository layout

- `scripts/` – the `brain` CLI (TypeScript, tests: `npm --prefix scripts test`)
- `plugin/` – the Claude Code plugin (commands, skill, hook, MCP config)
- `.claude-plugin/marketplace.json` – the `brain` marketplace
- `template/` – files copied into a knowledge folder (`.gitignore`, `.gitattributes`, `CLAUDE.md`)
- `docs/superpowers/` – specs, plans and notes

## Credits

The idea of a Claude-maintained Markdown wiki with an inbox, archive and search ladder comes from [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg).

## License

MIT – see [LICENSE](LICENSE).
````

Den bisherigen „Credits“-Abschnitt des alten README inhaltlich übernehmen, falls er mehr enthält als der obige (vorher `git show HEAD:README.md | sed -n '/## Credits/,$p'` ansehen und ggf. den Wortlaut beibehalten).

- [ ] **Step 5: Entwicklungs-`CLAUDE.md` und offene Punkte**

`CLAUDE.md` (Repo-Root) – Abschnitte ersetzen:

```md
# brain – Code-Repository

Entwicklung des CLI `brain`, des Claude-Code-Plugins `brain` und der Vorlagen für Wissens-Ordner. **Hier liegt kein Wissen (keine Daten).** Ein Wissens-Ordner liegt in einem Projekt-Repository (`brain init`) oder in einem eigenen privaten Repository (`brain init --private`).

## Aufbau

- `scripts/` – CLI `brain` (Node 24, TypeScript per Type-Stripping, Abhängigkeit nur `yaml`). Tests: `npm --prefix scripts test`, Typprüfung: `npm --prefix scripts run typecheck`.
- `plugin/` – Claude-Code-Plugin `brain` (Befehle, Skill, Hook, qmd-MCP); `.claude-plugin/marketplace.json` – Marketplace `brain`. Version in `plugin/.claude-plugin/plugin.json` = Version in `scripts/package.json`.
- `template/` – Dateien für den Wissens-Ordner (`_gitignore` → `.gitignore`, `_gitattributes` → `.gitattributes`, `CLAUDE.md`); `brain init --update` übernimmt sie.
- `docs/superpowers/` – Specs, Pläne, Notizen. Aktuell: `specs/2026-10-06-plugin-unified-brain-design.md`; Datenvertrag: `specs/2026-10-03-second-brain-design.md`.

## Einrichtung

1. `./install.sh` → `brain` im PATH, Marketplace registriert.
2. Zum Ausprobieren ein Wegwerf-Wissens-Ordner: `mkdir /tmp/brain-test && cd /tmp/brain-test && brain init --private .`

## Regeln für die Entwicklung

- Nie Wissens-Daten (`inbox/`, `archive/`, `wiki/`-Einträge, `categories.yml`, `brain.yml`) in dieses Repository legen oder committen.
- Tests nie gegen echte Daten laufen lassen; Tests nutzen temporäre Ordner (`scripts/test/helpers.ts`).
- Bei Versionswechsel beide Versionen anheben (`scripts/package.json`, `plugin/.claude-plugin/plugin.json`).
- `git push` führt der Nutzer selbst aus.
- Sprache: Code, CLI und `brain help` Englisch; Meldungen an den Nutzer und Anweisungsdateien Deutsch.
```

`docs/superpowers/notes/offene-punkte.md`: Punkt 2 („Veralteter Verweis in `template/CLAUDE.md`“) streichen und darunter vermerken: „Punkt 2 erledigt durch die Plugin-Umstellung (2026-10-06).“

- [ ] **Step 6: Alles prüfen**

Run: `npm --prefix scripts test && npm --prefix scripts run typecheck && sh -n install.sh`
Expected: PASS, keine Ausgabe von `sh -n`.

- [ ] **Step 7: Commit**

```bash
git add -A install.sh README.md CLAUDE.md docs/superpowers/notes/offene-punkte.md scripts
git commit -m "docs: install.sh, README and help for plugin and unified knowledge folders"
```

---

### Task 9: Abnahme mit echtem Claude Code (mit dem Nutzer)

Diese Aufgabe klärt die drei offenen Fragen der Spec und braucht eine interaktive Claude-Code-Sitzung; sie wird **zusammen mit dem Nutzer** ausgeführt. Ergebnisse in `docs/superpowers/notes/2026-10-06-plugin-acceptance.md` festhalten.

**Files:**
- Create: `docs/superpowers/notes/2026-10-06-plugin-acceptance.md`
- Ggf. Modify: `plugin/.mcp.json`, `README.md` (je nach Ergebnis)

- [ ] **Step 1: Lokalen Marketplace registrieren und Wegwerf-Projekt anlegen**

```bash
npm rm -g second-brain-scripts   # alter Paketname belegt sonst den Befehl brain (npm link: EEXIST)
./install.sh
claude plugin marketplace add "$(pwd)"
mkdir -p /tmp/kb-accept && cd /tmp/kb-accept && git init -q && echo '# Demo' > README.md && git add -A && git commit -qm demo
BRAIN_SEARCH=keyword brain init knowledge
cat .claude/settings.json
```

Expected: `brain init` meldet „Plugin brain@brain für dieses Projekt aktiviert.“ In `.claude/settings.json` notieren, ob neben `enabledPlugins` auch `extraKnownMarketplaces` steht (Spec-Frage 2). Fehlt es: README-Abschnitt „Create a knowledge folder“ um den Eintrag ergänzen, den das Projekt einmal von Hand hinzufügt:

```json
{
  "extraKnownMarketplaces": {
    "brain": { "source": { "source": "github", "repo": "chrisb88/brain" } }
  }
}
```

- [ ] **Step 2: Interaktiv prüfen (Nutzer startet `claude` in `/tmp/kb-accept/src` – einem Unterordner)**

Vorher `mkdir -p /tmp/kb-accept/src`. Prüfliste:
1. Kontextzeile `Brain: knowledge/ (mode: project, search: keyword)` erscheint (Nutzer fragt: „Welcher Wissens-Ordner ist aktiv?“).
2. `/mcp` zeigt den Server `qmd` als verbunden (Spec-Frage 1). Falls nicht: in `plugin/.mcp.json` `"env": {"CLAUDE_PROJECT_DIR": "${CLAUDE_PROJECT_DIR}"}` ergänzen, `claude plugin update brain@brain`, erneut prüfen; Ergebnis notieren.
3. `/brain:ingest Kubernetes Ingress terminiert TLS mit cert-manager.` läuft durch, legt Eintrag an, committet nicht; `git status` zeigt nur Änderungen unter `knowledge/`.
4. `/brain:ask Wie wird TLS am Ingress terminiert?` antwortet mit `[[wiki/…]]`-Link.
5. Sitzung beendet sich nicht verzögert; `knowledge/INDEX.md` wird nach Sitzungsstart aktualisiert (Spec-Frage 3: Hintergrund-Aktualisierung).
6. `brain init` ohne Pfad im Terminal fragt `Wissens-Ordner [knowledge]:` (in einem zweiten Wegwerf-Repo).
7. `BRAIN_SEARCH=off`: neue Sitzung, `/mcp` zeigt `qmd` fehlgeschlagen mit Meldung; nach Deaktivieren über `/mcp` sucht `/brain:ask` per Grep.

- [ ] **Step 3: Ergebnisse dokumentieren und Wegwerf-Daten entfernen**

Notiz mit Ergebnis je Punkt (bestanden / Anpassung) schreiben. Danach `claude plugin marketplace remove brain` (lokale Registrierung) – nach dem Umbenennen des GitHub-Repos und Push durch den Nutzer wird `./install.sh` erneut ausgeführt. `rm -rf /tmp/kb-accept`, `brain qmd prune --yes`.

- [ ] **Step 4: Commit**

```bash
git add -A docs/superpowers/notes plugin README.md
git commit -m "docs: plugin acceptance notes"
```
