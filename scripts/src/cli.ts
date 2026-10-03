#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveNote } from './archive.ts';
import { checkBrain } from './check.ts';
import { runIndex } from './indexer.ts';
import { linkEntries } from './link.ts';
import { appendLog, isLogOp } from './log.ts';
import { brainRoot } from './paths.ts';
import { remember } from './remember.ts';

const USAGE = 'Verwendung: brain <archive|remember|link|log|index|check|recategorize> …';

/** Resolves a path argument relative to the directory the user called the command from. */
function callerPath(path: string): string {
    return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function readStdin(): string {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
}

function run(argv: string[], root: string, now: Date): number {
    const [command, ...rest] = argv;
    switch (command) {
        case 'archive': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: { category: { type: 'string' } },
            });
            if (positionals.length !== 1 || values.category === undefined) {
                throw new Error('Verwendung: brain archive <inbox-datei> --category <slug>');
            }
            console.log(archiveNote(root, callerPath(positionals[0]), values.category, now));
            return 0;
        }
        case 'log': {
            const [op, target, ...description] = rest;
            if (op === undefined || target === undefined) {
                throw new Error('Verwendung: brain log <op> <ziel> [<beschreibung>]');
            }
            if (!isLogOp(op)) {
                throw new Error(`Unbekannte Operation: ${op}`);
            }
            appendLog(root, now, op, target, description.join(' '));
            return 0;
        }
        case 'link': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: { remove: { type: 'boolean', default: false } },
            });
            const remove = values.remove === true;
            const changed = linkEntries(root, positionals, remove, now);
            console.log(`${changed} Beziehung(en) ${remove ? 'entfernt' : 'gesetzt'}`);
            return 0;
        }
        case 'index': {
            runIndex(root);
            console.log('INDEX.md und graph.json erzeugt');
            return 0;
        }
        case 'remember': {
            const { values } = parseArgs({
                args: rest,
                options: {
                    category: { type: 'string' },
                    title: { type: 'string' },
                    summary: { type: 'string' },
                    source: { type: 'string', multiple: true },
                    tags: { type: 'string' },
                    related: { type: 'string', multiple: true },
                },
            });
            if (values.category === undefined || values.title === undefined || values.summary === undefined) {
                throw new Error(
                    'Verwendung: brain remember --category <slug> --title <t> --summary <s> --source <archivpfad> '
                    + '[--source …] [--tags a,b] [--related <eintrag> …] < body.md',
                );
            }
            const tags = (values.tags ?? '').split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
            console.log(remember(root, {
                category: values.category,
                title: values.title,
                summary: values.summary,
                sources: values.source ?? [],
                tags,
                related: values.related ?? [],
                body: readStdin(),
            }, now));
            return 0;
        }
        case 'check': {
            const report = checkBrain(root);
            if (report.errors.length > 0) {
                console.log(['Fehler:', ...report.errors.map((error) => `  - ${error}`)].join('\n'));
            }
            if (report.hints.length > 0) {
                console.log(['Hinweise:', ...report.hints.map((hint) => `  - ${hint}`)].join('\n'));
            }
            if (report.errors.length === 0) {
                console.log('Keine Fehler.');
            }
            return report.errors.length > 0 ? 1 : 0;
        }
        default:
            throw new Error(USAGE);
    }
}

try {
    process.exitCode = run(process.argv.slice(2), brainRoot(), new Date());
} catch (error) {
    console.error(`Fehler: ${(error as Error).message}`);
    process.exitCode = 1;
}
