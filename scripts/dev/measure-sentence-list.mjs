// 2026-11-19-0970 (THE LIST MODEL, stage 1) - what the driver sees: a composition with THREE lines, after ONE undo, and an arrangement after a CONFLICT replace, in REAL headless Chrome (CDP) with REAL key and mouse events. The plugin's own modules
// (src/description-apply.ts: the real controller, with src/chat-panel-dom.ts + src/prompt-box-dom.ts + src/sentence-list-core.ts + src/sentence-list-note-core.ts, bundled with esbuild) run against an in-memory vault, in a tab-shaped host with the
// REAL styles.css and Obsidian's CSS variables for a light and a dark theme (their default values). The SCORE here is a STAND-IN: it draws one block per section the note's json cache says (a composition: its expanded sections; an arrangement:
// one lane per track), read by the plugin's own readCompositionNote / readArrangementNote after every write: that is what the real Score takes as its INPUT. The engraving itself (Verovio, the engine) is NOT drawn: the driver checks that in
// Obsidian (the checklist in the feedback). Obsidian itself is NOT driven. NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-sentence-list.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// Widths: 800 (stacked, below the 900 px threshold) and 1100 (TWO COLUMNS); light and dark. Per (width, theme), the verdicts:
//   threeLines_*  (a composition, three sentences typed with real keys, Enter to preview, Enter to apply)
//     threeLinesScoreInputHasThreeSections    the Score stand-in draws 3 blocks (phrase_001, phrase_002, phrase_002 once more) and the Description in the note is a numbered list of 3 lines
//     threeLinesOneWriteEach                  the vault saw exactly 3 writes (one per apply) and 3 `process` calls
//     threeLinesComposerIsEmptyAfterApply     the prompt line is empty again after each apply (the list is in the note and the dialog, not in the prompt line)
//   afterOneUndo_* (a REAL Cmd+Z in the empty composer)
//     undoKeyTakenInEmptyComposer             the page saw the key event with defaultPrevented true
//     afterOneUndoScoreInputHasTwoSections    the Score stand-in draws 2 blocks; the list in the note has 2 lines; exactly ONE more write
//     afterOneUndoDialogSaysRemoved           the newest dialog line is "Removed: Repeat that once more."
//     redoKeyBringsItBack                     a REAL Shift+Cmd+Z: 3 blocks again, one more write, the dialog says "Added again: ..."
//     undoKeyNotTakenWithText                 with text typed in the field, Cmd+Z is NOT prevented and the note is not written
//   conflictReplace_* (an ARRANGEMENT with three lines, then a sentence about the same kit)
//     conflictPreviewSaysThisReplaces         the dialog's preview says "This replaces: Play [[phrase_001]] on the [[rock]] kit." as plain text and nothing is written yet
//     conflictReplaceKeptTheLineInPlace       after the second Enter line 1 of the list is the new sentence, the other lines are where they were, one write
//     conflictScoreInputFollows               the rock lane of the Score stand-in names phrase_003
//     conflictUndoPutsTheOldBack              a real Cmd+Z puts the replaced sentence back in line 1 and the lane says phrase_001 again
//   menu_*
//     menuUndoRedoDisabledButVisible          on an EMPTY note the "+" menu shows "Undo last sentence" and "Redo", visible, aria-disabled="true", in the muted colour (not the normal text colour), at the end of the menu
//     menuUndoEnabledAfterAnApply             after one apply "Undo last sentence" is aria-disabled="false" and "Redo" still "true"
//     menuNotClippedOrCovered                 the element at the middle of each of the two items belongs to the menu
//   general_*
//     noRedAnywhereInTheDialog                no text colour or background of the dialog, the card and the menu has a red hue (judged by hue)
//     noTooltipAnywhere                       no element in the tab has a title or an aria-label attribute
//     noHorizontalOverflow                    the page, the tab and the card do not scroll sideways
// Screenshots (light and dark, each width): sentence-list-3-lines-<w>-<theme>.png, sentence-list-after-undo-<w>-<theme>.png, sentence-list-conflict-preview-<w>-<theme>.png, sentence-list-after-replace-<w>-<theme>.png, sentence-list-menu-<w>-<theme>.png.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/sentence-list')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: {
    contents: [
      "export { createDescriptionController } from './src/description-apply.ts';",
      "export { emptyArrangementNote, emptyCompositionNote } from './src/empty-note-core.ts';",
      "export { readCompositionNote, expandSections } from './src/composition-core.ts';",
      "export { readArrangementNote } from './src/arrangement-core.ts';",
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
var VAULT = { bars: ['bar_001'], phrases: ['phrase_001', 'phrase_002', 'phrase_003'], arrangements: ['arr_001'], compositions: ['comp_001'], kits: ['rock', 'latin'] };
var PATHS = { composition: 'compositions/comp_001.md', arrangement: 'arrangements/arr_001.md' };
window.keys = [];                                                     // every keydown the page saw: key, modifiers and whether the handler took it
document.addEventListener('keydown', function (e) { setTimeout(function () { window.keys.push({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, prevented: e.defaultPrevented }); }, 0); }, false);
window.setup = function (kind, width) {
  if (window.ctl) window.ctl.dispose();
  window.kind = kind; window.path = PATHS[kind]; window.notes = new Map(); window.writes = 0; window.processCalls = 0; window.keys = [];
  window.notes.set(window.path, kind === 'arrangement' ? cp.emptyArrangementNote('arr_001') : cp.emptyCompositionNote('comp_001'));
  var old = document.getElementById('host'); var host = document.createElement('div'); host.id = 'host'; old.parentNode.replaceChild(host, old);      // a NEW element per mount, as a new tab is (a reused element keeps whatever a disposed panel left on it)
  host.className = ''; host.removeAttribute('style'); host.style.height = '600px'; host.style.width = width + 'px'; host.innerHTML = '';
  document.getElementById('frame').style.width = width + 'px';
  var score = document.createElement('div'); score.className = 'forge-rhythm-edit-score'; score.style.cssText = 'min-height:150px;padding:8px;'; host.appendChild(score);
  window.draw = function () {                                          // the Score stand-in: one block per section (a composition) or one lane per track (an arrangement), from the json cache the real Score reads
    var text = window.notes.get(window.path); score.innerHTML = '';
    var note = document.createElement('div'); note.className = 'stand-in-note'; note.textContent = 'Score stand-in: what the note\\'s json cache says (the engraving is drawn in Obsidian)'; score.appendChild(note);
    if (window.kind === 'composition') { var r = cp.readCompositionNote(text); if (r.ok) cp.expandSections(r.value).forEach(function (s, i) { var b = document.createElement('span'); b.className = 'stand-in-block'; b.textContent = (i + 1) + '. ' + s.source.split('/').pop() + (s.length ? ' (' + s.length + ' bars)' : ''); score.appendChild(b); }); }
    else { var a = cp.readArrangementNote(text); if (a.ok) a.value.tracks.forEach(function (t) { var l = document.createElement('span'); l.className = 'stand-in-lane'; l.setAttribute('data-kit', t.kit); l.textContent = t.kit + ': ' + t.phrase + (t.volume !== undefined ? ' at ' + t.volume + ' percent' : ''); score.appendChild(l); }); }
  };
  window.draw();
  var ports = {
    read: function (p) { var t = window.notes.get(p); return t === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(t); },
    process: function (p, fn) { window.processCalls++; return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) { window.notes.set(p, next); window.writes++; window.draw(); } }); },
    vault: function () { return VAULT; }, barNames: function () { return VAULT.bars; }, phraseNames: function () { return VAULT.phrases; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {},
    panes: function () { return [{ path: window.path, contentEl: host, tab: true }]; },
    composerAutoApply: function () { return false; },      // 2026-11-20-1002 (deliberate): the setting Preview before applying is ON in this harness: the flows below type a sentence and press Enter TWICE (the plugin default is ONE Enter: measure-duplicate-followups.mjs has the one-Enter verdicts)
    composerMenu: function () { return { items: [{ id: 'p', label: 'New phrase' }, { id: 'a', label: 'New arrangement' }, { id: 'c', label: 'New composition' }, { id: 'b', label: 'New bar' }], run: function () {}, pickNote: function () { return Promise.resolve(null); } }; },
  };
  window.ctl = cp.createDescriptionController(ports);
  return window.ctl.inspect(window.path).then(function () { window.ctl.syncBars(); });
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.list = function () { return cp.listOfNote(window.notes.get(window.path), window.kind, VAULT).list; };
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

  // ---- a composition with THREE lines, then ONE undo, then redo ----------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup('composition', ${w})`); await mounted(); await sleep(300);
  // ---- (2026-11-19-0970) the "+" menu on the EMPTY note, before anything is said (the harness cannot mount the same kind twice in one iteration)
  const plus = await ev(`box('.forge-composer-plus')`); if (plus === null) throw new Error('no .forge-composer-plus at ' + tag + ' after ' + Object.keys(verdict).length + ' verdicts: ' + (await ev(`document.body.innerHTML.slice(0, 900)`)));
  await p.click(plus.x, plus.y); await sleep(250);
  const m0 = await ev(`(function () { var items = [].slice.call(document.querySelectorAll('.forge-composer-menuitem')); var norm = getComputedStyle(items[0]).color;
    return { labels: items.map(function (b) { return b.textContent; }), disabled: items.map(function (b) { return b.getAttribute('aria-disabled'); }), colors: items.map(function (b) { return getComputedStyle(b).color; }), normal: norm, hidden: document.querySelector('.forge-composer-menu').hidden,
      sizes: items.map(function (b) { var r = b.getBoundingClientRect(); return [r.width, r.height]; }), mid: items.slice(-2).map(function (b) { var r = b.getBoundingClientRect(); var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && !!hit.closest('.forge-composer-menu'); }) }; })()`);
  numbers[`menu@${tag}`] = m0;
  const n = m0.labels.length;
  verdict[`menuUndoRedoDisabledButVisible_${tag}`] = m0.hidden === false && m0.labels[n - 2] === 'Undo last sentence' && m0.labels[n - 1] === 'Redo' && m0.disabled[n - 2] === 'true' && m0.disabled[n - 1] === 'true' && m0.colors[n - 2] !== m0.normal && m0.sizes[n - 2][1] > 8 && m0.sizes[n - 1][1] > 8;
  verdict[`menuNotClippedOrCovered_${tag}`] = m0.mid.length === 2 && m0.mid.every((x) => x === true);
  await p.shot(path.join(OUT, `sentence-list-menu-${w}-${theme}.png`), { x: 0, y: 150, width: Math.min(w, 1100), height: 450 });
  await key('Escape', 'Escape', 27);
  const composerEmpty = [];
  for (const s of ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.']) { await say(s); composerEmpty.push(await ev(`document.querySelector('.forge-prompt-box-text').value === ''`)); }
  const three = await ev(`({ blocks: blocks(), list: list(), writes: writes, calls: processCalls, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, hostOver: document.getElementById('host').scrollWidth - document.getElementById('host').clientWidth, cardOver: document.querySelector('.forge-prompt-box').scrollWidth - document.querySelector('.forge-prompt-box').clientWidth })`);
  numbers[`threeLines@${tag}`] = { blocks: three.blocks, list: three.list, writes: three.writes, processCalls: three.calls };
  verdict[`threeLinesScoreInputHasThreeSections_${tag}`] = three.blocks.length === 3 && three.list.length === 3 && /phrase_001/.test(three.blocks[0]) && /phrase_002/.test(three.blocks[1]) && /phrase_002/.test(three.blocks[2]);
  verdict[`threeLinesOneWriteEach_${tag}`] = three.writes === 3 && three.calls === 3;
  verdict[`threeLinesComposerIsEmptyAfterApply_${tag}`] = composerEmpty.length === 3 && composerEmpty.every((x) => x === true);
  await p.shot(path.join(OUT, `sentence-list-3-lines-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });

  await focusField(); const before = await ev(`writes`);
  await CMD_Z();
  const k1 = await lastKey();
  const undone = await ev(`({ blocks: blocks(), list: list(), writes: writes, dialog: dialog() })`);
  numbers[`afterOneUndo@${tag}`] = { blocks: undone.blocks, list: undone.list, lastDialog: undone.dialog[undone.dialog.length - 1] };
  verdict[`undoKeyTakenInEmptyComposer_${tag}`] = k1 !== undefined && k1.key.toLowerCase() === 'z' && k1.meta === true && k1.prevented === true;
  verdict[`afterOneUndoScoreInputHasTwoSections_${tag}`] = undone.blocks.length === 2 && undone.list.length === 2 && undone.writes === before + 1;
  verdict[`afterOneUndoDialogSaysRemoved_${tag}`] = undone.dialog.length > 0 && undone.dialog[undone.dialog.length - 1].text === 'Removed: Repeat that once more.';
  await p.shot(path.join(OUT, `sentence-list-after-undo-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await SHIFT_CMD_Z();
  const redone = await ev(`({ blocks: blocks(), list: list(), writes: writes, dialog: dialog() })`);
  verdict[`redoKeyBringsItBack_${tag}`] = redone.blocks.length === 3 && redone.list.length === 3 && redone.writes === before + 2 && /^Added again: /.test(redone.dialog[redone.dialog.length - 1].text);
  // with TEXT in the field the key is the browser's own: not prevented, nothing written
  await focusField(); await p.send('Input.insertText', { text: 'half a sen' }); await sleep(100);
  const w0 = await ev('writes'); await CMD_Z(); const k2 = await lastKey();
  verdict[`undoKeyNotTakenWithText_${tag}`] = k2 !== undefined && k2.prevented === false && (await ev('writes')) === w0 && (await ev('list().length')) === 3;
  await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8);

  // ---- the "+" menu after the three lines (Undo enabled, Redo disabled)
  await p.click(plus.x, plus.y); await sleep(250);
  const m1 = await ev(`[].map.call(document.querySelectorAll('.forge-composer-menuitem'), function (b) { return [b.textContent, b.getAttribute('aria-disabled')]; }).slice(-2)`);
  verdict[`menuUndoEnabledAfterAnApply_${tag}`] = m1[0][0] === 'Undo last sentence' && m1[0][1] === 'false' && m1[1][0] === 'Redo' && m1[1][1] === 'true';
  await key('Escape', 'Escape', 27);


  // ---- an ARRANGEMENT with three lines, then a sentence about the same kit: the conflict replace -------------------------------------------------------------------------------------------------------------------
  await ev(`setup('arrangement', ${w})`); await mounted(); await sleep(300);
  for (const s of ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 60 percent volume.']) await say(s);
  const base = await ev(`({ list: list(), writes: writes })`);
  await focusField(); await p.send('Input.insertText', { text: 'Play [[phrase_003]] on the [[rock]] kit.' }); await sleep(120); await ENTER(); await sleep(200);
  const pv = await ev(`({ dialog: dialog(), list: list(), writes: writes, lanes: lanes() })`);
  const sug = pv.dialog.filter((d) => d.kind === 'suggestion').pop();
  numbers[`conflictPreview@${tag}`] = { text: sug && sug.text };
  verdict[`conflictPreviewSaysThisReplaces_${tag}`] = !!sug && sug.text.includes('This replaces: Play [[phrase_001]] on the [[rock]] kit.') && pv.writes === base.writes && pv.list.join('|') === base.list.join('|');
  await p.shot(path.join(OUT, `sentence-list-conflict-preview-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await ENTER(); await sleep(200);
  const rep = await ev(`({ list: list(), writes: writes, lanes: lanes() })`);
  numbers[`conflictReplace@${tag}`] = rep;
  verdict[`conflictReplaceKeptTheLineInPlace_${tag}`] = rep.list.length === 3 && rep.list[0] === 'Play [[phrase_003]] on the [[rock]] kit.' && rep.list[1] === base.list[1] && rep.list[2] === base.list[2] && rep.writes === base.writes + 1;
  verdict[`conflictScoreInputFollows_${tag}`] = rep.lanes.length === 2 && /^rock: phrase_003/.test(rep.lanes[0]) && /^latin: phrase_002 at 60 percent/.test(rep.lanes[1]);
  await p.shot(path.join(OUT, `sentence-list-after-replace-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 600 });
  await focusField(); await CMD_Z();
  const back = await ev(`({ list: list(), lanes: lanes() })`);
  verdict[`conflictUndoPutsTheOldBack_${tag}`] = back.list[0] === base.list[0] && /^rock: phrase_001/.test(back.lanes[0]);

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
