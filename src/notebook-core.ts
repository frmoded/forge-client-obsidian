// 2026-10-27-1030 (M14 slice 1, design 4.13) - the notebook below the Score, its pure core: no `obsidian` import (the vault, the tab and the Notice are ports). A SELECTION is bars (clicked; Shift extends) and a row, always shown as chips
// ("bars 3 to 5, kick row"). Run turns the selection and one op into a TRANSFORM phrase (a note in phrases/) and a CELL (a note in notebook/: Description, Recipe, wikilinks, and the ONE json fence that records what the cell
// received - P4: the cell is a note, the Score stays derived). Re-run writes the same phrase again from the cell (deterministic, no LLM). Delete cell removes the cell and the phrase it made; the source is never touched.
// 2026-10-27-0720 (slice 2): Run can also take a typed REQUEST (a sentence): the service turns it into the same ops (notebook-request-core.ts), the cell records the sentence as its Description and in its json, and everything after that
// (the phrase, the cell, Re-run, Delete cell) is the one write path the op picker uses.
import {
  createNewPhraseFromParams, formatTransformOp, noteContentFor, validatePhrase, type NewPhraseResult, type TransformOp, type TransformPhrase,
} from './phrase-core.ts';
import { askedLine, buildTransformRequest, interpretTransformResponse, oneLine, versionAtLeast, OLD_SERVICE, REQUEST_NEEDS_VERSION, NO_BARS_SELECTED, type TransformOutcome } from './notebook-request-core.ts';
import { extractPhraseJsonBlock } from './phrase-notes-core.ts';
import type { PlanPayload } from './sentence-plan-core.ts';
import { transformOpWords } from './phrase-words-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

export const NOTEBOOK_FOLDER = 'notebook';
const CELL_NAME = /^cell_(\d+)$/;
const PHRASE_NOTE = /^phrases\/phrase_\d+$/;

// ---- the selection --------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface Selection { bars: number[]; row: string | null }

const sorted = (bars: Iterable<number>): number[] => [...new Set(bars)].sort((a, b) => a - b);

/** A click on a bar: select it, or unselect it when it is selected. The row is kept. */
export function toggleBar(s: Selection, n: number): Selection {
  return { bars: s.bars.includes(n) ? s.bars.filter((b) => b !== n) : sorted([...s.bars, n]), row: s.row };
}
/** A Shift-click: every bar from the last one clicked (`anchor`) to this one is added. No anchor = a plain click. */
export function extendSelection(s: Selection, anchor: number | null, n: number): Selection {
  if (anchor === null) return toggleBar(s, n);
  const [a, b] = anchor <= n ? [anchor, n] : [n, anchor];
  return { bars: sorted([...s.bars, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)]), row: s.row };
}
/** The row picker: a channel name, or 'all' (every row). */
export function withRow(s: Selection, row: string): Selection {
  return { bars: s.bars, row: row === 'all' ? null : row };
}
/** Each stretch of consecutive bars as [first, last]: what the engine's region transforms take. */
export function selectionRuns(bars: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const n of sorted(bars)) {
    const last = runs[runs.length - 1];
    if (last && last[1] === n - 1) last[1] = n; else runs.push([n, n]);
  }
  return runs;
}
/** The chip text of a selection ("bars 3 to 5, kick row", "bars 2 to 4, 9"), or null when nothing is selected. */
export function selectionChip(s: Selection): string | null {
  if (s.bars.length === 0) return null;
  const runs = selectionRuns(s.bars).map(([a, b]) => (a === b ? `${a}` : `${a} to ${b}`));
  return `${s.bars.length === 1 ? 'bar' : 'bars'} ${runs.join(', ')}${s.row !== null ? `, ${s.row} row` : ''}`;
}
/** One op per run of the selection, the row on each; thin out takes an amount, double up a grid. null = nothing selected. */
export function opsFor(s: Selection, kind: 'thin_out' | 'double_up', number: number): TransformOp[] | null {
  const runs = selectionRuns(s.bars);
  if (runs.length === 0) return null;
  return runs.map(([first, last]): TransformOp => {
    const row = s.row !== null ? { row: s.row } : {};
    return kind === 'thin_out' ? { op: 'thin_out', first, last, ...row, amount: number } : { op: 'double_up', first, last, ...row, grid: number };
  });
}

// ---- the cell note --------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** `request`: the sentence the person typed, when the cell was made from one (its Description); absent for a cell made from the op picker. */
export interface NotebookCellData { id: string; source: string; result: string; selection: string; ops: TransformOp[]; request?: string }
export interface NotebookCell extends NotebookCellData { path: string; role?: 'source' | 'result' }

const base = (noteId: string): string => noteId.split('/').pop() ?? noteId;
const capital = (s: string): string => `${s[0].toUpperCase()}${s.slice(1)}`;

/** A cell as a Forge note (Description, Recipe, wikilinks) with ONE json fence, last: what the cell received and what it made. Derived text above the fence, regenerated from the json. */
export function cellNoteContent(c: NotebookCellData): string {
  const source = base(c.source), result = base(c.result);
  const said = c.request === undefined ? undefined : oneLine(c.request);
  // A typed request IS the cell's Description (quoted in the body, so a sentence that starts with "#" or "-" can never start a heading or a list); an op-picker cell keeps the derived sentence.
  const description = said !== undefined ? said : `${c.id} — ${c.selection} of [[${source}]]: ${c.ops.map(transformOpWords).join('; ')}. Made [[${result}]].`;
  return [
    '---', 'type: data', 'content_type: json', `description: ${JSON.stringify(description)}`, 'links:', `  - "[[${source}]]"`, `  - "[[${result}]]"`, '---', '',
    '<!-- derived from the json below; edit the controls, not this text -->', '',
    '# Description', '', said !== undefined ? `“${said}”` : description, '',
    '# Recipe', '', `Take [[${source}]].`, ...c.ops.map((o) => `${capital(transformOpWords(o))}.`), `This makes [[${result}]].`, '',
    '```json',
    '{', '  "kind": "notebook_cell",', `  "source": ${JSON.stringify(c.source)},`, `  "result": ${JSON.stringify(c.result)},`, `  "selection": ${JSON.stringify(c.selection)},`,
    ...(said !== undefined ? [`  "request": ${JSON.stringify(said)},`] : []), '  "ops": [',
    ...c.ops.map((o, i) => `    ${formatTransformOp(o)}${i < c.ops.length - 1 ? ',' : ''}`), '  ]', '}',
    '```', '',
  ].join('\n');
}

/** The cell a note says it is, or why it cannot be read (never a throw). */
export function readCellNote(text: string, path: string): { ok: true; cell: NotebookCellData & { path: string } } | { ok: false; message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  if (!parseFrontmatter(text)) return bad('The note has no frontmatter, so it is not a data note.');
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return bad(block.message);
  let raw: unknown;
  try { raw = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch (e) { return bad(`The json block is not valid JSON: ${(e as Error).message}`); }
  const o = raw as { kind?: unknown; source?: unknown; result?: unknown; selection?: unknown; ops?: unknown; request?: unknown } | null;
  if (typeof o !== 'object' || o === null || o.kind !== 'notebook_cell') return bad('This is not a notebook cell (kind must be "notebook_cell").');
  if (typeof o.source !== 'string' || !PHRASE_NOTE.test(o.source)) return bad(`source must be a phrase note without .md, like phrases/phrase_006, got ${JSON.stringify(o.source)}.`);
  if (typeof o.result !== 'string' || !PHRASE_NOTE.test(o.result)) return bad(`result must be a phrase note without .md, like phrases/phrase_007, got ${JSON.stringify(o.result)}.`);
  if (typeof o.selection !== 'string') return bad('selection must be a string like "bars 3 to 5, kick row".');
  if (o.request !== undefined && typeof o.request !== 'string') return bad('request must be the sentence the cell was made from (a string), or absent.');
  const valid = validatePhrase({ kind: 'transform', source: o.source, ops: o.ops });
  if (valid.ok === false) return bad(valid.message);
  const ops = (valid.value as TransformPhrase).ops;
  return { ok: true, cell: { id: (path.split('/').pop() ?? path).replace(/\.md$/, ''), source: o.source, result: o.result, selection: o.selection, ops, path, ...(typeof o.request === 'string' ? { request: o.request } : {}) } };
}

export function planNewCell(input: { existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): { ok: true; id: string; path: string } | { ok: false; message: string } {
  const taken = new Set(input.existingBasenames);
  for (let i = 0; i < (input.attempts ?? 3); i++) {
    let max = 0;
    for (const b of taken) { const m = CELL_NAME.exec(b); if (m) max = Math.max(max, Number(m[1])); }
    const id = `cell_${String(max + 1).padStart(3, '0')}`;
    const path = `${NOTEBOOK_FOLDER}/${id}.md`;
    if (!input.exists(path)) return { ok: true, id, path };
    taken.add(id);
  }
  return { ok: false, message: `Could not find a free cell name in ${NOTEBOOK_FOLDER}/ — try again.` };
}

// ---- Run, Re-run, Delete cell -------------------------------------------------------------------------------------------------------------------------------------------------------

export interface NotebookPorts<F> {
  /** The phrase this notebook is under (`phrases/phrase_006`, no .md). */
  sourcePhrase: string;
  activePath(): string | null;
  folderExists(folder: string): boolean;
  createFolder(folder: string): Promise<void>;
  listPhraseBasenames(): string[];
  /** The paths of the notes in `notebook/` (README included; the core skips it). */
  listCellPaths(): string[];
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  create(path: string, content: string): Promise<F>;
  /** Replace a note's whole text (one atomic write on the vault side). */
  write(path: string, content: string): Promise<void>;
  /** Delete a note for good from the person's point of view: close the tabs showing it, trash it, check it is gone. Rejects when it cannot. */
  remove(path: string): Promise<void>;
  open(file: F): Promise<void>;
  notify(message: string): void;
  isAlreadyExists(e: unknown): boolean;
  trace(line: string): void;
  /** 2026-10-27-0720 (the typed request): POST /plan. Rejects when the service cannot be reached; a status of 0 is "no token" (nothing was sent). Absent = asking in a sentence is not available in this build. */
  ask?(payload: PlanPayload): Promise<{ status: number; json: unknown }>;
  /** The BYOK key to send, or undefined. */
  ownKey?(): string | undefined;
  /** Basenames in `bars/` right now (names ride along as for every /plan call). */
  listBarBasenames?(): string[];
  /** The service's /health version, or null when it cannot be read: asked ONLY when an answer is one an old service could also give. */
  serviceVersion?(): Promise<string | null>;
}

export type RunResult = { ok: true; cellPath: string; phrasePath: string } | { ok: false; message: string };

export interface Notebook {
  run(selection: Selection, kind: 'thin_out' | 'double_up', number: number): Promise<RunResult>;
  /** Run with a typed request: ask the service once (the selection's first run, with its row), lay the op it answers over every run of the selection, then write the phrase and the cell exactly as `run` does. Nothing is written on a refusal. */
  runRequest(selection: Selection, sentence: string): Promise<RunResult>;
  /** The cells of this tab: those that read this phrase (role 'source') and the one that made it (role 'result'), plus the notes in notebook/ that could not be read. */
  cells(): Promise<{ cells: NotebookCell[]; problems: Array<{ path: string; message: string }> }>;
  rerun(cell: NotebookCell): Promise<{ ok: true; phrasePath: string; remade: boolean } | { ok: false; message: string }>;
  deleteCell(cell: NotebookCell): Promise<{ ok: true } | { ok: false; message: string }>;
}

const MESSAGE_NONE_SELECTED = NO_BARS_SELECTED;
const msg = (e: unknown): string => (e as Error)?.message ?? String(e);

export function createNotebook<F>(ports: NotebookPorts<F>): Notebook {
  const ensureFolder = async (folder: string): Promise<void> => {
    if (ports.folderExists(folder)) return;
    try { await ports.createFolder(folder); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
  };
  /** The one write path of Run: the transform phrase, then the cell (which records what it received, and the sentence when there is one), then the tab. */
  const runOps = async (selection: Selection, ops: TransformOp[], kind: string, request?: string): Promise<RunResult> => {
    const fail = (message: string): RunResult => { ports.notify(message); return { ok: false, message }; };
    const valid = validatePhrase({ kind: 'transform', source: ports.sourcePhrase, ops });
    if (valid.ok === false) return fail(`Notebook: ${valid.message}`);
    const params = valid.value as TransformPhrase;
    let created: F | undefined;
    let phrase: NewPhraseResult;
    try {
      await ensureFolder(NOTEBOOK_FOLDER);
      phrase = await createNewPhraseFromParams<F>({
        activePath: ports.activePath,
        folderExists: () => ports.folderExists('phrases'),
        createFolder: () => ports.createFolder('phrases'),
        listPhraseBasenames: ports.listPhraseBasenames,
        exists: ports.exists,
        create: async (p, c) => { created = await ports.create(p, c); return created; },
        open: async () => {},                                   // the tab opens after the cell is written, so a failed cell never leaves a tab on a note that is taken back
        notify: ports.notify,
        isAlreadyExists: ports.isAlreadyExists,
      }, params);
    } catch (e) {
      return fail(`Could not make the transform: ${msg(e)}`);
    }
    if (phrase.ok === false) return { ok: false, message: phrase.message };
    const chip = selectionChip(selection) ?? '';
    let cellPath: string | null = null;
    let cellError = '';
    for (let attempt = 0; attempt < 3 && cellPath === null; attempt++) {
      const names = ports.listCellPaths().map((p) => (p.split('/').pop() ?? p).replace(/\.md$/, ''));
      const plan = planNewCell({ existingBasenames: names, exists: ports.exists });
      if (plan.ok === false) { cellError = plan.message; break; }
      try {
        await ports.create(plan.path, cellNoteContent({ id: plan.id, source: ports.sourcePhrase, result: phrase.path.replace(/\.md$/, ''), selection: chip, ops: params.ops, ...(request !== undefined ? { request } : {}) }));
        cellPath = plan.path;
      } catch (e) {
        if (ports.isAlreadyExists(e)) continue;
        cellError = msg(e);
        break;
      }
    }
    if (cellPath === null) {
      try { await ports.remove(phrase.path); } catch (e) { ports.notify(`The transform ${phrase.path} could not be taken back: ${msg(e)}`); }
      return fail(`Could not make the cell: ${cellError || 'the name kept being taken'}`);
    }
    if (created !== undefined) await ports.open(created);
    ports.trace(`[forge-notebook] ran ${(cellPath.split('/').pop() ?? '').replace(/\.md$/, '')}: ${chip} -> ${kind} -> ${phrase.path}`);
    return { ok: true, cellPath, phrasePath: phrase.path };
  };
  return {
    run(selection, kind, number) {
      const ops = opsFor(selection, kind, number);
      if (ops === null) { ports.notify(MESSAGE_NONE_SELECTED); return Promise.resolve({ ok: false as const, message: MESSAGE_NONE_SELECTED }); }
      return runOps(selection, ops, kind);
    },

    async runRequest(selection, sentence) {
      const fail = (message: string): RunResult => { ports.notify(message); return { ok: false, message }; };
      const runs = selectionRuns(selection.bars);
      if (runs.length === 0) return fail(MESSAGE_NONE_SELECTED);
      const request = buildTransformRequest({ sentence, source: ports.sourcePhrase, runs, row: selection.row, barNames: ports.listBarBasenames?.() ?? [], phraseNames: ports.listPhraseBasenames(), ownKey: ports.ownKey?.() });
      if (request.ok === false) { ports.trace(askedLine(sentence, request)); return fail(request.message); }
      if (ports.ask === undefined) { const outcome = { ok: false as const, message: 'Asking in a sentence is not available in this build.' }; ports.trace(askedLine(sentence, outcome)); return fail(outcome.message); }
      let answer: TransformOutcome;
      try {
        answer = interpretTransformResponse(await ports.ask(request.payload), { source: ports.sourcePhrase, runs, row: selection.row });
      } catch (e) {
        answer = { ok: false, message: `Could not reach the transpile service (${msg(e)}). Check your connection and Settings → Forge → Transpile service URL.`, suspectOld: false };
      }
      let outcome: TransformOutcome | { ok: false; message: string } = answer;
      if (answer.ok === false && answer.suspectOld && ports.serviceVersion !== undefined) {
        // an answer an old service could give too: ask the version before blaming the sentence (an unreadable version is unknown, not old)
        let version: string | null = null;
        try { version = await ports.serviceVersion(); } catch { /* unknown is not old */ }
        if (versionAtLeast(version, REQUEST_NEEDS_VERSION) === false) outcome = { ok: false, message: OLD_SERVICE };
      }
      ports.trace(askedLine(sentence, outcome));
      if (outcome.ok === false) return fail(outcome.message);
      return runOps(selection, outcome.ops, outcome.op, oneLine(sentence));
    },

    async cells() {
      const cells: NotebookCell[] = [];
      const problems: Array<{ path: string; message: string }> = [];
      for (const path of ports.listCellPaths().filter((p) => p.endsWith('.md') && !p.endsWith('/README.md')).sort()) {
        let text: string;
        try { text = await ports.read(path); } catch (e) { problems.push({ path, message: msg(e) }); continue; }
        const read = readCellNote(text, path);
        if (read.ok === false) { problems.push({ path, message: read.message }); continue; }
        if (read.cell.source === ports.sourcePhrase) cells.push({ ...read.cell, role: 'source' });
        else if (read.cell.result === ports.sourcePhrase) cells.push({ ...read.cell, role: 'result' });
      }
      return { cells, problems };
    },

    async rerun(cell) {
      const fail = (message: string) => { ports.notify(message); return { ok: false as const, message }; };
      const valid = validatePhrase({ kind: 'transform', source: cell.source, ops: cell.ops });
      if (valid.ok === false) return fail(`Notebook: ${valid.message}`);
      const path = `${cell.result}.md`;
      const content = noteContentFor(base(cell.result), valid.value);
      const remade = !ports.exists(path);
      try {
        if (remade) { await ensureFolder('phrases'); await ports.create(path, content); } else await ports.write(path, content);
      } catch (e) {
        return fail(`Could not re-run ${cell.id}: ${msg(e)}`);
      }
      ports.trace(`[forge-notebook] reran ${cell.id} -> ${path}${remade ? ' (made again)' : ''}`);
      return { ok: true as const, phrasePath: path, remade };
    },

    async deleteCell(cell) {
      const phrasePath = `${cell.result}.md`;
      try {
        if (ports.exists(phrasePath)) await ports.remove(phrasePath);
        await ports.remove(cell.path);
      } catch (e) {
        const message = `Could not delete ${cell.id}: ${msg(e)}`;
        ports.notify(message);
        return { ok: false as const, message };
      }
      ports.trace(`[forge-notebook] deleted ${cell.id} (${phrasePath})`);
      return { ok: true as const };
    },
  };
}
