// 2026-11-19-0850 - the five scale exercise gadgets count how many (scale, home note) pairs have been COMPLETED: built within the level's wrong taps, at any level; in memory only (a reload resets it, like the score). A quiet line under the staff area says "Completed 3 of 12" (N = the scales
// the file offers x 12 home notes); the two single-scale files also show the twelve home notes as chips that fill in when completed (chips are not buttons); when every pair is done one gentle line says so. A completed pair stays completed when the same pair is later failed; Reset clears the count
// of the file; the word is "completed", never "passed". Pinned here: the pure counter (pairs, N per file, a repeat counts once, a failure does not uncount, Reset), the line and the chips in a DOM with real clicks, the words, the shared block identical in the five files. How TALL each file is with the line
// and the chips (no vertical scroll at 800 and 360 px) is measured in real Chrome: scripts/dev/measure-scale-exercises.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
// the file, how many scales it offers (so N = scales x 12)
const FILES: Array<[string, number]> = [['scale_build_major.html', 1], ['scale_build_natural_minor.html', 1], ['scale_build_modes_and_minor.html', 10], ['scale_build_other_scales.html', 6], ['scale_ear_build_the_scale.html', 7]];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const g = (f = 'scale_build_major.html'): any => pureOf(scriptOf(read(f)));

test('the pure counter: a pair is (scale, home note); N is the scales of the file x 12; a repeat completion counts once; a failure does not uncount; the original is never changed', () => {
  for (const [f, n] of FILES) {
    const x = g(f); same(x.exTotal(x.SCALES), n * 12, `${f}: N`); assert.equal(x.SCALES.length, n);
    const none = {}; const one = x.exCompletedAdd(none, 3, x.SCALES[0]); assert.equal(x.exCompletedCount(none), 0, 'immutable'); assert.equal(x.exCompletedCount(one), 1);
    const again = x.exCompletedAdd(one, 3, x.SCALES[0]); assert.equal(x.exCompletedCount(again), 1, 'a repeat counts once'); assert.equal(x.exCompletedCount(x.exCompletedAdd(again, 4, x.SCALES[0])), 2);
    if (n > 1) assert.equal(x.exCompletedCount(x.exCompletedAdd(one, 3, x.SCALES[1])), 2, 'the same home note in another scale is another pair');
    assert.equal(x.exCompletedCount(x.exCompletedAdd(none, 0, 'no_such_scale')), 0, 'a scale this file does not offer is not counted');
    assert.equal(x.exCompletedCount(x.exCompletedAdd(none, 12, x.SCALES[0])), 0, 'nor is a home note outside 0..11'); assert.equal(x.exCompletedCount(x.exCompletedAdd(none, -1, x.SCALES[0])), 0);
  }
});

test('the words: "Completed 3 of 12" for a single-scale file, the scales and home notes said for the others; all done is one gentle line; never "passed"', () => {
  const x = g(); let d: any = {}; assert.equal(x.exCompletedText(d, x.SCALES), 'Completed 0 of 12'); for (const t of [0, 5, 7]) d = x.exCompletedAdd(d, t, 'major'); assert.equal(x.exCompletedText(d, x.SCALES), 'Completed 3 of 12'); assert.equal(x.exAllDone(d, x.SCALES), false);
  for (let t = 0; t < 12; t++) d = x.exCompletedAdd(d, t, 'major'); assert.equal(x.exAllDone(d, x.SCALES), true); assert.equal(x.exCompletedText(d, x.SCALES), 'All twelve built.');
  const m = g('scale_build_modes_and_minor.html'); assert.equal(m.exCompletedText({}, m.SCALES), 'Completed 0 of 120 (10 scales, 12 home notes each)');
  const e = g('scale_ear_build_the_scale.html'); assert.equal(e.exCompletedText(e.exCompletedAdd({}, 2, 'dorian'), e.SCALES), 'Completed 1 of 84 (7 scales, 12 home notes each)');
  const o = g('scale_build_other_scales.html'); let all: any = {}; for (const s of o.SCALES) for (let t = 0; t < 12; t++) all = o.exCompletedAdd(all, t, s); assert.equal(o.exAllDone(all, o.SCALES), true); assert.equal(o.exCompletedText(all, o.SCALES), 'All 72 built.');
  same(x.exHomesDone(d, 'major'), Array(12).fill(true)); same(x.exHomesDone(x.exCompletedAdd({}, 4, 'major'), 'major'), [...Array(12).keys()].map((i) => i === 4));
  for (const [f] of FILES) { const h = read(f); const code = scriptOf(h).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n'); assert.doesNotMatch(code + h.replace(/<script>[\s\S]*?<\/script>/, ''), /\bpassed\b/i, `${f}: "passed" is not the word (comments aside: the piano voice has a band-passed noise)`); }
});

// ---- the pages: real DOM, real clicks ---------------------------------------------------------------------------------------------------------------------------------------
function open(file: string, seed = 11) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  win.__schedule = () => 1; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document, x = pureOf(m[1]);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const sel = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const level = () => ['easy', 'medium', 'hard'].find((l) => doc.getElementById('level-' + l).getAttribute('aria-pressed') === 'true')!;
  const model = () => x.exStart(+doc.getElementById('tonic').value, doc.getElementById('scale').value, level());
  const key = (m: number) => doc.querySelector(`.key[data-midi="${m}"]`);
  const finish = () => { for (const m of x.exTargets(model())) { const k = key(m); if (k && !k.classList.contains('lit')) click(k); } };
  const wrongKey = () => { const m = model(); for (let k = m.notes[0] + 1; k < m.notes[m.notes.length - 1]; k++) if (m.notes.indexOf(k) < 0) return key(k); throw new Error('no wrong key'); };
  const text = (id: string) => doc.getElementById(id).textContent.trim();
  return { win, doc, errors, x, click, sel, level, finish, wrongKey, text, homes: () => [...doc.querySelectorAll('#homes .home')] as any[], done: () => [...doc.querySelectorAll('#homes .home.done')].length };
}

for (const [f, n] of FILES) {
  test(`${f}: the line "Completed 0 of ${n * 12}" is there from the start; ${n === 1 ? 'twelve home-note chips (not buttons) show which keys remain' : 'there are no chips (many scales: the line says what N is)'}`, () => {
    const p = open(f); assert.deepEqual(p.errors, []); const line = p.text('completed');
    assert.match(line, n === 1 ? /^Completed 0 of 12$/ : new RegExp(`^Completed 0 of ${n * 12} \\(${n} scales, 12 home notes each\\)$`));
    if (n === 1) {
      assert.equal(p.homes().length, 12); assert.equal(p.done(), 0); assert.equal(p.doc.querySelectorAll('#homes button').length, 0, 'chips are not buttons'); assert.equal(p.doc.getElementById('homes').getAttribute('role'), 'list');
      assert.ok(p.homes().every((c: any) => c.getAttribute('role') === 'listitem' && !c.hasAttribute('tabindex') && !c.hasAttribute('title')), 'quiet chips: no focus stop, no tooltip');
      assert.deepEqual(p.homes().map((c: any) => c.textContent), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((t) => p.x.tonicName(t, p.x.SCALES[0])), 'the twelve home notes, named as the page names them');
    } else assert.equal(p.doc.querySelectorAll('#homes .home').length, 0);
  });
}

test('scale_build_major: building a scale completes its home note (the line and its chip fill in), at any level; the same pair again counts once; failing it later does not uncount; another home note is another pair', () => {
  const p = open('scale_build_major.html'); p.click(p.doc.getElementById('level-easy')); p.sel('tonic', '7'); p.finish();
  assert.equal(p.text('completed'), 'Completed 1 of 12'); assert.equal(p.done(), 1); assert.ok(p.homes()[7].classList.contains('done')); assert.equal(p.homes()[7].textContent, 'G');
  p.click(p.doc.getElementById('again')); p.sel('tonic', '7'); p.finish(); assert.equal(p.text('completed'), 'Completed 1 of 12', 'built again: still one pair');
  p.click(p.doc.getElementById('level-hard')); p.sel('tonic', '7'); p.click(p.wrongKey()); assert.match(p.text('prompt'), /^Exercise over/); assert.equal(p.text('completed'), 'Completed 1 of 12', 'a failed attempt does not uncount a completed pair');
  p.sel('tonic', '2'); p.click(p.wrongKey()); assert.equal(p.text('completed'), 'Completed 1 of 12', 'a failed pair is not counted'); assert.equal(p.done(), 1);
  p.click(p.doc.getElementById('level-medium')); p.sel('tonic', '2'); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 12'); assert.equal(p.done(), 2);
});

test('Reset clears the count of the file (and its chips) with the score; all twelve built says so in one gentle line', () => {
  const p = open('scale_build_natural_minor.html'); p.click(p.doc.getElementById('level-easy'));
  for (let t = 0; t < 12; t++) { p.sel('tonic', String(t)); p.finish(); }
  assert.equal(p.text('completed'), 'All twelve built.'); assert.equal(p.done(), 12);
  p.click(p.doc.getElementById('reset')); assert.equal(p.text('completed'), 'Completed 0 of 12'); assert.equal(p.done(), 0); assert.match(p.text('board'), /Easy 0\/0/);
});

test('a file with many scales counts (scale, home note) pairs: the same home note in two scales is two', () => {
  const p = open('scale_build_modes_and_minor.html'); p.click(p.doc.getElementById('level-easy')); p.sel('scale', 'dorian'); p.sel('tonic', '2'); p.finish();
  assert.equal(p.text('completed'), 'Completed 1 of 120 (10 scales, 12 home notes each)'); p.sel('scale', 'phrygian'); p.sel('tonic', '2'); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 home notes each)');
  p.sel('scale', 'dorian'); p.sel('tonic', '2'); p.finish(); assert.equal(p.text('completed'), 'Completed 2 of 120 (10 scales, 12 home notes each)', 'the same pair again');
});

test('the five files carry the same exercise core (the counter is in it) and the generator\'s only differences are the config block and the title', () => {
  const core = (h: string) => { const a = h.indexOf('  // ==== exercise core BEGIN'), e = h.indexOf('  // ==== exercise core END'); assert.ok(a > 0 && e > a); return h.slice(a, e); };
  const first = core(read(FILES[0][0])); assert.match(first, /function exCompletedAdd/);
  for (const [f] of FILES) assert.equal(core(read(f)), first, f);
});
