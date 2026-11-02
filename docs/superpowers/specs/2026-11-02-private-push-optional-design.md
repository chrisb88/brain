# Privater Wissens-Ordner: Push-Schutz optional – Design

Datum: 2026-11-02
Status: Entwurf zur Review
Bezug: ändert `2026-10-06-plugin-unified-brain-design.md` (Abschnitte zu `brain init --private`, `brain init --update` – dort „`brain.yml` wird nie angefasst“ –, `brain check`, Kontextzeile) und damit Abschnitt 5 von `2026-10-03-data-repo-separation-design.md`. Wo diese Spec abweicht, gilt diese Spec.

## 1. Ziel

Bisher bedeutet `mode: private` immer: kein Remote, jeder Push wird per Hook abgelehnt. Der Grund dafür (`2026-10-03-data-repo-separation-design.md`) war, dass Code und Wissen im selben Repository lagen und ein Push des Codes persönliches Wissen mit hochgeladen hätte. Das ist mit dem eigenen Repository für privates Wissen erledigt.

Heute verhindert der strikte Schutz vor allem sinnvolle Remotes: ein Backup-Laufwerk, ein eigener Server, ein privates Repository bei einem Git-Hoster. Gleichzeitig ist das Backup im privaten Modus Sache des Nutzers.

Künftig trennt brain zwei Fragen:

- **Privat** (`mode: private`): eigenes Repository, nicht Teil eines Projekts.
- **Nur lokal** (`push_guard: true`): kein Remote, jeder Push wird abgelehnt – wie bisher.

Der Nutzer entscheidet beim Anlegen, ob sein privater Wissens-Ordner nur lokal bleibt. Voreinstellung bleibt „nur lokal“.

**Erfolgskriterium:**
- `brain init --private` fragt im Terminal, ob der Wissens-Ordner nur lokal bleiben soll; ohne Terminal entscheidet das Flag `--allow-push`, sonst gilt „nur lokal“.
- Mit `push_guard: false` lässt sich ein Remote anlegen und pushen; `brain check` meldet dafür keinen Fehler.
- Bestehende private Wissens-Ordner (ohne `push_guard` in `brain.yml`) verhalten sich unverändert.
- Umstellen geht über `brain.yml` und `brain init --update`.
- Claude pusht in keinem Modus und mit keiner Einstellung von sich aus.

**Nicht im Umfang:** Prüfen, wie privat ein Remote ist (öffentlich/privat, eigener Server); automatisches Pushen oder Backups durch brain; Push-Schutz für `mode: project`.

## 2. `brain.yml`

Neuer optionaler Schlüssel `push_guard` (Boolean), nur bei `mode: private` erlaubt:

```yaml
# Brain configuration. Created by brain init.
# After changing this file run: brain init --update
# brain init --update rewrites this file - your own comments will be lost.
path: .
mode: private
push_guard: false
```

- Die Kommentarzeilen gehören zum festen Format: `brain init` schreibt sie in jede `brain.yml` (beide Modi), `brain init --update` stellt sie wieder her (Abschnitt 4).
- Fehlt der Schlüssel bei `mode: private`, gilt `push_guard: true` (bestehende Wissens-Ordner bleiben geschützt).
- `push_guard` bei `mode: project` → Fehler beim Laden: „push_guard nur bei mode: private“.
- Anderer Wert als `true`/`false` → Fehler: „push_guard muss true oder false sein“.
- `brain init` schreibt den Schlüssel bei `mode: private` immer ausdrücklich, damit die Entscheidung in der Datei sichtbar ist.

`BrainConfig` bekommt `pushGuard: boolean` (bei `project` immer `false`).

## 3. `brain init --private`

Ablauf (Änderungen gegenüber heute fett):

1. Repository bestimmen bzw. anlegen wie bisher.
2. **Push-Schutz entscheiden:**
   - `--allow-push` gesetzt → `push_guard: false`, keine Frage.
   - Sonst mit Terminal: Frage `Nur lokal – Pushen verhindern? [Y/n] `. Leer, `y`, `yes`, `j`, `ja` → `true`; `n`, `no`, `nein` → `false`; andere Eingabe → Frage wiederholen.
   - Sonst (kein Terminal) → `push_guard: true`.
3. Hat das Repository ein Remote: **nur bei `push_guard: true`** Fehler (wie bisher, geprüft bevor etwas geschrieben wird). Bei `push_guard: false` ist ein vorhandenes Remote erlaubt.
4. Wissens-Ordner anlegen wie bisher; Push-Schutz nur bei `push_guard: true` installieren.
5. `brain.yml` mit `push_guard` schreiben.
6. Ausgabe: `Wissens-Ordner angelegt: <pfad> (mode: private, push guard: on|off)`. Bei `off` zusätzlich: „Hinweis: brain prüft nicht, wer das Remote lesen kann – für privates Wissen kein öffentliches Repository verwenden.“

`--allow-push` ohne `--private` → Fehler „--allow-push nur mit --private“. `--allow-push` mit `--update` → Fehler wie heute bei `--private`.

Die Frage kommt nach der Pfad-Frage (`Wissens-Ordner [knowledge]:`), damit alle Eingaben vor dem ersten Schreibzugriff abgefragt sind.

## 4. `brain init --update`

**`brain.yml` neu schreiben:** `brain init --update` liest `brain.yml` (mit den Prüfungen aus Abschnitt 2) und schreibt sie im aktuellen Format neu – dieselbe Funktion wie `brain init` (`formatBrainConfig`). Damit kommen künftige Formatänderungen (Kommentare, neue Schlüssel mit Voreinstellung) bei jedem `--update` in bestehende Dateien:

- Werte bleiben erhalten; fehlende Schlüssel werden mit ihrer Voreinstellung ausdrücklich geschrieben (heute: `push_guard: true` bei `mode: private` ohne den Schlüssel).
- Eigene Kommentare und Formatierung in `brain.yml` gehen dabei verloren; die dritte Kopfkommentarzeile sagt das ausdrücklich.
- Ist `brain.yml` ungültig, bricht `--update` mit der Fehlermeldung ab, bevor etwas geschrieben wird.
- Ändert sich der Inhalt, erscheint `brain.yml` in der Liste „Aktualisiert (bitte prüfen und committen)“; sonst nicht.

Danach richtet `--update` den Push-Schutz nach `brain.yml` aus:

- `push_guard: true` → Push-Schutz installieren (wie bisher).
- `push_guard: false` → einen vorhandenen `pre-push`-Hook mit der Markierungszeile `# brain: this repository must never be pushed.` löschen. Ein fremder `pre-push`-Hook (ohne Markierungszeile) bleibt unangetastet. `core.hooksPath` bleibt, wie es ist (zeigt auf das Standard-Hook-Verzeichnis, schadet nicht).
- Ausgabe nennt die Änderung, z. B. `Push-Schutz entfernt` / `Push-Schutz installiert`.

Umstellen eines bestehenden Wissens-Ordners: `push_guard` in `brain.yml` ändern, `brain init --update`, `brain.yml` committen. Ein eigener Befehl ist nicht nötig.

## 5. `brain check`

- Push-Schutz-Prüfung (Remote, `core.hooksPath`, Hook) nur bei `mode: private` **und** `push_guard: true`.
- Bei `push_guard: false` und noch installiertem brain-Hook: Hinweis „Push-Schutz noch installiert, obwohl push_guard: false – brain init --update ausführen“.

## 6. Plugin und Kontextzeile

- Kontextzeile beim Sitzungsstart bei `mode: private`: `Brain: ./ (mode: private, push guard: on, search: hybrid)` bzw. `push guard: off`. Bei `mode: project` unverändert.
- Skill `brain` (`plugin/skills/brain/SKILL.md`): Regel ändern zu „Nie committen und nie pushen – das macht der Nutzer. Bei `push guard: on` zusätzlich nie ein Git-Remote anlegen.“
- `/brain:ingest`: unverändert („Nie pushen“).

## 7. Dokumentation

- `brain help`: `init [--private [--allow-push]] [<path>]`, Beschreibung des Flags und der Frage; Kopftext „private: own repository, optionally local only“.
- README: Tabelle „Two modes“ (PR #10) anpassen – Spalte Private: „only you, unless you add a remote; by default no remote and protected against pushing“, Backup: „your responsibility – e.g. a remote of your own (`--allow-push`)“. Hinweis, dass brain die Sichtbarkeit eines Remotes nicht prüft. Abschnitt zum Umstellen (`brain.yml` + `brain init --update`).

## 8. Tests

- **`config`:** neue `brain.yml` enthält die Kommentarzeile zu `brain init --update`; `push_guard` fehlt bei `private` → `true`; `false` wird gelesen; bei `project` → Fehler; ungültiger Wert → Fehler.
- **`init`:** `--private` ohne Terminal → `push_guard: true`, Hook installiert; `--private --allow-push` → `push_guard: false`, kein Hook, Remote erlaubt; Remote mit `push_guard: true` → Fehler ohne Schreibzugriff; Frage per injizierter Antwortfunktion (wie `askPath`): Ja/Leer/Nein/ungültig-dann-Nein; `--allow-push` ohne `--private` → Fehler.
- **`init --update`:** alte `brain.yml` (ohne Kommentarzeile, `private` ohne `push_guard`) wird mit Kommentar und `push_guard: true` neu geschrieben und als geändert gemeldet; aktuelle `brain.yml` → nicht gemeldet; ungültige `brain.yml` → Fehler, nichts geschrieben; `true` → Hook installiert; `false` → brain-Hook entfernt; fremder Hook bleibt.
- **`check`:** keine Push-Fehler bei `push_guard: false` mit Remote; Hinweis bei `false` und installiertem Hook; Fehler wie bisher bei `true`.
- **`session`:** Kontextzeile mit `push guard: on|off` bei `private`, unverändert bei `project`.
- **End-to-end:** `push_guard: false`, lokales Bare-Repo als Remote, `git push` gelingt.

## 9. Version

Neue Minor-Version (neues Flag, neuer Schlüssel in `brain.yml`, abwärtskompatibel): `scripts/package.json` und `plugin/.claude-plugin/plugin.json` gemeinsam anheben.

Ältere CLI-Versionen lehnen eine `brain.yml` mit `push_guard` als „unbekannter Schlüssel“ ab. Das betrifft nur private Wissens-Ordner, die mit der neuen Version angelegt oder umgestellt wurden; Projekt-Wissens-Ordner bekommen den Schlüssel nie. Die bestehende Versionswarnung beim Sitzungsstart reicht als Hinweis.
