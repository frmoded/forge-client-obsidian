// 2026-10-30-1010 - kill a process AND everything it started, wherever that is. `process.kill(-pid)` ends the process GROUP a child leads; a test file that starts a child of its own in another group (`detached: true`: a nested mutation runner, a
// headless Chrome, a matrix) is out of its reach and keeps running after the runner, or the sidecar, has done its job (measured 2026-10-30 in scripts/mutate-runner-orphans.test.mjs: the grandchild survives SIGTERM, `pkill -f`, SIGKILL and the
// runner's own --timeout). This reads the process table once, takes every descendant of the pid, STOPS the lot (so nothing can start another child while it is being ended), then kills the groups and the processes. It only ever touches what is
// under the pid it is given - never the caller, its group or its parent - and `FORGE_TREE_KILL=off` turns the walk off (the control run of the tests that measure it). Synchronous: it runs inside a signal handler and an `exit` handler.
import { execFileSync } from 'node:child_process';

/** `ps -Ao pid=,ppid=,pgid=` -> [{ pid, ppid, pgid }]. Lines that are not three whole numbers are dropped. */
export function parsePs(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]) });
  }
  return rows;
}

/** Every process under `root` (children, their children, ...), never `root` itself. Breadth first, each pid once; a cycle in a damaged table cannot loop, and pid 1 is never walked through (every orphan is its child: a table that put it under `root` would otherwise put the whole machine there). */
export function descendantsOf(rows, root) {
  const children = new Map();
  for (const r of rows) (children.get(r.ppid) ?? children.set(r.ppid, []).get(r.ppid)).push(r);
  const out = [], seen = new Set([root]);
  for (const queue = [root]; queue.length > 0;) {
    for (const c of children.get(queue.shift()) ?? []) if (c.pid > 1 && !seen.has(c.pid)) { seen.add(c.pid); out.push(c); queue.push(c.pid); }
  }
  return out;
}

const table = () => parsePs(execFileSync('ps', ['-Ao', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024 }));
const send = (target, sig) => { try { process.kill(target, sig); } catch { /* already gone, or not ours to signal */ } };

/**
 * End `pid`, the group it leads and everything under it. `rows` is for the tests (a process table to read instead of `ps`). Returns the pids it signalled below `pid` (for the evidence).
 * Never signals this process, its group, or a pid or group at or below 1.
 */
export function killTree(pid, { enabled = process.env.FORGE_TREE_KILL !== 'off', rows } = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return [];
  let victims = [];
  if (enabled) {
    try {
      const all = rows ?? table();
      const mine = all.find((r) => r.pid === process.pid);
      victims = descendantsOf(all, pid).filter((v) => v.pid !== process.pid && v.pid > 1 && (mine === undefined || v.pgid !== mine.pgid));
    } catch { /* no process table to read: the group kill below is what it always was */ }
  }
  const groups = [...new Set([pid, ...victims.map((v) => v.pgid)])].filter((g) => g > 1);
  for (const g of groups) send(-g, 'SIGSTOP');                        // freeze first: a process that is being ended starts no new child
  for (const v of victims) send(v.pid, 'SIGSTOP');
  for (const g of groups) send(-g, 'SIGKILL');
  for (const v of victims) send(v.pid, 'SIGKILL');
  send(pid, 'SIGKILL');
  return victims.map((v) => v.pid);
}
