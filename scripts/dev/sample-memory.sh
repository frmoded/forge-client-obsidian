#!/usr/bin/env bash
# 2026-11-24-1035 - sample the Mac's memory while a drain runs: one tab-separated line every INTERVAL seconds, so the peak can be attributed to a phase and a process.
#   scripts/dev/sample-memory.sh <out.tsv> [interval-seconds=10] [samples=0]    (0 = until killed)
# Columns: time, compressor MB (vm_stat compressor pages x 16384), swap used MB, free MB, the memory (RSS MB) held by Google Chrome, Obsidian, Claude (the app and its helpers), node, the number of HEADLESS Chrome processes
# (a measure's own browser: they must be gone after it), the number of registered git worktrees of the client, and the top 5 holders of COMPRESSED memory as name:MB (`top -o cmprs`: command NAMES only; never environments:
# no `ps eww`, no `launchctl print`), then (2026-11-24-1037) how many `com.apple.Virtualization.VirtualMachine` processes there are and each one's RSS in MB as name:MB (NAME only: the driver sees whether there is more than one; FORGE_SAMPLE_PS_FILE, a file in
# `ps -axo rss=,comm=` form, stands in for the process list in the test). Read-only: it changes nothing.
set -u
OUT="${1:?usage: sample-memory.sh <out.tsv> [interval=10] [samples=0]}"; INTERVAL="${2:-10}"; COUNT="${3:-0}"
[ -s "$OUT" ] || printf 'time\tcompressor_mb\tswap_used_mb\tfree_mb\tchrome_rss_mb\tobsidian_rss_mb\tclaude_rss_mb\tnode_rss_mb\theadless_chrome\tworktrees\ttop_compressed\tvirtualization_vms\tvirtualization_rss\n' >> "$OUT"
sample() {
  local comp swap free chrome obs claude node headless wt top5 vz vzn vzrss
  comp=$(vm_stat | awk '/occupied by compressor/{printf "%d", $5*16384/1048576}')
  swap=$(sysctl -n vm.swapusage | awk '{gsub("M","",$6); printf "%d", $6}')
  free=$(vm_stat | awk '/Pages free/{f=$3} /Pages speculative/{s=$3} END{printf "%d", (f+s)*16384/1048576}')
  read -r chrome obs claude node < <(ps -axo rss=,comm= | awk '/Google Chrome/{c+=$1} /Obsidian/{o+=$1} /Claude/{l+=$1} /\/node$|^node$|\/bin\/node/{n+=$1} END{printf "%d %d %d %d\n", c/1024, o/1024, l/1024, n/1024}')
  headless=$(ps -axo command= | grep -c -- '--headless' | tr -d ' ')
  headless=$(( headless > 0 ? headless - 1 : 0 ))   # the grep itself
  wt=$(git -C "$(dirname "$0")/../.." worktree list 2>/dev/null | wc -l | tr -d ' ')
  top5=$(top -l 1 -o cmprs -n 8 -stats pid,command,cmprs 2>/dev/null | awk 'f&&NF>=3&&n<5{c=$NF; $1=""; $NF=""; sub(/^ +/,""); sub(/ +$/,""); printf "%s%s:%s", (n++?";":""), $0, c} /^PID/{f=1}')
  if [ -n "${FORGE_SAMPLE_PS_FILE:-}" ]; then vz=$(cat "$FORGE_SAMPLE_PS_FILE" 2>/dev/null); else vz=$(ps -axo rss=,comm= 2>/dev/null); fi
  vz=$(printf '%s\n' "$vz" | awk '{n=split($0,a,"/"); if (a[n]=="com.apple.Virtualization.VirtualMachine") printf "%scom.apple.Virtualization.VirtualMachine:%d", (c++?";":""), $1/1024}')
  vzn=0; [ -z "$vz" ] || vzn=$(printf '%s' "$vz" | awk -F';' '{print NF}')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "$comp" "$swap" "$free" "$chrome" "$obs" "$claude" "$node" "$headless" "$wt" "$top5" "$vzn" "$vz" >> "$OUT"
}
i=0
while :; do sample; i=$((i+1)); [ "$COUNT" -gt 0 ] && [ "$i" -ge "$COUNT" ] && break; sleep "$INTERVAL"; done
