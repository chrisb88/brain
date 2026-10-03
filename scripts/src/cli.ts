#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveNote } from './archive.ts';
import { addCategory, listCategories } from './category.ts';
import { checkBrain } from './check.ts';
import { runIndex } from './indexer.ts';
import { linkEntries } from './link.ts';
import { appendLog, isLogOp } from './log.ts';
import { brainRoot } from './paths.ts';
import { mergeCategory, moveEntry, renameCategory } from './recategorize.ts';
import { remember } from './remember.ts';

const HELP = `brain – command line tool for the second brain knowledge base

Usage: brain <command> [options]

Run it inside a brain data repository (or set BRAIN_ROOT). Entries are addressed as wiki/<category>/<entry>,
sources as archive/<category>/YYYY/MM/<file> (".md" is optional).

Commands:
  archive <inbox-file> --category <slug>
      Move a note from inbox/ to archive/<category>/YYYY/MM/ without changing its
      content. Prints the new archive path.
  remember --category <slug> --title <title> --summary <sentence> --source <archive-path>
           [--source <archive-path> …] [--tags a,b] [--related <entry> …]  < body.md
      Create a new wiki entry (body from stdin), link related entries on both sides
      and rebuild the index.
  link <entry> <entry> [<entry> …] [--remove]
      Add (or remove) symmetric "## Related" links between all given entries.
  category add <slug> --name <name> [--description <text>]
      Register a new category in categories.yml. Only with the user's approval.
  category list
      List all categories with their number of entries.
  recategorize --rename <old> <new> | --merge <from> <to> | --move <entry> <category>
      Rename or merge categories, or move an entry to another category. Rewrites
      links; archive files keep their exact content.
  index
      Rebuild INDEX.md and graph.json from the markdown files.
  check
      Validate the brain. Errors exit with 1; hints list open conflicts/unclear
      points and uncategorized entries.
  log <op> <target> [<description>]
      Append a line to LOG.md. Ops: archive, create, update, link, unlink,
      conflict, resolve, recategorize, category, ingest.
  help
      Show this help (also: --help, -h, no arguments).

Examples:
  brain archive inbox/ingress-notes.md --category tech
  brain remember --category tech --title "Kubernetes Ingress" --summary "TLS setup for the ingress controller." \\
      --source archive/tech/2026/10/2026-10-03-1530-ingress-notes --related wiki/tech/azure-aks <<'EOF'
  The NGINX ingress controller terminates TLS with certificates from cert-manager.
  EOF
  brain link wiki/tech/kubernetes-ingress wiki/tech/azure-aks
  brain category add travel --name "Urlaub" --description "Reisen, Ausflüge, Urlaubsplanung."
  brain category list
  brain recategorize --move wiki/_uncategorized/tax-idea finance
  brain index && brain check
  brain log update wiki/tech/kubernetes-ingress "TLS section condensed"`;

/** Resolves a path argument relative to the directory the user called the command from. */
function callerPath(path: string): string {
    return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function readStdin(): string {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
}

function run(argv: string[], now: Date): number {
    const [command, ...rest] = argv;
    const isHelp = command === undefined || command === 'help' || command === '--help' || command === '-h';
    if (isHelp) {
        console.log(HELP);
        return 0;
    }
    const root = command === 'init' ? '' : brainRoot();
    switch (command) {
        case 'category': {
            const [action, ...args] = rest;
            if (action === 'list' && args.length === 0) {
                console.log(listCategories(root));
                return 0;
            }
            if (action === 'add') {
                const { values, positionals } = parseArgs({
                    args,
                    allowPositionals: true,
                    options: { name: { type: 'string' }, description: { type: 'string' } },
                });
                if (positionals.length !== 1 || values.name === undefined) {
                    throw new Error('Verwendung: brain category add <slug> --name <name> [--description <text>]');
                }
                addCategory(root, positionals[0], values.name, values.description ?? '', now);
                console.log(`Kategorie ${positionals[0]} angelegt`);
                return 0;
            }
            throw new Error('Verwendung: brain category add <slug> --name <name> [--description <text>] | brain category list');
        }
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
        case 'recategorize': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: {
                    rename: { type: 'boolean', default: false },
                    merge: { type: 'boolean', default: false },
                    move: { type: 'boolean', default: false },
                },
            });
            const modes = [values.rename, values.merge, values.move].filter((mode) => mode === true).length;
            if (modes !== 1 || positionals.length !== 2) {
                throw new Error(
                    'Verwendung: brain recategorize --rename <alt> <neu> | --merge <von> <nach> | --move <eintrag> <kategorie>',
                );
            }
            const [first, second] = positionals;
            if (values.rename === true) {
                renameCategory(root, first, second, now);
            } else if (values.merge === true) {
                mergeCategory(root, first, second, now);
            } else {
                moveEntry(root, first, second, now);
            }
            console.log('Umkategorisierung abgeschlossen');
            return 0;
        }
        default:
            throw new Error(`Unbekannter Befehl: ${command} → brain help`);
    }
}

try {
    process.exitCode = run(process.argv.slice(2), new Date());
} catch (error) {
    console.error(`Fehler: ${(error as Error).message}`);
    process.exitCode = 1;
}
