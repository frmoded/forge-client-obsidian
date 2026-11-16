// 2026-11-16-0902 - a bar number at the start of every bar of the Score. The rule on the MusicXML (positions, not the engine's numbers), Verovio's own numbering on the REAL engine's MusicXML and the real Verovio (1..N for N bars, multi-staff, wrapped into several
// systems, a one-bar note, the setting off), the MIDI and the time map unchanged, and what the pin's text says about the bar. Where the number sits relative to the tempo mark is measured in real Chrome (scripts/dev/measure-bar-numbers.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test as baseTest } from 'node:test';

import { BAR_NUMBER_INTERVAL, mnumIntervalFor, renumberMeasures, stripBarNumbers } from './bar-numbers-core.ts';
import { dedupeTempoMarks } from './tempo-marks-core.ts';
import { DEFAULT_UI_FLAGS, SHOW_BAR_NUMBERS, readUiFlags } from './ui-flags-core.ts';
import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { phraseBarId, phraseLineageOf, phraseProvenance } from './phrase-lineage-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const measure = (attrs: string): string => `<measure ${attrs}><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>`;
const part = (id: string, ms: string[]): string => `<part id="${id}">${ms.join('')}</part>`;
const score = (...parts: string[]): string => `<?xml version="1.0"?><score-partwise version="3.1"><part-list/>${parts.join('')}</score-partwise>`;
const numbers = (xml: string): string[][] => [...xml.matchAll(/<part\b[^>]*>([\s\S]*?)<\/part>/g)].map((p) => [...p[1].matchAll(/<measure\b[^>]*\bnumber="([^"]*)"/g)].map((m) => m[1]));

baseTest('renumberMeasures: every part\'s measures are numbered 1..N by position, whatever the engine wrote (gaps, repeats, zero, text); other attributes (id, implicit) are kept; a measure with no number gets one; a score with no measure is untouched', () => {
  const xml = score(part('P1', [measure('number="7" id="m1"'), measure('number="7"'), measure('number="0" implicit="yes"'), measure('id="x"')]), part('P2', [measure('number="12"'), measure('number="a"')]));
  const out = renumberMeasures(xml);
  assert.deepEqual(numbers(out), [['1', '2', '3', '4'], ['1', '2']]);
  assert.match(out, /<measure number="1" id="m1">/); assert.match(out, /<measure number="3" implicit="yes">/); assert.match(out, /<measure id="x" number="4">/);
  assert.equal(renumberMeasures(out), out, 'twice changes nothing');
  const none = '<score-partwise><part-list/></score-partwise>'; assert.equal(renumberMeasures(none), none);
  assert.equal(renumberMeasures('' as string), ''); assert.equal(renumberMeasures(undefined as unknown as string), undefined);
  assert.deepEqual(numbers(renumberMeasures(score(part('P1', [measure('number="1"')])))), [['1']], 'a one-bar note is bar 1');
});
baseTest('the setting: SHOW_BAR_NUMBERS is ON by default (the only switch that is), in the constants, the defaults and a fresh install\'s settings; only a real boolean is read; the interval is 1 when on and 0 when off', () => {
  assert.equal(SHOW_BAR_NUMBERS, true); assert.equal(DEFAULT_UI_FLAGS.showBarNumbers, true); assert.equal(BAR_NUMBER_INTERVAL, 1); assert.deepEqual([mnumIntervalFor(true), mnumIntervalFor(false)], [1, 0]);
  assert.equal(readUiFlags({ showBarNumbers: false }).showBarNumbers, false); assert.equal(readUiFlags({ showBarNumbers: 'no' }).showBarNumbers, true, 'junk is the default (on)'); assert.equal(readUiFlags(null).showBarNumbers, true);
  const settings = fs.readFileSync(path.join(ROOT, 'src/settings.ts'), 'utf8');
  assert.match(settings, /showBarNumbers: true,/); assert.match(settings, /setName\('Show bar numbers'\)[\s\S]*?settings\.showBarNumbers = value/);
  const verovio = fs.readFileSync(path.join(ROOT, 'src/verovio.ts'), 'utf8');
  assert.match(verovio, /mnumInterval: mnumIntervalFor\(uiFlags\(\)\.showBarNumbers\)/); assert.match(verovio, /function prepareScore\(musicxml: string\): string \{ return dedupeTempoMarks\(renumberMeasures\(musicxml\)\); \}/);
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.match(css, /g\.mNum text[^{]*\{[^}]*text-anchor: end;[^}]*opacity: 0\.6;/); assert.match(css, /g\.mNum tspan[^{]*\{[^}]*font-size: 290px;/);
});

// ---- the real engine and the real Verovio -----------------------------------------------------------------------------------------------------------------------------------------------
const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barJson = (): any => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(FIXTURES, 'bar_007.md'), 'utf8'))![1]);
async function verovio(): Promise<any> {
  const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
  return new VerovioToolkit(await create());
}
function engrave(tk: any, xml: string, width: number, mnum: number) {
  tk.setOptions({ adjustPageHeight: true, breaks: 'auto', pageWidth: width, scale: 40, mnumInterval: mnum }); tk.loadData(dedupeTempoMarks(renumberMeasures(xml)));
  let svg = ''; for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  const nums = [...svg.matchAll(/<g [^>]*class="mNum[^"]*"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => (/<tspan[^>]*font-size[^>]*>([^<]*)<\/tspan>/.exec(m[1]) ?? [])[1]);
  return { svg, nums, systems: (svg.match(/class="system"/g) ?? []).length, midi: tk.renderToMIDI(), time: JSON.stringify((tk.renderToTimemap() as any[]).map((e) => [e.tstamp, e.qstamp])) };
}
const ext = (bars: number, pct = 0) => ({ kind: 'extend', source: 'bar_007', bars, style: 'repeat_with_fills', tempo_change_pct: pct });
test('REAL engine and Verovio: numbers 1..N for N bars on a multi-staff Score (three staves, one number per bar, not one per staff), the first bar numbered, a one-bar note numbered 1', async () => {
  const py = await engine(); const tk = await verovio();
  for (const n of [1, 2, 4, 8]) {
    const xml: string = (computePhrase(py, barJson(), ext(n), 'p') as any).content; assert.equal((xml.match(/<part /g) ?? []).length, 3, 'non-vacuity: a multi-staff Score');
    const e = engrave(tk, xml, 3000, 1); assert.deepEqual(e.nums, Array.from({ length: n }, (_, i) => String(i + 1)), `${n} bars`);
  }
});
test('REAL engine and Verovio: a Score wrapped into several systems keeps counting: 12 bars on a narrow page are 1..12 in order across the systems', async () => {
  const py = await engine(); const tk = await verovio(); const xml: string = (computePhrase(py, barJson(), ext(12), 'p') as any).content;
  const wide = engrave(tk, xml, 3000, 1), narrow = engrave(tk, xml, 1100, 1);
  assert.ok(narrow.systems > wide.systems && narrow.systems >= 2, `non-vacuity: it wraps (${narrow.systems} systems)`);
  assert.deepEqual(narrow.nums, Array.from({ length: 12 }, (_, i) => String(i + 1)));
});
test('REAL engine and Verovio: the numbers are POSITIONS: a Score whose measures the engine numbered 7, 7, 40, 3 still reads 1, 2, 3, 4 (an extend, a thin-out and a morph all renumber)', async () => {
  const py = await engine(); const tk = await verovio(); const xml: string = (computePhrase(py, barJson(), ext(4), 'p') as any).content;
  let k = 0; const odd = ['7', '7', '40', '3']; const scrambled = xml.replace(/<measure number="\d+"/g, () => `<measure number="${odd[k++ % 4]}"`);
  assert.notDeepEqual(numbers(scrambled)[0], ['1', '2', '3', '4']); assert.deepEqual(engrave(tk, scrambled, 3000, 1).nums, ['1', '2', '3', '4']);
});
test('REAL engine and Verovio: the setting OFF draws no number at all; ON draws them; and the MIDI and the time map are byte-identical either way (and with the tempo rule), for the constant phrase and a ritardando', async () => {
  const py = await engine(); const tk = await verovio();
  for (const pct of [0, 10]) {
    const xml: string = (computePhrase(py, barJson(), ext(4, pct), 'p') as any).content; const on = engrave(tk, xml, 3000, 1), off = engrave(tk, xml, 3000, 0);
    assert.equal(on.nums.length, 4); assert.equal(off.nums.length, 0, 'off: no number'); assert.equal(off.midi, on.midi, 'the MIDI is unchanged'); assert.equal(off.time, on.time, 'the time map is unchanged');
  }
  // Verovio's "interval 0" is NOT "none": on a wrapped Score it still numbers the start of every system after the first; the plugin's OFF takes those out of the drawing too
  const long: string = (computePhrase(py, barJson(), ext(12), 'p') as any).content; const raw = engrave(tk, long, 1100, 0);
  assert.ok(raw.nums.length > 0, 'non-vacuity: Verovio with interval 0 still draws system-start numbers on a wrapped Score'); assert.equal(engrave(tk, long, 1100, 0).nums.length, raw.nums.length);
  assert.equal([...stripBarNumbers(raw.svg).matchAll(/<g [^>]*class="mNum/g)].length, 0, 'stripped: no number group left'); assert.ok(stripBarNumbers(raw.svg).includes('class="measure"'), 'the bars are still there');
  assert.equal(stripBarNumbers('<svg></svg>'), '<svg></svg>'); assert.equal(stripBarNumbers(undefined as unknown as string), undefined);
});
test('the pin and the tooltip: a pinned bar\'s text names its POSITION ("bar 3 of 8") and the SOURCE bar note it came from (a link to bars/bar_007), for an extend; nothing to add', () => {
  const p = { kind: 'extend', source: 'bar_007', bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 } as any;
  const map = phraseProvenance('phrases/phrase_001', p, [1, 2, 3].map((i) => ({ id: phraseBarId('phrase_001', i), index: i, tempo: 100 })) as any);
  const ids = Object.keys(map); assert.ok(ids.length >= 3, 'a provenance entry per bar');
  const lineage = phraseLineageOf(map[ids[2]]); const text = lineage.map((l: any) => l.text).join(' | ');
  assert.match(text, /bar 3 of 3/); assert.match(text, /bar_007/, 'the source bar note is named');
});
