#!/usr/bin/env bash
# release.sh — automate the BRAT-installable release for forge-client-obsidian.
#
# Bumps manifest.json's version, rebuilds main.js, commits the manifest bump,
# tags, pushes, and creates a GitHub release with main.js + manifest.json +
# styles.css attached as assets. BRAT picks it up on next "Check for updates."
#
# Usage:
#   bash scripts/release.sh                  # auto-bump patch (0.1.2 → 0.1.3)
#   bash scripts/release.sh 0.2.0            # explicit version
#   bash scripts/release.sh 0.2.0 "Reason"   # explicit version + tag message
#
# Requirements:
#   - git working tree clean (or only manifest.json modified)
#   - logged into `gh` CLI (run `gh auth login` once if not)
#   - npm + esbuild work (i.e., `npm run build` succeeds)
#
# When called for a version that's ALREADY been released (i.e., the
# previous commit is already `Release vX.Y.Z` for the same version),
# the script exits gracefully without creating a stray empty commit.
# v0.2.53 — added (per 2026-06-05-1000 prompt). Pre-fix, running
# release.sh twice in a row for the same version produced two empty
# `Release vX.Y.Z` commits side-by-side (the second one orphaned
# because the tag already pointed at the first). To intentionally
# re-release (e.g. to update assets), drop the existing tag first
# via `git tag -d vX.Y.Z && git push origin :vX.Y.Z`.

set -euo pipefail

# Make sure brew-installed binaries (npm, gh) are on PATH.
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# --- Sanity: required tools ---
for cmd in git npm jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $cmd"
    [ "$cmd" = "jq" ] && echo "  Install with: brew install jq"
    exit 1
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) not installed."
  echo "  Install with: brew install gh"
  echo "  Then: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# --- Current version ---
CURRENT_VERSION="$(jq -r '.version' manifest.json)"
echo "Current version: $CURRENT_VERSION"

# --- New version ---
if [ $# -ge 1 ]; then
  NEW_VERSION="$1"
else
  # Auto-bump patch: 0.1.2 → 0.1.3
  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
  NEW_VERSION="${major}.${minor}.$((patch + 1))"
fi
echo "New version:     $NEW_VERSION"

# Validate format
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version '$NEW_VERSION' is not semver (X.Y.Z)."
  exit 1
fi

# Validate progression. Pre-bumped manifest is a tolerated case
# (common when an upstream commit bumped manifest as part of the
# same change set — multi-repo prompts where the manifest bump
# rides on the main work commit). v0.2.51 — fixed (per
# 2026-06-05-0700 prompt). Pre-fix, this hard-rejected and CC had
# to drive 10+ releases by hand.
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Manifest already at $NEW_VERSION — skipping bump + commit step."
  echo "(Common when an upstream commit bumped manifest as part of"
  echo " the same change set.)"
  SKIP_BUMP="yes"
else
  SKIP_BUMP="no"
fi

# Don't allow release on a dirty tree (except manifest.json itself,
# which release.sh may modify in the bump step). When SKIP_BUMP=yes
# the manifest is already committed too, so a fully clean tree is
# required.
if [ "$SKIP_BUMP" = "yes" ]; then
  DIRTY="$(git status --porcelain || true)"
else
  DIRTY="$(git status --porcelain | grep -v '^.. manifest.json$' || true)"
fi
if [ -n "$DIRTY" ]; then
  echo "ERROR: working tree has uncommitted changes:"
  echo "$DIRTY"
  echo "Commit or stash before releasing."
  exit 1
fi

# Detect "already released this version" and exit cleanly. Guards
# against running release.sh twice in succession for the same version
# (common during smoke / debugging). Pre-fix, the second invocation
# created a stray empty `Release vX.Y.Z` commit before failing at
# the duplicate-tag step — see v0.2.51 history (47fe3ed/cba97d1).
# v0.2.53 — added (per 2026-06-05-1000 prompt). Only fires on the
# SKIP_BUMP path because that's the only path where the prior commit
# could already be the release marker without intermediate work.
LAST_COMMIT_MSG="$(git log -1 --pretty=%s)"
if [ "$SKIP_BUMP" = "yes" ] && [ "$LAST_COMMIT_MSG" = "Release v${NEW_VERSION}" ]; then
  echo
  echo "=== Already released v${NEW_VERSION} (previous commit is the release marker) ==="
  echo "Nothing to do. The tag + GH release exist; install-latest.sh works."
  echo
  echo "If you intended to re-run the release for some reason (e.g., asset"
  echo "update), drop the existing tag with:"
  echo "  git tag -d v${NEW_VERSION} && git push origin :v${NEW_VERSION}"
  echo "and run release.sh again."
  exit 0
fi

# Tag message
TAG_MSG="${2:-Release v${NEW_VERSION}}"

# --- Bump manifest (skipped when pre-bumped upstream) ---
if [ "$SKIP_BUMP" = "no" ]; then
  echo
  echo "=== Bumping manifest.json: $CURRENT_VERSION → $NEW_VERSION ==="
  tmp="$(mktemp)"
  jq --arg v "$NEW_VERSION" '.version = $v' manifest.json > "$tmp" && mv "$tmp" manifest.json
fi

# --- Build ---
echo
echo "=== Building plugin ==="
npm run build

# --- Verify required release artifacts ---
for f in main.js manifest.json; do
  if [ ! -f "$f" ]; then
    echo "ERROR: required release asset missing: $f"
    exit 1
  fi
done
STYLES_PRESENT="no"
[ -f styles.css ] && STYLES_PRESENT="yes"

# --- Build release zip (drift preflight runs inside) ---
# v0.2.51 — added (per 2026-06-05-0700 prompt). install-latest.sh
# downloads forge-client-obsidian-vX.Y.Z.zip from the release
# assets; pre-fix this script only uploaded main.js + manifest.json
# + styles.css, so install-latest.sh hit 404 on every release until
# CC manually ran npm run release-zip + gh release upload (10
# releases handled manually before this patch).
#
# 2026-06-06-0930 — MOVED EARLIER in the script (was after push,
# now before commit). build-release-zip.mjs's section 2b runs the
# engine-bundle drift preflight; if drift is detected, it exits 1
# here, BEFORE any commit / tag / push state mutation. Pre-fix,
# drift caught at the late position left orphaned tags (v0.2.58
# wart). When SKIP_BUMP=no AND drift fires here, manifest.json is
# left at the new version (dirty); user reverts via
# `git checkout -- manifest.json`, runs `npm run sync-engine-bundle`,
# and re-runs release.sh. SKIP_BUMP=yes leaves nothing dirty.
echo
echo "=== Building release zip (drift preflight runs inside) ==="
npm run release-zip

ZIP_PATH="dist/forge-client-obsidian-v${NEW_VERSION}.zip"
if [ ! -f "$ZIP_PATH" ]; then
  echo "ERROR: expected zip at $ZIP_PATH not produced by 'npm run release-zip'."
  echo "Check scripts/build-release-zip.mjs output path."
  exit 1
fi
echo "Built: $ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"

# --- Commit, tag, push ---
echo
if [ "$SKIP_BUMP" = "no" ]; then
  echo "=== Committing version bump ==="
  git add manifest.json
  git commit -m "Release v${NEW_VERSION}"
else
  echo "=== Manifest already committed at v${NEW_VERSION}; creating empty release commit ==="
  # Empty commit preserves the "Release vX.Y.Z" marker in
  # `git log --oneline`, matching the non-skip path's shape. The
  # tag itself is the canonical release marker, but the consistent
  # commit shape keeps `git log` patterns predictable.
  git commit --allow-empty -m "Release v${NEW_VERSION}"
fi

echo
echo "=== Tagging v${NEW_VERSION} ==="
git tag -a "v${NEW_VERSION}" -m "${TAG_MSG}"

echo
echo "=== Pushing to origin ==="
git push origin main
git push origin "v${NEW_VERSION}"

# --- Create GitHub release with assets ---
echo
echo "=== Creating GitHub release v${NEW_VERSION} ==="

ASSETS=(main.js manifest.json)
[ "$STYLES_PRESENT" = "yes" ] && ASSETS+=(styles.css)
ASSETS+=("$ZIP_PATH")

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION} — ${TAG_MSG}" \
  --notes "Release v${NEW_VERSION}. BRAT users: run 'Check for updates' to pull main.js. Fresh installs: use install-latest.sh against the attached zip." \
  "${ASSETS[@]}"

echo
echo "=== Done ==="
echo "Release v${NEW_VERSION} published."
echo "BRAT users: Settings → BRAT → Check for updates → pulls the new main.js."
echo "  styles.css included: $STYLES_PRESENT"
echo "  zip:                 $ZIP_PATH"
