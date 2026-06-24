---
timestamp: 2026-06-26T15:00:00Z
session_id: drain-2026-06-26-1500
status: pending
priority: MEDIUM — fun-category; spike confirmed; Phase B unblocked
---

# v0.2.149 (renumber to current) — Kit notation Phase B: plugin integration (spike confirmed)

## §0 — Driver spike 2 result — ALL CHECKPOINTS PASS

Driver re-ran the kit-notation spike against v0.2.148 (which carries v0.2.146's Unpitched migration + v0.2.148's editorial.misc fix). Spike snippet wraps the canonical murmuration piece through `to_kit_notation`:

```python
def compute(context):
    from forge.music.lib import to_kit_notation
    canonical = context.compute('murmuration')
    return to_kit_notation(canonical)
```

Rendered output (screenshot captured): 12+ bars of murmuration on a single kit staff, with:

| Checkpoint | Result | Evidence |
|---|---|---|
| A — Percussion clef visible | ✓ PASS | "ǁ" symbol at start of every system |
| B — X-noteheads for hi-hat | ✓ PASS | Clear X-shapes for hi-hat eighths |
| C — Voice stem direction | ✓ PASS | Hi-hat + snare stems up, kick stems down |
| D — Note positions match kit convention | ✓ PASS | Hi-hat above staff, snare middle, kick below |

Murmuration's section structure is readable from the rendered chart (`solitary` → `companions` → `swarming` → peak sections), and the kit notation compresses the previously-3-page multi-staff layout to a single-staff readable drum chart.

**The Unpitched migration succeeded end-to-end.** Phase B integration can now ship with runtime evidence that the engraving is correct. v0.2.132 HARD RULE satisfied.

## §1 — Goal

Ship the deferred Phase B integration from v0.2.143 + v0.2.146:
- Plugin captures both multi-staff AND kit MusicXML from each compute.
- Toolbar button in Forge Output pane toggles view (gated on `has_percussion`).
- Persistent per-snippet view preference via `view-mode-core.ts` (already in v0.2.143).
- MIDI export unchanged; MusicXML export matches current view.
- Click-to-play preserved across both views.

Net effect: cohort users open a percussion piece, click the 🥁 Kit button, get a drum chart. Click 🎼 Multi-staff, get the orchestral percussion layout. State persists per-snippet across reloads.

## §2 — Investigation phase (per §78)

### §2.1 — Locate current MusicXML production

```bash
grep -n "musicxml\|write_musicxml\|score.write" src/pyodide-host.ts
```

Find the embedded Python block (`_forge_run_snippet` or sibling) that turns the compute result into MusicXML. That's where dual production lands.

### §2.2 — Locate verovio renderer

```bash
grep -n "renderToSVG\|verovio\.toolkit\|renderMusicXMLAndMIDI" src/verovio.ts
```

Find the entry point. Confirm the result-shape coming back from the engine.

### §2.3 — Locate output pane toolbar surface

```bash
grep -n "output.view\|createOutput\|onLoad.*output\|ForgeOutput" src/output-view.ts src/main.ts
```

Identify where toolbar buttons could be inserted in the Forge Output pane header.

## §3 — Implementation

### §3.1 — Pyodide-host: dual MusicXML production (§4.1 of v0345)

In `pyodide-host.ts`'s embedded Python — after the canonical compute result lands and before MusicXML serialization:

```python
# Existing path produces multi_staff_xml from canonical_score.
multi_staff_xml = canonical_score.write('musicxml').read_text()

# v0.2.149: dual production when percussion present.
from forge.music.lib import to_kit_notation, has_percussion

has_perc = has_percussion(canonical_score)
kit_xml = None
if has_perc:
    kit_score = to_kit_notation(canonical_score)
    kit_xml = kit_score.write('musicxml').read_text()

return {
    'multi_staff_xml': multi_staff_xml,
    'kit_xml': kit_xml,
    'has_percussion': has_perc,
    # ... rest of return shape (midi, midi_map, etc.) ...
}
```

Compatibility:
- For non-music snippets: `kit_xml = None`, `has_percussion = False`. Plugin won't try to render kit; toolbar hidden.
- For music snippets without percussion (e.g., piano-only): same — `kit_xml = None`, `has_percussion = False`.
- For percussion or mixed pieces: both XMLs available.

### §3.2 — `verovio.ts` view-mode-aware rendering (§4.2 of v0345)

`renderMusicXMLAndMIDI` (or whatever the entry function is) accepts `viewMode: 'multi_staff' | 'kit'`:

```typescript
export async function renderMusicXMLAndMIDI(
  result: ComputeResult,           // contains multi_staff_xml, kit_xml, has_percussion
  viewMode: ScoreViewMode,
  snippetPath: string,
): Promise<RenderedScore> {
  const xml = viewMode === 'kit' && result.kit_xml
    ? result.kit_xml
    : result.multi_staff_xml;
  
  return renderViaVerovio(xml, ...);
}
```

If `viewMode === 'kit'` but `kit_xml` is null (defensive), fall back to multi_staff. No user-visible error; just renders the available one.

### §3.3 — Output-view toolbar button (§4.3 of v0345)

In the Forge Output pane component:

```typescript
import { readScoreViewMode, toggleScoreViewMode, type ScoreViewMode } from './view-mode-core';

// On render, after the SVG is mounted:
if (result.has_percussion) {
  const toolbar = container.createDiv({ cls: 'forge-output-toolbar' });
  const button = toolbar.createEl('button', {
    cls: 'forge-kit-toggle',
    attr: { 'aria-label': 'Toggle drum notation view' },
  });
  
  let currentMode: ScoreViewMode = readScoreViewMode(
    globalThis.localStorage ?? null,
    file.path,
    'multi_staff'
  );
  
  const updateLabel = (mode: ScoreViewMode) => {
    button.setText(mode === 'kit' ? '🎼 Multi-staff' : '🥁 Kit');
    button.title = mode === 'kit'
      ? 'Switch to multi-staff orchestral percussion view'
      : 'Switch to drum-kit single-staff view';
  };
  updateLabel(currentMode);
  
  button.addEventListener('click', async () => {
    currentMode = toggleScoreViewMode(
      globalThis.localStorage ?? null,
      file.path,
      currentMode
    );
    updateLabel(currentMode);
    await rerenderScore(result, currentMode);
  });
}
```

`rerenderScore` reuses the cached `result` (both XMLs are already in hand); no recompute. Replaces the SVG in the output pane with the other view's render.

### §3.4 — Initial view on snippet open (§4.4 of v0345)

When the Forge Output pane first mounts after compute:

```typescript
const initialMode = readScoreViewMode(
  globalThis.localStorage ?? null,
  file.path,
  'multi_staff'
);
renderMusicXMLAndMIDI(result, initialMode, file.path);
```

Reuses v0.2.143's persisted preference. Same snippet opened later honors the last toggle choice.

### §3.5 — MIDI export unchanged (§4.5 of v0345)

MIDI generation walks the canonical multi-instrument Score. Unaffected by view mode. Document inline:

```typescript
// MIDI export is always canonical multi-instrument (channel 10, GM percussion).
// Independent of visual view mode. Per v0.2.143 §1.4 driver decision.
```

### §3.6 — MusicXML export matches current view (§4.6 of v0345)

If there's an export-MusicXML path in the output pane:

```typescript
const xmlToExport = currentMode === 'kit' && result.kit_xml
  ? result.kit_xml
  : result.multi_staff_xml;
saveAs(new Blob([xmlToExport], { type: 'application/xml' }), `${snippet.basename}.musicxml`);
```

User exports what they were just looking at.

### §3.7 — Click-to-play preservation (§4.7 of v0345)

The kit-rendered SVG's note IDs come from music21 Note → MusicXML → Verovio. v0.2.146's `to_kit_notation` preserves `note.id` via `unpitched.id = src_note.id` (per v0.2.146 §2.2). v0.2.140's click-to-play map uses `note.id` to look up MIDI events.

Verify post-implementation: click a snare in the kit view → snare sound plays. Click a kick → kick sound plays. Should work transparently because the ID identity holds.

If click-to-play breaks on kit view, it's because the MIDI map keys differ; surface as separate fix.

## §4 — Tests required

### §4.1 — Plugin pure-core: no new tests

`view-mode-core.ts` already has 20 tests from v0.2.143. Phase B integration uses these tests' helpers; no new pure-core surface added.

### §4.2 — Engine pytest: no new tests

`to_kit_notation` + `has_percussion` already have 15 tests covering the engine surface. Phase B doesn't change engine behavior.

### §4.3 — Integration smoke (user-side)

Per §5 below. Phase B's deliverable is end-to-end runtime behavior; integration test against a harness is deferred per v0.2.131 §1.6 pattern.

Plugin suite: 786 (unchanged unless integration glue adds defensive tests).

## §5 — User-side smoke

```
# 1. BRAT update to v0.2.149.
# 2. Open ~/projects/forge-music/percussion/murmuration.md.
# 3. Forge-click 🔥.
# 4. Multi-staff renders by default (regression guard).
# 5. Click the 🥁 Kit toolbar button in the output pane top-right.
# 6. Score re-renders in kit notation (looks like driver's _spike2 screenshot).
# 7. Click a kit-rendered note → corresponding instrument plays (click-to-play preserved).
# 8. Click 🎼 Multi-staff → score returns to canonical multi-staff.
# 9. Close + reopen Obsidian → last-chosen view per murmuration persists.
# 10. Open percussion_lab/solitary.md → default view (multi-staff) for unvisited snippets.
# 11. Open a non-percussion snippet → toolbar button hidden (has_percussion=false gate).
# 12. Driver can delete _spike2.md after verification: it's no longer needed (v0.2.148 spike-file exclusion convention means it doesn't pollute releases either way).
```

If all steps pass: kit notation feature complete end-to-end. v0.2.143 + v0.2.146 + v0.2.148 + v0.2.149 close the kit-notation arc.

If any step fails: targeted follow-up per failure mode.

## §6 — Per-protocol HARD RULE compliance

- ✓ §78: §2 enumerates the integration surface to investigate.
- ✓ §57–74: no new pure-core tests required; integration covered by user-side smoke per v0.2.131 §1.6 pattern.
- ✓ §86–118: pure-cores unchanged; integration glue calls them.
- ✓ §76: driver-spike-confirmed; runtime evidence in hand.
- ✓ §347: release.sh bumps appropriately.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error HARD RULE: any catches use console.error with method-name prefix (e.g., `rerenderScore: kit XML missing, falling back to multi_staff`).
- ✓ v0.2.124 pure-core dispatch HARD RULE: toggle decision lives in v0.2.143 pure-core.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: SATISFIED via driver spike 2 result documented in §0.
- ✓ v0.2.134 §5 inlined-version preflight: passes automatically.
- ✓ v0.2.144 bundled-vault bump preflight: passes (no vault content changes).

## §7 — Open follow-ups + carry-forward

After this drain, the kit-notation arc closes:
- ✓ Engine `to_kit_notation` + `has_percussion` (v0.2.143)
- ✓ Pure-core `view-mode-core.ts` (v0.2.143)
- ✓ Unpitched migration for correct engraving (v0.2.146)
- ✓ `editorial.misc` init guard (v0.2.148)
- ✓ Spike-file exclusion convention (v0.2.148)
- ✓ Plugin Phase B integration (THIS DRAIN)

Remaining longer-term items:
1. **Dynamic mark anchoring** (v0.2.143 §3.5 carry-forward): defer until cohort smoke uncovers user-visible issues.
2. **`score_style:` frontmatter override** (v0342 §8 #1): defer until toolbar-only friction observed.
3. **Per-rendering MusicXML lazy compute** (v0342 §8 #2): defer until perf observed.
4. **Engine pytest vs pyodide music21 version pinning** (v0.2.148 §7 #2): worth a separate drain to prevent future audit-vs-runtime mismatches.
5. **Cohort doc update** (v0342 §8 #4): wait until forge-music gets a cohort doc.

## §8 — Architectural framing

V1 music-domain feature complete. The canonical Score → multiple renderings pattern (multi-staff, kit) generalizes for future view modes — same pure-core can persist "treble-only piano", "chord-symbols-only", etc.

Three-strikes case study for the runtime-evidence-beats-source-audit HARD RULE: v0.2.143/146 (Unpitched migration audit said "tests pass"; runtime spike 1 said "positions wrong"), v0.2.148 (audit said "editorial.misc set works"; runtime said "AttributeError"), and now v0.2.149 where runtime spike 2 finally confirms end-to-end. The rule is the load-bearing institutional check that closed each gap.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Suggested order:
1. §2 investigation (~15 min).
2. §3.1 pyodide-host dual XML production (~20 min).
3. §3.2 verovio.ts view-mode-aware rendering (~20 min).
4. §3.3 + §3.4 toolbar + initial-view glue (~30 min).
5. §3.5 + §3.6 + §3.7 MIDI/MusicXML/click-to-play documentation (~10 min).
6. Smoke handoff.

Total estimated CC time: 90-120 min.

If any step surfaces an unexpected wrinkle (e.g., pyodide MusicXML serialization is slow on large pieces, output-view's structure doesn't accommodate a clean toolbar insertion), surface and split — likely doable in this single drain but split-when-needed pattern applies.

Driver `_spike2.md` can stay in `~/projects/forge-music/` post-drain (v0.2.148 spike-file exclusion convention handles it).
