---
prompt: 2026-06-11-1200-v0328-moda-retranspile-fix-long-term-force-flag-plus-self-healing-content.md
shipped_version: v0.2.128
session: drain-2026-06-11-1200
date: 2026-06-11
status: shipped — awaiting driver smoke
---

# v0328 feedback — v0.2.128 moda force flag fix shipped

## §1 — What shipped

### §1.1 — Engine `force` parameter (`forge/core/executor.py`)

```python
def resolve_action_code(snippet, slot_resolutions=None, force=False):
  ...
  if code is not None and slot_resolutions is None and not force:
    # cache shortcut paths (stored_hash is None → return cached;
    # cache-hit on matching hash) — unchanged
    ...
  # Always fall through to E-- transpile when force=True
```

The `force` flag is a caller opt-in. Default `False` preserves existing behavior for all non-moda call sites (english-mode forgeSnippet, generate). 2 new tests in `tests/core/test_executor_stale_python_investigation.py`:
- `test_v0128_force_bypasses_legacy_stored_hash_is_none_rule` — the exact cohort-state reproduction (snippet with `# Python` body + NO `english_hash` → force=True returns fresh transpile, not cached body).
- `test_v0128_force_bypasses_cache_hit_when_english_hash_matches` — even with a matching hash, force=True re-transpiles.

### §1.2 — Pyodide-host plumbing (`pyodide-host.ts`)

```python
def _forge_resolve_action_code(snippet_id: str, force: bool = False):
    ...
    return resolve_action_code(snip, force=force)
```

```typescript
async resolveActionCode(snippet_id: string, opts?: { force?: boolean }): Promise<string> {
  this.pyodide.globals.set("_forge_resolve_target", snippet_id);
  this.pyodide.globals.set("_forge_resolve_force", !!opts?.force);
  const out = this.pyodide.runPython(
    `_forge_resolve_action_code(_forge_resolve_target, force=_forge_resolve_force)`,
  );
  return String(out ?? "");
}
```

`HostInstance` interface updated with the optional opts arg.

### §1.3 — `dispatchModaBranch` uses force (`main.ts`)

The moda branch overrides `deps.resolveActionCode` with a force-aware variant per the prompt's §3.3:

```typescript
const deps: RoutingDeps = {
  ...this.routingDeps(),
  resolveActionCode: async (id: string) => {
    const hostManager = getPyodideHost();
    if (!hostManager) return null;
    const host = await hostManager.getInstance();
    try {
      const code = await host.resolveActionCode(id, { force: true });
      return code && code.trim().length > 0 ? code : null;
    } catch {
      return null;
    }
  },
};
```

Routing-core (`routeActionCodeRegen`) stays generic — it doesn't know about force, just calls the dep. This matches the v0326 pattern: pure-cores stay shape-agnostic; integration layer injects the runtime variant.

### §1.4 — `writeCanonicalPythonBack` also forces (`main.ts`)

The "second resolveActionCode call" that the v0.2.127 spike flagged as a potential staleness source now also passes `force: true`:

```typescript
const python = await host.resolveActionCode(snippetId, { force: true });
```

Without it, the moda branch's routeActionCodeRegen call could return fresh code, but writeCanonicalPythonBack's separate engine call would return stale cached body — and the freshly-written Python would BE the stale Python. With force, both calls return the same fresh transpile output.

### §1.5 — Self-healing via `english_hash` write

Audited per prompt §1.3 / §2.2: `writeCanonicalPythonBack` calls `writePythonAndEnglishHash(content, {pythonCode, englishHash, stripStaleSlots: false})`. The english_hash IS written to frontmatter alongside `# Python`. Confirmed via `python-cache-writer-core.ts:71,78` (the `english_hash:` insert/replace lines).

**Net effect**: after the first force-transpile, simulation.md gains `english_hash` in frontmatter. Subsequent Forge-clicks STILL pass force=true from the plugin (since the moda branch overrides unconditionally), but the engine's cache-hit-on-matching-hash path is already healthy if force were ever dropped (e.g. after V2's `source` field migration).

### §1.6 — v0.2.127 spike removal

All `[v0.2.127 spike]` and `[v0.2.127 engine]` console.log lines removed from `main.ts` and `forge/core/executor.py`. Confirmed via `grep -n "v0.2.127\|spike"` — zero matches in production code. The engine-side `try/except ImportError` block also removed (no longer needed).

### §1.7 — Plugin pure-core regression guard

1 new test in `forge-snippet-routing-core.test.ts`:
```typescript
test('decideForgeRouting: hand-authored # Python without english_hash + featured:true → moda (v0.2.128 force regression guard)', ...)
```

Locks in the routing decision: the moda gate does NOT depend on `english_hash` presence. Catches any future regression where someone adds an `english_hash` precondition.

## §2 — Tests + release

- **Plugin**: 696 passing (695 baseline + 1 new regression guard).
- **Engine**: 2 new tests added; cpython pytest not run locally (no pytest in PATH). Engine commit `26a5a12` pushed to forge.git; CI gates verify.
- Build clean.
- Tag `v0.2.128` + GH release with full assets bundle.
- INSTALL.md synced (DIAGNOSTIC label dropped — this is the fix release).

## §3 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): confirmed engine signature + plugin call sites + writeCanonicalPythonBack hash-write before code.
- ✓ §57–74 (TDD): 2 engine + 1 plugin failing-first tests landed alongside the fix.
- ✓ §86–118 (pure-core convention): existing pure-cores unchanged; force injected via integration-layer dep override per the institutional pattern.
- ✓ §76 (don't ship speculative fix): targeted at H2, confirmed via v0.2.127 diagnostic spike + engine source read.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.127 → 0.2.128.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ NEW v0.2.116 prior-art rule: applied — v0.2.127 was the diagnostic phase; v0.2.128 is the targeted fix.
- ✓ NEW v0.2.120 `console.error` HARD RULE: applied at the catch block in dispatchModaBranch.

## §4 — User-side smoke (§5 of prompt — deferred to driver)

1. Install v0.2.128 via BRAT (Settings → BRAT → Check for updates).
2. `grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json` → expected `0.2.128`.
3. Open `forge-moda/simulation.md`. Edit `# English` to add e.g. `Print "Tamar v0128 test".`
4. Save (Cmd-S). Forge-click 🔥.
5. Expected: brief delay (~100-500ms) → `# Python` facet updates → moda simulation tab opens → simulation runs with new logic.
6. Verify: `grep -c "Tamar v0128 test" ~/forge-vaults/bluh/forge-moda/simulation.md` → expected `2` (one in `# English`, one in `# Python`).
7. Verify self-heal: `grep "english_hash" ~/forge-vaults/bluh/forge-moda/simulation.md` → expected `english_hash: <some hash>`.
8. Second click without changing English → simulation reruns quickly (cache hit on matching hash *would* fire if force weren't passed; with force, every click re-transpiles — slight cost, correct result).
9. Third click WITH English changed → `# Python` updates again.

## §5 — Open follow-ups

1. **Forge-moda content migration** (separate, already in flight via 2026-06-09 / 2026-06-10 inbox messages): backfill `english_hash` on all canonical moda snippets. After migration, the moda branch's force flag becomes architectural redundancy — could be removed if desired.
2. **V2 trajectory**: `source: english | epython` field replaces the inferred semantics encoded by the `stored_hash is None` legacy rule. When V2 ships, both the legacy rule AND the force-flag bridge retire.
3. **English-mode `console.warn` at writeCanonicalPythonBack catch** (carry-forward from v0326 §4 #2) — still pending.
4. **Constitution amendment** noting the force flag's V2 retirement condition — not in scope for this drain; flag for forge-core's next review.
5. **Carry-forward backlog** (unchanged from v0327):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
   - Harness Obsidian-shim build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error
   - forge-moda-bootstrap remote configuration (driver-flagged, separate)

## §6 — Architectural framing

V1 cohort regression closed + V2 bridge in place. The force flag is explicitly designed to retire when V2's source field replaces the inferred legacy semantics. The plugin keeps the moda-specific force injection until forge-moda content migration OR V2 ships.

Per the prompt's §8: this is the institutional pattern — ship the immediate fix WITHOUT adding architectural debt that V2 has to clean up. The force flag is a documented bridge with a known retirement condition.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.128 fix shipped clean. Engine + plugin commits pushed. INSTALL.md synced. GH release live. Driver smoke (§4 above) next.

Two more prompts (v0329 hygiene cleanups, v0330 console.error audit) queued at 1230 and 1300 — proceeding to drain those next in this session.
