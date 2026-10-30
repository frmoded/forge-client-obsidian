// 2026-10-30-1020 — selecting bars for the notebook, in the REAL phrase tab in real Chrome with Obsidian's own stylesheet: a real mouse drag across bars 3 to 5 of phrase_003's Score, a real Shift-click, a click on a number. Proof by screenshots and by what the
// browser says (not happy-dom): the tint on the Score, the numbers filled, the chip, the pin untouched, the Run row in view. Run from the client repo root:
//   node scripts/dev/browser-proof.mjs --out <dir>      (once: it leaves app.css and plugin-styles.css in <dir>; or copy them)
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-notebook.ts <dir>          (writes <dir>/shots/notebook-*.png and <dir>/notebook-measurements.json)
// WALL-CLOCK ONLY (no virtual time). The real engine runs in Node behind /phrase; everything else is real Chrome. PANE_W (default 1500) matters: at 100% zoom bar 5 of this Score starts at x = 864 px, so in a 760 px pane a drag cannot reach it (the Score scrolls sideways inside its host; there is no auto-scroll at the edge) - measured 2026-10-30.
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const BARS = Number(process.env.BARS ?? 8);
const phraseText = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: BARS, style: 'repeat_with_fills', tempo_change_pct: 0 }, null, 2)}\n\`\`\`\n`;
const py = await engine();
const routes = {
  'POST /phrase': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, params, title } = JSON.parse(body);
    try { const payload = computePhrase(py, data, params, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:${process.env.PANE_W ?? 1500}px;height:${process.env.PANE_H ?? 700}px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

const out: any = { bars: BARS };
const p = await openPage({ dir: here, width: Number(process.env.PANE_W ?? 1500) + 100, height: 800, pageHtml: page, routes });
const MOD_SHIFT = 8;
try {
  await p.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(phraseText)}, bar: ${JSON.stringify(BAR)}, path: 'phrases/phrase_003.md', name: 'phrase_003', notebook: true })`);
  for (let w = 0; w < 30000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && document.querySelectorAll('.forge-notebook-bar').length === ${BARS}`)) break; await sleep(100); }
  await sleep(800);
  const state = () => p.ev(`(() => {
    const pane = document.getElementById('pane'); const pr = pane.getBoundingClientRect();
    const inView = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1; };
    return {
      chips: [...document.querySelectorAll('.forge-notebook-chips .forge-notebook-chip')].map((c) => c.textContent),
      hint: (() => { const h = document.querySelector('.forge-notebook-hint'); return h ? { text: h.textContent, shown: getComputedStyle(h).display !== 'none' } : null; })(),
      pressed: [...document.querySelectorAll('.forge-notebook-bar')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.textContent)),
      tinted: [...document.querySelectorAll('.forge-selected-bar')].map((r) => r.parentNode.id),
      tintBoxes: [...document.querySelectorAll('.forge-selected-bar')].map((r) => { const b = r.getBoundingClientRect(); return { bar: r.parentNode.id, w: Math.round(b.width), h: Math.round(b.height) }; }),
      pinned: [...document.querySelectorAll('.forge-artifact-pinned')].map((e) => e.id),
      runRowInView: inView(document.querySelector('.forge-notebook-do')), chipLineInView: inView(document.querySelector('.forge-notebook-chips')),
      scrollTop: Math.round(pane.scrollTop), scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight,
      blocks: [...pane.children].map((c) => c.className.toString().split(' ')[0] + ':' + Math.round(c.getBoundingClientRect().height)),
      rects: { pane: [Math.round(pr.top), Math.round(pr.bottom)], chips: (() => { const r = document.querySelector('.forge-notebook-chips').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })(), run: (() => { const r = document.querySelector('.forge-notebook-do').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })() },
      barButtonLook: (() => { const b = document.querySelector('.forge-notebook-bar'); const c = getComputedStyle(b); return { border: c.borderTopWidth + ' ' + c.borderTopStyle, radius: c.borderTopLeftRadius, cursor: c.cursor, bg: c.backgroundColor }; })(),
      selectedLook: (() => { const b = document.querySelector('.forge-notebook-bar[aria-pressed="true"]'); if (!b) return null; const c = getComputedStyle(b); return { bg: c.backgroundColor, color: c.color }; })(),
    }; })()`);
  const box = (n: number) => p.ev(`(() => { const r = document.querySelector('#ph_bar_${n}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; })()`);
  const mouse = (type: string, x: number, y: number, extra: object = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
  const b3 = await box(3), b4 = await box(4), b5 = await box(5);
  out.hit = await p.ev(`(() => { const e = document.elementFromPoint(${b3.x}, ${b3.y}); return e ? e.tagName + '.' + (e.getAttribute('class') || '') : null; })()`);
  await p.ev(`document.getElementById('pane').scrollTop = 0`);
  out.before = await state();
  await p.shot(path.join(SHOTS, 'notebook-0-nothing-selected.png'));

  // 1. a real drag from bar 3 to bar 5 (mouse down, moves through bar 4, up), then the browser's own click
  await mouse('mouseMoved', b3.x, b3.y); await mouse('mousePressed', b3.x, b3.y);
  for (const b of [b4, b5]) { await mouse('mouseMoved', b.l + 10, b.y, { buttons: 1 }); await mouse('mouseMoved', b.x, b.y, { buttons: 1 }); }
  out.midDrag = await state();
  await mouse('mouseReleased', b5.x, b5.y, { buttons: 0 });
  await sleep(300);
  out.afterDrag = await state();
  await p.shot(path.join(SHOTS, 'notebook-1-after-drag-3-to-5.png'));

  // 2. the row picker: "kick" joins the chip
  await p.ev(`[...document.querySelectorAll('.forge-notebook-rows button')].find((b) => b.textContent === 'kick').click()`);
  await sleep(200);
  out.withRow = await state();
  await p.shot(path.join(SHOTS, 'notebook-2-bars-3-to-5-kick-row.png'));

  // 3. a real Shift-click on bar 7 extends; the pin and the notes pane are untouched
  const b7 = await box(7);
  await mouse('mouseMoved', b7.x, b7.y); await mouse('mousePressed', b7.x, b7.y, { modifiers: MOD_SHIFT }); await mouse('mouseReleased', b7.x, b7.y, { modifiers: MOD_SHIFT });
  await sleep(300);
  out.afterShiftClick = await state();
  await p.shot(path.join(SHOTS, 'notebook-3-after-shift-click-7.png'));

  // 4. a plain click on bar 2 pins it (the old gesture) and does not select; a second drag then leaves that pin where it is
  const b2 = await box(2), b1 = await box(1);
  await mouse('mouseMoved', b2.x, b2.y); await mouse('mousePressed', b2.x, b2.y); await mouse('mouseReleased', b2.x, b2.y); await sleep(300);
  out.afterPlainClick = await state();
  await p.ev(`document.getElementById('pane').scrollTop = 0`); await sleep(300);        // the Score is where it was: the boxes are read again, the page has scrolled since
  const c2 = await box(2), c6 = await box(6);
  await mouse('mouseMoved', c6.x, c6.y); await mouse('mousePressed', c6.x, c6.y); await mouse('mouseMoved', c2.x + 40, c2.y, { buttons: 1 }); await mouse('mouseMoved', c2.x, c2.y, { buttons: 1 }); await mouse('mouseReleased', c2.x, c2.y); await sleep(300);
  out.afterSecondDrag = await state();
  await p.shot(path.join(SHOTS, 'notebook-4-pin-on-2-then-a-backwards-drag-6-to-2.png'));

  // 5. a click on a number tints the Score too
  await p.ev(`[...document.querySelectorAll('.forge-notebook-bar')][5].click()`); await sleep(200);
  out.afterNumber = await state();
  out.notebookLines = await p.ev('window.__notebookLines || []');
  out.errors = await p.ev('window.__errors.slice()');
} finally { p.close(); }
fs.writeFileSync(path.join(here, 'notebook-measurements.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
