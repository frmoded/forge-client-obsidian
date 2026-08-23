// Drain 2026-08-24-1600 §4-5 — a derivation stamp may never be the
// empty-string hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  EMPTY_STRING_SHA256,
  setFrontmatterField,
  getFrontmatterField,
} from './v2-note-core.ts';

const NOTE = '---\ntype: action\n---\n\n# Description\n\nx\n';

test('EMPTY_STRING_SHA256 really is sha256("")', () => {
  // NON-VACUITY for the constant itself: a typo'd literal would make
  // the guard below unreachable and every test here green for nothing.
  assert.equal(EMPTY_STRING_SHA256, createHash('sha256').update('').digest('hex'));
});

test('a derivation stamp refuses the empty-string hash', () => {
  for (const field of [
    'python_derived_from_recipe_hash',
    'recipe_derived_from_description_hash',
    'recipe_derived_from_source_hash',
    'python_derived_from_source_hash',
  ]) {
    const out = setFrontmatterField(NOTE, field, EMPTY_STRING_SHA256);
    assert.equal(out, NOTE, `${field} was stamped`);
    assert.equal(getFrontmatterField(out, field), null, field);
  }
});

test('a derivation stamp accepts a real hash', () => {
  // NON-VACUITY: a guard that refused everything would pass the test
  // above while breaking every honest stamp in the system.
  const real = createHash('sha256').update('Return 1.').digest('hex');
  const out = setFrontmatterField(NOTE, 'python_derived_from_recipe_hash', real);
  assert.equal(getFrontmatterField(out, 'python_derived_from_recipe_hash'), real);
});

test('a facet CONTENT hash may still be the empty-string hash', () => {
  // NON-VACUITY on the field list. An empty facet legitimately hashes
  // to sha256("") — barring that would be a different, wrong rule, and
  // is why the list is literal rather than a `*_hash` pattern.
  const out = setFrontmatterField(NOTE, 'recipe_hash', EMPTY_STRING_SHA256);
  assert.equal(getFrontmatterField(out, 'recipe_hash'), EMPTY_STRING_SHA256);
});

// ---------------------------------------------------------------------
// Drain 2026-08-24-1600, coupled symptom — CCQA check 5.
//
// The facet-aware exec hint (drain 0920) shipped in v0.2.365, yet the
// broken notes showed the old "open the note's # Python" wording. Not
// the P1's mechanism: `forgeSnippet`'s Description-canonical branch
// called runSnippet WITHOUT its canonicalLayer, so classifyForgeError
// saw undefined and took its designed fallback — on the one branch
// that is Description-canonical by construction.
// ---------------------------------------------------------------------

import fsMod from 'node:fs';
import pathMod from 'node:path';

function mainSrc(): string {
  return fsMod.readFileSync(pathMod.resolve(process.cwd(), 'src/main.ts'), 'utf8');
}

test('the Description-canonical branch threads its facet into runSnippet', () => {
  const src = mainSrc();
  assert.ok(
    src.includes("await this.runSnippet('Forge failed during execution', canonicalLayer, file);"),
    'the Description-canonical branch dropped canonicalLayer again',
  );
});

test('the python-mode branch threads its facet too', () => {
  assert.ok(
    mainSrc().includes("await this.runSnippet('Forge failed during execution', 'python', file);"),
  );
});

test('no forgeSnippet run-call silently drops the facet where it is in scope', () => {
  // NON-VACUITY / the general form. Two of the three call sites inside
  // forgeSnippet passed `undefined` while the value sat in scope; only
  // one did so legitimately (the V1 / free-English tail, where the
  // variable genuinely is not in scope and undefined is the honest
  // answer). Anything beyond that one is the defect returning.
  const src = mainSrc();
  const undefinedCalls = [...src.matchAll(
    /await this\.runSnippet\('Forge failed during execution', undefined, file\);/g)];
  assert.equal(undefinedCalls.length, 1, `${undefinedCalls.length} run-calls drop the facet`);
});
