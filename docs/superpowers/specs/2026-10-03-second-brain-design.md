# Second Brain – Wissenskern – Design

Datum: 2026-10-03
Status: Entwurf zur Review (Revision 2)

## 1. Ziel & Rahmen

Eine persönliche Wissensbasis („Second Brain“) für Job-Wissen (PHP, Azure, Kubernetes, …) und persönliches Wissen an einem Ort. Grundlage sind Markdown-Dateien, die aus Rohnotizen erzeugt und gepflegt werden.

Diese Spec umfasst nur den **Wissenskern**: Ablage, Kategorien, Verarbeitung, Index und Suche. Eine grafische Oberfläche/App ist ein **eigenes, späteres Teilprojekt** mit eigener Spec. Der Kern darf sie nicht verbauen: Die Schnittstelle sind die Dateien und Formate (Abschnitt 4, „Datenvertrag“), nicht Claude Code.

### 1.1 Ansprüche

| Anspruch | Umsetzung im Kern |
|---|---|
| **Finden** – jede Information in wenigen Sekunden | Katalog `INDEX.md` (immer geladen) + qmd-Suche; Direktsuche ohne LLM-Antwort per `qmd search`/`qmd query` |
| **Lesen** – direkt, ohne Umwege | Treffer sind normale `.md`-Dateien; Referenz-Map zeigt direkt auf den Abschnitt |
| **Sauber bleiben** – Widersprüche/Unklarheiten erkennen, verdichten statt anhäufen | Ingest arbeitet Neues in bestehende Einträge ein; Widersprüche/Unklarheiten werden mit dem Nutzer geklärt oder sichtbar markiert und im Index gesammelt |
| **Überblick** – grafisch | `graph.json` für die spätere App/andere Programme; übergangsweise Obsidian (Graph, Backlinks) |

### 1.2 Festgelegte Entscheidungen

- Verarbeitung durch Claude Code (WSL/Ubuntu), nur manuell per `/ingest`.
- Neue Notizen: direkt im Chat oder als Datei in `inbox/`.
- Wiki-Prinzip: Claude pflegt Wissenseinträge und arbeitet neues Wissen in bestehende ein.
- Originale bleiben immer erhalten, Inhalt wird nie verändert.
- Jede Notiz und jeder Eintrag gehört zu **genau einer Kategorie**; ist die Zuordnung nicht eindeutig, wird die Hauptkategorie gewählt, Bezüge zu anderen Kategorien per `[[Link]]`.
- Neue Kategorien nur mit expliziter Freigabe des Nutzers.
- Antworten strikt aus dem Brain, mit Quellen; fehlendes Wissen wird benannt.
- Obsidian-kompatibel: `[[Wiki-Links]]`, YAML-Frontmatter.
- Einträge auf Deutsch, Fachbegriffe im Original.
- Brain-Ordner auf Windows: `F:\second-brain` = `/mnt/f/second-brain`, Git-Repo, niemals push durch Claude.
- Deterministische Werkzeuge (Index, Graph, Anlegen, Prüfen, Archivieren) als Node/TypeScript-CLI `brain` – ohne Modellaufruf.
- Suche mit [qmd](https://github.com/tobi/qmd), global in WSL, multilinguales Embedding (Qwen3), angebunden per Claude-Code-Plugin.

**Erfolgskriterium:** Notiz in die Inbox, `/ingest` → Wissen ist eingeordnet und verdichtet, Index und Graph sind aktuell. Eine Frage per `/ask` wird über die Suchleiter mit Quellen-Link beantwortet; eine Frage ohne Antwort im Brain wird als solche erkannt.

**Nicht im Umfang:** App/GUI, Anhänge (PDF, Bilder), automatische Verarbeitung (Watcher/Cron), Git-Remote, Windows-native Installation von Claude Code oder qmd.

## 2. Umgebung

| Komponente | Ort | Hinweis |
|---|---|---|
| Brain-Ordner (Git-Repo) | `/mnt/f/second-brain` | Windows-Laufwerk, direkt von Windows/Obsidian nutzbar |
| Claude Code | WSL | |
| Node.js | WSL, v24.2.0 | qmd benötigt ≥ 22; TypeScript per Type-Stripping ohne Build |
| qmd | WSL, global (`npm install -g @tobilu/qmd`) | Modelle in `~/.cache/qmd/models/` |
| qmd-Index (SQLite) | `~/.cache/qmd/` (Linux-Dateisystem) | **nicht** auf `/mnt/f` – SQLite-Locking über die WSL-Brücke unzuverlässig |
| GPU | RTX 5070 Ti, CUDA in WSL sichtbar | Unterstützung durch node-llama-cpp-Binaries per Spike zu prüfen |

**Risiko GPU:** Ob die vorkompilierten CUDA-Binaries die Blackwell-GPU unterstützen, ist offen. Erster Umsetzungsschritt ist ein Spike. Fallbacks: Vulkan, dann CPU (`QMD_FORCE_CPU=1`). Funktional ändert sich nichts, nur die Geschwindigkeit.

## 3. Ordnerstruktur

```
/mnt/f/second-brain/
├── CLAUDE.md               Workspace: Repo, Brain-Überblick, Brain-First-Protokoll
├── categories.yml          erlaubte Kategorien (einzige Quelle)
├── INDEX.md                generiert: Katalog
├── graph.json              generiert: Graph für App/andere Programme
├── .claude/commands/
│   ├── ingest.md           /ingest
│   └── ask.md              /ask
├── inbox/                  neue Rohnotizen (.md, .txt); Inhalt git-ignoriert
├── archive/<kategorie>/YYYY/MM/   Originale, Inhalt unveränderlich
├── wiki/
│   ├── CLAUDE.md           Schreibregeln für Wissenseinträge
│   └── <kategorie>/<eintrag>.md
├── scripts/                CLI `brain` (TypeScript) + Tests
└── docs/superpowers/       Specs & Pläne
```

`.gitignore`: `scripts/node_modules/`, Inhalt von `inbox/` außer `.gitkeep`.

## 4. Datenvertrag

Dieser Abschnitt ist die stabile Schnittstelle für die spätere App und andere Programme. Änderungen hier sind Breaking Changes.

### 4.1 categories.yml

```yaml
categories:
  - slug: gesundheit
    name: Gesundheit
    description: Arztbefunde, Training, Ernährung, Schlaf.
```

- `slug`: Kleinbuchstaben, Ziffern, `-`; eindeutig. Entspricht dem Ordnernamen unter `wiki/` und `archive/`.
- `name`: Anzeigename. `description`: 1–2 Sätze, was hineingehört (Hilfe für die Einordnung).
- Start: leere Liste. Erste Kategorien entstehen beim ersten Ingest – mit Freigabe.
- Kategorien sind **grobe Oberkategorien** (Beispiele: Ideen & Konzepte, Gesundheit, Urlaub, Finanzplanung). Neue Kategorien werden nur angelegt, wenn keine bestehende passt, und nur nach Freigabe durch den Nutzer.

### 4.2 Archiv

- Pfad: `archive/<kategorie>/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md` (Zeitpunkt der Archivierung).
- Inhalt byte-identisch zum Original; `.txt` wird nur zu `.md` umbenannt.
- Inhalt wird nie geändert, Dateien werden nie gelöscht. Einzige erlaubte Änderung: Verschieben per `brain recategorize` (reine Umbenennung, Inhalt identisch).

### 4.3 Wissenseinträge

Pfad: `wiki/<kategorie>/<eintrag>.md`, `<eintrag>` als Slug aus dem Titel.

```markdown
---
title: Kubernetes Ingress
category: technik
tags: [kubernetes, networking]
summary: Ingress-Controller, TLS-Setup und Erfahrungen aus Projekt X.
sources: [archive/technik/2026/10/2026-10-02-1530-ingress-tls.md]
created: 2026-10-02
updated: 2026-10-02
---
# Kubernetes Ingress

…verdichteter Inhalt…, Bezug zu [[wiki/technik/azure-aks]]

> [!warning] Widerspruch
> Quelle A sagt X ([[archive/…]]), Quelle B sagt Y ([[archive/…]]).

## Quellen
- [[archive/technik/2026/10/2026-10-02-1530-ingress-tls]]
```

- Pflichtfelder: `title`, `category` (= Ordnername, in `categories.yml`), `summary` (genau ein Satz, einzeilig), `sources` (≥ 1 existierender Archivpfad), `created`, `updated` (ISO-Datum). `tags` optional.
- Links immer als Pfad ab Repo-Wurzel ohne `.md`: `[[wiki/kategorie/eintrag]]`, optional `|Alias` oder `#Abschnitt`.
- Offene Punkte als Obsidian-Callouts: `> [!warning] Widerspruch` und `> [!question] Unklar`.
- Keine Geheimnisse (Passwörter, Tokens, Keys).
- `wiki/CLAUDE.md` ist kein Eintrag und wird von Index, Graph, Check und qmd ignoriert.

### 4.4 INDEX.md (Katalog)

Erzeugt ausschließlich von `brain index`, nie von Hand oder durch Claude. Klein genug, um immer vollständig geladen zu werden. Aufbau:

```markdown
# Index
<!-- generiert von `brain index` – nicht bearbeiten -->

## Gesundheit (`gesundheit`)
Arztbefunde, Training, Ernährung, Schlaf.
- [[wiki/gesundheit/laufen]] **Laufen** — Trainingspläne und Pulszonen für 10-km-Läufe.

## Referenz-Map
- [[wiki/technik/kubernetes]] **Kubernetes**
  - [[wiki/technik/kubernetes#Ingress]]
  - [[wiki/technik/kubernetes#Storage]]

## Offene Punkte
- [[wiki/technik/kubernetes]] — 1 Widerspruch, 0 Unklarheiten
```

- Kategorien in der Reihenfolge von `categories.yml`, Einträge alphabetisch nach Titel.
- **Referenz-Map:** für jedes „große“ Dokument (> 150 Zeilen, Konstante im Code) die `##`-Überschriften als Abschnittslinks – zeigt, welches Dokument welches Unterthema enthält.
- **Offene Punkte:** alle Einträge mit Widerspruchs-/Unklar-Callouts, mit Anzahl.
- Kategorien ohne Einträge erscheinen mit Hinweis „(noch leer)“.

### 4.5 graph.json

```json
{
  "version": 1,
  "nodes": [
    {"id": "category:gesundheit", "type": "category", "category": "gesundheit", "label": "Gesundheit", "path": null, "size": 1, "mtime": null},
    {"id": "wiki/gesundheit/laufen", "type": "entry", "category": "gesundheit", "label": "Laufen", "path": "wiki/gesundheit/laufen.md", "size": 2048, "mtime": "2026-10-02T15:30:00Z"},
    {"id": "archive/gesundheit/2026/10/2026-10-02-1530-lauf", "type": "source", "category": "gesundheit", "label": "2026-10-02-1530-lauf", "path": "archive/gesundheit/2026/10/2026-10-02-1530-lauf.md", "size": 512, "mtime": "2026-10-02T15:30:00Z"}
  ],
  "edges": [
    {"source": "wiki/gesundheit/laufen", "target": "category:gesundheit", "type": "member"},
    {"source": "wiki/gesundheit/laufen", "target": "wiki/technik/garmin", "type": "link"},
    {"source": "wiki/gesundheit/laufen", "target": "archive/gesundheit/2026/10/2026-10-02-1530-lauf", "type": "source"}
  ]
}
```

- Knotentypen: `category` (Cluster), `entry` (Wissenseintrag), `source` (Original).
- `id`: Pfad ohne `.md` bzw. `category:<slug>`. `size`: Bytes bei Dateien, Anzahl Einträge bei Kategorien. `mtime`: ISO-8601 UTC aus dem Dateisystem, `null` bei Kategorien.
- Kanten: `member` (Eintrag → Kategorie), `link` (`[[Link]]` zwischen Einträgen), `source` (Eintrag → Original).
- Deterministisch: Knoten und Kanten stabil sortiert (nach `id` bzw. `source`, `target`, `type`), 2 Leerzeichen Einrückung. Einzige nicht-inhaltliche Größe ist `mtime`.

## 5. CLI `brain`

Node/TypeScript in `scripts/`, direkt ausgeführt von Node 24, **ohne Modellaufruf**, deterministisch. Laufzeitabhängigkeit: `yaml`. Entwicklung: `typescript` (`tsc --noEmit`). Aufruf: `npm --prefix scripts run <befehl> -- <args>`; zusätzlich `bin`-Eintrag `brain` (per `npm link` als `brain <befehl>` nutzbar). Fehler: Meldung auf stderr, Exit 1.

| Befehl | Verhalten |
|---|---|
| `brain archive <inbox-datei> --category <slug>` | Kategorie muss in `categories.yml` stehen. Verschiebt nach `archive/<kategorie>/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md`. Slug aus Dateiname ohne Endung: Kleinbuchstaben, ä→ae, ö→oe, ü→ue, ß→ss, sonstige Nicht-Alphanumerik → `-`, mehrfache/Rand-`-` entfernt. Kollision → `-2`, `-3`, … Inhalt unverändert. Gibt neuen Pfad auf stdout aus. Fehler bei: Datei nicht in `inbox/`, fehlt, falsche Endung, unbekannte Kategorie. |
| `brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> [--source …] [--tags a,b]` (Body über stdin) | Legt **neuen** Eintrag `wiki/<kategorie>/<slug(title)>.md` mit vollständigem Frontmatter (`created` = `updated` = heute), Body und Abschnitt „Quellen“ an und führt danach `brain index` aus – ein Schritt. Fehler bei: unbekannter Kategorie, Eintrag existiert bereits, Quelle existiert nicht, Summary leer oder mehrzeilig. Bestehende Einträge ändert Claude direkt per Edit; danach `brain index`. |
| `brain index` | Liest `categories.yml`, alle Einträge und Archivdateien; schreibt `INDEX.md` (4.4) und `graph.json` (4.5). Gleiche Eingaben → gleiche Ausgabe. |
| `brain check` | ① alle `[[Links]]` in `wiki/` lösen auf existierende Dateien/Abschnitte auf; ② Pflichtfelder laut 4.3, `category` = Ordnername, `sources` existieren; ③ jeder Ordner unter `wiki/` und `archive/` ist in `categories.yml` registriert; ④ Archiv-Integrität per Git: keine Datei unter `archive/` geändert oder gelöscht, Umbenennungen nur bei identischem Inhalt, neue Dateien erlaubt; ⑤ `INDEX.md`/`graph.json` sind aktuell (Neuerzeugung im Speicher ergibt keine Abweichung außer `mtime`). Exit 0 ok, 1 bei Fehlern, alle Fehler gelistet. |
| `brain recategorize` | Nur auf Anweisung des Nutzers. Varianten: `--rename <alt> <neu>` (Kategorie umbenennen), `--merge <von> <nach>` (zusammenlegen), `--move <eintrag> <kategorie>` (Eintrag samt Quellen, die nur er referenziert, verschieben). Verschiebt per `git mv`, passt `[[Links]]`, `sources`, `category` und `categories.yml` an, führt `brain index` aus. Inhalt der Originale bleibt identisch. |

## 6. CLAUDE.md-Dateien

### 6.1 Root `CLAUDE.md` (Workspace)

- Zweck des Repos, Ordnerstruktur, Verweis auf den Datenvertrag (diese Spec).
- Regeln: `archive/` nie inhaltlich ändern/löschen; `INDEX.md`/`graph.json` nie von Hand; neue Kategorien nur nach Freigabe; niemals push.
- **Brain-First-Protokoll (Suchleiter), feste Regel für jede Wissensfrage:**
  1. Keywords aus der Frage bestimmen.
  2. `INDEX.md` und qmd (`query`) scoren – **ohne Dateien zu öffnen**.
  3. Genau **eine** Top-Datei öffnen.
  4. Nur die relevante Sektion lesen (Referenz-Map/Überschriften nutzen).
  5. Einem Pointer (`[[Link]]` oder `sources`) **höchstens einmal** folgen.
  6. Antworten – nur aus dem Gelesenen, mit Quellen-Link; reicht es nicht: „Dazu steht nichts in deinem Brain“.
- Verweis auf `wiki/CLAUDE.md` für das Schreiben von Einträgen.

### 6.2 `wiki/CLAUDE.md` (Schreibregeln)

- Format laut 4.3; neue Einträge nur über `brain remember`.
- **Verdichten statt anhängen:** Neues in den bestehenden Text einarbeiten, Doppeltes zusammenführen, Veraltetes ersetzen (Quelle bleibt in `sources`); keine „Update vom …“-Abschnitte.
- Ein Eintrag = ein Thema; wird ein Eintrag zu groß oder thematisch breit, Aufteilung vorschlagen.
- Widersprüche/Unklarheiten zuerst mit dem Nutzer klären; nicht klärbar → Callout.
- Deutsch, Fachbegriffe im Original; keine Geheimnisse.

## 7. qmd

- Global installiert, Claude-Code-Plugin: `claude plugin install qmd@qmd` (MCP-Tools `query`, `get`, `multi_get`, `status`).
- Eine Collection `brain` über den Workspace (`**/*.md`), ignoriert: `archive/**`, `inbox/**`, `docs/**`, `scripts/**`, `CLAUDE.md`, `wiki/CLAUDE.md`, `INDEX.md`. Effektiv indexiert sind damit die Wissenseinträge. Begründung Archiv-Ausschluss: Originale sind unverdichtet und ggf. veraltet; erreichbar bleiben sie über `sources`.
- Embedding-Modell: `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` (multilingual) per qmd-Konfiguration (`models.embed` in `index.yml` bzw. `QMD_EMBED_MODEL`). Reranker: qmd-Standard (Qwen3-Reranker).
- Kontext: `qmd context add` mit Beschreibung des Brains (deutsch, Kategorien).
- Aktualisierung nach jedem Ingest: `qmd update && qmd embed` (inkrementell).
- Direktsuche ohne Claude (Anspruch „in Sekunden“): `qmd search "<stichworte>" -c brain` bzw. `qmd query "<frage>" -c brain`.

## 8. Ingest-Ablauf (`/ingest`)

Notizen aus dem Chat speichert Claude zuerst wörtlich in `inbox/`; danach gilt derselbe Ablauf.

1. **Vorprüfung:** `brain check` fehlerfrei; Git-Arbeitsverzeichnis sauber (`inbox/` ist ignoriert), sonst Abbruch. Leere Inbox → „nichts zu tun“. Andere Formate als `.md`/`.txt` bleiben liegen, mit Hinweis.
2. **Pro Inbox-Datei** (älteste zuerst):
   1. Notiz lesen, **Kategorie bestimmen** anhand `categories.yml`. Passt keine: anhalten, neue Kategorie (Slug, Name, Beschreibung) oder die bestpassende bestehende vorschlagen; erst nach Freigabe in `categories.yml` eintragen. Abgelehnt → Notiz bleibt in der Inbox.
   2. `brain archive <datei> --category <slug>`.
   3. Verwandtes finden nach Suchleiter-Prinzip (Index + qmd scoren).
   4. Einarbeiten gemäß `wiki/CLAUDE.md`: bestehenden Eintrag verdichtend ergänzen (Edit) oder neuen per `brain remember` anlegen; `sources`, `updated`, `summary` pflegen; Links setzen.
   5. Widersprüche/Unklarheiten: Nutzer fragen; nicht klärbar → Callout.
   6. Geheimnisse nicht übernehmen, Hinweis an den Nutzer.
3. **Abschluss:** `brain index` → `brain check` (Fehler → kein Commit, Probleme zeigen) → `qmd update && qmd embed` → Zusammenfassung (neue/geänderte Einträge, offene Punkte) → Git-Commit `ingest: <n> Notizen – <Themen>`. Niemals push.

**Wiederaufsetzen nach Abbruch:** Original ist bereits archiviert (nicht committet). Zwischenstand per `git status`/`git diff`. Neuer Versuch: `git restore wiki/ INDEX.md graph.json categories.yml`, neu angelegte Einträge entfernen (`git clean -n wiki/` zeigt, `git clean -f wiki/` löscht), archivierte Datei zurück nach `inbox/` verschieben.

## 9. Abfrage (`/ask <Frage>`)

Folgt exakt dem Brain-First-Protokoll (6.1). Antwort auf Deutsch, nur aus dem Gelesenen, jede Aussage mit `[[…]]`-Quelle. Kein Treffer → „Dazu steht nichts in deinem Brain“, ggf. thematisch nahe Einträge aus dem Index nennen. `/ask` ändert keine Dateien.

## 10. Fehlerfälle

| Fall | Verhalten |
|---|---|
| `brain`-Befehl schlägt fehl | Abbruch von `/ingest`, Meldung zeigen, kein Commit |
| qmd/MCP nicht erreichbar | `/ingest`: weiter nur mit `INDEX.md` + Grep, Hinweis. `/ask`: Problem melden, nicht still schlechter antworten |
| Leere Inbox | „nichts zu tun“ |
| Nicht unterstütztes Format | bleibt in der Inbox, Hinweis |
| Git-Arbeitsverzeichnis nicht sauber | Abbruch vor dem Ingest |
| Neue Kategorie abgelehnt | Notiz bleibt in der Inbox |

## 11. Tests & Verifikation

1. **Spike (erster Schritt):** qmd global installieren, Qwen3-Embedding konfigurieren, kleine Test-Collection indexieren, prüfen ob CUDA auf der RTX 5070 Ti genutzt wird; Ergebnis (GPU/Vulkan/CPU) und Antwortzeiten von `search`/`query` dokumentieren.
2. **Unit-Tests** mit `node:test` je Befehl gegen temporäre Ordner; für Check ④ und `recategorize` ein temporäres Git-Repo. Tabellengetrieben: Slugs, Linkformen, fehlende Felder, Kollisionen, unbekannte Kategorien.
3. **Determinismus-Test:** `brain index` zweimal auf gleichen Eingaben → identische `INDEX.md`/`graph.json`; Golden-File-Vergleich für Index und Graph.
4. **Typprüfung:** `tsc --noEmit`.
5. **End-to-End manuell:** 2–3 echte Notizen (davon eine, die eine neue Kategorie erfordert, und eine, die einem bestehenden Eintrag widerspricht), `/ingest`, dann `/ask` mit einer beantwortbaren und einer nicht beantwortbaren Frage; `qmd search` auf Antwortzeit prüfen.
