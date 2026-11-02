import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isKnownCategory, UNCATEGORIZED } from './categories.ts';
import type { BrainMode } from './config.ts';
import { archiveIntegrityErrors, isGitRepo, uncommittedChanges } from './git.ts';
import { hasPushGuard, pushGuardErrors } from './guard.ts';
import { qmdCheck } from './qmd.ts';
import { extractLinks, getRelated, headings, parseOpenPoints, splitFrontmatter } from './markdown.ts';
import { existsExactCase, hasParentSegment, normalizeId } from './paths.ts';
import { type Brain, type Entry, loadBrain, relatedIds } from './scan.ts';
import { searchLevel, type SearchLevel } from './search.ts';

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
        if (!id.startsWith('archive/') || hasParentSegment(id) || !existsExactCase(brain.root, `${id}.md`)) {
            errors.push(`${path}: Quelle nicht gefunden: ${String(source)}`);
        }
    }
}

function checkLinks(brain: Brain, entry: Entry, errors: string[]): void {
    for (const link of extractLinks(entry.body)) {
        const target = normalizeId(link.target);
        const file = join(brain.root, `${target}.md`);
        if (hasParentSegment(target) || !existsExactCase(brain.root, `${target}.md`)) {
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

export function checkBrain(
    root: string,
    mode: BrainMode = 'project',
    level: SearchLevel = searchLevel(),
    pushGuard: boolean = mode === 'private',
): CheckReport {
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
        if (pushGuard) {
            errors.push(...pushGuardErrors(root));
        } else if (mode === 'private' && hasPushGuard(root)) {
            hints.push('Push-Schutz noch installiert, obwohl push_guard: false – brain init --update ausführen');
        }
        const changed = uncommittedChanges(root);
        if (changed.length > 0) {
            hints.push(`Nicht committete Änderungen im Wissens-Ordner (${changed.length} Datei(en)) – prüfen und committen`);
        }
    } else {
        hints.push('Kein Git-Repository – Archiv-Integrität wurde nicht geprüft.');
    }
    for (const entry of brain.entries) {
        if (entry.category === UNCATEGORIZED) {
            hints.push(`Ohne Kategorie: ${entry.id} – bitte kategorisieren (brain recategorize --move ${entry.id} <kategorie>)`);
        }
    }
    const qmd = qmdCheck(root, level);
    errors.push(...qmd.errors);
    hints.push(...qmd.hints);
    return { errors, hints };
}
