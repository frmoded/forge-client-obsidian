// 2026-11-13-1216 - the ear gadget (interval_ear.html) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
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
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
const keyBox = (g, m) => g.press(`.key[data-midi="${m}"]`);
const status = (g) => g.probe(`JSON.stringify({ first: [].map.call(document.querySelectorAll('.key.first'), function (k) { return +k.getAttribute('data-midi'); }), right: [].map.call(document.querySelectorAll('.key.right'), function (k) { return +k.getAttribute('data-midi'); }), wrong: [].map.call(document.querySelectorAll('.key.wrong'), function (k) { return +k.getAttribute('data-midi'); }), hint: document.getElementById('hint').textContent, arcs: document.querySelectorAll('.arc').length, replayOff: document.getElementById('replay').disabled })`).then(JSON.parse);
for (const width of [800, 360]) {
  const g = await mount('interval_ear.html', width);
  try {
    const h0 = await g.height(); numbers[`ear_${width}_idle`] = h0;
    verdict[`ear${width}_noHorizontalScroll`] = (await g.overflow()) <= 0;
    let s = await status(g);
    verdict[`ear${width}_idle`] = s.hint === 'Press Next' && s.first.length === 0 && s.replayOff === true && (await g.hz()).length === 0;
    if (width === 800) await g.shot('ear-0-idle', h0);
    await keyBox(g, 60);
    verdict[`ear${width}_clickWhileIdleDoesNothing`] = (await g.hz()).length === 0 && (await status(g)).first.length === 0;
    await g.press('#next'); await sleep(250);
    s = await status(g); let hz = notes(await g.hz());
    verdict[`ear${width}_nextShowsOnlyTheFirstNote`] = s.first.length === 1 && s.right.length === 0 && s.wrong.length === 0 && hz.length === 2 && midiOf(hz[0]) === s.first[0];
    numbers[`ear_${width}_asked`] = await g.height();
    if (width === 800) await g.shot('ear-1-asked-one-key-lit', numbers[`ear_${width}_asked`]);
    await g.clear(); await g.press('#replay'); await sleep(250);
    const re = notes(await g.hz()); const first = s.first[0], second = midiOf(re[1]);
    verdict[`ear${width}_replayRevealsNothing`] = re.length === 2 && midiOf(re[0]) === first && (await status(g)).right.length === 0;
    // a WRONG guess first
    const wrong = [48, 49, 50, 51].find((m) => m !== second && m !== first) ?? 51;
    await g.clear(); await keyBox(g, wrong); await sleep(250);
    s = await status(g); hz = notes(await g.hz());
    verdict[`ear${width}_wrongGuessMarksBoth`] = s.right.join() === String(second) && s.wrong.join() === String(wrong) && s.first[0] === first && s.arcs === 1 && s.hint === 'Press Next';
    verdict[`ear${width}_feedbackIsGuessedThenCorrect`] = JSON.stringify(hz.map(midiOf)) === JSON.stringify([wrong, second]);
    numbers[`ear_${width}_answered`] = await g.height();
    if (width === 800) await g.shot('ear-2-answered-wrong', numbers[`ear_${width}_answered`]);
    await g.clear(); await keyBox(g, second);
    verdict[`ear${width}_secondClickDoesNothing`] = (await g.hz()).length === 0 && (await status(g)).wrong.join() === String(wrong);
    // a RIGHT guess on the next question
    await g.press('#next'); await sleep(250);
    const q2 = notes(await g.hz()).slice(-2).map(midiOf); await g.clear();
    await keyBox(g, q2[1]); await sleep(250); s = await status(g); hz = notes(await g.hz());
    verdict[`ear${width}_rightGuess`] = s.right.join() === String(q2[1]) && s.wrong.length === 0 && s.first[0] === q2[0] && hz.length === 1;
    if (width === 800) await g.shot('ear-3-answered-right', await g.height());
    // a run of 30 Nexts: real random, answered each time (a right answer, so the second note is read off the page too)
    let prev = null, repeats = 0, outside = 0, zero = 0, seen = new Set(), pageSecondOk = true;
    for (let i = 0; i < 30; i++) {
      await g.clear(); await g.press('#next'); await sleep(120);
      const h = notes(await g.hz()).map(midiOf); const a = h[0], b = h[1], iv = b - a;
      if (iv === prev) repeats++; if (iv === 0) zero++; if (a < 48 || a > 72 || b < 48 || b > 72 || Math.abs(iv) > 12) outside++;
      seen.add(iv); prev = iv;
      await keyBox(g, b); const st = await status(g); if (st.right.join() !== String(b) || st.first[0] !== a) pageSecondOk = false;
    }
    numbers[`ear_${width}_run30_distinctIntervals`] = seen.size;
    verdict[`ear${width}_run30_noRepeatedInterval`] = repeats === 0;
    verdict[`ear${width}_run30_neverZeroAllInRange`] = zero === 0 && outside === 0;
    verdict[`ear${width}_run30_pageAgreesWithSound`] = pageSecondOk;
    verdict[`ear${width}_noErrors`] = (await g.errs()).length === 0;
  } finally { g.page.close(); }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
