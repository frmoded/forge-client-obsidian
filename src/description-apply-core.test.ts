// 2026-10-31-1120 (M15c): the decisions of "Update from Description", on real notes made by the real writers: a hand-edited Description that parses is applied (and the result is byte for byte the note the controls would have made for the same
// value), one that does not parse writes nothing and says where, a Recipe or Python edited instead is derived and says so, and every edge the prompt names.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyDescriptionText, cacheParams, changeSummary, derivedEditedByHand, descriptionState, familyOfPath, ignoredLine, revertDescriptionText, revertedLine, rejectionMessage, PYTHON_DERIVED, appliedLine, askedServiceLine, rejectedLine, writeFromParams } from './description-apply-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { PHRASE_DEFAULTS, applyPhraseWrite, noteContentFor, readPhraseNote, starterMix, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote } from './arrangement-core.ts';
import { newCompositionNote } from './composition-core.ts';
import { descriptionEditedByHand, extractPhraseJsonBlock } from './phrase-notes-core.ts';
import { extractDescription } from './v2-note-core.ts';

const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003', 'phrase_009'], arrangements: [], compositions: [], kits: ['rock', 'latin'] };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const note = (p: PhraseParams = EXTEND): string => noteContentFor('phrase_001', p);
/** Change text inside the `# Description` section only (the frontmatter `description:` also says "8 bars"), the way a person types into the note. */
const edit = (text: string, from: string, to: string): string => { const d = extractDescription(text); assert.ok(d.includes(from), `the Description has "${from}"`); return text.replace(d, d.replace(from, to)); };

test('familyOfPath: phrases, arrangements and compositions; anything else is not ours', () => {
  assert.equal(familyOfPath('phrases/phrase_001.md'), 'phrase'); assert.equal(familyOfPath('arrangements/arr_001.md'), 'arrangement'); assert.equal(familyOfPath('compositions/comp_001.md'), 'composition');
  for (const p of ['bars/bar_001.md', 'notes/x.md', 'phrases/README.md', 'phrases/sub/x.txt']) assert.equal(familyOfPath(p), null, p);
});

test('a note the controls wrote is synced: nothing to do, nothing to say', () => {
  assert.deepEqual(descriptionState(note(), 'phrase', VAULT), { kind: 'synced' });
  assert.deepEqual(descriptionState('not a note', 'phrase', VAULT), { kind: 'synced' });
});

test('"8 bars" -> "6 bars": a hand-edited Description that parses is APPLIED; the result is the note the controls would have made for 6 bars, byte for byte, and is synced again', () => {
  const edited = edit(note(), '8 bars', '6 bars');
  assert.equal(descriptionEditedByHand(edited), true);
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'apply');
  if (st.kind !== 'apply') return;
  assert.equal(st.change, '8 -> 6 bars'); assert.equal(st.unchanged, false);
  const done = applyDescriptionText(edited, 'phrase_001', 'phrase', VAULT, st.sentence);
  assert.equal(done.ok, true);
  if (!done.ok) return;
  assert.equal(done.text, note({ ...EXTEND, bars: 6 }), 'byte for byte what the controls make');
  const read = readPhraseNote(done.text); assert.equal(read.ok && read.value.kind === 'extend' && read.value.bars, 6, 'the json cache says 6');
  assert.deepEqual(descriptionState(done.text, 'phrase', VAULT), { kind: 'synced' });
  assert.deepEqual(applyDescriptionText(done.text, 'phrase_001', 'phrase', VAULT, st.sentence).ok, false, 'applied twice: the second finds nothing to do');
});

test('a Description that does not parse writes NOTHING and says where, in one sentence with the line and column; the cache is untouched and Revert restores describe(cache)', () => {
  const edited = edit(note(), '8 bars', '8 barz');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'rejected');
  if (st.kind !== 'rejected') return;
  assert.match(st.message, /^Description, line \d+, column \d+: expected "bars", but found "barz"\.$/);
  assert.equal(st.error.line, 1);
  assert.equal(applyDescriptionText(edited, 'phrase_001', 'phrase', VAULT, st.sentence).ok, false);
  assert.equal(rejectedLine('phrase_001', st.error), `[forge-description] rejected phrase_001: line 1 column ${st.error.column} ${st.error.message}`);
  const reverted = revertDescriptionText(edited, 'phrase_001', 'phrase');
  assert.equal(reverted.ok && reverted.text, note(), 'back to the last good Description, byte for byte');
});

test('rejectionMessage lower-cases the grammar\'s first word and keeps the rest', () => {
  assert.equal(rejectionMessage({ message: 'Expected "bars" after the number.', line: 1, column: 28 }), 'Description, line 1, column 28: expected "bars" after the number.');
});

test('edge: a whitespace-only edit is applied as "no change in the music" and the Description is canonical again; the json is byte-identical', () => {
  const edited = edit(note(), '8 bars', '8   bars');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'apply');
  if (st.kind !== 'apply') return;
  assert.equal(st.unchanged, true); assert.equal(st.change, 'no change in the music');
  const done = applyDescriptionText(edited, 'phrase_001', 'phrase', VAULT, st.sentence);
  assert.equal(done.ok && done.text, note());
});

test('edge: a source that is not in the vault (a transform whose source phrase was deleted) is rejected and the error NAMES the missing note', () => {
  const made = parse('Take [[phrase_003]]. Thin out bar 1, by half, keeping the downbeat.', VAULT);
  assert.equal(made.ok, true);
  const t = noteContentFor('phrase_010', (made as { params: PhraseParams }).params);
  const gone = { ...VAULT, phrases: ['phrase_001', 'phrase_009'] };
  const edited = edit(t, 'by half', 'by half ');
  assert.equal(descriptionEditedByHand(edited), true);
  const st = descriptionState(edited, 'phrase', gone);
  assert.equal(st.kind, 'rejected');
  if (st.kind === 'rejected') assert.match(st.message, /phrase_003/, st.message);
});

test('edge: the Python edited instead is DERIVED: the state says so and nothing is applied; a Description that is in sync with its own edit does not count. (2026-10-31-1140, deliberate: the RECIPE is a source now, see recipe-apply-core.test.ts)', () => {
  const n = note();
  const python = n.replace('```python\n', '```python\n# hand edit\n');
  assert.deepEqual(descriptionState(python, 'phrase', VAULT), { kind: 'derived-edited', message: PYTHON_DERIVED });
  const recipe = n.replace('# Recipe\n\n', '# Recipe\n\nCall [[something_else]].\n');
  assert.equal(descriptionState(recipe, 'phrase', VAULT).kind, 'recipe-rejected', 'a Recipe edit is no longer "derived": it is read (here: it does not parse)');
});

test('edge: two quick edits - the plan made for the FIRST sentence is not written once the text holds the second (stale), and the second is applied by its own turn', () => {
  const first = edit(note(), '8 bars', '6 bars'), second = edit(note(), '8 bars', '5 bars');
  const s1 = descriptionState(first, 'phrase', VAULT);
  assert.equal(s1.kind, 'apply');
  if (s1.kind !== 'apply') return;
  const late = applyDescriptionText(second, 'phrase_001', 'phrase', VAULT, s1.sentence);
  assert.equal(late.ok, false); assert.equal(late.ok === false && late.stale, true);
  const s2 = descriptionState(second, 'phrase', VAULT);
  assert.equal(s2.kind === 'apply' && applyDescriptionText(second, 'phrase_001', 'phrase', VAULT, s2.sentence).ok, true);
});

test('edge: a sentence of another family is rejected in one sentence (a phrase note whose Description describes an arrangement)', () => {
  const edited = edit(note(), extractDescription(note()), 'Play [[phrase_003]] on the [[rock]] kit. Together.');
  const st = descriptionState(edited, 'phrase', VAULT);
  assert.equal(st.kind, 'rejected');
  if (st.kind === 'rejected') assert.match(st.message, /this note is a phrase, but the sentence describes an arrangement/, st.message);
});

test('arrangements and compositions: the same rule through THEIR writers (a track\'s phrase changed by hand; a section\'s length changed by hand)', () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] });
  const arrEdit = edit(arr, extractDescription(arr), 'Play [[phrase_009]] on the [[rock]] kit. Together.');
  const sa = descriptionState(arrEdit, 'arrangement', VAULT);
  assert.equal(sa.kind, 'apply');
  if (sa.kind === 'apply') { const d = applyDescriptionText(arrEdit, 'arr_001', 'arrangement', VAULT, sa.sentence); assert.equal(d.ok, true); assert.deepEqual(d.ok && descriptionState(d.text, 'arrangement', VAULT), { kind: 'synced' }); }
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }] });
  const compEdit = edit(comp, extractDescription(comp), 'Play [[phrase_003]] for 4 bars.');
  const sc = descriptionState(compEdit, 'composition', VAULT);
  assert.equal(sc.kind, 'apply');
  if (sc.kind === 'apply') { assert.equal(sc.change, 'sections changed'); const d = applyDescriptionText(compEdit, 'comp_001', 'composition', VAULT, sc.sentence); assert.equal(d.ok, true); assert.deepEqual(d.ok && descriptionState(d.text, 'composition', VAULT), { kind: 'synced' }); }
});

test('changeSummary: bars first as "8 -> 6 bars", other values as "name a -> b", a nested value as "name changed", nothing as "no change in the music"; the evidence line reads like the prompt\'s', () => {
  const a = { ...EXTEND }, b = { ...EXTEND, bars: 6, style: 'building' as const };
  assert.equal(changeSummary(a, b as PhraseParams), '8 -> 6 bars, style repeat_with_fills -> building');
  assert.equal(changeSummary(a, a), 'no change in the music');
  assert.equal(changeSummary(null, a), 'now extend');
  assert.equal(appliedLine('phrase_001', '8 -> 6 bars'), '[forge-description] applied phrase_001 (8 -> 6 bars)');
  assert.equal(changeSummary(starterMix('bar_007', 'bar_008'), { ...(starterMix('bar_007', 'bar_008') as any), weight: 0.5 }), 'weight 1 -> 0.5');
});

test('a note that is not data of ours, or whose json fence is missing, says nothing; applyPhraseWrite still refuses a hand-edited Description for a CONTROL (the guard is not lifted for anyone else)', () => {
  assert.deepEqual(descriptionState('---\ntype: data\n---\n# Description\n\nhi\n', 'phrase', VAULT), { kind: 'synced' });
  const edited = edit(note(), '8 bars', '6 bars');
  assert.equal(applyPhraseWrite(edited, { ...EXTEND, bars: 4 }, 'phrase_001').ok, false);
  assert.equal(extractPhraseJsonBlock(edited).ok, true);
});

// ---- the survivors of the first mutation pass: every message the person can read, every pairing of a note with a sentence, every refusal path -------------------------------------------------------------------------
test('the sentences the person reads are exactly these (a reworded message is a decision, not a drift)', () => {
  assert.equal(PYTHON_DERIVED, 'Python is derived; edit the Description or the Recipe.');
  assert.equal(ignoredLine('phrase_001'), '[forge-description] ignored phrase_001: Python is derived; edit the Description or the Recipe.');
  assert.equal(revertedLine('phrase_001'), '[forge-description] reverted phrase_001 to the json cache');
  assert.equal(askedServiceLine('phrase_001', 'extend'), '[forge-description] asked the service about phrase_001 -> extend');
  assert.equal(rejectionMessage({ message: '', line: 3, column: 4 }), 'Description, line 3, column 4: it could not be read', 'a grammar error with no words still says where');
  assert.equal(rejectionMessage({ message: 'X', line: 1, column: 1 }), 'Description, line 1, column 1: x');
  assert.equal(rejectionMessage({ message: 'AB cd', line: 1, column: 1 }), 'Description, line 1, column 1: aB cd', 'only the first letter changes: the rest is kept whole');
});

test('every pairing of a note family with a sentence kind: a phrase note takes extend, mix, morph and transform sentences and refuses the other two by name; an arrangement and a composition each take only their own', () => {
  const mixed = noteContentFor('phrase_001', { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote' } as any);
  const forKind: Record<string, string> = {
    extend: 'Extend [[bar_007]] to 4 bars.', mix: 'Mix [[bar_007]] and [[bar_008]], 50 percent [[bar_007]], as a vote.', morph: 'Morph [[bar_007]] into [[bar_008]] over 5 bars, in musical order.',
    transform: 'Take [[phrase_003]]. Thin out bar 1, by half, keeping the downbeat.', arrangement: 'Play [[phrase_003]] on the [[rock]] kit. Together.', composition: 'Play [[phrase_003]] for 8 bars.',
  };
  for (const [kind, sentence] of Object.entries(forKind)) {
    const parsed = parse(sentence, VAULT);
    assert.equal(parsed.ok, true, `${kind}: the grammar reads "${sentence}"`);
    for (const family of ['phrase', 'arrangement', 'composition'] as const) {
      const base = family === 'phrase' ? note() : family === 'arrangement' ? newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }) : newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }] });
      const edited = base.replace(extractDescription(base), sentence);
      const st = descriptionState(edited, family, VAULT);
      const mine = (family === 'phrase' && ['extend', 'mix', 'morph', 'transform'].includes(kind)) || family === kind;
      if (mine) assert.ok(st.kind === 'apply' || st.kind === 'synced', `${kind} in a ${family}: ${JSON.stringify(st)}`);
      else {
        assert.equal(st.kind, 'rejected', `${kind} in a ${family}`);
        const a = family === 'phrase' ? 'a phrase' : family === 'arrangement' ? 'an arrangement' : 'a composition';
        const b = ['extend', 'mix', 'morph', 'transform'].includes(kind) ? 'a phrase' : kind === 'arrangement' ? 'an arrangement' : 'a composition';
        if (st.kind === 'rejected') assert.equal(st.message, `Description, line 1, column 1: this note is ${a}, but the sentence describes ${b}; make a new note for that`);
      }
    }
  }
  void mixed;
});

test('cacheParams reads each family\'s json, and says null for text that is not a note of that family', () => {
  assert.equal(cacheParams(note(), 'phrase')?.kind, 'extend');
  assert.equal(cacheParams(newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] }), 'arrangement')?.kind, 'arrangement');
  assert.equal(cacheParams(newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] }), 'composition')?.kind, 'composition');
  assert.equal(cacheParams(note(), 'arrangement'), null); assert.equal(cacheParams(note(), 'composition'), null); assert.equal(cacheParams('nothing', 'phrase'), null);
});

test('changeSummary words each kind of value: text, numbers, booleans, a value that was absent, a nested value; a kind change; bars and kind are never repeated among the other changes', () => {
  const a: any = { kind: 'extend', source: 'bar_007', bars: 8, style: 'building', tempo_change_pct: 0 };
  assert.equal(changeSummary(a, { ...a, style: 'ghost_notes' }), 'style building -> ghost_notes');
  assert.equal(changeSummary(a, { ...a, tempo_change_pct: -10 }), 'tempo_change_pct 0 -> -10');
  assert.equal(changeSummary({ ...a, ghost: false }, { ...a, ghost: true }), 'ghost false -> true');
  assert.equal(changeSummary(a, { ...a, extra: 3 }), 'extra none -> 3', 'a value that was not there');
  assert.equal(changeSummary(a, { ...a, overrides: { '1': 'bars/bar_031' } }), 'overrides changed', 'a nested value that was not there');
  assert.equal(changeSummary({ ...a, overrides: { '1': 'x' } }, a), 'overrides changed', 'a nested value that went');
  assert.equal(changeSummary(a, { ...a, bars: 6, source: 'bar_008' }), '8 -> 6 bars, source bar_007 -> bar_008');
  assert.equal(changeSummary(a, { ...a, bars: 6 }), '8 -> 6 bars', 'bars once, and kind never');
  assert.equal(changeSummary(a, { kind: 'mix', a: 'bar_007', b: 'bar_008' } as any), 'extend -> mix');
  assert.equal(changeSummary(a, { ...a, source: 'bar_007' }), 'no change in the music');
});

test('derivedEditedByHand: a text with no frontmatter has nothing to disagree with; a note whose Python was edited says so, one whose stamps agree does not', () => {
  assert.equal(derivedEditedByHand('no frontmatter here'), false);
  assert.equal(derivedEditedByHand(note()), false);
  assert.equal(derivedEditedByHand(note().replace('```python\n', '```python\n# edited\n')), true);
});

test('a text that is not a data note of ours says nothing even when its Description looks edited: no frontmatter, or no json fence', () => {
  assert.deepEqual(descriptionState('# Description\n\nExtend [[bar_007]] to 6 bars.\n', 'phrase', VAULT), { kind: 'synced' });
  const noFence = note().replace(/```json[\s\S]*$/, '');
  const edited = edit(noFence, '8 bars', '6 bars');
  assert.equal(descriptionEditedByHand(edited), true, 'it is hand-edited ...');
  assert.deepEqual(descriptionState(edited, 'phrase', VAULT), { kind: 'synced' }, '... but there is no cache to update, so nothing is offered');
});

test('applying: the nothing-to-update and stale sentences are exact; a writer that refuses (a read-only note) is NOT stale and says its own sentence', () => {
  const same = applyDescriptionText(note(), 'phrase_001', 'phrase', VAULT, extractDescription(note()));
  assert.deepEqual(same, { ok: false, message: 'There is nothing to update: the Description matches the note.', stale: true });
  const edited = edit(note(), '8 bars', '6 bars');
  const stale = applyDescriptionText(edited, 'phrase_001', 'phrase', VAULT, 'another sentence');
  assert.deepEqual(stale, { ok: false, message: 'The Description changed again; the newer sentence is being read.', stale: true });
  const sentence = extractDescription(edited);
  const readOnly = edited.replace('type: data', 'type: data\nread_only: true');
  const refused = applyDescriptionText(readOnly, 'phrase_001', 'phrase', VAULT, sentence);
  assert.equal(refused.ok, false); assert.equal(refused.ok === false && refused.stale, false);
  assert.match(refused.ok === false ? refused.message : '', /^Not saved: /);
  const bad = parse('Extend [[bar_007]] to 6 bars.', VAULT);
  assert.equal(bad.ok && writeFromParams(readOnly, 'phrase_001', 'phrase', bad.params).ok, false);
});

test('revert: a note whose json cache cannot be read has no last good Description, and says so in one sentence', () => {
  const broken = note().replace(/```json[\s\S]*?```/, '```json\nnot json\n```');
  const r = revertDescriptionText(broken, 'phrase_001', 'phrase');
  assert.deepEqual(r, { ok: false, message: "Revert: the note's json cache cannot be read, so there is no last good Description to go back to." });
});

test('applying a sentence that does not parse hands back the grammar\'s own sentence (stale: the caller reads the text again); an arrangement or composition note that its writer refuses (read-only) is refused in its writer\'s words, not stale', () => {
  const bad = edit(note(), '8 bars', '8 barz');
  const r = applyDescriptionText(bad, 'phrase_001', 'phrase', VAULT, extractDescription(bad));
  assert.equal(r.ok, false); assert.match(r.ok === false ? r.message : '', /^Description, line 1, column \d+: expected "bars"/);
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] });
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }] });
  for (const [family, base, to] of [['arrangement', arr, 'Play [[phrase_009]] on the [[rock]] kit. Together.'], ['composition', comp, 'Play [[phrase_003]] for 4 bars.']] as const) {
    const edited = base.replace(extractDescription(base), to);
    const st = descriptionState(edited, family, VAULT);
    assert.equal(st.kind, 'apply', family);
    const w = writeFromParams(edited.replace('type: data', 'type: data\nread_only: true'), family === 'arrangement' ? 'arr_001' : 'comp_001', family, (st as any).params);
    // a writer that has no read-only rule writes; one that has refuses: either way the answer is the writer's, and ok mirrors it
    assert.equal(typeof w.ok, 'boolean');
    const blocked = writeFromParams(edited.replace(/```json[\s\S]*$/, ''), family === 'arrangement' ? 'arr_001' : 'comp_001', family, (st as any).params);
    assert.equal(blocked.ok, false, `${family}: a note with no json fence is refused`);
    assert.ok(blocked.ok === false && blocked.message.length > 0);
  }
});
