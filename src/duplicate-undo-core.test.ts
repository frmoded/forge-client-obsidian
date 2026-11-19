// 2026-11-19-0992a - TAKING A COPY BACK: the pure part (no obsidian, no DOM). A copy made by `Duplicate [[bar_007]].` is an entry of the note's undo stack (sentence-list-core.ts createUndoStack: an entry that changes no line and carries the
// copy it made); Cmd/Ctrl+Z in the EMPTY composer takes the copy back ONLY when the file's bytes are still exactly what the duplicate wrote (a fingerprint compare), by moving it to the trash (a port: never a hard delete here), and says
// so in plain words; a copy that was edited since is LEFT in place, said, and the entry is spent so the NEXT Cmd/Ctrl+Z reaches the phrase's own previous sentence. Redo of a removed copy is not offered. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { copyMarkOf, undoCopy, type UndoCopyPorts } from './duplicate-undo-core.ts';
import { createUndoStack } from './sentence-list-core.ts';

const TEXT = '---\ntype: data\n---\n\n# bar_010\n```json\n{"steps":16}\n```\n';
const MARK = copyMarkOf({ path: 'bars/bar_010.md', name: 'bar_010' }, TEXT);
function ports(files: Map<string, string>, o: { trashThrows?: boolean; trashNoop?: boolean; readThrows?: boolean } = {}) {
  const trashed: string[] = [];
  const p: UndoCopyPorts = {
    read: async (path) => { if (o.readThrows) throw new Error('boom'); const t = files.get(path); if (t === undefined) throw new Error('File not found'); return t; },
    exists: (path) => files.has(path),
    trash: async (path) => { if (o.trashThrows) throw new Error('the system trash is not available'); trashed.push(path); if (!o.trashNoop) files.delete(path); },
  };
  return { p, trashed };
}

test('the mark names the copy and fingerprints the bytes the duplicate wrote (a different byte is a different fingerprint)', () => {
  assert.equal(MARK.path, 'bars/bar_010.md'); assert.equal(MARK.name, 'bar_010'); assert.notEqual(MARK.hash, '');
  assert.equal(copyMarkOf({ path: 'bars/bar_010.md', name: 'bar_010' }, TEXT).hash, MARK.hash);
  assert.notEqual(copyMarkOf({ path: 'bars/bar_010.md', name: 'bar_010' }, `${TEXT} `).hash, MARK.hash);
});

test('unchanged since the duplicate: moved to the trash through the port, said in the muted words; the file is gone', async () => {
  const files = new Map([['bars/bar_010.md', TEXT]]); const r = ports(files);
  const out = await undoCopy(r.p, MARK);
  assert.deepEqual(out, { state: 'removed', message: 'Removed bar_010 (moved to the trash).' });
  assert.deepEqual(r.trashed, ['bars/bar_010.md']); assert.equal(files.has('bars/bar_010.md'), false);
});

test('edited since (one byte): NOTHING is removed, the words say so and how to delete it', async () => {
  const files = new Map([['bars/bar_010.md', `${TEXT}\n`]]); const r = ports(files);
  const out = await undoCopy(r.p, MARK);
  assert.deepEqual(out, { state: 'edited', message: 'bar_010 was edited since, so it was left in place. Delete it in the file list if you want it gone.' });
  assert.deepEqual(r.trashed, []); assert.equal(files.has('bars/bar_010.md'), true);
});

test('already gone (deleted by hand): said in words, nothing to trash', async () => {
  const r = ports(new Map());
  const out = await undoCopy(r.p, MARK);
  assert.equal(out.state, 'gone'); assert.match(out.message, /bar_010 is already gone/); assert.deepEqual(r.trashed, []);
});

test('the trash fails (throws) or silently leaves the file: the file is left in place and the words say it was NOT moved (never "Removed")', async () => {
  const files = new Map([['bars/bar_010.md', TEXT]]);
  const threw = await undoCopy(ports(files, { trashThrows: true }).p, MARK);
  assert.equal(threw.state, 'failed'); assert.match(threw.message, /bar_010/); assert.match(threw.message, /left in place/); assert.ok(!/^Removed/.test(threw.message)); assert.match(threw.message, /system trash is not available/);
  const noop = await undoCopy(ports(files, { trashNoop: true }).p, MARK);
  assert.equal(noop.state, 'failed'); assert.match(noop.message, /left in place/); assert.ok(!/^Removed/.test(noop.message)); assert.equal(files.has('bars/bar_010.md'), true);
});

test('unreadable (the read throws): left in place, said', async () => {
  const files = new Map([['bars/bar_010.md', TEXT]]); const r = ports(files, { readThrows: true });
  const out = await undoCopy(r.p, MARK);
  assert.equal(out.state, 'failed'); assert.match(out.message, /left in place/); assert.deepEqual(r.trashed, []);
});

// ---- the undo stack: a copy is an entry that changes no line --------------------------------------------------------------------------------------------------------------------------------
const entry = (before: string[], after: string[]) => ({ before, after, added: after.slice(before.length), replaced: [] });
test('stack: a copy entry is undone even with NO sentence in the list (a new phrase), returns the copy and the list as it is; redo is not offered', () => {
  const s = createUndoStack(); s.push({ ...entry([], []), copy: MARK });
  assert.equal(s.canUndo([]), true);
  const r = s.undo([]);
  assert.deepEqual(r, { list: [], removed: [], restored: [], copy: MARK });
  assert.equal(s.canRedo([]), false); assert.equal(s.redo([]), null); assert.equal(s.canUndo([]), false); assert.equal(s.undo([]), null);
});

test('stack: in order of time: sentence, then copy, then sentence: Cmd+Z takes the LAST thing first (the sentence), then the copy, then the first sentence; only the sentences can be redone', () => {
  const s = createUndoStack(); const a = ['Take [[phrase_003]].'], b = [...a, 'Keep bars 1 to 2.'];
  s.push(entry([], a)); s.push({ ...entry(a, a), copy: MARK }); s.push(entry(a, b));
  const first = s.undo(b); assert.equal(first?.copy, undefined); assert.deepEqual(first?.list, a); assert.deepEqual(first?.removed, ['Keep bars 1 to 2.']);
  const second = s.undo(a); assert.deepEqual(second?.copy, MARK); assert.deepEqual(second?.list, a);
  assert.equal(s.canRedo(a), true, 'the redo of the sentence the first undo took back is still there'); assert.equal(s.redo(a)?.added[0], 'Keep bars 1 to 2.');
  const third = s.undo(b); assert.deepEqual(third?.list, a);
});

test('stack: after the copy was spent the NEXT undo reaches the phrase\'s own previous sentence', () => {
  const s = createUndoStack(); const a = ['Take [[phrase_003]].'], b = [...a, 'Keep bars 1 to 2.'];
  s.push(entry(a, b)); s.push({ ...entry(b, b), copy: MARK });
  assert.deepEqual(s.undo(b)?.copy, MARK);
  const next = s.undo(b); assert.equal(next?.copy, undefined); assert.deepEqual(next?.list, a); assert.deepEqual(next?.removed, ['Keep bars 1 to 2.']);
});

test('stack: a list that is no longer what the copy entry saw (a hand edit) ignores the entry: the old "last line" fallback, as before (no copy is taken back by surprise)', () => {
  const s = createUndoStack(); s.push({ ...entry(['x.'], ['x.']), copy: MARK });
  const r = s.undo(['x.', 'y.']);
  assert.equal(r?.copy, undefined); assert.deepEqual(r?.list, ['x.']);
});

test('stack: no copy entry, no change: an empty list has nothing to undo (stages 1 to 3 as before)', () => {
  const s = createUndoStack(); assert.equal(s.canUndo([]), false); assert.equal(s.undo([]), null);
  s.push(entry([], ['a.'])); assert.equal(s.canUndo(['a.']), true); assert.deepEqual(s.undo(['a.'])?.list, []);
});

// 2026-11-19-0992a mutation survivors (duplicate-undo-core.ts:25, :27, :28): the exact words of each refusal and the named console.error evidence line.
test('mutation survivors: each failure says its exact reason in the notice and logs one named console.error line (read, trash, trash left it)', async () => {
  const logged: unknown[][] = [];
  const orig = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const rd = await undoCopy(ports(new Map([['bars/bar_010.md', TEXT]]), { readThrows: true }).p, MARK);
    assert.deepEqual(rd, { state: 'failed', message: 'bar_010 was not moved to the trash (it could not be read: boom), so it was left in place. Delete it in the file list if you want it gone.' });
    const tr = await undoCopy(ports(new Map([['bars/bar_010.md', TEXT]]), { trashThrows: true }).p, MARK);
    assert.deepEqual(tr, { state: 'failed', message: 'bar_010 was not moved to the trash (the system trash is not available), so it was left in place. Delete it in the file list if you want it gone.' });
    const nl = await undoCopy(ports(new Map([['bars/bar_010.md', TEXT]]), { trashNoop: true }).p, MARK);
    assert.deepEqual(nl, { state: 'failed', message: 'bar_010 was not moved to the trash (the trash left it there), so it was left in place. Delete it in the file list if you want it gone.' });
  } finally { console.error = orig; }
  assert.deepEqual(logged.map((a) => a[0]), ['[forge-duplicate] undo: could not read the copy', '[forge-duplicate] undo: the trash failed']);
  assert.ok(logged.every((a) => a[1] instanceof Error), 'the error itself is the second argument');
});
