---
description: Das Wissen befragen – Antworten nur aus dem Wissen
argument-hint: [--archive | --all] <Frage>
---

Beantworte die Frage AUSSCHLIESSLICH aus dem Wissen (Skill `brain`). Nur lesen: kein `brain index`, kein `brain check`, kein `brain qmd update`, keine Dateiänderungen, keine Log-Einträge. Wissens-Ordner und Suchstufe stehen in der Kontextzeile `Brain: …`.

Eingabe: `$ARGUMENTS`

- beginnt mit `--archive` → nur Collection `archive` durchsuchen
- beginnt mit `--all` → Collections `wiki` und `archive`
- sonst → Collection `wiki` (nur wechseln, wenn die Frage ausdrücklich nach dem Archiv oder nach allem fragt)

Existiert `INDEX.md` im Wissens-Ordner nicht: den Nutzer bitten, einmal `brain index` auszuführen, und abbrechen.

Die Suchleiter aus dem Skill `brain` exakt befolgen, Kandidaten gemäß Suchstufe (`hybrid`, `keyword`, `off`) mit der gewählten Collection finden:

1. Keywords bestimmen.
2. Kandidaten scoren, ohne Dateien zu öffnen.
3. Genau EINE Top-Datei öffnen.
4. Nur den relevanten Abschnitt lesen.
5. Höchstens EINEM Pointer folgen.
6. Antworten.

Antwort auf Deutsch, jede Aussage mit `[[…]]`-Quellenlink. Bei Antworten aus dem Archiv darauf hinweisen, dass Originale durch das Wiki überholt sein können.
Passt nichts: „Dazu steht nichts im Wissen.“ und ggf. thematisch nahe Einträge aus `INDEX.md` nennen. Lücken nie mit Allgemeinwissen füllen.
Ist der qmd-MCP-Server bei `hybrid`/`keyword` nicht erreichbar: das sagen und mit `INDEX.md` und Grep weitersuchen, statt still schlechter zu antworten.
