// score_first M9 (drain 2026-10-23-0330) — fork on edit through the REAL engine (the Python the plugin runs): the other bars are untouched, a fork's own tempo is its bar's tempo, "Revert to generated" gives the
// original Score back byte for byte, and the bar data "Edit this bar" writes is exactly the generated bar. bar_005 is the real playground bar. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { producePhrase, type ExtendPhrase, type PhraseParams } from './phrase-core.ts';
import { forkNoteContent } from './phrase-fork-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const BAR_005 = fs.readFileSync(path.resolve(import.meta.dirname, '../test/fixtures/score-first/bar_005.md'), 'utf8');
const SEED = (readRhythmNote(BAR_005) as { value: { data: RhythmData } }).value.data;
const BASE: ExtendPhrase = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const ids = (xml: string) => xml.replace(/[PI][0-9a-f]{32}/g, 'ID');       // music21 gives parts and instruments random ids on every run

/** bar_009: bar 3 of the generated phrase with one more kick, a snare moved, and its OWN tempo. */
function forkOf(generated: RhythmData, tempo: number): RhythmData {
  const d = JSON.parse(JSON.stringify(generated)) as RhythmData;
  (d.channels.kick as unknown[])[5] = true;
  (d.channels.snare as unknown[])[4] = false;
  (d.channels.snare as unknown[])[5] = true;
  d.tempo_bpm = tempo;
  return d;
}

function directBars(py: any, params: ExtendPhrase): RhythmData[] {
  py.globals.set('_seed', JSON.stringify(SEED));
  return JSON.parse(py.runPython(`import json as _j\nfrom forge.music.lib import extend_rhythm as _e\n_j.dumps(_e(_j.loads(_seed), bars=${params.bars}, style="${params.style}", tempo_change_pct=${params.tempo_change_pct}))`));
}
function scoreOfBars(py: any, bars: RhythmData[]): any {
  py.globals.set('_bars', JSON.stringify(bars));
  const proxy = py.runPython('import json as _j\nfrom forge.music.lib import rhythm_bars_to_stream as _rbs\nserialize_result(_rbs(_j.loads(_bars)), {"snippet_id": "phrase_001", "meta": {"title": "phrase_001"}})');
  const out = proxy.toJs({ dict_converter: Object.fromEntries }); proxy.destroy?.();
  return out;
}
const deps = (py: any, notes: Record<string, string>) => ({
  readNote: async (p: string) => { const t = notes[p]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});
const produce = async (py: any, params: ExtendPhrase, notes: Record<string, string>) => {
  const out = await producePhrase(deps(py, { 'bars/bar_005.md': BAR_005, ...notes }), params, 'phrase_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  return (out.kind === 'score' ? out.payload : {}) as Record<string, any>;
};

test('REAL ENGINE: a phrase without overrides is the generated Score exactly (the engine call is what it was) and carries the generated bars as bars_data', async () => {
  const py = await engine();
  const generated = directBars(py, BASE);
  const payload = await produce(py, BASE, {});
  assert.equal(ids(payload.multi_staff_content), ids(scoreOfBars(py, generated).multi_staff_content));
  assert.deepEqual(payload.bars_data, generated, 'the computed bars, which is what "Edit this bar" writes into the fork note');
  assert.equal(payload.bars_data.length, 8);
});

test('REAL ENGINE: a fork replaces exactly bar 3: the engraved Score equals the generated bars with bar 3 swapped, and every other bar\'s data is untouched', async () => {
  const py = await engine();
  const generated = directBars(py, BASE);
  const fork = forkOf(generated[2], 140);
  const forked = await produce(py, { ...BASE, overrides: { '3': 'bars/bar_009' } }, { 'bars/bar_009.md': forkNoteContent('bar_009', 'phrases/phrase_001', 3, fork) });
  const swapped = generated.map((b, i) => (i === 2 ? fork : b));
  assert.equal(ids(forked.multi_staff_content), ids(scoreOfBars(py, swapped).multi_staff_content));
  forked.bars_data.forEach((b: RhythmData, i: number) => { if (i !== 2) assert.deepEqual(b, generated[i], `bar ${i + 1} is untouched`); });
  assert.deepEqual(forked.bars_data[2], fork);
  const plain = await produce(py, BASE, {});
  assert.notEqual(ids(forked.multi_staff_content), ids(plain.multi_staff_content), 'the forked Score differs');
});

test('REAL ENGINE: the forked bar plays at the fork\'s OWN tempo (the other bars keep their stepped tempi)', async () => {
  const py = await engine();
  const generated = directBars(py, BASE);
  const forked = await produce(py, { ...BASE, overrides: { '3': 'bars/bar_009' } }, { 'bars/bar_009.md': forkNoteContent('bar_009', 'phrases/phrase_001', 3, forkOf(generated[2], 140)) });
  const firstPart = (forked.multi_staff_content as string).split(/<part /)[1];
  const tempi = [...firstPart.matchAll(/<sound tempo="([^"]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(tempi, [100, 97, 140, 91, 89, 86, 83, 80]);
});

test('REAL ENGINE: Revert to generated gives the ORIGINAL Score back byte for byte (and two forks work together)', async () => {
  const py = await engine();
  const generated = directBars(py, BASE);
  const original = await produce(py, BASE, {});
  const fork3 = forkNoteContent('bar_009', 'phrases/phrase_001', 3, forkOf(generated[2], 140));
  const fork6 = forkNoteContent('bar_010', 'phrases/phrase_001', 6, forkOf(generated[5], 90));
  const two = await produce(py, { ...BASE, overrides: { '3': 'bars/bar_009', '6': 'bars/bar_010' } }, { 'bars/bar_009.md': fork3, 'bars/bar_010.md': fork6 });
  assert.deepEqual([...(two.multi_staff_content as string).split(/<part /)[1].matchAll(/<sound tempo="([^"]+)"/g)].map((m) => Number(m[1])), [100, 97, 140, 91, 89, 90, 83, 80]);
  const reverted = await produce(py, BASE, { 'bars/bar_009.md': fork3, 'bars/bar_010.md': fork6 });     // the fork notes still exist; the phrase just no longer names them
  assert.equal(ids(reverted.multi_staff_content), ids(original.multi_staff_content));
  assert.equal(ids(reverted.kit_content), ids(original.kit_content));
  assert.deepEqual(reverted.bars_data, original.bars_data);
});

test('REAL ENGINE: a fork on a different grid is refused naming the bar and the fields, before the engine is asked', async () => {
  const py = await engine();
  const threeFour = JSON.stringify({ time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: Array(12).fill(false) } });
  const out = await producePhrase(deps(py, { 'bars/bar_005.md': BAR_005, 'bars/bar_009.md': `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${threeFour}\n\`\`\`\n` }), { ...BASE, overrides: { '3': 'bars/bar_009' } }, 'phrase_001');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.match(out.message, /^Phrase: bar 3 \(bars\/bar_009\) differs from the source bar_005 in time_signature and steps/);
});
