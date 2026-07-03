// v0.2.205 — Phase 2.5 §2.3: pure-core tests for the canonical-layer
// status-bar label + tooltip.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  canonicalLayerStatusLabel,
  canonicalLayerStatusTooltip,
} from './canonical-layer-status-bar-core.ts';

describe('canonicalLayerStatusLabel', () => {
  test('non-V2 file → empty', () => {
    assert.equal(canonicalLayerStatusLabel(false, null), '');
    assert.equal(canonicalLayerStatusLabel(false, 'recipe'), '');
  });

  test('V2 synced → empty (suppress noise)', () => {
    assert.equal(canonicalLayerStatusLabel(true, 'synced'), '');
  });

  test('V2 description-canonical', () => {
    assert.equal(canonicalLayerStatusLabel(true, 'description'),
      'Forge: Description canonical');
  });

  test('V2 recipe-canonical', () => {
    assert.equal(canonicalLayerStatusLabel(true, 'recipe'),
      'Forge: Recipe canonical');
  });

  test('V2 python-canonical', () => {
    assert.equal(canonicalLayerStatusLabel(true, 'python'),
      'Forge: Python canonical');
  });

  test('V2 with probe failure → reveals defensive label', () => {
    // The probe failure case shouldn't be silent — surfaces a
    // discoverable signal so devs see hash-helper bugs in the bar.
    assert.equal(canonicalLayerStatusLabel(true, null),
      'Forge: probe failed');
  });
});

describe('canonicalLayerStatusTooltip', () => {
  test('description tooltip describes the v0.2.254 auto-forge pipeline', () => {
    const t = canonicalLayerStatusTooltip('description');
    assert.match(t, /Description was hand-edited/);
    assert.match(t, /auto-run the full pipeline/);
    assert.match(t, /regenerate Recipe \+ Python from Description, then execute/);
    // Regression guard: the retired command name must NEVER surface.
    assert.doesNotMatch(t, /Forge: Generate Recipe from Description/);
  });

  test('recipe tooltip describes the transpile-on-click flow', () => {
    const t = canonicalLayerStatusTooltip('recipe');
    assert.match(t, /Recipe was hand-edited/);
    assert.match(t, /re-transpile/);
  });

  test('python tooltip describes Path Y behavior', () => {
    const t = canonicalLayerStatusTooltip('python');
    assert.match(t, /Python facet was hand-edited/);
    assert.match(t, /AS-IS/);
    assert.match(t, /Path Y/);
  });

  test('synced tooltip confirms clean state', () => {
    const t = canonicalLayerStatusTooltip('synced');
    assert.match(t, /no hand-edits/);
  });

  test('null tooltip describes fallback', () => {
    const t = canonicalLayerStatusTooltip(null);
    assert.match(t, /probe failed/);
    assert.match(t, /standard transpile path/);
  });
});
