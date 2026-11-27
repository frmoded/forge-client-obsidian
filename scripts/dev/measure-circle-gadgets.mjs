// 2026-11-19-0900 - the four CIRCLE OF FIFTHS gadgets (circle_of_fifths, circle_exercise_key_to_signature, _signature_to_key, _neighbours) and, from 2026-11-23-1025, the three RING exercises (circle_exercise_outer_ring, _inner_ring, _signature_counts) and, from 2026-11-25-1041, `hear the distance` (circle_exercise_hear_distance) and the drawing fifths_on_a_line.svg in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts"> at 800 and at 360 px wide.
// Measured: the CONTENT HEIGHT of each file in every state (the explorer on all twelve sectors and both spellings of the sixth; each exercise on every key in its states), that it is ONE height, that the page does not scroll vertically when the iframe is exactly that tall, and not horizontally;
// one full flow per file with REAL mouse clicks (DevTools Input.dispatchMouseEvent at the real box of each sector, key or button); the explorer's staff, strip and Play (the real Web Audio graph, the pitches heard); and that moving the real pointer over the wheel, the buttons, the staff and the
// strip changes NOTHING (a screenshot and the DOM compared before and after). Light shots.
//   node scripts/dev/measure-circle-gadgets.mjs [--vault ~/projects/music-theory] [--out <dir>] [--only <file fragment>[,<another>]]        exit 0 = every verdict true
// A heavy run: start it as `bash scripts/heavy-guard.sh --what "<label>" -- node scripts/dev/measure-circle-gadgets.mjs ...`, one at a time. The three ring exercises (one level each since 2026-11-24-1038) are measured in every state (the first state, every wrong answer, every right tap in turn, built, Start over in the middle and after the end)
// and with real clicks; --vault may be a scratch vault holding the generated files WITH their captions (what the embed height has to include).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';
import { stripSvgCaption } from './caption-core.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/circle-gadgets')).replace(/^~/, os.homedir());
const only = arg('--only', '');
fs.mkdirSync(OUT, { recursive: true });
const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value, t: t }, '*'); return s(t); }; return o; } };
  window.__rnd = []; window.__earRandom = function () { return window.__rnd.length ? window.__rnd.shift() : Math.random(); };
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
const DIR = 'circle_of_fifths/resources/html/';
const NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
const SIGNED = (i, alt) => i === 6 ? (alt ? -6 : 6) : i < 6 ? i : i - 12;
const SECTOR_OF = (name) => NAMES.indexOf(name) >= 0 ? NAMES.indexOf(name) : name === 'G♭' ? 6 : -1;
const verdict = {}, numbers = { heights: {} };
const keyRandom = (i, alt) => i === 6 ? [(6.5) / 12, alt ? 0.25 : 0.75] : [(i + 0.5) / 12];
for (const f of ['circle_of_fifths', 'circle_exercise_key_to_signature', 'circle_exercise_signature_to_key', 'circle_exercise_neighbours', 'circle_exercise_outer_ring', 'circle_exercise_inner_ring', 'circle_exercise_signature_counts', 'circle_exercise_hear_distance'].filter((x) => !only || only.split(',').some((o) => x.includes(o)))) {
  numbers.heights[f] = {};
  for (const width of [800, 360]) {
    const g = await mount(DIR + f + '.html', width); const hs = new Set(); const tag = `${f}${width}`;
    const click = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()`);
    let nSamples = 0; const byLabel = {}; const sample = async (label) => { const h = await g.height(); hs.add(h); nSamples++; byLabel[label] = h; if ((await g.hOverflow()) > 0) verdict[`${tag}_${label}_horizontalScroll`] = false; return h; };
    const text = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`);
    const count = (sel) => g.probe(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const seed = (i, alt) => g.probe(`(window.__rnd = ${JSON.stringify(keyRandom(i, alt))}, 1)`);
    // the ring exercises (one level, always from C): read the lit sector, play the right answer, play a wrong one
    const RING = ['circle_exercise_outer_ring', 'circle_exercise_inner_ring', 'circle_exercise_signature_counts'].includes(f), ONE_LEVEL = RING || f === 'circle_exercise_hear_distance';
    const lit = async (ring) => Number(await g.probe(`(function(){ var e = document.querySelector('.seg.${ring}.lit'); return e ? e.getAttribute('data-sector') : '-1'; })()`));
    const finished = async () => /^Exercise done/.test(await text('#prompt'));
    const wrongTile = async (litSector) => g.probe(`(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#bank button'), function (x) { return !x.disabled && x.id !== 'tile-${litSector}' && !x.classList.contains('wrongbtn'); })[0]; return b ? b.id : null; })()`);
    const countId = (n) => (n === 0 ? 'count-0' : n > 0 ? `count-s${n}` : `count-f${-n}`);
    verdict[`${tag}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await sample('fresh');
    await g.setHeight(h0); const vs = await g.vScroll(); numbers[`${tag}_vScrollAtItsOwnHeight`] = vs; verdict[`${tag}_noVerticalScrollAtItsOwnHeight`] = vs <= 0; await g.setHeight(900);
    if (f === 'circle_of_fifths') {
      for (let k = 0; k < 12; k++) for (const alt of k === 6 ? [false, true] : [false]) {
        await click(`.seg.major[data-sector="${k}"]`); if (alt) await click(`.seg.major[data-sector="6"]`); await sample(`sector${k}${alt ? 'alt' : ''}`);
      }
    } else if (f === 'circle_exercise_key_to_signature') {
      for (let k = 0; k < 12; k++) for (const alt of k === 6 ? [false, true] : [false]) {
        for (const lv of ['easy', 'hard']) {
          await click(`#level-${lv}`); await seed(k, alt); await click('#again'); await sample(`k${k}${alt ? 'alt' : ''}_count`);
          const n = SIGNED(k, alt); const id = n === 0 ? 'count-0' : n > 0 ? `count-s${n}` : `count-f${-n}`;
          await click(`#${id}`); await sample(`k${k}${alt ? 'alt' : ''}_notes`);
          if (lv === 'hard') { await click('.pick[data-letter="0"]'); await sample(`k${k}${alt ? 'alt' : ''}_gaveup`); }
        }
      }
    } else if (f === 'circle_exercise_signature_to_key') {
      for (let k = 0; k < 12; k++) for (const alt of k === 6 ? [false, true] : [false]) {
        await click('#level-hard'); await seed(k, alt); await click('#again'); await sample(`k${k}${alt ? 'alt' : ''}_fresh`);
        await click(`.seg.major[data-sector="${k}"]`); await sample(`k${k}${alt ? 'alt' : ''}_oneRight`);
        await click(`.seg.minor[data-sector="${(k + 5) % 12}"]`); await sample(`k${k}${alt ? 'alt' : ''}_gaveup`);
      }
    } else if (f === 'circle_exercise_hear_distance') {
      // 2026-11-25-1041: every state of the page: fresh; one key picked (all twelve); two keys picked (every one of the 144 pairs: the longest rows are the far pairs and F-sharp's); a new pair after a third tap; the same key twice; Pair A and Pair B marked on the wheel; a wrong answer, a right answer,
      // Next pair (40 draws, each answered wrong then right); Start over in the middle and after an answer. One height in all of them (the rows have a fixed minimum height).
      const sectors = [...Array(12).keys()];
      for (const k of sectors) { await click(`.seg.major[data-sector="${k}"]`); await sample(`one${k}`); for (let j = 0; j < 12; j++) { await click(`.seg.major[data-sector="${k}"]`); await click(`.seg.minor[data-sector="${j}"]`); await sample(`pair${k}_${j}`); } }
      await click('#playA'); await sample('pairA_playing'); await sleep(8600); await click('#playB'); await sample('pairB_playing'); await sleep(8600);
      for (let n = 0; n < 40; n++) {
        await click('#next'); await sample(`next${n}`);
        const wrongB = n % 2 ? 'ansA' : 'ansB'; await click(`#${wrongB}`); await sample(`answered${n}`); await click('#ansA'); await click('#ansB'); await sample(`answeredBoth${n}`);
      }
      await click('#startover'); await sample('startedOver'); await click('.seg.major[data-sector="6"]'); await click('.seg.major[data-sector="0"]'); await click('#ansA'); await click('#startover'); await sample('startedOverAfterAnswer');
    } else if (RING) {
      const tiles = f !== 'circle_exercise_signature_counts', ring = f === 'circle_exercise_inner_ring' ? 'minor' : 'major';
      await sample('fresh');
      if (tiles) { for (let guard = 0; guard < 12; guard++) { const w = await wrongTile(await lit(ring)); if (!w) break; await click(`#${w}`); await sample(`wrong${guard}`); } }
      else { const first = await lit('major'); for (const n of [1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5, -6, 0].filter((n) => n !== SIGNED(first, false))) { await click(`#${countId(n)}`); await sample(`wrong${n}`); } await g.probe(`(function(){ var t = document.getElementById('typed'); t.value = 'x'; document.getElementById('typedgo').dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()`); await sample('unreadable'); }
      await click('#startover'); await sample('startedOver');
      for (let guard = 0; guard < 40 && !(await finished()); guard++) {
        const c = await lit(ring);
        if (tiles) { const w = await wrongTile(c); if (w) { await click(`#${w}`); await sample(`step${guard}_wrong`); } await click(`#tile-${c}`); }
        else { await click(`#${countId(c === 0 ? 1 : 0)}`); await sample(`step${guard}_wrong`); await click(`#${countId(SIGNED(c, false))}`); }
        await sample(`step${guard}`);
      }
      await sample('built'); await click('#startover'); await sample('startedOverAfterTheEnd');
    } else {
      for (let k = 0; k < 12; k++) {
        await click('#level-hard'); await seed(k, false); await click('#again'); await sample(`k${k}_fresh`);
        await click(`.seg.major[data-sector="${(k + 1) % 12}"]`); await sample(`k${k}_oneRight`);
        await click(`.seg.major[data-sector="${(k + 3) % 12}"]`); await sample(`k${k}_gaveup`);
      }
    }
    numbers.heights[f][width] = [...hs]; numbers[`${tag}_statesSampled`] = nSamples; if (hs.size > 1) { /* which states differ, when they do */ const mode = Object.values(byLabel).sort((a, b) => Object.values(byLabel).filter((x) => x === a).length - Object.values(byLabel).filter((x) => x === b).length).pop(); numbers[`${tag}_statesNotAtTheCommonHeight`] = Object.entries(byLabel).filter(([, h]) => h !== mode).slice(0, 12); }  verdict[`${tag}_oneHeightInEveryState`] = hs.size === 1;
    if (f !== 'circle_of_fifths' && !ONE_LEVEL) { await click('#level-medium'); await click('#reset'); }
    // ---- real mouse flows -----------------------------------------------------------------------------------------------------------------------------
    await g.setHeight([...hs][0] ?? 600);
    if (f === 'circle_of_fifths') {
      await g.press('.seg.major[data-sector="3"]');
      numbers[`${tag}_sectorClick`] = { title: await text('#title'), sig: await count('.acc.sig'), lit: await count('.key.lit'), seg: await count('.seg.lit'), nb: await count('.seg.nb'), opp: await count('.seg.opp') };
      verdict[`${tag}_realClickSectorSetsKey`] = /^A major/.test(await text('#title')) && (await count('.acc.sig')) === 3 && (await count('.key.lit')) === 8 && (await count('.seg.lit')) === 2 && (await count('.seg.nb')) === 4 && (await count('.seg.opp')) === 2;
      verdict[`${tag}_noStepButtons`] = (await count('#cw, #ccw')) === 0 && JSON.stringify(await g.probe(`Array.prototype.map.call(document.querySelectorAll('button'), function (b) { return b.textContent.trim(); })`)) === JSON.stringify(['Play']) && (await text('#change')) === 'Choose a key on the wheel.' && !/Clockwise/.test(await g.probe('document.body.innerText'));
      await g.press('.seg.major[data-sector="4"]'); verdict[`${tag}_realSecondTapSetsTheKeyToo`] = /^E major/.test(await text('#title')) && (await count('.acc.sig')) === 4;
      await g.press('.seg.major[data-sector="8"]'); verdict[`${tag}_flatKeyShowsFlats`] = (await count('.acc.sig')) === 4 && /^A♭ major/.test(await text('#title'));
      await g.clearHz(); await g.press('#play'); await sleep(4600); const hz = await g.hz();
      verdict[`${tag}_realPlaySoundsTheScale`] = hz.length >= 8 && hz.length % 8 === 0 && JSON.stringify(hz.filter((_, i) => i % (hz.length / 8) === 0).map((x) => (Math.round(69 + 12 * Math.log2(x / 440)) + 1200) % 12)) === JSON.stringify([8, 10, 0, 1, 3, 5, 7, 8]);
    } else if (f === 'circle_exercise_key_to_signature') {
      await g.press('#level-easy'); await seed(2, false); await g.press('#again');
      await g.press('#count-s2'); await g.press('.pick[data-letter="3"]'); await g.press('.pick[data-letter="0"]');
      verdict[`${tag}_realFlowBuildsTheSignature`] = /^Exercise done: D major has 2 sharps: F♯, C♯\./.test(await text('#prompt')) && /1\/1/.test(await text('#board'));
    } else if (f === 'circle_exercise_signature_to_key') {
      await g.press('#level-easy'); await seed(9, false); await g.press('#again');
      await g.press('.seg.major[data-sector="9"]'); await g.press('.seg.minor[data-sector="9"]');
      verdict[`${tag}_realFlowNamesKeyAndRelativeMinor`] = /^Exercise done\. This signature has 3 flats .*it is E♭ major, and its relative minor is Cm|its relative minor is C minor/.test(await text('#prompt')) && /1\/1/.test(await text('#board'));
    } else if (f === 'circle_exercise_outer_ring') {
      await g.press('#tile-11'); verdict[`${tag}_realWrongTileSaysWhy`] = /F is a fourth above C, not a fifth\.$/.test(await text('#prompt')) && (await count('.seg.major.found')) === 1;
      for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) await g.press(`#tile-${k}`);
      verdict[`${tag}_realFlowBuildsTheOuterRing`] = /^Exercise done\. The outer ring, clockwise from C: C, G, D, A, E, B, F♯\/G♭, D♭, A♭, E♭, B♭, F\./.test(await text('#prompt')) && (await count('.seg.major.found')) === 12;
      await g.press('#startover'); verdict[`${tag}_realStartOverClearsTheRing`] = (await count('.seg.major.found')) === 1 && /^Exercise: build the outer ring\. C is given at the top\./.test(await text('#prompt')) && (await count('#bank button.wrongbtn')) === 0;
    } else if (f === 'circle_exercise_inner_ring') {
      await g.press('#tile-1'); verdict[`${tag}_realWrongSaysThreeHalfSteps`] = /three half steps below its major\.$/.test(await text('#prompt'));
      for (let k = 0; k < 12; k++) await g.press(`#tile-${k}`);
      verdict[`${tag}_realFlowBuildsTheInnerRing`] = /^Exercise done\. Each relative minor is three half steps below its major: Am under C/.test(await text('#prompt')) && (await count('.seg.minor.found')) === 12;
      await g.press('#startover'); verdict[`${tag}_realStartOverClearsTheRing`] = (await count('.seg.minor.found')) === 0 && /^Exercise: build the inner ring\. /.test(await text('#prompt'));
    } else if (f === 'circle_exercise_hear_distance') {
      const facts = () => g.probe(`Array.prototype.map.call(document.querySelectorAll('#facts div'), function (d) { return d.textContent; })`);
      const silent = async () => { for (let i = 0; i < 60 && (await g.probe(`document.getElementById('playA').disabled`)); i++) await sleep(250); };
      await g.press('#startover'); await g.press('.seg.major[data-sector="3"]'); await g.press('.seg.minor[data-sector="4"]');
      verdict[`${tag}_realPickTwoWritesTheNotes`] = JSON.stringify(await facts()) === JSON.stringify(['A major: A B C♯ D E F♯ G♯', 'E major: E F♯ G♯ A B C♯ D♯', 'A major shares 6 of 7 notes with E major, one step apart.', 'Shared: A, B, C♯, E, F♯ and G♯. Different: A has D, E has D♯.']) && (await count('.seg.lit')) === 2 && (await count('.seg.second')) === 2;
      await g.clearHz(); await g.press('#play'); await sleep(9200); const hz = await g.hz();
      verdict[`${tag}_realPlaySoundsTheTwoScales`] = hz.length >= 16 && hz.length % 16 === 0 && JSON.stringify(hz.filter((_, i) => i % (hz.length / 16) === 0).map((x) => (Math.round(69 + 12 * Math.log2(x / 440)) + 1200) % 12)) === JSON.stringify([9, 11, 1, 2, 4, 6, 8, 9, 4, 6, 8, 9, 11, 1, 3, 4]);
      await silent();
      await g.clearHz(); await g.press('#playB'); await sleep(300); verdict[`${tag}_realPlayMarksThePairAndLocksPlay`] = /\bnow\b/.test(await g.probe(`document.getElementById('pairB').className`)) && (await g.probe(`document.getElementById('playA').disabled`)) === true && (await count('.seg.sounding')) === 2; await sleep(8800); await silent();
      verdict[`${tag}_realPlayPairBSoundsSixteenNotes`] = (await g.hz()).length >= 16 && (await g.hz()).length % 16 === 0;
      await g.press('#ansA'); const r1 = await text('#result'); const first = /^Right\. /.test(r1); if (!first) await g.press('#ansB'); const r2 = await text('#result');
      const why = /A is \w+ steps? apart: they share \w+ notes\. B is \w+ steps? apart: they share \w+\./;
      verdict[`${tag}_realAnswersSayWhy`] = first ? /^Right\. /.test(r1) && why.test(r1) : /^Not that one\. /.test(r1) && why.test(r1) && /The pair that shares more notes sounds closer\.$/.test(r1) && /^Right\. /.test(r2) && why.test(r2);
      await g.press('#next'); verdict[`${tag}_realNextPairClearsTheAnswer`] = /^Play both pairs, then tap A or B/.test(await text('#result'));
      await g.press('#startover'); verdict[`${tag}_realStartOverClearsThePicks`] = (await facts()).length === 0 && (await count('.seg.lit')) === 0 && /^Pick two keys on the wheel/.test(await text('#prompt'));
      verdict[`${tag}_noRemovedControl`] = (await count('#levels, #choose, #start, #random, #again, #reset, #counter, #board, #hint, #nostaff, select, [id^="level-"]')) === 0 && JSON.stringify(await g.probe(`Array.prototype.map.call(document.querySelectorAll('button'), function (b) { return b.textContent.trim(); })`)) === JSON.stringify(['Play', 'Play', 'Play', 'A', 'B', 'Next pair', 'Start over']);
    } else if (f === 'circle_exercise_signature_counts') {
      await g.press('#count-s1'); verdict[`${tag}_realWrongSaysWhichWay`] = /where the sharps and the flats start/.test(await text('#prompt'));
      for (let k = 0; k < 12; k++) await g.press(`#${countId(SIGNED(k, false))}`);
      verdict[`${tag}_realFlowAddsEveryCount`] = /^Exercise done\. C has no sharps or flats\./.test(await text('#prompt')) && (await count('.seg.major.found')) === 12;
      await g.press('#startover'); await g.probe(`(function(){ var t = document.getElementById('typed'); t.value = '0'; return 1; })()`); await g.press('#typedgo');
      verdict[`${tag}_realTypedCountIsRead`] = (await text('.seg.major[data-sector="0"] .count')) === '0';
      verdict[`${tag}_staffIsAlwaysShown`] = (await g.probe(`getComputedStyle(document.getElementById('staff')).display`)) !== 'none' && (await count('#nostaff')) === 0;
    } else {
      await g.press('#level-easy'); await seed(0, false); await g.press('#again');
      for (const k of [11, 1, 6]) await g.press(`.seg.major[data-sector="${k}"]`);
      verdict[`${tag}_realFlowFindsNeighboursAndOpposite`] = /^Exercise done\. The neighbours of C major are F major/.test(await text('#prompt')) && /1\/1/.test(await text('#board'));
    }
    if (RING) verdict[`${tag}_noRemovedControl`] = (await count('#levels, #choose, #start, #random, #again, #reset, #counter, #board, #hint, #nostaff, select, [id^="level-"]')) === 0 && (await g.probe(`Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return !/^(tile-|count-)/.test(b.id) && b.id !== 'startover' && b.id !== 'typedgo'; }).length`)) === 0 && (await text('#startover')) === 'Start over';
    // ---- the pointer resting changes nothing --------------------------------------------------------------------------------------------------------
    if (f !== 'circle_of_fifths' && !ONE_LEVEL) await g.press('#level-medium');
    const snap = async () => ({ dom: await g.probe('document.body.innerHTML.length + ":" + Array.prototype.reduce.call(document.body.innerHTML, function (a, c) { return (a * 31 + c.charCodeAt(0)) | 0; }, 7)'), px: (await g.page.send('Page.captureScreenshot', { format: 'png' })).data });
    const before = await snap(); let moved = 0;
    for (const sel of ['.seg', 'button', '#staff', '#strip', '#prompt', '.wheelbox']) {
      const c = await g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
      if (!c) continue; moved++;
      await g.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); await sleep(450);
    }
    const after = await snap(); await g.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    verdict[`${tag}_pointerRestingChangesNothing`] = moved >= 3 && before.dom === after.dom && before.px === after.px;
    await sleep(150); verdict[`${tag}_realNoErrors`] = (await g.errs()).length === 0;
    await g.shot(`${f}-${width}`, [...hs][0] ?? 600);
    g.page.close();
  }
}
// ---- the drawing fifths_on_a_line.svg (2026-11-25-1041): its rendered height as an <img> in a 800 px and a 360 px wide column, with its caption and without it, and a screenshot of each -----------------------------------------------------------------------------------
if (!only || only.split(',').some((o) => 'fifths_on_a_line'.includes(o) || o.includes('fifths_on_a_line'))) {
  const REL = 'circle_of_fifths/resources/images/fifths_on_a_line.svg';
  if (fs.existsSync(path.join(VAULT, REL))) {
    const withCap = fs.readFileSync(path.join(VAULT, REL), 'utf8'), bare = stripSvgCaption(withCap); numbers.svg = {};
    for (const [label, svg] of [['captioned', withCap], ['bare', bare]]) for (const width of [800, 360]) {
      const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div style="width:${width}px"><img id="i" alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;max-width:100%;height:auto"></div>`;
      const page = await openPage({ dir: VAULT, width: width + 20, height: 700, pageHtml: html }); await sleep(500);
      const box = await page.ev(`(function () { var b = document.getElementById('i').getBoundingClientRect(); return { w: b.width, h: b.height, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      numbers.svg[`${label}${width}`] = { w: Math.round(box.w * 100) / 100, h: Math.round(box.h * 100) / 100 }; verdict[`svg_${label}${width}_noHorizontalScroll`] = box.doc <= 0 && box.w <= width + 0.01;
      await page.shot(path.join(OUT, `fifths_on_a_line-${label}-${width}.png`), { x: 0, y: 0, width, height: Math.ceil(box.h) });
      page.close();
    }
    // 2026-11-25-1043: the geometry as Chrome lays the text out, the captioned svg inline in the column: the rendered size of every caption row (the line is 11 px in a 360 px column), the rows inside the picture, the two arrow labels apart from
    // each other and clear of the curves (gapUnderLabels: from the bottom of `C to G` / `B to F♯` to the top of its arch, in viewBox units; the stroke takes 1.75 of it)
    numbers.svgText = {};
    for (const width of [800, 360]) {
      const page = await openPage({ dir: VAULT, width: width + 20, height: 700, pageHtml: `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><style>svg{display:block;max-width:100%;height:auto}</style><div style="width:${width}px">${withCap}</div>` }); await sleep(500);
      const t = await page.ev(`(function () {
        var s = document.querySelector('svg'), vb = s.viewBox.baseVal, scale = s.getBoundingClientRect().width / vb.width;
        var box = function (e) { var b = e.getBBox(); return { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height }; };
        var all = function (sel) { return Array.prototype.map.call(s.querySelectorAll(sel), box); };
        var apart = function (a, c) { return a.r <= c.x || c.r <= a.x || a.b <= c.y || c.b <= a.y; };
        var inside = function (b) { return b.x >= 0 && b.y >= 0 && b.r <= vb.width && b.b <= vb.height; };
        var mark = Array.prototype.filter.call(s.childNodes, function (n) { return n.nodeType === 8 && /^ caption-box /.test(n.nodeValue); })[0];
        var rows = Array.prototype.map.call(mark.nextElementSibling.querySelectorAll('text'), function (e) { var b = box(e); b.px = parseFloat(e.getAttribute('font-size')) * scale; return b; });
        var labels = all('text.arrowlabel'), where = all('text.arrowwhere'), arrows = all('path.arrow');
        var round = function (n) { return Math.round(n * 100) / 100; };
        return { scale: round(scale), captionPx: rows.map(function (r) { return round(r.px); }), captionRowRight: rows.map(function (r) { return round(r.r); }), rowsInside: rows.every(inside), labelsInside: labels.concat(where).every(inside),
          labelsApart: apart(labels[0], labels[1]) && apart(where[0], where[1]), labelGap: round(labels[1].x - labels[0].r), gapUnderLabels: where.map(function (w, i) { return round(arrows[i].y - w.b); }), arches: arrows.map(function (a) { return [round(a.r - a.x), round(a.b - a.y)]; }),
          labelPx: Array.prototype.map.call(s.querySelectorAll('text.arrowlabel, text.arrowwhere'), function (e) { return round(parseFloat(e.getAttribute('font-size')) * scale); }) };
      })()`);
      numbers.svgText[width] = t;
      verdict[`svg_text${width}_captionRowsInside`] = t.rowsInside && t.captionPx.length >= 2; verdict[`svg_text${width}_labelsInsideAndApart`] = t.labelsInside && t.labelsApart; verdict[`svg_text${width}_labelsClearOfTheArches`] = t.gapUnderLabels.every((v) => v >= 4);
      if (width === 360) verdict.svg_text360_captionLineIsElevenPx = t.captionPx.slice(1).every((p) => p >= 10.9 && p <= 11.2);
      page.close();
    }
  }
}
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
