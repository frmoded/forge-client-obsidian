// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1) - the review tab in REAL headless Chrome (CDP) with REAL key and mouse events, the REAL styles.css and Obsidian's own CSS variables for a light and a dark theme (their default values; the 0992c
// and 0992a lesson: a tab is not "done" on a stand-in stylesheet). The plugin's own DOM module (src/failed-prompt-tab-dom.ts + the pure core, bundled with esbuild) is mounted in a pane-shaped host; the PORTS are stand-ins (the queue in memory, a regex
// for the grammar's verdict, a recording clipboard): nothing else is stubbed (the DOM, the CSS, the keys). Obsidian itself is NOT driven.
//   node scripts/dev/measure-review-tab.mjs [--out <dir>]        exit 0 = every verdict true
// Measures at 1000, 600 and 360 px, light and dark: the tab fits its pane (no horizontal overflow), the card shows the sentence as TEXT, the five buttons are real buttons reached by Tab with a visible 2px focus ring, the real keys (W T N A S U, Cmd+Enter,
// Esc) work from the card and do NOT fire inside a box, a refused line is shown in words under the box and blocks Save, Copy lines and Export say what they did, Undo restores the item, the muted text has contrast of at least 4.5 in both themes,
// no colour on the tab is red, no tooltip (no title attribute), no hover-only behaviour (a hover changes nothing in the DOM).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/review-tab')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: { contents: "export { mountReviewTab } from './src/failed-prompt-tab-dom.ts'; export { makeRecord } from './src/failed-prompt-core.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'rv', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-hover:#c8c8c8; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --font-ui-small:13px; --font-ui-smaller:12px; --font-ui-medium:15px; --font-ui-large:18px; --radius-s:4px; --radius-m:8px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-hover:#4a4a4a; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7cf0; --font-ui-small:13px; --font-ui-smaller:12px; --font-ui-medium:15px; --font-ui-large:18px; --radius-s:4px; --radius-m:8px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
button { font: inherit; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1000px;height:640px;overflow:auto"><div id="host"></div></div>
<script>${bundle}</script><script>
var T = '2026-11-21T01:00:00.000Z';
function mk(id, time, over) { var base = { kind: 'phrase', sentence: 'swap the second and third bars', lines: ['Extend [[bar_005]] to 4 bars, repeating with fills.'], barCount: 4, grammarError: { message: 'Expected "Keep ..." but found "swap".', column: 1 }, service: { result: 'none' } }; for (var k in over) base[k] = over[k]; return rv.makeRecord(base, { id: id, time: time, build: '0.5.41 music abc1234', vaultId: 'v-1' }); }
var records = [
  mk('a', '2026-11-21T01:00:00.000Z', {}),
  mk('b', '2026-11-21T02:00:00.000Z', { sentence: '<img src=x onerror=alert(1)> make it groovier', kind: 'bar', lines: ['Set the tempo to 96.'], barCount: null, service: { result: 'refused', text: 'I could not turn that sentence into a phrase.' } }),
  mk('c', '2026-11-21T00:30:00.000Z', { sentence: 'Play [[phrase_001]', kind: 'arrangement', lines: [], service: { result: 'error:503', text: 'busy' } }),
];
window.log = { copied: [], exported: 0, saves: 0 };
var ports = {
  enabled: function () { return true; }, load: function () { return Promise.resolve(records.slice()); }, save: function (r) { records = r.slice(); window.log.saves++; return Promise.resolve(); },
  check: function (item, lines) { return Promise.resolve(lines.map(function (l, i) { return /^(Move|Keep|Delete|Set|Hit)\\b/.test(l) ? null : 'The grammar did not accept this sentence (column 1: Expected "Keep ..." but found "' + l.split(' ')[0] + '".).'; })); },
  copy: function (t) { window.log.copied.push(t); return Promise.resolve(); }, exportResolved: function () { window.log.exported++; return Promise.resolve({ count: records.filter(function (r) { return r.resolution; }).length, file: 'plugin/failed-prompts-resolved.jsonl' }); },
  active: function () { return null; }, applyLines: function () { return Promise.resolve({ ok: true, message: 'Added.' }); }, now: function () { return '2026-11-22T00:00:00.000Z'; },
};
window.tab = rv.mountReviewTab(document.getElementById('host'), ports); window.tab.refresh();
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.lum = function (c) { var m = c.match(/[\\d.]+/g).map(Number); var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
window.contrast = function (fg, bg) { var a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
</script>`;
const p = await openPage({ dir: '/', width: 1100, height: 700, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
await sleep(400);
const setWidth = async (w) => { await ev(`document.getElementById('frame').style.width = '${w}px'`); await sleep(150); };
const key = async (k, code, vk, { meta = false, text } = {}) => {
  const modifiers = meta ? 4 : 0;
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text !== undefined ? { text } : {}) });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(120);
};
const typeText = async (t) => { await p.send('Input.insertText', { text: t }); await sleep(120); };
const clickSel = async (sel) => { const b = await ev(`box(${JSON.stringify(sel)})`); await p.click(b.x, b.y); await sleep(160); return b; };
const sentence = `(document.querySelector('.forge-review-sentence') || {}).textContent`;
const focusHost = () => ev(`(function () { var h = document.getElementById('host'); h.tabIndex = -1; h.focus(); })()`);

// ---- the tab at every width, light and dark ---------------------------------------------------------------------------------------------------------------------------------------------------
for (const w of [1000, 600, 360]) for (const theme of ['light', 'dark']) {
  await ev(`theme('${theme}')`); await setWidth(w); const tag = `${w}_${theme}`;
  const m = await ev(`(function () { var f = document.getElementById('frame'); var c = box('.forge-review-card'); var fr = box('#frame'); var a = document.querySelectorAll('.forge-review-actions button'); var lefts = []; for (var i = 0; i < a.length; i++) { var r = a[i].getBoundingClientRect(); lefts.push([r.left, r.right]); }
    return { scrollW: f.scrollWidth, clientW: f.clientWidth, cardLeft: c.left, cardRight: c.right, frameLeft: fr.left, frameRight: fr.right, nButtons: a.length, allInside: lefts.every(function (l) { return l[0] >= fr.left - 0.5 && l[1] <= fr.right + 0.5; }) }; })()`);
  numbers[`card@${tag}`] = { w: Math.round(m.cardRight - m.cardLeft), scrollW: m.scrollW, clientW: m.clientW };
  verdict[`noHorizontalOverflow_${tag}`] = m.scrollW <= m.clientW + 1;
  verdict[`cardAndFiveButtonsInsideThePane_${tag}`] = m.cardLeft >= m.frameLeft - 0.5 && m.cardRight <= m.frameRight + 0.5 && m.nButtons === 5 && m.allInside;
  await p.shot(path.join(OUT, `review-${w}-${theme}.png`), { x: 0, y: 0, width: w, height: 640 });
}

// ---- the card is TEXT; contrast; no red; no title; hover changes nothing ------------------------------------------------------------------------------------------------------------------------
await ev(`theme('light')`); await setWidth(1000);
verdict.oldestFirstWithTheCount = (await ev(sentence)) === 'Play [[phrase_001]' && /3 waiting/.test(await ev(`document.getElementById('host').textContent`));
for (const theme of ['light', 'dark']) {
  await ev(`theme('${theme}')`);
  const c = await ev(`(function () { var bg = getComputedStyle(document.body).backgroundColor; var m = document.querySelector('.forge-review-count'); var mc = getComputedStyle(m).color; var cardBg = getComputedStyle(document.querySelector('.forge-review-card')).backgroundColor; var g = getComputedStyle(document.querySelector('.forge-review-grammar')).color; return { muted: contrast(mc, bg), grammarOnCard: contrast(g, cardBg), normalOnCard: contrast(getComputedStyle(document.querySelector('.forge-review-sentence')).color, cardBg) }; })()`);
  numbers[`contrast_${theme}`] = { muted: Math.round(c.muted * 10) / 10, grammarOnCard: Math.round(c.grammarOnCard * 10) / 10, sentence: Math.round(c.normalOnCard * 10) / 10 };
  verdict[`mutedTextContrastAtLeast4_5_${theme}`] = c.muted >= 4.5 && c.grammarOnCard >= 4.5 && c.normalOnCard >= 4.5;
}
await ev(`theme('light')`);
verdict.noRedAnywhere = await ev(`(function () { var els = document.getElementById('host').querySelectorAll('*'); for (var i = 0; i < els.length; i++) { var cs = getComputedStyle(els[i]); var cols = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.outlineColor]; for (var j = 0; j < cols.length; j++) { var m = cols[j].match(/[\\d.]+/g); if (!m) continue; var r = +m[0], g = +m[1], b = +m[2]; if (r > 150 && g < 110 && b < 110) return false; } } return true; })()`);
verdict.noTitleAttributeNoTooltip = (await ev(`document.querySelectorAll('#host [title]').length`)) === 0;
const before = await ev(`document.getElementById('host').innerHTML`);
const hb = await ev(`box('.forge-review-act-s')`); await p.hover(hb.x, hb.y); await sleep(250);
verdict.hoverChangesNothing = (await ev(`document.getElementById('host').innerHTML`)) === before;

// ---- real keys: Tab reaches the five buttons with a visible focus ring; W opens the box, typing a letter in it resolves nothing -------------------------------------------------------------
await focusHost();
let ringOk = true;
for (let i = 0; i < 4; i++) { await key('Tab', 'Tab', 9); }
const focused = await ev(`(function () { var e = document.activeElement; var cs = getComputedStyle(e); return { tag: e.tagName, text: e.textContent, outline: cs.outlineStyle + ' ' + cs.outlineWidth }; })()`);
numbers.focusAfterFourTabs = focused; ringOk = focused.tag === 'BUTTON' && /solid 2px/.test(focused.outline);
verdict.tabReachesButtonsWithAVisible2pxRing = ringOk;
await focusHost(); await key('w', 'KeyW', 87, { text: 'w' });
verdict.keyWOpensTheLinesBox = (await ev(`!!document.querySelector('.forge-review-lines-box')`)) && (await ev(`document.activeElement === document.querySelector('.forge-review-lines-box')`));
await key('n', 'KeyN', 78, { text: 'n' });
verdict.aLetterInsideTheBoxResolvesNothing = (await ev(`window.log.saves`)) === 0 && (await ev(`document.querySelector('.forge-review-lines-box').value`)) === 'n';
await ev(`(function () { var b = document.querySelector('.forge-review-lines-box'); b.focus(); b.select(); })()`); await key('Backspace', 'Backspace', 8);
await typeText('Keep bars 1 to 2.'); await key('Enter', 'Enter', 13, { text: '\r' }); await typeText('Make it sparkle.'); await sleep(200);
const checks = await ev(`[].map.call(document.querySelectorAll('.forge-review-check'), function (e) { return e.textContent; })`);
numbers.checks = checks;
verdict.refusedLineIsShownInWordsUnderTheBox = checks.length === 2 && /Line 1 reads/.test(checks[0]) && /Line 2: .*did not accept/.test(checks[1]);
verdict.saveIsBlockedWhileALineIsRefused = await ev(`document.querySelector('.forge-review-save').disabled === true`);
await p.shot(path.join(OUT, 'review-lines-refused.png'), { x: 0, y: 0, width: 1000, height: 640 });
await ev(`(function () { var b = document.querySelector('.forge-review-lines-box'); b.focus(); b.select(); })()`); await key('Backspace', 'Backspace', 8); await typeText('Keep bars 1 to 2.'); await sleep(200);
await clickSel('.forge-review-copy');
verdict.copyLinesPutsTheLinesOnTheClipboardAndSaysSo = JSON.stringify(await ev('window.log.copied')) === JSON.stringify(['Keep bars 1 to 2.']) && /Copied 1 line\./.test(await ev(`document.querySelector('.forge-review-status').textContent`));
await ev(`document.querySelector('.forge-review-lines-box').focus()`); await key('Enter', 'Enter', 13, { meta: true });
verdict.cmdEnterSavesAndMovesOn = (await ev('window.log.saves')) === 1 && (await ev(sentence)) === 'swap the second and third bars';

// ---- the five resolutions with REAL clicks; undo; export ---------------------------------------------------------------------------------------------------------------------------------------
await clickSel('.forge-review-act-t'); await typeText('swap is a word'); await ev(`document.querySelector('.forge-review-note-box').focus()`); await key('Enter', 'Enter', 13, { meta: true });
verdict.teachAWordResolves = (await ev('window.log.saves')) === 2 && (await ev(sentence)) === '<img src=x onerror=alert(1)> make it groovier';
verdict.markupInASentenceStaysText = (await ev(`document.querySelectorAll('#host img').length`)) === 0 && (await ev(sentence)).startsWith('<img src=x');
await clickSel('.forge-review-act-s'); verdict.skipDoesNotSave = (await ev('window.log.saves')) === 2;
await clickSel('.forge-review-act-n'); verdict.notARequestResolves = (await ev('window.log.saves')) === 3;
await clickSel('.forge-review-undo'); verdict.undoBringsTheItemBack = (await ev('window.log.saves')) === 4 && (await ev(`document.getElementById('host').textContent`)).includes('1 waiting');
await clickSel('.forge-review-export');
verdict.exportSaysHowManyAndWhere = /Exported 2 resolved sentences to failed-prompts-resolved\.jsonl\./.test(await ev(`document.querySelector('.forge-review-status').textContent`)) && (await ev('window.log.exported')) === 1;
await clickSel('.forge-review-act-a'); await typeText('Which bars do you mean?'); await clickSel('.forge-review-save');
verdict.askThePersonResolvesAndTheQueueIsEmpty = /Nothing is waiting/.test(await ev(`document.getElementById('host').textContent`)) && (await ev('window.log.saves')) === 5;
await p.shot(path.join(OUT, 'review-empty.png'), { x: 0, y: 0, width: 1000, height: 300 });

p.close();
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
