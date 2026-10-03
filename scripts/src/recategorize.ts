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
