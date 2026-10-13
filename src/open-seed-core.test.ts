// Drain 2026-10-13-2100 §2/§5 — `planOpenSeed`: what merely OPENING a note writes. Moved out of main.ts unchanged; these pin the
// decision table so the extraction (and any later edit) cannot silently change it, and give "opening is read-only" a headless proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { planOpenSeed } from './open-seed-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField } from './v2-note-core.ts';

const helpers = {
  extractDescription, extractRecipeSection, extractPythonSection,
  getFrontmatterField: (b: string, k: string) => getFrontmatterField(b, k),
  computeFacetHash,
};

const body = (fm: string, parts: { d?: string; r?: string | null; p?: string | null } = {}) => {
  const d = parts.d ?? 'Say hello.';
  const r = parts.r === undefined ? 'Print "hello".' : parts.r;
  const p = parts.p === undefined ? "def compute(context):\n  print('hello')" : parts.p;
  return `---\ntype: action\n${fm}\n---\n\n# Description\n\n${d}\n\n${r === null ? '' : `# Recipe\n\n${r}\n\n`}${p === null ? '' : `# Python\n\n\`\`\`python\n${p}\n\`\`\`\n`}`;
};

async function hashes(b: string) {
  return {
    d: await computeFacetHash(extractDescription(b)),
    r: await computeFacetHash(extractRecipeSection(b) ?? ''),
    p: await computeFacetHash(extractPythonSection(b) ?? ''),
  };
}

test('a fully-stamped note: opening it writes NOTHING', async () => {
  const draft = body('source_facet: description');
  const h = await hashes(draft);
  const full = body(`description_hash: ${h.d}\nrecipe_hash: ${h.r}\npython_hash: ${h.p}\nsource_facet: description\nrecipe_derived_from_description_hash: ${h.d}\npython_derived_from_recipe_hash: ${h.r}`);
  const plan = await planOpenSeed(full, helpers);
  assert.equal(plan.write, false);
  assert.equal(plan.setSourceFacet, null);
  assert.equal(plan.seedRecipeParent, null);
  assert.equal(plan.seedPythonParent, null);
});

test('source_facet absent + a stale Description hash → seeded "description" (upstream wins)', async () => {
  const plan = await planOpenSeed(body('description_hash: stale\nrecipe_hash: r\npython_hash: p'), helpers);
  assert.equal(plan.write, true);
  assert.equal(plan.setSourceFacet, 'description');
});

test('source_facet absent + only the Python hash drifted → seeded "python"', async () => {
  const draft = body('x: 1');
  const h = await hashes(draft);
  const plan = await planOpenSeed(body(`description_hash: ${h.d}\nrecipe_hash: ${h.r}\npython_hash: stale`), helpers);
  assert.equal(plan.setSourceFacet, 'python');
});

test('source_facet absent, nothing drifted → "synced"', async () => {
  const draft = body('x: 1');
  const h = await hashes(draft);
  const plan = await planOpenSeed(body(`description_hash: ${h.d}\nrecipe_hash: ${h.r}\npython_hash: ${h.p}`), helpers);
  assert.equal(plan.setSourceFacet, 'synced');
});

test('no stored hashes at all → the populated facet is the source (Description first)', async () => {
  assert.equal((await planOpenSeed(body('x: 1'), helpers)).setSourceFacet, 'description');
  assert.equal((await planOpenSeed(body('x: 1', { d: '' }), helpers)).setSourceFacet, 'recipe');
  assert.equal((await planOpenSeed(body('x: 1', { d: '', r: null }), helpers)).setSourceFacet, 'python');
});

test('legacy canonical_facet only → migrated across, not re-seeded', async () => {
  const plan = await planOpenSeed(body('canonical_facet: recipe'), helpers);
  assert.equal(plan.write, true);
  assert.equal(plan.setSourceFacet, 'recipe');
});

test('v11.6 parent hashes seed only when the legacy value is unambiguous', async () => {
  const draft = body('x: 1');
  const h = await hashes(draft);
  const ok = await planOpenSeed(body(
    `description_hash: ${h.d}\nrecipe_hash: ${h.r}\npython_hash: ${h.p}\nsource_facet: description\n` +
    `recipe_derived_from_source_hash: ${h.d}\npython_derived_from_source_hash: ${h.r}`), helpers);
  assert.equal(ok.write, true);
  assert.equal(ok.seedRecipeParent, h.d);
  assert.equal(ok.seedPythonParent, h.r);
  // two-hop Description-canonical: python's legacy parent is the DESCRIPTION hash → left absent (CW-1500-B)
  const twoHop = await planOpenSeed(body(
    `description_hash: ${h.d}\nrecipe_hash: ${h.r}\npython_hash: ${h.p}\nsource_facet: description\n` +
    `python_derived_from_source_hash: ${h.d}`), helpers);
  assert.equal(twoHop.seedPythonParent, null);
  assert.equal(twoHop.write, false);
});

test('the three current hashes and the lineage snapshot are returned for the caller\'s cache', async () => {
  const b = body('python_derived_from_recipe_hash: abc');
  const plan = await planOpenSeed(b, helpers);
  assert.deepEqual({ d: plan.current.desc, r: plan.current.recipe, p: plan.current.python }, await hashes(b));
  assert.equal(plan.pyDerivedFrom, 'abc');
});

test('MECHANISM pin — seedSourceFacetForOpenFiles asks the core; no inline copy of the inference remains', () => {
  const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const start = main.indexOf('private async seedSourceFacetForOpenFiles(');
  const end = main.indexOf('private async maybeBackfillV113Shape(');
  const method = main.slice(start, end);
  assert.match(method, /planOpenSeed\(/);
  assert.doesNotMatch(method, /dMismatch|noStoredHashes/, 'the inference lives in open-seed-core.ts');
  assert.match(method, /if \(!plan\.write\)\s*\{\s*continue;/, 'a note the plan says needs no write is skipped');
  assert.match(method, /plan\.setSourceFacet !== null/);
});
