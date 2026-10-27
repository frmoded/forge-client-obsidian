// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the ONE host-faithful stand-in for Obsidian's workspace and its clock. Every test that fakes `app.workspace.iterateAllLeaves`, delivers `layout-change` or waits for
// the pair's 300 ms settle uses this file; none writes its own. The reason is the 1545 incident: a hand-rolled `iterateAllLeaves` that called the callback for EVERY leaf (Obsidian's stops a split's walk on a truthy return, app.js 1.14.5)
// hid a bug that closed the pair within a second, for a whole day. A test double for the host reproduces the host's control flow: the walk's early stop, events that arrive after the settle (not inside the call that caused them), and time
// that moves only when the test moves it (no sleeps: a real wait under parallel load is what made the settle test flaky).
import { setImmediate as realSetImmediate } from 'node:timers';

export type Splits<L> = { root: readonly L[]; left: readonly L[]; right: readonly L[]; floating: readonly L[] };

/** Obsidian's `iterateAllLeaves`, as read from its app.js: each split is walked in order (root, left, right, floating) and the walk of THAT split stops when the callback returns something truthy. `splits` is read at every call. */
export function iterateAllLeavesLikeObsidian<L>(splits: () => Partial<Splits<L>>): (callback: (leaf: L) => unknown) => void {
  return (callback) => {
    const s = splits();
    for (const split of [s.root ?? [], s.left ?? [], s.right ?? [], s.floating ?? []]) for (const leaf of [...split]) if (callback(leaf)) break;
  };
}

/** A workspace whose splits the test edits (`splits.root.push(...)`), with the faithful walk. */
export function obsidianWorkspace<L>(splits: { root: L[]; left: L[]; right: L[]; floating: L[] }) {
  return { splits, iterateAllLeaves: iterateAllLeavesLikeObsidian<L>(() => splits) };
}

/** Layout changes reach the plugin AFTER the host's work settled, not inside the call that caused them (the leaf is busy until its setViewState ends). */
export const HOST_LAYOUT_SETTLE_MS = 40;

type Timer = { at: number; seq: number; fn: () => void };

export type HostClock = {
  now(): number;
  /** Move time forward by `ms`, running every timer that falls due in order and letting the promise chains each one starts finish before the next. */
  advance(ms: number): Promise<void>;
  /** Let pending promise chains finish without moving time. */
  flush(): Promise<void>;
  /** Deliver `handlers` the way the host does for layout-change: HOST_LAYOUT_SETTLE_MS later, then run (a test advances the clock to receive it). */
  deliverAfterSettle(handlers: Array<() => void> | undefined): void;
  restore(): void;
};

/** Replaces `Date.now`, `setTimeout` and `clearTimeout` on `globalThis` and on `win` (the happy-dom window the plugin calls `window.setTimeout` on) until `restore()`. Install it AFTER the plugin is bundled. */
export function installHostClock(win?: { setTimeout?: unknown; clearTimeout?: unknown }): HostClock {
  let now = 1_000_000;
  let seq = 0;
  let timers: Timer[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { dateNow: Date.now, setTimeout: g.setTimeout, clearTimeout: g.clearTimeout, winSet: win?.setTimeout, winClear: win?.clearTimeout };
  const setT = (fn: () => void, ms = 0): Timer => { const t = { at: now + Math.max(0, ms), seq: seq++, fn }; timers.push(t); return t; };
  const clearT = (t: unknown): void => { timers = timers.filter((x) => x !== t); };
  Date.now = () => now;
  g.setTimeout = setT; g.clearTimeout = clearT;
  if (win) { win.setTimeout = setT; win.clearTimeout = clearT; }
  const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => { realSetImmediate(resolve); }); };
  const clock: HostClock = {
    now: () => now,
    flush,
    async advance(ms) {
      const target = now + ms;
      await flush();
      for (let guard = 0; guard < 10_000; guard++) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        now = Math.max(now, due.at);
        due.fn();
        await flush();
      }
      now = target;
      await flush();
    },
    deliverAfterSettle(handlers) { const list = [...(handlers ?? [])]; setT(() => { for (const h of list) h(); }, HOST_LAYOUT_SETTLE_MS); },
    restore() {
      Date.now = saved.dateNow; g.setTimeout = saved.setTimeout; g.clearTimeout = saved.clearTimeout;
      if (win) { win.setTimeout = saved.winSet; win.clearTimeout = saved.winClear; }
    },
  };
  return clock;
}
