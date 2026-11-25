// 2026-11-24-1031 (pitch in bars, Stage 1b) - the CORES of a melody phrase: its json (`style: "repeat"`, tempo 0), the note a phrase writes (Description, Recipe, Python, the front matter mark `melody: true`), what the Recipe and the Python read back, and the Score
// of the phrase with the engine stood in for (what is read, what is asked, what is refused and in which words). The REAL engine is melody-phrase-acceptance.test.ts. A rhythm phrase is what it was (the pins at the bottom).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_STYLES, producePhrase, readPhraseNote, refreshPhraseNoteText, validatePhrase, type ExtendPhrase, type PhraseParams } from './phrase-core.ts';
import { newPhraseNote, phraseDescription, phraseLinks, phrasePython, phraseRecipeSteps, renderPhraseNote } from './phrase-notes-core.ts';
import { describe, canonical } from './phrase-grammar-core.ts';
import { parseRecipe, renderRecipe } from './recipe-grammar-core.ts';
import { parsePython, renderPython } from './python-grammar-core.ts';
import { formatPhraseJson } from './phrase-core.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { makeNotePreflight } from './note-preflight-core.ts';
import { noteContentFor, mixNoteContent } from './phrase-core.ts';
import { VAULT } from './test-support/sentence-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import { PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const REPEAT: ExtendPhrase = { kind: 'extend', source: 'bar_101', bars: 10, style: 'repeat', tempo_change_pct: 0 };
const V = { ...VAULT, bars: [...(VAULT.bars as string[]), 'bar_101', 'bar_102'], melody: ['bar_101', 'bar_102'], melodyPhrases: ['phrase_101'] };
const note = (p: PhraseParams, name = 'phrase_101'): string => newPhraseNote(name, p, formatPhraseJson(p));
const melodyBar = (notes: Array<{ step: number; pitch: string; length: number }> = [{ step: 1, pitch: 'G3', length: 1 }]): string => melodyNoteTemplate('bar_101').replace('"notes": []', `"notes": ${JSON.stringify(notes)}`);

test('validatePhrase: a plain repeat is an extend whose style is "repeat" and whose tempo change is 0; the rhythm styles are the three they were', () => {
  const ok = validatePhrase({ kind: 'extend', source: 'bar_101', bars: 10, style: 'repeat' });
  assert.deepEqual(ok, { ok: true, value: { kind: 'extend', source: 'bar_101', bars: 10, style: 'repeat', tempo_change_pct: 0 } });
  const slow = validatePhrase({ kind: 'extend', source: 'bar_101', bars: 10, style: 'repeat', tempo_change_pct: -20 });
  assert.equal(slow.ok, false); if (!slow.ok) assert.match(slow.message, /plain repeat keeps the tempo.*That works on beats, not on notes/);
  const bad = validatePhrase({ kind: 'extend', source: 'bar_005', bars: 4, style: 'nope' });
  assert.equal(bad.ok, false); if (!bad.ok) assert.equal(bad.message, `style must be one of ${PHRASE_STYLES.join(', ')}, got "nope".`);
  assert.deepEqual([...PHRASE_STYLES], ['repeat_with_fills', 'building', 'ghost_notes']);
});

test('the note a melody phrase writes: Description, Recipe, Python and a front matter that says `melody: true`; it reads back, and what the json says is what the Description says', () => {
  const text = note(REPEAT);
  assert.match(text, /^---\ntype: data\ncontent_type: json\n/);
  assert.match(text, /\nmelody: true\n/);
  assert.match(text, /# Description\n\nRepeat \[\[bar_101\]\] for 10 bars\.\n/);
  assert.match(text, /# Recipe\n\nTake \[\[bar_101\]\]\.\nRepeat it for 10 bars\.\n/);
  assert.match(text, /extend_rhythm\(data=base, bars=10, style='repeat', tempo_change_pct=0\)/);
  assert.equal(phraseDescription('phrase_101', REPEAT), 'phrase_101 — [[bar_101]] repeated for 10 bars.');
  assert.deepEqual(phraseLinks(REPEAT), ['bar_101']);
  const read = readPhraseNote(text); assert.equal(read.ok, true); if (read.ok) assert.deepEqual(read.value, REPEAT);
  assert.equal(note(REPEAT), text, 'writing it twice is the same text');
  const again = renderPhraseNote(text, 'phrase_101', REPEAT, text.indexOf('```json'));
  assert.equal(again, text, 'a rewrite keeps ONE melody line');
});

test('the mark follows the params: a note that stops being a melody phrase loses it; a rhythm phrase never has it and its text is untouched', () => {
  const text = note(REPEAT);
  const fence = text.indexOf('```json');
  const rhythm: ExtendPhrase = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
  const turned = renderPhraseNote(text, 'phrase_101', rhythm, fence);
  assert.doesNotMatch(turned, /^melody:/m);
  assert.doesNotMatch(note(rhythm, 'phrase_002'), /melody/);
  for (const [name, original] of Object.entries(PLAYGROUND_PHRASES)) {
    const r = refreshPhraseNoteText(original, name);
    assert.equal(r.ok, true, name); if (r.ok) assert.doesNotMatch(r.text, /^melody:/m, `${name}: a rhythm phrase is never marked`);
  }
});

test('the Recipe reads back: "Take [[bar]]. Repeat it for N bars." is the same phrase; the Python reads back too; the Description says what the params say', () => {
  const steps = renderRecipe(REPEAT);
  assert.equal(steps, 'Take [[bar_101]].\nRepeat it for 10 bars.');
  const r = parseRecipe(steps, V); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.params, canonical(REPEAT));
  const withForks: ExtendPhrase = { ...REPEAT, overrides: { 2: 'bars/bar_102' } };
  const r2 = parseRecipe(renderRecipe(withForks), V); assert.equal(r2.ok, true); if (r2.ok) assert.deepEqual(r2.params, canonical(withForks));
  const py = parsePython(renderPython(REPEAT)); assert.equal(py.ok, true); if (py.ok) assert.deepEqual(py.params, canonical(REPEAT));
  const py2 = parsePython(renderPython(withForks)); assert.equal(py2.ok, true); if (py2.ok) assert.deepEqual(py2.params, canonical(withForks));
  assert.equal(describe(REPEAT), 'Repeat [[bar_101]] for 10 bars.');
  assert.deepEqual(phraseRecipeSteps(withForks), ['Take [[bar_101]].', 'Repeat it for 10 bars.', 'Bar 2 is replaced by [[bar_102]].']);
  assert.match(phrasePython(withForks), /bars\[1\] = bar_102\(\)/);
});

// ---- the Score of a melody phrase, the engine stood in for -------------------------------------------------------------------------------------------------------------------------------------------------
const payload = (bars: unknown[] = []) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: bars });
function rig(files: Record<string, string>) {
  const asked: Array<{ data: any; params: any }> = [];
  return { asked, deps: { readNote: async (p: string) => { if (!(p in files)) throw new Error('File not found'); return files[p]; }, compute: async (data: unknown, params: unknown) => { asked.push({ data: JSON.parse(JSON.stringify(data)), params: JSON.parse(JSON.stringify(params)) }); return payload(); } } };
}

test('producePhrase of a melody phrase: the melody bar is read (no channels), the engine gets its data and the repeat; a fork that is a melody bar is read the same way and laid over', async () => {
  const r = rig({ 'bars/bar_101.md': melodyBar(), 'bars/bar_102.md': melodyBar([{ step: 1, pitch: 'A3', length: 2 }]) });
  const out = await producePhrase(r.deps, { ...REPEAT, bars: 3, overrides: { 2: 'bars/bar_102' } }, 'phrase_101');
  assert.equal(out.kind, 'score');
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.asked[0].data.notes, [{ step: 1, pitch: 'G3', length: 1 }]); assert.equal('channels' in r.asked[0].data, false);
  assert.equal(r.asked[0].params.style, 'repeat'); assert.equal(r.asked[0].params.bars, 3);
  assert.deepEqual(r.asked[0].params.override_bars['2'].notes, [{ step: 1, pitch: 'A3', length: 2 }]);
});

test('a melody phrase refuses, in plain words and without asking the engine: a rhythm bar as its source, a fork of the other kind, a fork on another grid; a rhythm phrase with a melody source or fork the same', async () => {
  const r = rig({ 'bars/bar_101.md': melodyBar(), 'bars/bar_001.md': PLAYGROUND_BARS['bar_001'], 'bars/bar_103.md': melodyBar().replace('"steps": 16', '"steps": 8') });
  const a = await producePhrase(r.deps, { ...REPEAT, source: 'bar_001' }, 'p'); assert.equal(a.kind, 'refusal'); assert.match((a as any).message, /a plain repeat is for melody bars, and bar_001 is a rhythm bar/);
  const b = await producePhrase(r.deps, { ...REPEAT, overrides: { 2: 'bars/bar_001' } }, 'p'); assert.equal(b.kind, 'refusal'); assert.match((b as any).message, /bar 2 \(bars\/bar_001\) is a rhythm bar, and a phrase is all rhythm bars or all melody bars/);
  const c = await producePhrase(r.deps, { ...REPEAT, overrides: { 2: 'bars/bar_103' } }, 'p'); assert.equal(c.kind, 'refusal'); assert.match((c as any).message, /bar 2 \(bars\/bar_103\) differs from the source bar_101 in steps/);
  const d = await producePhrase(r.deps, { kind: 'extend', source: 'bar_101', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, 'p'); assert.equal(d.kind, 'refusal'); assert.match((d as any).message, /That works on beats, not on notes\. bar_101 is a melody bar.*Repeat \[\[bar_101\]\] for 4 bars/);
  const e = await producePhrase(r.deps, { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { 2: 'bars/bar_101' } }, 'p'); assert.equal(e.kind, 'refusal'); assert.match((e as any).message, /bar 2 \(bars\/bar_101\) is a melody bar, and a phrase is all rhythm bars or all melody bars/);
  for (const m of [a, b, c, d, e]) assert.doesNotMatch((m as any).message, /Not rhythm data|channels|Beat Box|Rhythm Box/);
  assert.equal(r.asked.length, 0, 'the engine was never asked');
});

test('a hand-written Mix or Morph over a melody bar (the json edited by hand) is refused at draw time in plain words too, never as "Not rhythm data"', async () => {
  const r = rig({ 'bars/bar_101.md': melodyBar(), 'bars/bar_102.md': melodyBar() });
  for (const p of [{ kind: 'mix', a: 'bar_101', b: 'bar_102', weight: 0.5, threshold: 0.5, ghost: false }, { kind: 'morph', a: 'bar_101', b: 'bar_102', bars: 4, order: 'musical', seed: 0 }] as PhraseParams[]) {
    const out = await producePhrase(r.deps, p, 'p');
    assert.equal(out.kind, 'refusal'); assert.match((out as any).message, /That works on beats, not on notes\./); assert.doesNotMatch((out as any).message, /Not rhythm data|channels/);
  }
  assert.equal(r.asked.length, 0);
});

test('a melody phrase with steps: the head is asked for, the bars it made go through Keep and friends in TypeScript, and what is left goes back as a take with no density change', async () => {
  const bars = [1, 2, 3, 4].map((n) => ({ time_signature: '4/4', steps: 16, group_size: 4, tempo_bpm: 100, instrument: 'cello', notes: [{ step: 1, pitch: 'G3', length: n }] }));
  const asked: any[] = [];
  const deps = { readNote: async () => melodyBar(), compute: async (data: any, params: any) => { asked.push({ data, params }); return payload(params.kind === 'extend' ? bars : data.bars); } };
  const out = await producePhrase(deps, { ...REPEAT, bars: 4, ops: [{ op: 'keep', runs: [[2, 3]] }] }, 'p');
  assert.equal(out.kind, 'score');
  assert.equal(asked.length, 2, 'the head, then the kept bars');
  assert.equal(asked[1].params.kind, 'transform'); assert.deepEqual(asked[1].data.bars.map((b: any) => b.notes[0].length), [2, 3]);
  assert.deepEqual((out as any).payload.forge_steps, { head: 4 });
});

// ---- P3 -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('P3: producePhrase of a rhythm phrase asks the engine exactly what it asked: the bar as rhythm data, the params as they are, no melody key', async () => {
  const r = rig({ 'bars/bar_001.md': PLAYGROUND_BARS['bar_001'] });
  const p: ExtendPhrase = { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: -20 };
  const out = await producePhrase(r.deps, p, 'phrase_001');
  assert.equal(out.kind, 'score'); assert.equal(r.asked.length, 1);
  assert.deepEqual(r.asked[0].params, p); assert.ok('channels' in r.asked[0].data);
  assert.equal(formatPhraseJson(p).includes('repeat'), true, 'repeat_with_fills contains the word, the style does not change');
  assert.equal(JSON.parse(formatPhraseJson(p)).style, 'repeat_with_fills');
});

test('the escape routes of 1a are closed in words: New phrase, New mix and New morph from a melody bar are stopped BEFORE anything is written, by the pre-write check, in the one plain sentence', async () => {
  const files: Record<string, string> = { 'bars/bar_101.md': melodyBar(), 'bars/bar_102.md': melodyBar() };
  const check = makeNotePreflight({ readNote: async (p: string) => { if (!(p in files)) throw new Error('File not found'); return files[p]; }, compute: async () => payload(), computeArrangement: async () => payload(), computeComposition: async () => payload() } as never);
  const extend = await check('phrases/phrase_103.md', noteContentFor('phrase_103', { kind: 'extend', source: 'bar_101', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }));
  assert.match(extend ?? '', /^That works on beats, not on notes\. bar_101 is a melody bar, so it is repeated as it is: "Repeat \[\[bar_101\]\] for 4 bars\."/);
  const mix = await check('phrases/phrase_104.md', mixNoteContent('phrase_104', 'bar_101', 'bar_102'));
  assert.match(mix ?? '', /^That works on beats, not on notes\./);
  assert.doesNotMatch(`${extend}${mix}`, /Not rhythm data|channels|Beat Box/);
  assert.equal(await check('phrases/phrase_105.md', note(REPEAT)), null, 'a melody phrase is let through');
});
