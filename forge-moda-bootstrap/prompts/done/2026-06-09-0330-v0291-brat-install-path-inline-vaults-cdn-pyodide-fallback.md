---
timestamp: 2026-06-09T03:30:00Z
session_id: drain-2026-06-09-0330
status: pending
priority: CRITICAL — cohort onboarding gate; Tamar install blocked
---

# v0.2.91 — BRAT install path: inline vault content + CDN-fallback Pyodide/wheels

## §0 — Bug + constraint

**Driver smoke against v0.2.90 on Tamar's laptop and on local test_tamar vault (2026-06-09-0300):**

> Install Forge via BRAT. Open new vault. forge-tutorial doesn't auto-extract. forge-moda doesn't auto-extract. No 🔥 buttons appear (no snippets visible).

**Console output**:
```
Forge: bundled forge-moda missing from plugin assets; skipping extraction
Forge: bundled forge-tutorial missing from plugin assets; skipping extraction
```

**Plugin directory after BRAT install** (`ls -la ~/forge-vaults/test_tamar/.obsidian/plugins/forge-client-obsidian/`):
```
data.json       182 bytes
main.js         13.4 MB
manifest.json   225 bytes
styles.css      16 KB
```

**No `assets/` directory.** BRAT downloads only the canonical files (main.js + manifest.json + styles.css + data.json). The 38 MB worth of bundled assets (vaults ~0.2 MB, engine ~0.22 MB, iframe ~0.21 MB, pyodide ~14.6 MB, wheels ~22.8 MB, welcome ~0) shipped via release.sh into `assets/` never reach a BRAT-installed plugin.

**Hard constraint from driver**: cohort users (Tamar, non-developer) must be able to install Forge using ONLY BRAT — no terminal commands, no manual rsync, no source checkout. This is the cohort onboarding gate.

## §1 — Goal

Restructure the build + runtime so that BRAT install (4 canonical files) is sufficient for:
1. Plugin loads successfully on first install
2. forge-tutorial auto-extracts into the vault on first run (visible 🔥 button works)
3. forge-moda + forge-music auto-extract per forge.toml `domains` declaration
4. First snippet Forge-click works (Pyodide loads from CDN if local assets absent)
5. Music snippets work (music21 wheel loads from CDN if local absent)

Net effect: cohort onboarding is "BRAT install + open vault + click 🔥" — no manual steps.

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Audit current asset locations + extraction logic

Read `src/welcome.ts` (or wherever the `ensureBundledVault` function lives — error message "bundled X missing from plugin assets; skipping extraction" identifies the call site). Document:
- How extraction reads from `assets/vaults/<domain>/` on disk
- Whether the file paths are computed via `path.join(pluginDir, 'assets', 'vaults', domain)` or via a different pattern
- The `manifest.id` resolution path

Identify what would change to read from inlined data instead of disk.

### §2.2 — Asset size breakdown

Run `npm run build` + audit the asset bundle:
```
du -sh assets/vaults/*
du -sh assets/engine
du -sh assets/iframe
du -sh assets/pyodide
du -sh assets/wheels
du -sh assets/welcome 2>/dev/null
```

Confirm the per-bundle size budget for inlining decisions:
- Tier 1 inlined: vaults + engine + iframe (~0.6 MB total)
- Tier 2 CDN-fallback: pyodide (~14.6 MB) + wheels (~22.8 MB)

If any tier 1 bundle is >5 MB, surface for re-tiering decision.

### §2.3 — Pyodide CDN fallback contract

Pyodide standard CDN URL pattern: `https://cdn.jsdelivr.net/pyodide/v<version>/full/`. Read `src/pyodide-host.ts` to find:
- Where Pyodide is loaded from (`indexURL` configuration)
- Current bundled Pyodide version
- Whether `loadPyodide({ indexURL })` can accept a CDN URL OR requires local assets

If Pyodide's bundled version is unusual (custom build), CDN fallback may not have matching URL. Verify with a quick `curl -I https://cdn.jsdelivr.net/pyodide/v<version>/full/pyodide.js` from CC's shell.

### §2.4 — music21 wheel CDN fallback

The music21 wheel is custom (corpus-stripped — per v1 phase 4 work). It's NOT on PyPI in this trimmed form. Two options:
- (a) Use full PyPI music21 wheel via CDN (larger, but PyPI-served)
- (b) Vendor the trimmed wheel to a stable URL (e.g., GitHub raw, or a Forge-controlled CDN)
- (c) Lazy-fetch from the GitHub release artifact directly

Investigate which is feasible + reliable. (c) is appealing if GitHub raw URLs are stable across releases.

### §2.5 — Bundle inlining mechanism

Determine the inlining mechanism:
- (a) Build script generates a `src/bundled-assets.ts` file containing base64-encoded vault content from `assets/vaults/`
- (b) esbuild's `loader: { '.md': 'binary' }` or similar bundling pattern
- (c) Webpack-style asset modules (esbuild may have equivalent)

Recommend (a) — most predictable, no esbuild magic. Build script (`scripts/inline-bundled-assets.mjs`) generates the .ts file before esbuild runs. The runtime reads from the generated module.

### §2.6 — Backward compatibility with local `assets/` (dev workflow)

The local `install-latest.sh` workflow places `assets/` on disk. After this change:
- Runtime should prefer inlined data (always present)
- Local `assets/` becomes vestigial for vaults — can stay for dev's `npm run build` validation
- Pyodide loading: prefer local `assets/pyodide/` if present (dev), fall back to CDN (cohort BRAT install)

### §2.7 — Bundle the engine + iframe assets too?

Engine (~0.22 MB) and iframe (~0.21 MB) are also disk-loaded today. Inline them in the same drain — same mechanism, same scope. Total inlined: ~0.6 MB. main.js grows from 13.4 MB to ~14 MB. Acceptable.

## §3 — Implementation phases

### §3.1 — Phase 1: inline vault content

Build a new script `scripts/inline-bundled-assets.mjs`:
- Read every file under `assets/vaults/<domain>/`
- For each domain: produce a JSON-encoded structure `{ "forge-tutorial": { "forge.toml": "<content>", "01-hello/hello_world.md": "<content>", ... } }`
- Encode binary files (if any) as base64
- Write the result as `src/bundled-vaults.generated.ts` exporting the structure

Update `package.json`:
- Add `inline-assets` script: `node scripts/inline-bundled-assets.mjs`
- `build` script: prepend `inline-assets` before lint + esbuild

Update runtime (likely in `src/welcome.ts` or wherever `ensureBundledVault` lives):
- Read from `BUNDLED_VAULTS[domain]` instead of `assets/vaults/<domain>/` on disk
- Write each file to `vault/<domain>/<relative-path>` via Obsidian's vault API

Update extraction error message: instead of "bundled X missing from plugin assets," it's now an internal error — should never fire because the bundle is always inlined.

### §3.2 — Phase 2: inline engine + iframe

Same mechanism for `assets/engine/` and `assets/iframe/`. Runtime reads from `BUNDLED_ENGINE` and `BUNDLED_IFRAME` constants.

### §3.3 — Phase 3: Pyodide CDN fallback

Update `src/pyodide-host.ts` Pyodide loading:
- Check if `assets/pyodide/` is present at runtime (via `adapter.exists(path)` or similar)
- If present: use local `indexURL`
- If absent: use `https://cdn.jsdelivr.net/pyodide/v<version>/full/`

Add user-visible Notice on first CDN load: `Forge: downloading Pyodide runtime (one-time, ~15 MB)...`. Dismiss when load completes.

If load fails (network error): clear error message + retry button.

### §3.4 — Phase 4: music21 wheel CDN fallback

Per §2.4 investigation outcome. If (c) GitHub raw URL is chosen: hardcode the URL to the wheel artifact in the Forge release.

Lazy-load on first music-domain snippet click (not on plugin init).

### §3.5 — Phase 5: dev workflow verification

`npm run build` + `bash scripts/release.sh 0.2.91` should still work. The inlining adds to main.js but `assets/` directory is still produced (vestigial but valid for dev install-latest.sh).

### §3.6 — Phase 6: BRAT install smoke

CC tests via the same install path Tamar would use:
1. Build v0.2.91 release
2. Publish to GH releases
3. In a CLEAN test vault: BRAT install + verify extraction fires + verify hello_world Forge-click works (Pyodide CDN download visible in Notice)

## §4 — Tests required

- **Build-time test**: `scripts/inline-bundled-assets.test.mjs` verifies the generated `bundled-vaults.generated.ts` has the expected structure for a known-good fixture.
- **Runtime test**: `src/welcome.test.ts` (or wherever extraction logic lives) verifies extraction from inlined data writes the expected files.
- **Pyodide CDN-fallback test**: mock `adapter.exists()` returning false for local assets; assert `indexURL` falls back to CDN URL.
- **Music21 CDN-fallback test**: similar pattern.
- Estimated new tests: ~5-7.

## §5 — User-side smoke

```
# Step 1 — BRAT install v0.2.91:
#   In Obsidian: Settings → Community plugins → BRAT settings
#   → "Add beta plugin" → "frmoded/forge-client-obsidian"
#   BRAT downloads + installs (~14 MB main.js).

# Step 2 — Enable plugin via Settings → Community plugins toggle.

# Step 3 — Cmd-Q + reopen Obsidian.

# Step 4 — In a CLEAN vault, open DevTools console (Cmd-Opt-I), filter on "Forge:":
#   Expected console output:
#     "Forge: runFirstRunCheck starting"
#     "Forge: extracted bundled forge-tutorial into vault"
#     "Forge: extracted bundled forge-moda into vault"  (if domains declares)

# Step 5 — Verify directories appeared:
#   File explorer shows forge-tutorial/ with chapters 01..09

# Step 6 — Open forge-tutorial/01-hello/hello_world.md.
#   Click 🔥 in editor toolbar.
#   Expected on first click:
#     Notice: "Forge: downloading Pyodide runtime (one-time, ~15 MB)..."
#     ~30 seconds delay (depends on network)
#     Notice dismisses; output pane shows "hello, world"
#   Expected on subsequent clicks: instant.

# Step 7 — Open a moda snippet (if forge-moda extracted):
#   Click 🔥. Expected:
#     If music21 not loaded yet:
#       Notice: "Forge: downloading music21 (one-time, ~23 MB)..."
#       ~45 second delay
#     Otherwise instant.

# Step 8 — Cmd-Q + reopen. Verify Pyodide/music21 are cached (no re-download).
```

## §6 — Open follow-ups expected

1. **Pyodide CDN reliability**: jsdelivr is the standard but has had outages. Consider Cloudflare CDN mirror as a fallback.
2. **Wheel hosting**: if (c) GitHub raw is chosen, releases must include the wheel. release.sh needs to verify the wheel exists in the release artifacts before tagging.
3. **First-load UX during CDN download**: 30+ second wait is friction. A progress bar (vs static Notice) would be cohort-friendlier. Out of scope; future polish.
4. **Offline-first usage**: cohort users may sometimes be offline; first install + first compute MUST happen online. Consider documenting this in the install walkthrough.
5. **dev workflow doesn't change**: install-latest.sh still works, still grabs local `assets/`. dev is unaffected.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates audit of current asset locations, size breakdown, CDN fallback contract, inlining mechanism, dev workflow compatibility.
- ✓ §57–74 (TDD): build-time + runtime tests per §4.
- ✓ §86–118 (pure-core convention): inlining script + bundled-vaults constant are pure data; runtime extraction is integration layer.
- ✓ §76 (don't ship speculative fix): all 4 phases driven by concrete user requirement (BRAT-only install).
- ✓ §347 (version-bump sanity check): manifest pre-bump verified at 0.2.90; explicit version arg.
- ✓ §321 (feedback file before move): standard.

## §8 — Architectural framing

V1-scoped install hardening. Doesn't touch V2 (`source` field, gestural promote, EPython). Pyodide CDN fallback + inlined vaults are forward-compatible — V2 keeps the same install model.

If during §2.4 the music21 wheel CDN path proves unworkable, V2 may need to revisit wheel distribution strategy. Surface in feedback.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Suggested order:
1. §2 investigation (1-2 hours including size + CDN verification).
2. Phase 1 (vault inlining) — alone proves the cohort onboarding works for snippets that don't need Pyodide.
3. Phase 2 (engine + iframe inlining).
4. Phase 3 (Pyodide CDN fallback).
5. Phase 4 (music21 CDN fallback).
6. Phase 5-6 (dev verification + BRAT smoke).

If §2.4 reveals music21 CDN path is blocked: ship Phase 1-3 alone as v0.2.91, leave Phase 4 to v0.2.92.

If §2.3 reveals Pyodide CDN URL doesn't work for the bundled version: surface BEFORE attempting the fix — may need a Pyodide version bump.
