import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendLog, formatLogLine, isLogOp, type LogOp } from '../src/log.ts';
import { makeBrain, NOW, read } from './helpers.ts';

const lines: Array<[LogOp, string, string, string]> = [
    ['create', 'wiki/a/b', 'Neu', '2026-10-03 15:30 | create | wiki/a/b | Neu'],
    ['link', 'wiki/a/b ↔ wiki/a/c', '', '2026-10-03 15:30 | link | wiki/a/b ↔ wiki/a/c |'],
    ['update', 'wiki/a|b', 'Zeile1\nZeile2 | x', '2026-10-03 15:30 | update | wiki/a b | Zeile1 Zeile2 x'],
];
for (const [op, target, description, expected] of lines) {
    test(`formatLogLine ${op} ${JSON.stringify(description)}`, () => {
        assert.equal(formatLogLine(NOW, op, target, description), expected);
    });
}

test('isLogOp knows exactly the spec operations', () => {
    for (const op of ['archive', 'create', 'update', 'link', 'unlink', 'conflict', 'resolve', 'recategorize', 'category', 'ingest']) {
        assert.equal(isLogOp(op), true, op);
    }
    assert.equal(isLogOp('delete'), false);
});

test('appendLog creates LOG.md and appends lines', () => {
    const root = makeBrain();
    appendLog(root, NOW, 'archive', 'archive/x.md', 'aus inbox/x.md');
    appendLog(root, NOW, 'ingest', '1 Notizen');
    assert.equal(
        read(root, 'LOG.md'),
        '2026-10-03 15:30 | archive | archive/x.md | aus inbox/x.md\n2026-10-03 15:30 | ingest | 1 Notizen |\n',
    );
});
