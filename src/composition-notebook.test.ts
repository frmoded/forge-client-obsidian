// 2026-11-05-1183 (M17c, design 4.13/4.14) - the notebook below a COMPOSITION's Score: the same component the phrase tabs use, with the composition's own selection source. Three layers, each without Obsidian:
//   * the chip text of a selection (pure): "bars 3-4 of section 2 ([[arr_001]])", a whole section, a repeated section's pass, a selection across sections, the row, the plainer fallback;
//   * the REAL notebook DOM (happy-dom) given that chip: clicking bar numbers shows the section chip, nothing else about the component changed;
//   * the REAL notebook core against in-memory ports and a stub service (never the network): the op picker and the typed request run on a selection of a composition; the plan input names the composition and the bars; the result is
//     a NEW transform phrase and a cell, the composition's note is never written; a request the service cannot do writes nothing and says so.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { compositionSelectionChip, sectionOfBar, type ShapeSection } from './composition-notebook-core.ts';
import { createNotebook, readCellNote, selectionChip, type NotebookPorts, type Selection } from './notebook-core.ts';
import { mountNotebook } from './notebook-dom.ts';
import { readPhraseNote, type TransformPhrase } from './phrase-core.ts';
import type { PlanPayload } from './sentence-plan-core.ts';

/** intro = [phrase_003 (4 bars), arr_001 (4 bars), arr_001 again (a repeat: pass 2)]: section 1 = bars 1-4, section 2 = bars 5-8 (pass 1) and 9-12 (pass 2). */
const SHAPE: ShapeSection[] = [
  { index: 0, copy: 0, source: 'phrases/phrase_003', bars: 4, first: 1 },
  { index: 1, copy: 0, source: 'arrangements/arr_001', bars: 4, first: 5 },
  { index: 1, copy: 1, source: 'arrangements/arr_001', bars: 4, first: 9 },
];
const SEL = (bars: number[], row: string | null = null): Selection => ({ bars, row });

// ---- the chip text (pure) ----------------------------------------------------------------------------------------------------------------------------------

test('a bar of section 1 and a bar of section 2: the chip names the section and its note, with the composition\'s own bar numbers', () => {
  assert.equal(compositionSelectionChip(SEL([2, 3]), SHAPE), 'bars 2-3 of section 1 ([[phrase_003]])');
  assert.equal(compositionSelectionChip(SEL([2]), SHAPE), 'bar 2 of section 1 ([[phrase_003]])');
  assert.equal(compositionSelectionChip(SEL([6, 7]), SHAPE), 'bars 6-7 of section 2, pass 1 ([[arr_001]])', 'a section played twice says which pass');
  assert.equal(compositionSelectionChip(SEL([6]), [SHAPE[0], SHAPE[1]]), 'bar 6 of section 2 ([[arr_001]])', 'a section played once has no pass');
  assert.equal(compositionSelectionChip(SEL([5, 6, 7]), [SHAPE[0], SHAPE[1]]), 'bars 5-7 of section 2 ([[arr_001]])');
});

test('a whole section is named as the section; a selection across sections is one part per section; a gap in a section is two runs', () => {
  assert.equal(compositionSelectionChip(SEL([5, 6, 7, 8]), [SHAPE[0], SHAPE[1]]), 'section 2 ([[arr_001]])');
  assert.equal(compositionSelectionChip(SEL([1, 2, 3, 4]), SHAPE), 'section 1 ([[phrase_003]])');
  assert.equal(compositionSelectionChip(SEL([3, 4, 5, 6]), [SHAPE[0], SHAPE[1]]), 'bars 3-4 of section 1 ([[phrase_003]]); bars 5-6 of section 2 ([[arr_001]])');
  assert.equal(compositionSelectionChip(SEL([1, 3, 4]), SHAPE), 'bars 1, 3-4 of section 1 ([[phrase_003]])');
  assert.equal(compositionSelectionChip(SEL([8, 9]), SHAPE), 'bar 8 of section 2, pass 1 ([[arr_001]]); bar 9 of section 2, pass 2 ([[arr_001]])');
});

test('the row comes last; nothing selected is no chip; a shape that does not cover a selected bar falls back to the phrase tab\'s own chip text', () => {
  assert.equal(compositionSelectionChip(SEL([2, 3], 'kick'), SHAPE), 'bars 2-3 of section 1 ([[phrase_003]]), kick row');
  assert.equal(compositionSelectionChip(SEL([3, 4, 5], 'kick'), [SHAPE[0], SHAPE[1]]), 'bars 3-4 of section 1 ([[phrase_003]]); bar 5 of section 2 ([[arr_001]]), kick row');
  assert.equal(compositionSelectionChip(SEL([]), SHAPE), null);
  assert.equal(compositionSelectionChip(SEL([3, 4], 'kick'), []), 'bars 3 to 4, kick row', 'no Score yet: the plainer text, never a wrong section');
  assert.equal(compositionSelectionChip(SEL([3, 99]), SHAPE), selectionChip(SEL([3, 99])));
});

test('sectionOfBar: the section whose bars cover it, the edges included, else null', () => {
  assert.equal(sectionOfBar(SHAPE, 1)?.index, 0); assert.equal(sectionOfBar(SHAPE, 4)?.index, 0);
  assert.equal(sectionOfBar(SHAPE, 5)?.index, 1); assert.equal(sectionOfBar(SHAPE, 12)?.copy, 1);
  assert.equal(sectionOfBar(SHAPE, 0), null); assert.equal(sectionOfBar(SHAPE, 13), null);
});

// ---- the REAL notebook DOM with the composition's chip ------------------------------------------------------------------------------------------------------------

function dom(chip?: (s: Selection) => string | null) {
  const win: any = new Window({ url: 'http://localhost/' });
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const nb = { run: async () => ({ ok: false as const, message: 'x' }), runRequest: async () => ({ ok: false as const, message: 'x' }), cells: async () => ({ cells: [], problems: [] }), rerun: async () => ({ ok: false as const, message: 'x' }), deleteCell: async () => ({ ok: false as const, message: 'x' }) };
  const told: Selection[] = [];
  const handle = mountNotebook(parent, { notebook: nb as never, trace: () => {}, onSelection: (s) => told.push(s), ...(chip ? { chip } : {}) });
  handle.setScore({ count: 8, rows: ['kick', 'snare'] });
  const bars = () => [...parent.querySelectorAll('.forge-notebook-bar')] as any[];
  const chips = () => [...parent.querySelectorAll('.forge-notebook-chips .forge-notebook-chip')].map((c: any) => c.textContent);
  const click = (el: any, shift = false) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, shiftKey: shift }));
  return { parent, handle, bars, chips, click, told, win };
}

test('the notebook DOM: with the composition\'s chip, picking bar numbers shows the section chip; Shift-click extends; the row joins; Esc clears; the Run button follows the chip', () => {
  const chip = (s: Selection) => compositionSelectionChip(s, [SHAPE[0], SHAPE[1]]);
  const d = dom(chip);
  assert.deepEqual(d.chips(), []);
  d.click(d.bars()[2]);                                    // bar 3
  assert.deepEqual(d.chips(), ['bar 3 of section 1 ([[phrase_003]])']);
  d.click(d.bars()[5], true);                              // Shift-click bar 6: bars 3..6
  assert.deepEqual(d.chips(), ['bars 3-4 of section 1 ([[phrase_003]]); bars 5-6 of section 2 ([[arr_001]])']);
  d.click([...d.parent.querySelectorAll('.forge-notebook-row')].find((b: any) => b.textContent === 'kick'));
  assert.deepEqual(d.chips(), ['bars 3-4 of section 1 ([[phrase_003]]); bars 5-6 of section 2 ([[arr_001]]), kick row']);
  assert.equal((d.parent.querySelector('.forge-notebook-run') as any).disabled, false);
  assert.deepEqual(d.told.at(-1), { bars: [3, 4, 5, 6], row: 'kick' });
  d.parent.dispatchEvent(new d.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.deepEqual(d.chips(), []);
  assert.equal((d.parent.querySelector('.forge-notebook-run') as any).disabled, true);
});

test('the notebook DOM: a drag on the Score (selectRange) shows the right chip for bars of section 2; with NO chip port it is exactly the phrase tab\'s ("bars 3 to 5")', () => {
  const d = dom((s) => compositionSelectionChip(s, [SHAPE[0], SHAPE[1]]));
  d.handle.selectRange(6, 7);
  assert.deepEqual(d.chips(), ['bars 6-7 of section 2 ([[arr_001]])']);
  const phrase = dom();
  phrase.handle.selectRange(3, 5);
  assert.deepEqual(phrase.chips(), ['bars 3 to 5'], 'a phrase tab passes no chip: byte-identical');
});

test('the notebook DOM asks the chip PORT whether anything is selected: a chip that says nothing leaves Run disabled, and a Run click that arrives anyway does nothing', async () => {
  const d = dom(() => null);
  d.click(d.bars()[2]);
  const run = d.parent.querySelector('.forge-notebook-run') as any;
  assert.equal(run.disabled, true);
  run.disabled = false;                       // a click that arrives anyway (the guard is the only defence now)
  run.dispatchEvent(new d.win.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((d.parent.querySelector('.forge-notebook-message') as any).textContent, '', 'no "Running...", no answer: nothing was run');
});

// ---- the REAL notebook core on a composition ---------------------------------------------------------------------------------------------------------------------

type Answer = { status: number; json: unknown };
const COMPOSITION = '---\ntype: data\ncontent_type: json\n---\n\n```json\n{ "kind": "composition", "sections": [{ "source": "phrases/phrase_003" }, { "source": "arrangements/arr_001" }] }\n```\n';
const THIN_HALF: Answer = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5, keep: 'downbeat' }, error: null } };

function world(over: { answer?: Answer } = {}) {
  const files = new Map<string, string>([
    ['compositions/intro.md', COMPOSITION], ['phrases/phrase_003.md', '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n'], ['arrangements/arr_001.md', ''], ['bars/bar_005.md', ''], ['bars/bar_007.md', ''], ['notebook/README.md', 'Notebook.'],
  ]);
  const asked: PlanPayload[] = []; const notices: string[] = []; const opened: string[] = []; const writes: string[] = [];
  const chip = (s: Selection) => compositionSelectionChip(s, [SHAPE[0], SHAPE[1]]);
  const ports: NotebookPorts<string> = {
    sourcePhrase: 'compositions/intro', chip,
    activePath: () => 'compositions/intro.md',
    folderExists: (f) => [...files.keys()].some((p) => p.startsWith(`${f}/`)),
    createFolder: async () => {},
    listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    listCellPaths: () => [...files.keys()].filter((p) => p.startsWith('notebook/') && p.endsWith('.md')),
    exists: (p) => files.has(p),
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    create: async (p, c) => { writes.push(p); if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); return p; },
    write: async (p, c) => { writes.push(p); files.set(p, c); },
    remove: async (p) => { files.delete(p); },
    open: async (f) => { opened.push(f); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: (e) => /already exists/.test(String((e as Error).message)),
    trace: () => {},
    ask: async (payload) => { asked.push(payload); return over.answer ?? THIN_HALF; },
    ownKey: () => undefined,
    listBarBasenames: () => [...files.keys()].filter((p) => p.startsWith('bars/')).map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
    serviceVersion: async () => '0.2.45',
  };
  return { nb: createNotebook(ports), files, asked, notices, opened, writes };
}
const NEW_NOTES = (w: ReturnType<typeof world>) => [...w.files.keys()].filter((p) => /^(phrases\/phrase_00[4-9]|notebook\/cell_)/.test(p)).sort();

test('the op picker on bars 3-6 of a composition (two sections): a NEW transform phrase whose source is the composition, one op per run, a cell that says which sections, the new phrase opened; the composition is never written', async () => {
  const w = world();
  const res = await w.nb.run(SEL([3, 4, 5, 6], 'kick'), 'thin_out', 0.5);
  assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_004.md' });
  const phrase = readPhraseNote(w.files.get('phrases/phrase_004.md')!);
  assert.ok(phrase.ok);
  if (!phrase.ok) return;
  const t = phrase.value as TransformPhrase;
  assert.equal(t.kind, 'transform');
  assert.equal(t.source, 'compositions/intro', 'the source is the composition\'s own bars');
  assert.deepEqual(t.ops.map((o) => [o.op, o.first, o.last, o.row]), [['thin_out', 3, 6, 'kick']], 'a run of consecutive bars across the section edge is ONE op on the composition\'s bar numbers');
  const cell = readCellNote(w.files.get('notebook/cell_001.md')!, 'notebook/cell_001.md');
  assert.ok(cell.ok, cell.ok ? '' : cell.message);
  if (cell.ok) { assert.equal(cell.cell.source, 'compositions/intro'); assert.equal(cell.cell.selection, 'bars 3-4 of section 1 ([[phrase_003]]); bars 5-6 of section 2 ([[arr_001]]), kick row'); assert.equal(cell.cell.result, 'phrases/phrase_004'); }
  assert.deepEqual(w.opened, ['phrases/phrase_004.md'], 'the transform opens as the next Score');
  assert.equal(w.files.get('compositions/intro.md'), COMPOSITION, 'the composition\'s sections stay exactly as written');
  assert.ok(!w.writes.some((p) => p.startsWith('compositions/')), 'nothing is ever written to the composition');
});

test('a selection with a gap makes one op per run, each on the composition\'s own numbers', async () => {
  const w = world();
  await w.nb.run(SEL([1, 2, 7, 8]), 'double_up', 16);
  const t = readPhraseNote(w.files.get('phrases/phrase_004.md')!) as { ok: true; value: TransformPhrase };
  assert.deepEqual(t.value.ops.map((o) => [o.op, o.first, o.last]), [['double_up', 1, 2], ['double_up', 7, 8]]);
});

test('the cells of a composition tab: the cell it made is listed as ITS cell (role "source"); a cell made from a PHRASE is not', async () => {
  const w = world();
  await w.nb.run(SEL([6, 7]), 'thin_out', 0.5);
  w.files.set('notebook/cell_009.md', w.files.get('notebook/cell_001.md')!.replace(/compositions\/intro/g, 'phrases/phrase_003').replace('cell_001', 'cell_009'));
  const { cells, problems } = await w.nb.cells();
  assert.deepEqual(cells.map((c) => [c.id, c.role, c.source]), [['cell_001', 'source', 'compositions/intro']]);
  assert.deepEqual(problems, []);
});

test('the typed request: the service is asked ONCE with the selection naming the composition and the first run\'s bars and the row; its answer becomes the same ops; the cell\'s Description is the sentence', async () => {
  const w = world();
  const res = await w.nb.runRequest(SEL([6, 7, 8], 'snare'), 'make this half as busy');
  assert.equal(res.ok, true);
  assert.equal(w.asked.length, 1);
  assert.deepEqual(w.asked[0], { sentence: 'make this half as busy', bars: ['bar_005', 'bar_007'], phrases: ['phrase_003'], selection: { phrase: 'compositions/intro', first: 6, last: 8, row: 'snare' } });
  const t = readPhraseNote(w.files.get('phrases/phrase_004.md')!) as { ok: true; value: TransformPhrase };
  assert.equal(t.value.source, 'compositions/intro');
  assert.deepEqual(t.value.ops.map((o) => [o.op, o.first, o.last, o.row]), [['thin_out', 6, 8, 'snare']]);
  assert.match(w.files.get('notebook/cell_001.md')!, /\n# Description\n\n“make this half as busy”\n/);
  assert.equal(w.files.get('compositions/intro.md'), COMPOSITION);
});

test('a request the service cannot do (a refusal, a phrase instead of an operation, a transport failure) changes NOTHING and says why', async () => {
  for (const answer of [
    { status: 200, json: { ok: false, parsed_ok: false, plan: null, error: 'I can only thin out or double up bars.' } },
    { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', source: 'bar_005', bars: 8 }, error: null } },
    { status: 500, json: {} },
  ] as Answer[]) {
    const w = world({ answer });
    const before = new Map(w.files);
    const res = await w.nb.runRequest(SEL([6, 7]), 'play it backwards');
    assert.equal(res.ok, false);
    assert.deepEqual(NEW_NOTES(w), [], 'no transform, no cell');
    assert.deepEqual([...w.files], [...before], 'not one byte changed');
    assert.equal(w.notices.length, 1, 'one sentence says so');
    assert.ok(w.notices[0].length > 10);
    assert.deepEqual(w.opened, []);
  }
});

test('nothing selected: nothing is asked and nothing is written', async () => {
  const w = world();
  const res = await w.nb.runRequest(SEL([]), 'make this half as busy');
  assert.equal(res.ok, false);
  assert.equal(w.asked.length, 0);
  assert.deepEqual(NEW_NOTES(w), []);
});
