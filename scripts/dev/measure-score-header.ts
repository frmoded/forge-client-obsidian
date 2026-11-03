// 2026-11-03-1155-91 (score_first polish R1): the Score panel's header (status line, message line, and the "Forge log (N)" button that used to sit under them) in real headless Chrome under Obsidian's own app.css,
// BEFORE (the commit this change starts from) and AFTER, with the real Beat Box tab, real Verovio, the real engine behind /compute. What is measured: the panel's children, the geometry of each, and what MOVES when a
// message arrives and when the next draw clears it. The verdicts, each of which can fail (the CONTROL moves a header element on purpose and the same comparator must see it):
//   * after: no button in the DOM, the panel's header is [status, message line]; the status and the message line sit exactly where they sat before (nothing above moves);
//   * the ONLY thing that moved is what was below the button: the score host moved up by the button's row (before: top_after + button height + margins);
//   * an error line pushes the score down by its own height and the draw that clears it puts the score back to the very same top (no residue); nothing overflows the pane's width.
// Build the two harnesses and run (from the client repo root; <dir>/after and <dir>/before each hold harness-m4.js, app.css and plugin-styles.css = that build's styles.css):
//   OUT=<dir>/after/harness-m4.js EDITION=music ENTRY=entry-m4.ts node scripts/dev/browser/build.mjs
//   CLIENT=<git archive of the start commit> OUT=<dir>/before/harness-m4.js EDITION=music ENTRY=entry-m4.ts node scripts/dev/browser/build.mjs
//   node scripts/dev/measure-score-header.ts <dir>          (writes <dir>/score-header-measurements.json and <dir>/shots/score-header-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, compute } from '../../src/test-support/real-rhythm-engine.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const root = process.argv[2];
const SHOTS = path.join(root, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const WIDGET = fs.readFileSync(new URL('../../assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html', import.meta.url), 'utf8');
const PLAYGROUND_TOML = fs.readFileSync(new URL('../../test/fixtures/score-first/music-playground.forge.toml', import.meta.url), 'utf8');
const STARTER = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: {
  kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false] } };
const NOTE = `---\ntype: data\ncontent_type: json\ndescription: "bar_001"\n---\n\n\`\`\`json\n${JSON.stringify(STARTER, null, 2)}\n\`\`\`\n`;
const py = await engine();
const routes = {
  'POST /compute': async (q: any, r: any) => {
    let body = ''; for await (const ch of q) body += ch;
    const { data, title } = JSON.parse(body);
    try { const payload = compute(py, data, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
    catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
  },
};
const W = Number(process.env.PANE_W ?? 700);
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-rhythm-edit" style="width:${W}px;height:800px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-rhythm-edit-view" id="pane" style="flex:1 1 0;min-height:0"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-m4.js"></script></body></html>`;

/** One build's header: the panel's children and rects, with no message, with an error line, and after the next good draw. */
async function study(dir: string, label: string) {
  const p = await openPage({ dir, width: W + 60, height: 880, pageHtml: page, routes });
  const rect = (sel: string) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { top: +r.top.toFixed(2), left: +r.left.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2), mt: parseFloat(cs.marginTop), mb: parseFloat(cs.marginBottom) }; })()`);
  const snap = async () => ({
    children: await p.ev(`[...document.querySelector('.forge-rhythm-edit-score').children].map((c) => c.className.split(' ')[0]).slice(0, 5)`),
    status: await rect('.forge-rhythm-edit-score-status'),
    message: await rect('.forge-rhythm-score-message'),
    button: await rect('.forge-rhythm-forge-log'),
    host: await rect('.forge-rhythm-score-host'),
    buttons: await p.ev(`document.querySelectorAll('.forge-rhythm-edit-score button').length`),
    logButtons: await p.ev(`document.querySelectorAll('.forge-rhythm-forge-log').length`),
    overflowX: await p.ev(`(() => { const pane = document.getElementById('pane'); return pane.scrollWidth - pane.clientWidth; })()`),
  });
  const out: any = { label };
  try {
    await p.ev(`window.__messageDelivery.setScoreFirst(true); true`);
    await p.ev(`window.__mountTab(document.getElementById('pane'), { note: ${JSON.stringify(NOTE)}, widget: ${JSON.stringify(WIDGET)}, toml: ${JSON.stringify(PLAYGROUND_TOML)} })`);
    for (let w = 0; w < 20000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg')`)) break; await sleep(100); }
    await sleep(600);
    out.quiet = await snap();
    await p.shot(path.join(SHOTS, `score-header-${label}-quiet.png`), { x: 0, y: 0, width: W + 60, height: 420 });
    await p.ev(`window.__messageDelivery.postToScore({ text: 'Compute failed: the engine said boom, and the sentence is long enough to need a second line in a narrow pane of the Score.', kind: 'error', line: { persistence: 'until-next-draw' } }); true`);
    await sleep(200);
    out.error = await snap();
    await p.shot(path.join(SHOTS, `score-header-${label}-error.png`), { x: 0, y: 0, width: W + 60, height: 420 });
    await p.ev(`window.__view.scoreArea.showNow(${JSON.stringify({ ...STARTER, tempo_bpm: 104 })})`);
    for (let w = 0; w < 8000; w += 100) { if (!(await p.ev(`!!document.querySelector('.forge-rhythm-score-message.is-error')`))) break; await sleep(100); }
    await sleep(500);
    out.cleared = await snap();
    out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/resume|AudioContext|SoundFont|is not a constructor|forge-player/.test(e));
  } finally { p.close(); }
  return out;
}

const after = await study(path.join(root, 'after'), 'after');
const before = await study(path.join(root, 'before'), 'before');
const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
const buttonRow = before.quiet.button ? before.quiet.button.height + before.quiet.button.mt + before.quiet.button.mb : 0;
/** The comparator the verdicts use: do these two snapshots put the status and message line in the same place? (the CONTROL feeds it a snapshot with the status moved by 7px: it must say no) */
const sameHeader = (a: any, b: any) => near(a.status.top, b.status.top) && near(a.status.height, b.status.height) && near(a.message.top, b.message.top) && near(a.message.left, b.message.left);
const control = structuredClone(after.quiet); control.status.top += 7;

const verdicts: Record<string, boolean> = {
  'before: the button was there (non-vacuity: this is the build that had it)': before.quiet.button !== null && before.quiet.logButtons === 1,
  'after: no "Forge log" button in the DOM (quiet, with an error, after the draw); every OTHER button of the panel is still there (the same count as before, less the one)': after.quiet.button === null && after.quiet.logButtons === 0 && after.error.logButtons === 0 && after.cleared.logButtons === 0 && after.quiet.buttons === before.quiet.buttons - 1 && after.quiet.buttons > 0,
  'after: the panel\'s header is [status, message line] and then the Score': JSON.stringify(after.quiet.children.slice(0, 2)) === JSON.stringify(['forge-rhythm-edit-score-status', 'forge-rhythm-score-message']),
  'nothing above the button moved: the status line and the message line sit exactly where they sat (quiet and with an error)': sameHeader(after.quiet, before.quiet) && sameHeader(after.error, before.error),
  'the Score moved up by exactly the button\'s row (and by nothing else)': buttonRow > 0 && near(before.quiet.host.top - after.quiet.host.top, buttonRow),
  'with an error line the Score moves down by the line\'s own height, in both builds': near(after.error.host.top - after.quiet.host.top, after.error.message.height) && near(before.error.host.top - before.quiet.host.top, before.error.message.height) && after.error.message.height > 0,
  'the draw that clears the error puts everything back to the quiet positions (no residue)': near(after.cleared.host.top, after.quiet.host.top) && sameHeader(after.cleared, after.quiet),
  'nothing overflows the pane\'s width': after.quiet.overflowX <= 0 && after.error.overflowX <= 0 && after.cleared.overflowX <= 0,
  'CONTROL: the comparator sees a status line moved by 7px (so "nothing moved" can fail)': sameHeader(control, before.quiet) === false && sameHeader(after.quiet, after.quiet) === true,
  'no page errors in either run': after.errors.length === 0 && before.errors.length === 0,
};
const result = { W, before, after, buttonRow, verdicts };
fs.writeFileSync(path.join(root, 'score-header-measurements.json'), JSON.stringify(result, null, 2));
for (const [k, v] of Object.entries(verdicts)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
console.log(`button row before: ${buttonRow}px; score top before ${before.quiet.host.top} -> after ${after.quiet.host.top}`);
process.exit(Object.values(verdicts).every(Boolean) ? 0 : 1);
