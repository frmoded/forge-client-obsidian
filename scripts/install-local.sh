#!/usr/bin/env bash
# Build the MUSIC edition from a clean COMMIT and install it into a local vault (2026-10-26-1700; 2026-10-31-1115: from a commit, not from the working tree).
#
#   VAULT=~/projects/music-playground bash scripts/install-local.sh             # builds origin/main (after a fetch): what has been pushed, nothing half-built
#   VAULT=... bash scripts/install-local.sh --ref <sha-or-branch>               # another commit
#   VAULT=... bash scripts/install-local.sh --worktree                          # the dirty working tree, on purpose (a loud line says so; main.js is stamped tree: dirty)
#   VAULT=... bash scripts/install-local.sh --plan [--ref ...|--worktree]       # say which commit would be built and the tree, build nothing, install nothing
#
# Quit Obsidian first (Cmd+Q), then reopen the vault. Steps: a scratch copy of the commit (git archive; the working tree is never touched: no pull, no checkout, never a push) -> FORGE_EDITION=music build there, stamped with the commit
# -> check-installable-build (fails if main.js or assets/vaults are not the music edition, or if main.js was built from a dirty tree without --worktree) -> copy main.js, manifest.json, styles.css -> rsync assets/ -> the scratch copy is removed
# (and registered with the reaper, so a killed install does not leave it). The vault's data.json is not touched. The plugin folder is <vault>/.obsidian/plugins/<manifest id>; PLUGIN_DIR=... overrides it. Use install-latest.sh for a published release.
#   EDITION=lean ... builds and installs the lean edition instead (the guard then checks lean). INSTALL_LOCAL_NO_FETCH=1 skips the fetch.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
: "${VAULT:?set VAULT to the vault path, e.g. VAULT=~/forge-vaults/ClaudeQA}"
EDITION="${EDITION:-music}"
REF="origin/main"; WORKTREE=0; PLAN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --worktree) WORKTREE=1 ;;
    --ref) REF="${2:?--ref needs a sha or a branch}"; shift ;;
    --plan) PLAN=1 ;;
    *) echo "install-local: unknown option $1 (options: --ref <sha-or-branch>, --worktree, --plan)" >&2; exit 2 ;;
  esac
  shift
done
PLUGIN_DIR="$(VAULT="$VAULT" PLUGIN_DIR="${PLUGIN_DIR:-}" node scripts/resolve-plugin-dir.mjs)"      # <vault>/.obsidian/plugins/<id in manifest.json>, or $PLUGIN_DIR; exits 1 naming the path and the id

PREP_ARGS=(prepare --repo "$REPO" --ref "$REF"); [ "$WORKTREE" = 1 ] && PREP_ARGS+=(--worktree)
INFO="$(node scripts/install-source.mjs "${PREP_ARGS[@]}")"                                          # one JSON line; exits 1 with one sentence when the ref is not a commit
field() { printf '%s' "$INFO" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s)[process.argv[1]];process.stdout.write(v==null?"":String(v))})' "$1"; }
SRC="$(field dir)"; SHA="$(field sha)"; TREE="$(field tree)"; LOUD="$(field loud)"; FETCHED="$(field fetched)"
SCRATCH=0; [ "$WORKTREE" = 0 ] && SCRATCH=1
cleanup() { if [ "$SCRATCH" = 1 ] && [ -n "${SRC:-}" ]; then node "$REPO/scripts/install-source.mjs" remove "$SRC" 2>/dev/null || true; fi; [ -n "${HOLD_PID:-}" ] && kill "$HOLD_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM HUP
if [ "$SCRATCH" = 1 ]; then node scripts/install-source.mjs hold "$SRC" "$$" >/dev/null 2>&1 & HOLD_PID=$!; fi      # the reaper owns the scratch copy if this script is killed without running its trap
[ -n "$LOUD" ] && echo "$LOUD"
case "$FETCHED" in failed*) echo "install-local: fetch $FETCHED" ;; esac
echo "install-local: building $SHA ($([ "$WORKTREE" = 1 ] && echo "working tree" || echo "$REF")), tree $TREE"
if [ "$PLAN" = 1 ]; then echo "install-local: --plan: nothing built, nothing installed"; exit 0; fi

(cd "$SRC" && FORGE_BUILD_SHA="$SHA" FORGE_BUILD_TREE="$TREE" FORGE_EDITION="$EDITION" npm run build)
GUARD=(--edition "$EDITION" --root "$SRC"); [ "$WORKTREE" = 1 ] && GUARD+=(--allow-dirty)
node scripts/check-installable-build.mjs "${GUARD[@]}"
cp "$SRC/main.js" "$SRC/manifest.json" "$SRC/styles.css" "$PLUGIN_DIR/"
rsync -a --delete "$SRC/assets/" "$PLUGIN_DIR/assets/"
echo "install-local: installed the $EDITION edition into $PLUGIN_DIR"
echo "install-local: built from $SHA, tree $TREE"
head -c 120 "$PLUGIN_DIR/main.js" | head -1
echo "Now reopen Obsidian; the console banner reads: FORGE CLIENT v… LOADED (edition: $EDITION, $SHA)"
