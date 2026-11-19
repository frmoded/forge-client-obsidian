// 2026-11-19-0975 (finding 2 of the CCQA weekly of 2026-11-18, sandbox step 7) - the Score's tempo mark and the row's tempo control tell ONE story. The incident: the control read 105 % and the mark above the bar stayed `♩=118`.
// CHOICE (see tempo-marks-core.ts): the mark shows the EFFECTIVE tempo, written x percent / 100, whole bpm, a half rounds up, at 100 % the engraved text exactly. Three layers here: the pure rule (a table), the painter over a REAL Verovio SVG
// (the structure of its tempo mark is the engraver's, not a fixture of ours), and the REAL row (score-transport-dom.ts) driven with real clicks, the mark read back from the SVG. The glue in music-edition.full.ts (it needs html-midi-player, real Obsidian) is pinned as a mechanism here and is NOT run in a browser by this file: a CCQA step (Faster once on a 118 phrase: the mark reads 124). A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { effectiveBpm, markNumberAt } from './tempo-marks-core.ts';
import { paintTempoMarks } from './score-tempo-marks-dom.ts';
import { mountScoreTransport, type TransportPlayer } from './score-transport-dom.ts';
import { exportItems } from './score-transport-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

// ---- the rule -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('effectiveBpm: the incident (118 at 105 % reads 124), the identity at 100 %, the ends of the range, and a half rounds UP', () => {
  const table: Array<[number, number, number]> = [
    [118, 105, 124],        // 123.9
    [118, 100, 118],
    [100, 50, 50], [100, 200, 200], [120, 150, 180],
    [110, 105, 116],        // 115.5: a half goes up (and is not lost to 115.49999999999999)
    [100, 105, 105], [100, 95, 95], [60, 95, 57],      // 57 exactly
    [103, 110, 113],        // 113.3
    [1, 50, 1],             // 0.5 -> 1: never below 1
    [103.5, 105, 109],      // a decimal written tempo: 108.675
    [129.2, 125, 162],      // 161.49999999999997 in floating point, 161.5 on paper: the half goes up (the decimal the person would write is what is rounded)
    [0.4, 50, 1], [0, 100, 1], // 0.2 and 0 round to 0: a mark never says 0 bpm
  ];
  for (const [written, pct, want] of table) assert.equal(effectiveBpm(written, pct), want, `${written} bpm at ${pct} %`);
});

test('markNumberAt: at 100 % the engraved text itself (a decimal, spaces and all); a plain number is rescaled; anything that is not a plain number is left as it is', () => {
  assert.equal(markNumberAt('118', 100), '118'); assert.equal(markNumberAt('103.5', 100), '103.5'); assert.equal(markNumberAt(' 118 ', 100), ' 118 ');
  assert.equal(markNumberAt('118', 105), '124'); assert.equal(markNumberAt(' 118 ', 105), '124'); assert.equal(markNumberAt('103.5', 105), '109');
  assert.equal(markNumberAt('Allegro', 105), 'Allegro'); assert.equal(markNumberAt('60-72', 105), '60-72'); assert.equal(markNumberAt('', 105), '');
  assert.equal(markNumberAt('118', Number.NaN), '118', 'a percent that is not a number changes nothing');
});

// ---- a REAL Verovio SVG ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const bar = (n: number, bpm: number | null): string => `<measure number="${n}"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign></clef></attributes>${bpm === null ? '' : `<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`}<note><rest/><duration>4</duration></note></measure>`;
const xml = (...bpms: Array<number | null>): string => `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">${bpms.map((b, i) => bar(i + 1, b)).join('')}</part></score-partwise>`;
async function engrave(musicxml: string): Promise<string> {
  const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
  const tk = new VerovioToolkit(await create()); tk.setOptions({ adjustPageHeight: true, breaks: 'auto', pageWidth: 2000, scale: 40 }); tk.loadData(musicxml);
  let svg = ''; for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p); return svg;
}
function page(svg: string) {
  const win: any = new Window({ url: 'http://localhost/' });
  const wrap = win.document.createElement('div'); win.document.body.appendChild(wrap); wrap.appendChild(win.document.importNode(new win.DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));          // happy-dom's HTML parser cuts a real Verovio SVG short; its XML parser keeps all of it (Chrome's HTML parser, which the plugin uses, keeps it too)
  const marks = (): string[] => [...wrap.querySelectorAll('g.tempo')].map((g: any) => (g.textContent as string).replace(/\s+/g, ' ').trim());
  return { win, wrap, marks, doc: win.document };
}

test('REAL Verovio: the painter says the effective tempo of every mark (a ritardando keeps one mark per change), 100 % is the engraving again exactly, painting twice is painting once, and nothing but the numbers moves', async () => {
  const svg = await engrave(xml(118, 100, 90));
  const p = page(svg);
  const before = p.marks();
  assert.equal(before.length, 3, 'non-vacuity: Verovio engraved three marks'); assert.ok(before.every((m, i) => m.endsWith(['118', '100', '90'][i])), JSON.stringify(before));
  const htmlBefore = p.wrap.innerHTML as string;
  assert.equal(paintTempoMarks(p.wrap, 105), 3);
  assert.deepEqual(p.marks().map((m) => m.split(' ').pop()), ['124', '105', '95'], 'the incident: 118 at 105 % reads 124');
  assert.equal(paintTempoMarks(p.wrap, 105), 3); assert.deepEqual(p.marks().map((m) => m.split(' ').pop()), ['124', '105', '95'], 'again: the same');
  assert.deepEqual(p.marks().map((m) => m.split(' ').slice(0, -1).join(' ')), before.map((m) => m.split(' ').slice(0, -1).join(' ')), 'the note glyph and the "=" are what they were');
  paintTempoMarks(p.wrap, 150); assert.deepEqual(p.marks().map((m) => m.split(' ').pop()), ['177', '150', '135'], 'computed from the engraved number, not from the last paint');
  paintTempoMarks(p.wrap, 100);
  assert.deepEqual(p.marks(), before, 'back at 100 %: the very text Verovio wrote');
  const stripped = (p.wrap.innerHTML as string).replace(/ data-forge-written="[^"]*"/g, '');
  assert.equal(stripped, htmlBefore, 'and the whole engraving is byte-for-byte what it was (only the remembered written number is left on the three tspans)');
});

test('a Score with no tempo mark paints nothing and says 0; a mark that is a word is left alone; a mark with no tspan around the number is not guessed at', () => {
  const none = page('<svg xmlns="http://www.w3.org/2000/svg"><g class="measure"><g class="note"/></g></svg>');
  assert.equal(paintTempoMarks(none.wrap, 105), 0);
  const word = page('<svg xmlns="http://www.w3.org/2000/svg"><g class="tempo"><text><tspan>Allegro</tspan></text></g></svg>');
  assert.equal(paintTempoMarks(word.wrap, 105), 0); assert.deepEqual(word.marks(), ['Allegro']);
});

// ---- the REAL row, real clicks, the mark read back -------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('REAL row + REAL Verovio mark: Faster, Faster, Slower, Slower, a typed percent, a typed percent out of range: the mark and the percent always agree, and 100 % puts the engraving back', async () => {
  const p = page(await engrave(xml(118, 100)));
  const toolbar = p.doc.createElement('div'); p.doc.body.appendChild(toolbar);
  const calls: string[] = [];
  const player: TransportPlayer = { playing: false, start() {}, stop() {}, reset() {}, setTempo(pct: number) { calls.push(`player ${pct}`); }, onStateChange: () => () => {} };
  mountScoreTransport(toolbar, { player, exportItems: exportItems({ macDesktop: false }), runExport: () => {}, onTempo: (pct) => { calls.push(`marks ${pct} (${paintTempoMarks(p.wrap, pct)})`); } });
  const q = (sel: string): any => toolbar.querySelector(sel); const click = (el: any) => el.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  const shown = (): string => `${(q('.forge-tp-tempo').textContent as string).trim()} | ${p.marks().map((m) => m.split(' ').pop()).join(' ')}`;
  assert.equal(shown(), '100% | 118 100', 'at the start the mark is the written tempo');
  click(q('.forge-tp-faster'));  assert.equal(shown(), '105% | 124 105', 'THE INCIDENT: Faster once: the control says 105 % and the mark follows (it stayed 118)');
  click(q('.forge-tp-faster'));  assert.equal(shown(), '110% | 130 110');
  click(q('.forge-tp-slower'));  click(q('.forge-tp-slower')); assert.equal(shown(), '100% | 118 100', 'back to 100 %: the written tempo');
  click(q('.forge-tp-tempo'));   const input = q('.forge-tp-tempo-input'); input.value = '150%';
  input.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); assert.equal(shown(), '150% | 177 150', 'a typed percent');
  click(q('.forge-tp-tempo'));   const wild = q('.forge-tp-tempo-input'); wild.value = '999';
  wild.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); assert.equal(shown(), '200% | 236 200', 'a typed percent past the range is the end of the range, and the mark agrees');
  const n = calls.length; click(q('.forge-tp-faster')); assert.equal(calls.length, n, 'a click on a disabled end changes nothing: no second hand-off, nothing repainted');
  assert.deepEqual(calls.filter((c) => c.startsWith('player')).map((c) => c.slice(7)), calls.filter((c) => c.startsWith('marks')).map((c) => c.split(' ')[1]), 'every tempo the player was given, the marks were given (one story)');
});

test('onTempo is optional (a row with none behaves as before) and not called for a value that is already the tempo', () => {
  const win: any = new Window({ url: 'http://localhost/' }); const toolbar = win.document.createElement('div'); win.document.body.appendChild(toolbar);
  const player: TransportPlayer = { playing: false, start() {}, stop() {}, reset() {}, setTempo() {}, onStateChange: () => () => {} };
  const heard: number[] = [];
  mountScoreTransport(toolbar, { player, exportItems: exportItems({ macDesktop: false }), runExport: () => {}, onTempo: (pct) => { heard.push(pct); } });
  const click = (el: any) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  click(toolbar.querySelector('.forge-tp-tempo')); const input: any = toolbar.querySelector('.forge-tp-tempo-input'); input.value = '100';
  input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(heard, [], '100 typed at 100: nothing changed, nothing told');
  const bare: any = win.document.createElement('div'); win.document.body.appendChild(bare);
  mountScoreTransport(bare, { player, exportItems: exportItems({ macDesktop: false }), runExport: () => {} });
  click(bare.querySelector('.forge-tp-faster')); assert.equal((bare.querySelector('.forge-tp-tempo').textContent as string).trim(), '105%');
});

// ---- the glue (real Chrome only) ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('MECHANISM PIN (if the design moves this SHOULD go red - reassess, do not just rewrite): the compact Score gives its row an onTempo that repaints the marks of the engraving it put on the page, from the very same percent the player gets', () => {
  const edition = fs.readFileSync(path.join(ROOT, 'src/music-edition.full.ts'), 'utf8');
  assert.match(edition, /import \{ paintTempoMarks \} from '\.\/score-tempo-marks-dom\.ts';/);
  assert.match(edition, /onTempo: \(pct\) => \{ if \(scoreMarks === null\) return; const n = paintTempoMarks\(scoreMarks, pct\);/);
  assert.match(edition, /scoreWrap\.append\(\.\.\.parseSvgMarkup\(svg, new DOMParser\(\)\)\);\s*\n\s*scoreMarks = scoreWrap;/, 'the marks it repaints are the ones of the engraving on the page');
  const row = fs.readFileSync(path.join(ROOT, 'src/score-transport-dom.ts'), 'utf8');
  assert.match(row, /player\.setTempo\(tempo\); deps\.onTempo\?\.\(tempo\);/, 'the player and the marks are told the same value in the same step');
  for (const f of ['src/score-tempo-marks-dom.ts', 'src/tempo-marks-core.ts']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /from 'obsidian'/, `${f}: no obsidian import`);
});
