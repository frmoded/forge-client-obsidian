// 2026-11-21-1015 PART C (waiting lines and "Translate line N"), the pure part. A sentence that neither the grammar nor the service can turn into canonical lines is kept in the note's list as a WAITING line (`Waiting: <the driver's words>`): plain text, the
// replay stops before it exactly as before an unreadable line (so later lines wait until it is resolved), the dialog says why. `Translate line N.` (typed, or the menu) asks the service for that line only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { replayGrammar, stopNotice } from './sentence-list-core.ts';
import { LIST_MODEL_SENTINEL_WAITING_LINE_CORE, isWaitingLine, keptMessage, translateRequest, waitingLine, waitingWords } from './waiting-line-core.ts';

test('the sentinel names the core (behind the list-model seam: lean never carries it)', () => { assert.equal(LIST_MODEL_SENTINEL_WAITING_LINE_CORE, 'forge-list-model-core:waiting-line-core'); });

test('waitingLine keeps the words as one plain line (no brackets, links, paths or token-like runs, at most 160 characters); nothing worth keeping gives null; waitingWords and isWaiting read it back', () => {
  assert.equal(waitingLine('blorp the second bar'), 'Waiting: blorp the second bar');
  assert.equal(waitingLine('  make it\n  weirder [[bar_001]] (please)  '), 'Waiting: make it weirder bar_001 please');
  assert.equal(waitingLine('see notes/secret.md https://x.test/a'), 'Waiting: see'); assert.equal(waitingLine('   '), null); assert.equal(waitingLine('()'), null); assert.equal(waitingLine('a/b'), null);
  assert.ok(waitingLine('word '.repeat(100))!.length <= 'Waiting: '.length + 160);
  assert.equal(waitingWords('Waiting: blorp the second bar'), 'blorp the second bar'); assert.equal(waitingWords('waiting:   blorp'), 'blorp', 'the prefix is read in any case');
  assert.equal(waitingWords('Waiting: blorp (you said: x)'), 'blorp', 'a marker beside it is not part of the words'); assert.equal(waitingWords('Delete bar 2.'), null); assert.equal(waitingWords('Waiting:'), null);
  assert.equal(isWaiting('Waiting: x'), true); assert.equal(isWaiting('Delete bar 2.'), false); assert.equal(isWaiting('Waiting for the bus is what I do.'), false, 'only "Waiting:" with a colon');
  function isWaiting(s: string): boolean { return isWaitingLine(s); }
});
test('translateRequest reads "Translate line N." in any case, with or without the stop, and nothing else', () => {
  for (const [s, n] of [['Translate line 3.', 3], ['translate line 12', 12], ['  TRANSLATE LINE 1.  ', 1]] as const) assert.deepEqual(translateRequest(s), { n }, s);
  for (const s of ['Translate line.', 'Translate line 0.', 'Translate lines 1 to 2.', 'Translate line 3. Delete bar 1.', 'translate this', '']) assert.equal(translateRequest(s), null, s);
});
test('a waiting line stops the replay as an unreadable line does: the lines before it apply, the notice says the line is waiting and how to resolve it; a list with no waiting line is as it was', () => {
  const list = ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Move bar 4 one bar left.', 'Waiting: blorp the second bar', 'Delete bar 1.'];
  const r = replayGrammar(list, 'phrase', { vault: PHRASE_VAULT });
  assert.equal(r.applied, 2); assert.equal(r.stop?.index, 2); assert.equal(r.stop?.waiting, true); assert.deepEqual(r.list.slice(2), ['Waiting: blorp the second bar', 'Delete bar 1.'], 'the waiting line and what follows are kept as written');
  assert.equal(stopNotice(r.stop!, r.applied), 'Line 3 is waiting for a translation; the note shows lines 1 and 2. Say "Translate line 3." to ask the service for it.');
  const plain = replayGrammar(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Blorp the second bar.'], 'phrase', { vault: PHRASE_VAULT }); assert.equal(plain.stop?.waiting, undefined, 'an unreadable line that is not waiting is as before');
  assert.match(stopNotice(plain.stop!, plain.applied), /^Line 2 is not a sentence I can read; the note shows line 1\./);
});
test('keptMessage says where the line went, why (the reason the grammar or the service gave), and how to take it back or translate it', () => {
  assert.equal(keptMessage(3, 'The service refused: I cannot do that with these bars.'), 'Kept as line 3, waiting for a translation. The service refused: I cannot do that with these bars. Say "Translate line 3." to ask the service again; with the box empty, Cmd/Ctrl+Z takes it back.');
  assert.equal(keptMessage(2, ''), 'Kept as line 2, waiting for a translation. Say "Translate line 2." to ask the service again; with the box empty, Cmd/Ctrl+Z takes it back.');
});
