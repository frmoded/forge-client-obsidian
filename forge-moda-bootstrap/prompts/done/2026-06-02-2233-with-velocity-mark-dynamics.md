<!-- author: forge-music-cowork
     second-pass review: optional — engine-API addition, no new architectural pattern
     focus: lib.py helper extension + Murmuration retrofit -->

# `with_velocity(mark_dynamics=True)` — surface MIDI velocity arcs as visible score dynamics

## Scope

Extend `forge.music.lib.with_velocity()` to accept an optional `mark_dynamics: bool = False` keyword argument. When `True`, the helper additionally inserts `music21.dynamics.Dynamic` markings (and hairpin spanners for `crescendo`/`decrescendo` profiles) into the notes' parent stream, so the dynamic arc shows in the visual score (Verovio + MusicXML → MuseScore) instead of only being heard via MIDI velocity.

Retrofit `forge-music/percussion/murmuration.md` to use `mark_dynamics=True` on every `with_velocity(...)` call, since Murmuration's dynamic arc is load-bearing for the artistic concept and is currently invisible in the printed score.

**Do NOT retrofit `forge-music/percussion/loom.md`.** Reich's "Clapping Music" precedent: phase music's dynamics are intentionally absent — the math IS the piece. Adding marks would clutter the score and confuse the aesthetic.

## Why

User question that prompted this: *"velocity carries the dynamic story: quiet at the edges, loud at the peak — is this expressed in the score or just in the midi?"* Answer right now: just MIDI. A composer reading Murmuration's MusicXML in MuseScore sees uniform notes with no dynamic story — they'd only discover the arc on playback.

Western music convention (classical / film / big band) puts dynamics in the SCORE — that's the contract between composer and performer/engineer. Italian markings (`pp` / `mp` / `mf` / `f` / `ff`), hairpins (`<` / `>`), and per-note accents (`>` / `^` / `sfz`) all live below/above the staff. English prose ("with intensity", "ghostly") is supplemental. Composers don't hand the engineer a separate memo for dynamics — they encode in the score.

Forge currently does half the convention (MIDI velocity, hearable) without the other half (visible markings, readable). This prompt closes that gap.

The opt-in design (`mark_dynamics=False` by default) preserves backward compatibility AND respects pieces like Loom that intentionally have no dynamics.

## Files to modify

All paths absolute.

- `/Users/odedfuhrmann/projects/forge/forge/music/lib.py` — extend `with_velocity` signature + add velocity→dynamic-band mapping helper + insertion logic.
- `/Users/odedfuhrmann/projects/forge/forge/music/llm_prompt.py` — add a rule documenting `mark_dynamics=True` and when to use it.
- `/Users/odedfuhrmann/projects/forge/tests/music/test_lib.py` — add test cases for the new flag (see Tests section).
- `/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md` — retrofit every `with_velocity(...)` call to add `mark_dynamics=True`. The English facet may add a short note like "Dynamics: marked in score via `with_velocity(mark_dynamics=True)`."
- `/Users/odedfuhrmann/projects/forge-music/forge.toml` — bump `version = "0.3.7"` → `version = "0.3.8"`.
- `/Users/odedfuhrmann/projects/forge-client-obsidian/manifest.json` — bump version `{CURRENT} → {NEXT_PATCH}` (read at drain start; sub at drain; log both in §0).

NOT to modify:
- `/Users/odedfuhrmann/projects/forge-music/percussion/loom.md` — intentionally dynamic-free (Reich convention).
- `/Users/odedfuhrmann/projects/forge-music/percussion/phase_cell.md`, `phase_shifter.md` — same.
- `/Users/odedfuhrmann/projects/forge/forge/core/executor.py` — engine semantics unchanged.
- Constitution — forge-core territory; if this surfaces a clause-worthy pattern, that's a separate effort.

## Implementation notes

### Velocity → dynamic-band mapping (single source of truth)

Add a private mapping in `lib.py`:

```python
# Standard MIDI velocity → Italian dynamic marking. Boundaries chosen to
# match typical music-engraving convention (mf is the "neutral" center
# around 73-85; band widths roughly equal in the working range).
_VELOCITY_TO_DYNAMIC = [
    # (max_velocity_inclusive, dynamic_string)
    (30,  'ppp'),
    (45,  'pp'),
    (60,  'p'),
    (72,  'mp'),
    (85,  'mf'),
    (100, 'f'),
    (115, 'ff'),
    (127, 'fff'),
]

def _velocity_to_dynamic_mark(velocity):
    """Map a MIDI velocity (1-127) to its Italian dynamic abbreviation."""
    for max_v, mark in _VELOCITY_TO_DYNAMIC:
        if velocity <= max_v:
            return mark
    return 'fff'  # safety; shouldn't reach for clamped values
```

### Insertion strategy per pattern type

When `mark_dynamics=True`, after setting velocities, insert markings into the notes' parent stream (`note.activeSite`):

- **`int` pattern**: insert ONE `dynamics.Dynamic(_velocity_to_dynamic_mark(velocity))` at the first note's position in `note.activeSite`. (Uniform velocity → single mark.)
- **`'human'`, `'ghost'`, `'accent'` named profiles**: same — insert ONE Dynamic at the first note. Use the profile's nominal center (75, 35, 110 → mf, pp, ff respectively) — don't bother mapping the actual per-note jitter, the visible mark represents the section's overall dynamic.
- **`'crescendo'` profile**: insert a `dynamics.Crescendo()` spanner from the first note to the last note. Optionally also a starting Dynamic (e.g., `p`) and ending Dynamic (e.g., `f`) for clarity. (Music21's Crescendo() is a Spanner; add via `note.activeSite.insert(...)` plus `.addSpannedElements([first, last])`.)
- **`'decrescendo'` profile**: same with `dynamics.Diminuendo()`. Optional starting `f` and ending `p`.
- **`list` pattern** (cyclic, e.g. `[100, 60, 80, 60]`): SKIP dynamic insertion. Per-note alternation is too granular to mark without cluttering; users wanting visible alternation can use accent marks via a future per-note articulation helper. Document this in the docstring.

### `activeSite` gating

If a note's `activeSite` is `None` (not yet added to any stream), skip dynamic insertion for that note silently. The `with_velocity` helper is sometimes called on a bare list of notes before they're added to a stream; in that case the caller is responsible for ordering (call after notes are in measures). Document this in the docstring.

For the cases that DO have `activeSite` (the vast majority — including Murmuration's `make_section_measures` flow), the insertion goes into the Measure at the note's offset within the Measure.

### Signature update

```python
def with_velocity(notes, pattern, mark_dynamics=False):
    """Apply velocity values to a sequence of Note objects per a pattern.

    Mutates each note's `.volume.velocity` in place. When mark_dynamics is
    True, also inserts visible dynamic markings into the notes' parent
    stream (and hairpin spanners for crescendo/decrescendo profiles) so
    the dynamic arc shows in the printed score, not just MIDI playback.

    [... existing docstring content ...]

    mark_dynamics: When True, insert visible score dynamics in addition
                   to setting MIDI velocity. Default False (back-compat
                   and respects pieces where dynamics are intentionally
                   absent, e.g. Reich-style phase music).

                   - int and named-profile patterns insert ONE Dynamic
                     at the first note (the section's overall level).
                   - 'crescendo'/'decrescendo' insert a hairpin spanner
                     across the notes plus bracketing Dynamics.
                   - list patterns SKIP dynamic insertion (too granular
                     to mark cleanly; use future articulation helpers
                     for per-note marks).

                   Notes whose .activeSite is None are skipped — call
                   with_velocity AFTER adding notes to their measures
                   for marks to be inserted.
    """
```

### Murmuration retrofit

In `forge-music/percussion/murmuration.md`, find the `with_velocity(all_notes, profile)` call inside `make_section_measures` (around line 92). Change to `with_velocity(all_notes, profile, mark_dynamics=True)`. That's the only call site that needs updating.

The English facet may add a short note (one sentence in the existing dynamics paragraph) — something like: *"The dynamic arc is now marked in the score itself (`pp` at edges, `ff` at the Murmuration peak, hairpins on Crescendo/Decrescendo sections) — visible in MuseScore, not just heard in MIDI."*

### `llm_prompt.py` rule addition

Add ONE rule to `MUSIC_PROMPT_FRAGMENT` documenting the flag. Suggested text (CC may refine to fit existing rule style):

> When a piece's dynamic arc is artistically load-bearing, call `with_velocity(notes, profile, mark_dynamics=True)` so the dynamic markings appear visibly in the printed score (MuseScore via MusicXML), not just in MIDI playback. The flag inserts `pp`/`p`/`mp`/`mf`/`f`/`ff` marks for named profiles and ints, and hairpin spanners (`<` / `>`) for `'crescendo'`/`'decrescendo'`. Default is `mark_dynamics=False` for back-compat and for pieces (e.g., Reich-style phase music) where dynamics are intentionally absent.

## Tests

### Auto-verifiable by CC (mandatory)

Add to `/Users/odedfuhrmann/projects/forge/tests/music/test_lib.py`. All tests construct a small Measure with notes, call `with_velocity(..., mark_dynamics=True)`, then assert on what dynamics objects were inserted into the Measure.

Required cases:

1. `test_with_velocity_no_dynamics_inserted_by_default` — call with `mark_dynamics=False` (default); assert measure contains zero `dynamics.Dynamic` and zero `dynamics.Crescendo`/`Diminuendo`.
2. `test_with_velocity_int_inserts_single_dynamic` — `with_velocity(notes, 80, mark_dynamics=True)` → exactly one Dynamic, mark string `'mf'`, at first note's offset.
3. `test_with_velocity_human_inserts_mf` — pattern `'human'` (nominal 75) → one Dynamic `'mf'`.
4. `test_with_velocity_ghost_inserts_pp` — pattern `'ghost'` (nominal 35) → one Dynamic `'pp'`.
5. `test_with_velocity_accent_inserts_ff` — pattern `'accent'` (nominal 110) → one Dynamic `'ff'`.
6. `test_with_velocity_crescendo_inserts_hairpin` — pattern `'crescendo'` over 8 notes → exactly one `dynamics.Crescendo` spanner connecting first and last note. Bracketing Dynamics `'p'` (start) and `'f'` (end) optional but if present must be in that order.
7. `test_with_velocity_decrescendo_inserts_diminuendo_hairpin` — symmetric to #6.
8. `test_with_velocity_list_pattern_skips_dynamics` — `with_velocity(notes, [100, 60, 80, 60], mark_dynamics=True)` → zero Dynamic/spanner objects. (List patterns are too granular to mark.)
9. `test_with_velocity_velocity_to_dynamic_mark_boundaries` — direct test of `_velocity_to_dynamic_mark` (or whatever internal name): velocity 1 → 'ppp', 30 → 'ppp', 31 → 'pp', 45 → 'pp', 46 → 'p', 72 → 'mp', 73 → 'mf', 85 → 'mf', 86 → 'f', 127 → 'fff'.
10. `test_with_velocity_active_site_none_skips_insertion` — notes not added to any stream; `with_velocity(notes, 80, mark_dynamics=True)` does not raise and inserts no dynamics (no stream to insert into).
11. `test_murmuration_score_contains_dynamic_markings` — content invariants test: build Murmuration via the engine, assert the returned Score (or any of its Parts) contains at least one `dynamics.Dynamic` object after retrofit. The pre-retrofit version would have zero; the post-retrofit version should have many.

Run the full suites:
- `cd /Users/odedfuhrmann/projects/forge && pytest -q` — report as `X/X in Y ms`.
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && npm test` — report as `X/X in Y ms`.

Engine bundle drift check:
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && npm run sync-engine-bundle` — expect a non-empty diff this time (lib.py and llm_prompt.py both changed). Verify the bundled `bundle/forge/music/lib.py` is byte-equal to the modified source after sync.

Release artifact preflight + clean-vault smoke (per protocol):
- Build release zip per existing script.
- Compute SHA256.
- Clean-vault smoke: fresh tmp dir, unzip release, verify `percussion/murmuration.md` is present AND its body contains the substring `mark_dynamics=True` (so the bundled vault has the retrofit, not the old version).

Cross-vault version log (§0):
- `forge-music/forge.toml`: 0.3.7 → 0.3.8 (within-vault, concrete).
- `forge-client-obsidian/manifest.json`: `{CURRENT} → {NEXT_PATCH}` — read at drain start, log both substituted values.

### Deferred to user (manual smoke)

DO NOT script or attempt these — leave them for the review answer:

1. Install plugin v{NEXT_PATCH}, force-re-extract forge-music vault, relaunch Obsidian.
2. Forge-click `forge-music/percussion/murmuration.md`.
3. Verify Verovio renders the score WITH visible dynamic markings (`pp` at section 1 Solitary, hairpins on Crescendo/Decrescendo, `ff` or `sfz` at section 5 Murmuration peak, `pp` at section 8 Resting).
4. MIDI playback should sound identical to before (this is a visual-only addition; velocity values unchanged).
5. Download MusicXML, open in MuseScore — confirm dynamic markings render in MuseScore as well (Italian abbreviations below/above staff per percussion-engraving convention).
6. Open `forge-music/percussion/loom.md` — Forge-click, verify NO dynamic markings appear (Loom remains intentionally dynamic-free).

## Out of scope

- DO NOT retrofit Loom (`loom.md`) to use `mark_dynamics=True`. Reich convention: phase music has no dynamics; the math is the piece.
- DO NOT add per-note accent marks (`>`, `^`, `sfz`) via this helper. Accent insertion is a future articulation helper, not in scope here.
- DO NOT add a separate `with_dynamics()` or `mark_dynamics()` public helper. One flag on the existing function keeps the API simple.
- DO NOT modify the velocity values themselves. `mark_dynamics=True` is additive — velocities still set per the pattern, dynamics inserted alongside.
- DO NOT modify Murmuration's velocity profile choices. Just add the flag to existing calls.
- DO NOT modify forge-music/blues/ or any non-percussion content (this is a percussion-led release; other domains can adopt the flag later).
- DO NOT touch the constitution. If forge-core later wants to recognize "dynamics-as-score-convention" as a B-series clause, that's their call.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-02-2233-with-velocity-mark-dynamics.md`:

0. **Versions used.** `{CURRENT} → {NEXT_PATCH}` both substituted values + forge-music 0.3.7 → 0.3.8 confirmation.
1. **lib.py changes.** Diff (or before/after blocks) for the signature + insertion logic + `_VELOCITY_TO_DYNAMIC` table.
2. **llm_prompt.py changes.** The new rule text.
3. **Murmuration retrofit.** Diff (1-2 line change expected) + the English-facet sentence if added.
4. **Tests.** All 11 cases — pass/fail, runtimes. Both `pytest -q` + `npm test` totals.
5. **Engine bundle drift.** Result of `sync-engine-bundle` (expected: lib.py + llm_prompt.py synced). Confirm byte-equal post-sync.
6. **Release artifact.** Path, SHA256, clean-vault smoke result (`mark_dynamics=True` present in bundled murmuration.md).
7. **Commit + tag + release.** Git log across forge / forge-music / forge-client-obsidian; tag names; GH Release URL.
8. **User-side smoke checklist.** Reproduce steps 1-6 from "Deferred to user" above, unchanged.
9. **Surprises / deviations.** Anything that diverged — especially in the spanner-insertion details (music21's Spanner API is finicky) or the activeSite gating behavior.

## Don'ts

- Don't insert dynamics for list patterns. They're explicitly out — document and test the skip behavior.
- Don't insert one Dynamic per note for human/ghost/accent profiles. ONE mark at the section start represents the section's level; per-note jitter is hearable but shouldn't be visible.
- Don't change the default of `mark_dynamics`. Default stays False for backward compat + Reich-style pieces.
- Don't sneak in articulation marks (`>`, `^`, `sfz`). Those are a separate helper, out of scope.
- Don't bump forge-music to 0.4.x or plugin to 0.3.x. Patch-level bumps only.
- Don't skip the engine-bundle drift verify step. lib.py changed, so the bundle MUST sync; missing this would ship a stale bundle (the v0.2.30-class footgun).
- Don't push the release without clean-vault smoke. `mark_dynamics=True` MUST be present in the bundled Murmuration body or the retrofit didn't land in the released artifact.

## For forge-core second-pass review (if user routes)

This prompt is largely a domain extension (music lib helper + content retrofit) with limited cross-cutting impact. Items forge-core might flag:

1. **No new constitution clauses needed** by my read — this extends an existing helper's behavior, doesn't introduce a new authoring pattern or engine semantic. Level 1 (silent approve) likely fits.
2. **Pattern worth noting**: "MIDI-only properties have visual-score counterparts; helpers should optionally surface both." If this pattern recurs (e.g., articulation marks alongside note properties, tempo markings alongside `MetronomeMark`), it might be worth a future docs section in `forge/docs/specs/music-domain.md` — but that's a docs polish, not a clause.
3. **The Reich-pure exception**: leaving Loom alone is deliberate; forge-core might want to recognize that "Forge respects pieces that intentionally omit conventions" as a meta-pattern, but that too is more docs than clause.
