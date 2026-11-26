// 2026-11-25-1042 (mutation pass): pins for the two survivors of the pass over the 1042 diff.
//   1. src/list-model.lean.ts:24 `${folder}/` -> '': the lean list reads the melody notes of ONE folder only.
//   2. src/score-first.ts:138 `return f;` -> `return;`: the plugin's `create` gives New melody bar the file it made, so the new bar OPENS.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listModel as lean } from './list-model.lean.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

test('lean: the melody names of a folder are that folder\'s notes only', () => {
  const files = ['bars/bar_001.md', 'phrases/phrase_001.md', 'barsx/bar_002.md'].map((path) => ({ path, basename: path.replace(/^.*\//, '').replace(/\.md$/, '') }));
  const app = { vault: { getFiles: () => files }, metadataCache: { getFileCache: () => ({ frontmatter: { melody: true } }) } };
  assert.deepEqual(lean.melody.names(app, 'bars'), ['bar_001']);
  assert.deepEqual(lean.melody.names(app, 'phrases'), ['phrase_001']);
});

test('[real plugin] New melody bar makes the note AND opens it', async () => {
  const w = await musicTabsWorld(await realMusicPlugin(), {});
  try {
    const before = new Set(w.store.keys());
    w.plugin.commands.get('new-melody-bar')!.checkCallback!(false); await w.settle(800);
    const made = [...w.store.keys()].filter((p) => p.startsWith('bars/') && !before.has(p));
    assert.equal(made.length, 1, `one bar was made: ${made.join(', ')}`);
    assert.ok(w.leaves.some((l: any) => l.view?.file?.path === made[0]), `the new bar is open in a tab: ${w.leaves.map((l: any) => l.view?.file?.path ?? l.view?.getViewType?.()).join(', ')}`);
  } finally { w.done(); }
});
