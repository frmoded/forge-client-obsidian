// 2026-10-27-1030 (M14 slice 1): the notebook on the phrase tab, on the surface a person uses: happy-dom, the real mountPhrase + live Score area + the real notebook (core and DOM) over an in-memory vault. Proves it is connected:
// it sits BELOW the Score and learns the Score's bars and rows from what the engine drew; Run makes the transform phrase and the cell in the vault and lists the cell; a click in the notebook is NOT a pin gesture (the 1800 rule: the
// pin and the notes pane are untouched); a tab without the port is exactly what it was (P3); a transform tab shows its read-only strip, draws from its source, and lists the cell that made it. Host-faithful clock: the shared fake.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from './phrase-dom.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { createNotebook, readCellNote } from './notebook-core.ts';
import { installHostClock } from './test-support/host-workspace.ts';

const PATH = 'phrases/phrase_006.md';
const BAR = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) } })}\n\`\`\`\n`;
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 };
const TRANSFORM: PhraseParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] };
const xmlFor = (bars: number) => {
  const part = (p: number) => `<part id="P${p}">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><note><rest/><duration>16</duration></note></measure>`).join('')}</part>`;
  return `<score-partwise>${part(1)}${part(2)}</score-partwise>`;
};
const barOf = (n: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100 - n, channels: { kick: Array(16).fill(false), snare: Array(16).fill(false) } });

const win: any = new Window({ url: 'http://localhost/' });

async function rig(opts: { path?: string; phrase?: PhraseParams; withNotebook?: boolean; inspector?: boolean; extraFiles?: Record<string, string> } = {}) {
  const clock = installHostClock(win);
  const path = opts.path ?? PATH;
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const files = new Map<string, string>([['bars/bar_005.md', BAR], [PATH, noteContentFor('phrase_006', EXTEND)], ['notebook/README.md', 'Notebook.'], ...Object.entries(opts.extraFiles ?? {})]);
  if (opts.phrase) files.set(path, noteContentFor(path.replace(/^phrases\//, '').replace(/\.md$/, ''), opts.phrase));
  const lines: string[] = []; const opened: string[] = []; const pins: unknown[] = []; const computes: string[] = []; const asked: unknown[] = [];
  const notebook = createNotebook<string>({
    sourcePhrase: path.replace(/\.md$/, ''),
    activePath: () => path,
    folderExists: (f) => [...files.keys()].some((p) => p.startsWith(`${f}/`)),
    createFolder: async () => {},
    listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    listCellPaths: () => [...files.keys()].filter((p) => p.startsWith('notebook/')),
    exists: (p) => files.has(p),
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    create: async (p, c) => { if (files.has(p)) throw new Error('File already exists.'); files.set(p, c); return p; },
    write: async (p, c) => { files.set(p, c); },
    remove: async (p) => { files.delete(p); },
    open: async (f) => { opened.push(f); },
    notify: () => {},
    isAlreadyExists: (e) => /already exists/.test(String((e as Error).message)),
    trace: (l) => { lines.push(l); },
    ask: async (payload) => { asked.push(payload); return { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5, keep: 'downbeat' }, error: null } }; },
    listBarBasenames: () => [...files.keys()].filter((p) => p.startsWith('bars/')).map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
  });
  const ports: PhraseMountPorts = {
    path, title: path.replace(/^phrases\//, '').replace(/\.md$/, ''), plan: 'score',
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    writePhrase: async () => ({ ok: true }),
    compute: async (data: any, params) => {
      computes.push(params.kind);
      const bars = params.kind === 'transform' ? data.bars : Array.from({ length: (params as any).bars ?? 8 }, (_, i) => barOf(i));
      return { type: 'musicxml', content: xmlFor(bars.length), multi_staff_content: xmlFor(bars.length), kit_content: xmlFor(bars.length), bars_data: bars };
    },
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+"(?: id="([^"]+)")?>/g)].map((m) => m[1] ?? '');
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure"${id ? ` id="${id}"` : ''}><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number,         // the shared host clock's (test-support/host-workspace.ts): nothing sleeps
    clearTimer: (h) => (globalThis as any).clearTimeout(h),
    now: () => 0,
    inspector: opts.inspector === false ? undefined : { openNote: (id) => { opened.push(id); }, onPin: (p) => { pins.push(p); } },
    notebook: opts.withNotebook === false ? undefined : { notebook, trace: (l) => lines.push(l), openPhrase: (p) => opened.push(p) },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load();
  await clock.advance(400);
  const q = (s: string) => parent.querySelector(s) as any;
  const qa = (s: string) => [...parent.querySelectorAll(s)] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  return { handle, parent, files, lines, opened, pins, computes, asked, q, qa, click, clock, done: () => { handle.dispose(); clock.restore(); } };
}

test('the notebook sits BELOW the Score, and learns the Score\'s bars and rows from what the engine drew', async () => {
  const r = await rig();
  try {
    const order = [...r.parent.children].map((c: any) => c.className.split(' ')[0]);
    assert.ok(order.indexOf('forge-notebook') > order.indexOf('forge-rhythm-edit-score') && order.indexOf('forge-rhythm-edit-score') >= 0, order.join(','));
    assert.equal(r.qa('.forge-notebook-bar').length, 8, 'one box per bar of the 8-bar Score');
    assert.deepEqual(r.qa('.forge-notebook-rows button').map((b: any) => b.textContent), ['all', 'kick', 'snare']);
  } finally { r.done(); }
});

test('P3: a tab without the notebook port has no notebook at all, and is the tab it was', async () => {
  const r = await rig({ withNotebook: false });
  try {
    assert.equal(r.parent.querySelector('.forge-notebook'), null);
    assert.ok(r.q('.forge-rhythm-edit-score'));
    assert.doesNotThrow(() => r.handle.refreshNotebook());
  } finally { r.done(); }
});

test('RUN: select bars 3 to 5 and the kick row, thin out -> the transform phrase and the cell are in the vault, the cell is listed, the new phrase is opened, the evidence lines are said', async () => {
  const r = await rig();
  try {
    r.click(r.qa('.forge-notebook-bar')[2]); r.click(r.qa('.forge-notebook-bar')[4], { shiftKey: true });
    r.click(r.qa('.forge-notebook-rows button').find((b: any) => b.textContent === 'kick'));
    assert.deepEqual(r.qa('.forge-notebook-chips .forge-notebook-chip').map((c: any) => c.textContent), ['bars 3 to 5, kick row']);
    r.click(r.q('.forge-notebook-run'));
    await r.clock.advance(50);
    assert.ok(r.files.has('phrases/phrase_007.md') && r.files.has('notebook/cell_001.md'));
    const phrase = r.files.get('phrases/phrase_007.md')!;
    assert.match(phrase, /"kind": "transform"/);
    assert.match(phrase, /\{"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5\}/);
    const cell = readCellNote(r.files.get('notebook/cell_001.md')!, 'notebook/cell_001.md');
    assert.ok(cell.ok && cell.cell.selection === 'bars 3 to 5, kick row');
    assert.deepEqual(r.opened, ['phrases/phrase_007.md']);
    assert.equal(r.qa('.forge-notebook-cell').length, 1);
    assert.equal(r.q('.forge-notebook-cell .forge-notebook-chip').textContent, 'bars 3 to 5, kick row');
    assert.deepEqual(r.lines.filter((l) => l.startsWith('[forge-notebook]')), [
      '[forge-notebook] selection bar 3', '[forge-notebook] selection bars 3 to 5', '[forge-notebook] selection bars 3 to 5, kick row',
      '[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md',
    ]);
  } finally { r.done(); }
});

test('DELETE CELL: the derived phrase and the cell go, the source phrase and its bars are untouched, the list is empty again', async () => {
  const r = await rig();
  try {
    const sourceBefore = r.files.get(PATH);
    r.click(r.qa('.forge-notebook-bar')[0]);
    r.click(r.q('.forge-notebook-run')); await r.clock.advance(50);
    assert.equal(r.qa('.forge-notebook-cell').length, 1);
    r.click(r.q('.forge-notebook-delete')); await r.clock.advance(50);
    assert.ok(!r.files.has('phrases/phrase_007.md') && !r.files.has('notebook/cell_001.md'));
    assert.equal(r.files.get(PATH), sourceBefore);
    assert.equal(r.qa('.forge-notebook-cell').length, 0);
    assert.ok(r.lines.some((l) => l === '[forge-notebook] deleted cell_001 (phrases/phrase_007.md)'));
  } finally { r.done(); }
});

test('THE 1800 RULE: clicking the notebook (a bar box, a row, Run) is not a pin gesture: a pinned bar stays pinned and the notes pane is told nothing', async () => {
  const r = await rig();
  try {
    r.click(r.q('#ph_bar_3'));
    const told = r.pins.length;
    assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3']);
    r.click(r.qa('.forge-notebook-bar')[5]);
    r.click(r.qa('.forge-notebook-rows button')[1]);
    r.click(r.q('.forge-notebook-run')); await r.clock.advance(50);
    r.click(r.q('summary.forge-notebook-summary'));
    assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3'], 'still pinned');
    assert.equal(r.pins.length, told, 'the notes pane heard nothing');
    r.q('.forge-rhythm-score-host').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(r.pins.at(-1), null, 'Esc still lets go, as before');
  } finally { r.done(); }
});

test('THE 1800 RULE for the request box: clicking it, typing in it, pressing Enter and Run with a sentence are not pin gestures either: a pinned bar stays pinned, the notes pane is told nothing, and the cell lists with its sentence', async () => {
  const r = await rig();
  try {
    r.click(r.q('#ph_bar_3'));
    const told = r.pins.length;
    assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3']);
    r.click(r.qa('.forge-notebook-bar')[2]); r.click(r.qa('.forge-notebook-bar')[4], { shiftKey: true });
    r.click(r.q('.forge-notebook-request'));
    const box = r.q('.forge-notebook-request');
    box.value = 'make this half as busy, keep the downbeat'; box.dispatchEvent(new win.Event('input', { bubbles: true }));
    box.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await r.clock.advance(50);
    assert.equal(r.asked.length, 1, 'Enter asked the service once');
    assert.deepEqual((r.asked[0] as any).selection, { phrase: 'phrases/phrase_006', first: 3, last: 5 });
    assert.equal(r.qa('.forge-notebook-cell').length, 1, 'the cell is listed');
    assert.equal(r.q('.forge-notebook-said').textContent, '“make this half as busy, keep the downbeat”');
    assert.deepEqual(r.qa('.forge-artifact-pinned').map((e: any) => e.id), ['ph_bar_3'], 'still pinned');
    assert.equal(r.pins.length, told, 'the notes pane heard nothing');
    assert.ok(r.lines.includes('[forge-notebook] asked "make this half as busy, keep the downbeat" -> thin_out'));
  } finally { r.done(); }
});

test('a transform tab: the read-only strip, no controls, the Score drawn from its source\'s bars, the structure of the bars known, and the cell that made it listed as such', async () => {
  const cell = (await import('./notebook-core.ts')).cellNoteContent({ id: 'cell_001', source: 'phrases/phrase_006', result: 'phrases/phrase_007', selection: 'bars 3 to 5, kick row', ops: TRANSFORM.kind === 'transform' ? TRANSFORM.ops : [] });
  const r = await rig({ path: 'phrases/phrase_007.md', phrase: TRANSFORM, extraFiles: { 'notebook/cell_001.md': cell } });
  try {
    assert.ok(r.q('.forge-transform-strip'));
    assert.equal(r.q('button.forge-phrase-source').textContent, 'phrase_006');
    assert.equal(r.parent.querySelectorAll('.forge-phrase-controls input, .forge-phrase-controls select').length, 0);
    assert.equal(r.qa('g.measure').length, 8, 'drawn from the source\'s eight bars');
    assert.ok(r.computes.includes('transform') && r.computes.includes('extend'), r.computes.join(','));
    assert.equal(r.parent.querySelector('.forge-phrase-bracket'), null, 'no bracket');
    assert.equal(r.qa('.forge-artifact-pinned').length, 0);
    assert.equal(r.qa('.forge-notebook-cell')[0].getAttribute('data-role'), 'result');
    assert.equal(r.q('.forge-notebook-cell .forge-notebook-cell-head').textContent, 'cell 1 · made this phrase from:');
    r.click(r.q('button.forge-phrase-source'));
    assert.deepEqual(r.opened, ['phrases/phrase_006']);
  } finally { r.done(); }
});

test('the transform redraws when its SOURCE phrase changes; a change in notebook/ re-reads the cells and redraws nothing', async () => {
  const r = await rig({ path: 'phrases/phrase_007.md', phrase: TRANSFORM });
  try {
    const before = r.computes.filter((k) => k === 'transform').length;
    r.files.set(PATH, noteContentFor('phrase_006', { ...EXTEND, bars: 6 }));
    r.handle.noteModified(PATH); await r.clock.advance(400);
    assert.ok(r.computes.filter((k) => k === 'transform').length > before, 'the source changed: the transform is drawn again');
    assert.equal(r.qa('g.measure').length, 6);
    const n = r.computes.length;
    r.handle.noteModified('notebook/cell_007.md'); await r.clock.advance(400);
    assert.equal(r.computes.length, n, 'a cell changed: the Score is not asked again');
  } finally { r.done(); }
});
