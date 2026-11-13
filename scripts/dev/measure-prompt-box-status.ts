// 2026-11-13-1211 - BUG, second round: in real Obsidian the prompt box's Apply ended at "edited, not applied" with nothing in the console and no visible outcome. Real headless Chrome, the REAL engine behind /phrase, the plugin's own
// description controller built through descriptionPortsFor (the factory score-first.ts calls) with settings that hold a URL and a token (or hold nothing) and a STAND-IN service (never the real one, no token ever leaves the page).
// Every state of the one status line under the box is shot, in light and dark; the console lines are read from the page. Run from the client:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css)
//   node scripts/dev/measure-prompt-box-status.ts <dir>
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
const PLAN = { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const FREE = 'make bar_005 eight bars long, with fills';
const GOOD = 'Extend [[bar_005]] to 6 bars, repeating with fills.';
async function open(settings: { url: string; token: string }, planMs = 400) {
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, settings: ${JSON.stringify(settings)}, plan: ${JSON.stringify(PLAN)}, planMs: ${planMs}, name: 'phrase_001', path: 'phrases/phrase_001.md', phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)} } })`);
  for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && !!document.querySelector('.forge-prompt-box-text')`)) break; await sleep(100); }
  await sleep(1200);
  return q;
}
const g = (q: any, sel: string, prop: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e[${JSON.stringify(prop)}] : null; })()`);
const status = (q: any): Promise<string> => g(q, '.forge-prompt-box-state', 'textContent');
const lines = (q: any): Promise<string[]> => q.ev(`window.__lines.slice()`);
const warns = (q: any): Promise<string[]> => q.ev(`window.__warns.slice()`);
const shot = async (q: any, name: string) => {
  for (const dark of [false, true]) {
    await q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`); await sleep(150);
    const c = await q.ev(`(() => { window.scrollTo(0, 0); const e = document.querySelector('.forge-prompt-box'); e.scrollIntoView({ block: 'end' }); const p = document.getElementById('pane'); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, `${name}${dark ? '-dark' : ''}.png`), Buffer.from(r.result.data, 'base64'));
  }
  await q.ev(`(() => { document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); })()`);
};
const setBox = (q: any, t: string) => q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.value = ${JSON.stringify(t)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const realEnter = async (q: any) => { for (const type of ['keyDown', 'keyUp']) await q.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const out: any = {};
const SET = { url: 'https://stand-in.invalid', token: 'stand-in-token-never-sent' };

// ---- A: settings set, a free sentence: opened, asking, answered
{
  const q = await open(SET, 1200);
  try {
    out.A_opened = { status: await status(q), lines: await lines(q) };
    await shot(q, 'status-0-opened');
    await setBox(q, FREE); out.A_typed = await status(q);
    await realEnter(q); await sleep(350);
    out.A_asking = { status: await status(q), lines: await lines(q) };
    await shot(q, 'status-1-asking');
    await sleep(1500);
    out.A_answered = { status: await status(q), buttons: await q.ev(`[...document.querySelectorAll('.forge-description-button')].map((b) => b.dataset.action)`), lines: await lines(q), asked: await q.ev('(window.__asked || []).slice()') };
    await shot(q, 'status-2-answered');
    await setBox(q, FREE + ' x'); out.A_cleared = await status(q);
    out.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}
// ---- B: settings EMPTY: the service is not set up, said under the box and warned
{
  const q = await open({ url: '', token: '' });
  try {
    await setBox(q, FREE); await realEnter(q); await sleep(500);
    out.B = { status: await status(q), strip: await g(q, '.forge-description-message', 'textContent'), lines: await lines(q), warns: await warns(q), asked: await q.ev('(window.__asked || []).length') };
    await shot(q, 'status-3-not-set-up');
  } finally { q.close(); }
}
// ---- C: a sentence the grammar accepts: Applied.
{
  const q = await open(SET);
  try {
    await setBox(q, GOOD); await realEnter(q); await sleep(1500);
    out.C = { status: await status(q), lines: await lines(q), boxText: await g(q, '.forge-prompt-box-text', 'value') };
    await shot(q, 'status-4-applied');
  } finally { q.close(); }
}
const one = (ls: string[], re: RegExp) => ls.filter((l) => re.test(l)).length === 1;
out.verdicts = {
  opened_saysTheBuildIsLiveAndTheGate: out.A_opened.lines.some((l: string) => /\[forge-promptbox\] box mounted: phrase_001 family=phrase askPlan=present configured=true/.test(l)) && out.A_opened.status === '',
  typed_isEditedNotApplied: out.A_typed === 'edited, not applied',
  asking_statusSaysAsking: out.A_asking.status === 'Asking the sentence service...',
  asking_linesInOrder: (() => { const ls = out.A_asking.lines.filter((l: string) => !/box mounted/.test(l)).map((l: string) => l.replace(/^info  /, '')); return ls[0] === '[forge-promptbox] apply pressed: phrase_001 family=phrase text=' + FREE.length + ' chars' && ls[1] === '[forge-promptbox] grammar verdict: rejected' && ls[2] === '[forge-promptbox] service gate: askPlan=present configured=true' && ls[3] === '[forge-description] asking the service about phrase_001'; })(),
  answered_previewAndStatus: JSON.stringify(out.A_answered.buttons) === JSON.stringify(['apply-preview', 'cancel-preview']) && out.A_answered.status === 'The service answered: see the preview at the top.' && out.A_answered.asked.length === 1,
  answered_tracedBack: out.A_answered.lines.some((l: string) => /asked the service about phrase_001 -> extend/.test(l)),
  editing_clearsTheStatus: out.A_cleared === 'edited, not applied',
  notSetUp_statusSaysSo: out.B.status === 'The sentence service is not set up: add its URL and token in Settings -> Forge.' && out.B.asked === 0,
  notSetUp_warned: out.B.warns.includes('[forge-promptbox] service gate: askPlan=present configured=false'),
  applied_statusSaysApplied: out.C.status === 'Applied.' && out.C.lines.some((l: string) => /\[forge-description\] applied phrase_001/.test(l)),
  noTokenOrUrlInAnyLine: ![...out.A_answered.lines, ...out.B.lines, ...out.B.warns, ...out.C.lines].some((l: string) => /stand-in/.test(l)),
  noConsoleErrors: out.errors.filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,
};
fs.writeFileSync(path.join(here, 'prompt-box-status.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ A_opened: out.A_opened, A_asking: out.A_asking, A_answered: out.A_answered, B: out.B, C: out.C }, null, 1).slice(0, 3500));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-prompt-box-status: a verdict failed'); process.exit(1); }
