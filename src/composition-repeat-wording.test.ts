// 2026-10-31-1130 - "Repeat that N more times." The canonical sentence of a composition's repeat says what it does (N MORE plays, N+1 in all); the parser also reads the old "Repeat that N times." and the English
// variants ("again", "twice", "once more", "two more times") and reads every one of them as N MORE; describe/canonical write only the new form; the round trip holds on 600 random compositions; a composition note
// written with the old wording is rewritten by Refresh note links (idempotent, the json block byte for byte). Pure core, no Obsidian, no engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compositionRecipeSteps, newCompositionNote, readCompositionNote, refreshCompositionNoteText, type CompositionParams } from './composition-core.ts';
import { facetHashSync } from './facet-sync-hash-core.ts';
import { canonical, describe, parse, VERBS, type GrammarVault } from './phrase-grammar-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';

const VAULT: GrammarVault = { bars: ['bar_007'], phrases: ['phrase_003', 'phrase_004'], arrangements: ['arr_001'], compositions: ['intro'], kits: ['rock'] };
const ONE = (repeat?: number): CompositionParams => ({ kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8, ...(repeat !== undefined ? { repeat } : {}) }] });
const repeatOf = (text: string): number | undefined => { const r = parse(text, VAULT); assert.ok(r.ok, `${text}: ${JSON.stringify(!r.ok && r.error)}`); return r.ok ? (r.params as CompositionParams).sections[0].repeat : undefined; };

test('the canonical sentence: "Repeat that N more times." and "Repeat that once more." for one; nothing for none', () => {
  assert.equal(describe(ONE(2)), 'Play [[phrase_003]] for 8 bars. Repeat that 2 more times.');
  assert.equal(describe(ONE(1)), 'Play [[phrase_003]] for 8 bars. Repeat that once more.');
  assert.equal(describe(ONE(16)), 'Play [[phrase_003]] for 8 bars. Repeat that 16 more times.');
  assert.equal(describe(ONE()), 'Play [[phrase_003]] for 8 bars.');
  assert.equal(describe(ONE(0)), 'Play [[phrase_003]] for 8 bars.', 'N = 0 is not written');
  assert.deepEqual(compositionRecipeSteps(ONE(1)), ['Play [[phrase_003]] for 8 bars.', 'Repeat that once more.']);
});

test('every way of saying it reads as N MORE (the old wording and the English variants included), and is said back in the new form only', () => {
  const SAID: Array<[string, number]> = [
    ['Repeat that 3 more times.', 3], ['Repeat that once more.', 1], ['Repeat that again.', 1], ['Repeat that twice.', 2], ['Repeat that two more times.', 2], ['Repeat that once.', 1],
    ['Repeat that 2 times.', 2], ['Repeat that 1 time.', 1], ['Repeat that 1 times.', 1], ['Repeat that two times', 2], ['Repeat that 1 more time.', 1],
    ['repeat   THAT  Two More Times.', 2], ['REPEAT THAT AGAIN', 1], ['Repeat that 16 more times.', 16],
  ];
  for (const [said, n] of SAID) {
    assert.equal(repeatOf(`Play [[phrase_003]] for 8 bars. ${said}`), n, said);
    const back = parse(`Play [[phrase_003]] for 8 bars. ${said}`, VAULT);
    if (back.ok) { const text = describe(back.params); assert.doesNotMatch(text, /Repeat that \d+ times?\./, said); assert.match(text, n === 1 ? /Repeat that once more\.$/ : new RegExp(`Repeat that ${n} more times\\.$`), said); }
  }
});

test('the errors keep their place and say the new form: 0 and 17 are out of range, a bare number wants "more times", "Then play" names the new sentence', () => {
  const at = (text: string) => { const r = parse(text, VAULT); return r.ok ? null : [r.error.message, r.error.line, r.error.column]; };
  assert.deepEqual(at('Play [[phrase_003]]. Repeat that 0 more times.'), ['Expected a number of times from 1 to 16, but found 0.', 1, 34]);
  assert.deepEqual(at('Play [[phrase_003]]. Repeat that 17 more times.'), ['Expected a number of times from 1 to 16, but found 17.', 1, 34]);
  assert.deepEqual(at('Play [[phrase_003]]. Repeat that 2.'), ['Expected "more times", but found the end of the sentence.', 1, 35]);
  assert.deepEqual(at('Play [[phrase_003]]. Repeat that 2 more.'), ['Expected "times", but found the end of the sentence.', 1, 40]);
  assert.deepEqual(at('Play [[phrase_003]] for 8 bars. Repeat that 2 more times please.'), ['Expected the end of the sentence, but found "please".', 1, 58]);
  const second = at('Play [[phrase_003]] for 8 bars. Play [[arr_001]] for 4 bars.');
  assert.match(String(second?.[0]), /"Repeat that N more times\."/);
});

test('the verb table says the new sentence', () => {
  const row = VERBS.find((v) => v.verb === 'repeat that');
  assert.equal(row?.example, 'Repeat that 2 more times.');
});

test('the round trip on 600 random compositions: parse(describe(p)) is canonical(p), and the text is a fixed point (the new wording only)', () => {
  let seed = 20261031;
  const rnd = (n: number): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 600; i++) {
    const sections = Array.from({ length: 1 + rnd(4) }, () => {
      const src = ['phrases/phrase_003', 'phrases/phrase_004', 'arrangements/arr_001', 'compositions/intro'][rnd(4)];
      return { source: src, ...(rnd(2) ? { length: 1 + rnd(16) } : {}), ...(rnd(2) ? { repeat: 1 + rnd(16) } : {}) };
    });
    const p = { kind: 'composition', sections } as CompositionParams;
    const text = describe(p);
    const back = parse(text, VAULT);
    assert.ok(back.ok, `${text}: ${JSON.stringify(!back.ok && back.error)}`);
    if (back.ok) { assert.deepEqual(back.params, canonical(p), text); assert.equal(describe(back.params), text); }
    assert.doesNotMatch(text, /Repeat that \d+ times?\./);
  }
});

test('MIGRATION: a composition note written with the old wording is rewritten by Refresh note links to the new wording (Description and Recipe), the json block byte for byte; a second refresh changes nothing', () => {
  const p: CompositionParams = { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8, repeat: 2 }, { source: 'phrases/phrase_004', repeat: 1 }] };
  const fresh = newCompositionNote('comp_007', p);
  // the note as it was written before 2026-10-31-1130: the old sentences, and the hash stamped over the old Description (so it is NOT a hand edit)
  let old = fresh.replace('Repeat that 2 more times.', 'Repeat that 2 times.').replace('Repeat that 2 more times.', 'Repeat that 2 times.').replace('Repeat that once more.', 'Repeat that 1 time.').replace('Repeat that once more.', 'Repeat that 1 time.');
  assert.notEqual(old, fresh); assert.doesNotMatch(old, /Repeat that (?:\d+ more|once more)/);      // (the frontmatter `description:` words already said "2 more times")
  old = old.replace(/description_hash: \S+/, `description_hash: ${facetHashSync(extractDescription(old))}`);
  old = old.replace(/^recipe_hash: \S+/m, `recipe_hash: ${facetHashSync(extractRecipeSection(old) ?? '')}`);       // 2026-10-31-1140 (M16a): a Recipe whose stamp disagrees is a hand edit; the old plugin stamped the Recipe it wrote
  const json = (t: string): string => t.slice(t.indexOf('```json'));
  const first = refreshCompositionNoteText(old, 'comp_007');
  assert.ok(first.ok && first.changed, JSON.stringify(first));
  if (first.ok) {
    assert.match(first.text, /Play \[\[phrase_003\]\] for 8 bars\. Repeat that 2 more times\. Then play \[\[phrase_004\]\]\. Repeat that once more\./);
    assert.equal((first.text.match(/Repeat that 2 more times\./g) ?? []).length, 2, 'the Description and the Recipe both say it');
    assert.doesNotMatch(first.text, /Repeat that \d+ times?\./);
    assert.equal(json(first.text), json(old), 'the json block is byte for byte');
    assert.deepEqual(readCompositionNote(first.text), readCompositionNote(old), 'the same params');
    const second = refreshCompositionNoteText(first.text, 'comp_007');
    assert.ok(second.ok && second.changed === false && second.text === first.text, 'idempotent');
  }
});
