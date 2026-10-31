// 2026-10-31-1100 (M17b, item 5): the TREE STRIP of a composition in real Chrome under Obsidian's own stylesheet, with REAL mouse events (CDP). It mounts the real strip over the rows of a three-section composition whose last section is a
// composition with two sections of its own, then measures: that every section is a row of its own below the one before, that the nested rows sit one indent (22 px) to the right of their parent and no more, that no chip or detail is
// clipped or overlaps its neighbour, that the pointer's target at the middle of every chip IS that chip (so a real click lands), what a hover and a click tell the owner, and that the clicked note's chip is emphasised (computed
// outline). Writes shots/composition-*.png and composition-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-composition.js EDITION=music ENTRY=entry-composition-strip.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css in <dir>, as measure-notebook.ts needs)
//   node scripts/dev/measure-composition.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-composition-view" style="width:640px;height:260px;border:1px solid #ccc"><div class="view-content" id="pane" style="padding:12px"></div></div><script src="harness-composition.js"></script></body></html>`;
const out: any = {};
const p = await openPage({ dir: here, width: 700, height: 300, pageHtml: page, routes: {} });
try {
  await p.ev(`window.__mountStrip(document.getElementById('pane'))`);
  await sleep(300);
  out.rows = await p.ev(`(() => [...document.querySelectorAll('.forge-composition-row')].map((row) => { const r = row.getBoundingClientRect(); const b = row.querySelector('button'); const br = b.getBoundingClientRect(); const d = row.querySelector('.forge-composition-detail'); const dr = d.getBoundingClientRect();
    return { depth: Number(row.dataset.depth), note: b.dataset.note, text: b.textContent, detail: d.textContent, top: r.top, bottom: r.bottom, left: r.left, chipLeft: br.left, chipRight: br.right, chipTop: br.top, chipBottom: br.bottom, detailLeft: dr.left, detailRight: dr.right,
      chipClipped: b.scrollWidth > b.clientWidth + 1, detailClipped: d.scrollWidth > d.clientWidth + 1, rowRight: r.right, display: getComputedStyle(row).display, paddingLeft: getComputedStyle(row).paddingLeft }; }))()`);
  await p.shot(path.join(SHOTS, 'composition-0-start.png'));
  const centre = (i: number) => p.ev(`(() => { const b = document.querySelectorAll('.forge-composition-row')[${i}].querySelector('button'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b }; })()`);
  out.targets = [];
  for (let i = 0; i < out.rows.length; i++) out.targets.push(await centre(i));
  const mouse = async (type: string, x: number, y: number, extra: any = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  const c = out.targets[1];                                                       // the arrangement section
  await mouse('mouseMoved', c.x, c.y, { button: 'none', clickCount: 0 });
  await sleep(100);
  out.afterHover = await p.ev('window.__events.slice()');
  await mouse('mouseMoved', 5, 5, { button: 'none', clickCount: 0 });
  await sleep(100);
  out.afterLeave = await p.ev('window.__events.slice()');
  const n = out.targets[3];                                                       // a nested row (phrase_004 inside intro)
  await mouse('mouseMoved', n.x, n.y, { button: 'none', clickCount: 0 });
  await mouse('mousePressed', n.x, n.y); await mouse('mouseReleased', n.x, n.y);
  await mouse('mouseMoved', 5, 5, { button: 'none', clickCount: 0 });
  await sleep(200);
  out.afterClick = await p.ev('window.__events.slice()');
  out.emphasised = await p.ev(`[...document.querySelectorAll('.forge-composition-row button')].map((b) => ({ note: b.dataset.note, weight: getComputedStyle(b).fontWeight, outline: getComputedStyle(b).outlineStyle + ' ' + getComputedStyle(b).outlineWidth }))`);
  await p.shot(path.join(SHOTS, 'composition-1-clicked.png'));
} finally { p.close(); }
fs.writeFileSync(path.join(here, 'composition-measurements.json'), JSON.stringify(out, null, 2));
const r = out.rows;
const verdicts: Record<string, boolean> = {
  'five rows: the three sections and the two sections of the nested composition': r.length === 5 && r.map((x: any) => x.depth).join('') === '00011',
  'each row is below the one before (no two rows on one line)': r.every((x: any, i: number) => i === 0 || x.top >= r[i - 1].bottom - 1),
  'the nested rows are indented 22 px, the others not at all': r.every((x: any) => Math.abs(x.chipLeft - r[0].chipLeft - x.depth * 22) <= 1),
  'no chip and no detail is clipped': r.every((x: any) => !x.chipClipped && !x.detailClipped),
  'the detail is to the right of its chip, and the chip does not overlap it': r.every((x: any) => x.detailLeft >= x.chipRight - 1),
  'everything fits in the pane (640 px)': r.every((x: any) => x.detailRight <= 640 + 12),
  'a real click at the middle of every chip lands on that chip': out.targets.every((t: any) => t.hit),
  'hovering a chip tells the owner which note; leaving it says none': out.afterHover.join('|') === 'hover arrangements/arr_001' && out.afterLeave.join('|') === 'hover arrangements/arr_001|hover none',
  'a click on a nested chip tells the owner that note': out.afterClick.includes('click phrases/phrase_004'),
  'the clicked note\'s chip is emphasised and no other': out.emphasised.filter((e: any) => e.weight === '700' && /solid/.test(e.outline)).map((e: any) => e.note).join() === 'phrases/phrase_004',
};
console.log(JSON.stringify(out.rows.map((x: any) => ({ depth: x.depth, text: x.text, detail: x.detail, chipLeft: Math.round(x.chipLeft), top: Math.round(x.top) })), null, 1));
for (const [k, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
