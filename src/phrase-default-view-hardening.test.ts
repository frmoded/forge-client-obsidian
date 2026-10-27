// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivor of the mutation pass over phrase-default-view-core.ts: a mark's author. A mark nobody names is the PERSON's (Open as JSON), a mark the plugin
// sets says it is the pair's notes pane, and clearing a mark forgets both.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPhraseRouter, type PhraseLeafInfo } from './phrase-default-view-core.ts';

type Leaf = { id: string };

function rig() {
  const lines: string[] = [];
  const leaf: Leaf = { id: 'a' };
  const info: PhraseLeafInfo = { location: 'main', isPlainMarkdownView: true, filePath: 'phrases/phrase_001.md' } as PhraseLeafInfo;
  let swapped = false;
  const router = createPhraseRouter<Leaf>({
    scoreFirst: () => true, describe: () => info, swapTo: async () => { swapped = true; }, isSwapped: () => swapped, sleep: async () => {}, trace: (l) => { lines.push(l); },
    findOpen: () => null, focus: () => {}, dismiss: async () => null,
  });
  return { router, leaf, lines };
}

test('a mark with no author is the person\'s: the line says they chose Open as JSON; the plugin\'s says the pair\'s notes pane shows it as text', async () => {
  const person = rig();
  person.router.setMark(person.leaf, 'phrases/phrase_001.md', 'markdown');
  assert.equal(await person.router.evaluate(person.leaf), 'chosen-json');
  assert.equal(person.lines.length, 1);
  assert.match(person.lines[0], /the person chose Open as JSON/);
  assert.doesNotMatch(person.lines[0], /pair/);
  const plugin = rig();
  plugin.router.setMark(plugin.leaf, 'phrases/phrase_001.md', 'markdown', 'plugin');
  assert.equal(await plugin.router.evaluate(plugin.leaf), 'chosen-json');
  assert.match(plugin.lines[0], /pair/);
  assert.doesNotMatch(plugin.lines[0], /the person chose/);
});

test('clearing a mark (null) puts the leaf back to the default route', async () => {
  const r = rig();
  r.router.setMark(r.leaf, 'phrases/phrase_001.md', 'markdown');
  r.router.setMark(r.leaf, 'phrases/phrase_001.md', null);
  assert.equal(await r.router.evaluate(r.leaf), 'score');
});
