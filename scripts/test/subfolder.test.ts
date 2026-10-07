import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBrain } from '../src/check.ts';
import { uncommittedChanges } from '../src/git.ts';
import { GARMIN, git, initGit, projectWithBrain, writeFile } from './helpers.ts';

const cases: Array<[string, (brain: string) => void, RegExp | null]> = [
    ['modified file', (brain) => writeFile(brain, `${GARMIN}.md`, 'geändert\n'), new RegExp(`^archive: ${GARMIN}\\.md wurde verändert$`, 'm')],
    ['deleted file', (brain) => rmSync(join(brain, `${GARMIN}.md`)), new RegExp(`^archive: ${GARMIN}\\.md wurde gelöscht`, 'm')],
    ['identical git mv', (brain) => {
        mkdirSync(join(brain, 'archive/technik/2026/11'), { recursive: true });
        git(brain, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
    }, null],
    ['git mv with change', (brain) => {
        mkdirSync(join(brain, 'archive/technik/2026/11'), { recursive: true });
        git(brain, 'mv', `${GARMIN}.md`, 'archive/technik/2026/11/x.md');
        writeFile(brain, 'archive/technik/2026/11/x.md', 'anders\n');
    }, new RegExp(`^archive: ${GARMIN}\\.md → archive/technik/2026/11/x\\.md mit Inhaltsänderung umbenannt$`, 'm')],
];
for (const [label, mutate, error] of cases) {
    test(`archive integrity in a knowledge subfolder: ${label}`, () => {
        const { repo, brain } = projectWithBrain();
        initGit(repo);
        mutate(brain);
        const errors = checkBrain(brain).errors.filter((e) => e.startsWith('archive: '));
        if (error === null) {
            assert.deepEqual(errors, []);
        } else {
            assert.match(errors.join('\n'), error);
        }
    });
}

test('uncommittedChanges lists only changes inside the knowledge folder', () => {
    const { repo, brain } = projectWithBrain();
    initGit(repo);
    writeFile(repo, 'src/app.ts', 'x');
    assert.deepEqual(uncommittedChanges(brain), []);
    writeFile(brain, 'wiki/technik/neu.md', 'x');
    assert.deepEqual(uncommittedChanges(brain), ['wiki/technik/neu.md']);
    assert.match(checkBrain(brain).hints.join('\n'), /Nicht committete Änderungen im Wissens-Ordner \(1 Datei\(en\)\) – prüfen und committen/);
});

test('project mode ignores remotes and the push guard', () => {
    const { repo, brain } = projectWithBrain();
    initGit(repo);
    git(repo, 'config', '--unset', 'core.hooksPath');
    git(repo, 'remote', 'add', 'origin', 'https://example.com/x.git');
    assert.deepEqual(checkBrain(brain, 'project').errors, []);
    assert.match(checkBrain(brain, 'private').errors.join('\n'), /hat ein Remote \(origin\)/);
});
