import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatLogTime } from './time.ts';

export const LOG_OPS = [
    'archive',
    'create',
    'update',
    'link',
    'unlink',
    'conflict',
    'resolve',
    'recategorize',
    'category',
    'ingest',
] as const;

export type LogOp = (typeof LOG_OPS)[number];

export function isLogOp(value: string): value is LogOp {
    return (LOG_OPS as readonly string[]).includes(value);
}

function clean(field: string): string {
    return field.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatLogLine(now: Date, op: LogOp, target: string, description = ''): string {
    return `${formatLogTime(now)} | ${op} | ${clean(target)} | ${clean(description)}`.trimEnd();
}

export function appendLog(root: string, now: Date, op: LogOp, target: string, description = ''): void {
    appendFileSync(join(root, 'LOG.md'), `${formatLogLine(now, op, target, description)}\n`, 'utf8');
}
