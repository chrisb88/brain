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
