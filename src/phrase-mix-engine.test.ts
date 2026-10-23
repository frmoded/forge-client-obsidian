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
import { producePhrase, producePhraseNote, type MixPhrase, type PhraseParams } from './phrase-core.ts';
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

test('the fixtures are the playground vault\'s own bars (when it is checked out)', async () => {
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
