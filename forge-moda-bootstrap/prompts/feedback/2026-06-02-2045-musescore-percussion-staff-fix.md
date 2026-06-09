---
timestamp: 2026-06-02T12:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T20:45:00Z
status: success
---

# Fix MuseScore percussion staff rendering for non-kick drums

Investigation-driven fix. v0.2.34's MuseScore visual regression (kick → percussion staff; everything else → Piano treble staves) traced to music21's MusicXML exporter enforcing channel uniqueness per Score. Fix lands as `_force_perc_channel` monkey-patch in `forge.music.lib`.

## §1 Murmuration MusicXML inspection

```
Total score-parts: 7

=== Part 0 ===  part-name: Bass Drum         midi-channel: 10  midi-unpitched: 36
=== Part 1 ===  part-name: Snare Drum        midi-channel: 1   midi-unpitched: 39
=== Part 2 ===  part-name: Hi-Hat Cymbal     midi-channel: 2   midi-unpitched: 43
=== Part 3 ===  part-name: Hi-Hat Cymbal     midi-channel: 3   midi-unpitched: 47
=== Part 4 ===  part-name: Tom-Tom           midi-channel: 4   midi-unpitched: 42
=== Part 5 ===  part-name: Tom-Tom           midi-channel: 5   midi-unpitched: 48
=== Part 6 ===  part-name: Crash Cymbals     midi-channel: 6   midi-unpitched: 50
```

**Bingo.** Only Part 0 (kick) gets `<midi-channel>10</midi-channel>` (GM percussion). Parts 1-6 get sequential melodic channels 1-6. MuseScore reads melodic channels as Piano-default, hence the 5-line treble staves.

Also surfaces:
- `<midi-unpitched>` values are music21's `percMapPitch + 1` (the off-by-one MusicXML serialization quirk — Part 1 Snare's percMapPitch=38 serializes as 39 / GM Hand Clap).
- `part-name` shows the music21 class default ("Bass Drum", "Hi-Hat Cymbal", "Tom-Tom") — these would benefit from kit-conventional overrides.

## §2 music21 per-class introspection

```
=== BassDrum ===          instrumentName: 'Bass Drum'      midiChannel: 9   percMapPitch: 35   inGMPercMap: True
=== SnareDrum ===         instrumentName: 'Snare Drum'     midiChannel: 9   percMapPitch: 38   inGMPercMap: True
=== HiHatCymbal ===       instrumentName: 'Hi-Hat Cymbal'  midiChannel: 9   percMapPitch: 44   inGMPercMap: True
=== TomTom ===            instrumentName: 'Tom-Tom'        midiChannel: 9   percMapPitch: 41   inGMPercMap: True
=== CrashCymbals ===      instrumentName: 'Crash Cymbals'  midiChannel: 9   percMapPitch: 49   inGMPercMap: True
=== RideCymbals ===       instrumentName: 'Ride Cymbals'   midiChannel: 9   percMapPitch: None inGMPercMap: False
```

**All percussion classes default to `midiChannel=9` (= GM ch10) at the instance level.** The reassignment happens INSIDE music21's MusicXML exporter, not in the instrument metadata.

Also: `instrumentName` defaults are all "Bass Drum" / "Hi-Hat Cymbal" / "Tom-Tom" — no "Bangu" in music21's defaults. The "Bangu Bass drum" the user saw in MuseScore must be MuseScore's own GM-percussion lookup table (MIDI note 36 on channel 10 displayed as "Bangu" in some MuseScore percussion lookup). The factory's `instrumentName='Kick'` override sidesteps MuseScore's lookup entirely by providing an explicit name.

## §3 Diagnosis

Music21's `m21ToXml.py:2801-2810`:

```python
if (thisInstrument.midiChannel is None
        or thisInstrument.midiChannel in self.midiChannelList):
    try:
        thisInstrument.autoAssignMidiChannel(usedChannels=self.midiChannelList)
    except exceptions21.InstrumentException as e:
        environLocal.warn(str(e))
self.midiChannelList.append(thisInstrument.midiChannel)
```

The Score-level `midiChannelList` tracks used channels. First percussion instrument keeps channel 9 (→ output `<midi-channel>10</midi-channel>`); subsequent same-channel instruments get reassigned via `autoAssignMidiChannel`, which picks the next available channel from 0, 1, 2, ... (the melodic channels). Output channels 1, 2, 3, ... for the non-kick percussion parts.

This is a music21 limitation: it assumes channel uniqueness per part, but GM percussion convention is that ALL percussion shares channel 10 (distinguished by note number, not by channel).

**Fix shape**: monkey-patch each instance's `autoAssignMidiChannel` to return 9 unconditionally. Verified empirically:

```
After force_perc_channel → midi-channels: ['10', '10', '10', '10', '10', '10', '10']
                         → midi-unpitched: ['36', '39', '43', '47', '42', '48', '50']
```

`percMapPitch` values stay unchanged because the user confirmed v0.2.34 GarageBand audio was GREAT. MusicXML and MIDI exports use different note-mapping code paths in music21; the MIDI path was correct; the MusicXML path needed the channel fix (and incidentally has the off-by-one on `<midi-unpitched>` but that didn't affect MIDI playback).

## §4 Fix landed

`forge/music/lib.py`:

```python
def _force_perc_channel(inst, name, abbrev):
    """Lock midiChannel=9 (GM channel 10) by overriding autoAssignMidiChannel
    on this instance, and override the displayed instrument name."""
    inst.midiChannel = 9
    inst.autoAssignMidiChannel = lambda usedChannels=None: 9
    inst.instrumentName = name
    inst.instrumentAbbreviation = abbrev
    return inst


def kick():
    """Kick drum (bass drum). GM note 36 on channel 10."""
    inst = instrument.BassDrum()
    return _force_perc_channel(inst, 'Kick', 'K')


def snare():
    """Snare drum. GM note 38 on channel 10."""
    inst = instrument.SnareDrum()
    return _force_perc_channel(inst, 'Snare', 'S')


# Plus updated closed_hihat / open_hihat / pedal_hihat / low_tom / mid_tom /
# high_tom / crash_cymbal / ride_cymbal — each now ends with
# `return _force_perc_channel(inst, '<KitName>', '<abbrev>')`.
```

`forge/core/executor.py` `_FORGE_MUSIC_LIB_NAMES`: added `kick` + `snare` bindings.

**Commits**:
- `forge@5fc594e` — lib.py fix + executor bindings + tests.
- `forge-client-obsidian@fb426ab` — bundle mirror (lib.py + executor.py).

## §5 Tests

5 new cases in `tests/music/test_lib.py`:

- `test_kick_factory_returns_BassDrum_with_kick_name` — `kick()` is a `BassDrum` instance with `instrumentName='Kick'` and `midiChannel=9`.
- `test_snare_factory_returns_SnareDrum_with_snare_name` — same shape.
- `test_multi_percussion_score_all_channels_are_10` — **THE regression test.** Builds a 7-part Score with kick + snare + closed/open hi-hat + low/mid tom + crash. Serializes to MusicXML. Asserts all 7 `<midi-channel>` values equal `'10'`.
- `test_kit_factory_instrument_names_are_kit_conventional` — asserts the 10 factory `<instrument-name>` values match `['Kick', 'Snare', 'Closed Hi-Hat', 'Open Hi-Hat', 'Pedal Hi-Hat', 'Low Tom', 'Mid Tom', 'High Tom', 'Crash Cymbal', 'Ride Cymbal']`. Hard guard: `'Bangu' not in n` for each.
- `test_force_perc_channel_does_not_change_percMapPitch` — locks in the "MIDI export stays correct" property. Each factory's `percMapPitch` value matches the v0.3.6 baseline.

Pre-fix run (verified via the `_make_multi_perc_score` helper before applying fix): channels = `['10', '1', '2', '3', '4', '5', '6']`. Test fails.

Post-fix run: channels = `['10', '10', '10', '10', '10', '10', '10']`. Test passes.

**Engine full suite**: 459 passed, 4 skipped (was 454 + 5 new = 459). **Plugin suite**: 161/161 unchanged.

## §6 Release

| Property | Value |
| --- | --- |
| Plugin manifest | 0.2.34 → 0.2.35 |
| Zip path | `dist/forge-client-obsidian-v0.2.35.zip` |
| Size | 33.06 MB |
| SHA-256 | `e38748a7f84b7f62df53fa4862047dd6c90fafcb7f4b6b3782081c4d5ff802c1` |
| GH Release | <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.35> |
| SHA round-trip | match ✓ |

Clean-vault smoke:

```
=== _force_perc_channel in bundled lib.py ===   12 occurrences (1 def + 10 factory calls + 1 docstring mention) ✓
=== kick + snare factories ===                  2 ✓
=== manifest ===                                "version": "0.2.35" ✓
```

forge-music vault NOT bumped (per prompt §6 — no snippet content changed; Murmuration calls the factories the same way). Vault stays at 0.3.6.

Engine-bundle drift preflight ran clean at release-zip time.

## §Smoke split

**Auto-verified by CC:**
- §1 + §2 investigation outputs captured (per-Part MusicXML + per-class introspection).
- §3 diagnosis isolated to a specific music21 source line.
- §4 fix landed; bundle mirror diff clean (via `npm run sync-engine-bundle`).
- §5 5 new tests pass; engine 459/4 skipped, plugin 161/161.
- §6 release zip built; drift preflight clean; clean-vault smoke confirms helpers + factories present; GH Release published; SHA round-trip clean.

**Deferred to user (Obsidian-context — load-bearing MuseScore visual verification):**
1. `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` → expect `v0.2.35`.
2. Delete `~/forge-vaults/test1/forge-music/` (the recurring re-extract pain — still pending).
3. Cmd-Q + reopen Obsidian.
4. Forge-click `forge-music/percussion/murmuration.md` → click MusicXML download.
5. Open downloaded `.musicxml` in MuseScore.
6. **Verify**: all 7 staves render as percussion staves (single-line or however MuseScore styles channel-10 parts uniformly). No "Piano, <drum>" labels. Instrument names read "Kick" / "Snare" / "Closed Hi-Hat" / "Open Hi-Hat" / "Low Tom" / "Mid Tom" / "Crash Cymbal".
7. **Confirm audio unchanged**: download MIDI, open in GarageBand, verify Murmuration still sounds GREAT.

## §Follow-ups noted but not built

**From this drain:**

1. **`kick()` + `snare()` factories added — Murmuration NOT migrated.** Per prompt's §"Don'ts", Murmuration stays as-is calling bare `instrument.BassDrum()` and `instrument.SnareDrum()`. A future cleanup drain could migrate to `kick()` / `snare()` for naming consistency in MuseScore. The migration is one-line per Part call — cheap. Worth queueing as a small cleanup.

2. **`drums_shuffle.md` (v0.3.5 spike) also calls bare `instrument.HiHatCymbal()` etc.** Same migration shape applies. Combine with #1 in one drain.

3. **music21 MusicXML `<midi-unpitched>` off-by-one quirk**. `percMapPitch=38` (SnareDrum default) serializes as `<midi-unpitched>39</midi-unpitched>` (GM Hand Clap, not Snare). If MuseScore reads MusicXML for playback (not just visual), notes will sound wrong despite correct part-name. User-side smoke should confirm whether this matters — if so, the fix is either (a) override `percMapPitch -= 1` for each factory (risk: changes MIDI export too), or (b) post-export MusicXML patch (more surgical, narrower blast radius). Defer until user-side smoke confirms whether MuseScore-via-MusicXML playback differs from GarageBand-via-MIDI.

4. **`inGMPercMap=False` for `RideCymbals`** — music21 doesn't have a percussion-map entry for it. My factory sets `percMapPitch=51` manually. Worth noting for future audits of music21 percussion-class coverage.

**Standing items from prior drains** (unchanged):

1. Auto re-extract on forge.toml change — STILL the oldest pending; bit the user yet again.
2. `DOMAIN_AVAILABILITY` fail-loud registry.
3. Closed-beta micropip rider.
4. Vault content sync generalization.
5. Scope-filter triplication.
6. HTTP fallback collapse.
7. Engine-import allowlist audit.
8. forge.installer-exclusion grep.

## §Protocol comments for driver

1. **Investigation-first paid off cleanly.** §1 + §2 captured concrete data; §3 diagnosis cited specific music21 source lines. The fix design followed from the diagnosis with zero speculation. Worth keeping the "investigation step BEFORE design" pattern for any bug-fix prompt where the failure mode isn't obvious from the symptom.

2. **The "don't change percMapPitch" guardrail in the prompt was load-bearing.** Without it, I might have "fixed" the off-by-one quirk and broken GarageBand audio in the process. The prompt's explicit "audio is GREAT and stays unchanged" framed the fix scope correctly.

3. **Monkey-patching music21 instance methods (autoAssignMidiChannel) is a legitimate fix shape** when the library's behavior is too coupled to override via configuration. The fix is per-instance (no monkey-patch leakage across the process) and self-contained inside the factory helpers. Worth codifying as a music-domain pattern: "when music21's exporter does something we can't configure, patch the instance method."

4. **The "Bangu Bass drum" surface was MuseScore's GM-percussion lookup, NOT music21**. `instrument.BassDrum().instrumentName == 'Bass Drum'` (per §2 investigation). MuseScore uses MIDI note 36 on channel 10 to look up the kit-piece name in its own table, where "Bangu" (a Chinese frame drum that maps to GM Bass Drum 1 in some MuseScore percussion mappings) appears. The `instrumentName='Kick'` override in the factory sidesteps MuseScore's lookup by providing an explicit string. Useful insight: per-renderer percussion-name tables are real; explicit override is the universal escape hatch.

5. **The prompt's §Out of scope correctly named what NOT to touch**: Verovio rendering, html-midi-player playback wiring, Murmuration's musical content. Each of those is a separate concern with its own diagnosis. Tightly-scoped prompts are easier to drain.

## §11 Constitutional alignment

**Level 1 — silent approve.** Pure music-domain bug fix. No constitution surface touched.

The factory API surface grew by 2 helpers (`kick()`, `snare()`) but the addition mirrors the existing `closed_hihat()` / `open_hihat()` / `low_tom()` / etc. pattern — no new architectural concept, no new convention.
