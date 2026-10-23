// M5 (drain 2026-10-22-1850) — step 1 item (iii) and the real-Chrome proof of the phrase tab. Run from the client repo root, after building the bundle:
//   OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-phrase.ts <dir>          (<dir> must hold harness-phrase.js, app.css, plugin-styles.css — browser-proof.mjs makes them)
// WALL-CLOCK ONLY. The real engine runs in Node behind /phrase; everything else is real Chrome: the phrase DOM, Verovio, html-midi-player's note sequence. Audio is NOT played (headless): what is
// measured is what the player schedules — the NoteSequence it is given (the very object `renderTaggedMusicXML` hands the <midi-player>) — and Verovio's own timeMap for the same XML.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { readRhythmNote } from '../../src/rhythm-edit-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const phraseText = (p: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20, ...p }, null, 2)}\n\`\`\`\n`;
const py = await engine();
const bar = readRhythmNote(BAR); if (bar.ok === false) throw new Error('bar_005 fixture');

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
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};for(const k of ['log','warn']){const o=console[k];console[k]=(...a)=>{const t=a.map(String).join(' ');if(/out of bounds|pageWidth/i.test(t))window.__errors.push(t.slice(0,300));o(...a)}}</script>
<script src="harness-phrase.js"></script></body></html>`;

const out: any = {};
const p = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
try {
  const t0 = performance.now();
  await p.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(phraseText({}))}, bar: ${JSON.stringify(BAR)} })`);
  for (let w = 0; w < 20000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
  out.firstScoreMs = Math.round(performance.now() - t0);
  await sleep(1500);                                                                   // let the MIDI player build its note sequence
  out.errors = await p.ev('window.__errors.slice()');
  out.layout = await p.ev(`(() => { const pane = document.getElementById('pane'); const host = document.querySelector('.forge-rhythm-score-host'); const svg = host.querySelector('svg'); const sc = host.querySelector('.forge-output-score'); const r = (e) => e && e.getBoundingClientRect().toJSON(); return { paneClientW: pane.clientWidth, paneScrollW: pane.scrollWidth, hostW: r(host).width, scoreBoxW: r(sc) && r(sc).width, svgW: r(svg).width, svgViewBox: svg.getAttribute('viewBox'), svgAttrW: svg.getAttribute('width'), controlsRect: r(document.querySelector('.forge-phrase-controls')) }; })()`);
  out.dom = await p.ev(`(() => { const svg = document.querySelector('.forge-rhythm-score-host svg'); const q = (s) => svg ? svg.querySelectorAll(s).length : -1;
    return { measureGroups: q('g.measure'), tempoGroups: q('g.tempo'), tempoTexts: svg ? [...svg.querySelectorAll('g.tempo')].map((g) => g.textContent.replace(/\\s+/g, ' ').trim()) : [], staves: q('g.staff'),
      midiPlayers: document.querySelectorAll('midi-player').length, controls: { bars: document.querySelector('.forge-phrase-bars')?.value, style: document.querySelector('.forge-phrase-style')?.value, pct: document.querySelector('.forge-phrase-pct')?.value } }; })()`);
  out.hostStructure = await p.ev(`(() => { const h = document.querySelector('.forge-rhythm-score-host'); const strip = (n, d) => d > 4 ? '…' : n.nodeType !== 1 ? '' : '<' + n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').join('.') : '') + '>' + [...n.children].filter((c) => c.tagName.toLowerCase() !== 'svg').map((c) => strip(c, d + 1)).join(''); return strip(h, 0); })()`);
  out.player = await p.ev(`(() => { const pl = document.querySelector('midi-player'); if (!pl) return null; const ns = pl.noteSequence; if (!ns) return { noSequence: true };
    const bars = []; const onsets = ns.notes.map((n) => n.startTime).sort((a, b) => a - b);
    return { notes: ns.notes.length, totalTime: ns.totalTime, tempos: ns.tempos, timeSignatures: ns.timeSignatures, firstOnsets: onsets.slice(0, 4), lastOnset: onsets[onsets.length - 1] }; })()`);
  // The expected timing, from the engine's own bar tempi: bar k lasts 4 beats at tempo_k.
  const tempi = [100, 97, 94, 91, 89, 86, 83, 80];
  const barSecs = tempi.map((t) => (4 * 60) / t);
  const starts = barSecs.map((_, i) => barSecs.slice(0, i).reduce((a, b) => a + b, 0));
  out.expected = { tempi, barSecs: barSecs.map((s) => +s.toFixed(3)), barStartsSec: starts.map((s) => +s.toFixed(3)), totalSec: +barSecs.reduce((a, b) => a + b, 0).toFixed(3), flat100TotalSec: 8 * 2.4 };
  // Where the player's note sequence puts each bar: bar start = the first onset at or after the expected start -/+ tolerance; report the onset list near every expected bar start.
  out.playerBarStarts = await p.ev(`(() => { const ns = document.querySelector('midi-player').noteSequence; const onsets = [...new Set(ns.notes.map((n) => +n.startTime.toFixed(3)))].sort((a, b) => a - b); return onsets; })()`);
  // Verovio's own timeMap for the same XML (the cursor/highlight source).
  const payload = computePhrase(py, bar.value.data, { bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }, 'phrase_001');
  out.verovio = await p.ev(`(async () => { const r = await window.__verovio(${JSON.stringify(payload.multi_staff_content)}, 700); const tm = r.timeMap; return { entries: tm.length, lastMs: tm.length ? tm[tm.length - 1].ms : 0, firstMs: tm.length ? tm[0].ms : 0, msList: [...new Set(tm.map((e) => Math.round(e.ms)))].slice(0, 80) }; })()`);
  await p.shot(path.join(SHOTS, 'phrase-8bars-minus20.png'), { x: 0, y: 0, width: 800, height: 520 });
  // ---- M6: navigation through the phrase, on the real DOM with real pointer events -----------------------------------------------------------------------------------------------------------
  const rect = (sel: string) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const texts = () => p.ev(`[...document.querySelectorAll('.forge-inspector-lineage > li > span')].map((s) => s.textContent)`);
  const hot = () => p.ev(`[...document.querySelectorAll('g.measure.forge-artifact-hot')].map((g) => g.id)`);
  out.m6 = {};
  out.m6.measureIds = await p.ev(`[...document.querySelectorAll('.forge-rhythm-score-host svg g.measure')].map((g) => g.id)`);
  const note5 = await rect('#ph_bar_5 .notehead');
  await p.click(note5.x, note5.y); await sleep(300);
  out.m6.stackBar5 = await texts();
  out.m6.pinned = await p.ev(`document.querySelector('#ph_bar_5')?.classList.contains('forge-artifact-pinned')`);
  await p.shot(path.join(SHOTS, 'phrase-bar5-stack.png'), { x: 0, y: 0, width: 800, height: 700 });
  out.m6.linkLabels = await p.ev(`[...document.querySelectorAll('.forge-inspector-lineage button.forge-inspector-open')].map((b) => b.getAttribute('aria-label'))`);
  const link1 = await rect('.forge-inspector-lineage li:nth-child(2) button'); await p.click(link1.x, link1.y); await sleep(150);
  const link2 = await rect('.forge-inspector-lineage li:nth-child(3) button'); await p.click(link2.x, link2.y); await sleep(150);
  out.m6.opened = await p.ev('window.__opened.slice()');
  const li3 = await rect('.forge-inspector-lineage li:nth-child(3)'); await p.hover(li3.x, li3.y); await sleep(200);
  out.m6.hotOnSourceEntry = (await hot()).length;
  await p.shot(path.join(SHOTS, 'phrase-fan-source.png'), { x: 0, y: 0, width: 800, height: 700 });
  const li1 = await rect('.forge-inspector-lineage li:nth-child(1)'); await p.hover(li1.x, li1.y); await sleep(200);
  out.m6.hotOnBarEntry = await hot();
  await p.hover(5, 690); await sleep(150);
  out.m6.hotAfterLeave = (await hot()).length;
  const br = await rect('.forge-phrase-bracket'); await p.hover(br.x, br.y); await sleep(200);
  out.m6.hotOnBracket = (await hot()).length;
  out.m6.bracketText = await p.ev(`document.querySelector('.forge-phrase-bracket').textContent`);
  await p.click(br.x, br.y); await sleep(150);
  const src = await rect('.forge-phrase-source'); await p.click(src.x, src.y); await sleep(150);
  out.m6.openedAfterBracketAndSource = await p.ev('window.__opened.slice()');
  // hover a bar with nothing pinned shows its stack as a preview
  await p.ev(`document.querySelector('#ph_bar_5').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))`);
  await p.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  const note2 = await rect('#ph_bar_2 .notehead'); await p.hover(note2.x, note2.y); await sleep(200);
  out.m6.previewBar2 = await texts();
  out.m6.previewIsMarked = await p.ev(`!!document.querySelector('.forge-inspector-lineage.forge-inspector-preview')`);
  // A control edit in the real DOM: bars 4, pct 0 -> the Score follows; and the written JSON.
  out.edit = await p.ev(`(async () => { const b = document.querySelector('.forge-phrase-bars'); b.value = '4'; b.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 2500)); return { json: window.__files.get('phrases/phrase_001.md').match(/\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`/)[1], measureGroups: document.querySelector('.forge-rhythm-score-host svg')?.querySelectorAll('g.measure').length, tempoTexts: [...document.querySelector('.forge-rhythm-score-host svg').querySelectorAll('g.tempo')].map((g) => g.textContent.replace(/\\s+/g, ' ').trim()) }; })()`);
  // The source bar edited under the phrase: tempo 100 -> 120.
  out.sourceEdit = await p.ev(`(async () => { window.__edit('bars/bar_005.md', ${JSON.stringify(BAR.replace('"tempo_bpm": 100', '"tempo_bpm": 120'))}); await new Promise((r) => setTimeout(r, 2500)); return { tempoTexts: [...document.querySelector('.forge-rhythm-score-host svg').querySelectorAll('g.tempo')].map((g) => g.textContent.replace(/\\s+/g, ' ').trim()), hosts: document.querySelectorAll('.forge-rhythm-score-host').length }; })()`);
  await p.shot(path.join(SHOTS, 'phrase-after-edits.png'), { x: 0, y: 0, width: 800, height: 520 });
  out.errorsAfter = await p.ev('window.__errors.slice()');
} finally { p.close(); }
// ---- M6 rider: a host that has not been laid out. (1) Verovio asked for a 16 px host must not refuse pageWidth; (2) a phrase mounted into a HIDDEN pane waits, then engraves when the pane shows ---------
const p2 = await openPage({ dir: here, width: 800, height: 600, pageHtml: page, routes });
try {
  await p2.ev(`(async () => { const r = await window.__verovio(${JSON.stringify((computePhrase(py, bar.value.data, { bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 }, 'p') as any).multi_staff_content)}, 16); window.__tiny = r.svg.length; })()`);
  out.rider = { tinyHostSvgLength: await p2.ev('window.__tiny'), tinyHostErrors: await p2.ev('window.__errors.slice()') };
  await p2.ev(`document.getElementById('pane').style.display = 'none'; window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(phraseText({ bars: 2, tempo_change_pct: 0 }))}, bar: ${JSON.stringify(BAR)} })`);
  await sleep(700);
  out.rider.svgWhileHidden = await p2.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`);
  out.rider.errorsWhileHidden = await p2.ev('window.__errors.slice()');
  await p2.ev(`document.getElementById('pane').style.display = ''`);
  for (let w = 0; w < 6000; w += 100) { if (await p2.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
  out.rider.svgAfterShown = await p2.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`);
  out.rider.errorsAfterShown = await p2.ev('window.__errors.slice()');
} finally { p2.close(); }
// ---- drain 2026-10-22-2300: does a lit bar LOOK different? Rendered pixels, not class names. Measured twice: with the plugin's stylesheet and WITHOUT it (the band must not depend on it) -------------
async function renderedStudy(withStyles: boolean) {
  const html = withStyles ? page : page.replace('<link rel=stylesheet href="plugin-styles.css">', '');
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: html, routes });
  const res: any = { withStyles };
  try {
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(phraseText({}))}, bar: ${JSON.stringify(BAR)} })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(1200);
    // a clip of the VISIBLE part of a bar, from the page's own layout
    const clipOf = (id: string) => q.ev(`(() => { const e = document.querySelector('#${id}'); const box = document.querySelector('.forge-output-score') || document.body; const r = e.getBoundingClientRect(); const v = box.getBoundingClientRect(); const x0 = Math.max(r.left, v.left), x1 = Math.min(r.right, v.right), y0 = Math.max(r.top, v.top), y1 = Math.min(r.bottom, v.bottom); return x1 - x0 > 8 && y1 - y0 > 8 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null; })()`);
    const hashOf = async (id: string) => { const c = await clipOf(id); if (!c) return null; const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } }); return crypto.createHash('md5').update(r.result.data).digest('hex'); };
    const state = async () => ({ b1: await hashOf('ph_bar_1'), b2: await hashOf('ph_bar_2'), b3: await hashOf('ph_bar_3') });
    await q.hover(5, 790); await sleep(150);
    const base = await state();
    const nh = await q.ev(`(() => { const e = document.querySelector('#ph_bar_3 .notehead'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await q.hover(nh.x, nh.y); await sleep(250);
    const hot = await state();
    res.hotClasses = await q.ev(`document.querySelector('#ph_bar_3').getAttribute('class')`);
    await q.click(nh.x, nh.y); await sleep(250);
    await q.hover(5, 790); await sleep(250);                    // the pointer leaves: what remains is the PIN
    const pinned = await state();
    res.pinnedClasses = await q.ev(`document.querySelector('#ph_bar_3').getAttribute('class')`);
    res.computed = await q.ev(`(() => { const g = document.querySelector('#ph_bar_3'); const nh = g.querySelector('.notehead use, .notehead'); const line = g.querySelector('.staff path'); const band = g.querySelector('.forge-artifact-band'); const o = document.querySelector('#ph_bar_1'); const cs = (e) => e ? getComputedStyle(e) : null; return { noteheadFill: cs(nh)?.fill, staffStroke: cs(line)?.stroke, accentVar: getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim(), band: band ? { fill: cs(band).fill, fillOpacity: cs(band).fillOpacity, w: band.getBoundingClientRect().width, h: band.getBoundingClientRect().height } : null, neighbourOpacity: o ? getComputedStyle(o).opacity : null, firstChildIsBand: g.firstElementChild === band }; })()`);
    res.base = base; res.hot = hot; res.pinned = pinned;
    await p_shot(q, `rendered-${withStyles ? 'with' : 'without'}-styles-pinned.png`);
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(250);
    res.afterEsc = await state();
    const br = await q.ev(`(() => { const r = document.querySelector('.forge-phrase-bracket').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await q.hover(br.x, br.y); await sleep(250);
    res.fan = await state();
    res.bandsInFan = await q.ev(`document.querySelectorAll('.forge-artifact-band').length`);
    await p_shot(q, `rendered-${withStyles ? 'with' : 'without'}-styles-fan.png`);
  } finally { q.close(); }
  return res;
}
async function p_shot(q: any, name: string) { await q.shot(path.join(SHOTS, name), { x: 0, y: 0, width: 800, height: 700 }); }
out.rendered = { with: await renderedStudy(true), without: await renderedStudy(false) };

// ---- drain 2026-10-22-2330 (M7 Phase A): the MIX tab in real Chrome — the strip, the engrave latency of the Weight slider (single jump and a 20-step scrub of 40 ms steps, an 0.8 s drag), coalescing, and rendered PIXELS (a hash of the Score region at
// each weight; never class names). Real engine behind /phrase, real Verovio, real DevTools-protocol pointer events for the slider.
const BAR6 = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_006.md', import.meta.url), 'utf8');
const mixText = (m: object = {}) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false, ...m }, null, 2)}\n\`\`\`\n`;
async function mixStudy() {
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  const res: any = {};
  try {
    const t0 = performance.now();
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(mixText())}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)} }, path: 'phrases/phrase_002.md', name: 'phrase_002' })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    res.firstScoreMs = Math.round(performance.now() - t0);
    await sleep(1200);
    res.errors = await q.ev('window.__errors.slice()');
    res.dom = await q.ev(`(() => { const g = (s) => document.querySelector(s); const o = (s) => [...g(s).querySelectorAll('option')].map((x) => x.value); return {
      a: g('.forge-mix-a')?.value, b: g('.forge-mix-b')?.value, aOptions: o('.forge-mix-a'), bOptions: o('.forge-mix-b'),
      weight: g('.forge-mix-weight')?.value, weightShown: g('.forge-mix-weight-value')?.textContent, weightType: g('.forge-mix-weight')?.type, weightStep: g('.forge-mix-weight')?.step,
      threshold: g('.forge-mix-threshold')?.value, ghost: g('.forge-mix-ghost')?.checked, sentence: g('.forge-mix-sentence')?.textContent,
      inspector: !!g('.forge-inspector'), bracket: !!g('.forge-phrase-bracket'), sourceLink: !!g('.forge-phrase-source'), extendBars: !!g('.forge-phrase-bars'),
      measureGroups: document.querySelector('.forge-rhythm-score-host svg')?.querySelectorAll('g.measure').length }; })()`);
    await q.shot(path.join(SHOTS, 'mix-initial.png'), { x: 0, y: 0, width: 800, height: 520 });
    // a swap = the OLD engraving host leaves the panel (the new one was revealed in the same tick): the moment the person SEES the new Score
    await q.ev(`(() => { window.__swaps = []; const panel = document.querySelector('.forge-rhythm-edit-score'); new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.classList && n.classList.contains('forge-rhythm-score-host')) window.__swaps.push(performance.now()); }).observe(panel, { childList: true }); })()`);
    const setControl = (sel: string, value: string | boolean, type = 'input') => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); ${typeof value === 'boolean' ? 'e.checked = ' + value : 'e.value = ' + JSON.stringify(value)}; window.__tInput = performance.now(); e.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true })); return window.__tInput; })()`);
    const settle = async () => { let n = -1, still = 0; for (let w = 0; w < 15000 && still < 5; w += 100) { await sleep(100); const m = await q.ev('(window.__timings || []).length + ":" + (window.__swaps || []).length'); if (m === n) still++; else { still = 0; n = m as any; } } };
    const hashScore = async () => {
      const c = await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 300) }; })()`);
      const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } });
      return crypto.createHash('md5').update(r.result.data).digest('hex');
    };
    const written = () => q.ev(`window.__files.get('phrases/phrase_002.md').match(/\`\`\`json\\n([\\s\\S]*?)\\n\`\`\`/)[1]`).then((t: any) => JSON.parse(t));
    // (1) the rendered Score at weight 1, 0.5 (the tie), 0.45, 0 — by pixels
    res.hash = {};
    for (const w of [1, 0.5, 0.45, 0]) { await setControl('.forge-mix-weight', String(w)); await settle(); res.hash['w' + w] = await hashScore(); await q.shot(path.join(SHOTS, `mix-weight-${w}.png`), { x: 0, y: 0, width: 800, height: 520 }); }
    res.sentenceAt0 = await q.ev(`document.querySelector('.forge-mix-sentence').textContent`);
    await setControl('.forge-mix-weight', '0.4'); await settle(); res.hash.w04 = await hashScore();
    await setControl('.forge-mix-ghost', true, 'change'); await settle(); res.hash.w04ghost = await hashScore();
    await q.shot(path.join(SHOTS, 'mix-ghost-0.4.png'), { x: 0, y: 0, width: 800, height: 520 });
    res.sentenceGhost = await q.ev(`document.querySelector('.forge-mix-sentence').textContent`);
    await setControl('.forge-mix-ghost', false, 'change'); await settle(); res.hash.w04ghostOff = await hashScore();
    // (2) latency of ONE jump of the slider (1.0 -> 0.4): input event -> the new Score is on screen
    await setControl('.forge-mix-weight', '1'); await settle();
    res.single = [];
    for (const target of ['0.4', '0.9', '0.4', '0.9', '0.4']) {
      await q.ev('window.__timings = []; window.__swaps = []');
      const tIn = await setControl('.forge-mix-weight', target);
      await settle();
      const tm = await q.ev('window.__timings.slice()'); const sw = await q.ev('window.__swaps.slice()');
      res.single.push({ to: target, renders: tm.length, engineMs: tm.map((t: any) => Math.round(t.engineMs)), totalMs: tm.map((t: any) => Math.round(t.totalMs)), inputToSwapMs: sw.length ? Math.round(sw[sw.length - 1] - (tIn as number)) : null });
    }
    // (3) a scrub: 20 input events 40 ms apart (a drag of 0.8 s from 1.00 to 0.05) — how many Scores were engraved, and is the LAST one the last value
    await setControl('.forge-mix-weight', '1'); await settle();
    await q.ev('window.__timings = []; window.__swaps = []');
    const scrub = await q.ev(`(async () => { const e = document.querySelector('.forge-mix-weight'); let t = 0; for (let i = 0; i <= 19; i++) { e.value = String(Math.round((1 - i * 0.05) * 100) / 100); t = performance.now(); e.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 40)); } return { tLast: t, shownNumber: document.querySelector('.forge-mix-weight-value').textContent }; })()`);
    await settle();
    const tmS = await q.ev('window.__timings.slice()'); const swS = await q.ev('window.__swaps.slice()');
    res.scrub = { inputs: 20, rendersEngraved: tmS.length, swaps: swS.length, engineMs: tmS.map((t: any) => Math.round(t.engineMs)), lastInputToLastSwapMs: swS.length ? Math.round(swS[swS.length - 1] - scrub.tLast) : null, numberShownAtEnd: scrub.shownNumber, writtenWeight: (await written()).weight, hashAfter: await hashScore() };
    // (4) a REAL pointer on the slider (DevTools-protocol mouse events): press on the track's left end, then drag to the right end — the value and the Score follow
    const sl = await q.ev(`(() => { const e = document.querySelector('.forge-mix-weight'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x0: r.left + 1, x1: r.right - 1, y: r.top + r.height / 2 }; })()`);
    await q.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sl.x0, y: sl.y });
    await q.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sl.x0, y: sl.y, button: 'left', clickCount: 1 });
    await q.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sl.x0, y: sl.y, button: 'left', clickCount: 1 });
    await settle();
    res.pointerLeft = { value: await q.ev(`document.querySelector('.forge-mix-weight').value`), written: (await written()).weight, hash: await hashScore() };
    await q.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sl.x1, y: sl.y });
    await q.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sl.x1, y: sl.y, button: 'left', clickCount: 1 });
    await q.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sl.x1, y: sl.y, button: 'left', clickCount: 1 });
    await settle();
    res.pointerRight = { value: await q.ev(`document.querySelector('.forge-mix-weight').value`), written: (await written()).weight, hash: await hashScore() };
    await q.shot(path.join(SHOTS, 'mix-after-pointer.png'), { x: 0, y: 0, width: 800, height: 520 });
    // (5) hand-edited JSON through the very same path: weight 0.8 -> slider + Score; weight 3 -> a refusal line naming weight
    await q.ev(`window.__edit('phrases/phrase_002.md', ${JSON.stringify(mixText({ weight: 0.8 }))})`); await settle();
    res.edit08 = await q.ev(`({ slider: document.querySelector('.forge-mix-weight').value, shown: document.querySelector('.forge-mix-weight-value').textContent })`);
    await q.ev(`window.__edit('phrases/phrase_002.md', ${JSON.stringify(mixText({ weight: 3 }))})`); await settle();
    res.edit3 = await q.ev(`({ status: document.querySelector('.forge-rhythm-edit-score-status').textContent, disabled: document.querySelector('.forge-mix-weight').disabled })`);
    res.errorsAfter = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
  return res;
}
out.mix = await mixStudy();

// ---- drain 2026-10-23-0030: a click on an engraved note must not start the whole score in a score-first vault. REAL pointer events on a real notehead in real Chrome; a spy on the Score's <midi-player>.start();
// the pin (the inspector's bar selection) must still happen; the control (a vault that is not score-first) must still play. The player's own Play button needs audio and is the driver's D3.
async function clickStudy(kind: 'extend' | 'mix') {
  const q = await openPage({ dir: here, width: 800, height: 800, pageHtml: page, routes });
  const res: any = { kind };
  try {
    const mixOpts = kind === 'mix' ? `, bars: { bar_006: ${JSON.stringify(BAR6)} }, path: 'phrases/phrase_002.md', name: 'phrase_002'` : '';
    const text = kind === 'mix' ? mixText() : phraseText({});
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR)}${mixOpts} })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(1500);                                              // the MIDI player builds its note sequence
    res.spy = await q.ev('window.__spyPlayer()');
    const noteXY = () => q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host g.note .notehead') || document.querySelector('.forge-rhythm-score-host .notehead'); e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const state = () => q.ev(`(() => { const p = document.querySelector('midi-player'); return { starts: p.__starts, currentTime: p.currentTime, pinned: document.querySelectorAll('g.measure.forge-artifact-pinned').length, stack: [...document.querySelectorAll('.forge-inspector-lineage > li > span')].map((s) => s.textContent)[0] ?? null }; })()`);
    res.before = await state();
    // score-first ON (what score-first.ts publishes in the plugin): the click must not play
    await q.ev('window.__setScoreFirst(true)');
    let xy = await noteXY();
    await q.click(xy.x, xy.y); await sleep(800);
    res.scoreFirstClick = await state();
    // a second click on the same note: still nothing
    xy = await noteXY(); await q.click(xy.x, xy.y); await sleep(800);
    res.scoreFirstClickAgain = await state();
    // CONTROL: the flag OFF (any other vault): the same click plays
    await q.ev('window.__setScoreFirst(false)');
    xy = await noteXY(); await q.click(xy.x, xy.y); await sleep(1200);
    res.controlClick = await state();
    res.errors = await q.ev('window.__errors.slice()');
  } finally { q.close(); }
  return res;
}
out.click = { extend: await clickStudy('extend'), mix: await clickStudy('mix') };

// ---- drain 2026-10-23-0230 (M8): navigation through a mix, in real Chrome with real pointer events. The pixel claim is made FAIRLY: bar_007 is bar_006 plus ONE extra kick, so the same engraved hit
// (kick, step 3) is "bar_005 only" against bar_006 and "both bars" against bar_007, with an IDENTICAL layout; pinned, the two must render differently; unpinned, identically (a stability control).
const BAR7 = (() => { const m = BAR6.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/)!; const d = JSON.parse(m[1]); d.channels.kick[2] = true; return BAR6.replace(m[1], JSON.stringify(d, null, 2)); })();
/** How many pixels of two same-size PNG clips differ by at least `min` in some channel (macOS `sips` converts them to BMP). Re-rendering and re-styling leave a noise floor of a few anti-aliased pixels with a
 *  channel difference of at most ~31 (measured); a colour cue differs by far more (blue vs purple: 194), so counting STRONG differences separates the two exactly. -1 = the clips differ in size. */
function strongDiff(fileA: string, fileB: string, min = 100): number {
  const bmp = (f: string) => { const out = f.replace(/\.png$/, '.bmp'); execFileSync('sips', ['-s', 'format', 'bmp', f, '--out', out], { stdio: 'ignore' }); const b = fs.readFileSync(out); return { b, off: b.readUInt32LE(10), w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)), bpp: b.readUInt16LE(28) }; };
  const A = bmp(fileA), B = bmp(fileB);
  if (A.w !== B.w || A.h !== B.h) return -1;
  const row = Math.floor((A.bpp * A.w + 31) / 32) * 4;
  let n = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const o = A.off + y * row + x * (A.bpp / 8); let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.b[o + k] - B.b[o + k])); if (d >= min) n++; }
  return n;
}
async function mixNavStudy() {
  const q = await openPage({ dir: here, width: 800, height: 900, pageHtml: page, routes });
  const res: any = {};
  try {
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(mixText({ weight: 0.7 }))}, bar: ${JSON.stringify(BAR)}, bars: { bar_006: ${JSON.stringify(BAR6)}, bar_007: ${JSON.stringify(BAR7)} }, path: 'phrases/phrase_002.md', name: 'phrase_002' })`);
    for (let w = 0; w < 20000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(1500);
    const settle = async () => { let n = -1, still = 0; for (let w = 0; w < 15000 && still < 4; w += 100) { await sleep(100); const m = await q.ev('(window.__timings || []).length'); if (m === n) still++; else { still = 0; n = m as any; } } };
    // blur first: clicking focuses the Score host (tabindex 0) and the focus ring ALONE changes the pixels — the first version of this check passed with the painter switched off for exactly that reason
    const hash = async (name?: string) => { await q.ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`); await sleep(100); const c = await q.ev(`(() => { document.getElementById('pane').scrollTop = 0; const notes = [...document.querySelectorAll('.forge-rhythm-score-host g.note[id^=mx_] .notehead')].map((g) => g.getBoundingClientRect()); const x0 = Math.floor(Math.min(...notes.map((r) => r.left))) - 30, y0 = Math.floor(Math.min(...notes.map((r) => r.top))) - 30, x1 = Math.ceil(Math.max(...notes.map((r) => r.right))) + 30, y1 = Math.ceil(Math.max(...notes.map((r) => r.bottom))) + 30; return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; })()`); const r = await q.send('Page.captureScreenshot', { format: 'png', clip: { ...c, scale: 1 } }); if (name) fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64')); return crypto.createHash('md5').update(r.result.data).digest('hex'); };   // the region of the NOTEHEADS (their boxes + 30 px, a size that does not depend on the marks the cue adds): what the colour cue changes. Not the whole host (the MIDI player beside it is a live widget) and not the whole SVG (two separate Verovio renders differ by a few anti-aliased pixels elsewhere in the staff: measured, 89 pixels, max channel difference 31)
    const xy = (sel: string) => q.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const stack = () => q.ev(`[...document.querySelectorAll('.forge-inspector-lineage > li > span')].map((s) => s.textContent)`);
    const pinned = () => q.ev(`[...document.querySelectorAll('.forge-rhythm-score-host g.forge-artifact-pinned')].map((g) => g.id)`);
    const away = async () => { await q.hover(5, 880); await sleep(150); };
    res.dom = await q.ev(`({ inspector: !!document.querySelector('.forge-inspector'), body: document.querySelector('.forge-inspector-body')?.textContent, bracket: !!document.querySelector('.forge-phrase-bracket'), source: !!document.querySelector('.forge-phrase-source'), measureId: !!document.querySelector('#ph_bar_1'), hitIds: [...document.querySelectorAll('.forge-rhythm-score-host g.note[id^=mx_]')].map((g) => g.id) })`);
    const mark = (m: string) => console.log('[m8]', new Date().toISOString().slice(11, 19), m);
    mark('mounted'); await q.ev(`window.__edit('phrases/phrase_002.md', ${JSON.stringify(mixText({ weight: 0.7 }))})`); await settle(); await sleep(400);   // one identical re-render: the very first render after mount differs from every later one by a few anti-aliased pixels (measured: 89 px, max channel difference 31), so every comparison below is between re-renders
    await away(); res.u1 = await hash('m8-u1-clip.png'); mark('u1 hashed');
    // (1) a real click on the a-only notehead (kick, step 3): the hit's line over the bar's stack
    let p = await xy('#mx_kick_2 .notehead'); await q.click(p.x, p.y); await sleep(500); mark('clicked'); await settle(); mark('settled after click');
    res.hitStack = await stack(); res.hitPinned = await pinned();
    res.legend = await q.ev(`[...document.querySelectorAll('.forge-inspector-legend-mark')].map((m) => ({ mark: m.textContent, style: m.getAttribute('style') }))`);
    res.links = await q.ev(`[...document.querySelectorAll('.forge-inspector-lineage button.forge-inspector-open')].map((b) => b.getAttribute('aria-label'))`);
    res.marks = await q.ev(`document.querySelectorAll('.forge-mix-mark').length`);
    res.fills = await q.ev(`Object.fromEntries(['mx_kick_0', 'mx_kick_2', 'mx_snare_4'].map((id) => [id, getComputedStyle(document.querySelector('#' + id + ' .notehead')).fill]))`);
    await away(); res.p1 = await hash('m8-p1-clip.png'); mark('p1 hashed');
    await q.shot(path.join(SHOTS, 'm8-pinned-hit.png'), { x: 0, y: 0, width: 800, height: 700 });
    // (2) the same hit, now "both bars" (b = bar_007 has that kick too), SAME layout: a hand edit of the phrase; the pin must survive the redraw
    await q.ev(`window.__edit('phrases/phrase_002.md', ${JSON.stringify(mixText({ weight: 0.7, b: 'bar_007' }))})`); await settle(); await sleep(400);
    mark('edited b'); res.hitStackBoth = await stack(); res.pinnedAfterEdit = await pinned(); await away(); res.p2 = await hash('m8-p2-clip.png'); mark('p2 hashed');
    await q.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(300);
    res.afterEsc = { pinned: await pinned(), marks: await q.ev(`document.querySelectorAll('.forge-mix-mark').length`), stack: await stack() }; await away(); res.u2 = await hash('m8-u2-clip.png'); await q.shot(path.join(SHOTS, 'm8-u2.png'), { x: 0, y: 0, width: 800, height: 700 });
    // (3) back to bar_006; pin the BAR (a click on the staff, not a note); then the Weight slider with the pin on: it must stay pinned and the stack follow; latency from input to the stack saying so
    await q.ev(`window.__edit('phrases/phrase_002.md', ${JSON.stringify(mixText({ weight: 0.7 }))})`); await settle(); await sleep(300);
    p = await xy('#mx_kick_2 .notehead'); await q.click(p.x, p.y); await sleep(400);
    mark('esc + u2 done'); res.latency = [];
    for (const [value, pct] of [['0.6', 60], ['0.8', 80], ['0.6', 60], ['0.8', 80], ['0.6', 60]] as Array<[string, number]>) {
      const ms = await q.ev(`(async () => { const e = document.querySelector('.forge-mix-weight'); const t0 = performance.now(); e.value = '${value}'; e.dispatchEvent(new Event('input', { bubbles: true })); while (performance.now() - t0 < 5000) { const t = document.querySelector('.forge-inspector-lineage')?.textContent ?? ''; if (t.includes('${pct} % bar_005')) return performance.now() - t0; await new Promise((r) => setTimeout(r, 2)); } return -1; })()`);
      await settle(); res.latency.push({ weight: value, stackFollowedMs: Math.round(ms as number), pinned: await pinned(), first: (await stack())[0] });
    }
    // (4) below the threshold the pinned hit is gone: the pin falls back to the BAR, the Inspector is never empty
    await q.ev(`(() => { const e = document.querySelector('.forge-mix-weight'); e.value = '0.4'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await settle(); await sleep(300);
    res.belowThreshold = { pinned: await pinned(), stack: await stack() };
    // (5) arrows do nothing and do not throw; the Open note links open the phrase and each parent
    const before = await pinned();
    await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown']) e.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); })()`);
    res.arrows = { before, after: await pinned() };
    await q.ev('window.__opened = []');
    for (const i of [1, 2, 3]) { const b = await xy(`.forge-inspector-lineage li:nth-child(${i}) button.forge-inspector-open`); await q.click(b.x, b.y); await sleep(150); }
    res.opened = await q.ev('window.__opened.slice()');
    res.errors = await q.ev('window.__errors.slice()');
    const clip = (n: string) => path.join(SHOTS, `m8-${n}-clip.png`);
    res.strong = { noise_u1_u2: strongDiff(clip('u1'), clip('u2')), cue_u1_p1: strongDiff(clip('u1'), clip('p1')), cue_u2_p2: strongDiff(clip('u2'), clip('p2')), aOnly_vs_both_p1_p2: strongDiff(clip('p1'), clip('p2')) };
  } finally { q.close(); }
  return res;
}
out.m8 = await mixNavStudy();

// The verdicts (a measurement that cannot fail proves nothing): the player's tempo changes and Verovio's bar starts must sit at the engine's bar starts, within 5 ms; 8 bars; a mark per bar and part.
const near = (a: number, b: number) => Math.abs(a - b) <= 0.005;
const tempi: number[] = out.expected.tempi; const starts: number[] = out.expected.barStartsSec;
const playerStarts = [...new Set((out.player?.tempos ?? []).map((t: any) => +t.time.toFixed(3)))].filter((t: any) => t > 0) as number[];
const verovioMs = new Set<number>(out.verovio?.msList ?? []);
out.verdicts = {
  eightBars: out.dom?.measureGroups === 8,
  aMarkPerBarPerPart: JSON.stringify(out.dom?.tempoTexts?.map((t: string) => Number(t.replace(/\D+/g, '')))) === JSON.stringify(tempi.flatMap((t) => [t, t])),
  playerTempoChangesAtBarStarts: starts.slice(1).every((s) => playerStarts.some((t) => near(t, s))),
  playerQpmFollowsTheBars: tempi.every((t, i) => (out.player?.tempos ?? []).some((x: any) => near(x.time, starts[i]) && Math.abs(x.qpm - t) < 0.5)),
  verovioBarStartsMatch: starts.slice(1).every((s) => [...verovioMs].some((ms) => Math.abs(ms / 1000 - s) <= 0.005)),
  controlEditWroteTheJson: /"bars": 4/.test(out.edit?.json ?? '') && out.edit?.measureGroups === 4,
  sourceEditRedrew: out.sourceEdit?.tempoTexts?.[0]?.endsWith('= 120') && out.sourceEdit?.hosts === 1,
  band_aHoveredBarLooksDifferent: ['with', 'without'].every((k) => out.rendered?.[k]?.hot?.b3 && out.rendered[k].hot.b3 !== out.rendered[k].base.b3),
  band_aPinnedBarLooksDifferentFromUnlitAndFromHovered: ['with', 'without'].every((k) => { const r = out.rendered?.[k]; return r?.pinned?.b3 && r.pinned.b3 !== r.base.b3 && r.pinned.b3 !== r.hot.b3; }),
  band_theOtherBarsAreDimmedWhileOneIsPinned: ['with', 'without'].every((k) => { const r = out.rendered?.[k]; return r?.pinned?.b2 && r.pinned.b2 !== r.base.b2 && r.computed?.neighbourOpacity === '0.45'; }),
  band_escClearsEverything: ['with', 'without'].every((k) => { const r = out.rendered?.[k]; return r?.afterEsc?.b3 === r?.base?.b3 && r?.afterEsc?.b2 === r?.base?.b2; }),
  band_theFanLightsEveryVisibleBar: ['with', 'without'].every((k) => { const r = out.rendered?.[k]; return r?.fan?.b1 && r.fan.b1 !== r.base.b1 && r.fan.b2 !== r.base.b2 && r.fan.b3 !== r.base.b3 && r.bandsInFan === 8; }),
  band_doesNotDependOnTheStylesheet: out.rendered?.without?.computed?.band?.fillOpacity === '0.32' && !/forge-artifact-pinned/.test('') && out.rendered?.without?.computed?.firstChildIsBand === true,
  noConsoleErrors: (out.errors?.length ?? 1) === 0 && (out.errorsAfter?.length ?? 1) === 0,
  m6_everyBarIsAMeasureWithAnId: JSON.stringify(out.m6?.measureIds) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `ph_bar_${n}`)),
  m6_clickingANoteheadSelectsItsBarAndShowsTheStack: out.m6?.pinned === true && JSON.stringify(out.m6?.stackBar5) === JSON.stringify(['bar 5 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 89']),
  m6_theLinksOpenThePhraseAndTheBar: JSON.stringify(out.m6?.opened) === JSON.stringify(['phrases/phrase_001', 'bars/bar_005']) && JSON.stringify(out.m6?.linkLabels) === JSON.stringify(['Open phrase_001', 'Open bar_005']),
  m6_theFanLightsAllBarsOrOne: out.m6?.hotOnSourceEntry === 8 && JSON.stringify(out.m6?.hotOnBarEntry) === JSON.stringify(['ph_bar_5']) && out.m6?.hotAfterLeave === 0,
  m6_theBracketLightsAllBarsAndOpensThePhraseAndTheSourceLinkOpensTheBar: out.m6?.hotOnBracket === 8 && out.m6?.bracketText === 'phrase_001 · 8 bars' && JSON.stringify(out.m6?.openedAfterBracketAndSource) === JSON.stringify(['phrases/phrase_001', 'bars/bar_005', 'phrases/phrase_001', 'bars/bar_005']),
  m6_hoveringABarWithNothingPinnedPreviewsItsStack: out.m6?.previewIsMarked === true && out.m6?.previewBar2?.[0] === 'bar 2 of 8',
  mix_theStripIsTheMixStripWithTwoBarListsAndTheValuesOfTheNote: out.mix?.dom?.a === 'bar_005' && out.mix.dom.b === 'bar_006' && JSON.stringify(out.mix.dom.aOptions) === JSON.stringify(['bar_005', 'bar_006']) && out.mix.dom.weight === '0.5' && out.mix.dom.weightShown === '0.50' && out.mix.dom.weightType === 'range' && out.mix.dom.weightStep === '0.05' && out.mix.dom.threshold === '0.5' && out.mix.dom.ghost === false && /^Mix of bar_005 and bar_006: 50 % bar_005;/.test(out.mix.dom.sentence ?? ''),
  mix_oneBarEngraved: out.mix?.dom?.measureGroups === 1,
  mix_hasTheInspectorButNoBracketNoSourceLinkNoExtendStrip: out.mix?.dom?.inspector === true && out.mix.dom.bracket === false && out.mix.dom.sourceLink === false && out.mix.dom.extendBars === false,   // M8 reversed the M7 "no inspector"
  mix_rendered_weight1AndWeight0LookDifferent: !!out.mix?.hash?.w1 && out.mix.hash.w1 !== out.mix.hash.w0,
  mix_rendered_atTheTieTheUnionOfTheseTwoBarsLooksLikeBar005: out.mix?.hash?.['w0.5'] === out.mix?.hash?.w1,
  mix_rendered_justUnderTheThresholdLooksLikeBar006: !!out.mix?.hash?.w0 && out.mix.hash['w0.45'] === out.mix.hash.w0,
  mix_rendered_ghostNotesChangeTheScoreAndUntickingGivesItBack: !!out.mix?.hash?.w04 && out.mix.hash.w04ghost !== out.mix.hash.w04 && out.mix.hash.w04ghostOff === out.mix.hash.w04,
  mix_theSentenceFollowsTheControls: /^Mix of bar_005 and bar_006: 0 % bar_005;/.test(out.mix?.sentenceAt0 ?? '') && /Ghost notes/.test(out.mix?.sentenceGhost ?? ''),
  mix_theScoreFollowsTheDragWhileItIsGoingNotOnlyAtTheEnd: (out.mix?.scrub?.rendersEngraved ?? 0) >= 2 && (out.mix?.scrub?.swaps ?? 0) >= 2,
  mix_scrubIsCoalescedAndEndsOnTheLastValue: (out.mix?.scrub?.rendersEngraved ?? 99) < 20 && out.mix?.scrub?.numberShownAtEnd === '0.05' && out.mix?.scrub?.writtenWeight === 0.05 && out.mix?.scrub?.hashAfter === out.mix?.hash?.w0,
  mix_aRealPointerOnTheSliderMovesTheValueTheNoteAndTheScore: out.mix?.pointerLeft?.value === '0' && out.mix.pointerLeft.written === 0 && out.mix.pointerLeft.hash === out.mix.hash.w0 && out.mix?.pointerRight?.value === '1' && out.mix.pointerRight.written === 1 && out.mix.pointerRight.hash === out.mix.hash.w1,
  mix_aHandEditedWeightMovesTheSliderAndAWeightOf3IsARefusalNamingWeight: out.mix?.edit08?.slider === '0.8' && out.mix.edit08.shown === '0.80' && /weight/.test(out.mix?.edit3?.status ?? '') && out.mix?.edit3?.disabled === true,
  mix_noConsoleErrors: (out.mix?.errors?.length ?? 1) === 0 && (out.mix?.errorsAfter?.length ?? 1) === 0,
  click_scoreFirstClickOnAPhraseNoteStartsNothingAndMovesNothing: ['extend', 'mix'].every((k) => { const c = out.click?.[k]; return c?.spy === true && c.scoreFirstClick?.starts === 0 && c.scoreFirstClickAgain?.starts === 0 && c.scoreFirstClick.currentTime === c.before.currentTime && c.scoreFirstClickAgain.currentTime === c.before.currentTime; }),
  click_theBarStillPinsWhenAnExtendNoteIsClickedInScoreFirst: out.click?.extend?.scoreFirstClick?.pinned === 1 && /^bar \d+ of 8$/.test(out.click?.extend?.scoreFirstClick?.stack ?? ''),
  click_controlTheSameClickPlaysWhenNotScoreFirst: ['extend', 'mix'].every((k) => { const c = out.click?.[k]; return c?.controlClick?.starts === (c.scoreFirstClickAgain?.starts ?? -9) + 1; }),   // exactly one more start() (headless Chrome ignores a player.currentTime assignment, so the time is not asserted for the control)
  click_noConsoleErrors: ['extend', 'mix'].every((k) => (out.click?.[k]?.errors?.length ?? 1) === 0),
  m8_theMixScoreIsMapped: out.m8?.dom?.inspector === true && !/could not be mapped/.test(out.m8.dom.body ?? '') && out.m8.dom.measureId === true && out.m8.dom.hitIds?.length === 8 && out.m8.dom.bracket === false && out.m8.dom.source === false,
  m8_clickingTheANoteheadPinsThatHitAndShowsItsLineOverTheBarsStack: JSON.stringify(out.m8?.hitPinned) === JSON.stringify(['mx_kick_2']) && JSON.stringify(out.m8?.hitStack) === JSON.stringify(['this hit: from bar_005 only, velocity 90', 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)', 'from bar_005 (70 %)', 'from bar_006 (30 %)', '▲ only bar_005 · ■ only bar_006 · ● both bars']),
  m8_theThreeOpenNoteLinksAreThere: JSON.stringify(out.m8?.links) === JSON.stringify(['Open phrase_002', 'Open bar_005', 'Open bar_006']) && JSON.stringify(out.m8?.opened) === JSON.stringify(['phrases/phrase_002', 'bars/bar_005', 'bars/bar_006']),
  m8_theLegendCarriesInlineColours: out.m8?.legend?.length === 3 && out.m8.legend.every((l: any) => /color:\s*#[0-9a-f]{6}/i.test(l.style ?? '')),
  m8_pinnedNoteheadsArePaintedByParentInRealPixels: out.m8?.marks === 8 && out.m8?.fills?.mx_kick_2 === 'rgb(27, 110, 194)' && out.m8.fills.mx_kick_0 === 'rgb(106, 61, 154)' && out.m8.fills.mx_kick_2 !== out.m8.fills.mx_kick_0,
  m8_rendered_pinningPaintsTheNoteheads: (out.m8?.strong?.cue_u1_p1 ?? 0) >= 300 && (out.m8?.strong?.cue_u2_p2 ?? 0) >= 300,   // the stylesheet alone gives the ONE pinned note an accent (79 strong pixels with the painter off); painting every notehead of the bar is 629-643
  m8_rendered_anAOnlyHitAndABothHitLookDifferentWhilePinned: (out.m8?.strong?.aOnly_vs_both_p1_p2 ?? 0) >= 10,
  m8_rendered_stabilityControl_unpinnedRendersDifferOnlyByNoise: out.m8?.strong?.noise_u1_u2 === 0,   // no pixel differs by 100+ (the noise floor is 89 pixels at most 31)
  m8_theSamePinSurvivesTheRedrawAndTheLineNowSaysBoth: JSON.stringify(out.m8?.pinnedAfterEdit) === JSON.stringify(['mx_kick_2']) && out.m8?.hitStackBoth?.[0] === 'this hit: from both bars, velocity 90',
  m8_escLetsGoAndClearsTheColours: out.m8?.afterEsc?.pinned?.length === 0 && out.m8.afterEsc.marks === 0 && out.m8.afterEsc.stack?.length === 0,
  m8_movingTheWeightKeepsThePinAndTheStackFollows: (out.m8?.latency ?? []).length === 5 && out.m8.latency.every((l: any) => l.stackFollowedMs > 0 && JSON.stringify(l.pinned) === JSON.stringify(['mx_kick_2']) && /^this hit: from bar_005 only/.test(l.first ?? '')),
  m8_belowTheThresholdThePinFallsBackToTheBar: JSON.stringify(out.m8?.belowThreshold?.pinned) === JSON.stringify(['ph_bar_1']) && /^made by phrase_002 \(mix, 40 % bar_005/.test(out.m8?.belowThreshold?.stack?.[0] ?? ''),
  m8_arrowsDoNothing: JSON.stringify(out.m8?.arrows?.before) === JSON.stringify(out.m8?.arrows?.after),
  m8_noConsoleErrors: (out.m8?.errors?.length ?? 1) === 0,
  rider_aTinyHostNoLongerMakesVerovioRefusePageWidth: (out.rider?.tinyHostSvgLength ?? 0) > 0 && (out.rider?.tinyHostErrors?.length ?? 1) === 0,
  rider_aHiddenPaneWaitsThenEngravesWhenShown: out.rider?.svgWhileHidden === false && out.rider?.svgAfterShown === true && (out.rider?.errorsWhileHidden?.length ?? 1) === 0 && (out.rider?.errorsAfterShown?.length ?? 1) === 0,
};
fs.writeFileSync(path.join(here, 'phrase-measurements.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.verdicts, null, 1));
if (Object.values(out.verdicts).some((v) => v !== true)) { console.error('measure-phrase: a verdict failed; see phrase-measurements.json'); process.exit(1); }
