# v0.2.5 — fix vendored inventory helper regex + add test that exercises it

## Scope

Single-repo (`forge-client-obsidian`) bug fix. v0.2.4 shipped a Python helper (`_forge_find_deps` in `pyodide-host.ts`) with a malformed f-string regex that throws `SyntaxError` the moment `getGenerateInventory(...)` is called. This breaks the entire `/generate` flow.

What this prompt delivers:

1. **Fix the regex** in `pyodide-host.ts`'s `_forge_find_deps` (and any sibling regex with the same problem). The intent was to match `context.compute("snippet_id")` or `context.compute('snippet_id')` with optional whitespace. Two cleanest fixes:
   - **Use a raw triple-quoted f-string** so the embedded `'` and `"` don't terminate the string: `rf"""context\.compute\(\s*["']({_FORGE_ID_CHARS})["']"""`
   - **Or use a non-f raw string with .format()**: `r"""context\.compute\(\s*["']({IDS})["']""".format(IDS=_FORGE_ID_CHARS)`
   
   Either works. CC picks the more readable. Verify `\s` is preserved (not eaten by string parsing), and that the character classes `["']` work without terminating the outer string.

2. **Add a Pyodide-exercising test.** This is the bigger fix — the original v0.2.4 auto-smoke missed this because no test actually ran Python through Pyodide. New test loads the Pyodide host, mounts a small fake vault (or uses the bundled forge-moda), calls `getGenerateInventory("setup")` (or whichever bundled snippet), and verifies:
   - The call doesn't throw.
   - The returned object has the expected shape (`snippet_id`, `description`, `english`, `inputs`, `generation_notes`, `deps`, `active_domains`).
   - `deps` is an array (possibly empty).
   - `english` is a non-empty string for `setup.md`.
   
   This belongs as a new test file or an extension to existing iframe-side tests. Per the prior plugin-test convention (`node --test` over pure-core modules), Pyodide-coupled tests need either (a) a JSDOM-style shim, (b) running the Python helpers in isolation via the spike pattern from `forge-moda-bootstrap/spikes/pyodide-moda/`. CC picks the cleaner approach. If both are too heavy, document the gap honestly and ship just the regex fix — but the test is worth real effort because this same bug class will recur.

3. **Bump version to 0.2.5** and cut a release with clean-vault smoke per the release-shipping rule.

4. **Re-run the user smoke flow** as part of CC's auto-smoke: load Pyodide host in the sandbox, call `_forge_find_deps` and `_forge_get_generate_inventory` directly with a representative input, verify no syntax error and correct output shape.

Does NOT:

- Refactor the helper into `forge.core.llm` (the v1.1 centralization CC suggested). Just the bug fix here.
- Touch the α service.
- Touch the iframe.
- Add new functionality.
- Migrate `/canonicalize`.

## Why

V1 plugin v0.2.4 currently shipped with a broken `/generate` path. The user smoke caught it at step 14 (load-bearing end-to-end) — Pyodide raises SyntaxError on the helper's first invocation, so no generate request ever leaves the plugin. v0.2.5 unblocks the seminar.

The test addition is the real fix. The bug itself is trivial (one regex), but the gap that let it ship is that auto-smoke didn't exercise Pyodide-side Python. v1.1+ work will keep adding Python helpers; without a test that runs them, the same class of bug recurs.

## Files to modify

### `forge-client-obsidian/src/pyodide-host.ts`

Find `_forge_find_deps` (Python source embedded in the TS file). The current regex line:

```python
rf'context.compute(s*["']({_FORGE_ID_CHARS})["']', body or ""
```

Replace with a correctly-escaped version. Suggested (triple-quoted raw f-string):

```python
rf"""context\.compute\(\s*["']({_FORGE_ID_CHARS})["']"""
```

OR (non-f raw with .format):

```python
r"""context\.compute\(\s*["']({IDS})["']""".format(IDS=_FORGE_ID_CHARS)
```

Verify the pattern actually matches `context.compute("setup")` and `context.compute('go')` etc. by running it locally before committing.

If there are sibling regexes (e.g., for `[[wikilinks]]`) with the same f-string-quoting pattern, fix them too. Audit the helper for any other backslash-eating or quote-terminating issues.

### Tests — `forge-client-obsidian/src/pyodide-inventory.test.ts` (new) OR sandbox-style

CC picks the test infrastructure approach. Two viable shapes:

**Option A: Pyodide-in-Node test.** Use the same Pyodide-in-Node pattern from the spike (`forge-moda-bootstrap/spikes/pyodide-moda/run-spike.mjs`). Load Pyodide, mount the engine + bundled forge-moda, call `_forge_get_generate_inventory("setup")`, assert shape. Adds Pyodide as a dev dep (it's already there per the existing assets pipeline; probably just a `require("pyodide")` shim away).

**Option B: Direct unit test of the Python source string.** Extract the Python helper code to a standalone .py file that's read+exec'd by both the plugin AND a test. Test invokes Python via `child_process.spawn("python3", ...)` or via PyodideNode. More extraction work; better long-term.

**Option C: Skip the test, document the gap.** Acceptable if A and B turn out to be more than ~2 hours of work. CC's call. If shipping the regex fix alone, the v1.1 centralization (helper in `forge.core.llm`) becomes much higher priority.

Whichever is chosen, the test should:
- Successfully load Pyodide (proves no SyntaxError at parse time).
- Call `_forge_get_generate_inventory("setup")` against a real or mocked vault.
- Assert all 7 fields present in the result.
- Assert at least one entry in `deps` (since `setup` calls other snippets).

### `forge-client-obsidian/manifest.json`

Version bump: `0.2.4` → `0.2.5`. Patch bump (bug fix).

### `forge-client-obsidian/INSTALL.md`

Update download link + filename references: `v0.2.4` → `v0.2.5`. Update closed-beta pin note.

## Implementation notes

### Verify the regex actually matches BEFORE committing

The original broken regex would have been caught by ANY interactive test of the helper. CC: before committing, run something like:

```python
import re
# Patch in the actual definitions
_FORGE_ID_CHARS = r"[\w./-]+"
pattern = rf"""context\.compute\(\s*["']({_FORGE_ID_CHARS})["']"""
test_body = '''
state = context.compute("setup", temperature="medium")
state = context.compute('move', state=state)
context.compute(
    "ask_all_particles",
    state=state, dt=dt,
)
'''
matches = re.findall(pattern, test_body)
print(matches)  # should print ['setup', 'move', 'ask_all_particles']
```

If `matches` is `['setup', 'move', 'ask_all_particles']`, the regex is correct. If anything's missing or extra, iterate.

### Match engine's `_find_deps` exactly

`forge-transpile/prompts/llm_prompts.py` (or wherever the vendored copy lives) and the plugin's helper should produce identical outputs for any given input. Per CC's v0.2.4 observation, these should eventually share a source. For now: read whichever's more canonical (probably `forge/core/llm.py::_find_deps` in the engine repo) and mirror its regex exactly. Don't invent.

If the engine's regex itself is single-quoted-f-string-style and works there because of how it was authored, the cleanest is to copy the engine's exact string verbatim — same escaping, same quoting style.

## Tests + smoke

### Auto-verified by CC

- `npm run build` → exit 0.
- `npm test` → existing 42 pass + the new inventory-helper test (if Option A or B chosen).
- **Pyodide-exercising test:** the new test loads the host and invokes the helper. If syntax error → fail loud. If shape mismatch → fail.
- `npm run release-zip` → produces `dist/forge-client-obsidian-v0.2.5.zip`.
- **Clean-vault smoke** per release rule: fresh test vault, unzip release, verify manifest 0.2.5, verify all 4 asset subdirs present.
- **Hosted service reachability** (no regression): `curl https://forge.thecodingarena.com/health` returns 200; `/generate` no-auth → 401.
- Git ops: commit with `[2026-05-26-0100-fix-inventory-helper-regex]` prefix, tag v0.2.5, GH release with zip attached.

### Deferred to user (Obsidian-context)

After release, user re-runs the v0.2.4 smoke (renumbered as a fresh sequence by Cowork) against v0.2.5:

1. Verify manifest.json shows 0.2.5 after re-install.
2. Settings → Forge → Transpile section still shows fields.
3. Empty-token path still fast-fails with the actionable message.
4. **Real /generate path (the one that broke in v0.2.4):** delete a Python facet, click Forge, expect Python returned + file updated + Pyodide compute succeeds.
5. Wrong-token path returns 401 with mapped error.

## Out of scope

- Centralizing the helper in `forge.core.llm` (v1.1 work per CC's prior observation).
- `/canonicalize` migration.
- Per-user token management.
- First-run UX changes.
- Anything in forge-transpile or forge-moda repos.

## Report when done

Per protocol 8-section.

1. **Regex diff** — before/after of the line(s) changed. Confirm tested inputs match expected outputs.
2. **Test infrastructure choice (Option A/B/C)** — what CC picked + rationale.
3. **Test diff** — new test file(s) or extensions. What's asserted.
4. **manifest.json + INSTALL.md diffs** — version + download link.
5. **Auto-smoke output** — build, test, release zip size + SHA, clean-vault verification, hosted reachability.
6. **Git ops** — commit SHA, tag, GH release URL.
7. **Manual smoke guidance for user** — the 5-step re-run sequence above.
8. **Any deviation and why** (especially if C was chosen — document the test gap clearly).
9. **One observation** — anything noticed during the fix worth a follow-up.

## Commits + push

Per default-on git ops protocol. Single commit on `main`. Tag `v0.2.5`. GH release with zip.

Suggested message:

```
[2026-05-26-0100-fix-inventory-helper-regex] v0.2.5 — fix Pyodide inventory helper regex syntax

The vendored _forge_find_deps in pyodide-host.ts shipped in v0.2.4
with a malformed f-string regex (raw f-string with embedded quote
characters terminating the string, plus a missing backslash on \s*).
SyntaxError fired on Pyodide load; broke the entire /generate flow.

Fixed by switching to a triple-quoted raw f-string so embedded
quotes don't terminate the string. Added a Pyodide-exercising test
to catch this class of bug going forward.
```

## Don'ts

- **Don't refactor** the helper into `forge.core.llm`. Just fix the bug.
- **Don't change** any α service code. Bug is plugin-side only.
- **Don't ship without the regex actually matching** the test inputs. Manually verify before commit.
- **Don't skip the Pyodide-exercising test** unless A and B are both impractical. The test is the v1.1 protection that pays for itself the next time a Python helper bug ships.
- **Don't bump beyond v0.2.5** unless v0.2.5 collides with an existing tag (it shouldn't).
- **Don't touch the iframe.**
- **Don't proceed past a blocker.** If Pyodide-in-test infrastructure is unexpectedly complex, route to questions/ with the specific friction.
