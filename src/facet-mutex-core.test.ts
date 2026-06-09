// v0.2.83 — tests for facet-mutex-core decision logic. 10 cases per
// the v0.2.80 prompt's §4.1 plus a few edge-case regression guards.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideInitialState,
  decideOnFoldChange,
  type SnippetHeadings,
} from './facet-mutex-core.ts';

// --- decideInitialState ---------------------------------------------

test('decideInitialState: english + both headings → fold python only', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  assert.deepEqual(
    decideInitialState('english', headings),
    { englishFolded: false, pythonFolded: true, newEditMode: null });
});

test('decideInitialState: python + both headings → fold english only', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  assert.deepEqual(
    decideInitialState('python', headings),
    { englishFolded: true, pythonFolded: false, newEditMode: null });
});

test('decideInitialState: english + only-english heading → no folds', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: null };
  assert.deepEqual(
    decideInitialState('english', headings),
    { englishFolded: false, pythonFolded: false, newEditMode: null });
});

test('decideInitialState: python + only-python heading → no folds', () => {
  const headings: SnippetHeadings = { englishLine: null, pythonLine: 12 };
  assert.deepEqual(
    decideInitialState('python', headings),
    { englishFolded: false, pythonFolded: false, newEditMode: null });
});

test('decideInitialState: english + neither heading → no folds', () => {
  const headings: SnippetHeadings = { englishLine: null, pythonLine: null };
  assert.deepEqual(
    decideInitialState('english', headings),
    { englishFolded: false, pythonFolded: false, newEditMode: null });
});

// --- decideOnFoldChange ---------------------------------------------

test('decideOnFoldChange: english mode, user expanded python → flip to python', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  // Initial state for english mode: english unfolded, python folded.
  // User expands python.
  const prev = { englishFolded: false, pythonFolded: true };
  const next = { englishFolded: false, pythonFolded: false };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: true, pythonFolded: false, newEditMode: 'python' });
});

test('decideOnFoldChange: python mode, user expanded english → flip to english', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: true, pythonFolded: false };
  const next = { englishFolded: false, pythonFolded: false };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'python', headings),
    { englishFolded: false, pythonFolded: true, newEditMode: 'english' });
});

// v0.2.83 — original asymmetric semantics: collapse-of-active was a
// no-op. v0.2.87 supersedes this. The test below documents the v0.2.83
// behavior for retrospective reference; the active assertions are now
// in the v0.2.87 symmetric-mutex tests further down.
//
// test('decideOnFoldChange: english mode, user collapsed english (both
// now folded) → no flip' — REPLACED by symmetric-mutex tests below.

test('decideOnFoldChange: english mode, user expanded already-unfolded english → no-op', () => {
  // Both english and python already unfolded (somehow), then a "same"
  // event arrives — idempotent no-op (no flip, no fold).
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: false, pythonFolded: true };
  const next = { englishFolded: false, pythonFolded: true };  // unchanged
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: false, pythonFolded: true, newEditMode: null });
});

test('decideOnFoldChange: state already matches edit_mode → no-op', () => {
  // Steady state: english unfolded, python folded; user does nothing
  // observable (event noise). No flip.
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: false, pythonFolded: true };
  const next = { englishFolded: false, pythonFolded: true };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: false, pythonFolded: true, newEditMode: null });
});

// --- edge cases (regression guards) ---------------------------------

test('decideOnFoldChange: no python heading → no flip even on english-mode "python expand"', () => {
  // If there's no # Python heading, the gestural mutex cannot fire.
  // The newFold passes through unchanged.
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: null };
  const prev = { englishFolded: false, pythonFolded: false };
  const next = { englishFolded: false, pythonFolded: false };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: false, pythonFolded: false, newEditMode: null });
});

test('decideOnFoldChange: python mode, user expanded python (already unfolded) → no flip', () => {
  // Symmetric same-mode-expand: in python mode the python heading
  // is already unfolded; expanding it again is a no-op.
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: true, pythonFolded: false };
  const next = { englishFolded: true, pythonFolded: false };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'python', headings),
    { englishFolded: true, pythonFolded: false, newEditMode: null });
});

// --- v0.2.87 symmetric collapse mutex --------------------------------
//
// Driver decision (2026-06-09-0015): the mutex invariant is "exactly
// one facet visible at any time." Both-folded is an invalid state.
// Collapsing the active facet must flip edit_mode AND auto-expand
// the other facet (symmetric to the expand semantics).

test('decideOnFoldChange v0.2.87: english mode, collapse english (both present) → flip to python + expand python', () => {
  // Initial state for english mode: english unfolded, python folded.
  // User collapses english.
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: false, pythonFolded: true };
  const next = { englishFolded: true, pythonFolded: true };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: true, pythonFolded: false, newEditMode: 'python' });
});

test('decideOnFoldChange v0.2.87: python mode, collapse python (both present) → flip to english + expand english', () => {
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const prev = { englishFolded: true, pythonFolded: false };
  const next = { englishFolded: true, pythonFolded: true };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'python', headings),
    { englishFolded: false, pythonFolded: true, newEditMode: 'english' });
});

test('decideOnFoldChange v0.2.87: english mode, collapse english but python heading absent → no-op', () => {
  // Slot-free snippet with no # Python heading: collapse of the only-
  // existing heading should NOT trigger the mutex (nothing to expand).
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: null };
  const prev = { englishFolded: false, pythonFolded: false };
  const next = { englishFolded: true, pythonFolded: false };
  assert.deepEqual(
    decideOnFoldChange(prev, next, 'english', headings),
    { englishFolded: true, pythonFolded: false, newEditMode: null });
});

test('decideOnFoldChange v0.2.87: english mode, collapse english (both present) — symmetric with expand-python', () => {
  // Same intent as "expand python in english mode → flip to python" but
  // via the collapse gesture. Both should produce equivalent
  // post-mutex state (python visible, english folded, mode=python).
  const headings: SnippetHeadings = { englishLine: 5, pythonLine: 12 };
  const collapseEnglishFromEnglish = decideOnFoldChange(
    { englishFolded: false, pythonFolded: true },
    { englishFolded: true, pythonFolded: true },
    'english', headings);
  const expandPythonFromEnglish = decideOnFoldChange(
    { englishFolded: false, pythonFolded: true },
    { englishFolded: false, pythonFolded: false },
    'english', headings);
  // Both gestures land in the same mode + same fold state.
  assert.equal(collapseEnglishFromEnglish.newEditMode, 'python');
  assert.equal(expandPythonFromEnglish.newEditMode, 'python');
  assert.equal(collapseEnglishFromEnglish.englishFolded, true);
  assert.equal(collapseEnglishFromEnglish.pythonFolded, false);
  assert.equal(expandPythonFromEnglish.englishFolded, true);
  assert.equal(expandPythonFromEnglish.pythonFolded, false);
});
