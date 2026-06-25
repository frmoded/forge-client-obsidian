---
timestamp: 2026-06-27T15:00:00Z
session_id: drain-2026-06-27-1500
status: pending
priority: HIGH — V2 migration arc; first real V2 content
---

# V2 — forge-music migration (percussion_lab + murmuration)

## §0 — Context

V2 spec at `~/projects/forge-moda-bootstrap/v2-spec.md` (v1.0, frozen).

V2 spike shipped v0.2.165 — engine + parser + transpiler + routing validated end-to-end. Driver smoke confirmed (audio + score render correctly per spec).

This drain begins the V2 migration arc. Bundles three steps from the V2 work bundle:
- **§4 (V2-1)**: Migrate `percussion_lab/solitary.md` (proof-of-pattern)
- **§5 (V2-2)**: Migrate rest of `percussion_lab/` (companions, dispersing, gathering, peak, resting, swarming, threading, wake)
- **§6 (V2-3)**: Migrate `forge-music/percussion/murmuration.md` (composition)

Per CC's v0.2.165 §6.1 insight: V2 reuses V1's runtime model. Migration is a pure surface rewrite — no engine churn, no behavioral risk on the runtime path.

## §1 — Migration scope

### What this drain implements

For each note (~9 percussion_lab + 1 murmuration):
1. Convert frontmatter to V2 minimum (`type: action` only; drop `description`, `inputs`, etc.).
2. Rewrite `# English` content as `# Description` with `## Inputs` subsection (when params exist).
3. Translate `# Python` body to `# E--` using V2 dialect (`Let`, `Call ... with`, `Return`).
4. Use chip-call syntax for all library/note references.
5. Add explicit `[[show_score]]` for top-level pieces (murmuration); skip for sub-section notes (called by composition).
6. Add any missing chip primitives to `forge/music/lib.py` (see §2 investigation).
7. Smoke per note (compute + render + audio).

### What this drain does NOT do

- Build /generate (Description → E-- via LLM) — out of scope; cohort hand-writes E-- for now.
- Migrate forge-moda or forge-tutorial — separate drains.
- Add `{{...}}` slot resolution — out of scope.
- Modify the V2 parser/transpiler — already shipped in v0.2.165.
- Delete V1 source from git history — git keeps it; migration is in-place overwrite.

## §2 — Investigation phase (per §78)

**Critical: do this BEFORE writing any V2 notes.**

### §2.1 — Audit existing chip library

```bash
grep -n "^def " ~/projects/forge/forge/music/lib.py
```

Enumerate all current public chips in `forge/music/lib.py`. Map each to whether it's:
- **Spec-aligned** (exists, matches V2 spec §16 naming/signature)
- **Needs rename** (exists, different name than spec)
- **Needs signature change** (exists, but params don't match spec needs)
- **Missing** (spec lists it but not in lib.py)

### §2.2 — Audit V1 percussion_lab Python for chip needs

For each of the 9 percussion_lab notes + murmuration, read the existing `# Python` block. Identify which library calls + idioms are used:
- music21 primitives (Stream, Part, Measure, Note, Rest)
- Instrument factories (kick(), snare(), closed_hihat(), etc.)
- Helper functions defined inside the snippet (`_build_bar`, `_build_part`, `_cycle`)
- Score-level operations (voices_canonical, sequence, anchor_dynamic, MetronomeMark, TimeSignature)

These are the chips V2 needs. Some may already exist; others need adding.

### §2.3 — Compile the chip-add list

Per spec §16, V2 forge-music needs at minimum:
- **Instruments**: kick, snare, closed_hihat, open_hihat, pedal_hihat, low_tom, mid_tom, high_tom, crash_cymbal, ride_cymbal
- **Note-building**: play_at_beats (✓ exists from spike), create_rest, chord
- **Score-building**: voices_canonical, anchor_dynamic, sequence
- **Composition**: for_each_bar_in_cycle, tempo, time_signature
- **List ops**: append_to, first, length_of, get
- **Render**: show_score (✓ from spike), play_midi

Compare against §2.1's audit. List which chips need adding. **If the add list exceeds ~10 new chips, SURFACE and split** — extending the library is its own focused drain.

### §2.4 — Confirm V1/V2 coexistence at runtime

A V1 caller (e.g., V1 murmuration during partial migration) calls `context.compute('solitary')`. After solitary migrates to V2, that call resolves the V2 source, runs through V2 parser/transpiler, returns a music21 Part. V1's `context.compute` sees the Part and uses it normally.

Verify this assumption with a quick test: V1 stub note calling a V2 stub note → confirm result flows correctly. Catch any V1↔V2 runtime gap before depending on it for the migration.

## §3 — Phase 1: chip library extension (~60-90 min)

Per §2.3 audit, extend `forge/music/lib.py` with missing chips. Each chip:
- Pure Python function
- Returns the appropriate music21 object
- Docstring serves as the chip's Description (visible in chip palette tooltip per spec §9.4)
- Handles edge cases (None defaults, empty lists, percMapPitch routing for percussion)
- Unit test in `tests/music/test_lib_v2_chips.py` (new file)

**Critical lessons baked in**:
- `play_at_beats` and related percussion chips MUST handle percMapPitch correctly on the MIDI export path (per v0.2.159 — Note('C4') on percussion Part becomes bongos at pitch 60 without explicit pitch.midi assignment).
- `voices_canonical` MUST preserve Measure structure when consumed by `to_kit_notation` downstream (per v0.2.153).
- `anchor_dynamic` MUST work with the kit-fold pattern (per v0.2.160 — copy MetronomeMark per measure).

These aren't "future concerns" — they're the existing engine library's hard-won correctness. New chips inherit the discipline.

## §4 — Phase 2: migrate solitary (~30 min)

### §4.1 — Read V1 source

`~/projects/forge-music/percussion_lab/solitary.md`. Note the English + Python content.

### §4.2 — Author V2 version (overwrite in-place)

Replace the file content with V2 shape:

```
---
type: action
---

# Description

One bird, slow turns. The opening of the murmuration arc: just the kick,
on beats 1 and 3 of each bar. Spare, deliberate, quiet — mp-band velocity
(70). The piece's resting heartbeat; later sections add to this baseline.

## Inputs
- bars (default 4) — section length; cycles 4-bar pattern for >4, truncates for <4

## Mechanics
Kick drum on beats 1 and 3 of every bar. Snare, hi-hats, toms, and crash
stay silent (rest-padded for score alignment with other sections via
voices_canonical). One mp dynamic mark anchored on the kick's first note.

# E--

Let kick_part = Call [[play_at_beats]] with instrument=[[kick]], beats=[1, 3].
Let score = Call [[voices_canonical]] with kp=kick_part.
Call [[anchor_dynamic]] with mark=mp, on=first_kick_in(score).
Return score.
```

Note: this is the SIMPLIFIED version that skips the `bars` cycling for the spike. If `bars` parameter behavior matters for murmuration's call, add `[[for_each_bar_in_cycle]]` or similar — see §2 investigation findings.

### §4.3 — Smoke

Smoke per §7 below. Validate the V2 solitary computes + renders cleanly.

### §4.4 — If smoke fails

Per HARD RULE: don't push through a wrong design. Surface the specific gap:
- Chip primitive missing or wrong shape → fix in lib.py, retry
- Parser doesn't handle a construct → spec gap, surface to driver
- Runtime exception → trace and fix

## §5 — Phase 3: migrate rest of percussion_lab (~90-120 min)

The remaining 8 notes:
- `companions.md`
- `dispersing.md`
- `gathering.md`
- `peak.md`
- `resting.md`
- `swarming.md`
- `threading.md`
- `wake.md`

For each:
1. Read V1 source
2. Author V2 version (Description + E--)
3. Verify it computes (engine pytest stub or quick Forge-click smoke)

Some notes are kick-only (like solitary); others are multi-instrument (like swarming). Use the chip set from §3.

**Pattern**: leaf notes don't include `[[show_score]]` — they're called by murmuration, not Forge-clicked directly. Only top-level pieces (murmuration, future compositions) call show chips.

### §5.1 — Batch smoke

After all 8 are migrated: run engine pytest sweep + manual Forge-click on 2-3 of them (driver's choice) to verify the batch is healthy.

## §6 — Phase 4: migrate murmuration (~30 min)

### §6.1 — Read V1 source

`~/projects/forge-music/percussion/murmuration.md`. The composition calls 8 sections (per its current `context.compute("solitary")`, `context.compute("companions")`, etc.).

### §6.2 — Author V2 version

```
---
type: action
dependencies: [[solitary]], [[companions]], [[swarming]], [[gathering]], [[peak]], [[dispersing]], [[threading]], [[resting]]
---

# Description

[Copy the artistic intent + structural narrative from the V1 English content.
Add a "## Mechanics" subsection describing the section sequence.
Add "## Design notes" for the sequencing convention.]

## Inputs
(none)

# E--

Let section_1 = Call [[solitary]] with bars=4.
Let section_2 = Call [[companions]] with bars=4.
Let section_3 = Call [[gathering]] with bars=4.
Let section_4 = Call [[swarming]] with bars=4.
Let section_5 = Call [[peak]] with bars=4.
Let section_6 = Call [[dispersing]] with bars=4.
Let section_7 = Call [[threading]] with bars=4.
Let section_8 = Call [[resting]] with bars=4.

Let full_score = Call [[sequence]] with sections=[section_1, section_2, section_3, section_4, section_5, section_6, section_7, section_8].

[[show_score]] full_score.
[[play_midi]] full_score.
Return full_score.
```

(Adjust per the actual V1 murmuration sequence + bar counts.)

### §6.3 — Smoke

Per §7 below. The murmuration smoke is the big validation — composition + show + audio all need to work.

## §7 — User-side smoke

### §7.1 — Per-note smoke (Phase 2 + Phase 3)

For each migrated note (or a sample):
1. Open the note in Obsidian.
2. Verify frontmatter is hidden (CSS gating); `# Description` + `## Inputs` + `# E--` render cleanly.
3. Forge-click.
4. Expected: brief delay, score renders (auto-render fallback since leaf notes don't have `[[show_score]]`), no exceptions.

### §7.2 — Murmuration smoke (Phase 4)

1. Open `murmuration.md`.
2. Forge-click.
3. Expected:
   - Brief delay (composes 8 sections).
   - Full score renders in Forge Output (multi-staff by default, toggle to kit).
   - MIDI player available; plays the full piece with correct drum pitches (kick on right beats, NOT bongos).
   - Kit-notation toggle works (per v0.2.150-160 work).
4. Compare to pre-migration murmuration: same audio, same notation, same structure.

### §7.3 — Regression smoke

1. Open a V1 note that's NOT been migrated (e.g., `blues/twelve_bar_blues_progression.md`).
2. Forge-click.
3. Expected: still works (V1 fallback path unchanged per v0.2.165 §2.3).

## §8 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 audit phase mandatory before writing notes.
- ✓ §57–74 (TDD): unit tests for new chips in lib.py per Phase 1.
- ✓ §86–118 (pure-core convention): chips are pure functions; engine work stays in lib.py.
- ✓ §76 (don't ship speculative fix): each migration replaces V1 with V2 of the same semantic — no speculative new behavior.
- ✓ §347 (version-bump sanity check): release.sh bumps appropriately.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: no new catches.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: §7 smoke is the gate.
- ✓ v0.2.134 §5 inlined-version preflight: passes automatically.
- ✓ v0.2.144 bundled-vault bump preflight: forge-music/forge.toml version bumps with content changes (per the HARD RULE).
- ✓ v0.2.147 spike-file exclusion: keeps `_v2_spike*.md` out of bundle.
- ✓ Bundled-vault forge.toml bump: `forge-music/forge.toml` version bumps from 0.3.x → 0.4.0 (V2 release) to trigger re-extract for cohort.

## §9 — Open follow-ups

1. **forge-moda migration** — next focused drain.
2. **forge-tutorial migration** — next focused drain.
3. **`/generate` workflow** — once migration patterns settle.
4. **`{{...}}` slot resolution** — V2.1.
5. **Chip palette V2 UX** — V2.1.
6. **Vendored E-- (`forge/e_minus_minus/`) deprecation** — after all V1 consumers migrate.

## §10 — Architectural framing

V2 migration arc, phase 1. Establishes the migration pattern for the rest of the V2 work bundle. Each subsequent migration (forge-moda, forge-tutorial) reuses the discipline: audit → extend library → rewrite notes → smoke.

The big-bang migration model (per spec §19.6) holds: V1 notes coexist during the migration arc since they share the runtime model. No transitional v1.x; each note migrates atomically.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §11 — Hand-off

Suggested order:
1. §2 investigation (~30-45 min)
2. §3 Phase 1 chip library extension (~60-90 min)
3. §4 Phase 2 solitary migration (~30 min) — gate before continuing
4. §5 Phase 3 rest of percussion_lab (~90-120 min)
5. §6 Phase 4 murmuration (~30 min)
6. §7 smoke handoff

Total estimated CC time: 4-5 hours.

**SPLIT GUIDANCE** (read carefully):
- If §2.3 chip-add list exceeds ~10 new chips → SPLIT: this drain ships only chip library extension as Phase 1; migration becomes a separate v2-migration-percussion-lab drain.
- If §4 solitary smoke fails with a spec gap → STOP: surface gap, revise spec, re-spike.
- If §5 reveals significantly different chip needs per section (e.g., swarming needs `[[zip_lists]]`, `[[fold]]`) → SPLIT: ship the working subset; queue remaining as separate drain.
- If §6 murmuration smoke surfaces composition-level issues (e.g., section concat breaks tempo) → STOP: surface for diagnosis; don't ship a half-working murmuration.

Don't push through to ship a half-working set. The HARD RULE: shipping cleanly verified content > shipping unverified bulk.

## §12 — Per-domain forge-music `forge.toml` bump

Per cc-prompt-queue.md HARD RULE (line 356) and v0.2.144 preflight: bundled-vault content changes MUST bump `forge.toml` version.

This drain modifies `forge-music/*.md` (9 notes). Required:
- `~/projects/forge-music/forge.toml`: version bump (e.g., `0.3.x` → `0.4.0` to signal V2 release).
- `~/projects/forge-client-obsidian/assets/vaults/forge-music/forge.toml`: matching bump.

Failing to bump triggers v0.2.144 preflight failure on release.sh — caught at release time, not silently shipped.
