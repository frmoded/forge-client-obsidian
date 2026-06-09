---
timestamp: 2026-06-01T03:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-01T02:00:00Z
status: success
---

# Failing-test-only — forge-click race (no fix; pre-flight contract)

## 1. Test file added

`src/forge-click-race.test.ts` (273 lines, 4 cases). Pyodide-in-
Node mounting the bundled engine + a fake user vault with
`Greet.md`. Same fixture pattern as `inventory-staleness.test.ts`
and `memfs-staleness.test.ts`.

The fixture defines `_forge_find_deps` and
`_forge_get_generate_inventory` verbatim from `pyodide-host.ts`
(drift-protection NOTE points at the live source). It deliberately
DOES NOT define `_forge_preflight_then_inventory` — that helper is
what the fix prompt will add. Until then, every reference raises
`NameError` in Pyodide.

Case table:

| # | Case | Behavior today |
| --- | --- | --- |
| a | preflight helper exists | FAIL — `'_forge_preflight_then_inventory' in dir()` returns False |
| b | preflight returns fresh english after disk-write-without-hook | FAIL — NameError |
| c | preflight is idempotent across repeated calls | FAIL — NameError on first call |
| d | preflight handles unknown snippet_id | FAIL — NameError, message doesn't contain "Nonexistent" so the assertion's matcher fails |

Test (b) is the load-bearing race-fix witness. Tests (a) and (c)
are existence + defensive contract assertions. Test (d) is the
"unknown snippet_id" behavior; uses `assert.throws` with a message
matcher so today's NameError fails the assertion (NameError text
doesn't mention "Nonexistent"; post-fix
`SnippetResolutionError`'s text will).

## 2. Verbatim test output

Per-file run (`node --test src/forge-click-race.test.ts`):

```
✖ forge-click-race: preflight helper exists (1019.707584ms)
✖ forge-click-race: preflight returns fresh english after disk-write-without-hook (4.959792ms)
✖ forge-click-race: preflight is idempotent across repeated calls (3.163083ms)
✖ forge-click-race: preflight handles unknown snippet_id (2.893708ms)
ℹ tests 4
ℹ pass 0
ℹ fail 4
```

Full suite (`npm test`):

```
ℹ tests 113
ℹ suites 0
ℹ pass 109
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1380.210333
```

109 prior cases all still pass (98 from v0.2.17 baseline + 4
inventory-staleness + 7 memfs-sync-paths from v0.2.18). The 4 new
forge-click-race cases fail as designed. `npm test` exits non-zero
because of the 4 failures — intentional until the follow-up fix
prompt lands.

## 3. User-side instructions to verify

```bash
# 1. Pull the latest changes
cd ~/projects/forge-client-obsidian
git pull --ff-only

# 2. Run the full suite — see the 4 failing cases
npm test 2>&1 | tail -25

# 3. Or run only the new test file
node --test src/forge-click-race.test.ts 2>&1
```

Expected output snippet (from this drain's run):

```
✖ forge-click-race: preflight helper exists
  AssertionError: _forge_preflight_then_inventory should exist in Pyodide globals
✖ forge-click-race: preflight returns fresh english after disk-write-without-hook
  NameError: name '_forge_preflight_then_inventory' is not defined
✖ forge-click-race: preflight is idempotent across repeated calls
  NameError: name '_forge_preflight_then_inventory' is not defined
✖ forge-click-race: preflight handles unknown snippet_id
  AssertionError: unknown snippet_id should raise an error that mentions the id
tests 113, pass 109, fail 4
```

`npm test`'s exit code is non-zero — intentional until the fix
ships.

## 4. Git ops

- Commit `5d858da` on `main`:
  `[2026-06-01-0200-forge-click-race-failing-test] tests only — failing test for forge-click race (no fix)`.
- Pushed to `origin/main`.
- **No tag, no GH release, no version bump** per prompt §2.5 +
  §4.

## 5. Out of scope confirmed

- No `_forge_preflight_then_inventory` helper added.
- No JS-side `forgeSnippet` edit.
- No `/generate` flow edits.
- No protocol updates.
- No `manifest.json` change.
- No release zip / tag / GH release.
- No engine source changes.
- No removal/modification of existing inventory-staleness or
  memfs-staleness tests — they document complementary contracts
  and stay green.

## 6. One observation — test-form classification per the protocol rider

Per the cowork-forge-protocol rider on "tests must invoke the
production code path, not simulate it from outside" — this test is
the **soft form**.

**Hard form** would be: assert that `forgeSnippet` calls
`_forge_preflight_then_inventory` before invoking the hosted
`/generate`. That requires either:
- A code-coverage assertion against the bundled `main.js` (string-
  grep for the call ordering), OR
- Integration testing that drives a real Obsidian instance and
  observes the network sequence to α.

Both are heavier infrastructure than this drain ships. The hard
form is v1.1+ work (Playwright + Electron).

**Soft form** (what this commit does): assert that the helper
EXISTS with the right contract. The fix prompt will add the
helper; the test passes once the helper is wired up. Whether
forgeSnippet actually calls it before /generate is verified by:
- Manual smoke (the prompt's §3.3 scenario — Cmd-S then quick
  Forge-click should produce fresh inventory).
- A code-review check that the call site sits above the
  generateSnippetAlpha call.

The soft form is still useful: it locks in the API surface CC
will commit to in the fix prompt (helper name, parameter
signature, error-on-unknown-id behavior). A future refactor that
keeps `_forge_preflight_then_inventory`'s name + semantics intact
won't accidentally drop the contract.

If the v1.1 Playwright integration test infrastructure ever
lands, these 4 soft-form cases get promoted to hard-form
equivalents that drive Obsidian's event loop. Logging the
recommendation; not blocking v0.2.19.
