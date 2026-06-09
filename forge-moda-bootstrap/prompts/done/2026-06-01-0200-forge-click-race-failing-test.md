# Failing-test-only — forge-click race (no fix; pre-flight contract)

## Why this prompt exists

v0.2.18 smoke surfaced a race the suite can't catch:

- §3.2 (autosave wait ~2s, then Forge-click) PASSES — `vault.on('modify')` hook completed before Forge-click.
- §3.3 (Cmd-S, then Forge-click within ~100ms) FAILS — hook fired but its async handler is still completing when forgeSnippet calls `/generate`. Inventory uses stale english.

The v0.2.18 fix shape — async hook — is insufficient against fast Forge-clicks. The architectural fix: **forgeSnippet must do its own synchronous pre-flight sync before calling `/generate`**, not rely on the async hook's timing.

The previous test suite (109/109 green) didn't catch this because suite-time tests can't reproduce the Obsidian event-loop race. `node --test` is synchronous; v0.2.18 case (d) chains `_forge_sync_user_file` → `_forge_get_generate_inventory` synchronously, verifies the helpers are correct, but never tests the production sequencing where the sync is async-deferred.

This prompt's scope: **add a failing test that captures the new contract** (synchronous pre-flight sync exists and is callable). DO NOT add the fix. User runs the test locally, sees it fail, approves the follow-up fix prompt.

## Why our tests aren't aggressive enough

This is worth understanding before the test design lands. Suite tests verify HELPER CORRECTNESS — given synchronous calls, do they produce the right outputs? They CANNOT verify PRODUCTION TIMING — does forgeSnippet call the helper at the right point in its async flow?

Two ways to close that gap:

a. **Integration tests against a real Obsidian instance** — Playwright + Electron + actual event-loop reproduction. Heavy infrastructure; v1.1+ work.

b. **Architectural design that doesn't rely on async timing** — make every timing-sensitive operation synchronous in its caller's flow. This is what the v0.2.19 fix will be: instead of "the async hook will eventually sync before the next Forge-click," it's "every Forge-click synchronously syncs first."

Option (b) is what we pursue. The new test asserts the CONTRACT (synchronous pre-flight helper exists with the right semantics) — that's reachable from node --test. The production WIRING (forgeSnippet actually calls it before /generate) is verified by manual smoke + a code-review check.

## 1. Failing test to add

`src/forge-click-race.test.ts` (new file). Pyodide-in-Node, same infrastructure pattern as `inventory-staleness.test.ts` and `memfs-staleness.test.ts`.

### 1.1 The hypothetical helper this test calls

`_forge_preflight_then_inventory(snippet_id)`: a NEW Python helper that the fix will add. Reads the snippet file fresh from MEMFS, refreshes the registry, returns the inventory. Atomic from the JS caller's perspective.

The helper doesn't exist yet. The test calls it; the call raises `NameError` today. After the fix lands, the call succeeds.

### 1.2 Test cases

| Case | Asserts |
| --- | --- |
| `forge-click-race: preflight helper exists` | `'_forge_preflight_then_inventory' in dir()` returns True. **Fails today** — helper doesn't exist. |
| `forge-click-race: preflight returns fresh english after disk-write-without-hook` | Mount Greet.md (OLD english). Direct `py.FS.writeFile(NEW_BODY)` to simulate "Obsidian wrote to disk but modify hook hasn't fired yet." Call `_forge_preflight_then_inventory("Greet")`. assert english matches NEW_BODY. **Fails today** — helper doesn't exist. |
| `forge-click-race: preflight is idempotent across repeated calls` | Call helper twice in succession with the same disk state. Both calls return the same fresh inventory. assert no error, no stale cache leak. **Fails today** — helper doesn't exist. |
| `forge-click-race: preflight handles unknown snippet_id` | Call helper with snippet_id that's NOT in the registry. assert it raises `SnippetResolutionError` cleanly (same behavior as `_forge_resolver.resolve` for unknown ids). **Fails today** — helper doesn't exist. |

Test (b) is the load-bearing reproduction. Test (a) is the existence check. (c) and (d) are defensive contract assertions.

### 1.3 Reference: what `_forge_preflight_then_inventory` should do

For the test to be meaningful, comment in the test file what the helper SHOULD do once added (CC will read this when writing the fix):

```python
# Expected implementation (to be added in a follow-up prompt):
# def _forge_preflight_then_inventory(snippet_id: str):
#     """v0.2.19: sync any current MEMFS file content for this snippet
#     into the registry before returning the inventory. Closes the race
#     between async vault.on('modify') and synchronous /generate. Called
#     from JS-side forgeSnippet's pre-/generate path."""
#     # 1. Find the snippet's vault-relative path. For V1 single-vault,
#     #    snippet basename + ".md" under authoring root.
#     # 2. Read fresh content from MEMFS at /bundle/user-vault/{relpath}.
#     # 3. Call _forge_registry.refresh_file(relpath) to update cache.
#     # 4. Return _forge_get_generate_inventory(snippet_id).
```

## 2. CC actions

1. Add the test file. Run `npm test`.
2. **Expected**: 4 new cases fail. The other 109 prior cases stay pass.
3. Paste exact failure output in feedback §2 verbatim.
4. **DO NOT add the fix.** No `_forge_preflight_then_inventory` helper, no JS-side forgeSnippet edit, no protocol updates.
5. **DO NOT bump the plugin version.** No release zip, no tag, no GH release.
6. Commit message: `[2026-06-01-0200-forge-click-race-failing-test] tests only — failing test for forge-click race (no fix)`.
7. Push commit on `main`. No tag.

## 3. Instructions for user to run the test locally

Include in feedback verbatim:

```bash
# 1. Pull the latest changes
cd ~/projects/forge-client-obsidian
git pull --ff-only

# 2. Run the full suite — see the 4 failing cases
npm test 2>&1 | tail -25

# 3. Or run only the new test file
node --test src/forge-click-race.test.ts 2>&1
```

Expected output snippet (paste the actual one into feedback):

```
✖ forge-click-race: preflight helper exists
  AssertionError: _forge_preflight_then_inventory should exist in Pyodide globals
✖ forge-click-race: preflight returns fresh english after disk-write-without-hook
  NameError: name '_forge_preflight_then_inventory' is not defined
✖ forge-click-race: preflight is idempotent across repeated calls
  NameError: name '_forge_preflight_then_inventory' is not defined
✖ forge-click-race: preflight handles unknown snippet_id
  NameError: name '_forge_preflight_then_inventory' is not defined
tests 113, pass 109, fail 4
```

The user runs the commands, confirms the same fail, then approves the follow-up fix prompt.

## 4. Out of scope (explicit)

- **No fix.** No `_forge_preflight_then_inventory` helper. No JS-side wiring in forgeSnippet. No edits to `/generate` flow.
- **No protocol updates.** Saving the meta-observation about "tests aren't aggressive enough at the event-loop level" for the fix prompt.
- **No version bump.** No release.
- **No engine source changes.** Plumbing for the helper goes in the inlined Python block in `pyodide-host.ts` once the fix lands.
- **No removal/modification of existing inventory-staleness tests.** They document complementary contracts and should keep passing.

## 5. Feedback file format

Standard. Frontmatter timestamp + session_id + status. File at `prompts/feedback/2026-06-01-0200-forge-click-race-failing-test.md`.

Feedback §2 includes the verbatim `npm test` output showing 109 pass / 4 fail. Feedback §3 includes the user-side run commands exactly as in §3 above.

## 6. One observation to add in feedback

Per cowork-forge-protocol.md's TDD section (recently updated rider about "tests must invoke the production code path"): note in feedback §6 whether this test design — asserting the EXISTENCE and CONTRACT of a helper the fix will add — fits the rider or is a softer form. My read: it's the soft form — the test verifies the helper's contract from outside the production wiring. The harder form (asserting forgeSnippet calls the helper before /generate) requires integration testing, which we don't have.

The soft form is still useful: it locks in the API surface CC will commit to, and it survives any future refactor that keeps the helper's name + semantics intact.
