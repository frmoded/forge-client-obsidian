#!/usr/bin/env bash
# v0.2.196 housekeeping drain — detect + repair the symlink loop that
# breaks `tests/moda/test_go_snapshot.py` setup.
#
# Root cause (investigated 2026-06-29):
#
# The user's dev setup symlinks
#   ~/projects/forge-vaults/forge-moda-vault/.obsidian/plugins/forge-client-obsidian
#   → ~/projects/forge-client-obsidian/
#
# (so plugin edits are visible in the vault without re-installing). The
# plugin source repo has an `obsidian_sandbox/sandbox/` subdir that is
# ITSELF an Obsidian vault, with its OWN
#   obsidian_sandbox/sandbox/.obsidian/plugins/forge-client-obsidian
#   → ~/projects/forge-client-obsidian/
# symlink. When `shutil.copytree` walks the outer vault, it follows the
# symlink into the source repo, recurses into obsidian_sandbox/sandbox,
# follows its symlink BACK into the source repo, etc., until the OS
# rejects the path length and the test fixture errors out.
#
# The pure-Python fix landed in v0.2.196: tests/moda/test_go_snapshot.py
# now ignores `.obsidian` during copytree, so the loop is avoided
# regardless of the symlink state.
#
# This script is the OPTIONAL secondary repair: it removes the inner
# symlink (in the plugin source's obsidian_sandbox/sandbox dir) so the
# loop can't form at all. Useful for anyone else who hits the same
# issue while running `shutil.copytree` over their dev vault.
#
# SAFE BY DEFAULT: this script does a dry-run by default and only
# removes anything when invoked with `--execute`. It exits 0 in both
# modes; the dry-run mode just shows what would happen.
#
# Usage:
#   bash scripts/cleanup-sandbox-symlink-loop.sh             # dry-run
#   bash scripts/cleanup-sandbox-symlink-loop.sh --execute   # remove

set -euo pipefail

DRY_RUN=1
if [[ "${1:-}" == "--execute" ]]; then
  DRY_RUN=0
fi

REPO_ROOT="${REPO_ROOT:-$HOME/projects/forge-client-obsidian}"
INNER_PLUGIN_SYMLINK="$REPO_ROOT/obsidian_sandbox/sandbox/.obsidian/plugins/forge-client-obsidian"

if [[ ! -L "$INNER_PLUGIN_SYMLINK" ]]; then
  echo "Nothing to clean up — no symlink at:"
  echo "  $INNER_PLUGIN_SYMLINK"
  exit 0
fi

target=$(readlink "$INNER_PLUGIN_SYMLINK")

# Only remove a symlink whose target is the plugin source repo itself
# (the loop). Anything else is the user's own setup; leave it.
if [[ "$target" != "$REPO_ROOT" ]]; then
  echo "Symlink target ($target) is not the plugin repo root ($REPO_ROOT)."
  echo "Refusing to delete — this isn't the known recursion case."
  exit 0
fi

if [[ $DRY_RUN -eq 1 ]]; then
  cat <<EOF
DRY RUN — would remove the inner symlink:

  $INNER_PLUGIN_SYMLINK
    → $target

This breaks the recursion loop:
  forge-moda-vault/.obsidian/plugins/forge-client-obsidian
    → forge-client-obsidian/obsidian_sandbox/sandbox/.obsidian/plugins/forge-client-obsidian
    → forge-client-obsidian (back where we started)

Re-run with --execute to remove. No content is lost; the sandbox vault
will still function (it just won't have the plugin auto-mounted).
EOF
  exit 0
fi

rm "$INNER_PLUGIN_SYMLINK"
echo "Removed: $INNER_PLUGIN_SYMLINK"
echo "Done. The symlink loop is broken."
