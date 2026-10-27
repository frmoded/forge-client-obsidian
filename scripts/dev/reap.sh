#!/usr/bin/env bash
# reap.sh — clear what a KILLED run of our own tooling leaves behind (2026-10-27-0715). The runner (mutate.mjs), cdp.mjs and the matrix now clean up after SIGINT / SIGTERM / SIGHUP and, through the reaper sidecar, after SIGKILL;
# this is the by-hand broom for everything that happened before that, and what the matrix and the runner call at their start and end. It is SAFE BY CONSTRUCTION, because it is the one thing here that kills by a name:
#   1. only ORPHANS: a process whose parent is pid 1, owned by you, running for at least REAP_MIN_AGE seconds (default 60), whose command matches REAP_PATTERN (default: a `node ... --test` runner, or a test file it started);
#      a process group it leads is killed whole, otherwise the process and its descendants. A process with a living parent is never touched, however it is named.
#   2. headless Chrome of cdp.mjs: an orphan whose --user-data-dir is $TMPDIR/cdp-*  (same rules: ppid 1, age).
#   3. directories in $TMPDIR, older than REAP_DIR_MIN_AGE seconds (default 600): drain-matrix.* (its git worktrees removed with git first), forge-mutate-* (never forge-mutate-cache) and cdp-*, each only while nothing that
#      would own it is running (a matrix, a runner, a Chrome on that profile).
# usage: bash scripts/dev/reap.sh [--dry-run] [--quiet]      (a dry run says what it would do and does none of it)
set -u
DRY=0; QUIET=0
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; --quiet) QUIET=1 ;; *) echo "reap.sh: unknown option $a" >&2; exit 2 ;; esac; done
T="${TMPDIR:-/tmp}"; T="${T%/}"
PROJECTS="${PROJECTS:-$HOME/projects}"
MIN_AGE="${REAP_MIN_AGE:-60}"; DIR_AGE="${REAP_DIR_MIN_AGE:-600}"
PATTERN="${REAP_PATTERN:-node .*--test}"
ME="$(id -un)"; NOW="$(date +%s)"; DID=0
say() { [ "$QUIET" = "1" ] || echo "reap: $*"; }

# etime ([[dd-]hh:]mm:ss) in seconds
secs() { local e="$1" d=0 h=0 m=0 s=0; [[ "$e" == *-* ]] && { d="${e%%-*}"; e="${e#*-}"; }
  IFS=: read -r a b c <<<"$e"; if [ -n "${c:-}" ]; then h=$a; m=$b; s=$c; else m=$a; s=$b; fi; echo $(( 10#$d * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s )); }
kill_orphan() { # pid pgid label
  local pid="$1" pgid="$2" label="$3"; DID=$((DID + 1))
  if [ "$DRY" = "1" ]; then say "would kill $label (pid $pid, group $pgid)"; return; fi
  say "killing $label (pid $pid)"
  if [ "$pgid" = "$pid" ]; then kill -KILL "-$pgid" 2>/dev/null || true; else
    local c; for c in $(pgrep -P "$pid" 2>/dev/null); do kill -KILL "$c" 2>/dev/null || true; done; kill -KILL "$pid" 2>/dev/null || true; fi
}

# ---- 1 and 2: orphans -----------------------------------------------------------------------------------------------------------------------------------
while read -r pid ppid pgid et user cmd; do
  [ "$ppid" = "1" ] && [ "$user" = "$ME" ] || continue
  [ "$(secs "$et")" -ge "$MIN_AGE" ] || continue
  if [[ "$cmd" =~ $PATTERN ]]; then kill_orphan "$pid" "$pgid" "an orphaned test process: ${cmd:0:80}"
  elif [[ "$cmd" == *--headless* && "$cmd" == *"--user-data-dir=$T/cdp-"* ]]; then kill_orphan "$pid" "$pgid" "an orphaned headless Chrome of cdp.mjs"; fi
done < <(ps -Ao pid=,ppid=,pgid=,etime=,user=,command= 2>/dev/null)

# ---- 3: directories nothing owns any more -----------------------------------------------------------------------------------------------------------------
old() { local m; m="$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo "$NOW")"; [ $(( NOW - m )) -ge "$DIR_AGE" ]; }
running() { [ "${REAP_ASSUME_IDLE:-0}" = "1" ] && return 1; pgrep -f "$1" >/dev/null 2>&1; }       # REAP_ASSUME_IDLE=1 is for the tests, which run inside a matrix
if ! running 'scripts/drain-matrix\.sh'; then
  for d in "$T"/drain-matrix.*; do
    [ -d "$d" ] && old "$d" || continue
    DID=$((DID + 1)); say "$([ "$DRY" = "1" ] && echo 'would remove' || echo 'removing') the work directory of an interrupted matrix: $d"
    [ "$DRY" = "1" ] && continue
    dp="$(cd "$d" && pwd -P)"                                          # git reports physical paths (macOS: /private/var/...), the temp dir may be given through a symlink
    for repo in "$PROJECTS"/*/; do
      [ -e "${repo}.git" ] || continue
      git -C "$repo" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | while read -r w; do
        case "$w" in "$d"/*|"$dp"/*) git -C "$repo" worktree remove --force "$w" >/dev/null 2>&1 || true ;; esac
      done
      git -C "$repo" worktree prune >/dev/null 2>&1 || true
    done
    rm -rf "$d"
  done
fi
if ! running 'scripts/dev/mutate\.mjs'; then
  for d in "$T"/forge-mutate-*; do
    [ -d "$d" ] && [ "${d##*/}" != "forge-mutate-cache" ] && old "$d" || continue
    DID=$((DID + 1)); say "$([ "$DRY" = "1" ] && echo 'would remove' || echo 'removing') a mutation scratch directory: $d"
    [ "$DRY" = "1" ] || rm -rf "$d"
  done
fi
for d in "$T"/cdp-*; do
  [ -d "$d" ] && old "$d" && ! running "user-data-dir=$d" || continue
  DID=$((DID + 1)); say "$([ "$DRY" = "1" ] && echo 'would remove' || echo 'removing') a Chrome profile: $d"
  [ "$DRY" = "1" ] || rm -rf "$d"
done
[ "$DID" = "0" ] && say "nothing to clear"
exit 0
