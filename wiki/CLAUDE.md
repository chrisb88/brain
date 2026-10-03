# Schreibregeln für Wissenseinträge

Gilt für jede Datei in `wiki/<kategorie>/`. Format: Spec Abschnitt 4.3.

## Anlegen und verknüpfen

- Neue Einträge NUR mit `brain remember` anlegen. Der Body kommt über stdin, ohne `# Titel`-Überschrift und ohne `## Sources` (beides schreibt das CLI).
- Beziehungen NUR mit `brain link a b [c …]` / `brain link --remove a b` setzen oder entfernen. `## Related` nie von Hand bearbeiten.
- Nach jedem neuen oder geänderten Eintrag verwandte Einträge suchen (INDEX.md, qmd `query` auf `wiki`) und verknüpfen – auch kategorieübergreifend.
- Genau eine Kategorie pro Eintrag; bei Unklarheit gewinnt das Hauptthema, der Rest wird verlinkt.

## Verdichten statt anhängen

- Neues in den bestehenden Text einarbeiten, Doppeltes zusammenführen, Veraltetes ersetzen (die alte Quelle bleibt in `sources`).
- Keine „Update vom …“-Abschnitte, keine Änderungshistorie im Eintrag.
- Ein Eintrag = ein Thema. Wird ein Eintrag groß oder behandelt mehrere Themen: Aufteilung beim Nutzer vorschlagen.
- Beim Bearbeiten: neuen Archivpfad in `sources` (mit `.md`) und unter `## Sources` (ohne `.md`) ergänzen, `updated` auf heute setzen, `summary` bei Bedarf anpassen (genau ein deutscher Satz, eine Zeile).

## Widersprüche und Unklarheiten

- Zuerst den Nutzer fragen. Nur wenn es jetzt nicht klärbar ist: direkt unter dem `# Titel` in JEDEM betroffenen Eintrag einen Callout setzen, mit identischer ID und identischer `Affects:`-Zeile:

      > [!warning] Conflict C-YYYYMMDD-N
      > Affects: [[wiki/a/x]], [[wiki/b/y]]
      > <deutsche Beschreibung mit Quellenlinks>

  Für Unklarheiten `> [!question] Unclear Q-YYYYMMDD-N`. N zählt pro Tag hoch; vorher prüfen, dass die ID frei ist: `grep -rn "C-YYYYMMDD-" wiki/`.
- Auflösen: Inhalt korrigieren und den Callout mit dieser ID aus ALLEN betroffenen Einträgen entfernen.
- `brain check` erzwingt die Konsistenz.

## Protokollieren

- Nach jeder eigenen Änderung an einem Eintrag: `brain log update <eintrag> "<Beschreibung>"`.
- Neuer offener Punkt: `brain log conflict <id> "<Beschreibung>"`; aufgelöst: `brain log resolve <id> "<Beschreibung>"`.
- Freigegebene neue Kategorie: `brain log category <slug> "<Name>"`.

## Inhalt

- Deutscher Text, Fachbegriffe im Original.
- Nie Geheimnisse (Passwörter, Tokens, Keys) übernehmen – stattdessen den Nutzer darauf hinweisen.
- Links immer als vollständiger Pfad ab Repo-Wurzel ohne `.md`: `[[wiki/kategorie/eintrag]]`, `[[wiki/kategorie/eintrag#Überschrift]]`.
