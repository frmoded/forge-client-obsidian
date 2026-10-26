// score_first (drain 2026-10-26-0900) — a mix in PATH mode through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts, booted once from the BUNDLED assets/engine) on the real demo bars
// (byte copies in test/fixtures/score-first/) and on synthetic bars. What is pinned here that no pure test can see: every stop of the Weight slider is the morph's OWN single-bar state for the same step (the glue asks the
// SAME engine entry points, `morph_rhythm` with bars = 1 and `morph_rhythm_info`), consecutive stops differ by exactly one hit, weight 1 is bar a and weight 0 is bar b, the three orders, tempo and swing slide as the
// morph's single bar does, the stop rule in TypeScript (`pathStopOf`) is the engine glue's rule on every d and every two-decimal weight, a bad pair is the engine's own refusal line, and the vote mix is unchanged.
// Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase, mixPath, morphChanges } from './test-support/real-rhythm-engine.ts';
import { pathStopOf, pathWeightFor, producePhrase, type MixPhrase, type MorphPhrase, type PhraseParams } from './phrase-core.ts';
import { MIX_BAR_ID, annotateMixPayload, mixLineageOf } from './mix-lineage-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 600_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BARS: Record<string, string> = Object.fromEntries(['bar_005', 'bar_006', 'bar_007', 'bar_008'].map((n) => [n, fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8')]));
const dataOf = (name: string): RhythmData => { const r = readRhythmNote(BARS[name]); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const hit = (v: unknown): boolean => v !== false && v !== 0 && v !== null && v !== undefined;
/** The set of `channel:step` cells that have a hit. */
const cells = (bar: RhythmData): Set<string> => new Set(Object.entries(bar.channels).flatMap(([c, row]) => (row as unknown[]).flatMap((v, i) => (hit(v) ? [`${c}:${i}`] : []))));
const symmetricDiff = (x: Set<string>, y: Set<string>): number => [...x].filter((c) => !y.has(c)).length + [...y].filter((c) => !x.has(c)).length;
const bar = (hits: Record<string, number[]>, tempo = 100, swing = 0): RhythmData => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: swing, tempo_bpm: tempo,
  channels: Object.fromEntries(Object.entries(hits).map(([name, at]) => [name, Array.from({ length: 16 }, (_, i) => at.includes(i))])),
} as RhythmData);
const MIX = (a: string, b: string, weight: number, extra: Partial<MixPhrase> = {}): MixPhrase => ({ kind: 'mix', a, b, weight, threshold: 0.65, ghost: true, mode: 'path', order: 'musical', seed: 0, ...extra });
const morph = (a: string, b: string, position: number, order: MorphPhrase['order'] = 'musical', seed = 0): MorphPhrase => ({ kind: 'morph', a, b, bars: 1, order, seed, position });
/** The engine's single bar for a path mix at `weight`, through the plugin glue that makes the Score (payload.mixed_bar). */
const payloadOf = (py: any, a: RhythmData, b: RhythmData, params: PhraseParams) => computePhrase(py, { a, b }, params, 'phrase_002');

test('the glue returns the morph\'s own facts for a path mix: the one bar, d, the edits in order, the stop; a vote mix returns none of them', async () => {
  const py = await engine();
  const a = dataOf('bar_005'), b = dataOf('bar_006');
  const path = payloadOf(py, a, b, MIX('bar_005', 'bar_006', 0.5));
  assert.equal(path.path_state.d, 4); assert.equal(path.path_state.k, 2);
  assert.deepEqual(path.morph_info.bars, 1); assert.equal(path.morph_info.d, 4); assert.equal(path.morph_info.edits.length, 4);
  assert.ok(path.mixed_bar && path.mixed_bar.channels, 'the one bar rides along as the mixed bar');
  const vote = payloadOf(py, a, b, MIX('bar_005', 'bar_006', 0.5, { mode: 'vote' }));
  assert.equal(vote.path_state, undefined); assert.equal(vote.morph_info, undefined);
  const bare = payloadOf(py, a, b, { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false });
  assert.equal(bare.path_state, undefined, 'a mix with no mode is the vote');
});

test('bar_005 -> bar_006 (d = 4): weight 1 is bar a, weight 0 is bar b, and each of the five stops is the morph\'s own single-bar state for that step, one hit from the next', async () => {
  const py = await engine();
  const a = dataOf('bar_005'), b = dataOf('bar_006');
  assert.equal(morphChanges(py, { a, b }), 4);
  const stops = [1, 0.75, 0.5, 0.25, 0];
  const shown: Array<Set<string>> = [];
  for (const [j, weight] of stops.entries()) {
    const p = payloadOf(py, a, b, MIX('bar_005', 'bar_006', weight));
    assert.equal(p.path_state.k, j, `weight ${weight}`);
    const m = computePhrase(py, { a, b }, morph('bar_005', 'bar_006', j), 'phrase_003');
    assert.deepEqual(p.mixed_bar, m.bars_data[0], `stop ${j} is exactly the morph's bar at position ${j}`);
    shown.push(cells(p.mixed_bar));
  }
  assert.deepEqual([...shown[0]].sort(), [...cells(a)].sort(), 'weight 1 = bar a');
  assert.deepEqual([...shown[4]].sort(), [...cells(b)].sort(), 'weight 0 = bar b');
  for (let j = 1; j < shown.length; j++) assert.equal(symmetricDiff(shown[j - 1], shown[j]), 1, `stop ${j} differs from stop ${j - 1} by exactly one hit`);
});

test('the demo pair (d = 16): 17 stops, each one hit from the next, from bar a to bar b, with the weights the strip writes', async () => {
  const py = await engine();
  const a = dataOf('bar_007'), b = dataOf('bar_008');
  const d = morphChanges(py, { a, b });
  assert.equal(d, 16);
  let previous: Set<string> | null = null;
  for (let j = 0; j <= d; j++) {
    const p = payloadOf(py, a, b, MIX('bar_007', 'bar_008', pathWeightFor(j, d)));
    assert.equal(p.path_state.k, j, `stop ${j}`);
    const now = cells(p.mixed_bar);
    if (previous) assert.equal(symmetricDiff(previous, now), 1, `stop ${j}`);
    else assert.deepEqual([...now].sort(), [...cells(a)].sort());
    previous = now;
  }
  assert.deepEqual([...previous!].sort(), [...cells(b)].sort());
});

test('the three orders are the morph\'s own: every stop equals the morph bar of the same order and seed, and the orders really differ', async () => {
  const py = await engine();
  const a = dataOf('bar_007'), b = dataOf('bar_008');
  const seenAt3: string[] = [];
  for (const [order, seed] of [['musical', 0], ['seeded', 3], ['seeded', 4], ['by_channel', 0]] as const) {
    for (const j of [0, 3, 8, 16]) {
      const p = payloadOf(py, a, b, MIX('bar_007', 'bar_008', pathWeightFor(j, 16), { order, seed }));
      const m = computePhrase(py, { a, b }, morph('bar_007', 'bar_008', j, order, seed), 'phrase_003');
      assert.deepEqual(p.mixed_bar, m.bars_data[0], `${order}/${seed} stop ${j}`);
      if (j === 3) seenAt3.push([...cells(p.mixed_bar)].sort().join(','));
    }
  }
  assert.equal(new Set(seenAt3).size, 4, 'at stop 3 the four (order, seed) choices show four different bars');
});

test('tempo and swing slide along the path exactly as the morph\'s single bar does (k / d), rounded half up', async () => {
  const py = await engine();
  const a = bar({ kick: [0, 4, 8, 12] }, 100, 0), b = bar({ kick: [0, 2, 4, 6], snare: [4] }, 140, 40);
  const d = morphChanges(py, { a, b });
  for (let j = 0; j <= d; j++) {
    const p = payloadOf(py, a, b, MIX('a', 'b', pathWeightFor(j, d)));
    const m = computePhrase(py, { a, b }, morph('a', 'b', j), 'm');
    assert.equal(p.mixed_bar.tempo_bpm, m.bars_data[0].tempo_bpm, `tempo at stop ${j}`);
    assert.equal(p.mixed_bar.swing_pct, m.bars_data[0].swing_pct, `swing at stop ${j}`);
  }
  assert.equal(payloadOf(py, a, b, MIX('a', 'b', 1)).mixed_bar.tempo_bpm, 100);
  assert.equal(payloadOf(py, a, b, MIX('a', 'b', 0)).mixed_bar.tempo_bpm, 140);
});

test('threshold and ghost are ignored in path mode: any values give the same bar', async () => {
  const py = await engine();
  const a = dataOf('bar_005'), b = dataOf('bar_006');
  const base = payloadOf(py, a, b, MIX('bar_005', 'bar_006', 0.5, { threshold: 0.5, ghost: false })).mixed_bar;
  for (const [threshold, ghost] of [[0, true], [1, true], [0.9, false], [0.05, true]] as const) assert.deepEqual(payloadOf(py, a, b, MIX('bar_005', 'bar_006', 0.5, { threshold, ghost })).mixed_bar, base, `${threshold}/${ghost}`);
});

test('the stop rule in TypeScript (pathStopOf) is the glue\'s rule: every d from 0 to 48 and every weight of two decimals (and the four-decimal weights the strip writes) give the same k', async () => {
  const py = await engine();
  // bars with exactly d differing cells: a has none, b has d hits (three rows of 16)
  const rows = ['kick', 'snare', 'hihat'];
  const barWith = (d: number) => bar(Object.fromEntries(rows.map((r, i) => [r, Array.from({ length: 16 }, (_, s) => s).slice(0, Math.max(0, Math.min(16, d - 16 * i)))])), 100);
  const empty = bar({ kick: [], snare: [], hihat: [] });
  for (const d of [0, 1, 2, 3, 4, 5, 7, 8, 10, 11, 16, 17, 31, 33, 47, 48]) {
    const b = barWith(d);
    assert.equal(morphChanges(py, { a: empty, b }), d, `a bar pair with d = ${d}`);
    for (let w100 = 0; w100 <= 100; w100++) assert.equal(mixPath(py, empty, b, w100 / 100).k, pathStopOf(w100 / 100, d), `d ${d}, weight ${w100 / 100}`);
    for (let j = 0; j <= d; j++) assert.equal(mixPath(py, empty, b, pathWeightFor(j, d)).k, j, `d ${d}, stop ${j} through the weight the strip writes (${pathWeightFor(j, d)})`);
  }
});

test('the stop is exact for a weight like 0.45: 5.5 of 10 changes rounds UP to 6 in the engine glue too (floats would say 5)', async () => {
  const py = await engine();
  const empty = bar({ kick: [], snare: [] });
  const b = bar({ kick: Array.from({ length: 10 }, (_, i) => i) });
  assert.equal(mixPath(py, empty, b, 0.45).k, 6);
  assert.equal(mixPath(py, empty, b, 0.15).k, 9);
  assert.equal(mixPath(py, empty, b, 0.35).k, 7);
});

test('a bar pair the engine refuses (different step counts) is the engine\'s own morph_rhythm line, shown as a refusal by the Score producer — not a thrown error', async () => {
  const py = await engine();
  const a = dataOf('bar_005');
  const odd = { ...dataOf('bar_006'), steps: 12, group_size: 3, channels: { kick: Array(12).fill(false) } } as RhythmData;
  const files: Record<string, string> = { 'bars/bar_005.md': BARS.bar_005, 'bars/bar_x.md': `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(odd)}\n\`\`\`\n` };
  const out = await producePhrase({ readNote: async (p) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (d, params, t) => computePhrase(py, d, params, t) }, MIX('bar_005', 'bar_x', 0.5), 'phrase_002');
  assert.equal(out.kind, 'refusal');
  assert.match((out as { message: string }).message, /^Phrase: morph_rhythm/);
  void a;
});

test('a path mix through the Score producer: the payload carries the two parents (forge_mix) AND the path\'s facts, and the vote mix\'s payload is what it was', async () => {
  const py = await engine();
  const files: Record<string, string> = { 'bars/bar_005.md': BARS.bar_005, 'bars/bar_006.md': BARS.bar_006 };
  const deps = { readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (d: any, params: PhraseParams, t: string) => computePhrase(py, d, params, t) };
  const path = await producePhrase(deps, MIX('bar_005', 'bar_006', 0.75), 'phrase_002');
  assert.equal(path.kind, 'score');
  const pp = (path as { payload: Record<string, any> }).payload;
  assert.deepEqual(pp.forge_mix.a, dataOf('bar_005')); assert.deepEqual(pp.forge_mix.b, dataOf('bar_006'));
  assert.deepEqual(pp.path_state, { d: 4, k: 1 });
  const vote = await producePhrase(deps, { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.75, threshold: 0.5, ghost: false }, 'phrase_002');
  assert.equal(vote.kind, 'score');
  const vp = (vote as { payload: Record<string, any> }).payload;
  assert.deepEqual(Object.keys(vp).filter((k) => k === 'path_state' || k === 'morph_info'), []);
  assert.ok(vp.mixed_bar && vp.forge_mix);
});

test('the Inspector on the REAL engine\'s Score in path mode: every stop of both demo pairs maps (no refusal), the bar says `k of d changes`, and every hit\'s line names the change in the morph\'s own edit list that removes or adds it', async () => {
  const py = await engine();
  for (const [an, bn] of [['bar_005', 'bar_006'], ['bar_007', 'bar_008']] as const) {
    const a = dataOf(an), b = dataOf(bn);
    const d = morphChanges(py, { a, b });
    for (const j of Array.from({ length: d + 1 }, (_, i) => i)) {
      const params = MIX(an, bn, pathWeightFor(j, d));
      const payload = payloadOf(py, a, b, params);
      const res = annotateMixPayload('phrases/phrase_002', params, { ...payload, forge_mix: { a, b } });
      assert.deepEqual(res.problems, [], `${an}->${bn} stop ${j}`);
      const edits = payload.morph_info.edits as Array<{ kind: string; channel: string; step: number }>;
      assert.equal(mixLineageOf(res.map[MIX_BAR_ID])[0].text, `made by phrase_002 (mix, path, ${j} of ${d} changes)`);
      const hitIds = Object.keys(res.map).filter((id) => id !== MIX_BAR_ID);
      assert.deepEqual([...new Set(hitIds.map((id) => `${res.map[id].params.channel}:${res.map[id].params.step}`))].sort(), [...cells(payload.mixed_bar)].sort(), `every drawn hit is mapped, and nothing else (${an}->${bn} stop ${j}); a tied tail shares its head's cell`);
      for (const id of hitIds) {
        const prov = res.map[id].params as Record<string, any>;
        const line = mixLineageOf(res.map[id])[0].text.replace(/ — tied continuation$/, '');          // a tied tail says so and otherwise reads as its head
        const at = (kind: string) => edits.findIndex((e) => e.kind === kind && e.channel === prov.channel && e.step === prov.step) + 1;
        if (prov.kind === 'both') assert.match(line, /^this hit: from both bars, velocity \d+$/);
        else if (prov.kind === 'a') { assert.ok(at('remove') > j, 'its removal is still to come'); assert.equal(line, `this hit: from ${an} only (removed at change ${at('remove')}), velocity ${prov.velocity}`); }
        else { assert.ok(at('add') >= 1 && at('add') <= j, 'its addition has been applied'); assert.equal(line, `this hit: from ${bn} only (added at change ${at('add')}), velocity ${prov.velocity}`); }
      }
    }
  }
});

test('the Inspector on the REAL engine\'s Score in the SEEDED order: the edits the glue returns are the ones for the SAME seed, so every stop of two different seeds maps with no refusal', async () => {
  const py = await engine();
  const a = dataOf('bar_007'), b = dataOf('bar_008');
  for (const seed of [3, 4]) {
    for (const j of [0, 5, 11, 16]) {
      const params = MIX('bar_007', 'bar_008', pathWeightFor(j, 16), { order: 'seeded', seed });
      const payload = payloadOf(py, a, b, params);
      const res = annotateMixPayload('phrases/phrase_002', params, { ...payload, forge_mix: { a, b } });
      assert.deepEqual(res.problems, [], `seed ${seed}, stop ${j}`);
    }
  }
});
