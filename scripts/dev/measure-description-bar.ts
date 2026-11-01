// 2026-10-31-1120 (M15c) in real Chrome: the description bar at a wide and a NARROW pane (the notes pane is narrow): the grammar error sentence (with its line and column), the three buttons, and the sentence service's preview. Measures that the bar never
// overflows its pane, no message or button text is clipped, every button is at least 20 px high and its centre IS that button (so a real click lands), a REAL mouse click reaches the owner, and the content below the bar starts one margin under it (no overlap).
// Writes shots/description-bar-*.png and description-bar-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-description-bar.js EDITION=music ENTRY=entry-description-bar.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-description-bar.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light"><div class="workspace-leaf-content" style="width:${w}px;border:1px solid #ccc"><div class="view-content" id="pane" style="padding:12px"></div></div><script src="harness-description-bar.js"></script></body></html>`;
const out: any = {};
const MESSAGE = 'Description, line 1, column 28: expected "bars", but found "barz" after the number of bars in this extend sentence.';
for (const width of [640, 300]) {
  const p = await openPage({ dir: here, width: width + 40, height: 520, pageHtml: page(width), routes: {} });
  try {
    await p.ev(`window.__mount(document.getElementById('pane'))`);
    const below = `(() => document.getElementById('below').getBoundingClientRect().top)()`;
    const top0 = await p.ev(below);
    await p.ev(`window.__bar.show({ message: ${JSON.stringify(MESSAGE)}, actions: ['revert', 'ask'] }); 0`);
    await sleep(100);
    const m = (cls: string) => `(() => { const e = document.querySelector('${cls}'); const r = e.getBoundingClientRect(); const pane = document.getElementById('pane').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, paneRight: pane.right, clipped: e.scrollWidth > e.clientWidth + 1, overflowsPane: r.right > pane.right + 0.5 }; })()`;
    const key = `w${width}`;
    out[key] = { bar: await p.ev(m('.forge-description-bar')), message: await p.ev(m('.forge-description-message')) };
    out[key].buttons = await p.ev(`[...document.querySelectorAll('.forge-description-button')].map((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { label: b.textContent, w: r.width, h: r.height, right: r.right, hitIsSelf: hit === b, clipped: b.scrollWidth > b.clientWidth + 1 }; })`);
    void top0; out[key].gapBelow = (await p.ev(below)) - out[key].bar.bottom;                      // the note below starts one margin (6 px) under the bar: nothing overlaps it
    await p.shot(path.join(SHOTS, `description-bar-error-${width}.png`));
    const c = out[key].buttons[0]; const r0 = await p.ev(`(() => { const b = document.querySelector('[data-action="revert"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r0.x, y: r0.y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r0.x, y: r0.y, button: 'left', clickCount: 1 });
    await sleep(50); out[key].heard = await p.ev('window.__heard.slice()'); void c;
    await p.ev(`window.__bar.show({ message: 'The sentence service suggests this. Nothing is written until you press Apply.', actions: ['apply-preview', 'cancel-preview'], preview: { description: 'Extend [[bar_007]] to 12 bars, repeating with fills, a bit slower than before, at ten percent less tempo.', recipe: 'Take [[bar_007]].\\nRepeat it for 12 bars with fills.\\nSlow it by 10 percent.' } }); 0`);
    await sleep(100);
    out[key].preview = { bar: await p.ev(m('.forge-description-bar')), description: await p.ev(m('.forge-description-preview-description')), recipe: await p.ev(m('.forge-description-preview-recipe')) };
    await p.shot(path.join(SHOTS, `description-bar-preview-${width}.png`));
  } finally { await p.close?.(); }
}
const ok = (w: any) => w.bar.overflowsPane === false && w.message.clipped === false && w.bar.clipped === false && w.buttons.every((b: any) => b.h >= 20 && b.hitIsSelf && !b.clipped && b.right <= w.bar.paneRight + 0.5)
  && Math.abs(w.gapBelow - 6) < 2 && w.heard.length === 1 && w.heard[0] === 'revert'
  && w.preview.bar.overflowsPane === false && w.preview.description.overflowsPane === false && w.preview.recipe.overflowsPane === false && w.preview.description.clipped === false;
out.verdicts = { wide: ok(out.w640), narrow: ok(out.w300) };
fs.writeFileSync(path.join(here, 'description-bar-measurements.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.verdicts));
if (!Object.values(out.verdicts).every(Boolean)) { console.log(JSON.stringify({ w300: { bar: out.w300.bar, buttons: out.w300.buttons, gapBelow: out.w300.gapBelow, heard: out.w300.heard, preview: out.w300.preview } }).slice(0, 1500)); process.exitCode = 1; }
