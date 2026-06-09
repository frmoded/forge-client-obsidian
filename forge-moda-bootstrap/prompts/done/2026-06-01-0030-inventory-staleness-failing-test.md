# Failing-test-only — inventory staleness on first Forge-click after direct edit

## Why this prompt exists

User observed during v0.2.17 smoke:

1. Edit `Greet.md` English facet in Obsidian editor — `print "hello 999"` → `print "hello 9991"`. Save (Cmd+S).
2. Click Forge. **Python is NOT regenerated.** Diagnostic shows OLD Python:
   ```
   Forge debug: run_snippet('Greet') body=105ch code=44ch preview='def compute(context): | print("hello 999")'
   Forge Compute Result: {type: 'action', result: undefined, stdout: 'hello 999\n'}
   ```
   `body=105ch` confirms the new English IS in MEMFS, but `code=44ch` (unchanged) confirms Python wasn't regenerated.
3. Click Forge a SECOND time on the same state. NOW Python regenerates correctly to match the new English.

Hypothesis: `getGenerateInventory("Greet")` reads from the registry's
cached entry. After a direct editor edit + save (no Forge call yet),
MEMFS still has the pre-edit body — §2.4 in v0.2.17 was deferred.
So the first /generate call sends the OLD English to α; α returns
Python matching OLD English; writeGeneratedCode writes that Python +
NEW English (from disk) to disk and to MEMFS via syncUserVaultFile.
NOW MEMFS has fresh content. Second Forge-click sends FRESH English
to α → α returns new Python → all consistent.

This prompt scope: **write the failing test that proves the bug at
suite-run time. Do NOT add the fix.** The user wants to see the
test fail before any patching, per TDD discipline. A follow-up
prompt will ship the fix once the failing test is approved.

## 1. Failing test to add

`src/inventory-staleness.test.ts` (new file). Pyodide-in-Node, same
infrastructure pattern as `memfs-staleness.test.ts` from v0.2.17.

Boot Pyodide once (reuse the bundled engine + a fake user vault).
Add 3-4 test cases:

| Case | Asserts |
| --- | --- |
| `inventory-staleness: initial inventory reflects scan-time english` | mount Greet.md with English `"BODY_OLD"`. Call `_forge_get_generate_inventory("Greet")` → returns inventory with english matching BODY_OLD. **Should PASS** today. |
| `inventory-staleness: post-direct-MEMFS-edit inventory STILL returns stale english` | direct `py.FS.writeFile('/bundle/user-vault/Greet.md', BODY_NEW)` (simulates "user edited in editor + saved" — disk changed but no refresh_file call). Then call inventory. assert english CONTAINS the OLD string. **Should PASS** — it documents the staleness bug at suite time. |
| `inventory-staleness: inventory returns FRESH english after refresh_file` | same as above but ALSO call `_forge_registry.refresh_file("Greet.md")` between the writeFile and the inventory call. assert english CONTAINS the NEW string. **Should PASS** — confirms refresh_file IS the right mechanism. |
| `inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh` | the "ideal" behavior: directly after a MEMFS file write (no refresh_file call), `_forge_get_generate_inventory` should somehow auto-pick-up the new body. assert english CONTAINS the NEW string. **THIS CASE FAILS** today — that's the load-bearing reproduction. |

The fourth case is the **bug witness**. It encodes the expected
behavior (inventory always returns fresh english) and fails today
(because no auto-refresh exists in the inventory materialization
path).

Comment liberally — explain why each case exists, especially the
fourth one's "expected to FAIL until fixed in a follow-up prompt"
note.

## 2. CC actions

1. Add the test file. Run `npm test`.
2. **Expected**: 3 cases pass, 1 case fails. Paste the exact
   failure output in feedback §2.
3. Suite total target: 98 prior + 4 new = 99 pass + 1 fail = 99/102
   "passing" but actually 99 pass / 3 fail-the-suite (or however
   node --test reports a mix of pass and explicitly-marked
   bug-witness tests).
4. **DO NOT add a fix.** This prompt's scope is ONLY the failing
   test. Do not patch `getGenerateInventory`, `_forge_resolver`,
   or any inventory-related code. The follow-up fix prompt will
   land after the user approves.
5. **DO NOT bump the plugin version.** No release zip, no tag, no
   GH release. This is a test-only commit.
6. Commit message: `[2026-06-01-0030-inventory-staleness-failing-test] tests only — failing test for inventory staleness (no fix)`.
7. Push commit. No tag.

## 3. Instructions for user to run the test locally

The feedback file must include this section verbatim so the user
can run it after pulling the commit:

```bash
# 1. Pull the latest changes
cd ~/projects/forge-client-obsidian
git pull --ff-only

# 2. Run the full suite — see the failing case
npm test 2>&1 | tail -30

# 3. Or run only the new test file
node --test src/inventory-staleness.test.ts 2>&1
```

Expected output snippet (paste the actual one into feedback):

```
✔ inventory-staleness: initial inventory reflects scan-time english (Xms)
✔ inventory-staleness: post-direct-MEMFS-edit inventory STILL returns stale english (Xms)
✔ inventory-staleness: inventory returns FRESH english after refresh_file (Xms)
✖ inventory-staleness: BUG REPRO — getGenerateInventory should return fresh english without explicit refresh
  AssertionError: english should contain "BODY_NEW" but got "BODY_OLD"
tests 4, pass 3, fail 1
```

The user runs the commands, confirms the same fail, and approves
the follow-up fix prompt.

## 4. Out of scope (explicit)

- **No fix.** Any change to `getGenerateInventory`,
  `_forge_get_generate_inventory`, `_forge_resolver`, or any
  inventory/registry code is out of scope.
- **No `vault.on('modify')` hook.** That's the candidate fix; defer.
- **No version bump.** No release zip. No tag. No GH release.
- **No engine source changes.** `refresh_file` is already wired in
  v0.2.17; no further engine touches.
- **No protocol updates.** No edits to cowork-forge-protocol.md
  or cc-prompt-queue.md.

## 5. Feedback file format

Standard, fresh-enumerated. Frontmatter timestamp + session_id +
status. File at
`prompts/feedback/2026-06-01-0030-inventory-staleness-failing-test.md`.

Feedback §2 must include the verbatim `npm test` output showing
the 3 pass / 1 fail mix. Feedback §3 must include the user-side
run instructions exactly as in §3 above (or refine if the actual
commands differ on the user's machine; pin the exact node + npm
versions if relevant).

## 6. One observation in feedback

Note in §6 whether the test infrastructure forced any pure-core
extraction (the 8th in this arc if so) or whether the test mounts
the existing engine + registry surface directly. Either is fine;
just report.
