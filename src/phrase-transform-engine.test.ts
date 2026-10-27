// 2026-10-27-1030 (M14 slice 1): the Score of a TRANSFORM phrase through the REAL engine (the Python the plugin runs, test-support/real-rhythm-engine.ts; the vendored music wheels and the engine bundle of assets/engine, which carries
// thin_out_bars and double_up_bars). The source phrase is a note in a stand-in vault; the transform reads it FRESH, draws it by the same code that draws every phrase, and the ops change the regions asked for. Nothing is faked
// but the vault. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhrase, regionRefusal, type PhraseParams, type TransformOp } from './phrase-core.ts';
import { phrasePython } from './phrase-notes-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string) => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const dataOf = (n: string): any => { const r = readRhythmNote(barText(n)); if (r.ok === false) throw new Error(r.message); return r.value.data; };

const MORPH: PhraseParams = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
const MIX: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false };
const transform = (source: string, ops: TransformOp[], over: object = {}): PhraseParams => ({ kind: 'transform', source: `phrases/${source}`, ops, ...over }) as PhraseParams;

/** A stand-in vault: the four fixture bars and the phrases given. */
function vault(phrases: Record<string, PhraseParams | string>) {
  const files: Record<string, string> = {};
  for (const n of ['bar_005', 'bar_006', 'bar_007', 'bar_008']) files[`bars/${n}.md`] = barText(n);
  for (const [name, p] of Object.entries(phrases)) files[`phrases/${name}.md`] = typeof p === 'string' ? p : noteContentFor(name, p);
  return files;
}
const deps = (py: any, files: Record<string, string>) => ({
  readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});
const cells = (bar: any, row: string) => (bar.channels[row] as Array<boolean | number>).flatMap((v, i) => (v === false || v === 0 ? [] : [i]));
/** A direct engine call over the fixture bars: `expr` is Python over a, b and the engine functions; the answer as JSON. */
async function direct(py: any, expr: string): Promise<any> {
  py.globals.set('_bars_json', JSON.stringify({ a: dataOf('bar_005'), b: dataOf('bar_006') }));
  py.globals.set('_expr', expr);
  return JSON.parse(py.runPython(['import json as _j', 'from forge.music.lib import extend_rhythm, mix_rhythm, morph_rhythm, thin_out_bars, double_up_bars', '_b = _j.loads(_bars_json)', 'a, b = _b["a"], _b["b"]', '_j.dumps(eval(_expr))'].join('\n')));
}

test('a transform of a morph: the region bars are thinned in the asked row only, every other bar and row is the morph\'s own, and it equals a direct engine call', async () => {
  const py = await engine();
  const files = vault({ phrase_006: MORPH });
  const out = await producePhrase(deps(py, files), transform('phrase_006', [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }]), 'phrase_007');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') return;
  const bars = barsOfPayload(out.payload)!;
  assert.equal(bars.length, 5);
  const morph = await direct(py, 'morph_rhythm(a, b, bars=5, order="musical", seed=0)');
  assert.deepEqual(bars, await direct(py, 'thin_out_bars(morph_rhythm(a, b, bars=5, order="musical", seed=0), 2, 3, row="kick", amount=0.5)'));
  for (const i of [0, 3, 4]) assert.deepEqual(bars[i], morph[i], `bar ${i + 1} is outside the region`);
  for (const i of [1, 2]) {
    assert.ok(cells(bars[i], 'kick').length < cells(morph[i], 'kick').length || cells(morph[i], 'kick').length <= 1, `bar ${i + 1} kick is thinner`);
    assert.deepEqual(bars[i].channels.snare, morph[i].channels.snare, `bar ${i + 1} snare is untouched`);
  }
  assert.equal(typeof out.payload.content === 'string' || typeof out.payload.multi_staff_content === 'string', true, 'a Score payload');
});

test('a transform of an extend, of a mix (one bar) and of another transform (a chain) - the source is drawn by the code that draws every phrase', async () => {
  const py = await engine();
  const files = vault({ phrase_001: EXTEND, phrase_002: MIX, phrase_003: transform('phrase_001', [{ op: 'double_up', first: 1, last: 2, row: 'snare', grid: 16 }]) });
  const ext = await producePhrase(deps(py, files), transform('phrase_001', [{ op: 'thin_out', first: 1, last: 4, amount: 1 }]), 't');
  assert.ok(ext.kind === 'score', JSON.stringify(ext).slice(0, 300));
  if (ext.kind === 'score') for (const bar of barsOfPayload(ext.payload)!) for (const row of Object.keys(bar.channels)) assert.deepEqual(cells(bar, row), [], 'amount 1 removes every hit');
  const mix = await producePhrase(deps(py, files), transform('phrase_002', [{ op: 'double_up', first: 1, last: 1, grid: 16 }]), 't');
  assert.ok(mix.kind === 'score', JSON.stringify(mix).slice(0, 300));
  if (mix.kind === 'score') assert.deepEqual(barsOfPayload(mix.payload), await direct(py, 'double_up_bars([mix_rhythm(a, b, weight=0.7, threshold=0.5, ghost=False)], 1, 1)'));
  const chain = await producePhrase(deps(py, files), transform('phrase_003', [{ op: 'thin_out', first: 3, last: 4, amount: 1 }]), 't');
  assert.ok(chain.kind === 'score', JSON.stringify(chain).slice(0, 300));
  if (chain.kind === 'score') {
    const got = barsOfPayload(chain.payload)!;
    const expected = await direct(py, 'thin_out_bars(double_up_bars(extend_rhythm(a, bars=4, style="repeat_with_fills", tempo_change_pct=0), 1, 2, row="snare"), 3, 4, amount=1)');
    assert.deepEqual(got, expected);
  }
});

test('every refusal is a line naming the thing: a source that is not there, not a phrase, not drawable; an op past the end; a row a bar lacks; a loop', async () => {
  const py = await engine();
  const say = async (files: Record<string, string>, p: PhraseParams) => { const o = await producePhrase(deps(py, files), p, 't'); assert.notEqual(o.kind, 'score', JSON.stringify(p)); return (o as { message: string }).message; };
  const thin = (over: object = {}): TransformOp[] => [{ op: 'thin_out', first: 1, last: 1, amount: 0.5, ...over } as TransformOp];
  assert.match(await say(vault({}), transform('phrase_009', thin())), /^Phrase: the source phrase phrase_009 \(phrases\/phrase_009\.md\) was not found or could not be read \(File not found\)\.$/);
  assert.match(await say(vault({ phrase_006: 'not a note at all' }), transform('phrase_006', thin())), /^Phrase: the source phrase phrase_006 is not usable: /);
  assert.match(await say(vault({ phrase_006: { ...MORPH, a: 'bar_404' } as PhraseParams }), transform('phrase_006', thin())), /^Phrase: the source phrase phrase_006 could not be drawn: Phrase: the bar for a, bar_404/);
  assert.equal(await say(vault({ phrase_006: MORPH }), transform('phrase_006', thin({ first: 3, last: 9 }))), 'Phrase: ops[0] asks for bars 3 to 9, but the source phrase phrase_006 has 5 bars.');
  assert.equal(await say(vault({ phrase_006: MIX }), transform('phrase_006', thin({ first: 2, last: 2 }))), 'Phrase: ops[0] asks for bar 2, but the source phrase phrase_006 has 1 bar.');
  assert.match(await say(vault({ phrase_006: MORPH }), transform('phrase_006', thin({ row: 'cowbell' }))), /^Phrase: thin_out_bars: row 'cowbell' is not a channel of bar 1/);
  assert.match(await say(vault({ phrase_006: EXTEND }), transform('phrase_006', [{ op: 'double_up', first: 1, last: 1, grid: 8 }])), /^Phrase: double_up_bars: bar 1 has 16 steps, but grid is 8$/);
  const loop = vault({ phrase_006: transform('phrase_007', thin()), phrase_007: transform('phrase_006', thin()) });
  assert.match(await say(loop, transform('phrase_006', thin())), /loops back or is more than 6 deep/);
  assert.equal(regionRefusal('Traceback...\nValueError: thin_out_bars: amount must be a number from 0 to 1, got 2'), 'thin_out_bars: amount must be a number from 0 to 1, got 2');
  assert.equal(regionRefusal('KeyError: x'), null);
});

test('forks lie over the transformed bars (bar n of the result), are read fresh and must be on the bars\' grid', async () => {
  const py = await engine();
  const files = vault({ phrase_006: MORPH });
  const forked = transform('phrase_006', [{ op: 'thin_out', first: 1, last: 5, amount: 1 }], { overrides: { '4': 'bars/bar_007' } });
  const out = await producePhrase(deps(py, files), forked, 't');
  assert.ok(out.kind === 'score');
  if (out.kind === 'score') {
    const bars = barsOfPayload(out.payload)!;
    assert.deepEqual(bars[3], dataOf('bar_007'), 'bar 4 is the fork note');
    for (const i of [0, 1, 2, 4]) for (const row of Object.keys(bars[i].channels)) assert.deepEqual(cells(bars[i], row), []);
    assert.equal((out.payload as { transform_generated?: unknown[] }).transform_generated?.length, 5, 'the bars before the forks went in ride along');
  }
  const missing = await producePhrase(deps(py, files), transform('phrase_006', [{ op: 'thin_out', first: 1, last: 1, amount: 0.5 }], { overrides: { '2': 'bars/bar_099' } }), 't');
  assert.ok(missing.kind === 'refusal' && /bar 2 is forked to bars\/bar_099/.test(missing.message));
});

test('the # Python block of a transform, run on the real engine over a stand-in for its source, hands the Score the same bars the plugin draws', async () => {
  const py = await engine();
  const files = vault({ phrase_006: MORPH });
  const p = transform('phrase_006', [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }, { op: 'double_up', first: 4, last: 4, grid: 16 }]);
  const drawn = await producePhrase(deps(py, files), p, 't');
  assert.ok(drawn.kind === 'score');
  if (drawn.kind !== 'score') return;
  py.globals.set('_src', phrasePython(p));
  py.globals.set('_stand_in', JSON.stringify(await direct(py, 'morph_rhythm(a, b, bars=5, order="musical", seed=0)')));
  const ran = JSON.parse(py.runPython([
    'import json as _j', 'from forge.music import lib as _lib',
    '_g = {k: getattr(_lib, k) for k in ("thin_out_bars", "double_up_bars")}',
    '_g["phrase_006"] = lambda: _j.loads(_stand_in)',
    '_g["rhythm_bars_to_stream"] = lambda bars: bars',
    'exec(_src, _g)', '_j.dumps(_g["compute"](None))',
  ].join('\n')));
  assert.deepEqual(ran, barsOfPayload(drawn.payload));
});
