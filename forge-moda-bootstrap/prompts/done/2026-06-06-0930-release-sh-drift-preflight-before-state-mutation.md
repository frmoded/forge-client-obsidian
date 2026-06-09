# Fix release.sh — move drift preflight BEFORE any state mutation

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Recent amendments include 6a/6b paste-able-commands, bundled-vault forge.toml bump rule, and the sharpened pre-drain re-read mandate.

## Scope

`scripts/release.sh` in forge-client-obsidian runs the engine-bundle-drift preflight TOO LATE in the release sequence. The current order:

```
validate progression → bump-or-skip → commit → tag → push → build-zip (drift check HERE) → gh-release
```

When drift is detected at the build-zip step, the empty `Release vX.Y.Z` commit + the `vX.Y.Z` tag have already been created and pushed. The script aborts, leaving:
- An orphaned tag pointing at a pre-fix commit.
- An empty `Release vX.Y.Z` commit in git history.
- The user has to either bump to the NEXT version (recovery v0.2.59 did this) or do destructive tag operations.

This was the third instance of release.sh toolchain debt in two weeks (zip-upload v0.2.51, double-commit v0.2.53, drift-ordering this prompt). Both prior fixes are paying off; this one closes the loop on the known remaining wart.

Fix: move the drift preflight + zip build to BEFORE any state-mutating step. New order:

```
validate progression → build-zip + drift preflight (NEW POSITION) → bump-or-skip → commit → tag → push → gh-release
```

If drift is detected at the new early position, the script exits cleanly. Git state is unchanged; no orphaned tags; no stray commits; no recovery dance.

What this prompt does NOT do:
- Change drift detection LOGIC. The check itself is correct; only its position changes.
- Refactor release.sh into a multi-script pipeline.
- Touch the SKIP_BUMP path's empty-commit logic (v0.2.51 fix), the re-run-graceful-exit logic (v0.2.53 fix), or the zip-upload logic (v0.2.51 fix). All three stay.
- Add a `--force` flag for "release even with drift."
- Re-architect engine-bundle-drift detection itself.

## Why

Per Mission's speed-as-tiebreaker: clean release sequencing is cheap audit-trail hygiene. The fix is small (~15 lines of bash rearrangement). The benefit: no future release ever orphans a tag, regardless of when bundle drift exists.

The v0.2.59 B7.2 drain's §2 surfaced this exact pattern:

> First v0.2.58 release.sh run halted at the build's drift preflight: `forge/music/lib.py` in the bundle was at the pre-`08db2ed` state, but `release.sh` had ALREADY created an empty `Release v0.2.58` commit + tag + push BEFORE the build step ran. So when I synced the bundle and re-ran release.sh, the tag-create failed with `fatal: tag 'v0.2.58' already exists`.

CC recovered cleanly by bumping to v0.2.59 (per the v0.2.53 double-commit fix's pattern of "cleanest forward path without destructive tag operations"), but the cosmetic noise — orphaned v0.2.58 tag + two stray empty `Release v0.2.58` commits — is now permanent in git history.

## Files to modify

- **`~/projects/forge-client-obsidian/scripts/release.sh`** — rearrange the steps. Detailed below.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution or protocol touch. Pure script fix.)

## Files to read first

- `~/projects/forge-client-obsidian/scripts/release.sh` — current state with v0.2.51 + v0.2.53 fixes already in place.
- `~/projects/forge-client-obsidian/scripts/build-release-zip.mjs` — what the drift detection actually does (where it's invoked + how it reports failure).
- `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-05-2330-b7-2-builtin-wikilink-interception.md` §2 — the exact failure mode this prompt fixes.

## Implementation notes

### Current order (with v0.2.51 + v0.2.53 fixes)

```bash
# Step 1: validate progression
CURRENT_VERSION=$(jq -r '.version' manifest.json)
# (compute or read NEW_VERSION)
if [[ "$LAST_COMMIT_MSG" = "Release v${NEW_VERSION}" ]]; then
  echo "Already released. Nothing to do."
  exit 0
fi
SKIP_BUMP=$( [[ "$NEW_VERSION" == "$CURRENT_VERSION" ]] && echo yes || echo no )

# Step 2: bump-or-skip
if [[ "$SKIP_BUMP" == "no" ]]; then
  jq ".version = \"$NEW_VERSION\"" manifest.json > tmp && mv tmp manifest.json
fi

# Step 3: commit
git commit -am "Release v$NEW_VERSION" --allow-empty

# Step 4: tag
git tag "v$NEW_VERSION"

# Step 5: push
git push origin main
git push origin "v$NEW_VERSION"

# Step 6: build zip + drift preflight  ← LATE; problem here
npm run release-zip  # ← fails if drift; tag is already pushed by now

# Step 7: gh release
gh release create "v$NEW_VERSION" ...
```

### New order

Move the zip build + drift check to position 2 (after validate progression, before any commit/tag/push).

```bash
# Step 1: validate progression (unchanged)
# ... CURRENT_VERSION, NEW_VERSION, LAST_COMMIT_MSG check, SKIP_BUMP detection ...

# Step 2 (NEW POSITION): build zip + drift preflight
# Verify the bundle is in sync BEFORE we mutate any git state.
echo "=== Running build + drift preflight (pre-state-mutation) ==="
npm run release-zip
# If npm run release-zip exits non-zero (drift detected, build failed, etc.),
# the script halts here. No commits made, no tags created, no pushes.
# User fixes the drift (re-syncs the bundle), re-runs release.sh, clean.

# Step 3: bump-or-skip (was step 2)
# Step 4: commit (was step 3)
# Step 5: tag (was step 4)
# Step 6: push (was step 5)
# Step 7: gh release (was step 7, references the already-built zip from step 2)
```

The zip is built once (in step 2) and consumed by gh release (step 7). No double-build.

### Edge case: zip exists from a prior aborted run

If the user runs release.sh, it fails at step 2, they fix drift, re-run, the previous run's `dist/forge-client-obsidian-vX.Y.Z.zip` may still exist. `npm run release-zip` should overwrite cleanly (idempotent). If it doesn't, CC adds a `rm -f dist/forge-client-obsidian-v${NEW_VERSION}.zip` before invoking the build to ensure a clean rebuild.

### Notes section update

Update the script's header comment to document the new order:

```bash
# release.sh flow (post-2026-06-06-0930-drift-preflight-before-state-mutation):
#   1. Validate progression (version checks, re-run guard).
#   2. Build zip + drift preflight (fails CLEAN if drift; no git state mutated).
#   3. Bump manifest (or skip if already bumped).
#   4. Commit (or empty Release commit for SKIP_BUMP path).
#   5. Tag.
#   6. Push.
#   7. GitHub release.
#
# v0.2.51 added: SKIP_BUMP path + zip upload to release assets.
# v0.2.53 added: re-run guard (don't create stray empty commits).
# 2026-06-06-0930 added: drift preflight moved from step 6 to step 2.
```

## Tests

### Auto-verifiable by CC — end-to-end in scratch repo (no Obsidian needed)

Per the v0.2.53 pattern: CC builds a scratch git repo with a fake manifest + a fake `npm run release-zip` script that can be configured to succeed or fail on demand. Then runs release.sh through the scenarios.

**Scratch harness setup:**

```bash
SCRATCH=$(mktemp -d)
cd "$SCRATCH"
git init -q
mkdir scripts

# Copy real release.sh
cp ~/projects/forge-client-obsidian/scripts/release.sh scripts/

# Fake manifest, main.js, styles.css
cat > manifest.json <<'EOF'
{ "id": "test", "version": "0.0.1", "name": "Test" }
EOF
echo "// fake" > main.js
echo "/* fake */" > styles.css

# Fake package.json with a release-zip script that we control via env var.
cat > package.json <<'EOF'
{ "name": "test", "scripts": {
  "build": "echo built",
  "release-zip": "if [ -n \"$FORCE_DRIFT\" ]; then echo DRIFT DETECTED; exit 1; else mkdir -p dist && echo zip > dist/test-v0.0.2.zip; fi"
}}
EOF

git add -A
git commit -q -m "initial"

# Set up fake origin (file-based remote so push works in scratch)
mkdir -p /tmp/scratch-origin.git
git -C /tmp/scratch-origin.git init -q --bare
git remote add origin /tmp/scratch-origin.git
git push -q origin main
```

**Case 1 — Normal release succeeds end-to-end** (sanity check, must still work):

```bash
# Default path: bump 0.0.1 → 0.0.2, no drift, release succeeds.
# Expected: manifest at 0.0.2, "Release v0.0.2" commit exists, v0.0.2 tag created, zip in dist/.
```

**Case 2 — Pre-bumped manifest (v0.2.51 SKIP_BUMP must still work)**:

```bash
# Pre-bump manifest, commit, then run release.sh.
# Expected: SKIP_BUMP detected, no manifest re-write, empty Release commit, tag created.
```

**Case 3 — Re-run for already-released version (v0.2.53 guard must still work)**:

```bash
# After Case 2, run release.sh again for the same version.
# Expected: "Already released" message, exit 0, no stray empty commit.
```

**Case 4 — THE NEW FIX: drift detected at the new early position**:

```bash
# Trigger drift via FORCE_DRIFT env var: npm run release-zip exits 1.
# Run release.sh.
# Expected:
#   - Step 1 (validate progression) passes.
#   - Step 2 (build + drift preflight) FAILS with "DRIFT DETECTED".
#   - Script exits non-zero.
#   - **NO new commits in git log** (verify with `git log --oneline | wc -l` unchanged).
#   - **NO new tags** (verify with `git tag --list` unchanged).
#   - **NO push happened** (verify origin's HEAD unchanged).
#   - manifest.json may or may not have been bumped (depends on order; per the new order, NOT bumped).
```

This is the load-bearing test. The previous behavior (step 6 drift) would have failed AFTER tag-create, leaving orphaned state. The new behavior (step 2 drift) halts before any state mutation.

**Case 5 — Drift detected, then fixed, re-run succeeds**:

```bash
# Trigger drift, release.sh fails (Case 4).
# Unset FORCE_DRIFT; re-run release.sh.
# Expected: this time everything succeeds end-to-end. No leftover state from Case 4 caused issues.
```

CC runs all 5 cases verbatim and pastes the output in §1.4.

`npm test` in the actual forge-client-obsidian repo → unchanged (no plugin code changes).

### Deferred to user

Per v0.2.53 pattern: minimal user-side smoke. The scratch-repo validation covers the fix end-to-end. User's role:

1. Read §1.4 — confirm Cases 1-5 produce expected behavior.
2. Optionally re-run Case 4 in the actual forge-client-obsidian repo at the next real release that would have triggered drift. Verify no orphaned tag appears.

3 lines max in §3.

## Out of scope

- Refactoring release.sh into a multi-stage pipeline.
- Handling concurrent release attempts (two coworks running release.sh simultaneously).
- Adding a dry-run flag.
- Cleanup of the existing orphaned v0.2.58 tag + 2 empty `Release v0.2.58` commits. Those are permanent audit-trail noise; not worth destructive tag ops to clean.

## Don'ts

- **Don't change the SKIP_BUMP logic** (v0.2.51 fix) — still correct after the reorder.
- **Don't change the re-run guard** (v0.2.53 fix) — still correct.
- **Don't add network calls in the new early-position drift check** (it's pure-local — `npm run release-zip` does its own local-only drift comparison).
- **Don't break Case 4** (the new test). The whole point is that drift halts BEFORE state mutation.
- **Don't bump versions concretely** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't batch feedback at end of multi-phase drain** (this is single-phase, but the discipline applies if surprises emerge).

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHA, push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — describe the rearrangement (no TDD test cases for shell — the 5 scratch-repo cases ARE the assertions).
- **§1.2** — pre-fix evidence: the v0.2.59 B7.2 feedback §2 quote (orphaned v0.2.58 tag + 2 stray empty commits) + the current release.sh step order with the drift check at line N.
- **§1.3** — fix landed: cited line-number diff in release.sh.
- **§1.4** — full scratch-repo validation output (Cases 1-5 verbatim).
- **§1.5** — `npm test` (unchanged).
- **§2** — surprises during the rearrangement. Specifically: any quirks of `npm run release-zip` being invoked twice (once in step 2, then implicitly referenced from gh-release in step 7); whether the zip dist path is stable across the early-build + late-upload separation.
- **§3** — minimal user-side smoke (3 lines max).
