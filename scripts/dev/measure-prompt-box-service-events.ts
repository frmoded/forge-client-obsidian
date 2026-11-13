// 2026-11-13-1209 - BUG: in real Obsidian the prompt box says "Asking the sentence service..." and then nothing (no preview, no message, no console trace). Real headless Chrome, the REAL engine behind /phrase, the plugin's own
// description controller beside the tab, and a STAND-IN service that answers only after 1.5 s (never the real one). 0.5 s after the request left, the rig does what real Obsidian does meanwhile: an `inspect` (a file-open or a layout
// change) and a vault `modify` of the note (the controller's debounce then re-reads the note at about 1.1 s). On the FIXED tree the preview appears and the console shows both trace lines; built from the commit BEFORE the fix
// (`--before`) the same run shows the answer lost without a word. A second run types on in the box while the service thinks: the answer is dropped, but a message appears under the box and in the strip and a trace says why. Run from the client:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts [CLIENT=<worktree of the commit before the fix>] node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css)
//   node scripts/dev/measure-prompt-box-service-events.ts <dir> [--before]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};window.__lines=[];const _i=console.info;console.info=(...a)=>{const t=a.map(String).join(' ');if(/^\\[forge-(morph|description)\\]/.test(t))window.__lines.push(t);_i(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

async function open(kind: 'morph' | 'mix' | 'extend', text: string, extraBars: Record<string, string> = {}, rig: { plan?: object; planMs?: number; interleaveMs?: number } = {}) {
  const n = kind === 'morph' ? 4 : kind === 'mix' ? 2 : 1;
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, plan: ${JSON.stringify(rig.plan ?? null)}, planMs: ${rig.planMs ?? 400}, interleaveMs: ${rig.interleaveMs ?? 'undefined'}, name: 'phrase_001', path: 'phrases/phrase_001.md', phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, ...${JSON.stringify(extraBars)} }, path: 'phrases/phrase_00${n}.md', name: 'phrase_00${n}' })`);
  for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
  await sleep(1500);
  // a swap = the OLD engraving host leaves the panel (the new one was revealed in the same tick): the moment the person SEES the new Score
  await q.ev(`(() => { window.__swaps = []; window.__timings = []; const panel = document.querySelector('.forge-rhythm-edit-score'); new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.classList && n.classList.contains('forge-rhythm-score-host')) window.__swaps.push(performance.now()); }).observe(panel, { childList: true }); })()`);
  const setControl = (sel: string, value: string | boolean, type = 'input') => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); ${typeof value === 'boolean' ? 'e.checked = ' + value : 'e.value = ' + JSON.stringify(value)}; window.__tInput = performance.now(); e.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true })); return window.__tInput; })()`);
  const settle = async () => { let n = '', still = 0; for (let w = 0; w < 15000 && still < 5; w += 100) { await sleep(100); const m = await q.ev('(window.__timings || []).length + ":" + (window.__swaps || []).length'); if (m === n) still++; else { still = 0; n = m as string; } } };
  const hashScore = async () => {
    const c = await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 300) }; })()`);
    const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
    return crypto.createHash('md5').update(r.result.data).digest('hex');
  };
  const written = (num: number) => q.ev(`window.__files.get('phrases/phrase_00${num}.md').match(/\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`/)[1]`).then((t: any) => JSON.parse(t));
  return { q, setControl, settle, hashScore, written };
  return { q, setControl, settle, hashScore, written };
}



const BEFORE = process.argv.includes('--before');
const text = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as any);
const g = (q: any, sel: string, prop: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e[${JSON.stringify(prop)}] : null; })()`);
const asked = (q: any): Promise<string[]> => q.ev(`(window.__asked || []).slice()`);
const lines = (q: any): Promise<string[]> => q.ev(`(window.__lines || []).filter((l) => /forge-description/.test(l))`);
const shot = async (q: any, name: string) => {
  const c = await q.ev(`(() => { window.scrollTo(0, 0); const p = document.getElementById('pane'); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const theme = (q: any, dark: boolean) => q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`);
const setBox = (q: any, t: string) => q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.value = ${JSON.stringify(t)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const realEnter = async (q: any) => { for (const type of ['keyDown', 'keyUp']) await q.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const buttons = (q: any) => q.ev(`[...document.querySelectorAll('.forge-description-button')].map((b) => b.dataset.action)`);
const FREE = 'make bar_005 eight bars long, with fills';
const PLAN = { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const tag = BEFORE ? 'before' : 'after';
const out: any = { build: tag };

// ---- run 1: modify + inspect at 0.5 s, the answer at 1.5 s
{
  const h = await open('extend', text, {}, { plan: PLAN, planMs: 1500, interleaveMs: 500 }); const q = h.q;
  try {
    await sleep(800);
    await setBox(q, FREE); await sleep(100);
    await realEnter(q); await sleep(250);
    out.asking = { state: await g(q, '.forge-prompt-box-state', 'textContent'), lines: await lines(q) };
    await shot(q, `events-1-asking-${tag}`);
    await sleep(1900);                                                                                     // the answer (1.5 s) and the debounce (about 1.1 s) have both happened
    out.answered = { asked: await asked(q), buttons: await buttons(q), strip: await g(q, '.forge-description-message', 'textContent'), box: await g(q, '.forge-prompt-box-state', 'textContent'), boxText: await g(q, '.forge-prompt-box-text', 'value'),
      description: await g(q, '.forge-description-preview-description', 'textContent'), lines: await lines(q) };
    await shot(q, `events-2-after-1500ms-${tag}`);
    await theme(q, true); await sleep(200); await shot(q, `events-2-after-1500ms-${tag}-dark`); await theme(q, false);
    out.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}
// ---- run 2: the person types on while the service thinks: dropped, but said
{
  const h = await open('extend', text, {}, { plan: PLAN, planMs: 1500 }); const q = h.q;
  try {
    await sleep(800);
    await setBox(q, FREE); await sleep(100); await realEnter(q); await sleep(300);
    await setBox(q, FREE + ' and louder'); await sleep(1700);
    out.typedOn = { buttons: await buttons(q), strip: await g(q, '.forge-description-message', 'textContent'), box: await g(q, '.forge-prompt-box-state', 'textContent'), lines: await lines(q) };
    await shot(q, `events-3-typed-on-${tag}`);
  } finally { q.close(); }
}
const hasPreview = JSON.stringify(out.answered.buttons) === JSON.stringify(['apply-preview', 'cancel-preview']) && /8 bars/.test(out.answered.description ?? '');
const sent = out.answered.lines.some((l: string) => /^\[forge-description\] asking the service about phrase_001$/.test(l));
const back = out.answered.lines.some((l: string) => /asked the service about phrase_001 -> extend/.test(l));
out.verdicts = BEFORE ? {
  // the bug, on the code before the fix: the answer is lost without a word
  before_noPreview: !hasPreview && out.answered.buttons.length === 0,
  before_noTraceAtAll: out.answered.lines.length === 0,
  before_noMessage: String(out.answered.strip ?? '') === '' && !/after the text changed|changed/.test(out.answered.box ?? ''),
  before_oneRequestLeft: out.answered.asked.length === 1,
} : {
  free_requestLeft: out.answered.asked.length === 1 && out.answered.asked[0] === FREE && sent && /Asking the sentence service/.test(out.asking.state),
  free_previewAppearsDespiteModifyAndInspect: hasPreview,
  free_traceSaysWhatCameBack: back,
  free_boxKeepsTheText: out.answered.boxText === FREE && !/Asking/.test(out.answered.box ?? ''),
  typedOn_noPreview: !out.typedOn.buttons.includes('apply-preview'),
  typedOn_saidInTheStrip: out.typedOn.strip === 'The Description changed while the service was thinking; its suggestion was dropped.',
  typedOn_saidUnderTheBox: /changed/.test(out.typedOn.box ?? '') && !/Asking/.test(out.typedOn.box ?? ''),
  typedOn_traced: out.typedOn.lines.some((l: string) => /asked the service about phrase_001 -> dropped: the text in the box changed/.test(l)),
  noConsoleErrors: out.errors.filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,
};
fs.writeFileSync(path.join(here, `prompt-box-service-events-${tag}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ build: tag, asking: out.asking, answered: out.answered, typedOn: out.typedOn }).slice(0, 2200));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error(`measure-prompt-box-service-events (${tag}): a verdict failed`); process.exit(1); }
