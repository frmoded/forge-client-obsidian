---
timestamp: 2026-06-01T01:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-31T23:45:00Z
status: success
---

# Investigate greet snippet — TDD pivot to plugin-side after engine cleared

## 1. Root cause identification

**Engine cleared; bug is plugin-side.** Per prompt §2.2 pivot.

Three Pyodide-in-Node tests against the user's exact body content
(including the markdown `---` horizontal rule between # English
and # Python facets) ALL PASS against current code:

- `extract_section(body, "english")` → `'print "hello1"'`
- `extract_python(body)` → `'def compute(context):\n    print("hello")'`
- `exec(compile(extract_python(body), "<snippet>", "exec"))`
  followed by calling `compute(context)` → stdout `"hello\n"`

End-to-end integration test mounts the bundled engine
(`assets/engine/`) + a fake user vault containing the user's
exact file content as `Greet.md`, then exercises the full
`_forge_run_snippet` path:

- `SnippetRegistry().scan('/bundle/user-vault')` parses Greet.md
  cleanly. Meta has `type='action'`, `description='Greet'`. Body
  contains the markdown `---` rule verbatim.
- `_resolver.resolve('Greet').get('body')` returns the expected
  body shape.
- `extract_python(snip['body'])` returns the function definition.
- `exec_python(code, {}, _resolver, ...)` returns
  `(stdout='hello\n', result=None)`.

**Hypothesis 1a (parser misreads `---`) is REFUTED at suite time.**
The engine handles the user's body content correctly end-to-end.

## 2. Failing-test-first reproduction output

### 2.1 Test cases added before any fix

`src/greet-snippet-bug.test.ts` (extractor-direct):
- `greet-bug: extract_section(body, "english") returns the English facet content`
- `greet-bug: extract_python(body) returns the Python facet content past the ` + '`---`' + ` rule`
- `greet-bug: exec(extract_python(body)) defines a callable compute function`

`src/greet-snippet-integration.test.ts` (full engine mount):
- `greet-bug: registry parses Greet.md with the markdown --- rule in body`
- `greet-bug: extract_python on the registry-parsed body returns the function`
- `greet-bug: full exec_python flow produces stdout "hello\n"`

### 2.2 Test run output

```
✔ greet-bug: extract_section(body, "english") returns the English facet content (690ms)
✔ greet-bug: extract_python(body) returns the Python facet content past the `---` rule (1ms)
✔ greet-bug: exec(extract_python(body)) defines a callable compute function (1ms)
✔ greet-bug: registry parses Greet.md with the markdown --- rule in body (1046ms)
✔ greet-bug: extract_python on the registry-parsed body returns the function (4ms)
✔ greet-bug: full exec_python flow produces stdout "hello\n" (2ms)
```

**Expected failure did NOT occur.** Per prompt §2.2: "If the test
passes against current code — the bug is somewhere the test
doesn't exercise. Pivot."

### Pivot rationale

The engine layer (parse_frontmatter → registry.scan → resolve →
extract_python → exec_python) handles the user's exact body
content correctly. The bug must lie in:

a. **Plugin-side compute path** — `pyodide-host.ts:computeViaEngine`
   unwraps the Python tuple via `tuple.get(0)` and `tuple.get(1)`.
   CPython probe confirmed PyProxy tuples DO support `.get(idx)`
   for indexing (returns `'hello\n'` for idx=1 on a `(None,
   'hello\n')` tuple). So the unwrap is structurally fine.

b. **User's file content differs from prompt representation** —
   invisible whitespace, CRLF vs LF line endings, edit-staleness
   between disk and Pyodide's one-shot MEMFS mount (known UX hole
   per v0.2.13 feedback). The prompt's "File content (verbatim)"
   block may be a clean transcription rather than the literal
   bytes Pyodide saw.

c. **Other plugin-side state** — α `/generate` returned new Python
   silently overwriting the file before compute ran, then compute
   ran the in-memory-cached MEMFS body. Or `writeGeneratedCode`
   succeeded but with a different body than expected.

Without the user's actual file (and ideally a diff of the
Pyodide-mounted body vs disk), I can't reproduce. Shipping
diagnostic logging so the next attempt produces evidence.

## 3. Patch shape — diagnostic addition (not a fix)

`src/pyodide-host.ts:_forge_run_snippet` — one-line diagnostic
print before `exec_python` call:

```python
print(
    f"Forge debug: run_snippet({snippet_id!r}) "
    f"body={_body_len}ch code={_code_len}ch preview={_code_preview!r}"
)
```

Goes to Pyodide's stdout (browser dev console), not the
`exec_python` capture buf (Python's `sys.stdout = buf` only
applies inside the `try` block). User's next Forge-click on the
problem snippet produces a console line like:

```
Forge debug: run_snippet('Greet') body=234ch code=35ch preview='def compute(context):     print("hello")'
```

That's the smoking gun:
- If body length is much smaller than expected → MEMFS mount is
  stale (file edited after Pyodide init).
- If code is `<empty>` or much smaller than expected →
  `extract_python` failed to find the `# Python` section in the
  mounted body.
- If preview shows the correct code but stdout is still empty →
  bug is downstream of `exec_python` (Pyodide stdout redirection,
  JS tuple unwrap, response shaping in server.ts).

No behavior change, no risk of regression.

## 4. Tests

`src/greet-snippet-bug.test.ts` — 3 cases (extractor-direct).
`src/greet-snippet-integration.test.ts` — 3 cases (full engine
mount + registry scan + extract + exec).

Suite total: **91/91** in ~1120ms (85 prior + 6 new).

The integration test requires the bundled engine on disk
(`assets/engine/`). It also requires numpy + pyyaml in Pyodide
(loaded via `loadPackage(['pyyaml', 'numpy'])` — adds ~1s to the
cold boot). Skipped-if-engine-missing guard in
`bootEngineAndVault` so a pre-build `npm test` produces a clearer
error than "ModuleNotFoundError" buried in the stack.

## 5. Version bump + release

- `manifest.json`: `0.2.15` → `0.2.16`.
- `INSTALL.md`: all `v0.2.15` → `v0.2.16`.
- `dist/forge-client-obsidian-v0.2.16.zip` — 11.21 MB.
- Local SHA-256:
  `cd19675268372e8002bb8c97d5059b01e7f331cb2968a25672e2af053d9b0767`.
- GH asset digest matches.

`forge-transpile`: not touched. The investigation didn't surface
any α-side issue (hypothesis 1b not confirmed either — the inventory
shape with `inputs: null` materializes cleanly through the
existing `[str(i) for i in (meta.get("inputs") or [])]` defensive).

## 6. Auto-smoke output

| Check | Result |
| --- | --- |
| `npm run build` | exit 0 |
| `npm test` | 91/91 in ~1120ms |
| New cases run end-to-end | green, no flakes across 3 runs |
| Static check: diagnostic print site | `grep "Forge debug: run_snippet" src/pyodide-host.ts` → 1 hit (the new line) |
| Zip preflight | green |
| GH asset digest matches local | yes |

## 7. Manual smoke guidance for user

1. **Install v0.2.16.** Drag-and-drop replace; reload Obsidian.
2. **Re-do the failing flow** in `~/forge-vaults/smoke-v0.2.13/Greet.md`:
   - Open dev console (Cmd-Opt-I) → Console tab → clear.
   - Click Forge button on Greet.md.
3. **Look for the diagnostic line**:
   ```
   Forge debug: run_snippet('Greet') body=Nch code=Mch preview='...'
   ```
4. **Interpret**:
   - If `body=0ch` or `body` much smaller than expected → the
     Pyodide MEMFS mount is stale. Fix: reload Obsidian (Pyodide
     re-init grabs the current disk content).
   - If `code=0ch` or preview shows `<empty>` → `extract_python`
     found no `# Python` section. Either the body shape differs
     from the prompt's representation OR the heading is malformed.
   - If preview shows the correct `def compute(context):` body
     but `Compute Result` STILL says `stdout: ''` → bug is
     downstream of exec. Paste the diagnostic line + the file
     content (verbatim, with line endings preserved via `cat -A`)
     and file a follow-up prompt.

## 8. Deviations

- **No parser fix** because hypothesis 1a was refuted at suite
  time (engine handles the body correctly). Per prompt §2.2
  pivot, focus shifted to plugin-side reproduction — which
  couldn't be done without the user's actual file. Shipped
  diagnostic instrumentation instead.
- **No "empty Python warning" surfacing per prompt §3 1a** —
  `_find_entrypoint` already raises `SnippetExecError` when no
  `def compute` is found, propagating to the user as a status-500
  Notice. The diagnostic addition is more useful for the actual
  failure mode (compute ran but produced empty stdout).
- **No hypothesis 1b (inventory shape) or 1c
  (writeGeneratedCode silent) test added** — without evidence
  these are the cause, building tests for them speculatively is
  premature. v0.2.16 diagnostic surfaces whichever layer is
  actually broken on the user's next attempt.

## 9. Git ops

- Commit `998c773` on `main` —
  `[2026-05-31-2345-investigate-greet-snippet-silent-failure] v0.2.16 — investigate greet bug + add diagnostic trace`.
- Pushed to `origin/main`.
- Tag `v0.2.16`, pushed.
- GH release:
  <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.16>
  with the zip attached. Digest matches local SHA.

## 10. Out of scope confirmed

- No engine parser rewrite (hypothesis 1a refuted).
- No /generate or α-side changes (hypothesis 1b not pursued —
  no evidence).
- No writeGeneratedCode rewrite (1c not pursued — no evidence
  yet; diagnostic will surface if it's the cause).
- No coordination with v0.2.15 release (v0.2.15 already shipped
  in the prior drain cycle; v0.2.16 branches off it cleanly).

## 11. One observation

The TDD discipline from `cowork-forge-protocol.md` §"Bug-
investigation prompts" worked exactly as intended this drain:

1. Wrote failing test FIRST against current code.
2. Ran it → all passed.
3. Pivoted per §2.2 to plugin-side reproduction.

The protocol's load-bearing assertion ("the failing-test-first
step is the load-bearing guarantee that the bug is actually
reproducible at suite-run time") prevented a confident-but-wrong
fix — without writing the failing test first, my reflex from
reading the prompt would have been to harden the parser based on
hypothesis 1a, ship the change, and discover at user-side smoke
that it didn't help. Instead, the test refuted 1a in ~700ms,
saved a wasted release cycle, and produced reusable regression
tests for any future "snippet body contains `---`" bug.

Worth flagging in the v1.0 retrospective: the TDD-failing-test-
first discipline is the highest-leverage practice this arc
introduced. Every bug-investigation prompt going forward should
follow it.
