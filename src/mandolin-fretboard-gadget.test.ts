// 2026-11-09-1193 - the mandolin fretboard gadget (music-theory: music_instruments/resources/html/mandolin_fretboard.html, synced into the bundle).
// The file is read from the CLIENT's own bundled copy (assets/vaults/music-theory/...), never from the sibling vault's working tree or HEAD (the sibling-pin rule); the bundle-lag step of the matrix is what ties that copy to its source.
//   * the pitch math (the page's own pure block, run as the page runs it): open courses G3 D4 A4 E5 = MIDI 55 62 69 76, each a fifth above the last, the first 12 frets of each course, 15 frets drawn, every tuning system closes at the octave;
//   * the page in a DOM (happy-dom): no console error, 4 courses x 16 positions, fret wires, the position markers (2026-11-10-1195, fret 9 corrected to 10 by 1197: inlay dots at 3 5 7 10 12(double) 15, subtle, behind everything, never a click target, following the tuning), the tuning dropdown (equal temperament default), a click holds a position, Play makes the right oscillators;
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

// ---- 2026-11-10-1195: the position markers (inlay dots) are subtle but there, behind everything, never a click target, and they follow the tuning ----

/** Every claim about the position markers on a page's source, as a list of failures (empty = all hold): properties, not spellings of them. */
function markerFailures(h: string): string[] {
  const bad: string[] = [];
  const p = openPage(h);
  if (p.errors.length) bad.push(`console errors: ${p.errors.join(' | ')}`);
  const svg = p.doc.querySelector('svg');
  const kids = [...svg.children];
  const dots = kids.filter((c: any) => (c.getAttribute('class') || '') === 'inlay');
  const frets = dots.map((c: any) => +c.getAttribute('data-fret'));
  if (JSON.stringify(frets) !== JSON.stringify([3, 5, 7, 10, 12, 12, 15])) bad.push(`marker frets (a double dot at 12): ${JSON.stringify(frets)}`);
  const nums = kids.filter((t: any) => t.tagName.toLowerCase() === 'text').map((t: any) => t.textContent).filter((t: string) => /^\d+$/.test(t));
  if (JSON.stringify(nums) !== JSON.stringify(['0', '3', '5', '7', '10', '12', '15'])) bad.push(`fret numbers: ${JSON.stringify(nums)}`);
  // subtle: the CSS rule gives the text colour at an opacity of about 0.12 to 0.2, no stroke
  const rule = /(?:^|\n)\s*\.inlay\s*\{([^}]*)\}/.exec(h)?.[1] ?? '';   // the rule for `.inlay` ALONE (not the shared transition rule that lists it)
  const op = /fill-opacity:\s*([\d.]+)/.exec(rule)?.[1];
  if (!(op !== undefined && +op >= 0.12 && +op <= 0.2)) bad.push(`fill-opacity ${op} is not within 0.12 to 0.2`);
  if (!/fill:\s*var\(--ink\)/.test(rule)) bad.push('the markers are not the text colour (var(--ink))');
  if (!/stroke:\s*none/.test(rule)) bad.push('a marker has a stroke');
  // never a click target: the CSS and the attribute (a renderer without the CSS still gets it)
  if (!/pointer-events:\s*none/.test(rule)) bad.push('.inlay does not say pointer-events: none');
  for (const d of dots) if (d.getAttribute('pointer-events') !== 'none') bad.push(`marker at fret ${d.getAttribute('data-fret')} does not carry pointer-events="none"`);
  // BEHIND the strings, the nut, the fret wires and every clickable point
  const lastDot = Math.max(...dots.map((d: any) => kids.indexOf(d)));
  const firstOther = Math.min(...kids.filter((c: any) => c.tagName.toLowerCase() === 'line' || (c.getAttribute('class') || '').split(' ').some((k: string) => k === 'pt' || k === 'wire-seg')).map((c: any) => kids.indexOf(c)));
  if (!(lastDot < firstOther)) bad.push(`a marker is drawn after a string, wire or point (last marker ${lastDot}, first of those ${firstOther})`);
  // the board does not change size
  if (svg.getAttribute('viewBox') !== '0 0 760 186') bad.push(`viewBox ${svg.getAttribute('viewBox')} is not 0 0 760 186`);
  // they follow the tuning dropdown like the wire segments and points do: the mean of the two courses they sit between
  const sel = p.doc.getElementById('tuning');
  const wire = (f: number, s: number): number => parseFloat(p.doc.querySelector(`.wire-seg[data-fret="${f}"][data-string="${s}"]`).style.transform.replace('translateX(', ''));
  const tr = (d: any): number => parseFloat((d.style.transform || 'translateX(0px)').replace('translateX(', ''));
  sel.value = 'pythagorean'; sel.dispatchEvent(new p.win.Event('change'));
  const g = pure(scriptOf(h));
  let moved = 0;
  g.inlayPlan().forEach((plan: any, i: number) => {
    const want = (wire(plan.fret, plan.between[0]) + wire(plan.fret, plan.between[1])) / 2;
    if (Math.abs(tr(dots[i]) - want) > 1e-6) bad.push(`marker ${i} (fret ${plan.fret}) is at ${tr(dots[i])}, not ${want}`);
    if (Math.abs(want) > 1e-6) moved++;
  });
  if (moved < 3) bad.push(`in Pythagorean only ${moved} markers moved: they do not follow the tuning`);
  sel.value = 'equal'; sel.dispatchEvent(new p.win.Event('change'));
  for (const d of dots) if (Math.abs(tr(d)) > 1e-9) bad.push(`equal temperament: the marker at fret ${d.getAttribute('data-fret')} is not back on the base line`);
  return bad;
}

test('position markers: inlay dots at the mandolin frets 3 5 7 10 12(double) 15 with their fret numbers; subtle (0.12-0.2 of the text colour, no stroke); behind strings, wires and points; never a click target; the board keeps its size; they follow the tuning dropdown', () => {
  assert.deepEqual(markerFailures(html), []);
});

test('position markers: the plan puts every dot between two ADJACENT courses, singles between D4 and A4, the octave one between each outer pair', () => {
  const g = pure();
  assert.deepEqual([...g.INLAY_FRETS], [3, 5, 7, 10, 12, 15]);
  const plan = [...g.inlayPlan()].map((d: any) => [d.fret, [...d.between]]);   // spread: the page's arrays come from the vm context
  assert.deepEqual(plan, [[3, [1, 2]], [5, [1, 2]], [7, [1, 2]], [10, [1, 2]], [12, [2, 3]], [12, [1, 2]], [15, [1, 2]]]);
  for (const d of g.inlayPlan()) assert.equal(d.between[1] - d.between[0], 1, `fret ${d.fret}: adjacent courses`);
});

// (That a click inside a marker really reaches the position under it is a HIT-TEST, which a DOM without layout cannot do: it was proved in real Chrome in 1195's FEEDBACK. Here the property that guarantees it, pointer-events none, is pinned above.)

test('CONTROL: the marker checks can fail - fret 10 written as 9, a marker without pointer-events none, a marker drawn on top, a loud marker, or markers that ignore the tuning each go red', () => {
  assert.deepEqual(markerFailures(html), [], 'the undamaged page passes');
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `the control's premise: the page contains ${from}`); return html.replace(from, to); };
  assert.ok(markerFailures(damaged('var INLAY_FRETS = [3, 5, 7, 10, 12, 15];', 'var INLAY_FRETS = [3, 5, 7, 9, 12, 15];')).length > 0, 'the guitar fret 9 instead of the mandolin 10');
  assert.ok(markerFailures(damaged('"pointer-events": "none" }, svg);\n    inlays.push', '}, svg);\n    inlays.push')).length > 0, 'no pointer-events attribute');
  assert.ok(markerFailures(damaged('fill-opacity: 0.16; stroke: none; pointer-events: none;', 'fill-opacity: 0.9; stroke: none; pointer-events: none;')).length > 0, 'a loud marker');
  assert.ok(markerFailures(damaged('fill-opacity: 0.16; stroke: none; pointer-events: none;', 'fill-opacity: 0.16; stroke: #000; pointer-events: none;')).length > 0, 'a marker with a stroke');
  assert.ok(markerFailures(damaged('d.el.style.transform = "translateX(" + ((a + b) / 2 - fretXBase(d.fret)) + "px)";', '')).length > 0, 'markers that do not follow the tuning');
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

// ---- 2026-11-10-1196 (EXPERIMENT): the score of the held notes - a small pure-JS treble staff under the fretboard ----------------------------------------------

/** Pitch -> staff position from the published rule (treble clef, E4 on the bottom line, one step per line or space), written here independently of the page. */
const LETTER_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];                  // C C# D D# E F F# G G# A A# B -> C=0 .. B=6 (sharps only)
const staffPosOf = (midi: number): number => 7 * (Math.floor(midi / 12) - 1) + LETTER_OF_PC[midi % 12] - 30;
/** Every claim about the score on a page's source, as a list of failures (empty = all hold): where each head sits, the ledger lines, the sharps, the high-note names, the links, the toggle. */
function scoreFailures(h: string): string[] {
  try { return scoreFailuresOf(h); } catch (e) { return [`threw: ${String(e)}`]; }
}
function scoreFailuresOf(h: string): string[] {
  const bad: string[] = [];
  const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = openPage(h);
  const doc = p.doc, score = doc.getElementById('score');
  ok('page loads clean', p.errors.length === 0);
  ok('a Score toggle, ON by default, and the score visible', doc.getElementById('bS')?.getAttribute('aria-pressed') === 'true' && doc.getElementById('scoreWrap')?.hidden === false);
  ok('empty: no noteheads, collapsed to 90', doc.querySelectorAll('.nh').length === 0 && score.getAttribute('viewBox') === '0 0 760 90');
  const lineY = (): number[] => [...doc.querySelectorAll('.staffline')].map((l: any) => +l.getAttribute('y1'));
  const headY = (label: string): number => +doc.querySelector(`.nh[aria-label^="${label}"] .head`).getAttribute('cy');
  // the three positions of the prompt's proof: an open string (G3), fret 7 (B5) and the highest fret (G6) of the E course
  for (const l of ['G3, course 1, fret 0', 'B5, course 4, fret 7', 'G6, course 4, fret 15']) click(p, `.pt[aria-label="${l}"]`);
  const nhs = [...doc.querySelectorAll('.nh')];
  ok('three noteheads, lowest first, aria-labelled with the neck position', JSON.stringify(nhs.map((n: any) => n.getAttribute('aria-label'))) === JSON.stringify(['G3, course 1, fret 0, below the staff', 'B5, course 4, fret 7, above the staff', 'G6, course 4, fret 15, above the staff']));
  ok('written pitch spacing: each position is half a space (5) lower per step', headY('G6') - headY('B5') === -(staffPosOf(91) - staffPosOf(83)) * 5 && headY('G3') - headY('B5') === (staffPosOf(83) - staffPosOf(55)) * 5);
  ok('the collapsed staff grew by exactly the ledger room (G3 .. G6 = 135)', score.getAttribute('viewBox') === '0 0 760 135');
  ok('ledger lines for G3 (-2 -4) and G6 / B5 (10 12 14 16)', JSON.stringify([...doc.querySelectorAll('.ledger')].map((l: any) => +l.getAttribute('data-pos'))) === '[-4,-2,10,12,14,16]');
  ok('the written name beside notes ABOVE the staff only', JSON.stringify([...doc.querySelectorAll('.nh')].map((n: any) => n.querySelector('.wname')?.textContent.trim() ?? null)) === '[null,"B5","G6"]');
  ok('the neck-position labels', JSON.stringify([...doc.querySelectorAll('.nh .lab')].map((t: any) => t.textContent.replace(/\s+/g, ' ').trim())) === JSON.stringify(['course 1, fret 0', 'B5 course 4, fret 7', 'G6 course 4, fret 15']));
  // heads sit ON the right line: E4 (bottom line), G4 (second line), F5 (top line), and C4 (middle C, on its ledger line)
  click(p, '.pt[aria-label="G3, course 1, fret 0"]'); click(p, '.pt[aria-label="B5, course 4, fret 7"]'); click(p, '.pt[aria-label="G6, course 4, fret 15"]');
  ok('released: empty again', doc.querySelectorAll('.nh').length === 0);
  for (const l of ['E4, course 2, fret 2', 'G4, course 2, fret 5', 'F5, course 3, fret 8']) click(p, `.pt[aria-label="${l}"]`);
  const ly = lineY();
  ok('five staff lines, 10 apart', ly.length === 5 && ly.every((y, i) => i === 0 || Math.abs(ly[i - 1] - y) === 10));
  ok('E4 on the bottom line, G4 on the second, F5 on the top', headY('E4') === ly[0] && headY('G4') === ly[1] && headY('F5') === ly[4]);
  ok('no ledger line inside the staff', doc.querySelectorAll('.ledger').length === 0 && doc.getElementById('score').getAttribute('viewBox') === '0 0 760 90');
  click(p, '.pt[aria-label="E4, course 2, fret 2"]'); click(p, '.pt[aria-label="G4, course 2, fret 5"]'); click(p, '.pt[aria-label="F5, course 3, fret 8"]');
  // sharps: one spelling rule, sharps only; a sharp is drawn, a natural is not; a second and a unison do not overlap
  for (const l of ['A#4, course 3, fret 1', 'A4, course 3, fret 0', 'G4, course 1, fret 12', 'G4, course 2, fret 5']) click(p, `.pt[aria-label="${l}"]`);
  const sh = (label: string) => doc.querySelector(`.nh[aria-label^="${label}"]`).querySelectorAll('.sharp').length;
  ok('a sharp glyph on A#4 only', sh('A#4') === 1 && sh('A4,') === 0);
  ok('never a flat in any label', ![...doc.querySelectorAll('.nh')].some((n: any) => /\b[A-G]b\d/.test(n.getAttribute('aria-label'))));
  const cx = (i: number) => +doc.querySelectorAll('.nh')[i].querySelector('.head').getAttribute('cx');
  ok('the unison G4 / G4 and the second A4 / A#4 never share a column', cx(2) !== cx(3) && cx(0) !== cx(1));
  // hover / focus lights the other side, both ways; leaving puts it out
  const nh = doc.querySelector('.nh[aria-label^="G4, course 1"]'), pt = doc.querySelector('.pt[aria-label="G4, course 1, fret 12"]');
  const fire = (el: any, t: string) => el.dispatchEvent(new p.win.MouseEvent(t));
  fire(nh, 'mouseenter'); ok('hover a notehead lights its fretboard point', pt.classList.contains('link')); fire(nh, 'mouseleave'); ok('...and leaving puts it out', !pt.classList.contains('link'));
  fire(pt, 'mouseenter'); ok('hover a fretboard point lights its notehead', doc.querySelector('.nh[aria-label^="G4, course 1"]').classList.contains('link')); fire(pt, 'mouseleave');
  // keyboard: one Tab stop, arrow keys move; the toggle hides and restores
  const stops = () => [...doc.querySelectorAll('.nh')].filter((n: any) => n.getAttribute('tabindex') === '0').length;
  ok('the noteheads are a single Tab stop', stops() === 1);
  const first = doc.querySelector('.nh'); first.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  ok('ArrowUp moves to the next higher note and keeps one Tab stop', stops() === 1 && doc.querySelectorAll('.nh')[1].getAttribute('tabindex') === '0');
  doc.getElementById('bS').click();
  ok('the Score toggle hides it', doc.getElementById('scoreWrap').hidden === true && doc.getElementById('bS').getAttribute('aria-pressed') === 'false');
  doc.getElementById('bS').click();
  ok('...and shows it again, redrawn', doc.getElementById('scoreWrap').hidden === false && doc.querySelectorAll('.nh').length === 4);
  doc.getElementById('bC').click();
  ok('Clear empties the score', doc.querySelectorAll('.nh').length === 0 && !!doc.querySelector('.empty'));
  ok('the page still loads clean after all that', p.errors.length === 0);
  return bad;
}

test('score: staff positions follow the treble-clef rule for every position of the neck (G3 .. G6), ledger lines exactly where a note needs them, sharps only', () => {
  const g = pure(), bad: string[] = [];
  for (let s = 0; s < 4; s++) for (let f = 0; f <= 15; f++) {
    const m = g.midiAt(s, f), pos = g.staffPos(m);
    if (pos !== staffPosOf(m)) bad.push(`pos of ${g.midiToName(m)}: ${pos} !== ${staffPosOf(m)}`);
    const led = [...g.ledgerPositions(pos)], want = [];
    for (let q = -2; q >= pos; q -= 2) want.push(q);
    for (let q = 10; q <= pos; q += 2) want.push(q);
    if (JSON.stringify(led) !== JSON.stringify(want)) bad.push(`ledger of ${g.midiToName(m)}: ${led}`);
    if (g.midiToName(m).includes('b')) bad.push(`a flat: ${g.midiToName(m)}`);
  }
  assert.deepEqual(bad, []);
  // known anchors, from the definition of the clef (not from the page): E4 bottom line, F5 top line, middle C on a ledger, D4 just under the staff with none, A5 the first ledger above, G6 four above
  const at = (m: number) => [g.staffPos(m), [...g.ledgerPositions(g.staffPos(m))]];
  assert.deepEqual(at(64), [0, []]); assert.deepEqual(at(77), [8, []]); assert.deepEqual(at(60), [-2, [-2]]); assert.deepEqual(at(62), [-1, []]);
  assert.deepEqual(at(81), [10, [10]]); assert.deepEqual(at(83), [11, [10]]); assert.deepEqual(at(91), [16, [10, 12, 14, 16]]); assert.deepEqual(at(55), [-5, [-2, -4]]);
});

test('score: the layout is 90 high until a note needs more room, stacks a chord in one column (a second or a unison steps aside), and keeps the labels apart', () => {
  const g = pure(), L = (keys: string[]) => g.scoreLayout(new Set(keys));
  assert.equal(L([]).height, 90);
  assert.equal(L(['1:5', '2:0']).height, 90, 'G4 and A4, in the staff');
  assert.equal(L(['1:2']).height, 90, 'E4 on the bottom line');
  assert.equal(L(['0:0']).height, 105, 'G3: three more half-spaces below the collapsed room (15)');
  assert.equal(L(['3:15']).height, 120, 'G6: six more above (30)');
  assert.equal(L(['0:0', '3:15']).height, 135);
  const c = L(['1:5', '0:12', '2:0', '2:1']);   // G4 twice (a unison), A4, A#4 (a second above A4)
  assert.deepEqual(c.notes.map((n: any) => n.name), ['G4', 'G4', 'A4', 'A#4']);
  assert.deepEqual([...new Set(c.notes.map((n: any) => n.x))].length > 1, true);
  for (const a of c.notes) for (const b of c.notes) if (a !== b && a.x === b.x) assert.ok(Math.abs(a.pos - b.pos) >= 2, `${a.name} and ${b.name} overlap in one column`);
  const ys = c.notes.map((n: any) => n.ly).sort((a: number, b: number) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 12, 'labels at least 12 apart');
  assert.ok(c.height >= ys[ys.length - 1], 'the labels fit inside the drawing');
});

test('score: on the page - the heads sit on the right lines, ledger lines, sharps, names beside the high notes, hover and focus link both ways, one Tab stop, the Score toggle', () => {
  assert.deepEqual(scoreFailures(html), []);
});

test('score: self-contained - no network, no Verovio, no import, and it is marked EXPERIMENT so it is easy to remove; the tuning system does not change the notes written', () => {
  const noNs = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  assert.ok(!/https?:|\/\/[a-z0-9.-]+\.[a-z]{2,}\/|fetch\(|XMLHttpRequest|import\(|<script[^>]+src|verovio/i.test(noNs), 'nothing is loaded from anywhere');
  assert.ok(/EXPERIMENT 1196/.test(html) && /written pitch = sounding pitch/i.test(html), 'marked EXPERIMENT, and the written = sounding rule is stated');
  const p = openPage();
  click(p, '.pt[aria-label="B5, course 4, fret 7"]');
  const before = p.doc.getElementById('score').innerHTML;
  const sel = p.doc.getElementById('tuning'); sel.value = 'pythagorean'; sel.dispatchEvent(new p.win.Event('change'));
  assert.equal(p.doc.getElementById('score').innerHTML, before, 'the score names equal-tempered pitches whatever the fret geometry');
});

test('CONTROL: the score checks can fail - every note a step off, no first ledger line above, no side-stepping of seconds, no names for high notes, a score that never updates, a dead hover link each go red', () => {
  assert.deepEqual(scoreFailures(html), [], 'the undamaged page passes');
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `the control's premise: the page contains ${from}`); return html.replace(from, to); };
  assert.ok(scoreFailures(damaged('+ LETTER_STEP[name.charAt(0)] - 30;', '+ LETTER_STEP[name.charAt(0)] - 29;')).length > 0, 'a step off');
  assert.ok(scoreFailures(damaged('for (p = 10; p <= pos; p += 2) out.push(p);', 'for (p = 12; p <= pos; p += 2) out.push(p);')).length > 0, 'no first ledger above');
  assert.ok(scoreFailures(damaged('colTop[c] !== undefined && n.pos - colTop[c] < 2', 'false')).length > 0, 'seconds overlap');
  assert.ok(scoreFailures(damaged('above: pos > 8', 'above: pos > 12')).length > 0, 'no name beside B5');
  assert.ok(scoreFailures(damaged('if (!scoreWrap.hidden) drawScore();', '')).length > 0, 'a score that never updates');
  assert.ok(scoreFailures(damaged('g.addEventListener("mouseenter", function () { lightPoint(q.key, true); });', '')).length > 0, 'a dead hover link');
});

// ---- 2026-11-11-1197: the mandolin page embeds the gadget tall enough for the score ----------------------------------------------------------------------------
const PAGE = path.join(ROOT, 'assets/vaults/music-theory/music_instruments/mandolin.md');
test('the mandolin page embeds the gadget at a height that holds the tallest score (pins a MEASURED value, real Chrome 2026-11-11: 457 with G3 and G6 held; if the gadget changes height this SHOULD go red - re-measure, do not just rewrite)', () => {
  const m = /```html-embed\n(\S+mandolin_fretboard\.html)\n(\d+)\n```/.exec(fs.readFileSync(PAGE, 'utf8'));
  assert.ok(m, 'the page embeds mandolin_fretboard.html with a height line');
  assert.ok(+m![2] >= 457, `embed height ${m![2]} would clip the staff (tallest measured: 457)`);
  assert.ok(+m![2] <= 500, `embed height ${m![2]} leaves a large blank (tallest measured: 457)`);
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
