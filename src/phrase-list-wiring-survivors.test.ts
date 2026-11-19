// 2026-11-19-0980 (mutation pass: ~/.forge-mem-evidence/0980-mutants.log) - the survivors of src/description-apply.ts that the REAL controller (happy-dom, a vault stand-in) can show: appendLine's words, traces and dialog lines, the seed drawn again by a NEW preview,
// the stale state cleared by a successful append, reset() and dispose(). Each test says the line it is about. A DOM element is never an assert operand (a failure would format the whole tree).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md';
const HEAD = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

function rig(opts: { seeds?: number[]; failProcess?: boolean } = {}) {
  const store = new Map<string, string>([[PH, emptyPhraseNote('phrase_001')]]);
  const writes: string[] = [], lines: string[] = [], cleared: unknown[] = []; const timers = new Map<number, () => void>(); let ids = 0; const seeds = [...(opts.seeds ?? [])];
  const state = { failProcess: opts.failProcess === true };
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); if (state.failProcess) throw new Error('boom'); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: (fn) => { const id = ++ids; timers.set(id, fn); return id; }, clearTimer: (h) => { cleared.push(h); timers.delete(h as number); },
    trace: (l) => { lines.push(l); }, panes: () => panes,
    drawSeed: () => (seeds.length > 0 ? seeds.shift()! : 99),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path: PH, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const say = async (sentence: string) => { field().value = sentence; field().dispatchEvent(new win.Event('input', { bubbles: true })); for (let i = 0; i < 2; i++) { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })); await flush(); } };
  const list = () => extractDescription(store.get(PH)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, ''));
  return { ctl, store, writes, lines, cleared, timers, el, flush, say, list, state, ready: async () => { await ctl.inspect(PH); await flush(); }, entries: () => dialogEntries(el), last: () => { const l = dialogEntries(el).filter((e) => e.kind !== 'you' && e.kind !== 'asking'); return l.length ? l[l.length - 1] : { kind: '', text: '' }; } };
}

/** Runs `fn` with console.error collected (never printed), returns what it was called with. */
async function quietly<T>(fn: () => Promise<T>): Promise<{ value: T; errors: unknown[][] }> { const errors: unknown[][] = []; const o = console.error; console.error = (...a: unknown[]) => { errors.push(a); }; try { return { value: await fn(), errors }; } finally { console.error = o; } }

test('description-apply 533: a NEW preview of the same text draws the seed AGAIN (the saved lines of the earlier preview are not reused)', async () => {
  const r = rig({ seeds: [5, 6] }); await r.ready();
  const sentence = 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order.';
  const a = await r.ctl.previewFromBox(PH, sentence); const b = await r.ctl.previewFromBox(PH, sentence);
  assert.ok(a.ok && b.ok);
  assert.ok((a as { proposal: { description: string } }).proposal.description.endsWith('seed 5.'));
  assert.ok((b as { proposal: { description: string } }).proposal.description.endsWith('seed 6.'), (b as { proposal: { description: string } }).proposal.description);
});

test('description-apply 576: appendLine on a note that is not a phrase, an arrangement or a composition says so in these words and writes nothing', async () => {
  const r = rig(); await r.ready();
  assert.deepEqual(await r.ctl.appendLine('bars/bar_001.md', 'Keep bars 1 to 2.'), { ok: false, message: 'This note is not a phrase, an arrangement or a composition.' });
  assert.deepEqual(r.writes, []);
});

test('description-apply 577: appendLine on a note that has gone says "Could not read the note: ...", in the dialog as a failed line, names the method in console.error, writes nothing', async () => {
  const r = rig(); await r.ready(); r.store.delete(PH);
  const { value, errors } = await quietly(() => r.ctl.appendLine(PH, 'Keep bars 1 to 2.'));
  assert.deepEqual(value, { ok: false, message: 'Could not read the note: gone' });
  assert.equal(errors.length, 1); assert.equal(errors[0][0], '[forge-promptbox] appendLine: could not read the note');
  assert.deepEqual(r.entries().filter((e) => e.kind === 'failed').map((e) => e.text), ['Apply failed: Could not read the note: gone']);
});

test('description-apply 580: a sentence the plan refuses is returned in its own words, said in the dialog as a notice and traced ("append refused")', async () => {
  const r = rig(); await r.ready(); await r.say('Take [[phrase_003]].'); await r.say('Thin out bars 1 to 2, by half, keeping the downbeat.'); const w = r.writes.length;
  const done = await r.ctl.appendLine(PH, 'Keep bars 1 to 3.');
  assert.equal(done.ok, false); assert.ok(done.message.startsWith('Do the structure steps first: "Keep bars 1 to 3."'), done.message);
  assert.equal(r.writes.length, w);
  assert.equal(r.last().kind, 'notice'); assert.equal(r.last().text, done.message);
  assert.ok(r.lines.includes(`[forge-promptbox] append refused: ${done.message}`), JSON.stringify(r.lines.filter((l) => l.includes('append'))));
});

test('description-apply 581: appending what the note already says is "Nothing changed: the note already says this." (ok, nothing written, said in the dialog)', async () => {
  const r = rig(); await r.ready(); await r.say(HEAD); await r.say('Make it 8 bars long.'); const w = r.writes.length;
  const done = await r.ctl.appendLine(PH, 'Make it 8 bars long.');
  assert.deepEqual(done, { ok: true, message: 'Nothing changed: the note already says this.' });
  assert.equal(r.writes.length, w); assert.equal(r.last().kind, 'notice'); assert.equal(r.last().text, 'Nothing changed: the note already says this.');
});

test('description-apply 583 and 584: a write that fails is returned, said as a failed line and traced ("append failed"), the list is untouched and console.error names the method; a write that succeeds clears the stale state of the note (nothing offers to update it any more)', async () => {
  const r = rig(); await r.ready(); await r.say(HEAD); const before = r.store.get(PH)!;
  r.state.failProcess = true;
  const { value, errors } = await quietly(() => r.ctl.appendLine(PH, 'Keep bars 1 to 2.'));
  assert.deepEqual(value, { ok: false, message: 'Apply: boom' });
  assert.equal(r.store.get(PH), before); assert.equal(errors.length, 1); assert.equal(errors[0][0], '[forge-promptbox] could not write the list');
  assert.equal(r.last().kind, 'failed'); assert.equal(r.last().text, 'Apply failed: Apply: boom');
  assert.ok(r.lines.includes('[forge-promptbox] append failed: Apply: boom'), JSON.stringify(r.lines.filter((l) => l.includes('append'))));
  assert.ok(!r.entries().some((e) => e.kind === 'applied' && e.text.includes('Keep')), 'nothing was said as applied');
  r.state.failProcess = false;
  // 584: a hand edit that nobody applied yet (the controller has a pending "update" for it) ...
  r.store.set(PH, replaceDescriptionSection(r.store.get(PH)!, `1. ${HEAD}\n2. Keep bars 1 to 3.`)!);
  await r.ctl.inspect(PH); await r.flush();
  assert.equal(r.ctl.canUpdate(PH), true, 'the premise: an unapplied hand edit is waiting');
  const ok = await r.ctl.appendLine(PH, 'Copy bar 1.');
  assert.deepEqual(ok, { ok: true, message: 'Added: Copy bar 1.' });
  assert.deepEqual(r.list(), [HEAD, 'Keep bars 1 to 3.', 'Copy bar 1.']);
  assert.equal(r.ctl.canUpdate(PH), false, 'the write made the note say what the list says: the pending update is gone');
});

test('description-apply 586: an append whose head leaves a line it cannot take says "Line 2 is not a sentence I can read; the note shows line 1." in the dialog, as the typed apply does', async () => {
  const r = rig(); await r.ready(); await r.say(HEAD); await r.say('Make it 20 percent slower.');
  const done = await r.ctl.appendLine(PH, 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.');
  assert.deepEqual(done, { ok: true, message: 'Added: Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.' });
  const notices = r.entries().filter((e) => e.kind === 'notice').map((e) => e.text);
  assert.ok(notices.some((t) => t.startsWith('Line 2 is not a sentence I can read; the note shows line 1.')), JSON.stringify(notices));
});

test('description-apply 828: reset() takes the pending wait of a hand edit away (the timer is cleared, never fired late), and LOOKS AT THE NOTE AGAIN (an unapplied hand edit is waiting again afterwards)', async () => {
  const r = rig(); await r.ready(); await r.say(HEAD);
  r.store.set(PH, replaceDescriptionSection(r.store.get(PH)!, `1. ${HEAD}\n2. Keep bars 1 to 3.`)!);
  r.ctl.modified(PH);
  assert.equal(r.timers.size, 1, 'the premise: the debounce is waiting');
  const handle = [...r.timers.keys()][0];
  await r.ctl.reset(PH); await r.flush();
  assert.deepEqual(r.cleared, [handle], 'the wait was cleared');
  assert.equal(r.timers.size, 0, 'and nothing is waiting any more');
  assert.equal(r.ctl.canUpdate(PH), true, 'the note was looked at again after the reset: its unapplied edit is offered');
});

test('description-apply 842: dispose() takes the composer away (the card is not left on the tab)', async () => {
  const r = rig(); await r.ready();
  assert.ok(r.el.querySelector('.forge-prompt-box') !== null, 'the premise: the card is there');
  r.ctl.dispose();
  assert.ok(r.el.querySelector('.forge-prompt-box') === null, 'dispose removed the card');
});

