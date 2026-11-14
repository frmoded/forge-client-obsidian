// 2026-11-13-1214 - the chat-style panel (dialog above the prompt box, the Score above that) in real headless Chrome, the REAL engine behind /phrase, the plugin's own
// description controller built through descriptionPortsFor (the factory score-first.ts calls) with settings that hold a URL and a token (or hold nothing) and a STAND-IN service (never the real one, no token ever leaves the page).
// Real mouse events (DevTools Input.dispatchMouseEvent: the suggestion's Apply, the dock toggle, the drag on the resize edge), geometry read from the page (the panel never overlaps the Score), every state shot in light and dark. Run from the client:
//   cp styles.css <dir>/plugin-styles.css (and app.css beside it); OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-chat-panel.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
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
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:760px;height:700px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};
window.__lines=[];const _i=console.info;console.info=(...a)=>{const t=a.map(String).join(' ');if(/^\\[forge-(morph|description|promptbox)\\]/.test(t))window.__lines.push('info  '+t);_i(...a)};
window.__warns=[];const _w=console.warn;console.warn=(...a)=>{const t=a.map(String).join(' ');if(/^\\[forge-promptbox\\]/.test(t))window.__warns.push(t);_w(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

const text = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as any);
const CONTROL_TEXT = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 10, style: 'repeat_with_fills', tempo_change_pct: 0 } as any);
const PLAN = { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const FREE = 'make bar_005 eight bars long, with fills';
const GOOD = 'Extend [[bar_005]] to 6 bars, repeating with fills.';
const SET = { url: 'https://stand-in.invalid', token: 'stand-in-token-never-sent' };
async function open(settings: { url: string; token: string }, planMs = 400, width = 800, height = 800) {
  const q = await openPage({ dir: here, width, height, pageHtml: page.replace('width:760px;height:700px', `width:${width - 40}px;height:${height - 100}px`), routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, settings: ${JSON.stringify(settings)}, plan: ${JSON.stringify(PLAN)}, planMs: ${planMs}, name: 'phrase_001', path: 'phrases/phrase_001.md', phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)} } })`);
  for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && !!document.querySelector('.forge-prompt-box-text')`)) break; await sleep(100); }
  await sleep(1200);
  return q;
}
const ev = (q: any, js: string) => q.ev(js);
const msgs = (q: any): Promise<Array<{ kind: string; text: string }>> => q.ev(`[...document.querySelectorAll('.forge-chat-msg')].map((m) => ({ kind: m.dataset.kind, text: m.querySelector('.forge-chat-text').textContent }))`);
const rect = (q: any, sel: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; })()`);
const geometry = (q: any) => q.ev(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width }; };
  const body = document.querySelector('.forge-chat-body'), host = document.getElementById('pane');
  const panel = r('.forge-chat-panel'), bodyR = r('.forge-chat-body'), score = r('.forge-rhythm-edit-score'), log = document.querySelector('.forge-chat-log');
  const pos = (s) => getComputedStyle(document.querySelector(s)).position;
  return { panel, body: bodyR, score, hostDisplay: getComputedStyle(host).display, hostDir: getComputedStyle(host).flexDirection, positions: [pos('.forge-chat-panel'), pos('.forge-chat-body'), pos('.forge-prompt-box')],
    bodyScrolls: body.scrollHeight > body.clientHeight, logH: log.getBoundingClientRect().height, logScrollsToEnd: log.scrollHeight - log.scrollTop - log.clientHeight < 3, hostScrolls: host.scrollHeight > host.clientHeight + 1 }; })()`);
const shot = async (q: any, name: string, sel = '#pane') => {
  for (const dark of [false, true]) {
    await q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`); await sleep(150);
    const c = await q.ev(`(() => { window.scrollTo(0, 0); const p = document.querySelector(${JSON.stringify(sel)}); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, `${name}${dark ? '-dark' : ''}.png`), Buffer.from(r.result.data, 'base64'));
  }
  await q.ev(`(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); })()`);
};
const setBox = (q: any, t: string) => q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.value = ${JSON.stringify(t)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const realEnter = async (q: any) => { for (const type of ['keyDown', 'keyUp']) await q.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const centre = async (q: any, sel: string) => { const r = await rect(q, sel); if (!r || r.w === 0) throw new Error(`no visible ${sel}`); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
const realClick = async (q: any, sel: string) => { await q.ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'nearest' })`); const c = await centre(q, sel); await q.click(c.x, c.y); await sleep(250); };
const mouse = (q: any, type: string, x: number, y: number) => q.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const out: any = {};

// ---- A: bottom dock. empty -> a sentence applied -> a rejected sentence -> a service suggestion (real click on Apply) -> a control change -> resized
{
  const q = await open(SET, 900);
  try {
    out.empty = { msgs: await msgs(q), geo: await geometry(q), current: await ev(q, `document.querySelector('.forge-chat-current').textContent`), errors: await q.ev('window.__errors.slice()') };
    await shot(q, 'chat-0-empty');
    await setBox(q, GOOD); await realEnter(q); await sleep(500);
    out.applied = { msgs: await msgs(q), current: await ev(q, `document.querySelector('.forge-chat-current').textContent`), strip: await ev(q, `document.querySelectorAll('.forge-description-bar').length`) };
    await shot(q, 'chat-1-applied');
    await setBox(q, 'make bar_005 sideways'); await realEnter(q); await sleep(1500);                    // the service answers (the stand-in extends it to 8 bars)
    out.suggested = { msgs: await msgs(q), actions: await ev(q, `[...document.querySelectorAll('.forge-chat-action')].map((b) => [b.dataset.choice, b.disabled])`), strip: await ev(q, `document.querySelectorAll('.forge-description-bar').length`), geo: await geometry(q) };
    await shot(q, 'chat-2-suggestion');
    await realClick(q, '.forge-chat-action[data-choice="apply"]:not([disabled])'); await sleep(700);
    out.usedSuggestion = { msgs: await msgs(q), actions: await ev(q, `[...document.querySelectorAll('.forge-chat-action')].map((b) => [b.dataset.choice, b.disabled])`), chosen: await ev(q, `[...document.querySelectorAll('.forge-chat-chosen')].map((e) => e.textContent)`), boxText: await ev(q, `document.querySelector('.forge-prompt-box-text').value`) };
    await setBox(q, 'make it nonsense'); await realEnter(q); await sleep(300);
    await ev(q, `(() => { window.__edit('phrases/phrase_001.md', ${JSON.stringify(CONTROL_TEXT)}); window.__descCtl.modified('phrases/phrase_001.md'); })()`); await sleep(500);
    out.control = { msgs: (await msgs(q)).slice(-3), current: await ev(q, `document.querySelector('.forge-chat-current').textContent`) };
    await shot(q, 'chat-3-control');
    // a drag on the top edge of the dialog: up 70 px, with real mouse events; the log gets taller and the panel never covers the Score
    const h0 = await ev(q, `document.querySelector('.forge-chat-log').getBoundingClientRect().height`);
    const c = await centre(q, '.forge-chat-resize');
    await mouse(q, 'mouseMoved', c.x, c.y); await mouse(q, 'mousePressed', c.x, c.y); await mouse(q, 'mouseMoved', c.x, c.y - 35); await mouse(q, 'mouseMoved', c.x, c.y - 70); await mouse(q, 'mouseReleased', c.x, c.y - 70); await sleep(300);
    out.resized = { before: h0, after: await ev(q, `document.querySelector('.forge-chat-log').getBoundingClientRect().height`), geo: await geometry(q), bodyShrank: true };
    await shot(q, 'chat-4-resized');
    out.errors = await q.ev('window.__errors.slice()');
    out.lines = await q.ev('window.__lines.slice()');
  } finally { q.close(); }
}
// ---- B: the right dock, real click on the toggle
{
  const q = await open(SET, 900, 1100, 760);
  try {
    await setBox(q, GOOD); await realEnter(q); await sleep(500);
    await realClick(q, '.forge-chat-dock'); await sleep(400);
    out.right = { label: await ev(q, `document.querySelector('.forge-chat-dock').textContent`), geo: await geometry(q), msgs: await msgs(q), handleHidden: await ev(q, `getComputedStyle(document.querySelector('.forge-chat-resize')).display`) };
    await shot(q, 'chat-5-dock-right');
    await setBox(q, 'make bar_005 sideways'); await realEnter(q); await sleep(1500);
    out.rightSuggestion = { actions: await ev(q, `[...document.querySelectorAll('.forge-chat-action')].map((b) => [b.dataset.choice, b.disabled])`) };
    await shot(q, 'chat-6-dock-right-suggestion');
    await realClick(q, '.forge-chat-dock'); await sleep(300);
    out.backToBottom = { label: await ev(q, `document.querySelector('.forge-chat-dock').textContent`), geo: await geometry(q) };
    out.errorsB = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}
const g = out.empty.geo;
// the panel starts where the body (which holds the Score and scrolls on its own: the Score may be taller than it) ends, and nothing is positioned
const noOverlapBottom = (geo: any) => geo.panel.top >= geo.body.bottom - 1 && geo.panel.bottom <= geo.body.bottom + geo.panel.h + 1 && geo.positions.every((p: string) => p === 'static');
out.verdicts = {
  flexColumn: g.hostDisplay === 'flex' && g.hostDir === 'column',
  panelBelowBodyNoOverlap: noOverlapBottom(g) && !g.hostScrolls,
  noPositionedPanel: g.positions.every((p: string) => p === 'static'),
  emptyDialogHasNoMessages: out.empty.msgs.length === 0,
  appliedSaysYouThenApplied: JSON.stringify(out.applied.msgs.map((m: any) => m.kind)) === '["you","applied"]' && /^Applied \(4 -> 6 bars\)/.test(out.applied.msgs[1].text) && /Current: Extend \[\[bar_005\]\] to 6 bars/.test(out.applied.current),
  rejectedThenAskingThenSuggestion: JSON.stringify(out.suggested.msgs.slice(2).map((m: any) => m.kind)) === '["you","rejected","asking","suggestion"]' && /line 1, column \d+/.test(out.suggested.msgs[3].text),
  suggestionHasLiveButtonsAndStripIsEmpty: JSON.stringify(out.suggested.actions) === '[["apply",false],["cancel",false]]' && out.suggested.strip === 0,
  suggestionStillBelowTheScore: noOverlapBottom(out.suggested.geo),
  realClickOnApplyWritesAndDisables: out.usedSuggestion.chosen.join() === 'Applied.' && out.usedSuggestion.actions.every((a: any) => a[1] === true) && /Applied \(6 -> 8 bars\)/.test(out.usedSuggestion.msgs.at(-1).text),
  controlChangeIsInTheHistory: out.control.msgs.some((m: any) => m.kind === 'control' && /^Controls: /.test(m.text)) && /Current:/.test(out.control.current),
  dragResizesTheDialog: out.resized.after > out.resized.before + 50 && noOverlapBottom(out.resized.geo),
  dialogScrollsToNewest: out.suggested.geo.logScrollsToEnd,
  rightDock: out.right.label === 'Dock: right' && out.right.geo.hostDir === 'row' && out.right.geo.panel.left >= out.right.geo.body.right - 1 && out.right.geo.body.w / (out.right.geo.body.w + out.right.geo.panel.w) > 0.5 && out.right.geo.body.w / (out.right.geo.body.w + out.right.geo.panel.w) < 0.7 && out.right.handleHidden === 'none',
  rightDockPanelIsFullHeight: Math.abs(out.right.geo.panel.h - out.right.geo.body.h) < 2,
  rightDockSuggestionWorks: JSON.stringify(out.rightSuggestion.actions) === '[["apply",false],["cancel",false]]',
  backToBottom: out.backToBottom.label === 'Dock: bottom' && out.backToBottom.geo.hostDir === 'column',
  noConsoleErrors: [...out.errors, ...out.errorsB].filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,
};
fs.writeFileSync(path.join(here, 'chat-panel.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ geo: g, applied: out.applied, suggested: { msgs: out.suggested.msgs, actions: out.suggested.actions }, usedSuggestion: out.usedSuggestion, control: out.control, resized: { b: out.resized.before, a: out.resized.after }, right: out.right.geo }, null, 1).slice(0, 4500));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-chat-panel: a verdict failed'); process.exit(1); }
