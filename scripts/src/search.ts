export const SEARCH_LEVELS = ['hybrid', 'keyword', 'off'] as const;
export type SearchLevel = (typeof SEARCH_LEVELS)[number];

/** Search level of this machine from BRAIN_SEARCH; default hybrid. */
export function searchLevel(value: string | undefined = process.env.BRAIN_SEARCH): SearchLevel {
    const level = (value ?? '').trim().toLowerCase();
    if (level === '') {
        return 'hybrid';
    }
    if (!(SEARCH_LEVELS as readonly string[]).includes(level)) {
        throw new Error(`BRAIN_SEARCH=${value} ist ungültig – erlaubt: ${SEARCH_LEVELS.join(', ')}`);
    }
    return level as SearchLevel;
}
