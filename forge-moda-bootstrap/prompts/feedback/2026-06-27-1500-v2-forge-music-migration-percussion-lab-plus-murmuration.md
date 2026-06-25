---
prompt: 2026-06-27-1500-v2-forge-music-migration-percussion-lab-plus-murmuration.md
shipped_version: v0.2.166
session: drain-2026-06-27-1500
date: 2026-06-27
status: shipped — all 10 V2 migrations + V2 inputs handling + 2 new chips; awaiting cohort smoke per §7
---

# v2-migration feedback — forge-music percussion_lab + murmuration shipped

## §0 — TL;DR

All 10 target migrations shipped end-to-end:
- 8 percussion_lab leaf sections (solitary, companions, dispersing, gathering, peak, resting, swarming, threading) — each computes a 7-Part Score with the right note counts.
- 2 compositions (wake, murmuration) — transpile to `sequence_list(sections=[...])`; runtime resolution via the existing sibling-shim mechanism.

One **spec gap surfaced + driver-resolved** mid-drain: V2 `## Inputs` declarations had no transpiler threading. Driver picked "Extend V2 now" over hardcode-and-defer. Shipped:
- `extract_inputs_declarations` parses Description's `## Inputs`.
- `transpile(module, inputs=...)` emits `def compute(context, NAME=DEFAULT, ...)`.
- Reuses V1's kwarg-passing calling convention so V2 snippets share runtime model with V1.

Two new chips (well under the §11 SPLIT threshold of ~10): `play_at_offsets` (composite section builder) + `sequence_list` (variadic-list wrapper for `sequence(*xs)` since E-- has no `*args`).

One **lexer regression caught + fixed during execute-smoke**: `[[0, 2], [0, 2]]` greedy-matched as a single wikilink, breaking every per-bar varying pattern. Fix: `[[` only accepts a valid identifier; otherwise emits a plain `[` OP.

forge-music/forge.toml bumped 0.3.11 → 0.4.0 (V2 release marker; triggers cohort re-extract per v0.2.144 preflight contract).

## §1 — Investigation findings (§2 of prompt)

### §1.1 — Existing chip library (§2.1)

`forge/music/lib.py` had 22 chips: all instruments + `play_at_beats` + `show_score` (from spike) + `voices_canonical` / `sequence` / `with_velocity` / `bar` / `repeat` / others. Spec §16 was already mostly covered; only a small delta needed for this drain.

### §1.2 — V1 percussion_lab audit (§2.2)

Every section uses the same shape: `(offset, duration)` pair patterns with 0.25-quarter (16th-note) durations, cyclic 4-bar patterns, `_build_bar` helper for rest-padding, `MetronomeMark` + `TimeSignature` on bar 1, `with_velocity` + `mark_dynamics` for the dynamic mark. All composable into ONE high-level chip.

### §1.3 — Chip-add list (§2.3)

The eventual chip-add list was just **2 chips**:
- `play_at_offsets(instrument, offsets, duration, bars, time_signature, tempo_bpm, velocity, mark_dynamics)` — composite section builder. Polymorphic `offsets` (flat list or list-of-lists).
- `sequence_list(sections)` — variadic-list wrapper for `sequence(*xs)`.

Well under the §11 SPLIT GUIDANCE threshold (~10 chips). Drain proceeds full-scope.

### §1.4 — V1/V2 coexistence (§2.4)

Verified empirically by leaving the legacy executor's snippet-shim mechanism unchanged. V2-transpiled `solitary(bars=4)` looks identical to V1-transpiled `solitary(bars=4)` — both resolve through `_build_snippet_shims` → `context.compute("solitary", bars=4)`. Confirmed via execute-smoke (after the lexer fix).

## §2 — Spec gap (per prompt §10): V2 `## Inputs` had no transpiler threading

### §2.1 — Finding

V1 `solitary.md` declared `def compute(context, bars=4)`. V2 spec §4.7 says `## Inputs subsection REQUIRED when the note has parameters`. But neither the v2-spec nor the v2-spike addressed how Description's `## Inputs` translated through the parser/transpiler to compute() kwargs. My v2-spike's transpiler emitted bare `def compute(context):`. Every parameterized note (every percussion_lab section + murmuration's section calls) was unmigrable.

### §2.2 — Driver decision

Surfaced via AskUserQuestion mid-drain with three options (Extend V2 now, hardcode + defer, pause + revise spec). Driver picked **Extend V2 now**.

### §2.3 — Engine extension shipped

- `detect.py`: `extract_inputs_declarations(body)` returns `List[InputDecl]` from `## Inputs` subsection. Format per spec §4.7: `- name (default value) — description`. Defaults parsed via `ast.literal_eval` (ints / floats / strings / lists / bools / None). 8 pytests cover edge cases.
- `transpiler.py`: `transpile(module, inputs=None)` accepts the input list and emits `def compute(context, NAME=DEFAULT, ...)`. Reuses V1's kwarg-passing convention so V2 snippets call each other via the existing sibling-shim mechanism.
- `parser.py`: `BoolLit` + `NoneLit` AST nodes for `True` / `False` / `None` literals (needed for `mark_dynamics=True`).
- `executor.py` `resolve_action_code`: threads `extract_inputs_declarations` into the V2 transpile call.

## §3 — Lexer regression caught during execute-smoke

### §3.1 — Symptom

After writing the leaf migrations + running the engine smoke, 5 of 8 leaf notes failed with `positional argument follows keyword argument` or `closing parenthesis ']' does not match opening parenthesis '('`. All 5 use per-bar varying patterns like `offsets=[[0, 2], [0, 2]]`.

### §3.2 — Root cause

V2 lexer's `[[` matched eagerly to the **next `]]`** as a wikilink — so `[[0, 2, 3.5], [0, 2], [0, 2], [0]]` got eaten as one wikilink whose name was `0, 2, 3.5], [0, 2], [0, 2], [0`. Transpiler then emitted gibberish.

### §3.3 — Fix

`[[` only accepts a wikilink if the content between `[[` and the next char forms a valid identifier (`[A-Za-z_]\w*`). Otherwise, emit a single `OP("[")` token and let the parser handle consecutive `[`s as nested list literals.

After fix: all 8 leaf sections execute-smoke clean. Note counts match V1 (solitary=8 notes, peak=130, etc.).

## §4 — What shipped

### §4.1 — Engine extension (V2 module)

- `detect.py`: `+extract_inputs_declarations(body)` (~50 LOC).
- `transpiler.py`: `+inputs` param on `transpile()` (~15 LOC).
- `parser.py`: `+BoolLit` / `+NoneLit` AST + lexer fix (~30 LOC).
- `__init__.py`: re-export `InputDecl`, `extract_inputs_declarations`.
- 8 new pytests in `test_inputs.py`.

### §4.2 — Two new chips (forge/music/lib.py)

- `play_at_offsets(instrument, offsets, duration=0.25, bars=4, time_signature='4/4', tempo_bpm=96, velocity=None, mark_dynamics=False)` — composite chip. Polymorphic offsets, MIDI export percMapPitch-correct (v0.2.159 lesson baked in). 15 pytests in `test_play_at_offsets.py` including MIDI byte regression guard.
- `sequence_list(sections)` — variadic-list wrapper for `sequence(*xs)`.

### §4.3 — Engine executor update

`_FORGE_MUSIC_LIB_NAMES` += `play_at_offsets`, `sequence_list`.

### §4.4 — Vault migrations

All in-place overwrites in `forge-music/`:

| File | V1 voices | V2 chip calls | Smoke (engine pytest) |
|---|---|---|---|
| `percussion_lab/solitary.md` | 1 (kick) | 1 `play_at_offsets` | ✓ 8 notes |
| `percussion_lab/companions.md` | 2 (kick + closed-hihat) | 2 | ✓ 24 notes |
| `percussion_lab/dispersing.md` | 6 (kick + snare + chh + ohh + tom) | 6 | ✓ 60 notes |
| `percussion_lab/gathering.md` | 3 | 3 | ✓ 59 notes |
| `percussion_lab/peak.md` | 6 (full kit + crash) | 6 | ✓ 130 notes |
| `percussion_lab/resting.md` | 1 (kick only) | 1 | ✓ 5 notes |
| `percussion_lab/swarming.md` | 6 | 6 | ✓ 76 notes |
| `percussion_lab/threading.md` | 3 | 3 | ✓ 32 notes |
| `percussion_lab/wake.md` | composition (6 sub-section calls) | `sequence_list` | ✓ transpile clean |
| `percussion/murmuration.md` | composition (8 sub-section calls) | `sequence_list` | ✓ transpile clean |

Every leaf section returns a 7-Part Score with 4 Measures and the expected per-voice note counts. Compositions transpile to `sequence_list(sections=[s1, s2, ...])` — runtime resolution via the existing sibling-shim mechanism (verified by V2 spike).

### §4.5 — Forge.toml bump

`forge-music/forge.toml` 0.3.11 → 0.4.0. Per cc-prompt-queue HARD RULE + prompt §12, this signals V2 release for cohort re-extract.

### §4.6 — Test updates

`test_wake_has_brief_peak_relative_to_fade` was V1-shape regex-only (`context.compute("name", bars=N)`); now also recognizes V2 (`Call [[name]] with bars=N.`). Semantic assertion (peak bars=2 + dispersing bars=8) unchanged.

### §4.7 — Plugin release

v0.2.166. Engine bundle synced; bundled forge-music vault updated to V2 sources. 786 plugin tests passing.

## §5 — Validation criteria check (prompt §7)

Engine-layer (verifiable from terminal):

- ✓ Every V2 percussion_lab note parses without error.
- ✓ Every V2 transpile produces compilable Python (resolved by my lexer fix).
- ✓ Every leaf section computes a 7-Part Score with expected structure.
- ✓ Compositions transpile to `sequence_list(...)` — runtime path via sibling shims (validated by V2 spike).
- ✓ Engine pytests: 243 passing.
- ✓ Plugin tests: 786 passing.

Runtime-layer (deferred to driver per v0.2.132 HARD RULE):

- ☐ Forge-click each migrated note → score renders, audio plays correct drum pitches.
- ☐ Forge-click murmuration → 8-section composition renders, kit-toggle works, audio matches pre-migration.
- ☐ V1 regression: a non-migrated V1 note (e.g., `blues/twelve_bar_blues_progression.md`) still computes.

## §6 — User-side smoke (driver, per prompt §7)

### §6.1 — Per-note smoke

For each migrated note (or sample):
1. BRAT update to v0.2.166.
2. Open the note in Obsidian.
3. Verify frontmatter hidden; `# Description` + `## Inputs` + `## Mechanics` + `# E--` render cleanly.
4. Forge-click. Expect: brief delay, score renders (auto-render fallback since leaf notes don't call `[[show_score]]`), no exceptions.

### §6.2 — Murmuration smoke

1. Open `forge-music/percussion/murmuration.md`.
2. Forge-click.
3. Expect:
   - Brief delay (composes 8 sections).
   - Full score renders.
   - Multi-staff / kit toggle works (per v0.2.151-160).
   - MIDI plays through with correct drum pitches.
4. Compare to pre-migration murmuration: same audio, same notation, same structure.

### §6.3 — V1 regression smoke

1. Open `forge-music/blues/twelve_bar_blues_progression.md` (or any non-migrated V1 note).
2. Forge-click.
3. Expect: still works — legacy V1 path unchanged.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 investigation-before-design: §1 audit completed before writing notes.
- ✓ §57–74 TDD: every new chip + parser surface has failing-test-first coverage.
- ✓ §86–118 pure-cores: `play_at_offsets`, `sequence_list`, `extract_inputs_declarations` are pure functions with zero side effects.
- ✓ §76 don't ship speculative: each migration replaces V1 with V2 of the same semantic — no speculative new behavior.
- ✓ §347 version-bump sanity: release.sh bumped 0.2.165 → 0.2.166 cleanly.
- ✓ §321 feedback before move: this file written before prompt move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: §5 explicitly separates engine-layer (passed) from runtime-layer (deferred to driver).
- ✓ v0.2.134 inlined-version preflight: passed.
- ✓ v0.2.144 bundled-vault bump preflight: forge-music/forge.toml bumped 0.3.11 → 0.4.0.
- ✓ v0.2.147 spike-file exclusion: `_v2_spike*.md` continues to be excluded.

## §8 — Architectural notes

### §8.1 — V2 reuses V1's runtime model — confirmed

Per v2-spike feedback §6.1 prediction: migration was a pure surface rewrite. No engine churn on the runtime path. V1's `_build_snippet_shims` + `_FORGE_MUSIC_LIB_NAMES` mechanism transparently absorbs V2 snippets. murmuration's V2 transpile (`solitary(bars=4)`) literally compiles to the same Python call as V1's transpile would have.

This validates the V2 architecture's split: surface layer (parser/transpiler) is V1-vs-V2 differentiator; runtime layer is shared.

### §8.2 — `play_at_offsets` is the cohort-author surface for percussion

Pre-V2, cohort authors had to write the `_cycle` + `_build_bar` + `_build_part` boilerplate (50+ lines per section). V2 condenses to ~1 line per voice. Composition vocabulary (offsets, durations, velocity profile) is the same; the boilerplate is gone.

### §8.3 — Lexer's `[[` ambiguity is general

Initially `[[ident]]` (wikilink) and `[[number, ...]]` (nested list literal) had identical lex-startup. The fix — require identifier content for wikilink — generalizes cleanly: any future syntax that starts with `[[` and isn't an identifier falls through to list-literal handling.

## §9 — Open follow-ups + carry-forward

1. **forge-moda migration** — next focused drain per prompt §9 #1.
2. **forge-tutorial migration** — next focused drain per prompt §9 #2.
3. **`/generate` workflow** — Description → E-- via LLM. Deferred until migration patterns settle (per spec §10).
4. **`{{...}}` slot resolution** — V2.1.
5. **Chip palette V2 UX** — V2.1.
6. **Vendored E-- (`forge/e_minus_minus/`) deprecation** — after all V1 consumers migrate.
7. **Kick.md + show_score.md in source vault** — driver added these during V2 testing. They synced cleanly to bundled vault. Likely intentional (per-instrument example notes?). Not in scope to interpret; flagged for driver reference.

## §10 — Architectural framing

V2 migration arc, phase 1 of N. percussion_lab + murmuration migrated. Pattern established: investigation → chip extension → in-place rewrites → engine pytest → runtime driver smoke.

forge-moda + forge-tutorial migrations follow the same recipe.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §11 — Hand-off

v0.2.166 shipped. All 10 target migrations + V2 inputs handling + 2 new chips end-to-end. Driver smoke per §6 is the runtime evidence gate.

Queue empty after this drain.
