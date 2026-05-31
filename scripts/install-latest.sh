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

# --- 2. Download + SHA verify ---

echo "Downloading $ZIP_URL ..."
curl -fsSL -o "$ZIP_PATH" "$ZIP_URL"

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

# --- 5. Wipe + unzip ---

if [[ -d "$PLUGIN_DIR" ]]; then
  echo "Wiping $PLUGIN_DIR ..."
  rm -rf "$PLUGIN_DIR"
fi

echo "Unzipping $ZIP_NAME into $VAULT/.obsidian/plugins/ ..."
unzip -q "$ZIP_PATH" -d "$VAULT/.obsidian/plugins/"

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
