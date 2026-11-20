// 2026-11-19-0996b - BAR WORDS INSIDE A PHRASE, the clicks, in REAL headless Chrome (CDP) with REAL mouse clicks on stand-in Score bars and REAL key events. Written on the model of measure-duplicate-followups.mjs (same harness, same stand-in Score of 8 bars, same real controller,
// composer, dialog and inspector, Obsidian's own button rules pasted in). The click: with a bar word first in the phrase composer (Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix, Extend) a plain click on a bar inserts its POSITION ` bar 3` at the caret and a later click
// adds ` and bar 5`; any other text keeps 0992a's note link; an empty composer pins; Enter applies ONE line. The SCORE is a STAND-IN (the real mountPhrase is covered by src/bar-words-click-wiring.test.ts); Obsidian itself is NOT driven. WRITTEN, NOT RUN by the author of this file:
//   node scripts/dev/measure-bar-words.mjs [--out <dir>]        exit 0 = every verdict true; widths 800 and 1100, light and dark
// Verdicts (each suffixed _<width>_<theme>):
//   duplicateClickInsertsBarN        "Duplicate" typed with real keys, a real click on each of the 8 bars: the field says "Duplicate bar N" (N = the bar clicked)
//   moveClickInsertsBarN             the same with "Move": "Move bar N"
//   barClicksReturnFocusNoPreviewNoPin   after each of those 16 clicks focus is in the field, no live preview is in the dialog, nothing was created, nothing was pinned, the note was not written
//   fooInsertsTheNoteLink            "Foo" typed, a click on each of the 8 bars: "Foo [[<note that made THAT bar>]]" (0992a, unchanged)
//   emptyComposerPins                the field emptied, a click on bar 5 pins ph_bar_5 and the field stays empty
//   secondClickAddsAnd               "Duplicate", a click on bar 3, a click on bar 5: "Duplicate bar 3 and bar 5"; a third on bar 7: "... and bar 7"
//   clickGoesAtTheCaret              "Keep and bar 8." with the caret after "Keep", a click on bar 2: "Keep bar 2 and bar 8."
//   shiftClickIsStillSelection       "Delete" typed, a real Shift+click: nothing pinned, nothing appended, the selection gesture fired once
//   enterAppliesOneLine              "Duplicate", a click on bar 3, Enter (the preview says "Copy bar 3."), Enter: the list's last line is "Copy bar 3.", exactly ONE process call, no bar note created, the composer empty
//   cmdZTakesTheLineBackInOneStep    a real Cmd+Z in the empty composer: the list is one line shorter again
//   moveBackIsWrittenCanonical       "Move bar 3 back" typed, Enter, Enter: the last line is "Move bar 3 one bar left."
//   removeIsWrittenAsDelete          "Remove bar 2" typed, Enter, Enter: "Delete bar 2."
//   twoPlacesIsRefusedInWords        "Move bar 3 two bars left." Enter: the dialog says: Say "Move bar 3 one bar left." twice. ; nothing written; the sentence service was not asked
//   morphBetweenByClicks             "Morph", a click on bar 2, a click on bar 3, then typed " across 5 bars", Enter, Enter: the last line is "Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3."
//   duplicateNoteLinkTypedStillWorks "Duplicate [[bar_009]]." typed, Enter: the preview "Copy [[bar_009]] to a new bar." (the 0992 note copy), Esc discards
//   noRedAnywhereInTheDialog, noTooltipAnywhere, noHorizontalOverflow     as in measure-duplicate-bar.mjs
// 2026-11-19-0999 (EXTENDED, not a new script; WRITTEN, NOT RUN by the builder: the supervisor runs it) - the click with no head yet, and bars clicked out of order. The stand-in note of every OLD verdict has a head (an Extend line), so NO old verdict moves
// (morphBetweenByClicks still says bar N: the list has a head). New verdicts, each suffixed _<width>_<theme>:
//   headlessExtendMixMorphClickGivesTheNoteLink   the note holds an EMPTY phrase (no head line; the Score stand-in still shows its 8 bars): "Extend", "Mix", "Morph" typed with real keys, a real click on each of the 8 bars: "<Verb> [[<note that made THAT bar>]]" (the 0992a link)
//   headlessLinkClickNoPreviewNoPinNoWrite        after those 24 clicks focus is in the field every time, no live preview, nothing pinned, created or written
//   headedExtendMixMorphClickGivesBarN            the note HAS a head (the usual stand-in): the same three words, the same eight clicks: "<Verb> bar N"
//   headlessOtherSixStillGiveBarN                 the empty-phrase note, "Duplicate", "Copy", "Move", "Delete", "Remove", "Keep" typed, a click on bar 3 and on bar 6: "<Verb> bar 3", "<Verb> bar 6" (they need no head)
//   headByClicksThenBarStep                       empty phrase: "Morph", click bar 2, " into", click bar 3, " over 5 bars, in musical order." Enter, Enter: the list is the ONE head line "Morph [[bar_005]] into [[bar_009]] over 5 bars, in musical order."; then "Morph" and a click on bar 4 says "Morph bar 4"
//   outOfOrderClickFieldIsInClickOrder            "Delete", a real click on bar 5, then on bar 3: the field says "Delete bar 5 and bar 3"
//   outOfOrderEnterPreviewsCanonical              Enter: the preview says "Delete bar 3 and bar 5." (a live preview, nothing written, the sentence service not asked)
//   outOfOrderSecondEnterAppliesOneSortedLine     Enter again: the list's last line is "Delete bar 3 and bar 5.", exactly ONE process call, the composer empty
//   outOfOrderCmdZTakesItBackInOneStep            a real Cmd+Z in the empty composer: the list is one line shorter again
//   overlapAndTouchingAreRefusedInWords           "Delete bars 3 to 5 and bar 4" Enter: the dialog says "bar 4 is in both bars 3 to 5 and bar 4"; "Keep bar 4 and bar 3" Enter: "say bars 3 to 4."; no preview, nothing written, the service not asked
// Screenshots (new): barwords-headless-<w>-<theme>.png (after "Extend [[bar_005]]" from a click, empty phrase), barwords-outoforder-<w>-<theme>.png (the canonical preview after bars 5 and 3).
// 2026-11-19-0999b (EXTENDED, not a new script; WRITTEN, NOT RUN by the builder: the supervisor runs it) - Mix and Extend as steps of a phrase, with place words. The stand-in note of every OLD verdict has a head (an Extend line), so NO old verdict moves. New verdicts, each suffixed _<width>_<theme>:
//   mixClicksGiveBarNAndPreviewTheCanonicalSentence   "Mix" typed with real keys, a real click on bar 2 and on bar 3: the field says "Mix bar 2 and bar 3"; Enter previews "Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3." (a live preview; nothing written; the service not asked)
//   mixEnterAppliesOneLineCmdZTakesItBack             Enter again: the list's last line is that sentence, exactly ONE process call, the composer empty; a real Cmd+Z in the empty composer: the list is one line shorter again
//   extendClickAndTypedWordsPreviewReplace            "Extend", a click on bar 2, typed " to 4 bars", Enter: the preview says "Extend bar 2 to 4 bars, repeating with fills." (no place: it REPLACES bar 2); Enter applies ONE line; Cmd+Z takes it back
//   extendWithAPlaceWordPreviewsInsert                "Extend bar 2 to 4 bars and put them at the end." typed, Enter: the preview says "Extend bar 2 to 4 bars, repeating with fills, and put them at the end." (a place word: the bar STAYS and the 4 bars are INSERTED)
//   typedMixPlaceWordsPreviewThePlace                 "Mix bars 2 and 3." and "Mix bars 2 and 5 and put it at the start." typed: the previews say the place ("between bars 2 and 3", "at the start")
//   randomMixPathDrawsItsSeedOnceAtThePreview         "Mix bars 2 and 3, as a path, in seeded order." Enter: the preview names a seed ("seed N"); Enter: the list's last line IS the previewed sentence
//   mixAndExtendWithNoHeadAreRefusedInWords           the note holds an EMPTY phrase: "Mix bars 2 and 3." and "Extend bar 2 to 4 bars." Enter: the dialog says "A phrase starts with Extend, Mix, Morph or Take"; nothing written; the service not asked
//   extendOfSeveralBarsIsRefusedInWords               "Extend bars 2 and 3 to 4 bars." Enter: the dialog says: Say "Extend bar 2 to 4 bars." ; no preview, nothing written, the service not asked
// Screenshots (new): barwords-mix-<w>-<theme>.png (the Mix preview), barwords-extend-insert-<w>-<theme>.png (the Extend-with-a-place preview).
// HARNESS LESSONS (kept): every mount is a FRESH host element; no page global named like a read-only window property (never "closed", "name", "status"...); no backticks inside the page's template literal (this file's page text is one).
// Screenshots: barwords-duplicate-<w>-<theme>.png (after "Duplicate bar 3 and bar 5"), barwords-refused-<w>-<theme>.png (the two-places refusal), barwords-applied-<w>-<theme>.png (after the apply).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/bar-words')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: {
    contents: [
      "export { createDescriptionController } from './src/description-apply.ts';",
      "export { descriptionPortsFor } from './src/description-wiring.ts';",
      "export { emptyPhraseNote } from './src/empty-note-core.ts';",
      "export { noteContentFor } from './src/phrase-core.ts';",
      "export { listOfNote } from './src/sentence-list-note-core.ts';",
      "export { planNewBar } from './src/score-first-core.ts';",
      "export { attachArtifactInspector } from './src/artifact-inspector-core.ts';",
      "export { pinnedNoteFor } from './src/linked-panes-core.ts';",
      "export { phraseProvenance } from './src/phrase-lineage-core.ts';",
      "export { barNumberOf } from './src/duplicate-sentence-core.ts';",
    ].join(' '), resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --text-accent:#705dcf; --interactive-accent:#7b6cd9; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --text-accent:#a99bf0; --interactive-accent:#8875ff; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
/* Obsidian's own button rules (app.css): user-select none, the grey button background and shadow of button:not(.clickable-icon), the hover tint; the plugin's styles.css must beat them for the dialog link */
button { --text-color: var(--text-normal); display:inline-flex; align-items:center; justify-content:center; color: var(--text-color); font-size: 13px; border-radius: 6px; border:0; padding: 4px 12px; height: 30px; font-weight: 500; user-select: none; white-space: nowrap; }
button:not(.clickable-icon) { color: var(--text-color); background-color: #e3e3e3; box-shadow: 0 1px 1px 0 rgba(0,0,0,0.2); }
button:hover { background-color: #d8d8d8; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.3); }
.stand-in-note { margin:6px 8px; color: var(--text-muted); font-size:12px; }
.stand-in-score { display:block; width:100%; height:90px; }
.stand-in-score .bar-box { fill: var(--background-secondary); stroke: var(--background-modifier-border); stroke-width:1; }
.stand-in-score .bar-label { fill: var(--text-muted); font-size:11px; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1100px;height:640px"><div id="host" style="height:640px;width:1100px"></div></div>
<script>${bundle}</script><script>
var VAULT_BARS = ['bar_002', 'bar_005', 'bar_007', 'bar_009'];
var PATH = 'phrases/phrase_020.md';
var EXTEND = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '3': 'bars/bar_009', '6': 'bars/bar_002' } };
window.keys = [];
document.addEventListener('keydown', function (e) { setTimeout(function () { window.keys.push({ key: e.key, meta: e.metaKey, prevented: e.defaultPrevented }); }, 0); }, false);
window.setup = function (width, noHead) {
  if (window.ctl) window.ctl.dispose();
  if (window.layer) window.layer.dispose();
  window.shifted = 0; window.notes = new Map(); window.processCalls = 0; window.creates = []; window.trashed = []; window.opened = []; window.pinTold = []; window.serviceCalls = 0;
  var bar = cp.planNewBar({ existingBasenames: [], exists: function () { return false; } }).content;
  VAULT_BARS.forEach(function (n) { window.notes.set('bars/' + n + '.md', bar.split('bar_001').join(n)); });
  window.phraseText = cp.noteContentFor('phrase_020', EXTEND);
  window.notes.set(PATH, noHead ? cp.emptyPhraseNote('phrase_020') : window.phraseText);          // 2026-11-19-0999: noHead = a phrase with no head line (the Score stand-in still draws its 8 bars)
  var old = document.getElementById('host'); var host = document.createElement('div'); host.id = 'host'; old.parentNode.replaceChild(host, old);      // a NEW element per mount, as a new tab is
  host.className = ''; host.removeAttribute('style'); host.style.height = '640px'; host.style.width = width + 'px'; host.innerHTML = '';
  document.getElementById('frame').style.width = width + 'px';
  // the Score stand-in: an svg of eight bar groups (g.measure with the id the inspector maps), real geometry for real mouse clicks
  var score = document.createElement('div'); score.className = 'forge-rhythm-edit-score'; score.style.cssText = 'padding:8px;'; host.appendChild(score);
  var note = document.createElement('div'); note.className = 'stand-in-note'; note.textContent = 'Score stand-in: eight bars of an extend with two forks (the engraving is drawn in Obsidian)'; score.appendChild(note);
  var svgns = 'http://www.w3.org/2000/svg'; var svg = document.createElementNS(svgns, 'svg'); svg.setAttribute('class', 'stand-in-score'); svg.setAttribute('viewBox', '0 0 800 90'); svg.setAttribute('preserveAspectRatio', 'none'); score.appendChild(svg);
  var infos = [];
  for (var i = 1; i <= 8; i++) {
    var g = document.createElementNS(svgns, 'g'); g.setAttribute('class', 'measure'); g.setAttribute('id', 'ph_bar_' + i);
    var r = document.createElementNS(svgns, 'rect'); r.setAttribute('class', 'bar-box'); r.setAttribute('x', String((i - 1) * 100 + 2)); r.setAttribute('y', '4'); r.setAttribute('width', '96'); r.setAttribute('height', '80'); g.appendChild(r);
    var t = document.createElementNS(svgns, 'text'); t.setAttribute('class', 'bar-label'); t.setAttribute('x', String((i - 1) * 100 + 12)); t.setAttribute('y', '48'); t.textContent = 'bar ' + i; g.appendChild(t);
    svg.appendChild(g); infos.push({ id: 'ph_bar_' + i, index: i, tempo: 100 });
  }
  var map = cp.phraseProvenance('phrases/phrase_020', EXTEND, infos);
  window.layer = cp.attachArtifactInspector({
    root: score, map: map, onHover: function () {}, onPin: function (e) { window.pinTold.push(e ? e.id : null); },
    keepPinOnControls: true,
    selectBars: { barOf: function (prov) { return prov.params.bar; }, onRange: function () {}, onShiftClick: function () { window.shifted = (window.shifted || 0) + 1; }, onToggleClick: function () {} },
    // the same lines phrase-dom.ts copyClickPort has: armed from the controller, the note that made the bar from pinnedNoteFor, and (0996b) the bar's number
    copyClick: {
      armed: function () { return window.ctl.duplicateArmed(PATH); },
      onBar: function (e) { var pin = cp.pinnedNoteFor(e.prov); window.ctl.duplicateClick(PATH, pin ? pin.noteId : null, cp.barNumberOf(e.prov.params, false)); },
    },
  });
  var ports = cp.descriptionPortsFor({
    read: function (p) { var t = window.notes.get(p); return t === undefined ? Promise.reject(new Error('File not found')) : Promise.resolve(t); },
    process: function (p, fn) { window.processCalls++; return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) window.notes.set(p, next); }); },
    basenamesIn: function (folder) { var out = []; window.notes.forEach(function (v, k) { if (k.indexOf(folder + '/') === 0) out.push(k.slice(folder.length + 1).replace(/[.]md$/, '')); }); return out; },
    panes: function () { return [{ path: PATH, contentEl: host, tab: true }]; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {}, warn: function () {},
    create: function (p, c) { if (window.notes.has(p)) return Promise.reject(new Error('File already exists.')); window.notes.set(p, c); window.creates.push(p); return Promise.resolve(); },
    trash: function (p) { window.trashed.push(p); window.notes.delete(p); return Promise.resolve(); },
    exists: function (p) { return window.notes.has(p); }, isAlreadyExists: function (e) { return /already exists/i.test((e && e.message) || ''); },
  }, {
    askPlan: function () { window.serviceCalls++; return Promise.resolve({ status: 200, json: {} }); }, planConfigured: function () { return true; },
    openNote: function (id) { window.opened.push(id); },
    composerMenu: function () { return { items: [{ id: 'p', label: 'New phrase' }, { id: 'b', label: 'New bar' }], run: function () {} }; },
  });
  window.ctl = cp.createDescriptionController(ports);
  return window.ctl.inspect(PATH).then(function () { window.ctl.syncBars(); });
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.fieldValue = function () { var f = document.querySelector('.forge-prompt-box-text'); return f ? f.value : null; };
window.focusIsField = function () { return document.activeElement === document.querySelector('.forge-prompt-box-text'); };
window.dialog = function () { return [].map.call(document.querySelectorAll('.forge-chat-msg'), function (m) { return { kind: m.getAttribute('data-kind'), text: (m.querySelector('.forge-chat-text') || {}).textContent || '' }; }); };
window.suggestion = function () { var l = document.querySelectorAll('.forge-chat-suggestion-description'); return l.length ? l[l.length - 1].textContent : ''; };
window.livePreview = function () { var c = document.querySelectorAll('.forge-chat-msg[data-kind="suggestion"] .forge-chat-chosen'); return c.length > 0 && c[c.length - 1].textContent === 'Press Enter to apply, Esc to discard'; };
window.list = function () { return cp.listOfNote(window.notes.get(PATH), 'phrase', { bars: VAULT_BARS, phrases: [], arrangements: [], compositions: [], kits: [] }).list; };
window.pinned = function () { return window.layer.pinnedId(); };
window.hueRed = function (c) { var m = /rgba?\\((\\d+)[, ]+(\\d+)[, ]+(\\d+)/.exec(c); if (!m) return false; var R = +m[1] / 255, G = +m[2] / 255, B = +m[3] / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; var h; if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4; h = h * 60; if (h < 0) h += 360; return h < 20 || h > 340; };
window.redFound = function () { var out = []; [].forEach.call(document.querySelectorAll('#host *'), function (el) { var cs = getComputedStyle(el); [cs.color, cs.backgroundColor, cs.borderTopColor].forEach(function (c) { if (c && hueRed(c)) out.push(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className); }); }); return out; };
</script>`;
const p = await openPage({ dir: '/', width: 1200, height: 760, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const MOD = { meta: 4, ctrl: 2, shift: 8, alt: 1 };
const key = async (k, code, vk, mods = 0, text) => { await p.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(120); };
const ENTER = () => key('Enter', 'Enter', 13, 0, '\r');
const ESC = () => key('Escape', 'Escape', 27);
const CMD_Z = () => key('z', 'KeyZ', 90, MOD.meta);
const CMD_SHIFT_Z = () => key('Z', 'KeyZ', 90, MOD.meta + MOD.shift);
const focusField = () => ev(`document.querySelector('.forge-prompt-box-text').focus()`);
const clearField = async () => { await focusField(); await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8); };
const typeText = async (text) => { await focusField(); await p.send('Input.insertText', { text }); await sleep(120); };
const mounted = async () => { for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('.forge-prompt-box-text')`)) return true; await sleep(100); } return false; };
const clickBar = async (n, modifiers = 0) => {
  const b = await ev(`box('#ph_bar_${n} rect')`);
  if (modifiers === 0) { await p.click(b.x, b.y); }
  else { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y }); await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers }); }
  await sleep(250);
};
/** a sentence of the list, applied by real keys: typed, Enter (the preview), Enter (the write) */
const sayApplied = async (text) => { await typeText(text); await ENTER(); await sleep(250); await ENTER(); await sleep(350); };
const lastNotice = () => ev(`(function () { var n = window.dialog().filter(function (d) { return d.kind === 'notice'; }); return n.length ? n[n.length - 1].text : ''; })()`);

const EXPECT = ['bar_005', 'bar_005', 'bar_009', 'bar_005', 'bar_005', 'bar_002', 'bar_005', 'bar_005'];
const mount = async (w, noHead = false) => { await ev(`setup(${w}, ${noHead})`); await mounted(); await sleep(300); };

for (const w of [800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`);

  // ---- a bar word first: a click on EVERY bar inserts its number ---------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const dup = [], move = [], focuses = [], lives = [];
  for (const [word, into] of [['Duplicate', dup], ['Move', move]]) for (let i = 1; i <= 8; i++) {
    await clearField(); await typeText(word); await clickBar(i);
    into.push(await ev('fieldValue()')); focuses.push(await ev('focusIsField()')); lives.push(await ev('livePreview()'));
    if (word === 'Duplicate' && i === 3) await p.shot(path.join(OUT, `barwords-click-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  }
  numbers[`barClicks@${tag}`] = { dup, move };
  verdict[`duplicateClickInsertsBarN_${tag}`] = dup.length === 8 && dup.every((v, i) => v === `Duplicate bar ${i + 1}`);
  verdict[`moveClickInsertsBarN_${tag}`] = move.length === 8 && move.every((v, i) => v === `Move bar ${i + 1}`);
  verdict[`barClicksReturnFocusNoPreviewNoPin_${tag}`] = focuses.every((x) => x === true) && lives.every((x) => x === false) && (await ev('creates.length')) === 0 && (await ev('pinned()')) === null && (await ev('pinTold.length')) === 0 && (await ev('processCalls')) === 0;

  // ---- any other text: the note link (0992a); the empty composer pins ---------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const foo = [];
  for (let i = 1; i <= 8; i++) { await clearField(); await typeText('Foo'); await clickBar(i); foo.push(await ev('fieldValue()')); }
  verdict[`fooInsertsTheNoteLink_${tag}`] = foo.length === 8 && foo.every((v, i) => v === `Foo [[${EXPECT[i]}]]`);
  await clearField(); await clickBar(5);
  verdict[`emptyComposerPins_${tag}`] = (await ev('pinned()')) === 'ph_bar_5' && (await ev('fieldValue()')) === '';

  // ---- a second click adds "and bar M"; the caret; Shift+click ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  await typeText('Duplicate'); await clickBar(3); await clickBar(5);
  const two = await ev('fieldValue()');
  await p.shot(path.join(OUT, `barwords-duplicate-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  await clickBar(7);
  verdict[`secondClickAddsAnd_${tag}`] = two === 'Duplicate bar 3 and bar 5' && (await ev('fieldValue()')) === 'Duplicate bar 3 and bar 5 and bar 7';
  await clearField(); await typeText('Keep and bar 8.'); await ev(`(function () { var f = document.querySelector('.forge-prompt-box-text'); f.setSelectionRange(4, 4); })()`); await clickBar(2);
  verdict[`clickGoesAtTheCaret_${tag}`] = (await ev('fieldValue()')) === 'Keep bar 2 and bar 8.' && (await ev('pinned()')) === null;
  await clearField(); await typeText('Delete'); const pinBefore = await ev('pinned()'); await clickBar(7, MOD.shift);
  verdict[`shiftClickIsStillSelection_${tag}`] = (await ev('pinned()')) === pinBefore && (await ev('fieldValue()')) === 'Delete' && (await ev('window.shifted || 0')) === 1;

  // ---- Enter applies ONE line, one undo ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const before = (await ev('list()')).length;
  await typeText('Duplicate'); await clickBar(3); await ENTER(); await sleep(300);
  const previewText = await ev('suggestion()');
  await ENTER(); await sleep(350);
  const after = await ev('list()');
  verdict[`enterAppliesOneLine_${tag}`] = /Copy bar 3[.]/.test(previewText) && after.length === before + 1 && after[after.length - 1] === 'Copy bar 3.' && (await ev('processCalls')) === 1 && (await ev('creates.length')) === 0 && (await ev('fieldValue()')) === '';
  await p.shot(path.join(OUT, `barwords-applied-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`cmdZTakesTheLineBackInOneStep_${tag}`] = (await ev('list()')).length === before;
  await sayApplied('Move bar 3 back');
  verdict[`moveBackIsWrittenCanonical_${tag}`] = (await ev('list()')).pop() === 'Move bar 3 one bar left.';
  await sayApplied('Remove bar 2');
  verdict[`removeIsWrittenAsDelete_${tag}`] = (await ev('list()')).pop() === 'Delete bar 2.';

  // ---- two places: read and refused in words -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const lenBefore = (await ev('list()')).length;
  await typeText('Move bar 3 two bars left.'); await ENTER(); await sleep(350);
  const said = await ev('dialog()');
  verdict[`twoPlacesIsRefusedInWords_${tag}`] = said.some((d) => d.text.indexOf('Say "Move bar 3 one bar left." twice.') >= 0) && (await ev('list()')).length === lenBefore && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0;
  await p.shot(path.join(OUT, `barwords-refused-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });

  // ---- Morph by two clicks and a typed length ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  await typeText('Morph'); await clickBar(2); await clickBar(3);
  const morphField = await ev('fieldValue()');
  await typeText(' across 5 bars'); await ENTER(); await sleep(300); await ENTER(); await sleep(350);
  verdict[`morphBetweenByClicks_${tag}`] = morphField === 'Morph bar 2 and bar 3' && (await ev('list()')).pop() === 'Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.';

  // ---- the 0992 note copy, typed, is unchanged -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(300);
  verdict[`duplicateNoteLinkTypedStillWorks_${tag}`] = (await ev('suggestion()')) === 'Copy [[bar_009]] to a new bar.' && (await ev('livePreview()')) === true && (await ev('creates.length')) === 0;
  await ESC();

  // ---- 2026-11-19-0999: the click with no head yet (Extend, Mix, Morph give the note link; once there is a head, bar N) ---------------------------------------------------------------------------------------------------
  await mount(w, true);
  const headless = {}, hfocus = [], hlive = [];
  for (const word of ['Extend', 'Mix', 'Morph']) { headless[word] = []; for (let i = 1; i <= 8; i++) { await clearField(); await typeText(word); await clickBar(i); headless[word].push(await ev('fieldValue()')); hfocus.push(await ev('focusIsField()')); hlive.push(await ev('livePreview()')); if (word === 'Extend' && i === 1) await p.shot(path.join(OUT, `barwords-headless-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 }); } }
  numbers[`headless@${tag}`] = headless;
  verdict[`headlessExtendMixMorphClickGivesTheNoteLink_${tag}`] = ['Extend', 'Mix', 'Morph'].every((word) => headless[word].length === 8 && headless[word].every((v, i) => v === `${word} [[${EXPECT[i]}]]`));
  verdict[`headlessLinkClickNoPreviewNoPinNoWrite_${tag}`] = hfocus.length === 24 && hfocus.every((x) => x === true) && hlive.every((x) => x === false) && (await ev('creates.length')) === 0 && (await ev('pinned()')) === null && (await ev('pinTold.length')) === 0 && (await ev('processCalls')) === 0;
  await mount(w);
  const headed = {};
  for (const word of ['Extend', 'Mix', 'Morph']) { headed[word] = []; for (let i = 1; i <= 8; i++) { await clearField(); await typeText(word); await clickBar(i); headed[word].push(await ev('fieldValue()')); } }
  verdict[`headedExtendMixMorphClickGivesBarN_${tag}`] = ['Extend', 'Mix', 'Morph'].every((word) => headed[word].length === 8 && headed[word].every((v, i) => v === `${word} bar ${i + 1}`));
  await mount(w, true);
  const six = [];
  for (const word of ['Duplicate', 'Copy', 'Move', 'Delete', 'Remove', 'Keep']) for (const n of [3, 6]) { await clearField(); await typeText(word); await clickBar(n); six.push([await ev('fieldValue()'), `${word} bar ${n}`]); }
  verdict[`headlessOtherSixStillGiveBarN_${tag}`] = six.length === 12 && six.every(([got, want]) => got === want) && (await ev('pinned()')) === null;
  await mount(w, true);
  await typeText('Morph'); await clickBar(2); await typeText(' into'); await clickBar(3); await typeText(' over 5 bars, in musical order.');
  const headField = await ev('fieldValue()');
  await ENTER(); await sleep(300); await ENTER(); await sleep(350);
  const headList = await ev('list()');
  await typeText('Morph'); await clickBar(4);
  verdict[`headByClicksThenBarStep_${tag}`] = headField === 'Morph [[bar_005]] into [[bar_009]] over 5 bars, in musical order.' && headList.length === 1 && headList[0] === 'Morph [[bar_005]] into [[bar_009]] over 5 bars, in musical order.' && (await ev('fieldValue()')) === 'Morph bar 4';

  // ---- 2026-11-19-0999: bars clicked out of order (Delete, bar 5 then bar 3) ------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const ooBefore = (await ev('list()')).length;
  await typeText('Delete'); await clickBar(5); await clickBar(3);
  const ooField = await ev('fieldValue()');
  verdict[`outOfOrderClickFieldIsInClickOrder_${tag}`] = ooField === 'Delete bar 5 and bar 3' && (await ev('pinned()')) === null;
  await ENTER(); await sleep(350);
  const ooPreview = await ev('suggestion()'), ooLive = await ev('livePreview()');
  await p.shot(path.join(OUT, `barwords-outoforder-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  verdict[`outOfOrderEnterPreviewsCanonical_${tag}`] = ooPreview === 'Delete bar 3 and bar 5.' && ooLive === true && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0 && (await ev('list()')).length === ooBefore;
  await ENTER(); await sleep(400);
  const ooAfter = await ev('list()');
  verdict[`outOfOrderSecondEnterAppliesOneSortedLine_${tag}`] = ooAfter.length === ooBefore + 1 && ooAfter[ooAfter.length - 1] === 'Delete bar 3 and bar 5.' && (await ev('processCalls')) === 1 && (await ev('serviceCalls')) === 0 && (await ev('fieldValue()')) === '';
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`outOfOrderCmdZTakesItBackInOneStep_${tag}`] = (await ev('list()')).length === ooBefore;
  await mount(w);
  const refusals = []; const listBefore = (await ev('list()')).length;      // 2026-11-19-0999 supervisor fix: the note is not a fresh one-line note here, so compare with its length BEFORE the refused sentences
  for (const [typed, words] of [['Delete bars 3 to 5 and bar 4', 'bar 4 is in both bars 3 to 5 and bar 4'], ['Keep bar 4 and bar 3', 'say bars 3 to 4.']]) {
    await clearField(); await typeText(typed); await ENTER(); await sleep(350);
    refusals.push((await ev('dialog()')).some((d) => d.text.indexOf(words) >= 0) && (await ev('livePreview()')) === false);
  }
  verdict[`overlapAndTouchingAreRefusedInWords_${tag}`] = refusals.length === 2 && refusals.every((x) => x === true) && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0 && (await ev('list()')).length === listBefore;

  // ---- 2026-11-19-0999b: Mix and Extend as steps, with place words --------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  const mixBefore = (await ev('list()')).length;
  await clearField(); await typeText('Mix'); await clickBar(2); await clickBar(3);
  const mixField = await ev('fieldValue()');
  await ENTER(); await sleep(350);
  const mixPreview = await ev('suggestion()');
  await p.shot(path.join(OUT, `barwords-mix-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  verdict[`mixClicksGiveBarNAndPreviewTheCanonicalSentence_${tag}`] = mixField === 'Mix bar 2 and bar 3' && mixPreview === 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.' && (await ev('livePreview()')) === true && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0 && (await ev('list()')).length === mixBefore;
  await ENTER(); await sleep(400);
  const mixAfter = await ev('list()');
  const mixApplied = mixAfter.length === mixBefore + 1 && mixAfter[mixAfter.length - 1] === 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.' && (await ev('processCalls')) === 1 && (await ev('serviceCalls')) === 0 && (await ev('fieldValue()')) === '';
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`mixEnterAppliesOneLineCmdZTakesItBack_${tag}`] = mixApplied && (await ev('list()')).length === mixBefore;

  await mount(w);
  const extBefore = (await ev('list()')).length;
  await clearField(); await typeText('Extend'); await clickBar(2);
  const extField = await ev('fieldValue()');
  await typeText(' to 4 bars'); await ENTER(); await sleep(350);
  const extPreview = await ev('suggestion()');
  const extPreviewed = extField === 'Extend bar 2' && extPreview === 'Extend bar 2 to 4 bars, repeating with fills.' && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0;
  await ENTER(); await sleep(400);
  const extAfter = await ev('list()');
  const extApplied = extAfter.length === extBefore + 1 && extAfter[extAfter.length - 1] === 'Extend bar 2 to 4 bars, repeating with fills.' && (await ev('processCalls')) <= 2 && (await ev('fieldValue()')) === '';      // supervisor fix: the preview and the apply each cost one engine call here (two in all); one LINE and one undo is what is asserted
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`extendClickAndTypedWordsPreviewReplace_${tag}`] = extPreviewed && extApplied && (await ev('list()')).length === extBefore;

  await mount(w);
  await clearField(); await typeText('Extend bar 2 to 4 bars and put them at the end.'); await ENTER(); await sleep(350);
  await p.shot(path.join(OUT, `barwords-extend-insert-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  verdict[`extendWithAPlaceWordPreviewsInsert_${tag}`] = (await ev('suggestion()')) === 'Extend bar 2 to 4 bars, repeating with fills, and put them at the end.' && (await ev('livePreview()')) === true && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0;
  await ESC();

  await mount(w);
  const places = [];
  for (const [typed, want] of [['Mix bars 2 and 3.', 'Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.'], ['Mix bars 2 and 5 and put it at the start.', 'Mix bars 2 and 5, 50 percent bar 2, as a vote, and put it at the start.']]) {
    await clearField(); await typeText(typed); await ENTER(); await sleep(350); places.push((await ev('suggestion()')) === want); await ESC(); await sleep(150);
  }
  verdict[`typedMixPlaceWordsPreviewThePlace_${tag}`] = places.length === 2 && places.every((x) => x === true) && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0;

  await mount(w);
  const seedBefore = (await ev('list()')).length;
  await clearField(); await typeText('Mix bars 2 and 3, as a path, in seeded order.'); await ENTER(); await sleep(350);
  const seedPreview = await ev('suggestion()');
  await ENTER(); await sleep(400);
  const seedList = await ev('list()');
  verdict[`randomMixPathDrawsItsSeedOnceAtThePreview_${tag}`] = /^Mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed \d+, and put it between bars 2 and 3[.]$/.test(seedPreview) && seedList.length === seedBefore + 1 && seedList[seedList.length - 1] === seedPreview && (await ev('serviceCalls')) === 0;

  await mount(w, true);
  const noHeadSaid = [];
  for (const typed of ['Mix bars 2 and 3.', 'Extend bar 2 to 4 bars.']) {
    await clearField(); await typeText(typed); await ENTER(); await sleep(350);
    noHeadSaid.push((await ev('dialog()')).some((d) => d.text.indexOf('A phrase starts with Extend, Mix, Morph or Take') >= 0) && (await ev('livePreview()')) === false);
  }
  verdict[`mixAndExtendWithNoHeadAreRefusedInWords_${tag}`] = noHeadSaid.length === 2 && noHeadSaid.every((x) => x === true) && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0;

  await mount(w);
  const severalBefore = (await ev('list()')).length;
  await clearField(); await typeText('Extend bars 2 and 3 to 4 bars.'); await ENTER(); await sleep(350);
  verdict[`extendOfSeveralBarsIsRefusedInWords_${tag}`] = (await ev('dialog()')).some((d) => d.text.indexOf('Say "Extend bar 2 to 4 bars."') >= 0) && (await ev('livePreview()')) === false && (await ev('processCalls')) === 0 && (await ev('serviceCalls')) === 0 && (await ev('list()')).length === severalBefore;

  // ---- general ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount(w);
  await typeText('Duplicate'); await clickBar(3); await ENTER(); await sleep(300);
  const red = await ev('redFound()');
  const tips = await ev(`[].filter.call(document.querySelectorAll('#host *'), function (e) { return e.hasAttribute('title') || e.hasAttribute('aria-label'); }).map(function (e) { return String(e.className.baseVal !== undefined ? e.className.baseVal : e.className); })`);
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
