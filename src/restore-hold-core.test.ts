// Beat-as-data Phase 5c (drain 2026-10-07-0100): "Restore to last commit" must cooperate with a Beat Box that autosaves.
// Order is the safety property: HOLD (flush, then silence autosave) -> checkout -> RELEASE (reload from disk). A queued autosave must never
// land after the checkout, and the widget must show what git put on disk.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flushRestoreParticipants, runRestoreWithHolds, type RestoreParticipant } from './restore-hold-core.ts';

function participant(path: string, log: string[], opts: { holdFails?: boolean } = {}): RestoreParticipant {
  return {
    path,
    flush: async () => { log.push(`flush:${path}`); },
    hold: async () => { log.push(`hold:${path}`); if (opts.holdFails) throw new Error('flush failed'); },
    release: async () => { log.push(`release:${path}`); },
  };
}

test('order: every matching participant is held BEFORE the checkout and released AFTER it', async () => {
  const log: string[] = [];
  const r = await runRestoreWithHolds([participant('a.md', log)], ['a.md'], () => { log.push('checkout'); return 'done'; });
  assert.equal(r, 'done');
  assert.deepEqual(log, ['hold:a.md', 'checkout', 'release:a.md']);
});

test('only participants for the restored paths are held — a Beat Box for another file is left alone', async () => {
  const log: string[] = [];
  await runRestoreWithHolds([participant('a.md', log), participant('b.md', log)], ['b.md'], () => { log.push('checkout'); });
  assert.deepEqual(log, ['hold:b.md', 'checkout', 'release:b.md']);
});

test('restore-all: every Beat Box whose file is in the restored set is held and released', async () => {
  const log: string[] = [];
  await runRestoreWithHolds([participant('a.md', log), participant('b.md', log), participant('c.md', log)], ['a.md', 'c.md'], () => { log.push('checkout'); });
  assert.deepEqual(log.slice(0, 2).sort(), ['hold:a.md', 'hold:c.md']);
  assert.equal(log[2], 'checkout');
  assert.deepEqual(log.slice(3).sort(), ['release:a.md', 'release:c.md']);
});

test('a checkout that reports failure (returns an outcome) still releases, so the widget reloads whatever is on disk', async () => {
  const log: string[] = [];
  const r = await runRestoreWithHolds([participant('a.md', log)], ['a.md'], () => ({ ok: false }));
  assert.deepEqual(r, { ok: false });
  assert.deepEqual(log, ['hold:a.md', 'release:a.md']);
});

test('a checkout that THROWS still releases, and the error propagates', async () => {
  const log: string[] = [];
  await assert.rejects(runRestoreWithHolds([participant('a.md', log)], ['a.md'], () => { throw new Error('git exploded'); }), /git exploded/);
  assert.deepEqual(log, ['hold:a.md', 'release:a.md']);
});

test('if a hold fails the checkout is NOT run (we cannot guarantee a queued save will not land), everything is released, the error propagates', async () => {
  const log: string[] = [];
  await assert.rejects(
    runRestoreWithHolds([participant('a.md', log), participant('b.md', log, { holdFails: true })], ['a.md', 'b.md'], () => { log.push('checkout'); }),
    /flush failed/,
  );
  assert.ok(!log.includes('checkout'));
  assert.ok(log.includes('release:a.md') && log.includes('release:b.md'));
});

test('no participants → just the checkout', async () => {
  const log: string[] = [];
  assert.equal(await runRestoreWithHolds([], ['a.md'], () => { log.push('checkout'); return 1; }), 1);
  assert.deepEqual(log, ['checkout']);
});

test('a release that throws does not mask the checkout result', async () => {
  const p: RestoreParticipant = { path: 'a.md', flush: async () => {}, hold: async () => {}, release: async () => { throw new Error('reload failed'); } };
  assert.equal(await runRestoreWithHolds([p], ['a.md'], () => 'ok'), 'ok');
});

test('flushRestoreParticipants: flushes only the Beat Boxes for the named paths (used before git status), and a failing flush does not throw', async () => {
  const log: string[] = [];
  const failing: RestoreParticipant = { path: 'c.md', flush: async () => { throw new Error('nope'); }, hold: async () => {}, release: async () => {} };
  await flushRestoreParticipants([participant('a.md', log), participant('b.md', log), failing], ['a.md', 'c.md']);
  assert.deepEqual(log, ['flush:a.md']);
});
