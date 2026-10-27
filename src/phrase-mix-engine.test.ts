// score_first M7 Phase A (drain 2026-10-22-2330) — the Score of a MIX through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts), on the real bar_005 and bar_006 of the
// playground vault (byte copies in test/fixtures/score-first/, checked against the sibling checkout when there is one). Nothing is faked. Skipped (visibly) without the music wheels.
//
// What the two bars are: bar_005 kick 0 2 3 6 8, snare 4 6 12; bar_006 kick 0 8, snare 4 12 (a plain backbeat, a SUBSET of bar_005's hits). So at threshold 0.5 the mix is bar_005 while the weight
// is 0.5 or more (a hit only bar_005 has has v = weight >= 0.5) and bar_006 below that — the change between them happens at the threshold, not gradually.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { dirtySiblingReason } from './test-support/dirty-sibling.ts';
import { mixTraceEngine, producePhrase, producePhraseNote, type MixPhrase, type PhraseParams } from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const SIBLINGS = path.resolve(import.meta.dirname, '../../music-playground/bars');
const BARS: Record<string, string> = {
  bar_005: fs.readFileSync(path.join(FIXTURES, 'bar_005.md'), 'utf8'),
  bar_006: fs.readFileSync(path.join(FIXTURES, 'bar_006.md'), 'utf8'),
};
const dataOf = (name: string) => { const r = readRhythmNote(BARS[name]); if (r.ok === false) throw new Error(r.message); return r.value.data as unknown as Record<string, unknown> & { channels: Record<string, Array<boolean | number>> }; };

const MIX: MixPhrase = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false };
const deps = (py: any, bars = BARS) => ({
  readNote: async (p: string) => { const t = bars[p.replace(/^bars\//, '').replace(/\.md$/, '')]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});
const hitsOf = (steps: Array<boolean | number>) => steps.flatMap((v, i) => (v === false || v === 0 ? [] : [i]));

/** The engine's own mixed bar (mix_rhythm called directly), as plain JSON. */
function engineMix(py: any, a: unknown, b: unknown, weight: number, threshold = 0.5, ghost = false): any {
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b));
  py.globals.set('_w', weight); py.globals.set('_th', threshold); py.globals.set('_g', ghost);
  return JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import mix_rhythm as _mix\n_j.dumps(_mix(_j.loads(_a), _j.loads(_b), weight=_w, threshold=_th, ghost=_g))'));
}
/** The engine's Score of ONE bar through the same path a one-bar phrase takes (rhythm_bars_to_stream + serialize_result). */
function scoreOfBar(py: any, bar: unknown, title = 'phrase_002'): any {
  py.globals.set('_bar', JSON.stringify(bar));
  py.globals.set('_title', title);
  const proxy = py.runPython('import json as _j\nfrom forge.music.lib import rhythm_bars_to_stream as _rbs\nserialize_result(_rbs([_j.loads(_bar)]), {"snippet_id": _title, "meta": {"title": _title}})');
  const out = proxy.toJs({ dict_converter: Object.fromEntries }); proxy.destroy?.();
  return out;
}
// music21 gives every part a fresh random id (P or I + 32 hex digits, for the part and its instrument) on each run; nothing else in the XML is random, so two Scores of the same bars are equal once those ids are made alike.
const xmlOf = (payload: Record<string, unknown>) => (payload.multi_staff_content as string).replace(/[PI][0-9a-f]{32}/g, 'ID');

// Strict against the COMMITTED playground bars (the matrix's clean worktree); a live checkout whose bars the plugin has refreshed (untracked or modified files) is skipped WITH its reason, counted as a skip,
// never compared (it would be red on the driver's machine for a reason that is not a bug) and never silently passed.
baseTest('the fixtures are the playground vault\'s own bars (when it is checked out)', async (t) => {
  const dirty = dirtySiblingReason(SIBLINGS, 'music-playground/bars');
  if (dirty !== null) { t.skip(`not comparing: ${dirty}`); return; }
  for (const name of Object.keys(BARS)) {
    const sibling = path.join(SIBLINGS, `${name}.md`);
    if (!fs.existsSync(sibling)) continue;                 // not checked out here: the fixture stands in
    assert.equal(fs.readFileSync(sibling, 'utf8'), BARS[name], name);
  }
});

test('REAL ENGINE: weight 1 is bar_005, weight 0 is bar_006, weight 0.5 is their union (the tie) — the engine\'s own bars, hit for hit', async () => {
  const py = await engine();
  const a = dataOf('bar_005'); const b = dataOf('bar_006');
  const one = engineMix(py, a, b, 1); const zero = engineMix(py, a, b, 0); const half = engineMix(py, a, b, 0.5);
  assert.deepEqual(one.channels, a.channels, 'weight 1 gives bar_005');
  assert.deepEqual(zero.channels, b.channels, 'weight 0 gives bar_006');
  assert.deepEqual(hitsOf(half.channels.kick), [0, 2, 3, 6, 8]);
  assert.deepEqual(hitsOf(half.channels.snare), [4, 6, 12]);
  assert.deepEqual(hitsOf(engineMix(py, a, b, 0.45).channels.kick), [0, 8], 'just under the threshold the bar_005-only hits are gone');
  assert.deepEqual(hitsOf(engineMix(py, a, b, 0.5, 0.51).channels.kick), [0, 8], 'a threshold just over the tie keeps only the shared hits');
});

test('REAL ENGINE: the Score of the mix phrase at weight 1 / 0.5 / 0 is the engine\'s Score of bar_005 / bar_005\'s hits / bar_006, through the plugin\'s own path', async () => {
  const py = await engine();
  const a = dataOf('bar_005'); const b = dataOf('bar_006');
  const at = async (weight: number, extra: Partial<MixPhrase> = {}) => {
    const out = await producePhrase(deps(py), { ...MIX, weight, ...extra }, 'phrase_002');
    assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
    return out.kind === 'score' ? out.payload : {};
  };
  const w1 = await at(1); const w05 = await at(0.5); const w0 = await at(0);
  assert.equal(w1.type, 'musicxml');
  assert.equal(xmlOf(w1), xmlOf(scoreOfBar(py, a)), 'weight 1: the Score of bar_005');
  assert.equal(xmlOf(w0), xmlOf(scoreOfBar(py, b)), 'weight 0: the Score of bar_006');
  assert.equal(xmlOf(w05), xmlOf(scoreOfBar(py, engineMix(py, a, b, 0.5))), 'weight 0.5: the Score of the engine\'s own mixed bar');
  assert.notEqual(xmlOf(w1), xmlOf(w0), 'the two ends differ');
  assert.equal(xmlOf(w05), xmlOf(w1), 'at the tie the union of these two bars IS bar_005 (bar_006 is a subset)');
  assert.ok(typeof w1.multi_staff_midi_base64 === 'string' && (w1.multi_staff_midi_base64 as string).length > 0, 'the payload carries the MIDI the player uses');
  const w045 = await at(0.45);
  assert.equal(xmlOf(w045), xmlOf(w0), 'below the threshold the Score is bar_006');
  // ghost notes at weight 0.4 bring the hits only bar_005 has back, quietly (v 0.4 >= 0.25), so the Score differs from the same weight without them
  const noGhost = await at(0.4); const ghost = await at(0.4, { ghost: true });
  assert.equal(xmlOf(noGhost), xmlOf(w0));
  assert.notEqual(xmlOf(ghost), xmlOf(noGhost), 'ghost notes change the Score');
  assert.equal(xmlOf(ghost), xmlOf(scoreOfBar(py, engineMix(py, a, b, 0.4, 0.5, true))));
});

test('REAL ENGINE: one bar, one tempo mark, in both engraved views', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), MIX, 'phrase_002');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  for (const key of ['multi_staff_content', 'kit_content'] as const) {
    const xml = out.payload[key] as string;
    assert.equal(typeof xml, 'string', key);
    for (const part of xml.split(/<part /).slice(1)) assert.equal((part.match(/<measure /g) ?? []).length, 1, `${key}: one bar in every part`);
  }
});

test('REAL ENGINE: two bars on different grids is the engine\'s mix_rhythm refusal, shown as the Score\'s refusal line (not an error, nothing thrown)', async () => {
  const py = await engine();
  const threeFour = BARS.bar_006.replace('"time_signature": "4/4"', '"time_signature": "3/4"').replace('"steps": 16', '"steps": 12').replace(/"(kick|snare)": \[[^\]]*\]/g, (_m, c) => `"${c}": [${Array(12).fill('false').join(', ')}]`);
  const out = await producePhrase(deps(py, { ...BARS, bar_007: threeFour }), { ...MIX, b: 'bar_007' }, 'phrase_002');
  assert.equal(out.kind, 'refusal', JSON.stringify(out));
  if (out.kind === 'refusal') assert.match(out.message, /^Phrase: mix_rhythm: a and b must agree on (time_signature|steps)/);
});

test('REAL ENGINE: a weight of 3 in the phrase note is refused naming weight before the engine is asked; the note reads like the person typed it', async () => {
  const py = await engine();
  const note = (obj: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;
  const bad = await producePhraseNote(deps(py), note({ ...MIX, weight: 3 }), 'phrase_002');
  assert.equal(bad.kind, 'refusal');
  if (bad.kind === 'refusal') assert.match(bad.message, /weight/);
  const ok = await producePhraseNote(deps(py), note({ ...MIX, weight: 0.8 }), 'phrase_002');
  assert.equal(ok.kind, 'score');
});

test('REAL ENGINE: the extend phrase is unchanged by the mix glue (the same 8 bars and tempo marks as in M5)', async () => {
  const py = await engine();
  const out = await producePhrase(deps(py), { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }, 'phrase_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const xml = out.payload.multi_staff_content as string;
  for (const part of xml.split(/<part /).slice(1)) {
    assert.equal((part.match(/<measure /g) ?? []).length, 8);
    assert.deepEqual([...part.matchAll(/<sound tempo="([^"]+)"/g)].map((m) => Number(m[1])), [100, 97, 94, 91, 89, 86, 83, 80]);
  }
});

test('REAL ENGINE: ghost notes ARE in what the engine returns — bar_005 + bar_006 at weight 0.40: 4 more notes with Ghost on, in both engraved views, and the [forge-mix] engine line says so (2026-10-23-0130)', async () => {
  const py = await engine();
  const line = async (ghost: boolean) => {
    const params: MixPhrase = { ...MIX, weight: 0.4, ghost };
    return mixTraceEngine(params, computePhrase(py, { a: dataOf('bar_005'), b: dataOf('bar_006') }, params, 'phrase_002'));
  };
  assert.equal(await line(false), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=false -> notes: multi-staff 5, kit 5');
  assert.equal(await line(true), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=true -> notes: multi-staff 9, kit 9');
});

// ---- M8 (drain 2026-10-23-0230): navigation through a mix, on the REAL engine ----------------------------------------------------------------------------------------------------------------

import { annotateMixPayload, mixHitsFromEngine, MIX_BAR_ID, type MixParams } from './mix-lineage-core.ts';
import type { RhythmDataLike } from './provenance-core.ts';

const asLike = (d: unknown) => d as RhythmDataLike;
const richA = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 20, tempo_bpm: 96, channels: {
  kick: [true, false, 100, false, false, false, 64, false, true, false, false, 127, false, false, false, false],
  snare: [false, false, false, false, 110, false, false, 36, false, false, false, false, true, false, 80, false],
  hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false] } };
const richB = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 40, tempo_bpm: 120, channels: {
  kick: [true, false, false, 70, false, false, 64, false, false, false, 90, false, false, false, false, false],
  snare: [false, false, false, false, 100, false, false, false, false, true, false, false, true, false, false, false],
  bell: [false, false, false, false, false, false, false, true, false, false, false, false, false, false, false, true] } };

test('REAL ENGINE: the payload of a mix carries the engine\'s own mixed bar (so the hit ids are verified against what the engine returned, not against a copy of the rule)', async () => {
  const py = await engine();
  const params: MixParams = { a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost: true };
  const payload = computePhrase(py, { a: dataOf('bar_005'), b: dataOf('bar_006') }, { kind: 'mix', ...params }, 'phrase_002');
  assert.deepEqual(payload.mixed_bar.channels.kick, [true, false, 36, 36, false, false, 36, false, true, false, false, false, false, false, false, false]);
  const extend = computePhrase(py, dataOf('bar_005'), { kind: 'extend', source: 'bar_005', bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 }, 'phrase_001');
  assert.equal('mixed_bar' in extend, false, 'an extend payload is untouched');
});

test('REAL ENGINE: annotateMixPayload ties the real engraved ids to the real mixed bar — bar id, one id per hit in both views — and the provenance says where each hit came from', async () => {
  const py = await engine();
  const a = dataOf('bar_005'), b = dataOf('bar_006');
  for (const ghost of [false, true]) {
    const params: MixParams = { a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost };
    const raw = computePhrase(py, { a, b }, { kind: 'mix', ...params }, 'phrase_002');
    const r = annotateMixPayload('phrases/phrase_002', params, { ...raw, forge_mix: { a, b } });
    assert.deepEqual(r.problems, [], `ghost ${ghost}`);
    assert.deepEqual(r.kitProblems, [], `ghost ${ghost}: the Kit view is tied too`);
    const hitIds = Object.keys(r.map).filter((id) => id !== MIX_BAR_ID);
    assert.equal(hitIds.length, ghost ? 8 : 4);
    for (const key of ['multi_staff_content', 'kit_content'] as const) {
      const xml = r.payload[key] as string;
      assert.match(xml, /<measure [^>]*id="ph_bar_1"/, `${key}: the bar`);
      for (const id of hitIds.filter((h) => !h.includes('_t'))) assert.ok(xml.includes(`id="${id}"`), `${key}: ${id}`);
    }
    assert.equal(r.map.mx_kick_0.params.kind, 'both');
    if (ghost) { assert.equal(r.map.mx_kick_2.params.kind, 'ghost-a'); assert.equal(r.map.mx_kick_2.params.velocity, 36); }
    else assert.equal(r.map.mx_kick_2, undefined);
  }
});

test('REAL ENGINE, drift guard: over weights 0..1 (step 0.05), four thresholds, ghost on and off, on bar_005/bar_006 AND on a richer pair (int velocities, three channels each, swing, tempo), the TS copy of the rule agrees with the engine on every hit — position, ghost-ness and the velocity the engine wrote', async () => {
  const py = await engine();
  const pairs: Array<[string, unknown, unknown]> = [['bar_005/bar_006', dataOf('bar_005'), dataOf('bar_006')], ['rich pair', richA, richB], ['bar with itself', dataOf('bar_005'), dataOf('bar_005')]];
  let checked = 0;
  for (const [name, a, b] of pairs) {
    for (let k = 0; k <= 20; k++) {
      const weight = k / 20;
      for (const threshold of [0.25, 0.5, 0.75, 1]) {
        for (const ghost of [false, true]) {
          const params: MixParams = { a: 'x', b: 'y', weight, threshold, ghost };
          const mixed = engineMix(py, a, b, weight, threshold, ghost);
          const r = mixHitsFromEngine(asLike(a), asLike(b), params, asLike(mixed));
          assert.equal(r.ok, true, `${name} weight ${weight} threshold ${threshold} ghost ${ghost}: ${r.ok ? '' : r.problems.join('; ')}`);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 3 * 21 * 4 * 2);
});

test('REAL ENGINE: through the plugin\'s own path (producePhraseNote) the payload reaches the Score with the parents attached, and a mismatch is still the engine\'s refusal line', async () => {
  const py = await engine();
  const note = (obj: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;
  const out = await producePhraseNote(deps(py), note({ ...MIX, weight: 0.4, ghost: true }), 'phrase_002');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  assert.deepEqual(Object.keys(out.payload.forge_mix as object).sort(), ['a', 'b']);
  assert.ok(out.payload.mixed_bar);
});
