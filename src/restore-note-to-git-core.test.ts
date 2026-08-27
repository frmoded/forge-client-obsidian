import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  parseGitStatusShort, isUntracked, selectRestorablePaths,
  decideRestoreNote, describeRestore, RESTORE_STEPS,
} from './restore-note-to-git-core.ts';

const SAMPLE = [
  ' M 01-hello/hello_world.md',
  ' M 03-functions/cheer.md',
  '?? test_random.md',
  '?? .obsidian/community-plugins.json',
  'M  02-variables/greeting.md',
  ' D 07-data/colors.md',
].join('\n');

test('selectRestorablePaths never returns an untracked path', () => {
  const got = selectRestorablePaths(SAMPLE);
  assert.deepEqual(got, [
    '01-hello/hello_world.md',
    '02-variables/greeting.md',
    '03-functions/cheer.md',
    '07-data/colors.md',
  ]);
  // The property, stated directly: this is the whole reason the module exists.
  assert.ok(!got.includes('test_random.md'));
  assert.ok(!got.some((p) => p.includes('community-plugins')));
});

test('a deleted tracked file is restorable — that is a real undo case', () => {
  assert.deepEqual(selectRestorablePaths(' D notes/gone.md'), ['notes/gone.md']);
});

test('a rename reports the path that exists in the working tree', () => {
  assert.deepEqual(parseGitStatusShort('R  old.md -> new.md')[0].path, 'new.md');
});

test('quoted paths (spaces, unicode) are unquoted', () => {
  assert.deepEqual(parseGitStatusShort('?? "my note.md"')[0].path, 'my note.md');
});

test('decideRestoreNote refuses an untracked note by name', () => {
  assert.deepEqual(
    decideRestoreNote('test_random.md', '?? test_random.md'),
    { restorable: false, reason: 'untracked' },
  );
});

test('decideRestoreNote refuses a clean note rather than silently no-opping', () => {
  assert.deepEqual(
    decideRestoreNote('02-variables/greeting.md', ''),
    { restorable: false, reason: 'unchanged' },
  );
});

test('decideRestoreNote accepts a dirty tracked note', () => {
  assert.deepEqual(
    decideRestoreNote('03-functions/mood.md', ' M 03-functions/mood.md'),
    { restorable: true, path: '03-functions/mood.md' },
  );
});

test('the confirmation names what is LOST, and says it is irreversible', () => {
  const one = describeRestore(['a.md']);
  assert.match(one, /Discards uncommitted changes to a\.md/);
  assert.match(one, /cannot be undone/);
  const many = describeRestore(['a.md', 'b.md']);
  assert.match(many, /2 notes/);
  assert.match(many, /• a\.md/);
  assert.equal(describeRestore([]), 'Nothing to restore — no tracked changes.');
});

test('flush comes before checkout, and reload comes last', () => {
  // Ordering is the safety property: a checkout racing an unflushed
  // editor buffer loses to the next autosave.
  assert.deepEqual([...RESTORE_STEPS], ['flush', 'checkout', 'reload']);
  assert.ok(RESTORE_STEPS.indexOf('flush') < RESTORE_STEPS.indexOf('checkout'));
  assert.ok(RESTORE_STEPS.indexOf('reload') === RESTORE_STEPS.length - 1);
});

// ---- against a REAL git repo, per §2's "grep/test this rather than assuming" ----

function tmpRepo(): { dir: string; git: (...a: string[]) => string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-restore-'));
  const git = (...a: string[]) =>
    execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '.');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  return { dir, git, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('git checkout restores tracked files and leaves untracked ones alone', () => {
  const { dir, git, cleanup } = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'tracked.md'), 'original\n');
    fs.writeFileSync(path.join(dir, 'deleted.md'), 'kept\n');
    git('add', '-A'); git('commit', '-qm', 'init');

    fs.writeFileSync(path.join(dir, 'tracked.md'), 'DRIFT\n');
    fs.rmSync(path.join(dir, 'deleted.md'));
    fs.writeFileSync(path.join(dir, 'test_random.md'), 'the driver\'s own note\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'deep.md'), 'untracked, nested\n');

    const paths = selectRestorablePaths(git('status', '--short'));
    assert.deepEqual(paths, ['deleted.md', 'tracked.md']);

    git('checkout', '--', ...paths);

    assert.equal(fs.readFileSync(path.join(dir, 'tracked.md'), 'utf8'), 'original\n');
    assert.equal(fs.readFileSync(path.join(dir, 'deleted.md'), 'utf8'), 'kept\n');
    // The property under test.
    assert.ok(fs.existsSync(path.join(dir, 'test_random.md')), 'untracked file was destroyed');
    assert.ok(fs.existsSync(path.join(dir, 'sub', 'deep.md')), 'untracked nested file was destroyed');
  } finally { cleanup(); }
});

test('git refuses an untracked pathspec rather than acting on it', () => {
  const { dir, git, cleanup } = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'a.md'), 'x\n');
    git('add', '-A'); git('commit', '-qm', 'init');
    fs.writeFileSync(path.join(dir, 'untracked.md'), 'mine\n');
    assert.throws(
      () => git('checkout', '--', 'untracked.md'),
      /did not match any file/,
      'git silently accepted an untracked pathspec — the second line of defence is gone',
    );
    assert.ok(fs.existsSync(path.join(dir, 'untracked.md')));
  } finally { cleanup(); }
});
