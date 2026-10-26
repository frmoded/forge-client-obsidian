// 2026-10-26-1100 (CCQA smoke 5, morph polish) in real headless Chrome with the real engine behind /phrase: (4) the zoom a person chose survives the redraws of its tab (RED RUN: the same run with the memory off goes
// back to 100% on every redraw), (3) the legend that says steps count from 1 in a real pinned bar, (1) the playback follower on a morph: with a simulated player clock the sounding note changes colour in REAL PIXELS
// (a regression guard: this is what could be reproduced; the defect itself needs the real Obsidian player, see the FEEDBACK) and the follower's evidence lines. Run from the client repo root after building the harness:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css = styles.css)
//   node scripts/dev/measure-polish.ts <dir>                      the study + the verdicts (exit 1 when a verdict is false)
// WALL-CLOCK ONLY. Parallel Chrome runs stall each other: run it alone.
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

async function open(kind: 'morph' | 'mix' | 'extend', text: string, extraBars: Record<string, string> = {}, noZoomMemory = false) {
  const n = kind === 'morph' ? 4 : kind === 'mix' ? 2 : 1;
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, ...${JSON.stringify(extraBars)} }, path: 'phrases/phrase_00${n}.md', name: 'phrase_00${n}', noZoomMemory: ${noZoomMemory} })`);
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

const out: any = {};
const zoomState = (q: any) => q.ev(`(() => { const svg = document.querySelector('.forge-rhythm-score-host svg'); return { label: document.querySelector('.forge-zoom-reset')?.textContent, width: svg ? Math.round(parseFloat(svg.style.width || '0')) : null, measures: document.querySelectorAll('.forge-rhythm-score-host svg g.measure').length }; })()`);

async function zoomRun(noMemory: boolean) {
  const h = await open('morph', morphText({ bars: 5 }), {}, noMemory);
  const q = h.q;
  try {
    const res: any = { start: await zoomState(q) };
    await q.ev(`(() => { const b = [...document.querySelectorAll('.forge-zoom-button')].find((e) => e.getAttribute('aria-label') === 'Zoom in'); b.click(); b.click(); })()`);
    res.afterTwoClicks = await zoomState(q);
    await h.setControl('.forge-morph-bars', '4', 'change'); await h.settle(); await sleep(500);
    res.afterBarsChange = await zoomState(q);
    await h.setControl('.forge-morph-order', 'by_channel', 'change'); await h.settle(); await sleep(500);
    res.afterOrderChange = await zoomState(q);
    await q.ev(`document.querySelector('.forge-zoom-reset').click()`);
    res.afterReset = await zoomState(q);
    await h.setControl('.forge-morph-bars', '5', 'change'); await h.settle(); await sleep(500);
    res.afterResetThenRedraw = await zoomState(q);
    res.errors = await q.ev('window.__errors.slice()');
    return res;
  } finally { q.close(); }
}
out.zoom = await zoomRun(false);
out.zoomRed = await zoomRun(true);

// ---- the legend, in a real pinned bar (real pointer events) and the follower with a simulated player clock ----------------------------------------------------------------------------------------------------------
{
  const h = await open('morph', morphText());
  const q = h.q;
  try {
    const emptyIn = (n: number) => q.ev(`(() => { const g = document.querySelector('#ph_bar_${n}'); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect(); const svg = document.querySelector('.forge-rhythm-score-host svg'); for (let fy = 0.1; fy < 1; fy += 0.05) for (let fx = 0.3; fx < 1; fx += 0.05) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (document.elementsFromPoint(x, y)[0] === svg) return { x, y }; } return null; })()`);
    const p = await emptyIn(3); await q.click(p.x, p.y); await sleep(300);
    out.legend = await q.ev(`[...document.querySelectorAll('.forge-inspector-lineage > li')].map((li) => (li.querySelector('span') || li.querySelector('button')).textContent)`);
    await q.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    const clip = async (name: string): Promise<string> => {
      await sleep(100);
      const c = await q.ev(`(() => { window.scrollTo(0, 0); document.getElementById('pane').scrollTop = 0; const e = document.querySelector('.forge-rhythm-score-host'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 300) }; })()`);
      const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
      const file = path.join(SHOTS, `polish-${name}.png`); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      return file;
    };
    // un-pin (Esc) so only the follower changes a note's colour
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(300);
    out.followerLines = await q.ev('(window.__follower || []).slice()');
    const idle1 = await clip('idle1'); const idle2 = await clip('idle2');
    await q.ev(`(() => { const p = document.querySelector('midi-player'); window.__t = 1.5; Object.defineProperty(p, 'currentTime', { get: () => window.__t, configurable: true }); p.dispatchEvent(new CustomEvent('start')); })()`);
    await sleep(300);
    const playing = await clip('playing');
    out.follower = { noise: strongDiff(idle1, idle2, 50), playingVsIdle: strongDiff(idle1, playing, 50), lit: await q.ev(`[...document.querySelectorAll('.is-playing')].map((e) => e.id)`), fill: await q.ev(`(() => { const e = document.querySelector('.is-playing'); const n = e && (e.querySelector('.notehead') || e); return n ? getComputedStyle(n).fill : null; })()`) };
    await q.ev(`window.__t = 5; 0`); await sleep(300);
    out.followerLater = await q.ev(`[...document.querySelectorAll('.is-playing')].map((e) => e.id)`);
    out.followerStartLines = await q.ev('(window.__follower || []).slice()');
    out.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
}
out.verdicts = {
  zoom_startsAt100: out.zoom.start.label === '100%',
  zoom_twoClicksIs150: out.zoom.afterTwoClicks.label === '150%' && out.zoom.afterTwoClicks.width > out.zoom.start.width,
  zoom_survivesABarsChange: out.zoom.afterBarsChange.label === '150%' && out.zoom.afterBarsChange.measures === 4,
  zoom_survivesAnOrderChange: out.zoom.afterOrderChange.label === '150%',
  zoom_resetGoesTo100AndStaysThere: out.zoom.afterReset.label === '100%' && out.zoom.afterResetThenRedraw.label === '100%',
  zoom_widthFollowsTheLevelAfterARedraw: out.zoom.afterBarsChange.width > 0 && out.zoom.afterOrderChange.width === out.zoom.afterBarsChange.width,
  zoom_RED_withoutTheMemoryEveryRedrawIsBackAt100: out.zoomRed.afterTwoClicks.label === '150%' && out.zoomRed.afterBarsChange.label === '100%' && out.zoomRed.afterOrderChange.label === '100%',
  legend_aPinnedBarSaysStepsCountFromOne: out.legend.filter((t: string) => /steps count from 1: step 1 is the first position of the bar/.test(t)).length === 1,
  follower_evidenceAtAttach: out.followerLines.some((l: string) => /^\[forge-score\] follower attached: \d+ time points, 30 of 30 note ids are in this Score/.test(l)),
  follower_evidenceAtStart: out.followerStartLines.some((l: string) => /^\[forge-score\] follower started: player at 1\.50 s \(\d+\.\d+ s into the Score\), expecting \d+ note ids now, \d+ of them in this Score/.test(l)),
  follower_regression_aMorphNoteLightsInRealPixels: out.follower.noise === 0 && out.follower.playingVsIdle > 0 && out.follower.lit.length > 0 && /^rgb\(\d+, \d+, \d+\)$/.test(out.follower.fill),
  follower_regression_itMovesWithTheClock: out.followerLater.length > 0 && JSON.stringify(out.followerLater) !== JSON.stringify(out.follower.lit),
  noConsoleErrors: [...out.zoom.errors, ...out.zoomRed.errors, ...out.errors].length === 0,
};
fs.writeFileSync(path.join(here, 'polish-measurements.json'), JSON.stringify(out, null, 1));
console.log('zoom:', JSON.stringify([out.zoom.start.label, out.zoom.afterTwoClicks.label, out.zoom.afterBarsChange.label, out.zoom.afterOrderChange.label, out.zoom.afterReset.label, out.zoom.afterResetThenRedraw.label]), '| red (no memory):', JSON.stringify([out.zoomRed.afterTwoClicks.label, out.zoomRed.afterBarsChange.label, out.zoomRed.afterOrderChange.label]));
console.log('follower pixels (strong, 50+): noise', out.follower.noise, 'playing vs idle', out.follower.playingVsIdle, '| lit', JSON.stringify(out.follower.lit), '->', JSON.stringify(out.followerLater), '| lines:', JSON.stringify(out.followerStartLines));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-polish: a verdict failed; see polish-measurements.json'); process.exit(1); }
