// 2026-11-16-0902 - the bar numbers in the Score, in real headless Chrome: the REAL engine's MusicXML (phrases: a constant tempo, a ritardando, one bar, many bars wrapped into several systems, a morph-length run) engraved by the REAL Verovio with the plugin's own preparation
// (`prepareScore`) and option, drawn with the plugin's own stylesheet (styles.css). Verdicts: the numbers read 1..N in order (every system), the first bar is numbered, no number overlaps a tempo mark (bounding boxes, with a gap), no number is clipped by the drawing,
// the setting off draws none, and the MIDI and the time map are byte-identical with and without the numbers.
//   node --experimental-strip-types scripts/dev/measure-bar-numbers.ts [--out <dir>]        exit 0 = every verdict true
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage, sleep } from './cdp.mjs';
import { WHEELS_PRESENT, engine, computePhrase } from '../../src/test-support/real-rhythm-engine.ts';
import { prepareScore } from '../../src/verovio.ts';
import { stripBarNumbers } from '../../src/bar-numbers-core.ts';

const arg = (name: string, dflt: string): string => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const OUT = arg('--out', path.join(os.homedir(), '.forge-mem-evidence/0902-shots')).replace(/^~/, os.homedir());
fs.mkdirSync(OUT, { recursive: true });
if (!WHEELS_PRESENT) { console.error('the music wheels are not fetched'); process.exit(2); }
const py = await engine();
const bar = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.resolve('test/fixtures/score-first/bar_007.md'), 'utf8'))![1]);
const xmlOf = (bars: number, pct: number): string => (computePhrase(py, bar, { kind: 'extend', source: 'bar_007', bars, style: 'repeat_with_fills', tempo_change_pct: pct }, 'p') as any).content;
const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
const tk = new VerovioToolkit(await create());
const draw = (xml: string, width: number, mnum: number) => { tk.setOptions({ adjustPageHeight: true, breaks: 'auto', pageWidth: width, pageMarginTop: 50, pageMarginBottom: 50, pageMarginLeft: 50, pageMarginRight: 50, scale: 40, mnumInterval: mnum }); tk.loadData(prepareScore(xml)); let s = ''; for (let p = 1; p <= tk.getPageCount(); p++) s += tk.renderToSVG(p); return { svg: s, midi: tk.renderToMIDI(), time: JSON.stringify((tk.renderToTimemap() as any[]).map((e) => [e.tstamp, e.qstamp])) };
};
const CASES: Array<{ name: string; xml: string; width: number; bars: number }> = [
  { name: 'constant-4-wide', xml: xmlOf(4, 0), width: 3000, bars: 4 }, { name: 'ritardando-4-wide', xml: xmlOf(4, 10), width: 3000, bars: 4 }, { name: 'one-bar', xml: xmlOf(1, 0), width: 3000, bars: 1 },
  { name: 'constant-12-narrow', xml: xmlOf(12, 0), width: 1100, bars: 12 }, { name: 'ritardando-12-narrow', xml: xmlOf(12, 10), width: 1100, bars: 12 }, { name: 'ritardando-30-medium', xml: xmlOf(30, 3), width: 1800, bars: 30 },
];
const verdict: Record<string, boolean> = {}; const numbers: Record<string, unknown> = {};
const css = fs.readFileSync('styles.css', 'utf8');
const draws = CASES.map((c) => ({ ...c, on: draw(c.xml, c.width, 1), off: draw(c.xml, c.width, 0) }));
for (const c of draws) { verdict[`${c.name}_midiUnchanged`] = c.on.midi === c.off.midi; verdict[`${c.name}_timeMapUnchanged`] = c.on.time === c.off.time; verdict[`${c.name}_offDrawsNoNumber`] = !/class="mNum/.test(stripBarNumbers(c.off.svg)); }
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><style>
  :root { --ink: #2B2B2B; --bg: #FDFCFA; } @media (prefers-color-scheme: dark) { :root { --ink: #DADADA; --bg: #1E1E1E; } }
  body { margin: 0; background: var(--bg); color: var(--ink); } .case { padding: 6px 10px; } .case svg { color: var(--ink); } .case svg text, .case svg tspan { fill: currentColor; } h4 { margin: 4px 0; font: 12px sans-serif; }
</style><body>${draws.map((c) => `<div class="case" data-name="${c.name}" data-bars="${c.bars}"><h4>${c.name}</h4><div class="forge-output-musicxml">${c.on.svg}</div></div>`).join('')}`;
const page = await openPage({ dir: process.cwd(), width: 1300, height: 900, pageHtml: html });
await sleep(800);
const res = JSON.parse(await page.ev(`(function () { var out = []; [].forEach.call(document.querySelectorAll('.case'), function (c) {
  var svgs = c.querySelectorAll('.forge-output-musicxml > svg'); var nums = [], tempos = [], clipped = 0, sys = 0;
  [].forEach.call(svgs, function (svg) { var sb = svg.getBoundingClientRect(); sys += svg.querySelectorAll('g.system').length;
    [].forEach.call(svg.querySelectorAll('g.mNum'), function (g) { var r = g.getBoundingClientRect(); nums.push({ t: g.textContent.replace(/\\s+/g, ''), l: r.left, r: r.right, top: r.top, b: r.bottom, w: r.width, vis: getComputedStyle(g.querySelector('tspan')).fontSize }); if (r.left < sb.left - 0.5 || r.right > sb.right + 0.5 || r.top < sb.top - 0.5) clipped++; });
    [].forEach.call(svg.querySelectorAll('g.tempo'), function (g) { var r = g.getBoundingClientRect(); tempos.push({ l: r.left, r: r.right, top: r.top, b: r.bottom }); }); });
  var hits = 0, minGap = 1e9; nums.forEach(function (n) { tempos.forEach(function (t) { var dx = Math.max(t.l - n.r, n.l - t.r), dy = Math.max(t.top - n.b, n.top - t.b); if (dx < 0 && dy < 0) hits++; minGap = Math.min(minGap, Math.max(dx, dy)); }); });
  out.push({ name: c.getAttribute('data-name'), bars: +c.getAttribute('data-bars'), texts: nums.map(function (n) { return n.t; }), tempos: tempos.length, overlaps: hits, minGap: minGap === 1e9 ? null : Math.round(minGap * 10) / 10, clipped: clipped, systems: sys, fontSize: nums[0] ? nums[0].vis : null }); }); return JSON.stringify(out); })()`));
for (const r of res) {
  const want = Array.from({ length: r.bars }, (_, i) => String(i + 1));
  verdict[`${r.name}_numbersAreOneToN`] = JSON.stringify(r.texts) === JSON.stringify(want);
  verdict[`${r.name}_noOverlapWithTempo`] = r.overlaps === 0 && (r.minGap === null || r.minGap >= 1);
  verdict[`${r.name}_notClipped`] = r.clipped === 0;
  numbers[r.name] = { numbers: r.texts.length, systems: r.systems, tempoMarks: r.tempos, minGapToTempo: r.minGap, fontSize: r.fontSize };
}
for (const scheme of ['light', 'dark']) { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }); await sleep(200); await page.shot(path.join(OUT, `bar-numbers-${scheme}.png`), { x: 0, y: 0, width: 1300, height: 900 }); }
page.close();
console.log(JSON.stringify(numbers)); console.log(JSON.stringify(verdict, null, 1));
const ok = Object.values(verdict).every(Boolean); console.log(`${Object.keys(verdict).length} verdicts, ${ok ? 'all true' : 'NOT all true'}`); process.exit(ok ? 0 : 1);
