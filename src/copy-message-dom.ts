// 2026-11-03-1155-9 (PRIORITY, driver: "make all the text tags selectable and copyable so I can copy them to you") - the ONE helper every error or refusal sentence the plugin draws goes through: its text is set here and a small **Copy** button sits
// beside it (a sibling, never inside: a triple-click on the message selects exactly the message, because the button is `user-select: none`). Click puts the message text on the clipboard (`navigator.clipboard.writeText`, the plugin's own pattern in forge-action.ts,
// with the textarea + execCommand road for a host that refuses the first) and the button says `Copied` for a moment. Plain DOM, no `obsidian` import: a happy-dom test mounts the very code the panes run.
export const COPY_CLASS = 'forge-copy-button';
export const COPY_LABEL = 'Copy';
export const COPIED_LABEL = 'Copied';
export const COPY_FAILED_LABEL = 'Copy failed';
export const COPIED_MS = 1500;

export interface CopyPorts {
  /** Put `text` on the clipboard; true = it is there. Never throws. */
  write(text: string): Promise<boolean>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/** The host's own clipboard: the async API, then a hidden textarea and `execCommand('copy')` (a host without the first, or one that refuses it outside a secure context). */
export function defaultCopyPorts(doc: Document = document): CopyPorts {
  return {
    async write(text) {
      try { const nav = (doc.defaultView ?? window).navigator; if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(text); return true; } } catch { /* refused: the road below */ }
      try {
        const ta = doc.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        doc.body.appendChild(ta); ta.select();
        const ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
        ta.remove();
        return ok === true;
      } catch { return false; }
    },
    setTimer: (fn, ms) => (doc.defaultView ?? window).setTimeout(fn, ms),
    clearTimer: (h) => (doc.defaultView ?? window).clearTimeout(h as number),
  };
}

let override: CopyPorts | null = null;
/** For tests: every helper below uses these ports until `null` puts the host's back. */
export function setCopyPortsForTest(ports: CopyPorts | null): void { override = ports; }
const portsFor = (doc: Document): CopyPorts => override ?? defaultCopyPorts(doc);

/** A Copy button that copies `text()` as it is at the click. */
export function mountCopyButton(doc: Document, text: () => string): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button'; b.className = COPY_CLASS; b.textContent = COPY_LABEL;
  b.setAttribute('title', 'Copy this message to the clipboard'); b.setAttribute('aria-label', 'Copy this message');
  let timer: unknown = null;
  b.addEventListener('click', () => {
    const ports = portsFor(doc);
    void ports.write(text()).then((ok) => {
      b.textContent = ok ? COPIED_LABEL : COPY_FAILED_LABEL;
      if (timer !== null) ports.clearTimer(timer);
      timer = ports.setTimer(() => { b.textContent = COPY_LABEL; timer = null; }, COPIED_MS);
    });
  });
  return b;
}

/** Set the text of a message element and keep ITS Copy button beside it: there while the message says something, gone when it is empty. The button copies what the element holds at the click. */
export function copyableMessage(el: HTMLElement, text: string): void {
  el.textContent = text;
  const parent = el.parentNode;
  const next = el.nextSibling as HTMLElement | null;
  const mine = next !== null && next.nodeType === 1 && next.classList.contains(COPY_CLASS) ? next : null;
  if (text === '') { mine?.remove(); return; }
  if (mine !== null || parent === null) return;
  parent.insertBefore(mountCopyButton(el.ownerDocument, () => el.textContent ?? ''), el.nextSibling);
}
