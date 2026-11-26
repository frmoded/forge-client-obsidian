// 2026-11-25-1042 Part D: `said()` of the dialog's Copy button (src/chat-panel-dom.ts) has a `disposed` guard. The 1039 mutation report saw it: a clipboard answer that comes AFTER dispose wrote the (detached) button and armed one more 2000 ms timer
// (harmless in effect: its callback is guarded; but a disposed panel owns no timer). Written FIRST, red against 7f43ca2 (the late answer armed a timer), green with `if (disposed) return;`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { type DialogEntry, memoryStore } from './dialog-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };
const note = (id: number, text: string): DialogEntry => ({ id, at: 0, kind: 'notice', text });
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount() {
  const armed: number[] = []; let seq = 0;
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const handle = mountChatPanel(host, { box: BOX, store: memoryStore(), setTimer: () => { armed.push(++seq); return seq; }, clearTimer: () => {} }, '');
  handle.render([note(1, 'hello')], '');
  return { host: host as HTMLElement, handle, armed, copy: (): HTMLButtonElement => host.querySelector('.forge-chat-copy') as HTMLButtonElement };
}
const clipboard = (mode: 'ok' | 'reject') => {
  const waiting: Array<() => void> = [];
  Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: { writeText: (): Promise<void> => new Promise<void>((res, rej) => { waiting.push(mode === 'ok' ? res : () => rej(new Error('denied'))); }) } });
  return { release: (): void => { for (const r of waiting.splice(0)) r(); } };
};

for (const mode of ['ok', 'reject'] as const) {
  test(`a clipboard answer (${mode}) that arrives after dispose writes nothing to the detached button and arms no timer`, async () => {
    const cb = clipboard(mode); const p = mount(); const button = p.copy();
    button.click();                                                                                // the write is pending
    const timers = p.armed.length; const words = button.textContent;
    p.handle.dispose();
    cb.release(); await settle();
    assert.equal(p.armed.length, timers, 'no revert timer is armed on a disposed panel');
    assert.equal(button.textContent, words, 'the detached button is not written to');
  });
}
test('P3: before dispose the same answer still says `Copied` / `Could not copy` and arms its one revert timer', async () => {
  for (const [mode, said] of [['ok', 'Copied'], ['reject', 'Could not copy']] as const) {
    const cb = clipboard(mode); const p = mount(); const timers = p.armed.length;
    p.copy().click(); cb.release(); await settle();
    assert.equal(p.copy().textContent, said); assert.equal(p.armed.length, timers + 1); p.handle.dispose();
  }
});
