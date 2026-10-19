// Drain 2026-10-20-2100 — the embed's "not saved" hint is a STATE, not a label: it shows only while the embed's data differs from the note as it is on disk.
//
// The driver, on the deployed Iteration 87 build: "can not see how to remove the not saved thing / change its state". It was always there next to Reset, so it read as a status that
// should be changeable, and nothing changed it. Now:
//   * the host decides pristine/dirty by COMPARING the widget's current data with the data it loaded from the note (rhythmDataEqual — one function, one source of truth), after every
//     edit, not by remembering that an edit happened: an edit undone by hand is pristine again; Reset and "Updated from note" load the note, so they are pristine too;
//   * the hint (visibility, not display: no layout shift) and an enabled Reset appear only while dirty;
//   * the full sentence stays in the tooltip / accessible name of both Reset and the hint.
// Real data throughout: the shipped tresillo note from the music-theory vault.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  MSG_CURRENT_DATA, MSG_EDITED, MSG_LOAD, MSG_READY, MSG_REQUEST_DATA, MSG_RESET, formatRhythmJson, readRhythmNote, rhythmDataEqual, type RhythmData,
} from './rhythm-edit-core.ts';
import { createRhythmEmbedSession, embedToolbarItems, embedToolbarState, PLAYGROUND_SENTENCE } from './rhythm-embed-core.ts';
import { readVaultFile } from './test-support/vault-source.ts';

const SRC = path.resolve(import.meta.dirname);
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const TRESILLO_TEXT = readVaultFile('music-theory', 'rhythm_data/rhythm_pattern_tresillo.md')!;
const parsed = readRhythmNote(TRESILLO_TEXT);
assert.ok(parsed.ok, 'the shipped tresillo note must be valid rhythm data');
const TRESILLO: RhythmData = (parsed as { ok: true; value: { data: RhythmData } }).value.data;
const clone = (d: RhythmData): RhythmData => JSON.parse(JSON.stringify(d));
const withCell = (d: RhythmData, ch: string, i: number, v: boolean | number): RhythmData => { const c = clone(d); (c.channels as Record<string, Array<boolean | number>>)[ch][i] = v; return c; };
const firstChannel = Object.keys(TRESILLO.channels)[0];
const noteText = (d: RhythmData) => TRESILLO_TEXT.replace(/```json\n[\s\S]*?\n```/, '```json\n' + formatRhythmJson(d) + '\n```');

// ---- the ONE comparison -----------------------------------------------------------------------------------------------------------------

test('rhythmDataEqual: the same data is equal; any musical difference is not — one cell, tempo, swing, meter, grid, an added or removed or REORDERED instrument', () => {
  assert.equal(rhythmDataEqual(TRESILLO, clone(TRESILLO)), true);
  const cell = TRESILLO.channels[firstChannel][1];
  assert.equal(rhythmDataEqual(TRESILLO, withCell(TRESILLO, firstChannel, 1, !cell)), false, 'one cell');
  assert.equal(rhythmDataEqual(TRESILLO, { ...clone(TRESILLO), tempo_bpm: TRESILLO.tempo_bpm + 1 }), false, 'tempo');
  assert.equal(rhythmDataEqual(TRESILLO, { ...clone(TRESILLO), swing_pct: (TRESILLO.swing_pct ?? 0) + 10 }), false, 'swing');
  assert.equal(rhythmDataEqual(TRESILLO, { ...clone(TRESILLO), time_signature: '3/4' }), false, 'meter');
  assert.equal(rhythmDataEqual(TRESILLO, { ...clone(TRESILLO), group_size: 2 }), false, 'group size');
  const more = clone(TRESILLO); (more.channels as Record<string, boolean[]>).bell = new Array(TRESILLO.steps).fill(false);
  assert.equal(rhythmDataEqual(TRESILLO, more), false, 'an instrument added');
});

test('rhythmDataEqual: an instrument removed, and the ORDER of the instruments, are differences (a real three-instrument note: the straight rock)', () => {
  const rock = readRhythmNote(readVaultFile('music-theory', 'rhythm_data/rhythm_pattern_straight_rock.md')!);
  assert.ok(rock.ok);
  if (rock.ok === false) return;
  const data = rock.value.data;
  const names = Object.keys(data.channels);
  assert.ok(names.length >= 3, 'the premise: a note with several instruments (the tresillo has one, which cannot show an order)');
  const fewer = clone(data); delete (fewer.channels as Record<string, unknown>)[names[names.length - 1]];
  assert.equal(rhythmDataEqual(data, fewer), false, 'an instrument removed');
  const swapped: RhythmData = { ...clone(data), channels: Object.fromEntries([...names].reverse().map((n) => [n, data.channels[n]])) };
  assert.equal(rhythmDataEqual(data, swapped), false, 'the order of the instruments is data (it is the order of the note\'s channels): a ring moved out and back in is pristine, moved and left is not');
  assert.equal(rhythmDataEqual(data, { ...clone(data) }), true, 'NON-VACUITY: the same note in the same order is equal');
});

test('rhythmDataEqual: velocity matters (a plain hit is not an accent), but 0 and false are the same rest, and an omitted swing is 0', () => {
  const hit = TRESILLO.channels[firstChannel].findIndex((v) => v === true);
  assert.ok(hit >= 0);
  assert.equal(rhythmDataEqual(TRESILLO, withCell(TRESILLO, firstChannel, hit, 110)), false, 'true vs 110');
  const rest = TRESILLO.channels[firstChannel].findIndex((v) => v === false);
  assert.equal(rhythmDataEqual(TRESILLO, withCell(TRESILLO, firstChannel, rest, 0)), true, 'false vs 0');
  const noSwing = clone(TRESILLO) as Partial<RhythmData> & Record<string, unknown>; delete noSwing.swing_pct;
  assert.equal(rhythmDataEqual({ ...TRESILLO, swing_pct: 0 }, noSwing as RhythmData), true, 'swing omitted = 0');
});

test('rhythmDataEqual: data that is not valid rhythm data (null, a string, a missing field, a wrong-length row) is never equal to anything — the caller then says "not saved"', () => {
  for (const bad of [null, undefined, 'x', 42, {}, { ...TRESILLO, steps: 'sixteen' }, { ...clone(TRESILLO), channels: { [firstChannel]: [true] } }]) {
    assert.equal(rhythmDataEqual(TRESILLO, bad as never), false, JSON.stringify(bad)?.slice(0, 40));
  }
});

// ---- the toolbar state ---------------------------------------------------------------------------------------------------------------

test('toolbar state: pristine = hint hidden and Reset disabled; dirty = hint shown and Reset enabled; the sentence is in BOTH tooltips and BOTH accessible names in BOTH states', () => {
  const pristine = embedToolbarState(false), dirty = embedToolbarState(true);
  assert.deepEqual([pristine.hintHidden, pristine.resetDisabled], [true, true]);
  assert.deepEqual([dirty.hintHidden, dirty.resetDisabled], [false, false]);
  assert.equal(PLAYGROUND_SENTENCE, 'This embed is a playground: edits are not saved to the note; Open note to edit it.');
  for (const s of [pristine, dirty]) {
    for (const t of [s.resetTitle, s.resetAriaLabel, s.hintTitle, s.hintAriaLabel]) assert.ok(t.includes(PLAYGROUND_SENTENCE), t);
    assert.match(s.resetAriaLabel, /^Reset/, 'the accessible name starts with the visible text');
  }
  assert.notEqual(pristine.resetTitle, dirty.resetTitle, 'the tooltip says what Reset will do NOW');
  assert.match(pristine.resetTitle, /nothing to reset/i);
  assert.match(dirty.resetTitle, /as it is in the note/i);
});

test('the toolbar model still lists Open note, Score, Reset, the hint — in that order — and the hint text is unchanged', () => {
  assert.deepEqual(embedToolbarItems({ music: true }).map((i) => i.id), ['open-note', 'score', 'reset', 'hint']);
  assert.equal(embedToolbarItems({ music: true }).find((i) => i.id === 'hint')!.text, 'not saved');
});

// ---- the session: dirty is COMPUTED from the data ------------------------------------------------------------------------------------

function makeSession(over: { text?: () => string } = {}) {
  let text = noteText(TRESILLO);
  const posted: Array<Record<string, unknown>> = [];
  const dirtyLog: boolean[] = [];
  const log = { updated: 0, errors: 0, timers: [] as Array<() => void> };
  const session = createRhythmEmbedSession({
    noteName: 'rhythm_pattern_tresillo', title: 't', resetInHost: true,
    readNote: async () => (over.text ? over.text() : text),
    post: (m) => { posted.push(m); }, openNote: () => {}, onPlaying: () => {},
    showUpdated: () => { log.updated++; }, showError: () => { log.errors++; },
    onDirtyChange: (d) => { dirtyLog.push(d); },
    setTimer: (fn) => { log.timers.push(fn); return log.timers.length; }, clearTimer: () => {},
  });
  const requests = () => posted.filter((m) => m.type === MSG_REQUEST_DATA).length;
  /** The widget answers the host's request for its current data. */
  const answer = async (data: unknown) => { await session.onWidgetMessage({ type: MSG_CURRENT_DATA, data }); await Promise.resolve(); await Promise.resolve(); };
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { session, posted, dirtyLog, log, requests, answer, settle, setText: (t: string) => { text = t; } };
}

test('a fresh load is PRISTINE: nothing is dirty, and the view is told so (so it starts quiet)', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  assert.equal(t.session.isDirty(), false);
  assert.deepEqual(t.dirtyLog, [false]);
});

test('EDIT then UNDO: an edit makes it dirty (compared with the loaded note), the same edit undone by hand makes it pristine again', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  const hit = TRESILLO.channels[firstChannel].findIndex((v) => v === false);
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  assert.equal(t.requests(), 1, 'an edit asks the widget for its current data — it does not assume');
  await t.answer(withCell(TRESILLO, firstChannel, hit, true));
  assert.equal(t.session.isDirty(), true);
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer(clone(TRESILLO));                                    // the student clicked the same cell again
  assert.equal(t.session.isDirty(), false, 'an edit undone is pristine again');
  assert.deepEqual(t.dirtyLog, [false, true, false]);
});

test('every kind of edit counts the same way — the session only compares data: tempo, meter, an added instrument all read as dirty', async () => {
  for (const edited of [{ ...clone(TRESILLO), tempo_bpm: 90 }, { ...clone(TRESILLO), swing_pct: 40 }, { ...clone(TRESILLO), time_signature: '3/4', steps: 12 }]) {
    const t = makeSession();
    await t.session.onWidgetMessage({ type: MSG_READY });
    await t.session.onWidgetMessage({ type: MSG_EDITED });
    await t.answer(edited);
    assert.equal(t.session.isDirty(), true, JSON.stringify(edited).slice(0, 60));
  }
});

test('RESET: a dirty embed is pristine after the host\'s reset (it loads the note), and the view is told', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer({ ...clone(TRESILLO), tempo_bpm: 60 });
  assert.equal(t.session.isDirty(), true);
  await t.session.reset();
  assert.equal(t.session.isDirty(), false);
  assert.equal(t.dirtyLog.at(-1), false);
  // and the widget's own Reset message (an older widget) is the same path
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer({ ...clone(TRESILLO), tempo_bpm: 61 });
  assert.equal(t.session.isDirty(), true);
  await t.session.onWidgetMessage({ type: MSG_RESET });
  assert.equal(t.session.isDirty(), false);
});

test('"UPDATED FROM NOTE": the note changed on disk while the embed was dirty -> it reloads, says so, and is pristine against the NEW note', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer({ ...clone(TRESILLO), tempo_bpm: 60 });
  assert.equal(t.session.isDirty(), true);
  const changed = { ...clone(TRESILLO), tempo_bpm: 77 };
  t.setText(noteText(changed));
  await t.session.onNoteModified();
  assert.equal(t.log.updated, 1);
  assert.equal(t.session.isDirty(), false);
  assert.deepEqual(t.posted.filter((m) => m.type === MSG_LOAD).at(-1)?.data, changed);
  // the baseline moved: the widget showing the NEW note is pristine, the OLD note is now a difference
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer(clone(changed));
  assert.equal(t.session.isDirty(), false);
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  await t.answer(clone(TRESILLO));
  assert.equal(t.session.isDirty(), true, 'the old tresillo now differs from the (changed) note');
});

test('a burst of edits (a slider) asks for the data at most twice — one in flight, one more at the end — and the LAST answer decides', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  for (let i = 0; i < 8; i++) await t.session.onWidgetMessage({ type: MSG_EDITED });
  assert.equal(t.requests(), 1, 'one check in flight; the others coalesce');
  await t.answer({ ...clone(TRESILLO), swing_pct: 40 });
  assert.equal(t.requests(), 2, 'one more to see the final state');
  await t.answer(clone(TRESILLO));                                     // the slider came back to where it started
  assert.equal(t.session.isDirty(), false);
  assert.equal(t.requests(), 2);
});

test('a late answer from BEFORE a reload does not undo the reload: Reset while a check is in flight leaves the embed pristine', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  await t.session.onWidgetMessage({ type: MSG_EDITED });               // a check is in flight
  await t.session.reset();                                             // the student presses Reset before the widget answered
  assert.equal(t.session.isDirty(), false);
  await t.answer({ ...clone(TRESILLO), tempo_bpm: 60 });                // the widget's answer about the state it HAD
  await t.settle();
  assert.equal(t.session.isDirty(), false, 'the reload said pristine; a stale answer must not say otherwise');
  assert.equal(t.dirtyLog.includes(true), false);
});

test('FAIL SAFE: if the widget does not answer, or answers with nothing, the embed is called dirty (we cannot prove it matches the note)', async () => {
  const silent = makeSession();
  await silent.session.onWidgetMessage({ type: MSG_READY });
  await silent.session.onWidgetMessage({ type: MSG_EDITED });
  for (const fire of silent.log.timers.splice(0)) fire();            // the 2 s request timeout
  await silent.settle();
  assert.equal(silent.session.isDirty(), true);
  const empty = makeSession();
  await empty.session.onWidgetMessage({ type: MSG_READY });
  await empty.session.onWidgetMessage({ type: MSG_EDITED });
  await empty.answer(null);
  assert.equal(empty.session.isDirty(), true);
});

test('after dispose nothing is reported (the embed is gone)', async () => {
  const t = makeSession();
  await t.session.onWidgetMessage({ type: MSG_READY });
  await t.session.onWidgetMessage({ type: MSG_EDITED });
  t.session.dispose();
  const n = t.dirtyLog.length;
  await t.answer({ ...clone(TRESILLO), tempo_bpm: 60 });
  await t.settle();
  assert.equal(t.dirtyLog.length, n);
});

// ---- the view and the style: a state with NO layout shift ---------------------------------------------------------------------------------

// These pin the MECHANISM (the view applies embedToolbarState from onDirtyChange; the hint is hidden with `visibility`, never `display`, so the row does not move). If the view is
// restructured they SHOULD go red — reassess, don't just rewrite. The behaviour — one line at 460 px, buttons in the same place in both states — is the Chromium measurement in the FEEDBACK.
test('mechanism pin: the session decides by comparison (no "an edit happened" flag), and the view applies the state from it', () => {
  const core = read('rhythm-embed-core.ts');
  assert.match(core, /const next = !rhythmDataEqual\(baseline, current\);\s*if \(next !== dirty\) \{ dirty = next;/);
  assert.doesNotMatch(core, /case 'edited': dirty = true/);
  const view = read('rhythm-embed-view.ts');
  assert.match(view, /onDirtyChange: \(dirty\) => \{ this\.applyDirty\(dirty\); \}/);
  assert.match(view, /private applyDirty\(dirty: boolean\)/);
  assert.match(view, /embedToolbarState\(dirty\)/);
  assert.match(view, /this\.applyDirty\(false\);\s*\/\/ pristine until the first edit/, 'quiet from the first paint, before any load answers');
});

const CSS = fs.readFileSync(path.resolve(SRC, '..', 'styles.css'), 'utf8');
const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()), body: m[2] }));
const rulesFor = (sel: string) => rules.filter((r) => r.selectors.includes(sel));
const decl = (body: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim();

test('NO LAYOUT SHIFT: the quiet hint is `visibility: hidden` (it keeps its room), never `display: none`; a disabled Reset is visibly quiet', () => {
  const quiet = rulesFor('.forge-rhythm-embed-hint.forge-rhythm-embed-quiet');
  assert.equal(quiet.length, 1);
  assert.equal(decl(quiet[0].body, 'visibility'), 'hidden');
  assert.equal(decl(quiet[0].body, 'display'), undefined);
  const reset = rulesFor('.forge-rhythm-embed-toolbar button:disabled');
  assert.equal(reset.length, 1);
  assert.match(decl(reset[0].body, 'opacity') ?? '', /^0?\.\d+$/);
  assert.match(decl(reset[0].body, 'cursor') ?? '', /default|not-allowed/);
});

test('the view toggles exactly that class and the disabled state', () => {
  const view = read('rhythm-embed-view.ts');
  const m = /private applyDirty\(dirty: boolean\): void \{[\s\S]*?\n  \}\n/.exec(view);
  assert.ok(m);
  assert.match(m![0], /toggleClass\('forge-rhythm-embed-quiet', state\.hintHidden\)/);
  assert.match(m![0], /\.disabled = state\.resetDisabled/);
  assert.match(m![0], /setAttribute\('aria-label', state\.hintAriaLabel\)/);
  assert.match(m![0], /setAttribute\('aria-hidden', state\.hintHidden \? 'true' : 'false'\)/);
});
