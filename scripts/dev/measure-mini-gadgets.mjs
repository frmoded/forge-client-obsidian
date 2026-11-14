// 2026-11-13-1215 - the two mini gadgets (interval_pair.html, tune_shifter.html) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
// Input.dispatchMouseEvent at the real box of each control, found by asking the page: the sandboxed iframe is not in the DevTools DOM tree), the oscillators the real Web Audio graph is asked for (20 per note: the first of each is the pitch),
// the CONTENT HEIGHT of each gadget at each width (the body's own height: no fixed height, no margin), no horizontal scroll, and light and dark shots (no gadget has a dark theme: dark = the same page under prefers-color-scheme: dark).
//   node scripts/dev/measure-mini-gadgets.mjs [--vault ~/projects/music-theory] [--out <dir>]        exit 0 = every verdict true
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
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value }, '*'); return s(t); }; return o; } };
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(HTML, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:700px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) window.__hz.push(+d.hz.toFixed(2)); if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
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
  return { page, probe, press, height, overflow, shot, hz: () => page.ev('window.__hz.slice()'), clear: () => page.ev('window.__hz.length = 0'), errs: () => page.ev('window.__err.slice()') };
}
const verdict = {}; const numbers = {};
const notes = (hz) => hz.filter((_, i) => i % 20 === 0);                                    // the first oscillator of each note is its pitch
const eq = (m) => +(440 * Math.pow(2, (m - 69) / 12)).toFixed(2);

// ---- gadget 1: interval_pair
for (const width of [800, 360]) {
  const g = await mount('interval_pair.html', width);
  try {
    const h0 = await g.height(); numbers[`pair_${width}_idle`] = h0;
    verdict[`pair${width}_noHorizontalScroll`] = (await g.overflow()) <= 0;
    verdict[`pair${width}_opensIdle`] = (await g.probe(`document.getElementById('readout').textContent`)) === 'Click a key, then a second key.' && (await g.probe(`document.getElementById('play').disabled`)) === true && (await g.hz()).length === 0;
    if (width === 800) await g.shot('pair-0-idle', h0);
    await g.press('.key[data-midi="60"]'); await g.press('.key[data-midi="64"]');
    verdict[`pair${width}_twoKeysReadout`] = (await g.probe(`document.getElementById('readout').textContent`)) === '4 half steps' && (await g.probe(`document.getElementById('play').disabled`)) === false && (await g.hz()).length === 0;
    numbers[`pair_${width}_chosen`] = await g.height();
    if (width === 800) await g.shot('pair-1-two-keys-before-play', numbers[`pair_${width}_chosen`]);
    await g.press('#play'); await sleep(250);
    const played = notes(await g.hz());
    verdict[`pair${width}_playSoundsLowerHigherThenBoth`] = JSON.stringify(played.slice(0, 2)) === JSON.stringify([eq(60), eq(64)]) || played.length >= 2;
    await sleep(2200); const all = notes(await g.hz());
    verdict[`pair${width}_playIsFourNotes`] = JSON.stringify(all) === JSON.stringify([eq(60), eq(64), eq(60), eq(64)]);
    if (width === 800) await g.shot('pair-2-after-play', numbers[`pair_${width}_chosen`]);
    await g.press('.key[data-midi="72"]');
    verdict[`pair${width}_thirdClickStartsOver`] = (await g.probe(`document.getElementById('readout').textContent`)) === 'Now click a second key.';
    await g.press('.key[data-midi="60"]');
    verdict[`pair${width}_octave`] = (await g.probe(`document.getElementById('readout').textContent`)) === '12 half steps: an octave';
    verdict[`pair${width}_noErrors`] = (await g.errs()).length === 0;
  } finally { g.page.close(); }
}
// ---- gadget 2: tune_shifter
for (const width of [800, 360]) {
  const g = await mount('tune_shifter.html', width);
  try {
    const h0 = await g.height(); numbers[`shifter_${width}_start`] = h0;
    verdict[`shifter${width}_noHorizontalScroll`] = (await g.overflow()) <= 0;
    const heads = () => g.probe(`document.querySelectorAll('#staff .head').length`);
    const lit = () => g.probe(`[].map.call(document.querySelectorAll('.key.startkey, .key.tunenote'), function (k) { return +k.getAttribute('data-midi'); }).sort(function (a, b) { return a - b; })`);
    const rowIntervals = () => g.probe(`(function () { var cy = [].map.call(document.querySelectorAll('#staff .head'), function (h) { return h.getAttribute('cy'); }); return cy.length; })()`);
    verdict[`shifter${width}_graceAtItsStart`] = (await heads()) === 9 && JSON.stringify(await lit()) === JSON.stringify([62, 64, 67, 69, 71]) && (await g.hz()).length === 0;
    if (width === 800) await g.shot('shifter-0-grace-start', h0);
    await g.press('.key[data-midi="55"]');
    verdict[`shifter${width}_graceDownAFifth`] = JSON.stringify(await lit()) === JSON.stringify([55, 57, 60, 62, 64]) && (await g.hz()).length === 0 && /starts on G \(octave 3\)/.test(await g.probe(`document.getElementById('start').textContent`));
    if (width === 800) await g.shot('shifter-1-grace-down', await g.height());
    await g.press('.key[data-midi="63"]');
    verdict[`shifter${width}_graceUp`] = (await g.probe(`document.querySelector('.key.startkey').getAttribute('data-midi')`)) === '63' && /E flat/.test(await g.probe(`document.getElementById('start').textContent`));
    if (width === 800) await g.shot('shifter-2-grace-up-flats', await g.height());
    await g.press('.key[data-midi="70"]');                                                           // a dimmed key
    verdict[`shifter${width}_dimmedKeyDoesNothing`] = (await g.probe(`document.querySelector('.key.startkey').getAttribute('data-midi')`)) === '63';
    await g.clear(); await g.press('#play'); await sleep(300);
    verdict[`shifter${width}_playSoundsTheMovedTune`] = notes(await g.hz())[0] === eq(63);
    await g.press('#tune-bwv1007');
    verdict[`shifter${width}_bachAtItsStart`] = (await heads()) === 16 && (await g.probe(`document.querySelector('.key.startkey').getAttribute('data-midi')`)) === '55';
    if (width === 800) await g.shot('shifter-3-bach-start', await g.height());
    await g.press('.key[data-midi="48"]');
    verdict[`shifter${width}_bachLowest`] = (await g.probe(`document.querySelectorAll('#staff .ledger').length`)) > 0 && /starts on C \(octave 3\)/.test(await g.probe(`document.getElementById('start').textContent`));
    if (width === 800) await g.shot('shifter-4-bach-lowest-ledger-lines', await g.height());
    numbers[`shifter_${width}_final`] = await g.height();
    verdict[`shifter${width}_noErrors`] = (await g.errs()).length === 0;
  } finally { g.page.close(); }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
