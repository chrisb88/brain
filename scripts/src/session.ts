import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrainConfig } from './config.ts';
import type { SearchLevel } from './search.ts';
import { cliVersion } from './version.ts';

const CLI = join(import.meta.dirname, 'cli.ts');

export function pluginVersion(pluginRoot: string): string {
    const data = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: unknown };
    if (typeof data.version !== 'string') {
        throw new Error('version fehlt');
    }
    return data.version;
}

/** Lines the SessionStart hook prints into Claude's context. */
export function sessionLines(config: BrainConfig, pluginRoot: string, level: SearchLevel, qmdReady: boolean): string[] {
    const folder = config.path === '.' ? './' : `${config.path}/`;
    const lines = [`Brain: ${folder} (mode: ${config.mode}, search: ${level})`];
    if (level !== 'off' && !qmdReady) {
        lines.push('Brain: Hinweis – qmd-Index fehlt – einmal „brain qmd setup“ im Repository ausführen');
    }
    const cli = cliVersion();
    let plugin: string;
    try {
        plugin = pluginVersion(pluginRoot);
    } catch {
        lines.push(`Warnung: Plugin-Version nicht lesbar (${pluginRoot}) – claude plugin update brain@brain`);
        return lines;
    }
    if (plugin !== cli) {
        lines.push(`Warnung: Plugin ${plugin} und CLI ${cli} passen nicht zusammen – Klon aktualisieren (git pull) bzw. claude plugin update brain@brain.`);
    }
    return lines;
}

function quote(arg: string): string {
    return `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** Runs brain index (and qmd update if requested) in a detached process; returns immediately. */
export function startBackgroundRefresh(config: BrainConfig, updateQmd: boolean): void {
    const brain = (...args: string[]): string => [process.execPath, '--disable-warning=ExperimentalWarning', CLI, ...args].map(quote).join(' ');
    const script = updateQmd ? `${brain('index')} && ${brain('qmd', 'update')}` : brain('index');
    const child = spawn('sh', ['-c', script], {
        cwd: config.brainDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, BRAIN_ROOT: config.configRoot },
    });
    child.on('error', () => {});
    child.unref();
}
