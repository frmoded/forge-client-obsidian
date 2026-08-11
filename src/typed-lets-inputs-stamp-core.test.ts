import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { hasTypedLetsInRecipe, isInBundledLibraryDir } from './typed-lets-inputs-stamp-core.ts';

describe('hasTypedLetsInRecipe', () => {
  test('detects a leading typed Let', () => {
    assert.equal(hasTypedLetsInRecipe('Let pitches: list[str] = ["C4"].\nReturn pitches.'), true);
  });

  test('detects a typed Let not at the start of the body', () => {
    assert.equal(hasTypedLetsInRecipe('Let a = 1.\nLet b: int = 2.\nReturn b.'), true);
  });

  test('returns false for an all-untyped Recipe', () => {
    assert.equal(hasTypedLetsInRecipe('Let a = 1.\nLet b = 2.\nReturn a + b.'), false);
  });

  test('returns false for empty Recipe', () => {
    assert.equal(hasTypedLetsInRecipe(''), false);
  });

  test('does not false-positive on a bare colon inside a Call kwarg', () => {
    assert.equal(hasTypedLetsInRecipe('Return Call [[foo]] with x="a: b".'), false);
  });
});

describe('isInBundledLibraryDir', () => {
  const libs = new Set(['forge-moda', 'music-theory']);

  test('vault-root file is not in a library dir', () => {
    assert.equal(isInBundledLibraryDir('my_note.md', libs), false);
  });

  test('file inside a declared library dir', () => {
    assert.equal(isInBundledLibraryDir('music-theory/theory_exercises/chord_progression.md', libs), true);
  });

  test('file inside a non-library subdir', () => {
    assert.equal(isInBundledLibraryDir('personal/my_note.md', libs), false);
  });
});
