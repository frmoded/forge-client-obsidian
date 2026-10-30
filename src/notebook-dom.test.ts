// 2026-10-27-1030 (M14 slice 1): the notebook area, the UI contract of mockups/m11-notebook-below-the-score.html in happy-dom: bars you click (Shift extends), a row picker, the selection ALWAYS shown as chips, an op with its one number,
// Run, and the cells below with exactly what each received, its Recipe, Re-run and Delete cell, plain refusals; 2026-10-27-0720 (slice 2) the text request box works: a typed sentence is what Run uses (the picker is dimmed), Enter runs, a
// refusal keeps the sentence, a success clears it. The core (notebook-core.ts) is a fake here; the event order is a person's.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    runRequest: (s: Selection, sentence) => { calls.push(`ask ${JSON.stringify(s)} ${JSON.stringify(sentence)}`); return new Promise((res) => { pending.push(res); }); },
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
  assert.equal(request.disabled, false, 'the request box works (slice 2)');
  assert.equal(request.getAttribute('placeholder'), 'or say it: make this half as busy, keep the downbeat');
  assert.equal(request.getAttribute('aria-label'), 'What to do with the selected bars, in a sentence');
  assert.ok(!/needs a sentence service/.test(r.parent.textContent + request.getAttribute('placeholder')), 'the slice 1 placeholder is gone');
  assert.equal(r.q('.forge-notebook-do').getAttribute('data-mode'), 'picker');
  assert.equal(r.q('.forge-notebook-hint').textContent, 'Select bars: click a number below (Shift-click a second number for a range, e.g. 3 then Shift-click 5).');       // 2026-10-30-1020: "click bars above" was read as the bars of the Score
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

// ---- slice 2: the request box ----------------------------------------------------------------------------------------------------------------------------------------------------------

const typeInto = (r: ReturnType<typeof rig>, text: string) => { const box = r.q('.forge-notebook-request'); box.value = text; box.dispatchEvent(new win.Event('input', { bubbles: true })); };
const pickBars = (r: ReturnType<typeof rig>) => { r.click(r.bar(3)); r.click(r.bar(5), { shiftKey: true }); r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'kick')); };

test('a typed sentence is what Run uses: the core is asked with the selection and the trimmed sentence (not the op picker), the picker is dimmed while a sentence is there, the box is off while it works', async () => {
  const r = rig();
  pickBars(r);
  typeInto(r, '  make this half as busy, keep the downbeat ');
  assert.equal(r.q('.forge-notebook-do').getAttribute('data-mode'), 'sentence');
  assert.deepEqual([r.q('.forge-notebook-op').disabled, r.q('.forge-notebook-number').disabled], [true, true], 'the picker is dimmed, so it is plain which one Run will use');
  r.click(r.q('.forge-notebook-run'));
  assert.deepEqual(r.calls, ['ask {"bars":[3,4,5],"row":"kick"} "make this half as busy, keep the downbeat"']);
  assert.equal(r.msg(), 'Asking...');
  assert.equal(r.q('.forge-notebook-request').disabled, true, 'busy');
  assert.equal(r.q('.forge-notebook-run').disabled, true);
  r.click(r.q('.forge-notebook-run'));
  assert.equal(r.calls.length, 1, 'a second press while it asks asks nothing');
  r.setCells([{ ...CELL, request: 'make this half as busy, keep the downbeat' }]);
  r.pending[0]({ ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' }); await r.flush();
  assert.equal(r.msg(), 'Made cell_001 and phrases/phrase_007.md.');
  assert.equal(r.q('.forge-notebook-request').value, '', 'a success clears the sentence');
  assert.equal(r.q('.forge-notebook-request').disabled, false);
  assert.deepEqual([r.q('.forge-notebook-op').disabled, r.q('.forge-notebook-number').disabled], [false, false], 'the picker is back');
  assert.equal(r.q('.forge-notebook-do').getAttribute('data-mode'), 'picker');
  assert.equal(r.q('.forge-notebook-said').textContent, '“make this half as busy, keep the downbeat”', 'the cell shows the sentence it was made from');
});

test('a refusal ("make it jazzier") is one sentence in the message, the selection and the sentence STAY so it can be changed, and the picker stays dimmed', async () => {
  const r = rig();
  pickBars(r);
  typeInto(r, 'make it jazzier');
  r.click(r.q('.forge-notebook-run'));
  r.pending[0]({ ok: false, message: 'I can thin the hits out or double them up; I cannot make a bar jazzier.' }); await r.flush();
  assert.equal(r.msg(), 'I can thin the hits out or double them up; I cannot make a bar jazzier.');
  assert.equal(r.q('.forge-notebook-message').getAttribute('role'), 'alert');
  assert.equal(r.q('.forge-notebook-request').value, 'make it jazzier');
  assert.deepEqual(r.chips(), ['bars 3 to 5, kick row']);
  assert.equal(r.q('.forge-notebook-request').disabled, false);
  assert.equal(r.qa('.forge-notebook-cell').length, 0);
});

test('no sentence (or only spaces) means the op picker, exactly as in slice 1: run(), not runRequest()', () => {
  const r = rig();
  pickBars(r);
  typeInto(r, '   ');
  assert.equal(r.q('.forge-notebook-do').getAttribute('data-mode'), 'picker');
  assert.equal(r.q('.forge-notebook-op').disabled, false);
  r.click(r.q('.forge-notebook-run'));
  assert.deepEqual(r.calls, ['run {"bars":[3,4,5],"row":"kick"} thin_out 0.5']);
  assert.equal(r.msg(), 'Running...');
});

test('Enter in the request box is Run, when there is a selection; with none, nothing happens (typing before selecting is allowed, Run is what needs bars)', () => {
  const r = rig();
  typeInto(r, 'double the hits');
  const enter = () => r.q('.forge-notebook-request').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  enter();
  assert.deepEqual(r.calls, [], 'no bars selected: Run is off, so Enter asks nothing');
  assert.equal(r.q('.forge-notebook-run').disabled, true);
  pickBars(r);
  const press = (init: object) => { const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); r.q('.forge-notebook-request').dispatchEvent(e); return e; };
  press({ key: 'a' }); press({ key: 'Escape' });
  assert.deepEqual(r.calls, [], 'other keys do nothing');
  press({ key: 'Enter', isComposing: true });
  assert.deepEqual(r.calls, [], 'an Enter that only commits an input method\'s composition is not Run');
  const e = press({ key: 'Enter' });
  assert.equal(e.defaultPrevented, true, 'Enter is Run, not a form submit');
  assert.deepEqual(r.calls, ['ask {"bars":[3,4,5],"row":"kick"} "double the hits"']);
});

test('what was selected when Run was pressed is what runs: a bar clicked while the service thinks changes the chip, not the request', async () => {
  const r = rig();
  pickBars(r);
  typeInto(r, 'half as busy');
  r.click(r.q('.forge-notebook-run'));
  r.click(r.bar(9));
  assert.deepEqual(r.chips(), ['bars 3 to 5, 9, kick row']);
  assert.deepEqual(r.calls, ['ask {"bars":[3,4,5],"row":"kick"} "half as busy"'], 'the request is the selection at the press');
  r.pending[0]({ ok: false, message: 'no' }); await r.flush();
});

test('the sentence on a cell is text, never markup: a sentence that looks like HTML is shown as the characters it is', async () => {
  const r = rig({ cells: [{ ...CELL, request: '<img src=x onerror="alert(1)"> **bold**' }] });
  await r.h.refresh();
  const said = r.q('.forge-notebook-said');
  assert.equal(said.textContent, '“<img src=x onerror="alert(1)"> **bold**”');
  assert.equal(said.querySelector('img'), null);
  assert.equal(r.parent.querySelectorAll('img').length, 0);
});

test('a cell made from the op picker has no sentence line', async () => {
  const r = rig({ cells: [CELL] });
  await r.h.refresh();
  assert.equal(r.q('.forge-notebook-said'), null);
});

// ---- 2026-10-29-0900 item 2: "the box recorded a sentence nobody typed" (CCQA smoke 8) ----------------------------------------------------------------------------------------------
// The box can only send its own value. These pin the PROPERTY "a Run with a truly empty box is the op picker, whatever came before it", in the real order a person goes in.

test('refuse a sentence, select again, clear the box BY HAND, Run: that is the op picker (run), not a sentence (runRequest)', async () => {
  const r = rig();
  pickBars(r);
  typeInto(r, 'make this half as busy, keep the downbeat');
  r.click(r.q('.forge-notebook-run'));
  r.pending[0]({ ok: false, message: 'I could not turn that into a change.' }); await r.flush();
  assert.equal(r.q('.forge-notebook-request').value, 'make this half as busy, keep the downbeat', 'a refused sentence STAYS (by design)');
  r.click(r.bar(7));                                                   // select again
  typeInto(r, '');                                                     // clear by hand (select-all, delete)
  assert.equal(r.q('.forge-notebook-do').getAttribute('data-mode'), 'picker');
  r.calls.length = 0;
  r.click(r.q('.forge-notebook-run'));
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0], /^run /, 'the picker ran');
  assert.ok(!r.calls.some((c) => c.startsWith('ask')), 'no sentence was sent');
  assert.equal(r.msg(), 'Running...');
});

test('the placeholder is never a sentence: with nothing typed and the example text only in the placeholder, Run is the op picker', () => {
  const r = rig();
  pickBars(r);
  assert.equal(r.q('.forge-notebook-request').value, '');
  r.click(r.q('.forge-notebook-run'));
  assert.ok(r.calls[0]?.startsWith('run '), r.calls.join('|'));
});

test('the request box asks the browser not to autofill it (a remembered value would look like a typed sentence)', () => {
  const r = rig();
  assert.equal(r.q('.forge-notebook-request').getAttribute('autocomplete'), 'off');
});

// ---- 2026-10-29-0900 item 3 (a), (b): smoke 8 C3 ----------------------------------------------------------------------------------------------------------------------------------
test('(a) on a derived (transform) phrase the request box is DISABLED and says why; on a source phrase it works', async () => {
  const derived = rig({ cells: [{ ...CELL, role: 'result' }] });
  await derived.h.refresh();
  const box = derived.q('.forge-notebook-request');
  assert.equal(box.disabled, true, 'a transform phrase is not asked for another change');
  assert.match(box.getAttribute('placeholder'), /derived|source/i, 'the reason is on the box');
  assert.match(box.getAttribute('aria-label'), /derived|source/i);
  const source = rig({ cells: [CELL] });
  await source.h.refresh();
  assert.equal(source.q('.forge-notebook-request').disabled, false, 'P3: a source phrase keeps its working box');
  assert.equal(source.q('.forge-notebook-request').getAttribute('placeholder'), 'or say it: make this half as busy, keep the downbeat');
});

test('(a) the box comes back when the derived phrase has no cell any more (nothing derived it)', async () => {
  const r = rig({ cells: [{ ...CELL, role: 'result' }] });
  await r.h.refresh();
  assert.equal(r.q('.forge-notebook-request').disabled, true);
  r.setCells([]);
  await r.h.refresh();
  assert.equal(r.q('.forge-notebook-request').disabled, false);
});

test('(b) a "Made cell_001 ..." status does not outlive the cell: once a refresh no longer finds it, the status is cleared (a status about something else is left alone)', async () => {
  const r = rig();
  pickBars(r);
  r.click(r.q('.forge-notebook-run'));
  r.setCells([{ ...CELL }]);
  r.pending[0]({ ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' }); await r.flush();
  assert.equal(r.msg(), 'Made cell_001 and phrases/phrase_007.md.');
  await r.h.refresh();
  assert.equal(r.msg(), 'Made cell_001 and phrases/phrase_007.md.', 'the cell is still there: the status stays');
  r.setCells([]);                                                       // deleted from the other tab
  await r.h.refresh();
  assert.equal(r.msg(), '', 'cell_001 is gone: its "Made" status goes with it');
  // a different status is never cleared by a refresh
  pickBars(r);
  r.click(r.q('.forge-notebook-run'));
  r.pending[1]({ ok: false, message: 'Nothing to do.' }); await r.flush();
  await r.h.refresh();
  assert.equal(r.msg(), 'Nothing to do.');
});

test('(f) the chip line has its height from the start, so the first chip does not push the bars and rows down (smoke 8: a click landed one row off)', () => {
  const r = rig();
  const chips = r.q('.forge-notebook-chips');
  assert.equal(chips.children.length, 0, 'no chip yet');
  assert.notEqual(chips.style.minHeight, '', 'its height is reserved while empty');
  const before = chips.style.minHeight;
  pickBars(r);
  assert.equal(chips.style.minHeight, before, 'and unchanged once a chip is there');
});

// ---- 2026-10-30-1020: the driver could not pick bars 3 to 5 ("click bars above" read as the Score's bars; twice told how) -------------------------------------------------------------------------------------------------------------

test('1020: the hint says where to click and how to get a range, and goes when a selection exists; no sentence of it says "above"', () => {
  const r = rig();
  const HINT = 'Select bars: click a number below (Shift-click a second number for a range, e.g. 3 then Shift-click 5).';
  assert.equal(r.q('.forge-notebook-hint').textContent, HINT);
  assert.ok(!/above/.test(r.q('.forge-notebook-hint').textContent));
  r.click(r.bar(2));
  assert.equal(r.q('.forge-notebook-hint').style.display, 'none');
  r.click(r.bar(2));
  assert.equal(r.q('.forge-notebook-hint').style.display, '', 'it comes back with the empty selection');
});

test('1020: selectRange(3, 5) (what a drag on the Score says) selects bars 3 to 5 as a REPLACEMENT, keeps the row, and shows the chip as "bars 3 to 5, kick row"', () => {
  const r = rig();
  r.click(r.bar(9)); r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'kick'));
  r.h.selectRange(3, 5);
  assert.deepEqual(r.chips(), ['bars 3 to 5, kick row']);
  assert.deepEqual([3, 4, 5].map((n) => r.bar(n).getAttribute('aria-pressed')), ['true', 'true', 'true']);
  assert.equal(r.bar(9).getAttribute('aria-pressed'), 'false', 'the earlier selection is replaced, not added to');
  assert.equal(r.bar(2).getAttribute('aria-pressed'), 'false');
  assert.equal(r.bar(6).getAttribute('aria-pressed'), 'false');
});

test('1020: selectRange clamps to the Score (a range past the end ends at the last bar; a reversed range is the same range; one bar is a bar)', () => {
  const r = rig();
  r.h.selectRange(15, 40);
  assert.deepEqual(r.chips(), ['bars 15 to 17']);
  r.h.selectRange(6, 4);
  assert.deepEqual(r.chips(), ['bars 4 to 6']);
  r.h.selectRange(7, 7);
  assert.deepEqual(r.chips(), ['bar 7']);
  r.h.selectRange(30, 40);
  assert.deepEqual(r.chips(), [], 'a range wholly past the end selects nothing');
});

test('1020: extendTo(n) is the Shift-click of the Score: from the last bar picked, by number or by range', () => {
  const r = rig();
  r.click(r.bar(3));
  r.h.extendTo(5);
  assert.deepEqual(r.chips(), ['bars 3 to 5']);
  const r2 = rig();
  r2.h.selectRange(2, 4);
  r2.h.extendTo(8);
  assert.deepEqual(r2.chips(), ['bars 2 to 8'], 'after a drag the anchor is where the drag ended');
  const r3 = rig();
  r3.h.extendTo(6);
  assert.deepEqual(r3.chips(), ['bar 6'], 'with no anchor it is a plain pick, as a Shift-click on a number is');
});

test('1020: the tint is told: onSelection hears every change of the selection (number, Shift, row, drag, a Score that got shorter) and only a change', () => {
  const heard: string[] = [];
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const nb: Notebook = { run: async () => ({ ok: false, message: '' }), runRequest: async () => ({ ok: false, message: '' }), cells: async () => ({ cells: [], problems: [] }), rerun: async () => ({ ok: false, message: '' }), deleteCell: async () => ({ ok: true }) } as never;
  const h = mountNotebook(parent, { notebook: nb, trace: () => {}, onSelection: (s) => heard.push(`${s.bars.join(',')}|${s.row}`) });
  h.setScore({ count: 9, rows: ['kick', 'snare'] });
  const bars = [...parent.querySelectorAll('.forge-notebook-bar')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  heard.length = 0;
  click(bars[2]); click(bars[4], { shiftKey: true });
  h.selectRange(6, 7);
  click([...parent.querySelectorAll('.forge-notebook-rows button')].find((b: any) => b.textContent === 'snare') as any);
  h.selectRange(6, 7);                          // the same range again: nothing changed
  h.setScore({ count: 6, rows: ['kick', 'snare'] });
  assert.deepEqual(heard, ['3|null', '3,4,5|null', '6,7|null', '6,7|snare', '6|snare']);
});

test('1020: a pick of a number and a Shift-click bring the Run row into view (the numbers of a long Score wrap over many lines); a DRAG does not scroll while it is moving (the Score would slide under the pointer) - the surface asks at its end; a plain refresh never scrolls', async () => {
  const proto = win.HTMLElement.prototype; const saved = proto.scrollIntoView;
  const seen: string[] = [];
  let mine: any = null;                                  // other tests' notebooks are still on the page, with their own settle timers: only this rig's Run row counts
  proto.scrollIntoView = function (this: any, o: any) { if (mine !== null && mine.contains(this)) seen.push(`${this.className.split(' ')[0]}:${o?.block}`); };
  try {
    const r = rig(); mine = r.parent;
    r.click(r.bar(3)); r.h.extendTo(8); r.click(r.bar(9), { shiftKey: true });
    assert.deepEqual(seen, Array(3).fill('forge-notebook-do:nearest'));
    seen.length = 0;
    r.h.selectRange(3, 5); r.h.selectRange(3, 6);
    assert.deepEqual(seen, [], 'the pointer is still down: nothing may move the Score');
    r.h.reveal();
    assert.deepEqual(seen, ['forge-notebook-do:nearest'], 'when the drag is over, one scroll');
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.deepEqual(seen, Array(2).fill('forge-notebook-do:nearest'), 'and one more once the layout has settled (real Chrome: the scroll put a drawn bar under the pointer, the hover preview opened and pushed the Run row 34 px out of view again)');
    r.h.reveal(); r.h.reveal();
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(seen.length, 2 + 2 + 1, 'two reveals in a row settle ONCE');
    seen.length = 0;
    r.h.setScore({ count: 17, rows: ['kick'] });
    assert.deepEqual(seen, []);
  } finally { if (saved === undefined) delete proto.scrollIntoView; else proto.scrollIntoView = saved; }
});

test('1020: the numbered buttons are drawn as buttons, and the selected range is drawn filled - the plugin stylesheet says so for `.forge-notebook-bar` (border, hover, pressed, selected fill), and for the row buttons', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '../styles.css'), 'utf8');
  const rule = (selector: string): string => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').some((x) => x.trim() === selector)).map((m) => m[2]).join('\n');       // every block whose selector LIST holds the selector
  assert.match(rule('.forge-notebook-bar'), /border:\s*1px solid/, 'a border: bare numbers do not look pressable');
  assert.match(rule('.forge-notebook-bar'), /cursor:\s*pointer/);
  assert.match(rule('.forge-notebook-bar:hover'), /background/);
  assert.match(rule('.forge-notebook-bar:active'), /(transform|background)/, 'a pressed state');
  assert.match(rule('.forge-notebook-bar[aria-pressed="true"]'), /background:\s*var\(--interactive-accent/, 'the selected range is filled with the accent');
  assert.match(rule('.forge-notebook-row'), /border:\s*1px solid/);
  assert.match(rule('.forge-notebook-row[aria-pressed="true"]'), /background:\s*var\(--interactive-accent/);
});

test('1020: a reveal that is still waiting to settle when the notebook is disposed does nothing (no scroll on a page that is gone)', async () => {
  const proto = win.HTMLElement.prototype; const saved = proto.scrollIntoView;
  let calls = 0;
  proto.scrollIntoView = function () { calls++; };
  try {
    const r = rig();
    r.h.reveal(); r.h.dispose();
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(calls, 1);
  } finally { if (saved === undefined) delete proto.scrollIntoView; else proto.scrollIntoView = saved; }
});
