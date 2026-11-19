// 2026-11-19-0960 - what a NEW (empty) sentence-driven note looks like, in REAL headless Chrome (CDP) with real key events: the Score slot with nothing drawn and nothing said, and the composer with an EMPTY prompt line (no placeholder,
// no dim hint), focused. The plugin's own modules (src/chat-panel-dom.ts + src/prompt-box-dom.ts + src/live-score-dom.ts, bundled with esbuild) are mounted into a tab-shaped host with the REAL styles.css, the Score area is the
// real attachScoreArea fed an empty note's producer answer (the refusal with the EMPTY message, exactly what produce*Note answers for an empty note), against Obsidian's CSS variables for a light and a dark theme. Obsidian itself is
// NOT driven here (the driver checklist in the feedback). NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-empty-note.mjs [--out <dir>]        exit 0 = every verdict true
// Widths 360, 800 (stacked) and 1100 (two columns); light and dark; three kinds (phrase, arrangement, composition): at this layer the three tabs are the same view (the kinds differ only in what the engine draws once a sentence
// is applied), so the three screenshots per theme and width are identical by construction and named per kind for the driver's checklist.
// Verdicts, per width and theme:
//   promptLineIsEmpty_*               the textarea is empty, has no placeholder attribute value, and its ::placeholder shows nothing (the computed placeholder text is not rendered: the text area's innerText and value are '')
//   composerIsFocusedAndNamed_*       after the tab asks for the focus the active element is the text area; its accessible name (the hidden label) is "Describe the next step in a sentence"; no title, no aria-label
//   nothingVisibleButTheCard_*        outside the Score panel (its status line is its own verdict below) no text on the page is visible: the dialog is collapsed, the card shows no hint, the status text is empty
//   scoreSlotDrawsNothing_*           no svg in the Score area, its status line is empty
//   cardAtTheBottomInsideTheTab_*     the card is inside the tab and is the last thing at the bottom
//   noHorizontalOverflow_*            the page, the tab and the card do not scroll sideways
//   caretIsInTheField_*               a real typed character appears in the field (real Input.insertText) and the Send glyph brightens (can-send); clearing it leaves the line empty again
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/empty-note')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: { contents: "export { mountChatPanel } from './src/chat-panel-dom.ts'; export { memoryStore } from './src/dialog-core.ts'; export { attachScoreArea } from './src/live-score-dom.ts'; export { emptyPhraseNote, emptyArrangementNote, emptyCompositionNote } from './src/empty-note-core.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7cf0; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="frame" style="width:1100px;height:560px"><div id="host" style="height:560px;width:1100px"></div></div>
<script>${bundle}</script><script>
window.mountKind = function (kind) {
  if (window.h) { window.h.dispose(); window.area.dispose(); }
  var host = document.getElementById('host'); host.className = ''; host.removeAttribute('style'); host.style.height = '560px'; host.style.width = (window.hostW || 1100) + 'px'; host.innerHTML = '';
  var note = kind === 'arrangement' ? cp.emptyArrangementNote('arr_001') : kind === 'composition' ? cp.emptyCompositionNote('comp_001') : cp.emptyPhraseNote('phrase_001');
  window.drew = 0;
  window.area = cp.attachScoreArea(host, 'score', {
    renderInto: function () { window.drew++; return true; }, stopPlayers: function () {},
    produce: function () { return Promise.resolve({ kind: 'refusal', message: '' }); },          // what producePhraseNote / produceArrangement / produceComposition answer for an EMPTY note
    title: 'x', first: true, setTimer: function (fn, ms) { return setTimeout(fn, ms); }, clearTimer: function (h) { clearTimeout(h); } });
  window.area.showNow(note);
  window.h = cp.mountChatPanel(host, { store: cp.memoryStore(), box: {
    preview: function () { return Promise.resolve({ ok: false, message: 'x' }); }, apply: function () { return Promise.resolve({ ok: false }); },
    menu: { items: [{ id: 'a', label: 'New phrase' }], run: function () {} } } }, '');
  window.h.box.focus();                                           // the tab's controller focuses the composer of an empty note when it mounts it
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.theme = function (t) { document.body.className = 'theme-' + t; };
window.visibleText = function () {
  var out = [], w = document.createTreeWalker(document.getElementById('host'), NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { var n = w.currentNode, t = (n.textContent || '').trim(); if (!t) continue; var el = n.parentElement; if (!el || el.closest('.forge-sr-only, .forge-composer-sr, [hidden], textarea, .forge-rhythm-edit-score')) continue; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; out.push(t); }
  return out;
};
</script>`;
const p = await openPage({ dir: '/', width: 1200, height: 640, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const rd = (x) => Math.round(x * 10) / 10;
const key = async (k, code, vk) => { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(100); };

for (const kind of ['phrase', 'arrangement', 'composition']) for (const w of [360, 800, 1100]) for (const theme of ['light', 'dark']) {
  const tag = `${kind}_${w}_${theme}`;
  await ev(`theme('${theme}'); window.hostW = ${w}; document.getElementById('frame').style.width = '${w}px'; mountKind('${kind}')`); await sleep(500);
  const m = await ev(`(function () { var f = document.querySelector('.forge-prompt-box-text'), host = box('#host'), card = box('.forge-prompt-box'), de = document.documentElement, st = document.querySelector('.forge-rhythm-edit-score-status');
    var lab = document.getElementById(f.getAttribute('aria-labelledby'));
    return { value: f.value, placeholderProp: f.placeholder, placeholderAttr: f.getAttribute('placeholder'), focused: document.activeElement === f, name: lab ? lab.textContent : null, title: f.getAttribute('title'), ariaLabel: f.getAttribute('aria-label'),
      visible: visibleText(), svgs: document.querySelectorAll('.forge-rhythm-score-host svg').length, status: st ? st.textContent : null, drew: window.drew,
      cardL: card.left, cardR: card.right, cardB: card.bottom, hostL: host.left, hostR: host.right, hostB: host.bottom, pageOver: de.scrollWidth - de.clientWidth, hostOver: document.getElementById('host').scrollWidth - document.getElementById('host').clientWidth, cardOver: document.querySelector('.forge-prompt-box').scrollWidth - document.querySelector('.forge-prompt-box').clientWidth,
      wide: document.getElementById('host').classList.contains('forge-chat-wide') }; })()`);
  numbers[`empty@${tag}`] = { layout: m.wide ? 'two columns' : 'stacked', visibleText: m.visible, scorePanelText: await ev(`(document.querySelector('.forge-rhythm-edit-score') || { innerText: null }).innerText`), card: [rd(m.cardL), rd(m.cardR)] };           // the Score panel's own text is reported, and its status line is a verdict below
  verdict[`promptLineIsEmpty_${tag}`] = m.value === '' && m.placeholderProp === '' && (m.placeholderAttr === null || m.placeholderAttr === '');
  verdict[`composerIsFocusedAndNamed_${tag}`] = m.focused === true && m.name === 'Describe the next step in a sentence' && m.title === null && m.ariaLabel === null;
  verdict[`nothingVisibleButTheCard_${tag}`] = m.visible.length === 0;
  verdict[`scoreSlotDrawsNothing_${tag}`] = m.svgs === 0 && m.drew === 0 && (m.status === '' || m.status === null);
  verdict[`cardAtTheBottomInsideTheTab_${tag}`] = m.cardL >= m.hostL - 0.5 && m.cardR <= m.hostR + 0.5 && m.cardB <= m.hostB + 0.5 && m.hostB - m.cardB < 24;
  verdict[`noHorizontalOverflow_${tag}`] = m.pageOver <= 0 && m.hostOver <= 0 && m.cardOver <= 0;
  await p.shot(path.join(OUT, `empty-${kind}-${w}-${theme}.png`), { x: 0, y: 0, width: Math.min(w, 1100), height: 560 });
  // a real typed character: it lands in the field, Send brightens, and clearing it leaves the line empty again
  await p.send('Input.insertText', { text: 'x' }); await sleep(120);
  const typed = await ev(`({ value: document.querySelector('.forge-prompt-box-text').value, canSend: document.querySelector('.forge-prompt-box').classList.contains('can-send') })`);
  await key('Backspace', 'Backspace', 8);
  const cleared = await ev(`({ value: document.querySelector('.forge-prompt-box-text').value, canSend: document.querySelector('.forge-prompt-box').classList.contains('can-send') })`);
  verdict[`caretIsInTheField_${tag}`] = typed.value === 'x' && typed.canSend === true && cleared.value === '' && cleared.canSend === false;
}

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
