---
timestamp: 2026-06-10T17:00:00Z
session_id: drain-2026-06-10-1700
status: pending
priority: HIGH — simulation regression blocks moda authoring; affects cohort UX
---

# v0.2.123 — Simulation regression: TDD-first investigation + fix

## §0 — Bug report + context

Driver smoke against v0.2.122 (latest):

> "When forging the MoDa Simulation, again the simulation does not work."

Diagnostic from DevTools console:
```
Forge debug: run_snippet('simulation') body=1705ch code=627ch preview='def compute(context): | state = context.compute("setup") | ...'
```

This shows `run_snippet('simulation')` is being called on `forge-moda/simulation.md`. That code path means **the moda branch in `forgeSnippet` did NOT fire** — `simulation.md` fell through to the regular run-snippet path instead of being routed to the moda iframe view.

The expected behavior (per v0.2.92-v0.2.106 arc): Forge-click on a `forge-moda/` snippet with `featured: true` opens the moda simulation tab AND dispatches `featured-run` to the iframe. Local `runSnippet` is SKIPPED. The iframe owns compute via its own engine-request route.

The user confirmed via `grep`:
```
type: action
featured: true
```

are both present in `~/forge-vaults/bluh/forge-moda/simulation.md` frontmatter.

So `isModaFeaturedSnippet(view.file)` (at `main.ts:1540-1544`) is returning `false` despite `featured: true` being on disk.

```typescript
private isModaFeaturedSnippet(file: TFile): boolean {
  if (!file.path.startsWith('forge-moda/')) return false;
  const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
  return fm?.featured === true;
}
```

Three failure-mode candidates:
1. `file.path` doesn't actually start with `forge-moda/` at runtime (Obsidian path normalization?)
2. `metadataCache.getFileCache(file)?.frontmatter` returns `null` or stale data
3. `fm?.featured !== true` at runtime — boolean vs string vs undefined

This drain applies TDD discipline: write the test that detects the regression, then fix. The driver's brainstorm landed on pure-core extraction of routing decisions as the institutional pattern to adopt.

## §1 — Goals

### §1.1 — Diagnose the regression's actual cause

Either:
- (a) The routing-decision logic is broken (code change in v0.2.121 or v0.2.122 affected `isModaFeaturedSnippet` semantics) → pure-core test fails, fix per failing test
- (b) Runtime issue — metadataCache stale/null, YAML parsing edge case, timing race — pure-core test passes; needs integration test or diagnostic spike

### §1.2 — Ship preventive coverage

Regardless of cause, extract pure-core `decideForgeRouting(filePath, frontmatter)` per the driver's brainstorm. This catches future code-shape regressions to the routing branch.

### §1.3 — Ship the fix

Whatever the cause turns out to be. v0.2.123 release.

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Extract pure-core `decideForgeRouting`

New module `src/forge-snippet-routing-core.ts`:

```typescript
export type ForgeRouting =
  | { kind: 'moda' }
  | { kind: 'python-mode' }
  | { kind: 'english-mode' };

export function decideForgeRouting(
  filePath: string,
  frontmatter: Record<string, unknown> | null | undefined,
): ForgeRouting {
  if (
    filePath.startsWith('forge-moda/') &&
    frontmatter &&
    frontmatter.featured === true
  ) {
    return { kind: 'moda' };
  }
  if (frontmatter?.edit_mode === 'python') {
    return { kind: 'python-mode' };
  }
  return { kind: 'english-mode' };
}
```

Refactor `main.ts:forgeSnippet` to USE this pure-core function instead of the inline if-checks. The moda branch becomes:
```typescript
const routing = decideForgeRouting(view.file.path, fm);
if (routing.kind === 'moda') {
  await this.openModaView();
  // ... existing moda dispatch ...
  return;
}
```

The python-mode and english-mode branches similarly dispatch via the routing kind.

### §2.2 — Write failing-first tests for `decideForgeRouting`

In `src/forge-snippet-routing-core.test.ts`:

```typescript
test('forge-moda/simulation.md with featured:true → moda', () => {
  expect(decideForgeRouting('forge-moda/simulation.md', { type: 'action', featured: true }).kind).toBe('moda');
});

test('forge-moda/leaf.md without featured → english-mode', () => {
  expect(decideForgeRouting('forge-moda/leaf.md', { type: 'action' }).kind).toBe('english-mode');
});

test('forge-tutorial/01-hello/hello_world.md → english-mode', () => {
  expect(decideForgeRouting('forge-tutorial/01-hello/hello_world.md', { type: 'action' }).kind).toBe('english-mode');
});

test('python edit_mode → python-mode regardless of path', () => {
  expect(decideForgeRouting('forge-moda/simulation.md', { featured: true, edit_mode: 'python' }).kind).toBe('python-mode');
});

test('featured as string "true" does NOT match (boolean strictness)', () => {
  expect(decideForgeRouting('forge-moda/simulation.md', { featured: 'true' }).kind).toBe('english-mode');
});

test('null frontmatter → english-mode', () => {
  expect(decideForgeRouting('forge-moda/simulation.md', null).kind).toBe('english-mode');
});

test('undefined frontmatter → english-mode', () => {
  expect(decideForgeRouting('forge-moda/simulation.md', undefined).kind).toBe('english-mode');
});

test('featured: true at path NOT starting with forge-moda/ → english-mode', () => {
  expect(decideForgeRouting('notes/foo.md', { featured: true }).kind).toBe('english-mode');
});
```

8 tests covering the routing matrix. Verify they ALL PASS after the §2.1 extraction.

**If any test FAILS**: the inline routing logic differs from `decideForgeRouting`'s spec — that's the regression. Fix the original logic to match.

**If all tests PASS**: pure logic is correct → bug is in the runtime path. Continue to §2.3.

### §2.3 — Integration test for the runtime path (if §2.2 all passes)

Build a minimal mock harness for `forgeSnippet`'s integration. Mocks:
- `app.workspace.getActiveViewOfType(MarkdownView)` → returns mock view with `file` property
- `app.metadataCache.getFileCache(file)?.frontmatter` → returns simulation.md frontmatter
- `app.workspace.getLeavesOfType(MODA_VIEW_TYPE)` → returns mock leaf with mock ForgeModaView
- Stub `runSnippet` and `routeActionCodeRegen` to track invocations

Test:
```typescript
test('Forge-click on forge-moda/simulation.md routes to moda branch', async () => {
  const mockApp = createMockApp({
    activeFile: 'forge-moda/simulation.md',
    frontmatter: { type: 'action', featured: true },
  });
  const plugin = new ForgePlugin(mockApp);
  await plugin.forgeSnippet();
  expect(mockApp.openModaViewCalled).toBe(true);
  expect(mockApp.requestFeaturedRunCalled).toBe(true);
  expect(mockApp.runSnippetCalled).toBe(false);  // critical
});
```

**If this test passes**: the code path correctly routes simulation.md to the moda branch in a mocked environment. So the actual cohort failure is in Obsidian's real-runtime metadataCache behavior (timing race, YAML parsing, etc.).

**If this test FAILS**: there's a code-shape issue between the mock and the real run. Investigate why.

### §2.4 — Diagnostic spike (if §2.3 passes too)

If both pure-core AND integration tests pass, the bug is in real Obsidian runtime. Ship a diagnostic build:

```typescript
private isModaFeaturedSnippet(file: TFile): boolean {
  // v0.2.123 SPIKE — REMOVE AFTER INVESTIGATION
  console.log('[v0.2.123-spike] isModaFeaturedSnippet check:', {
    filePath: file.path,
    startsWithModa: file.path.startsWith('forge-moda/'),
  });
  if (!file.path.startsWith('forge-moda/')) return false;
  const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
  console.log('[v0.2.123-spike] frontmatter:', {
    hasCache: !!fm,
    keys: fm ? Object.keys(fm) : null,
    featured: fm?.featured,
    featuredType: typeof fm?.featured,
    featuredStrictEqualTrue: fm?.featured === true,
  });
  return fm?.featured === true;
}
```

Ship as v0.2.123-spike. Driver runs, pastes console output. CC ships fix per evidence in v0.2.123 final.

### §2.5 — Cross-check recent changes

Audit v0.2.121 + v0.2.122 commits for any change that might affect:
- metadataCache initialization timing
- YAML parsing (unlikely; Obsidian owns this)
- Frontmatter field handling
- Plugin onload ordering

The v0.2.121 facet_form removal restructured `forgeSnippet`'s English-mode branch but left the moda branch at line 1715 intact (verified by code reading). v0.2.122 added a markdown post-processor + CM6 line-decoration plugin — neither touches `forgeSnippet` or `isModaFeaturedSnippet`.

Document findings in feedback.

## §3 — Implementation phases

### §3.1 — Phase 1: pure-core extraction

Implement `decideForgeRouting` per §2.1. Refactor `forgeSnippet` to use it. Verify behavior is preserved by manual code reading.

### §3.2 — Phase 2: 8 pure-core tests

Per §2.2. Failing-first applied: write tests, run, verify they pass (regression isn't in pure logic) OR observe failures (regression IS in pure logic; document which tests fail).

### §3.3 — Phase 3: branch per §2.2 outcome

**Branch A: pure-core tests fail.** Fix the original routing logic to match `decideForgeRouting`'s spec. Re-run tests until green. Done; ship v0.2.123.

**Branch B: pure-core tests pass.** Continue to §3.4 integration test.

### §3.4 — Phase 4: integration test (if Branch B)

Build mock harness per §2.3. Add the simulation-routes-to-moda test. Run.

**If test fails**: fix the code-shape gap. Ship v0.2.123.

**If test passes**: continue to §3.5 diagnostic spike.

### §3.5 — Phase 5: diagnostic spike (if §3.4 passes)

Add logging per §2.4. Ship v0.2.123-spike. Driver runs + pastes output. CC analyzes + ships fix in v0.2.123 final.

## §4 — Tests required

- Pure-core: 8 tests for `decideForgeRouting` (per §2.2)
- Integration (if needed): 1-3 tests for forgeSnippet branching (per §2.3)
- Diagnostic logging (if needed): no new tests; observation-only
- Regression guard: 1-2 tests once root cause is known

Total: 8-12 new tests. Plugin suite: 663 → ~671-675 passing.

## §5 — User-side smoke

```
# Step 1 — install v0.2.123.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.123

# Step 2 — open forge-moda/simulation.md.
# Forge-click 🔥.
# Expected: moda simulation tab opens; simulation runs (canvas renders particles).
# NOT expected: Forge Output pane with raw run_snippet output.

# Step 3 — verify via DevTools console:
# Filter on "moda" or "simulation".
# Expected: moda-related console lines (e.g. iframe-ready, featured-snippet).
# NOT expected: "Forge debug: run_snippet('simulation')" — that's the
# regression's signature.

# Step 4 — open forge-moda/setup.md (leaf snippet, no featured).
# Forge-click.
# Expected: regular run-snippet path — Forge Output pane shows result.
# NOT moda tab open.
# (This verifies the v0.2.106 isModaFeaturedSnippet narrowing still holds.)

# Step 5 — open forge-tutorial/01-hello/hello_world.md (canonical snippet).
# Forge-click.
# Expected: Forge Output pane shows "hello, world".
# (Regression guard for the English-mode branch.)

# Step 6 — open a snippet with edit_mode: python.
# Forge-click.
# Expected: Python-mode notice; runs as-is without LLM call.
# (Regression guard for python-mode branch.)
```

## §6 — Open follow-ups

1. **Smoke harness extension for moda iframe** (v0.2.95 carry): the v0.2.123 mock harness (if built per §3.4) could grow into the deferred moda bridge pytest. Worth folding the work.
2. **Integration test pattern** for forgeSnippet branching: once Phase 4 lands, the pattern carries forward — every future routing change adds a test.
3. **Carrying forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95) — may fold into this drain's harness
   - v0.2.117 Reading mode wiring (obsolete per v0.2.122 §6 #2)
   - v0.2.119 persistent expanded-state
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
4. **Forge-tutorial _meta/_chips.md v3 parse error** (driver's diagnostic console showed): independent bug, worth its own drain.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 enumerates the investigation phases.
- ✓ §57–74 (TDD): pure-core failing-first tests landed before fix attempt.
- ✓ §86–118 (pure-core convention): `decideForgeRouting` is pure-core; routing dispatch is integration layer.
- ✓ §76 (don't ship speculative fix): each phase gates on test evidence; no speculation.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.122; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 (CM6 integration tests): N/A — this drain isn't CM6.
- ✓ NEW v0.2.120 amendment (bridge return-shape grep): N/A — no bridge changes.
- ✓ NEW v0.2.116 PROCESS (prior-art search): N/A — regression investigation, not new feature.
- ✓ INSTITUTIONAL HARD RULE codification candidate: extract routing decisions as pure-core BEFORE adding new branches. This drain establishes the pattern; future routing changes inherit.

## §8 — Architectural framing

V1 cohort regression fix + pure-core extraction. The extraction is V2-aligned — V2's source-field migration will likely restructure routing again, and `decideForgeRouting` provides a cleaner extension surface than inline if-checks.

No V2 architectural commitments. The extraction is preventive infrastructure.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order (matching the phase branches in §3):

1. §3.1 + §3.2 — extract pure-core + write 8 tests. 30-60 min.
2. Branch per outcome:
   - If §2.2 tests FAIL: fix per failing test → §5 smoke. ~30 min more. Ship v0.2.123.
   - If §2.2 tests PASS: §3.4 integration test (~1-2 hr). 
     - If integration test fails: fix code-shape gap. Ship v0.2.123.
     - If integration test passes: §3.5 diagnostic spike. Ship v0.2.123-spike. Driver runs + pastes. CC ships fix per evidence in v0.2.123 final.

Estimated CC time: 1-2 hours if branch A; 3-5 hours if branch B; 4-6 hours + driver round-trip if branch C diagnostic spike.

The drain ships v0.2.123 regardless of branch — the pure-core extraction + tests is preventive coverage that ships even if the immediate regression turns out to be runtime.
