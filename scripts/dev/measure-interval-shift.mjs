// 2026-11-12-1207 - the interval widget's SHIFT tab in real headless Chrome, in the SHIPPED mount: the page is a blob: URL inside <iframe sandbox="allow-scripts"> (what html-embed makes), 800 px wide. Real mouse clicks (DevTools
// Input.dispatchMouseEvent at the real box of each control), the oscillators the real Web Audio graph is asked for counted, and the content height of ALL FOUR tabs at that mount (tallest state each).
// The gadget file itself is unchanged: the SERVED copy has ONE instrumentation block before its script (it reports each oscillator start, page errors and answers probes to the parent through postMessage; the iframe has an opaque
// origin, so the parent cannot read it any other way). Light and dark: no gadget has a dark theme, so the dark shots are the same page under prefers-color-scheme: dark.
//   node scripts/dev/measure-interval-shift.mjs [--vault ~/projects/music-theory] [--out <dir for the screenshots>]     exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openPage, sleep } from './cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const VAULT = arg('--vault', path.join(os.homedir(), 'projects/music-theory')).replace(/^~/, os.homedir());
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/measure/shots')).replace(/^~/, os.homedir());
const GADGET = path.join(VAULT, 'music_instruments/resources/html/interval_widget.html');
fs.mkdirSync(OUT, { recursive: true });

const INSTRUMENT = `<script>(function () {
  var A = window.AudioContext;
  window.AudioContext = class extends A { createOscillator() { var o = super.createOscillator(), s = o.start.bind(o); o.start = function (t) { parent.postMessage({ hz: o.frequency.value }, '*'); return s(t); }; return o; } };
  window.addEventListener('error', function (e) { parent.postMessage({ err: String(e.message) }, '*'); });
  window.addEventListener('message', function (e) { if (e.data && e.data.q) { var r; try { r = (0, eval)(e.data.q); } catch (x) { r = 'ERR ' + x; } parent.postMessage({ a: e.data.id, r: r }, '*'); } });
})();</script>
`;
const served = fs.readFileSync(GADGET, 'utf8').replace('<script>', INSTRUMENT + '<script>');
const host = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<iframe id="f" sandbox="allow-scripts" style="width:800px;height:1500px;border:0;display:block"></iframe>
<script>
  window.__hz = []; window.__err = []; window.__ans = {}; var n = 0;
  window.addEventListener('message', function (e) { var d = e.data || {}; if (d.hz !== undefined) window.__hz.push(+d.hz.toFixed(2)); if (d.err) window.__err.push(d.err); if (d.a) window.__ans[d.a] = d.r; });
  window.probe = function (q) { var id = ++n; document.getElementById('f').contentWindow.postMessage({ q: q, id: id }, '*'); return new Promise(function (ok) { var t = setInterval(function () { if (id in window.__ans) { clearInterval(t); ok(window.__ans[id]); } }, 10); }); };
  document.getElementById('f').src = URL.createObjectURL(new Blob([${JSON.stringify(served).replace(/</g, '\\u003c')}], { type: 'text/html' }));
</script>`;

const page = await openPage({ dir: VAULT, width: 800, height: 1500, pageHtml: host });
const verdict = {}; const numbers = {};
const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
// The sandboxed blob iframe is not in the DevTools DOM tree, so a control's real box is asked of the page itself (the iframe sits at 0,0 of the host, so its coordinates ARE the host's) and the click is a real DevTools mouse event there.
const centre = async (id) => { const r = await probe(`(function () { var e = document.getElementById(${JSON.stringify(id)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible #${id}`); return r; };
const press = async (id) => { const c = await centre(id); await page.click(c.x, c.y); await sleep(120); };
const hzLen = () => page.ev('window.__hz.length');
const state = () => probe(`(function () { var d = document, t = function (i) { return d.getElementById(i).textContent.replace(/\\s+/g, ' ').trim(); };
  return { start: t('shStart'), names: t('shNames'), row: t('shIntervals'), caption: d.getElementById('shCaption').hidden ? '' : t('shCaption'),
    tune: [].map.call(d.querySelectorAll('#shSvg .key.tune'), function (k) { return +k.getAttribute('data-midi'); }).sort(function (a, b) { return a - b; }),
    broken: [].map.call(d.querySelectorAll('#shSvg .key.broken'), function (k) { return +k.getAttribute('data-midi'); }),
    chg: d.querySelectorAll('#shIntervals .chg').length,
    disabled: ['shDn', 'shUp', 'shOd', 'shOu'].filter(function (i) { return d.getElementById(i).disabled; }),
    upTitle: d.getElementById('shUp').getAttribute('title') }; })()`);
const contentHeight = () => probe(`(function () { var w = document.querySelector('.wrap'); return Math.ceil(w.getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).paddingBottom)); })()`);
const tab = async (id) => { await press(id); await sleep(150); };
const shot = async (name, h) => {
  for (const scheme of ['light', 'dark']) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await sleep(120);
    await page.shot(path.join(OUT, `${name}-${scheme}.png`), { x: 0, y: 0, width: 800, height: h });
  }
};

try {
  await sleep(700);
  verdict.noErrorsOnLoad = (await page.ev('window.__err.length')) === 0;
  verdict.opensOnExploreSilent = (await hzLen()) === 0 && (await probe(`document.getElementById('tabExplore').getAttribute('aria-selected')`)) === 'true';

  // ---- heights of the four tabs: tallest state each
  const heights = {};
  heights.Explore = await contentHeight();
  await probe(`document.getElementById('exN6').click(); document.getElementById('exSvg').querySelector('.key[data-midi="60"]'); 0`);
  heights.Explore = Math.max(heights.Explore, await contentHeight());
  await tab('tabChart'); heights.Chart = await contentHeight();
  await tab('tabTrainer'); heights.Trainer = await contentHeight();
  await probe(`document.getElementById('tA7').click(); 0`); heights.Trainer = Math.max(heights.Trainer, await contentHeight());
  await probe(`document.getElementById('tW').click(); document.getElementById('tH').click(); 0`); heights.Trainer = Math.max(heights.Trainer, await contentHeight());
  await tab('tabShift'); verdict.shiftOpensSilent = (await hzLen()) === 0;

  // ---- Shift: the start position
  const s0 = await state();
  verdict.startTwinkle = s0.start === 'starts on C (octave 4)' && s0.names === 'C C G G A A G F F E E D D C' && s0.row === '0 +7 0 +2 0 -2 -2 0 -1 0 -2 0 -2' && s0.caption === '' && s0.tune.join() === '60,62,64,65,67,69';
  heights.Shift = await contentHeight();
  await shot('shift-0-start', Math.max(heights.Shift, 520));

  // ---- Shift up by 3: the names change, the interval row does not
  for (let i = 0; i < 3; i++) await press('shUp');
  const s3 = await state();
  verdict.up3NamesChangedRowSame = s3.start === 'starts on E-flat (octave 4)' && s3.names !== s0.names && s3.row === s0.row && s3.caption === 'the notes changed, the intervals did not' && s3.tune.join() === '63,65,67,68,70,72';
  verdict.up3TopEdgeDisabledWithReason = s3.disabled.includes('shUp') && /above C5/.test(s3.upTitle);
  verdict.shiftsAreSilent = (await hzLen()) === 0;
  heights.Shift = Math.max(heights.Shift, await contentHeight());
  await shot('shift-1-up-3', Math.max(heights.Shift, 520));

  // ---- back to start, Shift down by 5
  await press('shReset'); for (let i = 0; i < 5; i++) await press('shDn');
  const d5 = await state();
  verdict.down5NamesChangedRowSame = d5.start === 'starts on G (octave 3)' && d5.names !== s0.names && d5.names !== s3.names && d5.row === s0.row && d5.tune.join() === '55,57,59,60,62,64';
  heights.Shift = Math.max(heights.Shift, await contentHeight());
  await shot('shift-2-down-5', Math.max(heights.Shift, 520));

  // ---- Play from the shifted position: 14 oscillators, the shifted pitches
  await page.ev('window.__hz.length = 0');
  await press('shPlay'); await sleep(300);
  const eq = (m) => +(440 * Math.pow(2, (m - 69) / 12)).toFixed(2);
  verdict.playSoundsTheShiftedTune = (await page.ev('window.__hz.join()')) === [55, 55, 62, 62, 64, 64, 62, 60, 60, 59, 59, 57, 57, 55].map(eq).join();

  // ---- Break one interval, from the start
  await press('shReset');
  await page.ev('window.__hz.length = 0');
  await press('shBreak'); await sleep(300);
  const b = await state();
  verdict.breakMarksOneNoteAndTwoIntervals = b.broken.join() === '66' && b.chg === 2 && b.row === '0 +7 0 +2 0 -2 -1 -1 -1 0 -2 0 -2';
  verdict.breakSoundsTheRaisedMiddleNote = (await page.ev('window.__hz.join()')) === [60, 60, 67, 67, 69, 69, 67, 66, 65, 64, 64, 62, 62, 60].map(eq).join();
  heights.Shift = Math.max(heights.Shift, await contentHeight());
  await shot('shift-3-break-one-interval', Math.max(heights.Shift, 520));
  await page.ev('window.__hz.length = 0');
  await press('shBreak'); await sleep(300);
  const r = await state();
  verdict.breakAgainRestoresTheTrueTune = r.broken.length === 0 && r.chg === 0 && r.row === s0.row && (await page.ev('window.__hz.join()')) === [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60].map(eq).join();

  // ---- the other tunes and the Ode's longer row (the tallest Shift state)
  await probe(`var s = document.getElementById('shTune'); s.value = 'ode'; s.dispatchEvent(new Event('change')); 0`);
  heights.Shift = Math.max(heights.Shift, await contentHeight());

  // ---- 2026-11-13-1212: Bach, Cello Suite No. 1, Prelude (opening): the fourth tune, 16 notes
  await probe(`var s = document.getElementById('shTune'); s.value = 'bwv1007'; s.dispatchEvent(new Event('change')); 0`);
  await press('shReset'); await sleep(120);
  const bw0 = await state();
  verdict.bachStart = bw0.start === 'starts on G (octave 3)' && bw0.names === 'G D B A B D B D G D B A B D B D' && bw0.row === '+7 +9 -2 +2 -9 +9 -9 -7 +7 +9 -2 +2 -9 +9 -9' && bw0.tune.join() === '55,62,69,71';
  const bwHeight = await contentHeight(); heights.ShiftBach = bwHeight;
  await shot('shift-4-bach-start', Math.max(bwHeight, 520));
  for (let i = 0; i < 7; i++) await press('shDn');
  const bw7 = await state();
  verdict.bachDown7NamesChangedRowSame = bw7.start === 'starts on C (octave 3)' && bw7.names === 'C G E D E G E G C G E D E G E G' && bw7.row === bw0.row && bw7.tune.join() === '48,55,62,64' && bw7.disabled.includes('shDn') && /below C3/.test(await probe(`document.getElementById('shDn').getAttribute('title')`)) && bw7.caption === 'the notes changed, the intervals did not';
  heights.ShiftBach = Math.max(heights.ShiftBach, await contentHeight());
  await shot('shift-5-bach-down-7', Math.max(heights.ShiftBach, 520));
  await page.ev('window.__hz.length = 0');
  await press('shPlay'); await sleep(450);
  verdict.bachPlaysSixteenShiftedNotes = (await page.ev('window.__hz.join()')) === [48, 55, 64, 62, 64, 55, 64, 55, 48, 55, 64, 62, 64, 55, 64, 55].map(eq).join();
  await press('shReset'); await press('shBreak'); await sleep(300);
  const bwb = await state();
  verdict.bachBreakMarksTheNinthNote = bwb.broken.join() === '56' && bwb.chg === 2;
  await press('shBreak'); await sleep(150);

  // ---- the three older tabs still work
  await tab('tabChart'); verdict.chartStill13Rows = (await probe(`document.querySelectorAll('#chartTable tbody tr').length`)) === 13;
  await tab('tabTrainer'); verdict.trainerStill13Buttons = (await probe(`document.querySelectorAll('#tNames button').length`)) === 13;
  await tab('tabExplore'); await press('exN7'); verdict.exploreStillReads = /perfect fifth/.test(await probe(`document.getElementById('exBig').textContent`));
  verdict.noErrorsAtTheEnd = (await page.ev('window.__err.length')) === 0;

  numbers.contentHeightsAt800 = heights; numbers.max = Math.max(...Object.values(heights));
  console.log(JSON.stringify(numbers));
  console.log(JSON.stringify(verdict, null, 1));
} finally { page.close(); }
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
