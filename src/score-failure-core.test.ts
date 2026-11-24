// 2026-11-23-1022z - a score that cannot be drawn SAYS WHY in words (`This score could not be drawn: <reason>.`), never only "see console" above a dump of raw XML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { scoreFailureText } from './score-failure-core.ts';

test('the sentence names the reason in one line, ends with a full stop, and stays short', () => {
  assert.equal(scoreFailureText(new Error('Unexpected token in MusicXML')), 'This score could not be drawn: Unexpected token in MusicXML.');
  assert.equal(scoreFailureText(new Error('line one\nline two')), 'This score could not be drawn: line one.');
  assert.equal(scoreFailureText(new Error('Already ends.')), 'This score could not be drawn: Already ends.');
  assert.ok(scoreFailureText(new Error('x'.repeat(2000))).length < 260, 'a long reason is cut');
});

test('a thing that is not an Error, or has no words, still gives a sentence (never `undefined`)', () => {
  for (const e of [undefined, null, '', new Error(''), {}, 42]) assert.match(scoreFailureText(e), /^This score could not be drawn: .+\.$/);
  assert.equal(scoreFailureText('plain string reason'), 'This score could not be drawn: plain string reason.');
  assert.doesNotMatch(scoreFailureText(undefined), /undefined|null|\[object/);
});

test('the music edition uses it where the old `Score render failed` line was', () => {
  const src = fs.readFileSync(new URL('./music-edition.full.ts', import.meta.url), 'utf8');
  assert.match(src, /text: scoreFailureText\(e\)/); assert.doesNotMatch(src, /Score render failed/);
});
