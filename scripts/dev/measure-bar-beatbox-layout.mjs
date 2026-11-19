// 2026-11-19-0992c (BUG, P1: a bar's tab showed no Beat Box since 0993) - the Beat Box tab of a bar WITH the composer, in REAL headless Chrome (CDP), laid out under OBSIDIAN'S OWN STYLESHEET.
// Why this script exists: the 96 verdicts of measure-bar-list.mjs (0993) and the happy-dom wiring tests laid the tab out with styles.css ALONE: a bare host div, a fixed 430 px iframe, no `.workspace-leaf-content`, no `.view-content`,
// no Obsidian `button`/`iframe` rules, no real tab chain. In Obsidian the tab's content element IS `.view-content` (padding, overflow, a height of its own) inside `.workspace-leaf-content` (a flex column) under `.workspace-tabs`; this
// script builds that chain with Obsidian's real app.css (read from the installed app, read-only, exactly as scripts/dev/asar-cat.mjs does it) and mounts the REAL tab into it.
// What is REAL: src/rhythm-edit-view.ts (RhythmEditView: onOpen, onLoadFile, mount, the iframe from createSandboxedWidgetIframe = a sandboxed blob iframe, attachAutoHeight, the score area, the bar box host, onMessage), src/description-apply.ts
// (the controller; mountChatPanel via syncBars), the chat panel, prompt box, styles.css, the Beat Box page itself (rhythm_box.html, read from the bundled music-theory vault), Obsidian's app.css (or, with --pasted / without the app, a pasted subset of its rules).
// What is a STAND-IN, said plainly: (1) the `obsidian` module (EditableFileView with a real header and its actions, TFile, Notice: the class names Obsidian gives the tab's elements are built here by hand); (2) the music edition (the Score is an SVG
// of a chosen height, not Verovio: only its HEIGHT matters to the layout); (3) the engine (no Pyodide); (4) the vault (a Map); (5) bundled-widget-lookup (hands the real page). Obsidian itself is NOT driven; the viewport is the pane (no sidebars).
// WRITTEN, RUN BY THE SUPERVISOR'S HELPER (one at a time, never in parallel with another Chrome job):  nice -n 10 node scripts/dev/measure-bar-beatbox-layout.mjs [--out <dir>] [--pasted]     exit 0 = every verdict true.
// HARNESS LESSONS (kept): every mount is a FRESH tab element; no page global named like a read-only window property (never "closed", "name", "status"); NO backticks inside the page's template literal; no dollar-brace there either.
// THREE ORDERS in which the composer and the tab can meet (all 96 verdicts of 0993 were taken in the first): `after` = the composer joins a finished tab; `during` = a workspace event syncs the panes while the tab is still reading its note, so the composer is
// mounted on a content element that is still empty and the tab then builds its Beat Box (`contentEl.empty()` takes the composer's body and panel out); `again` = the tab builds its content a second time with the composer on it.
// VERDICTS, per order, size (width x height of the pane) and theme (tag: <order>_<W>x<H>_<theme>): `after` at 360 / 800 / 1100 wide x 800 high, 360 / 800 / 1100 x 500 (short), 800 x 1200 (tall), light, and 360 / 800 / 1100 x 800 dark; `during` and `again` at 360 / 800 / 1100 x 800 and 800 x 500, light.
//   tab_*
//     beatBoxIframeVisible_<tag>    the iframe is in the document, display is not none, visibility visible, its height is at least 300 px (the bar has four rows: the page is about 340 px tall at 800 px) and it is wider than 150 px
//     beatBoxPageDrew_<tag>         the page inside the iframe drew its 4 x 16 grid (the harness probe in the page answers: the sandboxed iframe's DOM is not readable from outside) and the iframe has a height
//     beatBoxNotClipped_<tag>       the iframe is as tall as the page inside it (auto-height applied)
//     scoreVisible_<tag>            the Score area is in the tab, above the Beat Box, with a height
//     composerVisible_<tag>         the composer's card is on screen (inside the pane)
//     composerBelowBeatBox_<tag>    stacked layout (a pane under 900 px): the composer panel starts at or below the bottom of the scrolling body that holds the Beat Box; wide layout (900 px up, the panel on the LEFT by design): beside it, no overlap
//     noOverlap_<tag>               the composer panel and the visible part of the iframe do not intersect
//     iframeNotFloating_<tag>       the iframe is a child of `.forge-chat-body` and the composer is there
//     scrollsInsideBody_<tag>       (short stacked panes) the body scrolls (scrollHeight > clientHeight), the iframe's bottom can be scrolled into the body's box, and `.view-content` itself does not scroll; reachableInBody_<tag> (short wide panes): the same, where the body may simply fit
//   click_*  (REAL mouse events through CDP, at the boxes the page's probe reports, after a real hit test (document.elementFromPoint) says the iframe is what is under that point)
//     gridCellHitTests_<tag>        the point of a grid cell hits the iframe (nothing overlays it)
//     gridCellClickWritesALine_<tag> one real click on a grid cell: the bar's note gained one line (one write): the click reached the widget, the widget posted, the tab appended through the list
//     tempoClickWritesALine_<tag>   one real click on the tempo + button: the note's list holds a "Set the tempo" line
//     playClickReachesTheWidget_<tag> one real click on Play: the widget's own Play button says aria-pressed true
//   edition_*   the other tabs, as they are (P3): the lean edition (a one-line note instead of the Score), a vault that is not score-first (no Score, no composer: the iframe fills the pane), and a bar WITHOUT the composer mount (the pre-0993 view)
//     beatBoxIframeVisible / beatBoxPageDrew / beatBoxNotClipped / noComposerHere _edition_<kind>
//   switch_*  the two buttons at the top right of the tab (they are VIEW switches of the leaf, not layout toggles)
//     headerHasTheTwoButtons        the tab's header carries "Open as Score" and "Open as JSON"; a real click on each asks the leaf for the Score view / the markdown view (neither hides anything of this view)
//     backToBeatBoxShowsIt          switching away and back (a fresh tab of the same note, as Obsidian builds it) shows the Beat Box again
//     flipKeepsBeatBox              the pane is resized across the 900 px line and back with the tab open: the Beat Box stays visible in both layouts
// Flags: --orders after,during,again   --sizes 800x800,360x800 (a focused run; the edition and switch verdicts run only without --orders)   --pasted (the pasted subset of Obsidian's rules instead of the installed app.css)   --out <dir>
// Screenshots: bbx-<tag>.png.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/bar-beatbox-layout')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const widgetFile = path.join(ROOT, 'assets/vaults/music-theory/music_instruments/resources/html/rhythm_box.html');
if (!fs.existsSync(widgetFile)) { console.error(`the Beat Box page is not at ${widgetFile}`); process.exit(2); }
const widgetJson = JSON.stringify(fs.readFileSync(widgetFile, 'utf8')).replace(/<\/script/gi, '<\\/script');
const fixtures = fs.readFileSync(path.join(ROOT, 'src/test-support/bar-list-fixtures.ts'), 'utf8');
const barLiteral = /"bar_001": ("(?:[^"\\]|\\.)*")/.exec(fixtures);
if (!barLiteral) { console.error('bar_001 is not in src/test-support/bar-list-fixtures.ts'); process.exit(2); }
// the bar of the real vault is a two-channel groove; a real bar often has more rows, and the Beat Box is as tall as its rows: the measure uses FOUR channels (kick, snare, hi-hat, claves) so that "at least 300 px" is a fair floor
const fourChannels = JSON.parse(barLiteral[1]).replace(/"channels": \{[\s\S]*?\n  \}/, () => '"channels": {\n    "kick": [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],\n    "snare": [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],\n    "hihat": [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],\n    "claves": [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]\n  }');
if (!/"claves"/.test(fourChannels)) { console.error('the four-channel bar could not be built from the fixture'); process.exit(2); }
const barJson = JSON.stringify(fourChannels).replace(/<\/script/gi, '<\\/script');
// A harness-only probe appended to the Beat Box page (the page itself is untouched otherwise): on a message from the tab's window it replies with the boxes of the grid cells and buttons and the page's own height. The Beat Box iframe is sandboxed
// (opaque origin, no allow-same-origin: the real tab's flags), so the measure cannot read its DOM; the CLICKS that use these boxes are still real mouse events through the browser's input path.
const PROBE_JS = `(function () {
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || m.type !== 'bbx-rects') return;
    var out = { cells: {}, ids: {}, steps: 0, bodyH: document.body.getBoundingClientRect().height, docH: document.documentElement.scrollHeight, playPressed: null };
    [].forEach.call(document.querySelectorAll('.step'), function (el) { var r = el.getBoundingClientRect(); out.steps++; out.cells[el.getAttribute('data-channel') + '|' + el.getAttribute('data-step')] = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
    ['bPlay', 'bBpmUp', 'bBpmDown', 'bpmVal'].forEach(function (id) { var el = document.getElementById(id); if (el) { var r = el.getBoundingClientRect(); out.ids[id] = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; } });
    var pl = document.getElementById('bPlay'); out.playPressed = pl ? pl.getAttribute('aria-pressed') : null;
    e.source.postMessage({ type: 'bbx-rects-reply', rects: out }, '*');
  });
})();`;
const probeHtml = JSON.stringify('<scr' + 'ipt>' + PROBE_JS + '</scr' + 'ipt>').replace(/<\/script/gi, '<\\/script');

// ---- Obsidian's own stylesheet: read-only from the installed app (the same extraction as scripts/dev/asar-cat.mjs), or the pasted subset ------------------------------------------------------------------------------
function installedAppCss() {
  const archive = '/Applications/Obsidian.app/Contents/Resources/obsidian.asar';
  try {
    const fd = fs.openSync(archive, 'r');
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(4), jsonSize = head.readUInt32LE(12);
    const json = Buffer.alloc(jsonSize); fs.readSync(fd, json, 0, jsonSize, 16);
    const node = JSON.parse(json.toString('utf8')).files?.['app.css'];
    if (!node) return null;
    const buf = Buffer.alloc(node.size); fs.readSync(fd, buf, 0, node.size, 8 + headerSize + Number(node.offset)); fs.closeSync(fd);
    return buf.toString('utf8');
  } catch { return null; }
}
// The rules that decide the tab's layout, pasted from Obsidian's app.css (installed 2026-11-19): the tab chain, `.view-content` (its height, padding and overflow), `.view-header`, `button`, `iframe`. Used with --pasted or when the app is not installed.
const PASTED = `
html, body { height: 100%; } body { margin: 0; overflow: hidden; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background-color: var(--background-primary); color: var(--text-normal); }
body { --header-height: 40px; --view-header-height: 40px; --size-4-1: 4px; --size-4-2: 8px; --size-4-3: 12px; --size-4-8: 32px; --safe-area-inset-bottom: 0px; --font-ui-small: 13px; --font-ui-smaller: 12px; --input-height: 30px; --input-font-weight: 400; --button-radius: 6px; --radius-m: 8px; --radius-s: 4px; --background-modifier-form-field: var(--background-primary); }
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --text-accent:#705dcf; --interactive-accent:#7b6cd9; --background-modifier-border:#dadada; --background-modifier-hover:rgba(0,0,0,0.075); --interactive-normal:#f2f3f5; --interactive-hover:#e9e9e9; --text-on-accent:#ffffff; --input-shadow: inset 0 0 0 1px rgba(0,0,0,0.1); --input-shadow-hover: inset 0 0 0 1px rgba(0,0,0,0.15); }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --text-accent:#a99bf0; --interactive-accent:#8875ff; --background-modifier-border:#363636; --background-modifier-hover:rgba(255,255,255,0.075); --interactive-normal:#363636; --interactive-hover:#3f3f3f; --text-on-accent:#ffffff; --input-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); --input-shadow-hover: inset 0 0 0 1px rgba(255,255,255,0.15); }
.app-container { display: flex; height: 100%; width: 100%; flex-direction: column; position: relative; }
.horizontal-main-container { width: 100%; display: flex; overflow: hidden; flex: 1 0 0; }
.workspace { display: flex; flex: 1 0 0; overflow: hidden; height: 100%; }
.workspace-split { display: flex; position: relative; } .workspace-split.mod-vertical { flex-direction: row; } .workspace-split.mod-root { background-color: var(--background-primary); flex: 1 1 auto; }
.workspace-tabs { overflow: hidden; display: flex; flex-direction: column; position: relative; flex: 1 0 0; }
.workspace-tabs > * { flex: 1 0 0; }
.workspace-tab-header-container { display: flex; height: var(--header-height); flex: 0 0 auto !important; }
.workspace-tab-container { display: flex; flex-direction: column; position: relative; }
.workspace-tabs .workspace-leaf { height: 100%; background-color: var(--background-primary); }
.workspace-leaf { display: flex; flex-direction: column; position: relative; contain: strict !important; overflow: hidden; isolation: isolate; }
.workspace-leaf-content { width: 100%; height: 100%; overflow: hidden; position: relative; display: flex; flex-direction: column; }
.workspace-leaf-content .view-content { padding: var(--size-4-3) var(--size-4-3) var(--size-4-8); padding-bottom: max(var(--safe-area-inset-bottom), var(--size-4-8)); overflow: auto; }
.view-header { height: var(--header-height); display: flex; background-color: var(--background-primary); z-index: 1; position: relative; gap: var(--size-4-2); padding: 0 var(--size-4-3); }
.view-header-title-container { flex: 1 1 auto; overflow: hidden; display: flex; align-items: center; min-width: 0; } .view-actions { display: flex; align-items: center; }
.view-content { width: 100%; height: calc(100% - var(--header-height)); }
.workspace-tabs .workspace-leaf .view-content { height: 100%; }
.view-action { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-s); }
button { --text-color: var(--text-normal); display: inline-flex; align-items: center; justify-content: center; color: var(--text-color); font-size: var(--font-ui-small); border-radius: var(--button-radius); border: 0; padding: var(--size-4-1) var(--size-4-3); height: var(--input-height); font-weight: var(--input-font-weight); font-family: inherit; outline: none; user-select: none; white-space: nowrap; }
button:not(.clickable-icon) { color: var(--text-color); background-color: var(--interactive-normal); box-shadow: var(--input-shadow); }
iframe { color-scheme: normal; } iframe { border: 0; }
`;
const installed = process.argv.includes('--pasted') ? null : installedAppCss();
const obsidianCssName = installed ? 'the installed Obsidian app.css (' + Math.round(installed.length / 1024) + ' KB)' : 'the pasted subset of Obsidian rules';
console.log(`Obsidian rules: ${obsidianCssName}`);

// ---- the bundle: the REAL tab + the REAL controller; the `obsidian` module and three Obsidian/engine-coupled modules are stand-ins ---------------------------------------------------------------------------------------
const obsidianNames = (() => {
  const names = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const s = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    for (const m of s.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'obsidian'/g)) for (const n of m[1].split(',')) { const t = n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]; if (/^[A-Za-z_]\w*$/.test(t)) names.add(t); }
  }
  return [...names];
})();
const HAND = {
  TFile: 'export class TFile {}',
  Notice: 'export class Notice { constructor(m) { (globalThis.__notices = globalThis.__notices || []).push(String(m)); } setMessage() {} hide() {} }',
  MarkdownView: 'export class MarkdownView {}',
  EditableFileView: `export class EditableFileView {
    constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = leaf.contentEl; this.containerEl = leaf.containerEl; this.file = null; this._refs = []; }
    addAction(icon, title, cb) { var el = document.createElement('div'); el.className = 'clickable-icon view-action'; el.setAttribute('aria-label', title); el.setAttribute('data-icon', icon); el.addEventListener('click', function (e) { cb(e); }); var box = this.containerEl.querySelector('.view-actions'); box.insertBefore(el, box.firstChild); return el; }
    register(f) { this._refs.push(f); } registerEvent(r) { this._refs.push(r); }
    async onOpen() {} async onClose() {} async onLoadFile() {} async onUnloadFile() {}
  }`,
};
const obsidianStub = obsidianNames.map((n) => HAND[n] ?? (/^[A-Z]/.test(n) ? `export class ${n} {}` : `export const ${n} = () => undefined;`)).join('\n');
const stubPlugin = {
  name: 'bar-beatbox-stand-ins',
  setup(b) {
    const virt = (filter, ns, contents) => { b.onResolve({ filter }, () => ({ path: ns, namespace: ns })); b.onLoad({ filter: /.*/, namespace: ns }, () => ({ contents, loader: 'js' })); };
    virt(/^obsidian$/, 'obsidian-stub', obsidianStub);
    // the music edition: an SVG Score of the height the page asks for (window.__scoreH); the id says which edition the tab believes it is in (window.__edition)
    virt(/(^|\/)music-edition-selected(\.ts)?$/, 'edition-stub', `export const musicEdition = {
      get id() { return globalThis.__edition || 'music'; },
      registerInputWidgets() {}, registerScaleExplorer() {}, stopPlayers() {}, renderMusicXML() { return false; },
      renderTaggedMusicXML(host) { var h = globalThis.__scoreH || 200; var ns = 'http://www.w3.org/2000/svg'; var s = document.createElementNS(ns, 'svg'); s.setAttribute('class', 'stand-in-score'); s.setAttribute('viewBox', '0 0 800 ' + h); s.style.width = '100%'; s.style.height = h + 'px'; s.style.display = 'block'; var r = document.createElementNS(ns, 'rect'); r.setAttribute('x', '2'); r.setAttribute('y', '2'); r.setAttribute('width', '796'); r.setAttribute('height', String(h - 4)); r.setAttribute('fill', 'none'); r.setAttribute('stroke', '#888'); s.appendChild(r); host.appendChild(s); return true; },
    };`);
    virt(/(^|\/)rhythm-score-engine(\.ts)?$/, 'engine-stub', `export async function computeRhythmScoreViaEngine() { return { multi_staff_content: '<score-partwise/>' }; }`);
    virt(/(^|\/)bundled-widget-lookup(\.ts)?$/, 'widget-stub', `export async function resolveWidgetFile() { return { ok: true, html: globalThis.__widgetHtml }; }`);
  },
};
const bundle = (await build({
  stdin: {
    contents: [
      "export { RhythmEditView } from './src/rhythm-edit-view.ts';",
      "export { TFile } from 'obsidian';",
      "export { createDescriptionController } from './src/description-apply.ts';",
      "export { descriptionPortsFor } from './src/description-wiring.ts';",
      "export { registerBarListHost } from './src/bar-list-bus.ts';",
      "export { readBarLines } from './src/bar-list-note-core.ts';",
      "export { messageDelivery } from './src/score-first-messages-core.ts';",
    ].join(' '), resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent', platform: 'browser', external: ['child_process'], plugins: [stubPlugin],
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const ENGINE_THEME_VARS = `
.theme-light { --font-ui-small:13px; --font-ui-smaller:12px; --font-text-size:16px; --radius-m:8px; --radius-s:4px; --background-modifier-form-field:#ffffff; --interactive-normal:#f2f3f5; --size-4-2:8px; --size-4-3:12px; }
.theme-dark { --font-ui-small:13px; --font-ui-smaller:12px; --font-text-size:16px; --radius-m:8px; --radius-s:4px; --background-modifier-form-field:#2a2a2a; --interactive-normal:#363636; --size-4-2:8px; --size-4-3:12px; }
`;   // only used with the pasted subset (the installed app.css defines every variable itself)
const chain = `<div class="app-container"><div class="horizontal-main-container"><div class="workspace"><div class="workspace-split mod-vertical mod-root"><div class="workspace-tabs mod-top mod-active">
<div class="workspace-tab-header-container"><div class="workspace-tab-header-container-inner"></div></div><div class="workspace-tab-container" id="tabc"></div></div></div></div></div></div>`;
const routes = installed ? { 'GET /obsidian-app.css': async (_q, r) => { r.writeHead(200, { 'content-type': 'text/css' }); r.end(installed); } } : {};
const page = `<!doctype html><meta charset=utf-8>${installed ? '<link rel="stylesheet" href="/obsidian-app.css">' : `<style>${PASTED}${ENGINE_THEME_VARS}</style>`}<style>${css}</style><style>.stand-in-score{display:block}</style>
<body class="theme-light is-focused">${chain}
<script>${bundle}</script><script>
var WIDGET_HTML = __WIDGET__;
var BAR_TEXT = __BAR__;
var PATH = 'bars/bar_001.md';
var PROBE_HTML = __PROBE__;
globalThis.__widgetHtml = WIDGET_HTML.replace('</body>', function () { return PROBE_HTML + '</body>'; });
// Obsidian's DOM helpers (the tab calls addClass / empty / createDiv on its content element)
HTMLElement.prototype.addClass = function () { for (var i = 0; i < arguments.length; i++) this.classList.add(arguments[i]); return this; };
HTMLElement.prototype.removeClass = function () { for (var i = 0; i < arguments.length; i++) this.classList.remove(arguments[i]); return this; };
HTMLElement.prototype.hasClass = function (c) { return this.classList.contains(c); };
HTMLElement.prototype.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
HTMLElement.prototype.createEl = function (tag, o) { o = o || {}; var e = document.createElement(tag); if (o.cls) e.className = o.cls; if (o.text) e.textContent = o.text; this.appendChild(e); return e; };
HTMLElement.prototype.createDiv = function (o) { return this.createEl('div', o); };
HTMLElement.prototype.createSpan = function (o) { return this.createEl('span', o); };
window.state = {};
window.build = function () {
  // a FRESH leaf as Obsidian builds it: .workspace-leaf > .workspace-leaf-content[data-type] > .view-header + .view-content (the tab's contentEl)
  var tabc = document.getElementById('tabc'); tabc.innerHTML = '';
  var leafEl = document.createElement('div'); leafEl.className = 'workspace-leaf mod-active';
  leafEl.innerHTML = '<div class="workspace-leaf-content" data-type="forge-rhythm-edit"><div class="view-header"><div class="view-header-left"></div><div class="view-header-title-container"><div class="view-header-title">bar_001</div></div><div class="view-actions"></div></div><div class="view-content"></div></div>';
  tabc.appendChild(leafEl);
  var containerEl = leafEl.querySelector('.workspace-leaf-content'); var contentEl = leafEl.querySelector('.view-content');
  return { leafEl: leafEl, containerEl: containerEl, contentEl: contentEl };
};
window.mount = async function (o) {
  // o: { edition: 'music'|'lean', scoreFirst: bool, composer: bool, listHost: bool, scoreH: px, order: 'after' (the composer joins a finished tab) | 'during' (it joins while the tab is still opening) | 'again' (the tab builds twice) }
  await window.unmount();
  window.__edition = o.edition; window.__scoreH = o.scoreH || 200;
  var S = window.state;
  S.o = o; S.notes = new Map(); S.processCalls = 0; S.writes = 0; S.handlers = []; S.marks = []; S.switched = []; S.serviceCalls = 0;
  S.notes.set(PATH, BAR_TEXT); S.startNote = BAR_TEXT;
  cp.messageDelivery.resetForTests && cp.messageDelivery.resetForTests();
  var tf = new cp.TFile(); tf.path = PATH; tf.extension = 'md'; tf.basename = 'bar_001'; tf.name = 'bar_001.md'; S.tf = tf;
  var vault = {
    adapter: { exists: async function (p) { return p === 'forge.toml' && o.scoreFirst; }, read: async function () { return 'name = "playground"\\nprofile = "score_first"\\n'; } },
    on: function (name, cb) { S.handlers.push({ name: name, cb: cb }); return { off: function () {} }; },
    getFiles: function () { return [tf]; }, getMarkdownFiles: function () { return [tf]; }, getAbstractFileByPath: function (p) { return p === PATH ? tf : null; },
    read: async function (f) { return S.notes.get(f.path) || ''; },
    process: function (f, fn) { return window.writeVia(f.path, fn); }, configDir: '.obsidian',
  };
  S.app = { vault: vault, workspace: { onLayoutReady: function () {}, on: function () { return {}; }, getLeavesOfType: function () { return []; } }, metadataCache: { on: function () { return {}; } }, plugins: {} };
  window.writeVia = function (p, fn) { S.processCalls++; return Promise.resolve().then(function () { var cur = S.notes.get(p); var next = fn(cur); if (next !== cur) { S.notes.set(p, next); S.writes++; setTimeout(function () { S.handlers.forEach(function (h) { if (h.name === 'modify') h.cb(tf); }); if (S.ctl) S.ctl.modified(p); }, 0); } }); };
  // the controller (the composer): its ports are the real description-wiring ports over this vault; panes() answers the way score-first.ts does (a bar's Beat Box tab, in the music edition, in a score-first vault)
  if (o.composer) {
    var ports = cp.descriptionPortsFor({
      read: function (p) { var t = S.notes.get(p); return t === undefined ? Promise.reject(new Error('File not found')) : Promise.resolve(t); },
      process: function (p, fn) { return window.writeVia(p, fn); },
      basenamesIn: function (folder) { var out = []; S.notes.forEach(function (v, k) { if (k.indexOf(folder + '/') === 0) out.push(k.slice(folder.length + 1).replace(/[.]md$/, '')); }); return out; },
      panes: function () { return S.view && S.view.contentEl ? [{ path: PATH, contentEl: S.view.contentEl, tab: true }] : []; },
      setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); }, trace: function () {}, warn: function () {},
    }, {
      askPlan: function () { S.serviceCalls++; return Promise.resolve({ status: 200, json: {} }); }, planConfigured: function () { return true; },
      composerMenu: function () { return { items: [{ id: 'b', label: 'New bar' }], run: function () {} }; },
    });
    S.ctl = cp.createDescriptionController(ports);
  }
  if (o.listHost) S.unregister = cp.registerBarListHost({
    appendLine: function (p, s, opts) { return S.ctl.appendLine(p, s, opts); }, undoLast: function (p) { return S.ctl.undoLast(p); }, redoLast: function (p) { return S.ctl.redoLast(p); },
  });
  var d = window.build(); S.dom = d;
  var hooks = { isDefaultViewEnabled: function () { return true; }, createNewNote: function () {}, toggleEdgesPanel: function () {}, setMark: function (leaf, path, mark) { S.marks.push(mark); } };
  var leaf = { app: S.app, contentEl: d.contentEl, containerEl: d.containerEl, setViewState: function (vs) { S.switched.push(vs.type); return Promise.resolve(); } };
  var view = new cp.RhythmEditView(leaf, hooks); S.view = view; leaf.view = view;
  view.file = tf;
  var settle = async function () { if (S.ctl) { await S.ctl.inspect(PATH); S.ctl.syncBars(); await new Promise(function (ok) { setTimeout(ok, 50); }); S.ctl.syncBars(); } };
  await view.onOpen();
  if (o.order === 'during' && S.ctl) {
    // a workspace event (layout-change, active-leaf-change) syncs the panes while the tab is still reading its note: the composer is mounted on a content element that is still EMPTY, then the tab builds its Beat Box
    var opening = view.onLoadFile(tf); S.ctl.syncBars(); await opening;
  } else await view.onLoadFile(tf);
  await settle();
  if (o.order === 'again') { await view.onLoadFile(tf); await settle(); }       // the tab builds its content a SECOND time (a reload of the note into the same tab) with the composer already on it
  return true;
};
window.unmount = async function () {
  var S = window.state;
  try { if (S.view) { await S.view.onUnloadFile(S.tf); await S.view.onClose(); } } catch (e) { console.warn('unmount', e); }
  if (S.ctl) { try { S.ctl.dispose(); } catch (e) { console.warn('dispose', e); } }
  if (S.unregister) S.unregister();
  S.view = null; S.ctl = null; S.unregister = null;
};
window.askRects = function () {
  var ifr = state.dom && state.dom.contentEl.querySelector('iframe'); if (!ifr || !ifr.contentWindow) return Promise.resolve(null);
  return new Promise(function (ok) {
    var done = false; var on = function (e) { if (e.source !== ifr.contentWindow || !e.data || e.data.type !== 'bbx-rects-reply') return; done = true; window.removeEventListener('message', on); var f = ifr.getBoundingClientRect(); var r = e.data.rects; var abs = function (b) { return b ? { x: f.left + b.x, y: f.top + b.y, w: b.w, h: b.h } : null; }; var cells = {}; Object.keys(r.cells).forEach(function (k) { cells[k] = abs(r.cells[k]); }); var ids = {}; Object.keys(r.ids).forEach(function (k) { ids[k] = abs(r.ids[k]); }); ok({ steps: r.steps, bodyH: r.bodyH, docH: r.docH, playPressed: r.playPressed, cells: cells, ids: ids }); };
    window.addEventListener('message', on); ifr.contentWindow.postMessage({ type: 'bbx-rects' }, '*');
    setTimeout(function () { if (!done) { window.removeEventListener('message', on); ok(null); } }, 600);
  });
};
window.theme = function (t) { document.body.className = 'theme-' + t + ' is-focused'; };
var R = function (e) { if (!e) return null; var r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
window.geom = function () {
  var S = window.state; var d = S.dom; if (!d) return null;
  var vc = d.contentEl; var body = vc.querySelector('.forge-chat-body'); var panel = vc.querySelector('.forge-chat-panel'); var card = vc.querySelector('.forge-prompt-box'); var ifr = vc.querySelector('iframe'); var score = vc.querySelector('.forge-rhythm-edit-score');
  var cs = function (e, props) { if (!e) return null; var c = getComputedStyle(e); var o = {}; props.forEach(function (p) { o[p] = c[p]; }); return o; };
  var P = ['display', 'height', 'minHeight', 'overflowY', 'overflowX', 'paddingTop', 'paddingBottom', 'flexDirection', 'flexGrow', 'flexShrink', 'flexBasis', 'visibility', 'position'];
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    leaf: R(d.leafEl), header: R(d.containerEl.querySelector('.view-header')), view: R(vc), viewCs: cs(vc, P), viewScroll: { sh: vc.scrollHeight, ch: vc.clientHeight },
    body: R(body), bodyCs: cs(body, P), bodyScroll: body ? { sh: body.scrollHeight, ch: body.clientHeight, top: body.scrollTop } : null,
    panel: R(panel), card: R(card), score: R(score),
    iframe: R(ifr), iframeCs: cs(ifr, P), iframeStyleHeight: ifr ? ifr.style.height : null, iframeStyleMinHeight: ifr ? ifr.style.minHeight : null, iframeInBody: !!(ifr && body && ifr.parentElement === body), iframeParent: ifr && ifr.parentElement ? ifr.parentElement.className : null,
    hostClass: vc.className, composer: !!panel, buttons: [].map.call(d.containerEl.querySelectorAll('.view-actions .view-action'), function (b) { return b.getAttribute('data-icon'); }),
  };
};
window.clickAction = function (icon) { var b = [].filter.call(state.dom.containerEl.querySelectorAll('.view-actions .view-action'), function (x) { return x.getAttribute('data-icon') === icon; })[0]; if (!b) return false; b.click(); return true; };
window.scrollBodyTo = function (where) { var b = state.dom.contentEl.querySelector('.forge-chat-body') || state.dom.contentEl; var f = state.dom.contentEl.querySelector('iframe'); b.scrollTop = where === 'end' ? b.scrollHeight : where === 'iframe' && f ? Math.max(0, f.offsetTop - 4) : 0; return b.scrollTop; };
window.hitIsIframe = function (x, y) { var e = document.elementFromPoint(x, y); return !!e && e.tagName === 'IFRAME'; };
window.lines = function () { var l = cp.readBarLines(state.notes.get(PATH)); return l ? l.lines : []; };
window.noteChanged = function () { return state.notes.get(PATH) !== state.startNote; };
</script>`.replace('__WIDGET__', () => widgetJson).replace('__BAR__', () => barJson).replace('__PROBE__', () => probeHtml);

const p = await openPage({ dir: '/', width: 1200, height: 900, pageHtml: page, routes });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const setViewport = async (w, h) => { await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(250); };
const rects = () => ev('askRects()');
/** wait until the Beat Box page has drawn its grid inside the iframe (or give up); then give the auto-height messages time to settle; returns the page's boxes (or null: no page) */
const widgetDrew = async (ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await rects(); if (r && r.steps > 0) { await sleep(900); return await rects(); } await sleep(250); } return null; };
const inside = (r, outer, t = 1.5) => !!r && !!outer && r.left >= outer.left - t && r.right <= outer.right + t && r.top >= outer.top - t && r.bottom <= outer.bottom + t;
const overlaps = (a, b) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
const visiblePart = (r, clip) => (r && clip ? { left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right), top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom) } : null);
const iframeShown = (g) => !!g && !!g.iframe && g.iframeCs.display !== 'none' && g.iframeCs.visibility === 'visible' && g.iframe.h >= 300 && g.iframe.w > 150;
const argList = (name) => { const v = arg(name, null); return v ? v.split(',') : null; };

function iframeVerdicts(tag, g, r) {
  verdict[`beatBoxIframeVisible_${tag}`] = iframeShown(g);
  verdict[`beatBoxPageDrew_${tag}`] = r !== null && r.steps >= 4 * 16 && !!g.iframe && g.iframe.h > 0;
  verdict[`beatBoxNotClipped_${tag}`] = r !== null && !!g.iframe && g.iframe.h >= r.bodyH - 2;          // the iframe is as tall as the page inside it (auto-height applied)
}

const WITH_COMPOSER = { edition: 'music', scoreFirst: true, composer: true, listHost: true, scoreH: 200 };
const SIZES = [
  { w: 360, h: 800, theme: 'light' }, { w: 800, h: 800, theme: 'light' }, { w: 1100, h: 800, theme: 'light' },
  { w: 360, h: 500, theme: 'light' }, { w: 800, h: 500, theme: 'light' }, { w: 1100, h: 500, theme: 'light' }, { w: 800, h: 1200, theme: 'light' },
  { w: 360, h: 800, theme: 'dark' }, { w: 800, h: 800, theme: 'dark' }, { w: 1100, h: 800, theme: 'dark' },
];
// the three orders in which the composer and the tab can meet: it joins a finished tab (all the 0993 verdicts were taken this way), it joins while the tab is still opening, the tab builds its content a second time
const ORDERS = [
  { order: 'after', sizes: SIZES },
  { order: 'during', sizes: [{ w: 360, h: 800, theme: 'light' }, { w: 800, h: 800, theme: 'light' }, { w: 1100, h: 800, theme: 'light' }, { w: 800, h: 500, theme: 'light' }] },
  { order: 'again', sizes: [{ w: 360, h: 800, theme: 'light' }, { w: 800, h: 800, theme: 'light' }, { w: 1100, h: 800, theme: 'light' }, { w: 800, h: 500, theme: 'light' }] },
];
const onlyOrders = argList('--orders');
const onlySizes = argList('--sizes');

for (const { order, sizes } of ORDERS) {
  if (onlyOrders && !onlyOrders.includes(order)) continue;
  for (const sz of sizes) {
    if (onlySizes && !onlySizes.includes(`${sz.w}x${sz.h}`)) continue;
    const tag = `${order}_${sz.w}x${sz.h}_${sz.theme}`;
    await setViewport(sz.w, sz.h); await ev(`theme('${sz.theme}')`);
    await ev(`mount(${JSON.stringify({ ...WITH_COMPOSER, order })})`);
    const r = await widgetDrew();
    const g = await ev('geom()');
    numbers[`geom@${tag}`] = { ...g, rects: r ? { steps: r.steps, bodyH: r.bodyH, docH: r.docH } : null };
    iframeVerdicts(tag, g, r);
    const wide = sz.w >= 900;
    verdict[`scoreVisible_${tag}`] = !!g.score && g.score.h > 20 && g.leaf.bottom > g.score.top;
    verdict[`composerVisible_${tag}`] = !!g.card && inside(g.card, { left: 0, top: 0, right: g.vw, bottom: g.vh }) && g.card.h > 20;
    const shown = visiblePart(g.iframe, g.body);
    verdict[`composerBelowBeatBox_${tag}`] = !!g.panel && !!g.body && !!g.iframe && (wide ? !overlaps(g.panel, g.body) : g.panel.top >= g.body.bottom - 1.5);
    verdict[`noOverlap_${tag}`] = !!g.panel && !!g.iframe && !overlaps(g.panel, shown);
    verdict[`iframeNotFloating_${tag}`] = g.iframeInBody === true && g.composer === true;
    if (sz.h <= 500) {
      // too short for the Score and the Beat Box: in the stacked layout the body scrolls; the Beat Box (down to its last pixel) can be brought into the body's box, and the tab itself does not scroll
      const room = !!g.bodyScroll && g.bodyScroll.sh > g.bodyScroll.ch + 1;
      await ev("scrollBodyTo('end')"); await sleep(120);
      const g2 = await ev('geom()');
      const reach = !!g2.iframe && !!g2.body && g2.iframe.bottom <= g2.body.bottom + 1.5 && g.viewScroll.sh <= g.viewScroll.ch + 1;
      if (!wide) verdict[`scrollsInsideBody_${tag}`] = room && reach && g2.bodyScroll.top > 0;
      else verdict[`reachableInBody_${tag}`] = reach && (room ? g2.bodyScroll.top > 0 : true);      // the wide layout's body is the whole pane height: it may simply fit
    }
    // ---- real clicks on the widget (scrolled into view first) -----------------------------------------------------------------------------------------------------------------------------------------------------
    await ev("scrollBodyTo('iframe')"); await sleep(150);
    const r1 = await rects();
    const cb = r1 && r1.cells['kick|2'];
    const hit = !!cb && (await ev(`hitIsIframe(${cb.x}, ${cb.y})`)) === true && cb.y > 0 && cb.y < sz.h;
    verdict[`gridCellHitTests_${tag}`] = hit;
    const writes0 = await ev('state.writes');
    if (hit) await p.click(cb.x, cb.y);
    await sleep(500);
    const lines1 = await ev('lines()');                                                  // the first write of a bar also writes its head ("Start with ..."), so the list is two lines after ONE click
    verdict[`gridCellClickWritesALine_${tag}`] = hit && (await ev('state.writes')) === writes0 + 1 && lines1.length >= 1 && lines1[lines1.length - 1] === 'Hit kick on step 3.';
    const up = (await rects())?.ids.bBpmUp; const upHit = !!up && (await ev(`hitIsIframe(${up.x}, ${up.y})`)) === true;
    if (upHit) await p.click(up.x, up.y);
    await sleep(1100);
    verdict[`tempoClickWritesALine_${tag}`] = upHit && (await ev(`lines().some(function (l) { return /^Set the tempo/.test(l); })`)) === true;
    const play = (await rects())?.ids.bPlay; const playHit = !!play && (await ev(`hitIsIframe(${play.x}, ${play.y})`)) === true;
    if (playHit) await p.click(play.x, play.y);
    await sleep(300);
    verdict[`playClickReachesTheWidget_${tag}`] = playHit && (await rects())?.playPressed === 'true';
    await ev("scrollBodyTo('top')");
    await p.shot(path.join(OUT, `bbx-${tag}.png`), { x: 0, y: 0, width: sz.w, height: sz.h });
  }
}

// ---- the other tabs (P3): the lean edition, a vault that is not score-first, a bar without the composer mount -------------------------------------------------------------------------------------------------------------------
if (!onlyOrders) {
  await setViewport(800, 800); await ev("theme('light')");
  for (const [kind, o] of [
    ['leanEdition', { edition: 'lean', scoreFirst: true, composer: false, listHost: false, scoreH: 200 }],
    ['notScoreFirst', { edition: 'music', scoreFirst: false, composer: false, listHost: false, scoreH: 200 }],
    ['barWithoutComposer', { edition: 'music', scoreFirst: true, composer: false, listHost: true, scoreH: 200 }],
  ]) {
    await ev(`mount(${JSON.stringify(o)})`);
    const r = await widgetDrew();
    const g = await ev('geom()');
    numbers[`geom@${kind}`] = { ...g, rects: r ? { steps: r.steps, bodyH: r.bodyH, docH: r.docH } : null };
    iframeVerdicts(`edition_${kind}`, g, r);
    verdict[`noComposerHere_edition_${kind}`] = g.composer === false;
  }

  // ---- the two buttons at the top right -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await setViewport(800, 800);
  await ev(`mount(${JSON.stringify(WITH_COMPOSER)})`); await widgetDrew();
  const g = await ev('geom()');
  numbers['topRightButtons'] = g.buttons;
  const first = await ev("clickAction('list-music')"); const second = await ev("clickAction('braces')");          // the icons of "Open as Score" and "Open as JSON" (rhythm-mode-core.ts MODE_ACTIONS)
  await sleep(200);
  const asked = await ev('state.switched.join()');
  verdict['headerHasTheTwoButtons'] = g.buttons.includes('list-music') && g.buttons.includes('braces') && first === true && second === true && asked === 'forge-rhythm-score,markdown';
  // "back": Obsidian builds a fresh Beat Box tab of the same note
  await ev(`mount(${JSON.stringify(WITH_COMPOSER)})`); const rb = await widgetDrew(); const gb = await ev('geom()');
  verdict['backToBeatBoxShowsIt'] = rb !== null && iframeShown(gb) && gb.composer === true;
  // a flip across the 900 px line with the tab open
  await setViewport(1100, 800); await sleep(600); const wideG = await ev('geom()');
  await setViewport(800, 800); await sleep(600); const narrowG = await ev('geom()');
  numbers['flip'] = { wide: wideG.hostClass, narrow: narrowG.hostClass };
  verdict['flipKeepsBeatBox'] = iframeShown(wideG) && iframeShown(narrowG) && /forge-chat-wide/.test(wideG.hostClass) && /forge-chat-stacked/.test(narrowG.hostClass);
}

p.close();
console.log('NUMBERS ' + JSON.stringify(numbers, null, 1));
const names = Object.keys(verdict);
const bad = names.filter((n) => verdict[n] !== true);
console.log(`VERDICTS ${names.length - bad.length}/${names.length} true`);
for (const n of names) console.log(`${verdict[n] === true ? 'PASS' : 'FAIL'}  ${n}`);
process.exit(bad.length === 0 ? 0 : 1);
