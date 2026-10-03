# Second Brain – Workspace

Persönliche Wissensbasis für Job- und privates Wissen. Die Markdown-Dateien sind die einzige Wahrheit.
Design und Datenvertrag: `docs/superpowers/specs/2026-10-03-second-brain-design.md` (Abschnitt 4).

@INDEX.md

## Aufbau

- `inbox/` – Rohnotizen, die auf `/ingest` warten (nicht in Git)
- `archive/<kategorie>/YYYY/MM/` – Originalnotizen, byte-identisch, nie ändern oder löschen
- `wiki/<kategorie>/<eintrag>.md` – verdichtete Wissenseinträge; Schreibregeln in `wiki/CLAUDE.md`
- `categories.yml` – die einzigen erlaubten Kategorien; `_uncategorized` ist der reservierte Auffangordner
- `INDEX.md`, `graph.json` – abgeleitet von `brain index` (nicht in Git)
- `LOG.md` – Änderungsprotokoll, nur anhängen, nur über `brain` (nicht in Git)
- `scripts/` – das CLI `brain` (Node/TypeScript, Tests: `npm --prefix scripts test`)

## Einrichtung (frischer Clone oder neuer Rechner)

1. `npm --prefix scripts install && npm --prefix scripts link` – danach ist `brain` im PATH (`brain help`).
2. qmd: `npm install -g @tobilu/qmd`; in `~/.config/qmd/index.yml` unter `models.embed` das Modell `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` eintragen; Collections `wiki` (`--mask "*/*.md"`) und `archive` anlegen, Kontexte setzen, `qmd update && qmd embed`. Befehle, GPU-Einrichtung (CUDA 13 unter WSL, kein Linux-Treiber im WSL) und Messwerte: `docs/superpowers/notes/2026-10-03-qmd-spike.md`.
3. `brain index` – erzeugt `INDEX.md` und `graph.json` (nicht in Git).
4. Claude Code im Repo starten und den Projekt-MCP-Server `qmd` (`.mcp.json`) freigeben; mit `/mcp` prüfen.
5. Optional Obsidian: Ordner als Vault öffnen; `.obsidian/app.json` mit `"newLinkFormat": "absolute"` und `"userIgnoreFilters": ["docs/", "scripts/"]` (lokal, nicht in Git).

## Feste Regeln

- `INDEX.md` und `graph.json` nie bearbeiten – `brain index` ausführen.
- Nie direkt in `LOG.md` schreiben – `brain log` nutzen; die übrigen `brain`-Befehle protokollieren selbst.
- In `archive/` nie etwas ändern oder löschen. Verschieben nur per `brain recategorize`.
- Nie eine Kategorie ohne ausdrückliche Freigabe des Nutzers anlegen; angelegt wird nur mit `brain category add`, nie durch direktes Bearbeiten von `categories.yml`. Passt keine und wird keine freigegeben: `_uncategorized`.
- Nie `git push` ausführen.
- Diktiert der Nutzer im Chat eine Notiz (außerhalb von `/ingest`): wörtlich als `inbox/chat-note.md` speichern (`chat-note-2.md`, … falls belegt) und den `/ingest`-Ablauf ausführen.
- Sprache: Was eine Maschine auswertet, ist Englisch (Code, CLI, Datei- und Ordnernamen, Frontmatter-Felder, die Marker `## Related`, `## Sources`, `Conflict C-…`, `Unclear Q-…`, `Affects:`). Was der Nutzer liest (Titel, Summary, Fließtext, Callout-Text, Antworten), ist Deutsch.

## CLI `brain` (aus der Repo-Wurzel)

| Befehl | Zweck |
|---|---|
| `brain archive <inbox-datei> --category <slug>` | Notiz ins Archiv verschieben, gibt den Archivpfad aus |
| `brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> [--related <eintrag> …] [--tags a,b] < body` | neuen Eintrag anlegen und Index neu erzeugen |
| `brain link <eintrag> <eintrag> […]` / `brain link --remove …` | gegenseitige `## Related`-Links setzen/entfernen |
| `brain log <op> <ziel> [<beschreibung>]` | Zeile an `LOG.md` anhängen (Ops: archive, create, update, link, unlink, conflict, resolve, recategorize, category, ingest) |
| `brain index` | `INDEX.md` und `graph.json` neu erzeugen |
| `brain check` | Fehler (Exit 1) und Hinweise (offene Punkte, Einträge ohne Kategorie) |
| `brain category add <slug> --name <name> [--description <text>]` | neue Kategorie registrieren – nur nach Freigabe durch den Nutzer |
| `brain category list` | Kategorien mit Anzahl der Einträge anzeigen |
| `brain recategorize --rename a b \| --merge a b \| --move <eintrag> <kategorie>` | nur auf Anweisung des Nutzers |
| `brain help` | Übersicht aller Befehle (englisch) |

## Brain-First-Protokoll (Suchleiter)

Für jede Wissensfrage genau so vorgehen:

1. Keywords aus der Frage bestimmen.
2. Kandidaten mit `INDEX.md` und qmd `query` auf Collection `wiki` scoren – noch KEINE Dateien öffnen. Collection `archive` oder beide nur, wenn ausdrücklich verlangt.
3. Genau EINE Top-Datei öffnen.
4. Nur den relevanten Abschnitt lesen (Referenz-Map und Überschriften nutzen).
5. Höchstens EINEM Pointer folgen (`[[Link]]`, ein Eintrag aus `## Related` oder ein `sources`-Pfad).
6. Nur aus dem Gelesenen antworten, mit `[[…]]`-Quellenlinks. Reicht das nicht: „Dazu steht nichts in deinem Brain.“

Einträge schreiben: siehe `wiki/CLAUDE.md`.
