// 2026-11-19-0970 (THE LIST MODEL, stage 1) - the REAL controller + composer + dialog in happy-dom, for the flows of an arrangement and a composition whose Description is an ordered list of canonical sentences
// (checklists/music_tabs_chat_ui_design.md section 11): Apply APPENDS (it no longer replaces the Description); the preview says "This replaces: <old sentence>" when the conflict rule fires; the note is rewritten from the whole list in ONE
// write (idempotent); Cmd/Ctrl+Z in an EMPTY composer removes the last sentence, Shift+Cmd/Ctrl+Z puts it back, the "+" menu offers "Undo last sentence" and "Redo" (disabled, never hidden); a hand edit of the list is re-read on save
// (a deleted middle line, an unreadable line named in the dialog in plain muted words, the replay stopping before it); opening a note writes NOTHING (the migration of a paragraph is on the first recompute); a phrase, a bar and a note that is
// not music are untouched (P3). Every action is counted: ONE `process` call and ONE write per apply, undo and redo. A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogButtons, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { emptyArrangementNote, emptyCompositionNote } from './empty-note-core.ts';
import { readArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { readCompositionNote, newCompositionNote, type CompositionParams } from './composition-core.ts';
import { newPhraseNote } from './phrase-notes-core.ts';
import { applyPhraseWrite, formatPhraseJson, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { ARR_001, C5_LINES, C6_LINES, VAULT } from './test-support/sentence-list-fixtures.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';

/** The lines of a numbered Description (the test reads the note itself, not through the code under test). */
const render = (lines: string[]): string => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
const descriptionLines = (text: string): string[] => extractDescription(text).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));

const win: any = new Window({ url: 'http://localhost/' });
const ARR = 'arrangements/arr_001.md';
const COMP = 'compositions/song_1.md';
const FAMILY: Record<string, 'arrangement' | 'composition'> = { [ARR]: 'arrangement', [COMP]: 'composition' };

interface RigOpts { path?: string; note?: string; extra?: Record<string, string>; service?: () => Promise<{ status: number; json: unknown }>; menu?: boolean }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? COMP;
  const store = new Map<string, string>([[path, opts.note ?? (path === ARR ? emptyArrangementNote('arr_001') : emptyCompositionNote('song_1'))], ...Object.entries(opts.extra ?? {})]);
  const writes: string[] = []; let processCalls = 0; const timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => VAULT, barNames: () => VAULT.bars as string[], phraseNames: () => VAULT.phrases as string[],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    ...(opts.service !== undefined ? { askPlan: async () => opts.service!(), configured: () => true } : {}),
    ...(opts.menu === false ? {} : { composerMenu: () => ({ items: [{ id: 'new_phrase', label: 'New phrase' }, { id: 'new_arrangement', label: 'New arrangement' }], run: () => {} }) }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 160; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const escape = () => press({ key: 'Escape' });
  const undoKey = (mod: 'meta' | 'ctrl' = 'meta', shift = false) => press({ key: shift ? 'Z' : 'z', [`${mod}Key`]: true, shiftKey: shift });
  const runTimers = async () => { const t = timers.splice(0); for (const fn of t) fn(); await flush(); };
  const menuItems = () => [...el.querySelectorAll('.forge-composer-menuitem')] as HTMLElement[];
  const menuItem = (label: string) => menuItems().find((b) => b.textContent === label);
  const openMenu = async () => { const plus = el.querySelector('.forge-composer-plus') as HTMLElement; if ((el.querySelector('.forge-composer-menu') as HTMLElement).hidden === false) { plus.click(); await flush(); } plus.click(); await flush(); };      // always a FRESH open (the state of the items is asked at each open)
  const chooseMenu = async (label: string) => { await openMenu(); menuItem(label)!.click(); await flush(); };
  const text = () => store.get(path)!;
  const list = () => descriptionLines(text());
  const sections = () => { const r = readCompositionNote(text()); return r.ok ? r.value.sections.map((s) => `${s.source}${s.length ? `:${s.length}` : ''}${s.repeat ? `+${s.repeat}` : ''}`) : null; };
  const tracks = () => { const r = readArrangementNote(text()); return r.ok ? r.value.tracks : null; };
  /** type a sentence, Enter (preview), Enter (apply) */
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const hand = async (body: string) => { store.set(path, replaceDescriptionSection(text(), body)!); ctl.modified(path); await runTimers(); };
  return { ctl, store, writes, el, flush, field, type, enter, escape, undoKey, press, runTimers, menuItems, menuItem, openMenu, chooseMenu, text, list, sections, tracks, say, hand, ready: async () => { await ctl.inspect(path); await flush(); }, calls: () => processCalls, entries: () => dialogEntries(el), last: () => dialogLast(el), buttons: () => dialogButtons(el), path };
}
const noText = (r: ReturnType<typeof rig>): boolean => r.field().value === '';

// ---- Apply APPENDS ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the FIRST sentence of an empty note makes a list of ONE item, in one write; the composer is empty again afterwards', async () => {
  const r = rig(); await r.ready();
  assert.ok(noText(r), 'an empty note: an empty composer');
  r.type('Play [[phrase_001]].'); await r.enter();
  assert.match(r.last(), /^The grammar read your sentence\. This is what would be written\.$/); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.deepEqual(r.writes, [], 'a preview writes nothing'); assert.equal(r.calls(), 0);
  await r.enter();
  assert.deepEqual(r.list(), ['Play [[phrase_001]].']); assert.equal(extractDescription(r.text()), '1. Play [[phrase_001]].'); assert.deepEqual(r.sections(), ['phrases/phrase_001']);
  assert.equal(r.writes.length, 1); assert.equal(r.calls(), 1, 'ONE process call');
  assert.ok(noText(r), 'the composer is empty after an apply');
  assert.ok(r.entries().some((e) => e.kind === 'applied'), 'the dialog says it was applied');
});

test('every further sentence is APPENDED (the Description is no longer replaced), one write each; the Score input (the json cache) follows the whole list; THREE lines', async () => {
  const r = rig(); await r.ready();
  await r.say('Play [[phrase_001]].'); await r.say('then play phrase_002 for 4 bars'); await r.say('Repeat that once more.');
  assert.deepEqual(r.list(), C6_LINES); assert.equal(extractDescription(r.text()), render(C6_LINES));
  assert.deepEqual(r.sections(), ['phrases/phrase_001', 'phrases/phrase_002:4+1']);
  assert.equal(r.writes.length, 3); assert.equal(r.calls(), 3);
  assert.ok(noText(r));
});

test('an arrangement grows the same way: the three sentences of C5, one at a time, are the note today\'s single sentence made', async () => {
  const r = rig({ path: ARR }); await r.ready();
  await r.say('Play [[phrase_001]] on the [[rock]] kit.'); await r.say('play phrase_002 on the latin kit'); await r.say('Play the [[latin]] kit at 60 percent volume.');
  assert.deepEqual(r.list(), C5_LINES); assert.deepEqual(r.tracks(), [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 60 }]);
  assert.equal(r.writes.length, 3);
});

test('a typed sentence of SEVERAL parts (a whole description, "Together." included) appends each part as its own line, in one write', async () => {
  const r = rig({ path: ARR }); await r.ready();
  await r.say('Play [[phrase_001]] on the [[rock]] kit. Play [[phrase_002]] on the [[latin]] kit. Together.');
  assert.deepEqual(r.list(), C5_LINES.slice(0, 2)); assert.equal(r.writes.length, 1);
});

test('the composer shows nothing of the list: a note with a Description of three lines opens with an EMPTY composer (the list is in the note, not in the prompt line)', async () => {
  const start = rig({ path: ARR }); await start.ready(); for (const s of C5_LINES) await start.say(s);
  assert.deepEqual(start.list(), C5_LINES, 'precondition: the note has its three lines');
  const again = rig({ path: ARR, note: start.text() }); await again.ready();
  assert.ok(noText(again));
});

test('a sentence the grammar cannot read is not appended: the dialog says so and (without a service) nothing is written', async () => {
  const r = rig(); await r.ready();
  r.type('Then play [[nobody_here]].'); await r.enter();
  assert.ok(r.entries().some((e) => e.kind === 'rejected')); assert.deepEqual(r.writes, []); assert.equal(r.calls(), 0);
});

// ---- the conflict rule -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the same KIT twice: the preview says "This replaces: <old sentence>" (plain text), and Enter replaces that line in place', async () => {
  const r = rig({ path: ARR }); await r.ready(); for (const s of C5_LINES) await r.say(s); const before = r.writes.length;
  r.type('Play [[phrase_003]] on the [[rock]] kit.'); await r.enter();
  const sug = r.entries().filter((e) => e.kind === 'suggestion').pop()!;
  assert.ok(sug.text.includes(`This replaces: ${C5_LINES[0]}`), sug.text);
  assert.deepEqual(r.list(), C5_LINES, 'the preview writes nothing');
  await r.enter();
  assert.deepEqual(r.list(), ['Play [[phrase_003]] on the [[rock]] kit.', C5_LINES[1], C5_LINES[2]]); assert.equal(r.writes.length, before + 1);
  assert.equal(r.tracks()![0].phrase, 'phrase_003');
});

test('the same VOLUME target twice replaces the earlier volume line; a volume for another kit adds a line and replaces nothing (no "This replaces" in its preview)', async () => {
  const r = rig({ path: ARR }); await r.ready(); for (const s of C5_LINES) await r.say(s);
  r.type('Play the [[latin]] kit at 20 percent volume.'); await r.enter();
  assert.ok(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text.includes(`This replaces: ${C5_LINES[2]}`));
  await r.enter(); assert.deepEqual(r.list(), [C5_LINES[0], C5_LINES[1], 'Play the [[latin]] kit at 20 percent volume.']);
  r.type('Play the [[rock]] kit at 90 percent volume.'); await r.enter();
  assert.ok(!r.entries().filter((e) => e.kind === 'suggestion').pop()!.text.includes('This replaces'));
  await r.enter(); assert.equal(r.list().length, 4);
});

test('compositions never conflict: the same section twice is two lines and the preview never says "This replaces"', async () => {
  const r = rig(); await r.ready();
  await r.say('Play [[phrase_001]].'); r.type('Play [[phrase_001]].'); await r.enter();
  assert.ok(!r.entries().filter((e) => e.kind === 'suggestion').pop()!.text.includes('This replaces'));
  await r.enter(); assert.deepEqual(r.list(), ['Play [[phrase_001]].', 'Then play [[phrase_001]].']);
});

test('a sentence the note already says changes nothing: no preview, no write ("Nothing changed: the note already says this.")', async () => {
  const r = rig({ path: ARR }); await r.ready(); for (const s of C5_LINES) await r.say(s); const w = r.writes.length, c = r.calls();
  r.type('Play the [[latin]] kit at 60 percent volume.'); await r.enter();
  assert.equal(r.last(), 'Nothing changed: the note already says this.'); assert.deepEqual(r.buttons(), []);
  assert.equal(r.writes.length, w); assert.equal(r.calls(), c);
});

// ---- undo and redo -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('Cmd+Z in an EMPTY composer removes the LAST item and recomputes in ONE write; the dialog says "Removed: <sentence>"; Shift+Cmd+Z puts it back in one write', async () => {
  const r = rig(); await r.ready(); for (const s of C6_LINES) await r.say(s); const w = r.writes.length, c = r.calls();
  const prevented = await r.undoKey('meta');
  assert.equal(prevented, true, 'the key is ours in an empty composer');
  assert.deepEqual(r.list(), C6_LINES.slice(0, 2)); assert.deepEqual(r.sections(), ['phrases/phrase_001', 'phrases/phrase_002:4']);
  assert.equal(r.writes.length, w + 1); assert.equal(r.calls(), c + 1);
  assert.equal(r.last(), `Removed: ${C6_LINES[2]}`);
  await r.undoKey('meta', true);
  assert.deepEqual(r.list(), C6_LINES); assert.deepEqual(r.sections(), ['phrases/phrase_001', 'phrases/phrase_002:4+1']);
  assert.equal(r.writes.length, w + 2); assert.equal(r.calls(), c + 2);
  assert.ok(r.entries().some((e) => e.kind === 'notice' && /Added again: Repeat that once more\./.test(e.text)));
});

test('Ctrl+Z and Shift+Ctrl+Z do the same (the other platforms)', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); await r.say('Then play [[phrase_002]].');
  await r.undoKey('ctrl'); assert.equal(r.list().length, 1); await r.undoKey('ctrl', true); assert.equal(r.list().length, 2);
});

test('Cmd+Z in a composer WITH text is the browser\'s own (the key is not taken, nothing is written)', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); const w = r.writes.length;
  r.type('half a sen');
  assert.equal(await r.undoKey('meta'), false); assert.equal(r.writes.length, w); assert.equal(r.list().length, 1);
});

test('undoing every sentence gives back the EMPTY note (byte for byte), one write each; then there is nothing to undo', async () => {
  const r = rig(); await r.ready(); for (const s of C6_LINES) await r.say(s);
  for (let i = 0; i < 3; i++) await r.undoKey();
  assert.equal(r.text(), emptyCompositionNote('song_1')); assert.equal(r.writes.length, 6);
  const w = r.writes.length, c = r.calls();
  assert.equal(await r.undoKey(), true, 'the key is still ours'); assert.equal(r.writes.length, w); assert.equal(r.calls(), c, 'nothing to undo: no write, no process call');
});

test('a NEW sentence clears redo: after an undo and a new sentence, Shift+Cmd+Z does nothing', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); await r.say('Then play [[phrase_002]].');
  await r.undoKey(); await r.say('Then play [[phrase_003]].'); const w = r.writes.length;
  await r.undoKey('meta', true); assert.equal(r.writes.length, w); assert.deepEqual(r.list(), ['Play [[phrase_001]].', 'Then play [[phrase_003]].']);
});

test('undo of a REPLACE puts the replaced sentence back where it was, and says so in the dialog', async () => {
  const r = rig({ path: ARR }); await r.ready(); for (const s of C5_LINES) await r.say(s);
  await r.say('Play the [[latin]] kit at 20 percent volume.');
  await r.undoKey();
  assert.deepEqual(r.list(), C5_LINES); assert.equal(r.last(), `Removed: Play the [[latin]] kit at 20 percent volume. Put back: ${C5_LINES[2]}`);
  assert.equal(r.tracks()![1].volume, 60);
});

test('undo after a HAND EDIT removes the last item of the list as it is now', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); await r.say('Then play [[phrase_002]].');
  await r.hand('1. Play [[phrase_001]].\n2. Then play [[phrase_002]].\n3. Then play [[phrase_003]].');
  assert.equal(r.list().length, 3); assert.deepEqual(r.sections(), ['phrases/phrase_001', 'phrases/phrase_002', 'phrases/phrase_003']);
  await r.undoKey(); assert.deepEqual(r.list(), ['Play [[phrase_001]].', 'Then play [[phrase_002]].']); assert.equal(r.last(), 'Removed: Then play [[phrase_003]].');
});

test('the "+" menu has "Undo last sentence" and "Redo": present and DISABLED (not hidden) when there is nothing, enabled when there is', async () => {
  const r = rig(); await r.ready();
  await r.openMenu();
  const undo = r.menuItem('Undo last sentence'), redo = r.menuItem('Redo');
  assert.ok(undo !== undefined && redo !== undefined, 'both items are in the menu');
  assert.equal(undo!.getAttribute('aria-disabled'), 'true'); assert.equal(redo!.getAttribute('aria-disabled'), 'true'); assert.equal(undo!.hidden, false); assert.equal(redo!.hidden, false);
  assert.deepEqual(r.menuItems().map((b) => b.textContent), ['New phrase', 'New arrangement', 'Undo last sentence', 'Redo'], 'the New actions first, then the two');
  await r.say('Play [[phrase_001]].'); await r.openMenu();
  assert.equal(r.menuItem('Undo last sentence')!.getAttribute('aria-disabled'), 'false'); assert.equal(r.menuItem('Redo')!.getAttribute('aria-disabled'), 'true');
  await r.chooseMenu('Undo last sentence');
  assert.deepEqual(r.list(), []); assert.equal(r.last(), 'Removed: Play [[phrase_001]].');
  await r.openMenu(); assert.equal(r.menuItem('Undo last sentence')!.getAttribute('aria-disabled'), 'true'); assert.equal(r.menuItem('Redo')!.getAttribute('aria-disabled'), 'false');
  await r.chooseMenu('Redo'); assert.deepEqual(r.list(), ['Play [[phrase_001]].']);
});

test('a disabled menu item does nothing when it is clicked (no write, no process call)', async () => {
  const r = rig(); await r.ready(); await r.openMenu(); r.menuItem('Undo last sentence')!.click(); r.menuItem('Redo')!.click(); await r.flush();
  assert.deepEqual(r.writes, []); assert.equal(r.calls(), 0);
});

test('the two menu items are named by the hidden label helper, never by a tooltip (no title, no aria-label)', async () => {
  const r = rig(); await r.ready(); await r.openMenu();
  for (const l of ['Undo last sentence', 'Redo']) { const b = r.menuItem(l)!; assert.equal(b.getAttribute('title'), null); assert.equal(b.getAttribute('aria-label'), null); }
});

// ---- a hand edit of the list is re-read on save ------------------------------------------------------------------------------------------------------------------------------------------
test('a deleted MIDDLE line in the note: on save the list is re-read and the note recomputed in one write (the list renumbered, the json and the Recipe shorter)', async () => {
  const r = rig(); await r.ready(); for (const s of C6_LINES) await r.say(s); const w = r.writes.length;
  await r.hand('1. Play [[phrase_001]].\n3. Repeat that once more.');
  assert.deepEqual(r.list(), ['Play [[phrase_001]].', 'Repeat that once more.']); assert.equal(extractDescription(r.text()), '1. Play [[phrase_001]].\n2. Repeat that once more.');
  assert.deepEqual(r.sections(), ['phrases/phrase_001+1']); assert.equal(r.writes.length, w + 1);
});

test('an UNREADABLE line is kept, the replay stops before it, and the dialog names it in plain muted text (no red, no "!" glyph, not a refusal)', async () => {
  const r = rig(); await r.ready(); for (const s of C6_LINES.slice(0, 2)) await r.say(s);
  await r.hand('1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.\n3. play me something nice');
  assert.equal(extractDescription(r.text()), '1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.\n3. play me something nice', 'the line is kept as written');
  assert.deepEqual(r.sections(), ['phrases/phrase_001', 'phrases/phrase_002:4']);
  const said = r.entries().filter((e) => e.kind === 'notice').pop()!;
  assert.ok(said.text.startsWith('Line 3 is not a sentence I can read; the note shows lines 1 and 2.'), said.text);
  assert.equal(r.el.querySelectorAll('.forge-chat-bang').length, 0, 'no "!" glyph: it is not an error');
  assert.equal(r.el.querySelector('.forge-chat-msg.is-failed, .forge-chat-msg.is-refused, .forge-chat-msg.is-rejected') === null, true);
});

test('a hand edit whose FIRST line cannot be read is rejected as before: nothing is written and the note keeps what it shows', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); const w = r.writes.length;
  await r.hand('1. nonsense\n2. Play [[phrase_002]].');
  assert.equal(r.writes.length, w); assert.deepEqual(r.sections(), ['phrases/phrase_001']);
});

test('adding a sentence to a list that has an unreadable line is refused in plain words (the line is named) and writes nothing', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].');
  await r.hand('1. Play [[phrase_001]].\n2. play me something nice'); const w = r.writes.length;
  r.type('Then play [[phrase_002]].'); await r.enter();
  assert.match(r.last(), /^Line 2 is not a sentence I can read; the note shows line 1\./); assert.deepEqual(r.buttons(), []); assert.equal(r.writes.length, w);
  r.type(''); await r.undoKey(); assert.deepEqual(r.list(), ['Play [[phrase_001]].'], 'undo removes the unreadable last line and the list reads again');
});

test('the loop check runs on a hand-edited list: the lines before the looping line apply, the dialog names both notes, nothing loops', async () => {
  const extra = { 'compositions/song_2.md': newCompositionNote('song_2', { kind: 'composition', sections: [{ source: 'compositions/song_1' }] }) };
  const r = rig({ extra }); await r.ready(); await r.say('Play [[phrase_003]].');
  await r.hand('1. Play [[phrase_003]].\n2. Then play [[song_2]].');
  assert.deepEqual(r.sections(), ['phrases/phrase_003']);
  const said = r.entries().filter((e) => e.kind === 'notice').pop()!;
  assert.match(said.text, /song_2.*song_1|song_1.*song_2/); assert.match(said.text, /The note shows line 1\./);
});

test('a typed sentence that loops is refused BEFORE any preview, with the 0910 words, in the list model too', async () => {
  const extra = { 'compositions/song_2.md': newCompositionNote('song_2', { kind: 'composition', sections: [{ source: 'compositions/song_1' }] }) };
  const r = rig({ extra }); await r.ready(); await r.say('Play [[phrase_003]].'); const w = r.writes.length;
  r.type('Then play [[song_2]].'); await r.enter();
  assert.equal(r.last(), 'Refused: The composition song_2 loops back to this composition: song_1 → song_2 → song_1.'); assert.deepEqual(r.buttons(), []); assert.equal(r.writes.length, w);
});

// ---- migration: on the first recompute, never on open ------------------------------------------------------------------------------------------------------------------------------------
test('OPENING a note writes NOTHING: an empty note, a list note and a legacy paragraph note (no process call, no write, the text is the same), and opening again is the same', async () => {
  const lister = rig({ path: ARR }); await lister.ready(); for (const s of C5_LINES) await lister.say(s);
  assert.deepEqual(lister.list(), C5_LINES, 'precondition: the list note has its three lines');
  const cases: Array<[string, RigOpts]> = [['empty', { path: ARR }], ['list', { path: ARR, note: lister.text() }], ['paragraph', { path: ARR, note: ARR_001 }], ['empty composition', {}]];
  for (const [name, opts] of cases) {
    const r = rig(opts); const before = r.text();
    await r.ready(); await r.ctl.inspectOpen(); r.ctl.syncBars(); await r.ready();
    assert.equal(r.calls(), 0, `${name}: no process call`); assert.deepEqual(r.writes, [], `${name}: no write`); assert.equal(r.text() === before, true, `${name}: the same bytes`);
  }
});

test('a legacy PARAGRAPH note (arr_001) is split into a list on its FIRST recompute: the next sentence is appended to its lines, the old ones keep their order, one write', async () => {
  const r = rig({ path: ARR, note: ARR_001 }); await r.ready();
  r.type('Mute the [[latin]] kit.'); await r.enter();
  assert.ok(r.entries().some((e) => e.kind === 'suggestion')); assert.equal(r.writes.length, 0);
  await r.enter();
  assert.deepEqual(r.list(), ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 58 percent volume.', 'Mute the [[latin]] kit.']);
  assert.equal(r.writes.length, 1); assert.equal(r.calls(), 1);
  assert.deepEqual(r.tracks(), [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', mute: true, volume: 58 }]);
});

test('a legacy paragraph the grammar cannot split stays ONE line: typing a sentence is refused in plain words and nothing is written', async () => {
  const bad = ARR_001.replace('Play [[phrase_002]] on the [[latin]] kit.', 'Play [[phrase_002]] on the [[nobody]] kit.');
  const r = rig({ path: ARR, note: bad }); await r.ready();
  r.type('Mute the [[latin]] kit.'); await r.enter();
  assert.match(r.last(), /^Line 1 is not a sentence I can read/); assert.equal(r.writes.length, 0);
});

// ---- the service's answer is a list of lines too -----------------------------------------------------------------------------------------------------------------------------------------
test('the sentence service\'s plan is APPENDED as lines (and a plan that conflicts says what it replaces); one write on the second Enter', async () => {
  const plan = (p: unknown) => async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: p, error: null, version: '0.2.48' } });
  const r = rig({ path: ARR, service: plan({ kind: 'arrangement', tracks: [{ kit: 'jazz', phrase: 'phrase_003' }] }) }); await r.ready();
  await r.say('Play [[phrase_001]] on the [[rock]] kit.');
  r.type('jazz kit takes the third phrase, please'); await r.enter();
  assert.ok(r.entries().some((e) => e.kind === 'suggestion' && e.text === 'The service suggests this.'), JSON.stringify(r.entries().map((e) => e.text)));
  assert.equal(r.writes.length, 1, 'the preview wrote nothing');
  await r.enter();
  assert.deepEqual(r.list(), ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_003]] on the [[jazz]] kit.']); assert.equal(r.writes.length, 2);
  const again = rig({ path: ARR, service: plan({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }) }); await again.ready();
  await again.say('Play [[phrase_001]] on the [[rock]] kit.');
  again.type('rock should play the third one instead'); await again.enter();
  assert.ok(again.entries().filter((e) => e.kind === 'suggestion').pop()!.text.includes('This replaces: Play [[phrase_001]] on the [[rock]] kit.'));
  await again.enter(); assert.deepEqual(again.list(), ['Play [[phrase_003]] on the [[rock]] kit.']);
});

test('Esc on a preview discards it: nothing is written, nothing is appended', async () => {
  const r = rig(); await r.ready(); r.type('Play [[phrase_001]].'); await r.enter(); await r.escape();
  assert.deepEqual(r.writes, []); assert.deepEqual(r.list(), []); assert.deepEqual(r.buttons(), []);
});

// ---- idempotent: no-op stays no-op, and undo does not need the history of this session ------------------------------------------------------------------------------------------------------------
test('a `modify` of a list note that did not change (our own write coming back, a save with the same text) is heard and writes NOTHING; a re-saved list with only its numbering or spacing changed is rewritten ONCE, and then it is quiet', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].'); await r.say('Then play [[phrase_002]].');
  const w = r.writes.length, c = r.calls();
  r.ctl.modified(r.path); await r.runTimers(); r.ctl.modified(r.path); await r.runTimers();
  assert.equal(r.writes.length, w); assert.equal(r.calls(), c, 'a note in step with its stamps is not even looked at by `process`');
  await r.hand('7. Play [[phrase_001]].\n\n\n9)   then play  [[phrase_002]]');                  // the same two sentences, other numbers, blank lines, other case and spacing
  assert.equal(r.writes.length, w + 1, 'the canonical rewrite of the hand edit is ONE write');
  assert.equal(extractDescription(r.text()), '1. Play [[phrase_001]].\n2. Then play [[phrase_002]].');
  const w2 = r.writes.length; r.ctl.modified(r.path); await r.runTimers(); assert.equal(r.writes.length, w2, 'and then nothing more');
});

test('undo does not need the history of this session: a NEW controller on a note with a list (Obsidian was restarted) still removes the last item, one write; redo has nothing yet', async () => {
  const first = rig(); await first.ready(); await first.say('Play [[phrase_001]].'); await first.say('Then play [[phrase_002]].');
  const again = rig({ note: first.text() }); await again.ready();
  assert.equal(await again.undoKey(), true);
  assert.deepEqual(again.list(), ['Play [[phrase_001]].']); assert.equal(again.writes.length, 1); assert.equal(again.last(), 'Removed: Then play [[phrase_002]].');
  await again.openMenu(); assert.equal(again.menuItem('Redo')!.getAttribute('aria-disabled'), 'false', 'the undo just made can be redone');
  await again.undoKey('meta', true); assert.deepEqual(again.list(), ['Play [[phrase_001]].', 'Then play [[phrase_002]].']);
});

test('a list tab ALWAYS has the "+" menu with Undo and Redo, even where the plugin gave no New actions (the two items are the controller\'s own)', async () => {
  const r = rig({ menu: false }); await r.ready(); await r.openMenu();
  assert.deepEqual(r.menuItems().map((b) => b.textContent), ['Undo last sentence', 'Redo']);
});

test('a note that vanished under an undo says so in the dialog (never silent): nothing is written', async () => {
  const r = rig(); await r.ready(); await r.say('Play [[phrase_001]].');
  const errors: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try { r.store.delete(r.path); await r.undoKey(); } finally { console.error = orig; }
  assert.equal(errors.length, 1, 'console.error names the method'); assert.match(r.last(), /Could not read the note/);
});

// ---- P3: nothing changes outside arrangements and compositions ---------------------------------------------------------------------------------------------------------------------
test('P3, a PHRASE: the composer still shows the Description, a sentence REPLACES it, the bytes are the old writer\'s, there is no Undo in the "+" menu and Cmd+Z in an empty composer is not taken', async () => {
  const ext: PhraseParams = { kind: 'extend', source: 'bar_007', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
  const note = newPhraseNote('phrase_003', ext, formatPhraseJson(ext)); const P = 'phrases/phrase_003.md';
  const r = rig({ path: P, note });
  await r.ready();
  assert.equal(r.field().value, extractDescription(note), 'the composer shows the Description of a phrase, as before');
  r.type('Extend [[bar_007]] to 6 bars, repeating with fills, 20 percent slower.'); await r.enter(); await r.enter();
  const expected = applyPhraseWrite(note, { ...ext, bars: 6 }, 'phrase_003', true); assert.ok(expected.ok);
  assert.equal(r.text(), (expected as { text: string }).text, 'byte for byte what the old writer wrote');
  await r.openMenu(); assert.equal(r.menuItem('Undo last sentence'), undefined); assert.equal(r.menuItem('Redo'), undefined);
  r.type(''); const w = r.writes.length; assert.equal(await r.undoKey(), false); assert.equal(r.writes.length, w);
});

test('P3, a note that is not a phrase, arrangement or composition (a bar, a plain note) is neither read nor written: no composer, no process call', async () => {
  const notes: Record<string, string> = { 'bars/bar_007.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind":"rhythm"}\n```\n', 'notes/plain.md': '# Plain\n\n1. a list\n' };
  for (const [p, text] of Object.entries(notes)) {
    const r = rig({ path: p, note: text }); await r.ready(); r.ctl.modified(p); await r.runTimers();
    assert.equal(r.calls(), 0); assert.deepEqual(r.writes, []); assert.equal(r.el.querySelector('.forge-prompt-box'), null, 'no composer');
  }
});
