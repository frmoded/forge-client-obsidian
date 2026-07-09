// v0.2.285 drain 1700 — empty-Recipe detection tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkEmptyRecipeForTranspile } from './write-source-python-back-empty-recipe-core.ts';

const EXPECTED_NOTICE =
  'Fresh note: no valid Recipe to transpile. Try refining the Description or check the previous notice from Recipe generation.';

test('drain-1700 empty-recipe: null body → skip transpile + surface notice', () => {
  const r = checkEmptyRecipeForTranspile(null);
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: undefined body → skip', () => {
  const r = checkEmptyRecipeForTranspile(undefined);
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: empty string → skip', () => {
  const r = checkEmptyRecipeForTranspile('');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: whitespace-only body → skip', () => {
  const r = checkEmptyRecipeForTranspile('\n\n   \n\t\n');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: single # comment → skip', () => {
  const r = checkEmptyRecipeForTranspile('# missing chip: foo');
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: multiple # comments + blank lines → skip', () => {
  const r = checkEmptyRecipeForTranspile(
    '# missing chip: foo\n\n# missing chip: bar\n\n',
  );
  assert.equal(r.shouldTranspile, false);
  assert.equal(r.noticeText, EXPECTED_NOTICE);
});

test('drain-1700 empty-recipe: single Return statement → transpile', () => {
  const r = checkEmptyRecipeForTranspile('Return 42.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: valid Let + Return → transpile', () => {
  const r = checkEmptyRecipeForTranspile(
    'Let x = Call [[chorus]].\nReturn x.',
  );
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: valid stmt + comment → transpile (comments are metadata)', () => {
  const r = checkEmptyRecipeForTranspile(
    '# valid annotation\nLet x = Call [[chorus]].\nReturn x.',
  );
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: shorthand-call statement → transpile', () => {
  const r = checkEmptyRecipeForTranspile('[[show_score]] score.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});

test('drain-1700 empty-recipe: bogus prose → transpile (falls through to E-- parse error)', () => {
  // Non-empty and non-comment → shouldTranspile true; E-- will reject
  // this downstream. This check is a gap-preventer for EMPTY, not a
  // syntax validator (that's sanitizeLlmRecipe's job upstream).
  const r = checkEmptyRecipeForTranspile('Let me think about this.');
  assert.equal(r.shouldTranspile, true);
  assert.equal(r.noticeText, null);
});
