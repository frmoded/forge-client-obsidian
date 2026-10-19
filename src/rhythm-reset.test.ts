// Drain 2026-10-18-1800 §1 — "resetting the tresillo note, the widget is not reset". The driver's wording is ambiguous, so every reading is
// tested with the REAL `rhythm_pattern_tresillo` bytes and a 3/4 edit of it (the edit that actually happened to that note in the driver's
// checkout, which they then reverted with `git checkout`):
//   (a) the embed's Reset button: pattern, meter, tempo, swing and instruments all come back, in grid AND circle view;
//   (b) the note changes on disk while an embed holds local edits, then is restored: the warning, and what Reset loads;
//   (c) the Beat Box tab when the note is restored underneath it.
// Widget half: the real page in happy-dom (rhythm-widget-harness). Host half: the pure session (rhythm-embed-core / rhythm-edit-core).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadWidget, skip, type Harness } from './test-support/rhythm-widget-harness.ts';
import { MSG_LOAD, MSG_READY, MSG_RESET, RhythmNoteSession, contentFingerprint, formatRhythmJson, modifyRecovery, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { createRhythmEmbedSession, shouldRerenderAfterModify } from './rhythm-embed-core.ts';

const NOTE_PATH = path.resolve(import.meta.dirname, '..', 'assets', 'vaults', 'music-theory', 'rhythm_data', 'rhythm_pattern_tresillo.md');
const TRESILLO_TEXT = fs.readFileSync(NOTE_PATH, 'utf8');
const parsed = readRhythmNote(TRESILLO_TEXT);
assert.ok(parsed.ok, 'the shipped tresillo note must be valid rhythm data');
const TRESILLO: RhythmData = (parsed as { ok: true; value: { data: RhythmData } }).value.data;

const K = (hits: number[], n: number) => Array.from({ length: n }, (_, i) => hits.includes(i));
/** The 3/4 edit the driver's checkout actually held (12 steps, three channels). */
const TRESILLO_34: RhythmData = {
  time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: { kick: K([0, 4, 8], 12), hihat: K([4, 8, 11], 12), conga_high: K([1, 4, 8], 12) },
};
const textOf = (d: RhythmData) => TRESILLO_TEXT.replace(/```json\n[\s\S]*?\n```/, '```json\n' + formatRhythmJson(d) + '\n```');

test('the premise: the shipped tresillo is a 4/4, 16-step, one-channel note, and the 3/4 edit differs from it in every way that matters', () => {
  assert.equal(TRESILLO.time_signature, '4/4');
  assert.equal(TRESILLO.steps, 16);
  assert.deepEqual(Object.keys(TRESILLO.channels), ['kick']);
  assert.notDeepEqual(TRESILLO_34, TRESILLO);
  assert.ok(readRhythmNote(textOf(TRESILLO_34)).ok, 'and the edited text is valid rhythm data');
});

// ======================================================================================================================
// (a) the Reset button, widget half
// ======================================================================================================================

const load = (d: RhythmData, mode?: string) => ({ type: MSG_LOAD, data: d, noteName: 'rhythm_pattern_tresillo', ...(mode ? { mode } : {}) });
const types = (h: Harness, t: string) => h.posted.filter((m) => m && m.type === t);
async function current(h: Harness): Promise<RhythmData> {
  const n = types(h, 'forge-rhythm-current-data').length;
  await h.send({ type: 'forge-rhythm-request-data' });
  const msgs = types(h, 'forge-rhythm-current-data');
  assert.equal(msgs.length, n + 1, 'the widget answered the read');
  return msgs.at(-1).data;
}
const choose = (h: Harness, id: string, value: string) => { const sel = h.el(id); sel.value = value; sel.dispatchEvent(new h.win.Event('change', { bubbles: true })); };
async function playground(d: RhythmData, view?: 'circle' | 'grid'): Promise<Harness> {
  const h = await loadWidget(true);
  await h.send({ ...load(d, 'playground'), ...(view ? { view } : {}) });
  return h;
}

/** Change everything a student can change in an embed: cells, tempo, swing, an added instrument, and (last) the meter. */
async function scribble(h: Harness) {
  h.cell('kick', 1).click();
  for (let i = 0; i < 5; i++) h.el('bBpmUp').click();
  const swing = h.el('swing'); swing.value = '60'; swing.dispatchEvent(new h.win.Event('input', { bubbles: true }));
  choose(h, 'addInstrument', 'bell');
}

for (const view of ['grid', 'circle'] as const) {
  test(`(a) Reset in ${view} view: the note comes back exactly — pattern, tempo, swing and instruments`, { skip }, async () => {
    const h = await playground(TRESILLO, view);
    assert.deepEqual(await current(h), TRESILLO, 'the premise: loaded as saved');
    await scribble(h);
    assert.notDeepEqual(await current(h), TRESILLO, 'the premise: it was changed');
    h.el('bReset').click();
    assert.equal(types(h, 'forge-rhythm-reset').length, 1, 'and the host is asked to re-read the note');
    assert.deepEqual(await current(h), TRESILLO);
    assert.equal(h.el(view === 'circle' ? 'circleView' : 'gridView').hidden, false, 'Reset does not change the view');
    assert.equal(h.el('bpmVal').textContent, '100 BPM');
    assert.equal(h.el('swingVal').textContent, '0%');
  });

  test(`(a) Reset in ${view} view after a METER change to 3/4: back to 4/4 with sixteen steps and one ring/row`, { skip }, async () => {
    const h = await playground(TRESILLO, view);
    choose(h, 'timeSig', '3/4');
    assert.equal((await current(h)).time_signature, '3/4', 'the premise: the meter changed (and the pattern was cleared)');
    h.el('bReset').click();
    assert.deepEqual(await current(h), TRESILLO);
    assert.equal(h.el('timeSig').value, '4/4');
    assert.equal(h.doc.querySelectorAll('#grid .step').length, 16, 'sixteen grid cells for the one row');
    if (view === 'circle') {
      assert.equal(h.doc.querySelectorAll('#circle circle.dot').length, 16, 'sixteen dots on the one ring');
      assert.equal(h.doc.querySelectorAll('#ringLegend .ring-pick').length, 1);
      assert.equal(h.doc.querySelectorAll('#circle circle.dot.hit').length, 3, 'the tresillo\'s three hits');
    }
  });
}

test('(a) Reset twice, and Reset with nothing changed, are no-ops on the data (idempotent)', { skip }, async () => {
  const h = await playground(TRESILLO, 'circle');
  h.el('bReset').click();
  assert.deepEqual(await current(h), TRESILLO);
  await scribble(h);
  h.el('bReset').click(); h.el('bReset').click();
  assert.deepEqual(await current(h), TRESILLO);
});

test('(b) the host answers Reset with a FRESH load (the note changed meanwhile): the widget ends on the NEW note and RE-BASELINES to it', { skip }, async () => {
  const h = await playground(TRESILLO, 'grid');
  await scribble(h);
  h.el('bReset').click();                              // the widget shows its OLD baseline at once, then asks the host...
  await h.send(load(TRESILLO_34, 'playground'));       // ...which re-reads the note (now the 3/4 edit) and answers
  assert.deepEqual(await current(h), TRESILLO_34, 'the new note, not the stale baseline');
  assert.equal(h.el('timeSig').value, '3/4');
  h.cell('kick', 0).click();                           // a new local edit
  assert.notDeepEqual(await current(h), TRESILLO_34);
  h.el('bReset').click();                              // and a SECOND Reset, with no host answer yet, must restore the NEW baseline
  assert.deepEqual(await current(h), TRESILLO_34, 'not the 4/4 the embed first loaded');
});

test('(b) and back again: a load of the original note after the 3/4 one restores the original completely, ring list and meter included', { skip }, async () => {
  const h = await playground(TRESILLO_34, 'circle');
  assert.equal(h.doc.querySelectorAll('#ringLegend .ring-pick').length, 3);
  await h.send(load(TRESILLO, 'playground'));
  assert.deepEqual(await current(h), TRESILLO);
  assert.equal(h.doc.querySelectorAll('#ringLegend .ring-pick').length, 1);
  assert.equal(h.doc.querySelectorAll('#circle circle.dot').length, 16);
  assert.equal(h.el('timeSig').value, '4/4');
  assert.deepEqual([...h.el('addInstrument').options].map((o: any) => o.value).slice(0, 2), ['', 'snare'], 'the Add menu offers what is NOT shown now');
});

// ======================================================================================================================
// (b) the embed session: the note changes on disk under an embed that holds local edits
// ======================================================================================================================

function embedSession(initial: string) {
  let text = initial;
  const posted: any[] = [];
  const log = { updated: 0, errors: [] as string[] };
  const session = createRhythmEmbedSession({
    noteName: 'rhythm_pattern_tresillo', title: 't', readNote: async () => text, post: (m) => { posted.push(m); }, openNote: () => {},
    onPlaying: () => {}, showUpdated: () => { log.updated++; }, showError: (m) => { log.errors.push(m); }, setTimer: () => 0, clearTimer: () => {},
  });
  return { session, posted, log, setText: (t: string) => { text = t; }, loads: () => posted.filter((m) => m.type === MSG_LOAD) };
}

test('(b) a CLEAN embed follows the note both ways: edited on disk -> reloads; restored on disk -> reloads again', async () => {
  const e = embedSession(TRESILLO_TEXT);
  await e.session.onWidgetMessage({ type: MSG_READY });
  assert.equal(e.loads().length, 1);
  e.setText(textOf(TRESILLO_34)); await e.session.onNoteModified();
  assert.equal(e.loads().length, 2);
  assert.equal(e.loads().at(-1).data.time_signature, '3/4');
  e.setText(TRESILLO_TEXT); await e.session.onNoteModified();                // `git checkout -- rhythm_data/rhythm_pattern_tresillo.md`
  assert.equal(e.loads().length, 3, 'the revert reaches the widget');
  assert.deepEqual(e.loads().at(-1).data, TRESILLO);
});

test('(b) a DIRTY embed: the note changes on disk -> the embed shows the NEW note at once (driver\'s rule), says so, and is clean again', async () => {
  const e = embedSession(TRESILLO_TEXT);
  await e.session.onWidgetMessage({ type: MSG_READY });
  await e.session.onWidgetMessage({ type: 'forge-rhythm-edited' });
  assert.equal(e.session.isDirty(), true);
  e.setText(textOf(TRESILLO_34)); await e.session.onNoteModified();
  assert.equal(e.loads().length, 2, 'the new note is sent over the experiment');
  assert.deepEqual(e.loads().at(-1).data, TRESILLO_34, 'the NEW on-disk data, not the stale baseline');
  assert.equal(e.log.updated, 1);
  assert.equal(e.session.isDirty(), false);
  await e.session.onWidgetMessage({ type: MSG_RESET });
  assert.deepEqual(e.loads().at(-1).data, TRESILLO_34, 'Reset: the note as it is on disk right now');
  assert.equal(e.log.updated, 1);
});

test('(b) a DIRTY embed whose note is RESTORED (`git checkout`, Restore to last commit): it shows the restored note', async () => {
  const e = embedSession(TRESILLO_TEXT);
  await e.session.onWidgetMessage({ type: MSG_READY });
  e.setText(textOf(TRESILLO_34)); await e.session.onNoteModified();             // the Beat Box tab autosaved a 3/4 edit: embed follows
  await e.session.onWidgetMessage({ type: 'forge-rhythm-edited' });              // the student plays with the embed
  e.setText(TRESILLO_TEXT); await e.session.onNoteModified();                    // restored to the committed 4/4-16
  assert.equal(e.loads().length, 3);
  assert.deepEqual(e.loads().at(-1).data, TRESILLO, 'the committed note, with its meter and group size');
  assert.equal(e.log.updated, 2);
  assert.equal(e.session.isDirty(), false);
});

test('(b) a modify event that left the text as it was changes nothing, even for a dirty embed (the experiment survives a mere touch)', async () => {
  const e = embedSession(TRESILLO_TEXT);
  await e.session.onWidgetMessage({ type: MSG_READY });
  await e.session.onWidgetMessage({ type: 'forge-rhythm-edited' });
  await e.session.onNoteModified();
  assert.equal(e.loads().length, 1);
  assert.equal(e.log.updated, 0);
  assert.equal(e.session.isDirty(), true);
});

test('(b) a note that stops being valid under a dirty embed is an inline error, not a silent keep', async () => {
  const e = embedSession(TRESILLO_TEXT);
  await e.session.onWidgetMessage({ type: MSG_READY });
  await e.session.onWidgetMessage({ type: 'forge-rhythm-edited' });
  e.setText('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"x":1}\n```\n'); await e.session.onNoteModified();
  assert.equal(e.log.errors.length, 1);
  assert.equal(e.log.updated, 0, 'nothing was updated');
});

// ======================================================================================================================
// (c) the Beat Box tab: the note is restored underneath it
// ======================================================================================================================

test('(c) the tab, idle: the note restored on disk after an autosaved 3/4 edit RELOADS the widget; mid-save it is a conflict, never an overwrite', () => {
  const s = new RhythmNoteSession();
  s.rebaseline(TRESILLO_TEXT);                                                // the tab loaded the shipped note
  assert.equal(s.classifyModify(textOf(TRESILLO_34), false), 'reload', 'an external edit with nothing pending');
  s.rebaseline(textOf(TRESILLO_34));                                          // ... which the tab took as its baseline (an autosaved 3/4 edit looks the same)
  assert.equal(s.classifyModify(TRESILLO_TEXT, false), 'reload', 'the restore (git checkout / Restore to last commit) reloads');
  assert.equal(s.classifyModify(TRESILLO_TEXT, true), 'conflict', 'while a save is pending the note is not written over');
  assert.equal(s.classifyModify(textOf(TRESILLO_34), false), 'ignore', 'a modify event that changed nothing is nothing');
});

test('(c) the fingerprint really tells the two notes apart (a meter-only difference is a difference)', () => {
  assert.notEqual(contentFingerprint(TRESILLO_TEXT), contentFingerprint(textOf(TRESILLO_34)));
  assert.equal(contentFingerprint(TRESILLO_TEXT), contentFingerprint(TRESILLO_TEXT));
});

// ======================================================================================================================
// A dead end found on the way: an error state that never recovers
// ======================================================================================================================
// While tracing (b)/(c) it turned out that both views can end up showing an error for a note that is valid again, and never leave it:
//   - the EMBED's showError disposes its session, so the vault `modify` handler (`this.session?.onNoteModified()`) has nothing to call — a note
//     that was briefly invalid (a hand edit in the JSON view, a half-written sync) and is then restored stays an error until the page re-renders;
//   - the Beat Box TAB's showRefusal drops its iframe, and `sendLoad` returns early without one — the same dead end after a restore.
// "I restored the note and the widget is not back" is exactly what a student sees.

test('embed: a modify event re-renders an embed that is in its error state (and only then) — a live session handles it itself', () => {
  assert.equal(shouldRerenderAfterModify({ hasSession: false, inErrorState: true, unloaded: false }), true);
  assert.equal(shouldRerenderAfterModify({ hasSession: true, inErrorState: false, unloaded: false }), false, 'a live embed reloads through its session');
  assert.equal(shouldRerenderAfterModify({ hasSession: false, inErrorState: false, unloaded: false }), false, 'still rendering: nothing to recover');
  assert.equal(shouldRerenderAfterModify({ hasSession: false, inErrorState: true, unloaded: true }), false, 'a removed embed never re-renders');
  // the whole truth table: true in exactly ONE of the eight states (a live session is never thrown away for a re-render, even if a flag were stale)
  const yes: string[] = [];
  for (const hasSession of [false, true]) for (const inErrorState of [false, true]) for (const unloaded of [false, true]) {
    if (shouldRerenderAfterModify({ hasSession, inErrorState, unloaded })) yes.push(JSON.stringify({ hasSession, inErrorState, unloaded }));
  }
  assert.deepEqual(yes, [JSON.stringify({ hasSession: false, inErrorState: true, unloaded: false })]);
});

test('tab: with no widget (or no session) a modify event REMOUNTS; with both it classifies as before', () => {
  assert.equal(modifyRecovery({ hasSession: true, hasIframe: true }), 'classify');
  assert.equal(modifyRecovery({ hasSession: true, hasIframe: false }), 'remount', 'a refusal dropped the iframe');
  assert.equal(modifyRecovery({ hasSession: false, hasIframe: false }), 'remount', 'opened on an invalid note: there never was a session');
});

test('MECHANISM pin: the embed view\'s modify handler and the tab view\'s modify / reload paths use those decisions (if the wiring moves, reassess — do not just rewrite)', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
  const embed = read('rhythm-embed-view.ts');
  assert.match(embed, /shouldRerenderAfterModify\(\{ hasSession: this\.session !== null, inErrorState: this\.inErrorState, unloaded: this\.unloaded \}\)/);
  assert.match(embed, /private showError\([\s\S]*?this\.inErrorState = true/);
  assert.match(embed, /private async render\(\)[\s\S]*?this\.inErrorState = false/);
  const tab = read('rhythm-edit-view.ts');
  assert.match(tab, /modifyRecovery\(\{ hasSession: session !== null, hasIframe: this\.iframe !== null \}\) === 'remount'/);
  assert.match(tab, /private async sendLoad\(\)[\s\S]*?if \(!this\.iframe\) \{[\s\S]*?await this\.mount\(this\.file\)/);
});

// ======================================================================================================================
// Drain 2026-10-19-1500 §3 — EVERY route by which the note can change reaches the same place: one vault `modify` event -> onNoteModified ->
// a reload -> showUpdated. (Whether the student SEES the label is the attention-timed label's job: updated-label-core.test.ts.)
// ======================================================================================================================

test('the label is requested on every route: Beat Box tab autosave, `git checkout`, Restore to last commit, an external editor — clean or dirty embed — and on none that changed nothing', async () => {
  const routes: Array<[string, boolean, string]> = [
    ['autosave from the tab (a 3/4 edit saved)', false, textOf(TRESILLO_34)],
    ['`git checkout -- rhythm_pattern_tresillo.md` after an edit', true, TRESILLO_TEXT],
    ['Restore to last commit', false, TRESILLO_TEXT],
    ['an external editor / a sync', true, textOf(TRESILLO_34)],
  ];
  for (const [route, dirty, newText] of routes) {
    const e = embedSession(route.includes('checkout') || route.includes('Restore') ? textOf(TRESILLO_34) : TRESILLO_TEXT);
    await e.session.onWidgetMessage({ type: MSG_READY });
    if (dirty) await e.session.onWidgetMessage({ type: 'forge-rhythm-edited' });
    e.setText(newText); await e.session.onNoteModified();
    assert.equal(e.log.updated, 1, route);
    assert.equal(e.loads().length, 2, `${route}: reloaded`);
  }
  const same = embedSession(TRESILLO_TEXT);
  await same.session.onWidgetMessage({ type: MSG_READY });
  await same.session.onNoteModified();
  assert.equal(same.log.updated, 0, 'a modify event that changed nothing shows no label');
});
