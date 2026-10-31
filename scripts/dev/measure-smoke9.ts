// 2026-10-31-1110 (CCQA smoke 9, items 3, 4 and 5) in real Chrome under Obsidian's own stylesheet: (a) a score on screen is DIMMED (computed opacity) from the moment its data changes until the next one replaces it, and the new one is not;
// (b) the line that names the kit of a pinned row is visible, muted, and not clipped, and hidden when nothing is pinned; (c) the notebook's hint stays on screen after a bar is picked and says how to undo, and a REAL Esc key clears the pick.
// Writes shots/smoke9-*.png and smoke9-measurements.json; exits 1 when a verdict is false. Build and run from the client repo root:
//   OUT=<dir>/harness-smoke9.js EDITION=music ENTRY=entry-smoke9.ts node scripts/dev/browser/build.mjs      (with app.css and plugin-styles.css = this repo's styles.css in <dir>)
//   node scripts/dev/measure-smoke9.ts <dir>
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore
import { openPage, sleep } from './cdp.mjs';

const here = process.argv[2];
const SHOTS = path.join(here, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const page = `<!doctype html><html><head><meta charset=utf-8><link rel=stylesheet href="app.css"><link rel=stylesheet href="plugin-styles.css"><style>body{margin:0}</style></head><body class="theme-light"><div class="workspace-leaf-content" style="width:640px;border:1px solid #ccc"><div class="view-content" id="pane" style="padding:12px"></div></div><script src="harness-smoke9.js"></script></body></html>`;
const out: any = {};
const p = await openPage({ dir: here, width: 700, height: 700, pageHtml: page, routes: {} });
try {
  await p.ev(`window.__mount(document.getElementById('pane'))`);
  const opacity = `(() => { const h = document.querySelector('.forge-rhythm-score-host'); return h ? { opacity: getComputedStyle(h).opacity, stale: h.classList.contains(window.__STALE), busy: document.querySelector('.forge-rhythm-edit-score').getAttribute('aria-busy') } : null; })()`;
  await p.ev(`window.__area.showNow({n:1}); 0`); await sleep(100); await p.ev(`window.__gate.release(); 0`); await sleep(200);
  out.firstScore = await p.ev(opacity);
  await p.shot(path.join(SHOTS, 'smoke9-0-current.png'));
  await p.ev(`window.__area.update({n:2}); 0`);                                  // the data changed: the score on screen is stale AT ONCE, before the debounce (50 ms) and the engine
  out.staleAtOnce = await p.ev(opacity);
  await sleep(150);
  out.staleWhileRendering = await p.ev(opacity);
  await p.shot(path.join(SHOTS, 'smoke9-1-stale.png'));
  await p.ev(`window.__gate.release(); 0`); await sleep(300);
  out.replaced = await p.ev(opacity);
  out.hostCount = await p.ev(`document.querySelectorAll('.forge-rhythm-score-host').length`);
  // (b) the pin line
  out.pinHidden = await p.ev(`(() => { const e = document.getElementById('pin'); return { display: getComputedStyle(e).display }; })()`);
  await p.ev(`(() => { const e = document.getElementById('pin'); e.textContent = 'Notes pane: rock \\u00b7 bar_001'; e.style.display = ''; })()`);
  out.pinShown = await p.ev(`(() => { const e = document.getElementById('pin'); const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return { display: s.display, color: s.color, fontSize: s.fontSize, w: r.width, h: r.height, clipped: e.scrollWidth > e.clientWidth + 1, text: e.textContent }; })()`);
  await p.shot(path.join(SHOTS, 'smoke9-2-pin-line.png'));
  // (c) the notebook hint and Esc, with a REAL click and a REAL key
  const centre = (i: number) => p.ev(`(() => { const b = document.querySelectorAll('.forge-notebook-bar')[${i}]; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = (type: string, x: number, y: number) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  const hint = `(() => { const h = document.querySelector('.forge-notebook-hint'); const r = h.getBoundingClientRect(); return { text: h.textContent, shown: r.height > 0 && getComputedStyle(h).display !== 'none', clipped: h.scrollWidth > h.clientWidth + 1, h: r.height }; })()`;
  out.hintBefore = await p.ev(hint);
  const c2 = await centre(2); await mouse('mousePressed', c2.x, c2.y); await mouse('mouseReleased', c2.x, c2.y); await sleep(100);
  out.hintAfterPick = await p.ev(hint);
  out.pressedAfterPick = await p.ev(`[...document.querySelectorAll('.forge-notebook-bar')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)`);
  await p.shot(path.join(SHOTS, 'smoke9-3-picked.png'));
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(100);
  out.pressedAfterEsc = await p.ev(`[...document.querySelectorAll('.forge-notebook-bar')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)`);
  out.hintAfterEsc = await p.ev(hint);
  const near = (a: string, b: number) => Math.abs(Number(a) - b) < 0.01;
  out.verdicts = {
    firstScoreCurrent: out.firstScore?.opacity === '1' && out.firstScore?.stale === false && out.firstScore?.busy === null,
    staleAtOnce: out.staleAtOnce?.stale === true && out.staleAtOnce?.busy === 'true',
    staleIsDimmed: near(out.staleWhileRendering?.opacity, 0.45) && out.staleWhileRendering?.stale === true,
    replacedIsCurrent: out.replaced?.opacity === '1' && out.replaced?.stale === false && out.replaced?.busy === null && out.hostCount === 1,
    pinLineHiddenThenShown: out.pinHidden?.display === 'none' && out.pinShown?.display !== 'none' && out.pinShown?.h > 0 && out.pinShown?.clipped === false && out.pinShown?.text === 'Notes pane: rock · bar_001',
    hintStaysAndSaysHowToUndo: out.hintAfterPick?.shown === true && /Esc clears the selection/.test(out.hintAfterPick?.text ?? '') && out.hintAfterPick?.clipped === false && /3/.test((out.pressedAfterPick ?? []).join('')),
    escClears: (out.pressedAfterEsc ?? ['x']).length === 0 && /Select bars/.test(out.hintAfterEsc?.text ?? ''),
  };
  fs.writeFileSync(path.join(here, 'smoke9-measurements.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.verdicts, null, 2));
  if (!Object.values(out.verdicts).every(Boolean)) process.exitCode = 1;
} finally { await p.close?.(); }
