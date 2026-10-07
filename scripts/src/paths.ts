import { readdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/** Directory the user called brain from: INIT_CWD only inside npm scripts (npm sets it for all children). */
export function callerDir(): string {
    const initCwd = process.env.INIT_CWD;
    return process.env.npm_lifecycle_event !== undefined && initCwd !== undefined && initCwd !== '' ? initCwd : process.cwd();
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
