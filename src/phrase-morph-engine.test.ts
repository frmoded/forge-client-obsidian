// score_first M7c Phase A (drain 2026-10-24-1200) — the Score of a MORPH through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts, booted once from the BUNDLED assets/engine), on the real
// bar_005 and bar_006 of the playground vault (byte copies in test/fixtures/score-first/). Nothing is faked. Skipped (visibly) without the music wheels.
//
// Three things are pinned here that the CPython tests (forge tests/music/test_morph_rhythm.py) cannot see: the orders are the SAME in Pyodide (the seeded shuffle is a pure integer hash, not `random`; the literals below are
// the ones the CPython suite pins), the plugin glue returns what the tab needs (`morph_info`: d, the edits in order, the bars drawn) and draws one measure per bar, and the ONE rule mirrored in TypeScript — how many
// single-hit changes lie between two bars (`morphEditCount`, which the Atomic button and the Position slider use) — equals the engine's own `d` on every ordered pair of a set of bars.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { morphEditCount, morphTraceEngine, producePhrase, type MorphPhrase, type PhraseParams } from './phrase-core.ts';
import { annotateMorphPayload, morphLineageOf, morphStateOf, type MorphEdit } from './morph-lineage-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BARS: Record<string, string> = {
  bar_005: fs.readFileSync(path.join(FIXTURES, 'bar_005.md'), 'utf8'),
  bar_006: fs.readFileSync(path.join(FIXTURES, 'bar_006.md'), 'utf8'),
  bar_007: fs.readFileSync(path.join(FIXTURES, 'bar_007.md'), 'utf8'),     // M7c Phase B: the demo pair (made through createNewBar + the Beat Box's save path)
  bar_008: fs.readFileSync(path.join(FIXTURES, 'bar_008.md'), 'utf8'),
};
const dataOf = (name: string): RhythmData => { const r = readRhythmNote(BARS[name]); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const MORPH: MorphPhrase = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 };
const deps = (py: any) => ({
  readNote: async (p: string) => { const t = BARS[p.replace(/^bars\//, '').replace(/\.md$/, '')]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});

const noteOf = (data: RhythmData) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;
const bar = (hits: Record<string, Array<number | [number, number]>>, tempo = 100): RhythmData => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo,
  channels: Object.fromEntries(Object.entries(hits).map(([name, at]) => [name, Array.from({ length: 16 }, (_, i) => { const h = at.find((x) => (Array.isArray(x) ? x[0] : x) === i); return h === undefined ? false : Array.isArray(h) ? h[1] : true; })])),
} as RhythmData);
const ROCK = bar({ kick: [0, 8], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14] });
const SYNCO = bar({ kick: [0, 3, 10], snare: [7, 12], hihat: [2, 6, 10, 14] });

/** The engine's own answer for `morph_rhythm_info` / `morph_rhythm`, called directly. */
function info(py: any, a: unknown, b: unknown, order = 'musical', seed = 0): { d: number; edits: Array<{ kind: string; channel: string; step: number }> } {
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b)); py.globals.set('_o', order); py.globals.set('_s', seed);
  return JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import morph_rhythm_info as _mi\n_j.dumps(_mi(_j.loads(_a), _j.loads(_b), order=_o, seed=_s))'));
}
const triples = (r: { edits: Array<{ kind: string; channel: string; step: number }> }) => r.edits.map((e) => [e.kind, e.channel, e.step]);
/** The number of bars drawn: the highest measure number (the multi-staff Score has one part per channel, so each bar's measure appears once per part). */
const measures = (xml: string) => Math.max(0, ...[...xml.matchAll(/<measure[^>]*\snumber="(\d+)"/g)].map((m) => Number(m[1])));
/** Noteheads per bar, summed over the parts: every <note> that is not a rest, keyed by its measure number. */
function noteheadsPerBar(xml: string): number[] {
  const out: Record<number, number> = {};
  for (const m of xml.matchAll(/<measure[^>]*\snumber="(\d+)"[^>]*>([\s\S]*?)<\/measure>/g)) {
    const heads = (m[2].match(/<note[ >][\s\S]*?<\/note>/g) ?? []).filter((n) => !n.includes('<rest')).length;
    out[Number(m[1])] = (out[Number(m[1])] ?? 0) + heads;
  }
  return Object.keys(out).map(Number).sort((x, y) => x - y).map((k) => out[k]);
}

test('the bundled engine has the morph (the bundle-sync rider): the functions exist and the orders for bar_005 -> bar_006 are the CPython ones', async () => {
  const py = await engine();
  const r = info(py, dataOf('bar_005'), dataOf('bar_006'));
  assert.equal(r.d, 4);
  assert.deepEqual(triples(r), [['remove', 'kick', 3], ['remove', 'kick', 2], ['remove', 'kick', 6], ['remove', 'snare', 6]]);
});

test('the three orders for rock -> synco are, in Pyodide, exactly the literals the CPython suite pins (the seeded shuffle is an integer hash, not `random`)', async () => {
  const py = await engine();
  assert.deepEqual(triples(info(py, ROCK, SYNCO)), [
    ['remove', 'kick', 8], ['add', 'kick', 3], ['remove', 'snare', 4], ['remove', 'hihat', 4], ['add', 'snare', 7],
    ['remove', 'hihat', 8], ['remove', 'hihat', 12], ['add', 'kick', 10], ['remove', 'hihat', 0],
  ]);
  assert.deepEqual(triples(info(py, ROCK, SYNCO, 'seeded', 0)), [
    ['remove', 'hihat', 4], ['remove', 'hihat', 0], ['remove', 'hihat', 12], ['add', 'snare', 7], ['remove', 'kick', 8],
    ['remove', 'hihat', 8], ['add', 'kick', 3], ['add', 'kick', 10], ['remove', 'snare', 4],
  ]);
  assert.deepEqual(triples(info(py, ROCK, SYNCO, 'seeded', 1)), [
    ['remove', 'kick', 8], ['remove', 'snare', 4], ['remove', 'hihat', 8], ['add', 'kick', 3], ['remove', 'hihat', 0],
    ['remove', 'hihat', 4], ['add', 'kick', 10], ['add', 'snare', 7], ['remove', 'hihat', 12],
  ]);
  assert.deepEqual(triples(info(py, ROCK, SYNCO, 'by_channel')), [
    ['add', 'kick', 3], ['remove', 'kick', 8], ['add', 'kick', 10], ['remove', 'snare', 4], ['add', 'snare', 7],
    ['remove', 'hihat', 0], ['remove', 'hihat', 4], ['remove', 'hihat', 8], ['remove', 'hihat', 12],
  ]);
});

test('the Score of a 5-bar morph: one measure per bar, the engine\'s morph_info (d, the edits in order, the bars drawn), and the tempo slides', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), MORPH, 'phrase_004');
  assert.equal(out.kind, 'score');
  const payload = (out as { payload: Record<string, unknown> }).payload as Record<string, any>;
  assert.equal(measures(payload.multi_staff_content), 5);
  assert.equal(measures(payload.kit_content), 5);
  assert.deepEqual(payload.morph_info.bars, 5);
  assert.equal(payload.morph_info.d, 4);
  assert.deepEqual(payload.morph_info.edits.map((e: any) => [e.kind, e.channel, e.step]), [['remove', 'kick', 3], ['remove', 'kick', 2], ['remove', 'kick', 6], ['remove', 'snare', 6]]);
  const tempi = [...payload.multi_staff_content.matchAll(/<sound tempo="([\d.]+)"/g)].map((m: RegExpMatchArray) => Number(m[1]));
  assert.ok(tempi.length >= 1);
  assert.equal(morphTraceEngine(MORPH, payload), '[forge-morph] engine asked a=bar_005 b=bar_006 bars=5 order=musical seed=0 -> bars 5, d 4');
  assert.equal(payload.mixed_bar, undefined);
  assert.ok(Array.isArray(payload.bars_data) && payload.bars_data.length === 5, 'Phase B: the engine\'s own bars ride along (the Inspector ties every bar and hit to them)');
});

test('an atomic morph draws the noteheads one at a time: bar k+1 has exactly one notehead fewer than bar k (a pure removal path)', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), MORPH, 'phrase_004');
  const xml = ((out as { payload: Record<string, unknown> }).payload.multi_staff_content) as string;
  const perBar = noteheadsPerBar(xml);
  assert.equal(perBar.length, 5);
  assert.deepEqual(perBar.map((n, i) => (i === 0 ? 0 : perBar[i - 1] - n)), [0, 1, 1, 1, 1], `noteheads per bar ${perBar.join(',')}`);
});

test('bars = 1 with a position is one measure at that state; a position past the last change is a refusal line carrying the engine\'s own words', async () => {
  const py = await engine();
  const one = await producePhrase(deps(py), { ...MORPH, bars: 1, position: 2 }, 'phrase_004');
  assert.equal(one.kind, 'score');
  assert.equal(measures(((one as any).payload.multi_staff_content) as string), 1);
  assert.equal((one as any).payload.morph_info.bars, 1);
  const past = await producePhrase(deps(py), { ...MORPH, bars: 1, position: 9 }, 'phrase_004');
  assert.equal(past.kind, 'refusal');
  assert.match((past as { message: string }).message, /^Phrase: morph_rhythm: position must be an int from 0 to 4, got 9$/);
});

test('two bars on different grids are a refusal line carrying the engine\'s own words, not an error', async () => {
  const py = await engine();
  const twelve = { ...dataOf('bar_006'), steps: 12, channels: { kick: Array(12).fill(false), snare: Array(12).fill(false) } };
  const out = await producePhrase({ readNote: async (p: string) => (p.endsWith('bar_006.md') ? JSON.stringify({}) && `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(twelve)}\n\`\`\`\n` : BARS.bar_005), compute: async (d: any, p: PhraseParams, t: string) => computePhrase(py, d, p, t) }, MORPH, 't');
  assert.equal(out.kind, 'refusal');
  assert.match((out as { message: string }).message, /^Phrase: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12$/);
});

test('order and seed travel through the glue: morph_info and the drawn Score differ by order and by seed, and are the same on a repeat', async () => {
  const py = await engine();
  const tri = (e: any) => [e.kind, e.channel, e.step];
  const bars2 = { ...BARS, bar_007: noteOf(ROCK), bar_008: noteOf(SYNCO) };
  const d2 = { readNote: async (p: string) => { const t = (bars2 as Record<string, string>)[p.replace(/^bars\//, '').replace(/\.md$/, '')]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) };
  const base: MorphPhrase = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 10, order: 'musical', seed: 0 };
  const run = async (over: Partial<MorphPhrase>) => { const o = await producePhrase(d2, { ...base, ...over }, 't'); assert.equal(o.kind, 'score'); return (o as any).payload as Record<string, any>; };
  const norm = (p: Record<string, any>) => (p.multi_staff_content as string).replace(/[PI][0-9a-f]{32}/g, 'ID');
  const musical = await run({}); const by = await run({ order: 'by_channel' }); const s0 = await run({ order: 'seeded', seed: 0 }); const s1 = await run({ order: 'seeded', seed: 1 }); const s0again = await run({ order: 'seeded', seed: 0 });
  assert.deepEqual(musical.morph_info.edits.map(tri)[0], ['remove', 'kick', 8]);
  assert.deepEqual(by.morph_info.edits.map(tri)[0], ['add', 'kick', 3]);
  assert.deepEqual(s0.morph_info.edits.map(tri)[0], ['remove', 'hihat', 4]);
  assert.deepEqual(s1.morph_info.edits.map(tri)[0], ['remove', 'kick', 8]);
  assert.deepEqual(s1.morph_info.edits.map(tri)[3], ['add', 'kick', 3]);
  assert.equal(new Set([norm(musical), norm(by), norm(s0), norm(s1)]).size, 4, 'four different Scores');
  assert.equal(norm(s0), norm(s0again), 'a repeat is the same Score');
  assert.equal(by.morph_info.bars, 10); assert.equal(by.morph_info.d, 9);
});

test('the mix and the extend glue are unchanged: a mix still returns its mixed bar, an extend its bars, neither a morph_info', async () => {
  const py = await engine();
  const mix = computePhrase(py, { a: dataOf('bar_005'), b: dataOf('bar_006') }, { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false }, 't');
  assert.ok(mix.mixed_bar && !mix.morph_info && !mix.bars_data);
  const ext = computePhrase(py, dataOf('bar_005'), { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, 't');
  assert.ok(Array.isArray(ext.bars_data) && ext.bars_data.length === 4 && !ext.morph_info && !ext.mixed_bar);
});

test('PARITY: morphEditCount (the TypeScript rule behind Atomic and the Position slider) equals the engine\'s d on every ordered pair of a set of bars — including channels only one bar has, velocities and empty bars', async () => {
  const py = await engine();
  // a deterministic pseudo-random set (an LCG; no Math.random) of 3-channel bars with velocities, plus the real and the hand-made ones
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const made: RhythmData[] = [dataOf('bar_005'), dataOf('bar_006'), ROCK, SYNCO, bar({}), bar({ kick: [] }), bar({ kick: Array.from({ length: 16 }, (_, i) => i) })];
  for (let n = 0; n < 9; n++) {
    const chans: Record<string, Array<number | [number, number]>> = {};
    for (const name of ['kick', 'snare', 'hihat', 'claves'].slice(0, 2 + (n % 3))) chans[name] = Array.from({ length: 16 }, (_, i) => i).filter(() => rnd() < 0.3).map((i) => (rnd() < 0.3 ? [i, 40 + Math.floor(rnd() * 80)] as [number, number] : i));
    made.push(bar(chans, 90 + n));
  }
  let pairs = 0;
  for (const a of made) for (const b of made) {
    assert.equal(morphEditCount(a, b), info(py, a, b).d, `pair ${pairs}`);
    pairs++;
  }
  assert.equal(pairs, made.length * made.length);
  assert.ok(pairs >= 256);
});

// ---- M7c Phase B (drain 2026-10-24-1230): the Inspector's map on the REAL engine's Score --------------------------------------------------------------------------------------------------------------------------

const NOTE = 'phrases/phrase_004';
async function mapOf(py: any, params: MorphPhrase, bars: Record<string, string> = BARS) {
  const d = { readNote: async (p: string) => { const t = bars[p.replace(/^bars\//, '').replace(/\.md$/, '')]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, prm: PhraseParams, title: string) => computePhrase(py, data, prm, title) };
  const out = await producePhrase(d, params, 'phrase_004');
  assert.equal(out.kind, 'score', JSON.stringify(out));
  const payload = (out as { payload: Record<string, unknown> }).payload;
  return { payload, ...annotateMorphPayload(NOTE, params, payload) };
}
const texts = (map: any, id: string) => morphLineageOf(map[id]).map((l) => l.text);

test('PHASE B on the real engine: the 5-bar atomic bar_005 -> bar_006 Score is tied bar by bar and hit by hit: 5 bars + 30 hits, every id on a note of the engraved MusicXML, no problems', async () => {
  const py = await engine();
  const r = await mapOf(py, MORPH);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.map).filter((k) => k.startsWith('ph_')), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4', 'ph_bar_5']);
  assert.equal(Object.keys(r.map).filter((k) => k.startsWith('mo')).length, 30);
  const xml = r.payload.multi_staff_content as string;
  const annotated = (r as any).payload.multi_staff_content as string;
  void xml;
  for (const id of Object.keys(r.map)) assert.ok(annotated.includes(`id="${id}"`) || id.startsWith('ph_'), id);
  assert.deepEqual(r.kitProblems.length > 0 ? r.kitProblems : ['none'], ['the hits of a morph are not tied in the Kit view']);
  assert.match((r.payload.kit_content as string), /id="ph_bar_5"/, 'the Kit view still pins a bar');
  assert.deepEqual(texts(r.map, 'ph_bar_3'), [
    'bar 3 of 5', 'made by phrase_004 (morph bar_005 -> bar_006, musical order)', 'step 2 of 4 single-hit changes applied', 'from bar_005', 'from bar_006', 'tempo 100', 'removed kick at step 3',
    '▲ only bar_005 (not changed yet) · ■ only bar_006 (already changed) · ● both bars · # steps count from 1: step 1 is the first position of the bar', 'Edit this bar',
  ]);
  assert.equal(texts(r.map, 'mo2_kick_2')[0], 'this hit: from bar_005 only (removed in bar 3)');
  assert.equal(texts(r.map, 'mo5_kick_8')[0], 'this hit: from both bars');
  assert.equal((r.map.ph_bar_1.params.tempo as number), 100);
});

test('PHASE B: the demo pair bar_007 -> bar_008 is 16 single-hit changes; the atomic 17-bar Score is tied, each bar differs from the last by exactly one hit, and every change is named in order', async () => {
  const py = await engine();
  assert.equal(morphEditCount(dataOf('bar_007'), dataOf('bar_008')), 16);
  const r = await mapOf(py, { ...MORPH, a: 'bar_007', b: 'bar_008', bars: 17 });
  assert.deepEqual(r.problems, []);
  const edits = (r.payload.morph_info as any).edits as MorphEdit[];
  assert.equal(edits.length, 16);
  const drawn = r.payload.bars_data as any[];
  for (let i = 0; i < 17; i++) assert.equal(morphStateOf(dataOf('bar_007'), edits, drawn[i]), i, `bar ${i + 1} is step ${i}`);
  assert.equal(r.map.ph_bar_1.params.edit, 'unchanged: this is bar_007');
  assert.equal(r.map.ph_bar_17.params.edit, `${edits[15].kind === 'add' ? 'added' : 'removed'} ${edits[15].channel} at step ${edits[15].step + 1}; this is bar_008`);
  for (let i = 2; i <= 16; i++) assert.match(r.map[`ph_bar_${i}`].params.edit as string, /^(added|removed) [a-z_]+ at step \d+$/);
  const hitsPerBar = Array.from({ length: 17 }, (_, i) => Object.values(r.map).filter((p) => p.role === 'morph-hit' && p.params.bar === i + 1 && p.params.tiedFrom === undefined).length);   // heads: a tied continuation is the same hit drawn again
  assert.deepEqual(hitsPerBar.slice(1).map((n, i) => Math.abs(n - hitsPerBar[i])), Array(16).fill(1), 'one hit more or fewer each step');
  assert.equal(hitsPerBar[0], 12, 'rock: 2 kick + 2 snare + 8 hi-hat'); assert.equal(hitsPerBar[16], 14, 'afro-cuban: 3 + 4 + 5 + 2');
});

test('PHASE B: a non-atomic morph (7 bars of 16 changes) and the other orders tie just as well; a hit says the bar its change lands in', async () => {
  const py = await engine();
  for (const over of [{ bars: 7 }, { order: 'seeded' as const, seed: 4 }, { order: 'by_channel' as const }, { bars: 2 }]) {
    const r = await mapOf(py, { ...MORPH, a: 'bar_007', b: 'bar_008', bars: 17, ...over });
    assert.deepEqual(r.problems, [], JSON.stringify(over));
  }
  const r = await mapOf(py, { ...MORPH, a: 'bar_007', b: 'bar_008', bars: 7 });
  const oneChange = Object.values(r.map).find((p) => p.role === 'morph-hit' && p.params.kind === 'a')!;
  assert.match(morphLineageOf(oneChange)[0].text, /^this hit: from bar_007 only \(removed in bar [2-7]\)$/);
});

test('PHASE B: one bar at a position is tied too, and the position is the step', async () => {
  const py = await engine();
  for (const position of [0, 3, 4]) {
    const r = await mapOf(py, { ...MORPH, bars: 1, position });
    assert.deepEqual(r.problems, []);
    assert.equal(r.map.ph_bar_1.params.state, position);
  }
});

test('PHASE B: a forked bar through the real engine: bars_data carries the fork, morph_generated the original; the fork is a map entry without hits; the other bars read exactly as without the fork', async () => {
  const py = await engine();
  const plain = await mapOf(py, MORPH);
  const forkNote = BARS.bar_006.replace('"tempo_bpm": 100', '"tempo_bpm": 77');
  const withFork = await mapOf(py, { ...MORPH, overrides: { '3': 'bars/bar_009' } }, { ...BARS, bar_009: forkNote });
  assert.deepEqual(withFork.problems, []);
  assert.equal(withFork.map.ph_bar_3.params.fork, 'bars/bar_009');
  assert.equal(withFork.map.ph_bar_3.params.tempo, 77, 'the fork\'s own tempo');
  assert.equal(Object.keys(withFork.map).some((k) => k.startsWith('mo3_')), false);
  assert.ok(Array.isArray(withFork.payload.morph_generated) && (withFork.payload.morph_generated as unknown[]).length === 5);
  assert.deepEqual(texts(withFork.map, 'ph_bar_4'), texts(plain.map, 'ph_bar_4'), 'bar 4 reads as before the fork');
  assert.deepEqual(texts(withFork.map, 'ph_bar_2'), texts(plain.map, 'ph_bar_2'));
  assert.deepEqual(texts(withFork.map, 'mo4_kick_0'), texts(plain.map, 'mo4_kick_0'));
  assert.equal(plain.payload.morph_generated, undefined, 'without a fork nothing extra rides along');
  assert.deepEqual(texts(withFork.map, 'ph_bar_3'), ['bar 3 of 5', 'forked: edited in bar_009 (was made by phrase_004, morph bar_005 -> bar_006, musical order)', "tempo 77 (the fork's own)", 'Revert to generated']);
});
