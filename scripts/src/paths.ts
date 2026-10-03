import { isAbsolute, relative, resolve, sep } from 'node:path';

export function brainRoot(): string {
    return process.env.BRAIN_ROOT ?? resolve(import.meta.dirname, '..', '..');
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
