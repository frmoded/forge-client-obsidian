// 2026-10-27-1030 (M14 slice 1) - the notebook area below the Score: plain DOM, no obsidian import (a happy-dom test mounts the very thing). The UI contract is mockups/m11-notebook-below-the-score.html: bars you click (Shift extends),
// a row picker, the selection ALWAYS shown as chips, an op with its one number, Run; and below, the cells, each showing exactly what it received, its Recipe, Re-run and Delete cell. 2026-10-27-0720 (slice 2): the request box works:
// type what should happen ("make this half as busy, keep the downbeat") and press Run (or Enter) and the sentence, not the op picker, makes the cell; the picker is dimmed while a sentence is typed, so it is plain which one Run will use.
// The area sits OUTSIDE the Score's inspector root, so a click here is never a pin gesture (the 1800 rule is kept by where this is mounted, and tested in phrase-notebook-wiring.test.ts).
import { extendSelection, selectionChip, toggleBar, withRow, type Notebook, type NotebookCell, type Selection } from './notebook-core.ts';
import { transformOpWords } from './phrase-words-core.ts';

export interface NotebookDomPorts {
  notebook: Notebook;
  trace(line: string): void;
  /** Open a phrase note (a cell's result, or its source from the result's tab). */
  openPhrase?(path: string): void;
}

export interface NotebookHandle {
  /** The Score on screen changed: how many bars it has and the rows (channel names) its bars have. */
  setScore(score: { count: number; rows: readonly string[] }): void;
  /** Read the cells again (after Run, Re-run, Delete cell, or a change in notebook/). */
  refresh(): Promise<void>;
  dispose(): void;
}

const REQUEST_PLACEHOLDER = 'or say it: make this half as busy, keep the downbeat';
const REQUEST_LABEL = 'What to do with the selected bars, in a sentence';
const DERIVED_REASON = 'This phrase was made by a transform: open its source phrase to ask for another change.';   // 2026-10-29-0900 (a)
const HINT = 'No selection yet: click bars above. The selection is always shown as chips; a cell shows the exact references it received.';

export function mountNotebook(parent: HTMLElement, ports: NotebookDomPorts): NotebookHandle {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e;
  };
  const root = el('details', 'forge-notebook');
  root.open = true;
  root.appendChild(el('summary', 'forge-notebook-summary', 'Notebook'));

  const cellsEl = el('div', 'forge-notebook-cells');
  const barsEl = el('div', 'forge-notebook-bars'); barsEl.setAttribute('role', 'group'); barsEl.setAttribute('aria-label', 'Bars');
  const rowsEl = el('div', 'forge-notebook-rows'); rowsEl.setAttribute('role', 'group'); rowsEl.setAttribute('aria-label', 'Row');
  const chipsEl = el('div', 'forge-notebook-chips'); chipsEl.style.minHeight = '1.8em';   // 2026-10-29-0900 (f): the line is there before the first chip, so choosing a bar moves nothing
  const doEl = el('div', 'forge-notebook-do');
  const op = el('select', 'forge-notebook-op'); op.setAttribute('aria-label', 'What to do with the selection');
  for (const [value, text] of [['thin_out', 'Thin out'], ['double_up', 'Double up']] as const) { const o = doc.createElement('option'); o.value = value; o.textContent = text; op.appendChild(o); }
  const numberLabel = el('label', 'forge-notebook-number-label');
  const number = el('input', 'forge-notebook-number'); number.type = 'number';
  const run = el('button', 'forge-notebook-run', 'Run'); run.type = 'button'; run.disabled = true;
  doEl.append(op, numberLabel, number, run);
  const request = el('input', 'forge-notebook-request');
  request.setAttribute('placeholder', REQUEST_PLACEHOLDER); request.setAttribute('aria-label', REQUEST_LABEL); request.setAttribute('autocomplete', 'off');   // a remembered value must not look like a typed sentence (smoke 8)
  const hint = el('p', 'forge-notebook-hint', HINT);
  const message = el('div', 'forge-notebook-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  root.append(cellsEl, barsEl, rowsEl, chipsEl, doEl, request, hint, message);
  parent.appendChild(root);

  let selection: Selection = { bars: [], row: null };
  let anchor: number | null = null;
  let score = { count: 0, rows: [] as readonly string[] };
  let busy = false;
  let lastChip: string | null = null;
  let disposed = false;
  let derived = false;                  // this phrase is the RESULT of a cell: it is not asked for another change (the request box says why)
  let madeId: string | null = null;     // the cell the status line last announced as made; the status goes when the cell does

  const say = (text: string, kind: 'status' | 'alert' = 'status') => { message.textContent = text; message.setAttribute('role', kind); };
  const setNumberFor = (kind: string) => {
    if (kind === 'double_up') {
      numberLabel.textContent = 'Grid'; number.value = '16'; number.setAttribute('min', '1'); number.removeAttribute('max'); number.setAttribute('step', '1');
    } else {
      numberLabel.textContent = 'Amount'; number.value = '0.5'; number.setAttribute('min', '0'); number.setAttribute('max', '1'); number.setAttribute('step', '0.05');
    }
  };
  setNumberFor('thin_out');
  op.addEventListener('change', () => setNumberFor(op.value));
  request.addEventListener('input', () => paint());
  request.addEventListener('keydown', (e) => { const k = e as KeyboardEvent; if (k.key === 'Enter' && !k.isComposing) { k.preventDefault(); run.click(); } });

  const paint = (): void => {
    for (const b of Array.from(barsEl.children) as HTMLElement[]) b.setAttribute('aria-pressed', String(selection.bars.includes(Number(b.textContent))));
    for (const b of Array.from(rowsEl.children) as HTMLElement[]) b.setAttribute('aria-pressed', String((b.textContent === 'all' ? null : b.textContent) === selection.row));
    const chip = selectionChip(selection);
    chipsEl.textContent = '';
    if (chip !== null) chipsEl.appendChild(el('span', 'forge-notebook-chip', chip));
    hint.style.display = chip !== null ? 'none' : '';
    run.disabled = busy || chip === null;
    request.disabled = busy || derived;
    request.setAttribute('placeholder', derived ? DERIVED_REASON : REQUEST_PLACEHOLDER); request.setAttribute('aria-label', derived ? DERIVED_REASON : REQUEST_LABEL);
    const typed = request.value.trim() !== '';
    op.disabled = typed; number.disabled = typed;                       // a typed sentence is what Run will use: the picker is dimmed, not hidden
    doEl.setAttribute('data-mode', typed ? 'sentence' : 'picker');
    if (chip !== lastChip) { lastChip = chip; ports.trace(`[forge-notebook] selection ${chip ?? 'cleared'}`); }
  };

  const buildScore = (): void => {
    barsEl.textContent = ''; rowsEl.textContent = '';
    for (let n = 1; n <= score.count; n++) {
      const b = el('button', 'forge-notebook-bar', String(n)); b.type = 'button';
      b.setAttribute('aria-label', `Bar ${n}`); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', (e) => {
        selection = (e as MouseEvent).shiftKey ? extendSelection(selection, anchor, n) : toggleBar(selection, n);
        anchor = n;
        paint();
      });
      barsEl.appendChild(b);
    }
    for (const name of ['all', ...score.rows]) {
      const b = el('button', 'forge-notebook-row', name); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { selection = withRow(selection, name); paint(); });
      rowsEl.appendChild(b);
    }
  };

  const cellEl = (c: NotebookCell): HTMLElement => {
    const n = Number(/(\d+)$/.exec(c.id)?.[1] ?? 0);
    const cell = el('div', 'forge-notebook-cell');
    cell.setAttribute('data-cell', c.id); cell.setAttribute('data-role', c.role ?? 'source');
    cell.append(el('small', 'forge-notebook-cell-head', c.role === 'result' ? `cell ${n} · made this phrase from:` : `cell ${n} · received:`));
    cell.appendChild(doc.createTextNode(' '));
    cell.appendChild(el('span', 'forge-notebook-chip', c.selection));
    if (c.request !== undefined) cell.appendChild(el('div', 'forge-notebook-said', `“${c.request}”`));        // the sentence the cell was made from (text, never markup)
    const recipe = el('div', 'forge-notebook-recipe', c.ops.map((o) => { const w = transformOpWords(o); return `${w[0].toUpperCase()}${w.slice(1)}.`; }).join('\n'));
    recipe.style.whiteSpace = 'pre-line';
    cell.appendChild(recipe);
    const other = c.role === 'result' ? c.source : c.result;
    const open = el('button', 'forge-notebook-open', other.split('/').pop() ?? other); open.type = 'button';
    open.setAttribute('aria-label', `Open ${other.split('/').pop()}`);
    open.addEventListener('click', () => { ports.openPhrase?.(`${other}.md`); });
    const result = el('small', 'forge-notebook-result', c.role === 'result' ? 'Source: ' : 'Result: ');
    result.appendChild(open);
    cell.append(result, doc.createElement('br'));
    const rerun = el('button', 'forge-notebook-rerun', 'Re-run'); rerun.type = 'button';
    rerun.addEventListener('click', () => { void (async () => {
      const r = await ports.notebook.rerun(c);
      if (disposed) return;
      if (r.ok === false) say(r.message, 'alert'); else say(`Ran ${c.id} again: ${r.phrasePath} is what the cell says.`);
    })(); });
    const del = el('button', 'forge-notebook-delete', 'Delete cell'); del.type = 'button';
    del.addEventListener('click', () => { void (async () => {
      const r = await ports.notebook.deleteCell(c);
      if (disposed) return;
      if (r.ok === false) say(r.message, 'alert'); else say(`Deleted ${c.id}: ${c.result}.md is gone, ${c.source}.md is untouched.`);
      await refresh();
    })(); });
    cell.append(rerun, del);
    return cell;
  };

  async function refresh(): Promise<void> {
    const { cells, problems } = await ports.notebook.cells();
    if (disposed) return;
    cellsEl.textContent = '';
    for (const c of cells) cellsEl.appendChild(cellEl(c));
    for (const p of problems) cellsEl.appendChild(el('div', 'forge-notebook-problem', `${p.path}: ${p.message}`));
    const nowDerived = cells.some((c) => c.role === 'result');
    if (madeId !== null && !cells.some((c) => c.id === madeId) && message.textContent?.startsWith(`Made ${madeId} `)) { say(''); madeId = null; }   // 2026-10-29-0900 (b)
    if (nowDerived !== derived) { derived = nowDerived; paint(); }
  }

  run.addEventListener('click', () => { void (async () => {
    if (busy || selectionChip(selection) === null) return;
    const sentence = request.value.trim();
    const chosen = selection;                                           // what was selected when Run was pressed is what runs, whatever is clicked while the service thinks
    busy = true; paint(); say(sentence !== '' ? 'Asking...' : 'Running...');
    try {
      const r = sentence !== '' ? await ports.notebook.runRequest(chosen, sentence) : await ports.notebook.run(chosen, op.value as 'thin_out' | 'double_up', Number(number.value));
      if (disposed) return;
      if (r.ok === false) say(r.message, 'alert');
      else { request.value = ''; const made = (r.cellPath.split('/').pop() ?? '').replace(/\.md$/, ''); say(`Made ${made} and ${r.phrasePath}.`); await refresh(); madeId = made; }
    } finally { busy = false; if (!disposed) paint(); }
  })(); });

  paint();
  return {
    setScore(next) {
      score = { count: next.count, rows: next.rows };
      selection = { bars: selection.bars.filter((n) => n <= score.count), row: selection.row !== null && score.rows.includes(selection.row) ? selection.row : null };
      if (anchor !== null && anchor > score.count) anchor = null;
      buildScore(); paint();
    },
    refresh,
    dispose() { disposed = true; root.remove(); },
  };
}
