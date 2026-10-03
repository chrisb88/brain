import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendLog } from './log.ts';
import { getRelated, setRelated } from './markdown.ts';
import { hasParentSegment, normalizeId } from './paths.ts';

export function toEntryId(root: string, input: string): string {
    const id = normalizeId(input);
    const parts = id.split('/');
    if (parts.length !== 3 || parts[0] !== 'wiki' || hasParentSegment(id)) {
        throw new Error(`Kein gültiger Eintrag (erwartet wiki/<kategorie>/<eintrag>): ${input}`);
    }
    if (!existsSync(join(root, `${id}.md`))) {
        throw new Error(`Eintrag nicht gefunden: ${input}`);
    }
    return id;
}

/** Adds or removes the related relation between all given entries, on every side. */
export function linkEntries(root: string, inputs: string[], remove: boolean, now: Date): number {
    const ids = [...new Set(inputs.map((input) => toEntryId(root, input)))].sort();
    if (ids.length < 2) {
        throw new Error('Mindestens zwei verschiedene Einträge angeben');
    }
    const texts = new Map(ids.map((id) => [id, readFileSync(join(root, `${id}.md`), 'utf8')]));
    const before = new Map(ids.map((id) => [
        id,
        new Set(getRelated(texts.get(id) ?? '').map((link) => normalizeId(link.target))),
    ]));
    const changedPairs: string[] = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = ids[i];
            const b = ids[j];
            const linked = (before.get(a)?.has(b) ?? false) && (before.get(b)?.has(a) ?? false);
            const partlyLinked = (before.get(a)?.has(b) ?? false) || (before.get(b)?.has(a) ?? false);
            if (remove ? partlyLinked : !linked) {
                changedPairs.push(`${a} ↔ ${b}`);
            }
        }
    }
    for (const id of ids) {
        const next = new Set(before.get(id));
        for (const other of ids) {
            if (other !== id) {
                if (remove) {
                    next.delete(other);
                } else {
                    next.add(other);
                }
            }
        }
        const text = texts.get(id) ?? '';
        const updated = setRelated(text, [...next]);
        if (updated !== text) {
            writeFileSync(join(root, `${id}.md`), updated, 'utf8');
        }
    }
    for (const pair of changedPairs) {
        appendLog(root, now, remove ? 'unlink' : 'link', pair);
    }
    return changedPairs.length;
}
