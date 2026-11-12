// 2026-11-12-1204 - the prompt box asks the sentence service on Apply, in real headless Chrome with the REAL engine behind /phrase, the plugin's own description controller beside the tab and a STAND-IN for the sentence service (the rig's
// `plan` option: it answers after 400 ms and counts every request in window.__asked; the real service costs money and needs a token): phrase_001 (an extend of bar_005, 4 bars): typing asks NOTHING; a sentence the grammar
// accepts asks nothing; a free sentence ("make bar_005 eight bars long, with fills") + the REAL Enter asks ONCE, the box says "Asking the sentence service...", the preview appears (Description and Recipe), Apply on it changes the
// Score (8 bars) and the box shows the canonical grammar sentence. Run from the client:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css = styles.css)
//   node scripts/dev/measure-prompt-box-service.ts <dir>
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
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};window.__lines=[];const _i=console.info;console.info=(...a)=>{const t=a.map(String).join(' ');if(/^\\[forge-morph\\]/.test(t))window.__lines.push(t);_i(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

async function open(kind: 'morph' | 'mix' | 'extend', text: string, extraBars: Record<string, string> = {}, rig: { plan?: object; planMs?: number } = {}) {
  const n = kind === 'morph' ? 4 : kind === 'mix' ? 2 : 1;
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, plan: ${JSON.stringify(rig.plan ?? null)}, planMs: ${rig.planMs ?? 400}, name: 'phrase_001', path: 'phrases/phrase_001.md', phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, ...${JSON.stringify(extraBars)} }, path: 'phrases/phrase_00${n}.md', name: 'phrase_00${n}' })`);
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



const text = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as any);
const g = (q: any, sel: string, prop: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e[${JSON.stringify(prop)}] : null; })()`);
const noteheads = (q: any): Promise<number> => q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`);
const asked = (q: any): Promise<string[]> => q.ev(`(window.__asked || []).slice()`);
const shot = async (q: any, name: string) => {
  const c = await q.ev(`(() => { window.scrollTo(0, 0); const p = document.getElementById('pane'); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const theme = (q: any, dark: boolean) => q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`);
const setBox = (q: any, t: string) => q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.value = ${JSON.stringify(t)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const realEnter = async (q: any) => { for (const type of ['keyDown', 'keyUp']) await q.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const FREE = 'make bar_005 eight bars long, with fills';
const PLAN = { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const out: any = {};
const h = await open('extend', text, {}, { plan: PLAN, planMs: 700 });
const q = h.q;
try {
  await sleep(800);
  out.start = { text: await g(q, '.forge-prompt-box-text', 'value'), noteheads: await noteheads(q) };
  // typing: nothing is asked
  for (const t of ['m', 'make bar_005', FREE]) { await setBox(q, t); await sleep(150); }
  await sleep(900);
  out.typing = { asked: await asked(q) };
  // a sentence the grammar accepts: nothing is asked
  await setBox(q, 'Extend [[bar_005]] to 6 bars, repeating with fills.'); await realEnter(q); await h.settle(); await sleep(600);
  out.grammar = { asked: await asked(q), text: await g(q, '.forge-prompt-box-text', 'value'), noteheads: await noteheads(q) };
  // the free sentence + the real Enter: the service is asked ONCE
  await setBox(q, FREE); await sleep(100);
  await realEnter(q); await sleep(250);
  out.busy = { state: await g(q, '.forge-prompt-box-state', 'textContent'), applyDisabled: await g(q, '.forge-prompt-box-apply', 'disabled') };
  await shot(q, 'service-asking-light');
  await realEnter(q);                                                                                   // a second Enter while it thinks
  await sleep(1200);
  out.preview = { asked: await asked(q), buttons: await q.ev(`[...document.querySelectorAll('.forge-description-button')].map((b) => b.dataset.action)`), description: await g(q, '.forge-description-preview-description', 'textContent'), recipe: await g(q, '.forge-description-preview-recipe', 'textContent'), box: await g(q, '.forge-prompt-box-text', 'value'), written: await q.ev(`window.__files.get('phrases/phrase_001.md').match(/^# Description\\n\\n(.*)$/m)[1]`) };
  await shot(q, 'service-preview-light');
  await theme(q, true); await sleep(200); await shot(q, 'service-preview-dark'); await theme(q, false);
  // apply the preview (a real click on its button)
  const before = await noteheads(q);
  const c = await q.ev(`(() => { const b = document.querySelector('.forge-description-button[data-action="apply-preview"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await q.click(c.x, c.y); await h.settle(); await sleep(900);
  out.applied = { box: await g(q, '.forge-prompt-box-text', 'value'), edited: await q.ev(`!!document.querySelector('.forge-prompt-box.is-edited')`), onDisk: await q.ev(`window.__files.get('phrases/phrase_001.md').match(/^# Description\\n\\n(.*)$/m)[1]`), noteheadsBefore: before, noteheadsAfter: await noteheads(q), strip: await g(q, '.forge-description-bar', 'textContent'), asked: await asked(q) };
  await shot(q, 'service-applied-light');
  await theme(q, true); await sleep(200); await shot(q, 'service-applied-dark'); await theme(q, false);
  out.errors = await q.ev('window.__errors.slice()');
} finally { q.close(); }
out.verdicts = {
  typing_asksNothing: out.typing.asked.length === 0,
  grammarAccepted_asksNothing: out.grammar.asked.length === 0 && out.grammar.text === 'Extend [[bar_005]] to 6 bars, repeating with fills.',
  free_busyMessageShown: out.busy.state === 'Asking the sentence service...' && out.busy.applyDisabled === true,
  free_askedExactlyOnce: out.preview.asked.length === 1 && out.preview.asked[0] === FREE,
  free_previewShown: JSON.stringify(out.preview.buttons) === JSON.stringify(['apply-preview', 'cancel-preview']) && /8 bars/.test(out.preview.description) && /8 bars/.test(out.preview.recipe),
  free_nothingWrittenYet: /6 bars/.test(out.preview.written) && out.preview.box === FREE,
  applied_boxIsTheCanonicalSentence: out.applied.box === 'Extend [[bar_005]] to 8 bars, repeating with fills.' && out.applied.onDisk === out.applied.box && out.applied.edited === false,
  applied_theScoreChanged: out.applied.noteheadsAfter !== out.applied.noteheadsBefore,
  applied_noStrip: String(out.applied.strip ?? '') === '' && out.applied.asked.length === 1,
  noConsoleErrors: out.errors.filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,
};
fs.writeFileSync(path.join(here, 'prompt-box-service-measurements.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ typing: out.typing, grammar: out.grammar, busy: out.busy, preview: out.preview, applied: out.applied }).slice(0, 1500));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-prompt-box-service: a verdict failed; see prompt-box-service-measurements.json'); process.exit(1); }
