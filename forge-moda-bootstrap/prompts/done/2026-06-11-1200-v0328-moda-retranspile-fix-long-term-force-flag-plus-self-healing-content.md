---
timestamp: 2026-06-11T12:00:00Z
session_id: drain-2026-06-11-1200
status: pending
priority: HIGH — closes the moda authoring regression; bridges to the V2 source-field model
---

# v0.2.128 — Moda re-transpile: long-term solution (engine force flag + plugin self-healing english_hash)

## §0 — Context

v0.2.127 diagnostic build confirmed H2 from the v0327 hypothesis matrix:

> Engine's `forge/core/executor.py:524-525` `if stored_hash is None: return code` legacy preservation rule fires on cohort-state moda snippets (which lack `english_hash` in frontmatter), causing every Forge-click to return cached Python regardless of English changes.

The cause is identified WITHOUT needing the spike output to land — CC's v0327 §1.4 read the engine source + driver's `grep` on `simulation.md` showed no `english_hash` field. Together they confirm H2.

Three fix options were surfaced in the brainstorm (forge-core, 2026-06-11):
- (a) Engine: drop the legacy rule entirely. Risk: hand-authored `# Python` in english mode gets overwritten.
- (b) Plugin: retry-write hash. Doesn't fix the first click after edit.
- (c) Moda branch: force-retranspile flag. Surgical; safe for non-moda paths.

Driver decision: **long-term solution per the brainstorm's combined Fix #1 + Fix #3 + V2 trajectory.** Concretely:

1. **(Plugin + engine) Fix #3**: introduce a `force` flag on `resolve_action_code` that bypasses the legacy `stored_hash is None → return cached` rule. Moda branch passes `force: true`.

2. **(Plugin) Self-healing**: ensure `writeCanonicalPythonBack` writes `english_hash` (audit + verify; v0.2.126 §4 #1 carry-forward). After one successful moda Forge-click, the snippet now has `english_hash` and future cache logic works correctly.

3. **(Forge-moda content, separate)**: backfill `english_hash` on all canonical moda snippets via the existing forge-moda inbox messages. Once content is migrated, the moda branch's force-flag becomes architectural redundancy that V2 cleans up via the `source` field.

This drain ships #1 and #2 (plugin + engine). #3 is a content migration that lives in forge-moda's inbox already.

## §1 — Goals

### §1.1 — Engine: `force` parameter for `resolve_action_code`

Add `force: bool = False` parameter. When `True`:
- Skip the `if stored_hash is None: return code` legacy preservation check
- Skip the `if stored_hash == compute_english_hash(english): return code` cache-hit check
- Always proceed to re-transpile via E--

Other cache logic preserved. The force flag is a CALLER opt-in, not a default change.

### §1.2 — Plugin: dispatchModaBranch uses force flag

`dispatchModaBranch` calls `routeActionCodeRegen` with deps that pass `force: true` through to the engine call:

```typescript
const regenResult = await routeActionCodeRegen(snippetId, {
  ...this.routingDeps(),
  resolveActionCode: async (id) => host.resolveActionCode(id, { force: true }),
});
```

Or equivalent: `routeActionCodeRegen` itself accepts a `force` option that flows through to its deps.

### §1.3 — Plugin: confirm self-healing via writeCanonicalPythonBack

Verify `writeCanonicalPythonBack` writes `english_hash` to frontmatter alongside the `# Python` body. Per v0.2.126 §4 #1 (uncertain at v0.2.126 time):

If it DOES (likely): after first force-retranspile, simulation.md has english_hash. Subsequent clicks WITHOUT a force flag would still cache-hit on matching hash, no force needed. Force flag is required only for the SELF-HEAL boot.

If it DOESN'T: the force flag is required forever (every click) until content backfill lands. Surface this; add the hash write.

### §1.4 — Architectural framing

The force flag is the bridge to V2:
- V1 today (after this drain): plugin's moda branch always force-transpiles; engine respects the flag.
- V1 after forge-moda content backfill (separate drain): force flag becomes redundant but harmless.
- V2 (`source: english | epython` field): the legacy `stored_hash is None` rule retires entirely. The `source` field replaces the inferred hand-authored-vs-auto-transpiled semantics. Force flag becomes a no-op for all branches.

This drain doesn't commit to V2 timing. It ships the bridge so V1 cohort UX works correctly NOW and V2 cleanup can happen on its own timeline.

## §2 — Investigation phase (per §78)

### §2.1 — Confirm engine `resolve_action_code` signature + call sites

```bash
grep -n "def resolve_action_code\|resolveActionCode" forge/core/executor.py forge-client-obsidian/src/pyodide-host.ts forge-client-obsidian/src/main.ts forge-client-obsidian/src/route-action-code-regen-core.ts
```

Document:
- Current Python signature
- Current JS-side wrapper signature
- All call sites in the plugin
- Which call sites need the force flag plumbed through

### §2.2 — Audit `writeCanonicalPythonBack` for english_hash write

```bash
grep -n "english_hash\|writeCanonicalPythonBack\|writePythonAndEnglishHash" forge-client-obsidian/src/main.ts forge-client-obsidian/src/pyodide-host.ts
```

Confirm:
- `writeCanonicalPythonBack` writes english_hash to frontmatter (probably via `writePythonAndEnglishHash` per v0.2.121 retrospective context)
- The hash matches the engine's computation of `compute_english_hash(english)` for cache validity to work

If the hash isn't written or computed inconsistently, the self-healing breaks. Flag in feedback.

### §2.3 — Engine cache-validity contract documentation

Read `~/projects/forge/docs/specs/constitution.md` B7.3 for the engine's cache-validity contract. Confirm:
- The contract is "english_hash + cached `# Python` → return cached if hash matches"
- The legacy `stored_hash is None → return cached` rule is documented (or note that it isn't)

If undocumented, this drain adds a brief note. Constitution amendment NOT in scope — that's separate.

### §2.4 — Engine bundle sync

Per the v0.2.124 + v0.2.126 + v0.2.127 pattern: engine code changes require `npm run sync-engine-bundle` to propagate to the plugin's inlined assets. Verify and run.

## §3 — Implementation phases

### §3.1 — Phase 1: engine `force` parameter

`forge/core/executor.py:resolve_action_code`:

```python
def resolve_action_code(snippet_id, slot_resolutions=None, force=False):
    # ... existing setup ...
    
    if force:
        # Skip cache checks; always re-transpile
        pass  # fall through to transpile logic below
    else:
        # Existing cache-hit logic per B7.3
        stored_hash = meta.get("english_hash")
        if stored_hash is None:
            return code  # legacy preservation
        if stored_hash == compute_english_hash(english):
            return code  # cache hit
        # else fall through to re-transpile
    
    # ... existing transpile logic ...
```

Engine tests:
- Existing `test_executor_slots.py` tests still pass (no force flag passed → default behavior unchanged).
- 2 new tests:
  1. `resolve_action_code(id, force=True)` returns fresh transpile even when stored_hash is None.
  2. `resolve_action_code(id, force=True)` returns fresh transpile even when stored_hash matches current english_hash.

### §3.2 — Phase 2: plugin force flag plumbing

`pyodide-host.ts:resolveActionCode`:

```typescript
async resolveActionCode(snippetId: string, opts?: { force?: boolean }): Promise<string | null> {
  // Pass force through to the engine's _forge_resolve_action_code Python global
  return this.callPython('_forge_resolve_action_code', { snippet_id: snippetId, force: opts?.force ?? false });
}
```

`route-action-code-regen-core.ts` deps shape — add an optional force option:

```typescript
export interface RoutingDeps {
  resolveActionCode: (id: string) => Promise<string | null>;
  // ...
}

// Caller wraps resolveActionCode with force when needed:
const deps = {
  ...this.routingDeps(),
  resolveActionCode: async (id) => host.resolveActionCode(id, { force: true }),
};
```

This keeps the routing-core's interface generic — it doesn't know about force, just calls the dep. Plugin code injects the force-aware variant when needed.

### §3.3 — Phase 3: dispatchModaBranch uses force

`main.ts:dispatchModaBranch`:

```typescript
private async dispatchModaBranch(view: MarkdownView): Promise<void> {
  const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
  const hostManager = getPyodideHost();
  const host = await hostManager?.getInstance();
  
  const deps = {
    ...this.routingDeps(),
    resolveActionCode: async (id: string) => {
      if (!host) return null;
      return await host.resolveActionCode(id, { force: true });  // moda always force
    },
  };
  
  const regenResult = await routeActionCodeRegen(snippetId, deps);
  // ... existing decideModaDispatchOutcome + writeback + openModaView flow ...
}
```

Comment explains why moda forces: "moda snippets in cohort state lack english_hash; force ensures the self-heal completes on first Forge-click. Once content backfill (forge-moda) lands, this flag becomes architectural redundancy that V2's `source` field cleans up."

### §3.4 — Phase 4: tests

Engine tests per §3.1.

Plugin tests:
- 1 new pure-core test for `routeActionCodeRegen` confirming that the force-aware deps are called correctly (pure-core stays generic; integration tests would verify the moda branch specifically — defer per the established v0.2.125 + v0.2.126 pattern).
- Regression guard: existing `decideForgeRouting` tests + `decideModaDispatchOutcome` tests pass unchanged.

Total: 2 engine + 1 plugin = 3 new tests.

### §3.5 — Phase 5: spike log removal

Remove the v0.2.127 `[v0.2.127 spike]` and `[v0.2.127 engine]` console.log lines added in v0.2.127. The diagnostic build's purpose is complete; the targeted fix replaces it.

## §4 — Tests required summary

- 2 new engine tests (force flag respected)
- 1 new plugin pure-core test (deps shape supports force option)
- Plugin suite: 695 → 696. Engine suite: passes after the 2 new tests.

## §5 — User-side smoke

```
# Step 1 — install v0.2.128.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.128

# Step 2 — open ~/forge-vaults/bluh/forge-moda/simulation.md.
# Edit # English to add a distinctive line, e.g.:
#   Print "Tamar v0128 test".

# Step 3 — Save (Cmd-S). Forge-click 🔥.
# Expected:
#   - Brief delay (~100-500ms) while E-- transpiles
#   - # Python facet visibly UPDATES to include the new English
#   - Moda simulation tab opens
#   - Simulation runs with new logic

# Step 4 — verify via grep:
grep -c "Tamar v0128 test" ~/forge-vaults/bluh/forge-moda/simulation.md
# Expected: 2 (one match in # English, one in # Python)

# Step 5 — verify self-heal: check english_hash now in frontmatter:
grep "english_hash" ~/forge-vaults/bluh/forge-moda/simulation.md
# Expected: english_hash: <some hash>

# Step 6 — second click without changing English:
# Click Forge again.
# Expected: simulation reruns quickly (engine cache hits on matching hash; no re-transpile).

# Step 7 — third click WITH English changed:
# Edit English again. Click Forge.
# Expected: # Python updates again (force flag still works regardless of cache state).
```

## §6 — Open follow-ups

1. **Forge-moda content migration** (separate, already in flight via 2026-06-09 + 2026-06-10 inbox messages): backfill `english_hash` on all canonical moda snippets. After migration, the force flag becomes architectural redundancy.

2. **Constitution amendment for v2**: legacy preservation rule retires when V2's `source: english | epython` field lands. Track for V2 trajectory.

3. **`facet-form-core.ts` deletion** (v0.2.121 §8 #3) — still in carry-forward.

4. **Granular toggle commands** (v0.2.122 §6 #4).

5. **English-mode `console.warn` at main.ts:1842** (v0.2.126 §4 #2).

6. Other carry-forwards unchanged.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 audits engine signature + call sites + cache contract before code.
- ✓ §57–74 (TDD): 2 engine + 1 plugin failing-first tests.
- ✓ §86–118 (pure-core convention): routing-core stays generic; force is injected via deps. No new pure-core needed; existing decision logic unchanged.
- ✓ §76 (don't ship speculative fix): targeted at H2 (confirmed via v0.2.127 diagnostic build).
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.127; release.sh bumps to 0.2.128.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.116 prior-art rule: applied via v0.2.127 diagnostic phase.
- ✓ NEW v0.2.120 console.error: ANY new catch blocks use console.error with method name.
- ✓ NEW v0.2.124 pure-core dispatch extraction: existing `decideForgeRouting` + `decideModaDispatchOutcome` unchanged; this drain doesn't add new dispatch logic.

## §8 — Architectural framing

V1 cohort regression fix + V2 bridge. The force flag is explicitly designed to retire when V2's source field lands. The plugin keeps the moda-specific force injection until forge-moda content is migrated OR V2 ships.

This is institutional: we ship the immediate fix WITHOUT adding architectural debt that V2 has to clean up. The force flag is a documented bridge with a known retirement condition.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order:
1. §2.1 + §2.2 investigation (~15 min)
2. §3.1 engine force flag + 2 tests + sync (~30 min)
3. §3.2 + §3.3 plugin plumbing + dispatchModaBranch update + 1 test (~30 min)
4. §3.5 spike log removal (~5 min)
5. Release v0.2.128

Estimated CC time: 1.5-2 hours.

If §2.2 reveals `writeCanonicalPythonBack` does NOT currently write english_hash, surface in feedback and add the write — without it, the self-healing breaks and the force flag becomes permanent (every click).
