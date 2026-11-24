// 2026-11-23-1030 (pitch in bars, Stage 1a): the LIST of a melody bar, pure: the replay (the lines, in order, on the base bar: what the json fence says), the baseline (the head of a bar that has no list), the plan of an append (typed sentences
// canonicalized and placed; tempo and instrument replace their earlier line), the undo stack that never takes the head off, and the NOTE side (the front matter key `lines:` and the one json fence the Score reads, written from the replay in one go).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MELODY_BASE, formatMelodyJson, melodyNoteTemplate, readMelodyNote } from './melody-bar-core.ts';
import { baselineList, inspectMelodyNote, isMelodyHead, melodyUndoStack, planMelodyAppend, replayMelody, writeMelodyNote } from './melody-list-core.ts';
import { readBarLines } from './bar-list-note-core.ts';

const HEAD = 'Start with a melody bar of 16 steps in 4/4 at 100 beats per minute for the piano.';

test('an empty list is the base bar; each line applies to the bar before it; a head replaces everything', () => {
  assert.deepEqual(replayMelody([]).data, MELODY_BASE);
  const r = replayMelody(['Note G3 on step 1 for 1 step.', 'Set the instrument to cello.', 'Note D4 on step 2 for 2 steps.']);
  assert.equal(r.applied, 3); assert.equal(r.stop, null);
  assert.deepEqual(r.data.notes.map((n) => n.pitch), ['G3', 'D4']); assert.equal(r.data.instrument, 'cello');
  assert.equal(replayMelody(['Note G3 on step 1 for 1 step.', 'Start with a melody bar of 8 steps.']).data.notes.length, 0);
});

test('a line that cannot be read or applied STOPS the replay before it; the earlier lines still apply; every line is kept', () => {
  const list = ['Note G3 on step 1 for 1 step.', 'Dance on step 4.', 'Note D4 on step 2 for 1 step.'];
  const r = replayMelody(list);
  assert.equal(r.applied, 1); assert.deepEqual(r.list, list);
  assert.equal(r.stop?.index, 1); assert.equal(r.stop?.reason, 'unreadable'); assert.match(r.stop?.message ?? '', /melody bar/);
  const crossing = replayMelody(['Note G3 on step 15 for 3 steps.']);
  assert.equal(crossing.applied, 0); assert.match(crossing.stop?.message ?? '', /must end inside the bar/);
  assert.doesNotThrow(() => replayMelody(null as never)); assert.doesNotThrow(() => replayMelody([5 as never]));
});

test('the baseline of a bar with no list is its head, which replays to exactly the bar', () => {
  const data = { ...MELODY_BASE, instrument: 'cello', notes: [{ step: 1, pitch: 'G3', length: 2 }, { step: 9, pitch: 'Bb4', length: 1 }] };
  const list = baselineList(data);
  assert.equal(list?.length, 1);
  assert.deepEqual(replayMelody(list as string[]).data, data);
  assert.equal(baselineList({ ...MELODY_BASE, tempo_bpm: 0 }), null);
  assert.equal(isMelodyHead(HEAD), true); assert.equal(isMelodyHead('Note G3 on step 1 for 1 step.'), false);
});

test('typed sentences are canonicalized and appended; a sentence that says nothing new is not added; tempo and instrument replace their earlier line in place', () => {
  const p = planMelodyAppend([], ['note b-4 on step 1. Note g3 on steps 5 and 3']);
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.deepEqual(p.list, ['Note Bb4 on step 1 for 1 step.', 'Note G3 on steps 3 and 5 for 1 step.']);
  assert.deepEqual(p.added, p.list); assert.equal(p.unchanged, false);
  const q = planMelodyAppend(p.list, ['Note Bb4 on step 1.']);                                     // the bar already says it
  assert.equal(q.ok && q.unchanged, true);
  const t1 = planMelodyAppend(['Set the tempo to 80.', 'Note G3 on step 1 for 1 step.'], ['Set the tempo to 90.']);
  assert.equal(t1.ok && t1.list.join(' | '), 'Set the tempo to 90. | Note G3 on step 1 for 1 step.');
  assert.equal(t1.ok && t1.replaced.length, 1);
  const i1 = planMelodyAppend(['Set the instrument to cello.'], ['Set the instrument to violin.']);
  assert.equal(i1.ok && i1.list.join(' | '), 'Set the instrument to violin.');
  const none = planMelodyAppend([], ['']);
  assert.equal(none.ok === false && none.reason, 'empty');
});

test('a refusal says why and where: unreadable (the grammar), refused (this bar cannot take it), blocked (the list has a line nobody can read)', () => {
  const u = planMelodyAppend([], ['Note G3 on step 1 for 1 step. Dance.']);
  assert.equal(u.ok === false && u.reason, 'unreadable'); assert.equal(u.ok === false && u.line, 2);
  const r = planMelodyAppend(['Note G3 on step 1 for 4 steps.'], ['Note C4 on step 3 for 1 step.']);
  assert.equal(r.ok === false && r.reason, 'refused'); assert.match(r.ok === false ? r.message : '', /one voice/);
  const b = planMelodyAppend(['Dance on step 1.'], ['Note G3 on step 1 for 1 step.']);
  assert.equal(b.ok === false && b.reason, 'blocked');
});

test('the undo stack never takes the head off', () => {
  const stack = melodyUndoStack();
  assert.equal(stack.canUndo([HEAD]), false);
  assert.equal(stack.canUndo([HEAD, 'Note G3 on step 1 for 1 step.']), true);
});

test('the note side: the list is `lines:` (every line kept), the fence is the replay, the base is untouched by the opening', () => {
  const note = melodyNoteTemplate('bar_017');
  const w = writeMelodyNote(note, ['Note G3 on step 1 for 1 step.', 'Set the instrument to cello.']);
  assert.equal(w.ok, true);
  if (!w.ok) return;
  assert.deepEqual(readBarLines(w.text)?.lines, ['Note G3 on step 1 for 1 step.', 'Set the instrument to cello.']);
  const read = readMelodyNote(w.text);
  assert.equal(read.ok && formatMelodyJson(read.value.data), formatMelodyJson(w.data));
  assert.equal(w.text.startsWith('---\ntype: data\ncontent_type: json\nmelody: true\n'), true);
  assert.equal(w.data.instrument, 'cello');
  // an unchanged list writes the same bytes; the note outside the front matter and the fence is the note's own
  const again = writeMelodyNote(w.text, ['Note G3 on step 1 for 1 step.', 'Set the instrument to cello.']);
  assert.equal(again.ok && again.text, w.text);
});

test('a note that is not an editable melody bar is refused in words; a list of which no line can be read writes nothing', () => {
  const w = writeMelodyNote('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"a":1}\n```\n', ['Note G3 on step 1 for 1 step.']);
  assert.equal(w.ok, false);
  const none = writeMelodyNote(melodyNoteTemplate('bar_017'), ['Dance.']);
  assert.equal(none.ok, false); if (!none.ok) assert.match(none.message, /No line of the list can be read/);
  assert.equal(writeMelodyNote(melodyNoteTemplate('bar_017'), []).ok, true);
});

test('inspecting a note: the list, its replay, the fence, and whether they agree (an unlisted bar IS its fence; a hand-edited fence or list is not in sync)', () => {
  const w = writeMelodyNote(melodyNoteTemplate('bar_017'), ['Note G3 on step 1 for 1 step.']);
  if (!w.ok) throw new Error('write');
  const i = inspectMelodyNote(w.text);
  assert.equal(i.hasLines, true); assert.equal(i.inSync, true); assert.equal(i.replay.applied, 1); assert.equal(i.fence?.notes.length, 1);
  const handFence = w.text.replace('"pitch": "G3"', '"pitch": "A3"');
  assert.equal(inspectMelodyNote(handFence).inSync, false);
  const handList = w.text.replace('  - "Note G3 on step 1', '  - "Note G3 on step 2');
  assert.equal(inspectMelodyNote(handList).inSync, false);
  const unlisted = w.text.replace(/lines:\n  - .*\n/, '');
  const u = inspectMelodyNote(unlisted);
  assert.equal(u.hasLines, false); assert.equal(u.inSync, true); assert.equal(u.list.length, 1); assert.match(u.list[0], /^Start with a melody bar of 16 steps/);
  assert.equal(inspectMelodyNote('not a note').fence, null);
});

// 2026-11-23-1030 (mutation drain): "nothing here throws" holds for what a caller should never pass, and the refusal is in words, never a success with a message.
test('planning never throws: a typed value that is not a list of texts is refused in words (reason refused), not answered as a plan', () => {
  for (const typed of [null, undefined, 5, {}] as unknown[]) {
    const p = planMelodyAppend([], typed as never);
    assert.equal(p.ok, false, String(typed));
    if (!p.ok) { assert.equal(p.reason, 'refused'); assert.match(p.message, /^That could not be planned: ./); assert.equal(p.line, 1); assert.equal(p.column, 1); }
  }
  assert.equal(planMelodyAppend(['Note G3 on step 1 for 1 step.'], ['Note D4 on step 2 for 1 step.']).ok, true);
});
