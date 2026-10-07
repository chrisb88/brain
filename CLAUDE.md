# brain – Code-Repository

Entwicklung des CLI `brain`, des Claude-Code-Plugins `brain` und der Vorlagen für Wissens-Ordner. **Hier liegt kein Wissen (keine Daten).** Ein Wissens-Ordner liegt in einem Projekt-Repository (`brain init`) oder in einem eigenen privaten Repository (`brain init --private`).

## Aufbau

- `scripts/` – CLI `brain` (Node 24, TypeScript per Type-Stripping, Abhängigkeit nur `yaml`). Tests: `npm --prefix scripts test`, Typprüfung: `npm --prefix scripts run typecheck`.
- `plugin/` – Claude-Code-Plugin `brain` (Befehle, Skill, Hook, qmd-MCP); `.claude-plugin/marketplace.json` – Marketplace `brain`. Version in `plugin/.claude-plugin/plugin.json` = Version in `scripts/package.json`.
- `template/` – Dateien für den Wissens-Ordner (`_gitignore` → `.gitignore`, `_gitattributes` → `.gitattributes`, `CLAUDE.md`); `brain init --update` übernimmt sie.
- `docs/superpowers/` – Specs, Pläne, Notizen. Aktuell: `specs/2026-10-06-plugin-unified-brain-design.md`; Datenvertrag: `specs/2026-10-03-second-brain-design.md`.

## Einrichtung

1. `./install.sh` → `brain` im PATH, Marketplace registriert.
2. Zum Ausprobieren ein Wegwerf-Wissens-Ordner: `mkdir /tmp/brain-test && cd /tmp/brain-test && brain init --private .`

## Regeln für die Entwicklung

- Nie Wissens-Daten (`inbox/`, `archive/`, `wiki/`-Einträge, `categories.yml`, `brain.yml`) in dieses Repository legen oder committen.
- Tests nie gegen echte Daten laufen lassen; Tests nutzen temporäre Ordner (`scripts/test/helpers.ts`).
- Bei Versionswechsel beide Versionen anheben (`scripts/package.json`, `plugin/.claude-plugin/plugin.json`).
- `git push` führt der Nutzer selbst aus.
- Sprache: Code, CLI und `brain help` Englisch; Meldungen an den Nutzer und Anweisungsdateien Deutsch.
