// 2026-11-13-1216, three games 2026-11-15-1219, levels 2026-11-15-2099 - the ear gadget (interval_ear.html) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
// Input.dispatchMouseEvent at the real box of each control, found by asking the page: the sandboxed iframe is not in the DevTools DOM tree), the oscillators the real Web Audio graph is asked for (20 per note: the first of each is the pitch),
// the CONTENT HEIGHT of each gadget at each width (the body's own height: no fixed height, no margin), no horizontal scroll, and light and dark shots (no gadget has a dark theme: dark = the same page under prefers-color-scheme: dark).
//   node scripts/dev/measure-ear-gadget.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/shots')).replace(/^~/, os.homedir());
const HTML = path.join(VAULT, 'music_instruments/resources/html');
fs.mkdirSync(OUT, { recursive: true });
const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext, n = 0;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value, t: t }, '*'); return s(t); }; return o; } };
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(HTML, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:700px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__t = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) { window.__hz.push(+d.hz.toFixed(2)); window.__t.push(+d.t); } if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 10); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 760, pageHtml: host });
  await sleep(700);
  const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
  const centre = async (sel) => { const r = await probe(`(function () { var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible ${sel}`); return r; };
  const press = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(150); };
  const height = () => probe(`Math.ceil(document.body.getBoundingClientRect().height)`);
  const overflow = () => probe(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  const shot = async (name, h) => {
    for (const scheme of ['light', 'dark']) {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(120);
      await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width, height: h });
    }
  };
  const setHeight = (h) => page.ev(`document.getElementById('f').style.height = '${h}px'`);
  const noScroll = () => probe(`document.documentElement.scrollHeight - document.documentElement.clientHeight`);
  return { page, probe, press, height, overflow, shot, setHeight, noScroll, hz: () => page.ev('window.__hz.slice()'), times: () => page.ev('window.__t.slice()'), clear: () => page.ev('window.__hz.length = 0; window.__t.length = 0'), errs: () => page.ev('window.__err.slice()') };
}
const verdict = {}; const numbers = {};
const notes = (hz) => hz.filter((_, i) => i % 20 === 0);                                    // the first oscillator of each note is its pitch
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
const keyBox = (g, m) => g.press(`.key[data-midi="${m}"]`);
const status = (g) => g.probe(`JSON.stringify({ first: [].map.call(document.querySelectorAll('.key.first'), function (k) { return +k.getAttribute('data-midi'); }), right: [].map.call(document.querySelectorAll('.key.right'), function (k) { return +k.getAttribute('data-midi'); }), wrong: [].map.call(document.querySelectorAll('.key.wrong'), function (k) { return +k.getAttribute('data-midi'); }), hint: document.getElementById('hint').textContent, arcs: document.querySelectorAll('.arc').length, replayOff: document.getElementById('replay').disabled, cells: document.querySelectorAll('.cell, [data-key]').length, counter: document.getElementById('counter').textContent, board: document.getElementById('board').textContent, sr: document.getElementById('sr').textContent, game: [1, 2, 3].filter(function (n) { return document.getElementById('game-' + n).getAttribute('aria-pressed') === 'true'; })[0], level: ['easy', 'medium', 'hard'].filter(function (n) { return document.getElementById('level-' + n).getAttribute('aria-pressed') === 'true'; })[0] })`).then(JSON.parse);
const ask = async (g) => { await g.clear(); await g.press('#next'); await sleep(350); const hz = notes(await g.hz()).map(midiOf); return { lit: hz[0], targets: hz.slice(1) }; };
const wrongKey = (q, skip = []) => { for (let m = 48; m <= 72; m++) if (m !== q.lit && !q.targets.includes(m) && !skip.includes(m)) return m; };
const ATT = { 1: { easy: 5, medium: 3, hard: 1 }, 2: { easy: 5, medium: 3, hard: 1 }, 3: { easy: 6, medium: 4, hard: 2 } };
const word = (n) => `${n} ${n === 1 ? 'attempt' : 'attempts'} left`;
const heights = {}; const allHeights = new Set();
for (const width of [800, 360]) {
  const g = await mount('interval_ear.html', width);
  try {
    verdict[`ear${width}_noHorizontalScroll`] = (await g.overflow()) <= 0;
    let s = await status(g);
    verdict[`ear${width}_idle`] = s.hint === 'Press Next' && s.first.length === 0 && s.replayOff === true && s.cells === 0 && s.counter === 'Medium: score 0 of 0 asked' && s.board === 'Easy 0/0 · Medium 0/0 · Hard 0/0' && s.game === 1 && s.level === 'medium';
    // every game x level x state: the content height, and no vertical scroll when the embed is exactly that tall
    for (const game of [1, 2, 3]) for (const level of ['easy', 'medium', 'hard']) {
      await g.press(`#game-${game}`); await g.press(`#level-${level}`);
      const key = `g${game}_${level}`; const hs = [];
      const measure = async (label) => { const h = await g.height(); hs.push(h); allHeights.add(h); await g.setHeight(h); const sc = await g.noScroll(); verdict[`ear${width}_${key}_${label}_noVerticalScroll`] = sc <= 0; await g.setHeight(700); };
      await measure('idle');
      let q = await ask(g); s = await status(g);
      verdict[`ear${width}_${key}_attempts`] = s.hint === word(ATT[game][level]) && s.first.join() === String(q.lit) && s.right.length === 0 && s.cells === 0;
      await measure('asked');
      /* a wrong guess first, only where the answer can still be found afterwards (game 3 hard has two attempts for two notes) */ if (ATT[game][level] - 1 >= q.targets.length) { await keyBox(g, wrongKey(q)); await sleep(150); s = await status(g); verdict[`ear${width}_${key}_wrongGuessUsesOneAttemptNoReveal`] = s.hint === word(ATT[game][level] - 1) && s.wrong.length === 1 && s.right.length === 0 && s.arcs === 0; await measure('oneWrong'); }
      // finish: the right keys
      for (const t of q.targets) { await keyBox(g, t); await sleep(120); }
      s = await status(g); verdict[`ear${width}_${key}_solvedScores`] = s.right.length === q.targets.length && /score 1 of 1 asked/.test(s.counter) && s.hint === 'Press Next';
      await measure('solved');
      if (game === 1 && level === 'medium' && width === 800) await g.shot('ear-g1-medium-solved', await g.height());
      // run out of attempts: wrong guesses until over
      q = await ask(g); const skip = []; let over = false;
      for (let i = 0; i < ATT[game][level] && !over; i++) { const w = wrongKey(q, skip); skip.push(w); await keyBox(g, w); await sleep(120); s = await status(g); over = s.sr.startsWith('Out of attempts'); }
      s = await status(g); verdict[`ear${width}_${key}_runOutRevealsAndScoresNothing`] = over && s.right.length === q.targets.length && /score 1 of 2 asked/.test(s.counter);
      await measure('gaveUp');
      if (width === 800 && ((game === 1 && level === 'hard') || (game === 3 && level === 'medium'))) await g.shot(`ear-g${game}-${level}-given-up`, await g.height());
      heights[key] = hs;
    }
    // game 3 specifics at the edge: hard needs both notes in exactly two guesses
    await g.press('#game-3'); await g.press('#level-hard'); let q3 = await ask(g); await keyBox(g, q3.targets[0]); await sleep(120); await keyBox(g, wrongKey(q3)); await sleep(120); s = await status(g);
    verdict[`ear${width}_g3_hard_rightThenMissGivesUp`] = s.sr.startsWith('Out of attempts') && s.right.length === 2;
    // level change: ends every open question, keeps each level's score
    await g.press('#game-1'); await g.press('#level-medium'); const qq = await ask(g); await g.press('#level-easy'); s = await status(g);
    verdict[`ear${width}_levelChangeEndsOpenQuestionKeepsScores`] = s.first.length === 0 && s.hint === 'Press Next' && /Easy: score 1 of 2 asked/.test(s.counter) && s.board.includes('Medium 1/3') && qq.targets.length === 1;
    // Reset clears the current game only
    await g.press('#game-2'); const before2 = (await status(g)).board; await g.press('#game-1'); await g.press('#reset'); s = await status(g);
    verdict[`ear${width}_resetClearsOnlyThisGame`] = s.board === 'Easy 0/0 · Medium 0/0 · Hard 0/0' && (await (async () => { await g.press('#game-2'); return (await status(g)).board === before2; })());
    // a real-random run: 40 questions of game 1 on medium, answered right: the score counts them
    await g.press('#game-1'); await g.press('#level-medium'); let n = 0, outside = 0;
    for (let i = 0; i < 40; i++) { const t = await ask(g); if (t.lit < 48 || t.targets[0] > 72 || t.targets[0] < 48) outside++; await keyBox(g, t.targets[0]); n++; }
    s = await status(g); verdict[`ear${width}_run40`] = outside === 0 && /score 40 of 40 asked/.test(s.counter);
    verdict[`ear${width}_noErrors`] = (await g.errs()).length === 0;
    verdict[`ear${width}_noHorizontalScrollAtTheEnd`] = (await g.overflow()) <= 0;
  } finally { g.page.close(); }
  const flat = Object.values(heights).flat();
  numbers[`ear_${width}_content_height_min_max`] = [Math.min(...flat), Math.max(...flat)];
  verdict[`ear${width}_oneHeightInEveryGameLevelAndState`] = new Set(flat).size === 1;
  numbers[`ear_${width}_distinct_heights`] = [...new Set(flat)];
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
