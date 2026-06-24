---
prompt: 2026-06-26-1500-v0347-kit-notation-phase-b-plugin-integration-spike-confirmed.md
shipped_version: v0.2.150
session: drain-2026-06-26-1500
date: 2026-06-26
status: shipped — kit-notation arc complete; awaiting cohort smoke
---

# v0347 feedback — kit-notation Phase B plugin integration shipped

## §1 — Investigation findings (§2 of prompt)

Two surprises vs. prompt's investigation steers:

### §1.1 — MusicXML auto-wrap site lives in `forge/core/serialization.py`, not `pyodide-host.ts`

Prompt §3.1 sketched the dual-XML production landing in `pyodide-host.ts`'s embedded Python. Actual investigation: the plugin reaches the MusicXML as a raw string already wrapped in `{type: 'musicxml', content: '...'}` from the engine. The auto-wrap site is `_try_serialize_music21` in the engine's `serialization.py` — called by `serialize_result` whenever a snippet returns a `music21.stream.Stream` (covers `Score`, `Part`, `Measure`, etc.). Pyodide-host doesn't transform this; it just relays.

So the dual-XML production landed in the engine, not the plugin's pyodide-host. Cleaner: every callsite that produces a music21 result automatically gets dual XML for percussion pieces, no per-snippet opt-in.

### §1.2 — Output pane delivers via two paths

`renderResult` (`output-view.ts:333`) handles two tagged-payload paths:
- `case 'musicxml'` for data-snippet musicxml bodies (line 273)
- `case 'musicxml'` for compute results (line 339)

Both flow through the same renderMusicXML helper. Adding the toggle at the dispatch site (`renderResult`) covers both paths without changing renderMusicXML's signature.

## §2 — What shipped (v0.2.150)

### §2.1 — Engine `_try_serialize_music21` dual XML (per prompt §3.1)

`forge/core/serialization.py`:

```python
multi_staff_xml = xml_bytes.decode("utf-8")  # existing path
has_perc = False
kit_xml = None
if isinstance(value, music21.stream.Score):
    try:
        from forge.music.lib import has_percussion, to_kit_notation
        has_perc = has_percussion(value)
        if has_perc:
            kit_score = to_kit_notation(value)
            _set_score_title(kit_score, snippet)
            kit_bytes = GeneralObjectExporter(kit_score).parse()
            kit_xml = kit_bytes.decode("utf-8")
    except Exception:
        has_perc = False
        kit_xml = None

payload = {"type": "musicxml", "content": multi_staff_xml}
if has_perc and kit_xml is not None:
    payload["has_percussion"] = True
    payload["multi_staff_content"] = multi_staff_xml
    payload["kit_content"] = kit_xml
else:
    payload["has_percussion"] = False
return payload
```

**Defensive**: `try/except Exception` around the to_kit_notation path — if the fold raises on an unexpected music21 shape, falls back to multi-staff-only. User still sees a renderable score; no toggle.

### §2.2 — Plugin `renderResult` branches on `has_percussion`

`output-view.ts:339-360`:

```typescript
case 'musicxml': {
  const r = result as Record<string, unknown>;
  if (
    r.has_percussion === true
    && typeof r.kit_content === 'string'
    && typeof r.multi_staff_content === 'string'
  ) {
    this.renderMusicXMLWithToggle(entry, r.multi_staff_content, r.kit_content, snippetId);
  } else {
    this.renderMusicXML(entry, (result as any).content as string, snippetId);
  }
  return;
}
```

### §2.3 — New `renderMusicXMLWithToggle` method

Builds a toolbar above the score-host:
- Reads persisted view mode via v0.2.143's `readScoreViewMode` (default `'multi_staff'`).
- Initial label reflects the mode: `🥁 Kit` when current is multi-staff (offering kit), `🎼 Multi-staff` when current is kit.
- Click handler: `toggleScoreViewMode` (v0.2.143 pure-core) → persist → re-render score area.
- Re-render delegates to existing `renderMusicXML` per call; MIDI player + click-to-play re-init on each toggle (acceptable for v1; fast).

### §2.4 — `scoreViewModeStorage()` helper

Wraps `globalThis.localStorage` per v0.2.138's `expandedStateStorage` pattern. Try/catch the global, return null on SecurityError / sandbox absence so the pure-core's defensive default kicks in cleanly.

### §2.5 — CSS

Added to `styles.css`:
- `.forge-output-toolbar` — right-aligned flex above the score-host.
- `.forge-kit-toggle` — small button with Obsidian theme vars.
- `.forge-output-musicxml-host` — clean slot for score render-into; the parent of where existing renderMusicXML mounts.

## §3 — Backward compatibility verified at contract level

Per prompt §3.5–§3.7 + v0342 driver decisions:

| Plugin | Engine | Score has percussion | Result |
|---|---|---|---|
| Old | New | Yes | Reads `content`, renders multi-staff. No toggle. |
| Old | New | No | Reads `content`, renders. No toggle. |
| New | Old | (any) | Sees no `has_percussion`, takes legacy branch. No toggle. |
| New | New | No | Takes legacy branch (`has_percussion: false`). No toggle. |
| New | New | Yes | Toggle appears. 🥁/🎼 button at top of score. |

MIDI export unchanged: always canonical multi-instrument (per v0342 §1.4). MusicXML download bar still uses the currently-rendered XML (via the existing `makeDownloadBar(snippetId, musicxml, ...)` call inside renderMusicXML). Click-to-play preservation: each Unpitched note carries `note.id` from the source (per v0.2.146 + v0.2.149); same map as multi-staff.

## §4 — Tests + release

- **786 plugin tests still passing** (no new pure-core surface added in this drain; v0.2.143's 20 view-mode-core tests cover the toggle's persistence layer).
- 16 engine pytest tests still passing.
- Build clean.
- Tag `v0.2.150` + GH release with assets.
- INSTALL.md synced.
- Engine commit pushed to forge repo.

## §5 — Per-protocol HARD RULE compliance

- ✓ §78: scouted the wrap site + render paths before code.
- ✓ §57–74: no new pure-core surface; existing v0.2.143 tests + v0.2.149 storedInstrument test cover the layers; integration verified via cohort smoke per v0.2.131 §1.6.
- ✓ §86–118: pure-cores (`view-mode-core.ts`, `to_kit_notation`, `has_percussion`) unchanged; plugin glue + engine wrap-site call them.
- ✓ §76: driver-spike-confirmed runtime evidence in v0347 §0.
- ✓ §347: release.sh bumped 0.2.149 → 0.2.150 cleanly.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error HARD RULE: no new catch blocks (defensive try/except in engine returns silently; plugin defensive paths use null-fallback).
- ✓ v0.2.124 pure-core dispatch HARD RULE: toggle decision lives in v0.2.143 pure-core; engine fold lives in `to_kit_notation`; plugin glue is the only I/O.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: satisfied by driver spike 2's PASS on all 4 checkpoints.
- ✓ v0.2.134 §5 inlined-version preflight: passed for v0.2.150.
- ✓ v0.2.144 bundled-vault bump preflight: passed (no vault content changes).

## §6 — User-side smoke (deferred to driver)

Per prompt §5:
1. BRAT update to v0.2.150.
2. Open `~/projects/forge-music/percussion/murmuration.md` (or `_spike2.md`).
3. Forge-click 🔥.
4. Multi-staff renders by default.
5. Click 🥁 Kit toolbar button (top-right of score area).
6. Score re-renders in kit notation.
7. Click any rendered note → corresponding instrument plays.
8. Click 🎼 Multi-staff → returns to canonical multi-staff.
9. Close + reopen Obsidian → last-chosen view persists per snippet.
10. Open a non-percussion music snippet → toolbar button hidden (`has_percussion: false`).

If all pass: kit-notation arc functionally complete end-to-end (v0.2.143 + v0.2.146 + v0.2.148 + v0.2.149 + v0.2.150).

If any fail: targeted follow-up per failure mode.

## §7 — Architectural framing

V1 music-domain feature complete. The Unpitched migration arc closed:
- v0.2.143: engine `to_kit_notation` + `has_percussion` + pure-core `view-mode-core.ts`.
- v0.2.146: Note → Unpitched migration (display positions).
- v0.2.148: `editorial.misc` AttributeError + spike-file exclusion convention.
- v0.2.149: `storedInstrument` per Unpitched note (MIDI routing).
- v0.2.150 (this drain): engine dual XML + plugin toggle.

Four runtime-evidence-beats-source-audit cases through the arc reinforce v0.2.132's HARD RULE. The canonical Score → multiple renderings pattern (multi-staff, kit) generalizes for future view modes (treble-only piano, chord-symbols-only, etc.).

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Open follow-ups + carry-forward

After this drain, the kit-notation arc closes. Remaining longer-term items (unchanged from v0.2.149 carry-forward):

1. **Dynamic mark anchoring** (v0.2.143 §3.5): defer until cohort smoke uncovers user-visible issues.
2. **`score_style:` frontmatter override** (v0342 §8 #1): defer until toolbar-only friction observed.
3. **Per-rendering MusicXML lazy compute** (v0342 §8 #2): defer until perf observed. Currently both XMLs are produced eagerly on every compute. For very long pieces this could add noticeable latency; defer the optimization until measured.
4. **Engine pytest vs pyodide music21 version pinning** (v0.2.148 §7 #2): worth a separate drain to prevent future audit-vs-runtime mismatches.
5. **Cohort doc update** (v0342 §8 #4): wait until forge-music gets a cohort doc.

## §9 — Hand-off

v0.2.150 shipped. Kit-notation arc complete. Driver smoke is the runtime evidence gate for "this feature actually works end-to-end". Queue empty after this drain.
