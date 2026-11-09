// 2026-11-09-1193 - the mandolin fretboard gadget (music-theory: music_instruments/resources/html/mandolin_fretboard.html, synced into the bundle).
// The file is read from the CLIENT's own bundled copy (assets/vaults/music-theory/...), never from the sibling vault's working tree or HEAD (the sibling-pin rule); the bundle-lag step of the matrix is what ties that copy to its source.
//   * the pitch math (the page's own pure block, run as the page runs it): open courses G3 D4 A4 E5 = MIDI 55 62 69 76, each a fifth above the last, the first 12 frets of each course, 15 frets drawn, every tuning system closes at the octave;
//   * the page in a DOM (happy-dom): no console error, 4 courses x 16 positions, fret wires, markers at 5 7 10 12 15, the tuning dropdown (equal temperament default), a click holds a position, Play makes the right oscillators;
//   * a CONTROL that fails: the same checks on the page with one tuning constant wrong, and with the semitone ratio wrong, go red (so the checks can fail);
//   * P3: the other gadgets are byte-identical to the commit this drain started from (a pinned commit of THIS repo, not a moving tree).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { Window } from 'happy-dom';

import { pinSkipReason } from './test-support/sibling-pin.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_DIR = 'assets/vaults/music-theory/music_instruments/resources/html';
const GADGET = path.join(ROOT, HTML_DIR, 'mandolin_fretboard.html');
const html = fs.readFileSync(GADGET, 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];

/** The page's pure-math block as the node harness sees it (no `document`, so the script exports it). `source` lets a control run a damaged copy. */
function pure(source: string = scriptOf(html)): any {
  const mod: { exports: any } = { exports: {} };
  vm.runInNewContext(source, { module: mod, Math, Array, Set, Float32Array });
  return mod.exports;
}

const NAMES = ['G3', 'D4', 'A4', 'E5'];
/** Every claim about the pitch math, as a list of failures (empty = all hold). Independent of the page: the numbers are the published ones (mandolin = violin tuning), not read back from the page. */
function pitchFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('open courses (MIDI)', g.TUNING, [55, 62, 69, 76]);
  eq('open course names', g.TUNING.map((m: number) => g.midiToName(m)), NAMES);
  for (let s = 1; s < g.TUNING.length; s++) eq(`course ${s + 1} a fifth above course ${s}`, g.TUNING[s] - g.TUNING[s - 1], 7);
  // published equal-tempered frequencies of the four open courses (A4 = 440 Hz): G3 196.00, D4 293.66, A4 440.00, E5 659.26
  eq('open course Hz', [0, 1, 2, 3].map((s) => +g.hzAt(s, 0, 'equal').toFixed(2)), [196.0, 293.66, 440.0, 659.26]);
  eq('frets drawn', g.FRETS, 15);
  for (let s = 0; s < 4; s++) {
    for (let f = 0; f <= 12; f++) {
      eq(`MIDI at course ${s + 1} fret ${f}`, g.midiAt(s, f), g.TUNING[s] + f);
      const hz = g.hzAt(s, f, 'equal'), want = 440 * Math.pow(2, (g.TUNING[s] + f - 69) / 12);
      if (Math.abs(hz - want) > 1e-9) bad.push(`Hz at course ${s + 1} fret ${f}: ${hz} !== ${want}`);
    }
    const oct = g.hzAt(s, 12, 'equal') / g.hzAt(s, 0, 'equal');
    if (Math.abs(oct - 2) > 1e-12) bad.push(`course ${s + 1}: fret 12 is not an octave (${oct})`);
  }
  return bad;
}

// ---- the pitch math -------------------------------------------------------------------------------------------------------------------------------------------

test('mandolin pitch math: open courses G3 D4 A4 E5 (MIDI 55 62 69 76), each a fifth above the previous, frets 0-12 of every course, 15 frets drawn', () => {
  assert.deepEqual(pitchFailures(pure()), []);
});

test('every tuning system lands fret 12 on the octave of the open course (the chain closes), and the other frets sit where the system puts them', () => {
  const g = pure();
  assert.deepEqual([...g.SYSTEMS], ['equal', 'pythagorean', 'meantone', 'well']);   // spread: the page's arrays come from the vm context
  for (const sys of g.SYSTEMS) {
    for (let s = 0; s < 4; s++) {
      assert.ok(Math.abs(g.hzAt(s, 12, sys) / g.hzAt(s, 0, sys) - 2) < 1e-9, `${sys}: course ${s + 1} fret 12 is an octave`);
      assert.ok(Math.abs(g.hzAt(s, 0, sys) - 440 * Math.pow(2, (g.TUNING[s] - 69) / 12)) < 1e-9, `${sys}: open courses are the same in every system`);
    }
  }
  // Pythagorean: G3 fret 7 (D) is a pure 3:2 fifth above the open G; equal temperament's is 2^(7/12)
  // (the Pythagorean table is given to 0.01 cent, as in the lute gadget it is copied from, so the ratio is 3:2 to about 1e-5, not to machine precision)
  assert.ok(Math.abs(g.hzAt(0, 7, 'pythagorean') / g.hzAt(0, 0, 'pythagorean') - 1.5) < 1e-4);
  assert.ok(Math.abs(g.hzAt(0, 7, 'equal') / g.hzAt(0, 0, 'equal') - Math.pow(2, 7 / 12)) < 1e-12);
  // meantone: a major third (4 frets) above an open course is the pure 5:4
  assert.ok(Math.abs(g.hzAt(1, 4, 'meantone') / g.hzAt(1, 0, 'meantone') - 1.25) < 1e-3);
  // rotational asymmetry is the point: the SAME fret number gives different cents on different courses in Pythagorean (fret 6: G and D give the 611.73-cent tritone, A and E the 588.26-cent one - the wolf sits between them)
  assert.equal(+g.fretCents(6, 'pythagorean', 55 % 12).toFixed(2), 611.73);
  assert.equal(+g.fretCents(6, 'pythagorean', 69 % 12).toFixed(2), 588.26);
  assert.equal(g.fretCents(6, 'equal', 7), g.fretCents(6, 'equal', 9), 'equal temperament does not depend on the course');
});

test('planPlay: together is one onset, ascending / descending are staggered low-to-high and high-to-low, nothing held is nothing; the current system sounds', () => {
  const g = pure();
  const held = new Set([g.posKey(3, 0), g.posKey(0, 0), g.posKey(1, 7)]);       // E5, G3, A4 (D4 fret 7 = 69)
  assert.deepEqual(g.planPlay(held, 'together', 'equal').map((n: any) => [n.midi, n.when]), [[55, 0], [69, 0], [76, 0]]);
  assert.deepEqual(g.planPlay(held, 'up', 'equal').map((n: any) => [n.midi, n.when]), [[55, 0], [69, 0.2], [76, 0.4]]);
  assert.deepEqual(g.planPlay(held, 'down', 'equal').map((n: any) => [n.midi, n.when]), [[76, 0], [69, 0.2], [55, 0.4]]);
  assert.deepEqual(g.planPlay(new Set(), 'together', 'equal'), []);
  assert.notEqual(g.planPlay(new Set([g.posKey(0, 4)]), 'together', 'pythagorean')[0].hz, g.planPlay(new Set([g.posKey(0, 4)]), 'together', 'equal')[0].hz);
});

test('CONTROL: the checks can fail - a wrong tuning constant, a wrong semitone ratio, a wrong fret count each turn the pitch checks red', () => {
  const src = scriptOf(html);
  const damaged = (from: string, to: string): string => { assert.ok(src.includes(from), `the control's premise: the page contains ${from}`); return src.replace(from, to); };
  assert.deepEqual(pitchFailures(pure()), [], 'the undamaged page passes');
  assert.ok(pitchFailures(pure(damaged('var TUNING = [55, 62, 69, 76];', 'var TUNING = [55, 62, 69, 75];'))).length > 0, 'E5 written as Eb5');
  assert.ok(pitchFailures(pure(damaged('var TUNING = [55, 62, 69, 76];', 'var TUNING = [55, 62, 69, 74];'))).length > 0, 'a fourth, not a fifth');
  assert.ok(pitchFailures(pure(damaged('(m - 69) / 12)', '(m - 69) / 11)'))).length > 0, 'a wrong semitone ratio');
  assert.ok(pitchFailures(pure(damaged('var FRETS = 15;', 'var FRETS = 12;'))).length > 0, 'a wrong fret count');
});

// ---- the page, in a DOM ---------------------------------------------------------------------------------------------------------------------------------------

type Page = { win: any; doc: any; errors: string[]; osc: number[] };
function openPage(h: string = html): Page {
  const errors: string[] = [], osc: number[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.addEventListener('error', (e: any) => errors.push(String(e.message ?? e)));
  class Ctx {
    currentTime = 0; state = 'running'; destination = {};
    createPeriodicWave() { return {}; }
    createGain() { const p = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }); return { gain: p(), connect() {} }; }
    createOscillator() { const o = { frequency: { value: 0 }, setPeriodicWave() {}, connect() {}, start() { osc.push(o.frequency.value); }, stop() {} }; return o; }
    resume() {}
  }
  win.AudioContext = Ctx; win.Float32Array = Float32Array;
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], ''));
  win.eval(m[1]);
  return { win, doc: win.document, errors, osc };
}
const click = (p: Page, sel: string) => p.doc.querySelector(sel).dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
const held = (p: Page): string[] => [...p.doc.querySelectorAll('.pt')].filter((e: any) => e.getAttribute('aria-pressed') === 'true').map((e: any) => e.getAttribute('aria-label'));

test('the page loads without a console error: 4 courses x 16 positions (frets 0-15), 15 fret wires per course, the open-course labels, the tuning dropdown on equal temperament', () => {
  const p = openPage();
  assert.deepEqual(p.errors, []);
  assert.equal(p.doc.querySelectorAll('.pt').length, 4 * 16);
  assert.equal(p.doc.querySelectorAll('.wire-seg').length, 4 * 15);
  assert.ok(p.doc.getElementById('nut'));
  const labels = [...p.doc.querySelectorAll('svg > text')].map((t: any) => t.textContent);
  for (const n of NAMES) assert.ok(labels.includes(n), `open course label ${n}`);
  const sel = p.doc.getElementById('tuning');
  assert.equal(sel.value, 'equal');
  assert.deepEqual([...sel.options].map((o: any) => o.value), ['equal', 'pythagorean', 'meantone', 'well']);
  for (const id of ['bT', 'bU', 'bD', 'bC']) assert.ok(p.doc.getElementById(id), id);
  assert.match(p.doc.querySelector('svg').getAttribute('aria-label'), /G3 D4 A4 E5/);
});

test('fret markers at 5 7 10 12 15 (a double marker at 12), the fret numbers drawn on the neck', () => {
  const p = openPage();
  const nums = [...p.doc.querySelectorAll('svg > text')].map((t: any) => t.textContent).filter((t: string) => /^\d+$/.test(t));
  assert.deepEqual(nums, ['0', '5', '7', '10', '12', '15']);
  const dots = [...p.doc.querySelectorAll('svg > circle')].filter((c: any) => c.getAttribute('r') === '5' && c.getAttribute('fill') === '#F2F2EC');
  assert.equal(dots.length, 4 + 2, 'four single markers (5 7 10 15) and the two of the octave marker');
});

test('a click holds a position (and a second click lets it go), Clear releases all, Play together sounds the held pitches in equal temperament, ascending in order', () => {
  const p = openPage();
  click(p, '.pt[aria-label="G3, course 1, fret 0"]');
  click(p, '.pt[aria-label="A4, course 2, fret 7"]');
  assert.deepEqual(held(p), ['G3, course 1, fret 0', 'A4, course 2, fret 7']);
  click(p, '.pt[aria-label="A4, course 2, fret 7"]');
  assert.deepEqual(held(p), ['G3, course 1, fret 0']);
  click(p, '.pt[aria-label="E5, course 4, fret 0"]');
  p.doc.getElementById('bT').click();
  assert.deepEqual(p.osc.map((hz) => +hz.toFixed(2)), [196.0, 659.26], 'two oscillators: G3 and E5');
  p.osc.length = 0;
  p.doc.getElementById('bU').click();
  assert.deepEqual(p.osc.map((hz) => +hz.toFixed(2)), [196.0, 659.26]);
  p.osc.length = 0;
  p.doc.getElementById('bD').click();
  assert.deepEqual(p.osc.map((hz) => +hz.toFixed(2)), [659.26, 196.0], 'descending: the high one first');
  p.doc.getElementById('bC').click();
  assert.deepEqual(held(p), []);
  p.osc.length = 0;
  p.doc.getElementById('bT').click();
  assert.deepEqual(p.osc, [], 'nothing held plays nothing');
  assert.deepEqual(p.errors, []);
});

test('the tuning dropdown moves each course\'s own frets (a zigzag in Pythagorean), keeps what is held, and equal temperament puts every fret back on the straight line', () => {
  const p = openPage();
  const sel = p.doc.getElementById('tuning');
  const shift = (f: number, s: number): string => p.doc.querySelector(`.wire-seg[data-fret="${f}"][data-string="${s}"]`).style.transform;
  click(p, '.pt[aria-label="B4, course 3, fret 2"]');
  sel.value = 'pythagorean'; sel.dispatchEvent(new p.win.Event('change'));
  const row = [0, 1, 2, 3].map((s) => shift(6, s));
  assert.ok(new Set(row).size > 1, `fret 6 breaks into a zigzag across the courses: ${row}`);
  assert.deepEqual(held(p), ['B4, course 3, fret 2'], 'a held position survives a switch');
  p.doc.getElementById('bT').click();
  assert.equal(+p.osc[0].toFixed(3), +(440 * Math.pow(2, (203.91 - 0) / 1200)).toFixed(3), 'the held B4 sounds as the Pythagorean second above A (203.91 cents)');
  sel.value = 'equal'; sel.dispatchEvent(new p.win.Event('change'));
  for (let f = 1; f <= 15; f++) for (let s = 0; s < 4; s++) assert.match(shift(f, s), /^translateX\(-?0(\.0+)?px\)$/, `equal: fret ${f} course ${s + 1} is on the base line`);
  assert.deepEqual(p.errors, []);
});

test('CONTROL: the DOM checks can fail - the page with the tuning constant wrong labels a different open course, and one with a fret missing draws fewer positions', () => {
  const src = html;
  const wrong = openPage(src.replace('var TUNING = [55, 62, 69, 76];', 'var TUNING = [55, 62, 69, 75];'));
  const labels = [...wrong.doc.querySelectorAll('svg > text')].map((t: any) => t.textContent);
  assert.ok(!labels.includes('E5'), 'with E5 written as Eb5 the open label E5 is gone');
  const short = openPage(src.replace('var FRETS = 15;', 'var FRETS = 12;'));
  assert.notEqual(short.doc.querySelectorAll('.pt').length, 4 * 16);
});

// ---- P3: the other gadgets are untouched --------------------------------------------------------------------------------------------------------------------

/** The commit of THIS repo the drain started from: the other gadgets are compared with their text there, never with a moving tree. */
const START_SHA = 'a673d54';
const skipReason = pinSkipReason(ROOT, START_SHA, 'this repo');
for (const other of ['guitar_fretboard.html', 'lute_fretboard.html', 'monochord.html', 'piano_keyboard.html', 'piano_keyboard_c_major_triad.html', 'rhythm_box.html']) {
  test(`P3: ${other} is byte-identical to the commit the drain started from`, { skip: skipReason ?? false }, () => {
    const was = execFileSync('git', ['-C', ROOT, 'show', `${START_SHA}:${HTML_DIR}/${other}`], { maxBuffer: 64 * 1024 * 1024 });
    assert.ok(Buffer.compare(was, fs.readFileSync(path.join(ROOT, HTML_DIR, other))) === 0, `${other} changed`);
  });
}
test('P3 control: the comparison can fail - a gadget compared with a DIFFERENT gadget\'s text is not byte-identical', { skip: skipReason ?? false }, () => {
  const lute = execFileSync('git', ['-C', ROOT, 'show', `${START_SHA}:${HTML_DIR}/lute_fretboard.html`], { maxBuffer: 64 * 1024 * 1024 });
  assert.ok(Buffer.compare(lute, fs.readFileSync(path.join(ROOT, HTML_DIR, 'guitar_fretboard.html'))) !== 0);
});
