# Reconcile installed-vault forge-moda pins to v0.4.10

## Scope

After v0.4.10 of forge-moda landed in the registry (forge-registry
commit 8bb6e89), the per-vault installations of forge-moda need to
be re-installed so that both the installed file content AND the
`forge.toml` manifest pin in each user vault match the registry
v0.4.10. The previous prompt's "direct mirror into installed vault
subdirs" approach left at least bluh's manifest stale at v0.4.4,
and the installed `bluh/forge-moda/go.md` is still un-trimmed.

For each of `foo`, `bluh`, `dry-run-vault`:
1. Pre-flight inspect (what's there now).
2. Run the install action against forge-moda, no version arg →
   resolves to latest = v0.4.10.
3. Post-flight verify.
4. Preserve user shadows at vault root (bluh/go.md, etc.).

## Why

Two reasons:

1. **Immediate user-visible bug.** Bluh smoke test step 1
   (manifest version pin) and step 2 (go.md trimmed render) both
   fail. The "mirror polished content into installed vault subdirs"
   pattern from the prior prompt either didn't actually reach
   `bluh/forge-moda/go.md` or didn't take effect; either way, the
   `bluh/forge.toml` pin is stale at `0.4.4`.

2. **Pattern correction.** The clean shipping path for vault
   content updates is: publish to registry → install (or update)
   in each consumer vault. The install action atomically updates
   both file content and manifest pin, so they can never drift.
   The "direct mirror" shortcut skips the manifest, creating a
   mismatch where installed content claims one version but the
   manifest says another. This prompt is the cleanup; future
   content-ship prompts will use the install path from the start.

## Files to modify

Three user-vault directories (all OUTSIDE the `~/projects` mount —
these are the user's real vaults under `~/forge-vaults/`):

- `/Users/odedfuhrmann/forge-vaults/foo/`
  - `forge.toml` — dep pin for `forge-moda` bumped to `0.4.10`
  - `forge-moda/` — installed content overwritten with v0.4.10 tarball
- `/Users/odedfuhrmann/forge-vaults/bluh/`
  - `forge.toml` — dep pin for `forge-moda` bumped to `0.4.10`
  - `forge-moda/` — installed content overwritten with v0.4.10 tarball
  - `go.md`, `setup.md`, `on_mouse_click.md` at vault root (user
    shadows) — **DO NOT TOUCH**. Especially `bluh/go.md`, which
    contains user `print("foo")` lines flagged in the prior
    feedback.
- `/Users/odedfuhrmann/forge-vaults/dry-run-vault/`
  - same as above

## Implementation notes

### Choosing the install path

The install action lives at
`forge/builtins/snippets/install.md`. It's a Python snippet that
chains: `forge/registry/lookup` → `forge/registry/fetch` →
`forge/vault/extract` → `forge/manifest/add_dep` →
`forge/registry/refresh`. Several ways CC can invoke it:

1. **CLI** — if there's a `forge install <vault_name>` (or similar)
   that accepts a target vault path, use that. It's the most
   idiomatic.
2. **Python script** — construct a Context against the target vault
   and call `context.compute("forge/install",
   vault_name="forge-moda")`. If this path is needed, the script
   can live at
   `/Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py`
   (create `scripts/` if it doesn't exist).
3. **Manual step chain** — call each of registry/lookup,
   registry/fetch, vault/extract, manifest/add_dep,
   registry/refresh individually. Last resort.

Pick the path that's idiomatic. Document the chosen approach + its
invocation in the feedback. If you write a script under (2), keep
it minimal and don't generalize it beyond what this prompt needs.

### Per-vault sequence

For each of `foo`, `bluh`, `dry-run-vault` (in that order):

1. **Pre-flight.**
   - Read `<vault>/forge.toml` — record the current `forge-moda`
     pin version.
   - Read `<vault>/forge-moda/go.md` — record whether body matches
     v0.4.4 shape (long C8 narrative) or v0.4.10 shape (trimmed,
     wikilinked).
   - Check `<vault>/` for root-level `.md` files whose names match
     forge-moda snippets (`go.md`, `setup.md`, `on_mouse_click.md`,
     etc.) — these are user shadows. Hash them for post-install
     comparison.

2. **Run install.** Invoke `forge/install` with
   `vault_name="forge-moda"` (no version arg). Confirm it:
   - Resolves to v0.4.10 from registry.
   - Downloads + verifies tarball sha.
   - Extracts into `<vault>/forge-moda/`.
   - Updates `<vault>/forge.toml` dep entry to `version = "0.4.10"`.
   - Refreshes snippet registry.

3. **Post-flight verify.**
   - `<vault>/forge.toml` — pin reads `0.4.10`.
   - `<vault>/forge-moda/go.md` — body matches the v0.4.10 trimmed
     shape (Inputs line, Defaults line, two wikilinked `Call` lines,
     nothing else).
   - `<vault>/forge-moda/_meta/_chips.md` — all 16 chips have
     `Call [[...]]` wikilink form.
   - `diff -r <vault>/forge-moda/ /Users/odedfuhrmann/projects/forge-moda/`
     — should be empty (ignoring `.DS_Store` and any
     `.forge/edges/` directories).

4. **User-shadow integrity.** Re-hash the root-level shadow files
   identified in pre-flight. Confirm bit-identical to pre-flight.
   List in feedback. Specifically for bluh: confirm `bluh/go.md`
   still contains the `print("foo")` lines in both English body
   and Python facet.

### Orphan files

If pre-flight reveals files in `<vault>/forge-moda/` that aren't
in the v0.4.10 tarball (i.e., files that existed in some prior
version and were removed in v0.4.10), **flag them in the feedback,
do NOT delete them**. Deletion is a separate decision the user
will make.

For reference: v0.4.4 → v0.4.10 polish was content-only, no file
adds/removes, so this list should be empty. Flag any surprises.

### Stop-on-failure

Process foo, bluh, dry-run-vault sequentially. If install fails on
any vault, stop, leave the already-installed vault(s) in their
post-install state, and route this prompt to `failed/` with a
concrete description of the blocker. Don't continue past a failure
to "see what else breaks."

## Tests

No automated tests to add — this is a per-vault deploy reconcile.

**Manual GUI verification (user runs after this lands):**
1. Open Bluh in Obsidian. Open `bluh/forge.toml` — pin reads
   `0.4.10`.
2. Open `bluh/forge-moda/go.md` — trimmed body with two wikilinked
   `Call` lines.
3. Hover one wikilink → preview pop. Click → navigates.
4. Open chips pane → 16 chips, hover tooltip works.
5. Click any chip → insertion has wikilink form.
6. Open `bluh/go.md` (root shadow) — `print("foo")` lines still
   present in both English and Python.
7. (Optional) Repeat steps 1-5 in foo and dry-run-vault.

## Out of scope

- Re-publishing forge-moda. v0.4.10 is already in the registry.
- Updating any other vault dependency (forge-music, forge-core,
  etc.) in these user vaults.
- Re-running `/generate` on any snippet.
- Touching the authoring vault at
  `/Users/odedfuhrmann/projects/forge-vaults/forge-moda-vault/`.
  Already synced.
- Changing the install action itself, or writing a new `update`
  action that walks all deps. Separate design questions.
- Deleting orphan files if any are found. Flag-only.
- Any change to the library at `/Users/odedfuhrmann/projects/forge-moda/`
  or the registry at `/Users/odedfuhrmann/projects/forge-registry/`.
- Any change to the prior feedback file
  (`prompts/feedback/2026-05-21-2200-...md`). It is the historical
  record of what was tried; don't rewrite history.

## Report when done

Per protocol 8-section CC report convention. Specifically:

1. **Install path chosen.** Which of the three options (CLI,
   Python script, manual step chain), and the actual invocation
   used. If you wrote a script, list its path.
2. **Per-vault pre-flight state.** For each vault: pre-install
   manifest pin, pre-install `go.md` shape, list of root-level
   user shadows detected.
3. **Per-vault post-flight state.** Manifest pin, `go.md` shape,
   result of the `diff -r` against the library.
4. **User-shadow integrity.** Pre-vs-post hash comparison per
   shadow. Should show zero touched. Call out bluh/go.md
   specifically.
5. **Orphan files.** Any files in installed vault not in the
   v0.4.10 tarball. Listed, not deleted.
6. **Commit SHAs.** None expected. See Don'ts.
7. **Observation.** Any friction with the install action that
   suggests a future improvement — e.g., should install pre-clear
   the target dir? Should there be a `forge update <vault_name>`
   shortcut for the version-bump-only case? Capture once for a
   follow-up; don't act on it here.

## Don'ts

- **Don't commit anything.** User vaults are managed by the user;
  the library and registry are already at v0.4.10.
- **Don't delete orphan files.** Flag only.
- **Don't touch user shadows.** If the install action would
  overwrite a root-level shadow, abort, route to `failed/`, and
  flag.
- **Don't re-publish forge-moda.** v0.4.10 is already in the
  registry.
- **Don't write a generic "update all vaults" script.** Three
  vaults; a simple loop in feedback is fine. If a follow-up
  reveals it's worth generalizing, that's a separate prompt.
- **Don't modify the install action itself.** This prompt is a
  consumer; engine changes are a separate prompt.
- **Don't proceed past a per-vault failure.** Stop, route to
  `failed/`, report concretely.
