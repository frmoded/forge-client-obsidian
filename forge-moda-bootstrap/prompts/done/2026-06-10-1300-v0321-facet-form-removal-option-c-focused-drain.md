---
timestamp: 2026-06-10T13:00:00Z
session_id: drain-2026-06-10-1300
status: pending
priority: MEDIUM — completes v0.2.120 deferred Item A
---

# v0.2.121 — facet_form removal (Option C) — focused drain

## §0 — Context

v0.2.120 shipped constitution amendments (Item B) + chip empty-line polish (Item C). Item A (facet_form removal) was deferred per prompt §9 fallback: plugin's `resolveActionCode` exists but only forwards to engine; no JS-side error handling, no E-- → /generate fallback path. Building the routing wrapper is focused work that needs its own drain.

v0.2.120 §1.1 enumerates everything needed. This drain executes that.

User authorized Option C originally at 2026-06-10 ("[2] C"). Re-authorization not needed — execution authorized + scope surfaced.

## §1 — Goal

Plugin-side `resolveActionCode` routing wrapper replaces the engine's facet_form-gated transpile decision. Engine no longer reads or writes facet_form. v0.2.81 strip-trap warning retires.

Concretely:

**Plugin side:**
1. JS-side wrapper around `resolveActionCode(snippetId)`:
   - Calls engine's `_forge_resolve_action_code` Python global
   - Catches errors / empty returns
   - Returns `{ ok: true, code }` or `{ ok: false, reason }`
2. Routing decision in `forgeSnippet`'s English-edit-mode branch:
   - Try E-- transpile first via `resolveActionCode`
   - If `ok: false`: fall back to `/generate` LLM call (requires token; surface clear error if no token)
   - Replaces the current `getFacetForm` / `facet_form: canonical` gate
3. Plugin cleanup:
   - Remove `_forge_facet_form_warning_set` + `console.warn` in `pyodide-host.ts`
   - Remove `getFacetForm` import + usage in `main.ts`
   - Remove `facet_form: canonical` from new-snippet template
4. Audit `src/**/*.ts` for remaining facet_form references; clean.

**Engine side:**
1. Strip facet_form from `forge/forge/core/executor.py`:
   - Drop write of `facet_form: canonical` in cache-write paths
   - Cache validity reduces to `english_hash` match alone
   - Transpile-trigger reduces to: try E-- always; routing happens plugin-side
2. Delete `detect_facet_form_strip_trap` helper (added v0.2.81)
3. Delete `forge/tests/core/test_facet_form_strip_trap.py` (8 tests)
4. Rewrite `forge/tests/core/test_e_minus_minus_integration.py` — 6 tests currently gate on facet_form values; rewrite without the gate

**Existing snippets with `facet_form: canonical` on disk:**
- Leave the field; it becomes inert
- Engine ignores; plugin ignores
- Optional later: migration to strip the field on next forge-tutorial / forge-moda / forge-music bump (v0.2.99 follow-up #14)

## §2 — Investigation phase (per §78)

### §2.1 — Verify resolveActionCode engine surface

```bash
grep -n "_forge_resolve_action_code\|resolveActionCode" forge/ forge-client-obsidian/src/
```

Confirm:
- Engine exposes `_forge_resolve_action_code(snippet_id)` Python global
- Plugin's `resolveActionCode` at `pyodide-host.ts:1221-1227` correctly forwards
- Return shape from engine matches what the new wrapper expects

### §2.2 — Confirm /generate fallback path is in place

```bash
grep -n "_forge_generate\|forge-transpile.com\|/generate" forge-client-obsidian/src/
```

Verify:
- `/generate` endpoint call mechanism exists (presumably via `requestUrl` to the hosted transpile service)
- Token-presence check exists (`transpileServiceToken` in settings)
- Error path when token absent surfaces a clear user message

### §2.3 — Engine cache-validity audit

Read `forge/forge/core/executor.py`'s `resolve_action_code` function. Document:
- Current cache-validity logic (where facet_form is checked)
- Current transpile-trigger logic (where facet_form gates E-- vs /generate)
- Each line that needs to be removed or modified

### §2.4 — Engine test rewrites

Read `forge/tests/core/test_e_minus_minus_integration.py`. The 6 facet_form-gated tests need:
- Either: tests stay; assertions updated to drop facet_form checks
- Or: tests rewritten to focus on E-- transpile output without the facet_form gate semantic

Recommend the first (preserve test intent; drop the gate assertion).

### §2.5 — Cross-cutting

Verify the plugin-side wrapper doesn't accidentally break:
- The slot-bearing canonical snippet path (chapter 9 octopus_fact — uses E-- transpile + /resolve-slot, not /generate)
- The Python-edit-mode path (user authored Python directly; should bypass routing entirely)
- The moda/music branches (already gated separately via path-prefix + `featured: true` per v0.2.106)

## §3 — Implementation phases

### §3.1 — Phase 1: plugin-side routing wrapper

`src/pyodide-host.ts` or `src/action-code-routing.ts` (new module — separate concern from pyodide-host's general engine bridge):

```typescript
export interface RoutingResult {
  ok: true; code: string;
} | {
  ok: false; reason: 'e--' | 'no-token' | 'http-error'; message: string;
}

export async function routeActionCodeRegen(
  snippetId: string,
  hasToken: boolean,
  resolveActionCode: (id: string) => Promise<string | null>,
  generate: (id: string) => Promise<string>,
): Promise<RoutingResult> {
  try {
    const result = await resolveActionCode(snippetId);
    if (result) return { ok: true, code: result };
  } catch (e) {
    // E-- failure → fall through to /generate
  }
  if (!hasToken) {
    return { ok: false, reason: 'no-token', message: 'No transpile token; add one in settings.' };
  }
  try {
    const code = await generate(snippetId);
    return { ok: true, code };
  } catch (e) {
    return { ok: false, reason: 'http-error', message: String(e) };
  }
}
```

Wire into `forgeSnippet`:
- Replace the current `getFacetForm` check + `facet_form: canonical` gate
- Call `routeActionCodeRegen` with the snippet id + token state + the existing wrappers
- On `ok: false`: show Notice with the reason message
- On `ok: true`: write code via `writeGeneratedCode` (per v0.2.104 path-lookup convention)

### §3.2 — Phase 2: engine facet_form removal

`forge/forge/core/executor.py`:
- Remove facet_form write
- Cache validity: english_hash match alone
- Transpile trigger: always try E--; routing is plugin-side

Delete `detect_facet_form_strip_trap` helper.

Delete `forge/tests/core/test_facet_form_strip_trap.py`.

Rewrite `forge/tests/core/test_e_minus_minus_integration.py`'s 6 tests:
- Preserve test scenarios
- Drop facet_form assertions
- Add assertions on the new cache-validity contract (english_hash matching alone)

### §3.3 — Phase 3: plugin cleanup

- Remove `_forge_facet_form_warning_set` + `console.warn` in `pyodide-host.ts`
- Remove `getFacetForm` import + usage in `main.ts`
- Remove `facet_form: canonical` from new-snippet template
- Audit `src/**/*.ts` for remaining facet_form references; clean

### §3.4 — Phase 4: tests

Plugin:
- 1-2 new tests for `routeActionCodeRegen` covering: E-- success path, E-- failure → /generate fallback, no-token error, http-error propagation
- Regression: existing chip + mutex + frontmatter tests still pass

Engine:
- Rewritten `test_e_minus_minus_integration.py` (6 tests)
- Delete `test_facet_form_strip_trap.py` (8 tests deleted)

## §4 — Tests required summary

- Plugin: +1-2 routing tests
- Engine: +0 (rewrites + deletion)
- Net: delete 8 + add 2 = ~ -6 tests

## §5 — User-side smoke

```
# Step 1 — install v0.2.121.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json

# Step 2 — open hello_world.md. Forge-click.
# Expected: still computes correctly via E-- transpile (no token needed).

# Step 3 — manually strip facet_form: canonical from frontmatter.
# Open DevTools. Forge-click again.
# Expected: still computes. NO "facet_form is absent" console warning
# (v0.2.81 strip-trap is gone).

# Step 4 — Cmd-P → "Forge: New Snippet". Create a new snippet.
# Open the file. Verify frontmatter:
grep "facet_form" ~/forge-vaults/bluh/<new-snippet-path>.md
# Expected: no output.

# Step 5 — open a slot-bearing snippet (chapter 9 octopus_fact).
# Forge-click. Verify /resolve-slot path still works.

# Step 6 — edit hello_world.md's English. Forge-click.
# Expected: E-- re-transpile succeeds; new Python cached.

# Step 7 — create a snippet with free-text English (not E-- compatible).
# Forge-click.
# Expected:
#   - With token: /generate fallback runs; Python returned
#   - Without token: clear Notice "No transpile token; add one in settings."
```

## §6 — Open follow-ups

1. **v0.2.99 follow-up #14**: migrate existing snippets with `facet_form` field on next forge-tutorial / forge-moda / forge-music bump. Optional cleanup; the field is inert.
2. **forge-doc chapter 9 facet_form discipline note**: obsolete after this drain ships. Send relay message.
3. Carrying forward (unchanged):
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - release.sh drift preflight (v0.2.91)
   - v0.2.117 Reading mode `forge-snippet-preview` class wiring
   - v0.2.119 persistent expanded-state across file switches

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 audits resolveActionCode + /generate fallback + engine cache-validity logic + test rewrite scope.
- ✓ §57–74 (TDD): plugin routing tests are failing-first; engine test rewrites preserve test intent.
- ✓ §86–118 (pure-core convention): `routeActionCodeRegen` is pure-core; wiring into forgeSnippet is integration layer.
- ✓ §76 (don't ship speculative fix): scoped per v0.2.120 §1.1 audit.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.120; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 (CM6 integration tests): N/A — no CM6 changes.

## §8 — Architectural framing

V1 cleanup completion. facet_form was V2-prep that's no longer needed (V2 retires `edit_mode` for `source`). Removing it now simplifies the V1 → V2 surface.

No V2 architectural commitments. The routing wrapper carries forward to V2 (plugin-side routing decisions survive the source-field migration).

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Suggested order:
1. §2 investigation (~30 min)
2. §3.1 Phase 1 plugin routing wrapper (~1 hr)
3. §3.2 Phase 2 engine facet_form removal + test rewrites (~1.5 hr)
4. §3.3 Phase 3 plugin cleanup (~30 min)
5. §3.4 Phase 4 tests + smoke (~30 min)

Total estimated: 3-4 hours per v0.2.120 §1.2 estimate. Ships as v0.2.121.

If §2.2 reveals /generate fallback infrastructure is incomplete (e.g., token-presence check doesn't exist; error path doesn't surface to user), surface scope and discuss before proceeding.
