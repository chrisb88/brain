# brain

brain keeps your knowledge (a "second brain") in plain Markdown files, maintained by [Claude Code](https://claude.com/claude-code) and searchable with [qmd](https://github.com/tobi/qmd).

Use it **per project** (knowledge is committed to the project repository and shared with everyone who can read it) or **privately** (own repository, only for you) – see [Two modes](#two-modes-project-or-private).

You drop raw notes into an inbox; `/brain:ingest` archives the originals unchanged and works the knowledge into condensed, categorized, cross-linked wiki entries. `/brain:ask` answers questions strictly from the brain, with source links. While you code, Claude consults the brain on its own when a question touches project knowledge.

Based on the approach by [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg) – see [Credits](#credits).

> **Note:** Instructions, slash commands and wiki entries are written in German. Code, CLI and file formats are English.

## How it works

At its core brain is an ordinary **second brain** in the style of the *LLM wiki* idea described by Andrej Karpathy: a folder of Markdown pages that an LLM writes and maintains for you. Instead of searching your raw notes again for every question, Claude reads each new note **once**, works it into a small set of condensed, cross-linked wiki pages and keeps them up to date. Knowledge accumulates in the wiki; questions are answered from the wiki.

```
inbox/  ──/brain:ingest──▶  archive/   original notes, unchanged (the sources)
(raw notes)          └────▶  wiki/      condensed entries by category, [[links]] (written by Claude)
                                 │
                       INDEX.md + qmd index
                                 │
              /brain:ask, the brain skill while you work ──▶ answers with source links
```

It has three layers:

| Layer | What | Who writes it |
|---|---|---|
| Sources | `archive/` – your notes, archived byte-identical | you (via `inbox/`) |
| Wiki | `wiki/` – one entry per topic, merged instead of appended, conflicts and open questions marked | Claude |
| Rules | the knowledge folder's `CLAUDE.md` and the plugin's skill – how entries are written, categorized and linked | brain |

What brain adds on top of the plain idea:

- **A Claude Code plugin** – `/brain:ingest`, `/brain:ask`, a skill that makes Claude look into the brain before answering project questions, and a session hook.
- **A CLI for the deterministic parts** – building the catalog (`INDEX.md`, `graph.json`), checking that archived originals were never changed, managing categories, setting up the search index. Claude does the writing, the CLI does the bookkeeping.
- **qmd to save tokens.** Without a search engine, Claude has to read the whole catalog and grep through the wiki to find the right entries – the bigger the brain, the more tokens each question costs. [qmd](https://github.com/tobi/qmd) searches locally and returns only the few best-matching entries, so Claude reads just those. See [Search with qmd](#search-with-qmd).

Everything is plain files in Git: Obsidian-compatible, readable without brain, versioned like code. The search index is only a cache and can be rebuilt at any time.

## Two modes: project or private

You choose the mode once, when you create the knowledge folder: `brain init` asks for it, or you pass `--project` or `--private`.

| | **Project** | **Private** |
|---|---|---|
| Command | `brain init --project [<folder>]` | `brain init --private [--allow-push] [<folder>]` |
| Where the knowledge lives | a folder inside an existing project repository | its own Git repository (created if needed) |
| Who can read it | **everyone who can read the project repository** – once you commit and push, the knowledge travels with the code | **only you** – unless you allow a remote yourself (see [Push guard](#private-mode-push-guard-and-backup)) |
| Pushed | yes, together with the project, by you | by default never: the push guard rejects every push |
| Good for | architecture decisions, domain knowledge, how-tos, onboarding | personal notes, learning, anything you would not share with the team |
| Backup | the project's remote | with push guard: your own backup without remotes (e.g. `git bundle`); without push guard: a remote of your own – see [Push guard and backup](#private-mode-push-guard-and-backup) |

Both modes use the same folder layout, the same commands and the same plugin. brain never commits and never pushes in either mode – you review and commit knowledge changes like code.

### Project mode: what is shared

> **Project mode shares everything you ingest.** `/brain:ingest` writes wiki entries and archives your original notes byte-identical in the knowledge folder. Once you commit and push, everyone with read access to the project repository can read both – today's collaborators, future ones, and for a public repository the whole internet. Deleting an entry later does not remove it from the Git history. Don't ingest personal or confidential notes (passwords, customer data, personal matters) into a project brain – use a private brain for those.

Committed: `brain.yml`, the knowledge folder (`wiki/`, `archive/`, `categories.yml`, `.gitignore`, `.gitattributes`, `CLAUDE.md`) and `.claude/settings.json`. Not committed (ignored by the knowledge folder's `.gitignore`): notes waiting in `inbox/`, `INDEX.md`, `graph.json` and `LOG.md`.

### Private mode: push guard and backup

A private brain has no project remote that keeps a copy of your knowledge. `brain init --private` therefore asks one question that decides how you back it up: *Nur lokal – Pushen verhindern? [Y/n]* (local only – prevent pushing?). The answer is stored as `push_guard` in `brain.yml`.

| | **With push guard** (`Y`, default) | **Without push guard** (`n` or `--allow-push`) |
|---|---|---|
| `brain.yml` | `push_guard: true` | `push_guard: false` |
| Git remotes | **none allowed** – not even one on your own backup drive | allowed – any remote you add yourself |
| `git push` | rejected by a `pre-push` hook | works normally |
| Where your knowledge lives | only in this one folder on this machine | in this folder and on every remote you push to |
| Backup | **your job, outside Git remotes** – see below | push to a remote of your own |
| Good for | knowledge that must never leave the machine | knowledge you want backed up or on several machines |

**With push guard – everything stays local.** brain installs a Git `pre-push` hook that rejects every push and tells you how to allow pushing. The repository must not have a remote at all: `brain init` refuses a repository with a remote, and `brain check` reports one as an error. Without a terminal (scripts, CI) `brain init --private` does not ask and uses this setting.

You must take care of backups yourself, without a remote – for example:

```bash
# a single file with the whole history; copy it to a backup drive, NAS or cloud folder
git -C ~/knowledge bundle create /mnt/backup/knowledge-$(date +%F).bundle --all
# restore: git clone /mnt/backup/knowledge-2026-11-03.bundle ~/knowledge
```

or a copy of the whole folder with your usual backup tool (rsync, Windows backup of the WSL folder, …). Don't put the live repository itself into a sync folder (OneDrive, Dropbox) – syncing a `.git` folder while Git writes to it can corrupt it; sync a bundle file instead. Without a backup, a broken disk means the knowledge is gone.

**Without push guard – use Git remotes as usual.** brain installs no hook and allows remotes. You add a remote and push yourself (brain and Claude never push):

```bash
git remote add backup /mnt/backup/knowledge.git      # a bare repository on a backup drive (git init --bare first)
git remote add origin git@github.com:you/knowledge.git   # or a PRIVATE repository on a Git host
git push -u backup HEAD                              # pushes the current branch
```

**brain cannot tell who can read a remote.** A private repository on a Git host is readable by the host and by everyone you grant access; a public repository is readable by everyone. Never push private knowledge to a public repository.

**Limits of the push guard:** it is a local Git hook. It protects against an accidental push, not against a deliberate one (`git push --no-verify` skips it), and it is not part of a clone – a copy of the repository is not protected until you run `brain init --update` in it. Claude never adds a remote while the push guard is on, and never pushes in any mode.

**Switch later:** change `push_guard` in `brain.yml`, then run `brain init --update` (installs or removes the hook) and commit `brain.yml`. From guard on to off, e.g. to start backing up to a remote:

```bash
cd ~/knowledge
sed -i 's/^push_guard: true$/push_guard: false/' brain.yml   # or edit the file by hand
brain init --update                                          # prints "Push-Schutz entfernt"
git add brain.yml && git commit -m "Allow pushing"
git remote add backup /mnt/backup/knowledge.git              # a remote of your own
```

From off to on: remove all remotes first (`git remote remove <name>`) – `brain check` reports any that are left. `brain init --update` only deletes the hook if it is unchanged. If you added your own lines to `.git/hooks/pre-push`, it stops with an error and leaves the file alone – remove the brain lines yourself.

### brain.yml

`brain.yml` at the repository root holds the settings of the knowledge folder:

```yaml
# Brain configuration. Created by brain init.
# After changing this file run: brain init --update
# brain init --update rewrites this file - your own comments will be lost.
path: .
mode: private
push_guard: true
```

| Key | Values | Meaning |
|---|---|---|
| `path` | relative path, `.` for the repository root | the knowledge folder |
| `mode` | `project`, `private` | see [Two modes](#two-modes-project-or-private) |
| `push_guard` | `true`, `false` – only with `mode: private`; missing means `true` | see [Push guard](#private-mode-push-guard-and-backup) |

After every change to `brain.yml` run `brain init --update`. It always rewrites `brain.yml` in the current format – values are kept, missing keys are written with their default, **your own comments and formatting in this file are lost**.

## Features

- **Markdown is the single source of truth** – Obsidian-compatible (`[[wiki links]]`, YAML frontmatter, callouts). Your knowledge exists only in the knowledge folder; everything else can be rebuilt (see [What is your knowledge](#what-is-your-knowledge-and-what-can-be-rebuilt)).
- **Originals are never modified** – notes are archived byte-identical under `archive/<category>/YYYY/MM/`.
- **Condense, don't accumulate** – new knowledge is merged into existing entries; conflicts and open questions are marked and reported by `brain check`.
- **Strict categories** – new categories only with approval, otherwise `_uncategorized`.
- **Fast search** – `INDEX.md` catalog plus a qmd index per knowledge folder; search level per machine (`BRAIN_SEARCH`).
- **Claude Code plugin** – commands, skill, qmd MCP server and a session hook; nothing is copied into your project's own Claude configuration.
- **Never commits** – you review and commit knowledge changes like code.

## Installation

brain has two parts that get onto your machine separately:

- the **`brain` CLI** – runs from your clone of this repository (`npm link`); you update it with `git pull`.
- the **Claude Code plugin** (`brain@brain`: commands, skill, session hook, qmd MCP server) – Claude Code installs it from the `brain` marketplace and updates it automatically.

The plugin calls the CLI, so you always need both. Adding the marketplace alone is not enough – the session start then reports that the CLI is missing.

Every user does steps 1–3 once per machine, whatever the mode. Then continue with [Getting started](#getting-started).

### 1. Requirements

| Needed | Check | Install |
|---|---|---|
| Linux or WSL | – | – |
| Git | `git --version` | your package manager |
| Node.js ≥ 24 | `node --version` | e.g. [nvm](https://github.com/nvm-sh/nvm): `nvm install 24` |
| [Claude Code](https://claude.com/claude-code) | `claude --version` | see the Claude Code docs |
| [qmd](https://github.com/tobi/qmd) – optional | `qmd --version` | `npm install -g @tobilu/qmd` |

qmd is the search engine behind brain. Whether you need it and which search level fits your machine: see [Search with qmd](#search-with-qmd). Without qmd, set `export BRAIN_SEARCH=off` (e.g. in `~/.zshrc`).

### 2. Clone and install

```bash
git clone https://github.com/chrisb88/brain.git ~/brain
cd ~/brain
./install.sh
```

Keep the clone – the CLI runs from it. `install.sh`:

1. checks Git and Node.js ≥ 24 and stops with an error if one is missing,
2. installs the CLI's dependencies (`npm --prefix scripts install`) and puts `brain` on your PATH (`npm link`, pointing to this clone),
3. registers the `brain` marketplace in Claude Code for your user (`claude plugin marketplace add chrisb88/brain`) – if `claude` is not found it prints the command to run later,
4. prints `Hinweis: qmd fehlt – npm install -g @tobilu/qmd (oder ohne qmd: export BRAIN_SEARCH=off)` if qmd is missing,
5. ends with `Fertig: brain <version>`.

### 3. Check

```bash
brain --version     # e.g. 0.4.1
```

`brain: command not found` means npm's global bin folder is not on your PATH – check with `npm prefix -g` and add `<prefix>/bin` to your PATH.

### Update

- **Plugin:** automatic. Repositories set up with `brain init` – project and private – declare `autoUpdate` for the `brain` marketplace in `.claude/settings.json`. Elsewhere enable it once: `/plugin` → Marketplaces tab → `brain` → Enable auto-update (third-party marketplaces are not auto-updated by default), or update by hand with `claude plugin update brain@brain`. Claude Code checks for updates during a session; the new version loads at the next start.
- **CLI:** by hand – `cd ~/brain && git pull && ./install.sh`.

If plugin and CLI versions differ, the session start prints a warning – then update the part that is behind.

## Getting started

After [Installation](#installation), pick the path that fits:

| You want to … | Path |
|---|---|
| keep knowledge only for yourself | [A. Private brain](#a-private-brain) |
| add a brain to a project – you are the first one | [B. Project brain: set it up](#b-project-brain-set-it-up) |
| work in a project that already has a brain | [C. Project brain: join as a team member](#c-project-brain-join-as-a-team-member) |

### A. Private brain

Your own Git repository, only for you. Start in an empty folder – brain creates the repository:

```bash
mkdir ~/knowledge && cd ~/knowledge
brain init --private .
# Nur lokal – Pushen verhindern? [Y/n]   → Enter = push guard on (no remote, every push rejected)
git add -A && git commit -m "Add private knowledge"
claude                                   # start Claude Code here, in the repository root
```

- `.` makes the repository root the knowledge folder; any other folder name works as well.
- Decide on the push guard before you answer – it decides how you back up (details: [Push guard and backup](#private-mode-push-guard-and-backup)):
  - **`Y` (push guard on):** the knowledge never leaves this folder. No Git remotes at all – you back up yourself, e.g. with `git bundle` onto a backup drive.
  - **`n` or `--allow-push` (push guard off):** you may add Git remotes and push to them, e.g. a backup drive or a private repository on a Git host.

**A second machine:** install brain there (steps 1–3), then get the repository – without push guard by cloning from your remote, with push guard by copying it or cloning from a bundle (`git clone knowledge.bundle ~/knowledge`). A clone from a bundle has the bundle as remote `origin`; with push guard on remove it (`git remote remove origin`). Then run in it:

```bash
brain init --update     # re-installs the push guard (if on) – a clone has no hooks
brain setup             # plugin for this checkout, INDEX.md, qmd index
```

### B. Project brain: set it up

You add a knowledge folder to an existing project repository. Everything you ingest is shared with everyone who can read the repository – read [Project mode: what is shared](#project-mode-what-is-shared) first.

```bash
cd my-project                            # the project repository, at its root
brain init --project knowledge           # brain.yml + knowledge/, plugin enabled for this project
git status                               # review what brain created
git add brain.yml knowledge .claude/settings.json && git commit -m "Add project knowledge"
git push
claude                                   # start Claude Code in the repository root
```

- The knowledge folder must be a subfolder (`knowledge`, `docs/knowledge`, …), never the repository root.
- `.claude/settings.json` is what makes the plugin show up for your team members – commit it.
- Then tell your team members to follow [C](#c-project-brain-join-as-a-team-member), e.g. with a link to this README in the project's own README.

### C. Project brain: join as a team member

The project already contains `brain.yml`, the knowledge folder and `.claude/settings.json`. You do **not** run `brain init`.

```bash
# once per machine: Installation steps 1–3 (clone brain, ./install.sh)
git clone <project-url> my-project       # or git pull in your existing clone
cd my-project
brain setup                              # once per clone of the project
claude                                   # start Claude Code in the repository root
```

`brain setup`:

1. enables the plugin for this checkout – Claude Code registers project plugins per directory, so without it a new clone shows the plugin with an error such as "not cached",
2. builds `INDEX.md` and `graph.json` (generated, not committed),
3. creates the qmd index for your [search level](#search-levels) – with the default `hybrid` this downloads ~2.5 GB of models once; to avoid that use `BRAIN_SEARCH=keyword brain setup` and set the level permanently,
4. restores `.claude/settings.json` if Claude Code only reordered it.

Afterwards the session start shows a line like `Brain: knowledge/ (mode: project, search: hybrid)` – brain is active.

### brain init in detail

Interactively – without flags `brain init` asks for everything it needs:

```bash
brain init
# Modus – project (…) oder private (…)? [project/private]   → mode
# Wissens-Ordner [knowledge]:                              → folder, relative to the repository root
# Nur lokal – Pushen verhindern? [Y/n]                     → push guard (private only)
```

With flags: `brain init [--project | --private [--allow-push]] [<folder>]`. Without a terminal and without `--project`/`--private`, `brain init` uses project mode. `--project` and `--private` together, `--allow-push` without `--private`, the repository root as folder in project mode and a repository with a remote while the push guard is on are refused before anything is written.

What `brain init` does: it writes `brain.yml` at the repository root, creates the knowledge folder (`inbox/`, `archive/`, `wiki/`, `categories.yml` and the files from `template/`), installs the push guard if chosen, sets up the qmd index for your [search level](#search-levels) and enables the plugin for the repository: it declares the `brain` marketplace and the plugin in `.claude/settings.json` (`extraKnownMarketplaces` with `autoUpdate`, `enabledPlugins`). If `brain init` printed a `claude plugin …` hint instead, run that command first – `.claude/settings.json` only exists afterwards. At the end it prints the exact `git add … && git commit …` command for what it created.

`brain init` never commits.

## Usage

Start Claude Code in the repository root – project-scoped plugins (`.claude/settings.json`) are only active there, not when Claude Code is started in a subfolder:

- `/brain:ingest [note text]` – process `inbox/` (and an optional note given inline). Review and commit the changes afterwards.
- `/brain:ask [--archive | --all] <question>` – answer from the knowledge only.
- Ask project questions while you work – the `brain` skill searches the knowledge first.

## Search with qmd

### What qmd is

[qmd](https://github.com/tobi/qmd) is a search engine for Markdown files that runs entirely on your machine. It keeps a search index of the files and offers two kinds of search:

- **keyword search (BM25)** – finds entries that contain the words of the query and ranks them by how often and where the words occur. Fast, no models needed.
- **semantic search** – small AI models (run locally, downloaded once from Hugging Face) turn entries and queries into vectors, so qmd also finds entries that mean the same thing in other words. In `hybrid` mode qmd also expands the query into variants and reranks the results with a model.

Your notes never leave your machine – only the models are downloaded. brain gives every knowledge folder its own qmd index (`brain-<repo>-<hash>`) with two collections: `wiki` (searched by default) and `archive` (only on request). Claude uses qmd through the `qmd` MCP server of the plugin; you can use it yourself with `brain qmd …`, e.g. `brain qmd search Ingress -c wiki`.

The index stays current on its own: `/brain:ingest` updates it after every run (`hybrid` also re-embeds the changed entries), and every session start runs `brain index` and `qmd update` in the background.

### Search levels

The level is set **per machine** with the environment variable `BRAIN_SEARCH`, not per knowledge folder – it depends on your hardware, not on the knowledge. Team members of the same project may use different levels.

| `BRAIN_SEARCH` | How Claude searches | Needs | Pros | Cons |
|---|---|---|---|---|
| `hybrid` (default) | `INDEX.md` + qmd: keyword and semantic search, query expansion, reranking | qmd, ~2.5 GB models (one-time download), a GPU is recommended | finds entries by meaning, even with other words or mixed German/English; best ranking | large download; slower queries and embedding on a CPU-only machine; uses RAM while searching |
| `keyword` | `INDEX.md` + qmd keyword search (BM25) | qmd, no models | fast on any machine; small; no download | finds only entries that contain the query words – synonyms and paraphrases are missed |
| `off` | `INDEX.md` (catalog of all entries) + grep in `wiki/` | nothing | nothing to install | Claude has to read the catalog and grep – fine for a small brain, slower and more tokens as it grows; no ranking |

Which one to choose:

- **`hybrid`** if your machine has a GPU (or you accept slower searches) and the brain is large or written in varying words.
- **`keyword`** on laptops without a GPU, in WSL without GPU access, or if you don't want the download – a good default for most team members.
- **`off`** if you cannot install qmd or the brain has only a few dozen entries.

Set the level permanently in your shell profile, then rebuild the index of each knowledge folder:

```bash
echo 'export BRAIN_SEARCH=keyword' >> ~/.zshrc && source ~/.zshrc
cd my-project && brain qmd setup
```

With `off`, also disable the `qmd` MCP server once via `/mcp` in Claude Code. `brain qmd prune` removes indexes of knowledge folders that no longer exist.

## What is your knowledge and what can be rebuilt

**Your knowledge lives only in the knowledge folder** – `archive/` (the original notes), `wiki/` (the condensed entries) and `categories.yml` – together with `brain.yml` at the repository root. Commit it and keep the repository backed up (project mode: the project's remote; private mode: see [Push guard and backup](#private-mode-push-guard-and-backup)). Losing these files means losing knowledge.

Not committed and not rebuildable: notes waiting in `inbox/` exist only on your machine until `/brain:ingest` archives them, and `LOG.md` is a local log of brain operations (history only, no knowledge).

Everything else is derived from those files and can be deleted and rebuilt at any time:

| What | Where | Rebuild with |
|---|---|---|
| `INDEX.md`, `graph.json` | knowledge folder (not committed) | `brain index` – also runs in the background at every session start |
| qmd index (config and database) | `~/.config/qmd/brain-<repo>-<hash>.yml`, `~/.cache/qmd/brain-<repo>-<hash>.sqlite` | `brain qmd setup` – `hybrid` re-embeds all entries; the models stay cached in `~/.cache/qmd/models` |
| Plugin installation for this checkout | Claude Code (`~/.claude/plugins`) | `brain setup` |
| brain CLI | your brain clone | `./install.sh` |

`brain setup` rebuilds all of it for a repository in one go. `brain check` reports a missing or incomplete qmd index.

## CLI

`brain help` lists all commands. Highlights: `brain setup`, `brain check`, `brain index`, `brain category list`, `brain recategorize`, `brain init --update`, `brain qmd setup`, `brain qmd prune`.

## Uninstall

```bash
cd brain
./uninstall.sh      # add --yes to delete the qmd indexes without asking
```

It removes the `brain` CLI and – after confirmation – the qmd indexes of all knowledge folders (`brain-*` in `~/.config/qmd` and `~/.cache/qmd`; the models and other qmd indexes stay). Knowledge folders, repositories and Claude Code settings are never touched. qmd stays installed as well (it is a standalone tool you may use elsewhere); remove it with `npm rm -g @tobilu/qmd` and, if you like, delete its models and remaining indexes in `~/.cache/qmd` and `~/.config/qmd`. The plugin stays installed; remove it per project with `claude plugin uninstall brain@brain --scope project`, or everywhere with `claude plugin marketplace remove brain` – note that the latter also removes `brain@brain` from the `.claude/settings.json` of shared projects.

## Repository layout

- `scripts/` – the `brain` CLI (TypeScript, tests: `npm --prefix scripts test`)
- `plugin/` – the Claude Code plugin (commands, skill, hook, MCP config)
- `.claude-plugin/marketplace.json` – the `brain` marketplace
- `template/` – files copied into a knowledge folder (`.gitignore`, `.gitattributes`, `CLAUDE.md`)
- `docs/superpowers/` – specs, plans and notes

## Credits

This project is based on the second brain approach presented by [The Node AI](https://www.youtube.com/@TheNodeAI) in the video [„Der echte Weg zum Second Brain: Ohne Programmieren. Vergiss Obsidian."](https://www.youtube.com/watch?v=mHSOsy_usAg) (German), and on the *LLM wiki* idea by Andrej Karpathy – an LLM that maintains a Markdown wiki instead of searching raw documents for every question. Thanks for the inspiration!

## License

MIT – see [LICENSE](LICENSE).
