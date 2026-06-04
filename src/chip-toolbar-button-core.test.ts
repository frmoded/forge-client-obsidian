// Pure-core tests for chip-toolbar-button-core.ts.
//
// v0.2.46 — user-reported gap: the dedicated chip palette icon "used
// to exist and now feels missing." Investigation (see feedback file
// 2026-06-04-1130-revive-chip-palette-icon-or-improve-discoverability.md
// §1.2) found the editor-toolbar `puzzle` button at main.ts:752-757
// existed but was gated on `chipPalette.length > 0`. In a vault with
// no loaded chips (the surfacing case), the button never appeared —
// the same discoverability trap that c3848d9 fixed for the action-
// menu entry.
//
// Decision: gate on file type only. Chip palette emptiness is
// discovered via the chips view's existing empty-state messaging,
// NOT by hiding the button.
//
// Pure-core extraction No. 15 — same `node --test` convention as the
// fourteen prior extractions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowChipsToolbarButton } from './chip-toolbar-button-core.ts';

test('shouldShowChipsToolbarButton: action snippet with chips → true (happy path)', () => {
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'action', chipsCount: 7 }), true);
});

test('shouldShowChipsToolbarButton: action snippet WITHOUT chips → true (load-bearing — closes the c3848d9-pattern discoverability trap)', () => {
  // The PRE-v0.2.46 behavior was: button hidden when chipsCount === 0,
  // even on action snippets. That hid the affordance from users in
  // fresh vaults / vaults without any installed _chips.md, who
  // couldn't then discover that authoring a _chips.md would surface
  // the palette. Diverges from the original prompt's §1.1 case 4
  // ("no chips for vault → false") — documented in §2 of the
  // feedback. The chips view's empty-state messaging is the discovery
  // surface, not button suppression.
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'action', chipsCount: 0 }), true);
});

test('shouldShowChipsToolbarButton: data snippet → false (chips insert snippet CALLS; data snippets do not compute)', () => {
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'data', chipsCount: 7 }), false);
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'data', chipsCount: 0 }), false);
});

test('shouldShowChipsToolbarButton: snapshot snippet → false (auto-generated, no authoring context)', () => {
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'snapshot', chipsCount: 7 }), false);
});

test('shouldShowChipsToolbarButton: non-snippet markdown (no type field) → false', () => {
  // The chip toolbar button costs visual presence on every markdown
  // view it's added to (the original e4ed813 retirement rationale).
  // Limiting to snippet authoring contexts honors that.
  assert.equal(shouldShowChipsToolbarButton({ fileType: undefined, chipsCount: 7 }), false);
  assert.equal(shouldShowChipsToolbarButton({ fileType: undefined, chipsCount: 0 }), false);
});

test('shouldShowChipsToolbarButton: unknown frontmatter type → false (defensive)', () => {
  // A future cohort might author snippets with a new `type` value;
  // the button stays hidden until the helper is amended. Better than
  // the alternative (showing on unknown types and surprising users).
  assert.equal(shouldShowChipsToolbarButton({ fileType: 'experimental', chipsCount: 5 }), false);
  assert.equal(shouldShowChipsToolbarButton({ fileType: '', chipsCount: 5 }), false);
});

test('shouldShowChipsToolbarButton: idempotent — same input yields same output (no-op-stays-no-op)', () => {
  // Trivial for a pure function but explicit per the cc-prompt-queue.md
  // "idempotent helper" rider. Future refactors that introduce
  // observable side-effects to the decision should fail this.
  const ctx = { fileType: 'action' as const, chipsCount: 3 };
  const first = shouldShowChipsToolbarButton(ctx);
  const second = shouldShowChipsToolbarButton(ctx);
  assert.equal(first, second);
  assert.equal(first, true);
});
