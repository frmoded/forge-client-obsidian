// 2026-11-19-0980 (THE LIST MODEL, stage 2: PHRASES) - what the driver sees: a phrase with a HEAD and THREE lines, after ONE undo, and after a REPLACING head, in REAL headless Chrome (CDP) with REAL key and mouse events. The plugin's own modules
// (src/description-apply.ts: the real controller, with src/chat-panel-dom.ts + src/prompt-box-dom.ts + src/sentence-list-core.ts + src/sentence-list-note-core.ts, bundled with esbuild) run against an in-memory vault, in a tab-shaped host with the
// REAL styles.css and Obsidian's CSS variables for a light and a dark theme (their default values). The SCORE here is a STAND-IN: it draws one block per bar the phrase's json cache says (read by the plugin's own readPhraseNote after every write: that is
// what the real Score takes as its INPUT; a Keep after an Extend head is applied by the stand-in the way the real Score applies it, with bar-structure-core). The engraving itself (Verovio, the engine) is NOT drawn: the driver checks that in Obsidian.
// Obsidian itself is NOT driven. WRITTEN, NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-phrase-list.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// Widths: 800 (stacked) and 1100 (two columns); light and dark. The phrase: line 1 "Extend [[bar_001]] to 4 bars, repeating with fills." (the head), then "Make it 8 bars long.", "Make it 20 percent slower.", "Keep bars 1 to 6.". Per (width, theme), the verdicts:
//   headAndThreeLines_*  (four sentences typed with real keys, Enter to preview, Enter to apply)
//     headAndThreeLinesScoreInputFollowsTheList   the Score stand-in draws 6 bars (8 made, the Keep keeps bars 1 to 6), its note says "extend" and "20 percent slower", and the Description in the note is a numbered list of 4 lines
//     headAndThreeLinesOneWriteEach               the vault saw exactly 4 writes (one per apply) and 4 `process` calls
//     headAndThreeLinesComposerIsEmptyAfterApply  the prompt line is empty again after each apply (the list is in the note and the dialog, not in the prompt line)
//     composerNeverShowsTheDescription            a phrase that already has the four lines opens with an EMPTY prompt line
//   afterOneUndo_*  (a REAL Cmd+Z in the empty composer)
//     undoKeyTakenInEmptyComposer                 the page saw the key event with defaultPrevented true
//     afterOneUndoScoreInputHasEightBars          the Score stand-in draws 8 bars (the Keep is gone), the list has 3 lines, exactly ONE more write
//     afterOneUndoDialogSaysRemoved               the newest dialog line is "Removed: Keep bars 1 to 6."
//     redoKeyBringsItBack                         a REAL Shift+Cmd+Z: 6 bars again, one more write, the dialog says "Added again: ..."
//     undoKeyNotTakenWithText                     with text typed in the field, Cmd+Z is NOT prevented and the note is not written
//   afterReplacingHead_*  (a Morph head typed over the Extend head)
//     replacePreviewSaysThisReplaces              the dialog's preview says "This replaces: Extend [[bar_001]] to 4 bars, repeating with fills." and nothing is written yet
//     replaceKeptTheLinesAndSuperseded            after the second Enter line 1 is the Morph, the "Make it 8 bars long." line is gone (the Morph said its own length), the other two lines are where they were, one write
//     replaceStopsAtTheLineTheMorphCannotTake     the dialog says "Line 2 is not a sentence I can read; the note shows line 1." (a tempo is an Extend's) in plain muted text, and the Score stand-in draws the 5 bars of the Morph
//     replaceUndoPutsTheOldHeadBack               a real Cmd+Z puts the Extend head and its length line back: 6 bars again
//   seed_*  (a seeded Morph typed with no seed; the page's draw gives 17)
//     seedShownInThePreview                       the preview says "in seeded order, seed 17."
//     seedDrawnOnceAndWrittenTheSame              the controller's draw was asked ONCE, the list says "seed 17", and a Cmd+Z then Shift+Cmd+Z leaves "seed 17" with no second draw
//   structureAfterDensity_*
//     orderRefusalInWords                         "Take [[phrase_002]]." then "Thin out bars 1 to 2, by half, keeping the downbeat." then "Keep bars 1 to 3.": the dialog says "Do the structure steps first", nothing is written, the list is not re-sorted
//   menu_*
//     menuUndoRedoDisabledButVisible              on an EMPTY note the "+" menu shows "Undo last sentence" and "Redo", visible, aria-disabled="true", in the muted colour, at the end of the menu
//     menuUndoEnabledAfterAnApply                 after one apply "Undo last sentence" is aria-disabled="false" and "Redo" still "true"
//   general_*
//     noRedAnywhereInTheDialog                    no text colour or background of the dialog, the card and the menu has a red hue (judged by hue)
//     noTooltipAnywhere                           no element in the tab has a title or an aria-label attribute
//     noHorizontalOverflow                        the page, the tab and the card do not scroll sideways
// HARNESS LESSON of stage 1 (kept): every mount is a FRESH host element (a reused element keeps whatever a disposed panel left on it and the controller mounts no box on it; a real tab is a fresh element each time).
// Screenshots (light and dark, each width): phrase-list-head-3-lines-<w>-<theme>.png, phrase-list-after-undo-<w>-<theme>.png, phrase-list-replace-preview-<w>-<theme>.png, phrase-list-after-replace-<w>-<theme>.png, phrase-list-menu-<w>-<theme>.png.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/phrase-list')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: {
    contents: [
      "export { createDescriptionController } from './src/description-apply.ts';",
      "export { emptyPhraseNote } from './src/empty-note-core.ts';",
      "export { readPhraseNote } from './src/phrase-core.ts';",
      "export { applyStructureOps } from './src/bar-structure-core.ts';",
      "export { listOfNote } from './src/sentence-list-note-core.ts';",
    ].join(' '), resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --shadow-s:0 1px 3px rgba(0,0,0,0.15); --radius-m:8px; --radius-s:6px; --font-ui-small:13px; --font-ui-smaller:12px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7ce0; --shadow-s:0 1px 3px rgba(0,0,0,0.5); --radius-m:8px; --radius-s:6px; --font-ui-small:13px; --font-ui-smaller:12px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
.stand-in-block { display:inline-block; margin:4px; padding:8px 12px; border:1px solid var(--background-modifier-border); border-radius:6px; background: var(--background-secondary); color: var(--text-normal); font-size:13px; }
.stand-in-lane { display:block; margin:4px; padding:6px 12px; border:1px solid var(--background-modifier-border); border-radius:6px; background: var(--background-secondary); color: var(--text-normal); font-size:13px; }
.stand-in-note { margin:6px 8px; color: var(--text-muted); font-size:12px; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1100px;height:600px"><div id="host" style="height:600px;width:1100px"></div></div>
<script>${bundle}</script><script>
var VAULT = { bars: ['bar_001', 'bar_002', 'bar_003'], phrases: ['phrase_001', 'phrase_002'], arrangements: [], compositions: [], kits: ['rock'] };
var PATH = 'phrases/phrase_001.md';
window.keys = [];                                                     // every keydown the page saw: key, modifiers and whether the handler took it
document.addEventListener('keydown', function (e) { setTimeout(function () { window.keys.push({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, prevented: e.defaultPrevented }); }, 0); }, false);
window.setup = function (width, note, seeds) {
  if (window.ctl) window.ctl.dispose();
  window.path = PATH; window.notes = new Map(); window.writes = 0; window.processCalls = 0; window.keys = []; window.draws = 0; window.seeds = (seeds || []).slice();
  window.notes.set(window.path, note || cp.emptyPhraseNote('phrase_001'));
  var old = document.getElementById('host'); var host = document.createElement('div'); host.id = 'host'; old.parentNode.replaceChild(host, old);      // a NEW element per mount, as a new tab is
  host.className = ''; host.removeAttribute('style'); host.style.height = '600px'; host.style.width = width + 'px'; host.innerHTML = '';
  document.getElementById('frame').style.width = width + 'px';
  var score = document.createElement('div'); score.className = 'forge-rhythm-edit-score'; score.style.cssText = 'min-height:150px;padding:8px;'; host.appendChild(score);
  window.draw = function () {                                          // the Score stand-in: one block per bar the json cache says (a head's structure steps applied as the real Score applies them)
    var text = window.notes.get(window.path); score.innerHTML = '';
    var note = document.createElement('div'); note.className = 'stand-in-note'; note.textContent = 'Score stand-in: what the note\\'s json cache says (the engraving is drawn in Obsidian)'; score.appendChild(note);
    var r = cp.readPhraseNote(text); if (!r.ok) return;
    var p = r.value, n = p.kind === 'extend' || p.kind === 'morph' ? p.bars : 1;
    var bars = []; for (var i = 1; i <= n; i++) bars.push(i);
    var steps = (p.ops || []).filter(function (o) { return o.op === 'keep' || o.op === 'delete' || o.op === 'copy' || o.op === 'move'; });       // the real Score hands the engine only the density steps and runs ONLY the structure steps itself: a thin_out here made applyStructureOps throw inside process AFTER the note was stored, and the apply was (rightly) reported failed with the sentence kept in the field
    if (steps.length) { var done = cp.applyStructureOps(bars, steps); if (done.ok) bars = done.items; }
    var what = document.createElement('div'); what.className = 'stand-in-note'; what.setAttribute('data-what', '1'); what.textContent = p.kind + (p.tempo_change_pct ? ', ' + Math.abs(p.tempo_change_pct) + ' percent ' + (p.tempo_change_pct < 0 ? 'slower' : 'faster') : '') + (p.order === 'seeded' ? ', seed ' + p.seed : ''); score.appendChild(what);
    bars.forEach(function (b) { var e = document.createElement('span'); e.className = 'stand-in-block'; e.textContent = 'bar ' + b; score.appendChild(e); });
  };
  window.draw();
  var ports = {
    read: function (p) { var t = window.notes.get(p); return t === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(t); },
    process: function (p, fn) { window.processCalls++; return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) { window.notes.set(p, next); window.writes++; window.draw(); } }); },
    vault: function () { return VAULT; }, barNames: function () { return VAULT.bars; }, phraseNames: function () { return VAULT.phrases; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {},
    drawSeed: function () { window.draws++; return window.seeds.length ? window.seeds.shift() : 99; },
    panes: function () { return [{ path: window.path, contentEl: host, tab: true }]; },
    composerAutoApply: function () { return false; },      // 2026-11-20-1002 (deliberate): the setting Preview before applying is ON in this harness: the flows below type a sentence and press Enter TWICE (the plugin default is ONE Enter: measure-duplicate-followups.mjs has the one-Enter verdicts)
    composerMenu: function () { return { items: [{ id: 'p', label: 'New phrase' }, { id: 'a', label: 'New arrangement' }, { id: 'c', label: 'New composition' }, { id: 'b', label: 'New bar' }], run: function () {}, pickNote: function () { return Promise.resolve(null); } }; },
  };
  window.ctl = cp.createDescriptionController(ports);
  return window.ctl.inspect(window.path).then(function () { window.ctl.syncBars(); });
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.list = function () { return cp.listOfNote(window.notes.get(window.path), 'phrase', VAULT).list; };
window.what = function () { var e = document.querySelector('[data-what]'); return e ? e.textContent : ''; };
window.blocks = function () { return [].map.call(document.querySelectorAll('.stand-in-block'), function (b) { return b.textContent; }); };
window.lanes = function () { return [].map.call(document.querySelectorAll('.stand-in-lane'), function (b) { return b.textContent; }); };
window.dialog = function () { return [].map.call(document.querySelectorAll('.forge-chat-msg'), function (m) { return { kind: m.getAttribute('data-kind'), text: (m.querySelector('.forge-chat-text') || {}).textContent || '' }; }); };
window.hueRed = function (c) { var m = /rgba?\\((\\d+)[, ]+(\\d+)[, ]+(\\d+)/.exec(c); if (!m) return false; var R = +m[1] / 255, G = +m[2] / 255, B = +m[3] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; var h = (mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60; return h <= 20 || h >= 340; };
window.redFound = function () { var out = []; [].forEach.call(document.querySelectorAll('#host *'), function (el) { var cs = getComputedStyle(el); [cs.color, cs.backgroundColor, cs.borderTopColor].forEach(function (c) { if (c && hueRed(c)) out.push(el.className + ' ' + c); }); }); return out; };
</script>`;
const p = await openPage({ dir: '/', width: 1200, height: 700, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const MOD = { meta: 4, ctrl: 2, shift: 8, alt: 1 };
const key = async (k, code, vk, mods = 0, text) => { await p.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(250); };
const ENTER = () => key('Enter', 'Enter', 13, 0, '\r');
const CMD_Z = () => key('z', 'KeyZ', 90, MOD.meta);
const SHIFT_CMD_Z = () => key('Z', 'KeyZ', 90, MOD.meta | MOD.shift);
const focusField = () => ev(`document.querySelector('.forge-prompt-box-text').focus()`);
/** real typing into the focused field, then the first Enter (preview) and the second (apply) */
const say = async (sentence) => { await focusField(); await p.send('Input.insertText', { text: sentence }); await sleep(120); await ENTER(); await ENTER(); await sleep(200); };
const lastKey = async () => (await ev('window.keys'))[(await ev('window.keys.length')) - 1];
const mounted = async () => { for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('.forge-prompt-box-text')`)) return true; await sleep(100); } return false; };

for (const w of [800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`);

  // ---- a phrase with a HEAD and THREE lines, then ONE undo, then redo --------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  // the "+" menu on the EMPTY note, before anything is said
  const plus = await ev(`box('.forge-composer-plus')`); if (plus === null) throw new Error('no .forge-composer-plus at ' + tag + ' after ' + Object.keys(verdict).length + ' verdicts: ' + (await ev(`document.body.innerHTML.slice(0, 900)`)));
  await p.click(plus.x, plus.y); await sleep(250);
  const m0 = await ev(`(function () { var items = [].slice.call(document.querySelectorAll('.forge-composer-menuitem')); var norm = getComputedStyle(items[0]).color;
    return { labels: items.map(function (b) { return b.textContent; }), disabled: items.map(function (b) { return b.getAttribute('aria-disabled'); }), colors: items.map(function (b) { return getComputedStyle(b).color; }), normal: norm, hidden: document.querySelector('.forge-composer-menu').hidden, sizes: items.map(function (b) { var r = b.getBoundingClientRect(); return [r.width, r.height]; }) }; })()`);
  numbers[`menu@${tag}`] = m0;
  const n = m0.labels.length;
  verdict[`menuUndoRedoDisabledButVisible_${tag}`] = m0.hidden === false && m0.labels[n - 2] === 'Undo last sentence' && m0.labels[n - 1] === 'Redo' && m0.disabled[n - 2] === 'true' && m0.disabled[n - 1] === 'true' && m0.colors[n - 2] !== m0.normal && m0.sizes[n - 2][1] > 8 && m0.sizes[n - 1][1] > 8;
  await p.shot(path.join(OUT, `phrase-list-menu-${w}-${theme}.png`), { x: 0, y: 150, width: Math.min(w, 1100), height: 450 });
  await key('Escape', 'Escape', 27);
  const composerEmpty = [];
  for (const s of ['Extend [[bar_001]] to 4 bars, repeating with fills.', 'Make it 8 bars long.', 'Make it 20 percent slower.', 'Keep bars 1 to 6.']) { await say(s); composerEmpty.push(await ev(`document.querySelector('.forge-prompt-box-text').value === ''`)); }
  const four = await ev(`({ blocks: blocks(), list: list(), what: what(), writes: writes, calls: processCalls, over: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
  numbers[`headAndThreeLines@${tag}`] = { blocks: four.blocks, list: four.list, what: four.what, writes: four.writes, processCalls: four.calls };
  verdict[`headAndThreeLinesScoreInputFollowsTheList_${tag}`] = four.blocks.length === 6 && four.list.length === 4 && /^extend, 20 percent slower$/.test(four.what);
  verdict[`headAndThreeLinesOneWriteEach_${tag}`] = four.writes === 4 && four.calls === 4;
  verdict[`headAndThreeLinesComposerIsEmptyAfterApply_${tag}`] = composerEmpty.length === 4 && composerEmpty.every((x) => x === true);
  await p.shot(path.join(OUT, `phrase-list-head-3-lines-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  const fourText = await ev(`notes.get(path)`);
  // a phrase that already has the four lines opens with an EMPTY prompt line (a fresh mount of the same note)
  await ev(`setup(${w}, ${JSON.stringify(fourText)})`); await mounted(); await sleep(300);
  verdict[`composerNeverShowsTheDescription_${tag}`] = (await ev(`document.querySelector('.forge-prompt-box-text').value === ''`)) === true && (await ev('writes')) === 0;

  await focusField(); const before = await ev(`writes`);
  await CMD_Z();
  const k1 = await lastKey();
  const undone = await ev(`({ blocks: blocks(), list: list(), writes: writes, dialog: dialog() })`);
  numbers[`afterOneUndo@${tag}`] = { blocks: undone.blocks, list: undone.list, lastDialog: undone.dialog[undone.dialog.length - 1] };
  verdict[`undoKeyTakenInEmptyComposer_${tag}`] = k1 !== undefined && k1.key.toLowerCase() === 'z' && k1.meta === true && k1.prevented === true;
  verdict[`afterOneUndoScoreInputHasEightBars_${tag}`] = undone.blocks.length === 8 && undone.list.length === 3 && undone.writes === before + 1;
  verdict[`afterOneUndoDialogSaysRemoved_${tag}`] = undone.dialog.length > 0 && undone.dialog[undone.dialog.length - 1].text === 'Removed: Keep bars 1 to 6.';
  await p.shot(path.join(OUT, `phrase-list-after-undo-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await SHIFT_CMD_Z();
  const redone = await ev(`({ blocks: blocks(), list: list(), writes: writes, dialog: dialog() })`);
  verdict[`redoKeyBringsItBack_${tag}`] = redone.blocks.length === 6 && redone.list.length === 4 && redone.writes === before + 2 && /^Added again: /.test(redone.dialog[redone.dialog.length - 1].text);
  // with TEXT in the field the key is the browser's own: not prevented, nothing written
  await focusField(); await p.send('Input.insertText', { text: 'half a sen' }); await sleep(100);
  const w0 = await ev('writes'); await CMD_Z(); const k2 = await lastKey();
  verdict[`undoKeyNotTakenWithText_${tag}`] = k2 !== undefined && k2.prevented === false && (await ev('writes')) === w0 && (await ev('list().length')) === 4;
  await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8);
  await p.click(plus.x, plus.y); await sleep(250);
  const m1 = await ev(`[].map.call(document.querySelectorAll('.forge-composer-menuitem'), function (b) { return [b.textContent, b.getAttribute('aria-disabled')]; }).slice(-2)`);
  verdict[`menuUndoEnabledAfterAnApply_${tag}`] = m1[0][0] === 'Undo last sentence' && m1[0][1] === 'false' && m1[1][0] === 'Redo' && m1[1][1] === 'true';
  await key('Escape', 'Escape', 27);

  // ---- a REPLACING head: a Morph typed over the Extend -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  const base = await ev(`({ list: list(), writes: writes })`);
  await focusField(); await p.send('Input.insertText', { text: 'Morph [[bar_001]] into [[bar_002]] over 5 bars, in musical order.' }); await sleep(120); await ENTER(); await sleep(200);
  const pv = await ev(`({ dialog: dialog(), list: list(), writes: writes })`);
  const sug = pv.dialog.filter((d) => d.kind === 'suggestion').pop();
  numbers[`replacePreview@${tag}`] = { text: sug && sug.text };
  verdict[`replacePreviewSaysThisReplaces_${tag}`] = !!sug && sug.text.includes('This replaces: Extend [[bar_001]] to 4 bars, repeating with fills.') && pv.writes === base.writes && pv.list.join('|') === base.list.join('|');
  await p.shot(path.join(OUT, `phrase-list-replace-preview-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await ENTER(); await sleep(250);
  const rep = await ev(`({ list: list(), writes: writes, blocks: blocks(), what: what(), dialog: dialog() })`);
  numbers[`afterReplacingHead@${tag}`] = { list: rep.list, blocks: rep.blocks, what: rep.what, last: rep.dialog[rep.dialog.length - 1] };
  verdict[`replaceKeptTheLinesAndSuperseded_${tag}`] = rep.list.length === 3 && /^Morph \[\[bar_001\]\] into \[\[bar_002\]\] over 5 bars/.test(rep.list[0]) && rep.list[1] === 'Make it 20 percent slower.' && rep.list[2] === 'Keep bars 1 to 6.' && rep.writes === base.writes + 1;
  const stop = rep.dialog.filter((d) => d.kind === 'notice').pop();
  verdict[`replaceStopsAtTheLineTheMorphCannotTake_${tag}`] = !!stop && stop.text.startsWith('Line 2 is not a sentence I can read; the note shows line 1.') && rep.blocks.length === 5 && /^morph/.test(rep.what);
  await p.shot(path.join(OUT, `phrase-list-after-replace-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await focusField(); await CMD_Z();
  const back = await ev(`({ list: list(), blocks: blocks(), what: what() })`);
  verdict[`replaceUndoPutsTheOldHeadBack_${tag}`] = back.list.length === 4 && /^Extend \[\[bar_001\]\]/.test(back.list[0]) && back.list[1] === 'Make it 8 bars long.' && back.blocks.length === 6 && /^extend/.test(back.what);

  // ---- a seeded Morph typed with no seed: the seed is drawn ONCE ---------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w}, undefined, [17, 18])`); await mounted(); await sleep(300);
  await focusField(); await p.send('Input.insertText', { text: 'Morph [[bar_001]] into [[bar_002]] over 5 bars, in seeded order.' }); await sleep(120); await ENTER(); await sleep(200);
  const spv = await ev(`({ dialog: dialog(), desc: (document.querySelector('.forge-chat-suggestion-description') || {}).textContent || '', draws: draws })`);
  verdict[`seedShownInThePreview_${tag}`] = /in seeded order, seed 17\.$/.test(spv.desc) && spv.draws === 1;
  await ENTER(); await sleep(250);
  const sap = await ev(`({ list: list(), draws: draws })`);
  await focusField(); await CMD_Z(); await SHIFT_CMD_Z();
  const sre = await ev(`({ list: list(), draws: draws, what: what() })`);
  verdict[`seedDrawnOnceAndWrittenTheSame_${tag}`] = sap.draws === 1 && /in seeded order, seed 17\.$/.test(sap.list[0]) && sre.draws === 1 && sre.list[0] === sap.list[0] && /seed 17$/.test(sre.what);

  // ---- a structure step after a density step is REFUSED in words ---------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  const afterEach = [];
  for (const s of ['Take [[phrase_002]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.']) { await say(s); afterEach.push(await ev(`document.querySelector('.forge-prompt-box-text').value`)); }
  const w1 = await ev('writes'); const l1 = await ev('list()');
  const fieldNow = await ev(`document.querySelector('.forge-prompt-box-text').value`); await sleep(1500); const fieldBefore = await ev(`document.querySelector('.forge-prompt-box-text').value`);
  await focusField(); await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8);     // the field is emptied by hand first (kept as a belt: the stale text seen after a Thin out line was the stand-in Score throwing inside process, fixed in draw above; src/phrase-list-enter-race.test.ts pins it)
  await p.send('Input.insertText', { text: 'Keep bars 1 to 3.' }); await sleep(120); await ENTER(); await sleep(200);
  const ord = await ev(`({ dialog: dialog(), list: list(), writes: writes })`);
  numbers[`order@${tag}`] = { afterEach: afterEach, fieldNow: fieldNow, fieldBefore: fieldBefore, last: ord.dialog.slice(-2), writesBefore: w1, writesAfter: ord.writes, listBefore: l1, listAfter: ord.list };
  verdict[`orderRefusalInWords_${tag}`] = /Do the structure steps first/.test(ord.dialog[ord.dialog.length - 1].text) && ord.writes === w1 && ord.list.join('|') === l1.join('|');
  await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8);

  // ---- general ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const red = await ev('redFound()');
  const tips = await ev(`[].filter.call(document.querySelectorAll('#host *'), function (e) { return e.hasAttribute('title') || e.hasAttribute('aria-label'); }).map(function (e) { return e.className; })`);
  const over = await ev(`({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, host: document.getElementById('host').scrollWidth - document.getElementById('host').clientWidth, card: document.querySelector('.forge-prompt-box').scrollWidth - document.querySelector('.forge-prompt-box').clientWidth })`);
  numbers[`general@${tag}`] = { red, tips, over };
  verdict[`noRedAnywhereInTheDialog_${tag}`] = red.length === 0;
  verdict[`noTooltipAnywhere_${tag}`] = tips.length === 0;
  verdict[`noHorizontalOverflow_${tag}`] = over.page <= 0 && over.host <= 0 && over.card <= 0;
}

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
