// 2026-11-21-1015 PART B (provenance): when a sentence went through the repair or the service, the canonical line in the list keeps the driver's own words beside it: a muted trailing marker the grammar ignores,
// `Move bar 4 one bar left. (you said: Move bar 4 before bar 2.)`. The replay is unchanged and exact; a line typed canonically has no marker; undo removes line and marker together; the marker never carries a token, a URL or a file name; a hand edit that deletes
// it is fine. The pure part: splitSaid / withSaid and the places in the list core that must not see the marker.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { SAID_MAX, replayGrammar, append, subjectOf, splitSaid, withSaid } from './sentence-list-core.ts';

test('splitSaid reads a trailing marker and gives the clean line; a line with no marker is itself; only a TRAILING marker counts', () => {
  assert.deepEqual(splitSaid('Move bar 4 one bar left. (you said: Move bar 4 before bar 2.)'), { line: 'Move bar 4 one bar left.', said: 'Move bar 4 before bar 2.' });
  assert.deepEqual(splitSaid('Move bar 4 one bar left.'), { line: 'Move bar 4 one bar left.', said: null });
  assert.deepEqual(splitSaid('Delete bar 2.   (you said: remove the 2nd bar)  '), { line: 'Delete bar 2.', said: 'remove the 2nd bar' });
  assert.equal(splitSaid('Delete bar 2. (you said: x) and more').said, null, 'a marker in the middle is not a marker');
  assert.equal(splitSaid('').line, '');
});
test('withSaid appends the marker to a line; no words (or only noise) means no marker; the words are one line, without brackets, parentheses, links, paths, file names, URLs or token-like runs, and at most SAID_MAX characters', () => {
  assert.equal(withSaid('Move bar 4 one bar left.', 'Move bar 4 before bar 2.'), 'Move bar 4 one bar left. (you said: Move bar 4 before bar 2.)');
  assert.equal(withSaid('Move bar 4 one bar left.', ''), 'Move bar 4 one bar left.'); assert.equal(withSaid('Move bar 4 one bar left.', '  ()  '), 'Move bar 4 one bar left.');
  assert.equal(withSaid('X.', 'Play [[phrase_001]]   now\nplease (really)'), 'X. (you said: Play phrase_001 now please really)');
  const nasty = withSaid('X.', 'see https://example.com/a?token=abc and notes/secret.md or bars/bar_001.md and sk-ant-api03-0123456789abcdef0123456789abcdef');
  assert.doesNotMatch(nasty, /https?:|\.md|\/|sk-ant|0123456789abcdef/); assert.match(nasty, /^X\. \(you said: see and or and \[(?:removed|link removed)\]\)$|^X\. \(you said: [^()]*\)$/);
  assert.ok(withSaid('X.', 'a'.repeat(1000)).length <= 'X. (you said: )'.length + SAID_MAX);
  assert.equal(splitSaid(withSaid('X.', 'a (b) c [[d]]')).said, 'a b c d', 'what withSaid writes splitSaid reads');
});
test('the grammar does not see the marker: the replay of a list with markers equals the replay of the clean list, line for line, with the markers kept in the output', () => {
  const clean = ['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Move bar 4 one bar left.', 'Delete bar 2.'];
  const marked = [clean[0], withSaid(clean[1], 'Move bar 4 before bar 2.'), withSaid(clean[2], 'remove bar 2')];
  const a = replayGrammar(clean, 'phrase', { vault: PHRASE_VAULT }), b = replayGrammar(marked, 'phrase', { vault: PHRASE_VAULT });
  assert.equal(b.stop, null); assert.equal(b.applied, a.applied); assert.deepEqual(b.params, a.params); assert.equal(b.recipe.join('\n'), a.recipe.join('\n')); assert.equal(b.python, a.python);
  assert.deepEqual(b.list, marked, 'the lines come back as written, markers included');
  assert.deepEqual(replayGrammar(clean, 'phrase', { vault: PHRASE_VAULT }).list, a.list, 'a list with no marker is as it was');
});
test('a marker is not part of what a line is ABOUT: the conflict rule and "replace in place" read the line without it, and a line with a marker is itself replaceable', () => {
  assert.equal(subjectOf(withSaid('Make it 20 percent slower.', 'slow it down 20 percent'), 'phrase'), subjectOf('Make it 20 percent slower.', 'phrase'));
  const list = ['Extend [[bar_005]] to 4 bars, repeating with fills.', withSaid('Make it 20 percent slower.', 'a bit slower')];
  const r = append(list, 'Make it 10 percent slower.', 'phrase'); assert.equal(r.replaced?.index, 1); assert.deepEqual(r.list, [list[0], 'Make it 10 percent slower.']);
});
test('an unreadable line keeps its marker too (the replay stops there, the line is written back as written)', () => {
  const list = ['Extend [[bar_005]] to 4 bars, repeating with fills.', withSaid('Blorp the second bar.', 'blorp it')];
  const r = replayGrammar(list, 'phrase', { vault: PHRASE_VAULT }); assert.notEqual(r.stop, null); assert.equal(r.applied, 1); assert.equal(r.list[1], list[1]);
});
