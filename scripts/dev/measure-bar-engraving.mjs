// 2026-11-19-0999b - THE ENGRAVING of the bars a phrase's STEPS make (Morph-between, Mix, Extend), through the REAL Verovio in REAL headless Chrome. WRITTEN, NOT RUN by its author: the supervisor runs it (it opens Chrome and boots Pyodide: a heavy run, one at a time).
//
// WHY THIS SCRIPT: 0996b never looked at the engraving of the inserted bars, and the real Verovio cannot run in happy-dom (it needs WebAssembly and a layout engine). The existing tooling can: scripts/dev/browser/build.mjs bundles the REAL phrase tab (mountPhrase) with the REAL music edition (Verovio and the
// players) for Chrome (entry-phrase.ts), and the REAL engine (the bundled Pyodide) runs in Node behind a local /phrase route, exactly as measure-morph.ts does. This script uses that rig: for each phrase below it writes the phrase note the way the list model does (the canonical sentences replayed: sentence-list-core.ts
// + sentence-list-note-core.ts), mounts it in the real tab, waits for Verovio's SVG and takes a SCREENSHOT of the Score of the head alone and of the head with the step.
//
//   node scripts/dev/measure-bar-engraving.mjs [--out <dir>] [--app-css <file>] [--no-build]       exit 0 = every verdict true; the PNGs are what to LOOK at
//     <dir>      default ~/.forge-mem-evidence/measure/bar-engraving (the bundle, the stylesheets and the shots go here)
//     --app-css  Obsidian's own app.css (default ~/.forge-mem-evidence/measure/app.css; optional: without it the Score is engraved unstyled by Obsidian)
//     --no-build reuse <dir>/harness-phrase.js from an earlier run
//   It builds the bundle itself (OUT=<dir>/harness-phrase.js EDITION=music ENTRY=entry-phrase.ts node scripts/dev/browser/build.mjs) and copies styles.css as plugin-styles.css.
// Run it ALONE (parallel Chrome runs stall each other). Needs the music wheels (npm run fetch-music-wheels) for the engine.
//
// Cases (each: the head alone, then the head + step; the SVG's `g.measure` are the bars, `g.notehead` the hits):
//   morphBetween   Extend bar_005 to 4 bars + `Morph bars 2 and 3 across 3 bars.`         4 -> 7 bars, new bars 3 to 5
//   mix            Morph bar_005 into bar_006 over 5 bars + `Mix bars 2 and 3.`            5 -> 6 bars, the mix is bar 3
//   mixPath        the same head + `Mix bars 1 and 5, as a path, in seeded order, seed 7.` 5 -> 6 bars, the path bar is bar 5 (after the later bar)
//   extendReplace  Extend bar_005 to 4 bars + `Extend bar 2 to 3 bars, building up.`       4 -> 6 bars, bar 2 is replaced by 3 bars
//   extendInsert   the same + `... and put them at the end`                              4 -> 7 bars, bar 2 stays, 3 bars at the end
// Verdicts (suffixed _<case>): barsAreDrawn (the SVG has the expected number of measures), endsKeepTheirHits (the measures that must stay have the head's own number of noteheads, bar by bar), newBarsHaveHits (the new bars are not empty),
// noConsoleErrors. Screenshots: engraving-<case>-head.png and engraving-<case>-step.png in <dir>/shots.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import * as L from '../../src/sentence-list-core.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
import { writeListNote } from '../../src/sentence-list-note-core.ts';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const HOME = os.homedir();
const OUT = arg('--out', path.join(HOME, '.forge-mem-evidence/measure/bar-engraving')).replace(/^~/, HOME);
const APP_CSS = arg('--app-css', path.join(HOME, '.forge-mem-evidence/measure/app.css')).replace(/^~/, HOME);
const NO_BUILD = process.argv.includes('--no-build');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

if (!NO_BUILD || !fs.existsSync(path.join(OUT, 'harness-phrase.js'))) {
  execFileSync('node', [path.join(ROOT, 'scripts/dev/browser/build.mjs')], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, OUT: path.join(OUT, 'harness-phrase.js'), EDITION: 'music', ENTRY: 'entry-phrase.ts' } });
}
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT, 'plugin-styles.css'));
if (fs.existsSync(APP_CSS)) fs.copyFileSync(APP_CSS, path.join(OUT, 'app.css')); else fs.writeFileSync(path.join(OUT, 'app.css'), '');

const FIX = path.join(ROOT, 'test/fixtures/score-first');
const BAR5 = fs.readFileSync(path.join(FIX, 'bar_005.md'), 'utf8');
const BAR6 = fs.readFileSync(path.join(FIX, 'bar_006.md'), 'utf8');
const VAULT = { bars: ['bar_005', 'bar_006'], phrases: [], arrangements: [], compositions: [], kits: [] };
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
const MORPH = 'Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.';
const CASES = [
  { name: 'morphBetween', head: [EXTEND], step: ['Morph bars 2 and 3 across 3 bars.'], headBars: 4, bars: 7, newBars: [3, 4, 5], keep: [[1, 1], [2, 2], [6, 3], [7, 4]] },
  { name: 'mix', head: [MORPH], step: ['Mix bars 2 and 3.'], headBars: 5, bars: 6, newBars: [3], keep: [[1, 1], [2, 2], [4, 3], [5, 4], [6, 5]] },
  { name: 'mixPath', head: [MORPH], step: ['Mix bars 1 and 5, as a path, in seeded order, seed 7.'], headBars: 5, bars: 6, newBars: [6], keep: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] },
  { name: 'extendReplace', head: [EXTEND], step: ['Extend bar 2 to 3 bars, building up.'], headBars: 4, bars: 6, newBars: [2, 3, 4], keep: [[1, 1], [5, 3], [6, 4]] },
  { name: 'extendInsert', head: [EXTEND], step: ['Extend bar 2 to 3 bars, building up, and put them at the end.'], headBars: 4, bars: 7, newBars: [5, 6, 7], keep: [[1, 1], [2, 2], [3, 3], [4, 4]] },
];

/** The phrase note the list model writes for these canonical sentences (the planAppend of each typed step, as the composer does). */
async function noteOf(lines) {
  let list = [];
  for (const typed of lines) { const plan = await L.planAppend(list, 'phrase', L.drawSeeds([typed], 'phrase', () => 7), { vault: VAULT }); if (!plan.ok) throw new Error(`${typed}: ${plan.message}`); list = plan.list; }
  const rp = L.replayGrammar(list, 'phrase', { vault: VAULT });
  if (rp.stop !== null) throw new Error(`${lines.join(' | ')}: ${rp.stop.message}`);
  const w = writeListNote(noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_001', 'phrase', { params: rp.params, list: rp.list });
  if (!w.ok) throw new Error(w.message);
  return { text: w.text, list };
}

const py = await engine();
const routes = {
  'POST /phrase': async (q, r) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, params, title } = JSON.parse(body);
    try { const payload = computePhrase(py, data, params, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:1000px;height:760px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

/** A FRESH page per drawing (a fresh host element, as a new tab is): mounts the real phrase tab on `text`, waits for Verovio's SVG, returns the page and what the SVG says. */
async function draw(text) {
  const q = await openPage({ dir: OUT, width: 1040, height: 800, pageHtml: page, routes });
  await q.ev(`window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR5)}, bars: { bar_006: ${JSON.stringify(BAR6)} }, path: 'phrases/phrase_001.md', name: 'phrase_001' })`);
  for (let w = 0; w < 30000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg g.measure')`)) break; await sleep(100); }
  await sleep(2000);
  const svg = await q.ev(`(() => { const all = [...document.querySelectorAll('svg')].filter((x) => x.querySelector('g.measure')); const s = all.sort((p, q) => q.querySelectorAll('g.measure').length - p.querySelectorAll('g.measure').length)[0]; if (!s) return null;      /* supervisor fix 2026-11-19-0999b: the engraved svg is the one with the measures (the first svg under the host was not it) */ const ms = [...s.querySelectorAll('g.measure')]; return { measures: ms.length, noteheads: ms.map((m) => m.querySelectorAll('g.notehead').length), tempi: [...s.querySelectorAll('g.tempo')].map((g) => g.textContent.replace(/\\s+/g, ' ').trim()) }; })()`);
  const errors = await q.ev('window.__errors.slice()');
  return { q, svg, errors };
}
const shotOf = async (q, file) => {
  const c = await q.ev(`(() => { const e = document.querySelector('.forge-rhythm-score-host'); e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 40), width: 1000, height: Math.min(720, r.height + 80) }; })()`);
  await q.shot(file, c);
};

const verdict = {}, numbers = {};
for (const c of CASES) {
  const head = await noteOf(c.head);
  const full = await noteOf([...c.head, ...c.step]);
  const h = await draw(head.text);
  await shotOf(h.q, path.join(SHOTS, `engraving-${c.name}-head.png`));
  h.q.close();
  const s = await draw(full.text);
  await shotOf(s.q, path.join(SHOTS, `engraving-${c.name}-step.png`));
  s.q.close();
  numbers[c.name] = { sentences: full.list, head: h.svg, step: s.svg, errors: [...h.errors, ...s.errors] };
  verdict[`barsAreDrawn_${c.name}`] = !!h.svg && h.svg.measures === c.headBars && !!s.svg && s.svg.measures === c.bars;
  verdict[`endsKeepTheirHits_${c.name}`] = !!h.svg && !!s.svg && c.keep.every(([now, was]) => s.svg.noteheads[now - 1] === h.svg.noteheads[was - 1]);
  verdict[`newBarsHaveHits_${c.name}`] = !!s.svg && c.newBars.every((n) => (s.svg.noteheads[n - 1] ?? 0) > 0);
  verdict[`noConsoleErrors_${c.name}`] = h.errors.length === 0 && s.errors.length === 0;
}
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; LOOK at the shots in ${SHOTS}`);
process.exit(ok ? 0 : 1);
