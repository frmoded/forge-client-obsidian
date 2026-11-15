// 2026-11-13-1216, three games and a score 2026-11-15-1219 - the ear gadget (interval_ear.html) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
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
  return { page, probe, press, height, overflow, shot, hz: () => page.ev('window.__hz.slice()'), times: () => page.ev('window.__t.slice()'), clear: () => page.ev('window.__hz.length = 0; window.__t.length = 0'), errs: () => page.ev('window.__err.slice()') };
}
const verdict = {}; const numbers = {};
const notes = (hz) => hz.filter((_, i) => i % 20 === 0);                                    // the first oscillator of each note is its pitch
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
const keyBox = (g, m) => g.press(`.key[data-midi="${m}"]`);
const status = (g) => g.probe(`JSON.stringify({ first: [].map.call(document.querySelectorAll('.key.first'), function (k) { return +k.getAttribute('data-midi'); }), right: [].map.call(document.querySelectorAll('.key.right'), function (k) { return +k.getAttribute('data-midi'); }), wrong: [].map.call(document.querySelectorAll('.key.wrong'), function (k) { return +k.getAttribute('data-midi'); }), hint: document.getElementById('hint').textContent, arcs: document.querySelectorAll('.arc').length, replayOff: document.getElementById('replay').disabled, cells: document.querySelectorAll('.cell').length, found: document.querySelectorAll('.cell.found').length, firsts: document.querySelectorAll('.cell.first').length, counter: document.getElementById('counter').textContent, sr: document.getElementById('sr').textContent, pressed: [1, 2, 3].filter(function (n) { return document.getElementById('game-' + n).getAttribute('aria-pressed') === 'true'; })[0] })`).then(JSON.parse);
const ask = async (g) => { await g.clear(); await g.press('#next'); await sleep(350); const hz = notes(await g.hz()).map(midiOf); const t = await g.times(); return { lit: hz[0], targets: hz.slice(1), together: hz.length > 1 && t.slice(0, hz.length * 20).every((x, i) => i < 20 || Math.abs(x - t[0]) < 1e-6), gap: hz.length > 1 ? +(t[20] - t[0]).toFixed(2) : 0 }; };
const wrongKey = (q, skip = []) => { for (let m = 48; m <= 72; m++) if (m !== q.lit && !q.targets.includes(m) && !skip.includes(m)) return m; };
const NAMES = { 1: 'ear1', 2: 'ear2', 3: 'ear3' };
for (const width of [800, 360]) {
  const g = await mount('interval_ear.html', width);
  try {
    const hIdle = {}, hAsked = {}, hOver = {};
    verdict[`ear${width}_noHorizontalScroll_idle`] = (await g.overflow()) <= 0;
    let s = await status(g);
    verdict[`ear${width}_idle`] = s.hint === 'Press Next' && s.first.length === 0 && s.replayOff === true && (await g.hz()).length === 0 && s.cells === 24 && s.counter === 'found 0 of 24' && s.pressed === 1;
    // ---------- game 1
    hIdle[1] = await g.height(); if (width === 800) await g.shot('ear-1-0-idle', hIdle[1]);
    await keyBox(g, 60); verdict[`ear${width}_g1_clickWhileIdleDoesNothing`] = (await g.hz()).length === 0 && (await status(g)).first.length === 0;
    let q = await ask(g); s = await status(g);
    verdict[`ear${width}_g1_nextLightsOnlyTheFirst`] = s.first.join() === String(q.lit) && s.right.length === 0 && s.wrong.length === 0 && q.targets.length === 1 && q.gap === 0.6;
    hAsked[1] = await g.height();
    await g.clear(); await g.press('#replay'); await sleep(300);
    verdict[`ear${width}_g1_replayRevealsNothing`] = notes(await g.hz()).length === 2 && (await status(g)).right.length === 0;
    const w1 = wrongKey(q); await g.clear(); await keyBox(g, w1); await sleep(250); s = await status(g);
    verdict[`ear${width}_g1_oneWrongGuessDoesNotReveal`] = s.wrong.join() === String(w1) && s.right.length === 0 && s.arcs === 0 && s.hint === '2 tries left' && s.found === 0 && notes(await g.hz()).map(midiOf).join() === String(w1);
    verdict[`ear${width}_g1_statusNeverNamesTheAnswer`] = !new RegExp(`\\b${['C','D flat','D','E flat','E','F','G flat','G','A flat','A','B flat','B'][q.targets[0] % 12]} ${Math.floor(q.targets[0] / 12) - 1}\\b`).test(s.sr);
    if (width === 800) await g.shot('ear-1-1-one-wrong-guess', await g.height());
    await keyBox(g, q.targets[0]); await sleep(250); s = await status(g);
    verdict[`ear${width}_g1_findOnTry2Scores`] = s.right.join() === String(q.targets[0]) && s.arcs === 1 && s.found === 1 && s.firsts === 0 && s.counter === 'found 1 of 24';
    hOver[1] = await g.height(); if (width === 800) await g.shot('ear-1-2-found-on-try-2', hOver[1]);
    q = await ask(g); await keyBox(g, q.targets[0]); await sleep(200); s = await status(g);
    verdict[`ear${width}_g1_findOnTry1IsMarkedFirstTry`] = s.found === 2 && s.firsts === 1;
    q = await ask(g); const a = wrongKey(q), b = wrongKey(q, [a]), c = wrongKey(q, [a, b]); await keyBox(g, a); await keyBox(g, b); await g.clear(); await keyBox(g, c); await sleep(300); s = await status(g);
    verdict[`ear${width}_g1_threeWrongGuessesRevealAndScoreNothing`] = s.right.join() === String(q.targets[0]) && s.wrong.length === 3 && s.arcs === 1 && s.found === 2 && notes(await g.hz()).length === 2;
    if (width === 800) await g.shot('ear-1-3-given-up', await g.height());
    // ---------- game 2
    await g.press('#game-2'); await sleep(150); s = await status(g);
    verdict[`ear${width}_g2_ownScoreboard`] = s.pressed === 2 && s.cells === 12 && s.counter === 'found 0 of 12' && s.first.length === 0 && s.hint === 'Press Next';
    hIdle[2] = await g.height(); if (width === 800) await g.shot('ear-2-0-idle', hIdle[2]);
    q = await ask(g); s = await status(g);
    verdict[`ear${width}_g2_twoTogetherOnlyTheLowerLit`] = q.together && q.targets.length === 1 && q.targets[0] > q.lit && s.first.join() === String(q.lit) && s.right.length === 0;
    hAsked[2] = await g.height();
    const w2 = wrongKey(q); await keyBox(g, w2); await sleep(200); s = await status(g);
    verdict[`ear${width}_g2_oneWrongGuessDoesNotReveal`] = s.right.length === 0 && s.wrong.join() === String(w2) && s.hint === '2 tries left';
    if (width === 800) await g.shot('ear-2-1-one-wrong-guess', await g.height());
    await keyBox(g, q.targets[0]); await sleep(250); s = await status(g);
    verdict[`ear${width}_g2_find`] = s.right.join() === String(q.targets[0]) && s.found === 1 && s.counter === 'found 1 of 12' && s.arcs === 1;
    hOver[2] = await g.height(); if (width === 800) await g.shot('ear-2-2-found', hOver[2]);
    // ---------- game 3
    await g.press('#game-3'); await sleep(150); s = await status(g);
    verdict[`ear${width}_g3_ownScoreboard`] = s.pressed === 3 && s.cells === 4 && s.counter === 'found 0 of 4';
    verdict[`ear${width}_g3_cellLabels`] = JSON.stringify(await g.probe(`[].map.call(document.querySelectorAll('.cell'), function (c) { return c.textContent.trim(); })`)) === JSON.stringify(['+4 +7', '+3 +7', '+3 +6', '+4 +8']);
    hIdle[3] = await g.height(); if (width === 800) await g.shot('ear-3-0-idle', hIdle[3]);
    q = await ask(g); s = await status(g);
    verdict[`ear${width}_g3_threeTogetherOnlyTheLowestLit`] = q.together && q.targets.length === 2 && q.targets.every((t) => t > q.lit) && s.first.join() === String(q.lit) && s.right.length === 0;
    hAsked[3] = await g.height();
    await keyBox(g, q.targets[1]); await sleep(200); const w3 = wrongKey(q); await keyBox(g, w3); await sleep(200); s = await status(g);
    verdict[`ear${width}_g3_midQuestion`] = s.right.join() === String(q.targets[1]) && s.wrong.join() === String(w3) && s.hint === '2 tries left' && s.found === 0 && s.arcs === 0;
    if (width === 800) await g.shot('ear-3-1-mid-question', await g.height());
    await keyBox(g, q.targets[0]); await sleep(250); s = await status(g);
    verdict[`ear${width}_g3_bothFoundAnyOrder`] = s.right.length === 2 && s.found === 1 && s.firsts === 0 && s.counter === 'found 1 of 4';
    hOver[3] = await g.height(); if (width === 800) await g.shot('ear-3-2-found', hOver[3]);
    q = await ask(g); const x1 = wrongKey(q), x2 = wrongKey(q, [x1]), x3 = wrongKey(q, [x1, x2]); await keyBox(g, x1); await keyBox(g, x2); await g.clear(); await keyBox(g, x3); await sleep(300); s = await status(g);
    verdict[`ear${width}_g3_threeMissesRevealAndScoreNothing`] = s.right.length === 2 && s.wrong.length === 3 && s.found === 1 && notes(await g.hz()).length === 3;
    if (width === 800) await g.shot('ear-3-3-given-up', await g.height());
    // ---------- switching keeps each game's score; Reset score clears only the current game
    await g.press('#game-1'); s = await status(g); const k1 = s.counter; await g.press('#game-2'); s = await status(g); const k2 = s.counter; await g.press('#game-3'); s = await status(g);
    verdict[`ear${width}_switchKeepsScores`] = k1 === 'found 2 of 24' && k2 === 'found 1 of 12' && s.counter === 'found 1 of 4';
    await g.press('#reset'); s = await status(g); await g.press('#game-1'); const s1 = await status(g);
    verdict[`ear${width}_resetClearsOnlyThisGame`] = s.found === 0 && s1.counter === 'found 2 of 24';
    // ---------- a player who answers every game-1 question right fills the 24-cell board in 24 questions, with real random
    await g.press('#reset'); let n = 0, repeats = 0, prev = null, outside = 0;
    while (n < 60) { const qq = await ask(g); const d = qq.targets[0] - qq.lit; if (d === prev) repeats++; prev = d; if (qq.lit < 48 || qq.targets[0] > 72 || qq.targets[0] < 48) outside++; await keyBox(g, qq.targets[0]); n++; if ((await status(g)).counter === 'all found') break; }
    verdict[`ear${width}_g1_allFoundIn24Questions`] = n === 24; numbers[`ear_${width}_g1_questions_to_all_found`] = n;
    verdict[`ear${width}_g1_noRepeatNoneOutside`] = repeats === 0 && outside === 0;
    if (width === 800) await g.shot('ear-1-4-all-found', await g.height());
    await g.press('#game-2'); n = 0; await g.press('#reset'); while (n < 60) { const qq = await ask(g); await keyBox(g, qq.targets[0]); n++; if ((await status(g)).counter === 'all found') break; }
    verdict[`ear${width}_g2_allFoundIn12Questions`] = n === 12;
    await g.press('#game-3'); n = 0; await g.press('#reset'); while (n < 60) { const qq = await ask(g); await keyBox(g, qq.targets[0]); await keyBox(g, qq.targets[1]); n++; if ((await status(g)).counter === 'all found') break; }
    verdict[`ear${width}_g3_allFoundIn4Questions`] = n === 4;
    verdict[`ear${width}_noHorizontalScroll_end`] = (await g.overflow()) <= 0;
    verdict[`ear${width}_noErrors`] = (await g.errs()).length === 0;
    for (const k of [1, 2, 3]) numbers[`ear_${width}_game${k}_height_idle_asked_over`] = [hIdle[k], hAsked[k], hOver[k]];
    numbers[`ear_${width}_max`] = Math.max(...[1, 2, 3].flatMap((k) => [hIdle[k], hAsked[k], hOver[k]]));
    for (const k of [1, 2, 3]) numbers[`ear_${width}_game${k}_max`] = Math.max(hIdle[k], hAsked[k], hOver[k]);
  } finally { g.page.close(); }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
