// 2026-11-16-1000 - Keep / Delete / Copy / Move bars on the REAL engine (Pyodide with the vendored music wheels, test-support/real-rhythm-engine.ts), the way phrase-chain-engine.test.ts does it for the other kinds: the Score the plugin draws for
// a transform with a structure step (producePhrase: the steps run in TypeScript, the engine gets the bars that are left and only the density ops) is compared, bar for bar, with (a) the source's bars put through applyStructure and
// (b) the Python the note itself carries, run on the engine. NON-VACUITY: the engine is never handed a structure step (a spy), and a wrong expectation fails. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhrase, type PhraseParams, type StructureOp } from './phrase-core.ts';
import { applyStructureOps } from './bar-structure-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BAR_NAMES = ['bar_005', 'bar_006', 'bar_007', 'bar_008'];
const SOURCE: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 6, style: 'building', tempo_change_pct: 0 };
const transform = (ops: unknown[], over: object = {}): PhraseParams => ({ kind: 'transform', source: 'phrases/phrase_001', ops, ...over }) as PhraseParams;

type Notes = Record<string, string>;
function vault(phrases: Record<string, PhraseParams>): Notes {
  const files: Notes = {};
  for (const n of BAR_NAMES) files[`bars/${n}.md`] = fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
  for (const [name, p] of Object.entries(phrases)) files[`phrases/${name}.md`] = noteContentFor(name, p);
  return files;
}
const pythonOf = (note: string): string => { const m = /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note); if (!m) throw new Error('no # Python fence'); return m[1]; };
function deps(py: any, files: Notes, seen: unknown[][] = []) {
  return {
    readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: PhraseParams, title: string) => { seen.push(((params as { ops?: unknown[] }).ops ?? []).slice()); return computePhrase(py, data, params, title); },
  };
}
async function drawn(py: any, files: Notes, params: PhraseParams, seen: unknown[][] = []): Promise<unknown[]> {
  const out = await producePhrase(deps(py, files, seen), params, 'phrase_002');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') throw new Error('unreachable');
  return barsOfPayload(out.payload) as unknown[];
}
async function refusal(py: any, files: Notes, params: PhraseParams): Promise<string> {
  const out = await producePhrase(deps(py, files), params, 'phrase_002');
  assert.equal(out.kind, 'refusal');
  return (out as { message: string }).message;
}
/** The # Python of phrases/phrase_002 run on the engine, with the source phrase bound by name (a bar is its json, a phrase is its own compute). */
async function ran(py: any, files: Notes): Promise<unknown[]> {
  const bars: Record<string, unknown> = {};
  for (const n of BAR_NAMES) bars[n] = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(files[`bars/${n}.md`])![1]);
  const srcs: Record<string, string> = {};
  for (const [p, t] of Object.entries(files)) if (p.startsWith('phrases/')) srcs[p.replace(/^phrases\//, '').replace(/\.md$/, '')] = pythonOf(t);
  py.globals.set('_bars_json', JSON.stringify(bars)); py.globals.set('_srcs_json', JSON.stringify(srcs)); py.globals.set('_target', 'phrase_002');
  return JSON.parse(py.runPython([
    'import json as _j', 'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars")}',
    '_bars = _j.loads(_bars_json); _srcs = _j.loads(_srcs_json); _fns = {}',
    'for _n, _d in _bars.items():', '    _fns[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'def _phrase(name):', '    def call():', '        g = dict(_eng); g.update(_fns)', '        exec(_srcs[name], g)', '        return g["compute"](None)', '    return call',
    'for _n in _srcs: _fns[_n] = _phrase(_n)', '_j.dumps(_fns[_target]())',
  ].join('\n')));
}
const keep = (...runs: Array<[number, number]>): StructureOp => ({ op: 'keep', runs });

test('every step, on the real engine: the Score drawn for the transform is the source\'s bars put through the step, bar for bar, and it is what the note\'s own Python returns', async () => {
  const py = await engine();
  const steps: StructureOp[] = [keep([2, 4]), keep([1, 1], [3, 3], [6, 6]), { op: 'delete', runs: [[2, 3]] }, { op: 'delete', runs: [[1, 1], [4, 5]] }, { op: 'copy', runs: [[2, 3]] }, { op: 'copy', runs: [[1, 1], [6, 6]] },
    { op: 'move', runs: [[3, 4]], by: -1 }, { op: 'move', runs: [[1, 2], [4, 4]], by: 1 }, { op: 'move', runs: [[2, 2], [4, 4]], by: -1 }];
  const source = await drawn(py, vault({ phrase_001: SOURCE }), SOURCE);
  assert.equal(source.length, 6);
  for (const step of steps) {
    const t = transform([step]);
    const files = vault({ phrase_001: SOURCE, phrase_002: t });
    const want = applyStructureOps(source, [step]);
    assert.ok(want.ok);
    const seen: unknown[][] = [];
    const bars = await drawn(py, files, t, seen);
    assert.deepEqual(bars, want.ok ? want.items : [], JSON.stringify(step));
    assert.deepEqual(await ran(py, files), want.ok ? want.items : [], `the note's Python: ${JSON.stringify(step)}`);
    assert.deepEqual(seen.at(-1), [], `the engine was told no structure step (it got ${JSON.stringify(seen)})`);        // the last call is the transform's (the one before it is the source phrase's own)
  }
});

test('steps then density: numbers after a Delete are those of the bars that are left; the engine gets only the density ops; the note\'s Python agrees', async () => {
  const py = await engine();
  const ops = [{ op: 'delete', runs: [[1, 2]] }, { op: 'copy', runs: [[1, 1]] }, { op: 'thin_out', first: 1, last: 2, amount: 1 }];
  const t = transform(ops);
  const files = vault({ phrase_001: SOURCE, phrase_002: t });
  const seen: unknown[][] = [];
  const bars = await drawn(py, files, t, seen);
  assert.equal(bars.length, 5);                                           // 6 - 2 + 1
  assert.deepEqual(seen.at(-1), [{ op: 'thin_out', first: 1, last: 2, amount: 1 }]);
  assert.deepEqual(await ran(py, files), bars);
  const source = await drawn(py, vault({ phrase_001: SOURCE }), SOURCE);
  assert.deepEqual(bars.slice(2), source.slice(3), 'the bars after the thinned two are the source bars 4..6, untouched');
  assert.notDeepEqual(bars[0], source[2], 'the first bar was thinned (it is source bar 3 with every hit taken out)');
});

test('REFUSED on the Score, in one sentence: a step past the last bar, a Delete of everything, a Move off the end, a density op past the bars that are left', async () => {
  const py = await engine();
  const files = vault({ phrase_001: SOURCE });
  assert.match(await refusal(py, files, transform([keep([5, 9])])), /^Phrase: the source phrase phrase_001 has 6 bars; ops\[0\]: bars 5 to 9 asked for, but there are 6 bars\.$/);
  assert.match(await refusal(py, files, transform([{ op: 'delete', runs: [[1, 6]] }])), /would leave no bars/);
  assert.match(await refusal(py, files, transform([{ op: 'move', runs: [[1, 1]], by: -1 }])), /bar 1 cannot move left/);
  assert.match(await refusal(py, files, transform([{ op: 'move', runs: [[5, 6]], by: 1 }])), /cannot move right/);
  assert.match(await refusal(py, files, transform([{ op: 'delete', runs: [[1, 4]] }, { op: 'thin_out', first: 1, last: 3, amount: 0.5 }])), /ops\[1\] asks for bars 1 to 3, but the source phrase phrase_001 has 2 bars after the changes of which bars there are\./);
});

test('a fork lies over the bars that are LEFT (its number is a bar of the result), and a transform of a transform with a structure step in the middle draws', async () => {
  const py = await engine();
  const t1 = transform([{ op: 'delete', runs: [[1, 1]] }]);                                 // phrase_002: 5 bars
  const t2: PhraseParams = { kind: 'transform', source: 'phrases/phrase_002', ops: [keep([2, 3]), { op: 'copy', runs: [[1, 1]] }], overrides: { '2': 'bars/bar_007' } } as PhraseParams;
  const files = vault({ phrase_002: t1, phrase_001: SOURCE, phrase_003: t2 });
  const out = await producePhrase(deps(py, files), t2, 'phrase_003');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  const bars = barsOfPayload((out as { payload: unknown }).payload as never) as unknown[];
  assert.equal(bars.length, 3);
});

// 2026-11-24-1036: a COPY PUT IN A PLACE (`Copy bar 6 and put it at the end.`), on the real engine: a 12-bar Extend followed by the step is drawn through the real phrase path (the head by the engine, the step in TypeScript, the engine never told the step), the Score has 13 bars with the copy LAST
// and the original still at bar 6, and the Python the note itself carries returns the same bars.
test('a copy put in a place on the real engine: 12 bars + `Copy bar 6 and put it at the end.` = 13 bars, the copy last; every gap agrees with applyStructureOps and with the note\'s own Python', async () => {
  const py = await engine();
  const twelve: PhraseParams = { ...SOURCE, bars: 12 } as PhraseParams;
  const source = await drawn(py, vault({ phrase_001: twelve }), twelve);
  assert.equal(source.length, 12);
  const steps: StructureOp[] = [{ op: 'copy', runs: [[6, 6]], after: 'end' }, { op: 'copy', runs: [[6, 6]], after: 0 }, { op: 'copy', runs: [[3, 5]], after: 1 }, { op: 'copy', runs: [[2, 2], [9, 9]], after: 8 }, { op: 'copy', runs: [[3, 4]] }];
  for (const step of steps) {
    const p = { ...twelve, ops: [step] } as unknown as PhraseParams;
    const files = vault({ phrase_002: p });
    const want = applyStructureOps(source, [step as never]);
    assert.ok(want.ok);
    const seen: unknown[][] = [];
    const bars = await drawn(py, files, p, seen);
    assert.deepEqual(bars, want.ok ? want.items : [], JSON.stringify(step));
    assert.deepEqual(await ran(py, files), want.ok ? want.items : [], `the note's Python: ${JSON.stringify(step)}`);
    assert.deepEqual(seen.at(-1), [], `the engine was told no structure step (it got ${JSON.stringify(seen)})`);
  }
  const last = await drawn(py, vault({ phrase_002: { ...twelve, ops: [steps[0]] } as unknown as PhraseParams }), { ...twelve, ops: [steps[0]] } as unknown as PhraseParams);
  assert.equal(last.length, 13); assert.deepEqual(last[12], source[5], 'the copy is last'); assert.deepEqual(last[5], source[5], 'the original stays at bar 6'); assert.deepEqual(last.slice(0, 12), source);
  assert.match(await refusal(py, vault({ phrase_002: { ...twelve, ops: [{ op: 'copy', runs: [[2, 2]], after: 15 }] } as unknown as PhraseParams }), { ...twelve, ops: [{ op: 'copy', runs: [[2, 2]], after: 15 }] } as unknown as PhraseParams), /after bar 15 asked for, but there are 12 bars\./);
});
