// 2026-11-15-2101 (R1) - the Score writes the tempo above a bar only on the first bar and where it changes. The rule is on the MusicXML text (tempo-marks-core.ts), applied by verovio.ts before every engraving, so a phrase, an arrangement and a composition
// all follow it. The pure rule on small scores; the REAL engine's MusicXML (a phrase at a constant tempo, a ritardando, an arrangement) engraved by the REAL Verovio: the tempo marks in the SVG, and the MIDI and the time map unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as baseTest } from 'node:test';
import { pathToFileURL } from 'node:url';

import { dedupeTempoMarks, tempoSignature } from './tempo-marks-core.ts';
import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import { newArrangementNote, produceArrangement, type ArrangementParams } from './arrangement-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const mark = (bpm: number, unit = 'quarter', dots = 0): string => `<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>${unit}</beat-unit>${'<beat-unit-dot/>'.repeat(dots)}<per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
const measure = (n: number, bpm?: number, extra = ''): string => `<measure number="${n}">${bpm === undefined ? '' : mark(bpm)}${extra}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>`;
const part = (id: string, measures: string[]): string => `<part id="${id}">${measures.join('')}</part>`;
const score = (...parts: string[]): string => `<?xml version="1.0"?><score-partwise version="3.1"><part-list/>${parts.join('')}</score-partwise>`;
const marks = (xml: string): string[] => [...xml.matchAll(/<per-minute>([^<]*)<\/per-minute>/g)].map((m) => m[1]);
const bars = (xml: string): Array<string | null> => [...xml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].map((m) => /<per-minute>([^<]*)<\/per-minute>/.exec(m[2])?.[1] ?? null);

test_pure();
function test_pure(): void {
  baseTest('a constant tempo shows ONE marking: the first bar; the other bars say nothing', () => {
    const xml = score(part('P1', [measure(1, 100), measure(2, 100), measure(3, 100), measure(4, 100)]));
    assert.deepEqual(bars(dedupeTempoMarks(xml)), ['100', null, null, null]);
  });
  baseTest('a change shows at the change bar; a change BACK shows again; a bar with no mark inherits and says nothing', () => {
    const xml = score(part('P1', [measure(1, 100), measure(2, 100), measure(3, 80), measure(4), measure(5, 80), measure(6, 100), measure(7, 100)]));
    assert.deepEqual(bars(dedupeTempoMarks(xml)), ['100', null, '80', null, null, '100', null]);
  });
  baseTest('every bar different (a ritardando): every bar keeps its mark', () => {
    const xml = score(part('P1', [measure(1, 100), measure(2, 103), measure(3, 107), measure(4, 110)]));
    assert.deepEqual(bars(dedupeTempoMarks(xml)), ['100', '103', '107', '110']);
  });
  baseTest('the staves of one Score share the tempo: only the FIRST part with marks keeps any (a mark in every bar of every staff becomes one mark above the first staff), and the first mark may be in a later part', () => {
    const xml = score(part('P1', [measure(1, 100), measure(2, 100), measure(3, 90)]), part('P2', [measure(1, 100), measure(2, 100), measure(3, 90)]), part('P3', [measure(1, 100), measure(2, 100), measure(3, 90)]));
    const out = dedupeTempoMarks(xml);
    assert.equal(marks(out).length, 2); assert.deepEqual(bars(out), ['100', null, '90', null, null, null, null, null, null]);
    const late = score(part('P1', [measure(1), measure(2)]), part('P2', [measure(1, 70), measure(2, 70)]));
    assert.deepEqual(bars(dedupeTempoMarks(late)), [null, null, '70', null]);
  });
  baseTest('the unit counts: the same BPM in another beat unit (or dotted) is a CHANGE; a number written 100 and 100.0 is the same tempo', () => {
    const x = (a: string, b: string) => score(part('P1', [`<measure number="1">${a}</measure>`, `<measure number="2">${b}</measure>`]));
    assert.equal(marks(dedupeTempoMarks(x(mark(60, 'quarter'), mark(60, 'half')))).length, 2);
    assert.equal(marks(dedupeTempoMarks(x(mark(60, 'quarter'), mark(60, 'quarter', 1)))).length, 2);
    assert.equal(marks(dedupeTempoMarks(x(mark(100), mark(100).replace('<per-minute>100<', '<per-minute>100.0<')))).length, 1);
    assert.equal(tempoSignature(mark(60, 'quarter', 1)), 'quarter.|60'); assert.equal(tempoSignature('<direction><direction-type><words>Allegro</words></direction-type></direction>'), null);
  });
  baseTest('a direction that holds other things keeps them: a repeated tempo loses only its tempo part (a dynamic or a word stays), and a direction with nothing else is removed whole', () => {
    const both = '<direction placement="above"><direction-type><dynamics><f/></dynamics></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>';
    const xml = score(part('P1', [measure(1, 100), measure(2, undefined, both), measure(3, undefined, '<direction><direction-type><words>cresc.</words></direction-type></direction>')]));
    const out = dedupeTempoMarks(xml);
    assert.equal(marks(out).length, 1); assert.match(out, /<dynamics><f\/><\/dynamics>/); assert.match(out, /<words>cresc\.<\/words>/);
    assert.equal((out.match(/<direction[ >]/g) ?? []).length, 3, 'the first tempo, the dynamic one, the words one: nothing else was a direction');
    assert.equal(dedupeTempoMarks(score(part('P1', [measure(1, 100), measure(2, 100)]))).match(/<direction[ >]/g)!.length, 1);
  });
  baseTest('what is not a tempo is untouched: a score with no metronome comes back identical, non-strings and junk do not throw, and running it twice changes nothing', () => {
    const none = score(part('P1', [measure(1), measure(2)])); assert.equal(dedupeTempoMarks(none), none);
    assert.equal(dedupeTempoMarks('' as string), ''); assert.equal(dedupeTempoMarks('<not xml'), '<not xml'); assert.equal(dedupeTempoMarks(undefined as unknown as string), undefined);
    const xml = score(part('P1', [measure(1, 100), measure(2, 100), measure(3, 80)])); const once = dedupeTempoMarks(xml);
    assert.equal(dedupeTempoMarks(once), once);
    assert.equal(dedupeTempoMarks(xml.replace('<per-minute>100</per-minute>', '<per-minute>fast</per-minute>')).length > 0, true);
  });
  baseTest('WIRING: every load of a score into Verovio goes through the rule (no raw loadData), and the music tabs draw through verovio.ts only', () => {
    const v = fs.readFileSync(path.join(ROOT, 'src/verovio.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.equal((v.match(/loadData\(/g) ?? []).length, 3); assert.equal((v.match(/loadData\(dedupeTempoMarks\(musicxml\)\)/g) ?? []).length, 3);
    for (const f of ['music-edition.full.ts', 'scale-explorer-view.ts']) assert.match(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), /from '\.\/verovio\.ts'/, f);
    for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter((n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('generated') && n !== 'verovio.ts')) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\/\/.*$/gm, ''), /toolkit\.loadData\(/, `${f} loads Verovio itself`);
  });
}


// ---- CONTROL: the damaged rule goes red ---------------------------------------------------------------------------------------------------------------------------------------------------
function pureFailures(dedupe: (x: string) => string): string[] {
  const bad: string[] = []; const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('constant', bars(dedupe(score(part('P1', [measure(1, 100), measure(2, 100), measure(3, 100)])))), ['100', null, null]);
  eq('change and back', bars(dedupe(score(part('P1', [measure(1, 100), measure(2, 80), measure(3, 80), measure(4, 100)])))), ['100', '80', null, '100']);
  eq('three staves', marks(dedupe(score(part('P1', [measure(1, 100), measure(2, 100)]), part('P2', [measure(1, 100), measure(2, 100)])))).length, 1);
  eq('a mixed direction keeps its dynamic', /<dynamics>/.test(dedupe(score(part('P1', [measure(1, 100), measure(2, undefined, '<direction><direction-type><dynamics><f/></dynamics></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type></direction>')])))), true);
  return bad;
}
baseTest('CONTROL: a rule that never keeps a change, one that keeps every staff\'s mark, one that never removes, one that compares with the FIRST tempo instead of the running one, and one that drops the dynamic each go red', async () => {
  assert.deepEqual(pureFailures(dedupeTempoMarks), []);
  const src = fs.readFileSync(path.join(ROOT, 'src/tempo-marks-core.ts'), 'utf8');
  const damaged = async (from: string, to: string): Promise<(x: string) => string> => {
    assert.ok(src.includes(from), `premise: ${from}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempo-ctl-')); const file = path.join(dir, 'core.ts'); fs.writeFileSync(file, src.replace(from, to));
    try { return (await import(pathToFileURL(file).href + '?' + Math.random())).dedupeTempoMarks; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  assert.ok(pureFailures(await damaged('if (isCarrier && (running === null || sig !== running)) { running = sig; return direction; }', 'if (isCarrier && running === null) { running = sig; return direction; }')).length > 0, 'a change is never kept');
  assert.ok(pureFailures(await damaged('if (isCarrier && (running === null || sig !== running))', 'if (running === null || sig !== running)')).length > 0, 'every staff keeps its mark');
  assert.ok(pureFailures(await damaged('return withoutTempo(direction);', 'return direction;')).length > 0, 'nothing is removed');
  assert.ok(pureFailures(await damaged('{ running = sig; return direction; }', '{ running = running ?? sig; return direction; }')).length > 0, 'compares with the first tempo');
  assert.ok(pureFailures(await damaged("const rest = direction.replace(DIRECTION_TYPE, (t) => (/<metronome\\b/.test(t) ? '' : t));", "const rest = direction.replace(DIRECTION_TYPE, () => '');")).length > 0, 'the dynamic is dropped');
});

// ---- the REAL engine's MusicXML, engraved by the REAL Verovio ---------------------------------------------------------------------------------------------------------------------------------
const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const barJson = (text: string): any => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)![1]);
const extend = (source: string, bars: number, pct = 0): PhraseParams => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: pct });
async function verovio(): Promise<any> {
  const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
  const tk = new VerovioToolkit(await create()); tk.setOptions({ adjustPageHeight: true, breaks: 'auto', pageWidth: 3000, scale: 40 }); return tk;
}
function engrave(tk: any, xml: string) {
  tk.loadData(xml); let svg = ''; for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  return { tempo: (svg.match(/class="tempo"/g) ?? []).length, midi: tk.renderToMIDI(), time: JSON.stringify((tk.renderToTimemap() as any[]).map((e) => [e.tstamp, e.qstamp])) };
}
test('REAL phrase, constant tempo (4 bars, 3 staves): the engine writes 12 tempo marks and the Score shows ONE; the MIDI bytes and the time map are exactly what they were', async () => {
  const py = await engine(); const tk = await verovio();
  const out: any = computePhrase(py, barJson(barText('bar_007')), extend('bar_007', 4), 'p'); const xml: string = out.content;
  const before = engrave(tk, xml), after = engrave(tk, dedupeTempoMarks(xml));
  assert.equal(before.tempo, 12, 'non-vacuity: the engine really writes a mark in every bar of every staff'); assert.equal(after.tempo, 1);
  assert.equal(after.midi, before.midi, 'playback is unchanged'); assert.equal(after.time, before.time, 'the time map is unchanged');
});
test('REAL phrase, a ritardando (tempo_change_pct 10): each bar differs, so each bar keeps ONE mark (4), not one per staff (12); playback unchanged', async () => {
  const py = await engine(); const tk = await verovio();
  const out: any = computePhrase(py, barJson(barText('bar_007')), extend('bar_007', 4, 10), 'p'); const xml: string = out.content;
  const before = engrave(tk, xml), after = engrave(tk, dedupeTempoMarks(xml));
  assert.equal(before.tempo, 12); assert.equal(after.tempo, 4); assert.deepEqual(marks(dedupeTempoMarks(xml)), ['100', '103', '107', '110']);
  assert.equal(after.midi, before.midi); assert.equal(after.time, before.time);
});
test('REAL arrangement (two kits, one tempo): one marking; the same rule as a phrase', async () => {
  const py = await engine(); const tk = await verovio();
  const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] }, LATIN: KitParams = { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] };
  const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
  const files: Record<string, string> = {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008').replace('"tempo_bpm": 120', '"tempo_bpm": 100'), 'kits/rock.md': newKitNote(ROCK), 'kits/latin.md': newKitNote(LATIN),
    'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)), 'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)), 'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
  };
  const deps: any = { phrases: { readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (d: any, params: PhraseParams, t: string) => computePhrase(py, d, params, t) }, compute: async (d: unknown, t: string) => computePhrase(py, d, { kind: 'arrangement' }, t) };
  const res: any = await produceArrangement(deps, files['arrangements/arr_001.md'], 'arr_001');
  assert.equal(res.kind, 'score', res.kind === 'score' ? '' : String(res.message));
  const xml: string = res.payload.multi_staff_content ?? res.payload.content; const before = engrave(tk, xml), after = engrave(tk, dedupeTempoMarks(xml));
  assert.ok(before.tempo > 1, `non-vacuity: the arrangement has several marks (${before.tempo})`); assert.equal(after.tempo, 1); assert.equal(after.midi, before.midi);
});
