# Spec 2 „Sprache und Teamfähigkeit“ – bereits getroffene Entscheidungen

Stand: 2026-10-07. Grundlage für die spätere Spec 2; setzt Spec 1 (`specs/2026-10-06-plugin-unified-brain-design.md`) voraus.

## Sprache

- Neues Feld `language` in `brain.yml`; erlaubt nur `de` und `en`.
- Der gewählten Sprache folgen:
  1. Wiki-Einträge (Titel, Summary, Text),
  2. Antworten und Rückmeldungen von Claude (`/brain:ask`, Ingest-Zusammenfassung, Rückfragen, Hinweise) – die Kontextzeile des Hooks nennt die Sprache, feste Sätze wie „Dazu steht nichts im Wissen.“ werden sinngemäß übersetzt,
  3. Meldungen des CLI (Fehler, Hinweise, Ausgaben von `brain check`, `brain init` …) über einen Meldungskatalog `de`/`en` im Code.
- Nicht übersetzt: Anweisungsdateien (Skill, Commands – bleiben Deutsch, nur Claude liest sie), `brain help` (Englisch)
- Solange keine `brain.yml` gefunden ist (z. B. „Kein Wissens-Ordner gefunden“, Fehler vor dem Anlegen in `brain init`, `brain qmd prune`): immer Englisch.
- Wahl beim `init`: Abfrage `Sprache der Inhalte [de]:` (Vorschlag aus der Systemsprache) bzw. Option `--language <de|en>`; ohne Terminal gilt die Systemsprache (`LANG`/`LC_ALL` beginnt mit `de` → `de`, sonst `en`).
- qmd-Kontexttexte der Collections folgen `language`. Embedding-Modell bleibt ein mehrsprachiges für alle (Spec 1, Abschnitt 8.2).

## Teamfähigkeit

- Neue Konflikt-/Unklarheits-IDs mit kurzem Zufallsanteil statt Tageszähler (z. B. `C-20261006-k3f9`); bestehende IDs bleiben gültig, Format wird auf `[0-9a-z]+` erweitert.
- Kein Autorenfeld in Einträgen; Urheberschaft kommt aus Git.
