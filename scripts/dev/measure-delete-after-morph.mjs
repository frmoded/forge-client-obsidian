// 2026-11-20-1004z (4b, the 1002a flow) - the driver's two lines through the REAL composer and the REAL Score in real headless Chrome: the real description controller and prompt box, the real phrase tab with Verovio, the real engine behind
// /phrase (the bundled Pyodide engine in Node), real key events (CDP). NO stand-in Score. `Morph [[bar_005]] into [[bar_006]] over 27 bars, in musical order.` then `Delete bar 2 and bar 4.` (the driver's bars were bar_001 and bar_008: the repo's fixtures
// have bar_005 and bar_006; the grammar and the engine path are the same). Verdicts: the Morph draws 27 bars; right after `Applied.` for the Delete the Score has 25 bars, it STAYS 25 after 10 seconds, the Inspector says `bar N of 25`, no `Removed:`
// line appears unless an undo is invoked; then Cmd+Z says `Removed: Delete bar 2 and bar 4.`, the Score goes back to 27 bars (the undo took the Delete back correctly), and Shift+Cmd+Z puts it back to 25; the undo trace (`window.__forgeUndoTrace`) names the
// way in (`key`) for each; no console error.   node scripts/dev/measure-delete-after-morph.mjs [--out <dir>] [--no-build]      exit 0 = every verdict true. Run it through scripts/heavy-guard.sh (Chrome + the engine).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { emptyPhraseNote } from '../../src/empty-note-core.ts';
import { noteContentFor } from '../../src/phrase-core.ts';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const HOME = os.homedir();
const OUT = arg('--out', path.join(HOME, '.forge-mem-evidence/measure/delete-after-morph')).replace(/^~/, HOME);
const APP_CSS = path.join(HOME, '.forge-mem-evidence/measure/app.css');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
fs.mkdirSync(OUT, { recursive: true });
if (!process.argv.includes('--no-build') || !fs.existsSync(path.join(OUT, 'harness-phrase.js'))) {
  execFileSync('node', [path.join(ROOT, 'scripts/dev/browser/build.mjs')], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, OUT: path.join(OUT, 'harness-phrase.js'), EDITION: 'music', ENTRY: 'entry-phrase.ts' } });
}
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(OUT, 'plugin-styles.css'));
if (fs.existsSync(APP_CSS)) fs.copyFileSync(APP_CSS, path.join(OUT, 'app.css')); else fs.writeFileSync(path.join(OUT, 'app.css'), '');
const FIX = path.join(ROOT, 'test/fixtures/score-first');
const BAR5 = fs.readFileSync(path.join(FIX, 'bar_005.md'), 'utf8'), BAR6 = fs.readFileSync(path.join(FIX, 'bar_006.md'), 'utf8');
const MORPH = 'Morph [[bar_005]] into [[bar_006]] over 27 bars, in musical order.', DELETE = 'Delete bar 2 and bar 4.';

const py = await engine();
const routes = { 'POST /phrase': async (q, r) => {
  let body = ''; for await (const ch of q) body += ch; const { data, params, title } = JSON.parse(body);
  try { const payload = computePhrase(py, data, params, title); r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload })); }
  catch (e) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); }
} };
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:1000px;height:900px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-phrase.js"></script></body></html>`;

const verdict = {}, numbers = {};
let lastStep = 'start'; let armHook = () => {}; const step = (name) => { lastStep = name; armHook(); console.log('[step]', new Date().toISOString().slice(11, 19), name); };
const q = await openPage({ dir: OUT, width: 1040, height: 960, pageHtml: page, routes });
// a hard stop: a CDP call that never answers (a page stuck in a loop) must not hold the Mac for hours (the guard's limits cover memory, not time). Progress is measured on the MONOTONIC clock (process.hrtime: it does not tick while the Mac sleeps, so a
// lid closed on battery, a "Maintenance Sleep", is not mistaken for a hang: the first two runs of this flow were "stuck" for an hour that way). Every step and every poll marks progress; 150 s of awake time without one: the page is asked WHERE it
// is (Debugger.pause: the stack it stopped in is printed), Chrome is closed, and the run exits 3.
let lastProgress = process.hrtime.bigint(); const arm = () => { lastProgress = process.hrtime.bigint(); };
const watcher = setInterval(async () => {
  if (Number(process.hrtime.bigint() - lastProgress) / 1e9 < 150) return;
  clearInterval(watcher);
  console.error(`[watchdog] no progress for 150 s awake: stuck in step "${lastStep}"`);
  try { await q.send('Debugger.enable'); void q.send('Debugger.pause'); await sleep(3000); const p = q.events.find((e) => e.method === 'Debugger.paused'); console.error('[watchdog] the page was in:', p ? p.params.callFrames.slice(0, 10).map((f) => `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}`).join(' <- ') : 'no pause event (the renderer is not answering at all)'); } catch (e) { console.error('[watchdog] could not ask the page:', String(e)); }
  try { q.close(); } catch { /* the browser is going away */ } process.exit(3);
}, 5000);
armHook = arm;
const barsDrawn = () => q.ev(`(() => { const hosts = [...document.querySelectorAll('.forge-rhythm-score-host')]; return hosts.reduce((n, h) => n + h.querySelectorAll('g.measure').length, 0); })()`);
const dialog = () => q.ev(`((document.querySelector('.forge-chat-log') || {}).textContent || '')`);
const key = async (k, code, vk, { meta = false, shift = false, text } = {}) => {
  const modifiers = (meta ? 4 : 0) | (shift ? 8 : 0);
  await q.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text !== undefined ? { text } : {}) });
  await q.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(150);
};
const sendSentence = async (text) => {
  await q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); f.select(); })()`); await key('Backspace', 'Backspace', 8);
  await q.send('Input.insertText', { text }); await sleep(100); await key('Enter', 'Enter', 13, { text: '\r' });
  await sleep(600);
  if (!/Applied/.test(await dialog()) || (await q.ev(`document.querySelector('.forge-prompt-box-text').value`)) !== '') { await key('Enter', 'Enter', 13, { text: '\r' }); await sleep(400); }      // with `Preview before applying` the second Enter applies
};
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { arm(); const v = await fn(); if (v) return Date.now() - t0; await sleep(200); } return null; };

await q.ev(`window.__mountPhrase(document.getElementById('pane'), { describe: true, barHost: true, inspector: true, showInspector: true, phrase: ${JSON.stringify(emptyPhraseNote('phrase_001'))}, bar: ${JSON.stringify(BAR5)}, bars: { bar_006: ${JSON.stringify(BAR6)} }, phrases: {}, path: 'phrases/phrase_001.md', name: 'phrase_001' })`);
await waitFor(() => q.ev(`!!document.querySelector('.forge-prompt-box-text')`), 30000);

step('morph typed');
await sendSentence(MORPH);
const tMorph = await waitFor(async () => (await barsDrawn()) === 27, 180000);
numbers.morphDrawMs = tMorph; verdict.theMorphDraws27Bars = tMorph !== null;
await q.shot(path.join(OUT, 'delete-after-morph-1-morph.png'));

step('delete typed');
await sendSentence(DELETE);
step('wait applied');
const applied = await waitFor(async () => /Applied[^]*Delete bar 2 and bar 4\./.test(await dialog()), 30000);
verdict.appliedIsSaid = applied !== null;
step('wait 25 bars');
const t0 = Date.now(); const tScore = await waitFor(async () => (await barsDrawn()) === 25, 120000);
numbers.deleteToScoreMs = tScore === null ? null : Date.now() - t0;
verdict.scoreHas25BarsAfterApplied = tScore !== null;
step('sleep 10 s');
await sleep(10000);
numbers.barsAfter10s = await barsDrawn(); verdict.scoreStays25After10Seconds = numbers.barsAfter10s === 25;
const before = await dialog(); numbers.dialogBeforeUndo = before.slice(-300);
verdict.noRemovedLineBeforeAnUndo = !/Removed:/.test(before);
step('shot 2');
await q.shot(path.join(OUT, 'delete-after-morph-2-deleted.png'));
step('inspector clicks');
// the Inspector: a real click on bar 3 says `bar 3 of 25`
step('read ids');
const ids = await q.ev(`(() => { const hosts = [...document.querySelectorAll('.forge-rhythm-score-host')]; return hosts.flatMap((h) => [...h.querySelectorAll('g.measure')].map((m) => m.id)); })()`);
const centerOf = (id) => q.ev(`(() => { const m = document.getElementById(${JSON.stringify(id)}); if (!m) return null; m.scrollIntoView({ block: 'center', inline: 'center' }); const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const lineList = `(() => [...document.querySelectorAll('.forge-inspector-body li')].map((li) => (li.querySelector('span') ? li.querySelector('span').textContent : li.textContent)))()`;
numbers.measureIds = ids.length; let said = []; for (const i of [2, 24]) { step(`click bar ${i + 1} (${ids[i]})`); const b = await centerOf(ids[i]); await q.click(b.x, b.y); await sleep(250); said.push((await q.ev(lineList))[0]); }
numbers.inspector = said; verdict.inspectorSaysBarNofTwentyFive = said[0] === 'bar 3 of 25' && said[1] === 'bar 25 of 25';

step('cmd+z');
// Cmd+Z in the empty composer takes the Delete back, correctly; the Score follows
await q.ev(`(() => { const f = document.querySelector('.forge-prompt-box-text'); f.focus(); })()`);
await key('z', 'KeyZ', 90, { meta: true });
const removed = await waitFor(async () => /Removed: Delete bar 2 and bar 4\./.test(await dialog()), 20000);
verdict.cmdZSaysRemovedAndNothingElseDid = removed !== null && (await dialog()).split('Removed:').length === 2;
const back27 = await waitFor(async () => (await barsDrawn()) === 27, 120000);
verdict.cmdZTookTheDeleteBackAndTheScoreFollows = back27 !== null;
await q.shot(path.join(OUT, 'delete-after-morph-3-undone.png'));
step('shift+cmd+z');
await q.ev(`(() => { document.querySelector('.forge-prompt-box-text').focus(); })()`);
await key('Z', 'KeyZ', 90, { meta: true, shift: true });
verdict.shiftCmdZPutsTheDeleteBack = (await waitFor(async () => (await barsDrawn()) === 25, 120000)) !== null;
const trace = await q.ev(`JSON.stringify(window.__forgeUndoTrace || null)`); numbers.undoTrace = trace;
const tr = JSON.parse(trace ?? 'null'); verdict.undoTraceNamesTheKeyBothTimes = Array.isArray(tr) && tr.length === 2 && tr[0].via === 'key' && tr[0].which === 'undo' && tr[1].via === 'key' && tr[1].which === 'redo' && tr.every((e) => e.note === 'phrase_001');
const errors = (await q.ev('window.__errors')).filter((e) => !/\[forge-player\] sounds could not be loaded/.test(e)); numbers.errors = errors.slice(0, 3);
verdict.noConsoleErrors = errors.length === 0;
clearInterval(watcher); q.close();
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
