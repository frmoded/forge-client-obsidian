// 2026-11-19-0992 - DUPLICATE A BAR FROM THE COMPOSER: what the driver sees, in REAL headless Chrome (CDP) with REAL mouse clicks on stand-in Score bars and REAL key events. Type "Duplicate", click a bar: its note's name appears in the prompt as
// ` [[bar_007]].`, focus is back in the field, the usual preview "Copy [[bar_007]] to a new bar." shows, and the bar is NOT pinned; Enter creates the copy, the dialog logs "Created [[bar_010]], a copy of [[bar_007]]." with links that open the notes;
// the NEXT click pins again. The plugin's own modules (src/description-apply.ts: the real controller, with the real chat panel, prompt box and dialog; src/artifact-inspector-core.ts: the REAL inspector whose click decides pin or copy; src/linked-panes-core.ts
// pinnedNoteFor: the rule that names the note that made a bar; src/phrase-lineage-core.ts: the bars' provenance of an extend with two forks; src/duplicate-*-core.ts), bundled with esbuild, run against an in-memory vault in a tab-shaped host with the
// REAL styles.css and Obsidian's CSS variables for a light and a dark theme. The SCORE here is a STAND-IN: an svg of eight bar groups (`g.measure`, the id the inspector reads), so the clicks are real mouse events through the real inspector; the engraving
// (Verovio, the engine) is NOT drawn and mountPhrase itself is not mounted (it needs the engine): its 8-line copy-click port (phrase-dom.ts `copyClickPort`) is restated in the page below from the same two controller methods, and the happy-dom test
// src/duplicate-click-wiring.test.ts runs the real mountPhrase. Obsidian itself is NOT driven. WRITTEN, NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-duplicate-bar.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// Widths: 800 (stacked) and 1100 (two columns); light and dark. The phrase: an extend of bar_005 to 8 bars with forks (bar 3 is bars/bar_009, bar 6 is bars/bar_002); the vault holds bar_002, bar_005, bar_007, bar_009 (the next free bar is bar_010). Per (width, theme):
//   clickEveryBar_*  (real insertText "Duplicate", a real mouse click at the centre of each of the 8 bars, a real Escape between)
//     copyClickAppendsTheNameOfEveryBar         the field says "Duplicate [[<note that made THAT bar>]]." for each bar (bar_005, bar_005, bar_009, bar_005, bar_005, bar_002, bar_005, bar_005)
//     copyClickShowsTheUsualPreview             the dialog's newest suggestion says "Copy [[<name>]] to a new bar." and the live preview is "Press Enter to apply, Esc to discard", for each bar
//     copyClickReturnsFocusToTheField           document.activeElement is the prompt field after each click
//     copyClickDoesNotPin                       the inspector's pin is still null and no pin was told, after all 8 clicks
//   nextClick_*
//     nextClickPinsAgain                        [MOVED by 0992a] after a copy click, a real click on another bar appends a second link and pins nothing (it pinned in 0992)
//     clickPinsWhenTheTextIsNotDuplicate        [MOVED by 0992a] with the field empty a click pins; with "Keep bars 1 to 2." in it the clicked bar's link is appended and the pin stays
//     shiftClickIsStillSelectionWhileArmed      a real Shift+click while the field says Duplicate pins nothing and appends nothing
//   enter_*  (the preview of bar 3, then a real Enter)
//     enterCreatesTheCopyAtTheNextFreeNumber    the vault has bars/bar_010, its json block equals bar_009's byte for byte, bar_009 is byte for byte what it was
//     dialogSaysCreatedWithLinks                [MOVED by 0992a] the dialog line is "Created bar_010, a copy of bar_009." and has two visible link buttons (each wider than 8 px) named bar_010 and bar_009
//     clickingTheLinkOpensTheCopy               a real click on the first link told the plugin's opener "bars/bar_010"
//     phraseNeverWritten                        the phrase note is byte for byte what it was, the controller made no `process` call, no write of the phrase
//     undoNotClaimed                            [MOVED by 0992a] the "does not take a copy back" line is gone; this harness has no trash port, so Cmd+Z leaves bars/bar_010 (the real undo: measure-duplicate-followups.mjs)
//     composerEmptyAfterApply                   the prompt line is empty again
//   escape_*
//     escDiscardsThePreview                     Duplicate, click a bar, a real Esc: nothing created, no live preview
//   typed_*
//     typedSentenceMakesTheCopy                 on a fresh mount, "Duplicate [[bar_007]]." typed with real keys, Enter (preview), Enter: bars/bar_010 exists and the phrase's list is unchanged
//     typedSentenceNeverAsksTheService          the sentence service was asked zero times
//     unknownLinkRefusedInPlainWords            "Duplicate [[bar_099]]." then Enter: the dialog says "There is no note called [[bar_099]] in this vault, so there is nothing to duplicate." and nothing is created
//   general_*
//     linkLooksLikeALink                        the link button is underlined, shows a pointer cursor, has no title or aria-label, and its colour is not red
//     noRedAnywhereInTheDialog                  no text colour or background of the dialog, the card and the stand-in has a red hue (judged by hue)
//     noTooltipAnywhere                         no element in the tab has a title or an aria-label attribute
//     noHorizontalOverflow                      the page, the tab and the card do not scroll sideways
// HARNESS LESSONS (kept): every mount is a FRESH host element (a reused element keeps what a disposed panel left on it and the controller mounts no box on it); no page global named like a read-only window property (never "closed", "name", "status"...); no backticks
// inside the page's template literal (this file's page text is one).
// Screenshots (light and dark, each width): duplicate-armed-preview-<w>-<theme>.png (the click on bar 3, the preview), duplicate-created-<w>-<theme>.png (after Enter: the dialog line and its links), duplicate-refused-<w>-<theme>.png (an unknown link).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/duplicate-bar')).replace(/^~/, os.homedir());
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
window.setup = function (width) {
  if (window.ctl) window.ctl.dispose();
  if (window.layer) window.layer.dispose();
  window.shifted = 0; window.notes = new Map(); window.processCalls = 0; window.creates = []; window.opened = []; window.pinTold = []; window.serviceCalls = 0;
  var bar = cp.planNewBar({ existingBasenames: [], exists: function () { return false; } }).content;
  VAULT_BARS.forEach(function (n) { window.notes.set('bars/' + n + '.md', bar.split('bar_001').join(n)); });
  window.phraseText = cp.noteContentFor('phrase_020', EXTEND);
  window.notes.set(PATH, window.phraseText);
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
    // the same eight lines phrase-dom.ts copyClickPort has: armed from the controller, the note that made the bar from pinnedNoteFor
    copyClick: {
      armed: function () { return window.ctl.duplicateArmed(PATH); },
      onBar: function (e) { var pin = cp.pinnedNoteFor(e.prov); window.ctl.duplicateClick(PATH, pin ? pin.noteId : null, e.prov.params.bar); },      // 2026-11-19-0996b: the bar's number rides along
    },
  });
  var ports = cp.descriptionPortsFor({
    read: function (p) { var t = window.notes.get(p); return t === undefined ? Promise.reject(new Error('File not found')) : Promise.resolve(t); },
    process: function (p, fn) { window.processCalls++; return Promise.resolve().then(function () { var cur = window.notes.get(p); var next = fn(cur); if (next !== cur) window.notes.set(p, next); }); },
    basenamesIn: function (folder) { var out = []; window.notes.forEach(function (v, k) { if (k.indexOf(folder + '/') === 0) out.push(k.slice(folder.length + 1).replace(/[.]md$/, '')); }); return out; },
    panes: function () { return [{ path: PATH, contentEl: host, tab: true }]; },
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {}, warn: function () {},
    create: function (p, c) { if (window.notes.has(p)) return Promise.reject(new Error('File already exists.')); window.notes.set(p, c); window.creates.push(p); return Promise.resolve(); },
    exists: function (p) { return window.notes.has(p); }, isAlreadyExists: function (e) { return /already exists/i.test((e && e.message) || ''); },
  }, {
    askPlan: function () { window.serviceCalls++; return Promise.resolve({ status: 200, json: {} }); }, planConfigured: function () { return true; },
    openNote: function (id) { window.opened.push(id); },
    composerAutoApply: function () { return false; },      // 2026-11-20-1002 (deliberate): the setting Preview before applying is ON in this harness: the flows below type a sentence and press Enter TWICE (the plugin default is ONE Enter: measure-duplicate-followups.mjs has the one-Enter verdicts)
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
const key = async (k, code, vk, mods = 0, text) => { await p.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: mods }); await sleep(60); };
const ENTER = () => key('Enter', 'Enter', 13, 0, '\r');
const ESC = () => key('Escape', 'Escape', 27);
const CMD_Z = () => key('z', 'KeyZ', 90, MOD.meta);
const focusField = () => ev(`document.querySelector('.forge-prompt-box-text').focus()`);
const clearField = async () => { await focusField(); await ev(`document.querySelector('.forge-prompt-box-text').select()`); await key('Backspace', 'Backspace', 8); };
/** real typing into the focused field */
const typeText = async (text) => { await focusField(); await p.send('Input.insertText', { text }); await sleep(120); };
const mounted = async () => { for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('.forge-prompt-box-text')`)) return true; await sleep(100); } return false; };
/** a REAL mouse click at the centre of bar n of the stand-in Score */
const clickBar = async (n, modifiers = 0) => {
  const b = await ev(`box('#ph_bar_${n} rect')`);
  if (modifiers === 0) { await p.click(b.x, b.y); }
  else { await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y }); await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, modifiers }); }
  await sleep(250);
};
const EXPECT = ['bar_005', 'bar_005', 'bar_009', 'bar_005', 'bar_005', 'bar_002', 'bar_005', 'bar_005'];

for (const w of [800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`);

  // ---- 2026-11-19-0996b (MOVED): "Duplicate" + a click on a bar is a BAR WORD click now (" bar N": measure-bar-words.mjs). The four click verdicts of 0992 (copyClickAppendsTheNameOfEveryBar, copyClickShowsTheUsualPreview, copyClickReturnsFocusToTheField, copyClickDoesNotPin)
  // are replaced by the TYPED sentence for every note the eight bars name: the usual preview, and nothing pinned.
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  const names = [], previews = [], live = [];
  for (let i = 0; i < 8; i++) {
    await clearField(); await typeText(`Duplicate [[${EXPECT[i]}]].`); await ENTER(); await sleep(250);
    names.push(await ev('fieldValue()')); previews.push(await ev('suggestion()')); live.push(await ev('livePreview()'));
    if (i === 2) await p.shot(path.join(OUT, `duplicate-armed-preview-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
    await ESC();
  }
  numbers[`typedEveryNote@${tag}`] = { names, previews };
  verdict[`typedSentenceGivesTheUsualPreviewForEveryNote_${tag}`] = previews.every((s, i) => s === `Copy [[${EXPECT[i]}]] to a new bar.`) && live.length === 8 && live.every((x) => x === true) && (await ev('creates.length')) === 0;
  verdict[`typedSentenceDoesNotPin_${tag}`] = (await ev('pinned()')) === null && (await ev('pinTold.length')) === 0;

  // ---- other states pin; Shift+click is still selection ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  // 2026-11-19-0996b (MOVED): nextClickPinsAgain and clickPinsWhenTheTextIsNotDuplicate described the 0992 click on the word Duplicate; the click is a bar word click now (measure-bar-words.mjs: "Duplicate bar 3 and bar 5"). What stays true is checked here: an EMPTY field pins, other text gets the note link and pins nothing.
  await clickBar(5); const p5 = await ev('pinned()');
  await typeText('Make it 8 bars long.'); await clickBar(6); const p6 = await ev('pinned()'); const f6 = await ev('fieldValue()');
  verdict[`clickPinsWhenTheTextIsNotDuplicate_${tag}`] = p5 === 'ph_bar_5' && p6 === 'ph_bar_5' && f6 === 'Make it 8 bars long. [[bar_002]]';
  await clearField(); await typeText('Duplicate'); const pinBefore = await ev('pinned()'); await clickBar(7, MOD.shift);
  verdict[`shiftClickIsStillSelectionWhileArmed_${tag}`] = (await ev('pinned()')) === pinBefore && (await ev('fieldValue()')) === 'Duplicate' && (await ev('window.shifted || 0')) === 1;

  // ---- Enter makes the copy of bar 3 (the fork, bar_009) -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  const phraseBefore = await ev('phraseText'); const srcBefore = await ev(`notes.get('bars/bar_009.md')`);
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(250);       // 2026-11-19-0996b (MOVED): typed (it was the word and a click on bar 3, the fork bar_009)
  await ENTER(); await sleep(300);
  const made = await ev(`({ creates: creates.slice(), copy: notes.get('bars/bar_010.md') || '', src: notes.get('bars/bar_009.md'), phrase: notes.get(PATH), calls: processCalls, dialog: dialog(), field: fieldValue(),
    links: [].map.call(document.querySelectorAll('.forge-chat-link'), function (b) { var r = b.getBoundingClientRect(); return { text: b.textContent, w: r.width, h: r.height }; }) })`);
  numbers[`enter@${tag}`] = { creates: made.creates, links: made.links, dialog: made.dialog.slice(-3) };
  verdict[`enterCreatesTheCopyAtTheNextFreeNumber_${tag}`] = made.creates.length === 1 && made.creates[0] === 'bars/bar_010.md' && made.copy.slice(made.copy.indexOf('{')) === srcBefore.slice(srcBefore.indexOf('{')) && made.src === srcBefore;
  const applied = made.dialog.filter((d) => d.kind === 'applied').pop();
  // 2026-11-19-0992a (deliberate, MOVED): the sentence is plain and the names are the buttons' own text ("bar_010", not "[[bar_010]]")
  verdict[`dialogSaysCreatedWithLinks_${tag}`] = !!applied && applied.text.replace(/^✓\s*/, '') === 'Created bar_010, a copy of bar_009.' && made.links.length === 2 && made.links[0].text === 'bar_010' && made.links[1].text === 'bar_009' && made.links.every((l) => l.w > 8 && l.h > 8);
  await p.shot(path.join(OUT, `duplicate-created-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  const linkBox = await ev(`box('.forge-chat-link')`); await p.click(linkBox.x, linkBox.y); await sleep(150);
  verdict[`clickingTheLinkOpensTheCopy_${tag}`] = JSON.stringify(await ev('opened')) === JSON.stringify(['bars/bar_010']);
  verdict[`phraseNeverWritten_${tag}`] = made.phrase === phraseBefore && made.calls === 0;
  const said = made.dialog.filter((d) => d.kind === 'notice').map((d) => d.text).join(' ');
  await focusField(); await CMD_Z();
  // 2026-11-19-0992a (deliberate, MOVED): this page has no `trash` port (it is the 0992 harness), so a copy is NOT an undo entry here: the notice is gone and a Cmd+Z removes nothing; the real removal is measured in measure-duplicate-followups.mjs
  verdict[`undoNotClaimed_${tag}`] = !/does not take a copy back/.test(said) && (await ev(`notes.has('bars/bar_010.md')`)) === true;
  verdict[`composerEmptyAfterApply_${tag}`] = made.field === '';

  // ---- Esc discards -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate [[bar_005]].'); await ENTER(); await sleep(250); await ESC(); await sleep(150);       // 2026-11-19-0996b (MOVED): typed
  verdict[`escDiscardsThePreview_${tag}`] = (await ev('creates.length')) === 0 && (await ev('livePreview()')) === false;

  // ---- typed by hand ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  const listBefore = await ev('list()');
  await typeText('Duplicate [[bar_007]].'); await ENTER(); await sleep(250); await ENTER(); await sleep(300);
  verdict[`typedSentenceMakesTheCopy_${tag}`] = JSON.stringify(await ev('creates')) === JSON.stringify(['bars/bar_010.md']) && JSON.stringify(await ev('list()')) === JSON.stringify(listBefore);
  verdict[`typedSentenceNeverAsksTheService_${tag}`] = (await ev('serviceCalls')) === 0;
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate [[bar_099]].'); await ENTER(); await sleep(300);
  const refused = await ev('dialog()');
  verdict[`unknownLinkRefusedInPlainWords_${tag}`] = /There is no note called \[\[bar_099\]\] in this vault, so there is nothing to duplicate\./.test(refused[refused.length - 1].text) && (await ev('creates.length')) === 0;
  await p.shot(path.join(OUT, `duplicate-refused-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });

  // ---- general ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(250); await ENTER(); await sleep(300);       // 2026-11-19-0996b (MOVED): typed
  const look = await ev(`(function () { var b = document.querySelector('.forge-chat-link'); if (!b) return null; var cs = getComputedStyle(b); return { deco: cs.textDecorationLine, cursor: cs.cursor, title: b.hasAttribute('title') || b.hasAttribute('aria-label'), red: hueRed(cs.color) }; })()`);
  numbers[`link@${tag}`] = look;
  verdict[`linkLooksLikeALink_${tag}`] = !!look && /underline/.test(look.deco) && look.cursor === 'pointer' && look.title === false && look.red === false;
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
