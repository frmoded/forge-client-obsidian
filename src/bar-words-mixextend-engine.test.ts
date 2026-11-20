// 2026-11-19-0999b (MIX AND EXTEND AS STEPS INSIDE A PHRASE) - the REAL ENGINE (Pyodide with the vendored music wheels, test-support/real-rhythm-engine.ts; the same Python the plugin runs). Written RED first (there were no such steps).
// Pinned against the engine's own `mix_rhythm` / `extend_rhythm` called DIRECTLY on the same bars:
//   * `Mix bars 2 and 3.` puts ONE new bar (the engine's own mix of bar 2 and bar 3 as they are in the phrase) in the gap; bars 2 and 3 and every other bar stay byte for byte; the phrase is ONE bar longer; a vote with a share, a threshold and ghost notes, a path with its order and seed, every place;
//   * two bars with DIFFERENT channel sets give one bar with the UNION of the channels (the engine's own rule) and the mean tempo;
//   * `Extend bar 2 to 4 bars.` REPLACES bar 2 by the engine's own extend of it (the phrase is 3 bars longer), with a place word the bar STAYS and the 4 bars are inserted (4 bars longer); the style and the tempo change are the head's; Extend works on a bar that is a copy, a morph's new bar or a mix;
//   * the refusals the engine itself makes (two bars on different grids, a bar that is not on the 16-step grid) reach the person in words; what the NOTE's own Python returns (run on the engine) is the Score, bar for bar.
// Skipped (visibly) without the music wheels. No engine file is changed: the calls are the ones a Mix head and an Extend head make.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, mixRhythmRefusal, extendRhythmRefusal, noteContentFor, producePhraseNote, type PhraseParams } from './phrase-core.ts';
import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BAR_NAMES = ['bar_005', 'bar_006', 'bar_007', 'bar_008'];
const HEAD = 'Morph [[bar_005]] into [[bar_006]] over 6 bars, in musical order.';          // six distinct bars made by the engine
const VAULT = { ...PHRASE_VAULT, phrases: [...PHRASE_VAULT.phrases, 'mixed_src', 'grid12'], bars: [...PHRASE_VAULT.bars, 'bar_012', 'bar_013'] };

type Notes = Record<string, string>;
const bar12 = (kick: number[]): string => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '3/4', steps: 12, group_size: 3, swing_pct: 0, tempo_bpm: 90, channels: { kick: Array.from({ length: 12 }, (_, i) => kick.includes(i)) } })}\n\`\`\`\n`;
function vault(): Notes {
  const files: Notes = {};
  for (const n of BAR_NAMES) files[`bars/${n}.md`] = fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
  files['bars/bar_012.md'] = bar12([0, 6]); files['bars/bar_013.md'] = bar12([3, 9]);
  files['phrases/mixed_src.md'] = noteContentFor('mixed_src', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '2': 'bars/bar_008' } });       // bar 2 is bar_008 (kick, hihat, claves, conga_low, tempo 120): bars with different channel sets
  return files;
}
const barData = (n: string): unknown => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(vault()[`bars/${n}.md`])![1]);
function deps(py: any, files: Notes, asked: unknown[] = []) {
  return {
    readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: PhraseParams, title: string) => { asked.push({ kind: params.kind, params }); return computePhrase(py, data, params, title); },
  };
}
const noteFor = (lines: string[]): string => {
  const rp = L.replayGrammar(lines, 'phrase', { vault: VAULT });
  assert.equal(rp.stop, null, `${lines.join(' | ')}: ${rp.stop?.message}`);
  const w = writeListNote(noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_020', 'phrase', { params: rp.params, list: rp.list });
  assert.ok(w.ok); return (w as { ok: true; text: string }).text;
};
async function drawn(py: any, note: string, asked: unknown[] = []): Promise<{ bars: unknown[] } | { refusal: string }> {
  const out = await producePhraseNote(deps(py, vault(), asked) as never, note, 'phrase_020');
  return out.kind === 'score' ? { bars: barsOfPayload((out as { payload: Record<string, unknown> }).payload) as unknown[] } : { refusal: (out as { message: string }).message };
}
async function scoreBars(py: any, note: string, asked: unknown[] = []): Promise<unknown[]> {
  const d = await drawn(py, note, asked); assert.ok('bars' in d, 'refusal' in d ? d.refusal : ''); return d.bars;
}
/** The engine's own mix_rhythm / the path of the mix / extend_rhythm, called directly. */
function directMix(py: any, a: unknown, b: unknown, weight = 0.5, threshold = 0.5, ghost = false): unknown {
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b)); py.globals.set('_w', weight); py.globals.set('_t', threshold); py.globals.set('_g', ghost);
  return JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import mix_rhythm as _m\n_j.dumps(_m(_j.loads(_a), _j.loads(_b), weight=_w, threshold=_t, ghost=bool(_g)))'));
}
function directPath(py: any, a: unknown, b: unknown, weight: number, order: string, seed: number): unknown {
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b)); py.globals.set('_w', Math.round(weight * 1e6)); py.globals.set('_o', order); py.globals.set('_s', seed);
  return JSON.parse(py.runPython(['import json as _j', 'from forge.music.lib import morph_rhythm as _m, morph_rhythm_info as _i', '_aa = _j.loads(_a); _bb = _j.loads(_b)', '_d = _i(_aa, _bb, order=_o, seed=_s)["d"]',
    '_k = min(_d, max(0, ((1000000 - _w) * _d + 500000) // 1000000))', '_j.dumps(_m(_aa, _bb, bars=1, order=_o, seed=_s, position=_k))'].join('\n')));
}
function directExtend(py: any, bar: unknown, bars: number, style = 'repeat_with_fills', pct = 0): unknown[] {
  py.globals.set('_a', JSON.stringify(bar)); py.globals.set('_n', bars); py.globals.set('_y', style); py.globals.set('_p', pct);
  return JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import extend_rhythm as _e\n_j.dumps(_e(_j.loads(_a), bars=_n, style=_y, tempo_change_pct=_p))'));
}
/** The Python facet of `note`, run on the engine with the bars bound by name (the same way bar-words-engine.test.ts runs a note's Python). */
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

test('MIX on the real engine: ONE new bar between bar 2 and bar 3 (the engine\'s own mix_rhythm of the two bars as they are in the phrase), bars 2 and 3 and every other bar unchanged, the phrase ONE bar longer; the engine is asked once; the note\'s Python returns the Score', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD])); assert.equal(head.length, 6);
  const note = noteFor([HEAD, 'Mix bars 2 and 3.']);
  const asked: Array<{ kind: string }> = [];
  const bars = await scoreBars(py, note, asked);
  assert.equal(bars.length, 7, 'total +1');
  assert.deepEqual(bars.slice(0, 2), head.slice(0, 2), 'bars 1 and 2 stay'); assert.deepEqual(bars.slice(3), head.slice(2), 'the old bar 3 (now bar 4) and the rest stay');
  assert.deepEqual(bars[2], directMix(py, head[1], head[2]), 'bar 3 is the engine\'s own mix of the old bars 2 and 3 (50 percent, a vote)');
  assert.equal(asked.filter((a) => a.kind === 'mix').length, 1, `the engine was asked for one mix: ${JSON.stringify(asked)}`);
  assert.deepEqual(await ran(py, note), bars, 'the Python the note carries, run on the engine, is the Score');
});

test('MIX words on the real engine: the share, the threshold and the ghost notes of a vote, the order and seed of a path, every place; always ONE bar, the bars around it untouched, the note\'s Python the same', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD]));
  const cases: Array<{ say: string; a: number; b: number; at: number; make: () => unknown }> = [
    { say: 'Mix bars 2 and 3, 70 percent bar 2.', a: 2, b: 3, at: 2, make: () => directMix(py, head[1], head[2], 0.7) },
    { say: 'Mix bars 3 and 2, 70 percent bar 2.', a: 3, b: 2, at: 2, make: () => directMix(py, head[2], head[1], 0.3) },
    { say: 'Mix bars 1 and 6, 50 percent bar 1, as a vote, threshold 80 percent, with ghost notes.', a: 1, b: 6, at: 6, make: () => directMix(py, head[0], head[5], 0.5, 0.8, true) },
    { say: 'Mix bars 2 and 5, as a vote, and put it at the start.', a: 2, b: 5, at: 0, make: () => directMix(py, head[1], head[4]) },
    { say: 'Mix bars 2 and 5, and put it before bar 4.', a: 2, b: 5, at: 3, make: () => directMix(py, head[1], head[4]) },
    { say: 'Mix bars 2 and 3, and put it at the end.', a: 2, b: 3, at: 6, make: () => directMix(py, head[1], head[2]) },
    { say: 'Mix bars 1 and 6, 25 percent the first, as a path, in seeded order, seed 7.', a: 1, b: 6, at: 6, make: () => directPath(py, head[0], head[5], 0.25, 'seeded', 7) },
    { say: 'Mix bars 1 and 6, as a path, in by-channel order, and put it after bar 2.', a: 1, b: 6, at: 2, make: () => directPath(py, head[0], head[5], 0.5, 'by_channel', 0) },
    { say: 'Mix bars 1 and 6, 0 percent bar 1, as a path, in musical order.', a: 1, b: 6, at: 6, make: () => directPath(py, head[0], head[5], 0, 'musical', 0) },
  ];
  for (const c of cases) {
    const note = noteFor([HEAD, c.say]);
    const bars = await scoreBars(py, note);
    assert.equal(bars.length, 7, c.say);
    assert.deepEqual(bars, [...head.slice(0, c.at), c.make(), ...head.slice(c.at)], c.say);
    assert.deepEqual(await ran(py, note), bars, `the note's Python (the same place): ${c.say}`);
  }
});

test('MIX of two bars with DIFFERENT channel sets: ONE bar with the UNION of the channels (a\'s first, then b\'s new ones) and the mean tempo, the ends unchanged', async () => {
  const py = await engine();
  const src = await scoreBars(py, noteFor(['Take [[mixed_src]].'])); assert.equal(src.length, 4);
  assert.deepEqual(Object.keys((src[0] as { channels: object }).channels), ['kick', 'snare']);
  assert.deepEqual(Object.keys((src[1] as { channels: object }).channels), ['kick', 'hihat', 'claves', 'conga_low']);
  const bars = await scoreBars(py, noteFor(['Take [[mixed_src]].', 'Mix bars 1 and 2.']));
  assert.equal(bars.length, 5); assert.deepEqual(bars[0], src[0]); assert.deepEqual(bars[2], src[1]); assert.deepEqual(bars.slice(3), src.slice(2));
  const mixed = bars[1] as { channels: Record<string, unknown>; tempo_bpm: number };
  assert.deepEqual(Object.keys(mixed.channels), ['kick', 'snare', 'hihat', 'claves', 'conga_low'], 'the union, a\'s channels first');
  assert.equal(mixed.tempo_bpm, 110, 'the mean of 100 and 120');
  assert.deepEqual(mixed, directMix(py, src[0], src[1]));
});

test('EXTEND on the real engine: `Extend bar 2 to 4 bars.` REPLACES bar 2 by the engine\'s own extend of it (3 bars longer); with a place word the bar STAYS and the 4 bars are inserted (4 longer); the style and the tempo change are the head\'s; the note\'s Python returns the Score', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD]));
  const asked: Array<{ kind: string }> = [];
  const note = noteFor([HEAD, 'Extend bar 2 to 4 bars.']);
  const bars = await scoreBars(py, note, asked);
  assert.equal(bars.length, 9, '6 - 1 + 4');
  assert.deepEqual(bars[0], head[0]); assert.deepEqual(bars.slice(5), head.slice(2), 'bar 3 and the rest stay');
  assert.deepEqual(bars.slice(1, 5), directExtend(py, head[1], 4), 'bars 2 to 5 are the engine\'s own extend of the old bar 2 (repeating with fills)');
  assert.equal(asked.filter((a) => a.kind === 'extend').length, 1, 'the head is a morph, so the one extend is the step');
  assert.deepEqual(await ran(py, note), bars, 'the note\'s Python');
  const cases: Array<{ say: string; at: number; n: number; style?: string; pct?: number; replace?: boolean; k?: number }> = [
    { say: 'Extend bar 2 to 4 bars and put them at the end.', at: 6, n: 4 },
    { say: 'Extend bar 2 to 3 bars, building up, and put them at the start.', at: 0, n: 3, style: 'building' },
    { say: 'Extend bar 3 to 5 bars, adding ghost notes, 20 percent slower, and put them after bar 4.', at: 4, n: 5, style: 'ghost_notes', pct: -20, k: 3 },
    { say: 'Extend bar 1 to 1 bar and put it before bar 3.', at: 2, n: 1, k: 1 },
    { say: 'Extend bar 6 to 2 bars, 10 percent faster.', at: 5, n: 2, pct: 10, replace: true, k: 6 },
    { say: 'Extend bar 1 to 2 bars, building up.', at: 0, n: 2, style: 'building', replace: true, k: 1 },
  ];
  for (const c of cases) {
    const n2 = noteFor([HEAD, c.say]);
    const got = await scoreBars(py, n2);
    const k = c.k ?? 2;
    const ext = directExtend(py, head[k - 1], c.n, c.style ?? 'repeat_with_fills', c.pct ?? 0);
    const want = c.replace ? [...head.slice(0, k - 1), ...ext, ...head.slice(k)] : [...head.slice(0, c.at), ...ext, ...head.slice(c.at)];
    assert.deepEqual(got, want, c.say); assert.equal(got.length, c.replace ? 6 - 1 + c.n : 6 + c.n, c.say);
    assert.deepEqual(await ran(py, n2), got, `the note's Python: ${c.say}`);
  }
});

test('EXTEND of a bar that is itself a copy, a morph\'s new bar or a mix works: the engine extends that bar as it is at that point of the list', async () => {
  const py = await engine();
  const head = await scoreBars(py, noteFor([HEAD]));
  const copy = await scoreBars(py, noteFor([HEAD, 'Copy bar 2.', 'Extend bar 3 to 3 bars.']));
  assert.deepEqual(copy, [head[0], head[1], ...directExtend(py, head[1], 3), ...head.slice(2)], 'bar 3 is the copy of bar 2: its extend replaces it');
  const morphNote = noteFor([HEAD, 'Morph bars 2 and 3 across 2 bars.', 'Extend bar 3 to 2 bars.']);
  const morphed = await scoreBars(py, noteFor([HEAD, 'Morph bars 2 and 3 across 2 bars.']));
  const m = await scoreBars(py, morphNote);
  assert.deepEqual(m, [...morphed.slice(0, 2), ...directExtend(py, morphed[2], 2), ...morphed.slice(3)], 'the first new bar of the morph is extended (the data is that bar, not a note)');
  assert.deepEqual(await ran(py, morphNote), m, 'the note\'s Python');
  const mixNote = noteFor([HEAD, 'Mix bars 2 and 3.', 'Extend bar 3 to 2 bars, building up.']);
  const mixed = await scoreBars(py, noteFor([HEAD, 'Mix bars 2 and 3.']));
  const x = await scoreBars(py, mixNote);
  assert.deepEqual(x, [...mixed.slice(0, 2), ...directExtend(py, mixed[2], 2, 'building'), ...mixed.slice(3)], 'the mixed bar is extended');
  assert.deepEqual(await ran(py, mixNote), x);
});

test('after a Mix HEAD (one bar) an Extend step grows it and the Python agrees; after an Extend head a Mix of two of its bars is the engine\'s own', async () => {
  const py = await engine();
  const mixHead = 'Mix [[bar_005]] and [[bar_007]], 50 percent [[bar_005]], as a vote.';
  const one = await scoreBars(py, noteFor([mixHead])); assert.equal(one.length, 1);
  const grown = await scoreBars(py, noteFor([mixHead, 'Extend bar 1 to 3 bars, building up.']));
  assert.deepEqual(grown, directExtend(py, one[0], 3, 'building'));
  const ext = await scoreBars(py, noteFor(['Extend [[bar_005]] to 4 bars, repeating with fills.']));
  const note = noteFor(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Mix bars 1 and 4, 30 percent bar 1, and put it at the end.']);
  const bars = await scoreBars(py, note);
  assert.deepEqual(bars, [...ext, directMix(py, ext[0], ext[3], 0.3)]);
  assert.deepEqual(await ran(py, note), bars, 'the note\'s Python');
});

test('the engine\'s own refusals reach the person in words: a bar that is not on the 16-step grid cannot be extended, the mix and the extend refusals are recognised from the real traceback', async () => {
  const py = await engine();
  const odd = await drawn(py, noteFor(['Morph [[bar_012]] into [[bar_013]] over 3 bars, in musical order.', 'Extend bar 2 to 3 bars.']));
  assert.ok('refusal' in odd, 'a refusal'); assert.equal((odd as { refusal: string }).refusal, 'Phrase: the morph has 3 bars; ops[0]: bar 2 has 12 steps; extend needs a 16-step bar.');
  const grown = await drawn(py, noteFor(['Morph [[bar_012]] into [[bar_013]] over 3 bars, in musical order.', 'Mix bars 1 and 3.']));
  assert.ok('bars' in grown && grown.bars.length === 4, 'two 12-step bars of one grid mix fine (the grid is the engine\'s own rule)');
  let mixMessage = '', extendMessage = '';
  try { computePhrase(py, { a: barData('bar_005'), b: { ...(barData('bar_006') as object), time_signature: '3/4' } }, { kind: 'mix', a: 'x', b: 'y', weight: 0.5, threshold: 0.5, ghost: false }, 't'); } catch (e) { mixMessage = (e as Error).message; }
  assert.match(mixRhythmRefusal(mixMessage) ?? '', /^mix_rhythm: a and b must agree on time_signature, but a has '4\/4' and b has '3\/4'$/);
  try { computePhrase(py, { ...(barData('bar_005') as object), channels: { cowbell: Array(16).fill(false) } }, { kind: 'extend', source: 'x', bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 }, 't'); } catch (e) { extendMessage = (e as Error).message; }
  assert.match(extendRhythmRefusal(extendMessage) ?? '', /^extend_rhythm: unknown channel\(s\) \['cowbell'\]; supported: /);
});
