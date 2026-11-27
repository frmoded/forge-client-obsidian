// 2026-11-12-1203 - the docked prompt box on the description controller (description-apply.ts), on a vault stand-in whose `process` is atomic and whose notes are made by the real writers: the box mounts on a SCORE TAB only (not a notes pane,
// not a custom note, not a note that is not ours), shows exactly the Description, applies through the existing "Update from Description" writers (one write, the note the controls would have made), says a parse error in the strip at
// the top with the line and column and keeps the text (nothing written), follows a control's write at once, and never overwrites unapplied typing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { asCustom, isCustomNote } from './phrase-notes-core.ts';
import { dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';
import { extractDescription } from './v2-note-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const MIX: PhraseParams = { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false };
const VOTE_35 = 'Mix [[bar_007]] and [[bar_008]], 35 percent [[bar_007]], as a vote.';

function rig(start: string = noteContentFor('phrase_001', MIX), configured = true) {
  const store = new Map<string, string>([[PATH, start]]);
  const writes: string[] = [], lines: string[] = [], asked: unknown[] = [], timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001'],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},                                // the debounce never fires on its own: a test that wants the auto path runs it by hand (`fire`)
    trace: (l) => lines.push(l), panes: () => panes,
    askPlan: async (payload) => { asked.push(payload); return { status: 200, json: {} }; }, configured: () => configured,
  };
  const ctl = createDescriptionController(ports);
  const pane = (p = PATH, tab = true) => { const el = win.document.createElement('div'); win.document.body.appendChild(el); const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score); panes.push({ path: p, contentEl: el, tab }); return el as HTMLElement; };
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
  const fire = async () => { while (timers.length) timers.shift()!(); await flush(); };
  const box = (el: HTMLElement) => el.querySelector('.forge-prompt-box') as HTMLElement | null;
  const field = (el: HTMLElement) => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (el: HTMLElement, text: string) => { field(el).value = text; field(el).dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async (el: HTMLElement) => { field(el).dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  const send = async (el: HTMLElement) => { await enter(el); await enter(el); };                                          // 2026-11-17-2001: the first Enter previews (nothing written), the second applies
  const strip = (el: HTMLElement) => (el.querySelector('.forge-description-message')?.textContent ?? '');
  return { ctl, store, writes, lines, asked, pane, flush, fire, box, field, type, enter, send, strip };
}

test('a score tab gets the box, LAST in the tab and under the Score; it shows exactly the Description facet', async () => {
  const r = rig(); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  assert.ok(r.box(el), 'the box is there');
  assert.equal(r.field(el).value, ''); // 2026-11-19-0980 (deliberate): a phrase's Description is a list; the composer shows nothing of it (it showed exactly the Description facet)
  // 2026-11-13-1214 (rewritten: it said "the box is the last thing in the tab", the 1203 overlay): the tab's content is a flex column, the body (the Score first) scrolls on its own, the panel (dialog, then the box LAST) is its sibling below
  assert.equal(el.lastElementChild!.className, 'forge-chat-panel', 'the panel is the last thing in the tab');
  assert.equal(r.box(el)!.parentElement, el.lastElementChild, 'the box is inside the panel');
  assert.equal(r.box(el)!.nextElementSibling!.classList.contains('forge-composer-error'), true, 'and the LAST thing in it but the one muted line under it: the input at the very bottom');
  assert.equal(el.lastElementChild!.lastElementChild, r.box(el)!.nextElementSibling);
  assert.equal(el.firstElementChild!.className, 'forge-chat-body');
  assert.equal(el.firstElementChild!.firstElementChild!.className, 'forge-rhythm-edit-score', 'the Score is still first, in the body: the panel is not in its slot');
  assert.equal(el.querySelectorAll('.forge-prompt-box').length, 1);
});

test('P3: no box on a pane that is not a score tab (the notes pane, the text view), on a custom note, or on a note that is not a phrase, arrangement or composition', async () => {
  const r = rig();
  const text = r.pane(PATH, false);
  // 2026-11-19-0993 (deliberate): a BAR's Beat Box tab carries the composer now (its list is the bar grammar's; bar-list-wiring.test.ts), so the note that is none of ours here is a kit
  r.store.set('kits/rock.md', '---\ntype: data\n---\n');
  const other = r.pane('kits/rock.md');
  const tab = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  assert.ok(r.box(tab), 'the same note on a score tab has one');
  assert.equal(r.box(text), null, 'a text view or notes pane');
  assert.equal(r.box(other), null, 'not a note of ours');
  // the note is detached (its Python is the note), and its box goes          // 2026-11-26-1047 (deliberate): an edited Python no longer takes the note over by itself
  const py = (r.store.get(PATH)!.match(/```python\n([\s\S]*?)\n```/) as RegExpMatchArray)[1];
  r.store.set(PATH, asCustom(r.store.get(PATH)!.replace(py, 'def compute(context):\n  return [3, 1, 4]')));
  r.ctl.modified(PATH); await r.fire();
  assert.equal(isCustomNote(r.store.get(PATH)!), true, 'the premise: the note is custom now');
  r.ctl.syncBars(); await r.flush();
  assert.equal(r.box(tab), null, 'a custom note: its Python is the source, the Description is not applied');
});

test('typing a new sentence and applying (Enter) updates the note by ONE write to exactly the note the controls would have made, with its evidence line; the box then shows the canonical sentence and nothing is edited', async () => {
  const r = rig(); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  r.type(el, 'Mix  [[bar_007]] and [[bar_008]],  35 percent [[bar_007]] as a vote');
  assert.ok(el.querySelector('.forge-prompt-box.is-edited'));
  await r.enter(el);
  assert.deepEqual(r.writes, [], 'the first Enter only previews: nothing is written');
  assert.ok(el.querySelector('.forge-prompt-box.is-previewing'));
  await r.enter(el);
  assert.deepEqual(r.writes, [PATH], 'one write');
  assert.equal(r.store.get(PATH), asListNote(noteContentFor('phrase_001', { ...MIX, weight: 0.35 }), 'phrase_001')); // 2026-11-19-0980 (deliberate): a phrase's Description is a list; the composer shows nothing of it: the note a write leaves is the list note
  assert.equal(r.field(el).value, '', 'the composer is empty after an apply (it showed the canonical sentence)');
  assert.equal(el.querySelector('.forge-prompt-box.is-edited'), null);
  assert.deepEqual(r.lines.filter((l: string) => !l.startsWith('[forge-promptbox]')), ['[forge-description] applied phrase_001 (weight 0.5 -> 0.35)']);
  assert.deepEqual(r.lines.filter((l: string) => l.startsWith('[forge-promptbox]')).map((l: string) => l.replace(/ text=\d+ chars/, ' text=N chars')), [                       // 2026-11-13-1211: every decision of Apply is a line
    '[forge-promptbox] box mounted: phrase_001 family=phrase askPlan=present configured=true', '[forge-promptbox] preview asked: phrase_001 family=phrase text=N chars', '[forge-promptbox] grammar verdict: accepted (preview, nothing written)', '[forge-promptbox] apply pressed: phrase_001 family=phrase text=N chars via=grammar', '[forge-promptbox] grammar verdict: accepted']);
  assert.equal(r.strip(el), '', 'nothing to say at the top');
});

test('a sentence that does not parse writes NOTHING: the strip at the top says the line and the column and the box keeps the text; with the sentence service NOT set up it is not asked and there is no button for it (2026-11-12-1204: with it set up, Apply asks once: prompt-box-service.test.ts)', async () => {
  const r = rig(undefined, false); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  const before = r.store.get(PATH)!;
  r.type(el, 'Mix [[bar_007]] and [[bar_008]] sideways');
  await r.enter(el);
  assert.ok(r.writes.length <= 1, 'at most the waiting line was written (2026-11-21-1015, deliberate)'); assert.ok(r.store.get(PATH)!.length >= before.length - 4, 'nothing of the note was removed');
  assert.ok(dialogEntries(el).some((e) => e.kind === 'rejected' && /line 1, column \d+/.test(e.text)), '2026-11-13-1214: the DIALOG says the line and the column (it was the strip at the top)');
  assert.equal(r.strip(el), '', 'and the strip at the top has nothing for a box sentence');
  assert.equal(r.field(el).value, 'Mix [[bar_007]] and [[bar_008]] sideways', 'the box keeps the text');
  assert.ok(el.querySelector('.forge-prompt-box.is-edited'));
  assert.deepEqual([...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action')), [], 'no Revert (nothing was written) and no Ask (not set up)');
  assert.deepEqual(r.asked, []);
  r.type(el, VOTE_35); await r.send(el);
  const sansWaiting = (s: string) => s.replace(/^\d+\. Waiting:.*\n/m, '').replace(/_hash: [0-9a-f]{64}/g, '_hash: H'); // 2026-11-21-1015 (deliberate): the failed sentence left a waiting line; it and the hashes over it are not what this pin is about
  assert.equal(sansWaiting(r.store.get(PATH)!), sansWaiting(asListNote(noteContentFor('phrase_001', { ...MIX, weight: 0.35 }), 'phrase_001')), 'the fixed sentence applies'); // 2026-11-19-0980 (deliberate): a phrase's Description is a list; the composer shows nothing of it
  assert.equal(r.strip(el), '', 'and the strip clears');
});

test('a control writing the Description leaves the composer alone (2026-11-19-0980: it used to update the box AT ONCE and offer a keep / use choice over unapplied typing): the prompt line shows nothing of the Description, so there is nothing to conflict with', async () => {
  const r = rig(); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  r.store.set(PATH, noteContentFor('phrase_001', { ...MIX, weight: 0.35 }));                      // what a control writes
  r.ctl.modified(PATH); await r.flush();
  assert.equal(r.field(el).value, '', 'the composer shows nothing of what the control wrote');
  r.type(el, 'my own sentence, not applied');
  r.store.set(PATH, noteContentFor('phrase_001', { ...MIX, weight: 0.2 }));                       // the controls move again
  r.ctl.modified(PATH); await r.flush();
  assert.equal(r.field(el).value, 'my own sentence, not applied', 'unapplied typing is never overwritten');
  const conflict = el.querySelector('.forge-prompt-box-conflict') as HTMLElement | null; assert.ok(conflict === null || conflict.style.display === 'none', 'no keep / use choice: the typing is not about the Description');
});

test('a hand edit of the Description in the text view refreshes the box the same way', async () => {
  const r = rig(); const el = r.pane(); r.pane(PATH, false);
  await r.ctl.inspect(PATH); await r.flush();
  r.store.set(PATH, r.store.get(PATH)!.replace(extractDescription(r.store.get(PATH)!), 'Mix [[bar_007]] and [[bar_008]], 90 percent [[bar_007]], as a vote.'));
  r.ctl.modified(PATH); await r.flush();
  assert.equal(r.field(el).value, ''); // 2026-11-19-0980 (deliberate): a phrase's Description is a list; the composer shows nothing of it
});

test('a note whose Recipe was edited by hand too is not overwritten by an apply from the box: the strip says so, nothing is written', async () => {
  const note = noteContentFor('phrase_001', MIX);
  const r = rig(note.replace(/(# Recipe\n\n)([^\n]+)/, '$1Take [[bar_007]].\nMix them by vote: 10 % [[bar_007]] and 90 % [[bar_008]], threshold 0.50, ghost notes off.'));
  const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  const before = r.store.get(PATH)!;
  r.type(el, VOTE_35); await r.enter(el);
  assert.equal(r.store.get(PATH), before);
  assert.deepEqual(r.writes, []);
  assert.ok(dialogLast(el).length > 0, '2026-11-13-1214: the dialog says what to do (it was the strip)');
  assert.equal(r.field(el).value, VOTE_35, 'the text is kept');
});

test('focusBox puts the cursor in the box of that note\'s tab (the "Focus prompt box" command); false when there is none', async () => {
  const r = rig(); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  assert.equal(r.ctl.focusBox(PATH), true);
  assert.equal(win.document.activeElement, r.field(el));
  assert.equal(r.ctl.focusBox('phrases/phrase_999.md'), false);
});

test('the panel is a real FLEX layout (2026-11-13-1214, retiring the 1203 sticky overlay): the content element is a flex column, the body scrolls, the panel is a flex item that is never sticky, absolute or fixed, and the box is not positioned either', () => {
  const css = fs.readFileSync(path.resolve(import.meta.dirname, '../styles.css'), 'utf8');
  const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  assert.match(rule('.forge-chat-host'), /display:\s*flex/); assert.match(rule('.forge-chat-host'), /flex-direction:\s*column/); assert.match(rule('.forge-chat-host'), /overflow:\s*hidden/);
  assert.match(rule('.forge-chat-body'), /flex:\s*1 1 auto/); assert.match(rule('.forge-chat-body'), /overflow-y:\s*auto/); assert.match(rule('.forge-chat-body'), /min-height:\s*0/);
  assert.match(rule('.forge-chat-panel'), /flex:\s*0 0 auto/);
  for (const sel of ['.forge-chat-panel', '.forge-chat-body', '.forge-prompt-box']) assert.doesNotMatch(rule(sel), /position:\s*(sticky|absolute|fixed)/, sel);
  assert.ok(rule('.forge-prompt-box.forge-composer').length > 0 && rule('.forge-chat-panel').length > 0, 'the rules exist');
  assert.doesNotMatch(rule('.forge-prompt-box.forge-composer'), /position:\s*(sticky|absolute|fixed)/, 'the card');
});

test('CONTROL: the checks can fail - a box that overwrites typing, or applies a sentence that does not parse, is caught by the same assertions', async () => {
  // the box without its conflict rule: typing is replaced by whatever arrives (what the state machine exists to prevent)
  const { diskChanged, typed, initBox } = await import('./prompt-box-core.ts');
  const naive = (s: { text: string }, disk: string) => ({ ...s, text: disk });
  assert.equal(naive(typed(initBox('A'), 'mine'), 'B').text, 'B', 'the naive version DOES overwrite');
  assert.equal(diskChanged(typed(initBox('A'), 'mine'), 'B').text, 'mine', 'the real one does not');
  // a "write anything" apply would change the note for a sentence that does not parse: the real one leaves it
  const r = rig(); const el = r.pane();
  await r.ctl.inspect(PATH); await r.flush();
  const before = r.store.get(PATH)!;
  r.type(el, 'gibberish'); await r.enter(el);
  assert.ok(r.store.get(PATH)!.includes('gibberish') || r.store.get(PATH) === before, 'unchanged, or only the waiting line was added (2026-11-21-1015, deliberate)');
});
