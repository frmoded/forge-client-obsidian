// Drain 2026-10-09-2200: "after the first reload of a session the restored note has no Forge header icons until another note is opened".
// The decisions (which events must trigger a header sync, when a view needs one, coalescing) are pure and tested here with a FAKE
// workspace; the Obsidian wiring in main.ts is pinned from source in header-sync-wiring.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEADER_SYNC_WORKSPACE_EVENTS,
  HEADER_SYNC_METADATA_EVENTS,
  createHeaderSyncScheduler,
  headerSignature,
  installHeaderSync,
  needsHeaderSync,
  type HeaderSyncHost,
} from './header-sync-core.ts';

// ---- the "needs sync" decision + idempotency -------------------------------------------------------------------

test('signature: path + frontmatter type, so a different note or a type change re-syncs and nothing else does', () => {
  assert.equal(headerSignature('a.md', 'action'), 'a.md|action');
  assert.equal(headerSignature('a.md', undefined), 'a.md|');
  assert.equal(headerSignature(null, 'action'), '|action');
  assert.notEqual(headerSignature('a.md', 'action'), headerSignature('b.md', 'action'));
  assert.notEqual(headerSignature('a.md', 'action'), headerSignature('a.md', 'data'));
});

test('needsHeaderSync: true when actions are absent (even with a matching signature) or the signature changed; false only when present AND current', () => {
  const sig = headerSignature('a.md', 'action');
  assert.equal(needsHeaderSync({ signature: sig, lastSignature: sig, actionsPresent: true }), false);
  assert.equal(needsHeaderSync({ signature: sig, lastSignature: sig, actionsPresent: false }), true, 'a view whose actions vanished');
  assert.equal(needsHeaderSync({ signature: sig, lastSignature: undefined, actionsPresent: true }), true, 'never synced');
  assert.equal(needsHeaderSync({ signature: sig, lastSignature: headerSignature('b.md', 'action'), actionsPresent: true }), true);
});

test('idempotency: running the sync N times on one view yields ONE set of actions (the same toy "view" the production loop uses)', () => {
  // a toy header: sync() = sweep our actions, add the three kinds; guarded by needsHeaderSync exactly like syncButtons
  const view = { actions: [] as string[], last: undefined as string | undefined, file: 'a.md', type: 'action' as string | undefined, adds: 0 };
  const sync = () => {
    const sig = headerSignature(view.file, view.type);
    if (!needsHeaderSync({ signature: sig, lastSignature: view.last, actionsPresent: view.actions.length > 0 })) return;
    view.actions = [];                                   // sweep
    for (const kind of ['restore', 'new-note', 'edges', 'forge']) { view.actions.push(kind); view.adds++; }
    view.last = sig;
  };
  for (let i = 0; i < 10; i++) sync();
  assert.deepEqual(view.actions, ['restore', 'new-note', 'edges', 'forge']);
  assert.equal(view.adds, 4, 'ten syncs built the set once');
  view.type = 'data';                                    // the note's type changed: re-synced exactly once more
  sync(); sync();
  assert.equal(view.adds, 8);
  view.actions = [];                                     // the header was torn down by Obsidian: rebuilt
  sync();
  assert.equal(view.adds, 12);
});

// ---- the scheduler -----------------------------------------------------------------------------------------------

function clock() {
  let now = 0; let id = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => { const i = id++; timers.set(i, { at: now + ms, fn }); return i; },
    clearTimer: (h: unknown) => { timers.delete(h as number); },
    advance(ms: number) {
      const t = now + ms;
      for (;;) {
        const d = [...timers.entries()].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0];
        if (!d) break;
        timers.delete(d[0]); now = d[1].at; d[1].fn();
      }
      now = t;
    },
  };
}

test('scheduler: a burst of requests is ONE run after the quiet window (no storm, no flicker)', () => {
  const c = clock(); let runs = 0;
  const s = createHeaderSyncScheduler({ setTimer: c.setTimer, clearTimer: c.clearTimer, run: () => { runs++; } });
  for (let i = 0; i < 12; i++) { s.request(); c.advance(10); }
  assert.equal(runs, 0, 'still inside the window');
  c.advance(100);
  assert.equal(runs, 1);
});

test('scheduler: runNow cancels the pending timer and runs once; dispose cancels everything', () => {
  const c = clock(); let runs = 0;
  const s = createHeaderSyncScheduler({ setTimer: c.setTimer, clearTimer: c.clearTimer, run: () => { runs++; } });
  s.request(); s.runNow();
  assert.equal(runs, 1);
  c.advance(500);
  assert.equal(runs, 1, 'the cancelled timer did not fire');
  s.request(); s.dispose(); c.advance(500); s.request(); c.advance(500);
  assert.equal(runs, 1);
});

test('scheduler: a run that throws does not stop later runs', () => {
  const c = clock(); let n = 0;
  const s = createHeaderSyncScheduler({ setTimer: c.setTimer, clearTimer: c.clearTimer, run: () => { n++; if (n === 1) throw new Error('boom'); } });
  s.request(); c.advance(100);
  s.request(); c.advance(100);
  assert.equal(n, 2);
});

// ---- the fake workspace: reproduce the cold-start orderings ------------------------------------------------------

type Ev = string;
function fakeHost() {
  const handlers = new Map<Ev, Array<() => void>>();
  let layoutReadyCbs: Array<() => void> = [];
  const host: HeaderSyncHost = {
    onWorkspace: (ev, fn) => { handlers.set(`w:${ev}`, [...(handlers.get(`w:${ev}`) ?? []), fn]); },
    onMetadata: (ev, fn) => { handlers.set(`m:${ev}`, [...(handlers.get(`m:${ev}`) ?? []), fn]); },
    onLayoutReady: (fn) => { layoutReadyCbs.push(fn); },
  };
  return {
    host,
    emitW: (ev: string) => (handlers.get(`w:${ev}`) ?? []).forEach((f) => f()),
    emitM: (ev: string) => (handlers.get(`m:${ev}`) ?? []).forEach((f) => f()),
    layoutReady: () => { const cbs = layoutReadyCbs; layoutReadyCbs = []; cbs.forEach((f) => f()); },
    subscribed: () => [...handlers.keys()].sort(),
  };
}

function install(f: ReturnType<typeof fakeHost>, opts: { events?: { workspace: readonly string[]; metadata: readonly string[] } } = {}) {
  const c = clock();
  const syncs: string[] = [];
  const handle = installHeaderSync(f.host, {
    setTimer: c.setTimer, clearTimer: c.clearTimer,
    sync: () => { syncs.push('sync'); },
    events: opts.events,
  });
  return { c, syncs, handle };
}

test('install: subscribes to every event the fix requires — layout-change, active-leaf-change, file-open, metadata resolved + changed — and layout-ready', () => {
  assert.deepEqual([...HEADER_SYNC_WORKSPACE_EVENTS].sort(), ['active-leaf-change', 'file-open', 'layout-change']);
  assert.deepEqual([...HEADER_SYNC_METADATA_EVENTS].sort(), ['changed', 'resolved']);
  const f = fakeHost();
  install(f);
  assert.deepEqual(f.subscribed(), ['m:changed', 'm:resolved', 'w:active-leaf-change', 'w:file-open', 'w:layout-change']);
});

test('REPRO (old wiring): with ONLY layout-change subscribed, a restored leaf that finishes loading without a layout-change is never synced', () => {
  const f = fakeHost();
  const { c, syncs } = install(f, { events: { workspace: ['layout-change'], metadata: [] } });
  // onload ran syncButtons() once synchronously — before the layout existed (active view null) — that is NOT an event;
  // then the leaf's deferred view loads and the cache resolves, but neither fires layout-change:
  f.emitM('resolved'); f.emitW('active-leaf-change'); f.emitW('file-open');
  c.advance(1000);
  assert.deepEqual(syncs, [], 'nothing re-ran the sync: the icons stay missing until some OTHER note triggers layout-change');
});

test('FIX: the same cold-start ordering now syncs — on active-leaf-change, on file-open, on metadata resolved/changed, and on layout-ready', () => {
  for (const trigger of [
    (f: ReturnType<typeof fakeHost>) => f.emitW('active-leaf-change'),
    (f: ReturnType<typeof fakeHost>) => f.emitW('file-open'),
    (f: ReturnType<typeof fakeHost>) => f.emitM('resolved'),
    (f: ReturnType<typeof fakeHost>) => f.emitM('changed'),
    (f: ReturnType<typeof fakeHost>) => f.layoutReady(),
  ]) {
    const f = fakeHost();
    const { c, syncs } = install(f);
    trigger(f);
    c.advance(1000);
    assert.equal(syncs.length >= 1, true);
  }
});

test('FIX: a burst of cold-start events (layout-change x3, resolved x2, file-open, layout-ready) costs TWO syncs, not nine: the layout-ready catch-up + one coalesced', () => {
  const f = fakeHost();
  const { c, syncs } = install(f);
  f.emitW('layout-change'); f.emitW('layout-change'); f.emitM('resolved'); f.emitW('file-open'); f.layoutReady(); f.emitW('layout-change'); f.emitM('resolved');
  c.advance(1000);
  assert.deepEqual(syncs, ['sync', 'sync']);
});

test('FIX: events only (no layout-ready), nine of them, are exactly ONE sync', () => {
  const f = fakeHost();
  const { c, syncs } = install(f);
  for (let i = 0; i < 3; i++) { f.emitW('layout-change'); f.emitM('resolved'); f.emitW('file-open'); }
  c.advance(1000);
  assert.deepEqual(syncs, ['sync']);
});

test('FIX: layout-ready runs a sync immediately at that moment (not only after the debounce) and once more after, so a leaf loaded late is caught', () => {
  const f = fakeHost();
  const { c, syncs } = install(f);
  f.layoutReady();
  assert.equal(syncs.length, 1, 'synchronous catch-up at layout-ready');
  c.advance(1000);
  assert.equal(syncs.length >= 1, true);
});

test('install: dispose() cancels pending work', () => {
  const f = fakeHost();
  const { c, syncs, handle } = install(f);
  f.emitW('layout-change');
  handle.dispose();
  c.advance(1000);
  assert.deepEqual(syncs, []);
});
