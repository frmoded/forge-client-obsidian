// 2026-11-19-0900 - the four CIRCLE OF FIFTHS gadgets (circle_of_fifths, circle_exercise_key_to_signature, _signature_to_key, _neighbours) in real headless Chrome, in the SHIPPED mount: a blob: URL inside <iframe sandbox="allow-scripts"> at 800 and at 360 px wide.
// Measured: the CONTENT HEIGHT of each file in every state (the explorer on all twelve sectors and both spellings of the sixth; each exercise on every key in its states), that it is ONE height, that the page does not scroll vertically when the iframe is exactly that tall, and not horizontally;
// one full flow per file with REAL mouse clicks (DevTools Input.dispatchMouseEvent at the real box of each sector, key or button); the explorer's staff, strip and Play (the real Web Audio graph, the pitches heard); and that moving the real pointer over the wheel, the buttons, the staff and the
// strip changes NOTHING (a screenshot and the DOM compared before and after). Light shots.
//   node scripts/dev/measure-circle-gadgets.mjs [--vault ~/projects/music-theory] [--out <dir>] [--only <file fragment>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';

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
for (const f of ['circle_of_fifths', 'circle_exercise_key_to_signature', 'circle_exercise_signature_to_key', 'circle_exercise_neighbours'].filter((x) => !only || x.includes(only))) {
  numbers.heights[f] = {};
  for (const width of [800, 360]) {
    const g = await mount(DIR + f + '.html', width); const hs = new Set(); const tag = `${f}${width}`;
    const click = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()`);
    const sample = async (label) => { const h = await g.height(); hs.add(h); if ((await g.hOverflow()) > 0) verdict[`${tag}_${label}_horizontalScroll`] = false; return h; };
    const text = (sel) => g.probe(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null; })()`);
    const count = (sel) => g.probe(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const seed = (i, alt) => g.probe(`(window.__rnd = ${JSON.stringify(keyRandom(i, alt))}, 1)`);
    verdict[`${tag}_loadsWithoutErrors`] = (await g.errs()).length === 0;
    const h0 = await sample('fresh');
    await g.setHeight(h0); const vs = await g.vScroll(); numbers[`${tag}_vScrollAtItsOwnHeight`] = vs; verdict[`${tag}_noVerticalScrollAtItsOwnHeight`] = vs <= 0; await g.setHeight(900);
    if (f === 'circle_of_fifths') {
      for (let k = 0; k < 12; k++) for (const alt of k === 6 ? [false, true] : [false]) {
        await click(`.seg.major[data-sector="${k}"]`); if (alt) await click(`.seg.major[data-sector="6"]`); await sample(`sector${k}${alt ? 'alt' : ''}`);
        await click('#cw'); await sample(`sector${k}${alt ? 'alt' : ''}_cw`); await click('#ccw'); await click('#ccw'); await sample(`sector${k}${alt ? 'alt' : ''}_ccw`);
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
    } else {
      for (let k = 0; k < 12; k++) {
        await click('#level-hard'); await seed(k, false); await click('#again'); await sample(`k${k}_fresh`);
        await click(`.seg.major[data-sector="${(k + 1) % 12}"]`); await sample(`k${k}_oneRight`);
        await click(`.seg.major[data-sector="${(k + 3) % 12}"]`); await sample(`k${k}_gaveup`);
      }
    }
    numbers.heights[f][width] = [...hs]; verdict[`${tag}_oneHeightInEveryState`] = hs.size === 1;
    if (f !== 'circle_of_fifths') { await click('#level-medium'); await click('#reset'); }
    // ---- real mouse flows -----------------------------------------------------------------------------------------------------------------------------
    await g.setHeight([...hs][0] ?? 600);
    if (f === 'circle_of_fifths') {
      await g.press('.seg.major[data-sector="3"]');
      numbers[`${tag}_sectorClick`] = { title: await text('#title'), sig: await count('.acc.sig'), lit: await count('.key.lit'), seg: await count('.seg.lit'), nb: await count('.seg.nb'), opp: await count('.seg.opp') };
      verdict[`${tag}_realClickSectorSetsKey`] = /^A major/.test(await text('#title')) && (await count('.acc.sig')) === 3 && (await count('.key.lit')) === 8 && (await count('.seg.lit')) === 2 && (await count('.seg.nb')) === 4 && (await count('.seg.opp')) === 2;
      await g.press('#cw'); verdict[`${tag}_realClockwiseSaysWhatChanged`] = /^E major has one more sharp than A major: D becomes D♯\./.test(await text('#change')) && (await count('.acc.sig')) === 4;
      await g.press('#ccw'); await g.press('#ccw'); verdict[`${tag}_realCounterClockwiseGoesBack`] = /^D major has one fewer sharp than A major: G♯ becomes G\./.test(await text('#change'));
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
    } else {
      await g.press('#level-easy'); await seed(0, false); await g.press('#again');
      for (const k of [11, 1, 6]) await g.press(`.seg.major[data-sector="${k}"]`);
      verdict[`${tag}_realFlowFindsNeighboursAndOpposite`] = /^Exercise done\. The neighbours of C major are F major/.test(await text('#prompt')) && /1\/1/.test(await text('#board'));
    }
    // ---- the pointer resting changes nothing --------------------------------------------------------------------------------------------------------
    if (f !== 'circle_of_fifths') await g.press('#level-medium');
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
console.log(JSON.stringify(numbers));
console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every((v) => v === true);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}; shots in ${OUT}`);
process.exit(ok ? 0 : 1);
