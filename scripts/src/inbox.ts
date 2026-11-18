import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BrainInbox } from './config.ts';

interface Note {
    rel: string;
    name: string;
    mtime: number;
    /** Committer time (seconds) of the commit that added the note; null when not committed or unknown. */
    added: number | null;
}

/** Committer time of the latest commit that added the file, or null (not committed, no git, no history). */
function addCommitTime(root: string, rel: string): number | null {
    try {
        const output = execFileSync(
            'git',
            ['--literal-pathspecs', '-C', root, 'log', '--diff-filter=A', '--format=%ct', '-1', '--', rel],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
        return output === '' ? null : Number(output);
    } catch {
        return null;
    }
}

function compareNames(a: Note, b: Note): number {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Lists the notes in inbox/ (relative to the knowledge folder, without .gitkeep), oldest first.
 * local: by modification time. committed: by the time the note was added to Git, so the order does not
 * depend on the checkout; notes that are not committed yet follow, by modification time. Ties: file name.
 */
export function listInbox(root: string, inbox: BrainInbox): string[] {
    const notes: Note[] = [];
    for (const dirent of readdirSync(join(root, 'inbox'), { withFileTypes: true })) {
        if (!dirent.isFile() || dirent.name === '.gitkeep') {
            continue;
        }
        const rel = `inbox/${dirent.name}`;
        notes.push({
            rel,
            name: dirent.name,
            mtime: statSync(join(root, rel)).mtimeMs,
            added: inbox === 'committed' ? addCommitTime(root, rel) : null,
        });
    }
    notes.sort((a, b) => {
        if (a.added !== null && b.added !== null) {
            return a.added - b.added || compareNames(a, b);
        }
        if (a.added !== null || b.added !== null) {
            return a.added !== null ? -1 : 1;
        }
        return a.mtime - b.mtime || compareNames(a, b);
    });
    return notes.map((note) => note.rel);
}
