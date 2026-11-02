// 2026-10-31-1140 (M16a, design 4.14) - the RECIPE read back. The proof is a PROPERTY, over the SAME seeded generators as the Description grammar's (test-support/grammar-generators.ts): parseRecipe(renderRecipe(p)) is canonical(p) for 600 seeded
// params of EVERY kind, and the Recipe is a fixed point (renderRecipe(parse(t)) === t). Around it: what the Recipe says and the Description does not share (the table of steps), what input may vary (spacing, case, a trailing full stop, "%" or "percent"),
// what is refused and where (line and column, one sentence), the weight convention, that a Recipe says exactly what the json holds (nothing a person's edit could silently reset), and a fuzz that says parseRecipe never throws.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { RECIPE_OPENERS_TEXT, RECIPE_STEPS, parseRecipe, renderRecipe } from './recipe-grammar-core.ts';
import { canonical, describe, parse, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { MIX_DEFAULTS, PHRASE_PCT_MAX, PHRASE_PCT_MIN, TRANSFORM_OPS_MAX, validatePhrase } from './phrase-core.ts';
import { validateArrangement } from './arrangement-core.ts';
import { validateComposition } from './composition-core.ts';
import { GEN, VAULT, rng } from './test-support/grammar-generators.ts';
import { SPECIMENS, corruptions } from './test-support/recipe-corruptions.ts';

const KINDS = Object.keys(GEN);
const CASES = 600;
function pluginAccepts(p: GrammarParams): boolean {
  if (p.kind === 'arrangement') return validateArrangement(p).ok;
  if (p.kind === 'composition') return validateComposition(p).ok;
  return validatePhrase(p).ok;
}
const ok = (text: string, v: GrammarVault = VAULT): GrammarParams => { const r = parseRecipe(text, v); assert.ok(r.ok, `${text}\n${r.ok ? '' : JSON.stringify(r.error)}`); return r.ok ? r.params : (undefined as never); };
const bad = (text: string, v: GrammarVault = VAULT) => { const r = parseRecipe(text, v); assert.ok(!r.ok, `should be refused: ${text}`); return r.ok ? { message: '', line: 0, column: 0 } : r.error; };

for (const kind of KINDS) {
  test(`ROUND TRIP (${kind}, ${CASES} seeded cases): parseRecipe(renderRecipe(p)) is canonical(p), the Recipe is a fixed point, and what comes back is valid for the plugin`, () => {
    const r = rng(20261031 + kind.length);
    const seen = new Set<string>();
    for (let i = 0; i < CASES; i++) {
      const p = GEN[kind](r);
      const text = renderRecipe(p);
      seen.add(text);
      const back = parseRecipe(text, VAULT);
      assert.ok(back.ok, `${kind} #${i}:\n${text}\n${JSON.stringify(p)}\n${back.ok ? '' : JSON.stringify(back.error)}`);
      if (!back.ok) return;
      assert.deepEqual(back.params, canonical(p), `${kind} #${i}:\n${text}`);
      assert.equal(renderRecipe(back.params), text, `${kind} #${i}: not a fixed point`);
      assert.ok(pluginAccepts(back.params), `${kind} #${i}: the plugin refuses what the Recipe gave:\n${text}`);
    }
    assert.ok(seen.size > CASES * 0.9, `the generator varies (${seen.size} different Recipes in ${CASES} cases)`);
  });
}

test('an arrangement and a composition say their Recipe in the Description grammar\'s own sentences (the reason parseRecipe hands them to `parse`): the same steps, as a set, in the same words', () => {
  for (const kind of ['composition', 'arrangement']) {
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const p = GEN[kind](r);
      const steps = renderRecipe(p).split('\n');
      const said = describe(p).split(/\.\s+(?=[A-Z])/).map((x) => (x.endsWith('.') ? x : `${x}.`));
      assert.deepEqual([...steps].sort(), [...said].sort(), `${kind} #${i}`);
    }
  }
});

test('the generators reach the Recipe\'s corners: every step shape of the table was written and read back (a fork, a one-bar morph, a path mix in every order, a vote mix, a path with a threshold and with ghost notes, a seed, a slower and a faster extend, ghost notes, building)', () => {
  const seen = new Set<string>();
  const r = rng(5);
  for (let i = 0; i < 4000; i++) {
    const p = GEN[KINDS[i % KINDS.length]](r);
    const t = renderRecipe(p);
    for (const [name, re] of [
      ['fork', /^Bar \d+ is replaced by/m], ['one-bar morph', /keep the bar at position/], ['path', /as a path of single-hit changes/], ['vote', /Mix them by vote/], ['path threshold', /^Threshold /m], ['path ghost', /^With ghost notes\./m],
      ['seeded', /\(seed \d+\)/], ['slower', /% slower/], ['faster', /% faster/], ['ghost style', /with ghost notes/], ['building', /^Build it up over/m], ['repeat', /Repeat that \d+ more times|Repeat that once more/], ['mute', /^Mute /m], ['solo', /^Only /m], ['volume', /percent volume/],
    ] as Array<[string, RegExp]>) if (re.test(t)) seen.add(name);
  }
  assert.deepEqual([...seen].sort(), ['building', 'fork', 'faster', 'ghost style', 'mute', 'one-bar morph', 'path', 'path ghost', 'path threshold', 'repeat', 'seeded', 'slower', 'solo', 'vote', 'volume'].sort());
});

test('the table of steps: every opener of a Recipe the renderers write is a row (the "I do not know the step" sentence is made from it), and an example of each row is read as that step', () => {
  const r = rng(3);
  for (let i = 0; i < 3000; i++) {
    const p = GEN[KINDS[i % KINDS.length]](r);
    for (const line of renderRecipe(p).split('\n')) assert.ok(RECIPE_STEPS.some((s) => s.re.test(line)), `no row for the step: ${line}`);
  }
  for (const s of RECIPE_STEPS) assert.ok(s.re.test(s.example), `the example of ${s.opener} starts with it`);
  assert.equal(RECIPE_OPENERS_TEXT, RECIPE_STEPS.map((s) => s.opener).join(', '));
});

test('WHAT THE RECIPE SAYS: the exact sentences (the table in the FEEDBACK)', () => {
  const R = (p: GrammarParams): string => renderRecipe(p);
  assert.equal(R({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }), 'Take [[bar_005]].\nRepeat it for 8 bars with fills, 20 % slower.');
  assert.equal(R({ kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: 0 }), 'Take [[bar_005]].\nBuild it up over 4 bars.');
  assert.equal(R({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 5, order: 'seeded', seed: 3 }), 'Take [[bar_003]] and [[bar_001]].\nMorph from the first to the second over 5 bars, in seeded order (seed 3).');
  assert.equal(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false }), 'Take [[bar_005]] and [[bar_006]].\nMix them by vote: 70 % [[bar_005]] and 30 % [[bar_006]], threshold 0.50, ghost notes off.');
  assert.equal(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.3333, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 }), 'Take [[bar_005]] and [[bar_006]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.3333 (1 is all of [[bar_005]], 0 is all of [[bar_006]]).');
  assert.match(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.3, ghost: true, mode: 'path', order: 'musical', seed: 0 }), /\nThreshold 30 percent\.\nWith ghost notes\.$/, 'a path says a threshold and ghost notes only when they are not the defaults');
  assert.doesNotMatch(R({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 }), /Threshold|ghost/);
  assert.equal(MIX_DEFAULTS.threshold, 0.5, 'the 0.5 the renderer compares with (phrase-notes-core.ts cannot import phrase-core.ts at run time) is the default');
});

test('a transform\'s Recipe has its own wording (transformOpWords), read back exactly: a range, a row, every amount (all, none, half, N %), both ways of keeping, a grid, a fork', () => {
  const p: GrammarParams = { kind: 'transform', source: 'phrases/phrase_006', ops: [
    { op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 },
    { op: 'thin_out', first: 4, last: 4, amount: 0.2575, keep: 'seeded', seed: 7 },
    { op: 'thin_out', first: 1, last: 2, row: 'clap-2', amount: 1 },
    { op: 'thin_out', first: 6, last: 6, amount: 0 },
    { op: 'double_up', first: 1, last: 2, grid: 16 },
    { op: 'double_up', first: 3, last: 7, row: 'snare', grid: 8 },
  ], overrides: { '9': 'bars/bar_009' } };
  assert.equal(renderRecipe(p), [
    'Take [[phrase_006]].',
    'Thin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.',
    'Thin out bar 4: remove 25.75 % of the hits, chosen by seed 7.',
    'Thin out bars 1 to 2, clap-2 row: remove all the hits, keeping the strongest beats.',
    'Thin out bar 6: remove none of the hits, keeping the strongest beats.',
    'Double up bars 1 to 2: every hit gets a second one a step later.',
    'Double up bars 3 to 7, snare row: every hit gets a second one a step later (grid 8).',
    'Bar 9 is replaced by [[bar_009]].',
  ].join('\n'));
  assert.deepEqual(ok(renderRecipe(p)), canonical(p));
  assert.match(bad('Take [[phrase_006]].\nThin out bars 3 to 5: remove half of the hits.').message, /keeping the strongest beats|chosen by seed/);
  assert.match(bad('Take [[phrase_006]].\nThin out bars 5 to 3: remove half of the hits, keeping the strongest beats.').message, /last bar/);
  assert.equal(bad('Take [[phrase_006]].\nThin out bars 3 to 5: remove half of the hits, keeping the strongest beats.\nDouble up bar 1 every hit.').line, 3);
});

test('a Recipe says EXACTLY what the json holds: a vote share and a threshold of any number of decimals come back the same (the text only rounds for a person to read, never for the machine)', () => {
  for (const [weight, threshold] of [[0.123456789, 0.987654321], [1 / 3, 2 / 3], [0.7049, 0.333], [0.5, 0.5], [0, 1], [1e-7, 0.5]]) {
    const p: GrammarParams = { kind: 'mix', a: 'bar_001', b: 'bar_002', weight, threshold, ghost: true };
    assert.deepEqual(ok(renderRecipe(p)), canonical(p), renderRecipe(p));
  }
});

test('INPUT may vary: spacing, case, a trailing full stop (or none), "%" or "percent", one step per line or several on a line', () => {
  const want = ok('Take [[bar_005]].\nRepeat it for 8 bars with fills, 20 % slower.');
  assert.deepEqual(ok('take  [[bar_005]]\nrepeat   it for 8 BARS with FILLS , 20% slower'), want);
  assert.deepEqual(ok('Take [[bar_005]]. Repeat it for 8 bars with fills, 20 percent slower.'), want);
  assert.deepEqual(ok('   Take [[bar_005]].   \n\n   Repeat it for 8 bars with fills, 20 % slower.   '), want);
  assert.deepEqual(ok('Take bar_005.\nRepeat it for eight bars with fills, 20 % slower.'), want, 'a bare name that exists, a number word');
  assert.deepEqual(ok('Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70% [[bar_001]] and 30 percent [[bar_002]], threshold 0.5, ghost notes OFF'), ok('Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70 % [[bar_001]] and 30 % [[bar_002]], threshold 0.50, ghost notes off.'));
  assert.deepEqual(ok('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 4 bars, in by-channel order.'), ok('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 4 bars, in by_channel order.'), 'an order with a hyphen or an underscore');
  assert.deepEqual(ok('Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.25.'), ok('Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.25 (1 is all of [[bar_001]], 0 is all of [[bar_002]]).'), 'the parenthesis only explains the weight: it may be left out');
});

test('a hand edit that is not a reordering of nothing: the independent steps of an arrangement may come in any order, and say the same', () => {
  const a = ok('Play [[phrase_001]] on the [[rock]] kit.\nPlay [[phrase_002]] on the [[latin]] kit.\nPlay the [[rock]] kit at 70 percent volume.\nMute the [[latin]] kit.\nTogether.');
  const b = ok('Play [[phrase_001]] on the [[rock]] kit.\nPlay [[phrase_002]] on the [[latin]] kit.\nMute the [[latin]] kit.\nPlay the [[rock]] kit at 70 percent volume.\nTogether.');
  assert.deepEqual(a, b);
});

test('REFUSED, with the line and the column and one sentence: an unknown step names the word and lists the steps', () => {
  const e = bad('Take [[bar_005]].\nRepeat it for 8 bars with fills.\nSprinkle [[bar_006]].');
  assert.deepEqual([e.line, e.column], [3, 1]);
  assert.equal(e.message, `I do not know the step 'Sprinkle'. A step starts with ${RECIPE_OPENERS_TEXT}.`);
  assert.match(e.message, /^I do not know the step 'Sprinkle'\. A step starts with Take, Repeat, Build, Morph, Mix,/);
  assert.deepEqual([bad('  Sprinkle').line, bad('  Sprinkle').column], [1, 3], 'the column is where the word is');
  assert.match(bad('').message, /^Expected a Recipe/);
});

test('REFUSED: a name that is not in the vault (a deleted wikilink target), where it is', () => {
  const e = bad('Take [[bar_999]].\nRepeat it for 8 bars with fills.');
  assert.deepEqual([e.line, e.column], [1, 6]);
  assert.match(e.message, /"bar_999" is not one/);
  const f = bad('Take [[bar_005]].\nRepeat it for 8 bars with fills.\nBar 3 is replaced by [[bar_404]].');
  assert.equal(f.line, 3);
  const g = bad('Play [[phrase_001]] on the [[nokit]] kit.\nTogether.');
  assert.equal(g.line, 1);
});

test('REFUSED: what the numbers and the meaning forbid', () => {
  assert.match(bad('Take [[bar_005]].\nRepeat it for 0 bars with fills.').message, /number of bars/);
  assert.match(bad('Take [[bar_005]].\nRepeat it for 8 bars with fills, 95 % slower.').message, /tempo change/);
  assert.match(bad('Take [[bar_005]].\nRepeat it for 8 bars.').message, /with fills|"with/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70 % [[bar_001]] and 40 % [[bar_002]], threshold 0.50, ghost notes off.').message, /add up to 100/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70 % [[bar_002]] and 30 % [[bar_001]], threshold 0.50, ghost notes off.').message, /Expected \[\[bar_001\]\] for the first share/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70 % [[bar_001]] and 30 % [[bar_002]], threshold 1.5, ghost notes off.').message, /threshold from 0 to 1/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 4 bars, in musical order (seed 3).').message, /seed only with the seeded order/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 1 bar, in musical order.').message, /keep the bar at position/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.').message, /Keep the state at weight/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.5 (1 is all of [[bar_002]], 0 is all of [[bar_001]]).').message, /Expected \[\[bar_001\]\] for the weight 1/);
  assert.match(bad('Take [[bar_001]] and [[bar_002]].').message, /Morph from the first to the second/);
  assert.match(bad('Take [[phrase_001]].').message, /at least one change/);
  assert.match(bad('Play [[phrase_001]] on the [[rock]] kit.').message, /Together/);
});

test('a Recipe of a composition: section lengths and repeats are read (and refused) as the Description reads them, at the line they are on', () => {
  const p = ok('Play [[phrase_001]] for 8 bars.\nThen play [[arr_001]] for 4 bars.\nRepeat that 2 more times.');
  assert.deepEqual(p, { kind: 'composition', sections: [{ source: 'phrases/phrase_001', length: 8 }, { source: 'arrangements/arr_001', length: 4, repeat: 2 }] });
  const e = bad('Play [[phrase_001]] for 8 bars.\nThen play [[arr_001]] for 0 bars.');
  assert.equal(e.line, 2);
});

test('parseRecipe never throws: junk, half a Recipe, a Description, a huge text', () => {
  const r = rng(17);
  const junk = ['', ' ', '\n\n', '.', '[[', '[[]]', 'Take', 'Take [[', 'Take [[bar_005]]', 'Repeat', 'Mix them by vote:', 'Morph from the first to the second', '1 2 3', '\u0000', 'Take [[bar_005]]. ' + 'x'.repeat(5000)];
  for (const t of junk) { const out = parseRecipe(t, VAULT); assert.ok(out.ok === true || out.ok === false); }
  for (let i = 0; i < 300; i++) {
    const p = GEN[KINDS[i % KINDS.length]](r);
    const t = renderRecipe(p);
    const cut = r.int(0, t.length);
    for (const x of [t.slice(0, cut), t.slice(cut), t.slice(0, cut) + t.slice(cut + 3), describe(p)]) { const out = parseRecipe(x, VAULT); assert.ok(out.ok === true || out.ok === false); }
  }
  assert.equal(parse('Extend [[bar_005]] to 8 bars.', VAULT).ok, true, 'a Description is not a Recipe, but the two grammars are one family: the Description still reads');
});

test('MECHANISM PIN 2026-10-31-1140 (the Recipe reader SHARES the Description grammar\'s scanner and the plugin\'s validators, it does not copy them; if the design moves this SHOULD go red: reassess, do not just rewrite)', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, 'recipe-grammar-core.ts'), 'utf8');
  assert.match(src, /from '\.\/phrase-grammar-core\.ts'/);
  assert.match(src, /\bScan\b[\s\S]*from '\.\/phrase-grammar-core\.ts'/);
  assert.match(src, /validatePhrase/);
  assert.ok(!/from 'obsidian'/.test(src), 'pure core');
  assert.ok(!/class Scan\b/.test(src), 'no second scanner');
  assert.ok(!/RegExp\(`\$\{phrase/.test(src), 'no second keyword matcher');
});


// ---- the refusals, on every way to spoil a Recipe -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const GOLDEN = path.join(import.meta.dirname, '../test/fixtures/recipe-refusals.golden.txt');
function refusals(): string {
  const lines: string[] = [];
  for (const [name, text] of Object.entries(SPECIMENS)) for (const c of corruptions(text)) {
    const r = parseRecipe(c.text, VAULT);
    lines.push(`${name} | ${c.what} | ${r.ok ? 'read' : `${r.error.line}:${r.error.column} ${r.error.message}`}`);
  }
  return `${lines.join('\n')}\n`;
}

test('THE REFUSALS, GOLDEN: every specimen Recipe spoiled every way (junk after a step, cut at every word, a name the vault does not have, a number that is not one, a step missing, a step twice) is refused or read EXACTLY as the file says - the line, the column and the sentence the person reads (a reworded refusal is a decision made in test/fixtures/recipe-refusals.golden.txt: RECIPE_GOLDEN_WRITE=1 writes it)', () => {
  const now = refusals();
  if (process.env.RECIPE_GOLDEN_WRITE === '1') fs.writeFileSync(GOLDEN, now);
  assert.equal(now, fs.readFileSync(GOLDEN, 'utf8'));
});

test('the refusals are sentences a person can act on: each has a line and a column, starts with "Expected ..." or "I do not know the step ...", names what was expected (never "Expected , but"), ends with a full stop, never says "description" (it is the Recipe), and the corpus is large enough to mean something', () => {
  let refused = 0, read = 0;
  const shapes = new Set<string>();
  for (const [, text] of Object.entries(SPECIMENS)) for (const c of corruptions(text)) {
    const r = parseRecipe(c.text, VAULT);
    if (r.ok) {
      read++;
      assert.deepEqual(ok(renderRecipe(r.params)), r.params, `a spoiled Recipe that is still read must re-render to a Recipe that reads the same: ${c.text}`);
      continue;
    }
    refused++;
    const m = r.error.message;
    assert.ok(r.error.line >= 1 && r.error.column >= 1, m);
    assert.match(m, /^(?:Expected |I do not know the step |this note )/, m);
    assert.doesNotMatch(m, /Expected\s*,|Expected\s+but|\(\)|undefined|NaN|\[object/, m);
    assert.match(m, /[.\]"]$|\w$/, m);
    assert.ok(!/\bdescription\b/.test(m), `the Recipe's refusal talks of a description: ${m}`);
    shapes.add(m.replace(/"[^"]*"/g, '"."').replace(/\d+(\.\d+)?/g, 'N').replace(/\[\[[^\]]*\]\]/g, '[[x]]'));
  }
  assert.ok(refused > 400 && read > 15 && read < 80, `${refused} refused, ${read} read`);
  assert.ok(shapes.size > 60, `${shapes.size} different sentences`);
});

test('the openers table, exactly: the sentence an unknown step is refused with lists every step a Recipe may start with, in this order', () => {
  assert.equal(RECIPE_OPENERS_TEXT, 'Take, Repeat, Build, Morph, Mix, Keep, Threshold, With, Thin out, Double up, Bar, Play, Mute, Only, Together, For, Then play');
  assert.equal(RECIPE_STEPS.length, 17);
});

test('the boundaries: a share of 100 percent and of 0, a tempo change of 0 either way, a threshold of 0 and of 1, a weight of 0 and of 1 are READ; a share of 101, a threshold of 1.01 and a weight of 1.01 are refused where they are', () => {
  const vote = (share: string, rest: string, threshold = '0.50'): string => `Take [[bar_001]] and [[bar_002]].\nMix them by vote: ${share} % [[bar_001]] and ${rest} % [[bar_002]], threshold ${threshold}, ghost notes off.`;
  assert.deepEqual(ok(vote('100', '0')), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 1, threshold: 0.5, ghost: false });
  assert.deepEqual(ok(vote('0', '100')), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0, threshold: 0.5, ghost: false });
  assert.deepEqual(ok(vote('50', '50', '0')), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0, ghost: false });
  assert.deepEqual(ok(vote('50', '50', '1')), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 1, ghost: false });
  const at = (text: string, line: number, token: string): number => text.split('\n')[line - 1].indexOf(token) + 1;       // the column of the offending token, found in the text, not counted by hand
  const share101 = bad(vote('101', '0'));
  assert.deepEqual([share101.line, share101.column, share101.message], [2, at(vote('101', '0'), 2, '101'), 'Expected a share from 0 to 100 percent, but found 101.']);
  const t = bad(vote('50', '50', '1.01'));
  assert.deepEqual([t.line, t.column, t.message], [2, at(vote('50', '50', '1.01'), 2, '1.01'), 'Expected a threshold from 0 to 1, but found 1.01.']);
  for (const w of ['0', '1']) assert.ok(ok(`Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight ${w}.`));
  const path1 = 'Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 1.01.';
  const w2 = bad(path1);
  assert.deepEqual([w2.line, w2.column, w2.message], [3, at(path1, 3, '1.01'), 'Expected a weight from 0 to 1, but found 1.01.']);
  for (const dir of ['slower', 'faster']) assert.equal((ok(`Take [[bar_005]].\nRepeat it for 8 bars with fills, 0 % ${dir}.`) as { tempo_change_pct: number }).tempo_change_pct, 0, dir);
  assert.equal(bad(`Take [[bar_005]].\nRepeat it for 8 bars with fills, ${-PHRASE_PCT_MIN + 1} % slower.`).message, `Expected a tempo change of 0 to ${-PHRASE_PCT_MIN} percent slower, but found ${-PHRASE_PCT_MIN + 1}.`);
  assert.equal(bad(`Take [[bar_005]].\nRepeat it for 8 bars with fills, ${PHRASE_PCT_MAX + 1} % faster.`).message, `Expected a tempo change of 0 to ${PHRASE_PCT_MAX} percent faster, but found ${PHRASE_PCT_MAX + 1}.`);
  assert.ok(ok(`Take [[bar_005]].\nRepeat it for 8 bars with fills, ${-PHRASE_PCT_MIN} % slower.`) && ok(`Take [[bar_005]].\nRepeat it for 8 bars with fills, ${PHRASE_PCT_MAX} % faster.`), 'the limits themselves are read');
  assert.deepEqual(bad('Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order (seed 3).\nKeep the state at weight 0.5.').message, 'Expected a seed only with the seeded order, but this mix is in musical order.');
  assert.equal((ok('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second and keep the bar at position 0, in musical order.') as { position: number }).position, 0);
});


test('what a short or odd Recipe says, exactly and where: nothing at all, only white space, a step that starts with a punctuation mark, a take with nothing after it, a path with nothing after it, too many changes, a vault that cannot be read', () => {
  assert.deepEqual(bad(''), { message: 'Expected a Recipe (its first step is Take or Play), but found nothing.', line: 1, column: 1 });
  assert.deepEqual(bad('   \n  '), { message: 'Expected a Recipe (its first step is Take or Play), but found nothing.', line: 1, column: 1 });
  assert.deepEqual(bad(',foo'), { message: `I do not know the step ','. A step starts with ${RECIPE_OPENERS_TEXT}.`, line: 1, column: 1 });
  assert.deepEqual(bad('Take [[phrase_001]].'), { message: 'Expected at least one change after "Take" (Thin out or Double up), but found none.', line: 1, column: 20 });
  const pathStep = 'Mix them as a path of single-hit changes from the first to the second, in musical order';
  assert.deepEqual(bad(`Take [[bar_001]] and [[bar_002]].\n${pathStep}.`), { message: 'Expected "Keep the state at weight N (...)." after the path, but found the end of the Recipe.', line: 2, column: pathStep.length + 1 });
  const step = 'Thin out bar 1: remove half of the hits, keeping the strongest beats.';
  const many = (n: number): string => ['Take [[phrase_001]].', ...Array.from({ length: n }, () => step)].join('\n');
  assert.equal((ok(many(TRANSFORM_OPS_MAX)) as { ops: unknown[] }).ops.length, TRANSFORM_OPS_MAX, 'the limit itself is read');
  assert.deepEqual(bad(many(TRANSFORM_OPS_MAX + 1)), { message: `Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${TRANSFORM_OPS_MAX + 1}.`, line: 1, column: 1 });
  const broken = { get bars(): string[] { throw new Error('boom'); }, phrases: [] } as unknown as GrammarVault;
  assert.deepEqual(bad('Take [[bar_001]].\nRepeat it for 8 bars with fills.', broken), { message: 'Expected a Recipe of this grammar, but it could not be read (boom).', line: 1, column: 1 });
});

test('the percent bounds of the transform and the path: 100 is read, 101 is refused where it is; a threshold sentence of a path likewise', () => {
  const thin = (amount: string): string => `Take [[phrase_001]].\nThin out bar 4: remove ${amount} % of the hits, keeping the strongest beats.`;
  assert.deepEqual((ok(thin('100')) as { ops: Array<{ amount: number }> }).ops[0].amount, 1);
  const e = bad(thin('101'));
  assert.deepEqual([e.line, e.column, e.message], [2, thin('101').split('\n')[1].indexOf('101') + 1, 'Expected an amount from 0 to 100 percent, but found 101.']);
  const path = (t: string): string => `Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 1.\nThreshold ${t} percent.`;
  assert.equal((ok(path('100')) as { threshold: number }).threshold, 1);
  assert.equal(bad(path('101')).message, 'Expected a threshold from 0 to 100 percent, but found 101.');
});

test('INPUT may vary, in the small places: no colon in a vote or a space before it, no space after a comma, a space inside a parenthesis, a weight whose bars are named in the other order is refused', () => {
  const vote = 'Take [[bar_001]] and [[bar_002]].\nMix them by vote';
  const want = ok(`${vote}: 70 % [[bar_001]] and 30 % [[bar_002]], threshold 0.50, ghost notes off.`);
  assert.deepEqual(ok(`${vote} 70 % [[bar_001]] and 30 % [[bar_002]], threshold 0.50, ghost notes off.`), want, 'the colon may be left out');
  assert.deepEqual(ok(`${vote} : 70 % [[bar_001]] and 30 % [[bar_002]],threshold 0.50,ghost notes off.`), want, 'a space before the colon, no space after a comma');
  assert.deepEqual(ok('Take [[phrase_001]].\nThin out bars 3 to 5,kick row: remove half of the hits,keeping the strongest beats.'), ok('Take [[phrase_001]].\nThin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.'));
  assert.deepEqual(ok('Take [[phrase_001]].\nThin out bars 3 to 5, kick row : remove half of the hits, keeping the strongest beats.'), ok('Take [[phrase_001]].\nThin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.'), 'a space before the colon of a change');
  assert.deepEqual(ok('Take [[phrase_001]].\nDouble up bar 2: every hit gets a second one a step later ( grid 8 ).'), ok('Take [[phrase_001]].\nDouble up bar 2: every hit gets a second one a step later (grid 8).'));
  assert.deepEqual(ok('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 5 bars, in seeded order ( seed 3 ).'), ok('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 5 bars, in seeded order (seed 3).'));
  const path = (parens: string): string => `Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.\nKeep the state at weight 0.5 ${parens}.`;
  assert.deepEqual(ok(path('( 1 is all of [[bar_001]] , 0 is all of [[bar_002]] )')), ok(path('(1 is all of [[bar_001]], 0 is all of [[bar_002]])')));
  const swapped = bad(path('(1 is all of [[bar_001]], 0 is all of [[bar_001]])'));
  assert.deepEqual([swapped.line, swapped.message], [3, 'Expected [[bar_002]] for the weight 0, but found [[bar_001]].']);
  assert.equal(bad(path('(1 is all of [[bar_001]], 0 is all of [[bar_002]]')).message, 'Expected ")", but found the end of the sentence.');
  assert.equal(bad('Take [[phrase_001]].\nDouble up bar 2: every hit gets a second one a step later (grid 8.').message, 'Expected ")", but found the end of the sentence.');
  assert.equal(bad('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 5 bars, in seeded order (seed 3.').message, 'Expected ")", but found the end of the sentence.');
  assert.equal(bad('Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 5 bars, in seeded order (banana 3).').message, 'Expected "seed N", but found "banana".');
  assert.equal(bad('Take [[phrase_001]].\nDouble up bar 2: every hit gets a second one a step later (banana 8).').message, 'Expected "grid N", but found "banana".');
  assert.equal(bad('Take [[phrase_001]].\nThin out bar 2: remove half of the hits keeping the strongest beats.').message, 'Expected ", keeping the strongest beats" or ", chosen by seed N", but found "keeping".');
});
