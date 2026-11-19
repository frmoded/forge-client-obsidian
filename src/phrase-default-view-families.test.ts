// 2026-11-19-0990 - the default-view router and the text tab's header know the three families, not phrases only (the driver reopened a composition and got a plain note). Pure: only existing modules, every Obsidian touch injected.
// The decision table (decidePhraseRoute), the router over a fake host (createPhraseRouter), and the header's two questions (wantsPhraseHeader, rhythmHeaderApplies).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPhraseRouter, decidePhraseRoute, type PhraseLeafInfo, type PhraseRouteInput } from './phrase-default-view-core.ts';
import { rhythmHeaderApplies, wantsPhraseHeader } from './phrase-header-core.ts';

const base: PhraseRouteInput = { scoreFirst: true, swapInProgress: false, location: 'main', isPlainMarkdownView: true, filePath: 'compositions/A.md', mark: null, restoredPath: null };
const route = (over: Partial<PhraseRouteInput>) => decidePhraseRoute({ ...base, ...over });

test('route: a composition and an arrangement text tab swap to their Score, like a phrase', () => {
  for (const p of ['compositions/A.md', 'arrangements/arr_001.md', 'phrases/phrase_001.md']) assert.deepEqual(route({ filePath: p }), { swap: true, reason: 'score' }, p);
});
test('route: not the READMEs, not a nested note, not another folder, not a bar, not outside a score-first vault', () => {
  for (const p of ['compositions/README.md', 'arrangements/README.md', 'compositions/sub/x.md', 'notes/A.md', 'bars/bar_001.md', 'kits/rock.md']) assert.equal(route({ filePath: p }).swap, false, p);
  assert.equal(route({ scoreFirst: false }).reason, 'not-score-first');
  assert.equal(route({ location: 'other' }).reason, 'not-allowed-location');
  assert.equal(route({ isPlainMarkdownView: false }).reason, 'not-markdown-view');
  assert.equal(route({ swapInProgress: true }).reason, 'swap-in-progress');
  assert.equal(route({ filePath: 'notes/A.md' }).reason, 'not-a-phrase');
});
test('route: the person\'s Open as Forge note holds for all three families', () => {
  for (const p of ['compositions/A.md', 'arrangements/arr_001.md', 'phrases/phrase_001.md']) assert.deepEqual(route({ filePath: p, mark: 'markdown' }), { swap: false, reason: 'chosen-json' }, p);
});
test('route: a tab restored with the layout: a PHRASE keeps its text (unchanged), an arrangement and a composition come up as their Score', () => {
  assert.deepEqual(route({ filePath: 'phrases/phrase_001.md', restoredPath: 'phrases/phrase_001.md' }), { swap: false, reason: 'layout-restore' });
  for (const p of ['compositions/A.md', 'arrangements/arr_001.md']) assert.deepEqual(route({ filePath: p, restoredPath: p }), { swap: true, reason: 'score' }, p);
  assert.deepEqual(route({ filePath: 'compositions/A.md', restoredPath: 'compositions/other.md' }), { swap: true, reason: 'score' });
});

test('route: a RESTORED tab in reading mode (the notes pane of a pair, its Score beside it) stays text for every family; an unrestored reading tab is routed as ever', () => {
  for (const p of ['compositions/A.md', 'arrangements/arr_001.md', 'phrases/phrase_001.md']) {
    assert.deepEqual(route({ filePath: p, restoredPath: p, reading: true }), { swap: false, reason: 'layout-restore' }, p);
    assert.deepEqual(route({ filePath: p, restoredPath: null, reading: true }), { swap: true, reason: 'score' }, p);
  }
});

test('router: a leaf showing a composition\'s text is swapped, with the path of the composition', async () => {
  const swaps: string[] = []; const swapped = new Set<object>(); const lines: string[] = [];
  const leaf = {};
  const info: PhraseLeafInfo = { location: 'main', isPlainMarkdownView: true, filePath: 'compositions/A.md' };
  const router = createPhraseRouter<object>({
    scoreFirst: () => true, describe: () => info, swapTo: async (l, p) => { swaps.push(p); swapped.add(l); }, isSwapped: (l) => swapped.has(l), sleep: async () => {}, trace: (l) => { lines.push(l); },
    findOpen: () => null, focus: () => {}, dismiss: async () => null,
  });
  assert.equal(await router.evaluate(leaf), 'score');
  assert.deepEqual(swaps, ['compositions/A.md']);
  assert.deepEqual(lines, ['[forge-phrase] routed compositions/A.md -> score (a new open in a score-first vault)']);
});

test('header: "Open as Score" belongs to the text tab of a phrase, an arrangement and a composition in a score-first vault, and the Beat Box\'s buttons do not', () => {
  for (const p of ['phrases/phrase_001.md', 'arrangements/arr_001.md', 'compositions/A.md']) {
    assert.equal(wantsPhraseHeader(true, p), true, p);
    assert.equal(rhythmHeaderApplies(true, true, p), false, `${p}: the bar's Open as Score refuses a note that is not a bar`);
    assert.equal(wantsPhraseHeader(false, p), false, `${p}: outside a score-first vault nothing changes`);
    assert.equal(rhythmHeaderApplies(true, false, p), true, `${p}: P3, the Beat Box's buttons as before outside a score-first vault`);
  }
  for (const p of ['bars/bar_001.md', 'compositions/README.md', 'notes/x.md', 'kits/rock.md']) {
    assert.equal(wantsPhraseHeader(true, p), false, p);
    assert.equal(rhythmHeaderApplies(true, true, p), true, `${p}: a bar and every other candidate keeps the Beat Box's buttons`);
  }
  assert.equal(rhythmHeaderApplies(false, true, 'compositions/A.md'), false, 'not a candidate: no rhythm buttons');
});
