#!/usr/bin/env bash
# vault-drift-audit.sh — enumerate every git-tracked Obsidian vault on
# this machine, report the installed forge-client-obsidian version vs
# the latest GitHub release, flag drift beyond a configurable threshold.
#
# Surfaced by CW-f-shuffle-runtime-namerror (2026-07-16): forge-music's
# vault plugin was pinned at v0.2.239 (60 releases stale), the driver's
# only signal was a runtime NameError when a note reached for a
# post-v0.2.239 chip. This script surfaces drift proactively.
#
# Usage:
#   bash scripts/vault-drift-audit.sh
#
# Overrides:
#   DRIFT_THRESHOLD=5    patch-level drift below this = OK, above = DRIFT
#   REPO=<owner>/<repo>  (default: frmoded/forge-client-obsidian)
#   SCAN_ROOT=<path>     (default: $HOME) — top of the discovery walk
#
# Discovery: walks $SCAN_ROOT for any `.obsidian/` dir, filters to those
# inside a git repo whose `.obsidian/plugins/forge-client-obsidian/` is
# git-tracked. Vaults where the plugin is NOT tracked (i.e., transient
# per-machine installs like bluh) are skipped — they're not the drift
# class this drain targets.
#
# Exit code 0 always — this is a report, not a gate. Look at output.

set -euo pipefail

REPO="${REPO:-frmoded/forge-client-obsidian}"
SCAN_ROOT="${SCAN_ROOT:-$HOME}"
DRIFT_THRESHOLD="${DRIFT_THRESHOLD:-5}"
# Grep-style pattern of vault paths to EXCLUDE from the report. Default
# skips (a) ephemeral git worktrees the driver uses for parallel work,
# (b) test-fixture vaults inside the plugin repo. Override to include
# them: EXCLUDE_PATTERN='' (empty string disables the filter).
EXCLUDE_PATTERN="${EXCLUDE_PATTERN:-\.claude/worktrees/|obsidian_sandbox($|/)}"

for cmd in jq gh find; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required command: $cmd"
    [ "$cmd" = "jq" ] && echo "  brew install jq"
    [ "$cmd" = "gh" ] && echo "  brew install gh && gh auth login"
    exit 1
  fi
done

# Latest release version. Try `gh release view --json tagName` first;
# fall back to `gh release list --limit 1` if the /releases/latest
# endpoint returns 503 (observed during CW-vault-drift-audit dev — the
# /latest endpoint is flakier than the paginated /releases list).
LATEST_TAG=$(gh release view --repo "$REPO" --json tagName --jq .tagName 2>/dev/null || true)
if [ -z "$LATEST_TAG" ]; then
  LATEST_TAG=$(gh release list --repo "$REPO" --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null || true)
fi
if [ -z "$LATEST_TAG" ]; then
  echo "ERROR: could not resolve latest release from gh api. Check auth + connectivity."
  exit 1
fi
LATEST_VERSION="${LATEST_TAG#v}"
LATEST_PATCH=$(echo "$LATEST_VERSION" | cut -d. -f3)

echo "Latest forge-client-obsidian: $LATEST_TAG"
echo "Drift threshold: > $DRIFT_THRESHOLD patch releases"
echo "Scanning: $SCAN_ROOT"
echo ""

FOUND=0
DRIFTED=0
OK=0

# `find` with -H so we follow the top-level scan-root symlink if any,
# but don't recurse into symlinked subdirs (avoids infinite loops on
# self-linking dirs some backup tools produce). 2>/dev/null suppresses
# permission-denied noise on system-y dirs.
while IFS= read -r obs_dir; do
  vault_dir="$(dirname "$obs_dir")"

  # Skip excluded paths
  if [ -n "$EXCLUDE_PATTERN" ] && grep -qE "$EXCLUDE_PATTERN" <<< "$vault_dir"; then
    continue
  fi

  # Skip if not a git repo
  git -C "$vault_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || continue

  # Skip if forge-client-obsidian not tracked in this vault
  if ! git -C "$vault_dir" ls-files ".obsidian/plugins/forge-client-obsidian/" 2>/dev/null | head -1 | grep -q .; then
    continue
  fi

  plugin_dir="$obs_dir/plugins/forge-client-obsidian"
  manifest="$plugin_dir/manifest.json"

  FOUND=$((FOUND + 1))

  if [[ ! -f "$manifest" ]]; then
    echo "  [MISSING manifest] $vault_dir"
    continue
  fi

  installed=$(jq -r .version "$manifest" 2>/dev/null || echo "unknown")
  # Semver patch-level drift only. Non-semver installed = flag.
  if ! [[ "$installed" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "  [NON-SEMVER: v$installed] $vault_dir"
    DRIFTED=$((DRIFTED + 1))
    continue
  fi

  installed_patch=$(echo "$installed" | cut -d. -f3)
  drift=$((LATEST_PATCH - installed_patch))

  if (( drift > DRIFT_THRESHOLD )); then
    echo "  [DRIFT $drift] $vault_dir @ v$installed  (latest v$LATEST_VERSION)"
    DRIFTED=$((DRIFTED + 1))
  else
    echo "  [OK $drift] $vault_dir @ v$installed"
    OK=$((OK + 1))
  fi
done < <(find -H "$SCAN_ROOT" -type d -name ".obsidian" 2>/dev/null)

echo ""
echo "Summary: $FOUND git-tracked vault(s) with forge-client-obsidian install."
echo "  OK: $OK   DRIFTED: $DRIFTED"
if (( DRIFTED > 0 )); then
  echo ""
  echo "To refresh drifted vaults to latest:"
  echo "  bash scripts/install-latest.sh --all-vaults"
fi
