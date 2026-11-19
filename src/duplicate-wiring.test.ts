// 2026-11-19-0992 - DUPLICATE A BAR FROM THE COMPOSER, on the surface a person uses: the REAL controller (built through the plugin's own ports mapping, description-wiring.ts) + composer + dialog in happy-dom over an in-memory vault.
// Pinned: `Duplicate [[bar_007]].` typed by hand is read LOCALLY (the sentence service is never asked, even when it is set up); the first Enter is the usual preview ("Copy [[bar_007]] to a new bar.") and writes nothing, the second
// creates the copy (a bar: the next free number; a phrase, an arrangement, a composition likewise); the dialog logs "Created [[bar_010]], a copy of [[bar_007]]." with LINKS that open the notes; the phrase note is NEVER written (not one
// `process` call, byte for byte what it was) and the action never enters its list; unknown or missing links, a bare "Duplicate" and a text with other sentences are refused in plain words; undo is not claimed (the dialog says how to delete
// a copy; the copy is not on the list's undo stack); auto-apply never skips this preview; the click gesture's two controller halves (is the next click a copy click? what does the click do?); P3: an arrangement's and a composition's composer
// do not read the sentence. Written RED first. A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogButtons, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { planNewBar } from './score-first-core.ts';
import { PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { ARR_001 } from './test-support/sentence-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md';
const BAR = (planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content;
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

interface RigOpts { path?: string; note?: string; extra?: Record<string, string>; service?: boolean; autoApply?: boolean; noCreate?: boolean }
function rig(opts: RigOpts = {}) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>([[path, opts.note ?? emptyPhraseNote('phrase_001')], ['bars/bar_005.md', BAR], ['bars/bar_007.md', BAR.replace('bar_001', 'bar_007')], ['phrases/phrase_008.md', asListNote(PLAYGROUND_PHRASES.phrase_008, 'phrase_008')], ['phrases/phrase_003.md', asListNote(PLAYGROUND_PHRASES.phrase_003, 'phrase_003')], ['arrangements/arr_001.md', ARR_001], ['phrases/phrase_002.md', emptyPhraseNote('phrase_002')], ['kits/rock.md', 'kit'], ['kits/latin.md', 'kit'], ...Object.entries(opts.extra ?? {})]);
  const writes: string[] = []; let processCalls = 0, serviceCalls = 0; const timers: Array<() => void> = []; const opened: string[] = []; const creates: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { processCalls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    ...(opts.noCreate ? {} : { create: async (p: string, c: string) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); creates.push(p); }, exists: (p: string) => store.has(p), isAlreadyExists: (e: unknown) => /already exists/i.test((e as Error)?.message ?? '') }),
  }, {
    ...(opts.service ? { askPlan: async () => { serviceCalls++; return { status: 200, json: {} }; }, planConfigured: () => true } : {}),
    composerAutoApply: () => opts.autoApply === true,
    composerMenu: () => ({ items: [{ id: 'new_phrase', label: 'New phrase' }], run: () => {} }),
    openNote: (id: string) => { opened.push(id); },
  });
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); field().dispatchEvent(e); await flush(); return e.defaultPrevented as boolean; };
  const enter = () => press({ key: 'Enter' });
  const escape = () => press({ key: 'Escape' });
  const undoKey = () => press({ key: 'z', metaKey: true });
  const say = async (sentence: string) => { type(sentence); await enter(); await enter(); };
  const links = () => [...el.querySelectorAll('.forge-chat-link')] as HTMLElement[];
  const suggestion = () => [...el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  const applied = () => dialogEntries(el).filter((e) => e.kind === 'applied').map((e) => e.text.replace(/^✓\s*/, ''));
  const list = () => extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  return { ctl, store, writes, el, flush, field, type, enter, escape, undoKey, say, links, suggestion, applied, list, opened, creates, path, ready: async () => { await ctl.inspect(path); await flush(); }, calls: () => processCalls, service: () => serviceCalls, entries: () => dialogEntries(el), last: () => dialogLast(el), buttons: () => dialogButtons(el) };
}
type Rig = ReturnType<typeof rig>;
const barFiles = (r: Rig): string[] => [...r.store.keys()].filter((k) => k.startsWith('bars/')).sort();

// ---- typed by hand: read locally, preview, then the copy ---------------------------------------------------------------------------------------------------------------------------------
test('"Duplicate [[bar_007]]." typed: the FIRST Enter is the usual preview "Copy [[bar_007]] to a new bar." and writes NOTHING (no note, no process, the service not asked)', async () => {
  const r = rig({ service: true }); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter();
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview'], 'the usual preview: Enter applies, Esc discards');
  assert.equal(r.suggestion(), 'Copy [[bar_007]] to a new bar.');
  assert.deepEqual(r.creates, []); assert.deepEqual(barFiles(r), ['bars/bar_005.md', 'bars/bar_007.md']); assert.equal(r.calls(), 0); assert.equal(r.service(), 0, 'read LOCALLY: no model call');
});

test('the SECOND Enter creates bars/bar_008 (one past the highest), the dialog logs "Created [[bar_008]], a copy of [[bar_007]]." with links that open the notes; the composer is empty', async () => {
  const r = rig({ service: true }); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter(); await r.enter();
  assert.deepEqual(r.creates, ['bars/bar_008.md']);
  assert.ok(r.applied().includes('Created [[bar_008]], a copy of [[bar_007]].'), JSON.stringify(r.applied()));
  assert.deepEqual(r.links().map((b) => b.textContent), ['[[bar_008]]', '[[bar_007]]']);
  r.links()[0].click(); assert.deepEqual(r.opened, ['bars/bar_008'], 'the link opens the COPY (the plugin opens a bar in the Beat Box)');
  r.links()[1].click(); assert.deepEqual(r.opened, ['bars/bar_008', 'bars/bar_007']);
  assert.equal(r.field().value, ''); assert.equal(r.service(), 0);
});

test('the PHRASE is not changed at all: no write, not one process call, byte for byte what it was; the list is as it was (the action never enters the list); the source bar is untouched; the copy equals it', async () => {
  const r = rig(); await r.ready(); await r.say(EXTEND);
  const phraseBefore = r.store.get(PH)!, barBefore = r.store.get('bars/bar_007.md')!, writes = r.writes.length, calls = r.calls(), listBefore = r.list();
  assert.deepEqual(listBefore, [EXTEND]);
  r.type('Duplicate [[bar_007]].'); await r.enter(); await r.enter();
  assert.equal(r.store.get(PH), phraseBefore, 'the phrase note is byte for byte what it was'); assert.equal(r.writes.length, writes); assert.equal(r.calls(), calls, 'not one more process call');
  assert.deepEqual(r.list(), listBefore); assert.ok(!r.store.get(PH)!.includes('Duplicate'), 'the sentence is nowhere in the note');
  assert.equal(r.store.get('bars/bar_007.md'), barBefore, 'the source is byte for byte what it was');
  const copy = r.store.get('bars/bar_008.md')!; assert.equal(copy.slice(copy.indexOf('```json')), barBefore.slice(barBefore.indexOf('```json')), 'the data is a byte for byte copy');
});

test('UNDO is not claimed: the dialog says how to delete the copy; Cmd/Ctrl+Z does not remove it and the copy is not on the list\'s undo stack ("Undo last sentence" is as it was)', async () => {
  const r = rig(); await r.ready();
  assert.equal(r.ctl.canUndo(r.path), false);
  r.type('Duplicate [[bar_007]].'); await r.enter(); await r.enter();
  const said = r.entries().filter((e) => e.kind === 'notice').map((e) => e.text).join(' ');
  assert.match(said, /Cmd\/Ctrl\+Z does not take a copy back/); assert.match(said, /delete/i); assert.ok(said.includes('bars/bar_008'));
  assert.ok(!r.applied().some((t) => /undo|take.*back/i.test(t)), 'the line that says it was made does not offer an undo');
  assert.equal(r.ctl.canUndo(r.path), false, 'a copy is not a sentence of the list');
  await r.undoKey(); assert.ok(r.store.has('bars/bar_008.md'), 'Cmd/Ctrl+Z in the empty composer does not remove the copy');
});

test('a PHRASE, an ARRANGEMENT and a COMPOSITION link: the copy is made under the next free name by that kind\'s own rule (a phrase: one past the highest; an arrangement: the first not taken); the previews say so', async () => {
  const r = rig(); await r.ready();
  r.type('Duplicate [[phrase_008]].'); await r.enter(); assert.equal(r.suggestion(), 'Copy [[phrase_008]] to a new phrase.'); await r.enter();
  r.type('Duplicate [[arr_001]].'); await r.enter(); assert.equal(r.suggestion(), 'Copy [[arr_001]] to a new arrangement.'); await r.enter();
  assert.deepEqual(r.creates, ['phrases/phrase_009.md', 'arrangements/arr_002.md']);
  assert.ok(r.applied().includes('Created [[phrase_009]], a copy of [[phrase_008]].')); assert.ok(r.applied().includes('Created [[arr_002]], a copy of [[arr_001]].'));
  assert.deepEqual(r.links().map((b) => b.getAttribute('data-note')), ['phrases/phrase_009', 'phrases/phrase_008', 'arrangements/arr_002', 'arrangements/arr_001']);
  assert.equal(r.store.get('phrases/phrase_008.md'), asListNote(PLAYGROUND_PHRASES.phrase_008, 'phrase_008'), 'the source phrase is untouched');
});

// ---- refusals, in plain words -----------------------------------------------------------------------------------------------------------------------------------------------------------
test('an UNKNOWN link is refused in plain words at the FIRST Enter (nothing created, the service not asked, the field keeps the text)', async () => {
  const r = rig({ service: true }); await r.ready();
  r.type('Duplicate [[bar_099]].'); await r.enter();
  assert.match(r.last(), /There is no note called \[\[bar_099\]\] in this vault, so there is nothing to duplicate\./); assert.deepEqual(r.buttons(), []);
  assert.deepEqual(r.creates, []); assert.equal(r.service(), 0); assert.equal(r.field().value, 'Duplicate [[bar_099]].'); assert.equal(r.calls(), 0);
});

test('a link whose note has gone since the preview (listed, no longer readable) is refused at the apply in plain words and creates nothing', async () => {
  const r = rig(); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter();
  r.store.set('bars/bar_007.md', 'not a bar any more');
  await r.enter();
  assert.deepEqual(r.creates, []); assert.ok(r.entries().some((e) => e.kind === 'failed' && /bar_007/.test(e.text)), JSON.stringify(r.entries().map((e) => e.text)));
  assert.ok(!r.entries().some((e) => /undefined|\[object/.test(e.text)));
});

test('a bare "Duplicate", and "Duplicate" with other sentences, are refused in plain words and never sent to the service; the Enter writes nothing', async () => {
  const r = rig({ service: true }); await r.ready();
  r.type('Duplicate'); await r.enter();
  assert.match(r.last(), /Duplicate what\? Click a bar on the Score/);
  r.type('Duplicate [[bar_007]]. Keep bars 1 to 2.'); await r.enter();
  assert.match(r.last(), /on its own/);
  r.type('Keep bars 1 to 2. Duplicate [[bar_007]].'); await r.enter();
  assert.match(r.last(), /on its own/);
  assert.equal(r.service(), 0); assert.deepEqual(r.creates, []); assert.equal(r.calls(), 0); assert.deepEqual(r.buttons(), []);
});

test('a note the controls would overwrite (a phrase with a hand edit) is refused at the PREVIEW in plain words; nothing is created', async () => {
  const edited = asListNote(PLAYGROUND_PHRASES.phrase_008, 'phrase_008').replace('Thin out bars 3 to 5', 'Thin out bars 1 to 2');
  const r = rig({ extra: { 'phrases/phrase_008.md': edited } }); await r.ready();
  r.type('Duplicate [[phrase_008]].'); await r.enter();
  assert.match(r.last(), /\[\[phrase_008\]\]/); assert.deepEqual(r.buttons(), []); assert.deepEqual(r.creates, []);
});

test('MUSIC_COMPOSER_AUTO_APPLY (on) never skips this preview: a copy is a new note, so the person always sees "Copy [[bar_007]] to a new bar." first', async () => {
  const r = rig({ autoApply: true }); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter();
  assert.deepEqual(r.creates, [], 'nothing is created by the first Enter'); assert.equal(r.suggestion(), 'Copy [[bar_007]] to a new bar.'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  await r.enter(); assert.deepEqual(r.creates, ['bars/bar_008.md']);
});

test('Esc on the preview discards it: nothing is created; a build with no way to create notes says so in words (no silent nothing)', async () => {
  const r = rig(); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter(); await r.escape();
  assert.deepEqual(r.buttons(), []); assert.deepEqual(r.creates, []); assert.equal(r.field().value, 'Duplicate [[bar_007]].');
  const lean = rig({ noCreate: true }); await lean.ready();
  lean.type('Duplicate [[bar_007]].'); await lean.enter();
  assert.match(lean.last(), /Duplicate is not available in this build: it cannot copy notes here\./); assert.deepEqual(lean.buttons(), []);
});

// ---- the click gesture: the controller's two halves --------------------------------------------------------------------------------------------------------------------------------------------
test('duplicateArmed: the next click is a copy click when the composer\'s text is exactly "Duplicate" or ends with the word, any case, trimmed; for a PHRASE tab only', async () => {
  const r = rig(); await r.ready();
  const armed = (t: string) => { r.type(t); return r.ctl.duplicateArmed(r.path); };
  for (const yes of ['Duplicate', 'duplicate', '  DUPLICATE ', 'Keep bars 1 to 2. duplicate']) assert.equal(armed(yes), true, yes);
  for (const no of ['', 'Duplicate [[bar_007]].', 'Duplicates', 'Keep bars 1 to 2.', 'Duplicate it']) assert.equal(armed(no), false, no);
  r.type('Duplicate'); assert.equal(r.ctl.duplicateArmed('phrases/not_open.md'), false, 'a note with no composer is never armed');
  const arr = rig({ path: 'arrangements/arr_009.md', note: emptyArrangementNote('arr_009') }); await arr.ready(); arr.type('Duplicate');
  assert.equal(arr.ctl.duplicateArmed(arr.path), false, 'P3: only a phrase tab has the gesture');
});

test('duplicateClick: appends " [[bar_007]]." to the text, returns focus to the field and shows the usual preview; Enter applies; the next click is no longer a copy click', async () => {
  const r = rig(); await r.ready(); r.type('Duplicate');
  const done = await r.ctl.duplicateClick(r.path, 'bars/bar_007'); await r.flush();
  assert.equal(done.ok, true);
  assert.equal(r.field().value, 'Duplicate [[bar_007]].');
  assert.ok(win.document.activeElement === r.field(), 'focus is back in the field');
  assert.equal(r.suggestion(), 'Copy [[bar_007]] to a new bar.'); assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.equal(r.ctl.duplicateArmed(r.path), false, 'a normal click pins again');
  assert.deepEqual(r.creates, [], 'the click only previews');
  await r.enter(); assert.deepEqual(r.creates, ['bars/bar_008.md']);
});

test('duplicateClick: a click on a note of a phrase (a transform\'s bar) copies the PHRASE; a bar with no known source, and a kit, say so in words and change nothing', async () => {
  const r = rig(); await r.ready(); r.type('Duplicate');
  await r.ctl.duplicateClick(r.path, 'phrases/phrase_008'); await r.flush();
  assert.equal(r.field().value, 'Duplicate [[phrase_008]].'); assert.equal(r.suggestion(), 'Copy [[phrase_008]] to a new phrase.');
  const r2 = rig(); await r2.ready(); r2.type('Duplicate');
  const none = await r2.ctl.duplicateClick(r2.path, null); await r2.flush();
  assert.equal(none.ok, false); assert.match(none.message, /which note made that bar/i); assert.equal(r2.field().value, 'Duplicate');
  const kit = await r2.ctl.duplicateClick(r2.path, 'kits/rock'); await r2.flush();
  assert.equal(kit.ok, false); assert.equal(r2.field().value, 'Duplicate'); assert.deepEqual(r2.creates, []);
});

test('duplicateClick when the text is not "Duplicate" does nothing (the Score pins; defence in depth), and with no composer open it says so', async () => {
  const r = rig(); await r.ready(); r.type('Keep bars 1 to 2.');
  const d = await r.ctl.duplicateClick(r.path, 'bars/bar_007'); assert.equal(d.ok, false); assert.equal(r.field().value, 'Keep bars 1 to 2.');
  const gone = await r.ctl.duplicateClick('phrases/other.md', 'bars/bar_007'); assert.equal(gone.ok, false);
});

// ---- P3: the other composers ---------------------------------------------------------------------------------------------------------------------------------------------------------------
test('P3: an ARRANGEMENT\'s composer does not read the sentence (it is the grammar\'s: "not accepted"); nothing is created and the service gate is the one it always was', async () => {
  const r = rig({ path: 'arrangements/arr_009.md', note: emptyArrangementNote('arr_009'), service: true }); await r.ready();
  r.type('Duplicate [[bar_007]].'); await r.enter();
  assert.ok(r.entries().some((e) => e.kind === 'rejected'), 'the grammar did not accept it, as before this drain');
  assert.ok(!r.entries().some((e) => e.kind === 'suggestion' || /Copy \[\[|Duplicate what|on its own/.test(e.text)), 'not read as an action');
  assert.deepEqual(r.creates, []); assert.deepEqual(barFiles(r), ['bars/bar_005.md', 'bars/bar_007.md']);
});
