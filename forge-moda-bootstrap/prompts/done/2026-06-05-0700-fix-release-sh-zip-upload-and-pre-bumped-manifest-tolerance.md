# Fix `release.sh` — upload the release zip + tolerate pre-bumped manifest

## Scope

`scripts/release.sh` in `forge-client-obsidian` has had two issues for the last ~8 releases (since at least v0.2.41), forcing CC to manually orchestrate parts of every release:

1. **Zip not in release assets.** `release.sh` uploads only `main.js`, `manifest.json`, and `styles.css` to the GH release. But `scripts/install-latest.sh` (the canonical student install path per `closed-beta-onboarding.md`) downloads `forge-client-obsidian-vX.Y.Z.zip` from the release assets — which release.sh never attaches. CC has been running `npm run release-zip` separately and uploading the zip with `gh release upload` for every release. The zip is the canonical install artifact; release.sh should produce and upload it.

2. **Pre-bumped manifest refused.** When CC bumps `manifest.json` as part of the main work commit (the common case for multi-repo prompts that touch manifest along with engine code), the version is already at the target value when release.sh runs. release.sh's check `if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]: ERROR: new version equals current. Bump it.` rejects this case. CC has been bumping manifest, then manually running each step of release.sh in sequence.

Both bugs surfaced in v0.2.48 feedback §0: "the script still expects to bump the manifest itself and refuses when `current == new`. ... 8th release the script couldn't drive end-to-end."

Fix both in one drain. Single-phase (no investigation-before-design needed — symptoms ARE the diagnosis).

What this prompt does NOT do:
- Rewrite release.sh from scratch (the script is mostly correct; two surgical fixes).
- Change the release flow's external contract (still: bump version → build → commit → tag → push → GH release).
- Change install-latest.sh or any consumer.
- Modify version-bump semantics elsewhere (per-prompt version-bump sanity check in cc-prompt-queue.md unchanged).

## Why

Toolchain debt accumulates. Every release CC manually orchestrates costs ~5 minutes of careful sequencing and risks human error (wrong zip uploaded, manifest not committed, tag pushed before zip ready). 8 releases × 5 minutes = 40 minutes of compounded waste, plus the cognitive overhead of "did I remember to run release-zip this time?" Per the Mission's speed-as-tiebreaker decision lens — and Papert's "low cost-to-tweak-and-ship" — this is the right fix to land before V1 closed-beta ship.

## Files to modify

- **`~/projects/forge-client-obsidian/scripts/release.sh`** — the two fixes.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` per the placeholder convention.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution or protocol touch. Toolchain bug fix only.)

## Files to read first

- `~/projects/forge-client-obsidian/scripts/release.sh` — current state.
- `~/projects/forge-client-obsidian/scripts/build-release-zip.mjs` — what produces the zip; what its output path is.
- `~/projects/forge-client-obsidian/package.json` — confirm the `release-zip` npm script invocation.
- `~/projects/forge-client-obsidian/scripts/install-latest.sh` — confirm the exact zip filename pattern the install script downloads (the upload must match).

## Implementation notes

### Fix 1 — tolerate pre-bumped manifest

The current check (around line 78-81 of release.sh):

```bash
# Validate progression
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "ERROR: new version equals current ($CURRENT_VERSION). Bump it."
  exit 1
fi
```

Replace with:

```bash
# Validate progression
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Manifest already at $NEW_VERSION — skipping bump step."
  echo "(Common when an upstream commit bumped manifest as part of the same change set.)"
  SKIP_BUMP="yes"
else
  SKIP_BUMP="no"
fi
```

Then in the bump section (around line 100):

```bash
if [ "$SKIP_BUMP" = "no" ]; then
  # --- Bump manifest ---
  echo
  echo "=== Bumping manifest.json: $CURRENT_VERSION → $NEW_VERSION ==="
  tmp="$(mktemp)"
  jq --arg v "$NEW_VERSION" '.version = $v' manifest.json > "$tmp" && mv "$tmp" manifest.json
fi
```

And in the commit section (around line 115):

```bash
echo
if [ "$SKIP_BUMP" = "no" ]; then
  echo "=== Committing version bump ==="
  git add manifest.json
  git commit -m "Release v${NEW_VERSION}"
else
  echo "=== Manifest already committed at v${NEW_VERSION}; creating release commit ==="
  # Empty commit to mark the release point in history (consistent with non-skip path)
  git commit --allow-empty -m "Release v${NEW_VERSION}"
fi
```

The empty commit preserves the "Release vX.Y.Z" marker in `git log --oneline`, matching the non-skip path. If you'd rather skip the empty commit entirely when pre-bumped, that's also reasonable — the tag itself is the canonical release marker — but the empty-commit shape keeps `git log` patterns consistent.

### Fix 2 — produce and upload the zip

The current assets section (around line 130):

```bash
ASSETS=(main.js manifest.json)
[ "$STYLES_PRESENT" = "yes" ] && ASSETS+=(styles.css)

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION} — ${TAG_MSG}" \
  --notes "Release v${NEW_VERSION}. BRAT users: run 'Check for updates' to pull." \
  "${ASSETS[@]}"
```

Insert before the `gh release create` call:

```bash
# --- Build release zip ---
echo
echo "=== Building release zip ==="
npm run release-zip

ZIP_PATH="dist/forge-client-obsidian-v${NEW_VERSION}.zip"
if [ ! -f "$ZIP_PATH" ]; then
  echo "ERROR: expected zip at $ZIP_PATH not produced by 'npm run release-zip'."
  echo "Check scripts/build-release-zip.mjs output path."
  exit 1
fi
echo "Built: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"
```

Then include the zip in the assets:

```bash
ASSETS=(main.js manifest.json)
[ "$STYLES_PRESENT" = "yes" ] && ASSETS+=(styles.css)
ASSETS+=("$ZIP_PATH")
```

If `npm run release-zip` outputs to a different path than `dist/forge-client-obsidian-v${NEW_VERSION}.zip`, adjust `ZIP_PATH` to match the actual output. CC reads `scripts/build-release-zip.mjs` to verify the path before drafting the fix.

### Notes section update

Update the release notes to mention the zip:

```bash
gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION} — ${TAG_MSG}" \
  --notes "Release v${NEW_VERSION}. BRAT users: run 'Check for updates' to pull main.js. Fresh installs: use install-latest.sh against the attached zip." \
  "${ASSETS[@]}"
```

## Tests

### Auto-verifiable by CC

Shell-script testing is awkward; the practical test surface is "run release.sh in a clean environment and confirm both fixes work." CC does this:

1. **Verify the script lints.** `bash -n scripts/release.sh` (syntax check, no execution).
2. **Dry-run the script's logic** by reading through it mentally + greping for the two failure modes. Confirm:
   - `if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]` no longer exits with error.
   - `ASSETS+=("$ZIP_PATH")` is present and reached before `gh release create`.
   - `npm run release-zip` invocation is present.
3. **End-to-end smoke**: CC runs the full release flow for v0.X.X (this prompt's release). Specifically:
   - Bump manifest in the main work commit.
   - Run `bash scripts/release.sh` (without arguments — auto-bump path).
   - Confirm SKIP_BUMP="yes" message printed.
   - Confirm zip built at `dist/forge-client-obsidian-vX.Y.Z.zip`.
   - Confirm GH release has all 4 assets: main.js, manifest.json, styles.css, forge-client-obsidian-vX.Y.Z.zip.
   - Confirm `install-latest.sh` against the new release downloads the zip and installs correctly into a fresh test vault.

Report the full sequence verbatim in §1.4.

`npm test` → unchanged (no code changes; pure script).

### Deferred to user (CC writes §3 smoke checklist per protocol)

The §3 checklist exercises the fixed script from the user's perspective:

1. Pre-condition: working tree state at start, manifest version, fresh `dist/` directory.
2. Run release.sh with explicit version (the standard usage).
3. Run release.sh with auto-bump (no args).
4. Run release.sh with manifest pre-bumped (the previously-broken case — confirm SKIP_BUMP message + empty release commit + zip in assets).
5. Verify install-latest.sh against the new release pulls the zip correctly.
6. Failure modes section + end-state cleanup.

## Out of scope

- Rewriting release.sh in JS / TypeScript.
- Adding pre-release / draft modes.
- Multi-architecture asset handling.
- Auto-detection of "this is a doc-only commit, skip the release entirely."
- Touching `closed-beta-onboarding.md` or `INSTALL.md` substantively (just the version pin update).

## Don'ts

- Don't introduce new dependencies (no Python, no new npm packages).
- Don't change the GH release notes format beyond the line tweak above.
- Don't bump versions concretely — use `{CURRENT} → {NEXT_PATCH}` placeholder.
- Don't batch feedback at end of multi-phase drain (this is single-phase, but the discipline applies).
- Don't ship without running the script end-to-end at least once as part of CC's auto-smoke.

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHA, push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — describe the two fixes (no TDD test cases for a shell-script fix; the script's exit codes + asset presence ARE the assertions).
- **§1.2** — pre-fix evidence: the v0.2.48 feedback §0 quote ("8th release the script couldn't drive end-to-end") + the current release.sh exit-on-equal-version block.
- **§1.3** — fix landed: cited line-number diffs in release.sh.
- **§1.4** — end-to-end smoke output (the verbatim release.sh run for this release).
- **§1.5** — `npm test` (unchanged).
- **§2** — surprises: any quirks of `build-release-zip.mjs`'s output path; whether the empty-release-commit-on-skip is the right call vs skipping entirely.
- **§3** — user-side smoke checklist per the quality bar.
