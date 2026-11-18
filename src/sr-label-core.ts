// 2026-11-19-0925 - the accessible name WITHOUT a tooltip (driver 2026-11-18: "zero tooltips, including Obsidian's own"). Obsidian draws its own tooltip from ANY element that has an `aria-label` (and from
// `setTooltip`), so this plugin never sets `aria-label`. A control's name lives in a visually hidden `<span class="forge-sr-only" id="...">text</span>` and the control points at it with `aria-labelledby`: a
// screen reader reads the name, Obsidian draws nothing. `aria-description` is not a tooltip trigger either. Plain DOM only (no obsidian import): a test builds it in happy-dom, real Chrome measures it.
//
// Where the hidden span goes: INSIDE the element (it moves with it and the parent's children stay as they were), except for an element that cannot hold children (input, select, textarea, img, ...), where it is
// the next sibling (the element must then be in its parent already, or `host` says where the span goes), and for an element whose children are rewritten by its own code (`replaceChildren`, `textContent =`),
// where the caller names a `host` that outlives the rewrite (the row or the panel). The call is idempotent: a second call with a new text only changes the text (play becomes pause), and `key` lets an element that
// is REBUILT each time (the tempo value becomes a field and back) find the span it had, so no orphan is left behind.

export const SR_ONLY_CLASS = 'forge-sr-only';

const VOID_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'BR', 'HR', 'PROGRESS', 'METER', 'SVG']);
const SPANS = new WeakMap<Element, HTMLElement>();
let seq = 0;

export interface SrLabelOptions {
  /** Where the span lives. Default: inside the element, or after it when it cannot hold children. */
  host?: Element | null;
  /** A name for the span inside its host: a rebuilt element with the same key reuses the span instead of adding another. */
  key?: string;
}

function findKeyed(host: Element, key: string): HTMLElement | undefined {
  for (const c of Array.from(host.children)) if (c.classList.contains(SR_ONLY_CLASS) && c.getAttribute('data-sr-key') === key) return c as HTMLElement;
  return undefined;
}

/** Gives `el` the accessible name `text` through a hidden span and `aria-labelledby`; removes any `aria-label`. Returns the span (to change the text later, call this again or set its textContent). */
export function setSrLabel(el: Element, text: string, opts: SrLabelOptions = {}): HTMLElement {
  const doc = el.ownerDocument;
  const isVoid = VOID_TAGS.has(el.tagName.toUpperCase());
  const host: Element | null = opts.host ?? (isVoid ? el.parentElement : el);
  let span = SPANS.get(el) ?? (opts.key && host ? findKeyed(host, opts.key) : undefined);
  if (!span) {
    span = doc.createElement('span');
    span.className = SR_ONLY_CLASS;
    span.id = `forge-sr-${++seq}`;
    if (opts.key) span.setAttribute('data-sr-key', opts.key);
  }
  if (span.textContent !== text) span.textContent = text;
  if (host && span.parentNode !== host) {
    if (isVoid && !opts.host) host.insertBefore(span, el.nextSibling); else host.appendChild(span);
  }
  SPANS.set(el, span);
  el.setAttribute('aria-labelledby', span.id);
  el.removeAttribute('aria-label');
  return span;
}

/** The element is named by text that is ALREADY on the screen (a visible heading): point `aria-labelledby` at it (giving it an id when it has none). No hidden span, no `aria-label`. */
export function labelBy(el: Element, visible: Element): void {
  if (!visible.id) visible.id = `forge-sr-${++seq}`;
  el.setAttribute('aria-labelledby', visible.id);
  el.removeAttribute('aria-label');
}

// ---- the icons Obsidian draws for the plugin (view header actions, ribbon icons) -----------------------------------------------------------------------------------------------------------------
// `view.addAction(icon, title, cb)` and `plugin.addRibbonIcon(icon, title, cb)` hand the title to Obsidian, which puts it in the icon's `aria-label` and so draws a tooltip from it. The icon is the plugin's own, so it is
// made quiet here: the same call, then the `aria-label` Obsidian wrote is taken away and the title becomes a hidden name (what a screen reader reads). Every view and the ribbon go through these two.
export interface ActionHost { addAction(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement }
export interface RibbonHost { addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement }

/** Names an element Obsidian made (an action, a ribbon icon) by a hidden span instead of the `aria-label` Obsidian wrote. Returns the element. */
export function quietName<T extends HTMLElement>(el: T, title: string): T {
  if (!el || typeof el.setAttribute !== 'function') return el;      // a host that hands back no element (a test stand-in for the view base) has nothing to decorate
  el.removeAttribute('aria-label');
  setSrLabel(el, title);
  return el;
}
export function addQuietAction(host: ActionHost, icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
  return quietName(host.addAction(icon, title, callback), title);
}
export function addQuietRibbonIcon(host: RibbonHost, icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
  return quietName(host.addRibbonIcon(icon, title, callback), title);
}
