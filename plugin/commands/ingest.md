---
description: Alle Notizen aus der Inbox ins Wiki einarbeiten
argument-hint: [Notiztext, der vorher aufgenommen wird]
---

Verarbeite die Inbox gemäß Skill `brain` (Regeln, Suchleiter) und dessen `writing.md`. Wissens-Ordner, Modus und Suchstufe stehen in der Kontextzeile `Brain: …`. Alle Pfade sind relativ zum Wissens-Ordner; Shell-Befehle laufen als `cd <Wissens-Ordner> && …`.

Ist `$ARGUMENTS` nicht leer: zuerst wörtlich als `inbox/chat-note.md` speichern (`chat-note-2.md`, … falls belegt); den Zeitstempel ergänzt später `brain archive`.

## 1. Vorprüfung – bei Fehlschlag abbrechen

1. `git status --porcelain -- .` (im Wissens-Ordner) muss leer sein. Sonst abbrechen, die Ausgabe zeigen und den Nutzer bitten, die Änderungen zuerst zu committen oder zu verwerfen.
2. `brain check` muss mit Exit 0 enden. Sonst abbrechen und den Bericht zeigen.
3. `brain index`
4. `ls -tr inbox/` (`.gitkeep` ignorieren). Leer → „Nichts zu tun.“ und Ende. Andere Formate als `.md`/`.txt` bleiben in der Inbox; darauf hinweisen.

## 2. Pro Notiz, älteste zuerst

1. Notiz lesen. Genau eine Kategorie aus `categories.yml` wählen (Hauptthema gewinnt).
   Passt keine: anhalten und den Nutzer fragen (AskUserQuestion) – neue Kategorie vorschlagen (Slug, deutscher Name, ein Satz Beschreibung) sowie die bestpassende bestehende.
   - Neue Kategorie freigegeben → `brain category add <slug> --name "<Name>" --description "<ein Satz>"` (protokolliert selbst).
   - Nichts freigegeben → `_uncategorized`.
2. `brain archive inbox/<datei> --category <slug>` → ausgegebenen Archivpfad merken.
3. Verwandtes Wissen mit Schritt 1–2 der Suchleiter finden (gemäß Suchstufe). Pflicht, auch bei offensichtlich neuem Thema. Das Ergebnis für die Zusammenfassung festhalten.
4. Notiz prüfen, bevor etwas geschrieben wird: Ist sie ein Bericht über einen Vorgang oder enthält sie Zahlen, Zeitmarker, Ausführungspläne? Dann die Erkenntnisse als Ist-Zustand umformulieren (`writing.md`, „Ist-Zustand, keine Historie“), nicht den Text der Notiz übernehmen.
5. Einarbeiten gemäß `writing.md`:
   - bestehendes Thema → Eintrag verdichtend bearbeiten, Quelle ergänzen, dann `brain log update …`
   - neues Thema → `brain remember --category … --title "…" --summary "…" --source <archivpfad> [--related …] <<'EOF'` … `EOF`
   - Beziehungen → `brain link …`
6. Widersprüche oder Unklarheiten → Nutzer fragen; ungeklärt → Callouts in allen betroffenen Einträgen und `brain log conflict …`. Ist nicht offensichtlich, was stimmt, immer den Nutzer fragen. Zusätzlich die Dokumente zum Thema außerhalb des Wissens-Ordners (z. B. Projektdokumentation) lesen und mit der Notiz abgleichen, falls es welche gibt; Widersprüche und Unklarheiten dem Nutzer vorlegen. Diese Dokumente dienen nur dem Abgleich: Ihr Inhalt wird nicht ins Wiki übernommen, außer als Beleg eines Widerspruchs im Callout.
7. Geheimnisse → nicht übernehmen, Nutzer informieren.

## 3. Abschluss

1. Selbst-Review (Claude, ohne den Nutzer einzubinden): Jeden neuen oder geänderten Eintrag noch einmal lesen, bevor `brain index` läuft. Keine Erzählung, keine Zeitmarker, keine kurzlebigen Zahlen? Vorhaben als Vorhaben formuliert? Keine relevante Information aus der Notiz verloren, auch keine dauerhaften Fakten, keine Altfassung stehen geblieben? Nichts aus externen Dokumenten übernommen? Nicht Offensichtliches dem Nutzer vorgelegt statt selbst entschieden? Bei Verstößen korrigieren.
2. `brain index`
3. `brain check` – Fehler, die in diesem Lauf entstanden sind, beheben. Sonst abbrechen und den Bericht zeigen.
4. `brain refresh` – Suchindex gemäß Suchstufe aktualisieren (`hybrid`: update + embed, `keyword`: update, `off`: nichts).
5. Zusammenfassung für den Nutzer: pro Notiz eine Zeile „Verwandt: …“ (entfällt, wenn nichts gefunden wurde) und was bewusst nicht übernommen wurde; neue Einträge, geänderte Einträge, neue Verknüpfungen; Ergebnis des Selbst-Reviews (was korrigiert wurde oder „keine Korrekturen“); Hinweise aus `brain check` (offene Punkte, Einträge ohne Kategorie).
6. `brain log ingest "<n> Notizen" "<Kategorien>"`
7. Nicht committen. Dem Nutzer sagen: „Änderungen im Wissens-Ordner prüfen und committen“ und als Vorschlag ausgeben: `git add <Wissens-Ordner> && git commit -m "ingest: <n> Notizen – <Themen>"`. Nie pushen.

## Wiederaufsetzen nach Abbruch

Dem Nutzer erklären: Das Original ist bereits archiviert (nicht committet); `git status -- .` / `git diff -- .` im Wissens-Ordner zeigen den Stand. Für einen neuen Versuch im Wissens-Ordner: `git restore wiki/ categories.yml`, neue Einträge entfernen (`git clean -n wiki/` zeigt sie, `git clean -f wiki/` löscht sie), die archivierte Datei zurück nach `inbox/` verschieben, `brain index`.
