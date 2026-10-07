# Abnahme Plugin und einheitliche Brain-Struktur

Datum: 2026-10-07 · Branch `feat/plugin-unified-brain` · Claude Code mit lokalem Marketplace (`claude plugin marketplace add /mnt/f/second-brain`), Wegwerf-Projekte `/tmp/kb-accept` und `/tmp/kb-accept2`.

## Offene Fragen der Spec

| Frage | Ergebnis |
|---|---|
| 1. Start des Plugin-MCP-Servers (cwd/Umgebung) | Beim Start im Repo-Root: `plugin:brain:qmd` verbunden, `brain qmd mcp` findet den Wissens-Ordner. `env` mit `CLAUDE_PROJECT_DIR` in `plugin/.mcp.json` ist nicht nötig. |
| 2. Trägt `claude plugin install --scope project` den Marketplace ein? | Nein – `.claude/settings.json` enthält nur `"enabledPlugins": {"brain@brain": true}`. README beschreibt jetzt den Eintrag `extraKnownMarketplaces`, den ein geteiltes Projekt einmal ergänzt. |
| 3. Hintergrund-Aktualisierung beim Sitzungsstart | Funktioniert: kein verzögerter Start; `INDEX.md`/`graph.json` nach Neustart neu geschrieben (19:34 Ingest → 19:37 Neustart). |

## Prüfliste

| Punkt | Ergebnis |
|---|---|
| Start in `src/` (Unterordner) | **Nicht unterstützt.** Projekt-Plugins aus `.claude/settings.json` gelten nur, wenn Claude Code im Repo-Root startet; aus `src/` ist `brain@brain` deaktiviert (`claude plugin list`: ✘ disabled) – kein Hook, keine Befehle, kein MCP. Das CLI `brain` findet `brain.yml` aus Unterordnern weiterhin. README: „Start Claude Code in the repository root“. |
| 1. Kontextzeile (Start im Root) | bestanden – Claude nennt `knowledge/`, mode project, search keyword aus dem Hook, ohne Shell-Befehle |
| 2. `/mcp` zeigt `qmd` | bestanden – verbunden |
| 3. `/brain:ingest …` | bestanden – Kategorie `infrastructure` nach Rückfrage, Archiv- und Wiki-Eintrag, kein Commit, Änderungen nur unter `knowledge/` |
| 4. `/brain:ask …` | bestanden – Antwort mit `[[wiki/…]]`-Link |
| 5. Sitzungsstart ohne Verzögerung, Index aktualisiert | bestanden |
| 6. `brain init` ohne Pfad im Terminal | bestanden – Abfrage `Wissens-Ordner [knowledge]:`, Enter legt `knowledge/` an |
| 7. `BRAIN_SEARCH=off` | bestanden – Kontextzeile `search: off`, `qmd` fehlgeschlagen mit Meldung, nach Deaktivieren sucht `/brain:ask` per Grep |

## Weitere Befunde

- `install.sh`: `npm --prefix scripts link` legte den Link in `scripts/bin`/`scripts/lib` statt global (`--prefix` verschiebt auch das globale Präfix) → ersetzt durch `(cd scripts && npm link)`. Spec Abschnitt 6 nennt noch den alten Befehl.
- `install.sh`: `claude plugin marketplace add chrisb88/brain` schlägt erwartungsgemäß fehl, solange das GitHub-Repo nicht umbenannt und gepusht ist; das Script gibt nur einen Hinweis aus.
- Altes global verlinktes Paket `second-brain-scripts` musste vorher entfernt werden (`npm rm -g second-brain-scripts`).
