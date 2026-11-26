// 2026-11-25-1041 (Part A) - the drawing `circle_of_fifths/resources/images/fifths_on_a_line.svg`: all the notes of two octaves on a LINE (24 piano keys, C to B twice, sharps only), and two curved arrows above the keys, both left to right, never folding back:
// C to G in the first octave and B to F-sharp in the second (a fifth is seven half steps; the driver wrote "B to G#", and a fifth up from B is F#: the drawing reads it so). Pinned here: the file is well-formed XML; 24 key shapes and 24 labels in the right order;
// exactly two arrow paths with an arrowhead; arrow 1 ends on the G key, arrow 2 starts on the B key and ends on the second-octave F-sharp key, both end to the right of where they start and above the keys; the two arrows differ by more than colour (one dashed);
// the octave marks; the words for a screen reader (role img + aria-label saying F sharp); a solid panel and the wheel's palette and font; no script and nothing external; about 600 px wide; the captions.json entry exists and the file is exactly what the caption
// script writes for it; the bundle's copy (once the vault is synced) equals the live one. The vault is read from ~/projects/music-theory (the wheel's tests do the same); a missing FILE is a failure, only a missing vault skips.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Window } from 'happy-dom';

import * as C from '../scripts/dev/caption-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIVE = path.join(os.homedir(), 'projects/music-theory'), BUNDLE = path.join(ROOT, 'assets/vaults/music-theory');
const REL = 'circle_of_fifths/resources/images/fifths_on_a_line.svg', WHEEL = 'circle_of_fifths/resources/images/circle_of_fifths_wheel.svg';
const haveVault = fs.existsSync(LIVE);
const skip = haveVault ? false : 'the music-theory vault is not on this machine';
const file = (root: string, rel = REL): string => fs.readFileSync(path.join(root, rel), 'utf8');
const doc = (svg: string): any => new new Window().DOMParser().parseFromString(svg, 'image/svg+xml');
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'], TWO = [...NOTES, ...NOTES];
const num = (e: any, a: string): number => Number(e.getAttribute(a));
const keys = (d: any): any[] => [...d.querySelectorAll('rect.key')].sort((a: any, b: any) => num(a, 'data-i') - num(b, 'data-i'));
const centre = (k: any): number => num(k, 'x') + num(k, 'width') / 2;
// an arrow's path "M x y C x y x y x y": the first and the last point
const ends = (p: any): { x0: number; y0: number; x1: number; y1: number } => { const n = (p.getAttribute('d') as string).match(/-?\d+(?:\.\d+)?/g)!.map(Number); return { x0: n[0], y0: n[1], x1: n[n.length - 2], y1: n[n.length - 1] }; };

test('1041 A: the file exists in the vault, is well-formed XML (xmllint) and is an svg with a viewBox', { skip }, () => {
  const p = path.join(LIVE, REL); assert.ok(fs.existsSync(p), `${REL} is missing`);
  const r = spawnSync('xmllint', ['--noout', p], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  const d = doc(file(LIVE)); assert.equal(d.documentElement.tagName, 'svg'); assert.match(d.documentElement.getAttribute('viewBox'), /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
});

test('1041 A: 24 key shapes, 14 white and 10 black, and 24 labels in the order of the keys: C to B, then C to B again, sharps only', { skip }, () => {
  const d = doc(file(LIVE)), ks = keys(d);
  assert.equal(ks.length, 24); assert.equal(d.querySelectorAll('rect.key.white').length, 14); assert.equal(d.querySelectorAll('rect.key.black').length, 10);
  assert.deepEqual(ks.map((k: any) => k.getAttribute('data-note')), TWO, 'the keys, in pitch order');
  assert.deepEqual(ks.map((k: any) => k.getAttribute('class').includes('black')), TWO.map((n) => n.includes('♯')), 'the black keys are the sharps');
  const labels = [...d.querySelectorAll('text.keylabel')]; assert.equal(labels.length, 24);
  const byX = [...labels].sort((a: any, b: any) => num(a, 'x') - num(b, 'x')); assert.deepEqual(byX.map((t: any) => t.textContent), TWO, 'left to right the labels read C C♯ D ... B, twice');
  for (const k of ks) { const t = labels.find((l: any) => num(l, 'data-i') === num(k, 'data-i')); assert.ok(t, 'a label for every key'); assert.ok(Math.abs(num(t, 'x') - centre(k)) < 0.51, `${k.getAttribute('data-note')}: the label is on its key`); }
  assert.doesNotMatch(labels.map((t: any) => t.textContent).join(''), /♭/, 'one spelling: sharps only');
  const xs = ks.map(centre); for (let i = 1; i < 24; i++) assert.ok(xs[i] > xs[i - 1], 'the keys run left to right in pitch order');
  const whites = ks.filter((k: any) => !k.getAttribute('class').includes('black')); assert.ok(new Set(whites.map((k: any) => num(k, 'width'))).size === 1, 'one white key width');
  const first = ks[0], last = ks[23]; assert.ok(num(first, 'x') >= 8 && num(last, 'x') + num(last, 'width') <= 592, 'the strip sits inside the panel, with a margin');
});

test('1041 A: the two octaves are marked: `1st octave` under the first twelve keys, `2nd octave` under the second twelve', { skip }, () => {
  const d = doc(file(LIVE)), ks = keys(d), marks = [...d.querySelectorAll('text.octave')];
  assert.deepEqual(marks.map((t: any) => t.textContent), ['1st octave', '2nd octave']);
  const mid = (a: number, b: number) => (Math.min(...ks.slice(a, b).map((k: any) => num(k, 'x'))) + Math.max(...ks.slice(a, b).map((k: any) => num(k, 'x') + num(k, 'width')))) / 2;
  assert.ok(Math.abs(num(marks[0], 'x') - mid(0, 12)) < 1, 'the first mark is centred under the first octave'); assert.ok(Math.abs(num(marks[1], 'x') - mid(12, 24)) < 1, 'the second under the second');
  const bottom = Math.max(...ks.map((k: any) => num(k, 'y') + num(k, 'height'))); for (const m of marks) assert.ok(num(m, 'y') > bottom, 'the marks are under the keys');
});

test('1041 A: exactly two arrow paths, each with an arrowhead; arrow 1 runs from C to G and ends on the G key, arrow 2 starts on the B key of the first octave and ends on the F-sharp key of the second; both run left to right (never folding back), above the keys', { skip }, () => {
  const d = doc(file(LIVE)), ks = keys(d), arrows = [...d.querySelectorAll('path.arrow')]; assert.equal(arrows.length, 2, 'exactly two arrow paths');
  const heads = [...d.querySelectorAll('marker')].map((m: any) => m.getAttribute('id'));
  for (const a of arrows) { const m = /^url\(#([\w-]+)\)$/.exec(a.getAttribute('marker-end') ?? ''); assert.ok(m, 'an arrowhead at the end'); assert.ok(heads.includes(m![1]), 'the arrowhead exists'); assert.equal(a.getAttribute('marker-start'), null, 'no head at the start'); assert.match(a.getAttribute('d'), /^M [\d. -]+C [\d. -]+$/, 'one smooth curve'); }
  const [a1, a2] = arrows.map(ends), top = Math.min(...ks.map((k: any) => num(k, 'y')));
  const C1 = ks[0], G1 = ks[7], B1 = ks[11], F2 = ks[18]; assert.equal(G1.getAttribute('data-note'), 'G'); assert.equal(F2.getAttribute('data-note'), 'F♯'); assert.equal(B1.getAttribute('data-note'), 'B'); assert.equal(F2.getAttribute('data-i'), '18', 'the F-sharp of the SECOND octave');
  assert.ok(Math.abs(a1.x0 - centre(C1)) < 1, 'arrow 1 starts on C'); assert.ok(Math.abs(a1.x1 - centre(G1)) < 1, 'arrow 1 ends on the G key');
  assert.ok(Math.abs(a2.x0 - centre(B1)) < 1, 'arrow 2 starts on the B key'); assert.ok(Math.abs(a2.x1 - centre(F2)) < 1, 'arrow 2 ends on the second-octave F-sharp key');
  assert.ok(a1.x1 > a1.x0 + 100, 'arrow 1 ends to the right of where it starts'); assert.ok(a2.x1 > a2.x0 + 100, 'arrow 2 ends to the right of where it starts');
  const cps = (p: any): number[] => (p.getAttribute('d') as string).match(/-?\d+(?:\.\d+)?/g)!.map(Number).filter((_: number, i: number) => i % 2 === 0); for (const a of arrows) { const xs = cps(a); for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1], 'no point of the curve goes back to the left'); }
  for (const a of [a1, a2]) { assert.ok(a.y0 < top && a.y1 < top, 'the arrows begin and end above the keys'); }
  assert.ok(a1.x1 < a2.x0, 'the two arrows do not overlap: the first ends before the second begins');
  assert.equal(num(G1, 'data-i') - num(C1, 'data-i'), 7, 'C to G is seven half steps (seven keys further on)'); assert.equal(num(F2, 'data-i') - num(B1, 'data-i'), 7, 'B to the F-sharp of the next octave is seven half steps too');
});

test('1041 A: each arrow says `a fifth: 7 half steps` and what it joins; the two arrows differ by more than colour (the second is dashed), and the four end keys are marked', { skip }, () => {
  const d = doc(file(LIVE)), arrows = [...d.querySelectorAll('path.arrow')], labels = [...d.querySelectorAll('text.arrowlabel')];
  assert.equal(labels.length, 2); for (const t of labels) assert.match(t.textContent, /^a fifth: 7 half steps$/);
  const subs = [...d.querySelectorAll('text.arrowwhere')].map((t: any) => t.textContent); assert.deepEqual(subs, ['C to G', 'B to F♯']);
  assert.equal(arrows[0].getAttribute('stroke-dasharray'), null, 'arrow 1 is solid'); assert.match(arrows[1].getAttribute('stroke-dasharray'), /^\d+ \d+$/, 'arrow 2 is dashed');
  assert.notEqual(arrows[0].getAttribute('stroke'), arrows[1].getAttribute('stroke'), 'two colours');
  const ks = keys(d); const marked = ks.filter((k: any) => /\bend\b/.test(k.getAttribute('class'))).map((k: any) => k.getAttribute('data-i')); assert.deepEqual(marked, ['0', '7', '11', '18'], 'C, G, B and the second-octave F-sharp are marked');
  const ax = labels.map((t: any) => num(t, 'x')), [a1, a2] = arrows.map(ends); assert.ok(Math.abs(ax[0] - (a1.x0 + a1.x1) / 2) < 1 && Math.abs(ax[1] - (a2.x0 + a2.x1) / 2) < 1, 'each label is at the middle of its arrow');
  const fits = labels.map((t: any) => num(t, 'x')); assert.ok(fits[1] - fits[0] > 190, 'the two labels do not run into each other (190 units wide at the most)');
});

test('1041 A: for a screen reader: role img and an aria-label in words that says F sharp; the drawing is about 600 px wide (it scales down by its viewBox); the wheel\'s solid panel, palette and font; no script, nothing external', { skip }, () => {
  const svg = file(LIVE), d = doc(svg), root = d.documentElement;
  assert.equal(root.getAttribute('role'), 'img'); const label = root.getAttribute('aria-label');
  assert.equal(label, 'Two octaves of keys in a line. An arrow runs from C to G, seven half steps, a fifth. A second arrow runs from B to F sharp in the next octave, also seven half steps.'); assert.match(label, /F sharp/); assert.doesNotMatch(label, /[♯♭]/, 'words, not signs');
  const w = Number(/<svg [^>]*\swidth="([\d.]+)"/.exec(svg)![1]); assert.ok(w >= 560 && w <= 640, `about 600 px wide, got ${w}`); const vb = root.getAttribute('viewBox').split(' ').map(Number); assert.equal(vb[2], 600, 'a 600-unit viewBox, so a phone scales it');
  const panel = d.querySelector('rect'); assert.equal(panel.getAttribute('fill').toLowerCase(), '#fdfcfa', 'the wheel\'s own solid panel'); assert.equal(num(panel, 'x'), 0); assert.equal(num(panel, 'y'), 0); assert.equal(num(panel, 'width'), vb[2]);
  const wheel = file(LIVE, WHEEL), fontOf = (s: string) => /font-family="([^"]+)"/.exec(s)![1]; assert.equal(fontOf(svg), fontOf(wheel), 'the same font stack as the wheel');
  const colours = (s: string) => new Set((s.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toUpperCase())); const mine = colours(svg), theirs = colours(wheel), site = new Set(['#D72027', '#B07F00', '#FFFFFF', '#666666', '#DCE7F6']);   // the wheel's four, plus the Scales gadgets' own accent, lit-black and axis colours
  for (const c of mine) assert.ok(theirs.has(c) || site.has(c), `${c} is not in the wheel's palette or the gadgets' palette`);
  assert.doesNotMatch(svg, /<script|\bon\w+\s*=|<style|<image|<use|<foreignObject|href\s*=|xlink|url\(['"]?https?:|@import|https?:\/\/(?!www\.w3\.org)/i, 'no script, no external thing');
  for (const g of d.querySelectorAll('[aria-label]')) if (g !== root) assert.fail('the parts carry no label of their own: the drawing is one picture with one label');
});

test('1041 A (2026-11-25-1042 (deliberate): the captions landed once the wizard embedded both pieces): the captions.json entry exists (a title and one line, like the wheel\'s) and the file is exactly what the caption script writes for it; strip then apply is exact', { skip }, () => {
  const caps = JSON.parse(file(LIVE, 'captions.json')); const cap = caps[REL]; assert.deepEqual(cap, { title: 'Fifths on a line', line: 'Seven half steps from C to G, and from B to F♯ in the next octave' }); assert.ok(caps[WHEEL], 'the wheel\'s entry is the model');
  const svg = file(LIVE); assert.deepEqual(C.svgCaptionOf(svg), cap, 'the two text rows in the file are the entry'); assert.equal(C.applySvgCaption(svg, cap), svg, 'the file is what the script writes'); assert.equal(C.applySvgCaption(C.stripSvgCaption(svg), cap), svg);
  const box = (s: string): number[] => /viewBox="([^"]+)"/.exec(s)![1].split(' ').map(Number); assert.deepEqual(box(C.stripSvgCaption(svg)), [0, 0, 600, 400], 'the bare drawing'); assert.equal(box(svg)[2], 600, 'the caption did not widen the drawing'); assert.ok(box(svg)[3] > 400, 'it only adds height');
});

test('1041 A: once the vault is synced, the bundle\'s copy of the drawing and of captions.json are the live vault\'s (nothing yet to compare before the sync)', { skip }, () => {
  if (!fs.existsSync(path.join(BUNDLE, REL))) return;
  assert.equal(file(BUNDLE), file(LIVE), 'the bundle copy of the drawing differs from the vault\'s');
  const b = JSON.parse(file(BUNDLE, 'captions.json')), l = JSON.parse(file(LIVE, 'captions.json')); assert.deepEqual(b[REL], l[REL]);
});
