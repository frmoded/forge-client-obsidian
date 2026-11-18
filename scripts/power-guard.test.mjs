// 2026-11-18-1200 - the matrix does not start on battery power or below 30 % charge, keeps the Mac awake while it runs, and can take back the git worktrees a KILLED matrix leaves registered (measured 2026-11-18, drain 1000: a matrix started on
// battery at 10 %, the Mac went to sleep during it twice, nested tests timed out at 300 s, one run hung for hours at a load average near 100, and two killed runs left their worktrees registered in seven repos).
// The rules are pinned on READINGS: a stand-in file holding `pmset -g batt` text (FORGE_POWER_READ_FILE), so the decision is the same on any machine. Pins the MECHANISM (the sentence and the exit status of scripts/dev/power-check.mjs, read by
// drain-matrix.sh; the script's refusal before any worktree exists; `caffeinate -i -s -w <pid>`; `--cleanup-worktrees` removes only what git registered under a drain-matrix.* directory, through `git worktree remove`, never rm -rf of a tree):
// if the design moves this SHOULD go red - reassess, don't just rewrite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { MIN_CHARGE_PERCENT, parsePmsetBatt, powerVerdict, refusalSentence } from './dev/power-core.mjs';
import { AC_POWER, BATTERY_POWER, REPOS, git, matrix, projects, skip } from './test-support/matrix-stubs.mjs';

const CHECK = path.resolve(import.meta.dirname, 'dev/power-check.mjs');
const LOW_ON_AC = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t18%; charging; 1:50 remaining present: true\n";
const LOW_ON_BATTERY = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t10%; discharging; 0:40 remaining present: true\n";
const DESKTOP = "Now drawing from 'AC Power'\n";
const SENTENCE = /the Mac is on battery below 20 % \(\d+ % charge\): the matrix is not started[^\n]*FORGE_POWER_GUARD=off/;
const batt = (source, pct) => `Now drawing from '${source === 'ac' ? 'AC Power' : 'Battery Power'}'\n -InternalBattery-0 (id=1)\t${pct}%; ${source === 'ac' ? 'charging' : 'discharging'}; 1:00 remaining present: true\n`;

test('parsePmsetBatt reads the source and the charge from `pmset -g batt`, and says unknown for anything else', () => {
  assert.deepEqual(parsePmsetBatt(AC_POWER), { source: 'ac', percent: 86 });
  assert.deepEqual(parsePmsetBatt(BATTERY_POWER), { source: 'battery', percent: 52 });
  assert.deepEqual(parsePmsetBatt(LOW_ON_BATTERY), { source: 'battery', percent: 10 });
  assert.deepEqual(parsePmsetBatt(DESKTOP), { source: 'ac', percent: null }, 'a desktop Mac has no battery line');
  assert.deepEqual(parsePmsetBatt("Now drawing from 'UPS Power'\n"), { source: 'unknown', percent: null });
  assert.deepEqual(parsePmsetBatt(''), { source: 'unknown', percent: null });
  assert.deepEqual(parsePmsetBatt('command not found: pmset'), { source: 'unknown', percent: null });
  assert.deepEqual(parsePmsetBatt(undefined), { source: 'unknown', percent: null });
  assert.deepEqual(parsePmsetBatt("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true\n"), { source: 'ac', percent: 100 });
});

test('powerVerdict (the driver\'s rule, 2026-11-18: "not block things due to power if the battery has 20 % or more"): refuse ONLY on battery below 20 %; 20 and 21 are fine; AC never refuses, at any charge; a reading that is missing never refuses', () => {
  assert.equal(MIN_CHARGE_PERCENT, 20);
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 19 }), { ok: false, reason: 'low-battery' });
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 0 }), { ok: false, reason: 'low-battery' });
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 20 }), { ok: true, reason: null }, '20 % itself is fine');
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 21 }), { ok: true, reason: null });
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 99 }), { ok: true, reason: null }, 'battery power as such is no reason to refuse');
  assert.deepEqual(powerVerdict({ source: 'battery', percent: null }), { ok: true, reason: null }, 'a charge that cannot be read is silence, never a refusal');
  assert.deepEqual(powerVerdict({ source: 'ac', percent: 5 }), { ok: true, reason: null }, 'on AC power nothing is refused, not even 5 %');
  assert.deepEqual(powerVerdict({ source: 'ac', percent: 100 }), { ok: true, reason: null });
  assert.deepEqual(powerVerdict({ source: 'ac', percent: null }), { ok: true, reason: null });
  assert.deepEqual(powerVerdict({ source: 'unknown', percent: null }), { ok: true, reason: null }, 'a machine that cannot be read is silence, never a refusal');
  assert.deepEqual(powerVerdict({ source: 'battery', percent: 40 }, 50), { ok: false, reason: 'low-battery' }, 'the limit is a parameter');
});

test('refusalSentence names what was read, why it matters, what to do, and the one switch', () => {
  const b = refusalSentence({ source: 'battery', percent: 19 }, { ok: false, reason: 'low-battery' });
  assert.ok(b.startsWith('the Mac is on battery below 20 % (19 % charge): ')); assert.match(b, SENTENCE); assert.match(b, /plug in/i);
  assert.equal(refusalSentence({ source: 'ac', percent: 86 }, { ok: true, reason: null }), '', 'no sentence when nothing is refused');
  assert.equal(refusalSentence({ source: 'battery', percent: 52 }, { ok: true, reason: null }), '');
});

function check(reading, env = {}) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'power-check-')), 'r.txt'); if (reading !== null) fs.writeFileSync(f, reading);
  try { const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8', env: { ...process.env, FORGE_POWER_READ_FILE: f, ...env } }); return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() }; }
  finally { fs.rmSync(path.dirname(f), { recursive: true, force: true }); }
}

test('power-check.mjs: exit 1 and the sentence on stderr only on battery below 20 %, exit 0 and one line saying what it saw otherwise (19 refuses, 20 and 21 pass, AC at 5 % passes); FORGE_POWER_GUARD=off passes; an unreadable stand-in file is silence', () => {
  const a = check(AC_POWER); assert.equal(a.status, 0); assert.match(a.out, /^power: on AC power, 86 % charge$/); assert.equal(a.err, '');
  const d = check(DESKTOP); assert.equal(d.status, 0); assert.match(d.out, /^power: on AC power$/);
  const b = check(BATTERY_POWER); assert.equal(b.status, 0, 'on battery at 52 %: runs'); assert.match(b.out, /^power: on battery, 52 % charge$/);
  const l = check(LOW_ON_BATTERY); assert.equal(l.status, 1); assert.match(l.err, SENTENCE); assert.match(l.err, /10 %/);
  assert.equal(check(batt('battery', 19)).status, 1, '19 % on battery refuses'); assert.equal(check(batt('battery', 20)).status, 0, '20 % passes'); assert.equal(check(batt('battery', 21)).status, 0);
  const lowAc = check(LOW_ON_AC); assert.equal(lowAc.status, 0, 'AC power is never refused'); assert.equal(check(batt('ac', 5)).status, 0);
  const off = check(LOW_ON_BATTERY, { FORGE_POWER_GUARD: 'off' }); assert.equal(off.status, 0); assert.match(off.out, /guard is off/);
  const missing = check(null); assert.equal(missing.status, 0, 'a stand-in file that is not there is a reading that is missing, never a refusal');
});

test('the real `pmset -g batt` on THIS machine parses to a reading (the format the guard relies on has not moved), or this machine has no pmset', () => {
  const r = spawnSync('pmset', ['-g', 'batt'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return;
  const reading = parsePmsetBatt(r.stdout); assert.notEqual(reading.source, 'unknown', `pmset said: ${r.stdout.slice(0, 120)}`);
  if (/InternalBattery/.test(r.stdout)) assert.ok(Number.isInteger(reading.percent) && reading.percent >= 0 && reading.percent <= 100, `percent in: ${r.stdout.slice(0, 160)}`);
});

const worktreesOf = (p, r) => git(path.join(p.dir, r), 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));

test('the matrix refuses on battery below 20 % BEFORE any worktree exists, and runs on battery at 20 % or more and on AC; FORGE_POWER_GUARD=off runs it on a flat battery', { skip }, () => {
  const p = projects(); const reading = (txt) => { const f = path.join(p.dir, 'b.txt'); fs.writeFileSync(f, txt); return f; };
  try {
    const refused = matrix(p, ['--no-forge'], { FORGE_POWER_READ_FILE: reading(LOW_ON_BATTERY) });
    assert.notEqual(refused.status, 0); assert.match(refused.err, SENTENCE); assert.match(refused.err, /10 %/);
    assert.ok(REPOS.every((r) => worktreesOf(p, r).length === 1), 'nothing was created in any repo');
    assert.equal(fs.readdirSync(p.dir).filter((n) => n.startsWith('drain-matrix.')).length, 0, 'no work directory is left behind');
    const ok = matrix(p, ['--no-forge'], { TEST_MS: '100' }); assert.equal(ok.status, 0, ok.out + ok.err); assert.match(ok.out, /power: on AC power, 86 % charge/);
    const onBattery = matrix(p, ['--no-forge'], { TEST_MS: '100', FORGE_POWER_READ_FILE: reading(BATTERY_POWER) }); assert.equal(onBattery.status, 0, onBattery.out + onBattery.err); assert.match(onBattery.out, /power: on battery, 52 % charge/);
    const forced = matrix(p, ['--no-forge'], { TEST_MS: '100', FORGE_POWER_READ_FILE: reading(LOW_ON_BATTERY), FORGE_POWER_GUARD: 'off' }); assert.equal(forced.status, 0, forced.out + forced.err); assert.match(forced.out, /guard is off/);
  } finally { p.done(); }
});

test('the matrix keeps the Mac awake: `caffeinate -i -s -w <its own pid>` runs while it works (a stand-in caffeinate records how it was called); FORGE_CAFFEINATE=off does not start one', { skip }, () => {
  const p = projects(); const bin = path.join(p.dir, 'bin'); fs.mkdirSync(bin);
  const log = path.join(p.dir, 'caffeinate.log');
  fs.writeFileSync(path.join(bin, 'caffeinate'), `#!/bin/bash\necho "$@" >> "${log}"\nsleep 1\n`, { mode: 0o755 });
  try {
    const on = matrix(p, ['--no-forge'], { TEST_MS: '100', FORGE_CAFFEINATE: '', PATH: `${bin}:${process.env.PATH}` }); assert.equal(on.status, 0, on.out + on.err);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n'); assert.equal(calls.length, 1, 'one caffeinate per matrix');
    assert.match(calls[0], /^-i -s -w \d+$/, 'idle and system sleep both held, tied to the matrix\'s own pid so it ends with it, whatever way it ends');
    fs.rmSync(log); const off = matrix(p, ['--no-forge'], { TEST_MS: '100', FORGE_CAFFEINATE: 'off', PATH: `${bin}:${process.env.PATH}` }); assert.equal(off.status, 0, off.out + off.err); assert.equal(fs.existsSync(log), false);
  } finally { p.done(); }
});

function strand(p) {   // what a killed matrix leaves: a registered worktree under a drain-matrix.* directory in every repo, with the links a matrix puts in a worktree
  const work = path.join(p.dir, 'drain-matrix.KiLLed1'); const sentinel = path.join(p.dir, 'real-node-modules'); fs.mkdirSync(sentinel, { recursive: true }); fs.writeFileSync(path.join(sentinel, 'keep.txt'), 'the real directory behind the link');
  for (const r of REPOS) { git(path.join(p.dir, r), 'worktree', 'add', '--detach', path.join(work, r), 'HEAD'); }
  fs.symlinkSync(sentinel, path.join(work, 'forge-client-obsidian', 'node_modules'));
  git(path.join(p.dir, 'forge-client-obsidian'), 'worktree', 'add', '--detach', path.join(work, 'lean', 'forge-client-obsidian'), 'HEAD');
  fs.symlinkSync(sentinel, path.join(work, 'lean', 'forge-client-obsidian', 'node_modules'));
  const other = path.join(p.dir, 'somebody-elses-worktree'); git(path.join(p.dir, 'music-theory'), 'worktree', 'add', '--detach', other, 'HEAD');
  return { work, sentinel, other };
}

test('--cleanup-worktrees removes the registered worktrees of a killed matrix in all seven repos (links first, never following one), keeps every other worktree, and works on battery', { skip }, () => {
  const p = projects();
  try {
    const s = strand(p);
    assert.equal(worktreesOf(p, 'forge-client-obsidian').length, 3, 'two stranded worktrees of the client + the repo');
    const r = matrix(p, ['--cleanup-worktrees'], { FORGE_POWER_READ_FILE: (fs.writeFileSync(path.join(p.dir, 'b.txt'), BATTERY_POWER), path.join(p.dir, 'b.txt')) });
    assert.equal(r.status, 0, r.out + r.err); assert.match(r.out, /cleanup-worktrees: 8 removed/);
    for (const repo of REPOS) assert.deepEqual(worktreesOf(p, repo).filter((w) => /\/drain-matrix\./.test(w)), [], `${repo}: nothing registered under a drain-matrix.* directory`);
    assert.ok(worktreesOf(p, 'music-theory').some((w) => w.endsWith('somebody-elses-worktree')), 'a worktree that is not the matrix\'s stays');
    assert.equal(fs.readFileSync(path.join(s.sentinel, 'keep.txt'), 'utf8'), 'the real directory behind the link', 'the directory a link pointed at is untouched');
    assert.equal(fs.existsSync(path.join(s.work, 'forge-client-obsidian')), false, 'the worktree directory itself is gone (git removed it)');
    const again = matrix(p, ['--cleanup-worktrees']); assert.equal(again.status, 0); assert.match(again.out, /cleanup-worktrees: 0 removed/, 'no-op stays no-op');
  } finally { p.done(); }
});

test('a matrix that starts while a killed one\'s worktrees are still registered says so and prints the cleanup command', { skip }, () => {
  const p = projects();
  try {
    strand(p);
    const r = matrix(p, ['--no-forge'], { TEST_MS: '100' }); assert.equal(r.status, 0, r.out + r.err);
    assert.match(r.err + r.out, /WARN: 8 worktree\(s\) of an earlier matrix are still registered \(a killed run\): bash scripts\/drain-matrix\.sh --cleanup-worktrees/);
  } finally { p.done(); }
});
