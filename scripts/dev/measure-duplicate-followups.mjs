// 2026-11-19-0992a - THE DUPLICATE FOLLOW-UPS, in REAL headless Chrome (CDP) with REAL mouse clicks on stand-in Score bars and REAL key events. Written on the model of measure-duplicate-bar.mjs (same harness, same stand-in Score, same real modules):
//   R1   with ANY text in the phrase composer a plain click on a bar inserts ` [[bar_005]]` at the caret (no full stop), focus back in the field, no preview, the bar NOT pinned; the EMPTY composer pins as ever; the word `Duplicate` is exactly 0992
//        (` [[bar_009]].`, the usual preview, no pin); Shift+click is still the selection gesture with text in the field.
//   R2   a copy is an undo entry: a real Cmd+Z in the EMPTY composer moves a fresh copy to the trash (the port records it) and the dialog says `Removed bar_010 (moved to the trash).`; a copy EDITED since is left in place, said, and the NEXT Cmd+Z undoes
//        the phrase's own previous sentence; no `does not take a copy back` line anywhere.
//   P3   the notice reads `Created bar_010, a copy of bar_009.` with the two names as plain visible text inside underlined link buttons; the page carries Obsidian's own button rules (user-select none, the grey button background and shadow, the hover tint),
//        so the plugin's styles.css is judged against them: the link stays selectable text, transparent, no shadow, the accent colour, underlined; a real selection of the dialog line reads as the sentence.
// The SCORE is a STAND-IN (as in measure-duplicate-bar.mjs; the real mountPhrase is covered by src/duplicate-click-wiring.test.ts and src/duplicate-notice-real-plugin.test.ts). Obsidian itself is NOT driven. WRITTEN, NOT RUN by the author of this file:
//   node scripts/dev/measure-duplicate-followups.mjs [--out <dir>]        exit 0 = every verdict true; widths 800 and 1100, light and dark
// Verdicts (each suffixed _<width>_<theme>):
//   clickAfterFooInsertsTheLink      "Foo" typed with real keys, a real click on each of the 8 bars: the field says "Foo [[<note that made THAT bar>]]" (bar_005, bar_005, bar_009, bar_005, bar_005, bar_002, bar_005, bar_005)
//   clickAfterFooReturnsFocus        document.activeElement is the field after each click
//   clickAfterFooShowsNoPreview      no live preview in the dialog after each click, nothing was created
//   clickAfterFooDoesNotPin          the inspector's pin is null and nothing was told as pinned after all 8 clicks
//   clickGoesAtTheCaret              [MOVED by 0996b: "Keep" is a bar word now] "Make it 8 bars long." with the caret after "Make", a click on bar 3: "Make [[bar_009]] it 8 bars long." (it was "Keep bars 1 to 2." and "Keep [[bar_009]] bars 1 to 2.")
//   emptyComposerPins                the field emptied, a click on bar 5 pins ph_bar_5 and the field stays empty
//   duplicateWordIsUnchanged         [MOVED by 0996b: Duplicate + a click is a BAR WORD click now] "Duplicate", a click on bar 3: "Duplicate bar 3", no preview, not pinned (it was "Duplicate [[bar_009]]." and the preview "Copy [[bar_009]] to a new bar."; the typed `Duplicate [[bar_009]].` is checked in measure-bar-words.mjs)
//   shiftClickWithTextIsSelection    "Foo", a real Shift+click: nothing pinned, nothing appended, the selection gesture fired once
//   noticeTextIsThePlainSentence     after Enter the dialog line (the check mark cut) is exactly "Created bar_010, a copy of bar_009."
//   noticeButtonsShowTheNames        two link buttons whose text is "bar_010" and "bar_009", each wider than 8 px and underlined, not red, with a pointer cursor and no title
//   noticeLinkBeatsObsidianButton    the link's computed user-select is text, its background is transparent, its box shadow none, its colour the accent colour (a probe span with color var(--text-accent) is the reference), with Obsidian's button rules on the page
//   selectedLineReadsAsTheSentence   a real selection over the dialog line: its text (the check mark cut) is "Created bar_010, a copy of bar_009." (the symptom of 0992: "Created , a copy of .")
//   clickingTheNameOpensTheCopy      a real click on the first name told the plugin's opener "bars/bar_010"
//   noUndoNoticeLine                 no dialog line says "does not take a copy back"
//   cmdZRemovesAFreshCopy            a sentence is applied, a copy made, a real Cmd+Z in the empty composer: the trash port got bars/bar_010, the vault no longer has it, the dialog's newest notice is "Removed bar_010 (moved to the trash)."
//   cmdZLeavesTheSentenceAndPhraseAlone  after that the phrase's list is still the one sentence longer and the phrase note was written by no undo of the copy (the process count did not move for it)
//   cmdZLeavesAnEditedCopy           a copy edited since: a real Cmd+Z: still in the vault, not trashed, the notice is "bar_010 was edited since, so it was left in place. Delete it in the file list if you want it gone."
//   nextCmdZReachesTheSentence       the Cmd+Z after that undoes the phrase's own sentence (the list is one shorter) and still does not trash the edited copy
//   redoDoesNotBringTheCopyBack      Shift+Cmd+Z after a removed copy does not bring bars/bar_010 back
//   noRedAnywhereInTheDialog, noTooltipAnywhere, noHorizontalOverflow     as in measure-duplicate-bar.mjs
// HARNESS LESSONS (kept): every mount is a FRESH host element; no page global named like a read-only window property (never "closed", "name", "status"...); no backticks inside the page's template literal (this file's page text is one).
// Screenshots: followups-click-foo-<w>-<theme>.png (after a click with "Foo" in the field), followups-created-<w>-<theme>.png (the notice and its buttons), followups-removed-<w>-<theme>.png (after Cmd+Z).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/duplicate-followups')).replace(/^~/, os.homedir());
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
window.setup = function (width) {
  if (window.ctl) window.ctl.dispose();
  if (window.layer) window.layer.dispose();
  window.shifted = 0; window.notes = new Map(); window.processCalls = 0; window.creates = []; window.trashed = []; window.opened = []; window.pinTold = []; window.serviceCalls = 0;
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
      onBar: function (e) { var pin = cp.pinnedNoteFor(e.prov); window.ctl.duplicateClick(PATH, pin ? pin.noteId : null, e.prov.params.bar); },      // 2026-11-19-0996b: the bar's number rides along (a bar word first in the composer inserts it)
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
const SENTENCE = 'Created bar_010, a copy of bar_009.';

for (const w of [800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`);

  // ---- R1: "Foo", then a click on EVERY bar --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  const names = [], focuses = [], lives = [];
  for (let i = 1; i <= 8; i++) {
    await clearField(); await typeText('Foo'); await clickBar(i);
    names.push(await ev('fieldValue()')); focuses.push(await ev('focusIsField()')); lives.push(await ev('livePreview()'));
    if (i === 3) await p.shot(path.join(OUT, `followups-click-foo-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  }
  numbers[`clickAfterFoo@${tag}`] = { names };
  verdict[`clickAfterFooInsertsTheLink_${tag}`] = names.length === 8 && names.every((n, i) => n === `Foo [[${EXPECT[i]}]]`);
  verdict[`clickAfterFooReturnsFocus_${tag}`] = focuses.every((x) => x === true);
  verdict[`clickAfterFooShowsNoPreview_${tag}`] = lives.every((x) => x === false) && (await ev('creates.length')) === 0;
  verdict[`clickAfterFooDoesNotPin_${tag}`] = (await ev('pinned()')) === null && (await ev('pinTold.length')) === 0;

  // ---- at the caret; the empty composer pins; Duplicate unchanged; Shift+click ---------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Make it 8 bars long.'); await ev(`(function () { var f = document.querySelector('.forge-prompt-box-text'); f.setSelectionRange(4, 4); })()`); await clickBar(3);      // 2026-11-19-0996b (MOVED): it was 'Keep bars 1 to 2.', and Keep is a bar word now
  verdict[`clickGoesAtTheCaret_${tag}`] = (await ev('fieldValue()')) === 'Make [[bar_009]] it 8 bars long.' && (await ev('pinned()')) === null;
  await clearField(); await clickBar(5);
  verdict[`emptyComposerPins_${tag}`] = (await ev('pinned()')) === 'ph_bar_5' && (await ev('fieldValue()')) === '';
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate'); await clickBar(3);
  verdict[`duplicateWordIsUnchanged_${tag}`] = (await ev('fieldValue()')) === 'Duplicate bar 3' && (await ev('suggestion()')) === '' && (await ev('livePreview()')) === false && (await ev('pinned()')) === null;      // 2026-11-19-0996b (MOVED): see the verdict list
  await clearField(); await typeText('Foo'); const pinBefore = await ev('pinned()'); await clickBar(7, MOD.shift);
  verdict[`shiftClickWithTextIsSelection_${tag}`] = (await ev('pinned()')) === pinBefore && (await ev('fieldValue()')) === 'Foo' && (await ev('window.shifted || 0')) === 1;

  // ---- the notice: plain sentence, visible names in link buttons, selectable --------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(200); await ENTER();      // (a typed sentence: the first Enter shows the preview, the second applies) await sleep(350);      // 2026-11-19-0996b (MOVED): typed, since Duplicate + a click is a bar word click now
  const made = await ev(`({ dialog: dialog(), links: [].map.call(document.querySelectorAll('.forge-chat-link'), function (b) { var r = b.getBoundingClientRect(); var cs = getComputedStyle(b); return { text: b.textContent, w: r.width, h: r.height, deco: cs.textDecorationLine, cursor: cs.cursor, title: b.hasAttribute('title') || b.hasAttribute('aria-label'), red: hueRed(cs.color), select: cs.userSelect, bg: cs.backgroundColor, shadow: cs.boxShadow, color: cs.color }; }) })`);
  const applied = made.dialog.filter((d) => d.kind === 'applied').pop();
  numbers[`notice@${tag}`] = { applied: applied && applied.text, links: made.links };
  verdict[`noticeTextIsThePlainSentence_${tag}`] = !!applied && applied.text.replace(/^✓\s*/, '') === SENTENCE;
  verdict[`noticeButtonsShowTheNames_${tag}`] = made.links.length === 2 && made.links[0].text === 'bar_010' && made.links[1].text === 'bar_009' && made.links.every((l) => l.w > 8 && l.h > 8 && /underline/.test(l.deco) && l.cursor === 'pointer' && l.title === false && l.red === false);
  const accent = await ev(`(function () { var s = document.createElement('span'); s.style.color = 'var(--text-accent)'; document.body.appendChild(s); var c = getComputedStyle(s).color; s.remove(); return c; })()`);
  verdict[`noticeLinkBeatsObsidianButton_${tag}`] = made.links.length === 2 && made.links.every((l) => l.select === 'text' && (l.bg === 'rgba(0, 0, 0, 0)' || l.bg === 'transparent') && l.shadow === 'none' && l.color === accent);
  const picked = await ev(`(function () { var line = [].filter.call(document.querySelectorAll('.forge-chat-msg[data-kind="applied"] .forge-chat-text'), function () { return true; }).pop(); var sel = window.getSelection(); sel.removeAllRanges(); var r = document.createRange(); r.selectNodeContents(line); sel.addRange(r); return sel.toString(); })()`);
  numbers[`selected@${tag}`] = picked;
  verdict[`selectedLineReadsAsTheSentence_${tag}`] = picked.replace(/^✓\s*/, '').trim() === SENTENCE;
  await ev('window.getSelection().removeAllRanges()');
  await p.shot(path.join(OUT, `followups-created-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  const linkBox = await ev(`box('.forge-chat-link')`); await p.click(linkBox.x, linkBox.y); await sleep(150);
  verdict[`clickingTheNameOpensTheCopy_${tag}`] = JSON.stringify(await ev('opened')) === JSON.stringify(['bars/bar_010']);
  verdict[`noUndoNoticeLine_${tag}`] = !(await ev('dialog()')).some((d) => /does not take a copy back/.test(d.text));

  // ---- R2: Cmd+Z takes a fresh copy back (after a sentence of the phrase, so there is a sentence to leave alone) ---------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await sayApplied('Make it 20 percent slower.');
  const listAfterSentence = await ev('list()'); const callsBeforeCopy = await ev('processCalls');
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(200); await ENTER();      // (a typed sentence: the first Enter shows the preview, the second applies) await sleep(250); await ENTER(); await sleep(350);
  const callsAfterCopy = await ev('processCalls');
  verdict[`cmdZRemovesAFreshCopyMadeFirst_${tag}`] = (await ev(`notes.has('bars/bar_010.md')`)) === true;
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`cmdZRemovesAFreshCopy_${tag}`] = JSON.stringify(await ev('trashed')) === JSON.stringify(['bars/bar_010.md']) && (await ev(`notes.has('bars/bar_010.md')`)) === false && (await lastNotice()) === 'Removed bar_010 (moved to the trash).';
  verdict[`cmdZLeavesTheSentenceAndPhraseAlone_${tag}`] = JSON.stringify(await ev('list()')) === JSON.stringify(listAfterSentence) && (await ev('processCalls')) === callsAfterCopy && callsAfterCopy === callsBeforeCopy;
  await p.shot(path.join(OUT, `followups-removed-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 640 });
  await CMD_SHIFT_Z(); await sleep(300);
  verdict[`redoDoesNotBringTheCopyBack_${tag}`] = (await ev(`notes.has('bars/bar_010.md')`)) === false;

  // ---- an EDITED copy is left; the next Cmd+Z reaches the sentence --------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await sayApplied('Make it 20 percent slower.');
  const lenWithSentence = (await ev('list()')).length;
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(200); await ENTER();      // (a typed sentence: the first Enter shows the preview, the second applies) await sleep(250); await ENTER(); await sleep(350);
  await ev(`notes.set('bars/bar_010.md', notes.get('bars/bar_010.md') + String.fromCharCode(10) + 'edited by hand' + String.fromCharCode(10))`);
  await focusField(); await CMD_Z(); await sleep(300);
  verdict[`cmdZLeavesAnEditedCopy_${tag}`] = (await ev(`notes.has('bars/bar_010.md')`)) === true && (await ev('trashed.length')) === 0 && (await lastNotice()) === 'bar_010 was edited since, so it was left in place. Delete it in the file list if you want it gone.';
  await CMD_Z(); await sleep(350);
  verdict[`nextCmdZReachesTheSentence_${tag}`] = (await ev('list()')).length === lenWithSentence - 1 && (await ev('trashed.length')) === 0 && (await ev(`notes.has('bars/bar_010.md')`)) === true;

  // ---- general ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await ev(`setup(${w})`); await mounted(); await sleep(300);
  await typeText('Duplicate [[bar_009]].'); await ENTER(); await sleep(200); await ENTER();      // (a typed sentence: the first Enter shows the preview, the second applies) await sleep(300);      // 2026-11-19-0996b (MOVED): typed (the preview of the note copy is what the general checks looked at)
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
