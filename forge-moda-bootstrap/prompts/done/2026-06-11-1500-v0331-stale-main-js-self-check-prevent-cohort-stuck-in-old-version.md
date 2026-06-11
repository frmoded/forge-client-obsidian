---
timestamp: 2026-06-11T15:00:00Z
session_id: drain-2026-06-11-1500
status: pending
priority: HIGH — real cohort risk; Tamar (or any cohort) will hit same stale-main.js issue silently
---

# v0.2.131 — Stale main.js detection: plugin self-check + reinstall prompt

## §0 — Bug report

Driver smoke against v0.2.127:

> "I see Action Shape dropdown with Free-English / Canonical options."

Action Shape was removed at v0.2.108. The plugin source has the comment `// v0.2.108 — ActionShape selector removed` since then. The compiled main.js from v0.2.127 source has **0** matches for "Action Shape".

But driver's INSTALLED main.js has **7** matches:
```
grep -c "Action Shape\|actionShape" ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/main.js
7
```

While `manifest.json` correctly says version 0.2.127.

**Diagnosis**: BRAT updated `manifest.json` to v0.2.127 but did NOT replace `main.js`. The installed main.js is pre-v0.2.108. UI shows old code; cohort UX silently broken.

This is a stale-install bug that will hit Tamar (the next BRAT user) and every other cohort member who installs v0.2.X for the first time after some intermediate version. v0.2.98's inlined-asset version stamping handles ASSETS in `assets/`, but main.js is the BRAT-downloaded file itself — outside that mechanism.

## §1 — Goal

Plugin self-check on `onload`: detect when running main.js code is from a different version than manifest.json claims. Surface clear Notice + actionable instruction (reinstall via BRAT).

Net effect: cohort users who hit the BRAT update bug see a banner saying "main.js is stale; reinstall via BRAT to get the real v0.2.X" instead of silently running old code.

## §2 — Investigation phase (per §78)

### §2.1 — Embed version constant in main.js at build time

The plugin's TypeScript source needs a constant that gets baked into main.js at build:

```typescript
// src/version-constant.ts (NEW)
export const PLUGIN_VERSION_AT_BUILD = "0.2.131";  // synced at build
```

OR: read from `package.json` at build via an inlining script (matches v0.2.98's pattern):

```javascript
// scripts/inline-plugin-version.mjs (NEW)
const pkg = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
fs.writeFileSync('src/version-constant.generated.ts',
  `export const PLUGIN_VERSION_AT_BUILD = ${JSON.stringify(pkg.version)};\n`);
```

Build script runs `inline-plugin-version.mjs` before esbuild. The constant becomes part of compiled main.js — it's literally THE main.js's self-claimed version.

### §2.2 — On-load comparison

In `main.ts:onload()` (early — before any other initialization):

```typescript
async onload() {
  // v0.2.131 — stale main.js self-check
  const manifestJson = JSON.parse(await this.app.vault.adapter.read(
    `${this.manifest.dir}/manifest.json`
  ));
  const manifestVersion = manifestJson.version;
  
  if (manifestVersion !== PLUGIN_VERSION_AT_BUILD) {
    new Notice(
      `Forge: stale main.js detected. manifest.json claims v${manifestVersion} but main.js is v${PLUGIN_VERSION_AT_BUILD}. Reinstall via BRAT to get the correct version: Settings → Community plugins → forge-client-obsidian → toggle off + on; OR Settings → BRAT → Re-install.`,
      30000  // long Notice — must be clearly visible
    );
    console.error(`Forge onload: stale main.js. manifestVersion=${manifestVersion}, mainJsVersion=${PLUGIN_VERSION_AT_BUILD}`);
    // Don't block plugin from loading — partial functionality is better than nothing
  }
  
  // ... rest of onload ...
}
```

The Notice persists for 30 seconds. The cohort user sees it on every Obsidian launch until they reinstall.

### §2.3 — Optional: persistent indicator

If the Notice is too easily dismissed, add a status-bar item:

```typescript
if (manifestVersion !== PLUGIN_VERSION_AT_BUILD) {
  const statusItem = this.addStatusBarItem();
  statusItem.setText(`⚠ Forge stale (main.js v${PLUGIN_VERSION_AT_BUILD} vs manifest v${manifestVersion})`);
  statusItem.style.color = 'var(--text-warning)';
}
```

Always visible until reinstall. Out of scope for v0.2.131 if cumbersome; the Notice alone may suffice.

### §2.4 — Build-script sync

`package.json`:
```json
"scripts": {
  "inline-version": "node scripts/inline-plugin-version.mjs",
  "build": "npm run inline-version && ... (existing build chain)"
}
```

Verify the inlined version matches `manifest.json` on every build. If they drift, release.sh's existing version-bump sanity check (HARD RULE) catches it.

### §2.5 — Validation

After build, sanity-check that `main.js` contains the embedded version string:
```bash
grep -c 'PLUGIN_VERSION_AT_BUILD\|"0\.2\.131"' main.js
# Expected: >0 hits matching the released version
```

Add as a release.sh preflight (out of scope for v0.2.131 itself; flag as follow-up).

## §3 — Implementation phases

### §3.1 — Phase 1: build-time inlining

Add `scripts/inline-plugin-version.mjs` per §2.1. Update `package.json` build script. Verify `npm run build` emits a `src/version-constant.generated.ts` and the version is correct.

### §3.2 — Phase 2: onload self-check

Add the §2.2 onload check to `main.ts`. Use `console.error` per the v0.2.120 HARD RULE for the mismatch log.

### §3.3 — Phase 3: integration test

Test via `createIntegrationHarness()` if practical:
- Mock manifest.json with a different version than `PLUGIN_VERSION_AT_BUILD`
- Assert Notice fires + console.error fires
- Assert plugin still loads (doesn't crash)

If harness can't easily mock manifest.json read, document and ship without; the cohort smoke verifies.

### §3.4 — Phase 4: release

v0.2.131 ships with the self-check. After driver/cohort install, any future stale-install hits the Notice and the user gets clear instructions.

## §4 — Tests required

- ~1-2 integration tests for the onload check (if harness supports)
- Existing tests unchanged

Plugin suite: 687 → ~688-689.

## §5 — User-side smoke

```
# Step 1 — install v0.2.131 normally (via BRAT or install-latest.sh).
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.131

# Step 2 — verify the inlined version is in main.js:
grep -c "0.2.131" ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/main.js
# Expected: >0 (the version constant + any other v0.2.131 strings)

# Step 3 — sanity: no Notice on a clean install:
# Open Obsidian. Verify NO "stale main.js" Notice appears (versions match).

# Step 4 — simulate stale install:
# Manually edit manifest.json to claim a different version:
sed -i.bak 's/"version": "0.2.131"/"version": "0.2.999"/' \
  ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Reload Obsidian (Cmd-Q + reopen).
# Expected: Notice fires with "manifest.json claims v0.2.999 but main.js is v0.2.131"

# Step 5 — restore:
mv ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json.bak \
   ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Reload. Notice no longer fires.

# Step 6 — Tamar smoke equivalent: if you have a vault with a stale install
# from before v0.2.131, opening Obsidian there should fire the Notice.
```

## §6 — Open follow-ups

1. **Release.sh preflight check** for inlined-version sync: cite §2.5; ensure release.sh fails if `main.js` doesn't contain the released version string. Adds belt-and-suspenders.
2. **Status-bar persistent indicator** (§2.3): if cohort feedback shows the 30s Notice is missed, add the status bar item.
3. **BRAT upstream report**: this stale-install behavior is a BRAT bug worth reporting upstream. Out of scope here; flag for future advocacy.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 documents the embedding + comparison + validation approach.
- ✓ §57–74 (TDD): integration test for onload check (per §3.3).
- ✓ §76 (don't ship speculative fix): driver-reported cohort regression; concrete diagnosis.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.130; release.sh bumps to 0.2.131.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.120 (console.error HARD RULE): applies — onload version-mismatch is a runtime error worth `console.error` with method name (`Forge onload:`).

## §8 — Architectural framing

V1 cohort install-path defense. Layer on top of v0.2.98's inlined-asset version stamping. v0.2.98 handles `assets/`; v0.2.131 handles main.js itself.

Combined effect: cohort users always see correct UI behavior OR a clear instruction to fix the stale install. No silent regression like the user just hit.

The mechanism doesn't fix BRAT itself; it makes the BRAT bug visible + actionable instead of silent. Going forward we could push BRAT upstream OR ship a "Forge: Verify install" command that triggers the same check on demand.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single focused drain. Suggested order:
1. §3.1 build-time inlining (~20 min)
2. §3.2 onload self-check (~15 min)
3. §3.3 integration test (~30 min if feasible)
4. Release v0.2.131

Estimated CC time: 1-1.5 hours.

If §3.3 integration test is non-trivial (harness can't mock manifest.json read), surface and ship without; smoke covers it.

NOTE: this drain takes v0.2.131. The method-name prefix work originally queued as v0.2.131 (per v0.2.130 §6 #1) moves to v0.2.132.
