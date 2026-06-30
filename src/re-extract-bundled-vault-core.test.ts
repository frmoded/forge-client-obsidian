// Pure-core tests for re-extract-bundled-vault-core.ts.
//
// The "Forge: Re-extract bundled library vault" command needs to know
// which files were edited locally (so they get trashed before
// re-extract overwrites them), which match canonical (no action
// needed), and which the user authored on top of the bundle
// (preserved as-is). All four cases live here.

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
  assert.deepEqual(d.filesPreserved, []);
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

test('decideReExtractActions: user-authored files surface in filesPreserved', () => {
  const extracted = new Map([
    ['simulation.md', 'sha-a'],
    ['my_custom_snippet.md', 'sha-user'],
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, []);
  assert.deepEqual(d.filesUntouched, ['simulation.md']);
  assert.deepEqual(d.filesPreserved, ['my_custom_snippet.md']);
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
    ['my_custom_snippet.md', 'sha-user'],     // user-authored
  ]);
  const bundled = new Map([
    ['simulation.md', 'sha-a'],
    ['_meta/_chips.md', 'sha-b'],
    ['new_chip.md', 'sha-new'],               // new in bundle
  ]);
  const d = decideReExtractActions(extracted, bundled);
  assert.deepEqual(d.filesToTrash, ['simulation.md']);
  assert.deepEqual(d.filesUntouched, ['_meta/_chips.md']);
  assert.deepEqual(d.filesPreserved, ['my_custom_snippet.md']);
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
  assert.deepEqual(d.filesPreserved, []);
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
