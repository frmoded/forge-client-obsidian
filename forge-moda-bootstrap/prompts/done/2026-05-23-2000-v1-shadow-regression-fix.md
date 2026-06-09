# V1 — fix user-vault shadow regression (mount user vault into MEMFS)

## Scope

Single repo (`forge-client-obsidian`), single phase. Fix the Phase 1 / Phase 2 regression where user shadows at vault root are silently ignored — Pyodide always resolves against the bundled forge-moda library regardless of whether the user has shadowed a snippet.

What this prompt delivers:

1. **Mount the user's active vault into Pyodide MEMFS** at `/bundle/user-vault/` on plugin/Pyodide init.
2. **Skip user's library-named subdirectories** (e.g., `<user-vault>/forge-moda/`) during the mount — those would conflict with the bundled v0.4.16 we trust. Bundled wins.
3. **Mount bundled forge-moda** as a subdirectory of the user vault in MEMFS: `/bundle/user-vault/forge-moda/`. This satisfies A5.1's library-subdirectory convention so the resolver finds the library at the path it expects.
4. **Initialize the resolver** with `vault_path = "/bundle/user-vault"` instead of `"/bundle/vaults/forge-moda"`. A4 + A5.1 then resolve shadows naturally: user's root-level shadow → falls through to bundled library subdir → falls through to built-in.
5. **Drop the hardcoded `_BUNDLED_MODA_SNIPPETS` Set in `server.ts`.** Dispatch becomes unconditional — every compute goes to Pyodide. The Set was the workaround for "I don't know if this snippet is bundled-vs-user-authored"; with the user vault now mounted, the resolver knows.
6. **HTTP fallback retained** for `/generate` and `/canonicalize` (LLM endpoints). Those don't migrate in this prompt.
7. **Document the mid-session edit limitation:** the MEMFS user-vault is a session-start snapshot. If the user edits a snippet mid-session, the iframe must be reloaded to pick up the edit. V1 closed-beta acceptable; hot-reload is a follow-up if it becomes felt.

Does NOT:

- Implement hot-reload of user-vault edits into MEMFS. Document the limitation.
- Touch the iframe (`forge-moda-client`). Pure plugin-side change.
- Touch music21 / forge-music. Phase 3.
- Touch the engine. Resolver behavior is already correct per A4/A5.1.
- Build the α transpile service. Separate.
- Refactor anything beyond what the fix needs.

## Why

V1 closed beta in ~2 weeks (Tamar + trusted students in a seminar). Students will likely shadow snippets to experiment. Today: they edit `bluh/setup.md`, save, click Forge, see the bundled behavior, get confused. **This regression silently breaks the experimentation flow that's the whole point of the educational experience.**

Fix is bounded and well-understood: mount user vault into MEMFS at session start; let the resolver do A4 correctly. The hardcoded-Set workaround drops out as a side effect.

## Files to modify

### `forge-client-obsidian/src/pyodide-host.ts`

Currently mounts bundled forge-moda from `assets/vaults/forge-moda/` into `/bundle/vaults/forge-moda/` (per Phase 1). Update to:

1. **Read user vault path** from Obsidian's API (the plugin's `app.vault.adapter.basePath` or equivalent — research the right primitive).
2. **Walk the user's vault** (recursively but bounded — skip `.obsidian/`, `node_modules/`, hidden dirs).
3. **Filter to Forge-shaped `.md` files** — frontmatter with `type: action | data | snapshot`. Skip plain notes. Cheap to determine — parse only the YAML frontmatter block.
4. **Skip subdirectories named after bundled libraries.** For V1: skip `forge-moda/`. Phase 3 will add `forge-music/`. Encode the skip-list in a constant for easy extension.
5. **Write filtered files into MEMFS** at `/bundle/user-vault/<relative-path>`. Preserve directory structure.
6. **Also mount the user's `forge.toml`** at `/bundle/user-vault/forge.toml` so the resolver knows the dep declarations (specifically `forge-moda`).
7. **Mount the bundled forge-moda content** at `/bundle/user-vault/forge-moda/` (was `/bundle/vaults/forge-moda/`). This satisfies A5.1 so the resolver finds it as a library subdirectory under the authoring vault.
8. **Update the resolver init** to use `vault_path = "/bundle/user-vault"`.

Expose the user-vault-mount via the existing `PyodideHost.getInstance()` flow — same init sequence, additional steps after engine mount.

### `forge-client-obsidian/src/server.ts`

Drop the `_BUNDLED_MODA_SNIPPETS` Set and the conditional dispatch. Every compute now routes to Pyodide unconditionally (modulo LLM endpoints which stay HTTP per V1 scope).

### `forge-client-obsidian/src/moda-view.ts`

The `engine-request` dispatch (Phase 2) currently passes `vault_name: "forge-moda"` for the `op: "compute"` case (featured-button path). With the new resolver pointing at `/bundle/user-vault/`, the resolver finds `forge-moda` snippets via fall-through to the library subdir. The `vault_name` parameter may still be useful for explicit qualification (`forge-moda/simulation`), but the dispatch logic needs to handle "no qualified vault, just snippet ID" → resolves naturally via A4.

CC: verify what change is needed here. Could be zero (if the resolver already handles the unqualified case) or small (if `vault_name` needs an "auto" mode).

### Tests

- Plugin's existing 42 tests should still pass — they're pure-core, no Obsidian coupling. The mounting logic is Obsidian-coupled (uses `app.vault.adapter`); same Obsidian-shim limitation as prior phases. Flag.
- If any test references `_BUNDLED_MODA_SNIPPETS`, update it (probably zero).

## Implementation notes

### Vault walking efficiency

Bluh is small (~30 files). A student's vault could be hundreds of notes. Frontmatter parse is fast (read first ~500 bytes, look for `---\n` ending). Skip files without Forge frontmatter early. Total walk should stay sub-second for vaults under ~1000 files.

If a real vault is larger and walk becomes slow, defer to a follow-up — V1 trusted-beta vaults won't be that big.

### Frontmatter detection

A file is a Forge snippet if its frontmatter has `type: action`, `type: data`, or `type: snapshot`. Plain notes have no `type` field (or a different value). Use a simple regex or YAML parse — don't pull in a heavy dep.

### Skip-list

Constant in pyodide-host.ts:

```typescript
const BUNDLED_LIBRARY_NAMES = new Set(["forge-moda"]);
// Add "forge-music" in Phase 3.
```

Skip any directory under user vault root whose name is in this set. Bundled content takes precedence over the user's local install for these libraries.

### Mid-session edit limitation

Documented behavior: edits to user-vault snippets made AFTER iframe load are not visible until iframe reload. The MEMFS mirror is session-start.

Surface this in:
- A brief note in plugin settings ("Snippet edits require simulator reload to take effect").
- A console log line on each mount: `Forge: user vault mounted (X files). Edits require iframe reload.`

Hot-reload is a real follow-up but not V1-blocking for a closed beta of trusted users.

### What this enables for V1

After this fix:
- Students can shadow `bluh/simulation.md` (or any other snippet) and Forge-click → their shadow runs, not bundled.
- Students can author entirely new snippets at vault root → resolved as authoring-vault content.
- Bundled library is the fall-through for anything the student didn't shadow.
- All without uvicorn (V1 acceptance preserved).

### Risks I anticipate

- **Obsidian API for active-vault path.** Hopefully `app.vault.adapter.basePath` works in the renderer; verify.
- **MEMFS write performance for large vaults.** If a test vault has >1000 files, mount could be felt. Trusted beta vaults probably stay under that — if not, surface as follow-up.
- **A user with their own `forge-moda/` subdirectory that's NEWER than the bundled v0.4.16.** Skip-list means bundled wins. This is intentional — V1 should be self-contained and not depend on whatever stale version the user has installed via registry. Document.

## Tests

- Plugin existing 42 tests pass.
- No new tests practical (Obsidian-coupling). Manual smoke is the verification.

### Manual smoke (deferred to user)

After this lands:

1. `cd ~/projects/forge-client-obsidian && npm run build`
2. Reload Obsidian (`Cmd-P → Reload app without saving`).
3. Open Bluh. Open moda simulator. Click "Run simulation" — should still work (regression check that bundled fall-through still functions).
4. **Create a shadow:** in Bluh, create `bluh/simulation.md` (new file at vault root) with frontmatter `type: action` and a Python body that, e.g., returns a small dict like `{"shadowed": True}`. Save.
5. Forge-click on `bluh/simulation.md` (the shadow, not the library copy). Confirm Forge Output shows the shadow's return value (`{"shadowed": True}`), NOT the bundled simulation result.
6. Delete the shadow. Forge-click on `bluh/forge-moda/simulation.md` — should run the bundled simulation again (water + ink dispersions).
7. (Optional) edit the shadow mid-session, click — should show the OLD shadow content (MEMFS hasn't reloaded). Reload iframe (`Cmd-P` → `Forge: Open MoDa simulation` again) to pick up the edit.

If any step fails, paste the dev console output.

## Out of scope

- Hot-reload of user-vault edits into MEMFS. Follow-up.
- music21 + forge-music. Phase 3.
- α transpile service. Separate prompt.
- Performance optimization for large user vaults. Defer.
- Settings UI beyond the brief note about edit-requires-reload.
- Distribution / BRAT release-zip handling.
- /generate UI hiding.

## Report when done

Per protocol 8-section.

1. **`pyodide-host.ts` diff** — vault walk, frontmatter filter, skip-list, MEMFS mount sequence.
2. **`server.ts` diff** — `_BUNDLED_MODA_SNIPPETS` removal, dispatch simplification.
3. **`moda-view.ts` diff** — if any change needed for the `vault_name` parameter handling.
4. **Resolver init change** — old vault_path vs new vault_path.
5. **Documented limitation** — where the "edits require iframe reload" note lives (settings, console log, README).
6. **Test results** — plugin pass count.
7. **Commit SHA** — single forge-client-obsidian commit.
8. **Manual smoke guidance** — the 7-step checklist above for user verification.
9. **Any deviation and why.**
10. **One observation.**

## Commits + push

Single `forge-client-obsidian` commit. Push to `main`.

Suggested message:

```
V1: mount user vault into Pyodide MEMFS; A4 shadow resolution restored

Drop the hardcoded _BUNDLED_MODA_SNIPPETS dispatch in server.ts. On
Pyodide init, walk the user's active vault, filter to Forge-shaped
.md files, skip subdirs that match a bundled library name (forge-moda
for V1), mount into /bundle/user-vault/. Mount bundled forge-moda at
/bundle/user-vault/forge-moda/ to satisfy A5.1 library-subdir
convention. Resolver initialized against /bundle/user-vault/ — A4
resolves user shadows naturally.

Mid-session edits require iframe reload (MEMFS is session-start
snapshot). Hot-reload deferred.

Plugin tests: 42/42.
```

## Don'ts

- **Don't implement hot-reload.** Document the limitation; don't build the watcher.
- **Don't touch the iframe.** Pure plugin-side fix.
- **Don't touch the engine.** Resolver behavior is correct per A4.
- **Don't add music21 / forge-music.** Phase 3.
- **Don't build α transpile service.** Separate.
- **Don't pull in heavy YAML deps** for frontmatter parsing. Regex or minimal parse.
- **Don't break the V1 acceptance test.** Step 3 of smoke is the regression check.
- **Don't add settings UI beyond the brief edit-requires-reload note.**
- **Don't migrate `/generate` or `/canonicalize`.** Stays HTTP.
- **Don't proceed past a blocker.** Route to questions/ if the user-vault path resolution or MEMFS mount hits a real wall.
