---
timestamp: 2026-06-07T19:30:00Z
session_id: drain-2026-06-07-1800
prompt_modified: 2026-06-07T18:00:00Z
status: shipped
---

# v0.2.75 — cache-miss-on-consistent-state: Hypothesis A confirmed + shipped

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.75 (driver expected v0.2.74; release.sh auto-bumped past — see Open Follow-ups §5).
- **Tag**: `v0.2.75` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.75`)
- **Zip SHA-256**: `2c424176573a324c36967213bda717854424b8f0a4f3133d29b965fe8cda92dc`
- **forge-moda bump**: **NONE** — no bundled-vault content change.
- **forge commits**:
  - `a2d2cda` — Phase 1: investigation + reproduction test
  - `0edca80` — Phase 2: refresh_file auto-detect via longest vault_path prefix
- **forge-client-obsidian commits**:
  - `92cd5b9` — engine bundle resync + manifest bump
  - `2811bc4` — Release v0.2.75
  - `4cdd19a` — INSTALL.md align with shipped tag

## §1 — Investigation findings

### §1.1 — Hypothesis A: CONFIRMED

`SnippetRegistry.refresh_file` defaulted `vault_name=AUTHORING_VAULT`. The plugin's `_forge_sync_user_file` at `pyodide-host.ts:604` calls it with no `vault_name` argument. For a file at `<user-vault>/forge-moda/slot_demo.md`, the refresh wrote to `_vaults[AUTHORING]['slot_demo']` (keyed by basename, per `_index_authoring_file:242`). The library entry at `_vaults['forge-moda']['slot_demo']` stayed stale-since-install: `english_hash=None`, body=119 chars (bundled body with no `# Python`).

When the plugin computed the qualified id `forge-moda/slot_demo`, `SnippetRegistry.get()` at line 147-149 routed direct to the stale library entry, comparing `english_hash=None` against computed `f44f75cf…` → mismatch → cache miss every click.

The driver's debug log `body=119ch` matches the bundled `forge-moda/slot_demo.md`'s post-frontmatter body length (`119`) byte-for-byte, conclusively proving the engine was reading the stale registry entry, not the on-disk content.

Concrete data:
```
$ .venv/bin/python3 -c "
from forge.core.snippet_registry import parse_frontmatter
with open('/Users/odedfuhrmann/projects/forge-moda/slot_demo.md') as f:
    content = f.read()
meta, body = parse_frontmatter(content)
print('Bundled body len:', len(body))
print('Bundled meta english_hash:', repr(meta.get('english_hash')))
"
Bundled body len: 119
Bundled meta english_hash: None
```

### §1.2 — Hypothesis B (MEMFS != disk): REFUTED

Refuted indirectly. The bug reproduces in plain Python with a plain `tempfile.TemporaryDirectory` (no MEMFS layer). MEMFS sync is orthogonal — the registry itself is the staleness layer.

### §1.3 — Hypothesis C (extraction divergence): REFUTED

Direct measurement against the driver's vault file:
```
on-disk english_hash : f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
computed english_hash: f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
```
Engine extract + hash agrees byte-for-byte with what's persisted. Helpers are not the locus.

### §1.4 — Hypothesis D (frontmatter parse divergence): REFUTED

`parse_frontmatter` returns `english_hash` as the literal string `f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db`, byte-identical to the on-disk literal.

### §1.5 — Hypothesis E (plugin write-side body-read race): REFUTED

The on-disk `english_hash` IS correct for the on-disk `# English` content (per §1.3). The engine never reads the on-disk body or its hash on the cache-read path — it reads the registry. So any race in the plugin's write side can't explain a cache-miss-every-click on stable disk state. Refuted by §1.1 + §1.3.

### §1.6 — Investigation note

Full byte-level trace at `forge/docs/investigations/v0.2.74-cache-miss-on-consistent-state.md` (committed in `a2d2cda`).

## §2 — TDD continuity (5 checkpoints)

1. **Failing reproduction test written first**: `tests/core/test_refresh_file_library_vault_investigation.py::test_hypothesis_a_refresh_file_writes_to_wrong_vault_for_library_snippet` — built a vault structure mimicking `~/forge-vaults/bluh/`, called `reg.scan(vault)` to populate library entry, edited disk, called `reg.refresh_file(...)`, asserted library entry reflects new state. Failed pre-fix proving the bug:
   ```
   AssertionError: Hypothesis A CONFIRMED: refresh_file did NOT update the library entry's english_hash.
     Expected: deadbeef0000... (new disk state)
     Got     : f44f75cfaa0c... (stale-since-install state)
   ```

2. **Authoring-vault regression test added**: `test_refresh_file_authoring_vault_top_level_file_still_refreshes_correctly` — guards against the fix incorrectly classifying authoring files as library. Passes pre-fix and post-fix.

3. **Fix implemented**: `refresh_file` finds longest `vault_path` prefix; uses `_index_library_file` (new helper mirroring `_scan_library_vault`'s relpath convention) for library matches, `_index_authoring_file` for authoring matches. Falls back to AUTHORING_VAULT under the filepath's parent dir when no vault claims the path (pre-scan / new authoring file).

4. **Repro test passes post-fix**: both new tests pass after Phase 2 commit.

5. **Full suite green**: forge 618/618 (was 616 + 2 new tests). Plugin 499/499 (no plugin TS changes needed — `_forge_sync_user_file` already calls `refresh_file` without an explicit `vault_name`, picking up the auto-detection for free).

## §3 — User-side smoke checklist

Per §4 of the prompt. Install v0.2.75 via the new release zip, open `~/forge-vaults/bluh/`, then:

```
# Step 1: Open vault. Force a fresh start — restore consistent on-disk
# state if needed:
#   cat ~/forge-vaults/bluh/forge-moda/slot_demo.md | grep ^english_hash
# Should show: english_hash: f44f75cfaa0c23cd390f587cddd56718f6639de5be62e918ccdafe0cc4b635db
# If not, delete the file and let plugin re-extract the bundle.

# Step 2: Forge-click slot_demo.md (first click after fresh install).
# Expected console:
#   Forge: skipping /generate, slot_demo is in canonical E-- mode
#   Forge Compute → {snippetId: 'forge-moda/slot_demo', ...}
#   Forge: slot cache miss {snippetId: 'forge-moda/slot_demo', missingCount: 1}
#   pyodide.asm.js: Forge debug: run_snippet('forge-moda/slot_demo') body=308ch …
#                                                                    ^^^^^
#                                                            308 NOT 119 — the engine
#                                                            sees the REFRESHED registry
#                                                            entry with # Python included
#   Forge: slot cache write succeeded ...
#
# (First click is still a cache miss because the bundled fixture has no
# english_hash + no # Python — the cache hasn't been written yet.)

# Step 3: Forge-click slot_demo.md AGAIN. Expected console:
#   Forge: skipping /generate, slot_demo is in canonical E-- mode
#   Forge Compute → {...}
#   pyodide.asm.js: Forge debug: run_snippet('forge-moda/slot_demo') body=…ch code=…
#   Forge Compute Result: {stdout: 'Once upon a time...\n'}
# THE LINE `Forge: slot cache miss` MUST NOT APPEAR.
# This is the success signal: cache hit on consistent state.

# Step 4: Disk-state check — verify the persisted english_hash now matches:
grep "^english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
# Should match the engine's recomputed hash (f44f75cfaa0c... for storybook content).

# Step 5: English-edit invalidation regression — change the slot text:
# Edit the {{...}} content in slot_demo.md (e.g., change "children's storybook" → "Victorian letter").
# Forge-click. Expected console: `Forge: slot cache miss` fires (correctly invalidated).
# Output should reflect the new style.
```

Failure modes keyed by step:

- **Step 2 fails (body=119ch persists)**: engine bundle didn't sync. Verify `assets/engine/forge/core/snippet_registry.py` in the unzipped plugin has the v0.2.74 `refresh_file` body (look for "longest vault_path prefix" comment). If absent, re-install the v0.2.75 zip.
- **Step 3 still says `slot cache miss`**: a different cache layer is stale. Capture debug console + the slot_demo.md frontmatter + body, file follow-up prompt.
- **Step 5 doesn't invalidate (cache hit despite text edit)**: english-hash recompute is broken. Different bug.

## §4 — Auto-smoke results

- forge: `.venv/bin/pytest` → **618 passing** (was 616 + 2 new tests in `tests/core/test_refresh_file_library_vault_investigation.py`).
- plugin: `npm test` → **499 passing** (no plugin TS changes).
- Direct Python repro against driver's actual vault file (`/Users/odedfuhrmann/forge-vaults/bluh/forge-moda/slot_demo.md`): confirmed the on-disk english_hash matches computed; confirmed the bundled body length matches the engine's debug log `body=119ch`.
- Release zip built clean, drift-preflight passed, tag pushed, GH release created.

## §5 — Open follow-ups

1. **Version-bump skip**: prompt expected `0.2.73 → 0.2.74` but `release.sh` auto-bumped `0.2.74 → 0.2.75` because `SKIP_BUMP=1` as an env var is not honored — the `SKIP_BUMP` toggle in the script is internal and set by passing an explicit version argument. To pin a specific version, future drains should run `bash scripts/release.sh 0.2.74`. INSTALL.md was updated post-release to align with v0.2.75. The shipped fix is the right fix; only the version number drifted +1.

2. **AUTHORING phantom entries from prior v0.2.73 sessions**: any user vault that ran v0.2.73 and Forge-clicked a library snippet has a leaked AUTHORING entry (e.g., `_vaults[AUTHORING]['slot_demo']`) for the basename. These are runtime-only artifacts (no disk persistence), so they vanish on plugin reload. Not a follow-up to fix; just a note for the user's reference. Post-v0.2.75 reload + Forge-click should produce a clean registry.

3. **AUTHORING-vault subdir collision risk** (pre-existing, not introduced by this fix): the AUTHORING vault keys entries by basename only (per `_index_authoring_file:242`). If a user has `<vault>/a/foo.md` and `<vault>/b/foo.md`, both are stored as `AUTHORING['foo']` and shadow each other. Out of scope for this prompt; flag as a future investigation.

## §6 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): Phase 1 investigation committed BEFORE Phase 2 fix.
- ✓ §57 (failing test FIRST): reproduction test failed pre-fix proving the bug, passes post-fix.
- ✓ §76 (don't ship speculative fix): the prompt explicitly asked for hypothesis pinning before fix — Hypothesis A was concretely confirmed by reproduction test + body-length smoking-gun match.
- ✓ §131 (no-op idempotence): authoring-vault regression test confirms the fix doesn't change behavior for the non-library path.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.73 before edit. Release auto-bumped to v0.2.75; noted in §5.
- ✓ §321 (feedback file written before move): this feedback file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in both repos. No feature branches.
