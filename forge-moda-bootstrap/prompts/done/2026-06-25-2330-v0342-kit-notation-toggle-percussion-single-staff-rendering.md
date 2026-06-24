---
timestamp: 2026-06-25T23:30:00Z
session_id: drain-2026-06-25-2330
status: pending
priority: MEDIUM — music-domain feature; unblocks drum compositions reading as drum charts
---

# v0.2.143 (renumber to current) — Kit-notation rendering toggle for percussion (single-staff drum-kit view)

## §0 — Goal

Add an alternative score rendering for percussion: standard drum-kit single-staff notation (kick below staff, snare middle line, hi-hat above, cymbals above, toms scattered, stems-up for hands and stems-down for feet), as a TOGGLE between today's multi-staff layout (`voices_canonical`) and the new kit layout.

Driver pivoted to forge-music (drums first). Today's 7-staff percussion layout is great for percussion_lab vocabulary inspection but makes compositions like `percussion/murmuration.md` (30+ bars) span 3+ pages and look orchestral rather than drum-chart-like. Kit notation compresses to ~1 page and lets any drummer read it instantly.

This drain ships:
- An engine-side post-processor `to_kit_notation(score)` that folds percussion Parts into a single staff with multi-voice notation, preserving MIDI Instrument identity and music21 note IDs.
- A plugin-side toolbar button in the Forge Output pane to toggle multi-staff ↔ kit view.
- Per-snippet view-mode persistence via localStorage (reuses v0.2.138 pattern).
- MusicXML export matches current view; MIDI export unchanged (always canonical multi-instrument).

## §1 — Driver decisions (already made)

1. **UI placement**: output-pane toolbar button + localStorage persistence per snippet. Toggle reflows view without recompute.
2. **Default view mode**: `multi_staff` (conservative; zero regression for existing snippets). Users opt into kit via toggle.
3. **Mixed-instrument pieces**: kit notation is a percussion-Part transformation only. Non-percussion Parts (bass, guitar, etc.) pass through unchanged.
4. **MIDI export**: always canonical multi-instrument (channel 10, GM percussion pitches). Independent of view mode.
5. **MusicXML export**: matches current view (kit view → single-part MusicXML with voice-1/voice-2 split; multi-staff view → today's multi-part shape).

## §2 — Investigation phase (per §78)

### §2.1 — Verovio percussion-clef + x-notehead rendering quality (REQUIRED SPIKE)

Before committing to the full implementation, run a 30-min Verovio rendering spike:

1. Manually construct (in a Python REPL or test) a music21 Score with a single Part containing:
   - A `PercussionClef`
   - Two `Voice` objects
   - Voice 1: snare on middle line (E2, stems up), closed hi-hat above (G2, stems up, x-notehead via `noteheadType="x"`)
   - Voice 2: kick below staff (B1, stems down)
   - Mix: bar 1 = quarter notes alternating; bar 2 = sixteenths with kick on downbeats

2. Serialize to MusicXML via music21's `.write('musicxml')`.

3. Feed to the plugin's existing Verovio toolkit (`verovio.ts:renderMusicXMLAndMIDI`) and inspect the rendered SVG.

**Checkpoints**:
- Percussion clef visible at the start of the staff? (Verovio supports it; verify rendering.)
- X-noteheads render as X-shapes (not normal note heads)?
- Voice stems split correctly (snare/hihat stems up, kick stems down)?
- No off-staff position drift (everything sits where convention places it)?

If Verovio handles all 4 checkpoints cleanly → proceed with the full implementation.

If Verovio fails ≥1 checkpoint → surface and split. Options:
- A. Accept the rendering quirk; document.
- B. Add explicit Verovio engraving directives (font/clef config) to coax better output.
- C. Defer kit notation to a future drain pending Verovio improvements OR a different renderer.

Document the spike findings in feedback regardless of outcome.

### §2.2 — music21 note `id` preservation through transformation

The v0.2.140 click-to-play feature depends on stable SVG note IDs that map back to music21 notes. The kit post-processor MUST preserve `note.id` (a music21 attribute set on each Note instance) so click-to-play continues working.

Verify by:
1. Build a small Score with `note.id = "test_snare_bar_1_beat_1"` etc.
2. Pass through `to_kit_notation`.
3. Walk output Score; assert IDs match input.

If music21's voice-merging operations drop `id` (unlikely but possible), use `note.editorial.id` or a custom attribute as the carrier.

### §2.3 — Instrument identity preservation for MIDI

Each percussion Note has a music21 Instrument context (via `getInstrument()`). The v0.2.35 percussion factories (`kick()`, `snare()`, `closed_hihat()`, etc.) bind `_force_perc_channel` lambdas to ensure channel-10 routing.

The post-processor must preserve these Instrument bindings. Approach:
- Don't reassign instruments on the kit-staff notes; keep each note's existing Instrument reference.
- The single-staff Part is purely a VISUAL grouping; under the hood, music21 sees a Part containing notes from multiple Instruments.
- MIDI export walks the underlying notes, not the visual staff, so channel routing stays correct.

If music21 requires a single Instrument per Part (it may), use `UnpitchedPercussion` as the Part-level instrument and lean on per-note instrument metadata. Confirm in §2.1 spike.

## §3 — Engine implementation

### §3.1 — `to_kit_notation(score)` in `forge/forge/music/lib.py`

```python
def to_kit_notation(score: stream.Score) -> stream.Score:
    """v0.3.x — fold percussion Parts of a Score into a single staff with
    two voices (stems-up for hands, stems-down for kick), preserving
    music21 note IDs and per-note Instrument identity.
    
    Non-percussion Parts pass through unchanged.
    
    Returns a NEW Score; does not mutate the input.
    """
```

Algorithm:
1. Walk `score.parts`.
2. For each Part: check `part.getInstrument()` is an UnpitchedPercussion subclass.
   - If yes: collect into `percussion_parts` list.
   - If no: append unchanged to `output_score.parts`.
3. If `percussion_parts` is empty: return the score as-is (no percussion to fold).
4. Build kit staff:
   - Create new Part with PercussionClef.
   - Create Voice 1 (stems up): for each percussion Part's notes that map to hand instruments (snare, hihat, toms, cymbals), translate to kit-staff pitches.
   - Create Voice 2 (stems down): for each percussion Part's kick notes, translate to B1 (below-staff pitch).
   - Preserve `note.id` on each kit-staff note.
   - Preserve `note.editorial` and other metadata.
5. Apply kit-notation conventions:
   - Voice 1 notes: stems up (`note.stemDirection = 'up'`).
   - Voice 2 notes: stems down (`note.stemDirection = 'down'`).
   - X-noteheads for hihat/crash: `note.notehead = 'x'`.
   - Open-hihat marking: `note.notehead = 'circle-x'` or `note.articulations.append(...)`.
6. Dynamic mark consolidation:
   - Find each percussion Part's first dynamic mark (today: anchored on kick part's first note).
   - Re-anchor on the kit staff's voice 2 first note (kick stays the anchor).
   - If the source had per-instrument dynamics (rare in current snippets), document them in `note.editorial` for future kit-aware engraving.
7. Insert kit staff at the appropriate position (where the first percussion Part was).

### §3.2 — Pitch + notehead mapping table

Convention (Hal Leonard Drum Method reference):

| Instrument | music21 pitch | Staff position | Voice | Notehead |
|---|---|---|---|---|
| Kick | B1 | Space below staff | 2 (down) | normal |
| Snare | E2 | Middle line (3rd line) | 1 (up) | normal |
| Closed hi-hat | G2 | Above staff | 1 (up) | x |
| Open hi-hat | G2 | Above staff | 1 (up) | circle-x |
| Low tom | F2 | 2nd line up | 1 (up) | normal |
| Mid tom | A2 | 3rd space up | 1 (up) | normal |
| Crash cymbal | A2 | Above staff | 1 (up) | x (with optional sf marking) |

Hard-code as a dict in `lib.py` keyed by Instrument class name (`'BassDrum'`, `'SnareDrum'`, etc.). The v0.2.35 percussion factories already use these standard music21 classes.

### §3.3 — Public API additions

`forge/forge/music/lib.py`:
```python
def to_kit_notation(score: stream.Score) -> stream.Score:
    """Fold percussion Parts into a single-staff kit-notation Part."""
    ...

def has_percussion(score: stream.Score) -> bool:
    """Returns True if score has at least one UnpitchedPercussion Part.
    Used by the plugin to decide whether to show the kit-toggle button."""
    ...
```

`has_percussion` is the gate: the plugin shows the toggle button ONLY when this returns True.

### §3.4 — Tests required (TDD per §57–74)

In `tests/music/test_kit_notation.py` (new):

1. **No-op on percussion-less score**: a piano-only Score passes through unchanged (referential identity check; output Score is a new instance but Parts are same).
2. **Kick-only percussion**: input Part with only kick notes → output kit staff has voice 2 stems-down only, voice 1 empty.
3. **Snare-only**: voice 1 stems-up only, voice 2 empty.
4. **Multi-instrument**: kick + snare + closed_hihat → voice 1 has snare+hihat, voice 2 has kick. Hihat notes have notehead='x'.
5. **Mixed-instrument piece**: percussion Part + bass Part → output has [bass Part unchanged, kit Part]. Bass notes have no notehead change; kick is voice 2.
6. **Note `id` preservation**: input notes with `note.id = "test_x"` → output notes have same IDs.
7. **Instrument preservation**: input notes' Instrument references survive on output notes (verify via `.getInstrument()` returning original class).
8. **Dynamic mark anchoring**: input has 'mf' on first kick note → output has 'mf' on voice 2 first note.
9. **Two-voice ordering**: in the output Part, Voice 1 (stems up) precedes Voice 2 (stems down) in the part's `voices` list.
10. **`has_percussion` true case**: Score with percussion Part returns True.
11. **`has_percussion` false case**: piano-only Score returns False.
12. **Empty score**: empty Score returns False on `has_percussion`; passes through `to_kit_notation` unchanged.

Plus the §2.1 spike output documented as a manual verification step in feedback (no automated test for Verovio render quality).

## §4 — Plugin implementation

### §4.1 — `verovio.ts` — view-mode-aware rendering

Modify `renderMusicXMLAndMIDI` to accept a `viewMode` parameter:

```typescript
type ViewMode = 'multi_staff' | 'kit';

export async function renderMusicXMLAndMIDI(
  scoreMusicXML: string,
  viewMode: ViewMode,
  snippetPath: string,
): Promise<{ svg: string; midi: ArrayBuffer; ... }>
```

When `viewMode === 'kit'`:
- Before passing to Verovio, transform the MusicXML through a kit-notation conversion.
- The transformation can happen pyodide-side (engine produces both versions) OR JS-side (we have music21js if loaded, OR a lightweight MusicXML kit-fold). Choose pyodide-side for v1 (already have music21).

When `viewMode === 'multi_staff'`:
- Pass MusicXML as-is to Verovio (current v0.2.140 multi-page behavior preserved).

### §4.2 — Engine bridge: dual MusicXML production

The simplest path: engine computes BOTH the multi-staff MusicXML and the kit MusicXML in one compute, cache both, plugin picks which to render.

In `pyodide-host.ts`'s embedded Python (`_forge_run_snippet` or sibling):
```python
# After compute() returns the Score:
multi_staff_xml = serialize_to_musicxml(canonical_score)
kit_score = to_kit_notation(canonical_score) if has_percussion(canonical_score) else None
kit_xml = serialize_to_musicxml(kit_score) if kit_score else None

return {
    'multi_staff_xml': multi_staff_xml,
    'kit_xml': kit_xml,
    'has_percussion': has_percussion(canonical_score),
    # ... rest of return shape ...
}
```

The plugin receives both, picks one based on `viewMode`.

Alternative (lighter): compute only the current view; switch view triggers a Python call for the other. Saves Python-side time on initial render but adds round-trip on toggle. Pick whichever is simpler in code; the perf difference is small.

### §4.3 — `view-mode-core.ts` (NEW pure-core)

`src/view-mode-core.ts`:

```typescript
export type ScoreViewMode = 'multi_staff' | 'kit';

const STORAGE_PREFIX = 'forge:scoreView:';

export function readScoreViewMode(
  storage: Storage | null,
  snippetPath: string,
  defaultMode: ScoreViewMode = 'multi_staff',
): ScoreViewMode {
  // Defensive: null storage → default. Missing/malformed → default.
}

export function writeScoreViewMode(
  storage: Storage | null,
  snippetPath: string,
  mode: ScoreViewMode,
): void {
  // No-op on null storage.
}

export function toggleScoreViewMode(
  storage: Storage | null,
  snippetPath: string,
  currentMode: ScoreViewMode,
): ScoreViewMode {
  const next: ScoreViewMode = currentMode === 'kit' ? 'multi_staff' : 'kit';
  writeScoreViewMode(storage, snippetPath, next);
  return next;
}
```

Mirrors v0.2.138 `expanded-state-core.ts` shape exactly. Tests follow the same pattern (10-12 cases: missing key, valid, malformed, null storage, throwing storage, roundtrip, toggle from each state).

### §4.4 — Toolbar button in output pane

Modify the Forge Output pane component (`output-view.ts` or equivalent — check current structure):

1. Top-right of the Output pane, add a small toolbar.
2. If `result.has_percussion === true`: render a toggle button.
   - Label: "🥁 Kit" when current view is `multi_staff`; "🎼 Multi-staff" when current view is `kit`.
   - Tooltip: "Toggle drum notation view".
3. On click: read current mode → toggle → re-render the output pane with the new view (use cached XML; no recompute).
4. If `result.has_percussion === false`: button hidden.

Sample code (adjust to actual output pane structure):

```typescript
if (result.has_percussion) {
  const button = container.createEl('button', {
    cls: 'forge-output-toolbar-button',
    attr: { 'aria-label': 'Toggle drum notation view' },
  });
  const updateLabel = (mode: ScoreViewMode) => {
    button.setText(mode === 'kit' ? '🎼 Multi-staff' : '🥁 Kit');
  };
  updateLabel(currentMode);
  button.addEventListener('click', () => {
    const newMode = toggleScoreViewMode(getStorage(), snippetPath, currentMode);
    currentMode = newMode;
    updateLabel(newMode);
    rerenderScore(newMode);  // uses cached XML; no recompute
  });
}
```

### §4.5 — Initial view on snippet open

When the Forge Output pane mounts (or after a compute completes):
1. Call `readScoreViewMode(localStorage, snippetPath, 'multi_staff')`.
2. Use the returned mode to pick which MusicXML to render initially.

Reuses v0.2.138's storage abstraction pattern. No new defensive logic needed beyond the pure-core.

### §4.6 — MIDI export unchanged

The MIDI export path in `verovio.ts` (or wherever MIDI is produced) stays exactly as today. It serializes the CANONICAL multi-instrument Score, NOT the kit-folded Score. Document inline:

```typescript
// MIDI export is always canonical multi-instrument (channel 10, GM percussion
// pitches). Independent of the visual view mode. Per v0.2.143 §1.4.
```

### §4.7 — MusicXML export matches view

If there's an existing "Export MusicXML" path: when in kit view, export the kit MusicXML; when in multi-staff view, export the canonical multi-staff MusicXML. The export action just uses whichever XML is currently in the renderer's hands.

### §4.8 — Click-to-play preservation

After kit-rendering: verify the v0.2.140 click-to-play mechanism still works:
- Click a snare note in the kit-rendered SVG → snare sound plays.
- Click a kick note → kick sound plays.

Depends on §2.2 (note `id` preservation) and §2.3 (Instrument preservation). If both hold, click-to-play should work transparently.

Add a smoke step (user-side) that confirms this end-to-end.

## §5 — Tests required (pure-core + engine + integration)

### §5.1 — Engine pytest (§3.4)

12 tests for `to_kit_notation` + `has_percussion`. Failing-first per TDD.

### §5.2 — Plugin pure-core tests

`view-mode-core.test.ts`: ~12 tests mirroring v0.2.138's `expanded-state-core.test.ts` shape:
- Missing key → default.
- Valid 'multi_staff' / 'kit' → returned.
- Malformed JSON → default.
- Non-matching string → default.
- Null/undefined storage → default.
- Roundtrip write+read for each mode.
- Toggle from 'multi_staff' → 'kit' and back.
- Custom default parameter respected.
- Throwing storage → graceful default.
- Per-path isolation.

### §5.3 — Integration smoke (user-side)

Per §6 below.

Plugin suite: 753 → ~765 (12 new view-mode-core tests + a small number of integration tests if feasible).

## §6 — User-side smoke

```
# 1. BRAT update to v0.2.143.
# 2. Open ~/forge-vaults/<vault>/forge-music/percussion/murmuration.md in Obsidian.
# 3. Forge-click 🔥.
# 4. Score renders in multi-staff (default). 7 percussion staves.
# 5. Click the 🥁 Kit button in the Output pane top-right toolbar.
# 6. Score re-renders in kit notation: single 5-line staff with kit conventions.
#    Hi-hat above staff with X-noteheads. Snare middle. Kick below.
# 7. Verify click-to-play: click a kick note in the kit view → kick sound plays.
# 8. Click a snare note → snare sound plays.
# 9. Click the 🎼 Multi-staff button → score returns to 7-staff view.
# 10. Close Obsidian + reopen. Open murmuration.md. Forge-click.
#     The last-chosen view (multi-staff after step 9) should be the initial view.
# 11. Switch to a different snippet (e.g. percussion_lab/solitary.md). Forge-click.
#     Its view should be the default (multi_staff) — per-snippet storage isolated.
# 12. Open a non-percussion snippet (e.g. forge-tutorial/01-hello/hello_world.md
#     — if it has no music output, just confirm no kit button appears).
```

If the user has a piano-only snippet: verify the kit button is absent (has_percussion=false → no button).

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1 mandates the Verovio spike before full implementation.
- ✓ §57–74 (TDD): failing-first tests for engine (12) + pure-core (~12).
- ✓ §86–118 (pure-core convention): `view-mode-core.ts` joins the storage-state pure-core family.
- ✓ §76 (don't ship speculative fix): driver-flagged feature with concrete user benefit.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: any error paths use console.error with method-name prefix.
- ✓ v0.2.124 pure-core dispatch HARD RULE: the toggle decision lives in pure-core (`toggleScoreViewMode`); UI glue just calls it.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: §2.1 spike is the runtime evidence gate before commit.
- ✓ v0.2.134 §5 inlined-version preflight: passes automatically.
- ✓ cc-prompt-queue.md:356 bundled-vault rule: not applicable (no bundled vault content changes in this drain).

## §8 — Open follow-ups

1. **Frontmatter `score_style:` field** — defer until user feedback shows toolbar-only toggle has friction. Future drain could add `score_style: kit` as an author-set initial-view override (toolbar still flips it; storage still persists).

2. **Per-rendering MusicXML lazy compute** — if the dual-XML approach in §4.2 has perceptible cost on large scores, refactor to lazy compute (only generate kit XML when first toggled).

3. **Mixed-instrument scoring polish** — if the user composes pieces with bass + percussion + melodic, audit the kit-folded score's vertical alignment. Bass+kit on a 2-staff system should align measures cleanly.

4. **Cohort doc update** — when forge-music gets a cohort doc, document the toggle and the design intent (multi-staff for inspection, kit for performance).

## §9 — Architectural framing

V1 music-domain feature. Closes the "drums look like drums when I want them to" gap. Establishes the pattern of "canonical Score is the source of truth; multiple renderings are functions of it" for future view-mode work (e.g., piano grand staff vs treble-only, chord-symbols vs full notation).

No V2 commitments. Compose-time logic stays identical; this is purely a rendering layer addition.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

Suggested order:
1. §2.1 Verovio spike (~30 min) — gate the rest of the work.
2. §3 engine: `to_kit_notation` + `has_percussion` + pytests (~60-75 min).
3. §4.3 pure-core `view-mode-core.ts` + tests (~30 min).
4. §4.1, §4.2, §4.4, §4.5 plugin glue (~45 min).
5. §6 user smoke handoff.

Total estimated CC time: 3-4 hours.

If §2.1 spike surfaces Verovio rendering issues:
- Mild: document + ship with notes (cohort UX acceptable).
- Moderate: pause this drain; document; surface a v0.2.144-class "Verovio percussion engraving improvements" prompt.
- Severe: pause; flip approach to "kit notation only via MusicXML export → user opens in MuseScore" until Verovio improves.

CC's call based on spike findings.
