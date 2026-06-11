---
timestamp: 2026-06-11T10:00:00Z
session_id: drain-2026-06-11-1000
status: pending
priority: HIGH — v0.2.126 smoke FAILED; moda authoring still broken; cohort blocked
---

# v0.2.127 — Diagnostic build: moda branch re-transpile shipped but # Python still not updating

## §0 — Bug report

Driver smoke against v0.2.126 (the v0326 fix):

> "I changed the simulation English facet to print 'Tamar' and when forging it opened the simulation (version .126) python was not changed. Fail on Step 4."

What works in v0.2.126:
- Moda routing fires: simulation tab opens ✓
- Iframe runs and shows simulation
- No crashes

What's broken:
- `# Python` facet does NOT update after editing `# English` and Forge-clicking
- Simulation runs against the OLD Python (stale logic)

This is the EXACT bug v0.2.126 was supposed to fix. Either the v0.2.126 implementation has a defect OR the regen step is firing but its output isn't reaching `# Python` on disk.

The previous v0323 fix used pure-core extraction + reasoning about the expected behavior. This drain uses the diagnostic-first pattern (per v0.2.94 / v0.2.103 / v0.2.105 / v0.2.116 retrospectives): ship a diagnostic build, driver pastes console output, fix per evidence. Do NOT ship speculative second-guesses.

## §1 — Hypothesis matrix (each needs concrete evidence to discharge)

### §1.1 — H1: `dispatchModaBranch` not actually called

`forgeSnippet` routing dispatch could be broken — the `routing.kind === 'moda'` branch could be falling through to english-mode somehow. If so, the english-mode regen runs but doesn't write back via `writeCanonicalPythonBack` (because that path uses `runSnippet` differently).

Or `dispatchModaBranch` is called but throws silently before reaching `routeActionCodeRegen`.

### §1.2 — H2: `routeActionCodeRegen` returns cached code unchanged

The engine's `resolveActionCode` (`forge/core/executor.py:resolve_action_code`) per v0.2.121 semantics: when English mode + `english_hash` present and matches, returns cached `# Python`. If pre-flight sync didn't write the new English to MEMFS, the engine computes english_hash on stale English, gets a match against frontmatter's stored hash, returns cached Python.

The Notice "re-transpile failed (no-token / engine-error / http-error)" would NOT fire here — because regen technically succeeded (returned cached code). `writeCanonicalPythonBack` writes the SAME content back. Net effect: no visible change to `# Python`.

### §1.3 — H3: `writeCanonicalPythonBack` runs but doesn't update disk

The function might write to MEMFS / metadataCache but not to the actual file. Or it might write but Obsidian's render isn't refreshing.

### §1.4 — H4: `simulation.md` has `edit_mode: python` in frontmatter

If simulation.md was authored or auto-set with `edit_mode: python`, `decideForgeRouting` returns `python-mode` BEFORE the moda check. Python-mode skips regen entirely. The simulation tab opening AT ALL in this case would be a routing dispatch quirk worth investigating.

### §1.5 — H5: pre-flight sync (v0.2.102) writes to wrong path

The MEMFS path used by pre-flight sync might mismatch the path the engine reads from for `simulation.md`. Result: fresh English is in MEMFS but at the wrong key; engine reads stale content from the right key.

## §2 — Investigation phase (per §78 + diagnostic-first pattern)

### §2.1 — Verify frontmatter state

```bash
grep -E "^(type|featured|edit_mode|english_hash|facet_form|locked_english_hash):" \
  ~/forge-vaults/bluh/forge-moda/simulation.md
```

Driver pastes output. If `edit_mode: python` is present, H4 is the cause and the fix is routing-side. If absent, H1/H2/H3/H5 remain candidates.

### §2.2 — Add diagnostic logging to `dispatchModaBranch`

Add temporary `console.log` blocks marked `// v0.2.127 SPIKE — REMOVE AFTER`:

```typescript
private async dispatchModaBranch(view: MarkdownView): Promise<void> {
  console.log('[v0.2.127 spike] dispatchModaBranch entered for', view.file?.path);
  const snippetId = snippetIdFromPath(view.file.path, this.libraryDirNames());
  console.log('[v0.2.127 spike] snippetId resolved to:', snippetId);
  
  const deps = this.routingDeps();
  console.log('[v0.2.127 spike] routingDeps:', { hasToken: deps.hasToken });
  
  const regenResult = await routeActionCodeRegen(snippetId, deps);
  console.log('[v0.2.127 spike] regenResult:', {
    ok: regenResult.ok,
    via: regenResult.ok ? (regenResult as any).via : undefined,
    reason: !regenResult.ok ? regenResult.reason : undefined,
    codeLength: regenResult.ok ? (regenResult as any).code?.length : 0,
    codePreview: regenResult.ok ? (regenResult as any).code?.slice(0, 100) : null,
  });
  
  const outcome = decideModaDispatchOutcome(regenResult);
  console.log('[v0.2.127 spike] decision:', outcome.kind);
  
  if (outcome.kind === 'write-and-open') {
    console.log('[v0.2.127 spike] calling writeCanonicalPythonBack with code length:', outcome.code.length);
    try {
      await writeCanonicalPythonBack(this.app, view.file, outcome.code);
      console.log('[v0.2.127 spike] writeCanonicalPythonBack completed');
    } catch (e) {
      console.error('[v0.2.127 spike] writeCanonicalPythonBack threw:', e);
    }
  } else if (outcome.kind === 'notice-and-open') {
    console.log('[v0.2.127 spike] showing Notice:', outcome.notice);
    new Notice(outcome.notice, 5000);
  }
  
  console.log('[v0.2.127 spike] opening moda view');
  await this.openModaView();
  // ... rest unchanged ...
}
```

Also add a log before pre-flight sync in `forgeSnippet`:

```typescript
const freshContent = await this.app.vault.read(view.file);
console.log('[v0.2.127 spike] pre-flight sync read', freshContent.length, 'chars from', view.file.path);
console.log('[v0.2.127 spike] fresh English preview:', /* first 200 chars of # English section */);
await host.syncUserVaultFile(view.file.path, freshContent);
```

### §2.3 — Add engine-side diagnostic if possible

In the engine's `resolve_action_code` (`forge/core/executor.py`), add Python-side logging via `js.console.log` (the pattern used elsewhere in pyodide-host.ts):

```python
import js
js.console.log(f'[v0.2.127 engine] resolve_action_code called for snippet_id={snippet_id}')
js.console.log(f'[v0.2.127 engine] meta keys: {list(meta.keys()) if meta else None}')
js.console.log(f'[v0.2.127 engine] english_hash stored: {meta.get("english_hash") if meta else None}')
js.console.log(f'[v0.2.127 engine] computed english_hash: {compute_english_hash(english)}')
js.console.log(f'[v0.2.127 engine] edit_mode: {meta.get("edit_mode") if meta else None}')
js.console.log(f'[v0.2.127 engine] cache hit path? hash_match={stored_hash == computed_hash}')
```

This reveals whether engine cache logic is firing as expected, and which path it takes.

### §2.4 — Ship as v0.2.127-spike

NOT a fix release. Pure diagnostic. The version is bumped so BRAT picks it up; the commit message + INSTALL.md should explicitly say "DIAGNOSTIC BUILD — for forge-moda simulation re-transpile failure investigation. Will be replaced by v0.2.128 with the fix once cause is identified."

### §2.5 — Driver smoke for spike

1. Install v0.2.127 via BRAT
2. Open `~/forge-vaults/bluh/forge-moda/simulation.md`
3. Open DevTools (Cmd-Opt-I) → Console → filter on "v0.2.127"
4. Edit `# English` to add a distinctive line (e.g., `Print "Tamar v0127 test".`)
5. Save (Cmd-S)
6. Forge-click 🔥
7. Paste ALL `[v0.2.127 ...]` console lines (both `spike` and `engine` prefixes) back to forge-core in chat
8. Note any Notice that appears top-right of Obsidian

Forge-core analyzes the output + writes a fix prompt for v0.2.128.

## §3 — Fix policy (NO speculation in this drain)

This drain SHIPS DIAGNOSTIC BUILD ONLY. No fix attempts. Per the cc-prompt-queue.md HARD RULE codified at v0.2.116: when 3+ release cycles deep into a problem against the same surface, search prior art + add diagnostic instrumentation BEFORE attempting more mechanism changes.

v0.2.126 was attempt 1 (the substantive fix). v0.2.127 is the diagnostic instrumentation. v0.2.128 will be the targeted fix per the spike evidence.

Per the v0.2.85-89 retrospective + v0.2.94 / v0.2.103 / v0.2.105 diagnostic-first pattern: SHIP instrumentation. WAIT for cohort log. SHIP targeted fix.

## §4 — Open follow-ups

1. v0.2.128 (next): targeted fix per spike evidence
2. Remove all `[v0.2.127 spike]` and `[v0.2.127 engine]` logging in the v0.2.128 ship
3. forge-moda-bootstrap remote configuration is broken (points to forge-client-obsidian.git) — flagged by driver; separate cleanup, not blocking this drain

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates concrete evidence collection BEFORE fix attempts
- ✓ §76 (don't ship speculative fix): explicitly NO fix in this drain; diagnostic only
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.126; v0.2.127 is the diagnostic ship
- ✓ §321 (feedback file before move): standard
- ✓ NEW v0.2.116 prior-art rule: applied; this is the diagnostic phase
- ✓ NEW v0.2.120 console.error: any new catch blocks use console.error with method name
- ✓ NEW v0.2.124 pure-core dispatch extraction: pure-core unchanged; diagnostic adds I/O-layer logging only
- ✓ Diagnostic-first pattern (v0.2.94 / v0.2.103 / v0.2.105 / v0.2.116): applied

## §6 — Architectural framing

V1 cohort regression debug. v0.2.126 was the targeted fix; v0.2.127 is the diagnostic spike when the fix didn't take. v0.2.128 will be the actual fix per evidence.

The pattern is institutional: when a substantive fix doesn't crack the issue, the NEXT ship is diagnostic instrumentation. Not another speculative mechanism change.

No V2 architectural commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

Single drain. Suggested order:
1. §2.1 driver paste of simulation.md frontmatter (forge-core handles in chat — not part of CC's drain)
2. §2.2 add diagnostic logging to dispatchModaBranch + pre-flight sync
3. §2.3 add engine-side diagnostic to resolve_action_code (NOTE: engine commits go to ~/projects/forge/; CC sync'd to plugin bundle via npm run sync-engine-bundle)
4. §2.4 release v0.2.127 with DIAGNOSTIC BUILD label
5. Driver runs §2.5 smoke, pastes output

Estimated CC time: 30-60 min.

If §2.3 engine-side diagnostic can't easily reach `js.console.log` (e.g., the function isn't directly reachable from a Pyodide-runtime context), surface and ship plugin-side only — the dispatchModaBranch logs alone may be enough to discriminate H1/H2/H3 and discharge H4 via §2.1.
