#!/usr/bin/env bash
# drain-matrix.sh — the drain's whole verification matrix in one command, on CLEAN worktrees, failing loudly.
#
# Usage:   bash scripts/drain-matrix.sh            # tests the COMMITTED HEAD of every repo (commit first!)
#          bash scripts/drain-matrix.sh <client-ref>   # a different client commit-ish; siblings stay at HEAD
#          KEEP=1 bash scripts/drain-matrix.sh         # leave the worktrees in place for inspection
#
# What it does: worktrees (detached, committed state only) of forge-client-obsidian, music-theory, forge-tutorial, forge-moda, music-core, forge and music-playground
# next to each other; links node_modules, forge/.venv and the music wheels into them; then, in the client worktree,
#   sync-bundled-vault --all + sync-engine-bundle  ->  the existing prebuild gates (engine drift, description hashes, open-time writes)  ->  the bundled-vault bump check
#   ->  build + `npm test` for the MUSIC edition, build + `npm test` for the LEAN edition.
# It FAILS (non-zero exit, a red line saying why) when: a repo is missing, a wheel is missing, a step fails, a test run does not print its summary, any test fails,
# or ANY test is skipped (a skipped test is not a passing test). It also WARNS when a repo has uncommitted changes (the matrix does not see them).
# Output: one summary table at the end; full logs under $LOGDIR (default: <worktrees>/logs).
set -euo pipefail

PROJECTS="${PROJECTS:-$HOME/projects}"
REPOS=(forge-client-obsidian music-theory forge-tutorial forge-moda music-core forge music-playground)
CLIENT_REF="${1:-HEAD}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/drain-matrix.XXXXXX")"
LOGDIR="${LOGDIR:-$WORK/logs}"
mkdir -p "$LOGDIR"
T0=$(date +%s)
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
FAILED=0
fail()  { red "FAIL: $*"; FAILED=1; }
die()   { red "FAIL: $*"; cleanup; exit 1; }
cleanup() {
  [ "${KEEP:-0}" = "1" ] && { echo "worktrees kept in $WORK"; return; }
  for r in "${REPOS[@]}"; do
    [ -d "$WORK/$r" ] || continue
    rm -f "$WORK/$r/node_modules" "$WORK/$r/.venv" "$WORK/$r/assets/wheels" 2>/dev/null || true
    git -C "$PROJECTS/$r" worktree remove --force "$WORK/$r" >/dev/null 2>&1 || true
    git -C "$PROJECTS/$r" worktree prune >/dev/null 2>&1 || true
  done
  rm -rf "$WORK" 2>/dev/null || true
}
step() { echo; echo "== $* ($(( $(date +%s) - T0 ))s)"; }

# ---- 0. preconditions: loud, before anything is built --------------------------------------------------------------------------------------------------------------
for r in "${REPOS[@]}"; do [ -d "$PROJECTS/$r/.git" ] || die "repo $PROJECTS/$r is missing"; done
CLIENT="$PROJECTS/forge-client-obsidian"
[ -d "$CLIENT/node_modules" ] || die "$CLIENT/node_modules is missing (run npm install there)"
[ -d "$PROJECTS/forge/.venv" ] || die "$PROJECTS/forge/.venv is missing (the engine's Python env)"
WHEELS="$CLIENT/assets/wheels"
n_wheels=$(ls "$WHEELS"/*.whl 2>/dev/null | wc -l | tr -d ' ')
[ "$n_wheels" -ge 11 ] || die "only $n_wheels music wheels in $WHEELS (need 11): run 'npm run fetch-music-wheels' in the client (without them the engine tests SKIP)"
for r in "${REPOS[@]}"; do
  dirty=$(git -C "$PROJECTS/$r" status --porcelain --untracked-files=no | grep -v 'assets/vaults/' | grep -v '\.obsidian/' | grep -vc '^$' || true)
  [ "$dirty" -gt 0 ] && red "WARN: $r has $dirty uncommitted tracked change(s); the matrix tests the COMMITTED state only"
done

# ---- 1. worktrees + links -------------------------------------------------------------------------------------------------------------------------------------------
step "worktrees in $WORK"
for r in "${REPOS[@]}"; do
  ref=HEAD; [ "$r" = forge-client-obsidian ] && ref="$CLIENT_REF"
  git -C "$PROJECTS/$r" worktree add --detach "$WORK/$r" "$ref" >/dev/null 2>&1 || die "cannot create a worktree of $r at $ref"
  echo "  $r @ $(git -C "$WORK/$r" rev-parse --short HEAD)"
done
ln -s "$CLIENT/node_modules" "$WORK/forge-client-obsidian/node_modules"
ln -s "$PROJECTS/forge/.venv" "$WORK/forge/.venv"
mkdir -p "$WORK/forge-client-obsidian/assets"
ln -s "$WHEELS" "$WORK/forge-client-obsidian/assets/wheels"
cd "$WORK/forge-client-obsidian"

run() {  # run <logname> <command...> : log it, fail loudly with the tail of the log
  local name="$1"; shift
  if ! "$@" >"$LOGDIR/$name.log" 2>&1; then
    red "---- tail of $LOGDIR/$name.log"; tail -25 "$LOGDIR/$name.log" >&2
    die "step '$name' failed"
  fi
}

# ---- 2. sync + gates --------------------------------------------------------------------------------------------------------------------------------------------------
step "sync bundled vaults + engine"
run sync bash -c 'FORGE_EDITION=music node scripts/sync-bundled-vault.mjs --all && node scripts/sync-engine-bundle.mjs'
step "prebuild gates"
run gates bash -c 'FORGE_EDITION=music npm run prebuild'
grep -E "Engine-bundle drift check|check-bundled-description-hashes:|check-open-time-writes:" "$LOGDIR/gates.log" | cut -c1-200 || die "the gates printed no verdicts"
run bump bash -c 'FORGE_EDITION=music node scripts/check-bundled-vault-bump.mjs'
tail -1 "$LOGDIR/bump.log"

# ---- 3. build + test, both editions --------------------------------------------------------------------------------------------------------------------------------
declare -a SUMMARY
for ed in music lean; do
  step "build + npm test: $ed edition"
  run "build-$ed" bash -c "FORGE_EDITION=$ed npm run build"
  if ! npm test >"$LOGDIR/test-$ed.log" 2>&1; then :; fi        # a failing suite is judged from its summary below, with the failing names printed
  tests=$(grep -E '^ℹ tests ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  pass=$(grep -E '^ℹ pass ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  failn=$(grep -E '^ℹ fail ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  skipped=$(grep -E '^ℹ skipped ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  if [ -z "$tests" ] || [ -z "$failn" ] || [ -z "$skipped" ]; then
    red "---- tail of $LOGDIR/test-$ed.log"; tail -25 "$LOGDIR/test-$ed.log" >&2
    fail "$ed: the test run printed no summary (it did less than asked)"; SUMMARY+=("$ed: NO SUMMARY"); continue
  fi
  SUMMARY+=("$ed: tests $tests, pass $pass, fail $failn, skipped $skipped")
  echo "  tests $tests / pass $pass / fail $failn / skipped $skipped"
  if [ "$failn" != "0" ]; then fail "$ed: $failn test(s) failed"; grep -E '^✖' "$LOGDIR/test-$ed.log" | sort -u | head -15 >&2; fi
  if [ "$skipped" != "0" ]; then
    fail "$ed: $skipped test(s) SKIPPED (a skipped test is not a passing test)"; grep -E '^﹣' "$LOGDIR/test-$ed.log" | cut -c1-200 | head -10 >&2
  fi
done

# ---- 4. verdict ---------------------------------------------------------------------------------------------------------------------------------------------------------
echo; echo "==== drain-matrix summary ($(( $(date +%s) - T0 ))s) ===="
for l in "${SUMMARY[@]}"; do echo "  $l"; done
echo "  logs: $LOGDIR"
if [ "$FAILED" = "0" ]; then green "MATRIX GREEN: both editions, 0 failed, 0 skipped"; else red "MATRIX RED"; fi
if [ "${KEEP:-0}" != "1" ]; then
  mkdir -p "${LOGKEEP:-/tmp}/drain-matrix-logs" && cp -R "$LOGDIR"/. "${LOGKEEP:-/tmp}/drain-matrix-logs/" 2>/dev/null && echo "  logs copied to ${LOGKEEP:-/tmp}/drain-matrix-logs"
fi
cleanup
exit "$FAILED"
