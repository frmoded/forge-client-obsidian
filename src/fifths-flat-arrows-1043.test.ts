// 2026-11-25-1043 - the drawing `fifths_on_a_line.svg` after the driver's "make the arrows splines instead of half circles": (A) each arrow is ONE flat cubic Bezier (rise 25 to 30 % of the horizontal distance; both apexes at the same y, so arrow 2's
// apex is lower than arrow 1's by no ratio at all: APEX_DROP = 0), the head turns with the end tangent (down and to the right), the two labels stay apart and clear of the curve, the keys keep their size and the drawing is shorter (viewBox 336, was 400);
// (C1) the plugin's styles.css centres this image by the SAME two rules as the wheel (1030z), by added selector-list entries only; (C2) the drawing says it must stay readable in a 360 px column (data-caption-column) and the caption script sizes its
// caption so that the line is 11 px there, while a figure without the attribute is laid out exactly as before. Geometry of the real text boxes is measured in real Chrome: scripts/dev/measure-circle-gadgets.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Window } from 'happy-dom';

import * as C from '../scripts/dev/caption-core.mjs';
import { applyCaptionsTo, readCaptions } from '../scripts/dev/apply-captions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIVE = path.join(os.homedir(), 'projects/music-theory');
const REL = 'circle_of_fifths/resources/images/fifths_on_a_line.svg';
const skip = fs.existsSync(LIVE) ? false : 'the music-theory vault is not on this machine';
const file = (): string => fs.readFileSync(path.join(LIVE, REL), 'utf8');
const doc = (svg: string): any => new new Window().DOMParser().parseFromString(svg, 'image/svg+xml');
const num = (e: any, a: string): number => Number(e.getAttribute(a));
const APEX_DROP = 0;

type Cubic = { x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
const N = '(-?\\d+(?:\\.\\d+)?)';
const ONE_CUBIC = new RegExp(`^M ${N} ${N} C ${N} ${N},? ${N} ${N},? ${N} ${N}$`);
function cubic(d: string): Cubic { const m = ONE_CUBIC.exec(d); assert.ok(m, `one move and ONE cubic Bezier (M x0 y0 C x1 y1 x2 y2 x3 y3), got "${d}"`); const [x0, y0, x1, y1, x2, y2, x3, y3] = m!.slice(1).map(Number); return { x0, y0, x1, y1, x2, y2, x3, y3 }; }
const at = (p0: number, p1: number, p2: number, p3: number, t: number): number => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
const apexOf = (c: Cubic): number => Math.min(...Array.from({ length: 1001 }, (_, i) => at(c.y0, c.y1, c.y2, c.y3, i / 1000)));
const arrows = (): Cubic[] => [...doc(file()).querySelectorAll('path.arrow')].map((p: any) => cubic(p.getAttribute('d')));

// ---- A: the arrows -------------------------------------------------------------------------------------------------------------------------------------------------------------
test('1043 A: each of the two arrows is ONE cubic Bezier from key to key, and no circular arc is left in the file', { skip }, () => {
  const a = arrows(); assert.equal(a.length, 2);
  for (const c of a) { assert.equal(c.y0, c.y3, 'it starts and ends at one height'); assert.equal(c.y1, c.y2, 'the two control points are level: one symmetric arch'); assert.ok(c.y1 < c.y0, 'the control points are above'); assert.ok(c.x0 < c.x1 && c.x1 < c.x2 && c.x2 < c.x3, 'left to right, the control points lean in: not the upright arms of the old half circle'); assert.ok(Math.abs((c.x1 - c.x0) - (c.x3 - c.x2)) < 0.01, 'symmetric'); }
  assert.deepEqual([a[0].x0, a[0].x3, a[1].x0, a[1].x3], [40, 200, 280, 460], 'C to G and B to the F-sharp of the second octave, as before');
});

test('1043 A: the arches are flat: each rises 25 to 30 % of its horizontal distance (the old ones rose 56 % and 50 %)', { skip }, () => {
  for (const c of arrows()) { const rise = c.y0 - apexOf(c), ratio = rise / (c.x3 - c.x0); assert.ok(ratio >= 0.25 && ratio <= 0.30, `rise ${rise} over ${c.x3 - c.x0} = ${ratio.toFixed(3)}`); }
});

test('1043 A: the apex of arrow 2 is lower than arrow 1\'s by no more than the chosen ratio (0: the two apexes are level), so the two labels stand on one line', { skip }, () => {
  const [a, b] = arrows(), h1 = a.y0 - apexOf(a), h2 = b.y0 - apexOf(b);
  assert.ok(h2 >= h1 * (1 - APEX_DROP) - 0.01, `${h2} against ${h1}`); assert.ok(Math.abs(apexOf(a) - apexOf(b)) < 0.01);
});

test('1043 A: the head turns with the curve: the end tangent points down and to the right (30 to 70 degrees below level), the marker is orient="auto" with its tip on the end point', { skip }, () => {
  for (const c of arrows()) { const dx = c.x3 - c.x2, dy = c.y3 - c.y2; assert.ok(dx > 0 && dy > 0, `the end tangent (${dx}, ${dy}) points down-right`); const deg = Math.atan2(dy, dx) * 180 / Math.PI; assert.ok(deg >= 30 && deg <= 70, `${deg.toFixed(1)} degrees`); }
  const d = doc(file()); const markers = [...d.querySelectorAll('marker')]; assert.equal(markers.length, 2);
  for (const m of markers as any[]) { assert.equal(m.getAttribute('orient'), 'auto'); assert.equal(m.getAttribute('refX'), '15'); assert.equal(m.getAttribute('refY'), '7'); assert.equal(m.querySelector('path').getAttribute('d'), 'M0 0 L15 7 L0 14 Z', 'the tip is at (15, 7)'); }
  const dots = [...d.querySelectorAll('circle')].map((e: any) => [num(e, 'cx'), num(e, 'cy')]); assert.deepEqual(dots, arrows().map((c) => [c.x0, c.y0]), 'the start dots sit on the start points');
});

test('1043 A: the labels do not overlap each other (even at 0.6 em a character), stand above their apex with the `C to G` row under the first, and are inside the panel', { skip }, () => {
  const d = doc(file()), labels = [...d.querySelectorAll('text.arrowlabel')] as any[], subs = [...d.querySelectorAll('text.arrowwhere')] as any[], a = arrows();
  const half = (t: any): number => t.textContent.length * 0.6 * num(t, 'font-size') / 2;
  assert.ok(num(labels[0], 'x') + half(labels[0]) < num(labels[1], 'x') - half(labels[1]), 'the two labels are apart'); assert.ok(num(labels[0], 'x') - half(labels[0]) >= 0 && num(labels[1], 'x') + half(labels[1]) <= 600);
  for (const i of [0, 1]) {
    assert.equal(num(subs[i], 'x'), num(labels[i], 'x')); assert.equal(num(labels[i], 'x'), (a[i].x0 + a[i].x3) / 2, 'over the apex');
    assert.ok(num(labels[i], 'y') - 0.8 * num(labels[i], 'font-size') >= 8, 'inside the panel');
    assert.ok(num(subs[i], 'y') - 0.8 * num(subs[i], 'font-size') >= num(labels[i], 'y') + 0.2 * 18 - 2, 'the second row is under the first');
    assert.ok(num(subs[i], 'y') + 0.25 * num(subs[i], 'font-size') <= apexOf(a[i]) - 1.75 - 6, 'at least 6 units clear of the curve');
  }
});

test('1043 A: the drawing is shorter (bare viewBox 600 x 336, was 600 x 400) and the keys keep their size, 8 units under the arrows', { skip }, () => {
  const bare = C.stripSvgCaption(file()), d = doc(bare), box = d.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assert.deepEqual(box, [0, 0, 600, 336]); assert.match(bare, /<svg [^>]*width="600" height="336"/); assert.equal(num(d.querySelector('rect'), 'height'), 336, 'the panel');
  const keys = [...d.querySelectorAll('rect.key')] as any[];
  for (const k of keys) { const black = k.getAttribute('class').includes('black'); assert.deepEqual([num(k, 'width'), num(k, 'height'), num(k, 'y')], black ? [28, 92, 126] : [40, 150, 126]); }
  for (const c of arrows()) assert.equal(126 - c.y0, 8);
  const bottom = Math.max(...[...d.querySelectorAll('text.octave')].map((t: any) => num(t, 'y'))); assert.ok(bottom > 276 + 10 && bottom <= 336 - 12, 'the octave marks are under the keys, inside the panel');
});

// ---- C2: the caption is legible on a phone --------------------------------------------------------------------------------------------------------------------------------------
const PANELLED = (extra = '', size = 'width="600" height="336"'): string => `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ${size} viewBox="0 0 600 336"${extra}>\n<rect x="0" y="0" width="600" height="336" rx="10" ry="10" fill="#fdfcfa"/>\n<g/>\n</svg>\n`;
const CAP = { title: 'Fifths on a line', line: 'Seven half steps from C to G, and from B to F♯ in the next octave' };
const sizes = (svg: string): number[] => [...svg.slice(svg.indexOf(C.SVG_BEGIN)).matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

test('1043 C: a figure that says data-caption-column="360" gets a caption whose line is 11 px when the picture is that wide (title in the same proportion), wrapped inside the panel\'s two insets; apply twice is apply once and strip is exact', () => {
  const bare = PANELLED(' data-caption-column="360"'), out = C.applySvgCaption(bare, CAP), L = C.svgCaptionLayout(bare, CAP);
  const s = sizes(out); assert.ok(Math.abs(s[1] * 360 / 600 - 11) < 0.01, `line ${s[1]} units`); assert.ok(s[1] >= 18 && s[1] <= 20); assert.ok(Math.abs(s[0] / s[1] - 15 / 12) < 0.001);
  assert.ok(Math.abs(L.k - (360 / 600) * (12 / 11)) < 1e-9, 'k is the caption\'s own scale');
  assert.deepEqual(L.rows, ['Seven half steps from C to G, and from B to F♯ in the', 'next octave']);
  const x = Number(/<text x="([\d.]+)"/.exec(out)![1]); assert.ok(Math.abs(x - 12 / L.k) < 0.001, '12 caption px from the panel\'s edge');
  for (const r of L.rows) assert.ok(r.length * C.CHAR_EM * s[1] <= 600 - 2 * x + 0.01, `${r}: inside both insets by the conservative estimate`);
  assert.ok(Math.abs(L.newVb[3] - 449.0556) < 0.001, `${L.newVb[3]}`); assert.equal(L.newVb[2], 600);
  assert.equal(C.applySvgCaption(out, CAP), out); assert.equal(C.stripSvgCaption(out), bare); assert.deepEqual(C.svgCaptionOf(out), CAP);
});

test('1043 C: without the attribute nothing changes (15 and 12 px of the picture, the old wrap), and a figure already drawn narrower than the column keeps its own size', () => {
  const plain = C.applySvgCaption(PANELLED(), CAP); assert.deepEqual(sizes(plain), [15, 12]); assert.equal(C.svgCaptionLayout(PANELLED(), CAP).k, C.pxPerUnit(PANELLED())); assert.equal(C.svgCaptionLayout(PANELLED(), CAP).rows.length, 1);
  const small = 'width="360" height="201.6"';
  assert.deepEqual(sizes(C.applySvgCaption(PANELLED(' data-caption-column="360"', small), CAP)), sizes(C.applySvgCaption(PANELLED('', small), CAP)), 'a 360 px picture already has a 12 px line: the attribute never makes a caption smaller');
  assert.equal(C.captionColumnOf(PANELLED(' data-caption-column="360"')), 360); assert.equal(C.captionColumnOf(PANELLED()), null); assert.equal(C.captionColumnOf(PANELLED(' data-caption-column="0"')), null);
});

test('1043 C: the drawing carries the attribute and its caption is the script\'s: 18.3 units (11 px at 360), two rows inside the picture, 449 units tall in all (was 457)', { skip }, () => {
  const svg = file(), caps = readCaptions(LIVE) as Record<string, { title: string; line: string }>;
  assert.equal(C.captionColumnOf(svg), 360);
  const s = sizes(svg); assert.equal(s.length, 3, 'a title and two rows'); assert.ok(Math.abs(s[1] - 18.3333) < 0.001 && s[1] === s[2] && Math.abs(s[0] - 22.9167) < 0.001, String(s));
  const vb = /viewBox="([^"]+)"/.exec(svg)![1].split(' ').map(Number); assert.ok(Math.abs(vb[3] - 449.0556) < 0.001, String(vb));
  const ys = [...svg.slice(svg.indexOf(C.SVG_BEGIN)).matchAll(/<text [^>]*y="([\d.]+)"/g)].map((m) => Number(m[1])); assert.ok(ys[0] - 0.8 * s[0] > 314 + 4, 'the title is below the drawing'); assert.ok(ys[ys.length - 1] + 0.25 * s[2] <= vb[3]);
  assert.deepEqual(C.svgCaptionOf(svg), caps[REL]); assert.equal(C.applySvgCaption(svg, caps[REL]), svg);
});

test('1043 C: no other captioned figure of the vault is touched: only this one says a column, and apply-captions --check finds nothing that differs', { skip }, () => {
  const caps = readCaptions(LIVE) as Record<string, unknown>;
  const withColumn = Object.keys(caps).filter((f) => f.endsWith('.svg') && C.captionColumnOf(fs.readFileSync(path.join(LIVE, f), 'utf8')) !== null);
  assert.deepEqual(withColumn, [REL]);
  const r = applyCaptionsTo(LIVE, { check: true }); assert.deepEqual(r.changed, []); assert.deepEqual(r.missing, []); assert.ok(r.total >= 51);
});

// ---- C1: centred in Obsidian ----------------------------------------------------------------------------------------------------------------------------------------------------
const CSS_TEXT = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const WHEEL = 'circle_of_fifths_wheel.svg', LINE = 'fifths_on_a_line.svg';
const block = (): string => { const a = CSS_TEXT.indexOf('/* 1030z begin */'), b = CSS_TEXT.indexOf('/* 1030z end */'); assert.ok(a >= 0 && b > a); return CSS_TEXT.slice(a, b); };
const rulesOf = (css: string): { selectors: string[]; body: string }[] => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()).filter(Boolean), body: m[2] }));

test('1043 C: both centring rules of 1030z name the drawing too, with the SAME selector shape as the wheel\'s (so the same declarations apply), and it appears nowhere else in styles.css', () => {
  const rules = rulesOf(block()); assert.equal(rules.length, 2);
  for (const r of rules) { const wheel = r.selectors.filter((s) => s.includes(`[src$="${WHEEL}"]`)), line = r.selectors.filter((s) => s.includes(`[src$="${LINE}"]`)); assert.equal(wheel.length, 1); assert.deepEqual(line, wheel.map((s) => s.replace(WHEEL, LINE))); assert.match(r.body, /width:\s*fit-content/); assert.match(r.body, /margin-inline:\s*auto/); }
  assert.equal(CSS_TEXT.split(LINE).length - 1, 2, 'two selectors, no other mention');
});

test('1043 C: the rules select the drawing\'s embed in Reading view and in Live Preview (the DOM shapes of 1030z) and no other embed', () => {
  const [reading, live] = rulesOf(block()), win = new Window(), d = win.document;
  const src = REL, other = 'circle_of_fifths/resources/images/coltrane_circle.jpg';
  d.body.innerHTML = `<div class="markdown-preview-view"><p><span class="internal-embed image-embed is-loaded" src="${src}"><img src="x"></span></p><p><span class="internal-embed image-embed" src="${other}"><img src="y"></span></p></div>`
    + `<div class="markdown-source-view mod-cm6"><div class="cm-content"><div class="cm-line"><div class="internal-embed image-embed" src="${src}"><img src="x"></div></div><div class="internal-embed image-embed" src="${src}"></div><div class="internal-embed image-embed" src="${other}"></div><div class="internal-embed markdown-embed" src="${src}"></div></div></div>`;
  const hit = (sel: string) => [...d.querySelectorAll(sel)].map((e) => e.getAttribute('src'));
  assert.deepEqual(hit(reading.selectors.join(',')), [src, src, src]); assert.deepEqual(hit(live.selectors.join(',')), [src, src]);
  win.close();
});

test('1043 C: styles.css only ADDS lines over the committed 042634a: every line of that stylesheet is still there, in order', () => {
  let base: string;
  try { base = execFileSync('git', ['show', '042634a:styles.css'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return; /* no git history on this machine */ }
  const have = CSS_TEXT.split('\n'); let i = 0;
  for (const line of base.split('\n')) { const j = have.indexOf(line, i); assert.ok(j >= 0, `a line is gone, changed or moved: ${line.slice(0, 120)}`); i = j + 1; }
});
