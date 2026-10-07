// Beat-as-data Phase 5b (drain 2026-10-06-1200): the autosave pipeline that replaces the widget's Save button.
// Pure core with an INJECTED clock and write function, so every rule is tested deterministically: debounce coalescing, one write in
// flight at a time, a queued trailing payload, flush-now, persistent errors, and halting on an external change.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAutosavePipeline, type AutosaveStatus, type SaveOutcome } from './rhythm-autosave-core.ts';

/** A fake clock: timers fire only when advanced, in time order. */
function makeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer(fn: () => void, ms: number) { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer(h: unknown) { timers.delete(h as number); },
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    pending: () => timers.size,
  };
}

/** A write whose completion the test controls. */
function makeWriter() {
  const calls: unknown[] = [];
  const resolvers: Array<(o: SaveOutcome) => void> = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  return {
    calls,
    maxConcurrent: () => maxConcurrent,
    inflight: () => concurrent,
    write(payload: unknown): Promise<SaveOutcome> {
      calls.push(payload);
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise((resolve) => resolvers.push((o) => { concurrent--; resolve(o); }));
    },
    finish(o: SaveOutcome = { ok: true }) { const r = resolvers.shift(); assert.ok(r, 'no write in flight'); r(o); },
  };
}

const tick = () => new Promise((r) => setImmediate(r));
const OK: SaveOutcome = { ok: true };

function rig(debounceMs?: number) {
  const clock = makeClock();
  const w = makeWriter();
  const statuses: AutosaveStatus[] = [];
  const p = createAutosavePipeline({
    debounceMs, setTimer: clock.setTimer, clearTimer: clock.clearTimer, write: (x) => w.write(x), onStatus: (s) => statuses.push(s),
  });
  return { clock, w, p, statuses };
}

test('debounce: a burst of edits within 600 ms is ONE write carrying the LAST payload', async () => {
  const { clock, w, p } = rig();
  for (let i = 1; i <= 5; i++) { p.submit({ n: i }); clock.advance(100); }
  assert.equal(w.calls.length, 0, 'nothing is written while the burst continues');
  clock.advance(499);
  assert.equal(w.calls.length, 0, 'still inside the debounce window of the last edit');
  clock.advance(1);
  assert.deepEqual(w.calls, [{ n: 5 }]);
  w.finish(); await tick();
});

test('debounce: every new edit restarts the window', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(500);
  p.submit({ n: 2 }); clock.advance(599);
  assert.equal(w.calls.length, 0);
  clock.advance(1);
  assert.deepEqual(w.calls, [{ n: 2 }]);
  w.finish(); await tick();
});

test('debounce: the window is 600 ms by default and configurable', async () => {
  const a = rig();
  a.p.submit({ n: 1 }); a.clock.advance(599); assert.equal(a.w.calls.length, 0); a.clock.advance(1); assert.equal(a.w.calls.length, 1);
  a.w.finish(); await tick();
  const b = rig(50);
  b.p.submit({ n: 1 }); b.clock.advance(49); assert.equal(b.w.calls.length, 0); b.clock.advance(1); assert.equal(b.w.calls.length, 1);
  b.w.finish(); await tick();
});

test('flush: writes the latest payload immediately and cancels the timer (no second write later)', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); p.submit({ n: 2 });
  const done = p.flush();
  assert.deepEqual(w.calls, [{ n: 2 }], 'written at once, without waiting for the debounce');
  assert.equal(clock.pending(), 0, 'the debounce timer is gone');
  w.finish(); await done;
  clock.advance(5000);
  assert.equal(w.calls.length, 1);
});

test('flush: with nothing pending it writes nothing and resolves', async () => {
  const { w, p } = rig();
  await p.flush();
  assert.equal(w.calls.length, 0);
});

test('one write in flight at a time: an edit arriving mid-write is QUEUED (not dropped) and written after', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 1 }]);
  p.submit({ n: 2 }); clock.advance(600);                 // its debounce fires while write 1 is still running
  assert.equal(w.calls.length, 1, 'no second concurrent write');
  w.finish(); await tick();
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 2 }], 'the trailing payload is written once the first finishes');
  assert.equal(w.maxConcurrent(), 1);
  w.finish(); await tick();
});

test('a payload that arrives mid-write but whose debounce has not fired yet is still written (by its own timer)', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  p.submit({ n: 2 });                                      // arrives while write 1 runs; its timer is still ticking
  w.finish(); await tick();
  assert.equal(w.calls.length, 1);
  clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 2 }]);
  w.finish(); await tick();
});

test('several edits mid-write coalesce: only the LAST is written afterwards', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  p.submit({ n: 2 }); p.submit({ n: 3 }); p.submit({ n: 4 }); clock.advance(600);
  w.finish(); await tick();
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 4 }]);
  w.finish(); await tick();
});

test('flush while a write is in flight waits for it AND for the queued trailing write', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  p.submit({ n: 2 });
  let resolved = false;
  const done = p.flush().then(() => { resolved = true; });
  await tick();
  assert.equal(resolved, false);
  w.finish(); await tick();
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 2 }]);
  assert.equal(resolved, false, 'still waiting for the trailing write');
  w.finish(); await done;
  assert.equal(resolved, true);
  assert.equal(w.maxConcurrent(), 1);
});

test('status: saving while an edit is pending or in flight, saved once everything is written', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 });
  assert.deepEqual(statuses.at(-1), { state: 'saving' });
  clock.advance(600);
  assert.deepEqual(statuses.at(-1), { state: 'saving' });
  w.finish(); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'saved' });
  assert.equal(p.busy(), false);
});

test('status: it never claims "saved" while a newer edit is still waiting', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  p.submit({ n: 2 });
  w.finish(); await tick();
  assert.ok(!statuses.some((s) => s.state === 'saved'), JSON.stringify(statuses));
  clock.advance(600); w.finish(); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'saved' });
});

test('errors persist across the next edit and clear only on the next SUCCESSFUL save', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  w.finish({ ok: false, kind: 'refused', message: 'Not saved: this note is marked read_only' }); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'error', message: 'Not saved: this note is marked read_only' });
  p.submit({ n: 2 });                                      // a new edit: the error must NOT vanish
  assert.deepEqual(statuses.at(-1), { state: 'error', message: 'Not saved: this note is marked read_only' });
  clock.advance(600);
  assert.deepEqual(statuses.at(-1), { state: 'error', message: 'Not saved: this note is marked read_only' }, 'still shown while retrying');
  w.finish(OK); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'saved' });
});

test('an invalid-payload or refused save does NOT halt autosave (a later edit is still attempted)', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  w.finish({ ok: false, kind: 'invalid', message: 'Not saved: bad' }); await tick();
  p.submit({ n: 2 }); clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 2 }]);
  w.finish(); await tick();
});

test('a stale-on-disk save HALTS autosave: conflict status, later edits are ignored until resume()', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 }); clock.advance(600);
  w.finish({ ok: false, kind: 'stale', message: 'Not saved: the note changed on disk' }); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'conflict', message: 'Not saved: the note changed on disk' });
  p.submit({ n: 2 }); clock.advance(5000);
  assert.equal(w.calls.length, 1, 'nothing is written while halted');
  p.resume();
  assert.deepEqual(statuses.at(-1), { state: 'idle' });
  p.submit({ n: 3 }); clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 1 }, { n: 3 }]);
  w.finish(); await tick();
});

test('halt() (an external change while a save is pending) drops the pending edit, writes nothing, and reports the conflict', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 });
  p.halt('the note changed on disk — your latest edit was not saved');
  clock.advance(5000);
  assert.equal(w.calls.length, 0);
  assert.deepEqual(statuses.at(-1), { state: 'conflict', message: 'the note changed on disk — your latest edit was not saved' });
  await p.flush();
  assert.equal(w.calls.length, 0, 'flush does not write over an external change either');
});

test('while halted an edit is ignored COMPLETELY: no timer, no "saving", not busy, no write even on flush — until resume()', async () => {
  const { clock, w, p, statuses } = rig();
  p.halt('changed on disk');
  const before = statuses.length;
  p.submit({ n: 1 });
  assert.equal(clock.pending(), 0, 'no debounce timer was started');
  assert.equal(p.busy(), false);
  assert.equal(statuses.length, before, 'no status change');
  clock.advance(5000);
  await p.flush();
  assert.equal(w.calls.length, 0);
  p.resume();
  p.submit({ n: 2 });
  clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 2 }], 'after resume() autosave works again, with the new edit only');
  w.finish();
});

test('pause(): a SILENT hold (used around a restore) — pending edit dropped, later edits ignored, no status emitted, until resume()', async () => {
  const { clock, w, p, statuses } = rig();
  p.submit({ n: 1 });
  const before = statuses.length;
  p.pause();
  assert.equal(clock.pending(), 0, 'the pending debounce timer is cancelled');
  assert.equal(p.busy(), false);
  p.submit({ n: 2 });
  clock.advance(5000);
  await p.flush();
  assert.equal(w.calls.length, 0, 'nothing is written while paused — a restore can never be overwritten by a queued save');
  assert.equal(statuses.length, before, 'pause() and the ignored edit emit no status');
  p.resume();
  p.submit({ n: 3 });
  clock.advance(600);
  assert.deepEqual(w.calls, [{ n: 3 }]);
  w.finish();
});

test('pause() does not abandon a write already in flight: flush() first, then pause() — the in-flight write completes before the hold', async () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 });
  clock.advance(600);
  assert.equal(w.inflight(), 1);
  const held = p.flush().then(() => p.pause());
  w.finish();
  await held;
  assert.equal(w.inflight(), 0);
  assert.equal(p.busy(), false);
});

test('a write that THROWS becomes an error status, never an unhandled rejection', async () => {
  const clock = makeClock();
  const statuses: AutosaveStatus[] = [];
  const p = createAutosavePipeline({
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, onStatus: (s) => statuses.push(s),
    write: async () => { throw new Error('disk on fire'); },
  });
  p.submit({ n: 1 }); clock.advance(600); await tick();
  assert.deepEqual(statuses.at(-1), { state: 'error', message: 'Not saved: disk on fire' });
});

test('busy(): true while an edit is pending or a write is in flight, false when idle', async () => {
  const { clock, w, p } = rig();
  assert.equal(p.busy(), false);
  p.submit({ n: 1 }); assert.equal(p.busy(), true);
  clock.advance(600); assert.equal(p.busy(), true);
  w.finish(); await tick(); assert.equal(p.busy(), false);
});

test('dispose() cancels a pending timer', () => {
  const { clock, w, p } = rig();
  p.submit({ n: 1 });
  p.dispose();
  clock.advance(5000);
  assert.equal(w.calls.length, 0);
  assert.equal(clock.pending(), 0);
});
