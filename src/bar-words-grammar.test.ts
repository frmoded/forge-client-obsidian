// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - the GRAMMAR half, written RED first (against 5cf8739: `Duplicate` and `Remove` were not verbs, `Move` took only "one bar left" / "one bar right", there was no Morph of two bars of the phrase itself).
// The driver's words (2026-11-19): "add another copy of that bar right after it", "move bar back, left, forward or right", "delete bar", "morph bar2 and bar3 across 5 bars and put them in between 2 and 3". Pinned here, for every new word and refusal:
//   * `Duplicate bar 3.` / `Duplicate bars 3 to 5.` are READ as the existing copy step and WRITTEN as the canonical `Copy bar 3.` (the list shows the canonical word);
//   * `Move bar 3 back|left|earlier|forward|right|later.` with or without `one bar` (also `to the left`), canonical `one bar left` / `one bar right`; `Move bar 3 two bars left.` is READ and REFUSED in words with the hint `Say "Move bar 3 one bar left." twice.` (code `refused`: the service is not asked);
//   * `Remove bar 2.` is Delete (canonical `Delete bar 2.`);
//   * `Morph bars 2 and 3 across 5 bars.` (+ optional place words, a random order stores its seed): the canonical sentence says everything; refusals in words; a structure step, so refused after a Thin out / Double up with the code `order`;
//   * the same words in the Recipe, the json cache, the Python; a corruption fuzz (every token damaged: refused) and a never-throws fuzz (cut, repeated, shuffled) as the card section 24 asks of a parser.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { formatPhraseJson, readPhraseNote, validatePhrase, type PhraseParams } from './phrase-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const EXTEND = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const TAKE = 'Take [[phrase_003]].';
const ok = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `"${text}" should read: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `"${text}" should be refused`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };
const opsOf = (p: GrammarParams): unknown[] => ((p as { ops?: unknown[] }).ops ?? []);

// ---- Duplicate = Copy ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('`Duplicate bar 3.` and `Duplicate bars 3 to 5.` are read as the copy step and written as the canonical `Copy ...`', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Duplicate bar 3.`)), [{ op: 'copy', runs: [[3, 3]] }]);
  assert.deepEqual(opsOf(ok(`${TAKE} Duplicate bars 3 to 5.`)), [{ op: 'copy', runs: [[3, 5]] }]);
  assert.equal(describe(ok(`${TAKE} Duplicate bar 3.`)), 'Take [[phrase_003]]. Copy bar 3.');
  assert.equal(describe(ok(`${TAKE} duplicate bars 3 to 5 and bar 8.`)), 'Take [[phrase_003]]. Copy bars 3 to 5 and bar 8.', 'any case, several ranges as Copy takes them');
  assert.deepEqual(ok(`${TAKE} Duplicate bar 3.`), ok(`${TAKE} Copy bar 3.`), 'the same params as the word Copy');
});
test('Duplicate is valid after ANY head (it is the copy step: carried as `ops` by Extend, Mix and Morph)', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Duplicate bar 2.`)), [{ op: 'copy', runs: [[2, 2]] }]);
  assert.deepEqual(opsOf(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. Duplicate bar 1.')), [{ op: 'copy', runs: [[1, 1]] }]);
  assert.deepEqual(opsOf(ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Duplicate bars 2 to 3.')), [{ op: 'copy', runs: [[2, 3]] }]);
});
test('`Duplicate bar_007` and a bare `Duplicate` are not bar words: refused by the grammar in words (the note copy is the controller\'s action sentence, read before the grammar)', () => {
  assert.match(bad(`${TAKE} Duplicate [[bar_007]].`).message, /bar/i);
  assert.match(bad(`${TAKE} Duplicate.`).message, /bar/i);
});

// ---- Remove = Delete ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('`Remove bar 2.` is Delete (canonical `Delete bar 2.`), also for ranges and several ranges', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Remove bar 2.`)), [{ op: 'delete', runs: [[2, 2]] }]);
  assert.equal(describe(ok(`${TAKE} Remove bars 3 to 5 and bar 8.`)), 'Take [[phrase_003]]. Delete bars 3 to 5 and bar 8.');
  assert.deepEqual(ok(`${TAKE} remove bar 2.`), ok(`${TAKE} Delete bar 2.`));
  assert.deepEqual(opsOf(ok(`${EXTEND} Remove bar 2.`)), [{ op: 'delete', runs: [[2, 2]] }], 'after any head');
});

// ---- Move back / forward ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const LEFT = ['back', 'left', 'earlier', 'one bar back', 'one bar left', 'one bar earlier', '1 bar left', 'a bar earlier', 'to the left', 'one bar to the left', 'backward', 'backwards'];
const RIGHT = ['forward', 'right', 'later', 'one bar forward', 'one bar right', 'one bar later', '1 bar right', 'a bar later', 'to the right', 'one bar to the right', 'forwards'];
for (const [words, by] of [...LEFT.map((w) => [w, -1] as const), ...RIGHT.map((w) => [w, 1] as const)]) {
  test(`Move bar 3 ${words}. is read (${by === -1 ? 'left' : 'right'}) and written as the canonical "one bar ${by === -1 ? 'left' : 'right'}"`, () => {
    const p = ok(`${TAKE} Move bar 3 ${words}.`);
    assert.deepEqual(opsOf(p), [{ op: 'move', runs: [[3, 3]], by }]);
    assert.equal(describe(p), `Take [[phrase_003]]. Move bar 3 one bar ${by === -1 ? 'left' : 'right'}.`);
  });
}
test('Move takes ranges and several ranges in the driver\'s words, after any head; the old words are unchanged', () => {
  assert.equal(describe(ok(`${TAKE} Move bars 3 to 5 back.`)), 'Take [[phrase_003]]. Move bars 3 to 5 one bar left.');
  assert.equal(describe(ok(`${TAKE} Move bar 2, bar 5 forward.`)), 'Take [[phrase_003]]. Move bar 2 and bar 5 one bar right.');
  assert.equal(describe(ok(`${TAKE} Move bars 3 to 5 one bar left.`)), 'Take [[phrase_003]]. Move bars 3 to 5 one bar left.');
  assert.deepEqual(opsOf(ok(`${EXTEND} Move bar 2 right.`)), [{ op: 'move', runs: [[2, 2]], by: 1 }]);
});
test('`Move bar 3 two bars left.` is READ and REFUSED in words with the hint, code "refused" (the service is not asked); three places says "3 times"', () => {
  const e = bad(`${TAKE} Move bar 3 two bars left.`);
  assert.equal(e.code, 'refused');
  assert.match(e.message, /Say "Move bar 3 one bar left\." twice\./);
  assert.match(bad(`${TAKE} Move bars 3 to 5 3 bars right.`).message, /Say "Move bars 3 to 5 one bar right\." 3 times\./);
  assert.match(bad(`${TAKE} Move bar 2 two bars back.`).message, /Say "Move bar 2 one bar left\." twice\./, 'back says left in the hint: the canonical word');
  assert.equal(bad(`${TAKE} Move bar 3 2 bars forward.`).code, 'refused');
  assert.match(bad(`${TAKE} Move bar 3 zero bars left.`).message, /one bar/i);
});
test('Move with no direction, or a direction it does not know, is unreadable in words (the old words still name what is expected)', () => {
  assert.match(bad(`${TAKE} Move bar 3.`).message, /left|right|back|forward/);
  assert.match(bad(`${TAKE} Move bar 3 sideways.`).message, /left|right|back|forward/);
  assert.notEqual(bad(`${TAKE} Move bar 3 sideways.`).code, 'refused');
});

// ---- Morph between two bars of the phrase ---------------------------------------------------------------------------------------------------------------------------------------------------
const MB = (extra: Record<string, unknown> = {}): unknown => ({ op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2, ...extra });
test('`Morph bars 2 and 3 across 5 bars.` is a step of the phrase (not a head): default place between neighbours, the canonical sentence says everything', () => {
  const p = ok(`${EXTEND} Morph bars 2 and 3 across 5 bars.`);
  assert.deepEqual(opsOf(p), [MB()]);
  assert.equal((p as { kind: string }).kind, 'extend', 'the head is still the Extend (the line did not replace it)');
  assert.equal(describe(p), `${EXTEND} Morph bars 2 and 3 across 5 bars, in musical order, and put them between bars 2 and 3.`);
});
const PLACES: Array<[string, unknown, string]> = [
  ['and put them after bar 3', MB({ after: 3 }), 'after bar 3'],
  ['and put them before bar 2', MB({ after: 1 }), 'after bar 1'],
  ['before bar 1', MB({ after: 0 }), 'at the start'],
  ['and put them between bars 2 and 3', MB({ after: 2 }), 'between bars 2 and 3'],
  ['and put them in between bars 2 and 3', MB({ after: 2 }), 'between bars 2 and 3'],
  ['put them in between 2 and 3', MB({ after: 2 }), 'between bars 2 and 3'],
  ['between bar 2 and bar 3', MB({ after: 2 }), 'between bars 2 and 3'],
  ['and put them at the start', MB({ after: 0 }), 'at the start'],
  ['at the beginning', MB({ after: 0 }), 'at the start'],
  ['and put them at the end', MB({ after: 'end' }), 'at the end'],
  ['after bar 6', MB({ after: 6 }), 'after bar 6'],
  ['before bar 4', MB({ after: 3 }), 'after bar 3'],
];
for (const [said, op, words] of PLACES) {
  test(`place words "${said}" are read; canonical says "${words}"`, () => {
    const p = ok(`${EXTEND} Morph bars 2 and 3 across 5 bars ${said}.`);
    assert.deepEqual(opsOf(p), [op]);
    assert.equal(describe(p), `${EXTEND} Morph bars 2 and 3 across 5 bars, in musical order, and put them ${words}.`);
    assert.deepEqual(ok(describe(p)), p, 'the canonical sentence reads back to the same params');
  });
}
test('the default place: two neighbouring bars -> between them; other bars -> after the later one (whichever order they are said in)', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 2 and 5 across 3 bars.`)), [MB({ a: 2, b: 5, bars: 3, after: 5 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 5 and 2 across 3 bars.`)), [MB({ a: 5, b: 2, bars: 3, after: 5 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 3 and 2 across 5 bars.`)), [MB({ a: 3, b: 2, after: 2 })], 'neighbours said backwards: the gap between them');
  assert.equal(describe(ok(`${EXTEND} Morph bars 3 and 2 across 5 bars.`)), `${EXTEND} Morph bars 3 and 2 across 5 bars, in musical order, and put them between bars 2 and 3.`);
});
test('the click\'s words and the long forms are read: "bar 2 and bar 3", "into", "to", "over", "new bars", one new bar says "it"', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bar 2 and bar 3 across 5 bars.`)), [MB()]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bar 2 into bar 3 over 5 new bars.`)), [MB()]);
  assert.deepEqual(opsOf(ok(`${EXTEND} morph bars 2 to 3 across 5 bars`)), [MB()]);
  const one = ok(`${EXTEND} Morph bars 2 and 3 across 1 bar.`);
  assert.deepEqual(opsOf(one), [MB({ bars: 1 })]);
  assert.equal(describe(one), `${EXTEND} Morph bars 2 and 3 across 1 bar, in musical order, and put it between bars 2 and 3.`);
  assert.deepEqual(ok(describe(one)), one);
});
test('orders and the seed: "in seeded order" stores its seed in the sentence; the seed of any other order is refused; by-channel is read', () => {
  const s = ok(`${EXTEND} Morph bars 2 and 3 across 5 bars, in seeded order, seed 17.`);
  assert.deepEqual(opsOf(s), [MB({ order: 'seeded', seed: 17 })]);
  assert.equal(describe(s), `${EXTEND} Morph bars 2 and 3 across 5 bars, in seeded order, seed 17, and put them between bars 2 and 3.`);
  assert.deepEqual(ok(describe(s)), s);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 2 and 3 across 5 bars, in seeded order, seed 17, and put them after bar 3.`)), [MB({ order: 'seeded', seed: 17, after: 3 })], 'the seed segment comes before the place (what drawSeeds writes)');
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 2 and 3 across 5 bars, in by-channel order and put them at the end.`)), [MB({ order: 'by_channel', after: 'end' })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 2 and 3 across 5 bars, in seeded order.`)), [MB({ order: 'seeded', seed: 0 })], 'no seed said: 0 (the controller draws one at the preview)');
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars, in musical order, seed 4.`).message, /seed only with the seeded order/);
});
test('Morph-between is valid after every head, and after other steps; the head Morph [[a]] into [[b]] is unchanged and still a HEAD', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Morph bars 2 and 3 across 5 bars.`)), [MB()]);
  assert.deepEqual(opsOf(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. Morph bars 1 and 2 across 5 bars.')), [MB({ a: 1, b: 2, after: 1 })]);
  assert.deepEqual(opsOf(ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Morph bars 2 and 3 across 5 bars.')), [MB()]);
  assert.deepEqual(opsOf(ok(`${TAKE} Delete bar 1. Morph bars 2 and 3 across 2 bars. Copy bar 1.`)), [{ op: 'delete', runs: [[1, 1]] }, MB({ bars: 2 }), { op: 'copy', runs: [[1, 1]] }]);
  assert.equal((ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.') as { kind: string }).kind, 'morph');
  assert.equal(describe(ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.')), 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.');
});
test('refusals in words: the same bar twice, a number of new bars out of range, no "across", a place that is not a gap, a bar that is not a number', () => {
  assert.match(bad(`${EXTEND} Morph bars 2 and 2 across 5 bars.`).message, /two different bars/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 0 bars.`).message, /1 to 64/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 65 bars.`).message, /1 to 64/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3.`).message, /across/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars, between bars 2 and 5.`).message, /neighbouring/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars after the bar.`).message, /after bar N|bar number/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars across 4 bars.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars, put them somewhere.`).message, /place/);
  assert.match(bad(`${EXTEND} Morph bars 2 and 3 across 5 bars, and put them after bar 3 at the end.`).message, /said twice|end of the sentence/);
});
test('the order rule: a Morph-between, a Duplicate, a Remove and a Move back after a Thin out or a Double up are refused with the code "order" (never re-sorted)', () => {
  const dense = `${TAKE} Thin out bars 1 to 2, by half, keeping the downbeat.`;
  for (const line of ['Morph bars 2 and 3 across 5 bars.', 'Duplicate bar 1.', 'Remove bar 1.', 'Move bar 2 back.']) {
    const e = bad(`${dense} ${line}`);
    assert.equal(e.code, 'order', line);
  }
  assert.ok(parse(`${TAKE} Morph bars 2 and 3 across 5 bars. Thin out bars 1 to 2, by half, keeping the downbeat.`, V).ok, 'steps first, then density: fine');
  assert.equal(validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }, MB()] }).ok, false, 'the validators say the same');
});
test('a line whose first sentence is a step has no head: the phrase list starts with Extend, Mix, Morph or Take (a Morph-between is not read as a head)', () => {
  const e = bad('Morph bars 2 and 3 across 5 bars.');
  assert.match(e.message, /Extend, Mix, Morph or Take|head/i);
  assert.equal(e.code, 'head');
});

// ---- every derived part says it ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const FULL = `${EXTEND} Duplicate bar 2. Move bar 3 back. Remove bar 4. Morph bars 2 and 3 across 5 bars, in seeded order, seed 9, and put them after bar 3.`;
test('json cache: the step is written and read back; the validators know its fields and refuse a wrong one in words', () => {
  const p = ok(FULL) as PhraseParams;
  const json = formatPhraseJson(p);
  assert.match(json, /\{"op": "morph_between", "a": 2, "b": 3, "bars": 5, "order": "seeded", "seed": 9, "after": 3\}/);
  const back = readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  assert.ok(back.ok); assert.deepEqual(back.ok && canonical(back.value as GrammarParams), canonical(p as GrammarParams));
  const op = (o: object): unknown => validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2, ...o }] });
  assert.equal((op({}) as { ok: boolean }).ok, true);
  for (const [o, re] of [[{ a: 0 }, /a/], [{ b: 2 }, /different/], [{ bars: 0 }, /bars/], [{ bars: 65 }, /bars/], [{ order: 'x' }, /order/], [{ seed: -1 }, /seed/], [{ after: -1 }, /after/], [{ after: 'middle' }, /after/], [{ extra: 1 }, /unexpected/i]] as Array<[object, RegExp]>) {
    const r = op(o) as { ok: boolean; message?: string }; assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.message ?? '', re, JSON.stringify(o));
  }
});
test('the Recipe says the step', () => {          // 2026-11-26-1047 (deliberate): the Recipe is no longer read back
  for (const text of [FULL, `${TAKE} Duplicate bars 2 to 3. Morph bars 1 and 4 across 3 bars, put them at the end.`]) {
    const p = ok(text);
    const steps = phraseRecipeSteps(p as PhraseParams);
    assert.ok(steps.some((s) => /^Morph bars \d+ and \d+ across \d+ bars?, in \w[\w-]* order/.test(s)), steps.join(' | '));
  }
});
test('the Python facet says the step with the engine\'s own morph_rhythm (the ends are not used, N + 2 bars are asked and the middle N kept)', () => {
  const py = phrasePython(ok(`${EXTEND} Morph bars 2 and 3 across 5 bars.`) as PhraseParams);
  assert.match(py, /morph_rhythm\(a=bars\[1\], b=bars\[2\], bars=7, order='musical', seed=0\)\[1:-1\]/);
  assert.match(py, /bars\[2:2\] = /);
  assert.match(phrasePython(ok(`${EXTEND} Morph bars 2 and 3 across 5 bars at the end.`) as PhraseParams), /bars = bars \+ /);
});

// ---- fuzz (card section 24) ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const LINES = ['Duplicate bar 3.', 'Duplicate bars 3 to 5 and bar 8.', 'Remove bar 2.', 'Move bar 3 back.', 'Move bars 3 to 5 to the right.', 'Move bar 2 one bar later.',
  'Morph bars 2 and 3 across 5 bars.', 'Morph bar 2 and bar 4 across 3 bars, in seeded order, seed 5, and put them after bar 4.', 'Morph bars 3 and 2 across 1 bar and put it at the end.', 'Morph bars 1 and 2 across 5 bars, in by-channel order, put them before bar 1.'];
test('CORRUPTION FUZZ: every sentence reads; damage each token of it (one at a time) and every damaged sentence is refused', () => {
  let damaged = 0;
  for (const line of LINES) {
    assert.ok(parse(`${EXTEND} ${line}`, V).ok, line);
    const tokens = line.match(/\S+/g)!;
    for (let i = 0; i < tokens.length; i++) {
      const swapped = tokens.map((t, j) => (j === i ? (/[.,]$/.test(t) ? `ZZZ${t.slice(-1)}` : 'ZZZ') : t)).join(' ');
      assert.ok(!parse(`${EXTEND} ${swapped}`, V).ok, `token ${i} of "${line}" damaged -> "${swapped}" should be refused`);
      damaged++;
    }
  }
  assert.ok(damaged > 60);
});
test('NEVER THROWS: cut, repeated and shuffled tokens of every sentence give an answer (ok or an error with a place), never an exception', () => {
  let seed = 7; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const all = LINES.join(' ').match(/\S+/g)!;
  for (let i = 0; i < 400; i++) {
    const line = LINES[rnd(LINES.length)]; const tokens = line.match(/\S+/g)!;
    const variants = [
      tokens.slice(0, rnd(tokens.length + 1)).join(' '),
      [...tokens, ...tokens.slice(rnd(tokens.length))].join(' '),
      tokens.map((t) => ({ t, k: rnd(1000) })).sort((x, y) => x.k - y.k).map((x) => x.t).join(' '),
      Array.from({ length: 1 + rnd(10) }, () => all[rnd(all.length)]).join(' '),
    ];
    for (const v of variants) for (const head of [EXTEND, TAKE, '']) {
      const r = parse(`${head} ${v}`.trim(), V);
      assert.ok(r.ok === true || (typeof r.error.message === 'string' && r.error.line >= 1 && r.error.column >= 1), v);
    }
  }
});

// ---- 2026-11-19-0996b mutation triage: the validator of a morph_between step (phrase-core.ts validateMorphBetween), every field, every wrong value, the whole answer ------------------------------------------------------------------------------
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:328 "', '" -> "''" (the field list in the unexpected-field message)
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:329 "&&" -> "||" (a fractional bar, 2.5, is not a whole number: typeof alone said yes)
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:331 `if (!whole(raw.b) || raw.b < 1)` -> false, "||" -> "&&" and its message -> "''" (bar b: 0, -1, 2.5, "3", NaN, Infinity, null, missing)
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:335 "', '" -> "''" (the list of orders in the order message)
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:339 "0" -> "1" (the seed of every order but the seeded one is 0, whatever was stored: the return line)
const MB_VALIDATE: Array<[Record<string, unknown>, string, string]> = [
  [{}, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{ a: 0 }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got 0."],
  [{ a: -1 }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got -1."],
  [{ a: 2.5 }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got 2.5."],
  [{ a: "2" }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got \"2\"."],
  [{ a: NaN }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ a: Infinity }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ a: null }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ a: 9007199254740992 }, "", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got 9007199254740992."],
  [{ a: 1 }, "", "OK {\"op\":\"morph_between\",\"a\":1,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{ a: 64 }, "", "OK {\"op\":\"morph_between\",\"a\":64,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{}, "a", "ERR ops[0].a must be a bar number of this phrase (a whole number, 1 or more), got undefined."],
  [{ b: 0 }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got 0."],
  [{ b: -1 }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got -1."],
  [{ b: 2.5 }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got 2.5."],
  [{ b: "3" }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got \"3\"."],
  [{ b: NaN }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ b: Infinity }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ b: null }, "", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got null."],
  [{ b: 1 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":1,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{}, "b", "ERR ops[0].b must be a bar number of this phrase (a whole number, 1 or more), got undefined."],
  [{ a: 4, b: 4 }, "", "ERR ops[0]: a and b must be two different bars, got bar 4 twice."],
  [{ a: 1, b: 1 }, "", "ERR ops[0]: a and b must be two different bars, got bar 1 twice."],
  [{ bars: 0 }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got 0."],
  [{ bars: 65 }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got 65."],
  [{ bars: 2.5 }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got 2.5."],
  [{ bars: "5" }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got \"5\"."],
  [{ bars: 1 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":1,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{ bars: 64 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":64,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{}, "bars", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got undefined."],
  [{ bars: NaN }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got null."],
  [{ bars: -1 }, "", "ERR ops[0].bars must be a whole number of NEW bars from 1 to 64, got -1."],
  [{ order: "x" }, "", "ERR ops[0].order must be one of musical, seeded, by_channel, got \"x\"."],
  [{ order: 5 }, "", "ERR ops[0].order must be one of musical, seeded, by_channel, got 5."],
  [{ order: null }, "", "ERR ops[0].order must be one of musical, seeded, by_channel, got null."],
  [{}, "order", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{ order: "seeded", seed: 7 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"seeded\",\"seed\":7,\"after\":2}"],
  [{ order: "seeded" }, "seed", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"seeded\",\"seed\":0,\"after\":2}"],
  [{ order: "by_channel", seed: 9 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"by_channel\",\"seed\":0,\"after\":2}"],
  [{ order: "musical", seed: 9 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":2}"],
  [{ order: "seeded", seed: 0 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"seeded\",\"seed\":0,\"after\":2}"],
  [{ seed: -1 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got -1."],
  [{ seed: 1.5 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got 1.5."],
  [{ seed: "3" }, "order", "ERR ops[0].seed must be a whole number, 0 or more, got \"3\"."],
  [{ order: "seeded", seed: -1 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got -1."],
  [{ order: "seeded", seed: 1.5 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got 1.5."],
  [{ order: "seeded", seed: "3" }, "", "ERR ops[0].seed must be a whole number, 0 or more, got \"3\"."],
  [{ order: "seeded", seed: null }, "", "ERR ops[0].seed must be a whole number, 0 or more, got null."],
  [{ order: "musical", seed: -1 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got -1."],
  [{ order: "by_channel", seed: 2.5 }, "", "ERR ops[0].seed must be a whole number, 0 or more, got 2.5."],
  [{ seed: Infinity }, "", "ERR ops[0].seed must be a whole number, 0 or more, got null."],
  [{ seed: NaN }, "", "ERR ops[0].seed must be a whole number, 0 or more, got null."],
  [{ after: -1 }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got -1."],
  [{ after: "middle" }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got \"middle\"."],
  [{ after: 1.5 }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got 1.5."],
  [{ after: "2" }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got \"2\"."],
  [{ after: null }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got null."],
  [{ after: 0 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":0}"],
  [{ after: "end" }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":\"end\"}"],
  [{ after: 99 }, "", "OK {\"op\":\"morph_between\",\"a\":2,\"b\":3,\"bars\":5,\"order\":\"musical\",\"seed\":0,\"after\":99}"],
  [{}, "after", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got undefined."],
  [{ after: NaN }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got null."],
  [{ after: Infinity }, "", "ERR ops[0].after must be the bar the new bars follow (0 = at the start) or \"end\", got null."],
  [{ extra: 1 }, "", "ERR ops[0]: unexpected field \"extra\" (morph_between holds only op, a, b, bars, order, seed, after)."],
  [{ first: 1 }, "", "ERR ops[0]: unexpected field \"first\" (morph_between holds only op, a, b, bars, order, seed, after)."],
  [{ grid: 16 }, "", "ERR ops[0]: unexpected field \"grid\" (morph_between holds only op, a, b, bars, order, seed, after)."],
];
test('validateMorphBetween: the exact answer for every field and every wrong value (the words of each refusal, the value that is kept: a seed outside the seeded order is 0, a missing order is musical, a missing seed is 0)', () => {
  const base = { op: 'morph_between', a: 2, b: 3, bars: 5, order: 'musical', seed: 0, after: 2 };
  for (const [over, drop, want] of MB_VALIDATE) {
    const op: Record<string, unknown> = { ...base, ...over }; if (drop !== '') delete op[drop];
    const r = validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [op] } as never);
    assert.equal(r.ok ? `OK ${JSON.stringify((r.value as { ops: unknown[] }).ops[0])}` : `ERR ${r.message}`, want, `${JSON.stringify(over)} without "${drop}"`);
  }
});
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:216 the refusal of a step that is not a structure step after a head -> "''" (and the words of the op list in it)
test('after a head (an Extend, a Mix, a Morph) only a change of which bars there are can follow: the exact words, the name of the step and its place; every structure step is accepted', () => {
  const heads: PhraseParams[] = [{ kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false }, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 }];
  // 2026-11-19-0999b (deliberate): the list of steps in the message names the Mix and Extend steps too
  const WORDS = (i: number, got: string): string => `ops[${i}]: only a change of which bars there are (keep, delete, copy, move, morph_between, mix_bars, extend_bar) can follow an extend, a mix or a morph, got ${got} (a thin out and a double up are for a take).`;
  for (const head of heads) {
    const keep = { op: 'keep', runs: [[1, 2]] };
    for (const [op, got] of [[{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }, 'thin_out'], [{ op: 'double_up', first: 1, last: 2, grid: 16 }, 'double_up']] as const) {
      const a = validatePhrase({ ...head, ops: [op] } as never); assert.equal(a.ok, false); assert.equal(a.ok === false && a.message, WORDS(0, got), `${head.kind}`);
      const b = validatePhrase({ ...head, ops: [keep, op] } as never); assert.equal(b.ok === false && b.message, WORDS(1, got), `${head.kind}: the second step`);
    }
    const all = [{ op: 'keep', runs: [[1, 2]] }, { op: 'delete', runs: [[1, 1]] }, { op: 'copy', runs: [[1, 1]] }, { op: 'move', runs: [[2, 2]], by: -1 }, { op: 'morph_between', a: 1, b: 2, bars: 3, order: 'musical', seed: 0, after: 1 }];
    const ok = validatePhrase({ ...head, ops: all } as never); assert.ok(ok.ok, `${head.kind}: every structure step is accepted`); assert.deepEqual((ok as { value: { ops: unknown[] } }).value.ops, all);
  }
});

// 2026-11-19-0996b mutation survivor: src/phrase-describe-core.ts:43 (canonicalOp of a morph_between: every field is kept, in the validators' order, and a seed outside the seeded order is 0) and :78 (opSentence says it)
test('canonical / describe of a morph_between: every field is kept (a, b, bars, order, after = a bar or "end"), the seed only of the seeded order (9 -> 0 with any other), keys in the validators\' order; the sentence of every order and place', () => {
  const head = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 } as const;
  const step = (o: Record<string, unknown>) => ({ op: 'morph_between', a: 4, b: 2, bars: 3, order: 'musical', seed: 9, after: 'end', ...o });
  const canon = (o: Record<string, unknown>) => ((canonical({ ...head, ops: [step(o)] } as never) as unknown as { ops: unknown[] }).ops[0]);
  assert.deepEqual(Object.keys(canon({}) as object), ['op', 'a', 'b', 'bars', 'order', 'seed', 'after']);
  assert.deepEqual(canon({}), { op: 'morph_between', a: 4, b: 2, bars: 3, order: 'musical', seed: 0, after: 'end' }, 'musical: the seed 9 is dropped to 0');
  assert.deepEqual(canon({ order: 'by_channel' }), { op: 'morph_between', a: 4, b: 2, bars: 3, order: 'by_channel', seed: 0, after: 'end' });
  assert.deepEqual(canon({ order: 'seeded' }), { op: 'morph_between', a: 4, b: 2, bars: 3, order: 'seeded', seed: 9, after: 'end' }, 'seeded keeps its seed');
  assert.deepEqual(canon({ order: 'seeded', seed: 0, after: 0, a: 1, b: 7, bars: 64 }), { op: 'morph_between', a: 1, b: 7, bars: 64, order: 'seeded', seed: 0, after: 0 });
  const said = (o: Record<string, unknown>) => describe({ ...head, ops: [step(o)] } as never);
  assert.equal(said({}), `${EXTEND} Morph bars 4 and 2 across 3 bars, in musical order, and put them at the end.`);
  assert.equal(said({ order: 'seeded' }), `${EXTEND} Morph bars 4 and 2 across 3 bars, in seeded order, seed 9, and put them at the end.`);
  assert.equal(said({ order: 'by_channel', after: 0, bars: 1 }), `${EXTEND} Morph bars 4 and 2 across 1 bar, in by-channel order, and put it at the start.`);
  assert.equal(said({ a: 2, b: 3, after: 2, bars: 2 }), `${EXTEND} Morph bars 2 and 3 across 2 bars, in musical order, and put them between bars 2 and 3.`);
  assert.equal(said({ a: 2, b: 3, after: 6 }), `${EXTEND} Morph bars 2 and 3 across 3 bars, in musical order, and put them after bar 6.`);
  // the canonical sentence reads back to the same params, for every order and every place, and a mix and a morph head carry the step the same way
  for (const order of ['musical', 'seeded', 'by_channel']) for (const after of [0, 1, 2, 5, 'end']) for (const [a, b] of [[2, 3], [3, 2], [1, 5]]) {
    const p = { ...head, ops: [step({ order, after, a, b, seed: order === 'seeded' ? 4 : 0 })] } as never;
    assert.deepEqual(ok(describe(p)), canonical(p), `${order} ${after} ${a} ${b}`);
  }
  for (const h of ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.', TAKE]) {
    const p = ok(`${h} Morph bars 1 and 2 across 3 bars, in seeded order, seed 4, put them at the start.`);
    assert.deepEqual(opsOf(p), [{ op: 'morph_between', a: 1, b: 2, bars: 3, order: 'seeded', seed: 4, after: 0 }], h);
    assert.equal(describe(p), `${h} Morph bars 1 and 2 across 3 bars, in seeded order, seed 4, and put them at the start.`, h);
  }
});
