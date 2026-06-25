---
timestamp: 2026-06-27T19:00:00Z
session_id: drain-2026-06-27-1900
status: pending
priority: HIGH — V2 migration arc continues; tutorial + moda + cleanup
---

# V2 — Cleanup + forge-tutorial migration + forge-moda migration

## §0 — Context

V2 spec at `~/projects/forge-moda-bootstrap/v2-spec.md` (v1.0, frozen).

V2 spike (v0.2.165) and forge-music migration (v0.2.166) both shipped successfully. Driver smoke passed for all 10 forge-music notes (8 percussion_lab + wake + murmuration). Two spec gaps were caught + resolved mid-drain in v0.2.166 (`## Inputs` transpiler threading, `[[` lexer ambiguity). V2 architecture is validated end-to-end at runtime.

Per CC v0.2.166 §8.1's confirmation: **migration is a pure surface rewrite. V1 and V2 snippets coexist transparently via the shared sibling-shim mechanism.** Each migration arc reuses the same recipe.

This drain bundles three V2 work items:
- **§4 (small cleanup)**: Remove test artifacts left from V2 testing.
- **§5 (V2-5)**: Migrate forge-tutorial.
- **§6 (V2-4)**: Migrate forge-moda.

Order: cleanup first (5 min) so we start from a clean state. Then tutorial (smaller, simpler — validates pattern on different domain). Then moda (larger — the bulk).

## §1 — Migration scope summary

For each note in tutorial + moda:
1. Convert frontmatter to V2 minimum (`type: action` or `type: data` only).
2. Rewrite `# English` as `# Description` with `## Inputs` subsection (when params exist).
3. Translate `# Python` body to `# E--` using V2 dialect.
4. Use chip-call syntax for all references.
5. Add explicit `[[show_*]]` for top-level user-facing pieces; skip for sub-section/helper notes.
6. Add any missing chip primitives to engine library (`forge/<domain>/lib.py`).
7. Engine pytest per note (parse, transpile, compute).

### What this drain does NOT do

- Build `/generate` (Description → E-- via LLM) — out of scope.
- Add `{{...}}` slot resolution — out of scope.
- Add chip palette V2 UX changes — out of scope.
- Modify the V2 parser/transpiler core — already shipped in v0.2.165/166.
- Migrate forge-music (already done in v0.2.166).
- Vendored E-- deprecation — out of scope.

## §2 — Investigation phase (per §78)

Repeat the v0.2.166 §1 recipe for each domain. Compile chip-add lists BEFORE writing notes.

### §2.1 — forge-tutorial audit

```bash
ls ~/projects/forge-tutorial/
find ~/projects/forge-tutorial -name "*.md" -type f | xargs -I{} sh -c 'echo "=== {} ==="; head -50 "{}"'
```

For each note: identify the `# Python` body, the chip calls implied, any helper functions, and whether it needs new library primitives.

forge-tutorial is the cohort onboarding path — simpler notes, likely fewer new chips needed. Spec §13.4 doesn't enumerate tutorial primitives explicitly; investigate what's actually used.

### §2.2 — forge-moda audit

```bash
ls ~/projects/forge-moda/
find ~/projects/forge-moda -name "*.md" -type f | head -40
```

forge-moda has ~30 snippets per the directory listing (`ask_all_particles`, `bounce_off_particle`, `create_water_particles`, `go`, `on_mouse_click`, `setup`, `simulation`, etc.). Spec §17 sketches expected primitives:
- `[[create_particle]]`, `[[create_chamber]]`, `[[update_particle]]`
- `[[go]]`, `[[setup]]`, `[[on_mouse_click]]`
- `[[for_each_tick]]`, `[[schedule_clicks]]`
- `[[show_simulation]]`

Map each existing snippet against these spec primitives. List what's missing in `forge/moda/lib.py` (or wherever moda primitives live — may need to create the module).

### §2.3 — Chip-add list per domain

For each domain, compile the chip-add list. **If either domain's list exceeds ~10 new chips, SPLIT that domain's migration into its own drain** (engineering work for the library is its own focused effort).

### §2.4 — V1/V2 coexistence sanity check

Confirm forge-tutorial + forge-moda V1 notes still work after the percussion_lab migration. Quick spot-check before starting the migrations.

## §3 — Phase 1: small cleanup (~5 min)

### §3.1 — Remove test artifacts

Per driver confirmation: `kick.md` and `show_score.md` in `~/projects/forge-music/` are test artifacts from V2 development. Remove:

```bash
rm ~/projects/forge-music/kick.md
rm ~/projects/forge-music/show_score.md
```

These got synced to the bundled vault during v0.2.166's release. Sync the deletion:

```bash
cd ~/projects/forge-client-obsidian
node scripts/sync-bundled-vault.mjs forge-music
```

Verify they're gone from both source and bundle:

```bash
ls ~/projects/forge-music/kick.md ~/projects/forge-music/show_score.md 2>/dev/null
ls ~/projects/forge-client-obsidian/assets/vaults/forge-music/kick.md ~/projects/forge-client-obsidian/assets/vaults/forge-music/show_score.md 2>/dev/null
# Both should return nothing.
```

### §3.2 — Bump forge-music/forge.toml

Per cc-prompt-queue HARD RULE + v0.2.144 preflight: any bundled-vault content change (including deletion) requires forge.toml version bump.

`forge-music/forge.toml`: 0.4.0 → 0.4.1 (both source + bundled).

This is mandatory — without it, release.sh preflight fails.

## §4 — Phase 2: forge-tutorial migration (~2-3 hr)

### §4.1 — Library extension (if needed)

Per §2.1 audit, extend `forge/tutorial/lib.py` (create if doesn't exist) with any missing primitives. Likely small — tutorial notes are simple.

Each new chip:
- Pure Python function
- Docstring as the chip's Description
- Unit test in `tests/tutorial/test_lib_v2_chips.py` (new file)

### §4.2 — Migrate each note

In-place rewrite per note. Tutorial notes typically:
- Have `# Description` that explains a teaching concept
- Have `# E--` that exercises the concept (often 1-3 chip calls)
- May call other tutorial notes (e.g., `[[print]]` if there's a print helper)

Pay attention to `forge-tutorial/_meta/_chips.md` — per v0.2.135/141 lessons, ensure it's still valid V2-compatible.

### §4.3 — Smoke per note

Engine pytest verifies parse + transpile + compute. Driver-side Forge-click verifies render.

### §4.4 — Bump forge-tutorial/forge.toml

Per HARD RULE: content changes require forge.toml bump. `forge-tutorial/forge.toml`: current → next minor (e.g., 0.1.6 → 0.2.0 for V2 release).

Per v0.2.141 lesson: bump BOTH source repo + bundled vault.

## §5 — Phase 3: forge-moda migration (~3-4 hr)

### §5.1 — Library extension

Per §2.2 audit, extend `forge/moda/lib.py` (create module if doesn't exist) with primitives. Moda likely needs MORE primitives than tutorial:
- Particle/state primitives
- Loop/step primitives  
- Iteration/scheduling primitives
- Render: `[[show_simulation]]`

**If chip-add list exceeds ~10**, SPLIT: ship the chip library extension as a separate v2.X drain; migrations continue in a follow-up.

Each new chip handles its domain's idioms correctly. For moda specifically:
- `[[go]]` must wire up the iframe simulation correctly
- `[[on_mouse_click]]` must integrate with click handler dispatch
- `[[show_simulation]]` must open the moda iframe pane

### §5.2 — Migrate each note

Same recipe. Watch for:
- Data notes (e.g., `sample_clicks.md`, `sample_state.md`) — these get `# Body` not `# E--`.
- Notes with iframe-side hooks — may need `[[show_simulation]]` for top-level pieces (like `simulation.md`).
- Composition notes (`simulation.md`) — uses sequence of setup + ticks.

### §5.3 — Smoke per note

Engine pytest + driver Forge-click. Critical: iframe-based moda snippets need runtime verification that simulation opens and runs.

### §5.4 — Bump forge-moda/forge.toml

`forge-moda/forge.toml`: current → next minor (V2 release). Both source + bundled.

## §6 — Phase 4 (optional small): investigate pre-existing test failure

Per v0.2.165 §7.6: `test_python_facet_present_returns_verbatim` fails on main BEFORE the V2 spike. Independent issue.

If time permits after Phases 1-3, investigate:
1. Read the test.
2. Run it; capture failure.
3. Identify root cause.
4. Either fix in-drain (if small) OR document for separate drain.

Skip if Phases 1-3 ran long.

## §7 — Validation criteria

### Engine-layer (verifiable from terminal)

- ✓ All forge-tutorial V2 notes parse + transpile + compute cleanly.
- ✓ All forge-moda V2 notes parse + transpile + compute cleanly.
- ✓ V1 notes in non-migrated domains still work.
- ✓ Test artifact files removed; forge-music vault sync clean.
- ✓ All forge.toml bumps applied.

### Runtime-layer (deferred to driver smoke)

- ☐ Forge-click each tutorial note → renders cleanly.
- ☐ Forge-click each moda note → simulation runs.
- ☐ Forge-click previously-migrated forge-music notes → still works.

## §8 — User-side smoke (driver, per §7 runtime)

### §8.1 — forge-tutorial smoke

1. BRAT update to the v2 release.
2. Open each tutorial note (or a sample); Forge-click.
3. Expect: clean render; no exceptions.

### §8.2 — forge-moda smoke

1. Open key moda notes: `simulation.md`, `setup.md`, etc.
2. Forge-click each.
3. Expect: simulation iframe opens; particles render; clicks work.

### §8.3 — Regression smoke

1. Open a forge-music note (e.g., `murmuration.md`).
2. Forge-click.
3. Expect: still works (this drain didn't touch forge-music after the cleanup).

## §9 — Per-protocol HARD RULE compliance

- ✓ §78: investigation-before-design per §2 mandatory.
- ✓ §57–74: TDD for new chips per Phase 1 + Phase 2 + Phase 3.
- ✓ §86–118: pure-core convention for chips.
- ✓ §76: each migration is a semantic-preserving rewrite; no speculative new behavior.
- ✓ §347: release.sh bumps appropriately.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: §7 splits engine-layer (pass) from runtime-layer (deferred).
- ✓ v0.2.134 §5 inlined-version preflight: passes automatically.
- ✓ **v0.2.144 bundled-vault bump preflight**: each domain's `forge.toml` bumps with content changes — §3.2, §4.4, §5.4.
- ✓ v0.2.147 spike-file exclusion: continues to apply.

## §10 — Open follow-ups

After this drain, the V2 work bundle has remaining:
1. **`/generate` workflow** (V2-6) — next focused drain after migration completes.
2. **`{{...}}` slot resolution** (V2-7) — V2.1.
3. **Chip palette V2 UX** (V2-8) — V2.1.
4. **Vendored E-- deprecation** — after all V1 consumers migrate. Will be safe to delete `forge/e_minus_minus/` once tutorial + moda are V2.
5. **`test_python_facet_present_returns_verbatim` failure** (§6 above; may or may not get done this drain).

## §11 — Architectural framing

V2 migration arc, phases 2-3 of N. forge-tutorial + forge-moda complete the V1-to-V2 surface migration for cohort-facing content. Vendored E-- becomes retire-able after this.

Per CC's v0.2.166 §8.1 prediction: pure surface rewrite, no runtime risk. The chip library extension is the only engineering work; migrations themselves are translations.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §12 — Hand-off

Suggested order:
1. §3 cleanup (~5 min) — gate before continuing
2. §2 investigation for both domains (~45-60 min total)
3. §4 forge-tutorial chip library + migrations + smoke (~2-3 hr)
4. §5 forge-moda chip library + migrations + smoke (~3-4 hr)
5. §6 pre-existing test investigation if time (optional)
6. Driver smoke handoff

Total estimated CC time: 6-8 hours.

**SPLIT GUIDANCE** (read carefully):
- If §2.1 forge-tutorial chip-add list >10 chips → SPLIT: ship cleanup only this drain; tutorial migration as separate.
- If §2.2 forge-moda chip-add list >10 chips → SPLIT: ship cleanup + tutorial; moda migration as separate.
- If §4 tutorial smoke fails with spec gap → STOP: surface, revise spec, re-spike.
- If §5 moda smoke fails on a non-trivial subset → split: ship the working subset; queue remaining.
- If total estimated work exceeds 8 hours during execution → SPLIT at natural boundary (typically after forge-tutorial completes).

Don't push through to ship a half-working bulk. The HARD RULE: cleanly verified content > unverified scope.

## §13 — Cohort-facing impact

After this drain ships and smoke confirms:
- forge-music, forge-tutorial, forge-moda are all V2.
- Vendored E-- becomes deletable (separate drain).
- Cohort can author V2 notes against any domain.
- `/generate` workflow becomes the next high-leverage feature.

V2 migration is at ~75% complete: all cohort-facing content migrated; remaining work is on the authoring tools (`/generate`, `{{...}}`, chip palette UX) which V2.1 will deliver.
