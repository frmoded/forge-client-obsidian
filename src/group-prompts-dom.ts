// 2026-11-27-1050 (prompt stack stage 2) - the small `Prompts` block of the composer panel, above the composer card: one row per group (its number, the words, how many lines) and `Pop to here`. Read only otherwise. Absent while there is no group,
// so a note without a stack looks as it always did. Plain DOM, no obsidian import.
import { labelBy } from './sr-label-core.ts';
import type { Group } from './group-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_GROUP_PROMPTS_DOM = 'forge-list-model-core:group-prompts-dom';

export const PROMPTS_CLASS = 'forge-prompts';

/** Draw the block (or take it away) in `panel`, before `card`. `popHere(n)` is what row n's button does; the top row's button is off (there is nothing above it). */
export function drawPrompts(panel: HTMLElement, card: HTMLElement, groups: readonly Group[], popHere: (n: number) => void): void {
  const doc = panel.ownerDocument;
  let el = Array.from(panel.children).find((c) => c.classList.contains(PROMPTS_CLASS)) as HTMLElement | undefined;
  if (groups.length === 0) { el?.remove(); return; }
  const key = JSON.stringify(groups.map((g) => [g.p, g.n]));
  if (el?.getAttribute('data-rows') === key) return;          // drawn already (the dialog redraws often; a selection or the focus in the block stays)
  if (el === undefined) { el = doc.createElement('div'); el.className = PROMPTS_CLASS; el.setAttribute('role', 'group'); panel.insertBefore(el, card); }
  el.textContent = ''; el.setAttribute('data-rows', key);
  const span = (name: string, text: string): HTMLElement => { const s = doc.createElement('span'); s.className = `forge-prompts-${name}`; s.textContent = text; return s; };
  const title = doc.createElement('div'); title.className = 'forge-prompts-title'; title.textContent = 'Prompts'; el.appendChild(title);
  labelBy(el, title);
  groups.forEach((g, i) => {
    const row = doc.createElement('div'); row.className = 'forge-prompts-row';
    const pop = doc.createElement('button'); pop.type = 'button'; pop.className = 'forge-prompts-pop'; pop.textContent = 'Pop to here'; pop.disabled = i === groups.length - 1;
    pop.addEventListener('click', () => { popHere(i + 1); });
    row.append(span('n', String(i + 1)), span('words', g.p === '' ? '(no words)' : g.p), span('count', `${g.n} line${g.n === 1 ? '' : 's'}`), pop);
    el!.appendChild(row);
  });
}
