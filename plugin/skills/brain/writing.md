# Schreibregeln für Wissenseinträge

Gilt für jede Datei in `wiki/<kategorie>/` des Wissens-Ordners.

## Anlegen und verknüpfen

- Neue Einträge NUR mit `brain remember` anlegen. Der Body kommt über stdin, ohne `# Titel`-Überschrift und ohne `## Sources` (beides schreibt das CLI).
- Beziehungen NUR mit `brain link a b [c …]` / `brain link --remove a b` setzen oder entfernen. `## Related` nie von Hand bearbeiten.
- Nach jedem neuen oder geänderten Eintrag verwandte Einträge suchen (Suchleiter im Skill, Schritt 1–2, gemäß Suchstufe) und verknüpfen – auch kategorieübergreifend.
- Genau eine Kategorie pro Eintrag; bei Unklarheit gewinnt das Hauptthema, der Rest wird verlinkt.

## Ist-Zustand, keine Historie

Ein Eintrag beschreibt, wie etwas jetzt ist und warum. Er ist kein Bericht über einen Vorgang.

- Nicht hinein gehören: die Erzählung eines Vorgangs (wer wann was getan hat), Zeitmarker wie „damals“, „jetzt“, „inzwischen“, „neu“, einmalige Ausführungspläne und kurzlebige Momentaufnahmen (aktuelle Versionsnummer, Anzahl der Unit-Tests, Stichtagswerte).
- Zahlen im Einzelfall prüfen: Veraltet der Wert bald von selbst, bleibt er draußen. Ist er ein dauerhafter Fakt („benötigt PHP 8.3“, „Rate-Limit 100 req/s“), bleibt er drin.
- Was aus einem Vorgang bleibt, sind die Erkenntnisse: die Entscheidung, ihre Begründung, Fallstricke, Verhalten, Zusammenhänge. Sie werden als Zustand formuliert („X funktioniert so, weil Y“), nicht als Geschehen („wir haben X umgestellt“).
- Auch ein Vorhaben ist ein Zustand: „X soll eingeführt werden, weil Y“. Ändert sich der Stand, ersetzt er diese Aussage: „X ist eingeführt“ oder „X wird nicht eingeführt, weil Z“. Ein Vorhaben nie so formulieren, als wäre es schon umgesetzt.
- Ist eine Zeitangabe selbst der Inhalt (Frist, Stichtag, Gültigkeit), steht sie als datierter Fakt („gilt bis 2026-12-31“), nicht relativ.
- Berichtsförmige Notiz (Ticket-Bericht, Protokoll, Tagebuch, Konzept): nicht übernehmen, sondern umschreiben. Das Original bleibt in `archive/`.
- Neue Information ersetzt die betroffene Stelle. Sie wird nicht daneben gestellt und nicht als Korrektur markiert. Ist nicht offensichtlich, was stimmt, entscheidet der Nutzer (siehe „Widersprüche und Unklarheiten“).
- Keine feste Gliederung. Überschriften nur, wo sie dem Leser helfen.

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

  Für Unklarheiten `> [!question] Unclear Q-YYYYMMDD-N`. N zählt pro Tag hoch; vorher prüfen, dass die ID frei ist: `cd <Wissens-Ordner> && grep -rnE "[CQ]-YYYYMMDD-" wiki/`.
- Conflict: Zwei Aussagen können nicht beide stimmen (das Wiki sagt „x läuft mit PHP 8.3“, eine neue Notiz „x läuft mit PHP 8.2“). Unclear: Eine Information fehlt, oder es ist offen, ob sich die Aussagen überhaupt widersprechen (eine Notiz sagt „x benötigt PHP 8.3“, die Doku „das Gesamtsystem läuft auf PHP 8.2“).
- Auflösen: Inhalt korrigieren und den Callout mit dieser ID aus ALLEN betroffenen Einträgen entfernen.
- `brain check` erzwingt die Konsistenz.

## Protokollieren

- Nach jeder eigenen Änderung an einem Eintrag: `brain log update <eintrag> "<Beschreibung>"`.
- Neuer offener Punkt: `brain log conflict <id> "<Beschreibung>"`; aufgelöst: `brain log resolve <id> "<Beschreibung>"`.
- Neue Kategorien protokolliert `brain category add` selbst.

## Inhalt

- Deutscher Text, Fachbegriffe im Original.
- Nie Geheimnisse (Passwörter, Tokens, Keys) übernehmen – stattdessen den Nutzer darauf hinweisen.
- Links immer als vollständiger Pfad ab Wissens-Ordner ohne `.md`: `[[wiki/kategorie/eintrag]]`, `[[wiki/kategorie/eintrag#Überschrift]]`.
