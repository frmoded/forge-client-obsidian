// 2026-10-31-1140 (M16a): "Update from Recipe" - the decisions, on real notes made by the real writers. A Recipe edited to parse is APPLIED (the note is byte for byte the one the controls would have made, plus the two stamps that say the Recipe is
// the source), one that does not parse writes nothing and says the line and the column, a Description edited TOO is a refusal naming both, a control's write and "Refresh note links" never overwrite a Recipe a person typed, and a refresh
// of a Recipe-sourced note keeps it Recipe-sourced. The edges the prompt names: reordered independent steps, a deleted wikilink target, a composition's section length, the Description just auto-applied.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PYTHON_DERIVED, applyDescriptionText, applyRecipeText, descriptionState, revertDescriptionText } from './description-apply-core.ts';
import { BOTH_EDITED, recipeAppliedLine, recipeEdit, recipeRejectedLine, recipeRejectionMessage, recipeRevertedLine } from './recipe-apply-core.ts';
import { PHRASE_DEFAULTS, applyPhraseWrite, noteContentFor, readPhraseNote, refreshPhraseNoteText, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote, refreshArrangementNoteText } from './arrangement-core.ts';
import { newCompositionNote, readCompositionNote, refreshCompositionNoteText } from './composition-core.ts';
import { RECIPE_EDITED_BY_HAND, RECIPE_SOURCE_KEY, asRecipeSourced, descriptionEditedByHand, handEditRefusalOf, keepRecipeSource, recipeEditedByHand, sourceFacetOf, withSourceChainStamps } from './phrase-notes-core.ts';
import { computeFacetStates, FacetState } from './facet-state-core.ts';
import { sourceLayerStatusOf } from './source-layer-status-of-body-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractRecipeSection, getFrontmatterField } from './v2-note-core.ts';

const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003', 'phrase_009'], arrangements: ['arr_001'], compositions: ['comp_001'], kits: ['rock', 'latin'] };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const note = (p: PhraseParams = EXTEND): string => noteContentFor('phrase_001', p);
/** Change text inside the `# Recipe` section only, the way a person types into the note. */
const editRecipe = (text: string, from: string, to: string): string => { const r = extractRecipeSection(text) ?? ''; assert.ok(r.includes(from), `the Recipe has "${from}"`); return text.replace(r, r.replace(from, to)); };
const editDescription = (text: string, from: string, to: string): string => { const d = extractDescription(text); assert.ok(d.includes(from), `the Description has "${from}"`); return text.replace(d, d.replace(from, to)); };
const fm = (text: string, key: string): string | null => { const v = getFrontmatterField(text, key); return typeof v === 'string' ? v : null; };

test('"8 bars" -> "6 bars" in the RECIPE: it is APPLIED; the note is the one the controls make for 6 bars, byte for byte, plus the two stamps that say the Recipe is the source; the Description is derived from it and nothing is stale', () => {
  const edited = editRecipe(note(), '8 bars', '6 bars');
  assert.equal(recipeEditedByHand(edited), true); assert.equal(descriptionEditedByHand(edited), false);
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'recipe-apply');
  if (st.kind !== 'recipe-apply') return;
  assert.equal(st.change, '8 -> 6 bars'); assert.equal(st.unchanged, false);
  const done = applyRecipeText(edited, 'phrase_001', 'phrase', VAULT, st.recipe);
  assert.equal(done.ok, true);
  if (!done.ok) return;
  assert.equal(done.text, asRecipeSourced(note({ ...EXTEND, bars: 6 })), 'byte for byte what the controls make, as a Recipe-sourced note');
  assert.equal(sourceFacetOf(done.text), 'recipe');
  assert.equal(fm(done.text, RECIPE_SOURCE_KEY), facetHashSync(extractRecipeSection(done.text) ?? ''), 'the Description is stamped as derived from THIS Recipe');
  assert.deepEqual(descriptionState(done.text, 'phrase', VAULT), { kind: 'synced' }, 'and it is synced again');
  const read = readPhraseNote(done.text);
  assert.ok(read.ok && read.value.kind === 'extend' && read.value.bars === 6, 'the json cache follows');
  assert.match(extractDescription(done.text), /6 bars/, 'the Description is said again from the params');
});

test('the status says `source: recipe`, the Recipe is the source and the Description and the Python are drawn as derived from it (card 20: one function for the status bar and the headings)', async () => {
  const done = applyRecipeText(editRecipe(note(), '8 bars', '6 bars'), 'phrase_001', 'phrase', VAULT, extractRecipeSection(editRecipe(note(), '8 bars', '6 bars')) ?? '');
  assert.ok(done.ok);
  if (!done.ok) return;
  const status = await sourceLayerStatusOf(done.text);
  assert.equal(status.effective, 'recipe');
  assert.deepEqual(status.states, { description: FacetState.DerivedFromRecipe, recipe: FacetState.Source, python: FacetState.DerivedFromRecipe });
  assert.deepEqual(status.staleFacets, []);
  // a Description edited by hand afterwards is no longer derived from the Recipe it came from: out of date, said so by the same function
  const moved = editRecipe(done.text, '6 bars', '5 bars');
  const status2 = await sourceLayerStatusOf(moved);
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

test('a Recipe that does not parse writes NOTHING and says where: the line and the column and one sentence; an unknown step is named', () => {
  const edited = note().replace(extractRecipeSection(note()) ?? '', 'Take [[bar_007]].\nRepeat it for 8 bars with fills.\nSprinkle [[bar_008]].');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'recipe-rejected');
  if (st.kind !== 'recipe-rejected') return;
  assert.deepEqual([st.error.line, st.error.column], [3, 1]);
  assert.match(st.message, /^Recipe, line 3, column 1: I do not know the step 'Sprinkle'\. A step starts with Take, Repeat,/);
  const attempt = applyRecipeText(edited, 'phrase_001', 'phrase', VAULT, st.recipe);
  assert.deepEqual(attempt, { ok: false, message: st.message, stale: true });
  assert.equal(recipeRejectedLine('phrase_001', st.error), `[forge-recipe] rejected phrase_001: line 3 column 1 ${st.error.message}`);
});

test('a deleted wikilink target: the Recipe names a bar the vault no longer has - refused, at the place, with the grammar\'s own words (nothing is written)', () => {
  const edited = editRecipe(note(), '[[bar_007]]', '[[bar_999]]');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'recipe-rejected');
  if (st.kind !== 'recipe-rejected') return;
  assert.deepEqual([st.error.line, st.error.column], [1, 6]);
  assert.match(st.message, /^Recipe, line 1, column 6: expected a bar of this vault for the bar to extend, but "bar_999" is not one/);
});

test('a Recipe that says the same thing in other words writes the canonical note again and says "no change in the music": reordered independent steps (an arrangement\'s settings), spacing and case', () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001', volume: 70 }, { kit: 'latin', phrase: 'phrase_003', mute: true }] });
  const before = extractRecipeSection(arr) ?? '';
  assert.match(before, /percent volume\.\nMute /, 'the renderer writes the volume step before the mute step');
  const reordered = arr.replace(before, before.replace('Play the [[rock]] kit at 70 percent volume.\nMute the [[latin]] kit.', 'mute  the [[latin]] kit\nplay the [[rock]] kit at 70% VOLUME.'));
  const st = descriptionState(reordered, 'arrangement', VAULT);
  assert.equal(st.kind, 'recipe-apply');
  if (st.kind !== 'recipe-apply') return;
  assert.equal(st.unchanged, true); assert.equal(st.change, 'no change in the music');
  const done = applyRecipeText(reordered, 'arr_001', 'arrangement', VAULT, st.recipe);
  assert.ok(done.ok);
  if (done.ok) assert.equal(done.text, asRecipeSourced(arr), 'the Recipe is written canonically again; the music is the same');
});

test('a track\'s order in an arrangement IS the music (the first track\'s tempo rules them all): swapping two "Play" steps is a change, said so', () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_003' }] });
  const r = extractRecipeSection(arr) ?? '';
  const swapped = arr.replace(r, r.replace('Play [[phrase_001]] on the [[rock]] kit.\nPlay [[phrase_003]] on the [[latin]] kit.', 'Play [[phrase_003]] on the [[latin]] kit.\nPlay [[phrase_001]] on the [[rock]] kit.'));
  const st = descriptionState(swapped, 'arrangement', VAULT);
  assert.equal(st.kind, 'recipe-apply');
  if (st.kind === 'recipe-apply') { assert.equal(st.unchanged, false); assert.equal(st.change, 'tracks changed'); }
});

test('a COMPOSITION\'s Recipe: a section\'s length edited (8 -> 6 bars) is applied; the json, the Description, the Python and the stamps follow', () => {
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 8 }, { source: 'phrases/phrase_003', length: 4 }] });
  const edited = editRecipe(comp, 'for 8 bars', 'for 6 bars');
  const st = descriptionState(edited, 'composition', VAULT);
  assert.equal(st.kind, 'recipe-apply');
  if (st.kind !== 'recipe-apply') return;
  const done = applyRecipeText(edited, 'comp_001', 'composition', VAULT, st.recipe);
  assert.ok(done.ok);
  if (!done.ok) return;
  const read = readCompositionNote(done.text);
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(read.value.sections, [{ source: 'phrases/phrase_001', length: 6 }, { source: 'phrases/phrase_003', length: 4 }]);
  assert.equal(done.text, asRecipeSourced(newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 6 }, { source: 'phrases/phrase_003', length: 4 }] })));
});

test('a Recipe of another KIND is refused in one sentence: this note is a phrase, the Recipe describes an arrangement', () => {
  const edited = note().replace(extractRecipeSection(note()) ?? '', 'Play [[phrase_001]] on the [[rock]] kit.\nTogether.');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'recipe-rejected');
  if (st.kind === 'recipe-rejected') assert.equal(st.message, 'Recipe, line 1, column 1: this note is a phrase, but the Recipe describes an arrangement; make a new note for that');
});

test('BOTH edited: nothing is applied and the sentence names both; "Update from Description" keeps the Description (the Recipe edit is dropped), "Update from Recipe" keeps the Recipe (the Description edit is dropped)', () => {
  const both = editDescription(editRecipe(note(), '8 bars', '6 bars'), '8 bars', '5 bars');
  assert.deepEqual(descriptionState(both, 'phrase', VAULT), { kind: 'both-edited', message: BOTH_EDITED });
  assert.equal(BOTH_EDITED, 'Description and Recipe were both edited; keep one: Update from Description / Update from Recipe.');
  const fromDescription = applyDescriptionText(both, 'phrase_001', 'phrase', VAULT, extractDescription(both), 'description');
  assert.ok(fromDescription.ok);
  if (fromDescription.ok) assert.equal(fromDescription.text, note({ ...EXTEND, bars: 5 }), 'the Description\'s 5 bars, written as the controls write (a Description-sourced note)');
  const fromRecipe = applyRecipeText(both, 'phrase_001', 'phrase', VAULT, extractRecipeSection(both) ?? '');
  assert.ok(fromRecipe.ok);
  if (fromRecipe.ok) assert.equal(fromRecipe.text, asRecipeSourced(note({ ...EXTEND, bars: 6 })), 'the Recipe\'s 6 bars');
  // pressing neither button (no `prefer`) applies nothing
  const none = applyDescriptionText(both, 'phrase_001', 'phrase', VAULT, extractDescription(both));
  assert.deepEqual(none, { ok: false, message: BOTH_EDITED, stale: true });
});

test('the plan is decided on the CURRENT text: a Recipe that changed again since it was planned is not written (the newer edit is read by its own turn)', () => {
  const first = editRecipe(note(), '8 bars', '6 bars');
  const st = descriptionState(first, 'phrase', VAULT);
  assert.equal(st.kind, 'recipe-apply');
  if (st.kind !== 'recipe-apply') return;
  const moved = editRecipe(note(), '8 bars', '7 bars');
  assert.deepEqual(applyRecipeText(moved, 'phrase_001', 'phrase', VAULT, st.recipe), { ok: false, message: 'The Recipe changed again; the newer text is being read.', stale: true });
  assert.deepEqual(applyRecipeText(note(), 'phrase_001', 'phrase', VAULT, st.recipe), { ok: false, message: 'There is nothing to update: the Recipe matches the note.', stale: true }, 'a note whose Recipe matches has nothing to apply');
});

test('a control\'s write and "Refresh note links" never overwrite a Recipe a person typed: the same protection the Description has, in the Recipe\'s own words', () => {
  const edited = editRecipe(note(), '8 bars', '6 bars');
  assert.equal(RECIPE_EDITED_BY_HAND, 'the Recipe was edited by hand; press Update from Recipe first or revert it');
  assert.equal(handEditRefusalOf(edited, true), 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.');
  assert.equal(handEditRefusalOf(edited, false), 'The Recipe was edited by hand; press Update from Recipe first or revert it.');
  assert.equal(handEditRefusalOf(note(), true), null);
  assert.equal(handEditRefusalOf(editDescription(edited, '8 bars', '7 bars'), true), 'Not saved: the Description was edited by hand; press Update from Description first or revert it.', 'the Description\'s sentence first when both');
  const write = applyPhraseWrite(edited, { ...EXTEND, bars: 9 }, 'phrase_001');
  assert.deepEqual(write, { ok: false, message: 'Not saved: the Recipe was edited by hand; press Update from Recipe first or revert it.' });
  const lifted = applyPhraseWrite(edited, { ...EXTEND, bars: 9 }, 'phrase_001', true);
  assert.ok(lifted.ok, 'the button that READS the edit lifts it');
  const refresh = refreshPhraseNoteText(edited, 'phrase_001');
  assert.deepEqual(refresh, { ok: false, message: 'The Recipe was edited by hand; press Update from Recipe first or revert it.' });
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] });
  assert.equal(refreshArrangementNoteText(arr.replace(extractRecipeSection(arr) ?? '', 'Play [[phrase_001]] on the [[latin]] kit.\nTogether.'), 'arr_001').ok, false);
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] });
  assert.equal(refreshCompositionNoteText(editRecipe(comp, 'Play', 'play  '), 'comp_001').ok, false);
});

test('"Refresh note links" on a Recipe-SOURCED note keeps the person\'s Recipe as the source (a stale Description never rewrites it) and is idempotent: a second run changes nothing', () => {
  const done = applyRecipeText(editRecipe(note(), '8 bars', '6 bars'), 'phrase_001', 'phrase', VAULT, extractRecipeSection(editRecipe(note(), '8 bars', '6 bars')) ?? '');
  assert.ok(done.ok);
  if (!done.ok) return;
  const r1 = refreshPhraseNoteText(done.text, 'phrase_001');
  assert.deepEqual(r1.ok && [r1.changed, r1.text === done.text], [false, true], 'nothing differs: the refresh is a no-op, and the note stays Recipe-sourced');
  // a refresh that DOES change something (a derived part drifted: the frontmatter description) still keeps the source
  const drifted = done.text.replace(/^description: ".*"$/m, 'description: "stale"');
  const r2 = refreshPhraseNoteText(drifted, 'phrase_001');
  assert.ok(r2.ok && r2.changed);
  if (r2.ok) { assert.equal(sourceFacetOf(r2.text), 'recipe'); assert.equal(fm(r2.text, RECIPE_SOURCE_KEY), facetHashSync(extractRecipeSection(r2.text) ?? '')); assert.equal(r2.text, done.text); }
  // the same note refreshed as a DESCRIPTION-sourced one stays so (no stamp is invented)
  const plain = refreshPhraseNoteText(note().replace(/^description: ".*"$/m, 'description: "stale"'), 'phrase_001');
  assert.ok(plain.ok && sourceFacetOf(plain.text) === 'description' && fm(plain.text, RECIPE_SOURCE_KEY) === null);
});

test('a control\'s write on a Recipe-sourced note makes it Description-sourced again (the controls write the Description as the source) and the Recipe-only stamp goes', () => {
  const done = applyRecipeText(editRecipe(note(), '8 bars', '6 bars'), 'phrase_001', 'phrase', VAULT, extractRecipeSection(editRecipe(note(), '8 bars', '6 bars')) ?? '');
  assert.ok(done.ok);
  if (!done.ok) return;
  const w = applyPhraseWrite(done.text, { ...EXTEND, bars: 4 }, 'phrase_001');
  assert.ok(w.ok);
  if (w.ok) { assert.equal(w.text, note({ ...EXTEND, bars: 4 })); assert.equal(sourceFacetOf(w.text), 'description'); assert.equal(fm(w.text, RECIPE_SOURCE_KEY), null); }
});

test('Revert on a Recipe edit: the json cache says the last good note, every derived part with it (the Recipe edit is dropped), whether the Recipe parsed or not', () => {
  const edited = editRecipe(note(), '8 bars', '6 bars');
  const r = revertDescriptionText(edited, 'phrase_001', 'phrase');
  assert.deepEqual(r, { ok: true, text: note() });
  const broken = note().replace(extractRecipeSection(note()) ?? '', 'Sprinkle.');
  assert.deepEqual(revertDescriptionText(broken, 'phrase_001', 'phrase'), { ok: true, text: note() });
  assert.equal(recipeRevertedLine('phrase_001'), '[forge-recipe] reverted phrase_001 to the json cache');
  assert.equal(recipeAppliedLine('phrase_001', '8 -> 6 bars'), '[forge-recipe] applied phrase_001 (8 -> 6 bars)');
});

test('the stamp helpers: asRecipeSourced is idempotent and keeps every other line; keepRecipeSource only acts on a note that WAS Recipe-sourced; a Description-sourced stamp set never carries the Recipe stamp', () => {
  const x = asRecipeSourced(note());
  assert.equal(asRecipeSourced(x), x);
  assert.equal(sourceFacetOf(note()), 'description');
  assert.equal(sourceFacetOf(x), 'recipe');
  assert.equal(keepRecipeSource(note(), note()), note());
  assert.equal(keepRecipeSource(x, note()), x);
  assert.equal(asRecipeSourced('no frontmatter'), 'no frontmatter');
  const stamps = { source_facet: 'description', description_hash: 'a', recipe_hash: 'b', python_hash: 'c', recipe_derived_from_description_hash: 'a', python_derived_from_recipe_hash: 'b' } as const;
  const lines = withSourceChainStamps(['type: data', `${RECIPE_SOURCE_KEY}: old`, 'source_facet: recipe'], stamps);
  assert.ok(!lines.some((l) => l.startsWith(RECIPE_SOURCE_KEY)), 'dropped');
  assert.ok(lines.includes('type: data') && lines.includes('source_facet: description'));
});

test('a text that is not one of our notes has nothing to say about its Recipe; a note whose Recipe matches its stamp too; the rejection message keeps a capital for "I do not know" and lowers an "Expected"', () => {
  assert.deepEqual(recipeEdit('not a note', 'phrase', VAULT), { kind: 'none' });
  assert.deepEqual(recipeEdit(note(), 'phrase', VAULT), { kind: 'none' });
  assert.equal(recipeRejectionMessage({ message: 'Expected a bar.', line: 2, column: 5 }), 'Recipe, line 2, column 5: expected a bar.');
  assert.equal(recipeRejectionMessage({ message: "I do not know the step 'X'.", line: 1, column: 1 }), "Recipe, line 1, column 1: I do not know the step 'X'.");
  assert.equal(recipeRejectionMessage({ message: '', line: 1, column: 1 }), 'Recipe, line 1, column 1: it could not be read');
  assert.equal(recipeRejectionMessage({ message: 'x', line: 1, column: 1 }), 'Recipe, line 1, column 1: x', 'a message of one character is still the message');
  // a note with frontmatter and a stamped, edited Recipe but NO json block is not one of ours: nothing to say (a Recipe is applied only to a data note whose cache it can rewrite)
  const noJson = editRecipe(note(), '8 bars', '6 bars').replace(/```json[\s\S]*$/, '');
  assert.equal(recipeEditedByHand(noJson), true);
  assert.deepEqual(recipeEdit(noJson, 'phrase', VAULT), { kind: 'none' });
  assert.deepEqual(descriptionState(noJson, 'phrase', VAULT), { kind: 'synced' });
  assert.deepEqual(recipeEdit('---\ntype: data\nrecipe_hash: abc\n---\n\n# Recipe\n\nTake [[bar_007]].\n', 'phrase', VAULT), { kind: 'none' }, 'no json block at all');
  assert.equal(PYTHON_DERIVED, 'Python is derived; edit the Description or the Recipe.');
});

test('a note its WRITER refuses (read_only) is not a stale plan: Update from Recipe and Update from Description answer with the writer\'s sentence and `stale: false` (the controller shows that sentence and keeps the buttons; a stale plan is read afresh instead)', () => {
  const ro = (t: string): string => t.replace('content_type: json', 'content_type: json\nread_only: true');
  const recipeEdited = ro(editRecipe(note(), '8 bars', '6 bars'));
  const a = applyRecipeText(recipeEdited, 'phrase_001', 'phrase', VAULT, extractRecipeSection(recipeEdited) ?? '');
  assert.equal(a.ok, false);
  if (a.ok === false) { assert.equal(a.stale, false); assert.match(a.message, /read_only|read-only|editable/i, a.message); }
  const descEdited = ro(editDescription(note(), '8 bars', '6 bars'));
  const b = applyDescriptionText(descEdited, 'phrase_001', 'phrase', VAULT, extractDescription(descEdited));
  assert.equal(b.ok, false);
  if (b.ok === false) { assert.equal(b.stale, false); assert.match(b.message, /read_only|read-only|editable/i, b.message); }
  // and the plans that ARE stale say so
  const c = applyRecipeText(editRecipe(note(), '8 bars', '6 bars'), 'phrase_001', 'phrase', VAULT, 'another recipe');
  assert.ok(c.ok === false && c.stale === true);
});
