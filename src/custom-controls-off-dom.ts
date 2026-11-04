// 2026-11-03-1160 (c) - the controls of a CUSTOM note are off, said the same way on every tab (plain DOM, no obsidian import): every button, input, select and textarea under `root` is disabled and carries the tooltip
// `Custom Python: the controls are off for this note.` (the banner's own sentence, CUSTOM_BANNER), and the root says it too (`aria-disabled`, the tooltip). Switched back on, ONLY what this helper switched off comes back (a control
// a tab itself keeps disabled stays so) and the tooltips it set are taken away. Idempotent: call it after every redraw of the controls, with the note's current answer.
import { CUSTOM_BANNER } from './phrase-notes-core.ts';

export const CUSTOM_OFF_ATTR = 'data-custom-off';
const CONTROLS = 'button, input, select, textarea';

export function setControlsOff(root: HTMLElement, off: boolean): void {
  const controls = Array.from(root.querySelectorAll<HTMLElement>(CONTROLS));
  if (off) {
    root.setAttribute('aria-disabled', 'true');
    root.setAttribute('title', CUSTOM_BANNER);
    for (const c of controls) {
      const el = c as HTMLButtonElement;
      if (!el.disabled) { el.disabled = true; el.setAttribute(CUSTOM_OFF_ATTR, ''); }
      el.setAttribute('title', CUSTOM_BANNER);
    }
    return;
  }
  if (root.getAttribute('title') === CUSTOM_BANNER) root.removeAttribute('title');
  root.removeAttribute('aria-disabled');
  for (const c of controls) {
    const el = c as HTMLButtonElement;
    if (el.hasAttribute(CUSTOM_OFF_ATTR)) { el.disabled = false; el.removeAttribute(CUSTOM_OFF_ATTR); }
    if (el.getAttribute('title') === CUSTOM_BANNER) el.removeAttribute('title');
  }
}
