---
prompt: 2026-06-26-1400-v0346-fix-editorial-misc-attribute-error.md
shipped_version: v0.2.148 (release.sh auto-bumped past v0.2.147 due to intermediate spike-exclusion commit)
session: drain-2026-06-26-1400
date: 2026-06-26
status: shipped
---

# v0346 feedback — editorial.misc AttributeError fix + driver-spike-file exclusion convention

## §1 — Root cause confirmation

Driver runtime smoke against v0.2.146:
```
runSnippet: Forge Compute non-2xx: 500
File "/bundle/engine/forge/music/lib.py", line 933, in to_kit_notation
    new_note.editorial.misc['forge_source_instrument'] = src_inst
File "/bundle/site-packages/music21/editorial.py", line 126, in __getattr__
    raise AttributeError(f'Editorial does not have an attribute {name}')
```

music21's `Editorial` class has `predefinedDicts = ('misc',)` COMMENTED OUT in the bundled version. The lazy attribute read on `editorial.misc` raises before the dict-set can fire. `predefinedLists` and `predefinedNones` cover other attributes; `misc` falls into the AttributeError branch.

Why engine pytest didn't catch this: engine pytest runs against the venv music21 (possibly a different version where `misc` IS predefined). Driver runtime smoke runs against pyodide-bundled music21 where the predefinedDicts line is commented out. **Third runtime-evidence-beats-source-audit case today** (v0.2.132 HARD RULE).

## §2 — What shipped (v0.2.148)

### §2.1 — Engine fix (`forge/forge/music/lib.py` line ~933)

```python
# v0.2.147 — initialize editorial.misc if music21's Editorial class
# doesn't predefine it. ...
if 'misc' not in new_note.editorial:
    new_note.editorial.misc = {}
new_note.editorial.misc['forge_source_instrument'] = src_inst
```

The membership check + setattr pattern works regardless of which music21 version is loaded:
- `'misc' not in editorial` uses dict-membership `__contains__` (doesn't trigger the `__getattr__` AttributeError branch).
- `editorial.misc = {}` writes through `__setattr__` (line 128 of editorial.py).
- Subsequent `editorial.misc[...]` reads the now-existing dict.

### §2.2 — Engine audit (per prompt §1.2)

`grep -rn "editorial.misc" forge/` → only one site (`lib.py:933`). No other usages need fixing.

### §2.3 — Regression test (per prompt §1.3)

New `test_to_kit_notation_handles_uninitialized_editorial_misc` in `tests/music/test_kit_notation.py`. Uses fresh Notes with no editorial pre-init, simulating the runtime case the driver hit on murmuration. Pre-v0.2.147 raised AttributeError; post-v0.2.147 cleanly preserves source Instrument. Asserts:
- No raise during `to_kit_notation(score)`.
- Output note has `'misc' in editorial`.
- `editorial.misc['forge_source_instrument']` is the source instrument (verified by class name 'SnareDrum').

### §2.4 — Driver-spike-file exclusion convention (NEW)

The release.sh drift check caught `forge-music/_spike2.md` mid-release (driver's smoke validator file living locally in source vault). v0345 had the same shape with `_P.md` and required a per-release cleanup commit. Codified the convention as a permanent exclusion:

- `scripts/sync-bundled-vault.mjs:isExcludedName` — added `_spike*.md` + `_P*.md` patterns.
- `scripts/build-release-zip.mjs:vaultIsInScope` + `vaultWalk` — mirror the same exclusion so drift check + release zip both honor it.

Convention: filenames starting with `_spike` (any extension) OR matching `_P*.md` are LOCAL-ONLY. Driver keeps them untracked in source vault repos for cohort smoke; sync doesn't mirror; release zip doesn't include; the v0.2.144 bundled-vault bump preflight doesn't false-positive on them.

## §3 — Tests + release

- 786 plugin tests still passing.
- 15 engine pytest tests (14 baseline + 1 new regression).
- Build clean.
- Tag `v0.2.148` + GH release with assets.
- INSTALL.md synced.
- Engine commit pushed.

## §4 — Release surprise: v0.2.148 instead of v0.2.147

release.sh auto-bumped past v0.2.147 because the spike-exclusion fix landed as an intermediate commit between the original v0.2.147 bump attempt + the retry. Well-precedented under the shared-remote multi-worktree pattern (v0.2.124, v0.2.134, v0.2.136, v0.2.146).

## §5 — Per-protocol HARD RULE compliance

- ✓ §78: traced music21 Editorial source + identified the predefinedDicts pattern before coding.
- ✓ §57–74: 1 new failing-first regression test reproducing the runtime fault.
- ✓ §86–118: fix stays within `to_kit_notation` pure logic.
- ✓ §76: driver-spike-confirmed.
- ✓ §347: release.sh handled the auto-bump correctly.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.124 pure-core dispatch HARD RULE: pure-core unchanged.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: APPLIED (3rd instance today; reinforces the rule).
- ✓ v0.2.134 §5 inlined-version preflight: passed.
- ✓ v0.2.144 bundled-vault bump preflight: passed (no real vault content changes; spike-file drift caught + permanently resolved via exclusion).

## §6 — User-side smoke (deferred to driver)

Per prompt §4:
1. BRAT update to v0.2.148.
2. Driver re-runs `_spike2.md` Forge-click.
3. Expected: NO AttributeError; murmuration computes through `to_kit_notation` cleanly.
4. Score renders. Evaluate Checkpoints A-D from spike 2.

If renders cleanly → Phase B integration (toolbar + dual XML production) unblocked; proceed as v0.2.149 follow-up.

If renders but checkpoints C/D still fail → engraving needs more work; queue separate prompt.

## §7 — Open follow-ups + carry-forward

1. **Phase B integration** (v0.2.146 §3 carry-forward): still queued. Driver's spike result determines whether Phase B ships speculatively or after further engraving fixes.
2. **Engine pytest environment audit** (per prompt §5 #2): THIRD case today (v0.2.128 / v0.2.132 / this drain) where pytest passed against venv music21 but pyodide bundled music21 saw different behavior. Worth confirming engine pytest's music21 version matches pyodide's, OR adding a CI step that exercises critical paths in pyodide directly. Flag for separate drain.
3. **`editorial.misc` deprecation** (per prompt §5 #3): the commented-out `predefinedDicts` suggests this is deprecated in music21. Long-term, source-Instrument preservation could use a different mechanism (e.g., a per-note attribute set directly via `setattr`). Defer; current fix works.
4. **Spike-file exclusion verification** (NEW): the v0.2.144 bundled-vault bump preflight now needs to know about the spike exclusion too (if a real content change is masked by the spike pattern, it'd silently pass). Not a current concern but worth noting for any future content-rule tightening.

## §8 — Architectural framing

V1 cohort regression closure. Restores v0.2.146 self-heal contract. Plus codifies the spike-file convention so future spike-driven smokes don't require per-release cleanup commits.

Three runtime-evidence-beats-source-audit cases today (v0345 engine refactor, v0346 misc fix, plus the v0345 §0 spike that surfaced v0345 itself). The rule pays its rent reliably.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

v0.2.148 shipped. Driver smoke validates the misc fix; if clean, Phase B integration becomes the next queue priority. Queue empty after this drain.
