<!-- author: forge-music-cowork
     second-pass review: not requested
     focus: Pure music-domain spike (one new snippet + investigation).
     Engine/constitution surface untouched. If spike findings prompt
     forge-core follow-ups (audio playback wiring, Verovio percussion
     renderer polish), those land as separate prompts. -->

# Drums shuffle spike — single isolated snippet to validate Verovio percussion rendering + audio playback availability

## Scope

Author one new music snippet `~/projects/forge-music/blues/drums_shuffle.md` — a 12-bar shuffle pattern in 12/8 with kick + snare + hi-hat — and use it to answer three unknowns about percussion in forge-music. Bundle the new snippet into the v0.2.30 plugin release so the user can Forge-click it in Obsidian for the visual eyeball.

What this prompt does NOT do:
- Integrate the drums snippet into `blues/chorus.md`, `blues/solo_chorus.md`, or `blues/song.md`. The spike is isolated.
- Add `forge-music-core` drum helpers (`shuffle_drums()`, `straight_eighths_drums()`, etc.). Spike informs whether these are worth building.
- Add new prompt-fragment rules about percussion. Spike informs what's worth writing.
- Ship audio-playback wiring even if a gap is found. Surface as forge-core follow-up.
- Ship Verovio percussion-renderer polish even if rendering degrades. Surface as forge-core follow-up.

## Why

v0.2.29 closed the music-domain plumbing arc; the music vault is now ready for new content. The user asked about drums as the next concrete feature. Three unknowns warrant a small spike before committing to scope:

1. **Verovio percussion rendering quality.** Does Verovio render music21's percussion-instrument metadata with correct conventions (percussion clef, X noteheads, 1-line staves)? Or does it degrade to regular noteheads on a treble staff?
2. **Playback availability in the plugin.** Does any "play this score" affordance exist? If not, drums-on-paper are mute and the value proposition shifts substantially.
3. **music21 percussion API ergonomics.** Does music21 emit a drum kit as ONE stave with three voices, or THREE separate staves? Affects the content-shape decision for future drum snippets.

The spike's deliverable answers all three with a single isolated snippet + a user eyeball + a structured findings report. ~30-45 min of CC work + ~5 min of user eyeball gets us a decision-tree outcome that informs whether to invest in renderer polish, audio playback, drum-kit helpers, or stop entirely.

## Files to modify

- **Create:** `~/projects/forge-music/blues/drums_shuffle.md` — new snippet.
- **Mirror:** `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/drums_shuffle.md`.
- **Bump:** `~/projects/forge-music/forge.toml` 0.3.4 → 0.3.5.
- **Bump:** `~/projects/forge-client-obsidian/manifest.json` 0.2.29 → 0.2.30.
- **Read-only (investigation):** `~/projects/forge-client-obsidian/src/` and `~/projects/forge-client-obsidian/assets/` — grep for any audio/MIDI/playback code path.
- **Tests:** `~/projects/forge/tests/music/test_blues_content_invariants.py` — add 1 test case asserting `drums_shuffle` computes to a valid Score with bars summing to 6.0 quarterLength.

## Implementation notes

### Step 1: Author `drums_shuffle.md`

**English facet:**

```
A 12-bar shuffle drum pattern in 12/8, the rhythmic backbone of a slow
blues. Kick on beats 1 and 3 (the downbeats); snare on beats 2 and 4
(the backbeats); hi-hat on every dotted-quarter beat (the four-count
that anchors the swing feel). No melodic content — pure percussion.

Returns a Score with one or more Parts containing the three percussion
voices: kick (`instrument.BassDrum`), snare (`instrument.SnareDrum`),
and hi-hat (`instrument.HiHatCymbal`).

Whether music21 emits these as one drum-kit stave with three voices,
or three separate staves, is a spike outcome — the snippet uses the
natural music21 API and accepts whatever shape comes out.
```

**Python facet:**

```python
def compute(context):
    # Pre-injected globals: music21, stream, note, chord, meter, tempo,
    # pitch, duration, instrument, harmony, roman + lib helpers.
    ts = meter.TimeSignature('12/8')
    bar_ql = ts.barDuration.quarterLength  # 6.0

    # Shuffle hit positions per bar (in 12/8, each bar = 12 eighth notes
    # = 4 dotted-quarter beats, each beat = 3 eighth notes):
    # Beat 1 = position 0, Beat 2 = position 3, Beat 3 = position 6, Beat 4 = position 9.
    # Eighth note = quarterLength 0.5.
    KICK_BEATS  = [0, 6]       # downbeats (beats 1, 3)
    SNARE_BEATS = [3, 9]       # backbeats (beats 2, 4)
    HIHAT_BEATS = [0, 3, 6, 9] # every dotted-quarter beat

    def make_drum_part(inst, hit_positions, label):
        """Build a 12-bar Part for one drum, with note.Note() at each hit
        position (eighth-note unit) and rests filling the rest of each bar.

        Note: using note.Note() rather than note.Unpitched() to start —
        music21 percussion notation often uses standard noteheads with
        the percussion-instrument metadata directing the renderer. If
        Verovio output is wrong, the spike finding is to investigate
        note.Unpitched + custom notehead in a follow-up.
        """
        part = stream.Part()
        part.append(inst)
        for bar_idx in range(12):
            m = stream.Measure(number=bar_idx + 1)
            if bar_idx == 0:
                m.append(ts)
            # Build the bar as a sequence: insert hits, fill gaps with rests.
            positions = sorted(hit_positions)
            cursor = 0
            for pos in positions:
                gap = pos * 0.5 - cursor  # convert eighth position to quarterLength
                if gap > 0:
                    m.append(note.Rest(quarterLength=gap))
                    cursor += gap
                hit = note.Note('C4')  # placeholder pitch; percussion-instrument metadata directs the renderer
                hit.duration = duration.Duration(0.5)
                m.append(hit)
                cursor += 0.5
            # Pad the rest of the bar.
            remaining = bar_ql - cursor
            if remaining > 0:
                m.append(note.Rest(quarterLength=remaining))
            part.append(m)
        return part

    kick = make_drum_part(instrument.BassDrum(), KICK_BEATS, 'kick')
    snare = make_drum_part(instrument.SnareDrum(), SNARE_BEATS, 'snare')
    hihat = make_drum_part(instrument.HiHatCymbal(), HIHAT_BEATS, 'hihat')

    # voices() combines parts simultaneously; if music21/Verovio render
    # this as one drum-kit stave that's a finding, if three separate
    # staves that's also a finding.
    return voices(kick, snare, hihat)
```

The `'C4'` placeholder pitch is intentional — music21's pitched-note API requires *some* pitch; the percussion-instrument metadata on the part directs the renderer to use percussion notation. If Verovio honors the metadata, you'll see X noteheads on a percussion staff; if it doesn't, you'll see C4 noteheads on a treble staff. Either is a spike finding.

### Step 2: Smoke compute returns a valid Score

Add a single test case in `~/projects/forge/tests/music/test_blues_content_invariants.py`:

```python
def test_drums_shuffle_returns_valid_score(run_music_block):
    """v0.3.5 spike: drums_shuffle computes to a Score with at least one
    Part. Bars sum to 6.0 quarterLength per the 12/8 invariant. Detailed
    rendering quality is a user-side eyeball, not a suite assertion."""
    result = run_music_block("drums_shuffle")
    assert isinstance(result, stream.Score)
    parts = list(result.parts)
    assert len(parts) >= 1, "drums_shuffle should produce at least one Part"
    # For each part, every measure must total exactly bar_ql.
    for part in parts:
        for m in part.getElementsByClass(stream.Measure):
            total = sum(el.duration.quarterLength for el in m.notesAndRests)
            assert abs(total - 6.0) < 1e-6, (
                f"part {part.id} measure {m.number} total = {total}, expected 6.0"
            )
```

Run `pytest -q tests/music/test_blues_content_invariants.py`. Confirm the new case passes.

### Step 3: Inspect the MusicXML output programmatically

After `compute()` produces a Score, serialize it to MusicXML and inspect for percussion-instrument metadata. In a one-off script (capture output in feedback, do not commit the script):

```python
from forge.tests.music._helpers import run_music_block
from music21 import musicxml

score = run_music_block("drums_shuffle")
xml = musicxml.m21ToXml.GeneralObjectExporter(score).parse()
# Convert bytes/ElementTree to text and search for key markers.
text = xml.decode('utf-8') if isinstance(xml, bytes) else str(xml)

# Report counts of key markers:
markers = ['<score-instrument', '<instrument-name', '<midi-instrument',
           '<midi-channel', '<midi-program', '<percussion', '<unpitched',
           'notehead', 'clef', '<sign>percussion</sign>']
for marker in markers:
    print(f"{marker}: {text.count(marker)} occurrences")

# Capture a representative excerpt (first 60 lines or so) for the feedback file.
print("---")
print('\n'.join(text.splitlines()[:60]))
```

Capture the full output in feedback under §3 "MusicXML metadata inspection." If specific markers are absent, that's the spike finding — Verovio can't render what music21 didn't emit.

### Step 4: Search the plugin for any audio/MIDI/playback code path

```bash
cd ~/projects/forge-client-obsidian
grep -rln 'midi\|MIDI\|audio\|sound\|playback' src/ 2>&1 | head -20
grep -rln 'webAudio\|AudioContext\|playMidi' src/ assets/ 2>&1 | head -20
ls assets/ | grep -iE 'audio|midi|sound|sf2'  # any bundled SoundFont?
```

Capture the full grep output in feedback under §4 "Plugin playback path investigation." Report the disposition: no audio path at all / partial path / functional path.

### Step 5: Bundle mirror

```bash
cp ~/projects/forge-music/blues/drums_shuffle.md \
   ~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/drums_shuffle.md
diff ~/projects/forge-music/blues/drums_shuffle.md \
     ~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/drums_shuffle.md
```

Diff should produce no output. The engine-bundle drift check (added in v0.2.30 forge-core drain) plus the build preflight should also pass — confirm with `npm run release-zip`.

### Step 6: Version bump + release

- Bump `~/projects/forge-music/forge.toml` 0.3.4 → 0.3.5; tag `v0.3.5` in `forge-music`.
- Bump `~/projects/forge-client-obsidian/manifest.json` 0.2.29 → 0.2.30.
- Build release zip: `cd ~/projects/forge-client-obsidian && npm run build && npm run release-zip`.
- Clean-vault smoke per cc-prompt-queue §141: fresh tmpdir, extract zip, assert `assets/vaults/forge-music/blues/drums_shuffle.md` is present, manifest at v0.2.30.
- `gh release create v0.2.30` with the zip + SHA round-trip.

## Tests

**Auto-verifiable by CC (run all; report results):**

- `pytest -q tests/music/test_blues_content_invariants.py` — new `test_drums_shuffle_returns_valid_score` case passes.
- `pytest -q` (full suite) — count grows by 1 (was 429+4 skipped in v0.2.29).
- `npm test` in forge-client-obsidian — count unchanged (no plugin-side tests for the spike).
- Bundle-mirror diff: source `drums_shuffle.md` byte-equal to bundled copy.
- Engine-bundle drift check (new in v0.2.30 forge-core drain): `npm run release-zip` preflight passes clean.
- Clean-vault smoke: unzip into tmpdir, confirm drums_shuffle present, manifest at 0.2.30.
- MusicXML metadata inspection output (one-off script, captured in feedback §3).
- Plugin playback path grep output (captured in feedback §4).

**Deferred to user (Obsidian-context — this is the load-bearing user side of the spike):**

- Install plugin v0.2.30 via `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh`. Confirm version 0.2.30.
- Delete extracted `~/forge-vaults/test1/forge-music/` so the new bundle re-extracts on relaunch.
- Full Obsidian relaunch (Cmd-Q + reopen — not just reload — per the recurring `ensureBundledForgeMusic` short-circuit).
- Confirm `~/forge-vaults/test1/forge-music/blues/drums_shuffle.md` appears in the file tree.
- Forge-click `drums_shuffle.md` → click **Forge** ribbon icon.
- **Eyeball the rendered output:**
  - Is there a percussion clef visible, OR a regular treble/bass clef?
  - Are noteheads X-shaped (percussion convention) OR regular oval noteheads?
  - One stave with three voices stacked, OR three separate staves stacked vertically?
  - Visually musically readable, ugly-but-comprehensible, or broken?
  - Report what you see (text description fine; screenshot if convenient).

## Out of scope

- Integration of `drums_shuffle` into `chorus.md`, `solo_chorus.md`, or `song.md`. Single isolated snippet only.
- `forge-music-core` drum-pattern helpers (`shuffle_drums`, `swing_drums`, etc.).
- New rules in `MUSIC_PROMPT_FRAGMENT` about percussion.
- Audio playback feature work — if §4 finds the plugin has no playback path, surface as forge-core follow-up; do NOT build it in this prompt.
- Verovio percussion-renderer polish — if user-side eyeball finds rendering degraded, surface as forge-core follow-up; do NOT build it in this prompt.
- Other percussion instruments (cymbals, toms, tambourine, etc.). Spike is kick + snare + hi-hat only.
- Different drum patterns (straight eighths, breakbeat, half-time, etc.). One shuffle pattern only.

## Report when done

Standard cc-prompt-queue.md feedback structure, plus:

**§1 — Snippet authored.** Final Python facet + English facet shown inline. Bundle mirror diff confirmation.

**§2 — Suite results.** `pytest -q tests/music/test_blues_content_invariants.py` verbatim output (the new test case passing). Full-suite `pytest -q` verbatim. `npm test` verbatim.

**§3 — MusicXML metadata inspection** (the load-bearing CC-side finding). Verbatim output of the one-off inspection script: marker counts + the first ~60 lines of MusicXML showing the percussion-instrument metadata (or its absence).

**§4 — Plugin playback path investigation.** Verbatim grep output. One-line disposition: no audio path / partial path / functional path. If functional, identify which file(s) implement it.

**§5 — Release artifacts.** Zip path, size, SHA-256, GH Release URL, SHA round-trip. Clean-vault smoke output.

**§6 — Spike decision-tree position.** Based on §3 + §4 findings, the CC-side green/yellow/red call on each of:
- (a) music21 emits percussion-instrument metadata: green / yellow / red.
- (b) MusicXML structure suggests Verovio will render correctly: green / yellow / red (this is preliminary — user eyeball is authoritative).
- (c) Plugin has audio playback path for the drums: green (functional) / yellow (partial — describe what's missing) / red (no path at all).

Visual rendering quality (the user-eyeball outcome) goes in MY review answer after CC ships, not in CC's feedback.

**§7 — Recommended next step.** Based on §6, CC's recommended forge-music or forge-core next prompt.

**§8 — Smoke split.** Auto / deferred enumerated.

**§9 — Follow-ups noted but not built.** Anything CC noticed but didn't act on (renderer-polish hints, audio-playback gaps, drum-helper sketches).

## Don'ts

- **Don't expand scope into integration** with chorus/solo_chorus/song. Single isolated snippet.
- **Don't ship audio playback work** even if you find a clean place to add it. Surface as follow-up.
- **Don't add `forge-music-core` helpers.** Spike informs whether they're worth building.
- **Don't add `MUSIC_PROMPT_FRAGMENT` rules about percussion.** Spike informs what's worth writing.
- **Don't shape the snippet around what you'd want Verovio to do.** Use the natural music21 API; whatever Verovio renders is the finding.
- **Don't use `note.Unpitched` in this spike.** Standard `note.Note('C4')` + percussion-instrument metadata is the v1 attempt; if it fails to render correctly, the follow-up explores `note.Unpitched`. Two unknowns at once is too many.
- **Don't skip the clean-vault smoke before tagging.** Release-shipping rule.
- **Don't run any destructive git op.** Standard commits + tag + push + GH release.
