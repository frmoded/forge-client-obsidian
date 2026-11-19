// 2026-11-19-0970 - the mutation pass over src/sentence-list-core.ts (120 mutants, 101 killed by the first four test files) left 19 survivors: these tests kill the logic ones; the rest are listed with their reason in the FEEDBACK (equivalent or unreachable). One test per behaviour the survivors showed was not pinned:
// the multiset difference `extra` (duplicates), the json / python / recipe of an EMPTY list, the plain words of a wrong-kind line, where an unreadable line is reported (index, line, COLUMN), the loop check's preconditions (no composition is read for phrases; no `self` = no check) and where it reports (line),
// the plan's reasons and message, and the undo stack's redo (it pops the redo and puts the entry back on the undo stack).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createUndoStack, extra, planAppend, removeAt, replay, replayGrammar, type ReplayCtx } from './sentence-list-core.ts';
import { VAULT } from './test-support/sentence-list-fixtures.ts';

const ctx: ReplayCtx = { vault: VAULT };

test('extra is a MULTISET difference in the first list\'s order: duplicates are matched one for one', () => {
  assert.deepEqual(extra(['a', 'b', 'a'], ['a']), ['b', 'a']);
  assert.deepEqual(extra(['a', 'a', 'a'], ['a']), ['a', 'a']);
  assert.deepEqual(extra(['a'], []), ['a'], 'nothing to take away: the item stays');
  assert.deepEqual(extra(['a', 'a'], ['a', 'a']), []);
  assert.deepEqual(extra([], ['a']), []);
  assert.deepEqual(extra(['a', 'b'], ['b', 'c']), ['a']);
});

test('removeAt: a line outside the list or a non-integer index changes nothing (a copy), a middle line goes', () => {
  assert.deepEqual(removeAt(['a', 'b', 'c'], 1), ['a', 'c']);
  for (const bad of [-1, 3, 1.5, Number.NaN, 99]) assert.deepEqual(removeAt(['a', 'b', 'c'], bad), ['a', 'b', 'c'], String(bad));
  const src = ['a']; assert.notEqual(removeAt(src, 7), src, 'a copy, not the same array');
});

test('an EMPTY list replays to nothing: no recipe, no python, the json cache is `{}` (what an empty note holds, 0960)', () => {
  const e = replayGrammar([], 'composition', ctx);
  assert.equal(e.json, '{}'); assert.equal(e.python, ''); assert.deepEqual(e.recipe, []); assert.equal(e.stop, null); assert.equal(e.applied, 0);
});

test('a line of the OTHER kind stops the replay at it, in the words of the whole-description reading (it names both kinds), at line 1 column 1', () => {
  const r = replayGrammar(['Play [[phrase_001]] on the [[rock]] kit.'], 'composition', ctx);
  assert.deepEqual(r.stop && [r.stop.index, r.stop.line, r.stop.column, r.stop.reason], [0, 1, 1, 'unreadable']);
  assert.match(r.stop!.message, /this note is a composition, but the sentence describes an arrangement/);
});

test('an unreadable line is reported at its index and line, and at the COLUMN the grammar found (not column 1) when the error is on that line', () => {
  const first = replayGrammar(['Play [[phrase_001]] and then dance.'], 'composition', ctx);
  assert.deepEqual(first.stop && [first.stop.index, first.stop.line, first.stop.column], [0, 1, 21], 'the first line: the grammar\'s column');
  const second = replayGrammar(['Play [[phrase_001]].', 'Then play [[nope_9]].'], 'composition', ctx);
  assert.deepEqual(second.stop && [second.stop.index, second.stop.line, second.stop.column], [1, 2, 11], 'the second line: line 2, the grammar\'s column in it');
  assert.equal(second.applied, 1, 'the line before it still applies');
});

test('the loop check: no `self` means no check (and no throw); a composition made of phrases never asks the vault for a composition; a loop at the SECOND line is reported at line 2', async () => {
  const noSelf = await replay(['Play [[phrase_001]].'], 'composition', { vault: VAULT, readSections: async () => null });
  assert.equal(noSelf.stop, null);
  const reads: string[] = [];
  const phrases = await replay(['Play [[phrase_001]].', 'Then play [[phrase_002]].'], 'composition', { vault: VAULT, self: 'compositions/song_1', readSections: async (id) => { reads.push(id); return null; } });
  assert.equal(phrases.stop, null); assert.deepEqual(reads, [], 'a phrase is not a composition: nothing is read');
  const loops = await replay(['Play [[phrase_001]].', 'Then play [[song_2]].'], 'composition', { vault: VAULT, self: 'compositions/song_1', readSections: async (id) => (id === 'compositions/song_2' ? [{ source: 'compositions/song_1' }] : null) });
  assert.ok(loops.stop !== null, 'the loop is found'); assert.deepEqual([loops.stop!.reason, loops.stop!.index, loops.stop!.line, loops.stop!.column], ['loop', 1, 2, 1]);
  assert.equal(loops.applied, 1, 'the line before the loop still applies');
});

test('planAppend: nothing to add says so (reason empty, line 1); an unreadable line already in the list blocks the plan (reason blocked) with its own words', async () => {
  const none = await planAppend([], 'composition', ['  ', ''], ctx);
  assert.deepEqual(none, { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 });
  const blocked = await planAppend(['Play [[nope_9]].'], 'composition', ['Then play [[phrase_002]].'], ctx);
  assert.ok(blocked.ok === false && blocked.reason === 'blocked', JSON.stringify(blocked)); assert.match((blocked as any).message, /^Line 1 is not a sentence I can read/);
});

test('the undo stack\'s redo pops the redo (a second redo is nothing) and puts the entry back on the undo stack (a later undo takes it again)', () => {
  const s = createUndoStack();
  s.push({ before: [], after: ['a'], added: ['a'], replaced: [] });
  assert.deepEqual(s.undo(['a'])?.removed, ['a']);
  assert.deepEqual(s.redo([])?.added, ['a']);
  assert.equal(s.redo([]), null, 'the redo was used up');
  assert.deepEqual(s.undo(['a'])?.removed, ['a'], 'the redone entry is undoable again');
  assert.equal(s.undo([]), null, 'and then there is nothing');
});

test('the loop check is for COMPOSITIONS only: an arrangement replayed with a `self` and a section reader never reaches it (no throw, no stop, the reader is not asked)', async () => {
  let reads = 0;
  const r = await replay(['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.'], 'arrangement', { vault: VAULT, self: 'arrangements/arr_001', readSections: async () => { reads++; return null; } });
  assert.equal(r.stop, null); assert.equal(r.applied, 2); assert.equal(reads, 0);
});

test('redo puts the entry back on the undo stack WITH what it replaced: undo, redo, undo again restores the replaced sentence (not just "remove the last item")', () => {
  const s = createUndoStack();
  s.push({ before: ['x'], after: ['y'], added: ['y'], replaced: [{ index: 0, sentence: 'x' }] });
  assert.deepEqual(s.undo(['y']), { list: ['x'], removed: ['y'], restored: ['x'] });
  assert.deepEqual(s.redo(['x']), { list: ['y'], added: ['y'] });
  assert.deepEqual(s.undo(['y']), { list: ['x'], removed: ['y'], restored: ['x'] }, 'the second undo knows what was replaced');
});

test('the loop check needs BOTH `self` and a section reader: a composition that plays another composition, replayed with a `self` but no reader (or a reader but no self), is read as it is (no throw, no stop)', async () => {
  const noReader = await replay(['Play [[phrase_001]].', 'Then play [[song_2]].'], 'composition', { vault: VAULT, self: 'compositions/song_1' });
  assert.equal(noReader.stop, null); assert.equal(noReader.applied, 2);
  const noSelf = await replay(['Play [[phrase_001]].', 'Then play [[song_2]].'], 'composition', { vault: VAULT, readSections: async () => [{ source: 'compositions/song_1' }] as any });
  assert.equal(noSelf.stop, null); assert.equal(noSelf.applied, 2);
});
