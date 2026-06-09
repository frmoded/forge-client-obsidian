---
timestamp: 2026-06-02T11:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T16:28:00Z
status: success
---

# Drums shuffle spike — Verovio percussion + audio playback investigation

Single isolated snippet shipped; CC-side investigation answers parts of all 3 unknowns; user-side eyeball pending for the visual rendering call.

## §1 Snippet authored

`~/projects/forge-music/blues/drums_shuffle.md`:

**English** (3 paragraphs explaining the pattern + the spike framing).

**Python** (47 lines): builds 3 separate `stream.Part` instances (one per drum) via a `make_drum_part(inst, hit_positions)` helper, then combines with `voices(kick, snare, hihat)`. Hits use `note.Note('C4')` with the per-Part `instrument.BassDrum() / SnareDrum() / HiHatCymbal()` as the metadata anchor. Beat positions in eighth-note units within each 12/8 bar:

```
KICK_BEATS  = [0, 6]        # beats 1, 3
SNARE_BEATS = [3, 9]        # beats 2, 4
HIHAT_BEATS = [0, 3, 6, 9]  # every dotted-quarter beat
```

Bundle mirror at `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/drums_shuffle.md` is byte-equal to source.

## §2 Suite results

**Engine** — new case in `tests/music/test_blues_content_invariants.py`:

```
tests/music/test_blues_content_invariants.py::test_drums_shuffle_returns_valid_score PASSED
9 passed, 1 warning in 1.34s
```

(was 8 cases in the blues invariants file; +1 = 9.)

**Full engine suite**:

```
430 passed, 4 skipped, 1 warning in 39.18s
```

(was 429 + 4 skipped; +1 new = 430.)

**Plugin suite**: `161 / 161` unchanged (no plugin-side tests for the spike).

## §3 MusicXML metadata inspection — the load-bearing CC finding

Ran `/tmp/drums_musicxml_inspect.py` which computes `drums_shuffle` end-to-end and serializes the resulting Score to MusicXML via `music21.musicxml.m21ToXml.GeneralObjectExporter`.

### Score shape

```
Score type: Score
Part count: 3
  Part 0: instrument='Bass Drum'      measures=12
  Part 1: instrument='Snare Drum'     measures=12
  Part 2: instrument='Hi-Hat Cymbal'  measures=12
```

**Three separate Parts**, one per drum. `voices()` did not collapse them into a single drum-kit stave with three voices — each gets its own `<score-part>` in the MusicXML output. So Verovio will render three separate staves stacked vertically.

### MusicXML marker counts

| Marker | Count | Status |
| --- | --- | --- |
| `<score-instrument` | 3 | one per drum ✓ |
| `<instrument-name` | 3 | "Bass Drum", "Snare Drum", "Hi-Hat Cymbal" ✓ |
| `<midi-instrument` | 3 | per-part MIDI metadata ✓ |
| `<midi-channel` | 3 | ⚠️ Bass Drum on **channel 10** (GM percussion); Snare on **channel 1**; Hi-Hat on **channel 2** (NOT 10) |
| `<midi-program` | 0 | absent |
| `<percussion` | **0** | **absent** — no percussion clef directive |
| `<unpitched` | **0** | **absent** — notes are pitched `<step>C</step><octave>4</octave>` |
| `notehead` | **0** | **absent** — no X-notehead directives |
| `<clef` | **0** | absent — defaults to treble |
| `<sign>percussion</sign>` | **0** | absent |
| `<part-name` | 3 | named ✓ |
| `<score-part` | 4 | (3 parts + the closing tag matches) |

### Excerpt (first 30 lines of MusicXML body)

```xml
<part-list>
  <score-part id="P4912...">
    <part-name>Bass Drum</part-name>
    <part-abbreviation>B Dr</part-abbreviation>
    <score-instrument id="Ic865...">
      <instrument-name>Bass Drum</instrument-name>
      <instrument-abbreviation>B Dr</instrument-abbreviation>
    </score-instrument>
    <midi-instrument id="Ic865...">
      <midi-channel>10</midi-channel>
      <midi-unpitched>36</midi-unpitched>
    </midi-instrument>
  </score-part>
  <score-part id="P5f18...">
    <part-name>Snare Drum</part-name>
    ...
    <midi-instrument id="I5a51...">
      <midi-channel>1</midi-channel>          <!-- ⚠ should be 10 -->
      <midi-unpitched>39</midi-unpitched>    <!-- ⚠ 39 = Hand Clap (GM); should be 38 = Acoustic Snare -->
    </midi-instrument>
  </score-part>
  <score-part id="Pc036...">
    <part-name>Hi-Hat Cymbal</part-name>
    ...
    <midi-instrument id="I3aa3...">
      <midi-channel>2</midi-channel>          <!-- ⚠ should be 10 -->
      <midi-unpitched>45</midi-unpitched>    <!-- ⚠ 45 = Low Tom; should be 42 (closed) or 46 (open) -->
    </midi-instrument>
  </score-part>
</part-list>
...
<note>
  <pitch>
    <step>C</step>
    <octave>4</octave>
  </pitch>
  <duration>5040</duration>
  <type>eighth</type>
</note>
```

**Three quirks** the inspection surfaced:

1. **No percussion clef directive.** Without `<sign>percussion</sign>` (clef sign code 7), Verovio defaults to treble. Notes will render as C4 on a 5-line treble staff.
2. **No `<unpitched>` elements.** music21's `note.Note('C4')` path generates `<pitch>` elements, not the `<unpitched>` percussion-notation MusicXML element. X noteheads are tied to `<unpitched>` in standard MusicXML rendering; pitched notes get regular ovals.
3. **GM channel + program codes wrong for non-kick drums.** Music21 routes BassDrum to channel 10 + unpitched 36 (correct GM Bass Drum 1). But Snare gets channel 1 + unpitched 39 (which is GM Hand Clap, not Acoustic Snare 38), and Hi-Hat gets channel 2 + unpitched 45 (which is GM Low Tom, not Closed Hi-Hat 42). MIDI playback will therefore route kick correctly but snare and hi-hat will play as whatever SoundFont assigns to channels 1/2.

## §4 Plugin playback path investigation

`grep -rln 'midi\|MIDI\|audio\|sound\|playback' src/`:

- `src/modal.ts` (likely just text mentions)
- `src/output-view.ts` — **load-bearing**
- `src/welcome.test.ts` (test only)
- `src/verovio.ts` — MusicXML → SVG rendering

`grep -rln 'webAudio\|AudioContext\|playMidi\|MIDIPlayer\|MidiPlayer' src/ assets/`:

- `src/output-view.ts`
- `assets/pyodide/pyodide.asm.js` (Pyodide internals; not Forge code)

### output-view.ts wiring (the actual playback path)

```typescript
src/output-view.ts:5:    // html-midi-player registers <midi-player> as a custom element on import.
src/output-view.ts:9:    async function ensureMidiPlayerLoaded() {
src/output-view.ts:10:      if (midiPlayerLoaded || customElements.get('midi-player')) {
src/output-view.ts:14:      await import('html-midi-player');
src/output-view.ts:375:        await ensureMidiPlayerLoaded();
src/output-view.ts:378:        player = document.createElement('midi-player');
src/output-view.ts:381:        player.classList.add('forge-midi-player');
```

`output-view.ts:365-385` shows the full pipeline:
1. `renderMusicXMLAndMIDI(musicxml, host.clientWidth)` returns `{ svg, midiBase64, timeMap }` — Verovio handles both SVG + MIDI from the MusicXML.
2. `await ensureMidiPlayerLoaded()` lazy-loads `html-midi-player` (declared dep in package.json).
3. `<midi-player>` custom element instantiated; `player.soundFont = 'https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus'`.
4. `player.noteSequence = noteSequence` (converted from the base64-MIDI via `midiBase64ToNoteSequence`).
5. Player + SVG appended to the host container.

**Disposition: functional playback path.** Kick will play correctly (MIDI channel 10 with GM program 36). Snare and hi-hat will route to channels 1/2 — whatever SoundFont assigns to those will play (likely piano/electric piano, not actual snare/hihat sounds). **Network required for first play** — SoundFont fetched from `storage.googleapis.com` at runtime.

### Asset directory for soundfont/midi/audio files

```
$ ls assets/ | grep -iE 'audio|midi|sound|sf2'
(nothing)
```

No bundled SoundFont, no bundled MIDI files. The SoundFont fetch is hosted-CDN. For the closed-beta-no-network constraint, the user's first play on a fresh install would fail unless they have network access at that moment; subsequent plays are cached by the browser.

## §5 Release artifacts

| Property | Value |
| --- | --- |
| Path | `dist/forge-client-obsidian-v0.2.33.zip` |
| Size | 33.06 MB |
| SHA-256 | `33f3fafa2cf8b6adaa8478426b908a63aa6d8da2cc7d25cc3afa9ea53e6fcb8a` |
| GH Release | <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.33> |
| SHA round-trip | match ✓ |
| forge-music tag | `v0.3.5` pushed |

### Clean-vault smoke

```
=== drums_shuffle in zip ===   drums_shuffle.md ✓
=== blues count ===            9 files (was 8 + drums)
=== vault version ===          version = "0.3.5" ✓
=== plugin manifest ===        "version": "0.2.33" ✓
```

Engine-bundle drift preflight ran clean during release-zip (from v0.2.30-eng's infrastructure). No drift introduced by this drain.

## §6 Spike decision-tree position

**Note**: prompt was authored expecting plugin v0.2.30 (current is v0.2.32 / v0.2.33). Version-bump path adjusted; semantic intent preserved.

### (a) music21 emits percussion-instrument metadata

**Yellow.** `<midi-instrument>` per part with instrument names and midi-channel + midi-unpitched bytes — that's metadata. But:
- No `<percussion>` clef directive (which would tell renderers to use a 1-line drum staff with the percussion clef sign).
- No `<unpitched>` element (which would let renderers attach X noteheads).
- music21's MIDI channel routing puts Snare on 1 and Hi-Hat on 2 (not 10).

The metadata *exists*; it just doesn't ride the path that Verovio's percussion renderer reads from. The fix is to use `note.Unpitched` instead of `note.Note('C4')` — that generates `<unpitched>` instead of `<pitch>`, which paired with the instrument metadata should produce percussion-clef rendering.

### (b) MusicXML structure suggests Verovio will render correctly

**Red (preliminary; user eyeball authoritative).** Without `<percussion>` clef directive, Verovio defaults to treble. Notes are C4 pitched. The expected user-side eyeball outcome:

- Treble clef (not percussion).
- Regular oval noteheads at the C-space of the staff.
- Three separate staves (one per drum) stacked vertically.
- Time signature 12/8.

If Verovio happens to use the `<midi-instrument>` metadata to auto-switch to percussion notation, the eyeball would surface that as a green — but the MusicXML structure suggests it won't.

### (c) Plugin has audio playback path

**Green (functional).** `output-view.ts:365-385` mounts `html-midi-player` with a remote SoundFont and a base64-MIDI converted from the MusicXML. **One yellow caveat**: snare and hi-hat will play as whatever SoundFont assigns to channels 1/2 (likely piano-family instruments), not as actual percussion sounds, because music21 only routes BassDrum to channel 10.

If the user-side eyeball confirms kick plays correctly but snare/hihat sound like piano, that's the snare/hihat MIDI routing finding from §3.

## §7 Recommended next step

Based on §3 and §6:

**Primary next-up**: a follow-up forge-music drain that switches `drums_shuffle.md` to use `note.Unpitched` instead of `note.Note('C4')`. Same beat positions, same Parts, same `voices()` call — only the per-hit note constructor changes. Re-run the MusicXML inspection; expect `<unpitched>` elements and `<percussion>` clef directive to appear. Re-eyeball in Obsidian to confirm Verovio now renders X noteheads on a percussion clef.

**Secondary**: a forge-music or forge-core drain that fixes music21's MIDI channel routing for the non-kick drums. Music21 sets MIDI channel from the per-instrument `midiChannel` attribute. For `instrument.SnareDrum()`, music21's default is `midiChannel = 1`. The snippet can override via `inst.midiChannel = 10` before building the part. Cheap fix; could land alongside the `note.Unpitched` work in one combined drain.

**Tertiary (out of v0.2.x scope)**: if the user wants drums in the actual blues song, `song.md` would call `voices(form, vocal_phrase_a, ..., drums_shuffle)` to overlay the drum pattern under each chorus. Architecturally fits with the existing `voices()` composition pattern; the only design question is whether to repeat `drums_shuffle` once per chorus (3x) or have it return a 48-bar pattern matching the song length.

**Stop conditions** (no further work needed): if the user-side eyeball reports that the v0.3.5 spike renders acceptably AS-IS (e.g., treble-clef-with-C4-notes is musically readable enough for prototyping purposes), the `note.Unpitched` follow-up can be deferred indefinitely.

## §8 Smoke split

**Auto-verified by CC:**
- Snippet authored + bundle mirror diff clean.
- Engine test added (430 passed, 4 skipped).
- Plugin suite 161/161.
- MusicXML inspection script run (verbatim output captured in §3).
- Plugin playback grep complete (output captured in §4).
- forge-music v0.3.5 tagged + pushed.
- Plugin v0.2.33 built + tagged + pushed + GH released. SHA round-trip clean.
- Engine-bundle drift preflight clean at release-zip.
- Clean-vault smoke: drums_shuffle in zip, manifest at 0.2.33, vault at 0.3.5.

**Deferred to user (Obsidian-context, load-bearing for spike outcome):**
- `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm `Installed forge-client-obsidian v0.2.33`.
- Delete `~/forge-vaults/test1/forge-music/` so the new bundle re-extracts on relaunch (the recurring `ensureBundledForgeMusic` short-circuit pain point — item #1 in the post-success queue).
- Cmd-Q + reopen Obsidian.
- Confirm `~/forge-vaults/test1/forge-music/blues/drums_shuffle.md` appears in the file tree.
- Open it, Forge-click. **Eyeball the rendered output**:
  - Clef: percussion, treble, or other?
  - Noteheads: X-shaped or regular ovals?
  - Layout: one stave or three separate staves?
  - Visually readable, ugly-but-comprehensible, or broken?
- Click the play button on the `<midi-player>` widget. **Listen**:
  - Audible (any sound)?
  - Kick on beats 1+3 — recognizable kick sound, or melodic-sounding C?
  - Snare on beats 2+4 — actual snare, or melodic-sounding C?
  - Hi-hat on every beat — hi-hat sound, or melodic-sounding C?

## §9 Follow-ups noted but not built

This drain surfaced two specific follow-ups:

1. **note.Unpitched migration** (forge-music; primary recommended next-up per §7).
2. **MIDI channel routing fix for SnareDrum + HiHatCymbal** (forge-music or forge-core; secondary per §7).

Plus the standing queue from v0.2.32 feedback (items 1-8 there are unchanged — auto re-extract, DOMAIN_AVAILABILITY, micropip rider, sync-bundles, scope-filter triplication, HTTP fallback collapse, allowlist audit, forge.installer-exclusion grep).

**New observation**: the v0.2.32 feedback's item #1 (auto re-extract on forge.toml change) is now extra-relevant because the spike requires the user to manually delete `~/<vault>/forge-music/` to see the new `drums_shuffle.md` after install. Same pain point.

## §10 Protocol comments for driver

1. **Spike-shape prompts work well.** The 3-unknown investigation framing produced 3 concrete answers (yellow / red-preliminary / green). User-side eyeball is gated cleanly — the call on rendering correctness is theirs, not CC's. Pattern worth keeping: "small isolated artifact + bounded investigation + decision-tree report → user makes the call."

2. **The MusicXML inspection script was the load-bearing tool.** Without it, the spike would have shipped a snippet, told the user to eyeball, and waited for the answer to all three unknowns. With it, CC pre-answered 2 of 3 (metadata shape, playback path) and reduced the user's job to the visual eyeball only. Worth codifying: "for any rendering/output-format spike, ship the format-inspection script in the same drain as the artifact."

3. **Version-number drift between prompt-author and CC**: prompt said v0.2.30 → v0.2.30; actual current was v0.2.32. CC bumped to v0.2.33. Same shape as the v0.2.30 freeze drain's mid-renumber. Reinforces: prompt version numbers are advisory, CC determines actual from current manifest. No new protocol needed; this drain just validates the existing convention.

4. **`html-midi-player` + remote SoundFont path is a pre-existing closed-beta network dependency** I hadn't seen called out before. The closed-beta plugin's `INSTALL.md` says "everything bundled locally" but that's strictly true only for the Pyodide-compute path. Audio playback requires a network fetch to `storage.googleapis.com/magentadata/...` on first play. Worth surfacing in INSTALL.md (a "Playback requires network on first play" note) or as a forge-core follow-up to bundle a small SoundFont locally. Not blocking; flag.

5. **forge-music v0.3.5 + plugin v0.2.33 makes 13 versions today.** Spike-release pace was sustainable because of the v0.2.30-eng drift check (clean preflight every release) + the v0.2.32 manifest-imports fix (registry scan stays healthy). The infrastructure investments compound.

## §11 Constitutional alignment

Per cowork-protocol's §"Constitution co-gatekeeper role" four-level disposition:

**Level 1 — Silent approve.** Pure content addition (one new action snippet); no new architectural concept, no engine-side behavior change. Existing F-series (freeze), A-series (resolution + shadows), B-series (snippet contract) all hold without modification.

No constitution amendment needed for this drain. If the user's eyeball produces a "we want real drum-kit notation, fix it" outcome, the follow-up `note.Unpitched` drain is also Level 1 (still content-only).
