// 2026-10-31-1100 (M17b): a composition on the REAL engine (Pyodide with the vendored music wheels and the engine bundle of assets/engine, which carries compose_sections; test-support/real-rhythm-engine.ts). The notes are written by the
// plugin's own builders. Proves: the Score is drawn by the phrase glue's `composition` branch from the json (P4), the bars are exactly what compose_sections gives for the sections drawn alone (repeat to fill, cut, all once, a repeat
// of a whole section, a section that is an ARRANGEMENT), every bar keeps its own tempo, the engine's lineage says which section and which bar of its note each bar is, the PYTHON text of the note run with every other note bound by
// name gives those same bars, and another meter in one section is the engine's own refusal in one sentence. Skipped (visibly) without the music wheels.
// Pins the MECHANISM (the glue calls compose_sections; the note's Python calls it too); if the design moves this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import { newArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { annotateCompositionPayload } from './composition-nav-core.ts';
import { FORGE_COMPOSITION_KEY, newCompositionNote, phraseDepsWithSources, produceComposition, type CompositionDeps, type CompositionParams, type CompositionShape } from './composition-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const barJson = (text: string): any => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)![1]);
/** bar_008 is a latin bar at 120 bpm; the rock fixtures play at 100: two sections at two tempos, each bar keeping its own. */
const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] };
const extend = (source: string, bars: number): PhraseParams => ({ kind: 'extend', source, bars, style: 'repeat_with_fills', tempo_change_pct: 0 });
const P = (sections: CompositionParams['sections']): CompositionParams => ({ kind: 'composition', sections });

function vault(over: { notes?: Record<string, string> } = {}): Record<string, string> {
  return {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'), 'kits/rock.md': newKitNote(ROCK),
    'phrases/phrase_003.md': noteContentFor('phrase_003', extend('bar_007', 4)),
    'phrases/phrase_009.md': noteContentFor('phrase_009', extend('bar_008', 2)),
    'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
    ...(over.notes ?? {}),
  };
}
function depsOf(py: any, files: Record<string, string>): CompositionDeps {
  const base = {
    readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
  };
  const computeArrangement = async (data: unknown, title: string) => computePhrase(py, data, { kind: 'arrangement' }, title);
  const compute = async (data: unknown, title: string) => computePhrase(py, data, { kind: 'composition' }, title);
  return { phrases: phraseDepsWithSources(base, { computeArrangement, computeComposition: compute }), compute, computeArrangement };
}

/** What compose_sections gives, asked of the engine directly. */
async function direct(py: any, sections: unknown, lineage = false): Promise<any[]> {
  py.globals.set('_sections_json', JSON.stringify(sections));
  return JSON.parse(py.runPython(['import json as _j', 'from forge.music.lib import compose_sections, compose_sections_lineage', `_j.dumps(${lineage ? 'compose_sections_lineage' : 'compose_sections'}(_j.loads(_sections_json)))`].join('\n')));
}

const SECTIONS = P([{ source: 'phrases/phrase_003', length: 6 }, { source: 'arrangements/arr_001', length: 2 }, { source: 'phrases/phrase_009', repeat: 1 }]);

test('a composition of a phrase repeated to fill 6 bars, an arrangement cut to 2 and a phrase played twice: a real Score of 6 + 2 + 2 + 2 = 12 bars, each bar its section\'s own bar and tempo, equal to compose_sections over the sections drawn alone', async () => {
  const py = await engine();
  const files = vault();
  const deps = depsOf(py, files);
  const note = newCompositionNote('comp_001', SECTIONS);
  const out = await produceComposition(deps, note, 'comp_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind !== 'score') return;
  assert.equal(typeof out.payload.content === 'string' || typeof out.payload.multi_staff_content === 'string', true, 'a Score payload');
  const bars = barsOfPayload(out.payload)!;
  assert.equal(bars.length, 12);
  const drawn = async (p: string, title: string): Promise<any[]> => {
    const o = await produceComposition(deps, newCompositionNote('alone', P([{ source: p }])), title);
    assert.equal(o.kind, 'score');
    return barsOfPayload((o as { payload: Record<string, unknown> }).payload)!;
  };
  const rock = await drawn('phrases/phrase_003', 'a'), arr = await drawn('arrangements/arr_001', 'b'), latin = await drawn('phrases/phrase_009', 'c');
  assert.deepEqual(rock.length, 4); assert.deepEqual(arr.length, 4); assert.deepEqual(latin.length, 2);
  assert.deepEqual(bars, await direct(py, [{ bars: rock, length: 6 }, { bars: arr, length: 2 }, { bars: latin }, { bars: latin }]), 'the glue is compose_sections over the sections');
  assert.deepEqual(bars.slice(0, 4), rock, 'the rock phrase, once through'); assert.deepEqual(bars.slice(4, 6), rock.slice(0, 2), 'then repeated from its first bar to fill 6');
  assert.deepEqual(bars.slice(6, 8), arr.slice(0, 2), 'the arrangement, cut to 2');
  assert.deepEqual(bars.slice(8, 10), latin); assert.deepEqual(bars.slice(10, 12), latin, 'a repeat plays the section again');
  assert.deepEqual(bars.map((b) => b.tempo_bpm), [...rock.map((b) => b.tempo_bpm), ...rock.slice(0, 2).map((b) => b.tempo_bpm), ...arr.slice(0, 2).map((b) => b.tempo_bpm), ...latin.map((b) => b.tempo_bpm), ...latin.map((b) => b.tempo_bpm)], 'every bar keeps its own tempo');
  assert.ok(new Set(bars.map((b) => b.tempo_bpm)).size >= 2, 'the fixtures play at two tempos, so this proves nothing is re-timed');
  const shape = out.payload[FORGE_COMPOSITION_KEY] as CompositionShape;
  assert.deepEqual(shape.sections.map((s) => [s.source, s.bars, s.first]), [['phrases/phrase_003', 6, 1], ['arrangements/arr_001', 2, 7], ['phrases/phrase_009', 2, 9], ['phrases/phrase_009', 2, 11]]);
});

test('the engine\'s lineage says, per bar, which section and which bar of its note it is', async () => {
  const py = await engine();
  const files = vault();
  const out = await produceComposition(depsOf(py, files), newCompositionNote('comp_001', SECTIONS), 'comp_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const lineage = (out.payload as any).composition_lineage;
  assert.deepEqual(lineage.map((l: any) => [l.section, l.source, l.bar]), [
    [1, 'phrases/phrase_003', 1], [1, 'phrases/phrase_003', 2], [1, 'phrases/phrase_003', 3], [1, 'phrases/phrase_003', 4], [1, 'phrases/phrase_003', 1], [1, 'phrases/phrase_003', 2],
    [2, 'arrangements/arr_001', 1], [2, 'arrangements/arr_001', 2], [3, 'phrases/phrase_009', 1], [3, 'phrases/phrase_009', 2], [4, 'phrases/phrase_009', 1], [4, 'phrases/phrase_009', 2],
  ]);
  assert.deepEqual(lineage.map((l: any) => l.tempo_bpm), barsOfPayload(out.payload)!.map((b) => b.tempo_bpm));
});

test('the PYTHON text of the composition note, run with every other note bound by name, gives the same bars the Score is drawn from', async () => {
  const py = await engine();
  const files = vault({ notes: { 'compositions/comp_001.md': newCompositionNote('comp_001', SECTIONS) } });
  const out = await produceComposition(depsOf(py, files), files['compositions/comp_001.md'], 'comp_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const pythonOf = (note: string): string => /\n# Python\n\n```python\n([\s\S]*?)\n```\n/.exec(note)![1];
  const srcs: Record<string, string> = {};
  const bars: Record<string, unknown> = {};
  for (const [p, t] of Object.entries(files)) {
    const name = p.replace(/^[^/]+\//, '').replace(/\.md$/, '');
    if (p.startsWith('bars/')) bars[name] = barJson(t); else srcs[name] = pythonOf(t);
  }
  py.globals.set('_bars_json', JSON.stringify(bars));
  py.globals.set('_srcs_json', JSON.stringify(srcs));
  const ran = JSON.parse(py.runPython([
    'import json as _j',
    'from forge.music import lib as _lib',
    '_eng = {k: getattr(_lib, k) for k in ("extend_rhythm", "mix_rhythm", "morph_rhythm", "morph_rhythm_info", "thin_out_bars", "double_up_bars", "combine_tracks", "compose_sections")}',
    '_bars = _j.loads(_bars_json); _srcs = _j.loads(_srcs_json); _fns = {}',
    'for _n, _d in _bars.items():',
    '    _fns[_n] = (lambda d: (lambda: _j.loads(_j.dumps(d))))(_d)',
    'def _note(name):',
    '    def call():',
    '        g = dict(_eng); g.update(_fns)',
    '        exec(_srcs[name], g)',
    '        return g["compute"](None)',
    '    return call',
    'for _n in _srcs: _fns[_n] = _note(_n)',
    '_j.dumps(_fns["comp_001"]())',
  ].join('\n')));
  assert.deepEqual(ran, barsOfPayload(out.payload), 'the note\'s Python and the drawn Score agree bar for bar');
  assert.equal((ran as unknown[]).length, 12);
});

test('a composition that plays a composition (a section of sections) is drawn one level deeper, by the same code', async () => {
  const py = await engine();
  const inner = newCompositionNote('intro', P([{ source: 'phrases/phrase_009', length: 3 }]));
  const files = vault({ notes: { 'compositions/intro.md': inner } });
  const out = await produceComposition(depsOf(py, files), newCompositionNote('comp_001', P([{ source: 'compositions/intro' }, { source: 'phrases/phrase_003', length: 1 }])), 'comp_001');
  assert.equal(out.kind, 'score', out.kind === 'score' ? '' : (out as { message: string }).message);
  if (out.kind === 'score') assert.equal(barsOfPayload(out.payload)!.length, 3 + 1);
});

test('two sections in another meter are the engine\'s own refusal in one sentence naming both sections; nothing is drawn', async () => {
  const py = await engine();
  const waltz = barText('bar_008').replace('"time_signature": "4/4"', '"time_signature": "3/4"');
  assert.notEqual(waltz, barText('bar_008'), 'the fixture is a 4/4 bar, now a 3/4 one');
  const files = vault({ notes: { 'bars/bar_020.md': waltz, 'phrases/phrase_020.md': noteContentFor('phrase_020', extend('bar_020', 2)) } });
  const out = await produceComposition(depsOf(py, files), newCompositionNote('comp_001', P([{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_020' }])), 'comp_001');
  assert.equal(out.kind, 'refusal', out.kind === 'refusal' ? '' : JSON.stringify(out).slice(0, 200));
  if (out.kind === 'refusal') assert.match(out.message, /^Composition: compose_sections: section 2 bar 1 has time_signature '3\/4' but section 1 has '4\/4'; all sections must share the same meter and steps$/);
});

test('the REAL Score of a composition is tied bar by bar to its sections: an id on all 12 measures, and each bar says its section, its note, the bar of that note and its tempo (the engine\'s lineage and the producer\'s shape agree)', async () => {
  const py = await engine();
  const files = vault();
  const out = await produceComposition(depsOf(py, files), newCompositionNote('comp_001', SECTIONS), 'comp_001');
  assert.equal(out.kind, 'score');
  if (out.kind !== 'score') return;
  const tied = annotateCompositionPayload('compositions/comp_001', out.payload);
  assert.deepEqual(tied.problems, [], tied.problems.join('; '));
  assert.equal(Object.keys(tied.map).length, 12);
  assert.deepEqual(Object.values(tied.map).map((p) => [p.params.section, p.params.source, p.params.sourceBar]).slice(5, 9), [[1, 'phrases/phrase_003', 2], [2, 'arrangements/arr_001', 1], [2, 'arrangements/arr_001', 2], [3, 'phrases/phrase_009', 1]]);
  assert.deepEqual(Object.values(tied.map).map((p) => p.params.tempoBpm), barsOfPayload(out.payload)!.map((b) => b.tempo_bpm));
  assert.equal((String(tied.payload.multi_staff_content ?? tied.payload.content).match(/<measure [^>]*id="ph_bar_\d+"/g) ?? []).length, 12);
});
