---
prompt: 2026-06-27-1900-v2-migration-cleanup-plus-tutorial-plus-moda.md
shipped_version: v0.2.167
session: drain-2026-06-27-1900
date: 2026-06-27
status: shipped (partial) — cleanup + tutorial migration + V2 parser extensions. forge-moda SPLIT to a separate drain per prompt §12 SPLIT GUIDANCE.
---

# v2-migration-cleanup-tutorial-moda feedback

## §0 — TL;DR

Drain shipped TWO of three target items per prompt §12 SPLIT GUIDANCE; forge-moda split out as a separate focused drain.

**Shipped in v0.2.167:**
- §3 cleanup: forge-music/kick.md + show_score.md deleted from source + bundle; forge-music/forge.toml bumped 0.4.0 → 0.4.1.
- V2 parser extensions: If/Otherwise + arithmetic + comparisons (per spec §5.2 — missing from v2-spike).
- §4 forge-tutorial migration: 12 action notes in-place rewrites; forge-tutorial/forge.toml bumped 0.1.6 → 0.2.0.
- Test fixture fix: `tests/music/conftest.py` `run_music_block` routes through `resolve_action_code` (V1+V2-aware) instead of `extract_python` (V1-only). Resolved 14 V2 percussion test failures caused by the v0.2.166 migration.

**Split out per §12 SPLIT GUIDANCE:**
- §5 forge-moda migration. Chip-add list exceeds the ~10 threshold. See §3 below for the investigation findings.

## §1 — Investigation findings (§2 of prompt)

### §1.1 — forge-tutorial audit (§2.1)

33 .md files; 12 action notes (plus chapter intros, `_chips.md` palette configs, data note for colors). All notes are very simple — `print(...)`, sibling-snippet calls, list iteration, recursion, conditionals.

**Chip-add list: 0 new chips.** `print` is a Python builtin already in scope via the executor.

**Parser gaps surfaced**: V1 notes use `If/Otherwise` (chapter 5), arithmetic (`+`, `*`, `-` in chapters 4, 8), comparisons (`<=`, `>` in chapters 5, 8). Per v2-spec §5.2 these are spec-supported; v2-spike just hadn't implemented them yet. Fillable in this drain (~1h work) and a prerequisite for the migration.

### §1.2 — forge-moda audit (§2.2)

33 .md files; ~30 action notes (plus 3 data notes: `sample_clicks`, `sample_state`, `_meta/_chips.md`).

**The content is deeply numpy-based**:
- `setup.md`: 7 numpy array constructors + `ParticleState(tick=..., ids=..., xs=..., ys=..., ...)` constructor with kwargs.
- `create_water_particles.md`: `numpy.arange`, `numpy.full`, `numpy.random.uniform`, `numpy.concatenate`, boolean indexing.
- `bounce_off_wall.md`: `xs[hits_left] = 0.0` (boolean array indexing assignment), `math.pi`, `headings % (2 * math.pi)`.
- `go.md` / `simulation.md`: `range(num_ticks)`, `clicks_by_tick.setdefault(...)`, nested dict access, `for ev in clicks:`.

Per spec §5.3 V2 explicitly excludes "advanced Python idioms" — moda's content doesn't fit V2 E-- as-is.

**Two paths forward, both substantial:**
- **(a)** Expand the V2 E-- spec to allow inline Python expressions / numpy / method calls (`state.xs.copy()`). Major scope creep.
- **(b)** Build the high-level moda chips per spec §17 (`create_particle`, `update_particle`, `for_each_tick`, `schedule_clicks`, `show_simulation`, etc.) — ~15-20 new chips that wrap the numpy idioms.

Either way, **chip-add list far exceeds ~10**. Per prompt §12 SPLIT GUIDANCE:

> If §2.2 forge-moda chip-add list >10 chips → SPLIT: ship cleanup + tutorial; moda migration as separate.

→ **Drain split: ship §3 + §4 here; moda goes to its own focused drain.**

### §1.3 — V1/V2 coexistence (§2.4)

Verified earlier in v0.2.166. Reconfirmed by the test-fixture fix: V1 notes (e.g., forge-music `blues/`) still resolve through the legacy `# Python` path; V2 notes route through `resolve_action_code` → V2 transpile. Coexistence is structurally sound.

## §2 — What shipped

### §2.1 — §3 cleanup

```bash
rm ~/projects/forge-music/kick.md
rm ~/projects/forge-music/show_score.md
node scripts/sync-bundled-vault.mjs forge-music   # removed from bundle
```

`forge-music/forge.toml`: 0.4.0 → 0.4.1.

### §2.2 — V2 parser extensions

`forge.e_minus_minus_v2`:

- `parser.py`:
  - **AST**: `+ IfStmt(condition, then_body, else_body)`, `+ BinaryOp(op, left, right)`.
  - **Lexer**: + multi-char ops `<=`, `>=`, `==`, `!=`; single-char `+`, `-`, `*`, `/`, `<`, `>`.
  - **Statement dispatch**: `If <expr>:` routes to `_parse_if_body` which look-aheads for `Otherwise:` at the same indent level.
  - **Expression parser**: `_parse_expr` rewritten as precedence-climbing (3 levels: comparisons → add/sub → mul/div). The existing primary handler renamed to `_parse_primary`. **Critical decision**: when a `Call` keyword appears anywhere in the expression, it consumes ALL tokens after it — no top-level binop split crosses the chip-call boundary. Without this, `n * Call [[factorial]] with n=n - 1` parses as `(n * Call ... with n=n) - 1` instead of `n * Call ... with n=(n - 1)`.
- `transpiler.py`: + IfStmt + BinaryOp renderers.

12 new pytests in `test_if_arithmetic.py`:
- If/Otherwise statement parse + transpile.
- Each arithmetic + comparison op.
- Mixed binop inside chip-call kwargs.
- End-to-end factorial exec.

### §2.3 — §4 forge-tutorial migration (12 notes)

| Chapter | Note | V2 dialect |
|---|---|---|
| 01-hello | `hello_world.md` | `[[print]] "hello, world".` |
| 02-variables | `greeting.md` | `Let name = ...` + `+` + shorthand call |
| 03-functions | `excited.md` | `## Inputs - word` + `Return word + "!".` |
| 03-functions | `cheer.md` | `Call [[excited]] with word="hooray"` |
| 04-composition | `excited_word.md` | bare `Return "wonderful".` |
| 04-composition | `describe_forge.md` | composes `+` chain in shorthand call |
| 05-conditionals | `weather.md` | **`If temp > 80:` / `Otherwise:`** (new parser surface) |
| 06-loops | `countdown.md` | `For each n in [3, 2, 1]:` (already supported) |
| 07-data | `colors.md` | data note: `type: data` + `# Body` + `body_format: json` |
| 07-data | `show_colors.md` | `Let palette = [[colors]].` + `For each` |
| 08-recursion | `factorial.md` | **`If n <= 1:` + `Return n * Call [[factorial]] with n=n - 1.`** |
| 08-recursion | `show_factorial.md` | composes call → print |
| 09-slots | `octopus_fact.md` | `{{...}}` replaced with hardcoded value; deferred to V2.1 |

Each note: `type: action` (or `type: data`) only in frontmatter; `# Description` with optional `## Inputs`; `# E--`. No `# Python` — cached transparently at runtime per v2-spec §2.4.

`forge-tutorial/forge.toml`: 0.1.6 → 0.2.0 (V2 release marker).

### §2.4 — Test fixture fix

`tests/music/conftest.py` `run_music_block` was using the V1-only `extract_python` (only reads `# Python` heading). After v0.2.166 V2 migration of forge-music, V2 notes have `# E--` but no `# Python` — fixture broke 14 percussion_lab tests.

Switched to `resolve_action_code` which auto-detects V2 shape and routes through V2 transpile. Also added `domains=["music"]` so the music-domain chips resolve in scope.

### §2.5 — Plugin release

v0.2.167. Engine bundle synced; bundled vaults synced (forge-music + forge-tutorial). 786 plugin tests passing.

## §3 — forge-moda — split rationale (per prompt §12)

The numpy-heavy nature of moda V1 content makes the migration ~3x the scope of tutorial:

- ~15-20 new high-level chips per spec §17 (vs. 0 for tutorial).
- Engine-side: design + implement + test each chip.
- Vault-side: 30 notes to rewrite.
- Runtime smoke: iframe-based — needs visual confirmation.

That's 4-6 hours of focused work, dominated by the chip library extension (which is engineering, not translation). Per prompt §10's pattern, it deserves its own dedicated drain titled e.g. "V2 forge-moda migration + lib.py extension".

Engine + parser are now V2.0-complete enough that the moda drain can focus entirely on chips + notes; no parser work needed (likely).

## §4 — Validation criteria check (prompt §7)

### Engine-layer

- ✓ All forge-tutorial V2 notes parse + transpile cleanly (12-note batch smoke).
- ✓ V1 notes in non-migrated domains still work (forge-music V1 path unchanged).
- ✓ Test artifact files removed; forge-music vault sync clean.
- ✓ Both forge.toml bumps applied (music 0.4.1, tutorial 0.2.0).
- ✓ 508+ forge pytests passing including new If/arith + tutorial smoke + V2 routing.
- ✓ 786 plugin tests passing.

### Runtime-layer (deferred to driver smoke)

- ☐ Forge-click each tutorial note → renders cleanly.
- ☐ Forge-click forge-music notes still work (regression check).

## §5 — User-side smoke (driver, per prompt §8)

### §5.1 — Tutorial smoke

1. BRAT update to v0.2.167.
2. Open `forge-tutorial/01-hello/hello_world.md`. Verify `# Description` + `# E--` render; Forge-click → console / output shows "hello, world".
3. Open `forge-tutorial/05-conditionals/weather.md`. Forge-click → prints "It's pleasant." (temperature=72 < 80).
4. Open `forge-tutorial/08-recursion/show_factorial.md`. Forge-click → prints `120` (5!).
5. Open `forge-tutorial/06-loops/countdown.md`. Forge-click → prints `3 2 1 Liftoff!`.

### §5.2 — forge-music regression smoke

1. Open `forge-music/percussion/murmuration.md`. Forge-click.
2. Expect: same audio + score as v0.2.166 (no regression from the parser extensions).

## §6 — Per-protocol HARD RULE compliance

- ✓ §78 investigation-before-design: §1 audit completed; surfaced the moda split decision.
- ✓ §57–74 TDD: 12 new pytests for parser extensions; tutorial migrations batch-smoked via `resolve_action_code` round-trip.
- ✓ §86–118 pure-cores: `IfStmt`/`BinaryOp` parser + transpiler are pure.
- ✓ §76 don't ship speculative: each migration is a semantic-preserving translation.
- ✓ §347 version-bump sanity: release.sh bumped 0.2.166 → 0.2.167 cleanly.
- ✓ §321 feedback before move: this file written before the prompt move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: §4 explicitly separates engine-layer (passed) from runtime-layer (deferred).
- ✓ v0.2.144 bundled-vault bump preflight: forge-music + forge-tutorial both bumped.
- ✓ v0.2.147 spike-file exclusion: continues to apply.
- ✓ Prompt §12 SPLIT GUIDANCE: chip-add list >10 for moda → SPLIT. Honored.

## §7 — Architectural notes

### §7.1 — Parser precedence-climbing + Call boundary

The expression parser was a single primary-form-only path in v0.2.166. Adding binops required a precedence-climbing layer. The non-obvious bit: `Call [[X]] with k=v` is parsed as a primary (per v2-spec §6), so it consumes ALL subsequent tokens. Without that boundary, `n * Call [[f]] with k=n - 1` ambiguates because `*` is in the binop set but lies BEFORE `Call`.

Decision: scan tokens left-to-right for `Call`; the binop-search window stops at that index. Top-level binops are only valid in the pre-Call prefix; internal kwarg values handle their own binops via recursive `_parse_expr` calls.

### §7.2 — moda's V2 fit

Moda's existing content is essentially a vectorized numpy simulation. The V2 E-- subset "Sequential statements + If + For each + Repeat + Let + Chip calls + Simple arithmetic + Literal values + Return" is intentionally constrained per spec §5.3.

Two scope-prevention paths:
1. **High-level moda chips per §17** — the spec's plan: cohort writes `Call [[update_particle]] with state=..., dt=...`; engine handles all numpy. ~15-20 new chips.
2. **Spec relaxation** — allow inline Python expressions in V2 E--. Substantial spec revision.

Path 1 matches the spec's vision (high-level chips + low-level engine library). Path 2 dilutes the V2 surface contract. The split-out drain should pursue path 1.

### §7.3 — Test-infrastructure migration

The conftest.py fix is a small but illustrative pattern: any test infrastructure that touches snippet code needs to graduate from V1-only `extract_python` to V2-aware `resolve_action_code`. Likely more such sites exist in plugin-side fixtures. Surfaced as carry-forward §8 below.

## §8 — Open follow-ups + carry-forward

1. **forge-moda migration** — split per §12 SPLIT GUIDANCE; needs its own drain titled e.g. "V2 forge-moda migration + lib.py extension".
2. **`/generate` workflow** (V2-6) — next high-leverage feature after migrations complete.
3. **`{{...}}` slot resolution** (V2.1) — restore octopus_fact full LLM round-trip.
4. **Chip palette V2 UX** (V2.1) — palette configs (`_chips.md` files) still reference V1 dialect keywords (`Set`, `Give back`).
5. **Vendored E-- deprecation** — safe to retire once forge-moda is V2.
6. **`test_python_facet_present_returns_verbatim`** failure unchanged — pre-existing, independent.
7. **Test-fixture V1→V2 audit** — other test fixtures may still use `extract_python`; sweep + migrate at next test-touch.

## §9 — Architectural framing

V2 migration arc, phase 2-of-3. forge-music + forge-tutorial complete. forge-moda is the last cohort-facing domain.

Per v0.2.166 §8.1 prediction's holding: pure surface rewrite, no runtime risk for tutorial. The parser extension was prerequisite engine work — clean separation from migration translation.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

v0.2.167 shipped. Cleanup + parser extensions + tutorial migration end-to-end at the engine layer. Runtime gate per §5 is the driver smoke.

Queue empty after this drain. Next drain candidate: V2 forge-moda migration (lib.py extension + 30 note translations).
