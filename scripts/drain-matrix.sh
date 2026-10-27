#!/usr/bin/env bash
# drain-matrix.sh — the drain's whole verification matrix in one command, on CLEAN worktrees, failing loudly.
#
# Usage:   bash scripts/drain-matrix.sh            # tests the COMMITTED HEAD of every repo (commit first!)
#          bash scripts/drain-matrix.sh <client-ref>   # a different client commit-ish; siblings stay at HEAD
#          KEEP=1 bash scripts/drain-matrix.sh         # leave the worktrees in place for inspection
#          --forge | --no-forge | --auto (default)     # the forge-pytest leg: always / never / only when the drain touched forge Python (see below)
#          --forge-only                                # run ONLY the forge-pytest leg (no client sync, build or tests): the quick check for an engine-only drain
#          --serial                                    # run the legs one after the other (the pre-2026-10-26 behaviour; for a machine that cannot take three at once)
#
# What it does: worktrees (detached, committed state only) of forge-client-obsidian, music-theory, forge-tutorial, forge-moda, music-core, forge and music-playground
# next to each other; links node_modules, forge/.venv and the music wheels into them; then THREE LEGS AT THE SAME TIME (drain 2026-10-26-1300; the machine has the cores):
#   the MUSIC leg, in the client worktree:  sync-bundled-vault --all + sync-engine-bundle  ->  bundle-lag (FAILS when that sync changed the committed assets/vaults: the bundle lags the source vaults, 2026-10-27-0930)  ->  the pinned-engine-fixtures check (fails naming `npm run rerecord-engine-fixtures`)
#                                           ->  the existing prebuild gates (engine drift, description hashes, open-time writes)  ->  the bundled-vault bump check  ->  build + `npm test` for the MUSIC edition;
#   the LEAN leg, in a SECOND client worktree (lean/forge-client-obsidian, its siblings symlinked to the first set): the same sync, then build + `npm test` for the LEAN edition
#                                           (the explicit gates run and the bump check are edition-independent and run once, in the music leg, as they did when the legs were serial; `npm run build` also runs the package's prebuild hook, the same gates, in every build);
#   the FORGE leg: `pytest tests/music` (below), whenever its rule says it runs.
# Why two client worktrees: a build writes main.js and the generated sources into its tree, so two editions cannot share one. Why the tests are not split: the two editions run the SAME
# test files (3820 each on 2026-10-26) and several read build output, so the split is not clean; both editions run in full, concurrently.
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
# Output: one summary table at the end; full logs under $LOGDIR (default: <worktrees>/logs).
set -euo pipefail

PROJECTS="${PROJECTS:-$HOME/projects}"
REPOS=(forge-client-obsidian music-theory forge-tutorial forge-moda music-core forge music-playground)
FORGE_MODE=auto; FORGE_ONLY=0; CLIENT_REF=HEAD; SERIAL=0
for arg in "$@"; do
  case "$arg" in
    --forge) FORGE_MODE=on ;;
    --no-forge) FORGE_MODE=off ;;
    --forge-only) FORGE_ONLY=1; [ "$FORGE_MODE" = auto ] && FORGE_MODE=on ;;      # the quick check runs the leg; follow it with --auto to let the change decide (the test uses that)
    --auto) FORGE_MODE=auto ;;
    --serial) SERIAL=1 ;;
    --*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) CLIENT_REF="$arg" ;;
  esac
done
FORGE_PYTEST_SKIP_MAX="${FORGE_PYTEST_SKIP_MAX:-7}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/drain-matrix.XXXXXX")"
LOGDIR="${LOGDIR:-$WORK/logs}"
mkdir -p "$LOGDIR"
LEAN="$WORK/lean"
T0=$(date +%s)
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
FAILED=0
fail()  { red "FAIL: $*"; FAILED=1; }
die()   { red "FAIL: $*"; cleanup; exit 1; }
cleanup() {
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
REAP="$(cd "$(dirname "$0")" && pwd)/dev/reap.sh"
# The broom is OPT-IN here (FORGE_REAP=1): it sweeps shared temp space by name, which nothing should do unasked. Run it by hand: bash scripts/dev/reap.sh --dry-run
reap_leftovers() { [ "${FORGE_REAP:-0}" = "1" ] && [ -f "$REAP" ] && bash "$REAP" --quiet 2>/dev/null || true; }
reap_leftovers                                   # what an EARLIER killed run left (orphaned test groups, stale worktrees): quiet, orphans only
step() { echo; echo "== $* ($(( $(date +%s) - T0 ))s)"; }

# ---- 0. preconditions: loud, before anything is built --------------------------------------------------------------------------------------------------------------
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
    leg_step bundle-lag bash -c 'lag=$(git status --porcelain --untracked-files=all -- assets/vaults); if [ -n "$lag" ]; then echo "the COMMITTED bundle (assets/vaults) lags the source vaults; the sync changed:"; echo "$lag" | head -25; echo "fix: npm run sync-bundled-vaults in the client, then commit assets/vaults (the same drain that bumped the forge.toml)"; exit 1; fi' || return 0
    # 2026-10-27-0710: the two pinned engine fixtures (shipped-notes.json, rederive-comparison.json) must match the engine the sync just bundled; a stale one fails HERE naming `npm run rerecord-engine-fixtures`, not as a generic gate failure two steps later.
    leg_step fixtures bash -c 'node scripts/check-engine-fixtures.mjs' || return 0
    leg_step gates bash -c 'FORGE_EDITION=music npm run prebuild' || return 0
    leg_step bump bash -c 'FORGE_EDITION=music node scripts/check-bundled-vault-bump.mjs' || return 0
  fi
  leg_step "build-$ed" bash -c "FORGE_EDITION=$ed npm run build" || return 0
  npm test >"$LOGDIR/test-$ed.log" 2>&1 || true        # a failing suite is judged from its summary below, with the failing names printed
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

pids=()
if [ "$FORGE_ONLY" = "0" ]; then
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

# ---- 3. what the legs said ----------------------------------------------------------------------------------------------------------------------------------------
for ed in music lean; do
  [ "$FORGE_ONLY" = "1" ] && break
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
  SUMMARY+=("$ed: tests $tests, pass $pass, fail $failn, skipped $skipped")
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
  else green "MATRIX GREEN: both editions, 0 failed, 0 skipped$([ "$run_forge_leg" = "1" ] && echo ", forge pytest green")"; fi
else red "MATRIX RED"; fi
if [ "${KEEP:-0}" != "1" ]; then
  mkdir -p "${LOGKEEP:-/tmp}/drain-matrix-logs" && cp -R "$LOGDIR"/. "${LOGKEEP:-/tmp}/drain-matrix-logs/" 2>/dev/null && echo "  logs copied to ${LOGKEEP:-/tmp}/drain-matrix-logs"
fi
cleanup
reap_leftovers
exit "$FAILED"
