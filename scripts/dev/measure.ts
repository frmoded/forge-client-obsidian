// Real-code measurement of the Score under the Beat Box (drain 2026-10-21-1100), driven by scripts/dev/browser-proof.mjs. Run from the client repo root: node scripts/dev/measure.ts <rhythm_box.html> <outDir> [shotsDir]
// The REAL RhythmEditView (bundled by build.mjs with a tiny Obsidian shim) in a pane carrying OBSIDIAN'S OWN app.css and the plugin's styles.css, the real widget in its sandboxed iframe,
// real Verovio (music edition), and the REAL engine behind /compute (the bundled Pyodide engine, in Node). Real pointer clicks inside the widget iframe.
import fs from 'node:fs';
import path from 'node:path';
import { engine, compute } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const [WIDGET, here, SHOTS] = [process.argv[2], process.argv[3], process.argv[4]];   // here = the proof's output dir: bundles + app.css + plugin-styles.css live in it, and it is served
const OUT = path.join(here, 'measurements.json');
const widget = fs.readFileSync(WIDGET, 'utf8');
const PLAYGROUND_TOML = fs.readFileSync(new URL('../../test/fixtures/score-first/music-playground.forge.toml', import.meta.url), 'utf8');
const STARTER = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: {
  kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] } };
const NOTE = `---\ntype: data\ncontent_type: json\ndescription: "bar_001"\n---\n\n\`\`\`json\n${JSON.stringify(STARTER, null, 2)}\n\`\`\`\n`;

const t0 = performance.now();
const py = await engine();
const bootMs = performance.now() - t0;
const c0 = performance.now();
compute(py, STARTER, 'bar_001');                         // the first call imports music21
const firstComputeMs = performance.now() - c0;
const warm: number[] = [];
for (let i = 0; i < 12; i++) { const d = { ...STARTER, tempo_bpm: 90 + i }; const s = performance.now(); compute(py, d, 'bar_001'); warm.push(performance.now() - s); }
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

const routes = {
  'POST /compute': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, title } = JSON.parse(body);
    const s = performance.now();
    try { const payload = compute(py, data, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload, __ms: performance.now() - s })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e), __ms: performance.now() - s })); }
  },
};
const page = (bundle: string, width: number, height: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css">
<style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-rhythm-edit" style="width:${width}px;height:${height}px;display:flex;flex-direction:column;border:1px solid #ccc">
<div class="view-header" style="height:36px"></div><div class="view-content forge-rhythm-edit-view" id="pane" style="flex:1 1 0;min-height:0"></div></div>
<script>window.__timings=[];window.__errors=[];const _d=console.debug;console.debug=(...a)=>{window.__timings.push(a.join(' '))};const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,400));_e(...a)};window.addEventListener('error',e=>window.__errors.push('onerror '+e.message));window.addEventListener('unhandledrejection',e=>window.__errors.push('unhandled '+(e.reason&&e.reason.stack||e.reason)));</script>
<script src="${bundle}"></script></body></html>`;

const out: any = { engineBootMs: Math.round(bootMs), firstComputeMs: Math.round(firstComputeMs), warmComputeMs: { median: +med(warm).toFixed(1), min: +Math.min(...warm).toFixed(1), max: +Math.max(...warm).toFixed(1), n: warm.length } };

async function scenario(name: string, bundle: string, toml: string | null, width = 700, height = 800) {
  const p = await openPage({ dir: here, width: width + 40, height: height + 60, pageHtml: page(bundle, width, height), routes });
  const res: any = { name, bundle, toml: toml === null ? 'none' : 'score_first' };
  try {
    const tm = performance.now();
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(NOTE)}, widget: ${JSON.stringify(widget)}, toml: ${JSON.stringify(toml)} })`);
    // wait for the first score (or the lean line / nothing)
    let waited = 0; let firstScoreMs: number | null = null;
    while (waited < 15000) {
      const has = await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg, .forge-rhythm-score-host .forge-output-musicxml svg')`);
      if (has) { firstScoreMs = Math.round(performance.now() - tm); break; }
      await sleep(100); waited += 100;
      if (toml === null || bundle.includes('lean')) { if (waited >= 1500) break; }
    }
    res.firstScoreMs = firstScoreMs;
    await sleep(600);
    res.geometry = await p.ev(`(() => { const r = (e) => e ? e.getBoundingClientRect().toJSON() : null; const pane = document.getElementById('pane'); const f = pane.querySelector('iframe'); const s = pane.querySelector('.forge-rhythm-edit-score');
      return { pane: r(pane), paneScrollHeight: pane.scrollHeight, paneClientHeight: pane.clientHeight, iframe: r(f), iframeInlineHeight: f && f.style.height, iframeMinHeight: f && f.style.minHeight, score: r(s), scoreClass: s && s.className, scoreText: s && s.textContent.slice(0, 120), hosts: pane.querySelectorAll('.forge-rhythm-score-host').length, svgs: pane.querySelectorAll('svg').length }; })()`);
    res.timingsAfterOpen = await p.ev('window.__timings.slice()');
    res.errors = await p.ev('window.__errors.slice()');
    res.paneHtml = (await p.ev(`document.getElementById('pane').outerHTML`)).replace(/blob:http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]+/g, 'blob:X').replace(/srcdoc="[^"]*"/g, 'srcdoc=""');
    if (SHOTS && name) { fs.mkdirSync(SHOTS, { recursive: true }); await p.shot(path.join(SHOTS, `${name}-open.png`), { x: 0, y: 0, width: width + 40, height: height + 20 }); }
    if (toml !== null && !bundle.includes('lean')) {
      // A real edit: click a hihat? -> the starter has kick and snare; click kick step 2 (index 2). Time the click -> new score drawn.
      const cell = await p.findNode((_n: any, a: any) => a.class && /\bstep\b/.test(a.class) && a['data-channel'] === 'kick' && a['data-step'] === '2');
      if (!cell) throw new Error('no kick cell');
      const before = await p.ev(`document.querySelector('.forge-rhythm-score-host') && document.querySelector('.forge-rhythm-score-host').innerHTML.length`);
      const pt = await p.boxCenter(cell.nodeId);
      const marks = await p.ev('window.__timings.length');
      await p.ev(`window.__samples=[]; window.__sampler=setInterval(()=>{const s=document.querySelector('.forge-rhythm-edit-score'); window.__samples.push({t:Math.round(performance.now()), h: s? Math.round(s.getBoundingClientRect().height):0, svgs: document.querySelectorAll('.forge-rhythm-score-host svg').length, len: (document.querySelector('.forge-rhythm-score-host:not(.forge-rhythm-score-host-pending)')||{innerHTML:''}).innerHTML.length, hosts: document.querySelectorAll('.forge-rhythm-score-host').length});},8)`);
      const ts = performance.now();
      await p.click(pt.x, pt.y);
      let changedMs: number | null = null;
      for (let i = 0; i < 100; i++) {
        const n = await p.ev('window.__timings.length');
        if (n > marks) { changedMs = Math.round(performance.now() - ts); break; }
        await sleep(25);
      }
      res.editToScoreMs = changedMs;
      await sleep(400);
      await p.ev('clearInterval(window.__sampler)');
      const samples = await p.ev('window.__samples');
      const firstLen = samples[0].len; const changed = samples.find((x: any) => x.len !== firstLen && x.len > 0); const clickAt = samples.find((x: any) => true)!.t;
      res.editToVisibleScoreMs = changed ? changed.t - clickAt : null;
      res.flicker = { samples: samples.length, minPanelHeight: Math.min(...samples.map((x: any) => x.h)), maxPanelHeight: Math.max(...samples.map((x: any) => x.h)), minSvgs: Math.min(...samples.map((x: any) => x.svgs)), maxHosts: Math.max(...samples.map((x: any) => x.hosts)), distinctHeights: [...new Set(samples.map((x: any) => x.h))], blankFrames: samples.filter((x: any) => x.svgs === 0).length };
      res.timingsAfterEdit = (await p.ev('window.__timings.slice()')).slice(marks);
      res.scoreHostsAfterEdit = await p.ev(`document.querySelectorAll('.forge-rhythm-score-host').length`);
      res.noteChangedByScore = null;
      // Five rapid clicks: how many renders do they cost?
      const marks2 = await p.ev('window.__timings.length');
      for (const s of ['3', '5', '6', '7', '9']) {
        const c = await p.findNode((_n: any, a: any) => a.class && /\bstep\b/.test(a.class) && a['data-channel'] === 'kick' && a['data-step'] === s);
        const q = await p.boxCenter(c.nodeId); await p.click(q.x, q.y); await sleep(60);
      }
      await sleep(2500);
      res.rapidFiveClicksRenders = (await p.ev('window.__timings.length')) - marks2;
      res.engineRoundTrips = await p.ev('(window.__engineRoundTrips||[]).map(x=>Math.round(x.ms))');
      if (SHOTS) await p.shot(path.join(SHOTS, `${name}-edited.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
      res.noteAfterEdits = null;
    }
  } finally { p.close(); }
  return res;
}

out.scoreFirstMusic700 = await scenario('scorefirst-music-700', 'harness-music.js', PLAYGROUND_TOML, 700, 800);
out.scoreFirstMusic460 = await scenario('scorefirst-music-460', 'harness-music.js', PLAYGROUND_TOML, 460, 800);
out.normalMusic = await scenario('normal-music-700', 'harness-music.js', null, 700, 800);
if (fs.existsSync(path.join(here, 'harness-lean.js'))) out.scoreFirstLean = await scenario('scorefirst-lean-700', 'harness-lean.js', PLAYGROUND_TOML, 700, 800);
if (fs.existsSync(path.join(here, 'harness-before.js'))) out.normalBefore = await scenario('normal-before-700', 'harness-before.js', null, 700, 800);
if (out.normalBefore) out.normalIdenticalToBefore = out.normalBefore.paneHtml === out.normalMusic.paneHtml;
for (const k of Object.keys(out)) if (out[k]?.paneHtml) out[k].paneHtmlLength = out[k].paneHtml.length;
const dump = JSON.parse(JSON.stringify(out, (k, v) => (k === 'paneHtml' ? undefined : v)));
fs.writeFileSync(OUT, JSON.stringify(dump, null, 1)); console.log(JSON.stringify(dump, null, 1));
process.exit(0);
