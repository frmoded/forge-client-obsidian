// 2026-11-18 (0935) - the draggable divider between the dialog and the Score of a music tab, in REAL headless Chrome (CDP) with REAL mouse events (Input.dispatchMouseEvent pressed / moved / released at the handle's real box) and REAL keys.
// The plugin's own modules (src/chat-panel-dom.ts + src/chat-divider-dom.ts + src/prompt-box-dom.ts + src/live-score-dom.ts, bundled with esbuild) are mounted into a tab-shaped host with the REAL styles.css; the Score is engraved by the REAL
// Verovio (bundled into the page; the same options as src/verovio.ts applyOptions with fit + noHeader) through the REAL attachScoreArea, so its own debounced relayout is what is counted: `engraves` counts every renderInto.
// The store is the plugin's own settingsStore over a data.json stand-in kept in localStorage (a real reload of the page reads it back). Obsidian itself is NOT driven here (see the driver checklist in the feedback).
//   node scripts/dev/measure-divider.mjs [--out <dir>]      exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/divider')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const verovio = (await build({ stdin: { contents: "import v from 'verovio'; globalThis.VEROVIO = v;", resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'error', external: ['node:fs', 'node:crypto'], banner: { js: 'var require = function () { return {}; };' } })).outputFiles[0].text;
const bundle = (await build({
  stdin: {
    contents: "export { mountChatPanel } from './src/chat-panel-dom.ts'; export { settingsStore } from './src/dialog-core.ts'; export { attachScoreArea } from './src/live-score-dom.ts'; export { RHYTHM_STARTER } from './src/new-note-core.ts'; export { pageWidthFor, MIN_HOST_WIDTH_PX, FIT_PAGE_FACTOR, COMPACT_SCORE_INSET_PX } from './src/host-width-core.ts';",
    resolveDir: ROOT, loader: 'ts',
  },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text;
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `:root { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --interactive-accent:#7b6cd9; --interactive-normal:#f2f3f5; --background-modifier-form-field:#fff; --text-accent:#7b6cd9; --text-on-accent:#fff; --background-modifier-active-hover:rgba(123,108,217,.15); }
*, *::before, *::after { box-sizing: border-box; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
svg { color: var(--text-normal); } svg path, svg g { fill: currentColor; }`;
const stepsOf = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body><div id="host" style="width:1100px;height:640px"></div>
<script src="/verovio.js"></script><script src="/bundle.js"></script><script>
window.engraves = 0; window.RHYTHM = { dummy: true };
var steps = ${JSON.stringify(stepsOf)};
function musicXml(bars) {
  function part(id, octave, clef) { var m = ''; for (var b = 0; b < bars; b++) { m += '<measure number="' + (b + 1) + '">' + (b === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>' + clef + '</sign><line>' + (clef === 'G' ? 2 : 4) + '</line></clef></attributes>' : '');
    for (var n = 0; n < 4; n++) m += '<note><pitch><step>' + steps[(b * 4 + n + id.length) % 7] + '</step><octave>' + octave + '</octave></pitch><duration>1</duration><type>quarter</type></note>'; m += '</measure>'; } return '<part id="' + id + '">' + m + '</part>'; }
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part><score-part id="P2"><part-name>Bass</part-name></score-part></part-list>' + part('P1', 5, 'G') + part('P2', 3, 'F') + '</score-partwise>';
}
window.toolkit = null;
window.engrave = function (hostWidth) {
  if (!toolkit) toolkit = new VEROVIO.toolkit();
  toolkit.setOptions({ adjustPageHeight: true, mnumInterval: 1, breaks: 'auto', pageWidth: cp.pageWidthFor(Math.max(cp.MIN_HOST_WIDTH_PX, hostWidth - cp.COMPACT_SCORE_INSET_PX), cp.FIT_PAGE_FACTOR), pageMarginTop: 50, pageMarginBottom: 50, pageMarginLeft: 50, pageMarginRight: 50, scale: 40, header: 'none', footer: 'none' });
  toolkit.loadData(musicXml(16)); var n = toolkit.getPageCount(), out = ''; for (var i = 1; i <= n; i++) out += toolkit.renderToSVG(i); return out;
};
window.data = JSON.parse(localStorage.getItem('dataJson') || '{}');                       // the plugin's data.json stand-in: a reload reads it back
window.mount = function () {
  if (window.h) { window.h.dispose(); window.area.dispose(); }
  var host = document.getElementById('host'); host.className = ''; host.removeAttribute('style'); host.style.width = (window.hostW || 1100) + 'px'; host.style.height = '640px'; host.innerHTML = '';
  window.area = cp.attachScoreArea(host, 'score', {
    renderInto: function (el, payload) { window.engraves++; el.innerHTML = engrave(el.clientWidth); return true; }, stopPlayers: function () {},
    compute: function () { return Promise.resolve({ type: 'musicxml', content: 'x' }); }, title: 'bar_001', first: true,
    setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); } });
  area.showNow(cp.RHYTHM_STARTER);
  window.store = cp.settingsStore(data, function () { localStorage.setItem('dataJson', JSON.stringify(data)); });
  window.h = cp.mountChatPanel(host, { store: store, box: { placeholder: 'Describe what you want, in a sentence', preview: async function () { return { ok: false, message: 'x' }; }, apply: async function () { return { ok: false }; } } }, 'Mix [[bar_005]] and [[bar_006]].');
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.geo = function () { var host = document.getElementById('host'), body = document.querySelector('.forge-chat-body'), sc = document.querySelector('.forge-rhythm-score-host'), svg = sc && sc.querySelector('svg'), hd = document.querySelector('.forge-chat-resizer');
  return { hostW: host.clientWidth, panelW: box('.forge-chat-panel').w, bodyW: body.getBoundingClientRect().width, bodyLeft: body.getBoundingClientRect().left, panelRight: box('.forge-chat-panel').right, scoreHostW: sc ? sc.clientWidth : 0, svgW: svg ? svg.getBoundingClientRect().width : 0,
    hostOverflowX: host.scrollWidth - host.clientWidth, bodyOverflowX: body.scrollWidth - body.clientWidth, docOverflowX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, scOverflowX: sc ? sc.scrollWidth - sc.clientWidth : 0,
    variable: host.style.getPropertyValue('--forge-chat-left'), handle: !!hd, valuenow: hd && hd.getAttribute('aria-valuenow'), cls: host.className, engraves: engraves, stored: data.dialogRatio }; };
</script>`;
const routes = { 'GET /verovio.js': (q, r) => { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(verovio); }, 'GET /bundle.js': (q, r) => { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(bundle); } };
const p = await openPage({ dir: '/', width: 1200, height: 720, pageHtml: page, routes });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const rd = (x) => Math.round(x * 10) / 10;
const mouse = (type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
const key = async (k, code, vk) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const settle = async () => { await sleep(900); };                                // the relayout waits 250 ms of quiet; 900 is plenty
const shot = async (name, w) => p.shot(path.join(OUT, name), { x: 0, y: 0, width: w, height: 640 });
const fresh = async (width) => { await ev(`localStorage.clear(); data = {}; hostW = ${width}; mount()`); await sleep(700); };

// the engine must be there before anything else: the real Verovio engraves the Score for its column
await fresh(1100);
const g0 = await ev('geo()');
numbers.default1100 = { ...g0 };
verdict.verovioEngraved = g0.svgW > 300 && g0.engraves >= 1;

// ---- default: 40 / 60, the handle on the border, 6 px of hit area, col-resize, nothing else at rest ------------------------------------------------------------------------------------------------------------------------
const hb = await ev(`box('.forge-chat-resizer')`);
const look = await ev(`(function () { var h = document.querySelector('.forge-chat-resizer'), cs = getComputedStyle(h), pn = getComputedStyle(document.querySelector('.forge-chat-panel')); var b = box('.forge-chat-resizer');
  return { cursor: cs.cursor, position: cs.position, bg: cs.backgroundColor, bgImage: cs.backgroundImage, shadow: cs.boxShadow, border: cs.borderTopWidth, panelBorder: pn.borderRightWidth + ' ' + pn.borderRightStyle, hit: [b.left - 1.5, b.left + 1, b.x, b.right - 1, b.right + 1.5].map(function (px) { var e = document.elementFromPoint(px, b.y); return !!e && e.classList.contains('forge-chat-resizer'); }), left: b.left, right: b.right,
    role: h.getAttribute('role'), orient: h.getAttribute('aria-orientation'), tab: h.getAttribute('tabindex'), name: document.getElementById(h.getAttribute('aria-labelledby')).textContent, label: h.getAttribute('aria-label'), title: h.getAttribute('title'), now: h.getAttribute('aria-valuenow'), min: h.getAttribute('aria-valuemin'), max: h.getAttribute('aria-valuemax') }; })()`);
numbers.handleAtRest = { widthPx: rd(hb.w), centreX: rd(hb.x), panelRight: rd(g0.panelRight), look };
verdict.defaultIs40_60 = Math.abs(g0.panelW / g0.hostW - 0.4) < 0.002 && Math.abs(g0.bodyW / g0.hostW - 0.6) < 0.01 && g0.variable === '40%';
verdict.handleIs6pxOnTheBorder = Math.abs(hb.w - 6) < 0.5 && Math.abs(hb.x - g0.panelRight) < 1.5 && Math.abs(g0.bodyLeft - g0.panelRight) < 0.5;
verdict.hitAreaAbout6pxStraddlingTheBorder = JSON.stringify(look.hit) === JSON.stringify([false, true, true, true, false]) && look.left < g0.panelRight - 0.5 && look.right > g0.panelRight + 0.5;
verdict.cursorColResizeAndNothingElseAtRest = look.cursor === 'col-resize' && look.position === 'absolute' && look.bg === 'rgba(0, 0, 0, 0)' && look.bgImage === 'none' && look.shadow === 'none' && look.panelBorder === '1px solid';
verdict.separatorSemantics = look.role === 'separator' && look.orient === 'vertical' && look.tab === '0' && look.now === '40' && look.label === null && look.title === null && /Resize the dialog and the Score/.test(look.name) && Number(look.min) < 40 && Number(look.max) > 40;
verdict.noHorizontalScrollAtDefault = g0.hostOverflowX <= 0 && g0.bodyOverflowX <= 0 && g0.docOverflowX <= 0 && g0.scOverflowX <= 0 && g0.svgW <= g0.scoreHostW + 1;
await shot('divider-1-default-1100.png', 1100);

// ---- a real drag to the right: the ratio changes LIVE, the Score column follows, NOTHING is engraved during it (even across a 600 ms pause), ONE engraving after the release --------------------------------------------
let prev = g0; const live = [];
await mouse('mouseMoved', hb.x, hb.y); await mouse('mousePressed', hb.x, hb.y);
const draggingClass = await ev(`document.getElementById('host').classList.contains('forge-chat-dragging')`);
for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', hb.x + i * 8, hb.y); if (i === 10) await sleep(600); else await sleep(15); if (i % 5 === 0) live.push(await ev('geo()')); }
const mid = await ev('geo()'); const engravesDuring = mid.engraves - g0.engraves; const storedDuring = mid.stored;
await mouse('mouseReleased', hb.x + 160, hb.y); const afterRelease = await ev('geo()');
await settle(); const g1 = await ev('geo()');
numbers.dragRight160px = { liveLeftColumnPx: live.map((l) => rd(l.panelW)), liveScoreColumnPx: live.map((l) => rd(l.bodyW)), engravesDuringTheDrag: engravesDuring, storedDuringTheDrag: storedDuring ?? null, storedAfter: g1.stored, finalPanelW: rd(g1.panelW), finalBodyW: rd(g1.bodyW), scoreHostW: g1.scoreHostW, svgW: rd(g1.svgW), engravesAfterRelease: g1.engraves - mid.engraves };
verdict.draggingClassWhileHeld = draggingClass === true && afterRelease.cls.indexOf('forge-chat-dragging') < 0;
verdict.ratioChangesLive = live.every((l, i) => i === 0 ? l.panelW > g0.panelW + 20 : l.panelW > live[i - 1].panelW + 20) && Math.abs(mid.panelW - (g0.panelW + 160)) < 2;
verdict.scoreColumnFollowsLive = live.every((l) => Math.abs(l.panelW + l.bodyW - l.hostW) < 1.5) && mid.bodyW < g0.bodyW - 150;
verdict.nothingStoredWhileMoving = storedDuring === undefined;
verdict.zeroEngravesDuringTheDragEvenAcrossAPause = engravesDuring === 0;
verdict.exactlyOneEngraveAfterRelease = g1.engraves - mid.engraves === 1;
verdict.releaseStoredTheRatioOnce = Math.abs(g1.stored - (g0.panelW + 160) / g0.hostW) < 0.003;
verdict.scoreEngravedForTheNewColumn = Math.abs((g0.scoreHostW - g1.scoreHostW) - 160) < 2 && Math.abs(g1.svgW - (g1.scoreHostW - 16)) < 3 && Math.abs(g0.svgW - (g0.scoreHostW - 16)) < 3;
verdict.noHorizontalScrollAfterTheDrag = g1.hostOverflowX <= 0 && g1.bodyOverflowX <= 0 && g1.docOverflowX <= 0 && g1.scOverflowX <= 0;
await shot('divider-2-dragged-160px-right.png', 1100);

// ---- far LEFT: the dialog stops at 280 px; the Score gets the rest --------------------------------------------------------------------------------------------------------------------------------------------------------------
let hb2 = await ev(`box('.forge-chat-resizer')`); const e0 = (await ev('geo()')).engraves;
await mouse('mouseMoved', hb2.x, hb2.y); await mouse('mousePressed', hb2.x, hb2.y);
for (let i = 1; i <= 30; i++) { await mouse('mouseMoved', Math.max(2, hb2.x - i * 30), hb2.y); await sleep(8); }
await mouse('mouseMoved', 2, hb2.y); const farLeftLive = await ev('geo()'); await mouse('mouseReleased', 2, hb2.y); await settle(); const gl = await ev('geo()');
numbers.farLeft = { pointerAtX: 2, leftColumnPx: rd(gl.panelW), scoreColumnPx: rd(gl.bodyW), valuenow: gl.valuenow, stored: gl.stored, engraves: gl.engraves - e0, svgW: rd(gl.svgW) };
verdict.farLeftStopsAt280 = Math.abs(farLeftLive.panelW - 280) < 1 && Math.abs(gl.panelW - 280) < 1 && gl.bodyW > 800;
verdict.farLeftOneEngrave = gl.engraves - e0 === 1 && gl.svgW > g1.svgW;
verdict.farLeftNoHScroll = gl.hostOverflowX <= 0 && gl.bodyOverflowX <= 0 && gl.docOverflowX <= 0 && gl.scOverflowX <= 0;
await shot('divider-3-dragged-far-left-280.png', 1100);

// ---- far RIGHT: the Score keeps 320 px -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
hb2 = await ev(`box('.forge-chat-resizer')`); const e1 = gl.engraves;
await mouse('mouseMoved', hb2.x, hb2.y); await mouse('mousePressed', hb2.x, hb2.y);
for (let i = 1; i <= 30; i++) { await mouse('mouseMoved', Math.min(1195, hb2.x + i * 40), hb2.y); await sleep(8); }
await mouse('mouseMoved', 1195, hb2.y); const farRightLive = await ev('geo()'); await mouse('mouseReleased', 1195, hb2.y); await settle(); const gr = await ev('geo()');
numbers.farRight = { pointerAtX: 1195, leftColumnPx: rd(gr.panelW), scoreColumnPx: rd(gr.bodyW), valuenow: gr.valuenow, stored: gr.stored, engraves: gr.engraves - e1, svgW: rd(gr.svgW), scoreHostW: gr.scoreHostW };
verdict.farRightLeavesTheScore320 = Math.abs(farRightLive.bodyW - 320) < 1 && Math.abs(gr.bodyW - 320) < 1 && Math.abs(gr.panelW - 780) < 1;
verdict.farRightOneEngrave = gr.engraves - e1 === 1 && gr.svgW < gl.svgW;
verdict.farRightNoHScroll = gr.hostOverflowX <= 0 && gr.bodyOverflowX <= 0 && gr.docOverflowX <= 0 && gr.scOverflowX <= 0 && gr.svgW <= gr.scoreHostW + 1;
await shot('divider-4-dragged-far-right-320.png', 1100);

// ---- keyboard: the handle is focusable; Left / Right 2 points; Home resets; :focus-visible shows the accent line (no hover) --------------------------------------------------------------------------------
await ev(`document.querySelector('.forge-chat-resizer').focus()`);
const focusVisible = await ev(`(function () { var h = document.querySelector('.forge-chat-resizer'); return { active: document.activeElement === h, fv: h.matches(':focus-visible'), bg: getComputedStyle(h).backgroundImage }; })()`);
await key('Home', 'Home', 36); await sleep(150); const kHome = await ev('geo()');
await key('ArrowRight', 'ArrowRight', 39); await key('ArrowRight', 'ArrowRight', 39); await sleep(150); const kR = await ev('geo()');
await key('ArrowLeft', 'ArrowLeft', 37); await sleep(150); const kL = await ev('geo()');
await shot('divider-5-keyboard-focus.png', 1100);
for (let i = 0; i < 20; i++) await key('ArrowLeft', 'ArrowLeft', 37); await sleep(150); const kMin = await ev('geo()');
for (let i = 0; i < 40; i++) await key('ArrowRight', 'ArrowRight', 39); await sleep(150); const kMax = await ev('geo()');
numbers.keyboard = { focusVisible, home: [kHome.valuenow, rd(kHome.panelW)], twoRight: [kR.valuenow, rd(kR.panelW)], oneLeft: [kL.valuenow, rd(kL.panelW)], leftMany: [kMin.valuenow, rd(kMin.panelW)], rightMany: [kMax.valuenow, rd(kMax.bodyW)] };
verdict.handleFocusableAndFocusVisibleShowsAccent = focusVisible.active && focusVisible.fv && /linear-gradient/.test(focusVisible.bg);
verdict.homeResetsTo40 = kHome.valuenow === '40' && Math.abs(kHome.panelW - 440) < 1.5 && kHome.stored === 0.4;
verdict.arrowsMoveTwoPoints = kR.valuenow === '44' && Math.abs(kR.panelW - 484) < 1.5 && kL.valuenow === '42' && Math.abs(kL.panelW - 462) < 1.5;
verdict.keyboardClampsAt280And320 = Math.abs(kMin.panelW - 280) < 1 && Math.abs(kMax.bodyW - 320) < 1;
await sleep(600);

// ---- double click on the handle resets to 40 / 60 ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
hb2 = await ev(`box('.forge-chat-resizer')`);
await mouse('mouseMoved', hb2.x, hb2.y); await mouse('mousePressed', hb2.x, hb2.y, { clickCount: 1 }); await mouse('mouseReleased', hb2.x, hb2.y, { clickCount: 1 });
await mouse('mousePressed', hb2.x, hb2.y, { clickCount: 2 }); await mouse('mouseReleased', hb2.x, hb2.y, { clickCount: 2 }); await settle(); const gd = await ev('geo()');
numbers.doubleClick = { leftColumnPx: rd(gd.panelW), stored: gd.stored, valuenow: gd.valuenow, engraves: gd.engraves };
verdict.doubleClickResetsTo40 = Math.abs(gd.panelW - 440) < 1.5 && gd.stored === 0.4 && gd.valuenow === '40';

// ---- persistence per vault: drag to about 55 %, then a REAL reload of the page: the ratio is back, applied on open ---------------------------------------------------------------------------------------------
hb2 = await ev(`box('.forge-chat-resizer')`);
await mouse('mouseMoved', hb2.x, hb2.y); await mouse('mousePressed', hb2.x, hb2.y); for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', hb2.x + i * 17, hb2.y); await sleep(10); } await mouse('mouseReleased', hb2.x + 170, hb2.y); await settle();
const gp = await ev('geo()'); const savedJson = await ev(`localStorage.getItem('dataJson')`);
await p.send('Page.reload'); await sleep(1500); await ev('hostW = 1100; mount()'); await sleep(900); const gq = await ev('geo()');
numbers.persistence = { beforeReloadLeftPx: rd(gp.panelW), stored: gp.stored, dataJson: savedJson, afterReloadLeftPx: rd(gq.panelW), afterReloadVariable: gq.variable, valuenow: gq.valuenow };
verdict.ratioIsInThePluginDataNotInANote = JSON.parse(savedJson).dialogRatio === gp.stored && Object.keys(JSON.parse(savedJson)).join() === 'dialogRatio';
verdict.persistsAcrossAReloadOfTheTab = Math.abs(gq.panelW - gp.panelW) < 1.5 && gq.stored === gp.stored && gq.handle;
await shot('divider-6-after-reload.png', 1100);

// ---- the narrow layout: no handle, no variable, no style attribute; wide again: the stored ratio is back ----------------------------------------------------------------------------------------------------------------
await ev(`document.getElementById('host').style.width = '700px'`); await sleep(500); const gn = await ev(`(function () { var h = document.getElementById('host'); var g = geo(); g.hasHandle = !!document.querySelector('.forge-chat-resizer'); g.styleAttr = h.getAttribute('style'); g.panelTop = box('.forge-chat-panel').top; g.bodyBottom = box('.forge-chat-body').bottom; g.panelW2 = box('.forge-chat-panel').w; return g; })()`);
numbers.narrow700 = { hasHandle: gn.hasHandle, variable: gn.variable, cls: gn.cls, panelW: rd(gn.panelW2), stored: gn.stored };
verdict.narrowStackedHasNoHandleNoVariable = !gn.hasHandle && gn.variable === '' && gn.cls.includes('forge-chat-stacked') && !gn.cls.includes('forge-chat-wide') && gn.panelW2 > 690 && gn.bodyBottom <= gn.panelTop + 1;
verdict.narrowDidNotOverwriteTheStoredRatio = gn.stored === gp.stored;
await shot('divider-7-narrow-700.png', 700);
await ev(`document.getElementById('host').style.width = '1100px'`); await sleep(600); const gw = await ev('geo()');
verdict.wideAgainRestoresHandleAndRatio = gw.handle && Math.abs(gw.panelW - gp.panelW) < 1.5;

// ---- a tab only 900 px wide: a stored 55 % is fine (495 px); a stored 0.7 is shown clamped (580 / 320) and NOT overwritten; widening to 1400 shows 0.7 again ---------------------------------------------------------------------
await ev(`data.dialogRatio = 0.7; localStorage.setItem('dataJson', JSON.stringify(data)); hostW = 900; mount()`); await sleep(900); const g9 = await ev('geo()');
await ev(`document.getElementById('host').style.width = '1400px'`); await sleep(600); const g14 = await ev('geo()');
numbers.storedSeventy = { at900: { leftPx: rd(g9.panelW), scorePx: rd(g9.bodyW), stored: g9.stored }, at1400: { leftPx: rd(g14.panelW), scorePx: rd(g14.bodyW), stored: g14.stored } };
verdict.storedRatioClampedForDisplayOnlyAt900 = Math.abs(g9.bodyW - 320) < 1 && g9.stored === 0.7 && Math.abs(g14.panelW / g14.hostW - 0.7) < 0.003 && g14.stored === 0.7 && g9.hostOverflowX <= 0 && g9.scOverflowX <= 0;

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
