// 2026-11-19-0980 (THE LIST MODEL, stage 2: PHRASES) - the PURE core of a phrase's Description as an ordered list whose line 1 is the HEAD (Extend, Mix, Morph or Take) and whose later lines are transforms (sentence-list-core.ts, kind 'phrase'). Written
// RED first against the stage-1 code (`kind: 'phrase'` was replayed as one description with no pipeline: no head replacement, no modifier lines, no refusal in words, no seed drawing, no strip writer). The properties pinned:
//   * the ROUND TRIP of all four heads (type, canonicalize, replay, render, parse the list back);
//   * the GOLDEN: the replay of the sentences of every phrase fixture (14 notes of the playground vault, 12 more paragraphs, every phrase note of the bundled vaults: there are none) gives the params, Recipe, Python and json that the single sentence gave;
//   * the conflict rule for a phrase (a head segment by name, a fork by bar number, a thin out or double up by range and row; structure steps never conflict) REPLACES IN PLACE; a later head replaces line 1 and the lines still valid for it stay;
//   * a structure step after a density step is REFUSED in words ("Do the structure steps first"), the list is never re-sorted;
//   * a random line draws its seed ONCE (drawSeeds) and the stored line replays the same twice;
//   * MIGRATION: a paragraph is split losslessly when every sentence is readable, else one legacy line; the strip's params are written as lines (listAfterParams).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import * as L from './sentence-list-core.ts';
import { formatPhraseJson, readPhraseNote, type PhraseParams } from './phrase-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { EXTRA_PARAGRAPHS, PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const ctx: L.ReplayCtx = { vault: V };
const K = 'phrase' as const;
const jsonOf = (p: GrammarParams | null): string => (p === null ? '{}' : formatPhraseJson(p as PhraseParams));
const sentences = (paragraph: string): string[] => L.sentencesOfText(paragraph, K);
const today = (paragraph: string) => { const r = parse(paragraph, V); assert.ok(r.ok, paragraph); const p = (r as { ok: true; params: GrammarParams }).params; return { params: p, recipe: phraseRecipeSteps(p as PhraseParams), python: phrasePython(p as PhraseParams), json: jsonOf(p) }; };
const plan = async (list: string[], typed: string[]) => L.planAppend(list, K, typed, ctx);
const okPlan = async (list: string[], typed: string[]) => { const r = await plan(list, typed); assert.ok(r.ok, `planAppend(${JSON.stringify(typed)}) should be ok: ${r.ok ? '' : r.message}`); return r as Extract<typeof r, { ok: true }>; };
const refused = async (list: string[], typed: string[]) => { const r = await plan(list, typed); assert.ok(!r.ok, `planAppend(${JSON.stringify(typed)}) should be refused`); return r as Extract<typeof r, { ok: false }>; };
/** Build a list by appending one typed sentence at a time (each must be accepted). */
const grow = async (...typed: string[]): Promise<string[]> => { let list: string[] = []; for (const t of typed) list = (await okPlan(list, [t])).list; return list; };

const HEADS: Array<{ kind: string; typed: string; canonical: string }> = [
  { kind: 'extend', typed: 'extend bar_005 to 8 bars, repeating with fills', canonical: 'Extend [[bar_005]] to 8 bars, repeating with fills.' },
  { kind: 'mix', typed: 'Mix bar_005 and bar_006, 70 percent bar_005, as a vote', canonical: 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.' },
  { kind: 'morph', typed: 'morph bar_003 into bar_001 over 5 bars, in musical order', canonical: 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.' },
  { kind: 'transform', typed: 'take phrase_003', canonical: 'Take [[phrase_003]].' },
];

// ---- the round trip of all four heads ---------------------------------------------------------------------------------------------------------------------------------------------------------
for (const h of HEADS) {
  test(`ROUND TRIP, ${h.kind}: the head typed on an empty list becomes its canonical line, replays to the kind, renders, and parses back to the same list`, async () => {
    const r = await okPlan([], [h.typed]);
    assert.deepEqual(r.list, [h.canonical]); assert.deepEqual(r.added, [h.canonical]); assert.deepEqual(r.replaced, []);
    assert.equal(r.replay.params?.kind, h.kind); assert.equal(r.replay.stop, null); assert.equal(r.replay.applied, 1);
    const text = L.render(r.list); assert.equal(text, `1. ${h.canonical}`);
    const back = L.parseList(text, K, V); assert.deepEqual(back.list, r.list); assert.equal(back.shape, 'list');
    const again = await L.replay(back.list, K, ctx); assert.deepEqual(again.params, r.replay.params); assert.deepEqual(again.list, r.list);
  });
}

test('`Take [[x]].` alone is a list of one line and a copy of x: params, Recipe ("Take [[x]]."), Python (the bars of x), json', async () => {
  const r = await okPlan([], ['Take [[phrase_003]].']);
  assert.deepEqual(r.replay.params, { kind: 'transform', source: 'phrases/phrase_003', ops: [] });
  assert.deepEqual(r.replay.recipe, ['Take [[phrase_003]].']); assert.match(r.replay.python, /bars = phrase_003\(\)/);
});

// ---- the GOLDEN: replay equals what today's single sentence produces ---------------------------------------------------------------------------------------------------------------------------
test('GOLDEN: the 14 playground phrase notes: the replay of their sentences (one per line) gives the params, Recipe, Python and json of the single sentence, and of the note\'s own sections', async () => {
  const names = Object.keys(PLAYGROUND_PHRASES); assert.equal(names.length, 14);
  for (const n of names) {
    const note = PLAYGROUND_PHRASES[n];
    const paragraph = extractDescription(note).trim();
    const lines = sentences(paragraph);
    const rp = await L.replay(lines, K, ctx);
    assert.equal(rp.stop, null, `${n}: every sentence is readable`); assert.equal(rp.applied, lines.length, n);
    const t = today(paragraph);
    assert.deepEqual(rp.params, t.params, `${n}: params`); assert.deepEqual(rp.recipe, t.recipe, `${n}: Recipe`); assert.equal(rp.python, t.python, `${n}: Python`); assert.equal(rp.json, t.json, `${n}: json`);
    assert.equal((extractRecipeSection(note) ?? '').trim(), rp.recipe.join('\n'), `${n}: the Recipe of the note itself`);
    assert.equal((extractPythonSection(note) ?? '').trim(), rp.python.trim(), `${n}: the Python of the note itself`);
    const stored = readPhraseNote(note); assert.ok(stored.ok, n);
    assert.deepEqual(canonical((stored as { ok: true; value: GrammarParams }).value), canonical(rp.params!), `${n}: the json cache of the note itself (phrase_011 was written with "mode": "vote", which the grammar says is no mode: canonical drops it)`);
    assert.equal(rp.list.join(' '), paragraph, `${n}: the lines are the sentences, in order, lossless`);
  }
});

test('GOLDEN: the 12 extra paragraphs (forks, ghost notes, building, a double up, a seeded thin out, a one-bar morph, a take of an arrangement and of a composition) replay to what the paragraph gave', async () => {
  const all = Object.entries(EXTRA_PARAGRAPHS); assert.equal(all.length, 12);
  for (const [k, paragraph] of all) {
    const lines = sentences(paragraph); const rp = await L.replay(lines, K, ctx); const t = today(paragraph);
    assert.equal(rp.stop, null, k); assert.deepEqual(rp.params, t.params, `${k}: params`); assert.deepEqual(rp.recipe, t.recipe, `${k}: Recipe`); assert.equal(rp.python, t.python, `${k}: Python`); assert.equal(rp.json, t.json, `${k}: json`);
    assert.equal(rp.list.join(' '), paragraph, `${k}: lossless`);
  }
});

test('GOLDEN over ALL the bundled vaults (assets/vaults/*): every phrase note found replays to what its single sentence gave (there are none today: the walk is counted, and a phrase added later is covered)', async () => {
  const root = path.resolve(import.meta.dirname, '../assets/vaults');
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.md')) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (/^```json\s*\n\s*\{\s*\n?\s*"kind":\s*"(?:extend|mix|morph|transform)"/m.test(text) && /^# Description/m.test(text)) found.push(p);
    }
  };
  walk(root);
  for (const p of found) {
    const note = fs.readFileSync(p, 'utf8'); const paragraph = extractDescription(note).trim(); const lines = sentences(paragraph);
    const names = { ...V, bars: [...(V.bars as string[])], phrases: [...(V.phrases as string[])] };
    const rp = await L.replay(lines, K, { vault: names }); const t = parse(paragraph, names);
    if (t.ok) { assert.deepEqual(rp.params, t.params, p); assert.equal(rp.stop, null, p); }
  }
  assert.equal(found.length, 0, 'today no bundled vault (forge-moda, forge-tutorial, music-core, music-theory) holds a phrase note: if one is added, the loop above covers it and this count moves ON PURPOSE');
});

// ---- canonical lines -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('typing a head and then transforms: each becomes ITS canonical sentence, in the order they were applied, and the whole list replays to what the paragraph of the same sentences says', async () => {
  const list = await grow('take phrase_003', 'thin out bars 3 to 5, by half', 'bar 2 is replaced by bar_005');
  assert.deepEqual(list, ['Take [[phrase_003]].', 'Thin out bars 3 to 5, by half, keeping the downbeat.', 'Bar 2 is replaced by [[bar_005]].']);
  const rp = await L.replay(list, K, ctx);
  assert.deepEqual(rp.params, today(list.join(' ')).params); assert.equal(rp.json, today(list.join(' ')).json);
  const keepAfter = await refused(list, ['keep bars 1 to 6']); assert.equal(keepAfter.reason, 'order', 'a Keep typed after the Thin out is refused: the list is never re-sorted');
});

// ---- modifiers, replace in place ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a modifier line edits the head\'s segment: the line is appended, the params change, the head line itself is NOT rewritten', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'make it 20 percent slower', 'Make it 8 bars long');
  assert.deepEqual(list, ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Make it 8 bars long.']);
  const rp = await L.replay(list, K, ctx); const p = rp.params as unknown as { bars: number; tempo_change_pct: number };
  assert.equal(p.bars, 8); assert.equal(p.tempo_change_pct, -20); assert.equal(rp.applied, 3);
});

test('a modifier REPLACES the earlier modifier of the same segment IN PLACE; the preview names what it replaces; the other segment and the lines after stay where they are', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Make it 8 bars long.', 'Bar 2 is replaced by [[bar_009]].');
  const r = await okPlan(list, ['Make it 10 percent faster.']);
  assert.deepEqual(r.list, ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 10 percent faster.', 'Make it 8 bars long.', 'Bar 2 is replaced by [[bar_009]].'], 'in place, nothing moved');
  assert.deepEqual(r.replaced.map((x) => x.sentence), ['Make it 20 percent slower.']); assert.deepEqual(r.added, ['Make it 10 percent faster.']);
  assert.equal((r.replay.params as unknown as { tempo_change_pct: number }).tempo_change_pct, 10);
  const r2 = await okPlan(r.list, ['Make it 6 bars long.']);
  assert.deepEqual(r2.list, ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 10 percent faster.', 'Make it 6 bars long.', 'Bar 2 is replaced by [[bar_009]].']);
  assert.deepEqual(r2.replaced.map((x) => x.sentence), ['Make it 8 bars long.']);
});

test('a modifier a head cannot take is refused in words and writes nothing: a tempo after a Morph, a length after a Mix or a Take (the sentence service is not asked: the grammar read it, the head cannot)', async () => {
  const morph = await grow('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.');
  const a = await refused(morph, ['Make it 10 percent faster.']); assert.match(a.message, /tempo/i); assert.notEqual(a.reason, 'blocked');
  const mix = await grow('Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.');
  assert.match((await refused(mix, ['Make it 3 bars long.'])).message, /Extend or a Morph|mix/i);
  const take = await grow('Take [[phrase_003]].');
  assert.match((await refused(take, ['Make it 3 bars long.'])).message, /Extend or a Morph|take/i);
  assert.match((await refused([], ['Make it 3 bars long.'])).message, /Extend, Mix, Morph, Take or Play/, 'with no head there is nothing to edit');
});

test('the conflict subjects of a phrase: a head segment by name, a fork by bar number, a thin out and a double up by range and row, the mix\'s threshold and ghost notes; structure steps never conflict', () => {
  const s = (t: string) => L.subjectOf(t, K);
  assert.equal(s('Make it 10 percent faster.'), 'tempo'); assert.equal(s('Make it 3 percent slower.'), 'tempo'); assert.equal(s('Make it 8 bars long.'), 'length');
  assert.equal(s('Bar 3 is replaced by [[bar_009]].'), 'fork:3'); assert.equal(s('bar 3 is replaced by bar_005'), 'fork:3'); assert.notEqual(s('Bar 4 is replaced by [[bar_009]].'), s('Bar 3 is replaced by [[bar_009]].'));
  assert.equal(s('Thin out bars 3 to 5, by half, keeping the downbeat.'), 'thin:3-5:'); assert.equal(s('Thin out bars 3 to 5, kick row, by 30 percent, keeping the downbeat.'), 'thin:3-5:kick');
  assert.equal(s('Double up bars 3 to 5, kick row.'), 'double:3-5:kick'); assert.equal(s('Double up bar 2.'), 'double:2-2:');
  assert.equal(s('Threshold 40 percent.'), 'threshold'); assert.equal(s('With ghost notes.'), 'ghost');
  for (const t of ['Keep bars 1 to 2.', 'Delete bar 3.', 'Copy bars 1 to 2.', 'Move bars 1 to 2 one bar left.']) assert.equal(s(t), null, t);
  for (const h of ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Mix [[a]] and [[b]], 50 percent [[a]], as a vote.', 'Morph [[a]] into [[b]] over 5 bars, in musical order.', 'Take [[phrase_003]].']) assert.equal(s(h), 'head', h);
  assert.equal(L.subjectOf('Make it 8 bars long.', 'arrangement'), null, 'the other kinds keep their own rule');
});

test('a fork of the same bar replaces the fork; a thin out of the same range and row replaces the thin out; another range or another row adds a line; a double up never replaces a thin out', async () => {
  const list = await grow('Take [[phrase_003]].', 'Bar 2 is replaced by [[bar_005]].', 'Thin out bars 3 to 5, by half, keeping the downbeat.');
  const f = await okPlan(list, ['Bar 2 is replaced by [[bar_009]].']); assert.deepEqual(f.list[1], 'Bar 2 is replaced by [[bar_009]].'); assert.equal(f.list.length, 3); assert.deepEqual(f.replaced.map((x) => x.sentence), ['Bar 2 is replaced by [[bar_005]].']);
  const t = await okPlan(list, ['Thin out bars 3 to 5, by 30 percent, keeping the downbeat.']); assert.equal(t.list.length, 3); assert.equal(t.list[2], 'Thin out bars 3 to 5, by 30 percent, keeping the downbeat.');
  const other = await okPlan(list, ['Thin out bars 3 to 5, kick row, by half, keeping the downbeat.']); assert.equal(other.list.length, 4); assert.deepEqual(other.replaced, []);
  const dbl = await okPlan(list, ['Double up bars 3 to 5.']); assert.equal(dbl.list.length, 4); assert.deepEqual(dbl.replaced, []);
  const three = await okPlan(list, ['Bar 3 is replaced by [[bar_009]].']); assert.equal(three.list.length, 4);
});

// ---- head replacement ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a later HEAD replaces line 1 (the preview says so); the lines still valid for the new kind stay: forks and a Keep survive a change from Extend to Morph', async () => {
  const list = await grow('Extend [[bar_005]] to 6 bars, repeating with fills.', 'Bar 2 is replaced by [[bar_009]].', 'Keep bars 1 to 4.');
  const r = await okPlan(list, ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.']);
  assert.deepEqual(r.list, ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Bar 2 is replaced by [[bar_009]].', 'Keep bars 1 to 4.']);
  assert.deepEqual(r.replaced.map((x) => x.sentence), ['Extend [[bar_005]] to 6 bars, repeating with fills.']);
  assert.equal(r.replay.stop, null); assert.equal(r.replay.applied, 3); assert.equal(r.replay.params?.kind, 'morph');
  const copy = await okPlan(list, ['Take [[phrase_003]].']);
  assert.deepEqual(copy.list, ['Take [[phrase_003]].', 'Bar 2 is replaced by [[bar_009]].', 'Keep bars 1 to 4.']); assert.equal(copy.replay.params?.kind, 'transform');
});

test('a head change leaves a line that is no longer valid where it is: the replay STOPS there with the unreadable-line wording, the lines before it show, nothing is dropped, and the plan is still accepted', async () => {
  const list = await grow('Extend [[bar_005]] to 6 bars, repeating with fills.', 'Make it 20 percent slower.', 'Bar 2 is replaced by [[bar_009]].');
  const r = await okPlan(list, ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.']);
  assert.equal(r.list.length, 3, 'every line is kept'); assert.equal(r.list[1], 'Make it 20 percent slower.', 'the line that stopped the replay is kept as written');
  assert.ok(r.replay.stop !== null); assert.equal(r.replay.stop!.index, 1); assert.equal(r.replay.stop!.reason, 'unreadable'); assert.equal(r.replay.applied, 1);
  const words = L.stopNotice(r.replay.stop!, r.replay.applied);
  assert.match(words, /^Line 2 is not a sentence I can read; the note shows line 1\./); assert.match(words, /tempo/i);
  assert.equal(r.replay.params?.kind, 'morph', 'the note shows the new head');
  assert.deepEqual(r.added, ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.']);
});

test('a head that says a segment itself ("to 12 bars", "20 percent slower") supersedes the earlier modifier line of that segment (the typed words win); a head that is silent about it keeps the modifier', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Make it 8 bars long.');
  const says = await okPlan(list, ['Extend [[bar_006]] to 12 bars, repeating with fills, 5 percent faster.']);
  assert.deepEqual(says.list, ['Extend [[bar_006]] to 12 bars, repeating with fills, 5 percent faster.']);
  assert.deepEqual(says.replaced.map((x) => x.sentence).sort(), ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Make it 8 bars long.'].sort());
  const params = says.replay.params as unknown as { bars: number; tempo_change_pct: number; source: string };
  assert.equal(params.bars, 12); assert.equal(params.tempo_change_pct, 5); assert.equal(params.source, 'bar_006');
  const silent = await okPlan(list, ['Extend [[bar_006]] repeating with fills.']);
  assert.equal(silent.list[1], 'Make it 20 percent slower.'); assert.equal(silent.list[2], 'Make it 8 bars long.'); assert.deepEqual(silent.replaced.map((x) => x.sentence), ['Extend [[bar_005]] to 4 bars, repeating with fills.']);
  assert.equal((silent.replay.params as unknown as { bars: number }).bars, 8, 'the head said no length: the 8 bars of the modifier hold');
});

test('a typed text of SEVERAL sentences (a whole description of a phrase) appends each as its own line, and a head in it replaces line 1', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.');
  const r = await okPlan(list, sentences('Take [[phrase_003]]. Keep bars 1 to 2. Bar 1 is replaced by [[bar_009]].'));
  assert.deepEqual(r.list, ['Take [[phrase_003]].', 'Keep bars 1 to 2.', 'Bar 1 is replaced by [[bar_009]].']);
});

// ---- structure before density ----------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a structure step after a density step is REFUSED in words ("Do the structure steps first"), the list is not changed and not re-sorted, and the refusal is not one the sentence service could fix', async () => {
  const list = await grow('Take [[phrase_003]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.');
  const r = await refused(list, ['Keep bars 1 to 3.']);
  assert.equal(r.reason, 'order'); assert.match(r.message, /Do the structure steps first/); assert.match(r.message, /Keep bars 1 to 3\./);
  const dbl = await refused(await grow('Take [[phrase_003]].', 'Double up bar 1.'), ['Delete bar 2.']); assert.equal(dbl.reason, 'order');
  const fine = await okPlan(await grow('Take [[phrase_003]].', 'Keep bars 1 to 6.'), ['Thin out bars 1 to 2, by half, keeping the downbeat.']);
  assert.deepEqual(fine.list.slice(1), ['Keep bars 1 to 6.', 'Thin out bars 1 to 2, by half, keeping the downbeat.']);
  const sev = await refused(list, ['Copy bar 1.', 'Keep bars 1 to 2.']); assert.equal(sev.reason, 'order', 'even when it is the second of two typed sentences');
});

test('a hand-edited list whose Keep comes after a Thin out stops the replay at the Keep with the grammar\'s reason; the lines before it show', async () => {
  const rp = await L.replay(['Take [[phrase_003]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.', 'Keep bars 1 to 3.'], K, ctx);
  assert.equal(rp.applied, 2); assert.equal(rp.stop?.index, 2); assert.equal(rp.stop?.code, 'order');
  assert.match(L.stopNotice(rp.stop!, rp.applied), /^Line 3 is not a sentence I can read; the note shows lines 1 and 2\. Expected "Keep" to come before any "Thin out" or "Double up"/);
});

// ---- the seed is drawn ONCE ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('drawSeeds: a random line gets its seed drawn ONCE, stored in the sentence ("in seeded order, seed 3", "chosen by seed 3"); a line with a seed, or without anything random, is not touched', () => {
  let calls = 0; const draw = (): number => { calls++; return 3; };
  assert.deepEqual(L.drawSeeds(['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order.'], K, draw), ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 3.']); assert.equal(calls, 1);
  assert.deepEqual(L.drawSeeds(['Mix [[bar_005]] and [[bar_006]], 30 percent [[bar_005]], as a path, in seeded order.'], K, draw), ['Mix [[bar_005]] and [[bar_006]], 30 percent [[bar_005]], as a path, in seeded order, seed 3.']);
  assert.deepEqual(L.drawSeeds(['Thin out bars 3 to 5, by half, chosen at random.'], K, draw), ['Thin out bars 3 to 5, by half, chosen by seed 3.']);
  calls = 0;
  const same = ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 7.', 'Thin out bars 3 to 5, by half, chosen by seed 9.', 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', 'Keep bars 1 to 2.'];
  assert.deepEqual(L.drawSeeds(same, K, draw), same); assert.equal(calls, 0, 'nothing random without a seed: the draw is never asked');
  assert.deepEqual(L.drawSeeds(['Play [[phrase_001]] on the [[rock]] kit.'], 'arrangement', draw), ['Play [[phrase_001]] on the [[rock]] kit.']);
});

test('a drawn seed is STORED: the planned list carries it, and the replay, the replay of the replay, and a re-render give the same params and the same bars; a plan with no draw (a replay) never asks for one', async () => {
  const lines = L.drawSeeds(['Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order.', 'Take [[phrase_003]].'].slice(0, 1), K, () => 41);
  const r = await okPlan([], lines); assert.equal(r.list[0], 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 41.');
  const a = await L.replay(r.list, K, ctx), b = await L.replay(L.parseList(L.render(r.list), K, V).list, K, ctx);
  assert.deepEqual(a.params, b.params); assert.equal(a.json, b.json); assert.equal(a.python, b.python); assert.equal((a.params as unknown as { seed: number }).seed, 41);
  const thin = await okPlan(await grow('Take [[phrase_003]].'), L.drawSeeds(['Thin out bars 1 to 2, by half, chosen at random.'], K, () => 12));
  assert.equal(thin.list[1], 'Thin out bars 1 to 2, by half, chosen by seed 12.'); assert.match(thin.replay.python, /keep='seeded', seed=12/);
});

test('the default draw is a whole number from 0 to 999 and is not the same number every time', () => {
  const seen = new Set<number>(); for (let i = 0; i < 40; i++) { const n = L.defaultSeed(); assert.ok(Number.isInteger(n) && n >= 0 && n <= 999, String(n)); seen.add(n); }
  assert.ok(seen.size > 1);
});

// ---- migration ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('MIGRATION: the Description of EVERY fixture (a paragraph) is split into its sentences when every one is readable (shape paragraph, lossless), in any order a head and forks were written', () => {
  const all = [...Object.keys(PLAYGROUND_PHRASES).map((n) => extractDescription(PLAYGROUND_PHRASES[n]).trim()), ...Object.values(EXTRA_PARAGRAPHS)]; assert.equal(all.length, 26);
  for (const text of all) { const p = L.parseList(text, K, V); assert.equal(p.shape, 'paragraph', text); assert.equal(p.list.join(' '), text); assert.ok(p.list.length >= 1); }
  const forkFirst = 'Extend [[bar_005]] to 4 bars, repeating with fills. Bar 3 is replaced by [[bar_009]]. Bar 1 is replaced by [[bar_002]].';
  assert.equal(L.parseList(forkFirst, K, V).shape, 'paragraph');
});

test('MIGRATION: a paragraph with a sentence the grammar cannot read stays ONE legacy line (and a list says so by its shape); an empty Description is an empty list', () => {
  const p = L.parseList('Extend [[bar_005]] to 4 bars, repeating with fills. Sprinkle some salt.', K, V); assert.equal(p.shape, 'legacy'); assert.equal(p.list.length, 1);
  assert.equal(L.parseList('', K, V).shape, 'empty'); assert.deepEqual(L.parseList('', K, V).list, []);
});

test('MIGRATION: the first sentence typed onto a legacy paragraph is APPENDED to its split lines: the note becomes a list, same sentences, same order, plus the new line', async () => {
  const paragraph = extractDescription(PLAYGROUND_PHRASES.phrase_002).trim();
  const before = L.parseList(paragraph, K, V).list;
  const r = await okPlan(before, ['Threshold 40 percent.']);
  assert.deepEqual(r.list, [before[0], 'Threshold 40 percent.'], 'the threshold line was replaced in place (a conflict by name), nothing else moved');
  assert.deepEqual(r.replaced.map((x) => x.sentence), ['Threshold 65 percent.']);
});

// ---- hand edits ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a hand-edited list: a deleted middle line recomputes from the lines that are left; a line that cannot be read stops the replay before it and the lines after it are kept as written', async () => {
  const list = await grow('Take [[phrase_003]].', 'Keep bars 1 to 6.', 'Bar 2 is replaced by [[bar_009]].');
  const cut = L.removeAt(list, 1); const rp = await L.replay(cut, K, ctx); assert.equal(rp.stop, null); assert.deepEqual(rp.params, { kind: 'transform', source: 'phrases/phrase_003', ops: [], overrides: { '2': 'bars/bar_009' } });
  const broken = [list[0], 'Keep bars one to banana.', list[2]]; const rb = await L.replay(broken, K, ctx);
  assert.equal(rb.applied, 1); assert.equal(rb.stop?.index, 1); assert.deepEqual(rb.list, broken); assert.equal(rb.params?.kind, 'transform');
  assert.equal((await L.replay(['Keep bars 1 to 2.', 'Take [[phrase_003]].'], K, ctx)).applied, 0, 'nothing readable when line 1 is not a head');
});

test('a plan against a list that already has an unreadable line is blocked in words, EXCEPT a new head, which replaces line 1 and so can repair it', async () => {
  const broken = ['Extend [[nobody_here]] to 4 bars, repeating with fills.', 'Keep bars 1 to 2.'];
  const blocked = await refused(broken, ['Make it 3 bars long.']); assert.equal(blocked.reason, 'blocked');
  const fixed = await okPlan(broken, ['Extend [[bar_005]] to 4 bars, repeating with fills.']); assert.equal(fixed.replay.stop, null); assert.equal(fixed.replay.applied, 2);
});

// ---- the strip (sliders): params -> lines ------------------------------------------------------------------------------------------------------------------------------------------------------
test('the STRIP writes lines: a Bars change on an Extend writes the length modifier line (replaced in place the next time), a Tempo change the tempo line; the head line is not rewritten', () => {
  const head = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
  const p0 = parse(head, V) as { ok: true; params: GrammarParams }; const params = p0.params as unknown as Record<string, unknown>;
  const l1 = L.listAfterParams([head], { ...params, bars: 8 } as unknown as GrammarParams, K, ctx); assert.deepEqual(l1, [head, 'Make it 8 bars long.']);
  const l2 = L.listAfterParams(l1, { ...params, bars: 6 } as unknown as GrammarParams, K, ctx); assert.deepEqual(l2, [head, 'Make it 6 bars long.'], 'replaced in place, not appended');
  const l3 = L.listAfterParams(l2, { ...params, bars: 6, tempo_change_pct: -15 } as unknown as GrammarParams, K, ctx); assert.deepEqual(l3, [head, 'Make it 6 bars long.', 'Make it 15 percent slower.']);
  const l4 = L.listAfterParams(l3, { ...params, bars: 4, tempo_change_pct: -15 } as unknown as GrammarParams, K, ctx); assert.deepEqual(l4, [head, 'Make it 15 percent slower.'], 'back at what the head says: the modifier line goes, the list is tidy');
});

test('the STRIP: a Style or a Source change rewrites the HEAD line (a head segment), keeps every other line, and the replay of the result is the params the strip wrote', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Bar 2 is replaced by [[bar_009]].');
  const rp = await L.replay(list, K, ctx); const params = rp.params as unknown as Record<string, unknown>;
  const next = L.listAfterParams(list, { ...params, style: 'building', source: 'bar_006' } as unknown as GrammarParams, K, ctx);
  assert.equal(next[0], 'Extend [[bar_006]] to 4 bars, building up.'); assert.deepEqual(next.slice(1), list.slice(1));
  assert.deepEqual((await L.replay(next, K, ctx)).params, { ...params, style: 'building', source: 'bar_006' });
});

test('the STRIP: a fork the "Edit this bar" flow added or took away is a fork LINE (added, replaced in place, removed); a mix\'s weight and a morph\'s order rewrite the head; an unreachable params (a different kind) is written as the canonical lines of the params', async () => {
  const list = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.');
  const params = (await L.replay(list, K, ctx)).params as unknown as Record<string, unknown>;
  const withFork = L.listAfterParams(list, { ...params, overrides: { '2': 'bars/bar_009' } } as unknown as GrammarParams, K, ctx); assert.deepEqual(withFork, [...list, 'Bar 2 is replaced by [[bar_009]].']);
  const swapped = L.listAfterParams(withFork, { ...params, overrides: { '2': 'bars/bar_002' } } as unknown as GrammarParams, K, ctx); assert.deepEqual(swapped, [...list, 'Bar 2 is replaced by [[bar_002]].']);
  const gone = L.listAfterParams(swapped, params as unknown as GrammarParams, K, ctx); assert.deepEqual(gone, list);
  const mix = await grow('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Threshold 40 percent.');
  const mp = (await L.replay(mix, K, ctx)).params as unknown as Record<string, unknown>;
  const m2 = L.listAfterParams(mix, { ...mp, weight: 0.2 } as unknown as GrammarParams, K, ctx); assert.deepEqual(m2, ['Mix [[bar_005]] and [[bar_006]], 20 percent [[bar_005]], as a vote.', 'Threshold 40 percent.']);
  const other = parse('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', V) as { ok: true; params: GrammarParams };
  assert.deepEqual(L.listAfterParams(list, other.params, K, ctx), ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.']);
});

test('the STRIP never loses a Keep (an ops line) and never writes a list the replay cannot read back to the params: it falls back to the canonical lines of the params', async () => {
  const list = await grow('Extend [[bar_005]] to 6 bars, repeating with fills.', 'Keep bars 1 to 2.');
  const params = (await L.replay(list, K, ctx)).params as unknown as Record<string, unknown>;
  const next = L.listAfterParams(list, { ...params, style: 'building' } as unknown as GrammarParams, K, ctx);
  assert.deepEqual(next, ['Extend [[bar_005]] to 6 bars, building up.', 'Keep bars 1 to 2.']);
  const rp = await L.replay(next, K, ctx); assert.equal(rp.stop, null);
  const legacy = L.listAfterParams(['this is not a sentence'], { ...params } as unknown as GrammarParams, K, ctx);
  assert.deepEqual(legacy, ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Keep bars 1 to 2.'], 'an unreadable list is replaced by the canonical lines of the params, as the strip always replaced the Description');
});

// ---- never throws / corruption ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('NEVER THROWS: a replay of any shuffle, cut or repetition of the lines of every fixture returns a result (never an exception), and a corrupted line stops the replay AT that line', async () => {
  const lines = [...Object.keys(PLAYGROUND_PHRASES).flatMap((n) => sentences(extractDescription(PLAYGROUND_PHRASES[n]).trim())), ...Object.values(EXTRA_PARAGRAPHS).flatMap(sentences)];
  let seed = 1; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 120; i++) {
    const n = 1 + rnd(6); const list = Array.from({ length: n }, () => lines[rnd(lines.length)]);
    const rp = await L.replay(list, K, ctx); assert.ok(rp.applied <= list.length); assert.equal(rp.list.length, list.length);
    const cut = list.map((l) => l.slice(0, Math.max(1, l.length - rnd(8)))); await L.replay(cut, K, ctx);
  }
  for (const [name, text] of Object.entries(EXTRA_PARAGRAPHS)) {
    const ls = sentences(text);
    for (let k = 0; k < ls.length; k++) {
      const damaged = ls.map((l, j) => (j === k ? l.replace(/\[\[[^\]]+\]\]|\d+|bars?|Bar|Keep|Thin out|Take|Extend|Mix|Morph/, 'ZZZ') : l));
      if (damaged[k] === ls[k]) continue;
      const rp = await L.replay(damaged, K, ctx); assert.ok(rp.applied <= k, `${name} line ${k + 1}: a damaged line stops the replay at or before it`);
    }
  }
});

test('the undo stack of stage 1 serves a phrase list as it is: an apply that replaced the head is taken back whole (the old head and its modifiers return to their places)', async () => {
  const before = await grow('Extend [[bar_005]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.');
  const r = await okPlan(before, ['Extend [[bar_006]] to 9 bars, repeating with fills, 5 percent faster.']);
  assert.deepEqual(r.list, ['Extend [[bar_006]] to 9 bars, repeating with fills, 5 percent faster.']);
  const st = L.createUndoStack(); st.push({ before, after: r.list, added: r.added, replaced: r.replaced });
  const u = st.undo(r.list)!; assert.deepEqual(u.list, before); const re = st.redo(u.list)!; assert.deepEqual(re.list, r.list);
});

test('describe still says what it said: a head with every segment is ONE sentence (the modifier lines are lines of the list, not of describe)', () => {
  const p = parse('Extend [[bar_005]] to 8 bars, repeating with fills. Make it 20 percent slower.', V) as { ok: true; params: GrammarParams };
  assert.equal(describe(p.params), 'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.');
});
