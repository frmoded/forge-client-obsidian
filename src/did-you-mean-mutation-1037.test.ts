// 2026-11-24-1037 mutation pass, survivor 1 (src/did-you-mean-core.ts:181, `return { kind: 'absent', message: notInPhrase(n) };` inside the bar-by-link reader of copyInPlace -> `return;`).
// The place-sentence pre-check (line 176) refuses a link the Score does not hold only when the words AFTER the bar say a place. A free-words copy with NO place word (`Make a copy of [[bar_999]].`) reaches the reader itself: THAT refusal is line 181's.
// Without it the answer is undefined (neither a refusal nor "not mine"), and the sentence would go to the service instead of being refused in words naming the link.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { duplicateByLink } from './did-you-mean-core.ts';

const NAMES = Array.from({ length: 12 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);

test('1037 survivor 1: a free-words copy of a link the phrase does not hold, with NO place word, is refused in words naming it (not undefined, not null)', () => {
  for (const s of ['Make a copy of [[bar_999]].', 'Make a copy of [[bar_999]]', 'please make a copy of [[bar_999]]!', 'Put a copy of [[bar_999]] please']) {
    assert.deepEqual(duplicateByLink(s, NAMES), { kind: 'absent', message: 'There is no bar named bar_999 in this phrase.' }, s);
  }
});

test('1037 survivor 1: the same free-words copy of a bar the phrase DOES hold is not a refusal (the control: only the missing link is refused)', () => {
  const r = duplicateByLink('Make a copy of [[bar_006]].', NAMES);
  assert.notEqual(r?.kind, 'absent');
});
