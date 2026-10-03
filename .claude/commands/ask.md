---
description: Das Second Brain befragen – Antworten nur aus dem Brain
argument-hint: [--archive | --all] <Frage>
---

Beantworte die Frage AUSSCHLIESSLICH aus dem Brain. Nur lesen: kein `brain index`, kein `brain check`, kein `qmd update`, keine Dateiänderungen, keine Log-Einträge.

Eingabe: `$ARGUMENTS`

- beginnt mit `--archive` → nur Collection `archive` durchsuchen
- beginnt mit `--all` → Collections `wiki` und `archive`
- sonst → Collection `wiki` (nur wechseln, wenn die Frage ausdrücklich nach dem Archiv oder nach allem fragt)

Existiert `INDEX.md` nicht: den Nutzer bitten, einmal `brain index` auszuführen, und abbrechen.

Die Suchleiter aus `CLAUDE.md` exakt befolgen:

1. Keywords bestimmen.
2. Mit `INDEX.md` und qmd `query` (gewählte Collection) scoren, ohne Dateien zu öffnen.
3. Genau EINE Top-Datei öffnen.
4. Nur den relevanten Abschnitt lesen.
5. Höchstens EINEM Pointer folgen.
6. Antworten.

Antwort auf Deutsch, jede Aussage mit `[[…]]`-Quellenlink. Bei Antworten aus dem Archiv darauf hinweisen, dass Originale durch das Wiki überholt sein können.
Passt nichts: „Dazu steht nichts in deinem Brain.“ und ggf. thematisch nahe Einträge aus `INDEX.md` nennen. Lücken nie mit Allgemeinwissen füllen.
Ist qmd nicht erreichbar: das sagen, statt still schlechter zu antworten.
