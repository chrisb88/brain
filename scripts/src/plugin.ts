import { spawnSync } from 'node:child_process';

export const PLUGIN_ID = 'brain@brain';
export const PLUGIN_INSTALL_COMMAND = `claude plugin install ${PLUGIN_ID} --scope project`;

/** Enables the brain plugin for the project at configRoot; false if claude is missing or fails. */
export function activatePlugin(configRoot: string): boolean {
    const result = spawnSync('claude', ['plugin', 'install', PLUGIN_ID, '--scope', 'project'], { cwd: configRoot, stdio: 'ignore' });
    return result.error === undefined && result.status === 0;
}
