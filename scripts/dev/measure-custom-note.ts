// 2026-11-02-1155 (score_first M16b) in real Chrome: a CUSTOM note on the real phrase tab, at a wide and a NARROW pane - the banner (the description bar's custom tone), the disabled strip with its sentence, the Score the Python makes (the real
// engine: Verovio draws what `_forge_run_custom_bars` returned), a run that FAILS (the Score stays on screen, DIMMED, one sentence with the line of the Python), a run that never ends (stopped at the REAL 10 s limit, the sentence), and the chips of
// the notes the Python calls. Per state: nothing overflows the pane, no sentence or button is clipped, the controls are disabled. Writes shots/custom-note-*.png and custom-note-measurements.json; exits 1 when a verdict is false. Build and run from the repo root:
//   OUT=<dir>/harness-custom-note.js EDITION=music ENTRY=entry-custom-note.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-custom-note.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { asCustom } from '../../src/phrase-notes-core.ts';
import { noteContentFor, PHRASE_DEFAULTS } from '../../src/phrase-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const py = await engine();
try { py.FS.mkdir('/bundle/user-vault/bars'); } catch { /* exists */ }
py.globals.set('_m_rel', 'bars/bar_005.md'); py.globals.set('_m_body', BAR); py.runPython('_forge_sync_user_file(_m_rel, _m_body)');

const body = async (q: any): Promise<any> => { let b = ''; for await (const ch of q) b += ch; return JSON.parse(b); };
const send = (r: any, o: unknown): void => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
const routes = {
  'POST /phrase': async (q: any, r: any) => { const { data, params, title } = await body(q); try { send(r, { payload: computePhrase(py, data, params, title) }); } catch (e: any) { send(r, { __error: String(e.message || e) }); } },
  'POST /run': async (q: any, r: any) => {
    const { python, name, limitS } = await body(q);
    py.globals.set('_m_py', python); py.globals.set('_m_name', name); py.globals.set('_m_s', limitS);
    const proxy = py.runPython('_forge_run_custom_bars(_m_py, _m_name, _m_s)'); const o = proxy.toJs({ dict_converter: Object.fromEntries }); proxy.destroy?.();
    send(r, o.ok ? { ok: true, bars: JSON.parse(o.bars_json) } : { ok: false, timedOut: o.timed_out === true, error: String(o.error ?? ''), line: Number(o.line ?? 0) });
  },
};
const page = (w: number) => `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:${w}px;height:760px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)}</script>
<script src="harness-custom-note.js"></script></body></html>`;

const EXTEND = { kind: 'extend' as const, source: 'bar_005', ...PHRASE_DEFAULTS, bars: 4 };
const generated = noteContentFor('phrase_001', EXTEND);
const withPython = (python: string): string => { const was = (generated.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]; return asCustom(generated.replace(was, python)); };
const GOOD = "def compute(context):\n  a = bar_005()\n  b = bar_005()\n  return [a, b, a, b]";
const FAILS = "def compute(context):\n  x = 1\n  return x / 0";
const LOOPS = "def compute(context):\n  while True:\n    pass";

const probe = `(() => {
  const pane = document.getElementById('pane').getBoundingClientRect();
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, overflowsPane: r.right > pane.right + 0.5 || r.left < pane.left - 0.5, clipped: e.scrollWidth > e.clientWidth + 1 }; };
  const host = document.querySelector('.forge-rhythm-score-host');
  return { bar: box('.forge-description-bar'), barText: document.querySelector('.forge-description-message')?.textContent ?? null, barIsCustom: !!document.querySelector('.forge-description-bar.is-custom'),
    status: box('.forge-phrase-status'), statusText: document.querySelector('.forge-phrase-status')?.textContent ?? null,
    scoreStatus: box('.forge-rhythm-edit-score-status'), scoreStatusText: document.querySelector('.forge-rhythm-edit-score-status')?.textContent ?? null,
    svgs: document.querySelectorAll('.forge-rhythm-score-host svg').length, measures: document.querySelectorAll('.forge-rhythm-score-host svg g.measure').length,
    dimmed: !!document.querySelector('.forge-rhythm-score-host-stale'), opacity: host ? getComputedStyle(host.closest('.forge-rhythm-score-host-stale') ?? host).opacity : null,
    controlsDisabled: ['.forge-phrase-bars', '.forge-phrase-style', '.forge-phrase-tempo'].map((s) => document.querySelector(s)).filter(Boolean).every((e) => e.disabled),
    chips: [...document.querySelectorAll('.forge-structure-chip')].map((c) => c.textContent),
    paneScrollsSideways: document.getElementById('pane').scrollWidth > document.getElementById('pane').clientWidth + 1, errors: window.__errors.slice() };
})()`;
const waitScore = async (p: any, ms = 20000) => { for (let w = 0; w < ms; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) return true; await sleep(100); } return false; };
const waitText = async (p: any, re: string, ms = 30000) => { for (let w = 0; w < ms; w += 100) { if (await p.ev(`new RegExp(${JSON.stringify(re)}).test(document.getElementById('pane').textContent)`)) return true; await sleep(100); } return false; };

const out: any = {};
for (const width of [760, 300]) {
  const p = await openPage({ dir: here, width: width + 40, height: 820, pageHtml: page(width), routes });
  const key = `w${width}`; out[key] = {};
  try {
    await p.ev(`window.__mountCustom(document.getElementById('pane'), { note: ${JSON.stringify(withPython(GOOD))}, bars: { bar_005: ${JSON.stringify(BAR)} } })`);
    out[key].drawn = await waitScore(p); await sleep(400);
    out[key].good = await p.ev(probe);
    await p.shot(path.join(SHOTS, `custom-note-good-${width}.png`));
    // a run that fails: the Score stays, dimmed, one sentence with the line of the Python
    await p.ev(`window.__editCustom(${JSON.stringify(withPython(FAILS))}); 0`);
    out[key].failSaid = await waitText(p, 'division by zero'); await sleep(300);
    out[key].fails = await p.ev(probe);
    await p.shot(path.join(SHOTS, `custom-note-error-${width}.png`));
    if (width === 760) {
      // a run that never ends: the REAL limit (10 s) stops it
      const t0 = performance.now();
      await p.ev(`window.__editCustom(${JSON.stringify(withPython(LOOPS))}); 0`);
      out[key].limitSaid = await waitText(p, 'time limit', 40000); out[key].limitSeconds = +(((performance.now() - t0) / 1000).toFixed(1));
      out[key].loops = await p.ev(probe);
      await p.shot(path.join(SHOTS, `custom-note-limit-${width}.png`));
      out[key].runs = await p.ev('window.__runs.map((r) => ({ ms: r.ms, ok: r.out.ok, timedOut: r.out.timedOut === true, line: r.out.line }))');
    }
  } finally { await p.close?.(); }
}
const fine = (b: any) => b === null || b.h === 0 || (b.overflowsPane === false && b.clipped === false);               // an empty element has no box
const calm = (s: any) => fine(s.bar) && s.paneScrollsSideways === false && fine(s.status) && fine(s.scoreStatus) && s.errors.filter((e: string) => !/\[forge-player\]/.test(e)).length === 0;   // the soundfont is not fetched in the harness
const ok = (w: any, limit: boolean) => w.drawn && calm(w.good) && w.good.barIsCustom && w.good.barText === 'Custom Python: the controls are off for this note.' && w.good.controlsDisabled && !w.good.statusText && w.good.svgs > 0 && w.good.measures === 4 && !w.good.dimmed
  && w.good.chips.length >= 2
  && w.failSaid && calm(w.fails) && w.fails.dimmed && Number(w.fails.opacity) < 0.6 && w.fails.svgs > 0 && /^Custom Python, line 3: ZeroDivisionError: division by zero\. The last good Score is kept\.$/.test(w.fails.scoreStatusText ?? '')
  && (!limit || (w.limitSaid && w.limitSeconds >= 10 && w.limitSeconds < 20 && calm(w.loops) && w.loops.dimmed && w.loops.svgs > 0 && /^Custom Python: stopped after 10 seconds \(the time limit\); it may loop forever\. The last good Score is kept\.$/.test(w.loops.scoreStatusText ?? '')));
out.verdicts = { wide: ok(out.w760, true), narrow: ok(out.w300, false) };
fs.writeFileSync(path.join(here, 'custom-note-measurements.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.verdicts));
if (!Object.values(out.verdicts).every(Boolean)) { console.log(JSON.stringify({ w760: { good: out.w760.good, fails: out.w760.fails, limit: [out.w760.limitSaid, out.w760.limitSeconds] }, w300: { good: out.w300.good, fails: out.w300.fails } }, null, 1).slice(0, 3500)); process.exit(1); }
