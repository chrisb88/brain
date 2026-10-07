import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function cliVersion(): string {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}
