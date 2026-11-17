// 2026-11-17-2000 - the adapter between the Score's one row and html-midi-player's element: Play and Pause, Back to the start, a tempo change (also in the middle of playing: the place is kept), and the
// state events the row listens to. A fake element with the surface the real one has (playing, currentTime, noteSequence, start, stop, 'start'/'stop' events).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTransportPlayer, type MidiElementLike } from './score-player-adapter.ts';

const LEAD = 0.15;
const base = () => ({ totalTime: LEAD + 4, notes: [{ startTime: LEAD, endTime: LEAD + 1, pitch: 60 }, { startTime: LEAD + 1, endTime: LEAD + 4, pitch: 64 }] });

function fakeElement() {
  const log: string[] = []; const handlers: Record<string, (() => void)[]> = { start: [], stop: [] };
  let seq: any = base(); const el: any = {
    playing: false, currentTime: 0,
    get noteSequence() { return seq; }, set noteSequence(v: any) { seq = v; log.push('sequence'); },
    start() { log.push(`start@${el.currentTime}`); el.playing = true; handlers.start.forEach((h) => h()); },
    stop() { log.push('stop'); el.playing = false; handlers.stop.forEach((h) => h()); },
    addEventListener(t: string, fn: () => void) { handlers[t].push(fn); }, removeEventListener(t: string, fn: () => void) { const i = handlers[t].indexOf(fn); if (i >= 0) handlers[t].splice(i, 1); },
  };
  return { el: el as MidiElementLike & { currentTime: number; playing: boolean }, log, finish: () => { el.playing = false; handlers.stop.forEach((h) => h()); }, seqNow: () => seq };
}

test('start and stop go straight to the element; Back to the start stops it and puts the clock at 0 (playing or not)', () => {
  const f = fakeElement(); const t = createTransportPlayer(f.el, base(), LEAD);
  assert.equal(t.player.playing, false); t.player.start(); assert.equal(t.player.playing, true); f.el.currentTime = 2.5; t.player.stop(); assert.equal(f.el.playing, false); assert.equal(f.el.currentTime, 2.5, 'pausing keeps the place');
  t.player.start(); t.player.reset(); assert.equal(f.el.playing, false); assert.equal(f.el.currentTime, 0); t.player.reset(); assert.equal(f.el.currentTime, 0);
});

test('state changes: the row hears start and stop (also a stop the element makes by itself at the end), and can stop listening', () => {
  const f = fakeElement(); const t = createTransportPlayer(f.el, base(), LEAD); const seen: boolean[] = []; const off = t.player.onStateChange((p) => seen.push(p));
  t.player.start(); f.finish(); t.player.start(); t.player.stop(); assert.deepEqual(seen, [true, false, true, false]); off(); t.player.start(); assert.equal(seen.length, 4);
});

test('tempo while stopped: a new stretched sequence goes in, the clock keeps its place in the music (a clock of 0 stays 0), nothing is started', () => {
  const f = fakeElement(); const t = createTransportPlayer(f.el, base(), LEAD); assert.equal(t.tempoPct(), 100);
  t.player.setTempo(50); assert.equal(t.tempoPct(), 50); assert.deepEqual(f.log, ['sequence']); const s = f.seqNow(); assert.ok(Math.abs(s.notes[1].startTime - (LEAD + 2)) < 1e-9); assert.ok(Math.abs(s.totalTime - (LEAD + 8)) < 1e-9);
  assert.equal(f.el.currentTime, 0); assert.equal(f.el.playing, false);
  f.el.currentTime = LEAD + 3; t.player.setTempo(100); assert.ok(Math.abs(f.el.currentTime - (LEAD + 1.5)) < 1e-9, 'half-speed score second 1.5 is full-speed second 1.5? (3 at 50 percent is 1.5 of music)');
});

test('tempo while playing: it stops, swaps the sequence, puts the clock at the same place in the music and plays on', () => {
  const f = fakeElement(); const t = createTransportPlayer(f.el, base(), LEAD); t.player.start(); f.el.currentTime = LEAD + 2; f.log.length = 0;
  t.player.setTempo(50);
  assert.deepEqual(f.log.map((l) => l.replace(/@.*/, '')), ['stop', 'sequence', 'start']); assert.ok(Math.abs(f.el.currentTime - (LEAD + 4)) < 1e-9, 'two seconds of music is four seconds at half speed'); assert.equal(f.el.playing, true);
  t.player.setTempo(200); assert.ok(Math.abs(f.el.currentTime - (LEAD + 1)) < 1e-9);
});

test('the base sequence is never touched, and 100 percent gives back an equal copy', () => {
  const f = fakeElement(); const b = base(); const snap = JSON.stringify(b); const t = createTransportPlayer(f.el, b, LEAD); t.player.setTempo(75); t.player.setTempo(100);
  assert.equal(JSON.stringify(b), snap); assert.deepEqual(f.seqNow(), b); assert.equal(t.tempoPct(), 100);
});

test('the clock for a click on the score: a note at score second s is at clock s x factor, so click-to-play lands on it at any tempo', () => {
  const f = fakeElement(); const t = createTransportPlayer(f.el, base(), LEAD); assert.equal(t.clockForScoreSeconds(2), 2); t.player.setTempo(50); assert.equal(t.clockForScoreSeconds(2), 4); t.player.setTempo(200); assert.equal(t.clockForScoreSeconds(2), 1);
});
