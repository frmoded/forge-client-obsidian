# Investigate greet snippet — /generate doesn't write + print produces empty stdout

## Why this prompt exists

User in `~/forge-vaults/smoke-v0.2.13` (running forge-client-obsidian
v0.2.14) authored a `greet.md` snippet, clicked the Forge button, and
got an anomalous silent failure:

**File content (verbatim):**

```
---
type: action
description: Greet
inputs:
---

# English

  print "hello1"

---

# Python

```python
def compute(context):
    print("hello")
```
```

**Console output (verbatim):**

```
Forge: generate (α) {snippetId: 'Greet', serviceUrl: 'https://forge.thecodingarena.com'}
plugin:forge-client-obsidian:126797 Forge Compute → {serverUrl: 'http://localhost:8000', vaultPath: '/Users/odedfuhrmann/forge-vaults/smoke-v0.2.13', snippetId: 'Greet', args: Array(0), inputs: {…}}
plugin:forge-client-obsidian:126829 Forge Compute Result: {type: 'action', result: undefined, stdout: ''}
```

**File state after Forge-click**: byte-identical to the above. Python
facet was NOT rewritten despite the `generate (α)` log line firing.

Two anomalies, possibly compounding:

a. **`/generate` log fired but file unchanged.** No error log, no
   Notice. Either the /generate call failed silently (response
   error swallowed), the LLM returned empty Python, or
   writeGeneratedCode no-op'd.

b. **`print("hello")` produced empty stdout.** The existing Python
   facet has a top-level `print()` inside `compute()`. Running it
   should produce `hello\n` in stdout (matching the user's earlier
   `hello.md` smoke in Bluh, which produced `hello World\n`).

The user's other snippets work — moda simulator renders, Bluh's
`hello.md` produces correct stdout. So whatever is broken here is
specific to this snippet's shape.

## 1. Likely root causes to investigate (in priority order)

### 1a. Snippet body parser misreads the markdown `---` horizontal rule

The snippet has THREE `---` lines:
- Line 1: frontmatter open.
- Line 5: frontmatter close.
- Line 11 (between # English content and # Python header): a
  **markdown horizontal rule** that visually separates the two
  facets in Obsidian's preview, but is NOT a YAML/snippet delimiter.

If the engine's section-extraction code (`extract_section` in
`forge.core.executor` or similar — find it) is using a regex /
parser that treats any `---` as a YAML document boundary, it might
truncate the snippet body at line 11, dropping the `# Python` section
entirely. The Python facet would then resolve to empty string →
`exec_python("")` produces empty stdout and undefined return →
matches anomaly (b).

If this is the cause, the user's `---` separator is the culprit
AND the fix is either:
- The parser should treat `---` lines outside YAML frontmatter as
  markdown horizontal rules (preserve them in body, not as
  delimiters). OR
- The engine should fail loudly on snippets that fail to extract
  a `# Python` section, rather than silently running empty code.

Both fixes are valuable. Implement the parser fix; also surface
a clearer error for the empty-Python case.

### 1b. The empty `inputs:` YAML field causes inventory shape issues

The frontmatter has `inputs:` (no value → YAML null). The Pyodide-
side `_forge_get_generate_inventory` does
`[str(i) for i in (meta.get("inputs") or [])]` which handles null
fine. But the /generate request payload going to α might have a
different shape than expected, causing α to return an error that
gets swallowed silently.

Check: instrument the /generate call site to log the response status
+ body. Verify what α returned for this specific snippet's payload.

### 1c. writeGeneratedCode silent failure

If /generate returned a 200 with valid Python, writeGeneratedCode
should overwrite the facet. If it failed (file lock, permission,
markdown parsing of the new content), it logs a console.warn — but
the user didn't see one. Verify the code path is properly logging
every write attempt and failure.

## 2. TDD: write the failing test FIRST, then fix

**Critical discipline for this prompt.** Do NOT start patching code
until a failing test exists in the suite that reproduces the bug.

### 2.1 Build the reproduction test

Create a Pyodide-in-Node test fixture (mirror the pattern in
`forge-client-obsidian/src/pyodide-inventory.test.ts` — that test
file already boots Pyodide once and reuses across cases) that:

a. Constructs the exact `greet.md` content from this prompt's
   "Why" section, verbatim (frontmatter + body + markdown `---` rule
   between # English and # Python facets).
b. Mounts that snippet as the sole user-authoring file in MEMFS.
c. Calls `_forge_get_generate_inventory("Greet")` and asserts:
   - `english` field is non-empty and contains the literal
     `print "hello1"`.
   - `python` extracted via `extract_section(body, "python")` is
     non-empty and contains the literal `def compute(context):`.
d. Calls `_forge_run_snippet("Greet", [])` and asserts:
   - Returned `(stdout, result)` has `stdout == "hello\n"` (the
     facet's `print("hello")` actually produces output).
   - This is the behavioral assertion that fails today.

Name the test cases:
- `extract_section: # Python after markdown --- rule resolves to non-empty body`
- `compute: print("hello") produces stdout "hello\n"`
- (any other case that surfaces in §1 hypothesis triage)

### 2.2 Run the test against current code

`npm test`. **Expect failure** on the assertions above. Paste the
failure output in feedback §2 verbatim. This is the "bug is real
and at suite-run time we see it" proof — without it, the
post-fix passing test isn't strong evidence.

If the test passes against current code — the bug is somewhere
the test doesn't exercise. Pivot: the bug must be in the
plugin-side flow (JS-side /generate handling, writeGeneratedCode,
console-output capture) rather than the engine's snippet
extraction. Document the pivot in feedback §2 and write a
plugin-side reproduction instead.

### 2.3 Only after the failing test exists, apply the fix

Whichever hypothesis (1a / 1b / 1c) the test confirms. The fix lands
in the engine source (most likely `extract_section` in
`forge.core.executor`) AND mirrors to the bundled copy at
`forge-client-obsidian/assets/engine/forge/core/`.

### 2.4 Re-run the test

`npm test`. Expect ALL prior failing assertions to now pass. Report
the pass count + ms in feedback §2.

### 2.5 Run the full suite

`npm test` (no filter). Expect 0 regressions. Pass count target:
85 prior (from v0.2.15) + N new cases. Report exact total.

## 3. Fix scope (depends on findings)

If **1a confirmed** (parser misreads `---`):

- Patch `extract_section` (or wherever the engine splits snippet
  body into facets) to treat `---` as markdown horizontal rule
  outside frontmatter context. Frontmatter is bounded by the first
  two `---` lines at the top of the file; everything after is body
  prose where `---` is just markdown.
- Add a snippet-validation pass that warns (or errors) on an
  apparently-malformed Python section (empty, no `def compute`,
  etc.) BEFORE running it, with a Notice the user sees.
- Add test cases for body content with markdown `---` separators.

If **1b confirmed** (inventory shape):

- Patch the /generate request shape to handle the null-inputs case
  cleanly. Mirror in the Pyodide-side inventory materialization
  AND in α's `GenerateRequest` (forge-transpile repo).
- Either repo gets the version bump if changed.

If **1c confirmed** (writeGeneratedCode silent failure):

- Add explicit success/failure logging at every step of the write
  path. Surface a Notice on any failure.
- Identify the specific failure mode and patch.

If **multiple bugs found**: fix each, label by hypothesis number
in the commit message, ship.

## 4. Tests (in addition to §2's failing-test-first reproduction)

The §2 reproduction test IS the load-bearing test. Beyond it, if
additional hypotheses surface during investigation, add focused
tests per:

- 1a (extract_section): pure-core test using the malformed-but-not-
  fatal frontmatter + markdown-rule pattern.
- 1b (inventory shape): pure-core test for inventory materialization
  with `inputs: null` YAML field.
- 1c (writeGeneratedCode silent failure): plugin-side test if
  shimmable; otherwise manual smoke step with explicit log
  assertions.

Report exact suite total in feedback. Target: 85 prior + N new = (85+N)/(85+N).

## 5. Version bump + release

Depends on where the fix(es) land:

- `forge-client-obsidian` changes → bump to `v0.2.16` (next after
  the queued v0.2.15) and release.
- `forge-transpile` engine code changes → bump engine version
  (currently 0.1.0).
- Both → bump both, document the cross-repo ordering in feedback.

## 6. Auto-smoke + manual smoke

CC-side auto-smoke:
- Build + tests green.
- New test cases for whichever bug(s) confirmed.
- Static check for the fix landing where expected.
- GH release artifacts SHA-verified.

User-side manual smoke:
- Re-do the failing flow in `~/forge-vaults/smoke-v0.2.13/greet.md`:
  - Click Forge.
  - Expect: Python facet IS rewritten (or a clear error Notice
    if /generate has a real problem).
  - Expect: Compute Result has non-empty stdout when the snippet
    has a top-level `print` in `compute()`.

## 7. Out of scope

- Rewriting the engine's snippet parser from scratch — patch where
  the bug is.
- Cleaning up the user's `greet.md` snippet to be more idiomatic
  (e.g., adding `inputs: []`). The bug is the plugin/engine being
  fragile, not the user's file being wrong.
- Coordination of v0.2.16 with the still-queued v0.2.15 (forge-music
  bundling) — let v0.2.15 ship first, then this prompt's fix
  branches off v0.2.15.

## 8. Feedback file format

Standard. Feedback §1 should explicitly identify which hypothesis
(1a / 1b / 1c, or new) is the actual root cause, with the
reproduction evidence (Pyodide-in-Node test output). §3 reports the
patch shape. §4 reports test cases added. File at
`prompts/feedback/2026-05-31-2345-investigate-greet-snippet-silent-failure.md`.
