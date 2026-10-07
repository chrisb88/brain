import { spawnSync } from 'node:child_process';

export const PLUGIN_ID = 'brain@brain';
export const MARKETPLACE_SOURCE = 'chrisb88/brain';
const STEPS = [
    ['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE, '--scope', 'project'],
    ['plugin', 'install', PLUGIN_ID, '--scope', 'project'],
];
export const PLUGIN_INSTALL_COMMAND = STEPS.map((args) => `claude ${args.join(' ')}`).join(' && ');

/** Declares the brain marketplace and enables the plugin for the project at configRoot; false if claude is missing or a step fails. */
export function activatePlugin(configRoot: string): boolean {
    for (const args of STEPS) {
        const result = spawnSync('claude', args, { cwd: configRoot, stdio: 'ignore' });
        if (result.error !== undefined || result.status !== 0) {
            return false;
        }
    }
    return true;
}
