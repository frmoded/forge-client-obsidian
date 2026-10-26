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
  for (const kind of ['phrase', 'phrase-text', 'bar'] as const) assert.equal(openPairAvailable({ scoreFirst: true, kind }), true, kind);
  assert.equal(openPairAvailable({ scoreFirst: true, kind: null }), false, 'some other tab');
  for (const kind of ['phrase', 'phrase-text', 'bar', null] as const) assert.equal(openPairAvailable({ scoreFirst: false, kind }), false, `not score-first (${kind})`);
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
  let n = 0;
  const ports: PaneLinkerPorts<Leaf> = {
    openBeside: async (score, path) => { if (fail.open) throw new Error('no room'); const l = { id: `notes-${++n}` }; alive.add(l); shown.set(l, path); opened.push({ score, path }); return l; },
    show: async (notes, path) => { if (fail.show) throw new Error('busy'); await Promise.resolve(); shown.set(notes, path); },
    alive: (l) => alive.has(l),
    focus: (l) => { focused.push(l); },
    trace: (line) => { lines.push(line); },
  };
  const score: Leaf = { id: 'score' }; alive.add(score);
  return { linker: createPaneLinker<Leaf>(ports), lines, alive, shown, focused, opened, fail, score };
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

test('closing the notes pane, the Score, or both: sweep drops the pair with one line naming which, never throws, and a pin afterwards does nothing; the command makes a fresh pair', async () => {
  const w = world();
  await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md');
  const notes = [...w.alive].find((l) => l.id.startsWith('notes'))!;
  w.alive.delete(notes);
  w.lines.length = 0;
  w.linker.sweep();
  w.linker.sweep();
  assert.deepEqual(w.lines, ['[forge-panes] pair closed (notes pane)'], 'once');
  await w.linker.pinned(w.score, { noteId: 'bars/bar_005', reason: 'pinned bar 1' });
  assert.equal(w.lines.length, 1);
  assert.equal(await w.linker.open(w.score, 'phrases/phrase_001.md', 'phrases/phrase_001.md'), 'opened');
  w.alive.delete(w.score);
  w.lines.length = 0;
  w.linker.sweep();
  assert.deepEqual(w.lines, ['[forge-panes] pair closed (score pane)']);
  const again = world();
  await again.linker.open(again.score, 'a.md', 'a.md');
  again.alive.clear();
  again.lines.length = 0;
  again.linker.sweep();
  assert.deepEqual(again.lines, ['[forge-panes] pair closed (both panes)']);
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
