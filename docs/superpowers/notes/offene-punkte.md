# Offene Punkte

Aus dem Final Review vom 2026-10-03. Die Punkte 1–3 und 5–8 sind auf Branch `fix/review-findings` behoben (Tests in `scripts/test/review-fixes-2.test.ts`).

## Bewusst nicht umgesetzt

- **YAML-Formatierung beim Neuschreiben** – `saveCategories` verwirft eigene Kommentare und schreibt `description: ''`; `updateFrontmatter` (recategorize) schreibt LF auch in CRLF-Einträge. Entscheidung: `categories.yml` wird nie von Hand bearbeitet (fester Kommentar-Kopf mit Verweis auf `brain category add`); Einträge entstehen mit LF. Erneut prüfen, falls sich das ändert.

## Aus dem Review der Code/Daten-Trennung (2026-10-03), zurückgestellt

1. **SIGTERM an `brain qmd mcp`** – der qmd-Kindprozess bleibt kurz bestehen (`spawnSync`); endet, sobald Claude Code stdin schließt. Fix: `spawn` mit Signal-Weiterleitung.
2. **Veralteter Verweis in `template/CLAUDE.md`** – Zeile 4 nennt die Spec im Code-Repo als Pfad, der im Daten-Repo nicht existiert. Fix: „im Code-Repo second-brain“ ergänzen.
3. **Haupt-Spec Abschnitte 6/7** – erwähnen noch `qmd update && qmd embed` und `index.yml`; maßgeblich ist die Trennungs-Spec (`brain qmd …`, `<index>.yml`).
4. **Unbekannter Befehl außerhalb eines Brains** – meldet „Kein Brain gefunden“ statt „Unbekannter Befehl → brain help“.
5. **`brain init --update` ohne Git-Repo** – roher Git-Fehler statt verständlicher Meldung.
6. **Ausführungsrecht des Hooks** – `brain check` prüft nicht, ob `pre-push` ausführbar ist (auf `/mnt/f` irrelevant, auf ext4 möglich).

Akzeptiertes Restrisiko: `git push --no-verify <url>` umgeht den Hook ohne Spur; Schutz dagegen ist nur organisatorisch (Regel in `CLAUDE.md`).
