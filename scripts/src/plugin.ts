import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const PLUGIN_ID = 'brain@brain';
export const MARKETPLACE_SOURCE = 'chrisb88/brain';
const STEPS = [
    ['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE, '--scope', 'project'],
    ['plugin', 'install', PLUGIN_ID, '--scope', 'project'],
];
export const PLUGIN_INSTALL_COMMAND = STEPS.map((args) => `claude ${args.join(' ')}`).join(' && ');

function readText(file: string): string | null {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

function parseJson(text: string | null): unknown {
    try {
        return text === null ? undefined : JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** Declares the brain marketplace and enables the plugin for the project at configRoot; false if claude is missing or a step fails. */
export function activatePlugin(configRoot: string): boolean {
    const settings = join(configRoot, '.claude', 'settings.json');
    const before = readText(settings);
    let ok = true;
    for (const args of STEPS) {
        const result = spawnSync('claude', args, { cwd: configRoot, stdio: 'ignore' });
        if (result.error !== undefined || result.status !== 0) {
            ok = false;
            break;
        }
    }
    // claude rewrites settings.json with its own key order; keep the committed bytes when nothing really changed.
    const after = readText(settings);
    const original = parseJson(before);
    if (before !== null && after !== before && original !== undefined && isDeepStrictEqual(original, parseJson(after))) {
        writeFileSync(settings, before);
    }
    return ok;
}

/** Sets autoUpdate on the brain marketplace entry in .claude/settings.json so every team member gets plugin updates. */
export function enableAutoUpdate(configRoot: string): boolean {
    const settings = join(configRoot, '.claude', 'settings.json');
    const data = parseJson(readText(settings)) as { extraKnownMarketplaces?: Record<string, Record<string, unknown>> } | undefined;
    const entry = data?.extraKnownMarketplaces?.brain;
    if (entry === undefined || entry === null || typeof entry !== 'object') {
        return false;
    }
    if (entry.autoUpdate !== true) {
        entry.autoUpdate = true;
        writeFileSync(settings, `${JSON.stringify(data, null, 2)}\n`);
    }
    return true;
}
