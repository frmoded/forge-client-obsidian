// 2026-11-19-0998: the MutationObserver stand-in for every happy-dom test that mounts a module with an observer (chat-panel-dom, prompt-box-dom, live-score-dom, artifact-inspector-core).
//
// WHY: happy-dom 20's MutationObserver hands the page only a WEAKREF to its report function (node_modules/happy-dom/lib/mutation-observer/MutationObserverListener.js: `callback: new WeakRef((record) => this.report(record))`), so a garbage
// collection between mount and use silently ends the delivery: under CPU load a test that waits for the observer failed or stalled (found in 0992c: bar-beatbox-visible.test.ts, about 1 run in 6). This observer holds its callback strongly
// and finds changes by LOOKING (a snapshot compared every 3 ms on a real, unref'd timer), so no collection can end it. The production callback is what is under test; the real browser's observer is proved by the real-Chrome measures.
//
// OPTIONS supported (the ones the production observers pass, and the rest of the DOM spec's): childList, subtree, attributes (with attributeFilter), characterData. attributeOldValue / characterDataOldValue are accepted and ignored (oldValue is null).
// RECORDS: one MutationRecord-shaped object per detected change {type, target, addedNodes, removedNodes, attributeName, oldValue, previousSibling, nextSibling}: childList records carry the added and removed nodes (diffed against the snapshot of the
// observed children, or of the whole subtree with `subtree`); attributes and characterData records carry the name and the target. No production callback reads the records today (all four ignore their argument), so the records are faithful enough, not
// byte-exact: several changes between two looks come as one record per changed target and kind, not one per edit.
// DELIVERY: asynchronous like the real thing (a change made inside the callback is seen on the next look and reported again, as a real observer would), takeRecords() returns what has been seen and not yet delivered (it looks first), disconnect() stops.
//
// The timer is the REAL setInterval captured when this module loads, so a test that later swaps in a fake clock does not freeze the observer.
const realSetInterval = globalThis.setInterval.bind(globalThis);
const realClearInterval = globalThis.clearInterval.bind(globalThis);
const POLL_MS = 3;

type Options = { childList?: boolean; subtree?: boolean; attributes?: boolean; attributeFilter?: string[]; characterData?: boolean; attributeOldValue?: boolean; characterDataOldValue?: boolean };
type Callback = (records: any[], observer: any) => void;
interface Watch { target: any; opts: Required<Pick<Options, 'childList' | 'subtree' | 'attributes' | 'characterData'>> & { attributeFilter: string[] | null }; nodes: any[]; attrs: Map<any, string>; data: Map<any, string> }

/** The observed node and (with `subtree`) all its descendants, in document order. */
function flatten(root: any, subtree: boolean): any[] {
  if (!subtree) return [root, ...Array.from(root.childNodes as ArrayLike<any>)];
  const out: any[] = [];
  const walk = (n: any): void => { out.push(n); for (const c of Array.from(n.childNodes as ArrayLike<any>)) walk(c); };
  walk(root);
  return out;
}
const attrSig = (el: any, filter: string[] | null): string => {
  if (!el.attributes || el.nodeType !== 1) return '';
  const names: string[] = Array.from(el.attributes as ArrayLike<any>, (a: any) => String(a.name));
  return names.filter((n) => !filter || filter.includes(n.toLowerCase())).sort().map((n) => `${n}=${el.getAttribute(n)}`).join('\u0000');
};

export class PollingObserver {
  private readonly cb: Callback;
  private readonly watches: Watch[] = [];
  private timer: any = null;
  private queued: any[] = [];
  constructor(cb: Callback) { this.cb = cb; }

  observe(target: any, options: Options = {}): void {
    if (!target) throw new TypeError("Failed to execute 'observe' on 'MutationObserver': The first parameter \"target\" should be of type \"Node\".");
    const attributes = options.attributes ?? (options.attributeFilter || options.attributeOldValue ? true : false);
    const characterData = options.characterData ?? (options.characterDataOldValue ? true : false);
    if (!options.childList && !attributes && !characterData) throw new TypeError("Failed to execute 'observe' on 'MutationObserver': The options object must set at least one of 'attributes', 'characterData', or 'childList' to true.");
    const opts = { childList: !!options.childList, subtree: !!options.subtree, attributes, characterData, attributeFilter: options.attributeFilter ? options.attributeFilter.map((n) => n.toLowerCase()) : null };
    const existing = this.watches.find((w) => w.target === target);
    const w: Watch = { target, opts, nodes: [], attrs: new Map(), data: new Map() };
    if (existing) this.watches.splice(this.watches.indexOf(existing), 1);           // observe() again on the same target replaces its options, as the spec says
    this.watches.push(w); this.snapshot(w);
    if (this.timer === null) { this.timer = realSetInterval(() => this.look(true), POLL_MS); this.timer.unref?.(); }
  }
  disconnect(): void { this.watches.length = 0; this.queued = []; if (this.timer !== null) realClearInterval(this.timer); this.timer = null; }
  takeRecords(): any[] { this.look(false); const q = this.queued; this.queued = []; return q; }

  private snapshot(w: Watch): void {
    w.nodes = flatten(w.target, w.opts.subtree);
    w.attrs = new Map(); w.data = new Map();
    for (const n of w.nodes) {
      if (w.opts.attributes && n.nodeType === 1 && (w.opts.subtree || n === w.target)) w.attrs.set(n, attrSig(n, w.opts.attributeFilter));
      if (w.opts.characterData && (n.nodeType === 3 || n.nodeType === 8) && (w.opts.subtree || n === w.target)) w.data.set(n, String(n.data ?? n.nodeValue ?? ''));
    }
  }
  /** Compare every watch with its snapshot; queue one record per change; with `deliver`, hand the queue to the callback. */
  private look(deliver: boolean): void {
    for (const w of this.watches) {
      const now = flatten(w.target, w.opts.subtree);
      const before = new Set(w.nodes); const after = new Set(now);
      if (w.opts.childList) {
        const added = now.filter((n) => !before.has(n) && n !== w.target); const removed = w.nodes.filter((n) => !after.has(n));
        // the childList of the observed node (and of each descendant with subtree) changed when a child was added or removed, or the children were reordered
        const sameOrder = (() => { const a = now.filter((n) => before.has(n)); const b = w.nodes.filter((n) => after.has(n)); return a.length === b.length && a.every((n, i) => n === b[i]); })();
        if (added.length || removed.length || !sameOrder) {
          const parents = new Map<any, { added: any[]; removed: any[] }>();
          const slot = (p: any) => { let s = parents.get(p); if (!s) parents.set(p, s = { added: [], removed: [] }); return s; };
          for (const n of added) slot(n.parentNode ?? w.target).added.push(n);
          for (const n of removed) slot(w.target).removed.push(n);
          for (const [p, s] of parents) this.queued.push({ type: 'childList', target: p, addedNodes: s.added, removedNodes: s.removed, previousSibling: null, nextSibling: null, attributeName: null, attributeNamespace: null, oldValue: null });
          if (!parents.size) this.queued.push({ type: 'childList', target: w.target, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null, attributeName: null, attributeNamespace: null, oldValue: null });   // a reorder
        }
      }
      if (w.opts.attributes) for (const n of now) {
        if (n.nodeType !== 1 || !(w.opts.subtree || n === w.target)) continue;
        const sig = attrSig(n, w.opts.attributeFilter);
        if (w.attrs.has(n) && w.attrs.get(n) !== sig) this.queued.push({ type: 'attributes', target: n, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null, attributeName: null, attributeNamespace: null, oldValue: null });
      }
      if (w.opts.characterData) for (const n of now) {
        if ((n.nodeType !== 3 && n.nodeType !== 8) || !(w.opts.subtree || n === w.target)) continue;
        const d = String(n.data ?? n.nodeValue ?? '');
        if (w.data.has(n) && w.data.get(n) !== d) this.queued.push({ type: 'characterData', target: n, addedNodes: [], removedNodes: [], previousSibling: null, nextSibling: null, attributeName: null, attributeNamespace: null, oldValue: null });
      }
      this.snapshot(w);                                  // what is seen is delivered once: a change the callback makes is the NEXT look's change
    }
    if (deliver && this.queued.length) { const q = this.queued; this.queued = []; this.cb(q, this); }
  }
}

/** Give a happy-dom window the polling observer (the page code reads `doc.defaultView.MutationObserver`). Call it right after `new Window(...)`, before anything is mounted. */
export function installPollingObserver(win: any): void { win.MutationObserver = PollingObserver; }

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Wait until a condition holds (the observer reports on a timer, so a fixed tick is a race on a machine under load); gives up after `ms` and lets the assertions that follow say what is wrong. Resolves one more beat after the condition holds, so a second report settles. */
export async function settle(ok: () => boolean, ms = 5000): Promise<void> { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await tick(5); await tick(5); }
