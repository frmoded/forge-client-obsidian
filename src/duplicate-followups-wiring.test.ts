// 2026-11-19-0992a - THE TWO FOLLOW-UPS of Duplicate, through the REAL controller + composer + dialog (happy-dom, an in-memory vault built through the plugin's own ports mapping, description-wiring.ts):
//   R1  a click on a bar with ANY text in a PHRASE composer inserts the bar's link ` [[bar_007]]` at the caret (focus back, no preview, nothing pinned); exactly `Duplicate` (or ending with the word) keeps 0992's ` [[bar_007]].` and the preview.
//   R2  a copy is an undo entry: Cmd/Ctrl+Z in the EMPTY composer moves it to the trash when its bytes are still what the duplicate wrote, says so; an edited copy is left, said, and the NEXT Cmd/Ctrl+Z reaches the phrase's own
//       sentence; redo is not offered; the old "does not take a copy back" notice is gone; the phrase is never written by it. Written RED first. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { planNewBar } from './score-first-core.ts';
import { PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md';
const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

interface RigOpts { path?: string; note?: string; noTrash?: boolean; trashThrows?: boolean; trashNoop?: boolean }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>([[path, opts.note ?? emptyPhraseNote('phrase_001')], ['bars/bar_005.md', BAR], ['bars/bar_007.md', BAR.replace('bar_001', 'bar_007')], ['phrases/phrase_008.md', asListNote(PLAYGROUND_PHRASES.phrase_008, 'phrase_008')], ['phrases/phrase_003.md', asListNote(PLAYGROUND_PHRASES.phrase_003, 'phrase_003')], ['phrases/phrase_002.md', emptyPhraseNote('phrase_002')]]);
  let processCalls = 0; const timers: Array<() => void> = []; const trashed: string[] = []; const creates: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); creates.push(p); }, exists: (p: string) => store.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? ''),
    ...(opts.noTrash ? {} : { trash: async (p: string) => { if (opts.trashThrows) throw new Error('the system trash is not available'); trashed.push(p); if (!opts.trashNoop) store.delete(p); } }),
  } as never, { openNote: () => {} });
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string, caret?: number) => { field().value = t; if (caret !== undefined) field().setSelectionRange(caret, caret); field().dispatchEvent(new win.Event('input', { bubbles: true })); if (caret !== undefined) field().setSelectionRange(caret, caret); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const undoKey = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const notices = () => dialogEntries(el).filter((e) => e.kind === 'notice').map((e) => e.text);
  const list = () => extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  return { ctl, store, el, flush, field, type, enter, undoKey, say, notices, list, creates, trashed, path, calls: () => processCalls, entries: () => dialogEntries(el), last: () => dialogLast(el), ready: async () => { await ctl.inspect(path); await flush(); } };
}
type Rig = ReturnType<typeof rig>;
const copyOf = async (r: Rig, link = '[[bar_007]]') => { r.type(`Duplicate ${link}.`); await r.enter(); await r.enter(); };

// ---- R1: the click inserts the link after ANY typed text --------------------------------------------------------------------------------------------------------------------------------------
test('R1 armed: ANY non-empty text (trimmed) in a PHRASE composer arms the click; the empty composer does not; Duplicate still does; an unknown note\'s never (an arrangement\'s arms the link click since 1023)', async () => {
  const r = rig(); await r.ready();
  const armed = (t: string) => { r.type(t); return r.ctl.duplicateArmed(r.path); };
  for (const yes of ['Foo', 'Keep bars 1 to 2.', 'Duplicate', 'Duplicate [[bar_007]].', 'x', 'Duplicate it']) assert.equal(armed(yes), true, yes);
  for (const no of ['', '   ', '\n']) assert.equal(armed(no), false, JSON.stringify(no));
  assert.equal(r.ctl.duplicateArmed('phrases/not_open.md'), false);
  const arr = rig({ path: 'arrangements/arr_009.md', note: emptyArrangementNote('arr_009') }); await arr.ready(); arr.type('Foo');
  assert.equal(arr.ctl.duplicateArmed(arr.path), true, 'an arrangement composer holding text arms the LINK click too');          // 2026-11-23-1023 (deliberate): Part B, a click on a bar of an arrangement or composition Score writes the link of the note it comes from
});

// 2026-11-24-1034 (deliberate): "Foo" was the text of these tests; a plain text now gets the bar's POSITION (` bar 4`), the source link only where a line needs one (`replaced by`, `Take`, a head): the texts below say so.
test('R1: a click with "Take" in the field appends " [[bar_007]]" (one space, NO full stop), focus is back in the field, NO preview is asked, nothing is created, the phrase is not written', async () => {
  const r = rig(); await r.ready(); r.type('Take'); const before = r.store.get(PH)!, calls = r.calls();
  const done = await r.ctl.duplicateClick(r.path, 'bars/bar_007'); await r.flush();
  assert.equal(done.ok, true); assert.equal(r.field().value, 'Take [[bar_007]]');
  assert.ok(win.document.activeElement === r.field(), 'focus is back in the field');
  assert.ok(!r.entries().some((e) => e.kind === 'suggestion'), 'no preview: the text is not an action'); assert.deepEqual(r.creates, []);
  assert.equal(r.store.get(PH), before); assert.equal(r.calls(), calls);
});

test('R1: where the link goes: at the CARET (the middle of the text too), one leading space unless the text before it already ends in a space or an opening bracket, none at the very start; a phrase link and the typed text after the caret are kept', async () => {
  const cases: Array<[string, number, string]> = [
    ['Foo', 3, 'Foo bar 4'], ['Foo ', 4, 'Foo bar 4'], ['Foo\n', 4, 'Foo\nbar 4'], ['Make (', 6, 'Make (bar 4'], ['Make [', 6, 'Make [bar 4'],      // 2026-11-19-0996b (deliberate): it was 'Keep (' and 'Keep [': Keep is a bar word now; 2026-11-24-1034 (deliberate): the POSITION goes in (it was the link [[bar_007]]: the same spacing rule)
     ['Foo{', 4, 'Foo{bar 4'],
    ['Foo bar', 3, 'Foo bar 4 bar'], ['Foo bar', 0, 'bar 4Foo bar'], ['Foo bar', 7, 'Foo bar 4'],
    ['Take', 4, 'Take [[bar_007]]'], ['Bar 2 is replaced by', 20, 'Bar 2 is replaced by [[bar_007]]'], ['Bar 2 is replaced by ', 21, 'Bar 2 is replaced by [[bar_007]]'],
  ];
  for (const [text, caret, want] of cases) {
    const r = rig(); await r.ready(); r.type(text, caret);
    await r.ctl.duplicateClick(r.path, 'bars/bar_007', 4); await r.flush();
    assert.equal(r.field().value, want, `${JSON.stringify(text)} with the caret at ${caret}`);
  }
  const r = rig(); await r.ready(); r.type('Take'); await r.ctl.duplicateClick(r.path, 'phrases/phrase_008'); await r.flush();
  assert.equal(r.field().value, 'Take [[phrase_008]]');
});

test('R1: the caret ends AFTER the inserted text (a second click goes after the first); every click appends, nothing pins from the controller', async () => {
  const r = rig(); await r.ready(); r.type('Foo');
  await r.ctl.duplicateClick(r.path, 'bars/bar_007', 4); await r.ctl.duplicateClick(r.path, 'bars/bar_005', 5); await r.flush();
  assert.equal(r.field().value, 'Foo bar 4 and bar 5'); assert.equal(r.field().selectionStart, r.field().value.length);
});

test('R1 (2026-11-19-0996b, deliberate: it was "the word Duplicate keeps 0992 EXACTLY"): the word Duplicate first in the text now gives the bar NUMBER ("Duplicate bar 4", no preview); a text that only ENDS with the word is any other text: the link at the caret; a click with no bar number says so', async () => {
  const r = rig(); await r.ready(); r.type('Duplicate');
  await r.ctl.duplicateClick(r.path, 'bars/bar_007', 4); await r.flush();
  assert.equal(r.field().value, 'Duplicate bar 4'); assert.ok(win.document.activeElement === r.field());
  assert.equal([...r.el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent, undefined, 'no preview'); assert.deepEqual(r.creates, []);
  const kw = rig(); await kw.ready(); kw.type('Make it long. duplicate'); await kw.ctl.duplicateClick(kw.path, 'bars/bar_007', 4); await kw.flush();
  assert.equal(kw.field().value, 'Make it long. duplicate bar 4', 'ends with the word: the position, as any other text (2026-11-24-1034, deliberate: it was the link [[bar_007]])');
  const nobar = rig(); await nobar.ready(); nobar.type('Duplicate'); const said = await nobar.ctl.duplicateClick(nobar.path, 'bars/bar_007'); await nobar.flush();
  assert.equal(said.ok, false); assert.equal(nobar.field().value, 'Duplicate');
});

test('R1: a note the Score cannot name (null) or a kit: said in words, the text is unchanged (as 0992)', async () => {
  const r = rig(); await r.ready(); r.type('Foo');
  const none = await r.ctl.duplicateClick(r.path, null); const kit = await r.ctl.duplicateClick(r.path, 'kits/rock'); await r.flush();
  assert.equal(none.ok, false); assert.equal(kit.ok, false); assert.equal(r.field().value, 'Foo');
});

test('R1 P3: an EMPTY composer: the click is not a copy click (not armed, the controller changes nothing); an arrangement composer with text takes the link (1023)', async () => {
  const r = rig(); await r.ready(); r.type('');
  const d = await r.ctl.duplicateClick(r.path, 'bars/bar_007'); assert.equal(d.ok, false); assert.equal(r.field().value, '');
  const arr = rig({ path: 'arrangements/arr_009.md', note: emptyArrangementNote('arr_009') }); await arr.ready(); arr.type('Foo');
  const a = await arr.ctl.duplicateClick(arr.path, 'bars/bar_007'); assert.equal(a.ok, true); assert.match(arr.field().value, /^Foo \[\[bar_007\]\]/);          // 2026-11-23-1023 (deliberate): an arrangement composer with text takes the link of the note a bar comes from (no bar words there)
});

// ---- R2: Cmd/Ctrl+Z takes a fresh copy back ---------------------------------------------------------------------------------------------------------------------------------------------------
test('R2: Cmd/Ctrl+Z in the EMPTY composer moves an unchanged copy to the trash and says so in muted words; the PHRASE is never written; the old "does not take a copy back" notice is gone', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND);
  const phraseBefore = r.store.get(PH)!, calls = r.calls();
  await copyOf(r);
  assert.deepEqual(r.creates, ['bars/bar_008.md']);
  assert.ok(!r.notices().some((t) => /does not take a copy back/.test(t)), JSON.stringify(r.notices()));
  assert.equal(r.ctl.canUndo(r.path), true);
  await r.undoKey();
  assert.deepEqual(r.trashed, ['bars/bar_008.md']); assert.equal(r.store.has('bars/bar_008.md'), false);
  assert.equal(r.last(), 'Removed bar_008 (moved to the trash).'); assert.equal(r.entries().filter((e) => e.kind === 'notice').length >= 1, true);
  assert.equal(r.store.get(PH), phraseBefore, 'the phrase is byte for byte what it was'); assert.equal(r.calls(), calls, 'not one process call');
  assert.deepEqual(r.list(), [EXTEND], 'the list is untouched: the sentence is still there');
});

test('R2: an EDITED copy is left in place (said, with how to delete it) and the NEXT Cmd/Ctrl+Z undoes the phrase\'s own previous sentence', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await r.say('Make it 20 percent slower.');
  await copyOf(r);
  r.store.set('bars/bar_008.md', `${r.store.get('bars/bar_008.md')!}\nmy edit\n`);
  await r.undoKey();
  assert.deepEqual(r.trashed, []); assert.equal(r.store.has('bars/bar_008.md'), true);
  assert.equal(r.last(), 'bar_008 was edited since, so it was left in place. Delete it in the file list if you want it gone.');
  assert.equal(r.list().length, 2, 'the sentence is still on the list');
  await r.undoKey();
  assert.deepEqual(r.list(), [EXTEND], 'the next Cmd/Ctrl+Z reached the phrase\'s own previous sentence'); assert.deepEqual(r.trashed, []);
});

test('R2: in order of time: sentence, copy, sentence: Cmd+Z takes the later sentence, then the copy, then the first sentence; a removed copy is NOT offered for redo (Shift+Cmd+Z does not bring it back)', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await copyOf(r); await r.say('Make it 20 percent slower.');
  await r.undoKey(); assert.equal(r.list().length, 1); assert.deepEqual(r.trashed, []);
  await r.undoKey(); assert.deepEqual(r.trashed, ['bars/bar_008.md']); assert.equal(r.list().length, 1);
  await r.undoKey(true); assert.equal(r.store.has('bars/bar_008.md'), false, 'redo does not bring a trashed copy back'); assert.equal(r.list().length, 2, 'it puts back the SENTENCE that was taken back');
  await r.undoKey(); assert.equal(r.list().length, 1); assert.deepEqual(r.trashed, ['bars/bar_008.md'], 'the copy is not taken a second time');
  await r.undoKey(); assert.deepEqual(r.list(), [], 'the first sentence');
});

test('R2: a copy made in a phrase with NO sentence yet (a fresh note) is taken back too', async () => {
  const r = rig(); await r.ready(); await copyOf(r);
  assert.equal(r.ctl.canUndo(r.path), true);
  await r.undoKey(); assert.deepEqual(r.trashed, ['bars/bar_008.md']); assert.equal(r.last(), 'Removed bar_008 (moved to the trash).');
});

test('R2: a copy of a PHRASE follows the same rule (unchanged: removed; the name in the words is the copy\'s)', async () => {
  const r = rig(); await r.ready(); await copyOf(r, '[[phrase_008]]');
  const made = r.creates[0]; assert.match(made, /^phrases\/phrase_\d+\.md$/);
  await r.undoKey(); assert.deepEqual(r.trashed, [made]); assert.equal(r.last(), `Removed ${made.replace(/^phrases\//, '').replace(/\.md$/, '')} (moved to the trash).`);
});

test('R2: each copy is its own entry: two copies, two Cmd+Z, newest first; the second Cmd+Z after both are gone has nothing to take back (says so as it always did)', async () => {
  const r = rig(); await r.ready(); await copyOf(r); await copyOf(r);
  assert.deepEqual(r.creates, ['bars/bar_008.md', 'bars/bar_009.md']);
  await r.undoKey(); assert.deepEqual(r.trashed, ['bars/bar_009.md']);
  await r.undoKey(); assert.deepEqual(r.trashed, ['bars/bar_009.md', 'bars/bar_008.md']);
  const none = await r.ctl.undoLast(r.path); assert.equal(r.trashed.length, 2); assert.equal(none.ok, false); assert.match(none.message, /no sentence to take back/i);
});

test('R2: the copy was deleted by hand since: said in words, nothing trashed; a trash that fails: said, left in place; a build with no trash port makes no undo entry (no copy is ever removed behind the person\'s back)', async () => {
  const gone = rig(); await gone.ready(); await copyOf(gone); gone.store.delete('bars/bar_008.md'); await gone.undoKey();
  assert.match(gone.last(), /bar_008 is already gone/); assert.deepEqual(gone.trashed, []);
  const bad = rig({ trashThrows: true }); await bad.ready(); await copyOf(bad); await bad.undoKey();
  assert.match(bad.last(), /left in place/); assert.ok(!/^Removed/.test(bad.last())); assert.equal(bad.store.has('bars/bar_008.md'), true);
  const noop = rig({ trashNoop: true }); await noop.ready(); await copyOf(noop); await noop.undoKey();
  assert.match(noop.last(), /left in place/); assert.ok(!/^Removed/.test(noop.last()));
  const lean = rig({ noTrash: true }); await lean.ready(); await copyOf(lean); assert.equal(lean.ctl.canUndo(lean.path), false); await lean.undoKey(); assert.equal(lean.store.has('bars/bar_008.md'), true);
});

test('R2: the "+" menu\'s Undo item is enabled for a fresh copy (the same machinery) and a copy that was spent leaves nothing to undo', async () => {
  const r = rig(); await r.ready(); assert.equal(r.ctl.canUndo(r.path), false);
  await copyOf(r); assert.equal(r.ctl.canUndo(r.path), true);
  const out = await r.ctl.undoLast(r.path); assert.equal(out.ok, true); assert.match(out.message, /^Removed bar_008/); assert.equal(r.ctl.canUndo(r.path), false);
  assert.equal(r.ctl.canRedo(r.path), false);
});
