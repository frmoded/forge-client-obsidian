// 2026-11-27-1049 (prompt stack, stage 4A) - the GRAMMAR CARD the sentence service now gives its model (forge-transpile grammar_card.py) must teach THIS grammar: every example sentence in it is read by the real grammar, and every worked example
// gives the order the card states. The card's examples come as forge-transpile tests/grammar_card_examples.json (a test there holds it equal to the card's text; Python can run only a phrase's steps).
// Where the file comes from (as in outcome-corpus-1045.test.ts): `../forge-transpile` beside this checkout. A git worktree (the matrix) has none beside it: then the file COMMITTED at HEAD of the forge-transpile beside the MAIN checkout.
// With neither, the tests are skipped and say why.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseBarSentence } from './bar-grammar-core.ts';
import { applyStructureOps, isRunsOp } from './bar-structure-core.ts';
import { parseMelodySentence } from './melody-grammar-core.ts';
import { parse } from './phrase-grammar-core.ts';

const NAME = 'grammar_card_examples.json';
const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (dir: string, args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function read(): { text: string; skip?: undefined } | { text?: undefined; skip: string } {
  const beside = path.resolve(CLIENT, '..', 'forge-transpile', 'tests', NAME);
  if (fs.existsSync(beside)) return { text: fs.readFileSync(beside, 'utf8') };
  try {
    const main = path.dirname(git(CLIENT, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
    if (main !== CLIENT) return { text: git(path.resolve(main, '..', 'forge-transpile'), ['show', `HEAD:tests/${NAME}`]) };
  } catch { /* not a worktree, no forge-transpile there, or the file is not committed in it: skipped below */ }
  return { skip: `forge-transpile's card examples are not at ${beside}, nor (in a git worktree) committed in the forge-transpile beside the main checkout. The card was NOT read by this grammar.` };
}

interface Worked { request: string; bars: number; reply: { lines?: string[]; gap?: { proposed: string } }; order: Array<number | string> | null }
const found = read();
const card: { sentences: Array<{ kind: string; sentence: string }>; worked: Worked[] } = found.text === undefined ? { sentences: [], worked: [] } : JSON.parse(found.text);

const numbered = (stem: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${stem}_${String(i + 1).padStart(3, '0')}`);
const VAULT = { bars: [...numbered('bar', 12), 'bar_101', 'bar_102'], melody: ['bar_101', 'bar_102'], phrases: ['phrase_001', 'phrase_006'], arrangements: ['arr_001', 'arr_002'], compositions: [], kits: ['rock', 'latin'] };
const EXTEND = 'Extend [[bar_005]] to 12 bars, repeating with fills.';
const TRACKS = ['Play [[phrase_006]] on the [[rock]] kit.', 'Play [[phrase_001]] on the [[latin]] kit.'];
const said = (...lines: string[]): string | null => { const r = parse(lines.join('\n'), VAULT); return r.ok === false ? r.error.message : null; };

/** The refusal of the real grammar for one sentence of the card, read where its kind says it stands; null = read. */
function refusal(kind: string, s: string): string | null {
  switch (kind) {
    case 'phrase-head': case 'melody-head': return said(s);
    case 'phrase-step': case 'phrase-engine-step': return said(EXTEND, s);
    case 'phrase-take-step': return said('Take [[phrase_006]].', s);
    case 'phrase-mix-step': return said('Mix [[bar_005]] and [[bar_006]], as a vote.', s);
    case 'melody-step': return said('Repeat [[bar_101]] for 12 bars.', s);
    case 'arrangement': return s === 'Together.' ? said(TRACKS[0], s) : /\bon the\b/.test(s) ? said(s, 'Together.') : said(...TRACKS, s, 'Together.');
    case 'composition': return /^(Then|Repeat)\b/.test(s) ? said('Play [[arr_001]] for 8 bars.', s) : said(s);
    case 'bar': { const r = parseBarSentence(s); return r.ok === false ? r.message : null; }
    case 'melody-bar': { const r = parseMelodySentence(s); return r.ok === false ? r.message : null; }
    default: return `a kind this test does not know: ${kind}`;
  }
}

test('1049 every example sentence of the grammar card is read by the REAL grammar', { skip: found.skip }, () => {
  assert.ok(card.sentences.length >= 60, `only ${card.sentences.length} sentences`);
  assert.deepEqual(card.sentences.map((x) => [x.sentence, refusal(x.kind, x.sentence)]).filter(([, why]) => why !== null), []);
});

test('1049 every worked example of the card gives the stated order in the real grammar and structure engine', { skip: found.skip }, () => {
  const worked = card.worked.filter((w) => w.reply.lines !== undefined);
  assert.ok(worked.length >= 15, `only ${worked.length} worked examples with lines`);
  for (const w of worked) {
    const got = parse([`Extend [[bar_005]] to ${w.bars} bars, repeating with fills.`, ...w.reply.lines!].join('\n'), VAULT);
    assert.ok(got.ok, `${w.request}: ${got.ok === false ? got.error.message : ''}`);
    const params = got.params as { ops?: Parameters<typeof applyStructureOps>[1][number][]; overrides?: Record<string, string> };
    const ops = params.ops ?? [];
    assert.ok(ops.every(isRunsOp), w.request);
    const done = applyStructureOps<number | string>(Array.from({ length: w.bars }, (_, i) => i + 1), ops);
    assert.ok(done.ok, `${w.request}: ${done.ok === false ? done.message : ''}`);
    const order = [...done.items];
    for (const [n, note] of Object.entries(params.overrides ?? {})) { assert.ok(Number(n) <= order.length, w.request); order[Number(n) - 1] = note.replace(/^bars\//, ''); }
    assert.deepEqual(order, w.order, w.request);
  }
});

test("1049 the sentence a gap of the card proposes is one the grammar does not read (else it is not a gap)", { skip: found.skip }, () => {
  const gaps = card.worked.filter((w) => w.reply.gap !== undefined);
  assert.ok(gaps.length >= 1);
  for (const w of gaps) assert.notEqual(said(EXTEND, w.reply.gap!.proposed), null, w.reply.gap!.proposed);
});
