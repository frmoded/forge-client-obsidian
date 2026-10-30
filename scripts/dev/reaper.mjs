// 2026-10-27-0715 (memory/orphans): a REAPER SIDECAR for the tools that start children (mutate.mjs, cdp.mjs). Measured on 2026-10-27: a mutation runner that is killed with -9, or whose terminal closes (SIGHUP), leaves its `node --test`
// group running with ppid 1; a mutant that hangs then spins at 100% CPU for ever (node --test runs a file with --test-timeout=0), and a cdp.mjs killed the same way leaves a whole headless Chrome (11 processes) and its profile. A signal
// handler cannot help against SIGKILL, so the parent starts this tiny process in its OWN session, with a pipe on its stdin: when the parent dies for ANY reason the OS closes the pipe, the sidecar reads the end of the stream and kills every
// process group the parent registered (and removes every path it registered), then exits. Being in its own session it has no terminal, so a closed terminal or a Ctrl-C reaches the parent and never the sidecar; and it never kills a pid it was not told about.
//
//   import { startReaper } from './reaper.mjs';
//   const reaper = startReaper();          // FORGE_REAPER=off disables it (the tests use that for their control run)
//   reaper.add(child.pid);                 // a process group the child leads (spawn it with detached: true)
//   reaper.remove(child.pid);              // it ended by itself
//   reaper.addPath(dir);                   // a directory to remove when the parent is gone
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { killTree } from './proc-tree.mjs';

const NOOP = { add() {}, remove() {}, addPath() {}, removePath() {}, stop() {} };

export function startReaper(opts = {}) {
  if ((opts.enabled ?? process.env.FORGE_REAPER !== 'off') === false) return NOOP;
  const sidecar = spawn(process.execPath, [fileURLToPath(import.meta.url), '--sidecar'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] });
  sidecar.unref();
  sidecar.stdin.unref?.();
  sidecar.stdin.on('error', () => { /* the sidecar is gone: nothing left to tell it */ });
  const send = (line) => { try { sidecar.stdin.write(`${line}\n`); } catch { /* as above */ } };
  return {
    add: (pid) => send(`g ${pid}`),                                   // the sidecar refuses anything that is not a whole pid above 1
    remove: (pid) => send(`u ${pid}`),
    addPath: (p) => send(`d ${encodeURIComponent(p)}`),
    removePath: (p) => send(`x ${encodeURIComponent(p)}`),
    /** The parent is ending on purpose: the sidecar reaps what is still registered and goes. */
    stop: () => { try { sidecar.stdin.end(); } catch { /* gone */ } },
  };
}

/** The sidecar's whole job, pure enough to read: apply the lines, and at the end of the stream kill the groups and remove the paths still registered. */
export function reapState() {
  const groups = new Set(), paths = new Set();
  return {
    line(text) {
      const [op, arg] = [text[0], text.slice(2)];
      const pid = /^\d+$/.test(arg) ? Number(arg) : NaN;                  // digits only: Number('1e3') is 1000 and Number('0x10') is 16
      if (op === 'g') { if (Number.isSafeInteger(pid) && pid > 1) groups.add(pid); }
      else if (op === 'u') groups.delete(pid);
      else if (op === 'd') paths.add(decodeURIComponent(arg));
      else if (op === 'x') paths.delete(decodeURIComponent(arg));
    },
    /** What is registered right now (for the tests: a bad pid must never get as far as reap(), which would kill it). */
    snapshot: () => ({ groups: [...groups].sort((a, b) => a - b), paths: [...paths].sort() }),
    reap() {
      for (const pid of groups) killTree(pid);                            // 2026-10-30-1010: the group it leads AND everything under it, detached children of its test files included (proc-tree.mjs)
      for (const p of paths) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* the temp dir is cleaned by the system anyway */ } }
      groups.clear(); paths.clear();
    },
  };
}

if (process.argv[2] === '--sidecar' && process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = reapState();
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { state.line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
  const end = () => { state.reap(); process.exit(0); };
  process.stdin.on('end', end); process.stdin.on('close', end);
}
