# Second Brain – Wissenskern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Wissenskern des Second Brain bauen: Ordnerstruktur, deterministisches Node/TypeScript-CLI `brain` (archive, remember, link, log, index, check, recategorize), Claude-Code-Regeln und -Commands (`/ingest`, `/ask`) sowie qmd-Suche mit getrennten Collections für Wiki und Archiv.

**Architecture:** Markdown-Dateien im Repo `/mnt/f/second-brain` sind die einzige Wahrheit. Das CLI `brain` (TypeScript, direkt von Node 24 per Type-Stripping ausgeführt, ohne Modellaufruf) erledigt alle mechanischen Schritte und erzeugt die abgeleiteten Dateien `INDEX.md` und `graph.json`. Claude Code liefert die Intelligenz (Einordnen, Verdichten, Widersprüche) über `CLAUDE.md`-Regeln und Slash-Commands; qmd liefert die semantische Suche.

**Tech Stack:** Node.js 24 (Type-Stripping), TypeScript (nur `tsc --noEmit`), `yaml` (einzige Laufzeitabhängigkeit), `node:test`, Git, qmd (`@tobilu/qmd`), Claude Code.

**Spec:** `docs/superpowers/specs/2026-10-03-second-brain-design.md` (Revision 4, freigegeben). Executor liest Spec und Plan.

## Global Constraints

- Repo-Wurzel: `/mnt/f/second-brain` (= `F:\second-brain`); niemals `git push` – Commits sind erlaubt.
- Node ≥ 22 für qmd; Skripte nutzen Node 24 (`v24.2.0` installiert) mit Type-Stripping: keine `enum`, keine Parameter-Properties, keine Namespaces; Importe mit `.ts`-Endung; Typ-Importe mit `type`.
- Laufzeitabhängigkeit nur `yaml`; Dev: `typescript`, `@types/node`.
- **Sprachregel:** Alles, was eine Maschine liest, ist Englisch (Code, CLI-Befehle/Flags, Datei-/Ordnernamen, Frontmatter-Felder, Log-Operationen, Marker `## Related`, `## Sources`, `[!warning] Conflict C-…`, `[!question] Unclear Q-…`, `Affects:`). Alles, was der Nutzer liest (Titel, Summary, Fließtext, Callout-Inhalt, CLI-Meldungen, Antworten), ist Deutsch.
- Markdown ist die einzige Wahrheit. `INDEX.md`, `graph.json` nur von `brain index`; `LOG.md` nur über `brain`. Alle drei nicht in Git.
- `archive/`: Inhalt byte-identisch, nie ändern/löschen; einzige erlaubte Änderung: Verschieben per `brain recategorize`.
- Kategorie-Slug: `^[a-z0-9][a-z0-9-]*$`; reservierte Pseudo-Kategorie `_uncategorized` (Anzeigename „Ohne Kategorie“), nicht in `categories.yml`.
- Archivpfad: `archive/<kategorie>/YYYY/MM/YYYY-MM-DD-HHMM-<slug>.md`; Eintragspfad: `wiki/<kategorie>/<slug(title)>.md`.
- Links: `[[pfad-ab-wurzel-ohne-.md]]`, optional `#Abschnitt`, `|Alias`.
- Pflicht-Frontmatter: `title`, `category`, `summary` (einzeilig), `sources` (≥ 1, existierende Archivpfade mit `.md`), `created`, `updated` (`YYYY-MM-DD`); `tags` optional.
- Referenz-Map-Schwelle: `LARGE_DOC_LINES = 150`.
- LOG-Format: `YYYY-MM-DD HH:MM | <op> | <ziel> | <beschreibung>`; Ops: `archive, create, update, link, unlink, conflict, resolve, recategorize, category, ingest`.
- qmd-Embedding: `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf`; qmd-Index bleibt in `~/.cache/qmd/` (nicht auf `/mnt/f`).

## Review Focus

1. **Windows-Notizen mit CRLF-Zeilenenden** – Originale müssen byte-identisch archiviert werden, und Git darf danach keine „Phantom-Änderung“ melden (sonst schlägt Check ④ fälschlich an). Abgesichert durch `.gitattributes` (`archive/** -text`); Tests in Task 6 (Archivieren CRLF) und Task 10 (Git-Check mit CRLF-Original).
2. **Ordner als Obsidian-Vault geöffnet** – Obsidian legt `.obsidian/` an und schreibt laufend `workspace.json`; per Autovervollständigung eingefügte Links sind standardmäßig Kurzlinks (`[[laufen]]`). Erwartet: `/ingest`-Vorprüfung bleibt grün (`.obsidian/` ist git-ignoriert) und neue Links sind vollständige Pfade (Obsidian-Einstellung `newLinkFormat: absolute`). Umsetzung in Task 2 (`.gitignore`) und Task 12 (`.obsidian/app.json`), Prüfung in Task 14 Step 6. (Leere Slugs wie `???.txt` → `note` sind zusätzlich in Task 2/6 getestet.)
3. **`[[…]]` in Code-Blöcken oder Inline-Code** (z. B. Doku-Snippets in Einträgen) – erwartet: kein Link, kein „kaputter Link“-Fehler, keine Graph-Kante. Tests in Task 4 (extractLinks) und Task 10 (check).
4. **Pfade außerhalb des erlaubten Bereichs** (`inbox/../categories.yml`, Quelle `../x`, relative Pfade bei Aufruf über `npm --prefix scripts`) – erwartet: klare Fehlermeldung, keine Datei wird verschoben/geschrieben; relative Pfade gelten relativ zum Aufrufverzeichnis (`INIT_CWD`). Tests in Task 6 und Task 9.
5. **Fehlerhafte Konflikt-Callouts** (ID fehlt, falscher Typ `[!question] Conflict …`, `Affects:`-Zeile fehlt) – erwartet: `brain check` meldet einen Fehler, statt den offenen Punkt stillschweigend zu ignorieren. Tests in Task 4 (parseOpenPoints) und Task 10 (check).

---

## Dateistruktur

```
/mnt/f/second-brain/
├── .gitignore, .gitattributes, categories.yml, CLAUDE.md
├── inbox/.gitkeep
├── wiki/CLAUDE.md
├── .claude/commands/ingest.md, ask.md
├── docs/superpowers/notes/2026-10-03-qmd-spike.md
└── scripts/
    ├── package.json, tsconfig.json
    ├── src/
    │   ├── cli.ts          Argument-Parsing, Dispatch, Exit-Codes
    │   ├── paths.ts        Wurzel, ID-Normalisierung, Pfad-Sicherheit
    │   ├── time.ts         Datums-/Zeitformate
    │   ├── slug.ts         slugify
    │   ├── categories.ts   categories.yml lesen/schreiben, UNCATEGORIZED
    │   ├── log.ts          LOG.md-Zeilen
    │   ├── markdown.ts     Frontmatter, Links, Überschriften, Related-Abschnitt, Callouts
    │   ├── scan.ts         loadBrain: Einträge, Quellen, Ordner
    │   ├── archive.ts      brain archive
    │   ├── link.ts         brain link
    │   ├── indexer.ts      INDEX.md + graph.json
    │   ├── remember.ts     brain remember
    │   ├── git.ts          Archiv-Integrität per git status
    │   ├── check.ts        brain check
    │   └── recategorize.ts brain recategorize
    └── test/
        ├── helpers.ts
        └── <modul>.test.ts
```

---

### Task 1: Spike – qmd mit GPU in WSL

Wegwerf-Untersuchung, kein Produktcode. Ergebnis ist eine Notiz.

**Files:**
- Create: `docs/superpowers/notes/2026-10-03-qmd-spike.md`

**Interfaces:**
- Consumes: nichts
- Produces: dokumentierte Antworten auf: GPU-Backend (CUDA/Vulkan/CPU), Ort der qmd-Konfiguration (`index.yml`), funktionierende Einstellung für das Embedding-Modell, Antwortzeiten `search`/`query`. Task 13 nutzt diese Werte.

- [ ] **Step 1: qmd global installieren**

```bash
npm install -g @tobilu/qmd
qmd --version
```
Expected: Versionsnummer. Schlägt `npm install -g` mit EACCES fehl: den Nutzer bitten, `! sudo npm install -g @tobilu/qmd` auszuführen, oder ein npm-Prefix im Home setzen (`npm config set prefix ~/.npm-global`, `~/.npm-global/bin` in `PATH`).

- [ ] **Step 2: Test-Collection anlegen**

```bash
mkdir -p ~/qmd-spike
printf '# Kubernetes Ingress\n\nDer Ingress-Controller terminiert TLS und leitet Anfragen an Services weiter.\n' > ~/qmd-spike/ingress.md
printf '# Laufen\n\nFür 10-km-Läufe trainiere ich in Pulszone 2 und mache einmal pro Woche Intervalle.\n' > ~/qmd-spike/laufen.md
printf '# Urlaub Norwegen\n\nIm Juni sind die Fjorde ideal, Fähren früh buchen.\n' > ~/qmd-spike/urlaub.md
qmd collection add ~/qmd-spike --name spike
```

- [ ] **Step 3: Qwen3-Embedding setzen und embedden, GPU beobachten**

```bash
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"
qmd embed 2>&1 | tee ~/qmd-spike/embed.log
```
Parallel in einem zweiten Terminal (vom Nutzer per `!` oder hier im Hintergrund): `nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 1`. Im Log nach `CUDA`, `cuda`, `Vulkan`, `CPU` suchen: `grep -iE "cuda|vulkan|cpu|gpu" ~/qmd-spike/embed.log`.

- [ ] **Step 4: Fallbacks, falls CUDA nicht greift**

Nur wenn Step 3 keine GPU-Nutzung zeigt oder abbricht:
```bash
QMD_LLAMA_GPU=vulkan qmd embed -f 2>&1 | tail -20
# wenn auch das scheitert:
QMD_FORCE_CPU=1 qmd embed -f 2>&1 | tail -20
```

- [ ] **Step 5: Antwortzeiten messen**

```bash
time qmd search "Ingress TLS" -c spike
time qmd query "wann sollte ich nach Norwegen fahren" -c spike
time qmd query "wie trainiere ich für einen Lauf" -c spike
```
Expected: `search` < 1 s; `query` liefert die passende Datei als Top-Treffer (Deutsch funktioniert).

- [ ] **Step 6: Konfigurationsort ermitteln**

```bash
qmd status
find ~/.config ~/.cache ~/.local -path '*qmd*' -name '*.yml' 2>/dev/null
```
Prüfen, ob `models.embed` dauerhaft in `index.yml` gesetzt werden kann (Datei ansehen, Eintrag `models: embed: "hf:Qwen/…"` ergänzen, `unset QMD_EMBED_MODEL`, `qmd embed` erneut → darf **nicht** neu embedden, wenn das Modell gleich bleibt).

- [ ] **Step 7: Ergebnis dokumentieren und aufräumen**

`docs/superpowers/notes/2026-10-03-qmd-spike.md` mit genau diesen Abschnitten füllen (echte Messwerte eintragen):
```markdown
# qmd-Spike (2026-10-03)

## Ergebnis
- GPU-Backend: <CUDA | Vulkan | CPU> (Begründung/Log-Auszug)
- Benötigte Umgebungsvariablen: <keine | QMD_LLAMA_GPU=… | QMD_FORCE_CPU=1>
- qmd-Version: <…>

## Konfiguration
- Konfigurationsdatei: <Pfad>
- Embedding-Modell dauerhaft gesetzt über: <index.yml models.embed | QMD_EMBED_MODEL in ~/.zshrc>

## Antwortzeiten
| Befehl | Zeit |
|---|---|
| qmd search "Ingress TLS" | … |
| qmd query "wann … Norwegen" | … |

## Qualität
- Deutsche Anfragen: <Top-Treffer korrekt ja/nein>
```
Danach: `qmd collection remove spike && rm -rf ~/qmd-spike`.

- [ ] **Step 8: Zeitzone prüfen**

Archivnamen und Log-Zeilen nutzen die Ortszeit. WSL steht oft auf UTC.
```bash
date
cat /etc/timezone 2>/dev/null; readlink /etc/localtime
```
Expected: Europe/Berlin. Sonst den Nutzer bitten: `! sudo ln -sf /usr/share/zoneinfo/Europe/Berlin /etc/localtime && echo Europe/Berlin | sudo tee /etc/timezone` und das Ergebnis in der Spike-Notiz vermerken.

- [ ] **Step 9: Commit**

```bash
cd /mnt/f/second-brain
git add docs/superpowers/notes/2026-10-03-qmd-spike.md docs/superpowers/specs/2026-10-03-second-brain-design.md docs/superpowers/plans/2026-10-03-second-brain-core.md
git commit -m "docs: record qmd GPU spike results"
```

---

### Task 2: Repo-Gerüst, Scripts-Paket, Basis-Helfer (time, slug, paths)

**Files:**
- Create: `.gitignore`, `.gitattributes`, `categories.yml`, `inbox/.gitkeep`
- Create: `scripts/package.json`, `scripts/tsconfig.json`
- Create: `scripts/src/time.ts`, `scripts/src/slug.ts`, `scripts/src/paths.ts`
- Create: `scripts/test/helpers.ts`, `scripts/test/basics.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `time.ts`: `formatDate(d: Date): string` (`YYYY-MM-DD`, Ortszeit), `formatStamp(d: Date): string` (`YYYY-MM-DD-HHMM`), `formatLogTime(d: Date): string` (`YYYY-MM-DD HH:MM`), `formatIsoUtc(d: Date): string` (`2026-10-02T15:30:00Z`, ohne Millisekunden)
  - `slug.ts`: `slugify(input: string, fallback?: string): string` (Fallback `'note'`)
  - `paths.ts`: `brainRoot(): string`, `toPosix(p: string): string`, `normalizeId(input: string): string`, `hasParentSegment(id: string): boolean`, `relativeInside(root: string, absolute: string): string | null`
  - `test/helpers.ts`: `NOW`, `FIXED_MTIME`, `CATEGORIES`, `LAUF`, `GARMIN`, `makeBrain`, `writeFile`, `read`, `entry`, `validBrain`, `git`, `initGit`, `setMtimes`, `runCli(root, args, input = '', cwd = root)`

- [ ] **Step 1: Repo-Dateien anlegen**

`.gitignore`:
```
scripts/node_modules/
.obsidian/
INDEX.md
graph.json
LOG.md
inbox/*
!inbox/.gitkeep
```

`.gitattributes`:
```
* text=auto eol=lf
archive/** -text
```

`categories.yml`:
```yaml
categories: []
```

```bash
cd /mnt/f/second-brain && mkdir -p inbox scripts/src scripts/test && touch inbox/.gitkeep
```

- [ ] **Step 2: `scripts/package.json` und `scripts/tsconfig.json` anlegen**

`scripts/package.json`:
```json
{
  "name": "second-brain-scripts",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "bin": {
    "brain": "src/cli.ts"
  },
  "scripts": {
    "brain": "node --disable-warning=ExperimentalWarning src/cli.ts",
    "archive": "node --disable-warning=ExperimentalWarning src/cli.ts archive",
    "remember": "node --disable-warning=ExperimentalWarning src/cli.ts remember",
    "link": "node --disable-warning=ExperimentalWarning src/cli.ts link",
    "log": "node --disable-warning=ExperimentalWarning src/cli.ts log",
    "index": "node --disable-warning=ExperimentalWarning src/cli.ts index",
    "check": "node --disable-warning=ExperimentalWarning src/cli.ts check",
    "recategorize": "node --disable-warning=ExperimentalWarning src/cli.ts recategorize",
    "test": "node --disable-warning=ExperimentalWarning --test \"test/**/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  }
}
```

`scripts/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

```bash
cd /mnt/f/second-brain/scripts
npm install yaml
npm install -D typescript @types/node@24
```
Expected: `package-lock.json` und `node_modules/` entstehen; `npx tsc --version` ≥ 5.8 (wegen `erasableSyntaxOnly`).

- [ ] **Step 3: Test-Helfer schreiben**

`scripts/test/helpers.ts`:
```ts
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const NOW = new Date(2026, 9, 3, 15, 30);
export const FIXED_MTIME = new Date('2026-10-02T15:30:00Z');

export const CATEGORIES = [
    'categories:',
    '  - slug: gesundheit',
    '    name: Gesundheit',
    '    description: Arztbefunde, Training.',
    '  - slug: technik',
    '    name: Technik',
    '    description: Software und Infrastruktur.',
    '',
].join('\n');

export const LAUF = 'archive/gesundheit/2026/10/2026-10-02-1530-lauf';
export const GARMIN = 'archive/technik/2026/10/2026-10-02-1600-garmin';

export function writeFile(root: string, rel: string, content: string): void {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
}

export function makeBrain(files: Record<string, string> = {}): string {
    const root = mkdtempSync(join(tmpdir(), 'brain-'));
    for (const [rel, content] of Object.entries(files)) {
        writeFile(root, rel, content);
    }
    return root;
}

export function read(root: string, rel: string): string {
    return readFileSync(join(root, rel), 'utf8');
}

export interface EntryOptions {
    title: string;
    category: string;
    summary?: string;
    sources?: string[];
    body?: string;
    related?: string[];
}

export function entry(options: EntryOptions): string {
    const sources = options.sources ?? [];
    const lines = [
        '---',
        `title: ${options.title}`,
        `category: ${options.category}`,
        `summary: ${options.summary ?? `${options.title} kurz erklärt.`}`,
        `sources: [${sources.map((s) => `${s}.md`).join(', ')}]`,
        'created: 2026-10-01',
        'updated: 2026-10-01',
        '---',
        `# ${options.title}`,
        '',
    ];
    if (options.body !== undefined) {
        lines.push(options.body, '');
    }
    if (options.related !== undefined && options.related.length > 0) {
        lines.push('## Related', ...options.related.map((r) => `- [[${r}]]`), '');
    }
    lines.push('## Sources', ...sources.map((s) => `- [[${s}]]`), '');
    return lines.join('\n');
}

export function validBrain(extra: Record<string, string> = {}): string {
    return makeBrain({
        '.gitattributes': '* text=auto eol=lf\narchive/** -text\n',
        'categories.yml': CATEGORIES,
        [`${LAUF}.md`]: 'Laufnotiz\r\nzweite Zeile\r\n',
        [`${GARMIN}.md`]: 'Garmin-Notiz\n',
        'wiki/CLAUDE.md': '# Regeln\n\n[[kaputt]]\n',
        'wiki/gesundheit/laufen.md': entry({
            title: 'Laufen',
            category: 'gesundheit',
            summary: 'Trainingspläne für 10-km-Läufe.',
            sources: [LAUF],
            body: 'Siehe auch [[wiki/technik/garmin]].',
            related: ['wiki/gesundheit/ernaehrung'],
        }),
        'wiki/gesundheit/ernaehrung.md': entry({
            title: 'Ernährung',
            category: 'gesundheit',
            summary: 'Proteinbedarf beim Ausdauersport.',
            sources: [LAUF],
            related: ['wiki/gesundheit/laufen'],
        }),
        'wiki/technik/garmin.md': entry({
            title: 'Garmin',
            category: 'technik',
            summary: 'Uhr-Einstellungen.',
            sources: [GARMIN],
        }),
        ...extra,
    });
}

export function git(root: string, ...args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

export function initGit(root: string): void {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'core.autocrlf', 'false');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
}

export function setMtimes(root: string, rels: string[]): void {
    for (const rel of rels) {
        utimesSync(join(root, rel), FIXED_MTIME, FIXED_MTIME);
    }
}

export interface CliResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

export function runCli(root: string, args: string[], input = '', cwd = root): CliResult {
    const cli = join(import.meta.dirname, '..', 'src', 'cli.ts');
    const result = spawnSync(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', cli, ...args],
        { cwd, env: { ...process.env, BRAIN_ROOT: root, INIT_CWD: cwd }, input, encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
```

- [ ] **Step 4: Fehlschlagende Tests für time, slug, paths schreiben**

`scripts/test/basics.test.ts`:
```ts
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { hasParentSegment, normalizeId, relativeInside } from '../src/paths.ts';
import { slugify } from '../src/slug.ts';
import { formatDate, formatIsoUtc, formatLogTime, formatStamp } from '../src/time.ts';
import { NOW } from './helpers.ts';

test('time formats use local time', () => {
    assert.equal(formatDate(NOW), '2026-10-03');
    assert.equal(formatStamp(NOW), '2026-10-03-1530');
    assert.equal(formatLogTime(NOW), '2026-10-03 15:30');
});

test('formatIsoUtc drops milliseconds', () => {
    assert.equal(formatIsoUtc(new Date('2026-10-02T15:30:00.123Z')), '2026-10-02T15:30:00Z');
});

const slugCases: Array<[string, string]> = [
    ['Kubernetes Ingress', 'kubernetes-ingress'],
    ['Größe & Maß', 'groesse-mass'],
    ['ÄRGER über Öl', 'aerger-ueber-oel'],
    ['  --Hallo   Welt--  ', 'hallo-welt'],
    ['Café crème', 'cafe-creme'],
    ['2026 Plan v2', '2026-plan-v2'],
    ['???', 'note'],
    ['🎉🎉', 'note'],
];
for (const [input, expected] of slugCases) {
    test(`slugify(${JSON.stringify(input)}) === ${expected}`, () => {
        assert.equal(slugify(input), expected);
    });
}

const idCases: Array<[string, string]> = [
    ['wiki/a/b.md', 'wiki/a/b'],
    ['./wiki/a/b', 'wiki/a/b'],
    ['wiki\\a\\b.MD', 'wiki/a/b'],
    ['archive/x/2026/10/n.md', 'archive/x/2026/10/n'],
];
for (const [input, expected] of idCases) {
    test(`normalizeId(${JSON.stringify(input)}) === ${expected}`, () => {
        assert.equal(normalizeId(input), expected);
    });
}

test('hasParentSegment detects ..', () => {
    assert.equal(hasParentSegment('archive/../x'), true);
    assert.equal(hasParentSegment('archive/a..b/x'), false);
});

test('relativeInside', () => {
    assert.equal(relativeInside('/r', join('/r', 'inbox', 'a.md')), 'inbox/a.md');
    assert.equal(relativeInside('/r', '/r'), null);
    assert.equal(relativeInside('/r', '/other/a.md'), null);
    assert.equal(relativeInside('/r', join('/r', 'inbox', '..', '..', 'x')), null);
});
```

- [ ] **Step 5: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/paths.ts'`.

- [ ] **Step 6: Implementierung schreiben**

`scripts/src/time.ts`:
```ts
function pad(value: number): string {
    return String(value).padStart(2, '0');
}

export function formatDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatStamp(date: Date): string {
    return `${formatDate(date)}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function formatLogTime(date: Date): string {
    return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatIsoUtc(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
```

`scripts/src/slug.ts`:
```ts
const UMLAUTS: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

/** Builds a file-name slug; returns the fallback when nothing usable is left. */
export function slugify(input: string, fallback = 'note'): string {
    const slug = input
        .toLowerCase()
        .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug === '' ? fallback : slug;
}
```

`scripts/src/paths.ts`:
```ts
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function brainRoot(): string {
    return process.env.BRAIN_ROOT ?? resolve(import.meta.dirname, '..', '..');
}

export function toPosix(path: string): string {
    return path.split(sep).join('/');
}

/** Normalizes an entry or source id: posix separators, no leading "./", no ".md" suffix. */
export function normalizeId(input: string): string {
    return input.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.md$/i, '');
}

export function hasParentSegment(id: string): boolean {
    return id.split('/').includes('..');
}

/** Returns the root-relative posix path of an absolute path, or null if it is not inside root. */
export function relativeInside(root: string, absolute: string): string | null {
    const rel = relative(root, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        return null;
    }
    return toPosix(rel);
}
```

- [ ] **Step 7: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: alle Tests PASS, `tsc` ohne Ausgabe.

- [ ] **Step 8: Commit**

```bash
cd /mnt/f/second-brain
git add .gitignore .gitattributes categories.yml inbox/.gitkeep scripts/package.json scripts/package-lock.json scripts/tsconfig.json scripts/src scripts/test
git commit -m "feat: scaffold brain workspace and scripts package"
```

---

### Task 3: Kategorien und Log

**Files:**
- Create: `scripts/src/categories.ts`, `scripts/src/log.ts`
- Test: `scripts/test/categories.test.ts`, `scripts/test/log.test.ts`

**Interfaces:**
- Consumes: `formatLogTime` (time.ts)
- Produces:
  - `categories.ts`: `interface Category { slug: string; name: string; description: string }`, `UNCATEGORIZED = '_uncategorized'`, `UNCATEGORIZED_NAME = 'Ohne Kategorie'`, `CATEGORY_SLUG_PATTERN: RegExp`, `loadCategories(root: string): Category[]` (wirft bei ungültiger Datei), `saveCategories(root: string, categories: Category[]): void`, `isKnownCategory(categories: Category[], slug: string): boolean`
  - `log.ts`: `LOG_OPS`, `type LogOp`, `isLogOp(value: string): value is LogOp`, `formatLogLine(now: Date, op: LogOp, target: string, description?: string): string`, `appendLog(root: string, now: Date, op: LogOp, target: string, description?: string): void`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/categories.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isKnownCategory, loadCategories, saveCategories, UNCATEGORIZED } from '../src/categories.ts';
import { CATEGORIES, makeBrain } from './helpers.ts';

test('loadCategories returns an empty list without file or for "categories: []"', () => {
    assert.deepEqual(loadCategories(makeBrain()), []);
    assert.deepEqual(loadCategories(makeBrain({ 'categories.yml': 'categories: []\n' })), []);
});

test('loadCategories reads slug, name and description', () => {
    const categories = loadCategories(makeBrain({ 'categories.yml': CATEGORIES }));
    assert.deepEqual(categories[0], { slug: 'gesundheit', name: 'Gesundheit', description: 'Arztbefunde, Training.' });
    assert.equal(categories.length, 2);
});

const invalidFiles: Array<[string, RegExp]> = [
    ['categories: {}\n', /Liste/],
    ['categories:\n  - slug: Gross\n    name: X\n', /slug/],
    ['categories:\n  - slug: _intern\n    name: X\n', /slug/],
    ['categories:\n  - slug: a\n    name: A\n  - slug: a\n    name: B\n', /doppelt/],
    ['categories:\n  - slug: a\n', /name/],
];
for (const [yml, error] of invalidFiles) {
    test(`loadCategories rejects ${JSON.stringify(yml)}`, () => {
        assert.throws(() => loadCategories(makeBrain({ 'categories.yml': yml })), error);
    });
}

test('isKnownCategory accepts registered slugs and _uncategorized only', () => {
    const categories = loadCategories(makeBrain({ 'categories.yml': CATEGORIES }));
    assert.equal(isKnownCategory(categories, 'technik'), true);
    assert.equal(isKnownCategory(categories, UNCATEGORIZED), true);
    assert.equal(isKnownCategory(categories, 'urlaub'), false);
});

test('saveCategories round-trips', () => {
    const root = makeBrain();
    const categories = [{ slug: 'urlaub', name: 'Urlaub', description: 'Reisen.' }];
    saveCategories(root, categories);
    assert.deepEqual(loadCategories(root), categories);
});
```

`scripts/test/log.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendLog, formatLogLine, isLogOp, type LogOp } from '../src/log.ts';
import { makeBrain, NOW, read } from './helpers.ts';

const lines: Array<[LogOp, string, string, string]> = [
    ['create', 'wiki/a/b', 'Neu', '2026-10-03 15:30 | create | wiki/a/b | Neu'],
    ['link', 'wiki/a/b ↔ wiki/a/c', '', '2026-10-03 15:30 | link | wiki/a/b ↔ wiki/a/c |'],
    ['update', 'wiki/a|b', 'Zeile1\nZeile2 | x', '2026-10-03 15:30 | update | wiki/a b | Zeile1 Zeile2 x'],
];
for (const [op, target, description, expected] of lines) {
    test(`formatLogLine ${op} ${JSON.stringify(description)}`, () => {
        assert.equal(formatLogLine(NOW, op, target, description), expected);
    });
}

test('isLogOp knows exactly the spec operations', () => {
    for (const op of ['archive', 'create', 'update', 'link', 'unlink', 'conflict', 'resolve', 'recategorize', 'category', 'ingest']) {
        assert.equal(isLogOp(op), true, op);
    }
    assert.equal(isLogOp('delete'), false);
});

test('appendLog creates LOG.md and appends lines', () => {
    const root = makeBrain();
    appendLog(root, NOW, 'archive', 'archive/x.md', 'aus inbox/x.md');
    appendLog(root, NOW, 'ingest', '1 Notizen');
    assert.equal(
        read(root, 'LOG.md'),
        '2026-10-03 15:30 | archive | archive/x.md | aus inbox/x.md\n2026-10-03 15:30 | ingest | 1 Notizen |\n',
    );
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/categories.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/categories.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

export interface Category {
    slug: string;
    name: string;
    description: string;
}

export const UNCATEGORIZED = '_uncategorized';
export const UNCATEGORIZED_NAME = 'Ohne Kategorie';
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const FILE = 'categories.yml';

export function loadCategories(root: string): Category[] {
    const file = join(root, FILE);
    if (!existsSync(file)) {
        return [];
    }
    const data = parse(readFileSync(file, 'utf8')) as { categories?: unknown } | null;
    const list = data?.categories ?? [];
    if (!Array.isArray(list)) {
        throw new Error(`${FILE}: "categories" muss eine Liste sein`);
    }
    const seen = new Set<string>();
    return list.map((item: unknown, index: number): Category => {
        const raw = (item ?? {}) as Record<string, unknown>;
        const slug = raw.slug;
        if (typeof slug !== 'string' || !CATEGORY_SLUG_PATTERN.test(slug)) {
            throw new Error(`${FILE}: Eintrag ${index + 1} hat keinen gültigen slug`);
        }
        if (seen.has(slug)) {
            throw new Error(`${FILE}: slug "${slug}" ist doppelt`);
        }
        seen.add(slug);
        if (typeof raw.name !== 'string' || raw.name.trim() === '') {
            throw new Error(`${FILE}: Kategorie "${slug}" hat keinen name`);
        }
        const description = typeof raw.description === 'string' ? raw.description : '';
        return { slug, name: raw.name, description };
    });
}

export function saveCategories(root: string, categories: Category[]): void {
    writeFileSync(join(root, FILE), stringify({ categories }), 'utf8');
}

export function isKnownCategory(categories: Category[], slug: string): boolean {
    return slug === UNCATEGORIZED || categories.some((category) => category.slug === slug);
}
```

`scripts/src/log.ts`:
```ts
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatLogTime } from './time.ts';

export const LOG_OPS = [
    'archive',
    'create',
    'update',
    'link',
    'unlink',
    'conflict',
    'resolve',
    'recategorize',
    'category',
    'ingest',
] as const;

export type LogOp = (typeof LOG_OPS)[number];

export function isLogOp(value: string): value is LogOp {
    return (LOG_OPS as readonly string[]).includes(value);
}

function clean(field: string): string {
    return field.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatLogLine(now: Date, op: LogOp, target: string, description = ''): string {
    return `${formatLogTime(now)} | ${op} | ${clean(target)} | ${clean(description)}`.trimEnd();
}

export function appendLog(root: string, now: Date, op: LogOp, target: string, description = ''): void {
    appendFileSync(join(root, 'LOG.md'), `${formatLogLine(now, op, target, description)}\n`, 'utf8');
}
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS, keine tsc-Fehler.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/categories.ts scripts/src/log.ts scripts/test/categories.test.ts scripts/test/log.test.ts
git commit -m "feat: add categories and change log modules"
```

---

### Task 4: Markdown-Werkzeuge (Frontmatter, Links, Überschriften, Related, Callouts)

**Files:**
- Create: `scripts/src/markdown.ts`
- Test: `scripts/test/markdown.test.ts`

**Interfaces:**
- Consumes: `normalizeId` (paths.ts)
- Produces (alle in `markdown.ts`):
  - `interface ParsedMarkdown { frontmatter: Record<string, unknown>; frontmatterError: string | null; body: string }`, `splitFrontmatter(text: string): ParsedMarkdown`
  - `stripCode(text: string): string`
  - `interface WikiLink { raw: string; target: string; anchor: string | null; alias: string | null }`, `extractLinks(text: string): WikiLink[]`
  - `replaceLinkTargets(text: string, map: Map<string, string>): string`
  - `interface Heading { level: number; title: string }`, `headings(body: string): Heading[]`
  - `getRelated(text: string): WikiLink[]`, `setRelated(text: string, targets: string[]): string`
  - `interface OpenPoint { kind: 'conflict' | 'unclear'; id: string; affects: string[] }`, `parseOpenPoints(body: string): { points: OpenPoint[]; malformed: string[] }`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/markdown.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    extractLinks,
    getRelated,
    headings,
    parseOpenPoints,
    replaceLinkTargets,
    setRelated,
    splitFrontmatter,
} from '../src/markdown.ts';

test('splitFrontmatter parses YAML and keeps dates as strings', () => {
    const parsed = splitFrontmatter('---\ntitle: A\ncreated: 2026-10-02\n---\n# A\n');
    assert.equal(parsed.frontmatterError, null);
    assert.deepEqual(parsed.frontmatter, { title: 'A', created: '2026-10-02' });
    assert.equal(parsed.body, '# A\n');
});

test('splitFrontmatter reports missing and invalid frontmatter', () => {
    assert.match(splitFrontmatter('# A\n').frontmatterError ?? '', /fehlt/);
    assert.match(splitFrontmatter('---\ntitle: [unclosed\n---\n').frontmatterError ?? '', /ungültig/);
});

const linkCases: Array<[string, Array<[string, string | null, string | null]>]> = [
    ['[[wiki/a/b]]', [['wiki/a/b', null, null]]],
    ['[[wiki/a/b#Ingress]]', [['wiki/a/b', 'Ingress', null]]],
    ['[[wiki/a/b|Alias]]', [['wiki/a/b', null, 'Alias']]],
    ['[[wiki/a/b#Teil 2|Alias]] und [[wiki/c/d]]', [['wiki/a/b', 'Teil 2', 'Alias'], ['wiki/c/d', null, null]]],
    ['Code `[[wiki/x/y]]` ist kein Link', []],
    ['```\n[[wiki/x/y]]\n```\nnach [[wiki/a/b]]', [['wiki/a/b', null, null]]],
    ['~~~md\n[[wiki/x/y]]\n~~~\n', []],
];
for (const [text, expected] of linkCases) {
    test(`extractLinks ${JSON.stringify(text)}`, () => {
        assert.deepEqual(
            extractLinks(text).map((link) => [link.target, link.anchor, link.alias]),
            expected,
        );
    });
}

test('replaceLinkTargets keeps anchor and alias', () => {
    const map = new Map([['wiki/a/b', 'wiki/c/b']]);
    assert.equal(
        replaceLinkTargets('[[wiki/a/b#H|X]] [[wiki/a/bb]] [[wiki/a/b]]', map),
        '[[wiki/c/b#H|X]] [[wiki/a/bb]] [[wiki/c/b]]',
    );
});

test('headings ignores code blocks', () => {
    assert.deepEqual(headings('# A\n## B ##\n```\n## C\n```\n### C# Basics\n'), [
        { level: 1, title: 'A' },
        { level: 2, title: 'B' },
        { level: 3, title: 'C# Basics' },
    ]);
});

const base = '# T\n\nText\n\n## Sources\n- [[archive/x]]\n';

test('setRelated inserts the section before ## Sources, sorted and unique', () => {
    assert.equal(
        setRelated(base, ['wiki/b/z', 'wiki/a/y', 'wiki/b/z']),
        '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n- [[wiki/b/z]]\n\n## Sources\n- [[archive/x]]\n',
    );
});

test('setRelated replaces an existing section and is idempotent', () => {
    const once = setRelated(base, ['wiki/a/y']);
    const twice = setRelated(once, ['wiki/a/y', 'wiki/c/q']);
    assert.equal(twice, '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n- [[wiki/c/q]]\n\n## Sources\n- [[archive/x]]\n');
    assert.equal(setRelated(twice, ['wiki/a/y', 'wiki/c/q']), twice);
});

test('setRelated removes the section when empty', () => {
    assert.equal(setRelated(setRelated(base, ['wiki/a/y']), []), base);
});

test('setRelated appends at the end when there is no ## Sources', () => {
    assert.equal(setRelated('# T\n\nText\n', ['wiki/a/y']), '# T\n\nText\n\n## Related\n- [[wiki/a/y]]\n');
});

test('getRelated reads only the Related section', () => {
    const text = setRelated(`${base}[[wiki/q/q]]\n`, ['wiki/a/y']);
    assert.deepEqual(getRelated(text).map((link) => link.target), ['wiki/a/y']);
});

test('parseOpenPoints reads conflicts and unclear points', () => {
    const body = [
        '# T',
        '',
        '> [!warning] Conflict C-20261003-1',
        '> Affects: [[wiki/a/x]], [[wiki/b/y]]',
        '> Text',
        '',
        '> [!question] Unclear Q-20261003-2',
        '> Affects: [[wiki/a/x]]',
        '',
        '> [!warning] Achtung',
        '> normaler Hinweis-Callout',
    ].join('\n');
    assert.deepEqual(parseOpenPoints(body), {
        points: [
            { kind: 'conflict', id: 'C-20261003-1', affects: ['wiki/a/x', 'wiki/b/y'] },
            { kind: 'unclear', id: 'Q-20261003-2', affects: ['wiki/a/x'] },
        ],
        malformed: [],
    });
});

const malformedCallouts = [
    '> [!warning] Conflict\n> Affects: [[wiki/a/x]]',
    '> [!warning] Conflict C-2026-1\n> Affects: [[wiki/a/x]]',
    '> [!question] Conflict C-20261003-1\n> Affects: [[wiki/a/x]]',
    '> [!warning] Unclear Q-20261003-1\n> Affects: [[wiki/a/x]]',
    '> [!warning] Conflict C-20261003-1\n> Text ohne Affects',
];
for (const callout of malformedCallouts) {
    test(`parseOpenPoints flags malformed ${JSON.stringify(callout)}`, () => {
        const result = parseOpenPoints(`# T\n\n${callout}\n`);
        assert.equal(result.points.length, 0);
        assert.equal(result.malformed.length, 1);
    });
}
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/markdown.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/markdown.ts`:
```ts
import { parse } from 'yaml';
import { normalizeId } from './paths.ts';

export interface ParsedMarkdown {
    frontmatter: Record<string, unknown>;
    frontmatterError: string | null;
    body: string;
}

export interface WikiLink {
    raw: string;
    target: string;
    anchor: string | null;
    alias: string | null;
}

export interface Heading {
    level: number;
    title: string;
}

export interface OpenPoint {
    kind: 'conflict' | 'unclear';
    id: string;
    affects: string[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const LINK = /\[\[([^\[\]|#]+?)(?:#([^\[\]|]+?))?(?:\|([^\[\]]+?))?\]\]/g;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const CALLOUT_HEAD = /^>\s*\[!(warning|question)\]\s*(.*)$/;
const CALLOUT_TITLE = /^(?:Conflict (C-\d{8}-\d+)|Unclear (Q-\d{8}-\d+))$/;
const AFFECTS = /^>\s*Affects:\s*(.*)$/;

export function splitFrontmatter(text: string): ParsedMarkdown {
    const match = FRONTMATTER.exec(text);
    if (match === null) {
        return { frontmatter: {}, frontmatterError: 'Frontmatter fehlt', body: text };
    }
    const body = text.slice(match[0].length);
    try {
        const data: unknown = parse(match[1]);
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
            return { frontmatter: {}, frontmatterError: 'Frontmatter ist kein Objekt', body };
        }
        return { frontmatter: data as Record<string, unknown>, frontmatterError: null, body };
    } catch (error) {
        return { frontmatter: {}, frontmatterError: `Frontmatter ungültig: ${(error as Error).message}`, body };
    }
}

/** Removes fenced code blocks and inline code so that their content is never treated as markup. */
export function stripCode(text: string): string {
    return text
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
        .replace(/`[^`\n]*`/g, '');
}

export function extractLinks(text: string): WikiLink[] {
    const links: WikiLink[] = [];
    for (const match of stripCode(text).matchAll(LINK)) {
        links.push({
            raw: match[0],
            target: match[1].trim(),
            anchor: match[2]?.trim() ?? null,
            alias: match[3]?.trim() ?? null,
        });
    }
    return links;
}

export function replaceLinkTargets(text: string, map: Map<string, string>): string {
    return text.replace(LINK, (raw: string, target: string, anchor?: string, alias?: string) => {
        const next = map.get(target.trim());
        if (next === undefined) {
            return raw;
        }
        return `[[${next}${anchor !== undefined ? `#${anchor}` : ''}${alias !== undefined ? `|${alias}` : ''}]]`;
    });
}

export function headings(body: string): Heading[] {
    const result: Heading[] = [];
    for (const line of stripCode(body).split(/\r?\n/)) {
        const match = HEADING.exec(line);
        if (match !== null) {
            result.push({ level: match[1].length, title: match[2] });
        }
    }
    return result;
}

interface SectionRange {
    start: number;
    end: number;
}

function findSection(lines: string[], title: string): SectionRange | null {
    const start = lines.findIndex((line) => line.trim() === `## ${title}`);
    if (start === -1) {
        return null;
    }
    for (let i = start + 1; i < lines.length; i++) {
        if (/^#{1,2}\s/.test(lines[i])) {
            return { start, end: i };
        }
    }
    return { start, end: lines.length };
}

export function getRelated(text: string): WikiLink[] {
    const lines = text.split(/\r?\n/);
    const range = findSection(lines, 'Related');
    if (range === null) {
        return [];
    }
    return extractLinks(lines.slice(range.start + 1, range.end).join('\n'));
}

/** Rewrites the "## Related" section with the given targets (sorted, unique); removes it when empty. */
export function setRelated(text: string, targets: string[]): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const sorted = [...new Set(targets)].sort();
    const block = sorted.length === 0 ? [] : ['## Related', ...sorted.map((target) => `- [[${target}]]`), ''];
    const range = findSection(lines, 'Related');
    if (range !== null) {
        lines.splice(range.start, range.end - range.start, ...block);
    } else if (block.length > 0) {
        const sources = findSection(lines, 'Sources');
        if (sources !== null) {
            lines.splice(sources.start, 0, ...block);
        } else {
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
                lines.pop();
            }
            lines.push('', ...block);
        }
    }
    return lines.join(eol);
}

export function parseOpenPoints(body: string): { points: OpenPoint[]; malformed: string[] } {
    const lines = body.split(/\r?\n/);
    const points: OpenPoint[] = [];
    const malformed: string[] = [];
    lines.forEach((line, index) => {
        const head = CALLOUT_HEAD.exec(line);
        if (head === null) {
            return;
        }
        const title = head[2].trim();
        if (!/^(Conflict|Unclear)\b/.test(title)) {
            return;
        }
        const valid = CALLOUT_TITLE.exec(title);
        const expectedType = title.startsWith('Conflict') ? 'warning' : 'question';
        if (valid === null || head[1] !== expectedType) {
            malformed.push(`ungültiger Callout „${line.trim()}“ (erwartet: [!warning] Conflict C-YYYYMMDD-N bzw. [!question] Unclear Q-YYYYMMDD-N)`);
            return;
        }
        const affects = AFFECTS.exec(lines[index + 1] ?? '');
        if (affects === null) {
            malformed.push(`„> Affects: …“-Zeile fehlt nach „${line.trim()}“`);
            return;
        }
        points.push({
            kind: valid[1] !== undefined ? 'conflict' : 'unclear',
            id: valid[1] ?? valid[2],
            affects: extractLinks(affects[1]).map((link) => normalizeId(link.target)),
        });
    });
    return { points, malformed };
}
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/markdown.ts scripts/test/markdown.test.ts
git commit -m "feat: add markdown parsing utilities"
```

---

### Task 5: Brain einlesen (scan)

**Files:**
- Create: `scripts/src/scan.ts`
- Test: `scripts/test/scan.test.ts`

**Interfaces:**
- Consumes: `loadCategories`, `Category` (categories.ts); `splitFrontmatter`, `getRelated` (markdown.ts); `normalizeId` (paths.ts)
- Produces:
  - `interface Entry { id: string; path: string; category: string; title: string; summary: string; frontmatter: Record<string, unknown>; frontmatterError: string | null; body: string; text: string; size: number; mtime: Date }`
  - `interface SourceFile { id: string; path: string; category: string; size: number; mtime: Date }`
  - `interface Brain { root: string; categories: Category[]; entries: Entry[]; sources: SourceFile[]; folders: { wiki: string[]; archive: string[] }; strayFiles: string[] }`
  - `loadBrain(root: string): Brain` (Einträge/Quellen nach Pfad sortiert; `wiki/CLAUDE.md` ignoriert)
  - `sourceIds(entry: Entry): string[]`, `relatedIds(entry: Entry): string[]` (normalisiert, sortiert, eindeutig)

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/scan.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBrain, relatedIds, sourceIds } from '../src/scan.ts';
import { GARMIN, LAUF, validBrain } from './helpers.ts';

test('loadBrain reads entries, sources and folders, ignoring wiki/CLAUDE.md', () => {
    const brain = loadBrain(validBrain());
    assert.deepEqual(brain.entries.map((e) => e.id), [
        'wiki/gesundheit/ernaehrung',
        'wiki/gesundheit/laufen',
        'wiki/technik/garmin',
    ]);
    assert.deepEqual(brain.sources.map((s) => [s.id, s.category]), [
        [LAUF, 'gesundheit'],
        [GARMIN, 'technik'],
    ]);
    assert.deepEqual(brain.folders, { wiki: ['gesundheit', 'technik'], archive: ['gesundheit', 'technik'] });
    assert.deepEqual(brain.strayFiles, []);
    const laufen = brain.entries[1];
    assert.equal(laufen.title, 'Laufen');
    assert.equal(laufen.category, 'gesundheit');
    assert.equal(laufen.summary, 'Trainingspläne für 10-km-Läufe.');
    assert.equal(laufen.path, 'wiki/gesundheit/laufen.md');
});

test('loadBrain falls back to the file name as title and lists stray files', () => {
    const brain = loadBrain(validBrain({
        'wiki/technik/ohne-titel.md': '# Kein Frontmatter\n',
        'wiki/lose.md': 'x',
        'wiki/technik/tief/x.md': 'x',
        'archive/lose.md': 'x',
    }));
    assert.equal(brain.entries.find((e) => e.id === 'wiki/technik/ohne-titel')?.title, 'ohne-titel');
    assert.deepEqual(brain.strayFiles, ['archive/lose.md', 'wiki/lose.md', 'wiki/technik/tief/x.md']);
});

test('loadBrain works without wiki/ and archive/', () => {
    const brain = loadBrain(validBrain().concat('/does-not-exist'));
    assert.deepEqual(brain.entries, []);
    assert.deepEqual(brain.sources, []);
});

test('sourceIds and relatedIds are normalized', () => {
    const laufen = loadBrain(validBrain()).entries[1];
    assert.deepEqual(sourceIds(laufen), [LAUF]);
    assert.deepEqual(relatedIds(laufen), ['wiki/gesundheit/ernaehrung']);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/scan.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/scan.ts`:
```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Category, loadCategories } from './categories.ts';
import { getRelated, splitFrontmatter } from './markdown.ts';
import { normalizeId } from './paths.ts';

export interface Entry {
    id: string;
    path: string;
    category: string;
    title: string;
    summary: string;
    frontmatter: Record<string, unknown>;
    frontmatterError: string | null;
    body: string;
    text: string;
    size: number;
    mtime: Date;
}

export interface SourceFile {
    id: string;
    path: string;
    category: string;
    size: number;
    mtime: Date;
}

export interface Brain {
    root: string;
    categories: Category[];
    entries: Entry[];
    sources: SourceFile[];
    folders: { wiki: string[]; archive: string[] };
    strayFiles: string[];
}

function listDirs(dir: string): string[] {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();
}

function walkMarkdown(dir: string, prefix: string): string[] {
    if (!existsSync(dir)) {
        return [];
    }
    const result: string[] = [];
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        const rel = `${prefix}/${dirent.name}`;
        if (dirent.isDirectory()) {
            result.push(...walkMarkdown(join(dir, dirent.name), rel));
        } else if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.md')) {
            result.push(rel);
        }
    }
    return result.sort();
}

function readEntry(root: string, path: string, category: string): Entry {
    const absolute = join(root, path);
    const text = readFileSync(absolute, 'utf8');
    const stat = statSync(absolute);
    const parsed = splitFrontmatter(text);
    const fm = parsed.frontmatter;
    const fileName = path.split('/').pop() ?? path;
    return {
        id: path.slice(0, -3),
        path,
        category,
        title: typeof fm.title === 'string' && fm.title.trim() !== '' ? fm.title.trim() : fileName.slice(0, -3),
        summary: typeof fm.summary === 'string' ? fm.summary.trim() : '',
        frontmatter: fm,
        frontmatterError: parsed.frontmatterError,
        body: parsed.body,
        text,
        size: stat.size,
        mtime: stat.mtime,
    };
}

export function loadBrain(root: string): Brain {
    const entries: Entry[] = [];
    const sources: SourceFile[] = [];
    const strayFiles: string[] = [];
    for (const path of walkMarkdown(join(root, 'wiki'), 'wiki')) {
        if (path === 'wiki/CLAUDE.md') {
            continue;
        }
        const parts = path.split('/');
        if (parts.length !== 3) {
            strayFiles.push(path);
            continue;
        }
        entries.push(readEntry(root, path, parts[1]));
    }
    for (const path of walkMarkdown(join(root, 'archive'), 'archive')) {
        const parts = path.split('/');
        if (parts.length < 3) {
            strayFiles.push(path);
            continue;
        }
        const stat = statSync(join(root, path));
        sources.push({ id: path.slice(0, -3), path, category: parts[1], size: stat.size, mtime: stat.mtime });
    }
    return {
        root,
        categories: loadCategories(root),
        entries,
        sources,
        folders: { wiki: listDirs(join(root, 'wiki')), archive: listDirs(join(root, 'archive')) },
        strayFiles: strayFiles.sort(),
    };
}

export function sourceIds(entry: Entry): string[] {
    const sources = entry.frontmatter.sources;
    if (!Array.isArray(sources)) {
        return [];
    }
    return sources.filter((source): source is string => typeof source === 'string').map(normalizeId);
}

export function relatedIds(entry: Entry): string[] {
    return [...new Set(getRelated(entry.body).map((link) => normalizeId(link.target)))].sort();
}
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/scan.ts scripts/test/scan.test.ts
git commit -m "feat: add brain scanner"
```

---

### Task 6: `brain archive`, `brain log` und CLI-Gerüst

**Files:**
- Create: `scripts/src/archive.ts`, `scripts/src/cli.ts`
- Test: `scripts/test/archive.test.ts`, `scripts/test/cli.test.ts`

**Interfaces:**
- Consumes: `isKnownCategory`, `loadCategories` (categories.ts); `appendLog`, `isLogOp` (log.ts); `relativeInside`, `brainRoot` (paths.ts); `slugify`; `formatStamp`
- Produces:
  - `archiveNote(root: string, absoluteFile: string, category: string, now: Date): string` (gibt Archivpfad relativ zur Wurzel mit `.md` zurück)
  - `cli.ts`: Funktion `run(argv: string[], root: string, now: Date): number` mit `switch (command)`; spätere Tasks fügen dort `case`-Blöcke hinzu. Relative Pfadargumente werden mit `callerPath()` gegen `INIT_CWD ?? cwd` aufgelöst.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/archive.test.ts`:
```ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { archiveNote } from '../src/archive.ts';
import { CATEGORIES, makeBrain, NOW, read } from './helpers.ts';

function brainWithInbox(files: Record<string, string>): string {
    const inbox: Record<string, string> = { 'categories.yml': CATEGORIES };
    for (const [name, content] of Object.entries(files)) {
        inbox[`inbox/${name}`] = content;
    }
    return makeBrain(inbox);
}

test('archiveNote moves a CRLF note byte-identically and logs it', () => {
    const root = brainWithInbox({ 'Ingress TLS.md': 'Zeile 1\r\nZeile 2\r\n' });
    const target = archiveNote(root, join(root, 'inbox', 'Ingress TLS.md'), 'technik', NOW);
    assert.equal(target, 'archive/technik/2026/10/2026-10-03-1530-ingress-tls.md');
    assert.deepEqual(readFileSync(join(root, target)), Buffer.from('Zeile 1\r\nZeile 2\r\n'));
    assert.equal(existsSync(join(root, 'inbox', 'Ingress TLS.md')), false);
    assert.equal(read(root, 'LOG.md'), `2026-10-03 15:30 | archive | ${target} | aus inbox/Ingress TLS.md\n`);
});

const nameCases: Array<[string, string]> = [
    ['notiz.txt', 'archive/gesundheit/2026/10/2026-10-03-1530-notiz.md'],
    ['???.txt', 'archive/gesundheit/2026/10/2026-10-03-1530-note.md'],
    ['Übung.MD', 'archive/gesundheit/2026/10/2026-10-03-1530-uebung.md'],
];
for (const [name, expected] of nameCases) {
    test(`archiveNote names ${name} as ${expected}`, () => {
        const root = brainWithInbox({ [name]: 'x' });
        assert.equal(archiveNote(root, join(root, 'inbox', name), 'gesundheit', NOW), expected);
    });
}

test('archiveNote appends -2, -3 on collisions', () => {
    const root = brainWithInbox({ 'a.md': '1', 'a.txt': '2', 'A!.md': '3' });
    assert.equal(archiveNote(root, join(root, 'inbox', 'a.md'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a.md');
    assert.equal(archiveNote(root, join(root, 'inbox', 'a.txt'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a-2.md');
    assert.equal(archiveNote(root, join(root, 'inbox', 'A!.md'), 'technik', NOW), 'archive/technik/2026/10/2026-10-03-1530-a-3.md');
});

test('archiveNote accepts _uncategorized', () => {
    const root = brainWithInbox({ 'x.md': 'x' });
    assert.equal(archiveNote(root, join(root, 'inbox', 'x.md'), '_uncategorized', NOW), 'archive/_uncategorized/2026/10/2026-10-03-1530-x.md');
});

const rejected: Array<[string, string, string, RegExp]> = [
    ['unknown category', 'inbox/x.md', 'urlaub', /Unbekannte Kategorie/],
    ['file outside inbox', 'categories.yml', 'technik', /nicht direkt in inbox/],
    ['traversal', 'inbox/../categories.yml', 'technik', /nicht direkt in inbox/],
    ['subfolder of inbox', 'inbox/sub/x.md', 'technik', /nicht direkt in inbox/],
    ['missing file', 'inbox/fehlt.md', 'technik', /nicht gefunden/],
    ['unsupported format', 'inbox/scan.pdf', 'technik', /Nicht unterstütztes Format/],
];
for (const [label, file, category, error] of rejected) {
    test(`archiveNote rejects ${label} and moves nothing`, () => {
        const root = brainWithInbox({ 'x.md': 'x', 'scan.pdf': 'pdf', 'sub/x.md': 'x' });
        assert.throws(() => archiveNote(root, join(root, file), category, NOW), error);
        assert.equal(existsSync(join(root, 'archive')), false);
        assert.equal(existsSync(join(root, 'LOG.md')), false);
    });
}
```

`scripts/test/cli.test.ts`:
```ts
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { CATEGORIES, makeBrain, read, runCli } from './helpers.ts';

test('cli archive prints the archive path', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    const result = runCli(root, ['archive', 'inbox/n.md', '--category', 'technik']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^archive\/technik\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-\d{4}-n\.md\n$/);
});

test('cli resolves relative paths against the caller directory (INIT_CWD)', () => {
    const root = makeBrain({ 'categories.yml': CATEGORIES, 'inbox/n.md': 'x' });
    const result = runCli(root, ['archive', 'n.md', '--category', 'technik'], '', join(root, 'inbox'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^archive\/technik\/.*-n\.md\n$/);
});

test('cli log appends a line and rejects unknown operations', () => {
    const root = makeBrain();
    assert.equal(runCli(root, ['log', 'update', 'wiki/a/b', 'Text', 'mit', 'Leerzeichen']).status, 0);
    assert.match(read(root, 'LOG.md'), / \| update \| wiki\/a\/b \| Text mit Leerzeichen\n$/);
    const bad = runCli(root, ['log', 'delete', 'x']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Unbekannte Operation/);
});

test('cli reports usage errors with exit code 1', () => {
    const root = makeBrain();
    for (const args of [[], ['unbekannt'], ['archive'], ['archive', 'inbox/x.md', '--falsch']]) {
        const result = runCli(root, args);
        assert.equal(result.status, 1, args.join(' '));
        assert.match(result.stderr, /^Fehler: /);
    }
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL (`Cannot find module '…/src/archive.ts'`, CLI-Tests mit Exit ≠ 0).

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/archive.ts`:
```ts
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { isKnownCategory, loadCategories } from './categories.ts';
import { appendLog } from './log.ts';
import { relativeInside } from './paths.ts';
import { slugify } from './slug.ts';
import { formatStamp } from './time.ts';

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt']);

/** Moves a note from inbox/ into archive/<category>/YYYY/MM/ without touching its bytes. */
export function archiveNote(root: string, absoluteFile: string, category: string, now: Date): string {
    const rel = relativeInside(root, absoluteFile);
    if (rel === null || !/^inbox\/[^/]+$/.test(rel)) {
        throw new Error(`Datei liegt nicht direkt in inbox/: ${absoluteFile}`);
    }
    if (!existsSync(absoluteFile)) {
        throw new Error(`Datei nicht gefunden: ${rel}`);
    }
    const extension = extname(absoluteFile);
    if (!ALLOWED_EXTENSIONS.has(extension.toLowerCase())) {
        throw new Error(`Nicht unterstütztes Format (nur .md/.txt): ${rel}`);
    }
    if (!isKnownCategory(loadCategories(root), category)) {
        throw new Error(`Unbekannte Kategorie: ${category}`);
    }
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dir = join(root, 'archive', category, year, month);
    mkdirSync(dir, { recursive: true });
    const base = `${formatStamp(now)}-${slugify(basename(absoluteFile, extension))}`;
    let name = `${base}.md`;
    for (let counter = 2; existsSync(join(dir, name)); counter++) {
        name = `${base}-${counter}.md`;
    }
    renameSync(absoluteFile, join(dir, name));
    const target = `archive/${category}/${year}/${month}/${name}`;
    appendLog(root, now, 'archive', target, `aus ${rel}`);
    return target;
}
```

`scripts/src/cli.ts`:
```ts
#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveNote } from './archive.ts';
import { appendLog, isLogOp } from './log.ts';
import { brainRoot } from './paths.ts';

const USAGE = 'Verwendung: brain <archive|remember|link|log|index|check|recategorize> …';

/** Resolves a path argument relative to the directory the user called the command from. */
function callerPath(path: string): string {
    return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function readStdin(): string {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
}

function run(argv: string[], root: string, now: Date): number {
    const [command, ...rest] = argv;
    switch (command) {
        case 'archive': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: { category: { type: 'string' } },
            });
            if (positionals.length !== 1 || values.category === undefined) {
                throw new Error('Verwendung: brain archive <inbox-datei> --category <slug>');
            }
            console.log(archiveNote(root, callerPath(positionals[0]), values.category, now));
            return 0;
        }
        case 'log': {
            const [op, target, ...description] = rest;
            if (op === undefined || target === undefined) {
                throw new Error('Verwendung: brain log <op> <ziel> [<beschreibung>]');
            }
            if (!isLogOp(op)) {
                throw new Error(`Unbekannte Operation: ${op}`);
            }
            appendLog(root, now, op, target, description.join(' '));
            return 0;
        }
        default:
            throw new Error(USAGE);
    }
}

try {
    process.exitCode = run(process.argv.slice(2), brainRoot(), new Date());
} catch (error) {
    console.error(`Fehler: ${(error as Error).message}`);
    process.exitCode = 1;
}
```
Hinweis: `readStdin` wird erst ab Task 9 genutzt; `tsc` meldet das nicht, da `noUnusedLocals` nicht gesetzt ist.

- [ ] **Step 4: CLI ausführbar machen**

```bash
chmod +x /mnt/f/second-brain/scripts/src/cli.ts
```
(Auf `/mnt/f` ohne `metadata`-Mount wirkt `chmod` evtl. nicht; das ist unkritisch, `npm link` in Task 12 setzt den Wrapper.)

- [ ] **Step 5: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/archive.ts scripts/src/cli.ts scripts/test/archive.test.ts scripts/test/cli.test.ts
git commit -m "feat: add brain archive and brain log commands"
```

---

### Task 7: `brain link`

**Files:**
- Create: `scripts/src/link.ts`
- Modify: `scripts/src/cli.ts` (Import + `case 'link'`)
- Test: `scripts/test/link.test.ts`

**Interfaces:**
- Consumes: `getRelated`, `setRelated` (markdown.ts); `normalizeId`, `hasParentSegment` (paths.ts); `appendLog`
- Produces:
  - `toEntryId(root: string, input: string): string` – normalisiert, prüft `wiki/<kategorie>/<eintrag>` und Existenz, wirft sonst
  - `linkEntries(root: string, inputs: string[], remove: boolean, now: Date): number` – Anzahl geänderter Paare

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/link.test.ts`:
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkEntries, toEntryId } from '../src/link.ts';
import { getRelated } from '../src/markdown.ts';
import { NOW, read, runCli, validBrain } from './helpers.ts';

function related(root: string, id: string): string[] {
    return getRelated(read(root, `${id}.md`)).map((link) => link.target);
}

test('linkEntries links all given entries pairwise on both sides', () => {
    const root = validBrain();
    const changed = linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen.md', 'wiki/gesundheit/ernaehrung'], false, NOW);
    assert.equal(changed, 2);
    assert.deepEqual(related(root, 'wiki/technik/garmin'), ['wiki/gesundheit/ernaehrung', 'wiki/gesundheit/laufen']);
    assert.deepEqual(related(root, 'wiki/gesundheit/laufen'), ['wiki/gesundheit/ernaehrung', 'wiki/technik/garmin']);
    assert.deepEqual(related(root, 'wiki/gesundheit/ernaehrung'), ['wiki/gesundheit/laufen', 'wiki/technik/garmin']);
    assert.equal(
        read(root, 'LOG.md'),
        '2026-10-03 15:30 | link | wiki/gesundheit/ernaehrung ↔ wiki/technik/garmin |\n'
        + '2026-10-03 15:30 | link | wiki/gesundheit/laufen ↔ wiki/technik/garmin |\n',
    );
});

test('linkEntries is idempotent and touches only the Related section', () => {
    const root = validBrain();
    linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW);
    const before = read(root, 'wiki/technik/garmin.md');
    assert.equal(linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW), 0);
    assert.equal(read(root, 'wiki/technik/garmin.md'), before);
    assert.ok(before.startsWith('---\ntitle: Garmin\n'));
    assert.ok(before.includes('## Related\n- [[wiki/gesundheit/laufen]]\n\n## Sources\n'));
});

test('linkEntries --remove deletes both sides and drops an empty section', () => {
    const root = validBrain();
    const original = read(root, 'wiki/technik/garmin.md');
    linkEntries(root, ['wiki/technik/garmin', 'wiki/gesundheit/laufen'], false, NOW);
    assert.equal(linkEntries(root, ['wiki/gesundheit/laufen', 'wiki/technik/garmin'], true, NOW), 1);
    assert.equal(read(root, 'wiki/technik/garmin.md'), original);
    assert.deepEqual(related(root, 'wiki/gesundheit/laufen'), ['wiki/gesundheit/ernaehrung']);
    assert.match(read(root, 'LOG.md'), /\| unlink \| wiki\/gesundheit\/laufen ↔ wiki\/technik\/garmin \|\n$/);
});

const invalid: Array<[string[], RegExp]> = [
    [['wiki/technik/garmin'], /Mindestens zwei/],
    [['wiki/technik/garmin', 'wiki/technik/garmin.md'], /Mindestens zwei/],
    [['wiki/technik/garmin', 'wiki/technik/fehlt'], /nicht gefunden/],
    [['wiki/technik/garmin', 'archive/technik/x'], /Kein gültiger Eintrag/],
    [['wiki/technik/garmin', 'wiki/../categories'], /Kein gültiger Eintrag/],
];
for (const [inputs, error] of invalid) {
    test(`linkEntries rejects ${inputs.join(' ')}`, () => {
        assert.throws(() => linkEntries(validBrain(), inputs, false, NOW), error);
    });
}

test('toEntryId normalizes input', () => {
    assert.equal(toEntryId(validBrain(), './wiki/technik/garmin.md'), 'wiki/technik/garmin');
});

test('cli link', () => {
    const root = validBrain();
    const result = runCli(root, ['link', 'wiki/technik/garmin', 'wiki/gesundheit/laufen']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 Beziehung\(en\) gesetzt/);
    assert.equal(runCli(root, ['link', '--remove', 'wiki/technik/garmin', 'wiki/gesundheit/laufen']).status, 0);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/link.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/link.ts`:
```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendLog } from './log.ts';
import { getRelated, setRelated } from './markdown.ts';
import { hasParentSegment, normalizeId } from './paths.ts';

export function toEntryId(root: string, input: string): string {
    const id = normalizeId(input);
    const parts = id.split('/');
    if (parts.length !== 3 || parts[0] !== 'wiki' || hasParentSegment(id)) {
        throw new Error(`Kein gültiger Eintrag (erwartet wiki/<kategorie>/<eintrag>): ${input}`);
    }
    if (!existsSync(join(root, `${id}.md`))) {
        throw new Error(`Eintrag nicht gefunden: ${input}`);
    }
    return id;
}

/** Adds or removes the related relation between all given entries, on every side. */
export function linkEntries(root: string, inputs: string[], remove: boolean, now: Date): number {
    const ids = [...new Set(inputs.map((input) => toEntryId(root, input)))].sort();
    if (ids.length < 2) {
        throw new Error('Mindestens zwei verschiedene Einträge angeben');
    }
    const texts = new Map(ids.map((id) => [id, readFileSync(join(root, `${id}.md`), 'utf8')]));
    const before = new Map(ids.map((id) => [
        id,
        new Set(getRelated(texts.get(id) ?? '').map((link) => normalizeId(link.target))),
    ]));
    const changedPairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i];
            const b = ids[j];
            const linked = (before.get(a)?.has(b) ?? false) && (before.get(b)?.has(a) ?? false);
            const partlyLinked = (before.get(a)?.has(b) ?? false) || (before.get(b)?.has(a) ?? false);
            if (remove ? partlyLinked : !linked) {
                changedPairs.push(`${a} ↔ ${b}`);
            }
        }
    }
    for (const id of ids) {
        const next = new Set(before.get(id));
        for (const other of ids) {
            if (other !== id) {
                if (remove) {
                    next.delete(other);
                } else {
                    next.add(other);
                }
            }
        }
        const text = texts.get(id) ?? '';
        const updated = setRelated(text, [...next]);
        if (updated !== text) {
            writeFileSync(join(root, `${id}.md`), updated, 'utf8');
        }
    }
    for (const pair of changedPairs) {
        appendLog(root, now, remove ? 'unlink' : 'link', pair);
    }
    return changedPairs.length;
}
```

In `scripts/src/cli.ts` ergänzen – Import oben:
```ts
import { linkEntries } from './link.ts';
```
und im `switch` vor `default:`:
```ts
        case 'link': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: { remove: { type: 'boolean', default: false } },
            });
            const remove = values.remove === true;
            const changed = linkEntries(root, positionals, remove, now);
            console.log(`${changed} Beziehung(en) ${remove ? 'entfernt' : 'gesetzt'}`);
            return 0;
        }
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/link.ts scripts/src/cli.ts scripts/test/link.test.ts
git commit -m "feat: add brain link for symmetric related entries"
```

---

### Task 8: `brain index` – INDEX.md und graph.json

**Files:**
- Create: `scripts/src/indexer.ts`
- Modify: `scripts/src/cli.ts` (Import + `case 'index'`)
- Test: `scripts/test/indexer.test.ts`

**Interfaces:**
- Consumes: `loadBrain`, `relatedIds`, `sourceIds`, `Brain`, `Entry` (scan.ts); `extractLinks`, `headings` (markdown.ts); `UNCATEGORIZED`, `UNCATEGORIZED_NAME`; `normalizeId`; `formatIsoUtc`
- Produces:
  - `LARGE_DOC_LINES = 150`
  - `renderIndex(brain: Brain): string`
  - `interface GraphNode { id: string; type: 'category' | 'entry' | 'source'; category: string; label: string; path: string | null; size: number; mtime: string | null }`
  - `interface GraphEdge { source: string; target: string; type: 'member' | 'related' | 'link' | 'source' }`
  - `interface Graph { version: 1; nodes: GraphNode[]; edges: GraphEdge[] }`, `buildGraph(brain: Brain): Graph`
  - `runIndex(root: string): void` – schreibt `INDEX.md` und `graph.json`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/indexer.test.ts`:
```ts
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildGraph, renderIndex, runIndex } from '../src/indexer.ts';
import { loadBrain } from '../src/scan.ts';
import { entry, GARMIN, LAUF, read, runCli, setMtimes, validBrain, writeFile } from './helpers.ts';

const FILES = [
    'wiki/gesundheit/ernaehrung.md',
    'wiki/gesundheit/laufen.md',
    'wiki/technik/garmin.md',
    `${LAUF}.md`,
    `${GARMIN}.md`,
];

test('renderIndex matches the golden catalog', () => {
    assert.equal(renderIndex(loadBrain(validBrain())), [
        '# Index',
        '<!-- generiert von `brain index` – nicht bearbeiten -->',
        '',
        '## Gesundheit (`gesundheit`)',
        'Arztbefunde, Training.',
        '- [[wiki/gesundheit/ernaehrung]] **Ernährung** — Proteinbedarf beim Ausdauersport. · ↔ [[wiki/gesundheit/laufen]]',
        '- [[wiki/gesundheit/laufen]] **Laufen** — Trainingspläne für 10-km-Läufe. · ↔ [[wiki/gesundheit/ernaehrung]]',
        '',
        '## Technik (`technik`)',
        'Software und Infrastruktur.',
        '- [[wiki/technik/garmin]] **Garmin** — Uhr-Einstellungen.',
        '',
        '## Referenz-Map',
        '(keine großen Dokumente)',
        '',
    ].join('\n'));
});

test('renderIndex shows empty categories, uncategorized entries and large documents', () => {
    const longBody = ['## Ingress', ...Array.from({ length: 80 }, (_, i) => `Zeile ${i}`), '## Storage', ...Array.from({ length: 80 }, (_, i) => `Zeile ${i}`)].join('\n');
    const root = validBrain({
        'categories.yml': 'categories:\n  - slug: gesundheit\n    name: Gesundheit\n  - slug: technik\n    name: Technik\n  - slug: urlaub\n    name: Urlaub\n    description: Reisen.\n',
        'wiki/_uncategorized/steuer-idee.md': entry({ title: 'Steuer-Idee', category: '_uncategorized', summary: 'Idee zur Steuer.', sources: [GARMIN] }),
        'wiki/technik/kubernetes.md': entry({ title: 'Kubernetes', category: 'technik', summary: 'Cluster-Wissen.', sources: [GARMIN], body: longBody }),
    });
    const index = renderIndex(loadBrain(root));
    assert.ok(index.includes('## Urlaub (`urlaub`)\nReisen.\n(noch leer)\n'));
    assert.ok(index.includes('## Ohne Kategorie (`_uncategorized`)\n- [[wiki/_uncategorized/steuer-idee]] **Steuer-Idee** — Idee zur Steuer.\n'));
    assert.ok(index.includes('## Referenz-Map\n- [[wiki/technik/kubernetes]] **Kubernetes**\n  - [[wiki/technik/kubernetes#Ingress]]\n  - [[wiki/technik/kubernetes#Storage]]\n'));
    assert.ok(index.indexOf('## Urlaub') < index.indexOf('## Ohne Kategorie'));
});

test('buildGraph matches the golden graph', () => {
    const root = validBrain();
    setMtimes(root, FILES);
    const size = (rel: string): number => statSync(join(root, rel)).size;
    const mtime = '2026-10-02T15:30:00Z';
    assert.deepEqual(buildGraph(loadBrain(root)), {
        version: 1,
        nodes: [
            { id: LAUF, type: 'source', category: 'gesundheit', label: '2026-10-02-1530-lauf', path: `${LAUF}.md`, size: size(`${LAUF}.md`), mtime },
            { id: GARMIN, type: 'source', category: 'technik', label: '2026-10-02-1600-garmin', path: `${GARMIN}.md`, size: size(`${GARMIN}.md`), mtime },
            { id: 'category:gesundheit', type: 'category', category: 'gesundheit', label: 'Gesundheit', path: null, size: 2, mtime: null },
            { id: 'category:technik', type: 'category', category: 'technik', label: 'Technik', path: null, size: 1, mtime: null },
            { id: 'wiki/gesundheit/ernaehrung', type: 'entry', category: 'gesundheit', label: 'Ernährung', path: 'wiki/gesundheit/ernaehrung.md', size: size('wiki/gesundheit/ernaehrung.md'), mtime },
            { id: 'wiki/gesundheit/laufen', type: 'entry', category: 'gesundheit', label: 'Laufen', path: 'wiki/gesundheit/laufen.md', size: size('wiki/gesundheit/laufen.md'), mtime },
            { id: 'wiki/technik/garmin', type: 'entry', category: 'technik', label: 'Garmin', path: 'wiki/technik/garmin.md', size: size('wiki/technik/garmin.md'), mtime },
        ],
        edges: [
            { source: 'wiki/gesundheit/ernaehrung', target: LAUF, type: 'source' },
            { source: 'wiki/gesundheit/ernaehrung', target: 'category:gesundheit', type: 'member' },
            { source: 'wiki/gesundheit/ernaehrung', target: 'wiki/gesundheit/laufen', type: 'related' },
            { source: 'wiki/gesundheit/laufen', target: LAUF, type: 'source' },
            { source: 'wiki/gesundheit/laufen', target: 'category:gesundheit', type: 'member' },
            { source: 'wiki/gesundheit/laufen', target: 'wiki/technik/garmin', type: 'link' },
            { source: 'wiki/technik/garmin', target: GARMIN, type: 'source' },
            { source: 'wiki/technik/garmin', target: 'category:technik', type: 'member' },
        ],
    });
});

test('buildGraph ignores links in code, to missing entries and self links', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({
            title: 'Garmin',
            category: 'technik',
            sources: [GARMIN],
            body: '`[[wiki/gesundheit/laufen]]` [[wiki/technik/fehlt]] [[wiki/technik/garmin]]',
        }),
    });
    const edges = buildGraph(loadBrain(root)).edges.filter((edge) => edge.source === 'wiki/technik/garmin');
    assert.deepEqual(edges.map((edge) => edge.type), ['source', 'member']);
});

test('runIndex is deterministic and cli index writes both files', () => {
    const root = validBrain();
    setMtimes(root, FILES);
    runIndex(root);
    const index = read(root, 'INDEX.md');
    const graph = read(root, 'graph.json');
    writeFile(root, 'INDEX.md', 'manuell kaputt gemacht');
    const result = runCli(root, ['index']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(root, 'INDEX.md'), index);
    assert.equal(read(root, 'graph.json'), graph);
    assert.ok(graph.endsWith('}\n'));
    assert.equal(JSON.parse(graph).version, 1);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/indexer.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/indexer.ts`:
```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNCATEGORIZED, UNCATEGORIZED_NAME } from './categories.ts';
import { extractLinks, headings } from './markdown.ts';
import { normalizeId } from './paths.ts';
import { type Brain, type Entry, loadBrain, relatedIds, sourceIds } from './scan.ts';
import { formatIsoUtc } from './time.ts';

export const LARGE_DOC_LINES = 150;

export interface GraphNode {
    id: string;
    type: 'category' | 'entry' | 'source';
    category: string;
    label: string;
    path: string | null;
    size: number;
    mtime: string | null;
}

export interface GraphEdge {
    source: string;
    target: string;
    type: 'member' | 'related' | 'link' | 'source';
}

export interface Graph {
    version: 1;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

interface CategoryGroup {
    slug: string;
    name: string;
    description: string;
    entries: Entry[];
}

const collator = new Intl.Collator('de');

function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function lineCount(text: string): number {
    const lines = text.split(/\r?\n/).length;
    return text.endsWith('\n') ? lines - 1 : lines;
}

/** Groups entries: registered categories in file order, then _uncategorized, then unknown folders. */
function groupByCategory(brain: Brain): CategoryGroup[] {
    const byCategory = new Map<string, Entry[]>();
    for (const entry of brain.entries) {
        byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
    }
    const sorted = (entries: Entry[]): Entry[] =>
        [...entries].sort((a, b) => collator.compare(a.title, b.title) || compare(a.id, b.id));
    const groups: CategoryGroup[] = brain.categories.map((category) => ({
        ...category,
        entries: sorted(byCategory.get(category.slug) ?? []),
    }));
    const uncategorized = byCategory.get(UNCATEGORIZED);
    if (uncategorized !== undefined) {
        groups.push({ slug: UNCATEGORIZED, name: UNCATEGORIZED_NAME, description: '', entries: sorted(uncategorized) });
    }
    const known = new Set(brain.categories.map((category) => category.slug));
    const unknown = [...byCategory.keys()].filter((slug) => !known.has(slug) && slug !== UNCATEGORIZED).sort();
    for (const slug of unknown) {
        groups.push({
            slug,
            name: slug,
            description: 'Nicht in categories.yml registriert.',
            entries: sorted(byCategory.get(slug) ?? []),
        });
    }
    return groups;
}

export function renderIndex(brain: Brain): string {
    const lines = ['# Index', '<!-- generiert von `brain index` – nicht bearbeiten -->', ''];
    for (const group of groupByCategory(brain)) {
        lines.push(`## ${group.name} (\`${group.slug}\`)`);
        if (group.description !== '') {
            lines.push(group.description);
        }
        if (group.entries.length === 0) {
            lines.push('(noch leer)');
        }
        for (const entry of group.entries) {
            let line = `- [[${entry.id}]] **${entry.title}**`;
            if (entry.summary !== '') {
                line += ` — ${entry.summary}`;
            }
            const related = relatedIds(entry);
            if (related.length > 0) {
                line += ` · ↔ ${related.map((id) => `[[${id}]]`).join(', ')}`;
            }
            lines.push(line);
        }
        lines.push('');
    }
    lines.push('## Referenz-Map');
    const large = brain.entries.filter((entry) => lineCount(entry.text) > LARGE_DOC_LINES);
    if (large.length === 0) {
        lines.push('(keine großen Dokumente)');
    }
    for (const entry of large) {
        lines.push(`- [[${entry.id}]] **${entry.title}**`);
        for (const heading of headings(entry.body)) {
            if (heading.level === 2 && heading.title !== 'Related' && heading.title !== 'Sources') {
                lines.push(`  - [[${entry.id}#${heading.title}]]`);
            }
        }
    }
    return `${lines.join('\n')}\n`;
}

export function buildGraph(brain: Brain): Graph {
    const nodes: GraphNode[] = [];
    const edges = new Map<string, GraphEdge>();
    const addEdge = (edge: GraphEdge): void => {
        edges.set(`${edge.source}\u0000${edge.target}\u0000${edge.type}`, edge);
    };
    for (const group of groupByCategory(brain)) {
        nodes.push({
            id: `category:${group.slug}`,
            type: 'category',
            category: group.slug,
            label: group.name,
            path: null,
            size: group.entries.length,
            mtime: null,
        });
    }
    const entryIds = new Set(brain.entries.map((entry) => entry.id));
    const sourceFileIds = new Set(brain.sources.map((source) => source.id));
    const relatedPairs = new Set<string>();
    const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    for (const entry of brain.entries) {
        nodes.push({
            id: entry.id,
            type: 'entry',
            category: entry.category,
            label: entry.title,
            path: entry.path,
            size: entry.size,
            mtime: formatIsoUtc(entry.mtime),
        });
        addEdge({ source: entry.id, target: `category:${entry.category}`, type: 'member' });
        for (const other of relatedIds(entry)) {
            if (other === entry.id || !entryIds.has(other)) {
                continue;
            }
            relatedPairs.add(pairKey(entry.id, other));
            const [a, b] = entry.id < other ? [entry.id, other] : [other, entry.id];
            addEdge({ source: a, target: b, type: 'related' });
        }
        for (const source of sourceIds(entry)) {
            if (sourceFileIds.has(source)) {
                addEdge({ source: entry.id, target: source, type: 'source' });
            }
        }
    }
    for (const entry of brain.entries) {
        for (const link of extractLinks(entry.body)) {
            const target = normalizeId(link.target);
            if (target === entry.id || !entryIds.has(target) || relatedPairs.has(pairKey(entry.id, target))) {
                continue;
            }
            addEdge({ source: entry.id, target, type: 'link' });
        }
    }
    for (const source of brain.sources) {
        nodes.push({
            id: source.id,
            type: 'source',
            category: source.category,
            label: source.id.split('/').pop() ?? source.id,
            path: source.path,
            size: source.size,
            mtime: formatIsoUtc(source.mtime),
        });
    }
    nodes.sort((a, b) => compare(a.id, b.id));
    const edgeList = [...edges.values()].sort(
        (a, b) => compare(a.source, b.source) || compare(a.target, b.target) || compare(a.type, b.type),
    );
    return { version: 1, nodes, edges: edgeList };
}

export function runIndex(root: string): void {
    const brain = loadBrain(root);
    writeFileSync(join(root, 'INDEX.md'), renderIndex(brain), 'utf8');
    writeFileSync(join(root, 'graph.json'), `${JSON.stringify(buildGraph(brain), null, 2)}\n`, 'utf8');
}
```

In `scripts/src/cli.ts` – Import:
```ts
import { runIndex } from './indexer.ts';
```
und `case` vor `default:`:
```ts
        case 'index': {
            runIndex(root);
            console.log('INDEX.md und graph.json erzeugt');
            return 0;
        }
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/indexer.ts scripts/src/cli.ts scripts/test/indexer.test.ts
git commit -m "feat: add brain index generating INDEX.md and graph.json"
```

---

### Task 9: `brain remember`

**Files:**
- Create: `scripts/src/remember.ts`
- Modify: `scripts/src/cli.ts` (Import + `case 'remember'`)
- Test: `scripts/test/remember.test.ts`

**Interfaces:**
- Consumes: `isKnownCategory`, `loadCategories`; `runIndex`; `linkEntries`, `toEntryId`; `appendLog`; `normalizeId`, `hasParentSegment`; `slugify`; `formatDate`
- Produces:
  - `interface RememberInput { category: string; title: string; summary: string; sources: string[]; tags: string[]; related: string[]; body: string }`
  - `remember(root: string, input: RememberInput, now: Date): string` – gibt Eintrags-ID zurück

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/remember.test.ts`:
```ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { getRelated, splitFrontmatter } from '../src/markdown.ts';
import { type RememberInput, remember } from '../src/remember.ts';
import { LAUF, NOW, read, runCli, validBrain } from './helpers.ts';

function input(overrides: Partial<RememberInput> = {}): RememberInput {
    return {
        category: 'gesundheit',
        title: 'Schlaf & Erholung',
        summary: 'Schlafdauer und Regeneration.',
        sources: [LAUF],
        tags: ['schlaf'],
        related: [],
        body: 'Sieben Stunden sind das Minimum.\n',
        ...overrides,
    };
}

test('remember writes a complete entry, logs it and rebuilds the index', () => {
    const root = validBrain();
    const id = remember(root, input(), NOW);
    assert.equal(id, 'wiki/gesundheit/schlaf-erholung');
    const parsed = splitFrontmatter(read(root, `${id}.md`));
    assert.equal(parsed.frontmatterError, null);
    assert.deepEqual(parsed.frontmatter, {
        title: 'Schlaf & Erholung',
        category: 'gesundheit',
        tags: ['schlaf'],
        summary: 'Schlafdauer und Regeneration.',
        sources: [`${LAUF}.md`],
        created: '2026-10-03',
        updated: '2026-10-03',
    });
    assert.equal(
        parsed.body,
        `# Schlaf & Erholung\n\nSieben Stunden sind das Minimum.\n\n## Sources\n- [[${LAUF}]]\n`,
    );
    assert.match(read(root, 'LOG.md'), /\| create \| wiki\/gesundheit\/schlaf-erholung \| aus archive\//);
    assert.match(read(root, 'INDEX.md'), /\[\[wiki\/gesundheit\/schlaf-erholung\]\] \*\*Schlaf & Erholung\*\*/);
});

test('remember --related links both sides', () => {
    const root = validBrain();
    const id = remember(root, input({ related: ['wiki/technik/garmin.md'], tags: [] }), NOW);
    assert.deepEqual(getRelated(read(root, `${id}.md`)).map((l) => l.target), ['wiki/technik/garmin']);
    assert.deepEqual(getRelated(read(root, 'wiki/technik/garmin.md')).map((l) => l.target), [id]);
    assert.equal('tags' in splitFrontmatter(read(root, `${id}.md`)).frontmatter, false);
});

const invalid: Array<[string, Partial<RememberInput>, RegExp]> = [
    ['unknown category', { category: 'urlaub' }, /Unbekannte Kategorie/],
    ['empty title', { title: '  ' }, /Titel fehlt/],
    ['empty summary', { summary: ' ' }, /Summary/],
    ['multi-line summary', { summary: 'Satz eins.\nSatz zwei.' }, /Summary/],
    ['no source', { sources: [] }, /--source/],
    ['missing source', { sources: ['archive/gesundheit/2026/10/fehlt'] }, /Quelle nicht gefunden/],
    ['source outside archive', { sources: ['categories'] }, /Quelle nicht gefunden/],
    ['source traversal', { sources: ['archive/../categories'] }, /Quelle nicht gefunden/],
    ['missing related', { related: ['wiki/technik/fehlt'] }, /nicht gefunden/],
    ['existing entry', { title: 'Laufen' }, /existiert bereits/],
];
for (const [label, overrides, error] of invalid) {
    test(`remember rejects ${label} without writing`, () => {
        const root = validBrain();
        assert.throws(() => remember(root, input(overrides), NOW), error);
        assert.equal(existsSync(join(root, 'wiki/gesundheit/schlaf-erholung.md')), false);
        assert.equal(existsSync(join(root, 'LOG.md')), false);
    });
}

test('cli remember reads the body from stdin', () => {
    const root = validBrain();
    const result = runCli(root, [
        'remember', '--category', 'technik', '--title', 'Uhr-Akku', '--summary', 'Akkulaufzeit der Uhr.',
        '--source', `${LAUF}.md`, '--tags', 'garmin, akku', '--related', 'wiki/technik/garmin',
    ], 'Akku hält 10 Tage.\n');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'wiki/technik/uhr-akku\n');
    assert.match(read(root, 'wiki/technik/uhr-akku.md'), /Akku hält 10 Tage\./);
    assert.deepEqual(splitFrontmatter(read(root, 'wiki/technik/uhr-akku.md')).frontmatter.tags, ['garmin', 'akku']);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/remember.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/remember.ts`:
```ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { isKnownCategory, loadCategories } from './categories.ts';
import { runIndex } from './indexer.ts';
import { linkEntries, toEntryId } from './link.ts';
import { appendLog } from './log.ts';
import { hasParentSegment, normalizeId } from './paths.ts';
import { slugify } from './slug.ts';
import { formatDate } from './time.ts';

export interface RememberInput {
    category: string;
    title: string;
    summary: string;
    sources: string[];
    tags: string[];
    related: string[];
    body: string;
}

function toSourcePath(root: string, input: string): string {
    const id = normalizeId(input);
    if (!id.startsWith('archive/') || hasParentSegment(id) || !existsSync(join(root, `${id}.md`))) {
        throw new Error(`Quelle nicht gefunden: ${input}`);
    }
    return `${id}.md`;
}

/** Creates a new knowledge entry with complete frontmatter, then links and re-indexes. */
export function remember(root: string, input: RememberInput, now: Date): string {
    if (!isKnownCategory(loadCategories(root), input.category)) {
        throw new Error(`Unbekannte Kategorie: ${input.category}`);
    }
    const title = input.title.trim();
    if (title === '') {
        throw new Error('Titel fehlt');
    }
    const summary = input.summary.trim();
    if (summary === '' || /[\r\n]/.test(summary)) {
        throw new Error('Summary muss genau eine nicht-leere Zeile sein');
    }
    if (input.sources.length === 0) {
        throw new Error('Mindestens eine --source angeben');
    }
    const sources = [...new Set(input.sources.map((source) => toSourcePath(root, source)))];
    const related = input.related.map((entry) => toEntryId(root, entry));
    const id = `wiki/${input.category}/${slugify(title)}`;
    const file = join(root, `${id}.md`);
    if (existsSync(file)) {
        throw new Error(`Eintrag existiert bereits: ${id}`);
    }
    const date = formatDate(now);
    const frontmatter: Record<string, unknown> = { title, category: input.category };
    if (input.tags.length > 0) {
        frontmatter.tags = input.tags;
    }
    Object.assign(frontmatter, { summary, sources, created: date, updated: date });
    const lines = ['---', stringify(frontmatter).trimEnd(), '---', `# ${title}`, ''];
    const body = input.body.trim();
    if (body !== '') {
        lines.push(body, '');
    }
    lines.push('## Sources', ...sources.map((source) => `- [[${source.slice(0, -3)}]]`), '');
    mkdirSync(join(root, 'wiki', input.category), { recursive: true });
    writeFileSync(file, lines.join('\n'), 'utf8');
    appendLog(root, now, 'create', id, `aus ${sources.join(', ')}`);
    if (related.length > 0) {
        linkEntries(root, [id, ...related], false, now);
    }
    runIndex(root);
    return id;
}
```

In `scripts/src/cli.ts` – Import:
```ts
import { remember } from './remember.ts';
```
und `case` vor `default:`:
```ts
        case 'remember': {
            const { values } = parseArgs({
                args: rest,
                options: {
                    category: { type: 'string' },
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    source: { type: 'string', multiple: true },
                    tags: { type: 'string' },
                    related: { type: 'string', multiple: true },
                },
            });
            if (values.category === undefined || values.title === undefined || values.summary === undefined) {
                throw new Error(
                    'Verwendung: brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> '
                    + '[--source …] [--tags a,b] [--related <eintrag> …] < body.md',
                );
            }
            const tags = (values.tags ?? '').split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
            console.log(remember(root, {
                category: values.category,
                title: values.title,
                summary: values.summary,
                sources: values.source ?? [],
                tags,
                related: values.related ?? [],
                body: readStdin(),
            }, now));
            return 0;
        }
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/remember.ts scripts/src/cli.ts scripts/test/remember.test.ts
git commit -m "feat: add brain remember"
```

---

### Task 10: `brain check` (inkl. Archiv-Integrität per Git)

**Files:**
- Create: `scripts/src/git.ts`, `scripts/src/check.ts`
- Modify: `scripts/src/cli.ts` (Import + `case 'check'`)
- Test: `scripts/test/check.test.ts`

**Interfaces:**
- Consumes: `loadBrain`, `relatedIds`, `Brain`, `Entry`; `extractLinks`, `getRelated`, `headings`, `parseOpenPoints`, `splitFrontmatter`; `isKnownCategory`, `UNCATEGORIZED`; `normalizeId`, `hasParentSegment`
- Produces:
  - `git.ts`: `isGitRepo(root: string): boolean`, `archiveIntegrityErrors(root: string): string[]` (Meldungen beginnen mit `archive: `)
  - `check.ts`: `interface CheckReport { errors: string[]; hints: string[] }`, `checkBrain(root: string): CheckReport`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/check.test.ts`:
```ts
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { entry, GARMIN, git, initGit, LAUF, runCli, validBrain, writeFile } from './helpers.ts';

function conflict(id: string, affects: string[]): string {
    return `> [!warning] Conflict ${id}\n> Affects: ${affects.map((a) => `[[${a}]]`).join(', ')}\n> Text`;
}

test('a valid brain has no errors (wiki/CLAUDE.md and code links ignored)', () => {
    const root = validBrain({
        'wiki/technik/code.md': entry({ title: 'Code', category: 'technik', sources: [GARMIN], body: '`[[wiki/x/y]]`\n```\n[[wiki/x/z]]\n```' }),
    });
    assert.deepEqual(checkBrain(root).errors, []);
});

const broken: Array<[string, Record<string, string>, RegExp]> = [
    ['broken link', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '[[wiki/technik/fehlt]]' }) }, /Link-Ziel fehlt: \[\[wiki\/technik\/fehlt\]\]/],
    ['missing heading', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '[[wiki/gesundheit/laufen#Gibtsnicht]]' }) }, /Abschnitt fehlt/],
    ['missing frontmatter', { 'wiki/technik/garmin.md': '# Garmin\n' }, /Frontmatter fehlt/],
    ['missing title', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN] }).replace('title: Garmin\n', '') }, /title fehlt/],
    ['category mismatch', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'gesundheit', sources: [GARMIN] }) }, /passt nicht zum Ordner/],
    ['empty summary', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', summary: '""', sources: [GARMIN] }) }, /summary/],
    ['invalid date', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN] }).replace('updated: 2026-10-01', 'updated: gestern') }, /updated/],
    ['no sources', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [] }) }, /sources fehlt/],
    ['missing source file', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: ['archive/technik/2026/10/fehlt'] }) }, /Quelle nicht gefunden/],
    ['unregistered folder', { 'wiki/urlaub/norwegen.md': entry({ title: 'Norwegen', category: 'urlaub', sources: [GARMIN] }) }, /wiki\/urlaub: Ordner ist keine registrierte Kategorie/],
    ['stray file', { 'wiki/lose.md': '# lose\n' }, /wiki\/lose\.md: Datei liegt nicht/],
    ['asymmetric related', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], related: ['wiki/gesundheit/laufen'] }) }, /Related nicht symmetrisch/],
    ['related with anchor', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '## Laufen\n', related: ['wiki/technik/garmin#Laufen'] }) }, /keine Abschnitts-Anker/],
    ['malformed callout', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '> [!warning] Conflict\n> Affects: [[wiki/technik/garmin]]' }) }, /ungültiger Callout/],
    ['open point missing in affected entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/technik/garmin', 'wiki/gesundheit/laufen']) }) }, /C-20261003-1: fehlt in wiki\/gesundheit\/laufen/],
    ['open point in unlisted entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']) }), 'wiki/gesundheit/laufen.md': entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']), related: ['wiki/gesundheit/ernaehrung'] }) }, /C-20261003-1: steht in wiki\/technik\/garmin/],
    ['differing affects lists', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: conflict('C-20261003-1', ['wiki/technik/garmin', 'wiki/gesundheit/laufen']) }), 'wiki/gesundheit/laufen.md': entry({ title: 'Laufen', category: 'gesundheit', sources: [LAUF], body: conflict('C-20261003-1', ['wiki/gesundheit/laufen']), related: ['wiki/gesundheit/ernaehrung'] }) }, /C-20261003-1: Affects-Listen bzw\. Typ weichen ab/],
    ['duplicate id in one entry', { 'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: `${conflict('C-20261003-1', ['wiki/technik/garmin'])}\n\n${conflict('C-20261003-1', ['wiki/technik/garmin'])}` }) }, /ID C-20261003-1 doppelt vergeben/],
    ['invalid categories.yml', { 'categories.yml': 'categories: {}\n' }, /Liste/],
];
for (const [label, files, error] of broken) {
    test(`check reports ${label}`, () => {
        const report = checkBrain(validBrain(files));
        assert.match(report.errors.join('\n'), error);
    });
}

test('check hints list open points, uncategorized entries and the missing git repo', () => {
    const root = validBrain({
        'wiki/technik/garmin.md': entry({ title: 'Garmin', category: 'technik', sources: [GARMIN], body: '> [!question] Unclear Q-20261003-1\n> Affects: [[wiki/technik/garmin]]\n> Welche Uhr?' }),
        'wiki/_uncategorized/idee.md': entry({ title: 'Idee', category: '_uncategorized', sources: [GARMIN] }),
    });
    const report = checkBrain(root);
    assert.deepEqual(report.errors, []);
    const hints = report.hints.join('\n');
    assert.match(hints, /Offen: Q-20261003-1 \(Unklarheit\) – betrifft wiki\/technik\/garmin/);
    assert.match(hints, /Ohne Kategorie: wiki\/_uncategorized\/idee – bitte kategorisieren/);
    assert.match(hints, /Kein Git-Repository/);
});

test('check: committed CRLF original produces no phantom change', () => {
    const root = validBrain();
    initGit(root);
    assert.deepEqual(checkBrain(root).errors, []);
    assert.equal(git(root, 'status', '--porcelain'), '');
});

const archiveCases: Array<[string, (root: string) => void, RegExp | null]> = [
    ['modified file', (root) => writeFile(root, `${GARMIN}.md`, 'geändert\n'), /wurde verändert/],
    ['deleted file', (root) => rmSync(join(root, `${GARMIN}.md`)), /wurde gelöscht/],
    ['identical git mv', (root) => {
        mkdirSync(join(root, 'archive/technik/2026/11'), { recursive: true });
        git(root, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
    }, null],
    ['git mv with change', (root) => {
        mkdirSync(join(root, 'archive/technik/2026/11'), { recursive: true });
        git(root, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
        writeFile(root, 'archive/technik/2026/11/x.md', 'anders\n');
    }, /mit Inhaltsänderung/],
    ['new untracked file', (root) => writeFile(root, 'archive/technik/2026/10/neu.md', 'neu\n'), null],
];
for (const [label, mutate, error] of archiveCases) {
    test(`check archive integrity: ${label}`, () => {
        const root = validBrain();
        initGit(root);
        mutate(root);
        const archiveErrors = checkBrain(root).errors.filter((e) => e.startsWith('archive: '));
        if (error === null) {
            assert.deepEqual(archiveErrors, []);
        } else {
            assert.match(archiveErrors.join('\n'), error);
        }
    });
}

test('cli check exit codes and output', () => {
    const ok = runCli(validBrain(), ['check']);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /Keine Fehler\./);
    const bad = runCli(validBrain({ 'wiki/lose.md': 'x' }), ['check']);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^Fehler:\n {2}- wiki\/lose\.md/);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/check.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/git.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function git(root: string, args: string[]): Buffer {
    return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

export function isGitRepo(root: string): boolean {
    try {
        return git(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim() !== '';
    } catch {
        return false;
    }
}

function hasHead(root: string): boolean {
    try {
        git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
        return true;
    } catch {
        return false;
    }
}

/** Compares the working tree of archive/ against HEAD: only new files and identical renames are allowed. */
export function archiveIntegrityErrors(root: string): string[] {
    if (!hasHead(root)) {
        return [];
    }
    const output = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', 'archive']).toString('utf8');
    const tokens = output.split('\0').filter((token) => token !== '');
    const errors: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const status = tokens[i].slice(0, 2);
        const path = tokens[i].slice(3);
        if (status[0] === 'R' || status[0] === 'C') {
            const from = tokens[++i];
            const original = git(root, ['show', `HEAD:${from}`]);
            const current = existsSync(join(root, path)) ? readFileSync(join(root, path)) : Buffer.alloc(0);
            if (!original.equals(current)) {
                errors.push(`archive: ${from} → ${path} mit Inhaltsänderung umbenannt`);
            }
        } else if (status.includes('D')) {
            errors.push(`archive: ${path} wurde gelöscht (Verschieben nur per brain recategorize)`);
        } else if (status.includes('M') || status.includes('T')) {
            errors.push(`archive: ${path} wurde verändert`);
        }
    }
    return errors;
}
```

`scripts/src/check.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isKnownCategory, UNCATEGORIZED } from './categories.ts';
import { archiveIntegrityErrors, isGitRepo } from './git.ts';
import { extractLinks, getRelated, headings, parseOpenPoints, splitFrontmatter } from './markdown.ts';
import { hasParentSegment, normalizeId } from './paths.ts';
import { type Brain, type Entry, loadBrain, relatedIds } from './scan.ts';

export interface CheckReport {
    errors: string[];
    hints: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkFolders(brain: Brain, errors: string[]): void {
    for (const area of ['wiki', 'archive'] as const) {
        for (const folder of brain.folders[area]) {
            if (!isKnownCategory(brain.categories, folder)) {
                errors.push(`${area}/${folder}: Ordner ist keine registrierte Kategorie (categories.yml)`);
            }
        }
    }
    for (const file of brain.strayFiles) {
        errors.push(`${file}: Datei liegt nicht in wiki/<kategorie>/ bzw. archive/<kategorie>/`);
    }
}

function checkFrontmatter(brain: Brain, entry: Entry, errors: string[]): void {
    const path = entry.path;
    if (entry.frontmatterError !== null) {
        errors.push(`${path}: ${entry.frontmatterError}`);
        return;
    }
    const fm = entry.frontmatter;
    if (typeof fm.title !== 'string' || fm.title.trim() === '') {
        errors.push(`${path}: Pflichtfeld title fehlt`);
    }
    if (fm.category !== entry.category) {
        errors.push(`${path}: category „${String(fm.category)}“ passt nicht zum Ordner „${entry.category}“`);
    }
    const summary = fm.summary;
    if (typeof summary !== 'string' || summary.trim() === '' || /[\r\n]/.test(summary.trim())) {
        errors.push(`${path}: summary fehlt oder ist mehrzeilig`);
    }
    for (const key of ['created', 'updated'] as const) {
        const value = fm[key];
        if (typeof value !== 'string' || !DATE.test(value)) {
            errors.push(`${path}: ${key} fehlt oder ist kein Datum (YYYY-MM-DD)`);
        }
    }
    if (fm.tags !== undefined && (!Array.isArray(fm.tags) || fm.tags.some((tag) => typeof tag !== 'string'))) {
        errors.push(`${path}: tags muss eine Liste von Texten sein`);
    }
    if (!Array.isArray(fm.sources) || fm.sources.length === 0) {
        errors.push(`${path}: sources fehlt oder ist leer`);
        return;
    }
    for (const source of fm.sources) {
        const id = typeof source === 'string' ? normalizeId(source) : '';
        if (!id.startsWith('archive/') || hasParentSegment(id) || !existsSync(join(brain.root, `${id}.md`))) {
            errors.push(`${path}: Quelle nicht gefunden: ${String(source)}`);
        }
    }
}

function checkLinks(brain: Brain, entry: Entry, errors: string[]): void {
    for (const link of extractLinks(entry.body)) {
        const target = normalizeId(link.target);
        const file = join(brain.root, `${target}.md`);
        if (hasParentSegment(target) || !existsSync(file)) {
            errors.push(`${entry.path}: Link-Ziel fehlt: ${link.raw}`);
            continue;
        }
        if (link.anchor !== null) {
            const titles = headings(splitFrontmatter(readFileSync(file, 'utf8')).body).map((heading) => heading.title);
            if (!titles.includes(link.anchor)) {
                errors.push(`${entry.path}: Abschnitt fehlt: ${link.raw}`);
            }
        }
    }
}

function checkRelated(brain: Brain, errors: string[]): void {
    const entryIds = new Set(brain.entries.map((entry) => entry.id));
    const related = new Map(brain.entries.map((entry) => [entry.id, new Set(relatedIds(entry))]));
    for (const entry of brain.entries) {
        for (const link of getRelated(entry.body)) {
            if (link.anchor !== null) {
                errors.push(`${entry.path}: ## Related darf keine Abschnitts-Anker enthalten: ${link.raw}`);
            }
        }
        for (const other of related.get(entry.id) ?? []) {
            if (other === entry.id) {
                errors.push(`${entry.path}: verweist in ## Related auf sich selbst`);
            } else if (!entryIds.has(other)) {
                if (!other.startsWith('wiki/')) {
                    errors.push(`${entry.path}: ## Related darf nur Wissenseinträge enthalten: ${other}`);
                }
            } else if (!(related.get(other)?.has(entry.id) ?? false)) {
                errors.push(`${entry.path}: Related nicht symmetrisch – ${other} verweist nicht zurück (brain link ${entry.id} ${other})`);
            }
        }
    }
}

interface Occurrence {
    entry: string;
    kind: string;
    affects: string[];
}

function checkOpenPoints(brain: Brain, errors: string[], hints: string[]): void {
    const occurrences = new Map<string, Occurrence[]>();
    for (const entry of brain.entries) {
        const { points, malformed } = parseOpenPoints(entry.body);
        for (const message of malformed) {
            errors.push(`${entry.path}: ${message}`);
        }
        const seen = new Set<string>();
        for (const point of points) {
            if (seen.has(point.id)) {
                errors.push(`${entry.path}: ID ${point.id} doppelt vergeben`);
                continue;
            }
            seen.add(point.id);
            const affects = [...new Set(point.affects)].sort();
            occurrences.set(point.id, [...(occurrences.get(point.id) ?? []), { entry: entry.id, kind: point.kind, affects }]);
        }
    }
    const entryIds = new Set(brain.entries.map((entry) => entry.id));
    for (const id of [...occurrences.keys()].sort()) {
        const list = occurrences.get(id) ?? [];
        const first = list[0];
        hints.push(`Offen: ${id} (${first.kind === 'conflict' ? 'Widerspruch' : 'Unklarheit'}) – betrifft ${first.affects.join(', ')}`);
        const signature = (o: Occurrence): string => `${o.kind}|${o.affects.join(',')}`;
        if (list.some((o) => signature(o) !== signature(first))) {
            errors.push(`${id}: Affects-Listen bzw. Typ weichen ab zwischen ${list.map((o) => o.entry).join(', ')}`);
            continue;
        }
        if (first.affects.length === 0) {
            errors.push(`${id}: Affects-Liste ist leer`);
            continue;
        }
        const present = new Set(list.map((o) => o.entry));
        for (const o of list) {
            if (!first.affects.includes(o.entry)) {
                errors.push(`${id}: steht in ${o.entry}, der nicht unter Affects genannt ist`);
            }
        }
        for (const affected of first.affects) {
            if (!present.has(affected)) {
                errors.push(`${id}: fehlt in ${affected}${entryIds.has(affected) ? '' : ' (Eintrag existiert nicht)'}`);
            }
        }
    }
}

export function checkBrain(root: string): CheckReport {
    const errors: string[] = [];
    const hints: string[] = [];
    let brain: Brain;
    try {
        brain = loadBrain(root);
    } catch (error) {
        return { errors: [(error as Error).message], hints };
    }
    checkFolders(brain, errors);
    for (const entry of brain.entries) {
        checkFrontmatter(brain, entry, errors);
        checkLinks(brain, entry, errors);
    }
    checkRelated(brain, errors);
    checkOpenPoints(brain, errors, hints);
    if (isGitRepo(root)) {
        errors.push(...archiveIntegrityErrors(root));
    } else {
        hints.push('Kein Git-Repository – Archiv-Integrität wurde nicht geprüft.');
    }
    for (const entry of brain.entries) {
        if (entry.category === UNCATEGORIZED) {
            hints.push(`Ohne Kategorie: ${entry.id} – bitte kategorisieren (brain recategorize --move ${entry.id} <kategorie>)`);
        }
    }
    return { errors, hints };
}
```

Hinweis zum Test „empty summary“: `summary: ""` ergibt einen leeren String → Fehler. Hinweis zu `isGitRepo`: temporäre Test-Ordner liegen unter `/tmp` und damit in keinem Repo.

In `scripts/src/cli.ts` – Import:
```ts
import { checkBrain } from './check.ts';
```
und `case` vor `default:`:
```ts
        case 'check': {
            const report = checkBrain(root);
            if (report.errors.length > 0) {
                console.log(['Fehler:', ...report.errors.map((error) => `  - ${error}`)].join('\n'));
            }
            if (report.hints.length > 0) {
                console.log(['Hinweise:', ...report.hints.map((hint) => `  - ${hint}`)].join('\n'));
            }
            if (report.errors.length === 0) {
                console.log('Keine Fehler.');
            }
            return report.errors.length > 0 ? 1 : 0;
        }
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/git.ts scripts/src/check.ts scripts/src/cli.ts scripts/test/check.test.ts
git commit -m "feat: add brain check with archive integrity"
```

---

### Task 11: `brain recategorize`

**Files:**
- Create: `scripts/src/recategorize.ts`
- Modify: `scripts/src/cli.ts` (Import + `case 'recategorize'`)
- Test: `scripts/test/recategorize.test.ts`

**Interfaces:**
- Consumes: `loadCategories`, `saveCategories`, `isKnownCategory`, `CATEGORY_SLUG_PATTERN`, `UNCATEGORIZED`; `runIndex`; `toEntryId`; `appendLog`; `replaceLinkTargets`; `normalizeId`; `loadBrain`, `sourceIds`
- Produces:
  - `renameCategory(root: string, from: string, to: string, now: Date): void`
  - `mergeCategory(root: string, from: string, to: string, now: Date): void`
  - `moveEntry(root: string, entryInput: string, toCategory: string, now: Date): void`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`scripts/test/recategorize.test.ts`:
```ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCategories } from '../src/categories.ts';
import { checkBrain } from '../src/check.ts';
import { splitFrontmatter } from '../src/markdown.ts';
import { mergeCategory, moveEntry, renameCategory } from '../src/recategorize.ts';
import { entry, GARMIN, initGit, LAUF, NOW, read, runCli, validBrain } from './helpers.ts';

const exists = (root: string, rel: string): boolean => existsSync(join(root, rel));

test('renameCategory moves files, rewrites links, sources, category and categories.yml', () => {
    const root = validBrain();
    initGit(root);
    renameCategory(root, 'gesundheit', 'koerper', NOW);
    assert.equal(exists(root, 'wiki/gesundheit'), false);
    assert.equal(exists(root, 'archive/gesundheit'), false);
    assert.equal(read(root, 'archive/koerper/2026/10/2026-10-02-1530-lauf.md'), 'Laufnotiz\r\nzweite Zeile\r\n');
    const laufen = read(root, 'wiki/koerper/laufen.md');
    assert.deepEqual(splitFrontmatter(laufen).frontmatter.sources, ['archive/koerper/2026/10/2026-10-02-1530-lauf.md']);
    assert.equal(splitFrontmatter(laufen).frontmatter.category, 'koerper');
    assert.ok(laufen.includes('- [[wiki/koerper/ernaehrung]]'));
    assert.ok(laufen.includes('- [[archive/koerper/2026/10/2026-10-02-1530-lauf]]'));
    assert.ok(laufen.includes('[[wiki/technik/garmin]]'));
    assert.deepEqual(loadCategories(root).map((c) => [c.slug, c.name]), [['koerper', 'Gesundheit'], ['technik', 'Technik']]);
    assert.deepEqual(checkBrain(root).errors, []);
    assert.match(read(root, 'LOG.md'), /\| recategorize \| gesundheit → koerper \| Kategorie umbenannt/);
    assert.match(read(root, 'INDEX.md'), /\[\[wiki\/koerper\/laufen\]\]/);
});

test('mergeCategory moves everything into the target and removes the source category', () => {
    const root = validBrain();
    initGit(root);
    mergeCategory(root, 'gesundheit', 'technik', NOW);
    assert.ok(exists(root, 'wiki/technik/laufen.md'));
    assert.ok(exists(root, 'archive/technik/2026/10/2026-10-02-1530-lauf.md'));
    assert.deepEqual(loadCategories(root).map((c) => c.slug), ['technik']);
    assert.equal(splitFrontmatter(read(root, 'wiki/technik/ernaehrung.md')).frontmatter.category, 'technik');
    assert.deepEqual(checkBrain(root).errors, []);
});

test('moveEntry moves the entry and its exclusive sources, updates links elsewhere', () => {
    const root = validBrain();
    initGit(root);
    moveEntry(root, 'wiki/technik/garmin', 'gesundheit', NOW);
    assert.ok(exists(root, 'wiki/gesundheit/garmin.md'));
    assert.ok(exists(root, 'archive/gesundheit/2026/10/2026-10-02-1600-garmin.md'));
    assert.equal(exists(root, 'archive/technik'), false);
    assert.ok(read(root, 'wiki/gesundheit/laufen.md').includes('[[wiki/gesundheit/garmin]]'));
    assert.deepEqual(checkBrain(root).errors, []);
});

test('moveEntry keeps shared sources in place and works out of _uncategorized without git', () => {
    const root = validBrain({
        'wiki/_uncategorized/idee.md': entry({ title: 'Idee', category: '_uncategorized', sources: [GARMIN] }),
    });
    moveEntry(root, 'wiki/_uncategorized/idee', 'gesundheit', NOW);
    assert.ok(exists(root, 'wiki/gesundheit/idee.md'));
    assert.ok(exists(root, `${GARMIN}.md`));
    moveEntry(root, 'wiki/gesundheit/laufen', 'technik', NOW);
    assert.ok(exists(root, `${LAUF}.md`));
    assert.deepEqual(checkBrain(root).errors, []);
});

const invalid: Array<[string, (root: string) => void, RegExp]> = [
    ['rename unknown', (root) => renameCategory(root, 'urlaub', 'reisen', NOW), /Unbekannte Kategorie/],
    ['rename to existing', (root) => renameCategory(root, 'gesundheit', 'technik', NOW), /existiert bereits/],
    ['rename to invalid slug', (root) => renameCategory(root, 'gesundheit', 'Körper', NOW), /Ungültiger Slug/],
    ['rename _uncategorized', (root) => renameCategory(root, '_uncategorized', 'x', NOW), /Unbekannte Kategorie/],
    ['merge into itself', (root) => mergeCategory(root, 'technik', 'technik', NOW), /verschieden/],
    ['merge into unknown', (root) => mergeCategory(root, 'technik', 'urlaub', NOW), /Unbekannte Kategorie/],
    ['move to same category', (root) => moveEntry(root, 'wiki/technik/garmin', 'technik', NOW), /bereits in/],
    ['move unknown entry', (root) => moveEntry(root, 'wiki/technik/fehlt', 'gesundheit', NOW), /nicht gefunden/],
    ['move to unknown category', (root) => moveEntry(root, 'wiki/technik/garmin', 'urlaub', NOW), /Unbekannte Kategorie/],
];
for (const [label, action, error] of invalid) {
    test(`recategorize rejects ${label}`, () => {
        assert.throws(() => action(validBrain()), error);
    });
}

test('moveEntry refuses to overwrite an existing entry', () => {
    const root = validBrain({
        'wiki/technik/laufen.md': entry({ title: 'Laufen', category: 'technik', sources: [GARMIN] }),
    });
    assert.throws(() => moveEntry(root, 'wiki/gesundheit/laufen', 'technik', NOW), /Ziel existiert bereits/);
    assert.ok(exists(root, 'wiki/gesundheit/laufen.md'));
});

test('cli recategorize', () => {
    const root = validBrain();
    initGit(root);
    const result = runCli(root, ['recategorize', '--rename', 'technik', 'software']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(exists(root, 'wiki/software/garmin.md'));
    assert.equal(runCli(root, ['recategorize', '--rename', '--move', 'a', 'b']).status, 1);
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `cd /mnt/f/second-brain/scripts && npm test`
Expected: FAIL mit `Cannot find module '…/src/recategorize.ts'`.

- [ ] **Step 3: Implementierung schreiben**

`scripts/src/recategorize.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseDocument } from 'yaml';
import { CATEGORY_SLUG_PATTERN, isKnownCategory, loadCategories, saveCategories, UNCATEGORIZED } from './categories.ts';
import { runIndex } from './indexer.ts';
import { toEntryId } from './link.ts';
import { appendLog } from './log.ts';
import { replaceLinkTargets } from './markdown.ts';
import { normalizeId } from './paths.ts';
import { loadBrain, sourceIds } from './scan.ts';

/** Maps old ids to new ids (both without ".md"). */
type Moves = Map<string, string>;

function isTracked(root: string, rel: string): boolean {
    try {
        execFileSync('git', ['-C', root, 'ls-files', '--error-unmatch', rel], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function moveFile(root: string, fromId: string, toId: string): void {
    const from = `${fromId}.md`;
    const to = `${toId}.md`;
    mkdirSync(dirname(join(root, to)), { recursive: true });
    if (isTracked(root, from)) {
        execFileSync('git', ['-C', root, 'mv', from, to], { stdio: 'pipe' });
    } else {
        renameSync(join(root, from), join(root, to));
    }
}

function removeEmptyDirs(dir: string): void {
    if (!existsSync(dir)) {
        return;
    }
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        if (dirent.isDirectory()) {
            removeEmptyDirs(join(dir, dirent.name));
        }
    }
    if (readdirSync(dir).length === 0) {
        rmdirSync(dir);
    }
}

function updateFrontmatter(text: string, category: string | null, moves: Moves): string {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (match === null) {
        return text;
    }
    const doc = parseDocument(match[1]);
    let changed = false;
    if (category !== null && doc.get('category') !== category) {
        doc.set('category', category);
        changed = true;
    }
    const sources: unknown = (doc.toJS() as Record<string, unknown> | null)?.sources;
    if (Array.isArray(sources)) {
        const next = sources.map((source: unknown) => {
            if (typeof source !== 'string') {
                return source;
            }
            const moved = moves.get(normalizeId(source));
            return moved === undefined ? source : `${moved}.md`;
        });
        if (next.some((source, index) => source !== sources[index])) {
            doc.set('sources', next);
            changed = true;
        }
    }
    if (!changed) {
        return text;
    }
    return `---\n${String(doc).trimEnd()}\n---${text.slice(match[0].length)}`;
}

function applyMoves(root: string, moves: Moves): void {
    if (new Set(moves.values()).size !== moves.size) {
        throw new Error('Mehrere Dateien hätten dasselbe Ziel');
    }
    for (const to of moves.values()) {
        if (existsSync(join(root, `${to}.md`))) {
            throw new Error(`Ziel existiert bereits: ${to}`);
        }
    }
    for (const [from, to] of moves) {
        moveFile(root, from, to);
    }
    const movedEntries = new Set([...moves.values()].filter((id) => id.startsWith('wiki/')));
    for (const entry of loadBrain(root).entries) {
        let text = replaceLinkTargets(entry.text, moves);
        text = updateFrontmatter(text, movedEntries.has(entry.id) ? entry.category : null, moves);
        if (text !== entry.text) {
            writeFileSync(join(root, entry.path), text, 'utf8');
        }
    }
}

function categoryMoves(root: string, from: string, to: string): Moves {
    const brain = loadBrain(root);
    const moves: Moves = new Map();
    for (const entry of brain.entries) {
        if (entry.category === from) {
            moves.set(entry.id, `wiki/${to}/${entry.id.split('/')[2]}`);
        }
    }
    for (const source of brain.sources) {
        if (source.category === from) {
            moves.set(source.id, `archive/${to}/${source.id.split('/').slice(2).join('/')}`);
        }
    }
    return moves;
}

function cleanup(root: string, category: string): void {
    removeEmptyDirs(join(root, 'wiki', category));
    removeEmptyDirs(join(root, 'archive', category));
}

export function renameCategory(root: string, from: string, to: string, now: Date): void {
    const categories = loadCategories(root);
    const category = categories.find((c) => c.slug === from);
    if (category === undefined) {
        throw new Error(`Unbekannte Kategorie: ${from}`);
    }
    if (!CATEGORY_SLUG_PATTERN.test(to)) {
        throw new Error(`Ungültiger Slug: ${to}`);
    }
    if (isKnownCategory(categories, to)) {
        throw new Error(`Kategorie existiert bereits: ${to}`);
    }
    applyMoves(root, categoryMoves(root, from, to));
    category.slug = to;
    saveCategories(root, categories);
    cleanup(root, from);
    appendLog(root, now, 'recategorize', `${from} → ${to}`, 'Kategorie umbenannt');
    runIndex(root);
}

export function mergeCategory(root: string, from: string, to: string, now: Date): void {
    const categories = loadCategories(root);
    if (from === to) {
        throw new Error('Quell- und Zielkategorie müssen verschieden sein');
    }
    if (!isKnownCategory(categories, from)) {
        throw new Error(`Unbekannte Kategorie: ${from}`);
    }
    if (to === UNCATEGORIZED || !isKnownCategory(categories, to)) {
        throw new Error(`Unbekannte Kategorie: ${to}`);
    }
    applyMoves(root, categoryMoves(root, from, to));
    if (from !== UNCATEGORIZED) {
        saveCategories(root, categories.filter((c) => c.slug !== from));
    }
    cleanup(root, from);
    appendLog(root, now, 'recategorize', `${from} → ${to}`, 'Kategorien zusammengelegt');
    runIndex(root);
}

export function moveEntry(root: string, entryInput: string, toCategory: string, now: Date): void {
    const id = toEntryId(root, entryInput);
    const fromCategory = id.split('/')[1];
    if (!isKnownCategory(loadCategories(root), toCategory)) {
        throw new Error(`Unbekannte Kategorie: ${toCategory}`);
    }
    if (fromCategory === toCategory) {
        throw new Error(`Eintrag liegt bereits in ${toCategory}`);
    }
    const brain = loadBrain(root);
    const entry = brain.entries.find((e) => e.id === id);
    if (entry === undefined) {
        throw new Error(`Eintrag nicht gefunden: ${entryInput}`);
    }
    const moves: Moves = new Map([[id, `wiki/${toCategory}/${id.split('/')[2]}`]]);
    const existingSources = new Set(brain.sources.map((source) => source.id));
    for (const source of sourceIds(entry)) {
        const shared = brain.entries.some((other) => other.id !== id && sourceIds(other).includes(source));
        if (existingSources.has(source) && !shared && source.split('/')[1] !== toCategory) {
            moves.set(source, `archive/${toCategory}/${source.split('/').slice(2).join('/')}`);
        }
    }
    applyMoves(root, moves);
    for (const source of moves.keys()) {
        if (source.startsWith('archive/')) {
            removeEmptyDirs(join(root, 'archive', source.split('/')[1]));
        }
    }
    appendLog(root, now, 'recategorize', `${id} → ${toCategory}`, 'Eintrag verschoben');
    runIndex(root);
}
```

In `scripts/src/cli.ts` – Import:
```ts
import { mergeCategory, moveEntry, renameCategory } from './recategorize.ts';
```
und `case` vor `default:`:
```ts
        case 'recategorize': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: {
                    rename: { type: 'boolean', default: false },
                    merge: { type: 'boolean', default: false },
                    move: { type: 'boolean', default: false },
                },
            });
            const modes = [values.rename, values.merge, values.move].filter((mode) => mode === true).length;
            if (modes !== 1 || positionals.length !== 2) {
                throw new Error(
                    'Verwendung: brain recategorize --rename <alt> <neu> | --merge <von> <nach> | --move <eintrag> <kategorie>',
                );
            }
            const [first, second] = positionals;
            if (values.rename === true) {
                renameCategory(root, first, second, now);
            } else if (values.merge === true) {
                mergeCategory(root, first, second, now);
            } else {
                moveEntry(root, first, second, now);
            }
            console.log('Umkategorisierung abgeschlossen');
            return 0;
        }
```

- [ ] **Step 4: Tests und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/f/second-brain
git add scripts/src/recategorize.ts scripts/src/cli.ts scripts/test/recategorize.test.ts
git commit -m "feat: add brain recategorize"
```

---

### Task 12: Workspace-Regeln, Slash-Commands, `brain` global verfügbar

**Files:**
- Create: `CLAUDE.md`, `wiki/CLAUDE.md`, `.claude/commands/ingest.md`, `.claude/commands/ask.md`

**Interfaces:**
- Consumes: alle `brain`-Befehle (Tasks 6–11), qmd-Collections `wiki`/`archive` (Task 13)
- Produces: Regeln und Abläufe für Claude Code; Befehl `brain` im `PATH`

- [ ] **Step 1: `brain` global verlinken und prüfen**

```bash
cd /mnt/f/second-brain/scripts && npm link
cd /mnt/f/second-brain && which brain && brain check
```
Expected: `which` zeigt einen Pfad; `brain check` gibt `Keine Fehler.` aus (leeres Brain, Repo vorhanden). Funktioniert `npm link` wegen Rechten nicht: wie in Task 1 Step 1 vorgehen (npm-Prefix im Home).

- [ ] **Step 2: Root-`CLAUDE.md` schreiben**

`CLAUDE.md`:
~~~markdown
# Second Brain – Workspace

Personal knowledge base for work and personal knowledge. Markdown files are the single source of truth.
Design and data contract: `docs/superpowers/specs/2026-10-03-second-brain-design.md` (section 4).

@INDEX.md

## Layout

- `inbox/` – raw notes waiting for `/ingest` (not in git)
- `archive/<category>/YYYY/MM/` – original notes, byte-identical, never edited or deleted
- `wiki/<category>/<entry>.md` – condensed knowledge entries; writing rules in `wiki/CLAUDE.md`
- `categories.yml` – the only allowed categories; `_uncategorized` is the reserved fallback
- `INDEX.md`, `graph.json` – derived by `brain index` (not in git)
- `LOG.md` – append-only change log, written only through `brain` (not in git)
- `scripts/` – the `brain` CLI (Node/TypeScript, tests: `npm --prefix scripts test`)

## Hard rules

- Never edit `INDEX.md` or `graph.json`. Run `brain index`.
- Never write `LOG.md` directly. Use `brain log`; the other `brain` commands log themselves.
- Never change or delete anything in `archive/`. Moving only via `brain recategorize`.
- Never create a category without explicit user approval. If none fits and none is approved, use `_uncategorized`.
- Never run `git push`.
- When the user dictates a note in the chat (outside `/ingest`), save it verbatim to `inbox/chat-note.md` (`chat-note-2.md`, … if taken) and run the `/ingest` flow.
- Language: everything machine-read is English (code, CLI, file names, frontmatter keys, markers like `## Related`, `## Sources`, `Conflict C-…`, `Unclear Q-…`, `Affects:`). Everything the user reads (titles, summaries, prose, callout text, answers) is German.

## brain CLI (run from the repo root)

| Command | Purpose |
|---|---|
| `brain archive <inbox-file> --category <slug>` | move a note into the archive, prints the archive path |
| `brain remember --category <slug> --title <t> --summary <s> --source <archive-path> [--related <entry> …] [--tags a,b] < body` | create a new entry and rebuild the index |
| `brain link <entry> <entry> […]` / `brain link --remove …` | set/remove symmetric `## Related` links |
| `brain log <op> <target> [<description>]` | append to `LOG.md` (ops: archive, create, update, link, unlink, conflict, resolve, recategorize, category, ingest) |
| `brain index` | rebuild `INDEX.md` and `graph.json` |
| `brain check` | errors (exit 1) and hints (open points, uncategorized entries) |
| `brain recategorize --rename a b \| --merge a b \| --move <entry> <category>` | only when the user asks |

## Brain-first protocol (retrieval ladder)

For every knowledge question, follow exactly:

1. Derive keywords from the question.
2. Score candidates with `INDEX.md` and qmd `query` on collection `wiki` – do NOT open files yet. Use collection `archive` or both only when explicitly requested.
3. Open exactly ONE top file.
4. Read only the relevant section (Referenz-Map and headings).
5. Follow at most ONE pointer (`[[link]]`, a `## Related` entry or a `sources` path).
6. Answer only from what was read, with `[[…]]` source links. If that is not enough: "Dazu steht nichts in deinem Brain."

Writing entries: see `wiki/CLAUDE.md`.
~~~

- [ ] **Step 3: `wiki/CLAUDE.md` schreiben**

`wiki/CLAUDE.md`:
~~~markdown
# Writing rules for knowledge entries

Applies to every file in `wiki/<category>/`. Format: spec section 4.3.

## Creating and linking

- Create new entries ONLY with `brain remember`. The body comes via stdin, without the `# Title` heading and without `## Sources` (the CLI writes both).
- Set or remove relations ONLY with `brain link a b [c …]` / `brain link --remove a b`. Never edit `## Related` by hand.
- After every new or changed entry, look for related entries (INDEX.md, qmd `query` on `wiki`) and link them – also across categories.
- Exactly one category per entry; if unclear, choose the main topic and link the rest.

## Condense, don't append

- Integrate new information into the existing text; merge duplicates; replace outdated statements (the old source stays in `sources`).
- No "Update vom …" sections, no changelogs inside entries.
- One entry = one topic. If an entry grows large or covers several topics, propose a split to the user.
- When editing an entry: add the new archive path to `sources` (with `.md`) and to `## Sources` (without `.md`), set `updated` to today, adjust `summary` if needed (exactly one German sentence, one line).

## Conflicts and unclear points

- First ask the user. Only if it cannot be resolved now, add a callout directly below the `# Title` in EVERY affected entry, with identical ID and identical `Affects:` line:

      > [!warning] Conflict C-YYYYMMDD-N
      > Affects: [[wiki/a/x]], [[wiki/b/y]]
      > <German description with source links>

  Use `> [!question] Unclear Q-YYYYMMDD-N` for unclear points. N counts up per day; check that the ID is unused: `grep -rn "C-YYYYMMDD-" wiki/`.
- Resolving: fix the content and remove the callout with that ID from ALL affected entries.
- `brain check` enforces consistency.

## Logging

- After each own edit of an entry: `brain log update <entry> "<German description>"`.
- New open point: `brain log conflict <id> "<description>"`; resolved: `brain log resolve <id> "<description>"`.
- Approved new category: `brain log category <slug> "<name>"`.

## Content

- German prose, technical terms in the original language.
- Never copy secrets (passwords, tokens, keys) into entries – tell the user instead.
- Links always as full path from the repo root without `.md`: `[[wiki/category/entry]]`, `[[wiki/category/entry#Heading]]`.
~~~

- [ ] **Step 4: `.claude/commands/ingest.md` schreiben**

`.claude/commands/ingest.md`:
~~~markdown
---
description: Process all notes in inbox/ into the wiki
argument-hint: [note text to add first]
---

Process the inbox following `CLAUDE.md` and `wiki/CLAUDE.md`. Talk to the user in German.

If `$ARGUMENTS` is not empty, first save it verbatim as `inbox/chat-note.md` (`chat-note-2.md`, … if taken); `brain archive` adds the timestamp later.

## 1. Preflight – stop on failure

1. `git status --porcelain` must be empty. Otherwise stop and show the output.
2. `brain check` must exit 0. Otherwise stop and show the report.
3. `brain index`
4. `ls -tr inbox/` (ignore `.gitkeep`). Empty → say "Nichts zu tun." and stop. Files other than `.md`/`.txt` stay in the inbox; mention them.

## 2. Per note, oldest first

1. Read the note. Choose exactly one category from `categories.yml` (main topic wins).
   If none fits: stop and ask the user (AskUserQuestion) – propose a new category (slug, German name, one-sentence description) and the best existing one.
   - New category approved → append it to `categories.yml`, then `brain log category <slug> "<name>"`.
   - Nothing approved → `_uncategorized`.
2. `brain archive inbox/<file> --category <slug>` → keep the printed archive path.
3. Find related knowledge with steps 1–2 of the retrieval ladder (INDEX.md + qmd `query` on `wiki`). If qmd is unavailable, continue with INDEX.md and grep and tell the user.
4. Integrate according to `wiki/CLAUDE.md`:
   - existing topic → edit the entry (condense), add the source, then `brain log update …`
   - new topic → `brain remember --category … --title "…" --summary "…" --source <archive-path> [--related …] <<'EOF'` … `EOF`
   - relations → `brain link …`
5. Conflicts or unclear points → ask the user; if unresolved, add callouts to all affected entries and `brain log conflict …`.
6. Secrets → do not copy them; tell the user.

## 3. Finish

1. `brain index`
2. `brain check` – on errors caused in this run: fix them. Otherwise stop WITHOUT commit and show the report.
3. `qmd update && qmd embed`
4. Summary for the user: new entries, changed entries, new links, hints from `brain check` (open points, uncategorized entries).
5. `brain log ingest "<n> Notizen" "<categories>"`
6. `git add -A && git commit -m "ingest: <n> Notizen – <topics>"`. Never push.

## Recovery after an abort

Explain to the user: the original is already archived (not committed); `git status` / `git diff` show the state; to retry run `git restore wiki/ categories.yml`, remove new entries (`git clean -n wiki/` shows them, `git clean -f wiki/` deletes them), move the archived file back to `inbox/`, run `brain index`.
~~~

- [ ] **Step 5: `.claude/commands/ask.md` schreiben**

`.claude/commands/ask.md`:
~~~markdown
---
description: Ask the second brain – answers only from the brain
argument-hint: [--archive | --all] <Frage>
---

Answer the question using ONLY the brain. Read-only: no `brain index`, no `brain check`, no `qmd update`, no file changes, no log entries.

Input: `$ARGUMENTS`

- starts with `--archive` → search collection `archive` only
- starts with `--all` → search collections `wiki` and `archive`
- otherwise → collection `wiki` (switch only if the question explicitly asks for the archive or for everything)

If `INDEX.md` does not exist, tell the user to run `brain index` once and stop.

Follow the retrieval ladder from `CLAUDE.md` exactly:

1. Derive keywords.
2. Score with `INDEX.md` and qmd `query` (chosen collection) without opening files.
3. Open exactly ONE top file.
4. Read only the relevant section.
5. Follow at most ONE pointer.
6. Answer.

Answer in German. Every statement gets a `[[…]]` source link. For answers from the archive, say that originals may be outdated by the wiki.
If nothing fits: answer "Dazu steht nichts in deinem Brain." and optionally name nearby entries from `INDEX.md`. Never fill gaps with general knowledge.
If qmd is unavailable, say so instead of silently answering with less.
~~~

- [ ] **Step 6: Obsidian-Linkformat vorbelegen**

Damit in Obsidian eingefügte Links vollständige Pfade sind (`.obsidian/` ist git-ignoriert, die Datei bleibt lokal):
```bash
mkdir -p /mnt/f/second-brain/.obsidian
[ -f /mnt/f/second-brain/.obsidian/app.json ] || printf '{\n  "newLinkFormat": "absolute",\n  "useMarkdownLinks": false\n}\n' > /mnt/f/second-brain/.obsidian/app.json
cat /mnt/f/second-brain/.obsidian/app.json
```
Existiert die Datei schon (Vault war bereits offen): in Obsidian unter Einstellungen → Dateien & Links „Format für neue Links“ = „Absoluter Pfad im Vault“ und „Wikilinks verwenden“ = an setzen.

- [ ] **Step 7: Prüfen und committen**

```bash
cd /mnt/f/second-brain && brain check && git status --short
git add CLAUDE.md wiki/CLAUDE.md .claude/commands/ingest.md .claude/commands/ask.md
git commit -m "docs: add workspace rules and ingest/ask commands"
```
Expected: `brain check` → `Keine Fehler.` (`wiki/CLAUDE.md` wird ignoriert).

---

### Task 13: qmd einrichten (Collections, Kontexte, Modell, Plugin)

**Files:**
- Modify: `docs/superpowers/notes/2026-10-03-qmd-spike.md` (Abschnitt „Einrichtung“ ergänzen)

**Interfaces:**
- Consumes: Ergebnisse aus Task 1 (GPU-Backend, Konfigurationsort)
- Produces: qmd-Collections `wiki` und `archive`, MCP-Anbindung in Claude Code

- [ ] **Step 1: Embedding-Modell dauerhaft setzen**

Gemäß Spike-Notiz: `models.embed: "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"` in die qmd-Konfigurationsdatei eintragen. Falls nur per Umgebungsvariable möglich: in `~/.zshrc` ergänzen:
```bash
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"
```
Ebenso eine im Spike nötige GPU-Variable (`QMD_LLAMA_GPU=…`). Danach neue Shell bzw. `source ~/.zshrc`.

- [ ] **Step 2: Collections anlegen**

```bash
qmd collection add /mnt/f/second-brain/wiki --name wiki --mask "*/*.md"
qmd collection add /mnt/f/second-brain/archive --name archive --mask "**/*.md"
qmd collection list
```
Die Maske `*/*.md` erfasst nur `wiki/<kategorie>/<eintrag>.md` und schließt damit `wiki/CLAUDE.md` aus.
Expected: zwei Collections `wiki` und `archive` mit Pfaden unter `/mnt/f/second-brain`. Der Index liegt weiterhin in `~/.cache/qmd/` (mit `qmd status` prüfen; **kein** `qmd init` im Repo ausführen, das würde `.qmd/index.sqlite` auf `/mnt/f` anlegen).

- [ ] **Step 3: Kontexte setzen**

```bash
qmd context add qmd://wiki "Verdichtete, aktuelle Wissenseinträge (Deutsch), gegliedert nach Kategorien in Unterordnern. Primäre Quelle für Antworten."
qmd context add qmd://archive "Originalnotizen (Deutsch), unverdichtet und unverändert archiviert; können durch das Wiki überholt sein."
qmd context list
```

- [ ] **Step 4: Indexieren**

```bash
qmd update && qmd embed
qmd status
```
Expected: Status zeigt beide Collections; bei noch leerem Brain 0 Dokumente – das ist korrekt.

**Masken-Prüfung** (nach dem ersten `/ingest` in Task 14 wiederholen, sobald Einträge existieren):
```bash
qmd search "Writing rules" -c wiki
```
Expected: kein Treffer auf `CLAUDE.md`. Wird `wiki/CLAUDE.md` gefunden, die Collection neu anlegen (`qmd collection remove wiki`) und statt der Maske ein `ignore: ['CLAUDE.md']` für die Collection `wiki` in der qmd-Konfigurationsdatei (`index.yml`, Ort laut Spike-Notiz) setzen, dann `qmd update && qmd embed`.

- [ ] **Step 5: MCP-Anbindung in Claude Code**

```bash
claude plugin install qmd@qmd
```
Falls der Marketplace unbekannt ist: zuerst `claude plugin marketplace add tobi/qmd`, dann erneut installieren. Falls das Plugin nicht verfügbar ist, Fallback (projektlokal, standardkonform) – `.mcp.json` im Repo:
```json
{
  "mcpServers": {
    "qmd": {
      "command": "qmd",
      "args": ["mcp"]
    }
  }
}
```
Nach Neustart von Claude Code mit `/mcp` prüfen: Server `qmd` verbunden, Tools `query`, `get`, `multi_get`, `status` vorhanden.

- [ ] **Step 6: Dokumentieren und committen**

In `docs/superpowers/notes/2026-10-03-qmd-spike.md` einen Abschnitt `## Einrichtung` mit den tatsächlich ausgeführten Befehlen (Collections, Kontexte, Modell-Einstellung, Plugin oder `.mcp.json`) ergänzen.
```bash
cd /mnt/f/second-brain
git add docs/superpowers/notes/2026-10-03-qmd-spike.md
git add .mcp.json 2>/dev/null || true
git commit -m "docs: record qmd setup for wiki and archive collections"
```

---

### Task 14: End-to-End-Abnahme (manuell, mit dem Nutzer)

**Files:**
- Create: `docs/superpowers/notes/2026-10-03-e2e-acceptance.md`

**Interfaces:**
- Consumes: alles
- Produces: Abnahmeprotokoll

- [ ] **Step 1: Vollständige Testsuite und Typprüfung**

Run: `cd /mnt/f/second-brain/scripts && npm test && npm run typecheck`
Expected: alle Tests PASS, keine tsc-Fehler.

- [ ] **Step 2: Echte Notizen vorbereiten (mit dem Nutzer)**

Den Nutzer bitten, 3–4 echte Notizen in `inbox/` zu legen, und zwar:
1. eine, die eine **neue Kategorie** erfordert (Vorschlag freigeben),
2. eine weitere, die eine neue Kategorie erfordern würde (Vorschlag **ablehnen** → `_uncategorized`),
3. eine, die einem bestehenden Eintrag **widerspricht** (nach dem ersten Ingest hinzufügen),
4. eine, die mit einem bestehenden Eintrag **zusammenhängt**.

- [ ] **Step 3: `/ingest` ausführen und prüfen**

Nach `/ingest`:
```bash
cd /mnt/f/second-brain
brain check
git log --oneline -3
cat LOG.md
grep -rn "Conflict C-\|Unclear Q-" wiki/ || true
```
Expected: `brain check` ohne Fehler, Hinweise zeigen offene Punkte und `_uncategorized`-Einträge; Commit `ingest: …` vorhanden, kein Push; `LOG.md` enthält `archive`, `create`/`update`, `link`, `category`, `ingest`; ein Widerspruchs-Callout steht in **allen** betroffenen Einträgen; Verwandt-Links stehen beidseitig.

- [ ] **Step 4: `/ask` und Direktsuche prüfen**

1. `/ask <Frage, deren Antwort im Brain steht>` → Antwort mit `[[…]]`-Quelle, genau eine Datei geöffnet.
2. `/ask <Frage, die nicht im Brain steht>` → „Dazu steht nichts in deinem Brain.“
3. `/ask --archive <Frage>` → Antwort aus dem Archiv mit Hinweis auf mögliche Veraltung.
4. Zeiten messen:
```bash
time qmd search "<stichwort>" -c wiki
time qmd search "<stichwort>" -c archive
time qmd search "<stichwort>"
time qmd query "<frage>" -c wiki
```
Expected: `search` im Sekundenbereich, Treffer passend zur Collection.

- [ ] **Step 5: Umkategorisieren prüfen**

Den `_uncategorized`-Eintrag mit Zustimmung des Nutzers verschieben:
```bash
brain recategorize --move wiki/_uncategorized/<eintrag> <kategorie>
brain check
git status --short
```
Expected: `brain check` ohne Fehler; `git status` zeigt `R` für die Archivdatei; Links in anderen Einträgen zeigen auf den neuen Pfad. Danach committen: `git add -A && git commit -m "chore: categorize <eintrag>"`.

- [ ] **Step 6: Obsidian-Verträglichkeit prüfen (mit dem Nutzer)**

Den Nutzer bitten, `F:\second-brain` in Obsidian als Vault zu öffnen, in einem Eintrag per Autovervollständigung einen Link auf einen anderen Eintrag einzufügen und zu speichern. Danach:
```bash
cd /mnt/f/second-brain && git status --short && brain check
```
Expected: `git status` zeigt nur die geänderte Eintragsdatei (kein `.obsidian/`); der neue Link hat die Form `[[wiki/<kategorie>/<eintrag>]]`; `brain check` ohne Fehler. Anschließend `brain log update <eintrag> "Link in Obsidian ergänzt"` und committen. Zusätzlich die Masken-Prüfung aus Task 13 wiederholen.

- [ ] **Step 7: Abnahmeprotokoll schreiben und committen**

`docs/superpowers/notes/2026-10-03-e2e-acceptance.md`: je Prüfpunkt aus Steps 3–6 „erfüllt / nicht erfüllt“ mit kurzer Beobachtung und den gemessenen Zeiten.
```bash
git add docs/superpowers/notes/2026-10-03-e2e-acceptance.md
git commit -m "docs: record end-to-end acceptance"
```
