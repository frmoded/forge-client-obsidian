// 2026-11-15-2102 - the Scales chapter gadgets (scale_player.html, scale_ear.html) (interval_ear.html) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. Real mouse clicks (DevTools
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
const HTML = path.join(VAULT, 'scales/resources/html');
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
const setValue = (g, id, v) => g.probe(`(function () { var e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const PLAYER_SCALES = ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor', 'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'];
const pstate = (g) => g.probe(`JSON.stringify({ chips: [].map.call(document.querySelectorAll('#chips .chip'), function (c) { return c.textContent; }), letters: [].map.call(document.querySelectorAll('#letters .letter'), function (c) { return c.textContent; }), lit: [].map.call(document.querySelectorAll('.key.lit'), function (k) { return +k.getAttribute('data-midi'); }), heads: document.querySelectorAll('#staff .head').length, accs: [].map.call(document.querySelectorAll('#staff .acc'), function (c) { return c.textContent; }), note: document.getElementById('note').textContent, sounding: document.querySelectorAll('.sounding').length })`).then(JSON.parse);
const estate = (g) => g.probe(`JSON.stringify({ tonic: [].map.call(document.querySelectorAll('.key.tonic'), function (k) { return +k.getAttribute('data-midi'); }), right: [].map.call(document.querySelectorAll('.key.right'), function (k) { return +k.getAttribute('data-midi'); }), wrong: [].map.call(document.querySelectorAll('.key.wrong'), function (k) { return +k.getAttribute('data-midi'); }), reveal: document.querySelectorAll('.key.reveal').length, hint: document.getElementById('hint').textContent, counter: document.getElementById('counter').textContent, prompt: document.getElementById('prompt').textContent, sr: document.getElementById('sr').textContent, answers: [].map.call(document.querySelectorAll('#answers button'), function (b) { return b.textContent; }) })`).then(JSON.parse);
const keyBox = (g, m) => g.press(`.key[data-midi="${m}"]`);
const allHeights = { player: new Set(), ear: new Set() };
for (const width of [800, 360]) {
  // ---------------- the Scale player
  const g = await mount('scale_player.html', width);
  try {
    verdict[`player${width}_noHorizontalScroll_start`] = (await g.overflow()) <= 0;
    let s = await pstate(g);
    verdict[`player${width}_cMajor`] = s.chips.join('') === 'WWHWWWH' && s.lit.join() === '60,62,64,65,67,69,71,72' && s.letters.join('') === 'CDEFGAB' && s.heads === 8 && s.accs.length === 0;
    const h0 = await g.height(); allHeights.player.add(h0); numbers[`player_${width}_first_height`] = h0;
    if (width === 800) await g.shot('scales-player-0-c-major', h0);
    // every scale at C, and every tonic at major and harmonic minor: ONE height, no horizontal scroll, a spelling that is one letter per degree where it must be
    let heights = new Set(), scrolls = 0, spellBad = 0;
    for (const id of PLAYER_SCALES) for (const t of id === 'major' || id === 'harmonic_minor' ? [...Array(12).keys()] : [0, 6, 11]) {
      await setValue(g, 'scale', id); await setValue(g, 'tonic', String(t));
      heights.add(await g.height()); if ((await g.overflow()) > 0) scrolls++;
      const st = await pstate(g); const seven = ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor', 'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'].includes(id);
      if (seven && new Set(st.letters.map((x) => x[0])).size !== 7) spellBad++;
      if (st.heads !== st.letters.length + 1) spellBad++;
    }
    numbers[`player_${width}_distinct_heights_over_all_scales_and_tonics`] = [...heights]; for (const h of heights) allHeights.player.add(h);
    verdict[`player${width}_oneHeightForEveryScaleAndTonic`] = heights.size === 1; verdict[`player${width}_noHorizontalScrollForAny`] = scrolls === 0; verdict[`player${width}_sevenNoteScalesUseSevenLetters`] = spellBad === 0;
    await setValue(g, 'scale', 'harmonic_minor'); await setValue(g, 'tonic', '8'); s = await pstate(g);
    verdict[`player${width}_gSharpHarmonicMinorHasItsDoubleSharp`] = s.letters.includes('F♯♯') && s.accs.includes('×') && s.chips.join(',') === 'W,H,W,W,H,3H,H';
    if (width === 800) await g.shot('scales-player-1-g-sharp-harmonic-minor', await g.height());
    await setValue(g, 'scale', 'melodic_minor'); await setValue(g, 'tonic', '9'); s = await pstate(g);
    const up = s.letters.join(' '); await g.press('#form-down'); s = await pstate(g);
    verdict[`player${width}_melodicMinorUpAndDown`] = up === 'A B C D E F♯ G♯' && s.letters.join(' ') === 'A B C D E F G'; await g.press('#form-up');
    await setValue(g, 'scale', 'major'); await setValue(g, 'tonic', '3'); await g.clear(); await g.press('#play-up'); await sleep(400);
    let hz = notes(await g.hz()).map(midiOf); verdict[`player${width}_playUpSoundsE-flatMajorInOrder`] = hz.join() === '63,65,67,68,70,72,74,75';
    await sleep(900); s = await pstate(g); verdict[`player${width}_theSoundingNoteIsLit`] = s.sounding > 0;
    await sleep(3500); await g.clear(); await g.press('#play-down'); await sleep(300); hz = notes(await g.hz()).map(midiOf); verdict[`player${width}_playDownStartsOnTheOctave`] = hz[0] === 75;
    await sleep(4500); await setValue(g, 'scale', 'blues'); await setValue(g, 'tonic', '9'); s = await pstate(g);
    verdict[`player${width}_bluesInA`] = s.letters.join(' ') === 'A C D E♭ E G' && s.chips.join(',') === '3H,W,H,H,3H,W';
    if (width === 800) await g.shot('scales-player-2-a-blues', await g.height());
    await setValue(g, 'scale', 'whole_tone'); await setValue(g, 'tonic', '0'); s = await pstate(g); verdict[`player${width}_wholeToneConvention`] = /sharps going up and flats coming down/.test(s.note);
    verdict[`player${width}_noErrors`] = (await g.errs()).length === 0;
  } finally { g.page.close(); }
  // ---------------- the ear gadget
  const e = await mount('scale_ear.html', width);
  try {
    verdict[`ear${width}_noHorizontalScroll_start`] = (await e.overflow()) <= 0;
    const hs = []; const sample = async () => { const h = await e.height(); hs.push(h); allHeights.ear.add(h); if ((await e.overflow()) > 0) verdict[`ear${width}_horizontalScroll`] = true; };
    await sample(); let s = await estate(e);
    verdict[`ear${width}_idle`] = s.hint === 'Press Next' && s.counter === 'Score 0 of 0 asked' && s.answers.join('|') === 'major|natural minor|Dorian|Mixolydian|pentatonic';
    // game 1
    await e.clear(); await e.press('#next'); await sleep(900); let hz = notes(await e.hz()).map(midiOf); s = await estate(e); await sample();
    verdict[`ear${width}_g1_nextPlaysAScale`] = (hz.length === 6 || hz.length === 8) && s.tonic.join() === String(hz[0]) && s.hint === '3 tries left' && s.counter === 'Score 0 of 1 asked';
    const buttons = await e.probe(`[].map.call(document.querySelectorAll('#answers button'), function (b) { return b.getAttribute('data-scale'); })`);
    // find the answer by the size of the scale (a pentatonic has 5 notes), then guess a wrong one first
    const size = hz.length - 1; const wrongId = buttons.find((id) => (id === 'major_pentatonic') !== (size === 5));
    await e.press(`#answers button[data-scale="${wrongId}"]`); await sleep(200); s = await estate(e); await sample();
    verdict[`ear${width}_g1_wrongGuessRevealsNothing`] = s.hint === '2 tries left' && s.answers.some((t) => t.endsWith('×')) && !s.answers.some((t) => t.endsWith('✓'));
    if (width === 800) await e.shot('scales-ear-1-one-wrong', await e.height());
    // try the others until it is solved or over (the one right answer is among them)
    let guesses = 0; for (const id of buttons) { s = await estate(e); if (/^(Correct|Out of tries)/.test(s.sr)) break; if (s.answers.some((t) => t.startsWith(id === 'natural_minor' ? 'natural minor' : id === 'major_pentatonic' ? 'pentatonic' : id[0].toUpperCase() === id[0] ? id : id)) && false) continue; await e.press(`#answers button[data-scale="${id}"]`); await sleep(120); guesses++; }
    s = await estate(e); await sample(); verdict[`ear${width}_g1_endsWithTheAnswerShown`] = /^(Correct|Out of tries)/.test(s.sr) && s.answers.some((t) => t.endsWith('✓')) && /It was /.test(s.prompt);
    if (width === 800) await e.shot('scales-ear-2-answered', await e.height());
    // game 2: build
    await e.press('#game-2'); await sleep(100); s = await estate(e); await sample();
    verdict[`ear${width}_g2_ownScoreAndEmptyAnswerRow`] = s.counter === 'Score 0 of 0 asked' && s.answers.length === 0;
    await e.clear(); await e.press('#next'); await sleep(300); s = await estate(e); await sample(); const tonic = s.tonic[0];
    verdict[`ear${width}_g2_theTonicIsLitAndOneNoteSounds`] = (await e.hz()).length === 20 && Number.isFinite(tonic) && /^Build .+: tap its other notes/.test(s.prompt) && s.hint === '3 tries left';
    await keyBox(e, tonic); await sleep(100); s = await estate(e); verdict[`ear${width}_g2_tappingTheTonicDoesNothing`] = s.hint === '3 tries left' && s.right.length === 0 && s.wrong.length === 0;
    // tap every key of the octave above the tonic in order: right ones go green, wrong ones are misses; the question must end (solved or three misses)
    let ended = false; for (let m = tonic + 1; m < tonic + 12 && !ended; m++) { await keyBox(e, m); await sleep(80); const st = await estate(e); ended = /^(All found|Out of tries)/.test(st.sr) || st.hint === 'Press Next'; if (m === tonic + 4 && width === 800) await e.shot('scales-ear-3-building', await e.height()); }
    s = await estate(e); await sample(); verdict[`ear${width}_g2_theQuestionEnds`] = s.hint === 'Press Next' && (s.right.length > 0);
    if (width === 800) await e.shot('scales-ear-4-built-or-revealed', await e.height());
    await e.press('#game-1'); const c1 = (await estate(e)).counter; await e.press('#game-2'); await e.press('#reset'); const c2 = (await estate(e)).counter; await e.press('#game-1'); const c3 = (await estate(e)).counter;
    verdict[`ear${width}_resetClearsOnlyTheCurrentGame`] = c2 === 'Score 0 of 0 asked' && c3 === c1 && /asked/.test(c1);
    numbers[`ear_${width}_distinct_heights`] = [...new Set(hs)]; verdict[`ear${width}_oneHeightInEveryGameAndState`] = new Set(hs).size === 1;
    verdict[`ear${width}_noErrors`] = (await e.errs()).length === 0;
  } finally { e.page.close(); }
}
numbers.player_heights_all = [...allHeights.player]; numbers.ear_heights_all = [...allHeights.ear];
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
