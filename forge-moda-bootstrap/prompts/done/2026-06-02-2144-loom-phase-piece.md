<!-- author: forge-music-cowork
     second-pass review: see "For forge-core second-pass review" section below
     focus: cross-cutting pattern (three-snippet composition via context.compute) -->

# Loom — Reich-style percussion phase piece (three-snippet structure)

## Scope

Author a new percussion piece, **Loom**, demonstrating Forge's snippet-composition primitives — split across three snippets in `forge-music/percussion/`:

1. **`phase_cell.md`** — a pure data snippet returning the rhythmic cell as a dict.
2. **`phase_shifter.md`** — a function-style snippet that takes a cell + parameters and returns a phased multi-voice `music21.stream.Score`.
3. **`loom.md`** — the composition; calls the above two via `context.compute(...)`.

The piece is a Reich-style percussion phase canon: 4 voices of closed hi-hat play the Reich "Clapping Music" 12-eighth cell; voices progressively shift by an eighth per section, then realign mathematically. ~80 seconds, 32 bars in 12/8 at 96 BPM.

`forge-music/percussion/murmuration.md` (the existing piece) must be untouched.

## Why

The user's ask: *"another version with some sort of a richer snippet structure with some paramatrization, if not superficial."* Murmuration is a 250-line monolithic snippet. This piece demonstrates three Forge primitives that aren't yet exercised in vault content:

1. **Data snippets returning structured Python values** (not just music — generic dict).
2. **Function-style action snippets** that take args from a calling snippet via `context.compute(snippet_id, *args, **kwargs)`. The engine supports this (`forge/forge/core/executor.py:143` — `def compute(self, snippet_id, *args, **inputs)`); no vault content currently uses it with args.
3. **Composition snippet** that wires the above together — a thin "what" snippet over the data + function "how."

The pattern generalizes — once Loom ships, additional Reich-shaped pieces could swap just the cell or change the shifter parameters without re-implementing the algorithm.

The cell choice (Reich's Clapping Music) makes the listener-recognizable provenance itself a Forge demo asset.

## Files to create

All paths absolute.

- `/Users/odedfuhrmann/projects/forge-music/percussion/phase_cell.md` — NEW
- `/Users/odedfuhrmann/projects/forge-music/percussion/phase_shifter.md` — NEW
- `/Users/odedfuhrmann/projects/forge-music/percussion/loom.md` — NEW

## Files to modify

- `/Users/odedfuhrmann/projects/forge-music/forge.toml` — bump `version = "0.3.6"` → `version = "0.3.7"`.
- `/Users/odedfuhrmann/projects/forge-client-obsidian/manifest.json` — bump version `{CURRENT} → {NEXT_PATCH}` (read at drain start; sub at drain; log both in §0 of feedback).

NO changes to:
- `/Users/odedfuhrmann/projects/forge/forge/music/lib.py` — all needed helpers (`closed_hihat`, `with_velocity`, `bar`) already exist.
- `/Users/odedfuhrmann/projects/forge/forge/music/llm_prompt.py` — no new helpers, no new rules required for this piece.
- Engine code — `context.compute(snippet_id, *args, **inputs)` is already supported.

## Implementation notes

### `phase_cell.md` — data snippet

Frontmatter:
```yaml
---
type: action
description: phase_cell
inputs: []
---
```

English facet: 1-paragraph description noting this is the Reich "Clapping Music" 12-eighth cell encoded as a dict; the instrument factory is `closed_hihat` for a percussion-canon timbre; the format is designed for consumption by `phase_shifter`.

Python facet:
```python
def compute(context):
    return {
        "instrument": closed_hihat,         # factory, not an instance
        "hits_in_eighths": [0, 1, 2, 4, 5, 7, 9, 10],  # 8 hits in 12 positions — Reich cell
        "length_eighths": 12,
    }
```

The cell encodes only the rhythm + timbre, not duration / velocity / measure structure — those are the shifter's job.

### `phase_shifter.md` — function-style snippet

Frontmatter:
```yaml
---
type: action
description: phase_shifter
inputs: []
---
```

English facet: explain that this snippet is parameterized — it takes a cell dict and shape parameters, then constructs a `music21.stream.Score` with N stacked Parts, each playing the cell repeatedly, with voice K accumulating phase shift `(K-1) * shift_per_section_eighths * (section_index)` eighths modulo the cell length. Voice 1 is the anchor (never shifts). Document the realignment events that follow from this formula (e.g., with `voices=4, shift_per_section_eighths=1`, voice 4 realigns with voice 1 at section 5).

Python facet — signature (CC may refine internal names):
```python
def compute(context, cell, voices=4, bars_per_section=4, total_sections=8,
            shift_per_section_eighths=1, ts_str='12/8', bpm=96,
            velocity_profile='human'):
    """
    Build a phased multi-voice Score from a cell.

    cell: dict with keys 'instrument' (factory), 'hits_in_eighths' (list[int]),
          'length_eighths' (int).
    voices: number of stacked Parts. Voice 1 is the anchor (offset 0 always);
            voice K (K>=2) has cumulative offset (K-1) * shift_per_section_eighths
            * section_index, modulo cell['length_eighths'].
    Returns a music21.stream.Score with `voices` Parts, each containing
    total_sections * bars_per_section measures in the given ts/bpm,
    with velocity applied per the named profile via with_velocity().
    """
```

Implementation hints (not prescriptive — CC adapts to what works):

- Time signature: `meter.TimeSignature(ts_str)`. Tempo: `tempo.MetronomeMark(number=bpm)`. With `ts_str='12/8'` and `bars_per_section=4`, each section is exactly 4 bars × 12 eighths = 48 eighth-positions = 4 cells per section per voice.
- For each voice K (1..voices), build a `stream.Part`. Set `inst = cell['instrument']()`, insert at offset 0. Insert ts + mm into part (or score header).
- For each section S (0..total_sections-1), compute `offset_eighths = ((K-1) * shift_per_section_eighths * S) % cell['length_eighths']`.
- Then for each cell repetition within the section (`bars_per_section * length_eighths / length_eighths` = `bars_per_section` repetitions, since cell == 1 bar in 12/8), place hits at the absolute eighth-positions: starting position = (section_start_eighths + cell_repetition * length_eighths) + offset_eighths, then add length_eighths and modulo into the cell for hit positions. (Use the rotation-by-offset interpretation: the cell's hit-list is rotated by offset_eighths, then placed at section_start + cell_rep_index * length_eighths.)
- Each hit is `cell['instrument']()` with `quarterLength = 0.5` (one eighth note). Wrap with `with_velocity([...], velocity_profile)` per voice or per section as appropriate (the `with_velocity` helper already takes a profile string).
- Don't forget: percussion uses `note.Unpitched()` or `cell['instrument']()` instances depending on lib convention. Existing percussion factories (`closed_hihat`, etc.) return music21 Instrument objects; check how Murmuration creates hits (`/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md`) and follow the same pattern.
- Return the assembled `Score`.

### `loom.md` — composition snippet

Frontmatter:
```yaml
---
type: action
description: loom
inputs: []
---
```

English facet: ~150-word description introducing the piece. Suggested framing — *"Loom — four threads of the Reich 'Clapping Music' cell weave through each other, shifting by an eighth note per section. The threads diverge then mathematically realign: voice 4 returns to unison with voice 1 at section 5, voice 3 at section 7. The piece is what those shifts sound like — phase music as woven fabric. Closed hi-hat for all four voices; 32 bars in 12/8 at 96 BPM; ~80 seconds."* Mention that the structure delegates the cell to `phase_cell` and the shifting logic to `phase_shifter`, then composes them.

Python facet:
```python
def compute(context):
    cell = context.compute("phase_cell")
    score = context.compute(
        "phase_shifter",
        cell,
        voices=4,
        bars_per_section=4,
        total_sections=8,
        shift_per_section_eighths=1,
        ts_str='12/8',
        bpm=96,
        velocity_profile='human',
    )
    return score
```

That's it. The composition snippet stays tiny — that's the demo.

## Tests

### Auto-verifiable by CC (mandatory)

Add tests to `/Users/odedfuhrmann/projects/forge/tests/music/` (or a new file under `tests/` if a cleaner location exists). All tests run inside the snippet engine — build a tmp_path vault with the three snippets, resolve + execute, assert on returns. Match existing test conventions in `tests/music/test_lib.py` and `tests/core/test_executor.py` for in-memory snippet construction.

Required cases:

1. `test_phase_cell_returns_clapping_music_shape` — cell dict has expected keys, hits_in_eighths is `[0, 1, 2, 4, 5, 7, 9, 10]`, length_eighths is 12.
2. `test_phase_shifter_returns_score_with_n_voices` — vary `voices` parameter (2, 4, 6); assert `len(score.parts) == voices`.
3. `test_phase_shifter_voice_1_is_anchor_never_shifts` — first part's hit positions in the first measure of any section equal the cell's hits_in_eighths.
4. `test_phase_shifter_voice_k_shifts_per_formula` — voice K offset at section N is `(K-1) * shift_per_section_eighths * N` mod cell_length. Pick voice=3, section=2, shift=1 → expected offset = 4 eighths. Read offsets from the second part's notes in section 2 and assert.
5. `test_phase_shifter_total_bar_count` — `total_sections * bars_per_section` measures per part.
6. `test_loom_composes_via_context_compute` — full integration: build a tmp vault with all three snippet files, resolve "loom", assert returned Score has 4 parts and 32 measures per part.

Run the full suites:
- `cd /Users/odedfuhrmann/projects/forge && pytest -q` — report pass count as `X/X in Y ms`.
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && npm test` — report as `X/X in Y ms`.

Engine bundle drift check (per the protocol established in v0.2.30):
- `cd /Users/odedfuhrmann/projects/forge-client-obsidian && npm run sync-engine-bundle` — report whether it produced any diff.
- Verify `bundle/forge/music/lib.py` is byte-equal to `/Users/odedfuhrmann/projects/forge/forge/music/lib.py` (no change expected, since no lib edits).

Release artifact preflight:
- Build the release zip per the existing build-release-zip script. Compute SHA256.
- Clean-vault smoke (per "Release-shipping prompts must include clean-vault smoke" rule): in a fresh temp dir, unzip the release artifact, verify it contains `percussion/loom.md`, `percussion/phase_cell.md`, `percussion/phase_shifter.md`, AND the existing `percussion/murmuration.md`. Report all four paths as present.

Cross-vault version log (§0 of feedback file):
- `forge-music/forge.toml`: 0.3.6 → 0.3.7 (within-vault, concrete).
- `forge-client-obsidian/manifest.json`: `{CURRENT} → {NEXT_PATCH}` — read at drain start, log both substituted values.

### Deferred to user (manual smoke)

Leave these for the user to run in the review answer after delivery — DO NOT script or attempt:

1. Install plugin in Obsidian (the version `{NEXT_PATCH}` per §0).
2. Forge-click `percussion/loom.md` in Obsidian.
3. Verify Verovio renders 4 stacked percussion staves.
4. Click play button — html-midi-player plays back ~80 seconds of phasing hi-hats.
5. Click MusicXML download → open in MuseScore → verify all 4 staves render as percussion (no "Piano, Closed Hi-Hat" prefix; staves are single-line percussion).
6. Listening verification: at section 5 (bars 17-20), voice 4 should sound back in unison with voice 1 (the realignment is audible).

## Out of scope

- DO NOT modify `forge-music/percussion/murmuration.md`. Murmuration is shipping content; this prompt adds alongside, never edits.
- DO NOT modify `forge/forge/music/lib.py`. All helpers needed are present.
- DO NOT modify `forge/forge/music/llm_prompt.py`. No new English-facet rules required.
- DO NOT modify the constitution. Forge-music cowork does not touch the constitution; if the three-snippet pattern needs a clause, forge-core cowork will propose it separately.
- DO NOT add additional Reich-style pieces (e.g., `phase_8_voices.md`, `phase_clapping_cell_only.md`) — that's a follow-up if Loom lands well.
- DO NOT generalize `phase_shifter` to handle multi-instrument cells. The cell is single-instrument by design; multi-instrument is a future variation.
- DO NOT edit `forge/forge/core/executor.py` even if the args-passing implementation feels under-documented. Engine semantics are forge-core territory.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-02-2144-loom-phase-piece.md` with sections:

0. **Versions used.** Both substituted values for `{CURRENT} → {NEXT_PATCH}` placeholder + forge-music 0.3.6 → 0.3.7 confirmation.
1. **Files created.** Absolute paths + line counts.
2. **Files modified.** Diffs (or before/after for version bumps).
3. **Tests.** All 6 cases — pass/fail, runtimes. Both `pytest -q` + `npm test` totals.
4. **Engine bundle drift.** Result of `npm run sync-engine-bundle` (expected: no diff).
5. **Release artifact.** Path, SHA256, clean-vault smoke result (4 percussion paths present).
6. **Commit + tag + release.** Git log of commits, tag name, GH release URL.
7. **User-side smoke checklist.** Numbered 1-6 (the deferred section above), unchanged. The user will run these.
8. **Surprises / deviations.** Anything that diverged from this prompt's design — especially in the shifter algorithm, since I sketched the math but didn't implement it.

## Don'ts

- Don't "fix" `velocity_profile='human'` to a literal int. The string profile is the existing `with_velocity` API contract.
- Don't tile the cell against a 4/4 bar — the 12-eighth cell does not divide 16 quarters cleanly. The piece is in 12/8 specifically to make cell == 1 bar.
- Don't add a `# Composition` heading or other custom headings. Stick to `# English` and `# Python` per existing snippet conventions.
- Don't capture `phase_cell`'s instrument factory by calling it (`closed_hihat()`) inside the cell dict. Store the factory itself; the shifter calls it per hit.
- Don't speculatively bump `forge/forge.toml` or any other version not listed in "Files to modify."
- Don't push the release without running clean-vault smoke. Per the protocol, that's load-bearing.

## For forge-core second-pass review (if user routes)

The user may route this prompt path to a forge-core cowork session for second-pass review before draining. If so, the cross-cutting items to evaluate:

1. **Three-snippet composition pattern (data + function + composition).** Engine supports it natively (`executor.py:143`). No vault content currently uses `context.compute(snippet_id, *args, **kwargs)` with args. This prompt introduces that usage shape into shipped content. **Level-2 candidate** (existing primitive, novel usage in vault) — does the constitution want to recognize this as a sanctioned authoring shape, perhaps in a B-series clause about snippet roles? Or is it implicit in B2 (snippets get full Python power) and needs no clause? Forge-core's call.

2. **No new constitution clauses proposed by forge-music** — staying in domain lane.

3. **Tests live in `forge/tests/music/`** — that's domain test territory, not engine. If forge-core thinks the composition-pattern tests belong in `tests/core/test_executor.py` instead (because they test the engine's args-passing more than music-specific logic), that's a reasonable redirect.
