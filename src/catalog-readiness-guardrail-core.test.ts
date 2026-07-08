// v0.2.281 CW-2100 cleanup — verifies the closure-check guardrail
// semantic under the `_libraryCatalogLoaded` boolean field. The
// production code path (main.ts CW-2000 Description-canonical branch)
// consults `this._libraryCatalogLoaded` to decide whether to skip the
// closure check. This test file exercises the same three-state
// contract via a minimal harness so we can lock in the semantic
// without importing the full plugin class.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRecipeClosure } from './write-generated-recipe-core.ts';

/** Mirror of the CW-2000 Description-canonical branch guardrail (main.ts).
 *  Isolated so we can exercise its 3 cases independently. */
function runClosureGuardrail(input: {
  llmRecipe: string;
  knownIds: Set<string>;
  libraryCatalogLoaded: boolean;
}): { closureRan: boolean; ok: boolean; unresolved: string[]; warned: boolean } {
  const closure = input.libraryCatalogLoaded
    ? checkRecipeClosure(input.llmRecipe, (id) => input.knownIds.has(id))
    : { ok: true as const, wikilinks: [] };
  const warned = !input.libraryCatalogLoaded;
  const unresolved =
    closure.ok === false ? closure.unresolved : [];
  return {
    closureRan: input.libraryCatalogLoaded,
    ok: closure.ok,
    unresolved,
    warned,
  };
}

test('CW-2100 cleanup: _libraryCatalogLoaded=false → guardrail skips closure check + warns', () => {
  const result = runClosureGuardrail({
    llmRecipe: 'Let x = Call [[unknown_chip]]. Return x.',
    knownIds: new Set(),
    libraryCatalogLoaded: false,
  });
  assert.equal(result.closureRan, false);
  assert.equal(result.ok, true);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.warned, true);
});

test('CW-2100 cleanup: _libraryCatalogLoaded=true + empty known set → closure REJECTS unresolved', () => {
  // Zero-note domain edge case: catalog loaded (`_libraryCatalogLoaded`
  // = true) but happens to contain zero library chips. Closure check
  // MUST run — if the Recipe references chips, they'll rightly fail
  // to resolve. Pre-cleanup `.size === 0` proxy would have false-
  // triggered here.
  const result = runClosureGuardrail({
    llmRecipe: 'Let x = Call [[foo]]. Return x.',
    knownIds: new Set(),
    libraryCatalogLoaded: true,
  });
  assert.equal(result.closureRan, true);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unresolved, ['foo']);
  assert.equal(result.warned, false);
});

test('CW-2100 cleanup: _libraryCatalogLoaded=true + populated known set → closure accepts valid Recipe', () => {
  const result = runClosureGuardrail({
    llmRecipe: 'Let x = Call [[kick]]. Return x.',
    knownIds: new Set(['kick', 'snare']),
    libraryCatalogLoaded: true,
  });
  assert.equal(result.closureRan, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.warned, false);
});

test('CW-2100 cleanup: zero-note domain no longer false-triggers skip (regression vs .size proxy)', () => {
  // The bug the cleanup addresses: if a domain has zero library chips,
  // `libraryNoteIndex.size === 0` would evaluate the same as "catalog
  // not loaded yet" and wrongly skip closure. The boolean field
  // disambiguates: catalog IS loaded, index just happens to be empty.
  const result = runClosureGuardrail({
    llmRecipe: 'Let x = Call [[missing_chip]]. Return x.',
    knownIds: new Set(), // no known chips at all — empty registry
    libraryCatalogLoaded: true, // but the catalog HAS loaded
  });
  assert.equal(result.closureRan, true, 'closure MUST run under empty-but-loaded catalog');
  assert.equal(result.ok, false, 'unresolved wikilink must be caught');
  assert.deepEqual(result.unresolved, ['missing_chip']);
});
