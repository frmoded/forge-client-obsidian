// 2026-10-27-1030 (M14 slice 1, design 4.13): the notebook below the Score, its pure core. A SELECTION is bars (clicked; Shift extends) and a row; it is always shown as chips ("bars 3 to 5, kick row"). Run turns the selection and
// one op into a transform phrase (a note in phrases/) and a CELL (a note in notebook/: Description, Recipe, wikilinks and the ONE json fence that records what the cell received). Re-run writes the same phrase again from the cell
// (deterministic, no LLM). Delete cell removes the cell and the phrase it made; the source is never touched. The vault, the tab and the Notice are ports.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NOTEBOOK_FOLDER, cellNoteContent, createNotebook, extendSelection, opsFor, planNewCell, readCellNote, selectionChip, selectionRuns, toggleBar, withRow,
  type NotebookPorts, type Selection,
} from './notebook-core.ts';
import { readPhraseNote, type TransformOp } from './phrase-core.ts';

const EMPTY: Selection = { bars: [], row: null };

// ---- the selection ----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('clicking a bar selects it, clicking it again unselects it; the bars stay sorted and unique', () => {
  let s = toggleBar(EMPTY, 5);
  s = toggleBar(s, 3);
  assert.deepEqual(s.bars, [3, 5]);
  s = toggleBar(s, 5);
  assert.deepEqual(s.bars, [3]);
  assert.deepEqual(toggleBar(EMPTY, 2).bars, [2]);
  assert.deepEqual(toggleBar({ bars: [1, 2], row: 'kick' }, 1), { bars: [2], row: 'kick' }, 'the row is kept');
});

test('Shift-click extends from the last bar clicked to this one, in either direction, adding to what is selected', () => {
  assert.deepEqual(extendSelection({ bars: [3], row: null }, 3, 6).bars, [3, 4, 5, 6]);
  assert.deepEqual(extendSelection({ bars: [6], row: null }, 6, 3).bars, [3, 4, 5, 6]);
  assert.deepEqual(extendSelection({ bars: [1, 3], row: null }, 3, 5).bars, [1, 3, 4, 5]);
  assert.deepEqual(extendSelection(EMPTY, null, 4).bars, [4], 'no anchor: it is a plain click');
});

test('the row: a name or all (null); the chip says the bars and the row in words', () => {
  assert.equal(selectionChip(EMPTY), null);
  assert.equal(selectionChip({ bars: [3, 4, 5], row: null }), 'bars 3 to 5');
  assert.equal(selectionChip({ bars: [3, 4, 5], row: 'kick' }), 'bars 3 to 5, kick row');
  assert.equal(selectionChip({ bars: [7], row: 'snare' }), 'bar 7, snare row');
  assert.equal(selectionChip({ bars: [2, 4, 9], row: null }), 'bars 2, 4, 9');
  assert.equal(selectionChip({ bars: [2, 3, 4, 9], row: null }), 'bars 2 to 4, 9');
  assert.equal(selectionChip({ bars: [1, 2], row: 'hihat' }), 'bars 1 to 2, hihat row');
  assert.deepEqual(withRow({ bars: [1], row: null }, 'kick'), { bars: [1], row: 'kick' });
  assert.deepEqual(withRow({ bars: [1], row: 'kick' }, 'all'), { bars: [1], row: null });
});

test('the runs of a selection: each stretch of consecutive bars is one range, which is what the engine takes', () => {
  assert.deepEqual(selectionRuns([3, 4, 5]), [[3, 5]]);
  assert.deepEqual(selectionRuns([2, 4, 5, 9]), [[2, 2], [4, 5], [9, 9]]);
  assert.deepEqual(selectionRuns([]), []);
});

test('an op for a selection: one op per run, the row on each; thin out takes an amount, double up a grid; nothing selected is no op', () => {
  const sel: Selection = { bars: [2, 4, 5], row: 'kick' };
  assert.deepEqual(opsFor(sel, 'thin_out', 0.5), [{ op: 'thin_out', first: 2, last: 2, row: 'kick', amount: 0.5 }, { op: 'thin_out', first: 4, last: 5, row: 'kick', amount: 0.5 }] satisfies TransformOp[]);
  assert.deepEqual(opsFor({ bars: [3], row: null }, 'double_up', 16), [{ op: 'double_up', first: 3, last: 3, grid: 16 }] satisfies TransformOp[]);
  assert.equal(opsFor(EMPTY, 'thin_out', 0.5), null);
});

// ---- the cell note -----------------------------------------------------------------------------------------------------------------------------------------------------------------

const CELL = { id: 'cell_001', source: 'phrases/phrase_006', result: 'phrases/phrase_007', selection: 'bars 3 to 5, kick row', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] satisfies TransformOp[] };

test('a cell is a Forge note: Description, Recipe, wikilinks to the phrases it joins, and ONE json fence that records what it received; it reads back', () => {
  const text = cellNoteContent(CELL);
  assert.equal(text, [
    '---', 'type: data', 'content_type: json',
    'description: "cell_001 — bars 3 to 5, kick row of [[phrase_006]]: thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats. Made [[phrase_007]]."',
    'links:', '  - "[[phrase_006]]"', '  - "[[phrase_007]]"', '---', '',
    '<!-- derived from the json below; edit the controls, not this text -->', '',
    '# Description', '', 'cell_001 — bars 3 to 5, kick row of [[phrase_006]]: thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats. Made [[phrase_007]].', '',
    '# Recipe', '', 'Take [[phrase_006]].', 'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.', 'This makes [[phrase_007]].', '',
    '```json',
    '{', '  "kind": "notebook_cell",', '  "source": "phrases/phrase_006",', '  "result": "phrases/phrase_007",', '  "selection": "bars 3 to 5, kick row",', '  "ops": [',
    '    {"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5}', '  ]', '}',
    '```', '',
  ].join('\n'));
  const read = readCellNote(text, 'notebook/cell_001.md');
  assert.ok(read.ok);
  if (read.ok) assert.deepEqual(read.cell, { ...CELL, path: 'notebook/cell_001.md' });
});

test('a cell that cannot be read says why; it is never a throw', () => {
  const bad = (text: string) => { const r = readCellNote(text, 'notebook/cell_009.md'); assert.equal(r.ok, false); return (r as { message: string }).message; };
  assert.match(bad('no frontmatter'), /not a data note/);
  assert.match(bad('---\ntype: data\ncontent_type: json\n---\n\nnothing'), /json block/);
  assert.match(bad('---\ntype: data\ncontent_type: json\n---\n\n```json\n{ nope\n```\n'), /not valid JSON/);
  assert.match(bad('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "extend"}\n```\n'), /not a notebook cell/);
  assert.match(bad('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "notebook_cell", "source": "bars/bar_001", "result": "phrases/phrase_007", "selection": "x", "ops": []}\n```\n'), /source must be a phrase note/);
  assert.match(bad('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "notebook_cell", "source": "phrases/phrase_006", "result": "somewhere", "selection": "x", "ops": [{"op": "double_up", "first": 1, "last": 1}]}\n```\n'), /result must be a phrase note/);
});

test('the next free cell name comes from the listing; a name that exists is skipped', () => {
  assert.deepEqual(planNewCell({ existingBasenames: [], exists: () => false }), { ok: true, id: 'cell_001', path: 'notebook/cell_001.md' });
  assert.deepEqual(planNewCell({ existingBasenames: ['cell_001', 'cell_004', 'README'], exists: () => false }), { ok: true, id: 'cell_005', path: 'notebook/cell_005.md' });
  const taken = new Set(['notebook/cell_001.md']);
  assert.deepEqual(planNewCell({ existingBasenames: [], exists: (p) => taken.has(p) }), { ok: true, id: 'cell_002', path: 'notebook/cell_002.md' });
  const none = planNewCell({ existingBasenames: [], exists: () => true });
  assert.equal(none.ok, false);
  assert.equal(NOTEBOOK_FOLDER, 'notebook');
});

// ---- Run, Re-run, Delete ---------------------------------------------------------------------------------------------------------------------------------------------------------

function world(over: { failCreate?: (path: string) => boolean; failRemove?: string } = {}) {
  const files = new Map<string, string>([['notebook/README.md', 'Notebook: where you will write what you want next to the score.']]);
  const lines: string[] = []; const notices: string[] = []; const opened: string[] = []; const folders: string[] = []; const removed: string[] = [];
  const ports: NotebookPorts<string> = {
    sourcePhrase: 'phrases/phrase_006',
    activePath: () => 'phrases/phrase_006.md',
    folderExists: (f) => folders.includes(f) || [...files.keys()].some((p) => p.startsWith(`${f}/`)),
    createFolder: async (f) => { folders.push(f); },
    listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    listCellPaths: () => [...files.keys()].filter((p) => p.startsWith('notebook/') && p.endsWith('.md')),
    exists: (p) => files.has(p),
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    create: async (p, c) => { if (over.failCreate?.(p)) throw new Error('disk full'); if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); return p; },
    write: async (p, c) => { files.set(p, c); },
    remove: async (p) => { if (over.failRemove === p) throw new Error('locked'); files.delete(p); removed.push(p); },
    open: async (f) => { opened.push(f); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: (e) => /already exists/.test(String((e as Error).message)),
    trace: (l) => { lines.push(l); },
  };
  files.set('phrases/phrase_006.md', '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n');
  return { nb: createNotebook(ports), nbFor: (source: string) => createNotebook({ ...ports, sourcePhrase: source }), files, lines, notices, opened, folders, removed };
}

test('RUN makes the transform phrase and the cell, opens the phrase, and says so in the evidence lines; the source is untouched', async () => {
  const w = world();
  const sourceBefore = w.files.get('phrases/phrase_006.md');
  const sel: Selection = { bars: [3, 4, 5], row: 'kick' };
  const res = await w.nb.run(sel, 'thin_out', 0.5);
  assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' });
  const phrase = w.files.get('phrases/phrase_007.md')!;
  const read = readPhraseNote(phrase);
  assert.ok(read.ok && read.value.kind === 'transform');
  if (read.ok && read.value.kind === 'transform') {
    assert.equal(read.value.source, 'phrases/phrase_006');
    assert.deepEqual(read.value.ops, [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }]);
  }
  const cell = readCellNote(w.files.get('notebook/cell_001.md')!, 'notebook/cell_001.md');
  assert.ok(cell.ok);
  if (cell.ok) assert.deepEqual([cell.cell.source, cell.cell.result, cell.cell.selection], ['phrases/phrase_006', 'phrases/phrase_007', 'bars 3 to 5, kick row']);
  assert.deepEqual(w.opened, ['phrases/phrase_007.md']);
  assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore, 'the source phrase is byte-identical');
  assert.deepEqual(w.lines, ['[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md']);
  assert.deepEqual(w.folders, [], 'notebook/ already exists: nothing to create');
});

test('RUN with a scattered selection makes ONE phrase with one op per run; with nothing selected it asks for bars and writes nothing', async () => {
  const w = world();
  const res = await w.nb.run({ bars: [2, 4, 5], row: null }, 'double_up', 16);
  assert.ok(res.ok);
  const read = readPhraseNote(w.files.get('phrases/phrase_007.md')!);
  assert.ok(read.ok && read.value.kind === 'transform' && read.value.ops.length === 2);
  const none = world();
  assert.deepEqual(await none.nb.run(EMPTY, 'thin_out', 0.5), { ok: false, message: 'Select some bars first: click them in the bar list, Shift-click to extend.' });
  assert.deepEqual(none.notices, ['Select some bars first: click them in the bar list, Shift-click to extend.']);
  assert.ok(![...none.files.keys()].some((p) => p === 'phrases/phrase_007.md' || p === 'notebook/cell_001.md'));
  assert.deepEqual(none.lines, []);
});

test('RUN in a vault whose notebook folder is missing makes it; a number the engine would refuse is refused here, before any note is made', async () => {
  const w = world();
  w.files.delete('notebook/README.md');
  assert.ok((await w.nb.run({ bars: [1], row: null }, 'thin_out', 0.5)).ok);
  assert.deepEqual(w.folders, ['notebook']);
  const bad = world();
  const refused = await bad.nb.run({ bars: [1], row: null }, 'thin_out', 7);
  assert.equal(refused.ok, false);
  assert.match((refused as { message: string }).message, /amount must be a number from 0 to 1/);
  assert.ok(!bad.files.has('phrases/phrase_007.md'));
});

test('RUN that cannot write the cell takes back the phrase it just made, and says so; nothing is left behind', async () => {
  const w = world({ failCreate: (p) => p.startsWith('notebook/cell_') });
  const res = await w.nb.run({ bars: [1], row: null }, 'thin_out', 0.5);
  assert.equal(res.ok, false);
  assert.match((res as { message: string }).message, /Could not make the cell: disk full/);
  assert.ok(!w.files.has('phrases/phrase_007.md'), 'the phrase was taken back');
  assert.deepEqual(w.removed, ['phrases/phrase_007.md']);
  assert.ok(![...w.files.keys()].some((p) => p.startsWith('notebook/cell_')));
});

test('CELLS lists the cells of this tab: those that read this phrase (as received) and the one that made it (as result); a cell that cannot be read is named, not dropped', async () => {
  const w = world();
  await w.nb.run({ bars: [3], row: 'kick' }, 'thin_out', 0.5);
  await w.nb.run({ bars: [1, 2], row: null }, 'double_up', 16);
  w.files.set('notebook/cell_009.md', 'broken');
  w.files.set('notebook/other.md', cellNoteContent({ ...CELL, id: 'other', source: 'phrases/phrase_001', result: 'phrases/phrase_002' }));
  const mine = await w.nb.cells();
  assert.deepEqual(mine.cells.map((c) => [c.id, c.role]), [['cell_001', 'source'], ['cell_002', 'source']]);
  assert.deepEqual(mine.problems.map((p) => p.path), ['notebook/cell_009.md']);
  const resultTab = await w.nbFor('phrases/phrase_007').cells();
  assert.deepEqual(resultTab.cells.map((c) => [c.id, c.role]), [['cell_001', 'result']], 'the tab of the phrase a cell made lists that cell');
  assert.deepEqual((await w.nbFor('phrases/phrase_099').cells()).cells, [], 'an unrelated tab lists none');
});

test('RE-RUN writes the transform phrase again from the cell: a hand edit of it is gone, a deleted one is made again at the same path; the evidence line says which', async () => {
  const w = world();
  await w.nb.run({ bars: [3, 4, 5], row: 'kick' }, 'thin_out', 0.5);
  const original = w.files.get('phrases/phrase_007.md')!;
  w.files.set('phrases/phrase_007.md', original.replace('"amount": 0.5', '"amount": 0.9'));
  const cell = (await w.nb.cells()).cells[0];
  const res = await w.nb.rerun(cell);
  assert.deepEqual(res, { ok: true, phrasePath: 'phrases/phrase_007.md', remade: false });
  assert.equal(w.files.get('phrases/phrase_007.md'), original);
  assert.equal(w.lines.at(-1), '[forge-notebook] reran cell_001 -> phrases/phrase_007.md');
  w.files.delete('phrases/phrase_007.md');
  const again = await w.nb.rerun(cell);
  assert.deepEqual(again, { ok: true, phrasePath: 'phrases/phrase_007.md', remade: true });
  assert.equal(w.files.get('phrases/phrase_007.md'), original);
  assert.equal(w.lines.at(-1), '[forge-notebook] reran cell_001 -> phrases/phrase_007.md (made again)');
  assert.deepEqual(w.opened, ['phrases/phrase_007.md'], 'Re-run does not open a tab: the Score redraws from the note');
});

test('DELETE CELL removes the phrase it made and the cell, never the source; the evidence line names both; a failure leaves the cell and says why', async () => {
  const w = world();
  await w.nb.run({ bars: [3], row: null }, 'thin_out', 0.5);
  const sourceBefore = w.files.get('phrases/phrase_006.md');
  const cell = (await w.nb.cells()).cells[0];
  const res = await w.nb.deleteCell(cell);
  assert.deepEqual(res, { ok: true });
  assert.ok(!w.files.has('phrases/phrase_007.md') && !w.files.has('notebook/cell_001.md'));
  assert.deepEqual(w.removed, ['phrases/phrase_007.md', 'notebook/cell_001.md'], 'the derived phrase first, then the cell');
  assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore);
  assert.equal(w.lines.at(-1), '[forge-notebook] deleted cell_001 (phrases/phrase_007.md)');
  assert.ok(w.files.has('notebook/README.md'), 'the README is not a cell');
  const stuck = world({ failRemove: 'phrases/phrase_007.md' });
  await stuck.nb.run({ bars: [3], row: null }, 'thin_out', 0.5);
  const c2 = (await stuck.nb.cells()).cells[0];
  const failed = await stuck.nb.deleteCell(c2);
  assert.equal(failed.ok, false);
  assert.match((failed as { message: string }).message, /Could not delete cell_001: locked/);
  assert.ok(stuck.files.has('notebook/cell_001.md') && stuck.files.has('phrases/phrase_007.md'), 'nothing half-deleted');
});

test('DELETE of a cell whose phrase is already gone still removes the cell', async () => {
  const w = world();
  await w.nb.run({ bars: [3], row: null }, 'thin_out', 0.5);
  w.files.delete('phrases/phrase_007.md');
  const cell = (await w.nb.cells()).cells[0];
  assert.deepEqual(await w.nb.deleteCell(cell), { ok: true });
  assert.ok(!w.files.has('notebook/cell_001.md'));
});
