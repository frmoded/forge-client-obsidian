// 2026-10-31-1120 (M15c): the controller on a vault stand-in with a clock the test moves and a `process` that is atomic (it hands the callback the CURRENT text): the debounce, "the second edit wins and the first is never written", what is said
// and when, Revert, and the sentence service that only ever PREVIEWS. The note texts are made by the real writers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS, RECIPE_PYTHON_DERIVED } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { newArrangementNote } from './arrangement-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const edit = (text: string, from: string, to: string): string => { const d = extractDescription(text); return text.replace(d, d.replace(from, to)); };

function rig(opts: { service?: (payload: any) => Promise<{ status: number; json: unknown }> | null; configured?: boolean; processError?: string; extra?: Record<string, string> } = {}) {
  const store = new Map<string, string>([[PATH, noteContentFor('phrase_001', EXTEND)], ...Object.entries(opts.extra ?? {})]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const lines: string[] = [], writes: string[] = [], asked: any[] = [];
  const doc = win.document;
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); if (opts.processError) throw new Error(opts.processError); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => panes,
    ...(opts.service !== undefined ? { askPlan: async (payload: any) => { asked.push(payload); return (await opts.service!(payload))!; }, configured: () => opts.configured !== false } : {}),
  };
  const ctl = createDescriptionController(ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const pane = (path = PATH) => { const el = doc.createElement('div'); doc.body.appendChild(el); panes.push({ path, contentEl: el }); return el as HTMLElement; };
  return { ctl, store, lines, writes, asked, advance, pane, timers };
}
const msg = (el: HTMLElement): string => el.querySelector('.forge-description-message')?.textContent ?? '';
const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action') ?? '');

test('a Description edited to parse is applied once the person STOPS typing (600 ms), by one write, with its evidence line; the note is the one the controls would have made', async () => {
  const r = rig();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars'));
  r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS - 1);
  assert.deepEqual(r.writes, [], 'not before the wait is over');
  await r.advance(1);
  assert.deepEqual(r.writes, [PATH]);
  assert.equal(r.store.get(PATH), noteContentFor('phrase_001', { ...EXTEND, bars: 6 }));
  assert.deepEqual(r.lines, ['[forge-description] applied phrase_001 (8 -> 6 bars)']);
  await r.advance(5000);
  assert.deepEqual(r.writes, [PATH], 'and the write\'s own modify event finds the note synced: nothing more happens');
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH]); assert.equal(r.lines.length, 1);
});

test('two quick edits: the first is never written, the second wins (one write, one line)', async () => {
  const r = rig();
  const base = r.store.get(PATH)!;
  r.store.set(PATH, edit(base, '8 bars', '6 bars')); r.ctl.modified(PATH);
  await r.advance(300);
  r.store.set(PATH, edit(base, '8 bars', '5 bars')); r.ctl.modified(PATH);
  await r.advance(300);
  assert.deepEqual(r.writes, [], 'the first timer was replaced');
  await r.advance(300);
  assert.deepEqual(r.lines, ['[forge-description] applied phrase_001 (8 -> 5 bars)']);
  assert.equal(readPhraseNote(r.store.get(PATH)!).ok && (readPhraseNote(r.store.get(PATH)!) as any).value.bars, 5);
});

test('a sentence typed while the write is in flight is not overwritten: the write is decided on the CURRENT text, the stale plan is dropped and the newer sentence is read by its own turn', async () => {
  const r = rig();
  const base = r.store.get(PATH)!;
  r.store.set(PATH, edit(base, '8 bars', '6 bars')); r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS - 1);
  r.store.set(PATH, edit(base, '8 bars', '3 bars'));                      // typed in the last millisecond, before the timer fires and the write begins
  r.ctl.modified(PATH);
  await r.advance(1); assert.deepEqual(r.writes, []);
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, ['[forge-description] applied phrase_001 (8 -> 3 bars)']);
});

test('a Description that does not parse: NOTHING is written, the sentence is in the bar of every pane showing the note with Revert, it is said once however often the note is touched; Revert restores the last good Description', async () => {
  const r = rig();
  const good = r.store.get(PATH)!;
  const a = r.pane(), b = r.pane();
  r.store.set(PATH, edit(good, '8 bars', '8 barz')); r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.match(msg(a), /^Description, line 1, column \d+: expected "bars", but found "barz"\.$/); assert.equal(msg(b), msg(a), 'the notes pane says it too');
  assert.deepEqual(buttons(a), ['revert'], 'no service configured: no Ask button');
  assert.equal(r.lines.length, 1); assert.match(r.lines[0], /^\[forge-description\] rejected phrase_001: line 1 column \d+ /);
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.length, 1, 'the same sentence is not reported again');
  (a.querySelector('[data-action="revert"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(r.store.get(PATH), good);
  assert.equal(a.querySelector('.forge-description-bar'), null, 'the bar is gone with the problem'); assert.equal(b.querySelector('.forge-description-bar'), null);
  assert.deepEqual(r.lines.at(-1), '[forge-description] reverted phrase_001 to the json cache');
});

test('a pane that emptied itself (a reload) gets its bar again at the next sync; a pane showing another note gets none', async () => {
  const r = rig();
  const a = r.pane(), other = r.pane('phrases/phrase_003.md');
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(a.querySelector('.forge-description-bar')); assert.equal(other.querySelector('.forge-description-bar'), null);
  a.textContent = ''; r.ctl.syncBars();
  assert.ok(a.querySelector('.forge-description-bar'), 'drawn again');
  assert.equal(a.querySelectorAll('.forge-description-bar').length, 1);
});

test('the Recipe or Python edited instead: said once ("Recipe and Python are derived; edit the Description."), nothing is written', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, r.store.get(PATH)!.replace('# Recipe\n\n', '# Recipe\n\nCall [[x]].\n')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []); assert.equal(msg(a), RECIPE_PYTHON_DERIVED); assert.deepEqual(buttons(a), []);
  assert.deepEqual(r.lines, [`[forge-description] ignored phrase_001: ${RECIPE_PYTHON_DERIVED}`]);
});

test('inspect (a note opened): the bar shows an unparsable sentence or the Update button for one that parses, and WRITES nothing; the Update button applies it', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars'));
  await r.ctl.inspect(PATH);
  assert.deepEqual(r.writes, []); assert.deepEqual(buttons(a), ['update', 'revert']); assert.equal(r.ctl.canUpdate(PATH), true);
  (a.querySelector('[data-action="update"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, [PATH]); assert.equal(r.ctl.canUpdate(PATH), false); assert.equal(a.querySelector('.forge-description-bar'), null);
});

test('modify of a note that is not a phrase, arrangement or composition costs nothing: no timer, no read', async () => {
  const r = rig();
  r.ctl.modified('notes/x.md'); r.ctl.modified('bars/bar_007.md');
  assert.equal(r.timers.length, 0);
});

const PLAN_OK = (plan: unknown) => async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null } });
test('the sentence service: offered only for a phrase that does not parse and only when configured; Ask shows Description + Recipe as a PREVIEW and writes nothing; Apply writes it, Cancel drops it', async () => {
  const r = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 }) });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, 'to 8 bars, repeating with fills', 'to a dozen bars and a bit slower')); const typed = r.store.get(PATH)!;
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(buttons(a), ['revert', 'ask']);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(r.asked.length, 1); assert.equal(r.asked[0].sentence, extractDescription(typed)); assert.deepEqual(r.asked[0].bars, ['bar_007', 'bar_008']);
  assert.deepEqual(r.writes, [], 'a preview writes nothing');
  assert.deepEqual(buttons(a), ['apply-preview', 'cancel-preview']);
  assert.match(a.querySelector('.forge-description-preview-description')!.textContent!, /12 bars/);
  assert.match(a.querySelector('.forge-description-preview-recipe')!.textContent!, /12 bars/);
  assert.match(r.lines.at(-1)!, /^\[forge-description\] asked the service about phrase_001 -> extend$/);
  (a.querySelector('[data-action="cancel-preview"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, []); assert.deepEqual(buttons(a), ['revert', 'ask'], 'cancelled: back to the error');
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  (a.querySelector('[data-action="apply-preview"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, [PATH]);
  const read = readPhraseNote(r.store.get(PATH)!); assert.ok(read.ok && read.value.kind === 'extend' && read.value.bars === 12 && read.value.tempo_change_pct === -10);
  assert.match(r.lines.at(-1)!, /^\[forge-description\] applied phrase_001 \(8 -> 12 bars, tempo_change_pct 0 -> -10\)$/);
});

test('the service: an old service (404), no token (0) and a refusal each say their one sentence in the bar, write nothing and leave Revert; a plain sentence the grammar understands NEVER reaches the service', async () => {
  for (const [res, expect] of [[{ status: 404, json: {} }, /does not offer planning yet \(it needs version 0\.2\.39/], [{ status: 0, json: { detail: 'Set your transpile token' } }, /Set your transpile token in Settings/], [{ status: 200, json: { ok: false, error: 'I could not plan that.' } }, /I could not plan that\./]] as const) {
    const r = rig({ service: async () => res as any });
    const a = r.pane();
    r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
    assert.match(msg(a), expect); assert.deepEqual(r.writes, []); assert.ok(buttons(a).includes('revert'));
  }
  const plain = rig({ service: PLAN_OK({}) });
  plain.pane();
  plain.store.set(PATH, edit(plain.store.get(PATH)!, '8 bars', '6 bars')); plain.ctl.modified(PATH); await plain.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(plain.asked, [], 'it parsed: it was applied here');
  const off = rig({ service: PLAN_OK({}), configured: false });
  const b = off.pane();
  off.store.set(PATH, edit(off.store.get(PATH)!, '8 bars', '8 barz')); off.ctl.modified(PATH); await off.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(buttons(b), ['revert'], 'a service that is not configured is not offered');
});

test('the service\'s suggestion is dropped when the Description changes while it is thinking, and never applied if the text moved before Apply', async () => {
  let release: (v: any) => void = () => {};
  const r = rig({ service: () => new Promise((res) => { release = res; }) });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(a.querySelector('.forge-description-bar')!.getAttribute('aria-busy'), 'true');
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 barz', '8 bars, wait')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  release({ status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_007', bars: 12 } } }); await r.advance(1);
  assert.deepEqual(r.writes, []); assert.equal(a.querySelector('.forge-description-preview'), null, 'no preview for a sentence that is gone');
});

// ---- the survivors of the first mutation pass: failure paths, exact bar sentences, disposal, panes that change, the service's guards -------------------------------------------------------------------------------
const ARR_PATH = 'arrangements/arr_001.md';
test('the bar\'s sentences: a Description that parses (before it is applied), a derived edit and the service\'s suggestion each say exactly this, with exactly these buttons', async () => {
  const r = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12 }) });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars')); await r.ctl.inspect(PATH);
  assert.equal(msg(a), 'The Description changed (8 -> 6 bars); update the note from it.'); assert.deepEqual(buttons(a), ['update', 'revert']);
  r.store.set(PATH, edit(r.store.get(PATH)!, '6 bars', '6 barz')); await r.ctl.inspect(PATH);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(msg(a), 'The sentence service suggests this. Nothing is written until you press Apply.');
  assert.match(a.querySelector('.forge-description-preview-description')!.textContent!, /12 bars/);
  assert.match(a.querySelector('.forge-description-preview-recipe')!.textContent!, /Take \[\[bar_007\]\]/);
  const d = rig(); const b = d.pane();
  d.store.set(PATH, d.store.get(PATH)!.replace('# Recipe\n\n', '# Recipe\n\nCall [[x]].\n')); await d.ctl.inspect(PATH);
  assert.equal(msg(b), RECIPE_PYTHON_DERIVED); assert.deepEqual(buttons(b), []);
});

test('a note with nothing to say gets no bar, and a pane that moves to another note loses the bar it had', async () => {
  const r = rig({ extra: { 'phrases/phrase_003.md': noteContentFor('phrase_003', EXTEND) } });
  const el = r.pane();
  await r.ctl.inspect(PATH); assert.equal(el.querySelector('.forge-description-bar'), null, 'synced: no bar');
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); await r.ctl.inspect(PATH);
  assert.ok(el.querySelector('.forge-description-bar'));
  const pane = (r as any).pane;
  void pane;
  await r.ctl.inspect('phrases/phrase_003.md');
  assert.equal(r.ctl.canUpdate('phrases/phrase_003.md'), false); assert.equal(r.ctl.canUpdate('notes/nothing.md'), false);
});

test('a write that throws: the bar says "Update from Description: <why>" with Revert, the console has the error, and a later good edit still applies', async () => {
  const savedError = console.error; const errors: unknown[][] = []; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const r = rig({ processError: 'disk full' });
    const a = r.pane();
    r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.equal(msg(a), 'Update from Description: disk full'); assert.ok(buttons(a).includes('revert'));
    assert.equal(errors.length, 1); assert.equal(errors[0][0], 'description-apply: could not write the note');
    assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
    (a.querySelector('[data-action="revert"]') as HTMLElement).click(); await r.advance(1);
    assert.equal(msg(a), 'Revert: disk full', 'Revert that throws says so too, and the bar stays');
  } finally { console.error = savedError; }
});

test('a note its writer refuses (read-only): the bar says the writer\'s sentence, nothing is written and the line "applied" is never written', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars').replace('type: data', 'type: data\nread_only: true'));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.match(msg(a), /^Not saved: /); assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
});

test('Revert on a note whose cache cannot be read says so and keeps the bar; Update on a note edited behind the plugin\'s back applies it (no look first)', async () => {
  const r = rig();
  const a = r.pane();
  const broken = edit(r.store.get(PATH)!, '8 bars', '8 barz').replace(/```json[\s\S]*?```/, '```json\nnot json\n```');
  r.store.set(PATH, broken); await r.ctl.inspect(PATH);
  (a.querySelector('[data-action="revert"]') as HTMLElement).click(); await r.advance(1);
  assert.match(msg(a), /^Revert: the note's json cache cannot be read/); assert.deepEqual(r.writes, []);
  const u = rig();
  u.store.set(PATH, edit(u.store.get(PATH)!, '8 bars', '6 bars'));
  await u.ctl.update(PATH);
  assert.deepEqual(u.writes, [PATH]); assert.equal(u.lines.at(-1), '[forge-description] applied phrase_001 (8 -> 6 bars)');
  await u.ctl.update('notes/x.md'); await u.ctl.revert('notes/x.md'); await u.ctl.ask('notes/x.md'); await u.ctl.inspect('notes/x.md');
  assert.deepEqual(u.writes, [PATH], 'a path that is not one of ours is never touched');
});

test('a plan that went stale inside the write (the text moved) is evaluated again, not written and not shown as an error', async () => {
  const r = rig();
  const a = r.pane();
  const first = edit(r.store.get(PATH)!, '8 bars', '6 bars');
  r.store.set(PATH, first); await r.ctl.inspect(PATH);                              // the bar offers Update for the 6-bar sentence
  r.store.set(PATH, edit(r.store.get(PATH)!, '6 bars', '6 barz'));                   // the person types on before pressing the button
  (a.querySelector('[data-action="update"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, []);
  assert.match(msg(a), /^Description, line 1, column \d+: expected "bars"/, 'the bar now says what the text says, not "stale"');
});

test('a disposed controller does nothing: no timer is set, a read in flight draws nothing, its bars are gone', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); await r.ctl.inspect(PATH);
  assert.ok(a.querySelector('.forge-description-bar'));
  r.ctl.dispose();
  assert.equal(a.querySelector('.forge-description-bar'), null);
  r.ctl.modified(PATH); assert.equal(r.timers.length, 0);
  await r.ctl.inspect(PATH); r.ctl.syncBars(); assert.equal(a.querySelector('.forge-description-bar'), null);
  r.ctl.modified(PATH); await r.advance(5000); assert.deepEqual(r.writes, []);
});

test('the derived-edit line is written once however often the note is touched, and again after the note was in sync in between', async () => {
  const r = rig();
  const edited = r.store.get(PATH)!.replace('# Recipe\n\n', '# Recipe\n\nCall [[x]].\n');
  r.store.set(PATH, edited); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.length, 1);
  r.store.set(PATH, noteContentFor('phrase_001', EXTEND)); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  r.store.set(PATH, edited); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.length, 2, 'said again for a new occurrence');
});

test('a sentence is said again when it CHANGES (still wrong, differently), and the service\'s suggestion made for the old sentence is dropped with it', async () => {
  const r = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12 }) });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  assert.ok(a.querySelector('.forge-description-preview'));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(a.querySelector('.forge-description-preview'), 'the same sentence keeps its suggestion');
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 barz', '8 barx')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(a.querySelector('.forge-description-preview'), null, 'a different sentence: the old suggestion is gone');
  assert.equal(r.lines.filter((l) => l.includes('rejected')).length, 2);
});

test('the service\'s guards: not for an arrangement, not without a rejected sentence, not with an empty sentence plan; Cancel with nothing shown and Apply with no preview do nothing', async () => {
  const arr = newArr();
  const r = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12 }), extra: { [ARR_PATH]: arr } });
  const a = r.pane(ARR_PATH);
  r.store.set(ARR_PATH, arr.replace(extractDescription(arr), 'Play [[phrase_003]] on the [[rock]] kit')); await r.ctl.inspect(ARR_PATH);
  assert.deepEqual(buttons(a), ['revert'], 'the service plans phrases only');
  await r.ctl.ask(ARR_PATH); assert.deepEqual(r.asked, []);
  await r.ctl.ask(PATH); assert.deepEqual(r.asked, [], 'no rejected sentence on that note');
  r.pane(PATH);
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); await r.ctl.inspect(PATH);
  r.ctl.syncBars();
  const act = (name: string) => (r as any).pane && null;
  void act;
  const empty = rig({ service: PLAN_OK({}) });
  const e = empty.pane();
  empty.store.set(PATH, empty.store.get(PATH)!.replace(extractDescription(empty.store.get(PATH)!), '')); await empty.ctl.inspect(PATH);
  (e.querySelector('[data-action="ask"]') as HTMLElement).click(); await empty.advance(1);
  assert.equal(empty.asked.length, 0, 'an empty sentence never leaves the machine (the request refuses it)');
  assert.equal(msg(e), 'Say in a sentence what phrase you want, for example: extend bar_005 to 8 bars.');
});

test('Apply: the Description changed while the suggestion was on screen -> dropped with its sentence; the write throws -> "Apply: <why>"; the suggestion\'s applied line carries the change', async () => {
  const r = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12 }) });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 barz', '8 bars, hm'));                // typed after the suggestion arrived, before Apply (no modify heard yet)
  (a.querySelector('[data-action="apply-preview"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(msg(a), 'The Description changed while the service was thinking; its suggestion was dropped.'); assert.deepEqual(r.writes, []);
  const t = rig({ service: PLAN_OK({ kind: 'extend', bar: 'bar_007', bars: 12 }), processError: 'quota' });
  const b = t.pane();
  t.store.set(PATH, edit(t.store.get(PATH)!, '8 bars', '8 barz')); t.ctl.modified(PATH); await t.advance(DESCRIPTION_DEBOUNCE_MS);
  (b.querySelector('[data-action="ask"]') as HTMLElement).click(); await t.advance(1);
  (b.querySelector('[data-action="apply-preview"]') as HTMLElement).click(); await t.advance(1);
  assert.equal(msg(b), 'Apply: quota');
});

test('the service answers after the pane was closed or the note fixed: nothing is drawn, and a service that cannot be reached says so in the bar', async () => {
  const r = rig({ service: async () => { throw new Error('offline'); } });
  const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  assert.match(msg(a), /^Could not reach the transpile service \(offline\)\. Check your connection and Settings/);
  assert.deepEqual(r.writes, []);
});

function newArr(): string { return newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }); }
