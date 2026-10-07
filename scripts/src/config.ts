import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { callerDir, relativeInside } from './paths.ts';

export const CONFIG_FILE = 'brain.yml';
export const BRAIN_MODES = ['project', 'private'] as const;
export type BrainMode = (typeof BRAIN_MODES)[number];

export interface BrainConfig {
    /** Directory that contains brain.yml (root of the knowledge repository). */
    configRoot: string;
    /** Knowledge folder with categories.yml, wiki/, archive/ and inbox/. */
    brainDir: string;
    /** Knowledge folder relative to configRoot (posix), "." for configRoot itself. */
    path: string;
    mode: BrainMode;
}

const KEYS = ['path', 'mode'];

function isMode(value: unknown): value is BrainMode {
    return typeof value === 'string' && (BRAIN_MODES as readonly string[]).includes(value);
}

export function loadBrainConfig(configRoot: string): BrainConfig {
    const root = resolve(configRoot);
    const file = join(root, CONFIG_FILE);
    let data: unknown;
    try {
        data = parse(readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${file}: ${(error as Error).message}`);
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`${file}: path und mode fehlen`);
    }
    const record = data as Record<string, unknown>;
    for (const key of Object.keys(record)) {
        if (!KEYS.includes(key)) {
            throw new Error(`${file}: unbekannter Schlüssel „${key}“`);
        }
    }
    if (typeof record.path !== 'string' || record.path.trim() === '') {
        throw new Error(`${file}: path fehlt`);
    }
    if (!isMode(record.mode)) {
        throw new Error(`${file}: mode muss project oder private sein`);
    }
    const brainDir = resolve(root, record.path);
    const path = brainDir === root ? '.' : relativeInside(root, brainDir);
    if (path === null) {
        throw new Error(`${file}: path „${record.path}“ liegt außerhalb von ${root}`);
    }
    return { configRoot: root, brainDir, path, mode: record.mode };
}

export function formatBrainConfig(path: string, mode: BrainMode): string {
    return `# Brain configuration. Created by brain init.\n${stringify({ path, mode })}`;
}

/** Returns the nearest directory at or above start that contains brain.yml, or null. */
export function findConfigRoot(start: string): string | null {
    let dir = resolve(start);
    for (;;) {
        if (existsSync(join(dir, CONFIG_FILE))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/** BRAIN_ROOT (directory with brain.yml) wins; otherwise the first brain.yml found walking up from each start. */
export function findBrainConfig(starts: string[], envRoot: string | undefined): BrainConfig | null {
    if (envRoot !== undefined && envRoot !== '') {
        const root = resolve(envRoot);
        if (!existsSync(join(root, CONFIG_FILE))) {
            throw new Error(`BRAIN_ROOT (${root}) enthält keine ${CONFIG_FILE}`);
        }
        return loadBrainConfig(root);
    }
    for (const start of starts) {
        const root = findConfigRoot(start);
        if (root !== null) {
            return loadBrainConfig(root);
        }
    }
    return null;
}

export function brainStarts(): string[] {
    return [callerDir(), process.env.CLAUDE_PROJECT_DIR]
        .filter((start): start is string => start !== undefined && start !== '');
}

export function brainConfig(): BrainConfig {
    const config = findBrainConfig(brainStarts(), process.env.BRAIN_ROOT);
    if (config === null) {
        throw new Error('Kein Wissens-Ordner gefunden – im Repository ausführen oder BRAIN_ROOT setzen.');
    }
    return config;
}
