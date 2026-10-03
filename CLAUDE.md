# Second Brain – Code-Repository

Entwicklung des CLI `brain` und der Vorlagen für Brain-Daten-Repositories. **Hier liegen keine Brain-Daten.** Das Brain selbst liegt in einem eigenen Daten-Repository (Standard: `/mnt/f/second-brain-data`), das nie gepusht wird.

## Aufbau

- `scripts/` – CLI `brain` (Node 24, TypeScript per Type-Stripping, Abhängigkeit nur `yaml`). Tests: `npm --prefix scripts test`, Typprüfung: `npm --prefix scripts run typecheck`.
- `template/` – Konfiguration für Daten-Repos, Pfade 1:1 (`_gitignore` → `.gitignore`, `_gitattributes` → `.gitattributes`). Änderungen hier landen per `brain init --update` im Daten-Repo.
- `docs/superpowers/` – Specs, Pläne, Notizen. Datenvertrag: `specs/2026-10-03-second-brain-design.md`; Trennung Code/Daten: `specs/2026-10-03-data-repo-separation-design.md`.

## Einrichtung

1. `npm --prefix scripts install && npm --prefix scripts link` → `brain` im PATH.
2. Neues Brain: `brain init /mnt/f/second-brain-data` (legt Git-Repo ohne Remote mit Push-Schutz an und richtet den qmd-Index ein).
3. Benutzung (`/ingest`, `/ask`): Claude Code im Daten-Repo starten, nicht hier.

## Regeln für die Entwicklung

- Nie Brain-Daten (`inbox/`, `archive/`, `wiki/`-Einträge, `categories.yml`) in dieses Repository legen oder committen.
- Tests nie gegen das echte Brain laufen lassen; Tests nutzen temporäre Ordner (`scripts/test/helpers.ts`).
- Zum Ausprobieren ein Wegwerf-Brain: `brain init /tmp/brain-test` bzw. `BRAIN_ROOT=/tmp/brain-test brain …`.
- `git push` führt der Nutzer selbst aus.
- Sprache: Code, CLI und `brain help` Englisch; Meldungen an den Nutzer und Anweisungsdateien Deutsch.
