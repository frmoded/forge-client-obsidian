---
timestamp: 2026-06-26T12:00:00Z
session_id: drain-2026-06-26-1200
status: pending
priority: MEDIUM — fun-category music feature; not publish-blocker
---

# v0.2.145 (renumber to current) — Kit notation engraving fix (Unpitched migration) + Phase B integration

## §0 — Driver spike findings (2026-06-26)

Driver ran the Verovio rendering spike against a hand-built kit-notation Score (1-bar rock pattern: kick on 1+3, snare on 2+4, closed hi-hat eighths). Spike snippet content:

```python
def compute(context):
    from music21 import stream, note, clef, meter
    score = stream.Score()
    kit_part = stream.Part()
    kit_part.append(clef.PercussionClef())
    kit_part.append(meter.TimeSignature('4/4'))
    v1 = stream.Voice(id='1')
    for i in range(8):
        n = note.Note('G2', quarterLength=0.5)
        n.notehead = 'x'
        n.stemDirection = 'up'
        v1.insert(i * 0.5, n)
    for beat in [1, 3]:
        n = note.Note('E2', quarterLength=1)
        n.stemDirection = 'up'
        v1.insert(beat, n)
    v2 = stream.Voice(id='2')
    for beat in [0, 2]:
        n = note.Note('B1', quarterLength=1)
        n.stemDirection = 'down'
        v2.insert(beat, n)
    kit_part.insert(0, v1)
    kit_part.insert(0, v2)
    score.insert(0, kit_part)
    return score
```

Render result (per driver's screenshot):

| Checkpoint | Result |
|---|---|
| A. Percussion clef visible | ✓ PASS |
| B. X-noteheads for hi-hat | ✓ PASS |
| C. Voice stem direction (hands up / feet down) | ✗ FAIL — all stems pointed down |
| D. Note positions match drum-kit convention | ✗ FAIL — all notes rendered below the staff at their literal pitch positions |

Outcome category per v0342 prompt §10: **MODERATE failures** — split off Verovio engraving improvements drain.

## §1 — Root cause hypothesis

Verovio uses standard pitch-to-staff-position mapping for the percussion-clef staff: every note's literal pitch (B1, E2, G2) places it according to absolute pitch, not according to standard drum-kit positions. Since all three pitches sit in a low octave, all notes render at low staff positions.

The MusicXML standard for unpitched-percussion notation uses `<unpitched>` elements with `<display-step>` and `<display-octave>` tags — those say "this is unpitched percussion; render at THIS staff position regardless of underlying pitch." Verovio honors these tags.

music21's `note.Note` class serializes to `<note>` with `<pitch>` (real pitch, real position). music21's `note.Unpitched` class serializes to `<note>` with `<unpitched>` (display position, no pitch). `Unpitched` is the right class for drum-kit notation.

v0.2.143's `to_kit_notation` uses `Note` with literal pitches — that's why rendering fails. Migrate to `Unpitched` with explicit display positions.

The voice stem-direction failure (Checkpoint C) likely resolves once positions are correct — Verovio's auto-stemming on a percussion-clef staff respects voice membership when notes don't conflict in position.

## §2 — Investigation phase (per §78)

### §2.1 — music21 Unpitched API verification

Confirm the music21 `Unpitched` class shape:

```bash
cd ~/projects/forge
python -c "from music21 import note; u = note.Unpitched(displayName='G4'); print(u); print(u.displayName); print(u.duration)"
```

Expected: `Unpitched` instance with `displayName`, `displayOctave`, `displayPitch` attributes. Constructor accepts at least `displayName=` (e.g., `'G4'`).

Cross-check whether `displayName` is a position string ('G4' = G in octave 4) or something else. music21 docs: `displayName` is a pitch-string that determines the staff position; it's parsed as if it were a normal pitch but doesn't carry MIDI semantics.

If `Unpitched` signature differs from this hypothesis, surface and adjust. Likely safe.

### §2.2 — MusicXML output verification

```bash
python -c "
from music21 import stream, note, clef, meter
s = stream.Stream()
s.append(clef.PercussionClef())
s.append(meter.TimeSignature('4/4'))
u = note.Unpitched(displayName='G5')
u.notehead = 'x'
s.append(u)
print(s.write('musicxml').read_text() if hasattr(s.write('musicxml'), 'read_text') else open(s.write('musicxml')).read())
" | grep -A2 'unpitched\|display-step\|display-octave'
```

Expected: output contains `<unpitched>` tag with `<display-step>` and `<display-octave>` child elements. If not, the Unpitched class isn't serializing as expected and we need a different approach.

### §2.3 — Display-position-to-staff mapping

In standard drum-kit notation on a 5-line staff with treble-clef-style position convention (used by Verovio for percussion clef):

| Instrument | Display position | Voice |
|---|---|---|
| Kick | F4 (just below staff, between 3rd and 4th leger lines below) — or E4 (just below the bottom line) | 2 (down) |
| Snare | C5 (3rd space — between 2nd and 3rd lines from top) | 1 (up) |
| Closed hi-hat | G5 (above staff — first leger line above) | 1 (up) |
| Open hi-hat | G5 + open-marking | 1 (up) |
| Pedal hi-hat | D4 (below staff) | 2 (down) |
| Low tom | A4 (3rd space from bottom) | 1 (up) |
| Mid tom | D5 (4th line — middle-upper area) | 1 (up) |
| High tom | E5 (top space) | 1 (up) |
| Crash | A5 (above staff, higher than hi-hat) | 1 (up) |
| Ride | F5 (top line) | 1 (up) |

(Standard kit notation conventions per the Hal Leonard Drum Method + the percussion engraving guidelines used by MuseScore/Finale defaults.)

Note: these are DISPLAY positions on a treble-clef-conceptual staff. The percussion clef in Verovio + the `<unpitched>` element + the `<display-step>` / `<display-octave>` tags combine to produce standard kit positioning.

### §2.4 — Source-Instrument preservation

`Unpitched` notes don't carry a default music21 Instrument. The v0.2.143 fix preserved source Instrument via `note.editorial.misc['forge_source_instrument']`. The Unpitched-based rewrite should preserve the SAME storage approach.

MIDI export walks per-note Instrument context via `editorial.misc`. The §2 spike on a piece (e.g. murmuration) should verify MIDI playback still works after the migration.

## §3 — Engine implementation

### §3.1 — Refactor `to_kit_notation` (forge/forge/music/lib.py)

For each source percussion note:
- Look up the (Instrument class, percMapPitch) in `_KIT_NOTATION_MAP` (unchanged structure).
- Get the display position (string like `'F4'`) and voice number (1 or 2) and notehead style.
- Build `note.Unpitched(displayName=display_position, quarterLength=src_note.quarterLength)`.
- Copy `note.id` to `unpitched.id` (preserves click-to-play).
- Copy source Instrument reference to `unpitched.editorial.misc['forge_source_instrument']`.
- Set `unpitched.notehead = notehead_style` (`'normal'`, `'x'`, or `'circle-x'`).
- Set `unpitched.stemDirection = 'up' if voice == 1 else 'down'`.
- Insert at `unpitched.offset = src_note.offset` (preserve timing).

Update `_KIT_NOTATION_MAP` with the new display-position values from §2.3 (replace the current pitch values like 'B1' with treble-clef display positions like 'F4').

### §3.2 — Existing tests update

The 12 pytest tests in `tests/music/test_kit_notation.py` likely assert pitch-based properties (e.g., "kick note's pitch is B1"). Update them to assert Unpitched-based properties:
- Kick voice-2 note → `isinstance(n, Unpitched)` and `n.displayName == 'F4'` (or whatever the chosen position).
- Snare → display G... wait actually let me re-check. Anyway, CC fills in the right assertions based on §2.3.

Plus 2 new tests:
- `test_to_kit_notation_uses_unpitched_class` — output Part contains only Unpitched instances (no Note instances).
- `test_to_kit_notation_serializes_with_display_step` — round-trip through musicxml serialization includes `<display-step>` tags.

### §3.3 — Backward compat

The Python signature of `to_kit_notation(score) -> stream.Score` stays unchanged. Internal change only. Plugin doesn't need to know about Unpitched vs Note — it just serializes the returned Score to MusicXML.

## §4 — Plugin Phase B integration (carry-forward from v0.2.143)

Per v0.2.143 feedback §3, the deferred Phase B:

### §4.1 — Pyodide-host dual MusicXML production

In `pyodide-host.ts`'s embedded Python (`_forge_run_snippet` or sibling), after `compute()` returns the canonical Score:

```python
canonical_score = compute_result  # ... existing flow
multi_staff_xml = canonical_score.write('musicxml').read_text()

has_perc = has_percussion(canonical_score)
kit_xml = None
if has_perc:
    kit_score = to_kit_notation(canonical_score)
    kit_xml = kit_score.write('musicxml').read_text()

return {
    'multi_staff_xml': multi_staff_xml,
    'kit_xml': kit_xml,
    'has_percussion': has_perc,
    # ... rest of return shape ...
}
```

### §4.2 — `verovio.ts` view-mode-aware rendering

`renderMusicXMLAndMIDI` accepts a `viewMode: 'multi_staff' | 'kit'` parameter. Picks the right XML from the result dict.

### §4.3 — Output-view toolbar button

Top-right of the Forge Output pane:
- Visibility: only if `result.has_percussion === true`.
- Initial label: `'🥁 Kit'` if current view is `multi_staff`; `'🎼 Multi-staff'` if current view is `kit`.
- Click: toggle via `toggleScoreViewMode` (v0.2.143 pure-core), re-render with the other XML, update label.

### §4.4 — Initial view on snippet open

```typescript
const currentMode = readScoreViewMode(localStorage, file.path, 'multi_staff');
renderMusicXMLAndMIDI(scoreData, currentMode, file.path);
```

### §4.5 — MIDI export unchanged

Always canonical multi-instrument. Per v0342 §1.4 driver decision. Document inline.

### §4.6 — MusicXML export matches current view

Per v0342 §1.5 driver decision.

### §4.7 — Click-to-play preservation

After kit-rendering, verify v0.2.140 click-to-play still works. Depends on `note.id` preservation (already in §3.1). User-side smoke verifies end-to-end.

## §5 — Tests + smoke

### §5.1 — Engine pytest

Updated 12 + 2 new tests = 14 total. Pure-core, run by engine repo's runner.

### §5.2 — Plugin pure-core tests

`view-mode-core.ts` already shipped in v0.2.143 with 20 tests. No changes needed; tests continue passing.

### §5.3 — User-side smoke

```
# 1. BRAT update to v0.2.145.
# 2. Open ~/forge-vaults/forge-music/percussion/murmuration.md (or equivalent).
# 3. Forge-click.
# 4. Multi-staff renders by default (regression guard for the existing pipeline).
# 5. Click 🥁 Kit toolbar button.
# 6. Score re-renders in kit notation.
# 7. CHECK CHECKPOINTS A-D again:
#    A. Percussion clef visible.
#    B. X-noteheads for hi-hat.
#    C. Stems up for snare/hi-hat; stems down for kick.
#    D. Notes at standard kit positions (hi-hat above staff, snare middle, kick below).
# 8. Click any rendered note → corresponding instrument plays (click-to-play).
# 9. Switch to 🎼 Multi-staff → score returns to canonical layout.
# 10. Close + reopen Obsidian → last-chosen view persists per-snippet.
# 11. Open percussion_lab/solitary.md → default view (multi-staff) for unvisited snippets.
```

If checkpoints A-D all PASS this time, Phase B is verified. If any FAIL, surface for follow-up (engraving improvements might need more work, or specific display-position values need tuning).

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 + §2.2 verify music21 Unpitched API + MusicXML output before coding.
- ✓ §57–74 (TDD): updated + new failing-first tests.
- ✓ §86–118 (pure-core convention): engine refactor stays in `to_kit_notation`; no new helpers needed.
- ✓ §76 (don't ship speculative fix): driver-spike confirmed the failure shape; this is the targeted fix.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: no new catches.
- ✓ v0.2.124 pure-core dispatch HARD RULE: pure-core unchanged at the public API level.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: driver spike IS the runtime evidence that gated this drain.
- ✓ v0.2.134 §5 inlined-version preflight: runs automatically.
- ✓ v0.2.144 bundled-vault bump preflight: runs automatically; not relevant here (no vault content changes).

## §7 — Open follow-ups + carry-forward

1. **Dynamic mark anchoring** (v0.2.143 §3.5 carry-forward): still deferred unless a smoke uncovers user-visible issues.
2. **`score_style:` frontmatter override** (v0342 §8 #1): defer until toolbar-only friction observed.
3. **Per-rendering MusicXML lazy compute** (v0342 §8 #2): defer until perf observed.
4. **Cohort doc update** (v0342 §8 #4): defer until forge-music gets a cohort doc.
5. **Multi-staff vs kit default per snippet type** (potential future): smart-default based on snippet path (`percussion_lab/*` → multi-staff, `percussion/*` → kit). Not needed for v1; user toggles per-snippet.

## §8 — Architectural framing

V1 music-domain feature. Fun-category, not publish-blocker. The Unpitched migration is also a quality improvement for any future percussion engraving work — the music21 Note vs Unpitched distinction is real and affects all kit-notation-style outputs.

The pattern of canonical Score → multiple renderings (multi-staff, kit) generalizes for future view modes.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order:
1. §2.1 + §2.2 spike verification (~15 min).
2. §3.1 engine refactor + §3.2 test updates (~60-90 min).
3. §4 plugin Phase B integration (~60-75 min).
4. §5.3 user-side smoke handoff.

Total estimated CC time: 2.5-3.5 hours.

If §2.1 or §2.2 spike surfaces that music21's Unpitched API doesn't produce the expected MusicXML output, surface and adjust the approach (e.g., use raw `<unpitched>` injection via music21's MusicXML write hooks). If the issue is deeper, split: ship the engine refactor (v0.2.145) without Phase B; queue Phase B for v0.2.146.

Driver spike file `~/projects/forge-music/_P.md` has been cleaned up.
