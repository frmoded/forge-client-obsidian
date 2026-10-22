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

// ---- M3 (drain 2026-10-21-1230): the inspector + hover-link, with real pointer movement and real key events, in the real view ----
async function inspectorScenario(name: string, bundle: string, toml: string, width = 700, height = 800) {
  const p = await openPage({ dir: here, width: width + 40, height: height + 60, pageHtml: page(bundle, width, height), routes });
  const res: any = { name, steps: {} as any };
  const key = (k: string, code: number) => p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }).then(() => p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }));
  const hotIds = () => p.ev(`[...document.querySelectorAll('.forge-artifact-hot')].map(e=>e.id).sort()`);
  const pinnedIds = () => p.ev(`[...document.querySelectorAll('.forge-artifact-pinned')].map(e=>e.id).sort()`);
  const widgetHot = async () => { const n = await p.findNode((_n: any, a: any) => a.class && /\blink-hot\b/.test(a.class)); return n ? await p.attrs(n.nodeId).then((a: any) => `${a['data-channel']}:${a['data-step']}`) : null; };
  const inspectorText = () => p.ev(`(document.querySelector('.forge-inspector-body')||{}).textContent||''`);
  const rects = () => p.ev(`(() => { const r = (e) => e ? (({x,y,width,height}) => ({x,y,width,height}))(e.getBoundingClientRect()) : null; const pane = document.getElementById('pane'); return { iframe: r(pane.querySelector('iframe')), host: r(pane.querySelector('.forge-rhythm-score-host')), inspector: r(pane.querySelector('.forge-inspector')) }; })()`);
  const centerOf = (id: string) => p.ev(`(() => { const g = document.getElementById(${JSON.stringify(id)}); if (!g) return null; const e = g.querySelector('.notehead') || g; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  try {
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(NOTE)}, widget: ${JSON.stringify(widget)}, toml: ${JSON.stringify(toml)} })`);
    for (let w = 0; w < 15000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(500);
    res.engravedIds = await p.ev(`[...document.querySelectorAll('.forge-rhythm-score-host g.note[id]')].map(e=>e.id).sort()`);
    res.hint = await inspectorText();
    res.debugNotes = await p.ev(`['a_kick_0','a_snare_4','a_kick_8','a_snare_12'].map((id) => { const g = document.getElementById(id); const nh = g.querySelector('.notehead'); const rr = (e) => e ? (({x,y,width,height}) => ({x:Math.round(x),y:Math.round(y),w:Math.round(width),h:Math.round(height)}))(e.getBoundingClientRect()) : null; const b = (nh||g).getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2); return { id, g: rr(g), nh: rr(nh), hit: hit && (hit.tagName + '#' + hit.id + '.' + (hit.getAttribute('class')||'')), inG: !!(hit && g.contains(hit)) }; })`);
    res.debugHitboxes = await p.ev(`(() => { const rs = [...document.querySelectorAll('.forge-artifact-hitbox')]; const r = rs[0]; const b = r && r.getBoundingClientRect(); const cs = r && getComputedStyle(r); return { n: rs.length, first: r && r.outerHTML, box: b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], pe: cs && cs.pointerEvents, stroke: cs && cs.stroke, strokeWidth: cs && cs.strokeWidth, opacity: cs && cs.opacity, fillOpacity: cs && cs.fillOpacity, outline: cs && cs.outline, filter: cs && cs.filter, sheets: r && [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } }).filter((ru) => ru.selectorText && r.matches(ru.selectorText) && /stroke|fill|opacity/.test(ru.cssText)).map((ru) => ru.cssText.slice(0, 160)), fill: cs && cs.fill, display: cs && cs.display, parentBox: r && (b2 => [Math.round(b2.x), Math.round(b2.y), Math.round(b2.width), Math.round(b2.height)])(r.parentElement.getBoundingClientRect()) }; })()`);
    const r0 = await rects();
    // 1. engraved note -> grid step
    await p.hover(5, 5);                                 // the first pointer event of a headless page only 'enters' the window
    const sn = await centerOf('a_snare_4'); await p.hover(sn.x, sn.y);
    res.steps.hoverEngravedSnare4 = { hot: await hotIds(), widgetOutline: await widgetHot(), pointTarget: await p.ev(`(() => { let e = document.elementFromPoint(${sn.x}, ${sn.y}); const c = []; while (e && c.length < 5) { c.push((e.tagName||'') + '#' + (e.id||'') + '.' + (e.getAttribute && e.getAttribute('class')||'')); e = e.parentElement; } return c; })()`) };
    const r1 = await rects();
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}-hover-note.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
    // 1b. the enlarged target: 2 px to the right of the notehead's own box is still the note
    const pad = await p.ev(`(() => { const b = document.getElementById('a_kick_0').querySelector('.notehead').getBoundingClientRect(); return { x: b.x + b.width + 2, y: b.y + b.height / 2 }; })()`);
    await p.hover(2, 2); await p.hover(pad.x, pad.y);
    res.steps.hoverJustOutsideKick0Head = { hot: await hotIds(), widgetOutline: await widgetHot() };
    // 2. grid step -> engraved note
    await p.hover(2, 2); res.steps.pointerAway = { hot: await hotIds(), widgetOutline: await widgetHot() };
    const cell = await p.findNode((_n: any, a: any) => a.class && /\bstep\b/.test(a.class) && a['data-channel'] === 'kick' && a['data-step'] === '8');
    const cc = await p.boxCenter(cell.nodeId); await p.hover(cc.x, cc.y);
    res.steps.hoverGridKick8 = { hot: await hotIds() };
    const r2 = await rects();
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}-hover-grid.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
    await p.hover(2, 2);
    // 3. click -> pin + lineage, keys
    const s12 = await centerOf('a_snare_12'); await p.click(s12.x, s12.y); await sleep(150);
    res.steps.clickSnare12 = { pinned: await pinnedIds(), text: await inspectorText(), openNoteButton: await p.ev(`!!document.querySelector('.forge-inspector-open')`) };
    const r3 = await rects();
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}-pinned.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
    await key('ArrowRight', 39); await sleep(100);
    res.steps.arrowRight = { pinned: await pinnedIds(), text: await inspectorText() };
    await key('ArrowLeft', 37); await key('ArrowLeft', 37); await sleep(100);
    res.steps.arrowLeftTwice = { pinned: await pinnedIds() };
    await key('Escape', 27); await sleep(100);
    res.steps.escape = { pinned: await pinnedIds(), text: await inspectorText() };
    // 4. an edit replaces the engraving AND the map together
    await p.click(s12.x, s12.y); await sleep(100);
    const marks = await p.ev('window.__timings.length');
    const k2 = await p.findNode((_n: any, a: any) => a.class && /\bstep\b/.test(a.class) && a['data-channel'] === 'kick' && a['data-step'] === '2');
    const kc = await p.boxCenter(k2.nodeId); await p.click(kc.x, kc.y);
    for (let w = 0; w < 5000; w += 50) { if ((await p.ev(`!!document.getElementById('a_kick_2')`))) break; await sleep(50); }
    await sleep(300);
    res.steps.afterEditKick2 = { engravedIds: await p.ev(`[...document.querySelectorAll('.forge-rhythm-score-host g.note[id]')].map(e=>e.id).sort()`), pinned: await pinnedIds(), text: await inspectorText(), hosts: await p.ev(`document.querySelectorAll('.forge-rhythm-score-host').length`) };
    res.provenanceTimings = (await p.ev('window.__timings.slice()')).filter((t: string) => /provenance/.test(t));
    res.liveTimingsAfterEdit = (await p.ev('window.__timings.slice()')).slice(marks);
    const grid2 = await p.findNode((_n: any, a: any) => a.class && /\bstep\b/.test(a.class) && a['data-channel'] === 'kick' && a['data-step'] === '2');
    res.steps.afterEditGridCellOn = grid2 ? await p.attrs(grid2.nodeId).then((a: any) => /\bon\b/.test(a.class)) : null;
    // layout: hovering and pinning move nothing (iframe and score host do not change box)
    const same = (a: any, b: any) => JSON.stringify(a.iframe) === JSON.stringify(b.iframe) && JSON.stringify(a.host) === JSON.stringify(b.host);
    res.noLayoutShift = { hoverNote: same(r0, r1), hoverGrid: same(r0, r2), pinned: same(r0, r3), rects: { r0, r3 } };
    res.errors = await p.ev('window.__errors.slice()');
  } finally { p.close(); }
  return res;
}
out.inspectorMusic700 = await inspectorScenario('inspector-music-700', 'harness-music.js', PLAYGROUND_TOML, 700, 800);
out.inspectorMusic460 = await inspectorScenario('inspector-music-460', 'harness-music.js', PLAYGROUND_TOML, 460, 800);

// ---- the Kit view of bar_004 (drain 2026-10-21-1930): the engine's Kit fold is time-faithful, and the M3 inspector maps it ----
const BAR4 = JSON.parse(fs.readFileSync(new URL('../../test/fixtures/provenance/bars.json', import.meta.url), 'utf8')).bar_004;
const NOTE_BAR4 = `---\ntype: data\ncontent_type: json\ndescription: "bar_004"\n---\n\n\`\`\`json\n${JSON.stringify(BAR4, null, 2)}\n\`\`\`\n`;
async function kitScenario(name: string, width = 700, height = 800) {
  const p = await openPage({ dir: here, width: width + 40, height: height + 60, pageHtml: page('harness-music.js', width, height), routes });
  const res: any = { name, steps: {} as any };
  const ids = () => p.ev(`[...document.querySelectorAll('.forge-rhythm-score-host g.note[id]')].map(e=>e.id).sort()`);
  const hotIds = () => p.ev(`[...document.querySelectorAll('.forge-artifact-hot')].map(e=>e.id).sort()`);
  const pinnedIds = () => p.ev(`[...document.querySelectorAll('.forge-artifact-pinned')].map(e=>e.id).sort()`);
  const widgetHot = async () => { const n = await p.findNode((_n: any, a: any) => a.class && /\blink-hot\b/.test(a.class)); return n ? await p.attrs(n.nodeId).then((a: any) => `${a['data-channel']}:${a['data-step']}`) : null; };
  const centerOf = (id: string) => p.ev(`(() => { const g = document.getElementById(${JSON.stringify(id)}); if (!g) return null; const e = g.querySelector('.notehead') || g; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  try {
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(NOTE_BAR4)}, widget: ${JSON.stringify(widget)}, toml: ${JSON.stringify(PLAYGROUND_TOML)} })`);
    for (let w = 0; w < 15000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(500);
    res.multiStaffIds = await ids();
    const toggle = await p.findNode((_n: any, a: any) => a.class && /forge-kit-toggle/.test(a.class));
    const tc = await p.boxCenter(toggle.nodeId); await p.hover(5, 5); await p.click(tc.x, tc.y);
    for (let w = 0; w < 8000; w += 100) { const cur = await ids(); if (JSON.stringify(cur) !== JSON.stringify(res.multiStaffIds)) break; await sleep(100); }
    await sleep(600);
    res.kitIds = await ids();
    res.toggleLabelAfter = await p.ev(`document.querySelector('.forge-kit-toggle').textContent`);
    res.hitboxesInKit = await p.ev(`document.querySelectorAll('.forge-rhythm-score-host .forge-artifact-hitbox').length`);
    res.kitSvgHeight = await p.ev(`Math.round(document.querySelector('.forge-rhythm-score-host svg').getBoundingClientRect().height)`);
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}-kit.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
    // a Kit note: the snare+bell chord at step 8 (bell is the top head), hover then click
    const bell8 = await centerOf('a_bell_8');
    await p.hover(2, 2); await p.hover(bell8.x, bell8.y);
    res.steps.hoverKitBell8 = { hot: await hotIds(), widgetOutline: await widgetHot() };
    await p.click(bell8.x, bell8.y); await sleep(150);
    res.steps.clickKitBell8 = { pinned: await pinnedIds(), inspector: await p.ev(`(document.querySelector('.forge-inspector-body')||{}).textContent||''`) };
    const sn = await centerOf('a_snare_8');
    await p.hover(2, 2); await p.hover(sn.x, sn.y);
    res.steps.hoverKitSnare8 = { hot: await hotIds(), widgetOutline: await widgetHot() };
    if (SHOTS) await p.shot(path.join(SHOTS, `${name}-kit-pinned.png`), { x: 0, y: 0, width: width + 40, height: height + 20 });
    res.quietKitLine = await p.ev(`(document.querySelector('.forge-inspector-quiet')||{}).textContent||''`);
    res.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume/.test(e));
  } finally { p.close(); }
  return res;
}
out.kitBar4 = await kitScenario('kit-bar4-700', 700, 800);
if (process.env.ONLY_INSPECTOR) { fs.writeFileSync(OUT, JSON.stringify({ inspectorMusic700: out.inspectorMusic700, inspectorMusic460: out.inspectorMusic460, kitBar4: out.kitBar4 }, null, 1)); console.log('only-inspector'); process.exit(0); }
/** Just the opened tab's DOM (no edits): enough to show a vault without the profile key gets the same tab as before. */
async function p3Tab(bundle: string, toml: string | null) {
  const p = await openPage({ dir: here, width: 740, height: 860, pageHtml: page(bundle, 700, 800), routes });
  try {
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(NOTE)}, widget: ${JSON.stringify(widget)}, toml: ${JSON.stringify(toml)} })`);
    await sleep(1800);
    return { paneHtml: (await p.ev(`document.getElementById('pane').outerHTML`)).replace(/blob:http:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]+/g, 'blob:X').replace(/srcdoc="[^"]*"/g, 'srcdoc=""') as string };
  } finally { p.close(); }
}
// P3 per vault: each vault's REAL forge.toml (no profile key) gives a tab identical to the commit before this drain's.
const VAULT_TOMLS: Record<string, string | null> = {};
for (const v of ['music-theory', 'music-core', 'forge-tutorial', 'forge-moda']) { try { VAULT_TOMLS[v] = fs.readFileSync(new URL(`../../../${v}/forge.toml`, import.meta.url), 'utf8'); } catch { VAULT_TOMLS[v] = null; } }

out.normalMusic = await scenario('normal-music-700', 'harness-music.js', null, 700, 800);
if (fs.existsSync(path.join(here, 'harness-lean.js'))) out.scoreFirstLean = await scenario('scorefirst-lean-700', 'harness-lean.js', PLAYGROUND_TOML, 700, 800);
if (fs.existsSync(path.join(here, 'harness-before.js'))) out.normalBefore = await scenario('normal-before-700', 'harness-before.js', null, 700, 800);
if (out.normalBefore) out.normalIdenticalToBefore = out.normalBefore.paneHtml === out.normalMusic.paneHtml;
if (out.normalBefore) {
  out.p3PerVault = {};
  for (const [v, toml] of Object.entries(VAULT_TOMLS)) {
    const now = await p3Tab('harness-music.js', toml);
    const was = await p3Tab('harness-before.js', toml);
    out.p3PerVault[v] = { tomlRead: toml !== null, hasProfileKey: /^\s*profile\s*=/m.test(toml ?? ''), identicalToBefore: now.paneHtml === was.paneHtml, paneHtmlLength: now.paneHtml.length, scoreHostsInTab: (now.paneHtml.match(/forge-rhythm-score-host/g) || []).length };
  }
}
for (const k of Object.keys(out)) if (out[k]?.paneHtml) out[k].paneHtmlLength = out[k].paneHtml.length;
const dump = JSON.parse(JSON.stringify(out, (k, v) => (k === 'paneHtml' ? undefined : v)));
fs.writeFileSync(OUT, JSON.stringify(dump, null, 1)); console.log(JSON.stringify(dump, null, 1));
process.exit(0);
