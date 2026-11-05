// 2026-11-05-1183 (score_first M17c): the NOTEBOOK below a composition's Score in real headless Chrome under Obsidian's own app.css, at 640 and 300 px wide: the real composition tab (CompositionView), the real live Score (Verovio), the real
// notebook component and core over an in-memory vault, the real engine behind /phrase. The only double is the planning service. What is done and read: a REAL mouse drag across bars 3 and 4 of the Score (they are bars of section 2, an
// arrangement), the chip, the tint on the Score, Run with the op picker (a new transform phrase whose source is the composition appears, the composition's note is byte for byte what it was), a typed request the service cannot do
// (nothing is written, one sentence says so). The verdicts, each of which can fail; the CONTROL must:
//   * the notebook is the last thing in the tab, after the Score, the header and the tree; the page does not overflow sideways; there is one number button per bar;
//   * a drag from bar 3 to bar 4 makes the chip read "bars 3-4 of section 2 ([[arr_001]])" and tints exactly those two bars; a click on a number then a Shift-click on another bar extends it, the chip naming both sections;
//   * Run (Thin out) makes ONE new phrase in phrases/ (kind transform, source compositions/intro, ops on bars 3-4) and ONE cell in notebook/, opens the new phrase, lists the cell, and never writes the composition;
//   * a request the service cannot do changes nothing (no new note, the vault byte-identical) and the message line says so;
//   * CONTROL: the phrase tab's chip text for the same selection ("bars 3 to 4") is NOT what the composition tab shows: the check tells the two apart.
// Build and run (from the client repo root; <dir> holds app.css and plugin-styles.css - see measure-kit-picker.ts for the asar line):
//   OUT=<dir>/harness-composition.js EDITION=music ENTRY=entry-composition-notebook.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-composition-notebook.ts <dir>      (writes <dir>/composition-notebook-measurements.json and <dir>/shots/composition-notebook-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { newCompositionNote } from '../../src/composition-core.ts';
import { newArrangementNote } from '../../src/arrangement-core.ts';
import { newKitNote } from '../../src/kit-core.ts';
import { noteContentFor, type PhraseParams } from '../../src/phrase-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const extend = (bars: number): PhraseParams => ({ kind: 'extend', source: 'bar_005', bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const FILES: Record<string, string> = {
  'bars/bar_005.md': BAR, 'bars/README.md': '# bars\n',
  'phrases/phrase_003.md': noteContentFor('phrase_003', extend(2)), 'phrases/phrase_004.md': noteContentFor('phrase_004', extend(4)),
  'kits/rock.md': newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] }),
  'arrangements/arr_001.md': newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_004' }] }),
  'compositions/intro.md': newCompositionNote('intro', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }, { source: 'arrangements/arr_001' }] }),          // section 1 = bars 1-2, section 2 = bars 3-6
};
const py = await engine();
const routes = {
  'POST /phrase': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, params, title } = JSON.parse(body);
    try { const payload = computePhrase(py, data, params, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const page = (W: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-composition-view" style="width:${W}px;height:900px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-composition-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-composition.js"></script></body></html>`;

const MOD_SHIFT = 8;
async function study(W: number) {
  const p = await openPage({ dir: root, width: W + 60, height: 960, pageHtml: page(W), routes });
  const out: any = { width: W };
  const mouse = (type: string, x: number, y: number, extra: object = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
  const state = () => p.ev(`(() => {
    const pane = document.getElementById('pane'); const kids = [...pane.children].map((c) => c.className.toString().split(' ')[0]);
    return {
      kids, overflowX: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, pane.scrollWidth - pane.clientWidth),
      numbers: document.querySelectorAll('.forge-notebook-bar').length,
      chips: [...document.querySelectorAll('.forge-notebook-chips .forge-notebook-chip')].map((c) => c.textContent),
      pressed: [...document.querySelectorAll('.forge-notebook-bar')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.textContent)),
      tinted: [...document.querySelectorAll('.forge-selected-bar')].map((r) => r.parentNode.id).sort(),
      message: (() => { const m = document.querySelector('.forge-notebook-message'); return m ? { text: m.textContent, role: m.getAttribute('role') } : null; })(),
      cells: [...document.querySelectorAll('.forge-notebook-cell')].map((c) => ({ id: c.getAttribute('data-cell'), chip: c.querySelector('.forge-notebook-chip')?.textContent })),
      zoom: document.querySelector('.forge-zoom-bar') ? [...document.querySelectorAll('.forge-zoom-bar button')].map((b) => b.textContent) : null,
    }; })()`);
  const box = (n: number) => p.ev(`(() => { const e = document.querySelector('#ph_bar_${n}'); if (!e) return null; const r = e.getBoundingClientRect(); const pr = document.getElementById('pane').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, inView: r.left >= pr.left - 1 && r.right <= pr.right + 1 && r.width > 0 }; })()`);
  try {
    await p.ev(`window.__mountComposition(document.getElementById('pane'), { files: ${JSON.stringify(FILES)}, path: 'compositions/intro.md' })`);
    for (let w = 0; w < 40000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && document.querySelectorAll('.forge-notebook-bar').length === 6`)) break; await sleep(100); }
    await sleep(800);
    out.mounted = await state();
    await p.shot(path.join(SHOTS, `composition-notebook-${W}-0-mounted.png`), { x: 0, y: 0, width: W + 60, height: 900 });
    // bring bars 3 and 4 (section 2) into view the way a person does: zoom out when the Score is wider than the pane, then scroll the Score so the two bars are on screen together
    if (W < 700) { for (let i = 0; i < 2; i++) { await p.ev(`(() => { const b = document.querySelector('.forge-zoom-bar button'); if (b) b.click(); })()`); await sleep(500); } }
    await p.ev(`document.querySelector('#ph_bar_3')?.scrollIntoView({ inline: 'start', block: 'nearest' })`);
    await sleep(400);
    const b3 = await box(3), b4 = await box(4);
    out.reach = { b3, b4 };
    if (b3 && b4) {
      await mouse('mouseMoved', b3.x, b3.y); await mouse('mousePressed', b3.x, b3.y);
      await mouse('mouseMoved', b4.l + 8, b4.y, { buttons: 1 }); await mouse('mouseMoved', b4.x, b4.y, { buttons: 1 });
      await mouse('mouseReleased', b4.x, b4.y, { buttons: 0 });
      await sleep(400);
    }
    out.afterDrag = await state();
    await p.shot(path.join(SHOTS, `composition-notebook-${W}-1-drag-3-4.png`), { x: 0, y: 0, width: W + 60, height: 900 });
    // a click on number 1, then Shift-click on 5: bars 1..5 across both sections - through the notebook's own numbers
    await p.ev(`(() => { const bs = [...document.querySelectorAll('.forge-notebook-bar')]; bs[0].click(); bs[4].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); })()`);
    await sleep(300);
    out.afterShift = await state();
    // back to bars 3-4 (a drag by the notebook's own range), then Run with the op picker
    await p.ev(`(() => { const pane = document.getElementById('pane'); pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); const bs = [...document.querySelectorAll('.forge-notebook-bar')]; bs[2].click(); bs[3].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); })()`);
    await sleep(300);
    out.beforeRun = await state();
    out.compositionBefore = await p.ev(`window.__store.get('compositions/intro.md')`);
    out.phrasesBefore = await p.ev(`[...window.__store.keys()].filter((k) => k.startsWith('phrases/')).sort()`);
    await p.ev(`document.querySelector('.forge-notebook-run').click()`);
    for (let w = 0; w < 10000; w += 100) { if ((await p.ev(`[...window.__store.keys()].some((k) => k.startsWith('notebook/cell_'))`)) === true) break; await sleep(100); }
    await sleep(600);
    out.afterRun = await state();
    out.phrasesAfter = await p.ev(`[...window.__store.keys()].filter((k) => k.startsWith('phrases/')).sort()`);
    out.cellFiles = await p.ev(`[...window.__store.keys()].filter((k) => k.startsWith('notebook/cell_')).sort()`);
    out.newPhrase = await p.ev(`(() => { const k = [...window.__store.keys()].filter((k) => /^phrases\\/phrase_00[5-9]/.test(k)).sort()[0]; return k ? { path: k, text: window.__store.get(k) } : null; })()`);
    out.opened = await p.ev('window.__opened.slice()');
    out.compositionAfter = await p.ev(`window.__store.get('compositions/intro.md')`);
    await p.shot(path.join(SHOTS, `composition-notebook-${W}-2-after-run.png`), { x: 0, y: 0, width: W + 60, height: 900 });
    // a request the service cannot do
    await p.ev(`window.__answer = { status: 200, json: { ok: false, parsed_ok: false, plan: null, error: 'I can only thin out or double up bars.' } }`);
    out.storeBeforeAsk = await p.ev(`JSON.stringify([...window.__store])`);
    await p.ev(`(() => { const r = document.querySelector('.forge-notebook-request'); r.value = 'play it backwards'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
    await p.ev(`document.querySelector('.forge-notebook-run').click()`);
    await sleep(1200);
    out.afterAsk = await state();
    out.storeAfterAsk = await p.ev(`JSON.stringify([...window.__store])`);
    out.asked = await p.ev('window.__asked.slice()');
    await p.shot(path.join(SHOTS, `composition-notebook-${W}-3-refused-request.png`), { x: 0, y: 0, width: W + 60, height: 900 });
    out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player/.test(e));
  } catch (e: any) { out.failure = String(e?.message ?? e).slice(0, 400); } finally { p.close(); }
  return out;
}

const SECTION_CHIP = 'bars 3-4 of section 2 ([[arr_001]])';
const results: any[] = [];
for (const W of [640, 300]) {
  const o = await study(W);
  const m = o.mounted, d = o.afterDrag, a = o.afterRun;
  const v: Record<string, boolean> = {
    'the tab mounted and drew (no failure)': o.failure === undefined && !!m,
    'the notebook is the LAST thing in the tab (after the Score, the header and the tree), one number per bar, no sideways overflow': !!m && m.kids.at(-1) === 'forge-notebook' && m.numbers === 6 && m.overflowX <= 0,
    'bars 3 and 4 (section 2) are both on screen to drag across': !!o.reach?.b3?.inView && !!o.reach?.b4?.inView,
    [`a REAL drag from bar 3 to bar 4 makes the chip "${SECTION_CHIP}"`]: !!d && JSON.stringify(d.chips) === JSON.stringify([SECTION_CHIP]) && JSON.stringify(d.pressed) === '[3,4]',
    'and tints exactly those two bars on the Score': !!d && JSON.stringify(d.tinted) === JSON.stringify(['ph_bar_3', 'ph_bar_4']),
    'a click on 1 and a Shift-click on 5 give one chip naming both sections': !!o.afterShift && JSON.stringify(o.afterShift.chips) === JSON.stringify(['section 1 ([[phrase_003]]); bars 3-5 of section 2 ([[arr_001]])']),
    'Run (Thin out) on bars 3-4: ONE new phrase (a transform of the composition, ops on bars 3-4) and ONE cell, the new phrase opened, the cell listed': !!o.newPhrase && o.phrasesAfter.length === o.phrasesBefore.length + 1 && o.cellFiles.length === 1 && /"kind": "transform"/.test(o.newPhrase.text) && /"source": "compositions\/intro"/.test(o.newPhrase.text) && /"first": 3,\s*"last": 4/.test(o.newPhrase.text) && o.opened.includes(`${o.newPhrase.path}`) && !!a && a.cells.length === 1 && a.cells[0].chip === SECTION_CHIP,
    'the composition\'s note is byte for byte what it was after Run': o.compositionBefore === o.compositionAfter && typeof o.compositionAfter === 'string',
    'a request the service cannot do changes NOTHING (the vault is byte-identical) and the message line says so': o.storeBeforeAsk === o.storeAfterAsk && !!o.afterAsk?.message && o.afterAsk.message.text.length > 10 && o.afterAsk.message.role === 'alert' && o.asked.length === 1 && o.asked[0].selection.phrase === 'compositions/intro',
    'CONTROL: the phrase tab\'s chip text for the same selection ("bars 3 to 4") is NOT what the composition tab shows (the check tells them apart)': !!d && d.chips.length === 1 && d.chips[0] !== 'bars 3 to 4',
    'no console errors in the page': (o.errors ?? []).length === 0,
  };
  results.push({ width: W, verdicts: v, ...o, compositionBefore: undefined, compositionAfter: undefined, storeBeforeAsk: undefined, storeAfterAsk: undefined });
  for (const [k, ok] of Object.entries(v)) console.log(`${ok ? 'PASS' : 'FAIL'}  [${W}px] ${k}`);
}
fs.writeFileSync(path.join(root, 'composition-notebook-measurements.json'), JSON.stringify({ results }, null, 1));
const failed = results.flatMap((r) => Object.entries(r.verdicts).filter(([, ok]) => !ok).map(([k]) => `[${r.width}px] ${k}`));
console.log(failed.length ? `composition-notebook: ${failed.length} verdict(s) FALSE` : `composition-notebook: all ${results.reduce((n, r) => n + Object.keys(r.verdicts).length, 0)} verdicts true`);
process.exit(failed.length ? 1 : 0);
