// 2026-10-26-0900 — the mix's PATH mode in real headless Chrome with the REAL engine behind /phrase: the strip (Mode, Order, Seed, the Weight slider with one stop per single-hit change and its `k of d changes` label,
// Threshold and Ghost greyed), the five stops of bar_005 -> bar_006 by REAL PIXELS (a hash of the Score region and strong-pixel counts between neighbouring stops, with a noise floor from re-rendering the same stop and the
// VOTE mix as the control: five weights, two distinct Scores), the Inspector on the path (REAL pointer events), and the redraw latency of a Weight step in path mode against the vote mix's. Run from the client repo root:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css = styles.css, as for measure-phrase.ts)
//   node scripts/dev/measure-path.ts <dir>                        the study + the verdicts (exit 1 when a verdict is false)
// WALL-CLOCK ONLY. The real engine runs in Node behind /phrase; everything else is real Chrome. Parallel Chrome runs stall each other: run it alone.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const BAR6 = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_006.md', import.meta.url), 'utf8');
const note = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const morphText = (p: object = {}) => note({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0, ...p });
const mixText = (p: object = {}) => note({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false, ...p });
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

/** How many pixels of two same-size PNG clips differ by at least `min` in some channel (macOS `sips` converts them to BMP): re-rendering leaves a noise floor of a few anti-aliased pixels (at most ~31 in a channel), a colour cue
 *  differs by far more (blue vs purple: 194). -1 = the clips differ in size. The recipe of the mix's study (measure-phrase.ts). */
function strongDiff(fileA: string, fileB: string, min = 100): number {
  const bmp = (f: string) => { const out = f.replace(/\.png$/, '.bmp'); execFileSync('sips', ['-s', 'format', 'bmp', f, '--out', out], { stdio: 'ignore' }); const b = fs.readFileSync(out); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)), bpp: b.readUInt16LE(28) }; };
  const A = bmp(fileA), B = bmp(fileB);
  if (A.w !== B.w || A.h !== B.h) return -1;
  const row = Math.floor((A.bpp * A.w + 31) / 32) * 4;
  let n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const o = A.off + y * row + x * (A.bpp / 8); let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.b[o + k] - B.b[o + k])); if (d >= min) n++; }
  return n;
}
const PLUS3 = (() => { const m = BAR6.match(/```json\n([\s\S]*?)\n```/)!; const d = JSON.parse(m[1]); d.channels.kick[3] = true; return BAR6.replace(m[1], JSON.stringify(d, null, 2)); })();   // bar_006 plus the kick at step 3: the same hit is "bar a only" against bar_006 and "both bars" against this

async function open(kind: 'morph' | 'mix' | 'extend', text: string, extraBars: Record<string, string> = {}) {
  const n = kind === 'morph' ? 4 : kind === 'mix' ? 2 : 1;
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, ...${JSON.stringify(extraBars)} }, path: 'phrases/phrase_00${n}.md', name: 'phrase_00${n}' })`);
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
}

/** input event -> new Score on screen, over several jumps between two values of one control */
async function latency(h: Awaited<ReturnType<typeof open>>, sel: string, values: string[], type = 'input') {
  const out: Array<{ to: string; renders: number; engineMs: number[]; inputToSwapMs: number | null }> = [];
  for (const target of values) {
    await h.q.ev('window.__timings = []; window.__swaps = []');
    const tIn = await h.setControl(sel, target, type);
    await h.settle();
    const tm = await h.q.ev('window.__timings.slice()'); const sw = await h.q.ev('window.__swaps.slice()');
    out.push({ to: target, renders: tm.length, engineMs: tm.map((t: any) => Math.round(t.engineMs)), inputToSwapMs: sw.length ? Math.round(sw[sw.length - 1] - (tIn as number)) : null });
  }
  return out;
}
const median = (xs: Array<number | null>) => { const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

const mixPathText = (p: object = {}) => note({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.65, ghost: true, mode: 'path', order: 'musical', seed: 0, ...p });
const out: any = {};
const stopsW = [1, 0.75, 0.5, 0.25, 0];

// ---- the strip and the five stops -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixPathText());
  const q = h.q;
  try {
    const g = (sel: string, prop: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e[${JSON.stringify(prop)}] : null; })()`);
    const shown = (sel: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && getComputedStyle(e.closest('label') || e).display !== 'none'; })()`);
    out.strip = {
      mode: await g('.forge-mix-mode', 'value'), step: await g('.forge-mix-weight', 'step'), label: await g('.forge-mix-weight-changes', 'textContent'), sentence: await g('.forge-mix-sentence', 'textContent'),
      thresholdDisabled: await g('.forge-mix-threshold', 'disabled'), ghostDisabled: await g('.forge-mix-ghost', 'disabled'), orderShown: await shown('.forge-mix-order'), seedShown: await shown('.forge-mix-seed'), seedDisabled: await g('.forge-mix-seed', 'disabled'),
      note: await g('.forge-mix-path-note', 'textContent'),
    };
    // noise floor: the same stop twice
    const clip = async (name: string): Promise<string> => {
      await q.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`); await sleep(100);
      const c = await q.ev(`(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach((e) => { if (e.scrollLeft) e.scrollLeft = 0; }); document.getElementById('pane').scrollTop = 0; const e = document.querySelector('.forge-rhythm-score-host'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 300) }; })()`);
      const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
      const file = path.join(SHOTS, `path-${name}.png`); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      return file;
    };
    out.stops = [] as any[];
    const files: string[] = [];
    for (const [j, w] of stopsW.entries()) {
      await h.setControl('.forge-mix-weight', String(w)); await h.settle(); await sleep(300);
      files.push(await clip(`stop${j}`));
      out.stops.push({ j, weightShown: await g('.forge-mix-weight-value', 'textContent'), label: await g('.forge-mix-weight-changes', 'textContent'), noteheads: await q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`), hash: await h.hashScore(), written: (await h.written(2)).weight });
    }
    await h.setControl('.forge-mix-weight', '0'); await h.settle(); await sleep(300);
    const again = await clip('stop4-again');
    out.pixels = { noise_stop4_vs_again: strongDiff(files[4], again), neighbours: files.slice(1).map((f, i) => strongDiff(files[i], f)), end_to_end: strongDiff(files[0], files[4]) };
    await h.setControl('.forge-mix-weight', '0.6'); await h.settle();            // between two stops: snaps to stop 2 (0.5)
    out.snap = { weightShown: await g('.forge-mix-weight-value', 'textContent'), label: await g('.forge-mix-weight-changes', 'textContent'), written: (await h.written(2)).weight };
    out.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}

// ---- the control: the VOTE mix over the same five weights shows two distinct Scores, the path five --------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixPathText({ mode: 'vote', order: undefined, seed: undefined, ghost: false }));          // ghost off: a hit is placed or not, so the vote has two states
  try {
    out.voteControl = { hashes: [] as string[], noteheads: [] as number[] };
    await h.setControl('.forge-mix-weight', '0.95'); await h.settle(); await sleep(300);          // one warm-up render: the very first render after a mount differs from every later one
    for (const w of stopsW) { await h.setControl('.forge-mix-weight', String(w)); await h.settle(); out.voteControl.hashes.push(await h.hashScore()); out.voteControl.noteheads.push(await h.q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`)); }
    out.voteControl.step = await h.q.ev(`document.querySelector('.forge-mix-weight').step`);
    out.voteControl.modeAfterVoteLoad = await h.q.ev(`document.querySelector('.forge-mix-mode').value`);
    out.voteErrors = await h.q.ev('window.__errors.slice()');
  } finally { h.q.close(); }
}

// ---- switching the mode in the page, and the order ---------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixPathText({ mode: 'vote', order: undefined, seed: undefined, weight: 0.5 }));
  try {
    await h.setControl('.forge-mix-mode', 'path', 'change'); await h.settle(); await sleep(400);
    const afterPath = { step: await h.q.ev(`document.querySelector('.forge-mix-weight').step`), label: await h.q.ev(`document.querySelector('.forge-mix-weight-changes').textContent`), written: await h.written(2) };
    await h.setControl('.forge-mix-order', 'by_channel', 'change'); await h.settle();
    const byChannel = { written: await h.written(2), noteheads: await h.q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`) };
    await h.setControl('.forge-mix-mode', 'vote', 'change'); await h.settle();
    const backToVote = { written: await h.written(2), step: await h.q.ev(`document.querySelector('.forge-mix-weight').step`), thresholdDisabled: await h.q.ev(`document.querySelector('.forge-mix-threshold').disabled`) };
    out.modeSwitch = { afterPath, byChannel, backToVote };
    out.switchErrors = await h.q.ev('window.__errors.slice()');
  } finally { h.q.close(); }
}

// ---- latency: a Weight step, path against vote ------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixPathText());
  try {
    await h.setControl('.forge-mix-weight', '1'); await h.settle();
    out.pathLatency = { weight: await latency(h, '.forge-mix-weight', ['0.25', '0.75', '0.25', '0.75', '0.25']) };
  } finally { h.q.close(); }
  const v = await open('mix', mixPathText({ mode: 'vote', order: undefined, seed: undefined }));
  try {
    await v.setControl('.forge-mix-weight', '1'); await v.settle();
    out.voteLatency = { weight: await latency(v, '.forge-mix-weight', ['0.4', '0.9', '0.4', '0.9', '0.4']) };
  } finally { v.q.close(); }
}

// ---- the Inspector on the path, with REAL pointer events ---------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixPathText({ weight: 0.5 }));
  const q = h.q;
  try {
    const stack = () => q.ev(`[...document.querySelectorAll('.forge-inspector-lineage > li')].map((li) => (li.querySelector('span') || li.querySelector('button')).textContent)`);
    const pinned = () => q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host .forge-artifact-pinned')].map((g) => g.id)`);
    const noteXY = (id: string) => q.ev(`(() => { const e = document.querySelector('#${id} .notehead'); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    out.inspector = { ids: await q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host [id^="mx_"]')].map((e) => e.id)`) };
    // bar_005 -> bar_006, musical order: stop 2 has lost kick 4 and kick 3 (bar_005 only hits removed at changes 1 and 2) and keeps kick 6 and snare 6 until changes 3 and 4
    const readHit = async (id: string) => { const p = await noteXY(id); if (!p) return null; await q.click(p.x, p.y); await sleep(300); return { pinned: await pinned(), stack: await stack() }; };
    out.inspector.kick0 = await readHit('mx_kick_0');
    out.inspector.kick6 = await readHit('mx_kick_6');
    out.inspector.fills = await q.ev(`Object.fromEntries([...document.querySelectorAll('.forge-rhythm-score-host [id^="mx_"] .notehead')].map((e) => [e.closest('[id^="mx_"]').id, getComputedStyle(e).fill]))`);
    // the pin survives a Weight step: the bar stays pinned and its stack names the new stop
    const p0 = await q.ev(`(() => { const g = document.querySelector('#ph_bar_1'); g.scrollIntoView({ block: 'center' }); const r = g.getBoundingClientRect(); const svg = document.querySelector('.forge-rhythm-score-host svg'); for (let fy = 0.1; fy < 1; fy += 0.05) for (let fx = 0.3; fx < 1; fx += 0.05) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (document.elementsFromPoint(x, y)[0] === svg) return { x, y }; } return null; })()`);
    if (p0) { await q.click(p0.x, p0.y); await sleep(300); }
    out.inspector.barBefore = { pinned: await pinned(), first: (await stack())[0] };
    await h.setControl('.forge-mix-weight', '0.25'); await h.settle(); await sleep(400);
    out.inspector.barAfter = { pinned: await pinned(), first: (await stack())[0] };
    out.inspector.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}

const med = (xs: Array<{ inputToSwapMs: number | null }>) => median(xs.map((x) => x.inputToSwapMs));
out.medians = { pathWeight: med(out.pathLatency.weight), voteWeight: med(out.voteLatency.weight) };
const distinct = (xs: string[]) => new Set(xs).size;
out.verdicts = {
  strip_pathModeShowsTheStops: out.strip.mode === 'path' && out.strip.step === '0.25' && out.strip.label === '0 of 4 changes' && /path: 0 of 4 single-hit changes \(musical order\)/.test(out.strip.sentence),
  strip_thresholdAndGhostGreyedWithANote: out.strip.thresholdDisabled === true && out.strip.ghostDisabled === true && /not used in path mode/.test(out.strip.note),
  strip_orderAndSeedShownSeedDisabledForMusical: out.strip.orderShown === true && out.strip.seedShown === true && out.strip.seedDisabled === true,
  stops_fiveStopsFiveDifferentScoresEachOneNoteheadFewer: JSON.stringify(out.stops.map((s: any) => s.noteheads)) === JSON.stringify([8, 7, 6, 5, 4]) && distinct(out.stops.map((s: any) => s.hash)) === 5,
  stops_labelsAndWrittenWeightsFollow: out.stops.every((s: any, j: number) => s.label === `${j} of 4 changes` && s.written === stopsW[j]),
  stops_snapsBetweenStops: out.snap.written === 0.5 && out.snap.label === '2 of 4 changes',
  rendered_noiseFloor_theSameStopTwiceDiffersByNothing: out.pixels.noise_stop4_vs_again === 0,
  rendered_everyStopDiffersFromItsNeighbourInRealPixels: out.pixels.neighbours.every((n: number) => n > 0),
  rendered_voteControl_theVoteShowsTwoScoresOverTheSameFiveWeights: distinct(out.voteControl.hashes) === 2 && out.voteControl.step === '0.05' && out.voteControl.modeAfterVoteLoad === 'vote',
  modeSwitch_pathThenOrderThenVote: out.modeSwitch.afterPath.written.mode === 'path' && out.modeSwitch.afterPath.written.order === 'musical' && out.modeSwitch.afterPath.written.seed === 0 && out.modeSwitch.afterPath.step === '0.25'
    && out.modeSwitch.byChannel.written.order === 'by_channel' && out.modeSwitch.backToVote.written.mode === 'vote' && out.modeSwitch.backToVote.written.order === undefined && out.modeSwitch.backToVote.step === '0.05' && out.modeSwitch.backToVote.thresholdDisabled === false,
  inspector_aHitSaysWhereItCameFromAndTheChange: out.inspector.kick0?.stack?.[0] === 'this hit: from both bars, velocity 90' && out.inspector.kick6?.stack?.[0] === 'this hit: from bar_005 only (removed at change 3), velocity 90',
  inspector_theBarStackNamesTheStop: out.inspector.kick0?.stack?.[1] === 'made by phrase_002 (mix, path, 2 of 4 changes)' && out.inspector.barBefore.first === 'made by phrase_002 (mix, path, 2 of 4 changes)',
  inspector_thePinSurvivesAWeightStepAndNamesTheNewStop: JSON.stringify(out.inspector.barAfter.pinned) === JSON.stringify(['ph_bar_1']) && out.inspector.barAfter.first === 'made by phrase_002 (mix, path, 3 of 4 changes)',
  inspector_paintedByParentInRealPixels: Object.values(out.inspector.fills).every((f: any) => ['rgb(106, 61, 154)', 'rgb(27, 110, 194)', 'rgb(217, 115, 13)'].includes(f)) && Object.keys(out.inspector.fills).length > 0,
  latency_pathIsNotSlowerThanTheVoteByMoreThanAThird: out.medians.pathWeight !== null && out.medians.voteWeight !== null && out.medians.pathWeight <= out.medians.voteWeight * 1.34,
  noConsoleErrors: [...out.errors, ...out.voteErrors, ...out.switchErrors, ...out.inspector.errors].length === 0,
};
fs.writeFileSync(path.join(here, 'path-measurements.json'), JSON.stringify(out, null, 1));
console.log('medians (ms, input event -> new Score on screen):', JSON.stringify(out.medians));
console.log('pixels (strong, 100+ in a channel):', JSON.stringify(out.pixels), '| vote control distinct Scores over 5 weights:', distinct(out.voteControl.hashes), '| path:', distinct(out.stops.map((s: any) => s.hash)));
console.log('stops:', out.stops.map((s: any) => `${s.j}:${s.noteheads}`).join(' '), '| inspector kick0:', JSON.stringify(out.inspector.kick0?.stack?.slice(0, 2)), '| kick6:', JSON.stringify(out.inspector.kick6?.stack?.[0]));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-path: a verdict failed; see path-measurements.json'); process.exit(1); }
