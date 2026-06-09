# v0.2.71 hotfix — slot-cache writeback MEMFS sync race

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder convention — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.70 → 0.2.71`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; if not at 0.2.70, pause and flag.

## §0 — Why this prompt exists

v0.2.70 shipped slot resolution end-to-end but the plugin orchestration race-loses to the Pyodide MEMFS staleness pattern that v0.2.17/v0.2.19 already solved in a different context. Reproduction confirmed by driver-side smoke at v0.2.70 against `~/projects/forge-music/forge-moda/slot_demo.md`:

1. First Forge-click → engine raises `SlotCacheMissError` → plugin writes `# Slots` heading to disk via `vault.process` → console: `slot cache write succeeded`.
2. Plugin retries `computeSnippet` immediately → engine reads MEMFS at `/bundle/user-vault/forge-moda/slot_demo.md` → MEMFS still has the OLD body (no `# Slots`) because `vault.on('modify')` is async and races behind the retry → engine re-raises `SlotCacheMissError`.
3. Plugin retry block at `~/projects/forge-client-obsidian/src/main.ts:1998-2014` hits the defensive abort: `console.error('Forge: slot resolution retry STILL surfaces cache miss; aborting')`.
4. Output panel never renders the resolved greeting; user sees aborted state.

Driver verified hash agreement + parser correctness end-to-end against the verbatim on-disk `# Slots` body — hash matches `f1496e3ce3133aec0f1b5249c8f93690330094e83ce98e6564624743f7b43513` for `(slot_text, "forge-moda/slot_demo")`, engine's `parse_slots_section` correctly extracts the cached entry. Root cause is NOT hash/parser; it's MEMFS staleness on the retry.

This same race shape was solved at v0.2.17 (`_forge_sync_user_file` Python helper + `syncUserVaultFile` JS method) for the `/generate` flow, and the v0.2.19 preflight pattern at `main.ts:1502-1532` is the canonical fix shape — read fresh disk content + sync to MEMFS synchronously before any operation that depends on MEMFS being current. Phase 2's plugin orchestration missed the reuse.

This hotfix wires the existing sync infrastructure into `handleSlotCacheMiss` so retries see fresh MEMFS.

## §1 — Investigation phase (skipped — root cause already confirmed)

Per cc-prompt-queue.md §80 ("override: the cowork-side prompt can explicitly opt out with phrases like 'the cause is X, just apply fix Y'") — this prompt opts out of investigation-first. Root cause is confirmed by driver-side reproduction + line citations:

- `~/projects/forge-client-obsidian/src/pyodide-host.ts:308` — `_init()` mounts user-vault files into MEMFS via `pyodide.FS.writeFile`. Engine reads from this snapshot.
- `~/projects/forge-client-obsidian/src/main.ts:443` — `vault.on('modify')` handler that asynchronously re-syncs MEMFS. Races with fast back-to-back operations.
- `~/projects/forge-client-obsidian/src/main.ts:1502-1532` — v0.2.19 preflight pattern: read fresh disk content + `host.syncUserVaultFile(file.path, freshContent)` synchronously, THEN call the operation that depends on MEMFS. Canonical fix shape.
- `~/projects/forge-client-obsidian/src/pyodide-host.ts:1067` — `syncUserVaultFile(relPath, content)` JS method that writes MEMFS + refreshes SnippetRegistry. Infrastructure already exists.
- `~/projects/forge-client-obsidian/src/pyodide-host.ts:604` — `_forge_sync_user_file(relpath, new_body)` Python helper.
- `~/projects/forge-client-obsidian/src/main.ts:2143` — `handleSlotCacheMiss` writes via `vault.process` then `return true` without explicit MEMFS sync. **THIS IS THE BUG SITE.**

CC: verify these citations by reading the cited lines; if any are off, surface in §2 of feedback and adjust. The fix shape doesn't change regardless of small line-number drift.

## §2 — Fix (TDD per cc-prompt-queue.md §57-118)

### §2.1 — TDD step 1: failing test first

Two options for test placement; CC picks based on what makes the production code path reachable.

**Option A (preferred — pure-core extraction)**: extract the "post-write MEMFS sync sequence" into a pure-core helper `~/projects/forge-client-obsidian/src/post-write-memfs-sync-core.ts`. The helper takes a stub adapter for reading the file + a stub syncer; asserts the syncer was called with the fresh content. Pure-core extraction #N (next available number).

Helper signature suggestion:

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

Test file `~/projects/forge-client-obsidian/src/post-write-memfs-sync-core.test.ts`:

1. **Happy path** — reader returns content, syncer called with `(filePath, content)`.
2. **Reader error propagates** — reader throws, syncer NOT called, error propagates.
3. **Syncer error propagates** — reader succeeds, syncer throws, error propagates.
4. **Empty content** — reader returns empty string, syncer still called.
5. **Path matters** — distinct `filePath` arguments produce distinct syncer calls (verify the path is faithfully forwarded).

**Option B (integration test)**: write a plugin-level test that stubs `app.vault.process` + `pyodideHost.syncUserVaultFile` and exercises `handleSlotCacheMiss` directly. Requires more harness setup; valid if Option A's extraction feels artificial.

CC's call — pick whichever has cleaner test ergonomics. If Option A, the fix at the production call site becomes a 2-line invocation of the helper; if Option B, the fix is inline at `handleSlotCacheMiss`.

### §2.2 — TDD step 2: run test, confirm fails

`npx tsx --test src/post-write-memfs-sync-core.test.ts` (or equivalent for Option B). Capture verbatim output for §1.2 of feedback.

### §2.3 — TDD step 3: implement the fix

**At the bug site** — `~/projects/forge-client-obsidian/src/main.ts` in `handleSlotCacheMiss`, after the `vault.process` write succeeds and BEFORE `return true`:

```typescript
await this.app.vault.process(file, (content) =>
  mergeSlotCacheUpdates(content, updates));

// v0.2.71 hotfix: explicit MEMFS sync after vault.process write.
// Mirrors v0.2.19's preflight pattern at main.ts:1502 — closes the
// vault.on('modify') race so the immediate retry sees the updated
// body. Without this, retry reads stale MEMFS and surfaces the same
// cache miss, hitting the defensive abort at main.ts:2007.
try {
  const pyodideHost = getPyodideHost();
  if (pyodideHost) {
    const host = await pyodideHost.getInstance();
    const freshContent = await this.app.vault.read(file);
    await host.syncUserVaultFile(file.path, freshContent);
  }
} catch (e) {
  console.warn('Forge: post-write MEMFS sync failed before retry', e);
  // Don't fail the writeback — the retry will surface the staleness
  // explicitly via the defensive abort if MEMFS doesn't catch up via
  // the async vault.on('modify') handler. Worst case is the same
  // user-visible state as before this hotfix; best case is the retry
  // wins anyway.
}

console.log('Forge: slot cache write succeeded', { snippetId, count: responses.length });
return true;
```

Note the defensive try/catch: if `getPyodideHost()` returns null (init race during plugin startup) or `getInstance()` throws, log + continue. The retry's defensive abort at main.ts:2007 catches the failure mode if MEMFS truly didn't catch up.

If Option A's helper landed: replace the try/catch contents with `syncFileToMemfsAfterWrite(file.path, this.adapterReader(), this.hostSyncer())` adapter pattern — CC's call on the cleanest plumbing.

### §2.4 — TDD step 4: re-run, confirm passes

Re-run the test from §2.1. Capture verbatim output. All cases pass.

### §2.5 — TDD step 5: full suite

`cd ~/projects/forge-client-obsidian && npm test`. Confirm no regressions. Capture pass count.

Expected: 477 (v0.2.70 baseline) + new helper tests.

Also `pytest -q` in `~/projects/forge/` to confirm engine suite still green (577).

## §3 — Release ship

Per cc-prompt-queue.md §339 (default-on git ops):

1. Bump `~/projects/forge-client-obsidian/manifest.json` per placeholder.
2. NO `~/projects/forge-moda/forge.toml` bump (no bundled-vault content change; the fix is plugin-only).
3. `scripts/release.sh` per current automation. Should be sixteenth consecutive clean run.
4. Tag pushed, GH release published, zip SHA reported.

No forge-transpile redeploy needed — server-side unchanged.

## §4 — User-side smoke checklist (CC writes post-implementation)

CC writes after the fix lands and auto-smoke green. Pre-spec'd Step 1 per cc-prompt-queue.md §187 (bug-fix reproduction):

**Pre-conditions:**
- Terminal open, cwd `~/projects/forge-client-obsidian`.
- Obsidian closed (`Cmd+Q`).
- Test vault with `slot_demo.md` (will auto-re-extract on install).
- Transpile token configured.
- forge-transpile redeployed and live (per v0.2.70 redeploy recipe).

**Step 1** (bug-fix reproduction): install v0.2.71. Open vault. Delete any existing `# Slots` heading from `slot_demo.md` (or use a fresh vault). Forge-click `slot_demo.md`. Expected console sequence:
- `Forge: slot cache miss { snippetId: 'forge-moda/slot_demo', missingCount: 1 }`
- `Forge: slot cache write succeeded { snippetId: 'forge-moda/slot_demo', count: 1 }`
- **NO** `Forge: slot resolution retry STILL surfaces cache miss; aborting` line (this is the bug being fixed).
- Output panel: `Hello, dear reader!` (or similar storybook greeting).

**Step 2** (idempotency, cache hit): second Forge-click. Expected: NO `slot cache miss` log. Output panel: same greeting (deterministic via cache).

**Step 3** (slot edit invalidation): edit slot text → save → Forge-click. Expected: new `slot cache miss` → `slot cache write succeeded` → no STILL line → Output panel shows new greeting matching the new slot text style.

Add failure-modes section keyed by step number. Include the v0.2.70 stack trace fragment (`computeSnippetWithArgs @ ...:128669`) as the regression-canary console message — if it reappears, the fix didn't take.

## §5 — Auto-smoke CC must run

1. `npm run build` exit 0.
2. `npm test` — new baseline = 477 + new helper test count. All green.
3. `pytest -q` on forge engine — 577 still. (No engine changes; pure regression check.)
4. `scripts/release.sh` clean.
5. Clean-vault smoke per cc-prompt-queue.md §296 — install v0.2.71 into fresh test vault, verify plugin loads + bundled forge-moda extracts (no slot_demo regression).
6. (Defer to user) live LLM round-trip per §4 Step 1.

If any auto-smoke fails, fix and re-verify.

## §6 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74 (bug-fix shape):

- Header block.
- §0 — release coordinates (manifest before/after, commit hashes for fix + release, tag, GH URL, zip SHA, line counts).
- §1 — TDD continuity (HARD RULE compliance — all 5 checkpoints).
  - §1.1 test cases added.
  - §1.2 verbatim pre-fix run output (failing).
  - §1.3 commit hash + inline diff of the load-bearing change at `handleSlotCacheMiss`.
  - §1.4 verbatim post-fix run output (passing).
  - §1.5 full-suite output post-fix.
- §2 — Investigation findings (skipped per §1 of this prompt; CC notes "investigation opt-out per prompt §1; root cause confirmed by driver" + line-citation verification of the prompt's claims).
- §3 — User-side smoke checklist per §4 shape, with the v0.2.70 stack trace fragment as the regression canary.
- §4 — Auto-smoke results (auto-verified vs deferred-to-user split).
- §5 — Follow-ups noted but not built: format change for `# Slots` legibility (per forge-doc's §8 #6 flag — separate design pass needed; cite the open question explicitly).

Post the same report in chat per cc-prompt-queue.md §43.

## §7 — Self-contained context for CC

- Phase 2 feedback (v0.2.70 ship that introduced the bug): `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0200-slot-resolution-phase-2-implementation.md`.
- Phase 2 design doc (B7.3 contract, cache shape): `~/projects/forge/docs/investigations/slot-resolution-design.md`.
- v0.2.17 staleness bug history (the canonical precedent for this race shape): grep `~/projects/forge-client-obsidian/src/pyodide-host.ts:604` comment block + `~/projects/forge-client-obsidian/src/main.ts:1502` v0.2.19 preflight pattern.
- The new "Assert cannot only with concrete error" HARD RULE (forge-core protocol): `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md` (search "Assert \"cannot\""). Applies to any assertions in feedback or chat output during this drain.

## §8 — Acceptance criteria

- `handleSlotCacheMiss` at main.ts:2143 calls `host.syncUserVaultFile(file.path, freshContent)` (directly or via the pure-core helper) after `vault.process` succeeds and before `return true`.
- Failing-first test demonstrates the post-write sync is invoked (Option A: helper test) OR the integration path (Option B).
- Plugin suite green (477 baseline + new tests).
- Engine suite green (577 unchanged).
- v0.2.71 released cleanly via release.sh.
- Smoke checklist §3 ready for user-side reproduction.
- Feedback per §6 shape.

If the fix lands but smoke STILL shows `STILL surfaces cache miss` on Step 1 — there's a deeper bug than this hotfix targets. STOP and route to `questions/` per cc-prompt-queue.md §51. Do NOT speculatively chain more fixes.
