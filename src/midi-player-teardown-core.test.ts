// Tests for the midi-player teardown helper.
//
// Locks: every <midi-player> in the root gets .stop() (or .pause()
// fallback) before the caller removes the element from the DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stopMidiPlayersIn,
  type QueryRoot,
  type StoppablePlayer,
} from './midi-player-teardown-core.ts';

class Player implements StoppablePlayer {
  stopped = 0;
  paused = 0;
  stop = () => { this.stopped += 1; };
  pause = () => { this.paused += 1; };
}

function rootWith(players: StoppablePlayer[]): QueryRoot {
  return {
    querySelectorAll: (sel: string) => {
      assert.equal(sel, 'midi-player');
      return players as ArrayLike<unknown>;
    },
  };
}

test('stopMidiPlayersIn: calls .stop() on every player and counts them', () => {
  const a = new Player(), b = new Player(), c = new Player();
  const n = stopMidiPlayersIn(rootWith([a, b, c]));
  assert.equal(n, 3);
  assert.equal(a.stopped, 1);
  assert.equal(b.stopped, 1);
  assert.equal(c.stopped, 1);
});

test('stopMidiPlayersIn: falls back to .pause() when .stop() is absent', () => {
  const pauseOnly: StoppablePlayer = (() => {
    let paused = 0;
    return { pause: () => { paused += 1; }, get _paused() { return paused; } } as unknown as StoppablePlayer & { _paused: number };
  })();
  const n = stopMidiPlayersIn(rootWith([pauseOnly]));
  assert.equal(n, 1);
  assert.equal((pauseOnly as unknown as { _paused: number })._paused, 1);
});

test('stopMidiPlayersIn: skips players with neither stop nor pause', () => {
  const blank = {} as StoppablePlayer;
  const real = new Player();
  const n = stopMidiPlayersIn(rootWith([blank, real]));
  assert.equal(n, 1);  // only `real` counted
  assert.equal(real.stopped, 1);
});

test('stopMidiPlayersIn: a player that throws does not strand siblings', () => {
  const errors: string[] = [];
  const broken: StoppablePlayer = { stop: () => { throw new Error('boom'); } };
  const ok = new Player();
  const n = stopMidiPlayersIn(rootWith([broken, ok]), (msg) => errors.push(msg));
  assert.equal(n, 1);
  assert.equal(ok.stopped, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stop\/pause failed/);
});

test('stopMidiPlayersIn: null/undefined root is a no-op', () => {
  assert.equal(stopMidiPlayersIn(null), 0);
  assert.equal(stopMidiPlayersIn(undefined), 0);
});

test('stopMidiPlayersIn: empty player list returns 0', () => {
  assert.equal(stopMidiPlayersIn(rootWith([])), 0);
});

test('stopMidiPlayersIn: querySelectorAll throw is logged + returns 0', () => {
  const errors: string[] = [];
  const broken: QueryRoot = {
    querySelectorAll: () => { throw new Error('detached'); },
  };
  const n = stopMidiPlayersIn(broken, (msg) => errors.push(msg));
  assert.equal(n, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /querySelectorAll failed/);
});
