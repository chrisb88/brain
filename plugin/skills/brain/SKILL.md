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
- Steht im Kontext eine Hinweis-Zeile wie `Brain: Hinweis – qmd-Index fehlt – …`, den Nutzer einmal darauf hinweisen (hier: einmal `brain qmd setup` im Repository ausführen).

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
