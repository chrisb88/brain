# brain

brain keeps your knowledge (a "second brain") in plain Markdown files, maintained by [Claude Code](https://claude.com/claude-code) and searchable with [qmd](https://github.com/tobi/qmd).

Use it **per project** – the knowledge lives in a folder of the project repository and is shared with everyone who works on it – or **privately** in its own repository that is protected against pushing. Both have the same layout.

You drop raw notes into an inbox; `/brain:ingest` archives the originals unchanged and works the knowledge into condensed, categorized, cross-linked wiki entries. `/brain:ask` answers questions strictly from the brain, with source links. While you code, Claude consults the brain on its own when a question touches project knowledge.

Based on the approach by [The Node AI](https://www.youtube.com/watch?v=mHSOsy_usAg) – see [Credits](#credits).

> **Note:** Instructions, slash commands and wiki entries are written in German. Code, CLI and file formats are English.

## Features

- **Markdown is the single source of truth** – Obsidian-compatible (`[[wiki links]]`, YAML frontmatter, callouts).
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

`brain init` also enables the plugin for the project: it declares the `brain` marketplace and the plugin in `.claude/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`), so team members get the plugin offered when they start Claude Code. If `brain init` printed a `claude plugin …` hint instead, run that command first – `.claude/settings.json` only exists afterwards.

`brain init` never commits. Team members need `./install.sh` once and `brain qmd setup` once per clone (unless `BRAIN_SEARCH=off`). Until they have, the plugin prints a hint at session start (and the `qmd` MCP server cannot start).

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

## CLI

`brain help` lists all commands. Highlights: `brain check`, `brain index`, `brain category list`, `brain recategorize`, `brain init --update`, `brain qmd setup`, `brain qmd prune`.

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
