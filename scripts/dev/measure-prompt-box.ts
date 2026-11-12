// 2026-11-12-1203 - the docked prompt box in real headless Chrome with the REAL engine behind /phrase (the project's phrase rig, as measure-path.ts / measure-mix-states.ts) and the plugin's own description controller beside the
// tab: phrase_002 (a vote mix of bar_007 and bar_001): the box at rest (the Description, docked at the bottom, sticky while the pane scrolls), a sentence typed and applied with the REAL Enter key (the Score and the controls
// change), a control moved (the box text changes), a bad sentence (the strip at the top says the line and column, the box keeps the text, nothing is written), light and dark. Run from the client:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css = styles.css)
//   node scripts/dev/measure-prompt-box.ts <dir>
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
const noteSig = (q: any): Promise<string> => q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host svg g.notehead')].map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).sort().join(' ')`);
const shot = async (q: any, name: string) => {
  await q.ev(`document.activeElement && document.activeElement !== document.body && !document.activeElement.classList.contains('forge-prompt-box-text') && document.activeElement.blur && document.activeElement.blur()`);
  const c = await q.ev(`(() => { window.scrollTo(0, 0); const p = document.getElementById('pane'); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
  const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const theme = (q: any, dark: boolean) => q.ev(`(() => { document.body.classList.toggle('theme-dark', ${dark}); document.body.classList.toggle('theme-light', ${!dark}); })()`);
/** type into the box: set the text (an input event), then the REAL Enter key through the DevTools protocol */
const setBox = (q: any, t: string) => q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.value = ${JSON.stringify(t)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const realEnter = async (q: any) => { for (const type of ['keyDown', 'keyUp']) await q.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); };
const geometry = (q: any) => q.ev(`(() => { const p = document.getElementById('pane'), b = document.querySelector('.forge-prompt-box'); if (!b) return null; const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(p).paddingBottom) || 0; const kids = [...p.children]; const prev = kids[kids.indexOf(b) - 1]; return { paneBottom: Math.round(pr.bottom), padBottom: Math.round(pad), dockedBottom: Math.round(pr.bottom - pad), boxTop: Math.round(br.top), boxBottom: Math.round(br.bottom), lastChild: p.lastElementChild === b, scrollable: p.scrollHeight > p.clientHeight, scrollTop: Math.round(p.scrollTop), prevBottom: prev ? Math.round(prev.getBoundingClientRect().bottom) : null }; })()`);
const out: any = {};
const h = await open('mix', text, PAIR);
const q = h.q;
try {
  await sleep(800);
  // at rest
  out.rest = { text: await g(q, '.forge-prompt-box-text', 'value'), edited: await q.ev(`!!document.querySelector('.forge-prompt-box.is-edited')`), geometry: await geometry(q), weight: await g(q, '.forge-mix-weight', 'value'), sig: await noteSig(q) };
  await shot(q, 'box-at-rest-light');
  await theme(q, true); await sleep(200); await shot(q, 'box-at-rest-dark'); await theme(q, false);
  // sticky: scroll the pane and the box stays at the pane's bottom edge
  out.sticky = [];
  await q.ev(`document.querySelector('.workspace-leaf-content').style.height = '430px'`); await sleep(300);      // a short pane, so there is real scrolling to do
  for (const top of [0, 150, 400, 100000]) { await q.ev(`document.getElementById('pane').scrollTop = ${top}`); await sleep(120); out.sticky.push(await geometry(q)); }
  await q.ev(`document.getElementById('pane').scrollTop = 0; document.querySelector('.workspace-leaf-content').style.height = '700px'`); await sleep(300);
  // type a sentence + the real Enter: the Score and the controls change
  const SENT = 'Mix [[bar_007]] and [[bar_001]], 35 percent [[bar_007]], as a vote. Threshold 65 percent.';
  await setBox(q, SENT); await sleep(200);
  out.edited = { edited: await q.ev(`!!document.querySelector('.forge-prompt-box.is-edited')`), state: await g(q, '.forge-prompt-box-state', 'textContent'), apply: await q.ev(`!document.querySelector('.forge-prompt-box-apply').disabled`) };
  await shot(q, 'box-edited-not-applied-light');
  const before = await noteSig(q);
  await realEnter(q); await h.settle(); await sleep(700);
  out.applied = { weight: await g(q, '.forge-mix-weight', 'value'), threshold: await g(q, '.forge-mix-threshold', 'value'), text: await g(q, '.forge-prompt-box-text', 'value'), edited: await q.ev(`!!document.querySelector('.forge-prompt-box.is-edited')`), scoreChanged: (await noteSig(q)) !== before, onDisk: await q.ev(`window.__files.get('phrases/phrase_002.md').match(/^# Description\\n\\n(.*)$/m)[1]`), strip: await g(q, '.forge-description-bar', 'textContent') };
  await shot(q, 'box-after-apply-light');
  await theme(q, true); await sleep(200); await shot(q, 'box-after-apply-dark'); await theme(q, false);
  // a control moved: the box follows
  await h.setControl('.forge-mix-weight', '0.9'); await h.settle(); await sleep(500);
  out.control = { weight: await g(q, '.forge-mix-weight', 'value'), text: await g(q, '.forge-prompt-box-text', 'value') };
  // a bad sentence: the strip says where, the box keeps the text, nothing is written
  const diskBefore = await q.ev(`window.__files.get('phrases/phrase_002.md')`);
  await setBox(q, 'Mix [[bar_007]] and [[bar_001]] sideways'); await realEnter(q); await sleep(700);
  out.bad = { strip: await g(q, '.forge-description-bar', 'textContent'), box: await g(q, '.forge-prompt-box-text', 'value'), edited: await q.ev(`!!document.querySelector('.forge-prompt-box.is-edited')`), unchanged: (await q.ev(`window.__files.get('phrases/phrase_002.md')`)) === diskBefore, buttons: await q.ev(`[...document.querySelectorAll('.forge-description-button')].map((b) => b.dataset.action)`) };
  await shot(q, 'box-bad-sentence-light');
  await theme(q, true); await sleep(200); await shot(q, 'box-bad-sentence-dark'); await theme(q, false);
  out.errors = await q.ev('window.__errors.slice()');
} finally { q.close(); }
const SENT2 = 'Mix [[bar_007]] and [[bar_001]], 35 percent [[bar_007]], as a vote. Threshold 65 percent.';
out.verdicts = {
  rest_boxIsTheDescription: out.rest.text === 'Mix [[bar_007]] and [[bar_001]], 100 percent [[bar_007]], as a vote. Threshold 65 percent.' && out.rest.edited === false,
  rest_boxIsLastInTheTab: out.rest.geometry?.lastChild === true,
  sticky_boxStaysAtThePaneBottomWhileScrolling: out.sticky.every((s: any) => s && Math.abs(s.boxBottom - s.dockedBottom) <= 2) && new Set(out.sticky.map((s: any) => s.scrollTop)).size >= 3,
  sticky_atTheEndNothingIsCovered: out.sticky.at(-1).prevBottom <= out.sticky.at(-1).boxTop + 1,
  typed_showsEditedNotApplied: out.edited.edited === true && out.edited.state === 'edited, not applied' && out.edited.apply === true,
  applied_realEnterMovesTheControls: out.applied.weight === '0.35' && out.applied.threshold === '0.65',
  applied_theScoreChanged: out.applied.scoreChanged === true,
  applied_theDescriptionOnDisk: out.applied.onDisk === SENT2 && out.applied.text === SENT2 && out.applied.edited === false,
  applied_noStripNeeded: String(out.applied.strip ?? '') === '',
  control_boxFollowsTheSlider: out.control.weight === '0.9' && out.control.text === 'Mix [[bar_007]] and [[bar_001]], 90 percent [[bar_007]], as a vote. Threshold 65 percent.',
  bad_stripSaysLineAndColumn: /Description, line 1, column \d+/.test(String(out.bad.strip)),
  bad_boxKeepsTheTextAndNothingWritten: out.bad.box === 'Mix [[bar_007]] and [[bar_001]] sideways' && out.bad.edited === true && out.bad.unchanged === true,
  bad_noRevertOffered: !out.bad.buttons.includes('revert'),
  noConsoleErrors: out.errors.filter((e: string) => !/\[forge-player\] sounds could not be loaded/.test(e)).length === 0,
};
fs.writeFileSync(path.join(here, 'prompt-box-measurements.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ rest: out.rest.geometry, sticky: out.sticky, applied: out.applied, control: out.control, bad: out.bad }, null, 0).slice(0, 1800));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-prompt-box: a verdict failed; see prompt-box-measurements.json'); process.exit(1); }
