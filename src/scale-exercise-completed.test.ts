// 2026-11-19-0850 - the five scale exercise gadgets count how many (scale, tonic) pairs have been COMPLETED: built within the wrong taps; in memory only (a reload resets it). A quiet line under the staff area says "Completed 3 of 12" (N = the scales
// the file offers x 12 tonics); the files also show the twelve tonics as slots of a shelf that fill in when completed (2026-11-19-0938: with a mini score; the shelf itself is pinned in src/scale-shelf.test.ts); when every pair is done one gentle line says so. A completed pair stays completed when the same pair is later failed; Reset clears the count
// of the file; the word is "completed", never "passed". 2026-11-18-0930: in the two single-scale (SIMPLE) files the slots of the shelf are BUTTONS and the chooser (a tap starts that key); the three FULL files are driven by selects and levels as before. Pinned here: the pure counter (pairs, N per file,
// a repeat counts once, a failure does not uncount, Reset), the line and the chips in a DOM with real clicks (chip taps in the SIMPLE files, selects and levels in the FULL ones), the words, the counter code identical in the five files and the exercise core identical within each group.
// How TALL each file is (no vertical scroll at 800 and 360 px) is measured in real Chrome: scripts/dev/measure-scale-exercises.mjs (FULL), scripts/dev/measure-scale-build-simple.mjs (SIMPLE).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { EXERCISE_DIR } from './test-support/scale-exercise-dir.ts';
import { pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const DIR = EXERCISE_DIR;                                   // the bundled vault, or the vault source when SCALE_EXERCISE_VAULT is set (src/test-support/scale-exercise-dir.ts)
// the file, how many scales it offers (so N = scales x 12)
const FILES: Array<[string, number]> = [['scale_build_major.html', 1], ['scale_build_natural_minor.html', 1], ['scale_build_modes_and_minor.html', 10], ['scale_build_other_scales.html', 6], ['scale_ear_build_the_scale.html', 7]];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const g = (f = 'scale_build_major.html'): any => pureOf(scriptOf(read(f)));

test('the pure counter: a pair is (scale, tonic); N is the scales of the file x 12; a repeat completion counts once; a failure does not uncount; the original is never changed', () => {
  for (const [f, n] of FILES) {
    const x = g(f); same(x.exTotal(x.SCALES), n * 12, `${f}: N`); assert.equal(x.SCALES.length, n);
    const none = {}; const one = x.exCompletedAdd(none, 3, x.SCALES[0]); assert.equal(x.exCompletedCount(none), 0, 'immutable'); assert.equal(x.exCompletedCount(one), 1);
    const again = x.exCompletedAdd(one, 3, x.SCALES[0]); assert.equal(x.exCompletedCount(again), 1, 'a repeat counts once'); assert.equal(x.exCompletedCount(x.exCompletedAdd(again, 4, x.SCALES[0])), 2);
    if (n > 1) assert.equal(x.exCompletedCount(x.exCompletedAdd(one, 3, x.SCALES[1])), 2, 'the same tonic in another scale is another pair');
    assert.equal(x.exCompletedCount(x.exCompletedAdd(none, 0, 'no_such_scale')), 0, 'a scale this file does not offer is not counted');
    assert.equal(x.exCompletedCount(x.exCompletedAdd(none, 12, x.SCALES[0])), 0, 'nor is a tonic outside 0..11'); assert.equal(x.exCompletedCount(x.exCompletedAdd(none, -1, x.SCALES[0])), 0);
  }
});

test('the words: "Completed 3 of 12" for a single-scale file, the scales and tonics said for the others; all done is one gentle line; never "passed"', () => {
  const x = g(); let d: any = {}; assert.equal(x.exCompletedText(d, x.SCALES), 'Completed 0 of 12'); for (const t of [0, 5, 7]) d = x.exCompletedAdd(d, t, 'major'); assert.equal(x.exCompletedText(d, x.SCALES), 'Completed 3 of 12'); assert.equal(x.exAllDone(d, x.SCALES), false);
  for (let t = 0; t < 12; t++) d = x.exCompletedAdd(d, t, 'major'); assert.equal(x.exAllDone(d, x.SCALES), true); assert.equal(x.exCompletedText(d, x.SCALES), 'All twelve built.');
  const m = g('scale_build_modes_and_minor.html'); assert.equal(m.exCompletedText({}, m.SCALES), 'Completed 0 of 120 (10 scales, 12 tonics each)');
  const e = g('scale_ear_build_the_scale.html'); assert.equal(e.exCompletedText(e.exCompletedAdd({}, 2, 'dorian'), e.SCALES), 'Completed 1 of 84 (7 scales, 12 tonics each)');
  const o = g('scale_build_other_scales.html'); let all: any = {}; for (const s of o.SCALES) for (let t = 0; t < 12; t++) all = o.exCompletedAdd(all, t, s); assert.equal(o.exAllDone(all, o.SCALES), true); assert.equal(o.exCompletedText(all, o.SCALES), 'All 72 built.');
  same(x.exHomesDone(d, 'major'), Array(12).fill(true)); same(x.exHomesDone(x.exCompletedAdd({}, 4, 'major'), 'major'), [...Array(12).keys()].map((i) => i === 4));
  for (const [f] of FILES) { const h = read(f); const code = scriptOf(h).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n'); assert.doesNotMatch(code + h.replace(/<script>[\s\S]*?<\/script>/, ''), /\bpassed\b/i, `${f}: "passed" is not the word (comments aside: the piano voice has a band-passed noise)`); }
});

// ---- the pages: real DOM, real clicks ---------------------------------------------------------------------------------------------------------------------------------------
// ONE driver for both kinds of page: the SIMPLE files (no #levels) are driven by tapping the slots of the shelf, the FULL files by their selects and level buttons.
function open(file: string, seed = 11) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  win.__schedule = () => 1; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document, x = pureOf(m[1]); const simple = !doc.getElementById('levels');
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const sel = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const chip = (t: number) => doc.querySelectorAll('#shelf .slot')[t];
  const level = () => ['easy', 'medium', 'hard'].find((l) => doc.getElementById('level-' + l).getAttribute('aria-pressed') === 'true')!;
  // the key on screen: a SIMPLE page's is the slot marked current; a FULL page's the selects
  const tonicNow = (): number => simple ? [...doc.querySelectorAll('#shelf .slot')].findIndex((c: any) => c.classList.contains('current')) : +doc.getElementById('tonic').value;
  const model = () => x.exStart(tonicNow(), simple ? x.SCALES[0] : doc.getElementById('scale').value, simple ? undefined : level());
  /** start the key (slot tap; select change on a FULL page) */
  const start = (t: number) => { if (simple) click(chip(t)); else sel('tonic', String(t)); };
  /** the level: FULL pages only; the SIMPLE ones have ONE rule (3 wrong taps = the former medium) */
  const setLevel = (l: string) => { if (!simple) click(doc.getElementById('level-' + l)); };
  const key = (mm: number) => doc.querySelector(`.key[data-midi="${mm}"]`);
  const finish = () => { for (const mm of x.exTargets(model())) { const k = key(mm); if (k && !k.classList.contains('lit')) click(k); } };
  const wrongKey = () => { const mo = model(); for (let k = mo.notes[0] + 1; k < mo.notes[mo.notes.length - 1]; k++) if (mo.notes.indexOf(k) < 0) return key(k); throw new Error('no wrong key'); };
  /** end the build as failed: the wrong taps the rule allows (SIMPLE: 3; FULL: the level's) */
  const fail = () => { const mo = model(); const n = simple ? 3 : { easy: 5, medium: 3, hard: 1 }[level()]!; let tapped = 0; for (let k = mo.notes[0] + 1; k < mo.notes[mo.notes.length - 1] && tapped < n; k++) if (mo.notes.indexOf(k) < 0) { click(key(k)); tapped++; } assert.equal(tapped, n, 'enough wrong keys in the octave'); };
  const text = (id: string) => doc.getElementById(id).textContent.trim();
  return { win, doc, errors, x, simple, click, sel, level, setLevel, start, finish, fail, wrongKey, text, homes: () => [...doc.querySelectorAll('#shelf .slot')] as any[], done: () => [...doc.querySelectorAll('#shelf .slot.done')].length };
}

for (const [f, n] of FILES) {
  test(`${f}: the line "Completed 0 of ${n * 12}" is there from the start; the shelf of twelve slots (buttons: the chooser) shows which tonics remain${n === 1 ? '' : ' (of the scale chosen: the line says what N is)'}`, () => {
    const p = open(f); assert.deepEqual(p.errors, []); const line = p.text('completed');
    assert.match(line, n === 1 ? /^Completed 0 of 12$/ : new RegExp(`^Completed 0 of ${n * 12} \\(${n} scales, 12 tonics each\\)$`));
    assert.equal(p.simple, n === 1, 'the two single-scale files are the SIMPLE variant');
    assert.equal(p.homes().length, 12); assert.equal(p.done(), 0); assert.equal(p.doc.querySelectorAll('#shelf button.slot').length, 12, 'the slots are buttons: tapping one starts that key'); assert.equal(p.doc.getElementById('shelf').getAttribute('role'), 'group');
    assert.ok(p.homes().every((c: any) => c.getAttribute('type') === 'button' && !c.hasAttribute('title') && !c.hasAttribute('aria-label')), 'buttons, no tooltip');
    assert.deepEqual(p.homes().map((c: any) => c.querySelector('.nm').textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, p.simple ? p.x.SCALES[0] : p.doc.getElementById('scale').value)), 'the twelve tonics, named as the page names them');
  });
}

test('scale_build_major (slots) and the FULL major page (selects and levels): building a scale completes its tonic (the line and its slot fill in); the same pair again counts once; failing it later does not uncount; another home note is another pair', () => {
  const p = open('scale_build_major.html'); p.start(7); p.finish();
  assert.equal(p.text('completed'), 'Completed 1 of 12'); assert.equal(p.done(), 1); assert.ok(p.homes()[7].classList.contains('done')); assert.equal(p.homes()[7].querySelector('.nm').textContent, 'G major');
  p.start(7); assert.equal(p.text('completed'), 'Completed 1 of 12', '2026-11-19-0955: a tap on the slot of a completed key SHOWS its scale (it used to restart the build): it is not built, or counted, again'); assert.match(p.text('prompt'), /^Exercise done: you built G major/);
  p.start(4); p.fail(); assert.match(p.text('prompt'), /^Exercise over/); assert.equal(p.text('completed'), 'Completed 1 of 12', 'a failed attempt of another key does not uncount a completed pair'); assert.ok(p.homes()[7].classList.contains('done'), 'its slot stays filled');
  p.start(2); p.fail(); assert.equal(p.text('completed'), 'Completed 1 of 12', 'a failed pair is not counted'); assert.equal(p.done(), 1);
  p.start(2); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 12'); assert.equal(p.done(), 2);
  // the FULL page drives the same flow with its selects and levels (a FULL file whose first scale is major)
  const q = open('scale_ear_build_the_scale.html'); q.setLevel('easy'); q.start(7); q.finish(); assert.equal(q.text('completed'), 'Completed 1 of 84 (7 scales, 12 tonics each)');
  q.click(q.doc.getElementById('again')); q.start(7); q.finish(); assert.equal(q.text('completed'), 'Completed 1 of 84 (7 scales, 12 tonics each)', 'built again: still one pair');
  q.setLevel('hard'); q.start(7); q.fail(); assert.match(q.text('prompt'), /^Exercise over/); assert.equal(q.text('completed'), 'Completed 1 of 84 (7 scales, 12 tonics each)', 'a failed attempt does not uncount a completed pair');
});

test('Reset clears the count of the file (and its slots) and, in the SIMPLE files, the build on screen; all twelve built says so in one gentle line', () => {
  const p = open('scale_build_natural_minor.html');
  for (let t = 0; t < 12; t++) { p.start(t); p.finish(); }
  assert.equal(p.text('completed'), 'All twelve built.'); assert.equal(p.done(), 12);
  p.click(p.doc.getElementById('reset')); assert.equal(p.text('completed'), 'Completed 0 of 12'); assert.equal(p.done(), 0); assert.equal(p.text('prompt'), 'Pick a tonic (home note).'); assert.equal(p.doc.querySelectorAll('.slot.current').length, 0);
});

test('a file with many scales counts (scale, tonic) pairs: the same tonic in two scales is two', () => {
  const p = open('scale_build_modes_and_minor.html'); p.click(p.doc.getElementById('level-easy')); p.sel('scale', 'dorian'); p.sel('tonic', '2'); p.finish();
  assert.equal(p.text('completed'), 'Completed 1 of 120 (10 scales, 12 tonics each)'); p.sel('scale', 'phrygian'); p.sel('tonic', '2'); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 tonics each)');
  p.sel('scale', 'dorian'); p.sel('tonic', '2'); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 tonics each)', 'the same pair again');
});

test('the counter code is identical in all five files, and the exercise core is identical within each group (the 3 FULL files, the 2 SIMPLE files)', () => {
  const core = (h: string) => { const a = h.indexOf('  // ==== exercise core BEGIN'), e = h.indexOf('  // ==== exercise core END'); assert.ok(a > 0 && e > a); return h.slice(a, e); };
  const counter = (h: string) => { const c = core(h); const a = c.indexOf('  function exPairKey'), e = c.indexOf('\n  }\n', c.indexOf('function exCompletedText')); assert.ok(a > 0 && e > a); return c.slice(a, e); };
  const first = counter(read(FILES[0][0])); assert.match(first, /function exCompletedAdd/); assert.ok(first.length > 900, 'non-vacuity');
  for (const [f] of FILES) assert.equal(counter(read(f)), first, `${f}: the counter`);
  for (const group of [FILES.slice(0, 2), FILES.slice(2)]) { const ref = core(read(group[0][0])); for (const [f] of group) assert.equal(core(read(f)), ref, f); }
});
