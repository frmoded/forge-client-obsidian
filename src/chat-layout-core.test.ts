// 2026-11-18 (R1, item 3) - the tab-width decision and the silent migration of the retired position setting.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WIDE_MIN_PX, layoutFor, withoutDialogDock } from './chat-layout-core.ts';

test('the breakpoint is 900 px of the TAB: 899 is narrow (stacked), 900 is wide (two columns)', () => {
  assert.equal(WIDE_MIN_PX, 900);
  assert.equal(layoutFor(899), 'narrow'); assert.equal(layoutFor(899.5), 'narrow'); assert.equal(layoutFor(900), 'wide'); assert.equal(layoutFor(1400), 'wide');
  assert.equal(layoutFor(360), 'narrow');
});
test('a tab that is not measured yet (0, NaN, undefined) is narrow, the safe stacked layout', () => {
  for (const w of [0, -1, NaN, Infinity, undefined, null, '1000']) assert.equal(layoutFor(w), 'narrow', String(w));
});
test('migration: an old "right" or "bottom" value is dropped silently, every other key is kept, the input is not mutated', () => {
  for (const old of ['right', 'bottom', 'sideways', 7]) {
    const raw = { serverUrl: 'http://x', dialogHeight: 112, dialogDock: old, dialogHistory: { 'a.md': [1] } };
    const r = withoutDialogDock(raw);
    assert.equal(r.changed, true);
    assert.deepEqual(r.data, { serverUrl: 'http://x', dialogHeight: 112, dialogHistory: { 'a.md': [1] } });
    assert.ok('dialogDock' in raw, 'the input is untouched');
  }
});
test('migration: data without the key is returned as it is (changed = false); null / undefined / a non-object become {}', () => {
  const raw = { a: 1 }; const r = withoutDialogDock(raw);
  assert.equal(r.changed, false); assert.equal(r.data, raw);
  assert.deepEqual(withoutDialogDock(null), { data: {}, changed: false }); assert.deepEqual(withoutDialogDock(undefined), { data: {}, changed: false });
});

// ---- 2026-11-18 (0935) the draggable divider: the pure ratio ----------------------------------------------------------------------------------------------------------------------------------------------
import { DEFAULT_RATIO, LEFT_MIN_PX, RIGHT_MIN_PX, RATIO_STEP, clampRatio, ratioFromDrag, ratioRange, resetRatio, sanitizeRatio, stepRatio } from './chat-layout-core.ts';

test('divider: the limits are in PIXELS (dialog >= 280, Score >= 320), so the allowed ratio range depends on the tab width: 900, 1100, 1400', () => {
  assert.deepEqual([DEFAULT_RATIO, LEFT_MIN_PX, RIGHT_MIN_PX, RATIO_STEP], [0.4, 280, 320, 0.02]);
  for (const w of [900, 1100, 1400, 2000]) { const r = ratioRange(w); assert.ok(Math.abs(r.min - 280 / w) < 1e-9 && Math.abs(r.max - (1 - 320 / w)) < 1e-9, String(w)); }
  assert.equal(clampRatio(0.4, 900), 0.4, 'the default is fine at 900 (360 px)');
  assert.ok(Math.abs(clampRatio(0.05, 900) * 900 - 280) < 1e-6 && Math.abs(clampRatio(0.9, 900) * 900 - 580) < 1e-6, 'far left = 280 px, far right leaves the Score 320 px');
  assert.ok(Math.abs(clampRatio(0, 1100) * 1100 - 280) < 1e-6 && Math.abs((1 - clampRatio(1, 1100)) * 1100 - 320) < 1e-6);
  assert.ok(Math.abs(clampRatio(0.1, 1400) * 1400 - 280) < 1e-6 && clampRatio(0.9, 1400) === 1 - 320 / 1400);
  assert.equal(clampRatio(0.5, 1400), 0.5, 'a ratio inside the range is not touched');
});
test('divider: a very narrow or unmeasured width never throws and never gives NaN (the two minimums share the room 280 : 320; an unmeasured tab keeps the default)', () => {
  const narrow = clampRatio(0.1, 500); assert.ok(Math.abs(narrow - 280 / 600) < 1e-9);
  assert.equal(clampRatio(0.9, 500), narrow, 'below 600 px there is one possible ratio');
  for (const w of [0, -5, NaN, Infinity, undefined as unknown as number]) assert.equal(clampRatio(0.7, w), 0.7, `unmeasured ${String(w)}: unchanged`);
});
test('divider: a stored value is sanitised: a finite number from 0.1 to 0.9, anything else is the default 0.40', () => {
  for (const ok of [0.1, 0.25, 0.4, 0.9]) assert.equal(sanitizeRatio(ok), ok);
  for (const bad of [0.09, 0.91, 0, 1, -1, NaN, Infinity, '0.5', null, undefined, {}, [0.5], true]) assert.equal(sanitizeRatio(bad), 0.4, String(bad));
});
test('divider: a drag moves the ratio by dx / tab width from where it started, clamped; far left and far right hit the pixel limits', () => {
  assert.ok(Math.abs(ratioFromDrag(0.4, 110, 1100) - 0.5) < 1e-9);
  assert.ok(Math.abs(ratioFromDrag(0.4, -110, 1100) - 0.3) < 1e-9);
  assert.ok(Math.abs(ratioFromDrag(0.4, -5000, 1100) * 1100 - 280) < 1e-6);
  assert.ok(Math.abs((1 - ratioFromDrag(0.4, 5000, 1100)) * 1100 - 320) < 1e-6);
  assert.equal(ratioFromDrag(0.4, 0, 1100), 0.4);
});
test('divider: the keyboard step is 2 percentage points, clamped; reset is 0.40; a stored ratio out of range is stepped from where it is SHOWN', () => {
  assert.ok(Math.abs(stepRatio(0.4, 1, 1100) - 0.42) < 1e-9 && Math.abs(stepRatio(0.4, -1, 1100) - 0.38) < 1e-9);
  let r = 0.4; for (let i = 0; i < 40; i++) r = stepRatio(r, -1, 900); assert.ok(Math.abs(r * 900 - 280) < 1e-6, 'Left stops at 280 px');
  r = 0.4; for (let i = 0; i < 40; i++) r = stepRatio(r, 1, 900); assert.ok(Math.abs((1 - r) * 900 - 320) < 1e-6, 'Right stops with 320 px for the Score');
  assert.equal(resetRatio(), 0.4);
  assert.ok(Math.abs(stepRatio(0.8, -1, 900) - (clampRatio(0.8, 900) - 0.02)) < 1e-3, 'stored 0.8 shows as 0.644 at 900 px; one Left is 0.624');
});
test('divider: a stored ratio is re-clamped for DISPLAY only: the stored number is not changed by a narrow tab, so widening restores it', () => {
  const stored = 0.7;
  const at900 = clampRatio(stored, 900), at1400 = clampRatio(stored, 1400);
  assert.ok(at900 < stored && at1400 === stored, 'shown 0.644 at 900 px, 0.7 at 1400 px');
  assert.equal(stored, 0.7);
});
