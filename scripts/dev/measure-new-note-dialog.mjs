// 2026-11-19-0991 - the NAME dialog of New phrase / New arrangement / New composition in REAL headless Chrome (CDP) with REAL key and mouse events. The plugin's own modules (src/new-note-name-dom.ts + src/new-note-name-core.ts, bundled with
// esbuild) are mounted into a modal-shaped frame (a dimmed backdrop, a box like Obsidian's, the REAL styles.css) against Obsidian's CSS variables for a light and a dark theme (their default values). Obsidian itself is NOT driven (it cannot be
// from here: the driver checklist in the feedback covers the Modal frame, the focus after open and the real Esc scope). NOT RUN by the author of this file (the supervisor runs real-Chrome scripts):
//   node scripts/dev/measure-new-note-dialog.mjs [--out <dir>]        exit 0 = every verdict true; the verdict names say what is checked, per width and theme
// Widths: 360 (a phone-narrow window) and 800; each in light and dark. Every mount is a FRESH host element (the harness lesson of measure-composer-plus-right / measure-sentence-list: a reused host carries the last mount's focus and listeners).
// Per (width, theme) the verdicts are (the suffix _<width>_<theme> is added):
//   titleIsTheActionsName              the heading of each dialog is "New composition" / "New arrangement" / "New phrase"
//   fieldFocusedAndAllSelected         the text field is the focused element, holds the default name, and the WHOLE text is selected
//   typingReplacesTheDefault           real keys typed over the selection give exactly what was typed (the default is gone, not extended)
//   enterCreatesExactlyTheName         a real Enter on a valid typed name asks for exactly that name, once, and closes
//   enterDoesNothingWhileInvalid       with a name that has "/" in it a real Enter asks for nothing, Create is disabled, the dialog stays open
//   existingNameRefusedInWords         a name another note has (in another folder, other case) shows "A note called X already exists (folder/X)" and Create is disabled
//   escapeMakesNothing / cancelMakesNothing   a real Escape and a real click on Cancel close the dialog and ask for nothing (also after a valid name was typed)
//   messageIsMutedNotRed               the line under the field has the theme's muted text colour in the valid AND the refused state, and NO element of the dialog (text, background, border, outline) has a red hue
//   mutedLineReadable                  the line's contrast against the dialog's background is at least 4.5 : 1
//   nothingChangesOnHover              moving the real pointer over the field, Create and Cancel changes no computed style of any of them (no hover behaviour), and no element gets a title / aria-label (no tooltip)
//   noHorizontalOverflow               the dialog box is inside the window, the field and the buttons are inside the box, nothing scrolls sideways, also with a very long refused name (the line wraps)
//   buttonsReachable                   the element at the centre of Create and of Cancel IS that button (nothing covers it), and each is at least 28 px high
//   tabOrderFieldCreateCancel          real Tab from the field goes to Create, then Cancel; Shift+Tab goes back
// Screenshots (each width, each theme): new-note-dialog-<w>-<theme>-default.png (composition, valid), ...-slash.png (a name with "/"), ...-exists.png (a name another note has), ...-phrase.png and ...-arrangement.png (valid), in the output directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/new-note-dialog')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const bundle = (await build({
  stdin: { contents: "export { mountNewNoteNameDialog } from './src/new-note-name-dom.ts'; export { NEW_NOTE_KINDS, checkNewNoteName, defaultNewNoteName } from './src/new-note-name-core.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'nn', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const LONG = 'a_really_long_note_name_that_goes_on_' + 'and_on_'.repeat(14) + 'end';          // a note this long exists in another folder: typing it is refused, and the sentence is long
const VARS = `
.theme-light { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --interactive-accent:#7b6cd9; --interactive-normal:#f2f3f5; --text-on-accent:#ffffff; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; --radius-l:10px; --background-modifier-cover:rgba(220,220,220,0.4); }
.theme-dark { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --interactive-accent:#8b7cf0; --interactive-normal:#2a2a2a; --text-on-accent:#ffffff; --font-ui-small:13px; --font-ui-smaller:12px; --radius-s:4px; --radius-l:10px; --background-modifier-cover:rgba(0,0,0,0.6); }
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-secondary); color: var(--text-normal); font-size: 14px; }
*, *::before, *::after { box-sizing: border-box; }
/* a stand-in for Obsidian's Modal frame: backdrop, a box with its padding, a heading area. Obsidian's own button and input skins are approximated WITHOUT any :hover rule (the plugin adds none). */
.modal-bg { position:fixed; inset:0; background: var(--background-modifier-cover); }
.modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width: min(560px, calc(100vw - 32px)); background: var(--background-primary); border:1px solid var(--background-modifier-border); border-radius: var(--radius-l); padding: 16px; max-height: calc(100vh - 32px); overflow:auto; }
.modal input[type=text] { height: 30px; padding: 0 8px; background: var(--background-primary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); font: inherit; }
.modal input[type=text]:focus-visible { outline: none; border-color: var(--background-modifier-border-focus); box-shadow: 0 0 0 2px var(--background-modifier-border-focus); }
.modal button { min-height: 30px; padding: 0 14px; background: var(--interactive-normal); color: var(--text-normal); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); font: inherit; cursor: pointer; }
.modal button.mod-cta { background: var(--interactive-accent); color: var(--text-on-accent); border-color: transparent; }
.modal button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--background-modifier-border-focus); }
`;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body class="theme-light"><div id="stage"></div>
<script>${bundle}</script><script>
window.vault = ['compositions/Intro.md', 'phrases/phrase_001.md', 'kits/rock.md', 'notes/archive/old/very/deep/${LONG}.md'];
window.made = []; window.closedN = 0; window.dlg = null;   // (not window.closed: that is the browsers own read-only property, always false)
window.theme = function (t) { document.body.className = 'theme-' + t; };
// every mount is a FRESH host: the old modal is thrown away, a new .modal-bg + .modal is made, and the dialog is mounted into the new one
window.mountDialog = function (kind) {
  var stage = document.getElementById('stage'); stage.innerHTML = '';
  window.made = []; window.closedN = 0;
  var bg = document.createElement('div'); bg.className = 'modal-bg'; var box = document.createElement('div'); box.className = 'modal'; stage.appendChild(bg); stage.appendChild(box);
  var info = nn.NEW_NOTE_KINDS[kind];
  window.dlg = nn.mountNewNoteNameDialog(box, {
    title: info.title, noun: info.noun, initial: nn.defaultNewNoteName(kind, window.vault),
    check: function (raw) { return nn.checkNewNoteName(kind, raw, window.vault); },
    create: function (name) { window.made.push(name); return Promise.resolve({ ok: true }); },
    close: function () { window.closedN++; box.style.display = 'none'; }, trace: function () {},
  });
  return true;
};
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.cls = function () { var a = document.activeElement; return a ? (String(a.className || a.tagName).split(' ')[0]) : null; };
window.rgb = function (c) { var m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null; var p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
window.isRed = function (c) { var v = window.rgb(c); if (!v || v.a === 0) return false; var R = v.r / 255, G = v.g / 255, B = v.b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; var h = (mx === R ? ((G - B) / d + 6) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60; return h <= 20 || h >= 340; };
window.lum = function (v) { function f(x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); } return 0.2126 * f(v.r) + 0.7152 * f(v.g) + 0.0722 * f(v.b); };
window.contrast = function (a, b) { var A = window.lum(a), B = window.lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
window.anyRed = function () { var bad = []; document.querySelectorAll('.modal, .modal *').forEach(function (e) { var s = getComputedStyle(e); ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor', 'caretColor'].forEach(function (k) { if (window.isRed(s[k])) bad.push((e.className || e.tagName) + ':' + k + '=' + s[k]); }); }); return bad; };
window.styleOf = function (sel) { var s = getComputedStyle(document.querySelector(sel)); return ['color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'opacity', 'transform', 'boxShadow', 'outlineStyle', 'textDecorationLine', 'cursor'].map(function (k) { return s[k]; }).join('|'); };
window.msgInfo = function () { var m = document.querySelector('.forge-newnote-message'), s = getComputedStyle(m), mu = document.createElement('span'); mu.style.color = 'var(--text-muted)'; document.body.appendChild(mu); var muted = getComputedStyle(mu).color; mu.remove(); var bg = getComputedStyle(document.querySelector('.modal')).backgroundColor; return { text: m.textContent, color: s.color, muted: muted, bg: bg, contrast: window.contrast(window.rgb(s.color), window.rgb(bg)), wraps: m.scrollWidth <= m.clientWidth + 1 }; };
</script>`;
const p = await openPage({ dir: '/', width: 900, height: 700, pageHtml: page });
await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const rd = (x) => Math.round(x * 10) / 10;
const setSize = async (w) => { await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: 700, deviceScaleFactor: 1, mobile: false }); await sleep(250); };
const key = async (k, code, vk, { shift = false, text } = {}) => {
  const modifiers = shift ? 8 : 0;
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text !== undefined ? { text } : {}) });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }); await sleep(90);
};
const TAB = (shift = false) => key('Tab', 'Tab', 9, { shift });
const ENTER = () => key('Enter', 'Enter', 13, { text: '\r' });
const ESC = () => key('Escape', 'Escape', 27);
const typeText = async (s) => { for (const ch of s) await key(ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), { text: ch }); };
const focusField = async () => { await ev(`document.querySelector('.forge-newnote-name').focus()`); await sleep(60); };
const selectAll = async () => { await ev(`document.querySelector('.forge-newnote-name').select()`); await sleep(40); };
const fieldValue = () => ev(`document.querySelector('.forge-newnote-name').value`);
const which = () => ev('cls()');
const mount = async (kind) => { await ev(`mountDialog('${kind}')`); await sleep(120); };
const setValue = async (v) => { await ev(`(function () { var f = document.querySelector('.forge-newnote-name'); f.focus(); f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(80); };
let shotW = 360;
const shotBox = (file) => p.shot(file, { x: 0, y: 0, width: shotW, height: 700 });

for (const w of [360, 800]) for (const theme of ['light', 'dark']) {
  const tag = `${w}_${theme}`;
  await ev(`theme('${theme}')`); await setSize(w); shotW = w;

  // ---- the three titles, the default, the focus and the selection (each a FRESH host) ----------------------------------------------------------------------------------------------------------------------------
  const titles = {}; let focusOk = true; const sel = {};
  for (const kind of ['composition', 'arrangement', 'phrase']) {
    await mount(kind);
    titles[kind] = await ev(`document.querySelector('.forge-newnote-title').textContent`);
    const s = await ev(`(function () { var f = document.querySelector('.forge-newnote-name'); return { active: document.activeElement === f, value: f.value, a: f.selectionStart, b: f.selectionEnd }; })()`);
    sel[kind] = s; focusOk = focusOk && s.active && s.a === 0 && s.b === s.value.length && s.value.length > 0;
    if (kind !== 'composition') await shotBox(path.join(OUT, `new-note-dialog-${w}-${theme}-${kind}.png`));
  }
  numbers[`fields@${tag}`] = sel;
  verdict[`titleIsTheActionsName_${tag}`] = titles.composition === 'New composition' && titles.arrangement === 'New arrangement' && titles.phrase === 'New phrase';
  verdict[`fieldFocusedAndAllSelected_${tag}`] = focusOk && sel.composition.value === 'comp_001' && sel.arrangement.value === 'arr_001' && sel.phrase.value === 'phrase_002';

  // ---- typing replaces the default; Enter creates exactly the name ---------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await typeText('sunrise');
  verdict[`typingReplacesTheDefault_${tag}`] = (await fieldValue()) === 'sunrise';
  await ENTER();
  const made1 = await ev('made'); const closed1 = await ev('closedN');
  numbers[`enter1@${tag}`] = { made1, closed1 };
  verdict[`enterCreatesExactlyTheName_${tag}`] = JSON.stringify(made1) === JSON.stringify(['sunrise']) && closed1 === 1;
  await mount('composition'); await ENTER();
  verdict[`enterCreatesExactlyTheName_${tag}`] = verdict[`enterCreatesExactlyTheName_${tag}`] && JSON.stringify(await ev('made')) === JSON.stringify(['comp_001']);

  // ---- an invalid name: Enter does nothing, Create is disabled, the words say why --------------------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await setValue('a/b'); await sleep(80);
  const inv = await ev(`({ made: made.length, closed: closedN, disabled: document.querySelector('.forge-newnote-create').disabled, msg: msgInfo() })`);
  await ENTER();
  const inv2 = await ev(`({ made: made.length, closed: closedN })`);
  numbers[`inv@${tag}`] = { inv: { made: inv.made, closed: inv.closed, disabled: inv.disabled }, inv2 };
  numbers[`slash@${tag}`] = { message: inv.msg.text, contrast: rd(inv.msg.contrast) };
  verdict[`enterDoesNothingWhileInvalid_${tag}`] = inv.disabled === true && inv2.made === 0 && inv2.closed === 0 && /cannot contain \//.test(inv.msg.text);
  verdict[`messageIsMutedNotRed_${tag}`] = inv.msg.color === inv.msg.muted && (await ev('anyRed()')).length === 0;
  await shotBox(path.join(OUT, `new-note-dialog-${w}-${theme}-slash.png`));

  // ---- a name another note has (other folder, other case) -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await setValue('intro'); await sleep(80);
  const ex = await ev(`({ disabled: document.querySelector('.forge-newnote-create').disabled, msg: msgInfo() })`);
  await ENTER(); await ev(`document.querySelector('.forge-newnote-create').click()`); await sleep(60);
  numbers[`exists@${tag}`] = { message: ex.msg.text };
  verdict[`existingNameRefusedInWords_${tag}`] = ex.msg.text === 'A note called Intro already exists (compositions/Intro)' && ex.disabled === true && (await ev('made.length')) === 0;
  verdict[`messageIsMutedNotRed_${tag}`] = verdict[`messageIsMutedNotRed_${tag}`] && ex.msg.color === ex.msg.muted && (await ev('anyRed()')).length === 0;
  await shotBox(path.join(OUT, `new-note-dialog-${w}-${theme}-exists.png`));

  // ---- the valid state's line, its contrast, and the default shot ---------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition');
  const ok = await ev('msgInfo()');
  numbers[`valid@${tag}`] = { message: ok.text, contrast: rd(ok.contrast), color: ok.color, muted: ok.muted };
  verdict[`messageIsMutedNotRed_${tag}`] = verdict[`messageIsMutedNotRed_${tag}`] && ok.color === ok.muted && (await ev('anyRed()')).length === 0;
  verdict[`mutedLineReadable_${tag}`] = ok.contrast >= 4.5 && inv.msg.contrast >= 4.5 && ex.msg.contrast >= 4.5;
  await shotBox(path.join(OUT, `new-note-dialog-${w}-${theme}-default.png`));

  // ---- Esc and Cancel make nothing (also after a valid name was typed) -----------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await setValue('Valid name'); await ESC();
  const esc = await ev(`({ made: made.length, closed: closedN })`);
  verdict[`escapeMakesNothing_${tag}`] = esc.made === 0 && esc.closed === 1;
  await mount('composition'); await setValue('Valid name');
  const cb = await ev(`box('.forge-newnote-cancel')`); await p.click(cb.x, cb.y); await sleep(100);
  const can = await ev(`({ made: made.length, closed: closedN })`);
  verdict[`cancelMakesNothing_${tag}`] = can.made === 0 && can.closed === 1;

  // ---- no hover behaviour, no tooltip -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition');
  const sels = ['.forge-newnote-name', '.forge-newnote-create', '.forge-newnote-cancel', '.forge-newnote-message', '.forge-newnote-title'];
  const before = {}; for (const s of sels) before[s] = await ev(`styleOf(${JSON.stringify(s)})`);
  let same = true;
  for (const s of sels) { const b = await ev(`box(${JSON.stringify(s)})`); await p.hover(b.x, b.y); await sleep(700); const after = await ev(`styleOf(${JSON.stringify(s)})`); if (after !== before[s]) { same = false; numbers[`hoverChanged@${tag}`] = { selector: s, before: before[s], after }; } }
  const tips = await ev(`document.querySelectorAll('[title], [aria-label], [data-tooltip]').length`);
  verdict[`nothingChangesOnHover_${tag}`] = same && tips === 0;

  // ---- the geometry: inside the window, no sideways scroll, a very long refused name wraps ----------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await setValue(LONG); await sleep(100);
  const g = await ev(`(function () { var m = box('.modal'), f = box('.forge-newnote-name'), c = box('.forge-newnote-create'), x = box('.forge-newnote-cancel'), msg = document.querySelector('.forge-newnote-message'), de = document.documentElement, mb = document.querySelector('.modal');
    return { mL: m.left, mR: m.right, mT: m.top, mB: m.bottom, fL: f.left, fR: f.right, cL: c.left, cR: c.right, xL: x.left, xR: x.right, cH: c.h, xH: x.h, vw: innerWidth, vh: innerHeight, pageOver: de.scrollWidth - de.clientWidth, boxOver: mb.scrollWidth - mb.clientWidth, msgWraps: msg.scrollWidth <= msg.clientWidth + 1, msgText: msg.textContent,
      hitC: document.elementFromPoint(c.x, c.y) === document.querySelector('.forge-newnote-create'), hitX: document.elementFromPoint(x.x, x.y) === document.querySelector('.forge-newnote-cancel') }; })()`);
  numbers[`geometry@${tag}`] = { modal: [rd(g.mL), rd(g.mR)], window: g.vw, field: [rd(g.fL), rd(g.fR)], create: [rd(g.cL), rd(g.cR), rd(g.cH)], cancel: [rd(g.xL), rd(g.xR), rd(g.xH)], longMessage: g.msgText };
  verdict[`noHorizontalOverflow_${tag}`] = g.mL >= 0 && g.mR <= g.vw && g.mT >= 0 && g.mB <= g.vh && g.fL >= g.mL && g.fR <= g.mR && g.cL >= g.mL && g.xR <= g.mR && g.pageOver <= 0 && g.boxOver <= 0 && g.msgWraps === true && /already exists/.test(g.msgText);
  // Create is disabled for a refused name; the reachability of the buttons is judged on a VALID name
  await mount('composition'); await setValue('Fine');
  const r = await ev(`(function () { var c = box('.forge-newnote-create'), x = box('.forge-newnote-cancel'); return { hitC: document.elementFromPoint(c.x, c.y) === document.querySelector('.forge-newnote-create'), hitX: document.elementFromPoint(x.x, x.y) === document.querySelector('.forge-newnote-cancel'), cH: c.h, xH: x.h, inView: c.left >= 0 && x.right <= innerWidth && c.bottom <= innerHeight }; })()`);
  verdict[`buttonsReachable_${tag}`] = r.hitC && r.hitX && r.cH >= 28 && r.xH >= 28 && r.inView;

  // ---- the keyboard: Tab order ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  await mount('composition'); await focusField();
  const seq = [await which()]; await TAB(); seq.push(await which()); await TAB(); seq.push(await which());
  await TAB(true); const back = await which();
  numbers[`tab@${tag}`] = { forward: seq, backOnce: back };
  verdict[`tabOrderFieldCreateCancel_${tag}`] = JSON.stringify(seq) === JSON.stringify(['forge-newnote-name', 'forge-newnote-create', 'forge-newnote-cancel']) && back === 'forge-newnote-create';
}

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
