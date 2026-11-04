// 2026-11-03-1155-9 (PRIORITY, driver: "make all the text tags selectable and copyable so I can copy them to you") in real Chrome under Obsidian's own app.css: every kind of message the plugin draws is selectable by a REAL triple-click (the browser's own
// selection equals the message text), there is NO Copy button anywhere (2026-11-03-1160-copy: the driver's Ctrl+C works; the bar's message has its full width back), a `user-select: none` CONTROL is not selectable (so the test can fail), a REAL drag across the Score still selects bars and selects no
// text, buttons stay unselectable, nothing shifts. Every message class of the stylesheet's list is also probed for its computed `user-select`. Build and run from the repo root:
//   OUT=<dir>/harness-messages.js EDITION=music ENTRY=entry-messages.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   PANE_W=1500 node scripts/dev/measure-selectable-messages.ts <dir>        (writes <dir>/selectable-messages-measurements.json and shots/selectable-*.png; exits 1 when a verdict is false)
import fs from 'node:fs';
import path from 'node:path';
import { engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { handEditRefusal } from '../../src/phrase-notes-core.ts';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BAR = fs.readFileSync(new URL('../../test/fixtures/score-first/bar_005.md', import.meta.url), 'utf8');
const note = (p: object, extra = '') => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, ...p }, null, 2)}\n\`\`\`\n${extra}`;
const py = await engine();
const routes = { 'POST /phrase': async (q: any, r: any) => { let b = ''; for await (const ch of q) b += ch; const { data, params, title } = JSON.parse(b); try { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ payload: computePhrase(py, data, params, title) })); } catch (e: any) { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ __error: String(e.message || e) })); } } };
const W = Number(process.env.PANE_W ?? 1500);
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light mod-macos">
<div class="workspace-leaf-content" data-type="forge-phrase" style="width:${W}px;height:760px;display:flex;flex-direction:column;border:1px solid #ccc"><div class="view-header" style="height:36px"></div>
<div class="view-content forge-phrase-view" id="pane" style="flex:1 1 0;min-height:0;overflow:auto"><p id="ctl" style="user-select:none;margin:6px">CONTROL: this paragraph is user-select none and must NOT be selectable.</p></div></div>
<script>window.__errors=[];const _e=console.error;console.error=(...a)=>{window.__errors.push(a.map(x=>x&&x.stack||String(x)).join(' ').slice(0,300));_e(...a)};</script>
<script src="harness-messages.js"></script></body></html>`;

// every class the stylesheet's message block names, read from the stylesheet itself (so the list the probe walks is the list that ships)
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('2026-11-03-1155-9 (PRIORITY'));
const selectors = block.slice(block.indexOf('*/') + 2, block.indexOf('{')).split(',').map((s) => s.trim()).filter(Boolean);

const out: any = {};
const p = await openPage({ dir: here, width: W + 100, height: 860, pageHtml: page, routes });
const mouse = (type: string, x: number, y: number, extra: object = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
const tripleClick = async (x: number, y: number) => { await mouse('mouseMoved', x, y); for (const n of [1, 2, 3]) { await mouse('mousePressed', x, y, { clickCount: n }); await mouse('mouseReleased', x, y, { clickCount: n }); } await sleep(60); };
const center = (sel: string) => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2, w: r.width, h: r.height, text: e.textContent }; })()`);
const selection = () => p.ev(`getSelection().toString()`);
const clearSel = () => p.ev(`getSelection().removeAllRanges(); 0`);
/** a real triple-click on the middle of `sel`: what the browser selected, against the element's own text */
const selects = async (sel: string) => { const c = await center(sel); if (!c) return { found: false }; await clearSel(); await tripleClick(c.x, c.y); const got = (await selection()).replace(/\s+/g, ' ').trim(); const want = String(c.text).replace(/\s+/g, ' ').trim(); return { found: true, got, want, ok: got === want && want.length > 0 }; };
try {
  await p.ev(`window.__mountBar(document.getElementById('pane')); window.__mountPhrase(document.getElementById('pane'), { phrase: ${JSON.stringify(note({}))}, bar: ${JSON.stringify(BAR)}, path: 'phrases/phrase_003.md', name: 'phrase_003', notebook: true })`);
  for (let w = 0; w < 30000; w += 100) { if (await p.ev(`!!document.querySelector('.forge-rhythm-score-host svg') && document.querySelectorAll('.forge-notebook-bar').length === 8`)) break; await sleep(100); }
  await sleep(800);
  // 0. the stylesheet's list, probed for the computed value in the real structure; controls
  out.probe = await p.ev(`(() => { const host = document.getElementById('pane'); const res = {}; for (const sel of ${JSON.stringify(selectors)}) { const parts = sel.split('>').map((s) => s.trim()); let parent = host, el = null; for (const part of parts) { el = document.createElement(part === 'li' ? 'li' : part === 'span' ? 'span' : part === 'pre' ? 'pre' : 'div'); const m = /\\.([A-Za-z0-9_-]+)/.exec(part); if (m) el.className = m[1]; if (part.includes(' ')) { const [anc, desc] = part.split(' '); parent.appendChild(Object.assign(document.createElement('div'), { className: anc.slice(1) })).appendChild(el = document.createElement(desc)); } else parent.appendChild(el); parent = el; } res[sel] = getComputedStyle(el).userSelect || getComputedStyle(el).webkitUserSelect; } return res; })()`);
  out.probeBad = Object.entries(out.probe).filter(([, v]) => v !== 'text').map(([k]) => k);
  out.controls = await p.ev(`(() => { const u = (e) => e && (getComputedStyle(e).userSelect || getComputedStyle(e).webkitUserSelect); return { scoreSvg: u(document.querySelector('.forge-rhythm-score-host svg')), plainNone: u(document.getElementById('ctl')), notebookBarButton: u(document.querySelector('.forge-notebook-bar')) }; })()`);
  // 1. the CONTROL: a user-select none paragraph is NOT selected by a real triple-click
  { const c = await center('#ctl'); await clearSel(); await tripleClick(c.x, c.y); out.control = { got: await selection() }; }
  // 2. the Description / Recipe bar: the real sentences, triple-click, no Copy button, no layout shift
  const SENTENCES = {
    recipeError: "Recipe, line 3, column 1: I do not know the step 'Sprinkle'. A step starts with Take, Repeat, Build, Mix, Morph, Transform, Play, Together, Mute, Solo, Only.",
    notSaved: 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.',
    bothEdited: 'Description and Recipe were both edited; keep one: Update from Description / Update from Recipe.',
  };
  out.bar = {};
  for (const [name, text] of Object.entries(SENTENCES)) {
    await p.ev(`window.__bar.show({ message: ${JSON.stringify(text)}, actions: ['revert'] }); 0`); await sleep(100);
    const before = await p.ev(`(() => { const b = document.querySelector('.forge-description-bar').getBoundingClientRect(); const m = document.querySelector('.forge-description-message').getBoundingClientRect(); return { barH: b.height, msgTop: +(m.top - b.top).toFixed(1), msgLeft: +(m.left - b.left).toFixed(1) }; })()`);
    const sel = await selects('.forge-description-message');
    const noCopy = await p.ev(`document.querySelectorAll('.forge-copy-button, .forge-description-bar button').length === document.querySelectorAll('.forge-description-button').length && !document.querySelector('.forge-copy-button')`);
    const after = await p.ev(`(() => { const b = document.querySelector('.forge-description-bar').getBoundingClientRect(); const m = document.querySelector('.forge-description-message').getBoundingClientRect(); const sib = document.querySelector('.forge-description-message').nextElementSibling; return { barH: b.height, barW: b.width, msgTop: +(m.top - b.top).toFixed(1), msgLeft: +(m.left - b.left).toFixed(1), msgW: m.width, nextIs: sib ? sib.className : null }; })()`);
    out.bar[name] = { selects: sel, noCopy, geometry: { before, after }, msgW: after.msgW, barW: after.barW, nextIs: after.nextIs, shifted: Math.abs(after.barH - before.barH) > 1 || Math.abs(after.msgTop - before.msgTop) > 1 || Math.abs(after.msgLeft - before.msgLeft) > 1, ok: sel.ok === true && noCopy === true && after.nextIs === 'forge-description-buttons' };
  }
  await p.shot(path.join(SHOTS, 'selectable-bar.png'), { x: 0, y: 0, width: 1500, height: 120 });
  await p.ev(`window.__bar.show({ message: 'The sentence service suggests this.', actions: ['apply-preview'], preview: { description: 'Extend [[bar_005]] to 6 bars.', recipe: 'Take [[bar_005]].' } }); 0`); await sleep(100);
  out.preview = { description: await selects('.forge-description-preview-description'), recipe: await selects('.forge-description-preview-recipe') };
  await p.ev(`window.__bar.show({ message: '', actions: [] }); 0`);
  // 3. the strip's refusal: the REAL sentence a note gives when its Description was edited by hand, shown by the real strip when a control is changed
  await p.ev(`window.__refuse = ${JSON.stringify(handEditRefusal(true))}; (() => { const e = document.querySelector('.forge-phrase-bars'); e.value = '6'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(800);
  out.strip = { statusText: await p.ev(`document.querySelector('.forge-phrase-status')?.textContent ?? null`), selects: await selects('.forge-phrase-status'), copyButton: await p.ev(`!!document.querySelector('.forge-phrase-status + .forge-copy-button')`) };
  // 4. the Score's own refusal (an invalid note): status line selectable, no Copy button
  await p.ev(`window.__refuse = ''; window.__edit('phrases/phrase_003.md', ${JSON.stringify(note({ bars: 0 }))}); 0`); await sleep(1500);
  out.scoreStatus = { text: await p.ev(`document.querySelector('.forge-rhythm-edit-score-status')?.textContent ?? null`), selects: await selects('.forge-rhythm-edit-score-status'), copyButton: await p.ev(`!!document.querySelector('.forge-rhythm-edit-score-status + .forge-copy-button')`) };
  await p.shot(path.join(SHOTS, 'selectable-strip-score.png'), { x: 0, y: 0, width: 1100, height: 640 });
  // 5. back to a good note: the Score, a REAL drag across bars 3 to 5 selects bars and NO text; a click pins a bar and the inspector's text is selectable; the notebook's alert
  await p.ev(`window.__edit('phrases/phrase_003.md', ${JSON.stringify(note({}))}); 0`);
  for (let w = 0; w < 20000; w += 100) { if (await p.ev(`document.querySelectorAll('.forge-rhythm-score-host svg g.measure').length === 8`)) break; await sleep(100); }
  await sleep(600);
  const box = (n: number) => p.ev(`(() => { const r = document.querySelector('#ph_bar_${n}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left }; })()`);
  await p.ev(`document.querySelector('.forge-rhythm-score-host').scrollIntoView({ block: 'center' }); 0`); await clearSel();
  const b3 = await box(3), b4 = await box(4), b5 = await box(5);
  await mouse('mouseMoved', b3.x, b3.y); await mouse('mousePressed', b3.x, b3.y);
  for (const b of [b4, b5]) { await mouse('mouseMoved', b.l + 10, b.y, { buttons: 1 }); await mouse('mouseMoved', b.x, b.y, { buttons: 1 }); }
  await mouse('mouseReleased', b5.x, b5.y); await sleep(300);
  out.drag = { pressed: await p.ev(`[...document.querySelectorAll('.forge-notebook-bar')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => Number(b.textContent))`), selectedText: await selection() };
  await p.shot(path.join(SHOTS, 'selectable-drag.png'), { x: 0, y: 0, width: 1100, height: 760 });
  { const run = await center('.forge-notebook-run'); await mouse('mouseMoved', run.x, run.y); await mouse('mousePressed', run.x, run.y); await mouse('mouseReleased', run.x, run.y); await sleep(500); }
  out.notebook = { text: await p.ev(`document.querySelector('.forge-notebook-message')?.textContent ?? null`), selects: await selects('.forge-notebook-message'), copyButton: await p.ev(`!!document.querySelector('.forge-notebook-message + .forge-copy-button')`) };
  const n5 = await p.ev(`(() => { const e = document.querySelector('#ph_bar_5 .notehead'); e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', n5.x, n5.y); await mouse('mousePressed', n5.x, n5.y); await mouse('mouseReleased', n5.x, n5.y); await sleep(400);
  out.inspector = { lineage: await selects('.forge-inspector-lineage > li > span'), title: await selects('.forge-inspector-title') };
  out.errors = (await p.ev('window.__errors.slice()')).filter((e: string) => !/\[forge-player\]/.test(e));
} finally { await p.close?.(); }
const bar = Object.values(out.bar) as any[];
out.verdicts = {
  probe: out.probeBad.length === 0 && Object.keys(out.probe).length === selectors.length,
  controlFails: out.control.got === '' && out.controls.plainNone === 'none',
  bar: bar.every((b) => b.ok && !b.shifted),
  preview: out.preview.description.ok && out.preview.recipe.ok,
  strip: out.strip.selects.ok === true && out.strip.copyButton === false && /Not saved/.test(String(out.strip.statusText)),
  scoreStatus: out.scoreStatus.selects.ok === true && out.scoreStatus.copyButton === false,
  notebook: out.notebook.selects.ok === true && out.notebook.copyButton === false,
  inspector: out.inspector.lineage.ok === true,
  dragStillSelectsBars: JSON.stringify(out.drag.pressed) === '[3,4,5]' && out.drag.selectedText === '',
  buttonsStillNotText: out.controls.scoreSvg === 'none' && out.controls.notebookBarButton === 'none',
  noErrors: out.errors.length === 0,
};
fs.writeFileSync(path.join(here, 'selectable-messages-measurements.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.verdicts));
if (!Object.values(out.verdicts).every(Boolean)) { console.log(JSON.stringify({ probeBad: out.probeBad, controls: out.controls, control: out.control, bar: out.bar, preview: out.preview, strip: out.strip, scoreStatus: out.scoreStatus, drag: out.drag, notebook: out.notebook, inspector: out.inspector, errors: out.errors }, null, 1).slice(0, 4500)); process.exit(1); }
