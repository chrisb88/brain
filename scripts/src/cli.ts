#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { archiveNote } from './archive.ts';
import { addCategory, listCategories } from './category.ts';
import { checkBrain } from './check.ts';
import { brainConfig, brainStarts, findBrainConfig, rewriteBrainConfig } from './config.ts';
import { hasPushGuard } from './guard.ts';
import { runIndex } from './indexer.ts';
import { initBrain, updateBrainConfig } from './init.ts';
import { linkEntries } from './link.ts';
import { appendLog, isLogOp } from './log.ts';
import { callerDir } from './paths.ts';
import { activatePlugin, enableAutoUpdate, PLUGIN_INSTALL_COMMAND } from './plugin.ts';
import { parseYesNo, promptLine } from './prompt.ts';
import { findOrphanIndexes, isQmdInstalled, qmdIndexReady, removeIndex, runQmd, setupQmd } from './qmd.ts';
import { mergeCategory, moveEntry, renameCategory } from './recategorize.ts';
import { remember } from './remember.ts';
import { searchLevel } from './search.ts';
import { sessionLines, sessionOutput, startBackgroundRefresh } from './session.ts';
import { cliVersion } from './version.ts';

const HELP = `brain – command line tool for knowledge folders

Usage: brain <command> [options]

Knowledge lives in a git repository: brain.yml at the repository root names the knowledge folder
(path) and the mode (project: shared with the repository; private: own repository, by default never
pushed). brain finds
brain.yml by walking up from the current directory (or set BRAIN_ROOT to the folder containing
brain.yml). Entries are addressed as wiki/<category>/<entry>, sources as
archive/<category>/YYYY/MM/<file> (".md" is optional), relative to the knowledge folder.

Environment:
  BRAIN_SEARCH=hybrid|keyword|off
      Search level of this machine: hybrid (qmd with embedding models, default), keyword
      (qmd BM25 only, no models) or off (INDEX.md and grep, no qmd).

Commands:
  init [--private [--allow-push]] [<path>]
      Create a knowledge folder in the current git repository: brain.yml at the repository root and the
      knowledge folder at <path>, relative to the repository root (asked for when missing, default
      "knowledge"). --private creates the repository if needed and asks whether it stays local only
      (push guard, requires a repository without remote; default without a terminal); --allow-push
      skips the question and allows a remote. Enables the brain plugin for the project
      (.claude/settings.json). Never commits.
  setup
      Set up a cloned repository on this machine: enable the brain plugin for the project (Claude
      Code registers project plugins per checkout), build INDEX.md and graph.json and create the qmd
      index for the current BRAIN_SEARCH level (hybrid downloads ~2.5 GB of models). Run once per
      clone, then (re)start Claude Code in the repository root.
  init --update
      Rewrite brain.yml in the current format, refresh the knowledge folder files from template/ and
      install or remove the push guard according to push_guard. Never touches data.
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
  qmd setup
      Create this knowledge folder's qmd index for the current BRAIN_SEARCH level (collections
      wiki/archive, contexts; hybrid also sets the Qwen3 embedding model and embeds).
  qmd prune [--yes]
      List qmd indexes of knowledge folders that no longer exist and delete them after confirmation.
  qmd <qmd-arguments>
      Run qmd on this knowledge folder's own index, e.g. "brain qmd search Ingress -c wiki",
      "brain qmd update", "brain qmd mcp".
  index
      Rebuild INDEX.md and graph.json from the markdown files.
  check
      Validate the knowledge folder. Errors exit with 1; hints list open conflicts/unclear
      points, uncategorized entries, uncommitted changes and qmd index problems.
  log <op> <target> [<description>]
      Append a line to LOG.md. Ops: archive, create, update, link, unlink,
      conflict, resolve, recategorize, category, ingest.
  session-start <plugin-root>
      Internal: used by the plugin's SessionStart hook.
  --version
      Print the CLI version.
  help
      Show this help (also: --help, -h, no arguments).

Examples:
  brain init knowledge
  brain init --private .
  brain archive inbox/ingress-notes.md --category tech
  brain remember --category tech --title "Kubernetes Ingress" --summary "TLS setup for the ingress controller." \\
      --source archive/tech/2026/10/2026-10-03-1530-ingress-notes --related wiki/tech/azure-aks <<'EOF'
  The NGINX ingress controller terminates TLS with certificates from cert-manager.
  EOF
  brain link wiki/tech/kubernetes-ingress wiki/tech/azure-aks
  brain category add travel --name "Urlaub" --description "Reisen, Ausflüge, Urlaubsplanung."
  brain recategorize --move wiki/_uncategorized/tax-idea finance
  BRAIN_SEARCH=keyword brain qmd setup
  brain index && brain check`;

/** Resolves a path argument relative to the directory the user called the command from. */
function callerPath(path: string): string {
    return resolve(callerDir(), path);
}

function readStdin(): string {
    return process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
}

/** Asks until the answer is yes or no; default yes (push guard on). */
function askPushGuard(): boolean {
    for (;;) {
        const answer = parseYesNo(promptLine('Nur lokal – Pushen verhindern? [Y/n] '), true);
        if (answer !== null) {
            return answer;
        }
    }
}

function pruneIndexes(args: string[]): number {
    const { values } = parseArgs({ args, options: { yes: { type: 'boolean', default: false } } });
    const orphans = findOrphanIndexes();
    if (orphans.length === 0) {
        console.log('Nichts zu tun.');
        return 0;
    }
    console.log(['Verwaiste qmd-Indexe:', ...orphans.map((orphan) => `  - ${orphan.name} (${orphan.path})`)].join('\n'));
    let remove = values.yes === true;
    if (!remove) {
        if (process.stdin.isTTY !== true) {
            console.log('Ohne Terminal wird nichts gelöscht – brain qmd prune --yes');
            return 0;
        }
        remove = /^(y|yes|j|ja)$/i.test(promptLine('Löschen? [y/N] '));
    }
    if (!remove) {
        console.log('Nichts gelöscht.');
        return 0;
    }
    for (const orphan of orphans) {
        removeIndex(orphan.name);
    }
    console.log(`${orphans.length} Index(e) gelöscht.`);
    return 0;
}

function initQmd(brainDir: string): void {
    const level = searchLevel();
    if (level === 'off') {
        console.log('BRAIN_SEARCH=off – qmd wird nicht eingerichtet.');
        return;
    }
    if (!isQmdInstalled()) {
        console.log('Hinweis: qmd nicht gefunden – später im Wissens-Ordner „brain qmd setup“ ausführen.');
        return;
    }
    if (level === 'hybrid') {
        console.log('Hinweis: BRAIN_SEARCH=hybrid lädt beim ersten Mal ~2.5 GB Modelle herunter (Abbruch mit Strg+C). '
            + 'Ohne Modelle: BRAIN_SEARCH=keyword brain setup – und BRAIN_SEARCH=keyword dauerhaft setzen, z. B. in ~/.zshrc.');
    }
    try {
        setupQmd(brainDir, level);
        console.log(`qmd-Index eingerichtet (${level}).`);
    } catch (error) {
        console.log(`Hinweis: qmd-Einrichtung fehlgeschlagen (${(error as Error).message}) – später im Wissens-Ordner „brain qmd setup“ ausführen.`);
    }
}

function run(argv: string[], now: Date): number {
    const [command, ...rest] = argv;
    const isHelp = command === undefined || command === 'help' || command === '--help' || command === '-h';
    if (isHelp) {
        console.log(HELP);
        return 0;
    }
    if (command === '--version') {
        console.log(cliVersion());
        return 0;
    }
    const needsBrain = !(command === 'init' || command === 'session-start' || (command === 'qmd' && rest[0] === 'prune'));
    const config = needsBrain ? brainConfig() : null;
    const root = config?.brainDir ?? '';
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
            const report = checkBrain(root, config?.mode, searchLevel(), config?.pushGuard);
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
        case 'qmd': {
            if (rest[0] === 'prune') {
                return pruneIndexes(rest.slice(1));
            }
            const level = searchLevel();
            if (rest.length === 1 && rest[0] === 'setup') {
                if (level === 'off') {
                    console.log('BRAIN_SEARCH=off – qmd wird nicht eingerichtet.');
                    return 0;
                }
                setupQmd(root, level);
                console.log(`qmd-Index eingerichtet (${level})`);
                return 0;
            }
            if (rest.length === 0) {
                throw new Error('Verwendung: brain qmd setup | brain qmd prune [--yes] | brain qmd <qmd-argumente>');
            }
            if (rest[0] === 'mcp' && level === 'off') {
                throw new Error('BRAIN_SEARCH=off – qmd-MCP-Server bitte über /mcp deaktivieren');
            }
            return runQmd(root, rest);
        }
        case 'setup': {
            if (rest.length > 0) {
                throw new Error('Verwendung: brain setup');
            }
            console.log(activatePlugin(config?.configRoot ?? root)
                ? 'Plugin brain@brain für dieses Projekt aktiviert.'
                : `Hinweis: Plugin nicht aktiviert – im Repo ausführen: ${PLUGIN_INSTALL_COMMAND}`);
            runIndex(root);
            console.log('INDEX.md und graph.json erzeugt');
            initQmd(root);
            console.log('Nächster Schritt: Claude Code im Repo-Root (neu) starten.');
            return 0;
        }
        case 'init': {
            const { values, positionals } = parseArgs({
                args: rest,
                allowPositionals: true,
                options: {
                    update: { type: 'boolean', default: false },
                    private: { type: 'boolean', default: false },
                    'allow-push': { type: 'boolean', default: false },
                },
            });
            if (values.update === true) {
                if (positionals.length > 0 || values.private === true || values['allow-push'] === true) {
                    throw new Error('Verwendung: brain init --update');
                }
                const current = brainConfig();
                const guardBefore = hasPushGuard(current.brainDir);
                const changed = [
                    ...(rewriteBrainConfig(current) ? ['brain.yml'] : []),
                    ...updateBrainConfig(current.brainDir, current.pushGuard),
                ];
                const guardAfter = hasPushGuard(current.brainDir);
                const lines = changed.length === 0 ? [] : ['Aktualisiert (bitte prüfen und committen):', ...changed.map((rel) => `  - ${rel}`)];
                if (guardBefore !== guardAfter) {
                    lines.push(guardAfter ? 'Push-Schutz installiert' : 'Push-Schutz entfernt');
                }
                console.log(lines.length === 0 ? 'Konfiguration ist aktuell.' : lines.join('\n'));
                return 0;
            }
            if (positionals.length > 1) {
                throw new Error('Verwendung: brain init [--private [--allow-push]] [<pfad>] | brain init --update');
            }
            const result = initBrain({
                cwd: callerDir(),
                path: positionals[0],
                private: values.private === true,
                allowPush: values['allow-push'] === true,
                askPath: process.stdin.isTTY === true ? () => promptLine('Wissens-Ordner [knowledge]: ') || 'knowledge' : undefined,
                askPushGuard: process.stdin.isTTY === true ? askPushGuard : undefined,
            });
            const guard = result.mode === 'private' ? `, push guard: ${result.pushGuard ? 'on' : 'off'}` : '';
            console.log(`Wissens-Ordner angelegt: ${result.brainDir} (mode: ${result.mode}${guard})`);
            if (result.mode === 'private' && !result.pushGuard) {
                console.log('Hinweis: brain prüft nicht, wer das Remote lesen kann – für privates Wissen kein öffentliches Repository verwenden.');
            }
            if (result.createdRepo) {
                console.log(`Git-Repository angelegt: ${result.configRoot}`);
            }
            initQmd(result.brainDir);
            if (activatePlugin(result.configRoot)) {
                console.log(enableAutoUpdate(result.configRoot)
                    ? 'Plugin brain@brain für dieses Projekt aktiviert (mit Auto-Update).'
                    : 'Plugin brain@brain für dieses Projekt aktiviert.');
            } else {
                console.log(`Hinweis: Plugin nicht aktiviert – im Repo ausführen: ${PLUGIN_INSTALL_COMMAND}`);
            }
            console.log('Nächster Schritt: Änderungen prüfen und committen, dann Claude Code im Repo starten.');
            console.log('Teammitglieder führen nach dem Klonen einmal „brain setup“ im Repo aus.');
            return 0;
        }
        case 'session-start': {
            try {
                const found = findBrainConfig(brainStarts(), process.env.BRAIN_ROOT);
                if (found === null) {
                    return 0;
                }
                const level = searchLevel();
                const qmdReady = level !== 'off' && qmdIndexReady(found.brainDir);
                const [context, ...warnings] = sessionLines(found, rest[0] ?? '', level, qmdReady);
                console.log(sessionOutput([context], warnings));
                startBackgroundRefresh(found, qmdReady);
            } catch (error) {
                console.log(sessionOutput([], [`Brain: Hinweis – ${(error as Error).message}`]));
            }
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
