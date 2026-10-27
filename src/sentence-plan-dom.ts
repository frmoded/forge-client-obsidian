// 2026-10-27-1015 — the dialog of "New phrase from a sentence": plain DOM, no obsidian import (a happy-dom test drives it; sentence-plan-modal.ts puts it in an Obsidian Modal). It tells the planner (sentence-plan-core.ts) what the person
// typed and pressed and shows what comes back: a preview (Description, Recipe, the file Create would make) or one sentence saying why not. A plan belongs to the sentence it was made for: editing the sentence withdraws it.
import { SENTENCE_MAX, type SentencePlanner } from './sentence-plan-core.ts';

export interface SentencePlanDomPorts {
  planner: SentencePlanner;
  /** The names the person can use in the sentence (the vault's bars). */
  barNames: readonly string[];
  /** Close the dialog (after a successful Create, or Cancel). */
  close(): void;
}

const NAMES_SHOWN = 12;

export function mountSentencePlan(parent: HTMLElement, ports: SentencePlanDomPorts): { dispose(): void } {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e;
  };
  const root = el('div', 'forge-sentence-plan');
  root.appendChild(el('h3', 'forge-sentence-plan-title', 'New phrase from a sentence'));

  const input = el('textarea', 'forge-sentence-plan-input');
  input.maxLength = SENTENCE_MAX;
  input.rows = 3;
  input.setAttribute('placeholder', 'for example: extend bar_005 to 8 bars');
  input.setAttribute('aria-label', 'Describe the phrase in one sentence');
  root.appendChild(input);

  const shown = ports.barNames.slice(0, NAMES_SHOWN);
  const more = ports.barNames.length - shown.length;
  root.appendChild(el('p', 'forge-sentence-plan-bars', ports.barNames.length === 0
    ? 'This vault has no bars yet. Make a bar in the Beat Box first.'
    : `Bars you can name: ${shown.join(', ')}${more > 0 ? ` (and ${more} more)` : ''}`));

  const message = el('div', 'forge-sentence-plan-message');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  root.appendChild(message);

  const preview = el('div', 'forge-sentence-plan-preview');
  preview.style.display = 'none';
  const description = el('p', 'forge-sentence-plan-description');
  const recipe = el('p', 'forge-sentence-plan-recipe');
  const path = el('p', 'forge-sentence-plan-path');
  preview.append(el('h4', 'forge-sentence-plan-heading', 'Description'), description, el('h4', 'forge-sentence-plan-heading', 'Recipe'), recipe, path);
  root.appendChild(preview);

  const buttons = el('div', 'forge-sentence-plan-buttons');
  const planBtn = el('button', 'forge-sentence-plan-plan', 'Plan'); planBtn.type = 'button';
  const createBtn = el('button', 'forge-sentence-plan-create', 'Create'); createBtn.type = 'button'; createBtn.disabled = true;
  const cancelBtn = el('button', 'forge-sentence-plan-cancel', 'Cancel'); cancelBtn.type = 'button';
  buttons.append(planBtn, createBtn, cancelBtn);
  root.appendChild(buttons);
  parent.appendChild(root);

  let busy = false;
  let planned = false;        // a plan is on screen and the sentence has not changed since
  let epoch = 0;              // bumped by every edit: an answer for an older sentence is not offered

  const say = (text: string, kind: 'status' | 'alert' = 'status') => { message.textContent = text; message.setAttribute('role', kind); };
  const hidePreview = () => { preview.style.display = 'none'; planned = false; };
  const sync = () => { planBtn.disabled = busy; createBtn.disabled = busy || !planned; };

  input.addEventListener('input', () => { epoch++; hidePreview(); say(''); sync(); });

  const plan = async () => {
    if (busy) return;
    const mine = epoch;
    busy = true; hidePreview(); say('Asking the planner...'); sync();
    let view;
    try { view = await ports.planner.plan(input.value); } finally { busy = false; }
    if (mine !== epoch) { say(''); sync(); return; }
    if (view.ok === false) { say(view.message, 'alert'); sync(); return; }
    description.textContent = view.description;
    recipe.textContent = view.recipe;
    path.textContent = `Create will make ${view.path} (a ${view.kind}).`;
    preview.style.display = '';
    planned = true; say(''); sync();
  };
  planBtn.addEventListener('click', () => { void plan(); });
  input.addEventListener('keydown', (e) => { const k = e as KeyboardEvent; if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) { k.preventDefault(); void plan(); } });

  createBtn.addEventListener('click', () => {
    if (busy || !planned) return;
    busy = true; sync();
    void ports.planner.create().then((res) => {
      busy = false;
      if (res.ok !== false) { ports.close(); return; }
      say(res.message, 'alert'); sync();
    }, (e) => { busy = false; say(`Could not make the phrase: ${(e as Error)?.message ?? e}`, 'alert'); sync(); });
  });
  cancelBtn.addEventListener('click', () => { ports.close(); });

  return { dispose() { root.remove(); } };
}
