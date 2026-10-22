// drain 2026-10-22-2100 — the way back from a phrase's JSON to its Score: while a phrase note is shown as TEXT in a markdown tab (score-first vault only), that tab's header carries an
// "Open as Score" button; it is removed when the tab shows anything else; a bar, any other note, and every other vault never get it. Pure: the markdown views are injected.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_HEADER_ICON, PHRASE_HEADER_TITLE, choosePhraseTarget, createPhraseHeaderSync, rhythmHeaderApplies, wantsPhraseHeader } from './phrase-header-core.ts';

function view(path: string | null) {
  const made: Array<{ icon: string; title: string; cb: () => void; removed: boolean; remove(): void }> = [];
  const v = {
    file: path === null ? null : { path },
    made,
    addAction(icon: string, title: string, cb: () => void) { const el = { icon, title, cb, removed: false, remove() { el.removed = true; } }; made.push(el); return el as unknown as HTMLElement; },
  };
  return v;
}
const live = (v: ReturnType<typeof view>) => v.made.filter((m) => !m.removed);

test('who gets the button: a phrase note, in a score-first vault, nothing else', () => {
  assert.equal(wantsPhraseHeader(true, 'phrases/phrase_001.md'), true);
  assert.equal(wantsPhraseHeader(false, 'phrases/phrase_001.md'), false, 'P3: every other vault');
  for (const p of ['bars/bar_001.md', 'phrases/README.md', 'notes/x.md', '', null, undefined]) assert.equal(wantsPhraseHeader(true, p as string | null | undefined), false, String(p));
});

test('the label is the Beat Box\'s own: "Open as Score", with the Score icon', () => {
  assert.equal(PHRASE_HEADER_TITLE, 'Open as Score');
  assert.equal(PHRASE_HEADER_ICON, 'list-music');
});

test('sync adds ONE button to a markdown view showing a phrase, once, and a click opens that view\'s phrase', () => {
  const opened: Array<[unknown, string]> = [];
  const s = createPhraseHeaderSync<ReturnType<typeof view>>({ isScoreFirst: () => true, open: (v, p) => { opened.push([v, p]); } });
  const v = view('phrases/phrase_001.md');
  s.sync([v]); s.sync([v]); s.sync([v]);
  assert.equal(live(v).length, 1, 'idempotent: events fire often');
  assert.deepEqual([live(v)[0].icon, live(v)[0].title], ['list-music', 'Open as Score']);
  live(v)[0].cb();
  assert.deepEqual(opened, [[v, 'phrases/phrase_001.md']]);
});

test('a bar, another note, a view with no file and a non-score-first vault get nothing (guard: the bar\'s text tab is byte-for-byte what it was)', () => {
  const s = createPhraseHeaderSync<ReturnType<typeof view>>({ isScoreFirst: () => true, open: () => {} });
  const vs = [view('bars/bar_005.md'), view('notebook/a.md'), view(null), view('phrases/README.md')];
  s.sync(vs);
  for (const v of vs) assert.equal(v.made.length, 0);
  const off = createPhraseHeaderSync<ReturnType<typeof view>>({ isScoreFirst: () => false, open: () => {} });
  const p = view('phrases/phrase_001.md'); off.sync([p]);
  assert.equal(p.made.length, 0);
});

test('a markdown view is REUSED when its tab navigates: the button goes when the note is no longer a phrase, and comes back for the next one', () => {
  const s = createPhraseHeaderSync<ReturnType<typeof view>>({ isScoreFirst: () => true, open: () => {} });
  const v = view('phrases/phrase_001.md');
  s.sync([v]); assert.equal(live(v).length, 1);
  v.file = { path: 'bars/bar_001.md' }; s.sync([v]); assert.equal(live(v).length, 0, 'removed');
  v.file = { path: 'phrases/phrase_002.md' }; s.sync([v]); assert.equal(live(v).length, 1, 'added again');
  assert.equal(v.made.length, 2);
});

test('the answer is asked LIVE: a vault that was not score-first when the view appeared gets the button once it is, and loses it if it stops being one', () => {
  let on = false;
  const s = createPhraseHeaderSync<ReturnType<typeof view>>({ isScoreFirst: () => on, open: () => {} });
  const v = view('phrases/phrase_001.md');
  s.sync([v]); assert.equal(live(v).length, 0);
  on = true; s.sync([v]); assert.equal(live(v).length, 1);
  on = false; s.sync([v]); assert.equal(live(v).length, 0);
});

test('the rhythm note buttons (Beat Box / Score) do not appear on a phrase in a score-first vault (they would refuse: a phrase is not rhythm data, and "Open as Score" would be there twice); everywhere else exactly as before', () => {
  assert.equal(rhythmHeaderApplies(true, true, 'phrases/phrase_001.md'), false);
  assert.equal(rhythmHeaderApplies(true, false, 'phrases/phrase_001.md'), true, 'not score-first: unchanged, even for a note that happens to be named like a phrase');
  assert.equal(rhythmHeaderApplies(true, true, 'bars/bar_001.md'), true);
  assert.equal(rhythmHeaderApplies(false, true, 'bars/bar_001.md'), false, 'a non-candidate is still not');
  assert.equal(rhythmHeaderApplies(true, true, null), true);
});

// ---- drain 2026-10-22-2105: "Open phrase as Score" must act on the tab that SHOWS the phrase, not on whatever getLeaf(false) returns ------------------------------------------------------------
const L = (name: string) => ({ name });
test('the command targets the active markdown view\'s own leaf when it shows a phrase (the Beat Box commands\' rule), never the fallback', () => {
  const own = L('own'); const other = L('other'); const fallback = L('fallback');
  const t = choosePhraseTarget({ scoreFirst: true, activeMarkdown: { path: 'phrases/phrase_001.md', leaf: own }, markdownLeaves: [{ path: 'phrases/phrase_001.md', leaf: other }], activePath: 'phrases/phrase_001.md', });
  assert.deepEqual(t, { path: 'phrases/phrase_001.md', leaf: own });
});

test('when the active leaf is not a markdown view (the file explorer, the Forge panel) but the active FILE is a phrase, the markdown tab showing that file is the target', () => {
  const shows = L('shows'); const fallback = L('fallback');
  const t = choosePhraseTarget({ scoreFirst: true, activeMarkdown: null, markdownLeaves: [{ path: 'bars/bar_001.md', leaf: L('x') }, { path: 'phrases/phrase_002.md', leaf: shows }], activePath: 'phrases/phrase_002.md', });
  assert.deepEqual(t, { path: 'phrases/phrase_002.md', leaf: shows });
});

test('the path comes from the active markdown view first (it is what the person is looking at), then from the active file', () => {
  const t = choosePhraseTarget({ scoreFirst: true, activeMarkdown: { path: 'phrases/phrase_003.md', leaf: L('a') }, markdownLeaves: [], activePath: 'phrases/phrase_001.md' });
  assert.equal(t?.path, 'phrases/phrase_003.md');
  const u = choosePhraseTarget({ scoreFirst: true, activeMarkdown: null, markdownLeaves: [], activePath: 'phrases/phrase_004.md' });
  assert.equal(u?.path, 'phrases/phrase_004.md');
});

test('only as a last resort, and only for a phrase that is the active file, is there no tab (null leaf: no tab shows it)', () => {
  const t = choosePhraseTarget({ scoreFirst: true, activeMarkdown: null, markdownLeaves: [], activePath: 'phrases/phrase_001.md', });
  assert.deepEqual(t, { path: 'phrases/phrase_001.md', leaf: null }, 'null: the caller asks Obsidian for a leaf only when it RUNS (getLeaf(false) can create one)');
});

test('nothing to act on: not score-first, not a phrase, no active file — null (so the command is not offered)', () => {
  const base = { activeMarkdown: null, markdownLeaves: [] };
  assert.equal(choosePhraseTarget({ ...base, scoreFirst: false, activePath: 'phrases/phrase_001.md' }), null, 'P3');
  assert.equal(choosePhraseTarget({ ...base, scoreFirst: true, activePath: 'bars/bar_001.md' }), null);
  assert.equal(choosePhraseTarget({ ...base, scoreFirst: true, activePath: 'phrases/README.md' }), null);
  assert.equal(choosePhraseTarget({ ...base, scoreFirst: true, activePath: null }), null);
  assert.equal(choosePhraseTarget({ scoreFirst: true, activeMarkdown: { path: 'bars/bar_001.md', leaf: L('a') }, markdownLeaves: [], activePath: null }), null);
  assert.equal(choosePhraseTarget({ scoreFirst: true, activeMarkdown: { path: 'bars/bar_001.md', leaf: L('a') }, markdownLeaves: [], activePath: 'phrases/phrase_001.md' }), null, 'the tab the person is looking at shows a bar: the command is not offered, whatever the active file says');
});
