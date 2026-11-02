# brain

brain keeps your knowledge (a "second brain") in plain Markdown files, maintained by [Claude Code](https://claude.com/claude-code) and searchable with [qmd](https://github.com/tobi/qmd).

Use it **per project** (knowledge is committed to the project repository and shared with everyone who can read it) or **privately** (own repository, only for you) – see [Two modes](#two-modes-project-or-private).

You drop raw notes into an inbox; `/brain:ingest` archives the originals unchanged and works the knowledge into condensed, categorized, cross-linked wiki entries. `/brain:ask` answers questions strictly from the brain, with source links. While you code, Claude consults the brain on its own when a question touches project knowledge.

Based on the approach by [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg) – see [Credits](#credits).

> **Note:** Instructions, slash commands and wiki entries are written in German. Code, CLI and file formats are English.

## Two modes: project or private

You choose the mode once, when you create the knowledge folder: `brain init` asks for it, or you pass `--project` or `--private`.

| | **Project** | **Private** |
|---|---|---|
| Command | `brain init --project [<folder>]` | `brain init --private [--allow-push] [<folder>]` |
| Where the knowledge lives | a folder inside an existing project repository | its own Git repository (created if needed) |
| Who can read it | **everyone who can read the project repository** – once you commit and push, the knowledge travels with the code | **only you** – unless you allow a remote yourself (see [Push guard](#push-guard-private-mode)) |
| Pushed | yes, together with the project, by you | by default never: the push guard rejects every push |
| Good for | architecture decisions, domain knowledge, how-tos, onboarding | personal notes, learning, anything you would not share with the team |
| Backup | the project's remote | your responsibility – copy the repository, or allow a remote of your own |

Both modes use the same folder layout, the same commands and the same plugin. brain never commits and never pushes in either mode – you review and commit knowledge changes like code.

### Project mode: what is shared

> **Project mode shares everything you ingest.** `/brain:ingest` writes wiki entries and archives your original notes byte-identical in the knowledge folder. Once you commit and push, everyone with read access to the project repository can read both – today's collaborators, future ones, and for a public repository the whole internet. Deleting an entry later does not remove it from the Git history. Don't ingest personal or confidential notes (passwords, customer data, personal matters) into a project brain – use a private brain for those.

Committed: `brain.yml`, the knowledge folder (`wiki/`, `archive/`, `categories.yml`, `.gitignore`, `.gitattributes`, `CLAUDE.md`) and `.claude/settings.json`. Not committed (ignored by the knowledge folder's `.gitignore`): notes waiting in `inbox/`, `INDEX.md`, `graph.json` and `LOG.md`.

### Push guard (private mode)

`brain init --private` asks: *Nur lokal – Pushen verhindern? [Y/n]* (local only – prevent pushing?). The answer is stored as `push_guard` in `brain.yml`.

- **Yes (default, `push_guard: true`) – local only.** The repository must not have a remote: `brain init` refuses a repository with a remote, and `brain check` reports one as an error. brain installs a Git `pre-push` hook that rejects every push and says how to allow pushing. Without a terminal (scripts, CI) brain does not ask and uses this setting.
- **No (or `--allow-push`, `push_guard: false`) – remote allowed.** You may add a remote of your own and push to it yourself, e.g. a backup drive, your own server or a private repository on a Git host. **brain cannot tell who can read a remote** – never use a public repository for private knowledge.

Limits of the push guard: it is a local Git hook. It protects against an accidental push, not against a deliberate one (`git push --no-verify` skips it), and it is not part of a clone – a copy of the repository is not protected until you run `brain init --update` in it.

Claude never adds a remote while the push guard is on, and never pushes in any mode.

**Switch later:** change `push_guard` in `brain.yml`, then run `brain init --update` (installs or removes the hook) and commit `brain.yml`:

```bash
cd ~/knowledge
sed -i 's/^push_guard: true$/push_guard: false/' brain.yml   # or edit the file by hand
brain init --update                                          # prints "Push-Schutz entfernt"
git add brain.yml && git commit -m "Allow pushing"
git remote add backup /mnt/backup/knowledge.git              # a remote of your own
```

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
| `push_guard` | `true`, `false` – only with `mode: private`; missing means `true` | see [Push guard](#push-guard-private-mode) |

After every change to `brain.yml` run `brain init --update`. It always rewrites `brain.yml` in the current format – values are kept, missing keys are written with their default, **your own comments and formatting in this file are lost**.

## Features

- **Markdown is the single source of truth** – Obsidian-compatible (`[[wiki links]]`, YAML frontmatter, callouts). Your knowledge exists only in the knowledge folder; everything else can be rebuilt (see [What is your knowledge](#what-is-your-knowledge-and-what-can-be-rebuilt)).
- **Originals are never modified** – notes are archived byte-identical under `archive/<category>/YYYY/MM/`.
- **Condense, don't accumulate** – new knowledge is merged into existing entries; conflicts and open questions are marked and reported by `brain check`.
- **Strict categories** – new categories only with approval, otherwise `_uncategorized`.
- **Fast search** – `INDEX.md` catalog plus a qmd index per knowledge folder; search level per machine (`BRAIN_SEARCH`).
- **Claude Code plugin** – commands, skill, qmd MCP server and a session hook; nothing is copied into your project's own Claude configuration.
- **Never commits** – you review and commit knowledge changes like code.

## Requirements

- Linux or WSL, Git, Node.js ≥ 24
- [Claude Code](https://claude.com/claude-code)
- [qmd](https://github.com/tobi/qmd) (`npm install -g @tobilu/qmd`) – optional with `BRAIN_SEARCH=off`

## Installation (every user)

```bash
git clone git@github.com:chrisb88/brain.git
cd brain
./install.sh        # brain CLI on your PATH, plugin marketplace registered in Claude Code
```

Update: `git pull && ./install.sh` and `claude plugin update brain@brain`.

Repositories set up with `brain init` – project and private – update the plugin automatically (`autoUpdate` on the `brain` marketplace in `.claude/settings.json`). Elsewhere enable it once: `/plugin` → Marketplaces tab → `brain` → Enable auto-update (third-party marketplaces are not auto-updated by default). Claude Code checks for updates during a session; the new version loads at the next start. The CLI still needs `git pull` in your brain clone – if plugin and CLI versions differ, the session start prints a warning.

## Create a knowledge folder

Interactively – `brain init` asks for everything it needs:

```bash
brain init
# Modus – project (…) oder private (…)? [project/private]   → mode
# Wissens-Ordner [knowledge]:                              → folder, relative to the repository root
# Nur lokal – Pushen verhindern? [Y/n]                     → push guard (private only)
```

Or with flags, without questions:

**Project** – run it inside the project repository:

```bash
cd my-project
brain init --project knowledge          # brain.yml + knowledge/, plugin enabled for this project
git add brain.yml knowledge .claude/settings.json && git commit -m "Add project knowledge"
```

**Private** – in an empty folder; brain creates the Git repository:

```bash
mkdir ~/knowledge && cd ~/knowledge
brain init --private .                  # asks about the push guard; add --allow-push to allow a remote
git add -A && git commit -m "Add private knowledge"
```

Without a terminal and without `--project`/`--private`, `brain init` uses project mode. `--project` and `--private` together, `--allow-push` without `--private` and a repository with a remote while the push guard is on are refused before anything is written.

What `brain init` does: it writes `brain.yml` at the repository root, creates the knowledge folder (`inbox/`, `archive/`, `wiki/`, `categories.yml` and the files from `template/`), installs the push guard if chosen, sets up the qmd index for your [search level](#search-levels) and enables the plugin for the repository: it declares the `brain` marketplace and the plugin in `.claude/settings.json` (`extraKnownMarketplaces` with `autoUpdate`, `enabledPlugins`). Team members run `brain setup` once after cloning (see below). If `brain init` printed a `claude plugin …` hint instead, run that command first – `.claude/settings.json` only exists afterwards.

`brain init` never commits.

### Team members (after cloning)

```bash
./install.sh        # once per machine, from your brain clone
cd my-project
brain setup         # once per clone
```

`brain setup` enables the plugin for this checkout (Claude Code registers project plugins per directory, so a new clone shows the plugin with an error such as "not cached" until then), builds `INDEX.md` and `graph.json` (generated, not committed) and creates the qmd index for your `BRAIN_SEARCH` level. With the default `hybrid` this downloads ~2.5 GB of models; use `BRAIN_SEARCH=keyword brain setup` (and set the level permanently, see [Search levels](#search-levels)) to avoid that. Then start Claude Code in the repository root. If `.claude/settings.json` was only reordered by Claude Code, `brain setup` restores the committed file.

## Usage

Start Claude Code in the repository root – project-scoped plugins (`.claude/settings.json`) are only active there, not when Claude Code is started in a subfolder:

- `/brain:ingest [note text]` – process `inbox/` (and an optional note given inline). Review and commit the changes afterwards.
- `/brain:ask [--archive | --all] <question>` – answer from the knowledge only.
- Ask project questions while you work – the `brain` skill searches the knowledge first.

## Search levels

Set per machine, e.g. in `~/.zshrc`:

| `BRAIN_SEARCH` | Search | Needs |
|---|---|---|
| `hybrid` (default) | qmd with query expansion, embeddings, reranking | qmd + ~2.5 GB models, GPU recommended |
| `keyword` | qmd BM25 only | qmd, no models |
| `off` | `INDEX.md` and grep | nothing – disable the `qmd` MCP server once via `/mcp` |

After changing the level run `brain qmd setup` in the repository. Each knowledge folder has its own qmd index (`brain-<repo>-<hash>`); `brain qmd prune` removes indexes of knowledge folders that no longer exist.

## What is your knowledge and what can be rebuilt

**Your knowledge lives only in the knowledge folder** – `archive/` (the original notes), `wiki/` (the condensed entries) and `categories.yml` – together with `brain.yml` at the repository root. Commit it and keep the repository backed up (project mode: the project's remote; private mode: with the push guard on there is no remote, so back up the repository yourself – or switch the push guard off and push to a remote of your own, see [Push guard](#push-guard-private-mode)). Losing these files means losing knowledge.

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

This project is based on the second brain approach presented by [The Node AI](https://www.youtube.com/@TheNodeAI) in the video [„Der echte Weg zum Second Brain: Ohne Programmieren. Vergiss Obsidian."](https://www.youtube.com/watch?v=mHSOsy_usAg) (German). Thanks for the inspiration!

## License

MIT – see [LICENSE](LICENSE).
