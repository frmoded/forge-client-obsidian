#!/usr/bin/env bash
# Build the MUSIC edition from this checkout and install it into a local vault (2026-10-26-1700).
#
#   VAULT=~/forge-vaults/ClaudeQA bash scripts/install-local.sh        # or: npm run install-local  (with VAULT set)
#
# Quit Obsidian first (Cmd+Q), then reopen the vault. Steps: FORGE_EDITION=music build -> check-installable-build (fails if main.js or assets/vaults are not the music edition)
# -> copy main.js, manifest.json, styles.css -> rsync assets/. The vault's data.json is not touched. The plugin folder is <vault>/.obsidian/plugins/<manifest id>; PLUGIN_DIR=... overrides it. Use install-latest.sh for a published release.
#   EDITION=lean ... builds and installs the lean edition instead (the guard then checks lean).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VAULT:?set VAULT to the vault path, e.g. VAULT=~/forge-vaults/ClaudeQA}"
EDITION="${EDITION:-music}"
PLUGIN_DIR="$(VAULT="$VAULT" PLUGIN_DIR="${PLUGIN_DIR:-}" node scripts/resolve-plugin-dir.mjs)"      # <vault>/.obsidian/plugins/<id in manifest.json>, or $PLUGIN_DIR; exits 1 naming the path and the id
FORGE_EDITION="$EDITION" npm run build
node scripts/check-installable-build.mjs --edition "$EDITION"
cp main.js manifest.json styles.css "$PLUGIN_DIR/"
rsync -a --delete assets/ "$PLUGIN_DIR/assets/"
echo "install-local: installed the $EDITION edition into $PLUGIN_DIR"
head -c 60 "$PLUGIN_DIR/main.js" | head -1
echo "Now reopen Obsidian; the console banner reads: FORGE CLIENT v… LOADED (edition: $EDITION)"
