---
timestamp: 2026-06-07T03:45:00Z
session_id: drain-2026-06-07-0200
prompt_modified: 2026-06-07T03:00:00Z
status: success
---

# v0.2.71 hotfix — slot-cache writeback MEMFS sync race

## §0 — Release coordinates

| Field | Before | After |
| --- | --- | --- |
| manifest.json | 0.2.70 | 0.2.71 |
| INSTALL.md pins | 5× 0.2.70 | 5× 0.2.71 |

| Field | Value |
| --- | --- |
| Hotfix commit | `762fdd9` |
| Release commit (empty) | `fbdf4d1` |
| Tag | `v0.2.71` |
| GH release URL | https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.71 |
| Release zip | `dist/forge-client-obsidian-v0.2.71.zip` (33.15 MB) |
| Zip SHA-256 | `1d2ce0f05e551dc7c40f909f5ed9911ba22fdb8b0f68b985fa0c66382388adf7` |
| Lines | `+176/-6` across 5 files (3 new, 2 modified) |

Version-bump sanity check (cc-prompt-queue.md §347): manifest.json was at 0.2.70 at drain start; bumped to 0.2.71 per placeholder. ✓

No forge-moda forge.toml bump — fix is plugin-only, no bundled vault content changed.

## §1 — TDD discipline (HARD RULE compliance — all 5 checkpoints)

### §1.1 — Test cases added pre-fix

5 cases in `src/post-write-memfs-sync-core.test.ts`:

1. `syncFileToMemfsAfterWrite: happy path — reads then syncs with fresh content`
2. `syncFileToMemfsAfterWrite: reader error propagates, syncer never called`
3. `syncFileToMemfsAfterWrite: syncer error propagates after successful read`
4. `syncFileToMemfsAfterWrite: empty content still triggers syncer call`
5. `syncFileToMemfsAfterWrite: filePath is faithfully forwarded to syncer`

### §1.2 — Verbatim pre-fix run output (failing)

Pre-fix the helper module didn't exist; running the test fails to import (new-feature-shape failing-first per cc-prompt-queue.md §125 — module-not-found error against not-yet-existent code validates nothing on its own, so this is the failing surface):

```
$ npx tsx --test src/post-write-memfs-sync-core.test.ts
ERR_MODULE_NOT_FOUND: Cannot find module './post-write-memfs-sync-core.ts'
```

The bug-fix surface is the WIRING in `handleSlotCacheMiss`. Pre-fix, that path looked like:

```typescript
// BEFORE — main.ts handleSlotCacheMiss (post-write):
await this.app.vault.process(file, (content) =>
  mergeSlotCacheUpdates(content, updates));

// <NO EXPLICIT MEMFS SYNC HERE>

console.log('Forge: slot cache write succeeded', { snippetId, count: responses.length });
return true;
```

Race: `vault.process` writes to disk; `vault.on('modify')` re-syncs MEMFS asynchronously; the immediate retry of `computeSnippet` runs `_forge_compute` against MEMFS BEFORE the handler completes; engine sees the pre-write body; re-raises `SlotCacheMissError`; defensive abort at the caller fires.

### §1.3 — The fix

Commit `762fdd9`. Two parts:

**New pure-core helper `src/post-write-memfs-sync-core.ts`:**

```typescript
export interface FileReader {
  readPath(path: string): Promise<string>;
}
export interface MemfsSyncer {
  syncFileToMemfs(relPath: string, content: string): Promise<void>;
}

export async function syncFileToMemfsAfterWrite(
  filePath: string,
  reader: FileReader,
  syncer: MemfsSyncer,
): Promise<void> {
  const freshContent = await reader.readPath(filePath);
  await syncer.syncFileToMemfs(filePath, freshContent);
}
```

**Wired into `src/main.ts` `handleSlotCacheMiss`:**

```typescript
// AFTER vault.process write succeeds:
try {
  const pyodideHost = getPyodideHost();
  if (pyodideHost) {
    const host = await pyodideHost.getInstance();
    await syncFileToMemfsAfterWrite(
      file.path,
      { readPath: (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) {
          return Promise.reject(new Error(`not a TFile: ${path}`));
        }
        return this.app.vault.read(f);
      } },
      { syncFileToMemfs: (relPath, content) =>
        host.syncUserVaultFile(relPath, content) },
    );
  }
} catch (e) {
  console.warn('Forge: post-write MEMFS sync failed before retry', e);
}

console.log('Forge: slot cache write succeeded', { snippetId, count: responses.length });
return true;
```

Defense-in-depth: the try/catch wrap means if `getPyodideHost()` returns null (init race during plugin startup) or `getInstance()` throws, the writeback returns success anyway and the retry's existing defensive abort surfaces the failure mode.

### §1.4 — Verbatim post-fix run output (passing)

```
$ npx tsx --test src/post-write-memfs-sync-core.test.ts
✔ syncFileToMemfsAfterWrite: happy path — reads then syncs with fresh content (0.799ms)
✔ syncFileToMemfsAfterWrite: reader error propagates, syncer never called (0.187083ms)
✔ syncFileToMemfsAfterWrite: syncer error propagates after successful read (0.068458ms)
✔ syncFileToMemfsAfterWrite: empty content still triggers syncer call (0.054542ms)
✔ syncFileToMemfsAfterWrite: filePath is faithfully forwarded to syncer (0.049541ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ duration_ms 125.882167
```

### §1.5 — Full-suite output post-fix

Plugin (`npm test`):

```
ℹ tests 482
ℹ suites 0
ℹ pass 482
ℹ fail 0
ℹ duration_ms 4661.905
```

482 = 477 (v0.2.70 baseline) + 5 new helper tests. No regressions.

Forge engine (`pytest -q`):

```
======================= 582 passed, 1 warning in 53.51s ========================
```

582/582 unchanged from prior drain — engine untouched.

## §2 — Investigation findings (opt-out per prompt §1)

The prompt opted out of investigation-first ("the cause is X, just apply fix Y") per cc-prompt-queue.md §80. CC verified the prompt's line citations against the actual source:

- ✓ `src/main.ts:1495-1532` — v0.2.19 preflight pattern. Confirmed: read fresh disk content + `host.syncUserVaultFile(file.path, freshContent)` synchronously before `host.preflightThenInventory(snippetId)`. Canonical fix shape mirrored at the new site.
- ✓ `src/pyodide-host.ts:1069` — `syncUserVaultFile(relPath, content)` JS method exists. Infrastructure already in place; the fix just reuses it.
- ✓ `src/pyodide-host.ts:604` — `_forge_sync_user_file(relpath, new_body)` Python helper exists.
- ✓ `src/main.ts:handleSlotCacheMiss` — confirmed bug site: `await this.app.vault.process(file, ...)` then `return true` with no MEMFS sync between.

The prompt's diagnosis was accurate. No divergence; fix follows the prompt's exact recipe.

## §3 — User-side smoke checklist

**Pre-conditions:**
- Terminal open, cwd `~/projects/forge-client-obsidian`.
- Obsidian closed (quit completely with `Cmd+Q` if open — NOT `Cmd+W` which only closes the window).
- forge-transpile redeployed and live with the `/resolve-slot` endpoint (per v0.2.70's redeploy recipe via `~/projects/forge-transpile/redeploy_backed.sh`).
- Transpile token configured in Settings → Forge → Transpile token.
- Test vault at `~/forge-vaults/bluh/` (or equivalent) with the bundled forge-moda already extracted.

### Step 1 — Install v0.2.71 (bug-fix reproduction).

In Terminal:

```
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
```

Expected: `Installed forge-client-obsidian v0.2.71 at: /Users/odedfuhrmann/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian`.

Open the vault. Open Developer Tools with `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows).

If `~/forge-vaults/bluh/forge-moda/slot_demo.md` already has a `# Slots` heading from a prior v0.2.70 session, delete it first to force the fresh resolution path:

```
grep -A 10 "^# Slots" ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

If anything prints, hand-delete the `# Slots` heading and YAML block from the file in Obsidian and Save.

Forge-click `forge-moda/slot_demo.md` (Cmd+P → "Forge: Run" or the ribbon icon).

Expected console sequence:
- `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }`
- `Forge: slot cache write succeeded { snippetId: 'forge-moda/slot_demo', count: 1 }`
- **NO** `Forge: slot resolution retry STILL surfaces cache miss; aborting` line — this is the v0.2.70 regression canary being fixed.
- **NO** `computeSnippetWithArgs @ ...:128669` stack trace fragment — this is the v0.2.70 user-facing error.

Output panel: a friendly greeting like `Hello, dear reader!` (the exact string is the resolved python_expr — content may vary per LLM run but will always be a single string literal matching the storybook prompt style).

Quick interpretation:
- Greeting renders in the Output panel → the hotfix is live.
- `STILL surfaces cache miss` log line appears → fix didn't take. Verify shipped main.js has the new helper:
  ```
  grep -c "syncFileToMemfsAfterWrite\|post-write-memfs-sync" ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/main.js
  ```
  Expected: `3` (helper definition + 2 callsites). If less, the v0.2.71 install didn't land cleanly.

### Step 2 — Idempotency (cache hit on second click).

Forge-click `slot_demo.md` again. Expected: NO `slot cache miss` log this time (cache hit; engine reads the now-populated `# Slots` heading). Output panel: same greeting as Step 1 (deterministic via cache; no LLM call).

In Terminal:

```
grep -c '"' ~/forge-vaults/bluh/forge-moda/slot_demo.md
```

Expected: still has the same one `# Slots` entry — count of quoted strings should match the post-Step-1 number (no churn on second click).

### Step 3 — Slot edit invalidation.

Open `~/forge-vaults/bluh/forge-moda/slot_demo.md` in Obsidian. Change the English-facet slot text — replace `a friendly hello message in the style of a children's storybook` with something distinct, e.g. `a formal hello message in the style of a Victorian letter`. Save.

Forge-click. Expected console:
- NEW `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }` — the new slot text hashes to a different cache_key.
- `Forge: slot cache write succeeded`.
- NO `STILL surfaces cache miss` line.
- Output panel: a new greeting matching the new style (e.g. `Good day to you, esteemed reader!`).

The `# Slots` heading now contains both the original and new cache entries (Phase 2 doesn't auto-prune orphaned keys; see Follow-ups).

### Failure modes to watch for

- **Step 1 Output panel shows `Forge chips: click into an action snippet first` or no greeting at all** → the Forge run gesture didn't reach the canonical compile path; check the active file is `slot_demo.md` with `facet_form: canonical` in frontmatter.
- **Step 1 console shows the v0.2.70 regression canary** `Forge: slot resolution retry STILL surfaces cache miss; aborting` → the hotfix didn't take. Check `grep -c "syncFileToMemfsAfterWrite" ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/main.js` returns ≥ 1; if 0, re-run install-latest.sh.
- **Step 1 console shows `Forge: post-write MEMFS sync failed before retry`** + downstream `STILL surfaces cache miss` → the defensive try/catch swallowed an unexpected error AND the retry still raced. Capture the warn body for diagnosis.
- **Step 1 Output panel renders `None`** (the SlotCacheMissError sentinel leak) → the resolver's miss-sentinel reached the executor. Indicates the retry path executed against stale MEMFS with the resolved Python NOT spliced in. The fix did not cover this scenario; flag.
- **Step 1 returns 401 from /resolve-slot** → transpile token expired or not configured. Settings → Forge → Transpile token.
- **Step 1 returns 404 from /resolve-slot** → forge-transpile hasn't been redeployed with the v0.2.70 endpoint changes. Run `~/projects/forge-transpile/redeploy_backed.sh`.
- **Step 2 shows another cache miss** → cache write didn't persist to disk. Check `git status` in the vault to see if `slot_demo.md` is dirty; if not, `vault.process` errored silently.
- **Step 3 console: only `slot resolution succeeded` no new cache miss** → cache key incorrectly stable across slot text edits. Confirm the editor saved the change (Cmd+S explicitly) and that the new text actually differs.

### End-state cleanup

If you want a fully clean state for re-smoke, hand-delete the `# Slots` heading from `slot_demo.md` in Obsidian. The auto re-extract logic doesn't trigger because `forge-moda/forge.toml` didn't bump in this hotfix release.

## §4 — Auto-smoke results

**Auto-verified by CC:**

- `npm run build` exit 0 (asset footprint 37.96 MB).
- `npm test` → 482/482 plugin tests pass (was 477 + 5 new).
- `pytest -q` on forge → 582/582 unchanged.
- `scripts/release.sh 0.2.71` ran cleanly — drift check passed, zip built at 33.15 MB, tag pushed, GH release published.
- `install-latest.sh` round-trip into `~/forge-vaults/bluh/` succeeded; manifest pinned to 0.2.71.
- Shipped main.js contains the new helper: `grep -c "syncFileToMemfsAfterWrite\|post-write-memfs-sync" main.js` → 3.

**Deferred to user (Obsidian + LLM-context):**

- Step 1 reproduction in Obsidian against the live forge-transpile `/resolve-slot` endpoint.
- Step 2-3 cache-hit / cache-invalidation verification.
- Live MEMFS sync timing across the vault.on('modify') boundary — CC tested the helper but the actual Pyodide MEMFS state can only be observed in Obsidian's Electron context.

## §5 — Follow-ups noted but not built

1. **`# Slots` heading legibility** — per the prompt §6 pointer to forge-doc's §8 #6 flag. The current YAML shape (`"<64-char-hex>": "<python_expr>"`) is correct but hard to read; future drains may explore a sidecar `# Slot Source` heading mapping cache_key → slot_text for human review, OR move the YAML to a comment-style format. Out of scope for this hotfix.
2. **Orphaned cache row pruning** — Step 3 leaves the OLD cache key in the file. Phase 3 candidate for auto-pruning on save.
3. **Plugin-level integration test for the full miss → resolve → retry loop** — the helper-level test covers the new sync surface; the end-to-end orchestration (`handleSlotCacheMiss` → retry → success) still has no automated coverage. Phase 3 candidate; would require Pyodide harness setup.
