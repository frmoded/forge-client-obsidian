---
timestamp: 2026-06-10T23:00:00Z
session_id: drain-2026-06-10-2300
status: pending
priority: HIGH — cohort moda authoring is currently broken; editing English doesn't propagate to simulation
---

# v0.2.126 — Moda branch MUST re-transpile English → Python before opening iframe

## §0 — Bug report

Driver smoke against v0.2.124 (latest):

> "Clicking forge on simulation does not change the python. Changing the English to print 'Tamar' still runs the simulation, and ignores the English facet."

What works after v0.2.124:
- Routing decision is correct: `decideForgeRouting('forge-moda/simulation.md', {featured: true})` → `moda`
- Moda branch fires: `openModaView` + `requestFeaturedRun`
- Iframe runs and shows simulation

What's broken:
- Edits to `# English` do NOT propagate to `# Python`
- Iframe's compute reads stale `# Python` cache
- Simulation runs against the OLD Python, even when English visibly differs

Architectural gap analysis:

The moda branch in `main.ts` (post-v0.2.124, line ~1715):

```typescript
if (routing.kind === 'moda') {
  await this.openModaView();
  const leaf = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE)[0];
  if (leaf?.view instanceof ForgeModaView) {
    leaf.view.requestFeaturedRun();
  }
  return;
}
```

This branch SKIPS `routeActionCodeRegen` entirely — the routing wrapper that would have called E-- transpile + `writeCanonicalPythonBack`. So:

1. v0.2.102 pre-flight sync writes fresh English to MEMFS ✓
2. Moda branch opens iframe + dispatches `featured-run` + returns
3. Iframe issues engine-request for snippet compute
4. Engine's `resolve_action_code` (v0.2.121+ semantics):
   - English mode + `english_hash` ABSENT → return cached `# Python` (legacy preservation, no invalidation contract)
   - English mode + `english_hash` PRESENT and matches → return cached `# Python` (B7.3 cache hit)
   - English mode + `english_hash` PRESENT and mismatches → fall through to re-transpile

For canonical moda snippets like `simulation.md` (hand-authored, no `english_hash` in frontmatter), the engine ALWAYS returns cached `# Python`. English edits never propagate.

This has likely been broken since v0.2.92 (the first time moda branch was introduced). It surfaced only when a cohort user tried to edit a featured moda snippet's English and observe behavior change.

## §1 — Goal

In the moda branch, BEFORE opening the iframe, call `routeActionCodeRegen` to ensure `# Python` is up-to-date with `# English`. Specifically:

1. Try E-- transpile via `resolveActionCode(snippetId)`
2. On success: write the result back to `# Python` via `writeCanonicalPythonBack` + update `english_hash` in frontmatter
3. On E-- failure (free-text English): fall back to `/generate` if token present; if no token, surface Notice + open iframe anyway (so user can still see what's running)
4. AFTER routing/regen completes: open moda view + dispatch featured-run

Net effect: editing `# English` and clicking Forge on a featured moda snippet runs the simulation with the just-transpiled `# Python`.

## §2 — Investigation phase (per §78)

### §2.1 — Verify `writeCanonicalPythonBack` semantics

```bash
grep -n "writeCanonicalPythonBack" forge-client-obsidian/src/main.ts forge-client-obsidian/src/pyodide-host.ts
```

Confirm:
- Where the function lives
- What it does (writes the Python code into the snippet's `# Python` heading region)
- Whether it also writes `english_hash` to frontmatter (likely yes per B7.3 + v0.2.121 semantics)
- Side effects: cache invalidation, vault.modify events, etc.

### §2.2 — Verify `routeActionCodeRegen` call shape

The English-mode branch in `forgeSnippet` already uses `routeActionCodeRegen`. Replicate the same call shape in the moda branch:

```typescript
const regenResult = await routeActionCodeRegen(snippetId, {
  resolveActionCode: async (id) => {
    const hostManager = getPyodideHost();
    if (!hostManager) return null;
    const host = await hostManager.getInstance();
    return await host.resolveActionCode(id);
  },
  generate: async (id) => { /* existing /generate call */ },
  hasToken: !!this.settings.transpileServiceToken?.trim(),
});
```

### §2.3 — Ordering: regen BEFORE openModaView, or after?

Two options:

**(a) Regen first, then open iframe.** Iframe opens with fresh `# Python` on disk. Compute reads fresh Python. Clean.

**(b) Open iframe first, then regen asynchronously.** User sees iframe immediately; regen happens in background; iframe might compute against stale Python on first tick.

Recommend (a) — even though it adds ~100-500ms delay before iframe opens, the result is correct. The iframe's compute always uses fresh Python. Cohort users see "click Forge → brief delay → simulation runs with my new code."

For (b)'s perceived responsiveness, alternative: show a Notice ("Forge: re-transpiling...") during the regen so user knows what's happening.

CC chooses based on UX feel; (a) is safer correctness-wise.

### §2.4 — Failure modes

Per `routeActionCodeRegen`'s discriminated union (v0.2.121):
- `{ok: true, code, via: 'e--' | 'generate'}` → write back, open iframe
- `{ok: false, reason: 'no-token'}` → user lacks LLM token; English is free-text. Surface Notice. Open iframe anyway (simulation runs with current `# Python`, whatever that is).
- `{ok: false, reason: 'engine-error'}` → E-- threw. Surface Notice. Open iframe anyway.
- `{ok: false, reason: 'http-error'}` → /generate failed. Surface Notice. Open iframe anyway.

Net policy: on regen failure, open the iframe anyway with the existing `# Python`. User sees a Notice explaining the regen failed, but can still interact with the simulation (debugging stale state, etc.).

## §3 — Implementation phases

### §3.1 — Phase 1: extract a routine

Refactor the moda branch dispatch into a helper:

```typescript
private async dispatchModaBranch(view: MarkdownView): Promise<void> {
  const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
  const regenResult = await routeActionCodeRegen(snippetId, this.routingDeps());
  if (regenResult.ok) {
    await writeCanonicalPythonBack(view, regenResult.code);
  } else {
    new Notice(`Forge: English-to-Python re-transpile failed (${regenResult.reason}); simulation will run with current Python.`);
  }
  await this.openModaView();
  const leaf = this.app.workspace.getLeavesOfType(MODA_VIEW_TYPE)[0];
  if (leaf?.view instanceof ForgeModaView) {
    leaf.view.requestFeaturedRun();
  }
}
```

Call from `forgeSnippet`:
```typescript
if (routing.kind === 'moda') {
  await this.dispatchModaBranch(view);
  return;
}
```

### §3.2 — Phase 2: routingDeps helper

Extract the `routeActionCodeRegen` deps shape into a private method so the moda branch and the english-mode branch share it:

```typescript
private routingDeps(): RoutingDeps {
  return {
    resolveActionCode: async (id) => { /* ... */ },
    generate: async (id) => { /* ... */ },
    hasToken: !!this.settings.transpileServiceToken?.trim(),
  };
}
```

### §3.3 — Phase 3: tests

Integration tests via `createIntegrationHarness()` (per v0.2.112 + new v0.2.124 dispatch HARD RULE):

1. Moda branch with canonical English → `routeActionCodeRegen` succeeds → `# Python` updated → `openModaView` called.
2. Moda branch with English changed since last cache → `# Python` reflects new English content.
3. Moda branch with E-- failure + token absent → Notice fired, `openModaView` still called.
4. Regression guard: moda branch ON featured snippet still routes correctly per v0.2.124's `decideForgeRouting` semantics.

~4 new tests.

### §3.4 — Phase 4: pure-core decision check

Verify `decideForgeRouting` semantics still hold:
- `forge-moda/simulation.md` + `featured: true` → `moda` (unchanged)
- `forge-moda/leaf.md` without `featured` → `english-mode` (unchanged)

No changes to `forge-snippet-routing-core.ts`.

## §4 — Tests required

- 4 new integration tests (~30-60 LOC each)
- Plugin suite: 671 → ~675 passing
- Engine suite: untouched

## §5 — User-side smoke

```
# Step 1 — install v0.2.126.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.126

# Step 2 — open forge-moda/simulation.md in Obsidian.
# Edit the # English to print something distinctive, e.g.:
#   "Print 'Tamar Test 12345'."
# (Or substitute a different no-op change to English that affects compute.)

# Step 3 — Forge-click 🔥.
# Expected:
#   - Brief delay (~100-500ms) while E-- transpiles English → Python
#   - # Python facet visibly updates to reflect the new English
#   - moda simulation tab opens
#   - Simulation runs with the new Python

# Step 4 — verify via grep:
grep "Tamar Test 12345" ~/forge-vaults/<vault>/forge-moda/simulation.md
# Expected: matches in BOTH # English (where you wrote it) AND # Python
# (the transpiled output).

# Step 5 — DevTools console:
# No "Forge: ... re-transpile failed" Notice (unless your edit broke E--).
# Compute requests succeed; canvas renders particles per new logic.

# Step 6 — regression: simulation routing still works.
# Revert English change. Forge-click.
# Expected: simulation tab opens (still routes to moda).
```

## §6 — Open follow-ups

1. **Engine-side: enforce `english_hash` write on canonical snippet authoring.** Currently `writeCanonicalPythonBack` may or may not write `english_hash` (per v0.2.121 cache-validity contract). If it does — great, this v0.2.126 fix is structurally correct. If it doesn't — moda branch keeps re-transpiling every click even when English hasn't changed (suboptimal but not broken). Audit + tighten in a follow-up.
2. **`/generate` fallback UX**: if user has no token + edits English in a non-E-- way, simulation runs with stale Python. Notice surfaces the issue but UX is suboptimal. Future polish: a more prominent indicator + path to fix (add token).
3. **Carrying forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - v0.2.117 / v0.2.119 / v0.2.121 / v0.2.122 follow-ups
   - Harness extension build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 verifies semantics + call shape + ordering decision.
- ✓ §57–74 (TDD): 4 integration tests landed alongside the moda-branch refactor.
- ✓ §86–118 (pure-core convention): `decideForgeRouting` pure-core unchanged; `routeActionCodeRegen` already pure-core; the new `dispatchModaBranch` is integration layer.
- ✓ §76 (don't ship speculative fix): bug is explicitly reported by driver smoke (English doesn't propagate).
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.124; v0.2.125 may ship before this; reconcile + explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 (CM6 integration tests): N/A — this drain isn't CM6.
- ✓ NEW v0.2.120 (`console.error` HARD RULE): applies to any new catch blocks added; verify.
- ✓ NEW v0.2.124 (Pure-core dispatch extraction HARD RULE): N/A — extraction shipped in v0.2.124; this drain extends the moda branch's internal behavior.
- ✓ NEW v0.2.124 (Defensive metadataCache fallback HARD RULE): N/A — this drain uses snippetId, not metadataCache.

## §8 — Architectural framing

V1 cohort regression follow-through. Completes the moda branch's compute contract: pre-flight sync (v0.2.102) + routing (v0.2.124) + RE-TRANSPILE (v0.2.126) + iframe open (v0.2.92-97).

The architecture is now: every Forge-click path ensures `# Python` is fresh with `# English` BEFORE compute. Moda iframe inherits this guarantee via the regen-before-open ordering.

No V2 architectural commitments. The pattern carries forward to V2's `source: english | epython` migration — fresh Python before compute is a load-bearing V1 invariant.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Suggested order:
1. §2.1-§2.4 investigation (~15 min)
2. §3.1-§3.2 refactor + new behavior (~30 min)
3. §3.3 integration tests (~45-60 min)
4. §3.4 pure-core decision verify (~5 min)
5. Release v0.2.126

Estimated CC time: 1.5-2 hours.

If §2.3 ordering decision lands on (b) — open iframe first, regen async — surface in feedback with reasoning. Recommend (a) but CC may have data we don't.

If v0.2.125 hasn't shipped yet when this drain starts, the v0.2.125 fix to `readFrontmatterForRouting` is orthogonal — no conflict. Both can ship sequentially OR CC can bundle if convenient.
