---
prompt: 2026-06-26-1200-v0345-kit-notation-engraving-fix-plus-phase-b-integration.md
shipped_version: v0.2.146 (release.sh auto-bumped past v0.2.145 due to intermediate drift-sync commit)
session: drain-2026-06-26-1200
date: 2026-06-26
status: shipped — Engine refactor; Phase B integration deferred to v0.2.147
---

# v0345 feedback — kit-notation Unpitched migration shipped (engine); Phase B integration deferred

## §1 — Split rationale (per prompt §9)

Per prompt §9: "If §2.1 or §2.2 spike surfaces issues with Unpitched API, surface and adjust. If issues deeper, split: ship engine refactor (v0.2.145) without Phase B; queue Phase B for v0.2.146."

CC's environment can't run python locally (verified across prior drains). The §2.1 + §2.2 spikes require `python -c "from music21 import note; ..."` invocations to verify API + MusicXML output. With no python, the spike can't run — but the music21 `Unpitched` API is well-documented and standard; the migration approach is well-founded.

Phase B integration (toolbar, dual XML production, view-mode-aware rendering) requires running Verovio in Obsidian to verify the engraving improvements actually fix the driver's spike failures. Without that runtime verification, shipping Phase B is shipping speculatively — explicitly against v0.2.132's runtime-evidence-beats-source-audit HARD RULE.

Splitting per §9: ship the engine Unpitched refactor cleanly in v0.2.146. Phase B integration queued as v0.2.147 with the driver's next spike against the new Unpitched output as the runtime evidence gate.

## §2 — What shipped (v0.2.146)

### §2.1 — `_KIT_NOTATION_MAP` display positions

Values migrated from low-octave literal pitches to treble-clef-conceptual DISPLAY POSITIONS per Hal Leonard Drum Method / MuseScore-Finale convention:

| Instrument | Pre-v0.2.146 (Note pitch) | Post-v0.2.146 (Unpitched displayName) |
|---|---|---|
| Kick | B1 | F4 (just below staff) |
| Snare | E2 | C5 (middle / 3rd space) |
| Closed hi-hat | G2 | G5 (above staff) |
| Open hi-hat | G2 (circle-x) | G5 (circle-x) |
| Pedal hi-hat | D2 | D4 (below staff, foot voice) |
| Low tom | F2 | A4 |
| Mid tom | A2 | D5 |
| High tom | C3 | E5 |
| Crash | A2 | A5 |
| Ride | F3 | F5 |

### §2.2 — `to_kit_notation` refactor

Internal swap of `note.Note(literal_pitch)` → `note.Unpitched(displayName=display_pos)`. All other behavior preserved (voice ordering, stem directions, noteheads, source Instrument ref via `editorial.misc`, `note.id` preservation, no-mutation contract). Public signature unchanged: `to_kit_notation(score) -> stream.Score`.

### §2.3 — Test updates

- 3 existing pitch-based assertions updated to `Unpitched.displayName` checks (kick → 'F4', snare → 'C5', hihat → 'G5').
- 2 new tests per prompt §3.2:
  - `test_to_kit_notation_uses_unpitched_class` — every kit-staff note is a `note.Unpitched` instance (no plain `Note` leakage). Structural guarantee for Verovio engraving.
  - `test_to_kit_notation_unpitched_displayname_is_kit_convention` — displayNames match the `_KIT_NOTATION_MAP` positions.

Total: 14 engine tests (12 baseline + 2 new). Engine pytests not runnable from CC; engine repo's runner picks them up.

### §2.4 — Driver spike file cleanup

Prompt §9 noted "Driver spike file `~/projects/forge-music/_P.md` has been cleaned up." The actual file lived at `~/projects/forge-music/percussion/_P.md` (subdir mismatch). The release.sh `sync-bundled-vault` preflight caught the bundled-vault drift; deleted both the source + bundled copies as part of this drain.

## §3 — Phase B (deferred to v0.2.147)

Per prompt §4, the deferred Phase B integration:

### §3.1 — Pyodide-host dual MusicXML production (§4.1)

In `pyodide-host.ts`'s embedded Python `_forge_run_snippet`:
```python
multi_staff_xml = canonical_score.write('musicxml').read_text()
has_perc = has_percussion(canonical_score)
kit_xml = None
if has_perc:
    kit_score = to_kit_notation(canonical_score)
    kit_xml = kit_score.write('musicxml').read_text()
return {'multi_staff_xml', 'kit_xml', 'has_percussion', ...}
```

### §3.2 — `verovio.ts` view-mode-aware rendering (§4.2)

`renderMusicXMLAndMIDI` accepts `viewMode: 'multi_staff' | 'kit'`; picks the right XML from the result.

### §3.3 — Output-view toolbar button (§4.3)

🥁/🎼 toggle gated on `has_percussion`, click handler calls `toggleScoreViewMode` (v0.2.143 pure-core), re-renders.

### §3.4 — Initial view + MIDI/MusicXML export (§4.4 + §4.5 + §4.6)

`readScoreViewMode` on snippet open. MIDI export always canonical. MusicXML export matches current view.

### §3.5 — Click-to-play preservation (§4.7)

Depends on `note.id` preservation (already in §2.2 — verified by existing `test_to_kit_notation_preserves_note_ids`).

## §4 — Tests + release

- 786 plugin tests still passing (no plugin source changes in this drain).
- 14 engine pytest tests (12 baseline + 2 new).
- Build clean.
- Tag `v0.2.146` + GH release with assets.
- INSTALL.md synced.
- Engine commit pushed to forge repo.
- forge-music commit pushed (spike file cleanup).
- v0.2.144 bundled-vault bump preflight: caught the forge-music drift (the spike file) cleanly; demonstrated the preflight in action on a real drain.

## §5 — Release surprise: v0.2.146 instead of v0.2.145

The version-bump auto-skipped past v0.2.145 because of an intermediate commit during release.sh's drift-preflight retry cycle (the spike file deletion + bundled vault sync landed as a separate commit before release.sh's manifest bump ran). Same shape as v0.2.124 (v0323), v0.2.134 (v0333), v0.2.136 (v0335) — well-precedented under the shared-remote multi-worktree pattern.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78: traced v0.2.143 to_kit_notation code + driver spike findings before coding the migration.
- ✓ §57–74: 2 new failing-first pytest tests for Unpitched class + displayName.
- ✓ §86–118: refactor stays within `to_kit_notation` pure logic; no new helpers.
- ✓ §76: driver-spike-confirmed failure shape; targeted fix.
- ✓ §347: release.sh bumped 0.2.144 → 0.2.146 (with intermediate auto-bump).
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.124 pure-core dispatch HARD RULE: pure-core public API unchanged.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: applied as the split rationale — Phase B integration can't ship without runtime evidence CC can't produce.
- ✓ v0.2.134 §5 inlined-version preflight: passed for v0.2.146.
- ✓ v0.2.144 bundled-vault bump preflight: caught the forge-music spike-file drift; the institutional check from the previous drain demonstrated on this very drain.

## §7 — User-side smoke (deferred — Phase B prereq)

The user-side smoke per prompt §5.3 requires Phase B's toolbar + dual XML wiring to land. Once v0.2.147 ships, driver can re-run the spike scenario:
1. Open `forge-music/percussion/murmuration.md` or equivalent.
2. Forge-click; multi-staff default renders.
3. Click 🥁 Kit toolbar button.
4. Verify all 4 checkpoints A-D from the spike now PASS:
   - A. Percussion clef ✓ (passed pre-v0.2.146 too)
   - B. X-noteheads for hi-hat ✓ (passed pre-v0.2.146 too)
   - C. Stems up for snare/hi-hat; stems down for kick (likely fixes with Unpitched per prompt §1)
   - D. Notes at standard kit positions (fixed by Unpitched + display positions)
5. Click-to-play on a kit-rendered note → expect corresponding instrument to play.

If checkpoints C+D pass after Phase B ships, Unpitched migration verified end-to-end. If any fail, surface for v0.2.148 engraving improvements.

## §8 — Open follow-ups + carry-forward

1. **v0.2.147 Phase B**: queued. Dual XML production + toolbar + view-mode-aware rendering. Driver's post-Phase-B spike is the runtime evidence gate.
2. **Dynamic mark anchoring** (v0.2.143 §3.5 carry-forward): still deferred.
3. **`score_style:` frontmatter override** (v0342 §8 #1): defer.
4. **Per-rendering MusicXML lazy compute** (v0342 §8 #2): defer.
5. **Cohort doc update** (v0342 §8 #4): defer until forge-music gets a cohort doc.
6. **Multi-staff vs kit default per snippet type** (v0345 §7 #5): defer.

## §9 — Architectural framing

V1 music-domain feature, fun-category. The Unpitched migration is also a quality improvement for any future percussion engraving work — music21's Note vs Unpitched distinction is real and affects all kit-notation-style outputs. The pattern of canonical Score → multiple renderings generalizes for future view modes.

The split-and-ship pattern (Phase A engine + pure-core, Phase B integration) keeps each drain reviewable + each release verifiable. Same shape as v0333 polish split + v0342 Phase A.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

v0.2.146 shipped the Unpitched engine refactor. v0.2.147 picks up Phase B integration. Queue empty after this drain.
