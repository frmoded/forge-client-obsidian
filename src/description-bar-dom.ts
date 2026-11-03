// 2026-10-31-1140 (M16a): the same strip says what became of a hand-edited RECIPE (the line and the column, Revert) and, for a note whose Description AND Recipe were both edited, offers the two buttons Update from Description / Update from Recipe.
// 2026-10-31-1120 (M15c) - the strip that says what became of a hand-edited Description, drawn at the top of every pane that shows the note (the phrase / arrangement / composition tab, the notes pane, the text view): one sentence and
// the buttons that answer it. Plain DOM, no obsidian import (a happy-dom test mounts the very code the tab runs).
//
//   <div class="forge-description-bar" role="status">
//     <span class="forge-description-message">Description, line 1, column 28: expected "bars" ...</span>
//     <button class="forge-description-button" data-action="revert">Revert</button> ...
//     <div class="forge-description-preview"><pre class="forge-description-preview-description">...</pre><pre class="forge-description-preview-recipe">...</pre></div>     (only for the service's suggestion)
//   </div>

export type BarAction = 'update' | 'update-recipe' | 'update-python' | 'revert' | 'revert-generated' | 'ask' | 'apply-preview' | 'cancel-preview';
export const BAR_LABELS: Record<BarAction, string> = { update: 'Update from Description', 'update-recipe': 'Update from Recipe', 'update-python': 'Update from Python', revert: 'Revert', 'revert-generated': 'Revert to generated', ask: 'Ask the sentence service', 'apply-preview': 'Apply', 'cancel-preview': 'Cancel' };

export interface BarView {
  message: string;
  actions: BarAction[];
  preview?: { description: string; recipe: string };
  busy?: boolean;
  /** `custom`: the banner of a custom note (its own look: the controls are off for the note). */
  tone?: 'custom';
}
export interface BarHandle { readonly el: HTMLElement; show(view: BarView): void; dispose(): void }

export function mountDescriptionBar(parent: HTMLElement, onAction: (a: BarAction) => void): BarHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'forge-description-bar';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  parent.insertBefore(el, parent.firstChild);
  const handle: BarHandle = {
    el,
    show(view) {
      el.textContent = '';
      el.classList.toggle('is-custom', view.tone === 'custom');
      const message = doc.createElement('span'); message.className = 'forge-description-message'; message.textContent = view.message; el.appendChild(message);
      if (view.preview) {
        const box = doc.createElement('div'); box.className = 'forge-description-preview';
        const d = doc.createElement('pre'); d.className = 'forge-description-preview-description'; d.textContent = view.preview.description;
        const r = doc.createElement('pre'); r.className = 'forge-description-preview-recipe'; r.textContent = view.preview.recipe;
        box.append(d, r); el.appendChild(box);
      }
      const row = doc.createElement('span'); row.className = 'forge-description-buttons';
      for (const a of view.actions) {
        const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-description-button'; b.setAttribute('data-action', a); b.textContent = BAR_LABELS[a]; b.disabled = view.busy === true;
        b.addEventListener('click', () => { if (!b.disabled) onAction(a); });
        row.appendChild(b);
      }
      el.appendChild(row);
      el.setAttribute('aria-busy', view.busy === true ? 'true' : 'false');
    },
    dispose() { el.remove(); },
  };
  return handle;
}
