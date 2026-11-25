#!/usr/bin/env bash
# heavy-guard.sh - run ONE heavy command (a build, a test run, the drain matrix, a real-Chrome measure, a mutation pass) so that it cannot freeze the Mac.   2026-11-20-1001z
#
#   bash scripts/heavy-guard.sh [--what <label>] [--rss-mb <n>] [--wait-minutes <n>] [--] <command...>
#   bash scripts/heavy-guard.sh npm test                       a helper session's build or test: run it like this, never bare
#   bash scripts/heavy-guard.sh --what matrix --rss-mb 12288 -- bash scripts/drain-matrix.sh
#   bash scripts/heavy-guard.sh --wait-minutes 20 --what measure -- node scripts/dev/measure-x.mjs   wait up to 20 minutes for memory instead of refusing at once
#   node scripts/heavy-guard.mjs --limits                      the limits in force
#
# WHAT IT DOES
#   1. takes the heavy lock ($TMPDIR/forge-heavy.lock, scripts/dev/heavy-lock.mjs: the SAME lock the matrix, the mutation runner and the real-Chrome helper use; a command started by a lock holder, FORGE_HEAVY_LOCK_HELD, does not wait for
#      it) - one heavy thing at a time on this Mac;
#   2. REFUSES to start (exit 75, "memory pressure high, wait", nothing was started) when ANY of these holds: the memory compressor holds more than 8192 MB, more than 2048 MB of swap is used, or `memory_pressure` says the free
#      percentage is under 35. The refusal also lists what else is big ("also running: Google Chrome (59 processes, 5969 MB), wrangler/workerd [dev server] ..." every program or family over 500 MB): a REPORT, never a reason to refuse on
#      its own. The free percentage is only one signal: on 2026-11-20 it said 42 % at the moment the compressor held 10.7 GB and the Mac froze, so the compressor and the swap are the gate;
#   3. while the command runs, looks every 500 ms and kills the command's WHOLE process tree (its group and every descendant, frozen first so nothing forks on the way out) when the tree's total RSS passes 6144 MB, or the compressor
#      passes 10240 MB, or used swap passes 4096 MB; it prints which process was the biggest. That run exits 76 and says "stopped by the memory guard": it is NOT a test failure.
#
# WAITING (2026-11-24-1037)   `--wait-minutes N` (or FORGE_HEAVY_WAIT_MIN=N; the flag wins) turns the refusal of step 2 into a wait: every 30 s (FORGE_HEAVY_WAIT_POLL_MS, for tests) the machine is read again, one line per wait is printed,
#      `waiting for memory: compressor 8.4 GB, limit 8 GB, 3 of 20 minutes`, and the command starts the moment every figure is under its limit. When N minutes pass it refuses exactly as before (exit 75, the same message). Default 0: refuse
#      at once, as every caller always did. Waiting never lowers or raises a limit; the heavy lock is held while it waits (one heavy thing at a time). drain-matrix.sh passes 20 (FORGE_MATRIX_WAIT_MIN), the real-Chrome helper too (FORGE_MEASURE_WAIT_MIN).
#
# THE NUMBERS (defaults; the variable beside each one changes it; they live in scripts/heavy-mem-core.mjs DEFAULT_LIMITS, and scripts/heavy-guard.test.mjs fails if this header and that table disagree)
#   tree cap                 6144 MB   FORGE_HEAVY_RSS_MB              (--rss-mb is a caller's default for ITS tree: the matrix 12288 via FORGE_MATRIX_RSS_MB, a mutation pass its memory budget; FORGE_HEAVY_RSS_MB, when set, wins)
#   refuse: compressed       8192 MB   FORGE_HEAVY_COMPRESSED_MB
#   refuse: swap used        2048 MB   FORGE_HEAVY_SWAP_MB
#   refuse: free percentage  35 %      FORGE_HEAVY_FREE_PCT            (memory_pressure; one extra signal)
#   stop: compressed         10240 MB  FORGE_HEAVY_KILL_COMPRESSED_MB  (the driver's freeze was at 10.7 to 11.2 GB; a stop limit above that would never have fired)
#   stop: swap used          4096 MB   FORGE_HEAVY_KILL_SWAP_MB
#   look every               500 ms    FORGE_HEAVY_POLL_MS             (system numbers every 2000 ms: FORGE_HEAVY_SYS_MS)
#   named in "also running"  500 MB    FORGE_HEAVY_ALSO_MB
# A stop limit is never lower than the matching refuse limit. An unknown figure (no vm_stat: not a Mac) never refuses and never stops.
#
# EXIT CODES   the command's own code; 75 = refused (nothing started); 76 = stopped by the memory guard; 2 = usage; 127 = the command could not be started.  (A command that itself exits 75 or 76 looks the same: read the message.)
# SWITCHES     FORGE_HEAVY_GUARD=off        no refusal, no stop (the lock is still taken: FORGE_HEAVY_LOCK=off for that); =on forces it; the default (auto) is on EXCEPT inside a test run (NODE_TEST_CONTEXT), so a test that
#                                           starts the matrix or the mutation tool on a scratch project never depends on the machine it runs on
#              FORGE_HEAVY_FAKE_MEM / FORGE_HEAVY_FAKE_PS   stand-ins for the machine (scripts/heavy-mem-read.mjs), for tests
# A killed run is stopped with SIGKILL: a matrix leaves its worktrees registered (its next start says how many; `bash scripts/drain-matrix.sh --cleanup-worktrees`), a mutation pass its scratch directory (its reaper sidecar removes it).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

WHAT=""; RSS=""; WAIT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --what) [ $# -ge 2 ] || { echo "heavy-guard: --what needs a label" >&2; exit 2; }; WHAT="$2"; shift 2 ;;
    --rss-mb) [ $# -ge 2 ] || { echo "heavy-guard: --rss-mb needs a number" >&2; exit 2; }; RSS="$2"; shift 2 ;;
    --wait-minutes)   # 2026-11-24-1037: wait up to N minutes for memory instead of refusing at once (the flag wins over FORGE_HEAVY_WAIT_MIN)
      [ $# -ge 2 ] || { echo "heavy-guard: --wait-minutes needs a number" >&2; exit 2; }
      case "$2" in ''|*[!0-9.]*|.|*.*.*) echo "heavy-guard: --wait-minutes needs a number (0 or more), got '$2'" >&2; exit 2 ;; esac
      WAIT="$2"; shift 2 ;;
    --) shift; break ;;
    -*) echo "heavy-guard: unknown option $1 (usage: heavy-guard.sh [--what label] [--rss-mb n] [--wait-minutes n] [--] <command...>)" >&2; exit 2 ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "usage: heavy-guard.sh [--what label] [--rss-mb n] [--wait-minutes n] [--] <command...>" >&2; exit 2; }
if [ -z "$WHAT" ]; then   # a name for the lock and the messages: the first word that is not an interpreter or a flag (`bash scripts/drain-matrix.sh` is drain-matrix.sh, `npm test` is npm)
  for w in "$@"; do case "$w" in -*|node|bash|sh|env|npx) ;; *) WHAT="$(basename "$w")"; break ;; esac; done
  [ -n "$WHAT" ] || WHAT="$(basename "$1")"
fi

# the guard is skipped when it is off, and inside a test run unless FORGE_HEAVY_GUARD=on (see SWITCHES): then the command is run exactly as heavy-lock.mjs always ran it
guard_on=1
case "${FORGE_HEAVY_GUARD:-auto}" in
  off|OFF|Off) guard_on=0 ;;
  on|ON|On) guard_on=1 ;;
  *) [ -z "${NODE_TEST_CONTEXT:-}" ] || guard_on=0 ;;
esac
if [ "$guard_on" = "1" ]; then
  OPTS=(--what "$WHAT"); [ -z "$RSS" ] || OPTS+=(--rss-mb "$RSS"); [ -z "$WAIT" ] || OPTS+=(--wait-minutes "$WAIT")
  CMD=(node "$DIR/heavy-guard.mjs" "${OPTS[@]}" -- "$@")
else
  CMD=("$@")
fi

# the lock: not when this run was started by a lock holder (it would wait for its own parent) and not when the lock is off
if [ -n "${FORGE_HEAVY_LOCK_HELD:-}" ] || [ "${FORGE_HEAVY_LOCK:-}" = "off" ]; then
  exec "${CMD[@]}"
fi
exec node "$DIR/dev/heavy-lock.mjs" run --what "$WHAT" -- "${CMD[@]}"
