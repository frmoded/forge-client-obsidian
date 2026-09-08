# forge-client-obsidian

An Obsidian plugin for writing notes that mix plain-language prose with
runnable Python and running that Python right inside Obsidian — no
separate Python install, engine, or terminal setup on your machine.

**Status**: currently distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat)
or a manual zip install (see below). A submission to Obsidian's
community plugin directory is in progress.

## What it does

- Write a note in three linked parts: a plain-language **Description**
  of what you want, a structured **Recipe**, and the **Python** code
  that actually runs. Edit whichever one you're comfortable with, and
  the others stay in sync.
- Click **Forge** on any note to run it and see the result right in
  the editor — no terminal required.
- Open a built-in 3D particle simulator and interact with a live
  physics simulation from inside Obsidian.
- Draw on a growing library of ready-made notes for simulation and
  music composition, or write your own.
- Everything computes locally in your browser (via Pyodide). The only
  optional network call is to a hosted service that turns a
  plain-language Description into a Recipe.

## For end-users

**[Full install guide: INSTALL.md](INSTALL.md)** — plain-language
walkthrough, no terminal/git/npm/Python knowledge assumed.

Quick version:

1. Download the latest `forge-client-obsidian-vX.Y.Z.zip` from the
   [Releases page](https://github.com/frmoded/forge-client-obsidian/releases).
2. Unzip it into `<your-vault>/.obsidian/plugins/forge-client-obsidian/`.
3. In Obsidian: **Settings → Community plugins**, enable **Forge Client**.

See [INSTALL.md](INSTALL.md) for the full walkthrough, including
one-time token setup for the note-authoring service and a
troubleshooting section.

## For plugin development

### Build

```bash
npm install
npm run setup-assets       # one-time: vendor Pyodide + wheels (~14 MB)
npm run build              # produces main.js + assets/manifest.json
npm test                   # node --test src/*.test.ts
```

### Release zip

```bash
npm run release-zip        # produces dist/forge-client-obsidian-v<version>.zip
```

The release-zip step runs four preflights, and **all of them run every time** — each returns a verdict and the script exits once, at the end, so a failure early in the list can't hide a failure later in it:

1. **File existence** (`REQUIRED_FILES`) — every artifact the zip must contain.
2. **Version stamp** — `main.js`'s built-in version must match `manifest.json`. Catches a manifest bump that never got an `npm run build`; that gap shipped v0.2.357 with a stale stamp.
3. **Drift**: engine-bundle (`assets/engine/forge/` byte-equal to `../forge/forge/`) and, per bundled vault, `assets/vaults/<name>/` byte-equal to `../<name>/`.
4. **`inputs:` frontmatter** — for each bundled vault, every note's `inputs:` must agree with what its own Recipe declares. Runs `forge/scripts/stamp_inputs.py --check` as a subprocess (the derivation rule is Python; there is deliberately no JS copy of it). Skipped, loudly, when the `../forge` sibling repo isn't checked out; a missing Python interpreter is a **failure**, not a skip.

All four fail loudly with actionable hints naming what to run next.

### Engine bundle sync

The plugin's bundled engine lives at `assets/engine/forge/` — a subset of `~/projects/forge/forge/` containing `core/`, `moda/`, `music/`, and the top-level `__init__.py`. This is what Pyodide imports at runtime.

When you edit `~/projects/forge/forge/` (any file under the in-scope dirs above), run:

```bash
npm run sync-engine-bundle
```

This idempotently copies every in-scope source file into the bundle and deletes any orphans. The release-zip preflight refuses to ship a zip with engine drift, so running this script regularly is the dev workflow that keeps the preflight clean.

Scope filter (mirrored in `src/engine-bundle-drift-core.ts` and `scripts/sync-engine-bundle.mjs`):

- **In scope**: `__init__.py`, `core/**/*.py`, `moda/**/*.py`, `music/**/*.py`.
- **Excluded**: `api/`, `installer/`, `sdk/`, `builtins/`, `config.py`, `__pycache__/`, `tests/`. (The engine source has more than the plugin needs; bundle is intentionally a subset.)

### Pure-core test convention

Non-trivial logic lives in pure-TS files (`src/<name>.ts` or `src/<name>-core.ts`) with no `import 'obsidian'`. Obsidian-coupled glue files in `src/` re-export the helpers and wire them into the plugin lifecycle. Tests in `src/*.test.ts` import only from the pure-core files; `node --test` runs cleanly without any Obsidian shim. See `src/engine-bundle-drift-core.ts` + `src/engine-bundle-drift.test.ts` for the canonical shape.

### Vault maintenance scripts

Two similarly-named helpers that answer different questions:

| Script | Question it answers |
|---|---|
| `scripts/vault-drift-audit.sh` | Which vaults on this machine are running a stale **plugin version**? |
| `scripts/vault-drift-cleanup.sh` | What uncommitted **note content** has piled up in one vault, and what do I want to do with it? |

`vault-drift-cleanup.sh` triages content drift — the local edits, new notes, and deletions that accumulate between installs as the plugin re-extracts bundled vault content and driver/wizard/CCQA edit notes in place:

```bash
bash scripts/vault-drift-cleanup.sh --report     # categorized summary (default, non-destructive)
bash scripts/vault-drift-cleanup.sh --stash      # set everything aside; git stash pop restores
bash scripts/vault-drift-cleanup.sh --commit     # interactive, per category
bash scripts/vault-drift-cleanup.sh --purge      # discard everything; requires typing YES
```

Target a vault other than the `install-latest.sh` default with `VAULT=<path>`:

```bash
VAULT=~/forge-vaults/ClaudeQA bash scripts/vault-drift-cleanup.sh --report
```

Note that `install-latest.sh` never touches vault notes — it only swaps the plugin directory and preserves `data.json`. Content drift comes from the plugin's runtime bundled-vault extraction plus local editing, so run this after an install if a vault feels cluttered.

## License

See [LICENSE](LICENSE) and the engine repo for upstream attribution.

## Part of the Forge ecosystem

- Engine: https://github.com/frmoded/forge
- Vaults: https://github.com/frmoded/forge-moda, https://github.com/frmoded/forge-music
