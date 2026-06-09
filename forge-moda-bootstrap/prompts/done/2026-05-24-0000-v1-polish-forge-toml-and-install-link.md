# V1 polish — forge.toml ENOENT cleanup + INSTALL.md release link pin

## Scope

Pre-seminar polish bundle, single repo (`forge-client-obsidian`). Two small fixes plus a release.

What this prompt delivers:

1. **Suppress the `forge.toml` ENOENT console error on plugin load.** In `loadActiveDomains` (or wherever `forge.toml` is read on startup), gate the read on `app.vault.adapter.exists("forge.toml")` before attempting `read()`. If absent, fall through silently to "register all commands" (existing behavior) without the red console error. Student vaults without forge.toml are the common case.

2. **Pin INSTALL.md download link to a specific version** (the one this prompt cuts). Today the link points at `/releases` (latest) — if a later breaking release lands by accident, students following the doc would install it. Pin to `releases/tag/v<this-prompt's-version>` so closed-beta students get the verified-shippable artifact.

3. **Cut a new release** with both fixes. Per the new protocol: CC bumps version (patch — these are fixes), commits with the prompt-filename-in-brackets format, pushes, tags, creates the GH release with the zip attached, and does a clean-vault smoke before declaring success.

Does NOT:

- Touch the iframe, engine, or any other repo.
- Add music21 / forge-music / forge-core. Phase 3.
- Build the α transpile service.
- Change the plugin's behavior beyond suppressing the ENOENT noise.
- Re-tag or recreate v0.2.2.

## Why

V1 0.2.2 ships clean in the technical sense — clean-vault smoke passed end-to-end. But two small frictions remain before sending to Tamar's seminar:

- **Red console errors are alarming to non-developers.** Students who open dev tools (or whose Obsidian shows error notifications) will see the `ENOENT: ... forge.toml` line and assume something's broken. It isn't, but the noise is unprofessional and triggers support requests.
- **`/releases` (latest) link drifts.** If a later release breaks something (V0.3.0 with music21, for example), students re-following INSTALL.md would install the broken latest. Pinning to a specific tag protects the closed-beta cohort from drift.

Both fixes are sub-5-line changes. Bundle into one release.

## Files to modify

### `forge-client-obsidian/src/main.ts` (or wherever `loadActiveDomains` lives)

Find the `loadActiveDomains` function (referenced in the V1 release-zip smoke's console output: `Forge: could not read forge.toml domains; registering all commands Error: ENOENT...`).

Current shape is presumably:

```typescript
async loadActiveDomains() {
  try {
    const tomlContent = await this.app.vault.adapter.read("forge.toml");
    // parse + extract domains
    ...
  } catch (e) {
    console.error("Forge: could not read forge.toml domains; registering all commands", e);
    // fall through to register-all-commands path
  }
}
```

After:

```typescript
async loadActiveDomains() {
  const tomlExists = await this.app.vault.adapter.exists("forge.toml");
  if (!tomlExists) {
    // Student vaults without forge.toml are the common case. Fall through
    // silently to register-all-commands. No console noise — the absence
    // is expected, not an error.
    return;
  }
  try {
    const tomlContent = await this.app.vault.adapter.read("forge.toml");
    // parse + extract domains
    ...
  } catch (e) {
    // Read OR parse failure — different from absence; this IS an error.
    console.error("Forge: could not read forge.toml domains; registering all commands", e);
  }
}
```

Distinction: absent = silent; present-but-broken = error. Today both paths log the same alarming error.

Verify by reading the file first — the actual code structure may differ slightly. Adjust accordingly.

### `forge-client-obsidian/manifest.json`

Bump `version` from `0.2.2` to `0.2.3`. Patch bump — these are post-V1 polish fixes, no new features.

### `forge-client-obsidian/INSTALL.md`

Find the download link in the install steps. Likely something like:

```markdown
1. **Download** `forge-client-obsidian-v<latest>.zip` from the [GitHub Releases page](https://github.com/frmoded/forge-client-obsidian/releases).
```

Change to:

```markdown
1. **Download** `forge-client-obsidian-v0.2.3.zip` from the [v0.2.3 release page](https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.3).
```

Replace any other `<latest>` placeholders with `v0.2.3` for consistency. The release-page URL pattern is `releases/tag/v0.2.3` (not `releases/v0.2.3` — verify by checking the existing v0.2.2 link format if INSTALL.md or the repo has a similar reference).

### Tests

No new tests practical (both fixes are surface-level: a guard clause + a doc string). The plugin's 42/42 test suite must still pass after the main.ts change.

## Implementation notes

### Adapter exists API

Verify the exact method signature. Some plugins use `adapter.exists(path)` (boolean); some use `adapter.stat(path)` returning null/object. Check Obsidian's plugin docs or grep existing forge-client-obsidian code for prior `exists` calls.

### Idempotency

Running this prompt twice (e.g., after a re-roll) should be safe. The version bump is the only state change — if `manifest.json` is already at 0.2.3, CC should detect and either re-tag (idempotent) or bump to 0.2.4 (additive). Pick the simpler — if 0.2.3 already exists in the registry of tags, bump to 0.2.4. Document the choice.

## Tests + smoke

### Auto-verified by CC (per new smoke-automation protocol)

- `npm run build` — exits 0, main.js produced.
- `npm test` — 42/42 plugin tests pass.
- `npm run release-zip` — produces `dist/forge-client-obsidian-v0.2.3.zip`, expect ~11.20 MB.
- Verify zip contents structure (`unzip -l`).
- **Clean-vault smoke** (per new release-shipping rule):
  - Create `~/test-vaults/v1-smoke-0.2.3/`.
  - Download the just-uploaded zip via `gh release download v0.2.3 -p '*.zip' -D ~/test-vaults/v1-smoke-0.2.3/`.
  - Unzip into `~/test-vaults/v1-smoke-0.2.3/.obsidian/plugins/`.
  - Verify `manifest.json` shows `version: 0.2.3`.
  - Verify all expected subdirs present under `assets/`.
- Git ops: commit with `[2026-05-24-0000-v1-polish] forge.toml ENOENT cleanup + INSTALL.md link pin` message header. Push to main. Tag `v0.2.3`. Push tag. `gh release create v0.2.3 ./dist/forge-client-obsidian-v0.2.3.zip --title 'V1 polish v0.2.3' --notes <brief release notes>`.

### Deferred to user (Obsidian-context)

- Open Obsidian in a fresh vault (or `~/test-vaults/v1-smoke-0.2.3/`).
- Enable plugin in Settings → Community plugins.
- Reload Obsidian.
- Open dev console. **Confirm NO `ENOENT: ... forge.toml` red error appears on plugin load.** (Other console lines fine; just the specific one we're suppressing.)
- Verify `Forge: Open MoDa simulation` still works.
- Verify INSTALL.md's link click resolves to the v0.2.3 release page.

## Out of scope

- Music21 / forge-music / forge-core. Phase 3.
- α transpile service. Big follow-up.
- Hot-reload of MEMFS user-vault edits.
- Performance optimization (14fps live loop).
- Settings UI polish beyond what these two fixes touch.
- Re-tagging v0.2.2.
- Any other repo.

## Report when done

Per protocol 8-section. Specifically:

1. **`main.ts` diff** — the `loadActiveDomains` change, before/after.
2. **`manifest.json` diff** — version bump.
3. **`INSTALL.md` diff** — link change.
4. **Auto-smoke output** — build pass, test count, zip size + SHA-256, clean-vault smoke results (manifest.json verified, subdirs verified).
5. **Git ops** — commit SHA, tag, GH release URL.
6. **Manual smoke guidance** — the 5 deferred-to-user steps above.
7. **Any deviation and why.**
8. **One observation.**

## Commits + push

CC commits + pushes + tags + creates GH release per the updated protocol's default-on git ops. Commit message:

```
[2026-05-24-0000-v1-polish] forge.toml ENOENT cleanup + INSTALL.md link pin (v0.2.3)

- loadActiveDomains: gate forge.toml read on exists() check; absence
  is expected for student vaults, not an error worth logging.
- INSTALL.md: pin download link to v0.2.3 release page (was /releases
  latest, drifts on future releases).

Patch bump only — no behavior change beyond suppressing one console
error.
```

Tag: `v0.2.3`. GH release: brief notes referencing this commit + the cleanups.

## Don'ts

- **Don't bundle anything from Phase 3.** No music21, no forge-music.
- **Don't change the engine or iframe.**
- **Don't refactor `loadActiveDomains` beyond the guard clause.** Surgical.
- **Don't change the INSTALL.md beyond the link.** Don't add screenshots, troubleshooting expansion, etc. — separate prompt for docs polish.
- **Don't suppress legitimate errors.** Read-failure when forge.toml IS present (corrupted file, permission issue) stays logged as before.
- **Don't re-tag v0.2.2** under any circumstance.
- **Don't ship without the clean-vault smoke.** This is the new release-shipping rule.
- **Don't fork the release pipeline.** Use the existing `npm run release-zip` + `gh release create` flow.
- **Don't proceed past a blocker.** If `loadActiveDomains` isn't where I assumed, find it; if the structure doesn't match, route to questions/.
