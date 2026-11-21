// 2026-11-20-1004z (4a) - the trace through the REAL controller and composer: each way an undo can be asked for lands in the trace with its own name. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyPhraseNote } from './empty-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md', EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
function rig() {
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set(PH, emptyPhraseNote('x'));
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = descriptionPortsFor({
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    panes: () => panes, setTimer: () => 1, clearTimer: () => {}, trace: () => {}, warn: () => {},
  }, { composerAutoApply: () => true, composerMenu: () => ({ items: [], run: () => {} }) } as never);
  const ctl = createDescriptionController(ports as never);
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PH, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const say = async (s: string) => { field().value = s; field().dispatchEvent(new win.Event('input', { bubbles: true })); field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  return { ctl, el, field, say, flush, ready: async () => { await ctl.inspect(PH); await flush(); } };
}
const trace = (): Array<{ via: string; which: string; note: string }> => (globalThis as { __forgeUndoTrace?: Array<{ via: string; which: string; note: string }> }).__forgeUndoTrace ?? [];

test('each way in is named: Cmd+Z (key), the host\'s beforeinput historyUndo (beforeinput), the "+" menu (menu), a typed `Undo` (typed), a direct call (other); redo too; the note name only', async () => {
  const r = rig(); await r.ready();
  await r.say(EXTEND); for (const s of ['Keep bars 1 to 4.', 'Copy bar 1.', 'Delete bar 1.', 'Move bar 2 one bar left.', 'Keep bars 1 to 3.']) await r.say(s);
  const before = trace().length;
  r.field().dispatchEvent(Object.assign(new win.Event('beforeinput', { bubbles: true, cancelable: true }), { inputType: 'historyUndo' })); await r.flush();
  await new Promise((res) => setTimeout(res, 450));                                  // the composer ignores a beforeinput that follows its own key within 400 ms (one undo, not two)
  r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })); await r.flush();
  await r.say('Undo');
  await r.ctl.undoLast(PH); await r.ctl.redoLast(PH);
  (r.el.querySelector('.forge-composer-plus') as HTMLElement).dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await r.flush();
  const item = [...r.el.querySelectorAll('.forge-composer-menuitem')].find((b) => /Undo last sentence/.test(b.textContent ?? '')) as HTMLElement | undefined; assert.ok(item !== undefined, 'the menu has the undo item');
  item!.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await r.flush();
  const got = trace().slice(before).map((e) => `${e.via}:${e.which}`);
  assert.deepEqual(got, ['beforeinput:undo', 'key:undo', 'typed:undo', 'other:undo', 'other:redo', 'menu:undo']);
  assert.ok(trace().every((e) => e.note === 'phrase_001'), 'the note name only'); assert.ok(!JSON.stringify(trace()).includes('Keep bars'), 'no sentence text');
});

test('an apply never records anything: the trace is about undo and redo only', async () => {
  const r = rig(); await r.ready(); const before = trace().length; await r.say(EXTEND); await r.say('Keep bars 1 to 2.'); assert.equal(trace().length, before);
});
