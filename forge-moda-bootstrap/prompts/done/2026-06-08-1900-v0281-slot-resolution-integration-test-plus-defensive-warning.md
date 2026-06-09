---
timestamp: 2026-06-08T19:00:00Z
session_id: drain-2026-06-08-1900
status: pending
---

# v0.2.81 — Slot-resolution integration test + defensive engine warning

## §0 — Context

Two v0.2.73 follow-up items, both shaped around hardening slot-resolution durability against the upcoming V1 cohort exposure. Bundled together because they share the slot-resolution loop as their subject. Polish bundle, not feature work.

**Item A** (#6 from polish backlog): Defensive engine warning when `slot_resolutions` is provided in snippet frontmatter but `facet_form` is absent. Currently the engine silently re-transpiles every click in this case; a `console.warn` would surface the Obsidian-YAML-strip frequency under cohort use + give power users a self-diagnosis path.

**Item B** (#7 from polish backlog): Plugin-side integration test for the slot-resolution lifecycle. Currently the 4-layer flow (plugin → engine → /resolve-slot → engine) is only tested per-layer; no integration test catches lifecycle regressions. The v0.2.69-0.2.75 slot-resolution arc had FOUR distinct bugs at different layers; per-layer tests caught none of them. User has authorized the substantial scope.

The user said "ship, ignore risk" on Item B, knowing it's the most expensive of the three v0.2.73 follow-ups. Bundle them together because they exercise the same surface.

## §1 — Goal

### §1.1 — Item A: defensive warning

When the engine reads a snippet that has `slot_resolutions` in frontmatter BUT `facet_form` is missing or != `canonical`:

```
console.warn(`Forge: snippet '${snippet_id}' has slot_resolutions but facet_form is absent (or != canonical). This is likely an Obsidian YAML-strip issue. Snippet will re-transpile on every click. Add 'facet_form: canonical' to frontmatter to restore caching.`)
```

The warning fires ONCE per snippet per session — not on every transpile call. Use a session-local Set<string> to dedupe by snippet_id.

### §1.2 — Item B: integration test for slot-resolution lifecycle

Build a plugin-side integration test that exercises the full slot-resolution loop:
1. Fixture: in-memory or temp-dir vault with a slot-bearing snippet (E-- body with `{{ }}` slot tokens; frontmatter declaring `facet_form: canonical` + slot definitions).
2. Mock `/resolve-slot` endpoint to return predictable resolved values.
3. Call `forge.runSnippet` programmatically (or simulate the click via test-harness).
4. Verify disk-state outcomes:
   - `# Python` heading written to snippet body with correct cached Python.
   - `english_hash` written to frontmatter, matches body english_hash.
   - `facet_form: canonical` preserved (Obsidian-strip not simulated by default; baseline run).
   - Second `forge.runSnippet` call uses the cache — no `/resolve-slot` re-call.
5. Verify regression-shape:
   - Mutating the English body invalidates the cache (english_hash mismatch → re-transpile).
   - Mutating a slot resolution invalidates the cache (slot_resolutions hash → re-resolve).
   - Removing `facet_form` triggers re-transpile (cache miss).

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item A: warning insertion site

Locate the slot-resolution branch in `src/pyodide-host.ts` (or wherever the engine processes snippet frontmatter + slot_resolutions). Identify the exact function where `slot_resolutions` is consumed. Verify there's a clean place to insert the check `if (slot_resolutions && facet_form !== 'canonical')`.

Investigate whether the session-dedup Set should live:
- In `pyodide-host.ts` module-scope (simplest, but lives across snippet reloads).
- In a per-plugin-instance member (cleaner; resets on plugin reload).

Recommend: per-plugin-instance member (cleaner reset semantics; warning re-fires after plugin reload which is useful for testing).

### §2.2 — Item B: existing integration test infrastructure

Survey existing test files in `src/`:
- Look for any `*.integration.test.ts` or harness files.
- Look for vault fixture builders (in-memory + temp-dir patterns).
- Look for mocking of `/resolve-slot` or other engine endpoints.

If nothing exists for end-to-end vault simulation, this drain BUILDS the harness first, then the test. Harness should be reusable for future integration tests (V2 will want it).

Investigate which `runSnippet` entry point to call:
- The plugin's `forge.runSnippet` exported function.
- A lower-level engine entry that bypasses Obsidian UI.

Recommend: lower-level engine entry. Avoid mocking Obsidian's `MarkdownView`, `editor`, etc. — that's brittle. The slot-resolution loop is engine-side; test it engine-side.

### §2.3 — Mock `/resolve-slot` endpoint shape

Verify the current `/resolve-slot` request/response shapes by reading the engine source. The mock must match exactly. Document the shapes in the test fixture for future reference.

### §2.4 — Test fixture content

Design a minimal slot-bearing snippet that exercises the lifecycle without being noisy. Suggestions:
- 1-2 slots, simple types.
- E-- body short (5-10 lines).
- Slot resolutions in frontmatter with concrete values.
- No external snippet dependencies.

The test fixture should NOT depend on forge-tutorial or forge-moda content; standalone.

### §2.5 — Test isolation

The integration test must not mutate the user's vault or the actual `/resolve-slot` endpoint. Run in a sandboxed temp dir; tear down after.

If existing tests use a particular sandbox pattern, follow it. If not, propose one in feedback.

## §3 — Implementation phases

### §3.1 — Phase 1: Item A (small)

1. Add session-dedup Set to plugin class.
2. Insert warning at the identified site in `pyodide-host.ts` (or wherever the engine processes `slot_resolutions`).
3. Write a single test asserting:
   - Warning fires when `slot_resolutions` present + `facet_form` absent.
   - Warning fires ONCE per snippet_id per session.
   - Warning does NOT fire when `facet_form: canonical` is present.
   - Warning does NOT fire when `slot_resolutions` is absent.

### §3.2 — Phase 2: Item B — harness

Build the integration test harness:
- `src/test-harness/vault-fixture.ts` — temp-dir vault setup with `forge.toml`, snippet writing, teardown.
- `src/test-harness/mock-resolve-slot.ts` — mock endpoint with configurable response.
- `src/test-harness/run-snippet.ts` — direct engine-side `runSnippet` invoker bypassing Obsidian UI.

Document harness usage in `src/test-harness/README.md` (or inline tsdoc) so the next integration test can reuse.

### §3.3 — Phase 3: Item B — happy path test

`src/slot-resolution-integration.test.ts`:
1. Setup vault with slot-bearing snippet.
2. Call `runSnippet` once.
3. Assert: `# Python` written, `english_hash` written, cache populated.
4. Call `runSnippet` second time.
5. Assert: `/resolve-slot` mock was NOT called again (cache hit).

### §3.4 — Phase 4: Item B — regression-shape tests

Same fixture, but mutate state between calls:
- Mutate English body → english_hash mismatch → cache miss → /resolve-slot called.
- Mutate slot resolution → slot_resolutions hash mismatch → cache miss → /resolve-slot called.
- Remove `facet_form` → cache miss → /resolve-slot called + warning from Item A fires.

### §3.5 — Phase 5: Item A + B intersection test

Verify Item A's warning fires in the integration test for the `facet_form`-removed case. This is the test that proves Item A's warning actually works end-to-end, not just in the unit test.

## §4 — Tests required summary

- Item A: 1 unit test (4 sub-assertions).
- Item B: ~4 integration tests + ~2-3 harness unit tests.
- Total new tests: ~6-8.
- Existing test suite must remain passing (538 → ~545).

## §5 — User-side smoke checklist

This drain is dev-side regression hardening. Minimal user smoke:

```
# Step 1 — install v0.2.81.

# Step 2 — open a slot-bearing snippet (e.g. forge-tutorial/09-slots/*.md or
# forge-moda has parametric snippets).
# Forge-click. Verify snippet computes correctly. Open DevTools console.

# Step 3 — Manually strip facet_form from frontmatter (edit the file).
# Re-click 🔥. Observe:
#   - Snippet still computes correctly.
#   - DevTools shows warning: "Forge: snippet ... has slot_resolutions but
#     facet_form is absent..."
#   - Warning fires once. Re-clicking same snippet does NOT re-warn.

# Step 4 — Restore facet_form: canonical to frontmatter.
# Re-click 🔥. Verify:
#   - Snippet computes (no behavior change).
#   - DevTools shows no new warning for this snippet.
#   - Cache hit on the second click.

# Step 5 — Run the integration test suite to verify regression coverage:
cd ~/projects/forge-client-obsidian && npm test -- slot-resolution-integration
# Expected: all integration tests pass.
```

## §6 — Open follow-ups expected

1. **Auto-restore behavior for `facet_form: canonical`**: user authorized warning-only; deferred. If cohort warnings show high frequency, future drain considers auto-write.
2. **Test harness V2 compatibility**: V2 will change slot-resolution semantics. Note in the harness README whether the test fixture is V1-specific or also valid for V2.
3. **Test fixture coverage**: this drain ships happy path + 3 regression-shape tests. Future drains may add edge cases (multiple slots, nested snippets, etc.).
4. **`/resolve-slot` mock drift**: if real `/resolve-slot` shape changes, the mock must update. Document in harness README.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates surveying existing test infrastructure before building harness.
- ✓ §57–74 (TDD): integration tests are failing-first if any current bug exists; if all pass on first run, that's the regression-guard baseline.
- ✓ §86–118 (pure-core convention): harness modules are pure-cores; tests import them.
- ✓ §76 (don't ship speculative fix): both items have concrete justification — Item A for cohort telemetry, Item B for regression protection on a 4-layer-bug-prone flow.
- ✓ §347 (version-bump sanity): manifest pre-bump at 0.2.80; explicit version arg.
- ✓ §321 (feedback file before move): standard.

## §8 — Architectural framing

This drain is V1 polish/hardening — NOT V2 work. The integration test harness should be designed to test V1 slot-resolution semantics (`facet_form: canonical`, `english_hash`, `slot_resolutions` in frontmatter, `# Python` cached body). V2 will change this surface; the harness will need updating when V2 lands. That's expected — the harness's primary value is V1 cohort regression protection.

If during §2 investigation it becomes clear that the integration test will be largely thrown away in V2, FLAG IT in feedback. The user has pre-authorized "ship, ignore risk" but if the throw-away ratio is very high (e.g., 90% rewrite for V2), surface that for the user to reconsider.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Pickup with §2 investigation phase. Item A is small and can land first; Item B is the main work. Sequencing: §3.1 (Item A) → §3.2 (harness) → §3.3 (happy path) → §3.4 (regression-shape) → §3.5 (intersection).
