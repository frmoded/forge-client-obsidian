// v0.2.236 — tests for the sweep-bundle-dropped classification.
// Drain 2026-07-02-2000: driver reported 10 files persisting in
// forge-music/blues/ after v0.8.0 rename. Pin the exact rename
// scenario + a safety-net for the empty-bundle case.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSweepTrashList } from './sweep-bundle-dropped-core.ts';

test('drain 2000: blues/song.md → slow_burn/slow_burn.md rename', () => {
  const bundled = new Set([
    'forge.toml',
    'README.md',
    'slow_burn/slow_burn.md',
    'slow_burn/chorus.md',
    'slow_burn/solo_chorus.md',
    'slow_burn/twelve_bar_blues_progression.md',
    'percussion/loom.md',
    'percussion/murmuration.md',
  ]);
  const extracted = new Set([
    'forge.toml',
    'README.md',
    // Stale blues/ from pre-v0.8.0 extract (all 10 driver-reported files):
    'blues/chorus.md',
    'blues/drum_chorus.md',
    'blues/drums_shuffle.md',
    'blues/form.md',
    'blues/guitar_solo_chorus.md',
    'blues/solo_chorus.md',
    'blues/song.md',
    'blues/twelve_bar_blues_progression.md',
    'blues/vocal_phrase_a.md',
    'blues/vocal_phrase_b.md',
    // Newly-copied slow_burn/*:
    'slow_burn/slow_burn.md',
    'slow_burn/chorus.md',
    'slow_burn/solo_chorus.md',
    'slow_burn/twelve_bar_blues_progression.md',
    'percussion/loom.md',
    'percussion/murmuration.md',
  ]);
  const decision = computeSweepTrashList(bundled, extracted);
  assert.equal(decision.bailUnsafeEmptyBundle, false);
  assert.deepEqual(decision.toTrash, [
    'blues/chorus.md',
    'blues/drum_chorus.md',
    'blues/drums_shuffle.md',
    'blues/form.md',
    'blues/guitar_solo_chorus.md',
    'blues/solo_chorus.md',
    'blues/song.md',
    'blues/twelve_bar_blues_progression.md',
    'blues/vocal_phrase_a.md',
    'blues/vocal_phrase_b.md',
  ]);
});

test('safety net: empty bundle + non-empty extracted → bail', () => {
  // The dangerous asymmetry: if adapter.list on the bundled root
  // silently returned no files (dev-mode / plugin-assets race), the
  // naive diff would classify EVERY extracted file as "not in bundle"
  // and trash the whole library. Refuse to trash anything.
  const bundled = new Set<string>();
  const extracted = new Set(['forge.toml', 'slow_burn/slow_burn.md']);
  const decision = computeSweepTrashList(bundled, extracted);
  assert.equal(decision.bailUnsafeEmptyBundle, true);
  assert.deepEqual(decision.toTrash, []);
});

test('both empty → no trash, no bail', () => {
  const decision = computeSweepTrashList(new Set(), new Set());
  assert.equal(decision.bailUnsafeEmptyBundle, false);
  assert.deepEqual(decision.toTrash, []);
});

test('everything present in bundle → nothing to trash', () => {
  const bundled = new Set(['a.md', 'sub/b.md']);
  const extracted = new Set(['a.md', 'sub/b.md']);
  const decision = computeSweepTrashList(bundled, extracted);
  assert.equal(decision.bailUnsafeEmptyBundle, false);
  assert.deepEqual(decision.toTrash, []);
});

test('deterministic sort order for notice', () => {
  const bundled = new Set(['keep.md']);
  const extracted = new Set(['keep.md', 'z.md', 'a.md', 'm/c.md', 'b.md']);
  const decision = computeSweepTrashList(bundled, extracted);
  assert.deepEqual(decision.toTrash, ['a.md', 'b.md', 'm/c.md', 'z.md']);
});
