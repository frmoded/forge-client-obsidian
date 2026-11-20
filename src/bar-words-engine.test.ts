// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - the REAL ENGINE (Pyodide with the vendored music wheels, test-support/real-rhythm-engine.ts; the same Python the plugin runs): a Morph-between two bars of the phrase's own result. Written RED first (there was no such step).
// Pinned against the engine's own `morph_rhythm` called DIRECTLY on the same two bars: the step puts EXACTLY N NEW bars strictly between (the engine is asked for N + 2: its count includes both ends), the two ends and every other bar stay byte for byte, the phrase is N bars
// longer, a seeded order stores its seed and the seed changes the middle (a different seed, a different bar), "across 1 bar" is the middle one of three, and what the NOTE's own Python returns (run on the engine) is the Score, bar for bar. Duplicate / Move / Remove are checked on the
// engine too (the note's Python and the Score agree). Skipped (visibly) without the music wheels. No engine file is changed: the call is the one a Morph head makes (`data.a`, `data.b`).
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, type PhraseParams } from './phrase-core.ts';
import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BAR_NAMES = ['bar_005', 'bar_006', 'bar_007', 'bar_008'];
const HEAD = 'Morph [[bar_005]] into [[bar_006]] over 6 bars, in musical order.';          // six distinct bars made by the engine; bar 1 is bar_005 and bar 6 is bar_006

type Notes = Record<string, string>;
function vault(): Notes { const files: Notes = {}; for (const n of BAR_NAMES) files[`bars/${n}.md`] = fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8'); return files; }
const barData = (n: string): unknown => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(vault()[`bars/${n}.md`])![1]);
function deps(py: any, files: Notes, asked: unknown[] = []) {
  return {
    readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: PhraseParams, title: string) => { asked.push({ kind: params.kind, bars: (params as { bars?: number }).bars }); return computePhrase(py, data, params, title); },
  };
}
const noteFor = (lines: string[]): string => {
  const rp = L.replayGrammar(lines, 'phrase', { vault: PHRASE_VAULT });
  assert.equal(rp.stop, null, `${lines.join(' | ')}: ${rp.stop?.message}`);
  const w = writeListNote(noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_020', 'phrase', { params: rp.params, list: rp.list });
  assert.ok(w.ok); return (w as { ok: true; text: string }).text;
};
async function scoreBars(py: any, note: string, asked: unknown[] = []): Promise<unknown[]> {
  const out = await producePhraseNote(deps(py, vault(), asked) as never, note, 'phrase_020');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  return barsOfPayload((out as { payload: Record<string, unknown> }).payload) as unknown[];
}
/** The engine's own morph_rhythm, called directly. */
function direct(py: any, a: unknown, b: unknown, bars: number, order = 'musical', seed = 0): unknown[] {
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b)); py.globals.set('_n', bars); py.globals.set('_o', order); py.globals.set('_s', seed);
  return JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import morph_rhythm as _m\n_j.dumps(_m(_j.loads(_a), _j.loads(_b), bars=_n, order=_o, seed=_s))'));
}
/** The Python facet of `note`, run on the engine with the bars bound by name (the same way bar-structure-engine.test.ts runs a note's Python). */
async function ran(py: any, note: string): Promise<unknown[]> {
  const python = /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note)![1];
  const bars: Record<string, unknown> = {}; for (const n of BAR_NAMES) bars[n] = barData(n);
  py.globals.set('_bars_json', JSON.stringify(bars)); py.globals.set('_py', python);
  return JSON.parse(py.runPython([
    'import json as _j', 'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars")}',
    '_bars = _j.loads(_bars_json); g = dict(_eng)',
    'for _n, _d in _bars.items():', '    g[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'exec(_py, g)', '_j.dumps(g["compute"](None))',
  ].join('\n')));
}

test('MORPH-BETWEEN on the real engine: 5 NEW bars strictly between bar 2 and bar 3, the ends and every other bar unchanged, the phrase 5 bars longer; the new bars are morph_rhythm\'s own states 1 to 5 of 7; the note\'s Python returns the same bars', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD])); assert.equal(head.length, 6);
  const note = noteFor([HEAD, 'Morph bars 2 and 3 across 5 bars.']);
  const asked: Array<{ kind: string; bars?: number }> = [];
  const bars = await scoreBars(py, note, asked);
  assert.equal(bars.length, 11, 'total +5');
  assert.deepEqual(bars.slice(0, 2), head.slice(0, 2), 'bars 1 and 2 stay'); assert.deepEqual(bars.slice(7), head.slice(2), 'the old bar 3 (now bar 8) and the rest stay');
  const want = direct(py, head[1], head[2], 7);
  assert.deepEqual(bars.slice(2, 7), want.slice(1, 6), 'bars 3 to 7 are the engine\'s own states 1 to 5 of the morph from bar 2 to bar 3 asked for 7 bars');
  assert.deepEqual(asked.filter((a) => a.kind === 'morph' && a.bars === 7).length, 1, `the engine was asked for 7 bars once: ${JSON.stringify(asked)}`);
  assert.deepEqual(await ran(py, note), bars, 'the Python the note carries, run on the engine, is the Score');
});

test('place words on the real engine: at the start, before bar 2, after bar 4, at the end, with ends that are far apart; always N new bars and the bars around them untouched; a seeded order with its seed is the engine\'s seeded shuffle', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD]));
  const cases: Array<{ say: string; a: number; b: number; n: number; at: number; order?: string; seed?: number }> = [
    { say: 'Morph bars 1 and 6 across 3 bars, put them at the start.', a: 1, b: 6, n: 3, at: 0 },
    { say: 'Morph bars 3 and 5 across 4 bars, and put them before bar 2.', a: 3, b: 5, n: 4, at: 1 },
    { say: 'Morph bars 2 and 5 across 2 bars, and put them after bar 4.', a: 2, b: 5, n: 2, at: 4 },
    { say: 'Morph bars 6 and 1 across 5 bars, and put them at the end.', a: 6, b: 1, n: 5, at: 6 },
    { say: 'Morph bars 1 and 6 across 4 bars, in seeded order, seed 7.', a: 1, b: 6, n: 4, at: 6, order: 'seeded', seed: 7 },
    { say: 'Morph bars 2 and 3 across 1 bar.', a: 2, b: 3, n: 1, at: 2 },
  ];
  for (const c of cases) {
    const note = noteFor([HEAD, c.say]);
    const bars = await scoreBars(py, note);
    assert.deepEqual(await ran(py, note), bars, `the note's Python (the same place): ${c.say}`);
    const mid = direct(py, head[c.a - 1], head[c.b - 1], c.n + 2, c.order ?? 'musical', c.seed ?? 0).slice(1, c.n + 1);
    assert.deepEqual(bars, [...head.slice(0, c.at), ...mid, ...head.slice(c.at)], c.say);
    assert.equal(bars.length, 6 + c.n, c.say);
  }
  const s7 = direct(py, head[0], head[5], 6, 'seeded', 7), s8 = direct(py, head[0], head[5], 6, 'seeded', 8);
  assert.notDeepEqual(s7.slice(1, 5), s8.slice(1, 5), 'the seed matters (so storing it in the sentence is what makes the replay the same)');
});

test('the other bar words on the real engine: Duplicate, Move back / forward and Remove draw what applyStructure says, and the Python of the note agrees', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD]));
  const cases: Array<[string, (b: unknown[]) => unknown[]]> = [
    ['Duplicate bar 2.', (b) => [b[0], b[1], b[1], ...b.slice(2)]],
    ['Duplicate bars 2 to 3.', (b) => [b[0], b[1], b[2], b[1], b[2], ...b.slice(3)]],
    ['Move bar 3 back.', (b) => [b[0], b[2], b[1], ...b.slice(3)]],
    ['Move bar 3 forward.', (b) => [b[0], b[1], b[3], b[2], ...b.slice(4)]],
    ['Remove bar 1.', (b) => b.slice(1)],
  ];
  for (const [say, f] of cases) {
    const note = noteFor([HEAD, say]);
    const bars = await scoreBars(py, note);
    assert.deepEqual(bars, f(head), say); assert.deepEqual(await ran(py, note), bars, `the note's Python: ${say}`);
  }
});
