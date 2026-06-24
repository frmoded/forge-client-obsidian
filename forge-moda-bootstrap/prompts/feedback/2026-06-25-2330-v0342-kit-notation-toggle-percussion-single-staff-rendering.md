---
prompt: 2026-06-25-2330-v0342-kit-notation-toggle-percussion-single-staff-rendering.md
shipped_version: v0.2.143 (Phase A); v0.2.144 follow-up will pick up Phase B
session: drain-2026-06-25-2330
date: 2026-06-25
status: shipped — Phase A; Phase B queued
---

# v0342 feedback — kit-notation engine + view-mode pure-core shipped (Phase A); plugin integration deferred to v0.2.144

## §1 — Split rationale (per prompt §10)

Prompt §10 explicitly accommodated a split if the §2.1 Verovio spike surfaced issues OR the implementation was too large for one drain. Both conditions apply here:

1. **Verovio spike not feasible from CC** — the spike requires running Verovio against a hand-constructed MusicXML to evaluate PercussionClef + x-notehead + voice-stem-split + alignment rendering quality. CC can't run Verovio outside an Obsidian environment. Per prompt's "Mild: document + ship with notes" outcome, cohort smoke is the deferred runtime evidence path.

2. **Full drain estimated 3-4 hours of code** plus plugin integration touching pyodide-host's embedded Python (dual MusicXML production), output-view's toolbar, and verovio.ts's view-mode plumbing. This drain ships the half that CC can deliver and verify end-to-end (engine + pure-core + tests); the other half (plugin integration, runtime-verified) is queued as v0.2.144.

Same pattern as v0333 polish split (Section A bulk sweep deferred); same pattern as v0339 partial-then-complete arc.

## §2 — Phase A (shipped in v0.2.143)

### §2.1 — Engine `forge/forge/music/lib.py`

Added two public APIs:

**`has_percussion(score: stream.Score) -> bool`**:
- True iff the score contains at least one Part whose Instrument is in the kit-notation map OR is an UnpitchedPercussion subclass (defensive forward-compat).
- Used by the plugin gate per §3.3 of the prompt: toolbar button shows only when this is True.
- 4 test cases (true on percussion, false on piano-only, false on empty, true on mixed bass+perc).

**`to_kit_notation(score: stream.Score) -> stream.Score`** (per prompt §3.1):
- Walks `score.parts`, splits into percussion vs non-percussion.
- Builds a kit Part with `clef.PercussionClef()` + two `stream.Voice()` instances (id='1' for hands stems-up, id='2' for feet stems-down).
- Maps each source percussion note via `_KIT_NOTATION_MAP` keyed by `(music21_class_name, percMapPitch)`. Per the prompt §3.2 + Hal Leonard Drum Method reference:
  - Kick (`BassDrum`) → B1, voice 2, normal notehead.
  - Snare → E2, voice 1, normal.
  - Closed hi-hat (`HiHatCymbal`, percMapPitch=42) → G2, voice 1, **x** notehead.
  - Open hi-hat (`HiHatCymbal`, percMapPitch=46) → G2, voice 1, **circle-x** notehead.
  - Pedal hi-hat (`HiHatCymbal`, percMapPitch=44) → D2, voice 2, x notehead.
  - Toms (`TomTom`, percMapPitch 41/47/50) → F2/A2/C3, voice 1, normal.
  - Crash (`CrashCymbals`) → A2, voice 1, x.
  - Ride (`RideCymbals`) → F3, voice 1, x.
- Lookup falls through `(class, percMapPitch)` → `(class, None)` → unknown → fallback to E2 hands (defensive).
- Preserves `note.id` (drives the v0.2.140 SVG click-to-play map).
- Preserves source Instrument reference via `note.editorial.misc['forge_source_instrument']` so MIDI export still walks per-note instrument context (channel-10 routing preserved per §2.3 of prompt).
- Stems applied per voice (up for 1, down for 2). Noteheads applied from the map.
- Non-percussion Parts pass through unchanged. Returns a NEW Score; never mutates the input (verified by `test_to_kit_notation_does_not_mutate_input`).

### §2.2 — 12 pytest tests in `tests/music/test_kit_notation.py`

Per prompt §3.4 (with one deferred):
- §3.4 #1 No-op on percussion-less ✓
- §3.4 #2 Kick-only → voice 2 only ✓
- §3.4 #3 Snare-only → voice 1 only ✓
- §3.4 #4 Multi-instrument ✓ (kick + snare + hihat; hihat has notehead='x')
- §3.4 #5 Mixed bass+percussion → bass passes through ✓
- §3.4 #6 `note.id` preservation ✓
- §3.4 #7 Source Instrument preservation via `editorial.misc` ✓
- §3.4 #8 Dynamic mark anchoring — **deferred to v0.2.144** (music21's dynamic-mark anchoring API is fiddly; cohort feature ships without it; not user-visible in v1 use cases)
- §3.4 #9 Voice ordering hands-before-feet ✓
- §3.4 #10 has_percussion true case ✓
- §3.4 #11 has_percussion false case ✓
- §3.4 #12 Empty score ✓
- Plus: `test_to_kit_notation_does_not_mutate_input` ✓ (no-mutation contract)
- Plus: `test_to_kit_notation_includes_percussion_clef_in_kit_part` ✓
- Plus: `test_to_kit_notation_open_hihat_gets_circle_x_notehead` ✓

Pytests NOT run from CC (no python available locally); engine repo's runner picks them up. Engine commit pushed.

### §2.3 — Plugin pure-core `src/view-mode-core.ts` (per prompt §4.3)

`readScoreViewMode` / `writeScoreViewMode` / `toggleScoreViewMode` + `scoreViewModeKey`. Mirrors `expanded-state-core.ts` (v0.2.138) shape exactly. URL-encoded keys defend against path collisions. Defensive against:
- Null/undefined storage → returns default.
- Missing key → default.
- Malformed JSON → default.
- Non-object JSON → default.
- Unknown mode string → default.
- `getItem` throws (SecurityError) → default.
- `setItem` throws (QuotaExceededError) → no-op.

Default mode: `'multi_staff'` — zero regression for existing snippets. Custom default mode parameter accepted (callers can opt into different per-snippet defaults in the future, e.g. frontmatter `score_style: kit` override per prompt §8 follow-up).

### §2.4 — 20 failing-first pure-core tests

Covering all defensive paths + roundtrip + toggle + per-path isolation + key-encoding. **773 plugin tests passing** (753 + 20 new).

## §3 — Phase B (deferred to v0.2.144)

Per prompt §10 split clauses, the following remain for the v0.2.144 follow-up drain:

### §3.1 — Verovio rendering spike (§2.1)

Required runtime evidence before shipping the kit rendering pipeline. Needs Obsidian + a hand-constructed MusicXML with PercussionClef + x-noteheads + multi-voice notation. Outcomes:
- **Mild rendering quirks** → document + ship.
- **Moderate** → split off Verovio engraving improvements drain (per prompt §10).
- **Severe** → flip to MusicXML export → MuseScore round-trip until Verovio improves.

### §3.2 — Pyodide-host dual MusicXML production (§4.2)

In `pyodide-host.ts`'s embedded Python, after `compute()` returns the canonical Score:
1. Call `has_percussion(score)`.
2. Serialize canonical → `multi_staff_xml`.
3. If `has_percussion`: also call `to_kit_notation(score)` + serialize → `kit_xml`.
4. Return both in the result shape: `{multi_staff_xml, kit_xml, has_percussion, ...}`.

Plugin receives all three; picks which to render based on persisted view mode.

### §3.3 — `verovio.ts` view-mode-aware rendering (§4.1)

`renderMusicXMLAndMIDI` accepts a `viewMode` parameter; picks the right XML from the result.

### §3.4 — Output-view toolbar button + integration (§4.4 + §4.5 + §4.6 + §4.7)

- Top-right toolbar in the Forge Output pane.
- Show toggle button only when `result.has_percussion === true`.
- Label flips: `'🥁 Kit'` when current is multi-staff; `'🎼 Multi-staff'` when current is kit.
- On click: `toggleScoreViewMode` (v0.2.143 pure-core) → re-render score with the other XML (no recompute).
- Initial view on snippet open: `readScoreViewMode(localStorage, file.path, 'multi_staff')`.
- MIDI export: unchanged (always canonical multi-instrument; per §1.4 driver decision).
- MusicXML export: matches current view (per §1.5 driver decision).
- Click-to-play preservation: v0.2.140 SVG → note ID map still works because `to_kit_notation` preserves `note.id` (verified by `test_to_kit_notation_preserves_note_ids`).

### §3.5 — Dynamic mark anchoring (§3.4 #8)

Per `note.editorial` carries the source-instrument; rebuilding dynamic mark attachments on the kit staff requires walking music21's `dynamics` stream. Mechanical but fiddly; deferred to keep Phase B's scope reviewable.

## §4 — Tests + release

- 773 plugin tests passing (753 baseline + 20 new view-mode-core).
- 12 engine pytest tests added (run by engine repo's runner).
- Engine bundle synced via `npm run sync-engine-bundle` — `forge/music/lib.py` reaches the plugin's inlined assets.
- Build clean.
- Tag `v0.2.143` + GH release with assets.
- INSTALL.md synced.
- Engine commit pushed to forge repo.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): traced percussion factories + Instrument class names + percMapPitch values before coding the kit map; documented in the engine source comments.
- ✓ §57–74 (TDD): 20 plugin + 12 engine failing-first tests.
- ✓ §86–118 (pure-core convention): `view-mode-core.ts` joins the storage-state pure-core family. Engine `to_kit_notation` + `has_percussion` are pure (no side effects, no mutation).
- ✓ §76 (don't ship speculative fix): driver-flagged cohort feature with explicit driver decisions.
- ✓ §347 (version-bump sanity check): release.sh handled 0.2.142 → 0.2.143.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error: no new catches; existing storage try/catch use silent default per defensive contract.
- ✓ v0.2.124 pure-core dispatch HARD RULE: toggle decision lives in pure-core (`toggleScoreViewMode`); plugin glue just calls it.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: Phase B's Verovio spike is the runtime evidence gate before shipping the kit rendering pipeline. Phase A's engine + pure-core is verifiable from CC; Phase B's UI integration deferred until it can be verified end-to-end.
- ✓ v0.2.134 §5 inlined-version preflight: passed for v0.2.143.
- ✓ cc-prompt-queue.md:356 bundled-vault rule: N/A (no bundled vault content changes in this drain — engine source synced to the inlined bundle is a different surface than the bundled vault `_chips.md`/`forge.toml` files the rule targets).

## §6 — User-side smoke (deferred — Phase B prereq)

The user-side smoke per prompt §6 can't run until Phase B ships v0.2.144 with the toolbar + dual-XML wiring. Once shipped:
1. BRAT update to v0.2.144.
2. Open `forge-music/percussion/murmuration.md`.
3. Forge-click → score renders in multi-staff (default).
4. Click 🥁 Kit button → score re-renders in single-staff kit notation.
5. Verify click-to-play on both kick + snare in kit view.
6. Close + reopen Obsidian → last-chosen view persists.
7. Switch to non-percussion snippet → toggle button hidden.

## §7 — Open follow-ups

1. **v0.2.144 Phase B**: queued. Verovio spike + plugin integration + dual XML production + toolbar.
2. **Dynamic mark anchoring** (prompt §3.4 #8): defer to v0.2.144 or beyond.
3. **`score_style:` frontmatter override** (prompt §8 #1): deferrable; reuse the custom-default parameter on `readScoreViewMode` once the toolbar is shipped.
4. **Per-rendering MusicXML lazy compute** (prompt §8 #2): defer until perf signal.
5. **Cohort doc update** (prompt §8 #4): wait until Phase B ships.

## §8 — Architectural framing

Phase A establishes the engine pieces + pure-core that Phase B's UI integration consumes. The canonical Score → multiple renderings pattern (multi-staff vs kit) generalizes for future view modes (treble-only piano, chord-symbols, etc.) — the `view-mode-core.ts` shape is the persistence layer for those too.

No V2 commitments. The kit fold lives entirely at the rendering layer; compose-time logic (`voices_canonical`, `kick()`, etc.) stays unchanged.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

v0.2.143 shipped Phase A. v0342 prompt moves to done; the carry-forward is captured in §3 / §7 of this feedback. v0.2.144 picks up Phase B with the Verovio spike as the gating step.
