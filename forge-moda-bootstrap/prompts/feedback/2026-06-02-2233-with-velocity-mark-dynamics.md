---
timestamp: 2026-06-02T13:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T22:33:00Z
status: success
---

# `with_velocity(mark_dynamics=True)` — surface MIDI velocity arcs as visible score dynamics

## §0 Versions

- `forge-music/forge.toml`: **0.3.7 → 0.3.8**
- `forge-client-obsidian/manifest.json`: **0.2.36 → 0.2.37** (read at drain start; plugin was at v0.2.36 from the Loom drain that completed earlier)

## §1 `lib.py` changes

New module-level constants + helper:

```python
from music21 import dynamics

_PROFILE_NOMINAL_MARK = {
  'human':  'mf',   # nominal center 75
  'ghost':  'pp',   # nominal center 35
  'accent': 'ff',   # nominal center 110
}

_VELOCITY_TO_DYNAMIC = [
  (30,  'ppp'),  (45,  'pp'),  (60,  'p'),  (72,  'mp'),
  (85,  'mf'),   (100, 'f'),   (115, 'ff'), (127, 'fff'),
]

def _velocity_to_dynamic_mark(velocity):
    """Map a MIDI velocity (1-127) to its Italian dynamic abbreviation."""
    for max_v, mark in _VELOCITY_TO_DYNAMIC:
        if velocity <= max_v:
            return mark
    return 'fff'

def _insert_dynamic_at_note(target_note, mark):
    """Insert music21.dynamics.Dynamic at target_note's offset in
    activeSite. Skip silently when activeSite is None."""
    site = target_note.activeSite
    if site is None: return
    site.insert(target_note.offset, dynamics.Dynamic(mark))
```

`with_velocity` signature extended:

```python
def with_velocity(notes, pattern, mark_dynamics=False):
```

Insertion logic added per-pattern:

- **int**: `_insert_dynamic_at_note(non_rest_notes[0], _velocity_to_dynamic_mark(clamped))`
- **named profile ('human' / 'ghost' / 'accent')**: `_insert_dynamic_at_note(non_rest_notes[0], _PROFILE_NOMINAL_MARK[pattern])`
- **'crescendo' / 'decrescendo'**: bracketing dynamics (p+f or f+p) + `dynamics.Crescendo()` / `dynamics.Diminuendo()` spanner via `.addSpannedElements([first, last])` inserted at the first note's offset in its activeSite.
- **list**: skip entirely.

The function refactored from per-note iteration to pre-collecting `non_rest_notes` once, which makes the spanner addressing (first/last) trivial.

## §2 `llm_prompt.py` rule

Added after the existing `with_velocity` rule:

```
- When a piece's dynamic arc is artistically load-bearing, call
  `with_velocity(notes, profile, mark_dynamics=True)` so the dynamic
  markings appear visibly in the printed score (MuseScore via
  MusicXML), not just in MIDI playback. The flag inserts a single
  Italian dynamic mark (`pp`/`p`/`mp`/`mf`/`f`/`ff`) for int and
  named profiles, and hairpin spanners (`<` / `>`) plus bracketing
  dynamics for `'crescendo'` / `'decrescendo'`. List patterns
  (cyclic per-note variation) deliberately skip dynamic insertion —
  too granular to mark cleanly. Default is `mark_dynamics=False` for
  back-compat and for pieces (e.g., Reich-style phase music) where
  dynamics are intentionally absent.
```

## §3 Murmuration retrofit

`forge-music/percussion/murmuration.md`:

**Python** (1-line change inside `make_section_measures`):
```python
- with_velocity(all_notes, profile)
+ with_velocity(all_notes, profile, mark_dynamics=True)
```

**English** (1 sentence added after the existing "Velocity carries..." paragraph):

> The dynamic arc is now marked in the score itself (`pp` at edges, `ff` at the Murmuration peak, hairpins on Crescendo/Decrescendo sections) — visible in MuseScore, not just heard in MIDI — via `with_velocity(..., mark_dynamics=True)`.

Loom + phase_cell + phase_shifter NOT touched — Reich convention preserved per prompt §"Don'ts".

## §4 Tests

`tests/music/test_lib.py` — 11 new test functions; `test_velocity_to_dynamic_mark_boundaries` parametrized over 16 (velocity, expected) pairs → **27 cases**. All pass.

```
test_with_velocity_no_dynamics_inserted_by_default                PASSED
test_with_velocity_int_inserts_single_dynamic                     PASSED
test_with_velocity_human_inserts_mf                               PASSED
test_with_velocity_ghost_inserts_pp                               PASSED
test_with_velocity_accent_inserts_ff                              PASSED
test_with_velocity_crescendo_inserts_hairpin                      PASSED
test_with_velocity_decrescendo_inserts_diminuendo_hairpin         PASSED
test_with_velocity_list_pattern_skips_dynamics                    PASSED
test_velocity_to_dynamic_mark_boundaries[1-ppp]   ... [127-fff]   PASSED (16x)
test_with_velocity_active_site_none_skips_insertion               PASSED
test_with_velocity_clamp_to_int_below_1_uses_ppp_mark             PASSED
```

`tests/music/test_percussion_content_invariants.py` — 1 new test:

```
test_murmuration_score_contains_dynamic_markings                  PASSED
```

Asserts the post-retrofit Murmuration has ≥1 `dynamics.Dynamic` in its returned Score (walks every Part via `.recurse()`). Pre-v0.3.8 would have had zero.

### Full suites

- `pytest -q` in forge: **494 passed, 4 skipped in 36.39s** (was 467; +27 new).
- `npm test` in forge-client-obsidian: **161/161 in 4551ms** unchanged.

## §5 Engine bundle drift

`npm run sync-engine-bundle`:

```
[copy]   forge/music/llm_prompt.py
Synced 2 new/changed, kept 17 already-current, deleted 0 orphans.
```

`lib.py` + `llm_prompt.py` synced. Both byte-equal to source post-sync. Drift preflight at release-zip clean.

## §6 Release artifact

| Property | Value |
| --- | --- |
| Path | `dist/forge-client-obsidian-v0.2.37.zip` |
| Size | 33.06 MB |
| SHA-256 | `38a129b3b0225a342f0dd4cce14c6c9858f0ae7d66ff718fd3f86905dfc64228` |
| GH Release | <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.37> |
| SHA round-trip | match ✓ |

### Clean-vault smoke

```
=== mark_dynamics=True in bundled murmuration.md ===   2 ✓
   (one in Python facet, one in English facet)
=== _VELOCITY_TO_DYNAMIC in bundled lib.py ===         4 ✓
   (table def + 3 grep hits in helpers/tests)
=== mark_dynamics rule in bundled llm_prompt.py ===    1 ✓
=== versions ===
version = "0.3.8"  ✓
"version": "0.2.37" ✓
```

All 4 expected substrings present in the bundled zip.

## §7 Commits + tags + release

- `forge@a285a3e` — `with_velocity(mark_dynamics)` + tests.
- `forge-music@e29cdd0` — Murmuration retrofit + forge.toml v0.3.8 + **tag v0.3.8 pushed**.
- `forge-client-obsidian@936e7bf` — bundle mirrors + manifest v0.2.37 + INSTALL.md + **tag v0.2.37 pushed**.
- GH Release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.37>

## §8 User-side smoke checklist (deferred)

1. Install plugin v0.2.37 via `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm `Installed forge-client-obsidian v0.2.37`.
2. Delete `~/forge-vaults/test1/forge-music/` (recurring re-extract pain — still pending).
3. Cmd-Q + reopen Obsidian.
4. Forge-click `forge-music/percussion/murmuration.md`. Verify Verovio renders the score WITH visible dynamic markings: `pp` at the Solitary section opening, hairpins for crescendo/decrescendo, `ff` (or `accent`-mapped mark) at the Murmuration peak.
5. MIDI playback should sound identical to v0.2.36 — this is a visual-only addition; velocity values unchanged.
6. Download MusicXML, open in MuseScore — confirm Italian dynamic abbreviations render below/above the staff per percussion-engraving convention.
7. Open `forge-music/percussion/loom.md` — Forge-click, verify NO dynamic markings (Loom remains intentionally dynamic-free per Reich convention).

## §9 Surprises / deviations

### Hairpin spanner insertion path

music21's `dynamics.Crescendo()` / `dynamics.Diminuendo()` are `Spanner` subclasses. Spanners need two things:
1. `.addSpannedElements([list_of_notes])` — to identify what the hairpin connects to.
2. Insertion into a containing stream so MusicXML serialization picks them up.

For (2), I insert the hairpin at `non_rest_notes[0].activeSite` at offset = `non_rest_notes[0].offset`. This places the hairpin in the same Measure as the first note. music21's MusicXML exporter then emits the `<wedge type="crescendo">` / `<wedge type="diminuendo">` elements at the right positions.

**One nuance**: if first and last notes are in DIFFERENT Measures (which happens for sections spanning multiple bars), the hairpin still spans correctly because Spanner's `getSpannedElements()` tracks notes by reference, not by offset within a single Measure. The MusicXML serializer handles cross-measure spanners natively.

### Refactoring with_velocity for cleaner spanner addressing

Pre-refactor, the function walked notes inline. Post-refactor it pre-collects `non_rest_notes = [n for n in notes if not isinstance(n, note.Rest)]` first. This makes:
- The int branch: 2 lines (set velocity + maybe one dynamic mark).
- The list branch: 1 loop (set velocity per cyclic index).
- The named-profile branch: 1 loop (set velocity per profile fn) + tail to address spanner endpoints by `[0]` and `[-1]`.

Behavior-preserving for the existing 12 tests (still pass); cleaner for the new 11.

### activeSite=None case

A bare `note.Note(...)` constructor produces a note with `activeSite=None`. The test `test_with_velocity_active_site_none_skips_insertion` verifies the helper doesn't raise in this case — it silently skips the dynamic insertion. Velocity values are still set (those don't depend on a containing stream).

This is documented in the docstring: "call with_velocity AFTER adding notes to their measures for marks to land." Murmuration's `make_section_measures` adds notes to measures BEFORE calling `with_velocity`, so the marks land correctly there. The Loom snippets don't call `with_velocity` at all (Reich convention), so the question is moot for them.

### No deviations from prompt's §Don'ts

- ✓ Did not retrofit Loom.
- ✓ Did not add per-note accent helpers.
- ✓ Did not add a separate `with_dynamics()` helper.
- ✓ Did not modify velocity values themselves (mark_dynamics is purely additive).
- ✓ Did not modify Murmuration's velocity profile choices.
- ✓ Did not touch blues/ or non-percussion content.
- ✓ Did not touch the constitution.

## §Follow-ups noted but not built

**From this drain:**

1. **Optional polish for `'human'` / `'ghost'` / `'accent'`**: these profiles currently get ONE nominal mark even though their velocity jitter could span 2-3 dynamic bands. A future variant could insert a band-RANGE mark (e.g., "mp-mf" for human) or skip the insertion (since the profile's intent is jitter around a center). Not blocking; current shape is clean and matches engraving convention (one mark per section).

2. **Hairpin `placement` attribute**: music21's Crescendo/Diminuendo don't expose a `placement` (above/below staff) attribute by default. MuseScore renders hairpins below the staff for instrumental parts and above for vocal — this is a renderer concern. If percussion-specific placement matters, future drain explores `hairpin.placement = 'above'` per percussion-engraving convention.

3. **List-pattern skip is documented but not visibly user-facing**: if a user calls `with_velocity(notes, [100, 60, ...], mark_dynamics=True)` expecting dynamics, they get none silently. Could emit a `warnings.warn(...)` instead. Not in this drain's scope; could be considered.

**Standing items (unchanged):**

1. Auto re-extract on `forge.toml` change — STILL the oldest pending; 11+ drains.
2. `DOMAIN_AVAILABILITY` fail-loud registry.
3. Closed-beta micropip rider.
4. Vault content sync generalization.
5. Scope-filter triplication.
6. HTTP fallback collapse for v0.2.6-era endpoints.
7. Engine-import allowlist audit.
8. `forge.installer` exclusion grep.

Plus from earlier feedback files:
- Migrate Murmuration / drums_shuffle to `kick()` / `snare()` factories.
- music21 MusicXML `<midi-unpitched>` off-by-one.
- `snapshot_capture: false` formalization in constitution (from Loom drain).

## §Protocol comments

1. **The "additive helper extension" pattern is clean for backward-compat changes.** Default-False kwarg + opt-in retrofit on the one piece that wants it. Zero risk to existing snippets (loom, phase_cell, phase_shifter, drums_shuffle, blues vault content) — they all continue calling `with_velocity` without the flag and get unchanged behavior.

2. **Music21's Spanner API is finicky but workable.** Pattern: `instance = Spanner(); instance.addSpannedElements([first, last]); stream.insert(first.offset, instance)`. Worth noting for future articulation-helper drains that might use Slur, Crescendo, etc.

3. **Pre-collecting non_rest_notes for cleaner indexing.** Refactor preserved behavior; enabled `[0]` / `[-1]` indexing for spanner endpoints. Recurring shape — any helper that needs to "mark the first/last meaningful element" benefits from this preprocessing.

4. **The `mark_dynamics=False` default respecting Reich is a deliberate aesthetic call**, not just back-compat. Codifying "some pieces intentionally omit conventions" via opt-in flags is the right shape. Forge-music cowork's design choice; forge-core didn't need to weigh in.

5. **No version conflict** — prompt used `{CURRENT} → {NEXT_PATCH}` placeholders; CC read current=0.2.36 (Loom drain), bumped to 0.2.37. Same pattern as Loom; convention working.

## §11 Constitutional alignment

**Level 1 — silent approve.** Pure helper extension (additive kwarg) + content retrofit. No new architectural concept; no engine semantic change; no new authoring pattern.

The "MIDI-only properties have visible-score counterparts" pattern (item 2 in the prompt's §"For forge-core second-pass review") is worth a future docs section in `forge/docs/specs/music-domain.md` if it recurs with articulation marks or similar additions — but that's docs polish, not clause-worthy. Forge-core's call if/when other lib helpers grow `mark_*` flags.
