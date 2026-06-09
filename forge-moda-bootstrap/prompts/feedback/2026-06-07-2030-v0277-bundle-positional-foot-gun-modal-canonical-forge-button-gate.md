---
timestamp: 2026-06-07T21:30:00Z
session_id: drain-2026-06-07-2030
prompt_modified: 2026-06-07T20:30:00Z
status: shipped
---

# v0.2.77 — positional foot-gun fix + canonical modal + Forge-button gating

## §0 — Release coordinates

- **Released**: `forge-client-obsidian` v0.2.77 (bumped from v0.2.76 as expected, explicit `bash scripts/release.sh 0.2.77` per v0.2.75 lesson — no auto-bump-past this time).
- **Tag**: `v0.2.77` (`https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.77`)
- **forge-moda bump**: none.
- **forge-tutorial bump**: none (bundle picked up source revisions via parametric sync; no forge.toml bump triggered).
- **forge commits**: `4739238` (#5 engine fix).
- **forge-client-obsidian commits**:
  - `<plugin-bundle>` — chips + modal + Forge-button gate + engine resync.
  - `9946133` — Release v0.2.77.
  - `ad695f8` — INSTALL.md bump.

## §1 — Investigation findings

§1.1 / §1.2 / §1.3 verifications all matched the prompt's citations:

- `executor.py:_takes_only_context` (line 711) returns True for `def compute(context):`. Args reach the body via local_ns spread (line 669) — keyword-only.
- `modal.ts:actionTemplate` (line 161) emits the legacy `# Python`-stub template.
- `main.ts:826` gates edit-mode toggle on `fm?.type === 'action'`; line 843 New Snippet (unconditional); line 847 Forge run button (unconditional, pre-fix).

No surprises. Investigation folded into implementation commits per §1.4.

## §2 — TDD continuity per sub-feature

### #5.1 engine

1. **Failing test first**: `tests/core/test_executor_positional_inputs.py` — 8 cases covering canonical+1-input, canonical+multi-input, mixed positional/keyword, too-many-positional clear error, no-inputs positional clear error, keyword-only regression, free-English positional regression, no-declared-inputs back-compat.
2. **Pre-fix output**: 7/8 failing with `TypeError: exec_python() got an unexpected keyword argument 'declared_inputs'`.
3. **Fix**: in `exec_python`, gate on `_takes_only_context(fn)`; bind positional → declared inputs by index into `local_ns`; raise clear ValueError on no-inputs-positional or too-many-positional. `context.compute` threads `declared_inputs` from `snippet["meta"].get("inputs")`.
4. **Post-fix**: 8/8 passing.
5. **Full suite**: 626 forge tests passing (was 618 + 8 new).

Initially the fix lived BEFORE the entrypoint detection, which over-rejected legacy free-English snippets in `test_canonical_sibling_composition` because their test fixture defaults `inputs: []`. Moved the check INSIDE the `_takes_only_context(fn)` branch so free-English keeps Python's natural positional binding.

### #5.2 chip palette

1. **Failing test first**: 5 new cases in `chips.test.ts` covering canonical+inputs keyword form, canonical+multi-input, canonical+no-inputs (empty parens), free-English regression, explicit `facet_form='free'` regression.
2. **Fix**: `SnippetMetaForChips` gains optional `facet_form`. `deriveChip` emits `Do [[id]](k=<k>, ...).` when `facet_form === 'canonical'` AND `inputs.length > 0`; else keeps positional form. `chips.ts:buildSnippetInventory` + `loadPersonalChips` thread `facet_form` from frontmatter.
3. **Post-fix**: 89 chips tests passing (was 84 + 5 new).

### #6 modal canonical option

1. **Failing test first**: `modal.test.ts` — 11 cases covering both templates' shape + canonical-no-Python contract.
2. **Pre-fix output**: Module load error — `modal.ts` uses TypeScript parameter property syntax (`constructor(app: App, private label: string)`) which node's strip-only TS runner doesn't support.
3. **Resolution**: extracted templates to new pure-core `modal-templates-core.ts`; `modal.ts` re-exports them. Tests import from the pure-core.
4. **UI wiring**: ForgeSnippetModal gains `actionShape` state + new Setting "Action Shape" dropdown ("Free-English" default vs "Canonical"); hidden when `type === 'data'`; `submit()` picks `canonicalActionTemplate` vs `actionTemplate` per shape.
5. **Post-fix**: 11/11 tests passing.

### Forge-button gating

1. **Failing test first**: `forge-button-gate-core.test.ts` — 8 cases (action/data/null/no-type/snapshot/unknown-type/non-string-type combos).
2. **Fix**: new pure-core `forge-button-gate-core.ts` exports `forgeButtonShouldShow(fm)` returning true iff `fm?.type === 'action' || fm?.type === 'data'`. `main.ts` wraps the Forge run button at line 847 in this predicate. Also gates the edges-panel toggle at line 817 (edges are inherently per-snippet). New Snippet button stays unconditional.
3. **Post-fix**: 8/8 tests passing.

## §3 — User-side smoke checklist

Per §4 of prompt:

```
# Step 1 — install v0.2.77 zip into ~/forge-vaults/bluh/

# Step 2 — #5 reproduction (positional foot-gun):
# Create or edit a canonical snippet with `inputs: [n]` +
# `facet_form: canonical` + English "Give back n times 2.".
# Author a caller with bare positional: `[[double]](5)`.
# Forge-click. Expected: returns 10 (not NameError).

# Step 3 — #5 too-many-positional clear error:
# Edit caller to `[[double]](5, 99)`. Forge-click.
# Expected: clear error citing inputs: ['n'] and the keyword
# call form `[[double]](n=...)`. NOT a raw NameError.

# Step 4 — #6 modal canonical option:
# Cmd-P → "Forge: New Snippet". Action Shape dropdown should
# show "Free-English (with # Python)" + "Canonical (declarative,
# no LLM)". Choose Canonical, enter name, click Create.
# Verify the new file has:
#   - frontmatter with facet_form: canonical
#   - # English heading
#   - NO # Python stub
#   - seed body: Do [[print]]("hello, world").

# Step 5 — Forge-button gating:
# Open a plain note (e.g. forge-tutorial/01-hello/Hello.md —
# no type: action frontmatter). Verify NO Forge button in
# editor toolbar. Edges panel toggle also absent (gated too).
# Open a snippet (e.g. forge-tutorial/01-hello/hello_world.md
# with type: action). Verify Forge button + edges toggle DO
# appear.
# Verify New Snippet button appears on BOTH (unconditional).

# Regression checks:
# - chip palette: canonical input-takers insert as
#   "Do [[snippet]](k=<k>).", free-English keeps "Do [[snippet]](<k>).".
# - Tier 1 (v0.2.76) extract still works on fresh vaults.
# - Slot resolution (v0.2.72 / v0.2.75) still works.
```

## §4 — Auto-smoke results

- forge: `.venv/bin/pytest` → **626 passing** (was 618 + 8 new).
- plugin: `npm test` → **530 passing** (was 506 + ~24 new across the four sub-features).
- `npm run build` exit 0.
- `bash scripts/release.sh 0.2.77` — clean. All drift checks clean (engine + forge-moda + forge-music + forge-tutorial).
- Zip built (33.19 MB), tag pushed, GH release created.

Deferred to user: Steps 1-5 of §3 (Obsidian + a real vault required).

## §5 — Open follow-ups

1. **Canonical-positional ambiguity for free-English snippets**: chip palette emits positional form for free-English snippets, which is correct now. But the engine fix also tolerates canonical positional binding — so if a user converts a free-English snippet to canonical mid-flight (frontmatter only), existing positional call sites continue working. Worth documenting as "canonical accepts both positional and keyword" in the constitution.
2. **`context.compute` declared_inputs path**: only `context.compute` threads declared_inputs today. Direct top-level invocation via `forgeSnippet` doesn't (it doesn't take args). If a future feature adds top-level positional inputs, that path needs the same wiring.
3. **`facet_form` standardization**: pure-core uses `'canonical' | string` to accept both 'canonical' literal + arbitrary string (e.g. 'free'). The facet-form-core.ts file already standardizes on 'canonical' vs 'free' vs undefined for `/generate` gating — chip palette could reuse that exact union for tighter typing.
4. **bundled forge-music + forge-tutorial source drift**: parametric sync surfaced 2 source updates in forge-music (murmuration + wake) + 10 forge-tutorial chapter notes. The drift-preflight infrastructure is now keeping these in lock-step.
5. **Modal "Canonical" hint copy**: the dropdown description says "Canonical (declarative, no LLM)". Could be expanded to clarify the call-syntax difference. Skipped to avoid scope creep.

## §6 — Per-protocol HARD RULE compliance

- ✓ cc-prompt-queue.md §78 (investigation-before-design): three quick verifications discharged into impl commits per §1.4 carve-out.
- ✓ §57–74 (TDD per sub-feature): failing tests first; full suites green after each.
- ✓ §86–118 (pure-core convention): two new pure-cores (`modal-templates-core.ts`, `forge-button-gate-core.ts`); each fully tested.
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.76; explicit `bash scripts/release.sh 0.2.77` used to avoid auto-bump-past from v0.2.75 lesson.
- ✓ §321 (feedback file before move): this file exists; prompt move follows.
- ✓ Standing user rule: committed directly to main in forge + forge-client-obsidian. No feature branches.

Per cc-prompt-queue.md §43, this is the chat summary.
