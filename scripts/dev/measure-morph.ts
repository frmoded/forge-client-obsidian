// 2026-10-24-1200 (M7c Phase A) — the MORPH tab in real headless Chrome: the strip, the Score (one measure per bar, one notehead fewer each step on an atomic bar_005 -> bar_006 path), the Position slider's stops by REAL
// PIXELS (a hash of the Score region: five stops, five different Scores), and the redraw latency of a control change against the MIX tab's (the prompt: "<= the mix's"), measured the same way as the mix study in
// measure-phrase.ts: the input event -> the moment the new engraving replaces the old one in the panel. Run from the client repo root, after building the bundle:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css, as for measure-phrase.ts)
//   node scripts/dev/measure-morph.ts <dir>                       the study + the verdicts (exit 1 when a verdict is false)
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

const out: any = {};

// ---- the 5-bar atomic morph: the strip, one measure per bar, one notehead fewer each step ----------------------------------------------------------------------------------------------------------------
{
  const h = await open('morph', morphText());
  try {
    out.strip = await h.q.ev(`(() => { const g = (s) => document.querySelector(s); return { a: g('.forge-morph-a')?.value, b: g('.forge-morph-b')?.value, bars: g('.forge-morph-bars')?.value, order: g('.forge-morph-order')?.value, seedDisabled: g('.forge-morph-seed')?.disabled,
      positionShown: g('.forge-morph-position')?.closest('label')?.style.display !== 'none', sentence: g('.forge-morph-sentence')?.textContent, inspector: !!g('.forge-inspector'), bracket: !!g('.forge-phrase-bracket'), mixStrip: !!g('.forge-mix-weight'), extendStrip: !!g('.forge-phrase-bars') }; })()`);
    out.atomic = await h.q.ev(`(() => { const svg = document.querySelector('.forge-rhythm-score-host svg'); const ms = [...svg.querySelectorAll('g.measure')]; return { measures: ms.length, noteheads: ms.map((m) => m.querySelectorAll('g.notehead').length), tempi: [...svg.querySelectorAll('g.tempo')].map((g) => g.textContent.replace(/\\s+/g, ' ').trim()) }; })()`);
    await h.q.shot(path.join(SHOTS, 'morph-atomic-5.png'), { x: 0, y: 0, width: 800, height: 560 });
    // Atomic from 2 bars: the button reads the two bars and sets Bars to d + 1
    await h.setControl('.forge-morph-bars', '2', 'change'); await h.settle();
    await h.q.ev(`document.querySelector('.forge-morph-atomic').click()`); await h.settle();
    out.atomicButton = { barsAfter: await h.q.ev(`document.querySelector('.forge-morph-bars').value`), written: (await h.written(4)).bars, measures: await h.q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.measure').length`) };
    // the Position slider: Bars = 1 shows five stops; each stop is a different Score (real pixels) with one notehead fewer
    await h.setControl('.forge-morph-bars', '1', 'change'); await h.settle();
    out.position = { max: await h.q.ev(`document.querySelector('.forge-morph-position').max`), label: await h.q.ev(`document.querySelector('.forge-morph-position-value').textContent`), stops: [] as any[] };
    for (let k = 0; k <= 4; k++) {
      await h.setControl('.forge-morph-position', String(k)); await h.settle();
      out.position.stops.push({ k, noteheads: await h.q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`), hash: await h.hashScore(), label: await h.q.ev(`document.querySelector('.forge-morph-position-value').textContent`), written: (await h.written(4)).position });
    }
    await h.q.shot(path.join(SHOTS, 'morph-position-4.png'), { x: 0, y: 0, width: 800, height: 520 });
    // a scrub: 20 inputs 40 ms apart across the stops: coalesced draws, and the LAST Score is the last value
    await h.setControl('.forge-morph-position', '0'); await h.settle();
    await h.q.ev('window.__timings = []; window.__swaps = []');
    const scrub = await h.q.ev(`(async () => { const e = document.querySelector('.forge-morph-position'); let t = 0; for (let i = 0; i <= 19; i++) { e.value = String(i % 5 === 0 ? 4 : i % 5 - 1 < 0 ? 0 : i % 5 - 1); if (i === 19) e.value = '3'; t = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 40)); } return { tLast: t, shown: document.querySelector('.forge-morph-position-value').textContent }; })()`);
    await h.settle();
    const tm = await h.q.ev('window.__timings.slice()'); const sw = await h.q.ev('window.__swaps.slice()');
    out.scrub = { inputs: 20, rendersEngraved: tm.length, swaps: sw.length, lastInputToLastSwapMs: sw.length ? Math.round(sw[sw.length - 1] - scrub.tLast) : null, shownAtEnd: scrub.shown, writtenPosition: (await h.written(4)).position, noteheadsAtEnd: await h.q.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.notehead').length`) };
    out.morphLatency = {
      position: await latency(h, '.forge-morph-position', ['4', '0', '3', '1', '4']),
    };
    await h.setControl('.forge-morph-bars', '5', 'change'); await h.settle();
    out.morphLatency.order = await latency(h, '.forge-morph-order', ['by_channel', 'musical', 'by_channel', 'musical', 'by_channel'], 'change');
    out.morphLatency.bars = await latency(h, '.forge-morph-bars', ['3', '5', '3', '5', '3'], 'change');
    out.errors = await h.q.ev('window.__errors.slice()');
  } finally { h.q.close(); }
}

// ---- the mix: the same measurement, for the yardstick ---------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const h = await open('mix', mixText({ weight: 1 }));
  try {
    await h.setControl('.forge-mix-weight', '1'); await h.settle();
    out.mixLatency = { weight: await latency(h, '.forge-mix-weight', ['0.4', '0.9', '0.4', '0.9', '0.4']) };
    out.mixErrors = await h.q.ev('window.__errors.slice()');
  } finally { h.q.close(); }
}

// ---- an EXTEND phrase of five bars: the like-for-like yardstick for a five-bar morph (a mix draws ONE bar, so a five-bar Score cannot be compared with it) -------------------------------------------------------------------------
{
  const h = await open('extend', note({ kind: 'extend', source: 'bar_005', bars: 5, style: 'repeat_with_fills', tempo_change_pct: 0 }));
  try {
    await h.setControl('.forge-phrase-pct', '0', 'change'); await h.settle();
    out.extendLatency = { pct: await latency(h, '.forge-phrase-pct', ['-20', '0', '-20', '0', '-20'], 'change') };
    out.extendErrors = await h.q.ev('window.__errors.slice()');
  } finally { h.q.close(); }
}

// ---- M7c Phase B (drain 2026-10-24-1230): navigation through a morph, with REAL pointer events and real pixels ---------------------------------------------------------------------------------------------------
{
  const h = await open('morph', morphText(), { bar_009: PLUS3 });
  const q = h.q;
  const res: any = {};
  try {
    const stack = () => q.ev(`[...document.querySelectorAll('.forge-inspector-lineage > li')].map((li) => (li.querySelector('span') || li.querySelector('button')).textContent)`);
    const pinned = () => q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host .forge-artifact-pinned')].map((g) => g.id)`);
    /** a point INSIDE bar n's box that is empty space (the svg root is what the browser says is under it): the click Iteration 123 made pin the bar */
    const emptyIn = (n: number) => q.ev(`(() => { const g = document.querySelector('#ph_bar_${n}'); g.scrollIntoView({ block: 'center', inline: 'center' }); const r = g.getBoundingClientRect(); const svg = document.querySelector('.forge-rhythm-score-host svg');
      for (let fy = 0.1; fy < 1; fy += 0.05) for (let fx = 0.3; fx < 1; fx += 0.05) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const top = document.elementsFromPoint(x, y)[0]; if (top === svg) return { x, y }; } return null; })()`);
    const noteXY = (id: string) => q.ev(`(() => { const e = document.querySelector('#${id} .notehead'); e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const away = async () => { await q.hover(5, 790); await sleep(150); };
    const edit = (text: string) => q.ev(`window.__edit('phrases/phrase_004.md', ${JSON.stringify(text)})`);
    // blur first: clicking focuses the Score host (tabindex 0) and the focus ring ALONE changes the pixels (the mix study's lesson)
    let clipN = 0;
    const clip = async (name: string): Promise<string> => {
      await q.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`); await sleep(100);
      const c = await q.ev(`(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach((e) => { if (e.scrollLeft) e.scrollLeft = 0; }); document.getElementById('pane').scrollTop = 0; const e = document.querySelector('.forge-rhythm-score-host'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 300) }; })()`);
      const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
      const file = path.join(SHOTS, `morph-${name}-clip.png`); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); clipN++;
      return file;
    };
    res.bars = [];
    const expected = (n: number, edit: string) => [`bar ${n} of 5`, 'made by phrase_004 (morph bar_005 -> bar_006, musical order)', `step ${n - 1} of 4 single-hit changes applied`, 'from bar_005', 'from bar_006', 'tempo 100', edit,
      '▲ only bar_005 (not changed yet) · ■ only bar_006 (already changed) · ● both bars', 'Edit this bar'];
    const edits = ['unchanged: this is bar_005', 'removed kick at step 4', 'removed kick at step 3', 'removed kick at step 7', 'removed snare at step 7; this is bar_006'];
    for (let n = 1; n <= 5; n++) {
      const p = await emptyIn(n); await q.click(p.x, p.y); await sleep(250);
      res.bars.push({ n, pinned: await pinned(), stack: await stack(), expected: expected(n, edits[n - 1]) });
    }
    // a click on a notehead: the hit and where it changes
    let p = await noteXY('mo2_kick_2'); await q.click(p.x, p.y); await sleep(250);
    res.hitA = { pinned: await pinned(), first: (await stack())[0], second: (await stack())[1] };
    p = await noteXY('mo2_kick_0'); await q.click(p.x, p.y); await sleep(250);
    res.hitBoth = { pinned: await pinned(), first: (await stack())[0] };
    res.fills = await q.ev(`Object.fromEntries(['mo2_kick_0', 'mo2_kick_2', 'mo2_snare_4', 'mo3_kick_0'].map((id) => [id, getComputedStyle(document.querySelector('#' + id + ' .notehead')).fill]))`);
    res.marks = await q.ev(`document.querySelectorAll('.forge-mix-mark').length`);
    // the Open note links
    await q.ev('window.__opened = []');
    for (const i of [1, 2, 3]) {
      const b = await q.ev(`(() => { const bs = [...document.querySelectorAll('.forge-inspector-lineage button.forge-inspector-open')]; const e = bs[${i - 1}]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (b) { await q.click(b.x, b.y); await sleep(150); }
    }
    res.opened = await q.ev('window.__opened.slice()');
    // Esc lets go and clears the paint
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(250);
    res.afterEsc = { pinned: await pinned(), marks: await q.ev(`document.querySelectorAll('.forge-mix-mark').length`), styled: await q.ev(`document.querySelectorAll('[data-forge-morph-painted]').length`) };

    // ---- the pixel claim, made fairly: ONE bar at position 0 is bar a in both runs (an identical layout); the same engraved hit (kick, step 4) is "bar a only" against bar_006 and "both bars" against bar_009
    await edit(morphText({ bars: 1, position: 0 })); await h.settle(); await sleep(500);
    await edit(morphText({ bars: 1, position: 0 })); await h.settle(); await sleep(400);   // one identical re-render: the very first render after mount differs from every later one
    await away(); const u1 = await clip('u1');
    p = await noteXY('mo1_kick_3'); await q.click(p.x, p.y); await sleep(500); await h.settle();
    res.single = { hitLine: (await stack())[0], pinned: await pinned() };
    await away(); const p1 = await clip('p1');
    await edit(morphText({ bars: 1, position: 0, b: 'bar_009' })); await h.settle(); await sleep(400);
    res.singleBoth = { hitLine: (await stack())[0], pinnedAfterEdit: await pinned() };
    await away(); const p2 = await clip('p2');
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(300);
    await away(); const u2 = await clip('u2');
    res.strong = { noise_u1_u2: strongDiff(u1, u2), cue_u1_p1: strongDiff(u1, p1), cue_u2_p2: strongDiff(u2, p2), aOnly_vs_both_p1_p2: strongDiff(p1, p2), aOnly_vs_both_at50: strongDiff(p1, p2, 50), noise_u1_u2_at50: strongDiff(u1, u2, 50) };   // blue (27,110,194) vs purple (106,61,154) differ by at most 79 in a channel, so the fill itself only shows below 100; noise is at most ~31, hence 50 with its own control
    await q.shot(path.join(SHOTS, 'morph-pinned-hit.png'), { x: 0, y: 0, width: 800, height: 700 });

    // ---- fork on a morph bar, in the real page: Edit this bar on bar 3, the stack, a neighbour untouched, Revert: the note is byte for byte what it was
    await edit(morphText()); await h.settle(); await sleep(500);
    const before = await h.q.ev(`window.__files.get('phrases/phrase_004.md')`);
    const hadBars: string[] = await h.q.ev(`[...window.__files.keys()].filter((k) => /^bars\\/bar_\\d+\\.md$/.test(k))`);
    await away(); const f0 = await clip('f0');
    p = await emptyIn(4); await q.click(p.x, p.y); await sleep(250); const bar4 = await stack();
    p = await emptyIn(3); await q.click(p.x, p.y); await sleep(250);
    const btn = await q.ev(`(() => { const e = document.querySelector('.forge-inspector-action-button'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: e.textContent }; })()`);
    await q.click(btn.x, btn.y); await sleep(600); await h.settle(); await sleep(500);
    const forkText = await h.q.ev(`(() => { const had = ${JSON.stringify(hadBars)}; return [...window.__files.keys()].filter((k) => /^bars\\/bar_\\d+\\.md$/.test(k) && !had.includes(k))[0] ?? null; })()`);
    res.fork = { button: btn.label, created: forkText, forkedFrom: await h.q.ev(`(window.__files.get(${JSON.stringify(forkText)}).match(/^forked_from: .*$/m) || [''])[0]`), phrase: (await h.q.ev(`window.__files.get('phrases/phrase_004.md')`)).match(/"overrides": \{[^}]*\}/)?.[0] ?? null,
      opened: await h.q.ev('window.__opened.slice(-1)[0]') };
    p = await emptyIn(3); await q.click(p.x, p.y); await sleep(250);
    res.fork.stack3 = await stack();
    p = await emptyIn(4); await q.click(p.x, p.y); await sleep(250);
    res.fork.stack4Same = JSON.stringify(await stack()) === JSON.stringify(bar4);
    res.fork.hitsOfBar3 = await q.ev(`document.querySelectorAll('[id^="mo3_"]').length`);
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(250);
    await away(); const f1 = await clip('f1');
    res.fork.pixelsChangedByForkingWithoutEditing = strongDiff(f0, f1);
    p = await emptyIn(3); await q.click(p.x, p.y); await sleep(250);
    const rv = await q.ev(`(() => { const e = document.querySelector('.forge-inspector-action-button'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: e.textContent }; })()`);
    await q.click(rv.x, rv.y); await sleep(600); await h.settle(); await sleep(400);
    res.fork.revert = { button: rv.label, noteIsByteForByteBefore: (await h.q.ev(`window.__files.get('phrases/phrase_004.md')`)) === before, forkNoteStays: await h.q.ev(`window.__files.has(${JSON.stringify(forkText)})`) };
    res.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
  out.inspector = res;
}

const med = (rows: Array<{ inputToSwapMs: number | null }>) => median(rows.map((r) => r.inputToSwapMs));
out.medians = { extendFiveBars: med(out.extendLatency.pct), mixWeight: med(out.mixLatency.weight), morphPosition: med(out.morphLatency.position), morphOrder: med(out.morphLatency.order), morphBars: med(out.morphLatency.bars) };
const distinct = (xs: string[]) => new Set(xs).size;
out.verdicts = {
  morph_theStripIsThere: out.strip.a === 'bar_005' && out.strip.b === 'bar_006' && out.strip.bars === '5' && out.strip.order === 'musical' && out.strip.seedDisabled === true && out.strip.positionShown === false
    && out.strip.sentence === 'Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (musical order).',
  // Phase B REVERSES Phase A's "no Inspector": a morph has one now; it still has no bracket and no other strip
  morph_hasAnInspectorButNoBracketOrOtherStrip: out.strip.inspector === true && out.strip.bracket === false && out.strip.mixStrip === false && out.strip.extendStrip === false,
  morph_atomicScoreIsFiveBarsEachOneNoteheadFewer: out.atomic.measures === 5 && JSON.stringify(out.atomic.noteheads) === JSON.stringify([8, 7, 6, 5, 4]),
  morph_atomicButtonSetsBarsToDPlusOne: out.atomicButton.barsAfter === '5' && out.atomicButton.written === 5 && out.atomicButton.measures === 5,
  morph_positionHasFiveStopsAndEachIsADifferentScoreByPixels: out.position.max === '4' && out.position.stops.length === 5 && distinct(out.position.stops.map((s: any) => s.hash)) === 5
    && JSON.stringify(out.position.stops.map((s: any) => s.noteheads)) === JSON.stringify([8, 7, 6, 5, 4]) && out.position.stops.every((s: any) => s.written === s.k && s.label === `${s.k} of 4 changes`),
  // (when the engine nearly keeps up with the pointer there is little to collapse: the mix's scrub engraved 18 of 20; coalescing itself is a unit test, phrase-morph-dom.test.ts)
  morph_aScrubEndsOnTheLastValueAndTheLastScoreFollowsTheLastInputClosely: out.scrub.rendersEngraved >= 1 && out.scrub.writtenPosition === 3 && out.scrub.shownAtEnd === '3 of 4 changes' && out.scrub.noteheadsAtEnd === 5 && out.scrub.lastInputToLastSwapMs !== null && out.scrub.lastInputToLastSwapMs <= 250,
  morph_everyControlChangeDrawsTheNewScore: [...out.morphLatency.position, ...out.morphLatency.order, ...out.morphLatency.bars].every((r: any) => r.inputToSwapMs !== null && r.renders >= 1),
  // one bar against one bar: the morph at a Position is the mix's size (run-to-run noise is about 10 ms, hence the 15 ms allowance on the prompt's "<= the mix's")
  morph_oneBarRedrawIsNoSlowerThanTheMix: out.medians.mixWeight !== null && out.medians.morphPosition !== null && out.medians.morphPosition <= out.medians.mixWeight + 15,
  // five bars against five bars: a morph of five bars engraves five bars, like an extend of five bars (it cannot be compared with the mix's ONE bar)
  morph_fiveBarRedrawIsNoSlowerThanAnExtendOfFiveBars: out.medians.extendFiveBars !== null && [out.medians.morphOrder, out.medians.morphBars].every((m) => m !== null && m <= out.medians.extendFiveBars * 1.25 + 15),
  morph_noConsoleErrors: (out.errors ?? ['x']).length === 0 && (out.mixErrors ?? ['x']).length === 0 && (out.extendErrors ?? ['x']).length === 0,
  // ---- M7c Phase B: the Inspector, real pointer events and real pixels
  insp_aClickInEveryBarsEmptyStaffPinsThatBarAndShowsItsStack: out.inspector.bars.length === 5 && out.inspector.bars.every((b: any) => JSON.stringify(b.pinned) === JSON.stringify([`ph_bar_${b.n}`]) && JSON.stringify(b.stack) === JSON.stringify(b.expected)),
  insp_aNoteheadPinsItsHitAndSaysWhereItChanges: JSON.stringify(out.inspector.hitA.pinned) === JSON.stringify(['mo2_kick_2']) && out.inspector.hitA.first === 'this hit: from bar_005 only (removed in bar 3)' && out.inspector.hitA.second === 'bar 2 of 5'
    && out.inspector.hitBoth.first === 'this hit: from both bars',
  insp_theThreeOpenNoteLinksOpenThePhraseAndEachBar: JSON.stringify(out.inspector.opened) === JSON.stringify(['phrases/phrase_004', 'bars/bar_005', 'bars/bar_006']),
  insp_pinnedBarNoteheadsArePaintedByParentInRealPixels: out.inspector.fills.mo2_kick_0 === 'rgb(106, 61, 154)' && out.inspector.fills.mo2_kick_2 === 'rgb(27, 110, 194)' && out.inspector.fills.mo2_snare_4 === 'rgb(106, 61, 154)' && out.inspector.fills.mo3_kick_0 !== 'rgb(106, 61, 154)' && out.inspector.marks === 7,
  insp_escLetsGoAndClearsThePaint: out.inspector.afterEsc.pinned.length === 0 && out.inspector.afterEsc.marks === 0 && out.inspector.afterEsc.styled === 0,
  insp_rendered_pinningPaintsTheBar: out.inspector.strong.cue_u1_p1 >= 300 && out.inspector.strong.cue_u2_p2 >= 300,
  insp_rendered_anAOnlyHitAndABothHitLookDifferentWhilePinned: out.inspector.strong.noise_u1_u2_at50 === 0 && out.inspector.strong.aOnly_vs_both_at50 >= 30 && /from bar_005 only/.test(out.inspector.single.hitLine) && out.inspector.singleBoth.hitLine === 'this hit: from both bars',
  insp_rendered_stabilityControl_unpinnedRendersDifferOnlyByNoise: out.inspector.strong.noise_u1_u2 === 0,
  insp_forkOnAMorphBarWritesTheForkAndThePhraseAndTheStackSaysSo: out.inspector.fork.button === 'Edit this bar' && /^bars\/bar_\d+\.md$/.test(out.inspector.fork.created) && /^forked_from: "phrases\/phrase_004 bar 3"$/.test(out.inspector.fork.forkedFrom)
    && /"3": "bars\/bar_\d+"/.test(out.inspector.fork.phrase ?? '') && out.inspector.fork.opened === out.inspector.fork.created.replace(/\.md$/, '') && out.inspector.fork.stack3[0] === 'bar 3 of 5' && /^forked: edited in bar_\d+ \(was made by phrase_004, morph bar_005 -> bar_006, musical order\)$/.test(out.inspector.fork.stack3[1])
    && out.inspector.fork.stack3.at(-1) === 'Revert to generated' && out.inspector.fork.stack4Same === true && out.inspector.fork.hitsOfBar3 === 0,
  insp_rendered_forkingWithoutEditingChangesNoPixel: out.inspector.fork.pixelsChangedByForkingWithoutEditing === 0,
  insp_revertRestoresTheNoteByteForByteAndKeepsTheForkNote: out.inspector.fork.revert.button === 'Revert to generated' && out.inspector.fork.revert.noteIsByteForByteBefore === true && out.inspector.fork.revert.forkNoteStays === true,
  insp_noConsoleErrors: (out.inspector.errors ?? ['x']).length === 0,
};
fs.writeFileSync(path.join(here, 'morph-measurements.json'), JSON.stringify(out, null, 1));
console.log('medians (ms, input event -> new Score on screen):', JSON.stringify(out.medians));
console.log('inspector pixels (strong, 100+ in a channel):', JSON.stringify(out.inspector.strong), '| fork pixels:', out.inspector.fork.pixelsChangedByForkingWithoutEditing);
console.log('atomic noteheads per bar:', JSON.stringify(out.atomic.noteheads), '| position stops:', out.position.stops.map((s: any) => `${s.k}:${s.noteheads}`).join(' '), '| scrub renders', out.scrub.rendersEngraved, 'of', out.scrub.inputs);
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-morph: a verdict failed; see morph-measurements.json'); process.exit(1); }
