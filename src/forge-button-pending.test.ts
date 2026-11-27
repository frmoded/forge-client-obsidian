// 2026-11-23-1018 PART B: a hand edit of the Description of a music list note is NOT replayed by itself any more: the strip says `The Description was edited. Click Forge to apply it.` and its `Forge` button runs today's replay (ONE undo entry carrying the whole
// note; 2026-11-26-1047 (deliberate): a hand-edited Recipe is generated text and is made again, nothing is asked). The setting `Forge Description edits at once` ON (the port says true) restores the automatic replay; a sentence typed in the composer is untouched. Through the REAL controller.
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
const editDesc = (text: string, from: string, to: string): string => { const d = extractDescription(text); assert.ok(d.includes(from), from); return text.replace(d, d.replace(from, to)); };
const editRecipe = (text: string, from: string, to: string): string => { const x = extractRecipeSection(text) ?? ''; assert.ok(x.includes(from), from); return text.replace(x, x.replace(from, to)); };
const PENDING = 'The Description was edited. Click Forge to apply it.';

function rig(opts: { atOnce?: boolean | 'absent'; start?: string } = {}) {
  const store = new Map<string, string>([[PATH, opts.start ?? START()]]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const lines: string[] = [], writes: string[] = [], asked: unknown[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => panes,
    askPlan: async (payload: unknown) => { asked.push(payload); return { status: 500, json: {} }; }, configured: () => true,
    ...(opts.atOnce === 'absent' ? {} : { descriptionAtOnce: () => opts.atOnce === true }),
  };
  const ctl = createDescriptionController(ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 60; i++) await Promise.resolve(); };
  const pane = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PATH, contentEl: el }); return el as HTMLElement; };
  const touch = async () => { ctl.modified(PATH); await advance(DESCRIPTION_DEBOUNCE_MS); };
  return { ctl, store, lines, writes, asked, advance, pane, touch, ports };
}
const msg = (el: HTMLElement): string => el.querySelector('.forge-description-message')?.textContent ?? '';
const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action') ?? '');
const labels = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.textContent ?? '');
const barsOf = (t: string): number => { const r = readPhraseNote(t); return r.ok ? (r.value as { bars: number }).bars : -1; };

test('B1 a hand-edited Description is NOT replayed by itself: nothing is written, the strip says it was edited (muted) with a Forge button (and Revert), the trace says so once, no model is asked', async () => {
  const r = rig(); const a = r.pane();
  const before = r.store.get(PATH)!;
  r.store.set(PATH, editDesc(before, '8 bars', '6 bars'));
  await r.touch(); await r.touch();
  assert.deepEqual(r.writes, [], 'not replayed by itself');
  assert.equal(msg(a), PENDING); assert.deepEqual(buttons(a), ['update', 'revert']); assert.deepEqual(labels(a), ['Forge', 'Revert']);
  assert.equal(a.querySelector('.is-error, .mod-warning'), null, 'muted, never red');
  assert.deepEqual(r.lines, ['[forge-description] held phrase_001: the Description was edited, Forge applies it'], 'said once');
  assert.deepEqual(r.asked, []);
});

test('B2 the Forge button runs today\'s replay: the note is the one the controls make, the strip goes, and it is ONE undo entry that gives the hand-edited note back', async () => {
  const r = rig(); const a = r.pane();
  const edited = editDesc(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  (a.querySelector('[data-action="update"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, [PATH]);
  assert.equal(r.store.get(PATH), asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 6 }), 'phrase_001'));
  assert.equal(a.querySelector('.forge-description-bar'), null);
  assert.deepEqual(r.lines.slice(-1), ['[forge-description] applied phrase_001 (8 -> 6 bars)']);
  const undone = await r.ctl.undoLast(PATH); assert.equal(undone.ok, true, undone.message);
  assert.equal(r.store.get(PATH), edited, 'one undo gives the hand-edited note back');
});

test('B3 the pending mark is in the NOTE, not in memory: a new controller on the same text shows it again', async () => {
  const r = rig(); r.store.set(PATH, editDesc(r.store.get(PATH)!, '8 bars', '6 bars'));
  const second = rig({ start: r.store.get(PATH)! }); const b = second.pane();
  await second.ctl.inspect(PATH);
  assert.equal(msg(b), PENDING); assert.deepEqual(second.writes, []);
});

test('B4 the setting `Forge Description edits at once` ON restores the automatic replay; with no setting port (the unit rigs, lean) the replay is automatic too', async () => {
  for (const atOnce of [true, 'absent'] as const) {
    const r = rig({ atOnce }); r.pane();
    r.store.set(PATH, editDesc(r.store.get(PATH)!, '8 bars', '6 bars')); await r.touch();
    assert.deepEqual(r.writes, [PATH], String(atOnce));
    assert.equal(barsOf(r.store.get(PATH)!), 6);
  }
});

test('B5 when the Recipe holds edits too, nothing is asked: the strip offers Forge for the Description, and Forge makes the Recipe again from it (one undo gives both edits back)', async () => {          // 2026-11-26-1047 (deliberate): was the ask-once of 1016
  const r = rig(); const a = r.pane();
  const both = editDesc(editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars'); r.store.set(PATH, both); await r.touch();
  assert.deepEqual(r.writes, []); assert.equal(msg(a), PENDING); assert.deepEqual(buttons(a), ['update', 'revert']);
  (a.querySelector('[data-action="update"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(r.store.get(PATH), asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 5 }), 'phrase_001'));
  assert.equal((await r.ctl.undoLast(PATH)).ok, true); assert.equal(r.store.get(PATH), both);
});

test('B6 a Description the grammar cannot read is still said as before (the line and the column; Revert), not as a pending Forge', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editDesc(r.store.get(PATH)!, '8 bars', '8 barz')); await r.touch();
  assert.match(msg(a), /^Description, line 1, column \d+:/); assert.ok(!buttons(a).includes('update'));
});
