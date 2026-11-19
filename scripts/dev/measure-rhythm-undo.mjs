// 2026-11-19-0996 (the Beat Box widget posts undo and redo) - Cmd/Ctrl+Z with the focus INSIDE the Beat Box page, in REAL headless Chrome (CDP): REAL mouse clicks on the cells, then REAL key events delivered to the iframe the clicks focused.
// 0993 made the host understand `forge-rhythm-undo` / `forge-rhythm-redo`, but the widget never posted them, so Cmd/Ctrl+Z with the grid focused did nothing (a key pressed inside an iframe never reaches the tab's own listener). 0996 adds the widget's key handler;
// this script measures it where it matters: click 3 cells, then one real Cmd+Z at a time undoes ONE gesture each (the grid is redrawn from the list), Shift+Cmd+Z / Shift+Ctrl+Z / Ctrl+Y redo one each, Ctrl+Z undoes too, a key typed in a text field of the page
// posts nothing and is not taken, plain Z and Cmd+Alt+Z post nothing, a focused swing slider undoes, and the widget's height is unchanged by all of it.
// What is REAL: src/description-apply.ts (the controller with its real undo stack, the chat panel, composer and dialog), src/bar-list-controller.ts, bar-list-core.ts, bar-grammar-core.ts, bar-list-note-core.ts, bar-box-host-core.ts (the Beat Box tab's state machine),
// the REAL styles.css, and the widget page itself (an iframe, its own keydown handler). What is a STAND-IN, said plainly (the same ones as measure-bar-list.mjs):
//   * the TAB (rhythm-edit-view.ts imports `obsidian`, so it is not bundled): its message handling (ready -> load, save -> the box host, undo / redo -> flush the box, then the controller's undoLast / redoLast, a vault `modify` that is not the widget's data -> a load that
//     redraws the widget) is restated below from the same calls; the tab's own routing of the two messages is pinned on the REAL view by src/bar-list-view-wiring.test.ts (the last tests of the file: the real widget page, the real tab, the real controller);
//   * the widget's iframe is a same-origin srcdoc iframe (the real tab uses a sandboxed blob iframe) so the page can read the cells' boxes and install a key log; every click and key is still a real event through the browser's input path;
//   * the Score above the widget is a one-line stand-in; Obsidian itself is NOT driven (the Obsidian-only questions are in the report: the focus ring after a redraw, the real Mac Cmd key).
// WRITTEN, NOT RUN by the author of this file (the supervisor runs real-Chrome scripts, one at a time, never in parallel with another Chrome job):
//   nice -n 10 node scripts/dev/measure-rhythm-undo.mjs [--widget <rhythm_box.html>] [--out <dir>]        exit 0 = every verdict true
// The widget is read from the BUNDLED vault copy (assets/vaults/music-theory/...), as measure-bar-list.mjs does: SYNC THE BUNDLE FIRST (node scripts/sync-bundled-vault.mjs music-theory); the script refuses to run against a page that has no undo handler (exit 2).
// `--widget` names another file (e.g. the sibling vault's, before the sync).
// HARNESS LESSONS (kept): every mount is a FRESH host element; no page global named like a read-only window property (never "closed", "name", "status", ...); NO backticks inside the page's template literal (this file's page text is one); no dollar-brace there either.
// Width 800 (stacked), light theme. VERDICTS (tag 800_light):
//   mount_*
//     openingWritesNothing_<tag>                   after the page and the controller are up: zero `process` calls, the note byte for byte the bar, the page loaded once, no undo or redo posted
//   undo_*  (3 REAL clicks on 3 different empty kick steps, then REAL keys with the focus in the page)
//     threeClicksAreThreeLines_<tag>               the list holds the head and 3 lines, 3 writes
//     cmdZUndoesOneGestureEach_<tag>               three real Cmd+Z, one at a time: the list has 3, 2, 1 lines; ONE write each; the page was redrawn from the note each time (a load each); the widget's own data equals the note's each time; each key was taken (defaultPrevented)
//     nothingLeftWritesNothing_<tag>               a fourth Cmd+Z (only the head is left): no write, the grid is still the note; the key was still taken (the page cannot know the list is empty)
//   redo_*
//     shiftCmdZRedoesOne_<tag>                     Shift+Cmd+Z: ONE line back (2), ONE write, the grid equals the note
//     ctrlYRedoesOne_<tag>                         Ctrl+Y: ONE more line back (3), ONE write, the grid equals the note
//     shiftCtrlZRedoesOne_<tag>                    Shift+Ctrl+Z: the last one back (4), the grid equals the note, ONE write
//     ctrlZUndoesOne_<tag>                         Ctrl+Z (not Cmd): one line off (3), ONE write
//     nothingLeftToRedoWritesNothing_<tag>         redo twice more (one line back, then nothing to redo): ONE write for the first, none for the second
//   keys_*
//     plainZAndAltCombosPostNothing_<tag>          plain z, Cmd+Alt+Z, Cmd+X and Cmd+Y on a cell: zero undo or redo posts, zero writes, none taken
//     textFieldKeepsItsOwnKeys_<tag>               a text input and a textarea added to the page and focused: Cmd+Z, Shift+Cmd+Z and Ctrl+Y post nothing, write nothing, and are NOT taken (the field's own undo is left alone)
//     sliderAndSelectUndo_<tag>                    after one more click, with the focus on the swing slider (and then on the time-signature select): a real Cmd+Z undoes that gesture (a range slider and a select have no text undo)
//   layout_*
//     widgetHeightUnchanged_<tag>                  the page's own height (its body, and its document's scroll height) before the first key and after every key above is the same number (the key handler added no markup and no style: the number says so in pixels)
//   general_*
//     noHorizontalOverflow_<tag>                   the tab, the page and the composer have no horizontal overflow
// Numbers printed (not judged): the page's body height before and after, the key log, the counts of undo / redo posts and writes.
// Screenshot: rhythm-undo-after-800-light.png (the grid after the three undos, before the redos).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/rhythm-undo')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const widgetFile = path.resolve(arg('--widget', path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html')).replace(/^~/, os.homedir()));
if (!fs.existsSync(widgetFile)) { console.error(`the Beat Box page is not at ${widgetFile}`); process.exit(2); }
const widgetText = fs.readFileSync(widgetFile, 'utf8');
if (!/forge-rhythm-undo/.test(widgetText)) { console.error(`the Beat Box page at ${widgetFile} has no undo handler: sync the bundled vault first (node scripts/sync-bundled-vault.mjs music-theory), or pass --widget <the sibling vault's rhythm_box.html>`); process.exit(2); }
const widgetJson = JSON.stringify(widgetText).replace(/<\/script/gi, '<\\/script');
const fixtures = fs.readFileSync(path.join(ROOT, 'src/test-support/bar-list-fixtures.ts'), 'utf8');
const barLiteral = /"bar_001": ("(?:[^"\\]|\\.)*")/.exec(fixtures);
if (!barLiteral) { console.error('bar_001 is not in src/test-support/bar-list-fixtures.ts'); process.exit(2); }
const barJson = JSON.stringify(JSON.parse(barLiteral[1])).replace(/<\/script/gi, '<\\/script');
const bundle = (await build({
  stdin: {
    contents: [
      "export { createDescriptionController } from './src/description-apply.ts';",
      "export { descriptionPortsFor } from './src/description-wiring.ts';",
      "export { createBarBoxHost } from './src/bar-box-host-core.ts';",
      "export { readBarLines, inspectBarNote } from './src/bar-list-note-core.ts';",
      "export { buildLoadMessage, readRhythmNote, rhythmDataEqual } from './src/rhythm-edit-core.ts';",
    ].join(' '), resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --text-accent:#705dcf; --interactive-accent:#7b6cd9; --background-modifier-border:#dadada; --background-modifier-hover:#eeeeee; --font-ui-small:13px; --font-ui-smaller:12px; --font-text-size:16px; --radius-m:8px; --radius-s:4px; --background-modifier-form-field:#ffffff; --interactive-normal:#f0f0f0; --text-on-accent:#ffffff; --size-4-2:8px; --size-4-3:12px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
.stand-in-score { margin:0; padding:6px 12px; color: var(--text-muted); font-size:12px; }
.widget-frame { width:100%; height:430px; border:0; display:block; background:#ffffff; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="position:relative;width:1100px;height:900px"><div id="host" style="height:900px;width:1100px"></div></div>
<script>${bundle}</script><script>
var WIDGET_HTML = __WIDGET__;
var BAR_TEXT = __BAR__;
var PATH = 'bars/bar_001.md';
window.setup = function (width) {
  if (window.ctl) window.ctl.dispose();
  window.notes = new Map(); window.processCalls = 0; window.writes = 0; window.loads = 0; window.posts = 0; window.undoPosts = 0; window.redoPosts = 0; window.gestures = [];
  window.startNote = BAR_TEXT; window.notes.set(PATH, BAR_TEXT);
  var old = document.getElementById('host'); var host = document.createElement('div'); host.id = 'host'; old.parentNode.replaceChild(host, old);
  host.className = 'forge-rhythm-edit-view'; host.removeAttribute('style'); host.style.height = '900px'; host.style.width = width + 'px'; host.innerHTML = '';
  document.getElementById('frame').style.width = width + 'px';
  var score = document.createElement('div'); score.className = 'forge-rhythm-edit-score stand-in-score'; score.textContent = 'Score stand-in (the engraving is drawn in Obsidian)'; host.appendChild(score);
  var frame = document.createElement('iframe'); frame.className = 'widget-frame'; frame.setAttribute('id', 'widget'); frame.srcdoc = WIDGET_HTML; host.appendChild(frame);
  window.frameEl = frame; window.hostEl = host;
  var dataOf = function (text) { var r = cp.readRhythmNote(text); return r.ok ? r.value.data : null; };
  window.dataOf = dataOf;
  var ports = cp.descriptionPortsFor({
    read: function (p) { var t = window.notes.get(p); return t === undefined ? Promise.reject(new Error('File not found')) : Promise.resolve(t); },
    process: function (p, fn) { window.processCalls++; return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) { window.notes.set(p, next); window.writes++; setTimeout(function () { window.vaultModified(); }, 0); } }); },
    basenamesIn: function (folder) { var out = []; window.notes.forEach(function (v, k) { if (k.indexOf(folder + '/') === 0) out.push(k.slice(folder.length + 1).replace(/[.]md$/, '')); }); return out; },
    panes: function () { return [{ path: PATH, contentEl: host, tab: true }]; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {}, warn: function () {},
  }, {
    askPlan: function () { return Promise.resolve({ status: 200, json: {} }); }, planConfigured: function () { return true; },
    composerMenu: function () { return { items: [{ id: 'b', label: 'New bar' }], run: function () {} }; },
  });
  window.ctl = cp.createDescriptionController(ports);
  // the TAB's message handling, restated (rhythm-edit-view.ts): ready -> load; save -> the box host; undo / redo -> flush the box, then the controller (stepList); a redraw is a load
  var sendLoad = function (data) { window.loads++; frame.contentWindow.postMessage(cp.buildLoadMessage(data, 'bar_001', 'edit', null, true, false, false, []), '*'); };
  window.box = cp.createBarBoxHost(dataOf(BAR_TEXT), {
    appendLine: function (sentence) { return window.ctl.appendLine(PATH, sentence); },
    load: function (d) { sendLoad(d); }, reload: function () { sendLoad(dataOf(window.notes.get(PATH))); window.box.loaded(dataOf(window.notes.get(PATH))); return Promise.resolve(); },
    legacySave: function () {}, setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, warn: function () {},
  });
  window.onmessage = function (e) {
    if (e.source !== frame.contentWindow) return; var m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'forge-rhythm-ready') { var d = dataOf(window.notes.get(PATH)); sendLoad(d); window.box.loaded(d); }
    else if (m.type === 'forge-rhythm-save') { window.posts++; window.box.save(m.data); }
    else if (m.type === 'forge-rhythm-current-data') { window.currentData = m.data; }
    else if (m.type === 'forge-rhythm-undo' || m.type === 'forge-rhythm-redo') {
      var undo = m.type === 'forge-rhythm-undo'; if (undo) window.undoPosts++; else window.redoPosts++;
      window.box.flush().then(function () { return undo ? window.ctl.undoLast(PATH) : window.ctl.redoLast(PATH); });
    }
  };
  // a vault 'modify' for the note: the tab compares the note with what the widget shows (own write: nothing; anything else: a reload) - restated from RhythmEditView.onNoteModified
  window.vaultModified = function () { window.ctl.modified(PATH); var now = dataOf(window.notes.get(PATH)); if (cp.rhythmDataEqual(now, window.box.current())) return; if (window.box.busy()) return; sendLoad(now); window.box.loaded(now); };
  window.ctl.inspect(PATH).then(function () { window.ctl.syncBars(); });
  return Promise.resolve();
};
window.ready = function () { return window.frameEl && window.frameEl.contentDocument && window.frameEl.contentDocument.querySelector('.step') !== null && window.loads >= 1; };
// a key log in the widget's window (bubble phase, after the page's own handler): what the page did with each key
window.logKeys = function () {
  var w = window.frameEl.contentWindow; w.__keys = [];
  w.addEventListener('keydown', function (e) { w.__keys.push({ k: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, taken: e.defaultPrevented, tag: e.target && e.target.tagName ? e.target.tagName : '' }); });
};
window.lastKey = function () { var l = window.frameEl.contentWindow.__keys; return l.length ? l[l.length - 1] : null; };
window.keyCount = function () { return window.frameEl.contentWindow.__keys.length; };
window.cellBox = function (ch, s) { var d = window.frameEl.contentDocument; var e = d.querySelector('.step[data-channel="' + ch + '"][data-step="' + s + '"]'); if (!e) return null; var r = e.getBoundingClientRect(), f = window.frameEl.getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2, w: r.width, h: r.height }; };
window.emptyKickSteps = function () { var d = window.dataOf(window.notes.get(PATH)); var out = []; d.channels.kick.forEach(function (v, i) { if (v === false) out.push(i); }); return out; };
window.askWidget = function () { window.currentData = null; window.frameEl.contentWindow.postMessage({ type: 'forge-rhythm-request-data' }, '*'); return new Promise(function (ok) { var n = 0; var t = setInterval(function () { if (window.currentData || ++n > 40) { clearInterval(t); ok(window.currentData); } }, 10); }); };
window.noteData = function () { return window.dataOf(window.notes.get(PATH)); };
window.sameBar = function () { return window.askWidget().then(function (w) { return !!w && cp.rhythmDataEqual(w, window.noteData()); }); };
window.lines = function () { var l = cp.readBarLines(window.notes.get(PATH)); return l ? l.lines : []; };
window.focusIn = function (id) { var d = window.frameEl.contentDocument; var e = d.getElementById(id); if (!e) return false; e.focus(); return d.activeElement === e; };
window.addField = function (tag, id) { var d = window.frameEl.contentDocument; var e = d.createElement(tag); if (tag === 'input') e.setAttribute('type', 'text'); e.id = id; d.body.appendChild(e); e.focus(); return d.activeElement === e; };
window.removeField = function (id) { var d = window.frameEl.contentDocument; var e = d.getElementById(id); if (e) e.remove(); };
window.pageHeight = function () { var d = window.frameEl.contentDocument; return { body: d.body.getBoundingClientRect().height, doc: d.documentElement.scrollHeight, iframe: window.frameEl.getBoundingClientRect().height }; };
window.overflow = function () { var card = document.querySelector('.forge-prompt-box') || { scrollWidth: 0, clientWidth: 0 }; var d = window.frameEl.contentDocument; return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, host: window.hostEl.scrollWidth - window.hostEl.clientWidth, widget: d.documentElement.scrollWidth - d.documentElement.clientWidth, card: card.scrollWidth - card.clientWidth }; };
</script>`.replace('__WIDGET__', () => widgetJson).replace('__BAR__', () => barJson);
const p = await openPage({ dir: '/', width: 1200, height: 980, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const MOD = { meta: 4, ctrl: 2, shift: 8, alt: 1 };
const key = async (k, code, vk, mods = 0) => { await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(300); };
const CMD_Z = () => key('z', 'KeyZ', 90, MOD.meta);
const CTRL_Z = () => key('z', 'KeyZ', 90, MOD.ctrl);
const CMD_SHIFT_Z = () => key('Z', 'KeyZ', 90, MOD.meta | MOD.shift);
const CTRL_SHIFT_Z = () => key('Z', 'KeyZ', 90, MOD.ctrl | MOD.shift);
const CTRL_Y = () => key('y', 'KeyY', 89, MOD.ctrl);
const mountedAndLoaded = async () => { for (let i = 0; i < 80; i++) { if ((await ev(`!!document.querySelector('.forge-prompt-box-text') && ready()`)) === true) return true; await sleep(100); } return false; };
const clickCell = async (ch, s) => { const b = await ev(`cellBox(${JSON.stringify(ch)}, ${s})`); await p.click(b.x, b.y); await sleep(200); };
const state = () => ev(`({ lines: lines().length, writes: writes, loads: loads, undo: undoPosts, redo: redoPosts, keys: keyCount() })`);
const W = 800, tag = `${W}_light`;

// ---- mount ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await ev(`setup(${W})`); const up = await mountedAndLoaded(); await sleep(400); await ev('logKeys()');
const opened = await ev(`({ calls: processCalls, same: notes.get(PATH) === startNote, loads: loads, undo: undoPosts, redo: redoPosts })`);
verdict[`openingWritesNothing_${tag}`] = up === true && opened.calls === 0 && opened.same === true && opened.loads === 1 && opened.undo === 0 && opened.redo === 0;
const height0 = await ev('pageHeight()');
const heights = [height0];

// ---- 3 real clicks, then real keys in the page ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const empties = (await ev('emptyKickSteps()')).slice(0, 3);
for (const s of empties) await clickCell('kick', s);
await sleep(300);
let st = await state();
verdict[`threeClicksAreThreeLines_${tag}`] = empties.length === 3 && st.lines === 4 && st.writes === 3 && st.undo === 0;
const seen = []; const base = st;
for (let i = 0; i < 3; i++) {
  const before = await state(); await CMD_Z(); await sleep(250); const after = await state(); const lk = await ev('lastKey()');
  seen.push({ lines: after.lines, writes: after.writes - before.writes, loads: after.loads - before.loads, undo: after.undo - before.undo, same: await ev('sameBar()'), taken: lk && lk.taken === true && lk.meta === true });
  heights.push(await ev('pageHeight()'));
}
numbers[`undoSteps@${tag}`] = seen;
verdict[`cmdZUndoesOneGestureEach_${tag}`] = seen.map((x) => x.lines).join() === '3,2,1' && seen.every((x) => x.writes === 1 && x.loads >= 1 && x.undo === 1 && x.same === true && x.taken === true);
await p.shot(path.join(OUT, `rhythm-undo-after-${W}-light.png`), { x: 0, y: 0, width: W, height: 900 });
{
  const before = await state(); await CMD_Z(); await sleep(250); const after = await state(); const lk = await ev('lastKey()');
  verdict[`nothingLeftWritesNothing_${tag}`] = after.writes === before.writes && after.lines === 1 && (await ev('sameBar()')) === true && !!lk && lk.taken === true && after.undo === before.undo + 1;
}
const step = async (fn, label) => { const before = await state(); await fn(); await sleep(250); const after = await state(); heights.push(await ev('pageHeight()')); numbers[`${label}@${tag}`] = { lines: after.lines, writes: after.writes - before.writes, undo: after.undo - before.undo, redo: after.redo - before.redo }; return { before, after, same: await ev('sameBar()') }; };
{
  const r = await step(CMD_SHIFT_Z, 'shiftCmdZ');
  verdict[`shiftCmdZRedoesOne_${tag}`] = r.after.lines === 2 && r.after.writes - r.before.writes === 1 && r.after.redo === r.before.redo + 1 && r.same === true;
}
{
  const r = await step(CTRL_Y, 'ctrlY');
  verdict[`ctrlYRedoesOne_${tag}`] = r.after.lines === 3 && r.after.writes - r.before.writes === 1 && r.after.redo === r.before.redo + 1 && r.same === true;
}
{
  const r = await step(CTRL_SHIFT_Z, 'shiftCtrlZ');
  verdict[`shiftCtrlZRedoesOne_${tag}`] = r.after.lines === 4 && r.after.writes - r.before.writes === 1 && r.after.redo === r.before.redo + 1 && r.same === true;
}
{
  const r = await step(CTRL_Z, 'ctrlZ');
  verdict[`ctrlZUndoesOne_${tag}`] = r.after.lines === 3 && r.after.writes - r.before.writes === 1 && r.after.undo === r.before.undo + 1 && r.same === true;
}
{
  const a = await step(CTRL_Y, 'redoOne'); const b = await step(CTRL_Y, 'redoNothing');
  verdict[`nothingLeftToRedoWritesNothing_${tag}`] = a.after.lines === 4 && a.after.writes - a.before.writes === 1 && b.after.lines === 4 && b.after.writes === b.before.writes && b.same === true;
}

// ---- keys that must do nothing -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
  const before = await state(); const k0 = before.keys;
  await clickCell('kick', 14); await sleep(200);                                                  // a real click: the focus is on the grid again (one more line, one more write: the baseline)
  const b1 = await state();
  await key('z', 'KeyZ', 90, 0); await key('z', 'KeyZ', 90, MOD.meta | MOD.alt); await key('x', 'KeyX', 88, MOD.meta); await key('y', 'KeyY', 89, MOD.meta);
  const a1 = await state();
  const log = await ev(`window.frameEl.contentWindow.__keys.slice(${b1.keys})`);
  numbers[`ignoredKeys@${tag}`] = log;
  verdict[`plainZAndAltCombosPostNothing_${tag}`] = log.length === 4 && log.every((x) => x.taken === false) && a1.undo === b1.undo && a1.redo === b1.redo && a1.writes === b1.writes && a1.lines === b1.lines && b1.lines === before.lines + 1 && k0 >= 0;
}
{
  const out = [];
  for (const tagName of ['input', 'textarea']) {
    const focused = await ev(`addField(${JSON.stringify(tagName)}, 'probe_field')`);
    const before = await state();
    await CMD_Z(); await CMD_SHIFT_Z(); await CTRL_Y();
    const after = await state(); const log = await ev(`window.frameEl.contentWindow.__keys.slice(${before.keys})`);
    out.push({ tag: tagName, focused: focused, keys: log.length, taken: log.filter((x) => x.taken).length, fieldTag: log.length ? log[0].tag : '', undo: after.undo - before.undo, redo: after.redo - before.redo, writes: after.writes - before.writes });
    await ev(`removeField('probe_field')`);
  }
  numbers[`textField@${tag}`] = out;
  verdict[`textFieldKeepsItsOwnKeys_${tag}`] = out.every((x) => x.focused === true && x.keys === 3 && x.taken === 0 && x.undo === 0 && x.redo === 0 && x.writes === 0 && x.fieldTag.toLowerCase() === x.tag);
}
{
  const ok = [];
  for (const id of ['swing', 'timeSig']) {
    await clickCell('snare', 3); await sleep(200);                                               // a gesture to take back (one line more)
    const b = await state(); const f = await ev(`focusIn(${JSON.stringify(id)})`);
    await CMD_Z(); await sleep(250); const a = await state(); const lk = await ev('lastKey()');
    ok.push({ id: id, focused: f, lines: a.lines - b.lines, writes: a.writes - b.writes, taken: !!lk && lk.taken === true && lk.tag.toLowerCase() === (id === 'swing' ? 'input' : 'select'), same: await ev('sameBar()') });
  }
  numbers[`sliderAndSelect@${tag}`] = ok;
  verdict[`sliderAndSelectUndo_${tag}`] = ok.every((x) => x.focused === true && x.lines === -1 && x.writes === 1 && x.taken === true && x.same === true);
}

// ---- the page's height, and overflow ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
numbers[`pageHeights@${tag}`] = { first: heights[0], last: heights[heights.length - 1], distinctBodyHeights: [...new Set(heights.map((h) => Math.round(h.body * 100) / 100))] };
verdict[`widgetHeightUnchanged_${tag}`] = heights.every((h) => Math.abs(h.body - height0.body) < 0.5 && Math.abs(h.doc - height0.doc) < 1);
const over = await ev('overflow()');
numbers[`overflow@${tag}`] = over;
verdict[`noHorizontalOverflow_${tag}`] = over.page <= 0 && over.host <= 0 && over.widget <= 0 && over.card <= 0;

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
