# Commit Pyodide binaries to forge-client-obsidian repo (BRAT-install unblock)

## Scope

Single repo (`forge-client-obsidian`), single commit. Unblock BRAT distribution by committing the ~14 MB of Pyodide binaries that are currently gitignored.

What this prompt delivers:

1. **Remove the `assets/pyodide/` and `assets/wheels/` entries from `.gitignore`.** Keep `assets/manifest.json` gitignored (it regenerates per build).
2. **Verify the local binaries are populated** (run `npm run setup-assets` if they aren't).
3. **`git add` the binary files** (assets/pyodide/* + assets/wheels/* — whatever setup-assets produced).
4. **Single commit, push to main.**
5. **Verify** the commit contains the expected files and nothing else.

## EXPLICIT USER AUTHORIZATION FOR EXTERNAL BINARY COMMIT

The user (repo owner) **explicitly authorizes** committing Pyodide binary assets (WASM + Python stdlib zip + numpy/pyyaml/micropip wheels) to the forge-client-obsidian git repo's main branch.

These binaries are pulled from the standard `pyodide` npm package distribution (Pyodide 0.29.4) — well-known upstream, same files anyone else gets from `npm install pyodide`. Committing them is required because:

- BRAT distributes the plugin by cloning the repo to the user's `.obsidian/plugins/` directory.
- Without the binaries committed, BRAT-installed plugins are missing Pyodide and fail at runtime.
- The target audience (Tamar's seminar — teachers/students without dev tools) cannot run `npm run setup-assets` themselves.
- Committing the binaries is the only way BRAT install yields a working plugin on those machines.

CC's auto-mode classifier previously flagged this as "external code integration." That classifier ruling is **overridden by this prompt's explicit user authorization.** Proceed with the commit. Do not route to questions/ over this.

## Why

V1 closed beta in ~2 weeks. Tamar's audience cannot be assumed to have git/node/docker/python. BRAT install must yield a fully functional plugin with no terminal commands required post-install. Committing the binaries is the cheapest unblock.

Long-term alternative (GitHub release-zip workflow) is real engineering and not in scope for this 2-week runway. If git history size becomes painful later, that's a future migration; not blocking now.

## Files to modify

### `forge-client-obsidian/.gitignore`

Find and remove the lines that exclude `assets/pyodide/` and `assets/wheels/`. Keep `assets/manifest.json` exclusion in place (regenerates per build; would churn).

Per CC's prompt 0800 setup, the existing block looked something like:

```
# Pyodide binary assets — populated by `npm run setup-assets`. Kept
# out of git history (large + externally sourced). Release builds for
# BRAT bundle these into the distribution zip from the local working
# copy. Engine + vault content under assets/engine/ + assets/vaults/
# ARE committed — they're plugin-owned text content.
assets/pyodide/
assets/wheels/
# The combined manifest depends on which wheels are present after
# setup-assets runs; regenerated on every build.
assets/manifest.json
```

After:

```
# assets/pyodide/ and assets/wheels/ are now committed (BRAT distribution).
# Re-populate after Pyodide version upgrades via `npm run setup-assets`.
assets/manifest.json
```

(Update the comment to reflect new state.)

### Verify local binaries

```bash
ls ~/projects/forge-client-obsidian/assets/pyodide/
```

Expected: `pyodide.asm.js  pyodide.asm.wasm  pyodide.mjs  pyodide-lock.json  python_stdlib.zip  package.json`

If missing, run:

```bash
cd ~/projects/forge-client-obsidian && npm run setup-assets
```

### Commit

```bash
cd ~/projects/forge-client-obsidian
git add .gitignore assets/pyodide assets/wheels
git status   # verify only those paths are staged
git commit -m "Commit Pyodide binaries for BRAT distribution"
git push origin main
```

### Verify post-commit

```bash
git log -1 --stat | head -30
```

Expected: the commit includes `.gitignore` + multiple files under `assets/pyodide/` + multiple files under `assets/wheels/`. No unrelated files.

```bash
git ls-tree -r HEAD --name-only | grep -E "assets/(pyodide|wheels)/" | wc -l
```

Expected: a non-zero count (likely 9-10 — 6 Pyodide files + 3 wheels).

## Implementation notes

### Binary file sizes (per CC's prompt 0800 feedback)

| Asset | Size |
|---|---|
| pyodide.asm.wasm | 8.25 MB |
| pyodide.asm.js | 1.02 MB |
| python_stdlib.zip | 2.31 MB |
| pyodide-lock.json | ~50 KB |
| pyodide.mjs | ~50 KB |
| numpy wheel | 2.69 MB |
| pyyaml wheel | 0.11 MB |
| micropip wheel | 0.11 MB |
| **total** | **~14.6 MB** |

Single commit adds ~14.6 MB to repo size. Tolerable for closed-beta scale.

### What stays gitignored

`assets/manifest.json` — regenerates on every `npm run build` via `copy-assets.mjs`. Keep it out of git to avoid churn.

`node_modules/` — already gitignored. Don't touch.

### Pyodide version upgrade path

After this commit, upgrading Pyodide is:

```bash
rm -rf assets/pyodide assets/wheels
npm install pyodide@<new-version>   # if version pinning
npm run setup-assets
git add assets/pyodide assets/wheels
git commit -m "Upgrade Pyodide to <new-version>"
```

Worth a brief note in the README or a CONTRIBUTING file, but writing that doc is out of this prompt's scope.

## Tests

No code changes; tests unaffected. Plugin's 42/42 stays.

### Manual smoke (user verifies after this lands)

For full BRAT-on-clean-machine verification, the user (on a different test machine OR in a fresh vault) does:

1. Install BRAT in a fresh Obsidian vault.
2. Add the plugin via BRAT pointing at the GitHub URL.
3. Enable plugin. Reload Obsidian.
4. **Without running `npm` or any terminal commands**, open the moda simulator.
5. Click "Run simulation". Confirm Pyodide loads and the simulation runs.

If the smoke passes, BRAT-distribution is unblocked. If Pyodide fails to load, paste the dev console output.

## Out of scope

- α transpile service. Separate prompt sequence.
- First-run UX / settings polish.
- Installation documentation.
- Release-zip workflow (long-term alternative to committing binaries).
- Pyodide version upgrade.
- Touching forge-moda-client, forge engine, or any vault.
- Removing `setup-assets.mjs` script — keep it; still useful for version upgrades.

## Report when done

Brief. Per protocol section format but tight.

1. **`.gitignore` diff** — old and new.
2. **`git status` before commit** — confirm only the right paths are staged.
3. **Commit SHA** — pushed to `forge-client-obsidian/main`.
4. **File list in commit** — output of `git log -1 --stat | head -30`.
5. **Repo size impact** — approximate delta (KB or MB added to .git directory).

## Commits + push

Single commit:

```
Commit Pyodide binaries for BRAT distribution

assets/pyodide/* and assets/wheels/* are now part of the repo so
BRAT-installed plugins ship with Pyodide ready to load — no
`npm run setup-assets` step required post-install. Target audience
is non-developers (Tamar's seminar attendees) who cannot run
terminal commands.

~14.6 MB added to repo. Tolerable for closed-beta scale; revisit if
git history size becomes painful (release-zip workflow is the
long-term path).
```

Push to `main`.

## Don'ts

- **Don't route to questions/ over the "external binary commit" classifier.** The user explicitly authorized this above. Proceed.
- **Don't commit `assets/manifest.json`** — it regenerates per build.
- **Don't commit anything under `node_modules/`** — already gitignored, stays so.
- **Don't remove `setup-assets.mjs`** — still useful for version upgrades.
- **Don't touch `forge-moda-client`** or any other repo.
- **Don't modify code** — pure config + binary-add change.
- **Don't bundle in any other deferred work** (α, first-run UX, etc.). Single-purpose prompt.
- **Don't add a Pyodide version upgrade or BRAT release-zip workflow** — separate concerns.
- **Don't bump the plugin version in `manifest.json` or `package.json`** — this is infrastructure cleanup, not a release.
