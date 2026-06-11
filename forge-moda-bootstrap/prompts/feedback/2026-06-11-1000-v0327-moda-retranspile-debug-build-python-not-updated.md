---
prompt: 2026-06-11-1000-v0327-moda-retranspile-debug-build-python-not-updated.md
shipped_version: v0.2.127 (DIAGNOSTIC BUILD — no behavior change)
session: drain-2026-06-11-1000
date: 2026-06-11
status: shipped — awaiting driver console paste
---

# v0327 feedback — v0.2.127 diagnostic spike shipped

## §1 — What shipped

Per the v0327 §3 fix policy: **diagnostic instrumentation only, no fix attempts.** Targeted fix lands in v0.2.128 once the driver pastes the console output.

### §1.1 — Plugin-side spike logs (`main.ts`)

**`forgeSnippet` pre-flight sync** — captures whether the disk→MEMFS sync at the top of forgeSnippet actually fires + what it syncs:
- `pre-flight sync path:` (TFile.path)
- `pre-flight sync content length:` (vault.read result size)
- `pre-flight sync English preview:` (first 200 chars of `# English` section)
- `pre-flight sync to MEMFS COMPLETED` (or `SKIPPED: no host manager`)

**`dispatchModaBranch`** — captures the full v0.2.126 dispatch chain:
- `dispatchModaBranch ENTERED for` (path)
- `snippetId resolved:`
- `routingDeps hasToken:`
- `regenResult shape:` (ok / via / reason / codeLength / codePreview / message)
- `outcome kind:`
- `CALLING writeCanonicalPythonBack — note: this internally re-invokes host.resolveActionCode, so the engine result may DIFFER from the routeActionCodeRegen result above`
- `writeCanonicalPythonBack COMPLETED`
- `# Python on disk AFTER write-back preview:` (first 200 chars from disk readback)
- `showing Notice:` (if notice-and-open)
- `dispatchModaBranch COMPLETED`

**`writeCanonicalPythonBack`** — captures the SECOND `resolveActionCode` call that v0.2.126 introduced:
- `writeCanonicalPythonBack: 2ND resolveActionCode call for` (snippetId)
- `writeCanonicalPythonBack: 2ND call returned length: <N> preview: <120 chars>`
- `python null/empty, returning WITHOUT writing` (if the engine returned null)

### §1.2 — Engine-side spike logs (`forge/core/executor.py`)

Wrapped in `try/except ImportError` so cpython pytest doesn't fail on `import js`:
- `resolve_action_code entered for snippet_id=`
- `edit_mode=`
- `cached # Python present: <bool>; length=<N>`
- `cached # Python preview: <repr 120 chars>`
- `slot_resolutions is None: <bool>`
- `meta keys: <list>`
- `english_hash in frontmatter: <repr>`

Engine bundle synced via `npm run sync-engine-bundle`.

### §1.3 — Ship label

- `main` branch commit message labelled `v0.2.127 — DIAGNOSTIC BUILD`
- INSTALL.md sync also labelled "(DIAGNOSTIC BUILD — see release notes)"
- GH release notes can be updated by driver to add a "DIAGNOSTIC BUILD — install only to capture console output for v0327 spike. v0.2.128 will be the fix." banner — not done in this drain since `release.sh` auto-generates the GH release.

All spike log lines prefixed with either `[v0.2.127 spike]` (plugin) or `[v0.2.127 engine]` (engine) so the driver can grep-filter the console with a single needle.

### §1.4 — Bonus: cause I noticed during instrumentation (FOR FORGE-CORE, NOT SHIPPED AS FIX)

While reading `forge/core/executor.py:resolve_action_code` to instrument it, line 524-525 stood out:

```python
stored_hash = meta.get("english_hash")
if stored_hash is None:
  return code  # no invalidation contract; use cached Python
```

For canonical moda snippets like `simulation.md` that have no `english_hash` in frontmatter (which is the cohort state — driver confirmed in v0327 §0 that no migration has written english_hash to these files), the engine ALWAYS returns the cached `# Python` from the snippet body. No re-transpile. Edits to `# English` literally cannot propagate.

This matches v0327 §1.2 H2 exactly. The diagnostic spike will confirm it via the `[v0.2.127 engine] english_hash in frontmatter: None` log line.

Did NOT ship a fix per the prompt's §3 explicit "diagnostic only" policy. The targeted fix in v0.2.128 will likely be one of:
- (a) Engine: drop the `if stored_hash is None: return code` shortcut and always re-transpile for `english` mode snippets without an english_hash. Costs one E-- transpile per Forge-click but never returns stale.
- (b) Plugin: ensure `writeCanonicalPythonBack` writes `english_hash` on every call (it already does — uses `writePythonAndEnglishHash`), so the SECOND Forge-click would invalidate. But the FIRST Forge-click after edit would still be stale. Not great UX.
- (c) Plugin moda branch: bypass the engine's `resolve_action_code` cache entirely for moda snippets — pass a flag like `force_retranspile=True` or call the transpile function directly.

Forge-core (or the next driver prompt) chooses + scopes v0.2.128.

## §2 — Tests + release

- 695 unit tests passing (instrumentation only; no behavior change).
- Build clean.
- Tag `v0.2.127` pushed; GH release auto-created with assets.
- INSTALL.md synced (with DIAGNOSTIC label).
- Engine commit `5274905` in `~/projects/forge` pushed to its own remote.

## §3 — Per-protocol HARD RULE compliance

Per the prompt's §5 self-audit:

- ✓ §78 (investigation-before-design): diagnostic instrumentation IS the investigation; no design decisions made.
- ✓ §76 (don't ship speculative fix): NO FIX shipped. Engine and plugin behavior unchanged except for new log lines.
- ✓ NEW v0.2.116 prior-art rule: applied — this is the diagnostic phase before another mechanism attempt.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.126 → 0.2.127.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ NEW v0.2.120 `console.error` HARD RULE: new spike code uses `console.log` (intended diagnostic output); the existing `console.warn` in pre-flight sync catch is OUT OF SCOPE (separate carry-forward).
- ✓ NEW v0.2.124 pure-core dispatch extraction: pure-core unchanged; diagnostic adds I/O-layer logging only.
- ✓ Diagnostic-first pattern (v0.2.94 / v0.2.103 / v0.2.105 / v0.2.116): applied — this IS the diagnostic build.

## §4 — Driver smoke (§2.5 of prompt)

1. Install v0.2.127 via BRAT (Settings → BRAT → Check for updates).
2. Open `~/forge-vaults/bluh/forge-moda/simulation.md`.
3. Open DevTools (Cmd-Opt-I) → Console → filter on `v0.2.127`.
4. Edit `# English` to add a distinctive line, e.g. `Print "Tamar v0127 test".`
5. Save (Cmd-S).
6. Forge-click 🔥.
7. Paste ALL `[v0.2.127 ...]` console lines (both `spike` and `engine` prefixes) back to the next prompt.
8. Note any Notice that appears top-right of Obsidian.

Also for §2.1 (driver hand-paste):
```bash
grep -E "^(type|featured|edit_mode|english_hash|facet_form|locked_english_hash):" \
  ~/forge-vaults/bluh/forge-moda/simulation.md
```

The two outputs together discharge or confirm each H1-H5 hypothesis from the prompt.

## §5 — Open follow-ups

1. **v0.2.128 (next)**: targeted fix per spike evidence. The diagnostic logs go away in the same release.
2. **forge-moda-bootstrap remote configuration** flagged by driver in §4 #3 — separate cleanup, not blocking this drain.
3. **Bonus cause** in §1.4: if forge-core agrees with option (a) (drop the `stored_hash is None` shortcut), v0.2.128 lands as a 1-line engine change + spike removal. Conservative.
4. **Carry-forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
   - Harness Obsidian-shim build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error
   - English-mode `console.warn` at writeCanonicalPythonBack catch (v0326 carry-forward)

## §6 — Architectural framing

This is the institutional diagnostic-first pattern in action. v0.2.126 was the targeted fix attempt; v0.2.127 is the spike when the fix didn't take; v0.2.128 will be the actual fix per evidence. Not another speculative mechanism change.

The `import js / try / except ImportError` pattern for engine-side diagnostics is institutional — keeps cpython pytest green while Pyodide gets the logs.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.127 spike shipped + INSTALL.md synced + engine bundle synced + engine source committed to its own repo. Driver paste of `[v0.2.127 spike]` + `[v0.2.127 engine]` console lines + frontmatter grep → next prompt → v0.2.128 fix.
