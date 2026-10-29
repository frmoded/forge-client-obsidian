// 2026-10-27-1020: the # Python block of a phrase note RUNS, on the REAL engine (Pyodide with the vendored music wheels, as phrase-mix-engine.test.ts does), and gives what the plugin's own Score path computes. The block is exec'd with the
// note names bound to the fixture bars (the way a Forge note reads a data note: by calling it); since 2026-10-29-0810 `compute` RETURNS THE BARS, so `rhythm_bars_to_stream` is deliberately NOT bound at all (a block that still called it would
// be a NameError here), and what the block returns is compared bar for bar with a direct engine call of the same arguments. Skipped (visibly) without the music wheels. Pins the MECHANISM (the block calls the engine functions with the json's arguments); if the Python facet's design moves this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { pathStopOf, type PhraseParams } from './phrase-core.ts';
import { phrasePython } from './phrase-notes-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const dataOf = (name: string): unknown => { const r = readRhythmNote(fs.readFileSync(path.join(FIXTURES, `${name}.md`), 'utf8')); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const BARS = Object.fromEntries(['bar_005', 'bar_006', 'bar_007', 'bar_008'].map((n) => [n, dataOf(n)]));

/** What the note's Python returns (the bar list), as JSON. */
async function runNote(p: PhraseParams): Promise<unknown> {
  const py = await engine();
  py.globals.set('_bars_json', JSON.stringify(BARS));
  py.globals.set('_src', phrasePython(p));
  return JSON.parse(py.runPython([
    'import json as _j',
    'from forge.music import lib as _lib',
    '_g = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info")}',
    'for _n, _d in _j.loads(_bars_json).items():',
    '    _g[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'exec(_src, _g)',
    '_j.dumps(_g["compute"](None))',
  ].join('\n')));
}

/** A direct engine call: `expr` is Python over `a`, `b` (the fixture bars) and the engine functions; the result as JSON. */
async function direct(expr: string): Promise<unknown> {
  const py = await engine();
  py.globals.set('_bars_json', JSON.stringify(BARS));
  py.globals.set('_expr', expr);
  return JSON.parse(py.runPython([
    'import json as _j',
    'from forge.music.lib import extend_rhythm, mix_rhythm, morph_rhythm, morph_rhythm_info',
    '_b = _j.loads(_bars_json)',
    'a, b, c = _b["bar_005"], _b["bar_006"], _b["bar_007"]',
    '_j.dumps(eval(_expr))',
  ].join('\n')));
}

test('an extend note\'s Python gives the engine\'s extend_rhythm bars, and a fork replaces exactly its bar', async () => {
  const p: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 6, style: 'building', tempo_change_pct: -20 };
  assert.deepEqual(await runNote(p), await direct('extend_rhythm(a, bars=6, style="building", tempo_change_pct=-20)'));
  const forked = { ...p, overrides: { '3': 'bars/bar_007' } } as never as PhraseParams;
  const plain = (await direct('extend_rhythm(a, bars=6, style="building", tempo_change_pct=-20)')) as unknown[];
  const got = (await runNote(forked)) as unknown[];
  assert.equal(got.length, 6);
  assert.deepEqual(got[2], BARS.bar_007, 'bar 3 is the fork note');
  assert.deepEqual(got.filter((_, i) => i !== 2), plain.filter((_, i) => i !== 2), 'every other bar is the engine\'s');
});

test('a morph note\'s Python gives the engine\'s morph_rhythm bars (bars >= 2) or the one bar at its position (bars = 1)', async () => {
  const m: PhraseParams = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'seeded', seed: 4 };
  assert.deepEqual(await runNote(m), await direct('morph_rhythm(a, b, bars=5, order="seeded", seed=4)'));
  const one: PhraseParams = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 1, order: 'musical', seed: 0, position: 2 };
  assert.deepEqual(await runNote(one), await direct('[morph_rhythm(a, b, bars=1, order="musical", seed=0, position=2)]'));
});

test('a vote mix note\'s Python gives the engine\'s mix_rhythm bar', async () => {
  const v: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.4, ghost: true };
  assert.deepEqual(await runNote(v), await direct('[mix_rhythm(a, b, weight=0.7, threshold=0.4, ghost=True)]'));
});

test('a PATH mix note\'s Python lands on the same stop as the plugin\'s own rule (pathStopOf), at every weight of a sweep, in each order', async () => {
  const d = ((await direct('morph_rhythm_info(a, b)')) as { d: number }).d;
  assert.ok(d > 1, 'the fixture pair has several single-hit changes');
  for (const order of ['musical', 'seeded', 'by_channel'] as const) {
    for (let i = 0; i <= 20; i++) {
      const weight = i / 20;
      const p: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight, threshold: 0.5, ghost: false, mode: 'path', order, seed: 3 };
      const stop = pathStopOf(weight, d);
      assert.deepEqual(await runNote(p), await direct(`[morph_rhythm(a, b, bars=1, order="${order}", seed=3, position=${stop})]`), `${order} weight ${weight} (stop ${stop} of ${d})`);
    }
  }
  const at1 = (await runNote({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 })) as unknown[];
  assert.deepEqual(at1[0], BARS.bar_005, 'weight 1 is all of bar a');
  const at0 = (await runNote({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 })) as unknown[];
  assert.deepEqual(at0[0], BARS.bar_006, 'weight 0 is all of bar b');
});
