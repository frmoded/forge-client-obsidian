import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampStripFraction, stripFractionFromDrag, stripFlexBasis,
  DEFAULT_STRIP_FRACTION, MIN_STRIP_FRACTION, MAX_STRIP_FRACTION,
} from './forge-panel-split-core.ts';

test('a stored 0% or 100% is NOT restorable — the Gate V requirement', () => {
  // Either extreme hides one region AND the divider that would undo it.
  assert.equal(clampStripFraction(0), MIN_STRIP_FRACTION);
  assert.equal(clampStripFraction(1), MAX_STRIP_FRACTION);
  assert.equal(clampStripFraction(-5), MIN_STRIP_FRACTION);
  assert.equal(clampStripFraction(42), MAX_STRIP_FRACTION);
});

test('a junk or absent setting falls back rather than breaking the panel', () => {
  // data.json is hand-editable and an older build may have written another
  // shape. A broken setting must not stop the panel rendering.
  for (const junk of [undefined, null, NaN, Infinity, -Infinity, '0.5', {}, []]) {
    assert.equal(clampStripFraction(junk), DEFAULT_STRIP_FRACTION, `${String(junk)} not defaulted`);
  }
});

test('a sane stored value is returned untouched', () => {
  // Non-vacuity: if the clamp swallowed everything the feature would not work.
  for (const v of [0.15, 0.33, 0.5, 0.75]) assert.equal(clampStripFraction(v), v);
});

test('the default matches the pre-drain CSS, so an untouched layout does not move', () => {
  assert.equal(DEFAULT_STRIP_FRACTION, 0.33);
});

test('dragging up grows the strip; dragging down shrinks it', () => {
  const top = 0, height = 1000;
  // Pointer near the bottom -> small strip.
  assert.ok(stripFractionFromDrag(900, top, height) < 0.2);
  // Pointer near the middle -> about half.
  assert.equal(stripFractionFromDrag(500, top, height), 0.5);
  // Pointer near the top -> large strip, but bounded.
  assert.equal(stripFractionFromDrag(10, top, height), MAX_STRIP_FRACTION);
});

test('a drag past either bound stops instead of inverting the layout', () => {
  assert.equal(stripFractionFromDrag(-500, 0, 1000), MAX_STRIP_FRACTION);
  assert.equal(stripFractionFromDrag(5000, 0, 1000), MIN_STRIP_FRACTION);
});

test('a zero-height or unmeasured panel does not produce NaN', () => {
  // getBoundingClientRect can return 0 before layout settles.
  assert.equal(stripFractionFromDrag(100, 0, 0), DEFAULT_STRIP_FRACTION);
  assert.equal(stripFractionFromDrag(100, 0, NaN), DEFAULT_STRIP_FRACTION);
});

test('a non-zero panel offset is respected', () => {
  // The panel is not always at viewport top; the maths must use panelTop.
  assert.equal(stripFractionFromDrag(700, 200, 1000), 0.5);
});

test('flex-basis is a clamped percentage string', () => {
  assert.equal(stripFlexBasis(0.5), '50.00%');
  assert.equal(stripFlexBasis(0), `${(MIN_STRIP_FRACTION * 100).toFixed(2)}%`);
  assert.equal(stripFlexBasis(99), `${(MAX_STRIP_FRACTION * 100).toFixed(2)}%`);
});
