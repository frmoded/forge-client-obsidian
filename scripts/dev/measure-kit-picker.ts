// 2026-11-05-1181 (score_first M10c): the Beat Box's KIT PICKER in real headless Chrome under Obsidian's own app.css - the real Beat Box tab (RhythmEditView) hosting the real widget in its sandboxed iframe, the real score-first
// check (forge.toml), the real kit notes (written by kit-core.ts's own writer). Both editions (music and lean). Everything is read from the widget's DOM through the DevTools DOM tree (the iframe is opaque-origin) and acted on
// there; a native <select> popup cannot be opened in headless Chrome, so a pick sets the select's value and fires the `change` event the browser fires for a pick - the widget's own handler does the rest.
// What is measured, and the verdicts (each can fail; the CONTROLS must):
//   * a score-first vault, the starter bar (kick, snare): the kit dropdown is on screen in the toolbar row, lists rock then latin, rock selected; "Add instrument" offers hihat (the rock kit's only channel not yet a row);
//     picking latin: it offers bell, claves, conga_high, conga_low; picking conga_high adds the row, and the bar note on disk then holds `conga_high` among its channels and NO word of a kit;
//   * a score-first vault, a bar with only a bell: rock offers kick, snare, hihat; latin offers claves, conga_high, conga_low;
//   * the toolbar fits the pane (nothing overflows sideways) and the kit dropdown and "Add instrument" share one row;
//   * CONTROL 1: a vault that is NOT score-first (same kit notes in it): no kit dropdown, "Add instrument" lists every channel not shown - the check "kit dropdown is on screen" must read FALSE there;
//   * CONTROL 2: the latin check applied to the rock-selected snapshot must read FALSE (a comparator that cannot fail proves nothing).
// Build and run (from the client repo root; <dir> holds app.css, plugin-styles.css, harness-music.js and harness-lean.js):
//   node scripts/dev/asar-cat.mjs "$HOME/Library/Application Support/obsidian/obsidian-<newest>.asar" app.css <dir>/app.css; cp styles.css <dir>/plugin-styles.css
//   OUT=<dir>/harness-music.js EDITION=music node scripts/dev/browser/build.mjs; OUT=<dir>/harness-lean.js EDITION=lean node scripts/dev/browser/build.mjs
//   [RHYTHM_BOX_WIDGET_FILE=<rhythm_box.html>] node scripts/dev/measure-kit-picker.ts <dir>      (writes <dir>/kit-picker-measurements.json and <dir>/shots/kit-picker-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { newKitNote } from '../../src/kit-core.ts';
import { engine, compute } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const WIDGET_FILE = process.env.RHYTHM_BOX_WIDGET_FILE ?? new URL('../../assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html', import.meta.url).pathname;
const WIDGET = fs.readFileSync(WIDGET_FILE, 'utf8');
const PLAYGROUND_TOML = fs.readFileSync(new URL('../../test/fixtures/score-first/music-playground.forge.toml', import.meta.url), 'utf8');
const row = (hits: number[]) => Array.from({ length: 16 }, (_, i) => hits.includes(i));
const noteOf = (channels: Record<string, boolean[]>) => `---\ntype: data\ncontent_type: json\ndescription: "bar_001"\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels }, null, 2)}\n\`\`\`\n`;
const STARTER = noteOf({ kick: row([0, 8]), snare: row([4, 12]) });
const BELL_ONLY = noteOf({ bell: row([0, 4, 8, 12]) });
const KITS: Array<[string, string]> = [
  ['latin', newKitNote({ kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] })],
  ['rock', newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] })],
];
const py = await engine();         // the live Score above the Beat Box (a score-first tab) asks the REAL engine behind /compute
const routes = {
  'POST /compute': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, title } = JSON.parse(body);
    try { const payload = compute(py, data, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const W = Number(process.env.PANE_W ?? 700);
const page = (harness: string) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-rhythm-edit" style="width:${W}px;height:800px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-rhythm-edit-view" id="pane" style="flex:1 1 0;min-height:0"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="${harness}"></script></body></html>`;

interface Select { present: boolean; shown: boolean; options: string[]; value: string | null; box: { top: number; left: number; width: number; height: number } | null }
interface Snap { kitPick: Select; add: Select; rows: string[]; overflowX: number }

async function study(harness: string, label: string, opts: { note: string; toml: string | null; kits: Array<[string, string]> }) {
  const p = await openPage({ dir: root, width: W + 60, height: 880, pageHtml: page(harness), routes });
  const call = async (nodeId: number, fn: string) => {
    const o = (await p.send('DOM.resolveNode', { nodeId })).result.object;
    const r = await p.send('Runtime.callFunctionOn', { objectId: o.objectId, functionDeclaration: fn, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result.result.value;
  };
  const byId = async (id: string) => p.findNode((n: any, a: any) => n.nodeName === 'SELECT' && a.id === id);
  const select = async (id: string): Promise<Select> => {
    const n = await byId(id);
    if (!n) return { present: false, shown: false, options: [], value: null, box: null };
    return call(n.nodeId, `function () { const r = this.getBoundingClientRect(); let hidden = false; for (let e = this; e && e.tagName !== 'BODY'; e = e.parentElement) if (getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') hidden = true;   /* what is COMPUTED on screen, never the attribute */
      return { present: true, shown: !hidden && this.getClientRects().length > 0 && r.width > 0, options: [...this.options].map((o) => o.value), value: this.value, box: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } }; }`);
  };
  const pick = async (id: string, value: string) => { const n = await byId(id); await call(n.nodeId, `function () { this.value = ${JSON.stringify(value)}; this.dispatchEvent(new Event('change', { bubbles: true })); }`); await sleep(250); };
  const snap = async (): Promise<Snap> => {
    const rowsNode = await p.findNode((n: any, a: any) => a.id === 'grid');
    const rows: string[] = rowsNode ? await call(rowsNode.nodeId, `function () { return [...this.querySelectorAll('.channel-row .step')].map((e) => e.getAttribute('data-channel')).filter((c, i, a) => a.indexOf(c) === i); }`) : [];
    return { kitPick: await select('kitPick'), add: await select('addInstrument'), rows, overflowX: await p.ev(`(() => { const pane = document.getElementById('pane'); return pane.scrollWidth - pane.clientWidth; })()`) };
  };
  const out: any = { label };
  try {
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(opts.note)}, widget: ${JSON.stringify(WIDGET)}, toml: ${JSON.stringify(opts.toml)}, kits: ${JSON.stringify(opts.kits)} })`);
    for (let w = 0; w < 15000; w += 100) { if ((await byId('addInstrument')) && (await select('addInstrument')).options.length > 0) break; await sleep(100); }
    await sleep(500);
    out.start = await snap();
    await p.shot(path.join(SHOTS, `kit-picker-${label}-start.png`), { x: 0, y: 0, width: W + 60, height: 800 });
    if (out.start.kitPick.shown) {
      await pick('kitPick', 'latin');
      out.latin = await snap();
      await p.shot(path.join(SHOTS, `kit-picker-${label}-latin.png`), { x: 0, y: 0, width: W + 60, height: 800 });
      await pick('kitPick', 'rock');
      out.rock = await snap();
      await pick('kitPick', 'latin');
      if (opts.note === STARTER) {
        await pick('addInstrument', 'conga_high');
        for (let w = 0; w < 6000; w += 100) { if (/conga_high/.test(await p.ev('window.__note()'))) break; await sleep(100); }   // the tab's autosave writes the bar
        out.afterAdd = await snap();
        out.noteAfter = await p.ev('window.__note()');
        await p.shot(path.join(SHOTS, `kit-picker-${label}-added.png`), { x: 0, y: 0, width: W + 60, height: 800 });
      }
    } else {
      await pick('addInstrument', 'conga_low');       // the unchanged widget still adds from the full menu
      for (let w = 0; w < 6000; w += 100) { if (/conga_low/.test(await p.ev('window.__note()'))) break; await sleep(100); }
      out.afterAdd = await snap();
      out.noteAfter = await p.ev('window.__note()');
    }
    out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player/.test(e));
  } finally { p.close(); }
  return out;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const kitDropdownShown = (s: Snap) => s.kitPick.present && s.kitPick.shown;
const offers = (s: Snap) => s.add.options.filter(Boolean);
const channelsOf = (note: string) => Object.keys(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(note)![1]).channels);
const sameRow = (s: Snap) => !!s.kitPick.box && !!s.add.box && Math.abs(s.kitPick.box.top - s.add.box.top) <= 4 && s.kitPick.box.width > 0 && s.add.box.width > 0;

const results: any[] = [];
for (const edition of ['music', 'lean'] as const) {
  const harness = `harness-${edition}.js`;
  const sf = await study(harness, `${edition}-score-first`, { note: STARTER, toml: PLAYGROUND_TOML, kits: KITS });
  const bell = await study(harness, `${edition}-score-first-bell`, { note: BELL_ONLY, toml: PLAYGROUND_TOML, kits: KITS });
  const plain = await study(harness, `${edition}-plain`, { note: STARTER, toml: null, kits: KITS });
  const v: Record<string, boolean> = {
    'a score-first vault shows the kit dropdown': kitDropdownShown(sf.start),
    'it lists rock then latin, rock selected': eq(sf.start.kitPick.options, ['rock', 'latin']) && sf.start.kitPick.value === 'rock',
    'rock on the starter bar offers hihat (kick and snare are rows)': eq(offers(sf.start), ['hihat']),
    'latin offers the four percussion channels': !!sf.latin && eq(offers(sf.latin), ['bell', 'claves', 'conga_high', 'conga_low']),
    'back to rock offers hihat again': !!sf.rock && eq(offers(sf.rock), ['hihat']),
    'picking conga_high adds the row and the bar note on disk holds conga_high': !!sf.afterAdd && sf.afterAdd.rows.includes('conga_high') && eq(channelsOf(sf.noteAfter), ['kick', 'snare', 'conga_high']),
    'the saved bar has no word of a kit': !!sf.noteAfter && !/latin|rock|kit/i.test(sf.noteAfter.replace(/^---[\s\S]*?---/, '').replace(/"description":[^\n]*/, '')),
    'a bell-only bar: rock offers kick, snare, hihat': !!bell.rock && eq(offers(bell.rock), ['kick', 'snare', 'hihat']),
    'a bell-only bar: latin offers claves, conga_high, conga_low': !!bell.latin && eq(offers(bell.latin), ['claves', 'conga_high', 'conga_low']),
    'the toolbar fits the pane (no sideways overflow) and the kit dropdown shares a row with Add instrument': !!sf.latin && sf.latin.overflowX <= 0 && sameRow(sf.latin),
    'CONTROL 1: a vault that is not score-first has no kit dropdown (the same check reads false there) and offers every channel not shown': kitDropdownShown(plain.start) === false && eq(offers(plain.start), ['hihat', 'bell', 'claves', 'conga_high', 'conga_low']),
    'CONTROL 1b: and it adds from the full menu, the bar holds conga_low': !!plain.afterAdd && eq(channelsOf(plain.noteAfter), ['kick', 'snare', 'conga_low']),
    'CONTROL 2: the latin check applied to the rock snapshot reads false (the comparator can fail)': !!sf.rock && eq(offers(sf.rock), ['bell', 'claves', 'conga_high', 'conga_low']) === false,
    'no console errors in the page': [...sf.errors, ...bell.errors, ...plain.errors].length === 0,
  };
  results.push({ edition, verdicts: v, sf, bell, plain });
  for (const [k, ok] of Object.entries(v)) console.log(`${ok ? 'PASS' : 'FAIL'}  [${edition}] ${k}`);
}
fs.writeFileSync(path.join(root, 'kit-picker-measurements.json'), JSON.stringify({ widget: WIDGET_FILE, results }, null, 1));
const failed = results.flatMap((r) => Object.entries(r.verdicts).filter(([, ok]) => !ok).map(([k]) => `[${r.edition}] ${k}`));
console.log(failed.length ? `kit-picker: ${failed.length} verdict(s) FALSE` : `kit-picker: all ${results.reduce((n, r) => n + Object.keys(r.verdicts).length, 0)} verdicts true`);
process.exit(failed.length ? 1 : 0);
