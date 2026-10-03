import {
    CATEGORY_SLUG_PATTERN,
    loadCategories,
    saveCategories,
    UNCATEGORIZED,
    UNCATEGORIZED_NAME,
} from './categories.ts';
import { runIndex } from './indexer.ts';
import { appendLog } from './log.ts';
import { loadBrain } from './scan.ts';

/** Registers a new category; must only be called after the user approved it. */
export function addCategory(root: string, slug: string, name: string, description: string, now: Date): void {
    if (!CATEGORY_SLUG_PATTERN.test(slug)) {
        throw new Error(`Ungültiger Slug: ${slug} (erlaubt: a-z, 0-9, -; nicht mit - beginnend)`);
    }
    const categories = loadCategories(root);
    if (categories.some((category) => category.slug === slug)) {
        throw new Error(`Kategorie existiert bereits: ${slug}`);
    }
    const trimmedName = name.trim();
    if (trimmedName === '') {
        throw new Error('Name fehlt');
    }
    saveCategories(root, [...categories, { slug, name: trimmedName, description: description.trim() }]);
    appendLog(root, now, 'category', slug, trimmedName);
    runIndex(root);
}

function countLabel(count: number): string {
    return count === 1 ? '1 Eintrag' : `${count} Einträge`;
}

export function listCategories(root: string): string {
    const brain = loadBrain(root);
    const counts = new Map<string, number>();
    for (const entry of brain.entries) {
        counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    const lines = brain.categories.map((category) => {
        const head = `${category.slug} – ${category.name} (${countLabel(counts.get(category.slug) ?? 0)})`;
        return category.description === '' ? head : `${head}: ${category.description}`;
    });
    const uncategorized = counts.get(UNCATEGORIZED) ?? 0;
    if (uncategorized > 0) {
        lines.push(`${UNCATEGORIZED} – ${UNCATEGORIZED_NAME} (${countLabel(uncategorized)})`);
    }
    return lines.length === 0 ? 'Noch keine Kategorien angelegt.' : lines.join('\n');
}
