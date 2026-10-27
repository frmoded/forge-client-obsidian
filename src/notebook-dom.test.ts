// 2026-10-27-1030 (M14 slice 1): the notebook area, the UI contract of mockups/m11-notebook-below-the-score.html in happy-dom: bars you click (Shift extends), a row picker, the selection ALWAYS shown as chips, an op with its one number,
// Run, and the cells below with exactly what each received, its Recipe, Re-run and Delete cell, plain refusals; the text request box is there but disabled. The core (notebook-core.ts) is a fake here; the event order is a person's.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountNotebook } from './notebook-dom.ts';
import type { Notebook, NotebookCell, RunResult, Selection } from './notebook-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const CELL: NotebookCell = { id: 'cell_001', path: 'notebook/cell_001.md', source: 'phrases/phrase_006', result: 'phrases/phrase_007', selection: 'bars 3 to 5, kick row', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }], role: 'source' };

function rig(opts: { cells?: NotebookCell[]; problems?: Array<{ path: string; message: string }> } = {}) {
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const calls: string[] = []; const lines: string[] = []; const opened: string[] = [];
  let cells = opts.cells ?? [];
  const pending: Array<(r: RunResult) => void> = [];
  const nb: Notebook = {
    run: (s: Selection, kind, number) => { calls.push(`run ${JSON.stringify(s)} ${kind} ${number}`); return new Promise((res) => { pending.push(res); }); },
    cells: async () => ({ cells, problems: opts.problems ?? [] }),
    rerun: async (c) => { calls.push(`rerun ${c.id}`); return { ok: true, phrasePath: `${c.result}.md`, remade: false }; },
    deleteCell: async (c) => { calls.push(`delete ${c.id}`); cells = cells.filter((x) => x.id !== c.id); return { ok: true }; },
  };
  const h = mountNotebook(parent, { notebook: nb, trace: (l) => lines.push(l), openPhrase: (p) => opened.push(p) });
  h.setScore({ count: 17, rows: ['kick', 'snare', 'hihat'] });
  const q = (s: string) => parent.querySelector(s) as any;
  const qa = (s: string) => [...parent.querySelectorAll(s)] as any[];
  const bar = (n: number) => qa('.forge-notebook-bar')[n - 1];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const flush = () => new Promise((r) => setImmediate(r));
  return { h, parent, calls, lines, opened, pending, q, qa, bar, click, flush, setCells: (c: NotebookCell[]) => { cells = c; }, msg: () => q('.forge-notebook-message').textContent as string, chips: () => qa('.forge-notebook-chips .forge-notebook-chip').map((c: any) => c.textContent) };
}

test('what is on the page when it opens: a collapsible Notebook, one box per bar of the Score, the rows, no chip, Run off, the request box present and DISABLED with its label, the hint', () => {
  const r = rig();
  const details = r.q('details.forge-notebook');
  assert.equal(details.open, true);
  assert.equal(r.q('details.forge-notebook > summary').textContent, 'Notebook');
  assert.equal(r.qa('.forge-notebook-bar').length, 17);
  assert.deepEqual(r.qa('.forge-notebook-bar').slice(0, 3).map((b: any) => [b.textContent, b.getAttribute('aria-pressed'), b.getAttribute('aria-label')]), [['1', 'false', 'Bar 1'], ['2', 'false', 'Bar 2'], ['3', 'false', 'Bar 3']]);
  assert.deepEqual(r.qa('.forge-notebook-rows button').map((b: any) => [b.textContent, b.getAttribute('aria-pressed')]), [['all', 'true'], ['kick', 'false'], ['snare', 'false'], ['hihat', 'false']]);
  assert.deepEqual(r.chips(), []);
  assert.equal(r.q('.forge-notebook-run').disabled, true);
  const request = r.q('.forge-notebook-request');
  assert.equal(request.disabled, true);
  assert.equal(request.getAttribute('placeholder'), 'needs a sentence service (M7b b)');
  assert.equal(request.getAttribute('aria-label'), 'needs a sentence service (M7b b)');
  assert.match(r.q('.forge-notebook-hint').textContent, /^No selection yet: click bars above\./);
  assert.equal(r.q('.forge-notebook-bars').getAttribute('role'), 'group');
});

test('clicking bars selects them, a second click unselects; Shift-click extends from the last bar clicked; the selection is always shown as chips', () => {
  const r = rig();
  r.click(r.bar(3));
  assert.deepEqual(r.chips(), ['bar 3']);
  assert.equal(r.bar(3).getAttribute('aria-pressed'), 'true');
  r.click(r.bar(5), { shiftKey: true });
  assert.deepEqual(r.chips(), ['bars 3 to 5']);
  assert.deepEqual(r.qa('.forge-notebook-bar').filter((b: any) => b.getAttribute('aria-pressed') === 'true').map((b: any) => b.textContent), ['3', '4', '5']);
  r.click(r.bar(4));
  assert.deepEqual(r.chips(), ['bars 3, 5']);
  r.click(r.bar(9));
  r.click(r.bar(7), { shiftKey: true });
  assert.deepEqual(r.chips(), ['bars 3, 5, 7 to 9']);
  assert.equal(r.q('.forge-notebook-run').disabled, false);
  assert.equal(r.q('.forge-notebook-hint').style.display, 'none', 'the hint goes once there is a selection');
});

test('the row picker: a row joins the chip, "all" takes it away; the picked row looks pressed', () => {
  const r = rig();
  r.click(r.bar(3)); r.click(r.bar(5), { shiftKey: true });
  const rowBtn = (name: string) => r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === name);
  r.click(rowBtn('kick'));
  assert.deepEqual(r.chips(), ['bars 3 to 5, kick row']);
  assert.equal(rowBtn('kick').getAttribute('aria-pressed'), 'true');
  assert.equal(rowBtn('all').getAttribute('aria-pressed'), 'false');
  r.click(rowBtn('all'));
  assert.deepEqual(r.chips(), ['bars 3 to 5']);
  assert.equal(rowBtn('all').getAttribute('aria-pressed'), 'true');
});

test('evidence lines: one `[forge-notebook] selection ...` per change of the selection, none for a click that changes nothing', () => {
  const r = rig();
  r.click(r.bar(3)); r.click(r.bar(5), { shiftKey: true });
  r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'kick'));
  r.click(r.bar(3)); r.click(r.bar(4)); r.click(r.bar(5));
  assert.deepEqual(r.lines, [
    '[forge-notebook] selection bar 3', '[forge-notebook] selection bars 3 to 5', '[forge-notebook] selection bars 3 to 5, kick row',
    '[forge-notebook] selection bars 4 to 5, kick row', '[forge-notebook] selection bar 5, kick row', '[forge-notebook] selection cleared',
  ]);
  const same = rig();
  same.click(same.qa('.forge-notebook-rows button')[0]);
  assert.deepEqual(same.lines, [], 'picking the row that is already picked says nothing');
});

test('the op picker with its one number: Thin out takes an amount (0 to 1, 0.5), Double up a grid (16); changing the op resets the number to its default', () => {
  const r = rig();
  assert.deepEqual(r.qa('.forge-notebook-op option').map((o: any) => [o.value, o.textContent]), [['thin_out', 'Thin out'], ['double_up', 'Double up']]);
  const num = r.q('.forge-notebook-number');
  assert.deepEqual([num.value, num.getAttribute('min'), num.getAttribute('max'), num.getAttribute('step')], ['0.5', '0', '1', '0.05']);
  assert.equal(r.q('.forge-notebook-number-label').textContent, 'Amount');
  const op = r.q('.forge-notebook-op');
  op.value = 'double_up'; op.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.deepEqual([num.value, num.getAttribute('min'), num.getAttribute('max'), num.getAttribute('step')], ['16', '1', null, '1']);
  assert.equal(r.q('.forge-notebook-number-label').textContent, 'Grid');
  num.value = '8';
  op.value = 'thin_out'; op.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert.equal(num.value, '0.5');
});

test('RUN: busy while it works, the core gets the selection, the op and the number; a refusal is one sentence and keeps the selection; a success says which cell and clears the busy state', async () => {
  const r = rig();
  r.click(r.bar(3)); r.click(r.bar(5), { shiftKey: true });
  r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'kick'));
  r.q('.forge-notebook-number').value = '0.25';
  r.click(r.q('.forge-notebook-run'));
  assert.deepEqual(r.calls, ['run {"bars":[3,4,5],"row":"kick"} thin_out 0.25']);
  assert.equal(r.q('.forge-notebook-run').disabled, true, 'busy');
  r.click(r.q('.forge-notebook-run'));
  assert.equal(r.calls.length, 1, 'a second press while busy asks nothing');
  r.pending[0]({ ok: false, message: 'Notebook: ops[0].amount must be a number from 0 to 1, got 7.' }); await r.flush();
  assert.equal(r.msg(), 'Notebook: ops[0].amount must be a number from 0 to 1, got 7.');
  assert.equal(r.q('.forge-notebook-message').getAttribute('role'), 'alert');
  assert.deepEqual(r.chips(), ['bars 3 to 5, kick row'], 'the selection stays');
  assert.equal(r.q('.forge-notebook-run').disabled, false);
  r.setCells([CELL]);
  r.click(r.q('.forge-notebook-run'));
  r.pending[1]({ ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' }); await r.flush();
  assert.equal(r.msg(), 'Made cell_001 and phrases/phrase_007.md.');
  assert.equal(r.q('.forge-notebook-message').getAttribute('role'), 'status');
  assert.equal(r.qa('.forge-notebook-cell').length, 1, 'the new cell is listed');
});

test('a cell shows exactly what it received (the chip), its Recipe line(s), its result; Re-run and Delete cell do what they say and the list follows', async () => {
  const r = rig({ cells: [CELL] });
  await r.h.refresh();
  const cell = r.q('.forge-notebook-cell');
  assert.equal(cell.getAttribute('data-cell'), 'cell_001');
  assert.equal(cell.querySelector('.forge-notebook-cell-head').textContent, 'cell 1 · received:');
  assert.equal(cell.querySelector('.forge-notebook-chip').textContent, 'bars 3 to 5, kick row');
  assert.equal(cell.querySelector('.forge-notebook-recipe').textContent, 'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.');
  const result = cell.querySelector('.forge-notebook-open');
  assert.equal(result.textContent, 'phrase_007');
  r.click(result);
  assert.deepEqual(r.opened, ['phrases/phrase_007.md']);
  r.click(cell.querySelector('.forge-notebook-rerun')); await r.flush();
  assert.deepEqual(r.calls, ['rerun cell_001']);
  assert.equal(r.msg(), 'Ran cell_001 again: phrases/phrase_007.md is what the cell says.');
  r.click(cell.querySelector('.forge-notebook-delete')); await r.flush();
  assert.deepEqual(r.calls, ['rerun cell_001', 'delete cell_001']);
  assert.equal(r.qa('.forge-notebook-cell').length, 0, 'the cell is gone from the list');
  assert.equal(r.msg(), 'Deleted cell_001: phrases/phrase_007.md is gone, phrases/phrase_006.md is untouched.');
});

test('on the tab of the phrase a cell MADE, the cell reads as made this phrase, with its source one click away; a note in notebook/ that cannot be read is named', async () => {
  const r = rig({ cells: [{ ...CELL, role: 'result' }], problems: [{ path: 'notebook/cell_009.md', message: 'The json block is not valid JSON: x' }] });
  await r.h.refresh();
  const cell = r.q('.forge-notebook-cell');
  assert.equal(cell.getAttribute('data-role'), 'result');
  assert.equal(cell.querySelector('.forge-notebook-cell-head').textContent, 'cell 1 · made this phrase from:');
  const open = cell.querySelector('.forge-notebook-open');
  assert.equal(open.textContent, 'phrase_006');
  r.click(open);
  assert.deepEqual(r.opened, ['phrases/phrase_006.md']);
  assert.equal(r.q('.forge-notebook-problem').textContent, 'notebook/cell_009.md: The json block is not valid JSON: x');
});

test('when the Score changes length or rows the boxes follow: bars past the end and a row that is gone leave the selection', () => {
  const r = rig();
  r.click(r.bar(15)); r.click(r.bar(3));
  r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'hihat'));
  assert.deepEqual(r.chips(), ['bars 3, 15, hihat row']);
  r.h.setScore({ count: 5, rows: ['kick', 'snare'] });
  assert.equal(r.qa('.forge-notebook-bar').length, 5);
  assert.deepEqual(r.chips(), ['bar 3']);
  assert.deepEqual(r.qa('.forge-notebook-rows button').map((b: any) => b.textContent), ['all', 'kick', 'snare']);
  assert.equal(r.qa('.forge-notebook-rows button')[0].getAttribute('aria-pressed'), 'true');
});

test('dispose takes the notebook out of the page', () => {
  const r = rig();
  r.h.dispose();
  assert.equal(r.parent.querySelector('.forge-notebook'), null);
});
