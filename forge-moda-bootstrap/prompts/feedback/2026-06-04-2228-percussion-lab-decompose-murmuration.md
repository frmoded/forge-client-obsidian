---
timestamp: 2026-06-04T16:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-04T22:28:00Z
status: success — PREVIEW MODE (uncommitted working-tree changes only)
---

# Percussion Lab — decompose Murmuration — feedback (PREVIEW)

## §0 Preview-mode confirmation

**No git side effects.** All three repos confirmed uncommitted/untagged:

```
=== forge-music ===
 M percussion/murmuration.md       ← preview modification (Python facet refactor)
?? .forge/                          ← pre-existing edge-snapshot dir, NOT this drain
?? .obsidian/                       ← Forge state dir, NOT this drain
?? percussion_lab/                  ← 9 new files (8 section snippets + README.md)
last commit: 81736a5 [2026-06-02-2315-blues-song-drum-part-preview]  ← from a prior drain

=== forge ===
 M docs/specs/constitution.md       ← PRE-EXISTING (V2a v4→v5 caller-scoped docs from a prior session), NOT this drain
?? docs/specs/chips-schema.md       ← PRE-EXISTING untracked, NOT this drain
?? tests/music/test_percussion_lab.py ← NEW preview test file
last commit: c181ad5 [2026-06-03-0000-URGENT-freeze-broken-snapshot-capture-missing-in-pyodide]  ← from a prior drain

=== forge-client-obsidian ===
(clean — no changes this drain)
last commit: d061b94 Release v0.2.47  ← from the immediately prior drain
```

**Also NOT done** (explicit checklist):
- ✗ `git commit` — none, any repo.
- ✗ `git push` — none.
- ✗ `git tag` — none.
- ✗ `npm run sync-engine-bundle` — not invoked.
- ✗ `npm run build` / `release-zip` — not invoked.
- ✗ Plugin version bump — manifest.json unchanged.
- ✗ vault version bump (`forge.toml`) — unchanged at v0.3.8.

Revert via: `cd forge-music && git restore percussion/murmuration.md && rm -rf percussion_lab` + `cd forge && rm tests/music/test_percussion_lab.py`.

## §1 Files created

**`forge-music/percussion_lab/`** (9 files):

```
README.md        35 lines
solitary.md     106
companions.md    94
gathering.md     99
swarming.md      97
peak.md          94
dispersing.md    99
threading.md     92
resting.md       99
```

**`forge/tests/music/`** (1 file):

```
test_percussion_lab.py   227 lines
```

Total: 10 new files, 1042 lines.

## §2 Files modified

**`forge-music/percussion/murmuration.md`** — Python facet replaced with thin orchestrator. English facet preserved (plus one new sentence pointing at the decomposition).

Pre-refactor (252 lines total in file, with a ~210-line Python facet):

```python
def compute(context):
    import copy as _copy
    ts = meter.TimeSignature('4/4')
    mm = tempo.MetronomeMark(number=96)
    # ... ~200 more lines: per-instrument per-section hit schedules,
    # make_section_measures, build_part, voices(...)
```

Post-refactor (Python facet ~10 lines):

```python
def compute(context):
    # Bare references — match the existing forge-music compose pattern
    # (e.g., blues/song.md calls bare "chorus" / "drum_chorus"). See
    # §4 below for the cross-subdir resolution analysis.
    return sequence(
        context.compute("solitary"),
        context.compute("companions"),
        context.compute("gathering"),
        context.compute("swarming"),
        context.compute("peak"),
        context.compute("dispersing"),
        context.compute("threading"),
        context.compute("resting"),
    )
```

English-facet diff: added one sentence — *"Decomposed into 8 callable section snippets in [[percussion_lab]] so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations."* — plus a `# Dependencies` block listing the 8 wikilinks (using `[[../percussion_lab/<name>]]` syntax since they live in a sibling subdir).

## §3 Tests

### `forge/tests/music/test_percussion_lab.py` — 8 cases, all PASS

```
test_solitary_returns_7_parts_with_only_kick_active                                  PASSED
test_solitary_bars_parameter_elongates                                                PASSED
test_companions_has_kick_and_closed_hihat_active_others_silent                        PASSED
test_peak_includes_crash_cymbal_on_bars_1_and_3                                       PASSED
test_dispersing_inserts_decrescendo_hairpin                                           PASSED
test_each_section_anchors_dynamic_mark_on_kick                                        PASSED
test_resting_bar_1_has_kicks_on_1_and_3_bars_2_4_have_only_beat_1                     PASSED
test_murmuration_after_refactor_matches_pre_refactor_structure                        PASSED

==================== 8 passed, 1 warning in 0.44s ====================
```

### Full music suite

```
======================== 133 passed, 1 warning in 5.11s ========================
```

(125 prior + 8 new = 133. No regressions in pre-existing tests.)

### Full forge suite

```
================== 509 passed, 4 skipped, 1 warning in 44.49s ==================
```

(501 prior + 8 new = 509.)

## §4 Cross-subdir resolution (load-bearing finding)

Empirical check ran two ways:

### Test fixture (forge-music scanned as authoring vault)

- BARE `context.compute("solitary")` from `forge-music/percussion/murmuration` → **RESOLVES** (basenames index flat in authoring scan).
- QUALIFIED `context.compute("forge-music/percussion_lab/solitary")` → FAILS (no vault named `forge-music` in self-scan; resolver splits on first `/` and looks for `_vaults['forge-music']`).

### Production-shaped vault (forge-music as library subdir inside a parent user vault)

- BARE `context.compute("solitary")` from `forge-music/percussion/murmuration` → **FAILS** with `Snippet 'solitary' not found. Searched: authoring, forge (built-in).`
  - Caller-scoped probe (constitution A4.1) checks `forge-music/percussion/solitary` only — that's the caller's own directory, not `percussion_lab/`.
  - Legacy bare walk searches resolution order [authoring, forge] — neither has `solitary` at the top level.
- QUALIFIED `context.compute("forge-music/percussion_lab/solitary")` → **RESOLVES** correctly.

### Conclusion + decision

**Bare and qualified are MUTUALLY EXCLUSIVE across the two contexts.** No single reference shape works in both test fixture AND production library-shaped vault.

**Choice for this drain: BARE refs in murmuration.md.** Rationale:
- Path A from the prompt's user-side preview (`File → Open vault → forge-music`) matches the test-fixture shape exactly. The user can listen to Murmuration via Path A without modification.
- Path B (`cp -r percussion_lab + murmuration.md into ~/forge-vaults/test1/forge-music/`) puts forge-music as a library subdir inside test1. Bare refs from murmuration would fail there.

**Path B limitation flagged.** If the user tries Path B and Forge-clicks Murmuration, they'll see `Snippet 'solitary' not found`. Path A is the recommended preview path for this drain. The fix path: a resolver enhancement (cross-subdir bare walk within the caller's vault) — out of scope here; flagged as a candidate follow-up.

### Why this matters for the constitution

The v0.2.26 caller-scoped sibling resolution (constitution A4.1) probes the caller's own directory only — `{caller_vault}/{caller_dir}/{bare_id}`. Cross-subdir bare refs were not contemplated when A4.1 shipped. The decomposition pattern (Murmuration calling sibling-dir percussion_lab snippets) surfaces a new use case that would benefit from a CALLER-SCOPED VAULT WALK (probe `{caller_vault}/**/<bare_id>` recursively, declaration-order). That would unify Path A and Path B behaviors. Recommended for a future constitution clarification.

## §5 Surprises / deviations

### 1. `sequence()` groups parts by `type(inst).__name__` ONLY, not by percMapPitch

**Surfaced during behavior-preservation test.** `lib.sequence()` in forge/forge/music/lib.py:80-105 uses `_instrument_key(part) = type(inst).__name__`. So closed_hihat (HiHatCymbal pmp=42) and open_hihat (HiHatCymbal pmp=46) — being the SAME class — collide at the same voice position.

**Concrete failure mode:** my initial decomposition had each section return ONLY the active parts in order. peak's voices were `(kick, open_hh, snare, low_tom, mid_tom, crash)` — open_hh at position 1. Other sections had closed_hh at position 1. `sequence()` merged peak's open_hh notes into the closed_hh stave (rendered at pitch 42 instead of 46). 16 open-hi-hat hits in peak section played as CLOSED hi-hat. Audible regression.

**Fix:** every section now returns the CANONICAL 7-part layout `(kick, snare, closed_hh, open_hh, low_tom, mid_tom, crash)` — silent instruments use empty hit patterns so `voices()`/`sequence()` get all-rest measure parts at consistent voice positions. The prompt's "only the instrument parts that ACTUALLY play in this section (no all-rest staves)" guidance had to be inverted: ALL 7 parts always present, with rests for silent instruments. Documented inline in each snippet's English facet and `percussion_lab/README.md`.

**Underlying issue worth flagging:** `_instrument_key` should arguably include `percMapPitch` (or `getattr(inst, 'percMapPitch', None)`) so that same-class-different-pitch instruments don't collide. That's a `lib.py` change — explicitly out of scope per the prompt's "DO NOT extend lib.py" rule. Flagged as a high-value follow-up: the workaround (always-7-parts) costs ~50 lines of rest-pattern boilerplate per section.

### 2. The `forge-music/X` qualified-ref shape doesn't work as the prompt's example suggested

The prompt's example `context.compute("percussion_lab/solitary")` doesn't work as a "within-vault qualified" reference. The resolver always splits on the FIRST `/` and treats the LHS as a vault name. So:

- `percussion_lab/solitary` → looks for vault `percussion_lab` (doesn't exist).
- `forge-music/percussion_lab/solitary` → works in production library scan, fails in test-fixture authoring scan.

§4 above covers the choice between bare and qualified. The prompt's literal example was inaccurate; I used bare.

### 3. Test fixture vs production behavior gap

Documented in §4. The test fixture's "scan forge-music as authoring" is intentional per conftest.py's design ("the published vault at `~/projects/forge-music/` is the source of truth (no authoring-vault layer like forge-moda has)") but doesn't match the production library-vault topology. The fixture is fine for testing individual snippets but doesn't reveal cross-subdir resolution issues — those only surface in production-shape probes (or via Path B).

### 4. `bars=0` edge case behavior

Each section returns `stream.Score()` (empty) when `bars=0`. The all-7-parts layout doesn't apply because there are no measures to build. This means `sequence()` with a mix of `bars=0` and `bars>0` sections would produce inconsistent voice counts. Acceptable for a `bars=0` edge case — composer-authors wouldn't naturally chain a `bars=0` section into a piece.

### 5. The `bars` parameter cycles 4-bar patterns

All sections accept `bars=N`:
- `N > 4`: pattern cycles via `pattern[i % len(pattern)]`. Verified by `test_solitary_bars_parameter_elongates` (bars=8 → 16 kick notes = 2 per bar × 8 bars).
- `N < 4`: takes the first N elements.
- `N == 0`: returns empty Score.

No surprises here. Each section's `_cycle` helper is the same shape.

## §6 Confidence in behavior preservation

**High** for Path A (forge-music opened as vault directly):

- All 8 section snippets produce the canonical 7-part layout with the exact patterns lifted from the pre-refactor murmuration.md.
- The behavior-preservation test (`test_murmuration_after_refactor_matches_pre_refactor_structure`) compares post-refactor murmuration's per-instrument note counts and measure counts against the pre-refactor expected. PASSES with all 7 instrument identities (BassDrum, SnareDrum, closed-hihat at pmp=42, open-hihat at pmp=46, low-tom at pmp=41, mid-tom at pmp=47, crash at pmp=49) showing exactly the expected counts.
- The kick-anchor dynamic-mark pattern (from `drum_chorus.md`) is verified per-section by `test_each_section_anchors_dynamic_mark_on_kick`.
- The dispersing-section hairpin (Diminuendo spanner) is verified by `test_dispersing_inserts_decrescendo_hairpin`.

**Caveats worth noting:**

- The dynamic-mark count per piece is DIFFERENT from the pre-refactor: pre-refactor had marks on every instrument's section (multiple marks per stave per section because the original `make_section_measures` called `with_velocity(..., mark_dynamics=True)` for every instrument); post-refactor follows the `drum_chorus.md` anchor pattern (one mark per section per piece, on the kick part). MuseScore will render ONE Italian abbreviation per section rather than 7 — visually cleaner, semantically equivalent (the velocity values per note are the same). User may notice the visual difference if they compare side-by-side.
- Path B WILL FAIL per §4. The user should use Path A for the preview.

## §7 User-side preview instructions

### Path A — open `forge-music` source vault directly (RECOMMENDED)

1. In Obsidian: `File → Open vault → Open folder as vault → /Users/odedfuhrmann/projects/forge-music`
2. Open `percussion/murmuration.md`.
3. Cmd-P → `Forge: Run only (active snippet)` (or click the Forge flame icon).
4. Wait ~5-10 seconds for music21 compute. The Forge Output panel should render a 7-stave score (kick, snare, closed-hi-hat, open-hi-hat, low-tom, mid-tom, crash) across 32 measures (8 sections × 4 bars).
5. Click the play button on the audio widget. Listen.

**What to listen for:**
- Same arc, same sound as the pre-refactor Murmuration: spare kick at start → closed-hihat enters → snare/eighths → toms + open-hh → loud peak with crash + 16th rolls → decrescendo dispersing → quieter return with snare offbeats → kick alone, fading to silence.
- Same dynamic arc on the kick staff: `mp` Solitary → `mf` Companions/Gathering/Swarming → `ff` Peak → `decresc.` hairpin Dispersing → `mf` Threading → `p` Resting.

**Visible difference (expected):** the kick stave shows ONE Italian dynamic abbreviation per section (`mp`, `mf`, `ff`, hairpin, `mf`, `p`). Pre-refactor had marks on every instrument's stave per section. This is a visual simplification — the velocity values per note are identical.

### Path B — copy files into existing test vault (PARTIAL — bare refs won't resolve)

This path triggers the cross-subdir resolution gap documented in §4. Murmuration's `context.compute("solitary")` calls will fail with `Snippet 'solitary' not found`. Use Path A instead.

For section-level testing (individual sections work fine in Path B because the user is Forge-clicking each section directly, not through murmuration's orchestrator):

```bash
cp -r /Users/odedfuhrmann/projects/forge-music/percussion_lab ~/forge-vaults/test1/forge-music/percussion_lab
cp /Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md ~/forge-vaults/test1/forge-music/percussion/murmuration.md
```

Then Cmd-Q + reopen Obsidian → open `forge-music/percussion_lab/peak.md` → Forge-click. Each individual section will render its 7-part score independently. Murmuration itself won't work in Path B (the bare-ref limitation).

### What it ENABLES (Phase 4)

After Phase 2 lands (if approved), you can author a sister piece in `percussion_lab/sister_piece.md` that sequences the 8 sections in a different order — say `companions → gathering → peak → dispersing → solitary → resting` (asymmetric, peak in the third position, gradual fade). Murmuration's vocabulary; different composition. Or call individual sections with custom `bars` for piece-specific variations.

### Revert path

```bash
cd /Users/odedfuhrmann/projects/forge-music
git restore percussion/murmuration.md
rm -rf percussion_lab

cd /Users/odedfuhrmann/projects/forge
rm tests/music/test_percussion_lab.py
```

Path B cleanup (if used):

```bash
rm -rf ~/forge-vaults/test1/forge-music/percussion_lab
# murmuration.md in test1 vault: Cmd-Q Obsidian, then:
rm ~/forge-vaults/test1/forge-music/percussion/murmuration.md
# Reopen Obsidian → forge-music auto-re-extracts the bundled version (v0.2.38+ behavior).
```

### Recommended follow-ups (post-approval if preview lands)

1. **`_instrument_key` enhancement.** Include `percMapPitch` in the grouping key so same-class-different-pitch instruments don't collide in `sequence()`. Would eliminate the "always-7-parts" boilerplate per section (~50 lines per snippet × 8 = ~400 lines of rest-pattern cruft). High value; small targeted change to `lib.py`.
2. **Cross-subdir bare-ref resolution.** Either:
   - A constitution clarification extending A4.1 to walk the caller's whole vault, OR
   - A documented convention that cross-subdir refs must always be fully qualified (`vault/path/snippet`).
3. **Phase 4 sister piece.** Once the user approves the decomposition, author a second piece using the 8 sections in a different order to validate the vocabulary's reusability claim.
4. **Shared helper extraction.** The 40-line `_cycle` / `_build_bar` / `_build_part` boilerplate is duplicated in all 8 sections. A future drain could lift these into `lib.py` (with a new `def section_helpers()` factory or similar) once the vocabulary stabilizes.
