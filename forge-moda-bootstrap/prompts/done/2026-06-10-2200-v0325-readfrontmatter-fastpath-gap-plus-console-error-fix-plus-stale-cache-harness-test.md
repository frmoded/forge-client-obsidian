---
timestamp: 2026-06-10T22:00:00Z
session_id: drain-2026-06-10-2200
status: pending
priority: HIGH — closes the v0.2.124 review gap pre-emptively; ships defensive coverage for the stale-non-null cache case
---

# v0.2.125 — readFrontmatterForRouting fast-path key-presence guard + console.error fix + stale-cache harness test

## §0 — Context

v0.2.124 shipped the simulation regression fix per the v0.2.123 prompt:
- Pure-core `decideForgeRouting` extraction (8 failing-first tests, test #4 caught a real spec drift)
- Defensive `readFrontmatterForRouting` fallback for runtime metadataCache emptiness

Forge-core's independent review (sitting in forge-moda's inbox at `~/projects/forge-moda-bootstrap/messages/to-forge-moda/2026-06-10-2122-v0124-readfrontmatter-gap-plus-patterns-belong-in-ccqueue-not-constitution.md`) caught two real gaps:

1. **`readFrontmatterForRouting` fast-path gap**: the code checks `if (cachedFm)` but doesn't verify routing-relevant keys are present. So the disk-read fallback only fires on null/undefined cache, NOT on a stale-non-null cache missing `featured` / `edit_mode`. The v0.2.124 ship covered the null/empty case; the stale-non-null case still recurs.

2. **`console.warn` HARD RULE violation**: `main.ts:1602` logs the caught `vault.read` failure as `console.warn`. The v0.2.120 HARD RULE shipped earlier today (3 hours before v0.2.124): caught runtime errors MUST be `console.error` with method name.

This drain ships both fixes pre-emptively. Whether the v0.2.124 simulation smoke passes or fails, the gap is real — closing it now is defensive coverage that pays for itself the next time metadataCache is stale-non-null.

Plus: per the new HARD RULE shipped today in cc-prompt-queue.md ("Defensive fallback for metadataCache reads driving user-perceivable behavior"), the integration test against a stale-non-null cache is mandatory. This drain ships that test against the v0.2.112 harness.

## §1 — Goals

### §1.1 — Tighten `readFrontmatterForRouting` fast path

Replace the current fast-path check (`main.ts:1573` area):

```ts
if (cachedFm) {
  return cachedFm as Record<string, unknown>;
}
```

with the routing-key-presence guard:

```ts
if (cachedFm && ('featured' in cachedFm || 'edit_mode' in cachedFm)) {
  return cachedFm as Record<string, unknown>;
}
// fall through to vault.read + YAML parse
```

The reasoning: if the cached frontmatter has neither `featured` nor `edit_mode`, the cache is either stale (file was updated, cache not refreshed) OR the file has no routing keys at all (it's an authoring snippet without metadata). Both cases benefit from the disk fallback:
- Stale cache: disk read gets the current values.
- Genuinely-no-routing-keys file: disk read returns the same shape; result is identical (`english-mode` routing).

The fallback's cost is one disk read per cache-miss case. Negligible.

### §1.2 — Fix `console.warn` → `console.error` violation

`main.ts:1602` (or wherever the `vault.read` catch block lives in `readFrontmatterForRouting`):

```ts
catch (e) {
  console.error('readFrontmatterForRouting: vault.read failed', e);
  return null;
}
```

Method name in the message per the v0.2.120 HARD RULE. Cite the rule in the commit.

### §1.3 — Integration test against stale-non-null metadataCache

New test in `src/main.test.ts` (or `src/forge-snippet-routing-core.test.ts` if the test is purely about the routing wrapper):

Using the v0.2.112 `createIntegrationHarness()`:

```ts
test('readFrontmatterForRouting falls through stale cache missing routing keys', async () => {
  const harness = createIntegrationHarness();
  try {
    // Set up the test file's disk content with featured: true
    const file = mockTFile('forge-moda/simulation.md');
    const diskContent = '---\ntype: action\nfeatured: true\n---\n# English\n\n…';
    harness.mockVaultRead(file, diskContent);
    
    // metadataCache returns frontmatter MISSING `featured` (stale)
    harness.mockMetadataCache(file, { type: 'action' });
    
    // Run the routing decision through readFrontmatterForRouting
    const fm = await plugin.readFrontmatterForRouting(file, harness.cachedFmForFile(file));
    
    // Expected: fm contains `featured: true` from the disk fallback
    expect(fm?.featured).toBe(true);
  } finally {
    harness.destroy();
  }
});
```

Plus a regression-guard test for the fast-path key-presence:

```ts
test('readFrontmatterForRouting fast-path returns cache when routing keys present', async () => {
  // cache has `featured: true`; fast path returns it; no disk read
  // Assert: vault.read was NOT called
});
```

~2-3 new integration tests via the harness. Per the new "CM6 integration test (HARD RULE)" — these tests apply the same rule to the metadataCache surface.

## §2 — Investigation phase (per §78)

### §2.1 — Verify exact line numbers

```bash
grep -n "readFrontmatterForRouting\|cachedFm\b\|vault\.read" forge-client-obsidian/src/main.ts
```

Document the precise line of the fast-path check + the catch block to modify. v0.2.124's commits should make this easy.

### §2.2 — Verify the harness can mock metadataCache + vault.read

The v0.2.112 `createIntegrationHarness()` was built for CM6 EditorView mounting. Check whether it supports:
- `mockMetadataCache(file, frontmatter)` — return specific frontmatter for the file
- `mockVaultRead(file, content)` — return specific content from vault.read

If NOT supported: extend the harness with these mocks as part of this drain. Keep them generic so future tests can reuse.

If extension is non-trivial (>2 hours), surface scope and split: ship the code fix in v0.2.125; harness extension + integration test in v0.2.126.

### §2.3 — Confirm v0.2.120 HARD RULE wording for the console.error fix

The rule: "Any `catch` block that handles an unexpected runtime exception MUST use `console.error` and include the originating method name in the message."

Reference `cc-prompt-queue.md` line 362 (the rule).

## §3 — Implementation phases

### §3.1 — Phase 1: code fixes (§1.1 + §1.2)

- Update fast-path check in `readFrontmatterForRouting`
- Update catch block to `console.error` with method name
- ~5-10 LOC modified

### §3.2 — Phase 2: integration tests (§1.3)

- Extend `createIntegrationHarness()` if needed per §2.2 outcome
- Add the stale-cache test
- Add the fast-path regression-guard test
- Verify all tests pass

### §3.3 — Phase 3: cross-cutting

- Run full test suite: should remain 671 passing + 2-3 new
- Build clean
- Asset version stamping auto-handles BRAT propagation

## §4 — Tests required

- ~2-3 new integration tests via harness
- Plugin suite: 671 → ~673-674 passing
- Harness extension self-tests if §2.2 extension needed: 1-2 more

## §5 — User-side smoke

```
# Step 1 — install v0.2.125.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.125

# Step 2 — open forge-moda/simulation.md. Forge-click.
# Expected (regardless of metadataCache state):
#   - moda simulation tab opens
#   - simulation runs

# Step 3 — DevTools console:
# Trigger a vault.read failure if possible (e.g., manually delete the file
# after open, then Forge-click). Verify catch block logs via console.error
# with method name "readFrontmatterForRouting" prefix.
# Most likely you can't reproduce a vault.read failure on demand; smoke
# this defensively via the integration test in CI rather than manual.

# Step 4 — confirm v0.2.124 smoke still passes (no regression):
# Open hello_world.md. Forge-click. Expected: computes via E-- transpile.
# Open a snippet with edit_mode: python. Forge-click. Expected: python-mode notice.
```

## §6 — Open follow-ups

1. **v0.2.124 simulation smoke**: still pending separately. v0.2.125 closes the latent gap but doesn't itself fix anything user-visible IF the v0.2.124 fallback was sufficient.
2. **Carrying forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - v0.2.119 persistent expanded-state across file switches
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
   - Harness Obsidian-shim build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error (v0.2.123 prompt §6 #4)

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 verifies line numbers + harness capabilities before code.
- ✓ §57–74 (TDD): integration tests landed alongside the code fix.
- ✓ §86–118 (pure-core convention): no new pure-core (the fix is in the integration layer; tests via harness).
- ✓ §76 (don't ship speculative fix): both fixes targeted at concrete gaps documented in the 21:22 review.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.124; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 (CM6 integration tests): N/A — this is metadataCache, not CM6.
- ✓ NEW v0.2.120 (`console.error` HARD RULE): yes, this drain APPLIES the rule (fixing a violation).
- ✓ NEW v0.2.124 (Pure-core dispatch extraction HARD RULE): N/A — extraction shipped in v0.2.124 already.
- ✓ NEW v0.2.124 (Defensive fallback for metadataCache HARD RULE): yes, this drain APPLIES the rule (fixing the fast-path gap that the rule's text explicitly identifies).

## §8 — Architectural framing

V1 cohort regression follow-through + protocol-discipline catch-up. Preventive coverage that ships even if the v0.2.124 fallback was already sufficient for the immediate regression.

The integration test against stale-non-null metadataCache becomes a foundational pattern: any future routing/fold/modal that consumes metadataCache should write a similar test alongside the code.

No V2 architectural commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Suggested order:
1. §2.1 verify line numbers (~5 min)
2. §3.1 code fixes (~15 min)
3. §2.2 verify/extend harness (~15-60 min depending on coverage)
4. §3.2 integration tests (~30 min)
5. §3.3 cross-cutting (~10 min)
6. Release v0.2.125

Estimated CC time: 1-2 hours total.

If §2.2 reveals the harness extension is substantially more work (>2 hours), surface scope and split:
- v0.2.125 ships the code fixes (§3.1) + smaller smoke verification
- v0.2.126 builds the harness extension + adds the tests
