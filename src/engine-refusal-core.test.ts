// 2026-10-31-1135 (CCQA smoke 10, B5 and B5x) - an engine ValueError reaches the person as ONE plain sentence, never as a Python traceback: the pure mapping. The real engine's own texts (taken from forge/music/lib.py, and proven
// against the real engine in note-preflight-engine.test.ts) go in, a sentence that names the notes comes out.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeMismatchSentence, extendGridSentence, plainEngineSentence } from './engine-refusal-core.ts';

const EXTEND_12 = "extend_rhythm: every style needs a 16-step grid (steps == 16, group_size == 4, i.e. 4/4 in sixteenths); got steps=12, group_size=3";
const TRACEBACK = (last: string): string => `Traceback (most recent call last):\n  File "<exec>", line 1, in <module>\n  File "/lib/python3.12/site-packages/forge/music/lib.py", line 3561, in extend_rhythm\nValueError: ${last}`;
const NAMES = [{ section: 1, source: 'phrases/phrase_001' }, { section: 2, source: 'phrases/phrase_013' }, { section: 2, source: 'phrases/phrase_013' }];

test('extendGridSentence: the engine\'s 16-step refusal becomes "<bar> has 12 steps; extend needs a 16-step bar.", from a bare line or a whole traceback; anything else is null', () => {
  assert.equal(extendGridSentence(EXTEND_12, 'bar_009'), 'bar_009 has 12 steps; extend needs a 16-step bar.');
  assert.equal(extendGridSentence(TRACEBACK(EXTEND_12), 'bar_009'), 'bar_009 has 12 steps; extend needs a 16-step bar.');
  assert.equal(extendGridSentence(TRACEBACK("extend_rhythm: missing required field 'steps'"), 'bar_009'), null);
  assert.equal(extendGridSentence('morph_rhythm: two bars on different grids', 'bar_009'), null);
});

test('composeMismatchSentence: the meter, the steps and the group size each name BOTH sections (by their note and the number the person sees), and say the rule', () => {
  const meter = "compose_sections: section 3 bar 1 has time_signature '3/4' but section 1 has '4/4'; all sections must share the same meter and steps";
  assert.equal(composeMismatchSentence(meter, NAMES), 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.');
  assert.equal(composeMismatchSentence(TRACEBACK(meter), NAMES), 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.');
  const steps = "compose_sections: section 2 bar 3 has steps 12 but section 1 has 16; all sections must share the same meter and steps";
  assert.equal(composeMismatchSentence(steps, NAMES), 'phrase_013 (section 2) has 12 steps but phrase_001 (section 1) has 16 steps; all sections of a composition must share the same meter and steps.');
  const group = "compose_sections_lineage: section 2 bar 1 has group_size 3 but section 1 bar 1 has 4; all sections must share the same meter and steps";
  assert.equal(composeMismatchSentence(group, NAMES), 'phrase_013 (section 2) has a group size of 3 but phrase_001 (section 1) has 4; all sections of a composition must share the same meter and steps.');
  assert.equal(composeMismatchSentence('compose_sections: sections must be a non-empty list', NAMES), null);
});

test('plainEngineSentence: one line, no traceback, no "ValueError:", no stack frames - whatever the engine threw; the known refusals get their sentence', () => {
  assert.equal(plainEngineSentence(TRACEBACK(EXTEND_12), { source: 'bar_009' }), 'bar_009 has 12 steps; extend needs a 16-step bar.');
  const odd = plainEngineSentence(TRACEBACK('mix_rhythm: bars a and b are on different grids'));
  assert.equal(odd, 'mix_rhythm: bars a and b are on different grids');
  for (const text of [TRACEBACK('x: y'), 'Error: plain', '\n\nValueError: spaced out\n\n', 'a line\nsecond line\nthe last line']) {
    const s = plainEngineSentence(text);
    assert.doesNotMatch(s, /Traceback|File "|ValueError:|\n/, text);
    assert.ok(s.length > 0);
  }
  assert.equal(plainEngineSentence('a line\nsecond line\nthe last line'), 'the last line');
  assert.equal(plainEngineSentence(''), 'the engine refused this note.');
});

// Added by the 1135 mutation pass: plainEngineSentence's CONTEXT is what routes a message to its sentence, and a section the engine counted but the caller did not name still reads.
const METER_3 = "compose_sections: section 3 bar 1 has time_signature '3/4' but section 1 has '4/4'; all sections must share the same meter and steps";
test('plainEngineSentence routes by CONTEXT: the extend sentence only when it is told the bar, the mismatch sentence only when it is told the sections; with neither (or a message of the other kind) the engine\'s own last line comes through, and nothing throws', () => {
  assert.equal(plainEngineSentence(EXTEND_12), EXTEND_12, 'no source named: the engine\'s own line (no exception name to take off)');
  assert.equal(plainEngineSentence(METER_3), METER_3, 'no sections named: the engine\'s own line, and composeMismatchSentence is not asked with nothing');
  assert.equal(plainEngineSentence(TRACEBACK('mix_rhythm: other grid'), { source: 'bar_009' }), 'mix_rhythm: other grid', 'a source named but the message is not an extend one');
  assert.equal(plainEngineSentence(TRACEBACK('mix_rhythm: other grid'), { sections: NAMES }), 'mix_rhythm: other grid', 'sections named but the message is not a mismatch');
  assert.equal(plainEngineSentence(METER_3, { sections: NAMES }), 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.');
  assert.equal(plainEngineSentence(EXTEND_12, { source: 'bar_009', sections: NAMES }), 'bar_009 has 12 steps; extend needs a 16-step bar.', 'the extend sentence wins when both are told and it matches');
  assert.equal(plainEngineSentence(METER_3, { source: 'bar_009', sections: NAMES }), 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.', 'a source named for a message that is not an extend one does not hide the mismatch sentence');
});

test('composeMismatchSentence: a section number the caller did not name still reads ("section 3"), never an empty label', () => {
  assert.equal(composeMismatchSentence(METER_3, [{ section: 1, source: 'phrases/phrase_001' }]), 'section 3 is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.');
});
