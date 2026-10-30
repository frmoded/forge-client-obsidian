// score_first M12 (drain 2026-10-26-1250, DEMO profile) — the two-pane spike, the decisions: which note a pinned bar sends the notes pane to (the rule the FEEDBACK states), when the command is offered, and the pair
// of panes as a small state machine (open, follow the pin, focus instead of a third pane, a closed pane is dropped without a throw). Every Obsidian touch is a port, so this runs without Obsidian.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPaneLinker, openPairAvailable, pinnedNoteFor, type PaneLinkerPorts } from './linked-panes-core.ts';

const prov = (role: string, params: Record<string, unknown>, noteId = 'phrases/phrase_001') => ({ noteId, role, params });

// ---- the rule: which note made THIS bar -------------------------------------------------------------------------------------------------------------------------------------------------

test('an extend bar: the source bar; a forked bar: its fork note (the bar was edited there)', () => {
  assert.deepEqual(pinnedNoteFor(prov('phrase-bar', { bar: 3, bars: 8, source: 'bar_005', style: 'repeat_with_fills' })), { noteId: 'bars/bar_005', reason: 'pinned bar 3' });
  assert.deepEqual(pinnedNoteFor(prov('phrase-bar', { bar: 3, bars: 8, source: 'bar_005', fork: 'bars/bar_009' })), { noteId: 'bars/bar_009', reason: 'forked' });
});

test('a morph bar or one of its hits: bar a at or before the middle bar, else bar b; a fork wins', () => {
  const morph = (bar: number, bars: number, extra: Record<string, unknown> = {}, role = 'morph-bar') => prov(role, { a: 'bar_007', b: 'bar_008', bar, bars, ...extra });
  assert.equal(pinnedNoteFor(morph(1, 5))?.noteId, 'bars/bar_007');
  assert.equal(pinnedNoteFor(morph(3, 5))?.noteId, 'bars/bar_007', 'the middle bar of an odd count is "at the middle": a');
  assert.equal(pinnedNoteFor(morph(4, 5))?.noteId, 'bars/bar_008');
  assert.equal(pinnedNoteFor(morph(5, 5))?.noteId, 'bars/bar_008');
  assert.equal(pinnedNoteFor(morph(2, 4))?.noteId, 'bars/bar_007', 'an even count: the middle is 2.5, bar 2 is before it');
  assert.equal(pinnedNoteFor(morph(3, 4))?.noteId, 'bars/bar_008');
  assert.equal(pinnedNoteFor(morph(1, 1))?.noteId, 'bars/bar_007', 'one bar: a');
  assert.equal(pinnedNoteFor(morph(5, 5, {}, 'morph-hit'))?.noteId, 'bars/bar_008', 'a hit of bar 5 is bar 5');
  assert.deepEqual(pinnedNoteFor(morph(2, 5, { fork: 'bars/bar_010' })), { noteId: 'bars/bar_010', reason: 'forked' });
  assert.equal(pinnedNoteFor(morph(2, 5))?.reason, 'pinned bar 2');
});

test('a path mix (its one bar): bar a when at most half of the changes are applied, else bar b; a vote mix: the heavier parent (a on a tie)', () => {
  const path = (k: number, d: number, role = 'mix-bar') => prov(role, { a: 'bar_005', b: 'bar_006', mode: 'path', k, d, weight: 1 - k / d });
  assert.equal(pinnedNoteFor(path(0, 8))?.noteId, 'bars/bar_005');
  assert.equal(pinnedNoteFor(path(4, 8))?.noteId, 'bars/bar_005', 'exactly half: a');
  assert.equal(pinnedNoteFor(path(5, 8))?.noteId, 'bars/bar_006');
  assert.equal(pinnedNoteFor(path(8, 8, 'mix-hit'))?.noteId, 'bars/bar_006');
  const vote = (weight: number) => prov('mix-bar', { a: 'bar_005', b: 'bar_006', weight, threshold: 0.65, ghost: true });
  assert.equal(pinnedNoteFor(vote(0.8))?.noteId, 'bars/bar_005');
  assert.equal(pinnedNoteFor(vote(0.5))?.noteId, 'bars/bar_005');
  assert.equal(pinnedNoteFor(vote(0.2))?.noteId, 'bars/bar_006');
  assert.equal(pinnedNoteFor(vote(0.8))?.reason, 'pinned bar 1', 'a mix has one bar');
});

test('anything that is not a bar of a phrase (a bar tab\'s own hit, a role we do not know, a missing source) sends the notes pane nowhere new: null', () => {
  assert.equal(pinnedNoteFor(prov('hit', { channel: 'kick', step: 0 }, 'bars/bar_005')), null);
  assert.equal(pinnedNoteFor(prov('something-else', {})), null);
  assert.equal(pinnedNoteFor(prov('phrase-bar', { bar: 1, bars: 2 })), null, 'no source, no fork');
  assert.equal(pinnedNoteFor(prov('morph-bar', { bar: 1, bars: 2 })), null, 'no a/b');
});

// ---- when the command is offered -------------------------------------------------------------------------------------------------------------------------------------------------------

test('Open Score with notes: offered in a score-first vault on a phrase tab, a phrase\'s JSON text tab or a bar\'s Beat Box tab; nowhere else', () => {
  for (const kind of ['phrase', 'phrase-text', 'bar', 'arrangement'] as const) assert.equal(openPairAvailable({ scoreFirst: true, kind }), true, kind);
  assert.equal(openPairAvailable({ scoreFirst: true, kind: null }), false, 'some other tab');
  for (const kind of ['phrase', 'phrase-text', 'bar', 'arrangement', null] as const) assert.equal(openPairAvailable({ scoreFirst: false, kind }), false, `not score-first (${kind})`);
});

// ---- the pair ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

type Leaf = { id: string };
function world() {
  const lines: string[] = [];
  const alive = new Set<Leaf>();
  const shown = new Map<Leaf, string>();
  const focused: Leaf[] = [];
  const opened: Array<{ score: Leaf; path: string }> = [];
  const fail = { show: false, open: false };
  let hook: (() => void) | null = null;
  let n = 0;
  const ports: PaneLinkerPorts<Leaf> = {
    openBeside: async (score, path) => { if (fail.open) throw new Error('no room'); const l = { id: `notes-${++n}` }; alive.add(l); shown.set(l, path); opened.push({ score, path }); return l; },
    show: async (notes, path) => { if (fail.show) throw new Error('busy'); await Promise.resolve(); shown.set(notes, path); hook?.(); },
    alive: (l) => alive.has(l),
    focus: (l) => { focused.push(l); },
    trace: (line) => { lines.push(line); },
    pathOf: (l) => shown.get(l) ?? null,
  };
  const score: Leaf = { id: 'score' }; alive.add(score);
  return { linker: createPaneLinker<Leaf>(ports), lines, alive, shown, focused, opened, fail, score, onShow: (fn: () => void) => { hook = fn; } };
}

test('open: the notes pane is made beside the Score showing the home note, one evidence line says both paths', async () => {
  const w = world();
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened');
  assert.deepEqual(w.opened, [{ score: w.score, path: 'phrases/phrase_001.md' }]);
  assert.deepEqual(w.lines, ['[forge-panes] opened pair (score phrases/phrase_001.md, notes phrases/phrase_001.md)']);
});

test('a pin sends the notes pane to the pinned bar\'s note, with the reason; Esc (null) sends it home; the same destination twice says and does nothing', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  w.lines.length = 0;
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  assert.equal(w.shown.get(notes), 'bars/bar_005.md');
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 3' });
  await w.linker.pinned(w.score, { noteId: 'bars/bar_009', reason: 'forked' });
  assert.equal(w.shown.get(notes), 'bars/bar_009.md');
  await w.linker.pinned(w.score, null);
  assert.equal(w.shown.get(notes), 'phrases/phrase_001.md');
  await w.linker.pinned(w.score, null);
  assert.deepEqual(w.lines, [
    '[forge-panes] notes pane -> bars/bar_005.md (reason: pinned bar 2)',
    '[forge-panes] notes pane -> bars/bar_009.md (reason: forked)',
    '[forge-panes] notes pane -> phrases/phrase_001.md (reason: released)',
  ]);
});

test('rapid pins collapse: the notes pane ends on the LAST one and never shows an older one afterwards', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  const all = [1, 2, 3, 4, 5].map((i) => w.linker.pinned(w.score, { noteId: `bars/bar_00${i}`, reason: `pinned bar ${i}` }));
  await Promise.all(all);
  assert.equal(w.shown.get(notes), 'bars/bar_005.md');
});

test('a pin on a Score that has no pair does nothing (no throw, no line)', async () => {
  const w = world();
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.deepEqual(w.lines, []);
});

test('the command again while the pair exists FOCUSES it: no third pane is made', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'focused');
  assert.equal(w.opened.length, 1);
  assert.deepEqual(w.focused, [w.score]);
});

test('closing the notes pane, the Score, or both: a strict sweep drops the pair with one line naming which, never throws, and a pin afterwards does nothing; the command makes a fresh pair', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  w.alive.delete(notes);
  w.lines.length = 0;
  w.linker.sweep(true);
  w.linker.sweep(true);
  assert.equal(w.lines.length, 1, 'once');
  assert.match(w.lines[0]!, /^\[forge-panes\] pair closed \(notes pane; reason: leaf missing from iterateAllLeaves asked by the command #\d+\)$/);
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.equal(w.lines.length, 1);
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened');
  w.alive.delete(w.score);
  w.lines.length = 0;
  w.linker.sweep(true);
  assert.match(w.lines.join('|'), /^\[forge-panes\] pair closed \(score pane; reason: leaf missing/);
  const again = world();
  await again.linker.open(again.score, 'a.md', 'a.md');
  again.alive.clear();
  again.lines.length = 0;
  again.linker.sweep(true);
  assert.match(again.lines.join('|'), /^\[forge-panes\] pair closed \(both panes; reason: leaf missing/);
});

test('a pane that cannot be made, or a note that cannot be shown, is a line and a result, never a throw, and leaves no half pair behind', async () => {
  const w = world();
  w.fail.open = true;
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'failed');
  assert.match(w.lines.at(-1)!, /^\[forge-panes\] could not open the notes pane: no room$/);
  w.fail.open = false;
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened', 'no half pair: the next try makes a whole one');
  w.fail.show = true;
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.match(w.lines.at(-1)!, /^\[forge-panes\] could not show bars\/bar_005\.md in the notes pane: busy$/);
});

test('two Scores, two pairs: each pin follows its own pair', async () => {
  const w = world();
  const second: Leaf = { id: 'score-2' }; w.alive.add(second);
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  await w.linker.open(second, 'phrases/phrase_002.md', 'phrases/phrase_002.md');
  const [n1, n2] = [...w.alive].filter((l) => l.id.startsWith('notes'));
  await w.linker.pinned(second, { noteId: 'bars/bar_007', reason: 'pinned bar 1' });
  assert.equal(w.shown.get(n2), 'bars/bar_007.md');
  assert.equal(w.shown.get(n1), 'phrases/phrase_001.md');
});

// ---- M13 (drain 2026-10-26-1270): the strip talks to the pair ------------------------------------------------------------------------------------------------------------------------------

test('navigate (a chip was clicked): the notes pane goes to that note and the answer is true; without a pair the answer is false and nothing happens', async () => {
  const w = world();
  assert.equal(await w.linker.navigate(w.score, 'bars/bar_008'), false);
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  w.lines.length = 0;
  assert.equal(await w.linker.navigate(w.score, 'bars/bar_008'), true);
  assert.equal(w.shown.get(notes), 'bars/bar_008.md');
  assert.deepEqual(w.lines, ['[forge-panes] notes pane -> bars/bar_008.md (reason: structure chip)']);
});

test('navigate takes the reason the evidence line gives (a new phrase made from a sentence): the default stays "structure chip", the pair is the same, an unknown Score still answers false', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  w.lines.length = 0;
  assert.equal(await w.linker.navigate(w.score, 'phrases/phrase_002', 'new phrase'), true);
  assert.deepEqual(w.lines, ['[forge-panes] notes pane -> phrases/phrase_002.md (reason: new phrase)']);
  w.lines.length = 0;
  assert.equal(await w.linker.navigate(w.score, 'bars/bar_008'), true);
  assert.deepEqual(w.lines, ['[forge-panes] notes pane -> bars/bar_008.md (reason: structure chip)'], 'a later navigation without a reason goes back to the default');
  assert.equal(await w.linker.navigate({} as any, 'bars/bar_008', 'new phrase'), false);
});

test('the person navigates the notes pane (a wikilink click): checkNotes tells the listeners the new path ONCE, and a Score-caused show is never echoed back (the cause is tagged)', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  const heard: string[] = [];
  const off = w.linker.onNotesNavigated(w.score, (path) => heard.push(path));
  w.linker.checkNotes();
  assert.deepEqual(heard, [], 'nothing moved');
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  await w.linker.navigate(w.score, 'bars/bar_008');
  w.linker.checkNotes();
  assert.deepEqual(heard, [], 'the Score moved the pane: not an echo');
  w.shown.set(notes, 'bars/bar_007.md');                     // the person clicked [[bar_007]] in the Recipe
  w.linker.checkNotes(); w.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_007.md'], 'once');
  assert.match(w.lines.at(-1)!, /^\[forge-panes\] notes pane -> bars\/bar_007\.md \(reason: navigated in the pane\)$/);
  await w.linker.pinned(w.score, { noteId: 'bars/bar_007', reason: 'pinned bar 4' });
  assert.equal(w.shown.get(notes), 'bars/bar_007.md');
  w.shown.set(notes, 'phrases/phrase_001.md'); w.linker.checkNotes();
  assert.deepEqual(heard, ['bars/bar_007.md', 'phrases/phrase_001.md']);
  off();
  w.shown.set(notes, 'bars/bar_005.md'); w.linker.checkNotes();
  assert.equal(heard.length, 2, 'unsubscribed');
});

test('a pane that has no path (a view that shows no file) or is gone says nothing; no pair = checkNotes does nothing', async () => {
  const w = world();
  w.linker.checkNotes();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  const heard: string[] = [];
  w.linker.onNotesNavigated(w.score, (p) => heard.push(p));
  w.shown.delete(notes); w.linker.checkNotes();
  w.alive.delete(notes); w.linker.checkNotes();
  assert.deepEqual(heard, []);
});

test('an event fired INSIDE the Score\'s own show (Obsidian fires file-open while it navigates) is the Score\'s, not the person\'s: nothing is heard', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const heard: string[] = [];
  w.linker.onNotesNavigated(w.score, (p) => heard.push(p));
  w.onShow(() => w.linker.checkNotes());
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 2' });
  await w.linker.navigate(w.score, 'bars/bar_008');
  assert.deepEqual(heard, []);
});

// 2026-10-26-1800 (item 2): a wikilink clicked in the notes pane opens the target as the READING view (the same show the Score uses), the pair and the listeners (the strip's lights) as before; a pane that already
// reads is not touched; and the notes pane is held for the default-view routers for the life of the pair (released when the pair is dropped).
test('2026-10-26-1800: a person\'s navigation that left the notes pane in an editing mode is shown again as the reading view, once, without an echo; a pane that already reads is left alone', async () => {
  const w = world();
  const modes = new Map<Leaf, 'preview' | 'source'>();
  const shows: Array<{ leaf: Leaf; path: string }> = [];
  const held: Array<[Leaf, boolean]> = [];
  const lines: string[] = [];
  const alive = new Set<Leaf>(); const shown = new Map<Leaf, string>();
  const score: Leaf = { id: 'score' }; alive.add(score);
  const linker = createPaneLinker<Leaf>({
    openBeside: async (_s, p) => { const l = { id: 'notes' }; alive.add(l); shown.set(l, p); modes.set(l, 'preview'); return l; },
    show: async (l, p) => { shows.push({ leaf: l, path: p }); shown.set(l, p); modes.set(l, 'preview'); },
    alive: (l) => alive.has(l), focus: () => {}, trace: (l) => lines.push(l), pathOf: (l) => shown.get(l) ?? null,
    isReading: (l) => modes.get(l) === 'preview', hold: (l, on) => { held.push([l, on]); },
  });
  await linker.open(score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...alive].find((l) => l.id === 'notes')!;
  assert.deepEqual(held, [[notes, true]], 'held from the moment it is made');
  const heard: string[] = []; linker.onNotesNavigated(score, (p) => heard.push(p));
  shown.set(notes, 'bars/bar_008.md'); modes.set(notes, 'source');              // the person clicked [[bar_008]] and Obsidian opened it for editing
  linker.checkNotes(); linker.checkNotes();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(shows, [{ leaf: notes, path: 'bars/bar_008.md' }], 'shown again as reading, once');
  assert.deepEqual(heard, ['bars/bar_008.md'], 'the strip still hears it once');
  linker.checkNotes();
  assert.equal(shows.length, 1, 'the show we made is not the person\'s navigation: no echo, no second show');
  shown.set(notes, 'bars/bar_009.md');                                          // a link that kept the reading mode
  linker.checkNotes();
  assert.equal(shows.length, 1, 'already reading: not touched'); assert.deepEqual(heard, ['bars/bar_008.md', 'bars/bar_009.md']);
  alive.delete(score); linker.sweep(true);
  assert.deepEqual(held.at(-1), [notes, false], 'the pair is gone: the pane is an ordinary leaf again');
});
