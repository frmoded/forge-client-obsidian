// v0.2.249 — tests for the Recipe ParseError friendly rewrite
// (drain 2026-07-03-0700).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { friendlyRecipeParseError } from './recipe-parse-error-friendly.ts';

// Real cohort traceback shape from prompt §2.
const KWARG_MISSING_EQUALS = `File "/bundle/engine/forge/recipe/parser.py", line 637, in _parse_kwargs
    raise ParseError(f"expected = after kwarg name {chunk[0].value!r}")
forge.recipe.parser.ParseError: expected = after kwarg name 'a'`;

const UNTERMINATED_STRING = `File "/bundle/engine/forge/recipe/parser.py", line 400, in _parse_string
    raise ParseError("unterminated string literal")
forge.recipe.parser.ParseError: unterminated string literal`;

const UNKNOWN_CHIP = `File "/bundle/engine/forge/core/graph_resolver.py", line 27, in resolve
    raise SnippetResolutionError(reference=snippet_id, searched=...)
forge.core.exceptions.SnippetResolutionError: Snippet 'zork' not found. Searched: authoring, forge (built-in).`;

const UNRELATED_ERROR = `File "<exec>", line 5, in compute
    return foo + 1
NameError: name 'foo' is not defined`;

const UNMATCHED_RECIPE_ERROR = `File "/bundle/engine/forge/recipe/parser.py", line 100
forge.recipe.parser.ParseError: something we haven't seen before`;

test('kwarg-missing-equals → cohort message about kwarg grammar', () => {
  const result = friendlyRecipeParseError(KWARG_MISSING_EQUALS);
  assert.equal(result.matched, true);
  assert.match(result.userMessage, /kwarg near 'a'/);
  assert.match(result.userMessage, /Call \[\[chip\]\] with name=value/);
  assert.equal(result.rawTraceback, KWARG_MISSING_EQUALS);
});

test('unterminated string → cohort message about unclosed quote', () => {
  const result = friendlyRecipeParseError(UNTERMINATED_STRING);
  assert.equal(result.matched, true);
  assert.match(result.userMessage, /unclosed quoted value/);
  assert.match(result.userMessage, /missing closing quote/);
});

test('unknown chip (SnippetResolutionError) → cohort message about library', () => {
  const result = friendlyRecipeParseError(UNKNOWN_CHIP);
  assert.equal(result.matched, true);
  assert.match(result.userMessage, /Chip 'zork'/);
  assert.match(result.userMessage, /Refresh chips/);
});

test('unmatched Recipe-relevant error → generic fallback (still less scary)', () => {
  const result = friendlyRecipeParseError(UNMATCHED_RECIPE_ERROR);
  assert.equal(result.matched, false);
  assert.match(result.userMessage, /Recipe parse error/);
  assert.match(result.userMessage, /something we haven't seen before/);
  // No traceback in the user message
  assert.doesNotMatch(result.userMessage, /File.*line/);
});

test('non-Recipe traceback (runtime NameError) → passes through unchanged', () => {
  const result = friendlyRecipeParseError(UNRELATED_ERROR);
  assert.equal(result.matched, false);
  // No "Recipe parse error" rewrite for unrelated errors
  assert.doesNotMatch(result.userMessage, /Recipe parse error/);
  assert.match(result.userMessage, /NameError/);
});

test('empty traceback → doesn\'t throw; returns empty user message', () => {
  const result = friendlyRecipeParseError('');
  assert.equal(result.matched, false);
  assert.equal(result.userMessage, '');
});

test('raw traceback preserved verbatim in every case', () => {
  const cases = [
    KWARG_MISSING_EQUALS,
    UNTERMINATED_STRING,
    UNKNOWN_CHIP,
    UNRELATED_ERROR,
    UNMATCHED_RECIPE_ERROR,
  ];
  for (const tb of cases) {
    const result = friendlyRecipeParseError(tb);
    assert.equal(result.rawTraceback, tb);
  }
});
