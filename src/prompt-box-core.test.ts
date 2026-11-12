// 2026-11-12-1203 - the docked prompt box, the pure part (prompt-box-core.ts): the state machine that keeps the box an EDITOR VIEW of the Description on disk (it never overwrites typing), the Description section writer, and the
// placeholder examples (each one must parse as the sentence it claims to be).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applied, diskChanged, initBox, isEdited, keepMine, placeholderFor, replaceDescriptionSection, typed, useNew } from './prompt-box-core.ts';
import { PHRASE_DEFAULTS, noteContentFor } from './phrase-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { extractDescription } from './v2-note-core.ts';

test('a fresh box shows the Description and is not edited; typing makes it edited, and typing it back makes it not edited again', () => {
  let s = initBox('Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.');
  assert.equal(isEdited(s), false);
  s = typed(s, 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.');
  assert.equal(isEdited(s), true);
  s = typed(s, initBox('Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.').text);
  assert.equal(isEdited(s), false);
});

test('the Description changes on disk (a control wrote it) while the box is NOT edited: the field follows it, no conflict', () => {
  const s = diskChanged(initBox('A'), 'B');
  assert.deepEqual(s, { disk: 'B', text: 'B', base: 'B', conflict: false });
  assert.equal(diskChanged(s, 'B'), s, 'the same text again changes nothing');
});

test('the Description changes on disk while the person has UNAPPLIED typing: the typing is kept, nothing is overwritten, a CONFLICT is raised', () => {
  let s = typed(initBox('A'), 'my own words');
  s = diskChanged(s, 'B');
  assert.equal(s.text, 'my own words');
  assert.equal(s.disk, 'B');
  assert.equal(s.conflict, true);
  assert.equal(isEdited(s), true);
});

test('Keep my text answers the conflict and keeps the typing; Use the new one shows the Description on disk', () => {
  const conflicted = diskChanged(typed(initBox('A'), 'mine'), 'B');
  const kept = keepMine(conflicted);
  assert.deepEqual([kept.text, kept.conflict, isEdited(kept)], ['mine', false, true]);
  assert.equal(diskChanged(kept, 'B').conflict, false, 'the same new Description again is not a new conflict');
  assert.equal(diskChanged(kept, 'C').conflict, true, 'a THIRD Description is');
  assert.deepEqual(useNew(conflicted), initBox('B'));
});

test('typed words that are exactly what lands on disk are no conflict (an apply from elsewhere, the same sentence)', () => {
  const s = diskChanged(typed(initBox('A'), 'B'), 'B');
  assert.deepEqual(s, initBox('B'));
});

test('applied: the box shows what the note says now (the writer\'s canonical sentence), not what was typed', () => {
  assert.deepEqual(applied('Mix [[a]] and [[b]], 50 percent [[a]], as a vote.'), initBox('Mix [[a]] and [[b]], 50 percent [[a]], as a vote.'));
});

test('replaceDescriptionSection: only the # Description body changes, byte for byte elsewhere; the next heading stays; no Description heading = null', () => {
  const note = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 });
  const next = replaceDescriptionSection(note, 'Extend [[bar_007]] to 6 bars, repeating with fills.');
  assert.ok(next !== null);
  assert.equal(extractDescription(next!), 'Extend [[bar_007]] to 6 bars, repeating with fills.');
  assert.equal(next!.replace(extractDescription(next!), extractDescription(note)), note, 'everything but the Description is the note it was');
  assert.equal(replaceDescriptionSection('no headings here', 'x'), null);
  assert.equal(extractDescription(replaceDescriptionSection('# Description\n\nold\n\n# Recipe\n\nTake [[a]].\n', '  new  \n\n')!), 'new');
  assert.equal(replaceDescriptionSection('# Description\n\nold\n\n# Recipe\n\nTake [[a]].\n', 'new'), '# Description\n\nnew\n\n# Recipe\n\nTake [[a]].\n');
});

test('every placeholder is a Description the grammar accepts, one per kind of note', () => {
  const vault = { bars: ['bar_005', 'bar_006'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: ['kit_001'] };
  for (const kind of ['extend', 'mix', 'morph', 'transform', 'arrangement', 'composition']) {
    const sentence = placeholderFor(kind).replace(/^Describe it in a sentence, for example: /, '');
    const r = parse(sentence, vault as never);
    assert.equal(r.ok, true, `${kind}: ${sentence} -> ${JSON.stringify((r as any).error)}`);
    assert.equal((r as any).params.kind, kind, `${kind} parses as that kind`);
  }
  assert.match(placeholderFor('nonsense'), /^Describe it in a sentence, for example: Mix /, 'an unknown kind gets the mix example');
});
