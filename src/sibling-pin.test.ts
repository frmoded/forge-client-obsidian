// 2026-11-04-1171-1: "a test never compares with a sibling repo's moving HEAD". The helper (test-support/sibling-pin.ts) reads a sibling file AT A PINNED COMMIT; this proves a later commit in the sibling cannot red a test that uses it (a scratch
// sibling repo commits a changed bar and the pinned comparison stays green), that the same hazard WAS real for the old shape (the moving-tree comparison goes red), that a missing sibling or commit is a printed skip, and that no test reads a
// sibling vault's working tree any more (a mechanism guard with a non-vacuity partner). Also the stale-bar derivation the "Refresh note links" family uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SIBLING_PINS, exportPinnedSibling, pinSkipReason, pinnedSiblingFile } from './test-support/sibling-pin.ts';
import { staleBarText } from './test-support/score-first-notes.ts';

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function scratchSibling() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibling-pin-test-'));
  git(dir, 'init', '-q');
  fs.mkdirSync(path.join(dir, 'bars'));
  const BAR_A = '---\ntype: data\ndescription: "bar_005 — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4."\n---\n';
  fs.writeFileSync(path.join(dir, 'bars/bar_005.md'), BAR_A);
  git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'A: the bar the fixture was taken from');
  const A = git(dir, 'rev-parse', 'HEAD');
  return { dir, A, BAR_A };
}

test('a scratch sibling that COMMITS A CHANGED BAR leaves the pinned comparison green; the old moving-tree comparison goes red (the hazard was real)', () => {
  const { dir, A, BAR_A } = scratchSibling();
  const fixture = BAR_A;                                                    // the client's byte copy, taken at A
  const compare = () => { const p = pinnedSiblingFile('music-playground', 'bars/bar_005.md', { dir, sha: A }); return 'text' in p ? p.text === fixture : null; };
  assert.equal(compare(), true, 'before the sibling moves: equal');
  fs.writeFileSync(path.join(dir, 'bars/bar_005.md'), BAR_A.replace('kick on beats 1 and 3, snare on 2 and 4.', '8 hits in 16 steps (kick 5, snare 3), tempo 100.'));
  git(dir, 'commit', '-qam', 'B: the plugin refreshed the description');   // "notes snapshot for Restore to last commit"
  assert.notEqual(git(dir, 'rev-parse', 'HEAD'), A, 'the sibling moved');
  assert.equal(compare(), true, 'AFTER the sibling committed a changed bar: still green (the pinned commit is what is compared)');
  assert.notEqual(fs.readFileSync(path.join(dir, 'bars/bar_005.md'), 'utf8'), fixture, 'the old shape (read the sibling now, working tree or HEAD) is red: the hazard');
  assert.notEqual(git(dir, 'show', 'HEAD:bars/bar_005.md') + '\n', fixture, 'and so is the moving HEAD');
});

test('CONTROL: the comparison can fail - a fixture that is not the pinned bytes is detected', () => {
  const { dir, A, BAR_A } = scratchSibling();
  const p = pinnedSiblingFile('music-playground', 'bars/bar_005.md', { dir, sha: A });
  assert.ok('text' in p);
  if ('text' in p) { assert.equal(p.text, BAR_A); assert.notEqual(p.text, BAR_A + ' '); assert.notEqual(p.text, BAR_A.replace('bar_005', 'bar_006')); }
});

test('a sibling that is not checked out, or has no such commit, is a one-line skip reason (a counted skip), never a failure and never a silent pass', () => {
  const { dir, A } = scratchSibling();
  assert.equal(pinSkipReason(dir, A), null);
  const noCommit = pinSkipReason(dir, 'a'.repeat(40), 'music-playground');
  assert.match(noCommit ?? '', /^music-playground does not have its pinned commit aaaaaaa .*not comparing with a moving HEAD$/);
  assert.ok(!(noCommit ?? '').includes('\n'), 'one line');
  const missing = pinnedSiblingFile('music-playground', 'bars/bar_005.md', { dir: path.join(os.tmpdir(), 'no-such-sibling-dir'), sha: A });
  assert.ok('skip' in missing);
  if ('skip' in missing) assert.match(missing.skip, /is not checked out here/);
  assert.ok('skip' in exportPinnedSibling('music-core', { dir: path.join(os.tmpdir(), 'no-such-sibling-dir'), sha: A }));
  assert.throws(() => pinnedSiblingFile('music-playground', 'bars/nope.md', { dir, sha: A }), 'a file the pinned commit does not have is a failure (the pin names a commit that has it)');
});

test('exportPinnedSibling extracts the whole tree AT the pinned commit (what the real-vault test reads), not the later one', () => {
  const { dir, A, BAR_A } = scratchSibling();
  fs.writeFileSync(path.join(dir, 'bars/bar_005.md'), 'changed later\n');
  fs.writeFileSync(path.join(dir, 'later.md'), 'added later\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'B');
  const out = exportPinnedSibling('music-playground', { dir, sha: A });
  assert.ok('dir' in out);
  if ('dir' in out) {
    assert.equal(fs.readFileSync(path.join(out.dir, 'bars/bar_005.md'), 'utf8'), BAR_A);
    assert.equal(fs.existsSync(path.join(out.dir, 'later.md')), false);
    fs.rmSync(out.dir, { recursive: true, force: true });
  }
});

test('the pins name real, full commit ids, and the real playground (when checked out and complete) has them with the bars the fixtures hold', () => {
  for (const sha of Object.values(SIBLING_PINS)) assert.match(sha, /^[0-9a-f]{40}$/);
  const bar = pinnedSiblingFile('music-playground', 'bars/bar_005.md');
  if ('skip' in bar) return;                                                 // not checked out here: nothing to compare
  assert.equal(bar.text, fs.readFileSync(path.resolve(import.meta.dirname, '../test/fixtures/score-first/bar_005.md'), 'utf8'));
});

// ---- MECHANISM GUARD: no test reads a sibling vault's working tree ---------------------------------------------------------------------------------------------------------------------------------
const SIBLING_READ = /(?:resolve|join)\([^)]*['"`]\.\.(?:\/\.\.)?\/(?:music-playground|music-core|forge-tutorial|music-theory)(?:\/|['"`])/;

test('MECHANISM GUARD: no test builds a path into a sibling vault (../music-playground, ../music-core, ../forge-tutorial, ../music-theory) - they go through sibling-pin.ts', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files = [...fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(root, 'src', f)), ...fs.readdirSync(path.join(root, 'scripts')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(root, 'scripts', f))];
  assert.ok(files.length > 300, `non-vacuity: ${files.length} test files scanned`);
  const offenders = files.filter((f) => !f.endsWith('sibling-pin.test.ts') && SIBLING_READ.test(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, ''))).map((f) => path.relative(root, f));
  assert.deepEqual(offenders, [], 'a test that reads a sibling vault must pin the commit (pinnedSiblingFile / exportPinnedSibling)');
});

test('NON-VACUITY of the guard: it fires on the shapes the old tests had', () => {
  for (const line of ["const SIBLING = path.resolve(import.meta.dirname, '../../music-playground/bars/bar_005.md');", "const SOURCE_FILE = path.resolve(ROOT, '../forge-tutorial/06-loops/countdown.md');", "const REAL_MC = path.resolve(import.meta.dirname, '../../music-core');", "path.join(ROOT, '../forge-tutorial/x.md')"]) {
    assert.match(line, SIBLING_READ, line);
  }
  assert.doesNotMatch("music-core = { local = \"../music-core\" }", SIBLING_READ, 'a toml string is not a read');
});

// ---- the stale bar the refresh family derives --------------------------------------------------------------------------------------------------------------------------------------------------------
test('staleBarText derives the pre-refresh bar from the refreshed fixture in memory: only the description line changes; stale in, stale out; junk is refused', () => {
  const fx = fs.readFileSync(path.resolve(import.meta.dirname, '../test/fixtures/score-first/bar_005.md'), 'utf8');
  const stale = staleBarText(fx);
  assert.match(stale, /^description: "bar_005 — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4\."$/m);
  assert.equal(stale.split('\n').length, fx.split('\n').length);
  assert.deepEqual(stale.split('\n').filter((l, i) => l !== fx.split('\n')[i]).length <= 1, true, 'at most the one line differs');
  assert.equal(staleBarText(stale), stale, 'idempotent');
  assert.match(staleBarText(fx.replace('bar_005', 'bar_006')), /bar_006 — a one-bar rhythm for the Beat Box: kick on beats 1 and 3/);
  assert.throws(() => staleBarText('no frontmatter here'), /no bar description line/);
});
