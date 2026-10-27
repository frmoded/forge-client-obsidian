// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over rhythm-default-view-core.ts: the exact words of the `[forge-rhythm]` evidence lines (what the driver reads in the
// console to see WHY a note opened as it did), their once-per-outcome rule, and who set a mark ('person' by default).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDefaultViewController, SWAP_RETRY_DELAYS_MS, type DefaultViewDeps, type LeafInfo, type SwapTarget } from './rhythm-default-view-core.ts';

type Leaf = { id: string };
function rig(over: Partial<{ body: boolean; neverSwap: boolean; edition: 'music' | 'lean' }> = {}) {
  const lines: string[] = [];
  let showing: SwapTarget | null = null;
  const info = (path: string): LeafInfo => ({ location: 'main', viewType: 'markdown', isPlainMarkdownView: true, filePath: path, extension: 'md', frontmatterIsCandidate: true });
  let path = 'rhythm_data/a.md';
  const deps: DefaultViewDeps<Leaf> = {
    settingOn: () => true,
    edition: over.edition ?? 'music',
    describe: () => (showing ? { ...info(path), viewType: 'forge-rhythm-edit', isPlainMarkdownView: false } : info(path)),
    readBodyIsRhythm: async () => over.body ?? true,
    swapTo: async (_l, _p, target) => { if (!over.neverSwap) showing = target; },
    isSwapped: () => showing !== null,
    sleep: async () => {},
    trace: (l) => { lines.push(l); },
  };
  const c = createDefaultViewController<Leaf>(deps);
  return { c, lines, leaf: { id: 'a' } as Leaf, setPath: (p: string) => { path = p; showing = null; }, reset: () => { showing = null; } };
}

test('a note that opens in the Beat Box says so once, with the reason; the same outcome again says nothing', async () => {
  const r = rig();
  assert.equal(await r.c.evaluate(r.leaf), 'swap');
  assert.deepEqual(r.lines, ['[forge-rhythm] routed rhythm_data/a.md -> beatbox (a rhythm note opens in the Beat Box by default)']);
  r.reset(); await r.c.evaluate(r.leaf);
  assert.equal(r.lines.length, 1, 'same line, not repeated');
});

test('a tab that last chose the Score is routed to the Score, and the line says why', async () => {
  const r = rig();
  r.c.setMark(r.leaf, 'rhythm_data/a.md', 'score');
  assert.equal(await r.c.evaluate(r.leaf), 'swap');
  assert.deepEqual(r.lines, ['[forge-rhythm] routed rhythm_data/a.md -> score (this tab last chose the Score)']);
});

test('Open as JSON: the line names the person; a mark set by the plugin names the pair\'s notes pane; a mark is the person\'s unless said otherwise; clearing it forgets who set it', async () => {
  const person = rig();
  person.c.setMark(person.leaf, 'rhythm_data/a.md', 'markdown');
  assert.equal(await person.c.evaluate(person.leaf), 'prefer-markdown');
  assert.deepEqual(person.lines, ['[forge-rhythm] routed rhythm_data/a.md -> text (the person chose Open as JSON)']);
  const plugin = rig();
  plugin.c.setMark(plugin.leaf, 'rhythm_data/a.md', 'markdown', 'plugin');
  await plugin.c.evaluate(plugin.leaf);
  assert.deepEqual(plugin.lines, ['[forge-rhythm] routed rhythm_data/a.md -> text (the pair notes pane shows it as text)']);
  // plugin mark replaced by a person's, then cleared and set again without a "by": the person
  plugin.c.setMark(plugin.leaf, 'rhythm_data/a.md', null);
  plugin.c.setMark(plugin.leaf, 'rhythm_data/a.md', 'markdown');
  await plugin.c.evaluate(plugin.leaf);
  assert.equal(plugin.lines.at(-1), '[forge-rhythm] routed rhythm_data/a.md -> text (the person chose Open as JSON)');
  // clearing the mark means the Beat Box again
  plugin.c.setMark(plugin.leaf, 'rhythm_data/a.md', null);
  assert.equal(await plugin.c.evaluate(plugin.leaf), 'swap');
});

test('a note that is not valid rhythm data says so; a tab that will not switch says so after the retries', async () => {
  const bad = rig({ body: false });
  assert.equal(await bad.c.evaluate(bad.leaf), 'invalid-rhythm');
  assert.deepEqual(bad.lines, ['[forge-rhythm] routed rhythm_data/a.md -> text (the note is not valid rhythm data)']);
  const stuck = rig({ neverSwap: true });
  assert.equal(await stuck.c.evaluate(stuck.leaf), 'swap-failed');
  assert.deepEqual(stuck.lines, ['[forge-rhythm] could not route rhythm_data/a.md -> beatbox (the tab did not switch)']);
  assert.deepEqual([...SWAP_RETRY_DELAYS_MS], [60, 180, 500]);
});

test('the line is said again when the file changes (one line per leaf, outcome AND file), and an outcome with no line (setting off, not markdown) says nothing', async () => {
  const r = rig();
  await r.c.evaluate(r.leaf);
  r.setPath('rhythm_data/b.md'); await r.c.evaluate(r.leaf);
  assert.deepEqual(r.lines, [
    '[forge-rhythm] routed rhythm_data/a.md -> beatbox (a rhythm note opens in the Beat Box by default)',
    '[forge-rhythm] routed rhythm_data/b.md -> beatbox (a rhythm note opens in the Beat Box by default)',
  ]);
  const held = rig();
  held.c.hold(held.leaf, true);
  assert.equal(await held.c.evaluate(held.leaf), 'held');
  assert.deepEqual(held.lines, [], 'a held leaf says nothing');
  held.c.hold(held.leaf, false);
  assert.equal(await held.c.evaluate(held.leaf), 'swap');
});
