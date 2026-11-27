// 2026-11-06-1190 (CCQA smokes 14 to 16): three small wording fixes, tests first.
//  (a) a notebook refusal the service wrote that names the engine's operations (`thin_out`, `double_up`) says them in the op picker's words ("thin out", "double up"), mapped in ONE pure function;
//  (b) [removed 2026-11-19-0960 with the dialog] the New composition dialog's Name placeholder;
//  (c) [removed 2026-11-26-1047 (deliberate) with the Python read-back].
// The wiring test of (a) pins the MECHANISM (X calls Y); if the design moves it SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { interpretTransformResponse, opWordsIn } from './notebook-request-core.ts';

const SRC = path.resolve(import.meta.dirname);
const read = (f: string): string => fs.readFileSync(path.join(SRC, f), 'utf8');

// ---- (a) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('(a) opWordsIn: both operation names become the op picker\'s words, everywhere in the sentence; a text with neither is returned untouched; the engine\'s function names are not operation names', () => {
  assert.equal(opWordsIn('Cannot mix two bars with a 30/70 ratio; only thin_out and double_up operations are supported'), 'Cannot mix two bars with a 30/70 ratio; only thin out and double up operations are supported');
  assert.equal(opWordsIn('Cannot reverse the sequence of hits; only thin_out and double_up operations are supported'), 'Cannot reverse the sequence of hits; only thin out and double up operations are supported');
  assert.equal(opWordsIn('thin_out thin_out, double_up.'), 'thin out thin out, double up.', 'every occurrence');
  const plain = 'Cannot change volume; only thinning out or doubling up hits is supported';
  assert.equal(opWordsIn(plain), plain, 'a text with neither name');
  assert.equal(opWordsIn(''), '');
  assert.equal(opWordsIn('thin_out_bars: bar 9 is past the last bar'), 'thin_out_bars: bar 9 is past the last bar', 'thin_out_bars / double_up_bars are the engine\'s functions, quoted as the engine said them');
  assert.notEqual(opWordsIn('only thin_out'), 'only thin_out', 'CONTROL: the mapping does something');
});

test('(a) the notebook\'s refusal from the service goes through it: the sentence the person reads has the picker\'s words, not the engine\'s names', () => {
  const refused = interpretTransformResponse({ status: 200, json: { ok: false, plan: null, error: 'Cannot mix two bars with a 30/70 ratio; only thin_out and double_up operations are supported' } }, { source: 'phrases/phrase_006', runs: [[3, 5]], row: 'kick' });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.message, 'Cannot mix two bars with a 30/70 ratio; only thin out and double up operations are supported');
  const volume = interpretTransformResponse({ status: 200, json: { ok: false, plan: null, error: 'Cannot change volume; only thinning out or doubling up hits is supported' } }, { source: 'phrases/phrase_006', runs: [[3, 5]], row: 'kick' });
  assert.equal(volume.ok === false && volume.message, 'Cannot change volume; only thinning out or doubling up hits is supported', 'the sentence that was already fine is unchanged');
});

test('(a) MECHANISM PIN: the mapping lives in notebook-request-core.ts only and the refusal text passes through it there; the shared planRefusalText (the sentence dialog\'s too) is not touched', () => {
  const core = read('notebook-request-core.ts');
  assert.match(core, /message: opWordsIn\(planRefusalText\(json\)\)/);
  assert.equal((core.match(/export function opWordsIn|export const opWordsIn/g) ?? []).length, 1);
  assert.doesNotMatch(read('sentence-plan-core.ts'), /opWordsIn|thin out/, 'P3: the shared planner text is as it was');
});

// ---- (b) removed 2026-11-19-0960: the New composition dialog (and its Name placeholder) is gone; "New composition" makes an empty note, new-notes-start-empty.test.ts -------------------------------------------------

// ---- (c) removed 2026-11-26-1047 (deliberate): the sentence "the note becomes / stays a custom note" belonged to the Python read-back, which is gone (a note becomes custom by Detach only) ----------------------------------------
