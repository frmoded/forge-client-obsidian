// 2026-11-05-1189 (score-tab declutter) in real headless Chrome under Obsidian's own app.css and the plugin's styles.css, BEFORE (the commit this change starts from) and AFTER, at 640 and 300 px: the REAL bar Beat Box tab, the
// REAL phrase tab (extend, with its notebook), a mix, the REAL ArrangementView and CompositionView, and a 16-bar phrase (a wide Score), with real Verovio, the real html-midi-player and the real engine behind /compute and /phrase.
// Each verdict can fail (the CONTROLS feed the same comparators the BEFORE build, which must fail them):
//   * ONE toolbar row: the player's own play button, the zoom buttons and the Kit button share one top (within 1 px) and the row does not wrap, at 640 and at 300 px;
//   * the zoom and Kit buttons take the player's button style: the same height as its play button (32 px), no border, fully round, transparent, the same hover tint, the same 14 px sans-serif font as the player;
//   * no title above the Score: the engraving has no page header (Verovio's pgHead, the MusicXML work title) and the Score starts at the top of its box;
//   * the Score is never wider than the pane: its box is inside the pane, it scrolls horizontally inside itself (a wide 16-bar Score, and any Score zoomed in), the pane and the page do not scroll sideways; zoom still works inside it;
//   * with the wrapper scrolled sideways a REAL click on a bar pins THAT bar and a REAL drag across two bars selects exactly those two (the notebook's chip), so navigation and selection hit the right bars when scrolled;
//   * a bar's Beat Box tab has no Inspector section (and still lights the engraved note a Beat Box step hovers); the phrase, mix, arrangement and composition tabs keep theirs;
//   * the Kit button toggles and the row stays one row with one player and one zoom bar; nothing overflows the pane; no page errors.
// Build the two harnesses and run (from the client repo root; <dir>/after and <dir>/before each hold harness-order.js, app.css and plugin-styles.css = that build's styles.css):
//   OUT=<dir>/after/harness-order.js EDITION=music ENTRY=entry-score-order.ts node scripts/dev/browser/build.mjs
//   CLIENT=<git archive of the start commit> OUT=<dir>/before/harness-order.js EDITION=music ENTRY=entry-score-order.ts node scripts/dev/browser/build.mjs
//   DELAY_MS=100 FORGE_MEM_BUDGET_MB=11000 node scripts/dev/measure-score-declutter.ts <dir>     (writes <dir>/score-declutter-measurements.json and <dir>/shots/*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, compute, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { newArrangementNote, type ArrangementParams } from '../../src/arrangement-core.ts';
import { newKitNote } from '../../src/kit-core.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
import { newCompositionNote } from '../../src/composition-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const DELAY_MS = Number(process.env.DELAY_MS ?? 1500);
const PANE_H = 700;
const fx = (n: string) => fs.readFileSync(new URL(`../../test/fixtures/score-first/${n}`, import.meta.url), 'utf8');
const WIDGET = fs.readFileSync(new URL('../../assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html', import.meta.url), 'utf8');
const PLAYGROUND_TOML = fx('music-playground.forge.toml');
const BARS = Object.fromEntries(['bar_005', 'bar_006', 'bar_007', 'bar_008'].map((n) => [n, fx(`${n}.md`)]));
const STARTER = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: {
  kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] } };
const DATA_NOTE = `---\ntype: data\ncontent_type: json\ndescription: "bar_001"\n---\n\n\`\`\`json\n${JSON.stringify(STARTER, null, 2)}\n\`\`\`\n`;
const extend = (source: string, bars: number, extra: object = {}): any => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0, ...extra });
const PHRASE = noteContentFor('phrase_001', extend('bar_005', 8));
const PHRASE16 = noteContentFor('phrase_004', extend('bar_005', 16));
const MIX = noteContentFor('phrase_002', { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } as any);
const PHRASES = { 'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)) };
const BAR_FILES = Object.fromEntries(Object.entries(BARS).map(([n, t]) => [`bars/${n}.md`, t]));
const ARR_PATH = 'arrangements/arr_001.md';
const ARR_FILES = {
  ...BAR_FILES, ...PHRASES,
  'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] } as any), 'kits/latin.md': newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] } as any),
  [ARR_PATH]: newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] } as ArrangementParams),
};
const COMP_PATH = 'compositions/comp_001.md';
const COMP_FILES = { ...BAR_FILES, ...PHRASES, [COMP_PATH]: newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_009' }] } as any) };

const py = await engine();
const answer = (fn: (body: any) => any) => async (q: any, r: any) => {
  let body = ''; for await (const ch of q) body += ch;
  await sleep(DELAY_MS);
  try { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload: fn(JSON.parse(body)) })); }
  catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
};
const routes = {
  'POST /compute': answer(({ data, title }) => compute(py, data, title)),
  'POST /phrase': answer(({ data, params, title }) => computePhrase(py, data, params, title)),
};

type Kind = 'data' | 'phrase' | 'mix' | 'arrangement' | 'composition' | 'wide';
const KINDS: Array<{ kind: Kind; paneClass: string; mount: string }> = [
  { kind: 'data', paneClass: 'forge-rhythm-edit-view', mount: `window.__mountTab(pane, { note: ${JSON.stringify(DATA_NOTE)}, widget: ${JSON.stringify(WIDGET)}, toml: ${JSON.stringify(PLAYGROUND_TOML)} })` },
  { kind: 'phrase', paneClass: 'forge-phrase-view', mount: `window.__mountPhrase(pane, { phrase: ${JSON.stringify(PHRASE)}, bar: ${JSON.stringify(BARS.bar_005)}, bars: ${JSON.stringify({ bar_006: BARS.bar_006, bar_008: BARS.bar_008 })}, notebook: true, structure: true })` },
  { kind: 'mix', paneClass: 'forge-phrase-view', mount: `window.__mountPhrase(pane, { phrase: ${JSON.stringify(MIX)}, bar: ${JSON.stringify(BARS.bar_005)}, bars: ${JSON.stringify({ bar_006: BARS.bar_006 })}, path: 'phrases/phrase_002.md', name: 'phrase_002', structure: true })` },
  { kind: 'arrangement', paneClass: 'forge-arrangement-view', mount: `window.__mountArrangement(pane, { files: ${JSON.stringify(ARR_FILES)}, path: ${JSON.stringify(ARR_PATH)} })` },
  { kind: 'composition', paneClass: 'forge-composition-view', mount: `window.__mountComposition(pane, { files: ${JSON.stringify(COMP_FILES)}, path: ${JSON.stringify(COMP_PATH)} })` },
  { kind: 'wide', paneClass: 'forge-phrase-view', mount: `window.__mountPhrase(pane, { phrase: ${JSON.stringify(PHRASE16)}, bar: ${JSON.stringify(BARS.bar_005)}, bars: ${JSON.stringify({ bar_006: BARS.bar_006, bar_008: BARS.bar_008 })}, notebook: true, structure: true, path: 'phrases/phrase_004.md' })` },
];

const pageFor = (W: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos show-view-header">
${KINDS.map((k) => `<div class="workspace-leaf-content" id="leaf-${k.kind}" style="width:${W}px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content ${k.paneClass}" id="pane-${k.kind}" style="height:${PANE_H}px;overflow:auto"></div></div>`).join('\n')}
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-order.js"></script></body></html>`;


const READ = (id: string) => `((id) => {
  const pane = document.getElementById(id); const panel = pane.querySelector('.forge-rhythm-edit-score');
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const cs = (e) => { if (!e) return null; const c = getComputedStyle(e); return { h: parseFloat(c.height), bw: c.borderTopWidth, bs: c.borderTopStyle, br: c.borderTopLeftRadius, fs: c.fontSize, ff: c.fontFamily, bg: c.backgroundColor }; };
  const player = panel.querySelector('midi-player'); const play = player && player.shadowRoot && player.shadowRoot.querySelector('button.play');
  const zoom = [...panel.querySelectorAll('.forge-zoom-button')]; const kit = panel.querySelector('.forge-kit-toggle'); const toolbar = panel.querySelector('.forge-score-toolbar, .forge-output-toolbar');
  const wrap = panel.querySelector('.forge-output-score'); const svg = wrap && wrap.querySelector('svg'); const pr = pane.getBoundingClientRect();
  const label = kit && kit.querySelector('.forge-kit-toggle-label');
  return {
    players: panel.querySelectorAll('midi-player').length, zoomBars: panel.querySelectorAll('.forge-zoom-bar').length, zoomButtons: zoom.length, compactToolbars: panel.querySelectorAll('.forge-score-toolbar').length,
    player: r(player), play: r(play), zoom: zoom.map(r), kit: r(kit), toolbar: r(toolbar),
    style: { play: cs(play), zoom: cs(zoom[0]), kit: cs(kit), player: player ? (c => ({ fs: c.fontSize, ff: c.fontFamily }))(getComputedStyle(player)) : null },
    kitIconOnly: label ? getComputedStyle(label).display === 'none' : null, kitTitle: kit ? kit.title : null, zoomTitles: zoom.map((z) => z.title), zoomAria: zoom.map((z) => z.getAttribute('aria-label')),
    pgHead: svg ? svg.querySelectorAll('.pgHead').length : null, svgText: svg ? svg.textContent.replace(/\s+/g, ' ').slice(0, 80) : null,
    wrap: r(wrap), svg: r(svg), overflowX: wrap ? getComputedStyle(wrap).overflowX : null, scroll: wrap ? [wrap.scrollWidth, wrap.clientWidth] : null, scrollbarH: wrap ? wrap.offsetHeight - wrap.clientHeight : null,
    pane: { l: pr.left, r: pr.right }, paneOverflow: pane.scrollWidth - pane.clientWidth, docOverflow: document.documentElement.scrollWidth - innerWidth,
    inspector: !!panel.querySelector('.forge-inspector'), inspectorText: panel.querySelector('.forge-inspector') ? panel.querySelector('.forge-inspector').textContent.slice(0, 60) : null,
    quiet: panel.querySelector('.forge-rhythm-edit-score-quiet') ? panel.querySelector('.forge-rhythm-edit-score-quiet').textContent : null,
  }; })(${JSON.stringify(id)})`;

async function studyKind(p: any, k: (typeof KINDS)[number], label: string, W: number) {
  const id = `pane-${k.kind}`;
  const out: any = { kind: k.kind };
  await p.ev(`window.__messageDelivery.setScoreFirst(true); true`);
  await p.ev(`(async () => { const pane = document.getElementById(${JSON.stringify(id)}); await ${k.mount}; return true; })()`);
  for (let w = 0; w < 40000; w += 100) { if (await p.ev(`!!document.querySelector('#${id} .forge-rhythm-score-host svg')`)) break; await sleep(100); }
  await sleep(900);
  out.read = await p.ev(READ(id));
  await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = l.id === 'leaf-${k.kind}' ? '' : 'none'; }); true`);
  await sleep(250);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = ''; }); true`);          // the other tabs come back (their state was kept)
  fs.writeFileSync(path.join(SHOTS, `declutter-${label}-${W}-${k.kind}.png`), Buffer.from(r.result.data, 'base64'));
  if (k.kind === 'data') {
    // hover: the player's play button and one of our buttons, a REAL pointer over each
    const pts = await p.ev(`(() => { const pl = document.querySelector('#${id} midi-player'); const play = pl.shadowRoot.querySelector('button.play').getBoundingClientRect(); const z = document.querySelectorAll('#${id} .forge-zoom-button')[0].getBoundingClientRect(); return { play: [(play.left + play.right) / 2, (play.top + play.bottom) / 2], zoom: [(z.left + z.right) / 2, (z.top + z.bottom) / 2] }; })()`);
    await p.hover(pts.zoom[0], pts.zoom[1]); await sleep(500);
    const zoomHover = await p.ev(`getComputedStyle(document.querySelectorAll('#${id} .forge-zoom-button')[0]).backgroundColor`);
    await p.hover(pts.play[0], pts.play[1]); await sleep(500);
    const playHover = await p.ev(`getComputedStyle(document.querySelector('#${id} midi-player').shadowRoot.querySelector('button.play')).backgroundColor`);
    await p.hover(2, 2); await sleep(400);
    out.hover = { zoom: zoomHover, play: playHover };
    // the Kit button, really clicked: still one row, one player, one zoom bar with three buttons
    const kitPt = await p.ev(`(() => { const b = document.querySelector('#${id} .forge-kit-toggle').getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`);
    await p.click(kitPt[0], kitPt[1]);
    for (let w = 0; w < 20000; w += 100) { await sleep(100); if (await p.ev(`!!document.querySelector('#${id} .forge-rhythm-score-host svg') && document.querySelectorAll('#${id} midi-player').length === 1`)) break; }
    await sleep(900);
    out.afterKit = await p.ev(READ(id));
    const kitPt2 = await p.ev(`(() => { const b = document.querySelector('#${id} .forge-kit-toggle').getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`);
    await p.click(kitPt2[0], kitPt2[1]); await sleep(1800);
    // a REAL zoom-in click: the engraving grows INSIDE its box
    const zin = await p.ev(`(() => { const b = document.querySelectorAll('#${id} .forge-zoom-button')[2].getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`);
    await p.click(zin[0], zin[1]); await p.click(zin[0], zin[1]); await sleep(500);
    out.zoomed = await p.ev(READ(id));
    const zreset = await p.ev(`(() => { const b = document.querySelectorAll('#${id} .forge-zoom-button')[1].getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`);
    await p.click(zreset[0], zreset[1]); await sleep(400);
  }
  if (k.kind === 'wide') {
    out.wideRead = out.read;
    await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = l.id === 'leaf-wide' ? '' : 'none'; }); window.scrollTo(0, 0); true`);          // the pointer needs this tab in the viewport
    await sleep(300);
    // scroll the wrapper sideways, then find bars that have an engraved NOTE fully inside the visible box (a real click lands on a note; the bar under it is what must be pinned)
    const cands = async () => p.ev(`(() => { const wrap = document.querySelector('#${id} .forge-output-score'); const wr = wrap.getBoundingClientRect(); const out = []; [...wrap.querySelectorAll('g.measure')].forEach((m, i) => { const n = [...m.querySelectorAll('g.note')].find((q) => { const b = q.getBoundingClientRect(); return b.width > 0 && b.left > wr.left + 8 && b.right < wr.right - 8 && b.top >= wr.top + 2 && b.bottom <= wr.bottom - 2; }); if (n) { const b = n.getBoundingClientRect(); out.push({ i, id: m.id, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }); } }); return out; })()`);
    let vis: any[] = [];
    for (const frac of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      await p.ev(`(() => { const wrap = document.querySelector('#${id} .forge-output-score'); wrap.scrollLeft = Math.max(0, (wrap.scrollWidth - wrap.clientWidth) * ${frac}); return true; })()`);
      await sleep(400);
      vis = await cands();
      if (new Set(vis.map((m: any) => m.i)).size >= 2) break;
    }
    out.scrolled = { scrollLeft: await p.ev(`document.querySelector('#${id} .forge-output-score').scrollLeft`), visible: vis.map((m: any) => m.i + 1) };
    if (vis.length >= 2) {
      const first = vis[0], second = vis.find((m: any) => m.i === first.i + 1) ?? vis.find((m: any) => m.i !== first.i)!;
      const under = async (x: number, y: number) => p.ev(`(() => { const e = document.elementFromPoint(${x}, ${y}); const m = e && e.closest('g.measure'); return m ? m.id : null; })()`);
      const expectId = await under(first.x, first.y);
      await p.click(first.x, first.y); await sleep(500);
      out.click = { expectId, firstBar: first.i + 1, pinned: await p.ev(`[...document.querySelectorAll('#${id} .forge-artifact-pinned')].map((e) => e.id)`) };
      // release the pin, then a REAL drag from the first bar's note to the second's
      await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
      await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: first.x, y: first.y });
      await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: first.x, y: first.y, button: 'left', clickCount: 1 });
      for (let st = 1; st <= 6; st++) await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: first.x + (second.x - first.x) * st / 6, y: first.y + (second.y - first.y) * st / 6, buttons: 1 });
      await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: second.x, y: second.y, button: 'left', clickCount: 1 }); await sleep(600);
      const wantBars = [first.i + 1, second.i + 1].sort((x, y) => x - y);
      out.drag = { from: wantBars[0], to: wantBars[1], chips: await p.ev(`[...document.querySelectorAll('#${id} .forge-notebook-chips .forge-notebook-chip')].map((c) => c.textContent)`), pressed: await p.ev(`[...document.querySelectorAll('#${id} .forge-notebook-bar')].filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => Number(x.textContent))`) };
    }
    out.afterScroll = await p.ev(READ(id));
    await p.shot(path.join(SHOTS, `declutter-${label}-${W}-wide-scrolled.png`));
    await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = ''; }); true`);
  }
  return out;
}

async function studyBuild(label: 'before' | 'after') {
  const res: any = {};
  for (const W of [640, 300]) {
    const p = await openPage({ dir: path.join(root, label), width: W + 60, height: 800, pageHtml: pageFor(W), routes });
    try {
      res[W] = {};
      for (const k of KINDS) res[W][k.kind] = await studyKind(p, k, label, W);
      res[W].errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player|midi|Failed to fetch|NetworkError/i.test(e));
    } finally { p.close(); }
  }
  return res;
}

const after = await studyBuild('after');
const before = fs.existsSync(path.join(root, 'before', 'harness-order.js')) ? await studyBuild('before') : null;

const near = (a: number, b: number, tol = 1.01) => Math.abs(a - b) <= tol;
/** The comparator: the player's play button, every zoom button and the Kit button (when there is one) share one top, and nothing is a second row. */
const oneRow = (s: any): boolean => !!s.play && s.zoom.length === 3 && s.zoom.every((z: any) => near(z.t, s.play.t)) && (!s.kit || near(s.kit.t, s.play.t)) && s.toolbar && s.toolbar.h < 2 * s.player.h;
const KINDS_ALL = KINDS.map((k) => k.kind);
const verdicts: Record<string, boolean> = {};
for (const W of [640, 300]) {
  const A = after[W];
  for (const kind of KINDS_ALL) {
    const s = A[kind].read;
    verdicts[`${W} ${kind}: ONE toolbar row - the play button, the 3 zoom buttons${s.kit ? ' and the Kit button' : ''} share one top (play ${s.play?.t.toFixed(1)}, zoom ${s.zoom.map((z: any) => z.t.toFixed(1)).join('/')}${s.kit ? `, kit ${s.kit.t.toFixed(1)}` : ''}), one compact toolbar, one player, one zoom bar`] = oneRow(s) && s.compactToolbars === 1 && s.players === 1 && s.zoomBars === 1;
    verdicts[`${W} ${kind}: no engraved title (pgHead ${s.pgHead}), the Score box starts at its own top`] = s.pgHead === 0 && s.svg && s.wrap && near(s.svg.t, s.wrap.t, 2);
    verdicts[`${W} ${kind}: the Score is never wider than its pane (box ${s.wrap?.l.toFixed(0)}..${s.wrap?.r.toFixed(0)} in pane ${s.pane.l.toFixed(0)}..${s.pane.r.toFixed(0)}), overflow-x ${s.overflowX}, the pane and the page do not scroll sideways`] = !!s.wrap && s.wrap.l >= s.pane.l - 0.5 && s.wrap.r <= s.pane.r + 0.5 && s.overflowX === 'auto' && s.paneOverflow <= 0 && s.docOverflow <= 0;
    verdicts[`${W} ${kind}: the buttons say what they are (titles ${JSON.stringify(s.zoomTitles)}${s.kit ? `, kit "${s.kitTitle}"` : ''}) and keep their aria-labels`] = s.zoomTitles.every((t: string) => t.length > 0) && s.zoomAria.every((t: string) => t && t.length > 0) && (!s.kit || (s.kitTitle ?? '').length > 0);
  }
  const d = A.data.read;
  verdicts[`${W} data (a bar's Beat Box tab): NO Inspector section`] = d.inspector === false;
  for (const kind of ['phrase', 'mix', 'arrangement', 'composition', 'wide']) verdicts[`${W} ${kind}: the Inspector is still there ("${(A[kind].read.inspectorText ?? '').slice(0, 24)}...")`] = A[kind].read.inspector === true;
  verdicts[`${W} the zoom and Kit buttons take the player's style: height ${d.style.zoom.h}/${d.style.kit.h} px against its play button's ${d.style.play.h}, border ${d.style.zoom.bs}/${d.style.kit.bs}, round, 14 px sans-serif like the player (${d.style.zoom.fs} ${d.style.zoom.ff.slice(0, 18)})`] = d.style.zoom.h === d.style.play.h && d.style.kit.h === d.style.play.h && d.style.zoom.bw === '0px' && d.style.kit.bw === '0px' && parseFloat(d.style.zoom.br) >= 16 && parseFloat(d.style.kit.br) >= 16 && d.style.zoom.fs === d.style.player.fs && d.style.zoom.ff === d.style.player.ff && d.style.kit.fs === d.style.player.fs;
  verdicts[`${W} hover: our button's tint (${A.data.hover.zoom}) is the player's (${A.data.hover.play})`] = A.data.hover.zoom === A.data.hover.play && /0\.3\)$/.test(A.data.hover.play);
  verdicts[`${W} the Kit button really clicked: still ONE row, one player, one zoom bar with 3 buttons, nothing stacked`] = oneRow(A.data.afterKit) && A.data.afterKit.players === 1 && A.data.afterKit.zoomBars === 1 && A.data.afterKit.zoomButtons === 3;
  verdicts[`${W} a REAL zoom-in (x2) grows the engraving INSIDE its box (${d.svg.w.toFixed(0)} -> ${A.data.zoomed.svg.w.toFixed(0)} px in a ${A.data.zoomed.wrap.w.toFixed(0)} px box), the box and the pane do not grow`] = A.data.zoomed.svg.w > d.svg.w + 1 && near(A.data.zoomed.wrap.w, d.wrap.w, 1.5) && A.data.zoomed.paneOverflow <= 0 && A.data.zoomed.docOverflow <= 0 && A.data.zoomed.scroll[0] > A.data.zoomed.scroll[1];
  const w = A.wide.wideRead;
  verdicts[`${W} wide (16 bars): the Score scrolls INSIDE its box (${w.scroll[0]} wide in ${w.scroll[1]}, overflow-x ${w.overflowX}${w.scrollbarH ? `, scrollbar ${w.scrollbarH} px tall` : ', overlay scrollbar'}), the pane does not (overflow ${w.paneOverflow}, page ${w.docOverflow})`] = w.scroll[0] > w.scroll[1] && w.overflowX === 'auto' && w.paneOverflow <= 0 && w.docOverflow <= 0;
  const sc = A.wide;
  verdicts[`${W} wide, scrolled ${Math.round(sc.scrolled.scrollLeft)} px: a REAL click on bar ${sc.click?.firstBar} pins the bar under the pointer (${sc.click?.expectId} -> pinned ${JSON.stringify(sc.click?.pinned)})`] = !!sc.click && !!sc.click.expectId && sc.click.pinned.length === 1 && sc.click.pinned[0] === sc.click.expectId;
  verdicts[`${W} wide, scrolled: a REAL drag from bar ${sc.drag?.from} to bar ${sc.drag?.to} selects exactly those (notebook bars ${JSON.stringify(sc.drag?.pressed)}, chip ${JSON.stringify(sc.drag?.chips)})`] = !!sc.drag && JSON.stringify(sc.drag.pressed) === JSON.stringify([sc.drag.from, sc.drag.to]) && sc.drag.chips.length >= 1;
  if (W === 300) verdicts[`300: the Kit button keeps its icon and gives up its words (icon only: ${d.kitIconOnly})`] = d.kitIconOnly === true;
  if (W === 640) verdicts[`640: the Kit button keeps its words (icon only: ${d.kitIconOnly})`] = d.kitIconOnly === false;
}
if (before) {
  const b640 = before[640];
  for (const kind of KINDS_ALL) verdicts[`CONTROL ${kind}: the comparator calls the OLD toolbar NOT one row (kit ${b640[kind].read.kit?.t.toFixed(0)}, zoom ${b640[kind].read.zoom[0]?.t.toFixed(0)}, player ${b640[kind].read.play?.t.toFixed(0)})`] = !oneRow(b640[kind].read);
  verdicts[`CONTROL: the OLD Score had an engraved title (pgHead ${b640.data.read.pgHead}) and the OLD bar tab an Inspector`] = b640.data.read.pgHead > 0 && b640.data.read.inspector === true;
}
verdicts['no page errors in either run'] = after[640].errors.length === 0 && after[300].errors.length === 0 && (before ? before[640].errors.length === 0 : true);

fs.writeFileSync(path.join(root, 'score-declutter-measurements.json'), JSON.stringify({ after, before, verdicts }, null, 2));
let failed = 0;
for (const [name, ok] of Object.entries(verdicts)) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(`${Object.keys(verdicts).length - failed}/${Object.keys(verdicts).length} verdicts`);
process.exit(failed ? 1 : 0);
