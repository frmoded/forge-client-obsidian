// 2026-11-19-0925 - tests read a control's accessible NAME, not the attribute that carries it. The plugin sets no `aria-label` (Obsidian would draw a tooltip from it), so the name comes from `aria-labelledby`:
// the text of the hidden `.forge-sr-only` span(s) it points at. Order of the real accessible-name computation, reduced to what this plugin uses: aria-labelledby, then aria-label (a fallback for a foreign
// element), then the text the element shows.
export const SR_ONLY = '.forge-sr-only';

/** What the element shows to a sighted user: its text without the hidden `.forge-sr-only` spans (a hidden name is not text on the screen). */
export function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const s of Array.from(clone.querySelectorAll(SR_ONLY))) s.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function accessibleName(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
  if (ids.length) {
    const root = el.getRootNode() as ParentNode;                                          // the tree the element is in (a detached element, a stand-in view's button, names itself from its own tree)
    const byId = (id: string): Element | null => root.querySelector?.(`[id="${id}"]`) ?? el.querySelector(`[id="${id}"]`) ?? el.ownerDocument.getElementById(id);
    const names = ids.map((id) => byId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean);
    if (names.length) return names.join(' ');
  }
  const aria = el.getAttribute('aria-label'); if (aria) return aria.trim();
  const wrap = el.closest('label');                                                        // a control inside its <label> is named by the label's words (the control itself and any hidden name left out)
  if (wrap && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    const clone = wrap.cloneNode(true) as Element;
    for (const c of Array.from(clone.querySelectorAll(`input, select, textarea, option, ${SR_ONLY}`))) c.remove();
    const t = (clone.textContent ?? '').replace(/\s+/g, ' ').trim(); if (t) return t;
  }
  return visibleText(el);
}

/** Every problem with the labels under `root`: an `aria-label` (Obsidian draws a tooltip from it), a `title`, an `aria-labelledby` whose target is missing or has no text, a button with no name at all. [] when clean. */
export function auditLabels(root: Element): string[] {
  const out: string[] = []; const doc = root.ownerDocument;
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    const tag = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''}`;
    if (el.hasAttribute('aria-label')) out.push(`${tag}: has aria-label "${el.getAttribute('aria-label')}"`);
    const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    if (el.hasAttribute('aria-labelledby') && ids.length === 0) out.push(`${tag}: empty aria-labelledby`);
    for (const id of ids) { const t = doc.getElementById(id); if (!t) out.push(`${tag}: aria-labelledby="${id}" has no target`); else if (!(t.textContent ?? '').trim()) out.push(`${tag}: aria-labelledby="${id}" target has no text`); }
    if (el.tagName === 'BUTTON' && !accessibleName(el)) out.push(`${tag}: a button without an accessible name`);
  }
  return out;
}

/** The children of `el` that are part of what it draws: the hidden `.forge-sr-only` names are out of the flow and are not a box, a chip or a row of anything. */
export function shownChildren(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !c.classList.contains('forge-sr-only'));
}
