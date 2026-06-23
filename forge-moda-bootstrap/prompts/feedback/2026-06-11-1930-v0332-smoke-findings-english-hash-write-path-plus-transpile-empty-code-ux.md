---
prompt: 2026-06-11-1930-v0332-smoke-findings-english-hash-write-path-plus-transpile-empty-code-ux.md
shipped_version: v0.2.132
session: drain-2026-06-11-1930
date: 2026-06-11
status: shipped — awaiting cohort smoke
---

# v0332 feedback — smoke findings bundle: english_hash unified write + empty-code clear error

## §1 — Root cause of Issue 1 (english_hash missing on moda branch)

The audit-vs-runtime gap surfaced by the prompt's §0.1 traced to a different write path than the one v0.2.128's audit checked:

- **What v0.2.128 audited**: `writeCanonicalPythonBack` calls `writePythonAndEnglishHash` → both `# Python` AND `english_hash` written. ✓ true.
- **What actually fires in the moda /generate fallback**: `writeGeneratedCode` (called inside the `routingDeps.generate` lambda) calls `replaceOrInsertPythonHeading` ONLY — `english_hash` NOT written.
- **Why writeCanonicalPythonBack doesn't compensate**: `decideModaDispatchOutcome` maps `via='generate'` to `{kind: 'open'}`, which SKIPS `writeCanonicalPythonBack` in `dispatchModaBranch`. The `'open'` outcome assumed "generate() already wrote Python" — true for the python, but the hash was never on its agenda.

So the moda branch's `english_hash` was only stamped when `via='e--'`. For canonical moda snippets like `simulation.md`, this normally works — but the driver's Tamar-edit-English smoke either fell through to `/generate` OR hit a force-flag interaction that bypassed the write.

Verified the write contract is fixable in pure-core: ran `writePythonAndEnglishHash` against the actual `~/forge-vaults/bluh/forge-moda/simulation.md` body via a one-off node script — the helper correctly inserts `english_hash: <hash>` right before the closing `---` of the multi-line YAML frontmatter (which has `generation_notes: |` block scalar — `findFrontmatterBounds` handles it correctly).

## §2 — What shipped (v0.2.132)

### §2.1 — Issue 1 fix: `writeGeneratedCode` unified write contract

`main.ts:writeGeneratedCode` swapped from `replaceOrInsertPythonHeading` → `writePythonAndEnglishHash`. Now computes `englishHash` from the body's `# English` section via `computeEnglishHash` (the byte-for-byte mirror of `compute_english_hash` in `forge/core/slot_cache.py`), and writes BOTH `# Python` AND `english_hash` in one idempotent call.

Net effect: **every Python write path on the plugin stamps english_hash**.
- E-- success → `writeCanonicalPythonBack` → already wrote both ✓
- /generate success on moda → `writeGeneratedCode` → now writes both ✓
- /generate success on english-mode → `writeGeneratedCode` → now writes both ✓ (bonus fix beyond moda scope)

Retired the direct `replaceOrInsertPythonHeading` import in `main.ts` (still lives in `python-cache-writer-core` as an internal helper consumed by `writePythonAndEnglishHash`).

### §2.2 — Issue 2 fix: engine raises SnippetExecError on empty/None code

`forge/core/executor.py:exec_python` guards at the top — if `code` is `None`, non-string, or whitespace-only, raises `SnippetExecError` with a user-friendly message naming the snippet and pointing at likely causes ("transpilation failed — check the English facet for syntax errors (E-- requires structured phrasing like `Print "hello".`)"). Reuses the existing `SnippetExecError` type the plugin already catches.

Replaces the opaque `TypeError: compile() arg 1 must be a string, bytes or AST object` cohort UX with a typed engine error per the established `SlotCacheMissError` idiom.

### §2.3 — Tests

3 new pytest tests in `tests/core/test_executor.py`:
1. Empty string code → SnippetExecError with snippet_id + remedy text
2. None code → same guard
3. Whitespace-only code → same guard

Plugin suite: 697 still passing (unchanged — Issue 1 fix is internal write-path swap, exercised through existing writePythonAndEnglishHash tests).

### §2.4 — Deviation from prompt: engine `TranspileError` not added

Prompt §3.3 proposed adding a new `TranspileError` class in `forge/core/errors.py` and raising it from `resolve_action_code`. I went with reusing the existing `SnippetExecError` at the `exec_python` boundary instead because:
- The empty-code shape isn't strictly a transpile failure — it's an "empty Python facet reached compile()" failure, which can also happen for hand-authored snippets with no `# Python` heading.
- Guarding at `exec_python` catches both the transpile-failure path AND the missing-heading path with one check.
- Avoids the API surface bump (no new error class to plumb through the JS bridge / catch sites).

If forge-core prefers the typed `TranspileError` shape, it's a small follow-up: rename `SnippetExecError` → `TranspileError` in the new raise path + add to the JS catch. Flagged in §4 follow-ups.

## §3 — Tests + release

- 697 plugin tests passing (unchanged).
- 3 new engine pytest tests (empty/None/whitespace).
- Build clean.
- Tag `v0.2.132` + GH release with `dist/forge-client-obsidian-v0.2.132.zip` + main.js + manifest.json + styles.css.
- INSTALL.md synced.
- Engine commit `fc492c8` in `~/projects/forge` pushed.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): traced both write paths in main.ts + the engine compile() path BEFORE coding. Caught the audit-vs-runtime gap via a node script that ran writePythonAndEnglishHash on the actual simulation.md.
- ✓ §57–74 (TDD): 3 failing-first engine pytest tests for Issue 2.
- ✓ §86–118 (pure-core convention): Issue 1 fix routes through existing `writePythonAndEnglishHash` + `computeEnglishHash` pure-cores. Issue 2 fix is a guard at the engine entry point, no new pure-core.
- ✓ §76 (don't ship speculative fix): both fixes targeted at concrete driver smoke findings.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.131 → 0.2.132.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ v0.2.120 console.error HARD RULE: no new catch blocks in this drain; existing catch paths unchanged.
- ✓ v0.2.124 pure-core dispatch HARD RULE: Issue 1 routes through existing pure-cores; no new dispatch logic added.

## §5 — Open follow-ups (per prompt §6 + observed)

1. **`main.ts:131883` `Forge Compute non-2xx` site** — bundled with v0.2.133 method-name-prefix sweep (v0333 prompt, queued next).
2. **Forge-moda content one-shot backfill** — bulk migration script that walks `~/forge-vaults/<vault>/forge-moda/*.md` and computes english_hash for any snippet missing it. Out of scope. Carry-forward.
3. **Retroactive correction to v0.2.128 feedback** — the "Confirmed via `python-cache-writer-core.ts:71,78`" claim was source-level correct for `writeCanonicalPythonBack` but missed the `writeGeneratedCode` parallel write path. Cc-prompt-queue.md could codify "runtime smoke beats source audit when paths diverge" as an institutional reminder. Flagged for forge-core.
4. **Optional `TranspileError` typed class** per prompt §3.3 — if forge-core prefers, rename the new exec_python guard's raise to use a dedicated `TranspileError`. Mechanical follow-up.
5. **Carry-forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
   - Harness Obsidian-shim build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error

## §6 — User-side smoke (deferred to driver)

Per §5 of prompt:
1. Edit `forge-moda/simulation.md` English to add a unique line → Forge-click → `grep 'english_hash' .../simulation.md` → expect 64-char hex line present.
2. Mangle `hello_world.md` English with `}}}}}` → Forge-click → expect Notice "Forge: Empty or missing Python code for 'forge-tutorial/01-hello/hello_world'. This usually means transpilation failed — check the English facet for syntax errors..."; NO opaque `TypeError: compile()` in console.

## §7 — Architectural framing

V1 cohort regression closures + write-contract unification. The `english_hash` parity across write paths is the load-bearing invariant for B7.3's cache-validity contract; v0.2.132 brings the /generate path in line with the E-- path so the engine's cache logic works regardless of which transpile route the snippet took. Reduces the surface area for "force flag retirement" — once all snippets have english_hash, the v0.2.128 moda branch's `force: true` becomes redundant per the V2 trajectory.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

v0.2.132 ships the smoke-findings bundle. Driver re-runs Steps 7 + 9 of the 2026-06-11-1900 smoke to validate. Queue still has v0333 (large polish — method-name prefix + dead code + release preflight) for the next drain.
