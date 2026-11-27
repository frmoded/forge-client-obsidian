// 2026-11-25-1045 (prompt stack, stage 3) - the two readers of canonical lines must agree: forge-transpile's `outcome.simulate`, which judges its corpus of requests (tests/outcome_corpus.json, outcome_answers.json), and THIS grammar,
// which is what the driver's note does with those lines. Also: the request its live runner sends (tests/outcome_client_request.json) carries this plugin's own grammar table and instruction.
// Where the files come from: `../forge-transpile` beside this checkout. A git worktree (the matrix) has no forge-transpile beside it: then the files COMMITTED at HEAD of the forge-transpile beside the MAIN checkout. HEAD on purpose: this is
// drift detection between two repos (as the engine drift check), not a pinned fixture. With neither, the tests are skipped and say why.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyStructureOps, isRunsOp } from './bar-structure-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { LINES_INSTRUCTION, grammarTable } from './service-lines-core.ts';

const NAMES = ['outcome_corpus.json', 'outcome_answers.json', 'outcome_client_request.json'] as const;
const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (dir: string, args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function read(): { texts: string[]; skip?: undefined } | { texts?: undefined; skip: string } {
  const beside = path.resolve(CLIENT, '..', 'forge-transpile', 'tests');
  if (NAMES.every((n) => fs.existsSync(path.join(beside, n)))) return { texts: NAMES.map((n) => fs.readFileSync(path.join(beside, n), 'utf8')) };
  try {
    const main = path.dirname(git(CLIENT, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
    if (main !== CLIENT) {
      const transpile = path.resolve(main, '..', 'forge-transpile');
      return { texts: NAMES.map((n) => git(transpile, ['show', `HEAD:tests/${n}`])) };
    }
  } catch { /* not a worktree, no forge-transpile there, or the files are not committed in it: skipped below */ }
  return { skip: `forge-transpile's outcome files (${NAMES.join(', ')}) are not all at ${beside}, nor (in a git worktree) committed in the forge-transpile beside the main checkout. The two readers were NOT compared.` };
}

interface Entry { id: string; bars: number | string[]; head?: string; expect: string[] | null; expect_kind: string }
interface Control { name: string; corpus: string; answer: { lines?: string[] }; order?: string[]; refusal?: string }
const found = read();
const [corpus, recorded, request] = found.texts === undefined ? [[], { answers: {}, negative_controls: [] }, null] : found.texts.map((t) => JSON.parse(t));
const entries = new Map((corpus as Entry[]).map((e) => [e.id, e]));
const VAULT = { bars: Array.from({ length: 12 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`), phrases: ['phrase_001'] };

/** The lines after the entry's head, read by the real grammar and run by the real structure engine; the replaced bars are laid over the result, as a phrase's Score does. */
function orderOf(e: Entry, lines: string[]): { order: string[] } | { refusal: string } {
  const bars = typeof e.bars === 'number' ? Array.from({ length: e.bars }, (_, i) => `b${i + 1}`) : e.bars;
  const read = parse([e.head ?? `Extend [[bar_005]] to ${bars.length} bars, repeating with fills.`, ...lines].join('\n'), VAULT);
  if (read.ok === false) return { refusal: read.error.message };
  const params = read.params as { ops?: Parameters<typeof applyStructureOps>[1][number][]; overrides?: Record<string, string> };
  const ops = params.ops ?? [];
  assert.ok(ops.every(isRunsOp), `${e.id}: a step that needs the engine cannot be compared`);
  const done = applyStructureOps(bars, ops);
  if (done.ok === false) return { refusal: done.message };
  const order = [...done.items];
  for (const [n, note] of Object.entries(params.overrides ?? {})) {
    if (Number(n) > order.length) return { refusal: `bar ${n} is replaced, but there are ${order.length} bars` };
    order[Number(n) - 1] = note.replace(/^bars\//, '');
  }
  return { order };
}

test('1045 every recorded canonical line of the outcome corpus is read by the REAL grammar and gives the expected order of bars', { skip: found.skip }, () => {
  const answers = Object.entries(recorded.answers as Record<string, { lines?: string[] }>).filter(([, a]) => a.lines !== undefined);
  assert.ok(answers.length >= 30, `only ${answers.length} recorded answers with lines`);
  assert.deepEqual(answers.map(([id]) => id).sort(), [...entries.values()].filter((e) => e.expect_kind === 'lines').map((e) => e.id).sort());
  for (const [id, a] of answers) assert.deepEqual(orderOf(entries.get(id)!, a.lines!), { order: entries.get(id)!.expect }, `${id}: ${a.lines!.join(' ')}`);
});

test('1045 the negative controls with lines mean to the real grammar what they mean to the harness: the same wrong order, or a refusal in the same words', { skip: found.skip }, () => {
  const controls = (recorded.negative_controls as Control[]).filter((c) => c.answer.lines !== undefined);
  assert.ok(controls.length >= 8, `only ${controls.length} negative controls with lines`);
  for (const c of controls) {
    const e = entries.get(c.corpus)!, got = orderOf(e, c.answer.lines!);
    if (c.refusal !== undefined) { assert.ok('refusal' in got && got.refusal.includes(c.refusal), `${c.name}: ${JSON.stringify(got)}`); continue; }
    assert.ok('order' in got, `${c.name}: ${JSON.stringify(got)}`);
    if (c.order !== undefined) assert.deepEqual(got.order, c.order, c.name);
  }
});

test("1045 the live runner's request carries this plugin's grammar table of a phrase and its instruction", { skip: found.skip }, () => {
  assert.deepEqual(request, { grammar: grammarTable('phrase'), instruction: LINES_INSTRUCTION });
});
