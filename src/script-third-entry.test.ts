// 2026-11-22-1016 (checklists/music_tabs_chat_ui_design.md 11i): the script (Recipe and Python) is the THIRD entry point of a list note. A hand-edited, readable Recipe no longer rewrites the list behind the driver's back: the strip says
// `The list no longer matches the script` and offers `Rewrite the list from the script` and `Discard my script edits`; a list save while the Recipe holds edits asks once; a Python edit stays as it was. No model call. Through the REAL controller.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { asRecipeSourced, isCustomNote, pythonTextOf } from './phrase-notes-core.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const START = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');
const editDesc = (text: string, from: string, to: string): string => { const d = extractDescription(text); assert.ok(d.includes(from), `the Description has "${from}"`); return text.replace(d, d.replace(from, to)); };
const editRecipe = (text: string, from: string, to: string): string => { const x = extractRecipeSection(text) ?? ''; assert.ok(x.includes(from), `the Recipe has "${from}"`); return text.replace(x, x.replace(from, to)); };
const STALE = 'The list no longer matches the script';
const ASK_ONCE = 'Your script has edits the list does not have. Keep them or replace them with the list?';

function rig(start: string = START()) {
  const store = new Map<string, string>([[PATH, start]]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const lines: string[] = [], writes: string[] = [], asked: unknown[] = [];
  const flags: { fail: boolean; before?: (p: string) => void } = { fail: false };
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); if (flags.fail) throw new Error('disk full'); flags.before?.(p); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => panes,
    askPlan: async (payload: unknown) => { asked.push(payload); return { status: 500, json: {} }; }, configured: () => true,
  };
  const ctl = createDescriptionController(ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 60; i++) await Promise.resolve(); };
  const pane = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PATH, contentEl: el }); return el as HTMLElement; };
  const touch = async () => { ctl.modified(PATH); await advance(DESCRIPTION_DEBOUNCE_MS); };
  const click = async (el: HTMLElement, action: string) => { const b = el.querySelector(`[data-action="${action}"]`) as HTMLElement | null; assert.ok(b, `the strip has the button ${action}: ${buttons(el).join(', ')}`); b.click(); await advance(1); };
  return { ctl, store, lines, writes, asked, advance, pane, touch, click, ports, panes, flags };
}
const msg = (el: HTMLElement): string => el.querySelector('.forge-description-message')?.textContent ?? '';
const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action') ?? '');
const labels = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.textContent ?? '');

test('1 (a) a hand-edited READABLE Recipe does NOT rewrite the list: nothing is written, the strip says the list no longer matches the script (muted: no error class) with the two actions, and no model is asked', async () => {
  const r = rig(); const a = r.pane();
  const before = r.store.get(PATH)!;
  r.store.set(PATH, editRecipe(before, '8 bars', '6 bars'));
  await r.touch();
  assert.deepEqual(r.writes, [], 'the list is not rewritten at once');
  assert.equal(extractDescription(r.store.get(PATH)!), extractDescription(before), 'the list is as the driver left it');
  assert.ok(msg(a).startsWith(STALE), msg(a));
  assert.deepEqual(labels(a), ['Rewrite the list from the script', 'Discard my script edits']);
  assert.equal(a.querySelector('.is-error, .is-rejected, .mod-warning'), null, 'muted, never red');
  assert.deepEqual(r.asked, [], 'no model call');
});

test('1 (b) "Rewrite the list from the script" writes the list from the Recipe on request (today\'s behaviour), as ONE undo entry that gives the hand-edited note back byte for byte; redo does it again', async () => {
  const r = rig(); const a = r.pane();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited);
  await r.touch();
  await r.click(a, 'update-recipe');
  assert.equal(r.store.get(PATH), asRecipeSourced(asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 6 }), 'phrase_001')));
  assert.equal(a.querySelector('.forge-description-bar'), null, 'synced: the strip goes');
  const undone = await r.ctl.undoLast(PATH);
  assert.equal(undone.ok, true, undone.message);
  assert.equal(r.store.get(PATH), edited, 'one undo gives the hand-edited note back, byte for byte');
  assert.ok(msg(a).startsWith(STALE), 'and the strip is back');
  const redone = await r.ctl.redoLast(PATH);
  assert.equal(redone.ok, true, redone.message);
  assert.equal(r.store.get(PATH), asRecipeSourced(asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 6 }), 'phrase_001')));
});

test('1 (c) "Discard my script edits" replays the list over the Recipe and the Python: the note is the one the list makes, as ONE undo entry that gives the hand-edited Recipe back', async () => {
  const r = rig(); const a = r.pane();
  const start = r.store.get(PATH)!;
  const edited = editRecipe(start, '8 bars', '6 bars'); r.store.set(PATH, edited);
  await r.touch();
  await r.click(a, 'revert');
  assert.equal(r.store.get(PATH), start, 'the list says 8 bars: the Recipe and the Python are made again from it');
  assert.equal(a.querySelector('.forge-description-bar'), null);
  assert.equal((await r.ctl.undoLast(PATH)).ok, true);
  assert.equal(r.store.get(PATH), edited, 'one undo gives the hand-edited Recipe back');
});

test('1 (d) a LIST edit and save while the Recipe holds edits asks ONCE (no silent replay over the script): Keep holds the list save and the note stays as it is; Replace replays the list; one undo entry', async () => {
  const r = rig(); const a = r.pane();
  const start = r.store.get(PATH)!;
  const both = editDesc(editRecipe(start, '8 bars', '6 bars'), '8 bars', '5 bars'); r.store.set(PATH, both);
  await r.touch();
  assert.deepEqual(r.writes, []);
  assert.equal(msg(a), ASK_ONCE); assert.deepEqual(buttons(a), ['keep-script', 'update']);
  assert.deepEqual(labels(a), ['Keep my script edits', 'Replace them with the list']);
  await r.click(a, 'keep-script');
  assert.deepEqual(r.writes, [], 'Keep writes nothing');
  assert.equal(r.store.get(PATH), both, 'the note stays as it is');
  assert.ok(msg(a).startsWith(STALE), `asked once, then the quiet strip: ${msg(a)}`);
  await r.touch(); assert.equal(r.store.get(PATH), both); assert.ok(msg(a).startsWith(STALE), 'and not asked again for the same text');
  await r.click(a, 'update');
  assert.equal(r.store.get(PATH), asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 5 }), 'phrase_001'), 'Replace: the list is replayed over the script');
  assert.equal((await r.ctl.undoLast(PATH)).ok, true);
  assert.equal(r.store.get(PATH), both, 'one undo gives both edits back');
});

test('1 (e) a Python edit stays as it was: a shape the controls do not know makes a custom note, the list is not touched and "Update from Description" does not overwrite it', async () => {
  const r = rig(); const a = r.pane();
  const start = r.store.get(PATH)!;
  const py = pythonTextOf(start)!; const custom = start.replace(py, `${py}\nextra = 1`);
  r.store.set(PATH, custom); await r.touch();
  assert.equal(isCustomNote(r.store.get(PATH)!), true, 'a custom note');
  assert.equal(extractDescription(r.store.get(PATH)!), extractDescription(start), 'the list is as it was');
  assert.ok(!msg(a).startsWith(STALE));
  assert.ok(pythonTextOf(r.store.get(PATH)!)!.includes('extra = 1'), 'the Python tweak is kept');
});

test('3 (a) the list was edited, then the Recipe by hand: the later edit is the one held (the list edit was applied by its own turn; the Recipe edit is not applied behind it)', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editDesc(r.store.get(PATH)!, '8 bars', '5 bars')); await r.touch();
  const applied = r.store.get(PATH)!;
  assert.equal(readPhraseNote(applied).ok && (readPhraseNote(applied) as any).value.bars, 5);
  const edited = editRecipe(applied, '5 bars', '3 bars'); r.store.set(PATH, edited); await r.touch();
  assert.equal(r.store.get(PATH), edited, 'nothing rewritten');
  assert.ok(msg(a).startsWith(STALE));
});

test('3 (b) two quick Recipe edits: one strip, the later text is what "Rewrite the list from the script" uses', async () => {
  const r = rig(); const a = r.pane();
  const start = r.store.get(PATH)!;
  r.store.set(PATH, editRecipe(start, '8 bars', '6 bars')); r.ctl.modified(PATH); await r.advance(100);
  r.store.set(PATH, editRecipe(start, '8 bars', '3 bars')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.equal(a.querySelectorAll('.forge-description-bar').length, 1);
  await r.click(a, 'update-recipe');
  assert.equal(readPhraseNote(r.store.get(PATH)!).ok && (readPhraseNote(r.store.get(PATH)!) as any).value.bars, 3);
});

test('3 (c) reload: a new controller on the same note finds the Recipe edit still marked (the stamps are in the note, nothing is kept in memory)', async () => {
  const r = rig(); r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  const second = rig(r.store.get(PATH)!); const b = second.pane();
  await second.ctl.inspect(PATH);
  assert.ok(msg(b).startsWith(STALE), msg(b));
  assert.deepEqual(second.writes, []);
});

// ---- the driver's words and the waiting lines (1015) through "Rewrite the list from the script" ----------------------------------------------------------------------------------------------------------------------------
test('3 (d) "Rewrite the list from the script" KEEPS what it can: a line the script says unchanged keeps the driver\'s words beside it, and every line from the first WAITING line on stays at the end (never applied, still waiting); a line the script changed loses words that no longer describe it', async () => {
  const note = noteContentFor('phrase_001', { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.35, threshold: 0.5, ghost: false } as PhraseParams);
  const r = rig(asListNote(note, 'phrase_001')); const a = r.pane();
  const list = extractDescription(r.store.get(PATH)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  assert.ok(list.length >= 1, list.join('|'));
  // the driver's list: the Mix line with its words, then a waiting line
  r.store.set(PATH, editDesc(r.store.get(PATH)!, list[0], `${list[0]} (you said: blend them)\n2. Waiting: sprinkle some magic`));
  await r.touch();
  const applied = r.store.get(PATH)!;
  assert.match(extractDescription(applied), /\(you said: blend them\)/, 'the list keeps the words');
  assert.match(extractDescription(applied), /Waiting: sprinkle some magic/);
  // the script changes the threshold only: the Mix line is the same line
  const recipe = extractRecipeSection(applied) ?? ''; assert.match(recipe, /threshold 0\.50/);
  r.store.set(PATH, editRecipe(applied, 'threshold 0.50', 'threshold 0.30'));
  await r.touch(); assert.ok(msg(a).startsWith(STALE), msg(a));
  await r.click(a, 'update-recipe');
  const after = extractDescription(r.store.get(PATH)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  assert.match(after[0], /^Mix .*\(you said: blend them\)$/, `the words stay with the unchanged line: ${after.join(' | ')}`);
  assert.ok(after.some((l) => /^Threshold 30 percent\.$/.test(l)), `the script's new line is there: ${after.join(' | ')}`);
  assert.equal(after[after.length - 1], 'Waiting: sprinkle some magic', 'the waiting line is kept, at the end');
});

test('3 (e) a Recipe whose params the list\'s sentences do not give back is REFUSED in plain words and NOTHING is written (the Recipe is never lost)', async () => {
  const { rewriteFromScript, UNSAYABLE } = await import('./script-edit-core.ts');
  const start = START(); const edited = editRecipe(start, '8 bars', '6 bars');
  const vault = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] } as any;
  const planned = extractRecipeSection(edited) ?? '';
  const refused = rewriteFromScript(edited, 'phrase_001', 'phrase', vault, planned, () => ['Extend [[bar_007]] to 2 bars, repeating with fills.']);   // sentences that say something else
  assert.equal(refused.ok, false); assert.equal((refused as any).message, UNSAYABLE); assert.equal((refused as any).stale, false);
  assert.match(UNSAYABLE, /kept as it is/);
  const fine = rewriteFromScript(edited, 'phrase_001', 'phrase', vault, planned);
  assert.equal(fine.ok, true);
});

// ---- 2026-11-22-1016: what the mutation pass of this drain found unguarded ---------------------------------------------------------------------------------------------------------------------------------------------
const HELD = '[forge-recipe] held phrase_001: the list no longer matches the script';
test('M1 the held line is said ONCE however often the note is touched, and said AGAIN after the driver answered (Discard) and edited the Recipe again', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  await r.touch(); await r.touch(); await r.touch();
  assert.deepEqual(r.lines, [HELD], 'said once');
  await r.click(a, 'revert');
  assert.equal(r.lines.at(-1), '[forge-recipe] reverted phrase_001 to the json cache', 'Discard is traced in the Recipe\'s words');
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); await r.touch();
  assert.equal(r.lines.filter((l) => l === HELD).length, 2, 'it forgot it was told');
});

test('M2 "Discard my script edits" and "Rewrite the list from the script" that cannot write say why, write nothing, and keep the strip with both buttons (the Recipe is not lost)', async () => {
  const r = rig(); const a = r.pane();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  r.flags.fail = true;
  await r.click(a, 'revert');
  assert.equal(msg(a), 'Discard my script edits: disk full'); assert.deepEqual(buttons(a), ['update-recipe', 'revert']); assert.equal(r.store.get(PATH), edited);
  await r.click(a, 'update-recipe');
  assert.equal(msg(a), 'Update from Recipe: disk full'); assert.equal(r.store.get(PATH), edited);
  r.flags.fail = false;
  // the note changes between the read and the write of a Discard: nothing stale is written
  let fired = false; r.flags.before = (p) => { if (!fired) { fired = true; r.store.set(p, edited + '\n'); } };
  await r.click(a, 'revert');
  assert.equal(msg(a), 'The note changed while you were looking; ask again.'); assert.equal(r.store.get(PATH), edited + '\n');
});

test('M3 undo and redo of a script action say what they did; undo refuses when the Recipe was hand-edited AGAIN since (the list is the same, the note is not): nothing is written and the entry is spent; a failing write says so', async () => {
  const r = rig(); const a = r.pane();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  await r.click(a, 'update-recipe');
  const undone = await r.ctl.undoLast(PATH);
  assert.deepEqual([undone.ok, undone.message], [true, 'Taken back: the note is as it was before the script change.']);
  const redone = await r.ctl.redoLast(PATH);
  assert.deepEqual([redone.ok, redone.message], [true, 'Done again: the script change is back.']);
  // a write that fails on undo
  r.flags.fail = true; const bad = await r.ctl.undoLast(PATH);
  assert.deepEqual([bad.ok, bad.message], [false, 'Undo: disk full']); r.flags.fail = false;
  // the Recipe edited again after the rewrite: the list is as it was left, the note is not
  const r2 = rig(); const b = r2.pane();
  r2.store.set(PATH, editRecipe(r2.store.get(PATH)!, '8 bars', '6 bars')); await r2.touch(); await r2.click(b, 'update-recipe');
  const again = editRecipe(r2.store.get(PATH)!, '6 bars', '4 bars'); r2.store.set(PATH, again);
  const refused = await r2.ctl.undoLast(PATH);
  assert.equal(refused.ok, false); assert.equal(refused.message, 'The note changed since; there is nothing to take back here.');
  assert.equal(r2.store.get(PATH), again, 'nothing was written');
});

test('M4 a rewrite keeps the driver\'s words on a line the script says unchanged even when no waiting line is there (the same number of lines: the marker is the only difference)', async () => {
  const note = noteContentFor('phrase_001', { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.35, threshold: 0.5, ghost: false } as PhraseParams);
  const r = rig(asListNote(note, 'phrase_001')); const a = r.pane();
  const first = extractDescription(r.store.get(PATH)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''))[0];
  r.store.set(PATH, editDesc(r.store.get(PATH)!, first, `${first} (you said: blend them)`)); await r.touch();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, 'threshold 0.50', 'threshold 0.5'));          // a hand edit that says the same music
  await r.touch(); assert.ok(msg(a).startsWith(STALE), msg(a));
  await r.click(a, 'update-recipe');
  assert.match(extractDescription(r.store.get(PATH)!), /\(you said: blend them\)/, 'the words stay');
});

test('M5 script-edit-core: a Recipe that changed since it was planned is STALE (nothing is written); keepLines puts the waiting tail after the script\'s lines; the messages are the ones the strip uses', async () => {
  const { rewriteFromScript, keepLines, staleMessage, heldMessage, ASK_ONCE: ASK, SCRIPT_LABELS } = await import('./script-edit-core.ts');
  const vault = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] } as any;
  const edited = editRecipe(START(), '8 bars', '6 bars');
  const stale = rewriteFromScript(edited, 'phrase_001', 'phrase', vault, 'Take [[bar_007]].\nRepeat it for 3 bars with fills.');
  assert.equal(stale.ok, false); assert.equal((stale as any).stale, true);
  const withWait = edited.replace(extractDescription(edited), `${extractDescription(edited).trimEnd()}\n2. Waiting: w\n`);          // a list the rewrite WOULD change (a waiting line is kept), so a stale plan must still be refused
  const stale2 = rewriteFromScript(withWait, 'phrase_001', 'phrase', vault, 'Take [[bar_007]].\nRepeat it for 3 bars with fills.');
  assert.equal(stale2.ok, false); assert.equal((stale2 as any).stale, true);
  const { canon } = await import('./script-edit-core.ts');
  assert.equal(canon({ b: 2, a: { d: 1, c: [3, { y: 1, x: 2 }] } }), canon({ a: { c: [3, { x: 2, y: 1 }], d: 1 }, b: 2 }), 'the same params in another key order are equal');
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
  assert.deepEqual(keepLines(['A.', 'B.'], ['A. (you said: x)', 'Waiting: w', 'C.']), ['A. (you said: x)', 'B.', 'Waiting: w', 'C.']);
  assert.deepEqual(keepLines(['A.'], ['A.', 'B.']), ['A.'], 'no waiting line: the script says it all');
  assert.equal(staleMessage('8 -> 6 bars'), 'The list no longer matches the script (the Recipe changed: 8 -> 6 bars).');
  assert.equal(staleMessage(''), 'The list no longer matches the script.');
  assert.equal(heldMessage(), 'The list no longer matches the script (your list edit is held until you choose).');
  assert.equal(ASK, ASK_ONCE); assert.deepEqual(Object.values(SCRIPT_LABELS), ['Rewrite the list from the script', 'Discard my script edits', 'Keep my script edits', 'Replace them with the list']);
});

const READ_ONLY = (text: string): string => text.replace('content_type: json', 'content_type: json\nread_only: true');
test('M6 "Discard my script edits" on a note the writer refuses (read_only) says the writer\'s words and writes nothing; the strip stays', async () => {
  const r = rig(); const a = r.pane();
  const edited = READ_ONLY(editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); r.store.set(PATH, edited); await r.touch();
  await r.click(a, 'revert');
  assert.match(msg(a), /read_only|read-only|editable/i, msg(a)); assert.deepEqual(buttons(a), ['update-recipe', 'revert']); assert.equal(r.store.get(PATH), edited); assert.deepEqual(r.writes, []);
});

test('M7 undo of a script action when the note changes between the check and the write: nothing stale is written, the entry is spent (no redo), the words are the ones for a change under the driver; a failing REDO says Redo', async () => {
  const r = rig(); const a = r.pane();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  await r.click(a, 'revert');                                                                                 // Discard: the list before and after are the same list
  const done = r.store.get(PATH)!;
  r.flags.before = (p) => { r.flags.before = undefined; r.store.set(p, `${done}\n`); };                         // the note moves between the controller's read and the write
  const raced = await r.ctl.undoLast(PATH);
  assert.deepEqual([raced.ok, raced.message], [false, 'The note changed while you were looking; ask again.']);
  assert.equal(r.store.get(PATH), `${done}\n`, 'nothing stale was written');
  assert.equal(r.ctl.canRedo(PATH), false, 'the entry is spent: nothing to put back');
  // a failing redo says Redo
  const r2 = rig(); const b = r2.pane();
  r2.store.set(PATH, editRecipe(r2.store.get(PATH)!, '8 bars', '6 bars')); await r2.touch(); await r2.click(b, 'update-recipe');
  assert.equal((await r2.ctl.undoLast(PATH)).ok, true);
  r2.flags.fail = true; const bad = await r2.ctl.redoLast(PATH); r2.flags.fail = false;
  assert.deepEqual([bad.ok, bad.message], [false, 'Redo: disk full']);
});
