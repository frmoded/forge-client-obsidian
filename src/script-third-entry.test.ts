// 2026-11-22-1016 and 2026-11-23-1023, as they stand since 2026-11-26-1047 (deliberate): the script (Recipe and Python) is NOT an entry point any more, so the stale strip, the rewrite, the discard and the ask-once question (1016) and their tests are gone. What stays here: the Forge button
// (1023, always there: "apply the Description now") and the ONE undo entry its write is (the whole note before and after), also when what it wrote over was a hand edit of the Recipe. Through the REAL controller. No model call.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const START = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');
const editDesc = (text: string, from: string, to: string): string => { const d = extractDescription(text); assert.ok(d.includes(from), `the Description has "${from}"`); return text.replace(d, d.replace(from, to)); };
const editRecipe = (text: string, from: string, to: string): string => { const x = extractRecipeSection(text) ?? ''; assert.ok(x.includes(from), `the Recipe has "${from}"`); return text.replace(x, x.replace(from, to)); };
const LINE = 'This Recipe/Python is generated. Edit the Description, or Detach.';

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

test('3 (c) reload: a new controller on the same note says the one line about the hand-edited Recipe again (the stamps are in the note; an OK is not remembered across a restart)', async () => {          // 2026-11-26-1047 (deliberate): was "finds the Recipe edit still marked"
  const r = rig(); r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  const second = rig(r.store.get(PATH)!); const b = second.pane();
  await second.ctl.inspect(PATH);
  assert.equal(msg(b), LINE);
  assert.deepEqual(second.writes, []);
});

/** A hand-edited Recipe, then the Forge button: the Description replayed over it, one undo entry that carries both whole notes. */
const forgedOver = async () => { const r = rig(); const a = r.pane(); const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch(); assert.equal((await r.ctl.forge(PATH)).wrote, true); await r.advance(1); return { r, a, edited }; };

test('M3 undo and redo of a Forge write say what they did; undo refuses when the Recipe was hand-edited AGAIN since (the list is the same, the note is not): nothing is written and the entry is spent; a failing write says so', async () => {          // 2026-11-26-1047 (deliberate): the write was the rewrite from the script
  const { r } = await forgedOver();
  const undone = await r.ctl.undoLast(PATH);
  assert.deepEqual([undone.ok, undone.message], [true, 'Taken back: the note is as it was before the Recipe change.']);          // 2026-11-23-1022 (deliberate): the Description and Recipe wording
  const redone = await r.ctl.redoLast(PATH);
  assert.deepEqual([redone.ok, redone.message], [true, 'Done again: the Recipe change is back.']);          // 2026-11-23-1022 (deliberate): the Description and Recipe wording
  // a write that fails on undo
  r.flags.fail = true; const bad = await r.ctl.undoLast(PATH);
  assert.deepEqual([bad.ok, bad.message], [false, 'Undo: disk full']); r.flags.fail = false;
  // the Recipe edited again after the Forge: the list is as it was left, the note is not
  const two = await forgedOver();
  const again = editRecipe(two.r.store.get(PATH)!, '8 bars', '4 bars'); two.r.store.set(PATH, again);
  const refused = await two.r.ctl.undoLast(PATH);
  assert.equal(refused.ok, false); assert.equal(refused.message, 'The note changed since; there is nothing to take back here.');
  assert.equal(two.r.store.get(PATH), again, 'nothing was written');
});

const READ_ONLY = (text: string): string => text.replace('content_type: json', 'content_type: json\nread_only: true');
test('M6 Forge on a note the writer refuses (read_only) with a hand-edited Recipe says the writer\'s words and writes nothing', async () => {          // 2026-11-26-1047 (deliberate): was "Discard my Recipe edits"
  const r = rig(); const a = r.pane();
  const edited = READ_ONLY(editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); r.store.set(PATH, edited); await r.touch();
  assert.equal(msg(a), LINE);
  const out = await r.ctl.forge(PATH);
  assert.equal(out.ok, false); assert.match(out.message, /read_only|read-only|editable/i, out.message); assert.equal(r.store.get(PATH), edited); assert.deepEqual(r.writes, []);
});

test('M7 undo of a Forge write when the note changes between the check and the write: nothing stale is written, the entry is spent (no redo), the words are the ones for a change under the driver; a failing REDO says Redo', async () => {          // 2026-11-26-1047 (deliberate): was the undo of a script action
  const { r } = await forgedOver();
  const done = r.store.get(PATH)!;
  r.flags.before = (p) => { r.flags.before = undefined; r.store.set(p, `${done}\n`); };                         // the note moves between the controller's read and the write
  const raced = await r.ctl.undoLast(PATH);
  assert.deepEqual([raced.ok, raced.message], [false, 'The note changed while you were looking; ask again.']);
  assert.equal(r.store.get(PATH), `${done}\n`, 'nothing stale was written');
  assert.equal(r.ctl.canRedo(PATH), false, 'the entry is spent: nothing to put back');
  // a failing redo says Redo
  const two = await forgedOver();
  assert.equal((await two.r.ctl.undoLast(PATH)).ok, true);
  two.r.flags.fail = true; const bad = await two.r.ctl.redoLast(PATH); two.r.flags.fail = false;
  assert.deepEqual([bad.ok, bad.message], [false, 'Redo: disk full']);
});

// ---- 2026-11-23-1023 (Part A): the Forge button is ALWAYS there: `ctl.forge(path)` = "apply the Description now", whatever the note's state; no model call -----------------------------------------------------------------------------------------
const withRedraw = (r: ReturnType<typeof rig>): string[] => { const redraws: string[] = []; r.ports.redraw = (p: string) => { redraws.push(p); }; return redraws; };

test('1023 F1 Forge with NOTHING pending replays the Description: if the note comes out byte-identical nothing is written and no undo entry is made, the Score is redrawn anyway, the dialog says `Forged. Nothing changed.`, no model call', async () => {
  const r = rig(); const a = r.pane(); const redraws = withRedraw(r);
  const start = r.store.get(PATH)!;
  const out = await r.ctl.forge(PATH);
  assert.deepEqual(r.writes, [], 'nothing written'); assert.equal(r.store.get(PATH), start);
  assert.deepEqual([out.ok, out.wrote, out.message], [true, false, 'Forged. Nothing changed.']);
  assert.deepEqual(redraws, [PATH], 'the Score is redrawn');
  assert.match((await r.ctl.undoLast(PATH)).message, /^Removed: /, 'no script entry was pushed: Cmd/Ctrl+Z still just takes the last sentence off the list');
  assert.equal(a.querySelector('.forge-description-bar'), null, 'no strip');
  assert.deepEqual(r.asked, [], 'no model call');
});

test('1023 F2 Forge on a PENDING Description edit is the 1018 button: the Description is applied (Recipe and Python follow), ONE undo entry gives the hand edit back', async () => {
  const r = rig(); const a = r.pane(); r.ports.descriptionAtOnce = () => false; const redraws = withRedraw(r);
  const start = r.store.get(PATH)!;
  const edited = editDesc(start, '8 bars', '5 bars'); r.store.set(PATH, edited); await r.touch();
  assert.deepEqual(r.writes, [], 'waiting for Forge'); assert.deepEqual(labels(a), ['Forge', 'Revert']);
  const out = await r.ctl.forge(PATH);
  assert.equal(out.ok, true); assert.equal(out.wrote, true);
  assert.equal(r.store.get(PATH), asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 5 }), 'phrase_001'));
  assert.equal(r.writes.length, 1, 'one write'); assert.equal(a.querySelector('.forge-description-bar'), null, 'the strip is gone');
  assert.equal((await r.ctl.undoLast(PATH)).ok, true); assert.equal(r.store.get(PATH), edited, 'one undo gives the hand edit back');
  assert.deepEqual(r.asked, []); void redraws;
});

test('1023 F4 Forge on a Description the grammar cannot read, or on a note that is not a list note, writes nothing and says why; the strip stays as it was', async () => {
  const r = rig(); const a = r.pane(); r.ports.descriptionAtOnce = () => false;
  const start = r.store.get(PATH)!;
  const bad = editDesc(start, '8 bars', 'eight lovely bars'); r.store.set(PATH, bad); await r.touch();
  const before = msg(a); assert.ok(before.length > 0);
  const out = await r.ctl.forge(PATH);
  assert.deepEqual(r.writes, []); assert.equal(out.ok, false); assert.equal(out.wrote, false); assert.ok(out.message.length > 0);
  assert.equal(msg(a), before, 'the strip is as it was');
  const bar = await r.ctl.forge('bars/bar_001.md'); assert.equal(bar.ok, false); assert.equal(bar.wrote, false);
  const other = await r.ctl.forge('notes/x.md'); assert.equal(other.ok, false);
});
