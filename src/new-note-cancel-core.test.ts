// 2026-11-19-0975 (finding 3) - Cancel on the "Note title" dialog takes back the note the action made, and ONLY when nothing touched it. The pure rule (a truth table), the decision over a vault (create + cancel = the vault as before; create + edit + cancel = the
// note stays; the original is never in it), and the WATCH of Obsidian's prompt (a Modal subclass whose `open`, `submit` and `onClose` are what Obsidian's are: Save closes from inside `submit`, Cancel / Esc / a click outside close from anywhere else).
// The REAL plugin (the bar selection's own makePhrase, the real removeNote, the real tabs) is in new-note-cancel-wiring.test.ts. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cancelVerdict, onTitleClosed, type TitleClosedPorts, type TitleOutcome, type WrittenNote } from './new-note-cancel-core.ts';
import { offerRenameWatched } from './rename-offer.ts';

const WROTE: WrittenNote = { path: 'phrases/phrase_016.md', content: 'the note as the action wrote it\n', mtime: 1000 };
const same = { path: 'phrases/phrase_016.md', text: WROTE.content, mtime: 1000 };

// ---- the rule ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('cancelVerdict: ONLY a Cancel of an untouched note removes it; every other row of the table keeps the note', () => {
  const table: Array<[string, TitleOutcome, Parameters<typeof cancelVerdict>[2], string]> = [
    ['cancelled, untouched', 'cancelled', same, 'remove'],
    ['cancelled, untouched, the host gives no mtime', 'cancelled', { ...same, mtime: null }, 'remove'],
    ['cancelled, the action had no mtime to compare', 'cancelled', { ...same, mtime: 5 }, 'remove*'],
    ['cancelled, the text was edited', 'cancelled', { ...same, text: WROTE.content + 'a line the person typed' }, 'keep:edited'],
    ['cancelled, one character different', 'cancelled', { ...same, text: WROTE.content.replace('note', 'Note') }, 'keep:edited'],
    ['cancelled, the text is the same but the file was written again (the mtime moved)', 'cancelled', { ...same, mtime: 2000 }, 'keep:touched'],
    ['cancelled, the note is at another path now', 'cancelled', { ...same, path: 'phrases/bridge.md' }, 'keep:moved'],
    ['cancelled, the note is not in the vault', 'cancelled', null, 'keep:gone'],
    ['cancelled, the note could not be read', 'cancelled', { ...same, text: null }, 'keep:unreadable'],
    ['saved (the same title or a new one)', 'saved', same, 'keep:saved'],
    ['saved, edited', 'saved', { ...same, text: 'x' }, 'keep:saved'],
    ['the dialog could not be watched', 'unknown', same, 'keep:unwatched'],
  ];
  for (const [name, outcome, now, want] of table) {
    const w: WrittenNote = want === 'remove*' ? { ...WROTE, mtime: null } : WROTE;
    const v = cancelVerdict(outcome, w, now);
    const got = v.verdict === 'remove' ? (want === 'remove*' ? 'remove*' : 'remove') : `keep:${v.why}`;
    assert.equal(got, want, name);
  }
});

// ---- over a vault -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function vault(initial: Record<string, string> = {}) {
  const files = new Map<string, { text: string; mtime: number }>(Object.entries(initial).map(([p, t]) => [p, { text: t, mtime: 1 }]));
  const objs = new Map<string, { path: string }>(); const lines: string[] = []; const removed: string[] = []; let failRemove = false;
  const obj = (p: string) => objs.get(p) ?? (objs.set(p, { path: p }), objs.get(p)!);
  const ports: TitleClosedPorts<{ path: string }> = {
    current: (f) => (files.has(f.path) ? { path: f.path, mtime: files.get(f.path)!.mtime } : null),
    read: async (f) => files.get(f.path)!.text,
    remove: async (p) => { if (failRemove) throw new Error('is still there'); removed.push(p); files.delete(p); },
    trace: (l) => { lines.push(l); },
  };
  return {
    files, lines, removed, ports,
    make: (p: string, text: string) => { files.set(p, { text, mtime: 1000 }); return obj(p); },     // the action's own create
    edit: (p: string, text: string) => { files.set(p, { text, mtime: 2000 }); },
    snapshot: () => JSON.stringify([...files.entries()].sort()),
    failRemoval: () => { failRemove = true; },
  };
}
const ORIGINAL = 'the phrase the selection was made on, byte for byte\n';

test('create, cancel: the vault is exactly as it was before the action, and the original is byte-identical (it is never written, never read by the cancel)', async () => {
  const v = vault({ 'phrases/phrase_015.md': ORIGINAL });
  const before = v.snapshot();
  const f = v.make('phrases/phrase_016.md', WROTE.content);
  assert.notEqual(v.snapshot(), before, 'non-vacuity: the action did add a note');
  assert.equal(await onTitleClosed(v.ports, f, WROTE, 'cancelled'), 'removed');
  assert.equal(v.snapshot(), before, 'the vault is as before');
  assert.equal(v.files.get('phrases/phrase_015.md')!.text, ORIGINAL); assert.equal(v.files.get('phrases/phrase_015.md')!.mtime, 1, 'the original: same text, same mtime');
  assert.deepEqual(v.removed, ['phrases/phrase_016.md']);
  assert.deepEqual(v.lines, ['[forge-barsel] title dialog cancelled: removed phrases/phrase_016.md (untouched since it was made)']);
});

test('create, edit, cancel: the note STAYS (never delete a note the person edited), and the line says why', async () => {
  const v = vault({ 'phrases/phrase_015.md': ORIGINAL });
  const f = v.make('phrases/phrase_016.md', WROTE.content);
  v.edit('phrases/phrase_016.md', WROTE.content + 'Keep bars 1 to 2.\n');
  const before = v.snapshot();
  assert.equal(await onTitleClosed(v.ports, f, WROTE, 'cancelled'), 'kept');
  assert.equal(v.snapshot(), before); assert.deepEqual(v.removed, []);
  assert.match(v.lines[0], /phrase_016\.md is kept \(its text is not what the action wrote \(it was edited\)\)/);
});

test('create, written again with the same text (a newer mtime), cancel: the note stays; saved: nothing is touched and nothing is said; unwatched: the note stays', async () => {
  const v = vault();
  const f = v.make('phrases/phrase_016.md', WROTE.content); v.edit('phrases/phrase_016.md', WROTE.content);
  assert.equal(await onTitleClosed(v.ports, f, WROTE, 'cancelled'), 'kept'); assert.match(v.lines[0], /written again since the action made it/);
  const w = vault(); const g = w.make('phrases/phrase_016.md', WROTE.content);
  assert.equal(await onTitleClosed(w.ports, g, WROTE, 'saved'), 'kept'); assert.deepEqual(w.lines, [], 'a Save is not a Cancel: no line'); assert.deepEqual(w.removed, []);
  assert.equal(await onTitleClosed(w.ports, g, WROTE, 'unknown'), 'kept'); assert.deepEqual(w.removed, []); assert.ok(w.files.has('phrases/phrase_016.md'));
});

test('the note is gone, or is somewhere else: nothing is removed; the removal that fails keeps the note and is a console.error plus a line (never a throw)', async () => {
  const v = vault(); const f = v.make('phrases/phrase_016.md', WROTE.content); v.files.delete('phrases/phrase_016.md');
  assert.equal(await onTitleClosed(v.ports, f, WROTE, 'cancelled'), 'kept'); assert.match(v.lines[0], /not in the vault any more/);
  const moved = vault(); const m = moved.make('phrases/bridge.md', WROTE.content);
  assert.equal(await onTitleClosed(moved.ports, m, WROTE, 'cancelled'), 'kept'); assert.match(moved.lines[0], /not at the path the action made it at/);
  const bad = vault(); const b = bad.make('phrases/phrase_016.md', WROTE.content); bad.failRemoval();
  const savedErr = console.error; const errs: unknown[][] = []; console.error = (...a: unknown[]) => { errs.push(a); };
  try { assert.equal(await onTitleClosed(bad.ports, b, WROTE, 'cancelled'), 'failed'); } finally { console.error = savedErr; }
  assert.ok(bad.files.has('phrases/phrase_016.md'), 'the note is still there'); assert.equal(errs.length, 1); assert.match(String(errs[0][0]), /onTitleClosed/); assert.match(bad.lines[0], /could not be removed \(is still there\); it is kept/);
});

// ---- the watch of Obsidian's prompt -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
class Modal { opened = false; closed = 0; open(): void { this.opened = true; } close(): void { this.closed++; this.onClose(); } onClose(): void { /* the host's hook */ } }
/** What Obsidian's rename prompt is (read from its app.js): a Modal opened inside promptForFileRename, `submit(title)` validates, then closes FIRST (this.close()) and renames after an await; Cancel / Esc close from outside. */
class RenamePrompt extends Modal {
  names: string[] = []; invalid = false;
  async submit(title: string): Promise<boolean | void> { if (this.invalid) return true; this.close(); await Promise.resolve(); this.names.push(title); }
}
function rig(opts: { throws?: boolean; noModal?: boolean; noSubmit?: boolean } = {}) {
  const made: RenamePrompt[] = []; const realOpen = Modal.prototype.open;
  const app = { fileManager: { promptForFileRename: (_f: unknown) => { if (opts.throws) throw new Error('no prompt'); if (opts.noModal) return; const p = opts.noSubmit ? (new Modal() as RenamePrompt) : new RenamePrompt(); made.push(p); p.open(); } } };
  const quiet = console.error; console.error = () => {};
  return { app, made, realOpen, done: () => { console.error = quiet; } };
}

test('the watch: Cancel (a close from outside submit) is `cancelled`; Save (a close from inside submit) is `saved`, with the name; Esc and a click outside are Cancels', async () => {
  const a = rig(); const w = offerRenameWatched(a.app, { path: 'x' }, Modal);
  assert.equal(w.offered, true); assert.equal(a.made.length, 1); assert.equal(a.made[0].opened, true, 'the prompt was opened exactly as Obsidian opens it');
  a.made[0].close(); assert.equal(await w.closed, 'cancelled');
  const b = rig(); const s = offerRenameWatched(b.app, { path: 'x' }, Modal);
  await b.made[0].submit('bridge'); assert.equal(await s.closed, 'saved'); assert.deepEqual(b.made[0].names, ['bridge'], 'the prompt did its own work');
  a.done(); b.done();
});

test('the watch: a Save with a name Obsidian refuses does NOT close the prompt; the Cancel after it is a Cancel (the refused Save is not remembered)', async () => {
  const a = rig(); const w = offerRenameWatched(a.app, { path: 'x' }, Modal);
  a.made[0].invalid = true; assert.equal(await a.made[0].submit('bad/name'), true);
  let settled = false; void w.closed.then(() => { settled = true; }); await Promise.resolve(); assert.equal(settled, false, 'still open');
  a.made[0].close(); assert.equal(await w.closed, 'cancelled'); a.done();
});

test('the watch leaves Modal exactly as it found it (the same `open`, even when the prompt throws), watches only the prompt it opened, and says `unknown` for anything it cannot watch', async () => {
  const before = Modal.prototype.open;
  const a = rig(); offerRenameWatched(a.app, {}, Modal); assert.equal(Modal.prototype.open, before, 'restored'); a.done();
  const t = rig({ throws: true }); const out = offerRenameWatched(t.app, {}, Modal); assert.equal(out.offered, false); assert.equal(await out.closed, 'unknown'); assert.equal(Modal.prototype.open, before, 'restored after a throw'); t.done();
  const none = rig({ noModal: true }); const n = offerRenameWatched(none.app, {}, Modal); assert.equal(n.offered, true); assert.equal(await n.closed, 'unknown', 'nothing opened'); none.done();
  const plain = rig({ noSubmit: true }); const p = offerRenameWatched(plain.app, {}, Modal); assert.equal(await p.closed, 'unknown', 'a Modal that is not a prompt with submit is not watched'); plain.done();
  assert.equal((offerRenameWatched({}, {}, Modal)).offered, false, 'an Obsidian without the prompt'); assert.equal(await offerRenameWatched({}, {}, Modal).closed, 'unknown');
  const noClass = rig(); const nc = offerRenameWatched(noClass.app, {}, undefined); assert.equal(nc.offered, true); assert.equal(await nc.closed, 'unknown', 'no Modal class given'); noClass.done();
  assert.equal(Modal.prototype.open, before);
});
