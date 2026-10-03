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
