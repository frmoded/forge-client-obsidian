---
timestamp: 2026-06-01T01:55:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-01T00:30:00Z
status: success
---

# Failing-test-only — inventory staleness on first Forge-click after direct edit

## 1. Test file added

`src/inventory-staleness.test.ts` (266 lines, 4 cases). Pyodide-in-
Node mounting the bundled engine + a fake user vault containing
`Greet.md`. Each test reboots a per-test registry state; the
Pyodide instance itself is shared via the existing promise pattern.

The Python helpers from `pyodide-host.ts` (`_forge_find_deps`,
`_forge_get_generate_inventory`) live in the inlined block of the
production file and aren't reachable from `node --test`. The test
duplicates them verbatim (drift-protection comment notes the v0.5.x
plan to centralize in `forge.core.*` and collapse the duplicate).

Case table:

| # | Case | Today's behavior |
| --- | --- | --- |
| a | initial inventory reflects scan-time english | PASS |
| b | post-direct-MEMFS-edit inventory STILL returns stale english | PASS (documents bug at suite time) |
| c | inventory returns FRESH english after refresh_file | PASS (confirms mechanism) |
| d | BUG REPRO — getGenerateInventory should return fresh english without explicit refresh | **FAIL** (load-bearing) |

## 2. Verbatim test output

```
✔ inventory-staleness: initial inventory reflects scan-time english (941.676292ms)
✔ inventory-staleness: post-direct-MEMFS-edit inventory STILL returns stale english (2.72775ms)
✔ inventory-staleness: inventory returns FRESH english after refresh_file (2.378333ms)
✖ inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh (2.22725ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1044.248916

✖ failing tests:

test at src/inventory-staleness.test.ts:250:1
✖ inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh (2.22725ms)
  AssertionError [ERR_ASSERTION]: getGenerateInventory should auto-pick-up new english from MEMFS without an explicit refresh_file call (this fails until the follow-up fix lands)
      at TestContext.<anonymous> (file:///Users/odedfuhrmann/projects/forge-client-obsidian/src/inventory-staleness.test.ts:261:10)
      at async Test.run (node:internal/test_runner/test:1208:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:831:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'print "hello 999"',
    expected: /hello 9991/,
    operator: 'match',
    diff: 'simple'
  }
```

The `actual: 'print "hello 999"'` vs `expected: /hello 9991/`
output is the smoking gun — the resolver returned the OLD english
from the cached entry even after `py.FS.writeFile` updated the
underlying file.

Full suite snapshot: 101 passing (98 prior + 3 new) + 1 failing
(the load-bearing bug witness) = 102 total. `npm test` exits
non-zero because of (d); intentional.

## 3. User-side instructions to verify

```bash
# 1. Pull the latest changes
cd ~/projects/forge-client-obsidian
git pull --ff-only

# 2. Run the full suite — see the failing case
npm test 2>&1 | tail -30

# 3. Or run only the new test file
node --test src/inventory-staleness.test.ts 2>&1
```

Expected output snippet (from this drain's run):

```
✔ inventory-staleness: initial inventory reflects scan-time english (≈940ms cold-boot)
✔ inventory-staleness: post-direct-MEMFS-edit inventory STILL returns stale english (≈3ms)
✔ inventory-staleness: inventory returns FRESH english after refresh_file (≈2ms)
✖ inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh
  AssertionError: actual: 'print "hello 999"', expected: /hello 9991/
tests 4, pass 3, fail 1
```

`npm test`'s exit code is non-zero because case (d) fails — that's
intentional until the follow-up fix prompt lands.

## 4. Git ops

- Commit `451b951` on `main`:
  `[2026-06-01-0030-inventory-staleness-failing-test] tests only — failing test for inventory staleness (no fix)`.
- Pushed to `origin/main`.
- **No tag, no GH release, no version bump** per prompt §4.

## 5. Out of scope confirmed

- No fix to `getGenerateInventory`, `_forge_resolver`, or any
  inventory/registry code.
- No `vault.on('modify')` hook (the candidate fix; defer).
- No `manifest.json` change.
- No release zip.
- No tag.
- No engine source changes.
- No protocol updates (cowork-forge-protocol.md /
  cc-prompt-queue.md untouched).

## 6. One observation

**No pure-core extraction this prompt.** The test mounts the
existing engine + registry surface directly — the
`_forge_get_generate_inventory` helper is inlined into the test's
`bootFreshGreet` runPython block (verbatim duplicate of the
production helper in `pyodide-host.ts`, with the drift-protection
NOTE). That's the same pattern from v0.2.5's
`pyodide-inventory.test.ts` and v0.2.17's `memfs-staleness.test.ts`
— ride the integration-test infrastructure that already mounts the
bundled engine; no new file count.

Pure-core extraction count in the arc stays at seven
(`closed-beta-ux.ts`, `forge-installer/version.ts`,
`forge-installer/zip-paths.ts`,
`forge-installer/enable-strategy.ts`, `copy-dir-core.ts`,
`forge-toml-stub.ts`, `forge-music-gate.ts`). The pattern: pure-
core extraction when the helper is pure-data logic (regex /
parser / decision); integration-test mount when the test exercises
the engine end-to-end.

Worth flagging in the v1.0 retrospective alongside the prior
"pure-core extraction convention" note: there are now TWO
testability patterns in active use, and they serve different
purposes. Naming them explicitly in the protocol would help
future contributors pick the right one without rediscovering both.
