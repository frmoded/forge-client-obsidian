// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the Beat Box as the driver feels it, in REAL headless Chrome (CDP) with REAL mouse clicks on the REAL Beat Box page (rhythm_box.html, read from the bundled music-theory vault) and REAL key events:
// every grid click is ONE line (one `process`, one write) and the grid is the replay of the list; the click latency and the drag latency are measured; a drag across 8 cells is ONE line and ONE undo; 800 px, light and dark.
// What is REAL: src/description-apply.ts (the controller, with the real chat panel, composer and dialog), src/bar-list-controller.ts, bar-list-core.ts, bar-grammar-core.ts, bar-list-note-core.ts, bar-box-host-core.ts (the Beat Box tab's state machine), the REAL
// styles.css and Obsidian's CSS variables for a light and a dark theme, and the widget page itself (an iframe). What is a STAND-IN, said plainly:
//   * the TAB (rhythm-edit-view.ts imports `obsidian`, so it is not bundled): its message handling (ready -> load, save -> the box host, the load that redraws the widget) is restated below from the same four calls; rhythm-edit-view's own routing is pinned by
//     src/bar-list-view-wiring.test.ts on the real view;
//   * the widget's iframe is a same-origin srcdoc iframe (the real tab uses a sandboxed blob iframe) so the page can read the cells' boxes; the clicks are still real mouse events through the browser's input path;
//   * the DRAG: rhythm_box.html has NO drag-paint (a press-drag-release across cells does nothing: verdict widgetHasNoDragPaint says so, measured). The gesture mechanism the controller has (`appendLine(path, sentence, { gesture })`) is driven by a transparent
//     overlay that turns a REAL press-drag-release into one appendLine per cell entered, which is what a drag-aware widget would post; the verdicts for it are named standInDrag_*;
//   * the Score above the widget is a one-line stand-in (the engine is not run); Obsidian itself is NOT driven.
// WRITTEN, NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-bar-list.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// HARNESS LESSONS (kept): every mount is a FRESH host element; no page global named like a read-only window property (never "closed", "name", "status", ...); NO backticks inside the page's template literal (this file's page text is one); no dollar-brace there either.
// Widths: 800 (stacked) and 1100 (two columns); light and dark. NUMBERS (printed, not judged, except where a budget verdict names its limit): gridClick click->process and click->done in ms (p50, p95, max over 24 clicks), standInDrag per cell, swing drag.
//   mount_*
//     openingWritesNothing                    after the page, the composer and the controller are up (and a pane sync, an inspect): zero `process` calls, the note byte for byte the bar
//     composerDoesNotOverlapTheBeatBox        the composer card exists, does not overlap the widget (under it at 800 px, beside it from 900 px: the chat panel's own two layouts), is not wider than the tab, and has no horizontal overflow
//   click_*  (24 REAL clicks on 24 different cells of the grid, one after the other)
//     oneProcessAndOneWritePerClick           process calls == 24 and writes == 24
//     eachClickIsOneLine                      the list grew by exactly one line per click (the head, then 24 lines) and each is "Hit <channel> on step N." or "Clear <channel> on step N."
//     gridIsTheReplay                         after the 24 clicks the widget's own data (asked of the page) equals the data of the note, and the note's fence is the replay of its list
//     noRedrawOnAnOrdinaryClick               the widget was loaded once (the load at open): an ordinary click never redraws it
//     clickToProcessUnderBudget               p95 of (click -> the controller's `process`) is under 60 ms          [budget: the old path waited 600 ms]
//     clickToDoneUnderBudget                  p95 of (click -> appendLine resolved) is under 120 ms
//   cancel_*
//     clickingACellTwiceLeavesNoLine          the same cell clicked on and off: the list is back to the head, the note's fence is the bar as it was
//   undo_*
//     undoWalksBackOneClickAtATime            a real Cmd+Z in the EMPTY composer, 3 times: each takes one gesture back (one write each), the widget is redrawn from the note each time, the grid equals the note
//     redoPutsItBack                          a real Shift+Cmd+Z puts the last one back
//   settings_*
//     tempoClickReplacesInPlace               two real clicks on the tempo + button: the list has ONE tempo line ("Set the tempo to <n>.") and 2 writes
//     swingDragIsOneLine                      a REAL press on the swing slider, drag across it, release: the page posted many messages, the list gained ONE line "Set the swing to <n> percent." after the quiet time, and ONE write
//   transform_*
//     shiftIsOneLine                          a real click on the shift-left button: one line "Shift every channel one step to the left." and the grid equals the note
//   drag_*
//     widgetHasNoDragPaint                    a REAL press, move across 8 cells and release on the real widget (no overlay): nothing was posted, nothing written
//     standInDrag_isOneLine                   the overlay drag across 8 cells: the list grew by ONE line ("Hit hihat on steps 1, 2, 3, 4, 5, 6, 7 and 8.") whatever the number of cells
//     standInDrag_isOneUndo                   a real Cmd+Z in the empty composer takes the whole drag back
//     standInDrag_latency                     p95 of (a cell entered -> its write done) is under 120 ms; the numbers are printed
//   composer_*
//     typedSentenceWorks                      real typing "Hit snare on step 2", Enter (preview, nothing written), Enter (one write): the grid is redrawn and shows it
//     unreadableSentenceIsRefusedInWords      "Frobnicate the kick" then Enter: the dialog says it does not know how to read it, the service was asked zero times, nothing written
//   hand_*
//     handEditedListIsFollowed                a hand edit of `lines:` (an added line, and an unreadable line after it) in the note: ONE write, the grid redrawn, the unreadable line named in plain muted words (no red)
//   general_*
//     noRedAnywhere / noTooltipAnywhere / noHorizontalOverflow
// Screenshots (light and dark, each width): barlist-after-clicks-<w>-<theme>.png, barlist-after-drag-<w>-<theme>.png, barlist-hand-edit-<w>-<theme>.png.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/bar-list')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const widgetFile = path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html');
if (!fs.existsSync(widgetFile)) { console.error(`the Beat Box page is not at ${widgetFile}`); process.exit(2); }
const widgetJson = JSON.stringify(fs.readFileSync(widgetFile, 'utf8')).replace(/<\/script/gi, '<\\/script');
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
      "export { replayBar } from './src/bar-list-core.ts';",
      "export { buildLoadMessage, readRhythmNote, rhythmDataEqual } from './src/rhythm-edit-core.ts';",
      "export { planNewBar } from './src/score-first-core.ts';",
    ].join(' '), resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --text-accent:#705dcf; --interactive-accent:#7b6cd9; --background-modifier-border:#dadada; --background-modifier-hover:#eeeeee; --font-ui-small:13px; --font-ui-smaller:12px; --font-text-size:16px; --radius-m:8px; --radius-s:4px; --background-modifier-form-field:#ffffff; --interactive-normal:#f0f0f0; --text-on-accent:#ffffff; --size-4-2:8px; --size-4-3:12px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --text-accent:#a99bf0; --interactive-accent:#8875ff; --background-modifier-border:#3a3a3a; --background-modifier-hover:#2f2f2f; --font-ui-small:13px; --font-ui-smaller:12px; --font-text-size:16px; --radius-m:8px; --radius-s:4px; --background-modifier-form-field:#2a2a2a; --interactive-normal:#363636; --text-on-accent:#ffffff; --size-4-2:8px; --size-4-3:12px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
.stand-in-score { margin:0; padding:6px 12px; color: var(--text-muted); font-size:12px; }
.widget-frame { width:100%; height:430px; border:0; display:block; background:#ffffff; }
.drag-overlay { position:absolute; left:0; top:0; z-index:5; background:transparent; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="position:relative;width:1100px;height:900px"><div id="host" style="height:900px;width:1100px"></div></div>
<script>${bundle}</script><script>
var WIDGET_HTML = __WIDGET__;
var BAR_TEXT = __BAR__;
var PATH = 'bars/bar_001.md';
window.keys = [];
window.setup = function (width, noteKind) {
  if (window.ctl) window.ctl.dispose();
  window.notes = new Map(); window.processCalls = 0; window.writes = 0; window.serviceCalls = 0; window.loads = 0; window.posts = 0; window.gestures = []; window.dragLog = [];
  var note = noteKind === 'new' ? cp.planNewBar({ existingBasenames: [], exists: function () { return false; } }).content.split('bar_001').join('bar_001') : BAR_TEXT;
  window.startNote = note; window.notes.set(PATH, note);
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
    process: function (p, fn) { window.processCalls++; var t1 = performance.now(); return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) { window.notes.set(p, next); window.writes++; setTimeout(function () { window.vaultModified(); }, 0); } window.lastProcess = t1; }); },
    basenamesIn: function (folder) { var out = []; window.notes.forEach(function (v, k) { if (k.indexOf(folder + '/') === 0) out.push(k.slice(folder.length + 1).replace(/[.]md$/, '')); }); return out; },
    panes: function () { return [{ path: PATH, contentEl: host, tab: true }]; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {}, warn: function () {},
  }, {
    askPlan: function () { window.serviceCalls++; return Promise.resolve({ status: 200, json: {} }); }, planConfigured: function () { return true; },
    composerAutoApply: function () { return false; },      // 2026-11-20-1002 (deliberate): the setting Preview before applying is ON in this harness: the flows below type a sentence and press Enter TWICE (the plugin default is ONE Enter: measure-duplicate-followups.mjs has the one-Enter verdicts)
    composerMenu: function () { return { items: [{ id: 'b', label: 'New bar' }], run: function () {} }; },
  });
  window.ctl = cp.createDescriptionController(ports);
  // the TAB's message handling, restated (rhythm-edit-view.ts): ready -> load; save -> the box host; a redraw is a load
  var sendLoad = function (data) { window.loads++; frame.contentWindow.postMessage(cp.buildLoadMessage(data, 'bar_001', 'edit', null, true, false, false, []), '*'); };
  window.box = cp.createBarBoxHost(dataOf(note), {
    appendLine: function (sentence) {
      var g = { saveAt: performance.now(), sentence: sentence, processAt: null, doneAt: null };
      window.gestures.push(g);
      var before = window.processCalls;
      return window.ctl.appendLine(PATH, sentence).then(function (r) { g.doneAt = performance.now(); g.processAt = window.lastProcess; g.processCalls = window.processCalls - before; return r; });
    },
    load: function (d) { sendLoad(d); }, reload: function () { sendLoad(dataOf(window.notes.get(PATH))); window.box.loaded(dataOf(window.notes.get(PATH))); return Promise.resolve(); },
    legacySave: function () {}, setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, warn: function () {},
  });
  window.onmessage = function (e) {
    if (e.source !== frame.contentWindow) return; var m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'forge-rhythm-ready') { var d = dataOf(window.notes.get(PATH)); sendLoad(d); window.box.loaded(d); }
    else if (m.type === 'forge-rhythm-save') { window.posts++; window.box.save(m.data); }
    else if (m.type === 'forge-rhythm-current-data') { window.currentData = m.data; }
  };
  // a vault 'modify' for the note: the tab compares the note with what the widget shows (own write: nothing; anything else: a reload) - restated from RhythmEditView.onNoteModified
  window.vaultModified = function () { window.ctl.modified(PATH); var now = dataOf(window.notes.get(PATH)); if (cp.rhythmDataEqual(now, window.box.current())) return; if (window.box.busy()) return; sendLoad(now); window.box.loaded(now); };
  window.ctl.inspect(PATH).then(function () { window.ctl.syncBars(); });
  return Promise.resolve();
};
window.ready = function () { return window.frameEl && window.frameEl.contentDocument && window.frameEl.contentDocument.querySelector('.step') !== null && window.loads >= 1; };
window.cellBox = function (ch, s) { var d = window.frameEl.contentDocument; var e = d.querySelector('.step[data-channel="' + ch + '"][data-step="' + s + '"]'); if (!e) return null; var r = e.getBoundingClientRect(), f = window.frameEl.getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2, w: r.width, h: r.height }; };
window.elBox = function (id) { var d = window.frameEl.contentDocument; var e = d.getElementById(id); if (!e) return null; var r = e.getBoundingClientRect(), f = window.frameEl.getBoundingClientRect(); return { x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2, left: f.left + r.left, right: f.left + r.right, w: r.width, h: r.height }; };
window.rows = function () { var d = window.frameEl.contentDocument; var seen = []; [].forEach.call(d.querySelectorAll('.step'), function (e) { var c = e.getAttribute('data-channel'); if (seen.indexOf(c) < 0) seen.push(c); }); return seen; };
window.askWidget = function () { window.currentData = null; window.frameEl.contentWindow.postMessage({ type: 'forge-rhythm-request-data' }, '*'); return new Promise(function (ok) { var n = 0; var t = setInterval(function () { if (window.currentData || ++n > 40) { clearInterval(t); ok(window.currentData); } }, 10); }); };
window.noteData = function () { return window.dataOf(window.notes.get(PATH)); };
window.sameBar = function () { return window.askWidget().then(function (w) { return !!w && cp.rhythmDataEqual(w, window.noteData()); }); };
window.lines = function () { var l = cp.readBarLines(window.notes.get(PATH)); return l ? l.lines : []; };
window.fenceIsReplay = function () { var i = cp.inspectBarNote(window.notes.get(PATH)); return i.hasLines ? i.inSync && i.replay.stop === null : true; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.fieldValue = function () { var f = document.querySelector('.forge-prompt-box-text'); return f ? f.value : null; };
window.dialog = function () { return [].map.call(document.querySelectorAll('.forge-chat-msg'), function (m) { return { kind: m.getAttribute('data-kind'), text: (m.querySelector('.forge-chat-text') || {}).textContent || '' }; }); };
window.pct = function (xs, q) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
window.latency = function () { var c = [], d = []; window.gestures.forEach(function (g) { if (g.processAt !== null && g.doneAt !== null && g.clickAt) { c.push(g.processAt - g.clickAt); d.push(g.doneAt - g.clickAt); } }); return { n: c.length, process: { p50: pct(c, 0.5), p95: pct(c, 0.95), max: Math.max.apply(null, c) }, done: { p50: pct(d, 0.5), p95: pct(d, 0.95), max: Math.max.apply(null, d) } }; };
// a capture listener in the widget's document stamps the REAL click time (before the widget's own handler runs)
window.stamp = function () { var d = window.frameEl.contentDocument; d.addEventListener('click', function () { window.lastClickAt = performance.now(); window.pendingClick = true; }, true); var orig = window.box.save; window.box.save = function (p) { window.stampNext = window.lastClickAt; return orig.call(window.box, p); }; var oa = window.gestures.push; window.gestures.push = function (g) { g.clickAt = window.stampNext || window.lastClickAt; return oa.call(window.gestures, g); }; };
// the stand-in DRAG layer: a transparent overlay over the widget that turns a real press-drag-release into one appendLine per cell entered (what a drag-aware widget would post)
window.dragLayer = function (channel) {
  var f = window.frameEl.getBoundingClientRect(); var o = document.createElement('div'); o.className = 'drag-overlay'; o.id = 'dragoverlay';
  o.style.left = f.left + 'px'; o.style.top = f.top + 'px'; o.style.width = f.width + 'px'; o.style.height = f.height + 'px'; document.getElementById('frame').appendChild(o);
  var boxes = []; for (var s = 0; s < 16; s++) { var b = window.cellBox(channel, s); if (b) boxes.push({ s: s, x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2 }); }
  var down = false; var entered = {}; var key = 'drag-' + Date.now();
  var at = function (e) { for (var i = 0; i < boxes.length; i++) { var b = boxes[i]; if (e.clientX >= b.x0 && e.clientX <= b.x1 && e.clientY >= b.y0 && e.clientY <= b.y1) return b.s; } return -1; };
  var enter = function (e) { var s = at(e); if (s < 0 || entered[s]) return; entered[s] = true; var t0 = performance.now(); window.ctl.appendLine(PATH, 'Hit ' + channel + ' on step ' + (s + 1) + '.', { gesture: key }).then(function (r) { window.dragLog.push({ step: s + 1, ms: performance.now() - t0, ok: r.ok }); }); };
  o.addEventListener('pointerdown', function (e) { down = true; enter(e); }); o.addEventListener('pointermove', function (e) { if (down) enter(e); }); window.addEventListener('pointerup', function () { down = false; });
  return boxes.map(function (b) { return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; });
};
window.dragLayerOff = function () { var o = document.getElementById('dragoverlay'); if (o) o.remove(); };
window.cardBox = function () { var c = document.querySelector('.forge-prompt-box'); if (!c) return null; var r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, sw: c.scrollWidth, cw: c.clientWidth }; };
window.widgetRect = function () { var r = window.frameEl.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
window.hueRed = function (c) { var m = /rgba?[(]([0-9]+)[, ]+([0-9]+)[, ]+([0-9]+)/.exec(c); if (!m) return false; var R = +m[1] / 255, G = +m[2] / 255, B = +m[3] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; var h; if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4; h = h * 60; if (h < 0) h += 360; return (h < 18 || h > 342); };
window.redFound = function () { var out = []; [].forEach.call(document.querySelectorAll('.forge-chat-panel *, .forge-prompt-box *'), function (el) { var cs = getComputedStyle(el); [cs.color, cs.backgroundColor, cs.borderTopColor].forEach(function (c) { if (c && hueRed(c)) out.push(String(el.className)); }); }); return out; };
</script>`.replace('__WIDGET__', () => widgetJson).replace('__BAR__', () => barJson);
const p = await openPage({ dir: '/', width: 1200, height: 980, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const MOD = { meta: 4, ctrl: 2, shift: 8, alt: 1 };
const key = async (k, code, vk, mods = 0, text) => { await p.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(150); };
const ENTER = () => key('Enter', 'Enter', 13, 0, '\r');
const CMD_Z = () => key('z', 'KeyZ', 90, MOD.meta);
const CMD_SHIFT_Z = () => key('Z', 'KeyZ', 90, MOD.meta | MOD.shift);
const focusField = () => ev(`document.querySelector('.forge-prompt-box-text').focus()`);
const typeText = async (text) => { await focusField(); await p.send('Input.insertText', { text }); await sleep(120); };
const clearField = async () => { await focusField(); await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8); };
const mountedAndLoaded = async () => { for (let i = 0; i < 80; i++) { if ((await ev(`!!document.querySelector('.forge-prompt-box-text') && ready()`)) === true) return true; await sleep(100); } return false; };
const clickCell = async (ch, s) => { const b = await ev(`cellBox(${JSON.stringify(ch)}, ${s})`); await p.click(b.x, b.y); await sleep(160); };
const clickEl = async (id) => { const b = await ev(`elBox(${JSON.stringify(id)})`); await p.click(b.x, b.y); await sleep(200); };
const shotClip = (w) => ({ x: 0, y: 0, width: Math.min(w, 1100), height: 900 });

for (const w of [800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`);

  // ---- mount: opening writes nothing; the composer sits under the Beat Box ------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); const up = await mountedAndLoaded(); await sleep(400);
  const opened = await ev(`({ calls: processCalls, same: notes.get(PATH) === startNote, loads: loads, serviceCalls: serviceCalls })`);
  verdict[`openingWritesNothing_${tag}`] = up === true && opened.calls === 0 && opened.same === true && opened.loads === 1;
  const lay = await ev(`({ card: cardBox(), widget: widgetRect(), tabW: hostEl.clientWidth, over: hostEl.scrollWidth - hostEl.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
  numbers[`layout@${tag}`] = lay;
  verdict[`composerDoesNotOverlapTheBeatBox_${tag}`] = !!lay.card && lay.widget.right - lay.widget.left > 100 && (lay.card.bottom <= lay.widget.top + 1 || lay.card.top >= lay.widget.bottom - 1 || lay.card.right <= lay.widget.left + 1 || lay.card.left >= lay.widget.right - 1) && lay.card.right <= lay.tabW + 1 && lay.card.sw <= lay.card.cw + 1 && lay.over <= 0 && lay.page <= 0;

  // ---- 24 real clicks on 24 different cells -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev('stamp()');
  const rows = await ev('rows()');
  const targets = []; for (const ch of rows) for (let s = 0; s < 16 && targets.length < 24; s++) { if (targets.length < 24) targets.push([ch, s]); }
  const first = targets.slice(0, 24);
  for (const [ch, s] of first) { await clickCell(ch, s); await sleep(60); }
  await sleep(300);
  const after = await ev(`({ calls: processCalls, writes: writes, posts: posts, lines: lines(), loads: loads, same: null })`);
  numbers[`clicks@${tag}`] = { calls: after.calls, writes: after.writes, posts: after.posts, lines: after.lines.length, loads: after.loads };
  verdict[`oneProcessAndOneWritePerClick_${tag}`] = after.calls === 24 && after.writes === 24 && after.posts === 24;
  verdict[`eachClickIsOneLine_${tag}`] = after.lines.length === 25 && /^Start with /.test(after.lines[0]) && after.lines.slice(1).every((l) => /^(Hit|Clear) [a-z_]+ on step [0-9]+[.]$/.test(l));
  verdict[`gridIsTheReplay_${tag}`] = (await ev('sameBar()')) === true && (await ev('fenceIsReplay()')) === true;
  verdict[`noRedrawOnAnOrdinaryClick_${tag}`] = after.loads === 1;
  const lat = await ev('latency()');
  numbers[`gridClickLatencyMs@${tag}`] = lat;
  verdict[`clickToProcessUnderBudget_${tag}`] = lat.n >= 20 && lat.process.p95 !== null && lat.process.p95 < 60;
  verdict[`clickToDoneUnderBudget_${tag}`] = lat.n >= 20 && lat.done.p95 !== null && lat.done.p95 < 120;
  await p.shot(path.join(OUT, `barlist-after-clicks-${w}-${theme}.png`), shotClip(w));

  // ---- the same cell twice leaves no line -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300); await ev('stamp()');
  const startLines = await ev('lines()');
  await clickCell('kick', 2); const one = await ev('lines()'); await clickCell('kick', 2); const two = await ev('lines()');
  verdict[`clickingACellTwiceLeavesNoLine_${tag}`] = startLines.length === 0 && one.length === 2 && two.length === 1 && /^Start with /.test(two[0]) && (await ev('sameBar()')) === true && (await ev(`JSON.stringify(noteData().channels) === JSON.stringify(dataOf(startNote).channels)`)) === true;

  // ---- undo walks back one click at a time (real Cmd+Z in the empty composer) --------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300); await ev('stamp()');
  await clickCell('kick', 2); await clickCell('snare', 7); await clickCell('kick', 3);
  const writes0 = await ev('writes'); const loads0 = await ev('loads');
  const seen = [];
  await clearField().catch(() => {}); await focusField();
  for (let i = 0; i < 3; i++) { await CMD_Z(); await sleep(250); seen.push({ lines: (await ev('lines()')).length, same: await ev('sameBar()') }); }
  verdict[`undoWalksBackOneClickAtATime_${tag}`] = seen.map((x) => x.lines).join() === '3,2,1' && seen.every((x) => x.same === true) && (await ev('writes')) === writes0 + 3 && (await ev('loads')) >= loads0 + 3;
  await CMD_SHIFT_Z(); await sleep(250);
  verdict[`redoPutsItBack_${tag}`] = (await ev('lines()')).length === 2 && (await ev('sameBar()')) === true;

  // ---- settings: tempo in place, swing drag one line, a transform -----------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300); await ev('stamp()');
  await clickEl('bBpmUp'); await clickEl('bBpmUp');
  const tl = await ev('lines()'); const tw = await ev('writes');
  verdict[`tempoClickReplacesInPlace_${tag}`] = tl.length === 2 && /^Set the tempo to [0-9]+[.]$/.test(tl[1]) && tw === 2;
  const sw0 = await ev('writes'); const posts0 = await ev('posts');
  const sl = await ev(`elBox('swing')`);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sl.left + 4, y: sl.y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sl.left + 4, y: sl.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 20; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sl.left + 4 + (sl.w - 8) * (i / 20), y: sl.y, button: 'left' }); await sleep(12); }
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sl.right - 4, y: sl.y, button: 'left', clickCount: 1 });
  await sleep(700);
  const swl = await ev('lines()');
  numbers[`swing@${tag}`] = { posts: (await ev('posts')) - posts0, writes: (await ev('writes')) - sw0, last: swl[swl.length - 1] };
  verdict[`swingDragIsOneLine_${tag}`] = (await ev('posts')) - posts0 >= 3 && (await ev('writes')) - sw0 === 1 && /^Set the swing to [0-9]+ percent[.]$/.test(swl[swl.length - 1]) && swl.length === tl.length + 1;
  await clickCell('kick', 3);                                                // an asymmetric bar, so shift and mirror cannot be confused
  const before = (await ev('lines()')).length;
  await clickEl('bRotLeft');
  const sh = await ev('lines()');
  verdict[`shiftIsOneLine_${tag}`] = sh.length === before + 1 && sh[sh.length - 1] === 'Shift every channel one step to the left.' && (await ev('sameBar()')) === true;

  // ---- the drag: the widget has none; the stand-in layer drives the gesture key ----------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300); await ev('stamp()');
    await ev(`(function () { var s = frameEl.contentDocument.getElementById('addInstrument'); s.value = 'hihat'; s.dispatchEvent(new frameEl.contentWindow.Event('change', { bubbles: true })); })()`);
  await sleep(400);
  const hasHat = (await ev('rows()')).includes('hihat');
  const c0 = await ev('({ calls: processCalls, posts: posts, lines: lines().length })');
  const hat0 = await ev(`cellBox('hihat', 0)`); const hat7 = await ev(`cellBox('hihat', 7)`);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hat0.x, y: hat0.y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hat0.x, y: hat0.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hat0.x + (hat7.x - hat0.x) * (i / 8), y: hat0.y, button: 'left' }); await sleep(20); }
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hat7.x, y: hat7.y, button: 'left', clickCount: 1 });
  await sleep(500);
  const c1 = await ev('({ calls: processCalls, posts: posts, lines: lines().length })');
  verdict[`widgetHasNoDragPaint_${tag}`] = hasHat && c1.posts === c0.posts && c1.calls === c0.calls && c1.lines === c0.lines;
  const centers = await ev(`dragLayer('hihat')`);
  const lines0 = (await ev('lines()')).length; const w0 = await ev('writes');
  await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: centers[0].x, y: centers[0].y });
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: centers[0].x, y: centers[0].y, button: 'left', clickCount: 1 });
  for (let i = 1; i < 8; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: centers[i].x, y: centers[i].y, button: 'left' }); await sleep(40); }
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: centers[7].x, y: centers[7].y, button: 'left', clickCount: 1 });
  await sleep(600);
  const dl = await ev('dragLog'); const dlines = await ev('lines()');
  numbers[`standInDrag@${tag}`] = { cells: dl.length, ms: dl.map((x) => Math.round(x.ms)), lines: dlines.slice(-2), writes: (await ev('writes')) - w0 };
  verdict[`standInDrag_isOneLine_${tag}`] = dl.length === 8 && dl.every((x) => x.ok) && dlines.length === lines0 + 1 && dlines[dlines.length - 1] === 'Hit hihat on steps 1, 2, 3, 4, 5, 6, 7 and 8.';
  const dms = dl.map((x) => x.ms).sort((a, b) => a - b);
  verdict[`standInDrag_latency_${tag}`] = dms.length === 8 && dms[Math.min(7, Math.floor(0.95 * 8))] < 120;
  await ev('dragLayerOff()'); await p.shot(path.join(OUT, `barlist-after-drag-${w}-${theme}.png`), shotClip(w));
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`standInDrag_isOneUndo_${tag}`] = (await ev('lines()')).length === lines0 && (await ev('sameBar()')) === true;

  // ---- the composer ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300);
  await typeText('Hit snare on step 2'); await ENTER(); await sleep(200);
  const preW = await ev('writes'); await ENTER(); await sleep(400);
  verdict[`typedSentenceWorks_${tag}`] = preW === 0 && (await ev('writes')) === 1 && (await ev('lines()')).slice(-1)[0] === 'Hit snare on step 2.' && (await ev('sameBar()')) === true && (await ev('fieldValue()')) === '';
  await typeText('Frobnicate the kick'); await ENTER(); await sleep(300);
  const last = (await ev('dialog()')).filter((d) => d.kind !== 'you').pop();
  verdict[`unreadableSentenceIsRefusedInWords_${tag}`] = !!last && /do not know how to read/.test(last.text) && (await ev('serviceCalls')) === 0 && (await ev('writes')) === 1;

  // ---- a hand edit of the list ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, 'old')`); await mountedAndLoaded(); await sleep(300); await ev('stamp()');
  await clickCell('kick', 2); await sleep(200);
  const hw = await ev('writes');
  await ev(`(function () { var t = notes.get(PATH); var i = t.indexOf('---', 4); var body = t.slice(0, i); var rest = t.slice(i); var m = /lines:[^]*$/.exec(body); var lines = cp.readBarLines(t).lines.concat(['Hit snare on step 8.', 'this is not a sentence']); var block = 'lines:\\n' + lines.map(function (l) { return '  - ' + JSON.stringify(l); }).join('\\n') + '\\n'; var start = body.indexOf('lines:'); notes.set(PATH, body.slice(0, start) + block + rest); vaultModified(); })()`);
  await sleep(1500);
  const hd = await ev('({ writes: writes, lines: lines(), dialog: dialog() })');
  const said = hd.dialog.map((d) => d.text);
  verdict[`handEditedListIsFollowed_${tag}`] = hd.writes === hw + 1 && hd.lines.length === 4 && said.some((t) => /^Line 4 is not a sentence I can read; the note shows lines 1 to 3[.]/.test(t)) && (await ev('sameBar()')) === true && (await ev('redFound()')).length === 0;
  await p.shot(path.join(OUT, `barlist-hand-edit-${w}-${theme}.png`), shotClip(w));

  // ---- general -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const red = await ev('redFound()');
  const tips = await ev(`[].filter.call(document.querySelectorAll('#host *'), function (e) { return (e.hasAttribute('title') || e.hasAttribute('aria-label')) && !e.closest('iframe'); }).map(function (e) { return String(e.className); })`);
  const over = await ev(`({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, host: hostEl.scrollWidth - hostEl.clientWidth, card: (document.querySelector('.forge-prompt-box') || { scrollWidth: 0, clientWidth: 0 }).scrollWidth - (document.querySelector('.forge-prompt-box') || { scrollWidth: 0, clientWidth: 0 }).clientWidth })`);
  numbers[`general@${tag}`] = { red, tips, over };
  verdict[`noRedAnywhere_${tag}`] = red.length === 0;
  verdict[`noTooltipAnywhere_${tag}`] = tips.length === 0;
  verdict[`noHorizontalOverflow_${tag}`] = over.page <= 0 && over.host <= 0 && over.card <= 0;
}

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
