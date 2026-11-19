// 2026-11-19-0980 (THE LIST MODEL, stage 2: PHRASES) - the REAL controller + composer + dialog in happy-dom, for a phrase whose Description is an ordered list: line 1 is the HEAD (Extend, Mix, Morph or Take), later lines are transforms. Written RED first against
// the stage-1 controller (a phrase REPLACED its whole Description, showed it in the composer, previewed in the box and had no undo). Pinned here, every action counted (ONE `process` call and ONE write per apply, undo and redo):
//   * Enter appends; the preview says "This replaces: ..."; a later head replaces line 1; Cmd/Ctrl+Z in the empty composer takes back the last apply, Shift redoes; the "+" menu has the two items;
//   * a structure step after a density step is REFUSED in words and never sent to the sentence service; never re-sorted;
//   * a random line draws its seed ONCE (the preview shows it, the apply writes the SAME one, undo and redo keep it);
//   * the composer no longer shows the Description; the bar-selection menu's sentence is APPENDED as a line (`appendLine`), not shown in the box;
//   * a legacy paragraph is split on the first recompute, never on open; a hand edit is re-read; the service's plan is appended as lines;
//   * P3: an arrangement, a composition, a bar and a plain note in the same vault are byte for byte what they were. A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogButtons, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote, isEmptyNote } from './empty-note-core.ts';
import { readPhraseNote } from './phrase-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';
import { ARR_001 } from './test-support/sentence-list-fixtures.ts';

const descriptionLines = (text: string): string[] => extractDescription(text).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md';

interface RigOpts { path?: string; note?: string; extra?: Record<string, string>; service?: () => Promise<{ status: number; json: unknown }>; seeds?: number[] }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>([[path, opts.note ?? emptyPhraseNote('phrase_001')], ...Object.entries(opts.extra ?? {})]);
  const writes: string[] = []; let processCalls = 0; const timers: Array<() => void> = []; let serviceCalls = 0; const drawn: number[] = [];
  const seeds = [...(opts.seeds ?? [])];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    drawSeed: () => { const n = seeds.length > 0 ? seeds.shift()! : 99; drawn.push(n); return n; },
    ...(opts.service !== undefined ? { askPlan: async () => { serviceCalls++; return opts.service!(); }, configured: () => true } : {}),
    composerMenu: () => ({ items: [{ id: 'new_phrase', label: 'New phrase' }], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const escape = () => press({ key: 'Escape' });
  const undoKey = (mod: 'meta' | 'ctrl' = 'meta', shift = false) => press({ key: shift ? 'Z' : 'z', [`${mod}Key`]: true, shiftKey: shift });
  const runTimers = async () => { const t = timers.splice(0); for (const fn of t) fn(); await flush(); };
  const menuItems = () => [...el.querySelectorAll('.forge-composer-menuitem')] as HTMLElement[];
  const menuItem = (label: string) => menuItems().find((b) => b.textContent === label);
  const openMenu = async () => { const plus = el.querySelector('.forge-composer-plus') as HTMLElement; if ((el.querySelector('.forge-composer-menu') as HTMLElement).hidden === false) { plus.click(); await flush(); } plus.click(); await flush(); };
  const text = () => store.get(path)!;
  const list = () => descriptionLines(text());
  const params = () => { const r = readPhraseNote(text()); return r.ok ? r.value as any : null; };
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const hand = async (body: string) => { store.set(path, replaceDescriptionSection(text(), body)!); ctl.modified(path); await runTimers(); };
  return { ctl, store, writes, el, flush, field, type, enter, escape, undoKey, press, runTimers, menuItems, menuItem, openMenu, text, list, params, say, hand, drawn, ready: async () => { await ctl.inspect(path); await flush(); }, calls: () => processCalls, serviceCalls: () => serviceCalls, entries: () => dialogEntries(el), last: () => dialogLast(el), buttons: () => dialogButtons(el), path };
}
type Rig = ReturnType<typeof rig>;
const empty = (r: Rig): boolean => r.field().value === '';
/** The text of the newest suggestion in the dialog: its words ("This replaces: ...") and the sentence it proposes. */
const suggestion = (r: Rig): string => `${r.entries().filter((e) => e.kind === 'suggestion').pop()!.text} ${[...r.el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? ''}`;

const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

// ---- Enter appends: a head, then lines --------------------------------------------------------------------------------------------------------------------------------------------------------
test('a NEW phrase (empty) takes a HEAD as its first line, in ONE write: a list of one item, the json of that kind, the composer empty; the preview wrote nothing', async () => {
  const r = rig(); await r.ready(); assert.ok(isEmptyNote(r.text())); assert.ok(empty(r));
  r.type('Extend [[bar_005]] to 4 bars, repeating with fills.'); await r.enter();
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']); assert.deepEqual(r.writes, []); assert.equal(r.calls(), 0);
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND]); assert.equal(extractDescription(r.text()), `1. ${EXTEND}`); assert.equal(r.params().kind, 'extend');
  assert.equal(r.writes.length, 1); assert.equal(r.calls(), 1); assert.ok(empty(r), 'the composer is empty after an apply');
});

for (const h of [
  { kind: 'extend', typed: 'Extend [[bar_005]] to 4 bars, repeating with fills.' },
  { kind: 'mix', typed: 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.' },
  { kind: 'morph', typed: 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.' },
  { kind: 'transform', typed: 'Take [[phrase_003]].' },
]) {
  test(`the four heads, ${h.kind}: typed alone it makes the note (Recipe, Python and json all written by the one write); the same text is what the list says`, async () => {
    const r = rig(); await r.ready(); await r.say(h.typed);
    assert.deepEqual(r.list(), [h.typed]); assert.equal(r.params().kind, h.kind);
    assert.ok((extractRecipeSection(r.text()) ?? '').trim().length > 0, 'a Recipe'); assert.match(extractPythonSection(r.text()) ?? '', /def compute/); assert.equal(r.writes.length, 1);
  });
}

test('a head and THREE lines, one write each: the Score input (the json cache) follows the whole list; the lines are in the order they were applied', async () => {
  const r = rig(); await r.ready();
  await r.say(EXTEND); await r.say('make it 20 percent slower'); await r.say('Bar 2 is replaced by [[bar_009]].'); await r.say('Keep bars 1 to 3.');
  assert.deepEqual(r.list(), [EXTEND, 'Make it 20 percent slower.', 'Bar 2 is replaced by [[bar_009]].', 'Keep bars 1 to 3.']);
  const p = r.params(); assert.equal(p.kind, 'extend'); assert.equal(p.tempo_change_pct, -20); assert.deepEqual(p.overrides, { '2': 'bars/bar_009' }); assert.deepEqual(p.ops, [{ op: 'keep', runs: [[1, 3]] }]);
  assert.equal(r.writes.length, 4); assert.equal(r.calls(), 4); assert.ok(empty(r));
  assert.ok(r.entries().filter((e) => e.kind === 'applied').length >= 4);
});

test('the composer shows nothing of the Description: a phrase that already has lines opens with an EMPTY composer, and stays empty after an apply', async () => {
  const start = rig(); await start.ready(); await start.say(EXTEND); await start.say('Keep bars 1 to 2.');
  const again = rig({ note: start.text() }); await again.ready(); assert.ok(empty(again));
  const legacy = rig({ note: PLAYGROUND_PHRASES.phrase_001 }); await legacy.ready(); assert.ok(empty(legacy), 'a legacy paragraph is not shown in the composer either');
});

// ---- the conflict rule: This replaces ----------------------------------------------------------------------------------------------------------------------------------------------------------
test('a modifier said again: the preview says "This replaces: <the old line>" in plain text, and Enter replaces that line IN PLACE', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await r.say('Make it 20 percent slower.'); await r.say('Keep bars 1 to 3.'); const w = r.writes.length;
  r.type('Make it 5 percent faster.'); await r.enter();
  assert.ok(suggestion(r).includes('This replaces: Make it 20 percent slower.'), suggestion(r)); assert.deepEqual(r.list(), [EXTEND, 'Make it 20 percent slower.', 'Keep bars 1 to 3.'], 'the preview writes nothing');
  await r.enter();
  assert.deepEqual(r.list(), [EXTEND, 'Make it 5 percent faster.', 'Keep bars 1 to 3.']); assert.equal(r.writes.length, w + 1); assert.equal(r.params().tempo_change_pct, 5);
});

test('a later HEAD replaces line 1 (the preview says what it replaces) and the lines still valid for it stay; a line that is no longer valid stops the replay with the unreadable-line words, nothing is dropped', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await r.say('Bar 2 is replaced by [[bar_009]].'); await r.say('Make it 20 percent slower.');
  r.type('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.'); await r.enter();
  const said = suggestion(r); assert.ok(said.includes(`This replaces: ${EXTEND}`), said);
  await r.enter();
  assert.deepEqual(r.list(), ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Bar 2 is replaced by [[bar_009]].', 'Make it 20 percent slower.'], 'every line is kept');
  const p = r.params(); assert.equal(p.kind, 'morph'); assert.deepEqual(p.overrides, { '2': 'bars/bar_009' });
  const notice = r.entries().filter((e) => e.kind === 'notice').pop()!.text; assert.ok(notice.startsWith('Line 3 is not a sentence I can read; the note shows lines 1 and 2.'), notice);
  assert.equal(r.el.querySelectorAll('.forge-chat-bang').length, 0, 'plain muted words, no "!" glyph');
  await r.undoKey(); assert.deepEqual(r.list(), [EXTEND, 'Bar 2 is replaced by [[bar_009]].', 'Make it 20 percent slower.'], 'undo puts the old head back where it was'); assert.equal(r.params().kind, 'extend');
});

test('a modifier a head cannot take is refused in words, the sentence service is NOT asked, nothing is written', async () => {
  const r = rig({ service: async () => ({ status: 200, json: { ok: true } }) }); await r.ready(); await r.say('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.'); const w = r.writes.length;
  r.type('Make it 10 percent faster.'); await r.enter();
  assert.match(r.last(), /tempo/i); assert.deepEqual(r.buttons(), []); assert.equal(r.writes.length, w); assert.equal(r.serviceCalls(), 0);
});

// ---- structure before density ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a structure step after a density step is REFUSED in words ("Do the structure steps first"), never re-sorted, nothing is written and the service is NOT asked', async () => {
  const r = rig({ service: async () => ({ status: 200, json: { ok: true } }) }); await r.ready();
  await r.say('Take [[phrase_003]].'); await r.say('Thin out bars 1 to 2, by half, keeping the downbeat.'); const w = r.writes.length, c = r.calls(), before = r.list();
  r.type('Keep bars 1 to 3.'); await r.enter();
  assert.match(r.last(), /Do the structure steps first/); assert.deepEqual(r.buttons(), []); assert.equal(r.writes.length, w); assert.equal(r.calls(), c); assert.equal(r.serviceCalls(), 0);
  assert.deepEqual(r.list(), before, 'the list is exactly what it was: not re-sorted');
  r.type('Thin out bars 3 to 4, by half, keeping the downbeat.'); await r.enter(); await r.enter();
  assert.equal(r.list().length, 3, 'a density step after a density step is fine');
});

// ---- the seed is drawn once ---------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a random line draws its seed ONCE: the preview shows "seed 5", the second Enter writes the SAME 5 (no second draw), and undo and redo give the same line', async () => {
  const r = rig({ seeds: [5, 6, 7] }); await r.ready();
  r.type('Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order.'); await r.enter();
  assert.ok(suggestion(r).includes('in seeded order, seed 5.'), suggestion(r)); assert.deepEqual(r.drawn, [5], 'drawn at the preview');
  await r.enter();
  assert.deepEqual(r.list(), ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 5.']); assert.equal(r.params().seed, 5); assert.deepEqual(r.drawn, [5], 'NOT drawn again at the apply');
  await r.undoKey(); assert.deepEqual(r.list(), []); await r.undoKey('meta', true);
  assert.deepEqual(r.list(), ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 5.']); assert.equal(r.params().seed, 5); assert.deepEqual(r.drawn, [5], 'a redo draws nothing');
  await r.say('Keep bars 1 to 2.'); assert.deepEqual(r.drawn, [5], 'a line with nothing random draws nothing');
});

test('a thin out "chosen at random" becomes "chosen by seed N" with one draw; the same replay twice gives the same Python', async () => {
  const r = rig({ seeds: [12] }); await r.ready(); await r.say('Take [[phrase_003]].'); await r.say('Thin out bars 1 to 2, by half, chosen at random.');
  assert.equal(r.list()[1], 'Thin out bars 1 to 2, by half, chosen by seed 12.'); assert.deepEqual(r.drawn, [12]);
  const py = extractPythonSection(r.text()); await r.hand(extractDescription(r.text()) + '\n'); assert.equal(extractPythonSection(r.text()), py);
});

// ---- undo and redo -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('Cmd+Z in an EMPTY composer takes back the last apply in ONE write ("Removed: <line>"); Shift+Cmd+Z puts it back in one write; Ctrl does the same', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await r.say('Make it 8 bars long.'); await r.say('Keep bars 1 to 3.'); const w = r.writes.length, c = r.calls();
  assert.equal(await r.undoKey('meta'), true);
  assert.deepEqual(r.list(), [EXTEND, 'Make it 8 bars long.']); assert.equal(r.params().ops, undefined); assert.equal(r.writes.length, w + 1); assert.equal(r.calls(), c + 1); assert.equal(r.last(), 'Removed: Keep bars 1 to 3.');
  await r.undoKey('meta', true);
  assert.deepEqual(r.list(), [EXTEND, 'Make it 8 bars long.', 'Keep bars 1 to 3.']); assert.equal(r.writes.length, w + 2); assert.equal(r.calls(), c + 2); assert.deepEqual(r.params().ops, [{ op: 'keep', runs: [[1, 3]] }]);
  await r.undoKey('ctrl'); assert.equal(r.list().length, 2); await r.undoKey('ctrl', true); assert.equal(r.list().length, 3);
});

test('undo of a REPLACED modifier puts the old line back in its place; undoing everything gives back the EMPTY note byte for byte; then the key is still ours and writes nothing', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND); await r.say('Make it 20 percent slower.'); await r.say('Make it 5 percent faster.');
  await r.undoKey(); assert.deepEqual(r.list(), [EXTEND, 'Make it 20 percent slower.']); assert.equal(r.params().tempo_change_pct, -20);
  assert.equal(r.last(), 'Removed: Make it 5 percent faster. Put back: Make it 20 percent slower.');
  await r.undoKey(); await r.undoKey(); assert.equal(r.text(), emptyPhraseNote('phrase_001'));
  const w = r.writes.length, c = r.calls(); assert.equal(await r.undoKey(), true); assert.equal(r.writes.length, w); assert.equal(r.calls(), c);
});

test('the "+" menu: the New actions, then "Undo last sentence" and "Redo", present and DISABLED (never hidden) when there is nothing, enabled when there is', async () => {
  const r = rig(); await r.ready(); await r.openMenu();
  const undo = r.menuItem('Undo last sentence'), redo = r.menuItem('Redo'); assert.ok(undo !== undefined && redo !== undefined);
  assert.equal(undo!.getAttribute('aria-disabled'), 'true'); assert.equal(redo!.getAttribute('aria-disabled'), 'true'); assert.deepEqual(r.menuItems().map((b) => b.textContent), ['New phrase', 'Undo last sentence', 'Redo']);
  await r.say(EXTEND); await r.openMenu(); assert.equal(r.menuItem('Undo last sentence')!.getAttribute('aria-disabled'), 'false');
  r.menuItem('Undo last sentence')!.click(); await r.flush(); assert.deepEqual(r.list(), []);
});

// ---- hand edits, migration, opening ------------------------------------------------------------------------------------------------------------------------------------------------------
test('OPENING a phrase writes NOTHING: an empty note, a list note, and every legacy paragraph note of the playground (no process call, no write, the same bytes)', async () => {
  const lister = rig(); await lister.ready(); await lister.say(EXTEND); await lister.say('Keep bars 1 to 2.');
  const notes: Array<[string, string]> = [['empty', emptyPhraseNote('phrase_001')], ['list', lister.text()], ...Object.entries(PLAYGROUND_PHRASES)];
  assert.equal(notes.length, 16);
  for (const [name, note] of notes) {
    const r = rig({ note }); await r.ready(); await r.ctl.inspectOpen(); r.ctl.syncBars(); await r.ready();
    assert.equal(r.calls(), 0, `${name}: no process call`); assert.deepEqual(r.writes, [], `${name}: no write`); assert.equal(r.text() === note, true, `${name}: the same bytes`);
  }
});

test('a legacy paragraph phrase (head + a threshold line) is split into a list on its FIRST recompute: the next sentence is appended to its lines, one write', async () => {
  const r = rig({ note: PLAYGROUND_PHRASES.phrase_002 }); await r.ready();
  r.type('Make it 4 bars long.'); await r.enter(); assert.match(r.last(), /^Make it 4 bars long\.$|mix|Extend or a Morph/i);
  r.type('Threshold 40 percent.'); await r.enter(); assert.ok(suggestion(r).includes('This replaces: Threshold 65 percent.'), suggestion(r)); await r.enter();
  assert.deepEqual(r.list(), ['Mix [[bar_007]] and [[bar_001]], 100 percent [[bar_007]], as a path, in musical order.', 'Threshold 40 percent.']);
  assert.equal(r.writes.length, 1); assert.equal(r.calls() >= 1, true); assert.equal(r.params().threshold, 0.4);
});

test('a hand edit of the list is re-read on save: a deleted middle line recomputes in one write; an unreadable line is kept and named in plain words, the lines after it are kept', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); await r.say('Keep bars 1 to 6.'); await r.say('Bar 2 is replaced by [[bar_005]].'); const w = r.writes.length;
  await r.hand('1. Take [[phrase_003]].\n3. Bar 2 is replaced by [[bar_005]].');
  assert.deepEqual(r.list(), ['Take [[phrase_003]].', 'Bar 2 is replaced by [[bar_005]].']); assert.equal(r.params().ops.length, 0); assert.equal(r.writes.length, w + 1);
  await r.hand('1. Take [[phrase_003]].\n2. keep the good bars\n3. Bar 2 is replaced by [[bar_005]].');
  assert.equal(extractDescription(r.text()), '1. Take [[phrase_003]].\n2. keep the good bars\n3. Bar 2 is replaced by [[bar_005]].');
  assert.ok(r.entries().filter((e) => e.kind === 'notice').pop()!.text.startsWith('Line 2 is not a sentence I can read; the note shows line 1.'));
});

// ---- the bar-selection menu appends a line -------------------------------------------------------------------------------------------------------------------------------------------------------
test('appendLine (the bar-selection menu): the sentence is APPENDED as a line in ONE write, undoable, and the composer is not touched; a refusal is returned in words', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); r.type('half typed'); const w = r.writes.length;
  const done = await r.ctl.appendLine(r.path, 'Delete bars 3 to 5.');
  assert.deepEqual(done, { ok: true, message: 'Added: Delete bars 3 to 5.' }); assert.deepEqual(r.list(), ['Take [[phrase_003]].', 'Delete bars 3 to 5.']); assert.equal(r.writes.length, w + 1);
  assert.equal(r.field().value, 'half typed', 'what the person was typing is left alone');
  r.type(''); await r.undoKey(); assert.deepEqual(r.list(), ['Take [[phrase_003]].']);
  await r.say('Double up bars 1 to 2.'); const again = await r.ctl.appendLine(r.path, 'Delete bar 1.');
  assert.equal(again.ok, false); assert.match(again.message, /Do the structure steps first/); assert.equal(r.list().length, 2);
});

test('suggestInBox is no longer how a phrase takes a bar-selection step: appendLine writes the line and leaves the composer text and the dialog\'s preview alone', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].');
  await r.ctl.appendLine(r.path, 'Copy bar 1.'); assert.ok(empty(r)); assert.deepEqual(r.buttons(), []);
  assert.ok(r.entries().some((e) => e.kind === 'applied' || e.kind === 'notice'));
});

// ---- the service's plan becomes lines ---------------------------------------------------------------------------------------------------------------------------------------------------
test('the sentence service\'s plan for a phrase is APPENDED as canonical lines (its head replaces line 1); one write on the second Enter', async () => {
  const plan = { kind: 'extend', bar: 'bar_006', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -10 };
  const r = rig({ service: async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null, version: '0.2.48' } }) }); await r.ready();
  await r.say('Take [[phrase_003]].'); await r.say('Keep bars 1 to 2.'); const w = r.writes.length;
  r.type('make the sixth bar into a long slow phrase'); await r.enter();
  assert.equal(r.entries().filter((e) => e.kind === 'suggestion').pop()!.text, 'The service suggests this. This replaces: Take [[phrase_003]].'); assert.equal(r.writes.length, w, 'the preview wrote nothing'); assert.equal(r.serviceCalls(), 1);
  await r.enter();
  assert.deepEqual(r.list(), ['Extend [[bar_006]] to 8 bars, repeating with fills, 10 percent slower.', 'Keep bars 1 to 2.']); assert.equal(r.writes.length, w + 1); assert.equal(r.params().kind, 'extend');
});

test('a sentence the grammar cannot read is not appended: the dialog says so and (without a service) nothing is written', async () => {
  const r = rig(); await r.ready(); r.type('make it groovier'); await r.enter();
  assert.ok(r.entries().some((e) => e.kind === 'rejected')); assert.deepEqual(r.writes, []); assert.equal(r.calls(), 0);
});

// ---- P3 -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('P3: an arrangement, a composition, a bar and a plain note in the same vault are byte for byte what they were after a phrase list is built, undone and redone', async () => {
  const others: Record<string, string> = { 'arrangements/arr_001.md': ARR_001, 'compositions/song_1.md': emptyCompositionNote('song_1'), 'arrangements/arr_002.md': emptyArrangementNote('arr_002'), 'bars/bar_001.md': 'bar text\n', 'notes/idea.md': '# Idea\n\nTake [[phrase_003]]. Keep bars 1 to 2.\n' };
  const r = rig({ extra: others }); const before = { ...others }; await r.ready();
  await r.say('Take [[phrase_003]].'); await r.say('Keep bars 1 to 2.'); await r.undoKey(); await r.undoKey('meta', true);
  for (const [p, t] of Object.entries(before)) assert.equal(r.store.get(p) === t, true, `${p} is untouched`);
  assert.ok(r.writes.every((p) => p === PH), 'only the phrase was written');
});

test('P3: an arrangement still APPENDS and a legacy arrangement paragraph still splits (stage 1 is unchanged by the phrase list)', async () => {
  const r = rig({ path: 'arrangements/arr_001.md', note: ARR_001 }); await r.ready();
  r.type('Mute the [[latin]] kit.'); await r.enter(); await r.enter();
  assert.deepEqual(r.list().slice(-1), ['Mute the [[latin]] kit.']); assert.equal(r.writes.length, 1);
});
