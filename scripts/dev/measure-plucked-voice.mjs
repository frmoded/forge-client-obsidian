// 2026-11-15-1221 - the plucked-string voice (guitar, lute, mandolin, monochord) and the piano voice in the 13 other piano gadgets, in real headless Chrome:
//   1. OfflineAudioContext renders of the voice (through plucked_voice_demo.html's own `__measure`): audible, not clipping, decays, no click at the mute, the spectral centroid higher than the old oscillator's and falling over time;
//   2. the proof behind the design: a Karplus-Strong DelayNode feedback loop in Web Audio cannot ring above about 340 Hz (the minimum loop delay is one render quantum), and an AudioWorklet from a blob URL inside the sandboxed blob iframe (what the gadgets run in);
//   3. each gadget in the SHIPPED mount (a blob: URL in <iframe sandbox="allow-scripts">) played through its own buttons, OLD (git HEAD) against NEW: the pitches asked of the audio engine are the same (the tuning math is unchanged), no page errors.
//   node scripts/dev/measure-plucked-voice.mjs [--vault ~/projects/music-theory]        exit 0 = every verdict true
import { execFileSync } from 'node:child_process';

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

const GIT = (rel) => execFileSync('git', ['-C', VAULT, 'show', `HEAD:${rel}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
async function mount(served0, width) {
  const served = served0.replace('<script>', INSTRUMENT + '<script>');
  const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:${width}px;height:700px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) window.__hz.push(d.hz); if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 10); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;
  const page = await openPage({ dir: VAULT, width: width + 20, height: 760, pageHtml: host });
  await sleep(700);
  const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
  const press = async (sel, nth = 0) => { const r = await probe(`(function () { var e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible ${sel}`); await page.click(r.x, r.y); await sleep(120); };
  return { page, probe, press, hz: () => page.ev('window.__hz.slice()'), clear: () => page.ev('window.__hz.length = 0'), errs: () => page.ev('window.__err.slice()'), width: () => probe('document.documentElement.scrollWidth - document.documentElement.clientWidth') };
}
const verdict = {}; const numbers = {};
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

console.error('phase 1');
// ---- 1. the offline renders, through the demo page's own __measure
{
  const page = await openPage({ dir: VAULT, width: 700, height: 600, pageHtml: fs.readFileSync(path.join(HTML, 'plucked_voice_demo.html'), 'utf8') });
  await sleep(500);
  const res = await page.ev('window.__measure()');
  page.close();
  for (const r of res) {
    const o = r.old, n = r.now; numbers[`render_${r.id}`] = { hz: round(r.hz, 1), new: { peak: round(n.peak), rmsEarly: round(n.rmsEarly, 4), rmsLate: round(n.rmsLate, 4), rmsRatio: round(n.rmsLate / n.rmsEarly), centroidEarly: Math.round(n.centroidEarly), centroidLate: Math.round(n.centroidLate), maxStepAfterMute: round(n.maxStepAfterMute, 5), lastSample: n.lastSample }, old: { peak: round(o.peak), rmsRatio: round(o.rmsLate / o.rmsEarly), centroidEarly: Math.round(o.centroidEarly), centroidLate: Math.round(o.centroidLate) } };
    verdict[`${r.id}_audible`] = n.peak > 0.03;
    verdict[`${r.id}_notClipping`] = n.peak < 0.95;
    verdict[`${r.id}_decays`] = n.rmsLate / n.rmsEarly < 0.8;                        // (Chrome snaps a setTarget tail to exactly 0 below about 1e-6: a short string reads 0 late, and that is a decay)
    verdict[`${r.id}_noClickAtTheMute`] = n.maxStepAfterMute < 0.01 && n.lastSample < 1e-4;
    verdict[`${r.id}_brighterThanTheOldOscillator`] = n.centroidEarly > o.centroidEarly;
    verdict[`${r.id}_centroidFallsOverTime`] = n.centroidLate < n.centroidEarly * 0.9;
    verdict[`${r.id}_oldCentroidDoesNotFall`] = Math.abs(o.centroidLate - o.centroidEarly) < 0.1 * o.centroidEarly;   // the control: the old voice has a fixed spectrum
  }
}
console.error('phase 2');
// ---- 2. the proofs behind the design
{
  const page = await openPage({ dir: VAULT, width: 700, height: 400, pageHtml: '<!doctype html><body><p>proof</p>' });
  const ks = await page.ev(`(async function () {
    var out = {};                                                                                  // one impulse into a DelayNode feedback loop (gain 0.9): the spacing of the echoes IS the loop's real delay
    for (var hz of [220, 330, 440, 880, 1760]) {
      var sr = 44100, oc = new OfflineAudioContext(1, 4096, sr), d = oc.createDelay(1), g = oc.createGain();
      d.delayTime.value = 1 / hz; g.gain.value = 0.9; d.connect(g); g.connect(d);
      var b = oc.createBuffer(1, 1, sr); b.getChannelData(0)[0] = 1;
      var src = oc.createBufferSource(); src.buffer = b; src.connect(d); d.connect(oc.destination); src.start(0);
      var x = (await oc.startRendering()).getChannelData(0), hits = [];
      for (var i = 1; i < x.length - 1 && hits.length < 3; i++) if (x[i] > 0.3 && x[i] >= x[i - 1] && x[i] >= x[i + 1] && (!hits.length || i - hits[hits.length - 1] > 20)) hits.push(i);   // the echoes' peaks (a fractional delay smears an echo over two samples)
      out[hz] = hits.length > 1 ? Math.round(sr / (hits[1] - hits[0])) : 0;
    }
    return out;
  })()`);
  numbers.karplusStrongDelayLoop_askedHz_gotHz = ks;
  const predicted = (hz) => 44100 / (44100 / hz + 128);                                             // the loop adds one render quantum (128 samples) to its delay
  verdict.delayLoopSoundsAtSrOverDelayPlus128 = [220, 330, 440, 880, 1760].every((hz) => Math.abs(ks[hz] - predicted(hz)) / predicted(hz) < 0.03);
  verdict.delayLoopIsFarFlatEvenAt220 = ks[220] < 220 * 0.75;
  verdict.delayLoopCannotReach880Or1760 = Math.abs(ks[880] - 880) > 100 && Math.abs(ks[1760] - 1760) > 100;   // below 344 Hz the 128 samples can be taken off the delay; above it the delay would have to be negative                 // the minimum loop delay of one render quantum: the pitch comes out wrong
  page.close();
  const g = await mount('<!doctype html><meta charset="utf-8"><body><script>parent.postMessage({ a: 0, r: 0 }, "*");</script>', 400);
  await g.probe(`(function () { window.__wk = 'pending'; (async function () { try { var ctx = new AudioContext(); var u = URL.createObjectURL(new Blob(['class P extends AudioWorkletProcessor { process() { return true; } } registerProcessor("p", P);'], { type: 'text/javascript' })); await ctx.audioWorklet.addModule(u); window.__wk = 'works'; } catch (e) { window.__wk = 'fails: ' + e.name + ' ' + String(e.message).slice(0, 80); } })(); return 1; })()`);
  await sleep(2500);
  const wk = await g.probe('window.__wk');                                                  // a Promise cannot cross postMessage: the probe starts it and reads the outcome after
  numbers.audioWorkletFromBlobInTheSandboxedIframe = wk;
  g.page.close();
}
console.error('phase 3');
// ---- 3. each gadget, OLD (git HEAD) against NEW, played through its own buttons in the shipped mount
const GADGETS = [
  { file: 'music_instruments/resources/html/guitar_fretboard.html', hold: true, press: ['#bU', '#bT', '#bD'], perNote: 14, kind: 'plucked' },
  { file: 'music_instruments/resources/html/lute_fretboard.html', hold: true, press: ['#bU', '#bT', '#bD'], perNote: 10, kind: 'plucked' },
  { file: 'music_instruments/resources/html/mandolin_fretboard.html', hold: true, press: ['#bU', '#bT', '#bD'], perNote: 24, kind: 'mandolin' },
  { file: 'music_instruments/resources/html/monochord.html', press: ['#bL', '#bR', '#bB', '#bO'], perNote: 16, kind: 'plucked' },
  { file: 'music_instruments/resources/html/piano_keyboard_c_major_triad.html', press: ['#bU', '#bT', '#bD'], perNote: 20, kind: 'piano' },
  ...['equal', 'pythagorean', 'meantone', 'well'].flatMap((t) => ['', '_good', '_bad'].map((s) => ({ file: `tuning/resources/html/piano_keyboard_${t}${s}.html`, press: ['#bU', '#bT', '#bD'], perNote: 20, kind: 'piano' }))),
];
const pitches = async (served, g, width) => { const m = await mount(served, width); try { if (g.hold) for (const i of [2, 13, 27]) await m.press('.pt', i); for (const sel of g.press) { await m.press(sel); await sleep(200); } const hz = await m.hz(); const errs = await m.errs(); const over = await m.width(); return { hz, errs, over }; } finally { m.page.close(); } };
for (const g of GADGETS) {
  const name = path.basename(g.file, '.html'); console.error(name);
  const old = await pitches(GIT(g.file), g, 360), now = await pitches(fs.readFileSync(path.join(VAULT, g.file), 'utf8'), g, 360);
  const oldNotes = old.hz;                                                         // one oscillator per note
  const newNotes = now.hz.filter((_, i) => i % g.perNote === 0);                    // the first oscillator of each note is its pitch (string 1, partial 1)
  const sameCount = oldNotes.length === newNotes.length && oldNotes.length > 0 && now.hz.length === oldNotes.length * g.perNote;
  const centsOff = Math.max(0, ...oldNotes.map((h, i) => Math.abs(1200 * Math.log2(newNotes[i] / h))));
  numbers[`gadget_${name}`] = { notes: oldNotes.length, oscillatorsPerNote: now.hz.length / Math.max(1, oldNotes.length), worstCentsOff: round(centsOff, 2) };
  verdict[`${name}_sameNotes`] = sameCount;
  verdict[`${name}_samePitches`] = sameCount && centsOff < (g.kind === 'mandolin' ? 3 : 0.01);           // the mandolin's first string of each pair is 2.5 cents flat: the pair is centred on the pitch asked
  verdict[`${name}_noErrors`] = old.errs.length === 0 && now.errs.length === 0;
  verdict[`${name}_noHorizontalScroll`] = now.over <= 0;
}
console.log(JSON.stringify(numbers, null, 1));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
