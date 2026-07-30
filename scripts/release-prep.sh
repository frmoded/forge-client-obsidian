#!/usr/bin/env bash
# scripts/release-prep.sh
#
# CW-plugin-release-prep-script (drain 2026-07-29-1620).
#
# Ritualized ~3-4-step release preflight in ONE command. For each
# known vault:
#   1. Run sync-bundled-vault to mirror source-of-truth into
#      assets/vaults/<vault>/.
#   2. If sync produced any add/update/delete, bump the vault's
#      forge.toml patch version in BOTH source-of-truth repo AND
#      plugin's bundle copy.
#   3. Commit the source-of-truth bump in <vault> repo (atomic).
#   4. Commit the plugin-side bundle-sync + forge.toml bump (atomic).
# Then invoke scripts/release.sh with any remaining positional args.
#
# Safety:
# - Patch bump only. Refuses to touch minor/major (breaking changes
#   are driver's call).
# - Refuses to bump if bundle/src forge.toml versions have drifted
#   pre-run (pre-existing state, needs manual reconciliation).
# - Every commit is atomic (single-file source repo bump; scoped
#   bundle-dir commit in plugin repo).
# - Aborts on any git error (set -euo pipefail).
# - Idempotent — no-op if nothing has changed since last run.
# - --dry-run flag: prints planned actions, no side effects, does NOT
#   invoke release.sh.
# - Entry guards: both plugin repo AND every source-of-truth repo
#   must have clean working trees. Refuses otherwise so uncommitted
#   work doesn't get silently packaged into the release.
#
# Usage:
#   bash scripts/release-prep.sh                # sync + bump + release
#   bash scripts/release-prep.sh --dry-run      # preview only, no side effects
#   bash scripts/release-prep.sh 0.2.301        # explicit plugin version
#                                               #   (passed through to release.sh)

set -euo pipefail

# --- flags ---
DRY_RUN="no"
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="yes" ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' | head -40
      exit 0
      ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Known vaults. Matches KNOWN_VAULTS in sync-bundled-vault.mjs.
VAULTS=(forge-music forge-moda)
SIBLING_ROOT="$(cd "$REPO_DIR/.." && pwd)"

echo "=== release-prep ==="
if [ "$DRY_RUN" = "yes" ]; then
  echo "  (DRY RUN — no side effects)"
fi
echo ""

# --- entry guards: plugin repo clean ---
PLUGIN_DIRTY="$(git status --porcelain || true)"
if [ -n "$PLUGIN_DIRTY" ]; then
  echo "ERROR: plugin working tree has uncommitted changes:"
  echo "$PLUGIN_DIRTY"
  echo "Commit or stash before running release-prep."
  exit 1
fi

# --- entry guards: every source-of-truth repo clean ---
for VAULT in "${VAULTS[@]}"; do
  SRC_REPO="$SIBLING_ROOT/$VAULT"
  if [ ! -d "$SRC_REPO/.git" ]; then
    echo "ERROR: source-of-truth $VAULT is not a git repo at $SRC_REPO"
    exit 1
  fi
  SRC_DIRTY="$(cd "$SRC_REPO" && git status --porcelain || true)"
  if [ -n "$SRC_DIRTY" ]; then
    echo "ERROR: source-of-truth $VAULT has uncommitted changes:"
    echo "$SRC_DIRTY" | sed 's/^/  /'
    echo "Commit or stash in $SRC_REPO before running release-prep."
    exit 1
  fi
done

# --- per-vault sync + conditional bump ---
BUMPED=()
for VAULT in "${VAULTS[@]}"; do
  echo "--- $VAULT ---"
  SRC_REPO="$SIBLING_ROOT/$VAULT"
  SRC_TOML="$SRC_REPO/forge.toml"
  BUNDLE_DIR="$REPO_DIR/assets/vaults/$VAULT"
  BUNDLE_TOML="$BUNDLE_DIR/forge.toml"

  if [ ! -f "$SRC_TOML" ] || [ ! -f "$BUNDLE_TOML" ]; then
    echo "ERROR: missing forge.toml (src: $SRC_TOML or bundle: $BUNDLE_TOML)"
    exit 1
  fi

  SYNC_OUT="$(node scripts/sync-bundled-vault.mjs "$VAULT")"
  echo "$SYNC_OUT" | sed 's/^/  /'

  # Parse the four counts from "Result: N added, N updated, N unchanged, N deleted."
  RESULT_LINE="$(echo "$SYNC_OUT" | grep -E 'Result: [0-9]+ added, [0-9]+ updated, [0-9]+ unchanged, [0-9]+ deleted' | tail -1)"
  if [ -z "$RESULT_LINE" ]; then
    echo "  ERROR: could not parse sync-bundled-vault result line"
    exit 1
  fi
  ADDED=$(echo "$RESULT_LINE" | sed -E 's/.*Result: ([0-9]+) added.*/\1/')
  UPDATED=$(echo "$RESULT_LINE" | sed -E 's/.*, ([0-9]+) updated.*/\1/')
  DELETED=$(echo "$RESULT_LINE" | sed -E 's/.*, ([0-9]+) deleted.*/\1/')

  if [ "$ADDED" = "0" ] && [ "$UPDATED" = "0" ] && [ "$DELETED" = "0" ]; then
    echo "  (no bundle content change — no bump needed)"
    continue
  fi

  # Content changed → bump patch version.
  CURRENT=$(grep '^version' "$SRC_TOML" | sed -E 's/^version = "([^"]+)".*/\1/')
  if ! echo "$CURRENT" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "  ERROR: source $VAULT forge.toml version '$CURRENT' is not semver X.Y.Z"
    echo "  Auto-bump refuses non-semver. Fix + retry."
    exit 1
  fi
  MAJOR=$(echo "$CURRENT" | cut -d. -f1)
  MINOR=$(echo "$CURRENT" | cut -d. -f2)
  PATCH=$(echo "$CURRENT" | cut -d. -f3)
  NEW="$MAJOR.$MINOR.$((PATCH + 1))"

  BUNDLE_CURRENT=$(grep '^version' "$BUNDLE_TOML" | sed -E 's/^version = "([^"]+)".*/\1/')
  if [ "$BUNDLE_CURRENT" != "$CURRENT" ]; then
    echo "  ERROR: source $VAULT forge.toml version ($CURRENT) doesn't match bundle ($BUNDLE_CURRENT)"
    echo "  Pre-existing drift; refusing to auto-bump. Reconcile manually + retry."
    exit 1
  fi

  echo "  bumping $VAULT: $CURRENT → $NEW"

  if [ "$DRY_RUN" = "yes" ]; then
    # Undo the sync-bundled-vault writes so the tree remains
    # untouched. Safe because entry guard required plugin tree clean:
    # any change in the bundle dir is our own sync work.
    (cd "$REPO_DIR" && git checkout -- "assets/vaults/$VAULT/" 2>/dev/null || true)
    (cd "$REPO_DIR" && git clean -fdq "assets/vaults/$VAULT/" 2>/dev/null || true)
    echo "  (dry-run) reverted sync-bundled-vault writes to $BUNDLE_DIR"
    echo "  (dry-run) would commit:"
    echo "    - $SRC_TOML: $CURRENT → $NEW"
    echo "    - $REPO_DIR/assets/vaults/$VAULT/ (bundle-sync + forge.toml bump to $NEW)"
    continue
  fi

  # Real: apply patch bumps + commit atomically.
  sed -i '' "s/^version = \"$CURRENT\"$/version = \"$NEW\"/" "$SRC_TOML"
  sed -i '' "s/^version = \"$CURRENT\"$/version = \"$NEW\"/" "$BUNDLE_TOML"

  (
    cd "$SRC_REPO"
    git add forge.toml
    git commit -m "$VAULT $CURRENT → $NEW (bundle-content change; via release-prep)"
  )
  (
    cd "$REPO_DIR"
    git add "assets/vaults/$VAULT/"
    git commit -m "bundle-sync $VAULT + bump forge.toml to $NEW (via release-prep)"
  )
  BUMPED+=("$VAULT")
done

echo ""
if [ ${#BUMPED[@]} -eq 0 ]; then
  echo "=== no bundle changes to bump ==="
else
  echo "=== bumped vaults: ${BUMPED[*]} ==="
fi

if [ "$DRY_RUN" = "yes" ]; then
  echo ""
  echo "(dry-run) NOT invoking release.sh. Re-run without --dry-run to prep + release."
  exit 0
fi

echo ""
echo "=== invoking release.sh ==="
bash scripts/release.sh "$@"
