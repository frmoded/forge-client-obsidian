// 2026-10-24-1100 — "clicking a notehead or the staff often does not pin the bar": the sweep and the proof, in real headless Chrome with REAL pointer events (DevTools Input.dispatchMouseEvent: a mouse move, then
// press and release at once, which is what a computer-use click does). Run from the client repo root, after building the bundle:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs        (<dir> also holds app.css and plugin-styles.css, as for measure-phrase.ts)
//   node scripts/dev/measure-pin.ts <dir>                       the sweep + the verdicts (exit 1 when a verdict is false)
// For a phrase tab (extend) and a mix tab: a grid of points over the engraving is classified by the element the browser says is under each point (elementsFromPoint), and for each kind of element in each bar a
// few points are clicked FIRST (nothing pinned), REPEATED, and AFTER another bar is pinned. What pinned is read from the DOM (the pinned class), never assumed.
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const BAR6 = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_006.md', import.meta.url), 'utf8');
const phraseText = (p: object = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const mixText = (m: object = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false, ...m }, null, 2)}\n\`\`\`\n`;
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
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};window.__pinLines=[];const _i=console.info;console.info=(...a)=>{const t=a.map(String).join(' ');if(/^\\[forge-pin\\]/.test(t))window.__pinLines.push(t);_i(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

// ---- page-side helpers (strings: they run in Chrome) ----------------------------------------------------------------------------------------------------------------------------------------------------------
const PAGE = `(() => {
  const KINDS = ['notehead', 'stem', 'beam', 'flag', 'rest', 'dots', 'accid', 'barLine', 'clef', 'keySig', 'meterSig', 'tempo', 'dir', 'ledgerLines', 'staff', 'forge-artifact-hitbox', 'forge-artifact-band'];
  const svg = () => document.querySelector('.forge-rhythm-score-host svg');
  const measures = () => [...svg().querySelectorAll('g.measure')];
  // the element kind the browser reports under a client point, and the bar whose box holds the point
  window.__classify = (x, y) => {
    const top = document.elementsFromPoint(x, y)[0];
    const s = svg();
    if (!top || !s || !s.contains(top)) return { kind: 'outside' };
    let kind = null;
    for (let e = top; e && e !== s; e = e.parentElement) { const hit = KINDS.find((k) => e.classList && e.classList.contains(k)); if (hit) { kind = hit; break; } }
    const m = top.closest ? top.closest('g.measure') : null;
    return { kind: kind ?? (top === s || top.tagName === 'svg' ? 'empty' : top.tagName), under: m ? m.id : null };
  };
  window.__grid = (step) => {
    const ms = measures(); if (!ms.length) return [];
    const boxes = ms.map((m) => { const r = m.getBoundingClientRect(); return { id: m.id, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const pts = [];
    boxes.forEach((b, i) => {
      for (let x = Math.ceil(b.l) + 2; x < b.r - 2; x += step) for (let y = Math.ceil(b.t); y < b.b; y += step) {
        const c = window.__classify(x, y);
        if (c.kind !== 'outside') pts.push({ x, y, bar: i, id: b.id, ...c });
      }
    });
    return pts;
  };
  window.__state = () => {
    const pinned = [...document.querySelectorAll('.forge-artifact-pinned')].map((e) => e.id);
    const host = document.querySelector('.forge-inspector') || document.querySelector('.forge-phrase-inspector');
    const text = (document.querySelector('.forge-phrase-view') || document.body).innerText;
    return { pinned, hint: /Click a bar to see where it came from/.test(text), first: [...document.querySelectorAll('.forge-inspector-lineage > li > span')].map((s) => s.textContent)[0] ?? null };
  };
  window.__reset = () => { const s = svg(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
  window.__events = [];
  for (const t of ['mousedown', 'mouseup', 'click']) document.addEventListener(t, (e) => {
    const el = e.target; const m = el && el.closest ? el.closest('g.measure') : null;
    window.__events.push({ t, tag: el && el.tagName, cls: el && el.getAttribute && (el.getAttribute('class') || ''), measure: m ? m.id : null, prevented: e.defaultPrevented });
  }, true);
  // the pinned bar of a pinned id (a mix pins a note: its bar is the closest measure)
  window.__barOfPinned = () => { const e = document.querySelector('.forge-artifact-pinned'); if (!e) return null; const m = e.closest('g.measure'); return m ? m.id : e.id; };
  window.__noteheads = () => svg().querySelectorAll('g.notehead').length;
  // the bars a click at this point should pin: the bar the element under the point belongs to, else every bar whose box holds the point
  window.__expected = (x, y, under) => under ? [under] : measures().filter((m) => { const r = m.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }).map((m) => m.id);
  return true;
})()`;

type Trial = { kind: string; bar: number; first: boolean; repeat: boolean; afterPin: boolean; events?: any[] };

async function pickSamples(q: any, tab: 'extend' | 'mix') {
  const grid: any[] = await q.ev('window.__grid(5)');
  // up to 2 spread-out samples for every (bar, kind), keeping the matrix small
  const by = new Map<string, any[]>();
  for (const p of grid) { const k = `${p.bar}|${p.kind}`; (by.get(k) ?? by.set(k, []).get(k)!).push(p); }
  const samples: any[] = [];
  for (const [, ps] of by) {
    const take = ps.length >= 2 ? [ps[0], ps[ps.length - 1]] : ps;
    if (ps.length >= 5) take.push(ps[Math.floor(ps.length / 2)]);
    samples.push(...take);
  }
  return { grid, samples, tab };
}

/** CCQA: "ghost hits are only drawn while something is pinned". Same weight and threshold, Ghost off and on: noteheads in the engraving with NOTHING pinned, then with the bar pinned. */
async function ghostStudy(ghost: boolean) {
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  try {
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(mixText({ ghost, weight: 0.4, threshold: 0.5 }))}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)} }, path: 'phrases/phrase_002.md', name: 'phrase_002' })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(1500); await q.ev(PAGE);
    const unpinned = await q.ev('window.__noteheads()');
    await q.ev(`document.querySelector('.forge-rhythm-score-host svg').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); true`); await sleep(400);
    const pinned = await q.ev('window.__noteheads()');
    return { ghost, unpinned, pinned, bar: await q.ev('window.__barOfPinned()') };
  } finally { q.close(); }
}

async function sweep(tab: 'extend' | 'mix', ghost = false) {
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  const res: any = { tab };
  try {
    const mixOpts = tab === 'mix' ? `, bars: { bar_006: ${JSON.stringify(BAR6)} }, path: 'phrases/phrase_002.md', name: 'phrase_002'` : '';
    const text = tab === 'mix' ? mixText({ ghost }) : phraseText();
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}${mixOpts} })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(1500);
    await q.ev(PAGE);
    await q.ev(`document.querySelector('.forge-rhythm-score-host').scrollIntoView(); document.getElementById('pane').scrollTop = 0; true`);
    res.noteheadsUnpinned = await q.ev('window.__noteheads()');
    const { grid, samples } = await pickSamples(q, tab);
    res.gridPoints = grid.length; res.samples = samples.length;
    const rows: any[] = [];
    const clickAt = async (x: number, y: number) => { await q.click(x, y); await sleep(120); return q.ev('window.__state()'); };
    for (const s of samples) {
      await q.ev('window.__reset()'); await sleep(60);
      await q.ev('window.__events.length = 0');
      const first = await clickAt(s.x, s.y);
      const ev1 = await q.ev('window.__events.slice()');
      const barFirst = await q.ev('window.__barOfPinned()');
      const second = await clickAt(s.x, s.y);
      const barSecond = await q.ev('window.__barOfPinned()');
      // after another bar is pinned: pin a neighbour by keyboard (the one thing that always works), then click the sample
      await q.ev('window.__reset()'); await sleep(60);
      await q.ev(`(() => { const ms = [...document.querySelectorAll('.forge-rhythm-score-host svg g.measure')]; const other = ms[${s.bar} === 0 ? 1 : 0]; const el = document.querySelector('.forge-rhythm-score-host svg'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return other ? other.id : null; })()`);
      await sleep(80);
      const pre = await q.ev('window.__barOfPinned()');
      await q.ev('window.__events.length = 0');
      const after = await clickAt(s.x, s.y);
      const barAfter = await q.ev('window.__barOfPinned()');
      const expected: string[] = await q.ev(`window.__expected(${s.x}, ${s.y}, ${JSON.stringify(s.under)})`);
      const hit = (b: string | null) => b !== null && expected.includes(b);
      rows.push({ tab, kind: s.kind, bar: s.bar, id: s.id, expected, x: s.x, y: s.y, under: s.under, first: hit(barFirst), repeat: hit(barSecond), afterPin: hit(barAfter), firstState: first, afterPre: pre, ev1: ev1.map((e: any) => `${e.t}:${e.tag}${e.measure ? '@' + e.measure : ''}`) });
    }
    res.rows = rows;
    res.pinLines = await q.ev('window.__pinLines.slice()');
    res.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
  return res;
}

const summarize = (rows: any[]) => {
  const m: Record<string, { n: number; first: number; repeat: number; afterPin: number }> = {};
  for (const r of rows) { const k = r.kind; const a = (m[k] ??= { n: 0, first: 0, repeat: 0, afterPin: 0 }); a.n++; if (r.first) a.first++; if (r.repeat) a.repeat++; if (r.afterPin) a.afterPin++; }
  return m;
};

const out: any = {};
out.extend = await sweep('extend');
out.mix = await sweep('mix');
out.ghostOff = await ghostStudy(false);
out.ghostOn = await ghostStudy(true);
for (const k of ['extend', 'mix']) out[k].summary = summarize(out[k].rows ?? []);
const everyDrawnPartPins = (t: any) => (t.rows ?? []).length > 0 && (t.rows as any[]).every((r) => r.first && r.repeat && r.afterPin);
out.verdicts = {
  sweep_extendCoveredEveryKind: (out.extend.rows ?? []).length >= 40,
  sweep_mixCoveredEveryKind: (out.mix.rows ?? []).length >= 8,
  pin_everyClickInsideABarPinsThatBar_extend: everyDrawnPartPins(out.extend),
  pin_everyClickInsideABarPinsThatBar_mix: everyDrawnPartPins(out.mix),
  pin_evidenceLinesPrinted: (out.extend.pinLines ?? []).length >= 100 && (out.extend.pinLines ?? []).every((l: string) => /^\[forge-pin\] click \S+ -> (bar \d+|none) \(.+\)$/.test(l)),
  ghost_noteheadsAreDrawnWithNothingPinned: out.ghostOn.unpinned > out.ghostOff.unpinned && out.ghostOn.unpinned === out.ghostOn.pinned && out.ghostOff.unpinned === out.ghostOff.pinned,
  noConsoleErrors: ['extend', 'mix'].every((k) => (out[k].errors ?? ['x']).length === 0),
};
fs.writeFileSync(path.join(here, 'pin-measurements.json'), JSON.stringify(out, null, 1));
const table = (t: any) => Object.entries(t.summary as Record<string, any>).map(([k, v]) => `${k.padEnd(22)} n=${String(v.n).padStart(3)}  first ${String(v.first).padStart(3)}  repeat ${String(v.repeat).padStart(3)}  afterPin ${String(v.afterPin).padStart(3)}`).join('\n');
console.log(`EXTEND (grid ${out.extend.gridPoints} pts, ${out.extend.samples} samples)\n${table(out.extend)}\n\nMIX (grid ${out.mix.gridPoints} pts, ${out.mix.samples} samples)\n${table(out.mix)}\n`);
console.log(`ghost (weight 0.4, threshold 0.5): noteheads with nothing pinned / with the bar pinned: off ${out.ghostOff.unpinned}/${out.ghostOff.pinned}, on ${out.ghostOn.unpinned}/${out.ghostOn.pinned}`);
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-pin: a verdict failed; see pin-measurements.json'); process.exit(1); }
