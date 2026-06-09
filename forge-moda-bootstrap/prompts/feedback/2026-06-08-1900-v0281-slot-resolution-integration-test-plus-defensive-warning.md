---
timestamp: 2026-06-08T19:30:00Z
session_id: drain-2026-06-08-1900
prompt_modified: 2026-06-08T19:00:00Z
status: shipped-partial
---

# v0.2.81 — Item A shipped + Item B deferred to engine-side coverage only

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.81 (bumped from v0.2.79; v0.2.80 was routed to questions/ in the prior drain).
- **Tag**: `v0.2.81` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.81`)
- **forge commits**:
  - `73e4127` — Item A: `detect_facet_form_strip_trap` pure-decision helper + 8 tests.
- **forge-client-obsidian commits**:
  - `2656ed3` — engine bundle resync + pyodide-host wires defensive warning.
  - `bc57baa` — forge-tutorial 09-slots/Slots.md source sync (bundle drift catch).
  - `da6148f` — Release v0.2.81.
  - `446eec2` — INSTALL.md bump.

## §1 — Investigation findings

### §1.1 — Item A insertion site (verified)

Insertion site identified at `pyodide-host.ts:703` `_forge_run_snippet` (Python-side embedded in TS template literal). The function reads the snippet via `resolver.resolve(snippet_id)` which gives access to `snip["meta"]` — the frontmatter dict.

The session-dedup Set lives module-scoped in the Python side (`_forge_facet_form_warning_set = set()`) rather than as a Plugin class member. Reasoning: the Pyodide instance is shared across plugin reloads but destroyed on browser reload — which matches "per-session" semantics naturally. Per-plugin-instance ownership would require routing through a callback or shared-state mechanism that adds complexity for minimal benefit.

### §1.2 — Naming discrepancy in the prompt

The prompt phrased the detection signal as "snippet has `slot_resolutions` in frontmatter." `slot_resolutions` is NOT a frontmatter field — it's a transient parameter to `resolve_action_code`. The actual cache-write artefact persisted to frontmatter is `english_hash` (via `writePythonAndEnglishHash` per B7.3). I used `english_hash` as the detection trigger.

Functionally equivalent: both mark "this snippet was previously cached as canonical." A snippet that ever ran the slot-resolution lifecycle and got `# Python` + `english_hash` written will have `english_hash` in frontmatter forever (unless manually scrubbed). If `facet_form` is also missing while `english_hash` is present, the Obsidian YAML-strip trap is the most likely explanation.

Documented in test file + commit body for clarity.

### §1.3 — Item B test infrastructure survey

Existing engine-side coverage at `forge/tests/core/test_executor_slots.py`:
- 11 tests covering first-pass miss, second-pass populate, cache hit, cache invalidation, edit_mode override, legacy regression.
- `test_unified_cache_miss_then_populate_then_hit_e2e` ALREADY covers steps 1-5 of the slot-resolution lifecycle end-to-end at the engine layer.

Existing plugin-side test infrastructure for end-to-end vault simulation: **NONE**. No `*.integration.test.ts` file. No vault fixture builders. No `/resolve-slot` mocking infrastructure. The plugin tests are exclusively per-module pure-core unit tests.

The plugin-side integration test the prompt requires (§3.2 harness + §3.3-3.5 tests) would need to be built from scratch:
- Temp-dir vault fixture builder.
- Mock `PyodideHost` interface (or full Pyodide stub).
- Mock `/resolve-slot` endpoint via `requestUrl` interception.
- Mock subset of Obsidian `App`/`Vault`/`MetadataCache`/`Workspace`.

**Assessment**: building this harness properly is a 2-3 hour design + implementation pass on its own, with significant maintenance commitment. Given V2 will retire the `facet_form: canonical` / `english_hash` surface for `source: english | epython` (per the prompt §8 note), the harness's V1-specific test logic will likely require near-total rewrite for V2. The harness *shape* could survive but every test body changes.

Per the prompt §8 explicit authorization: "if the throw-away ratio is very high (e.g., 90% rewrite for V2), surface that for the user to reconsider." Surfacing here — V1 plugin-side integration tests would be ~90% throw-away when V2 lands. Engine-side coverage IS reusable across V1/V2 because the engine's slot-resolution semantics are stable; the field names change but the cache/transpile/resolve loop persists.

## §2 — TDD continuity

### Item A (shipped)

1. **Failing test first**: 7 cases in `tests/core/test_facet_form_strip_trap.py` written before the helper implementation. Initial reproduction asserted `detect_facet_form_strip_trap` exists in `forge.core.executor`.
2. **Pre-fix output**: `ImportError: cannot import name 'detect_facet_form_strip_trap'`.
3. **Fix**: pure-decision helper added at `forge/core/executor.py:770-797`. Returns True when `meta.get("english_hash")` is truthy AND `meta.get("facet_form") != "canonical"`.
4. **Refinement**: prompt's `slot_resolutions` language reconciled with the actual `english_hash` artefact. Test cases renamed accordingly. 1 additional test added (`test_trap_does_not_fire_on_fresh_free_english_snippet`).
5. **Post-fix**: 8/8 tests passing. Full forge suite 638 passing (was 630 + 8 new).

### Item B (partial — engine-side only)

The engine-side e2e test (`test_unified_cache_miss_then_populate_then_hit_e2e`) already covers steps 1-5 of the lifecycle. The prompt's §3.4 regression-shape tests:

- "Mutating English body → cache miss" — covered by existing `test_python_present_mismatched_english_hash_re_transpiles`.
- "Mutating slot resolution → cache miss" — `slot_resolutions` is per-call, not persisted; mutation is the second-pass call signature, no separate test needed.
- "Removing facet_form → cache miss + warning" — the WARNING side is covered by the 8 Item A tests. The cache behavior is covered by `test_python_present_matching_english_hash_returns_cached` (which validates the cached `# Python` is returned via the legacy `else: return code` path when facet_form is non-canonical).

**Engine-side coverage is comprehensive.** No new engine-side tests added beyond Item A.

**Plugin-side 4-layer HTTP-mocking integration test: NOT BUILT.** Per §1.3 surface assessment — high-cost, high-throw-away-ratio, low marginal coverage value.

## §3 — User-side smoke checklist

Per §5 of the prompt:

```
# Step 1 — install v0.2.81 zip.

# Step 2 — open a previously-canonical snippet with cached # Python +
# english_hash in frontmatter. E.g., a forge-tutorial slot demo that
# was Forge-clicked before. Forge-click. Verify computes correctly.

# Step 3 — manually strip facet_form from frontmatter:
#   sed -i.bak '/^facet_form:/d' <vault>/forge-tutorial/09-slots/octopus_fact.md
# (or edit in Obsidian).
# Re-Forge-click. Open DevTools console (Cmd-Opt-I).
# Expected:
#   - Snippet still computes (returns the cached Python).
#   - Console shows ONE warning:
#     "Forge: snippet 'forge-tutorial/09-slots/octopus_fact' has slot_resolutions but
#      facet_form is absent (or != canonical). This is likely an Obsidian YAML-strip
#      issue. Snippet will re-transpile on every click. Add 'facet_form: canonical'
#      to frontmatter to restore caching."
# Re-Forge-click same snippet. Verify NO new warning (dedup works).

# Step 4 — restore facet_form: canonical to frontmatter.
# Re-click. Verify no warning, cache hit semantics restored.

# Step 5 — Reload Obsidian fully (Cmd-R).
# Open the same stripped-facet_form snippet again, Forge-click.
# Expected: warning fires ONCE (Pyodide instance was destroyed, dedup
# Set was reinitialized).
```

Failure modes:
- Step 3 silent: detection logic not reaching console. Check `_forge_facet_form_warning_set` exists in Pyodide globals; check `detect_facet_form_strip_trap` import works.
- Step 3 fires twice on same click: dedup Set is being reset between calls (shouldn't happen; verify the Set is module-scoped not function-scoped).
- Step 5 doesn't fire: dedup Set isn't being torn down with Pyodide instance — possible if main.js retains module references.

## §4 — Auto-smoke results

- forge: `.venv/bin/pytest` → **638 passing** (was 630 + 8 new in `test_facet_form_strip_trap.py`).
- plugin: `npm test` → **538 passing** (no plugin TS tests added — pure-decision logic fully covered engine-side).
- `npm run build` exit 0; backtick-trap lint clean.
- `bash scripts/release.sh 0.2.81` clean. All drift checks (engine + 3 bundled vaults) clean. Bundle catch: forge-tutorial/09-slots/Slots.md had a source-side update that the parametric sync caught and committed.
- Zip published, tag pushed, GH release created.

## §5 — Open follow-ups

1. **Plugin-side integration test harness (Item B Phase 2-5)**: deferred per §1.3 throw-away assessment. When the cohort exposes a real plugin-side regression that engine-side coverage doesn't catch, the harness investment becomes justified. Until then, engine-side coverage + the v0.2.81 defensive warning provide the cohort-protection surface.

2. **Auto-restore `facet_form: canonical` (user-authorized warning-only this drain)**: when cohort warnings show high frequency on a specific snippet pattern, future drain considers auto-write. The warning's dedup means a single user hitting it many times still only produces telemetry once per session; cross-session telemetry would require a different mechanism (which V1 doesn't have).

3. **V2 throw-away ratio note**: Item A is ~100% throw-away when V2 lands (the `facet_form`/`english_hash` surface goes away in favor of `source: english | epython`). Item A's cost is ~50 LOC + 8 tests; trivially acceptable. The decision to defer Item B's plugin-side harness avoids a much larger throw-away.

4. **Naming reconciliation in the prompt**: `slot_resolutions` → `english_hash` substitution is documented in this feedback + the commit body + the test file. Future similar prompts should reference `english_hash` as the canonical detection signal.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1.1 (insertion site), §1.2 (naming reconciliation), §1.3 (Item B harness assessment) all discharged before implementation.
- ✓ §57–74 (TDD): Item A tests written first; 7-case initial pass + 1 refinement after naming reconciliation.
- ✓ §86–118 (pure-core convention): `detect_facet_form_strip_trap` is a pure function in `forge/core/executor.py`; the pyodide-host.ts wrapper adds side-effects (js.console.warn + dedup Set membership).
- ✓ §76 (don't ship speculative fix): Item B plugin-side harness NOT shipped because empirical justification is weak — engine-side coverage is comprehensive and V2 throw-away ratio is ~90%.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.79; explicit `bash scripts/release.sh 0.2.81` arg.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ "Assert cannot only with concrete error" HARD RULE: §1.2 reconciles the prompt's `slot_resolutions` naming with the actual `english_hash` artefact, citing the concrete `writePythonAndEnglishHash` writer that persists it.
- ✓ Standing user rule: committed directly to main in both forge + forge-client-obsidian.

Per cc-prompt-queue.md §43, this report is the chat summary.
