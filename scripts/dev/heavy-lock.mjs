#!/usr/bin/env node
// 2026-10-31-1125 - ONE HEAVY THING AT A TIME on the driver's machine. The drain matrix, the mutation runner and the real-Chrome measures each take $TMPDIR/forge-heavy.lock before they start, so two heavy runs never overlap:
// the second one waits and says who holds the lock (pid, what, since when). The lock is STALE-AWARE: a lock whose holder (and the child the holder started) is gone, or whose pid now belongs to a DIFFERENT process (pid reuse:
// the start time recorded at acquire no longer matches), is taken over with a line saying so - so a `kill -9` of the holder never leaves the machine locked, and `reap.sh` can clear one by hand.
//
//   node scripts/dev/heavy-lock.mjs run [--what <label>] -- <command...>   take the lock, run the command with FORGE_HEAVY_LOCK_HELD=<our pid> in its environment (a heavy tool started BY a lock holder does not wait for itself), release
//   node scripts/dev/heavy-lock.mjs status                                  who holds it (exit 0 = free, 1 = held)
//   node scripts/dev/heavy-lock.mjs clear-stale                             remove the lock when it is stale; never touches a live one
// Overrides: FORGE_HEAVY_LOCK=<path> (default $TMPDIR/forge-heavy.lock), FORGE_HEAVY_LOCK_WAIT_MS (default 3 h; 0 = do not wait, fail at once), FORGE_HEAVY_LOCK=off disables the lock (a person who knows).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const lockPath = (env = process.env) => (env.FORGE_HEAVY_LOCK && env.FORGE_HEAVY_LOCK !== 'off' ? env.FORGE_HEAVY_LOCK : path.join(env.TMPDIR || os.tmpdir(), 'forge-heavy.lock'));
export const lockDisabled = (env = process.env) => env.FORGE_HEAVY_LOCK === 'off';

/** The start time of a pid as `ps` prints it ('' when the pid is gone). Recorded at acquire, compared later: a reused pid has another start time. */
export function startOf(pid) {
  const r = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}
export function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

/**
 * What the file in the lock path means. holder = parsed JSON or null (missing / unreadable / not ours). Returns
 *   { state: 'free' } | { state: 'stale', why } | { state: 'held', holder }
 * A lock is live while its holder pid OR the child pid the holder started is alive AND still the same process (start time unchanged).
 */
export function decide(holder, { alive = isAlive, started = startOf } = {}) {
  if (!holder || typeof holder.pid !== 'number') return { state: 'free' };
  const live = (pid, lstart) => alive(pid) && (!lstart || started(pid) === lstart);
  if (live(holder.pid, holder.lstart)) return { state: 'held', holder };
  if (typeof holder.childPid === 'number' && live(holder.childPid, holder.childLstart)) return { state: 'held', holder };
  return { state: 'stale', why: `pid ${holder.pid}${holder.childPid ? ` and its child ${holder.childPid}` : ''} gone`, holder };
}
export const describeHolder = (h, now = Date.now()) => `${h.what ?? 'a heavy run'} (pid ${h.pid}${h.childPid ? `, child ${h.childPid}` : ''}, running ${Math.max(0, Math.round((now - (h.since ?? now)) / 1000))} s)`;

const readHolder = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Take the lock. Resolves to a handle { release(), setChild(pid), nested } once it is ours; a heavy tool started by the holder (FORGE_HEAVY_LOCK_HELD = the holder's pid, which is alive and IS the holder)
 * gets a no-op handle. Waits (polling) while someone else holds it, saying who once per change of holder. Rejects after maxWaitMs.
 */
export async function acquire({ what = 'a heavy run', env = process.env, say = (s) => console.error(s), sleep = sleepDefault, now = Date.now, pollMs = 2000, maxWaitMs = Number(env.FORGE_HEAVY_LOCK_WAIT_MS ?? 3 * 3600_000), alive = isAlive, started = startOf } = {}) {
  if (lockDisabled(env)) return { release() {}, setChild() {}, nested: true, disabled: true };
  const p = lockPath(env);
  const t0 = now();
  let saidFor = null;
  for (;;) {
    const holder = readHolder(p);
    const d = decide(holder, { alive, started });
    if (d.state === 'held' && env.FORGE_HEAVY_LOCK_HELD && Number(env.FORGE_HEAVY_LOCK_HELD) === d.holder.pid) return { release() {}, setChild() {}, nested: true };
    if (d.state === 'stale') {
      say(`heavy-lock: taking over a STALE lock (${d.why}; it was held by ${describeHolder(d.holder, now())})`);
      try { if (JSON.stringify(readHolder(p)) === JSON.stringify(d.holder)) fs.unlinkSync(p); } catch { /* someone else cleared it */ }
    }
    if (d.state === 'free' || d.state === 'stale') {
      const me = { pid: process.pid, lstart: started(process.pid), what, since: now() };
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const fd = fs.openSync(p, 'wx'); fs.writeSync(fd, JSON.stringify(me)); fs.closeSync(fd);
        const write = (obj) => { const tmp = `${p}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, p); };
        return {
          nested: false,
          setChild(pid) { me.childPid = pid; me.childLstart = started(pid); write(me); },
          release() { const cur = readHolder(p); if (cur && cur.pid === process.pid) { try { fs.unlinkSync(p); } catch { /* gone */ } } },
        };
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;   // lost the race to another taker: look again
        continue;
      }
    }
    const key = `${d.holder.pid}`;
    if (saidFor !== key) { say(`heavy-lock: waiting - ${describeHolder(d.holder, now())} holds ${p}; "${what}" starts when it is done`); saidFor = key; }
    if (now() - t0 >= maxWaitMs) throw new Error(`heavy-lock: gave up after ${Math.round((now() - t0) / 1000)} s waiting for ${describeHolder(d.holder, now())} (FORGE_HEAVY_LOCK_WAIT_MS raises the limit; \`bash scripts/dev/reap.sh\` clears a stale lock)`);
    await sleep(pollMs);
  }
}

/** For a tool that wants the lock around its own work: `const lock = await acquire(...)` ... `lock.release()` - release is also wired to process exit and the usual signals. */
export async function acquireForProcess(opts) {
  const lock = await acquire(opts);
  if (!lock.nested) {
    process.on('exit', () => lock.release());
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { lock.release(); process.exit(130); });
  }
  return lock;
}

export function status(env = process.env) {
  const p = lockPath(env), holder = readHolder(p), d = decide(holder);
  return { path: p, ...d };
}
export function clearStale(env = process.env) {
  const s = status(env);
  if (s.state === 'stale') { try { fs.unlinkSync(s.path); } catch { /* gone */ } return { cleared: true, ...s }; }
  return { cleared: false, ...s };
}

// ---- CLI ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'status') {
    const s = status();
    console.log(s.state === 'held' ? `held by ${describeHolder(s.holder)}  (${s.path})` : s.state === 'stale' ? `STALE (${s.why})  (${s.path})` : `free  (${s.path})`);
    process.exit(s.state === 'held' ? 1 : 0);
  }
  if (cmd === 'clear-stale') {
    const r = clearStale();
    console.log(r.cleared ? `heavy-lock: cleared a stale lock (${r.why})` : r.state === 'held' ? `heavy-lock: NOT cleared - held by ${describeHolder(r.holder)}` : 'heavy-lock: no lock');
    process.exit(0);
  }
  if (cmd === 'run') {
    const dash = rest.indexOf('--');
    const opts = dash >= 0 ? rest.slice(0, dash) : [], command = dash >= 0 ? rest.slice(dash + 1) : [];
    const wi = opts.indexOf('--what');
    if (command.length === 0) { console.error('usage: heavy-lock.mjs run [--what label] -- <command...>'); process.exit(2); }
    const lock = await acquire({ what: wi >= 0 ? opts[wi + 1] : path.basename(command.find((c) => !c.startsWith('-') && c !== 'node' && c !== 'bash') ?? command[0]) });
    process.on('exit', () => lock.release());
    // a signal is handed to the run we started, and we leave when IT has left (its own cleanup, e.g. the matrix removing its worktrees, finishes first); the lock goes with us
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: { ...process.env, FORGE_HEAVY_LOCK_HELD: String(process.pid) } });
    lock.setChild(child.pid);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { child.kill(sig); } catch { /* gone */ } });
    child.on('exit', (code, signal) => { lock.release(); process.exit(code ?? (signal ? 1 : 0)); });
    child.on('error', (e) => { console.error(`heavy-lock: could not start ${command[0]}: ${e.message}`); lock.release(); process.exit(127); });
    return;
  }
  console.error('usage: heavy-lock.mjs run [--what label] -- <command...> | status | clear-stale');
  process.exit(2);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
