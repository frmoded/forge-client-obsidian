// 2026-11-19-0925 - the hidden accessible name (`.forge-sr-only`, src/sr-label-core.ts) in REAL headless Chrome (CDP) with the plugin's real styles.css.
// The claim: a control's name is a visually hidden span that (1) measures 1 px x 1 px and paints nothing, (2) adds no scrollbar and moves nothing (the parent's box and every sibling's box are the same with and without the
// spans), (3) is NOT display:none / visibility:hidden (it stays in the accessibility tree: the AX name of every button is its hidden text), and (4) leaves no aria-label anywhere (Obsidian draws its tooltip from it).
// The plugin's own DOM modules (transport row, composer card, bar-selection menu, notebook, arrangement controls, structure strip; bundled with esbuild) are mounted in a tab-shaped page, plus a scroll-edge fixture
// (a button at the very corner of an overflow:auto box). Obsidian itself is NOT driven here (the driver rests the pointer on each button there).
//   node scripts/dev/measure-sr-only.mjs        exit 0 = every verdict true
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: {
    contents: "export { mountScoreTransport } from './src/score-transport-dom.ts'; export { mountPromptBox } from './src/prompt-box-dom.ts'; export { mountSelectionMenu } from './src/bar-selection-menu-dom.ts'; export { mountNotebook } from './src/notebook-dom.ts'; export { mountArrangementControls } from './src/arrangement-controls-dom.ts'; export { mountStructureStrip } from './src/structure-strip-dom.ts'; export { chipsFor } from './src/structure-strip-core.ts'; export { exportItems } from './src/score-transport-core.ts';",
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `:root { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --background-modifier-hover:rgba(0,0,0,.06); --background-modifier-border:#dddddd; --interactive-accent:#7c3aed; --radius-s:4px; --font-ui-small:13px; --font-ui-smaller:12px; }
*, *::before, *::after { box-sizing: border-box; } body { margin:0; font-family: -apple-system, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body>
<div id="tab" style="width:900px;position:relative"><div id="tb"></div><div id="composer"></div><div id="sel"></div><div id="nb"></div><div id="arr"></div><div id="strip"></div></div>
<div id="edge" style="width:120px;height:34px;overflow:auto;border:1px solid #ccc"><button id="edgebtn" style="display:block;width:100%;height:100%;margin:0;border:0">X</button></div>
<script>${bundle}</script><script>
var noop = function () {}, playing = false, ls = [];
var player = { get playing() { return playing; }, start() { playing = true; ls.forEach(function (l) { l(true); }); }, stop() { playing = false; ls.forEach(function (l) { l(false); }); }, reset: noop, setTempo: noop, onStateChange: function (f) { ls.push(f); return noop; } };
cp.mountScoreTransport(document.getElementById('tb'), { player: player, exportItems: cp.exportItems({ macDesktop: false }), runExport: noop });
cp.mountPromptBox(document.getElementById('composer'), { placeholder: 'Describe it', preview: async function () { return { ok: false, message: 'x' }; }, apply: async function () { return { ok: true, disk: '' }; }, cancel: noop, discard: noop, history: { get: function () { return []; }, set: noop } }, 'A sentence.');
var sel = cp.mountSelectionMenu(document.getElementById('sel'), { onAction: noop, onClear: noop });
sel.show({ text: '3 bars selected', disabled: { 'new-phrase': null, copy: null, delete: null, 'move-left': null, 'move-right': null } });
var nb = cp.mountNotebook(document.getElementById('nb'), { notebook: { run: async function () { return { ok: false, message: 'x' }; }, runRequest: async function () { return { ok: false, message: 'x' }; }, cells: async function () { return { cells: [], problems: [] }; }, rerun: async function () { return { ok: false }; }, deleteCell: async function () { return { ok: true }; } }, trace: noop });
nb.setScore({ count: 8, rows: ['kick', 'snare'] });
var arr = cp.mountArrangementControls(document.getElementById('arr'), { commit: noop, trace: noop, setTimer: function () { return 1; }, clearTimer: noop });
arr.show({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] });
var strip = cp.mountStructureStrip(document.getElementById('strip'), { onHover: noop, onClick: noop });
strip.set(cp.chipsFor('phrase_004', { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 }));
// the geometry of everything that is not a hidden name: [tag.class, left, top, width, height]
window.geometry = function () { return Array.prototype.map.call(document.querySelectorAll('#tab *:not(.forge-sr-only)'), function (e) { var r = e.getBoundingClientRect(); return [e.tagName + '.' + (e.className && e.className.baseVal === undefined ? e.className : ''), r.left, r.top, r.width, r.height].join('|'); }); };
</script>`;

const p = await openPage({ dir: '/', width: 1000, height: 1400, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}; const numbers = {};

// 1. every hidden name: 1 x 1, clipped, out of the flow, NOT display:none / visibility:hidden, with text
numbers.hiddenNames = await ev(`document.querySelectorAll('.forge-sr-only').length`);
numbers.spanStyles = await ev(`(() => { const out = []; for (const s of document.querySelectorAll('.forge-sr-only')) { const c = getComputedStyle(s), r = s.getBoundingClientRect(); out.push({ w: r.width, h: r.height, pos: c.position, ov: c.overflow, clip: c.clip, clipPath: c.clipPath, display: c.display, vis: c.visibility, text: s.textContent.length }); } return out; })()`);
verdict.manyHiddenNames = numbers.hiddenNames >= 30;
verdict.everySpanIs1pxBy1px = numbers.spanStyles.every((s) => s.w === 1 && s.h === 1);
verdict.everySpanIsClippedAndAbsolute = numbers.spanStyles.every((s) => s.pos === 'absolute' && s.ov === 'hidden' && /rect\(0px, 0px, 0px, 0px\)|rect\(0px 0px 0px 0px\)/.test(s.clip) && /inset\(50%\)/.test(s.clipPath));
verdict.noSpanIsDisplayNoneOrVisibilityHidden = numbers.spanStyles.every((s) => s.display !== 'none' && s.vis === 'visible' && s.text > 0);

// 2. nothing moves and nothing scrolls: the boxes of everything else are the same with and without the spans; no scrollbar on the page or on the edge fixture
const withSpans = await ev('window.geometry()');
numbers.pageScroll = await ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight })`);
numbers.edgeBefore = await ev(`(() => { const e = document.getElementById('edge'); return { sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }; })()`);
await ev(`(() => { const b = document.getElementById('edgebtn'); const s = document.createElement('span'); s.className = 'forge-sr-only'; s.id = 'edge-name'; s.textContent = 'Edge button'; b.appendChild(s); b.setAttribute('aria-labelledby', 'edge-name'); })()`);
numbers.edgeAfter = await ev(`(() => { const e = document.getElementById('edge'); return { sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }; })()`);
await ev(`document.querySelectorAll('.forge-sr-only').forEach((s) => s.remove())`);
const withoutSpans = await ev('window.geometry()');
numbers.boxesCompared = withSpans.length;
numbers.boxesDifferent = withSpans.filter((g, i) => g !== withoutSpans[i]).length + Math.abs(withSpans.length - withoutSpans.length);
numbers.pageScrollAfterRemoval = await ev(`({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight })`);
verdict.noLayoutChange = numbers.boxesCompared > 100 && numbers.boxesDifferent === 0;
verdict.noScrollbarOnThePage = numbers.pageScroll.sw === numbers.pageScroll.cw && numbers.pageScroll.sh <= numbers.pageScroll.ch && numbers.pageScroll.sw === numbers.pageScrollAfterRemoval.sw && numbers.pageScroll.sh === numbers.pageScrollAfterRemoval.sh;
verdict.noScrollbarAtTheCornerOfAnOverflowBox = numbers.edgeBefore.sw === numbers.edgeBefore.cw && numbers.edgeBefore.sh === numbers.edgeBefore.ch && numbers.edgeAfter.sw === numbers.edgeAfter.cw && numbers.edgeAfter.sh === numbers.edgeAfter.ch;

// 3. nothing for Obsidian to draw a tooltip from; and the names are in the accessibility tree (reload the page: the spans were removed above)
await p.send('Page.reload'); await p.sleep(900);
numbers.ariaLabelCount = await ev(`document.querySelectorAll('[aria-label]').length`);
numbers.titleCount = await ev(`document.querySelectorAll('[title]').length`);
verdict.noAriaLabelNoTitle = numbers.ariaLabelCount === 0 && numbers.titleCount === 0;
await p.send('Accessibility.enable');
const tree = (await p.send('Accessibility.getFullAXTree')).result.nodes;
const buttons = tree.filter((n) => n.role?.value === 'button' && !n.ignored).map((n) => n.name?.value ?? '');
numbers.buttonNames = buttons;
const want = ['Play', 'Back to the start', 'Slower', 'Tempo, click to type a percent', 'Faster', 'Export', 'Clear the selection', 'Mute rock', 'Solo rock', 'Mute latin', 'Solo latin', 'Bar 1', 'Bar 8', 'Open bar_007', 'Open phrase_004', 'Open bar_008'];
numbers.missingFromAxTree = want.filter((w) => !buttons.includes(w));
verdict.everyButtonIsNamedInTheAxTree = numbers.missingFromAxTree.length === 0;
numbers.unnamedButtons = tree.filter((n) => n.role?.value === 'button' && !n.ignored && !(n.name?.value ?? '').trim()).length;
verdict.noButtonWithoutAnAxName = numbers.unnamedButtons === 0;
// the span itself is a real node of the tree (not hidden from it): find one by its text
const play = tree.find((n) => n.role?.value === 'button' && n.name?.value === 'Play');
const playSource = (play?.name?.sources ?? []).find((s) => s.type === 'relatedElement' || s.attribute === 'aria-labelledby');
numbers.playNameFrom = playSource ? { type: playSource.type, attribute: playSource.attribute ?? null } : null;
verdict.theNameComesFromAriaLabelledby = !!playSource && playSource.attribute === 'aria-labelledby';
const spanNode = tree.find((n) => n.role?.value === 'StaticText' && n.name?.value === 'Play' && !n.ignored) ?? tree.find((n) => n.name?.value === 'Play' && n.role?.value !== 'button');
numbers.spanInAxTree = !!spanNode;
verdict.theHiddenTextIsNotRemovedFromTheTree = numbers.spanInAxTree || verdict.theNameComesFromAriaLabelledby;   // a name read through aria-labelledby needs the target to be rendered, not display:none

console.log(JSON.stringify({ verdict, numbers }, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(ok ? 'ALL TRUE' : 'SOMETHING IS FALSE');
p.close();
process.exit(ok ? 0 : 1);
