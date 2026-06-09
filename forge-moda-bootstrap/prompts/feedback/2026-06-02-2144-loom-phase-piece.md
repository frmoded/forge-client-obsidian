---
timestamp: 2026-06-02T13:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T21:44:00Z
status: success
---

# Loom — Reich-style 3-snippet phase canon

3-snippet composition shipped: `phase_cell` (data) + `phase_shifter` (function) + `loom` (composition). First vault content to exercise `context.compute(snippet_id, *args, **kwargs)` with non-trivial args.

## §0 Versions

- `forge-music/forge.toml`: **0.3.6 → 0.3.7** (confirmed pre-bump; in-feedback substitution).
- `forge-client-obsidian/manifest.json`: **0.2.35 → 0.2.36** (read at drain start; plugin was at v0.2.35 from the v0.2.35 MuseScore-staff-fix drain that completed earlier).

## §1 Files created

| Path | Lines |
| --- | --- |
| `/Users/odedfuhrmann/projects/forge-music/percussion/phase_cell.md` | 23 |
| `/Users/odedfuhrmann/projects/forge-music/percussion/phase_shifter.md` | 89 |
| `/Users/odedfuhrmann/projects/forge-music/percussion/loom.md` | 32 |
| `/Users/odedfuhrmann/projects/forge/tests/music/test_loom.py` | 157 |

Bundle mirrors at `~/projects/forge-client-obsidian/assets/vaults/forge-music/percussion/{phase_cell,phase_shifter,loom}.md` — byte-equal to source.

## §2 Files modified

- `forge-music/forge.toml`: `version = "0.3.6"` → `version = "0.3.7"`.
- `forge-client-obsidian/manifest.json`: `"version": "0.2.35"` → `"version": "0.2.36"`.
- `forge-client-obsidian/INSTALL.md`: `v0.2.35` → `v0.2.36` (sed replace-all).
- `forge-client-obsidian/assets/vaults/forge-music/forge.toml`: mirror of vault bump.

## §3 Tests

`forge/tests/music/test_loom.py` — 6 source `def test_*` functions; `test_phase_shifter_returns_score_with_n_voices` parametrized over `[2, 4, 6]` yields 3 cases → **8 total**:

```
tests/music/test_loom.py::test_phase_cell_returns_clapping_music_shape PASSED
tests/music/test_loom.py::test_phase_shifter_returns_score_with_n_voices[2] PASSED
tests/music/test_loom.py::test_phase_shifter_returns_score_with_n_voices[4] PASSED
tests/music/test_loom.py::test_phase_shifter_returns_score_with_n_voices[6] PASSED
tests/music/test_loom.py::test_phase_shifter_voice_1_is_anchor_never_shifts PASSED
tests/music/test_loom.py::test_phase_shifter_voice_k_shifts_per_formula PASSED
tests/music/test_loom.py::test_phase_shifter_total_bar_count PASSED
tests/music/test_loom.py::test_loom_composes_via_context_compute PASSED
8 passed in 0.49s
```

Test 4 explicitly verifies the shift formula: voice K=3 at section S=2 with shift=1 → offset = `(3-1)*1*2 = 4` eighths → positions are `[(h+4) % 12 for h in [0,1,2,4,5,7,9,10]]` sorted = `[1, 4, 5, 6, 8, 9, 11, 2]` sorted = `[1, 2, 4, 5, 6, 8, 9, 11]`. Test asserts exact match.

Test 6 (integration) asserts voice 4's bar 17 positions equal voice 1's bar 1 positions — the realignment math `3*1*4 = 12 mod 12 = 0` audible verification.

### Full suites

- `cd ~/projects/forge && pytest -q` → **467 passed, 4 skipped in 36.06s** (was 459 + 8 new = 467).
- `cd ~/projects/forge-client-obsidian && npm test` → **161/161 in 4962ms** (unchanged — no plugin-side test changes).

## §4 Engine bundle drift

`cd ~/projects/forge-client-obsidian && npm run sync-engine-bundle` →

```
Synced 0 new/changed, kept 19 already-current, deleted 0 orphans.
```

**No diff produced.** Expected — no `forge/music/lib.py` edits in this drain. Sanity-confirmed `bundle/forge/music/lib.py` is byte-equal to source.

Release-zip preflight engine-bundle drift check also ran clean.

## §5 Release artifact

| Property | Value |
| --- | --- |
| Path | `dist/forge-client-obsidian-v0.2.36.zip` |
| Size | 33.06 MB |
| SHA-256 | `a0a84a2e918f77b95e45f81e3c9cbc89f51016acacb7bb2cdc12cc2a6272e804` |
| Total asset footprint | 37.81 MB |

### Clean-vault smoke (per prompt §Tests §"Release artifact preflight")

```
=== percussion contents ===
loom.md
murmuration.md
phase_cell.md
phase_shifter.md
=== vault version ===  version = "0.3.7"
=== plugin manifest ===  "version": "0.2.36"
```

**All 4 expected paths present** in the bundled zip (`loom`, `phase_cell`, `phase_shifter`, `murmuration`). Versions correct. SHA round-trip via `gh release view --json assets --jq` matches local SHA. ✓

## §6 Commit + tag + release

```
forge@e4424de        — test_loom.py added (8 cases).
forge-music@72bbb8f  — 3 snippets + forge.toml 0.3.6 → 0.3.7.
forge-music tag      — v0.3.7 pushed to origin.
forge-client-obsidian@8fa6ece — bundle mirror + manifest 0.2.35 → 0.2.36 + INSTALL.md.
forge-client-obsidian tag    — v0.2.36 pushed.
GH Release           — https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.36
```

## §7 User-side smoke checklist (deferred)

1. Install plugin v0.2.36 via `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm `Installed forge-client-obsidian v0.2.36`.
2. Delete `~/forge-vaults/test1/forge-music/` (recurring re-extract pain — still pending).
3. Cmd-Q + reopen Obsidian.
4. Forge-click `forge-music/percussion/loom.md`. Verify Verovio renders 4 stacked percussion staves.
5. Click play on the `<midi-player>` widget — should play back ~80 seconds of phasing closed-hi-hat eighth notes.
6. Listen for the realignment: at bar 17 (section 5 — boundary between sections 4 and 5 in 0-indexed math), voice 4 should be back-in-unison with voice 1 (offset=0). The audible "click" of all 4 voices momentarily aligning is the load-bearing artistic outcome.
7. Optional: click MusicXML download → open in MuseScore → verify all 4 staves render as single-line percussion (the v0.2.35 fix applies; should not regress).

## §8 Surprises / deviations

### Deviation 1: `snapshot_capture: false` added to `phase_cell.md`

**Prompt §Don'ts** said "Don't capture phase_cell's instrument factory by calling it (closed_hihat()) inside the cell dict. Store the factory itself; the shifter calls it per hit." I followed that — `cell['instrument']` is the bare `closed_hihat` factory function.

**But**: this caused `test_loom_composes_via_context_compute` to fail on first run with:

```
SnippetExecError: Cannot capture snapshot for edge authoring/loom→authoring/phase_cell:
return value of type dict is not wire-serializable
(Object of type function is not JSON serializable).
Either return a serializable value, or declare `snapshot_capture: false`
in frontmatter to opt out of capture for this snippet.
```

The engine's edge-snapshot capture (per constitution F-series) tries to wire-serialize the return of every computed snippet to disk. The dict's `instrument` key holds a function reference — not serializable.

**Fix**: added `snapshot_capture: false` to `phase_cell.md`'s frontmatter, per the engine's own error-message hint. All 8 tests pass post-edit.

**Why this is a meaningful deviation**: the prompt didn't anticipate the snapshot-capture interaction. The frontmatter addition is small (one line) and well-supported by the engine, but it's a real authoring-API surface the user might want forge-core to recognize: "when a snippet returns a value containing function references (or other non-serializable objects), the author must explicitly opt out of snapshot capture." This is the FIRST shipped snippet to need this opt-out, so it's worth flagging as a Level-2 candidate for forge-core's review.

### Deviation 2: `_resolve_phase_shifter_compute` helper in test_loom.py

The prompt's test cases 2-5 call `phase_shifter` with varying kwargs. The natural way to do this is via `run_music_block` which goes through `context.compute(snippet_id, *args, **kwargs)`. But `run_music_block` (per `tests/music/conftest.py:42`) takes only `*args, **inputs` — there's no way to vary the snippet's "additional kwargs" cleanly per-test.

**Solution**: a per-test helper `_resolve_phase_shifter_compute(music_resolver)` that:
1. Resolves `phase_shifter` via the shared resolver fixture.
2. Compiles its Python facet into a fresh namespace populated with the music-domain globals (`_domain_globals_for(["music"])` + builtins + random/math/numpy).
3. Returns the bound `compute` function + a minimal `ForgeContext`.

The test cases can then call `fn(ctx, cell, voices=N, ...)` directly with any kwarg combination. The end-to-end integration test (`test_loom_composes_via_context_compute`) still goes through `run_music_block("loom")` → real `context.compute("phase_shifter", cell, ...)` to validate the args-passing engine path.

**Why this works**: the helper exercises the same compiled Python the engine would, just bypasses the engine's `exec_python` wrapper for the `phase_shifter` step. It's a test-author affordance, not a behavior change.

### Deviation 3: tests live in `forge/tests/music/test_loom.py`, NOT `tests/core/test_executor.py`

Per the prompt's §"For forge-core second-pass review" item 3, the user might want the composition-pattern tests in core/test_executor.py instead of music/. I picked music/ because:
- The integration test (`test_loom_composes_via_context_compute`) goes through `run_music_block` which depends on the music vault fixture.
- The unit tests (phase_shifter shape) depend on `closed_hihat` from the music lib.
- Both are music-domain-coupled.

If forge-core's second-pass review prefers a split (engine args-passing tests in `core/`, music-specific tests in `music/`), the refactor is mechanical — `test_phase_shifter_voice_k_shifts_per_formula` could move with a generic dict-cell input. Defer to forge-core's call.

## §Smoke split

**Auto-verified by CC** (enumerated):
- §1 + §2 file creation + modification (incl. version bumps).
- §3 8 test cases pass + full forge suite 467/4 skipped + plugin 161/161.
- §4 engine bundle drift clean.
- §5 release artifact built, drift preflight clean, clean-vault smoke confirms all 4 percussion paths.
- §6 commits + tags pushed across 3 repos; GH Release URL.
- SHA round-trip via gh CLI: match.

**Deferred to user** (enumerated):
1-7 above under §7.

## §Follow-ups noted but not built

**From this drain:**

1. **`snapshot_capture: false` is now a documented authoring escape hatch.** First shipped snippet to use it. Worth forge-core's second-pass review whether the constitution should recognize this pattern (Level-2 candidate per the cowork-protocol). Use cases: any snippet returning a dict/object containing function references, instruments, or other non-wire-serializable Python values.

2. **`phase_shifter` is generic enough to host other Reich-shaped pieces.** Swap `phase_cell` for a different cell (different timbre, different hit pattern) and you get a new piece without touching the algorithm. Worth queueing as a follow-up content drain: e.g. `tabla_phase.md` with bongo/conga factories, or a `clapping_music_full.md` that uses the full Reich 12-section progression.

3. **`run_music_block` fixture limitation surfaced**: can't pass per-call kwargs to a snippet's compute function. The `_resolve_phase_shifter_compute` helper sidesteps it. If a future drain needs varied-kwargs testing for another snippet, the helper could be promoted to `conftest.py`. Not blocking; flag.

**Standing items (unchanged):**

1. Auto re-extract on `forge.toml` change — STILL the oldest pending; 10+ drains.
2. `DOMAIN_AVAILABILITY` fail-loud registry.
3. Closed-beta micropip rider.
4. Vault content sync generalization (`npm run sync-bundles`).
5. Scope-filter triplication.
6. HTTP fallback collapse for v0.2.6-era endpoints.
7. Engine-import allowlist audit.
8. `forge.installer` exclusion grep.

Plus from v0.2.35 feedback:
- Migrate Murmuration / drums_shuffle to `kick()` / `snare()` factories.
- music21 MusicXML `<midi-unpitched>` off-by-one (deferred until user-side smoke confirms whether MuseScore-via-MusicXML playback differs from GarageBand-via-MIDI).

## §Protocol comments for driver

1. **The 3-snippet composition pattern works cleanly at the engine level.** `context.compute("phase_shifter", cell, voices=4, ...)` did exactly the right thing. v0.2.34's earlier work on snippet_id derivation + caller-scoped resolution paid off here — no special wiring needed for the args path.

2. **Snapshot-capture is a real cross-cutting concern for shipped content.** This drain surfaced it organically; the error message is actionable (names the frontmatter opt-out by exact spelling); the fix is one line. Pattern worth codifying: "if a snippet returns a value containing non-serializable Python objects, declare `snapshot_capture: false`." Could be a MUSIC_PROMPT_FRAGMENT rule when forge-core's review concludes (Level 2 candidate).

3. **`_resolve_phase_shifter_compute` as a test-author affordance is reusable.** It's the "test the inner compute function without the engine's exec_python wrapper" pattern. If we see another snippet that takes complex kwargs in the future, the helper could be generalized to `_resolve_snippet_compute(music_resolver, snippet_id)` and live in `conftest.py`.

4. **Cross-drain coordination**: this drain happened immediately after v0.2.35's MuseScore-staff-fix. v0.2.35's `_force_perc_channel` patch + `kick()/snare()` factories don't interact with Loom directly (Loom uses `closed_hihat()` which already gets the channel fix). So the artistic and infrastructure drains compose cleanly — Loom benefits from the v0.2.35 fix without needing any code changes here.

5. **No version-number conflict this drain.** The prompt left the plugin version as `{CURRENT} → {NEXT_PATCH}` placeholder, deferring to drain-time resolution. CC read current = 0.2.35, bumped to 0.2.36. Smooth. Worth codifying in the cowork-protocol: use placeholder-with-bumping-instruction when authoring prompts that may sit in the queue for arbitrary time.

## §11 Constitutional alignment

Per cowork-protocol's four-level disposition:

**Level 2 — Flag and propose.** The 3-snippet composition pattern (data + function + composition) is the first shipped vault content to use `context.compute(snippet_id, *args, **kwargs)` with non-trivial kwargs. Engine supports it (`executor.py:131-169` ForgeContext.compute), but the authoring shape isn't named in the constitution.

**Proposed Level-2 amendment** (for forge-core's review — not authored here):
- B-series clause recognizing the "function-style snippet" authoring shape: `def compute(context, *args, **kwargs)` is a sanctioned pattern; callers pass args via `context.compute(snippet_id, *args, **kwargs)`.
- B-series sub-clause on snapshot capture for non-serializable return values: declaring `snapshot_capture: false` in frontmatter opts out for snippets returning function references or other non-wire-serializable values.

CC doesn't author constitution amendments per the cowork-protocol's Constitution co-gatekeeper role. forge-core decides whether to propose, defer, or rule out-of-scope.

**Tests' placement** (per prompt §"For forge-core second-pass review" item 3): kept in `tests/music/test_loom.py`. If forge-core's review redirects to `tests/core/`, the refactor is mechanical.
