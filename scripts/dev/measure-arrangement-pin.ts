// 2026-10-31-1135 (CCQA smoke 10, C2) in real Chrome: the `Notes pane: rock · bar_001` line under an arrangement's sentence used to be display:none until a row was pinned, so everything below it jumped ~10 px when it appeared. Now it is
// always in the layout with its one line reserved (styles.css `.forge-arrangement-pin`). Measured under Obsidian's own app.css and this repo's styles.css, at a wide (640 px) and a narrow (300 px) pane: the top of the content below
// the line with the line EMPTY and with the line FILLED must be identical (0 px), and the CONTROL (the old display:none -> shown) must jump, or the measure proves nothing. Writes arrangement-pin-measurements.json; exits 1 when a verdict
// is false. Run from the client repo root with app.css and plugin-styles.css (= this repo's styles.css) in <dir>:   node scripts/dev/measure-arrangement-pin.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage } from './cdp.mjs';

const here = process.argv[2];
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light">
<div id="pane" class="view-content" style="width:${w}px;padding:8px"><div class="forge-arrangement-header">arr_001 — rock and latin, 4 bars</div><div id="pin" class="forge-arrangement-pin"></div><div id="below" style="height:40px;background:#ddd">the Score area</div></div></body></html>`;
const out: Record<string, unknown> = {};
for (const width of [640, 300]) {
  const p = await openPage({ dir: here, width: width + 40, height: 400, pageHtml: page(width), routes: {} });
  try {
    const top = `(() => document.getElementById('below').getBoundingClientRect().top)()`;
    const emptyTop = await p.ev(top);
    const pinBox = await p.ev(`(() => { const r = document.getElementById('pin').getBoundingClientRect(); return { height: r.height }; })()`);
    await p.ev(`document.getElementById('pin').textContent = 'Notes pane: rock · bar_001'; 0`);
    const filledTop = await p.ev(top);
    const wraps = await p.ev(`(() => { const e = document.getElementById('pin'); return e.scrollWidth <= e.clientWidth; })()`);
    // the CONTROL: the old behaviour, hidden until pinned
    await p.ev(`document.getElementById('pin').textContent = ''; document.getElementById('pin').style.display = 'none'; 0`);
    const hiddenTop = await p.ev(top);
    await p.ev(`document.getElementById('pin').textContent = 'Notes pane: rock · bar_001'; document.getElementById('pin').style.display = ''; 0`);
    const shownTop = await p.ev(top);
    out[`w${width}`] = { emptyTop, filledTop, shift: filledTop - emptyTop, reservedHeight: (pinBox as { height: number }).height, fitsOnOneLine: wraps, controlShift: shownTop - hiddenTop };
  } finally { await p.close(); }
}
const verdicts = {
  wide: (out.w640 as any).shift === 0 && (out.w640 as any).controlShift > 5 && (out.w640 as any).reservedHeight > 10,
  narrow: (out.w300 as any).shift === 0 && (out.w300 as any).controlShift > 5 && (out.w300 as any).fitsOnOneLine === true,
};
fs.writeFileSync(path.join(here, 'arrangement-pin-measurements.json'), JSON.stringify({ ...out, verdicts }, null, 2));
console.log(JSON.stringify({ ...out, verdicts }));
process.exit(verdicts.wide && verdicts.narrow ? 0 : 1);
