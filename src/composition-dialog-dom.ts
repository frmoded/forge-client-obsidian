// 2026-10-31-1100 (M17b, item 3) - the dialog of "New composition" (plain DOM, no obsidian import): a name (optional), one row per section - the note it plays (a phrase, an arrangement or a composition of the vault), how many bars it is to
// fill (optional: empty is all of its bars, once), how many more times to play it (optional) - with Move up / Move down / Remove per row and "Add section", and whether this is the root of the piece. Create hands the choice to the flow; a refusal
// comes back as one sentence and is shown; success closes the dialog.
import type { NewCompositionChoice, NewCompositionResult } from './composition-flow-core.ts';
import type { CompositionSection } from './composition-core.ts';

export interface CompositionDialogPorts {
  /** The notes of the vault right now that a section may play, as note ids (`phrases/phrase_003`, `arrangements/arr_001`, `compositions/intro`), in a stable order. */
  phrases: readonly string[];
  arrangements: readonly string[];
  compositions: readonly string[];
  /** Is there already a root among the compositions? The root box starts ticked only when there is not. */
  hasRoot: boolean;
  create(choice: NewCompositionChoice): Promise<NewCompositionResult>;
  close(): void;
}

export function mountCompositionDialog(parent: HTMLElement, ports: CompositionDialogPorts): { dispose(): void } {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', 'forge-comp-dialog');
  root.appendChild(el('h3', '', 'New composition'));
  root.appendChild(el('p', 'forge-comp-hint', 'A composition is a piece made of sections played one after another. Each section plays a phrase, an arrangement or another composition; give it a number of bars to repeat or cut it to that length, or leave the bars empty to play all of it once.'));
  const nameLabel = el('label', 'forge-comp-name-label', 'Name (optional) ');
  const name = el('input', 'forge-comp-name'); name.type = 'text'; name.placeholder = 'comp_001'; name.setAttribute('aria-label', 'Name');
  nameLabel.appendChild(name);
  const rows = el('div', 'forge-comp-sections');
  const message = el('div', 'forge-comp-message'); message.setAttribute('role', 'status');
  const add = el('button', 'forge-comp-add', 'Add section'); add.type = 'button';
  const rootLabel = el('label', 'forge-comp-root-label');
  const rootBox = el('input', 'forge-comp-root'); rootBox.type = 'checkbox'; rootBox.checked = !ports.hasRoot;
  rootLabel.append(rootBox, doc.createTextNode(' This is the root of the piece'));
  const create = el('button', 'forge-comp-create', 'Create'); create.type = 'button';
  const cancel = el('button', 'forge-comp-cancel', 'Cancel'); cancel.type = 'button';

  const groups: Array<[string, readonly string[]]> = [['Phrases', ports.phrases], ['Arrangements', ports.arrangements], ['Compositions', ports.compositions]];
  const fill = (select: HTMLSelectElement, chosen: string): void => {
    select.textContent = '';
    for (const [label, ids] of groups) {
      if (ids.length === 0) continue;
      const g = el('optgroup', ''); g.label = label;
      for (const id of ids) { const o = el('option', '', id.split('/').pop() ?? id); o.value = id; g.appendChild(o); }
      select.appendChild(g);
    }
    if ([...select.querySelectorAll('option')].some((o) => (o as HTMLOptionElement).value === chosen)) select.value = chosen;
  };
  const rowEls = (): HTMLElement[] => [...rows.children] as HTMLElement[];
  const refit = (): void => {
    const all = rowEls();
    all.forEach((row, i) => {
      (row.querySelector('.forge-comp-up') as HTMLButtonElement).disabled = i === 0;
      (row.querySelector('.forge-comp-down') as HTMLButtonElement).disabled = i === all.length - 1;
      (row.querySelector('.forge-comp-remove') as HTMLButtonElement).hidden = all.length === 1;
      (row.querySelector('.forge-comp-lead') as HTMLElement).textContent = i === 0 ? 'Play ' : 'Then play ';
    });
  };
  const num = (input: HTMLInputElement, what: string, minimum: number): number | undefined | string => {
    const t = input.value.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isInteger(n) && n >= minimum ? n : `${what} must be a whole number, ${minimum} or more.`;
  };
  const addRow = (source = ''): void => {
    const row = el('div', 'forge-comp-section');
    const lead = el('span', 'forge-comp-lead', 'Play ');
    const note = el('select', 'forge-comp-note'); note.setAttribute('aria-label', 'Note to play');
    fill(note, source);
    const length = el('input', 'forge-comp-length'); length.type = 'number'; length.min = '1'; length.placeholder = 'all'; length.setAttribute('aria-label', 'Bars (empty is all of it)');
    const repeat = el('input', 'forge-comp-repeat'); repeat.type = 'number'; repeat.min = '1'; repeat.placeholder = '0'; repeat.setAttribute('aria-label', 'More times');
    const up = el('button', 'forge-comp-up', '↑'); up.type = 'button'; up.setAttribute('aria-label', 'Move up');
    const down = el('button', 'forge-comp-down', '↓'); down.type = 'button'; down.setAttribute('aria-label', 'Move down');
    const remove = el('button', 'forge-comp-remove', 'Remove'); remove.type = 'button';
    up.addEventListener('click', () => { const prev = row.previousElementSibling; if (prev) rows.insertBefore(row, prev); refit(); });
    down.addEventListener('click', () => { const next = row.nextElementSibling; if (next) rows.insertBefore(next, row); refit(); });
    remove.addEventListener('click', () => { row.remove(); refit(); });
    row.append(lead, note, el('span', 'forge-comp-label', ' for '), length, el('span', 'forge-comp-label', ' bars, then '), repeat, el('span', 'forge-comp-label', ' more times '), up, down, remove);
    rows.appendChild(row);
    refit();
  };
  add.addEventListener('click', () => addRow());

  let pending = false;
  create.addEventListener('click', () => {
    if (pending) return;
    message.textContent = '';
    const sections: CompositionSection[] = [];
    for (const [i, row] of rowEls().entries()) {
      const source = (row.querySelector('.forge-comp-note') as HTMLSelectElement).value;
      const length = num(row.querySelector('.forge-comp-length') as HTMLInputElement, `Section ${i + 1}: the bars`, 1);
      const repeat = num(row.querySelector('.forge-comp-repeat') as HTMLInputElement, `Section ${i + 1}: the number of more times`, 1);
      if (typeof length === 'string') { message.textContent = length; return; }
      if (typeof repeat === 'string') { message.textContent = repeat; return; }
      sections.push({ source, ...(length !== undefined ? { length } : {}), ...(repeat !== undefined ? { repeat } : {}) });
    }
    pending = true; create.disabled = true;
    void ports.create({ name: name.value.trim(), sections, root: rootBox.checked })
      .then((r) => { if (r.ok === false) message.textContent = r.message; else ports.close(); })
      .catch((e) => { message.textContent = `New composition failed: ${(e as Error)?.message ?? e}`; })
      .finally(() => { pending = false; create.disabled = false; });
  });
  cancel.addEventListener('click', () => { ports.close(); });

  root.append(nameLabel, rows, add, rootLabel, message);
  const buttons = el('div', 'forge-comp-buttons'); buttons.append(create, cancel);
  root.appendChild(buttons);
  parent.appendChild(root);
  addRow();
  return { dispose() { root.remove(); } };
}
