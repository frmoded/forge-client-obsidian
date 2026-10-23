// 2026-10-23-0630 — a phrase note opens as its Score by default in a score-first vault. The pure router (the sibling of the Beat Box's default-view controller, rhythm-default-view-core.ts): which leaf
// is swapped to the phrase tab and when, with every Obsidian touch injected. The rules: score-first vaults only; only `phrases/phrase_NNN.md`; "Open as JSON" must stay (a mark on that leaf + file, dropped
// when the leaf navigates away); a tab restored from the saved layout keeps showing its text; no loop (a swapped leaf is no longer markdown, and a swap in progress is not re-entered).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPhraseRouter, decidePhraseRoute, type PhraseLeafInfo, type PhraseRouteInput } from './phrase-default-view-core.ts';

const leafOf = (id: string) => ({ id });
type Leaf = ReturnType<typeof leafOf>;

function rig(opts: { scoreFirst?: boolean } = {}) {
  const shows = new Map<Leaf, Partial<PhraseLeafInfo>>();
  const swaps: Array<{ leaf: Leaf; path: string }> = [];
  const lines: string[] = [];
  let scoreFirst = opts.scoreFirst ?? true;
  let dropSwaps = 0;                                         // Obsidian silently drops a setViewState while the leaf is busy
  const swapped = new Set<Leaf>();
  const router = createPhraseRouter<Leaf>({
    scoreFirst: () => scoreFirst,
    describe: (leaf) => { const s = shows.get(leaf); return s ? { location: 'main', isPlainMarkdownView: !swapped.has(leaf), filePath: null, ...s } as PhraseLeafInfo : null; },
    swapTo: async (leaf, path) => { swaps.push({ leaf, path }); await new Promise((r) => setTimeout(r, 0)); if (dropSwaps > 0) { dropSwaps--; return; } swapped.add(leaf); },
    isSwapped: (leaf) => swapped.has(leaf),
    sleep: async () => {},
    trace: (l) => { lines.push(l); },
  });
  return { router, shows, swaps, lines, swapped, setScoreFirst: (v: boolean) => { scoreFirst = v; }, dropNext: (n: number) => { dropSwaps = n; } };
}
const open = (r: ReturnType<typeof rig>, leaf: Leaf, filePath: string | null, extra: Partial<PhraseLeafInfo> = {}) => { r.swapped.delete(leaf); r.shows.set(leaf, { filePath, ...extra }); };

test('(a) a phrase opened in a score-first vault (the explorer, a link, the quick switcher: a leaf now shows the note as markdown) is swapped to the phrase tab, in that leaf', async () => {
  const r = rig(); const leaf = leafOf('a');
  open(r, leaf, 'phrases/phrase_001.md');
  assert.equal(await r.router.evaluate(leaf), 'score');
  assert.deepEqual(r.swaps, [{ leaf, path: 'phrases/phrase_001.md' }]);
  assert.deepEqual(r.lines, ['[forge-phrase] routed phrases/phrase_001.md -> score (a new open in a score-first vault)']);
});

test('(b) outside a score-first vault nothing is swapped, whatever the note is', async () => {
  const r = rig({ scoreFirst: false }); const leaf = leafOf('b');
  open(r, leaf, 'phrases/phrase_001.md');
  assert.equal(await r.router.evaluate(leaf), 'not-score-first');
  assert.deepEqual(r.swaps, []);
});

test('(c) Open as JSON stays JSON: the mark holds across every re-sync (the +150 / +600 ms passes, file-open, active-leaf-change), no matter how many times the leaf is evaluated', async () => {
  const r = rig(); const leaf = leafOf('c');
  open(r, leaf, 'phrases/phrase_001.md');
  r.router.setMark(leaf, 'phrases/phrase_001.md', 'markdown');          // what the phrase tab's Open as JSON does BEFORE it switches the tab
  for (let i = 0; i < 6; i++) assert.equal(await r.router.evaluate(leaf), 'chosen-json');
  assert.deepEqual(r.swaps, []);
  assert.deepEqual(r.lines, ['[forge-phrase] routed phrases/phrase_001.md -> json (the person chose Open as JSON)'], 'one evidence line, not six');
});

test('the JSON choice lasts until the leaf navigates elsewhere: another note drops the mark, and coming back to the phrase is a new open that routes to the Score', async () => {
  const r = rig(); const leaf = leafOf('c2');
  open(r, leaf, 'phrases/phrase_001.md');
  r.router.setMark(leaf, 'phrases/phrase_001.md', 'markdown');
  assert.equal(await r.router.evaluate(leaf), 'chosen-json');
  open(r, leaf, 'notes/other.md');
  assert.equal(await r.router.evaluate(leaf), 'not-a-phrase');
  open(r, leaf, 'phrases/phrase_001.md');
  assert.equal(await r.router.evaluate(leaf), 'score');
});

test('a mark for one phrase does not protect another phrase opened in the same leaf', async () => {
  const r = rig(); const leaf = leafOf('c3');
  open(r, leaf, 'phrases/phrase_001.md');
  r.router.setMark(leaf, 'phrases/phrase_001.md', 'markdown');
  open(r, leaf, 'phrases/phrase_002.md');
  assert.equal(await r.router.evaluate(leaf), 'score');
});

test('(d) only phrase notes: the folder README, a note deeper in phrases/, a bar, and any other note are left as they are', async () => {
  const r = rig();
  for (const p of ['phrases/README.md', 'phrases/deep/phrase_001.md', 'phrases/phrase_001.txt', 'bars/bar_005.md', 'notes/phrase_001.md', 'phrase_001.md']) {
    const leaf = leafOf(p); open(r, leaf, p);
    assert.equal(await r.router.evaluate(leaf), 'not-a-phrase', p);
  }
  assert.deepEqual(r.swaps, []);
  assert.deepEqual(r.lines, [], 'and they say nothing');
});

test('(e) a tab restored from the saved layout keeps showing its text; the first time that leaf navigates to a phrase it is a new open', async () => {
  const r = rig(); const leaf = leafOf('e');
  open(r, leaf, 'phrases/phrase_001.md');
  r.router.restore([[leaf, 'phrases/phrase_001.md']]);                   // the snapshot taken when the router is registered
  assert.equal(await r.router.evaluate(leaf), 'layout-restore');
  assert.equal(await r.router.evaluate(leaf), 'layout-restore');
  assert.deepEqual(r.swaps, []);
  assert.deepEqual(r.lines, ['[forge-phrase] routed phrases/phrase_001.md -> json (a tab restored with the layout)']);
  open(r, leaf, 'phrases/phrase_002.md');                                // the person opens another phrase in that tab
  assert.equal(await r.router.evaluate(leaf), 'score');
  open(r, leaf, 'phrases/phrase_001.md');                                // ... and back: the restore no longer protects it
  assert.equal(await r.router.evaluate(leaf), 'score');
});

test('a leaf that was NOT in the snapshot (a tab opened after registration) is a new open even when it shows the same phrase as a restored one', async () => {
  const r = rig(); const old = leafOf('old'); const fresh = leafOf('fresh');
  open(r, old, 'phrases/phrase_001.md'); r.router.restore([[old, 'phrases/phrase_001.md']]);
  open(r, fresh, 'phrases/phrase_001.md');
  assert.equal(await r.router.evaluate(fresh), 'score');
  assert.equal(await r.router.evaluate(old), 'layout-restore');
});

test('only the main area and the sidebars are swapped: a hover preview, a pop-out or a canvas card is left alone; so is anything that is not a plain markdown view', async () => {
  const r = rig(); const a = leafOf('x'); const b = leafOf('y');
  open(r, a, 'phrases/phrase_001.md', { location: 'other' });
  assert.equal(await r.router.evaluate(a), 'not-allowed-location');
  open(r, b, 'phrases/phrase_001.md', { isPlainMarkdownView: false });
  r.swapped.delete(b);
  r.shows.set(b, { filePath: 'phrases/phrase_001.md', isPlainMarkdownView: false });
  assert.equal(await r.router.evaluate(b), 'not-markdown-view');
  assert.equal(await r.router.evaluate(leafOf('gone')), 'not-markdown-view');
  assert.deepEqual(r.swaps, []);
});

test('no loop: once swapped the leaf is no longer markdown and further evaluations do nothing; a swap that is already in progress is not entered twice', async () => {
  const r = rig(); const leaf = leafOf('loop');
  open(r, leaf, 'phrases/phrase_001.md');
  await Promise.all([r.router.evaluate(leaf), r.router.evaluate(leaf), r.router.evaluate(leaf)]);
  assert.equal(r.swaps.length, 1, 'three events at once, one swap');
  assert.equal(await r.router.evaluate(leaf), 'not-markdown-view');
  assert.equal(r.swaps.length, 1);
});

test('a swap Obsidian silently drops (the leaf was busy) is retried, and reported when it never lands', async () => {
  const r = rig(); const leaf = leafOf('retry');
  open(r, leaf, 'phrases/phrase_001.md'); r.dropNext(2);
  assert.equal(await r.router.evaluate(leaf), 'score');
  assert.equal(r.swaps.length, 3);
  const never = rig(); const l2 = leafOf('never');
  open(never, l2, 'phrases/phrase_001.md'); never.dropNext(99);
  assert.equal(await never.router.evaluate(l2), 'swap-failed');
  assert.match(never.lines.join('\n'), /\[forge-phrase\] could not route phrases\/phrase_001\.md -> score \(the tab did not switch\)/);
});

test('the leaf navigating away while the swap is retried is left alone (it is not dragged back to the phrase)', async () => {
  const r = rig(); const leaf = leafOf('away');
  open(r, leaf, 'phrases/phrase_001.md'); r.dropNext(1);
  const sleeping = r.router.evaluate(leaf);
  r.shows.set(leaf, { filePath: 'notes/other.md' });
  assert.equal(await sleeping, 'navigated-away');
  assert.equal(r.swaps.length, 1, 'no second swap');
});

test('a choice made while the swap is being retried (Open as JSON clicked in the gap) stops the retries', async () => {
  const r = rig(); const leaf = leafOf('chose');
  open(r, leaf, 'phrases/phrase_001.md'); r.dropNext(1);
  const sleeping = r.router.evaluate(leaf);
  r.router.setMark(leaf, 'phrases/phrase_001.md', 'markdown');
  assert.equal(await sleeping, 'navigated-away');
  assert.equal(r.swaps.length, 1);
});

test('Open as Score forgets the JSON choice: setMark(null) and the next open of the phrase routes to the Score', async () => {
  const r = rig(); const leaf = leafOf('forget');
  open(r, leaf, 'phrases/phrase_001.md');
  r.router.setMark(leaf, 'phrases/phrase_001.md', 'markdown');
  assert.equal(await r.router.evaluate(leaf), 'chosen-json');
  r.router.setMark(leaf, 'phrases/phrase_001.md', null);
  assert.equal(await r.router.evaluate(leaf), 'score');
});

test('a restored tab that was shown as a Score for a while (not a markdown view) is still a restored tab when its text comes back', async () => {
  const r = rig(); const leaf = leafOf('excursion');
  open(r, leaf, 'phrases/phrase_001.md'); r.router.restore([[leaf, 'phrases/phrase_001.md']]);
  r.shows.set(leaf, { filePath: null, isPlainMarkdownView: false });
  assert.equal(await r.router.evaluate(leaf), 'not-markdown-view');
  open(r, leaf, 'phrases/phrase_001.md');
  assert.equal(await r.router.evaluate(leaf), 'layout-restore');
});

test('decidePhraseRoute is an allow-list: every positive condition at once, and the reason names the first one that fails', () => {
  const ok: PhraseRouteInput = { scoreFirst: true, swapInProgress: false, location: 'main', isPlainMarkdownView: true, filePath: 'phrases/phrase_007.md', mark: null, restoredPath: null };
  assert.deepEqual(decidePhraseRoute(ok), { swap: true, reason: 'score' });
  const no = (over: Partial<PhraseRouteInput>) => decidePhraseRoute({ ...ok, ...over });
  assert.equal(no({ scoreFirst: false }).reason, 'not-score-first');
  assert.equal(no({ swapInProgress: true }).reason, 'swap-in-progress');
  assert.equal(no({ location: 'other' }).reason, 'not-allowed-location');
  assert.equal(no({ location: 'sidebar' }).swap, true);
  assert.equal(no({ isPlainMarkdownView: false }).reason, 'not-markdown-view');
  assert.equal(no({ filePath: null }).reason, 'no-file');
  assert.equal(no({ filePath: 'phrases/README.md' }).reason, 'not-a-phrase');
  assert.equal(no({ mark: 'markdown' }).reason, 'chosen-json');
  assert.equal(no({ restoredPath: 'phrases/phrase_007.md' }).reason, 'layout-restore');
  assert.equal(no({ restoredPath: 'phrases/phrase_006.md' }).swap, true, 'a snapshot of ANOTHER file does not protect this one');
});
