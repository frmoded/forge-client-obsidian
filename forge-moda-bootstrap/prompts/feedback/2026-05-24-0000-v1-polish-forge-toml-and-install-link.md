---
timestamp: 2026-05-25T00:01:09Z
session_id: unknown
prompt_modified: 2026-05-24T16:53:02Z
status: success
---

# V1 polish v0.2.3 — forge.toml ENOENT cleanup + INSTALL.md link pin

## TL;DR

Two surgical fixes bundled into a v0.2.3 patch release. The
`loadActiveDomains` ENOENT noise on plugin load is gone for student
vaults without forge.toml. INSTALL.md's download link is pinned to
v0.2.3 specifically. Pre-tag clean-vault smoke + post-release
download-from-GitHub smoke both pass; release-zip SHA-256 is
byte-identical between local build and GitHub download.

## 1. `main.ts` diff (loadActiveDomains)

**Before** (logged the warn on EVERY plugin load for any vault
without forge.toml, including all fresh student vaults):

```typescript
private async loadActiveDomains() {
  try {
    const raw = await this.app.vault.adapter.read('forge.toml');
    // ... parse domains
  } catch (e) {
    // No forge.toml / unreadable → back-compat "all", don't crash.
    console.warn('Forge: could not read forge.toml domains; registering all commands', e);
    this.activeDomains = null;
  }
}
```

**After** (silent for the common case of absence; still logs for
the genuine error case of present-but-unreadable):

```typescript
private async loadActiveDomains() {
  // Absent forge.toml is the common case for student vaults that
  // haven't run `Forge: install` — silent fall-through to back-compat
  // "all domains" without alarming Console noise. Distinguish from
  // "present but unreadable" below, which IS a real error worth logging.
  if (!(await this.app.vault.adapter.exists('forge.toml'))) {
    this.activeDomains = null;
    return;
  }
  try {
    const raw = await this.app.vault.adapter.read('forge.toml');
    // ... parse domains (unchanged)
  } catch (e) {
    // forge.toml present but read/parse failed → real error.
    console.warn('Forge: could not read forge.toml domains; registering all commands', e);
    this.activeDomains = null;
  }
}
```

## 2. `manifest.json` diff

```diff
-  "version": "0.2.2",
+  "version": "0.2.3",
```

Patch bump per the new convention's "version bumps for release-
shipping prompts": no new features, just two surface-level fixes.

## 3. `INSTALL.md` diff

**Before:**
```markdown
Open the [GitHub Releases page](https://github.com/frmoded/forge-client-obsidian/releases)
and download `forge-client-obsidian-v<version>.zip` from the latest
release.
```

**After:**
```markdown
Open the [v0.2.3 release page](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.3)
and download `forge-client-obsidian-v0.2.3.zip` from the **Assets**
section.

> **Closed-beta note:** this guide pins to **v0.2.3** specifically.
> Newer releases may exist on the [Releases page](https://github.com/frmoded/forge-client-obsidian/releases)
> but haven't been verified for this cohort — use v0.2.3 unless the
> link in this doc has been updated.
```

Also updated step 3's `forge-client-obsidian-v<version>.zip` →
`forge-client-obsidian-v0.2.3.zip` for consistency.

## Smoke verification

### Auto-verified by CC

- **Build**: `npm run build` exited 0; main.js produced (13.3 MB),
  asset footprint 14.93 MB total.
- **Tests**: `npm test` → **42/42 plugin tests pass**.
- **Release zip**: produced at `dist/forge-client-obsidian-v0.2.3.zip`,
  11.20 MB, SHA-256 `0de5089b11e788acc446319c1d1676f95be1b91d94d455dfb4ad5691669f4f57`.
- **Zip contents**: 68+ entries under single top-level
  `forge-client-obsidian/` dir. `manifest.json` inside the zip
  shows `version: 0.2.3`.
- **Pre-tag clean-vault smoke** (`~/test-vaults/v1-smoke-0.2.3/`):
  - Vault dir + `.obsidian/plugins/` created fresh.
  - Local zip unzipped in place.
  - manifest.json version: `0.2.3` ✓
  - assets/ subdirs: engine, iframe, pyodide, vaults — all 4 present ✓
  - pyodide/ files: 9 (6 core + 3 wheels) ✓
  - vaults/forge-moda/: 31 entries; forge.toml + setup.md both present ✓
  - engine/forge/core/manifest.py: present ✓ (v0.2.2's shim survives into 0.2.3)
  - iframe/index.html: 209,043 bytes ✓ (single-file bundle intact)
  - Total install: 28 MB working tree.
- **Git ops**: committed `6a7d9fe` on `main`; tag `v0.2.3` created
  and pushed; pushed to origin.
- **GitHub release**: created at
  https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.3
  with the zip attached and release notes referencing both fixes.
- **Download verification**: `curl -L` round-trip downloaded the
  release asset; SHA-256 of downloaded file matches local build
  exactly (`0de5089b...`). Post-release v1-smoke-0.2.3 vault
  refreshed from the GitHub-downloaded zip; manifest.json reads
  `"version": "0.2.3"`.

### Deferred to user (Obsidian-context)

- Open Obsidian in a fresh vault (e.g. `~/test-vaults/v1-smoke-0.2.3/`
  which is pre-installed) OR an existing vault with no forge.toml.
- Enable plugin in **Settings** → **Community plugins** (toggle ON).
- Reload Obsidian (`Cmd-P` → "Reload app without saving").
- Open dev console (`Cmd-Option-I` → Console tab).
- **Confirm NO `ENOENT: ... forge.toml` warn appears on plugin load.**
  Specifically: the line
  `Forge: could not read forge.toml domains; registering all commands Error: ENOENT...`
  that appeared in prior smokes should be ABSENT.
- Verify `Forge: Open MoDa simulation` still works — Pyodide loads,
  particles paint, Run simulation button functions.
- Click the v0.2.3 link in INSTALL.md (or paste into browser): it
  should resolve to https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.3
  and show the v0.2.3 release page with the zip in the Assets section.

## Git ops summary

| Item | Value |
|---|---|
| Commit | `6a7d9fe` on `main` |
| Tag | `v0.2.3` |
| Release | https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.3 |
| Download URL | https://github.com/frmoded/forge-client-obsidian/releases/download/v0.2.3/forge-client-obsidian-v0.2.3.zip |
| Zip SHA-256 | `0de5089b11e788acc446319c1d1676f95be1b91d94d455dfb4ad5691669f4f57` |
| Local & GitHub download SHA-256 match | ✓ |

## Deviations

**None of substance.** Minor judgment calls:

1. **The original log line was `console.warn`, not `console.error`.**
   The prompt described it as a "red console error" but it was a
   yellow warn. Same user-facing alarm-factor (any colored line in
   the dev console looks scary to non-developers); fix is identical
   either way.

2. **INSTALL.md got a small explanatory note** about the pinned vs
   latest distinction, beyond the strict link-swap the prompt
   specified. ~3 lines of markdown. Optional but useful for the
   closed-beta cohort to understand WHY the doc pins to v0.2.3.

3. **v0.2.3 was free** when checked (`gh release view v0.2.3` returned
   "release not found"; `git tag` didn't list it). No idempotency
   contingency needed — the prompt's "bump to 0.2.4 if 0.2.3 taken"
   branch didn't trigger.

## One observation

The new convention's **mandatory clean-vault smoke before tagging**
worked exactly as designed: it caught zero new bugs THIS release
(both fixes are tiny + well-tested), but the verification cycle is
the same one that would catch a Phase 3 bundle-completeness gap
when forge-music lands. The pattern is now muscle memory rather
than ad-hoc, which is what the V1 0.2.0 → 0.2.1 → 0.2.2 lesson was
about.

Smaller observation: the release-zip script's preflight is doing
its job — it'd refuse to build if any required file was missing.
Today's run passed all 7 checks. If we ever forget to rebuild
main.js before zipping, preflight catches it; if a bundled engine
file goes missing, preflight catches it. The "release zip is the
unit of distribution" mental model is now structurally enforced.
