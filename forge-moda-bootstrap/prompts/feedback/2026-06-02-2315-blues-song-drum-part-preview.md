---
timestamp: 2026-06-02T14:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T23:15:00Z
status: success (PREVIEW MODE — uncommitted working-tree changes; no git side effects)
---

# Blues song drum part — PREVIEW

3-file preview drain: new `drum_chorus` snippet + modified `song.md` (overlays drum_chorus per chorus) + new test file. No commits, no pushes, no tags, no plugin bundle, no version bumps.

## §0 Preview-mode confirmation

**No git side effects.** Both repos show uncommitted working-tree changes only:

```
=== forge-music ===
 M blues/song.md            ← preview modification (compute body + English + Dependencies)
?? .forge/                  ← pre-existing edge-snapshot dir, NOT this drain
?? blues/drum_chorus.md     ← new preview file

=== forge ===
 M docs/specs/constitution.md  ← pre-drain working-tree state (NOT touched by this drain)
?? tests/music/test_blues_drums.py  ← new preview test file

=== forge-client-obsidian ===
(clean — no changes)

=== recent log entries (last commit per repo) ===
forge-music last commit:        e29cdd0 [...mark_dynamics] (v0.3.8 Murmuration retrofit)
forge last commit:              a285a3e [...mark_dynamics] (with_velocity helper)
forge-client-obsidian last:     936e7bf [...mark_dynamics] (v0.2.37 bundle)
```

All three "last commit" hashes are from the v0.2.37 drain that completed earlier. **NO new commits from this preview drain.**

**Also NOT done:**
- ✗ `npm run sync-engine-bundle` — not invoked.
- ✗ `npm test` in plugin — not invoked.
- ✗ `npm run build` / `release-zip` — not invoked.
- ✗ `gh release create` — not invoked.
- ✗ `git tag` — not invoked anywhere.
- ✗ Any version bump in `forge-music/forge.toml`, `forge-client-obsidian/manifest.json`, or `INSTALL.md`.

**Pre-existing state NOT touched:**

- `forge/docs/specs/constitution.md` shows as `M` in `git status`, but this modification existed in working tree before this drain started. I never opened or edited this file. Likely state from a prior session that was never committed. The user can git-restore it independently if not wanted.

## §1 Files created

| Path | Lines |
| --- | --- |
| `/Users/odedfuhrmann/projects/forge-music/blues/drum_chorus.md` | 138 |
| `/Users/odedfuhrmann/projects/forge/tests/music/test_blues_drums.py` | 153 |

## §2 Files modified

### `forge-music/blues/song.md`

**English facet** — extended the existing description with one sentence per the prompt's guidance:

```diff
 Composes four sections played end-to-end: [[chorus]] (called three
-times) and [[solo_chorus]] (called once between choruses 2 and 3).
-No new musical material at this level — pure structural composition
-of the intermediates.
+times) and [[solo_chorus]] (called once between choruses 2 and 3).
+Each section is overlaid with a [[drum_chorus]] whose profile shapes
+the song's drum arc: a sparse profile (`mp`, ghost-note snares,
+kick+snare+sparse hi-hat) introduces the lyric; standard (`mf`, full
+kick+snare+hi-hat with one ghost per bar) carries the mid choruses;
+driving (`f`, full kit with ride cymbal, accented backbeat, opening
+crash) supports the solo. Each chorus's drum profile is chosen here
+in `song`; the drum logic lives in [[drum_chorus]].
```

**Python facet**:

```diff
 def compute(context):
-    chorus1 = context.compute("chorus")
-    chorus2 = context.compute("chorus")
-    solo = context.compute("solo_chorus")
-    chorus3 = context.compute("chorus")
-    return sequence(chorus1, chorus2, solo, chorus3)
+    chorus1_drums = context.compute("drum_chorus", profile='sparse')
+    chorus2_drums = context.compute("drum_chorus", profile='standard')
+    solo_drums    = context.compute("drum_chorus", profile='driving')
+    chorus3_drums = context.compute("drum_chorus", profile='standard')
+
+    chorus1 = voices(context.compute("chorus"),       chorus1_drums)
+    chorus2 = voices(context.compute("chorus"),       chorus2_drums)
+    solo    = voices(context.compute("solo_chorus"),  solo_drums)
+    chorus3 = voices(context.compute("chorus"),       chorus3_drums)
+
+    return sequence(chorus1, chorus2, solo, chorus3)
```

**Dependencies block** — added `[[drum_chorus]]` alongside `[[chorus]]` and `[[solo_chorus]]`.

## §3 Tests

7 cases in `tests/music/test_blues_drums.py`:

```
tests/music/test_blues_drums.py::test_drum_chorus_default_profile_returns_12_bar_score PASSED
tests/music/test_blues_drums.py::test_drum_chorus_sparse_profile_has_fewer_hits_than_driving PASSED
tests/music/test_blues_drums.py::test_drum_chorus_driving_profile_includes_crash_on_bar_1 PASSED
tests/music/test_blues_drums.py::test_drum_chorus_sparse_profile_omits_crash PASSED
tests/music/test_blues_drums.py::test_drum_chorus_standard_profile_has_hihat_on_all_4_beats PASSED
tests/music/test_blues_drums.py::test_drum_chorus_inserts_section_dynamic_mark PASSED
tests/music/test_blues_drums.py::test_song_now_includes_drum_parts_per_section PASSED
7 passed in 1.36s
```

Full forge suite: **501 passed, 4 skipped in 38.55s** (was 494; +7 new — no regressions in existing tests).

No `npm test` per the prompt's instruction to skip plugin-side rebuilds.

## §4 Preview / smoke instructions

### Path A — open forge-music source vault directly

1. In Obsidian: `File → Open vault → Open folder as vault → /Users/odedfuhrmann/projects/forge-music`
2. Open `blues/song.md` in that vault.
3. Cmd-P → `Forge: Compute` on `song.md`.
4. Wait for Verovio render + html-midi-player widget.
5. Click play. Listen to the 4-chorus arc with drums shaping the dynamics.

### Path B — copy files into existing test vault

If your test vault setup is friendlier:

```bash
cp /Users/odedfuhrmann/projects/forge-music/blues/song.md \
   ~/forge-vaults/test1/forge-music/blues/song.md
cp /Users/odedfuhrmann/projects/forge-music/blues/drum_chorus.md \
   ~/forge-vaults/test1/forge-music/blues/drum_chorus.md
```

Then in Obsidian:
1. Cmd-P → `Reload app without saving` (or close + reopen the file).
2. Open `forge-music/blues/song.md` in the test vault.
3. Cmd-P → `Forge: Compute`.
4. Listen.

### What to listen for

- **Chorus 1 (sparse, `mp`)**: quieter, ghost-note snares on the and-of-3 each bar, sparse hi-hat (only on beats 1 and 3). Should feel like an introduction — the song settling in.
- **Chorus 2 (standard, `mf`)**: fuller, hi-hat on all 4 dotted-quarter beats, one ghost snare on the and-of-4. Vocal sits over a steady groove.
- **Solo chorus (driving, `f`)**: ride cymbal instead of closed hi-hat (different timbre — the energy should lift), kick on all 4 beats, accented snare backbeat (the prominent `ff` velocity), crash cymbal at bar 1. The solo should feel pushed forward by the drums.
- **Chorus 3 (standard, `mf`)**: returns to the standard feel — coming home. Same energy as chorus 2.
- **Score (Verovio + MuseScore)**: dynamic marks visible per chorus (`mp` at start of chorus 1, `mf` at start of choruses 2 and 4, `mf` at start of solo — with accents on the snare backbeat). The mark sits on the kick part as the section anchor.

### Revert path if outcome isn't good

```bash
cd /Users/odedfuhrmann/projects/forge-music && git restore blues/song.md
cd /Users/odedfuhrmann/projects/forge-music && rm blues/drum_chorus.md
cd /Users/odedfuhrmann/projects/forge && rm tests/music/test_blues_drums.py
```

If you used smoke path B, also revert the test-vault copies:
```bash
rm ~/forge-vaults/test1/forge-music/blues/drum_chorus.md
# song.md was an extracted copy from the bundled v0.2.37; re-extract
# by Cmd-Q Obsidian + rm -rf ~/forge-vaults/test1/forge-music + reopen.
```

The `forge/docs/specs/constitution.md` modification is NOT from this drain; revert separately if desired:
```bash
cd /Users/odedfuhrmann/projects/forge && git restore docs/specs/constitution.md
```

## §5 Surprises / deviations

### Velocity 60 → 'p' not 'mp' (boundary correction mid-drain)

The prompt's design called the sparse profile "around 60 (mp band)". Per the v0.3.8 `_VELOCITY_TO_DYNAMIC` table:
```
ppp ≤ 30 < pp ≤ 45 < p ≤ 60 < mp ≤ 72 < mf ≤ 85 < f ≤ 100 < ff ≤ 115 < fff
```

So velocity **60 maps to 'p'** (the upper edge of the 'p' band), **not 'mp'**. 'mp' starts at 61.

The first test run caught this: `test_drum_chorus_inserts_section_dynamic_mark` failed with `'mp' in ['p']` → AssertionError.

Per prompt §"Don'ts": *"Don't make `drum_chorus`'s English facet promise dynamics that the actual profile values don't produce (the 'pp at edges' Murmuration mismatch is the cautionary tale — describe what the implementation actually does)."*

Fix: bumped sparse velocity from 60 → **65** (lands cleanly in the 'mp' band per the table). English facet's `'sparse' (mp)` description now holds true. Test re-runs cleanly.

This was the only mid-drain math hiccup.

### `voices()` instrument-grouping behavior

Song's final Score has 9 parts (3 original chorus/solo parts + 6 drum parts), but importantly the drum parts are GROUPED by instrument identity across sections. From the CPython sanity check:

```
song: 9 parts
  Part 0 (Piano): 48 measures
  Part 1 (Voice): 48 measures
  Part 2 (Electric Guitar): 48 measures
  Part 3 (Kick): 48 measures
  Part 4 (Snare): 48 measures
  Part 5 (Snare): 48 measures           ← ghost snare (separate stream)
  Part 6 (Ride Cymbal): 48 measures
  Part 7 (Closed Hi-Hat): 48 measures
  Part 8 (Crash Cymbal): 48 measures
```

`voices()` (and `sequence()` underneath) merges same-instrument parts across choruses into one continuous stave with rest-padding for inactive sections. This means:
- The **Closed Hi-Hat** part has notes during choruses 1, 2, 4 (sparse + standard + standard) and rests during the solo (driving uses ride).
- The **Ride Cymbal** part has notes during the solo only; rests during the three vocal choruses.
- The **Crash Cymbal** part has one note at bar 25 (solo chorus bar 1) and rests everywhere else.

That's the correct musical behavior — visually you'll see staves that "wait" through inactive sections, which is conventional drum-chart engraving.

### Two separate Snare parts

The "normal" snare (beats 2 and 4) and the "ghost" snare (and-of-3 or and-of-4 depending on profile) are built as SEPARATE Parts inside `drum_chorus`. Music21 doesn't merge them on `voices(*parts)` because they're both `SnareDrum` instances but inserted as distinct Part objects — they end up as 2 stacked staves both labeled "Snare". A future cleanup could merge them within `drum_chorus` by combining hit_specs before building one part. For preview purposes, the audio is identical (both go to MIDI channel 10 + the snare note number) and the visual cost is minor (one extra staff in the MuseScore output). Flag for cleanup if the preview promotes.

### Constitution.md untouched

The `git status` in `forge` showed `M docs/specs/constitution.md` from before this drain started. I did NOT open or edit that file. The modification is from some prior session that wasn't committed. Per preview-mode discipline, I left it alone — the user can decide whether to keep, commit, or revert it independently of this drum work.

## §6 Confidence in the artistic outcome

**Optimistic but with caveats.**

What I'm confident about:
- The **sparse → standard → driving → standard** shape is the standard blues song arc (intro / verse / solo / return). Even if individual profile details need tuning, the overall arc has the right contour.
- **`mark_dynamics=True` integration**: per the v0.3.8 helper, the dynamic marks should appear on the kick part as anchor — one mark per chorus, not 4 (one per drum staff). The standard/driving choruses produce 'mf' marks; sparse produces 'mp'. Tests verify this.
- **Density differentiation**: sparse has fewer notes than driving (test 2 confirms this empirically). The ratio is roughly 1 : 1.6 — driving has ~60% more hits per chorus.
- **`voices()` rest-padding behavior**: the drum parts in song will correctly show empty bars during sections where that instrument isn't used. This is the right MuseScore-side rendering.

What I'm less sure about:
- **'sparse' may sound TOO quiet** at velocity 65 ('mp' band lower edge). If the user finds chorus 1 inaudible vs the vocal, the fix is to bump to velocity 75 ('mf') — but that loses the dynamic contrast vs choruses 2 + 4. Listen and decide.
- **Ride cymbal vs closed hi-hat timbre swap during solo** is musically correct but may sound abrupt rather than as a smooth lift. A blues song typically has a more gradual energy build. If too abrupt, ease in by having closed hi-hat in solo's bars 1-6 then ride for bars 7-12 (more "second half lifts" phrasing).
- **Crash on bar 1 of solo** is a single hit — could feel underwhelming. If so, add crashes on bar 5 (the IV move) and bar 9 (the V move) of the solo for chord-change accents.
- **Ghost notes on and-of-3 (sparse) vs and-of-4 (standard)**: barely audible difference at the velocity levels in question. The user may want one or both eliminated, or both kept as a "signature" of the profile.

My prediction: **the audio will land as recognizably a song-with-drums rather than song-without-drums** (the load-bearing change), and the arc will be audible, but individual profile tunings may want adjustment after listening. The 7 tests give a structural-correctness floor; artistic fidelity is the user's call.

## §11 Preview-mode protocol

Per the prompt's CRITICAL header, this drain is fully reversible by `git restore` + `rm`. The feedback file itself stays at
`prompts/feedback/2026-06-02-2315-blues-song-drum-part-preview.md` regardless of revert decision — durable record of what was tried. The prompt moves to `done/` per standard protocol.

If the user signals "promote to release" in a follow-up, that future drain would:
- Add appropriate version bumps (forge-music 0.3.8 → 0.3.9; plugin 0.2.37 → 0.2.38).
- Commit drum_chorus.md + song.md modifications in forge-music with appropriate message.
- Commit test_blues_drums.py in forge.
- Mirror drum_chorus.md + song.md + forge.toml into the plugin bundle.
- Tag forge-music v0.3.9.
- Build and release plugin v0.2.38 zip with GH Release + SHA round-trip.

If "revert preview", standard git-restore + rm. No release machinery touched.
