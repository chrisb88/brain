import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Returns BRAIN_ROOT, or the first directory (walking up from each start) that contains categories.yml. */
export function findBrainRoot(starts: string[], envRoot: string | undefined): string | null {
    if (envRoot !== undefined && envRoot !== '') {
        return resolve(envRoot);
    }
    for (const start of starts) {
        let dir = resolve(start);
        for (;;) {
            if (existsSync(join(dir, 'categories.yml'))) {
                return dir;
            }
            const parent = dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }
    return null;
}

export function brainRoot(): string {
    const starts = [process.env.INIT_CWD ?? process.cwd(), process.env.CLAUDE_PROJECT_DIR]
        .filter((start): start is string => start !== undefined && start !== '');
    const root = findBrainRoot(starts, process.env.BRAIN_ROOT);
    if (root === null) {
        throw new Error('Kein Brain gefunden – im Daten-Repo ausführen oder BRAIN_ROOT setzen.');
    }
    return root;
}

export function toPosix(path: string): string {
    return path.split(sep).join('/');
}

/** Normalizes an entry or source id: posix separators, no leading "./", no ".md" suffix. */
export function normalizeId(input: string): string {
    return input.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.md$/i, '');
}

export function hasParentSegment(id: string): boolean {
    return id.split('/').includes('..');
}

/** Returns the root-relative posix path of an absolute path, or null if it is not inside root. */
export function relativeInside(root: string, absolute: string): string | null {
    const rel = relative(root, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        return null;
    }
    return toPosix(rel);
}

/** Like existsSync, but every segment must match the on-disk name exactly (Windows drives ignore case). */
export function existsExactCase(root: string, rel: string): boolean {
    let dir = root;
    for (const segment of rel.split('/')) {
        let names: string[];
        try {
            names = readdirSync(dir);
        } catch {
            return false;
        }
        if (!names.includes(segment)) {
            return false;
        }
        dir = join(dir, segment);
    }
    return true;
}
