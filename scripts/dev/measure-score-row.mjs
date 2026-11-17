// 2026-11-17-2000 - the Score's one gentle row in REAL headless Chrome with real mouse and key events (CDP). The row's own DOM module (src/score-transport-dom.ts, bundled with esbuild) is mounted into the toolbar the music
// edition builds (a stand-in of the zoom bar and the Kit toggle, the real styles.css), against Obsidian's CSS variables for a light and a dark theme (their default values).
//   node scripts/dev/measure-score-row.mjs [--out <dir>]        exit 0 = every verdict true
// Measures: the toolbar is ONE line at 1000, 600, 400, 360 and 320 px (the row wraps only below 320: the width where it first wraps is reported); no progress bar, time or slider element; Play swaps to Pause with a real
// click; the tempo buttons and the typed tempo (a real click on the value, real typing, Enter); the Export menu opens inside the pane and a choice runs; the row's height is the same in every state; light and dark shots.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/score-row')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({ entryPoints: [path.join(ROOT, 'src/score-transport-dom.ts')], bundle: true, format: 'iife', globalName: 'tp', write: false, logLevel: 'silent' })).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --text-normal:#222222; --text-muted:#5c5c5c; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --radius-s:4px; --radius-m:8px; --shadow-s:0 1px 3px rgba(0,0,0,0.12); --font-ui-smaller:12px; --font-ui-small:13px; }
.theme-dark { --background-primary:#1e1e1e; --text-normal:#dadada; --text-muted:#b3b3b3; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#9b8cf0; --radius-s:4px; --radius-m:8px; --shadow-s:0 2px 8px rgba(0,0,0,0.5); --font-ui-smaller:12px; --font-ui-small:13px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1000px;padding:8px 0 90px"><div class="forge-score-compact"><div class="forge-score-toolbar" id="tb">
<midi-player class="forge-midi-player forge-midi-player-headless"></midi-player>
<div class="forge-zoom-bar"><button class="forge-zoom-button" aria-label="Zoom out" title="Zoom out" type="button">−</button><button class="forge-zoom-button forge-zoom-reset" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" type="button">100%</button><button class="forge-zoom-button" aria-label="Zoom in" title="Zoom in" type="button">+</button></div>
<div class="forge-kit-pill"><button class="forge-kit-toggle" type="button"><span class="forge-kit-toggle-icon">🥁</span><span class="forge-kit-toggle-label">Kit</span></button></div>
</div><div style="height:30px"></div></div></div>
<script>${bundle}</script><script>
window.events = []; var playing = false, ls = [];
var player = { get playing() { return playing; }, start() { playing = true; ls.forEach(function (l) { l(true); }); }, stop() { playing = false; ls.forEach(function (l) { l(false); }); }, reset() { playing = false; ls.forEach(function (l) { l(false); }); }, setTempo(p) { window.events.push('tempo ' + p); }, onStateChange(fn) { ls.push(fn); return function () {}; } };
window.row = tp.mountScoreTransport(document.getElementById('tb'), { player: player, exportItems: [{ id: 'musicxml', label: 'MusicXML' }, { id: 'midi', label: 'MIDI' }, { id: 'garageband', label: 'Open in GarageBand' }], runExport: function (id) { window.events.push('export ' + id); } });
window.lines = function () { var tops = {}; var els = document.querySelectorAll('#tb button, #tb input'); for (var i = 0; i < els.length; i++) { var r = els[i].getBoundingClientRect(); if (r.width === 0 || els[i].closest('[hidden]')) continue; tops[Math.round(r.top)] = 1; } return Object.keys(tops).length; };
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
</script>`;
const p = await openPage({ dir: '/', width: 1100, height: 420, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const setWidth = async (w) => { await ev(`document.getElementById('frame').style.width = '${w}px'`); await sleep(120); };
const clickSel = async (sel) => { const b = await ev(`box(${JSON.stringify(sel)})`); await p.click(b.x, b.y); await sleep(120); return b; };
const press = async (key, code) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: code === 'Enter' ? 13 : 27 }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: code === 'Enter' ? 13 : 27 }); await sleep(100); };

// ---- one line at the widths that matter; where it first wraps ---------------------------------------------------------------------------------------------------------------------------------
for (const w of [1000, 600, 400, 360, 320]) { await setWidth(w); numbers[`lines@${w}`] = await ev('lines()'); verdict[`oneLine_${w}`] = numbers[`lines@${w}`] === 1; }
let firstWrap = null; for (let w = 340; w >= 240; w -= 10) { await setWidth(w); if (await ev('lines()') > 1) { firstWrap = w; break; } } numbers.firstWrapsBelow = firstWrap; await setWidth(1000);
verdict.wrapsOnlyBelow320 = firstWrap === null || firstWrap < 320;
// ---- nothing of the old player is left ---------------------------------------------------------------------------------------------------------------------------------------------------
verdict.noProgressOrTimeElement = await ev(`document.querySelectorAll('#tb input[type=range], #tb progress, #tb meter, #tb [role=slider], #tb [role=progressbar], #tb [class*=progress], #tb [class*=seek], #tb [class*=elapsed]').length === 0 && !/\\d+:\\d\\d/.test(document.getElementById('tb').innerText)`);
verdict.midiPlayerElementNotShown = await ev(`getComputedStyle(document.querySelector('midi-player')).display === 'none'`);
verdict.buttonsHaveNoBorder = await ev(`[].every.call(document.querySelectorAll('#tb .forge-tp-btn, #tb .forge-zoom-button, #tb .forge-kit-toggle'), function (b) { return getComputedStyle(b).borderTopWidth === '0px'; })`);
verdict.iconsAre16px = await ev(`[].every.call(document.querySelectorAll('#tb .forge-tp-btn svg'), function (s) { var r = s.getBoundingClientRect(); return Math.round(r.width) === 16 && Math.round(r.height) === 16; })`);
// ---- real clicks --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const heights = new Set(); const rowHeight = async () => { heights.add(await ev(`Math.round(document.getElementById('tb').getBoundingClientRect().height)`)); };
await rowHeight();
await clickSel('.forge-tp-play'); verdict.playBecomesPause = await ev(`document.querySelector('.forge-tp-play').getAttribute('aria-label') === 'Pause' && document.querySelector('.forge-tp-play').classList.contains('is-playing')`); await rowHeight();
await p.shot(path.join(OUT, 'row-1000-light-playing.png'), { x: 0, y: 0, width: 1000, height: 60 });
await clickSel('.forge-tp-play'); verdict.pauseBecomesPlay = await ev(`document.querySelector('.forge-tp-play').getAttribute('aria-label') === 'Play'`);
await clickSel('.forge-tp-faster'); verdict.fasterGivesPlus5 = await ev(`document.querySelector('.forge-tp-tempo').textContent.trim() === '105%'`) && (await ev('window.events')).includes('tempo 105');
await clickSel('.forge-tp-tempo'); verdict.valueClickOpensField = await ev(`!!document.querySelector('.forge-tp-tempo-input') && document.activeElement === document.querySelector('.forge-tp-tempo-input')`); await rowHeight();
await p.send('Input.insertText', { text: '3' }); await p.send('Input.insertText', { text: '0' }); await p.send('Input.insertText', { text: '0' }); await press('Enter', 'Enter');
verdict.typedTempoApplies = await ev(`document.querySelector('.forge-tp-tempo').textContent.trim() === '200%' && document.activeElement === document.querySelector('.forge-tp-tempo')`) && (await ev('window.events')).includes('tempo 200'); await rowHeight();
verdict.fasterDisabledAtTheTop = await ev(`document.querySelector('.forge-tp-faster').disabled === true`);
await clickSel('.forge-tp-tempo'); await p.send('Input.insertText', { text: '77' }); await press('Escape', 'Escape'); verdict.escCancels = await ev(`document.querySelector('.forge-tp-tempo').textContent.trim() === '200%' && !document.querySelector('.forge-tp-tempo-input')`);
// ---- Export: opens inside the pane at every width, a real click on an item runs it ------------------------------------------------------------------------------------------------------------
for (const w of [1000, 360, 320]) {
  await setWidth(w); await clickSel('.forge-tp-export-btn'); const m = await ev(`box('.forge-tp-menu')`); const f = await ev(`box('#frame')`);
  verdict[`exportMenuInsidePane_${w}`] = !!m && m.left >= f.left - 0.5 && m.right <= f.right + 0.5 && m.w > 100 && m.h > 40; numbers[`menu@${w}`] = m ? { left: Math.round(m.left), right: Math.round(m.right), width: Math.round(m.w) } : null;
  if (w === 360) { await p.shot(path.join(OUT, 'row-360-light-menu.png'), { x: 0, y: 0, width: 360, height: 170 }); await ev(`theme('dark')`); await sleep(120); await p.shot(path.join(OUT, 'row-360-dark-menu.png'), { x: 0, y: 0, width: 360, height: 170 }); await ev(`theme('light')`); }
  await clickSel('.forge-tp-export-btn'); verdict[`exportMenuCloses_${w}`] = await ev(`document.querySelector('.forge-tp-menu').hidden === true`);
}
await setWidth(600); await clickSel('.forge-tp-export-btn'); const items = await ev(`box('.forge-tp-menuitem:nth-child(2)')`); await p.click(items.x, items.y); await sleep(120);
verdict.exportChoiceRuns = (await ev('window.events')).includes('export midi') && await ev(`document.querySelector('.forge-tp-menu').hidden === true`);
// ---- the same height in every state, and the shots -----------------------------------------------------------------------------------------------------------------------------------------------
numbers.rowHeights = [...heights]; verdict.oneRowHeightInEveryState = heights.size === 1;
for (const w of [1000, 600, 360]) for (const theme of ['light', 'dark']) { await setWidth(w); await ev(`theme('${theme}')`); await sleep(120); await p.shot(path.join(OUT, `row-${w}-${theme}.png`), { x: 0, y: 0, width: w, height: 60 }); }
p.close();
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
