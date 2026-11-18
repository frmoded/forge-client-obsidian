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
