import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { isKnownCategory, loadCategories } from './categories.ts';
import { runIndex } from './indexer.ts';
import { linkEntries, toEntryId } from './link.ts';
import { appendLog } from './log.ts';
import { existsExactCase, hasParentSegment, normalizeId } from './paths.ts';
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
    if (!id.startsWith('archive/') || hasParentSegment(id) || !existsExactCase(root, `${id}.md`)) {
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
