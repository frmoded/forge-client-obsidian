// 2026-11-18 (R1) - the music tab's Claude-chat look in REAL headless Chrome (CDP): two columns from 900 px of the TAB (dialog + composer card on the left, the Score and its toolbar on the right), stacked below; the gray bubble;
// no red; the "minutes ago" under every entry (and ONE real 30 s timer recounting them); each column scrolling on its own; no hover effect; the multi-staff Score engraved by the real Verovio for the column's width.
// The plugin's own DOM modules (src/chat-panel-dom.ts + src/prompt-box-dom.ts + src/score-transport-dom.ts, bundled with esbuild) are mounted into a tab-shaped host with the REAL styles.css, against Obsidian's CSS variables
// for a light and a dark theme (their defaults; the theme is switched with Emulation.setEmulatedMedia prefers-color-scheme, so nothing in the page is class-driven). The ports are stand-ins; the Score body is the real classes
// around a real Verovio engraving. Obsidian itself is NOT driven here (see the driver checklist in the feedback).
//   node scripts/dev/measure-music-tab-look.mjs [--out <dir>] [--fast]        exit 0 = every verdict true   (--fast skips the real 31 s timer wait)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const FAST = process.argv.includes('--fast');
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/music-tab-claude-look')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

// ---- the real Verovio engraving of a 3-staff, 16-bar Score, for a given host width (the same options as src/verovio.ts applyOptions with fit + noHeader) ----------------------------------------------------------------
const wc = (await build({ entryPoints: [path.join(ROOT, 'src/host-width-core.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' })).outputFiles[0].text;
const W = await import('data:text/javascript;base64,' + Buffer.from(wc).toString('base64'));
const vmod = (await import('verovio')).default;
await new Promise((ok) => { if (vmod.module?.calledRun) ok(); else vmod.module.onRuntimeInitialized = () => ok(); });
const toolkit = new vmod.toolkit();
const stepsOf = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const musicXml = (bars) => {
  const part = (id, name, octave, clef) => `<part id="${id}">${Array.from({ length: bars }, (_, b) => `<measure number="${b + 1}">${b === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${clef}</sign><line>${clef === 'G' ? 2 : 4}</line></clef></attributes>` : ''}${[0, 1, 2, 3].map((n) => `<note><pitch><step>${stepsOf[(b * 2 + n * 3 + octave) % 7]}</step><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('')}</part>`;
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part><score-part id="P2"><part-name>Chords</part-name></score-part><score-part id="P3"><part-name>Bass</part-name></score-part></part-list>${part('P1', 'Melody', 5, 'G')}${part('P2', 'Chords', 4, 'G')}${part('P3', 'Bass', 2, 'F')}</score-partwise>`;
};
const engrave = (hostWidth) => {
  toolkit.setOptions({ adjustPageHeight: true, mnumInterval: 1, breaks: 'auto', pageWidth: W.pageWidthFor(Math.max(W.MIN_HOST_WIDTH_PX, hostWidth - W.COMPACT_SCORE_INSET_PX), W.FIT_PAGE_FACTOR), pageMarginTop: 50, pageMarginBottom: 50, pageMarginLeft: 50, pageMarginRight: 50, scale: W.ENGRAVING_SCALE, header: 'none' });
  toolkit.loadData(musicXml(16));
  const n = toolkit.getPageCount(); const pages = []; for (let i = 1; i <= n; i++) pages.push(toolkit.renderToSVG(i));
  return n === 1 ? pages[0] : `<div class="forge-verovio-pages">${pages.join('')}</div>`;
};

const bundle = (await build({
  stdin: { contents: "export { mountChatPanel } from './src/chat-panel-dom.ts'; export { memoryStore, append, fromOutcome } from './src/dialog-core.ts'; export { mountScoreTransport } from './src/score-transport-dom.ts';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'cp', write: false, logLevel: 'silent',
})).outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
// Obsidian's own default values; the dark set is chosen by the emulated prefers-color-scheme
const VARS = `
:root { --background-primary:#ffffff; --background-secondary:#f6f6f6; --text-normal:#222222; --text-muted:#5c5c5c; --text-faint:#8a8a8a; --text-error:#d0312d; --text-success:#08873b; --background-modifier-hover:rgba(0,0,0,0.075); --background-modifier-border:#e0e0e0; --background-modifier-border-focus:#8a7be0; --background-modifier-box-shadow:rgba(0,0,0,0.1); --interactive-accent:#7b6cd9; --radius-s:4px; --radius-m:8px; --font-ui-small:13px; --font-ui-smaller:12px; }
@media (prefers-color-scheme: dark) { :root { --background-primary:#1e1e1e; --background-secondary:#262626; --text-normal:#dadada; --text-muted:#b3b3b3; --text-faint:#7f7f7f; --text-error:#fb464c; --text-success:#44cf6e; --background-modifier-hover:rgba(255,255,255,0.075); --background-modifier-border:#363636; --background-modifier-border-focus:#9b8cf0; --background-modifier-box-shadow:rgba(0,0,0,0.3); --interactive-accent:#9b8cf0; } }
*, *::before, *::after { box-sizing: border-box; }   /* Obsidian sets border-box on everything */
body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--background-primary); color: var(--text-normal); font-size: 14px; }
svg { color: var(--text-normal); } svg path, svg g { fill: currentColor; } `;
const page = `<!doctype html><meta charset=utf-8><style>${VARS}${css}</style><body><div id="host" style="width:1100px;height:640px"><div class="forge-rhythm-edit-score"><div class="forge-output-musicxml forge-score-compact">
<div class="forge-score-toolbar" id="tb"><midi-player class="forge-midi-player forge-midi-player-headless"></midi-player>
<div class="forge-zoom-bar"><button class="forge-zoom-button" aria-label="Zoom out" type="button">−</button><button class="forge-zoom-button forge-zoom-reset" aria-label="Reset zoom to 100%" type="button">100%</button><button class="forge-zoom-button" aria-label="Zoom in" type="button">+</button></div></div>
<div class="forge-output-score forge-rhythm-score-host" id="score"></div></div></div></div>
<script>${bundle}</script><script>
window.events = []; var playing = false, ls = [];
var player = { get playing() { return playing; }, start() { playing = true; ls.forEach(function (l) { l(true); }); }, stop() { playing = false; ls.forEach(function (l) { l(false); }); }, reset() { playing = false; }, setTempo(p) {}, onStateChange(fn) { ls.push(fn); return function () {}; } };
cp.mountScoreTransport(document.getElementById('tb'), { player: player, exportItems: [{ id: 'musicxml', label: 'MusicXML' }, { id: 'midi', label: 'MIDI' }], runExport: function () {} });
window.entries = []; window.store = cp.memoryStore();
window.h = cp.mountChatPanel(document.getElementById('host'), { store: store, box: { placeholder: 'Describe what you want, in a sentence', preview: async function () { return { ok: false, message: 'x' }; }, apply: async function () { return { ok: false }; },
  menu: { items: [{ id: 'new-bar', label: 'New bar' }], run: function () {} } } }, 'Mix [[bar_005]] and [[bar_006]].');
window.say = function (ev, ageMs) { entries = cp.append(entries, cp.fromOutcome(ev), Date.now() - ageMs); h.render(entries, ''); };
window.box = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
window.cs = function (sel, prop, pseudo) { return getComputedStyle(document.querySelector(sel), pseudo || null)[prop]; };
window.rgb = function (c) { var m = (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number); return /^color\\(srgb/.test(c) ? m.map(function (v) { return v * 255; }) : m; };
window.contrast = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
window.lum = function (c) { var m = rgb(c); var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
window.isRed = function (c) { var m = rgb(c).map(function (v) { return v / 255; }); var mx = Math.max.apply(null, m), mn = Math.min.apply(null, m), d = mx - mn; if (d < 0.15 || mx < 0.25) return false; var hh = (mx === m[0] ? ((m[1] - m[2]) / d + 6) % 6 : mx === m[1] ? (m[2] - m[0]) / d + 2 : (m[0] - m[1]) / d + 4) * 60; return hh <= 20 || hh >= 340; };
window.setScore = function (svg) { document.getElementById('score').innerHTML = svg; };
window.hostWidth = function () { return document.getElementById('score').clientWidth; };
</script>`;
const p = await openPage({ dir: '/', width: 1200, height: 720, pageHtml: page });
const ev = (js) => p.ev(js);
const verdict = {}, numbers = {};
const theme = async (t) => { await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: t }] }); await sleep(100); };
const setWidth = async (w) => { await ev(`document.getElementById('host').style.width = '${w}px'`); await sleep(250); };
const rd = (x) => Math.round(x * 10) / 10;

// ---- the dialog: your sentences, replies, both refusal kinds, a failure; ages from just now to yesterday ---------------------------------------------------------------------------------------------------------------
const SAY = [
  [{ type: 'you', text: 'Make bar_007 twelve bars long and a bit slower' }, 26 * 3600e3],
  [{ type: 'applied', change: 'extend 8 -> 12 bars', description: 'Extend [[bar_007]] to 12 bars, 10 percent slower.' }, 26 * 3600e3 - 2000],
  [{ type: 'you', text: 'Now mix it with bar_009 as a vote, and make the second half louder' }, 2 * 3600e3 + 60e3],
  [{ type: 'rejected', line: 1, column: 31, message: 'expected a percentage' }, 2 * 3600e3],
  [{ type: 'you', text: 'Something the grammar cannot read at all, which has to wrap onto a second line inside the bubble' }, 7 * 60e3 + 5e3],
  [{ type: 'refused', message: 'the sentence does not describe a change to this note' }, 7 * 60e3],
  [{ type: 'failed', message: 'the note changed while it was written' }, 119e3],
  [{ type: 'you', text: 'Extend bar_007 to 6 bars' }, 3e3],
  [{ type: 'suggestion', description: 'Extend [[bar_007]] to 6 bars.', recipe: '', via: 'grammar' }, 1e3],
];
for (const [e, age] of SAY) await ev(`say(${JSON.stringify(e)}, ${age})`);
await ev(`h.box.setNote('The grammar did not accept this sentence (line 1, column 31: expected a percentage).')`);
await ev(`document.querySelector('.forge-composer-error').textContent`);
const verovioFor = async (hostW) => { const svg = engrave(hostW); await ev(`setScore(${JSON.stringify(svg)})`); await sleep(150); };

// ---- the layout: 1100 and 700 px, light and dark, switching live (no reload) ---------------------------------------------------------------------------------------------------------------------------------------------
const lay = async (tag) => {
  const hostB = await ev(`box('#host')`), panel = await ev(`box('.forge-chat-panel')`), body = await ev(`box('.forge-chat-body')`), card = await ev(`box('.forge-prompt-box')`);
  const errH = (await ev(`box('.forge-composer-error')`))?.h ?? 0;
  return { hostB, panel, body, card, errH, cls: await ev(`document.getElementById('host').className`), layout: await ev('h.layout()') };
};
for (const [w, kind] of [[1100, 'wide'], [700, 'stacked']]) {
  await setWidth(w); await ev('window.scrollTo(0,0)');
  const hostW = await ev('hostWidth()'); await verovioFor(hostW);
  for (const t of ['light', 'dark']) {
    await theme(t); const tag = `${w}_${t}`; const L = await lay(tag);
    if (t === 'light') numbers[`${kind}@${w}`] = { hostW: Math.round(L.hostB.w), panelW: Math.round(L.panel.w), panelH: Math.round(L.panel.h), bodyW: Math.round(L.body.w), bodyH: Math.round(L.body.h), cardH: Math.round(L.card.h), scoreHostW: hostW, layoutClass: L.cls };
    if (kind === 'wide') {
      verdict[`twoColumns_${tag}`] = L.layout === 'wide' && L.panel.right <= L.body.left + 1 && Math.abs(L.panel.top - L.body.top) < 2 && L.cls.includes('forge-chat-wide');
      verdict[`panelLeftAbout40pct_${tag}`] = L.panel.w / L.hostB.w > 0.37 && L.panel.w / L.hostB.w < 0.43;
      verdict[`scoreRightAbout60pct_${tag}`] = L.body.w / L.hostB.w > 0.55 && L.body.w / L.hostB.w < 0.63;
      verdict[`cardAtBottomOfLeftColumn_${tag}`] = L.hostB.bottom - L.card.bottom - L.errH < 22 && L.card.bottom <= L.panel.bottom + 0.5;
      verdict[`columnsFillTheHeight_${tag}`] = Math.abs(L.panel.h - L.hostB.h) < 2 && Math.abs(L.body.h - L.hostB.h) < 2;
    } else {
      verdict[`stacked_${tag}`] = L.layout === 'narrow' && L.body.bottom <= L.panel.top + 1 && L.panel.w > L.hostB.w - 4 && L.cls.includes('forge-chat-stacked') && !L.cls.includes('forge-chat-wide');
      verdict[`cardAtBottomOfTheTab_${tag}`] = L.hostB.bottom - L.card.bottom - L.errH < 22;
    }
    await p.shot(path.join(OUT, `music-tab-${w}-${t}.png`), { x: 0, y: 0, width: w, height: 640 });
  }
}
await theme('light');

// ---- live switch: 1100 -> 700 -> 1100 -> 899 -> 900 with no reload -------------------------------------------------------------------------------------------------------------------------------------------------------------
const seq = []; for (const w of [1100, 700, 1100, 899, 900]) { await setWidth(w); seq.push(await ev('h.layout()')); }
verdict.layoutSwitchesLiveAtTheBreakpoint = JSON.stringify(seq) === JSON.stringify(['wide', 'narrow', 'wide', 'narrow', 'wide']);

// ---- the Score: engraved by the real Verovio for the column's width: wraps into systems, no horizontal scrollbar at 100 % ---------------------------------------------------------------------------------------------
for (const w of [1100, 700, 899]) {
  await setWidth(w); const hostW = await ev('hostWidth()'); await verovioFor(hostW);
  const m = await ev(`(function () { var sc = document.getElementById('score'), b = document.querySelector('.forge-chat-body'), svgs = sc.querySelectorAll('svg'); var r = svgs[0] ? svgs[0].getBoundingClientRect() : null; return { scW: sc.scrollWidth, scC: sc.clientWidth, bodyScW: b.scrollWidth, bodyC: b.clientWidth, svgW: r ? r.width : 0, systems: sc.querySelectorAll('g.system').length, pages: svgs.length, overflowX: getComputedStyle(sc).overflowX }; })()`);
  numbers[`score@${w}`] = { column: hostW, svgW: Math.round(m.svgW), systems: m.systems, pages: m.pages, scrollW: m.scW, clientW: m.scC };
  verdict[`scoreNoHorizontalScrollbar_${w}`] = m.scW <= m.scC + 1 && m.bodyScW <= m.bodyC + 1 && m.svgW <= m.scC + 1 && m.systems >= 3;
}
const sys1100 = numbers['score@1100'].systems, sys700 = numbers['score@700'].systems;
numbers.systemsWideVsStacked = { wide1100: sys1100, stacked700: sys700 };
await setWidth(1100); await verovioFor(await ev('hostWidth()'));
// a Score taller than the tab (the zoom at 100 % keeps its width): stack the engraving so the right column has to scroll
await ev(`(function () { var s = document.getElementById('score'); var c = s.cloneNode(true); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(function (e) { e.removeAttribute('id'); }); for (var i = 0; i < 3; i++) s.parentNode.appendChild(c.cloneNode(true)); })()`);

// ---- the bubble ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const t of ['light', 'dark']) {
  await theme(t);
  const b = await ev(`(function () { var el = document.querySelectorAll('.forge-chat-msg.is-you .forge-chat-text')[2]; var cs = getComputedStyle(el); var log = document.querySelector('.forge-chat-log'); var msg = el.closest('.forge-chat-msg'); var lr = log.getBoundingClientRect(), mr = msg.getBoundingClientRect(), er = el.getBoundingClientRect();
    var page = getComputedStyle(document.body).backgroundColor; var reply = document.querySelector('.forge-chat-msg.is-applied .forge-chat-text'); var rb = getComputedStyle(reply).backgroundColor;
    return { bg: cs.backgroundColor, page: page, radius: cs.borderTopLeftRadius, pt: cs.paddingTop, pl: cs.paddingLeft, pb: cs.paddingBottom, pr: cs.paddingRight, color: cs.color, normal: getComputedStyle(document.documentElement).getPropertyValue('--text-normal'), rightGap: lr.right - er.right, msgW: mr.width, logW: lr.width, replyBg: rb, wrapped: (function () { var r = document.createRange(); r.selectNodeContents(el); var tops = {}; [].forEach.call(r.getClientRects(), function (q) { tops[Math.round(q.top)] = 1; }); return Object.keys(tops).length >= 2; })(), contrast: contrast(cs.backgroundColor, page), lumBg: lum(cs.backgroundColor) }; })()`);
  numbers[`bubble_${t}`] = { bg: b.bg, page: b.page, contrastWithPage: rd(b.contrast), radius: b.radius, padding: `${b.pt} ${b.pr}`, maxWidthPct: rd(100 * b.msgW / b.logW) };
  verdict[`bubbleNotThePageBackground_${t}`] = b.bg !== b.page && b.contrast >= 1.15;
  verdict[`bubbleNotNearWhiteInLight_${t}`] = t === 'dark' ? b.lumBg < 0.2 : b.lumBg < 0.82;
  verdict[`bubbleRadius18Padding10to14_${t}`] = b.radius === '18px' && parseFloat(b.pt) >= 10 && parseFloat(b.pt) <= 14 && parseFloat(b.pl) >= 10 && parseFloat(b.pl) <= 14;
  verdict[`bubbleRightAlignedMax80pct_${t}`] = b.rightGap < 12 && b.msgW <= b.logW * 0.805;
  verdict[`bubbleTextNormalColourAndWraps_${t}`] = b.wrapped && b.color.replace(/\s/g, '') === (t === 'light' ? 'rgb(34,34,34)' : 'rgb(218,218,218)');
  verdict[`replyHasNoBubble_${t}`] = b.replyBg === 'rgba(0, 0, 0, 0)';
}
await theme('light');

// ---- no red: the grammar refusal, the service refusal, a failure, the composer's own line, their glyphs and borders -----------------------------------------------------------------------------------------------
for (const t of ['light', 'dark']) {
  await theme(t);
  const r = await ev(`(function () { var out = [], bad = []; function chk(name, el, pseudo) { var s = getComputedStyle(el, pseudo || null); var props = ['color', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'backgroundColor']; var vals = {}; props.forEach(function (p) { vals[p] = s[p]; if (isRed(s[p])) bad.push(name + ' ' + p + ' ' + s[p]); }); out.push(name); }
    var kinds = ['rejected', 'refused', 'failed']; kinds.forEach(function (k) { var m = document.querySelector('.forge-chat-msg.is-' + k); ['', '.forge-chat-text', '.forge-chat-bang', '.forge-chat-line', '.forge-chat-time'].forEach(function (sel) { var e = sel ? m.querySelector(sel) : m; chk(k + ' ' + (sel || 'msg'), e); }); });
    var ce = document.querySelector('.forge-composer-error'); chk('composer-error', ce); chk('composer-error::before', ce, '::before');
    var texts = kinds.map(function (k) { return document.querySelector('.forge-chat-msg.is-' + k + ' .forge-chat-text').textContent; });
    var glyph = kinds.map(function (k) { var b = document.querySelector('.forge-chat-msg.is-' + k + ' .forge-chat-bang'); return { text: b.textContent, aria: b.getAttribute('aria-hidden'), color: getComputedStyle(b).color, muted: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim(), before: b.nextElementSibling.className }; });
    var normal = getComputedStyle(document.querySelector('.forge-chat-msg.is-rejected')).color, refusedColor = getComputedStyle(document.querySelector('.forge-chat-msg.is-refused')).color;
    var whole = document.querySelector('.forge-chat-panel'); var all = whole.querySelectorAll('*'); var redAny = []; for (var i = 0; i < all.length; i++) { var cs = getComputedStyle(all[i]); if (isRed(cs.color) && all[i].textContent.trim()) redAny.push(all[i].className + ' ' + cs.color); }
    return { checked: out.length, bad: bad, texts: texts, glyph: glyph, normal: normal, refusedColor: refusedColor, composerColor: getComputedStyle(ce).color, composerBefore: getComputedStyle(ce, '::before').content, composerText: ce.textContent, redAny: redAny, textNormal: getComputedStyle(document.documentElement).getPropertyValue('--text-normal').trim(), textMuted: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() }; })()`);
  numbers[`refusal_${t}`] = { grammarColor: r.normal, serviceColor: r.refusedColor, composerLineColor: r.composerColor, glyphColor: r.glyph[0].color, checked: r.checked };
  verdict[`noRedAnywhereInTheDialogAndComposer_${t}`] = r.bad.length === 0 && r.redAny.length === 0;
  verdict[`bothRefusalsInTheNormalTextColour_${t}`] = r.normal === r.refusedColor && r.normal.replace(/\s/g, '') === (t === 'light' ? 'rgb(34,34,34)' : 'rgb(218,218,218)');
  verdict[`wordingUnchanged_${t}`] = r.texts[0] === 'The grammar did not accept this sentence (line 1, column 31: expected a percentage).' && r.texts[1] === 'The service refused: the sentence does not describe a change to this note' && r.texts[2] === 'Apply failed: the note changed while it was written';
  verdict[`neutralBangBeforeTheWording_${t}`] = r.glyph.every((g) => g.text === '!' && g.aria === 'true' && g.before === 'forge-chat-text' && g.color.replace(/\s/g, '') === (t === 'light' ? 'rgb(92,92,92)' : 'rgb(179,179,179)'));
  verdict[`composerErrorLineMutedWithBang_${t}`] = r.composerColor.replace(/\s/g, '') === (t === 'light' ? 'rgb(92,92,92)' : 'rgb(179,179,179)') && r.composerBefore.includes('!') && r.composerText.startsWith('The grammar did not accept');
}
await theme('light');

// ---- the "minutes ago" under every entry --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const times = await ev(`[].map.call(document.querySelectorAll('.forge-chat-msg'), function (m) { var t = m.querySelector('.forge-chat-time'), x = m.querySelector('.forge-chat-line'); var tr = t.getBoundingClientRect(), xr = x.getBoundingClientRect(); return { kind: m.getAttribute('data-kind'), label: t.hidden ? '' : t.textContent, below: tr.top >= xr.bottom - 1, size: parseFloat(getComputedStyle(t).fontSize), color: getComputedStyle(t).color }; })`);
numbers.timeLabels = times.map((x) => `${x.kind}: ${x.label}`);
verdict.everyEntryHasATimeUnderIt = times.length === SAY.length && times.every((x) => x.label !== '' && x.below);
verdict.timeSmallAndMuted = times.every((x) => x.size <= 12.5 && x.color.replace(/\s/g, '') === 'rgb(92,92,92)');
verdict.labelsAreTheWordsOfAChat = JSON.stringify(times.map((x) => x.label)) === JSON.stringify(['yesterday', 'yesterday', '2 hours ago', '2 hours ago', '7 minutes ago', '7 minutes ago', '1 minute ago', 'just now', 'just now']);
if (!FAST) {
  // one REAL timer: an entry 50 s old reads "just now"; after the tab's own 30 s recount (nobody calls refresh) it reads "1 minute ago"
  await ev(`say({ type: 'notice', message: 'timer probe' }, 50e3)`); const before = await ev(`Array.from(document.querySelectorAll('.forge-chat-time')).pop().textContent`);
  const t0 = Date.now(); let after = before; for (let i = 0; i < 40 && after === before; i++) { await sleep(1000); after = await ev(`Array.from(document.querySelectorAll('.forge-chat-time')).pop().textContent`); }
  numbers.realTimer = { before, after, secondsUntilItChanged: Math.round((Date.now() - t0) / 1000) };
  verdict.oneRealTimerRecountsWithin31s = before === 'just now' && after === '1 minute ago' && Date.now() - t0 <= 31500;
}
await p.shot(path.join(OUT, 'music-tab-1100-light-labels.png'), { x: 0, y: 0, width: 1100, height: 640 });

// ---- each column scrolls on its own; the card never moves; the tab itself does not scroll ----------------------------------------------------------------------------------------------------------------------------
for (let i = 0; i < 12; i++) await ev(`say({ type: 'you', text: 'A filler sentence number ${i}, long enough to take a line or two of the dialog' }, ${(12 - i) * 1000})`);
const sc = await ev(`(function () { var log = document.querySelector('.forge-chat-log'), body = document.querySelector('.forge-chat-body'), card = document.querySelector('.forge-prompt-box'); var host = document.getElementById('host');
  var c0 = card.getBoundingClientRect().top; var out = { logScrollable: log.scrollHeight > log.clientHeight + 4, bodyScrollable: body.scrollHeight > body.clientHeight + 4, logOverflow: getComputedStyle(log).overflowY, bodyOverflow: getComputedStyle(body).overflowY };
  log.scrollTop = 0; body.scrollTop = 0; log.scrollTop = 99999; out.logMoved = log.scrollTop > 0; out.bodyStillTop = body.scrollTop === 0;
  body.scrollTop = 120; out.bodyMoved = body.scrollTop > 0; out.logKept = log.scrollTop > 0; out.cardStill = Math.abs(card.getBoundingClientRect().top - c0) < 0.5;
  out.hostScrolls = host.scrollTop !== 0 || host.scrollHeight > host.clientHeight + 1; out.docScrolls = document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1; return out; })()`);
verdict.dialogColumnScrollsOnItsOwn = sc.logScrollable && sc.logMoved && sc.bodyStillTop;
verdict.scoreColumnScrollsOnItsOwn = sc.bodyScrollable && sc.bodyMoved && sc.logKept;
verdict.cardNeverMovesAndTheTabDoesNotScroll = sc.cardStill && !sc.hostScrolls && !sc.docScrolls;
await ev(`document.querySelector('.forge-chat-log').scrollTop = 99999`);
await p.shot(path.join(OUT, 'music-tab-1100-light-scrolled.png'), { x: 0, y: 0, width: 1100, height: 640 });
// the stacked layout scrolls its parts on their own too
await setWidth(700);
const sc2 = await ev(`(function () { var log = document.querySelector('.forge-chat-log'), body = document.querySelector('.forge-chat-body'), host = document.getElementById('host'); body.scrollTop = 80; return { bodyScrollable: body.scrollHeight > body.clientHeight + 4, bodyMoved: body.scrollTop > 0, logScrollable: log.scrollHeight > log.clientHeight + 2, hostScrolls: host.scrollHeight > host.clientHeight + 1, logH: log.clientHeight, panelH: document.querySelector('.forge-chat-panel').getBoundingClientRect().height }; })()`);
numbers.stackedHeights = { dialogH: sc2.logH, panelH: Math.round(sc2.panelH) };
verdict.stackedScrollsOnItsOwnToo = sc2.bodyScrollable && sc2.bodyMoved && !sc2.hostScrolls;
await setWidth(1100);

// ---- no hover effect: the pointer over the bubble, the card and a reply changes nothing (styles) and adds nothing (DOM) ---------------------------------------------------------------------------------------------------
const snap = async () => ev(`(function () { var out = {}; ['.forge-chat-msg.is-you .forge-chat-text', '.forge-prompt-box', '.forge-composer-send', '.forge-composer-plus', '.forge-chat-msg.is-applied', '.forge-chat-bang', '.forge-chat-time'].forEach(function (sel) { var e = document.querySelector(sel), s = getComputedStyle(e); out[sel] = [s.backgroundColor, s.color, s.borderTopColor, s.boxShadow, s.transform, s.opacity, s.cursor === 'pointer' ? 'pointer' : s.cursor, s.outlineStyle, e.getBoundingClientRect().width, e.getBoundingClientRect().height].join('|'); }); out.nodes = document.getElementsByTagName('*').length; out.tooltips = document.querySelectorAll('[title]').length; return JSON.stringify(out); })()`);
const quiet = await snap(); let same = true;
for (const sel of ['.forge-chat-msg.is-you .forge-chat-text', '.forge-prompt-box', '.forge-chat-msg.is-applied', '.forge-chat-time']) { const b = await ev(`box(${JSON.stringify(sel)})`); await p.hover(b.x, b.y); await sleep(700); if ((await snap()) !== quiet) same = false; }
verdict.noHoverEffectOnTheBubbleTheCardOrTheReplies = same;
verdict.noNativeTooltipsInThePanel = (await ev(`document.querySelectorAll('.forge-chat-panel [title], .forge-chat-panel [data-tooltip]').length`)) === 0;

// ---- the narrow shots, light and dark (the dialog and the card under the Score) -------------------------------------------------------------------------------------------------------------------------------------
await ev(`(function () { document.querySelector('.forge-chat-log').scrollTop = 99999; })()`);
for (const t of ['light', 'dark']) { await theme(t); await setWidth(700); await ev(`document.querySelector('.forge-chat-body').scrollTop = 0; document.querySelector('.forge-chat-log').scrollTop = 99999`); await p.shot(path.join(OUT, `music-tab-700-${t}-end.png`), { x: 0, y: 0, width: 700, height: 640 }); }
await theme('dark'); await setWidth(1100); await ev(`document.querySelector('.forge-chat-body').scrollTop = 0; document.querySelector('.forge-chat-log').scrollTop = 0`); await p.shot(path.join(OUT, 'music-tab-1100-dark-top.png'), { x: 0, y: 0, width: 1100, height: 640 });
await theme('light');

p.close();
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k).join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
