// 2026-10-30-1050 (M15b, the 1030 FEEDBACK's open edge 4): `Take [[arr_001]]` gives the source `arrangements/arr_001`, which `validatePhrase` refused (TRANSFORM_SOURCE wanted phrases/phrase_N). The validator now takes a phrase OR an
// arrangement as a transform's source, and the Score reads either (the transform's Python already calls its source by name). Proven here: the validator on both kinds and its refusals, the Score of a transform of an arrangement with the
// engine stood in (the arrangement's combined bars are what the ops change), a missing / unusable / looping arrangement as a refusal in one sentence that names it, a surface without the arrangement step saying so, and the REAL
// phrase tab (mountPhrase, the DOM) drawing such a transform through the port the plugin's view passes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, producePhraseNote, validatePhrase, type PhraseParams, type PhraseScoreDeps, type TransformPhrase } from './phrase-core.ts';
import { newArrangementNote, phraseDepsWithArrangements, type ArrangementInput, type ArrangementParams } from './arrangement-core.ts';
import { newKitNote } from './kit-core.ts';
import { formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const barData = (n: string): RhythmData => { const r = readRhythmNote(barText(n)); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const ROCK = { kind: 'kit' as const, name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] };
const OPS: TransformPhrase['ops'] = [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }];
const SCORE = { type: 'musicxml', content: '<score-partwise/>' };
const MERGED = [barData('bar_007'), barData('bar_008'), barData('bar_007')];          // what the engine's combine_tracks hands back: the arrangement's bars, three of them

function world(over: { notes?: Record<string, string | undefined>; combined?: unknown } = {}) {
  const notes: Record<string, string> = {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'), 'kits/rock.md': newKitNote(ROCK),
    'phrases/phrase_003.md': noteContentFor('phrase_003', { kind: 'extend', source: 'bar_007', bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 }),
    'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
  };
  for (const [k, v] of Object.entries(over.notes ?? {})) { if (v === undefined) delete notes[k]; else notes[k] = v; }
  const transformed: Array<{ bars: RhythmData[]; params: PhraseParams }> = [];
  const combined: ArrangementInput[] = [];
  const base: Pick<PhraseScoreDeps, 'readNote' | 'compute'> = {
    readNote: async (p) => { const t = notes[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params) => {
      if (Array.isArray(data?.bars)) { transformed.push({ bars: data.bars, params }); return { ...SCORE, bars_data: data.bars }; }       // the transform: the engine changes the regions (not under test here)
      return { ...SCORE, bars_data: [data, data, data] };                                                                                     // a phrase: its source bar three times
    },
  };
  const computeArrangement = async (input: ArrangementInput) => { combined.push(input); return over.combined ?? { ...SCORE, bars_data: MERGED }; };
  return { notes, base, deps: phraseDepsWithArrangements(base, computeArrangement), transformed, combined };
}
const transformNote = (source: string, ops = OPS): string => noteContentFor('phrase_010', { kind: 'transform', source, ops });

test('the validator takes a phrase OR an arrangement (and, since M17b, a composition) as the source of a transform, and refuses everything else in one sentence naming them', () => {
  for (const source of ['phrases/phrase_006', 'arrangements/arr_001', 'arrangements/arr_12']) {
    const v = validatePhrase({ kind: 'transform', source, ops: OPS });
    assert.ok(v.ok, source);
    if (v.ok) assert.equal((v.value as TransformPhrase).source, source);
  }
  const SENTENCE = (got: string) => `source must be a phrase note without .md, like phrases/phrase_006, an arrangement note, like arrangements/arr_001, or a composition note, like compositions/intro, got ${got}.`;      // 2026-10-31-1100 (M17b, deliberate): a composition note too
  for (const source of ['phrase_006', 'arr_001', 'phrases/phrase_006.md', 'arrangements/arr_001.md', 'bars/bar_005', 'arrangements/arr_x', 'phrases/arr_001', 'arrangements/phrase_001', 'arrangement/arr_001', 'kits/rock', 'arrangements/arr_001/x', '/arrangements/arr_001', ' arrangements/arr_001', 7, null]) {
    const v = validatePhrase({ kind: 'transform', source, ops: OPS });
    assert.deepEqual(v, { ok: false, message: SENTENCE(JSON.stringify(source)) }, String(source));
  }
});

test('the Score of a transform of an ARRANGEMENT: the arrangement is read fresh and drawn by the arrangement code, its combined bars are what the transform changes, the ops go to the engine with them', async () => {
  const w = world();
  const out = await producePhraseNote(w.deps, transformNote('arrangements/arr_001'), 'phrase_010');
  assert.equal(out.kind, 'score');
  assert.equal(w.combined.length, 1, 'the arrangement was drawn once');
  assert.deepEqual(w.combined[0].tracks.map((t) => [t.kit, t.phrase, t.bars.length]), [['rock', 'phrase_003', 3]], 'by the arrangement code: its kit, its phrase drawn by the phrase code');
  assert.equal(w.transformed.length, 1);
  assert.deepEqual(w.transformed[0].bars, MERGED, 'the transform changes the arrangement\'s combined bars');
  assert.deepEqual((w.transformed[0].params as TransformPhrase).source, 'arrangements/arr_001');
  assert.deepEqual((w.transformed[0].params as TransformPhrase).ops, OPS);
});

test('a transform of a PHRASE is exactly what it was (the phrase is drawn by the phrase code; the arrangement step is never asked)', async () => {
  const w = world();
  const out = await producePhraseNote(w.deps, transformNote('phrases/phrase_003'), 'phrase_010');
  assert.equal(out.kind, 'score');
  assert.equal(w.combined.length, 0);
  assert.equal(w.transformed.length, 1);
  assert.equal(w.transformed[0].bars.length, 3);
});

test('a missing, unusable or too-short arrangement is a refusal in one sentence that names it, and the engine is not asked to change anything', async () => {
  const cases: Array<[string, Parameters<typeof world>[0], string, RegExp]> = [
    ['missing', { notes: { 'arrangements/arr_001.md': undefined } }, 'arrangements/arr_001', /^Phrase: the source arrangement arr_001 \(arrangements\/arr_001\.md\) was not found or could not be read \(File not found\)\.$/],
    ['not an arrangement', { notes: { 'arrangements/arr_001.md': newKitNote(ROCK) } }, 'arrangements/arr_001', /^Phrase: the source arrangement arr_001 could not be drawn: Arrangement: The kind must be "arrangement"/],
    ['a kit it plays is gone', { notes: { 'kits/rock.md': undefined } }, 'arrangements/arr_001', /^Phrase: the source arrangement arr_001 could not be drawn: Arrangement: the kit rock \(kits\/rock\.md\) was not found/],
    ['drawn, but the engine gave no bars', { combined: SCORE }, 'arrangements/arr_001', /^Phrase: the source arrangement arr_001 gave no bars to change\.$/],
    ['the engine gave no score at all', { combined: { nothing: true } }, 'arrangements/arr_001', /^Phrase: the source arrangement arr_001 could not be drawn: /],
  ];
  for (const [label, over, source, re] of cases) {
    const w = world(over);
    const out = await producePhraseNote(w.deps, transformNote(source), 'phrase_010');
    assert.equal(out.kind, 'refusal', label);
    if (out.kind === 'refusal') assert.match(out.message, re, label);
    assert.equal(w.transformed.length, 0, `${label}: the engine is not asked`);
  }
  const short = world();
  const out = await producePhraseNote(short.deps, transformNote('arrangements/arr_001', [{ op: 'double_up', first: 2, last: 5, grid: 16 }]), 'phrase_010');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Phrase: ops[0] asks for bars 2 to 5, but the source arrangement arr_001 has 3 bars.');
});

test('a surface that has no arrangement step says so instead of failing: the plain deps refuse a transform of an arrangement in one sentence', async () => {
  const w = world();
  const out = await producePhraseNote(w.base, transformNote('arrangements/arr_001'), 'phrase_010');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Phrase: the source arrangement arr_001 cannot be drawn here (this surface has no way to draw an arrangement).');
});

test('a LOOP is a refusal, not a hang: an arrangement that plays a transform of itself (and a transform of a transform of the arrangement it is played in)', async () => {
  const loopPhrase = transformNote('arrangements/arr_001');
  const arrPlaysIt: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_010' }] };
  const w = world({ notes: { 'phrases/phrase_010.md': loopPhrase, 'arrangements/arr_001.md': newArrangementNote('arr_001', arrPlaysIt) } });
  const out = await producePhraseNote(w.deps, loopPhrase, 'phrase_010');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.match(out.message, /the transform chain through arr_001 loops back or is more than 6 deep\./);
  assert.equal(w.transformed.length, 0);
});

test('the REAL phrase tab (mountPhrase) draws a transform of an arrangement through the port the plugin\'s view passes - and without the port says it cannot', async () => {
  for (const withPort of [true, false]) {
    const w = world();
    const win: any = new Window({ url: 'http://localhost/' });
    const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
    const path10 = 'phrases/phrase_010.md';
    const files = new Map<string, string>([[path10, transformNote('arrangements/arr_001')]]);
    const drawn: string[] = [];
    const ports: PhraseMountPorts = {
      path: path10, title: 'phrase_010', plan: 'score',
      readNote: async (p) => (p === path10 ? files.get(path10)! : w.base.readNote(p)),
      writePhrase: async () => ({ ok: true }),
      compute: (data, params, title) => w.base.compute(data, params, title),
      ...(withPort ? { computeArrangement: async (input: ArrangementInput) => { w.combined.push(input); return { ...SCORE, bars_data: MERGED }; } } : {}),
      renderInto: (host, payload) => { drawn.push(String(payload.type)); host.textContent = 'engraved'; return true; },
      stopPlayers: () => {},
      setTimer: (fn) => { fn(); return 0; }, clearTimer: () => {},
    };
    const handle = mountPhrase(parent, ports);
    await handle.load();
    for (let i = 0; i < 60; i++) await Promise.resolve();
    if (withPort) {
      assert.deepEqual(drawn, ['musicxml'], 'the Score was drawn');
      assert.equal(w.combined.length, 1, 'through the arrangement step');
      assert.equal(w.transformed.length, 1);
    } else {
      assert.deepEqual(drawn, [], 'nothing drawn');
      assert.match(parent.textContent ?? '', /cannot be drawn here/);
    }
    handle.dispose();
  }
});

test('MECHANISM PIN 2026-10-30-1050 (if the design moves this SHOULD go red: reassess, do not just rewrite): both real surfaces build their phrase deps with the arrangement step - the phrase tab passes `computeArrangement`, the arrangement tab draws its phrases with `phraseDepsWithArrangements`', () => {
  const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8');
  assert.match(read('phrase-view.ts'), /computeArrangement: \(data, title\) => computeArrangementScoreViaEngine\(data, title\)/);
  assert.match(read('phrase-dom.ts'), /ports\.computeArrangement \? phraseDepsWithArrangements\(/);
  assert.match(read('phrase-dom.ts'), /ports\.computeArrangement && ports\.computeComposition \? phraseDepsWithSources\(/, '2026-10-31-1100 (M17b, deliberate): and with the composition step when the surface has one');
  assert.match(read('kits-arrangements.ts'), /phrases: phraseDepsWithSources\(/, '... the arrangement tab draws its phrases with the arrangement AND the composition step (M17b)');
});

test('a transform of a PHRASE whose note is missing or unusable is a refusal naming the phrase (the path the arrangement source shares)', async () => {
  const missing = await producePhraseNote(world().deps, transformNote('phrases/phrase_077'), 'phrase_010');
  assert.deepEqual(missing, { kind: 'refusal', message: 'Phrase: the source phrase phrase_077 (phrases/phrase_077.md) was not found or could not be read (File not found).' });
  const broken = await producePhraseNote(world({ notes: { 'phrases/phrase_003.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "nope"}\n```\n' } }).deps, transformNote('phrases/phrase_003'), 'phrase_010');
  assert.equal(broken.kind, 'refusal');
  if (broken.kind === 'refusal') assert.match(broken.message, /^Phrase: the source phrase phrase_003 is not usable: /);
});

test('forks over a transform of an ARRANGEMENT: the fork note stands in for its bar and goes to the engine; a fork on another grid is a refusal that names the SOURCE ARRANGEMENT', async () => {
  const withFork = (bar: string) => noteContentFor('phrase_010', { kind: 'transform', source: 'arrangements/arr_001', ops: OPS, overrides: { '2': `bars/${bar}` } });
  const ok = world();
  const out = await producePhraseNote(ok.deps, withFork('bar_008'), 'phrase_010');
  assert.equal(out.kind, 'score');
  assert.deepEqual(Object.keys((ok.transformed[0].params as unknown as { override_bars: Record<string, unknown> }).override_bars), ['2']);
  const d = barData('bar_008');
  const shorter = { ...d, steps: d.steps / 2, channels: Object.fromEntries(Object.entries(d.channels).map(([k, row]) => [k, (row as unknown[]).slice(0, d.steps / 2)])) } as RhythmData;
  const odd = world({ notes: { 'bars/bar_099.md': `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${formatRhythmJson(shorter)}\n\`\`\`\n` } });
  const refused = await producePhraseNote(odd.deps, withFork('bar_099'), 'phrase_010');
  assert.equal(refused.kind, 'refusal');
  if (refused.kind === 'refusal') assert.match(refused.message, /^Phrase: bar 2 \(bars\/bar_099\) differs from the source arrangement arr_001 in steps /);
  assert.equal(odd.transformed.length, 0);
});

test('a fork over a transform of a ONE-BAR arrangement is checked against that bar (the first bar of the source, not a second one that is not there)', async () => {
  const w = world({ combined: { ...SCORE, bars_data: [barData('bar_007')] } });
  const note = noteContentFor('phrase_010', { kind: 'transform', source: 'arrangements/arr_001', ops: [{ op: 'double_up', first: 1, last: 1, grid: 16 }], overrides: { '1': 'bars/bar_008' } });
  const out = await producePhraseNote(w.deps, note, 'phrase_010');
  assert.equal(out.kind, 'score');
  assert.deepEqual(Object.keys((w.transformed[0].params as unknown as { override_bars: Record<string, unknown> }).override_bars), ['1']);
});
