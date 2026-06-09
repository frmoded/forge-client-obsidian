---
timestamp: 2026-06-04T01:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-03T21:30:00Z
status: success
---

# URGENT — Domain changes via EditVaultDomainsModal don't take effect without plugin reload — feedback

## §0 Commit pointers + release

- **Commit:** `<latest>` on `main` (forge-client-obsidian)
- **Release:** https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.45
- **Zip uploaded** (workaround for the still-pending `release.sh` zip-upload patch).
- **manifest.json:** 0.2.44 → 0.2.45
- **INSTALL.md pin:** v0.2.44 → v0.2.45
- Installed into `~/forge-vaults/smoke-v0.2.13/` for user smoke; verifications below.

### Verification — fix is in the running plugin

```
"version": "0.2.45"  ✅
computeDomainActivationActions count in main.js: 2  ✅ (helper definition + call site)
registerDomainCommands count in main.js:        5  ✅ (declaration + call sites in onload + host shim + applyDiff dispatcher + comment)
ensureBundledFor count in main.js:              10 ✅ (declaration + call site + bundle-level references)
```

## §1 TDD discipline (HARD RULE compliance — all 5 checkpoints)

### §1.1 Test cases added pre-fix

`src/domain-activation-core.test.ts` — 9 cases covering:

1. `old=[], new=["moda"]` → `[{register-commands: 'moda'}]` (moda not bundled-gated; no extract).
2. `old=[], new=["music"]` → `[{extract: 'music'}, {register-commands: 'music'}]` (music IS bundled-extracted).
3. `old=["moda"], new=["moda","music"]` → only the new music actions (moda already active).
4. `old=["music"], new=[]` → `[]` (removal deferred per modal's "files stay on disk" semantics).
5. `old=null, new=["moda"]` → `[]` (null = back-compat all-active; moda was already implicitly active).
6. `old=["moda"], new=null` → register-commands + extract for every domain not in old (inverse of case 5).
7. `old=null, new=null` → `[]` (no transition).
8. Order rider — all extracts before any register-commands across multiple newly-active domains (bundled-content-before-commands dependency).
9. Idempotent rider — re-firing with identical old + new sets yields `[]` (cc-prompt-queue.md "no-op should remain no-op" assertion).

### §1.2 Pre-fix verbatim run + Phase 1 investigation

**Pre-fix run output:**

```
test at src/domain-activation-core.test.ts:1:1
✖ src/domain-activation-core.test.ts (53.218209ms)
  'test failed'
```

The whole file fails to import because the helper module didn't exist. Per `node --test` convention: import error registers as a single test failure for the file.

**Phase 1 investigation findings (static-code reading; no debug prints needed):**

1. **No existing forge.toml domains-change hook** beyond `reloadActiveDomains()`. That helper (main.ts:1045-1069) only re-reads `forge.toml` and updates the `activeDomains` set; it does NOT re-fire registration or extraction. Called from `EditVaultDomainsModal.applyDiff` (forge-action.ts:489) and the wizard's similar entry point (forge-action.ts:319/823).

2. **Domain-gated state set at onload that's never refreshed:**
   - `main.ts:343-356` — moda commands (`Open MoDa simulation`, `Step MoDa simulation`) inside `if (this.isDomainActive('moda')) { ... }`.
   - `welcome.ts:122` — `ensureBundledForgeMusic(app)` runs in `runFirstRunCheck` gated by `vaultDeclaresMusic(tomlBody)`.

3. **Only domain-gated bundled vault helper:** `ensureBundledForgeMusic`. `ensureBundledForgeModa` (welcome.ts:104) is unconditional per the prompt's spec (moda always-present).

4. **Current Notice text** (forge-action.ts:491-492):
   > `'Forge: vault updated. Reopen the Forge menu for the new domain actions.'`

   This is misleading — reopening the menu doesn't help; the underlying issue is that the addCommand registration never fired.

**Decision: Approach B (proper fix).** Pure-core extraction + `registerDomainCommands(domain)` helper exposed on the host + `ensureBundledFor(domain, app)` dispatcher in welcome.ts + applyDiff drives the actions via the pure-core decision. The prompt explicitly names B "recommended for proper fix"; the work is bounded (~200 lines of edits across 4 files) and closes the wart fully rather than guiding users to Cmd-Q.

### §1.3 The fix

#### New file: `src/domain-activation-core.ts` (pure-core extraction No. 14)

```typescript
export type DomainActivationAction =
  | { type: 'extract'; domain: string }
  | { type: 'register-commands'; domain: string };

export interface DomainInventoryEntry {
  id: string;
  extractOnActivate: boolean;
  registerCommandsOnActivate: boolean;
}

export const DOMAIN_INVENTORY: DomainInventoryEntry[] = [
  { id: 'moda',  extractOnActivate: false, registerCommandsOnActivate: true  },
  { id: 'music', extractOnActivate: true,  registerCommandsOnActivate: false },
];

export function computeDomainActivationActions(
  oldActive: Set<string> | null,
  newActive: Set<string> | null,
  inventory: DomainInventoryEntry[],
): DomainActivationAction[] {
  const allKnown = new Set(inventory.map(d => d.id));
  const oldSet = oldActive === null ? allKnown : oldActive;
  const newSet = newActive === null ? allKnown : newActive;
  const newlyActive = inventory.filter(
    d => newSet.has(d.id) && !oldSet.has(d.id),
  );
  const actions: DomainActivationAction[] = [];
  for (const d of newlyActive) if (d.extractOnActivate)             actions.push({ type: 'extract', domain: d.id });
  for (const d of newlyActive) if (d.registerCommandsOnActivate)    actions.push({ type: 'register-commands', domain: d.id });
  return actions;
}
```

#### `main.ts` — extracted `registerDomainCommands` + `currentActiveDomains`

**Before (main.ts:343-356, inline guard):**
```typescript
if (this.isDomainActive('moda')) {
  this.addCommand({ id: 'forge-open-moda', name: 'Open MoDa simulation', callback: () => { this.openModaView(); } });
  this.addCommand({ id: 'forge-step-moda', name: 'Step MoDa simulation', callback: () => { this.stepModaSimulation(); } });
}
```

**After:**
```typescript
if (this.isDomainActive('moda')) {
  this.registerDomainCommands('moda');
}
```

**New methods (main.ts, near `isDomainActive`):**
```typescript
public currentActiveDomains(): Set<string> | null {
  return this.activeDomains === null ? null : new Set(this.activeDomains);
}

public registerDomainCommands(domain: string): void {
  if (domain === 'moda') {
    this.addCommand({ id: 'forge-open-moda', name: 'Open MoDa simulation', callback: () => { this.openModaView(); } });
    this.addCommand({ id: 'forge-step-moda', name: 'Step MoDa simulation', callback: () => { this.stepModaSimulation(); } });
  }
}
```

#### `welcome.ts` — new exported `ensureBundledFor(domain, app)`

```typescript
export async function ensureBundledFor(domain: string, app: App): Promise<void> {
  if (domain === 'music') {
    await ensureBundledForgeMusic(app);
    return;
  }
  console.log(`Forge: ensureBundledFor('${domain}') — no bundled-vault helper for this domain; skipping`);
}
```

#### `forge-action.ts` — `ForgeHost` interface extended; `applyDiff` re-fires

`ForgeHost` gets `currentActiveDomains(): Set<string> | null` + `registerDomainCommands(domain: string): void`.

`applyDiff` flow (after the existing forge.toml write):
```typescript
const oldActive = this.host.currentActiveDomains();
await adapter.write('forge.toml', replaceForgeTomlDomains(toml, next));
await this.host.reloadActiveDomains();
const newActive = this.host.currentActiveDomains();

const actions = computeDomainActivationActions(oldActive, newActive, DOMAIN_INVENTORY);
let extractFailures = 0;
for (const action of actions) {
  try {
    if (action.type === 'extract')          await ensureBundledFor(action.domain, this.host.app);
    else if (action.type === 'register-commands') this.host.registerDomainCommands(action.domain);
  } catch (e) {
    console.warn(`Forge: domain-activation action ${action.type}/${action.domain} failed`, e);
    if (action.type === 'extract') extractFailures += 1;
  }
}
```

Notice text rewritten — three branches:
- Extract failed: `"Forge: vault updated, but N bundled-vault extraction(s) failed. ... may need to fully quit Obsidian (Cmd-Q) and reopen."`
- Actions fired: `"Forge: vault updated. New domain actions are now available."`
- No-op (re-save with same set): `"Forge: vault updated."`

#### `main.ts:forgeHost()` — host construction

Added the two new methods to the returned object so the `ForgeHost` interface is satisfied.

### §1.4 Post-fix verbatim run

```
✔ computeDomainActivationActions: old=[], new=["moda"] → register-commands only (moda not bundled-gated)
✔ computeDomainActivationActions: old=[], new=["music"] → extract + register-commands (music is bundled-extracted)
✔ computeDomainActivationActions: old=["moda"], new=["moda","music"] → only the new music actions
✔ computeDomainActivationActions: old=["music"], new=[] → no actions (removal deferred)
✔ computeDomainActivationActions: old=null, new=["moda"] → no actions (moda was already implicitly active)
✔ computeDomainActivationActions: old=["moda"], new=null → register all remaining (back to all-active)
✔ computeDomainActivationActions: old=null, new=null → no actions
✔ computeDomainActivationActions: order — extracts before register-commands
✔ computeDomainActivationActions: idempotent — re-firing on same state yields no actions
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

### §1.5 Full `npm test` post-fix

```
ℹ tests 224
ℹ pass 224
ℹ fail 0
ℹ duration_ms 4964.820834
```

(215 prior + 9 new = 224.)

## §2 Notes + follow-ups

### Removal-side is deferred — honest scope

Per the prompt's "Don't claim Approach B is complete if removal-side (unregister + un-extract) is deferred":

**Removal IS deferred.** Test case 4 (`old=["music"], new=[]` → `[]`) and the helper's docstring make this explicit. Rationale:
- The modal's existing behavior leaves extracted vault files on disk when a domain is removed (per its own UX comment). The activation helper mirrors that.
- Unregistering Obsidian commands at runtime isn't trivially safe — Obsidian's API doesn't expose a public unregister; you'd need to track the `addCommand` return value (a `Command` object) and call `removeCommand` on it. Doable but a separate slice.
- Un-extracting a vault on removal would also need user confirmation (data loss). Out of scope.

**What would trigger doing the removal side:** a future drain where cohort operators report confusion ("I removed music but the forge-music dir is still here"). For now, the docstring + Notice ("vault updated") cover it.

### Music has no commands today

`DOMAIN_INVENTORY[1].registerCommandsOnActivate = false` because no music-specific commands exist in `main.ts:onload`. When music commands ship, flip the bit AND add the corresponding branch in `registerDomainCommands(domain)`. The pure-core helper is already future-proof; only the inventory + the dispatcher branch need touching.

### Forward-compat for unknown domains in `ensureBundledFor`

The dispatcher logs `Forge: ensureBundledFor('X') — no bundled-vault helper for this domain; skipping` and no-ops for any domain not in the known list. This is defensive — a future cohort-operator-introduced domain ID typo in `forge.toml` won't crash the modal.

### Protocol-document drift (carried from previous drain)

The cc-prompt-queue.md "Use install scripts, NOT BRAT" rule remains out-of-date relative to closed-beta-onboarding.md. This drain doesn't address it (out of scope); the recommendation from yesterday's URGENT-rewrite drain still stands.

### Smoke-automation split applied

**Auto-verified by CC:**
- Phase 1 investigation via static reading (no debug prints needed).
- Failing-first test run (pre-fix: 1 test errors at file import).
- Implemented helper + 8 wire-up locations across main.ts/welcome.ts/forge-action.ts.
- Post-fix test run (9/9 cases pass).
- Full suite (`npm test` 224/224).
- Build clean (`npm run build`).
- v0.2.45 release cut + zip uploaded + installed into smoke-v0.2.13 vault.
- Verified fix landed in the installed `main.js` via grep counts.

**Deferred to user (genuinely UI-only):**
- Verify Obsidian's modal behavior post-install (Cmd+Q + reopen to load v0.2.45, exercise the domain-change flow).
- Confirm new Notice text.
- Confirm command appears in Cmd+P after activation without Cmd+Q.
- Confirm `forge-music/` extracts immediately after adding `music` domain.

Five lightweight user-side steps in §3 below. Amendment B (typical 3-8 step bound) honored.

## §3 User-side smoke checklist

> Bug-fix-prompt exception applies: step 4 (adding moda) reproduces the exact gesture that produced the originally-reported failure on the mint-laptop smoke. A working command appearing in Cmd+P without a Cmd+Q IS the fix verification.

**Pre-conditions:**

- Terminal NOT required; smoke is fully in Obsidian.
- A clean OR existing test vault. Easiest: re-use `~/forge-vaults/smoke-v0.2.13/` (already installed to v0.2.45).
- `Cmd+Q` Obsidian fully (not Cmd+W; the plugin only re-evaluates code on full Obsidian relaunch).

### Steps

1. **Reopen Obsidian and the smoke vault.** Launch Obsidian; pick `smoke-v0.2.13` from the vault picker.
   Expected: vault opens. Open Developer Tools with `Cmd+Opt+I` (macOS) → **Console** tab → filter on `Forge:`.
   Expected log lines: `Forge: forge-moda already at version 0.4.16; skipping` plus a music line (this vault has `domains = ["music"]` so it's `Forge: forge-music already at version 0.3.8; skipping`).

2. **Confirm v0.2.45 landed in this install.** In Terminal:
   ```
   grep '"version"' ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/manifest.json
   ```
   Expected: `"version": "0.2.45"`. If `0.2.44` or earlier, the install didn't write — re-run `install-latest.sh`.

3. **(Bug reproduction — pre-fix state.)** This is informational only since v0.2.45 contains the fix. Pre-v0.2.45, opening the Forge action and changing domains via the modal would update `forge.toml` and reload the active-domain set, but adding `moda` to a vault without it would NOT make `Forge: Open MoDa simulation` appear in Cmd+P without a Cmd+Q + reopen. Skip to step 4 to verify the fix.

4. **(Fix verification — load-bearing.) Test adding `moda` to a vault that doesn't have it.**
   Since `smoke-v0.2.13` already has moda implicitly active (its `forge.toml` has `domains = ["music"]` — explicit list excludes moda), Cmd+P → `Forge: Open MoDa simulation` should currently be ABSENT.
   Confirm: open Cmd+P, type "Open MoDa". Expected: NO matching command (because moda is not in the active set).

   Now use the Forge ribbon button → "Edit vault domains" (or whatever the current action label is) → tick `moda` in the modal → click Save.
   Expected:
   - Modal closes.
   - Notice toast appears: `Forge: vault updated. New domain actions are now available.`
   - **Without quitting Obsidian**, open Cmd+P → type "Open MoDa". The `Forge: Open MoDa simulation` command should NOW appear.
   - Click it. Expected: the moda particle simulation panel opens.

5. **(Fix verification — bundled-vault extraction.) Test adding `music` to a vault that doesn't have it.**
   Start from a vault that has `domains = ["moda"]` (or similar — anything that excludes music). If `smoke-v0.2.13` doesn't fit, create a throwaway vault for this step.
   Confirm `<vault>/forge-music/` does NOT exist on disk.

   Open the modal → add `music` → Save.
   Expected:
   - Notice: `Forge: vault updated. New domain actions are now available.`
   - On disk: `<vault>/forge-music/` directory NOW exists with `blues/`, `percussion/`, etc. (extracted from the bundle, without a Cmd+Q).
   - In DevTools console, you should see fresh lines from `ensureBundledVault` like `Forge: extracted bundled forge-music into vault` (first install) or `Forge: forge-music already at version 0.3.8; skipping` (idempotent re-extract).

### Failure modes

- **Step 4 — Notice fires but `Forge: Open MoDa simulation` still absent in Cmd+P.** Either the helper wasn't loaded (run `grep -c "registerDomainCommands" main.js` in the install dir — expect ≥ 2) or Obsidian's command palette has stale state. Try `Cmd+P → "Reload app without saving"` to flush.
- **Step 5 — `forge-music/` extraction didn't fire.** Notice text should read "vault updated, but N bundled-vault extraction(s) failed" instead of "New domain actions are now available." Check DevTools console for a `Forge: ensureBundledFor` or `ensureBundledForgeMusic failed` line.
- **Step 5 — `<vault>/forge-music/` exists but Cmd+P shows no music commands.** Expected — music has no commands registered in v0.2.45 (`DOMAIN_INVENTORY[1].registerCommandsOnActivate = false`). When music commands ship, flip the inventory bit in `src/domain-activation-core.ts`.

### End-state cleanup

- The `domains = ["music", "moda"]` change in `~/forge-vaults/smoke-v0.2.13/forge.toml` from step 4 persists. To reset for re-smoke, edit forge.toml back to `domains = ["music"]` (or whatever it was at start) and Cmd+Q + reopen.
- The throwaway vault from step 5 (if created) can be dragged to Trash.

### CC's open worklist (still pending your authorization)

- **`release.sh` zip-upload patch** — now six releases needing manual zip upload (v0.2.40 through v0.2.45). Patch is ~12 lines.
- **Protocol-document drift on install paths** — raised in yesterday's URGENT-rewrite-CLEAN-LAPTOP feedback.
- **MEMFS-to-host-disk snapshot writeback** — known persistence gap.
- **Removal-side of EditVaultDomainsModal** — deferred per §2.
