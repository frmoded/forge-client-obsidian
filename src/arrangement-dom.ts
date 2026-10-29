// score_first M10 slice 1 (drain 2026-10-29-0820) - the dialog of "New arrangement" (plain DOM, no obsidian import): one row per track, each a kit and a phrase from the vault's own lists; a kit plays one phrase, so a row's kit list holds only
// the kits the other rows do not use and "Add track" goes when every kit is in use. Create hands the rows to the flow; a refusal comes back as one sentence and is shown; success closes the dialog.
import type { CreateResult } from './kit-arrangement-flow-core.ts';
import type { ArrangementTrack } from './arrangement-core.ts';

export interface ArrangementDialogPorts {
  /** The kit and phrase names of the vault right now, in a stable order. */
  kits: readonly string[];
  phrases: readonly string[];
  create(tracks: ArrangementTrack[]): Promise<CreateResult>;
  close(): void;
}

export function mountArrangementDialog(parent: HTMLElement, ports: ArrangementDialogPorts): { dispose(): void } {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', 'forge-arr-dialog');
  root.appendChild(el('h3', '', 'New arrangement'));
  root.appendChild(el('p', 'forge-arr-hint', 'Pick a kit and a phrase for each track. The phrases play together, each on its kit.'));
  const rows = el('div', 'forge-arr-tracks');
  const message = el('div', 'forge-arr-message'); message.setAttribute('role', 'status');
  const add = el('button', 'forge-arr-add', 'Add track'); add.type = 'button';
  const create = el('button', 'forge-arr-create', 'Create'); create.type = 'button';
  const cancel = el('button', 'forge-arr-cancel', 'Cancel'); cancel.type = 'button';

  const options = (select: HTMLSelectElement, names: readonly string[], chosen: string): void => {
    select.textContent = '';
    for (const n of names) { const o = el('option', '', n); o.value = n; select.appendChild(o); }
    if (names.includes(chosen)) select.value = chosen;
  };
  const rowEls = (): Array<{ row: HTMLElement; kit: HTMLSelectElement; phrase: HTMLSelectElement }> =>
    [...rows.children].map((row) => ({ row: row as HTMLElement, kit: row.querySelector('.forge-arr-kit') as HTMLSelectElement, phrase: row.querySelector('.forge-arr-phrase') as HTMLSelectElement }));
  /** Every row's kit list is the kits not taken by another row (its own choice stays in it); "Add track" and "Remove" follow. */
  const refit = (): void => {
    const all = rowEls();
    for (const r of all) {
      const mine = r.kit.value;
      const others = new Set(all.filter((o) => o !== r).map((o) => o.kit.value));
      options(r.kit, ports.kits.filter((k) => k === mine || !others.has(k)), mine);
    }
    add.disabled = all.length >= ports.kits.length;
    for (const r of all) (r.row.querySelector('.forge-arr-remove') as HTMLButtonElement).hidden = all.length === 1;
  };
  const addRow = (): void => {
    const used = new Set(rowEls().map((r) => r.kit.value));
    const row = el('div', 'forge-arr-track');
    const kit = el('select', 'forge-arr-kit'); kit.setAttribute('aria-label', 'Kit');
    const phrase = el('select', 'forge-arr-phrase'); phrase.setAttribute('aria-label', 'Phrase');
    options(kit, ports.kits.filter((k) => !used.has(k)), '');
    options(phrase, ports.phrases, '');
    const remove = el('button', 'forge-arr-remove', 'Remove'); remove.type = 'button';
    remove.addEventListener('click', () => { row.remove(); refit(); });
    kit.addEventListener('change', refit);
    row.appendChild(el('span', 'forge-arr-label', 'Play ')); row.appendChild(phrase); row.appendChild(el('span', 'forge-arr-label', ' on the ')); row.appendChild(kit); row.appendChild(el('span', 'forge-arr-label', ' kit ')); row.appendChild(remove);
    rows.appendChild(row);
    refit();
  };
  add.addEventListener('click', addRow);

  let pending = false;
  create.addEventListener('click', () => {
    if (pending) return;
    pending = true; create.disabled = true; message.textContent = '';
    const tracks = rowEls().map((r) => ({ kit: r.kit.value, phrase: r.phrase.value }));
    void ports.create(tracks).then((r) => { if (r.ok === false) message.textContent = r.message; else ports.close(); })
      .catch((e) => { message.textContent = `New arrangement failed: ${(e as Error)?.message ?? e}`; })
      .finally(() => { pending = false; create.disabled = false; });
  });
  cancel.addEventListener('click', () => { ports.close(); });

  root.appendChild(rows); root.appendChild(add); root.appendChild(message);
  const buttons = el('div', 'forge-arr-buttons'); buttons.appendChild(create); buttons.appendChild(cancel);
  root.appendChild(buttons);
  parent.appendChild(root);
  addRow();
  return { dispose() { root.remove(); } };
}
