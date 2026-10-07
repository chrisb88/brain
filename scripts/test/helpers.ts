import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installPushGuard } from '../src/guard.ts';

delete process.env.BRAIN_SEARCH;
delete process.env.INDEX_PATH;

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

export const BRAIN_YML = 'path: .\nmode: project\n';

export function emptyDir(): string {
    return mkdtempSync(join(tmpdir(), 'empty-'));
}

export function makeBrain(files: Record<string, string> = {}, parent = tmpdir()): string {
    const root = mkdtempSync(join(parent, 'brain-'));
    writeFile(root, 'brain.yml', BRAIN_YML);
    for (const [rel, content] of Object.entries(files)) {
        writeFile(root, rel, content);
    }
    return root;
}

/** Project repository (not yet a git repo) with brain.yml at its root and the valid test brain in <path>. */
export function projectWithBrain(path = 'knowledge'): { repo: string; brain: string } {
    const repo = mkdtempSync(join(tmpdir(), 'project-'));
    writeFile(repo, 'brain.yml', `path: ${JSON.stringify(path)}\nmode: project\n`);
    writeFile(repo, 'README.md', '# Project\n');
    const source = validBrain();
    const brain = join(repo, path);
    cpSync(source, brain, { recursive: true });
    rmSync(join(brain, 'brain.yml'));
    return { repo, brain };
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

export function validBrain(extra: Record<string, string> = {}, parent = tmpdir()): string {
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
    }, parent);
}

/** Directory on the repository drive (case-insensitive on /mnt/f), or null if that drive is case-sensitive. */
export function caseInsensitiveParent(): string | null {
    const parent = join(import.meta.dirname, '..', 'node_modules', '.brain-test');
    rmSync(parent, { recursive: true, force: true });
    mkdirSync(parent, { recursive: true });
    const probe = mkdtempSync(join(parent, 'probe-'));
    writeFileSync(join(probe, 'a.txt'), '');
    return existsSync(join(probe, 'A.TXT')) ? parent : null;
}

export function git(root: string, ...args: string[]): string {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

export function initGit(root: string): void {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'core.autocrlf', 'false');
    installPushGuard(root);
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

export function runCli(root: string, args: string[], input = '', cwd = root, envOverrides: Record<string, string> = {}): CliResult {
    const cli = join(import.meta.dirname, '..', 'src', 'cli.ts');
    const env: Record<string, string | undefined> = { ...process.env, BRAIN_ROOT: root, INIT_CWD: cwd };
    delete env.CLAUDE_PROJECT_DIR;
    for (const [key, value] of Object.entries(envOverrides)) {
        if (value === '') {
            delete env[key];
        } else {
            env[key] = value;
        }
    }
    const result = spawnSync(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', cli, ...args],
        { cwd, env, input, encoding: 'utf8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
