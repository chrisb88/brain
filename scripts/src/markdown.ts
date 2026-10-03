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
const CALLOUT_HEAD = /^>\s*\[!([^\]]*)\]([+-]?)\s*(.*)$/;
const CALLOUT_TITLE = /^(?:Conflict (C-\d{8}-\d+)|Unclear (Q-\d{8}-\d+))$/;
const AFFECTS = /^>\s*Affects:\s*(.*)$/;
const FENCE_OPEN = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

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

/** Marks every line that belongs to a fenced code block (fence lines included); unclosed fences run to the end. */
function codeMask(lines: string[]): boolean[] {
    const mask: boolean[] = [];
    let open: { char: string; length: number } | null = null;
    for (const line of lines) {
        if (open !== null) {
            mask.push(true);
            const close = FENCE_CLOSE.exec(line);
            if (close !== null && close[1][0] === open.char && close[1].length >= open.length) {
                open = null;
            }
            continue;
        }
        const fence = FENCE_OPEN.exec(line);
        if (fence !== null && !(fence[1][0] === '`' && fence[2].includes('`'))) {
            open = { char: fence[1][0], length: fence[1].length };
            mask.push(true);
            continue;
        }
        mask.push(false);
    }
    return mask;
}

/** Removes inline code spans; a span is closed by a backtick run of exactly the same length. */
function stripInlineCode(line: string): string {
    let result = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] !== '`') {
            result += line[i];
            i++;
            continue;
        }
        let length = 0;
        while (line[i + length] === '`') {
            length++;
        }
        let j = i + length;
        let close = -1;
        while (j < line.length) {
            const k = line.indexOf('`', j);
            if (k === -1) {
                break;
            }
            let end = k;
            while (line[end] === '`') {
                end++;
            }
            if (end - k === length) {
                close = k;
                break;
            }
            j = end;
        }
        if (close === -1) {
            result += '`'.repeat(length);
            i += length;
        } else {
            i = close + length;
        }
    }
    return result;
}

/** Removes fenced code blocks and inline code so that their content is never treated as markup. */
export function stripCode(text: string): string {
    const lines = text.split(/\r?\n/);
    const mask = codeMask(lines);
    return lines.map((line, index) => (mask[index] ? '' : stripInlineCode(line))).join('\n');
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
    const lines = text.split('\n');
    const mask = codeMask(lines);
    return lines.map((line, index) => {
        if (mask[index]) {
            return line;
        }
        return line.replace(LINK, (raw: string, target: string, anchor?: string, alias?: string) => {
            const next = map.get(normalizeId(target));
            if (next === undefined) {
                return raw;
            }
            return `[[${next}${anchor !== undefined ? `#${anchor}` : ''}${alias !== undefined ? `|${alias}` : ''}]]`;
        });
    }).join('\n');
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
    const mask = codeMask(lines);
    const heading = new RegExp(`^## ${title}\\s*$`);
    const start = lines.findIndex((line, index) => !mask[index] && heading.test(line));
    if (start === -1) {
        return null;
    }
    for (let i = start + 1; i < lines.length; i++) {
        if (!mask[i] && /^#{1,2}\s/.test(lines[i])) {
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
    const mask = codeMask(lines);
    const points: OpenPoint[] = [];
    const malformed: string[] = [];
    lines.forEach((line, index) => {
        const head = mask[index] ? null : CALLOUT_HEAD.exec(line);
        if (head === null) {
            return;
        }
        const title = head[3].trim();
        if (!/^(conflict|unclear)\b/i.test(title)) {
            return;
        }
        const valid = CALLOUT_TITLE.exec(title);
        const expectedType = /^conflict/i.test(title) ? 'warning' : 'question';
        if (valid === null || head[1] !== expectedType || head[2] !== '') {
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
