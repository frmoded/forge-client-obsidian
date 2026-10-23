// score_first M8 (drain 2026-10-23-0230) — navigation through a mix: where did each hit come from? The pure core: classify every hit of the mixed bar from the TWO PARENT BARS with the engine's own rule
// (v = w*pA + (1-w)*pB, placed at v >= threshold, a ghost at v >= threshold/2), cross-check that against what the engine really returned (never guess), tie the engraved ids to it, and write the
// Inspector stack. Pure: no Obsidian, no engine, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIX_BAR_ID, MIX_COLOURS, annotateMixXml, classifyMixHits, mixLegend, mixLineageOf, mixPercents, mixProvenance, mixHitsFromEngine, type MixParams,
} from './mix-lineage-core.ts';
import type { RhythmDataLike } from './provenance-core.ts';

const bar = (channels: Record<string, Array<boolean | number>>): RhythmDataLike & { tempo_bpm: number; swing_pct: number } => ({ time_signature: '4/4', steps: 16, group_size: 4, tempo_bpm: 100, swing_pct: 0, channels });
const row = (at: Record<number, boolean | number>): Array<boolean | number> => Array.from({ length: 16 }, (_, i) => (i in at ? at[i] : false));
// bar_005 and bar_006 as in the playground vault: bar_006 is a plain backbeat, a subset of bar_005
const A = bar({ kick: row({ 0: true, 2: true, 3: true, 6: true, 8: true }), snare: row({ 4: true, 6: true, 12: true }) });
const B = bar({ kick: row({ 0: true, 8: true }), snare: row({ 4: true, 12: true }) });
const P = (weight: number, threshold = 0.5, ghost = false): MixParams => ({ a: 'bar_005', b: 'bar_006', weight, threshold, ghost });
const kinds = (hits: ReturnType<typeof classifyMixHits>) => hits.map((h) => `${h.channel}${h.step}:${h.kind}`);

test('classification at weight 0.70 / threshold 0.50: bar_006 is a subset of bar_005, so its hits are in BOTH and the other four are bar_005 only', () => {
  assert.deepEqual(kinds(classifyMixHits(A, B, P(0.7))), ['kick0:both', 'kick2:a', 'kick3:a', 'kick6:a', 'kick8:both', 'snare4:both', 'snare6:a', 'snare12:both']);
});

test('classification at weight 0.40 (below the threshold): the bar_005-only hits are gone, with ghost notes they come back as ghost hits', () => {
  assert.deepEqual(kinds(classifyMixHits(A, B, P(0.4))), ['kick0:both', 'kick8:both', 'snare4:both', 'snare12:both']);
  assert.deepEqual(kinds(classifyMixHits(A, B, P(0.4, 0.5, true))), ['kick0:both', 'kick2:ghost-a', 'kick3:ghost-a', 'kick6:ghost-a', 'kick8:both', 'snare4:both', 'snare6:ghost-a', 'snare12:both']);
});

test('the tie: weight 0.5 / threshold 0.5 places a one-bar hit (v 0.5 >= 0.5); a b-only hit follows 1 - weight', () => {
  assert.equal(classifyMixHits(A, B, P(0.5)).find((h) => h.channel === 'kick' && h.step === 2)?.kind, 'a');
  const onlyB = bar({ kick: row({ 5: true }) });
  assert.deepEqual(kinds(classifyMixHits(bar({ kick: row({}) }), onlyB, P(0.3, 0.7))), ['kick5:b']);          // v = 0.7 >= 0.7
  assert.deepEqual(kinds(classifyMixHits(bar({ kick: row({}) }), onlyB, P(0.4, 0.7))), []);                    // v = 0.6 < 0.7, no ghost
  assert.deepEqual(kinds(classifyMixHits(bar({ kick: row({}) }), onlyB, P(0.4, 0.7, true))), ['kick5:ghost-b']); // v = 0.6 >= 0.35
});

test('a slider weight sitting exactly at its own value is not lost to float error (1 - 0.9 is 0.09999999999999998)', () => {
  assert.deepEqual(kinds(classifyMixHits(bar({ kick: row({ 1: true }) }), bar({ kick: row({}) }), P(0.1, 0.1))), ['kick1:a']);
  assert.deepEqual(kinds(classifyMixHits(bar({ kick: row({}) }), bar({ kick: row({ 1: true }) }), P(0.9, 0.1))), ['kick1:b']);
});

test('v is carried: the weight for a-only, 1 - weight for b-only, 1 for both', () => {
  const hits = classifyMixHits(A, B, P(0.7));
  assert.equal(hits.find((h) => h.channel === 'kick' && h.step === 2)?.v, 0.7);
  assert.equal(hits.find((h) => h.channel === 'kick' && h.step === 0)?.v, 1);
  assert.ok(Math.abs((classifyMixHits(bar({ kick: row({}) }), bar({ kick: row({ 1: true }) }), P(0.7, 0.2)).find((h) => h.channel === 'kick')?.v ?? 0) - 0.3) < 1e-9);
});

test('a channel only one bar has, and int velocities, classify the same way', () => {
  const a = bar({ kick: row({ 0: 100 }) });
  const b = bar({ kick: row({ 0: 60 }), hihat: row({ 2: true }) });
  assert.deepEqual(kinds(classifyMixHits(a, b, P(0.5))), ['kick0:both', 'hihat2:b']);
});

// ---- checked against what the engine really returned ----------------------------------------------------------------------------------------------------------------------------------

test('mixHitsFromEngine: the engine\'s mixed bar agrees with the rule, so every hit gets its kind and the engine\'s own velocity (a plain true is 90, a ghost is 36)', () => {
  const mixed = bar({ kick: row({ 0: true, 2: 36, 3: 36, 6: 36, 8: true }), snare: row({ 4: true, 6: 36, 12: true }) });
  const r = mixHitsFromEngine(A, B, P(0.4, 0.5, true), mixed);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const find = (c: string, s: number) => r.hits.find((h) => h.channel === c && h.step === s)!;
  assert.equal(find('kick', 0).velocity, 90);
  assert.equal(find('kick', 2).velocity, 36);
  assert.equal(find('kick', 2).kind, 'ghost-a');
  assert.equal(r.hits.length, 8);
});

test('mixHitsFromEngine: a hit the rule predicts but the engine did not return (or the other way round) is a refusal naming it — the rule and the engine can never silently disagree', () => {
  const missing = bar({ kick: row({ 0: true, 8: true }), snare: row({ 4: true, 12: true }) });     // weight 0.7 should also give kick 2
  const r1 = mixHitsFromEngine(A, B, P(0.7), missing);
  assert.equal(r1.ok, false);
  if (r1.ok === false) assert.match(r1.problems[0], /kick.*step 3|kick.*2/);
  const extra = bar({ kick: row({ 0: true, 1: true, 8: true }), snare: row({ 4: true, 12: true }) });
  const r2 = mixHitsFromEngine(A, B, P(0.4), extra);
  assert.equal(r2.ok, false);
  const ghostWrong = bar({ kick: row({ 0: true, 2: true, 8: true }), snare: row({ 4: true, 12: true }) });   // a ghost the engine wrote as a plain true
  assert.equal(mixHitsFromEngine(A, B, P(0.4, 0.5, true), ghostWrong).ok, false);
});

// ---- the stack ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('percents: whole percents of weight and 1 - weight', () => {
  assert.deepEqual(mixPercents(0.7), { a: 70, b: 30 });
  assert.deepEqual(mixPercents(0.5), { a: 50, b: 50 });
  assert.deepEqual(mixPercents(0.35), { a: 35, b: 65 });
  assert.deepEqual(mixPercents(1), { a: 100, b: 0 });
});

const prov = (params: MixParams, hit?: { channel: string; step: number }) => {
  const mixed = bar({ kick: row({ 0: true, 2: true, 8: true }), snare: row({ 4: true }) });
  const hits = classifyMixHits(A, B, params).map((h) => ({ ...h, velocity: 90 }));
  void mixed;
  return mixProvenance('phrases/phrase_002', params, hits.map((h) => ({ id: `mx_${h.channel}_${h.step}`, channel: h.channel, step: h.step })), hits, 4)[hit ? `mx_${hit.channel}_${hit.step}` : MIX_BAR_ID];
};

test('the stack of the pinned BAR at weight 0.70: made by, then one row per parent with its percent and an Open note link (and the legend)', () => {
  const stack = mixLineageOf(prov(P(0.7)));
  assert.equal(stack[0].text, 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)');
  assert.equal(stack[0].noteId, 'phrases/phrase_002');
  assert.equal(stack[0].openLabel, 'Open phrase_002');
  assert.equal(stack[1].text, 'from bar_005 (70 %)');
  assert.equal(stack[1].noteId, 'bars/bar_005');
  assert.equal(stack[1].openLabel, 'Open bar_005');
  assert.equal(stack[2].text, 'from bar_006 (30 %)');
  assert.equal(stack[2].noteId, 'bars/bar_006');
  assert.equal(stack[3].kind, 'legend');
  assert.equal(stack.length, 4);
});

test('the stack at weight 0.50 and 0.35 shows its own numbers', () => {
  assert.equal(mixLineageOf(prov(P(0.5)))[0].text, 'made by phrase_002 (mix, 50 % bar_005 / 50 % bar_006, threshold 0.50)');
  assert.equal(mixLineageOf(prov(P(0.35, 0.25)))[0].text, 'made by phrase_002 (mix, 35 % bar_005 / 65 % bar_006, threshold 0.25)');
  assert.deepEqual(mixLineageOf(prov(P(0.35, 0.25))).slice(1, 3).map((e) => e.text), ['from bar_005 (35 %)', 'from bar_006 (65 %)']);
});

test('a pinned HIT puts its own line first: from one bar only, from both bars, with the velocity; a ghost says why it is only a ghost', () => {
  assert.equal(mixLineageOf(prov(P(0.7), { channel: 'kick', step: 2 }))[0].text, 'this hit: from bar_005 only, velocity 90');
  assert.equal(mixLineageOf(prov(P(0.7), { channel: 'kick', step: 0 }))[0].text, 'this hit: from both bars, velocity 90');
  assert.equal(mixLineageOf(prov(P(0.4, 0.5, true), { channel: 'kick', step: 2 }))[0].text, 'ghost: only bar_005 has it (v 0.40, below threshold 0.50)');
  const hit = mixLineageOf(prov(P(0.7), { channel: 'kick', step: 2 }));
  assert.equal(hit[1].text, 'made by phrase_002 (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)', 'then the bar\'s stack');
  assert.equal(hit.length, 5);
});

test('b-only hit: names bar_006 and v = 1 - weight', () => {
  const a = bar({ kick: row({}) }), b = bar({ kick: row({ 5: true }) });
  const params = P(0.3, 0.7);
  const hits = classifyMixHits(a, b, params).map((h) => ({ ...h, velocity: 90 }));
  const p = mixProvenance('phrases/phrase_002', params, [{ id: 'mx_kick_5', channel: 'kick', step: 5 }], hits, null)['mx_kick_5'];
  assert.equal(mixLineageOf(p)[0].text, 'this hit: from bar_006 only, velocity 90');
  const ghost = classifyMixHits(a, b, P(0.4, 0.7, true)).map((h) => ({ ...h, velocity: 36 }));
  const pg = mixProvenance('phrases/phrase_002', P(0.4, 0.7, true), [{ id: 'mx_kick_5', channel: 'kick', step: 5 }], ghost, null)['mx_kick_5'];
  assert.equal(mixLineageOf(pg)[0].text, 'ghost: only bar_006 has it (v 0.60, below threshold 0.70)');
});

test('a mix of a bar with itself has one parent row (both sides), not two links to the same note', () => {
  const stack = mixLineageOf(prov({ a: 'bar_005', b: 'bar_005', weight: 0.7, threshold: 0.5, ghost: false }));
  assert.deepEqual(stack.filter((e) => e.kind === 'note').map((e) => e.text), ['made by phrase_002 (mix, 70 % bar_005 / 30 % bar_005, threshold 0.50)', 'from bar_005 (both sides of the mix)']);
});

test('the legend names the three kinds with the colours the Score is painted with; the hollow-means-ghost entry is there only when ghost notes are on', () => {
  const legend = mixLegend(P(0.7)).legend ?? [];
  assert.deepEqual(legend.map((l) => l.text), ['only bar_005', 'only bar_006', 'both bars']);
  assert.deepEqual(legend.map((l) => l.colour), [MIX_COLOURS.a, MIX_COLOURS.b, MIX_COLOURS.both]);
  assert.equal(new Set(legend.map((l) => l.mark)).size, 3, 'three different marks: it must not depend on telling colours apart');
  assert.equal(new Set(legend.map((l) => l.colour)).size, 3);
  assert.deepEqual((mixLegend(P(0.7, 0.5, true)).legend ?? []).map((l) => l.text).slice(-1), ['hollow = a ghost hit']);
});

// ---- tying the engraved ids -------------------------------------------------------------------------------------------------------------------------------------------------------------

const XML = (hitsKick: number[]) => `<score-partwise><part-list/><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${(() => {
  let cursor = 0; let s = '';
  for (const st of hitsKick) { if (st > cursor) s += `<note><rest/><duration>${st - cursor}</duration></note>`; s += `<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration></note>`; cursor = st + 1; }
  if (cursor < 16) s += `<note><rest/><duration>${16 - cursor}</duration></note>`;
  return s;
})()}</measure></part></score-partwise>`;

test('annotateMixXml: the bar gets its id and every hit its (channel, step) id, verified against the mixed bar', () => {
  const mixed = bar({ kick: row({ 0: true, 8: true }) });
  const r = annotateMixXml(XML([0, 8]), null, mixed);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.multiXml, /<measure number="1" id="ph_bar_1">/);
  assert.match(r.multiXml, /<note id="mx_kick_0">/);
  assert.match(r.multiXml, /<note id="mx_kick_8">/);
  assert.deepEqual(r.hits.map((h) => h.id), ['mx_kick_0', 'mx_kick_8']);
  assert.equal(MIX_BAR_ID, 'ph_bar_1');
});

test('annotateMixXml: a Score whose notes are not the mixed bar\'s hits is refused with the reason (it never guesses)', () => {
  const r = annotateMixXml(XML([0, 9]), null, bar({ kick: row({ 0: true, 8: true }) }));
  assert.equal(r.ok, false);
  if (r.ok === false) assert.match(r.problems[0], /kick/);
});

// ---- gaps found by the mutants ------------------------------------------------------------------------------------------------------------------------------------------------------------

import { annotateMixPayload } from './mix-lineage-core.ts';

test('threshold 0: a step neither bar hits is NOT a hit (v 0 >= 0 must not place phantom hits), with or without ghost notes', () => {
  assert.deepEqual(kinds(classifyMixHits(A, B, P(0.4, 0))), ['kick0:both', 'kick2:a', 'kick3:a', 'kick6:a', 'kick8:both', 'snare4:both', 'snare6:a', 'snare12:both']);
  assert.equal(classifyMixHits(A, B, P(0.4, 0, true)).length, 8);
  assert.deepEqual(classifyMixHits(bar({ kick: row({}) }), bar({ kick: row({}) }), P(0.5, 0, true)), []);
});

test('v is rounded to 9 places: a b-only hit at weight 0.7 has v 0.3, not 0.30000000000000004', () => {
  const b = classifyMixHits(bar({ kick: row({}) }), bar({ kick: row({ 1: true }) }), P(0.7, 0.2));
  assert.equal(b[0].v, 0.3);
});

test('mixHitsFromEngine: a ghost the engine wrote as a plain hit is a refusal even when every position agrees', () => {
  const a = bar({ kick: row({ 1: true }) }), b = bar({ kick: row({}) });
  const params = P(0.4, 0.5, true);                                   // v 0.4 < 0.5 but >= 0.25: the rule says ghost
  const plain = bar({ kick: row({ 1: true }) });
  const r = mixHitsFromEngine(a, b, params, plain);
  assert.equal(r.ok, false);
  if (r.ok === false) assert.match(r.problems[0], /kick step 2: the rule says a ghost, the engine wrote true/);
  assert.equal(mixHitsFromEngine(a, b, params, bar({ kick: row({ 1: 36 }) })).ok, true);
});

test('percents are ROUNDED: 0.29 is 29 % and 71 % (0.29 * 100 is 28.999999999999996 in floats)', () => {
  assert.deepEqual(mixPercents(0.29), { a: 29, b: 71 });
  assert.deepEqual(mixPercents(0.57), { a: 57, b: 43 });
});

test('a tied tail carries its head\'s provenance and says so; the head does not', () => {
  const params = P(0.7);
  const hits = classifyMixHits(A, B, params).map((h) => ({ ...h, velocity: 90 }));
  const map = mixProvenance('phrases/phrase_002', params, [{ id: 'mx_kick_0', channel: 'kick', step: 0 }, { id: 'mx_kick_0_t1', channel: 'kick', step: 0, tiedFrom: 'mx_kick_0' }], hits, null);
  assert.equal(map.mx_kick_0.params.tiedFrom, undefined);
  assert.equal(map.mx_kick_0_t1.params.tiedFrom, 'mx_kick_0');
  assert.equal(mixLineageOf(map.mx_kick_0_t1)[0].text, 'this hit: from both bars, velocity 90 — tied continuation');
  assert.equal(mixLineageOf(map.mx_kick_0)[0].text, 'this hit: from both bars, velocity 90');
});

test('annotateMixPayload says WHY it cannot map: the parents did not arrive; the engine returned no mixed bar; the engine disagrees with the rule', () => {
  const xml = XML([0, 8]);
  const mixed = bar({ kick: row({ 0: true, 8: true }) });
  const parents = { a: bar({ kick: row({ 0: true, 8: true }) }), b: bar({ kick: row({ 0: true, 8: true }) }) };
  const params = P(0.7);
  assert.equal(annotateMixPayload('phrases/phrase_002', params, { multi_staff_content: xml, mixed_bar: mixed }).problems[0], 'the two bars of the mix did not reach the Score');
  assert.equal(annotateMixPayload('phrases/phrase_002', params, { multi_staff_content: xml, forge_mix: parents }).problems[0], 'the engine did not return the mixed bar');
  const disagree = annotateMixPayload('phrases/phrase_002', params, { multi_staff_content: xml, forge_mix: { a: bar({ kick: row({ 0: true, 5: true, 8: true }) }), b: bar({ kick: row({ 0: true, 8: true }) }) }, mixed_bar: mixed });
  assert.match(disagree.problems[0], /kick step 6: the rule places a hit the engine did not return/);
  assert.deepEqual(disagree.map, {});
  const good = annotateMixPayload('phrases/phrase_002', params, { multi_staff_content: xml, forge_mix: parents, mixed_bar: mixed });
  assert.deepEqual(good.problems, []);
  assert.equal(Object.keys(good.map)[0], MIX_BAR_ID);
});
