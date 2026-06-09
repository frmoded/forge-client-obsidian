---
timestamp: 2026-06-06T10:30:00Z
session_id: claude-code-drain-source-vault-extract-gate
prompt_modified: 2026-06-06T10:30:00Z
status: success
---

# Feedback — 2026-06-06-1030 Source-vault detection skip-auto-extract (brief (e)) — v0.2.64

## §0 — Release coordinates

**Manifest:** 0.2.63 → 0.2.64.
**Commit:** `692b220` on `forge-client-obsidian/main`.
**Tag:** `v0.2.64` pushed.
**Release:** <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.64>
**Zip SHA-256:** `d99505c126e410faa60291d03a1868d5d846dd85bfac6d6d818073df5d1805da`
**install-latest.sh** into smoke vault: clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `src/welcome.ts` | +93 (3 gate blocks + detectSourceVault helper + import) | Three gated extract call sites: ensureWelcomeFiles, ensureBundledForgeModa, ensureBundledForgeMusic. |
| `src/source-vault-core.test.ts` | +38 | 3 new production-set regression tests. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.63 → v0.2.64. |

**Coordination with brief (c)**: brief (c) shipped first (v0.2.62) and created `source-vault-core.ts`. This drain extends with 3 production-set tests + wires the helper into welcome.ts. No file conflicts; the helper's signature was designed to be a shared consumer surface from the start.

## §1.1 — TDD coverage (3 new pure-core cases)

`source-vault-core.test.ts`:
1. **Production set excludes a normal cohort vault.** `isSourceVault({forge-moda, forge-music}, "name = \"smoke-v0.2.13\"...")` → `null`. Regression for the smoke vault shape: arbitrary name + cohort domains do NOT trip source-vault gating.
2. **Production set includes forge-music source repo.** Verbatim shape of `~/projects/forge-music/forge.toml` → `'forge-music'`.
3. **Production set includes forge-moda source repo.** Verbatim shape of `~/projects/forge-moda/forge.toml` → `'forge-moda'`.

Per cc-prompt-queue's pure-core convention, welcome.ts itself stays untested at unit level (imports from `obsidian`); the gating branches in welcome.ts are trivial dispatches over the pure-core decision — `if (sourceVaultName === 'forge-music') skip; else proceed;`. Tests #1-3 + the 13 existing source-vault-core tests cover every decision permutation.

## §1.2 — Phase 1 investigation findings

### Three extract call sites in `welcome.ts:runFirstRunCheck`

Pre-fix (v0.2.63):

```typescript
// ~line 111
const result = await ensureWelcomeFiles(adapter, { welcomeBundle: ..., greetBundle: ... });

// ~line 132
await ensureBundledForgeModa(app);

// ~line 158
await ensureBundledForgeMusic(app);
```

All three fire unconditionally on every plugin reload (modulo the `ensureBundledForgeMusic` domain gate on `domains = ["music"]`).

### `source-vault-core.ts` already exists from brief (c)

Created in v0.2.62. Pure helper takes a `Set<string>` of known bundled-library names and returns the matched name or null. Already covered by 13 TDD cases. This drain extends with 3 production-set tests + reuses the existing helper.

### forge-music + forge-moda forge.toml shapes (already documented in brief (c) §1.2)

Both have `name = "<library>"` matching their identity. Detection mechanism (vault-root forge.toml's `name` field) is the same one chips.ts already uses.

### Decision on the "user wants to OVERRIDE the source-vault detection" case

Per the prompt's §Phase1.5 recommendation: silent guard, no opt-out. If a dev really wants the extraction inside their source repo for some reason (testing the auto-extract path against the source vault, for instance), they can manually copy from `.obsidian/plugins/forge-client-obsidian/assets/` — no settings UI, no flag.

## §1.3 — Phase 2 fix (cited diffs)

### `src/welcome.ts` — imports + helper + 3 gated call sites

**Imports** (line 6):

```diff
 import { ensureWelcomeFiles } from './welcome-files-core';
+import { isSourceVault } from './source-vault-core';
 export { copyDirRecursive };
+
+const KNOWN_BUNDLED_LIBRARIES = new Set(['forge-moda', 'forge-music']);
+
+async function detectSourceVault(adapter: DataAdapter): Promise<string | null> {
+  try {
+    if (!(await adapter.exists('forge.toml'))) return null;
+    const body = await adapter.read('forge.toml');
+    return isSourceVault(body, KNOWN_BUNDLED_LIBRARIES);
+  } catch (e) {
+    console.warn('Forge: detectSourceVault read failed', e);
+    return null;
+  }
+}
```

**Gate 1 — `ensureWelcomeFiles`**:

```diff
+const sourceVaultName = await detectSourceVault(adapter);
+
+if (sourceVaultName !== null) {
+  console.log(
+    `Forge: skipping welcome.md extraction — vault is the source repo for ${sourceVaultName}`,
+  );
+} else {
   try {
     const result = await ensureWelcomeFiles(adapter, ...);
     ...
   } catch (e) { ... }
+}
```

**Gate 2 — `ensureBundledForgeModa`**:

```diff
+if (sourceVaultName === 'forge-moda') {
+  console.log('Forge: skipping forge-moda extraction — vault is the source repo');
+} else {
   await ensureBundledForgeModa(app);
+}
```

**Gate 3 — `ensureBundledForgeMusic`**:

```diff
+if (sourceVaultName === 'forge-music') {
+  console.log('Forge: skipping forge-music extraction — vault is the source repo');
+} else {
   await ensureBundledForgeMusic(app);
+}
```

### `src/source-vault-core.test.ts` — 3 production-set regression tests

```typescript
test('isSourceVault: production set excludes a normal cohort vault', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  const body = 'name = "smoke-v0.2.13"\ndomains = ["moda", "music"]';
  assert.equal(isSourceVault(body, PROD_SET), null);
});

test('isSourceVault: production set includes forge-music source repo', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  const body = [
    'name = "forge-music"',
    'version = "0.3.9"',
    'description = "Forge vault for music composition and analysis."',
    'domains = ["music"]',
  ].join('\n');
  assert.equal(isSourceVault(body, PROD_SET), 'forge-music');
});

test('isSourceVault: production set includes forge-moda source repo', () => {
  const PROD_SET = new Set(['forge-moda', 'forge-music']);
  const body = [
    'name = "forge-moda"',
    'version = "0.4.17"',
    'domains = ["moda"]',
  ].join('\n');
  assert.equal(isSourceVault(body, PROD_SET), 'forge-moda');
});
```

## §1.4 — Post-fix verbatim test output

```
✔ isSourceVault: production set excludes a normal cohort vault (~0.05ms)
✔ isSourceVault: production set includes forge-music source repo (~0.05ms)
✔ isSourceVault: production set includes forge-moda source repo (~0.05ms)
ℹ tests 379
ℹ pass 379
ℹ fail 0
```

(376 baseline + 3 new = 379.)

## §1.5 — Full `npm test`

```
ℹ tests 379
ℹ pass 379
ℹ fail 0
```

## §2 — Surprises during implementation

**The `KNOWN_BUNDLED_LIBRARIES` constant lives in both chips.ts AND welcome.ts.** Intentional duplication — both glue layers consult the same set. Extracting to a shared constants file (`src/known-bundled-libraries.ts` or similar) would add an extra import + module without changing the semantics. Two-call-site duplication is cheaper than the indirection. Flagging as a (cc) cleanup candidate if a third bundled library ever appears.

**`welcome.ts` stays untested at unit level.** Imports `App` and `DataAdapter` from `obsidian`. Per cc-prompt-queue's pure-core convention, glue files don't get tests; pure-core does. The gating logic in welcome.ts is trivial dispatch (`if sourceVaultName === ... else ...`); the load-bearing decision is in `isSourceVault` (13 + 3 = 16 cases shipped). User-side §3 smoke covers the wired behavior end-to-end.

**Flagging welcome.ts as a v0.3.x shim-candidate** per cc-prompt-queue's "Open infrastructure question." Welcome.ts has accumulated several glue gates (`ensureBundledForgeModa`/`forge-music`/`Welcome`/source-vault) each with its own pure-core helper. A shared `src/test-support/obsidian-shim.ts` stubbing `App`, `DataAdapter`, `TFile`, `Notice` would let welcome.ts itself be exercised under `node --test` directly without per-helper extraction. Not closed-beta scope; flagged for v0.3.x infrastructure work.

**11th clean release.sh run.** v0.2.51's bundle-fix + v0.2.53's re-run guard + v0.2.61's drift-preflight-early are all stable. End-to-end runs continue cleanly.

**The detection runs once per `runFirstRunCheck`.** `detectSourceVault(adapter)` reads vault-root forge.toml exactly once at the top, then dispatches based on the cached result. Not awaiting it 3 times.

## §3 — User-side smoke checklist

### Pre-conditions

- v0.2.64 plugin installed in `~/forge-vaults/smoke-v0.2.13/` (verified via install-latest.sh during this drain).
- `~/projects/forge-music/` exists (per forge-music v0.3.9).
- `~/projects/forge-moda/` exists (per the bundled-vault flow).

### Test A — source vault detection in forge-music repo (3 min)

The brief's load-bearing scenario.

1. (Optional) Clean any pre-existing pollution in `~/projects/forge-music/`:

   ```
   cd ~/projects/forge-music && rm -rf forge-music forge-moda welcome.md greet.md
   ```

   Leave `.forge/`, `.obsidian/`, and `.gitignore` alone.

2. Pre-condition state:

   ```
   cd ~/projects/forge-music && git status --short | head
   ```

   Capture the output; we'll compare post-install.

3. Install v0.2.64 in forge-music:

   ```
   VAULT=~/projects/forge-music bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
   ```

4. Open `~/projects/forge-music/` as a vault in Obsidian (vault picker → Open folder as vault).
5. Cmd+P → "Reload app without saving".
6. Open Developer Tools (`Cmd+Opt+I` macOS) → Console tab.
7. **Expected console log lines**:

   ```
   Forge: skipping welcome.md extraction — vault is the source repo for forge-music
   Forge: skipping forge-music extraction — vault is the source repo
   ```

   (Forge-moda extraction may or may not skip — it'll fire because domains list doesn't trigger the forge-moda source-vault check; `name = "forge-music"` only matches forge-music. So `ensureBundledForgeModa` will still run and extract forge-moda content into the source repo.)

8. Post-state:

   ```
   cd ~/projects/forge-music && git status --short | head
   ```

   **Expected**: NO new files at vault root with these names: `welcome.md`, `greet.md`, `forge-music/`. (The `forge-moda/` may appear; that's the same-class fix, scope of THIS prompt is just per-repo name match. See "Surprises" §2 above.)

   Specifically verify NONE of these exist post-install:

   ```
   ls ~/projects/forge-music/welcome.md 2>&1
   ls ~/projects/forge-music/greet.md 2>&1
   ls -d ~/projects/forge-music/forge-music 2>&1
   ```

   Expected: 3× "no such file or directory" errors.

   Pass: welcome + forge-music nested-extraction silenced for the forge-music source repo.

### Test B — source-vault detection in forge-moda repo (2 min)

1. Pre-condition: `cd ~/projects/forge-moda && git status --short | head`.
2. Install v0.2.64:

   ```
   VAULT=~/projects/forge-moda bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
   ```

3. Open `~/projects/forge-moda/` as a vault. Reload Obsidian. Open Console.
4. **Expected console log lines**:

   ```
   Forge: skipping welcome.md extraction — vault is the source repo for forge-moda
   Forge: skipping forge-moda extraction — vault is the source repo
   ```

5. Verify NONE of these exist:

   ```
   ls ~/projects/forge-moda/welcome.md 2>&1
   ls ~/projects/forge-moda/greet.md 2>&1
   ls -d ~/projects/forge-moda/forge-moda 2>&1
   ```

   Expected: 3× errors. Pass: forge-moda extraction silenced.

### Test C — regression in normal cohort vault (1 min)

1. Open `~/forge-vaults/smoke-v0.2.13/` (the cohort smoke vault) in Obsidian. Reload.
2. Open Console.
3. **Expected**: NO "skipping ... extraction" log lines. Existing behavior preserved.

   ```
   ls ~/forge-vaults/smoke-v0.2.13/welcome.md
   ```

   Expected: file exists (welcome.md extracted as before). Pass: cohort vault unchanged.

### Test D — paste-able regression checks for any other vault you use (1 min, optional)

For any non-source vault:

```
cat <your-vault>/forge.toml | grep '^name'
```

If the `name` value is one of `forge-moda` or `forge-music`, that vault will trigger the source-vault gate. If it's anything else (or no `name` line at all), normal extraction applies.

### Failure modes to watch for

- **Test A still creates `welcome.md` at vault root**: `detectSourceVault` returned null. Verify forge-music's forge.toml has `name = "forge-music"` exactly:

  ```
  cat ~/projects/forge-music/forge.toml | grep '^name'
  ```

  Expected: `name = "forge-music"`. If the value differs, source-vault detection won't trigger.

- **Test A creates `forge-music/` nested**: `ensureBundledForgeMusic` skip didn't fire. Check Console for the "Forge: skipping forge-music extraction" log line. If absent, the gate failed; capture the actual console output for follow-up.

- **Test C in cohort vault now lacks welcome.md**: detection mis-fired. Verify smoke vault forge.toml doesn't have a `name` field matching a bundled library:

  ```
  cat ~/forge-vaults/smoke-v0.2.13/forge.toml | grep '^name'
  ```

  Expected: either no `name` field or a custom name like `smoke-v0.2.13`. If forge-music or forge-moda appears, the detection is correctly firing for an unexpected setup.

### End-state cleanup

- (Optional) For Test A's leftover forge-moda nested extraction:

  ```
  cd ~/projects/forge-music && rm -rf forge-moda
  ```

  This drain's gate doesn't catch cross-library extraction (forge-moda in forge-music). Per the prompt's scope: same-library detection only. If cross-library detection is wanted, that's a follow-up extension.

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups updated:**

Dropped: ~~brief (c) chip discovery~~ ✓, ~~brief (d) chip insertion~~ ✓, ~~brief (e) source-vault auto-extract~~ ✓ (all three from the 1000/1015/1030 cluster shipped this drain set).

**Remaining (6 open):**
1. forge-music v2 `_chips.md` — their lane.
2. `forge-music.bak.0.3.0/` scanning gate — chip-palette polish.
3. Stage 3+ E-- migration roadmap.
4. `[[percussion_lab]]` directory-wikilink decision in Murmuration narrative.
5. percussion_lab 7-parts-always cleanup.
6. (cc) glue-to-pure-core audit candidates — including **`KNOWN_BUNDLED_LIBRARIES` extraction to a shared constants file** if a 3rd bundled library appears, and **`welcome.ts` shim-candidate** flagged in §2 above.

**Newly surfaced (1 open):**
7. Cross-library extraction in source vaults: forge-moda still extracts into forge-music's source repo because the gate is `===` strict. If the wider "no nested-library extraction in any source repo" rule is wanted, extend the gate to skip ALL bundled-library extracts when `sourceVaultName !== null`. Per this drain's scope, kept narrow.
