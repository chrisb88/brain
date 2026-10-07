# Test beider Modi von null an

Datum: 2026-10-07 · Stand `main` nach PR #1 (0.2.0), Fixes in PR #2 (0.3.0) und PR #3 · Durchgeführt vom Nutzer anhand der README, Diagnose durch Claude.

## Privat-Modus

| Punkt | Ergebnis |
|---|---|
| `brain init --private .` in neuem Ordner, Claude-Sitzung | bestanden (Rückmeldung des Nutzers: „alles gut funktioniert“; Einzelpunkte nicht protokolliert) |

## Projekt-Modus als Teammitglied (frischer Klon)

Rechner, auf dem der Marketplace `brain` bereits registriert war; Klon `/home/chris/hla-map` von `/mnt/f/_projects/hla-map`.

| Befund | Ursache | Lösung |
|---|---|---|
| Keine Abfrage zum Marketplace beim Start | Marketplace war schon bekannt (`known_marketplaces.json`) | erwartet |
| `/plugin` zeigt `brain` mit „Plugin "brain" not cached at …/cache/brain/brain/0.2.0“ – kein Hook, keine Befehle, kein MCP | Projekt-Plugins werden pro Checkout-Pfad installiert (`installed_plugins.json`, `projectPath`); für den Klon gab es keinen Eintrag. Laut Doku installiert Claude Code ein nur in `.claude/settings.json` aktiviertes Plugin nicht selbst – jeder führt einmal `claude plugin install … --scope project` aus | `brain setup` (PR #2) |
| „Update“ in `/plugin` half nur bis zum Neustart | legte keinen Eintrag für den Pfad an | `claude plugin install brain@brain --scope project` bzw. `brain setup` |
| `claude plugin list` zeigt „✔ enabled“ | Liste enthält die Einträge anderer Projekte | irreführend, nur Hinweis |
| `INDEX.md` fehlte | generiert und ignoriert; der Hook (`brain index` im Hintergrund) lief wegen des fehlenden Plugins nie | `brain setup` erzeugt sie |
| qmd-Index fehlte | pro Klon nötig | `brain setup` richtet ihn ein, warnt bei `hybrid` vor ~2.5 GB Download |
| `claude plugin install` ordnet `.claude/settings.json` um (gleicher Inhalt) | Schlüsselreihenfolge von Claude Code | `brain setup`/`brain init` stellen die eingecheckte Datei wieder her |

## Update des Installations-Klons

| Befund | Ursache | Lösung |
|---|---|---|
| `install.sh`: „brain – nicht im PATH, npm-Prefix prüfen“ | `scripts/src/cli.ts` war als `100644` eingecheckt (Entwicklung auf NTFS, `core.fileMode=false`); `git pull` ersetzte die von `npm link` ausführbar gemachte Datei | als `100755` eingecheckt, Test (PR #3) |
| Plugin aktualisiert sich nicht automatisch | Auto-Update ist für Marketplaces von Dritten standardmäßig aus | `brain init` setzt `autoUpdate: true` am Marketplace in `.claude/settings.json` (PR #3); sonst `/plugin` → Marketplaces → `brain` → Enable auto-update |
| `push.autoSetupRemote` wirkte nicht | Git 2.34 kennt die Einstellung nicht (ab 2.37) | Git aktualisiert |

## Abschluss

Neuer Checkout eines Projekts, Schritte nach README (`./install.sh`, `brain setup`, Claude im Repo-Root): bestanden.

## Offen

- Fall „Teammitglied ohne registrierten Marketplace“ (Abfrage beim Start) nicht nachgestellt; `brain setup` deckt ihn mit `marketplace add` ab.
- Tests hinterließen tausende Temp-Ordner in `/tmp` – eigener Fix.
