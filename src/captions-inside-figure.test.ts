// 2026-11-19-0940 - the CAPTION LIVES INSIDE THE FIGURE, in the style of the loudness graphs (notes/resources/images/loudness_soft.svg), for every figure of captions.json (the vault's one mapping file: key = the vault path of a gadget .html or an
// image .svg; value = { title, line }). Pinned here: the pure core (the seed from an italic line, the identical gadget block, the two <text> lines of an .svg and the viewBox that grows to hold them, strip and apply are exact inverses, applying twice is
// applying once); that the committed files carry exactly what the script writes (`apply-captions.mjs --check`); that the block is byte-identical in every captioned gadget but for its two texts; that its type is the loudness reference's; that no note keeps
// the italic line a caption was seeded from; that every embed of one file carries ONE height; that the score figures of scales/ and intervals/ share one left offset; and that the two gadget generators reproduce the captioned files. How tall each captioned
// gadget is, that the block is last in the body at the right size and that no row of an .svg is cropped is measured in real Chrome: scripts/dev/measure-captions.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import * as C from '../scripts/dev/caption-core.mjs';
import { readCaptions, applyCaptionsTo } from '../scripts/dev/apply-captions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VAULT = path.join(ROOT, 'assets/vaults/music-theory');
const captions = readCaptions(VAULT) as Record<string, { title: string; line: string }>;
const read = (rel: string): string => fs.readFileSync(path.join(VAULT, rel), 'utf8');
const GADGETS = Object.keys(captions).filter((f) => f.endsWith('.html')), FIGURES = Object.keys(captions).filter((f) => f.endsWith('.svg'));
const walkMd = (dir: string): string[] => fs.readdirSync(path.join(VAULT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkMd(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : []));
const CHAPTERS = ['intervals', 'scales', 'circle_of_fifths'];

// ---- the seed ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the seed: the title is the text before the first colon, the line is the rest with a capital and no final full stop; no colon: the first five words and the whole sentence', () => {
  assert.deepEqual(C.seedFromItalic('Scale player: pick a home note and a scale, press Play, and see and hear it on the keys and the staff.'), { title: 'Scale player', line: 'Pick a home note and a scale, press Play, and see and hear it on the keys and the staff' });
  assert.deepEqual(C.seedFromItalic('C major: the white keys from C to C, no sharps or flats.'), { title: 'C major', line: 'The white keys from C to C, no sharps or flats' });
  assert.deepEqual(C.seedFromItalic('Click two keys to see the gap between them as whole steps and half steps.'), { title: 'Click two keys to see', line: 'Click two keys to see the gap between them as whole steps and half steps' });
  assert.deepEqual(C.seedFromItalic('*Ear exercise: a: b.*'), { title: 'Ear exercise', line: 'A: b' }, 'only the FIRST colon splits; the asterisks are not part of the text');
  assert.deepEqual(C.seedFromItalic('Two words.'), { title: 'Two words.', line: 'Two words' });
  assert.equal(C.seedFromItalic(': starts with a colon.').title, ': starts with a colon.', 'a colon in the first place is not a title separator: the title is never empty');
});

// ---- the gadget block -----------------------------------------------------------------------------------------------------------------------------------------------------------
const DOC = '<!DOCTYPE html>\n<html><head><title>t</title><style>body{margin:0}</style></head>\n<body>\n<div class="wrap">x</div>\n<script>\nvar a = "<b>";\n</script>\n</body></html>\n';
test('a gadget gets the block right before the first <script> of the body (the bottom of the visible page); without a script, before </body>; texts are escaped', () => {
  const out = C.applyGadgetCaption(DOC, { title: 'A & B', line: 'say "<hi>"' });
  assert.ok(out.indexOf(C.GADGET_BEGIN) > out.indexOf('<div class="wrap">') && out.indexOf(C.GADGET_END) < out.indexOf('<script>'));
  assert.match(out, /<div class="t">A &amp; B<\/div><div class="l">say &quot;&lt;hi&gt;&quot;<\/div>/);
  assert.deepEqual(C.gadgetCaptionOf(out), { title: 'A & B', line: 'say "<hi>"' }, 'the texts round-trip');
  const noScript = C.applyGadgetCaption('<html><body><p>x</p></body></html>', { title: 'T', line: 'L' });
  assert.ok(noScript.indexOf(C.GADGET_END) < noScript.indexOf('</body>'));
  assert.throws(() => C.applyGadgetCaption('<p>no body</p>', { title: 'T', line: 'L' }));
  assert.throws(() => C.applyGadgetCaption(DOC, { title: '', line: 'L' }));
});
test('apply twice is apply once; strip is the exact inverse; a new caption replaces the old one; no caption removes it', () => {
  const cap = { title: 'T', line: 'L' }, once = C.applyGadgetCaption(DOC, cap);
  assert.equal(C.applyGadgetCaption(once, cap), once, 'idempotent');
  assert.equal(C.stripGadgetCaption(once), DOC, 'strip gives the original bytes back');
  const other = C.applyGadgetCaption(once, { title: 'T2', line: 'L2' });
  assert.equal((other.match(/caption BEGIN/g) ?? []).length, 1); assert.equal(C.stripGadgetCaption(other), DOC);
  assert.equal(C.applyGadgetCaption(once, null), DOC);
  assert.equal(C.stripGadgetCaption(DOC), DOC, 'no-op stays no-op');
  assert.throws(() => C.stripGadgetCaption('<!-- caption BEGIN --> no end'), /END marker/);
});
test('the block carries the loudness graphs\' type: 15 px / 600 / #2B2B2B title, 12 px / #555555 line, the same font stack, left aligned, a 12 px gap above', () => {
  const ref = fs.readFileSync(path.join(VAULT, 'notes/resources/images/loudness_soft.svg'), 'utf8');
  const title = /<text [^>]*font-size="(\d+)"[^>]*fill="(#\w+)"[^>]*text-anchor="start" font-weight="(\d+)">Soft: small amplitude/.exec(ref)!, line = /<text [^>]*font-size="(\d+)" fill="(#\w+)" text-anchor="start">The same 440 Hz tone/.exec(ref)!;
  assert.deepEqual([+title[1], title[2], +title[3]], [C.TITLE_PX, C.TITLE_FILL, 600]); assert.deepEqual([+line[1], line[2]], [C.LINE_PX, C.LINE_FILL]);
  assert.match(ref, new RegExp(`font-family="${C.CAPTION_FONT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), 'the reference\'s font stack');
  const b = C.gadgetBlock({ title: 'T', line: 'L' });
  assert.match(b, /\.fig-cap \{ margin: 12px 0 0;/); assert.match(b, /text-align: left/); assert.ok(b.includes(C.CAPTION_FONT));
  assert.match(b, /\.fig-cap \.t \{ font-size: 15px; line-height: 19px; font-weight: 600; color: #2B2B2B; \}/);
  assert.match(b, /\.fig-cap \.l \{ font-size: 12px; line-height: 17px; margin-top: 2px; color: #555555; \}/);
  assert.doesNotMatch(b, /hover|title=|aria-label|forge/i, 'no hover, no tooltip, no Forge word');
});

// ---- an .svg figure -------------------------------------------------------------------------------------------------------------------------------------------------------------
const SCORE = '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" width="65.17mm" height="16.40mm" viewBox="12.7264 3.1243 37.0877 9.3333">\n<g><line x1="0" y1="0" x2="1" y2="0"/></g>\n</svg>\n';
test('an .svg gets the two lines under the drawing and a viewBox that grows to hold them (nothing is cropped); the size attributes grow in proportion; the type is converted to the picture\'s unit once', () => {
  const cap = { title: 'C major', line: 'The white keys from C to C, no sharps or flats' };
  const out = C.applySvgCaption(SCORE, cap), L = C.svgCaptionLayout(SCORE, cap);
  const vb = /viewBox="([^"]+)"/.exec(out)![1].split(' ').map(Number);
  assert.equal(vb[0], 12.7264, 'the left edge does not move'); assert.equal(vb[1], 3.1243);
  assert.ok(vb[2] >= 360 / L.k - 1e-3, 'at least 360 px wide: the line fits'); assert.ok(vb[3] > 9.3333);
  const ys = [...out.matchAll(/<text [^>]*y="([\d.]+)"/g)].map((m) => +m[1]);
  assert.equal(ys.length, 1 + L.rows.length); assert.ok(ys[0] > 3.1243 + 9.3333, 'the title is below the drawing'); assert.ok(ys.every((y, i) => i === 0 || y > ys[i - 1]) && Math.max(...ys) < vb[1] + vb[3], 'every row is inside the box');
  const px = (n: number): number => n * L.k;
  const sizes = [...out.matchAll(/font-size="([\d.]+)"/g)].map((m) => px(+m[1]));
  assert.ok(Math.abs(sizes[0] - 15) < 0.01 && sizes.slice(1).every((s) => Math.abs(s - 12) < 0.01), `15 px and 12 px in the picture's unit: ${sizes}`);
  assert.ok(Math.abs(px(ys[1] - ys[0]) - 19) < 0.01, 'the line is 19 px under the title (as the loudness graphs)');
  const w = parseFloat(/ width="([\d.]+)mm"/.exec(out)![1]), h = parseFloat(/ height="([\d.]+)mm"/.exec(out)![1]);
  assert.ok(Math.abs(w / vb[2] - 65.17 / 37.0877) < 0.001 && Math.abs(h / vb[3] - 16.4 / 9.3333) < 0.001, 'one unit is still the same size: the drawing is not scaled');
  assert.match(out, /x="12\.7264"/, 'left aligned at the drawing\'s left edge');
  assert.match(out, /fill="#2B2B2B"[^>]*font-weight="600"/); assert.match(out, /fill="#555555"/);
});
test('an .svg: apply twice is apply once, strip gives the original bytes back, a long line wraps into rows that each fit the width, no caption removes it', () => {
  const cap = { title: 'G major', line: 'The same recipe from G; the seventh note is F-sharp, shown here as a sharp sign on the staff' };
  const once = C.applySvgCaption(SCORE, cap);
  assert.equal(C.applySvgCaption(once, cap), once); assert.equal(C.stripSvgCaption(once), SCORE); assert.equal(C.applySvgCaption(once, null), SCORE);
  assert.equal(C.stripSvgCaption(SCORE), SCORE, 'no-op stays no-op');
  const L = C.svgCaptionLayout(SCORE, cap); assert.ok(L.rows.length >= 2, 'a 92-character line wraps in 360 px');
  const maxPx = L.wUnits * L.k; for (const r of L.rows) assert.ok(r.length * C.LINE_PX * C.CHAR_EM <= maxPx + 1, `${r}: fits the width by the conservative estimate`);
  assert.deepEqual(C.svgCaptionOf(once), { title: 'G major', line: cap.line }, 'the rows read back as the one line');
  assert.deepEqual(C.wrapWords('aaa bbb ccc', 7), ['aaa bbb', 'ccc']); assert.deepEqual(C.wrapWords('toolongword x', 3), ['toolongword', 'x']); assert.deepEqual(C.wrapWords('', 5), []);
});
test('an .svg with a unit other than mm, and a wide drawing, keep their size (the box grows only downward when the drawing is already wide enough)', () => {
  const wide = '<svg width="620" height="300" viewBox="0 0 620 300"><rect/></svg>\n';
  const out = C.applySvgCaption(wide, { title: 'T', line: 'short' }); const vb = /viewBox="([^"]+)"/.exec(out)![1].split(' ').map(Number);
  assert.equal(vb[2], 620); assert.ok(vb[3] > 300); assert.match(out, / width="620"/); assert.equal(C.stripSvgCaption(out), wide);
});

// ---- the vault -----------------------------------------------------------------------------------------------------------------------------------------------------------------
test('captions.json: every key is a file of the vault, a gadget or an image, with a title and a line; sorted keys', () => {
  assert.ok(Object.keys(captions).length >= 19);
  for (const [k, v] of Object.entries(captions)) { assert.ok(fs.existsSync(path.join(VAULT, k)), `${k} exists`); assert.match(k, /\.(html|svg)$/); assert.ok(v.title.trim() && v.line.trim(), k); assert.doesNotMatch(v.line, /\.$/, `${k}: no final full stop (the seed dropped it)`); }
  assert.deepEqual(Object.keys(captions), [...Object.keys(captions)].sort(), 'the keys are sorted: a diff of the file reads');
});
test('the committed figures carry exactly what the script writes (apply-captions --check), through the real command', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/apply-captions.mjs'), '--check', '--vault', VAULT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /0 differ/);
  assert.equal(applyCaptionsTo(VAULT, { check: true }).changed.length, 0);
});
test('--check is not vacuous: a gadget whose caption was edited by hand is named and the command exits 1', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-check-'));
  try {
    const f = GADGETS[0]; fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.writeFileSync(path.join(tmp, f), read(f).replace(/<div class="l">.*?<\/div>/, '<div class="l">edited by hand</div>')); fs.writeFileSync(path.join(tmp, 'captions.json'), JSON.stringify({ [f]: captions[f] }));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/apply-captions.mjs'), '--check', '--vault', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 1); assert.ok(r.stdout.includes(f), r.stdout);
    const w = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/apply-captions.mjs'), '--vault', tmp], { encoding: 'utf8' }); assert.equal(w.status, 0);
    assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), read(f), 'the write puts it right');
    fs.writeFileSync(path.join(tmp, 'captions.json'), JSON.stringify({ 'gone.html': captions[f] })); assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/apply-captions.mjs'), '--check', '--vault', tmp], { encoding: 'utf8' }).status, 1, 'a missing file is a failure too');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('the block is the SAME in every captioned gadget (byte for byte but for its two texts), is the last visible thing of the body, and carries the caption the file says', () => {
  const shapes = new Set<string>();
  for (const f of GADGETS) {
    const h = read(f), shape = C.gadgetBlockShape(h); assert.ok(shape, `${f} has the block`); shapes.add(shape!);
    assert.deepEqual(C.gadgetCaptionOf(h), captions[f], f); assert.equal((h.match(/caption BEGIN/g) ?? []).length, 1, `${f}: one block`);
    const after = h.slice(h.indexOf(C.GADGET_END) + C.GADGET_END.length); assert.doesNotMatch(after.replace(/<script[\s\S]*?<\/script>/g, ''), /<(div|p|svg|button|span|table|ul|section)\b/, `${f}: nothing visible after the caption`);
  }
  assert.equal(shapes.size, 1, 'ONE shape across all captioned gadgets');
});
test('the figures: every captioned .svg carries its caption and its viewBox covers every row; the piano voice block of the Scales player is still the one the other files copy', () => {
  for (const f of FIGURES) { const s = read(f); assert.deepEqual(C.svgCaptionOf(s), captions[f], f); const L = C.svgCaptionLayout(s, captions[f]); const vb = /viewBox="([^"]+)"/.exec(s)![1].split(' ').map(Number); assert.ok(Math.abs(vb[3] - L.newVb[3]) < 1e-3 && Math.abs(vb[2] - L.newVb[2]) < 1e-3, `${f}: the box is the layout's`); }
  const player = read('scales/resources/html/scale_player.html'), block = (h: string): string => { const a = h.indexOf('  // ==== piano voice BEGIN'), e = h.indexOf('  // ==== piano voice END'); return h.slice(a, h.indexOf('\n', e)); };
  for (const f of ['scales/resources/html/scale_build_major.html', 'circle_of_fifths/resources/html/circle_of_fifths.html']) assert.equal(block(read(f)), block(player), `${f}: the piano voice block is byte-identical to the player's`);
});
test('the score figures of scales/ and intervals/ start at the same left offset (the C major figure had 8.5 units of blank space at its left; G and F had none)', () => {
  const xs: Record<string, number> = {};
  for (const d of ['scales/resources/images', 'intervals/resources/images']) { const dir = path.join(VAULT, d); if (!fs.existsSync(dir)) continue; for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.svg'))) xs[`${d}/${f}`] = C.parseSvgBox(read(`${d}/${f}`)).vb[0]; }
  assert.ok(Object.keys(xs).length >= 3, JSON.stringify(xs)); const v = Object.values(xs); assert.ok(Math.max(...v) - Math.min(...v) <= 0.5, `the viewBox left edges: ${JSON.stringify(xs)}`);
  const c = C.stripSvgCaption(read('scales/resources/images/c_major_scale.svg')), g = C.stripSvgCaption(read('scales/resources/images/g_major_scale.svg'));
  assert.equal(C.parseSvgBox(c).vb[0], C.parseSvgBox(g).vb[0]); assert.equal(C.parseSvgBox(c).height, C.parseSvgBox(g).height, 'the same height');
  assert.ok(Math.abs(C.pxPerUnit(c) - C.pxPerUnit(g)) < 0.01, 'the same scale: the staves are the same size');
});
// ---- the notes -------------------------------------------------------------------------------------------------------------------------------------------------------------------
type Fig = { note: string; line: number; figure: string; below: string | null };
function figuresOf(note: string): Fig[] {
  const lines = read(note).split('\n'), out: Fig[] = [];
  for (let i = 0; i < lines.length; i++) {
    let figure: string | null = null, end = i;
    if (lines[i].trim() === '```html-embed') { figure = lines[i + 1].trim(); end = i + 1; while (end < lines.length && lines[end].trim() !== '```') end++; }
    else { const m = /^!\[\[([^\]|]+\.svg)(\|[^\]]*)?\]\]\s*$/.exec(lines[i]); if (m) figure = m[1]; }
    if (!figure) continue; let j = end + 1; while (j < lines.length && lines[j].trim() === '') j++;
    out.push({ note, line: j + 1, figure, below: j < lines.length && /^\*[^*].*\*$/.test(lines[j].trim()) ? lines[j].trim() : null });
  }
  return out;
}
const chapterFigures = CHAPTERS.flatMap((c) => walkMd(c)).flatMap(figuresOf);
test('no note of the three chapters keeps the italic line a caption was seeded from (the caption is inside the figure now); every figure of those chapters has a caption', () => {
  // 2026-11-20-1002 (deliberate): the floor moves from 23 to 22 figures. The wizard's edit of circle_of_fifths/Circle of fifths.md (vault 1b18279, carried in 0.11.116) took the chapter's intro wheel embed out ("Try it: click a key on the wheel"); the wheel is still embedded in building the circle of fifths, and every remaining figure still has its caption. The floor only guards against a walk that finds nothing.
  assert.ok(chapterFigures.length >= 22, `${chapterFigures.length} figures`);
  for (const f of chapterFigures) {
    assert.ok(f.figure in captions, `${f.note}: ${f.figure} has no entry in captions.json`);
    if (f.below) { const seed = C.seedFromItalic(f.below.slice(1, -1)), cap = captions[f.figure]; assert.ok(!(seed.title === cap.title && seed.line === cap.line), `${f.note}:${f.line}: the italic line under ${f.figure} is the one the caption was seeded from`); }
  }
});
test('every embed of one file carries ONE height (the same in every note), and one that fits the caption: at least the file\'s own content height plus the caption block', () => {
  const heights = new Map<string, Set<number>>();
  for (const note of walkMd('.').filter((n) => !n.startsWith('./.'))) { const lines = read(note).split('\n'); for (let i = 0; i < lines.length; i++) if (lines[i].trim() === '```html-embed') { const set = heights.get(lines[i + 1].trim()) ?? new Set<number>(); set.add(Number(lines[i + 2])); heights.set(lines[i + 1].trim(), set); } }
  for (const f of GADGETS) { const set = heights.get(f); assert.ok(set && set.size >= 1, `${f} is embedded`); assert.equal(set!.size, 1, `${f}: one height in every note, got ${[...set!]}`); assert.ok([...set!][0] >= 150, f); }
});
// ---- the generators ---------------------------------------------------------------------------------------------------------------------------------------------------------------
test('both generators write the captioned file (their output carries the caption block exactly as apply-captions does), and with no captions.json they write the bare file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-gen-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scales/resources/html'), { recursive: true }); fs.copyFileSync(path.join(VAULT, 'scales/resources/html/scale_player.html'), path.join(tmp, 'scales/resources/html/scale_player.html'));
    for (const g of ['make-scale-exercises.mjs', 'make-circle-gadgets.mjs']) assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev', g), '--vault', tmp], { encoding: 'utf8' }).status, 0, g);
    for (const f of ['scales/resources/html/scale_build_major.html', 'circle_of_fifths/resources/html/circle_of_fifths.html']) assert.equal(C.gadgetCaptionOf(fs.readFileSync(path.join(tmp, f), 'utf8')), null, `${f}: no captions.json, no block`);
    fs.copyFileSync(path.join(VAULT, 'captions.json'), path.join(tmp, 'captions.json'));
    for (const g of ['make-scale-exercises.mjs', 'make-circle-gadgets.mjs']) assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev', g), '--vault', tmp], { encoding: 'utf8' }).status, 0, g);
    for (const f of ['scales/resources/html/scale_build_major.html', 'scales/resources/html/scale_ear_name_the_scale.html'.replace('ear_name_the_scale', 'build_other_scales'), 'circle_of_fifths/resources/html/circle_exercise_neighbours.html']) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), read(f), f);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
