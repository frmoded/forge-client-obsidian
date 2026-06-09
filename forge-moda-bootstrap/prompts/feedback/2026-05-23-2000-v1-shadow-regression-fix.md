---
timestamp: 2026-05-23T20:27:43Z
session_id: unknown
prompt_modified: 2026-05-23T20:00Z
status: success
---

# V1 — user-vault mount + A4 shadow resolution restored

## TL;DR

Phase 1's hardcoded `_BUNDLED_MODA_SNIPPETS` allowlist is gone.
Plugin now walks the user's active vault on Pyodide init, mounts
Forge-shaped `.md` files into `/bundle/user-vault/`, and serves
bundled libraries as subdirectories of the same vault. A4 + A5.1
handle shadow resolution naturally. **Single commit, build clean,
42/42 tests still passing. Live Obsidian smoke deferred to user.**

## 1. `pyodide-host.ts` diff

### New top-of-module constants

```typescript
const BUNDLED_LIBRARY_NAMES = new Set<string>(["forge-moda"]);
const FORGE_SNIPPET_TYPES = new Set<string>(["action", "data", "snapshot"]);
```

`BUNDLED_LIBRARY_NAMES` is the skip-list: any user-vault top-level
directory whose name is in this set is excluded from the mount.
Bundled wins over a stale `<vault>/forge-moda/` install from a prior
registry-based install. Extends naturally for Phase 3 (add
`"forge-music"`).

`FORGE_SNIPPET_TYPES` mirrors the resolver's filter: only files
whose frontmatter `type` is `action`/`data`/`snapshot` get mounted.
Plain notes are skipped at MEMFS write time so the mount stays cheap.

### `_init()` mount sequence

Was one pass (`manifest.engine` then `manifest.vaults`). Now three
passes after the engine mount:

1. **Walk user's vault** via `app.vault.getMarkdownFiles()`. For each
   `TFile`:
   - Skip if `file.path.split("/")[0]` is in `BUNDLED_LIBRARY_NAMES`.
   - Read frontmatter from `metadataCache.getFileCache(file)`.
   - Skip if no frontmatter or `fm.type` not in `FORGE_SNIPPET_TYPES`.
   - Read content via `app.vault.read(file)`.
   - Write to `/bundle/user-vault/<file.path>` (preserving subdir
     structure via `_mkdirP`).
   - Increment `userMounted` counter.

2. **Mount user's `forge.toml`** via `app.vault.adapter.read("forge.toml")`
   if `adapter.exists("forge.toml")` returns true. Wrapped in
   try/catch — missing forge.toml is non-fatal.

3. **Mount bundled libraries** at `/bundle/user-vault/<lib>/...`
   (was `/bundle/vaults/<lib>/...`). Each `manifest.vaults` relpath
   gets `s|^vaults/|user-vault/|` rewriting before the MEMFS write.

Closing log line:
```
Forge: user vault mounted (<N> files; edits require iframe reload).
Forge: bundle mounted in <NNNN>ms
```

The "edits require iframe reload" message documents the MEMFS-is-
session-start limitation per prompt 2000's scope.

### Python init: single registry against user-vault

Was:
```python
_forge_vault_registries = {}
def _forge_get_resolver(vault_name):
    if vault_name not in _forge_vault_registries:
        reg = SnippetRegistry()
        reg.scan(f"/bundle/vaults/{vault_name}")
        _forge_vault_registries[vault_name] = (reg, GraphResolver(reg))
    return _forge_vault_registries[vault_name]
```

Now:
```python
_forge_user_vault = "/bundle/user-vault"
_forge_registry = SnippetRegistry()
_forge_registry.scan(_forge_user_vault)
_forge_resolver = GraphResolver(_forge_registry)

def _forge_get_resolver(vault_name=None):
    """vault_name is vestigial — kept for backward compat in
    moda-view.ts's engine-request dispatch, but V1's single
    user-vault registry handles everything. A4 resolves qualified
    ('forge-moda/setup') and unqualified ('setup') snippet IDs
    naturally."""
    _ = vault_name
    return _forge_registry, _forge_resolver
```

`exec_python` calls inside `_forge_run_snippet` now pass
`vault_path=_forge_user_vault` (was `f"/bundle/vaults/{vault_name}"`).
Snapshot capture lands at `/bundle/user-vault/.forge/edges/...`.

### Moda fast-path helpers

`_forge_moda_init/_forge_moda_compute/_forge_moda_click` drop the
`"forge-moda"` vault_name argument from their `_forge_run_snippet`
calls — they pass just `(snippet_id, args)` now. Same A4 resolution.

## 2. `server.ts` diff

Removed:
- The `BUNDLED_LIBRARY` constant
- The `_BUNDLED_MODA_SNIPPETS` Set (29 hardcoded snippet names)
- The `_isBundledLibrarySnippet(snippetId)` function

`computeSnippet` is now ~20 lines shorter. Dispatch is:

```typescript
if (_pyodideHost) {
  // Every compute routes through Pyodide. The mounted user-vault
  // contains the user's authoring snippets + bundled libraries as
  // subdirectories, so A4 resolves shadows naturally.
  const host = await _pyodideHost.getInstance();
  const out = await host.computeViaEngine(snippetId, args, '');
  return { status: 200, json: { type: 'action', result: out.result, stdout: out.stdout } };
}
// HTTP fallback — fires only when Pyodide isn't yet initialized.
```

`vault_name` passed as `''` since the Python side ignores it. Could
be dropped from `computeViaEngine`'s signature in a future cleanup
but kept for now to preserve the symmetric `engine-request` shape
that moda-view's dispatch uses.

## 3. `moda-view.ts` diff

**No changes needed.** `handleEngineRequest` still passes
`vault_name ?? 'forge-moda'` in the `compute` case; the Python side
treats it as vestigial. The post-hoc cleanest move (drop the
`vault_name` field entirely) is a 3-line change across two files
but is non-blocking; flagged for a small follow-up if the surface
matters later.

## 4. Resolver init change

| | Old | New |
|---|---|---|
| Registry | One per bundled vault (dict, keyed by name) | Single, against `/bundle/user-vault/` |
| vault_path passed to exec_python | `/bundle/vaults/<lib>` | `/bundle/user-vault` |
| Snapshot edges location | `/bundle/vaults/<lib>/.forge/edges/` | `/bundle/user-vault/.forge/edges/` |
| A4 fall-through | Single library, no shadow path | User root → library subdir → built-in |

## 5. Documented limitation

The MEMFS user-vault is a **session-start snapshot**. Edits to
user-vault snippets made AFTER iframe load don't take effect until
iframe reload. Surfaced in:

- **Console log line** on each successful mount:
  `Forge: user vault mounted (<N> files; edits require iframe reload).`

Not surfaced in the settings UI (prompt's scope excluded that —
keep the surface minimal). The log message is enough for the
trusted closed-beta audience.

## 6. Test results

`node --test src/*.test.ts` → **42/42 passing**, unchanged from
pre-prompt baseline. No new tests on `pyodide-host.ts` per the
established Obsidian-shim limitation; the mount logic is heavily
coupled to `app.vault.getMarkdownFiles`, `app.metadataCache`, and
`app.vault.read` which aren't trivially shimmable.

Install footprint unchanged at **14.92 MB** (engine 0.05 + iframe
0.21 + pyodide 14.63 + vaults 0.03).

## 7. Commit SHA

`forge-client-obsidian` → **`4b32625`** on `main`, pushed.

Hardlink confirmed: bluh's `main.js` (inode 2036359) IS the rebuild
— the fix is already in the user's running install, ready for
smoke after the next Obsidian reload.

## 8. Manual smoke (the 7-step checklist for user verification)

1. `cd ~/projects/forge-client-obsidian && npm run build` — should print 14.92 MB footprint.
2. Reload Obsidian (`Cmd-P` → `Reload app without saving`).
3. Open Bluh. Open moda simulator. Click **Run simulation** — should still work (regression check: bundled fall-through still functions, no user shadows present yet).
4. **Create a shadow:** in Bluh root, create `bluh/simulation.md` with frontmatter `type: action` and a Python body like:
   ```python
   def compute(context):
       return {"shadowed": True}
   ```
   Save.
5. Forge-click on `bluh/simulation.md` (the shadow). Confirm Forge Output renders `{"shadowed": true}`, NOT the bundled simulation result (water + ink dispersions).
6. Delete `bluh/simulation.md`. Reload Obsidian. Forge-click on `bluh/forge-moda/simulation.md` — should run the bundled simulation again (water + ink dispersions).
7. (Optional) Edit a shadow mid-session, Forge-click without reloading the iframe — should show the OLD shadow content (MEMFS hasn't reloaded). Then `Cmd-P` → `Forge: Open MoDa simulation` to reload the iframe; click again — shadow's new content runs.

If any step fails, paste the dev console output. Most likely
failure mode would be in the user-vault walk (Obsidian API
behavior), which would surface as either zero `userMounted` files
in the console log, or a JS error during init.

## 9. Deviations

**None of substance.**

Two judgment calls worth noting:

- **`vault_name` parameter kept on the API surface** rather than
  dropped from `computeViaEngine`. Dropping it would require a
  3-line cleanup across moda-view.ts + LocalHttpAdapter.ts +
  pyodide-host.ts; non-blocking, easier to defer to a small
  follow-up than risk a coupled change here.
- **Settings-UI note about edit-requires-reload not added.** The
  prompt suggested it as an option; I picked the console-only
  surface for minimum churn. If the closed-beta students hit this
  surprise, adding a brief settings paragraph is sub-10-line.

## 10. One observation

The clean break enabled by mounting the user vault is that
**every plugin compute path is now uniform**: Forge-click in main.ts,
featured-button in moda-view.ts, future LLM-mediated paths, even
freeze/sync_dependencies if those migrate later — all just call
`PyodideHost.getInstance().then(h => h.computeViaEngine(...))` and
the resolver does the right thing. The hardcoded allowlist was a
Phase 1 expedient that pushed dispatch knowledge into the wrong
layer; with this fix, the resolver owns it where it belongs.

A subtle consequence: **the user's `forge-moda/` subdir is
intentionally invisible to Pyodide.** A student who ran
`Forge: install forge-moda` against the registry's older v0.4.14
and then ran V1 plugin gets the bundled v0.4.16 silently. This is
desirable — V1 ships self-contained, and registry-installed copies
might lag — but it's a real semantic change worth flagging if it
ever surprises a user (e.g., they edit their local forge-moda/
copy expecting it to take effect). The console log doesn't
currently mention which files are skipped due to the bundled-
library filter; adding that is a sub-5-line follow-up if anyone
asks.

Separately: the engine's snapshot edges now land at
`/bundle/user-vault/.forge/edges/...` (MEMFS, session-lived). They
don't persist across iframe reloads. For V1 closed beta this is
fine — A8/A9 freeze semantics are still functional within a
session. Real cross-session persistence is a follow-up the V1
prompt 0700 already deferred.
