// 2026-11-17-2001 - the music tab's chat-style composer in REAL headless Chrome with real key and mouse events (CDP). The panel's own DOM modules (src/chat-panel-dom.ts + src/prompt-box-dom.ts, bundled with esbuild) are
// mounted into a tab-shaped host (a stand-in Score body, the real styles.css) against Obsidian's CSS variables for a light and a dark theme (their default values). The ports are stand-ins: the preview answers at once,
// the apply records what it was asked to write (nothing else is stubbed: the state machine, the DOM, the CSS and the keys are the shipped ones).
//   node scripts/dev/measure-composer.mjs [--out <dir>]        exit 0 = every verdict true
// Measures at 1000, 600 and 360 px, light and dark: the card fits the pane (no horizontal overflow), radius 16 and a 1 px border, the "+" and the return glyph side by side at the bottom right inside the card (2026-11-19-0950), the field grows with
// its text up to 8 lines and then scrolls inside, the card never overflows vertically; real Enter = preview (nothing applied), second Enter = apply, Shift+Enter = a new line, Esc = discard, Up recalls, Cmd+K focuses,
// the "+" menu opens inside the pane; the contrast of the muted glyph and the hint in both themes; no "Apply" button text anywhere in the card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/composer')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: { contents: "export { mountChatPanel } from './src/chat-panel-dom.ts'; export { memoryStore, append, fromOutcome } from './src/dialog-core.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7cf0; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1000px;height:560px"><div id="host" style="height:560px"><div class="forge-rhythm-edit-score" style="height:240px;padding:12px">Score stand-in</div></div></div>
<script>${bundle}</script><script>
window.events = []; var entries = []; var store = cp.memoryStore(); var hist = []; var n = 0;
var h = cp.mountChatPanel(document.getElementById('host'), { store: store, box: {
  preview: function (t) { entries = cp.append(entries, cp.fromOutcome({ type: 'you', text: t }), Date.now()); entries = cp.append(entries, cp.fromOutcome({ type: 'suggestion', description: 'Would write: ' + t, recipe: '', via: 'grammar' }), Date.now()); h.render(entries, ''); window.events.push('preview ' + t); return Promise.resolve({ ok: true, proposal: { description: 'Would write: ' + t, via: 'grammar' } }); },
  apply: function (t) { var s = entries[entries.length - 1]; if (s && s.suggestion) s.suggestion.state = 'applied'; entries = cp.append(entries, cp.fromOutcome({ type: 'applied', change: 'x', description: t }), Date.now()); h.render(entries, ''); window.events.push('apply ' + t); return Promise.resolve({ ok: true, disk: t }); },
  cancel: function () { window.events.push('cancel'); },
  discard: function () { var s = entries[entries.length - 1]; if (s && s.suggestion) s.suggestion.state = 'cancelled'; h.render(entries, ''); window.events.push('discard'); },
  history: { get: function () { return hist; }, set: function (x) { hist = x.slice(); } },
  menu: { items: [{ id: 'new-bar', label: 'New bar' }, { id: 'new-phrase', label: 'New phrase' }, { id: 'new-arr', label: 'New arrangement' }, { id: 'new-comp', label: 'New composition' }], run: function (id) { window.events.push('menu ' + id); }, pickNote: function () { return Promise.resolve('Cadences'); } },
} }, 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.');
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.lum = function (c) { var m = c.match(/[\\d.]+/g).map(Number); var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
window.contrast = function (fg, bg) { var a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
</script>`;
const p = await openPage({ dir: '/', width: 1100, height: 640, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const setWidth = async (w) => { await ev(`document.getElementById('frame').style.width = '${w}px'; document.getElementById('host').style.width = '${w}px'`); await sleep(150); };
const clickSel = async (sel) => { const b = await ev(`box(${JSON.stringify(sel)})`); await p.click(b.x, b.y); await sleep(150); return b; };
const key = async (k, code, vk, { shift = false, meta = false, text } = {}) => {
  const modifiers = (shift ? 8 : 0) | (meta ? 4 : 0);
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text !== undefined ? { text } : {}) });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(150);
};
const typeText = async (t) => { await p.send('Input.insertText', { text: t }); await sleep(80); };
const lastChosen = `[].slice.call(document.querySelectorAll('.forge-chat-chosen')).pop()`;
const field = `document.querySelector('.forge-prompt-box-text')`;
const clearField = async () => { await ev(`${field}.focus(); ${field}.select()`); await key('Backspace', 'Backspace', 8); };

// ---- the card at every width ------------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const w of [1000, 600, 360]) for (const theme of ['light', 'dark']) {
  await ev(`theme('${theme}')`); await setWidth(w);
  const tag = `${w}_${theme}`;
  const m = await ev(`(function () { var c = document.querySelector('.forge-prompt-box'); var cs = getComputedStyle(c); var f = box('#host'); var cb = box('.forge-prompt-box'), pl = box('.forge-composer-plus'), sd = box('.forge-composer-send'), tx = box('.forge-prompt-box-text');
    return { cardLeft: cb.left, cardRight: cb.right, hostLeft: f.left, hostRight: f.right, cardH: cb.h, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, plusRight: pl.right, plusBottom: pl.bottom, sendLeft: sd.left, sendRight: sd.right, sendBottom: sd.bottom, cardBottom: cb.bottom, textTop: tx.top, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, hostScrollH: document.getElementById('host').scrollHeight, hostH: f.h }; })()`);
  numbers[`card@${tag}`] = { w: Math.round(m.cardRight - m.cardLeft), h: Math.round(m.cardH) };
  verdict[`cardFitsPane_${tag}`] = m.cardLeft >= m.hostLeft - 0.5 && m.cardRight <= m.hostRight + 0.5 && m.scrollW <= m.innerW;
  verdict[`radius16Border1_${tag}`] = m.radius === '16px' && m.border === '1px';
  verdict[`plusAndSendSideBySideBottomRight_${tag}`] = m.cardRight - m.sendRight < 24 && m.sendLeft - m.plusRight >= 0 && m.sendLeft - m.plusRight < 12 && m.cardBottom - m.plusBottom < 24 && m.cardBottom - m.sendBottom < 24 && m.textTop < m.plusBottom;   // 2026-11-19-0950: the "+" moved to the right, immediately left of Send (the full set of checks: measure-composer-plus-right.mjs)
  verdict[`noTextCutOff_${tag}`] = await ev(`${field}.scrollHeight <= ${field}.clientHeight + 1`);
  verdict[`noVerticalOverflow_${tag}`] = m.hostScrollH <= m.hostH + 1;
  await p.shot(path.join(OUT, `composer-${w}-${theme}.png`), { x: 0, y: 330, width: w, height: 230 });
}

// ---- contrast of the muted glyph and the hint, both themes ---------------------------------------------------------------------------------------------------------------------------------------------
for (const theme of ['light', 'dark']) {
  await ev(`theme('${theme}')`); await setWidth(1000); await clearField(); await typeText('x'); await key('Enter', 'Enter', 13, { text: '\r' }); await sleep(200);
  const c = await ev(`(function () { var bg = getComputedStyle(document.querySelector('.forge-prompt-box')).backgroundColor; var glyph = getComputedStyle(document.querySelector('.forge-composer-send')).color; var hint = [].slice.call(document.querySelectorAll('.forge-chat-chosen')).pop(); var hc = hint ? getComputedStyle(hint).color : null; var log = getComputedStyle(document.body).backgroundColor;
    var base = bg === 'rgba(0, 0, 0, 0)' ? log : bg; return { bg: base, glyph: glyph, hint: hc, glyphRatio: contrast(glyph, base), hintRatio: hc ? contrast(hc, base) : null }; })()`);
  numbers[`contrast_${theme}`] = { glyph: Math.round(c.glyphRatio * 10) / 10, hint: c.hintRatio === null ? null : Math.round(c.hintRatio * 10) / 10 };
  verdict[`hintContrastAtLeast4.5_${theme}`] = c.hintRatio !== null && c.hintRatio >= 4.5;
  verdict[`glyphContrastAtLeast3_${theme}`] = c.glyphRatio >= 3;
  await key('Escape', 'Escape', 27); await clearField();
}
await ev(`theme('light')`); await setWidth(1000);

// ---- the field grows up to 8 lines, then scrolls inside; the card never leaves the pane ---------------------------------------------------------------------------------------------------------------
await ev('window.events.length = 0'); await clearField(); const h1 = await ev(`box('.forge-prompt-box-text').h`);
for (let i = 0; i < 3; i++) { await typeText('line ' + i); await key('Enter', 'Enter', 13, { shift: true, text: '\r' }); }
const h4 = await ev(`box('.forge-prompt-box-text').h`);
for (let i = 0; i < 12; i++) { await typeText('more ' + i); await key('Enter', 'Enter', 13, { shift: true, text: '\r' }); }
const hMax = await ev(`box('.forge-prompt-box-text').h`); const sc = await ev(`({ sh: ${field}.scrollHeight, ch: ${field}.clientHeight, cardBottom: box('.forge-prompt-box').bottom, hostBottom: box('#host').bottom })`);
numbers.fieldHeights = { empty: Math.round(h1), fourLines: Math.round(h4), many: Math.round(hMax) };
verdict.fieldGrowsWithText = h4 > h1 + 10; verdict.fieldStopsGrowing = hMax < h4 * 4 && sc.sh > sc.ch; verdict.cardStaysInPane = sc.cardBottom <= sc.hostBottom + 0.5;
verdict.shiftEnterIsANewLine = (await ev('window.events')).filter((e) => e.startsWith('preview')).length === 0 && (await ev(`${field}.value.split('\\n').length`)) > 10;
await p.shot(path.join(OUT, 'composer-1000-light-long.png'), { x: 0, y: 200, width: 1000, height: 360 });
await clearField();

// ---- the keys: Enter previews, Enter applies, Esc discards, typing replaces, Up recalls, Cmd+K focuses ------------------------------------------------------------------------------------------------------
await ev('window.events.length = 0');
await clearField(); await typeText('Extend [[bar_007]] to 6 bars.'); await key('Enter', 'Enter', 13, { text: '\r' }); await sleep(200);
verdict.firstEnterPreviewsAndWritesNothing = JSON.stringify(await ev('window.events')) === JSON.stringify(['preview Extend [[bar_007]] to 6 bars.']) && await ev(`${lastChosen}.textContent === 'Press Enter to apply, Esc to discard'`);
await key('Enter', 'Enter', 13, { text: '\r' }); await sleep(200);
verdict.secondEnterApplies = (await ev('window.events')).includes('apply Extend [[bar_007]] to 6 bars.') && await ev(`${lastChosen}.textContent === 'Applied.'`);
await clearField(); await typeText('Mix them.'); await key('Enter', 'Enter', 13, { text: '\r' }); await key('Escape', 'Escape', 27);
verdict.escDiscards = (await ev('window.events')).includes('discard') && !(await ev('window.events')).includes('apply Mix them.');
await clearField(); await key('ArrowUp', 'ArrowUp', 38);
verdict.upRecallsThePreviousSentence = await ev(`${field}.value`) === 'Extend [[bar_007]] to 6 bars.';
await ev(`(function () { var sc = document.querySelector('.forge-rhythm-edit-score'); sc.tabIndex = -1; sc.focus(); })()`); await key('k', 'KeyK', 75, { meta: true });
verdict.cmdKFocusesTheComposer = await ev(`document.activeElement === ${field}`);

// ---- the "+" menu: opens inside the pane at every width; the link goes in as [[name]] -----------------------------------------------------------------------------------------------------------------------
for (const w of [1000, 600, 360]) {
  await setWidth(w); await clickSel('.forge-composer-plus'); const mb = await ev(`box('.forge-composer-menu')`); const fb = await ev(`box('#host')`);
  verdict[`plusMenuInsidePane_${w}`] = !!mb && mb.left >= fb.left - 0.5 && mb.right <= fb.right + 0.5 && mb.top >= fb.top - 0.5 && mb.w > 100;
  numbers[`menu@${w}`] = mb ? { left: Math.round(mb.left), right: Math.round(mb.right), top: Math.round(mb.top), h: Math.round(mb.h) } : null;
  if (w === 360) await p.shot(path.join(OUT, 'composer-360-light-menu.png'), { x: 0, y: 250, width: 360, height: 310 });
  await key('Escape', 'Escape', 27); verdict[`plusMenuEscCloses_${w}`] = await ev(`document.querySelector('.forge-composer-menu').hidden === true`);
}
await setWidth(600); await clearField(); await clickSel('.forge-composer-plus'); const last = await ev(`box('.forge-composer-menuitem:last-child')`); await p.click(last.x, last.y); await sleep(250);
verdict.insertLinkPutsAWikilinkInTheField = await ev(`${field}.value`) === '[[Cadences]]';
verdict.menuItemsAreTheFourNewActionsPlusLink = JSON.stringify(await ev(`[].map.call(document.querySelectorAll('.forge-composer-menuitem'), function (b) { return b.textContent; })`)) === JSON.stringify(['New bar', 'New phrase', 'New arrangement', 'New composition', 'Insert a link to a note']);

// ---- no Apply anywhere ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
verdict.noApplyButtonInTheCard = await ev(`[].every.call(document.querySelectorAll('.forge-chat-panel button'), function (b) { return !/\\bApply\\b/.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')); }) && !document.querySelector('.forge-prompt-box-apply, .forge-chat-dock, .forge-chat-resize, .forge-chat-current')`);
verdict.dialogCollapsedWhenEmpty = await ev(`(function () { var l = document.querySelector('.forge-chat-log'); l.classList.add('is-empty'); var d = getComputedStyle(l).display; l.classList.remove('is-empty'); return d === 'none'; })()`);

p.close();
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
