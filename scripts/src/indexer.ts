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
