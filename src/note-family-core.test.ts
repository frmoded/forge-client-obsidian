// 2026-10-31-1140 (M16a): which kind of derived note a path is, and the sentence that says a sentence or a Recipe describes another kind. Moved out of description-apply-core.ts (which re-exports it); tested here on its own.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FAMILY_KINDS, WORD, familyOfPath, wrongKindSentence, type Family } from './note-family-core.ts';

test('familyOfPath: phrases, arrangements and compositions by their folder and a .md name; anything else (a bar, a README, a note in a sub folder, another extension) is not ours', () => {
  assert.equal(familyOfPath('phrases/phrase_001.md'), 'phrase');
  assert.equal(familyOfPath('arrangements/arr_001.md'), 'arrangement');
  assert.equal(familyOfPath('compositions/comp_001.md'), 'composition');
  for (const p of ['bars/bar_001.md', 'notes/x.md', 'phrases/README.md', 'arrangements/README.md', 'compositions/README.md', 'phrases/sub/x.md', 'phrases/phrase_001.txt', 'kits/rock.md', '']) assert.equal(familyOfPath(p), null, p);
});

test('the kinds a family takes: a phrase note is an extend, a mix, a morph or a transform; an arrangement note and a composition note have their own kind; every kind has a word', () => {
  assert.deepEqual(FAMILY_KINDS, { phrase: ['extend', 'mix', 'morph', 'transform'], arrangement: ['arrangement'], composition: ['composition'] });
  assert.deepEqual(WORD, { extend: 'a phrase', mix: 'a phrase', morph: 'a phrase', transform: 'a phrase', arrangement: 'an arrangement', composition: 'a composition' });
  for (const kinds of Object.values(FAMILY_KINDS)) for (const k of kinds) assert.ok(WORD[k], k);
});

test('wrongKindSentence: null for a kind that belongs, else one sentence naming what the note is and what the text describes, in the words of the source it is about ("the sentence", "the Recipe")', () => {
  for (const [family, kinds] of Object.entries(FAMILY_KINDS) as Array<[Family, readonly string[]]>) for (const k of kinds) assert.equal(wrongKindSentence(family, k, 'the Recipe'), null, `${family} ${k}`);
  assert.equal(wrongKindSentence('phrase', 'arrangement', 'the Recipe'), 'this note is a phrase, but the Recipe describes an arrangement; make a new note for that');
  assert.equal(wrongKindSentence('phrase', 'composition', 'the sentence'), 'this note is a phrase, but the sentence describes a composition; make a new note for that');
  assert.equal(wrongKindSentence('arrangement', 'morph', 'the Recipe'), 'this note is an arrangement, but the Recipe describes a phrase; make a new note for that');
  assert.equal(wrongKindSentence('composition', 'extend', 'the sentence'), 'this note is a composition, but the sentence describes a phrase; make a new note for that');
  assert.equal(wrongKindSentence('arrangement', 'composition', 'the Recipe'), 'this note is an arrangement, but the Recipe describes a composition; make a new note for that');
});
