// score_first M4 (drain 2026-10-21-2010) — the message line and the "Forge log (N)" button on the Score panel, in happy-dom with fake timers, and the panel's P3: without the
// `messages` port the Score panel's DOM is exactly the M3 panel's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { FORGE_LOG_CLASS, SCORE_MESSAGE_CLASS, forgeLogLabel, mountScoreMessages } from './score-messages-dom.ts';
import { TRANSIENT_LINE_MS, MessageDelivery } from './score-first-messages-core.ts';
import { attachScoreArea } from './live-score-dom.ts';
import { scorePanelPlan } from './score-first-core.ts';

function fixture() {
  const win: any = new Window({ url: 'http://localhost/' });
  const doc = win.document; const status = doc.createElement('div'); status.className = 'status'; doc.body.appendChild(status);
  const d = new MessageDelivery(); let opened = 0; d.setOpenLog(() => { opened++; });
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const t = { setTimer: (fn: () => void, ms: number) => { timers.push({ fn, ms, live: true }); return timers.length - 1; }, clearTimer: (h: unknown) => { timers[h as number].live = false; } };
  const m = mountScoreMessages(status as HTMLElement, d, t);
  const line = () => doc.querySelector(`.${SCORE_MESSAGE_CLASS}`)!;
  const button = () => doc.querySelector(`.${FORGE_LOG_CLASS}`) as HTMLButtonElement;
  const fire = (i: number) => { if (timers[i].live) { timers[i].live = false; timers[i].fn(); } };
  return { win, doc, status, d, m, line, button, timers, fire, opened: () => opened };
}

test('mounts the message line and the log button right after the status line; the button starts at "Forge log (0)" and says what it does', () => {
  const f = fixture();
  assert.equal(f.status.nextElementSibling, f.line()); assert.equal(f.line().nextElementSibling, f.button());
  assert.equal(f.button().textContent, 'Forge log (0)');
  assert.equal(f.button().getAttribute('aria-label'), 'Open the Forge log');
  assert.equal(f.line().textContent, '');
});

test('an ERROR line stays until the next successful draw; a newer message replaces it; a draw clears only an error that was waiting for one', () => {
  const f = fixture();
  f.d.postToScore({ text: 'Compute failed — boom', kind: 'error', line: { persistence: 'until-next-draw' } });
  assert.equal(f.line().textContent, 'Compute failed — boom'); assert.ok(f.line().classList.contains('is-error'));
  assert.equal(f.timers.length, 0, 'no timer: it waits for a draw');
  f.d.postToScore({ text: 'second error', kind: 'error', line: { persistence: 'until-next-draw' } });
  assert.equal(f.line().textContent, 'second error');
  f.m.drawSucceeded();
  assert.equal(f.line().textContent, ''); assert.ok(!f.line().classList.contains('is-error'));
  f.d.postToScore({ text: 'Forge: synced.', kind: 'success', line: { persistence: 'transient' } });
  f.m.drawSucceeded(); assert.equal(f.line().textContent, 'Forge: synced.', 'a draw does not clear a transient line');
});

test('a TRANSIENT line goes by itself after TRANSIENT_LINE_MS; a newer message cancels the old timer; an error cancels a transient one\'s timer', () => {
  const f = fixture();
  f.d.postToScore({ text: 'one', kind: 'success', line: { persistence: 'transient' } });
  assert.equal(f.timers[0].ms, TRANSIENT_LINE_MS);
  f.d.postToScore({ text: 'two', kind: 'info', line: { persistence: 'transient' } });
  assert.equal(f.timers[0].live, false, 'the first timer was cancelled'); f.fire(0); assert.equal(f.line().textContent, 'two', 'a cancelled timer does nothing');
  f.fire(1); assert.equal(f.line().textContent, '');
  f.d.postToScore({ text: 'three', kind: 'success', line: { persistence: 'transient' } });
  f.d.postToScore({ text: 'bad', kind: 'error', line: { persistence: 'until-next-draw' } });
  f.fire(2); assert.equal(f.line().textContent, 'bad', 'the transient timer cannot wipe the error that replaced it');
});

test('"Forge log (N)" follows the unread count live, says so in its label, and a click asks the plugin to open the panel', () => {
  const f = fixture();
  f.d.bump(); assert.equal(f.button().textContent, forgeLogLabel(1)); assert.equal(f.button().getAttribute('aria-label'), 'Open the Forge log, 1 new message');
  f.d.bump(); assert.equal(f.button().getAttribute('aria-label'), 'Open the Forge log, 2 new messages');
  f.button().click(); assert.equal(f.opened(), 1);
  f.d.markOpened(); assert.equal(f.button().textContent, 'Forge log (0)');
});

test('dispose removes both elements and every subscription (no listener left on the shared state)', () => {
  const f = fixture();
  f.m.dispose();
  assert.equal(f.doc.querySelector(`.${SCORE_MESSAGE_CLASS}`), null); assert.equal(f.doc.querySelector(`.${FORGE_LOG_CLASS}`), null);
  f.d.postToScore({ text: 'x', kind: 'error', line: { persistence: 'until-next-draw' } }); f.d.bump();      // would throw or write into removed nodes if a subscription survived
});

test('the Score panel: WITHOUT the messages port its DOM has neither element (the M3 panel, untouched); WITH it, the line and the button sit under the status line and a draw clears a waiting error', async () => {
  const mk = (withMessages: boolean) => {
    const win: any = new Window({ url: 'http://localhost/' }); const doc = win.document;
    const tab = doc.createElement('div'); doc.body.appendChild(tab);
    const d = new MessageDelivery();
    const area = attachScoreArea(tab as HTMLElement, scorePanelPlan({ scoreFirst: true, edition: 'music' }), {
      renderInto: (host, p) => { host.appendChild(host.ownerDocument.createElement('svg')); void p; return true; }, stopPlayers: () => {},
      compute: async () => ({ type: 'musicxml', content: 'x' }), title: 't', setTimer: (fn) => { void fn; return 0; }, clearTimer: () => {},
      ...(withMessages ? { messages: d } : {}),
    })!;
    return { tab, d, area, doc };
  };
  const without = mk(false);
  assert.equal(without.tab.querySelector(`.${SCORE_MESSAGE_CLASS}`), null); assert.equal(without.tab.querySelector(`.${FORGE_LOG_CLASS}`), null);
  const withM = mk(true);
  const panel = withM.tab.querySelector('.forge-rhythm-edit-score')!;
  assert.deepEqual([...panel.children].slice(0, 3).map((c: Element) => c.className), ['forge-rhythm-edit-score-status', SCORE_MESSAGE_CLASS, FORGE_LOG_CLASS]);
  withM.d.postToScore({ text: 'Compute failed — boom', kind: 'error', line: { persistence: 'until-next-draw' } });
  assert.equal(panel.querySelector(`.${SCORE_MESSAGE_CLASS}`)!.textContent, 'Compute failed — boom');
  withM.area.showNow({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: new Array(16).fill(false) } });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(panel.querySelector(`.${SCORE_MESSAGE_CLASS}`)!.textContent, '', 'the next successful draw cleared the error');
  withM.area.dispose(); assert.equal(withM.tab.querySelector(`.${FORGE_LOG_CLASS}`), null);
});
