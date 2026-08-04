#!/usr/bin/env bash
# vault-drift-cleanup.sh — categorize and clean up uncommitted CONTENT
# drift inside one git-tracked Obsidian vault.
#
# NOT to be confused with `vault-drift-audit.sh`, which reports a
# different kind of drift: installed plugin VERSION vs latest release,
# across every vault on the machine. This script cares about note
# content in one vault, and never looks at plugin versions.
#
# Why it exists (CW-vault-drift-cleanup-helper, drain 2026-08-03-1505):
# driver's ClaudeQA vault accumulated 23 modified + 14 untracked + 2
# deleted files with no way to triage them short of hand-reviewing
# `git status` or deleting the vault and reinstalling. The first is
# slow; the second loses local work.
#
# On the drift's actual origin: `install-latest.sh` does NOT touch vault
# notes. It backs up data.json, replaces
# `.obsidian/plugins/forge-client-obsidian/`, and restores data.json —
# nothing else. Note-content drift comes from the PLUGIN re-extracting
# bundled vault content at runtime, plus local edits by driver, wizard,
# and CCQA between installs. Aiming cleanup at install-latest would miss
# it entirely.
#
# Usage:
#   bash scripts/vault-drift-cleanup.sh [--report|--stash|--commit|--purge]
#
# Modes:
#   --report   (default) categorized, non-destructive summary
#   --stash    git stash push -u everything, reversible with `git stash pop`
#   --commit   interactive, per-category yes/no
#   --purge    DESTRUCTIVE reset --hard + clean -fd; requires typing YES
#
# Overrides:
#   VAULT=<path>   target vault (default: $HOME/forge-vaults/bluh,
#                  matching install-latest.sh's default)
#
# Exit codes: 0 success (including "no drift"), 1 usage/precondition error.

set -euo pipefail

VAULT="${VAULT:-$HOME/forge-vaults/bluh}"
MODE="report"
STAMP="$(date +%Y-%m-%d)"

usage() {
  cat <<'EOF'
vault-drift-cleanup.sh — triage uncommitted content drift in one vault.

  bash scripts/vault-drift-cleanup.sh --report        # see what's drifted
  bash scripts/vault-drift-cleanup.sh --report | head # first N lines
  bash scripts/vault-drift-cleanup.sh --stash         # stash all for later review
  bash scripts/vault-drift-cleanup.sh --commit        # interactive per-category commit
  bash scripts/vault-drift-cleanup.sh --purge         # nuclear reset (asks for YES)

Override the target vault with VAULT=<path>:

  VAULT=~/forge-vaults/ClaudeQA bash scripts/vault-drift-cleanup.sh --report

Related but different: scripts/vault-drift-audit.sh reports installed
plugin VERSION drift across every vault. This script is about note
content in one vault.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --report) MODE="report" ;;
    --stash)  MODE="stash" ;;
    --commit) MODE="commit" ;;
    --purge)  MODE="purge" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $arg"; echo; usage; exit 1 ;;
  esac
done

# --- Preconditions ---
if [[ ! -d "$VAULT" ]]; then
  echo "ERROR: vault not found at $VAULT"
  echo "  Override with VAULT=<path>."
  exit 1
fi
if ! git -C "$VAULT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $VAULT is not a git repository."
  echo "  This helper triages drift via git; an untracked vault has no baseline"
  echo "  to compare against and nothing to stash, commit, or reset."
  exit 1
fi

# Collect once. Porcelain v1: XY<space>path, so status is cols 1-2 and
# the path starts at col 4. Renames ("R  old -> new") keep the arrow in
# the path field, which is fine — we only group and display.
PORCELAIN="$(git -C "$VAULT" status --porcelain || true)"

if [[ -z "$PORCELAIN" ]]; then
  echo "=== vault-drift-cleanup: $VAULT ==="
  echo "  ✓ no drift — working tree is clean. Nothing to do."
  exit 0
fi

# Group a set of porcelain lines by top-level directory. Reads lines on
# stdin, prints "  <dir>/  (<n>)" then each path indented under it.
group_by_dir() {
  # Sort by PATH first (-k2), so all of a directory's entries arrive
  # adjacent and awk can emit one header per directory as it goes.
  # Sorting awk's OUTPUT instead would interleave headers and filenames
  # into lexical order and destroy the grouping.
  sort -k2 | awk '{
    path = substr($0, 4)
    n    = index(path, "/")
    dir  = (n > 0) ? substr(path, 1, n - 1) : "(vault root)"
    if (dir != prev) {
      if (prev != "") printf "\n"
      printf "    %s/\n", dir
      prev = dir
    }
    printf "      %s\n", path
  }'
}

# The three buckets must PARTITION the porcelain output — every line in
# exactly one. Matching each bucket with its own independent pattern
# double-counts: a staged-modify-then-deleted file has status "MD",
# which matches both a modify pattern and a delete pattern, so the
# category totals overshoot the real number of changed files. Filter
# progressively instead, with delete taking priority over modify (a file
# that ends up deleted is a deletion, whatever happened to it first).
UNTRACKED="$(echo "$PORCELAIN" | grep -E '^\?\?' || true)"
REST="$(echo "$PORCELAIN" | grep -vE '^\?\?' || true)"
DELETED="$(echo "$REST" | grep -E '^(.D|D.)' || true)"
MODIFIED="$(echo "$REST" | grep -vE '^(.D|D.)' || true)"

count_lines() { [[ -z "$1" ]] && echo 0 || echo "$1" | wc -l | tr -d ' '; }

# Pin the partition. If a future status code slips through uncategorized
# — or gets counted twice — this fails loudly instead of quietly printing
# a summary that doesn't add up.
_total="$(count_lines "$PORCELAIN")"
_sum=$(( $(count_lines "$UNTRACKED") + $(count_lines "$MODIFIED") + $(count_lines "$DELETED") ))
if [[ "$_sum" -ne "$_total" ]]; then
  echo "ERROR: vault-drift-cleanup categories do not partition the working tree:"
  echo "  $(count_lines "$UNTRACKED") new + $(count_lines "$MODIFIED") modified +" \
       "$(count_lines "$DELETED") deleted = $_sum, but git reports $_total changed file(s)."
  echo "  Refusing to act on a miscount. Please file this with the git status output."
  exit 1
fi

report() {
  echo "=== vault-drift-cleanup: $VAULT ==="
  echo "  branch: $(git -C "$VAULT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  echo
  echo "  NEW (untracked) — $(count_lines "$UNTRACKED") file(s)"
  [[ -n "$UNTRACKED" ]] && echo "$UNTRACKED" | group_by_dir || echo "      (none)"
  echo
  echo "  MODIFIED — $(count_lines "$MODIFIED") file(s)"
  [[ -n "$MODIFIED" ]] && echo "$MODIFIED" | group_by_dir || echo "      (none)"
  echo
  echo "  DELETED — $(count_lines "$DELETED") file(s)"
  [[ -n "$DELETED" ]] && echo "$DELETED" | group_by_dir || echo "      (none)"
  echo
  echo "  Next: --stash (reversible) · --commit (interactive) · --purge (destructive)"
}

case "$MODE" in
  report)
    report
    ;;

  stash)
    report
    echo
    echo "=== --stash ==="
    echo "  Stashing ALL of the above (including untracked, via -u)."
    echo "  Reversible: git -C $VAULT stash pop"
    git -C "$VAULT" stash push -u -m "vault-drift-cleanup: local changes stashed $STAMP"
    echo
    echo "  ✓ stashed. Current stash list:"
    git -C "$VAULT" stash list | head -5 | sed 's/^/    /'
    ;;

  commit)
    report
    echo
    echo "=== --commit (interactive) ==="
    if [[ ! -t 0 ]]; then
      echo "ERROR: --commit needs an interactive terminal to ask per category."
      echo "  Use --report to inspect, or --stash to set everything aside."
      exit 1
    fi
    committed=0
    # Each category is staged and committed separately so the history
    # says which kind of drift it was, rather than one opaque blob.
    for pair in "NEW:$UNTRACKED" "MODIFIED:$MODIFIED" "DELETED:$DELETED"; do
      label="${pair%%:*}"
      body="${pair#*:}"
      [[ -z "$body" ]] && continue
      echo
      echo "  $label — $(count_lines "$body") file(s):"
      echo "$body" | sed 's/^/      /' | head -20
      [[ $(count_lines "$body") -gt 20 ]] && echo "      … and $(( $(count_lines "$body") - 20 )) more"
      printf '  Commit these %s files? [y/N] ' "$label"
      read -r answer
      answer="${answer%$'\r'}"
      if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
        # -z + xargs -0 so paths with spaces survive.
        echo "$body" | awk '{print substr($0, 4)}' | tr '\n' '\0' \
          | xargs -0 git -C "$VAULT" add --
        git -C "$VAULT" commit -q -m "vault local edits post-install $STAMP ($label)"
        echo "    ✓ committed: $(git -C "$VAULT" log -1 --pretty=%h)"
        committed=$((committed + 1))
      else
        echo "    skipped."
      fi
    done
    echo
    if [[ $committed -eq 0 ]]; then
      echo "  Nothing committed."
    else
      echo "  ✓ $committed categor(y/ies) committed."
    fi
    ;;

  purge)
    report
    echo
    echo "=== --purge — DESTRUCTIVE ==="
    echo "  This will PERMANENTLY discard everything listed above:"
    echo "    git reset --hard HEAD   (reverts modified + deleted)"
    echo "    git clean -fd           (removes untracked files + dirs)"
    echo
    echo "  There is no undo. Anything not committed or stashed is gone."
    echo "  If you might want it back, run --stash instead."
    echo
    if [[ ! -t 0 ]]; then
      echo "ERROR: --purge needs an interactive terminal to confirm."
      echo "  Refusing to destroy $(count_lines "$PORCELAIN") file(s) unattended."
      exit 1
    fi
    printf '  Type YES (all caps) to proceed: '
    read -r confirm
    # Strip a trailing CR. A real terminal doesn't send one, but a pty
    # harness does, and "YES\r" silently failing the compare would make
    # this gate look like it works when it is actually just refusing
    # everything.
    confirm="${confirm%$'\r'}"
    if [[ "$confirm" != "YES" ]]; then
      echo "  Aborted — nothing was changed."
      exit 0
    fi
    git -C "$VAULT" reset --hard HEAD
    git -C "$VAULT" clean -fd
    echo
    echo "  ✓ purged. Working tree:"
    if [[ -z "$(git -C "$VAULT" status --porcelain)" ]]; then
      echo "    clean."
    else
      echo "$(git -C "$VAULT" status --porcelain)" | sed 's/^/    /'
      echo "    (anything remaining is gitignored — clean -fd leaves those alone)"
    fi
    ;;
esac
