const UMLAUTS: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

/** Builds a file-name slug; returns the fallback when nothing usable is left. */
export function slugify(input: string, fallback = 'note'): string {
    const slug = input
        .toLowerCase()
        .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug === '' ? fallback : slug;
}
