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
