# Offene Punkte

Aus dem Final Review vom 2026-10-03. Die Punkte 1–3 und 5–8 sind auf Branch `fix/review-findings` behoben (Tests in `scripts/test/review-fixes-2.test.ts`).

## Bewusst nicht umgesetzt

- **YAML-Formatierung beim Neuschreiben** – `saveCategories` verwirft eigene Kommentare und schreibt `description: ''`; `updateFrontmatter` (recategorize) schreibt LF auch in CRLF-Einträge. Entscheidung: `categories.yml` wird nie von Hand bearbeitet (fester Kommentar-Kopf mit Verweis auf `brain category add`); Einträge entstehen mit LF. Erneut prüfen, falls sich das ändert.
