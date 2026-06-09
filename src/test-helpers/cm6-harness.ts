// v0.2.112 Item B — minimal CM6 integration harness.
//
// Goal: mount a real CM6 EditorView against happy-dom so we can
// verify decoration/extension behavior end-to-end. Pure-core tests
// catch zero of the CM6 surprises that cost this session three
// release cycles (v0.2.85→.89, v0.2.108→.110, v0.2.110→.111).
//
// Constraints:
//   - No vitest / playwright (already heavy lift).
//   - Reuse the existing node --test + node:assert convention.
//   - Stay shipping-fast: just enough to confirm "does our extension
//     produce a rendered fold in pure CM6, isolated from Obsidian's
//     own renderer".
//
// What this harness CANNOT catch:
//   - Obsidian-specific renderer overrides (different CM6 setup).
//   - Workspace-state timing races (Obsidian-specific, no analog).
//   - Live Preview decoration interactions.
//
// What it CAN catch:
//   - ViewPlugin attempts to provide line-break-spanning decorations
//     (CM6 throws RangeError on first render — this would have caught
//     v0.2.109).
//   - Decoration.replace via StateField actually renders the
//     placeholder + hides the original text.
//   - Extension state initialization order (StateField.create vs
//     update).

import { Window } from 'happy-dom';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

interface HarnessGlobals {
  window?: unknown;
  document?: unknown;
  navigator?: unknown;
  Element?: unknown;
  HTMLElement?: unknown;
  Node?: unknown;
  Range?: unknown;
  getComputedStyle?: unknown;
  MutationObserver?: unknown;
  ResizeObserver?: unknown;
  IntersectionObserver?: unknown;
  DOMRect?: unknown;
}

export interface IntegrationHarness {
  /** Mount a fresh EditorView with the given content + extensions.
   *  Returns the view. */
  mount(content: string, extensions: Extension[]): EditorView;
  /** The DOM element CM6 is rendering into. */
  rootEl(): HTMLElement;
  /** Drain microtasks + animation frames so deferred dispatches
   *  (per the v0.2.89 setTimeout(0) pattern) fire before the test
   *  asserts. */
  flush(): Promise<void>;
  /** Free up resources. Call in a try/finally so a failing assertion
   *  doesn't leak DOM trees. */
  destroy(): void;
}

/** Build a harness backed by happy-dom. Each call sets up its own
 *  Window so tests don't bleed state into each other. */
export function createIntegrationHarness(): IntegrationHarness {
  const win = new Window({ url: 'http://localhost/' });
  const doc = win.document;

  // happy-dom's Window exposes the DOM globals on the Window
  // instance, not the Node global. CM6 reads from `document`,
  // `window`, etc. so we splice the happy-dom globals into the
  // current realm. Save the prior values for destroy(). Skip
  // `navigator` since Node 20+ makes that a getter-only global.
  const g = globalThis as HarnessGlobals;
  const prior: HarnessGlobals = {
    window: g.window,
    document: g.document,
    Element: g.Element,
    HTMLElement: g.HTMLElement,
    Node: g.Node,
    Range: g.Range,
    getComputedStyle: g.getComputedStyle,
    MutationObserver: g.MutationObserver,
    ResizeObserver: g.ResizeObserver,
    IntersectionObserver: g.IntersectionObserver,
    DOMRect: g.DOMRect,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const winAny = win as any;
  g.window = winAny;
  g.document = winAny.document;
  g.Element = winAny.Element;
  g.HTMLElement = winAny.HTMLElement;
  g.Node = winAny.Node;
  g.Range = winAny.Range;
  g.getComputedStyle = (winAny.getComputedStyle ?? (() => ({}))) as unknown;
  g.MutationObserver = winAny.MutationObserver;
  g.ResizeObserver = winAny.ResizeObserver ?? class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  g.IntersectionObserver = winAny.IntersectionObserver ?? class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
  };
  g.DOMRect = winAny.DOMRect;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parent = doc.createElement('div') as unknown as HTMLElement;
  doc.body.appendChild(parent as unknown as Node);

  let view: EditorView | null = null;

  return {
    mount(content: string, extensions: Extension[]): EditorView {
      if (view) view.destroy();
      const state = EditorState.create({ doc: content, extensions });
      view = new EditorView({ state, parent });
      return view;
    },
    rootEl(): HTMLElement {
      return parent;
    },
    async flush(): Promise<void> {
      // setTimeout(0) drains the macrotask queue used by the
      // v0.2.89 deferred-dispatch pattern.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
    destroy(): void {
      if (view) {
        view.destroy();
        view = null;
      }
      const gNow = globalThis as HarnessGlobals;
      gNow.window = prior.window;
      gNow.document = prior.document;
      gNow.Element = prior.Element;
      gNow.HTMLElement = prior.HTMLElement;
      gNow.Node = prior.Node;
      gNow.Range = prior.Range;
      gNow.getComputedStyle = prior.getComputedStyle;
      gNow.MutationObserver = prior.MutationObserver;
      gNow.ResizeObserver = prior.ResizeObserver;
      gNow.IntersectionObserver = prior.IntersectionObserver;
      gNow.DOMRect = prior.DOMRect;
      win.close();
    },
  };
}
