// Tests for the leaf-discard-before-detach sequence.
//
// Locks two properties:
// 1. For each pair, setViewData('', true) fires.
// 2. ALL setViewData calls fire BEFORE ANY leaf.detach() call.
//
// Property 2 is the load-bearing one: a per-pair "discard then detach"
// would also break under autosave races, because the first leaf's
// detach could schedule a flush before the second leaf's discard
// runs. Two-pass (discard all, then detach all) keeps all teardowns
// non-flushing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discardThenDetach,
  type DetachableLeaf,
  type DiscardableView,
} from './leaf-discard-before-detach-core.ts';

class Recorder {
  events: string[] = [];
  view(id: string): DiscardableView {
    return {
      setViewData: (data: string, clear: boolean) => {
        this.events.push(`view:${id}:setViewData(${JSON.stringify(data)},${clear})`);
      },
    };
  }
  leaf(id: string): DetachableLeaf {
    return {
      detach: () => {
        this.events.push(`leaf:${id}:detach`);
      },
    };
  }
}

test('discardThenDetach: every view gets setViewData("", true)', () => {
  const r = new Recorder();
  discardThenDetach(
    [
      { view: r.view('a'), leaf: r.leaf('a') },
      { view: r.view('b'), leaf: r.leaf('b') },
    ],
    () => {},
  );
  assert.ok(r.events.includes('view:a:setViewData("",true)'));
  assert.ok(r.events.includes('view:b:setViewData("",true)'));
});

test('discardThenDetach: every leaf gets detached', () => {
  const r = new Recorder();
  discardThenDetach(
    [
      { view: r.view('a'), leaf: r.leaf('a') },
      { view: r.view('b'), leaf: r.leaf('b') },
    ],
    () => {},
  );
  assert.ok(r.events.includes('leaf:a:detach'));
  assert.ok(r.events.includes('leaf:b:detach'));
});

test('discardThenDetach: ALL setViewData calls fire BEFORE ANY detach', () => {
  // This is the load-bearing ordering. If any detach fires before any
  // setViewData, the dirty buffer can flush mid-sequence.
  const r = new Recorder();
  discardThenDetach(
    [
      { view: r.view('a'), leaf: r.leaf('a') },
      { view: r.view('b'), leaf: r.leaf('b') },
      { view: r.view('c'), leaf: r.leaf('c') },
    ],
    () => {},
  );
  const lastSetViewData = Math.max(
    ...r.events
      .map((e, i) => (e.includes('setViewData') ? i : -1))
      .filter((i) => i >= 0),
  );
  const firstDetach = r.events.findIndex((e) => e.includes('detach'));
  assert.ok(
    lastSetViewData < firstDetach,
    `expected ALL setViewData to precede ALL detach; events: ${JSON.stringify(r.events)}`,
  );
});

test('discardThenDetach: setViewData throw does not strand subsequent discards', () => {
  const errors: Array<{ msg: string; err: unknown }> = [];
  const log = (msg: string, err: unknown) => errors.push({ msg, err });
  const r = new Recorder();
  const brokenView: DiscardableView = {
    setViewData() {
      throw new Error('boom-view');
    },
  };
  discardThenDetach(
    [
      { view: brokenView, leaf: r.leaf('a') },
      { view: r.view('b'), leaf: r.leaf('b') },
    ],
    log,
  );
  // b's discard still runs even though a's threw.
  assert.ok(r.events.includes('view:b:setViewData("",true)'));
  // And BOTH leaves still get detached.
  assert.ok(r.events.includes('leaf:a:detach'));
  assert.ok(r.events.includes('leaf:b:detach'));
  assert.equal(errors.length, 1);
  assert.match(errors[0].msg, /setViewData/);
});

test('discardThenDetach: leaf.detach throw does not strand subsequent detaches', () => {
  const errors: Array<{ msg: string; err: unknown }> = [];
  const log = (msg: string, err: unknown) => errors.push({ msg, err });
  const r = new Recorder();
  const brokenLeaf: DetachableLeaf = {
    detach() {
      throw new Error('boom-leaf');
    },
  };
  discardThenDetach(
    [
      { view: r.view('a'), leaf: brokenLeaf },
      { view: r.view('b'), leaf: r.leaf('b') },
    ],
    log,
  );
  // b's detach still runs even though a's threw.
  assert.ok(r.events.includes('leaf:b:detach'));
  assert.equal(errors.length, 1);
  assert.match(errors[0].msg, /detach/);
});

test('discardThenDetach: empty pair list is a no-op', () => {
  const r = new Recorder();
  let logged = false;
  discardThenDetach([], () => { logged = true; });
  assert.deepEqual(r.events, []);
  assert.equal(logged, false);
});
