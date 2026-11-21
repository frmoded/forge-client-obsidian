// 2026-11-20-1000 - THE INSPECTOR THROUGH THE STEP LINES, in REAL headless Chrome with the REAL Verovio and REAL mouse clicks. The Score of a phrase with a head and one, two and three step lines (Keep, Delete, Copy, Move, Morph-between, Mix, Extend replacing and inserting, in mixed orders)
// is engraved by the real Verovio from the real engine's MusicXML (the rig of measure-bar-engraving.mjs: scripts/dev/browser/build.mjs bundles the REAL phrase tab with the REAL music edition, the real engine runs in Node behind /phrase); then EVERY engraved bar (`g.measure`) is clicked with a real mouse click
// and the Inspector's lines are read: they must name a note (`from bar_005`) or say "made by step N: <the step>" in plain words, and never say "could not be mapped" (the 0999b screenshots said exactly that for a Morph-between, a Mix and an Extend). With the composer holding `Delete`, `Move`, `Copy` or `Keep`, a real click on a bar inserts
// ` bar N`, N being the bar's POSITION in the Score. Obsidian itself is NOT driven.
//   node scripts/dev/measure-inspector-steps.mjs [--out <dir>] [--no-build] [--only <regex on the case name>] [--quick]       exit 0 = every verdict true
//     <dir>      default ~/.forge-mem-evidence/measure/inspector-steps (the bundle, the stylesheets and the shots go here)
//     --quick    every other case only (a smoke run)
// It builds the bundle itself unless --no-build (EDITION=music ENTRY=entry-phrase.ts), takes the heavy lock (a second Chrome job waits), and needs the music wheels. Run it ALONE, `nice -n 10`.
// 2026-11-20-1002a: a long score is several Verovio PAGES (one svg each); the bars are counted over the whole score host, not the largest page.
// Verdicts: everyBarPinsAndNamesANote (the real click on every bar: lines[0] is `bar N of M`, one line says `from <note>` or `made by step K: <sentence>`), neverCouldNotBeMapped (before any click and after every click), barsAreDrawn (the SVG has the bars the steps leave), madeBarsSayTheirStep (a bar a step made says which, with its sentence, and its source bars),
// carriedBarsNameTheirNote (a Keep / Copy / Move / shifted bar says `from <the note of its head bar>`), barWordClickInsertsPosition (Delete on every bar, Move and Copy on every bar of every third case and on the first and last of the others: the field says `<Verb> bar N`), barWordClickPinsNothing,
// noConsoleErrors (the harness player's `[forge-player] sounds could not be loaded` is the harness' own and is left out). Screenshots: inspector-<case>.png (the Score with one bar pinned and its stack).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import * as L from '../../src/sentence-list-core.ts';
import { noteContentFor, readPhraseNote } from '../../src/phrase-core.ts';
import { writeListNote } from '../../src/sentence-list-note-core.ts';
import { structureSentence, isStructureOp } from '../../src/bar-structure-core.ts';
import { modelSteps } from '../../src/test-support/phrase-steps-rig.ts';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const HOME = os.homedir();
const OUT = arg('--out', path.join(HOME, '.forge-mem-evidence/measure/inspector-steps')).replace(/^~/, HOME);
const APP_CSS = arg('--app-css', path.join(HOME, '.forge-mem-evidence/measure/app.css')).replace(/^~/, HOME);
const NO_BUILD = process.argv.includes('--no-build');
const QUICK = process.argv.includes('--quick');
const ONLY = arg('--only', null);
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
const VAULT = { bars: ['bar_005', 'bar_006'], phrases: ['phrase_002'], arrangements: [], compositions: [], kits: [] };
const SRC_PHRASE = noteContentFor('phrase_002', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });   // what a Take reads: an Extend of 4 bars

const HEADS = {
  extend: { lines: ['Extend [[bar_005]] to 4 bars, repeating with fills.'], bars: 4, notes: () => ['bars/bar_005'] },
  morph: { lines: ['Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.'], bars: 5, notes: (h, n) => [h <= (n + 1) / 2 ? 'bars/bar_005' : 'bars/bar_006'] },
  // 2026-11-20-1002a: the driver's phrase: a LONG Morph (27 bars) and then Delete bar 2 and bar 4.
  morph27: { lines: ['Morph [[bar_005]] into [[bar_006]] over 27 bars, in musical order.'], bars: 27, notes: (h, n) => [h <= (n + 1) / 2 ? 'bars/bar_005' : 'bars/bar_006'] },
  mix: { lines: ['Mix [[bar_005]] and [[bar_006]].', 'Extend bar 1 to 4 bars.'], bars: 1, notes: () => ['bars/bar_005', 'bars/bar_006'] },
  take: { lines: ['Take [[phrase_002]].'], bars: 4, notes: () => ['phrases/phrase_002'] },
};
const S = {
  keep: 'Keep bars 1 to 3.', del: 'Delete bar 2.', copy: 'Copy bars 2 to 3.', moveL: 'Move bar 3 one bar left.', moveR: 'Move bar 2 one bar right.', morph: 'Morph bars 2 and 3 across 3 bars.',
  mix: 'Mix bars 2 and 3.', extR: 'Extend bar 2 to 3 bars.', extI: 'Extend bar 2 to 3 bars and put them at the end.', del1: 'Delete bar 1.', keep25: 'Keep bars 2 to 5.', copy12: 'Copy bars 1 to 2.', mix13: 'Mix bars 1 and 3.', mix12: 'Mix bars 1 and 2.', morph12: 'Morph bars 1 and 2 across 2 bars.',
};
const CASES = [
  // one step of every kind after the Extend head
  ...Object.entries({ keep: [S.keep], del: [S.del], copy: [S.copy], moveL: [S.moveL], moveR: [S.moveR], morph: [S.morph], mix: [S.mix], extR: [S.extR], extI: [S.extI] }).map(([k, steps]) => ({ name: `extend+${k}`, head: 'extend', steps })),
  // two steps, mixed orders
  { name: 'extend+del,mix', head: 'extend', steps: [S.del, S.mix12] }, { name: 'extend+copy,moveL', head: 'extend', steps: [S.copy12, S.moveL] }, { name: 'extend+mix,del1', head: 'extend', steps: [S.mix, S.del1] },
  { name: 'extend+morph,copy', head: 'extend', steps: [S.morph, S.copy12] }, { name: 'extend+extR,keep25', head: 'extend', steps: [S.extR, S.keep25] }, { name: 'extend+moveR,morph12', head: 'extend', steps: [S.moveR, S.morph12] },
  { name: 'extend+extI,del1', head: 'extend', steps: [S.extI, S.del1] }, { name: 'extend+keep,mix13', head: 'extend', steps: [S.keep, S.mix13] },
  // three steps
  { name: 'extend+del,copy,mix', head: 'extend', steps: [S.del, S.copy12, S.mix13] }, { name: 'extend+mix,moveL,extR', head: 'extend', steps: [S.mix, S.moveL, S.extR] }, { name: 'extend+morph,del1,copy12', head: 'extend', steps: [S.morph, S.del1, S.copy12] },
  { name: 'extend+extI,keep25,moveR', head: 'extend', steps: [S.extI, S.keep25, S.moveR] }, { name: 'extend+copy,morph12,del1', head: 'extend', steps: [S.copy12, S.morph12, S.del1] }, { name: 'extend+keep,extR,mix12', head: 'extend', steps: [S.keep, S.extR, S.mix12] },
  // the other heads
  { name: 'morph27+del2and4', head: 'morph27', steps: ['Delete bar 2 and bar 4.'] }, { name: 'morph27+del', head: 'morph27', steps: [S.del] },
  { name: 'morph+del', head: 'morph', steps: [S.del] }, { name: 'morph+mix,copy', head: 'morph', steps: [S.mix, S.copy12] }, { name: 'morph+moveL,morph,del1', head: 'morph', steps: [S.moveL, S.morph12, S.del1] },
  { name: 'mix+mix', head: 'mix', steps: [S.mix] }, { name: 'mix+del,copy', head: 'mix', steps: [S.del, S.copy12] },
  { name: 'take+del', head: 'take', steps: [S.del] }, { name: 'take+mix,moveL', head: 'take', steps: [S.mix, S.moveL] }, { name: 'take+extI,del1,copy12', head: 'take', steps: [S.extI, S.del1, S.copy12] },
].filter((c, i) => (ONLY === null || new RegExp(ONLY).test(c.name)) && (!QUICK || i % 2 === 0));

/** The phrase note the list model writes for these canonical sentences (the planAppend of each typed step, as the composer does). */
async function noteOf(lines) {
  let list = [];
  for (const typed of lines) { const plan = await L.planAppend(list, 'phrase', L.drawSeeds([typed], 'phrase', () => 7), { vault: VAULT }); if (!plan.ok) throw new Error(`${typed}: ${plan.message}`); list = plan.list; }
  const rp = L.replayGrammar(list, 'phrase', { vault: VAULT });
  if (rp.stop !== null) throw new Error(`${lines.join(' | ')}: ${rp.stop.message}`);
  const w = writeListNote(noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_001', 'phrase', { params: rp.params, list: rp.list });
  if (!w.ok) throw new Error(w.message);
  return w.text;
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

const MOD = { meta: 4, ctrl: 2, shift: 8, alt: 1 };
const lineList = `(() => [...document.querySelectorAll('.forge-inspector-body li')].map((li) => (li.querySelector('span') ? li.querySelector('span').textContent : li.textContent)))()`;
const bodyText = `((document.querySelector('.forge-inspector-body') || {}).textContent || '')`;
const wordsOf = (positions) => (positions.length === 1 ? `bar ${positions[0]}` : `bars ${positions.slice(0, -1).join(', ')} and ${positions[positions.length - 1]}`);

const verdict = { everyBarPinsAndNamesANote: true, neverCouldNotBeMapped: true, barsAreDrawn: true, madeBarsSayTheirStep: true, carriedBarsNameTheirNote: true, barWordClickInsertsPosition: true, barWordClickPinsNothing: true, noConsoleErrors: true };
const numbers = {}; const bad = {};
const fail = (v, why) => { verdict[v] = false; (bad[v] ??= []).push(why); };

for (const [ci, c] of CASES.entries()) {
  const head = HEADS[c.head];
  const text = await noteOf([...head.lines, ...c.steps]);
  const parsed = readPhraseNote(text);
  if (parsed.ok === false) { fail('barsAreDrawn', `${c.name}: ${parsed.message}`); continue; }
  const ops = (parsed.value.ops ?? []).filter(isStructureOp);
  const model = modelSteps(head.bars, ops);
  const q = await openPage({ dir: OUT, width: 1040, height: 800, pageHtml: page, routes });
  try {
    await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, barHost: true, phrase: ${JSON.stringify(text)}, bar: ${JSON.stringify(BAR5)}, bars: { bar_006: ${JSON.stringify(BAR6)} }, phrases: { phrase_002: ${JSON.stringify(SRC_PHRASE)} }, path: 'phrases/phrase_001.md', name: 'phrase_001' })`);
    for (let w = 0; w < 40000; w += 100) { if (await q.ev(`!!document.querySelector('.forge-rhythm-score-host svg g.measure')`)) break; await sleep(100); }
    await sleep(2500);
    const n = await q.ev(`(() => { const all = [...document.querySelectorAll('svg')].filter((x) => x.querySelector('g.measure')); const s = all.sort((p, r) => r.querySelectorAll('g.measure').length - p.querySelectorAll('g.measure').length)[0]; const host = s ? (s.closest('.forge-rhythm-score-host') ?? s.parentElement) : null; return host ? host.querySelectorAll('g.measure').length : 0; })()`);
    const before = await q.ev(bodyText);
    if (/could not be mapped/.test(before)) fail('neverCouldNotBeMapped', `${c.name}: before any click: ${before.slice(0, 160)}`);
    if (n !== model.length) fail('barsAreDrawn', `${c.name}: the SVG has ${n} bars, the steps leave ${model.length}`);
    const rec = { bars: n, expected: model.length, pins: [], inserted: [] };
    const centers = await q.ev(`(() => { const all = [...document.querySelectorAll('svg')].filter((x) => x.querySelector('g.measure')); const s = all.sort((p, r) => r.querySelectorAll('g.measure').length - p.querySelectorAll('g.measure').length)[0]; const host = s ? (s.closest('.forge-rhythm-score-host') ?? s.parentElement) : null; return host ? [...host.querySelectorAll('g.measure')].map((m) => m.id) : []; })()`);
    const centerOf = async (id) => q.ev(`(() => { const m = document.getElementById(${JSON.stringify(id)}); if (!m) return null; m.scrollIntoView({ block: 'center', inline: 'center' }); const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
    // 1. the empty composer: a real click on EVERY bar pins it
    for (const [i, id] of centers.entries()) {
      const b = await centerOf(id);
      if (!b) { fail('everyBarPinsAndNamesANote', `${c.name}: bar ${i + 1} (${id}) has no box`); continue; }
      await q.click(b.x, b.y); await sleep(120);
      const lines = await q.ev(lineList); const body = await q.ev(bodyText);
      rec.pins.push(lines);
      const m = model[i];
      if (lines[0] !== `bar ${i + 1} of ${n}`) fail('everyBarPinsAndNamesANote', `${c.name}: bar ${i + 1}: lines ${JSON.stringify(lines)}`);
      else if (!lines.some((l) => /^from (bars|phrases)\//.test(l) || /^from (bar_|phrase_)/.test(l) || /^made by step \d+: /.test(l))) fail('everyBarPinsAndNamesANote', `${c.name}: bar ${i + 1} names no note: ${JSON.stringify(lines)}`);
      if (/could not be mapped/.test(body)) fail('neverCouldNotBeMapped', `${c.name}: after a click on bar ${i + 1}`);
      if (m && m.made !== null) {
        const s = m.made.step;
        if (!lines.includes(`made by step ${s}: ${structureSentence(ops[s - 1])}`) || !lines.includes(`from ${wordsOf(m.made.from)} as ${m.made.from.length === 1 ? 'it was' : 'they were'} before step ${s}`)) fail('madeBarsSayTheirStep', `${c.name}: bar ${i + 1}: ${JSON.stringify(lines)}`);
      } else if (m) {
        const notes = head.notes(m.head, head.bars).map((x) => `from ${x.split('/').pop()}`);
        if (!notes.every((x) => lines.includes(x))) fail('carriedBarsNameTheirNote', `${c.name}: bar ${i + 1}: wanted ${JSON.stringify(notes)} in ${JSON.stringify(lines)}`);
      }
      if (ci % 4 === 0 && i === Math.max(0, model.findIndex((x) => x.made !== null))) { await q.ev(`(() => { const e = document.querySelector('.forge-inspector'); if (e) e.scrollIntoView({ block: 'end' }); })()`); await sleep(150); await q.shot(path.join(SHOTS, `inspector-${c.name.replace(/[^a-z0-9+,]/gi, '_')}-bar${i + 1}.png`), { x: 0, y: 0, width: 1000, height: 760 }); }          // the stack of the first bar a step made (bar 1 when none), with the Score above it
    }
    // 2. a bar word in the composer: a real click on a bar inserts " bar N" (the position), pins nothing
    const pinnedNow = () => q.ev(`(() => { const e = document.querySelector('.forge-artifact-pinned'); return e ? e.id : null; })()`);
    const pinBefore = await pinnedNow();
    const typeWord = async (word) => { await q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.select(); })()`); await q.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await q.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }); await q.send('Input.insertText', { text: word }); await sleep(100); };
    const verbs = ['Delete', ...(ci % 3 === 0 ? ['Move', 'Copy', 'Keep'] : [])];
    for (const verb of verbs) {
      const wanted = ci % 3 === 0 || verb === 'Delete' ? centers.map((_, i) => i) : [0, n - 1];
      for (const i of [...new Set(wanted)]) {
        await typeWord(verb);
        const b = await centerOf(centers[i]); if (!b) continue;
        await q.click(b.x, b.y); await sleep(200);
        const v = await q.ev(`document.querySelector('.forge-prompt-box-text').value`);
        rec.inserted.push(v);
        if (v !== `${verb} bar ${i + 1}`) fail('barWordClickInsertsPosition', `${c.name}: ${verb}, bar ${i + 1} of ${n}: the field says ${JSON.stringify(v)}`);
      }
    }
    if ((await pinnedNow()) !== pinBefore) fail('barWordClickPinsNothing', `${c.name}: a bar-word click pinned`);
    const errors = (await q.ev('window.__errors.slice()')).filter((e) => !/sounds could not be loaded|\(void 0\) is not a constructor/.test(e));
    if (errors.length > 0) fail('noConsoleErrors', `${c.name}: ${errors[0].slice(0, 200)}`);
    numbers[c.name] = rec;
    console.log(`${c.name}: ${n} bars (steps leave ${model.length}), ${rec.pins.length} pins, ${rec.inserted.length} word clicks${Object.values(bad).flat().some((x) => x.startsWith(c.name + ':')) ? '  <- PROBLEM' : ''}`);
  } finally { q.close(); }
}
fs.writeFileSync(path.join(OUT, 'inspector-steps-numbers.json'), JSON.stringify({ numbers, bad }, null, 1));
console.log(JSON.stringify(verdict, null, 1));
for (const [v, whys] of Object.entries(bad)) console.log(`${v}: ${whys.length} problem(s), first: ${whys[0]}`);
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts over ${CASES.length} phrases, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}`);
process.exit(ok ? 0 : 1);
