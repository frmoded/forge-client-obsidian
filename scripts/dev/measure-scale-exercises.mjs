// 2026-11-17-2003 (2026-11-18-0930: the three FULL files only; scale_build_major and _natural_minor are the SIMPLE variant, measured by scripts/dev/measure-scale-build-simple.mjs) - the SCALE EXERCISE widgets (_modes_and_minor, _other_scales, scale_ear_build_the_scale) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts">, at 800 px
// and at 360 px wide. Measured: the CONTENT HEIGHT of each file (the body's own height) in every state for EVERY scale of the file on all twelve tonics (fresh, half built, built, out of wrong taps), that it is ONE height, that the page
// does not scroll vertically when the iframe is exactly that tall, and not horizontally; one full exercise per file with REAL mouse clicks (DevTools Input.dispatchMouseEvent at the real box of each key): a right key lights and puts a head
// on the staff, a wrong key marks and puts none, the end shows the letters and the whole and half steps, Play sounds every note of the scale with the real Web Audio graph; light and dark shots (no gadget has a dark theme: dark = the same page).
// 2026-11-19-0938: the SHELF of twelve tonic slots under the build area (verdicts named `<file><width>_shelf_...`): in the sweep (every scale, every tonic, every state) the shelf has twelve slots, as many filled slots as completions of the scale chosen, a mini score of
// the scale's heads in every filled slot and nothing in the others, the line "Completed n of N" right; the grid is 4 x 3 at 800 px and 3 x 4 at 360 px (real boxes), the twelve slots have one size, and with twelve filled the names (two lines for "G sharp diminished (half-whole)")
// fit their slots in EVERY scale of the file; ONE height with the shelf empty, six and twelve filled (and in every other state); with REAL clicks on all twelve slots of the first scale the shelf fills to twelve mini scores, the other scale shows an empty shelf and the first
// one twelve filled again (the memory), Reset empties it; shots (light and dark) with the shelf empty, six filled and twelve filled.
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
    count: (sel) => probe(`document.querySelectorAll(${JSON.stringify(sel)}).length`), text: (id) => probe(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`),
    /** [slot count, filled slots, slots whose mini score is not what its state says] (filled: `heads` heads, five staff lines, a clef, two tonic heads; empty: nothing drawn) */
    shelfNow: (heads) => probe(`(function () { var s = document.querySelectorAll('#shelf > .slot'), filled = 0, bad = 0; s.forEach(function (e) { var v = e.querySelector('svg'), n = v.querySelectorAll('.head').length; if (e.classList.contains('done')) { filled++; if (n !== ${heads} || v.querySelectorAll('.staffline').length !== 5 || v.querySelectorAll('path').length !== 1 || v.querySelectorAll('.head.tonic').length !== 2) bad++; } else if (v.children.length) bad++; }); return s.length + ':' + filled + ':' + bad; })()`),
    /** the real boxes of the shelf: columns, rows, one size, every name and mini score inside its slot */
    shelfGeo: () => probe(`(function () { var r = [].map.call(document.querySelectorAll('#shelf > .slot'), function (e) { var b = e.getBoundingClientRect(), n = e.querySelector('.nm').getBoundingClientRect(), m = e.querySelector('svg').getBoundingClientRect(), shown = e.classList.contains('done'); return { x: Math.round(b.left), y: Math.round(b.top), size: Math.round(b.width * 10) + 'x' + Math.round(b.height * 10), fits: n.bottom <= b.bottom + 0.5 && n.right <= b.right + 0.5 && n.left >= b.left - 0.5 && (!shown || (m.bottom <= n.top + 0.5 && m.top >= b.top - 0.5 && m.left >= b.left - 0.5 && m.right <= b.right + 0.5)) }; }); return { boxes: r.length, colCount: new Set(r.map(function (q) { return q.x; })).size, rowCount: new Set(r.map(function (q) { return q.y; })).size, sizes: new Set(r.map(function (q) { return q.size; })).size, fits: r.every(function (q) { return q.fits; }), tracks: getComputedStyle(document.getElementById('shelf')).gridTemplateColumns.split(' ').length }; })()`),
    height: () => probe('Math.ceil(document.body.getBoundingClientRect().bottom)'),
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
const verdict = {}, numbers = { heights: {}, combos: {}, shelfHeights: {}, shelfGrid: {} };
// the page's own model of the exercise on screen, read from its DOM (the keys that are the scale are not in the DOM before the end: ask the pure core, which the page exports nowhere; so derive the midis from the player's recipe table)
const STEPS = { major: [2, 2, 1, 2, 2, 2, 1], natural_minor: [2, 1, 2, 2, 1, 2, 2], harmonic_minor: [2, 1, 2, 2, 1, 3, 1], melodic_minor: [2, 1, 2, 2, 2, 2, 1], ionian: [2, 2, 1, 2, 2, 2, 1], dorian: [2, 1, 2, 2, 2, 1, 2], phrygian: [1, 2, 2, 2, 1, 2, 2], lydian: [2, 2, 2, 1, 2, 2, 1], mixolydian: [2, 2, 1, 2, 2, 1, 2], aeolian: [2, 1, 2, 2, 1, 2, 2], locrian: [1, 2, 2, 1, 2, 2, 2], major_pentatonic: [2, 2, 3, 2, 3], minor_pentatonic: [3, 2, 2, 3, 2], blues: [3, 2, 1, 1, 3, 2], whole_tone: [2, 2, 2, 2, 2, 2], diminished_wh: [2, 1, 2, 1, 2, 1, 2, 1], diminished_hw: [1, 2, 1, 2, 1, 2, 1, 2] };
const midisOf = (tonic, id) => { const out = [60 + tonic]; for (const s of STEPS[id]) out.push(out[out.length - 1] + s); return out; };
for (const f of FILES.filter((x) => !only || x.file.includes(only))) {
  const name = path.basename(f.file, '.html'); numbers.heights[name] = {};
  for (const width of [800, 360]) {
    const g = await mount(f.file, width); const hs = new Set(); let combos = 0, shelfBad = 0, lineBad = 0; const byFill = {}, exp = { filled: 0, total: 0, heads: STEPS[f.scales[0]].length + 1 }, N = f.scales.length * 12;
    const click = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()`);
    const choose = (id, v) => g.probe(`(function(){ var e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const sample = async (label) => {
      const h = await g.height(); hs.add(h); (byFill[exp.filled] ??= new Set()).add(h); if ((await g.hOverflow()) > 0) verdict[`${name}${width}_${label}_horizontalScroll`] = false;
      const sh = await g.shelfNow(exp.heads); if (sh !== `12:${exp.filled}:0`) { shelfBad++; console.log(`${name}${width}: the shelf says ${sh} in ${label}, expected 12:${exp.filled}:0`); }
      const line = await g.text('completed'); if (line !== (exp.total >= N ? `All ${N} built.` : `Completed ${exp.total} of ${N} (${f.scales.length} scales, 12 tonics each)`)) { lineBad++; console.log(`${name}${width}: the line says "${line}" in ${label}`); }
      return h;
    };
    verdict[`${name}${width}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await sample('fresh');
    await g.setHeight(h0); verdict[`${name}${width}_noVerticalScrollAtItsOwnHeight`] = (await g.vScroll()) <= 0; await g.setHeight(900);
    { const geo = await g.shelfGeo(); verdict[`${name}${width}_shelf_gridIs${width === 800 ? '4x3' : '3x4'}`] = geo.boxes === 12 && geo.tracks === (width === 800 ? 4 : 3) && geo.colCount === (width === 800 ? 4 : 3) && geo.rowCount === (width === 800 ? 3 : 4); verdict[`${name}${width}_shelf_twelveSlotsOfOneSize`] = geo.sizes === 1; verdict[`${name}${width}_shelf_emptySlotNamesInsideTheirBoxes`] = geo.fits === true; numbers.shelfGrid[`${name}@${width}`] = geo; }
    // every scale of the file, all twelve tonics, four states
    for (const [si, id] of f.scales.entries()) for (let t = 0; t < 12; t++) {
      await choose('scale', id); await choose('tonic', String(t)); await click('#level-hard');
      const ms = midisOf(t, id); const targets = ms.slice(1, -1);
      exp.filled = t; exp.total = si * 12 + t; exp.heads = ms.length;                        // t tonics of THIS scale are built; si * 12 + t pairs of the file
      await sample(`${id}${t}_fresh`);
      await click('#level-medium'); await click(`.key[data-midi="${targets[0]}"]`); await sample(`${id}${t}_oneFound`);
      for (const m of targets) await click(`.key[data-midi="${m}"]`); exp.filled = t + 1; exp.total = si * 12 + t + 1; await sample(`${id}${t}_built`);
      if (t === 11) { const geo = await g.shelfGeo(); verdict[`${name}${width}_shelf_${id}_twelveFilledNamesAndScoresFitTheirSlots`] = geo.fits === true && geo.sizes === 1; }
      await click('#level-hard'); const wrongKey = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map((x) => x + 0).find((x) => !ms.includes(x) && x > ms[0] && x < ms[ms.length - 1]) ?? 83;
      await click(`.key[data-midi="${wrongKey}"]`); await sample(`${id}${t}_gaveUp`);
      combos++;
    }
    numbers.combos[`${name}@${width}`] = combos; numbers.heights[name][width] = [...hs];
    verdict[`${name}${width}_oneHeightInEveryScaleTonicAndState`] = hs.size === 1;
    numbers.shelfHeights[`${name}@${width}`] = Object.fromEntries(Object.entries(byFill).map(([n, v]) => [n, [...v]]));
    verdict[`${name}${width}_shelf_oneHeightWithTheShelfEmptySixAndTwelveFilled`] = [0, 6, 12].every((n) => byFill[n] && byFill[n].size === 1) && new Set([...byFill[0], ...byFill[6], ...byFill[12]]).size === 1;
    verdict[`${name}${width}_shelf_theShelfWasRightInEveryScaleTonicAndState`] = shelfBad === 0;          // twelve slots, as many filled as the scale's completions, every mini score what its state says
    verdict[`${name}${width}_shelf_theCompletedLineWasRightInEveryState`] = lineBad === 0;                   // "Completed n of N (k scales, 12 tonics each)", then "All N built."
    verdict[`${name}${width}_shelf_everyScaleShowedTwelveFilled`] = f.scales.length * 12 === exp.total;
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
    // the shelf with REAL clicks: shots empty / six / twelve filled; the twelve slots of the first scale fill with their mini scores; another scale shows an empty shelf and the first one is remembered; Reset empties it
    const embed = [...hs][0] ?? 400; await r.setHeight(embed); const shelfTag = `${name}-${width}`;
    await r.press('#reset'); await sleep(150); verdict[`${name}${width}_shelf_realResetStartsWithAnEmptyShelf`] = (await r.shelfNow(STEPS[first].length + 1)) === '12:0:0';
    await r.shot(`${shelfTag}-shelf-0-empty`, embed);
    let realOk = true, realSix = true;
    for (let t = 0; t < 12; t++) {
      await r.press(`#shelf .slot:nth-child(${t + 1})`); const mt = midisOf(t, first), tg = mt.slice(1, -1);
      realOk = realOk && (await r.probe(`+document.getElementById('tonic').value`)) === t && (await r.count('#staff .head')) === 1;              // a slot tap starts that tonic (the select follows)
      for (const m of tg) await r.press(`.key[data-midi="${m}"]`);
      realOk = realOk && (await r.shelfNow(mt.length)) === `12:${t + 1}:0` && (await r.count(`#shelf .slot:nth-child(${t + 1}).done svg .head`)) === mt.length;
      if (t === 5) { realSix = (await r.shelfNow(mt.length)) === '12:6:0'; await r.shot(`${shelfTag}-shelf-6-six`, embed); }
    }
    await r.shot(`${shelfTag}-shelf-12-twelve`, embed);
    verdict[`${name}${width}_shelf_realClicksOnTwelveSlotsFillTwelveMiniScores`] = realOk && (await r.count('#shelf .slot.done svg .head')) === 12 * (STEPS[first].length + 1);
    verdict[`${name}${width}_shelf_realSixFilledAfterSixSlots`] = realSix;
    verdict[`${name}${width}_shelf_realHeightIsTheSweepsHeightWithTwelveFilled`] = (await r.height()) === embed;
    verdict[`${name}${width}_shelf_realNoVerticalScrollWithTwelveFilled`] = (await r.vScroll()) <= 0;
    if (f.scales.length > 1) {
      const second = f.scales[1]; await r.probe(`(function(){ var e = document.getElementById('scale'); e.value = ${JSON.stringify(second)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      verdict[`${name}${width}_shelf_otherScaleShowsAnEmptyShelf`] = (await r.shelfNow(STEPS[second].length + 1)) === '12:0:0' && (await r.text('completed')).startsWith('Completed 12 of ');
      await r.press('#shelf .slot:nth-child(3)'); for (const m of midisOf(2, second).slice(1, -1)) await r.press(`.key[data-midi="${m}"]`);
      verdict[`${name}${width}_shelf_otherScaleFillsItsOwnSlot`] = (await r.count('#shelf .slot.done')) === 1 && (await r.count('#shelf .slot:nth-child(3).done svg .head')) === STEPS[second].length + 1;
      await r.probe(`(function(){ var e = document.getElementById('scale'); e.value = ${JSON.stringify(first)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      verdict[`${name}${width}_shelf_firstScaleIsRememberedWithTwelveFilled`] = (await r.shelfNow(STEPS[first].length + 1)) === '12:12:0' && (await r.text('completed')).startsWith('Completed 13 of ');
    }
    await r.press('#reset'); await sleep(150); verdict[`${name}${width}_shelf_realResetEmptiesTheShelf`] = (await r.shelfNow(STEPS[first].length + 1)) === '12:0:0' && (await r.count('#shelf .slot svg *')) === 0;
    r.page.close();
  }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
