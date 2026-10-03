# Offene Punkte (zurückgestellt)

Aus dem Final Review vom 2026-10-03 (Branch `feat/brain-core`). Bewusst zurückgestellt, später angehen.

1. **`## C#`-Überschriften** – `markdown.ts` (`HEADING`) liest `## C#` als `C` (abschließendes `#` ohne Leerzeichen). Folge: falscher Fehler „Abschnitt fehlt“ bei `[[…#C#]]`, falscher Anker in der Referenz-Map. Fix: `/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/`.
2. **Archiv-Prüfung hängt an Git-Config** – `git.ts` nutzt `git status` ohne `--find-renames`; mit `status.renames=false` erscheinen per `recategorize` verschobene Dateien als gelöscht. Fix: `--find-renames` ergänzen.
3. **Groß-/Kleinschreibung auf `/mnt/f`** – `existsSync` akzeptiert `[[wiki/Gesundheit/Laufen]]`, Graph und Related-Prüfung vergleichen exakt → fehlende Kante, übersprungene Symmetrieprüfung. Fix: `wiki/`-Ziele gegen die eingelesenen IDs (exakte Schreibweise) prüfen.
4. **YAML-Formatierung geht verloren** – `saveCategories` verwirft Kommentare und schreibt `description: ''`; `updateFrontmatter` schreibt LF in CRLF-Einträge.
5. **Abgebrochenes `git mv` in `recategorize`** – Teilzustand ohne ausgegebene Wiederherstellungsschritte. Fix: Hinweis auf `git restore --staged --worktree …` ausgeben.
6. **Obsidian indexiert `scripts/node_modules`** – in Obsidian unter Einstellungen → Dateien & Links → „Ausgeschlossene Dateien“ `scripts/` eintragen (bzw. `userIgnoreFilters` in `.obsidian/app.json`).
7. **Links in Inline-Code** – `recategorize` schreibt `[[…]]` in Inline-Code mit um (Code-Blöcke bleiben unberührt).
8. **Frischer Clone** – `brain` braucht einmalig `npm --prefix scripts install && npm --prefix scripts link`; steht bisher nur im Plan, nicht in `CLAUDE.md`.
9. **Abnahme Task 14** – End-to-End-Test mit echten Notizen, Obsidian und `/ask` steht noch aus.
