// v0.2.206 — pure-core tests for the engine-chip click decision.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { decideEngineChipClick } from './engine-chip-click-decide-core.ts';

describe('decideEngineChipClick', () => {
  test('engine chip exists + no vault note → open-engine-chip', () => {
    const d = decideEngineChipClick('play_at_beats', false, true);
    assert.equal(d.action, 'open-engine-chip');
    assert.equal((d as any).chipName, 'play_at_beats');
  });

  test('vault note exists → defer to default (vault override wins)', () => {
    const d = decideEngineChipClick('play_at_beats', true, true);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'vault-note-exists');
  });

  test('no chip match + no vault note → defer (Obsidian creates new)', () => {
    const d = decideEngineChipClick('newchip', false, false);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'no-chip-match');
  });

  test('empty target → defer (defensive)', () => {
    const d = decideEngineChipClick('', false, true);
    assert.equal(d.action, 'open-vault-note');
    assert.equal((d as any).reason, 'empty-target');
  });

  test('strips wikilink alias/heading before matching', () => {
    // `[[play_at_beats#args|the chip]]` should still resolve to the
    // bare `play_at_beats` chip.
    const d = decideEngineChipClick('play_at_beats#args|the chip', false, true);
    assert.equal(d.action, 'open-engine-chip');
    assert.equal((d as any).chipName, 'play_at_beats');
  });
});
