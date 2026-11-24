// 2026-11-23-1026 - the circle-of-fifths wheel is drawn SMALL by its own width/height (360 px for a 600-unit viewBox) and the caption script keeps that: the viewBox stays the one of the drawing plus the caption rows (it does NOT widen to the 360 px
// minimum, because the picture is already 360 px wide), width and height grow in proportion, strip gives the 360 px size back. The real file (the music-theory vault, if it is on this machine) must be exactly what the script writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as C from '../scripts/dev/caption-core.mjs';
import { readCaptions } from '../scripts/dev/apply-captions.mjs';

const VAULT = path.join(os.homedir(), 'projects/music-theory'), WHEEL = 'circle_of_fifths/resources/images/circle_of_fifths_wheel.svg';
const have = fs.existsSync(path.join(VAULT, WHEEL));
const PANEL = (w: number, h: number): string => `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="360" height="360" viewBox="0 0 ${w} ${h}" role="img" aria-label="x">\n<rect x="0" y="0" width="${w}" height="${h}" rx="10" ry="10" fill="#fdfcfa"/>\n<g/>\n</svg>\n`;

test('a 360 px wide panel figure keeps its 600-unit viewBox width when captioned: the canvas grows downward only, size attributes and panel follow, strip is exact', () => {
  const cap = { title: 'The circle of fifths', line: 'Twelve keys, a fifth apart, closing into a ring' };
  const bare = PANEL(600, 600), out = C.applySvgCaption(bare, cap);
  const vb = /viewBox="([^"]+)"/.exec(out)![1].split(' ').map(Number);
  assert.equal(vb[2], 600, 'not widened'); assert.ok(vb[3] > 600 && vb[3] < 700, `taller by the caption only: ${vb[3]}`);
  const w = +/<svg [^>]*\swidth="([\d.]+)"/.exec(out)![1], h = +/<svg [^>]*\sheight="([\d.]+)"/.exec(out)![1];
  assert.equal(w, 360); assert.ok(Math.abs(h / w - vb[3] / vb[2]) < 1e-3, 'the proportion of the viewBox');
  assert.match(out, new RegExp(`<rect x="0" y="0" width="600" height="${vb[3]}"`), 'the panel follows the canvas');
  assert.equal(C.stripSvgCaption(out), bare); assert.equal(C.applySvgCaption(out, cap), out, 'idempotent');
});

test('the real wheel is 320 to 360 px wide and is exactly what the caption script writes for it', { skip: have ? false : 'the music-theory vault is not on this machine' }, () => {
  const svg = fs.readFileSync(path.join(VAULT, WHEEL), 'utf8'), cap = readCaptions(VAULT)[WHEEL];
  const head = /<svg\b[^>]*>/.exec(svg)![0], w = +/\swidth="([\d.]+)"/.exec(head)![1];
  assert.ok(w >= 320 && w <= 360, `width ${w}`); assert.equal(C.applySvgCaption(svg, cap), svg, 'check: the file is what the script writes');
  assert.match(svg, /<!-- caption-box 0 0 600 600\|360\|360 -->/, 'the picture\'s own box, 360 by 360 px, is recorded for strip');
});
