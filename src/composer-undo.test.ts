// 2026-11-19-0970 (THE LIST MODEL, stage 1) - the composer's side of undo and redo, in a plain DOM (prompt-box-dom.ts, composer-core.ts, dialog-core.ts): Cmd/Ctrl+Z in an EMPTY text area is the undo of the list, Shift+Cmd/Ctrl+Z the redo,
// and in a field with text the key is the browser's own; the "+" menu items can be DISABLED (aria-disabled, still in the menu, still reachable by the arrow keys, doing nothing when chosen) and the state is asked each time the menu opens;
// a preview that replaces a sentence says so ("This replaces: <old sentence>") in the dialog's entry and in the live region. No new visible button, no tooltip (the hidden label), no red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPromptBox, type PromptBoxPorts } from './prompt-box-dom.ts';
import { announcement, initComposer, step, UNDO_LABEL, REDO_LABEL, type ComposerState } from './composer-core.ts';
import { fromOutcome } from './dialog-core.ts';

function rig(over: Partial<PromptBoxPorts> = {}, initial = '') {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const calls: string[] = [];
  const ports: PromptBoxPorts = {
    preview: async (t) => ({ ok: true, proposal: { description: `Would write: ${t}.`, via: 'grammar' } }), apply: async (t) => ({ ok: true, disk: t }),
    undo: () => { calls.push('undo'); }, redo: () => { calls.push('redo'); },
    ...over,
  };
  const handle = mountPromptBox(parent, ports, initial);
  const q = (sel: string) => parent.querySelector(sel) as any;
  const type = (text: string) => { q('.forge-prompt-box-text').value = text; q('.forge-prompt-box-text').dispatchEvent(new win.Event('input', { bubbles: true })); };
  const key = (k: string, init: Record<string, unknown> = {}) => { const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); q('.forge-prompt-box-text').dispatchEvent(e); return e; };
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  return { win, parent, handle, calls, q, type, key, flush };
}

test('Cmd+Z in an EMPTY composer calls undo (the key is taken); Shift+Cmd+Z calls redo; Ctrl does the same on the other platforms', async () => {
  const r = rig();
  assert.equal(r.key('z', { metaKey: true }).defaultPrevented, true);
  assert.equal(r.key('Z', { metaKey: true, shiftKey: true }).defaultPrevented, true);
  assert.equal(r.key('z', { ctrlKey: true }).defaultPrevented, true);
  assert.equal(r.key('Z', { ctrlKey: true, shiftKey: true }).defaultPrevented, true);
  await r.flush();
  assert.deepEqual(r.calls, ['undo', 'redo', 'undo', 'redo']);
});

test('Cmd+Y is not redo (only Shift+Cmd/Ctrl+Z is), Alt+Cmd+Z and a bare Z are not ours', async () => {
  const r = rig();
  for (const e of [r.key('y', { metaKey: true }), r.key('z', { metaKey: true, altKey: true }), r.key('z'), r.key('z', { shiftKey: true })]) assert.equal(e.defaultPrevented, false);
  await r.flush(); assert.deepEqual(r.calls, []);
});

test('in a composer WITH text the key is the browser\'s own text undo: nothing is called, the event is not prevented', async () => {
  const r = rig();
  r.type('half a sentence');
  assert.equal(r.key('z', { metaKey: true }).defaultPrevented, false); assert.equal(r.key('Z', { metaKey: true, shiftKey: true }).defaultPrevented, false);
  await r.flush(); assert.deepEqual(r.calls, []);
});

test('a composer with no undo port (a phrase, a bar) does not take the key at all', async () => {
  const r = rig({ undo: undefined, redo: undefined });
  assert.equal(r.key('z', { metaKey: true }).defaultPrevented, false); await r.flush(); assert.deepEqual(r.calls, []);
});

test('the key is not taken while a request runs or a write is in flight (the field is read-only then)', async () => {
  let release: (v: { ok: true; proposal: { description: string; via: 'grammar' } }) => void = () => {};
  const r = rig({ preview: () => new Promise((res) => { release = res as typeof release; }) });
  r.type('x'); r.key('Enter'); await r.flush();
  r.q('.forge-prompt-box-text').value = '';                                    // even if the field looked empty
  assert.equal(r.key('z', { metaKey: true }).defaultPrevented, false);
  release({ ok: true, proposal: { description: 'x.', via: 'grammar' } }); await r.flush(); assert.deepEqual(r.calls, []);
});

test('where the host turns Cmd+Z into the field\'s own undo (a "beforeinput" of historyUndo / historyRedo, as an application menu does) an EMPTY field does the list undo once; a field with text keeps its own; a key just taken is not done twice', async () => {
  const r = rig();
  const input = (inputType: string) => { const e = new r.win.InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }); r.q('.forge-prompt-box-text').dispatchEvent(e); return e; };
  assert.equal(input('historyUndo').defaultPrevented, true); assert.equal(input('historyRedo').defaultPrevented, true); assert.equal(input('insertText').defaultPrevented, false);
  await r.flush(); assert.deepEqual(r.calls, ['undo', 'redo']);
  r.calls.length = 0; r.key('z', { metaKey: true }); input('historyUndo'); await r.flush(); assert.deepEqual(r.calls, ['undo'], 'the keydown did it; the field\'s own undo that follows it is only stopped');
  r.type('text'); r.calls.length = 0; assert.equal(input('historyUndo').defaultPrevented, false); await r.flush(); assert.deepEqual(r.calls, []);
});

test('an undo that throws is said in the console and under the card, never swallowed (the card stays usable)', async () => {
  const errors: unknown[] = []; const orig = console.error; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const r = rig({ undo: () => { throw new Error('boom'); } });
    r.key('z', { metaKey: true }); await r.flush();
    assert.equal(errors.length, 1); assert.match(String(r.q('.forge-composer-error').textContent), /boom/);
  } finally { console.error = orig; }
});

// ---- the "+" menu --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const menuOf = (state: { undo: boolean; redo: boolean }, runs: string[]) => ({
  items: [{ id: 'new', label: 'New phrase' }, { id: '__undo__', label: UNDO_LABEL }, { id: '__redo__', label: REDO_LABEL }],
  run: (id: string) => { runs.push(id); }, enabled: (id: string) => (id === '__undo__' ? state.undo : id === '__redo__' ? state.redo : true),
});

test('a disabled menu item stays in the menu (not hidden), says aria-disabled, does nothing when chosen, and keeps the menu\'s keyboard order; the state is asked every time the menu opens', async () => {
  const runs: string[] = []; const state = { undo: false, redo: false };
  const r = rig({ menu: menuOf(state, runs) });
  const items = () => [...r.parent.querySelectorAll('.forge-composer-menuitem')] as any[];
  assert.deepEqual(items().map((b) => b.textContent), ['New phrase', UNDO_LABEL, REDO_LABEL]);
  r.q('.forge-composer-plus').click(); await r.flush();
  assert.equal(items()[1].getAttribute('aria-disabled'), 'true'); assert.equal(items()[2].getAttribute('aria-disabled'), 'true'); assert.equal(items()[0].getAttribute('aria-disabled'), 'false');
  assert.equal(items()[1].hidden, false); assert.equal(items()[1].hasAttribute('disabled'), false, 'not the disabled attribute: it stays focusable for the arrow keys');
  items()[1].click(); await r.flush(); assert.deepEqual(runs, [], 'a disabled item does nothing');
  assert.equal(r.q('.forge-composer-menu').hidden, true, 'and the menu closes, as after any choice');
  state.undo = true;                                                          // something to undo now
  r.q('.forge-composer-plus').click(); await r.flush();
  assert.equal(items()[1].getAttribute('aria-disabled'), 'false'); assert.equal(items()[2].getAttribute('aria-disabled'), 'true');
  items()[1].click(); await r.flush(); assert.deepEqual(runs, ['__undo__']);
});

test('the trailing items come AFTER "Insert a link to a note": the New actions, the link, then Undo last sentence and Redo', async () => {
  const state = { undo: true, redo: false };
  const r = rig({ menu: { items: [{ id: 'new', label: 'New phrase' }], run: () => {}, pickNote: async () => null, trailing: [{ id: '__undo__', label: UNDO_LABEL }, { id: '__redo__', label: REDO_LABEL }], enabled: (id) => (id === '__undo__' ? state.undo : id === '__redo__' ? state.redo : true) } });
  assert.deepEqual([...r.parent.querySelectorAll('.forge-composer-menuitem')].map((b: any) => b.textContent), ['New phrase', 'Insert a link to a note', UNDO_LABEL, REDO_LABEL]);
  r.q('.forge-composer-plus').click(); await r.flush();
  assert.deepEqual([...r.parent.querySelectorAll('.forge-composer-menuitem')].map((b: any) => b.getAttribute('aria-disabled')), ['false', 'false', 'false', 'true']);
});

test('the arrow keys walk onto a disabled item too (it is a menu item, only inert)', async () => {
  const state = { undo: false, redo: false }; const r = rig({ menu: menuOf(state, []) });
  r.q('.forge-composer-plus').click(); await r.flush();
  const items = [...r.parent.querySelectorAll('.forge-composer-menuitem')] as any[];
  items[0].dispatchEvent(new r.win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(r.win.document.activeElement, items[1]);
});

test('Enter on a disabled item does nothing either (the item is a button: its click is what runs it)', async () => {
  const runs: string[] = []; const state = { undo: false, redo: false }; const r = rig({ menu: menuOf(state, runs) });
  r.q('.forge-composer-plus').click(); await r.flush();
  const undo = [...r.parent.querySelectorAll('.forge-composer-menuitem')][1] as any; undo.click(); await r.flush(); assert.deepEqual(runs, []);
});

test('the menu items are named by their text; no title and no aria-label anywhere on the card (the hidden-label rule)', () => {
  const r = rig({ menu: menuOf({ undo: true, redo: true }, []) });
  for (const el of [...r.parent.querySelectorAll('*')] as any[]) { assert.equal(el.getAttribute('title'), null, el.className); assert.equal(el.getAttribute('aria-label'), null, el.className); }
});

// ---- "This replaces: ..." ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the dialog entry of a preview that replaces a sentence says "This replaces: <the old sentence>" in plain text; one that replaces nothing says nothing of the sort', () => {
  const plain = fromOutcome({ type: 'suggestion', description: 'Mute the [[latin]] kit.', recipe: '', via: 'grammar' });
  assert.equal(plain.text, 'The grammar read your sentence. This is what would be written.');
  const repl = fromOutcome({ type: 'suggestion', description: 'Play [[phrase_003]] on the [[rock]] kit.', recipe: '', via: 'grammar', replaces: 'Play [[phrase_001]] on the [[rock]] kit.' });
  assert.equal(repl.text, 'The grammar read your sentence. This is what would be written. This replaces: Play [[phrase_001]] on the [[rock]] kit.');
  assert.equal(fromOutcome({ type: 'suggestion', description: 'x', recipe: '', via: 'service', replaces: 'y' }).text, 'The service suggests this. This replaces: y');
  assert.equal(fromOutcome({ type: 'suggestion', description: 'x', recipe: '', replaces: '' }).text, 'The service suggests this.', 'an empty "replaces" is nothing');
});

test('the live region reads the replace too: "Preview: <new>. This replaces: <old>. Press Enter to apply, Esc to discard."', () => {
  const proposal = { description: 'Play [[phrase_003]] on the [[rock]] kit.', via: 'grammar' as const, replaces: 'Play [[phrase_001]] on the [[rock]] kit.' };
  let s: ComposerState = initComposer('x'); s = step(s, { type: 'enter' }).state; s = step(s, { type: 'resolved', seq: 1, proposal }).state;
  assert.equal(announcement(s), 'Preview: Play [[phrase_003]] on the [[rock]] kit. This replaces: Play [[phrase_001]] on the [[rock]] kit. Press Enter to apply, Esc to discard.');
  const s2 = step(step(initComposer('x'), { type: 'enter' }).state, { type: 'resolved', seq: 1, proposal: { description: 'Mute the [[rock]] kit.', via: 'grammar' } }).state;
  assert.equal(announcement(s2), 'Preview: Mute the [[rock]] kit. Press Enter to apply, Esc to discard.');
});
