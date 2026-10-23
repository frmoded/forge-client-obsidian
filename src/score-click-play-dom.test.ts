// 2026-10-23-0030 — clicking an engraved note must not start the whole score playing in a score-first vault. The click-to-play handler of the music edition, lifted into plain DOM so a happy-dom test mounts
// the very code the Score runs: what a click does when it is allowed, and (the point of the drain) that it does NOTHING when it is not — no `start()`, no `currentTime`, no time lookup — while the click
// still reaches every other listener (the inspector's pin is one).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { attachClickToPlay } from './score-click-play-dom.ts';

function rig(opts: { allowed?: () => boolean; timeFor?: (id: string) => Promise<number> } = {}) {
  const win: any = new Window({ url: 'http://localhost/' });
  const wrap = win.document.createElement('div');
  wrap.innerHTML = '<svg><g class="measure" id="m1"><g class="note" id="n1"><ellipse class="notehead" id="h1"></ellipse></g></g><path class="staff" id="s1"></path></svg>';
  win.document.body.appendChild(wrap);
  const player = { currentTime: 0, starts: 0, start() { this.starts++; } };
  const lookups: string[] = [];
  const errors: unknown[] = [];
  attachClickToPlay(wrap, player, {
    timeFor: opts.timeFor ?? (async (id) => { lookups.push(id); return 1.5; }),
    allowed: opts.allowed,
    onError: (e) => { errors.push(e); },
  });
  const seen: string[] = [];
  wrap.addEventListener('click', (e: any) => { seen.push((e.target as any).id); });      // stands in for the inspector's pin listener
  const click = async (sel: string) => { wrap.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true })); for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return { wrap, player, lookups, errors, seen, click };
}

test('allowed (the default, and every non-score-first vault): a click on a notehead jumps the player to that note and starts it', async () => {
  const r = rig();
  await r.click('#h1');
  assert.equal(r.player.starts, 1);
  assert.equal(r.player.currentTime, 1.5);
  assert.deepEqual(r.lookups, ['n1'], 'the time of the clicked NOTE (the .note ancestor), not of the notehead');
});

test('NOT allowed (score-first): a click on a notehead starts nothing, moves nothing and does not even look the time up', async () => {
  const r = rig({ allowed: () => false });
  await r.click('#h1');
  assert.equal(r.player.starts, 0, 'player.start() is not called');
  assert.equal(r.player.currentTime, 0, 'player.currentTime is not changed');
  assert.deepEqual(r.lookups, []);
  assert.deepEqual(r.errors, []);
});

test('NOT allowed: the click still reaches the other listeners (the inspector pins the bar from the same click)', async () => {
  const r = rig({ allowed: () => false });
  await r.click('#h1');
  assert.deepEqual(r.seen, ['h1']);
});

test('the question is asked at EVERY click, so the answer can change while the Score is on screen (the profile flag is published after the first render)', async () => {
  let ok = true;
  const r = rig({ allowed: () => ok });
  await r.click('#h1'); assert.equal(r.player.starts, 1);
  ok = false;
  await r.click('#h1'); assert.equal(r.player.starts, 1, 'turned off: no second start');
  ok = true;
  await r.click('#h1'); assert.equal(r.player.starts, 2);
});

test('a click that is not on a note (a staff line) does nothing in either case', async () => {
  const r = rig();
  await r.click('#s1');
  assert.equal(r.player.starts, 0);
  assert.deepEqual(r.lookups, []);
});

test('a failing time lookup is reported through onError and starts nothing', async () => {
  const r = rig({ timeFor: async () => { throw new Error('no timemap'); } });
  await r.click('#h1');
  assert.equal(r.player.starts, 0);
  assert.equal(r.errors.length, 1);
  assert.match(String((r.errors[0] as Error).message), /no timemap/);
});
