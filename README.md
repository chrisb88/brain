# brain

brain keeps your knowledge (a "second brain") in plain Markdown files, maintained by [Claude Code](https://claude.com/claude-code) and searchable with [qmd](https://github.com/tobi/qmd).

Use it **per project** – the knowledge lives in a folder of the project repository and is shared with everyone who works on it – or **privately** in its own repository that is protected against pushing. Both have the same layout.

You drop raw notes into an inbox; `/brain:ingest` archives the originals unchanged and works the knowledge into condensed, categorized, cross-linked wiki entries. `/brain:ask` answers questions strictly from the brain, with source links. While you code, Claude consults the brain on its own when a question touches project knowledge.

Based on the approach by [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg) – see [Credits](#credits).

> **Note:** Instructions, slash commands and wiki entries are written in German. Code, CLI and file formats are English.

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

Projects set up with `brain init` update the plugin automatically (`autoUpdate` on the `brain` marketplace in `.claude/settings.json`). Elsewhere, e.g. for a private brain, enable it once: `/plugin` → Marketplaces tab → `brain` → Enable auto-update (third-party marketplaces are not auto-updated by default). Claude Code checks for updates during a session; the new version loads at the next start. The CLI still needs `git pull` in your brain clone – if plugin and CLI versions differ, the session start prints a warning.

## Create a knowledge folder

In a project repository:

```bash
cd my-project
brain init knowledge          # brain.yml + knowledge/, plugin enabled for this project
git add brain.yml knowledge .claude/settings.json && git commit -m "Add project knowledge"
```

Private knowledge (own repository, never pushed):

```bash
mkdir ~/knowledge && cd ~/knowledge
brain init --private .
```

`brain init` also enables the plugin for the project: it declares the `brain` marketplace and the plugin in `.claude/settings.json` (`extraKnownMarketplaces` with `autoUpdate`, `enabledPlugins`). Team members run `brain setup` once after cloning (see below). If `brain init` printed a `claude plugin …` hint instead, run that command first – `.claude/settings.json` only exists afterwards.

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

**Your knowledge lives only in the knowledge folder** – `archive/` (the original notes), `wiki/` (the condensed entries) and `categories.yml` – together with `brain.yml` at the repository root. Commit it and keep the repository backed up (project mode: the project's remote; private mode: no remote by design, so back up the repository yourself). Losing these files means losing knowledge.

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

It removes the `brain` CLI and – after confirmation – the qmd indexes of all knowledge folders (`brain-*` in `~/.config/qmd` and `~/.cache/qmd`; the models and other qmd indexes stay). Knowledge folders, repositories and Claude Code settings are never touched. The plugin stays installed; remove it per project with `claude plugin uninstall brain@brain --scope project`, or everywhere with `claude plugin marketplace remove brain` – note that the latter also removes `brain@brain` from the `.claude/settings.json` of shared projects.

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
