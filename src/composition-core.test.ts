// 2026-10-31-1100 (score_first M17b, design 4.14) - the COMPOSITION, the root note of a piece. Proven here, without Obsidian and without the engine (a stand-in joins the bars as compose_sections does; the real engine is
// proven in forge tests/music/test_compose_sections.py and, through Pyodide, in composition-engine.test.ts): the validator, the sentences (exact, tolerant, the round trip is in phrase-grammar-core.test.ts), the note in the
// Forge shape and its writer path (the one M15b made), the Score (every source read fresh and drawn by the code that draws it, repeats expanded, loops and depth refused, the engine's meter refusal in one sentence), a transform
// that takes a composition, and the tab header.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  COMPOSITION_DEPTH_MAX, COMPOSITION_VIEW_TYPE, FORGE_COMPOSITION_KEY, applyCompositionWrite, barSeconds, compositionDescription, compositionHeader, compositionLinks, compositionPython, compositionRecipeSteps, composeRefusal, expandSections,
  formatCompositionJson, isCompositionPath, newCompositionNote, nextCompositionName, phraseDepsWithSources, produceComposition, readCompositionNote, refreshCompositionNoteText, validateComposition,
  type CompositionDeps, type CompositionInput, type CompositionParams, type CompositionShape,
} from './composition-core.ts';
import { describe, parse, canonical, type GrammarVault } from './phrase-grammar-core.ts';
import { noteContentFor, producePhraseNote, type PhraseParams, type PhraseScoreDeps } from './phrase-core.ts';
import { newArrangementNote, type ArrangementInput, type ArrangementParams } from './arrangement-core.ts';
import { newKitNote } from './kit-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { extractDescription } from './v2-note-core.ts';

const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const barData = (n: string): RhythmData => { const r = readRhythmNote(barText(n)); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const SCORE = { type: 'musicxml', content: '<score-partwise/>' };
const ROCK = { kind: 'kit' as const, name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] };
const P = (sections: CompositionParams['sections']): CompositionParams => ({ kind: 'composition', sections });
const VAULT: GrammarVault = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_003', 'phrase_004'], arrangements: ['arr_001'], compositions: ['intro', 'comp_001'], kits: ['rock'] };

/** The engine's compose_sections, stood in for: repeat or cut each section to its length, join in order. */
function standIn(input: CompositionInput): RhythmData[] {
  return input.sections.flatMap((s) => Array.from({ length: s.length ?? s.bars.length }, (_, i) => s.bars[i % s.bars.length]));
}

function world(over: { notes?: Record<string, string | undefined> } = {}) {
  const notes: Record<string, string> = {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'), 'kits/rock.md': newKitNote(ROCK),
    'phrases/phrase_003.md': noteContentFor('phrase_003', { kind: 'extend', source: 'bar_007', bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams),
    'phrases/phrase_004.md': noteContentFor('phrase_004', { kind: 'extend', source: 'bar_008', bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams),
    'arrangements/arr_001.md': newArrangementNote('arr_001', ARR),
  };
  for (const [k, v] of Object.entries(over.notes ?? {})) { if (v === undefined) delete notes[k]; else notes[k] = v; }
  const reads: string[] = [];
  const composed: CompositionInput[] = [];
  const base: Pick<PhraseScoreDeps, 'readNote' | 'compute'> = {
    readNote: async (p) => { reads.push(p); const t = notes[p]; if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data: any, params: any) => {
      if (Array.isArray(data?.bars)) return { ...SCORE, bars_data: data.bars };                                    // a transform: its source's bars (the ops are not under test here)
      return { ...SCORE, bars_data: Array.from({ length: params.bars ?? 1 }, () => data) };                          // an extend: its source bar, `bars` times
    },
  };
  const computeArrangement = async (input: ArrangementInput) => ({ ...SCORE, bars_data: [barData('bar_007'), barData('bar_008')].slice(0, 2).concat(input.tracks.length ? [] : []) });          // an arrangement of two bars
  const computeComposition = async (input: CompositionInput) => { composed.push(input); return { ...SCORE, bars_data: standIn(input) }; };
  const phrases = phraseDepsWithSources(base, { computeArrangement, computeComposition });
  const deps: CompositionDeps = { phrases, compute: computeComposition, computeArrangement };
  return { notes, reads, composed, base, deps, computeArrangement, computeComposition };
}
const comp = (name: string, p: CompositionParams): string => newCompositionNote(name, p);

// ---- the validator ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('validateComposition: a list of 1 to 32 sections, each a phrase, an arrangement or a composition with an optional length (1 to 256) and repeat (1 to 16); anything else is refused in one sentence naming the field', () => {
  const ok = validateComposition({ kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', repeat: 2 }, { source: 'compositions/intro', length: 256, repeat: 16 }] });
  assert.ok(ok.ok);
  const bad = (raw: unknown, message: RegExp): void => { const v = validateComposition(raw); assert.equal(v.ok, false, JSON.stringify(raw)); if (v.ok === false) assert.match(v.message, message, JSON.stringify(raw)); };
  bad(null, /object with a kind and sections/); bad([], /object with a kind and sections/); bad({ kind: 'phrase', sections: [] }, /kind must be "composition"/);
  bad({ kind: 'composition' }, /at least one section/); bad({ kind: 'composition', sections: [] }, /at least one section/);
  bad({ kind: 'composition', sections: [], extra: 1 }, /Unexpected field "extra"/);
  bad({ kind: 'composition', sections: Array.from({ length: 33 }, () => ({ source: 'phrases/phrase_001' })) }, /at most 32 sections, got 33/);
  bad({ kind: 'composition', sections: [3] }, /sections\[0\] must be an object/);
  bad({ kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'bars/bar_001' }] }, /sections\[1\]: the source must be a phrase, an arrangement or a composition note without \.md/);
  bad({ kind: 'composition', sections: [{ source: 'phrases/phrase_001.md' }] }, /sections\[0\]: the source/);
  bad({ kind: 'composition', sections: [{ source: 'phrases/phrase_001', extra: 1 }] }, /sections\[0\]: unexpected field "extra"/);
  for (const length of [0, -1, 257, 1.5, '8', true]) bad({ kind: 'composition', sections: [{ source: 'phrases/phrase_001', length }] }, /sections\[0\]: length must be a whole number of bars from 1 to 256/);
  for (const repeat of [0, 17, 1.5, '2']) bad({ kind: 'composition', sections: [{ source: 'phrases/phrase_001', repeat }] }, /sections\[0\]: repeat must be a whole number of times from 1 to 16/);
});

// ---- the sentences ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('THE SENTENCES (exact): the first section opens with Play, the others with Then play, "for N bars" only when a length is said, "Repeat that N times." after the section it repeats', () => {
  assert.equal(describe(P([{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', length: 4 }, { source: 'compositions/intro' }])),
    'Play [[phrase_003]] for 8 bars. Then play [[arr_001]] for 4 bars. Then play [[intro]].');
  assert.equal(describe(P([{ source: 'phrases/phrase_003', length: 1, repeat: 1 }, { source: 'phrases/phrase_004', repeat: 2 }])),
    'Play [[phrase_003]] for 1 bar. Repeat that 1 time. Then play [[phrase_004]]. Repeat that 2 times.');
  assert.deepEqual(compositionRecipeSteps(P([{ source: 'phrases/phrase_003', length: 8 }, { source: 'phrases/phrase_004', repeat: 2 }])), ['Play [[phrase_003]] for 8 bars.', 'Then play [[phrase_004]].', 'Repeat that 2 times.']);
});

test('TOLERANT: "For 8 bars play [[a]]." is the same section as "Play [[a]] for 8 bars."; number words, any case, % spacing; "Repeat that 1 times." reads (and is said "1 time"); the canonical form is a fixed point', () => {
  const canon = 'Play [[phrase_003]] for 8 bars. Then play [[arr_001]] for 4 bars. Repeat that 2 times.';
  for (const text of [canon, 'For 8 bars play [[phrase_003]]. Then play [[arr_001]] for 4 bars. Repeat that 2 times.', 'FOR eight BARS play [[phrase_003]].\nTHEN PLAY [[arr_001]] FOR four bars.\nrepeat that two times', 'Play phrase_003 for 8 bars. Then play arr_001 for 4 bars. Repeat that 2 time.']) {
    const back = parse(text, VAULT);
    assert.ok(back.ok, `${text}: ${JSON.stringify(!back.ok && back.error)}`);
    if (back.ok) { assert.equal(describe(back.params), canon, text); assert.deepEqual(back.params, canonical(back.params)); }
  }
  const once = parse('Play [[phrase_003]]. Repeat that 1 times.', VAULT);
  assert.ok(once.ok && describe(once.params) === 'Play [[phrase_003]]. Repeat that 1 time.');
});

test('an arrangement is still an arrangement and a composition is a composition: "Play [[a phrase]] on the [[a kit]] kit." never reads as a one-section composition, and "Play [[a]]." alone is one', () => {
  const arr = parse('Play [[phrase_003]] on the [[rock]] kit. Together.', VAULT);
  assert.ok(arr.ok && arr.params.kind === 'arrangement');
  const one = parse('Play [[phrase_003]].', VAULT);
  assert.ok(one.ok && one.params.kind === 'composition');
  assert.deepEqual(one.ok && one.params, { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] });
  const mixed = parse('Play [[phrase_003]] on the [[rock]] kit. Together. Then play [[arr_001]] for 4 bars.', VAULT);
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.match(mixed.error.message, /"Then play" belongs to a composition/);
});

test('a name in two lists is two readings and is refused; a composition named like a phrase is not guessed', () => {
  const both: GrammarVault = { ...VAULT, compositions: ['phrase_003'] };
  const r = parse('Play [[phrase_003]] for 8 bars.', both);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /"phrase_003" is both a phrase and a composition; rename one of them\./);
});

// ---- the note -----------------------------------------------------------------------------------------------------------------------------------------------------------

const SECTIONS = P([{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', length: 4, repeat: 2 }]);

test('the note is in the Forge shape through the ONE writer path: # Description is describe(params), the Recipe the same sentences, the Python calls each source and returns compose_sections, ONE json cache; the six stamps say source Description', () => {
  const text = comp('comp_001', SECTIONS);
  assert.equal(extractDescription(text), describe(SECTIONS));
  assert.match(text, /^---\ntype: data\ncontent_type: json\n/);
  assert.match(text, /\nlinks:\n  - "\[\[phrase_003\]\]"\n  - "\[\[arr_001\]\]"\n/);
  assert.match(text, /\ndescription: "comp_001 — a piece of 2 sections: \[\[phrase_003\]\] for 8 bars, then \[\[arr_001\]\] for 4 bars, 2 more times\."\n/);
  for (const key of ['source_facet: description', 'description_hash:', 'recipe_hash:', 'python_hash:', 'recipe_derived_from_description_hash:', 'python_derived_from_recipe_hash:']) assert.ok(text.includes(key), key);
  assert.match(text, /\n# Recipe\n\nPlay \[\[phrase_003\]\] for 8 bars\.\nThen play \[\[arr_001\]\] for 4 bars\.\nRepeat that 2 times\.\n/);
  assert.match(text, /\n# Cache\n/);
  assert.equal((text.match(/```json/g) ?? []).length, 1);
  assert.deepEqual(readCompositionNote(text), { ok: true, value: SECTIONS });
  const py = compositionPython(SECTIONS);
  assert.deepEqual(py.split('\n'), [
    'def compute(context):', '  sections = []',
    "  sections.append({'source': 'phrase_003', 'bars': phrase_003(), 'length': 8})",
    "  sections.append({'source': 'arr_001', 'bars': arr_001(), 'length': 4})",
    "  sections.append({'source': 'arr_001', 'bars': arr_001(), 'length': 4})",
    "  sections.append({'source': 'arr_001', 'bars': arr_001(), 'length': 4})",
    '  bars = compose_sections(sections=sections)', '  return bars', '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ]);
  assert.ok(!py.includes('`'), 'no backtick in the Python text');
});

test('the controls\' write equals a new note of those params (byte for byte), refreshing is idempotent, and a Description edited by hand is never overwritten', () => {
  const start = comp('comp_001', P([{ source: 'phrases/phrase_003' }]));
  const w = applyCompositionWrite(start, 'comp_001', SECTIONS);
  assert.ok(w.ok && w.text === comp('comp_001', SECTIONS));
  const again = refreshCompositionNoteText(comp('comp_001', SECTIONS), 'comp_001');
  assert.ok(again.ok && again.changed === false);
  const edited = comp('comp_001', SECTIONS).replace('# Description\n\nPlay [[phrase_003]] for 8 bars.', '# Description\n\nPlay [[phrase_003]] for 9 bars.');
  assert.notEqual(edited, comp('comp_001', SECTIONS), 'the Description section was edited');
  const refused = applyCompositionWrite(edited, 'comp_001', P([{ source: 'phrases/phrase_004' }]));
  assert.deepEqual(refused, { ok: false, message: 'Not saved: the Description was edited by hand; press Update from Description first or revert it.' });
  const refusedRefresh = refreshCompositionNoteText(edited, 'comp_001');
  assert.deepEqual(refusedRefresh, { ok: false, message: 'The Description was edited by hand; press Update from Description first or revert it.' });
});

test('the json is the cache: a note with a broken or missing fence is a refusal naming it, and the paths and names behave', () => {
  const r = readCompositionNote('---\ntype: data\n---\n\nno fence here\n');
  assert.equal(r.ok, false);
  assert.equal(readCompositionNote(comp('x', SECTIONS).replace('"composition"', '"phrase"')).ok, false);
  assert.ok(isCompositionPath('compositions/intro.md') && !isCompositionPath('compositions/README.md') && !isCompositionPath('compositions/a/b.md') && !isCompositionPath('phrases/phrase_001.md'));
  assert.equal(nextCompositionName(() => false), 'comp_001');
  assert.equal(nextCompositionName((p) => p === 'compositions/comp_001.md' || p === 'compositions/comp_002.md'), 'comp_003');
  assert.deepEqual(compositionLinks(P([{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_003' }, { source: 'compositions/intro' }])), ['phrase_003', 'intro']);
  assert.equal(formatCompositionJson(SECTIONS), '{\n  "kind": "composition",\n  "sections": [\n    {"source": "phrases/phrase_003", "length": 8},\n    {"source": "arrangements/arr_001", "length": 4, "repeat": 2}\n  ]\n}');
  assert.deepEqual(expandSections(SECTIONS).map((s) => [s.index, s.copy, s.source, s.length]), [[0, 0, 'phrases/phrase_003', 8], [1, 0, 'arrangements/arr_001', 4], [1, 1, 'arrangements/arr_001', 4], [1, 2, 'arrangements/arr_001', 4]]);
});

// ---- the Score ----------------------------------------------------------------------------------------------------------------------------------------------------------

test('the Score: each source is read FRESH and drawn by the code that draws it (a phrase by the phrase code, an arrangement by the arrangement code), a repeated section is drawn ONCE and handed to the engine as many times as it plays, and the engine joins them', async () => {
  const w = world();
  const out = await produceComposition(w.deps, comp('comp_001', SECTIONS), 'comp_001');
  assert.equal(out.kind, 'score');
  assert.equal(w.composed.length, 1);
  assert.deepEqual(w.composed[0].sections.map((s) => [s.source, s.bars.length, s.length]), [['phrases/phrase_003', 3, 8], ['arrangements/arr_001', 2, 4], ['arrangements/arr_001', 2, 4], ['arrangements/arr_001', 2, 4]]);
  assert.equal(w.reads.filter((p) => p === 'arrangements/arr_001.md').length, 1, 'the arrangement was read once');
  if (out.kind !== 'score') return;
  assert.equal((out.payload.bars_data as unknown[]).length, 8 + 4 * 3);
  const shape = out.payload[FORGE_COMPOSITION_KEY] as CompositionShape;
  assert.deepEqual(shape.sections.map((s) => [s.index, s.copy, s.source, s.bars, s.first]), [[0, 0, 'phrases/phrase_003', 8, 1], [1, 0, 'arrangements/arr_001', 4, 9], [1, 1, 'arrangements/arr_001', 4, 13], [1, 2, 'arrangements/arr_001', 4, 17]]);
});

test('a section with no length is all the bars of its note, once', async () => {
  const w = world();
  const out = await produceComposition(w.deps, comp('comp_001', P([{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_004' }])), 'comp_001');
  assert.equal(out.kind, 'score');
  if (out.kind === 'score') assert.equal((out.payload.bars_data as unknown[]).length, 3 + 2);
});

test('a section that is a COMPOSITION is drawn by the composition code, one level deeper', async () => {
  const w = world({ notes: { 'compositions/intro.md': comp('intro', P([{ source: 'phrases/phrase_004', length: 6 }])) } });
  const out = await produceComposition(w.deps, comp('comp_001', P([{ source: 'compositions/intro' }, { source: 'phrases/phrase_003', length: 1 }])), 'comp_001');
  assert.equal(out.kind, 'score');
  if (out.kind === 'score') assert.equal((out.payload.bars_data as unknown[]).length, 6 + 1);
  assert.equal(w.composed.length, 2, 'the inner composition was asked of the engine, then the outer');
});

test('REFUSED in one sentence that names it: a missing note, an unusable note, an unreadable composition, a loop (a composition that plays itself, directly or through another), a chain deeper than the limit', async () => {
  const w = world();
  const one = async (name: string, p: CompositionParams, extra: Record<string, string> = {}): Promise<string> => {
    const ww = world({ notes: extra });
    const out = await produceComposition(ww.deps, comp(name, p), name);
    assert.equal(out.kind, 'refusal', JSON.stringify(out));
    return out.kind === 'refusal' ? out.message : '';
  };
  assert.equal(await one('comp_001', P([{ source: 'phrases/phrase_099' }])), 'Composition: the phrase phrase_099 (phrases/phrase_099.md) was not found or could not be read (File not found).');
  assert.match(await one('comp_001', P([{ source: 'phrases/phrase_003' }]), { 'phrases/phrase_003.md': '---\ntype: data\n---\nnothing\n' }), /^Composition: the phrase phrase_003 is not usable: /);
  assert.match(await one('comp_001', P([{ source: 'compositions/intro' }]), { 'compositions/intro.md': '---\ntype: data\n---\nnothing\n' }), /^Composition: the composition intro could not be drawn: Composition: /);
  assert.equal(await one('comp_001', P([{ source: 'compositions/comp_001' }]), {}), `Composition: the composition comp_001 loops back to this composition or is nested more than ${COMPOSITION_DEPTH_MAX} deep.`);
  const a = comp('a', P([{ source: 'compositions/b' }])), b = comp('b', P([{ source: 'compositions/a' }]));
  assert.match(await one('a', P([{ source: 'compositions/b' }]), { 'compositions/b.md': b, 'compositions/a.md': a }), /loops back to this composition/);
  const chain: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) chain[`compositions/n${i}.md`] = comp(`n${i}`, P([{ source: i < 8 ? `compositions/n${i + 1}` : 'phrases/phrase_003' }]));
  assert.match(await one('top', P([{ source: 'compositions/n1' }]), chain), /nested more than 6 deep/);
  void w;
});

test('two sections the engine will not join (another meter) are a refusal carrying the engine\'s own sentence, not a thrown error', async () => {
  const w = world();
  const deps: CompositionDeps = { ...w.deps, compute: async () => { throw new Error('Traceback (most recent call last):\n  File "<exec>", line 1\nValueError: compose_sections: section 2 bar 1 has time_signature \'3/4\' but section 1 has \'4/4\'; all sections must share the same meter and steps'); } };
  const out = await produceComposition(deps, comp('comp_001', SECTIONS), 'comp_001');
  assert.deepEqual(out, { kind: 'refusal', message: "Composition: compose_sections: section 2 bar 1 has time_signature '3/4' but section 1 has '4/4'; all sections must share the same meter and steps" });
  assert.equal(composeRefusal('boom'), null);
  assert.equal(composeRefusal('ValueError: compose_sections_lineage: section 2 bar 1 has steps 8 but section 1 has 16'), 'compose_sections_lineage: section 2 bar 1 has steps 8 but section 1 has 16');
  const broken: CompositionDeps = { ...w.deps, compute: async () => { throw new Error('the engine is not available'); } };
  const err = await produceComposition(broken, comp('comp_001', SECTIONS), 'comp_001');
  assert.equal(err.kind, 'error');
});

test('an unreadable note and a note that is not a composition are refusals', async () => {
  const w = world();
  assert.deepEqual(await produceComposition(w.deps, { unreadable: 'gone' }, 'x'), { kind: 'refusal', message: 'Composition: the composition note could not be read (gone).' });
  const out = await produceComposition(w.deps, comp('x', SECTIONS).replace('"sections"', '"parts"'), 'x');
  assert.equal(out.kind, 'refusal');
});

test('a TRANSFORM may take a composition (Take [[intro]].): the composition is drawn by the composition code and its bars are what the ops change; a surface with no way to draw one says so', async () => {
  const w = world({ notes: { 'compositions/intro.md': comp('intro', P([{ source: 'phrases/phrase_004', length: 4 }])) } });
  const note = noteContentFor('phrase_010', { kind: 'transform', source: 'compositions/intro', ops: [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }] } as PhraseParams);
  const out = await producePhraseNote(w.deps.phrases, note, 'phrase_010');
  assert.equal(out.kind, 'score');
  assert.equal(w.composed.length, 1);
  const without = await producePhraseNote({ readNote: w.base.readNote, compute: w.base.compute }, note, 'phrase_010');
  assert.deepEqual(without, { kind: 'refusal', message: 'Phrase: the source composition intro cannot be drawn here (this surface has no way to draw a composition).' });
  const loop = world({ notes: { 'compositions/intro.md': comp('intro', P([{ source: 'phrases/phrase_010' }])), 'phrases/phrase_010.md': note } });
  const looped = await producePhraseNote(loop.deps.phrases, note, 'phrase_010');
  assert.equal(looped.kind, 'refusal');
});

// ---- the tab header -----------------------------------------------------------------------------------------------------------------------------------------------------

test('the header says "<N> sections, <B> bars, <t> min" from the sections and the bars the Score has (each at its own tempo)', () => {
  const bar = (tempo: number, ts = '4/4'): RhythmData => ({ ...barData('bar_007'), tempo_bpm: tempo, time_signature: ts });
  assert.equal(barSeconds(bar(120)), 2);
  assert.equal(barSeconds(bar(60, '3/4')), 3);
  assert.equal(barSeconds(bar(120, '6/8')), 1.5);
  assert.equal(barSeconds({ ...bar(120), tempo_bpm: 0 }), 0);
  assert.equal(compositionHeader(P([{ source: 'phrases/phrase_003' }]), null), '1 section');
  assert.equal(compositionHeader(SECTIONS, Array.from({ length: 30 }, () => bar(120))), '2 sections, 30 bars, 1.0 min');
  assert.equal(compositionHeader(P([{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_004' }]), [bar(120), bar(60)]), '2 sections, 2 bars, 0.1 min');
  assert.equal(compositionHeader(P([{ source: 'phrases/phrase_003' }]), [bar(240)]), '1 section, 1 bar, <0.1 min');
});

// ---- 2026-10-31-1100 mutation pass B: the branches the first tests did not pin ------------------------------------------------------------------------------------------

test('the view type, the 32-section limit (32 fine, 33 refused), and a section that is not an object is said so, whatever it is', () => {
  assert.equal(COMPOSITION_VIEW_TYPE, 'forge-composition-view');
  const many = (n: number) => P(Array.from({ length: n }, () => ({ source: 'phrases/phrase_003' })));
  assert.equal(validateComposition(many(32)).ok, true);
  const over = validateComposition(many(33));
  assert.deepEqual(over, { ok: false, message: 'A composition holds at most 32 sections, got 33.' });
  for (const bad of [null, 'x', 5, [], [1]]) {
    assert.deepEqual(validateComposition({ kind: 'composition', sections: [bad] }), { ok: false, message: 'sections[0] must be an object with a source and, optionally, a length and a repeat.' }, JSON.stringify(bad));
  }
});

test('the Description says "once more" for a repeat of 1 and "N more times" otherwise, and "one section" for a single section', () => {
  assert.equal(compositionDescription('c', P([{ source: 'phrases/phrase_003', repeat: 1 }])), 'c — a piece of one section: [[phrase_003]], once more.');
  assert.equal(compositionDescription('c', P([{ source: 'phrases/phrase_003', length: 1, repeat: 3 }, { source: 'phrases/phrase_004' }])), 'c — a piece of 2 sections: [[phrase_003]] for 1 bar, 3 more times, then [[phrase_004]].');
});

test('reading a note: a broken json block is a sentence from JSON.parse, a missing fence is the extractor\'s sentence, and refresh and write say the same', () => {
  const broken = comp('x', SECTIONS).replace('"kind": "composition",', '"kind": "composition" "oops",');
  const read = readCompositionNote(broken);
  assert.ok(read.ok === false && /^The json block is not valid JSON: .+/.test(read.message), JSON.stringify(read));
  const refresh = refreshCompositionNoteText(broken, 'x');
  assert.deepEqual(refresh, { ok: false, message: read.ok === false ? read.message : '' });
  const nofence = '---\ntype: data\n---\n\nno fence here\n';
  const missing = readCompositionNote(nofence);
  assert.ok(missing.ok === false && missing.message.length > 0);
  assert.deepEqual(refreshCompositionNoteText(nofence, 'x'), { ok: false, message: missing.ok === false ? missing.message : '' });
  assert.deepEqual(applyCompositionWrite(nofence, 'x', SECTIONS), { ok: false, message: missing.ok === false ? missing.message : '' });
});

test('"changed" is true when the write changes the note and false when it writes what is there', () => {
  const start = comp('comp_001', P([{ source: 'phrases/phrase_003' }]));
  const w = applyCompositionWrite(start, 'comp_001', SECTIONS);
  assert.ok(w.ok && w.changed === true);
  const same = applyCompositionWrite(comp('comp_001', SECTIONS), 'comp_001', SECTIONS);
  assert.ok(same.ok && same.changed === false);
  const stale = comp('comp_001', SECTIONS).replace('description: ', 'description: stale ');
  const refreshed = refreshCompositionNoteText(stale, 'comp_001');
  assert.ok(refreshed.ok);
  assert.equal(refreshed.ok && refreshed.changed, refreshed.ok && refreshed.text !== stale);
});

test('the nesting limit is exact: the chain (the top, what it nests and the note at the end) holds six notes', async () => {
  const chainOf = (n: number): Record<string, string> => {
    const notes: Record<string, string> = {};
    for (let i = 1; i <= n; i++) notes[`compositions/n${i}.md`] = comp(`n${i}`, P([{ source: i < n ? `compositions/n${i + 1}` : 'phrases/phrase_003' }]));
    return notes;
  };
  const draw = async (n: number) => { const w = world({ notes: chainOf(n) }); return produceComposition(w.deps, comp('top', P([{ source: 'compositions/n1' }])), 'top'); };
  assert.equal((await draw(4)).kind, 'score', 'top, four compositions and the phrase they play: six notes in the chain');
  assert.equal((await draw(5)).kind, 'refusal', 'one more is a seventh');
});

test('a source whose drawing has no bars is a refusal that says so', async () => {
  const w = world();
  const noBars: CompositionDeps = { ...w.deps, phrases: { ...w.deps.phrases, compute: async () => ({ ...SCORE }) } };
  const out = await produceComposition(noBars, comp('x', P([{ source: 'phrases/phrase_003' }])), 'x');
  assert.deepEqual(out, { kind: 'refusal', message: 'Composition: the phrase phrase_003 gave no bars to play.' });
});

test('the chain: none given or an empty one starts at the composition itself; one given is used as it is', async () => {
  const w = world({ notes: { 'compositions/x.md': comp('x', P([{ source: 'compositions/x' }])), 'compositions/a.md': comp('a', P([{ source: 'phrases/phrase_003' }])) } });
  const loops = `Composition: the composition x loops back to this composition or is nested more than ${COMPOSITION_DEPTH_MAX} deep.`;
  assert.deepEqual(await produceComposition({ ...w.deps }, comp('x', P([{ source: 'compositions/x' }])), 'x'), { kind: 'refusal', message: loops });
  assert.deepEqual(await produceComposition({ ...w.deps, chain: [] }, comp('x', P([{ source: 'compositions/x' }])), 'x'), { kind: 'refusal', message: loops }, 'an empty chain is no chain');
  const given = await produceComposition({ ...w.deps, chain: ['compositions/a'] }, comp('b', P([{ source: 'compositions/a' }])), 'b');
  assert.deepEqual(given, { kind: 'refusal', message: 'Composition: the composition a loops back to this composition or is nested more than 6 deep.' }, 'the chain given is the chain used');
});

test('an error that is not one of the engine\'s compose_sections sentences is an error that says what it was, never a refusal', async () => {
  const w = world();
  const broken: CompositionDeps = { ...w.deps, compute: async () => { throw new Error('the engine is not available'); } };
  const err = await produceComposition(broken, comp('c', SECTIONS), 'c');
  assert.equal(err.kind, 'error');
  assert.match(err.kind === 'error' ? err.message : '', /the engine is not available/);
});

test('the header: nothing but the sections for no bars, the bars and minutes for one bar; a bar that cannot be timed counts for nothing', () => {
  const bar = (tempo: unknown, ts = '4/4'): RhythmData => ({ ...barData('bar_007'), tempo_bpm: tempo as number, time_signature: ts });
  assert.equal(compositionHeader(SECTIONS, []), '2 sections');
  assert.equal(compositionHeader(SECTIONS, [bar(120)]), '2 sections, 1 bar, <0.1 min');
  assert.equal(compositionHeader(SECTIONS, Array.from({ length: 14 }, () => bar(240))), '2 sections, 14 bars, 0.2 min', 'the minutes are the sum of the bars, nothing added');
  assert.equal(barSeconds(bar(1)), 240);
  assert.equal(barSeconds(bar(0.5)), 480);
  assert.equal(barSeconds(bar(-5)), 0);
  assert.equal(barSeconds(bar(null)), 0);
  assert.equal(barSeconds(bar('fast')), 0);
  assert.equal(barSeconds(bar(120, 'four-four')), 0);
});

// ---- 2026-10-31-1100 mutation pass C: the grammar and the describer of a composition ------------------------------------------------------------------------------------------

test('canonical and the sentences: a repeat of 0 is no repeat, 1 is "Repeat that 1 time." and more is "N times."', () => {
  const c = canonical({ kind: 'composition', sections: [{ source: 'phrases/phrase_003', repeat: 0 }, { source: 'phrases/phrase_004', repeat: 1 }, { source: 'phrases/phrase_004' }] } as CompositionParams);
  assert.deepEqual((c as CompositionParams).sections, [{ source: 'phrases/phrase_003' }, { source: 'phrases/phrase_004', repeat: 1 }, { source: 'phrases/phrase_004' }]);
  assert.deepEqual(compositionRecipeSteps(P([{ source: 'phrases/phrase_003', repeat: 1 }, { source: 'phrases/phrase_004', repeat: 2 }])), ['Play [[phrase_003]].', 'Repeat that 1 time.', 'Then play [[phrase_004]].', 'Repeat that 2 times.']);
});

test('the grammar of a composition says exactly what is wrong, and where: a word after "Repeat that N times", "For N bars" without "play", a first sentence that is not a composition\'s but a later one is, and a mistake at the very start', () => {
  const at = (text: string) => { const r = parse(text, VAULT); return r.ok ? null : [r.error.message, r.error.line, r.error.column]; };
  assert.deepEqual(at('Play [[phrase_003]] for 8 bars. Repeat that 2 times please.'), ['Expected the end of the sentence, but found "please".', 1, 53]);
  assert.deepEqual(at('Play [[phrase_003]] for 8 bars. For 4 bars [[phrase_004]].'), ['Expected "play", but found "[[phrase_004]]".', 1, 44]);
  assert.deepEqual(at('Play [[phrase_003]] twice. Then play [[arr_001]] for 4 bars.'), ['Expected the end of the sentence, but found "twice".', 1, 21], 'a composition-only second sentence makes the description a composition\'s');
  assert.deepEqual(at('Play [[phrase_003]] twice.'), ['Expected "on the", but found "twice".', 1, 21], 'alone it is read as an arrangement\'s first sentence');
  assert.deepEqual(at('Banana.'), ['Expected a description that starts with Extend, Mix, Morph, Take or Play, but found "Banana".', 1, 1]);
  assert.deepEqual(at('Play [[phrase_003]] for 8 bars. Repeat that 2 times. Repeat that 3 times.'), ['Expected "Repeat that" to be said once for a section, but it is said twice.', 1, 54]);
});
