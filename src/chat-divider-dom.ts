// 2026-11-18 (0935) - the draggable divider between the dialog (left) and the Score (right) of a music tab in the TWO-COLUMN layout (900 px of the tab and up). A thin vertical handle (about 6 px of hit area, straddling the column border)
// in the dialog's panel; it exists ONLY while the tab is wide (the stacked layout has no handle, no CSS variable and no style attribute, and restores them when the tab is wide again). The left column's width is the CSS variable
// `--forge-chat-left` on the tab (a percentage, read by styles.css); a drag sets it LIVE and stores the ratio ONCE, on release; the Score re-engraves ONCE after the drag (live-score-dom's own debounced relayout waits while the tab
// carries `forge-chat-dragging`), never on every move. Pointer events with pointer capture; keyboard: Left/Right 2 points, Home resets; double-click resets. Limits in pixels live in chat-layout-core.ts. Plain DOM, no obsidian import.
import { clampRatio, ratioFromDrag, ratioRange, resetRatio, stepRatio } from './chat-layout-core.ts';
import { setSrLabel } from './sr-label-core.ts';

export const RESIZER_CLASS = 'forge-chat-resizer';
export const DRAGGING_CLASS = 'forge-chat-dragging';
const VAR = '--forge-chat-left';

export interface DividerStore { ratio(): number; setRatio(r: number): void }
export interface DividerHandle {
  /** The tab's layout or width changed: add / remove the handle, set / clear the variable, re-clamp the shown ratio (the stored one is untouched). */
  sync(wide: boolean, width: number): void;
  el(): HTMLElement | null;
  dispose(): void;
}

export function mountDivider(host: HTMLElement, panel: HTMLElement, store: DividerStore): DividerHandle {
  const doc = host.ownerDocument;
  let handle: HTMLElement | null = null, wide = false, width = 0;
  let drag: { id: number; x0: number; r0: number; live: number } | null = null;
  const shown = (): number => (drag ? drag.live : clampRatio(store.ratio(), width));
  const paint = (): void => {
    if (!handle) return;
    const r = shown(), { min, max } = ratioRange(width), vmin = Math.ceil(min * 100 - 1e-9), vmax = Math.floor(max * 100 + 1e-9);
    host.style.setProperty(VAR, `${Math.round(r * 1e6) / 1e4}%`);
    handle.setAttribute('aria-valuenow', String(Math.min(Math.max(vmin, vmax), Math.max(vmin, Math.round(r * 100)))));
    handle.setAttribute('aria-valuemin', String(vmin)); handle.setAttribute('aria-valuemax', String(Math.max(vmin, vmax)));
  };
  const commit = (r: number): void => { if (Math.abs(r - store.ratio()) > 1e-9) store.setRatio(r); };
  const endDrag = (keep: boolean): void => {
    const d = drag; if (!d) return;
    if (keep) commit(d.live);
    drag = null; host.classList.remove(DRAGGING_CLASS);
    try { handle?.releasePointerCapture?.(d.id); } catch { /* capture already gone */ }
    paint();
  };
  const make = (): HTMLElement => {
    const el = doc.createElement('div'); el.className = RESIZER_CLASS; el.setAttribute('role', 'separator'); el.setAttribute('aria-orientation', 'vertical'); el.setAttribute('tabindex', '0');
    setSrLabel(el, 'Resize the dialog and the Score');
    el.addEventListener('pointerdown', (e) => {
      const p = e as PointerEvent; if (p.button !== 0 || drag) return;
      p.preventDefault(); try { el.setPointerCapture?.(p.pointerId); } catch { /* a pointer that is gone */ }
      drag = { id: p.pointerId, x0: p.clientX, r0: shown(), live: shown() }; host.classList.add(DRAGGING_CLASS);
    });
    el.addEventListener('pointermove', (e) => { const p = e as PointerEvent; if (!drag || p.pointerId !== drag.id) return; drag.live = ratioFromDrag(drag.r0, p.clientX - drag.x0, width); paint(); });
    el.addEventListener('pointerup', (e) => { if (drag && (e as PointerEvent).pointerId === drag.id) endDrag(true); });
    el.addEventListener('pointercancel', (e) => { if (drag && (e as PointerEvent).pointerId === drag.id) endDrag(false); });
    el.addEventListener('dblclick', () => { endDrag(false); store.setRatio(resetRatio()); paint(); });
    el.addEventListener('keydown', (e) => {
      const k = e as KeyboardEvent; if (k.altKey || k.ctrlKey || k.metaKey || k.shiftKey) return;
      const next = k.key === 'ArrowLeft' ? stepRatio(store.ratio(), -1, width) : k.key === 'ArrowRight' ? stepRatio(store.ratio(), 1, width) : k.key === 'Home' ? resetRatio() : null;
      if (next === null) return;
      k.preventDefault(); k.stopPropagation(); store.setRatio(next); paint();
    });
    return el;
  };
  return {
    sync(isWide, w) {
      wide = isWide; if (w > 0) width = w;
      if (wide && !handle) { handle = make(); panel.prepend(handle); }                                       // first child: the card's own "stay last" observer never sees it move
      if (!wide && handle) { endDrag(false); handle.remove(); handle = null; host.style.removeProperty(VAR); if (!host.getAttribute('style')) host.removeAttribute('style'); }
      if (wide) paint();
    },
    el: () => handle,
    dispose() { endDrag(false); handle?.remove(); handle = null; host.style.removeProperty(VAR); if (!host.getAttribute('style')) host.removeAttribute('style'); host.classList.remove(DRAGGING_CLASS); },
  };
}
