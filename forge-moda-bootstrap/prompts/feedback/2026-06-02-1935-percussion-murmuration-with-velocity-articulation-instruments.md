---
timestamp: 2026-06-02T11:45:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T19:35:00Z
status: success
---

# Percussion expansion: velocity + articulation + more instruments + Murmuration piece

5-phase drain shipped cleanly. forge-music 0.3.4 → 0.3.6; plugin 0.2.33 → 0.2.34. Engine suite **454 passed, 4 skipped** (was 430; +24 net). Plugin suite **161/161** unchanged.

## §Phase A — `with_velocity` helper

### Helper

```python
def with_velocity(notes, pattern):
    """Apply velocity values to a sequence of Note objects per a pattern.
    Mutates each note's `.volume.velocity` in place and returns the list
    for chaining. Rests in the sequence are skipped.
    Patterns: 'human' / 'ghost' / 'accent' / 'crescendo' / 'decrescendo' /
              int (1-127) / list[int] (cyclic)."""
```

Profile shapes:
- `'human'`: 75 ± 8
- `'ghost'`: 35 + randint(-5, 8) → 30-43
- `'accent'`: 110 + randint(-5, 10) → 105-120
- `'crescendo'`: linear 40 → 90
- `'decrescendo'`: linear 90 → 40

### 12 tests

`tests/music/test_lib.py`: uniform int, cyclic list, 5 named profile range checks, crescendo/decrescendo shape, rest-skipping, invalid pattern (ValueError), empty list (ValueError), clamp-above-127, clamp-below-1. All 12 pass.

### MUSIC_PROMPT_FRAGMENT addition

```
- For percussion (and any rhythmic content), vary note velocities to
  avoid robotic-sounding output. Use `with_velocity(notes, pattern)`
  with 'human' as a sensible default. ...
```

Plus the helper signature added to the globals list at the top of the fragment.

### Commits

- `forge@483c9d0` — lib + executor + prompt fragment + tests.
- `forge-client-obsidian@78ace02` — bundle mirror.

## §Phase B + C — Percussion instrument factories

Combined into a single commit because both fit the same shape (music21 investigation revealed identical mechanism: ONE class per kit piece + `percMapPitch` overrides).

### Investigation findings

```
=== Hi-hat / cymbal classes ===
HiHatCymbal: midiChannel=9, midiProgram=None, percMapPitch=44
CrashCymbals: midiChannel=9, percMapPitch=49
RideCymbals: midiChannel=9, percMapPitch=None
... (SuspendedCymbal, SplashCymbals, SizzleCymbal, etc.)

=== Tom / drum classes ===
BassDrum, BongoDrums, CongaDrum, Maracas, SnareDrum,
SteelDrum, TenorDrum, TomTom, Triangle
```

**Key findings**:
- music21 has **ONE `HiHatCymbal` class**. The articulation distinction (closed / open / pedal) is encoded as `percMapPitch` — the GM note number on channel 10. Music21's default for `HiHatCymbal` is `percMapPitch=44` (Pedal Hi-Hat), not closed.
- music21 has **ONE `TomTom` class** — no low/mid/high subclasses.
- `CrashCymbals` defaults to correct GM 49; `RideCymbals` has `percMapPitch=None` (needs override).
- All percussion classes correctly default to `midiChannel=9` (0-indexed) = GM channel 10. Music21's percussion-channel routing is correct out of the box.

### 8 factory helpers

```python
def closed_hihat():  # HiHatCymbal + percMapPitch=42
def open_hihat():    # HiHatCymbal + percMapPitch=46
def pedal_hihat():   # HiHatCymbal + percMapPitch=44 (music21 default)
def low_tom():       # TomTom + percMapPitch=41
def mid_tom():       # TomTom + percMapPitch=47
def high_tom():      # TomTom + percMapPitch=50
def crash_cymbal():  # CrashCymbals + percMapPitch=49
def ride_cymbal():   # RideCymbals + percMapPitch=51
```

### Diverged from prompt's literal text

Prompt suggested setting `midiProgram` (e.g. `inst.midiProgram = 42`). That's wrong for GM percussion — on channel 10, `midiProgram` doesn't change the kit; only the note pitch determines the drum sound. The correct attribute is `percMapPitch`. CC verified this by reading music21's MusicXML serialization path (the `<midi-unpitched>` MusicXML element is populated from `percMapPitch`, not from `midiProgram`).

### 10 tests

5 per-helper tests checking `percMapPitch == <expected GM note>` + isinstance check. 2 cross-cutting tests verifying every factory returns an instrument on `midiChannel == 9` (channel 10 / percussion). All 10 pass.

### Prompt fragment additions

Globals list at the top of MUSIC_PROMPT_FRAGMENT got the 8 factory signatures. A new rule paragraph explains the music21-class vs percMapPitch model:

```
- For percussion kits, use the lib factory helpers (closed_hihat(),
  open_hihat(), pedal_hihat(), low_tom(), mid_tom(), high_tom(),
  crash_cymbal(), ride_cymbal()) rather than hand-configuring
  instrument.HiHatCymbal() / instrument.TomTom() etc. The factories
  set percMapPitch to the correct GM note number (channel 10)...
```

### Commits

- `forge@1e63f27` — 8 factories + executor bindings + prompt fragment + 10 tests.
- `forge-client-obsidian@319bc0a` — bundle mirror.

## §Phase D — `percussion/` partition + Murmuration piece

### Subdir convention

`mkdir -p ~/projects/forge-music/percussion/`. No `forge.toml` inside — content partition within forge-music, not a sub-library. Same convention as `blues/`.

### English facet

(Reproduced inline — see the commit + bundle for full text.) 8 sections naming the arc (Solitary / Companions / Gathering / Swarming / Murmuration / Dispersing / Threading / Resting), each described in 1 sentence; closing paragraph names the lib helpers used.

### Python facet

~210 lines. The structure:
- 8 section-level velocity profiles (uniform int for the quiet edges; `'human'` for the building sections; `'accent'` for the peak; `'decrescendo'` for the fade).
- Per-instrument schedules as nested `[section_idx][bar_idx][(offset, duration)...]` data. 7 schedules total: kick, closed hi-hat, open hi-hat, snare, low tom, mid tom, crash.
- `make_section_measures(...)` helper turns each section's bar patterns into 4 `stream.Measure` objects, applying the section's velocity profile across all the non-rest notes in that section.
- `build_part(inst, sections)` assembles 32 Measures from the 8 sections + an instrument prepended.
- `voices(kick_part, snare_part, closed_hh_part, open_hh_part, low_tom_part, mid_tom_part, crash_part)` for final assembly.

### Local CPython sanity check (pre-commit)

```
Score type: Score
Part count: 7
  Part 0: 32 measures
  Part 1: 32 measures
  ...
  Part 6: 32 measures
Distinct velocities: 57
  range: 40 to 120
```

No bar-arithmetic overflow on any of the 7 × 32 = 224 measures. Velocity range 40-120, 57 distinct values — the with_velocity helper's profiles produced the spread cleanly.

### 2 tests

`tests/music/test_percussion_content_invariants.py`:

```python
def test_murmuration_returns_valid_score(run_music_block):
    # Score type, >= 5 Parts, 32 measures each, every bar sums to 4.0.

def test_murmuration_has_velocity_variation(run_music_block):
    # At least 5 distinct velocity values across all notes.
```

Both pass.

### Commits

- `forge@40babed` — content invariants test.
- `forge-music@f22ce76` — percussion/murmuration.md + forge.toml 0.3.5 → 0.3.6 + tag v0.3.6.
- `forge-client-obsidian@a8b8393` — bundle mirror (vault + forge.toml).

## §Phase E — Release

| Property | Value |
| --- | --- |
| Plugin manifest | 0.2.33 → 0.2.34 |
| Zip path | `dist/forge-client-obsidian-v0.2.34.zip` |
| Size | 33.06 MB |
| SHA-256 | `1d5aad1a60416c8cff875ddbe36e1543d938c058ee3dd798d727380c15bf17ac` |
| GH Release | <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.34> |
| SHA round-trip | match ✓ |

### Clean-vault smoke

```
=== helpers in bundled lib.py ===
with_velocity: 1 ✓
closed_hihat: 1 ✓
open_hihat: 1 ✓
pedal_hihat: 1 ✓
low_tom: 1 ✓
mid_tom: 1 ✓
high_tom: 1 ✓
crash_cymbal: 1 ✓
ride_cymbal: 1 ✓
=== murmuration in zip ===    murmuration.md ✓
=== vault version ===         version = "0.3.6" ✓
=== plugin manifest ===       "version": "0.2.34" ✓
```

Engine-bundle drift preflight ran clean at release-zip time (from v0.2.30-eng's infrastructure).

## §Smoke split

**Auto-verified by CC:**
- Phase A: 12 tests pass; bundle mirror diff clean.
- Phase B+C: 10 tests pass; investigation findings captured; bundle mirror diff clean.
- Phase D: local CPython sanity check + 2 tests pass; bundle mirror diff clean; forge-music v0.3.6 tagged + pushed.
- Phase E: build + release-zip + drift preflight clean + clean-vault smoke + GH Release + SHA round-trip.
- Full engine suite 454/4 skipped; plugin 161/161.

**Deferred to user (Obsidian-context — load-bearing artistic outcome):**
1. `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` → expect `v0.2.34`.
2. Delete `~/forge-vaults/test1/forge-music/` (recurring re-extract pain — item #1 in standing queue still unaddressed).
3. Cmd-Q + reopen Obsidian.
4. Forge-click `forge-music/percussion/murmuration.md`.
5. **Listen for the section arc**: quiet Solitary → gradual layering Companions/Gathering → building Swarming → loud peak Murmuration (bars 17-20) → fading Dispersing → quiet Threading → silent Resting.
6. **Eyeball Verovio output**: 7 stacked staves expected; sparse early sections vs dense Murmuration visible.
7. **Audible distinctions** to listen for: open vs closed hi-hat (Swarming + Murmuration); crash cymbal on bar 17 + bar 19 downbeats; velocity dynamics (not robotic).
8. Optional MuseScore round-trip: download MusicXML, open in MuseScore for high-fidelity rendering with percussion clefs.

## §Follow-ups noted but not built

**New from this drain:**

1. **`drums_shuffle.md` migration to new factory helpers.** The v0.3.5 spike uses bare `instrument.HiHatCymbal()` — could be upgraded to `closed_hihat()` for cleaner GM mapping. Not in scope per prompt's §"Out of scope"; mention here for visibility.
2. **Verovio percussion-clef rendering.** Pre-existing concern from the drums spike. The new Murmuration piece doesn't fix it — still pitched notes on treble staff. User-side eyeball will confirm. Renderer-level fix is forge-core.
3. **MIDI playback fidelity for non-kick drums.** v0.3.5 spike found that music21 routes Snare + HiHat to MIDI channels 1/2 instead of channel 10 in MusicXML output (despite the per-instrument `midiChannel=9`). This drain's percussion-factory helpers don't change that routing — the audible outcome of Murmuration's snare/hi-hat parts via `<midi-player>` may still play as melodic-instrument sounds. Fix would be in music21 or in a post-serialization MusicXML patch step. Track for forge-core.

**Standing items from prior drains** (unchanged from v0.2.32 feedback):

1. Auto re-extract on forge.toml change (oldest pending; bit the user yet again this drain).
2. `DOMAIN_AVAILABILITY` fail-loud registry.
3. Closed-beta micropip rider.
4. Vault content sync generalization (`npm run sync-bundles`).
5. Scope-filter triplication.
6. HTTP fallback collapse for v0.2.6-era endpoints.
7. Engine-import allowlist audit.
8. forge.installer-exclusion grep.

## §Protocol comments for driver

1. **5-phase bundling worked cleanly.** Each phase committed + pushed before the next began. Phase B+C combined into one commit because the investigation (Phase B's helper design) directly informed Phase C's helper design (same mechanism, just different note numbers). When two phases share a mechanism discovery, combining is cheaper than artificial separation.

2. **The investigation step in Phase B paid off.** The prompt's literal text suggested setting `midiProgram` for hi-hat articulations. Investigation revealed that's wrong for GM percussion — `percMapPitch` is the music21-correct mechanism. CC diverged from the prompt's literal text in favor of the empirically-correct behavior; documented the divergence prominently in this feedback. Worth codifying: prompts that specify implementation details are advisory; investigation findings override.

3. **The local CPython sanity check before the test-suite landing was load-bearing for Phase D.** Murmuration is 7 × 32 = 224 measures of percussion. Running the snippet via the engine's `exec_python` + checking parts/measure counts/velocity distribution caught any structural mistakes before the test asserted them. Pattern worth keeping for any content-heavy drain.

4. **The recurring "delete `~/<vault>/forge-music/` + Cmd-Q + reopen" smoke step is now 8+ drains old.** Auto re-extract (item #1) has carried across 8+ drains as the oldest pending follow-up. Worth elevating to "next-up infrastructure drain" priority. The user's time cost on this step is real, and it bit again this drain.

5. **Engine-import allowlist audit (item #7 from v0.2.32 follow-ups) would have caught nothing here** because all new helper imports are music21 (already vendored) + stdlib `random`. But it's still a low-cost check that protects against the next "engine adds a CPython-only import" failure mode. Worth shipping in a small infrastructure drain.

## §11 Constitutional alignment

Per cowork-protocol's four-level disposition:

**Phase A-C (helper additions): Level 1 — silent approve.** Pure additions to `forge.music.lib`'s public surface; no behavior change for existing snippets; existing tests all pass. No constitution clause touched.

**Phase D (`percussion/` partition convention): Level 1 — silent approve.** Mirrors `blues/`'s subdirectory-within-library-vault pattern. A5.1 (library-subdirectory) already covers this case; the v0.2.26 caller-scoped resolution work made bare `[[ ]]` refs from inside `percussion/` work correctly. No new clause needed.

If forge-core's second-pass review disagrees about the partition convention (e.g., wants to require an explicit "content-genre" registration somewhere), restructure. Default disposition: ship.

No second-pass review explicitly requested for this drain; prompt's header noted "Forge-core may want eyes on the lib API surface growth" as a possible Level-2 flag candidate, but the 8 new helpers all fit the existing `*_pentatonic` / `bar` / `voices` / `sequence` / `repeat` surface conventions. No drift from existing patterns.
