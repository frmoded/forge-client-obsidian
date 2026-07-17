#!/usr/bin/env bash
# Install the latest forge-client-obsidian release into a local Obsidian vault.
#
# What it does:
#   1. Queries GitHub for the latest release tag.
#   2. Downloads the release zip; verifies SHA-256 against the asset digest
#      reported by the GH API.
#   3. Backs up the vault's existing plugin data.json.
#   4. Wipes the plugin folder and unzips the new release into place.
#   5. Restores data.json so settings (transpile token, server URL, etc.) survive.
#   6. Prints "reload Obsidian" reminder.
#
# Usage:
#   bash scripts/install-latest.sh
#
# Overrides (all optional):
#   VAULT=...    target vault path
#                (default: $HOME/forge-vaults/bluh)
#   TAG=...     specific release tag to install instead of latest
#                (e.g. TAG=v0.2.10)
#   REPO=...    GH repo slug (default: frmoded/forge-client-obsidian)
#
# Prereqs: bash, curl, unzip, shasum, jq (optional but recommended).

set -euo pipefail

REPO="${REPO:-frmoded/forge-client-obsidian}"

# CW-vault-drift-audit (2026-07-16): --all-vaults mode. Discovers every
# git-tracked Obsidian vault under $SCAN_ROOT (default $HOME) with a
# tracked forge-client-obsidian install, then re-invokes this script
# once per vault with VAULT=<vault> so each gets the same fast-path OR
# fallback logic below. Excludes vaults where the plugin dir is NOT
# git-tracked (transient per-machine installs like bluh — handled by
# the single-vault path).
if [[ "${1:-}" == "--all-vaults" ]]; then
  SCAN_ROOT="${SCAN_ROOT:-$HOME}"
  # Same default as vault-drift-audit.sh: skip ephemeral git worktrees
  # + test-fixture sandboxes so --all-vaults doesn't clobber them.
  EXCLUDE_PATTERN="${EXCLUDE_PATTERN:-\.claude/worktrees/|obsidian_sandbox($|/)}"
  echo "=== install-latest.sh --all-vaults ==="
  echo "Scanning $SCAN_ROOT for git-tracked vaults ..."
  TOTAL=0
  while IFS= read -r obs_dir; do
    vault_dir="$(dirname "$obs_dir")"
    if [ -n "$EXCLUDE_PATTERN" ] && grep -qE "$EXCLUDE_PATTERN" <<< "$vault_dir"; then
      continue
    fi
    git -C "$vault_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 || continue
    git -C "$vault_dir" ls-files ".obsidian/plugins/forge-client-obsidian/" 2>/dev/null | head -1 | grep -q . || continue
    TOTAL=$((TOTAL + 1))
    echo ""
    echo "→ $vault_dir"
    # Recurse WITHOUT --all-vaults; preserves any explicit TAG=/REPO= overrides.
    VAULT="$vault_dir" bash "$0"
  done < <(find -H "$SCAN_ROOT" -type d -name ".obsidian" 2>/dev/null)
  echo ""
  echo "=== --all-vaults done ==="
  echo "Refreshed $TOTAL vault(s)."
  exit 0
fi

VAULT="${VAULT:-$HOME/forge-vaults/bluh}"
PLUGIN_DIR="$VAULT/.obsidian/plugins/forge-client-obsidian"

# --- 1. Resolve target release ---

if [[ -n "${TAG:-}" ]]; then
  echo "Target: pinned to $TAG"
else
  echo "Resolving latest release of $REPO ..."
  TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  if [[ -z "$TAG" ]]; then
    echo "FATAL: could not resolve latest tag from GH API."
    exit 1
  fi
  echo "Latest: $TAG"
fi

ZIP_NAME="forge-client-obsidian-$TAG.zip"
ZIP_URL="https://github.com/$REPO/releases/download/$TAG/$ZIP_NAME"
ZIP_PATH="/tmp/$ZIP_NAME"

# --- 2. Download + SHA verify (with belt+suspenders fallback) ---
#
# CW-release-script-gap (2026-07-16): v0.2.296's release surfaced with
# only main.js + manifest.json attached — the zip asset was silently
# dropped by an unknown upload path. `install-latest.sh` hit 404 on the
# zip URL and bailed hard, forcing a manual rsync from bluh. This block
# now tries the zip first (fast path) and falls back to individual-file
# fetches (main.js + manifest.json + optional styles.css) when the zip
# 404s. Fallback works because main.js inlines BUNDLED_ASSETS at build
# time (per scripts/inline-bundled-assets.mjs); the plugin self-restores
# `assets/` on first Obsidian load via restoreInlinedAssets in main.ts.

ZIP_OK="no"
echo "Downloading $ZIP_URL ..."
if curl -fsSL -o "$ZIP_PATH" "$ZIP_URL" 2>/dev/null; then
  ZIP_OK="yes"
  LOCAL_SHA=$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')
  echo "  local SHA-256:  $LOCAL_SHA"

  # GH publishes asset digests in the release JSON. Cross-check.
  ASSET_DIGEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$TAG" \
    | grep -A1 "\"name\": \"$ZIP_NAME\"" \
    | grep '"digest"' | head -n1 | sed -E 's/.*"digest": *"sha256:([^"]+)".*/\1/' || true)

  if [[ -n "$ASSET_DIGEST" ]]; then
    echo "  GH asset digest: $ASSET_DIGEST"
    if [[ "$LOCAL_SHA" != "$ASSET_DIGEST" ]]; then
      echo "FATAL: SHA mismatch — download may be corrupted or tampered with."
      exit 1
    fi
    echo "  digests match"
  else
    echo "  (GH asset digest not exposed; skipped cross-check)"
  fi
else
  echo "  zip download failed (404 or network) — falling back to individual-file fetches."
  echo "  (main.js inlines assets/; the plugin self-restores them on first Obsidian load.)"
fi

# --- 3. Vault sanity ---

if [[ ! -d "$VAULT" ]]; then
  echo "FATAL: vault not found at $VAULT. Override with VAULT=<path>."
  exit 1
fi
if [[ ! -d "$VAULT/.obsidian" ]]; then
  echo "FATAL: $VAULT exists but is not an Obsidian vault (no .obsidian/)."
  exit 1
fi
mkdir -p "$VAULT/.obsidian/plugins"

# --- 4. Backup data.json ---

DATA_BACKUP=""
if [[ -f "$PLUGIN_DIR/data.json" ]]; then
  DATA_BACKUP="/tmp/forge-data-$TAG-$(date +%s).bak.json"
  cp "$PLUGIN_DIR/data.json" "$DATA_BACKUP"
  echo "  backed up data.json → $DATA_BACKUP"
else
  echo "  no existing data.json to back up (fresh install)"
fi

# --- 5. Wipe + install (via unzip OR individual-file fallback) ---

if [[ -d "$PLUGIN_DIR" ]]; then
  echo "Wiping $PLUGIN_DIR ..."
  rm -rf "$PLUGIN_DIR"
fi

if [[ "$ZIP_OK" == "yes" ]]; then
  echo "Unzipping $ZIP_NAME into $VAULT/.obsidian/plugins/ ..."
  unzip -q "$ZIP_PATH" -d "$VAULT/.obsidian/plugins/"
else
  # Fallback path — zip missing from release. Fetch main.js + manifest.json
  # (+ optional styles.css) directly. The plugin's restoreInlinedAssets
  # (main.ts) will self-restore the `assets/` tree on first Obsidian load
  # from BUNDLED_ASSETS inlined into main.js at build time.
  ASSET_BASE_URL="https://github.com/$REPO/releases/download/$TAG"
  mkdir -p "$PLUGIN_DIR"
  echo "  fetching main.js from $ASSET_BASE_URL ..."
  curl -fsSL -o "$PLUGIN_DIR/main.js" "$ASSET_BASE_URL/main.js"
  echo "  fetching manifest.json from $ASSET_BASE_URL ..."
  curl -fsSL -o "$PLUGIN_DIR/manifest.json" "$ASSET_BASE_URL/manifest.json"
  if curl -fsSL -o "$PLUGIN_DIR/styles.css" "$ASSET_BASE_URL/styles.css" 2>/dev/null; then
    echo "  fetched styles.css"
  else
    echo "  (no styles.css in release; skipping — plugin will run without it)"
    rm -f "$PLUGIN_DIR/styles.css"
  fi
  echo "  fallback install complete. On next Obsidian load, the plugin"
  echo "  will self-restore assets/ from BUNDLED_ASSETS inlined in main.js."
fi

# --- 6. Restore data.json ---

if [[ -n "$DATA_BACKUP" ]]; then
  cp "$DATA_BACKUP" "$PLUGIN_DIR/data.json"
  echo "  restored data.json from $DATA_BACKUP"
fi

# --- 7. Verify ---

INSTALLED_VERSION=$(grep '"version"' "$PLUGIN_DIR/manifest.json" \
  | sed -E 's/.*"version": *"([^"]+)".*/\1/')
echo
echo "Installed forge-client-obsidian v$INSTALLED_VERSION at:"
echo "  $PLUGIN_DIR"
echo
echo "Next: reload Obsidian to pick up the new version."
echo "  Cmd+P → 'Reload app without saving'"
