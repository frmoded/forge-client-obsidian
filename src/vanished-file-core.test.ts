// 2026-11-20-1005 (F7) - a note deleted from OUTSIDE Obsidian while it is open: the file-open and modify handlers that read it (maybePreviewDataSnippet, maybeBackfillV113Shape, maybeStampTypedLetsInputs, captureFacetHashCacheForFile)
// each logged a red ENOENT (7 of them in the CCQA weekly). A vanished file is not an error: ONE quiet info line per vanished note, never red. Anything else that fails stays loud. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createVanishedReporter, isVanishedFileError } from './vanished-file-core.ts';

test('what counts as a vanished file: Node\'s ENOENT (by code or in the words), Obsidian\'s "File not found", and nothing else', () => {
  assert.equal(isVanishedFileError(Object.assign(new Error('boom'), { code: 'ENOENT' })), true);
  assert.equal(isVanishedFileError(new Error("ENOENT: no such file or directory, open '/vault/a.md'")), true);
  assert.equal(isVanishedFileError(new Error('no such file or directory')), true);
  assert.equal(isVanishedFileError(new Error('File not found')), true);
  assert.equal(isVanishedFileError('ENOENT: x'), true);
  for (const other of [new Error('disk on fire'), new Error('EACCES: permission denied'), Object.assign(new Error('x'), { code: 'EACCES' }), null, undefined, 42, {}]) assert.equal(isVanishedFileError(other), false, String(other));
});

test('the reporter says a vanished note ONCE (an info line with the note and what was skipped), however many handlers meet it; a note that comes back is reported again if it vanishes again', () => {
  const lines: string[] = []; const r = createVanishedReporter((l) => { lines.push(l); });
  assert.equal(r.report('bars/bar_001.md', 'maybeBackfillV113Shape'), true);
  assert.equal(r.report('bars/bar_001.md', 'maybeStampTypedLetsInputs'), false); assert.equal(r.report('bars/bar_001.md', 'captureFacetHashCacheForFile'), false);
  assert.deepEqual(lines, ['[forge] bars/bar_001.md is gone (deleted outside Obsidian); skipped maybeBackfillV113Shape']);
  assert.equal(r.report('bars/bar_002.md', 'maybePreviewDataSnippet'), true); assert.equal(lines.length, 2);
  r.forget('bars/bar_001.md'); assert.equal(r.report('bars/bar_001.md', 'x'), true); assert.equal(lines.length, 3);
});
