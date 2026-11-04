// 2026-11-04-1170 (Scale Explorer 1 of 4): the WebAudio sound of the `forge-scale` block, against a fake AudioContext and fake timers. Nothing makes a context until the first play; a stop silences every oscillator and cancels the hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { playEvents } from './scale-explorer-core.ts';
import { createScaleSound, maxOverlap, midiToHz, peakGain, type AudioLike, type OscillatorLike, type ScaleSoundEnv } from './scale-explorer-sound.ts';

function fake() {
  const oscs: (OscillatorLike & { startedAt?: number; stoppedAt?: number | 'now'; hz: number })[] = [];
  let contexts = 0;
  const gains: { calls: [string, number, number][] }[] = [];
  const ctx: AudioLike = {
    currentTime: 10,
    destination: { dest: true },
    resume: async () => {},
    createOscillator: () => {
      const o: any = { type: '', frequency: { value: 0 }, connect: () => {}, disconnect: () => {}, start(t: number) { o.startedAt = t; }, stop(t?: number) { o.stoppedAt = t ?? 'now'; } };
      Object.defineProperty(o, 'hz', { get: () => o.frequency.value });
      oscs.push(o);
      return o;
    },
    createGain: () => {
      const g = { calls: [] as [string, number, number][] };
      gains.push(g);
      return { gain: { setValueAtTime: (v: number, t: number) => { g.calls.push(['set', v, t]); }, linearRampToValueAtTime: (v: number, t: number) => { g.calls.push(['ramp', v, t]); } }, connect: () => {}, disconnect: () => {} };
    },
  };
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let n = 0;
  const env: ScaleSoundEnv = {
    getContext: () => { contexts++; return ctx; },
    setTimeout: (fn, ms) => { timers.set(++n, { fn, ms }); return n; },
    clearTimeout: (h) => { timers.delete(h as number); },
  };
  const run = (upToMs: number) => { for (const [k, t] of [...timers].sort((a, b) => a[1].ms - b[1].ms)) if (t.ms <= upToMs && timers.has(k)) { timers.delete(k); t.fn(); } };
  return { env, oscs, gains, timers, run, contexts: () => contexts };
}

const hooksLog = () => {
  const log: string[] = [];
  return { log, hooks: { onNoteOn: (m: number) => log.push(`on ${m}`), onNoteOff: (m: number) => log.push(`off ${m}`), onEnd: () => log.push('end') } };
};

test('midiToHz: A4 is 440, middle C 261.63, an octave doubles', () => {
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(midiToHz(60) - 261.6256) < 0.001);
  assert.ok(Math.abs(midiToHz(81) / midiToHz(69) - 2) < 1e-9);
});

test('the gain is lower when 8 notes sound together than when one at a time, and never above 0.4', () => {
  const mid = [60, 62, 64, 65, 67, 69, 71, 72];
  assert.equal(maxOverlap(playEvents(mid, 'up')), 1);
  assert.equal(maxOverlap(playEvents(mid, 'together')), 8);
  assert.ok(peakGain(playEvents(mid, 'together')) < peakGain(playEvents(mid, 'up')));
  assert.ok(peakGain(playEvents(mid, 'up')) <= 0.4);
});

test('creating the sound makes no AudioContext and no oscillator (nothing sounds on mount)', () => {
  const f = fake();
  createScaleSound(f.env);
  assert.equal(f.contexts(), 0);
  assert.equal(f.oscs.length, 0);
});

test('play up: one oscillator per note at the note\'s frequency, started one after the other from the context clock', () => {
  const f = fake();
  const s = createScaleSound(f.env);
  const { hooks } = hooksLog();
  s.play(playEvents([60, 62, 64, 65, 67, 69, 71, 72], 'up'), hooks);
  assert.equal(f.contexts(), 1);
  assert.equal(f.oscs.length, 8);
  assert.deepEqual(f.oscs.map((o) => Math.round(o.hz * 100) / 100), [60, 62, 64, 65, 67, 69, 71, 72].map((m) => Math.round(midiToHz(m) * 100) / 100));
  const starts = f.oscs.map((o) => o.startedAt!);
  assert.ok(starts[0] >= 10, 'on the context clock');
  assert.ok(starts.every((t, i) => i === 0 || t > starts[i - 1]));
  assert.ok(f.oscs.every((o) => o.type === 'triangle'));
});

test('play together starts all 8 at the same instant', () => {
  const f = fake();
  createScaleSound(f.env).play(playEvents([60, 64, 67, 72], 'together'), hooksLog().hooks);
  assert.equal(new Set(f.oscs.map((o) => o.startedAt)).size, 1);
});

test('the hooks fire from the timers: note on at its start, note off at its end, then the end of the plan', () => {
  const f = fake();
  const { log, hooks } = hooksLog();
  createScaleSound(f.env).play(playEvents([60, 62], 'up'), hooks);
  assert.deepEqual(log, []);
  f.run(0);
  assert.deepEqual(log, ['on 60']);
  f.run(1000);
  assert.deepEqual(log, ['on 60', 'off 60', 'on 62', 'off 62', 'end']);
});

test('stop silences every oscillator at once, cancels the timers and does not call the hooks', () => {
  const f = fake();
  const { log, hooks } = hooksLog();
  const s = createScaleSound(f.env);
  s.play(playEvents([60, 62, 64], 'up'), hooks);
  f.run(0);
  s.stop();
  assert.ok(f.oscs.every((o) => o.stoppedAt === 'now'), 'each oscillator got an immediate stop');
  assert.equal(f.timers.size, 0, 'no timer is left to fire a late hook');
  f.run(10_000);
  assert.deepEqual(log, ['on 60'], 'nothing after the stop');
});

test('a new play first silences the one before; a context that cannot be made is reported and does not throw', () => {
  const f = fake();
  const s = createScaleSound(f.env);
  s.play(playEvents([60], 'up'), hooksLog().hooks);
  s.play(playEvents([62], 'up'), hooksLog().hooks);
  assert.equal(f.oscs[0].stoppedAt, 'now');
  const broken = createScaleSound({ ...f.env, getContext: () => { throw new Error('This browser has no WebAudio.'); } });
  const saved = console.error;
  const seen: unknown[][] = [];
  console.error = (...a: unknown[]) => { seen.push(a); };
  try { assert.doesNotThrow(() => broken.play(playEvents([60], 'up'), hooksLog().hooks)); } finally { console.error = saved; }
  assert.equal(seen.length, 1);
});
