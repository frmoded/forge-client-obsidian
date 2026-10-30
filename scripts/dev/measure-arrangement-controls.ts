// 2026-10-30-1040 ("when I mute both, both appear as solo"): the arrangement's row of controls in real Chrome under Obsidian's own stylesheet, with REAL mouse clicks in the driver's order (Solo on latin on, Solo on latin off, Mute rock, Mute latin).
// After every click it reads what the NOTE says (the json) and what each button LOOKS like (its computed background, colour and border), and takes a screenshot. Run from the client repo root:
//   OUT=<dir>/harness-arr-controls.js EDITION=music ENTRY=entry-arrangement-controls.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css in <dir>, as measure-notebook.ts needs)
//   node scripts/dev/measure-arrangement-controls.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-arrangement" style="width:700px;height:260px;border:1px solid #ccc"><div class="view-content" id="pane" style="padding:12px"></div></div><script src="harness-arr-controls.js"></script></body></html>`;
const out: any = {};
const p = await openPage({ dir: here, width: 760, height: 300, pageHtml: page, routes: {} });
try {
  await p.ev(`window.__mountControls(document.getElementById('pane'))`);
  await sleep(300);
  const look = () => p.ev(`(() => [...document.querySelectorAll('.forge-arr-control')].map((row) => { const one = (sel) => { const b = row.querySelector(sel); const c = getComputedStyle(b); return { pressed: b.getAttribute('aria-pressed'), bg: c.backgroundColor, color: c.color, border: c.borderTopColor + ' ' + c.borderTopWidth, weight: c.fontWeight }; };
    return { kit: row.querySelector('.forge-arr-control-kit').textContent, mute: one('.forge-arr-mute'), solo: one('.forge-arr-solo') }; }))()`);
  const click = async (kit: number, which: 'mute' | 'solo') => {
    const c = await p.ev(`(() => { const b = document.querySelectorAll('.forge-arr-control')[${kit}].querySelector('.forge-arr-${which}'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });          // the pointer leaves: no :hover is left on the button
    await sleep(500);                                                                      // the debounce (250 ms) and the write
  };
  const step = async (name: string, kit: number, which: 'mute' | 'solo') => {
    await click(kit, which);
    out[name] = { json: await p.ev('window.__json().replace(/\\s+/g, " ")'), buttons: await look() };
    await p.shot(path.join(SHOTS, `arr-controls-${name}.png`));
  };
  out.start = { json: await p.ev('window.__json().replace(/\\s+/g, " ")'), buttons: await look() };
  await p.shot(path.join(SHOTS, 'arr-controls-0-start.png'));
  await step('1-solo-latin-on', 1, 'solo');
  await step('2-solo-latin-off', 1, 'solo');
  await step('3-mute-rock', 0, 'mute');
  await step('4-mute-latin', 1, 'mute');
  out.lines = await p.ev('window.__lines || []');
} finally { p.close(); }
fs.writeFileSync(path.join(here, 'arr-controls-measurements.json'), JSON.stringify(out, null, 2));
const same = (a: any, b: any) => a.bg === b.bg && a.color === b.color && a.border === b.border;
for (const k of ['1-solo-latin-on', '4-mute-latin']) {
  const rows = out[k].buttons;
  console.log(k, 'json:', out[k].json);
  for (const r of rows) console.log(`   ${r.kit}: mute ${r.mute.pressed} solo ${r.solo.pressed}; a pressed button looks like an unpressed one: mute ${same(r.mute, out.start.buttons[0].mute) ? 'YES' : 'no'}, solo ${same(r.solo, out.start.buttons[0].solo) ? 'YES' : 'no'}; mute and solo look alike: ${same(r.mute, r.solo) ? 'YES' : 'no'}`);
}
