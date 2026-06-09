# forge-installer v0.1.1 — persist enable across reload

## Why this prompt exists

v0.1.0 smoke surfaced a bug: forge-installer installs forge-client-obsidian
and the plugin loads in the current session (ribbon icon appears,
Forge command-palette entries available). But on reload, the plugin
is gone — only forge-installer's own commands remain.

Confirmed root cause by inspecting `.obsidian/community-plugins.json`
in a fresh test vault after v0.1.0 install:

```json
[
  "obsidian42-brat",
  "forge-installer"
]
```

`forge-client-obsidian` is missing. Obsidian's `enablePlugin(id)`
enables the plugin in the current session but doesn't always write
to `community-plugins.json`. On reload, Obsidian reads that file,
sees `forge-client-obsidian` not listed, and doesn't enable it.

Fix is a one-line swap from `enablePlugin` to the persisting variant
`enablePluginAndSave`, plus a defensive recovery path for users
already in the v0.1.0-broken state.

## 1. Patch — install path

`src/installer.ts` `activatePlugin`:

```typescript
async function activatePlugin(app: App): Promise<void> {
  const plugins = (app as any).plugins;

  if (plugins.plugins?.[PLUGIN_ID]) {
    await plugins.disablePlugin(PLUGIN_ID);
  }

  await plugins.loadManifests();

  // v0.1.1: enablePluginAndSave persists the enabled state to
  // .obsidian/community-plugins.json so the plugin re-enables on
  // reload. v0.1.0 used enablePlugin which only enabled for the
  // current session and silently dropped on reload.
  if (typeof plugins.enablePluginAndSave === 'function') {
    await plugins.enablePluginAndSave(PLUGIN_ID);
  } else {
    // Fallback for older Obsidian versions that don't expose
    // enablePluginAndSave. saveData persists the enabled-plugins list.
    await plugins.enablePlugin(PLUGIN_ID);
    if (typeof plugins.saveData === 'function') {
      await plugins.saveData();
    }
  }
}
```

The `enablePluginAndSave` API is present in Obsidian 1.4+; we target
1.4.0 in `minAppVersion`, so it should always be available. The
fallback is paranoid belt-and-suspenders — drop it if you'd rather
keep the code simple, and note in deviations.

## 2. Patch — defensive recovery for v0.1.0-stuck users

A user who installed v0.1.0 has `forge-client-obsidian` on disk but
NOT in `community-plugins.json`. When forge-installer auto-runs on
plugin enable, `readInstalledVersion` finds the manifest, sees v0.2.12,
compares to latest v0.2.12, returns `up-to-date`, and never tries to
activate. The user is stuck.

Fix: in `checkAndInstall`'s `up-to-date` branch, additionally verify
the plugin is actually loaded; if not, run the activate path anyway.

```typescript
// In checkAndInstall, BEFORE the early return for up-to-date:
if (installedVersion && !versionGreater(release.tag_name, installedVersion)) {
  // v0.1.1: even if the version is current, the plugin may not be
  // loaded — v0.1.0 had a bug where it enabled but didn't persist.
  // Recover by activating now (which writes community-plugins.json).
  const plugins = (app as any).plugins;
  const isLoaded = !!plugins?.plugins?.[PLUGIN_ID];
  if (!isLoaded) {
    await activatePlugin(app);
    return {
      status: 'updated',
      detail: `v${installedVersion} re-enabled (was unloaded)`,
    };
  }
  return { status: 'up-to-date', detail: `v${installedVersion} is current` };
}
```

The status is `updated` rather than `up-to-date` so the user sees a
clear Notice that something happened ("Forge Client v0.2.12 re-enabled
(was unloaded)"), which is the signal that the recovery worked.

## 3. Tests

Add to `src/installer.test.ts` (or wherever the pure-core tests live)
ONE shape test:

- `enablePluginAndSave detection` — given a mock plugins object with
  `enablePluginAndSave` as a function, assert the new code path
  selects it; given one without, assert the fallback path is used.

The actual Obsidian-coupled activation logic isn't shimmable, so
this is the load-bearing assertion that future Obsidian API changes
won't silently regress. Manual smoke step 5 in §6 covers the live
test.

If extracting the API-detection logic into a pure helper is too
invasive for v0.1.1, skip the test addition and flag in deviations.

## 4. Version bump + release

- `manifest.json`: `0.1.0` → `0.1.1`.
- `versions.json`: add `"0.1.1": "1.4.0"`.
- `npm run build` → fresh `main.js`.
- GH release for `v0.1.1` with `main.js` + `manifest.json` +
  `styles.css` attached (plain files, matching v0.1.0's convention).

README doesn't need version-specific updates.

## 5. Auto-smoke

| Check | Result |
| --- | --- |
| `npm run build` | exit 0 |
| `npm test` | all green |
| Static grep: `grep -c enablePluginAndSave src/` | ≥1 hit (the new call) |
| Static grep: `grep -c "enablePlugin\b" src/` | should be 0 or 1 (the fallback only) |
| GH asset SHAs match local | yes |

## 6. Manual smoke guidance for user

Two paths to validate, both quick:

### 6a. Recovery path (existing v0.1.0-stuck vault)

1. In the existing `~/forge-vaults/smoke-installer` vault (which has the v0.1.0 bug state):
2. BRAT → "Check for updates for plugin" → select forge-installer → update to v0.1.1.
   (Or remove + re-add via BRAT if "Check for updates" doesn't work.)
3. Reload Obsidian.
4. forge-installer auto-runs. Expect Notice:
   `Forge Client: updated (v0.2.12 re-enabled (was unloaded))`.
5. Verify Forge ribbon icon appears AND survives a second reload.
6. Verify `.obsidian/community-plugins.json` now contains
   `forge-client-obsidian`.

### 6b. Fresh-install path (validates v0.1.1 from scratch)

1. New fresh vault: `mkdir ~/forge-vaults/smoke-installer-v0.1.1`.
2. Open in Obsidian.
3. Enable Community plugins.
4. Install BRAT → enable.
5. BRAT → Add beta plugin → `frmoded/forge-installer`.
6. Wait for "Forge Client installed — fresh → v0.2.12" Notice.
7. **Reload Obsidian** — this is the load-bearing check.
8. Verify Forge ribbon icon present AND Forge commands appear in
   Cmd+P AND `community-plugins.json` includes `forge-client-obsidian`.
9. Run "Forge: Open MoDa simulation" → click "Run simulation" →
   confirm ink droplet dispersion renders.

If both paths pass: v0.1.1 closes the closed-beta install loop. The
true one-paste install is real.

## 7. Deviations

Standard section. Specific things to flag:

- Whether the `enablePluginAndSave` fallback was kept or dropped (§1).
- Whether the API-detection test was added or skipped (§3).
- If recovery-path smoke (§6a) shows different behavior than expected
  (e.g., BRAT's "Check for updates" doesn't trigger forge-installer
  re-run), document the actual recovery sequence in feedback.

## 8. Out of scope

- Backporting to v0.2.x of forge-client-obsidian (the bug is in
  forge-installer, not the client plugin).
- Adding a "manual recovery" command to forge-installer for users
  who lost trust in the auto-recovery — the auto-recovery in §2
  should cover it.
- Surface area changes to forge-installer settings (pinned-tag,
  disable-after-first-install) — unchanged.

## 9. Feedback file format

Standard, fresh-enumerated. Frontmatter timestamp + session_id +
status. File at
`prompts/feedback/2026-05-31-2100-forge-installer-v0.1.1-persist-enable.md`.

Feedback §3 should report which path it took (`enablePluginAndSave`
or the fallback) and how it confirmed which API the installed
Obsidian exposes.
