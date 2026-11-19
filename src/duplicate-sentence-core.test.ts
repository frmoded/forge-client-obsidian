// 2026-11-19-0992 - DUPLICATE A BAR FROM THE COMPOSER, the pure part (no obsidian, no DOM): the sentence `Duplicate [[bar_007]].` is a canonical ACTION sentence read LOCALLY (no model call); it is not a recipe line, so the
// list grammar never sees it. What is pinned here: when the NEXT click on a bar is a copy click (the composer's text is exactly "Duplicate" or ends with the word, any case); the text the click makes; what the reader says of a
// text (an action, not one, or an action that cannot be done, in plain words); which note a link means (a bar, a phrase, an arrangement or a composition; an unknown or ambiguous name is refused); the preview's words. Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { armsDuplicate, readActionText, resolveDuplicateTarget, duplicatePreviewLine, withDuplicateLink, idParts, linkInsertion } from './duplicate-sentence-core.ts';
import { parse } from './phrase-grammar-core.ts';
import type { GrammarVault } from './phrase-grammar-core.ts';

const VAULT: GrammarVault = { bars: ['bar_001', 'bar_007', 'shared'], phrases: ['phrase_001', 'bridge', 'shared'], arrangements: ['arr_001'], compositions: ['comp_001'], kits: ['rock'] };

// ---- when the next click is a copy click ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('armsDuplicate: the text, trimmed and in any case, is exactly "Duplicate" or ENDS with the word; nothing else arms the click', () => {
  for (const yes of ['Duplicate', 'duplicate', 'DUPLICATE', '  Duplicate  ', 'Duplicate\n', 'DuPlIcAtE', 'Keep bars 1 to 2. Duplicate', 'please duplicate', 'a\nduplicate']) assert.equal(armsDuplicate(yes), true, JSON.stringify(yes));
  for (const no of ['', '   ', 'Duplicate [[bar_007]].', 'Duplicate.', 'Duplicates', 'duplicated', 'unduplicate', 'Duplicate the bar', 'Duplicate bar', 'Keep bars 1 to 2.', 'Dup', 'Duplicate[[bar_007]]']) assert.equal(armsDuplicate(no), false, JSON.stringify(no));
});

test('withDuplicateLink: the click appends " [[name]]." to the text, the trailing space of the text cut; the result no longer arms the next click', () => {
  assert.equal(withDuplicateLink('Duplicate', 'bar_007'), 'Duplicate [[bar_007]].');
  assert.equal(withDuplicateLink('duplicate  ', 'bar_010'), 'duplicate [[bar_010]].');
  assert.equal(withDuplicateLink('Keep bars 1 to 2. Duplicate\n', 'bar_007'), 'Keep bars 1 to 2. Duplicate [[bar_007]].');
  for (const t of ['Duplicate', 'duplicate ', 'x. DUPLICATE']) assert.equal(armsDuplicate(withDuplicateLink(t, 'bar_007')), false, 'a normal click pins again after the copy click');
});

// ---- the sentence ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('readActionText: "Duplicate [[x]]." is the action, in any case, with or without the full stop, an alias dropped; anything else that is not an action is "none" (the list grammar\'s)', () => {
  assert.deepEqual(readActionText('Duplicate [[bar_007]].'), { kind: 'duplicate', target: 'bar_007' });
  assert.deepEqual(readActionText('duplicate [[bar_007]]'), { kind: 'duplicate', target: 'bar_007' });
  assert.deepEqual(readActionText('  DUPLICATE   [[ bar_007 ]]  .  '), { kind: 'duplicate', target: 'bar_007' });
  assert.deepEqual(readActionText('Duplicate [[bars/bar_007|the groove]].'), { kind: 'duplicate', target: 'bars/bar_007' });
  for (const none of ['', 'Keep bars 1 to 2.', 'Extend [[bar_005]] to 4 bars.', 'Duplicates [[bar_007]].', 'Copy bars 1 to 2.', 'Unduplicate [[bar_007]].', 'Double up bar 1.']) assert.deepEqual(readActionText(none), { kind: 'none' }, JSON.stringify(none));
});

test('readActionText: an action that cannot be done is refused in plain words (no bare "Duplicate", no second sentence, no second link, no text that is not a link)', () => {
  const refused = (t: string): string => { const r = readActionText(t); assert.equal(r.kind, 'refused', JSON.stringify(t)); return (r as { message: string }).message; };
  assert.equal(refused('Duplicate'), 'Duplicate what? Click a bar on the Score, or write its link, for example: Duplicate [[bar_007]].');
  assert.equal(refused('Duplicate.'), 'Duplicate what? Click a bar on the Score, or write its link, for example: Duplicate [[bar_007]].');
  assert.match(refused('Duplicate [[bar_007]]. Keep bars 1 to 2.'), /on its own/);
  assert.match(refused('Keep bars 1 to 2. Duplicate [[bar_007]].'), /on its own/, 'the word anywhere in a text with other sentences: refused here, never sent to the sentence service');
  assert.match(refused('Take [[bar_007]]. Duplicate'), /on its own/);
  assert.match(refused('Duplicate [[bar_007]]. Duplicate [[bar_001]].'), /one note at a time/);
  assert.match(refused('Duplicate [[bar_007]] and [[bar_001]].'), /one note at a time/);
  assert.match(refused('Duplicate bar_007.'), /link/);
  for (const t of ['Duplicate', 'Duplicate [[bar_007]]. Keep bars 1 to 2.', 'Duplicate bar_007.']) assert.ok(!/undefined|\[object|null/.test(refused(t)), 'no code words in a refusal');
});

test('the LIST grammar never reads Duplicate: it is not a recipe line (the phrase\'s Description cannot hold it)', () => {
  const r = parse('Duplicate [[bar_007]].', VAULT);
  assert.equal(r.ok, false, 'the grammar of the list does not know the verb');
});

// ---- which note ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('resolveDuplicateTarget: a bar, a phrase, an arrangement or a composition by its name; the folder form too; the ids and paths are the plugin\'s own', () => {
  const ok = (t: string) => { const r = resolveDuplicateTarget(t, VAULT); assert.equal(r.ok, true, t); return r as Extract<ReturnType<typeof resolveDuplicateTarget>, { ok: true }>; };
  assert.deepEqual(ok('bar_007'), { ok: true, family: 'bar', name: 'bar_007', id: 'bars/bar_007', path: 'bars/bar_007.md' });
  assert.deepEqual(ok('bridge'), { ok: true, family: 'phrase', name: 'bridge', id: 'phrases/bridge', path: 'phrases/bridge.md' });
  assert.deepEqual(ok('arr_001'), { ok: true, family: 'arrangement', name: 'arr_001', id: 'arrangements/arr_001', path: 'arrangements/arr_001.md' });
  assert.deepEqual(ok('comp_001'), { ok: true, family: 'composition', name: 'comp_001', id: 'compositions/comp_001', path: 'compositions/comp_001.md' });
  assert.deepEqual(ok('bars/bar_007'), ok('bar_007'));
  assert.deepEqual(ok('phrases/shared'), { ok: true, family: 'phrase', name: 'shared', id: 'phrases/shared', path: 'phrases/shared.md' });
  assert.deepEqual(ok('bars/shared'), { ok: true, family: 'bar', name: 'shared', id: 'bars/shared', path: 'bars/shared.md' });
});

test('resolveDuplicateTarget: an unknown note and a name two kinds of note share are refused in plain words; a kit is not copied', () => {
  const no = (t: string): string => { const r = resolveDuplicateTarget(t, VAULT); assert.equal(r.ok, false, t); return (r as { message: string }).message; };
  assert.equal(no('bar_099'), 'There is no note called [[bar_099]] in this vault, so there is nothing to duplicate.');
  assert.equal(no('phrases/bar_007'), 'There is no note called [[phrases/bar_007]] in this vault, so there is nothing to duplicate.');
  assert.match(no('shared'), /More than one note is called \[\[shared\]\]/);
  assert.match(no('shared'), /\[\[bars\/shared\]\]/, 'it says how to write it');
  assert.match(no('rock'), /no note called/, 'a kit is not one of the four kinds');
  assert.match(no(''), /no note called|Duplicate what/);
});

test('the preview says what will be done: "Copy [[x]] to a new bar." (phrase, arrangement, composition likewise)', () => {
  assert.equal(duplicatePreviewLine({ family: 'bar', name: 'bar_007' }), 'Copy [[bar_007]] to a new bar.');
  assert.equal(duplicatePreviewLine({ family: 'phrase', name: 'bridge' }), 'Copy [[bridge]] to a new phrase.');
  assert.equal(duplicatePreviewLine({ family: 'arrangement', name: 'arr_001' }), 'Copy [[arr_001]] to a new arrangement.');
  assert.equal(duplicatePreviewLine({ family: 'composition', name: 'comp_001' }), 'Copy [[comp_001]] to a new composition.');
});

// ---- mutation survivors of the first pass (0992), each killed by a test of its own ------------------------------------------------------------------------------------------------------------------
test('readActionText: a text of several sentences with no Duplicate in it is "none" (never refused: the list grammar reads it)', () => {
  assert.deepEqual(readActionText('Keep bars 1 to 2. Keep bar 3.'), { kind: 'none' });
  assert.deepEqual(readActionText('Keep bars 1 to 2.\nKeep bar 3.'), { kind: 'none' });
});

test('readActionText: every refusal says kind "refused" with its words (an empty link too), and "None" is exactly {kind: none}', () => {
  for (const t of ['Duplicate', 'Duplicate [[ ]].', 'Duplicate [[|x]].', 'Duplicate [[a]] [[b]].', 'Duplicate the bar.', 'Keep bar 1. Duplicate [[bar_007]].']) {
    const r = readActionText(t);
    assert.equal(r.kind, 'refused', t);
    assert.ok('message' in r && r.message.length > 10, t);
  }
});

test('resolveDuplicateTarget: the ambiguity message names each kind ("a bar and a phrase") and a folder form of the name is suggested', () => {
  const r = resolveDuplicateTarget('shared', VAULT);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /\(a bar and a phrase\)/);
  assert.match((r as { message: string }).message, /\[\[bars\/shared\]\]/);
});

test('idParts: a lineage id is the folder and the name; anything else is exactly null (never undefined, never a throw)', () => {
  assert.deepEqual(idParts('bars/bar_007'), { family: 'bar', name: 'bar_007' });
  assert.deepEqual(idParts('phrases/x.md'), { family: 'phrase', name: 'x' });
  for (const bad of [null, undefined, '', 'bar_007', 'kits/rock', 'a/b/c', 'nofolder']) assert.strictEqual(idParts(bad as string | null | undefined), null, String(bad));
});

// ---- 2026-11-19-0992a (R1): the link a click inserts after ANY typed text ---------------------------------------------------------------------------------------------------------------------------------
test('linkInsertion: " [[name]]" (one leading space, no full stop) after text that does not end in white space or an opening bracket; none at the very start, after a space, a line break or ( [ {', () => {
  assert.equal(linkInsertion('Foo', 'bar_007'), ' [[bar_007]]');
  for (const before of ['', 'Foo ', 'Foo\n', 'Foo\t', 'Keep (', 'Keep [', 'Keep {']) assert.equal(linkInsertion(before, 'bar_007'), '[[bar_007]]', JSON.stringify(before));
  assert.equal(linkInsertion('Foo.', 'phrase_008'), ' [[phrase_008]]'); assert.equal(linkInsertion('Foo)', 'bar_007'), ' [[bar_007]]');
});
