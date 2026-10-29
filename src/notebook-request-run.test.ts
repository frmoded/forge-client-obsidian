// 2026-10-27-0720 (M14 slice 2): Run with a TYPED REQUEST, the notebook core against a stub service (never the network): the sentence goes to /plan with the SELECTION, the answer becomes the same ops the op picker makes, and the phrase and the cell are
// written by the one write path Run has always used; the cell's Description is the sentence; Re-run never asks again; Delete cell undoes it; every refusal writes nothing. The service, the vault, the tab and the Notice are ports.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cellNoteContent, createNotebook, readCellNote, type NotebookPorts, type Selection } from './notebook-core.ts';
import { OLD_SERVICE } from './notebook-request-core.ts';
import { readPhraseNote, type TransformOp } from './phrase-core.ts';
import type { PlanPayload } from './sentence-plan-core.ts';

type Answer = { status: number; json: unknown };
const THIN_HALF: Answer = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5, keep: 'downbeat' }, error: null } };
const SEL: Selection = { bars: [3, 4, 5], row: 'kick' };

function world(over: { answer?: Answer | (() => Promise<Answer>); version?: string | null | (() => Promise<string | null>); noAsk?: boolean; key?: string; raceCell?: 'once' | 'always'; failPhraseCreate?: boolean; failRemove?: string; cellsTaken?: boolean; folderFails?: boolean; noPhrasesFolder?: boolean } = {}) {
  const files = new Map<string, string>([['notebook/README.md', 'Notebook.'], ['phrases/phrase_006.md', '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n'], ['bars/bar_001.md', ''], ['bars/bar_005.md', ''], ['bars/README.md', '']]);
  const folders: string[] = []; const creates: string[] = []; const lines: string[] = []; const notices: string[] = []; const opened: string[] = []; const asked: PlanPayload[] = []; const versions: string[] = []; const removed: string[] = [];
  const ports: NotebookPorts<string> = {
    sourcePhrase: 'phrases/phrase_006',
    activePath: () => 'phrases/phrase_006.md',
    folderExists: (f) => !(over.noPhrasesFolder && f === 'phrases') && [...files.keys()].some((p) => p.startsWith(`${f}/`)),
    createFolder: async (f) => { folders.push(f); if (over.folderFails) throw new Error('read-only'); },
    listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    listCellPaths: () => [...files.keys()].filter((p) => p.startsWith('notebook/') && p.endsWith('.md')),
    exists: (p) => files.has(p) || (over.cellsTaken === true && p.startsWith('notebook/cell_')),
    read: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    create: async (p, c) => {
      creates.push(p);
      if (over.failPhraseCreate && p.startsWith('phrases/')) throw new Error('disk full');
      if (over.raceCell === 'always' && p.startsWith('notebook/cell_')) throw new Error('File already exists.');                    // another writer took every name between the listing and the write
      if (over.raceCell === 'once' && p.startsWith('notebook/cell_') && !files.has(p)) { over.raceCell = undefined; files.set(p, 'someone else\'s'); }
      if (files.has(p)) throw new Error('File already exists.');
      files.set(p, c); return p;
    },
    write: async (p, c) => { files.set(p, c); },
    remove: async (p) => { if (over.failRemove === p) throw new Error('locked'); files.delete(p); removed.push(p); },
    open: async (f) => { opened.push(f); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: (e) => /already exists/.test(String((e as Error).message)),
    trace: (l) => { lines.push(l); },
    ...(over.noAsk ? {} : { ask: async (payload: PlanPayload) => { asked.push(payload); const a = over.answer ?? THIN_HALF; return typeof a === 'function' ? a() : a; } }),
    ownKey: () => over.key,
    listBarBasenames: () => [...files.keys()].filter((p) => p.startsWith('bars/')).map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
    serviceVersion: async () => { versions.push('asked'); const v = over.version === undefined ? null : over.version; return typeof v === 'function' ? v() : v; },
  };
  if (over.folderFails) files.delete('notebook/README.md');                              // no notebook/ folder: Run has to make it, and that fails
  const snapshot = () => new Map(files);
  return { nb: createNotebook(ports), files, lines, notices, opened, asked, versions, removed, snapshot, creates, folders };
}
const nothingWritten = (w: ReturnType<typeof world>) => assert.ok(![...w.files.keys()].some((p) => p === 'phrases/phrase_007.md' || p.startsWith('notebook/cell_')), 'no phrase, no cell');

test('select bars 3 to 5 and the kick row, type "make this half as busy, keep the downbeat", Run: the SAME phrase the op picker makes, a cell whose Description is the sentence, the tab opened; the service was asked ONCE with the selection', async () => {
  const w = world();
  const res = await w.nb.runRequest(SEL, 'make this half as busy, keep the downbeat');
  assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_001.md', phrasePath: 'phrases/phrase_007.md' });
  assert.equal(w.asked.length, 1);
  assert.deepEqual(w.asked[0], { sentence: 'make this half as busy, keep the downbeat', bars: ['bar_001', 'bar_005'], phrases: ['phrase_006'], selection: { phrase: 'phrases/phrase_006', first: 3, last: 5, row: 'kick' } });
  const viaPicker = world();
  await viaPicker.nb.run(SEL, 'thin_out', 0.5);
  assert.equal(w.files.get('phrases/phrase_007.md'), viaPicker.files.get('phrases/phrase_007.md'), 'byte for byte the phrase the picker makes for the same op');
  const read = readPhraseNote(w.files.get('phrases/phrase_007.md')!);
  assert.ok(read.ok && read.value.kind === 'transform');
  if (read.ok && read.value.kind === 'transform') assert.deepEqual(read.value.ops, [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }]);
  const cell = w.files.get('notebook/cell_001.md')!;
  assert.match(cell, /\n# Description\n\n“make this half as busy, keep the downbeat”\n/);
  assert.match(cell, /\ndescription: "make this half as busy, keep the downbeat"\n/);
  assert.match(cell, /\n# Recipe\n\nTake \[\[phrase_006\]\]\.\nThin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats\.\nThis makes \[\[phrase_007\]\]\.\n/);
  assert.match(cell, /"request": "make this half as busy, keep the downbeat",/);
  const back = readCellNote(cell, 'notebook/cell_001.md');
  assert.ok(back.ok && back.cell.request === 'make this half as busy, keep the downbeat' && back.cell.selection === 'bars 3 to 5, kick row');
  assert.deepEqual(w.opened, ['phrases/phrase_007.md']);
  assert.deepEqual(w.lines, ['[forge-notebook] asked "make this half as busy, keep the downbeat" -> thin_out', '[forge-notebook] ran cell_001: bars 3 to 5, kick row -> thin_out -> phrases/phrase_007.md']);
});

test('a scattered selection: the service is asked once (the first run), and the answer\'s op is laid over every run; one phrase, one op per run', async () => {
  const w = world();
  const res = await w.nb.runRequest({ bars: [2, 4, 5], row: null }, 'thin it out');
  assert.ok(res.ok);
  assert.equal(w.asked.length, 1);
  assert.deepEqual(w.asked[0].selection, { phrase: 'phrases/phrase_006', first: 2, last: 2 });
  const read = readPhraseNote(w.files.get('phrases/phrase_007.md')!);
  assert.ok(read.ok && read.value.kind === 'transform');
  if (read.ok && read.value.kind === 'transform') assert.deepEqual(read.value.ops, [{ op: 'thin_out', first: 2, last: 2, amount: 0.5 }, { op: 'thin_out', first: 4, last: 5, amount: 0.5 }]);
});

test('double it up: double_up with the grid the service says; the evidence line names the op', async () => {
  const w = world({ answer: { status: 200, json: { ok: true, plan: { kind: 'transform', op: 'double_up', grid: 16 } } } });
  assert.ok((await w.nb.runRequest({ bars: [1], row: 'snare' }, 'double the hits')).ok);
  const read = readPhraseNote(w.files.get('phrases/phrase_007.md')!);
  assert.ok(read.ok && read.value.kind === 'transform');
  if (read.ok && read.value.kind === 'transform') assert.deepEqual(read.value.ops, [{ op: 'double_up', first: 1, last: 1, row: 'snare', grid: 16 }]);
  assert.equal(w.lines[0], '[forge-notebook] asked "double the hits" -> double_up');
});

test('"make it jazzier" is refused in one sentence, the service\'s own: nothing is written, the Notice and the evidence line say it, no tab opens', async () => {
  const why = 'I can thin the hits out or double them up; I cannot make a bar jazzier.';
  const w = world({ answer: { status: 200, json: { ok: false, parsed_ok: true, plan: null, error: why } } });
  const before = w.snapshot();
  assert.deepEqual(await w.nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: why });
  assert.deepEqual(w.notices, [why]);
  assert.deepEqual(w.lines, [`[forge-notebook] asked "make it jazzier" -> refused: ${why}`]);
  assert.deepEqual([...w.files], [...before], 'the vault is exactly as it was');
  assert.deepEqual(w.opened, []);
  nothingWritten(w);
});

test('a selection the answer tries to override changes nothing: the bars and the row written are the person\'s', async () => {
  const w = world({ answer: { status: 200, json: { ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5, first: 1, last: 64, row: 'snare' } } } });
  assert.ok((await w.nb.runRequest(SEL, 'half as busy')).ok);
  const read = readPhraseNote(w.files.get('phrases/phrase_007.md')!);
  assert.ok(read.ok && read.value.kind === 'transform');
  if (read.ok && read.value.kind === 'transform') assert.deepEqual(read.value.ops, [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }]);
});

test('nothing selected asks for bars and never asks the service; an empty sentence is one sentence and nothing is sent', async () => {
  const w = world();
  assert.deepEqual(await w.nb.runRequest({ bars: [], row: null }, 'half as busy'), { ok: false, message: 'Select some bars first: click them in the bar list, Shift-click to extend.' });
  assert.deepEqual(w.lines, [], 'no bars: nothing was asked, so there is nothing to say in the evidence');
  assert.deepEqual(await w.nb.runRequest(SEL, '  '), { ok: false, message: 'Say what should happen to the selected bars, for example: make this half as busy.' });
  assert.deepEqual(await w.nb.runRequest(SEL, 'a'.repeat(501)), { ok: false, message: 'That sentence is 501 characters; the limit is 500. Make it shorter.' });
  assert.deepEqual(w.lines, ['[forge-notebook] asked "" -> refused: Say what should happen to the selected bars, for example: make this half as busy.', `[forge-notebook] asked "${'a'.repeat(80)}..." -> refused: That sentence is 501 characters; the limit is 500. Make it shorter.`]);
  assert.equal(w.notices.length, 3);
  assert.deepEqual(w.asked, []);
  nothingWritten(w);
});

test('the service in trouble: unreachable, no token, busy, 401, an old service (404) - each one sentence, nothing written', async () => {
  const cases: Array<[string, Answer | (() => Promise<Answer>), RegExp]> = [
    ['unreachable', () => Promise.reject(new Error('net::ERR_INTERNET_DISCONNECTED')), /^Could not reach the transpile service \(net::ERR_INTERNET_DISCONNECTED\)\. Check your connection and Settings → Forge → Transpile service URL\.$/],
    ['no token', { status: 0, json: { detail: 'Set your transpile token in Settings → Forge → Transpile token before using /generate.' } }, /^Set your transpile token in Settings → Forge → Transpile token before planning a phrase from a sentence\.$/],
    ['busy', { status: 503, json: null }, /^The planner is busy right now\./],
    ['401', { status: 401, json: null }, /did not accept your token/],
    ['404', { status: 404, json: { detail: 'Not Found' } }, /^This transpile service does not offer planning yet \(it needs version 0\.2\.41 or newer\)\./],
  ];
  for (const [label, answer, expected] of cases) {
    const w = world({ answer });
    const res = await w.nb.runRequest(SEL, 'half as busy');
    assert.equal(res.ok, false, label);
    assert.match((res as { message: string }).message, expected, label);
    assert.equal(w.versions.length, 0, `${label}: the version is not asked when the trouble is already plain`);
    nothingWritten(w);
    assert.match(w.lines[0], /^\[forge-notebook\] asked "half as busy" -> refused: /, label);
  }
});

test('before the deploy: a service older than 0.2.41 ignores the selection; its answer (another kind of phrase, or a refusal about bars) is told apart by /health and the person reads "needs version 0.2.41", not a riddle', async () => {
  for (const answer of [
    { status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8 } } },
    { status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'I could not turn that sentence into a phrase. Try naming a bar and what to do with it.' } },
  ]) {
    const w = world({ answer, version: '0.2.40' });
    const res = await w.nb.runRequest(SEL, 'make this half as busy');
    assert.deepEqual(res, { ok: false, message: OLD_SERVICE });
    assert.equal(w.versions.length, 1);
    assert.deepEqual(w.notices, [OLD_SERVICE]);
    nothingWritten(w);
  }
});

test('a current service (0.2.41+) or an unreadable version keeps the answer\'s own words: the version only ever decides "too old", never hides the service\'s reason', async () => {
  const jazzy = { status: 200, json: { ok: false, plan: null, error: 'I cannot make a bar jazzier.' } };
  assert.deepEqual(await world({ answer: jazzy, version: '0.2.41' }).nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: 'I cannot make a bar jazzier.' });
  assert.deepEqual(await world({ answer: jazzy, version: null }).nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: 'I cannot make a bar jazzier.' });
  assert.deepEqual(await world({ answer: jazzy, version: () => Promise.reject(new Error('down')) }).nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: 'I cannot make a bar jazzier.' });
  const other = await world({ answer: { status: 200, json: { ok: true, plan: { kind: 'extend', bar: 'bar_005' } } }, version: '0.2.41' }).nb.runRequest(SEL, 'x');
  assert.equal(other.ok, false);
  assert.match((other as { message: string }).message, /^The planner answered with a new phrase, not an operation on the selected bars\./);
  const happy = world({ version: '0.2.40' });
  assert.ok((await happy.nb.runRequest(SEL, 'half as busy')).ok);
  assert.equal(happy.versions.length, 0, 'a good answer never asks the version');
});

test('2026-10-29-0800: an answer that carries the service version is judged by it and /health is NOT asked; one without a readable version still asks /health (an older service)', async () => {
  const jazzy = (extra: Record<string, unknown>) => ({ status: 200, json: { ok: false, plan: null, error: 'I cannot make a bar jazzier.', ...extra } });
  const current = world({ answer: jazzy({ version: '0.2.42' }), version: '0.2.40' });                     // /health would say OLD; the answer's own version wins and /health is not asked
  assert.deepEqual(await current.nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: 'I cannot make a bar jazzier.' });
  assert.equal(current.versions.length, 0, 'the answer said which service it was: no /health');
  const tooOld = world({ answer: jazzy({ version: '0.2.40' }), version: '0.2.42' });                      // the answer says OLD; /health (which would say fine) is not asked
  assert.deepEqual(await tooOld.nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: OLD_SERVICE });
  assert.equal(tooOld.versions.length, 0);
  for (const unreadable of [undefined, '', 42, null]) {                                                    // no version in the answer: the existing fallback, the same sentence
    const w = world({ answer: jazzy(unreadable === undefined ? {} : { version: unreadable }), version: '0.2.40' });
    assert.deepEqual(await w.nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: OLD_SERVICE }, JSON.stringify(unreadable));
    assert.equal(w.versions.length, 1, `${JSON.stringify(unreadable)}: /health is asked`);
  }
  const noPort = world({ answer: jazzy({ version: '0.2.40' }) });
  assert.deepEqual(await noPort.nb.runRequest(SEL, 'make it jazzier'), { ok: false, message: OLD_SERVICE }, 'the answer\'s version needs no /health port at all');
});

test('a build with no service call says so, and writes nothing', async () => {
  const w = world({ noAsk: true });
  assert.deepEqual(await w.nb.runRequest(SEL, 'half as busy'), { ok: false, message: 'Asking in a sentence is not available in this build.' });
  assert.deepEqual(w.lines, ['[forge-notebook] asked "half as busy" -> refused: Asking in a sentence is not available in this build.']);
  assert.deepEqual(w.notices, ['Asking in a sentence is not available in this build.']);
  nothingWritten(w);
});

test('the BYOK key goes in the request payload and nowhere else: not in the phrase, the cell, a notice or the evidence lines', async () => {
  const w = world({ key: 'sk-ant-secret-9' });
  assert.ok((await w.nb.runRequest(SEL, 'half as busy')).ok);
  assert.equal(w.asked[0].user_anthropic_key, 'sk-ant-secret-9');
  const everything = [...w.files.values()].join('\n') + w.lines.join('\n') + w.notices.join('\n');
  assert.ok(!everything.includes('sk-ant-secret-9'));
  const keyless = world(); await keyless.nb.runRequest(SEL, 'x');
  assert.equal('user_anthropic_key' in keyless.asked[0], false);
});

test('the cell is the record: RE-RUN writes the phrase again from the cell and does NOT ask the service; DELETE CELL undoes the request (the phrase and the cell go, the source stays)', async () => {
  const w = world();
  await w.nb.runRequest(SEL, 'make this half as busy');
  const original = w.files.get('phrases/phrase_007.md')!;
  w.files.set('phrases/phrase_007.md', original.replace('"amount": 0.5', '"amount": 0.9'));
  const cell = (await w.nb.cells()).cells[0];
  assert.equal(cell.request, 'make this half as busy');
  assert.deepEqual(await w.nb.rerun(cell), { ok: true, phrasePath: 'phrases/phrase_007.md', remade: false });
  assert.equal(w.files.get('phrases/phrase_007.md'), original);
  assert.equal(w.asked.length, 1, 'Re-run is deterministic: the service is not asked again');
  const sourceBefore = w.files.get('phrases/phrase_006.md');
  assert.deepEqual(await w.nb.deleteCell(cell), { ok: true });
  assert.deepEqual(w.removed, ['phrases/phrase_007.md', 'notebook/cell_001.md']);
  assert.equal(w.files.get('phrases/phrase_006.md'), sourceBefore);
  nothingWritten(w);
});

test('a cell made from the op picker is unchanged (no request: its derived Description, no "request" in the json); a cell with a request that is not a sentence is refused, never a throw', async () => {
  const w = world();
  await w.nb.run(SEL, 'thin_out', 0.5);
  const text = w.files.get('notebook/cell_001.md')!;
  assert.ok(!text.includes('"request"'));
  assert.match(text, /\n# Description\n\ncell_001 — bars 3 to 5, kick row of \[\[phrase_006\]\]: /);
  const bad = readCellNote(text.replace('"selection": "bars 3 to 5, kick row",', '"selection": "bars 3 to 5, kick row",\n  "request": 7,'), 'notebook/cell_001.md');
  assert.equal(bad.ok, false);
  assert.match((bad as { message: string }).message, /request must be the sentence/);
});

test('a sentence can never break the cell note: a heading, a fence, quotes, frontmatter marks and newlines stay ONE quoted line, one json string, and read back exactly (one line, single spaces)', async () => {
  const nasty = '# Recipe\n```\n---\n"quoted" and \\ backslash\n- [[phrase_001]] <!-- x -->';
  const text = cellNoteContent({ id: 'cell_001', source: 'phrases/phrase_006', result: 'phrases/phrase_007', selection: 'bar 3', ops: [{ op: 'thin_out', first: 3, last: 3, amount: 0.5 } satisfies TransformOp], request: nasty });
  assert.equal([...text.matchAll(/^# Recipe$/gm)].length, 1, 'exactly one Recipe heading: the sentence did not make a second');
  assert.equal([...text.matchAll(/^```/gm)].length, 2, 'exactly one json fence (open and close)');
  assert.match(text, /\n# Description\n\n“# Recipe ``` --- "quoted" and \\ backslash - \[\[phrase_001\]\] <!-- x -->”\n/);
  const back = readCellNote(text, 'notebook/cell_001.md');
  assert.ok(back.ok && back.cell.request === '# Recipe ``` --- "quoted" and \\ backslash - [[phrase_001]] <!-- x -->');
});

// ---- the write path under trouble (the one path Run and the typed request share) -------------------------------------------------------------------------------------------------------

test('a cell name taken by another writer between the listing and the write: the next name is used and the first writer\'s note is left alone', async () => {
  const w = world({ raceCell: 'once' });
  const res = await w.nb.runRequest(SEL, 'half as busy');
  assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_002.md', phrasePath: 'phrases/phrase_007.md' });
  assert.equal(w.files.get('notebook/cell_001.md'), 'someone else\'s');
  assert.deepEqual(w.creates.filter((p) => p.startsWith('notebook/cell_')), ['notebook/cell_001.md', 'notebook/cell_002.md']);
});

test('a cell name that is ALWAYS taken: three tries, then the phrase is taken back and the person is told the name kept being taken; the source is untouched', async () => {
  const w = world({ raceCell: 'always' });
  const res = await w.nb.runRequest(SEL, 'half as busy');
  assert.deepEqual(res, { ok: false, message: 'Could not make the cell: the name kept being taken' });
  assert.equal(w.creates.filter((p) => p.startsWith('notebook/cell_')).length, 3, 'exactly three tries');
  assert.deepEqual(w.removed, ['phrases/phrase_007.md'], 'the phrase it made is taken back');
  nothingWritten(w);
});

test('no free cell name at all: the reason is the cell planner\'s own, and the phrase is taken back', async () => {
  const w = world({ cellsTaken: true });
  const res = await w.nb.runRequest(SEL, 'half as busy');
  assert.deepEqual(res, { ok: false, message: 'Could not make the cell: Could not find a free cell name in notebook/ — try again.' });
  assert.deepEqual(w.removed, ['phrases/phrase_007.md']);
});

test('a phrase that cannot be taken back is said out loud (the cell is not made either)', async () => {
  const w = world({ raceCell: 'always', failRemove: 'phrases/phrase_007.md' });
  const res = await w.nb.runRequest(SEL, 'half as busy');
  assert.equal(res.ok, false);
  assert.ok(w.notices.includes('The transform phrases/phrase_007.md could not be taken back: locked'), w.notices.join(' | '));
});

test('the transform note cannot be written: one sentence naming why (the planner\'s own), the Notice says it, no cell is made, the tab does not open (both Run paths)', async () => {
  const w = world({ failPhraseCreate: true });
  assert.deepEqual(await w.nb.runRequest(SEL, 'half as busy'), { ok: false, message: 'Could not make a new phrase: disk full' });
  assert.deepEqual(await w.nb.run(SEL, 'thin_out', 0.5), { ok: false, message: 'Could not make a new phrase: disk full' });
  assert.deepEqual(w.notices, ['Could not make a new phrase: disk full', 'Could not make a new phrase: disk full']);
  assert.deepEqual(w.opened, []);
  assert.ok(![...w.files.keys()].some((p) => p.startsWith('notebook/cell_')));
});

test('the notebook/ folder cannot be made: "Could not make the transform: <why>", as a Notice too, and nothing else is written', async () => {
  const w = world({ folderFails: true });
  assert.deepEqual(await w.nb.runRequest(SEL, 'half as busy'), { ok: false, message: 'Could not make the transform: read-only' });
  assert.deepEqual(w.notices, ['Could not make the transform: read-only']);
  nothingWritten(w);
});

test('a refusal the plugin itself makes while writing (a number the engine would refuse) is a Notice as well as the return value', async () => {
  const w = world({ answer: { status: 200, json: { ok: true, plan: { kind: 'transform', op: 'thin_out', amount: 0.5 } } } });
  const refused = await w.nb.run(SEL, 'thin_out', 7);
  assert.equal(refused.ok, false);
  assert.deepEqual(w.notices, [(refused as { message: string }).message]);
  assert.match(w.notices[0], /^Notebook: ops\[0\]\.amount must be a number from 0 to 1/);
});

test('a cell with two ops (a scattered selection) says both in its Description line, joined by "; "', () => {
  const text = cellNoteContent({ id: 'cell_001', source: 'phrases/phrase_006', result: 'phrases/phrase_007', selection: 'bars 2, 4 to 5', ops: [{ op: 'thin_out', first: 2, last: 2, amount: 0.5 }, { op: 'thin_out', first: 4, last: 5, amount: 0.5 }] satisfies TransformOp[] });
  assert.match(text, /thin out bar 2: remove half of the hits, keeping the strongest beats; thin out bars 4 to 5: remove half of the hits, keeping the strongest beats\. Made \[\[phrase_007\]\]\./);
});

test('the phrases/ folder is made when it is not there (and no other); with it there, nothing is created', async () => {
  const missing = world({ noPhrasesFolder: true });
  assert.ok((await missing.nb.runRequest(SEL, 'half as busy')).ok);
  assert.deepEqual(missing.folders, ['phrases']);
  const there = world();
  assert.ok((await there.nb.runRequest(SEL, 'half as busy')).ok);
  assert.deepEqual(there.folders, []);
});

test('the next cell name follows the highest cell there is, however many: with cell_001 to cell_003 in the folder the new cell is cell_004 (not a failure to find a free name)', async () => {
  const w = world();
  for (const n of [1, 2, 3]) w.files.set(`notebook/cell_00${n}.md`, cellNoteContent({ id: `cell_00${n}`, source: 'phrases/phrase_001', result: 'phrases/phrase_002', selection: 'bar 1', ops: [{ op: 'double_up', first: 1, last: 1, grid: 16 }] satisfies TransformOp[] }));
  const res = await w.nb.runRequest(SEL, 'half as busy');
  assert.deepEqual(res, { ok: true, cellPath: 'notebook/cell_004.md', phrasePath: 'phrases/phrase_007.md' });
});
