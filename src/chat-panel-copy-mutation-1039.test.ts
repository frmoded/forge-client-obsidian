// 2026-11-24-1039 (mutation pass): the survivors of the `Copy` button of the dialog (src/chat-panel-dom.ts) pinned one by one. Every test here is RED against a hand mutant of the code it names (~/.forge-mem-evidence/p1011/hand-1039.json) and green on the real code.
//   - hidden from the first frame (not only after a draw); `Copied`/`Could not copy` go back to `Copy` after EXACTLY 2000 ms (1999 still says it); a second click while the words show restarts the 2000 ms (the old timer is cleared, not left to
//     revert the new words early) and a timer that already fired is not cleared again; nothing is written after dispose; the line under the card is told apart from a CUT of a dialog line by its exact prefix (the ellipsis is dropped, nothing else);
//   - dispose: the Cmd/Ctrl+K listener is gone, the content watch is disconnected, the card is taken out (box.dispose), a draw after it draws nothing, a late clipboard answer clears no timer twice.
// A fake clock is passed as the panel's own timer port (`setTimer`/`clearTimer`) and a fake clipboard on the window's navigator, as src/composer-refusal-copy-1039.test.ts does. A DOM element is never an assert operand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountChatPanel } from './chat-panel-dom.ts';
import { type DialogEntry, memoryStore } from './dialog-core.ts';
import { TICK_MS } from './relative-time-core.ts';
import { installPollingObserver, PollingObserver } from './test-support/polling-observer.ts';

const win: any = new Window({ url: 'http://localhost/' });
const BOX = { preview: async () => ({ ok: false as const, message: 'x' }), apply: async () => ({ ok: false }) };

/** A clock the panel's timers run on: `advance(ms)` fires what is due, in order. `cancel: false` = a clearTimer that records the call but cannot stop a timer (one that already left the queue). */
function clock(opts: { cancel?: boolean } = {}) {
  let now = 0, seq = 0;
  const q = new Map<number, { at: number; fn: () => void; ms: number }>();
  const cleared: number[] = [], armed: number[] = [];
  return {
    setTimer: (fn: () => void, ms: number): unknown => { const id = ++seq; q.set(id, { at: now + ms, fn, ms }); armed.push(id); return id; },
    clearTimer: (h: unknown): void => { cleared.push(h as number); if (opts.cancel !== false) q.delete(h as number); },
    advance(ms: number): void {
      const to = now + ms;
      for (;;) {
        let next: number | null = null;
        for (const [id, t] of q) if (t.at <= to && (next === null || t.at < q.get(next)!.at)) next = id;
        if (next === null) break;
        const t = q.get(next)!; q.delete(next); now = t.at; t.fn();
      }
      now = to;
    },
    pending: (): number => q.size,
    delays: (): number[] => [...q.values()].map((t) => t.ms),
    cleared, armed,
  };
}
type Clock = ReturnType<typeof clock>;

const note = (id: number, text: string): DialogEntry => ({ id, at: 0, kind: 'notice', text });
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const clipboard = (mode: 'ok' | 'reject' | 'none' | 'deferred' = 'ok') => {
  const written: string[] = []; const waiting: Array<() => void> = [];
  const value = mode === 'none' ? undefined : {
    writeText: (t: string): Promise<void> => {
      written.push(t);
      if (mode === 'reject') return Promise.reject(new Error('denied'));
      if (mode === 'deferred') return new Promise<void>((res) => { waiting.push(res); });
      return Promise.resolve();
    },
  };
  Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value });
  return { written, release: (): void => { for (const r of waiting.splice(0)) r(); } };
};

function mount(entries: DialogEntry[] | null, c: Clock = clock()) {
  const host = win.document.createElement('div'); win.document.body.appendChild(host);
  const handle = mountChatPanel(host, { box: BOX, store: memoryStore(), setTimer: c.setTimer, clearTimer: c.clearTimer }, '');
  if (entries !== null) handle.render(entries, '');
  const copy = (): HTMLButtonElement => host.querySelector('.forge-chat-copy') as HTMLButtonElement;
  return { host: host as HTMLElement, handle, copy, c };
}

test('the Copy button is hidden from the first frame (nothing was drawn yet), and again when the dialog is emptied', () => {
  const p = mount(null);                                                                          // mounted, never drawn
  assert.equal(p.copy().hidden, true);
  p.handle.render([note(1, 'hello')], ''); assert.equal(p.copy().hidden, false);
  p.handle.render([], ''); assert.equal(p.copy().hidden, true);
  p.handle.dispose();
});

test('`Copied` goes back to `Copy` after exactly 2000 ms: 1999 ms still says Copied', async () => {
  clipboard('ok');
  const p = mount([note(1, 'hello')]);
  p.copy().click(); await settle();
  assert.equal(p.copy().textContent, 'Copied');
  assert.deepEqual(p.c.delays(), [TICK_MS, 2000], 'the minutes-ago recount and ONE revert timer of 2000 ms');
  p.c.advance(1999); assert.equal(p.copy().textContent, 'Copied');
  p.c.advance(1); assert.equal(p.copy().textContent, 'Copy');
  p.handle.dispose();
});

test('a second click while `Copied` shows restarts the 2000 ms: the first timer is cleared and cannot revert the new words early', async () => {
  clipboard('ok');
  const p = mount([note(1, 'hello')]);
  p.copy().click(); await settle();                                                               // t=0: Copied, revert due at 2000
  const first = p.c.armed.at(-1)!;
  p.c.advance(1000);
  p.copy().click(); await settle();                                                               // t=1000: Copied again, revert due at 3000
  assert.equal(p.copy().textContent, 'Copied');
  assert.deepEqual(p.c.cleared, [first], 'the first revert timer was cleared');
  p.c.advance(1000);                                                                              // t=2000: the FIRST one would have fired now
  assert.equal(p.copy().textContent, 'Copied', 'still Copied at 2000 (the second click restarted the count)');
  p.c.advance(999); assert.equal(p.copy().textContent, 'Copied');                                 // t=2999
  p.c.advance(1); assert.equal(p.copy().textContent, 'Copy');                                     // t=3000
  p.handle.dispose();
});

test('a revert timer that already fired is not cleared again by the next click', async () => {
  clipboard('ok');
  const p = mount([note(1, 'hello')]);
  p.copy().click(); await settle(); p.c.advance(2000);
  assert.equal(p.copy().textContent, 'Copy');
  p.copy().click(); await settle();
  assert.equal(p.copy().textContent, 'Copied');
  assert.deepEqual(p.c.cleared, [], 'nothing was left to clear');
  p.c.advance(2000); assert.equal(p.copy().textContent, 'Copy');
  p.handle.dispose();
});

test('a clipboard that refuses says `Could not copy` (the exact words) and goes back to `Copy` after 2000 ms; the same with no clipboard at all', async () => {
  clipboard('reject');
  const p = mount([note(1, 'hello')]);
  p.copy().click(); await settle();
  assert.equal(p.copy().textContent, 'Could not copy');
  p.c.advance(1999); assert.equal(p.copy().textContent, 'Could not copy');
  p.c.advance(1); assert.equal(p.copy().textContent, 'Copy');
  p.handle.dispose();
  clipboard('none');
  const q = mount([note(1, 'hello')]);
  q.copy().click(); assert.equal(q.copy().textContent, 'Could not copy');
  q.c.advance(1999); assert.equal(q.copy().textContent, 'Could not copy');
  q.c.advance(1); assert.equal(q.copy().textContent, 'Copy');
  q.handle.dispose();
});

test('the revert never writes after dispose, even when the timer fires anyway', async () => {
  clipboard('ok');
  const p = mount([note(1, 'hello')], clock({ cancel: false }));                                  // a clearTimer that cannot stop a timer already due
  p.copy().click(); await settle();
  const button = p.copy();                                                                        // (dispose takes the panel out of the host: keep the button)
  assert.equal(button.textContent, 'Copied');
  p.handle.dispose();
  p.c.advance(2000);
  assert.equal(button.textContent, 'Copied', 'the disposed panel is not written to');
});

test('the line under the card is told from a CUT dialog line by its exact prefix: the ellipsis is dropped, the first and the last letter before it count', async () => {
  const w = clipboard('ok');
  const cut = 'abcd…';
  const p = mount([note(1, cut)]);
  p.handle.box.setNote('abcdefgh'); p.copy().click(); await settle();                             // the full line the cut came from: said already
  assert.deepEqual(w.written.at(-1), `Forge: ${cut}`);
  p.handle.box.setNote('abcXefgh'); p.copy().click(); await settle();                             // the same start but NOT the same line: a line of its own (the last letter before the ellipsis differs)
  assert.deepEqual(w.written.at(-1), `Forge: ${cut}\nUnder the box: abcXefgh`);
  p.handle.box.setNote('Xbcdefgh'); p.copy().click(); await settle();                             // the first letter differs
  assert.deepEqual(w.written.at(-1), `Forge: ${cut}\nUnder the box: Xbcdefgh`);
  p.handle.box.setNote('abcd'); p.copy().click(); await settle();                                 // exactly the words before the ellipsis
  assert.deepEqual(w.written.at(-1), `Forge: ${cut}`);
  p.handle.dispose();
});

test('dispose: Cmd/Ctrl+K on the host no longer reaches the panel (the keydown listener is gone)', () => {
  const p = mount([note(1, 'hello')]);
  const key = (): boolean => { const e = new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }); p.host.dispatchEvent(e); return e.defaultPrevented; };
  assert.equal(key(), true, 'alive: the shortcut is taken');
  p.handle.dispose();
  assert.equal(key(), false, 'disposed: the shortcut is not taken any more');
});

test('dispose: the content watch of the host is disconnected', () => {
  // 2026-11-24-1039: the observer is the ONE shared helper (the 0998 mechanism pin forbids a test file's own stand-in); its prototype is wrapped only to SEE observe and disconnect.
  installPollingObserver(win);
  const proto: any = PollingObserver.prototype; const observe = proto.observe; const disconnect = proto.disconnect; const seen: any[] = [];
  proto.observe = function (this: unknown, t: unknown, o: unknown) { seen.push({ ob: this, target: t, disconnected: false }); return observe.call(this, t, o); };
  proto.disconnect = function (this: unknown) { const s = seen.find((x) => x.ob === this); if (s) s.disconnected = true; return disconnect.call(this); };
  try {
    const p = mount([note(1, 'hello')]);
    const mine = seen.filter((o) => o.target === p.host);
    assert.equal(mine.length, 1, 'the panel watches its host');
    assert.equal(mine[0].disconnected, false);
    p.handle.dispose();
    assert.equal(mine[0].disconnected, true);
  } finally { proto.observe = observe; proto.disconnect = disconnect; }
});

test('dispose: the card (the prompt box) is taken out, and a draw after it draws nothing and the panel says it is not attached', () => {
  const p = mount([note(1, 'hello')]);
  const panel = p.handle.el;
  assert.equal(panel.querySelectorAll('.forge-prompt-box').length, 1);
  assert.equal(panel.querySelectorAll('.forge-chat-msg').length, 1);
  p.handle.dispose();
  assert.equal(panel.querySelectorAll('.forge-prompt-box').length, 0, 'the card is gone (box.dispose)');
  assert.equal(panel.querySelectorAll('.forge-composer-error').length, 0);
  assert.equal(p.handle.attached(), false);
  p.handle.render([note(1, 'hello'), note(2, 'more')], '');
  assert.equal(panel.querySelectorAll('.forge-chat-msg').length, 1, 'a draw after dispose changes nothing');
  assert.equal(p.copy(), null, 'the panel is out of the host');
});

test('dispose: it clears the revert timer once, and a clipboard answer that comes late clears nothing again (the handle was forgotten)', async () => {
  const cb = clipboard('ok');
  const p = mount([note(1, 'hello')]);
  p.copy().click(); await settle();                                                               // Copied; revert timer T1
  const t1 = p.c.armed.at(-1)!;
  const later = clipboard('deferred');
  p.copy().click();                                                                               // a second write that is still pending
  p.handle.dispose();
  assert.ok(p.c.cleared.includes(t1), 'dispose cleared the revert timer');
  const before = p.c.cleared.length;
  later.release(); await settle();                                                                // the late answer: `Copied` is said on a disposed panel
  assert.equal(p.c.cleared.length, before, 'no handle is cleared twice (copyTimer was reset to null)');
  assert.equal(cb.written.length, 1);
});
