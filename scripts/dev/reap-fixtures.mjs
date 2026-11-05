#!/usr/bin/env node
// 2026-11-04-1174 (R) - reap the test processes a mutation-runner FIXTURE leaves behind, and nothing else. The runner (mutate.mjs) names the test file of a mutant by its absolute path inside its scratch directory, so the process's command line
// carries `.../forge-mutate-<id>/...`. A process whose command line carries that, that is an ORPHAN (its parent is pid 1: whoever started it is gone) and that has been running for at least a minute is a leak: a hung fixture mutant spins at 100 % CPU for ever
// (`--test-timeout=0`), steals cores from every later run and made one matrix leg go red (measured 2026-11-03, 1161). Unlike scripts/dev/reap.sh (the by-hand broom: any orphaned `node --test`, opt-in) this one cannot see anything it is not meant to:
// the marker is the scratch directory's name, a process with a living parent is never touched, an unrelated `node` is never touched, a young orphan (another session's control scenario, which orphans on purpose for seconds) is never touched.
// Called at the end of `npm test` (posttest), at the end of the matrix, and by hand: node scripts/dev/reap-fixtures.mjs [--dry-run] [--quiet] [--min-age <seconds>] [--marker <regexp>]
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { killTree } from './proc-tree.mjs';

/** The scratch directory of a mutation runner (`forge-mutate-<id>`, never the cache `forge-mutate-cache`), as a path component of a command line. */
export const SCRATCH_MARKER = /\/forge-mutate-(?!cache\b)[A-Za-z0-9]{4,}\//;

/** `etime` ([[dd-]hh:]mm:ss) in seconds. */
export function etimeSeconds(e) {
  let d = 0, rest = String(e).trim();
  if (rest.includes('-')) { d = Number(rest.split('-')[0]); rest = rest.split('-')[1]; }
  const p = rest.split(':').map(Number);
  const [h, m, s] = p.length === 3 ? p : [0, p[0], p[1]];
  return d * 86400 + h * 3600 + m * 60 + s;
}

/** `ps -Ao pid=,ppid=,pgid=,etime=,user=,command=` -> rows. */
export function parseProcessTable(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), ageSec: etimeSeconds(m[4]), user: m[5], command: m[6] });
  }
  return rows;
}

/** The orphans to reap: owned by `me`, parent pid 1, at least `minAgeSec` old, a command line that matches `marker`. Never this process. */
export function selectFixtureOrphans(rows, { me, minAgeSec = 60, marker = SCRATCH_MARKER, self = process.pid } = {}) {
  return rows.filter((r) => r.ppid === 1 && r.pid !== self && (me === undefined || r.user === me) && r.ageSec >= minAgeSec && marker.test(r.command));
}

export function readProcessTable() {
  return parseProcessTable(execFileSync('ps', ['-Ao', 'pid=,ppid=,pgid=,etime=,user=,command='], { encoding: 'utf8', timeout: 10_000, maxBuffer: 32 * 1024 * 1024 }));
}

/** Kill the orphans (their trees); returns the rows it killed (or would kill under `dryRun`). */
export function reapFixtureOrphans({ dryRun = false, quiet = true, minAgeSec = 60, marker = SCRATCH_MARKER, rows, kill = killTree, log = (m) => console.log(m) } = {}) {
  let me; try { me = os.userInfo().username; } catch { me = undefined; }
  const victims = selectFixtureOrphans(rows ?? readProcessTable(), { me, minAgeSec, marker });
  for (const v of victims) {
    if (!quiet) log(`reap-fixtures: ${dryRun ? 'would kill' : 'killing'} a leaked fixture process (pid ${v.pid}, ${v.ageSec} s old): ${v.command.slice(0, 120)}`);
    if (!dryRun) kill(v.pid);
  }
  if (!quiet && victims.length === 0) log('reap-fixtures: nothing leaked');
  return victims;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const marker = opt('--marker') ? new RegExp(opt('--marker')) : SCRATCH_MARKER;
  try {
    reapFixtureOrphans({ dryRun: args.includes('--dry-run'), quiet: args.includes('--quiet'), minAgeSec: opt('--min-age') === undefined ? 60 : Number(opt('--min-age')), marker });
  } catch (e) { if (!args.includes('--quiet')) console.error('reap-fixtures: could not read the process table:', e?.message ?? e); }
  process.exit(0);                                                  // a broom that cannot run is never a reason to fail a run
}
