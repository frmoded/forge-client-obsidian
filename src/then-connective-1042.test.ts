// 2026-11-25-1042 Part B: `then` BETWEEN two sentences is read as the two sentences. The driver's real entry (`compositions/comp_002.md`, 1039) was ONE composition entry `Play [[phrase_101]]. then Then play [[phrase_001]] for 2 bars`: the word `then` he typed before
// `Then play` made the grammar stop at it (`found "then"`), so the service was asked. Read now: `. then X` and `. Then then X` (a stray or doubled `then` at the start of a sentence after a full stop is dropped), and `, then play ...` / ` and then play ...`
// (the connective between two sentences is a full stop; what follows is `Then play ...`). NOT in scope and unchanged: `Then play [[a note]] for N bars.` itself, a first sentence, `then` inside a word or a link, `, then keep ...` (only `then play` follows a comma).
// Written FIRST (red against 7f43ca2 for every shape that is new; green at once for the P3 pins).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sentencesOfText } from './sentence-list-core.ts';
import { emptyCompositionNote } from './empty-note-core.ts';
import { rig } from './test-support/service-lines-rig.ts';

const no = async () => ({ status: 200, json: { ok: true, lines: [], question: 'Which?' } });
async function comp(...said: string[]) { const r = rig({ path: 'compositions/comp_001.md', note: emptyCompositionNote('comp_001'), service: no }); await r.ready(); for (const s of said) await r.say(s); return r; }

test('the splitter (pure): `. then X`, `. Then then X`, `, then play`, ` and then play`; a first sentence and the canonical sentences are not touched', () => {
  const k = 'composition';
  assert.deepEqual(sentencesOfText('Play [[a]]. then Then play [[b]] for 2 bars', k), ['Play [[a]].', 'Then play [[b]] for 2 bars.'], 'the driver\'s entry');
  assert.deepEqual(sentencesOfText('Play [[a]]. Then then play [[b]] for 2 bars.', k), ['Play [[a]].', 'then play [[b]] for 2 bars.']);
  assert.deepEqual(sentencesOfText('Play [[a]] for 2 bars, then play [[b]] for 4 bars.', k), ['Play [[a]] for 2 bars.', 'then play [[b]] for 4 bars.']);
  assert.deepEqual(sentencesOfText('Play [[a]] for 2 bars and then play [[b]] for 4 bars.', k), ['Play [[a]] for 2 bars.', 'then play [[b]] for 4 bars.']);
  assert.deepEqual(sentencesOfText('Play [[a]]. then repeat that 2 more times.', k), ['Play [[a]].', 'repeat that 2 more times.']);
  assert.deepEqual(sentencesOfText('Delete bar 2. then keep bars 1 to 3.', 'phrase'), ['Delete bar 2.', 'keep bars 1 to 3.']);
  for (const same of ['Play [[a]]. Then play [[b]] for 2 bars.', 'Then play [[b]] for 2 bars.', 'then play [[b]].', 'Play [[a]]. then play [[b]] for 2 bars.', 'Delete bar 2, then keep bar 3.', 'Play [[then]]. Play [[and then play]].', 'Anthem and thenceforth.']) {
    assert.deepEqual(sentencesOfText(same, k), same.split(/(?<=\.)\s+/), same);
  }
  assert.deepEqual(sentencesOfText('then Play [[a]].', k), ['then Play [[a]].'], 'a FIRST sentence is never touched');
  assert.deepEqual(sentencesOfText('Play [[a]]. then', k), ['Play [[a]].', 'then.'], 'a lone then is not a connective');
});

test('[composer] the driver\'s entry with two beats phrases is read as two lines, written canonically (no service, no waiting line)', async () => {
  const r = await comp('Play [[phrase_001]]. then Then play [[phrase_002]] for 2 bars'); assert.equal(r.requests.length, 0, r.texts().join(' | '));
  assert.deepEqual(r.list(), ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 2 bars.']); assert.ok(!r.texts().some((x) => /service|grammar did not accept/i.test(x)), r.texts().join(' | '));
});
test('[composer] `. Then then play`, `, then play`, ` and then play` and `. then play` give the same two lines', async () => {
  const want = ['Play [[phrase_001]] for 2 bars.', 'Then play [[phrase_002]] for 4 bars.'];
  for (const said of ['Play [[phrase_001]] for 2 bars. Then then play [[phrase_002]] for 4 bars.', 'Play [[phrase_001]] for 2 bars, then play [[phrase_002]] for 4 bars.', 'Play [[phrase_001]] for 2 bars and then play [[phrase_002]] for 4 bars', 'Play [[phrase_001]] for 2 bars. then play [[phrase_002]] for 4 bars.']) {
    const r = await comp(said); assert.equal(r.requests.length, 0, `${said}: ${r.texts().join(' | ')}`); assert.deepEqual(r.list(), want, said);
  }
});
test('[composer] P3: the canonical sentences read byte for byte as before: one entry or two, `Then play [[a note]] for N bars.`, `Repeat that 2 more times.`', async () => {
  const one = await comp('Play [[phrase_001]] for 2 bars. Then play [[phrase_002]] for 4 bars. Repeat that 2 more times.'); const two = await comp('Play [[phrase_001]] for 2 bars.', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that 2 more times.');
  assert.deepEqual(one.list(), ['Play [[phrase_001]] for 2 bars.', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that 2 more times.']); assert.deepEqual(two.list(), one.list()); assert.equal(one.requests.length + two.requests.length, 0);
});
test('[composer] not a connective: `, then keep ...` in a phrase is unreadable as before (the service is asked); a FIRST `then Play ...` reads exactly as it did (the grammar\'s own tolerance: the line is `Play [[phrase_001]].`, no service)', async () => {
  const r = rig({ service: no, drawn: 4 }); await r.ready(); r.type('Extend [[bar_005]] to 4 bars, repeating with fills.'); await r.enter(); await r.say('Delete bar 2, then keep bar 3');
  assert.equal(r.requests.length, 1); assert.deepEqual(r.list(), ['Extend [[bar_005]] to 4 bars, repeating with fills.']);
  const c = await comp('then Play [[phrase_001]].'); assert.equal(c.requests.length, 0); assert.deepEqual(c.list(), ['Play [[phrase_001]].']);
});
test('[composer] an arrangement: `, then play` after a kit line is the composition-only `Then play`, refused by name as before (nothing written)', async () => {
  const r = rig({ path: 'arrangements/arr_001.md', service: no }); await r.ready(); await r.say('Play [[phrase_001]] on the rock kit, then play [[phrase_002]] on the latin kit.');
  assert.deepEqual(r.list().filter((l) => !/^Waiting/.test(l)), r.list().filter((l) => !/Then play/i.test(l)), r.list().join(' | ')); assert.ok(!r.list().some((l) => /^then play/i.test(l)), r.list().join(' | '));
});
