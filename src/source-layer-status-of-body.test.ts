// 2026-10-29-0920 item 2 (CCQA regression step 5(ii)): on a freshly committed Recipe-only note the status bar said "Forge: synced" while the Python heading said "out of date" (the stub `return None`), before the first Run.
// The two used different inputs: the heading draws from the note's stored source_facet plus per-facet freshness (computeFacetStates), the bar from whichLayerIsSource alone. These tests run the REAL functions on real note text and pin the
// PROPERTY: the bar never says "synced" for a note whose heading says a facet is out of date, nor when the Python facet is the stub. (Pins the property, not the label's spelling beyond the two words it must not contain.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { computeFacetHash } from './facet-hash-core.ts';
import { sourceLayerStatusOf } from './source-layer-status-of-body-core.ts';
import { sourceLayerStatusLabel, sourceLayerStatusTooltip } from './source-layer-status-bar-core.ts';

const RECIPE = 'Return "hello".';
const STUB_PYTHON = 'def compute(context):\n    return None';
const note = (fm: string, python: string): string => `---\ntype: action\n${fm}---\n\n# Description\n\nSay hello.\n\n# Recipe\n\n${RECIPE}\n\n# Python\n\n\`\`\`python\n${python}\n\`\`\`\n`;
const label = async (body: string): Promise<string> => { const s = await sourceLayerStatusOf(body); return sourceLayerStatusLabel(s.isV2, s.canonical, s.staleFacets); };

test('the cause, on a freshly committed Recipe-only note (Recipe stamped, source_facet recipe, Python still the stub): the bar must not say synced while the Python facet is out of date', async () => {
  const body = note(`source_facet: recipe\nrecipe_hash: ${await computeFacetHash(RECIPE)}\n`, STUB_PYTHON);
  const s = await sourceLayerStatusOf(body);
  assert.deepEqual(s.staleFacets, ['python'], 'the heading draws Python as out of date');
  assert.doesNotMatch(await label(body), /synced/i);
  assert.match(await label(body), /Python/);
  assert.doesNotMatch(sourceLayerStatusTooltip(s.canonical, s.staleFacets), /All three facets/, 'and the tooltip does not claim the three facets match either');
});

test('a stub Python facet is never "synced", even when every stored hash and lineage stamp happens to match (the stub certifies nothing)', async () => {
  const r = await computeFacetHash(RECIPE);
  const body = note(`source_facet: synced\nrecipe_hash: ${r}\npython_hash: ${await computeFacetHash(STUB_PYTHON)}\npython_derived_from_recipe_hash: ${r}\n`, STUB_PYTHON);
  const s = await sourceLayerStatusOf(body);
  assert.ok(s.staleFacets.includes('python'), `Python is among the stale facets: ${s.staleFacets.join(',')}`);
  assert.doesNotMatch(await label(body), /synced/i);
});

test('no harm: a note whose facets are all fresh and whose Python is real code is still "Forge: synced"; so are the shipped, fully derived fixtures', async () => {
  const r = await computeFacetHash(RECIPE);
  const real = 'def compute(context):\n    return "hello"';
  const fresh = note(`source_facet: recipe\nrecipe_hash: ${r}\npython_hash: ${await computeFacetHash(real)}\npython_derived_from_recipe_hash: ${r}\n`, real);
  assert.equal(await label(fresh), 'Forge: synced');
  const quiz = fs.readFileSync(path.resolve(import.meta.dirname, '../test/fixtures/vault/shipped_scale_quality_quiz_fully_derived.md'), 'utf8');
  const s = await sourceLayerStatusOf(quiz);
  assert.deepEqual(s.staleFacets, []);
  assert.equal(await label(quiz), 'Forge: synced');
});

test('the labels that were not "synced" are unchanged: a source is named whatever is stale, a non-V2 note says nothing', async () => {
  assert.equal(sourceLayerStatusLabel(true, 'recipe', ['python']), 'Forge: Recipe source');
  assert.equal(sourceLayerStatusLabel(true, 'description', ['recipe', 'python']), 'Forge: Description source');
  assert.equal(sourceLayerStatusLabel(true, 'python', []), 'Forge: Python source');
  assert.equal(sourceLayerStatusLabel(false, null, []), '');
  assert.equal(sourceLayerStatusLabel(true, 'synced'), 'Forge: synced', 'callers that pass no stale list get the old behaviour');
  assert.equal(sourceLayerStatusLabel(true, null, []), 'Forge: probe failed');
});

test('which facets are named: one stale facet by name, two joined, in the order of the note', () => {
  assert.equal(sourceLayerStatusLabel(true, 'synced', ['python']), 'Forge: Python out of date');
  assert.equal(sourceLayerStatusLabel(true, 'synced', ['recipe', 'python']), 'Forge: Recipe and Python out of date');
});

test('the agreement, over every fixture note: the bar says synced exactly when no facet is stale (one definition feeds the bar and the headings)', async () => {
  const dir = path.resolve(import.meta.dirname, '../test/fixtures/vault');
  let synced = 0; let notSynced = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const body = fs.readFileSync(path.join(dir, f), 'utf8');
    const s = await sourceLayerStatusOf(body);
    if (!s.isV2) continue;
    const says = sourceLayerStatusLabel(s.isV2, s.canonical, s.staleFacets);
    assert.equal(/synced/i.test(says), s.canonical === 'synced' && s.staleFacets.length === 0, `${f}: ${says} (stale: ${s.staleFacets.join(',') || 'none'})`);
    if (/synced/i.test(says)) synced++; else notSynced++;
  }
  assert.ok(synced > 0 && notSynced > 0, 'non-vacuity: both kinds of note are in the fixture set');
});

// ---- gaps the mutation pass found ------------------------------------------------------------------------------------------------------------------------------------------------------------

const FIX = (name: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '../test/fixtures/vault', name), 'utf8');

test('a note that is not a V2 note has no state: not V2, nothing stale, no states', async () => {
  const s = await sourceLayerStatusOf('just some text, no frontmatter\n');
  assert.deepEqual([s.isV2, s.canonical, s.effective, s.states, s.staleFacets], [false, null, null, null, []]);
});

test('each kind of "out of date" names its facet: a Description edit makes the Recipe stale, a stale Recipe makes the Python stale, and what is current is not named', async () => {
  const desc = await sourceLayerStatusOf(FIX('hexa_desc_hand_edited_downstream_out_of_date.md'));
  assert.ok(desc.staleFacets.includes('recipe'), `Recipe is derived from an older Description: ${desc.staleFacets.join(',')}`);
  assert.ok(!desc.staleFacets.includes('description'), 'the facet that was edited is the source, not stale');
  const transitive = await sourceLayerStatusOf(FIX('hexa_recipe_out_of_date_transitive_python.md'));
  assert.ok(transitive.staleFacets.includes('python'), `Python follows a stale Recipe: ${transitive.staleFacets.join(',')}`);
  const aligned = await sourceLayerStatusOf(FIX('shipped_scale_quality_quiz_fully_derived.md'));
  assert.deepEqual(aligned.staleFacets, [], 'a fully derived note names nothing');
});

test('the stub is recognised however it is spaced (tabs, blank lines, trailing space), and real code that merely contains "return None" is not the stub', async () => {
  const r = await computeFacetHash(RECIPE);
  const withPython = async (python: string): Promise<string[]> => (await sourceLayerStatusOf(note(`source_facet: recipe\nrecipe_hash: ${r}\npython_derived_from_recipe_hash: ${r}\npython_hash: ${await computeFacetHash(python)}\n`, python))).staleFacets;
  assert.deepEqual(await withPython('def compute(context):\n\n\treturn None  \n'), ['python']);
  assert.deepEqual(await withPython('def compute(context):\n    x = 1\n    return None'), [], 'real code is not the stub');
});

test('the words of the label and the tooltip when something is out of date: names, "is" for one and "are" for several, and what to do', () => {
  assert.equal(sourceLayerStatusLabel(true, 'synced', ['description']), 'Forge: Description out of date');
  assert.match(sourceLayerStatusTooltip('synced', ['python']), /^Python is out of date: derived from an earlier version of what it comes from, or not generated yet\. Run \(or Forge-click\) will bring it up to date\.$/);
  assert.match(sourceLayerStatusTooltip('synced', ['recipe', 'python']), /^Recipe and Python are out of date: /);
  assert.match(sourceLayerStatusTooltip('synced', []), /^All three facets/, 'nothing stale: the old tooltip');
});
