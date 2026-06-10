---
timestamp: 2026-06-10T13:00:00Z
session_id: drain-2026-06-10-1300
status: COMPLETED
shipped_version: 0.2.121
prompt_target_version: 0.2.121
---

# Feedback — v0.2.121 — facet_form removal (Option C plugin-side routing)

## §0 — Outcome summary

| Phase | Status |
|---|---|
| §2 investigation | ✅ Completed (no scope surprises) |
| §3.1 plugin routing wrapper | ✅ Shipped |
| §3.2 engine facet_form removal + test rewrites | ✅ Shipped |
| §3.3 plugin cleanup | ✅ Shipped |
| §3.4 tests + smoke | ✅ Shipped |

## §1 — Plugin-side routing wrapper

`src/route-action-code-regen-core.ts` — pure-core router with dependency-injected E-- + LLM surfaces:

```ts
export type RoutingSuccess = { ok: true; code: string; via: 'e--' | 'generate' };
export type RoutingFailure =
  | { ok: false; reason: 'no-token'; message: string }
  | { ok: false; reason: 'http-error'; message: string }
  | { ok: false; reason: 'engine-error'; message: string };

export async function routeActionCodeRegen(
  snippetId: string,
  deps: RoutingDeps,
): Promise<RoutingResult> { … }
```

Behavior:
1. Try `resolveActionCode` (E-- transpile via engine).
2. If returns null/empty string → fall back to `/generate` (LLM) if token is set.
3. If no token → surface `no-token` reason with a user-actionable message.
4. If E-- throws → surface `engine-error`.
5. If `/generate` throws → surface `http-error`.

8 pure-core tests cover: success-path, fallback-with-token, whitespace-only-result fallback, no-token failure, engine-throw failure, http-throw failure, short-circuit-on-E--success (verifies LLM not called), discriminated-union-shape.

## §2 — Plugin integration

`main.ts:forgeSnippet` English-mode branch:

- **Before** (v0.2.120-and-prior): `getFacetForm(fm) === 'canonical'` gate routed canonical snippets to E-- (via runSnippet + writeCanonicalPythonBack) and skipped /generate. Free-text snippets routed to `this.generate()` (LLM).
- **After** (v0.2.121): unified routing through `routeActionCodeRegen`. Tries E-- via `host.resolveActionCode`; on null/empty result, falls through to `this.generate()`. On E-- success, writes back via `writeCanonicalPythonBack`. `runSnippet` runs the result.

Both paths now go through one decision point. The Notice on `routing.ok === false` surfaces the reason (no-token / engine-error / http-error) with clear next-step messaging.

## §3 — Engine changes (forge/forge/core/executor.py)

### §3.1 `resolve_action_code` rewrite

- **No facet_form read.** Field is inert engine-side.
- **Cache-hit path** (when `# Python` present + `slot_resolutions is None`):
  - `edit_mode == 'python'` → return cached code (user-authored Python override).
  - `edit_mode == 'english'`:
    - `english_hash` ABSENT → return cached code (no invalidation contract; preserves legacy behavior for hand-authored `# Python` without an english_hash field).
    - `english_hash` PRESENT and matches → return cached code (cache hit per B7.3).
    - `english_hash` PRESENT and DOESN'T match → fall through to re-transpile.
- **Cache-miss path** (no `# Python` OR english_hash mismatch OR slot_resolutions provided):
  - Always attempts E-- transpile (no facet_form gate).
  - On `EmmSyntaxError` → returns None. Plugin's `routeActionCodeRegen` catches None and falls back to `/generate`.
  - On missing `# English` → returns None (plugin handles).
- **SlotCacheMissError** still raised on first-pass slot misses per B7.3 (unchanged).

### §3.2 `detect_facet_form_strip_trap` deleted

The v0.2.81 strip-trap warning defended against Obsidian dropping `facet_form: canonical` from frontmatter on save. With facet_form retired, the trap no longer exists — engine never reads facet_form so it can't be silently dropped. Helper + tests deleted.

### §3.3 Engine bundle synced

Via `npm run sync-engine-bundle`. The plugin's bundled `assets/engine/forge/core/executor.py` now matches the v0.2.121 engine source. v0.2.98 inlined-asset version stamping auto-handles BRAT update propagation.

## §4 — Plugin cleanup

- `pyodide-host.ts`: deleted `_forge_facet_form_warning_set` + the v0.2.81 strip-trap emit block (`detect_facet_form_strip_trap` import + console.warn).
- `main.ts`: removed `getFacetForm` import; replaced canonical-vs-LLM branching with `routeActionCodeRegen` call.
- `modal-templates-core.ts:canonicalActionTemplate`: stopped emitting `facet_form: canonical` in new-snippet frontmatter.
- `modal.test.ts`: updated test name + assertion ("declares facet_form" → "does NOT declare facet_form").

`facet-form-core.ts` retained (exports `getFacetForm` + the FacetForm type) but no longer imported by main.ts. Could be deleted in a future cleanup drain if no external consumers remain.

## §5 — Tests

- **Before**: 642 passing.
- **After**: 650 passing (+8 routing tests).
- 8 strip-trap tests deleted (engine-side `test_facet_form_strip_trap.py`).
- 4 engine integration tests rewritten in `test_e_minus_minus_integration.py` to drop facet_form gates and add None-return contract checks.

## §6 — Cross-cutting verification

- Build clean (`npm run build` exit 0).
- Tests 650 passing.
- Engine bundle synced.
- Asset version stamping handles BRAT update propagation.

## §7 — User-side smoke checklist

```
# Step 1 — install v0.2.121.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.121

# Step 2 — open hello_world.md (canonical snippet). Forge-click.
# Expected: still computes correctly via E-- transpile (no token needed).

# Step 3 — manually strip facet_form: canonical from frontmatter.
# Open DevTools. Forge-click again.
# Expected: still computes (field is inert engine-side).
# NO "facet_form is absent" console warning — v0.2.81 strip-trap is gone.

# Step 4 — Cmd-P → "Forge: New Snippet". Create a snippet.
# Open the file. Verify frontmatter:
grep "facet_form" <new-snippet-path>.md
# Expected: no output (template stopped emitting the field).

# Step 5 — open a slot-bearing snippet (chapter 9 octopus_fact).
# Forge-click. Verify /resolve-slot path still works (unchanged).

# Step 6 — edit hello_world.md's English. Forge-click.
# Expected: E-- re-transpile succeeds; new Python written to # Python facet.

# Step 7 — create a snippet with free-text English (not E-- compatible).
# Forge-click.
# Expected:
#   - With token: /generate fallback runs; Python returned + written.
#   - Without token: clear Notice "this snippet needs free-text Python
#     generation but no transpile token is set." (Or write English in
#     E-- form for deterministic compile.)
```

## §8 — Open follow-ups

1. **v0.2.99 follow-up #14**: migrate existing snippets with `facet_form` field on disk. Field is inert; cleanup on next forge-tutorial / forge-moda / forge-music bump. Optional.
2. **forge-doc chapter 9 facet_form discipline note**: obsolete; send relay message to forge-doc on next coordination.
3. **`facet-form-core.ts` retired**: module still exports `getFacetForm` + `FacetForm` type but has no in-plugin consumers. Future cleanup drain can delete.
4. Carrying forward (unchanged):
   - Plugin-side path-lookup audit (v0.2.104).
   - moda bridge pytest (v0.2.95).
   - release.sh drift preflight + asset-completeness check (v0.2.91).
   - v0.2.19 generate-internal pre-flight sync dead code (v0.2.102).
   - v0.2.117 Reading mode `forge-snippet-preview` class wiring.
   - v0.2.119 persistent expanded-state across file switches.
   - Harness Obsidian-shim build (deferred indefinitely per v0.2.116 retrospective).

## §9 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1.1 of prompt audited via §2 in this drain; cross-cutting changes scoped before implementation.
- ✓ §57–74 (TDD): 8 routing tests landed failing-first; engine test rewrites preserve test scenarios.
- ✓ §86–118 (pure-core convention): `routeActionCodeRegen` is pure-core (dependency-injected); engine cache-validity logic stays pure.
- ✓ §76 (don't ship speculative fix): scoped per v0.2.121 prompt §1.1.
- ✓ §347 (version-bump sanity check): manifest 0.2.120 → 0.2.121.
- ✓ §321 (feedback file before move): this file written before prompt move.
- ✓ NEW v0.2.112 (CM6 integration tests): N/A — no CM6 changes.
- ✓ NEW v0.2.116 pattern (CSS class gating): N/A — no rendering changes.
- ✓ NEW v0.2.120 amendment (Python-bridge return-shape grep): engine bundle was synced + cross-repo call sites checked (engine + plugin pyodide-host both updated for the executor.py change; no other consumers of `detect_facet_form_strip_trap`).

## §10 — Architectural framing

V1 cleanup completion. facet_form was V2-prep that's no longer needed (V2 retires `edit_mode` for `source`). Removing it now simplifies the V1 → V2 surface.

The routing wrapper carries forward to V2: plugin-side routing decisions survive the source-field migration. The engine's deterministic E-- attempt is a stable contract.

No V2 architectural commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.
