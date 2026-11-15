// 2026-11-15-1217 - the music tabs in real headless Chrome: the Score engraved for the width of its pane (it WRAPS into systems and the tab scrolls vertically, no horizontal scrollbar from 800 px down to 320 px, for 16, 32 and 64 bars), re-engraved when the dock moves it
// (the right dock halves the width), a bar in the SECOND system pinned by a real click, and the controllers and the inspector box gone by default (with the switches on they are back). The phrase rig, the real engine behind /phrase, real mouse clicks. Run from the client:
//   cp styles.css <dir>/plugin-styles.css (app.css beside it); OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-music-tabs.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots-1217'); fs.mkdirSync(SHOTS, { recursive: true });
const FX = (n: string) => fs.readFileSync(new URL(`../../test/fixtures/score-first/${n}.md`, import.meta.url), 'utf8');
const BAR = FX('bar_005'), BAR6 = FX('bar_006');
const py = await engine();
const routes = {
  'POST /phrase': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, params, title } = JSON.parse(body);
    try { const payload = computePhrase(py, data, params, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const pageFor = (w: number, h: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:${w}px;height:${h}px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;
const noteFor = (kind: 'extend' | 'mix' | 'morph', bars = 4) => noteContentFor('phrase_001', (kind === 'extend' ? { kind: 'extend', source: 'bar_005', bars, style: 'repeat_with_fills', tempo_change_pct: 0 } : kind === 'mix' ? { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } : { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 4, order: 'musical', seed: 0 }) as any);
async function open(opts: { kind?: 'extend' | 'mix' | 'morph'; bars?: number; width?: number; height?: number; legacy?: boolean; inspector?: boolean }) {
  const width = opts.width ?? 800, height = opts.height ?? 760;
  const q = await openPage({ dir: here, width: width + 20, height: height + 60, pageHtml: pageFor(width, height), routes });
  const mount = { describe: true, settings: { url: 'https://stand-in.invalid', token: 'stand-in-token' }, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 }, planMs: 100, hideStatus: !opts.legacy, legacyControllers: opts.legacy === true, showInspector: opts.inspector === true, name: 'phrase_001', path: 'phrases/phrase_001.md', phrase: noteFor(opts.kind ?? 'extend', opts.bars ?? 4), bar: BAR, bars: { bar_006: BAR6 } };
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), ${JSON.stringify(mount)})`);
  for (let w = 0; w < 60000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && !!document.querySelector('.forge-prompt-box-text')`)) break; await sleep(100); }
  await sleep(1500);
  return q;
}
const score = (q: any) => q.ev(`(() => { const host = document.querySelector('.forge-rhythm-score-host'), wrap = host.querySelector('.forge-output-score') || host, svgs = [...wrap.querySelectorAll('svg')].filter((s) => s.querySelector('g.system')), body = document.querySelector('.forge-chat-body'); const hr = host.getBoundingClientRect();
  const widths = svgs.map((s) => Math.round(s.getBoundingClientRect().width)), heights = svgs.map((s) => Math.round(s.getBoundingClientRect().height));
  return { hostW: Math.round(hr.width), svgW: Math.max(...widths), pages: svgs.length, svgH: heights.reduce((a, b) => a + b, 0), systems: svgs.reduce((a, s) => a + s.querySelectorAll('g.system').length, 0), measures: svgs.reduce((a, s) => a + s.querySelectorAll('g.measure').length, 0), wrapScrollW: wrap.scrollWidth, wrapClientW: wrap.clientWidth, wrapScrollsX: wrap.scrollWidth > wrap.clientWidth + 1, bodyScrollsX: body.scrollWidth > body.clientWidth + 1, bodyW: body.clientWidth, bodyScrollsY: body.scrollHeight > body.clientHeight + 1, bodyScrollH: body.scrollHeight, bodyClientH: body.clientHeight, scrollTop: body.scrollTop }; })()`);
const shot = async (q: any, name: string, sel = '#pane') => {
  for (const dark of [false, true]) {
    await q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`); await sleep(150);
    const c = await q.ev(`(() => { window.scrollTo(0, 0); const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, `${name}${dark ? '-dark' : ''}.png`), Buffer.from(r.result.data, 'base64'));
  }
  await q.ev(`(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); })()`);
};
const centreOf = (q: any, expr: string) => q.ev(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const out: any = {}; const verdicts: Record<string, boolean> = {};

// ---- 1. wrap: no horizontal scroll at any width, for 16 / 32 / 64 bars; vertical scroll instead
out.wrap = {};
for (const [bars, width] of [[16, 800], [32, 800], [32, 520], [32, 360], [32, 320], [64, 800], [64, 360]] as const) {
  const q = await open({ bars, width, height: 700 });
  try { const s = await score(q); out.wrap[`${bars}b@${width}`] = s; if (bars === 32 && width === 800) await shot(q, 'wrap-32-bars-stacked'); if (bars === 32 && width === 360) await shot(q, 'wrap-32-bars-360'); } finally { q.close(); }
}
for (const [k, s] of Object.entries<any>(out.wrap)) {
  verdicts[`wrap_${k}_noHorizontalScroll`] = !s.wrapScrollsX && !s.bodyScrollsX;
  verdicts[`wrap_${k}_fillsThePane`] = s.svgW >= s.hostW - 18 && s.svgW <= s.hostW - 14;                           // the engraving is as wide as the box it sits in (the host less the 16 px of its padding)
  verdicts[`wrap_${k}_wrapsIntoSystems`] = s.systems >= 2 && s.measures === 2 * Number(k.split('b')[0]);        // two staves (Kick, Snare): two measure groups a bar
}
verdicts.wrap_32bars_scrollsVertically = out.wrap['32b@800'].bodyScrollsY && out.wrap['64b@800'].bodyScrollsY;
verdicts.wrap_narrowerMeansMoreSystems = out.wrap['32b@360'].systems > out.wrap['32b@800'].systems;

// ---- 2. the dock: the right dock halves the width: the Score is engraved again for it; the scroll keeps its place; a bar in the second system pins
{
  const q = await open({ bars: 32, width: 900, height: 700, inspector: false, legacy: false });
  try {
    const before = await score(q);
    await q.ev(`(() => { const b = document.querySelector('.forge-chat-body'); b.scrollTop = (b.scrollHeight - b.clientHeight) / 2; })()`); await sleep(200);
    const mid = await score(q);
    const c = await centreOf(q, `document.querySelector('.forge-chat-dock')`); await q.click(c.x, c.y); await sleep(1800);
    const after = await score(q);
    out.dock = { before, mid, after };
    verdicts.dock_engravedAgainForTheNarrowerPane = after.hostW < before.hostW * 0.75 && after.svgW >= after.hostW - 18 && after.svgW <= after.hostW - 14 && after.systems > before.systems;
    verdicts.dock_noHorizontalScroll = !after.wrapScrollsX && !after.bodyScrollsX;
    const ratio = (x: any) => x.scrollTop / Math.max(1, x.bodyScrollH - x.bodyClientH);
    const expected = mid.scrollTop / Math.max(1, mid.bodyScrollH - after.bodyClientH);                                // the scroll the browser kept when the dock changed the body's height, taken as the same fraction of the new Score
    verdicts.dock_scrollKeepsItsRelativePlace = Math.abs(ratio(after) - expected) < 0.06;
    await shot(q, 'wrap-32-bars-right-dock');
    // a real click on a bar in the SECOND system pins it (the inspector's box is off, the pin is not)
    const second = await centreOf(q, `[...document.querySelectorAll('.forge-rhythm-score-host svg g.system')][1].querySelector('g.measure')`);
    await q.click(second.x, second.y); await sleep(400);
    out.pin = await q.ev(`(() => ({ pinned: document.querySelectorAll('.forge-artifact-pinned').length, pins: (window.__pins || []).slice(), inspectorBox: document.querySelectorAll('.forge-inspector-title, .forge-inspector-body, .forge-inspector-notes').length }))()`);
    verdicts.pin_barInTheSecondSystemPins = out.pin.pinned >= 1;
    verdicts.pin_noInspectorBox = out.pin.inspectorBox === 0;
    await shot(q, 'wrap-pinned-bar-second-system');
    // the dialog resized: only the height changes: no re-engraving (the Score's svg element stays the same node)
    await q.ev(`window.__svgNode = document.querySelector('.forge-rhythm-score-host svg')`);
    await q.ev(`(() => { const h = document.querySelector('.forge-chat-resize'); })()`);
    out.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}

// ---- 3. the three kinds of phrase tab with the controllers gone (default) and, for contrast, with the switches on
out.tabs = {};
for (const kind of ['extend', 'mix', 'morph'] as const) {
  const off = await open({ kind, width: 800, height: 640 }); const on = await open({ kind, width: 800, height: 640, legacy: true, inspector: true });
  try {
    const probe = (q: any) => q.ev(`(() => ({ inputs: document.querySelectorAll('.forge-phrase-controls, .forge-mix-controls, .forge-morph-controls, .forge-notebook, .forge-phrase-bars').length, controlsInputs: [...document.querySelectorAll('.forge-chat-body input, .forge-chat-body select')].length, dialog: !!document.querySelector('.forge-chat-log'), box: !!document.querySelector('.forge-prompt-box'), score: !!document.querySelector('.forge-rhythm-score-host svg'), status: document.querySelector('.forge-prompt-box-state').textContent }))()`);
    out.tabs[kind] = { off: await probe(off), on: await probe(on) };
    await shot(off, `tab-${kind}-controllers-off`); await shot(on, `tab-${kind}-controllers-on`);
  } finally { off.close(); on.close(); }
}
for (const kind of ['extend', 'mix', 'morph']) {
  const t = out.tabs[kind];
  verdicts[`tab_${kind}_offIsScoreDialogBox`] = t.off.inputs === 0 && t.off.controlsInputs === 0 && t.off.dialog && t.off.box && t.off.score;
  verdicts[`tab_${kind}_onHasTheStripBack`] = t.on.inputs >= 1 && t.on.controlsInputs >= 2;
}
verdicts.noConsoleErrors = (out.errors ?? []).filter((e: string) => !/\[forge-player\] sounds could not be loaded|Failed to load resource/.test(e)).length === 0;

fs.writeFileSync(path.join(here, 'music-tabs-1217.json'), JSON.stringify({ ...out }, null, 1));
console.log(JSON.stringify({ wrap: out.wrap, dock: out.dock, pin: out.pin, tabs: out.tabs }, null, 1).slice(0, 5000));
console.log(JSON.stringify(verdicts, null, 1));
const bad = Object.entries(verdicts).filter(([, v]) => v !== true);
console.log(`${Object.keys(verdicts).length} verdicts, ${bad.length ? 'NOT all true: ' + bad.map(([k]) => k).join(', ') : 'all true'}`);
process.exit(bad.length ? 1 : 0);
