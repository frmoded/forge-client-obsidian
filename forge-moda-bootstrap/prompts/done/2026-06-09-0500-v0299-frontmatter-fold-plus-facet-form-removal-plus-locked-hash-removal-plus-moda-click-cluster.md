---
timestamp: 2026-06-09T05:00:00Z
session_id: drain-2026-06-09-0500
status: pending
priority: HIGH — cohort UX cleanup; Tamar reported overwhelm signals
---

# v0.2.99 — Frontmatter fold + facet_form removal + locked_english_hash removal + moda click cluster

## §0 — Context

Tamar's cohort smoke (the first external user onboarding) surfaced overwhelm signals — frontmatter visual noise gating the actual snippet content. Driver brainstorm landed on a polish bundle:

- **Item A** — Auto-fold the YAML frontmatter block by default in action snippets so students see `# English` content first.
- **Item B** — Remove `facet_form` entirely. Pure vestigial field; V1 only ever supported canonical authoring; v0.2.81 defensive warning exists ONLY to detect this field's absence (circular).
- **Item C** — Remove `locked_english_hash`. v0.2.90's cache invalidation (delete `english_hash` on transition to english) substitutes for drift detection.
- **Item D** — Moda click UX: onclick currently creates N particles that scatter radially from the click point. Change to: N particles placed randomly within a small radius around the click point. "Cluster" instead of "explosion."

Common thread: cohort UX cleanup. Sister to v0.2.91-98 install-path stabilization but targeting in-vault authoring experience now that install works.

`english_hash` stays for V1 — load-bearing for slot-bearing snippet caching. Retires with V2's source-field migration.

## §1 — Goals

### Item A — Fold frontmatter by default

For files with `type: action` or `type: data` in frontmatter: on file-open in source mode, auto-fold the `---`-delimited YAML block at the top of the document. User can expand by clicking the fold-triangle on the opening `---` line if they want to see/edit metadata.

Behavior:
- Open snippet → frontmatter folded, `# English` (or active facet per edit_mode) visible immediately
- Plain notes (no `type: action|data`): no change; frontmatter stays expanded (user-controlled)
- Live preview / reading mode: unchanged; Obsidian's Properties view already handles frontmatter visibility natively

### Item B — Remove facet_form

Engine side:
- Stop reading `facet_form` in cache-validity logic. Cache valid iff `english_hash` matches.
- Stop writing `facet_form: canonical` when writing `# Python` cache.
- Remove `detect_facet_form_strip_trap` helper from `forge/core/executor.py` (introduced v0.2.81).
- Remove its 8 tests in `forge/tests/core/test_facet_form_strip_trap.py`.

Plugin side:
- Remove `_forge_facet_form_warning_set` dedup set + `console.warn` invocation from `pyodide-host.ts`.
- Audit all reads of `facet_form` across plugin source; remove or update.
- New-snippet template (wherever the plugin creates a new action snippet): remove `facet_form: canonical` from generated frontmatter.

Existing snippets with `facet_form: canonical` on disk: leave the field present (harmless); engine/plugin no longer read or write it.

### Item C — Remove locked_english_hash

Plugin side:
- `setEditModeForFile` no longer writes `locked_english_hash` on transition to python mode.
- `setEditModeForFile` no longer deletes `locked_english_hash` on transition to english mode.
- Audit all reads of `locked_english_hash` across plugin source; remove or update.
- B8 contract documentation: drift detection now happens at next Forge-click via `english_hash` mismatch → re-transpile + overwrite. (Same effective outcome as v0.2.90's cache invalidation.)

Engine side:
- Confirm no reads of `locked_english_hash` (drift detection was plugin-side). If any audit hits, surface in feedback.

### Item D — Moda click: random-in-radius particle placement

In `forge-moda-client/forge-moda-web`:
- Find the click handler that creates N particles.
- Replace the current radial scatter (angle-based distribution outward from click point) with N particles placed at random offsets within a small radius of the click point.
- "Small radius" suggested: ~10-20 pixels (or 0.5-1.0 in moda's internal coordinate space, whichever is more idiomatic). CC chooses a sensible default; can be configurable in a future drain.

Behavior change: clicking spawns a tight cluster of particles AT the click site rather than a radial explosion.

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item A: CM6 frontmatter fold mechanics

Verify:
- How Obsidian renders the YAML frontmatter block in source mode. The block is delimited by `---` on its own line at the top.
- Whether CM6 + Obsidian's frontmatter parser produces a foldable region (`foldRange` discoverable in the syntax tree) OR whether we need to compute the range manually (line 1 `---` to next `---`).
- Whether the existing `FacetMutexViewPlugin` can absorb this responsibility OR whether a sibling `FrontmatterFoldViewPlugin` is cleaner.
- Whether `editor.exec('toggleFold')` after cursor positioning on the `---` line works as an alternative to direct `foldEffect` dispatch.

Code-precedent check: search for any existing frontmatter fold logic in the plugin or in well-known community plugins for reference patterns.

### §2.2 — Item A: timing and v0.2.85-89 lessons applied

The v0.2.85-89 saga taught: NEVER dispatch from inside ViewUpdate. Use `setTimeout(0)` to defer.

When applying to frontmatter fold:
- `setEditModeForFile` writes frontmatter; if the controller folds frontmatter on every file-open AND writes frontmatter via mutex, there's a potential interaction. Audit.
- File-open + initial state apply needs to happen ONCE, not on every update.

### §2.3 — Item A: facet-mutex interaction

Verify: folding frontmatter does NOT trigger the facet-mutex semantics (frontmatter is neither `# English` nor `# Python`). The mutex's `readHeadings` should already ignore non-facet headings, but verify.

If `decideOnFoldChange` would treat any fold change as a mutex trigger, the frontmatter fold could spuriously flip `edit_mode`. Defensive check: mutex semantics are gated on `# English` / `# Python` heading lines specifically, not on other folds.

### §2.4 — Item B: facet_form removal audit

```bash
grep -rn "facet_form" forge/ forge-client-obsidian/src/ forge-tutorial/ forge-moda/ forge-music/
```

Expected hits:
- `forge/core/executor.py` — write site + helper
- `forge/tests/core/test_facet_form_strip_trap.py` — 8 tests
- `forge-client-obsidian/src/pyodide-host.ts` — dedup set + warning
- New-snippet template location (likely `main.ts` or a helper)
- Possibly forge-tutorial 09-slots/Slots.md (chapter 9 discipline note) — informational, not load-bearing

Document each hit + classify: remove, update, or leave (existing-snippet field present is fine).

### §2.5 — Item C: locked_english_hash removal audit

```bash
grep -rn "locked_english_hash" forge/ forge-client-obsidian/src/ forge-tutorial/ forge-moda/ forge-music/
```

Expected hits:
- `forge-client-obsidian/src/main.ts` (or wherever `setEditModeForFile` lives) — write + delete
- Possibly visual cues (button drift indicators — but the v0.2.79 ribbon button was removed; verify no orphan drift logic remains)
- Possibly cohort smoke test expectations (smoke commands grep for it — update test fixtures only, not the live grep commands in chat)

Verify v0.2.90's cache invalidation (delete `english_hash` on transition to english) is independent of `locked_english_hash`. It should be — they're separate field writes — but confirm.

### §2.6 — Item D: moda click handler location

```bash
grep -rn "onClick\|onclick\|click" forge-moda-client/forge-moda-web/src/
```

Identify the simulator's click handler. Look for the particle creation logic:
- Probably uses `Math.cos`/`Math.sin` with angle interpolation for radial distribution
- Particles likely have an initial velocity in the radial direction

Document the current logic before replacement so the diff is auditable.

### §2.7 — Item D: small radius value

Investigate moda's coordinate space — pixels vs internal units? What's a sensible "small" radius for a click cluster? Should match the visual density of existing UX (not too tight, not too loose).

Suggested: 15px (or equivalent in internal coordinates). CC can adjust based on visual inspection during impl.

## §3 — Implementation phases

### §3.1 — Phase 1: Item A — frontmatter fold

`src/frontmatter-fold-view-plugin.ts` (new module — OR extend `src/facet-mutex-view-plugin.ts` if §2.1 investigation shows it's cleaner):
- ViewPlugin that on file-open computes the frontmatter range (first `---` line to next `---` line) and dispatches `foldEffect.of({from, to})` via `setTimeout(0)` per the v0.2.85-89 deferred-dispatch pattern.
- Gate on: file has `type: action` or `type: data` frontmatter.
- On subsequent ViewUpdates: NO re-fold (just like facet-mutex's initial-state-apply runs once per file-open).

Wire into `main.ts.onload()` via `registerEditorExtension`.

### §3.2 — Phase 2: Item B — facet_form removal

Engine side (in `~/projects/forge/`):
- Remove the `facet_form: canonical` write in the cache-write path (`forge/core/executor.py`).
- Update cache-validity check to use `english_hash` matching alone.
- Remove `detect_facet_form_strip_trap` function.
- Delete `forge/tests/core/test_facet_form_strip_trap.py`.
- Update any other engine tests that reference `facet_form`.

Plugin side:
- Remove `_forge_facet_form_warning_set` Python-side dedup set.
- Remove the `console.warn` invocation.
- Audit `src/**/*.ts` for `facet_form` references; clean.
- Update new-snippet creation logic to not write `facet_form: canonical`.

### §3.3 — Phase 3: Item C — locked_english_hash removal

Plugin side:
- `setEditModeForFile`: remove write of `locked_english_hash` on python transition; remove delete on english transition.
- Audit `src/**/*.ts` for `locked_english_hash` references; clean.
- Verify v0.2.90 cache invalidation (`delete fm.english_hash` on english transition) is preserved.

Engine side:
- Audit for reads; clean if any (expected: none).

### §3.4 — Phase 4: Item D — moda click cluster

In `forge-moda-client/forge-moda-web/`:
- Locate click handler + particle creation logic.
- Replace radial scatter pattern with random-in-radius:
  ```typescript
  for (let i = 0; i < N; i++) {
    const offsetX = (Math.random() - 0.5) * 2 * SMALL_RADIUS;
    const offsetY = (Math.random() - 0.5) * 2 * SMALL_RADIUS;
    const r = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    if (r > SMALL_RADIUS) {
      // resample to stay within radius (uniform-in-disk)
      i--;
      continue;
    }
    particles.push({ x: click.x + offsetX, y: click.y + offsetY });
  }
  ```
  Or alternative: use polar coords with `r = Math.sqrt(Math.random()) * SMALL_RADIUS` (uniform-in-disk distribution).
- Initial velocity: zero OR small random (CC decides based on existing particle physics).

Re-bundle iframe via `cd ../forge-moda-client/forge-moda-web && npx vite build` per the v0.2.97 cross-repo pattern.

### §3.5 — Phase 5: cross-cutting integration

- Run full plugin test suite: must remain at 593 passing (with adjustments for removed tests).
- Run full forge engine suite: must remain green (with adjustments for removed `facet_form` tests).
- Build clean: `npm run build` exit 0.
- Asset version stamping (v0.2.98) auto-handles the iframe re-bundle — verify the `.bundle-version` sentinel mismatch triggers re-restore on user install.

## §4 — Tests required

### Item A — frontmatter fold

- Pure-core (if extracted): test that the fold-range computation locates `---` delimiters correctly. Edge cases: no frontmatter; malformed frontmatter (single `---`); frontmatter with `---` content inside YAML (rare but possible).
- Integration: simulate file-open on a snippet; verify dispatch fires once with a non-empty fold range.

### Item B — facet_form removal

- Existing engine tests that reference `facet_form` either:
  - Updated to remove the assertion (if the test still has value without the field)
  - Deleted (if the test's only purpose was the strip-trap detection)
- Cache-validity tests must continue to pass without the `facet_form` check.

### Item C — locked_english_hash removal

- Any existing tests that assert `locked_english_hash` write/delete: remove the assertions.
- Verify v0.2.90's `english_hash` delete on english transition still works (test would have caught regression).

### Item D — moda click cluster

- Particle cluster test: simulate click at known coords; assert all created particles fall within `SMALL_RADIUS` of the click point.
- Distribution test (loose): N particles across many clicks should be uniformly distributed within the radius (not biased toward center/edges depending on chosen method).

Total estimated new/modified tests: ~5-8. Net test count may go DOWN due to v0.2.81 strip-trap tests being deleted.

## §5 — User-side smoke

```
# Step 1 — install v0.2.99 via BRAT (or local install-latest.sh).
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.99

# === Item A: frontmatter fold ===
# Step 2 — open ~/forge-vaults/bluh/forge-tutorial/01-hello/hello_world.md.
# Expected initial visual state (source mode):
#   - Frontmatter (---...---) is FOLDED — only the opening "---" line visible
#     with a fold-triangle to expand.
#   - # English heading visible immediately below.
#   - Content of # English visible (expanded per facet mutex).

# Step 3 — click the fold-triangle on the "---" line.
# Expected: frontmatter expands; all YAML fields visible. Click again to fold.

# === Item B + C: cleaner frontmatter ===
# Step 4 — Forge-click hello_world.md to compute. Snippet still works.
# Expand frontmatter — should NOT contain facet_form. (slot-free → no
# english_hash either since v0.2.99 still writes it for slot-bearing only.)

# Step 5 — Toggle to python mode via Cmd-P → "Forge: Toggle Python/English editing mode".
# Expand frontmatter. Expected fields: type, inputs, edit_mode: python.
# Should NOT contain locked_english_hash.

# Step 6 — Toggle back to english. Frontmatter should NOT have edit_mode
# field, edit_mode is implicit english.

# Step 7 — Create a NEW snippet via the plugin's "New Snippet" command.
# Expand frontmatter. Should NOT contain facet_form.

# === Item D: moda click cluster ===
# Step 8 — Open a moda simulation snippet. Click in the simulator viewport.
# Expected: small cluster of particles appears AT the click point (tight cluster,
# ~15px radius). NOT a radial scatter expanding outward.

# Step 9 — Click multiple times at different points. Each click produces an
# independent cluster.
```

## §6 — Open follow-ups expected

1. **Existing snippets with `facet_form` on disk**: harmless but inconsistent. A future migration drain could strip the field from existing snippets during plugin update. Out of scope for v0.2.99.

2. **Frontmatter fold for non-action notes**: if cohort uses Forge for non-snippet notes that ALSO have noisy frontmatter, generalize the fold behavior. Out of scope; cohort-evidence triggered.

3. **forge-doc chapter 9 discipline note now obsolete**: with `facet_form` removed, the chapter 9 facet_form preservation note in `forge-tutorial/09-slots/Slots.md` no longer applies. Send a message to forge-doc requesting removal in the next forge-tutorial bump.

4. **Moda click particle behavior may need fine-tuning**: SMALL_RADIUS value, initial velocity, particle lifetime in cluster mode — cohort feedback may want adjustment. v0.2.99 ships a sensible default; refine per signal.

5. **Constitution amendment bundle reminder**: forge-core has a pending constitution amendment bundle (B7.3 update for symmetric mutex + cache invalidation + facet_form removal + locked_english_hash removal + inlined-asset version stamping + console.error HARD RULE). All authorized per user decisions across this session. Next protocol-touch drain folds these in.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 audits all four items with concrete grep commands + cross-cutting checks.
- ✓ §57–74 (TDD): Items B and C delete tests (the strip-trap surface no longer needed); Items A and D add tests for new behavior. Failing-first applies to Items A and D where applicable.
- ✓ §86–118 (pure-core convention): Item A may extract a pure-core for frontmatter-range computation; Items B/C are integration cleanup; Item D is integration-layer.
- ✓ §76 (don't ship speculative fix): all four items have concrete user-facing justifications (cohort overwhelm, V2-alignment, deprecation, cohort UX).
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.98; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ "Assert cannot only with concrete error" HARD RULE: §2 audits grounded in concrete grep commands + visual inspection for moda click.
- ✓ v0.2.98 inlined-asset version stamping HARD RULE: re-bundled iframe (Item D) automatically triggers `.bundle-version` mismatch → force-overwrite on next install. No additional discipline needed.

## §8 — Architectural framing

V1 polish. Aligns with V2 direction (`source: english | epython`) without committing to V2 semantics:
- `facet_form` removal: V2 doesn't have this field.
- `locked_english_hash` removal: V2's `source` field eliminates the python-mode-drift case structurally.
- Frontmatter fold: cohort UX improvement that benefits V1 and V2 equally.
- Moda click cluster: pure UX polish; V2-orthogonal.

None of these touch the `edit_mode` field semantics or the gestural mutex itself. v0.2.83-98's facet-mutex work survives intact.

V2 timing: still post-cohort-evidence per v2-direction.md. These removals close the gap modestly — V2 still needs the source-field migration, gestural promote, EPython spec, tutorial restructure.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order (B and C are smallest scope; A is medium; D is cross-repo):
1. Item B (facet_form removal) — engine + plugin audit, clean delete.
2. Item C (locked_english_hash removal) — plugin-only, smaller.
3. Item A (frontmatter fold) — ViewPlugin work, applies v0.2.85-89 lessons.
4. Item D (moda click cluster) — cross-repo, iframe re-bundle.

All four ship together as v0.2.99. If Item A's §2.1 investigation reveals CM6 frontmatter fold has more complexity than expected (e.g., Obsidian's frontmatter parser doesn't expose a foldable region), surface in feedback and consider falling back to Mechanism 3 (CSS de-emphasis ~10 LOC) for Item A alone.

If Item D's §2.6 audit can't locate a single clear click handler (e.g., particle creation is scattered across multiple handlers), surface scope.

Critical: per §2.2, apply the v0.2.85-89 deferred-dispatch lesson — NEVER call `view.dispatch()` from inside `ViewUpdate`. Use `setTimeout(0)`.
