---
timestamp: 2026-06-27T12:00:00Z
session_id: drain-2026-06-27-1200
status: pending
priority: HIGH — V2 architectural validation; gates whether V2 implementation proceeds
---

# V2 SPIKE — Mini solitary end-to-end (validate the spec is buildable)

## §0 — Context

V2 spec at `~/projects/forge-moda-bootstrap/v2-spec.md`. Read it first. This spike validates that the spec is implementable end-to-end with a minimum-viable example.

**This is a spike, not a release.** Ship behind a feature flag; do not break V1. The goal is "yes, this can be built as specified" or "here's the specific gap." Either outcome unblocks the next decision.

## §1 — Spike scope

### What this spike implements

1. **One engine primitive**: `play_at_beats(instrument, beats)` in `forge/forge/music/lib.py`. Builds a music21 Part with notes at given beat offsets, handling percMapPitch correctly for MIDI export (per v0.2.159 lesson).
2. **One render chip**: `show_score(score)` — a side-effect chip that emits the Score for Forge Output to render. (May reuse v0.2.150+ Score rendering.)
3. **One V2-shape vault note**: `_v2_spike_solitary.md` in `~/projects/forge-music/` with the new V2 structure (Description + E--, no Python facet, minimized frontmatter).
4. **E-- parser MVP** capable of handling:
   - `Let X = Y.`
   - `Repeat N times: ... ` block
   - `For each X in Y: ...` block (used or skipped — see §3)
   - Chip call: `Call [[name]] with param=value, ...` AND parameterless shorthand `[[name]].`
   - Literal lists `[1, 2, 3]`
   - `Return X.` and `Return.`
5. **E-- → Python transpile** for the above constructs.
6. **Compile pipeline** plumbed through pyodide: read V2-shape note, transpile E-- to Python, execute, render output.
7. **Forge-click on the V2 note** runs the above and shows the score (notation + audio).

### What this spike SKIPS

- /generate (Description → E-- via LLM) — out of scope.
- Caching, hashing, lock mechanism — minimal/no caching; recompile every click.
- `{{...}}` LLM blanks — out of scope.
- Description's `## Inputs` enforcement — out of scope (note will have inputs but parser doesn't validate against it yet).
- Data notes — out of scope (this spike is action-only).
- Chip palette UI changes — V1 palette stays as-is; cohort writes E-- by hand for the spike note.
- V1 backwards-compatibility checks (the V2 note uses a different file structure; V1 notes continue working untouched).
- Migration of any existing notes.

## §2 — The spike note

Create `~/projects/forge-music/_v2_spike_solitary.md` with this exact content (this is the spec-compliant V2 note):

```
---
type: action
---

# Description

A minimal solitary pattern — kick on beats 1 and 3 of a single bar. V2 spike
test. Renders as a drum-kit score with audio playback.

## Inputs

(none)

# E--

Let part = Call [[play_at_beats]] with instrument=kick(), beats=[1, 3].
[[show_score]] part.
Return part.
```

Note structure:
- `type: action` only in frontmatter
- `# Description` with prose + `## Inputs` (empty here since no params)
- `# E--` with: chip call (capture), bare-shorthand show chip, Return
- No `# Python` facet
- No `description:` frontmatter field (the `# Description` facet replaces it)

Frontmatter should be HIDDEN by default in the editor view (CSS class gating per v0.2.116+).

## §3 — Investigation phase (per §78)

### §3.1 — Where does the V2 note live in the existing system?

The plugin's existing snippet loader expects `# English` and `# Python` facets. The V2 note has neither — it has `# Description` and `# E--`.

Two options:
- **A**: detect V2 shape by presence of `# E--` heading; route to a separate V2 compile path. V1 notes (with `# English`) continue through legacy.
- **B**: feature flag in frontmatter (e.g. `v2_shape: true`); explicit opt-in.

My pick: **A** (auto-detect). Less ceremony.

### §3.2 — E-- parser strategy

Two choices:
- **A**: hand-written recursive-descent parser in pyodide-host's embedded Python. ~200 lines. Direct control over error messages.
- **B**: use a parser library (lark, PEG). Faster to write but adds wheel dependency.

My pick: **A** (hand-written). Simpler dependency story; full control over E-- grammar evolution.

### §3.3 — Engine primitive surface

`play_at_beats(instrument, beats)` lives at `forge/forge/music/lib.py`. Returns a music21 Part with:
- The Instrument bound (for channel-10 routing)
- A note.Note at each beat offset (with correct percMapPitch handling for MIDI — see v0.2.159 lesson)
- Quarter-length notes (or default; spec doesn't pin)

`show_score(score)` is a side-effect chip. Implementation can be:
- A no-op at the Python level that just returns the score (and the compile pipeline auto-renders the returned value via §15.4 fallback)
- OR an explicit "emit to Forge Output" hook

For the spike: implement as a passthrough that calls existing v0.2.150+ rendering. Future iteration can split into proper side-effect-only chip.

### §3.4 — Chip resolution

E-- contains `[[play_at_beats]]` and `[[show_score]]`. The transpile step resolves these to library function calls.

For the spike: hardcode a small chip registry in pyodide-host that maps wikilink names to library function references. V2 proper will have auto-discovery from `forge/music/lib.py`; spike can be manual.

## §4 — Implementation phases

### Phase 1: engine primitive + transpile target verification (~30 min)

1. Add `play_at_beats(instrument, beats)` to `forge/forge/music/lib.py`.
2. Add a Python unit test: feed it `kick(), [1, 3]`; assert returns a Part with 2 notes at beat offsets 0 and 2 (assuming beats are 1-indexed → quarterLength offsets), each with correct percMapPitch handling.
3. Run music21's `streamToMidiFile` on the result; verify the MIDI bytes have correct drum pitches (per v0.2.159 fix pattern).
4. Add `show_score(score)` as a passthrough.

### Phase 2: V2 note detection + E-- parser (~60 min)

1. In pyodide-host's embedded Python: detect V2 shape by checking for `# E--` heading in the snippet body.
2. Extract the `# E--` body text.
3. Implement a hand-written parser for the E-- subset listed in §1.4:
   - Lexer: tokenize keywords (`Let`, `Repeat`, `Call`, `with`, `Return`, `For`, `each`, `in`, `If`, `Otherwise`), identifiers, literals, brackets, operators, periods.
   - Parser: produce an AST.
4. Add Python unit tests for the parser: each E-- construct → expected AST.

### Phase 3: E-- → Python transpile (~45 min)

1. AST → Python source.
2. Wrap in `def compute(context): ...` (the existing Forge convention).
3. Resolve `[[chip_name]]` to the chip registry (hardcoded for spike).
4. Add unit tests: each AST → expected Python source.

### Phase 4: end-to-end wire-up (~45 min)

1. In pyodide-host's `_forge_run_snippet`: if V2 shape detected, route through the new parser/transpiler instead of the legacy English/Python path.
2. Execute the transpiled Python.
3. Pass result to existing render pipeline (Score → SVG + MIDI per v0.2.157+).
4. Smoke handoff to driver.

### Phase 5 (optional): UI affordances (~30 min)

1. Frontmatter hide should already work via v0.2.116+ CSS class gating; verify on the V2 note.
2. Verify `# Description` and `# E--` render cleanly in the editor (markdown view).
3. No new chip palette work — cohort hand-writes the V2 note for this spike.

## §5 — Tests required

Engine:
- `play_at_beats` returns expected Part structure.
- `play_at_beats` MIDI export has correct drum pitches.
- 2-4 unit tests.

Plugin / parser:
- Parser handles each E-- construct (5-10 tests).
- Transpiler produces correct Python for each AST node (5-10 tests).
- V2-shape detection works (2-3 tests).

## §6 — User-side smoke (driver)

1. BRAT update to the spike version (will be v0.2.161+ depending on auto-bump).
2. Open `~/projects/forge-music/_v2_spike_solitary.md` in Obsidian.
3. Verify the file shows `# Description` + `# E--` sections cleanly; frontmatter hidden.
4. Forge-click 🔥.
5. Expected:
   - Brief delay (parse + transpile + execute)
   - Score renders in Forge Output: single bar in drum-kit notation, 2 kick notes on beats 1 and 3
   - Audio plays correctly (kick drum sound, NOT bongo at pitch 60 — per v0.2.159 lesson)
6. If anything fails, paste the DevTools console output.

## §7 — Validation criteria

The spike is SUCCESSFUL if all of the following are true:

- ✓ V2 note renders without parse errors
- ✓ E-- → Python transpile produces valid Python
- ✓ `play_at_beats(kick(), [1, 3])` produces a Part with correct structure
- ✓ Forge-click runs end-to-end without exceptions
- ✓ Score renders in Forge Output (notation visible)
- ✓ Audio plays with correct drum pitches (kick on beats 1 and 3, NOT bongo)
- ✓ V1 notes still work (regression check on a V1 snippet)

If all pass: V2 spec is implementable as designed. Move forward with full V2 work bundle.

If any fail: surface the specific gap; spec revision per gap; re-attempt spike.

## §8 — Per-protocol HARD RULE compliance

- ✓ §78: spike investigation phase before implementation.
- ✓ §57–74: TDD — parser and transpiler tests are failing-first.
- ✓ §86–118: pure-cores extracted (E-- parser, transpiler).
- ✓ §76: spec-driven; no speculative architecture beyond what's specified.
- ✓ §321: feedback before move.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: the driver smoke (§6) IS the runtime evidence gate. Don't claim spike success without driver confirmation of audio playback.

## §9 — Out of scope (explicit non-goals)

- /generate workflow
- Caching, hashing, lock
- `{{...}}` LLM blanks
- Data notes
- Chip palette UI for V2 chip discovery
- Migration of any existing notes
- Vault-wide enforcement of V2 shape (V1 notes coexist)
- Multi-snippet composition (this spike has one note calling one engine primitive; no note-to-note calls)

The spike is intentionally minimal. Resist scope creep — if it works, the full V2 arc handles everything else.

## §10 — Hand-off

Suggested order:
1. Phase 1 (~30 min)
2. Phase 2 (~60 min)
3. Phase 3 (~45 min)
4. Phase 4 (~45 min)
5. Phase 5 (~30 min, optional)
6. Driver smoke handoff

Total estimated CC time: 3-4 hours.

If any phase surfaces an unexpected wrinkle:
- **Spec gap** (something the spec didn't anticipate): document, pause, surface to driver for spec revision.
- **Implementation difficulty** (the spec is fine but the path is harder than expected): try alternative; if alternative still hard, surface.

Don't push through a wrong design. The spike is here to surface issues; surfacing them IS the win.

## §11 — Architectural framing

This is the gate. Success here means V2 is real and the migration arc can begin. Failure here means we revise the spec and re-spike.

The spec is exhaustive on paper; this spike makes it real. Whatever happens, we learn more about V2 in 4 hours of implementation than in 4 weeks of brainstorming.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
