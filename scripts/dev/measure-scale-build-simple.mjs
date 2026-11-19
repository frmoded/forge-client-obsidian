// 2026-11-19-0994 - MOVED VERDICTS (not run yet: the supervisor measures in real Chrome): `_real_thirdWrongEnds` is now `_real_noLimit` (three and then ALL the wrong keys of the octave leave the build under way: prompt "Exercise: build", no dashed notes, no revealed keys, no letters, Play off, hint exactly "Not in the scale.", no #wrongs element); `_real_notCounted` is now `_real_nothingCompletedByWrongTaps` (wrong taps change neither the count nor the shelf); `_real_failedLeavesEmpty` is now `_real_slotEmptyWhileBuilding`; `_real_retry` now taps the slot of the build under way and expects a fresh build with no wrong marks and the hint "6 to find"; new `_real_noStepChips` (no #chips element in any state sampled); `_real_built` and `_real_completedTapShows` expect NO #chips chips (letters only); `_real_built` now also expects NO wrong-tap mark (`.key.wrong` is 0) on the end screen of the build, and `_real_completedTapShows` none on the finished view; `_completedTapShowsTheScale` (1b) compares the finished view with the end of its build strictly, as before (supervisor follow-up: the build that completes CLEARS its wrong-tap marks, so the end screen has none either: verdict part `wrongAtEnd === 0 && wrongShown === 0`; the build still took one wrong tap, whose quiet mark and hint live during the build only); `_freshSaysPickATonic` unchanged; `_realPlay_failed_soundsEveryNote` is now `_realPlay_afterWrongTaps_soundsEveryNote` (a second tonic, built after 3 wrong taps; the old one tapped the slot of a completed key); the resting-pointer state `failed` is now `wrongTaps` (three wrong taps, build under way). The ONE-height verdicts (`_oneHeightInEveryState`, `_shelf_oneHeight...`) now also prove that the removed W W H row left no gap: the content height is ONE number and SMALLER than before by the chips row (about 27 px: its 24 px min-height + its 3 px margin; the letters row keeps its own 3 px margin and 28 px); the embed heights in the two notes are set from the new numbers.
// 2026-11-18-0930 - the two SIMPLE scale build exercises (scale_build_major, scale_build_natural_minor: no levels, no New exercise, no Random; the twelve tonic slots of the SHELF are the chooser; wrong taps NOT counted (2026-11-19-0994: no limit, no gave-up state), and no W W H row) in real headless Chrome, in the SHIPPED mount:
// a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px and at 360 px wide. (scripts/dev/measure-scale-exercises.mjs drives selects and levels and cannot drive these two.) Measured, with REAL mouse clicks on the slots and the keys
// (DevTools Input.dispatchMouseEvent at the real box of each one):
//   - the CONTENT HEIGHT (the body's own height) in EVERY state: fresh ("Pick a tonic (home note)."), and for each of the 12 tonics: started, 3 wrong taps (failed, not counted), started again (a failed key is retried), one found, built (completed, slot filled),
//     the slot of the completed key tapped (2026-11-19-0955: it SHOWS the finished scale, it no longer restarts the build; its fill and the count stay), and after Reset; that it is ONE height, that the page does not scroll vertically when the iframe is exactly that tall (checked in every state), and not horizontally;
//   - the SHELF (2026-11-19-0938; verdicts named `<file><width>_shelf_...`): twelve slots in every state; the grid is 4 columns x 3 rows at 800 px and 3 x 4 at 360 px (real layout: the slots' boxes); every slot has the same size; nothing of a slot's name or mini score runs out of its box;
//     the number of filled slots equals the number of completions in every state (0 ... 12), a failed build leaves its slot empty, a completed slot keeps its mini score while it is built again or another key is built; the mini score of a filled slot has the eight heads of the
//     scale, the five staff lines, the clef and the two red tonic heads, and its name says the scale; ONE height with the shelf empty, six and twelve filled; Reset empties the shelf; real clicks on all twelve slots fill all twelve; shots with the shelf empty / six filled / twelve filled;
//   - 2026-11-19-0955 (verdict `<file><width>_completedTapShowsTheScale`, plus `_real_completedTapShows` and `_real_secondTapChangesNothing` in the sweep): a REAL click on the slot of an ALREADY COMPLETED tonic, while another tonic is half built, shows that finished scale in the main staff
//     exactly as at the end of its build (the same DOM of the staff, keys, letters, steps, prompt and wrong-tap line as when it ended; the eight heads and their accidentals the mini score shows too), Play on, the count unchanged, no restart, a second click changes nothing (the page's
//     DOM hash), starting another tonic leaves the completed one completed, ONE height before, after the click and after the second click; shot `<file><width>-completedTapShows-light/dark.png`;
//   - the chooser's behaviour in the real page (first open starts nothing and the keys ignore taps; a slot starts at once; the third wrong tap ends it; the count and the fills; "All twelve built."; Reset);
//   - a real Play through the real Web Audio graph (the pitch of every note, completed and failed builds);
//   - that a real pointer RESTING over every slot, key, Play and Reset changes nothing (the page's screenshot and its DOM are the same while the pointer rests on each one and after, in a fresh, a half-built, a completed and a failed state);
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
    height: () => probe('Math.ceil(document.body.getBoundingClientRect().bottom)'),
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
];       // f.scale names the scale in a completed slot: "G major", "G natural minor" 
const verdict = {}, numbers = { heights: {}, embed: {}, states: {}, shelfHeights: {}, shelfGrid: {} };
const midisOf = (steps, tonic) => { const out = [60 + tonic]; for (const s of steps) out.push(out[out.length - 1] + s); return out; };
const wrongKeysOf = (ms) => { const out = []; for (let k = ms[0] + 1; k < ms[ms.length - 1]; k++) if (!ms.includes(k)) out.push(k); return out; };
const hashOf = `(function(){ var h = 7, t = document.documentElement.outerHTML; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + h; })()`;
const pitchOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));

for (const f of FILES.filter((x) => !only || x.file.includes(only))) {
  const name = path.basename(f.file, '.html'); numbers.heights[name] = {};
  for (const width of [800, 360]) {
    const tag = `${name}${width}`;
    // ---- 1. the sweep: every state of every home note, real clicks, at the page's own height
    const g = await mount(f.file, width); const hs = new Set(); let states = 0, hScrolls = 0, vScrolls = 0, completedN = 0, shelfBad = 0; const byFill = {};
    const slot = (t) => `#shelf .slot:nth-child(${t + 1})`;
    // the shelf in the current state: [slot count, filled slots, slots whose mini score is not what its state says (filled: the scale's heads, five lines, a clef, two tonic heads; empty: nothing drawn)]
    const shelfNow = () => g.probe(`(function () { var s = document.querySelectorAll('#shelf > .slot'), filled = 0, bad = 0; s.forEach(function (e) { var v = e.querySelector('svg'), n = v.querySelectorAll('.head').length; if (e.classList.contains('done')) { filled++; if (n !== ${f.steps.length + 1} || v.querySelectorAll('.staffline').length !== 5 || v.querySelectorAll('path').length !== 1 || v.querySelectorAll('.head.tonic').length !== 2) bad++; } else if (v.children.length) bad++; }); return s.length + ':' + filled + ':' + bad; })()`);
    const sample = async (label) => {
      const h = await g.height(); hs.add(h); states++; (byFill[completedN] ??= new Set()).add(h);
      if ((await g.hOverflow()) > 0) { hScrolls++; console.log(`${tag}: horizontal scroll in ${label}`); } if ((await g.vScroll()) > 0) { vScrolls++; console.log(`${tag}: vertical scroll in ${label}`); }
      const sh = await shelfNow(); if (sh !== `12:${completedN}:0`) { shelfBad++; console.log(`${tag}: the shelf says ${sh} in ${label}, expected 12:${completedN}:0`); }
      return h;
    };
    verdict[`${tag}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await g.height(); hs.add(h0);
    await g.setHeight(h0);                                                                // from here the iframe is exactly as tall as its content: any vertical scroll shows in vScroll
    verdict[`${tag}_noVerticalScrollAtItsOwnHeight`] = (await g.vScroll()) <= 0;
    verdict[`${tag}_freshSaysPickATonic`] = (await g.text('prompt')) === 'Pick a tonic (home note).' && (await g.count('.key.tonic, .key.lit')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === true && (await g.count('#shelf button.slot')) === 12 && (await g.text('completed')) === 'Completed 0 of 12';
    // the shelf's real layout: 4 x 3 at 800 px, 3 x 4 at 360 px; twelve slots of one size, nothing running out of its box
    const geo = await g.probe(`(function () { var r = [].map.call(document.querySelectorAll('#shelf > .slot'), function (e) { var b = e.getBoundingClientRect(), n = e.querySelector('.nm').getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width * 10), h: Math.round(b.height * 10), nmBottom: n.bottom, bottom: b.bottom, nmRight: n.right, right: b.right, nmLeft: n.left, left: b.left }; }); return { rowCount: new Set(r.map(function (q) { return q.y; })).size, colCount: new Set(r.map(function (q) { return q.x; })).size, sizes: new Set(r.map(function (q) { return q.w + 'x' + q.h; })).size, boxes: r.length, nmInside: r.every(function (q) { return q.nmBottom <= q.bottom + 0.5 && q.nmRight <= q.right + 0.5 && q.nmLeft >= q.left - 0.5; }), tracks: getComputedStyle(document.getElementById('shelf')).gridTemplateColumns.split(' ').length, w: r[0] && r[0].w / 10, h: r[0] && r[0].h / 10 }; })()`);
    numbers.shelfGrid[tag] = geo;
    verdict[`${tag}_shelf_gridIs${width === 800 ? '4x3' : '3x4'}`] = geo.boxes === 12 && geo.tracks === (width === 800 ? 4 : 3) && geo.colCount === (width === 800 ? 4 : 3) && geo.rowCount === (width === 800 ? 3 : 4);
    verdict[`${tag}_shelf_twelveSlotsOfOneSize`] = geo.sizes === 1;
    verdict[`${tag}_shelf_emptySlotNameInsideItsBox`] = geo.nmInside === true;
    await g.shot(`${tag}-shelf-0-empty`, h0);
    await g.press('.key[data-midi="64"]'); verdict[`${tag}_freshKeyTapIgnored`] = (await g.count('.key.lit, .key.wrong, #staff .head')) === 0 && (await g.hz()).length === 0;
    await sample('fresh');
    let ok = { slotStarts: true, noLimit: true, nothingCompletedByWrongTaps: true, retry: true, built: true, fillKept: true, completedTapShows: true, secondTapChangesNothing: true, slotEmptyWhileBuilding: true, noStepChips: true, miniKeptWhileBuilt: true, miniOfTheScale: true, survives: true };
    for (let t = 0; t < 12; t++) {
      const ms = midisOf(f.steps, t), targets = ms.slice(1, -1), allWrongs = wrongKeysOf(ms), wrongs = allWrongs.slice(0, 3); const chip = slot(t);
      // a new key: its slot starts it at once
      await g.press(chip); await sample(`t${t}_started`);
      ok.slotStarts &&= (await g.probe(`document.querySelector('.slot.current') && [].indexOf.call(document.querySelectorAll('#shelf .slot'), document.querySelector('.slot.current'))`)) === t && (await g.count('.key.tonic')) === 1 && (await g.probe(`document.querySelector('.key.tonic').getAttribute('data-midi')`)) === String(ms[0]) && (await g.count('#wrongs')) === 0 && (await g.text('hint')) === '6 to find' && (await g.text('prompt')).startsWith('Exercise: build ') && (await g.count('#staff .head')) === 1;
      // 2026-11-19-0994: wrong taps are NOT counted: the first three, and then ALL the wrong keys of the octave, leave the build under way (no failed state, no dashed notes, no revealed keys, Play off), each with its quiet mark and the hint "Not in the scale."
      for (const [i, k] of allWrongs.entries()) { await g.press(`.key[data-midi="${k}"]`); if (i === 1) { ok.noLimit &&= (await g.text('hint')) === 'Not in the scale.' && (await g.probe(`document.getElementById('play').disabled`)) === true; await sample(`t${t}_twoWrong`); } if (i === 2) await sample(`t${t}_threeWrong`); }
      await sample(`t${t}_allWrong`);
      ok.noLimit &&= (await g.text('hint')) === 'Not in the scale.' && (await g.count('#wrongs')) === 0 && (await g.text('prompt')).startsWith('Exercise: build ') && (await g.count('#staff .head')) === 1 && (await g.count('#staff .head.ghost')) === 0 && (await g.count('.key.reveal')) === 0 && (await g.count('.key.wrong')) === allWrongs.length && (await g.count('#letters .letter')) === 0 && (await g.count('.key.idle')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === true;
      ok.noStepChips &&= (await g.count('#chips')) === 0;
      ok.nothingCompletedByWrongTaps &&= (await g.text('completed')) === `Completed ${completedN} of 12` && (await g.count(`#shelf .slot.done`)) === completedN;
      ok.slotEmptyWhileBuilding &&= (await g.probe(`(function () { var e = document.querySelector(${JSON.stringify(chip)}); return !e.classList.contains('done') && e.querySelector('svg').children.length === 0; })()`)) === true;       // the slot stays empty (and tappable) until the build is done
      // a tap on the slot of the build under way restarts it: a fresh build, no wrong marks; then one wrong tap on the way, one found, then all found
      await g.press(chip); ok.retry &&= (await g.text('hint')) === '6 to find' && (await g.count('#staff .head')) === 1 && (await g.count('.key.wrong, .key.reveal')) === 0 && (await g.text('prompt')).startsWith('Exercise: build ');
      await sample(`t${t}_retry`);
      await g.press(`.key[data-midi="${wrongs[0]}"]`);
      await g.press(`.key[data-midi="${targets[0]}"]`); await sample(`t${t}_oneFound`);
      for (const m of targets.slice(1)) await g.press(`.key[data-midi="${m}"]`);
      completedN++; await sample(`t${t}_built`);
      ok.miniOfTheScale &&= (await g.probe(`(function () { var e = document.querySelector(${JSON.stringify(chip)}), v = e.querySelector('svg'); return e.classList.contains('done') && v.querySelectorAll('.head').length === ${ms.length} && /${f.scale === 'major' ? 'major' : 'natural minor'}$/.test(e.querySelector('.nm').textContent); })()`)) === true;
      if (completedN === 6) await g.shot(`${tag}-shelf-6-six`, h0); if (completedN === 12) await g.shot(`${tag}-shelf-12-twelve`, h0);
      ok.built &&= (await g.text('completed')) === (completedN === 12 ? 'All twelve built.' : `Completed ${completedN} of 12`) && (await g.probe(`document.querySelector(${JSON.stringify(chip)}).classList.contains('done')`)) === true && (await g.text('prompt')).startsWith('Exercise done') && (await g.count('#staff .head')) === ms.length && (await g.count('#staff .head.ghost')) === 0 && (await g.count('#chips')) === 0 && (await g.count('.key.wrong')) === 0 && (await g.count('#letters .letter')) === ms.length - 1 && (await g.probe(`document.getElementById('play').disabled`)) === false;
      // 2026-11-19-0955: the slot of a completed key SHOWS its finished scale in the main staff (it used to restart the build) and keeps its fill; the count does not change; a second tap changes nothing
      await g.press(chip); await sample(`t${t}_shown`);
      ok.completedTapShows &&= (await g.count('#staff .head')) === ms.length && (await g.count('#staff .head.ghost')) === 0 && (await g.text('prompt')).startsWith('Exercise done') && (await g.count('#letters .letter')) === ms.length - 1 && (await g.count('#chips')) === 0 && (await g.count('.key.wrong')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === false && (await g.count('.key.idle')) === 25 && (await g.text('completed')) === (completedN === 12 ? 'All twelve built.' : `Completed ${completedN} of 12`);
      ok.fillKept &&= (await g.probe(`document.querySelector(${JSON.stringify(chip)}).classList.contains('done') && document.querySelector(${JSON.stringify(chip)}).classList.contains('current')`)) === true;
      ok.miniKeptWhileBuilt &&= (await g.count(`${chip} svg .head`)) === ms.length;                   // the completed slot keeps its mini score while it is shown
      { const before = await g.probe(hashOf); await g.press(chip); ok.secondTapChangesNothing &&= (await g.probe(hashOf)) === before; }
      for (let u = 0; u < t; u++) ok.survives &&= (await g.count(`${slot(u)}.done svg .head`)) === ms.length;      // every slot filled before this key is still filled, with its mini score, while this one was built (with all its wrong taps)
    }
    for (const [k, v] of Object.entries(ok)) verdict[`${tag}_real_${k}`] = v;
    verdict[`${tag}_allTwelveBuilt`] = (await g.text('completed')) === 'All twelve built.' && (await g.count('#shelf .slot.done')) === 12;
    verdict[`${tag}_shelf_twelveRealClicksFillTwelveMiniScores`] = (await g.count('#shelf .slot.done svg .head')) === 12 * (f.steps.length + 1) && (await g.count('#shelf .slot.done svg .staffline')) === 12 * 5;
    await g.press('#reset'); completedN = 0; await sample('afterReset');
    verdict[`${tag}_shelf_resetEmptiesTheShelf`] = (await g.count('#shelf .slot.done')) === 0 && (await g.count('#shelf .slot svg *')) === 0 && (await g.count('#shelf > .slot')) === 12;
    verdict[`${tag}_resetClearsCountAndBuild`] = (await g.text('prompt')) === 'Pick a tonic (home note).' && (await g.text('completed')) === 'Completed 0 of 12' && (await g.count('#shelf .slot.done, #shelf .slot.current')) === 0 && (await g.count('#staff .head')) === 0 && (await g.count('.key.tonic, .key.lit, .key.wrong')) === 0 && (await g.probe(`document.getElementById('play').disabled`)) === true;
    verdict[`${tag}_noHorizontalScrollInAnyState`] = hScrolls === 0; verdict[`${tag}_noVerticalScrollInAnyStateAtItsOwnHeight`] = vScrolls === 0; numbers.states[`${tag}`] = states; numbers.heights[name][width] = [...hs];
    verdict[`${tag}_oneHeightInEveryState`] = hs.size === 1;
    numbers.shelfHeights[tag] = Object.fromEntries(Object.entries(byFill).map(([n, v]) => [n, [...v]]));
    verdict[`${tag}_shelf_oneHeightWithTheShelfEmptySixAndTwelveFilled`] = [0, 6, 12].every((n) => byFill[n] && byFill[n].size === 1) && new Set([...byFill[0], ...byFill[6], ...byFill[12]]).size === 1;
    verdict[`${tag}_shelf_theShelfWasRightInEveryState`] = shelfBad === 0;                        // twelve slots, as many filled as completions, every mini score what its state says
    verdict[`${tag}_noErrorsAfterTheSweep`] = (await g.errs()).length === 0;
    g.page.close();

    // ---- 1b. 2026-11-19-0955: a REAL click on the slot of a completed tonic shows its scale in the main staff (the driver: "when clicking a completed scale, please show the scale in the score as well")
    {
      const c = await mount(f.file, width); const embed1b = Math.max(...hs, h0); await c.setHeight(embed1b); const tag1b = `${tag}_completedTapShowsTheScale`;
      const D = 2, E = 9, mD = midisOf(f.steps, D), tD = mD.slice(1, -1), wD = wrongKeysOf(mD)[0], mE = midisOf(f.steps, E);
      const area = () => c.probe(`JSON.stringify({ keys: [].map.call(document.querySelectorAll('#strip .key'), function (k) { var m = k.querySelector('text.mark'); return k.getAttribute('data-midi') + ' ' + k.getAttribute('class') + ' ' + (m ? m.textContent : ''); }), staff: document.getElementById('staff').innerHTML, letters: document.getElementById('letters').innerHTML, chips: (document.getElementById('chips') || { innerHTML: '' }).innerHTML, prompt: document.getElementById('prompt').textContent, hint: document.getElementById('hint').textContent, wrongs: (document.getElementById('wrongs') || { textContent: '' }).textContent, play: document.getElementById('play').disabled })`);
      const accs = (sel) => c.probe(`[].map.call(document.querySelectorAll(${JSON.stringify(sel)}), function (a) { return a.textContent; }).join('')`);
      await c.press(slot(D)); await c.press(`.key[data-midi="${wD}"]`); for (const m of tD) await c.press(`.key[data-midi="${m}"]`);
      const wrongAtEnd = await c.count('.key.wrong'), atTheEnd = await area(), countEnd = await c.text('completed'), hEnd = await c.height();
      await c.press(slot(E)); await c.press(`.key[data-midi="${mE[2]}"]`); const half = await c.height(), underWay = (await c.count('#staff .head')) === 2;
      await c.press(slot(D)); await sleep(150);
      const wrongShown = await c.count('.key.wrong'), shown = await area(), h1 = await c.height(), count1 = await c.text('completed'), shownDom = await c.probe(hashOf);
      const miniAcc = await accs(`${slot(D)} svg .acc`), mainAcc = await accs('#staff .acc'), miniHeads = await c.count(`${slot(D)} svg .head`);
      await c.shot(`${tag}-completedTapShows`, embed1b);
      await c.press(slot(D)); const h2 = await c.height(), sameAgain = (await c.probe(hashOf)) === shownDom;
      await c.press(slot(E)); const restarted = (await c.count('#staff .head')) === 1 && (await c.text('prompt')).startsWith('Exercise: build ');
      verdict[tag1b] = underWay && wrongAtEnd === 0 && wrongShown === 0 && (await c.count('#chips')) === 0 && shown === atTheEnd && count1 === countEnd && countEnd === 'Completed 1 of 12' && sameAgain && restarted
        && miniHeads === mD.length && miniAcc === mainAcc && (await c.count(`${slot(D)}.done`)) === 1 && (await c.count(`${slot(E)}.done`)) === 0 && (await c.count('#shelf .slot.done')) === 1
        && hEnd === half && half === h1 && h1 === h2 && h2 === embed1b && (await c.vScroll()) <= 0 && (await c.errs()).length === 0;
      numbers[`${tag}_completedTapShows`] = { hEnd, half, afterTap: h1, afterSecondTap: h2, count: count1, accidentals: mainAcc };
      c.page.close();
    }

    // ---- 2. a real Play (a completed build, and a build after three wrong taps), the pitches through the real Web Audio graph
    const r = await mount(f.file, width); const embed = Math.max(...hs, h0); await r.setHeight(embed);
    await r.press('#shelf .slot:nth-child(1)');
    await r.clearHz(); await r.press('#play'); await sleep(400); verdict[`${tag}_realPlayOffWhileBuilding`] = (await r.hz()).length === 0;
    for (const [how, t] of [['completed', 0], ['afterWrongTaps', 1]]) {      // 2026-11-19-0994: there is no failed build: the second is a second tonic built after three wrong taps
      const ms = midisOf(f.steps, t), targets = ms.slice(1, -1), wrongs = wrongKeysOf(ms).slice(0, 3);
      if (how === 'afterWrongTaps') { await r.press(`#shelf .slot:nth-child(${t + 1})`); for (const k of wrongs) await r.press(`.key[data-midi="${k}"]`); }
      for (const m of targets) await r.press(`.key[data-midi="${m}"]`);
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
      halfBuilt: async () => { await r.press('#shelf .slot:nth-child(3)'); await r.press(`.key[data-midi="${midisOf(f.steps, 2)[2]}"]`); await r.press(`.key[data-midi="${wrongKeysOf(midisOf(f.steps, 2))[0]}"]`); },
      completed: async () => { await r.press('#shelf .slot:nth-child(5)'); for (const m of midisOf(f.steps, 4).slice(1, -1)) await r.press(`.key[data-midi="${m}"]`); },
      wrongTaps: async () => { await r.press('#shelf .slot:nth-child(8)'); for (const k of wrongKeysOf(midisOf(f.steps, 7)).slice(0, 3)) await r.press(`.key[data-midi="${k}"]`); },
    };
    let rest = true, restUnstable = 0, moved = 0;
    for (const [state, setup] of Object.entries(setups)) {
      await setup(); await park(); const a = await shotNow(); await sleep(250); const a2 = await shotNow(); if (a !== a2) { restUnstable++; continue; }
      const dom0 = await r.probe(hashOf);
      const pts = await r.probe(`(function(){ var out = []; document.querySelectorAll('#shelf .slot, .key, #play, #reset').forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 2 && b.height > 2) out.push({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }); }); return out; })()`);
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
