---
timestamp: 2026-05-31T22:55:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-31T21:00:00Z
status: success
---

# forge-installer v0.1.1 — persist enable across reload

## 1. Install-path patch

`src/installer.ts:activatePlugin` — swapped the v0.1.0
`enablePlugin` for the documented Obsidian 1.4+ persisting variant
`enablePluginAndSave`, with a fallback to `enablePlugin` +
`saveData()` for hypothetical future API rename. The
API-shape decision lives in a new pure-core file
`src/enable-strategy.ts` (`selectEnableStrategy(plugins)`) so
`node --test` exercises it without an obsidian shim.

The throw-with-clear-error path fires when neither shape is intact
— better than silently regressing to the v0.1.0 no-persist bug.

```typescript
const strategy = selectEnableStrategy(plugins);
if (strategy === 'enablePluginAndSave') {
  await plugins.enablePluginAndSave(PLUGIN_ID);
} else if (strategy === 'enablePluginWithSaveData') {
  await plugins.enablePlugin(PLUGIN_ID);
  await plugins.saveData();
} else {
  throw new Error(
    'Obsidian plugin manager exposes no enablePluginAndSave or '
    + 'enablePlugin+saveData — Forge Installer cannot persist the enable',
  );
}
```

## 2. Defensive recovery for v0.1.0-stuck users

`checkAndInstall`'s up-to-date branch now also probes
`(app as any).plugins.plugins?.[PLUGIN_ID]`. When the plugin is
installed but not loaded (the v0.1.0 bug state), it runs the
activate path and returns `{ status: 'updated', detail:
'v0.X.Y re-enabled (was unloaded)' }`. Surfacing as `updated`
rather than `up-to-date` means the user sees the recovery happened
via the existing 8-second Notice path.

The recovery is automatic — no BRAT remove + re-add needed for
v0.1.0-stuck users. Just installing v0.1.1 over v0.1.0 via BRAT
"Check for updates", then reloading once, gets them out.

## 3. API path taken + how confirmed

**Path the installed plugin will actually take at runtime:**
`enablePluginAndSave`. Obsidian 1.4.0+ exposes it (per the
prompt's note and the public migration guidance from Obsidian
1.3 → 1.4). The fallback exists as belt-and-suspenders but is not
the expected path.

**How confirmed** — the only test environment that can definitively
answer "which path fires here" is a live Obsidian session
(`(app as any).plugins.enablePluginAndSave` returns a function vs
`undefined`). That confirmation is part of the manual smoke
(§6 below). The pure-core `selectEnableStrategy` tests confirm the
DECISION logic — which path the installer takes given each
possible plugin-manager shape.

## 4. Tests

`src/enable-strategy.test.ts` — 8 new pure-core cases:

| Case | Asserts |
| --- | --- |
| prefers `enablePluginAndSave` when present | both APIs available → returns `'enablePluginAndSave'` |
| falls back when missing | only `enablePlugin` + `saveData` → returns `'enablePluginWithSaveData'` |
| empty plugins returns null | caller throws clear error rather than silently swallowing |
| `enablePlugin` alone (no `saveData`) returns null | the exact v0.1.0 bug shape — reject explicitly |
| `saveData` alone (no `enablePlugin`) returns null | defensive |
| non-function fields rejected | typeof check guards against future shape changes |
| null input returns null | defensive |
| non-object inputs return null | defensive (undefined, string, number, array) |

Suite: **23/23** in ~67ms (15 prior + 8 new).

## 5. Version bump + release

- `manifest.json`: `0.1.0` → `0.1.1`.
- `versions.json`: added `"0.1.1": "1.4.0"`.
- `main.js`: 20.7 KB → 21.7 KB (the new enable-strategy module +
  the recovery branch).
- GH release: <https://github.com/frmoded/forge-installer/releases/tag/v0.1.1>.

Release asset SHAs (all match local + GH digest):
- `main.js` — `a29c02ee1b3cb18bcbfe9dbbfb4f28019dbfd5d1899587a2dccc45110f97ef1a`
- `manifest.json` — `1100814a35db57c3013594bd91f41f0154d64f5d897fdfffa9d46646b7889778`
- `styles.css` — `8c0f96b75aa21ffef582e46e63e6c60aec64987fdf9bbb63daa3bf58d470f7c7`
  (unchanged from v0.1.0)

## 6. Auto-smoke output

| Check | Result |
| --- | --- |
| `npm run build` | exit 0; `main.js` 21.7 KB |
| `npm test` | 23/23 in ~67ms |
| `grep -c enablePluginAndSave src/` | 11 hits (5 installer + 6 enable-strategy) — well above ≥1 |
| `grep enablePlugin\b src/` | 1 fallback call site at `installer.ts:222` + comments only — matches prompt's "0 or 1" guidance |
| GH asset SHAs match local | yes (all 3) |

## 7. Manual smoke guidance for user

### 6a. Recovery path (v0.1.0-stuck vault)

1. Existing `~/forge-vaults/smoke-installer` (with the v0.1.0 bug).
2. BRAT → "Check for updates for plugin" → forge-installer → v0.1.1.
3. **Reload Obsidian.**
4. Expect Notice: **"Forge Client: updated (v0.X.Y re-enabled (was unloaded))"**.
5. Verify Forge ribbon icon appears AND survives a SECOND reload.
6. Verify `.obsidian/community-plugins.json` now contains
   `forge-client-obsidian`.

### 6b. Fresh-install path (validates v0.1.1 from scratch)

1. New fresh vault.
2. Settings → Community plugins → Turn on.
3. Install BRAT → enable.
4. BRAT → Add beta plugin → `frmoded/forge-installer`.
5. Wait for "Forge Client installed — fresh → v0.X.Y" Notice.
6. **Reload Obsidian** — load-bearing.
7. Verify Forge ribbon icon present AND Forge commands in Cmd-P AND
   `community-plugins.json` includes `forge-client-obsidian`.
8. **Reload a second time** — install must persist.
9. Run "Forge: Open MoDa simulation" → "Run simulation" → confirm
   ink droplet dispersion renders.

## 8. Git ops

- Commit `dc4f2f3` on `main` —
  `[2026-05-31-2100-forge-installer-v0.1.1-persist-enable] v0.1.1 — persist plugin enable across reload`.
- Pushed to `origin/main`.
- Tag `v0.1.1`, pushed.
- GH release with `main.js` + `manifest.json` + `styles.css` —
  digests match local SHAs (§5 above).

## 9. Deviations

- **Fallback kept** (prompt §1 left this optional). Rationale: the
  cost is 5 lines of code; the upside is "we don't silently
  re-introduce the v0.1.0 bug if Obsidian renames the API." The
  decision lives in a pure helper that's free to call from a
  one-shot decision — no runtime tax.
- **API-detection test ADDED via pure-core split.** The prompt
  permitted skipping if extraction was too invasive; here it
  wasn't — same `version.ts` / `zip-paths.ts` pattern already
  established in v0.1.0. Eight cases cover the strategy decision
  shape comprehensively.
- **Throw-with-clear-error when neither shape is intact.** Not
  in the prompt directly. Better than silently going through a
  partial-success path — the Notice surfaces an actionable failure
  rather than the install evaporating on reload.

## 10. Out of scope confirmed

- No backports to forge-client-obsidian (bug is installer-side).
- No "manual recovery" command — the §2 auto-recovery covers it.
- No settings UI changes.

## 11. One observation

This is the second consecutive forge-installer release driven by
"the cast through `(app as any).plugins` opens a contract I can't
verify until live Obsidian." The escape hatch is fine for closed
beta, but every time we extend the `app.plugins` surface use, the
fingerprint of "is this Obsidian release going to break the
installer" grows.

The pure-core `selectEnableStrategy` pattern from this prompt is
the right shape for guarding that boundary going forward: any new
`(app as any).plugins.x()` call gets a paired
`selectXStrategy(plugins)` decision in a pure file, tested against
expected shape. Catches API renames / removals at suite time, not
at student-reload time. Worth adopting as a convention before the
installer accrues more `(app as any)` surface.
