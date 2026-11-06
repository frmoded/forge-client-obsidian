// 2026-11-06-1192: a press that starts where NO bar is (the Score box's margin, the gap between systems) and is released on a bar must not pin that bar. Real headless Chrome under Obsidian's own app.css, the REAL composition tab with its
// notebook (the surface of the 1190 investigation: selectBars is on there), the real live Score (Verovio), REAL DevTools mouse events (move, press, moves with the button down, release). The verdicts, each of which can fail:
//   * the margin point really is in no bar (its box is in none of the six bars' boxes, it is inside the Score's host) and is farther than 4 px from bar 4 (the control for the point itself);
//   * press in the margin, release on bar 4: nothing is pinned, no range is chosen (no chip);   [the old build pins bar 4: this verdict is FALSE on it]
//   * the same with bar 3 already pinned: the pin is kept;                                          [old build: bar 4]
//   * a plain click on bar 4 pins bar 4; a drag from bar 3 to bar 4 chooses bars 3-4 (the chip) and pins nothing;  [both builds]
//   * a press that starts on bar 3 and ends in the margin is unchanged (the click in the margin lets the pin go);  [both builds]
//   * a press in the margin released 3 px from where it started, still in the margin, unpins (the plain margin click).  [both builds]
// Build and run (from the client repo root; <dir> holds app.css and plugin-styles.css - see measure-kit-picker.ts for the asar line; "before" = CLIENT=<git archive of the start commit>):
//   OUT=<dir>/harness-composition.js EDITION=music ENTRY=entry-composition-notebook.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-stray-press.ts <dir>      (writes <dir>/stray-press-measurements.json and <dir>/shots/stray-press-*.png; exits 1 when a verdict is false)
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

async function study(W: number) {
  const p = await openPage({ dir: root, width: W + 60, height: 960, pageHtml: page(W), routes });
  const out: any = { width: W };
  const mouse = (type: string, x: number, y: number, extra: object = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
  const state = () => p.ev(`(() => ({
    pinned: [...document.querySelectorAll('.forge-artifact-pinned')].map((e) => e.id).sort(),
    chips: [...document.querySelectorAll('.forge-notebook-chips .forge-notebook-chip')].map((c) => c.textContent),
    tinted: [...document.querySelectorAll('.forge-selected-bar')].map((r) => r.parentNode.id).sort(),
  }))()`);
  const box = (n: number) => p.ev(`(() => { const e = document.querySelector('#ph_bar_${n}'); if (!e) return null; const r = e.getBoundingClientRect(); const pr = document.getElementById('pane').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom, inView: r.left >= pr.left - 1 && r.right <= pr.right + 1 && r.width > 0 }; })()`);
  const esc = async () => { await p.ev(`document.getElementById('pane').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(250); };
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= 6; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, { buttons: 1 });
    await mouse('mouseReleased', to.x, to.y, { buttons: 0 }); await sleep(400);
  };
  try {
    await p.ev(`window.__mountComposition(document.getElementById('pane'), { files: ${JSON.stringify(FILES)}, path: 'compositions/intro.md' })`);
    for (let w = 0; w < 40000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && document.querySelectorAll('.forge-notebook-bar').length === 6`)) break; await sleep(100); }
    await sleep(800);
    if (W < 700) { for (let i = 0; i < 2; i++) { await p.ev(`(() => { const b = document.querySelector('.forge-zoom-bar button'); if (b) b.click(); })()`); await sleep(500); } }
    await p.ev(`document.querySelector('#ph_bar_3')?.scrollIntoView({ inline: 'start', block: 'nearest' })`);
    await sleep(400);
    const b3 = await box(3), b4 = await box(4);
    out.reach = { b3, b4 };
    // a point inside the Score's host that is in none of the six bars' boxes, is NOT a player or zoom control (a press there is no Score press), and is the nearest such point to bar 4 that is at least 30 px from it (room to drag)
    out.margin = await p.ev(`(() => {
      const host = document.querySelector('.forge-rhythm-score-host'); const hr = host.getBoundingClientRect(); const pane = document.getElementById('pane').getBoundingClientRect();
      const bars = [1, 2, 3, 4, 5, 6].map((n) => document.querySelector('#ph_bar_' + n)).filter(Boolean).map((e) => e.getBoundingClientRect());
      const b4 = bars[3]; const cx = (b4.left + b4.right) / 2, cy = (b4.top + b4.bottom) / 2;
      const inBar = (x, y) => bars.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      const found = [];
      for (let x = Math.max(hr.left, pane.left) + 3; x < Math.min(hr.right, pane.right) - 3; x += 5) for (let y = hr.top + 3; y < hr.bottom - 3; y += 5) {
        if (inBar(x, y)) continue; const u = document.elementFromPoint(x, y); if (!u || !host.contains(u) || u.closest('midi-player, .forge-midi-player, .forge-zoom-bar, .forge-zoom-button, button')) continue;
        const d = Math.hypot(x - cx, y - cy); if (d >= 30) found.push({ x, y, d, under: u.tagName + '.' + String(u.getAttribute('class') || '').slice(0, 40), inHost: true, inBar: false });
      }
      found.sort((a, b) => a.d - b.d); return found[0] ?? null; })()`);
    // for the press that starts ON bar 3: a margin point whose straight line from bar 3's centre crosses no other bar (so a range cannot form on the way)
    out.margin3 = await p.ev(`(() => {
      const host = document.querySelector('.forge-rhythm-score-host'); const hr = host.getBoundingClientRect(); const pane = document.getElementById('pane').getBoundingClientRect();
      const bars = [1, 2, 3, 4, 5, 6].map((n) => document.querySelector('#ph_bar_' + n)).filter(Boolean).map((e) => e.getBoundingClientRect());
      const b3 = bars[2]; const cx = (b3.left + b3.right) / 2, cy = (b3.top + b3.bottom) / 2;
      const inBar = (x, y, skip) => bars.some((r, i) => i !== skip && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      const found = [];
      for (let x = Math.max(hr.left, pane.left) + 3; x < Math.min(hr.right, pane.right) - 3; x += 5) for (let y = hr.top + 3; y < hr.bottom - 3; y += 5) {
        if (inBar(x, y, -1)) continue; const u = document.elementFromPoint(x, y); if (!u || !host.contains(u) || u.closest('midi-player, .forge-midi-player, .forge-zoom-bar, .forge-zoom-button, button')) continue;
        const d = Math.hypot(x - cx, y - cy); if (d < 30) continue;
        let clear = true; for (let i = 1; i <= 20; i++) if (inBar(cx + ((x - cx) * i) / 20, cy + ((y - cy) * i) / 20, 2)) { clear = false; break; }
        if (clear) found.push({ x, y, d });
      }
      found.sort((a, b) => a.d - b.d); return found[0] ?? null; })()`);
    out.marginFarFromBar4 = !!(out.margin && b4) ? Math.hypot(out.margin.x - b4.x, out.margin.y - b4.y) : 0;
    const M = out.margin, at = (b: any) => ({ x: b.x, y: b.y });
    if (M && out.margin3 && b3 && b4) {
      out.start = await state();
      await drag(M, at(b4));                                   // 1 the stray press, released on bar 4
      out.A_marginToBar4 = await state();
      await p.shot(path.join(SHOTS, `stray-press-${W}-1-margin-to-bar4.png`), { x: 0, y: 0, width: W + 60, height: 900 });
      await esc();
      await p.click(b3.x, b3.y); await sleep(250);              // 2 the same with bar 3 pinned first
      out.B_pinBefore = await state();
      await drag(M, at(b4));
      out.B_marginToBar4_withPin = await state();
      await esc();
      await p.click(b4.x, b4.y); await sleep(250);              // 3 a plain click on bar 4
      out.C_plainClick = await state();
      await esc();
      await drag(at(b3), at(b4));                               // 4 a drag from bar 3 to bar 4
      out.D_barToBar = await state();
      await esc();
      await p.click(b4.x, b4.y); await sleep(250);              // 5 a press that starts on a bar and ends in the margin (a pin first, to see it let go)
      out.E_pinBefore = await state();
      await drag(at(b3), out.margin3 ?? M);                       // out of bar 3 into the margin by a line that crosses no other bar
      out.E_barToMargin = await state();
      await esc();
      await p.click(b4.x, b4.y); await sleep(250);              // 6 a margin press released 3 px away, still in the margin: the plain margin click
      out.F_pinBefore = await state();
      await drag(M, { x: M.x + 3, y: M.y });
      out.F_marginClick = await state();
    }
    out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player/.test(e));
  } catch (e: any) { out.failure = String(e?.message ?? e).slice(0, 400); } finally { p.close(); }
  return out;
}

const SECTION_CHIP = 'bars 3-4 of section 2 ([[arr_001]])';
const none = (s: any) => !!s && s.pinned.length === 0 && s.chips.length === 0;
const results: any[] = [];
for (const W of [640, 300]) {
  const o = await study(W);
  const v: Record<string, boolean> = {
    'the tab mounted and drew, bars 3 and 4 on screen (no failure)': o.failure === undefined && !!o.reach?.b3?.inView && !!o.reach?.b4?.inView,
    'CONTROL: the margin points are inside the Score and in none of the six bars, the first is more than 4 px from bar 4 and the second is reached from bar 3 without crossing another bar': !!o.margin3 && !!o.margin && o.margin.inHost === true && o.margin.inBar === false && o.marginFarFromBar4 > 4,
    'nothing is pinned and no range chosen at the start': none(o.start),
    'a REAL press in the margin, released on bar 4: NOTHING is pinned and no range is chosen': none(o.A_marginToBar4),
    'the same with bar 3 pinned first: the pin stays on bar 3': !!o.B_marginToBar4_withPin && JSON.stringify(o.B_pinBefore?.pinned) === '["ph_bar_3"]' && JSON.stringify(o.B_marginToBar4_withPin.pinned) === '["ph_bar_3"]',
    'a plain click on bar 4 pins bar 4': !!o.C_plainClick && JSON.stringify(o.C_plainClick.pinned) === '["ph_bar_4"]' && o.C_plainClick.chips.length === 0,
    [`a drag from bar 3 to bar 4 chooses the chip "${SECTION_CHIP}", tints both bars and pins nothing`]: !!o.D_barToBar && JSON.stringify(o.D_barToBar.chips) === JSON.stringify([SECTION_CHIP]) && JSON.stringify(o.D_barToBar.tinted) === '["ph_bar_3","ph_bar_4"]' && o.D_barToBar.pinned.length === 0,
    'a press that starts on bar 3 and ends in the margin is unchanged: the pin on bar 4 is let go, no range': !!o.E_barToMargin && JSON.stringify(o.E_pinBefore?.pinned) === '["ph_bar_4"]' && none(o.E_barToMargin),
    'a margin press released 3 px away (still the margin) is a plain margin click: it lets the pin go': !!o.F_marginClick && JSON.stringify(o.F_pinBefore?.pinned) === '["ph_bar_4"]' && none(o.F_marginClick),
    'no console errors in the page': (o.errors ?? []).length === 0,
  };
  results.push({ width: W, verdicts: v, ...o });
  for (const [k, ok] of Object.entries(v)) console.log(`${ok ? 'PASS' : 'FAIL'}  [${W}px] ${k}`);
}
fs.writeFileSync(path.join(root, 'stray-press-measurements.json'), JSON.stringify({ results }, null, 1));
const failed = results.flatMap((r) => Object.entries(r.verdicts).filter(([, ok]) => !ok).map(([k]) => `[${r.width}px] ${k}`));
console.log(failed.length ? `stray-press: ${failed.length} verdict(s) FALSE` : `stray-press: all ${results.reduce((n, r) => n + Object.keys(r.verdicts).length, 0)} verdicts true`);
process.exit(failed.length ? 1 : 0);
