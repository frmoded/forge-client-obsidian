// 2026-11-16-1100 - a phrase the driver RENAMED (bridge, my groove) is still a phrase: a transform may take it as its source (the validator), the sentences with its name read back (the grammar: a name may have spaces and letters), the plugin still
// knows its note for what it is (the family of its path: the prompt box, the headers), "New phrase from these bars" works on it, and the Score the sentence makes is the one the engine draws. phrase_N and arr_N behave as before.
// Real engine part: skipped (visibly) without the music wheels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, test as baseTest } from 'node:test';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, isPhrasePath, noteContentFor, producePhrase, validatePhrase, type PhraseParams } from './phrase-core.ts';
import { familyOfPath } from './note-family-core.ts';
import { describe, canonical } from './phrase-describe-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { parseRecipe, renderRecipe } from './recipe-grammar-core.ts';
import { planAction, selectionOf } from './bar-selection-core.ts';
import { applyStructureOps } from './bar-structure-core.ts';
import { callNote } from './phrase-notes-core.ts';
import { validateComposition } from './composition-core.ts';

const NAMES = ['bridge', 'my groove', 'Bridge 2', 'phrase_007', 'zwei Takte', 'bar-b_2', 'été'];
const take = (name: string, ops: unknown[] = [{ op: 'keep', runs: [[2, 3]] }]): PhraseParams => ({ kind: 'transform', source: `phrases/${name}`, ops }) as PhraseParams;
const VAULT = { bars: ['bar_005'], phrases: NAMES };

test('THE VALIDATOR: a transform takes any phrase of the folder as its source (letters, digits, spaces, _ and -); phrase_N and arr_N and compositions are as they were; a folder, a dot, a bracket or an empty name is still refused', () => {
  for (const n of NAMES) assert.ok(validatePhrase(take(n)).ok, `phrases/${n}`);
  assert.ok(validatePhrase({ kind: 'transform', source: 'arrangements/arr_001', ops: [{ op: 'keep', runs: [[1, 1]] }] }).ok);
  assert.ok(validatePhrase({ kind: 'transform', source: 'compositions/song-1', ops: [{ op: 'keep', runs: [[1, 1]] }] }).ok);
  for (const bad of ['phrases/', 'phrases/a/b', 'phrases/a.b', 'phrases/a]]b', 'phrases/ lead', 'phrases/trail ', 'phrases/a|b', 'phrases/a#b', 'arrangements/bridge', 'bars/bar_005', 'phrase_001', 'phrases/README']) assert.ok(!validatePhrase({ kind: 'transform', source: bad, ops: [{ op: 'keep', runs: [[1, 1]] }] }).ok, bad);
});
test('THE SENTENCE ROUND-TRIPS with the name, in the Description grammar and in the Recipe: "Take [[my groove]]. Keep bars 2 to 3." says itself, reads back to the same params; phrase_N sentences are byte-for-byte what they were', () => {
  for (const n of NAMES) for (const ops of [[{ op: 'keep', runs: [[2, 3]] }], [{ op: 'delete', runs: [[1, 1]] }, { op: 'thin_out', first: 1, last: 2, amount: 0.5 }], [{ op: 'double_up', first: 1, last: 2, grid: 16 }]]) {
    const p = take(n, ops); const text = describe(p);
    assert.ok(text.startsWith(`Take [[${n}]]. `), text);
    const back = parse(text, VAULT); assert.ok(back.ok, `${text}: ${JSON.stringify(back)}`); assert.deepEqual(back.ok && back.params, canonical(p), text);
    const r = parseRecipe(renderRecipe(p), VAULT); assert.ok(r.ok, `${renderRecipe(p)}: ${JSON.stringify(r)}`); assert.deepEqual(r.ok && r.params, canonical(p));
  }
  assert.equal(describe(take('phrase_006', [{ op: 'thin_out', first: 3, last: 5, amount: 0.5 }])), 'Take [[phrase_006]]. Thin out bars 3 to 5, by half, keeping the downbeat.');
});
test('a name that is not one is refused in the link with the sentence that says what a name is; a spaced name must be in brackets; the vault decides whether the note is there', () => {
  const bad = (t: string) => { const r = parse(t, { ...VAULT, arrangements: [], compositions: [] }); assert.ok(!r.ok, t); return (r as { error: { message: string } }).error.message; };
  assert.match(bad('Take [[bars/bar_005]]. Keep bar 1.'), /Expected a note name \(letters, digits, spaces, _ and -, no folder\) inside the link, but found "bars\/bar_005"/);
  assert.match(bad('Take [[ bridge]]. Keep bar 1.'), /Expected a note name/);
  assert.match(bad('Take [[bridge ]]. Keep bar 1.'), /Expected a note name/);
  assert.match(bad('Take [[no such phrase]]. Keep bar 1.'), /is not one/);
  assert.match(bad('Take my groove. Keep bar 1.'), /Expected the end of the sentence|Expected/);
});
test('THE PLUGIN KNOWS A RENAMED PHRASE FOR A PHRASE: its path is a phrase path and of the phrase family (so its tab keeps its prompt box), the folder\'s README and notes outside the folder are not', () => {
  for (const n of NAMES) { assert.ok(isPhrasePath(`phrases/${n}.md`), n); assert.equal(familyOfPath(`phrases/${n}.md`), 'phrase', n); }
  for (const p of ['phrases/README.md', 'phrases/sub/bridge.md', 'bars/bridge.md', 'phrases/bridge.txt', 'phrases/.hidden.md', 'phrases/a.b.md', 'notes/phrases/bridge.md', 'phrases/.md']) assert.ok(!isPhrasePath(p), p);
});
test('THE PYTHON of a transform of a renamed phrase calls it by its name: a plain call for a name that is an identifier, a globals lookup for any other', () => {
  assert.equal(callNote('bridge'), 'bridge()'); assert.equal(callNote('my groove'), `globals()['my groove']()`);
});
test('"NEW PHRASE FROM THESE BARS" on a renamed phrase (and the other actions on a phrase that is not a transform): a new transform phrase of it, with its name in the sentence', () => {
  for (const self of ['bridge', 'my groove']) {
    const a = planAction('new-phrase', selectionOf([3, 4]), { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 }, self, 8);
    assert.ok(a.kind === 'new-phrase', self); assert.equal(a.kind === 'new-phrase' && a.sentence, `Take [[${self}]]. Keep bars 3 to 4.`);
    const t = planAction('delete', selectionOf([1]), take(self), self, 6);
    assert.ok(t.kind === 'preview', self); assert.equal(t.kind === 'preview' && t.text, `Take [[${self}]]. Keep bars 2 to 3. Delete bar 1.`);
  }
});

// ---- the real engine: the Score the sentence makes is the one the source's bars give ---------------------------------------------------------------------------------------------------
const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const ptest = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
ptest('ON THE REAL ENGINE: a phrase renamed bridge (and one called "my groove") is the source of a Keep, and the Score is the source\'s bars 2 to 4, bar for bar; the same through the sentence read back', async () => {
  const py = await engine();
  const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 6, style: 'building', tempo_change_pct: 0 };
  for (const name of ['bridge', 'my groove']) {
    const files: Record<string, string> = { 'bars/bar_005.md': fs.readFileSync(path.join(FIXTURES, 'bar_005.md'), 'utf8'), [`phrases/${name}.md`]: noteContentFor(name, EXTEND) };
    const deps = { readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) };
    const draw = async (p: PhraseParams) => { const o = await producePhrase(deps, p, 'phrase_099'); assert.equal(o.kind, 'score', o.kind === 'score' ? '' : (o as { message: string }).message); return barsOfPayload((o as { payload: never }).payload) as unknown[]; };
    const source = await draw(EXTEND);
    const t = take(name, [{ op: 'keep', runs: [[2, 4]] }]);
    const want = applyStructureOps(source, [{ op: 'keep', runs: [[2, 4]] }]); assert.ok(want.ok);
    assert.deepEqual(await draw(t), want.ok ? want.items : []);
    const back = parse(describe(t), { bars: ['bar_005'], phrases: [name] }); assert.ok(back.ok);
    assert.deepEqual(await draw(back.ok ? (back.params as PhraseParams) : t), want.ok ? want.items : [], 'the sentence read back draws the same Score');
  }
});

// ---- 2026-11-16-1102 (Part B): a composition's sections take a renamed phrase too ---------------------------------------------------------------------------------------------------------
test('A COMPOSITION TAKES A RENAMED PHRASE: "Play [[bridge]] for 8 bars." validates and reads back (Description and Recipe); phrase_N, arr_N and composition sentences are byte-for-byte what they were; a name that is not one is still refused', () => {
  const comp = (...sources: string[]): PhraseParams => ({ kind: 'composition', sections: sources.map((source, i) => ({ source, ...(i === 0 ? { length: 8 } : {}) })) }) as never;
  const V = { bars: [], phrases: NAMES, arrangements: ['arr_001'], compositions: ['intro'] };
  for (const n of NAMES) {
    const p = comp(`phrases/${n}`, 'arrangements/arr_001'); assert.ok(validateComposition(p).ok, n);
    const text = describe(p); assert.ok(text.startsWith(`Play [[${n}]] for 8 bars. Then play [[arr_001]].`), text);
    const back = parse(text, V); assert.ok(back.ok, `${text}: ${JSON.stringify(back)}`); assert.deepEqual(back.ok && back.params, canonical(p), text);
    const r = parseRecipe(renderRecipe(p), V); assert.ok(r.ok, renderRecipe(p)); assert.deepEqual(r.ok && r.params, canonical(p));
  }
  assert.equal(describe(comp('phrases/phrase_006', 'arrangements/arr_001', 'compositions/intro')), 'Play [[phrase_006]] for 8 bars. Then play [[arr_001]]. Then play [[intro]].');
  for (const bad of ['phrases/', 'phrases/a/b', 'phrases/a.b', 'phrases/ lead', 'phrases/README', 'arrangements/bridge', 'bars/bar_005']) assert.ok(!validateComposition(comp(bad)).ok, bad);
});
