// 2026-11-16-1000 - select bars on the Score, in real headless Chrome with REAL mouse and key events: the real `mountPhrase` (the inspector, the tint, the selection menu, the prompt box's preview) bundled by esbuild into the page, drawn by the
// REAL engine's MusicXML through real Verovio (so bar ids, sizes and the layout are real), with the plugin's own styles.css. The page's engine/render ports hand back what Node made; everything the person touches is the plugin's own code.
// Verdicts: a Shift-click selects (count, tint on exactly those bars), Shift again extends, Cmd-click toggles one apart, a plain click still pins and leaves the selection, Esc clears; the menu sits ABOVE the first selected bar, inside the
// page, never over the selected bars' own drawing, five entries, at 360 px it wraps without leaving the page; Delete on a transform phrase puts the sentence in the prompt box as an unapplied preview (nothing written), on an extend
// asks for a new phrase. Screenshots (light and dark) go to --out.
//   node --experimental-strip-types scripts/dev/measure-bar-selection.ts [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { openPage, sleep } from './cdp.mjs';
import { WHEELS_PRESENT, engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { prepareScore } from '../../src/verovio.ts';
import { annotatePhraseXml, PHRASE_BAR_SCOPE } from '../../src/phrase-lineage-core.ts';

const arg = (name: string, dflt: string): string => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/1000-shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
if (!WHEELS_PRESENT) { console.error('the music wheels are not fetched'); process.exit(2); }
const py = await engine();
const bar = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.resolve('test/fixtures/score-first/bar_007.md'), 'utf8'))![1]);
const BARS = 8;
const payload = computePhrase(py, bar, { kind: 'extend', source: 'bar_007', bars: BARS, style: 'repeat_with_fills', tempo_change_pct: -10 } as never, 'phrase_006') as any;
const multi = String(payload.multi_staff_content ?? payload.content);
const annotated = annotatePhraseXml(multi, null, BARS, PHRASE_BAR_SCOPE);
if (annotated.ok === false) throw new Error(annotated.problems.join('; '));
const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
const tk = new VerovioToolkit(await create());
const svgFor = (width: number): string => { tk.setOptions({ adjustPageHeight: true, breaks: 'auto', pageWidth: width, pageMarginTop: 50, pageMarginBottom: 20, pageMarginLeft: 20, pageMarginRight: 20, scale: 40, mnumInterval: 1, svgViewBox: true, header: 'none', footer: 'none' }); tk.loadData(prepareScore(annotated.multiXml)); return Array.from({ length: tk.getPageCount() }, (_, i) => tk.renderToSVG(i + 1)).join(''); };

const entry = `
import { mountPhrase } from './src/phrase-dom.ts';
import { mountPromptBox } from './src/prompt-box-dom.ts';
import { registerBarSelectionHost } from './src/bar-selection-bus.ts';
import { noteContentFor } from './src/phrase-core.ts';
declare const CFG: any;
const w = window as any;
w.__log = [] as string[]; w.__made = [] as unknown[]; w.__written = [] as string[];
const files = new Map<string, string>([['bars/bar_007.md', CFG.barNote], ['phrases/phrase_006.md', noteContentFor('phrase_006', CFG.extend)], ['phrases/phrase_007.md', noteContentFor('phrase_007', CFG.transform)]]);
const root = document.getElementById('root') as HTMLElement;
const mount = async (path: string): Promise<void> => {
  root.innerHTML = ''; w.__made = []; w.__log = [];
  const tab = document.createElement('div'); tab.className = 'tab'; root.appendChild(tab);
  const box = mountPromptBox(tab, { apply: async () => { w.__written.push('apply'); return { ok: true }; }, placeholder: 'Describe it in a sentence' }, '');
  registerBarSelectionHost({
    previewDescription: (p: string, text: string) => { box.suggest(text); w.__log.push('preview ' + p); return true; },
    makePhrase: async (params: unknown) => { w.__made.push(params); return { ok: true as const, path: 'phrases/phrase_099.md' }; },
  });
  const origInfo = console.info; console.info = (...a: unknown[]) => { w.__log.push(a.join(' ')); };
  const host = document.createElement('div'); tab.insertBefore(host, box.el);
  const handle = mountPhrase(host, {
    path, title: path.replace(/^phrases\\//, '').replace(/\\.md$/, ''), plan: 'score',
    readNote: async (p: string) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (data: any, params: any) => ({ ...CFG.payload, bars_data: params.kind === 'transform' ? data.bars : CFG.payload.bars_data }),
    renderInto: (h: HTMLElement) => { h.innerHTML = CFG.svg; return true; },
    stopPlayers: () => {}, setTimer: (fn: () => void, ms: number) => window.setTimeout(fn, ms), clearTimer: (x: number) => window.clearTimeout(x), now: () => performance.now(),
    inspector: { openNote: () => {}, onPin: (p: unknown) => { w.__log.push('pin ' + JSON.stringify(p)); } },
  } as never);
  await handle.load();
  console.info = origInfo;
  w.__handle = handle;
};
w.__mount = mount;
`;
const bundled = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts', sourcefile: 'selection-proof-entry.ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundled.outputFiles[0].text;
const css = fs.readFileSync('styles.css', 'utf8');
const barNote = fs.readFileSync(path.resolve('test/fixtures/score-first/bar_007.md'), 'utf8');
const CFG = { payload, svg: svgFor(1100), barNote, extend: { kind: 'extend', source: 'bar_007', bars: BARS, style: 'repeat_with_fills', tempo_change_pct: -10 }, transform: { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] } };
const html = (scheme: string) => `<!doctype html><meta charset="utf-8"><style>${css}</style><style>
  :root { --text-normal: #2B2B2B; --text-muted: #6b6b6b; --background-primary: #FDFCFA; --background-modifier-border: #d4d2cc; --background-modifier-hover: #ecebe6; --interactive-accent: #7c5cff; --font-ui-smaller: 12px; }
  @media (prefers-color-scheme: dark) { :root { --text-normal: #DADADA; --text-muted: #9a9a9a; --background-primary: #1E1E1E; --background-modifier-border: #3c3c3c; --background-modifier-hover: #2e2e2e; } }
  body { margin: 0; padding: 12px 16px; background: var(--background-primary); color: var(--text-normal); font: 14px -apple-system, system-ui, sans-serif; } svg { color: var(--text-normal); } svg text, svg tspan { fill: currentColor; } svg path, svg line { stroke: currentColor; } svg use, svg polygon { fill: currentColor; }
  .tab { max-width: 1100px; margin: 0 auto; } .forge-prompt-box { margin-top: 10px; } .forge-prompt-box textarea { width: 100%; box-sizing: border-box; }
</style><body><div id="root"></div><script>window.CFG = ${JSON.stringify(CFG).replace(/</g, '\\u003c')};</script><script>${js.replace(/<\/script>/g, '<\\/script>')}</script>`;
const page = await openPage({ dir: process.cwd(), width: 1180, height: 1100, pageHtml: html('light') });
await sleep(600);
const verdict: Record<string, boolean> = {}; const facts: Record<string, unknown> = {};
const mods = { shift: 8, ctrl: 2, meta: 4 };
const centre = async (n: number) => JSON.parse(await page.ev(`(function () { var m = document.querySelectorAll('g.measure')[${n - 1}]; m.scrollIntoView({ block: 'center' }); var r = m.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
const mouse = async (n: number, modifiers = 0) => { const c = await centre(n); await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, modifiers }); await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1, modifiers }); await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1, modifiers }); await sleep(120); };
const key = async (k: string) => { await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 27 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: 27 }); await sleep(120); };
const state = async (near: number[] = []) => JSON.parse(await page.ev(`(function () { var near = ${JSON.stringify(near)}; if (near.length) { document.querySelectorAll('g.measure')[near[0] - 1].scrollIntoView({ block: 'center' }); } var m = document.querySelector('.forge-bar-selection'); var shown = !!m && m.style.display !== 'none';
  var tinted = [].map.call(document.querySelectorAll('.forge-selected-bar'), function (r) { return [].indexOf.call(document.querySelectorAll('g.measure'), r.parentNode) + 1; });
  var nt = shown ? m.querySelector('.forge-bar-selection-note') : null; var out = { shown: shown, count: shown ? m.querySelector('.forge-bar-selection-count').textContent : null, note: nt && nt.style.display !== 'none' ? nt.textContent : null, tinted: tinted, disabled: shown ? [].filter.call(m.querySelectorAll('button[data-action]'), function (b) { return b.disabled; }).map(function (b) { return b.getAttribute('data-action'); }) : [], text: document.querySelector('.forge-prompt-box textarea').value, edited: document.querySelector('.forge-prompt-box').className.indexOf('is-edited') >= 0, made: window.__made.length, pins: window.__log.filter(function (l) { return l.indexOf('pin ') === 0; }).length };
  if (shown) { var mr = m.getBoundingClientRect(); var nb = near.map(function (n) { return document.querySelectorAll('g.measure')[n - 1].getBoundingClientRect(); });
    var gapY = null, overlaps = false; if (nb.length) { var top = Math.min.apply(null, nb.map(function (b) { return b.top; })), bottom = Math.max.apply(null, nb.map(function (b) { return b.bottom; })), l = Math.min.apply(null, nb.map(function (b) { return b.left; })), r = Math.max.apply(null, nb.map(function (b) { return b.right; })); gapY = Math.max(0, mr.top - bottom, top - mr.bottom); overlaps = !(mr.right <= l || mr.left >= r || mr.bottom <= top || mr.top >= bottom); }
    out.menu = { l: mr.left, t: mr.top, r: mr.right, b: mr.bottom, inViewport: mr.left >= 0 && mr.top >= 0 && mr.right <= innerWidth && mr.bottom <= innerHeight, gapY: gapY, overlapsTheBars: overlaps, buttons: m.querySelectorAll('button[data-action]').length, beside: nb.length ? (nb[0].top - mr.bottom) : null }; }
  return JSON.stringify(out); })()`));

// ---- an EXTEND phrase
await page.ev(`window.__mount('phrases/phrase_006.md').then(function () { return new Promise(function (r) { setTimeout(r, 500); }); })`);
await sleep(500);
const bars0 = await page.ev(`document.querySelectorAll('g.measure').length`);
if (process.env.DEBUG_SEL) console.log('DEBUG measures', bars0, await page.ev(`JSON.stringify({ids: [].map.call(document.querySelectorAll('g.measure'), function (g) { return g.id; }), log: window.__log.slice(0, 8), svgs: document.querySelectorAll('svg').length})`));
verdict.eightBarsDrawn = bars0 === BARS;
let s = await state();
verdict.nothingSelectedAtFirst = s.shown === false && s.tinted.length === 0;
await mouse(3, mods.shift); s = await state();
verdict.shiftClickSelectsOneBar = s.shown && s.count === 'bar 3 selected' && JSON.stringify(s.tinted) === '[3]';
await mouse(5, mods.shift); s = await state();
verdict.shiftClickExtendsToARange = s.count === '3 bars selected: bars 3 to 5' && JSON.stringify(s.tinted) === '[3,4,5]';
await mouse(7, mods.meta); s = await state();
verdict.cmdClickAddsABarApart = s.count === '4 bars selected: bars 3 to 5 and bar 7' && JSON.stringify(s.tinted) === '[3,4,5,7]';
await mouse(4, mods.meta); s = await state();       // (Ctrl-click is a right click on a Mac: Chrome sends a context menu, not a click; Cmd is the Mac's toggle. Ctrl-click is tested in the inspector's and the tab's own tests)
verdict.cmdClickTakesOneOut = JSON.stringify(s.tinted) === '[3,5,7]';
facts.afterToggle = s.tinted;
s = await state([7]);
verdict.menuIsBesideTheBarLastTouchedFiveEntriesInView = !!s.menu && s.menu.buttons === 5 && !s.menu.overlapsTheBars && s.menu.gapY <= 14 && s.menu.inViewport;
facts.menu = s.menu;
const pinsBefore = s.pins;
await mouse(2); s = await state();
verdict.plainClickIsStillThePinAndKeepsTheSelection = s.pins === pinsBefore + 1 && JSON.stringify(s.tinted) === '[3,5,7]';
await state([7]);
await page.shot(path.join(OUT, 'selection-menu-light.png'));
await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }); await sleep(250);
await page.shot(path.join(OUT, 'selection-menu-dark.png'));
await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }); await sleep(150);
await page.ev(`document.querySelector('[data-action="delete"]').click()`); await sleep(300);
s = await state(); const made = JSON.parse(await page.ev(`JSON.stringify(window.__made)`));
verdict.deleteOnAnExtendAsksForANewTransformPhraseOfIt = made.length === 1 && made[0].kind === 'transform' && made[0].source === 'phrases/phrase_006' && JSON.stringify(made[0].ops) === '[{"op":"delete","runs":[[3,3],[5,5],[7,7]]}]' && s.shown === false;
await key('Escape'); s = await state();
verdict.escLetsGo = !s.shown && s.tinted.length === 0;
await mouse(1, mods.shift); await mouse(3, mods.shift); await key('Escape'); s = await state();
verdict.escClearsARange = !s.shown && s.tinted.length === 0;

// ---- a TRANSFORM phrase: the sentence is a PREVIEW in its prompt box
await page.ev(`window.__mount('phrases/phrase_007.md').then(function () { return new Promise(function (r) { setTimeout(r, 500); }); })`); await sleep(500);
await mouse(4, mods.shift); await mouse(5, mods.shift);
await page.ev(`document.querySelector('[data-action="delete"]').click()`); await sleep(300);
s = await state();
verdict.deleteOnATransformIsAPreviewInThePromptBox = s.text === 'Take [[phrase_006]]. Delete bars 4 to 5. Thin out bars 1 to 2, by half, keeping the downbeat.' && s.edited === true && s.made === 0 && /press Apply/.test(String(s.note));
verdict.theSelectionStaysAfterAPreview = JSON.stringify(s.tinted) === '[4,5]';
facts.preview = { text: s.text, edited: s.edited, made: s.made, count: s.count, note: s.note };
await state([4]);
await page.shot(path.join(OUT, 'selection-preview-light.png'));
await page.ev(`document.querySelector('.forge-prompt-box').scrollIntoView({ block: 'center' })`); await sleep(150);
await page.shot(path.join(OUT, 'selection-preview-promptbox-light.png'));
await key('Escape'); await mouse(1, mods.shift); s = await state();
verdict.moveLeftIsGreyedOnBar1 = s.disabled.includes('move-left') && !s.disabled.includes('move-right');
facts.disabledOnBar1 = s.disabled;

// ---- a narrow tab: the menu wraps, never leaves the page
await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(400);
await mouse(1, mods.shift);
await page.ev(`document.querySelectorAll('g.measure').length`);
s = await state([1]);
verdict.narrowMenuStaysInsideThePage = !!s.menu && s.menu.inViewport && s.menu.r <= 360 && !s.menu.overlapsTheBars;
facts.narrow = s.menu;
if (process.env.DEBUG_SEL) console.log('DEBUG narrow', await page.ev(`(function () { var m = document.querySelector('.forge-bar-selection'); var a = m.parentNode; var cs = getComputedStyle(a); var ar = a.getBoundingClientRect(); var b1 = document.querySelector('g.measure').getBoundingClientRect(); return JSON.stringify({ areaClass: a.className, pos: cs.position, overflow: cs.overflow + '/' + cs.overflowY, scrollTop: a.scrollTop, area: [ar.left, ar.top, ar.width, ar.height], style: [m.style.left, m.style.top], offsetParent: m.offsetParent && m.offsetParent.className, bar1: [b1.left, b1.top, b1.width, b1.height], winScroll: scrollY }); })()`));
await page.shot(path.join(OUT, 'selection-menu-narrow.png'));
page.close();
console.log(JSON.stringify(facts)); console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean); console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`); process.exit(ok ? 0 : 1);
