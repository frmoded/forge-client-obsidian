// 2026-11-12-1201 - the mix strip's hint and the Vote / Path switch on phrase_002 (a vote mix of bar_007 and bar_001) in real headless Chrome with the REAL engine behind /phrase (the project's phrase measurement rig, as
// measure-path.ts): BEFORE (the vote: the hint is on screen; five weights give 2 distinct Scores) and AFTER switching Mode to Path (the hint is gone; the Weight slider has 9 stops, "0 of 8 changes" .. "8 of 8 changes";
// nine stops give 9 distinct Scores), with screenshots. Run from the client:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css = styles.css)
//   node scripts/dev/measure-mix-states.ts <dir>
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

async function open(kind: 'morph' | 'mix' | 'extend', text: string, extraBars: Record<string, string> = {}) {
  const n = kind === 'morph' ? 4 : kind === 'mix' ? 2 : 1;
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, name: 'phrase_002', path: 'phrases/phrase_002.md', phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, ...${JSON.stringify(extraBars)} }, path: 'phrases/phrase_00${n}.md', name: 'phrase_00${n}' })`);
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

const PAIR = { bar_007: FX('bar_007'), bar_001: FX('bar_001') };
const text = noteContentFor('phrase_002', { kind: 'mix', a: 'bar_007', b: 'bar_001', weight: 1, threshold: 0.65, ghost: false });
const g = (q: any, sel: string, prop: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e[${JSON.stringify(prop)}] : null; })()`);
const shown = (q: any, sel: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e).display !== 'none' && e.textContent !== ''; })()`);
const distinct = (xs: string[]) => new Set(xs).size;
/** The engraved bar as the browser draws it: where every notehead is (so a title that says "100 percent" does not make two equal bars look different). */
const noteSig = (q: any): Promise<string> => q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host svg g.notehead')].map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).sort().join(' ')`);
const shot = async (q: any, name: string) => {
  await q.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  const c = await q.ev(`(() => { window.scrollTo(0, 0); const p = document.getElementById('pane'); p.scrollTop = 0; const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const out: any = { vote: {}, path: {} };
const h = await open('mix', text, PAIR);
const q = h.q;
try {
  // BEFORE: the vote
  out.vote.mode = await g(q, '.forge-mix-mode', 'value');
  out.vote.hintShown = await shown(q, '.forge-mix-states-hint');
  out.vote.hint = await g(q, '.forge-mix-states-hint', 'textContent');
  out.vote.sentence = await g(q, '.forge-mix-sentence', 'textContent');
  out.vote.step = await g(q, '.forge-mix-weight', 'step');
  await shot(q, 'phrase_002-vote-hint');
  out.vote.hashes = [] as string[];
  for (const w of [1, 0.75, 0.5, 0.25, 0]) { await h.setControl('.forge-mix-weight', String(w)); await h.settle(); await sleep(250); out.vote.hashes.push(await noteSig(q)); }
  await h.setControl('.forge-mix-weight', '1'); await h.settle();
  // AFTER: Mode -> Path
  await h.setControl('.forge-mix-mode', 'path', 'change'); await h.settle(); await sleep(500);
  out.path.mode = await g(q, '.forge-mix-mode', 'value');
  out.path.hintShown = await shown(q, '.forge-mix-states-hint');
  out.path.step = await g(q, '.forge-mix-weight', 'step');
  out.path.label = await g(q, '.forge-mix-weight-changes', 'textContent');
  out.path.sentence = await g(q, '.forge-mix-sentence', 'textContent');
  out.path.descriptionOnDisk = await q.ev(`window.__files.get('phrases/phrase_002.md').match(/^# Description\\n\\n(.*)$/m)[1]`);
  await shot(q, 'phrase_002-path-0-of-8');
  out.path.hashes = [] as string[]; out.path.labels = [] as string[];
  for (let k = 0; k <= 8; k++) { await h.setControl('.forge-mix-weight', String(1 - k / 8)); await h.settle(); await sleep(250); out.path.hashes.push(await noteSig(q)); out.path.labels.push(await g(q, '.forge-mix-weight-changes', 'textContent')); if (k === 4) await shot(q, 'phrase_002-path-4-of-8'); }
  // back to Vote: the hint returns
  await h.setControl('.forge-mix-weight', '1'); await h.settle();
  await h.setControl('.forge-mix-mode', 'vote', 'change'); await h.settle(); await sleep(500);
  out.back = { mode: await g(q, '.forge-mix-mode', 'value'), hintShown: await shown(q, '.forge-mix-states-hint'), threshold: await g(q, '.forge-mix-threshold', 'value'), sentence: await g(q, '.forge-mix-sentence', 'textContent') };
  await shot(q, 'phrase_002-back-to-vote');
  out.errors = await q.ev('window.__errors.slice()');
} finally { q.close(); }
out.verdicts = {
  before_voteShowsTheHint: out.vote.mode === 'vote' && out.vote.hintShown === true && out.vote.hint === 'These two bars can only give 2 different results by vote. Try Path: 9 steps.',
  before_fiveWeightsGiveTwoDistinctEngravedBars: distinct(out.vote.hashes) === 2 && out.vote.step === '0.05',
  after_pathHidesTheHint: out.path.mode === 'path' && out.path.hintShown === false,
  after_nineStopsOfEight: out.path.step === String(1 / 8) && out.path.label === '0 of 8 changes' && out.path.labels.join('|') === Array.from({ length: 9 }, (_, k) => `${k} of 8 changes`).join('|'),
  after_nineStopsGiveNineDistinctEngravedBars: distinct(out.path.hashes) === 9,
  after_theDescriptionOnDiskIsThePathSentence: /as a path, in musical order\./.test(String(out.path.descriptionOnDisk)),
  back_voteAndHintAndThresholdAreBack: out.back.mode === 'vote' && out.back.hintShown === true && out.back.threshold === '0.65',
  noConsoleErrors: out.errors.filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,   // the headless rig has no soundfont: that line is the rig's, not the strip's
};
fs.writeFileSync(path.join(here, 'mix-states-measurements.json'), JSON.stringify(out, null, 1));
console.log('vote:', JSON.stringify({ hint: out.vote.hint, distinctScores: distinct(out.vote.hashes) }), '| path:', JSON.stringify({ label: out.path.label, labels: out.path.labels, distinctScores: distinct(out.path.hashes), description: out.path.descriptionOnDisk }), '| back:', JSON.stringify(out.back));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-mix-states: a verdict failed; see mix-states-measurements.json'); process.exit(1); }
