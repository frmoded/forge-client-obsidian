// 2026-11-02-1155 (score_first M16b) - what a hand-edited PYTHON means: the three-facet decision (which facets a person changed), a known shape mapped back (ONE write: every derived part made again, the note Python-sourced), anything else a CUSTOM
// note (its Python kept as typed, its json cache kept for "Revert to generated"), the controls refused on a custom note, Revert to generated. Real notes, the real writers, the plugin's own hashes; the three families.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyPythonText, applyDescriptionText, applyRecipeText, cacheParams, descriptionState, revertToGeneratedText, revertDescriptionText } from './description-apply-core.ts';
import { bothEditedMessage, editedFacetsOf, pythonEdit } from './python-apply-core.ts';
import { CUSTOM_BANNER, CUSTOM_KEY, PYTHON_SOURCE_KEYS, asCustom, handEditRefusalOf, isCustomNote, pythonEditedByHand, pythonTextOf } from './phrase-notes-core.ts';
import { applyPhraseWrite, noteContentFor, refreshPhraseNoteText, PHRASE_DEFAULTS, type PhraseParams } from './phrase-core.ts';
import { applyArrangementWrite, newArrangementNote, refreshArrangementNoteText } from './arrangement-core.ts';
import { applyCompositionWrite, newCompositionNote, refreshCompositionNoteText } from './composition-core.ts';
import { computeFacetStates, FacetState, suffixTextForState } from './facet-state-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

const VAULT = { bars: ['bar_001', 'bar_002', 'bar_007'], phrases: ['phrase_001', 'phrase_003'], arrangements: ['arr_001'], compositions: [], kits: ['rock', 'latin'] };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 8, order: 'musical', seed: 0 };
const morph = (): string => noteContentFor('phrase_003', MORPH);
const field = (text: string, key: string): string | undefined => parseFrontmatter(text)?.fields[key];
const withPython = (text: string, edit: (py: string) => string): string => { const py = pythonTextOf(text) as string; return text.replace(py, edit(py)); };

test('the facets edited: none, one, two, three; a custom note\'s Description and Recipe are free text (only its Python counts)', () => {
  const n = morph();
  assert.deepEqual(editedFacetsOf(n), []);
  const d = n.replace(extractDescription(n), 'Morph [[bar_001]] into [[bar_002]] over 6 bars.');
  const r = d.replace(extractRecipeSection(n) as string, 'Take [[bar_001]].');
  const p = withPython(r, (py) => py.replace('bars=8', 'bars=5'));
  assert.deepEqual(editedFacetsOf(d), ['description']);
  assert.deepEqual(editedFacetsOf(r), ['description', 'recipe']);
  assert.deepEqual(editedFacetsOf(p), ['description', 'recipe', 'python']);
  const custom = asCustom(withPython(n, (py) => `${py}\n  print('hi')`));
  assert.equal(isCustomNote(custom), true);
  assert.deepEqual(editedFacetsOf(custom.replace(extractDescription(custom), 'My own words about this.')), [], 'a custom note\'s Description is its own');
});

test('the sentence when facets were edited together: Description and Recipe say it as they always did, the others name themselves', () => {
  assert.equal(bothEditedMessage(['description', 'recipe']), 'Description and Recipe were both edited; keep one: Update from Description / Update from Recipe.');
  assert.equal(bothEditedMessage(['description', 'python']), 'Description and Python were both edited; keep one: Update from Description / Update from Python.');
  assert.equal(bothEditedMessage(['recipe', 'python']), 'Recipe and Python were both edited; keep one: Update from Recipe / Update from Python.');
  assert.equal(bothEditedMessage(['description', 'recipe', 'python']), 'Description, Recipe and Python were all edited; keep one: Update from Description / Update from Recipe / Update from Python.');
});

test('a morph\'s Python with bars=8 changed to bars=6: python-apply, "8 -> 6 bars"; applied by ONE write the Description, Recipe, json and stamps follow, the note is Python-sourced and quiet', () => {
  const n = morph();
  const edited = withPython(n, (py) => py.replace('bars=8', 'bars=6'));
  assert.deepEqual(editedFacetsOf(edited), ['python']);
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'python-apply');
  if (st.kind !== 'python-apply') return;
  assert.equal(st.change, '8 -> 6 bars');
  const w = applyPythonText(edited, 'phrase_003', 'phrase', VAULT, st.python);
  assert.ok(w.ok, JSON.stringify(w));
  if (!w.ok) return;
  assert.equal(w.custom, false);
  assert.match(extractDescription(w.text), /over 6 bars/);
  assert.deepEqual(cacheParams(w.text, 'phrase'), { ...MORPH, bars: 6 });
  assert.equal(field(w.text, 'source_facet'), 'python');
  const hash = facetHashSync(pythonTextOf(w.text) as string);
  assert.equal(field(w.text, 'python_hash'), hash);
  assert.equal(field(w.text, PYTHON_SOURCE_KEYS[0]), hash);
  assert.equal(field(w.text, PYTHON_SOURCE_KEYS[1]), hash);
  assert.equal(field(w.text, 'description_derived_from_recipe_hash'), undefined, 'no Recipe-source stamp is left behind');
  assert.equal(descriptionState(w.text, 'phrase', VAULT).kind, 'synced', 'applied: nothing more to say');
  assert.equal(pythonEditedByHand(w.text), false);
});

test('"derived from Python": the Description and the Recipe of a Python-sourced note read so, "out of date" once the Python moves on; a note without the stamps keeps its old reading (ignored)', () => {
  const n = morph();
  const w = applyPythonText(withPython(n, (py) => py.replace('bars=8', 'bars=6')), 'phrase_003', 'phrase', VAULT, pythonTextOf(withPython(n, (py) => py.replace('bars=8', 'bars=6'))) as string);
  assert.ok(w.ok); if (!w.ok) return;
  const fm = { getFrontmatterField: (k: string) => field(w.text, k) ?? null };
  const hashes = (t: string) => ({ description: facetHashSync(extractDescription(t)), recipe: facetHashSync(extractRecipeSection(t) ?? ''), python: facetHashSync(pythonTextOf(t) as string) });
  const fresh = computeFacetStates('python', fm, hashes(w.text));
  assert.deepEqual(fresh, { description: FacetState.DerivedFromPython, recipe: FacetState.DerivedFromPython, python: FacetState.Source });
  assert.equal(suffixTextForState(FacetState.DerivedFromPython), '— derived from Python');
  assert.equal(suffixTextForState(FacetState.DerivedFromPythonOutOfDate), '— derived from Python, out of date');
  const moved = computeFacetStates('python', fm, { ...hashes(w.text), python: 'another python' });
  assert.deepEqual([moved.description, moved.recipe], [FacetState.DerivedFromPythonOutOfDate, FacetState.DerivedFromPythonOutOfDate]);
  const none = computeFacetStates('python', { getFrontmatterField: () => null }, hashes(w.text));
  assert.deepEqual([none.description, none.recipe], [FacetState.Ignored, FacetState.Ignored], 'a note with no Python-source stamp keeps the reading it always had');
});

test('a Python that is not a known shape (a line that thins out bar 2 by hand): python-custom; applied, the note is CUSTOM - Python kept as typed, json cache untouched, Description and Recipe stamped as the Python they were derived from (out of date)', () => {
  const n = morph();
  const typed = withPython(n, (py) => py.replace('  return bars', "  bars[1] = thin_out_bars(bars=[bars[1]], first=1, last=1, amount=0.5)[0]\n  return bars"));
  const st = descriptionState(typed, 'phrase', VAULT);
  assert.deepEqual(st.kind === 'python-custom' && [st.kind, st.already], ['python-custom', false]);
  if (st.kind !== 'python-custom') return;
  const w = applyPythonText(typed, 'phrase_003', 'phrase', VAULT, st.python);
  assert.ok(w.ok && w.custom, JSON.stringify(w));
  if (!w.ok) return;
  assert.equal(pythonTextOf(w.text), st.python, 'the Python is exactly what was typed');
  assert.equal(isCustomNote(w.text), true);
  assert.equal(field(w.text, 'source_facet'), 'python');
  assert.deepEqual(cacheParams(w.text, 'phrase'), MORPH, 'the json cache is what the grammar last understood');
  assert.equal(extractDescription(w.text), extractDescription(n), 'the Description is left as it was');
  assert.equal(field(w.text, PYTHON_SOURCE_KEYS[0]), field(n, 'python_hash'), 'stamped as derived from the Python BEFORE the takeover: out of date');
  assert.equal(pythonEditedByHand(w.text), false);
  assert.deepEqual(descriptionState(w.text, 'phrase', VAULT), { kind: 'custom-note', canRevert: true });
  const fm = { getFrontmatterField: (k: string) => field(w.text, k) ?? null };
  const states = computeFacetStates('python', fm, { description: facetHashSync(extractDescription(w.text)), recipe: facetHashSync(extractRecipeSection(w.text) ?? ''), python: facetHashSync(pythonTextOf(w.text) as string) });
  assert.deepEqual([states.description, states.recipe, states.python], [FacetState.DerivedFromPythonOutOfDate, FacetState.DerivedFromPythonOutOfDate, FacetState.Source]);
  // editing the custom Python again is another python edit: still custom (or known again, below)
  const again = withPython(w.text, (py) => `${py}\n  # more`);
  assert.deepEqual(descriptionState(again, 'phrase', VAULT).kind, 'python-custom');
  assert.equal((descriptionState(again, 'phrase', VAULT) as { already: boolean }).already, true);
});

test('a custom note whose Python is made a KNOWN shape again maps back: structured, Python-sourced, no longer custom', () => {
  const n = morph();
  const custom = asCustom(withPython(n, (py) => `${py}\n  print('x')`));
  const back = withPython(custom, (py) => py.replace("\n  print('x')", '').replace('bars=8', 'bars=4'));
  const st = descriptionState(back, 'phrase', VAULT);
  assert.equal(st.kind, 'python-apply');
  if (st.kind !== 'python-apply') return;
  const w = applyPythonText(back, 'phrase_003', 'phrase', VAULT, st.python);
  assert.ok(w.ok && !w.custom); if (!w.ok) return;
  assert.equal(isCustomNote(w.text), false);
  assert.deepEqual(cacheParams(w.text, 'phrase'), { ...MORPH, bars: 4 });
});

test('the Python changed again before the write: a stale plan is dropped (the newer edit is read by its own turn); nothing to do when the Python matches', () => {
  const n = morph();
  const edited = withPython(n, (py) => py.replace('bars=8', 'bars=6'));
  const stale = applyPythonText(edited, 'phrase_003', 'phrase', VAULT, 'something else');
  assert.deepEqual(stale, { ok: false, message: 'The Python changed again; the newer text is being read.', stale: true });
  assert.deepEqual(applyPythonText(n, 'phrase_003', 'phrase', VAULT, pythonTextOf(n) as string), { ok: false, message: 'There is nothing to update: the Python matches the note.', stale: true });
});

test('two or three facets edited: nothing is applied and the state names them; the button the person pressed settles it (the others\' edits are dropped)', () => {
  const n = morph();
  const d = n.replace(extractDescription(n), 'Morph [[bar_001]] into [[bar_002]] over 6 bars.');
  const dp = withPython(d, (py) => py.replace('bars=8', 'bars=3'));
  const st = descriptionState(dp, 'phrase', VAULT);
  assert.deepEqual(st.kind === 'both-edited' && [st.facets, st.message], [['description', 'python'], 'Description and Python were both edited; keep one: Update from Description / Update from Python.']);
  const py = descriptionState(dp, 'phrase', VAULT, 'python');
  assert.equal(py.kind, 'python-apply');
  const wp = applyPythonText(dp, 'phrase_003', 'phrase', VAULT, (py as { python: string }).python);
  assert.ok(wp.ok); if (!wp.ok) return;
  assert.match(extractDescription(wp.text), /over 3 bars/, 'the Python was kept: its bars win');
  const wd = applyDescriptionText(dp, 'phrase_003', 'phrase', VAULT, extractDescription(dp), 'description');
  assert.ok(wd.ok); if (!wd.ok) return;
  assert.match(extractDescription(wd.text), /over 6 bars/, 'the Description was kept: its bars win');
  assert.equal(field(wd.text, 'source_facet'), 'description');
  const all = descriptionState(withPython(dp.replace(extractRecipeSection(dp) as string, 'Take [[bar_001]].'), (x) => x.replace('bars=3', 'bars=2')), 'phrase', VAULT);
  assert.deepEqual(all.kind === 'both-edited' && all.facets, ['description', 'recipe', 'python']);
  const wr = applyRecipeText(dp.replace(extractRecipeSection(dp) as string, 'Morph [[bar_001]] into [[bar_002]] over 7 bars.'), 'phrase_003', 'phrase', VAULT, 'Morph [[bar_001]] into [[bar_002]] over 7 bars.');
  void wr;
});

test('the controls\' writes and "Refresh note links" are refused on a custom note and on a hand-edited Python, with the sentence; Revert and the Update writers are not (the refusal is lifted for them)', () => {
  const n = morph();
  const edited = withPython(n, (py) => py.replace('bars=8', 'bars=6'));
  assert.equal(handEditRefusalOf(edited, true), 'Not saved: the Python was edited by hand; press Update from Python first or revert it.');
  assert.equal(handEditRefusalOf(edited, false), 'The Python was edited by hand; press Update from Python first or revert it.');
  assert.deepEqual(applyPhraseWrite(edited, { ...MORPH, bars: 4 }, 'phrase_003'), { ok: false, message: 'Not saved: the Python was edited by hand; press Update from Python first or revert it.' });
  assert.deepEqual(refreshPhraseNoteText(edited, 'phrase_003'), { ok: false, message: 'The Python was edited by hand; press Update from Python first or revert it.' });
  const custom = asCustom(withPython(n, (py) => `${py}\n  print('x')`));
  assert.equal(handEditRefusalOf(custom, true), `Not saved: ${CUSTOM_BANNER}`);
  assert.equal(CUSTOM_BANNER, 'Custom Python: the controls are off for this note.');
  assert.deepEqual(applyPhraseWrite(custom, { ...MORPH, bars: 4 }, 'phrase_003'), { ok: false, message: `Not saved: ${CUSTOM_BANNER}` });
  assert.deepEqual(refreshPhraseNoteText(custom, 'phrase_003'), { ok: false, message: CUSTOM_BANNER });
  assert.ok(applyPhraseWrite(custom, { ...MORPH, bars: 4 }, 'phrase_003', true).ok, 'lifted (Update from ..., Revert): allowed');
  const refused = descriptionState(custom, 'phrase', VAULT);
  assert.equal(refused.kind, 'custom-note');
});

test('Revert to generated: the grammar\'s Python from the json cache, every derived part with it; the note is Description-sourced again, not custom, no Python-source stamp; no cache, no revert', () => {
  const n = morph();
  const custom = asCustom(withPython(n, (py) => `${py}\n  print('x')`));
  const r = revertToGeneratedText(custom, 'phrase_003', 'phrase');
  assert.ok(r.ok, JSON.stringify(r)); if (!r.ok) return;
  assert.equal(r.text, n, 'byte for byte the note the controls made');
  assert.equal(isCustomNote(r.text), false);
  assert.equal(field(r.text, CUSTOM_KEY), undefined);
  assert.equal(field(r.text, PYTHON_SOURCE_KEYS[0]), undefined);
  const noCache = custom.replace(/```json[\s\S]*?```/, '```json\n{ not json\n```');
  assert.deepEqual(revertToGeneratedText(noCache, 'phrase_003', 'phrase'), { ok: false, message: 'Revert to generated: the note\'s json cache cannot be read, so there is no last good version to go back to.' });
  assert.equal(descriptionState(noCache, 'phrase', VAULT).kind === 'custom-note' && (descriptionState(noCache, 'phrase', VAULT) as { canRevert: boolean }).canRevert, false, 'no cache: the banner offers no revert');
  // the plain Revert of a Python edit drops the edit too
  const edited = withPython(n, (py) => py.replace('bars=8', 'bars=6'));
  const back = revertDescriptionText(edited, 'phrase_003', 'phrase');
  assert.ok(back.ok && back.text === n);
});

test('the same for an ARRANGEMENT (a track muted in the Python maps back; an extra statement makes it custom) and a COMPOSITION (a section\'s length changed maps back; a loop makes it custom)', () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_003' }] });
  const muted = withPython(arr, (py) => py.replace("'bars': phrase_003()", "'bars': phrase_003(), 'mute': True"));
  const sa = descriptionState(muted, 'arrangement', VAULT);
  assert.equal(sa.kind, 'python-apply');
  const wa = applyPythonText(muted, 'arr_001', 'arrangement', VAULT, (sa as { python: string }).python);
  assert.ok(wa.ok); if (!wa.ok) return;
  assert.deepEqual(cacheParams(wa.text, 'arrangement'), { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_003', mute: true }] });
  assert.match(extractDescription(wa.text), /Mute the \[\[latin\]\] kit\./);
  const oddA = withPython(arr, (py) => py.replace('  return bars', "  bars = [b for b in bars]\n  return bars"));
  assert.equal(descriptionState(oddA, 'arrangement', VAULT).kind, 'python-custom');
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 8 }, { source: 'phrases/phrase_003', length: 4 }] });
  const longer = withPython(comp, (py) => py.replace("'length': 4", "'length': 6"));
  const sc = descriptionState(longer, 'composition', VAULT);
  assert.equal(sc.kind, 'python-apply');
  const wc = applyPythonText(longer, 'comp_001', 'composition', VAULT, (sc as { python: string }).python);
  assert.ok(wc.ok); if (!wc.ok) return;
  assert.deepEqual(cacheParams(wc.text, 'composition'), { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 8 }, { source: 'phrases/phrase_003', length: 6 }] });
  const loop = withPython(comp, (py) => py.replace('  return bars', '  for i in range(3):\n    bars = bars\n  return bars'));
  assert.equal(descriptionState(loop, 'composition', VAULT).kind, 'python-custom');
  void applyArrangementWrite; void applyCompositionWrite; void refreshArrangementNoteText; void refreshCompositionNoteText; void PHRASE_DEFAULTS;
});

test('pythonTextOf: the fence under # Python as the person has it - a comment at the start of a line stays in it (the shared extractor cuts the section there); the same text as the shared extractor for a note the plugin wrote', () => {
  const n = morph();
  assert.equal(pythonTextOf(n), (n.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]);
  const typed = n.replace('```python\n', '```python\n# my own\n');
  assert.ok(pythonTextOf(typed)!.startsWith('# my own\ndef compute'), 'kept whole');
  assert.equal(pythonTextOf('no python heading'), null);
  assert.equal(pythonEdit(n, null).kind, 'none');
  assert.equal(pythonEdit(typed, null).kind, 'apply', 'a comment alone is a known shape');
});
