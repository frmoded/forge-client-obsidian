// v0.2.205 — Phase 2.5 §2.3: pure-core tests for the canonical-layer
// status-bar label + tooltip.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  sourceLayerStatusLabel,
  sourceLayerStatusTooltip,
} from './source-layer-status-bar-core.ts';

describe('sourceLayerStatusLabel', () => {
  test('non-V2 file → empty', () => {
    assert.equal(sourceLayerStatusLabel(false, null), '');
    assert.equal(sourceLayerStatusLabel(false, 'recipe'), '');
  });

  test('V2 synced → "Forge: synced" (drain 2510 — was empty pre-drain)', () => {
    // Drain 2510: pre-drain the label was '' to reduce noise, but the
    // empty label made the status bar item display:none which killed
    // the click affordance. Now emit a minimal label so the item stays
    // visible + click-reachable; tooltip carries the detail.
    assert.equal(sourceLayerStatusLabel(true, 'synced'), 'Forge: synced');
  });

  test('V2 description-source', () => {
    assert.equal(sourceLayerStatusLabel(true, 'description'),
      'Forge: Description source');
  });

  test('V2 recipe-source', () => {
    assert.equal(sourceLayerStatusLabel(true, 'recipe'),
      'Forge: Recipe source');
  });

  test('V2 python-source', () => {
    assert.equal(sourceLayerStatusLabel(true, 'python'),
      'Forge: Python source');
  });

  test('V2 with probe failure → reveals defensive label', () => {
    // The probe failure case shouldn't be silent — surfaces a
    // discoverable signal so devs see hash-helper bugs in the bar.
    assert.equal(sourceLayerStatusLabel(true, null),
      'Forge: probe failed');
  });
});

describe('sourceLayerStatusTooltip', () => {
  test('description tooltip describes the v0.2.254 auto-forge pipeline', () => {
    const t = sourceLayerStatusTooltip('description');
    assert.match(t, /Description was hand-edited/);
    assert.match(t, /auto-run the full pipeline/);
    assert.match(t, /regenerate Recipe \+ Python from Description, then execute/);
    // Regression guard: the retired command name must NEVER surface.
    assert.doesNotMatch(t, /Forge: Generate Recipe from Description/);
  });

  test('recipe tooltip describes the transpile-on-click flow', () => {
    const t = sourceLayerStatusTooltip('recipe');
    assert.match(t, /Recipe was hand-edited/);
    assert.match(t, /re-transpile/);
  });

  test('python tooltip describes Path Y behavior', () => {
    const t = sourceLayerStatusTooltip('python');
    assert.match(t, /Python facet was hand-edited/);
    assert.match(t, /AS-IS/);
    assert.match(t, /Path Y/);
  });

  test('synced tooltip confirms clean state', () => {
    const t = sourceLayerStatusTooltip('synced');
    assert.match(t, /no hand-edits/);
  });

  test('null tooltip describes fallback', () => {
    const t = sourceLayerStatusTooltip(null);
    assert.match(t, /probe failed/);
    assert.match(t, /standard transpile path/);
  });
});
