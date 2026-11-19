// 2026-11-19-0960 (item 2) - a sentence-driven note (phrase, arrangement, composition) STARTS EMPTY: an empty Description, an empty Recipe, an empty Python, an empty json cache and no starter content at all; it has no kind until its
// first applied sentence. The pure half (empty-note-core.ts): the three starters, the one test "is this note empty", the stamps (an empty note is not "edited by hand", so nothing offers to update or revert it), the producers
// (an empty note draws NOTHING, says nothing and asks the engine nothing), the preflight (an empty note is never refused), and the first sentence (it makes the kind and fills every facet by the same writers the controls use).
// The tabs, the New actions and the composer are in new-notes-start-empty.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote, isEmptyNote } from './empty-note-core.ts';
import { applyDescriptionText, cacheParams, descriptionState } from './description-apply-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';
import { editedFacetsOf } from './python-apply-core.ts';
import { extractPhraseJsonBlock, handEditRefusalOf, pythonTextOf } from './phrase-notes-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, producePhraseNote, readPhraseKind, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote, produceArrangement, readArrangementNote, refreshArrangementNoteText } from './arrangement-core.ts';
import { newCompositionNote, produceComposition, readCompositionNote, refreshCompositionNoteText } from './composition-core.ts';
import { describe } from './phrase-describe-core.ts';
import { makeNotePreflight } from './note-preflight-core.ts';
import { refreshPhraseNoteText } from './phrase-core.ts';

const VAULT = { bars: ['bar_005', 'bar_006'], phrases: ['phrase_001'], arrangements: ['arr_001'], compositions: [], kits: ['rock'] };
type Family = 'phrase' | 'arrangement' | 'composition';
const STARTERS: Array<[Family, string, string]> = [
  ['phrase', 'phrases/phrase_001.md', emptyPhraseNote('phrase_001')],
  ['arrangement', 'arrangements/arr_001.md', emptyArrangementNote('arr_001')],
  ['composition', 'compositions/comp_001.md', emptyCompositionNote('comp_001')],
];
const NAME = (p: string): string => p.replace(/^.*\//, '').replace(/\.md$/, '');
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', ...PHRASE_DEFAULTS, bars: 8 };

test('every starter is EMPTY: no Description, no Recipe, no Python, an empty json cache, an empty frontmatter description, and none of the old starter content (no source bar, no track, no section, no sentence)', () => {
  for (const [family, path, text] of STARTERS) {
    const tag = `${family} (${path})`;
    assert.equal(isEmptyNote(text), true, tag);
    assert.equal(extractDescription(text).trim(), '', `${tag}: Description`);
    assert.equal((extractRecipeSection(text) ?? '').trim(), '', `${tag}: Recipe`);
    assert.equal((pythonTextOf(text) ?? '').trim(), '', `${tag}: Python`);
    const block = extractPhraseJsonBlock(text); assert.ok(block.ok, tag);
    assert.deepEqual(JSON.parse(text.slice((block as any).contentStart, (block as any).contentEnd)), {}, `${tag}: the cache is an empty object`);
    const fm = parseFrontmatter(text)!;
    assert.equal(fm.fields.description, '', `${tag}: the frontmatter description is empty`);
    assert.equal(fm.fields.type, 'data'); assert.equal(fm.fields.content_type, 'json');
    assert.doesNotMatch(text, /bar_\d|\bkit\b|tracks|sections|extend|style|repeat_with_fills|\[\[/i, `${tag}: no starter content`);
    assert.doesNotMatch(text, /\n\n\n\n\n/, `${tag}: no run of blank lines`);
  }
});

test('an empty note says it has no kind: readPhraseKind is null, no reader takes it for a valid note, and it is NOT empty once it has a kind or any key', () => {
  const phrase = emptyPhraseNote('phrase_001');
  assert.equal(readPhraseKind(phrase), null);
  assert.equal(readPhraseNote(phrase).ok, false);
  assert.equal(readArrangementNote(emptyArrangementNote('arr_001')).ok, false);
  assert.equal(readCompositionNote(emptyCompositionNote('comp_001')).ok, false);
  const real: string[] = [
    noteContentFor('phrase_001', EXTEND),
    newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] } as any),
    newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] } as any),
    phrase.replace('{}', '{"kind":"extend"}'), phrase.replace('{}', '{"a":1}'), phrase.replace('{}', '{ "kind": "mix" }'),
    phrase.replace('{}', '{not json'), phrase.replace('{}', '[]'), phrase.replace('{}', 'null'),
    'no frontmatter here\n```json\n{}\n```\n', '---\ntype: data\n---\n\nno fence at all\n',
  ];
  for (const t of real) assert.equal(isEmptyNote(t), false, t.slice(0, 80).replace(/\n/g, ' | '));
  assert.equal(isEmptyNote(phrase.replace('{}', '{ }')), true, 'spaces inside the braces are still an empty object');
  assert.equal(isEmptyNote(phrase.replace('{}', '\n{\n}\n')), true);
});

test('an empty note is not "edited by hand": no facet reads as edited, nothing refuses a write, the controller has nothing to say (synced) and nothing to revert', () => {
  for (const [family, , text] of STARTERS) {
    assert.deepEqual(editedFacetsOf(text), [], family);
    assert.equal(handEditRefusalOf(text, false), null, family);
    assert.equal(descriptionState(text, family, VAULT).kind, 'synced', family);
    assert.equal(cacheParams(text, family), null, `${family}: the cache holds no params`);
  }
});

test('"Refresh note links" on an empty note is a quiet no-op (it used to be a refusal because the note has no kind): ok, unchanged, the very same text', () => {
  const p = refreshPhraseNoteText(emptyPhraseNote('phrase_001'), 'phrase_001'); assert.ok(p.ok && p.changed === false && p.text === emptyPhraseNote('phrase_001'));
  const a = refreshArrangementNoteText(emptyArrangementNote('arr_001'), 'arr_001'); assert.ok(a.ok && a.changed === false);
  const c = refreshCompositionNoteText(emptyCompositionNote('comp_001'), 'comp_001'); assert.ok(c.ok && c.changed === false);
});

test('THE FIRST SENTENCE (the same path the composer takes: the Description replaced, then applied by the writers the controls use) gives the note its kind and fills the Description, the Recipe, the Python and the cache; a phrase takes extend, mix or morph as its first sentence', () => {
  const sentences: Array<[Family, string, string, (t: string) => string | null]> = [
    ['phrase', 'phrases/phrase_001.md', describe(EXTEND), (t) => readPhraseKind(t)],
    ['phrase', 'phrases/phrase_001.md', describe({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } as any), (t) => readPhraseKind(t)],
    ['phrase', 'phrases/phrase_001.md', describe({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 } as any), (t) => readPhraseKind(t)],
    ['arrangement', 'arrangements/arr_001.md', describe({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] } as any), (t) => (readArrangementNote(t).ok ? 'arrangement' : null)],
    ['composition', 'compositions/comp_001.md', describe({ kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] } as any), (t) => (readCompositionNote(t).ok ? 'composition' : null)],
  ];
  const kinds: string[] = [];
  for (const [family, path, sentence, kindOf] of sentences) {
    const start = STARTERS.find(([f]) => f === family)![2];
    const edited = replaceDescriptionSection(start, sentence)!;
    const st = descriptionState(edited, family, VAULT);
    assert.equal(st.kind, 'apply', `${family}: "${sentence}" -> ${JSON.stringify(st).slice(0, 160)}`);
    const r = applyDescriptionText(edited, NAME(path), family, VAULT, sentence);
    assert.ok(r.ok, JSON.stringify(r));
    const text = (r as { text: string }).text;
    assert.equal(isEmptyNote(text), false, `${family}: it is a note with a kind now`);
    const kind = kindOf(text); assert.ok(kind !== null, `${family}: the kind is read from the note`); kinds.push(kind);
    // 2026-11-19-0970 (the list model): the Description of an arrangement and a composition is a numbered list of the canonical sentences (an arrangement's closing "Together." is not one); a phrase's is still the sentence
    // 2026-11-19-0980 (deliberate): a phrase's Description is a numbered list too now (line 1 is its head): "1. Extend ..." / "1. Mix ..." / "1. Morph ..."
    const expected = sentence.replace(/ Together\.$/, '').split(/(?<=\.) /).map((x, i) => `${i + 1}. ${x}`).join('\n');
    assert.equal(extractDescription(text).trim(), expected, `${family}: the Description is the canonical sentence as a list of one`);
    assert.ok((extractRecipeSection(text) ?? '').trim().length > 0, `${family}: the Recipe is filled`);
    assert.ok((pythonTextOf(text) ?? '').trim().length > 0, `${family}: the Python is filled`);
    assert.ok(cacheParams(text, family) !== null, `${family}: the cache holds the params`);
    assert.deepEqual(editedFacetsOf(text), [], `${family}: every stamp says the facets are in step`);
    assert.equal(descriptionState(text, family, VAULT).kind, 'synced', family);
  }
  assert.deepEqual(kinds, ['extend', 'mix', 'morph', 'arrangement', 'composition']);
  // a sentence of the WRONG family on an empty note is refused in the grammar's own words, nothing is written, the note stays empty
  const wrong = replaceDescriptionSection(STARTERS[1][2], describe(EXTEND))!;
  assert.equal(descriptionState(wrong, 'arrangement', VAULT).kind, 'rejected');
});

test('THE PRODUCERS: an empty note draws nothing, says nothing (an empty refusal message) and never asks the engine or reads another note; a note that is wrong in any other way still says why (the CONTROL)', async () => {
  let calls = 0;
  const trip = async () => { calls++; throw new Error('the engine and the vault must not be asked for an empty note'); };
  const deps: any = { readNote: trip, compute: trip, runCustom: trip, computeArrangement: trip, computeComposition: trip };
  const outs = [
    await producePhraseNote(deps, STARTERS[0][2], 'phrase_001'),
    await produceArrangement({ phrases: deps, compute: trip } as any, STARTERS[1][2], 'arr_001'),
    await produceComposition({ phrases: deps, compute: trip, computeArrangement: trip } as any, STARTERS[2][2], 'comp_001'),
  ];
  for (const o of outs) assert.deepEqual(o, { kind: 'refusal', message: '' });
  assert.equal(calls, 0);
  // CONTROL: the same producers still say why for a note that is wrong, so the empty answer is not "they never say anything"
  const bad = STARTERS[0][2].replace('{}', '{"kind":"extend"}');
  const out = await producePhraseNote(deps, bad, 'phrase_001');
  assert.equal(out.kind, 'refusal'); assert.ok((out as { message: string }).message.length > 10, (out as { message: string }).message);
  const badArr = await produceArrangement({ phrases: deps, compute: trip } as any, STARTERS[1][2].replace('{}', '{"kind":"arrangement"}'), 'arr_001');
  assert.ok(badArr.kind === 'refusal' && badArr.message.length > 10);
});

test('THE PREFLIGHT never refuses an empty note (an empty answer is not a reason), and never asks the engine for it', async () => {
  let asked = 0;
  const engine: any = { readNote: async () => { asked++; throw new Error('no'); }, compute: async () => { asked++; throw new Error('Traceback: no'); }, computeArrangement: async () => { asked++; throw new Error('no'); }, computeComposition: async () => { asked++; throw new Error('no'); } };
  const check = makeNotePreflight(engine);
  for (const [, path, text] of STARTERS) assert.equal(await check(path, text), null, path);
  assert.equal(asked, 0);
});
