# Second Brain – Wissenskern – Design

Datum: 2026-10-03
Status: Freigegeben (Revision 4, 2026-10-03)

## 1. Ziel & Rahmen

Eine persönliche Wissensbasis („Second Brain“) für Job-Wissen (PHP, Azure, Kubernetes, …) und persönliches Wissen an einem Ort. Grundlage sind Markdown-Dateien, die aus Rohnotizen erzeugt und gepflegt werden.

Diese Spec umfasst nur den **Wissenskern**: Ablage, Kategorien, Verarbeitung, Index und Suche. Eine grafische Oberfläche/App ist ein **eigenes, späteres Teilprojekt** mit eigener Spec. Der Kern darf sie nicht verbauen: Die Schnittstelle sind die Dateien und Formate (Abschnitt 4, „Datenvertrag“), nicht Claude Code.

### 1.1 Ansprüche

| Anspruch | Umsetzung im Kern |
|---|---|
| **Finden** – jede Information in wenigen Sekunden | Katalog `INDEX.md` (immer geladen) + qmd-Suche; Direktsuche ohne LLM-Antwort per `qmd search`/`qmd query` |
| **Lesen** – direkt, ohne Umwege | Treffer sind normale `.md`-Dateien; Referenz-Map zeigt direkt auf den Abschnitt; jeder Eintrag zeigt seine verwandten Einträge |
| **Sauber bleiben** – Widersprüche/Unklarheiten erkennen, verdichten statt anhäufen | Ingest arbeitet Neues in bestehende Einträge ein; Widersprüche/Unklarheiten werden mit dem Nutzer geklärt oder in allen betroffenen Einträgen sichtbar markiert; `brain check` berichtet sie |
| **Überblick** – grafisch | `graph.json` für die spätere App/andere Programme; übergangsweise Obsidian (Graph, Backlinks) |

### 1.2 Festgelegte Entscheidungen

- **Die Markdown-Dateien sind die einzige Wahrheit.** `INDEX.md` und `graph.json` sind abgeleitet, werden bei jedem Indexlauf vollständig neu erzeugt und nie von Hand oder von Claude bearbeitet.
- Verarbeitung durch Claude Code (WSL/Ubuntu), nur manuell per `/ingest`.
- Neue Notizen: direkt im Chat oder als Datei in `inbox/`.
- Wiki-Prinzip: Claude pflegt Wissenseinträge und arbeitet neues Wissen in bestehende ein.
- Originale bleiben immer erhalten, Inhalt wird nie verändert.
- Jede Notiz und jeder Eintrag gehört zu **genau einer Kategorie**; ist die Zuordnung nicht eindeutig, wird die Hauptkategorie gewählt, Bezüge zu anderen Kategorien per Verwandt-Link.
- Neue Kategorien nur mit expliziter Freigabe des Nutzers. Passt keine bestehende und wird keine neue freigegeben, landet die Notiz in `_uncategorized`.
- Zusammenhängende Einträge verlinken sich **gegenseitig** (in allen beteiligten Einträgen).
- Antworten strikt aus dem Brain, mit Quellen; fehlendes Wissen wird benannt.
- Obsidian-kompatibel: `[[Wiki-Links]]`, YAML-Frontmatter, Callouts.
- Einträge auf Deutsch, Fachbegriffe im Original.
- **Sprachregel:** Alles, was eine Maschine liest, ist Englisch – Code, CLI-Befehle und Flags (`/ask --archive`), Datei- und Ordnernamen (`_uncategorized`), Frontmatter-Felder, Log-Operationen und die vom CLI ausgewerteten Marker in Einträgen (`## Related`, `## Sources`, `[!warning] Conflict C-…`, `[!question] Unclear Q-…`, `Affects:`). Alles, was der Nutzer liest (Titel, Summary, Fließtext, Callout-Inhalt), ist Deutsch.
- Brain-Ordner auf Windows: `F:\second-brain` = `/mnt/f/second-brain`, Git-Repo, niemals push durch Claude.
- Deterministische Werkzeuge als Node/TypeScript-CLI `brain` – ohne Modellaufruf.
- Suche mit [qmd](https://github.com/tobi/qmd), global in WSL, multilinguales Embedding (Qwen3), angebunden per Claude-Code-Plugin; getrennte Collections für Wiki und Archiv, einzeln oder gemeinsam durchsuchbar.
- Änderungsprotokoll `LOG.md` (nur anhängen, Debug-Hilfe, nicht in Git, keine Checks).

**Erfolgskriterium:** Notiz in die Inbox, `/ingest` → Wissen ist eingeordnet, verdichtet und mit verwandten Einträgen gegenseitig verlinkt; Index und Graph sind aktuell. Eine Frage per `/ask` wird über die Suchleiter mit Quellen-Link beantwortet; eine Frage ohne Antwort im Brain wird als solche erkannt.

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
├── INDEX.md                abgeleitet: Katalog (nicht in Git)
├── graph.json              abgeleitet: Graph für App/andere Programme (nicht in Git)
├── LOG.md                  Änderungsprotokoll, nur anhängen (nicht in Git)
├── .claude/commands/
│   ├── ingest.md           /ingest
│   └── ask.md              /ask
├── inbox/                  neue Rohnotizen (.md, .txt); Inhalt nicht in Git
├── archive/
│   ├── <kategorie>/YYYY/MM/       Originale, Inhalt unveränderlich
│   └── _uncategorized/YYYY/MM/
├── wiki/
│   ├── CLAUDE.md           Schreibregeln für Wissenseinträge
│   ├── <kategorie>/<eintrag>.md
│   └── _uncategorized/<eintrag>.md
├── scripts/                CLI `brain` (TypeScript) + Tests
└── docs/superpowers/       Specs & Pläne
```

`.gitignore`: `scripts/node_modules/`, `INDEX.md`, `graph.json`, `LOG.md`, Inhalt von `inbox/` außer `.gitkeep`.

## 4. Datenvertrag

Dieser Abschnitt ist die stabile Schnittstelle für die spätere App und andere Programme. Änderungen hier sind Breaking Changes.

### 4.1 categories.yml

```yaml
categories:
  - slug: gesundheit
    name: Gesundheit
    description: Arztbefunde, Training, Ernährung, Schlaf.
```

- `slug`: `^[a-z0-9][a-z0-9-]*$`, eindeutig. Entspricht dem Ordnernamen unter `wiki/` und `archive/`.
- `name`: Anzeigename. `description`: 1–2 Sätze, was hineingehört (Hilfe für die Einordnung).
- Start: leere Liste. Erste Kategorien entstehen beim ersten Ingest – mit Freigabe.
- Kategorien sind **grobe Oberkategorien** (Beispiele: Ideen & Konzepte, Gesundheit, Urlaub, Finanzplanung). Neue Kategorien werden nur angelegt, wenn keine bestehende passt, und nur nach Freigabe durch den Nutzer.

**Reservierte Pseudo-Kategorie `_uncategorized`:** steht nicht in `categories.yml` (der Unterstrich ist im Slug-Muster ausgeschlossen, Kollisionen sind unmöglich). Für Notizen, deren Kategorie noch nicht entschieden ist. Wird in Index und Graph wie eine Kategorie mit Anzeigename „Ohne Kategorie“ behandelt; `brain check` listet ihre Einträge mit der Aufforderung, sie zu kategorisieren.

### 4.2 Archiv

- Pfad: `archive/<kategorie>/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md` (Zeitpunkt der Archivierung); `<kategorie>` kann `_uncategorized` sein.
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

> [!warning] Conflict C-20261003-1
> Affects: [[wiki/technik/kubernetes-ingress]], [[wiki/technik/azure-aks]]
> Laut [[archive/technik/2026/10/2026-10-02-1530-ingress-tls]] gilt X, laut [[archive/technik/2026/09/2026-09-14-0900-aks-setup]] gilt Y.

…verdichteter Inhalt…

## Related
- [[wiki/technik/azure-aks]]
- [[wiki/ideen-konzepte/homelab]]

## Sources
- [[archive/technik/2026/10/2026-10-02-1530-ingress-tls]]
```

**Frontmatter:**

- Pflichtfelder: `title`, `category` (= Ordnername; in `categories.yml` oder `_uncategorized`), `summary` (genau ein Satz, einzeilig), `sources` (≥ 1 existierender Archivpfad), `created`, `updated` (ISO-Datum). `tags` optional.

**Links:**

- Immer als Pfad ab Repo-Wurzel ohne `.md`: `[[wiki/kategorie/eintrag]]`, optional `|Alias` oder `#Abschnitt`.
- **Abschnitt `## Related`:** Liste der zusammenhängenden Einträge (auch kategorieübergreifend), ein Link pro Zeile, keine Abschnitts-Anker. **Symmetrisch:** Steht B in A's Verwandt-Liste, steht A in B's Verwandt-Liste. Gesetzt/entfernt wird per `brain link`; `brain check` prüft die Symmetrie. Links im Fließtext sind zusätzlich erlaubt und müssen nicht symmetrisch sein.
- Abschnitt `## Sources`: ein Link pro Eintrag in `sources`.
- Reihenfolge am Dateiende: `## Related` (falls vorhanden), dann `## Sources`.

**Offene Punkte (Widersprüche, Unklarheiten):**

- Als Obsidian-Callout **oben im Eintrag, direkt unter der `#`-Überschrift** – beim Öffnen sofort sichtbar.
- Widerspruch: `> [!warning] Conflict C-YYYYMMDD-N`; Unklarheit: `> [!question] Unclear Q-YYYYMMDD-N`. `N` fortlaufend pro Tag, ID im ganzen Brain eindeutig.
- Zweite Zeile: `> Affects: [[…]], [[…]]` – alle betroffenen Einträge.
- Ein offener Punkt steht in **allen** unter „Affects“ genannten Einträgen, mit identischer ID und identischer Affects-Liste; in keinem anderen Eintrag. Auflösen heißt: Inhalt korrigieren und den Callout mit dieser ID aus **allen** Einträgen entfernen. `brain check` erzwingt beides.

**Sonstiges:**

- Keine Geheimnisse (Passwörter, Tokens, Keys).
- `wiki/CLAUDE.md` ist kein Eintrag und wird von Index, Graph, Check und qmd ignoriert.

### 4.4 INDEX.md (Katalog, abgeleitet)

Erzeugt ausschließlich von `brain index`, nicht in Git, nie von Hand oder durch Claude bearbeitet. Klein genug, um immer vollständig geladen zu werden. Aufbau:

```markdown
# Index
<!-- generiert von `brain index` – nicht bearbeiten -->

## Gesundheit (`gesundheit`)
Arztbefunde, Training, Ernährung, Schlaf.
- [[wiki/gesundheit/laufen]] **Laufen** — Trainingspläne und Pulszonen für 10-km-Läufe. · ↔ [[wiki/gesundheit/ernaehrung]]

## Ohne Kategorie (`_uncategorized`)
- [[wiki/_uncategorized/steuer-idee]] **Steuer-Idee** — …

## Referenz-Map
- [[wiki/technik/kubernetes]] **Kubernetes**
  - [[wiki/technik/kubernetes#Ingress]]
  - [[wiki/technik/kubernetes#Storage]]
```

- Kategorien in der Reihenfolge von `categories.yml`, danach „Ohne Kategorie“ (nur wenn nicht leer); Einträge alphabetisch nach Titel.
- Pro Eintrag: Link, Titel, Summary und – falls vorhanden – die Verwandt-Links (`↔`, alphabetisch).
- Kategorien ohne Einträge erscheinen mit Hinweis „(noch leer)“.
- **Referenz-Map:** für jedes „große“ Dokument (> 150 Zeilen, Konstante im Code) die `##`-Überschriften (außer `Related` und `Sources`) als Abschnittslinks.
- Offene Punkte stehen **nicht** im Index (Bericht über `brain check`).

### 4.5 graph.json (abgeleitet)

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
    {"source": "wiki/gesundheit/ernaehrung", "target": "wiki/gesundheit/laufen", "type": "related"},
    {"source": "wiki/gesundheit/laufen", "target": "wiki/technik/garmin", "type": "link"},
    {"source": "wiki/gesundheit/laufen", "target": "archive/gesundheit/2026/10/2026-10-02-1530-lauf", "type": "source"}
  ]
}
```

- Erzeugt ausschließlich von `brain index` bei jedem Lauf vollständig neu, nicht in Git, nie von Hand oder durch Claude bearbeitet.
- Knotentypen: `category` (Cluster; inkl. `category:_uncategorized` mit Label „Ohne Kategorie“, falls nicht leer), `entry` (Wissenseintrag), `source` (Original).
- `id`: Pfad ohne `.md` bzw. `category:<slug>`. `size`: Bytes bei Dateien, Anzahl Einträge bei Kategorien. `mtime`: ISO-8601 UTC aus dem Dateisystem, `null` bei Kategorien.
- Kanten:
  - `member`: Eintrag → Kategorie.
  - `related`: Verwandt-Beziehung, ungerichtet, **einmal pro Paar** (`source` < `target` lexikografisch).
  - `link`: Fließtext-Link zwischen Einträgen (gerichtet), sofern nicht bereits `related`.
  - `source`: Eintrag → Original.
- Deterministisch: Knoten und Kanten stabil sortiert (nach `id` bzw. `source`, `target`, `type`), 2 Leerzeichen Einrückung. Einzige nicht-inhaltliche Größe ist `mtime`.

### 4.6 LOG.md (Änderungsprotokoll)

Debug-Hilfe zum Nachvollziehen, wann was passiert ist. Nicht in Git, nicht im Katalog, nicht in qmd, keine Prüfungen durch `brain check`. Fehlt die Datei, wird sie beim nächsten Schreiben angelegt.

Eine Zeile pro Operation, nur angehängt, nie geändert:

```
2026-10-03 15:30 | create | wiki/gesundheit/laufen | Neuer Eintrag aus archive/gesundheit/2026/10/2026-10-03-1530-lauf
2026-10-03 15:31 | update | wiki/gesundheit/ernaehrung | Proteinbedarf ergänzt
2026-10-03 15:31 | link | wiki/gesundheit/laufen ↔ wiki/gesundheit/ernaehrung |
2026-10-03 15:32 | ingest | 3 Notizen | gesundheit, technik
```

- Format: `YYYY-MM-DD HH:MM | <op> | <ziel> | <beschreibung>` (Ortszeit; Beschreibung darf leer sein, `|` und Zeilenumbrüche in Feldern werden durch Leerzeichen ersetzt).
- Operationen: `archive`, `create`, `update`, `link`, `unlink`, `conflict` (Widerspruch/Unklarheit angelegt), `resolve`, `recategorize`, `category` (neue Kategorie freigegeben), `ingest` (Abschlusszeile pro Lauf).
- Geschrieben ausschließlich über die CLI: `brain archive`, `remember`, `link` und `recategorize` protokollieren sich selbst; Claudes eigene Änderungen (Edit, Konflikte, Kategorien, Ingest-Abschluss) über `brain log`. Weder Claude noch Hand schreiben direkt in die Datei.

## 5. CLI `brain`

Node/TypeScript in `scripts/`, direkt ausgeführt von Node 24, **ohne Modellaufruf**, deterministisch. Laufzeitabhängigkeit: `yaml`. Entwicklung: `typescript` (`tsc --noEmit`). Aufruf: `npm --prefix scripts run <befehl> -- <args>`; zusätzlich `bin`-Eintrag `brain` (per `npm link` als `brain <befehl>` nutzbar). Fehler: Meldung auf stderr, Exit 1. Ändernde Befehle (`archive`, `remember`, `link`, `recategorize`) schreiben nach Erfolg ihre Zeile(n) in `LOG.md` (4.6).

| Befehl | Verhalten |
|---|---|
| `brain archive <inbox-datei> --category <slug>` | Kategorie muss in `categories.yml` stehen oder `_uncategorized` sein. Verschiebt nach `archive/<kategorie>/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md`. Slug aus Dateiname ohne Endung: Kleinbuchstaben, ä→ae, ö→oe, ü→ue, ß→ss, sonstige Nicht-Alphanumerik → `-`, mehrfache/Rand-`-` entfernt. Kollision → `-2`, `-3`, … Inhalt unverändert. Gibt neuen Pfad auf stdout aus. Fehler bei: Datei nicht in `inbox/`, fehlt, falsche Endung, unbekannte Kategorie. |
| `brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> [--source …] [--tags a,b] [--related <eintrag> …]` (Body über stdin) | Legt **neuen** Eintrag `wiki/<kategorie>/<slug(title)>.md` mit vollständigem Frontmatter (`created` = `updated` = heute), Body und Abschnitt `## Sources` an; `--related` wirkt wie `brain link` (beidseitig). Führt danach `brain index` aus – ein Schritt. Fehler bei: unbekannter Kategorie, Eintrag existiert bereits, Quelle oder Related-Eintrag existiert nicht, Summary leer oder mehrzeilig. Bestehende Einträge ändert Claude direkt per Edit. |
| `brain link <eintrag> <eintrag> [<eintrag> …]` / `brain link --remove <eintrag> <eintrag> […]` | Setzt bzw. entfernt die Verwandt-Beziehung **paarweise zwischen allen genannten Einträgen** in deren `## Related`-Abschnitten (Abschnitt wird bei Bedarf vor `## Sources` angelegt bzw. leer entfernt; Liste alphabetisch). Idempotent. Fehler bei nicht existierendem Eintrag. Ändert nichts außer dem Verwandt-Abschnitt. |
| `brain log <op> <ziel> [<beschreibung>]` | Hängt eine Zeile gemäß 4.6 an `LOG.md` an. Fehler bei unbekannter Operation. |
| `brain index` | Liest `categories.yml`, alle Einträge und Archivdateien; schreibt `INDEX.md` (4.4) und `graph.json` (4.5) vollständig neu. Gleiche Eingaben → gleiche Ausgabe. |
| `brain check` | Prüft das Brain und gibt einen Bericht in zwei Stufen aus. **Fehler** (→ Exit 1): ① `[[Links]]` in `wiki/` zeigen auf nicht existierende Dateien/Abschnitte; ② Pflichtfelder laut 4.3 fehlen, `category` ≠ Ordnername, `sources` existieren nicht; ③ Ordner unter `wiki/`/`archive/` weder in `categories.yml` noch `_uncategorized`; ④ Archiv-Integrität per Git verletzt (Datei unter `archive/` geändert oder gelöscht; Umbenennung mit Inhaltsänderung) – neue Dateien erlaubt; ⑤ Verwandt-Beziehung nicht symmetrisch; ⑥ offener Punkt unvollständig (ID fehlt in einem unter „Affects“ genannten Eintrag, Affects-Listen derselben ID weichen ab, ID steht in einem nicht genannten Eintrag, ID doppelt vergeben). **Hinweise** (Exit bleibt 0): offene Widersprüche und Unklarheiten (ID, betroffene Einträge); Einträge in `_uncategorized` mit der Aufforderung, sie zu kategorisieren. Exit 0, wenn keine Fehler. |
| `brain recategorize` | Nur auf Anweisung des Nutzers. Varianten: `--rename <alt> <neu>` (Kategorie umbenennen), `--merge <von> <nach>` (zusammenlegen), `--move <eintrag> <kategorie>` (Eintrag samt Quellen, die nur er referenziert, verschieben – auch aus `_uncategorized` heraus). Verschiebt per `git mv`, passt alle `[[Links]]` (inkl. Related, Affects), `sources`, `category` und `categories.yml` an, führt `brain index` aus. Inhalt der Originale bleibt identisch. |

## 6. CLAUDE.md-Dateien

### 6.1 Root `CLAUDE.md` (Workspace)

- Zweck des Repos, Ordnerstruktur, Verweis auf den Datenvertrag (diese Spec).
- Regeln: Markdown ist die einzige Wahrheit; `LOG.md` nur über `brain log` bzw. die `brain`-Befehle; `archive/` nie inhaltlich ändern/löschen; `INDEX.md`/`graph.json` nie bearbeiten (nur `brain index`); neue Kategorien nur nach Freigabe; niemals push.
- **Brain-First-Protokoll (Suchleiter), feste Regel für jede Wissensfrage:**
  1. Keywords aus der Frage bestimmen.
  2. `INDEX.md` und qmd (`query`, Collection `wiki`) scoren – **ohne Dateien zu öffnen**. Archiv (`archive`) oder beide Collections nur, wenn ausdrücklich verlangt.
  3. Genau **eine** Top-Datei öffnen.
  4. Nur die relevante Sektion lesen (Referenz-Map/Überschriften nutzen).
  5. Einem Pointer (`[[Link]]`, Verwandt-Eintrag oder `sources`) **höchstens einmal** folgen.
  6. Antworten – nur aus dem Gelesenen, mit Quellen-Link; reicht es nicht: „Dazu steht nichts in deinem Brain“.
- Verweis auf `wiki/CLAUDE.md` für das Schreiben von Einträgen.

### 6.2 `wiki/CLAUDE.md` (Schreibregeln)

- Format laut 4.3; neue Einträge nur über `brain remember`; Verwandt-Beziehungen nur über `brain link`.
- **Verdichten statt anhängen:** Neues in den bestehenden Text einarbeiten, Doppeltes zusammenführen, Veraltetes ersetzen (Quelle bleibt in `sources`); keine „Update vom …“-Abschnitte.
- Ein Eintrag = ein Thema; wird ein Eintrag zu groß oder thematisch breit, Aufteilung vorschlagen.
- **Zusammenhänge pflegen:** Bei jedem neuen oder geänderten Eintrag prüfen, welche Einträge inhaltlich zusammenhängen, und per `brain link` verbinden.
- **Widersprüche/Unklarheiten:** zuerst mit dem Nutzer klären; nicht klärbar → Callout mit neuer ID in **allen** betroffenen Einträgen. Bei Auflösung: Inhalt korrigieren, Callout aus allen Einträgen entfernen.
- **Protokollieren:** jede eigene Änderung an Einträgen (Edit), jeden angelegten/aufgelösten offenen Punkt und jede freigegebene Kategorie per `brain log` festhalten.
- Deutsch, Fachbegriffe im Original; keine Geheimnisse.

## 7. qmd

- Global installiert, Claude-Code-Plugin: `claude plugin install qmd@qmd` (MCP-Tools `query`, `get`, `multi_get`, `status`).
- Zwei Collections:
  - `wiki`: `wiki/**/*.md`, ignoriert `wiki/CLAUDE.md` – verdichtete, aktuelle Wissenseinträge.
  - `archive`: `archive/**/*.md` – Originale, unverdichtet, ggf. veraltet.
- Gezielt suchen: `-c wiki`, `-c archive`, ohne `-c` in beiden. Nicht indexiert: `inbox/`, `docs/`, `scripts/`, `CLAUDE.md`, `INDEX.md`, `LOG.md`.
- Kontexte pro Collection (`qmd context add qmd://wiki "…"`, `qmd context add qmd://archive "…"`) beschreiben Inhalt und Status (aktuell vs. Original/ggf. veraltet) auf Deutsch.
- Embedding-Modell: `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf` (multilingual) per qmd-Konfiguration (`models.embed` in `index.yml` bzw. `QMD_EMBED_MODEL`). Reranker: qmd-Standard (Qwen3-Reranker).
- Aktualisierung nur im Ingest: `qmd update && qmd embed` (inkrementell).
- Direktsuche ohne Claude (Anspruch „in Sekunden“): `qmd search "<stichworte>" [-c wiki|archive]` bzw. `qmd query "<frage>" [-c wiki|archive]`.

## 8. Ingest-Ablauf (`/ingest`)

Notizen aus dem Chat speichert Claude zuerst wörtlich in `inbox/`; danach gilt derselbe Ablauf.

1. **Vorprüfung:** Git-Arbeitsverzeichnis sauber (abgeleitete Dateien und `inbox/` sind ignoriert), sonst Abbruch. `brain check` ohne Fehler, sonst Abbruch mit Bericht. `brain index` (Index aktuell, falls Einträge außerhalb eines Ingest geändert wurden). Leere Inbox → „nichts zu tun“. Andere Formate als `.md`/`.txt` bleiben liegen, mit Hinweis.
2. **Pro Inbox-Datei** (älteste zuerst):
   1. Notiz lesen, **Kategorie bestimmen** anhand `categories.yml`. Passt keine: anhalten und eine neue Kategorie (Slug, Name, Beschreibung) oder die bestpassende bestehende vorschlagen. Neue Kategorie erst nach Freigabe in `categories.yml` eintragen. Wird nichts freigegeben → `_uncategorized`.
   2. `brain archive <datei> --category <slug>`.
   3. Verwandtes finden nach Suchleiter-Prinzip (Index + qmd scoren).
   4. Einarbeiten gemäß `wiki/CLAUDE.md`: bestehenden Eintrag verdichtend ergänzen (Edit) oder neuen per `brain remember` anlegen; `sources`, `updated`, `summary` pflegen; Zusammenhänge per `brain link` setzen.
   5. Widersprüche/Unklarheiten: Nutzer fragen; nicht klärbar → Callout mit ID in allen betroffenen Einträgen.
   6. Geheimnisse nicht übernehmen, Hinweis an den Nutzer.
3. **Abschluss:** `brain index` → `brain check` (Fehler → kein Commit, Probleme zeigen) → `qmd update && qmd embed` → Zusammenfassung (neue/geänderte Einträge, Hinweise aus `brain check`: offene Punkte, Einträge ohne Kategorie) → `brain log ingest …` → Git-Commit `ingest: <n> Notizen – <Themen>`. Niemals push.

**Wiederaufsetzen nach Abbruch:** Original ist bereits archiviert (nicht committet). Zwischenstand per `git status`/`git diff`. `LOG.md` enthält die Zeilen des abgebrochenen Laufs (bewusst, Debug-Hilfe). Neuer Versuch: `git restore wiki/ categories.yml`, neu angelegte Einträge entfernen (`git clean -n wiki/` zeigt, `git clean -f wiki/` löscht), archivierte Datei zurück nach `inbox/` verschieben, `brain index`.

## 9. Abfrage (`/ask <Frage>`)

`/ask` fragt **nur**: kein `brain index`, kein `brain check`, kein `qmd update`, keine Dateiänderungen, kein Log-Eintrag. Es folgt exakt dem Brain-First-Protokoll (6.1) auf dem vorhandenen Stand von `INDEX.md` und qmd-Index. Suchbereich: standardmäßig Collection `wiki`; `/ask --archive <Frage>` nur `archive`, `/ask --all <Frage>` beide (ebenso, wenn die Frage dies ausdrücklich verlangt). Bei Antworten aus dem Archiv wird darauf hingewiesen, dass es sich um Originale handelt, die ggf. durch das Wiki überholt sind. Antwort auf Deutsch, nur aus dem Gelesenen, jede Aussage mit `[[…]]`-Quelle. Kein Treffer → „Dazu steht nichts in deinem Brain“, ggf. thematisch nahe Einträge aus dem Index nennen. Fehlt `INDEX.md` (z. B. frischer Clone), weist `/ask` darauf hin, dass `brain index` einmal ausgeführt werden muss.

## 10. Fehlerfälle

| Fall | Verhalten |
|---|---|
| `brain`-Befehl schlägt fehl | Abbruch von `/ingest`, Meldung zeigen, kein Commit |
| qmd/MCP nicht erreichbar | `/ingest`: weiter nur mit `INDEX.md` + Grep, Hinweis. `/ask`: Problem melden, nicht still schlechter antworten |
| Leere Inbox | „nichts zu tun“ |
| Nicht unterstütztes Format | bleibt in der Inbox, Hinweis |
| Git-Arbeitsverzeichnis nicht sauber | Abbruch vor dem Ingest |
| `brain check` meldet Fehler vor dem Ingest | Abbruch, Bericht zeigen |
| Neue Kategorie abgelehnt | Notiz wird in `_uncategorized` eingearbeitet; `brain check` erinnert daran |
| `INDEX.md` fehlt bei `/ask` | Hinweis: `brain index` ausführen |

## 11. Tests & Verifikation

1. **Spike (erster Schritt):** qmd global installieren, Qwen3-Embedding konfigurieren, kleine Test-Collection indexieren, prüfen ob CUDA auf der RTX 5070 Ti genutzt wird; Ergebnis (GPU/Vulkan/CPU) und Antwortzeiten von `search`/`query` dokumentieren.
2. **Unit-Tests** mit `node:test` je Befehl gegen temporäre Ordner; für Check ④ und `recategorize` ein temporäres Git-Repo. Tabellengetrieben: Slugs, Linkformen, fehlende Felder, Kollisionen, unbekannte Kategorien, `_uncategorized`, asymmetrische Verwandt-Links, unvollständige/doppelte Konflikt-IDs, Idempotenz von `brain link`, Format und Feld-Bereinigung von `brain log`.
3. **Determinismus-Test:** `brain index` zweimal auf gleichen Eingaben → identische `INDEX.md`/`graph.json`; Golden-File-Vergleich für Index und Graph.
4. **Typprüfung:** `tsc --noEmit`.
5. **End-to-End manuell:** 3–4 echte Notizen – eine, die eine neue Kategorie erfordert (einmal freigeben, einmal ablehnen → `_uncategorized`), eine, die einem bestehenden Eintrag widerspricht (Callout in allen betroffenen Einträgen), eine, die mit einem bestehenden Eintrag zusammenhängt (beidseitiger Verwandt-Link). `/ingest`, dann `/ask` mit einer beantwortbaren und einer nicht beantwortbaren Frage; `qmd search` mit `-c wiki`, `-c archive` und ohne `-c` auf Treffer und Antwortzeit prüfen; `/ask --archive` testen; `LOG.md` enthält die erwarteten Zeilen; `brain check` zeigt die erwarteten Hinweise.
