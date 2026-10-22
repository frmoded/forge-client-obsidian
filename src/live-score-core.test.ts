// score_first_experiment M1 (drain 2026-10-21-1100) — the live Score controller, with a fake clock, a fake engine and a fake canvas: what is shown when, what rapid edits cost,
// what an invalid bar says, what a finished-too-late render draws. (The REAL engine is driven in live-score-engine.test.ts.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { LIVE_SCORE_DEBOUNCE_MS, createLiveScore, type LiveScoreTiming, type LiveScoreView } from './live-score-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';
import { SCORE_RENDERING_TEXT } from './score-first-core.ts';

type Data = typeof RHYTHM_STARTER;
const withTempo = (n: number): Data => ({ ...RHYTHM_STARTER, tempo_bpm: n });
const PAYLOAD = (tag: string) => ({ type: 'musicxml', content: `<score-partwise>${tag}</score-partwise>` });

function rig(opts: { drawResult?: boolean | (() => boolean); debounceMs?: number } = {}) {
  let now = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = [];
  let nextId = 1;
  const log: string[] = [];
  const statuses: string[] = [];
  const drawn: string[] = [];
  const pendingCompute: Array<{ data: Data; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  const view: LiveScoreView = {
    status(t) { statuses.push(t); log.push(`status:${t}`); },
    draw(p) {
      const r = typeof opts.drawResult === 'function' ? opts.drawResult() : opts.drawResult ?? true;
      if (r) { drawn.push((p.content as string)); log.push('draw'); }
      return r;
    },
    clear() { log.push('clear'); },
  };
  const timings: LiveScoreTiming[] = [];
  const live = createLiveScore({
    compute: (data) => new Promise((resolve, reject) => { pendingCompute.push({ data: data as Data, resolve, reject }); }),
    view,
    title: 'bar_001',
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    debounceMs: opts.debounceMs,
    now: () => now,
    onTiming: (t) => timings.push(t),
  });
  const advance = async (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
    await flush();
  };
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const finish = async (tag: string) => { const c = pendingCompute.shift()!; c.resolve(PAYLOAD(tag)); await flush(); return c.data; };
  return { live, advance, flush, finish, pendingCompute, statuses, drawn, log, timings, timers, tick: (ms: number) => { now += ms; } };
}

test('the first draw shows "Rendering score…", then the score, and clears the line', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER);
  await r.flush();
  assert.deepEqual(r.statuses, [SCORE_RENDERING_TEXT]);
  assert.equal(r.pendingCompute.length, 1);
  await r.finish('A');
  assert.deepEqual(r.drawn, ['<score-partwise>A</score-partwise>']);
  assert.deepEqual(r.statuses, [SCORE_RENDERING_TEXT, '']);
});

test('the debounce is 400 ms: edits inside it collapse into ONE engine call with the LATEST data', async () => {
  assert.equal(LIVE_SCORE_DEBOUNCE_MS, 400);
  const r = rig();
  for (let t = 1; t <= 5; t++) { r.live.update(withTempo(100 + t)); await r.advance(100); }       // five edits, 100 ms apart: the timer keeps restarting
  assert.equal(r.pendingCompute.length, 0, 'still debouncing');
  await r.advance(400);
  assert.equal(r.pendingCompute.length, 1, 'one call');
  assert.equal(r.pendingCompute[0].data.tempo_bpm, 105, 'with the latest data');
});

test('rapid edits during a render do not queue renders: at most ONE waits, and it carries the latest data', async () => {
  const r = rig();
  r.live.update(withTempo(101));
  await r.advance(400);                                         // render #1 starts
  assert.equal(r.pendingCompute.length, 1);
  for (let t = 2; t <= 12; t++) { r.live.update(withTempo(100 + t)); await r.advance(450); }   // eleven more edits, each firing the debounce while #1 is still running
  assert.equal(r.pendingCompute.length, 1, 'no second engine call while the first runs');
  const first = await r.finish('one');
  assert.equal(first.tempo_bpm, 101);
  assert.equal(r.pendingCompute.length, 1, 'exactly one render was waiting');
  const second = await r.finish('two');
  assert.equal(second.tempo_bpm, 112, 'the waiting render drew the LATEST data, not each of the eleven');
  assert.equal(r.pendingCompute.length, 0);
});

test('an edit keeps the old score on screen until the new one is ready: no clear, no "Rendering score…" between two scores', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('one');
  r.log.length = 0;
  r.live.update(withTempo(120));
  await r.advance(400);
  assert.deepEqual(r.log, [], 'while the second render runs, nothing on screen changes');
  await r.finish('two');
  assert.deepEqual(r.log, ['draw', 'status:']);
});

test('an invalid bar shows the validator\'s message, takes the stale score away, and does not call the engine', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('one');
  r.log.length = 0;
  r.live.update({ ...RHYTHM_STARTER, steps: 0 });
  await r.advance(400);
  assert.equal(r.pendingCompute.length, 0, 'the engine is not asked about data that does not validate');
  assert.equal(r.log[0], 'clear');
  assert.match(r.log[1], /^status:Score: /, 'the message is the validator\'s, prefixed as the Score view prefixes it');
  r.live.update(withTempo(90));                                  // fixed: the score comes back
  await r.advance(400); await r.finish('three');
  assert.equal(r.drawn.at(-1), '<score-partwise>three</score-partwise>');
});

test('data that is not an object at all is a message, not a crash', async () => {
  const r = rig();
  for (const bad of [null, undefined, 42, 'x', []]) {
    r.log.length = 0;
    r.live.update(bad);
    await r.advance(400);
    assert.equal(r.pendingCompute.length, 0);
    assert.ok(r.log.some((l) => l.startsWith('status:Score: ')), `${JSON.stringify(bad)} -> a message`);
  }
});

test('an engine error is shown as a message (and the score cleared); the next edit tries again', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush();
  r.pendingCompute.shift()!.reject(new Error('boom'));
  await r.flush();
  assert.ok(r.statuses.at(-1)!.includes('boom'), r.statuses.at(-1));
  assert.ok(r.statuses.at(-1)!.startsWith('Score: '));
  r.live.update(withTempo(99)); await r.advance(400); await r.finish('ok');
  assert.equal(r.drawn.length, 1);
});

test('an engine that returns no MusicXML is a message', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush();
  r.pendingCompute.shift()!.resolve({ type: 'text', content: 'x' });
  await r.flush();
  assert.match(r.statuses.at(-1)!, /returned no score/);
});

test('a renderer that is not there (lean build reaching here) says so, and the next try is allowed', async () => {
  let available = false;
  const r = rig({ drawResult: () => available });
  r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('one');
  assert.match(r.statuses.at(-1)!, /music edition/);
  available = true;
  r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('two');      // same data, but the last pass failed, so it is tried again
  assert.equal(r.drawn.length, 1);
});

test('a canvas that throws while drawing is a message and a console.error naming the function; it does not poison the next draw', async () => {
  let boom = true;
  const errors: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const r = rig({ drawResult: () => { if (boom) throw new Error('verovio fell over'); return true; } });
    r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('one');
    assert.match(r.statuses.at(-1)!, /could not draw the score \(verovio fell over\)/);
    boom = false;
    r.live.update(withTempo(88)); await r.advance(400); await r.finish('two');
    assert.equal(r.drawn.length, 1);
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /createLiveScore/);
});

test('dispose: a waiting debounce never fires, a render that finishes afterwards draws nothing, and later edits are ignored', async () => {
  const r = rig();
  r.live.update(withTempo(101));
  r.live.dispose();
  await r.advance(1000);
  assert.equal(r.pendingCompute.length, 0, 'the pending debounce was cancelled');
  const r2 = rig();
  r2.live.showNow(RHYTHM_STARTER); await r2.flush();
  r2.live.dispose();                                              // the tab closed while the engine was working
  await r2.finish('late');
  assert.deepEqual(r2.drawn, [], 'nothing is drawn into a closed tab');
  r2.live.update(withTempo(99)); r2.live.showNow(withTempo(98));
  await r2.advance(1000);
  assert.equal(r2.pendingCompute.length, 0);
  assert.equal(r2.timers.length, 0);
});

test('showNow draws at once and cancels a waiting debounce; the same bar shown twice (open, then the widget\'s ready) is engraved ONCE', async () => {
  const r = rig();
  r.live.update(withTempo(120));
  r.live.showNow(withTempo(121));
  assert.equal(r.timers.length, 0, 'the debounce was cancelled');
  await r.flush();
  assert.equal(r.pendingCompute.length, 1);
  assert.equal(r.pendingCompute[0].data.tempo_bpm, 121);
  r.live.showNow(withTempo(121));                                 // the widget\'s ready -> a second load of the same data
  await r.flush();
  await r.finish('A');
  assert.equal(r.pendingCompute.length, 0, 'no second engine call for the same bar');
  r.live.showNow(withTempo(121));
  await r.flush();
  assert.equal(r.pendingCompute.length, 0, 'still none once it is drawn');
  r.live.showNow(withTempo(122));                                 // a DIFFERENT bar (the note changed on disk): drawn
  await r.flush();
  assert.equal(r.pendingCompute.length, 1);
});

test('an edit that is followed at once by a showNow of the same data engraves it ONCE (an update counts as "this bar is on its way")', async () => {
  const r = rig();
  r.live.update(withTempo(130));
  r.live.showNow(withTempo(130));
  assert.equal(r.timers.length, 1, 'the update\'s debounce is still the only thing waiting');
  await r.advance(400);
  assert.equal(r.pendingCompute.length, 1);
  r.live.showNow(withTempo(130));
  await r.flush();
  assert.equal(r.pendingCompute.length, 1, 'still one');
});

test('a bar that was refused is tried again by showNow (same data, last pass failed)', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush();
  r.pendingCompute.shift()!.reject(new Error('engine warming up'));
  await r.flush();
  r.live.showNow(RHYTHM_STARTER); await r.flush();
  assert.equal(r.pendingCompute.length, 1, 'tried again');
});

test('update always re-engraves (an edit that happens to restore the same data is still an edit)', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush(); await r.finish('A');
  r.live.update(RHYTHM_STARTER);
  await r.advance(400);
  assert.equal(r.pendingCompute.length, 1);
});

test('timing: the whole pass and the engine part are reported, with the outcome', async () => {
  const r = rig();
  r.live.showNow(RHYTHM_STARTER); await r.flush();
  r.tick(35);
  await r.finish('A');
  assert.equal(r.timings.length, 1);
  assert.equal(r.timings[0].outcome, 'score');
  assert.equal(r.timings[0].totalMs, 35);
  assert.equal(r.timings[0].engineMs, 35);
  r.live.update({ ...RHYTHM_STARTER, steps: 0 });
  await r.advance(400);
  assert.equal(r.timings.at(-1)!.outcome, 'refusal');
});

test('the controller reads no note and writes nothing: it has no vault, no file API, only the data it is handed', () => {
  const code = fs.readFileSync(path.join(import.meta.dirname, 'live-score-core.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/vault|\.process\(|\.modify\(|\.create\(|readNote|writeFile|adapter/.test(code));
  const dom = fs.readFileSync(path.join(import.meta.dirname, 'live-score-dom.ts'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/vault|\.process\(|\.modify\(|\.create\(|writeFile|adapter|from 'obsidian'/.test(dom));
});

// score_first M5 (drain 2026-10-22-1850): a phrase reuses THIS scheduler (debounce, one render in flight, the latest request queued) with its own "data -> outcome" step injected, instead of a
// second scheduler. Without `produce` nothing changes (every test above is that case).
test('an injected `produce` replaces the data -> score step: the SAME debounce, one render in flight and superseding apply', async () => {
  const calls: unknown[] = [];
  const pending: Array<(o: unknown) => void> = [];
  let now = 0;
  const timers: Array<{ id: number; at: number; fn: () => void }> = [];
  let nextId = 1;
  const drawn: string[] = [];
  const statuses: string[] = [];
  const live = createLiveScore({
    produce: (data) => { calls.push(data); return new Promise((resolve) => { pending.push(resolve as (o: unknown) => void); }) as never; },
    view: { status: (t) => statuses.push(t), draw: (p) => { drawn.push(p.content as string); return true; }, clear: () => {} },
    title: 'phrase_001',
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  });
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.find((t) => t.at <= now); if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await flush(); };
  live.update({ bars: 4 });
  live.update({ bars: 5 });
  live.update({ bars: 6 });
  await advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.deepEqual(calls, [{ bars: 6 }], 'three rapid edits cost ONE produce call, with the latest data');
  live.update({ bars: 7 });
  await advance(LIVE_SCORE_DEBOUNCE_MS);
  assert.equal(calls.length, 1, 'one render in flight: the next waits behind it');
  pending.shift()!({ kind: 'score', payload: PAYLOAD('six') });
  await flush();
  assert.equal(calls.length, 2, 'the queued request runs when the first finishes');
  pending.shift()!({ kind: 'score', payload: PAYLOAD('seven') });
  await flush();
  assert.deepEqual(drawn.map((d) => /six|seven/.exec(d)![0]), ['six', 'seven']);
  live.update({ bars: 8 });
  await advance(LIVE_SCORE_DEBOUNCE_MS);
  pending.shift()!({ kind: 'refusal', message: 'Phrase: the source bar_009 was not found' });
  await flush();
  assert.equal(statuses.at(-1), 'Phrase: the source bar_009 was not found', 'a refusal from produce is the status line, as for a bar');
  live.dispose();
});

test('createLiveScore needs either `compute` or `produce`: with neither it refuses at creation, naming itself', () => {
  assert.throws(() => createLiveScore({ view: { status() {}, draw: () => true, clear() {} }, title: 't', setTimer: () => 0, clearTimer: () => {} } as never), /createLiveScore: .*compute.*produce/);
});
