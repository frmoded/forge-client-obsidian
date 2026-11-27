// 2026-11-26-1047 (stage 5) - the behaviour the mutation pass over this drain found unpinned: Detach is one way, so a write that fails, the command's guard and its checking mode are pinned; the follow of a custom note's edited Python decides on the
// text its write finds; the sentences and trace lines a person reads; what Detach and "Restore to last commit" (reset) forget. Through the real controller and, for the command, the real plugin tabs.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS, DETACH_CONFIRM } from './description-apply-core.ts';
import { memoryStore } from './dialog-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { CUSTOM_BANNER, GENERATED_EDITED, asCustom, isCustomNote, withLinks } from './phrase-notes-core.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [] as string[], compositions: [] as string[], kits: [] as string[] };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const START = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');
const swap = (text: string, section: string, from: string, to: string): string => { assert.ok(section.includes(from), `the section has "${from}"`); return text.replace(section, section.replace(from, to)); };
const editDesc = (text: string, from: string, to: string): string => swap(text, extractDescription(text), from, to);
const editRecipe = (text: string, from: string, to: string): string => swap(text, extractRecipeSection(text)!, from, to);
/** A custom note whose Python was then changed by hand (its stamp and `links:` are behind). */
const editedCustom = (): string => { const c = asCustom(START()); assert.ok(c.includes('  return bars\n')); return c.replace('  return bars\n', '  extra = bar_008()\n  return bars\n'); };

const FOLLOWED = '[forge-custom] phrase_001: the links and the stamp follow its edited Python';
const HELD = '[forge-description] held phrase_001: the Description was edited, Forge applies it';
const UNREADABLE = 'make it longer please and slower';

function rig(opts: { start?: string; tab?: boolean; forgeWaits?: boolean; answers?: unknown[] } = {}) {
  const store = new Map<string, string>([[PATH, opts.start ?? START()]]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const writes: string[] = [], lines: string[] = [], sent: any[] = [];
  const answers = [...(opts.answers ?? [])];
  /** `before`: runs once, between the controller's look at the note and the text its next write is given; `fail`: the next writes throw. */
  const hooks: { before?: () => void; fail?: Error } = {};
  const dialog = memoryStore();
  const el: HTMLElement = win.document.createElement('div'); win.document.body.appendChild(el);
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); if (hooks.fail) throw hooks.fail; const h = hooks.before; hooks.before = undefined; h?.(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => VAULT, barNames: () => VAULT.bars, phraseNames: () => VAULT.phrases,
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => [{ path: PATH, contentEl: el, ...(opts.tab ? { tab: true } : {}) }], dialogStore: dialog,
    askPlan: async (payload: unknown) => { sent.push(JSON.parse(JSON.stringify(payload))); return answers.shift() as { status: number; json: unknown }; }, configured: () => true,
    confirm: async () => true,
    ...(opts.forgeWaits ? { descriptionAtOnce: () => false } : {}),
  };
  const ctl = createDescriptionController(ports);
  const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } await settle(); };
  const touch = async () => { ctl.modified(PATH); await advance(DESCRIPTION_DEBOUNCE_MS); };
  const msg = () => el.querySelector('.forge-description-message')?.textContent ?? '';
  const button = (action: string) => el.querySelector(`.forge-description-button[data-action="${action}"]`) as HTMLElement | null;
  const buttons = () => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action'));
  const send = async (text: string) => { const f = el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement; assert.ok(f, 'the composer'); f.value = text; f.dispatchEvent(new win.Event('input', { bubbles: true })); f.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await settle(); };
  const noticesInTab = () => [...el.querySelectorAll('.forge-chat-msg[data-kind="notice"]')].map((m) => m.textContent ?? '');
  const open = async () => { await ctl.inspect(PATH); ctl.syncBars(); await settle(); };
  return { ctl, store, writes, lines, sent, hooks, dialog, el, settle, advance, touch, msg, button, buttons, send, noticesInTab, open };
}

async function errorsDuring(run: () => Promise<void>): Promise<unknown[][]> {
  const saved = console.error; const got: unknown[][] = [];
  console.error = (...a: unknown[]) => { got.push(a); };
  try { await run(); } finally { console.error = saved; }
  return got;
}

// ---- a custom note's edited Python is followed -----------------------------------------------------------------------------------------------------------------------------------------

test('1047 a custom note\'s edited Python: the write that follows it is said ONCE in the console, and a later look with nothing new says nothing', async () => {
  const start = editedCustom();
  const r = rig({ start });
  await r.touch();
  assert.equal(r.store.get(PATH), withLinks(asCustom(start), ['bar_007', 'bar_008']));
  assert.deepEqual(r.lines, [FOLLOWED]);
  assert.equal(r.msg(), CUSTOM_BANNER);
  await r.touch();
  assert.deepEqual(r.lines, [FOLLOWED]); assert.deepEqual(r.writes, [PATH]);
});

test('1047 the follow decides on the text its WRITE finds: already followed by then = nothing written, nothing said', async () => {
  const start = editedCustom();
  const r = rig({ start });
  const followed = withLinks(asCustom(start), ['bar_007', 'bar_008']);
  r.hooks.before = () => { r.store.set(PATH, followed); };
  await r.touch();
  assert.equal(r.store.get(PATH), followed);
  assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
});

test('1047 the follow decides on the text its WRITE finds: a generated note put back meanwhile, its Python hand-edited, is NOT made custom (only Detach does that)', async () => {
  const r = rig({ start: editedCustom() });
  const generated = START().replace('  return bars\n', '  extra = bar_008()\n  return bars\n');
  assert.notEqual(generated, START()); assert.equal(isCustomNote(generated), false);
  r.hooks.before = () => { r.store.set(PATH, generated); };
  await r.touch();
  assert.equal(r.store.get(PATH), generated);
  assert.deepEqual(r.writes, []); assert.deepEqual(r.lines, []);
});

test('1047 the follow cannot be written: the strip says why, the console has the error, and nothing is said to have followed', async () => {
  const start = editedCustom();
  const r = rig({ start });
  const boom = new Error('disk full'); r.hooks.fail = boom;
  const errors = await errorsDuring(() => r.touch());
  assert.equal(r.msg(), 'The note could not be written: disk full');
  assert.deepEqual(errors, [['custom note: could not write the note', boom]]);
  assert.deepEqual(r.lines, []); assert.equal(r.store.get(PATH), start);
});

// ---- Detach that cannot write ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('1047 DETACH whose write fails (the command, no strip): the strip says `Detach: <why>`, the console has the error, nothing is dropped and the note can still be detached', async () => {
  const r = rig();
  assert.equal((await r.ctl.appendLine(PATH, 'Make it 5 bars long.')).ok, true); await r.settle();
  const was = r.store.get(PATH)!, said = r.lines.length;
  const boom = new Error('disk full'); r.hooks.fail = boom;
  const errors = await errorsDuring(async () => { await r.ctl.detach(PATH); await r.settle(); });
  assert.equal(r.msg(), 'Detach: disk full');
  assert.deepEqual(errors, [['detach: could not write the note', boom]]);
  assert.equal(r.store.get(PATH), was); assert.equal(r.lines.length, said, 'no "is now custom Python" line');
  assert.equal(r.ctl.canDetach(PATH), true);
  r.hooks.fail = undefined;
  assert.deepEqual(await r.ctl.undoLast(PATH), { ok: true, message: 'Removed: Make it 5 bars long.' }, 'the undo is still there');
});

test('1047 DETACH whose write fails, from the strip of a hand-edited note: the strip says why and KEEPS its two buttons; Detach pressed again, with the disk back, detaches', async () => {
  const r = rig();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  assert.equal(r.msg(), GENERATED_EDITED);
  r.hooks.fail = new Error('disk full');
  await errorsDuring(async () => { r.button('detach')!.click(); await r.settle(); });
  assert.equal(r.msg(), 'Detach: disk full');
  assert.deepEqual(r.buttons(), ['detach', 'ok']);
  assert.equal(r.store.get(PATH), edited);
  r.hooks.fail = undefined;
  r.button('detach')!.click(); await r.settle();
  assert.equal(isCustomNote(r.store.get(PATH)!), true); assert.equal(r.msg(), CUSTOM_BANNER);
});

// ---- what Detach forgets -----------------------------------------------------------------------------------------------------------------------------------------------------------------

const QUESTION = { status: 200, json: { ok: true, lines: [], question: 'How many bars?' } };

for (const detaches of [false, true]) {
  test(`1047 the service's pending question ${detaches ? 'is DROPPED by Detach: a generated note put back afterwards is asked about without it' : 'goes with the next request (the control for the Detach case)'}`, async () => {
    const r = rig({ tab: true, answers: [QUESTION, QUESTION] }); await r.open();
    await r.send(UNREADABLE);
    assert.equal(r.sent.length, 1); assert.equal('previous' in r.sent[0], false);
    if (detaches) { await r.ctl.detach(PATH); await r.settle(); assert.equal(isCustomNote(r.store.get(PATH)!), true); r.store.set(PATH, START()); await r.ctl.reset(PATH); await r.settle(); }
    await r.send('make it much longer than that please');
    assert.equal(r.sent.length, 2);
    if (detaches) assert.equal('previous' in r.sent[1], false);
    else assert.deepEqual(r.sent[1].previous, { sentence: UNREADABLE, question: 'How many bars?' });
  });
}

// ---- what a person reads after Forge and its undo ------------------------------------------------------------------------------------------------------------------------------------------

test('1047 Forge over a hand-edited Recipe says `Forged.` in the dialog; its undo says what was taken back and its redo what was done again', async () => {
  const r = rig({ tab: true }); await r.open();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); await r.touch();
  assert.equal((await r.ctl.forge(PATH)).ok, true); await r.settle();
  const last = () => { const e = r.dialog.entries(PATH).at(-1)!; return [e.kind, e.text]; };
  assert.deepEqual(last(), ['notice', 'Forged.']);
  assert.ok(r.noticesInTab().at(-1)!.includes('Forged.'), 'on the tab');
  assert.equal((await r.ctl.undoLast(PATH)).ok, true); await r.settle();
  assert.deepEqual(last(), ['notice', 'Taken back: the note is as it was before the Recipe change.']);
  assert.ok(r.noticesInTab().at(-1)!.includes('Taken back: the note is as it was before the Recipe change.'), 'on the tab');
  assert.equal((await r.ctl.redoLast(PATH)).ok, true); await r.settle();
  assert.deepEqual(last(), ['notice', 'Done again: the Recipe change is back.']);
});

test('1047 after the undo of a Forge the pending Description edit it brings back is said to be held again (even when the editor had been there and back meanwhile)', async () => {
  const r = rig({ forgeWaits: true });
  const pending = editDesc(r.store.get(PATH)!, '8 bars', '6 bars');
  r.store.set(PATH, pending); await r.touch();
  assert.equal((await r.ctl.forge(PATH)).ok, true); await r.settle();
  const forged = r.store.get(PATH)!;
  r.store.set(PATH, pending); await r.touch();                       // the editor's own undo: held, said
  r.store.set(PATH, forged);                                         // the editor's redo, and Cmd/Ctrl+Z in the composer before the note is looked at again
  assert.equal((await r.ctl.undoLast(PATH)).ok, true); await r.settle();
  assert.equal(r.store.get(PATH), pending);
  const before = r.lines.filter((l) => l === HELD).length;
  await r.touch();
  assert.equal(r.lines.filter((l) => l === HELD).length, before + 1);
});

test('1047 `OK` closes only the hand-edit line: a click that arrives late, on an OK already replaced, leaves the strip that is there now (and a second click does nothing)', async () => {
  const r = rig();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); await r.touch();
  const ok = r.button('ok')!; assert.ok(ok);
  r.store.set(PATH, editDesc(START(), 'Extend', 'Stretch about')); await r.touch();
  const now = r.msg(); assert.match(now, /column/); const shown = r.buttons();
  ok.click(); await r.settle();
  assert.equal(r.msg(), now); assert.deepEqual(r.buttons(), shown);
  r.store.set(PATH, editRecipe(START(), '8 bars', '6 bars')); await r.touch();
  assert.equal(r.msg(), GENERATED_EDITED);
  const again = r.button('ok')!; again.click(); await r.settle();
  assert.equal(r.msg(), '');
  const errors: unknown[] = []; const onReject = (e: unknown) => { errors.push(e); };
  process.on('unhandledRejection', onReject);
  try { again.click(); await r.settle(); } finally { process.off('unhandledRejection', onReject); }
  assert.deepEqual(errors, []); assert.equal(r.msg(), '');
});

// ---- "Restore to last commit" (reset) forgets what was said and what could be taken back --------------------------------------------------------------------------------------------------

test('1047 after a Restore (reset) the undo of the Forge before it is gone: undo takes off the last sentence, it never writes the note from before the Forge', async () => {
  const r = rig();
  assert.equal((await r.ctl.appendLine(PATH, 'Make it 5 bars long.')).ok, true); await r.settle();
  const edited = editRecipe(r.store.get(PATH)!, '5 bars', '6 bars'); r.store.set(PATH, edited); await r.touch();
  assert.equal((await r.ctl.forge(PATH)).ok, true); await r.settle();
  await r.ctl.reset(PATH); await r.settle();                          // the file restored to the committed text: here, what Forge wrote
  assert.deepEqual(await r.ctl.undoLast(PATH), { ok: true, message: 'Removed: Make it 5 bars long.' });
  assert.notEqual(r.store.get(PATH), edited);
  assert.equal(extractDescription(r.store.get(PATH)!), extractDescription(START()));
});

test('1047 after a Restore (reset) what is on disk is said afresh: a held Description edit and a sentence the grammar rejects are each traced again', async () => {
  const held = rig({ forgeWaits: true });
  held.store.set(PATH, editDesc(held.store.get(PATH)!, '8 bars', '6 bars')); await held.touch();
  assert.equal(held.lines.filter((l) => l === HELD).length, 1);
  await held.ctl.reset(PATH); await held.touch();
  assert.equal(held.lines.filter((l) => l === HELD).length, 2);

  const bad = rig();
  bad.store.set(PATH, editDesc(bad.store.get(PATH)!, 'Extend', 'Stretch about')); await bad.touch();
  const rejected = () => bad.lines.filter((l) => l.startsWith('[forge-description] rejected phrase_001')).length;
  assert.equal(rejected(), 1, bad.lines.join('\n'));
  await bad.ctl.reset(PATH); await bad.settle();
  assert.equal(rejected(), 2);
});

// ---- the controller's one writer of a note's strip entry (`set`, which this drain's fix gave a guard) -------------------------------------------------------------------------------------

test('1047 a sentence typed in the composer replaces a refusal still on the strip: the old `Detach: <why>` goes', async () => {
  const r = rig({ tab: true, answers: [{ status: 200, json: { ok: false, error: 'I cannot say that yet.', lines: null, question: null } }] }); await r.open();
  r.hooks.fail = new Error('disk full');
  await errorsDuring(async () => { await r.ctl.detach(PATH); await r.settle(); });
  assert.equal(r.msg(), 'Detach: disk full');
  await r.send(UNREADABLE);                                          // the note's text is as it was: only the new sentence moves the refusal away
  assert.equal(r.msg(), '');
});

test('1047 a Revert that fails on a note with nothing pending leaves no entry behind: Forge still works on it', async () => {
  const r = rig();
  r.hooks.fail = new Error('disk full');
  await r.ctl.revert(PATH); await r.settle();
  assert.equal(r.el.querySelector('.forge-description-bar'), null);
  r.hooks.fail = undefined;
  assert.deepEqual(await r.ctl.forge(PATH), { ok: true, message: 'Forged. Nothing changed.', wrote: false });
});

// ---- the command `Detach` on the real plugin ---------------------------------------------------------------------------------------------------------------------------------------------

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
type Command = { name?: string; checkCallback: (checking: boolean) => boolean };

test('1047 the command `detach-to-custom-python`: asking whether it is available opens no dialog and writes nothing; running it asks in `Detach` with the buttons `Cancel` and `Detach`', async () => {
  const x = await musicTabsWorld(real);
  try {
    const command = x.plugin.commands.get('detach-to-custom-python') as Command | undefined;
    assert.ok(command, 'registered under this id (a person\'s hotkey is bound to it)');
    assert.equal(command.name, 'Detach');
    await x.restoreTab('forge-phrase', PATH);
    const start = x.store.get(PATH)!;
    for (let i = 0; i < 3; i++) { assert.equal(command.checkCallback(true), true); await x.settle(60); }
    assert.equal(x.modals.length, 0, 'checking runs nothing');
    assert.deepEqual(x.writes, []); assert.equal(x.store.get(PATH), start);
    assert.equal(command.checkCallback(false), true); await x.settle(60);
    assert.equal(x.modals.length, 1);
    const modal = x.modals[0];
    assert.equal(modal.titleEl.textContent, 'Detach');
    assert.equal(modal.contentEl.querySelector('p').textContent, DETACH_CONFIRM);
    const buttons = [...modal.contentEl.querySelectorAll('button')] as HTMLElement[];
    assert.deepEqual(buttons.map((b) => b.textContent), ['Cancel', 'Detach']);
    buttons[0].click(); await x.settle(800);
    assert.deepEqual(x.writes, []); assert.equal(x.store.get(PATH), start);
  } finally { x.done(); }
});

test('1047 the command `Detach` is not available on a note that is not a phrase, an arrangement or a composition, nor with no file open: running it asks nothing and writes nothing', async () => {
  const x = await musicTabsWorld(real);
  try {
    const command = x.plugin.commands.get('detach-to-custom-python') as Command;
    const leaf = await x.restoreTab('markdown', 'bars/bar_007.md');
    for (const checking of [true, false]) { assert.equal(command.checkCallback(checking), false, `a bar, checking=${checking}`); await x.settle(60); }
    leaf.detach(); await x.settle(200);
    assert.equal(x.leaves.length, 0, 'nothing is open');
    for (const checking of [true, false]) { assert.equal(command.checkCallback(checking), false, `no file, checking=${checking}`); await x.settle(60); }
    assert.equal(x.modals.length, 0); assert.deepEqual(x.writes, []);
  } finally { x.done(); }
});
