# Committete Inbox (`inbox: committed`) – Umsetzungsplan

> **Für agentische Ausführer:** Benötigter Sub-Skill: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Schritte nutzen Checkboxen (`- [ ]`).

**Ziel:** Im Projektmodus kann `brain.yml` mit `inbox: committed` die Inbox ins Git legen, damit Feature-Branches nur Rohnotizen committen und `/brain:ingest` einmal pro Woche nach den Merges auf dem Basis-Branch läuft.

**Architektur:** Ein neuer optionaler Schlüssel `inbox` (`local` Default | `committed`, nur bei `mode: project`) in `brain.yml`. Er wählt eine Variante von `.gitignore`/`.gitattributes` aus `template/` (zwei zusätzliche Dateien), wird von `init --update` erhalten und im Sitzungskontext angezeigt. Ein neuer Befehl `brain list-inbox` liefert die Notizen in deterministischer Reihenfolge; `ingest.md` nutzt ihn statt `ls -tr`. Der Private-Modus und alle Installationen ohne den Schlüssel bleiben unverändert.

**Tech Stack:** Node 24, TypeScript (Type-Stripping), `node:test`, Abhängigkeit nur `yaml`.

**Spec:** `/home/chris/.local/state/handoff/2026-11-18-brain-plugin-committed-inbox.md` (Entscheidungen unten ergänzt).

## Entscheidungen aus dem Gespräch (ergänzen/ändern den Handoff)

- `inbox: committed` ist nur bei `mode: project` erlaubt (Fehler bei `private`), analog zu `push_guard` nur bei `private`. `mode` und das Wording „Projektmodus/Privatmodus“ bleiben unverändert.
- Neuer Befehl heißt `brain list-inbox`.
- Ingest auf einem Nicht-Basis-Branch im Modus `committed`: nur **warnen**, nicht abbrechen.
- `brain.yml` schreibt `inbox: committed` nur, wenn gesetzt; `local` wird nie geschrieben (bestehende `brain.yml` bleiben bei `init --update` byte-identisch).
- Kein `brain init --inbox`-Flag (YAGNI): umstellen per Bearbeiten von `brain.yml` + `brain init --update`, wie bei `push_guard`.
- Sortierzeit ist das Committer-Datum (`%ct`) des Add-Commits (= Zeitpunkt, an dem die Notiz auf den Branch kam, bei Squash-Merge der Merge-Zeitpunkt), nicht das Autordatum.

## Globale Randbedingungen

- Code, CLI-Hilfe, Bezeichner, Kommentare: Englisch. Meldungen an den Nutzer und Anweisungsdateien (`plugin/`): Deutsch. README: Englisch.
- Nie Wissensdaten ins Repo legen; Tests nur in temporären Ordnern (`scripts/test/helpers.ts`).
- Version in `scripts/package.json` und `plugin/.claude-plugin/plugin.json` gemeinsam anheben (0.6.2 → 0.7.0).
- **Nicht committen, nicht pushen**, solange chris es nicht ausdrücklich verlangt (deshalb keine Commit-Schritte). Arbeitsbranch lokal anlegen: `git switch main && git pull --ff-only && git switch -c feat/committed-inbox`.
- Tests: `npm --prefix scripts test`, Typprüfung: `npm --prefix scripts run typecheck`.
- Ohne `inbox`-Schlüssel und im Private-Modus: keine Verhaltensänderung (Akzeptanzkriterium 1).

## Review Focus

- `inbox: committed` zusammen mit `mode: private` → klarer Fehler `inbox nur bei mode: project`.
- `inbox` mit ungültigem Wert (`Committed`, `true`, Zahl, leer) → Fehler `inbox muss local oder committed sein`.
- `brain list-inbox` bei leerer Inbox (nur `.gitkeep`) → keine Ausgabe, Exit 0.
- `brain list-inbox` im Modus `committed` ohne Git-Historie/uncommittete Notizen → kein Absturz; Fallback mtime, uncommittete Notizen nach den committeten.
- CRLF-Notiz im Modus `committed`: nach `brain archive` und `git add -A` meldet Git einen Rename (`R`), Bytes identisch.

## Dateiübersicht

| Datei | Änderung |
|---|---|
| `scripts/src/config.ts` | Typ `BrainInbox`, `BrainConfig.inbox`, Validierung, `formatBrainConfig` |
| `scripts/src/session.ts` | Kontextzeile `inbox: committed` |
| `template/_gitignore.committed`, `template/_gitattributes.committed` | neue Varianten (Create) |
| `scripts/src/init.ts` | Variantenauswahl in `templateFiles`/`updateBrainConfig`/`outdatedTemplateFiles` |
| `scripts/src/check.ts`, `scripts/src/cli.ts` | `inbox` durchreichen, Hinweis zu uncommitteten Inbox-Notizen, Befehl `list-inbox` |
| `scripts/src/inbox.ts` | `listInbox` (Create) |
| `plugin/commands/ingest.md`, `plugin/skills/brain/SKILL.md` | Textanpassungen |
| `README.md` | Workflow-Abschnitt, Zeilen ~80/369, `brain.yml`-Tabelle, CLI |
| `scripts/test/config.test.ts`, `init.test.ts`, `check.test.ts`, `session`-Tests, `inbox.test.ts` (Create) | Tests |

---

### Task 1: Konfigurationsschlüssel `inbox`

**Files:**
- Modify: `scripts/src/config.ts` (`KEYS` Z. 16, `BrainConfig` Z. 9–19, `loadBrainConfig` Z. 33–76, `formatBrainConfig` Z. 75–78, `rewriteBrainConfig` Z. 81–89)
- Modify: `scripts/src/session.ts:20-23`
- Test: `scripts/test/config.test.ts`, vorhandene Session-Tests (Datei per `grep -l sessionLines scripts/test/*.ts` finden)

**Interfaces:**
- Produces: `export const BRAIN_INBOX_MODES = ['local', 'committed'] as const; export type BrainInbox = (typeof BRAIN_INBOX_MODES)[number];`
- Produces: `BrainConfig.inbox: BrainInbox` (immer gesetzt, Default `'local'`)
- Produces: `formatBrainConfig(path: string, mode: BrainMode, pushGuard: boolean = mode === 'private', inbox: BrainInbox = 'local'): string`

- [ ] **Schritt 1: Fehlschlagende Tests schreiben** in `config.test.ts`:
  - `loadBrainConfig` mit `path: knowledge\nmode: project\ninbox: committed\n` → `.inbox === 'committed'`; ohne Schlüssel → `'local'`; `inbox: local` → `'local'`.
  - Fehlerfälle (an die vorhandene Tabelle der Fehlertests anhängen): `path: .\nmode: private\ninbox: committed\n` → `/inbox nur bei mode: project/`; `mode: project` mit `inbox: Committed`, `inbox: true`, `inbox: 1` → `/inbox muss local oder committed sein/`.
  - `formatBrainConfig('knowledge', 'project', false, 'committed')` endet mit `path: knowledge\nmode: project\ninbox: committed\n`; mit `'local'` (und Default) ist die Ausgabe identisch zu heute (kein `inbox`-Schlüssel); `private` schreibt nie `inbox`.
  - `rewriteBrainConfig` auf einer `brain.yml` mit `inbox: committed` liefert `false` (unverändert) nach einmaligem Schreiben, `inbox: committed` bleibt erhalten.
  - Session-Test: `sessionLines` einer Config mit `inbox: 'committed'` enthält `Brain: knowledge/ (mode: project, inbox: committed, search: hybrid)`; mit `'local'` bleibt die Zeile wie bisher.
  - Bestehende `deepEqual`-Erwartungen in `config.test.ts:10` und `:16` um `inbox: 'local'` ergänzen.
- [ ] **Schritt 2: Tests laufen lassen** – `npm --prefix scripts test` → die neuen Tests schlagen fehl.
- [ ] **Schritt 3: Implementieren.** `KEYS` um `'inbox'`; Validierung nach `mode` (erst Wertprüfung `muss local oder committed sein`, dann `record.mode !== 'project'` → `inbox nur bei mode: project`, nur wenn der Wert `committed` ist; `inbox: local` bei `private` ist ebenfalls ein Fehler, damit die Regel „nur Projektmodus“ eindeutig bleibt); `rewriteBrainConfig` übergibt `config.inbox`; `sessionLines` fügt `, inbox: committed` nach dem Modus (vor `search`) nur bei `committed` ein.
- [ ] **Schritt 4: Tests und `npm --prefix scripts run typecheck`** → grün.

---

### Task 2: Template-Varianten, `init --update`, `brain check`-Vorlagenprüfung

**Files:**
- Create: `template/_gitignore.committed` (wie `_gitignore`, aber ohne `inbox/*` und `!inbox/.gitkeep`), `template/_gitattributes.committed` (wie `_gitattributes` plus Zeile `inbox/** -text`)
- Modify: `scripts/src/init.ts` (`templateFiles` Z. 40–52, `staleTemplateFiles`, `outdatedTemplateFiles`, `updateBrainConfig` Z. 82)
- Modify: `scripts/src/check.ts` (`checkBrain` Z. 163–168 und Aufruf Z. 201), `scripts/src/cli.ts` (`check`-Aufruf Z. 320, `init --update`-Aufruf Z. 413)
- Test: `scripts/test/init.test.ts`, `scripts/test/check.test.ts`

**Interfaces:**
- Consumes: `BrainInbox` aus Task 1.
- Produces: `updateBrainConfig(brainDir: string, pushGuard: boolean, templateDir = TEMPLATE_DIR, inbox: BrainInbox = 'local'): string[]`
- Produces: `outdatedTemplateFiles(brainDir: string, templateDir = TEMPLATE_DIR, inbox: BrainInbox = 'local'): string[]`
- Produces: `checkBrain(root, mode, level, pushGuard, inbox: BrainInbox = 'local')` (neuer 5. Parameter)

- [ ] **Schritt 1: Fehlschlagende Tests schreiben:**
  - `updateBrainConfig(dir, false, TEMPLATE_DIR, 'committed')` schreibt `.gitignore` **ohne** `inbox/*`, **mit** `INDEX.md`, `graph.json`, `LOG.md`; `.gitattributes` enthält `inbox/** -text` sowie `archive/** -text`. Die Dateien `_gitignore.committed`/`_gitattributes.committed` tauchen im Zielordner nicht auf.
  - Mit Default (`'local'`) sind `.gitignore`/`.gitattributes` byte-identisch zu `template/_gitignore`/`_gitattributes` (Regression).
  - `outdatedTemplateFiles(dir, TEMPLATE_DIR, 'committed')` ist leer nach `updateBrainConfig(..., 'committed')`; enthält `.gitignore` und `.gitattributes`, wenn zuvor die `local`-Variante geschrieben wurde.
  - Per CLI (`runCli` aus `helpers.ts`, Signatur dort prüfen): Projekt-Repo mit `brain.yml` `inbox: committed` → `brain init --update` lässt `brain.yml` unverändert und schreibt die committed-Varianten.
  - `brain check` in einem Repo mit `inbox: committed` und frisch aktualisierten Vorlagen meldet keinen Hinweis „Vorlagen veraltet“.
  - **CRLF-Rename (Akzeptanzkriterium):** Git-Repo mit committed-Varianten, CRLF-Notiz in `inbox/` committen, `archiveNote(...)` aufrufen, `git add -A`, `git status --porcelain` enthält `R  inbox/…` → `archive/…`, und `readFileSync` des Archivs ist byte-identisch zum Original (CRLF erhalten).
- [ ] **Schritt 2: Fehlschlag prüfen** – `npm --prefix scripts test`.
- [ ] **Schritt 3: Implementieren.** `templateFiles(templateDir, inbox, prefix = '')`: Dateien mit Endung `.committed` werden im Modus `local` übersprungen; im Modus `committed` ersetzt `X.committed` die Quelle für Ziel `X` (und `X` selbst wird übersprungen). `RENAMES` bleibt für `_gitignore`/`_gitattributes`; `.committed` vor dem Rename abschneiden. `inbox` an `staleTemplateFiles`, `outdatedTemplateFiles`, `updateBrainConfig` durchreichen. `checkBrain` bekommt den 5. Parameter und gibt ihn an `outdatedTemplateFiles(root, TEMPLATE_DIR, inbox)`; `cli.ts` übergibt `config?.inbox` bzw. `current.inbox`.
- [ ] **Schritt 4: Tests, `typecheck`** → grün.

---

### Task 3: `brain list-inbox`

**Files:**
- Create: `scripts/src/inbox.ts`, `scripts/test/inbox.test.ts`
- Modify: `scripts/src/cli.ts` (`HELP`-Text, neuer `case 'list-inbox'`)

**Interfaces:**
- Consumes: `BrainInbox`.
- Produces: `export function listInbox(root: string, inbox: BrainInbox): string[]` – Pfade relativ zum Wissens-Ordner (`inbox/<datei>`), ohne `.gitkeep`, nur direkte Dateien in `inbox/`.
- Sortierung `local`: mtime aufsteigend, Gleichstand Dateiname. Sortierung `committed`: committete Dateien nach Committer-Datum (`%ct`) ihres jüngsten Add-Commits (`git log --diff-filter=A --format=%ct -1 -- <datei>`), Gleichstand Dateiname; nicht committete Dateien oder fehlende Historie danach, untereinander nach mtime, dann Name.
- CLI: `brain list-inbox` gibt einen Pfad pro Zeile aus; Argumente sind ein Fehler (`Verwendung: brain list-inbox`).

- [ ] **Schritt 1: Fehlschlagende Tests** (`inbox.test.ts`, temporäres Git-Repo, Commits mit `GIT_COMMITTER_DATE`/`GIT_AUTHOR_DATE` per `execFileSync`-Env):
  - `committed`: drei Notizen `b.md`, `a.md`, `c.md`, in dieser Reihenfolge mit steigenden Commit-Zeiten committet, mtime absichtlich umgekehrt (`utimesSync`) → Ergebnis `['inbox/b.md', 'inbox/a.md', 'inbox/c.md']`.
  - Gleichstand: zwei Notizen im selben Commit → alphabetisch.
  - Uncommittete Notiz (`z.md`) steht hinter den committeten, obwohl ihr mtime älter ist.
  - `local`: Reihenfolge folgt dem mtime, nicht dem Commit; Gleichstand nach Name.
  - Nur `.gitkeep` oder leer → `[]`. Dateiname mit Leerzeichen und Umlaut (`größe notiz.md`) wird korrekt sortiert/zurückgegeben.
  - `committed` in einem Ordner ohne Git-Repo → Fallback mtime, kein Fehler.
  - CLI-Test: `brain list-inbox` im Projekt-Repo gibt die Zeilen aus, Exit 0; leere Inbox → leere Ausgabe, Exit 0.
- [ ] **Schritt 2: Fehlschlag prüfen.**
- [ ] **Schritt 3: Implementieren** – `readdirSync(inbox)` ohne `.gitkeep`, Sortierschlüssel wie oben; `execFileSync('git', ['-C', root, 'log', …, '--', rel])` mit try/catch (jeder Fehler → „nicht committet“). Hilfetext (Englisch) in `HELP` ergänzen.
- [ ] **Schritt 4: Tests, `typecheck`** → grün.

---

### Task 4: Hinweis zu uncommitteten Inbox-Notizen in `brain check`

**Files:**
- Modify: `scripts/src/check.ts:188-194`
- Test: `scripts/test/check.test.ts`

**Interfaces:**
- Consumes: `checkBrain(..., inbox)` aus Task 2.

- [ ] **Schritt 1: Test:** Git-Repo mit `inbox: committed` und einer uncommitteten Notiz `inbox/x.md` → Hinweise enthalten zusätzlich einen Text, der `inbox/` und „mitcommitten“ nennt (`/inbox\/.*mitcommitten/`). Im Modus `local` (Default) bleibt der Hinweistext exakt wie bisher.
- [ ] **Schritt 2: Fehlschlag prüfen.**
- [ ] **Schritt 3: Implementieren:** Wenn `inbox === 'committed'` und `changed` Pfade mit Präfix `inbox/` enthält, einen zweiten Hinweis anhängen: `<n> Notiz(en) in inbox/ nicht committet – im Modus inbox: committed gehören Notizen mit in den Branch committet (kein Ingest im Feature-Branch)`.
- [ ] **Schritt 4: Tests grün.**

---

### Task 5: Plugin-Texte (`ingest.md`, `SKILL.md`)

**Files:**
- Modify: `plugin/commands/ingest.md` (Z. 8, 1.1, 1.4, „Wiederaufsetzen“), `plugin/skills/brain/SKILL.md` (Z. 11, 19, 29)
- Prüfung: vorhandene Textprüf-Tests (`grep -ln "ingest.md\|SKILL.md" scripts/test/*.ts`), falls vorhanden mitlaufen lassen.

Der Modus steht in der Kontextzeile `Brain: … inbox: committed …` (Task 1). Ohne diesen Teil gilt das bisherige Verhalten wortgleich.

- [ ] **Schritt 1: `ingest.md` anpassen:**
  - Z. 8 (`$ARGUMENTS`): bisheriges Verhalten bei fehlendem `inbox: committed`. Bei `inbox: committed`: Notiz als `inbox/chat-note-$(date +%Y%m%d-%H%M%S).md` speichern, **nicht ingesten**, Nutzer sagen: „Notiz committen (`git add <Wissens-Ordner>/inbox && git commit …`); Ingest erst nach dem Merge auf dem Basis-Branch“, dann Ende.
  - Neuer Schritt 1.0 (nur bei `inbox: committed`): Aktuellen Branch (`git branch --show-current`) mit dem Basis-Branch (`git symbolic-ref --short refs/remotes/origin/HEAD` ohne `origin/`) vergleichen; weicht er ab, **warnen** („Ingest im Modus `committed` gehört auf den Basis-Branch nach den Merges; hier im Feature-Branch entsteht die Gefahr von Konflikten und stalem Wiki“), aber weitermachen. Ist der Basis-Branch nicht ermittelbar: ohne Warnung weiter.
  - Z. „1.4“: `ls -tr inbox/` ersetzen durch `brain list-inbox` (Ausgabe ist bereits älteste zuerst; `.gitkeep` ist schon ausgeschlossen). Satz ergänzen, dass die Reihenfolge im Modus `committed` dem Add-Commit folgt und bei Widersprüchen weiter der Nutzer gefragt wird.
  - „Wiederaufsetzen nach Abbruch“: Zusatz für `committed`: Alles ist im Git, `git restore inbox/ archive/ wiki/ categories.yml` und `git clean -n/-f inbox/ archive/ wiki/` genügen; Verschieben zurück entfällt.
  - Z. „Nicht committen“ (3.7) unverändert; bei `committed` den Vorschlag auf „eigener Ingest-PR“ erweitern.
- [ ] **Schritt 2: `SKILL.md` anpassen:** Beispiele der Kontextzeile (Z. 11) um `inbox: committed` ergänzen; Z. 19: `inbox/` – Rohnotizen, die auf `/brain:ingest` warten (standardmäßig nicht in Git; mit `inbox: committed` im Git); Z. 29 (diktierte Notiz): bei `inbox: committed` als `inbox/chat-note-<YYYYMMDD-HHMMSS>.md` speichern und **nicht** ingesten, sondern den Nutzer auf Commit und späteren Ingest hinweisen.
- [ ] **Schritt 3: Prüfen:** `grep -n "ls -tr\|chat-note" plugin -r` zeigt nur noch die gewollten Stellen; `npm --prefix scripts test` grün.

---

### Task 6: README

**Files:**
- Modify: `README.md` (Z. 80, 131–150 `brain.yml`, 310 Usage, 369, 384 CLI; neuer Abschnitt nach „Two modes“, vor „Private mode: push guard and backup“, genauer: nach „Project mode: what is shared“)

- [ ] **Schritt 1: Neuer Abschnitt „Several branches: committed inbox (project mode)“** (Englisch), mit hervorgehobenem Hinweis, dass der Ablauf unintuitiv ist:
  - Problem in zwei Sätzen (Textkonflikte in `wiki/`; stiller stale Ingest, weil Branches erst gesammelt gemergt werden).
  - Ablauf als nummerierte Liste/Diagramm: (1) im Feature-Branch nur Rohnotiz nach `inbox/`, mitcommitten, **kein** `/brain:ingest`; (2) Branches werden gemergt; (3) **nach dem Merge** `/brain:ingest` auf dem Basis-Branch, eine Person, eigener Ingest-PR; (4) `brain list-inbox` zeigt die Reihenfolge.
  - Aktivieren: `inbox: committed` in `brain.yml`, `brain init --update`, committen; nur `mode: project`.
  - Hinweise: Inbox enthält Eingaben mehrerer Autoren (Prompt-Injection-Regeln gelten weiter); `LOG.md` bleibt lokal, Historie liegt in `archive/` im Git; Umstellen: vorhandene lokale Notizen erscheinen im Git-Status; Ingest im Feature-Branch warnt nur.
- [ ] **Schritt 2: Bestehende Stellen angleichen:** Z. 80 („Not committed … notes waiting in `inbox/`“ → „by default; with `inbox: committed` they are committed“); Z. 369 analog (nur noch lokal, wenn `inbox: local`); `brain.yml`-Beispiel/Tabelle um `inbox` (`local` Default, `committed` nur bei `mode: project`, nicht geschrieben wenn `local`) und Satz „missing keys are written with their default“ präzisieren; Usage Z. 310 um Verweis; CLI-Highlights um `brain list-inbox`.
- [ ] **Schritt 3: Prüfen:** `grep -n "inbox" README.md` – keine Aussage widerspricht dem neuen Verhalten (Akzeptanzkriterium 4).

---

### Task 7: Version und Gesamtprüfung

**Files:**
- Modify: `scripts/package.json`, `plugin/.claude-plugin/plugin.json`, ggf. `scripts/package-lock.json` und weitere Stellen aus `grep -rn "0\.6\.2" --exclude-dir=node_modules --exclude-dir=.git .`

- [ ] **Schritt 1:** Alle gefundenen `0.6.2` auf `0.7.0` anheben (nur Versionsangaben, keine Verlaufstexte/Specs).
- [ ] **Schritt 2:** `npm --prefix scripts run typecheck` und `npm --prefix scripts test` – beide ohne Fehler; Ausgabe ansehen (Skill `superpowers:verification-before-completion`).
- [ ] **Schritt 3: Handtest** in `/tmp`-Wegwerfordner (Scratchpad): Projekt-Repo, `brain init --project knowledge`, `inbox: committed` in `brain.yml` setzen, `brain init --update` → `git check-ignore knowledge/inbox/x.md` meldet „nicht ignoriert“, `knowledge/INDEX.md` weiter ignoriert; Private-Repo (`brain init --private .`) → `.gitignore` unverändert (`inbox/*` vorhanden), `brain check` ohne Hinweis.
- [ ] **Schritt 4:** Akzeptanzkriterien 1–4 gegen das Ergebnis abhaken; Ergebnis berichten, **nicht committen**.

---

## Selbst-Review

- **Abdeckung Handoff:** Konfiguration (T1), Templates/`-text` (T2), Reihenfolge (T3, T5), kollisionsfreie Namen (T5), Texte (T5, T6), „Nie committen“ unverändert (T5), `LOG.md`-Einschränkung dokumentiert (T6); Tests des Handoffs: init/update (T2), CRLF/Rename (T2), Sortierung (T3), Namen (T5, per Text-Grep, da Prompt).
- **Neu gegenüber dem Handoff:** `brain.yml`-Erhalt durch `rewriteBrainConfig` (T1), Kontextzeile (T1), kein Ingest bei diktierter Notiz im Modus `committed` (T5), Warnung auf Nicht-Basis-Branch (T5), `brain check`-Vorlagenprüfung mit Variante (T2).
- **Bekannte Grenzen:** Sortierung bei Squash-Merge: alle Notizen eines PRs haben denselben Zeitpunkt, Gleichstand nach Dateiname (Ticketpräfix); Shallow-Clones fallen auf mtime zurück.
