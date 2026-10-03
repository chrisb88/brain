# Second Brain – Design

Datum: 2026-10-03
Status: Entwurf zur Review

## 1. Ziel & Rahmen

Eine persönliche Wissensbasis („Second Brain“) für Job-Wissen (PHP, Azure, Kubernetes, …) und persönliches Wissen an einem Ort. Grundlage sind Markdown-Dateien, die Claude aus Rohnotizen erzeugt und pflegt.

**Festgelegt:**

- Bedienung ausschließlich über Claude Code (WSL/Ubuntu).
- Neue Notizen: direkt im Chat oder als Datei in `inbox/`.
- Verarbeitung nur manuell per `/ingest` – keine Automatik.
- Struktur nach Wiki-Prinzip: Claude pflegt Themenseiten und arbeitet neues Wissen in bestehende Seiten ein.
- Originalnotizen bleiben immer erhalten und werden nie verändert.
- Abfrage per `/ask` antwortet **strikt** aus dem Brain, mit Quellenangabe; fehlendes Wissen wird explizit benannt, nie aus Allgemeinwissen ergänzt.
- Obsidian-kompatibel: `[[Wiki-Links]]`, YAML-Frontmatter.
- Wiki-Seiten auf Deutsch, Fachbegriffe im Original.
- Brain-Ordner liegt auf Windows: `F:\second-brain` = `/mnt/f/second-brain`.
- Hilfsskripte in Node/TypeScript.
- Semantische Suche mit [qmd](https://github.com/tobi/qmd), lokal in WSL, möglichst mit GPU (RTX 5070 Ti, CUDA in WSL vorhanden).

**Erfolgskriterium:** Eine Notiz in die Inbox legen, `/ingest` ausführen → das Wissen landet sinnvoll eingeordnet in Themenseiten. Eine spätere Frage per `/ask` liefert eine korrekte Antwort mit Quellen-Links; eine Frage, deren Antwort nicht im Brain steht, wird als solche erkannt.

**Nicht im Umfang (YAGNI):** Anhänge (PDF, Bilder), automatische Verarbeitung (Watcher/Cron), Git-Remote/Push, Windows-native Installation von Claude Code oder qmd.

## 2. Umgebung

| Komponente | Ort | Hinweis |
|---|---|---|
| Brain-Ordner (Git-Repo) | `/mnt/f/second-brain` | Windows-Laufwerk, Zugriff von Windows/Obsidian direkt |
| Claude Code | WSL | |
| Node.js | WSL, v24.2.0 vorhanden | qmd benötigt ≥ 22; TypeScript läuft per Type-Stripping ohne Build |
| qmd | WSL, global per npm | Modelle (~2 GB) in `~/.cache/qmd/models/` |
| qmd-Index (SQLite) | `~/.cache/qmd/` (Linux-Dateisystem) | **nicht** auf `/mnt/f` – SQLite-Locking über die WSL-Brücke ist unzuverlässig |

**Risiko GPU:** Ob die vorkompilierten CUDA-Binaries von node-llama-cpp (über qmd) die Blackwell-GPU unterstützen, ist offen. Erster Umsetzungsschritt ist ein Spike, der das klärt. Fallbacks: Vulkan, dann CPU (`QMD_FORCE_CPU=1`). Das System funktioniert in jedem Fall, nur unterschiedlich schnell.

## 3. Ordnerstruktur

```
/mnt/f/second-brain/
├── CLAUDE.md              Regeln des Brains
├── .mcp.json              qmd als MCP-Server (projektlokal)
├── .claude/commands/
│   ├── ingest.md          /ingest
│   └── ask.md             /ask
├── inbox/                 neue Rohnotizen (.md, .txt)
├── archive/YYYY/MM/       Originale, unverändert
├── wiki/<bereich>/        Themenseiten
├── index.md               generiert
├── scripts/               Node/TypeScript-Hilfsskripte + Tests
└── docs/superpowers/      Specs & Pläne
```

`.gitignore`: `scripts/node_modules/` sowie der Inhalt von `inbox/` (außer `.gitkeep`) – Rohnotizen landen erst über das Archiv in Git.

## 4. Konventionen

### 4.1 Archiv

- Dateiname: `archive/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md` (Zeitpunkt der Archivierung).
- Inhalt byte-identisch zum Original; `.txt` wird nur zu `.md` umbenannt.
- Dateien in `archive/` werden nach dem Anlegen nie geändert oder gelöscht – abgesichert durch Regel in `CLAUDE.md` und den Check in `check` (Abschnitt 7).

### 4.2 Wiki-Seiten

Pfad: `wiki/<bereich>/<thema>.md`, Bereich und Thema als Kleinbuchstaben-Slugs (z. B. `wiki/kubernetes/ingress.md`).

```markdown
---
title: Kubernetes Ingress
tags: [kubernetes, networking]
summary: Ingress-Controller, TLS-Setup und Erfahrungen aus Projekt X
sources: [archive/2026/10/2026-10-02-1530-ingress-tls.md]
updated: 2026-10-02
---
# Kubernetes Ingress

…Inhalt…, verlinkt mit [[wiki/azure/aks]]

## Quellen
- [[archive/2026/10/2026-10-02-1530-ingress-tls]]
```

- Pflichtfelder: `title`, `summary` (eine Zeile, wird in `index.md` übernommen), `sources` (Liste von Archivpfaden, mindestens einer), `updated` (ISO-Datum). `tags` optional.
- Links immer als vollständiger Pfad ab Repo-Wurzel ohne `.md`: `[[wiki/bereich/thema]]`, optional `[[…|Alias]]` oder `[[…#Abschnitt]]`.
- Widersprüche zwischen Quellen: Obsidian-Callout `> [!warning] Widerspruch` mit beiden Aussagen und ihren Quellen; nie stilles Überschreiben.
- Geheimnisse (Passwörter, Tokens, Keys) werden nie ins Wiki übernommen.

### 4.3 index.md

Generiert durch das Skript `index`, nie von Hand bearbeitet. Gruppiert nach Bereich (Überschrift je Bereich), innerhalb alphabetisch nach Pfad:

```markdown
## kubernetes
- [[wiki/kubernetes/ingress]] — Ingress-Controller, TLS-Setup und Erfahrungen aus Projekt X
```

## 5. Ingest-Ablauf (`/ingest`)

Neue Notizen aus dem Chat speichert Claude zuerst wörtlich als Datei in `inbox/`; danach gilt derselbe Ablauf.

1. **Vorprüfung**
   - `check` muss fehlerfrei sein.
   - Git-Arbeitsverzeichnis muss sauber sein (`inbox/` ist ignoriert), sonst Abbruch mit Hinweis.
   - Leere Inbox → „nichts zu tun“, Ende.
   - Dateien mit anderen Formaten als `.md`/`.txt` bleiben liegen, Claude weist darauf hin.
2. **Pro Inbox-Datei** (älteste zuerst):
   1. `archive <datei>` → Original wird archiviert, neuer Pfad kommt zurück.
   2. Verwandte Seiten finden: `qmd query` (MCP) über das Wiki, ergänzt durch `index.md`.
   3. Einarbeiten: bestehende Seiten ergänzen/korrigieren oder neue anlegen; `sources`, Quellen-Abschnitt, `summary`, `updated` pflegen; `[[Links]]` zu verwandten Seiten setzen.
   4. Unklare Einordnung → Claude fragt nach, statt zu raten.
   5. Enthaltene Geheimnisse → nicht übernehmen, Hinweis an den Nutzer.
3. **Abschluss**
   1. `index` erzeugt `index.md` neu.
   2. `check` – bei Fehlern kein Commit, Probleme anzeigen.
   3. `qmd update && qmd embed` (inkrementell).
   4. Zusammenfassung: neue Seiten, geänderte Seiten, Widersprüche.
   5. Git-Commit `ingest: <n> Notizen – <Themen>`. Niemals push.

**Wiederaufsetzen:** Bricht der Ablauf ab, ist das Original bereits archiviert (noch nicht committet). Zwischenstand per `git status`/`git diff` prüfen. Für einen neuen Versuch: Wiki-Änderungen per `git restore wiki/ index.md` verwerfen, neu angelegte Seiten entfernen (`git clean -n wiki/` zeigt sie, `git clean -f wiki/` löscht sie) und die archivierte Datei zurück nach `inbox/` verschieben.

## 6. Abfrage-Ablauf (`/ask <Frage>`)

- qmd ist als MCP-Server über `.mcp.json` eingebunden (`qmd mcp`, stdio). Grund: Modelle bleiben geladen, Treffer kommen strukturiert. Indexierung läuft per CLI.
- qmd-Collection `wiki` umfasst nur `wiki/**/*.md`. Das Archiv wird nicht indexiert; Details aus Originalen erreicht Claude über `sources`.

Ablauf:

1. **Suchen:** `qmd query` über `wiki`, bei komplexen Fragen mit mehreren Teilanfragen (lexikalisch + semantisch); `index.md` als Überblick.
2. **Lesen:** relevanteste Seiten vollständig, bei Bedarf verlinkte Originale.
3. **Antworten:** auf Deutsch, ausschließlich aus dem gelesenen Inhalt; jede Aussage mit `[[wiki/...]]`-Quelle.
4. **Nichts gefunden:** „Dazu steht nichts in deinem Brain“, ggf. thematisch nahe Seiten nennen; keine Ergänzung aus Allgemeinwissen.
5. `/ask` verändert keine Dateien.

## 7. Hilfsskripte

Ort: `scripts/`, TypeScript, direkt ausgeführt von Node 24. Laufzeitabhängigkeit: `yaml`. Entwicklungsabhängigkeit: `typescript` (`tsc --noEmit` als Typprüfung). Aufruf über npm-Scripts, z. B. `npm --prefix scripts run check`.

| Skript | Eingabe | Verhalten | Ausgabe / Exit |
|---|---|---|---|
| `archive` | Pfad einer Datei in `inbox/` | Zielpfad `archive/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md`; Slug aus Dateinamen ohne Endung: Kleinbuchstaben, ä→ae, ö→oe, ü→ue, ß→ss, sonstige Nicht-Alphanumerik → `-`, mehrfache/Rand-`-` entfernt; Kollision → Suffix `-2`, `-3`, …; Verschieben ohne Inhaltsänderung. Fehler bei: Datei nicht in `inbox/`, nicht vorhanden, falsche Endung. | neuer Pfad (relativ zum Repo) auf stdout; Exit 1 bei Fehler |
| `index` | – | liest Frontmatter aller `wiki/**/*.md`, schreibt `index.md` gemäß 4.3 | Exit 1 bei unlesbarem Frontmatter |
| `check` | – | ① alle `[[Links]]` in `wiki/` und `index.md` lösen auf existierende Dateien auf (inkl. `\|Alias`, `#Abschnitt`); ② Pflichtfelder laut 4.2 vorhanden, `sources`-Einträge existieren; ③ keine Datei unter `archive/` laut `git status --porcelain` geändert/gelöscht/umbenannt (neue, unversionierte Dateien erlaubt) | Fehlerliste auf stderr; Exit 0 ok, Exit 1 bei Fehlern |

Fehlerverhalten in `/ingest`: Exit ≠ 0 eines Skripts → Abbruch, Meldung anzeigen, kein Commit.

## 8. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Skript schlägt fehl | Abbruch von `/ingest`, kein Commit |
| qmd/MCP nicht erreichbar | `/ingest`: weiter mit `index.md` + Grep, Hinweis. `/ask`: Problem melden statt stiller schlechterer Antwort |
| Leere Inbox | „nichts zu tun“ |
| Nicht unterstütztes Format in Inbox | bleibt liegen, Hinweis |
| Git-Arbeitsverzeichnis nicht sauber | Abbruch vor dem Ingest |

## 9. Tests & Verifikation

1. **Spike (erster Umsetzungsschritt):** qmd in WSL installieren, kleine Test-Collection indexieren, prüfen ob CUDA auf der RTX 5070 Ti genutzt wird; Ergebnis GPU/Vulkan/CPU dokumentieren.
2. **Unit-Tests** mit `node:test` je Skript gegen temporäre Ordner; für Check ③ ein temporäres Git-Repo. Fälle tabellengetrieben (Slug-Erzeugung, Linkformen, fehlende Felder, Kollisionen).
3. **Typprüfung:** `tsc --noEmit`.
4. **End-to-End manuell:** 2–3 echte Notizen in die Inbox, `/ingest`, dann `/ask` mit einer beantwortbaren und einer nicht beantwortbaren Frage.
