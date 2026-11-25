#!/usr/bin/env bash
# drain-matrix.sh — the drain's whole verification matrix in one command, on CLEAN worktrees, failing loudly.
#
# Usage:   bash scripts/drain-matrix.sh            # tests the COMMITTED HEAD of every repo (commit first!)
#          bash scripts/drain-matrix.sh <client-ref>   # a different client commit-ish; siblings stay at HEAD
#          KEEP=1 bash scripts/drain-matrix.sh         # leave the worktrees in place for inspection
#          --forge | --no-forge | --auto (default)     # the forge-pytest leg: always / never / only when the drain touched forge Python (see below)
#          --forge-only                                # run ONLY the forge-pytest leg (no client sync, build or tests): the quick check for an engine-only drain
#          --quiet-only                                # 2026-11-19-0945: run ONLY the hygiene step (the load-sensitive test files, below): the small re-run for the day a matrix said NEEDS A QUIET MACHINE (exit 3)
#   2026-11-19-0945: BEFORE the legs the matrix runs the load-sensitive test files (scripts/test-groups.mjs LOAD_SENSITIVE_FILES: the process-hygiene tests that wait on kill timing) with `scripts/run-tests.mjs --load-sensitive=only`, and the legs run
#   without them (--load-sensitive=skip). When that step says `needs-quiet-machine` (a failure while the machine was thrashing) the matrix names it, still runs and reports the legs, and ends NEITHER green (exit 0) NOR red (exit 1): exit 3.
#          --serial                                    # run the legs one after the other (the pre-2026-10-26 behaviour; for a machine that cannot take three at once)
#          --cleanup-worktrees                         # take back the git worktrees a KILLED matrix left registered in the seven repos (`git worktree remove --force` on each one registered under a drain-matrix.* directory, then `git worktree prune`; never a recursive delete of a tree), then exit
#          FORGE_POWER_GUARD=off / FORGE_CAFFEINATE=off  # the two switches of the power guard below
#          --full-lean                                 # the LEAN leg runs the WHOLE suite again (the behaviour before 2026-11-04-1174); by default it runs only the edition-sensitive files (below)
#          FORGE_MATRIX_FILE_CONC=4                    # 2026-11-20-1001z: the test files ONE LEG runs at once (default: computed from FORGE_MEM_BUDGET_MB / FORGE_MATRIX_FILE_MB by scripts/dev/mem-plan.mjs matrix-files; this wins when set)
#          FORGE_MATRIX_FILE_MB=1350                   # 2026-11-20-1001zz: the size ONE test file is assumed to take, in MB (default 600, measured 2026-11-02 at about 520 MB a file): the files a leg runs at once are FORGE_MEM_BUDGET_MB / this / legs, never more than 4 by default; a larger number here lowers the concurrency without naming it (FORGE_MATRIX_FILE_CONC=<n> sets it outright and wins)
#          FORGE_MATRIX_RSS_MB / FORGE_HEAVY_GUARD=off # 2026-11-20-1001z: the memory guard around the whole run (see "ONE HEAVY THING AT A TIME" below and the header of scripts/heavy-guard.sh)
#
# What it does: worktrees (detached, committed state only) of forge-client-obsidian, music-theory, forge-tutorial, forge-moda, music-core, forge and music-playground
# next to each other; links node_modules, forge/.venv and the music wheels into them; then THREE LEGS AT THE SAME TIME (drain 2026-10-26-1300; the machine has the cores):
#   the MUSIC leg, in the client worktree:  sync-bundled-vault --all + sync-engine-bundle  ->  bundle-lag (FAILS when that sync changed the committed assets/vaults: the bundle lags the source vaults, 2026-10-27-0930)  ->  the pinned-engine-fixtures check (fails naming `npm run rerecord-engine-fixtures`)
#                                           ->  the existing prebuild gates (engine drift, description hashes, open-time writes)  ->  the bundled-vault bump check  ->  build + `npm test` for the MUSIC edition;
#   the LEAN leg, in a SECOND client worktree (lean/forge-client-obsidian, its siblings symlinked to the first set): the same sync, then build + `npm test` for the LEAN edition
#                                           (the explicit gates run and the bump check are edition-independent and run once, in the music leg, as they did when the legs were serial; `npm run build` also runs the package's prebuild hook, the same gates, in every build);
#   the FORGE leg: `pytest tests/music` (below), whenever its rule says it runs.
# Why two client worktrees: a build writes main.js and the generated sources into its tree, so two editions cannot share one. Which tests each leg runs (2026-11-04-1174): the MUSIC leg runs the whole suite; the LEAN leg runs only the files that
# can see a difference between the editions, COMPUTED by a static import scan (scripts/dev/lean-leg-files.mjs: a file that reaches the built main.js, a generated module, an edition selector, the real-plugin bundle, a build step, or that the scan cannot
# read, stays in the lean leg; the rest is the same computation in both worktrees). The leg prints how many files it ran and which; --full-lean restores the old behaviour (both editions in full).
# It FAILS (non-zero exit, a red line saying why) when: a repo is missing, a wheel is missing, a step fails, a test run does not print its summary, any test fails,
# or ANY test is skipped (a skipped test is not a passing test). It also WARNS when a repo has uncommitted changes (the matrix does not see them). A failed step in one leg does not
# stop the others (they are already running); the matrix waits for all of them, prints each failure's log tail, and exits non-zero. The exit status is the status of the whole matrix:
# the push of a drain stays conditional on it.
#
# The forge-pytest leg (drain 2026-10-25-1030): `pytest tests/music -q` in the clean forge worktree (the venv is the real forge/.venv, but the leg first CHECKS that `forge` is imported from the worktree and not from the
# main checkout, so what runs is the committed tree). Why: the client legs never ran forge's own tests, so three red byte-exact tests were carried as "identical on a clean HEAD" through two drains.
#   * auto (default): the leg runs when the COMMITTED, not-yet-pushed change in forge (`git diff --name-only origin/main...HEAD`, the local remote-tracking ref: no fetch) touches `forge/**/*.py` or `tests/**`;
#     when forge has no origin/main to compare against it cannot tell, so it runs. --forge forces it, --no-forge skips it.
#   * it FAILS the matrix (exit non-zero) on: a failed or errored test, a pytest exit code other than 0, no summary line, no test passed, or MORE skips than FORGE_PYTEST_SKIP_MAX (default 7, the skips tests/music
#     has since drain 2026-10-27-0900 (was 40, then 10: the seven left are percussion-lab tests that need Python >= 3.10); a ratchet, so a NEW skip cannot hide behind a green line; lower it when skips are fixed). Skip reasons are printed when the ceiling is crossed.
#   * the push of a drain that ran this leg stays conditional on the matrix's exit status.
# The power guard (2026-11-18-1200; a matrix started on battery at 10 % slept twice, timed out nested tests and hung for hours): BEFORE it creates anything the matrix reads `pmset -g batt` (scripts/dev/power-check.mjs, rules in power-core.mjs) and
#   REFUSES to start ONLY on battery power below 20 % charge (the driver's rule, 2026-11-18: exit 1, one sentence, FORGE_POWER_GUARD=off to run anyway); on AC power it never refuses, a battery at 20 % or more runs, and a Mac it cannot read (no pmset, a desktop) is not refused. It then holds the Mac awake for as long as it runs:
#   `caffeinate -i -s -w <its own pid>` (idle and system sleep; it ends with the matrix however that ends; FORGE_CAFFEINATE=off to skip). A killed matrix (kill -9, a closed terminal) leaves its worktrees registered: the next start prints how many and
#   the command, `bash scripts/drain-matrix.sh --cleanup-worktrees`, which removes exactly the worktrees git has registered under a drain-matrix.* directory (it waits for the heavy lock like everything here, so it cannot run under a live matrix).
# Output: one summary table at the end; full logs under $LOGDIR (default: <worktrees>/logs).
set -euo pipefail

# 2026-11-19-0915: THE MATRIX RUNS A COPY OF ITSELF. bash reads a script as it goes, so an edit of this file while a matrix is running it moves the bytes under the shell and the run dies with a syntax error (it did, 2026-11-19, when comments of this file were edited mid-run).
# The first thing it does is copy itself to a temp file and run THAT; FORGE_MATRIX_SCRIPT_DIR keeps the original directory (where dev/ lives), FORGE_MATRIX_COPY names the copy, which cleanup removes at the end. FORGE_MATRIX_SELF_COPY=off: run the file itself (the old behaviour; the control of the test).
if [ "${FORGE_MATRIX_COPY:-}" != "$0" ] && [ "${FORGE_MATRIX_SELF_COPY:-}" != "off" ]; then          # "I am the copy" = FORGE_MATRIX_COPY is MY OWN path (a matrix started inside another one, as the tests do, inherits the outer's variable and must still copy itself)
  SELF_DIR="$(cd "$(dirname "$0")" && pwd)"; SELF_COPY="$(mktemp "${TMPDIR:-/tmp}/drain-matrix-copy.XXXXXX")"
  cp "$0" "$SELF_COPY" && FORGE_MATRIX_COPY="$SELF_COPY" FORGE_MATRIX_SCRIPT_DIR="$SELF_DIR" exec bash "$SELF_COPY" "$@"
fi
if [ "${FORGE_MATRIX_COPY:-}" = "$0" ]; then SCRIPT_DIR="$FORGE_MATRIX_SCRIPT_DIR"; else SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"; fi

# 2026-10-31-1125: ONE HEAVY THING AT A TIME. The first thing this script does is take $TMPDIR/forge-heavy.lock (scripts/dev/heavy-lock.mjs): when a mutation pass, a real-Chrome measure or another matrix holds it, this one WAITS and
# says who holds it; a stale lock (its holder gone, kill -9 included) is taken over. Whatever the lock starts is told so (FORGE_HEAVY_LOCK_HELD), so a heavy tool inside the matrix does not wait for the matrix. FORGE_HEAVY_LOCK=off: no lock.
# 2026-11-20-1001z: the same start now goes through scripts/heavy-guard.sh, which takes THAT lock exactly as before and adds the memory guard around the whole matrix (the legs, the hygiene step and the pytest leg are all in its process tree, so
# `--quiet-only` is covered too): it REFUSES to start (exit 75, "memory pressure high, wait") while the memory compressor holds more than 8 GB or more than 2 GB of swap is used, and it KILLS the whole tree (exit 76, "stopped by the memory guard") when the tree
# passes FORGE_MATRIX_RSS_MB (default 12288: two legs at their budget; FORGE_HEAVY_RSS_MB wins) or the compressor passes 10 GB. Inside a test run, and with FORGE_HEAVY_GUARD=off, it is only the lock. The numbers and variables: the header of scripts/heavy-guard.sh.
# 2026-11-24-1037: it WAITS up to FORGE_MATRIX_WAIT_MIN minutes (default 20) for the memory to come under the limits, one `waiting for memory: ...` line per 30 s, instead of refusing at once; after that it refuses as above (exit 75).
if [ -z "${FORGE_HEAVY_LOCK_HELD:-}" ] && [ "${FORGE_HEAVY_LOCK:-}" != "off" ]; then
  exec bash "$SCRIPT_DIR/heavy-guard.sh" --what drain-matrix --rss-mb "${FORGE_MATRIX_RSS_MB:-12288}" --wait-minutes "${FORGE_MATRIX_WAIT_MIN:-20}" -- bash "$0" "$@"
fi

PROJECTS="${PROJECTS:-$HOME/projects}"
REPOS=(forge-client-obsidian music-theory forge-tutorial forge-moda music-core forge music-playground)
FORGE_MODE=auto; FORGE_ONLY=0; QUIET_ONLY=0; NEEDQUIET=0; CLIENT_REF=HEAD; SERIAL=0; LEAN_FULL=0; CLEANUP_ONLY=0; CAFF=""
for arg in "$@"; do
  case "$arg" in
    --forge) FORGE_MODE=on ;;
    --no-forge) FORGE_MODE=off ;;
    --forge-only) FORGE_ONLY=1; [ "$FORGE_MODE" = auto ] && FORGE_MODE=on ;;      # the quick check runs the leg; follow it with --auto to let the change decide (the test uses that)
    --quiet-only) QUIET_ONLY=1; FORGE_MODE=off ;;                                  # the hygiene step only (no leg, no forge pytest)
    --auto) FORGE_MODE=auto ;;
    --serial) SERIAL=1 ;;
    --full-lean) LEAN_FULL=1 ;;
    --cleanup-worktrees) CLEANUP_ONLY=1 ;;
    --*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) CLIENT_REF="$arg" ;;
  esac
done
# 2026-11-18-1200: the worktrees git has registered for <repo> under a directory a matrix made (drain-matrix.XXXXXX, the mktemp name below); this is git's own record, not a sweep of the temp directory by name.
matrix_worktrees() { git -C "$PROJECTS/$1" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | grep -E '/drain-matrix\.[A-Za-z0-9]+/' || true; }
cleanup_worktrees() {
  local r wt l n=0 bad=0
  for r in "${REPOS[@]}"; do
    [ -e "$PROJECTS/$r/.git" ] || continue
    while IFS= read -r wt; do
      [ -n "$wt" ] || continue
      for l in node_modules .venv assets/wheels; do [ -L "$wt/$l" ] && unlink "$wt/$l"; done      # the links a matrix puts in a worktree go first, as links (unlink removes one link, never a directory; what it pointed at is untouched)
      if git -C "$PROJECTS/$r" worktree remove --force "$wt" >/dev/null 2>&1; then n=$((n+1)); echo "removed ($r): $wt"; else bad=$((bad+1)); echo "could not remove ($r): $wt" >&2; fi
    done < <(matrix_worktrees "$r")
    git -C "$PROJECTS/$r" worktree prune >/dev/null 2>&1 || true
  done
  echo "cleanup-worktrees: $n removed, $bad could not be removed (the logs of a killed run stay in its drain-matrix.* directory under the temp directory: read them, then delete it by hand)"
  [ "$bad" -eq 0 ]
}
if [ "$CLEANUP_ONLY" = "1" ]; then cleanup_worktrees; exit $?; fi
FORGE_PYTEST_SKIP_MAX="${FORGE_PYTEST_SKIP_MAX:-7}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/drain-matrix.XXXXXX")"
LOGDIR="${LOGDIR:-$WORK/logs}"
mkdir -p "$LOGDIR"
LEAN="$WORK/lean"
T0=$(date +%s)
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
FAILED=0
fail()  { red "FAIL: $*"; FAILED=1; }
die()   { red "FAIL: $*"; cleanup; exit 1; }
cleanup() {
  [ "${FORGE_MATRIX_COPY:-}" = "$0" ] && [ -f "$0" ] && unlink "$0" 2>/dev/null || true       # the temp copy of this script (a file, never a tree)
  [ -n "$CAFF" ] && kill "$CAFF" 2>/dev/null || true
  [ "${KEEP:-0}" = "1" ] && { echo "worktrees kept in $WORK"; return; }
  rm -f "$LEAN/forge-client-obsidian/node_modules" "$LEAN/forge-client-obsidian/assets/wheels" 2>/dev/null || true
  [ -d "$LEAN/forge-client-obsidian" ] && { git -C "$PROJECTS/forge-client-obsidian" worktree remove --force "$LEAN/forge-client-obsidian" >/dev/null 2>&1 || true; }
  for r in "${REPOS[@]}"; do
    [ -d "$WORK/$r" ] || continue
    rm -f "$WORK/$r/node_modules" "$WORK/$r/.venv" "$WORK/$r/assets/wheels" 2>/dev/null || true
    git -C "$PROJECTS/$r" worktree remove --force "$WORK/$r" >/dev/null 2>&1 || true
    git -C "$PROJECTS/$r" worktree prune >/dev/null 2>&1 || true
  done
  rm -rf "$LEAN" "$WORK" 2>/dev/null || true
}
# 2026-10-27-0715: an interrupted matrix used to leave work behind (measured: Ctrl-C left 8 registered git worktrees; SIGTERM to the script alone left 21 of its 65 processes running: the legs, `npm test`, node test files).
# INT / TERM / HUP now stop the legs and everything they started (children first, TERM, then KILL for what ignored it), then run the same cleanup as a normal end, and exit 130. A SIGKILL of the script itself cannot be handled:
# scripts/dev/reap.sh (called below at the start, and by hand) clears what such a kill leaves.
pids=()
kill_tree() { local sig="$1" p="$2" c; for c in $(pgrep -P "$p" 2>/dev/null); do kill_tree "$sig" "$c"; done; kill "-$sig" "$p" 2>/dev/null || true; }
on_signal() {
  trap - INT TERM HUP
  red "interrupted: stopping the legs and removing the worktrees"
  local p
  for p in "${pids[@]:-}"; do [ -n "$p" ] && kill_tree TERM "$p"; done
  sleep 1
  for p in "${pids[@]:-}"; do [ -n "$p" ] && kill_tree KILL "$p"; done
  cleanup
  exit 130
}
trap on_signal INT TERM HUP
REAP="$SCRIPT_DIR/dev/reap.sh"
# 2026-11-04-1174 (R): the narrow reaper (scripts/dev/reap-fixtures.mjs): kills only ORPHANED test processes whose command line carries a mutation runner's scratch directory (a leaked fixture mutant spins at 100 % CPU for ever). It runs
# after the legs and again at the cleanup; it never fails a run and never touches an unrelated node.
REAP_FIXTURES="$SCRIPT_DIR/dev/reap-fixtures.mjs"
reap_fixtures() { [ -f "$REAP_FIXTURES" ] && node "$REAP_FIXTURES" --quiet 2>/dev/null || true; }
# The broom is OPT-IN here (FORGE_REAP=1): it sweeps shared temp space by name, which nothing should do unasked. Run it by hand: bash scripts/dev/reap.sh --dry-run
reap_leftovers() { [ "${FORGE_REAP:-0}" = "1" ] && [ -f "$REAP" ] && bash "$REAP" --quiet 2>/dev/null || true; }
reap_leftovers                                   # what an EARLIER killed run left (orphaned test groups, stale worktrees): quiet, orphans only
step() { echo; echo "== $* ($(( $(date +%s) - T0 ))s)"; }

# 2026-11-21-1012 (item 6): the FIRST line of a run. When the memory compressor already holds over 5 GB the default is --serial with 2 files per leg (FORGE_MATRIX_FILE_CONC, when the driver set one, wins); the guard stopped three runs at 11.5 GB on 2026-11-21.
if [ "$QUIET_ONLY" != "1" ] && [ "$CLEANUP_ONLY" != "1" ]; then
  COMPRESSOR_SAYS="$(node "$SCRIPT_DIR/dev/mem-plan.mjs" compressor 2>/dev/null || true)"
  if [ -n "$COMPRESSOR_SAYS" ]; then printf '%s\n' "$COMPRESSOR_SAYS"; SERIAL=1; [ -z "${FORGE_MATRIX_FILE_CONC:-}" ] && export FORGE_MATRIX_FILE_CONC=2; fi
fi
# 2026-11-24-1037: the START of every run (after the compressor sentence, which stays the FIRST line) takes back what a killed one left: count the worktrees registered under a drain-matrix.* directory (the number a drain reports), `git worktree prune` (records whose directory is gone), then the --cleanup-worktrees
# behaviour for the rest. Only when the heavy lock is ours (a lock that is off cannot tell a killed matrix's worktrees from a live one's): then it only counts.
stale0=0; for r in "${REPOS[@]}"; do [ -e "$PROJECTS/$r/.git" ] && stale0=$(( stale0 + $(matrix_worktrees "$r" | grep -c . || true) )); done
for r in "${REPOS[@]}"; do [ -e "$PROJECTS/$r/.git" ] && git -C "$PROJECTS/$r" worktree prune >/dev/null 2>&1; done
if [ "${FORGE_HEAVY_LOCK:-}" = "off" ] && [ -z "${FORGE_HEAVY_LOCK_HELD:-}" ]; then echo "stale worktrees found: $stale0 (not removed: the heavy lock is off)"
else echo "stale worktrees found: $stale0"; [ "$stale0" -eq 0 ] || cleanup_worktrees || true; fi

# ---- 0. preconditions: loud, before anything is built --------------------------------------------------------------------------------------------------------------
# 2026-11-18-1200 (rule changed by the driver 2026-11-18): the power guard (see the header): refuse only on battery below 20 % charge, hold the Mac awake, and say how many worktrees an earlier KILLED matrix left registered.
set +e; power_out="$(node "$SCRIPT_DIR/dev/power-check.mjs" 2>&1)"; power_rc=$?; set -e
case "$power_rc" in 0) echo "$power_out" ;; 1) die "$power_out" ;; *) echo "power: the check could not run (exit $power_rc), not checked" ;; esac
if [ "${FORGE_CAFFEINATE:-}" != "off" ] && command -v caffeinate >/dev/null 2>&1; then caffeinate -i -s -w $$ >/dev/null 2>&1 & CAFF=$!; fi
stale=0; for r in "${REPOS[@]}"; do [ -e "$PROJECTS/$r/.git" ] && stale=$(( stale + $(matrix_worktrees "$r" | grep -c . || true) )); done
[ "$stale" -gt 0 ] && red "WARN: $stale worktree(s) of an earlier matrix are still registered (a killed run): bash scripts/drain-matrix.sh --cleanup-worktrees"
for r in "${REPOS[@]}"; do [ -d "$PROJECTS/$r/.git" ] || die "repo $PROJECTS/$r is missing"; done
CLIENT="$PROJECTS/forge-client-obsidian"
[ -d "$PROJECTS/forge/.venv" ] || die "$PROJECTS/forge/.venv is missing (the engine's Python env)"
WHEELS="$CLIENT/assets/wheels"
if [ "$FORGE_ONLY" = "0" ]; then
  [ -d "$CLIENT/node_modules" ] || die "$CLIENT/node_modules is missing (run npm install there)"
  n_wheels=$(ls "$WHEELS"/*.whl 2>/dev/null | wc -l | tr -d ' ')
  [ "$n_wheels" -ge 11 ] || die "only $n_wheels music wheels in $WHEELS (need 11): run 'npm run fetch-music-wheels' in the client (without them the engine tests SKIP)"
fi
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
ln -s "$PROJECTS/forge/.venv" "$WORK/forge/.venv"
if [ "$FORGE_ONLY" = "0" ]; then
  ln -s "$CLIENT/node_modules" "$WORK/forge-client-obsidian/node_modules"
  mkdir -p "$WORK/forge-client-obsidian/assets"
  ln -s "$WHEELS" "$WORK/forge-client-obsidian/assets/wheels"
  # the lean leg's own client worktree; the sibling repos it reads through ../ are links to the worktrees above, so both editions test the same commits
  mkdir -p "$LEAN"
  git -C "$CLIENT" worktree add --detach "$LEAN/forge-client-obsidian" "$CLIENT_REF" >/dev/null 2>&1 || die "cannot create the lean worktree of forge-client-obsidian at $CLIENT_REF"
  for r in "${REPOS[@]}"; do [ "$r" = forge-client-obsidian ] || ln -s "$WORK/$r" "$LEAN/$r"; done
  ln -s "$CLIENT/node_modules" "$LEAN/forge-client-obsidian/node_modules"
  mkdir -p "$LEAN/forge-client-obsidian/assets"
  ln -s "$WHEELS" "$LEAN/forge-client-obsidian/assets/wheels"
fi

declare -a SUMMARY
LEANSCAN="$SCRIPT_DIR/dev/lean-leg-files.mjs"

# 2026-10-31-1125: the memory budget. Node's own default is every core minus one test files at once PER LEG, and two legs run together (measured 2026-10-31: 34 files at once, 11.5 GB of tooling); the files one leg runs at once are
# capped so that (files x the assumed size of one) fits FORGE_MEM_BUDGET_MB (default half the RAM) - scripts/dev/mem-plan.mjs. FORGE_MATRIX_FILE_MB (default 400) is that size.
# 2026-11-05-1176: the machine first. Its load, swap and free memory are printed at the start of every run; when swap is over 85 % used or the 1-minute load is over 4 per core (two matrix reds on 2026-11-03/04 were that machine, not the tree) the legs are not run at once
# (the sentence says so and the run goes on --serial). Never a failure: a machine that cannot be read, or the check erroring, is silence and the run goes on as asked. FORGE_MACHINE_READ_FILE stands in for the machine in the tests.
STRAIN="$(node "$SCRIPT_DIR/dev/mem-plan.mjs" strain 2>/dev/null || true)"
[ -n "$STRAIN" ] && printf '%s\n' "$STRAIN"
if printf '%s\n' "$STRAIN" | grep -q '^the machine is thrashing'; then SERIAL=1; fi
LEGS_AT_ONCE=2; [ "$SERIAL" = "1" ] && LEGS_AT_ONCE=1
# 2026-11-20-1001z: FORGE_MATRIX_FILE_CONC=<n> sets the files one leg runs at once outright (a whole number from 1; mem-plan.mjs reads it and it wins over the budget calculation); the fallback below honours it too.
FILE_CONC="$(node "$SCRIPT_DIR/dev/mem-plan.mjs" matrix-files --legs "$LEGS_AT_ONCE" 2>/dev/null || echo "${FORGE_MATRIX_FILE_CONC:-8}")"
export FILE_CONC
echo "memory: $(node "$SCRIPT_DIR/dev/mem-plan.mjs" --legs "$LEGS_AT_ONCE" 2>/dev/null || echo 'budget unknown')"

# ---- 2. the legs --------------------------------------------------------------------------------------------------------------------------------------------------------
edition_leg() {   # edition_leg <edition> <client worktree>: sync (+ gates and bump check in the music leg) + build + npm test; a failed step leaves $LOGDIR/leg-<ed>.failed naming it
  local ed="$1" dir="$2" t0; t0=$(date +%s)
  local lg="$LOGDIR/leg-$ed"
  leg_step() { local name="$1"; shift; if ! "$@" >"$LOGDIR/$name.log" 2>&1; then echo "$name" >"$lg.failed"; return 1; fi; }
  cd "$dir"
  local sync=sync; [ "$ed" = music ] || sync="sync-$ed"
  leg_step "$sync" bash -c 'FORGE_EDITION=music node scripts/sync-bundled-vault.mjs --all && node scripts/sync-engine-bundle.mjs' || return 0
  if [ "$ed" = music ]; then
    # 2026-10-27-0930: the sync just ran in a CLEAN worktree of the committed client, so any change it made to assets/vaults is the committed bundle lagging the source vaults. A vault drain that bumps a forge.toml commits the client sync in the same drain.
    leg_step bundle-lag bash -c 'lag=$(git status --porcelain --untracked-files=all -- assets/vaults); if [ -n "$lag" ]; then vaults=$(echo "$lag" | awk "{print \$NF}" | sed -E "s#^assets/vaults/([^/]+)/.*#\1#" | sort -u); echo "the COMMITTED bundle (assets/vaults) lags the source vault(s): $(echo $vaults)"; echo "the sync changed:"; echo "$lag" | head -25; for v in $vaults; do echo "newest commits in $v that the bundle has not caught up with:"; paths=$(echo "$lag" | awk "{print \$NF}" | grep "^assets/vaults/$v/" | sed "s#^assets/vaults/$v/##" | head -50); c=$(cd "../$v" 2>/dev/null && git log --oneline -n 3 -- $paths 2>/dev/null); [ -n "$c" ] || c=$(cd "../$v" 2>/dev/null && git log --oneline -n 3 2>/dev/null); echo "${c:-(no git history readable here)}" | sed "s/^/  /"; done; for v in $vaults; do echo "fix: node scripts/sync-bundled-vault.mjs $v   (in the client repo; then commit assets/vaults, and bump the vault forge.toml in the same drain)"; done; echo "a wizard batch (forge_edit_markdown_note, forge_render_music: they commit in the vault but neither bump forge.toml nor sync the bundle) needs this step before any matrix"; exit 1; fi' || return 0
    # 2026-10-27-0710: the two pinned engine fixtures (shipped-notes.json, rederive-comparison.json) must match the engine the sync just bundled; a stale one fails HERE naming `npm run rerecord-engine-fixtures`, not as a generic gate failure two steps later.
    leg_step fixtures bash -c 'node scripts/check-engine-fixtures.mjs' || return 0
    leg_step gates bash -c 'FORGE_EDITION=music npm run prebuild' || return 0
    leg_step bump bash -c 'FORGE_EDITION=music node scripts/check-bundled-vault-bump.mjs' || return 0
  fi
  leg_step "build-$ed" bash -c "FORGE_EDITION=$ed npm run build" || return 0
  # 2026-11-04-1174 (A): the lean leg runs only the edition-sensitive files (a COMPUTED import scan of THIS worktree; if the scan cannot run or finds nothing, the whole suite runs: the safe side). The music leg always runs everything.
  local subset=""
  if [ "$ed" = lean ] && [ "$LEAN_FULL" != "1" ]; then
    subset="$(node "$LEANSCAN" --root "$dir" --files 2>"$LOGDIR/lean-scan.err" || true)"
    [ -n "$subset" ] && node "$LEANSCAN" --root "$dir" --report >"$LOGDIR/lean-report.txt" 2>>"$LOGDIR/lean-scan.err" || true
    [ -s "$LOGDIR/lean-report.txt" ] || subset=""
  fi
  if [ -n "$subset" ]; then
    # shellcheck disable=SC2086
    { node scripts/test-preflight.mjs && node scripts/run-tests.mjs --test-concurrency="${FILE_CONC:-8}" $subset --load-sensitive=skip; } >"$LOGDIR/test-$ed.log" 2>&1 || true        # 2026-11-05-1184: through the runner, so the nested-runner files run one at a time after the rest under a hard group timeout
  else
    npm test -- --test-concurrency="${FILE_CONC:-8}" --load-sensitive=skip >"$LOGDIR/test-$ed.log" 2>&1 || true        # a failing suite is judged from its summary below, with the failing names printed
  fi
  echo $(( $(date +%s) - t0 )) >"$lg.secs"
}

forge_touched() {   # the committed, unpushed change in forge that makes the leg run (empty = none); "?" = cannot tell
  if ! git -C "$PROJECTS/forge" rev-parse --verify -q origin/main >/dev/null 2>&1; then echo "?"; return 0; fi
  git -C "$PROJECTS/forge" diff --name-only origin/main...HEAD -- ':(glob)forge/**/*.py' ':(glob)tests/**' 2>/dev/null || true
}
run_forge_leg=0; forge_why=""
case "$FORGE_MODE" in
  on) run_forge_leg=1; forge_why="forced by --forge" ;;
  off) forge_why="skipped by --no-forge" ;;
  auto)
    touched="$(forge_touched)"
    if [ "$touched" = "?" ]; then run_forge_leg=1; forge_why="forge has no origin/main to compare with: cannot tell what changed, so it runs"
    elif [ -n "$touched" ]; then run_forge_leg=1; forge_why="forge changed $(printf '%s\n' "$touched" | wc -l | tr -d ' ') file(s) under forge/**/*.py or tests/** since origin/main"
    else forge_why="no committed change under forge/**/*.py or tests/** since origin/main"; fi ;;
esac
forge_wrong_tree=""
forge_leg() {      # the pytest run itself (the verdict is read from its log afterwards, below)
  local t0; t0=$(date +%s)
  set +e
  (cd "$WORK/forge" && .venv/bin/python -m pytest tests/music -q -rfEs -p no:cacheprovider) >"$LOGDIR/forge-pytest.log" 2>&1
  echo $? >"$LOGDIR/forge-pytest.rc"
  set -e
  echo $(( $(date +%s) - t0 )) >"$LOGDIR/leg-forge.secs"
}

# ---- 2a. hygiene first (2026-11-19-0945) -------------------------------------------------------------------------------------------------------------------------------
# The load-sensitive test files (scripts/test-groups.mjs LOAD_SENSITIVE_FILES) run FIRST, alone, before any leg is started (the quietest this machine will be during the run); the legs run without them. `needs-quiet-machine` = a failure while the
# machine was thrashing: named here, counted apart, the matrix goes on and ends in exit 3 (neither green nor red); a failure on a calm machine, no summary, or any other exit is a plain failure.
HYG_LINES=""
if [ "$FORGE_ONLY" = "0" ]; then
  step "hygiene first: the load-sensitive test files (LOAD_SENSITIVE_FILES in scripts/test-groups.mjs), before any leg starts"
  set +e; ( cd "$WORK/forge-client-obsidian" && node scripts/run-tests.mjs --load-sensitive=only ) >"$LOGDIR/hygiene.log" 2>&1; hyg_rc=$?; set -e
  h_tests=$({ grep -E '^ℹ tests ' "$LOGDIR/hygiene.log" || true; } | tail -1 | awk '{print $3}'); h_pass=$({ grep -E '^ℹ pass ' "$LOGDIR/hygiene.log" || true; } | tail -1 | awk '{print $3}'); h_fail=$({ grep -E '^ℹ fail ' "$LOGDIR/hygiene.log" || true; } | tail -1 | awk '{print $3}')
  h_quiet=$({ grep -E '^ℹ needs-quiet-machine ' "$LOGDIR/hygiene.log" || true; } | tail -1 | awk '{print $3}'); h_quiet="${h_quiet:-0}"
  if [ -z "$h_tests" ] || [ -z "$h_fail" ]; then
    red "---- tail of $LOGDIR/hygiene.log"; tail -25 "$LOGDIR/hygiene.log" >&2
    fail "hygiene: the run printed no summary (it did less than asked)"; SUMMARY+=("hygiene (before the legs): NO SUMMARY")
  else
    echo "  tests $h_tests / pass $h_pass / fail $h_fail / needs a quiet machine $h_quiet"
    if [ "$h_fail" != "0" ]; then fail "hygiene: $h_fail test(s) failed (the machine was not thrashing, or the file is not a load-sensitive one: a plain failure)"; { grep -E '^✖' "$LOGDIR/hygiene.log" || true; } | sort -u | head -15 >&2; SUMMARY+=("hygiene (before the legs): tests $h_tests, pass $h_pass, FAIL $h_fail")
    elif [ "$h_quiet" != "0" ]; then
      NEEDQUIET="$h_quiet"; { grep -E '^⚠ NEEDS A QUIET MACHINE' "$LOGDIR/hygiene.log" || true; } | cut -c1-220 | while IFS= read -r l; do yellow "  $l"; done
      SUMMARY+=("hygiene (before the legs): NEEDS A QUIET MACHINE ($h_quiet test(s)), not a pass and not a failure")
    elif [ "$hyg_rc" != "0" ]; then fail "hygiene: the run exited $hyg_rc without a failure to name (see $LOGDIR/hygiene.log)"; SUMMARY+=("hygiene (before the legs): exit $hyg_rc")
    else SUMMARY+=("hygiene (before the legs): tests $h_tests, pass $h_pass, fail $h_fail"); fi
  fi
fi

pids=()
if [ "$FORGE_ONLY" = "0" ] && [ "$QUIET_ONLY" = "0" ]; then
  if [ "$SERIAL" = "1" ]; then step "client legs, one after the other (--serial)"; else step "client legs: music and lean at the same time"; fi
  if [ "$SERIAL" = "1" ]; then (edition_leg music "$WORK/forge-client-obsidian"); (edition_leg lean "$LEAN/forge-client-obsidian")
  else
    edition_leg music "$WORK/forge-client-obsidian" & pids+=($!)
    edition_leg lean "$LEAN/forge-client-obsidian" & pids+=($!)
  fi
fi
if [ "$run_forge_leg" = "1" ]; then
  step "forge pytest: tests/music ($forge_why)"
  forge_wt="$(cd "$WORK/forge" && pwd -P)"
  imported="$(cd "$WORK/forge" && .venv/bin/python -c 'import forge, os; print(os.path.dirname(os.path.dirname(os.path.realpath(forge.__file__))))' 2>/dev/null || echo "?")"
  if [ "$imported" != "$forge_wt" ]; then
    forge_wrong_tree="$imported"
  elif [ "$SERIAL" = "1" ] || [ "$FORGE_ONLY" = "1" ]; then forge_leg
  else forge_leg & pids+=($!)
  fi
fi
for p in "${pids[@]:-}"; do [ -n "$p" ] && { wait "$p" || true; }; done
reap_fixtures                                    # what a fixture of the suites just run left behind (a leaked hung mutant), before anything is judged

# ---- 3. what the legs said ----------------------------------------------------------------------------------------------------------------------------------------
for ed in music lean; do
  [ "$FORGE_ONLY" = "1" ] || [ "$QUIET_ONLY" = "1" ] && break
  step "result: $ed edition ($(cat "$LOGDIR/leg-$ed.secs" 2>/dev/null || echo '?') s in its own leg)"
  if [ -f "$LOGDIR/leg-$ed.failed" ]; then
    name="$(cat "$LOGDIR/leg-$ed.failed")"
    red "---- tail of $LOGDIR/$name.log"; tail -25 "$LOGDIR/$name.log" >&2
    fail "$ed: step '$name' failed"; SUMMARY+=("$ed: step '$name' FAILED"); continue
  fi
  if [ "$ed" = music ]; then
    grep -E "Engine-bundle drift check|check-bundled-description-hashes:|check-open-time-writes:" "$LOGDIR/gates.log" | cut -c1-200 || { fail "the gates printed no verdicts"; }
    tail -1 "$LOGDIR/bump.log"
  fi
  tests=$(grep -E '^ℹ tests ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  pass=$(grep -E '^ℹ pass ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  failn=$(grep -E '^ℹ fail ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  skipped=$(grep -E '^ℹ skipped ' "$LOGDIR/test-$ed.log" | tail -1 | awk '{print $3}')
  if [ -z "$tests" ] || [ -z "$failn" ] || [ -z "$skipped" ]; then
    red "---- tail of $LOGDIR/test-$ed.log"; tail -25 "$LOGDIR/test-$ed.log" >&2
    fail "$ed: the test run printed no summary (it did less than asked)"; SUMMARY+=("$ed: NO SUMMARY"); continue
  fi
  lean_note=""
  if [ "$ed" = lean ] && [ -s "$LOGDIR/lean-report.txt" ]; then
    lean_note=" ($(sed -n 1p "$LOGDIR/lean-report.txt" | sed -E 's/^lean leg: ([0-9]+ of [0-9]+ test files).*/\1/'); --full-lean runs them all)"
    echo "  $(sed -n 1p "$LOGDIR/lean-report.txt")"
    echo "  the lean leg ran these files:"; sed -n 2p "$LOGDIR/lean-report.txt" | sed 's/^lean leg runs: //' | fold -s -w 150 | sed 's/^/    /'
  fi
  SUMMARY+=("$ed: tests $tests, pass $pass, fail $failn, skipped $skipped$lean_note")
  echo "  tests $tests / pass $pass / fail $failn / skipped $skipped"
  if [ "$failn" != "0" ]; then fail "$ed: $failn test(s) failed"; { grep -E '^✖' "$LOGDIR/test-$ed.log" || true; } | sort -u | head -15 >&2; fi
  if [ "$skipped" != "0" ]; then
    fail "$ed: $skipped test(s) SKIPPED (a skipped test is not a passing test)"; { grep -E '^﹣' "$LOGDIR/test-$ed.log" || true; } | cut -c1-200 | head -10 >&2
  fi
done

# ---- 3b. forge pytest verdict (drain 2026-10-25-1030) -------------------------------------------------------------------------------------------------------------
if [ "$run_forge_leg" = "1" ]; then
  if [ -n "$forge_wrong_tree" ]; then
    fail "forge: the venv imports forge from '$forge_wrong_tree', not from the committed worktree '$forge_wt': the leg would test the wrong tree"; SUMMARY+=("forge: pytest NOT RUN (wrong tree)")
  else
    pyrc="$(cat "$LOGDIR/forge-pytest.rc" 2>/dev/null || echo 1)"
    pysum="$(grep -E ' in [0-9.]+s' "$LOGDIR/forge-pytest.log" | tail -1 || true)"
    count() { printf '%s' "$pysum" | grep -oE "[0-9]+ $1" | head -1 | awk '{print $1}' || true; }
    py_pass="$(count passed)"; py_fail="$(count failed)"; py_err="$(count 'errors?')"; py_skip="$(count skipped)"
    py_pass="${py_pass:-0}"; py_fail="${py_fail:-0}"; py_err="${py_err:-0}"; py_skip="${py_skip:-0}"
    if [ -z "$pysum" ]; then
      red "---- tail of $LOGDIR/forge-pytest.log"; tail -25 "$LOGDIR/forge-pytest.log" >&2
      fail "forge: pytest printed no summary line (exit $pyrc): it did less than asked"; SUMMARY+=("forge: pytest NO SUMMARY")
    else
      SUMMARY+=("forge: pytest tests/music: passed $py_pass, failed $py_fail, errors $py_err, skipped $py_skip (ceiling $FORGE_PYTEST_SKIP_MAX)")
      echo "  pytest tests/music: passed $py_pass / failed $py_fail / errors $py_err / skipped $py_skip"
      if [ "$py_fail" != "0" ] || [ "$py_err" != "0" ]; then
        fail "forge: $py_fail test(s) failed, $py_err error(s)"; grep -E '^(FAILED|ERROR) ' "$LOGDIR/forge-pytest.log" | cut -c1-200 | head -15 >&2
      fi
      if [ "$pyrc" != "0" ] && [ "$py_fail" = "0" ] && [ "$py_err" = "0" ]; then fail "forge: pytest exited $pyrc without a failure to name (see $LOGDIR/forge-pytest.log)"; fi
      if [ "$py_pass" = "0" ]; then fail "forge: pytest passed no test at all (it did less than asked)"; fi
      if [ "$py_skip" -gt "$FORGE_PYTEST_SKIP_MAX" ]; then
        fail "forge: $py_skip test(s) SKIPPED, more than the ceiling of $FORGE_PYTEST_SKIP_MAX (a skipped test is not a passing test)"; grep -E '^SKIPPED' "$LOGDIR/forge-pytest.log" | cut -c1-200 | head -10 >&2
      fi
    fi
  fi
else
  echo; echo "== forge pytest: not run ($forge_why)"
  SUMMARY+=("forge: pytest not run ($forge_why)")
fi

# ---- 4. verdict ---------------------------------------------------------------------------------------------------------------------------------------------------------
echo; echo "==== drain-matrix summary ($(( $(date +%s) - T0 ))s) ===="
for l in "${SUMMARY[@]}"; do echo "  $l"; done
echo "  logs: $LOGDIR"
if [ "$FAILED" = "0" ]; then
  if [ "$FORGE_ONLY" = "1" ]; then
    if [ "$run_forge_leg" = "1" ]; then green "FORGE LEG GREEN (--forge-only: the client legs were not run)"; else echo "FORGE LEG NOT RUN ($forge_why; --forge-only: the client legs were not run either): nothing was tested"; fi
  elif [ "$QUIET_ONLY" = "1" ]; then
    if [ "$NEEDQUIET" != "0" ]; then yellow "STILL NEEDS A QUIET MACHINE: $NEEDQUIET hygiene test(s) failed while the machine was thrashing (--quiet-only: the legs were not run): close what you can and run it again"
    else green "HYGIENE GREEN (--quiet-only: the legs were not run)"; fi
  elif [ "$NEEDQUIET" != "0" ]; then yellow "MATRIX NEEDS A QUIET MACHINE: the legs are green; $NEEDQUIET hygiene test(s) must be run on a quiet machine: bash scripts/drain-matrix.sh --quiet-only   (exit 3: not green, not red)"
  else green "MATRIX GREEN: both editions, 0 failed, 0 skipped$([ "$run_forge_leg" = "1" ] && echo ", forge pytest green")"; fi
else red "MATRIX RED"; fi
if [ "${KEEP:-0}" != "1" ]; then
  mkdir -p "${LOGKEEP:-/tmp}/drain-matrix-logs" && cp -R "$LOGDIR"/. "${LOGKEEP:-/tmp}/drain-matrix-logs/" 2>/dev/null && echo "  logs copied to ${LOGKEEP:-/tmp}/drain-matrix-logs"
fi
cleanup
reap_leftovers
reap_fixtures
[ "$FAILED" = "0" ] && [ "$NEEDQUIET" != "0" ] && exit 3                     # 2026-11-19-0945: green legs, hygiene that needs a quiet machine: neither 0 nor 1
exit "$FAILED"
