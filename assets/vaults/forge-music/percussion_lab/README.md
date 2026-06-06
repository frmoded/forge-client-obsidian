# percussion_lab — the section vocabulary lab

This subdirectory holds the **percussion vocabulary** that Forge pieces compose from. Each `*.md` here is a named, parameterized building block — a 4-bar pattern with a defined artistic identity, dynamic profile, and instrumentation. The first piece composed from these blocks is `percussion/murmuration.md`; sister pieces (Phase 4+) will use the same blocks in different orders.

## The section-snippet pattern

Each section snippet:

- Is an `action` snippet whose `compute(context, bars=4)` returns a `music21.stream.Score` with **only the instrument parts that actually play in this section** (no all-rest staves — `voices()` and `sequence()` handle inactive-section padding when sections are concatenated).
- Has an **opinionated musical identity** (the "what does this section EVOKE" line in its English facet's first paragraph).
- Uses the v0.2.35 percussion factories (`kick()`, `snare()`, `closed_hihat()`, `open_hihat()`, `low_tom()`, `mid_tom()`, `crash_cymbal()`) — never raw `instrument.BassDrum()` / `instrument.SnareDrum()` — so MuseScore renders multi-percussion-part scores correctly.
- Carries `snapshot_capture: false` in frontmatter (Scores hold music21 Instrument instances with bound `_force_perc_channel` lambdas; the wire-format snapshot can't serialize them).
- Anchors its dynamic mark on the kick part's first note (`with_velocity(kick_notes[:1], PROFILE, mark_dynamics=True)`) so MuseScore shows one Italian abbreviation per section per piece — not one per drum staff.

## The `bars` parameter

All section snippets take `bars` (default 4):

- `bars=4` — the canonical 4-bar pattern.
- `bars=N` where `N > 4` — cycle the 4-bar pattern (`pattern[i % 4]` for each output bar).
- `bars=N` where `0 < N < 4` — take the first N bars.
- `bars=0` — empty Score (edge case for orchestrators that conditionally include sections).

The dynamic mark stays on the first kick note regardless of `bars` (one mark per section, always).

## Adding a new section

1. Author `percussion_lab/<name>.md` following the template from any existing section (e.g. `solitary.md` for kick-only, `swarming.md` for the multi-instrument shape).
2. Pick instruments from the lib's percussion factories. Snare-and-snare across sections, kick-and-kick across sections, etc. group into shared staves via `voices()`/`sequence()`.
3. Set the velocity profile (integer `mp`/`mf`/`f`/`ff` band per v0.3.8 boundaries, or a named profile like `'human'`, `'accent'`, `'decrescendo'`).
4. Document the section's artistic identity in one paragraph; mechanical contents in another.

## Conjecture, not canon

These 8 sections are conjectures derived from Murmuration's arc. Sister pieces in Phase 4+ will refute or corroborate the vocabulary by composing new pieces with the same building blocks. Names and patterns may shift as more pieces inform the abstraction.
