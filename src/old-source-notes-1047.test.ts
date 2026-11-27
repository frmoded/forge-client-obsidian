// 2026-11-26-1047 (deliberate): what STAYS true of notes that are not Description-sourced. These pins lived beside the Recipe and Python read-back (recipe-apply-core.test.ts, python-apply-core.test.ts), which is gone; the behaviour they hold is not:
// the status of a note an older build left Recipe- or Python-sourced, what a control does to it, the shape of a CUSTOM note (now made by Detach, or followed when its Python is edited) and the controls' refusal on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheParams, customNoteText, descriptionState } from './description-apply-core.ts';
import { CUSTOM_BANNER, PYTHON_SOURCE_KEYS, RECIPE_SOURCE_KEY, handEditRefusalOf, isCustomNote, pythonEditedByHand, pythonTextOf, withSourceChainStamps } from './phrase-notes-core.ts';
import { applyPhraseWrite, noteContentFor, refreshPhraseNoteText, PHRASE_DEFAULTS, type PhraseParams } from './phrase-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { computeFacetStates, FacetState, suffixTextForState } from './facet-state-core.ts';
import { sourceLayerStatusOf } from './source-layer-status-of-body-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractRecipeSection, getFrontmatterField } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { oldPythonSourced, oldRecipeSourced } from './test-support/old-source-notes.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const note = (p: PhraseParams = EXTEND): string => noteContentFor('phrase_001', p);
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 8, order: 'musical', seed: 0 };
const morph = (): string => noteContentFor('phrase_003', MORPH);
const VAULT = { bars: ['bar_001', 'bar_002', 'bar_007'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] };
const field = (text: string, key: string): string | undefined => parseFrontmatter(text)?.fields[key];
const withPython = (text: string, edit: (py: string) => string): string => { const py = pythonTextOf(text) as string; return text.replace(py, edit(py)); };
const editRecipe = (text: string, from: string, to: string): string => { const r = extractRecipeSection(text) ?? ''; assert.ok(r.includes(from), `the Recipe has "${from}"`); return text.replace(r, r.replace(from, to)); };

test('an old Recipe-sourced note: the status says `source: recipe`, the Description and the Python are drawn as derived from it, out of date once the Recipe moves', async () => {
  const old = oldRecipeSourced(note({ ...EXTEND, bars: 6 }));
  const status = await sourceLayerStatusOf(old);
  assert.equal(status.effective, 'recipe');
  assert.deepEqual(status.states, { description: FacetState.DerivedFromRecipe, recipe: FacetState.Source, python: FacetState.DerivedFromRecipe });
  assert.deepEqual(status.staleFacets, []);
  const status2 = await sourceLayerStatusOf(editRecipe(old, '6 bars', '5 bars'));
  assert.equal(status2.states?.description, FacetState.DerivedFromRecipeOutOfDate);
  assert.equal(status2.states?.python, FacetState.DerivedFromRecipeOutOfDate);
});

test('P3 for the state machine: a Forge note with `source_facet: recipe` and NO description_derived_from_recipe_hash keeps the reading it always had (its Description is ignored); with the stamp it is derived, out of date when the Recipe moved', () => {
  const hashes = { description: 'd', recipe: 'r', python: 'p' };
  const none = computeFacetStates('recipe', { getFrontmatterField: () => null }, hashes);
  assert.equal(none.description, FacetState.Ignored);
  const fresh = computeFacetStates('recipe', { getFrontmatterField: (k) => (k === 'description_derived_from_recipe_hash' ? 'r' : null) }, hashes);
  assert.equal(fresh.description, FacetState.DerivedFromRecipe);
  const stale = computeFacetStates('recipe', { getFrontmatterField: (k) => (k === 'description_derived_from_recipe_hash' ? 'older' : null) }, hashes);
  assert.equal(stale.description, FacetState.DerivedFromRecipeOutOfDate);
  assert.equal(computeFacetStates('description', { getFrontmatterField: (k) => (k === 'description_derived_from_recipe_hash' ? 'r' : null) }, hashes).description, FacetState.Source, 'the stamp is read only when the Recipe is the source');
});

test('a control\'s write on an old Recipe-sourced note makes it Description-sourced (the controls write the Description as the source) and the Recipe-only stamp goes; a Description-sourced stamp set never carries it', () => {
  const w = applyPhraseWrite(oldRecipeSourced(note({ ...EXTEND, bars: 6 })), { ...EXTEND, bars: 4 }, 'phrase_001');
  assert.ok(w.ok);
  if (w.ok) { assert.equal(w.text, note({ ...EXTEND, bars: 4 })); assert.equal(getFrontmatterField(w.text, 'source_facet'), 'description'); assert.equal(field(w.text, RECIPE_SOURCE_KEY), undefined); }
  const stamps = { source_facet: 'description', description_hash: 'a', recipe_hash: 'b', python_hash: 'c', recipe_derived_from_description_hash: 'a', python_derived_from_recipe_hash: 'b' } as const;
  const lines = withSourceChainStamps(['type: data', `${RECIPE_SOURCE_KEY}: old`, 'source_facet: recipe'], stamps);
  assert.ok(!lines.some((l) => l.startsWith(RECIPE_SOURCE_KEY)), 'dropped');
  assert.ok(lines.includes('type: data') && lines.includes('source_facet: description'));
});

test('"derived from Python": the Description and the Recipe of a Python-sourced note read so, "out of date" once the Python moves on; a note without the stamps keeps its old reading (ignored)', () => {
  const w = oldPythonSourced(morph());
  const fm = { getFrontmatterField: (k: string) => field(w, k) ?? null };
  const hashes = (t: string) => ({ description: facetHashSync(extractDescription(t)), recipe: facetHashSync(extractRecipeSection(t) ?? ''), python: facetHashSync(pythonTextOf(t) as string) });
  assert.deepEqual(computeFacetStates('python', fm, hashes(w)), { description: FacetState.DerivedFromPython, recipe: FacetState.DerivedFromPython, python: FacetState.Source });
  assert.equal(suffixTextForState(FacetState.DerivedFromPython), '— derived from Python');
  assert.equal(suffixTextForState(FacetState.DerivedFromPythonOutOfDate), '— derived from Python, out of date');
  const moved = computeFacetStates('python', fm, { ...hashes(w), python: 'another python' });
  assert.deepEqual([moved.description, moved.recipe], [FacetState.DerivedFromPythonOutOfDate, FacetState.DerivedFromPythonOutOfDate]);
  const none = computeFacetStates('python', { getFrontmatterField: () => null }, hashes(w));
  assert.deepEqual([none.description, none.recipe], [FacetState.Ignored, FacetState.Ignored], 'a note with no Python-source stamp keeps the reading it always had');
});

test('a CUSTOM note made from a hand-typed Python: the Python kept as typed, the json cache and the Description untouched, Description and Recipe stamped as derived from the Python of before (out of date); editing it again says `edited`', () => {
  const n = morph();
  const typed = withPython(n, (py) => py.replace('  return bars', "  bars[1] = thin_out_bars(bars=[bars[1]], first=1, last=1, amount=0.5)[0]\n  return bars"));
  const made = customNoteText(typed, 'phrase_003');
  assert.equal(pythonTextOf(made), pythonTextOf(typed));
  assert.equal(isCustomNote(made), true);
  assert.equal(field(made, 'source_facet'), 'python');
  assert.deepEqual(cacheParams(made, 'phrase'), MORPH);
  assert.equal(extractDescription(made), extractDescription(n));
  assert.equal(field(made, PYTHON_SOURCE_KEYS[0]), field(n, 'python_hash'), 'stamped as derived from the Python BEFORE: out of date');
  assert.equal(pythonEditedByHand(made), false);
  assert.deepEqual(descriptionState(made, 'phrase', VAULT), { kind: 'custom-note', edited: false });
  const fm = { getFrontmatterField: (k: string) => field(made, k) ?? null };
  const states = computeFacetStates('python', fm, { description: facetHashSync(extractDescription(made)), recipe: facetHashSync(extractRecipeSection(made) ?? ''), python: facetHashSync(pythonTextOf(made) as string) });
  assert.deepEqual([states.description, states.recipe, states.python], [FacetState.DerivedFromPythonOutOfDate, FacetState.DerivedFromPythonOutOfDate, FacetState.Source]);
  assert.deepEqual(descriptionState(withPython(made, (py) => `${py}\n  # more`), 'phrase', VAULT), { kind: 'custom-note', edited: true });
  assert.deepEqual(descriptionState(made.replace(extractDescription(made), 'My own words about this.'), 'phrase', VAULT), { kind: 'custom-note', edited: false }, 'its Description is its own');
});

test('the controls\' writes, "Refresh note links" and the list writer are refused on a custom note, in the custom banner\'s words', () => {
  const custom = customNoteText(withPython(morph(), (py) => `${py}\n  print('x')`), 'phrase_003');
  assert.equal(handEditRefusalOf(custom, true), `Not saved: ${CUSTOM_BANNER}`);
  assert.equal(CUSTOM_BANNER, 'Custom Python: the controls are off for this note.');
  assert.deepEqual(applyPhraseWrite(custom, { ...MORPH, bars: 4 }, 'phrase_003'), { ok: false, message: `Not saved: ${CUSTOM_BANNER}` });
  assert.deepEqual(refreshPhraseNoteText(custom, 'phrase_003'), { ok: false, message: CUSTOM_BANNER });
  assert.deepEqual(writeListNote(custom, 'phrase_003', 'phrase', { params: MORPH, list: ['Morph [[bar_001]] into [[bar_002]] over 8 bars, in musical order.'] }), { ok: false, message: CUSTOM_BANNER });
});
