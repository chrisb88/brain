import { readSync } from 'node:fs';
import type { BrainMode } from './config.ts';

/** Reads one line from stdin synchronously (only call when stdin is a terminal). */
export function promptLine(question: string): string {
    process.stdout.write(question);
    const bytes: number[] = [];
    const buffer = Buffer.alloc(1);
    for (;;) {
        let read: number;
        try {
            read = readSync(0, buffer, 0, 1, null);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EAGAIN') {
                continue;
            }
            throw error;
        }
        if (read === 0 || buffer[0] === 0x0a) {
            break;
        }
        bytes.push(buffer[0]);
    }
    return Buffer.from(bytes).toString('utf8').replace(/\r$/, '').trim();
}

/** Parses a yes/no answer: empty → fallback, y/yes/j/ja → true, n/no/nein → false, anything else → null. */
export function parseYesNo(answer: string, fallback: boolean): boolean | null {
    const value = answer.trim().toLowerCase();
    if (value === '') {
        return fallback;
    }
    if (['y', 'yes', 'j', 'ja'].includes(value)) {
        return true;
    }
    if (['n', 'no', 'nein'].includes(value)) {
        return false;
    }
    return null;
}

/** Parses the mode answer: project/projekt → project, private/privat → private, anything else → null. */
export function parseMode(answer: string): BrainMode | null {
    const value = answer.trim().toLowerCase();
    if (value === 'project' || value === 'projekt') {
        return 'project';
    }
    if (value === 'private' || value === 'privat') {
        return 'private';
    }
    return null;
}
