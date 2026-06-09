# v0.2.69 — welcome.md gate regression + chip-click guard misfire fixes

**Date queued**: 2026-06-07
**Plugin version at queue time**: 0.2.68
**Target plugin version**: bump per protocol's placeholder convention — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.68 → 0.2.69`). Per the version-bump drain-time sanity check HARD RULE: read `~/projects/forge-client-obsidian/manifest.json` first; if it's already past 0.2.68, pause and flag before proceeding.

## §0 — Why this prompt exists

Two bugs surfaced by forge-music's v0.2.68 install round-trip into their source vault (`~/projects/forge-music/`), Path A install via BRAT-via-forge-installer. Both reproducible. Both are blocking forge-music's smoke (brief (d) chip-insertion verification) AND blocking the cohort install path on any source vault.

**Bug 1** (cosmetic but cohort-confusing): a phantom `Welcome.md` (capital W) is created at vault root when forge-music's source repo is opened as a vault, despite v0.2.66's symmetric `shouldSkipBundledExtract` gate.

**Bug 2** (BLOCKING): chip clicks against a known action snippet (peak.md, `type: action`) trigger the "click into an action snippet first" Notice and DO NOT insert. Brief (d) verification can't proceed without this fix.

Both reports live in `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/`:
- `2026-06-06-1630-welcome-md-regression-at-v0.2.68.md`
- `2026-06-06-1700-chip-click-guard-misfires-on-action-snippet.md`

This prompt is a single drain that fixes both bugs, ships one v0.2.69 release, and clears forge-music's smoke blocker. Two-phase shape per protocol (investigation + implementation), TDD discipline mandatory per protocol HARD RULES at `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` §57-118.

## §1 — Investigation phase (commit before fix)

Per the investigation-before-design rider (cc-prompt-queue.md §78): both bugs have non-obvious aspects worth confirming with concrete code-citation before designing the fix. Ship Phase 1 as its own commit; Phase 2's design follows from Phase 1's findings.

### §1.1 — Bug 1 investigation (welcome.md regression)

**Hypothesis to verify**: there are TWO separate Welcome.md write paths in `~/projects/forge-client-obsidian/src/welcome.ts`. The v0.2.66 symmetric gate fix (`shouldSkipBundledExtract`) covers ONE of them (the `ensureWelcomeFiles` extraction path) but misses the OTHER (the older sentinel-gated `WELCOME_PATH = 'Welcome.md'` create path). The file names are different (capital `Welcome.md` vs lowercase `welcome.md`), which is why the asymmetry survived previous reviews.

**Concrete checks**:

1. Read `~/projects/forge-client-obsidian/src/welcome.ts` end-to-end. Confirm:
   - Line ~37: `const WELCOME_PATH = 'Welcome.md';` (capital W).
   - Lines ~97-123: `runFirstRunCheck` opens with a `!hasSentinel` block that creates `Welcome.md` (capital W) via `app.vault.create(WELCOME_PATH, WELCOME_NOTE)`.
   - That block has NO `shouldSkipBundledExtract` check.
   - Lines ~131+: `detectSourceVault` is called AFTER the sentinel block.
   - Lines ~146-168: `ensureWelcomeFiles` extracts a different bundled file set (lowercase `welcome.md` + `greet.md`), correctly gated by `shouldSkipBundledExtract`.

2. Confirm forge-music's `~/projects/forge-music/forge.toml` (declared `name = "forge-music"`) is correctly detected by `isSourceVault(body, KNOWN_BUNDLED_LIBRARIES)` from `~/projects/forge-client-obsidian/src/source-vault-core.ts`. The KNOWN_BUNDLED_LIBRARIES at welcome.ts:16 already includes `'forge-music'`.

3. Confirm there are no OTHER code paths writing `Welcome.md` or `welcome.md` (grep `Welcome.md`, `welcome.md`, `WELCOME_PATH`, `app.vault.create` calls in `src/`). If a third path exists, document it and adapt the fix.

4. Cite the line numbers in §2 of the feedback (investigation commit hash + §1.1 findings).

### §1.2 — Bug 2 investigation (chip-click guard misfire)

**Hypothesis to verify**: `lastMarkdownView` in `~/projects/forge-client-obsidian/src/chips-view.ts` is assigned ONLY in the `file-open` event handler at chips-view.ts:38-46. Path A install workflow surfaces a gap: when the plugin enables while a markdown file is ALREADY open (Obsidian restoring last workspace state), `file-open` for that file has already fired before `ChipsView.registerEvent` ran, so `lastMarkdownView` stays at its initial `null`. User clicks inside the already-open file (no file-open fires), clicks chip, fallback fails, Notice fires.

**Concrete checks**:

1. Read `~/projects/forge-client-obsidian/src/chips-view.ts` lines 1-100 + 270-330 (constructor + onOpen + onChipClick). Confirm:
   - `lastMarkdownView` initialized `null` at line 26.
   - Sole assignment site is the `file-open` callback at line 46.
   - `onChipClick` at line 274-284 reads `(live ?? this.lastMarkdownView)?.file` and Notices if undefined.
   - `onOpen` at line 54+ does NOT eagerly snapshot the current markdown view.

2. Trace whether the `file-open` event's `v.file?.path === file?.path` check at line 46 could fail in normal flows (workspace race during file-open, leaf reuse, etc.). Document any such race conditions found.

3. Search for any other lastMarkdownView assignment sites you may have missed (`grep lastMarkdownView src/`). If multiple, document the full assignment surface.

4. Confirm the v0.2.67 diff to chips-view.ts (commit `30472c5`) changed the file-open callback from `render()` to `refresh()` but did NOT change the lastMarkdownView assignment logic. The bug is pre-v0.2.67 latent behavior surfaced by Path A workflow, NOT a v0.2.67 regression.

5. Cite findings in §2 of feedback.

### §1.3 — Investigation commit

Commit the investigation findings as a docs-only or comment-only commit titled e.g. `[2026-06-07-0030-welcome-md-and-chip-click-guard-fixes] phase 1: investigation findings for welcome.md + chip-click bugs`. Body documents the line-number citations + confirms / refutes / amends the hypotheses above.

If investigation refutes either hypothesis, STOP, write findings to feedback's §2, and route to `questions/` per protocol — do NOT speculate a fix.

## §2 — Fix phase (TDD discipline per cc-prompt-queue.md §57)

### §2.1 — Bug 1 fix (welcome.md gate extension)

**TDD step 1 — failing test first**. Extend the existing welcome-related test surface (probably `~/projects/forge-client-obsidian/src/source-vault-core.test.ts` or a new file). Pure-core extraction may be needed if the test needs to exercise `runFirstRunCheck`'s sentinel + source-vault branching without pulling in `obsidian`:

- If welcome.ts's `runFirstRunCheck` can be tested via a thin pure-core helper (e.g., a `shouldCreateLegacyWelcomeMd({hasSentinel, sourceVaultName}): boolean` extraction), prefer that. Pure-core extraction #N (next available number). Test the helper at the matrix of (hasSentinel × sourceVaultName ∈ {null, 'forge-moda', 'forge-music'}) — only `{hasSentinel: false, sourceVaultName: null}` should return true.
- If extraction is awkward, add an integration test using a stub `App` + stub `DataAdapter` that exercises `runFirstRunCheck` end-to-end. Probably cleaner to extract.

Test case shape:

```typescript
// shouldCreateLegacyWelcomeMd matrix
test('legacy Welcome.md gate matrix', () => {
  // No sentinel + no source vault → write (fresh user vault)
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, null), true);
  // No sentinel + forge-music source vault → SKIP (bug 1 fix)
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, 'forge-music'), false);
  // No sentinel + forge-moda source vault → SKIP (bug 1 fix, symmetric)
  assert.strictEqual(shouldCreateLegacyWelcomeMd(false, 'forge-moda'), false);
  // Sentinel exists → SKIP regardless (idempotency preserved)
  assert.strictEqual(shouldCreateLegacyWelcomeMd(true, null), false);
  assert.strictEqual(shouldCreateLegacyWelcomeMd(true, 'forge-music'), false);
});
```

**TDD step 2 — run test, confirm fails**. Capture verbatim output for feedback §1.2.

**TDD step 3 — fix**. In `welcome.ts`:
- Move the `detectSourceVault(adapter)` call to BEFORE the `if (!hasSentinel)` block (currently around line 131; move to ~line 102 before line 110).
- Wrap the `if (!hasWelcome) { await app.vault.create(WELCOME_PATH, ...); }` block in an additional `if (!shouldSkipBundledExtract(sourceVaultName))` gate. Sentinel write (line ~121) should STILL fire even for source vaults — idempotency preserved (no re-check on subsequent reloads).
- Add a console.log mirror to the other source-vault-skip log lines: `console.log('Forge: skipping legacy Welcome.md create — vault root declares itself as source repo for ${sourceVaultName}');` so the gate is observable in DevTools console.

**TDD step 4 — re-run test, confirm passes**. Capture verbatim output.

**TDD step 5 — full suite**. `cd ~/projects/forge-client-obsidian && npm test`. Confirm no regression. Capture pass count.

### §2.2 — Bug 2 fix (chip-click guard fallback)

**TDD step 1 — failing test first**. Pure-core extraction is appropriate here — the fallback logic is testable without Obsidian. Suggested shape: `~/projects/forge-client-obsidian/src/find-fallback-markdown-view-core.ts` (pure-core extraction #N).

The helper takes a structural-adapter for workspace state, not the obsidian Workspace itself. Suggested interface:

```typescript
interface MarkdownLeafLike {
  view: { file: { path: string } | null } | null;
}
interface WorkspaceLeafFinder {
  getActiveMarkdownView(): { file: { path: string } | null } | null;
  getMarkdownLeaves(): MarkdownLeafLike[];
  getMostRecentLeaf?(): MarkdownLeafLike | null;
}

export function findFallbackMarkdownView(
  finder: WorkspaceLeafFinder,
  lastSeenView: { file: { path: string } | null } | null,
): { file: { path: string } | null } | null {
  // 1. Live active view wins.
  const live = finder.getActiveMarkdownView();
  if (live?.file) return live;
  // 2. Tracked lastSeenView wins if still valid (has a file).
  if (lastSeenView?.file) return lastSeenView;
  // 3. Iterate-leaves fallback. Most-recent if available; else first
  //    markdown leaf with a file.
  const recent = finder.getMostRecentLeaf?.();
  if (recent?.view?.file) return recent.view;
  for (const leaf of finder.getMarkdownLeaves()) {
    if (leaf.view?.file) return leaf.view;
  }
  return null;
}
```

(CC: this is suggested shape. If a cleaner extraction emerges during work, use that — flag the divergence in §2 feedback.)

Test cases:

```typescript
test('falls back to live active view when present', ...);
test('falls back to lastSeen when no live view', ...);
test('falls back to most-recent markdown leaf when lastSeen is null', ...);
test('falls back to first markdown leaf when most-recent missing', ...);
test('returns null when no markdown leaves at all', ...);
test('skips leaves whose view.file is null', ...);
test('lastSeen with null file does NOT win over a valid leaf', ...);
```

**TDD step 2 — run, confirm fails**. Capture output.

**TDD step 3 — fix**. Two-part change in `chips-view.ts`:

1. **Snapshot-on-open**: in `ChipsView.onOpen()` (line 54+), eagerly capture the current markdown view if any:
   ```typescript
   async onOpen() {
     this.host.registerView(this);
     // Snapshot any currently-active markdown view so chip clicks work
     // when the plugin enabled with a file already open (Path A install
     // workflow). Pre-v0.2.69, lastMarkdownView stayed null until the
     // next file-open event.
     const active = this.app.workspace.getActiveViewOfType(MarkdownView);
     if (active && active.file) this.lastMarkdownView = active;
     // ... existing onOpen logic
   }
   ```

2. **Fallback at chip-click time**: in `onChipClick` (line 274-284), use the new pure-core helper for the resolution:
   ```typescript
   private async onChipClick(insertion: string) {
     const view = findFallbackMarkdownView(
       {
         getActiveMarkdownView: () =>
           this.app.workspace.getActiveViewOfType(MarkdownView),
         getMarkdownLeaves: () =>
           this.app.workspace.getLeavesOfType('markdown') as unknown as MarkdownLeafLike[],
         getMostRecentLeaf: () =>
           this.app.workspace.getMostRecentLeaf() as unknown as MarkdownLeafLike | null,
       },
       this.lastMarkdownView,
     );
     const file = view?.file as TFile | undefined;
     if (!file) {
       new Notice('Forge chips: click into an action snippet first, ' +
         'then click the chip.');
       return;
     }
     // ... existing type === 'action' gate + insertViaVault
   }
   ```

Also: change the file-open handler's lastMarkdownView assignment at line 46 to drop the over-strict `v.file?.path === file?.path` check:
```typescript
// Before:
if (v && v.file?.path === file?.path) this.lastMarkdownView = v;
// After:
if (v && v.file) this.lastMarkdownView = v;
```
This catches the workspace-race case where v is set but its file hasn't synced to the file-open arg yet.

**TDD step 4 — re-run, confirm passes**.

**TDD step 5 — full suite**. `npm test`. Confirm no regression. Capture pass count.

### §2.3 — Combined release

Single v0.2.69 release cut. Both fixes ship in one tag. Commit ordering: Phase 1 investigation commit → Bug 1 fix commit → Bug 2 fix commit → release commit. Per default-on git ops (cc-prompt-queue.md §339), CC commits + tags + creates GH release.

Bump `~/projects/forge-client-obsidian/manifest.json` per the placeholder rule. Per cc-prompt-queue.md §347, read current value first; if not 0.2.68, pause and flag.

No bundled-vault content changes in this drain — `forge-moda/forge.toml` does NOT need a version bump. (Per cc-prompt-queue.md §358's explicit-opt-out: this change is plugin-side only; no forge-moda or forge-music bundled content is modified.)

`scripts/release.sh` should run cleanly. If drift is detected, flag and pause per the release.sh drift preflight introduced in v0.2.61.

## §3 — User-side smoke checklist (CC writes post-implementation)

Per cc-prompt-queue.md §183-294, write the smoke checklist after the fixes land and CC's auto-smoke passes. The checklist:

- Pre-conditions: terminal cwd, Obsidian closed, forge-music source vault state.
- **Step 1**: install v0.2.69 into `~/projects/forge-music/` via `install-latest.sh` (operator path — matches forge-music's preferred flow per the install-path resolution at `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-06-1600-install-path-confirm-operator-error.md`). Note that BRAT-via-forge-installer also works; either is fine for this smoke since v0.2.69 is plugin-side only.
- **Step 2** (Bug 1 verification): immediately after install, check that `Welcome.md` was NOT created at vault root. Paste-able command per 6a:
  ```
  cd ~/projects/forge-music && git status --short
  ```
  Expected output excerpt: NO line showing `?? Welcome.md`. Lines for `.forge/` and `.obsidian/` are expected. If `Welcome.md` appears, bug 1 isn't fixed — capture DevTools console for the source-vault-skip log line.
- **Step 3** (Bug 2 verification — pre-spec'd per cc-prompt-queue.md §187 since it's a bug-fix reproduction): open `~/projects/forge-music/percussion_lab/peak.md` in Obsidian. Click into the English facet body. Cursor blinks. Click any chip in the right-sidebar chip palette (e.g., `solitary`). Expected: Notice appears with `Forge chips: inserted "Do [[solitary]](<bars>)."` (or canonical-form equivalent matching the chip's insertion text). Cursor location in peak.md shows the inserted text.
- **Step 4** (regression check): open a different file (e.g., `~/projects/forge-music/percussion/companions.md`). Click another chip. Verify insertion still works after a file switch (catches any regression to the file-open handler's lastMarkdownView assignment).
- **Step 5** (idempotency check for Bug 1): close Obsidian (Cmd+Q). Reopen the forge-music vault. Run `git status --short` again. Expected: no new Welcome.md, no other surprise files. Sentinel at `.forge/initialized` exists from the first run, so first-run check short-circuits.
- **Failure modes** section keyed by step number.
- **End-state cleanup**: optional `rm Welcome.md` if the user already had the buggy one from v0.2.68 still hanging around.

CC: actually run as much of this smoke as possible from the sandbox before writing it (per cc-prompt-queue.md §240). The Obsidian-UI parts (steps 3-4) defer to user; the file-system parts (steps 2, 5) CC can simulate by running `install-latest.sh` against a fresh test directory and checking what gets created. Document the split in §3.

## §4 — Auto-smoke CC must run

Per cc-prompt-queue.md §133-181 (smoke automation rules):

1. `npm run build` — must exit 0. Paste build summary.
2. `npm test` — must show all tests passing. Paste the `ℹ tests N` block.
3. `~/projects/forge-client-obsidian/scripts/release.sh` — runs cleanly through. Paste the SHA + tag + GH release URL.
4. Clean-vault smoke (per cc-prompt-queue.md §296): set up `~/test-vaults/v0.2.69-smoke/` as a fresh test directory, `install-latest.sh` v0.2.69 into it (with a stub forge.toml so it's detected as a non-source vault — or no forge.toml at all). Verify Welcome.md IS created in this fresh non-source vault (Bug 1 fix didn't over-correct).
5. Clean-vault smoke for source-vault path: set up `~/test-vaults/v0.2.69-source-smoke/` with a forge.toml declaring `name = "forge-music"`. Install v0.2.69. Verify Welcome.md is NOT created. Verify sentinel IS written. This is the Bug 1 fix's positive case.

If any auto-smoke step fails, fix and re-verify per cc-prompt-queue.md §181. Don't ship a "tests pass but release.sh crashes" state.

## §5 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- **Header block**: timestamp / session_id / prompt_modified / status.
- **§0**: release coordinates — manifest.json before/after, commit hashes (investigation + both fixes + release), tag, GH release URL, zip SHA-256, line counts table.
- **§1**: TDD continuity for Bug 1 (HARD RULE compliance — all 5 checkpoints).
  - §1.1: test cases added pre-fix.
  - §1.2: verbatim pre-fix run output (failing).
  - §1.3: commit hash + inline code-block diffs of welcome.ts changes.
  - §1.4: verbatim post-fix run output (passing).
  - §1.5: full-suite output post-fix.
- **§2**: TDD continuity for Bug 2 (HARD RULE compliance — all 5 checkpoints).
  - §2.1 through §2.5 mirroring §1's shape for the chips-view + find-fallback-markdown-view-core extraction.
- **§3**: User-side smoke checklist per the shape spec'd in cc-prompt-queue.md §254-292.
- **§4**: Auto-smoke results (auto-verified-by-CC vs deferred-to-user split).
- **§5**: Investigation findings from Phase 1 (line-cited confirmations or hypothesis amendments).
- **§6**: Follow-ups noted but not built (if any).

Post the same report in chat per cc-prompt-queue.md §43.

## §6 — Self-contained context for CC

You will be drained without conversational context. Everything you need:

- Plugin source: `~/projects/forge-client-obsidian/`. Key files:
  - `src/welcome.ts` — bug 1.
  - `src/source-vault-core.ts` — `isSourceVault` + `shouldSkipBundledExtract`.
  - `src/chips-view.ts` — bug 2.
  - `src/chips.ts`, `src/chips-core.ts` — chip loading + insertion (likely unchanged, but read if needed).
- forge-music vault: `~/projects/forge-music/`. Its `forge.toml` declares `name = "forge-music"`. The `percussion_lab/peak.md` file is the bug 2 reproduction snippet; you don't need to modify it.
- KNOWN_BUNDLED_LIBRARIES at welcome.ts:16 already includes `'forge-music'`. No data change needed there.
- Pure-core convention: cc-prompt-queue.md §86-118. Extraction lives in `src/<helper>-core.ts`, test in `src/<helper>.test.ts`, only imports `obsidian`-free deps.
- v0.2.67 diff (chips-view.ts) for context: changed `void this.render()` → `void this.refresh()` in file-open. Did not touch lastMarkdownView contract.
- Forge-music will run §3 smoke once v0.2.69 lands. Driver will relay "check messages" with a smoke report to forge-core after.

## Acceptance criteria

- Bug 1 fix lands; Welcome.md NOT created in source vaults; IS created in non-source vaults.
- Bug 2 fix lands; chip click against open action snippet inserts text via context.compute-shaped insertion; Notice does NOT fire on the guard.
- All tests pass (existing + new).
- v0.2.69 released cleanly via release.sh.
- Feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-07-0030-welcome-md-regression-and-chip-click-guard-fixes.md` per §5 shape.
- User-side smoke checklist in §3 of feedback ready for user to run.
