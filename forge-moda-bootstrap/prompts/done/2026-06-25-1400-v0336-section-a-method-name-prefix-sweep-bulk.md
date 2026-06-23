---
timestamp: 2026-06-25T14:00:00Z
session_id: drain-2026-06-25-1400
status: pending
priority: MEDIUM — carry-forward from v0.2.134's polish split per §11 NOTE
---

# v0.2.136 — Section A bulk sweep: method-name prefix work for ~28 console.error sites

## §0 — Origin

Continuation of v0.2.133 (shipped as v0.2.134) per its §10. The polish bundle split at drain time: Sections B+C+D+E shipped as v0.2.134; Section A (method-name prefix sweep) was deferred because the ~28-site mechanical pass would have bloated the diff past reviewability.

This drain is purely Section A. No new audit-class work; just per-site message-text precision per the v0.2.120 console.error HARD RULE.

## §1 — Scope

For each enumerated catch block: read 10-20 lines of context, identify the lexically-enclosing function/method (walk up from inline lambdas to the outer named factory/method per v0.2.130 §2.4), and prefix the existing error message with `<methodName>: `.

Mechanical/precision work — no behavior change. Verification: every error message should be greppable by method name.

## §2 — Site enumeration (from v0.2.134 §10, with driver-flagged L2678 already-done excluded)

### §2.1 — welcome.ts (4 sites)
- L275 `legacy .bak sweep failed` → `runFirstRunCheck: legacy .bak sweep failed`
- L308 `rmdir ${targetDir} failed` → `deleteExtractedDir: rmdir ${targetDir} failed`
- L339 `failed to sweep ${folder}` → `sweepLegacyBakDirs: failed to sweep ${folder}`
- L343 `vault root list failed during .bak sweep` → `sweepLegacyBakDirs: vault root list failed`

### §2.2 — edges.ts (1 site)
- L96 `failed to read snapshot ${file}` → `walkSnapshots: failed to read snapshot ${file}`

### §2.3 — facet-mutex-view-plugin.ts (3 sites)
- L57, L142, L274: all inside `makeFacetMutexViewPlugin` (factory + inline lambdas). Prefix as `facet-mutex view-plugin: ...` per v0.2.130 §2.4 outer-method rule.

### §2.4 — forge-action.ts (3 sites)
- L530 — context: `openForgeAction`. Prefix: `openForgeAction: ...`
- L677 — context: `runDomainActivationAction`. Prefix: `runDomainActivationAction: ...`
- L712 — context: `listLibrary`. Prefix: `listLibrary: ...`

### §2.5 — modal.ts (2 sites)
- L388, L444 `could not open newly created snippet`: confirm outer method via grep + read context. Prefix per actual method name.

### §2.6 — main.ts (~14 sites; L2678 already-done in v0.2.134)
- L579 (modify handler)
- L1271 (sanitize handler)
- L1296 (New Snippet connect)
- L1347 (domain registration)
- L1768 (pre-flight sync)
- L1987 (generate pre-flight)
- L2137 (post-write MEMFS sync)
- L2153 (frontmatter reconcile)
- L2176 (sync_dependencies)
- L2225 (canonical write MEMFS)
- L2474 (data preview)
- L2634 (post-install refresh)
- L2779 (cache write)
- L2798 (Python hash write)
- L2817 (post-write MEMFS)

NOTE: line numbers shifted slightly between the v0.2.133 enumeration and current main.ts state. Use a fresh `grep -n 'console\.error' src/main.ts` to map. The driver-flagged L2678 from v0.2.134 was the `Forge Compute non-2xx` site (already prefixed `runSnippet:`); exclude from this pass.

### §2.7 — output-view.ts (2 sites)
- L211 `could not open new data snippet`: identify outer method.
- L384 `MIDI player init failed`: identify outer method.

### §2.8 — pyodide-host.ts (1 site)
- L387 `could not read forge.toml from user vault`: identify outer method.

Total: ~28 sites.

## §3 — Investigation rule per site

For each site (mechanical-but-precise):
1. Read 10-20 lines of context around the catch block.
2. Identify the lexically-enclosing function/method. If it's an inline lambda, walk up to the outer named factory/method per v0.2.130 §2.4.
3. Replace the message body to include `<methodName>: <existing message>` prefix.
4. Verify the catch already uses `console.error` (v0.2.130 + v0.2.134 should have covered log-level for all sites — if any are still `console.warn`, fix in same edit).

## §4 — Bulk verification

After the pass:

```bash
grep -rn "console\.error" src/ --include="*.ts" | grep -v "\.test\.ts" | wc -l
# Should match v0.2.130's baseline of 73 (+ any new catch blocks added since).
```

```bash
# Spot-check 5 random sites for the prefix pattern.
# Each catch's error message should begin with a method-name (or factory-name) prefix.
```

```bash
# Sanity: no remaining catch-block console.warn.
grep -B1 "console\.warn(.*,\s*e\s*)" src/ -rn --include="*.ts" | grep -v "\.test\.ts"
# Should return empty.
```

## §5 — Tests required

No new tests. Mechanical message-text change; existing tests unaffected. Plugin suite stays at 697.

## §6 — User-side smoke

After ship:

```
# Trigger any fail path (e.g. temporarily break hello_world's English with }}}}}).
# Forge-click.
# Open DevTools console.
# Each red error line should begin with a method-name prefix that lets you grep src/ and find the catch block.
```

Light smoke; primary value is institutional (future debugging is faster) not user-visible UX.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): each site reads context before edit.
- ✓ §76 (don't ship speculative fix): every change is mechanical per v0.2.120 rule.
- ✓ §347 (version-bump sanity check): release.sh bumps to v0.2.136.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: THIS IS the prefix part of the rule. Completes the v0.2.130 + v0.2.134 work.
- ✓ release.sh inlined-version preflight (v0.2.134 §5): auto-applies; v0.2.136 main.js must carry the inlined version.

## §8 — Open follow-ups + carry-forward survivors

Unchanged after this drain:
- v0.2.99 follow-up #14 (migrate inert facet_form fields)
- moda bridge pytest (deferred indefinitely)
- forge-tutorial `_meta/_chips.md` v3 parse error → covered by v0.2.137 (was v0.2.136) small-bugs bundle
- v0.2.119 persistent expanded-state (feature backlog)
- v0.2.122 granular toggle commands (feature backlog)
- Harness Obsidian-shim build (deferred indefinitely)
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback)

Queue after this drain: v0.2.137 (was v0.2.136) small-bugs bundle (basename audit + chip indent + tutorial chips parse).

## §9 — Architectural framing

V1 institutional hygiene completion. Closes the v0.2.120 console.error HARD RULE end-to-end: log-level (v0.2.130) + selected method-name prefixes (v0.2.134) + bulk method-name prefixes (this drain). After this, the HARD RULE is fully retroactively applied across the existing codebase; future enforcement is per-PR.

No V2 commitments. No behavior change. Just precision.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §10 — Hand-off

Single mechanical pass across 8 files, ~28 sites. Estimated CC time: 45-60 min. No splittable subsections — the value is in the consistency of the sweep.

If a site's outer method is ambiguous (e.g. nested factories), use the outermost named function and add a paren-qualifier (e.g. `makeFacetMutexViewPlugin (inline tx handler): ...`).
