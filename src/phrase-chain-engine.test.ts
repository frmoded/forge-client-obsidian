// 2026-10-29-0810 - a phrase note's `# Python` RETURNS BARS, so a transform's Python can really call its source phrase. On the REAL engine (Pyodide with the vendored music wheels, test-support/real-rhythm-engine.ts), the Python TEXT of
// notes the plugin writes (newPhraseNote -> the # Python fence, not phrasePython called directly) is run with every other note bound by NAME the way a Forge note reads a note: a bar is its json, a phrase is its own compute() run in turn.
// What the run returns is compared bar for bar with the plugin's own drawing path (producePhrase, which never runs the Python: the Score is drawn from the json, P4). Kinds: extend (with a fork), morph, vote mix, path mix, and a TRANSFORM OF A
// TRANSFORM chain. `rhythm_bars_to_stream` is deliberately not bound anywhere. NON-VACUITY: the same chain written the 1020 way (compute returns the Score) is run by the same harness and FAILS - the original incident.
// Skipped (visibly) without the music wheels. Pins the MECHANISM (the blocks call each other by name and the engine functions with the json's arguments); if the Python facet's design moves this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhrase, type PhraseParams } from './phrase-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BAR_NAMES = ['bar_005', 'bar_006', 'bar_007', 'bar_008'];
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');

const transform = (source: string, ops: unknown[], over: object = {}): PhraseParams => ({ kind: 'transform', source: `phrases/${source}`, ops, ...over }) as PhraseParams;
const EXTEND_FORKED = { kind: 'extend', source: 'bar_005', bars: 5, style: 'building', tempo_change_pct: -10, overrides: { '2': 'bars/bar_007' } } as never as PhraseParams;
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'seeded', seed: 4 };
const VOTE: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.4, ghost: true };
const PATH: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.35, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 3 };

type Notes = Record<string, string>;
/** A stand-in vault: the fixture bars and the phrases given, each written by the plugin's own note builder. */
function vault(phrases: Record<string, PhraseParams>): Notes {
  const files: Notes = {};
  for (const n of BAR_NAMES) files[`bars/${n}.md`] = barText(n);
  for (const [name, p] of Object.entries(phrases)) files[`phrases/${name}.md`] = noteContentFor(name, p);
  return files;
}
/** The json of a bar note in the stand-in vault. */
const barJson = (files: Notes, name: string): unknown => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(files[`bars/${name}.md`])![1]);
/** The text of the # Python fence of a note. */
function pythonOf(note: string): string {
  const m = /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note);
  if (!m) throw new Error('no # Python fence in the note');
  return m[1];
}
const deps = (py: any, files: Notes) => ({
  readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});
/** The plugin's own drawing path: the bars of the Score producePhrase draws from the json. */
async function drawn(py: any, files: Notes, name: string, params: PhraseParams): Promise<unknown> {
  const out = await producePhrase(deps(py, files), params, name);
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') throw new Error('unreachable');
  return barsOfPayload(out.payload);
}

/** Run the Python of phrases/<target> with every other note bound by name. `stream`: what `rhythm_bars_to_stream` is bound to - nothing (the 0810 contract), or, for the non-vacuity run, a function that makes a Score-like value. */
async function ran(py: any, files: Notes, target: string, sources: Notes = files, stream: 'unbound' | 'score' = 'unbound'): Promise<unknown> {
  const bars: Record<string, unknown> = {};
  for (const n of BAR_NAMES) bars[n] = barJson(files, n);
  const srcs: Record<string, string> = {};
  for (const [p, t] of Object.entries(sources)) if (p.startsWith('phrases/')) srcs[p.replace(/^phrases\//, '').replace(/\.md$/, '')] = pythonOf(t);
  py.globals.set('_bars_json', JSON.stringify(bars));
  py.globals.set('_srcs_json', JSON.stringify(srcs));
  py.globals.set('_target', target);
  py.globals.set('_stream', stream);
  return JSON.parse(py.runPython([
    'import json as _j',
    'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars")}',
    'if _stream == "score": _eng["rhythm_bars_to_stream"] = lambda bars: {"score": bars}',
    '_bars = _j.loads(_bars_json); _srcs = _j.loads(_srcs_json); _fns = {}',
    'for _n, _d in _bars.items():',
    '    _fns[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'def _phrase(name):',
    '    def call():',
    '        g = dict(_eng); g.update(_fns)',
    '        exec(_srcs[name], g)',
    '        return g["compute"](None)',
    '    return call',
    'for _n in _srcs: _fns[_n] = _phrase(_n)',
    '_j.dumps(_fns[_target]())',
  ].join('\n')));
}

test('extend (with a fork), morph, vote mix and path mix: the Python written in the note returns the bars the plugin\'s own drawing path draws, bar for bar', async () => {
  const py = await engine();
  const phrases = { phrase_001: EXTEND_FORKED, phrase_002: MORPH, phrase_003: VOTE, phrase_004: PATH };
  const files = vault(phrases);
  for (const [name, p] of Object.entries(phrases)) assert.deepEqual(await ran(py, files, name), await drawn(py, files, name, p), name);
  assert.equal(((await ran(py, files, 'phrase_001')) as unknown[]).length, 5);
});

test('a TRANSFORM OF A TRANSFORM: each transform\'s Python calls its source phrase by name and gets bars; the chain equals the plugin\'s own drawing path, bar for bar, and each link changes only its region', async () => {
  const py = await engine();
  const t1 = transform('phrase_001', [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }]);
  const t2 = transform('phrase_002', [{ op: 'double_up', first: 1, last: 2, grid: 16 }, { op: 'thin_out', first: 4, last: 5, amount: 0.25, keep: 'seeded', seed: 3 }], { overrides: { '3': 'bars/bar_008' } });
  const phrases = { phrase_001: EXTEND_FORKED, phrase_002: t1, phrase_003: t2 };
  const files = vault(phrases);
  const source = (await ran(py, files, 'phrase_001')) as unknown[];
  const link1 = (await ran(py, files, 'phrase_002')) as unknown[];
  const link2 = (await ran(py, files, 'phrase_003')) as unknown[];
  assert.deepEqual(link1, await drawn(py, files, 'phrase_002', t1), 'the first transform');
  assert.deepEqual(link2, await drawn(py, files, 'phrase_003', t2), 'the transform of the transform');
  assert.equal(link2.length, source.length, 'the chain keeps the length');
  for (const i of [0, 3, 4]) assert.deepEqual(link1[i], source[i], `link 1 leaves bar ${i + 1} (outside bars 2 to 3) as its source has it`);
  assert.notDeepEqual(link1[1], source[1], 'link 1 changed bar 2 (a real region, not a no-op)');
  assert.deepEqual(link2[2], barJson(files, 'bar_008'), 'the fork of link 2 is the bar note');
});

test('NON-VACUITY: the same chain written the 1020 way (compute returns the Score) FAILS in this harness - calling a phrase by name gave a Score, not bars', async () => {
  const py = await engine();
  const t1 = transform('phrase_001', [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }]);
  const files = vault({ phrase_001: EXTEND_FORKED, phrase_002: t1 });
  const old1020: Notes = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, t.replace(/\n {2}return (bars|\[mixed\]|\[bar\])\n {2}# for a Score of these bars: (rhythm_bars_to_stream\(bars=(?:bars|\[mixed\]|\[bar\])\))\n/, '\n  return $2\n')]));
  assert.notEqual(old1020['phrases/phrase_002.md'], files['phrases/phrase_002.md'], 'the rewrite to the 1020 text took effect');
  await assert.rejects(ran(py, files, 'phrase_002', old1020, 'score'), 'a transform whose source returns a Score cannot apply its op');
});
