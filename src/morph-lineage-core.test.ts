// score_first M7c Phase B (drain 2026-10-24-1230) — navigation through a morph, pure: how a bar's state is found from what the ENGINE drew, the named change between neighbouring bars, the ids on the MusicXML,
// the provenance of every bar and hit, the lineage stack (bar and hit), the legend, and what it refuses. The same code runs against the REAL engine's Score in phrase-morph-engine.test.ts and in real Chrome.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MORPH_BAR_ROLE, MORPH_HIT_ROLE, annotateMorphPayload, annotateMorphXml, barEditLine, describeEdit, morphLegend, morphLineageOf, morphProvenance, morphStateOf, morphTraceInspector, type MorphEdit,
} from './morph-lineage-core.ts';
import type { MorphPhrase } from './phrase-core.ts';
import type { ProvenanceMap, RhythmDataLike } from './provenance-core.ts';
import { morphXml } from './test-support/morph-xml.ts';

const bar = (channels: Record<string, number[]>, extra: Record<string, unknown> = {}): RhythmDataLike => ({
  time_signature: '4/4', steps: 16, group_size: 4, ...extra,
  channels: Object.fromEntries(Object.entries(channels).map(([c, at]) => [c, Array.from({ length: 16 }, (_, i) => at.includes(i))])),
} as RhythmDataLike);
const A = bar({ kick: [0, 2, 3, 6, 8], snare: [4, 6, 12] });
const B = bar({ kick: [0, 8], snare: [4, 12] });
const EDITS: MorphEdit[] = [
  { kind: 'remove', channel: 'kick', step: 3 }, { kind: 'remove', channel: 'kick', step: 2 }, { kind: 'remove', channel: 'kick', step: 6 }, { kind: 'remove', channel: 'snare', step: 6 },
];
/** The bar the engine draws at state k: bar a with its first k edits applied. */
function stateBar(a: RhythmDataLike, edits: readonly MorphEdit[], k: number): RhythmDataLike {
  const channels = Object.fromEntries(Object.entries(a.channels).map(([c, row]) => [c, [...row]]));
  for (const e of edits.slice(0, k)) channels[e.channel][e.step] = e.kind === 'add';
  return { ...a, channels };
}
const MORPH: MorphPhrase = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 };
const NOTE = 'phrases/phrase_004';
const TEMPI = [100, 105, 110, 115, 120];

function payloadFor(params: MorphPhrase, a: RhythmDataLike, b: RhythmDataLike, edits: MorphEdit[], states: number[], over: Record<string, unknown> = {}): Record<string, unknown> {
  const drawn = states.map((k) => stateBar(a, edits, k));
  const xml = morphXml(drawn, TEMPI);
  return { type: 'musicxml', content: xml, multi_staff_content: xml, forge_morph: { a, b }, morph_info: { d: edits.length, edits, bars: states.length }, bars_data: drawn, ...over };
}
const ATOMIC = [0, 1, 2, 3, 4];

// ---- the state of a drawn bar -----------------------------------------------------------------------------------------

test('a drawn bar is state k when bar a with its first k edits has exactly its hits; a bar that is on no step of the path has none', () => {
  for (let k = 0; k <= 4; k++) assert.equal(morphStateOf(A, EDITS, stateBar(A, EDITS, k)), k);
  assert.equal(morphStateOf(A, EDITS, bar({ kick: [0, 8], snare: [4, 12, 14] })), null, 'an extra hit');
  assert.equal(morphStateOf(A, EDITS, bar({ kick: [0, 2, 8], snare: [4, 6, 12] })), null, 'edits applied out of order');
  assert.equal(morphStateOf(A, [], A), 0, 'no changes: the only state is 0');
  assert.equal(morphStateOf(A, [], B), null);
});

test('a hit with another velocity is still the same hit (a velocity is not a cell), a channel only bar b has is part of the path', () => {
  const a = bar({ kick: [0] });
  const b = bar({ kick: [0], claves: [3] });
  const edits: MorphEdit[] = [{ kind: 'add', channel: 'claves', step: 3 }];
  const loud = { ...a, channels: { kick: [100, ...Array(15).fill(false)] } } as RhythmDataLike;
  assert.equal(morphStateOf(a, edits, loud), 0);
  assert.equal(morphStateOf(a, edits, stateBar({ ...a, channels: { ...a.channels, claves: Array(16).fill(false) } } as RhythmDataLike, edits, 1)), 1);
  void b;
});

// ---- the change that made a bar -------------------------------------------------------------------------------------------

test('a change in words: steps are numbered from 1, as the Beat Box numbers them', () => {
  assert.equal(describeEdit({ kind: 'remove', channel: 'kick', step: 2 }), 'removed kick at step 3');
  assert.equal(describeEdit({ kind: 'add', channel: 'snare', step: 6 }), 'added snare at step 7');
});

test('the edit line of an atomic morph: bar 1 is bar a, every middle bar names its one change, the last names its change and says it is bar b', () => {
  const line = (bar: number, state: number, previousState: number) => barEditLine({ bar, bars: 5, a: 'bar_005', b: 'bar_006', state, previousState, d: 4, edits: EDITS });
  assert.equal(line(1, 0, 0), 'unchanged: this is bar_005');
  assert.equal(line(2, 1, 0), 'removed kick at step 4');
  assert.equal(line(3, 2, 1), 'removed kick at step 3');
  assert.equal(line(4, 3, 2), 'removed kick at step 7');
  assert.equal(line(5, 4, 3), 'removed snare at step 7; this is bar_006');
});

test('a bar several changes after the last one lists them all; a bar that repeats the previous state says nothing changed; the last bar of a repeat still says it is bar b', () => {
  const line = (bar: number, bars: number, state: number, previousState: number) => barEditLine({ bar, bars, a: 'bar_005', b: 'bar_006', state, previousState, d: 4, edits: EDITS });
  assert.equal(line(2, 2, 4, 0), 'removed kick at step 4; removed kick at step 3; removed kick at step 7; removed snare at step 7; this is bar_006');
  assert.equal(line(2, 4, 1, 1), 'no change from the previous bar');
  assert.equal(line(4, 4, 4, 4), 'no change from the previous bar; this is bar_006');
  assert.equal(line(3, 5, 2, 1), 'removed kick at step 3');
});

test('one bar: the first position is bar a, the last is bar b, a middle one names its last change', () => {
  const line = (state: number) => barEditLine({ bar: 1, bars: 1, a: 'bar_005', b: 'bar_006', state, previousState: 0, d: 4, edits: EDITS });
  assert.equal(line(0), 'unchanged: this is bar_005');
  assert.equal(line(4), 'this is bar_006');
  assert.equal(line(2), 'after 2 of 4 changes, the last: removed kick at step 3');
});

// ---- the ids on the MusicXML ---------------------------------------------------------------------------------------------

test('every bar gets its id on the first part\'s measure and every hit of every bar its (channel, step) id with the bar in its scope; the ids are unique', () => {
  const drawn = ATOMIC.map((k) => stateBar(A, EDITS, k));
  const r = annotateMorphXml(morphXml(drawn, TEMPI), null, drawn);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  assert.deepEqual(r.bars.map((b) => [b.id, b.tempo]), [['ph_bar_1', 100], ['ph_bar_2', 105], ['ph_bar_3', 110], ['ph_bar_4', 115], ['ph_bar_5', 120]]);
  assert.deepEqual(r.hits.map((h) => h.bar), [...Array(8).fill(1), ...Array(7).fill(2), ...Array(6).fill(3), ...Array(5).fill(4), ...Array(4).fill(5)]);
  assert.equal(new Set(r.hits.map((h) => h.id)).size, r.hits.length);
  assert.deepEqual(r.hits.filter((h) => h.bar === 5).map((h) => h.id), ['mo5_kick_0', 'mo5_kick_8', 'mo5_snare_4', 'mo5_snare_12']);
  for (const h of r.hits) assert.ok(r.multiXml.includes(`<note id="${h.id}">`) || r.multiXml.includes(` id="${h.id}"`), h.id);
  for (const b of r.bars) assert.ok(r.multiXml.includes(`<measure number="${b.index}" id="${b.id}">`), b.id);
});

test('a tied continuation has its own id (head id + _t1) and the head\'s hit', () => {
  const drawn = [A, B];
  const r = annotateMorphXml(morphXml(drawn, TEMPI, { tied: [{ bar: 2, channel: 'kick', step: 8 }] }), null, drawn);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  const tail = r.hits.find((h) => h.id === 'mo2_kick_8_t1');
  assert.deepEqual(tail && [tail.bar, tail.channel, tail.step, tail.tiedFrom], [2, 'kick', 8, 'mo2_kick_8']);
});

test('a forked bar is skipped (its hits are not tied) while its bar still gets its id', () => {
  const drawn = ATOMIC.map((k) => stateBar(A, EDITS, k));
  const r = annotateMorphXml(morphXml(drawn, TEMPI), null, drawn, new Set([3]));
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  assert.equal(r.hits.some((h) => h.bar === 3), false);
  assert.equal(r.hits.filter((h) => h.bar === 2).length, 7);
  assert.ok(r.bars.some((b) => b.id === 'ph_bar_3'));
});

test('the Kit view carries the bar ids only and says its hits are not tied', () => {
  const drawn = [A, B];
  const kit = '<score-partwise><part id="P1"><measure number="1"><note><rest/><duration>16</duration></note></measure><measure number="2"><note><rest/><duration>16</duration></note></measure></part></score-partwise>';
  const r = annotateMorphXml(morphXml(drawn, TEMPI), kit, drawn);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  assert.ok(r.kitXml?.includes('id="ph_bar_2"'));
  assert.deepEqual(r.kitProblems, ['the hits of a morph are not tied in the Kit view']);
});

test('a Score that does not match the bars is refused naming the bar and the channel: a missing hit, a wrong bar count, an unknown channel, a wrong part count', () => {
  const drawn = [A, B];
  const xml = morphXml([A, A]);                                             // the second measure draws bar a's hits, not bar b's
  const wrong = annotateMorphXml(xml, null, drawn);
  assert.equal(wrong.ok, false);
  assert.match((wrong as { problems: string[] }).problems[0], /^bar 2, kick: the Score's hits \[0,2,3,6,8\] are not the bar's \[0,8\]$/);
  const few = annotateMorphXml(morphXml([A]), null, drawn);
  assert.match((few as { problems: string[] }).problems[0], /has 1 bars but the phrase asks for 2|1 bar\(s\) but the morph has 2/);
  const alien = annotateMorphXml(morphXml(drawn), null, [{ ...A, channels: { ...A.channels, cowbell: Array(16).fill(false) } } as RhythmDataLike, B]);
  assert.match((alien as { problems: string[] }).problems[0], /channel\(s\) the provenance map does not know: cowbell/);
  const parts = annotateMorphXml(morphXml(drawn), null, [{ ...A, channels: { ...A.channels, hihat: Array(16).fill(false) } } as RhythmDataLike, { ...B, channels: { ...B.channels, hihat: Array(16).fill(false) } } as RhythmDataLike]);
  assert.match((parts as { problems: string[] }).problems[0], /^the Score has 2 part\(s\) but the bars have 3 channel\(s\)$/);
});

// ---- the provenance ---------------------------------------------------------------------------------------------------------

test('every part must have every bar: a second part that is a bar short is refused, not tied', () => {
  const drawn = [A, B];
  const xml = morphXml(drawn, TEMPI).replace(/(<part id="P2">[\s\S]*?)<measure number="2">[\s\S]*?<\/measure>(<\/part>)/, '$1$2');
  const r = annotateMorphXml(xml, null, drawn);
  assert.equal(r.ok, false);
  assert.equal((r as { problems: string[] }).problems[0], 'the Score has 1 bar(s) but the morph has 2');
});

function mapFor(over: Partial<MorphPhrase> = {}, states = ATOMIC, a = A, b = B, edits = EDITS): { map: ProvenanceMap; problems: string[]; payload: Record<string, unknown> } {
  const params = { ...MORPH, bars: states.length, ...over } as MorphPhrase;
  const r = annotateMorphPayload(NOTE, params, payloadFor(params, a, b, edits, states));
  return { map: r.map, problems: r.problems, payload: r.payload };
}

test('the map: every bar first (bar 1 is its first element), then every hit of every bar, each tied to the path', () => {
  const { map, problems } = mapFor();
  assert.deepEqual(problems, []);
  const ids = Object.keys(map);
  assert.deepEqual(ids.slice(0, 5), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4', 'ph_bar_5']);
  assert.equal(ids.length, 5 + 30);
  assert.deepEqual(Object.values(map).filter((p) => p.role === MORPH_BAR_ROLE).map((p) => [p.params.bar, p.params.state, p.params.tempo]), [[1, 0, 100], [2, 1, 105], [3, 2, 110], [4, 3, 115], [5, 4, 120]]);
  assert.equal(map.ph_bar_3.params.edit, 'removed kick at step 3');
  assert.equal(map.ph_bar_1.params.edit, 'unchanged: this is bar_005');
  assert.equal(map.ph_bar_5.params.edit, 'removed snare at step 7; this is bar_006');
  assert.equal(map.ph_bar_3.noteId, NOTE);
});

test('a hit says where it came from and in which bar it changes: both bars; bar a only (removed in bar K); bar b only (added in bar K)', () => {
  const { map } = mapFor();
  const hit = (id: string) => map[id].params;
  assert.equal(map.mo1_kick_0.role, MORPH_HIT_ROLE);
  assert.deepEqual([hit('mo1_kick_0').kind, hit('mo1_kick_0').changedIn], ['both', null]);
  assert.deepEqual([hit('mo1_kick_3').kind, hit('mo1_kick_3').change, hit('mo1_kick_3').changedIn], ['a', 1, 2], 'change 1 is in the state of bar 2');
  assert.deepEqual([hit('mo1_snare_6').kind, hit('mo1_snare_6').change, hit('mo1_snare_6').changedIn], ['a', 4, 5]);
  assert.deepEqual([hit('mo3_kick_6').kind, hit('mo3_kick_6').changedIn], ['a', 4], 'the same cell in bar 3: still to be removed, in bar 4');
  const reverse = mapFor({}, ATOMIC, B, A, EDITS.map((e) => ({ ...e, kind: 'add' as const })).reverse());
  assert.deepEqual([reverse.map.mo5_kick_3.params.kind, reverse.map.mo5_kick_3.params.change, reverse.map.mo5_kick_3.params.changedIn], ['b', 4, 5]);
  assert.equal(reverse.map.mo1_kick_3, undefined, 'a hit bar a does not have is not in bar 1');
});

test('a hit carries its velocity: the engine\'s own number for a loud hit, 90 for a plain true', () => {
  const loud = { ...A, channels: { ...A.channels, kick: A.channels.kick.map((v, i) => (i === 0 ? 64 : v)) } } as RhythmDataLike;
  const params = { ...MORPH, bars: 2 } as MorphPhrase;
  const r = annotateMorphPayload(NOTE, params, payloadFor(params, loud, B, EDITS, [0, 4]));
  assert.deepEqual(r.problems, []);
  assert.equal(r.map.mo1_kick_0.params.velocity, 64);
  assert.equal(r.map.mo1_kick_8.params.velocity, 90);
});

test('with fewer bars than changes, the bar a change lands in is the first bar whose state includes it', () => {
  const { map } = mapFor({ bars: 3 }, [0, 2, 4]);
  assert.deepEqual([map.mo1_kick_3.params.changedIn, map.mo1_kick_2.params.changedIn, map.mo1_kick_6.params.changedIn, map.mo1_snare_6.params.changedIn], [2, 2, 3, 3]);
  assert.equal(map.ph_bar_2.params.edit, 'removed kick at step 4; removed kick at step 3');
  assert.equal(map.ph_bar_3.params.edit, 'removed kick at step 7; removed snare at step 7; this is bar_006');
});

test('one bar at a position: its state is the position, and a hit still to be removed says which change removes it', () => {
  const params = { ...MORPH, bars: 1, position: 2 } as MorphPhrase;
  const r = annotateMorphPayload(NOTE, params, payloadFor(params, A, B, EDITS, [2]));
  assert.deepEqual(r.problems, []);
  assert.equal(r.map.ph_bar_1.params.state, 2);
  assert.equal(r.map.ph_bar_1.params.edit, 'after 2 of 4 changes, the last: removed kick at step 3');
  assert.deepEqual([r.map.mo1_kick_6.params.kind, r.map.mo1_kick_6.params.change, r.map.mo1_kick_6.params.changedIn], ['a', 3, null]);
  assert.equal(morphLineageOf(r.map.mo1_kick_6)[0].text, 'this hit: from bar_005 only (removed by change 3 of 4, after this bar)');
});

test('a forked bar: its map entry carries the fork and no state, its hits are not mapped, and its neighbours\' edit lines are what they were before the fork (the slot keeps its place on the path)', () => {
  const forkBar = bar({ kick: [0, 1, 8], snare: [4, 12] });
  const params = { ...MORPH, overrides: { '3': 'bars/bar_009' } } as MorphPhrase;
  const generated = ATOMIC.map((k) => stateBar(A, EDITS, k));
  const drawn = generated.map((g, i) => (i === 2 ? forkBar : g));
  const payload = { type: 'musicxml', multi_staff_content: morphXml(drawn, TEMPI), forge_morph: { a: A, b: B }, morph_info: { d: 4, edits: EDITS, bars: 5 }, bars_data: drawn, morph_generated: generated };
  const r = annotateMorphPayload(NOTE, params, payload);
  assert.deepEqual(r.problems, []);
  assert.equal(r.map.ph_bar_3.params.fork, 'bars/bar_009');
  assert.equal('state' in r.map.ph_bar_3.params, false);
  assert.equal(Object.keys(r.map).some((id) => id.startsWith('mo3_')), false);
  assert.equal(r.map.ph_bar_4.params.edit, 'removed kick at step 7', 'the same sentence as before the fork');
  assert.equal(r.map.ph_bar_2.params.edit, 'removed kick at step 4');
  assert.equal(r.map.mo2_kick_2.params.changedIn, 4, 'a change that lands in a forked slot is said to land in the next GENERATED bar, where the person can see it');
  // without the generated bars (an engine that does not say) the fork slot keeps the step of the bar before it, so nothing is hidden: bar 4 lists the two changes since bar 2
  const bare = annotateMorphPayload(NOTE, params, { ...payload, morph_generated: undefined });
  assert.deepEqual(bare.problems, []);
  assert.equal(bare.map.ph_bar_4.params.edit, 'removed kick at step 3; removed kick at step 7');
});

test('the Score is refused, naming why, when the engine\'s bars are not the path: a bar that is no step, bars out of order, a wrong count, missing info, unreadable parents', () => {
  const params = MORPH;
  const refuse = (payload: Record<string, unknown>, p: MorphPhrase = params) => annotateMorphPayload(NOTE, p, payload).problems[0];
  const good = payloadFor(params, A, B, EDITS, ATOMIC);
  const off = ATOMIC.map((k) => stateBar(A, EDITS, k)); off[2] = bar({ kick: [0, 8], snare: [4, 12, 15] });
  assert.match(refuse({ ...good, bars_data: off, multi_staff_content: morphXml(off, TEMPI) }), /^bar 3 is not a step of the path from bar_005 to bar_006/);
  const shuffled = [0, 2, 1, 3, 4].map((k) => stateBar(A, EDITS, k));
  assert.equal(refuse({ ...good, bars_data: shuffled, multi_staff_content: morphXml(shuffled, TEMPI) }), 'the bars the engine drew are not in the order of the path');
  assert.match(refuse({ ...good, bars_data: (good.bars_data as unknown[]).slice(0, 4) }), /^the morph asks for 5 bar\(s\) but the engine drew 4$/);
  assert.equal(refuse({ ...good, morph_info: undefined }), 'the engine did not return the changes of the morph');
  assert.equal(refuse({ ...good, morph_info: { d: 3, edits: EDITS, bars: 5 } }), 'the engine says 3 changes but lists 4');
  assert.equal(refuse({ ...good, bars_data: undefined }), 'the engine did not return the bars it drew');
  assert.equal(refuse({ ...good, morph_generated: (good.bars_data as unknown[]).slice(0, 3) }), 'the engine did not return the bars the morph drew before its forks');
  assert.equal(refuse({ ...good, forge_morph: undefined }), 'the two bars of the morph did not reach the Score');
  assert.equal(refuse({ ...good, multi_staff_content: undefined, content: undefined }), 'the Score payload carries no MusicXML');
  assert.match(refuse({ ...good, multi_staff_content: morphXml(ATOMIC.map(() => A), TEMPI) }), /^bar 2, kick: the Score's hits/);
});

test('the evidence line says how many bars and hits were tied, or why not', () => {
  const { map } = mapFor();
  assert.equal(morphTraceInspector([], map), '[forge-morph] inspector mapped 5 bars and 30 hits');
  assert.equal(morphTraceInspector([], { ph_bar_1: map.ph_bar_1, mo1_kick_0: map.mo1_kick_0 }), '[forge-morph] inspector mapped 1 bar and 1 hit');
  assert.equal(morphTraceInspector(['the engine did not return the bars it drew'], {}), '[forge-morph] inspector could not map the Score: the engine did not return the bars it drew');
});

// ---- the stack ------------------------------------------------------------------------------------------------------------

const texts = (id: string, map: ProvenanceMap) => morphLineageOf(map[id]).map((l) => l.text);

test('the stack of a bar: its place, who made it, its step, the two bars (links), the tempo, the change, the legend, Edit this bar', () => {
  const { map } = mapFor();
  assert.deepEqual(texts('ph_bar_3', map), [
    'bar 3 of 5', 'made by phrase_004 (morph bar_005 -> bar_006, musical order)', 'step 2 of 4 single-hit changes applied', 'from bar_005', 'from bar_006', 'tempo 110', 'removed kick at step 3',
    '▲ only bar_005 (not changed yet) · ■ only bar_006 (already changed) · ● both bars · # steps count from 1: step 1 is the first position of the bar', 'Edit this bar',
  ]);
  const stack = morphLineageOf(map.ph_bar_3);
  assert.deepEqual(stack.filter((l) => l.noteId).map((l) => [l.noteId, l.openLabel]), [['phrases/phrase_004', 'Open phrase_004'], ['bars/bar_005', 'Open bar_005'], ['bars/bar_006', 'Open bar_006']]);
  assert.deepEqual(stack.find((l) => l.action)?.action, { id: 'fork', barNumber: 3 });
  assert.equal(stack.find((l) => l.kind === 'legend')?.legend?.length, 4);   // 2026-10-26-1100: three marks and the steps-count-from-1 item
  assert.deepEqual(stack.filter((l) => l.covers).map((l) => [l.text.slice(0, 12), l.covers]), [['bar 3 of 5', 'self'], ['made by phra', 'all'], ['step 2 of 4 ', 'self'], ['tempo 110', 'self'], ['removed kick', 'self']]);
  assert.equal(texts('ph_bar_1', map)[6], 'unchanged: this is bar_005');
  assert.equal(texts('ph_bar_5', map)[6], 'removed snare at step 7; this is bar_006');
});

test('the stack names the order: seeded with its seed, by channel', () => {
  assert.equal(texts('ph_bar_2', mapFor({ order: 'seeded', seed: 3 }).map)[1], 'made by phrase_004 (morph bar_005 -> bar_006, seeded order, seed 3)');
  assert.equal(texts('ph_bar_2', mapFor({ order: 'by_channel' }).map)[1], 'made by phrase_004 (morph bar_005 -> bar_006, by-channel order)');
});

test('the stack of a hit: its own line first (from both bars / from bar a only (removed in bar K) / from bar b only (added in bar K)), then the bar\'s stack', () => {
  const { map } = mapFor();
  assert.deepEqual(texts('mo2_kick_0', map).slice(0, 2), ['this hit: from both bars', 'bar 2 of 5']);
  assert.equal(texts('mo2_kick_2', map)[0], 'this hit: from bar_005 only (removed in bar 3)');
  assert.equal(texts('mo1_snare_6', map)[0], 'this hit: from bar_005 only (removed in bar 5)');
  const reverse = mapFor({}, ATOMIC, B, A, EDITS.map((e) => ({ ...e, kind: 'add' as const })).reverse());
  assert.equal(texts('mo5_kick_6', reverse.map)[0], 'this hit: from bar_006 only (added in bar 3)', 'the reversed morph adds what the first one removed: bar b is the one that has it');
  assert.equal(morphLineageOf(map.mo2_kick_0).at(-1)?.action?.barNumber, 2, 'Edit this bar from a hit acts on its bar');
});

test('a tied continuation says so', () => {
  const drawn = [A, B];
  const params = { ...MORPH, bars: 2 } as MorphPhrase;
  const payload = { ...payloadFor(params, A, B, EDITS, [0, 4]), multi_staff_content: morphXml(drawn, TEMPI, { tied: [{ bar: 2, channel: 'kick', step: 8 }] }) };
  const r = annotateMorphPayload(NOTE, params, payload);
  assert.deepEqual(r.problems, []);
  assert.equal(texts('mo2_kick_8_t1', r.map)[0], 'this hit: from both bars — tied continuation');
});

test('a forked bar\'s stack: forked, who made it, the fork\'s own tempo, Revert to generated; a morph of a bar with itself says so', () => {
  const forkBar = bar({ kick: [0, 1, 8], snare: [4, 12] }, {});
  const params = { ...MORPH, overrides: { '3': 'bars/bar_009' } } as MorphPhrase;
  const drawn = ATOMIC.map((k) => (k === 2 ? forkBar : stateBar(A, EDITS, k)));
  const generated = ATOMIC.map((k) => stateBar(A, EDITS, k));
  const r = annotateMorphPayload(NOTE, params, { type: 'musicxml', multi_staff_content: morphXml(drawn, TEMPI), forge_morph: { a: A, b: B }, morph_info: { d: 4, edits: EDITS, bars: 5 }, bars_data: drawn, morph_generated: generated });
  assert.deepEqual(texts('ph_bar_3', r.map), ['bar 3 of 5', 'forked: edited in bar_009 (was made by phrase_004, morph bar_005 -> bar_006, musical order)', "tempo 110 (the fork's own)", 'Revert to generated']);
  assert.deepEqual(morphLineageOf(r.map.ph_bar_3).find((l) => l.action)?.action, { id: 'revert', barNumber: 3 });
  assert.deepEqual(morphLineageOf(r.map.ph_bar_3).filter((l) => l.noteId).map((l) => [l.noteId, l.openLabel]), [['bars/bar_009', 'Open bar_009']], 'the fork note is a link');
  const same = annotateMorphPayload(NOTE, { ...MORPH, b: 'bar_005', bars: 2 } as MorphPhrase, { ...payloadFor({ ...MORPH, bars: 2 } as MorphPhrase, A, A, [], [0, 0]), morph_info: { d: 0, edits: [], bars: 2 } });
  assert.deepEqual(same.problems, []);
  assert.equal(texts('ph_bar_1', same.map)[3], 'from bar_005 (both ends of the morph)');
});

test('the legend: three marks with the colours of the mix, in the morph\'s words, and (2026-10-26-1100, deliberate) a fourth item saying steps count from 1', () => {
  const l = morphLegend('bar_005', 'bar_006');
  assert.deepEqual(l.legend?.slice(0, 3).map((x) => [x.mark, x.colour]), [['▲', '#1b6ec2'], ['■', '#d9730d'], ['●', '#6a3d9a']]);
  assert.equal(l.legend?.length, 4);
  assert.equal(l.kind, 'legend');
});

test('an element that is not a bar or a hit of a morph gets the generic two lines; morphProvenance is exported for the surfaces that build their own map', () => {
  assert.deepEqual(morphLineageOf({ noteId: 'bars/bar_005', role: 'hit', params: {} }).map((l) => l.text), ['hit', 'bars/bar_005']);
  assert.equal(typeof morphProvenance, 'function');
});
