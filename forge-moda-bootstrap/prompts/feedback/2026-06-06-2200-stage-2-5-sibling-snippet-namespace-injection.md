# Feedback — Stage 2.5 sibling-snippet namespace injection (v0.2.68)

**Prompt:** `2026-06-06-2200-stage-2-5-sibling-snippet-namespace-injection.md`
**Date drained:** 2026-06-06
**Plugin release:** v0.2.68
**Forge commits:**
  - `2cc10de` — docs/specs: catch up V2a v7 → v9 + chips schema v3 status
  - `b123ba1` — Stage 2.5: engine-side sibling-snippet namespace injection
**forge-moda commit:** `15ac7b7` — v0.4.18: random_name + canonical_demo_compose
**Plugin commit:** `0b712fb` (manifest+bundle) + `bc746d6` (Release v0.2.68)

## What shipped

### Engine (forge)

`forge/core/executor.py` — Stage 2.5 sibling-snippet namespace injection in `exec_python`:

```python
def _build_snippet_shims(context, registry):
    """v0.2.68 — Stage 2.5 sibling-snippet namespace injection.
    Build a dict of lambda shims, one per declared snippet across every
    vault the registry knows, keyed by the snippet's BARE BASENAME."""
    shims = {}
    if registry is None:
        return shims
    try:
        inventory = registry.list_snippets()
    except Exception:
        return shims
    seen = set()
    for vault_name, snippet_list in inventory.items():
        for entry in snippet_list:
            bare_id = entry.get("id", "")
            basename = bare_id.rsplit("/", 1)[-1] if bare_id else ""
            if not basename or not basename.isidentifier():
                continue
            if basename in seen:
                continue
            seen.add(basename)
            shims[basename] = (
                lambda *args, _name=basename, **kwargs:
                    context.compute(_name, *args, **kwargs))
    return shims
```

Injected first in the `exec_python` local_ns spread so per-call inputs still override
shims (input precedence per canonical-form composition design).

### Tests (forge)

`tests/core/test_canonical_sibling_composition.py` — 9 TDD cases, all pass:

1. Canonical snippet calls another via bare ID
2. Canonical snippet calls Python builtin `print` (Stage-2 regression)
3. Unknown name still raises NameError (typos stay typos)
4. Snippet ID with subdir component resolves via A4.1 basename shim
5. kwargs pass-through
6. Same-basename collision: first wins (A4 dispatches at compute time)
7. Recursion via shim works
8. Returned value threads through `name = snippet(...)`
9. Idempotent across runs

`forge` suite: **548/548 pass** (539 + 9 new), no regressions.

### Vault (forge-moda)

Two new snippets at `forge-moda/`:

- `random_name.md` (`type: action, inputs: [n]`) — reusable N-char lowercase string utility.
- `canonical_demo_compose.md` (`type: action, inputs: [], facet_form: canonical`) — composition demo calling `[[random_name]]` and `[[print]]` via bare-ID syntax.

`forge.toml` bumped 0.4.17 → 0.4.18.

### Plugin (forge-client-obsidian)

- `assets/engine/forge/core/executor.py` resynced via `npm run sync-engine-bundle`.
- `assets/vaults/forge-moda/` rsynced (new files + tracked `.forge/edges/`, `_meta/README.md`).
- `manifest.json` 0.2.67 → 0.2.68.
- `INSTALL.md` pins bumped (5 occurrences).
- Plugin tests: **424/424 pass**.

## Release

```
./release.sh 0.2.68 (SKIP_BUMP=1)
  ✓ Preflight all assets present
  ✓ Engine-bundle drift check clean
  ✓ Build dist/forge-client-obsidian-v0.2.68.zip (33.14 MB)
  ✓ Empty release commit + tag + push
  ✓ GitHub release published
./install-latest.sh
  ✓ Downloaded v0.2.68 zip
  ✓ Backed up data.json, wiped plugin dir, unzipped, restored data.json
```

## Design notes

**Option A (explicit shims) over Option B (`__getattr__` magic).** Keeps typos as NameError — there's no implicit catch-all that would silently swallow a misspelled function name. Every shim is enumerated up front from the registry's `list_snippets()` inventory.

**First-wins for basename collision.** When two snippets across vaults share a basename (e.g., `forge-music/blues/song` and `forge-music/percussion/song`), the shim is installed once. A4.1 sibling-subdir resolution handles the dispatch at compute time. The "first wins" applies only to the shim key — A4.1 still raises `AmbiguousSnippetResolutionError` if multiple sibling subdirs match within the caller's vault.

**Shim BEFORE inputs in local_ns spread.** So `inputs[basename]` overrides `shims[basename]` when a caller has an input named the same as a sibling snippet. Per canonical-form composition: inputs are first-class bindings.

**Identifier filter.** Snippet IDs that aren't valid Python identifiers (e.g., contain hyphens or start with digits) are skipped — they can't be called bare anyway. Only `basename.isidentifier()` gets a shim.

## Smoke test (paste-able)

After Obsidian reload at `/Users/odedfuhrmann/forge-vaults/bluh/`:

```bash
# 1. Verify plugin version
grep '"version"' /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: "version": "0.2.68"

# 2. Verify engine bundle has the new helper
grep -n "_build_snippet_shims" /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/core/executor.py
# Expected: 2 matches (def + call site)

# 3. Verify forge-moda bundle has the new snippets
ls /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda/canonical_demo_compose.md \
   /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-moda/random_name.md
# Expected: both files exist

# 4. In Obsidian: Cmd+P → 'Reload app without saving'
# 5. Open canonical_demo_compose.md (from forge-moda vault)
# 6. Forge-click → should print "Hello <5-char-name>" to the Forge result panel
# 7. Forge-click canonical_demo.md → should still work (Stage-2 regression)
# 8. Forge-click any pre-existing forge-music snippet → should still work
```

## Failure modes considered

- **Old canonical_demo.md still resolves:** Yes — Stage-2 path only uses Python builtins (print), and builtins remain in the local_ns. Regression test case #2 locks this in.
- **Typo in snippet body raises clear error:** Yes — name not in shim dict + not in inputs + not in builtins = NameError, wrapped in SnippetExecError. Regression test case #3 locks this in.
- **Bare basename call to subdir snippet (`[[blues/song]]()` → `song()`):** Yes — emitter emits bare basename, shim installed under basename, A4.1 dispatches by inferring caller dir. Test case #4 locks this in.
- **Same-basename collision deadlock:** No — first-wins on shim install; A4.1 at dispatch time either resolves or raises `AmbiguousSnippetResolutionError` (already locked in by A4.1 test suite, v0.2.57).

## Known limitations

- **Snippet basenames that aren't valid Python identifiers (hyphens, digits-first) get no shim.** They have to be invoked via `context.compute('snippet-id', ...)` explicitly. This matches Python identifier rules — there's no way to call them bare anyway.
- **The shim closes over the `context` and `registry` passed to `exec_python` at the time of namespace construction.** A long-running compute that mutates the registry mid-flight wouldn't see new shims — but that's a hypothetical and the registry doesn't mutate during single computes.

## Per cc-prompt-queue.md

- Spec-grade prompt → completed end-to-end.
- Engine-side change → TDD-first (9 cases pre-fix).
- forge-side commit → engine code + tests.
- Plugin-side commit → engine bundle resync + vault bundle mirror + manifest + INSTALL.md.
- Vault commit → forge-moda forge.toml + new fixtures.
- Release.sh → drift-preflight-early order (v0.2.61+) passed cleanly.
- install-latest.sh → round-trip clean.
