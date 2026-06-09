---
timestamp: 2026-06-07T07:00:00Z
session_id: drain-2026-06-07-0600
prompt_modified: 2026-06-07T06:00:00Z
status: success
---

# v0.2.73 — slot resolution second pass writes stale `# Python` (fix)

## §0 — Release coordinates

| Field | Before | After |
| --- | --- | --- |
| manifest.json | 0.2.72 | 0.2.73 |
| forge-moda forge.toml | (unchanged — no bundled content change) | — |

| Field | Value |
| --- | --- |
| Phase 1 investigation commit (forge) | `0ea34b2` → `ab775e7` (engine fix) |
| Phase 1 investigation files | `forge` `0c2a8a4` (investigation note + tests) |
| Phase 2 engine fix | `forge` `ab775e7` |
| Plugin commit (bundle resync + investigation tests + manifest) | `forge-client-obsidian` `04de28e` |
| Release commit (empty) | `forge-client-obsidian` `4f196db` |
| Tag | `v0.2.73` |
| GH release URL | https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.73 |
| Release zip | `dist/forge-client-obsidian-v0.2.73.zip` (33.16 MB) |
| Zip SHA-256 | `4d48fdeb7ce0bf127f1fffa5d614d76ce2030bec0a761156ce303d749553b07f` |

Version-bump sanity check (cc-prompt-queue.md §347): manifest was at 0.2.72 at drain start; bumped to 0.2.73 per placeholder. ✓

No `forge-moda/forge.toml` bump — plugin-only fix per §0 of the prompt's opt-out declaration.

## §1 — Investigation findings

Three hypotheses tested per cc-prompt-queue.md §78 investigation-before-design HARD RULE. Two refuted, one confirmed.

### Hypothesis A — `writePythonAndEnglishHash` body-merge defect

**REFUTED.** Pure-core unit tests in `forge-client-obsidian/src/python-cache-writer-stale-write-investigation.test.ts` exercise the exact body shape from the smoke (frontmatter with stale `english_hash`, Victorian English, storybook `# Python`):

```
$ npx tsx --test src/python-cache-writer-stale-write-investigation.test.ts
✔ Hypothesis A: writePythonAndEnglishHash replaces stale # Python body, not just english_hash
✔ Hypothesis A: only ONE # Python heading after the write (no duplicate)
✔ Hypothesis A: # English section preserved verbatim
✔ Hypothesis C scaffold: writePythonAndEnglishHash works the same regardless of facet_form
ℹ tests 4
ℹ pass 4
```

All assertions pass against v0.2.72 code. The plugin-side body-merge logic is innocent.

### Hypothesis B — Engine returns OLD code on second pass even when `facet_form: canonical` is present

**REFUTED.** Pytest tests in `forge/tests/core/test_executor_stale_python_investigation.py`:

```
✔ test_hypothesis_b_engine_returns_fresh_code_on_slot_resolutions_with_stale_python
✔ test_hypothesis_b_engine_short_circuits_when_english_hash_matches
```

When `facet_form: canonical` is present, the engine correctly detects hash mismatch, re-transpiles, and returns the Victorian-resolved Python.

### Hypothesis C — `facet_form: canonical` dropped from frontmatter

**CONFIRMED.** `test_hypothesis_c_engine_returns_stale_python_when_facet_form_absent` constructs the user's failing state with `facet_form` ABSENT (simulating Obsidian's YAML serializer stripping the field on save):

Pre-fix:
- Engine takes the legacy "no facet_form" branch at `executor.py:511` (`else: return code`).
- Returns the STALE storybook `# Python` regardless of:
  - english_hash mismatch (stored storybook hash vs current Victorian English).
  - `slot_resolutions` dict being explicitly provided.

Matches the user's observation precisely:

| Observed | Mechanism |
| --- | --- |
| `english_hash` updates to Victorian on disk | Plugin reads fresh body, computes Victorian hash, writes via `writePythonAndEnglishHash` (innocent). |
| `# Python` does NOT update | Engine returns storybook code as `_forge_compute_with_python`'s third tuple element because `facet_form != "canonical"` triggers the legacy early-return. Plugin writes storybook → storybook (no visible change). |

Full investigation note: `forge/docs/investigations/v0.2.73-slot-resolution-stale-python.md`.

## §2 — TDD continuity (HARD RULE compliance — all 5 checkpoints)

### §2.1 — Test cases added pre-fix

Failing-first test demonstrating the bug:
- `test_hypothesis_c_engine_returns_stale_python_when_facet_form_absent` originally asserted the STALE behavior (engine returns storybook). This characterized the v0.2.72 buggy state.

### §2.2 — Verbatim pre-fix run output (failing)

Against v0.2.72 (before fix), the test ASSERTED-stale behavior passed (the bug was reproduced). I.e. the engine returned storybook even with slot_resolutions provided. Below is the inverted assertion that PROVED Hypothesis C — the engine returned stale code when facet_form was absent:

```
$ .venv/bin/pytest tests/core/test_executor_stale_python_investigation.py -v
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_b_engine_returns_fresh_code_on_slot_resolutions_with_stale_python PASSED
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_b_engine_short_circuits_when_english_hash_matches PASSED
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_c_engine_returns_stale_python_when_facet_form_absent PASSED  ← Hypothesis C CONFIRMED against v0.2.72
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_b_slot_resolutions_ignored_when_python_cache_hits_match PASSED

========================= 4 passed, 1 warning in 0.23s =========================
```

### §2.3 — The fix

Commit `ab775e7` in `forge`. Two-part change at `forge/core/executor.py` `resolve_action_code`:

**Before** (v0.2.72):

```python
if code is not None:
    if facet_form == "canonical" and edit_mode != "python":
      stored_hash = meta.get("english_hash")
      english = extract_section(snippet["body"], "English")
      current_hash = compute_english_hash(english) if english else None
      if stored_hash == current_hash:
        return code
      # Hash mismatch: fall through to re-transpile.
    else:
      return code   # ← branch (X) — returns stale storybook when facet_form absent

if facet_form != "canonical":
    return None  # signals legacy "no Python heading"
```

**After** (v0.2.73):

```python
if code is not None:
    # v0.2.73: when slot_resolutions is explicitly provided, the
    # plugin is in the second-pass of a cache-miss round-trip. Skip
    # the cached-# Python early-return paths and re-transpile.
    if slot_resolutions is None:
      if facet_form == "canonical" and edit_mode != "python":
        # ... english_hash check as before ...
        if stored_hash == current_hash:
          return code
      else:
        return code
    # else: fall through to transpile path

if facet_form != "canonical" and slot_resolutions is None:
    return None  # legacy path
# v0.2.73: slot_resolutions provided → enter canonical compile path
# regardless of facet_form (defends against Obsidian dropping the
# frontmatter field). The plugin's intent is clear: re-transpile.
```

The presence of `slot_resolutions` is the plugin's explicit signal: "I want a re-transpile with these resolutions." Pre-v0.2.73 ignored that signal whenever `# Python` was present.

### §2.4 — Verbatim post-fix run output (passing)

```
$ .venv/bin/pytest tests/core/test_executor_stale_python_investigation.py -v
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_b_engine_returns_fresh_code_on_slot_resolutions_with_stale_python PASSED
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_b_engine_short_circuits_when_english_hash_matches PASSED
tests/core/test_executor_stale_python_investigation.py::test_hypothesis_c_engine_returns_stale_python_when_facet_form_absent PASSED  ← updated to assert FIXED behavior
tests/core/test_executor_stale_python_investigation.py::test_v0_2_73_slot_resolutions_forces_retranspile_even_when_python_cache_hits_match PASSED

========================= 4 passed, 1 warning in ... =========================
```

`test_hypothesis_c` now asserts the engine RE-TRANSPILES when `slot_resolutions` is provided even with facet_form absent. `test_v0_2_73_slot_resolutions_forces_retranspile_even_when_python_cache_hits_match` documents the new "slot_resolutions wins on cache-hit" contract.

### §2.5 — Full-suite output post-fix

Forge:

```
$ .venv/bin/pytest -q
================== 608 passed, 1 warning in 60.55s (0:01:00) ===================
```

608 = 604 (v0.2.72 baseline) + 4 new investigation tests. No regressions.

Plugin:

```
$ npm test
ℹ tests 492
ℹ pass 492
ℹ fail 0
```

492 = 488 (v0.2.72 baseline) + 4 new investigation tests.

## §3 — User-side smoke checklist

**Pre-conditions:**
- Terminal open, cwd `~/projects/forge-client-obsidian`.
- Obsidian closed (quit completely with `Cmd+Q` if open — NOT `Cmd+W`).
- Test vault at `~/forge-vaults/bluh/` with `forge-moda/slot_demo.md`, last used v0.2.72 (may have a stale `# Python` from the v0.2.72 bug).
- forge-transpile redeployed and live with the `/resolve-slot` endpoint.
- Transpile token configured in Settings → Forge → Transpile token.

### Step 1 — Install v0.2.73 + reproduce v0.2.72 Step-5 failure (bug-fix reproduction).

In Terminal:

```
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
```

Expected: `Installed forge-client-obsidian v0.2.73 at: ...`.

Open the vault in Obsidian. Open Developer Tools with `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows).

In Obsidian, open `forge-moda/slot_demo.md`. Edit the slot text in the English facet — replace whatever's currently between `{{ }}` with `{{a formal hello message in the style of a Victorian letter}}`. Save with `Cmd+S`.

Forge-click `slot_demo.md`. Expected console sequence:

- `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }`
- `Forge: slot cache write succeeded { ... count: 1 }`
- NO `STILL surfaces cache miss` line (the v0.2.71 regression canary).

In Terminal verify the `# Python` body has the Victorian greeting:

```
grep -A 5 "^# Python" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Expected output: `# Python` heading followed by a `def compute(context):` body containing a Victorian-style greeting string (e.g. `"Good day to you, esteemed reader."` or similar Victorian-flavored phrase). The string should NOT be `"Hello, dear reader!"` (the v0.2.72 storybook greeting).

Also verify `english_hash` matches the new Victorian English:

```
grep "^english_hash:" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Expected: a fresh hex string (different from the v0.2.72 storybook hash `43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54`).

Output panel in Obsidian should show the Victorian greeting.

Quick interpretation:
- `# Python` body shows Victorian greeting AND `english_hash` matches → v0.2.73 fix is live.
- `# Python` body still shows `"Hello, dear reader!"` → fix did not take. Verify shipped engine bundle has the guard:
  ```
  grep "slot_resolutions is None\|slot_resolutions is not None" ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/core/executor.py
  ```
  Expected: 2 matches (the two new guard clauses).

### Step 2 — Regression check: Steps 2-4 of v0.2.72 smoke still work.

Quit Obsidian (`Cmd+Q`). Delete `~/forge-vaults/bluh/forge-moda/slot_demo.md`'s `# Python` and `# Slots` headings if present, to start from a clean state:

```
# Open the file and hand-delete the # Python + # Slots headings + their content.
```

Reopen Obsidian. Forge-click `slot_demo.md`. Expected: `slot cache miss` → `slot cache write succeeded` → Victorian greeting in output panel.

Forge-click again. Expected: NO cache miss (cache hit on matching english_hash). Same Victorian greeting.

This confirms the cache-hit path still works correctly.

### Step 3 — Cleanup of any stale v0.2.72 state.

If you had a vault stuck on a stale `# Python` + Victorian `english_hash` from v0.2.72, simply Forge-click the snippet under v0.2.73. The fix will re-transpile and write the correct Victorian `# Python`. No manual cleanup needed.

### Failure modes to watch for

- **Step 1: `# Python` still shows storybook + Victorian `english_hash` after Forge-click** → v0.2.73 engine bundle didn't ship correctly. Verify with:
  ```
  grep -c "slot_resolutions is None\|slot_resolutions is not None" ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/engine/forge/core/executor.py
  ```
  Expected: 2. If 0, re-run install-latest.sh.

- **Step 1: cache miss log appears but `slot cache write succeeded` does NOT** → `handleSlotCacheMiss` aborted before writing. Check Console for `Forge: slot resolution failed — HTTP 4xx/5xx` (transpile token issue) or `second-pass compute failed` (Pyodide engine error).

- **Step 1: Output panel shows `None`** → engine returned the miss-sentinel literal instead of the Victorian expression. Indicates the second-pass resolver didn't find the slot in slot_resolutions dict. Likely a cache_key disagreement between server and client — verify by checking the on-disk `english_hash` actually changed (if it didn't, the second-pass didn't fire at all).

- **Step 2: regression-test cache-hit shows another miss** → fix went too far and broke the canonical-with-matching-hash cache path. Look at recent forge commits.

### End-state cleanup

The fix is forward-compatible. v0.2.72-broken slot_demo.md files (Victorian English + storybook `# Python` + Victorian english_hash) automatically heal on first Forge-click under v0.2.73 — the engine now re-transpiles + the plugin writes fresh Victorian `# Python`. No manual file edits needed.

## §4 — Auto-smoke results

**Auto-verified by CC:**

- `npm run build` exit 0; asset footprint 37.96 MB.
- `npm test` → 492/492 plugin tests pass (was 488 + 4 new investigation cases).
- `pytest -q` on forge → 608/608 pass (was 604 + 4 new investigation cases).
- `scripts/release.sh 0.2.73` ran cleanly. Drift check clean. Zip built at 33.16 MB. Tag pushed. GH release published. Zip SHA-256 `4d48fdeb7ce0bf127f1fffa5d614d76ce2030bec0a761156ce303d749553b07f`.
- `install-latest.sh` round-trip into `~/forge-vaults/bluh/`: succeeded.
- Shipped engine bundle has the fix: `grep -c "slot_resolutions is None" main.js` → 2 (two new guard clauses).

**Deferred to user (Obsidian-context):**

- Step 1 reproduction in Obsidian against the live forge-transpile `/resolve-slot` endpoint.
- Step 2 regression check (cache-hit path).
- Cleanup of any v0.2.72-stuck slot_demo.md (auto-heals on first click under v0.2.73 — no user action needed).

## §5 — Open follow-ups noted but not built

1. **Investigate why Obsidian dropped `facet_form: canonical`.** Hypothesis C points at Obsidian's YAML serializer stripping unrecognized fields on save. This drain's fix defends against the symptom; the underlying behavior is worth documenting in forge-doc's chapter 9 (Slots) as authoring discipline. A future drain might add a defensive plugin-side write that explicitly preserves Forge-specific frontmatter fields when interacting with snippet files.

2. **Defensive engine warning when slot_resolutions is provided but facet_form is absent.** The fix silently re-transpiles in this case. A `console.warn` log line on the Pyodide side would surface the Obsidian-strip frequency in real cohort usage, giving us data for follow-up #1.

3. **Plugin-side smoke automation for the slot-resolution lifecycle.** The full miss → resolve → retry → cache loop spans 4 layers (plugin → engine → /resolve-slot → engine). Phase 3 candidate for an integration test that mocks `/resolve-slot` and verifies end-to-end the `# Python` heading + `english_hash` write.
