// 2026-11-23-1030 (pitch in bars, Stage 1a) - the REAL description controller + composer + dialog on an in-memory vault, with a MELODY bar (`bars/bar_NNN.md`, notes, no channels): its list is the front matter key `lines:`, its fence is the replay, and the composer takes the
// MELODY grammar. Pinned here, every action COUNTED (ONE `process` call and ONE write per Enter):
//   * OPENING WRITES NOTHING; a new melody bar starts with an empty list and the base bar;
//   * a typed sentence is previewed (Enter), then applied (Enter): the list gets its canonical line, the fence is the replay, undo (Cmd/Ctrl+Z in the empty composer) takes it back, Shift redoes it;
//   * a note the bar cannot take (across the barline, two at once) is refused in words and writes nothing; a rhythm sentence in a melody bar and a melody sentence in a rhythm bar are refused in plain words naming the kind;
//   * a hand edit of `lines:` is followed (every line kept, the replay stops before the first unreadable one);
//   * P3: a rhythm bar next to it is byte for byte what it was, before and after, and still takes its own sentences.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { melodyNoteTemplate, readMelodyNote, type MelodyData } from './melody-bar-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { planNewBar } from './score-first-core.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const MELODY = 'bars/bar_021.md', RHYTHM = 'bars/bar_001.md';
const dataOf = (t: string): MelodyData => { const r = readMelodyNote(t); assert.equal(r.ok, true, JSON.stringify(r)); return (r as { value: { data: MelodyData } }).value.data; };

function rig(note = melodyNoteTemplate('bar_021'), path = MELODY, extra: Record<string, string> = { [RHYTHM]: PLAYGROUND_BARS['bar_001'] }) {
  const store = new Map<string, string>([[path, note], ...Object.entries(extra)]);
  const writes: string[] = []; let processCalls = 0; const timers: Array<() => void> = []; const warns: string[] = []; const auto = { on: false };
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    composerMenu: () => ({ items: [], run: () => {} }),
    warn: (line) => { warns.push(line); }, composerAutoApply: () => auto.on,          // 2026-11-23-1030 (mutation drain): the console's warn lines, and the setting `Preview before applying` (off = a sentence the grammar reads is applied at once)
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const undoKey = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  const runTimers = async () => { const t = timers.splice(0); for (const fn of t) fn(); await flush(); };
  const text = () => store.get(path)!;
  const lines = () => readBarLines(text())?.lines ?? [];
  const said = () => dialogEntries(el).filter((e) => e.kind !== 'you').map((e) => e.text);
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const hand = async (next: string) => { store.set(path, next); ctl.modified(path); await runTimers(); };
  return { ctl, ports, warns, auto, store, writes, el, flush, field, type, enter, undoKey, runTimers, text, lines, said, say, hand, path, calls: () => processCalls, ready: async () => { await ctl.inspect(path); await flush(); } };
}
const notes = (t: string): string => dataOf(t).notes.map((n) => `${n.pitch}@${n.step}x${n.length}`).join(' ');

test('OPENING WRITES NOTHING: looking at a new melody bar and a listed one (the controller, the composer) makes no `process` call and no write; the composer is there', async () => {
  const listed = await (async () => { const r = rig(); await r.ready(); await r.say('Note G3 on step 1 for 1 step.'); return r.text(); })();
  for (const note of [melodyNoteTemplate('bar_021'), listed]) {
    const r = rig(note); const before = r.text();
    await r.ready(); await r.ctl.inspectOpen(); r.ctl.syncBars(); await r.flush();
    assert.ok(r.field(), 'the composer mounted on the melody bar\'s tab');
    assert.equal(r.calls(), 0); assert.deepEqual(r.writes, []); assert.equal(r.text(), before);
    r.ctl.modified(r.path); await r.runTimers();
    assert.equal(r.calls(), 0, 'a heard `modify` of an untouched melody bar writes nothing either');
  }
});

test('a sentence is previewed with the first Enter (nothing written) and applied with the second: ONE process call, ONE write, the canonical line in `lines:`, the fence is the replay', async () => {
  const r = rig(); await r.ready();
  r.type('note bb4 on step 3'); await r.enter();
  assert.equal(r.calls(), 0, 'the preview writes nothing');
  assert.ok(r.said().some((t) => /This is what would be written/.test(t)), r.said().join(' | '));
  assert.deepEqual(r.lines(), [], 'the preview wrote nothing');
  await r.enter();
  assert.ok(r.said().some((t) => /Note Bb4 on step 3 for 1 step\./.test(t)), r.said().join(' | '));
  assert.equal(r.calls(), 1); assert.equal(r.writes.length, 1);
  assert.deepEqual(r.lines(), ['Note Bb4 on step 3 for 1 step.']);
  assert.equal(notes(r.text()), 'Bb4@3x1');
  assert.equal(r.field().value, '', 'the composer is empty again');
});

test('the Prelude\'s first bar by sentences: the notes come out in step order, one line each, the instrument and the tempo replace their earlier line', async () => {
  const r = rig(); await r.ready();
  for (const s of ['Start with a melody bar of 16 steps.', 'Set the instrument to cello.', 'Note G3 on steps 1 and 9 for 1 step.', 'Note D4 on steps 2, 6, 8, 10, 14 and 16 for 1 step.', 'Note B4 on steps 3, 5, 7, 11, 13 and 15 for 1 step.', 'Note A4 on steps 4 and 12 for 1 step.']) await r.say(s);
  assert.equal(r.lines().length, 5, 'the head said nothing the new bar did not already say, so it is not a line');
  const d = dataOf(r.text());
  assert.deepEqual(d.notes.map((n) => n.pitch).join(' '), 'G3 D4 B4 A4 B4 D4 B4 D4 G3 D4 B4 A4 B4 D4 B4 D4');
  assert.equal(d.instrument, 'cello');
  await r.say('Set the instrument to violin.');
  assert.equal(r.lines().length, 5, 'the instrument line took the place of the earlier one');
  assert.equal(dataOf(r.text()).instrument, 'violin');
});

test('Cmd/Ctrl+Z in the empty composer takes the last line back, Shift redoes it; the fence follows each step; nothing is left to take back past the first line', async () => {
  const r = rig(); await r.ready();
  await r.say('Note G3 on step 1 for 1 step.'); await r.say('Note D4 on step 2 for 2 steps.');
  assert.equal(notes(r.text()), 'G3@1x1 D4@2x2');
  await r.undoKey(); assert.equal(notes(r.text()), 'G3@1x1'); assert.deepEqual(r.lines(), ['Note G3 on step 1 for 1 step.']);
  await r.undoKey(); assert.equal(notes(r.text()), ''); assert.deepEqual(r.lines(), []);
  await r.undoKey(true); assert.equal(notes(r.text()), 'G3@1x1');
  await r.undoKey(true); assert.equal(notes(r.text()), 'G3@1x1 D4@2x2');
  assert.equal(r.calls(), 6, 'two sentences and four steps: one process call each');
});

test('a note the bar cannot take is refused in words, nothing is written, the sentence stays where it can be corrected', async () => {
  const r = rig(); await r.ready();
  await r.say('Note G3 on step 1 for 4 steps.');
  const calls = r.calls(), text = r.text();
  for (const [s, re] of [['Note C4 on step 15 for 3 steps.', /must end inside the bar/], ['Note C4 on step 3 for 1 step.', /one voice/], ['Note C4 on step 1 for 1 step.', /one voice/], ['Note H4 on step 1.', /note name with an octave/]] as Array<[string, RegExp]>) {
    r.type(s); await r.enter(); await r.enter();
    assert.equal(r.calls(), calls, `${s}: nothing was written`); assert.equal(r.text(), text);
    assert.ok(r.said().some((t) => re.test(t)), `${s}: ${r.said().slice(-2).join(' | ')}`);
  }
});

test('a rhythm sentence in a melody bar, and a melody sentence in a rhythm bar, are refused in plain words that name the kind; the rhythm bar is byte for byte what it was', async () => {
  const m = rig(); await m.ready();
  m.type('Hit kick on steps 1, 5 and 9.'); await m.enter(); await m.enter();
  assert.ok(m.said().some((t) => /melody bar/.test(t) && /rhythm bar/.test(t)), m.said().join(' | '));
  assert.equal(m.calls(), 0);
  const r = rig(PLAYGROUND_BARS['bar_001'], RHYTHM, { [MELODY]: melodyNoteTemplate('bar_021') }); await r.ready();
  const before = r.text();
  r.type('Note G3 on step 1 for 1 step.'); await r.enter(); await r.enter();
  assert.ok(r.said().some((t) => /rhythm bar/.test(t) && /melody bar/.test(t)), r.said().join(' | '));
  assert.equal(r.calls(), 0); assert.equal(r.text(), before);
  await r.say('Hit kick on step 3.');                                                      // its own sentences still work
  assert.deepEqual(r.lines().slice(-1), ['Hit kick on step 3.']);
});

test('a hand edit of `lines:` is followed: the fence is the replay of the lines before the first unreadable one (every line kept); a fence edited outside the list wins and the list starts again from it', async () => {
  const r = rig(); await r.ready();
  await r.say('Note G3 on step 1 for 1 step.');
  const edited = r.text().replace('lines:\n  - "Note G3 on step 1 for 1 step."', 'lines:\n  - "Note G3 on step 1 for 1 step."\n  - "Note D4 on step 2 for 1 step."\n  - "Dance on step 3."\n  - "Note B4 on step 3 for 1 step."');
  await r.hand(edited);
  assert.equal(notes(r.text()), 'G3@1x1 D4@2x1');
  assert.equal(readBarLines(r.text())?.lines.length, 4, 'every line is kept');
  assert.ok(r.said().some((t) => /Line 3 is not a sentence I can read/.test(t)), r.said().join(' | '));
  const r2 = rig(); await r2.ready(); await r2.say('Note G3 on step 1 for 1 step.');
  await r2.hand(r2.text().replace('"pitch": "G3"', '"pitch": "A3"'));
  assert.equal(notes(r2.text()), 'A3@1x1');
  assert.match(readBarLines(r2.text())?.lines.join(' ') ?? '', /Start with a melody bar of 16 steps.*A3 on step 1 for 1 step/);
});

test('P3: the rhythm bar next to a melody bar is byte for byte what it was after every melody action', async () => {
  const r = rig(); await r.ready();
  const before = r.store.get(RHYTHM);
  await r.say('Note G3 on step 1 for 1 step.'); await r.undoKey(); await r.undoKey(true);
  assert.equal(r.store.get(RHYTHM), before);
  assert.ok(planNewBar({ existingBasenames: [], exists: () => false }).ok, 'New bar is the rhythm bar it always was');
});

// ---- 2026-11-23-1030 (mutation drain): what the first mutation pass found nobody had pinned. Every test below drives the same real controller + composer + dialog as above, on the same in-memory vault. ----
const G3 = 'Note G3 on step 1 for 1 step.';

test('a bar changed behind the list\'s back (no `modify` heard yet) is rebased at the next sentence: the list starts again from the bar as it is, the dialog says so, and Undo goes no further back', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  r.store.set(MELODY, r.text().replace('"pitch": "G3"', '"pitch": "A3"'));
  await r.say('Note D4 on step 2 for 1 step.');
  assert.equal(notes(r.text()), 'A3@1x1 D4@2x1', 'the person\'s data won; the old list line did not bring G3 back');
  assert.equal(r.lines().length, 2); assert.match(r.lines()[0], /^Start with a melody bar of 16 steps.*A3 on step 1 for 1 step/); assert.equal(r.lines()[1], 'Note D4 on step 2 for 1 step.');
  assert.ok(r.said().some((t) => /The bar was edited outside its list \(the JSON view, a sync, an older tab\)\. Its data stays as you see it; the list starts again from it, and Undo goes no further back\./.test(t)), r.said().join(' | '));
  await r.undoKey(); assert.equal(notes(r.text()), 'A3@1x1');
  assert.equal((await r.ctl.undoLast(MELODY)).ok, false, 'the head is not a step to take back');
});

test('a sentence the bar already says writes nothing, says so, and is not a step of Undo', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  const writes = r.writes.length;
  const again = await r.ctl.appendLine(MELODY, G3);
  assert.equal(again.ok, true); assert.equal(again.unchanged, true); assert.match(again.message, /Nothing changed: the bar already says this\./);
  const applied = await r.ctl.applyFromBox(MELODY, G3);                        // an apply with no preview (a preview would have refused it)
  assert.equal(applied.ok, true); assert.equal(r.writes.length, writes, 'no write');
  assert.ok(r.said().some((t) => /already says this/.test(t)), r.said().join(' | '));
  await r.undoKey(); assert.equal(notes(r.text()), '', 'one Undo takes back the one sentence that changed the bar');
});

test('the preview\'s proposal: the grammar\'s, with the line it takes the place of; the sentence named when a typed text is refused is the one that was wrong, not the first', async () => {
  const r = rig(); await r.ready();
  assert.deepEqual(await r.ctl.previewFromBox(MELODY, G3), { ok: true, proposal: { description: G3, via: 'grammar' } });
  await r.say('Set the tempo to 80.');
  assert.deepEqual(await r.ctl.previewFromBox(MELODY, 'Set the tempo to 90.'), { ok: true, proposal: { description: 'Set the tempo to 90.', via: 'grammar', replaces: 'Set the tempo to 80.' } });
  const rhythm = await r.ctl.previewFromBox(MELODY, 'Note G3 on step 1 for 1 step. Hit kick on step 1.');
  assert.equal(rhythm.ok, false); assert.match((rhythm as { message: string }).message, /^This is a melody bar; "Hit kick on step 1\." is a sentence of a rhythm bar/);
  const dance = await r.ctl.previewFromBox(MELODY, 'Note G3 on step 1 for 1 step. Dance on step 1.');
  assert.equal(dance.ok, false); assert.match((dance as { message: string }).message, /^The grammar did not accept this sentence \(line 2, column 1: i do not know how to read "Dance on step 1" as a sentence of a melody bar/);
  assert.equal(r.calls(), 1, 'only the tempo line was written; a preview writes nothing');
});

test('applying a sentence the bar cannot take answers ok false in words (the composer shows them), and writes nothing', async () => {
  const r = rig(); await r.ready();
  await r.say('Note G3 on step 1 for 4 steps.');
  const writes = r.writes.length;
  const bad = await r.ctl.applyFromBox(MELODY, 'Note H4 on step 1.');
  assert.equal(bad.ok, false); assert.match(bad.message ?? '', /^The grammar did not accept this sentence \(line 1, column .*note name with an octave/);
  const crowded = await r.ctl.applyFromBox(MELODY, 'Note C4 on step 3 for 1 step.');
  assert.equal(crowded.ok, false); assert.match(crowded.message ?? '', /one voice/);
  assert.equal(r.writes.length, writes); assert.equal(notes(r.text()), 'G3@1x4');
});

test('Undo and Redo say what they did (and what they put back), and "nothing to take back / put back" when there is nothing; canUndo and canRedo follow the stack', async () => {
  const r = rig(); await r.ready();
  const none = await r.ctl.undoLast(MELODY); assert.equal(none.ok, false); assert.equal(none.message, 'There is nothing to take back.');
  const noneBack = await r.ctl.redoLast(MELODY); assert.equal(noneBack.ok, false); assert.equal(noneBack.message, 'There is nothing to put back.');
  assert.deepEqual([r.ctl.canUndo(MELODY), r.ctl.canRedo(MELODY)], [false, false]);
  await r.say(G3);
  assert.deepEqual([r.ctl.canUndo(MELODY), r.ctl.canRedo(MELODY)], [true, false], 'a sentence can be taken back, not put back');
  const u = await r.ctl.undoLast(MELODY); assert.equal(u.ok, true); assert.equal(u.message, 'Removed: Note G3 on step 1 for 1 step.');
  assert.deepEqual([r.ctl.canUndo(MELODY), r.ctl.canRedo(MELODY)], [false, true], 'taken back: it can be put back, nothing is left to take back');
  const b = await r.ctl.redoLast(MELODY); assert.equal(b.ok, true); assert.equal(b.message, 'Added again: Note G3 on step 1 for 1 step.');
  assert.deepEqual([r.ctl.canUndo(MELODY), r.ctl.canRedo(MELODY)], [true, false]);
  await r.say('Set the tempo to 80.'); await r.say('Set the tempo to 90.');
  const t = await r.ctl.undoLast(MELODY); assert.equal(t.message, 'Removed: Set the tempo to 90. Put back: Set the tempo to 80.');
});

test('a vault that does not run the write (the note is gone) is told in words by Undo and by a sentence, never a throw', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  r.ports.process = async () => {};
  const u = await r.ctl.undoLast(MELODY); assert.equal(u.ok, false); assert.equal(u.message, 'The bar was not written.');
  const a = await r.ctl.appendLine(MELODY, 'Note D4 on step 2 for 1 step.'); assert.equal(a.ok, false); assert.equal(a.message, 'The bar was not written.');
});

test('the controller learns what a note is from a preview, and a later question with no text read yet does not make it forget: the apply still goes to the melody list', async () => {
  const r = rig();                                                  // not looked at: the controller has read no text of this note
  assert.equal((await r.ctl.previewFromBox(MELODY, G3)).ok, true);
  assert.equal(r.ctl.canUndo(MELODY), false);
  const a = await r.ctl.applyFromBox(MELODY, G3);
  assert.equal(a.ok, true, a.message); assert.equal(notes(r.text()), 'G3@1x1'); assert.deepEqual(r.lines(), [G3]);
});

test('a hand edit of `lines:` is said once ("Line 3 is not a sentence I can read", "The bar follows the list you edited (N lines)") and not again at every look', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  await r.hand(r.text().replace('lines:\n  - "Note G3 on step 1 for 1 step."', 'lines:\n  - "Note G3 on step 1 for 1 step."\n  - "Note D4 on step 2 for 1 step."\n  - "Dance on step 3."\n  - "Note B4 on step 3 for 1 step."'));
  const count = (re: RegExp) => r.said().filter((t) => re.test(t)).length;
  assert.equal(count(/Line 3 is not a sentence I can read/), 1); assert.equal(count(/The bar follows the list you edited \(2 lines\)\./), 1);
  await r.hand(r.text()); await r.hand(r.text());                     // looked at again, nothing new
  assert.equal(count(/Line 3 is not a sentence I can read/), 1, 'the same cut is not said again');
  await r.hand(r.text().replace('lines:\n  - "Note G3 on step 1 for 1 step."\n  - "Note D4 on step 2 for 1 step."\n  - "Dance on step 3."\n  - "Note B4 on step 3 for 1 step."', 'lines:\n  - "Note A3 on step 1 for 1 step."'));
  assert.equal(notes(r.text()), 'A3@1x1');
  assert.equal(count(/The bar follows the list you edited \(1 line\)\./), 1, 'one line is not "1 lines"');
});

test('a list emptied by hand empties the bar (the fence is the replay of no line: the base bar); a list of which no line reads is never written over the fence', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  await r.hand(r.text().replace(/lines:\n  - .*\n/, 'lines: []\n'));
  assert.equal(notes(r.text()), ''); assert.deepEqual(r.lines(), []);
  const r2 = rig(); await r2.ready();
  await r2.say(G3);
  const before = r2.text();
  const w = r2.writes.length;
  await r2.hand(before.replace('"Note G3 on step 1 for 1 step."', '"Dance on step 1."'));
  assert.equal(notes(r2.text()), 'G3@1x1', 'the fence keeps what it shows'); assert.equal(r2.writes.length, w, 'nothing was written');
});

test('a write that fails while following a hand edit is said at the console and the note is left as the person made it', async () => {
  const r = rig(); await r.ready();
  await r.say(G3);
  const edited = r.text().replace('"Note G3 on step 1 for 1 step."', '"Note A3 on step 1 for 1 step."');
  r.ports.process = async () => { throw new Error('disk gone'); };
  const err = console.error; console.error = () => {};
  try { r.store.set(MELODY, edited); r.ctl.modified(MELODY); await r.runTimers(); } finally { console.error = err; }
  assert.ok(r.warns.some((w) => /could not follow the edit of the melody bar: disk gone/.test(w)), r.warns.join(' | '));
  assert.equal(r.text(), edited);
});

test('a sentence applied at once (no preview) in a bar that was edited behind the list\'s back, where the rebased list already says it: the bar is rebased, the dialog says so, nothing else is added', async () => {
  const r = rig(); r.auto.on = true; await r.ready();
  r.type(G3); await r.enter();
  assert.equal(notes(r.text()), 'G3@1x1');
  r.store.set(MELODY, r.text().replace('{ "step": 1, "pitch": "G3", "length": 1 }', '{ "step": 1, "pitch": "G3", "length": 1 },\n    { "step": 2, "pitch": "D4", "length": 1 }'));
  r.type('Note D4 on step 2 for 1 step.'); await r.enter();
  assert.equal(notes(r.text()), 'G3@1x1 D4@2x1');
  assert.equal(r.lines().length, 1); assert.match(r.lines()[0], /^Start with a melody bar of 16 steps.*G3 on step 1 for 1 step, D4 on step 2 for 1 step/);
  assert.ok(r.said().some((t) => /edited outside its list/.test(t)), r.said().join(' | '));
  // the dialog's words for an apply that added no line (the bar was only rebased): "Applied." and the take-back wording, with nothing after it (pinned as it is; the report names it)
  assert.ok(r.said().some((t) => /Applied\. Takes back:\s*$/.test(t)), r.said().join(' | '));
});
