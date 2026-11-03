// 2026-10-31-1120 (M15c): the controller on a vault stand-in with a clock the test moves and a `process` that is atomic (it hands the callback the CURRENT text): the debounce, "the second edit wins and the first is never written", what is said
// and when, Revert, and the sentence service that only ever PREVIEWS. The note texts are made by the real writers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { pythonCommentsOf } from './python-apply-core.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { BOTH_EDITED } from './recipe-apply-core.ts';
import { CUSTOM_BANNER, asRecipeSourced, isCustomNote } from './phrase-notes-core.ts';
import { REVERT_GENERATED_CONFIRM } from './description-apply-core.ts';
import { newArrangementNote } from './arrangement-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const edit = (text: string, from: string, to: string): string => { const d = extractDescription(text); return text.replace(d, d.replace(from, to)); };

function rig(opts: { service?: (payload: any) => Promise<{ status: number; json: unknown }> | null; configured?: boolean; processError?: string; confirm?: boolean; extra?: Record<string, string>; beforeProcess?: (path: string) => void; start?: string } = {}) {
  const store = new Map<string, string>([[PATH, opts.start ?? noteContentFor('phrase_001', EXTEND)], ...Object.entries(opts.extra ?? {})]);
  const reads: string[] = [], calls: string[] = [];                                                // every read and every atomic write attempt the controller made (a note that is not ours must cost neither)
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const lines: string[] = [], writes: string[] = [], asked: any[] = [], confirms: string[] = [];
  const doc = win.document;
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { reads.push(p); const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { calls.push(p); await Promise.resolve(); if (opts.processError) throw new Error(opts.processError); opts.beforeProcess?.(p); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => panes,
    ...(opts.confirm !== undefined ? { confirm: async (m: string) => { confirms.push(m); return opts.confirm as boolean; } } : {}),
    ...(opts.service !== undefined ? { askPlan: async (payload: any) => { asked.push(payload); return (await opts.service!(payload))!; }, configured: () => opts.configured !== false } : {}),
  };
  const ctl = createDescriptionController(ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const pane = (path = PATH) => { const el = doc.createElement('div'); doc.body.appendChild(el); panes.push({ path, contentEl: el }); return el as HTMLElement; };
  return { ctl, store, lines, writes, asked, advance, pane, timers, reads, calls, confirms };
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

test('the Python edited instead is a SOURCE (2026-11-02-1155, M16b, deliberate: it was "Python is derived; edit the Description or the Recipe.", said and not applied): a known shape (a comment added) is applied by ONE write and the note is Python-sourced; 2026-11-03-1155-8 (D4, deliberate): the comment is not kept, and that is said on the evidence line and on the bar (no buttons)', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, r.store.get(PATH)!.replace('```python\n', '```python\n# hand edit\n')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.writes.length, 1);
  assert.match(r.store.get(PATH)!, /source_facet: python/);
  assert.deepEqual(r.lines, ['[forge-python] applied phrase_001 (no change in the music); comments in the Python are not kept']);
  assert.equal(msg(a), 'Applied from the Python; comments in the Python are not kept.'); assert.deepEqual(buttons(a), []);
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
  d.store.set(PATH, d.store.get(PATH)!.replace('```python\n', '```python\n# hand edit\n')); await d.ctl.inspect(PATH);
  assert.match(msg(b), /^The Python changed \(no change in the music\); update the note from it\.$/); assert.deepEqual(buttons(b), ['update-python', 'revert']);   // 2026-11-02-1155 (M16b, deliberate): a Python edit is a source
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


// ---- 2026-10-31-1140 (M16a): the RECIPE is a source too -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const editRecipe = (text: string, from: string, to: string): string => { const x = extractRecipeSection(text) ?? ''; assert.ok(x.includes(from), `the Recipe has "${from}"`); return text.replace(x, x.replace(from, to)); };

test('a Recipe edited to parse is applied once the person STOPS typing, by one write, with its [forge-recipe] evidence line; the note is the one the controls make, as a Recipe-sourced note; the write\'s own modify event finds it synced', async () => {
  const r = rig();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS - 1);
  assert.deepEqual(r.writes, [], 'not before the wait is over');
  await r.advance(1);
  assert.deepEqual(r.writes, [PATH]);
  assert.equal(r.store.get(PATH), asRecipeSourced(noteContentFor('phrase_001', { ...EXTEND, bars: 6 })));
  assert.deepEqual(r.lines, ['[forge-recipe] applied phrase_001 (8 -> 6 bars)']);
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS * 3);
  assert.deepEqual(r.writes, [PATH], 'nothing more happens'); assert.equal(r.lines.length, 1);
});

test('a Recipe that does not parse: NOTHING is written, the bar says the line and the column in every pane with Revert only (no service for a Recipe, even when one is configured), once however often the note is touched; fixing it applies it; Revert restores the last good note', async () => {
  const r = rig({ service: async () => ({ status: 200, json: {} }), configured: true });
  const good = r.store.get(PATH)!;
  const a = r.pane(), b = r.pane();
  r.store.set(PATH, good.replace(extractRecipeSection(good) ?? '', 'Take [[bar_007]].\nRepeat it for 8 bars with fills.\nSprinkle [[bar_008]].'));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.match(msg(a), /^Recipe, line 3, column 1: I do not know the step 'Sprinkle'\. A step starts with Take, Repeat,/); assert.equal(msg(b), msg(a));
  assert.deepEqual(buttons(a), ['revert'], 'Revert only: no "Ask the sentence service" for a Recipe');
  assert.equal(r.lines.length, 1); assert.match(r.lines[0], /^\[forge-recipe\] rejected phrase_001: line 3 column 1 /);
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.length, 1, 'said once');
  (a.querySelector('[data-action="revert"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(r.store.get(PATH), good);
  assert.equal(a.querySelector('.forge-description-bar'), null);
  assert.equal(r.lines.at(-1), '[forge-recipe] reverted phrase_001 to the json cache');
  // and a Recipe fixed instead of reverted is applied
  r.store.set(PATH, editRecipe(good, '8 bars', '5 bars')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.at(-1), '[forge-recipe] applied phrase_001 (8 -> 5 bars)');
});

test('BOTH facets edited: nothing is written, the sentence names both with the two buttons; "Update from Recipe" keeps the Recipe, "Update from Description" keeps the Description', async () => {
  for (const [button, bars, line] of [['update-recipe', 6, '[forge-recipe] applied phrase_001 (8 -> 6 bars)'], ['update', 5, '[forge-description] applied phrase_001 (8 -> 5 bars)']] as const) {
    const r = rig();
    const a = r.pane();
    r.store.set(PATH, edit(editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars'));
    r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.deepEqual(r.writes, [], 'a person\'s edit is never silently chosen over another');
    assert.equal(msg(a), BOTH_EDITED); assert.deepEqual(buttons(a), ['update', 'update-recipe']);
    assert.equal(r.ctl.canUpdate(PATH), false, 'the command has one answer to give only when there is one');
    assert.deepEqual(r.lines, [`[forge-recipe] refused phrase_001: ${BOTH_EDITED}`]);
    (a.querySelector(`[data-action="${button}"]`) as HTMLElement).click(); await r.advance(1);
    assert.deepEqual(r.writes, [PATH]);
    assert.equal(r.lines.at(-1), line);
    assert.equal(readPhraseNote(r.store.get(PATH)!).ok && (readPhraseNote(r.store.get(PATH)!) as any).value.bars, bars);
    assert.equal(a.querySelector('.forge-description-bar'), null, 'synced: the bar goes');
  }
});

test('edge: a hand edit of the RECIPE right after the Description was just auto-applied (M15c debounce): the Description\'s write is done, the Recipe it wrote is what the person edits, and its own turn applies it', async () => {
  const r = rig();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars')); r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, ['[forge-description] applied phrase_001 (8 -> 6 bars)']);
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '6 bars', '4 bars')); r.ctl.modified(PATH);                        // 1 ms after
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, ['[forge-description] applied phrase_001 (8 -> 6 bars)', '[forge-recipe] applied phrase_001 (6 -> 4 bars)']);
  assert.equal(r.store.get(PATH), asRecipeSourced(noteContentFor('phrase_001', { ...EXTEND, bars: 4 })));
});

test('edge: a Recipe edit INSIDE the wait of a Description edit: when the timer fires BOTH differ from their stamps, so nothing is written and the person is asked (the first edit is not applied behind the second one\'s back)', async () => {
  const r = rig();
  const base = r.store.get(PATH)!;
  r.store.set(PATH, edit(base, '8 bars', '6 bars')); r.ctl.modified(PATH);
  await r.advance(300);
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '4 bars')); r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.deepEqual(r.lines, [`[forge-recipe] refused phrase_001: ${BOTH_EDITED}`]);
});

test('a Recipe typed while the write is in flight is not overwritten: the plan is decided on the CURRENT text, the stale one is dropped and the newer Recipe is read by its own turn', async () => {
  const r = rig();
  const base = r.store.get(PATH)!;
  r.store.set(PATH, editRecipe(base, '8 bars', '6 bars')); r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS - 1);
  r.store.set(PATH, editRecipe(base, '8 bars', '3 bars'));
  r.ctl.modified(PATH);
  await r.advance(1); assert.deepEqual(r.writes, []);
  await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, ['[forge-recipe] applied phrase_001 (8 -> 3 bars)']);
});

test('the "Update from Description" command (canUpdate) is there for a Recipe that parses, too: the note has one thing to apply', async () => {
  const r = rig();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  await r.ctl.inspect(PATH);
  assert.equal(r.ctl.canUpdate(PATH), true);
  await r.ctl.update(PATH);
  assert.equal(r.lines.at(-1), '[forge-recipe] applied phrase_001 (8 -> 6 bars)');
  assert.equal(r.ctl.canUpdate(PATH), false);
});

// ---- 2026-10-31-1149: the survivors of the mutation pass of 1120 (re-run on an idle machine) and of the same files at M16a: what the controller says and does when a write FAILS, when a plan is STALE, how often a problem is SAID, what Cancel and Revert leave, and what a disposed or a foreign note costs --------
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => { const saved = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = saved; } };
const READ_ONLY = (text: string): string => text.replace('content_type: json', 'content_type: json\nread_only: true');

test('a Recipe that parses is OFFERED (nothing written) when the note is only looked at: the sentence names the change and the two buttons are Update from Recipe and Revert', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'));
  await r.ctl.inspect(PATH);
  assert.deepEqual(r.writes, []);
  assert.equal(msg(a), 'The Recipe changed (8 -> 6 bars); update the note from it.'); assert.deepEqual(buttons(a), ['update-recipe', 'revert']);
});

test('a problem is SAID once and said again when it comes back: a Python edit, both facets edited and a rejected Recipe are each reported once however often the note is touched, and the sentence is reported again after the problem was fixed', async () => {
  const r = rig(); r.pane();
  const good = r.store.get(PATH)!;
  r.store.set(PATH, good.replace('```python\n', '```python\n# hand edit\n'));
  for (let i = 0; i < 3; i++) { r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS); }
  assert.equal(r.lines.length, 1, 'a Python edit said once');
  const both = edit(editRecipe(good, '8 bars', '6 bars'), '8 bars', '5 bars');
  r.store.set(PATH, both);
  for (let i = 0; i < 3; i++) { r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS); }
  assert.equal(r.lines.filter((l) => /refused phrase_001/.test(l)).length, 1, 'both edited said once');
  // fixed by hand (the note is as the controls wrote it again): the bar goes, and the same problem is said again when it returns
  r.store.set(PATH, good); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  r.store.set(PATH, both); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.filter((l) => /refused phrase_001/.test(l)).length, 2, 'said again after it was fixed in between');
  const bad = edit(good, '8 bars', '8 barz');
  r.store.set(PATH, bad); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  r.store.set(PATH, good); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  r.store.set(PATH, bad); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.lines.filter((l) => /rejected phrase_001/.test(l)).length, 2, 'a rejected sentence is said again after the note was good in between');
});

test('a note that is fixed by hand loses its bar (and a synced note costs no write at all)', async () => {
  const r = rig(); const a = r.pane();
  const good = r.store.get(PATH)!;
  r.store.set(PATH, edit(good, '8 bars', '8 barz')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(a.querySelector('.forge-description-bar'));
  r.store.set(PATH, good); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(a.querySelector('.forge-description-bar'), null, 'back to a note the controls wrote: the bar is taken away');
  const calls = r.calls.length;
  await r.ctl.inspect(PATH); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(r.calls.length, calls, 'a synced note is looked at, never written (not even a write that changes nothing)');
});

test('a note that is not ours costs nothing: no read and no write for a bar, a README or another folder, whichever way the controller is asked', async () => {
  const r = rig({ extra: { 'bars/bar_001.md': 'x', 'notes/x.md': 'x' } });
  for (const path of ['bars/bar_001.md', 'notes/x.md', 'phrases/README.md']) {
    await r.ctl.inspect(path); r.ctl.modified(path); await r.ctl.update(path); await r.ctl.revert(path); await r.ctl.ask(path);
    await r.advance(DESCRIPTION_DEBOUNCE_MS);
  }
  assert.deepEqual(r.reads, []); assert.deepEqual(r.calls, []); assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
});

test('a write that FAILS says so and keeps what it can still do: Update from Description fails -> its sentence with Update and Revert; Update from Recipe likewise; the failure is logged to the console', async () => {
  const logged: unknown[][] = [];
  const saved = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const d = rig({ processError: 'disk full' }); const da = d.pane();
    d.store.set(PATH, edit(d.store.get(PATH)!, '8 bars', '6 bars')); d.ctl.modified(PATH); await d.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.equal(msg(da), 'Update from Description: disk full'); assert.deepEqual(buttons(da), ['update', 'revert']);
    assert.deepEqual(d.writes, []);
    const x = rig({ processError: 'disk full' }); const xa = x.pane();
    x.store.set(PATH, editRecipe(x.store.get(PATH)!, '8 bars', '6 bars')); x.ctl.modified(PATH); await x.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.equal(msg(xa), 'Update from Recipe: disk full'); assert.deepEqual(buttons(xa), ['update-recipe', 'revert']);
    assert.equal(logged.length, 2); assert.match(String(logged[0][0]), /description-apply: could not write the note/); assert.match(String(logged[1][0]), /recipe-apply: could not write the note/);
    // both edited, the person chose the Description, the write fails: the same two buttons stay, with the reason
    const b = rig({ processError: 'disk full' }); const ba = b.pane();
    b.store.set(PATH, edit(editRecipe(b.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars')); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
    (ba.querySelector('[data-action="update"]') as HTMLElement).click(); await b.advance(1);
    assert.equal(msg(ba), 'Update from Description: disk full'); assert.deepEqual(buttons(ba), ['update', 'update-recipe']);
    assert.equal(logged.length, 3); assert.match(String(logged[2][0]), /description-apply: could not write the note/);
  } finally { console.error = saved; }
});

test('a note its WRITER refuses (read_only) is said in the writer\'s own words and the buttons stay: a Description, a Recipe and both-edited, each decided by the writer inside the write', async () => {
  for (const [label, make, buttonsWant] of [
    ['Description', (t: string) => edit(t, '8 bars', '6 bars'), ['update', 'revert']],
    ['Recipe', (t: string) => editRecipe(t, '8 bars', '6 bars'), ['update-recipe', 'revert']],
  ] as const) {
    const r = rig(); const a = r.pane();
    r.store.set(PATH, READ_ONLY(make(r.store.get(PATH)!))); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.deepEqual(r.writes, [], label);
    assert.match(msg(a), /read_only|read-only|editable/i, `${label}: ${msg(a)}`); assert.deepEqual(buttons(a), buttonsWant, label);
    assert.deepEqual(r.lines, [], `${label}: a refusal of the writer is not an applied line`);
  }
  const b = rig(); const ba = b.pane();
  b.store.set(PATH, READ_ONLY(edit(editRecipe(b.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars'))); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
  (ba.querySelector('[data-action="update"]') as HTMLElement).click(); await b.advance(1);
  assert.deepEqual(b.writes, []); assert.match(msg(ba), /read_only|read-only|editable/i); assert.deepEqual(buttons(ba), ['update', 'update-recipe']);
});

test('a STALE plan is dropped and the note is read afresh, with no failure sentence: the text changes between the plan and the write, so nothing stale is written and the bar offers what the note says NOW', async () => {
  const base = noteContentFor('phrase_001', EXTEND);
  for (const [label, first, second, want] of [
    ['Description', (t: string) => edit(t, '8 bars', '6 bars'), (t: string) => edit(t, '8 bars', '5 bars'), 'The Description changed (8 -> 5 bars); update the note from it.'],
    ['Recipe', (t: string) => editRecipe(t, '8 bars', '6 bars'), (t: string) => editRecipe(t, '8 bars', '5 bars'), 'The Recipe changed (8 -> 5 bars); update the note from it.'],
  ] as const) {
    let fired = false;
    const r = rig({ beforeProcess: (p) => { if (!fired) { fired = true; r.store.set(p, second(base)); } } });          // typed after the plan, before the write (no event: nobody has heard it yet)
    const a = r.pane();
    r.store.set(PATH, first(base)); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.deepEqual(r.writes, [], `${label}: the stale plan is not written`);
    assert.equal(msg(a), want, `${label}: the bar offers what the note says now, not a failure sentence`);
    assert.deepEqual(r.lines, [], `${label}: nothing was applied`);
  }
  // a stale plan whose newer text does not parse: the bar says where
  let fired = false;
  const r = rig({ beforeProcess: (p) => { if (!fired) { fired = true; r.store.set(p, edit(base, '8 bars', '8 barz')); } } });
  const a = r.pane();
  r.store.set(PATH, edit(base, '8 bars', '6 bars')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.match(msg(a), /^Description, line 1, column \d+: expected "bars"/); assert.deepEqual(buttons(a), ['revert']);
});

test('Update from Recipe on a note that no longer has a Recipe to apply shows what the note says now and writes nothing', async () => {
  const r = rig(); const a = r.pane();
  const good = r.store.get(PATH)!;
  r.store.set(PATH, editRecipe(good, '8 bars', '6 bars')); await r.ctl.inspect(PATH);
  assert.deepEqual(buttons(a), ['update-recipe', 'revert']);
  r.store.set(PATH, good);                                                                    // fixed by hand, no event heard yet
  (a.querySelector('[data-action="update-recipe"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, []); assert.deepEqual(r.calls, [], 'nothing was written, not even an empty write');
  assert.equal(a.querySelector('.forge-description-bar'), null, 'and the bar that offered it is gone');
});

test('Revert says which kind of problem it reverted ([forge-recipe] for a Recipe edit, a rejected Recipe and both edited; [forge-description] for a Description) and forgets it was told: the same sentence is said again afterwards', async () => {
  const good = noteContentFor('phrase_001', EXTEND);
  // [label, the note as typed, the evidence line of the revert, whether the PROBLEM itself is said in an evidence line (a rejected text and both edited are; an edit that parses is only offered)]
  const cases: Array<[string, string, string, boolean]> = [
    ['a Recipe that parses', editRecipe(good, '8 bars', '6 bars'), '[forge-recipe] reverted phrase_001 to the json cache', false],
    ['a Recipe that does not', good.replace(extractRecipeSection(good) ?? '', 'Sprinkle.'), '[forge-recipe] reverted phrase_001 to the json cache', true],
    ['both edited', edit(editRecipe(good, '8 bars', '6 bars'), '8 bars', '5 bars'), '[forge-recipe] reverted phrase_001 to the json cache', true],
    ['a Description that parses', edit(good, '8 bars', '6 bars'), '[forge-description] reverted phrase_001 to the json cache', false],
    ['a Description that does not', edit(good, '8 bars', '8 barz'), '[forge-description] reverted phrase_001 to the json cache', true],
  ];
  for (const [label, typed, want, traced] of cases) {
    const r = rig(); const a = r.pane();
    r.store.set(PATH, typed); await r.ctl.inspect(PATH);
    assert.ok(a.querySelector('.forge-description-bar'), `${label}: there is something to revert`);
    await r.ctl.revert(PATH);                                                                   // the command's path: one for every state (both edited has no Revert button)
    assert.equal(r.store.get(PATH), good, label);
    assert.equal(r.lines.at(-1), want, label);
    assert.equal(a.querySelector('.forge-description-bar'), null, label);
    // it forgot it was told: the same problem is said again when it comes back
    const said = r.lines.length;
    r.store.set(PATH, typed); await r.ctl.inspect(PATH);
    assert.equal(r.lines.length, said + (traced ? 1 : 0), `${label}: ${traced ? 'said again' : 'an edit that parses is offered, not said'}`);
  }
});

test('a Revert that cannot be done leaves a note that was not in trouble without a bar, and says why when it was', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, r.store.get(PATH)!.replace(/```json[\s\S]*$/, '```json\n{ "kind": "extend", \n```\n'));        // the json cache cannot be read
  await r.ctl.revert(PATH);
  assert.deepEqual(r.writes, []);
  assert.equal(a.querySelector('.forge-description-bar'), null, 'no bar for a note that had nothing to say');
  const b = rig(); const ba = b.pane();
  const bad = edit(b.store.get(PATH)!, '8 bars', '8 barz');
  b.store.set(PATH, bad); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
  b.store.set(PATH, bad.replace(/```json[\s\S]*$/, '```json\n{ "kind": "extend", \n```\n'));
  (ba.querySelector('[data-action="revert"]') as HTMLElement).click(); await b.advance(1);
  assert.match(msg(ba), /^Revert: /); assert.deepEqual(buttons(ba), ['revert']);
});

test('the sentence service: its refusal is in the evidence line; the preview\'s Recipe is one step per line; Cancel takes the preview away and keeps the problem; Apply takes the bar and the preview away and clears what was told; a writer that refuses says so; a sentence typed while the service thinks drops its answer', async () => {
  const ok = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 }, error: null } };
  const typed = (t: string): string => edit(t, 'to 8 bars, repeating with fills', 'to a dozen bars and a bit slower');
  // refused
  const refused = rig({ service: async () => ({ status: 200, json: { ok: false, parsed_ok: false, plan: null, error: 'I could not read that.' } }), configured: true });
  const refusedPane = refused.pane();
  refused.store.set(PATH, typed(refused.store.get(PATH)!)); refused.ctl.modified(PATH); await refused.advance(DESCRIPTION_DEBOUNCE_MS);
  (refusedPane.querySelector('[data-action="ask"]') as HTMLElement).click(); await refused.advance(1);
  assert.match(refused.lines.at(-1)!, /^\[forge-description\] asked the service about phrase_001 -> refused: .+/, refused.lines.join(' | '));
  assert.ok(refused.lines.at(-1)!.length > '[forge-description] asked the service about phrase_001 -> refused: '.length);
  // preview, Cancel
  const r = rig({ service: async () => ok, configured: true }); const a = r.pane();
  const problem = typed(r.store.get(PATH)!);
  r.store.set(PATH, problem); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  const recipe = a.querySelector('.forge-description-preview-recipe')!.textContent!;
  assert.ok(recipe.split('\n').length >= 2 && /\n/.test(recipe), `the preview's Recipe has one step per line: ${JSON.stringify(recipe)}`);
  (a.querySelector('[data-action="cancel-preview"]') as HTMLElement).click(); await r.advance(1);
  assert.equal(a.querySelector('.forge-description-preview'), null, 'Cancel takes the preview away'); assert.deepEqual(buttons(a), ['revert', 'ask'], '... and the problem is still there with its buttons');
  assert.deepEqual(r.writes, [], 'Cancel writes nothing');
  // preview, Apply: the bar goes, and the same sentence is reported again when it returns
  (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
  (a.querySelector('[data-action="apply-preview"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, [PATH]); assert.equal(a.querySelector('.forge-description-bar'), null);
  const rejectedBefore = r.lines.filter((l) => /rejected/.test(l)).length;
  r.store.set(PATH, problem); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);                       // the SAME sentence the person typed before the Apply
  assert.equal(r.lines.filter((l) => /rejected/.test(l)).length, rejectedBefore + 1, 'a sentence is reported again after an Apply in between');
  // Apply on a note the writer refuses
  const w = rig({ service: async () => ok, configured: true }); const wa = w.pane();
  const wp = typed(w.store.get(PATH)!);
  w.store.set(PATH, wp); w.ctl.modified(PATH); await w.advance(DESCRIPTION_DEBOUNCE_MS);
  (wa.querySelector('[data-action="ask"]') as HTMLElement).click(); await w.advance(1);
  w.store.set(PATH, READ_ONLY(wp));
  (wa.querySelector('[data-action="apply-preview"]') as HTMLElement).click(); await w.advance(1);
  assert.deepEqual(w.writes, []); assert.match(msg(wa), /read_only|read-only|editable/i, msg(wa));
  // the Description is changed while the service thinks: its answer is for a sentence that is gone
  let thinking: Promise<void> | null = null;
  const t: ReturnType<typeof rig> = rig({ service: async () => { t.store.set(PATH, edit(t.store.get(PATH)!, 'a dozen bars', 'a dozen barz')); await t.ctl.inspect(PATH); return ok; }, configured: true });
  const ta = t.pane();
  t.store.set(PATH, typed(t.store.get(PATH)!)); t.ctl.modified(PATH); await t.advance(DESCRIPTION_DEBOUNCE_MS);
  (ta.querySelector('[data-action="ask"]') as HTMLElement).click(); await t.advance(1);
  void thinking;
  assert.equal(ta.querySelector('.forge-description-preview'), null, 'the stale answer is not shown');
  assert.ok(!t.lines.some((l) => /asked the service/.test(l)), 'and not reported as an answer');
});

test('dispose: a timer that is pending never fires, a disposed controller says and writes nothing however it is asked, and its bars are taken away', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', '6 bars')); r.ctl.modified(PATH);
  assert.equal(r.timers.length, 1, 'a timer is pending');
  r.ctl.dispose();
  assert.equal(r.timers.length, 0, 'the pending timer is cleared AT dispose (not merely never heard)');
  await r.advance(DESCRIPTION_DEBOUNCE_MS * 3);
  assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
  r.store.set(PATH, edit(noteContentFor('phrase_001', EXTEND), '8 bars', '8 barz'));
  await r.ctl.inspect(PATH); r.ctl.syncBars(); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, [], 'nothing is said by a disposed controller'); assert.equal(a.querySelector('.forge-description-bar'), null); assert.equal(r.timers.length, 0, 'and no timer is set');
  const b = rig(); const ba = b.pane();
  b.store.set(PATH, edit(b.store.get(PATH)!, '8 bars', '8 barz')); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(ba.querySelector('.forge-description-bar'));
  b.ctl.dispose();
  assert.equal(ba.querySelector('.forge-description-bar'), null, 'its bars are taken away');
  const c = rig(); c.pane();
  c.store.set(PATH, edit(c.store.get(PATH)!, '8 bars', '6 bars')); await c.ctl.inspect(PATH);
  assert.equal(c.ctl.canUpdate(PATH), true, 'a note with something to update');
  c.ctl.dispose();
  assert.equal(c.ctl.canUpdate(PATH), false, 'a disposed controller offers nothing');
});


test('a problem is said AGAIN after each way it can be answered, not only after the note was seen fixed: an Update, an Update from Recipe, an Update from Description over both edits and an Apply each forget what they were told', async () => {
  const good = noteContentFor('phrase_001', EXTEND);
  // a rejected Description, then a Description that parses and is applied by its own turn, then the SAME rejected sentence: said again
  const d = rig(); d.pane();
  const bad = edit(good, '8 bars', '8 barz');
  d.store.set(PATH, bad); d.ctl.modified(PATH); await d.advance(DESCRIPTION_DEBOUNCE_MS);
  d.store.set(PATH, edit(good, '8 bars', '6 bars')); d.ctl.modified(PATH); await d.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(d.lines.some((l) => /applied/.test(l)));
  d.store.set(PATH, bad); d.ctl.modified(PATH); await d.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(d.lines.filter((l) => /rejected/.test(l)).length, 2, 'Description: said again after an apply');
  // the same for a Recipe
  const x = rig(); x.pane();
  const badRecipe = good.replace(extractRecipeSection(good) ?? '', 'Take [[bar_007]].\nSprinkle [[bar_008]].');
  x.store.set(PATH, badRecipe); x.ctl.modified(PATH); await x.advance(DESCRIPTION_DEBOUNCE_MS);
  x.store.set(PATH, editRecipe(good, '8 bars', '6 bars')); x.ctl.modified(PATH); await x.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(x.lines.some((l) => /\[forge-recipe\] applied/.test(l)));
  x.store.set(PATH, badRecipe); x.ctl.modified(PATH); await x.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(x.lines.filter((l) => /rejected/.test(l)).length, 2, 'Recipe: said again after an apply');
  // both edited, the person chooses the Description, then the same two edits again: refused (and said) again
  const b = rig(); const ba = b.pane();
  const both = edit(editRecipe(good, '8 bars', '6 bars'), '8 bars', '5 bars');
  b.store.set(PATH, both); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
  (ba.querySelector('[data-action="update"]') as HTMLElement).click(); await b.advance(1);
  b.store.set(PATH, both); b.ctl.modified(PATH); await b.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(b.lines.filter((l) => /refused phrase_001/.test(l)).length, 2, 'both edited: said again after the Description was chosen');
});

test('Update from Recipe is the Recipe and nothing else: when the Recipe was fixed meanwhile and the DESCRIPTION is what was edited, the button does not apply the Description behind the person\'s back - the bar offers it', async () => {
  const r = rig(); const a = r.pane();
  const good = r.store.get(PATH)!;
  r.store.set(PATH, editRecipe(good, '8 bars', '6 bars')); await r.ctl.inspect(PATH);
  assert.deepEqual(buttons(a), ['update-recipe', 'revert']);
  r.store.set(PATH, edit(good, '8 bars', '5 bars'));                                          // the Recipe is back to what it was and the Description was edited instead; no event heard yet
  (a.querySelector('[data-action="update-recipe"]') as HTMLElement).click(); await r.advance(1);
  assert.deepEqual(r.writes, [], 'nothing was applied: the person pressed Update from RECIPE');
  assert.equal(msg(a), 'The Description changed (8 -> 5 bars); update the note from it.'); assert.deepEqual(buttons(a), ['update', 'revert']);
});

test('a button that is still in the hand of a script after its bar went away (a Cancel, an Apply) answers nothing and breaks nothing; an answer from the sentence service for a sentence that is gone is dropped whatever became of the note meanwhile (fixed, edited to parse, or edited again)', async () => {
  const unhandled: unknown[] = [];
  const onRejection = (e: unknown): void => { unhandled.push(e); };
  process.on('unhandledRejection', onRejection);
  try {
    const ok = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 }, error: null } };
    const good = noteContentFor('phrase_001', EXTEND);
    const typed = edit(good, 'to 8 bars, repeating with fills', 'to a dozen bars and a bit slower');
    // a preview is up; the note is fixed by hand (the bar and the preview go); the buttons that were in it are clicked
    const r = rig({ service: async () => ok, configured: true }); const a = r.pane();
    r.store.set(PATH, typed); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    (a.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.advance(1);
    const cancel = a.querySelector('[data-action="cancel-preview"]') as HTMLElement, apply = a.querySelector('[data-action="apply-preview"]') as HTMLElement;
    r.store.set(PATH, good); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
    assert.equal(a.querySelector('.forge-description-bar'), null);
    cancel.click(); apply.click(); await r.advance(1);
    assert.deepEqual(r.writes, [], 'a stale Apply writes nothing'); assert.equal(a.querySelector('.forge-description-bar'), null);
    // the service thinks; meanwhile the note becomes: fixed / edited to parse / edited to another sentence that does not parse
    for (const [label, meanwhile] of [['fixed', (t: string) => t], ['edited to parse', (t: string) => edit(t, '8 bars', '6 bars')], ['edited again', (t: string) => edit(t, '8 bars', '8 barz')]] as const) {
      const t: ReturnType<typeof rig> = rig({ service: async () => { t.store.set(PATH, meanwhile(good)); await t.ctl.inspect(PATH); return ok; }, configured: true });
      const ta = t.pane();
      t.store.set(PATH, typed); t.ctl.modified(PATH); await t.advance(DESCRIPTION_DEBOUNCE_MS);
      (ta.querySelector('[data-action="ask"]') as HTMLElement).click(); await t.advance(1);
      assert.equal(ta.querySelector('.forge-description-preview'), null, `${label}: the stale answer is not shown`);
      assert.ok(!t.lines.some((l) => /asked the service/.test(l)), `${label}: and not reported as an answer`);
    }
    await r.advance(1);
  } finally { process.off('unhandledRejection', onRejection); }
  assert.deepEqual(unhandled, [], 'nothing threw');
});

// ---- 2026-11-02-1155 (M16b): the Python is a source ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const withPython = (text: string, edit: (py: string) => string): string => { const py = (text.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1]; return text.replace(py, edit(py)); };
const THIN = "  bars[1] = thin_out_bars(bars=[bars[1]], first=1, last=1, amount=0.5)[0]\n  return bars";

test('the Python edited to a known shape (bars=8 -> bars=6): applied once the person stops typing, by ONE write; the Description and the Score follow, the note is Python-sourced, one evidence line, no bar', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, withPython(r.store.get(PATH)!, (py) => py.replace('bars=8', 'bars=6')));
  r.ctl.modified(PATH);
  await r.advance(DESCRIPTION_DEBOUNCE_MS - 1);
  assert.deepEqual(r.writes, [], 'not before the wait is over');
  await r.advance(1);
  assert.deepEqual(r.writes, [PATH]);
  assert.match(extractDescription(r.store.get(PATH)!), /6 bars/);
  assert.equal((readPhraseNote(r.store.get(PATH)!) as any).value.bars, 6);
  assert.match(r.store.get(PATH)!, /source_facet: python/);
  assert.deepEqual(r.lines, ['[forge-python] applied phrase_001 (8 -> 6 bars)']);
  assert.equal(a.querySelector('.forge-description-bar'), null);
  await r.advance(5000); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH], 'its own modify event finds the note synced');
});

test('the Python edited to something the grammar does not know: the note becomes CUSTOM - Python kept as typed, the json cache kept, one evidence line, and the banner stays (the controls are off) with Revert to generated', async () => {
  const r = rig();
  const a = r.pane();
  const original = r.store.get(PATH)!;
  const typed = withPython(original, (py) => py.replace('  return bars', THIN));
  r.store.set(PATH, typed); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH]);
  assert.equal(isCustomNote(r.store.get(PATH)!), true);
  assert.ok(r.store.get(PATH)!.includes('thin_out_bars(bars=[bars[1]]'), 'the Python is what was typed');
  assert.deepEqual(r.lines, ['[forge-python] phrase_001 is now a custom note (its Python is not a shape the grammar knows)']);
  assert.equal(msg(a), CUSTOM_BANNER); assert.deepEqual(buttons(a), ['revert-generated']);
  assert.ok(a.querySelector('.forge-description-bar.is-custom'), 'the banner has its own look');
  assert.equal((readPhraseNote(r.store.get(PATH)!) as any).value.bars, 8, 'the json cache is what the grammar last understood');
  // the Description of a custom note is free text: editing it writes nothing and the banner stays
  r.store.set(PATH, edit(r.store.get(PATH)!, '8 bars', 'eight bars of my own'));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH]); assert.equal(msg(a), CUSTOM_BANNER);
});

test('a custom note opened (inspect): the banner is shown and nothing is written; Revert to generated asks first, naming what is lost - "Keep my Python" changes nothing, "Revert" puts back the note the controls made', async () => {
  const original = noteContentFor('phrase_001', EXTEND);
  const typed = withPython(original, (py) => py.replace('  return bars', THIN));
  const first = rig();
  first.store.set(PATH, typed); first.ctl.modified(PATH); await first.advance(DESCRIPTION_DEBOUNCE_MS);
  const custom = first.store.get(PATH)!;
  const no = rig({ start: custom, confirm: false }); const na = no.pane();
  await no.ctl.inspect(PATH);
  assert.equal(msg(na), CUSTOM_BANNER); assert.deepEqual(buttons(na), ['revert-generated']); assert.deepEqual(no.writes, []);
  (na.querySelector('[data-action="revert-generated"]') as HTMLElement).click(); await no.advance(1);
  assert.deepEqual(no.confirms, [REVERT_GENERATED_CONFIRM]);
  assert.deepEqual(no.writes, [], 'declined: nothing is written'); assert.equal(isCustomNote(no.store.get(PATH)!), true);
  const yes = rig({ start: custom, confirm: true }); const ya = yes.pane();
  await yes.ctl.inspect(PATH);
  (ya.querySelector('[data-action="revert-generated"]') as HTMLElement).click(); await yes.advance(1);
  assert.deepEqual(yes.writes, [PATH]);
  assert.equal(yes.store.get(PATH), original, 'byte for byte the note the controls made');
  assert.deepEqual(yes.lines, ["[forge-python] reverted phrase_001 to the grammar's Python (from the json cache)"]);
  assert.equal(ya.querySelector('.forge-description-bar'), null);
});

test('the Description AND the Python edited: nothing is applied, the bar names both and offers one button for each; "Update from Python" keeps the Python (the Description edit is dropped)', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, withPython(edit(r.store.get(PATH)!, '8 bars', '3 bars'), (py) => py.replace('bars=8', 'bars=5')));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, []);
  assert.equal(msg(a), 'Description and Python were both edited; keep one: Update from Description / Update from Python.');
  assert.deepEqual(buttons(a), ['update', 'update-python']);
  assert.deepEqual(r.lines, ['[forge-python] refused phrase_001: Description and Python were both edited; keep one: Update from Description / Update from Python.']);
  (a.querySelector('[data-action="update-python"]') as HTMLElement).click(); await r.advance(1);
  assert.equal((readPhraseNote(r.store.get(PATH)!) as any).value.bars, 5, 'the Python won');
  assert.equal(a.querySelector('.forge-description-bar'), null);
});

test('the Python edited while the bar already says something about the Description (a sentence that does not parse) is "both edited" too, and Revert drops the Python edit with the rest', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, withPython(edit(r.store.get(PATH)!, '8 bars', '8 barz'), (py) => py.replace('bars=8', 'bars=5')));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(buttons(a), ['update', 'update-python']);
  assert.deepEqual(r.writes, []);
});

test('dispose with a custom banner on screen takes the bar away and a later modify does nothing', async () => {
  const r = rig();
  const a = r.pane();
  r.store.set(PATH, withPython(r.store.get(PATH)!, (py) => py.replace('  return bars', THIN)));
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.ok(a.querySelector('.forge-description-bar'));
  r.ctl.dispose();
  assert.equal(a.querySelector('.forge-description-bar'), null);
  r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH]);
});

// 2026-11-03-1155-8 (C, CCQA smoke 12 step 8): the banner was driven only by a `modify` and by `file-open` of ONE file; after "Reload app without saving" the restored panes were never looked at, so a custom note had no banner and no Revert.
// `inspectOpen` looks at every pane that shows one of our notes and has not been looked at yet (a tab opened, a layout restored).
const customStart = async (): Promise<string> => { const first = rig(); first.store.set(PATH, withPython(first.store.get(PATH)!, (py) => py.replace('  return bars', THIN))); first.ctl.modified(PATH); await first.advance(DESCRIPTION_DEBOUNCE_MS); return first.store.get(PATH)!; };

test('a custom note in a pane nobody inspected (a reload): inspectOpen draws the banner with Revert to generated, writes nothing, and looks at a pane once (not at every layout change)', async () => {
  const custom = await customStart();
  assert.equal(isCustomNote(custom), true);
  const r = rig({ start: custom, confirm: true }); const a = r.pane();
  r.ctl.syncBars();
  assert.equal(a.querySelector('.forge-description-bar'), null, 'without a look there is nothing to draw (the failure the smoke saw)');
  await r.ctl.inspectOpen();
  assert.equal(msg(a), CUSTOM_BANNER); assert.deepEqual(buttons(a), ['revert-generated']); assert.deepEqual(r.writes, []);
  const reads = r.reads.length;
  await r.ctl.inspectOpen(); await r.ctl.inspectOpen();
  assert.equal(r.reads.length, reads, 'the same pane showing the same note is not read again');
  r.pane();                                                                                                 // a second pane (the notes pane) showing the note: looked at, same banner
  await r.ctl.inspectOpen();
  assert.equal(r.reads.length, reads + 1);
});

test('the second door: canRevertGenerated is true only on a custom note that has a json cache, revertGenerated asks first and puts back the note the controls made', async () => {
  const original = noteContentFor('phrase_001', EXTEND);
  const custom = await customStart();
  const r = rig({ start: custom, confirm: true }); r.pane();
  assert.equal(r.ctl.canRevertGenerated(PATH), false, 'before any look the controller does not know');
  await r.ctl.inspectOpen();
  assert.equal(r.ctl.canRevertGenerated(PATH), true);
  await r.ctl.revertGenerated(PATH); await r.advance(1);
  assert.deepEqual(r.confirms, [REVERT_GENERATED_CONFIRM]); assert.equal(r.store.get(PATH), original);
  assert.equal(r.ctl.canRevertGenerated(PATH), false, 'and once reverted the command is not offered');
  const plain = rig(); plain.pane(); await plain.ctl.inspectOpen();
  assert.equal(plain.ctl.canRevertGenerated(PATH), false, 'a note that is not custom has nothing to revert');
});

test('edits made while the plugin was off are only LOOKED at when the pane opens (nothing is written): a Recipe, a Python and a Description edit each show their bar with their buttons; a Python that is not a known shape offers to make the note custom', async () => {
  const base = noteContentFor('phrase_001', EXTEND);
  const cases: Array<[string, string, string[]]> = [
    ['recipe', base.replace('Repeat it for 8 bars', 'Repeat it for 6 bars'), ['update-recipe', 'revert']],
    ['python', withPython(base, (py) => py.replace('bars=8', 'bars=5')), ['update-python', 'revert']],
    ['custom python', withPython(base, (py) => py.replace('  return bars', THIN)), ['update-python', 'revert']],
    ['description', edit(base, '8 bars', '5 bars'), ['update', 'revert']],
  ];
  for (const [label, text, expected] of cases) {
    assert.notEqual(text, base, `${label}: the fixture really differs`);
    const r = rig({ start: text }); const a = r.pane();
    await r.ctl.inspectOpen();
    assert.deepEqual(buttons(a), expected, label); assert.deepEqual(r.writes, [], `${label}: opening only looks`);
  }
});

// 2026-11-03-1155-8 (D4, CCQA smoke 12 step 6): applying a known-shape Python writes the grammar's own text, so a person's `#` comments inside it are gone. Said once, only when comments were really dropped.
test('D4: a known-shape Python edit that carried the person\'s comments says so - in the evidence line and in the bar (no buttons); a later edit takes the bar away; the generator\'s own trailing comment and a # inside a string are not "comments dropped"', async () => {
  const r = rig(); const a = r.pane();
  const mine = withPython(r.store.get(PATH)!, (py) => py.replace('bars=8', 'bars=6').replace('  base = bar_007()', '  # my note\n  base = bar_007()  # and another'));
  r.store.set(PATH, mine); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.writes, [PATH]);
  assert.ok(!/# my note/.test(r.store.get(PATH)!), 'the comments really are gone from the note');
  assert.deepEqual(r.lines, ['[forge-python] applied phrase_001 (8 -> 6 bars); comments in the Python are not kept']);
  assert.equal(msg(a), 'Applied from the Python; comments in the Python are not kept.'); assert.deepEqual(buttons(a), []);
  await r.advance(5000); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(msg(a), 'Applied from the Python; comments in the Python are not kept.', 'its own modify event does not take the sentence away');
  r.store.set(PATH, edit(r.store.get(PATH)!, '6 bars', '5 bars')); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.equal(a.querySelector('.forge-description-bar') === null, true, 'the next edit settles it: the sentence goes');
});

test('D4: a Python edit WITHOUT comments (and one whose only comment is the generator\'s own, or inside a string) says nothing about comments', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, withPython(r.store.get(PATH)!, (py) => py.replace('bars=8', 'bars=6'))); r.ctl.modified(PATH); await r.advance(DESCRIPTION_DEBOUNCE_MS);
  assert.deepEqual(r.lines, ['[forge-python] applied phrase_001 (8 -> 6 bars)']);
  assert.equal(a.querySelector('.forge-description-bar') === null, true);
  assert.deepEqual(pythonCommentsOf("x = 'a # b'  # real\n# whole line\ny = \"#nope\""), ['# real', '# whole line']);
});

test('D5: the confirm of "Revert to generated" says the Description is the source again (a note that was Recipe-sourced comes back Description-sourced, as the controls make it), and so does the note it writes', async () => {
  assert.match(REVERT_GENERATED_CONFIRM, /the Description is the source again/);
  const custom = await customStart();
  const r = rig({ start: asRecipeSourced(custom), confirm: true }); r.pane();
  await r.ctl.inspectOpen(); await r.ctl.revertGenerated(PATH); await r.advance(1);
  assert.match(r.store.get(PATH)!, /source_facet: description/);
  assert.equal(r.confirms.length, 1); assert.match(r.confirms[0], /the Description is the source again/);
});
