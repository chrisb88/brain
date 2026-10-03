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
