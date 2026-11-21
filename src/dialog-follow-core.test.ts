// 2026-11-21-1011: a note's chat history follows the NOTE, not its path. (a) a rename MOVES the entry, (b) a delete DROPS it, (c) the note's creation time is kept with each entry list and a list whose time is not the file's is ignored (a note
// re-created at an old path, a reset done outside Obsidian that gave no event, must not show yesterday's conversation). P3: a vault with no history sees no change (no key made, no save).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIALOG_NOTES_CAP, append, fromOutcome, settingsStore, type DialogEntry } from './dialog-core.ts';
import { LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, dialogDeleted, dialogFresh, dialogPrune, dialogRenamed, dialogStamp, dropDialogHistory, moveDialogHistory, noteCtimeOf } from './dialog-follow-core.ts';

const say = (text: string, at = 1_700_000_000_000): DialogEntry[] => append([], fromOutcome({ type: 'you', text }), at);
const texts = (l: readonly DialogEntry[]): string[] => l.map((e) => e.text);

test('the sentinel names the core (the list-model seam lists it; the lean bundle must not carry it)', () => { assert.equal(LIST_MODEL_SENTINEL_DIALOG_FOLLOW_CORE, 'forge-list-model-core:dialog-follow-core'); });

test('(a) a rename MOVES the history and its time to the new path, the others stay; the file\'s own time (it is the same file) replaces the stored one when given', () => {
  const s: any = { dialogHistory: { 'phrases/a.md': say('one'), 'phrases/z.md': say('other') }, dialogCtime: { 'phrases/a.md': 111, 'phrases/z.md': 5 } };
  assert.equal(moveDialogHistory(s, 'phrases/a.md', 'phrases/b.md', 222), true);
  assert.deepEqual(Object.keys(s.dialogHistory).sort(), ['phrases/b.md', 'phrases/z.md']); assert.deepEqual(texts(s.dialogHistory['phrases/b.md']), ['one']);
  assert.deepEqual(s.dialogCtime, { 'phrases/b.md': 222, 'phrases/z.md': 5 }, 'the moved list carries the file\'s time; the old key is gone');
  const t: any = { dialogHistory: { 'a.md': say('x') }, dialogCtime: { 'a.md': 7 } }; assert.equal(moveDialogHistory(t, 'a.md', 'b.md'), true); assert.deepEqual(t.dialogCtime, { 'b.md': 7 }, 'no time given: the stored one moves with the list');
  const u: any = { dialogHistory: { 'a.md': say('legacy') } }; assert.equal(moveDialogHistory(u, 'a.md', 'b.md', 9), true); assert.deepEqual(u.dialogCtime, { 'b.md': 9 }, 'a legacy list (no time stored) is stamped at the move when the time is known');
  const v: any = { dialogHistory: { 'a.md': say('legacy') } }; assert.equal(moveDialogHistory(v, 'a.md', 'b.md'), true); assert.equal(v.dialogCtime, undefined, 'no time known anywhere: none is made up');
});
test('(a) the moved list REPLACES whatever sat at the new path (a former note\'s leftover); a rename of a note with NO history changes nothing, so a second event for the same move cannot drop the list the first one moved', () => {
  const s: any = { dialogHistory: { 'a.md': say('mine'), 'b.md': say('leftover') }, dialogCtime: { 'a.md': 1, 'b.md': 2 } };
  assert.equal(moveDialogHistory(s, 'a.md', 'b.md', 1), true); assert.deepEqual(texts(s.dialogHistory['b.md']), ['mine']); assert.deepEqual(Object.keys(s.dialogHistory), ['b.md']); assert.deepEqual(s.dialogCtime, { 'b.md': 1 });
  assert.equal(moveDialogHistory(s, 'a.md', 'b.md', 1), false, 'the same event again: nothing at the old path'); assert.deepEqual(texts(s.dialogHistory['b.md']), ['mine'], 'the moved list is still there'); assert.deepEqual(s.dialogCtime, { 'b.md': 1 });
  const t: any = { dialogHistory: { 'b.md': say('leftover') }, dialogCtime: { 'b.md': 2 } };
  assert.equal(moveDialogHistory(t, 'a.md', 'b.md', 1), false); assert.deepEqual(texts(t.dialogHistory['b.md']), ['leftover'], 'a leftover of a deleted note is left to the creation-time check: the renamed note\'s time (1) is not 2, so the store never shows it');
});
test('(b) a delete DROPS the history and its time; nothing else changes; a note with none says so (false)', () => {
  const s: any = { dialogHistory: { 'a.md': say('x'), 'z.md': say('y') }, dialogCtime: { 'a.md': 1, 'z.md': 2 } };
  assert.equal(dropDialogHistory(s, 'a.md'), true); assert.deepEqual(Object.keys(s.dialogHistory), ['z.md']); assert.deepEqual(s.dialogCtime, { 'z.md': 2 });
  assert.equal(dropDialogHistory(s, 'a.md'), false, 'already gone'); assert.deepEqual(Object.keys(s.dialogHistory), ['z.md']);
  const legacy: any = { dialogHistory: { 'a.md': say('x') } }; assert.equal(dropDialogHistory(legacy, 'a.md'), true); assert.deepEqual(legacy.dialogHistory, {});
});
test('P3: a vault with no history sees NO change: the settings object is untouched (no key made), and both functions say false', () => {
  for (const make of [() => ({}), () => ({ dialogHistory: {} }), () => ({ dialogHistory: {}, dialogCtime: {} }), () => ({ dialogHistory: null }), () => ({ dialogHistory: 'junk', dialogCtime: [] })]) {
    const s: any = make(); const before = JSON.stringify(s);
    assert.equal(moveDialogHistory(s, 'a.md', 'b.md', 5), false); assert.equal(dropDialogHistory(s, 'a.md'), false); assert.equal(JSON.stringify(s), before, before);
  }
  assert.equal(moveDialogHistory({ dialogHistory: { 'a.md': say('x') } } as any, 'a.md', 'a.md'), false, 'a rename that changed nothing');
});
test('(c) the store keeps the note\'s time with each list and IGNORES a list whose time is not the file\'s; no time given, or none stored (older data.json), shows the list as before', () => {
  const settings: any = {}; const s = settingsStore(settings, () => {});
  s.setEntries('arrangements/arr_002.md', say('yesterday'), 1000);
  assert.deepEqual(texts(s.entries('arrangements/arr_002.md', 1000)), ['yesterday'], 'the same file');
  assert.deepEqual(s.entries('arrangements/arr_002.md', 2000), [], 'a note re-created at the path: its time is another');
  assert.deepEqual(texts(s.entries('arrangements/arr_002.md')), ['yesterday'], 'the caller knows no time (a memory store, an unreadable stat): the list is shown');
  const legacy: any = { dialogHistory: { 'p.md': say('old data.json') } }; const ls = settingsStore(legacy, () => {});
  assert.deepEqual(texts(ls.entries('p.md', 3000)), ['old data.json'], 'a list with no stored time is shown (nothing to compare)'); ls.setEntries('p.md', say('new'), 3000); assert.deepEqual(ls.entries('p.md', 4000), [], 'stamped at the next write: now it can tell');
  s.setEntries('arrangements/arr_002.md', say('today'), 2000); assert.deepEqual(texts(s.entries('arrangements/arr_002.md', 2000)), ['today'], 'the new note\'s first line replaces the stale list and takes its time');
  assert.deepEqual(JSON.parse(JSON.stringify(settings)).dialogCtime, { 'arrangements/arr_002.md': 2000 }, 'the time is plain data in data.json');
});
test('(c) the times of notes that fall out of the cap go with them; a write with no time leaves no key (P3: the settings keep their old shape)', () => {
  const settings: any = {}; const s = settingsStore(settings, () => {});
  for (let i = 0; i < DIALOG_NOTES_CAP + 5; i++) s.setEntries(`n${i}.md`, say(`t${i}`, 1_700_000_000_000 + i), 100 + i);
  assert.equal(Object.keys(settings.dialogHistory).length, DIALOG_NOTES_CAP); assert.deepEqual(Object.keys(settings.dialogCtime).sort(), Object.keys(settings.dialogHistory).sort(), 'no time outlives its list');
  const plain: any = {}; settingsStore(plain, () => {}).setEntries('a.md', say('x')); assert.deepEqual(Object.keys(plain), ['dialogHistory']);
});
test('(a) a stale time at the new path is not left behind when the moved list has none to bring (it would make the moved list "another note\'s")', () => {
  const s: any = { dialogHistory: { 'a.md': say('legacy'), 'b.md': say('leftover') }, dialogCtime: { 'b.md': 2 } };
  assert.equal(moveDialogHistory(s, 'a.md', 'b.md'), true); assert.deepEqual(texts(s.dialogHistory['b.md']), ['legacy']); assert.equal(s.dialogCtime['b.md'], undefined, 'no time for the moved list: not the leftover\'s');
});
test('(b) a time with no list (a hand-edited data.json) is dropped too, and nothing throws when there is no history object at all', () => {
  const s: any = { dialogCtime: { 'a.md': 1, 'z.md': 2 } }; assert.equal(dropDialogHistory(s, 'a.md'), true); assert.deepEqual(s.dialogCtime, { 'z.md': 2 }); assert.equal(s.dialogHistory, undefined, 'no history object is made');
});
test('the plugin-side functions: a rename and a delete save (debounced) ONLY when something changed; the file\'s own time is the one stored; noteCtimeOf reads a note\'s time, and a folder, a missing note, a broken stat give none', () => {
  let saves = 0; const plugin: any = { settings: { dialogHistory: { 'a.md': say('x'), 'z.md': say('y') } }, saveDialogSoon: () => { saves++; } };
  dialogRenamed(plugin, { path: 'b.md', stat: { ctime: 55 } }, 'a.md'); assert.equal(saves, 1); assert.deepEqual(Object.keys(plugin.settings.dialogHistory).sort(), ['b.md', 'z.md']); assert.deepEqual(plugin.settings.dialogCtime, { 'b.md': 55 });
  dialogRenamed(plugin, { path: 'b.md', stat: { ctime: 55 } }, 'a.md'); assert.equal(saves, 1, 'the same event again: nothing to move, nothing saved');
  dialogRenamed(plugin, { path: 'c.md' }, 'b.md'); assert.deepEqual(plugin.settings.dialogCtime, { 'c.md': 55 }, 'no stat on the file: the stored time moves');
  dialogDeleted(plugin, { path: 'c.md' }); assert.equal(saves, 3); assert.deepEqual(Object.keys(plugin.settings.dialogHistory), ['z.md']); dialogDeleted(plugin, { path: 'c.md' }); assert.equal(saves, 3);
  const app = (files: Record<string, unknown>): any => ({ vault: { getAbstractFileByPath: (p: string) => files[p] ?? null } });
  const a = app({ 'n.md': { stat: { ctime: 1234 } }, 'folder': { children: [] }, 'nan.md': { stat: { ctime: Number.NaN } }, 'str.md': { stat: { ctime: '12' } }, 'none.md': {} });
  assert.equal(noteCtimeOf(a, 'n.md'), 1234); for (const p of ['folder', 'missing.md', 'nan.md', 'str.md', 'none.md']) assert.equal(noteCtimeOf(a, p), undefined, p);
});
test('the store\'s helpers: dialogFresh is false only when both times are known and differ; dialogStamp makes nothing without a time; dialogPrune drops a time that has no list', () => {
  const s: any = { dialogHistory: { 'a.md': [] }, dialogCtime: { 'a.md': 5, 'gone.md': 9 } };
  assert.equal(dialogFresh(s, 'a.md', 5), true); assert.equal(dialogFresh(s, 'a.md', 6), false); assert.equal(dialogFresh(s, 'a.md'), true); assert.equal(dialogFresh(s, 'new.md', 6), true); assert.equal(dialogFresh({}, 'a.md', 6), true);
  const e: any = {}; dialogStamp(e, 'a.md'); assert.deepEqual(e, {}); dialogStamp(e, 'a.md', 7); assert.deepEqual(e, { dialogCtime: { 'a.md': 7 } }); dialogStamp(e, 'a.md', 8); assert.equal(e.dialogCtime['a.md'], 8);
  dialogPrune(s); assert.deepEqual(s.dialogCtime, { 'a.md': 5 }); const none: any = { dialogCtime: { 'x.md': 1 } }; dialogPrune(none); assert.deepEqual(none.dialogCtime, {}, 'no history at all: no time survives'); dialogPrune({}); 
});
