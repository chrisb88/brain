# Plugin und einheitliche Brain-Struktur – Design

Datum: 2026-10-06
Status: Entwurf zur Review
Bezug: ersetzt in den genannten Punkten `2026-10-03-data-repo-separation-design.md` (Abschnitte 2–6) und ergänzt `2026-10-03-second-brain-design.md`. Wo diese Spec abweicht, gilt diese Spec. Folgt: Spec 2 „Sprache und Teamfähigkeit“ (Entscheidungen: `docs/superpowers/notes/2026-10-07-spec2-decisions.md`).

## 1. Ziel

brain verwaltet nicht nur privates Wissen, sondern auch als **geteiltes Projektwissen**, das im Repository eines Projekts liegt, mit eingecheckt und vom Team genutzt wird. Claude nutzt es beim normalen Arbeiten am Code (Claude Code läuft im Projekt-Root).

Beide Einsatzarten haben **denselben Aufbau**; „privat“ ist ein Projekt-Wissens-Ordner plus Push-Schutz. Befehle, Regeln und MCP-Server kommen aus einem **Claude-Code-Plugin** statt aus Dateien, die in den Wissens-Ordner kopiert werden.

**Erfolgskriterium:**
- `brain init` legt in einem bestehenden Projekt-Repo einen Wissens-Ordner an, ohne Dateien des Projekts (`CLAUDE.md`, `.mcp.json`) anzufassen; Claude im Projekt-Root hat `/brain:ingest`, `/brain:ask`, den Skill `brain` und die qmd-Suche.
- `brain init --private` ergibt einen Wissens-Ordner mit Push-Schutz wie bisher.
- Mehrere Wissens-Ordner auf einer Maschine haben getrennte qmd-Indexe; `brain check` erkennt einen Index, der auf fremde Pfade zeigt.
- Rechner ohne ausreichende Leistung nutzen brain mit `BRAIN_SEARCH=keyword` oder `off`.

**Nicht im Umfang:** Migration bestehender Daten (es ist noch nichts im Einsatz), npm-Veröffentlichung, Erneuern des Index bei Branchwechsel mitten in einer Sitzung, IDs und Sprache (Spec 2).

## 2. Begriffe

- **Repository:** das Git-Repository, in dem der Wissens-Ordner liegt (Projekt-Repo oder eigenes privates Repo).
- **Konfigurationswurzel:** Ordner mit `brain.yml` – immer das Root des Repositorys.
- **Wissens-Ordner:** der Ordner mit den Daten (`path` aus `brain.yml`, Standard `knowledge`). Alle bisherigen Pfadangaben „relativ zur Brain-Wurzel“ der älteren Specs (`wiki/`, `archive/`, `categories.yml`, …) beziehen sich auf den Wissens-Ordner.

## 3. Aufbau

```
<repository>/
  brain.yml                 # in Git
  .claude/settings.json     # Plugin-Aktivierung (von claude plugin install --scope project)
  knowledge/                # Wissens-Ordner, Name frei, auch "."
    categories.yml          # in Git
    .gitignore              # aus template/, in Git
    .gitattributes          # aus template/, in Git
    CLAUDE.md               # aus template/, kurzer Hinweis, in Git
    inbox/.gitkeep          # Inhalt von inbox/ nicht in Git
    archive/ wiki/          # in Git
    INDEX.md graph.json LOG.md   # lokal, nicht in Git
```

**`brain.yml`:**

```yaml
# Brain configuration. Created by brain init.
path: knowledge      # knowledge folder, relative to this file
mode: project        # project | private
```

- `path`: relativer Pfad, muss nach Auflösung innerhalb der Konfigurationswurzel liegen (`.` erlaubt); sonst Fehler.
- `mode`: `project` oder `private`; anderer Wert → Fehler.
- Unbekannte Schlüssel → Fehler (Tippfehler sollen auffallen). Spec 2 ergänzt `language`.

**`.gitignore` im Wissens-Ordner** (Pfade relativ zum Wissens-Ordner, gilt dank Git für verschachtelte `.gitignore` in beiden Modi gleich): `INDEX.md`, `graph.json`, `LOG.md`, `inbox/*`, `!inbox/.gitkeep`, `.obsidian/`.

**`CLAUDE.md` im Wissens-Ordner** (aus `template/`, fertige Datei ohne Platzhalter): zwei, drei Sätze – „Dies ist ein Wissens-Ordner. Regeln stehen im Skill `brain` des Plugins; Dateien nur über `/brain:ingest` bzw. `brain …` ändern; `INDEX.md`, `graph.json`, `LOG.md` nie bearbeiten.“

## 4. Wissens-Ordner finden

`brainConfig()` liefert Konfigurationswurzel, Wissens-Ordner und Modus:

1. `BRAIN_ROOT` gesetzt → zeigt auf die **Konfigurationswurzel** (Ordner mit `brain.yml`); fehlt dort `brain.yml` → Fehler.
2. Sonst von den Startverzeichnissen (wie bisher: `cwd` bzw. `INIT_CWD` in npm-Scripts, dann `CLAUDE_PROJECT_DIR`) aufwärts das erste Verzeichnis mit `brain.yml`.
3. Sonst Fehler: „Kein Wissens-Ordner gefunden – im Repository ausführen oder BRAIN_ROOT setzen.“

Damit funktioniert jeder Aufruf aus dem Projekt-Root, aus beliebigen Unterordnern und aus dem Wissens-Ordner selbst. Die Suche nach `categories.yml` entfällt. `brainRoot()` (Wissens-Ordner) bleibt als dünne Hülle, damit die übrigen Module unverändert mit dem Wissens-Ordner arbeiten.

**Git im Unterordner:** Git-Aufrufe laufen mit `-C <Wissens-Ordner>`; Pfadangaben (`-- archive`) sind dann relativ zum Wissens-Ordner. Ausgaben von `git status --porcelain` sind dagegen relativ zum Repo-Root. `archiveIntegrityErrors` liest heute `join(root, path)` mit einem Repo-relativen Pfad – das ist bei `path ≠ .` falsch und wird korrigiert (Repo-Root über `git rev-parse --show-toplevel`). Tests decken beide Fälle ab (`path: .` und `path: knowledge`).

## 5. `brain init`

**`brain init [--private] [<pfad>]`** – arbeitet im aktuellen Verzeichnis (`callerDir()`):

1. Repo bestimmen: `git rev-parse --show-toplevel`.
   - Kein Git-Repo: ohne `--private` Fehler („brain init muss in einem Git-Repository laufen; für einen privaten Wissens-Ordner: brain init --private“); mit `--private` → `git init` im aktuellen Verzeichnis.
2. Fehler, wenn im Repo-Root schon `brain.yml` liegt.
3. Pfad bestimmen: `<pfad>` als Argument (relativ zum Repo-Root); fehlt er und ist stdin ein Terminal → Abfrage `Wissens-Ordner [knowledge]:`; fehlt er ohne Terminal → Fehler „Pfad angeben: brain init [--private] <pfad>“.
4. Pfad muss im Repo liegen (kein `..` nach oben hinaus, kein absoluter Pfad außerhalb). Fehler, wenn dort bereits `categories.yml`, `wiki/`, `archive/`, `inbox/`, `.gitignore`, `.gitattributes` oder `CLAUDE.md` existiert – so werden nie Dateien des Projekts überschrieben. (Bewusst nicht „Ordner muss leer sein“; `.` ist damit praktisch nur in neuen bzw. privaten Repos möglich.)
5. `--private`: Fehler, wenn das Repo ein Remote hat – geprüft, bevor etwas geschrieben wird.
6. Schreiben: `brain.yml`; Wissens-Ordner mit Dateien aus `template/`; `inbox/.gitkeep`, `archive/`, `wiki/`; `categories.yml` (leer, über `saveCategories`).
7. `--private`: Push-Schutz installieren (wie bisher, Abschnitt 5 der Trennungs-Spec; Markierungszeile neu `# brain: this repository must never be pushed.`).
8. `brain index`.
9. qmd einrichten gemäß `BRAIN_SEARCH` (Abschnitt 8); fehlt qmd oder schlägt es fehl → Hinweis, `init` bleibt erfolgreich.
10. Plugin aktivieren: `claude plugin install brain@brain --scope project` im Repo-Root. Fehlt `claude` oder schlägt es fehl → Hinweis mit genau diesem Befehl.
11. **Kein Commit.** Ausgabe: angelegte Dateien und nächster Schritt („Änderungen prüfen und committen; Claude Code im Repo starten“).

Die Prüfung der Git-Identität entfällt (kein Commit mehr).

**`brain init --update`** – in einem bestehenden Wissens-Ordner (Abschnitt 4): überschreibt nur die Dateien aus `template/` im Wissens-Ordner (`.gitignore`, `.gitattributes`, `CLAUDE.md`), installiert bei `mode: private` den Push-Schutz neu. Daten, `brain.yml` und `categories.yml` werden nie angefasst. Kein Commit; Ausgabe listet geänderte Dateien.

`template/` enthält danach nur noch: `_gitignore`, `_gitattributes`, `CLAUDE.md`. Entfernt werden `template/.claude/`, `template/.mcp.json`, `template/wiki/CLAUDE.md` (Inhalt wandert ins Plugin).

## 6. Plugin

Das Repository (künftig `brain` auf GitHub, Umbenennung macht der Nutzer) ist zugleich **Marketplace** und enthält das Plugin in einem Unterordner – damit lädt eine Entwicklungssitzung im Code-Repo das Plugin nicht versehentlich als Projektkonfiguration.

```
<code-repo>/
  .claude-plugin/marketplace.json   # name: brain, plugin "brain" → ./plugin
  plugin/
    .claude-plugin/plugin.json      # name: brain, version = scripts/package.json version
    commands/ingest.md              # /brain:ingest
    commands/ask.md                 # /brain:ask
    skills/brain/SKILL.md           # Regeln, Suchleiter, CLI-Übersicht (aus template/CLAUDE.md)
    skills/brain/writing.md         # Schreibregeln (aus template/wiki/CLAUDE.md)
    hooks/hooks.json                # SessionStart → brain session-start "${CLAUDE_PLUGIN_ROOT}"
    .mcp.json                       # qmd → brain qmd mcp
  scripts/                          # CLI wie bisher
  template/
  install.sh
```

**Skill `brain`:** Beschreibung so, dass er bei Fragen zum Wissen des Projekts greift (Architekturentscheidungen, Fachbegriffe, „warum ist das so“, „was wissen wir über …“) und wenn der Nutzer eine Notiz diktiert. Inhalt: Aufbau, feste Regeln, Suchleiter je Suchstufe (Abschnitt 8), CLI-Tabelle, Verweis auf `writing.md`. Außerhalb von `/brain:ingest` nur lesen.

Inhaltliche Änderungen gegenüber den bisherigen Vorlagen:
- Regel „Nie `git push`, nie ein Remote“ gilt nur bei `mode: private` (die Kontextzeile des Hooks nennt den Modus).
- „Das CLI stammt aus dem Code-Repository …“, Einrichtungsschritte und der veraltete Spec-Pfad entfallen; Einrichtung steht im README.
- Pfade sind relativ zum Wissens-Ordner; die Kontextzeile nennt ihn.

**`/brain:ingest`** (aus `template/.claude/commands/ingest.md`), Änderungen:
- Vorprüfung: `git status --porcelain -- <Wissens-Ordner>` muss leer sein (statt des ganzen Repos). Folge: Vor dem nächsten Ingest muss der vorige committet sein – das hält das Wiederaufsetzen eindeutig.
- Abschluss: kein `git commit`. Stattdessen Hinweis an den Nutzer: „Änderungen im Wissens-Ordner prüfen und committen.“ Vorschlag für die Commit-Nachricht ausgeben (`ingest: <n> Notizen – <Themen>`).
- Index-Aktualisierung am Ende gemäß Suchstufe (Abschnitt 8).
- Wiederaufsetzen: Pfade relativ zum Wissens-Ordner.

**`/brain:ask`** (aus `template/.claude/commands/ask.md`): Suche gemäß Suchstufe; sonst unverändert.

**MCP-Server** (`plugin/.mcp.json`): `{"mcpServers": {"qmd": {"command": "brain", "args": ["qmd", "mcp"]}}}`. `brain qmd mcp` findet den Wissens-Ordner über Abschnitt 4. Spike in der Umsetzung: prüfen, mit welchem `cwd` bzw. welchen Umgebungsvariablen Claude Code Plugin-MCP-Server startet; reicht das nicht, `"env": {"CLAUDE_PROJECT_DIR": "${CLAUDE_PROJECT_DIR}"}` durchreichen – `brain` sucht von dort aufwärts nach `brain.yml` und funktioniert damit auch, wenn Claude in einem Unterordner gestartet wurde.

**Hook `SessionStart`** → `brain session-start <plugin-root>`; ist `brain` nicht im PATH (Teammitglied ohne `install.sh`), gibt der Hook stattdessen die Zeile „Brain: CLI brain fehlt – einmal ./install.sh aus dem brain-Klon ausführen“ aus und endet mit Exit 0:
1. Kein Wissens-Ordner gefunden → Exit 0 ohne Ausgabe.
2. Ausgabe einer Kontextzeile auf stdout, z. B. `Brain: knowledge/ (mode: project, search: keyword)`.
3. Versionen vergleichen: `version` aus `<plugin-root>/.claude-plugin/plugin.json` gegen die CLI-Version (`scripts/package.json`). Abweichung → zusätzliche Zeile `Warnung: Plugin 1.2.0 und CLI 1.1.0 passen nicht zusammen – Klon aktualisieren (git pull) bzw. claude plugin update brain@brain.`
4. Hintergrund-Aktualisierung als abgekoppelter Prozess (`spawn` mit `detached: true`, `stdio: 'ignore'`, `unref()`): `brain index`, bei Suchstufe ≠ `off` danach `brain qmd update`. Der Hook kehrt sofort zurück. Lässt sich das Abkoppeln nicht zuverlässig umsetzen, entfällt Schritt 4 (Index nur von Hand bzw. per `/brain:ingest`).
5. Exit 0 auch bei Fehlern in Schritt 3–4 (der Hook darf eine Sitzung nie verhindern).

**Aktivierung:** pro Projekt (`--scope project`, Abschnitt 5 Schritt 10). Spike in der Umsetzung: prüfen, ob `claude plugin install --scope project` den Marketplace (`extraKnownMarketplaces`) in `.claude/settings.json` einträgt, sodass Teammitglieder beim Start das Plugin angeboten bekommen. Falls nicht: README beschreibt den Eintrag, den das Projekt einmal von Hand ergänzt.

**`install.sh`** (Repo-Root, POSIX-sh, idempotent):
1. Prüft Node ≥ 24 und `git`.
2. `npm --prefix scripts install` und `npm --prefix scripts link`.
3. Ist `claude` vorhanden: `claude plugin marketplace add chrisb88/brain` (Fehler, weil schon vorhanden, wird ignoriert); sonst Hinweis.
4. Hinweis auf qmd (`npm install -g @tobilu/qmd`) und `BRAIN_SEARCH`.

## 7. CLI-Änderungen im Überblick

| Befehl | Änderung |
|---|---|
| `brain init` | Abschnitt 5 |
| `brain session-start <plugin-root>` | neu, nur für den Hook (in `brain help` als intern markiert) |
| `brain qmd setup` | je Suchstufe (Abschnitt 8) |
| `brain qmd mcp` | bei `off`: Exit 1 mit Meldung „BRAIN_SEARCH=off – qmd-MCP-Server bitte über /mcp deaktivieren“ |
| `brain qmd prune` | neu (Abschnitt 8) |
| `brain check` | Push-Schutz nur bei `private`; qmd-Prüfungen je Suchstufe; Hinweis auf uncommittete Änderungen im Wissens-Ordner |
| `brain --version` | neu, gibt die CLI-Version aus |
| alle übrigen | unverändert, arbeiten auf dem Wissens-Ordner |

## 8. qmd

### 8.1 Suchstufen

Umgebungsvariable `BRAIN_SEARCH` = `hybrid` (Standard) | `keyword` | `off`; gilt pro Maschine, steht nicht in `brain.yml`. Anderer Wert → Fehler bei jedem `brain`-Aufruf, der die Stufe braucht.

| Stufe | Suche im Skill / in den Befehlen | `brain qmd setup` | Hook / Ingest-Abschluss |
|---|---|---|---|
| `hybrid` | MCP-Tool `query` mit freier Anfrage (`query: "…"`) | Collections, Kontexte, `models.embed`, `update`, `embed` | Hook: `update`; Ingest: `update` + `embed` |
| `keyword` | MCP-Tool `query` mit `searches: [{type: "lex", query: "…"}]`, `rerank: false` | Collections, Kontexte, `update` – kein Modell, kein `embed` | `update` |
| `off` | `INDEX.md` und Grep | übersprungen mit Hinweis | – |

Bei allen Stufen bleibt `INDEX.md` Teil der Suchleiter. Ist der MCP-Server nicht erreichbar, gilt der bisherige Ausweichweg (INDEX.md + Grep, Nutzer informieren).

### 8.2 Ein Modell für alle Sprachen

`models.embed` bleibt Qwen3-Embedding-0.6B (mehrsprachig). Reranker und Anfrage-Erweiterung bleiben qmd-Standard. Keine sprachabhängige Modellwahl.

### 8.3 Indexname

`brain-<slugify(Ordnername der Konfigurationswurzel)>-<hash>`, `<hash>` = die ersten 8 Hex-Zeichen von sha256 über den absoluten, per `realpath` aufgelösten Pfad des Wissens-Ordners. Beispiel: `brain-shop-api-3f9a1c2e`.

- Zwei Klone bzw. Worktrees desselben Projekts haben getrennte Indexe (gewollt: Inhalt kann je Branch abweichen).
- Verschieben des Repos ergibt einen neuen Namen; `brain check` meldet dann „qmd-Index fehlt – `brain qmd setup`“, der alte wird mit `brain qmd prune` entfernt.

### 8.4 Prüfungen in `brain check`

Je Suchstufe (alles **Hinweise**, außer Fremdpfad = **Fehler**):

| Prüfung | hybrid | keyword | off |
|---|---|---|---|
| Index-Konfiguration `~/.config/qmd/<name>.yml` fehlt → Hinweis `brain qmd setup` | ✓ | ✓ | – |
| Collections `wiki`/`archive` zeigen nicht auf `<Wissens-Ordner>/wiki` bzw. `/archive` → **Fehler** | ✓ | ✓ | – |
| `models.embed` fehlt oder weicht vom Sollwert ab → Hinweis `brain qmd setup` | ✓ | – | – |

Der Fremdpfad ist ein Fehler, weil dann Suchergebnisse aus einem anderen Wissens-Ordner kämen.

### 8.5 `brain qmd prune`

1. Alle `brain-*.yml` im qmd-Konfigurationsordner (`QMD_CONFIG_DIR` bzw. `$XDG_CONFIG_HOME/qmd` bzw. `~/.config/qmd`) lesen.
2. Verwaist = Pfad der Collection `wiki` existiert nicht mehr (oder Datei hat keine Collection `wiki`).
3. Liste ausgeben (Indexname, früherer Pfad). Keine verwaist → „Nichts zu tun.“
4. Rückfrage `Löschen? [y/N]` (nur mit Terminal; ohne Terminal nur auflisten, Option `--yes` löscht ohne Rückfrage).
5. Löschen: die `.yml` und im qmd-Cache-Ordner `<name>.sqlite` samt `-shm`/`-wal`. Den Cache-Ordner bestimmt die Umsetzung so, wie qmd ihn bestimmt (im qmd-Quelltext nachsehen; mindestens `~/.cache/qmd`, `XDG_CACHE_HOME` berücksichtigen); für Tests über eine Umgebungsvariable überschreibbar.
6. Nie Dateien anfassen, die nicht mit `brain-` beginnen.

## 9. README und Umbenennung

- README neu: Zweck (privat und Projekt), Installation (`git clone …`, `./install.sh`), Wissens-Ordner anlegen (`brain init` / `brain init --private`), Teammitglieder (Klon des Projekts → Plugin wird angeboten; CLI per `install.sh`), Suchstufen, Befehle.
- Namen: Repo `brain`, Marketplace `brain`, Plugin und CLI `brain`. `scripts/package.json` → `name: brain-cli`.
- `CLAUDE.md` des Code-Repos: Aufbau (`plugin/`, `template/`, `install.sh`) und Hinweis aktualisieren, dass Benutzung im Repository bzw. Projekt erfolgt.
- Erledigt damit aus `notes/offene-punkte.md`: Punkt 2 (veralteter Verweis) entfällt.

## 10. Tests

Alle in temporären Ordnern (`scripts/test/helpers.ts`), nie gegen echte Daten.

- **`brain.yml`:** gültige Datei; Fehler bei `path` außerhalb, unbekanntem `mode`, unbekanntem Schlüssel.
- **Wissens-Ordner finden:** aus Repo-Root, Unterordner des Projekts und Wissens-Ordner; `BRAIN_ROOT` hat Vorrang; Fehler ohne `brain.yml`.
- **`brain init`:** im Projekt-Repo mit Pfad-Argument (kein Push-Schutz, keine Projektdateien verändert, kein Commit); `.` als Pfad; Fehler außerhalb eines Repos ohne `--private`; `--private` legt Repo an und Push-Schutz; `--private` mit Remote → Fehler ohne Schreibzugriff; vorhandene `brain.yml` → Fehler; ohne Pfad und ohne Terminal → Fehler; Pfad außerhalb des Repos → Fehler; `claude` per Stub im `PATH` (Aufruf mit erwarteten Argumenten) und fehlend (Hinweis).
- **`brain init --update`:** überschreibt nur Template-Dateien; Push-Schutz nur bei `private`.
- **Git im Unterordner:** `archiveIntegrityErrors` mit `path: knowledge` (geändert, gelöscht, umbenannt mit gleichem und mit anderem Inhalt).
- **`brain check`:** Push-Schutz-Fehler nur bei `private`; Hinweis bei uncommitteten Änderungen im Wissens-Ordner; qmd-Prüfungen je Suchstufe inkl. Fremdpfad-Fehler.
- **qmd:** Indexname (gleicher Pfad → gleicher Name, anderer Pfad → anderer Name); `brain qmd setup` je Stufe (Stub-`qmd`); `brain qmd mcp` bei `off`; `brain qmd prune` (verwaist vs. aktuell, fremde Dateien bleiben, `--yes`, ohne Terminal nur Liste).
- **`brain session-start`:** ohne Wissens-Ordner keine Ausgabe; Kontextzeile; Versionswarnung; Exit 0 auch bei kaputtem `plugin.json`; Hintergrundprozess wird gestartet, ohne dass der Befehl wartet (Stub-`brain`/`qmd`, Zeitmessung bzw. Markerdatei).
- **Plugin-Dateien:** Test, dass `plugin.json`-Version gleich `scripts/package.json`-Version ist und `marketplace.json` auf `./plugin` zeigt.
- Bestehende Tests werden auf `brain.yml` umgestellt (Helfer legt `brain.yml` mit `path: .` an, damit die meisten Tests unverändert bleiben).
