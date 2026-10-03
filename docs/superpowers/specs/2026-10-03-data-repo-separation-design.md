# Trennung von Code- und Daten-Repository – Design

Datum: 2026-10-03
Status: Entwurf zur Review
Bezug: ergänzt `2026-10-03-second-brain-design.md` (Wissenskern). Wo diese Spec abweicht, gilt diese Spec.

## 1. Ziel

Brain-Daten (Notizen, Archiv, Wiki, Kategorien) und Entwicklung (CLI, Doku) liegen heute im selben Git-Repository. Ingest-Commits mischen sich mit Code-Commits, und ein Push des Codes würde persönliches Wissen mit hochladen.

Ziel: zwei getrennte Repositories. Das Daten-Repository darf **nie** gepusht werden – das muss technisch abgesichert und geprüft sein.

**Erfolgskriterium:** Code-Repo enthält keine Brain-Daten und kann gepusht werden; Daten-Repo hat kein Remote, ein Push wird abgelehnt, `brain check` meldet jeden Verstoß; `/ingest` und `/ask` funktionieren im Daten-Repo wie bisher.

Mehrere Brains (verschiedene Daten-Repos) sind möglich; Wechseln heißt: `brain` bzw. Claude Code im jeweiligen Daten-Repo starten. qmd-Index, MCP-Server und Daten passen dann automatisch zusammen (Abschnitt 6).

**Nicht im Umfang:** Backup der Brain-Daten (eigenes Thema), Migration bestehender Daten (das Brain ist zum Zeitpunkt des Umbaus leer).

## 2. Aufteilung

| Code-Repo `/mnt/f/second-brain` | Daten-Repo `/mnt/f/second-brain-data` |
|---|---|
| `scripts/` (CLI `brain`, Tests) | `inbox/`, `archive/`, `wiki/<kategorie>/…`, `categories.yml` |
| `docs/` (Specs, Pläne, Notizen) | Konfiguration (aus `template/` erzeugt): `CLAUDE.md`, `wiki/CLAUDE.md`, `.claude/commands/ingest.md`, `.claude/commands/ask.md`, `.mcp.json`, `.gitattributes`, `.gitignore` |
| `CLAUDE.md` für die Entwicklung | lokal, nicht in Git: `INDEX.md`, `graph.json`, `LOG.md`, `.obsidian/`, `.claude/settings.local.json` |
| `template/` – Vorlagen der Daten-Repo-Konfiguration | |

- Benutzung (Claude Code mit `/ingest`, `/ask`): im Daten-Repo starten.
- Entwicklung: im Code-Repo starten.
- `template/` spiegelt die Pfade im Daten-Repo 1:1 (z. B. `template/wiki/CLAUDE.md`, `template/.claude/commands/ingest.md`). Die Vorlagen sind fertige Dateien ohne Platzhalter.

## 3. Wurzelverzeichnis von `brain`

`brainRoot()` bestimmt das Brain in dieser Reihenfolge:

1. Umgebungsvariable `BRAIN_ROOT`, falls gesetzt.
2. Vom aktuellen Verzeichnis aufwärts (`cwd`; `INIT_CWD` nur innerhalb von npm-Scripts, erkennbar an `npm_lifecycle_event` – sonst könnte ein von npm geerbtes `INIT_CWD` ein falsches Brain auswählen; danach `CLAUDE_PROJECT_DIR`) das erste Verzeichnis mit einer Datei `categories.yml`.
3. Sonst Fehler: „Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen.“

Der bisherige Standard (`scripts/../..`) entfällt. `brain help` und `brain init` brauchen kein Brain.

## 4. `brain init`

**`brain init <pfad>`** – neues Daten-Repo:

1. Fehler, wenn `<pfad>/categories.yml` bereits existiert oder der Ordner existiert und nicht leer ist (auch bestehende Git-Repos werden abgelehnt – keine fremden Dateien, Remotes oder Hooks übernehmen).
2. Fehler, wenn keine Git-Identität konfiguriert ist (`git var GIT_AUTHOR_IDENT`) – geprüft, bevor etwas geschrieben wird.
3. Ordner anlegen und `git init`.
4. Alle Dateien aus `template/` kopieren; leere Ordner `inbox/` (mit `.gitkeep`), `archive/`, `wiki/` anlegen.
5. `categories.yml` mit leerer Liste über `saveCategories` (inkl. Kommentar-Kopf).
6. Push-Schutz installieren (Abschnitt 5).
7. `brain index`.
8. Erster Commit `init: second brain data repository`.
9. qmd-Index einrichten (Abschnitt 6); schlägt das fehl oder fehlt qmd, nur Hinweis – `init` bleibt erfolgreich.
10. Ausgabe: Pfad und nächste Schritte (qmd-Collections, Claude Code dort starten).

**`brain init --update`** – im bestehenden Daten-Repo (Wurzel laut Abschnitt 3):

- Überschreibt nur die Konfigurationsdateien aus `template/` und installiert den Push-Schutz neu. Daten (`inbox/`, `archive/`, Wiki-Einträge, `categories.yml`) werden nie angefasst.
- Kein automatischer Commit; Ausgabe listet geänderte Dateien.

## 5. Push-Schutz

1. Das Daten-Repo hat kein Remote.
2. Hook `pre-push` (ausführbar) im gemeinsamen Hook-Verzeichnis (`<git-common-dir>/hooks`, gilt auch für `git worktree`), `core.hooksPath` lokal auf diesen **absoluten** Pfad gesetzt; lehnt jeden Push ab:
   ```sh
   #!/bin/sh
   # second-brain: this repository must never be pushed.
   echo "Second Brain: Dieses Daten-Repository darf nicht gepusht werden." >&2
   exit 1
   ```
3. `brain check` meldet als **Fehler**:
   - wenn `git remote` mindestens ein Remote liefert,
   - wenn `core.hooksPath` nicht auf das gemeinsame Hook-Verzeichnis zeigt (z. B. nach Umbenennen des Ordners – `brain init --update` behebt das),
   - wenn der Hook fehlt oder die Markierungszeile `# second-brain: this repository must never be pushed.` nicht enthält.

   Ohne Git-Repo bleibt es beim bisherigen Hinweis.

Hinweis: `/mnt/f` unterstützt Unix-Rechte ggf. nicht; Git unter WSL führt Hooks dort trotzdem aus, wenn das Ausführungsbit gesetzt werden kann. Der Spike in der Umsetzung prüft das; falls nicht ausführbar, ruft der Hook-Test einen Push gegen ein lokales Test-Remote auf und erwartet die Ablehnung.

## 6. qmd: ein Index pro Brain

qmd kennt benannte Indizes: `qmd --index <name> …` nutzt `~/.config/qmd/<name>.yml` (Collections, Kontexte, Modelle) und `~/.cache/qmd/<name>.sqlite`. Damit hat jedes Brain einen eigenen Index; Daten verschiedener Brains mischen sich nicht.

- **Name:** `brain-<slugify(Ordnername der Brain-Wurzel)>`, z. B. `/mnt/f/second-brain-data` → `brain-second-brain-data`.
- **Ort:** im Linux-Home (`~/.config/qmd/`, `~/.cache/qmd/`), **nicht** im Daten-Repo – SQLite-Sperren über die WSL-Brücke nach `/mnt/f` sind unzuverlässig. Der Index ist abgeleitet (wie `INDEX.md`), nicht in Git und nicht Teil eines Backups; er lässt sich jederzeit neu erzeugen.
- **`brain qmd <argumente>`:** ruft `qmd --index <name> <argumente>` im Brain-Wurzelverzeichnis auf und reicht Ein-/Ausgabe und Exit-Code durch. Alle Vorlagen nutzen nur diesen Befehl (keine Platzhalter):
  - `/ingest`: `brain qmd update && brain qmd embed`
  - `.mcp.json`: `{"mcpServers": {"qmd": {"command": "brain", "args": ["qmd", "mcp"]}}}` – setzt voraus, dass Claude Code den Projekt-MCP-Server im Daten-Repo startet (in der Umsetzung prüfen; sonst `BRAIN_ROOT` aus `CLAUDE_PROJECT_DIR` ableiten).
  - `/ask` und das Brain-First-Protokoll nutzen weiter die MCP-Tools des Servers `qmd`.
- **`brain qmd setup`:** richtet den Index des aktuellen Brains ein (idempotent):
  1. Collection `wiki` → `<root>/wiki`, Maske `*/*.md`; Collection `archive` → `<root>/archive`, Maske `**/*.md` (vorhandene gleichnamige Collections werden ersetzt).
  2. Kontexte wie bisher (`qmd://wiki`, `qmd://archive`).
  3. In `~/.config/qmd/<name>.yml` `models.embed` auf `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` setzen (übrige Schlüssel bleiben erhalten).
  4. `qmd --index <name> update` und `embed`.
- **`brain init`** ruft nach dem ersten Commit `brain qmd setup` auf. Ist `qmd` nicht installiert, gibt es einen Hinweis; `init` gilt trotzdem als erfolgreich.
- **`brain check`** gibt einen **Hinweis** (kein Fehler), wenn `~/.config/qmd/<name>.yml` fehlt: „qmd-Index für dieses Brain fehlt – `brain qmd setup` ausführen.“ (Hinweis, weil `check` auch ohne qmd nutzbar bleiben soll.)
- Umbenennen eines Daten-Ordners erzeugt einen neuen Indexnamen; der alte Index bleibt liegen und wird manuell entfernt (`~/.config/qmd/<alt>.yml`, `~/.cache/qmd/<alt>.sqlite`).

## 7. Umzug (einmalig)

1. `brain init /mnt/f/second-brain-data`.
2. Code-Repo: `categories.yml`, `inbox/`, `archive/`, `wiki/`, `.claude/commands/`, `.mcp.json`, `.gitattributes` (Archiv-Regel) entfernen bzw. nach `template/` verschieben; `.gitignore` auf Code-Belange reduzieren; `CLAUDE.md` neu für die Entwicklung.
3. Lokale Dateien `.obsidian/`, `INDEX.md`, `graph.json` im Code-Repo entfernen (bzw. `.obsidian/` ins Daten-Repo verschieben).
4. qmd: Collections `wiki` und `archive` aus dem Standardindex (`~/.config/qmd/index.yml`) entfernen und `qmd cleanup`; der neue Index entsteht über `brain init` → `brain qmd setup`.
5. Haupt-Spec (Abschnitt 3 Ordnerstruktur, Abschnitt 5 CLI) und Einrichtungsanleitung anpassen.

## 8. Tests

- `brainRoot`: `BRAIN_ROOT` hat Vorrang; Suche aufwärts findet die Wurzel aus Unterordnern; Fehler ohne Brain.
- `brain init`: legt Struktur, Konfiguration, `categories.yml`, Hook und ersten Commit an; Fehler bei vorhandenem Brain; `--update` überschreibt nur Konfiguration und lässt Daten unverändert.
- `brain check`: Fehler bei vorhandenem Remote; Fehler bei fehlendem oder fremdem `pre-push`-Hook; kein Fehler bei korrekt eingerichtetem Repo.
- `brain qmd`: Indexname aus dem Wurzelordner; Argumente und Exit-Code werden durchgereicht (Test mit einer Stub-`qmd` im `PATH`).
- `brain qmd setup`: ruft die erwarteten qmd-Befehle auf und setzt `models.embed` in der Index-Konfiguration, ohne andere Schlüssel zu verlieren (Stub-`qmd`, `QMD_CONFIG_DIR` auf Testordner).
- `brain check`: Hinweis bei fehlender Index-Konfiguration.
- Push-Schutz end-to-end: lokales Bare-Repo als Remote eintragen, `git push` muss scheitern.
- Bestehende Tests übergeben die Wurzel direkt bzw. setzen `BRAIN_ROOT`. Der Test-Helfer `initGit` installiert den Push-Schutz über dieselbe Funktion wie `brain init`, damit Tests mit Git-Repo weiterhin ohne Fehler durch `brain check` laufen.
