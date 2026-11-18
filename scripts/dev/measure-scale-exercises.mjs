// 2026-11-17-2003 (2026-11-18-0930: the three FULL files only; scale_build_major and _natural_minor are the SIMPLE variant, measured by scripts/dev/measure-scale-build-simple.mjs) - the SCALE EXERCISE widgets (_modes_and_minor, _other_scales, scale_ear_build_the_scale) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px
// and at 360 px wide. Measured: the CONTENT HEIGHT of each file (the body's own height) in every state for EVERY scale of the file on all twelve tonics (fresh, half built, built, out of wrong taps), that it is ONE height, that the page
// does not scroll vertically when the iframe is exactly that tall, and not horizontally; one full exercise per file with REAL mouse clicks (DevTools Input.dispatchMouseEvent at the real box of each key): a right key lights and puts a head
// on the staff, a wrong key marks and puts none, the end shows the letters and the whole and half steps, Play sounds every note of the scale with the real Web Audio graph; light and dark shots (no gadget has a dark theme: dark = the same page).
//   node scripts/dev/measure-scale-exercises.mjs [--vault ~/projects/music-theory] [--out <dir>] [--only <file fragment>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/scale-exercises')).replace(/^~/, os.homedir());
const only = arg('--only', '');
fs.mkdirSync(OUT, { recursive: true });
const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value, t: t }, '*'); return s(t); }; return o; } };
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
async function mount(file, width) {
  const served = fs.readFileSync(path.join(VAULT, file), 'utf8').replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:900px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) window.__hz.push(+d.hz.toFixed(2)); if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 5); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 960, pageHtml: host });
  await sleep(700);
  const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
  const centre = async (sel) => { const r = await probe(`(function () { var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible ${sel}`); return r; };
  const press = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(120); };
  return {
    page, probe, press,
    height: () => probe('Math.ceil(document.body.getBoundingClientRect().height)'),
    hOverflow: () => probe('document.documentElement.scrollWidth - document.documentElement.clientWidth'),
    setHeight: (h) => page.ev(`document.getElementById('f').style.height = '${h}px'`),
    vScroll: () => probe('document.documentElement.scrollHeight - document.documentElement.clientHeight'),
    hz: () => page.ev('window.__hz.slice()'), clearHz: () => page.ev('window.__hz.length = 0'), errs: () => page.ev('window.__err.slice()'),
    shot: async (name, h) => { for (const scheme of ['light', 'dark']) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(120); await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width, height: h }); } },
  };
}
const FILES = [
  { file: 'scales/resources/html/scale_build_modes_and_minor.html', scales: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'natural_minor', 'harmonic_minor', 'melodic_minor'] },
  { file: 'scales/resources/html/scale_build_other_scales.html', scales: ['major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'] },
  { file: 'scales/resources/html/scale_ear_build_the_scale.html', scales: ['major', 'natural_minor', 'harmonic_minor', 'dorian', 'mixolydian', 'major_pentatonic', 'minor_pentatonic'] },
];
const verdict = {}, numbers = { heights: {}, combos: {} };
// the page's own model of the exercise on screen, read from its DOM (the keys that are the scale are not in the DOM before the end: ask the pure core, which the page exports nowhere; so derive the midis from the player's recipe table)
const STEPS = { major: [2, 2, 1, 2, 2, 2, 1], natural_minor: [2, 1, 2, 2, 1, 2, 2], harmonic_minor: [2, 1, 2, 2, 1, 3, 1], melodic_minor: [2, 1, 2, 2, 2, 2, 1], ionian: [2, 2, 1, 2, 2, 2, 1], dorian: [2, 1, 2, 2, 2, 1, 2], phrygian: [1, 2, 2, 2, 1, 2, 2], lydian: [2, 2, 2, 1, 2, 2, 1], mixolydian: [2, 2, 1, 2, 2, 1, 2], aeolian: [2, 1, 2, 2, 1, 2, 2], locrian: [1, 2, 2, 1, 2, 2, 2], major_pentatonic: [2, 2, 3, 2, 3], minor_pentatonic: [3, 2, 2, 3, 2], blues: [3, 2, 1, 1, 3, 2], whole_tone: [2, 2, 2, 2, 2, 2], diminished_wh: [2, 1, 2, 1, 2, 1, 2, 1], diminished_hw: [1, 2, 1, 2, 1, 2, 1, 2] };
const midisOf = (tonic, id) => { const out = [60 + tonic]; for (const s of STEPS[id]) out.push(out[out.length - 1] + s); return out; };
for (const f of FILES.filter((x) => !only || x.file.includes(only))) {
  const name = path.basename(f.file, '.html'); numbers.heights[name] = {};
  for (const width of [800, 360]) {
    const g = await mount(f.file, width); const hs = new Set(); let combos = 0;
    const click = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()`);
    const choose = (id, v) => g.probe(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const sample = async (label) => { const h = await g.height(); hs.add(h); if ((await g.hOverflow()) > 0) verdict[`${name}${width}_${label}_horizontalScroll`] = false; return h; };
    verdict[`${name}${width}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await sample('fresh');
    await g.setHeight(h0); verdict[`${name}${width}_noVerticalScrollAtItsOwnHeight`] = (await g.vScroll()) <= 0; await g.setHeight(900);
    // every scale of the file, all twelve tonics, four states
    for (const id of f.scales) for (let t = 0; t < 12; t++) {
      await choose('scale', id); await choose('tonic', String(t)); await click('#level-hard');
      const ms = midisOf(t, id); const targets = ms.slice(1, -1);
      await sample(`${id}${t}_fresh`);
      await click('#level-medium'); await click(`.key[data-midi="${targets[0]}"]`); await sample(`${id}${t}_oneFound`);
      for (const m of targets) await click(`.key[data-midi="${m}"]`); await sample(`${id}${t}_built`);
      await click('#level-hard'); const wrongKey = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map((x) => x + 0).find((x) => !ms.includes(x) && x > ms[0] && x < ms[ms.length - 1]) ?? 83;
      await click(`.key[data-midi="${wrongKey}"]`); await sample(`${id}${t}_gaveUp`);
      combos++;
    }
    numbers.combos[`${name}@${width}`] = combos; numbers.heights[name][width] = [...hs];
    verdict[`${name}${width}_oneHeightInEveryScaleTonicAndState`] = hs.size === 1;
    await g.setHeight([...hs][0] ?? h0); verdict[`${name}${width}_noVerticalScrollAfterTheSweep`] = (await g.vScroll()) <= 0; await g.setHeight(900);
    g.page.close();
    // one full exercise with REAL mouse clicks
    const r = await mount(f.file, width); const first = f.scales[0];
    await r.probe(`(function(){ var e = document.getElementById('scale'); e.value = ${JSON.stringify(first)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const ms = midisOf(0, first), targets = ms.slice(1, -1);
    const count = (sel) => r.probe(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    verdict[`${name}${width}_realFreshOneHeadAndTonicMarked`] = (await count('#staff .head')) === 1 && (await count('.key.tonic')) === 1;
    const wrongKey = [61, 63, 66, 68, 70].find((x) => !ms.includes(x)); await r.press(`.key[data-midi="${wrongKey}"]`);
    verdict[`${name}${width}_realWrongKeyMarkedNoHead`] = (await count('.key.wrong')) === 1 && (await count('#staff .head')) === 1;
    let heads = 1, ok = true;
    for (const [i, m] of targets.entries()) { await r.press(`.key[data-midi="${m}"]`); heads++; ok = ok && (await count('#staff .head')) === (i === targets.length - 1 ? ms.length : heads); }       // the last right key ends the exercise: the whole scale is on the staff
    verdict[`${name}${width}_realEachRightKeyAddsAHead`] = ok;
    verdict[`${name}${width}_realEndShowsScaleLettersAndSteps`] = (await count('#staff .head')) === ms.length && (await count('#letters .letter')) === ms.length - 1 && (await count('#chips .chip')) === ms.length - 1 && (await r.probe(`document.getElementById('play').disabled`)) === false;
    await r.clearHz(); await r.press('#play'); await sleep(Math.round((ms.length * 0.45 + 1) * 1000));
    const hz = await r.hz(); const per = hz.length / ms.length;
    verdict[`${name}${width}_realPlaySoundsEveryNote`] = Number.isInteger(per) && per >= 1 && per <= 40 && hz.filter((_, i) => i % per === 0).map((x) => Math.round(69 + 12 * Math.log2(x / 440))).join() === ms.join();
    numbers[`${name}@${width}_hzForPlay`] = hz.length;
    await sleep(200); verdict[`${name}${width}_realNoErrors`] = (await r.errs()).length === 0;
    await r.shot(`${name}-${width}-built`, [...hs][0] ?? 400);
    await r.press('#again'); await r.shot(`${name}-${width}-fresh`, [...hs][0] ?? 400);
    r.page.close();
  }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
