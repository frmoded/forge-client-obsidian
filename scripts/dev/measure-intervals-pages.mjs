// 2026-11-13-1210 - the two Intervals pages that embed the interval widget, in real headless Chrome, in the SHIPPED mount (a blob: URL inside <iframe sandbox="allow-scripts"> in an 800-px column, as html-embed makes it), at the
// heights the pages ask for: `what_matters_is_intervals` at 635 (the Chart tab unclipped; the Shift tab, 467 px of content, fits inside 635 with no scrollbar; Explore and Trainer too) and `hearing_intervals` at 490 (the Trainer tab, and Explore).
// "Not clipped" as in 1202: inside the iframe `scrollHeight` equals `clientHeight` (no vertical scrollbar) AND the last control or row ends above the bottom edge (the widget's content bottom + its 14 px body padding <= the iframe height).
// The served copy has the same ONE instrumentation block as measure-interval-shift.mjs (the iframe's opaque origin cannot be read any other way); the widget file is untouched.
//   node scripts/dev/measure-intervals-pages.mjs [--vault ~/projects/music-theory] [--out <dir for the screenshots>]     exit 0 = every verdict true
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

const page = await openPage({ dir: VAULT, width: 800, height: 760, pageHtml: host.replace('height:1500px', 'height:635px') });
const verdict = {}; const numbers = {};
const probe = (js) => page.ev(`window.probe(${JSON.stringify(js)})`);
const centre = async (id) => { const r = await probe(`(function () { var e = document.getElementById(${JSON.stringify(id)}); if (!e) return null; var b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`); if (!r || typeof r !== 'object') throw new Error(`no visible #${id}`); return r; };
const press = async (id) => { const c = await centre(id); await page.click(c.x, c.y); await sleep(120); };
const setHeight = async (h) => { await page.ev(`document.getElementById('f').style.height = '${h}px'`); await sleep(250); };
// what is on screen in the iframe: the document's own scroll size against its client size, and how far down the visible content reaches
const fit = (lastSel) => probe(`(function () { var d = document.documentElement, w = document.querySelector('.wrap'), last = ${JSON.stringify(lastSel)} ? [].slice.call(document.querySelectorAll(${JSON.stringify(lastSel)})).filter(function (e) { return e.getBoundingClientRect().height > 0; }).pop() : null;
  return { scrollHeight: d.scrollHeight, clientHeight: d.clientHeight, scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, contentBottom: Math.ceil(w.getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.body).paddingBottom)), lastBottom: last ? Math.round(last.getBoundingClientRect().bottom * 10) / 10 : null }; })()`);
const tab = async (id) => { await press(id); await sleep(200); };
const unclipped = (f, h) => f.scrollHeight <= f.clientHeight && f.clientHeight === h && f.contentBottom <= h && f.scrollWidth <= f.clientWidth && (f.lastBottom === null || f.lastBottom <= h);
const shot = async (name, h) => { await page.shot(path.join(OUT, `${name}.png`), { x: 0, y: 0, width: 800, height: h }); };
try {
  await sleep(700);
  verdict.noErrorsOnLoad = (await page.ev('window.__err.length')) === 0;
  // ---- what_matters_is_intervals: 635
  await setHeight(635);
  await tab('tabChart');
  const chart = await fit('#chartTable tbody tr:last-child td.cue'); numbers.chart635 = chart;
  verdict.chartAt635Unclipped = unclipped(chart, 635) && /Somewhere Over the Rainbow/.test(await probe(`document.querySelector('#chartTable tbody tr:last-child').textContent`));
  await shot('pages-635-chart-tab', 635);
  await tab('tabShift');
  await page.ev('window.__hz.length = 0');
  const shiftStart = await fit('#shCaption, #shIntervals'); numbers.shift635Start = shiftStart;
  verdict.shiftAt635Unclipped = unclipped(shiftStart, 635);
  // the tallest Shift state: the longest tune, shifted (caption shown), then the raised note on
  await probe(`var s = document.getElementById('shTune'); s.value = 'ode'; s.dispatchEvent(new Event('change')); 0`);
  await press('shUp'); await press('shBreak');
  const shiftTall = await fit('#shIntervals'); numbers.shift635Tallest = shiftTall;
  verdict.shiftTallestStateAt635Unclipped = unclipped(shiftTall, 635);
  verdict.shiftFitsWithRoomToSpare = shiftTall.contentBottom <= 635 - 100;
  await shot('pages-635-shift-tab', 635);
  await press('shBreak');                                                                               // back to the true tune
  await tab('tabExplore'); const ex635 = await fit('#exNames'); numbers.explore635 = ex635; verdict.exploreAt635Unclipped = unclipped(ex635, 635);
  await tab('tabTrainer'); const tr635 = await fit('#tNames'); numbers.trainer635 = tr635; verdict.trainerAt635Unclipped = unclipped(tr635, 635);
  // ---- hearing_intervals: 490
  await setHeight(490);
  await tab('tabTrainer');
  await press('tA7'); await press('tN');                                                                // an answered question, then a new one (the tallest Trainer states)
  const tr = await fit('#tNames'); numbers.trainer490 = tr;
  verdict.trainerAt490Unclipped = unclipped(tr, 490);
  await shot('pages-490-trainer-tab', 490);
  await probe(`document.getElementById('tW').click(); document.getElementById('tH').click(); 0`);
  const tr2 = await fit('#tNames'); numbers.trainer490WidenedHidden = tr2; verdict.trainerWidenedHiddenAt490Unclipped = unclipped(tr2, 490);
  await tab('tabExplore'); await press('exN6');
  const ex = await fit('#exNames'); numbers.explore490 = ex; verdict.exploreAt490Unclipped = unclipped(ex, 490);
  await shot('pages-490-explore-tab', 490);
  verdict.noErrorsAtTheEnd = (await page.ev('window.__err.length')) === 0;
  console.log(JSON.stringify(numbers));
  console.log(JSON.stringify(verdict, null, 1));
} finally { page.close(); }
const ok = Object.values(verdict).every(Boolean);
console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`);
process.exit(ok ? 0 : 1);
