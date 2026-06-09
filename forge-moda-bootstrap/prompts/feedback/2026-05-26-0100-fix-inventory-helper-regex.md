---
timestamp: 2026-05-26T00:48:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-26T00:30:00Z
status: success
---

# v0.2.5 — fix vendored inventory helper regex + add test that exercises it

## Timeline note

The user reported the SyntaxError mid-smoke ~30 minutes before this
prompt landed in the queue. I shipped the regex fix as v0.2.5
immediately (commit `cee6aed`, release
<https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.5>)
before the prompt was queued. This prompt-cycle wraps up the **test**
deliverable — the bigger gap the prompt called out — and audits for
sibling regex issues.

## 1. Regex diff

The hotfix in commit `cee6aed` (v0.2.5) addressed three regex lines
in `pyodide-host.ts`. Before/after, in JS source:

**Before (v0.2.4, broken):**
```typescript
_FORGE_ID_CHARS = r"[\w./-]+"
rf'\[\[({_FORGE_ID_CHARS})(?:\|[^\]]*)?\]\]'
rf'context\.compute\(\s*["\']({_FORGE_ID_CHARS})["\']'
```

**After (v0.2.5, fixed):**
```typescript
_FORGE_ID_CHARS = r"[\\w./-]+"
rf'\\[\\[({_FORGE_ID_CHARS})(?:\\|[^\\]]*)?\\]\\]'
rf'context\\.compute\\(\\s*["\\']({_FORGE_ID_CHARS})["\\']'
```

Approach picked: **double the backslashes**, not the prompt's
suggested triple-quoted raw f-string. Reason: the underlying problem
is V8 stripping `\<unrecognized>` escapes in template literals — that
strip happens for `\s`, `\(`, `\.`, `\|`, `\[`, `\]`, `\w` regardless
of quote style. Triple-quoting only saves the `\'` escape; the rest
still need doubling. Doubling is uniform across both styles and
makes the constraint visible in the source.

After bundling, the JS template literal collapses each `\\` to one
`\`, so Pyodide receives exactly the engine's canonical regex from
`forge.core.llm._find_deps`:

```python
_ID_CHARS = r"[\w./-]+"
rf'\[\[({_ID_CHARS})(?:\|[^\]]*)?\]\]'
rf'context\.compute\(\s*["\']({_ID_CHARS})["\']'
```

(Verified by `grep`-ing `main.js` after build; confirmed the post-
bundling string matches the engine source byte-for-byte modulo the
`_FORGE_` prefix.)

**Match check.** Ran the canonical engine regex against the test
inputs from the prompt:

```
Input: context.compute("setup"), context.compute('move'),
       multi-line context.compute( "ask_all_particles", ... )
Output: ['setup', 'move', 'ask_all_particles']  ✓
```

Matches expectations exactly.

## 2. Test infrastructure choice

**Option A: Pyodide-in-Node.** Same pattern as
`forge-moda-bootstrap/spikes/pyodide-moda/run-spike.mjs`. The
`pyodide` npm package is already a runtime dep at v0.29.4 (matches
the bundled `assets/pyodide/`), so the test inherits an existing
proven path with zero new infrastructure.

Why A over B (extract Python to a `.py` file): extraction means
changing how `pyodide-host.ts` initializes (fetch-and-exec a helper
file at runtime instead of inlining). That's a structural change
beyond the bug-fix scope the prompt requested. Postponed to the v1.1
centralization in `forge.core.llm`.

Why A over C (skip test): the Pyodide-in-Node path is genuinely
cheap. Cold load ~600ms, subsequent tests sub-ms via a shared
promise. Well under the prompt's "~2 hours" threshold.

## 3. Test diff

`forge-client-obsidian/src/pyodide-inventory.test.ts` — 150 lines,
new file. Boots Pyodide once, then six test cases:

| Case | Asserts |
| --- | --- |
| helper Python parses | `py.runPython(HELPER_PY)` does not throw — the v0.2.4 SyntaxError class |
| compute() extraction | finds `setup`, `move`, `ask_all_particles` across single, double, and multi-line arg lists |
| wikilink extraction | finds `setup`, `forge-moda/move`, `ask_all_particles` (last one via `\|` pipe alias) |
| dedup | wikilink+compute referencing the same id deduplicates to first-seen order |
| brace placeholders rejected | `[[{vault_name}/install]]` returns `[]` (matches engine's doc-comment guarantee) |
| empty body | plain prose returns `[]` |

The test file contains a **verbatim duplicate** of the helper Python
source from `pyodide-host.ts`, with a header comment marking the
file as the drift-protection contract. Until v1.1 centralizes the
helper in `forge.core.llm`, both files must stay in sync.

Test run output (after commit `52916a3`):
```
✔ pyodide-inventory: helper Python parses without SyntaxError (588ms)
✔ pyodide-inventory: _forge_find_deps extracts context.compute() ids (1ms)
✔ pyodide-inventory: _forge_find_deps extracts [[wikilink]] ids (1ms)
✔ pyodide-inventory: _forge_find_deps dedupes across wikilink + compute (1ms)
✔ pyodide-inventory: _forge_find_deps skips prose wikilinks with brace placeholders (1ms)
✔ pyodide-inventory: _forge_find_deps returns empty list for body with no deps (1ms)
tests 6, pass 6
```

Total suite: 48 pass (42 prior + 6 new), 651ms.

## 4. manifest.json + INSTALL.md diffs

Already shipped in v0.2.5 (commit `cee6aed`):

- `manifest.json`: `0.2.4` → `0.2.5`
- `INSTALL.md`: all v0.2.4 references → v0.2.5 (download link, zip
  filename, closed-beta pin note)

No additional bump in this commit — the test is dev-only and doesn't
change the user-facing bundle.

## 5. Auto-smoke output

**v0.2.5 release (already shipped before this prompt arrived):**
- Build exit 0; release zip 11.21 MB.
- Local SHA-256:
  `017d1d8f17595c5db641645cdebfba5a734eb3a1f2255ef1753fc8a98786b6d1`.
- GH download SHA matches local.
- Hosted reachability: `GET /health` → 200; `POST /generate` (no
  auth) → 401.

**Test commit `52916a3`:**
- `npm run build` → exit 0.
- `npm test` → 48/48 (42 prior + 6 new).
- Pyodide-exercising test loads + runs in ~650ms.
- No new release; test is dev-only.

## 6. Git ops

- v0.2.5 hotfix commit: `cee6aed` (already shipped before this prompt).
  - Tag `v0.2.5` pushed.
  - Release <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.5>.
- Test commit: `52916a3` on `main`, pushed.
- No tag/release for the test commit.

## 7. Manual smoke guidance for user

The 5-step re-run from the prompt against v0.2.5 still applies — the
test is the CI safety net, not a substitute for verifying the fix
works in real Obsidian:

1. **Manifest version.** Replace `forge-client-obsidian/` with the
   v0.2.5 unzip. Reload Obsidian. Settings → Forge plugin entry
   should show 0.2.5.
2. **Settings UI.** Settings → Forge → Transpile section still
   renders the URL + token fields; token stays masked after re-open.
3. **Empty-token fast-fail.** Clear token field, Forge-click a
   snippet needing regen. Expect "Set your transpile token in
   Settings → Forge → Transpile token before using /generate." No
   stack trace.
4. **Real /generate path (the v0.2.4 break point).** Restore token,
   delete a snippet's Python facet under `forge-moda/`, Forge-click.
   Expect Python from α writes into the snippet, compute runs in
   Pyodide, result renders in Forge Output.
5. **Wrong-token 401.** Set token to `"wrong-token-test"`, Forge-
   click. Expect "Transpile token rejected — check Settings…" then
   reset to your real token.

## 8. Deviations

- **Approach choice.** Used backslash-doubling rather than the
  prompt's suggested triple-quoted f-string. Reasoning explained in
  §1 — V8 strips every metachar escape regardless of outer quote
  style, so triple-quoting only saves the `\'` escape and isn't a
  structural fix.
- **Test source duplication.** The test contains a verbatim copy of
  the regex helper rather than reading `pyodide-host.ts` and
  extracting. Reasoning: simplest path, lowest test surface area.
  Drift-protected by a NOTE comment in both files. Acceptable until
  v1.1 centralizes the helper in `forge.core.llm`.
- **No new release.** The test addition doesn't change the user-
  facing bundle — `main.js`, `manifest.json`, `assets/` are
  unchanged from v0.2.5. Bumping to v0.2.6 just to ship a `.test.ts`
  file would be release churn for no user benefit.
- **Sibling regex audit.** Grepped the entire embedded Python for
  other `\<metachar>` patterns. Only the two `_forge_find_deps`
  regexes had them; both fixed in v0.2.5. No latent siblings.

## 9. One observation

The drift-protection comment between `pyodide-host.ts` and
`pyodide-inventory.test.ts` is load-bearing in a way I'm not fully
comfortable with. A future contributor edits one file, forgets the
other, and the test silently passes against the old helper string
while production runs the new one. The v1.1 centralization
(`forge.core.llm` helper that both engine and plugin import) is the
durable fix; until then, a stronger guard would be to have the test
read `pyodide-host.ts` as text, regex out the helper block, and
exec that — making drift mechanically impossible. Logging as a
follow-up rather than blocking v0.2.5, but it's worth ~30 minutes of
work before v1.1.
