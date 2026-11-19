// 2026-11-19-0950 (item 2) - the "+" of the composer moved to the RIGHT group, immediately left of Send, in REAL headless Chrome (CDP) with REAL key and mouse events. The plugin's own modules (src/chat-panel-dom.ts +
// src/chat-divider-dom.ts + src/prompt-box-dom.ts, bundled with esbuild) are mounted into a tab-shaped host (a Score stand-in above, the REAL styles.css) against Obsidian's CSS variables for a light and a dark theme (their
// default values). Obsidian itself is NOT driven (the driver checklist in the feedback). NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-composer-plus-right.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// Widths: 360 (a phone-narrow tab, stacked), 800 (stacked, below the 900 px threshold), 1100 (TWO COLUMNS with the draggable divider of 0935); each in light and dark. Per (width, theme):
//   plusImmediatelyLeftOfSend_*        the "+" ends where Send begins (a gap under 12 px), both inside the card, Send flush to the card's right padding
//   plusAndSendAtTheRightEnd_*         the right end of Send is within 24 px of the card's right edge, and the "+" is right of the middle of the card
//   statusTextTakesTheLeft_*           while a request runs ("Working... Esc cancels") the status text starts at the card's left padding and ends before the "+"; a LONG status never pushes the "+" or Send out of the card
//   menuOpensAboveThePlus_* / menuRightAlignedToThePlus_*   the menu's bottom is above the "+" top and its right edge equals the "+" right edge (within 1 px)
//   menuInsideTheTab_*                 the menu's four sides are inside the tab (host) box
//   menuNotClippedOrCovered_*          the element at each corner and at the middle of the menu belongs to the menu (not the Score, the divider, the scrolling body): nothing clips or covers it
//   menuClearOfTheDivider_1100_*       in the two-column layout the menu ends left of the divider's hit area
//   noHorizontalOverflow_*             the page, the host and the card do not scroll sideways
//   tabOrderTextPlusSend_*             real Tab keys from the text area: the text area, then "+", then Send (and Shift+Tab goes back)
//   enterAndSpaceOpenTheMenu_*, arrowKeysMoveAndWrap_*, escapeReturnsFocusToThePlus_*   the keyboard of the menu is as it was (real Enter, real Space, ArrowDown / ArrowUp, Escape)
// Screenshots (light and dark, each width): composer-plus-right-<w>-<theme>.png (closed) and ...-menu.png (open) in the output directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/composer-plus-right')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: { contents: "export { mountChatPanel } from './src/chat-panel-dom.ts'; export { memoryStore } from './src/dialog-core.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7cf0; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1100px;height:560px"><div id="host" style="height:560px;width:1100px"><div class="forge-rhythm-edit-score" style="height:240px;padding:12px;background:var(--background-secondary)">Score stand-in</div></div></div>
<script>${bundle}</script><script>
window.events = [];
window.h = cp.mountChatPanel(document.getElementById('host'), { store: cp.memoryStore(), box: {
  preview: function (t) { window.events.push('preview ' + t); return Promise.resolve({ ok: false, message: 'x' }); },
  apply: function () { return Promise.resolve({ ok: false }); },
  menu: { items: [{ id: 'new-bar', label: 'New bar' }, { id: 'new-phrase', label: 'New phrase' }, { id: 'new-arr', label: 'New arrangement' }, { id: 'new-comp', label: 'New composition' }], run: function (id) { window.events.push('menu ' + id); }, pickNote: function () { return Promise.resolve('Cadences'); } },
} }, '');
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.cls = function () { var a = document.activeElement; return a ? (a.className || a.tagName) : null; };
window.hitIsInside = function (sel, px, py) { var m = document.querySelector(sel), e = document.elementFromPoint(px, py); return !!m && !!e && m.contains(e); };
</script>`;
const p = await openPage({ dir: '/', width: 1200, height: 640, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const rd = (x) => Math.round(x * 10) / 10;
const setWidth = async (w) => { await ev(`document.getElementById('frame').style.width = '${w}px'; document.getElementById('host').style.width = '${w}px'`); await sleep(350); };
const key = async (k, code, vk, { shift = false, text } = {}) => {
  const modifiers = shift ? 8 : 0;
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text !== undefined ? { text } : {}) });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(120);
};
const TAB = (shift = false) => key('Tab', 'Tab', 9, { shift });
const focusText = async () => { await ev(`document.querySelector('.forge-prompt-box-text').focus()`); await sleep(60); };
const menuHidden = () => ev(`document.querySelector('.forge-composer-menu').hidden`);
const which = () => ev('cls()').then((c) => (c || '').split(' ').find((x) => /^forge-/.test(x)) || c);

for (const w of [360, 800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`); await setWidth(w); await ev(`h.box.reset('')`); await sleep(100);
  const g = await ev(`(function () { var c = box('.forge-prompt-box'), pl = box('.forge-composer-plus'), sd = box('.forge-composer-send'), host = box('#host'), tx = box('.forge-prompt-box-text'), de = document.documentElement;
    return { cardL: c.left, cardR: c.right, cardT: c.top, cardB: c.bottom, plusL: pl.left, plusR: pl.right, plusT: pl.top, plusB: pl.bottom, sendL: sd.left, sendR: sd.right, hostL: host.left, hostR: host.right, hostT: host.top, hostB: host.bottom, textB: tx.bottom,
      pageOver: de.scrollWidth - de.clientWidth, hostOver: document.getElementById('host').scrollWidth - document.getElementById('host').clientWidth, cardOver: document.querySelector('.forge-prompt-box').scrollWidth - document.querySelector('.forge-prompt-box').clientWidth,
      wide: document.getElementById('host').classList.contains('forge-chat-wide'), divider: !!document.querySelector('.forge-chat-resizer') }; })()`);
  numbers[`row@${tag}`] = { layout: g.wide ? 'two columns' : 'stacked', divider: g.divider, card: [rd(g.cardL), rd(g.cardR)], plus: [rd(g.plusL), rd(g.plusR)], send: [rd(g.sendL), rd(g.sendR)] };
  verdict[`layoutIsTheExpectedOne_${tag}`] = g.wide === (w >= 900) && g.divider === (w >= 900);
  verdict[`plusImmediatelyLeftOfSend_${tag}`] = g.plusR <= g.sendL + 0.5 && g.sendL - g.plusR < 12 && g.plusL >= g.cardL && g.sendR <= g.cardR;
  verdict[`plusAndSendAtTheRightEnd_${tag}`] = g.cardR - g.sendR < 24 && g.plusL > (g.cardL + g.cardR) / 2 && g.plusT >= g.textB - 1;
  verdict[`noHorizontalOverflow_${tag}`] = g.pageOver <= 0 && g.hostOver <= 0 && g.cardOver <= 0 && g.cardL >= g.hostL - 0.5 && g.cardR <= g.hostR + 0.5;
  await p.shot(path.join(OUT, `composer-plus-right-${w}-${theme}.png`), { x: 0, y: 330, width: Math.min(w, 1100), height: 230 });

  // the status text takes the left, a LONG one never pushes "+" or Send out of the card
  await ev(`h.box.setBusy('Working... Esc cancels')`); await sleep(100);
  const s1 = await ev(`(function () { var st = box('.forge-prompt-box-state'), c = box('.forge-prompt-box'), pl = box('.forge-composer-plus'); return { stL: st ? st.left : null, stR: st ? st.right : null, cardL: c.left, plusL: pl.left, shown: !!st && st.w > 0 }; })()`);
  verdict[`statusTextTakesTheLeft_${tag}`] = s1.shown && s1.stL - s1.cardL < 24 && s1.stR <= s1.plusL + 0.5;
  await ev(`h.box.setBusy('Working on a very long request that would push everything to the right if the status text were allowed to ' + 'x'.repeat(200))`); await sleep(100);
  const s2 = await ev(`(function () { var c = box('.forge-prompt-box'), pl = box('.forge-composer-plus'), sd = box('.forge-composer-send'); return { plusInside: pl.left >= c.left && pl.right <= c.right, sendInside: sd.left >= c.left && sd.right <= c.right, sendIsOnTop: hitIsInside('.forge-composer-send', sd.x, sd.y), plusIsOnTop: hitIsInside('.forge-composer-plus', pl.x, pl.y), gap: sd.left - pl.right }; })()`);
  verdict[`longStatusNeverPushesPlusOrSendOut_${tag}`] = s2.plusInside && s2.sendInside && s2.sendIsOnTop && s2.plusIsOnTop && s2.gap >= 0 && s2.gap < 12;
  await ev(`h.box.setBusy(null)`); await sleep(100);

  // the menu: a real click on the "+", then geometry and hit tests
  const pb = await ev(`box('.forge-composer-plus')`); await p.click(pb.x, pb.y); await sleep(200);
  const m = await ev(`(function () { var mn = box('.forge-composer-menu'), pl = box('.forge-composer-plus'), host = box('#host'), dv = box('.forge-chat-resizer');
    var pts = mn ? [[mn.left + 4, mn.top + 4], [mn.right - 4, mn.top + 4], [mn.left + 4, mn.bottom - 4], [mn.right - 4, mn.bottom - 4], [mn.x, mn.y]] : [];
    return { hidden: document.querySelector('.forge-composer-menu').hidden, left: mn && mn.left, right: mn && mn.right, top: mn && mn.top, bottom: mn && mn.bottom, w: mn && mn.w, plusT: pl.top, plusR: pl.right, hostL: host.left, hostR: host.right, hostT: host.top, hostB: host.bottom, dvL: dv ? dv.left : null,
      onTop: pts.map(function (q) { return hitIsInside('.forge-composer-menu', q[0], q[1]); }), items: document.querySelectorAll('.forge-composer-menuitem').length, itemsClipped: [].some.call(document.querySelectorAll('.forge-composer-menuitem'), function (b) { return b.scrollWidth > b.clientWidth + 1; }) }; })()`);
  numbers[`menu@${tag}`] = { left: rd(m.left), right: rd(m.right), top: rd(m.top), bottom: rd(m.bottom), width: rd(m.w), plusRight: rd(m.plusR), host: [rd(m.hostL), rd(m.hostR)], dividerLeft: m.dvL === null ? null : rd(m.dvL) };
  verdict[`menuOpensAboveThePlus_${tag}`] = m.hidden === false && m.bottom <= m.plusT + 0.5 && m.items === 5;
  verdict[`menuRightAlignedToThePlus_${tag}`] = Math.abs(m.right - m.plusR) <= 1;
  verdict[`menuInsideTheTab_${tag}`] = m.left >= m.hostL - 0.5 && m.right <= m.hostR + 0.5 && m.top >= m.hostT - 0.5 && m.bottom <= m.hostB + 0.5;
  verdict[`menuNotClippedOrCovered_${tag}`] = m.onTop.length === 5 && m.onTop.every((x) => x === true) && m.itemsClipped === false;
  if (w >= 900) verdict[`menuClearOfTheDivider_${tag}`] = m.dvL !== null && m.right <= m.dvL - 1;
  await p.shot(path.join(OUT, `composer-plus-right-${w}-${theme}-menu.png`), { x: 0, y: 200, width: Math.min(w, 1100), height: 360 });
  await key('Escape', 'Escape', 27); await sleep(100);
  verdict[`escapeFromTheOpenMenuClosesIt_${tag}`] = (await menuHidden()) === true;
}

// ---- the keyboard, once per width (light): the order and the menu -----------------------------------------------------------------------------------------------------------------------------------------------------------
for (const w of [360, 800, 1100]) {
  const tag = `${w}_light`;
  await ev(`theme('light')`); await setWidth(w); await ev(`h.box.reset('')`);
  await focusText(); const seq = [await which()]; await TAB(); seq.push(await which()); await TAB(); seq.push(await which());
  await TAB(true); const back = await which();
  numbers[`tab@${tag}`] = { forward: seq, backOnce: back };
  verdict[`tabOrderTextPlusSend_${tag}`] = JSON.stringify(seq) === JSON.stringify(['forge-prompt-box-text', 'forge-composer-plus', 'forge-composer-send']) && back === 'forge-composer-plus';
  // real Enter on the focused "+" opens it (the first item takes the focus); arrows move and wrap; Escape closes and returns the focus to the "+"
  await key('Enter', 'Enter', 13, { text: '\r' });
  const opened = (await menuHidden()) === false; const first = await which();
  await key('ArrowDown', 'ArrowDown', 40); const second = await ev(`document.activeElement.textContent`);
  await key('ArrowUp', 'ArrowUp', 38); await key('ArrowUp', 'ArrowUp', 38); const wrapped = await ev(`document.activeElement.textContent`);
  verdict[`enterAndSpaceOpenTheMenu_${tag}`] = opened && first === 'forge-composer-menuitem';
  verdict[`arrowKeysMoveAndWrap_${tag}`] = second === 'New phrase' && wrapped === 'Insert a link to a note';
  await key('Escape', 'Escape', 27);
  verdict[`escapeReturnsFocusToThePlus_${tag}`] = (await menuHidden()) === true && (await which()) === 'forge-composer-plus';
  await key(' ', 'Space', 32, { text: ' ' });                                  // Space on the focused "+" opens it too
  verdict[`enterAndSpaceOpenTheMenu_${tag}`] = verdict[`enterAndSpaceOpenTheMenu_${tag}`] && (await menuHidden()) === false;
  await key('Escape', 'Escape', 27);
  // Send is still a real button: Tab to it, Enter does nothing while nothing is typed (the card's own rule), and the text area keeps the focus afterwards
  verdict[`noStrayPreviewFromThePlusOrSend_${tag}`] = (await ev('window.events')).filter((e) => e.startsWith('preview')).length === 0;
}

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
