<!-- author: forge-music-cowork
     second-pass review: not requested — pure content/composition work
     focus: blues song drum integration with per-chorus dynamic + articulation profiles
     PREVIEW MODE: no commit, no push, no tag, no release; revert via git restore -->

# Blues song — add a profiled drum part to `song.md` (PREVIEW; no commit, no push)

## CRITICAL: Preview-only mode — no git side effects

**This prompt is a preview/spike, NOT a release.** The user wants to evaluate the artistic outcome before committing to it. CC's git discipline for this prompt:

- **DO NOT `git commit`** anything in any repo.
- **DO NOT `git push`** anything.
- **DO NOT tag** anything.
- **DO NOT bundle into the plugin** (no `sync-engine-bundle`, no `sync-bundles`, no engine bundle copy, no vault bundle copy).
- **DO NOT bump versions** anywhere (`forge.toml`, `manifest.json`, `INSTALL.md` all stay put).
- **DO NOT build a release zip.**
- **DO NOT create a GH Release.**

The deliverable is **uncommitted file changes** in `/Users/odedfuhrmann/projects/forge-music/` (and one new test file in `/Users/odedfuhrmann/projects/forge/tests/music/`). The user's revert path on bad outcome is one command per repo: `git restore .` (plus removing any new untracked files).

If you've ever set git auto-commit hooks in past sessions, **disable them for this prompt**. CC's behavior must be reversible-by-`git restore` end-to-end.

## Scope

Add a drum part to the blues song with three differentiated dynamic + articulation profiles, applied per chorus to give the 4-chorus arc audible/visible variety. Reuse the v0.3.8 `mark_dynamics=True` flag so the score shows the dynamic shape, not just the MIDI.

Specifically:

1. **New snippet** `/Users/odedfuhrmann/projects/forge-music/blues/drum_chorus.md` — function-style snippet (same pattern as Loom's `phase_shifter.md`) that takes a `profile` string argument and returns a 12-bar Score (matching `chorus.md`'s 12-bar shape) with kick + snare + hi-hat (or ride) parts. Profiles: `'sparse'`, `'standard'`, `'driving'`.

2. **Modified snippet** `/Users/odedfuhrmann/projects/forge-music/blues/song.md` — overlay `drum_chorus` onto each of the 4 sections via `voices(...)`, picking a profile per section to shape the song's arc.

3. **New test file** `/Users/odedfuhrmann/projects/forge/tests/music/test_blues_drums.py` — content-invariants tests for the new drum_chorus shape + the song's drum integration.

`drums_shuffle.md` (the v0.3.5 spike) is NOT touched — it stays as a standalone reference. The new `drum_chorus.md` supersedes it for actual song use but doesn't replace the file.

## Why

User ask (verbatim): *"For now, maybe try to add a drum part to the blues song, along with articulation of speed, volume etc. Let's make it a bit more interesting. If result not promising, let's fall back to existing song, so ask not to push yet so we can easily undo."*

The current `song.md` (4 choruses, no drums) is musically thin — vocals + guitar + harmonic frame but no rhythmic propulsion. A blues without drums sounds like a rehearsal demo, not a song. Adding drums with per-section variety (quieter intro, building middle, driving solo, settled return) gives the song a real arc.

The per-chorus profile mechanism showcases the function-snippet composition pattern from Loom in a new domain (not just Reich-style minimalism). The `mark_dynamics=True` integration showcases the v0.3.8 helper extension in a real song context.

Preview mode lets the user listen before committing. Revert is one command.

## Files to modify / create

All paths absolute.

**Create:**
- `/Users/odedfuhrmann/projects/forge-music/blues/drum_chorus.md` — NEW
- `/Users/odedfuhrmann/projects/forge/tests/music/test_blues_drums.py` — NEW

**Modify:**
- `/Users/odedfuhrmann/projects/forge-music/blues/song.md` — modified

**Explicitly NOT modified:**
- `forge-music/blues/chorus.md`, `solo_chorus.md`, `drums_shuffle.md`, `form.md`, `vocal_phrase_a.md`, `vocal_phrase_b.md`, `guitar_solo_chorus.md`, `twelve_bar_blues_progression.md`
- `forge-music/forge.toml` (no version bump in preview)
- `forge-music/percussion/*` (this is blues-side work)
- `forge-client-obsidian/*` (no plugin bundle, no manifest, no INSTALL.md)
- `forge/forge/music/lib.py` (helpers already sufficient — kick/snare/closed_hihat/ride_cymbal/crash_cymbal + with_velocity all exist as of v0.3.8)
- `forge/forge/music/llm_prompt.py` (no new authoring rule needed)
- `forge/forge/core/executor.py` (no engine changes)
- The constitution

## Implementation notes

### `drum_chorus.md` — function-style snippet

Frontmatter:
```yaml
---
type: action
description: drum_chorus
inputs: []
snapshot_capture: false
---
```

Note: `snapshot_capture: false` because the returned Score contains music21 Instrument instances with bound method references (`autoAssignMidiChannel` lambda from `_force_perc_channel`), which the wire-format serializer can't capture. Same pattern as Loom's `phase_cell.md`.

English facet: a paragraph explaining that this snippet returns one 12-bar drum chorus parameterized by a profile name; describe the three profiles (sparse/standard/driving), what they include (instruments, articulation, velocity level), and how they're chosen by the caller (`song.md` picks per chorus to shape the song's dynamic arc). Mention that 12/8 timing matches the rest of the blues vault.

Python facet — signature:
```python
def compute(context, profile='standard'):
    """
    Return a 12-bar drum Score for one blues chorus, with timing + 
    articulation + dynamics matching the named profile.

    profile: 'sparse' | 'standard' | 'driving'

    - 'sparse':   kick on beats 1, 3; snare on beats 2, 4 with ghost
                  note on the and-of-3 each bar; closed hi-hat on beats
                  1, 3 only. Base velocity 'human'-ish around 60 (mp 
                  band); ghost notes at 'ghost' velocity (~35, pp).
                  No crash. Quietest profile — intro / settling feel.

    - 'standard': kick on beats 1, 3; snare on beats 2, 4 with one
                  ghost on and-of-4 each bar; closed hi-hat on all 4
                  beats. 'human' velocity (~75, mf). No crash.
                  Mid-density — typical chorus feel.

    - 'driving':  kick on all 4 beats; snare on 2, 4 with no ghosts
                  but ACCENT velocity (~110, ff) on backbeat; ride
                  cymbal on all 4 beats (instead of closed hi-hat);
                  crash cymbal on bar 1, beat 1. Loudest, fullest —
                  solo-supporting feel.

    Returns: music21.stream.Score with stacked Parts per drum voice.
    """
```

Implementation hints (CC adapts):

- Time signature: `meter.TimeSignature('12/8')`, `bar_ql = 6.0`, dotted-quarter beat = `1.5` quarters, eighth = `0.5`.
- 12/8 beat positions in quarter units: beat 1 = 0.0, beat 2 = 1.5, beat 3 = 3.0, beat 4 = 4.5. And-of-N = beat_N + 0.5 (one eighth after). The dotted-quarter beats land on eighth-units `[0, 3, 6, 9]` in the 12-eighth bar.
- Use the v0.2.35/v0.3.8 instrument factories: `kick()`, `snare()`, `closed_hihat()`, `ride_cymbal()`, `crash_cymbal()`. Do NOT use raw `instrument.BassDrum()` etc. — the factories include `_force_perc_channel` which fixes MuseScore rendering.
- Build each drum part via a `make_drum_part(inst_factory, hit_specs_per_bar)` helper. `hit_specs_per_bar` is a list of 12 (one per bar) where each entry is a list of `(offset_quarters, duration_quarters, velocity_role)` tuples. velocity_role is 'normal' or 'ghost' so the post-pass `with_velocity` knows which list to apply which profile to.
- After building all measures, apply velocity profiles:
  - **'sparse'**: `with_velocity(normal_notes_across_part, 60, mark_dynamics=True)` (mp mark on first bar of each part) and `with_velocity(ghost_notes, 'ghost')` (no dynamic mark — ghost is per-note articulation).
  - **'standard'**: `with_velocity(normal_notes_across_part, 'human', mark_dynamics=True)` (mf mark) + `with_velocity(ghost_notes, 'ghost')`.
  - **'driving'**: `with_velocity(normal_notes, 'human', mark_dynamics=True)` (mf for kick + ride base) + `with_velocity(snare_backbeat_notes, 'accent')` (ff for the snare 2-4 backbeat — gives the driving feel) — no separate dynamic mark for the per-note accent since `accent` is already an articulation. Crash bar-1 note at velocity 100.
- The dynamic mark insertion only needs to happen on ONE part's first note per profile (otherwise you get N copies of the mark across N drum parts). Pick the kick part as the "anchor" for the section's dynamic mark.
- Return: `voices(*parts)` to get a stacked Score. (`voices` from forge.music.lib already handles part-stacking correctly.)

### `song.md` — modified

Replace the existing `compute` body with one that overlays `drum_chorus` per section. Suggested shape:

```python
def compute(context):
    # Section profiles shape the song's drum arc:
    # intro (sparse) → fuller chorus (standard) → solo (driving) → return (standard).
    chorus1_drums = context.compute("drum_chorus", profile='sparse')
    chorus2_drums = context.compute("drum_chorus", profile='standard')
    solo_drums    = context.compute("drum_chorus", profile='driving')
    chorus3_drums = context.compute("drum_chorus", profile='standard')

    chorus1 = voices(context.compute("chorus"), chorus1_drums)
    chorus2 = voices(context.compute("chorus"), chorus2_drums)
    solo    = voices(context.compute("solo_chorus"), solo_drums)
    chorus3 = voices(context.compute("chorus"), chorus3_drums)

    return sequence(chorus1, chorus2, solo, chorus3)
```

English facet update: extend the existing description to mention the drum arc — sparse intro chorus, fuller mid chorus, driving solo chorus, settled return chorus. Keep the existing sentences about tempo/key inheritance intact. Add: *"Drums shape the song's arc: a sparse profile (`mp`, ghost-note snares, kick+snare+sparse hi-hat) introduces the lyric; standard (`mf`, full kick+snare+hi-hat) carries the mid choruses; driving (`f`, full kit with ride cymbal, accented backbeat, opening crash) supports the solo. Each chorus's drum profile is chosen by [[song]]; the drum logic lives in [[drum_chorus]]."*

Update the Dependencies section at the bottom of `song.md` to add `[[drum_chorus]]` alongside `[[chorus]]` and `[[solo_chorus]]`.

### `test_blues_drums.py` — content invariants

Tests run via the existing `run_music_block` fixture (per `tests/music/conftest.py`). Required cases:

1. `test_drum_chorus_default_profile_returns_12_bar_score` — call without args (defaults to 'standard'), assert returned Score has multiple parts, each with 12 measures in 12/8.
2. `test_drum_chorus_sparse_profile_has_fewer_hits_than_driving` — count total non-rest notes across all parts for profile='sparse' vs profile='driving'; assert sparse < driving.
3. `test_drum_chorus_driving_profile_includes_crash_on_bar_1` — assert a crash cymbal instrument is present in the parts AND has a note in bar 1.
4. `test_drum_chorus_sparse_profile_omits_crash` — assert no crash cymbal part exists for 'sparse'.
5. `test_drum_chorus_standard_profile_has_hihat_on_all_4_beats` — find the hi-hat part for 'standard', verify bar 1 has 4 notes at offsets 0.0, 1.5, 3.0, 4.5 quarters.
6. `test_drum_chorus_inserts_section_dynamic_mark` — call with `profile='sparse'`, assert the returned Score's parts contain at least one `dynamics.Dynamic` with mark `'mp'`. (Validates the mark_dynamics=True integration.)
7. `test_song_now_includes_drum_parts_per_section` — call `song`, assert returned Score has parts that include drum instruments (BassDrum, SnareDrum, HiHatCymbal/RideCymbals). Total measure count = 48 bars (4 choruses × 12).

### Run tests

- `cd /Users/odedfuhrmann/projects/forge && pytest -q tests/music/test_blues_drums.py -v` — report all 7 cases. Also run the full music suite: `pytest -q tests/music/ -v` to confirm no regressions on existing tests.
- Full suite: `cd /Users/odedfuhrmann/projects/forge && pytest -q` — report `X passed in Y ms`.
- Do NOT run `npm test` in the plugin — there's no plugin change in this prompt and we want to skip any TypeScript-side rebuilds.
- Do NOT run `npm run sync-engine-bundle` — explicitly off-script per "no bundle" rule.

## Preview / smoke instructions for the user (deferred — DO NOT script these)

The user runs these manually after CC delivers. Two preview paths; CC's feedback should mention BOTH so the user picks what works for their setup:

### Preview path A — open source vault directly (simplest if user is set up for it)

1. In Obsidian: `File → Open vault → Open folder as vault → /Users/odedfuhrmann/projects/forge-music`
2. In that vault, open `blues/song.md`.
3. Cmd-P → `Forge: Compute` on `song.md`.
4. Wait for Verovio render + html-midi-player widget.
5. Click play. Listen to the 4-chorus arc with drums shaping the dynamics.

### Preview path B — copy files into existing test vault (works regardless of plugin version)

1. Copy the modified + new files into the user's test vault's blues/ directory:
   ```
   cp /Users/odedfuhrmann/projects/forge-music/blues/song.md ~/forge-vaults/test1/forge-music/blues/song.md
   cp /Users/odedfuhrmann/projects/forge-music/blues/drum_chorus.md ~/forge-vaults/test1/forge-music/blues/drum_chorus.md
   ```
2. Refresh Obsidian's file list (Cmd-P → `Reload app without saving` or just close and reopen the file).
3. Open `forge-music/blues/song.md` in the test vault.
4. Cmd-P → `Forge: Compute`.
5. Listen.

### What to listen for

- **Chorus 1 (sparse)**: quieter, ghost-note snares prominent in the gaps, sparse hi-hat. Should feel like an introduction.
- **Chorus 2 (standard)**: fuller, hi-hat on all 4 beats. Vocal sits over a steady groove.
- **Solo chorus (driving)**: ride cymbal instead of hi-hat (different timbre — should sound like the energy lifts), accented snare backbeat, crash at bar 1. The solo should feel pushed forward by the drums.
- **Chorus 3 (standard)**: returns to the standard feel — a coming-home. Same energy as chorus 2.
- **Score (Verovio + MuseScore)**: dynamic marks visible per chorus (mp at start, mf for mid choruses, f for solo). Drum staves use percussion notation (single-line for kick/snare; 5-line for ride/crash depending on music21 default).

### Revert path if outcome isn't good

```
cd /Users/odedfuhrmann/projects/forge-music && git status   # confirm what changed
cd /Users/odedfuhrmann/projects/forge-music && git restore blues/song.md
cd /Users/odedfuhrmann/projects/forge-music && rm blues/drum_chorus.md
cd /Users/odedfuhrmann/projects/forge && git restore tests/music/test_blues_drums.py 2>/dev/null || rm tests/music/test_blues_drums.py
```

If smoke path B was used, also revert the test-vault copies:
```
rm ~/forge-vaults/test1/forge-music/blues/drum_chorus.md
# song.md in test vault was an extracted copy from bundled v0.2.37; re-extract
# by Cmd-Q Obsidian, rm -rf ~/forge-vaults/test1/forge-music, reopen.
```

## Out of scope

- DO NOT commit. DO NOT push. DO NOT tag. DO NOT release.
- DO NOT bundle into the plugin (`npm run sync-engine-bundle` etc. — all off).
- DO NOT bump any version.
- DO NOT modify `chorus.md`, `solo_chorus.md`, `drums_shuffle.md`, or any other existing blues snippet beyond `song.md`.
- DO NOT touch percussion/ vault content.
- DO NOT extend `with_velocity` or any other lib helper.
- DO NOT add tempo changes / ritardando / accelerando in this prompt. "Speed articulation" the user mentioned is interpreted here as per-note articulation (ghost notes, accents) and per-section dynamic shifts, NOT tempo manipulation. If the user wants tempo changes after listening, that's a follow-up.
- DO NOT add new constitution clauses or propose constitution amendments.
- DO NOT modify the existing 12-bar 12/8 / 70-BPM character of the blues — drums fit into the existing frame.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-02-2315-blues-song-drum-part-preview.md`:

0. **Preview-mode confirmation.** Explicit `git status` output in both `forge-music/` and `forge/` showing the un-staged, un-committed changes. Confirm NO commits, NO tags, NO pushes were made, NO plugin bundle was touched, NO version was bumped, NO release was built.
1. **Files created.** Absolute paths + line counts.
2. **Files modified.** Diff of `song.md` (the only modified existing file).
3. **Tests.** Pass/fail of all 7 new cases + the full `tests/music/` suite count.
4. **Preview instructions.** Reproduce paths A and B from above + the "what to listen for" + the revert path.
5. **Surprises / deviations.** Anything that diverged from the design — especially in profile boundaries (e.g., if 'sparse'/'standard'/'driving' don't differentiate audibly enough, you may have tuned values).
6. **Confidence in the artistic outcome.** CC's own listening-impression hypothesis based on the test data (e.g., "ghost-note density in 'sparse' should be audibly distinct from 'standard' because X"). The user is the final judge; this is just CC's prediction.

## Don'ts

- Don't sneak in version bumps anywhere "for tidiness." Preview mode = source unchanged at version metadata.
- Don't run `git add` or `git commit` even in passing. Changes stay in working-tree state for one-command revert.
- Don't propose follow-ups that involve commits/pushes — those happen only when the user signals "promote this from preview to release."
- Don't add dynamic markings to the SOLO chorus that conflict with the existing guitar solo line's own intended dynamics (if guitar_solo_chorus has its own velocity logic, drum dynamics shouldn't clash). If unsure, read `guitar_solo_chorus.md`'s velocity treatment and align.
- Don't use raw `instrument.BassDrum()` / `instrument.SnareDrum()` / `instrument.HiHatCymbal()`. Use the v0.2.35 factories (`kick()`, `snare()`, `closed_hihat()`, `ride_cymbal()`, `crash_cymbal()`) — they include the `_force_perc_channel` fix without which MuseScore renders parts after the first as Piano staves.
- Don't make `drum_chorus`'s English facet promise dynamics that the actual profile values don't produce (the "pp at edges" Murmuration mismatch is the cautionary tale — describe what the implementation actually does).
- Don't write more than ~80 lines of Python in `drum_chorus.md`. If it's getting longer, lift shared logic into the existing `lib.py` helpers (wait — that's a lib change which IS in scope for a real release but NOT for this preview). For preview, keep all logic inline in the snippet.
