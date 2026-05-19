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

# Validate progression
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "ERROR: new version equals current ($CURRENT_VERSION). Bump it."
  exit 1
fi

# Don't allow release on a dirty tree (except manifest.json itself)
DIRTY="$(git status --porcelain | grep -v '^.. manifest.json$' || true)"
if [ -n "$DIRTY" ]; then
  echo "ERROR: working tree has uncommitted changes beyond manifest.json:"
  echo "$DIRTY"
  echo "Commit or stash before releasing."
  exit 1
fi

# Tag message
TAG_MSG="${2:-Release v${NEW_VERSION}}"

# --- Bump manifest ---
echo
echo "=== Bumping manifest.json: $CURRENT_VERSION → $NEW_VERSION ==="
tmp="$(mktemp)"
jq --arg v "$NEW_VERSION" '.version = $v' manifest.json > "$tmp" && mv "$tmp" manifest.json

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

# --- Commit, tag, push ---
echo
echo "=== Committing version bump ==="
git add manifest.json
git commit -m "Release v${NEW_VERSION}"

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

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION} — ${TAG_MSG}" \
  --notes "Release v${NEW_VERSION}. BRAT users: run 'Check for updates' to pull." \
  "${ASSETS[@]}"

echo
echo "=== Done ==="
echo "Release v${NEW_VERSION} published."
echo "BRAT users: Settings → BRAT → Check for updates → pulls the new main.js."
echo "  styles.css included: $STYLES_PRESENT"
