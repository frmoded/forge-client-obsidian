// Pure-core tests for re-extract-bundled-vault-core.ts.
//
// The "Forge: Re-extract bundled library vault" command needs to know
// which files were edited locally (so they get trashed before
// re-extract overwrites them), which match canonical (no action
// needed), which were dropped by the bundle (trashed for recovery),
// and which the bundle newly ships.
//
// v0.2.229 (drain 2026-07-02-0930): `filesPreserved` → `filesBundleDropped`.
// Caller treats them as trash-via-system-trash (recoverable). The prior
// "preserve" semantics failed when a bundle version dropped files —
// stragglers persisted (forge-music v0.7.0 → 8 engineer-mode notes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideReExtractActions } from './re-extract-bundled-vault-core.ts';

test('decideReExtractActions: all files match → nothing to trash', () => {
  const extracted = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, []);
  assert.deepEqual(d.filesUntouched, ['_meta/_chips.md', 'simulation.md']);
  assert.deepEqual(d.filesBundleDropped, []);
  assert.deepEqual(d.filesToCreate, []);
});

test('decideReExtractActions: edited-locally files surface in filesToTrash', () => {
  const extracted = new Map([
    ['simulation.md', 'sha-EDITED'],
    ['_meta/_chips.md', 'sha-b'],
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, ['simulation.md']);
  assert.deepEqual(d.filesUntouched, ['_meta/_chips.md']);
});

test('decideReExtractActions: bundle-dropped files surface in filesBundleDropped', () => {
  // v0.2.229 contract: the bundle is authoritative. Files in extracted
  // that the bundle doesn't ship get classified as bundle-dropped and
  // the caller trashes them via system trash. Cohort can recover via
  // macOS Trash if they had local content.
  const extracted = new Map([
    ['simulation.md', 'sha-a'],
    ['my_custom_snippet.md', 'sha-user'],  // bundle never had OR bundle dropped
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, []);
  assert.deepEqual(d.filesUntouched, ['simulation.md']);
  assert.deepEqual(d.filesBundleDropped, ['my_custom_snippet.md']);
});

test('decideReExtractActions: new-in-bundle files surface in filesToCreate', () => {
  const extracted = new Map([
    ['simulation.md', 'sha-a'],
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['new_chip.md', 'sha-new'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToCreate, ['new_chip.md']);
  assert.deepEqual(d.filesUntouched, ['simulation.md']);
});

test('decideReExtractActions: mixed shape — all four buckets populated', () => {
  const extracted = new Map([
    ['simulation.md', 'sha-EDITED'],          // edited locally
    ['_meta/_chips.md', 'sha-b'],             // untouched
    ['my_custom_snippet.md', 'sha-user'],     // bundle dropped
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
    ['new_chip.md', 'sha-new'],               // new in bundle
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, ['simulation.md']);
  assert.deepEqual(d.filesUntouched, ['_meta/_chips.md']);
  assert.deepEqual(d.filesBundleDropped, ['my_custom_snippet.md']);
  assert.deepEqual(d.filesToCreate, ['new_chip.md']);
});

test('decideReExtractActions: empty extracted (post-rm-rf state) → everything in filesToCreate', () => {
  const extracted = new Map<string, string>();
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, []);
  assert.deepEqual(d.filesUntouched, []);
  assert.deepEqual(d.filesBundleDropped, []);
  assert.deepEqual(d.filesToCreate, ['_meta/_chips.md', 'simulation.md']);
});

test('decideReExtractActions: results are sorted (deterministic)', () => {
  // Insert paths in a non-sorted order to verify the output is sorted.
  const extracted = new Map([
    ['z.md', 'h1'],
    ['a.md', 'h2'],
    ['m.md', 'h3'],
  ]);
  const bundled = new Map([
    ['z.md', 'h1-DIFF'],
    ['a.md', 'h2-DIFF'],
    ['m.md', 'h3-DIFF'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, ['a.md', 'm.md', 'z.md']);
});

// v0.2.229 — regression for the forge-music v0.7.0 promotion scenario
// that surfaced Pebble 1. Driver vault had 8 engineer-mode notes; the
// new bundle dropped them. Caller must classify them as bundle-dropped
// (and trash) instead of preserving (which left stragglers).
test('decideReExtractActions: forge-music v0.7.0 scenario — 8 engineer-mode files dropped', () => {
  const stragglers = [
    'blues/drum_chorus.md', 'blues/drums_shuffle.md', 'blues/form.md',
    'blues/guitar_solo_chorus.md', 'blues/vocal_phrase_a.md',
    'blues/vocal_phrase_b.md', 'percussion/phase_cell.md',
    'percussion/phase_shifter.md',
  ];
  const extracted = new Map<string, string>([
    ['blues/song.md', 'sha-song'],
    ['blues/chorus.md', 'sha-chorus'],
    ['blues/solo_chorus.md', 'sha-solo'],
    ['blues/twelve_bar_blues_progression.md', 'sha-prog'],
    ['percussion/loom.md', 'sha-loom'],
    ['percussion/murmuration.md', 'sha-murmuration'],
    ...stragglers.map((p) => [p, 'sha-stale'] as [string, string]),
  ]);
  const bundled = new Map<string, string>([
    ['blues/song.md', 'sha-song'],
    ['blues/chorus.md', 'sha-chorus'],
    ['blues/solo_chorus.md', 'sha-solo'],
    ['blues/twelve_bar_blues_progression.md', 'sha-prog'],
    ['percussion/loom.md', 'sha-loom'],
    ['percussion/murmuration.md', 'sha-murmuration'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesBundleDropped.sort(), stragglers.slice().sort());
  assert.deepEqual(d.filesToTrash, []);
  assert.deepEqual(d.filesToCreate, []);
});
