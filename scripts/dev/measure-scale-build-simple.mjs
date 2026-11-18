// 2026-11-18-0930 - the two SIMPLE scale build exercises (scale_build_major, scale_build_natural_minor: no levels, no New exercise, no Random; the twelve home-note chips at the top are the chooser; one rule of 3 wrong taps) in real headless Chrome, in the SHIPPED mount:
// a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. (scripts/dev/measure-scale-exercises.mjs drives selects and levels and cannot drive these two.) Measured, with REAL mouse clicks on the chips and the keys
// (DevTools Input.dispatchMouseEvent at the real box of each one):
//   - the CONTENT HEIGHT (the body's own height) in EVERY state: fresh ("Pick a home note."), and for each of the 12 home notes: started, 3 wrong taps (failed, not counted), started again (a failed key is retried), one found, built (completed, chip filled),
//     started again (the chip of a completed key restarts it, keeps its fill), failed again (still completed), and after Reset; that it is ONE height, that the page does not scroll vertically when the iframe is exactly that tall (checked in every state), and not horizontally;
//   - the chooser's behaviour in the real page (first open starts nothing and the keys ignore taps; a chip starts at once; the third wrong tap ends it; the count and the fills; "All twelve built."; Reset);
//   - a real Play through the real Web Audio graph (the pitch of every note, completed and failed builds);
//   - that a real pointer RESTING over every chip, key, Play and Reset changes nothing (the page's screenshot and its DOM are the same while the pointer rests on each one and after, in a fresh, a half-built, a completed and a failed state);
//   - shots of the four states (light and dark = the same page: no gadget has a dark theme).
// Reports the content height per file and width and the EMBED HEIGHT (the larger of the two widths) of each file.
//   node scripts/dev/measure-scale-build-simple.mjs [--vault ~/projects/music-theory] [--out <dir>] [--only <file fragment>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/scale-build-simple')).replace(/^~/, os.homedir());
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
  const press = async (sel) => { const c = await centre(sel); await page.click(c.x, c.y); await sleep(110); };            // a REAL mouse click at the real box
  return {
    page, probe, press, centre,
    height: () => probe('Math.ceil(document.body.getBoundingClientRect().height)'),
    hOverflow: () => probe('document.documentElement.scrollWidth - document.documentElement.clientWidth'),
    setHeight: (h) => page.ev(`document.getElementById('f').style.height = '${h}px'`),
    vScroll: () => probe('document.documentElement.scrollHeight - document.documentElement.clientHeight'),
    text: (id) => probe(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`),
    count: (sel) => probe(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    hz: () => page.ev('window.__hz.slice()'), clearHz: () => page.ev('window.__hz.length = 0'), errs: () => page.ev('window.__err.slice()'),
    shot: async (name, h) => { for (const scheme of ['light', 'dark']) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(120); await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width, height: h }); } },
  };
}
const FILES = [
  { file: 'scales/resources/html/scale_build_major.html', scale: 'major', steps: [2, 2, 1, 2, 2, 2, 1] },
  { file: 'scales/resources/html/scale_build_natural_minor.html', scale: 'natural_minor', steps: [2, 1, 2, 2, 1, 2, 2] },
];
const verdict = {}, numbers = { heights: {}, embed: {}, states: {} };
const midisOf = (steps, tonic) => { const out = [60 + tonic]; for (const s of steps) out.push(out[out.length - 1] + s); return out; };
const wrongKeysOf = (ms) => { const out = []; for (let k = ms[0] + 1; k < ms[ms.length - 1]; k++) if (!ms.includes(k)) out.push(k); return out; };
const hashOf = `(function(){ var h = 7, t = document.documentElement.outerHTML; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + h; })()`;
const pitchOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));

for (const f of FILES.filter((x) => !only || x.file.includes(only))) {
  const name = path.basename(f.file, '.html'); numbers.heights[name] = {};
  for (const width of [800, 360]) {
    const tag = `${name}${width}`;
    // ---- 1. the sweep: every state of every home note, real clicks, at the page's own height
    const g = await mount(f.file, width); const hs = new Set(); let states = 0, hScrolls = 0, vScrolls = 0;
    const sample = async (label) => { const h = await g.height(); hs.add(h); states++; if ((await g.hOverflow()) > 0) { hScrolls++; console.log(`${tag}: horizontal scroll in ${label}`); } if ((await g.vScroll()) > 0) { vScrolls++; console.log(`${tag}: vertical scroll in ${label}`); } return h; };
    verdict[`${tag}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await g.height(); hs.add(h0);
    await g.setHeight(h0);                                                                // from here the iframe is exactly as tall as its content: any vertical scroll shows in vScroll
    verdict[`${tag}_noVerticalScrollAtItsOwnHeight`] = (await g.vScroll()) <= 0;
    verdict[`${tag}_freshSaysPickAHomeNote`] = (await g.text('prompt')) === 'Pick a home note.' && (await g.count('.key.tonic, .key.lit')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === true && (await g.count('#homes button.home')) === 12 && (await g.text('completed')) === 'Completed 0 of 12';
    await g.press('.key[data-midi="64"]'); verdict[`${tag}_freshKeyTapIgnored`] = (await g.count('.key.lit, .key.wrong, #staff .head')) === 0 && (await g.hz()).length === 0;
    await sample('fresh');
    let completedN = 0, ok = { chipStarts: true, thirdWrongEnds: true, notCounted: true, retry: true, built: true, fillKept: true, restart: true };
    for (let t = 0; t < 12; t++) {
      const ms = midisOf(f.steps, t), targets = ms.slice(1, -1), wrongs = wrongKeysOf(ms).slice(0, 3); const chip = `#homes .home:nth-child(${t + 1})`;
      // a new key: the chip starts it at once
      await g.press(chip); await sample(`t${t}_started`);
      ok.chipStarts &&= (await g.probe(`document.querySelector('.home.current') && [].indexOf.call(document.querySelectorAll('#homes .home'), document.querySelector('.home.current'))`)) === t && (await g.count('.key.tonic')) === 1 && (await g.probe(`document.querySelector('.key.tonic').getAttribute('data-midi')`)) === String(ms[0]) && (await g.text('wrongs')) === 'Wrong taps: 0 of 3' && (await g.text('prompt')).startsWith('Exercise: build ') && (await g.count('#staff .head')) === 1;
      // the third wrong tap ends it as failed: the answer is shown, the key is not counted
      for (const [i, k] of wrongs.entries()) { await g.press(`.key[data-midi="${k}"]`); if (i === 1) { ok.thirdWrongEnds &&= (await g.text('wrongs')) === 'Wrong taps: 2 of 3' && (await g.probe(`document.getElementById('play').disabled`)) === true; await sample(`t${t}_twoWrong`); } }
      await sample(`t${t}_gaveUp`);
      ok.thirdWrongEnds &&= (await g.text('wrongs')) === 'Wrong taps: 3 of 3' && (await g.text('prompt')).startsWith('Exercise over') && (await g.count('#staff .head')) === ms.length && (await g.count('#staff .head.ghost')) === targets.length && (await g.count('.key.reveal')) === targets.length && (await g.count('#letters .letter')) === ms.length - 1 && (await g.count('#chips .chip')) === ms.length - 1 && (await g.probe(`document.getElementById('play').disabled`)) === false;
      ok.notCounted &&= (await g.text('completed')) === `Completed ${completedN} of 12` && (await g.count(`#homes .home.done`)) === completedN;
      await g.press(`.key[data-midi="${targets[0]}"]`); ok.thirdWrongEnds &&= (await g.count('#staff .head')) === ms.length && (await g.count('.key.lit:not(.tonic)')) === 0;       // a key after the end is ignored
      // a failed key is retried by tapping its chip: a fresh build; one found; then all found within the wrong taps
      await g.press(chip); ok.retry &&= (await g.text('wrongs')) === 'Wrong taps: 0 of 3' && (await g.count('#staff .head')) === 1 && (await g.count('.key.wrong, .key.reveal')) === 0 && (await g.text('prompt')).startsWith('Exercise: build ');
      await sample(`t${t}_retry`);
      await g.press(wrongs.length ? `.key[data-midi="${wrongs[0]}"]` : chip);                      // one wrong tap on the way (the build still completes within 3)
      await g.press(`.key[data-midi="${targets[0]}"]`); await sample(`t${t}_oneFound`);
      for (const m of targets.slice(1)) await g.press(`.key[data-midi="${m}"]`);
      await sample(`t${t}_built`); completedN++;
      ok.built &&= (await g.text('completed')) === (completedN === 12 ? 'All twelve built.' : `Completed ${completedN} of 12`) && (await g.probe(`document.querySelector(${JSON.stringify(chip)}).classList.contains('done')`)) === true && (await g.text('prompt')).startsWith('Exercise done') && (await g.count('#staff .head')) === ms.length && (await g.count('#staff .head.ghost')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === false;
      // the chip of a completed key restarts it and keeps its fill; failing it again does not uncount it
      await g.press(chip); await sample(`t${t}_restart`);
      ok.restart &&= (await g.count('#staff .head')) === 1 && (await g.text('wrongs')) === 'Wrong taps: 0 of 3' && (await g.text('prompt')).startsWith('Exercise: build ');
      ok.fillKept &&= (await g.probe(`document.querySelector(${JSON.stringify(chip)}).classList.contains('done') && document.querySelector(${JSON.stringify(chip)}).classList.contains('current')`)) === true;
      for (const k of wrongs) await g.press(`.key[data-midi="${k}"]`);
      await sample(`t${t}_failedAgain`);
      ok.fillKept &&= (await g.probe(`document.querySelector(${JSON.stringify(chip)}).classList.contains('done')`)) === true && (await g.text('completed')) === (completedN === 12 ? 'All twelve built.' : `Completed ${completedN} of 12`);
    }
    for (const [k, v] of Object.entries(ok)) verdict[`${tag}_real_${k}`] = v;
    verdict[`${tag}_allTwelveBuilt`] = (await g.text('completed')) === 'All twelve built.' && (await g.count('#homes .home.done')) === 12;
    await g.press('#reset'); await sample('afterReset');
    verdict[`${tag}_resetClearsCountAndBuild`] = (await g.text('prompt')) === 'Pick a home note.' && (await g.text('completed')) === 'Completed 0 of 12' && (await g.count('#homes .home.done, #homes .home.current')) === 0 && (await g.count('#staff .head')) === 0 && (await g.count('.key.tonic, .key.lit, .key.wrong')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === true;
    verdict[`${tag}_noHorizontalScrollInAnyState`] = hScrolls === 0; verdict[`${tag}_noVerticalScrollInAnyStateAtItsOwnHeight`] = vScrolls === 0; numbers.states[`${tag}`] = states; numbers.heights[name][width] = [...hs];
    verdict[`${tag}_oneHeightInEveryState`] = hs.size === 1;
    verdict[`${tag}_noErrorsAfterTheSweep`] = (await g.errs()).length === 0;
    g.page.close();

    // ---- 2. a real Play (completed and failed builds), the pitches through the real Web Audio graph
    const r = await mount(f.file, width); const embed = Math.max(...hs, h0); await r.setHeight(embed);
    const ms = midisOf(f.steps, 0), targets = ms.slice(1, -1), wrongs = wrongKeysOf(ms).slice(0, 3);
    await r.press('#homes .home:nth-child(1)');
    await r.clearHz(); await r.press('#play'); await sleep(400); verdict[`${tag}_realPlayOffWhileBuilding`] = (await r.hz()).length === 0;
    for (const how of ['completed', 'failed']) {
      if (how === 'completed') for (const m of targets) await r.press(`.key[data-midi="${m}"]`); else { await r.press('#homes .home:nth-child(1)'); for (const k of wrongs) await r.press(`.key[data-midi="${k}"]`); }
      await sleep(300); await r.clearHz(); await r.press('#play'); await sleep(Math.round((ms.length * 0.45 + 1) * 1000));
      const hz = await r.hz(); const per = hz.length / ms.length;
      verdict[`${tag}_realPlay_${how}_soundsEveryNote`] = Number.isInteger(per) && per >= 1 && per <= 40 && hz.filter((_, i) => i % per === 0).map(pitchOf).join() === ms.join();
      numbers[`${tag}_hzForPlay_${how}`] = hz.length;
    }
    await sleep(200); verdict[`${tag}_realNoErrors`] = (await r.errs()).length === 0;

    // ---- 3. a real pointer RESTING over every chip, key, Play and Reset changes nothing
    const park = async () => { await r.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width + 10, y: 4 }); await sleep(400); };      // outside the iframe
    const shotNow = async () => (await r.page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: embed, scale: 1 } })).data;
    const setups = {
      fresh: async () => { await r.press('#reset'); },
      halfBuilt: async () => { await r.press('#homes .home:nth-child(3)'); await r.press(`.key[data-midi="${midisOf(f.steps, 2)[2]}"]`); await r.press(`.key[data-midi="${wrongKeysOf(midisOf(f.steps, 2))[0]}"]`); },
      completed: async () => { await r.press('#homes .home:nth-child(5)'); for (const m of midisOf(f.steps, 4).slice(1, -1)) await r.press(`.key[data-midi="${m}"]`); },
      failed: async () => { await r.press('#homes .home:nth-child(8)'); for (const k of wrongKeysOf(midisOf(f.steps, 7)).slice(0, 3)) await r.press(`.key[data-midi="${k}"]`); },
    };
    let rest = true, restUnstable = 0, moved = 0;
    for (const [state, setup] of Object.entries(setups)) {
      await setup(); await park(); const a = await shotNow(); await sleep(250); const a2 = await shotNow(); if (a !== a2) { restUnstable++; continue; }
      const dom0 = await r.probe(hashOf);
      const pts = await r.probe(`(function(){ var out = []; document.querySelectorAll('#homes .home, .key, #play, #reset').forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 2 && b.height > 2) out.push({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); }); return out; })()`);
      for (const p of pts) { await r.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await sleep(70); const now = await shotNow(); moved++; if (now !== a) rest = false; if ((await r.probe(hashOf)) !== dom0) rest = false; }
      await park(); if ((await shotNow()) !== a || (await r.probe(hashOf)) !== dom0) rest = false;
      await r.shot(`${tag}-${state}`, embed);
    }
    verdict[`${tag}_realPointerRestingChangesNothing`] = rest && moved >= 4 * 30; numbers[`${tag}_restUnstableStates`] = restUnstable; numbers[`${tag}_restPositions`] = moved;
    verdict[`${tag}_restNoErrors`] = (await r.errs()).length === 0;
    r.page.close();
  }
  numbers.embed[name] = Math.max(...Object.values(numbers.heights[name]).flat());
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const bad = Object.entries(verdict).filter(([, v]) => v !== true).map(([k]) => k);
const ok = bad.length === 0;
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true: ' + bad.join(', ')}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
