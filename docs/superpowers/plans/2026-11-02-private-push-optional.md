# Push-Schutz optional im privaten Modus – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im privaten Modus entscheidet der Nutzer beim Anlegen, ob der Push-Schutz installiert wird (`push_guard` in `brain.yml`); `brain init --update` schreibt `brain.yml` im aktuellen Format neu und richtet den Push-Schutz danach aus.

**Architecture:** `config.ts` kennt den neuen Schlüssel und schreibt/aktualisiert `brain.yml`; `guard.ts` kann den Hook erkennen und entfernen; `init.ts`, `check.ts`, `session.ts` und `cli.ts` lesen `pushGuard` statt aus `mode` abzuleiten. Keine neuen Abhängigkeiten.

**Tech Stack:** Node 24, TypeScript per Type-Stripping, `node:test`, `yaml`.

**Spec:** `docs/superpowers/specs/2026-11-02-private-push-optional-design.md`

## Global Constraints

- Code, CLI-Hilfe (`brain help`) und Kommentare Englisch; Meldungen an den Nutzer und Anweisungsdateien (`SKILL.md`) Deutsch.
- `brain.yml`-Schlüssel: `push_guard`; Flag: `--allow-push`; Frage: `Nur lokal – Pushen verhindern? [Y/n] `.
- Kopfkommentar jeder `brain.yml`, exakt drei Zeilen: `# Brain configuration. Created by brain init.`, `# After changing this file run: brain init --update` und `# brain init --update rewrites this file - your own comments will be lost.`.
- `push_guard` fehlt bei `mode: private` → `true`. Bei `mode: project` ist der Schlüssel ein Fehler.
- Tests nur in temporären Ordnern (`scripts/test/helpers.ts`), nie gegen echte Daten.
- Version: `0.3.1` → `0.4.0` in `scripts/package.json` **und** `plugin/.claude-plugin/plugin.json`.
- Nie committen in Wissens-Ordnern, nie pushen; `git push` macht der Nutzer.
- Prüfen nach jedem Task: `npm --prefix scripts test` und `npm --prefix scripts run typecheck` grün.

## Review Focus

1. **Bestehender privater Brain nach dem Upgrade** (`brain.yml` ohne `push_guard`): bleibt geschützt, `brain check` ohne Fehler, `--update` ergänzt `push_guard: true` und den Kommentar → Task 1 (`loadBrainConfig defaults…`), Task 3 (`cli init --update rewrites an old brain.yml`).
2. **`brain init --private` ohne Terminal** (Skript, CI): darf nicht auf die Frage warten, Schutz an → Task 3 (`cli init --private without a terminal keeps the push guard`).
3. **`brain.yml` liegt am Repo-Root, Wissens-Ordner im Unterordner:** `--update` schreibt `brain.yml` an `configRoot`, nicht in den Wissens-Ordner → Task 3 (`cli init --update rewrites an old brain.yml`, mit `path: knowledge`).
4. **YAML-Werte wie `no`, `"false"`, `0`** für `push_guard`: Fehler statt stiller Annahme → Task 1 (Fälle in `invalid`).
5. **Fremder `pre-push`-Hook** bei `push_guard: false`: wird von `--update` nicht gelöscht, löst keinen Hinweis in `check` aus → Task 2 (`removePushGuard keeps a foreign hook`, `check without push guard accepts a remote and hints at a leftover guard`).

---

### Task 1: `brain.yml` – Schlüssel `push_guard`, Kopfkommentar, Neuschreiben

**Files:**
- Modify: `scripts/src/config.ts`
- Test: `scripts/test/config.test.ts`; bestehende `deepEqual` auf `BrainConfig` in `scripts/test/init.test.ts` und `scripts/test/config.test.ts` um `pushGuard` ergänzen.

**Interfaces:**
- Produces:
  - `BrainConfig.pushGuard: boolean` (bei `project` immer `false`)
  - `formatBrainConfig(path: string, mode: BrainMode, pushGuard: boolean = mode === 'private'): string` – Kopfkommentar (3 Zeilen), dann `path`, `mode`, bei `private` zusätzlich `push_guard`.
  - `rewriteBrainConfig(config: BrainConfig): boolean` – schreibt `formatBrainConfig(config.path, config.mode, config.pushGuard)` nach `join(config.configRoot, CONFIG_FILE)`, nur wenn der Inhalt abweicht; gibt `true` zurück, wenn geschrieben wurde.

- [ ] **Step 1: Failing tests in `config.test.ts`**

```ts
test('formatBrainConfig writes the update hint and push_guard only in private mode', () => {
    assert.equal(formatBrainConfig('.', 'private', false),
        '# Brain configuration. Created by brain init.\n# After changing this file run: brain init --update\n# brain init --update rewrites this file - your own comments will be lost.\npath: .\nmode: private\npush_guard: false\n');
    assert.equal(formatBrainConfig('knowledge', 'project'),
        '# Brain configuration. Created by brain init.\n# After changing this file run: brain init --update\n# brain init --update rewrites this file - your own comments will be lost.\npath: knowledge\nmode: project\n');
});

test('loadBrainConfig defaults push_guard to true in private mode and reads false', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\n');
    assert.equal(loadBrainConfig(dir).pushGuard, true);
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\npush_guard: false\n');
    assert.equal(loadBrainConfig(dir).pushGuard, false);
    writeFile(dir, 'brain.yml', 'path: .\nmode: project\n');
    assert.equal(loadBrainConfig(dir).pushGuard, false);
});

test('rewriteBrainConfig writes the current format once', () => {
    const dir = emptyDir();
    writeFile(dir, 'brain.yml', 'path: .\nmode: private\n');
    assert.equal(rewriteBrainConfig(loadBrainConfig(dir)), true);
    assert.equal(read(dir, 'brain.yml'), formatBrainConfig('.', 'private', true));
    assert.equal(rewriteBrainConfig(loadBrainConfig(dir)), false);
});
```

Neue Fälle im bestehenden Array `invalid`:

```ts
['push_guard in project mode', 'path: .\nmode: project\npush_guard: true\n', /push_guard nur bei mode: private/],
['push_guard not boolean (no)', 'path: .\nmode: private\npush_guard: no\n', /push_guard muss true oder false sein/],
['push_guard not boolean (string)', 'path: .\nmode: private\npush_guard: "false"\n', /push_guard muss true oder false sein/],
['push_guard not boolean (0)', 'path: .\nmode: private\npush_guard: 0\n', /push_guard muss true oder false sein/],
```

Round-trip-Test (`loadBrainConfig accepts "."…`) und `loadBrainConfig reads path and mode` erwarten zusätzlich `pushGuard: true` bzw. `pushGuard: false`.

- [ ] **Step 2: Tests laufen lassen** – `npm --prefix scripts test` → FAIL (`rewriteBrainConfig` nicht exportiert, `pushGuard` fehlt).
- [ ] **Step 3: Implementieren** – `KEYS` um `push_guard`; Prüfung `typeof record.push_guard === 'boolean'` (sonst Fehler) und `mode === 'project'` mit Schlüssel → Fehler; Meldungen exakt wie in den Tests. `stringify` mit `{ path, mode }` bzw. `{ path, mode, push_guard }`.
- [ ] **Step 4: Bestehende `deepEqual` auf `BrainConfig` ergänzen** (`init.test.ts:44`, weitere per `grep -rn "loadBrainConfig(" scripts/test`), dann `npm --prefix scripts test` und `run typecheck` → PASS.
- [ ] **Step 5: Commit** – `git commit -m "feat: push_guard in brain.yml with update hint"`

---

### Task 2: Push-Schutz erkennen/entfernen; `updateBrainConfig` und `checkBrain` nach `pushGuard`

**Files:**
- Modify: `scripts/src/guard.ts`, `scripts/src/init.ts` (`updateBrainConfig`), `scripts/src/check.ts`
- Test: `scripts/test/guard.test.ts`, `scripts/test/init.test.ts`; Aufrufe `updateBrainConfig(…, 'project'|'private')` in `init.test.ts:113,124` anpassen.

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces:
  - `hasPushGuard(root: string): boolean` – `pre-push` im gemeinsamen Hook-Verzeichnis existiert und enthält `PUSH_GUARD_MARKER`; außerhalb eines Git-Repos `false` (kein Fehler).
  - `removePushGuard(root: string): boolean` – löscht den Hook nur, wenn `hasPushGuard`; `core.hooksPath` bleibt; `true`, wenn gelöscht.
  - `updateBrainConfig(brainDir: string, pushGuard: boolean, templateDir = TEMPLATE_DIR): string[]` – Template-Dateien wie bisher; danach `pushGuard ? installPushGuard(brainDir) : removePushGuard(brainDir)` (nur wenn `brainDir` in einem Git-Repo liegt – heute ist das bei `private` immer so; bei `project` ohne Hook ist `removePushGuard` ein No-op).
  - `checkBrain(root: string, mode: BrainMode = 'project', level: SearchLevel = searchLevel(), pushGuard: boolean = mode === 'private'): CheckReport` – Push-Fehler nur bei `pushGuard`; bei `mode === 'private' && !pushGuard && hasPushGuard(root)` Hinweis `Push-Schutz noch installiert, obwohl push_guard: false – brain init --update ausführen`.

- [ ] **Step 1: Failing tests**

`guard.test.ts`:
```ts
test('removePushGuard deletes the brain hook', () => {
    const root = validBrain();
    initGit(root);
    assert.equal(hasPushGuard(root), true);
    assert.equal(removePushGuard(root), true);
    assert.equal(hasPushGuard(root), false);
    assert.equal(removePushGuard(root), false);
});

test('removePushGuard keeps a foreign hook', () => {
    const root = validBrain();
    initGit(root);
    writeFileSync(hookPath(root), '#!/bin/sh\nexit 0\n');
    assert.equal(removePushGuard(root), false);
    assert.equal(readFileSync(hookPath(root), 'utf8'), '#!/bin/sh\nexit 0\n');
});

test('check without push guard accepts a remote and hints at a leftover guard', () => {
    const root = validBrain();
    initGit(root);
    git(root, 'remote', 'add', 'origin', 'https://example.com/x.git');
    const report = checkBrain(root, 'private', 'off', false);
    assert.deepEqual(report.errors, []);
    assert.match(report.hints.join('\n'), /Push-Schutz noch installiert, obwohl push_guard: false – brain init --update ausführen/);
    removePushGuard(root);
    assert.doesNotMatch(checkBrain(root, 'private', 'off', false).hints.join('\n'), /Push-Schutz noch installiert/);
});
```

Zusätzlich: fremder Hook + `pushGuard: false` → kein Hinweis (eine Zeile im `removePushGuard keeps a foreign hook`-Test: `assert.doesNotMatch(checkBrain(root, 'private', 'off', false).hints.join('\n'), /Push-Schutz noch installiert/)`).

`init.test.ts`:
```ts
test('updateBrainConfig removes the push guard when push_guard is false', () => {
    const dir = emptyDir();
    initBrain({ cwd: dir, path: '.', private: true });
    updateBrainConfig(dir, false);
    assert.equal(hasPushGuard(dir), false);
    updateBrainConfig(dir, true);
    assert.deepEqual(checkBrain(dir, 'private', 'off').errors, []);
});
```

- [ ] **Step 2: `npm --prefix scripts test`** → FAIL (Exporte fehlen).
- [ ] **Step 3: Implementieren** wie in Interfaces; `updateBrainConfig`-Aufruf in `initBrain` bekommt vorerst `mode === 'private'` (Task 3 ersetzt das).
- [ ] **Step 4: `npm --prefix scripts test` und `run typecheck`** → PASS.
- [ ] **Step 5: Commit** – `git commit -m "feat: push guard follows push_guard in update and check"`

---

### Task 3: `brain init --private [--allow-push]`, Frage, `brain init --update` schreibt `brain.yml`

**Files:**
- Modify: `scripts/src/init.ts`, `scripts/src/prompt.ts`, `scripts/src/cli.ts` (Befehle `init`, `check`; `HELP`)
- Test: `scripts/test/init.test.ts`, neu `scripts/test/prompt.test.ts`

**Interfaces:**
- Consumes: `formatBrainConfig`, `rewriteBrainConfig`, `BrainConfig.pushGuard` (Task 1); `updateBrainConfig(brainDir, pushGuard)`, `hasPushGuard`, `checkBrain(…, pushGuard)` (Task 2).
- Produces:
  - `InitOptions` neu: `allowPush?: boolean`, `askPushGuard?: () => boolean`.
  - `InitResult` neu: `pushGuard: boolean`.
  - `parseYesNo(answer: string, fallback: boolean): boolean | null` in `prompt.ts` – leer → `fallback`; `y|yes|j|ja` → `true`; `n|no|nein` → `false` (Groß/klein egal); sonst `null`.

- [ ] **Step 1: Failing tests**

`prompt.test.ts`:
```ts
const cases: Array<[string, boolean | null]> = [['', true], ['Y', true], ['ja', true], ['n', false], ['Nein', false], ['vielleicht', null]];
for (const [answer, expected] of cases) {
    test(`parseYesNo("${answer}")`, () => assert.equal(parseYesNo(answer, true), expected));
}
```

`init.test.ts`:
- `initBrain --private without allowPush or question keeps the push guard`: `initBrain({ cwd: emptyDir(), path: '.', private: true })` → `result.pushGuard === true`, `hasPushGuard`, `brain.yml` gleich `formatBrainConfig('.', 'private', true)`.
- `initBrain --private with allowPush accepts a remote and pushes`: Repo mit `git init`, `remote add origin <bare>`; `initBrain({ …, private: true, allowPush: true })` → `pushGuard === false`, `hasPushGuard === false`, `brain.yml` enthält `push_guard: false`; nach `git add -A && git -c user.email=t@e -c user.name=T commit -m x` gelingt `git push origin HEAD:refs/heads/main` (Status 0).
- `initBrain asks for the push guard after the path`: `askPath` und `askPushGuard` pushen ihren Namen in ein Array; erwartet `['path', 'guard']`; `askPushGuard: () => false` → `pushGuard === false`.
- Bestehender Fehlerfall „`--private` mit Remote → Fehler ohne Schreibzugriff“ bleibt grün (Schutz an); neuer Fall in derselben Tabelle: `allowPush: true` mit `private: false` → `/--allow-push nur mit --private/`.
- `cli init --private without a terminal keeps the push guard`: `runCli(dir, ['init', '--private', '.'], '', dir)` (stdin ist kein Terminal) → Status 0, `stdout` enthält `(mode: private, push guard: on)`, `brain.yml` enthält `push_guard: true`.
- `cli init --private --allow-push prints the remote hint`: `stdout` enthält `push guard: off` und `Hinweis: brain prüft nicht, wer das Remote lesen kann – für privates Wissen kein öffentliches Repository verwenden.`
- `cli init --update rewrites an old brain.yml`: Projekt-Repo, `brain init knowledge`, dann `brain.yml` am Repo-Root mit `path: knowledge\nmode: project\n` überschreiben; `runCli(repo, ['init', '--update'], '', repo)` → `stdout` listet `brain.yml`; Datei gleich `formatBrainConfig('knowledge', 'project')`; `knowledge/brain.yml` existiert nicht. Zweiter Aufruf → `Konfiguration ist aktuell.`
- `cli init --update with push_guard false removes the guard`: privater Brain, `brain.yml` auf `push_guard: false` ändern, `--update` → `stdout` enthält `Push-Schutz entfernt`; zurück auf `true` → `Push-Schutz installiert`.
- `cli init --update rejects an invalid brain.yml`: `push_guard: no` → Status ≠ 0, `stderr` `/push_guard muss true oder false sein/`, Datei unverändert.
- `cli init --update --allow-push` → Status ≠ 0, `Verwendung: brain init --update`.

- [ ] **Step 2: `npm --prefix scripts test`** → FAIL.
- [ ] **Step 3: `initBrain` anpassen** – Reihenfolge: Repo bestimmen → `brain.yml` vorhanden? → `allowPush && !private` → Fehler → Pfad (`askPath`) → `pushGuard = private && !allowPush && (askPushGuard?.() ?? true)` → Remote-Fehler nur bei `pushGuard` → Schreiben; `updateBrainConfig(brainDir, pushGuard, templateDir)`; `formatBrainConfig(path, mode, pushGuard)`.
- [ ] **Step 4: `cli.ts` anpassen**
  - `init`: Option `'allow-push': { type: 'boolean', default: false }`; bei `--update` zusammen mit `--private` oder `--allow-push` → `Verwendung: brain init --update`.
  - `askPushGuard` nur mit Terminal: Schleife `promptLine('Nur lokal – Pushen verhindern? [Y/n] ')` → `parseYesNo(answer, true)` bis nicht `null`.
  - Ausgabe nach Anlegen: `Wissens-Ordner angelegt: <brainDir> (mode: private, push guard: on|off)`; bei `project` wie bisher `(mode: project)`. Bei `off` die Hinweiszeile aus Step 1.
  - `--update`: `current = brainConfig()`; `ymlChanged = rewriteBrainConfig(current)`; `before = hasPushGuard(current.brainDir)` (nur wenn Git-Repo, sonst `false`); `changed = updateBrainConfig(current.brainDir, current.pushGuard)`; Liste = `brain.yml` (falls geändert) + `changed`; danach Zeile `Push-Schutz installiert` bzw. `Push-Schutz entfernt`, wenn sich `hasPushGuard` geändert hat. Nichts geändert → `Konfiguration ist aktuell.`
  - `check`: `checkBrain(root, config?.mode, searchLevel(), config?.pushGuard)` (Import von `searchLevel`, falls noch nicht vorhanden).
  - `HELP`: Kopf „(project: shared with the repository; private: own repository, by default never pushed)“; Befehl `init [--private [--allow-push]] [<path>]` mit: „--private creates the repository if needed and asks whether it stays local only (push guard, requires a repository without remote); --allow-push skips the question and allows a remote.“; `init --update`: „Rewrite brain.yml in the current format, refresh the knowledge folder files from template/ and install or remove the push guard according to push_guard. Never touches data.“
- [ ] **Step 5: `npm --prefix scripts test` und `run typecheck`** → PASS.
- [ ] **Step 6: Commit** – `git commit -m "feat: brain init --private asks for the push guard, --update rewrites brain.yml"`

---

### Task 4: Kontextzeile und Skill

**Files:**
- Modify: `scripts/src/session.ts` (`sessionLines`), `plugin/skills/brain/SKILL.md`
- Test: `scripts/test/session.test.ts`

**Interfaces:**
- Consumes: `BrainConfig.pushGuard` (Task 1).
- Produces: Kontextzeile `Brain: <folder> (mode: private, push guard: on|off, search: <level>)`; bei `project` unverändert `Brain: <folder> (mode: project, search: <level>)`.

- [ ] **Step 1: Failing test** – `sessionLines` mit privatem Config-Objekt (`pushGuard: true` und `false`) → erste Zeile `Brain: ./ (mode: private, push guard: on, search: off)` bzw. `… push guard: off …`; bestehende `project`-Erwartungen bleiben.
- [ ] **Step 2: `npm --prefix scripts test`** → FAIL.
- [ ] **Step 3: `sessionLines` anpassen.**
- [ ] **Step 4: `SKILL.md`** – Zeile 12: Beispiel um die private Variante ergänzen (`Brain: ./ (mode: private, push guard: on, search: hybrid)`); Zeile 33 ersetzen durch: „Nie committen und nie pushen – das macht der Nutzer. Bei `push guard: on` zusätzlich nie ein Git-Remote anlegen (Push-Schutz per Hook; `brain check` meldet Verstöße).“
- [ ] **Step 5: `npm --prefix scripts test` und `run typecheck`** → PASS.
- [ ] **Step 6: Commit** – `git commit -m "feat: session context shows the push guard"`

---

### Task 5: README und Version

Voraussetzung: PR #10 (`docs/readme-modes`) ist in `main` gemergt; vorher `git rebase main` auf diesem Branch, damit die Tabelle „Two modes“ vorhanden ist.

**Files:**
- Modify: `README.md`, `scripts/package.json`, `plugin/.claude-plugin/plugin.json` (ggf. `scripts/package-lock.json`, Feld `version`)

- [ ] **Step 1: README**
  - Tabelle „Two modes“, Spalte Private: Zeile „Who sees it“ → „only you – by default the repository has no remote and is protected against pushing; with `--allow-push` you may add a remote of your own (backup drive, own server, private repository)“; Zeile „Backup“ → „your responsibility – e.g. a remote of your own (`--allow-push`)“; Kopf der Spalte `brain init --private [--allow-push] <dir>`.
  - Unter der Tabelle: „brain cannot tell who can read a remote – don't use a public repository for private knowledge.“
  - Abschnitt „Create a knowledge folder“, privates Beispiel: ein Satz zur Frage beim Anlegen und zu `--allow-push`; Umstellen: „Change `push_guard` in `brain.yml`, run `brain init --update` and commit `brain.yml`.“ Hinweis, dass `brain init --update` `brain.yml` im aktuellen Format neu schreibt (eigene Kommentare gehen verloren).
- [ ] **Step 2: Version** `0.3.1` → `0.4.0` in beiden Dateien; `npm --prefix scripts install --package-lock-only` falls `package-lock.json` die Version enthält.
- [ ] **Step 3: `npm --prefix scripts test` und `run typecheck`** → PASS; `brain help` (bzw. `node scripts/src/cli.ts help`) zeigt das neue `init`.
- [ ] **Step 4: Commit** – `git commit -m "docs: README for optional push guard; bump version to 0.4.0"`
