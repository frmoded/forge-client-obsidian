// 2026-11-03-1155-93 (score_first polish R6): "in Score mode the Score is always the first thing in the tab". Every score-first tab kind in real headless Chrome under Obsidian's own app.css, BEFORE (the commit this change
// starts from) and AFTER, at 640 and 300 px wide: the Beat Box tab (the real RhythmEditView, the real Beat Box in its iframe), a phrase tab (extend, with its bracket, chips and notebook; and a mix) via the real mountPhrase,
// and the real ArrangementView and CompositionView over an in-memory vault. The real engine runs behind /compute and /phrase (answers are delayed so the EMPTY tab can be measured before the first Score arrives).
// Per tab it records the order of the pane's direct children by ROLE and the top of each, empty, filled and (phrase) while a redraw is in flight. The verdicts, each of which can fail (the CONTROL feeds the same comparator
// the BEFORE build, whose order is the old one: it must say "not first"):
//   * the Score is above the controls, the Beat Box, the bracket, the chips, the notebook, the header and the pin line, and nothing but the description bar (a banner that appears only when the note needs saying) may sit above it;
//   * the Score is visible without scrolling at 640 x 700 (its top, and the first 60 px of it, are inside the pane);
//   * the Score's own top does not move between the empty tab and the filled one, nor while a redraw is in flight; the controls under it move by the Score's height ONLY (no extra gap, no collapse while it redraws);
//   * nothing overflows the pane's width at 640 or at 300.
// Build the two harnesses and run (from the client repo root; <dir>/after and <dir>/before each hold harness-order.js, app.css and plugin-styles.css = that build's styles.css):
//   OUT=<dir>/after/harness-order.js EDITION=music ENTRY=entry-score-order.ts node scripts/dev/browser/build.mjs
//   CLIENT=<git archive of the start commit> OUT=<dir>/before/harness-order.js EDITION=music ENTRY=entry-score-order.ts node scripts/dev/browser/build.mjs
//   FORGE_MEM_BUDGET_MB=11000 node scripts/dev/measure-score-order.ts <dir>     (writes <dir>/score-order-measurements.json and <dir>/shots/*.png; exits 1 when a verdict is false)
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

type Kind = 'data' | 'phrase' | 'mix' | 'arrangement' | 'composition';
const KINDS: Array<{ kind: Kind; paneClass: string; mount: string }> = [
  { kind: 'data', paneClass: 'forge-rhythm-edit-view', mount: `window.__mountTab(pane, { note: ${JSON.stringify(DATA_NOTE)}, widget: ${JSON.stringify(WIDGET)}, toml: ${JSON.stringify(PLAYGROUND_TOML)} })` },
  { kind: 'phrase', paneClass: 'forge-phrase-view', mount: `window.__mountPhrase(pane, { phrase: ${JSON.stringify(PHRASE)}, bar: ${JSON.stringify(BARS.bar_005)}, bars: ${JSON.stringify({ bar_006: BARS.bar_006, bar_008: BARS.bar_008 })}, notebook: true, structure: true })` },
  { kind: 'mix', paneClass: 'forge-phrase-view', mount: `window.__mountPhrase(pane, { phrase: ${JSON.stringify(MIX)}, bar: ${JSON.stringify(BARS.bar_005)}, bars: ${JSON.stringify({ bar_006: BARS.bar_006 })}, path: 'phrases/phrase_002.md', name: 'phrase_002', structure: true })` },
  { kind: 'arrangement', paneClass: 'forge-arrangement-view', mount: `window.__mountArrangement(pane, { files: ${JSON.stringify(ARR_FILES)}, path: ${JSON.stringify(ARR_PATH)} })` },
  { kind: 'composition', paneClass: 'forge-composition-view', mount: `window.__mountComposition(pane, { files: ${JSON.stringify(COMP_FILES)}, path: ${JSON.stringify(COMP_PATH)} })` },
];

const pageFor = (W: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos show-view-header">
${KINDS.map((k) => `<div class="workspace-leaf-content" id="leaf-${k.kind}" style="width:${W}px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content ${k.paneClass}" id="pane-${k.kind}" style="height:${PANE_H}px;overflow:auto"></div></div>`).join('\n')}
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-order.js"></script></body></html>`;

/** What the pane holds, by role: the order of its direct children and the box of each (tops are relative to the pane's own top, scroll included). */
const SNAP = `((id) => {
  const pane = document.getElementById(id); const pr = pane.getBoundingClientRect();
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return null; return { top: +(r.top - pr.top + pane.scrollTop).toFixed(1), height: +r.height.toFixed(1), left: +(r.left - pr.left).toFixed(1), width: +r.width.toFixed(1) }; };
  const ROLES = [['banner', '.forge-description-bar'], ['score', '.forge-rhythm-edit-score, .forge-rhythm-edit-score-lean'], ['bracket', '.forge-phrase-bracket'], ['controls', '.forge-phrase-controls, .forge-arr-controls'], ['beatbox', 'iframe'],
    ['notebook', '.forge-notebook'], ['strip', '.forge-structure-strip, .forge-composition-tree, [class*="forge-arrangement-strip"]'], ['header', '.forge-arrangement-header, .forge-composition-header'], ['pin', '.forge-arrangement-pin'], ['status', '.forge-phrase-status']];
  const roleOf = (c) => { const hit = ROLES.find(([, sel]) => c.matches(sel)); return hit ? hit[0] : 'other:' + String(c.className).split(' ')[0]; };
  const out = { order: [...pane.children].map(roleOf), paneH: pane.clientHeight, overflowX: pane.scrollWidth - pane.clientWidth };
  for (const [name, sel] of ROLES) { const e = pane.querySelector(':scope > ' + sel.split(', ').join(', :scope > ')); if (e) out[name] = box(e); }
  const host = pane.querySelector('.forge-rhythm-score-host:not(.forge-rhythm-score-host-pending)'); out.host = box(host);
  out.svg = box(host && host.querySelector('svg'));
  return out; })`;

async function studyKind(p: any, k: (typeof KINDS)[number], label: string, W: number) {
  const id = `pane-${k.kind}`;
  const snap = () => p.ev(`${SNAP}(${JSON.stringify(id)})`);
  const out: any = { kind: k.kind };
  await p.ev(`window.__messageDelivery.setScoreFirst(true); true`);
  await p.ev(`(async () => { const pane = document.getElementById(${JSON.stringify(id)}); await ${k.mount}; return true; })()`);
  out.empty = await snap();
  for (let w = 0; w < 40000; w += 100) { if (await p.ev(`!!document.querySelector('#${id} .forge-rhythm-score-host svg')`)) break; await sleep(100); }
  await sleep(700);
  out.filled = await snap();
  await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = l.id === 'leaf-${k.kind}' ? '' : 'none'; }); true`);          // only this tab is on the page for its shot (the others keep their state, and come back below)
  await sleep(250);
  const r = await p.send('Page.captureScreenshot', { format: 'png' });
  await p.ev(`document.querySelectorAll('.workspace-leaf-content').forEach((l) => { l.style.display = ''; }); true`);
  fs.writeFileSync(path.join(SHOTS, `order-${label}-${W}-${k.kind}.png`), Buffer.from(r.result.data, 'base64'));
  if (k.kind === 'phrase') {                                     // a redraw in flight: the source bar changes from a 2-channel bar to a 4-channel one (a taller Score) - the Score stays where it was, the controls do not collapse upward while it is drawn
    await p.ev(`window.__edit('phrases/phrase_001.md', ${JSON.stringify(noteContentFor('phrase_001', extend('bar_008', 8)))}); true`);
    await sleep(900);
    out.pending = await snap();
    for (let w = 0; w < (W === 640 ? 30000 : 0); w += 100) { const h = await p.ev(`document.querySelector('#${id} .forge-rhythm-score-host:not(.forge-rhythm-score-host-pending) svg')?.getBoundingClientRect().height ?? 0`); if (h > 0 && Math.abs(h - (out.filled.svg?.height ?? 0)) > 1) break; await sleep(150); }       // (at 300 px the engraving is scaled to the pane and both bars come out the same height: the redraw is waited for at 640 only)
    await sleep(600);
    out.redrawn = await snap();
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
      res[W].errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player|midi/i.test(e));
    } finally { p.close(); }
  }
  return res;
}

const after = await studyBuild('after');
const before = fs.existsSync(path.join(root, 'before', 'harness-order.js')) ? await studyBuild('before') : null;

const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
const LOWER = ['bracket', 'controls', 'beatbox', 'notebook', 'strip', 'header', 'pin', 'status'];
/** The comparator: the Score panel is above every other part of the tab, and only the description banner may stand above it. */
const scoreFirst = (s: any): boolean => !!s.score && LOWER.every((r) => !s[r] || s.score.top < s[r].top) && s.order.slice(0, s.order.indexOf('score')).every((r: string) => r === 'banner');
const scoreVisible = (s: any): boolean => !!s.host && s.host.top + Math.min(60, s.host.height) <= s.paneH && s.score.top < s.paneH;
const pageErrors = (r: any) => [640, 300].flatMap((W) => r[W].errors);

const verdicts: Record<string, boolean> = {};
for (const W of [640, 300]) for (const k of KINDS) {
  const a = after[W][k.kind];
  const tag = `${k.kind} @${W}`;
  verdicts[`${tag}: the Score is the first thing (above the controls, Beat Box, bracket, chips, notebook, header, pin line; only the banner may sit above it): ${a.filled.order.join(' > ')}`] = scoreFirst(a.filled) && scoreFirst(a.empty);
  verdicts[`${tag}: nothing overflows the pane's width`] = a.filled.overflowX <= 0 && a.empty.overflowX <= 0;
  verdicts[`${tag}: the Score's own top does not move from the empty tab to the filled one (${a.empty.score.top} -> ${a.filled.score.top}), and the host sits at ${a.filled.host?.top}`] = near(a.empty.score.top, a.filled.score.top) && !!a.filled.host;
  if (W === 640) verdicts[`${tag}: the Score is visible without scrolling at 640 x ${PANE_H} (host top ${a.filled.host?.top}, svg top ${a.filled.svg?.top})`] = scoreVisible(a.filled);
  if (k.kind === 'phrase') {
    verdicts[`${tag}: while a redraw is in flight the Score and the controls stay where they were (no collapse): score ${a.filled.score.top}/${a.pending.score.top}, controls ${a.filled.controls.top}/${a.pending.controls.top}`] = near(a.filled.score.top, a.pending.score.top) && near(a.filled.controls.top, a.pending.controls.top);
    if (W === 640) verdicts[`${tag}: the controls move down by exactly the Score's height change when the new, taller Score replaces the old (${a.filled.score.height} -> ${a.redrawn.score.height})`] = Math.abs(a.redrawn.score.height - a.filled.score.height) > 1 && near(a.redrawn.controls.top - a.filled.controls.top, a.redrawn.score.height - a.filled.score.height) && a.redrawn.score.top === a.filled.score.top;
  }
}
if (before) {
  for (const k of KINDS) verdicts[`CONTROL ${k.kind}: the comparator calls the OLD order "not first" (${before[640][k.kind].filled.order.join(' > ')})`] = scoreFirst(before[640][k.kind].filled) === false;
  for (const k of KINDS) verdicts[`before ${k.kind}: the old tab had its non-Score parts above the Score (non-vacuity: this is the build that had them)`] = LOWER.some((r) => before[640][k.kind].filled[r] && before[640][k.kind].filled.score && before[640][k.kind].filled[r].top < before[640][k.kind].filled.score.top);
}
verdicts['no page errors in either run'] = pageErrors(after).length === 0 && (before ? pageErrors(before).length === 0 : true);

const offsets = KINDS.map((k) => `${k.kind}: Score panel top ${after[640][k.kind].filled.score.top}px, host top ${after[640][k.kind].filled.host?.top}px${before ? ` (before: ${before[640][k.kind].filled.score.top}px / ${before[640][k.kind].filled.host?.top}px)` : ''}`);
fs.writeFileSync(path.join(root, 'score-order-measurements.json'), JSON.stringify({ PANE_H, DELAY_MS, after, before, offsets, verdicts }, null, 2));
for (const [kk, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${kk}`);
console.log(offsets.join('\n'));
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
