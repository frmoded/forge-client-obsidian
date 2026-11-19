// 2026-11-19-0970 (THE LIST MODEL, stage 1) - the NOTE side of the list, still pure (strings in, strings out): how an arrangement or composition note is laid out once its Description is a numbered list, what the ONE write makes of a replay,
// that the write is idempotent (an unchanged list writes the same bytes: "no-op stays no-op"), that an undo down to nothing gives back the EMPTY note of 0960 byte for byte, what a hand edit of the list means (description-apply-core's
// descriptionState and applyDescriptionText), and that a phrase, a bar and a note that is not music are untouched (P3).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listOfNote, writeListNote } from './sentence-list-note-core.ts';
import { replayGrammar, render, linesOfParams } from './sentence-list-core.ts';
import { applyDescriptionText, descriptionState, writeFromParams } from './description-apply-core.ts';
import { emptyArrangementNote, emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { newArrangementNote, refreshArrangementNoteText, readArrangementNote, applySettingsPatches, type ArrangementParams } from './arrangement-core.ts';
import { newCompositionNote, readCompositionNote, refreshCompositionNoteText, type CompositionParams } from './composition-core.ts';
import { descriptionEditedByHand, pythonEditedByHand, recipeEditedByHand, sourceChainStamps } from './phrase-notes-core.ts';
import { newPhraseNote } from './phrase-notes-core.ts';
import { formatPhraseJson, applyPhraseWrite, type PhraseParams } from './phrase-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { ARR_001, C5_LINES, C5_PARAGRAPH, C6_LINES, C6_PARAGRAPH, VAULT, withoutDescription } from './test-support/sentence-list-fixtures.ts';

const ctx = { vault: VAULT };
const writeArr = (text: string, lines: string[], name = 'arr_001') => { const w = writeListNote(text, name, 'arrangement', replayGrammar(lines, 'arrangement', ctx)); assert.ok(w.ok, 'it writes'); return (w as { text: string }).text; };
const writeComp = (text: string, lines: string[], name = 'comp_001') => { const w = writeListNote(text, name, 'composition', replayGrammar(lines, 'composition', ctx)); assert.ok(w.ok, 'it writes'); return (w as { text: string }).text; };
const params = <T>(sentence: string): T => { const r = parse(sentence, VAULT); assert.ok(r.ok); return (r as { params: T }).params; };

// ---- the layout ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an arrangement note written from a list: the Description is the numbered list, the Recipe, Python and json cache are what today\'s single sentence made, the stamps say it is in sync', () => {
  const note = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  assert.equal(extractDescription(note), render(C5_LINES));
  assert.equal(extractDescription(note), '1. Play [[phrase_001]] on the [[rock]] kit.\n2. Play [[phrase_002]] on the [[latin]] kit.\n3. Play the [[latin]] kit at 60 percent volume.');
  const today = newArrangementNote('arr_001', params<ArrangementParams>(C5_PARAGRAPH));
  assert.equal(withoutDescription(note), withoutDescription(today), 'everything but the Description section and the two stamps that hash it is byte for byte what the single sentence made');
  assert.ok(!descriptionEditedByHand(note) && !recipeEditedByHand(note) && !pythonEditedByHand(note), 'the note is in sync with its own stamps');
  assert.equal(descriptionState(note, 'arrangement', VAULT).kind, 'synced');
  assert.deepEqual(sourceChainStamps(note).description_hash, /description_hash: (\w+)/.exec(note)![1], 'the stamp is the hash of the list text');
});

test('a composition note written from a list (C6) is the note today\'s sentence made, but for the Description', () => {
  const note = writeComp(emptyCompositionNote('comp_001'), C6_LINES);
  assert.equal(extractDescription(note), '1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.\n3. Repeat that once more.');
  assert.equal(withoutDescription(note), withoutDescription(newCompositionNote('comp_001', params<CompositionParams>(C6_PARAGRAPH))));
  const r = readCompositionNote(note); assert.ok(r.ok); assert.deepEqual((r as { value: CompositionParams }).value.sections.map((s) => s.source), ['phrases/phrase_001', 'phrases/phrase_002']);
  assert.equal(descriptionState(note, 'composition', VAULT).kind, 'synced');
});

test('arr_001 of music-playground: replaying its own Description as a list rewrites only the Description section and its two stamps', () => {
  const lines = listOfNote(ARR_001, 'arrangement', VAULT).list;
  const note = writeArr(ARR_001, lines, 'arr_001');
  assert.equal(withoutDescription(note), withoutDescription(ARR_001));
  assert.equal(extractDescription(note), render(lines)); assert.notEqual(extractDescription(note), extractDescription(ARR_001));
});

test('the frontmatter keeps the person\'s own lines (root: true of a composition, anything else) and the derived `description:` and links', () => {
  const root = emptyCompositionNote('comp_001', ['root: true', 'tags: [piece]']);
  const note = writeComp(root, C6_LINES);
  assert.match(note, /^root: true$/m); assert.match(note, /^tags: \[piece\]$/m);
  assert.match(note, /^description: "comp_001 — a piece of 2 sections:/m); assert.match(note, /^links:\n  - "\[\[phrase_001\]\]"\n  - "\[\[phrase_002\]\]"$/m);
});

// ---- idempotent: no-op stays no-op ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('replaying an unchanged list writes the SAME bytes (the write is idempotent), for both kinds, and again from the note\'s own list', () => {
  const a = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  assert.equal(writeArr(a, C5_LINES), a);
  assert.equal(writeArr(a, listOfNote(a, 'arrangement', VAULT).list), a, 'reading the list back out of the note and writing it again changes nothing');
  const c = writeComp(emptyCompositionNote('comp_001'), C6_LINES);
  assert.equal(writeComp(c, C6_LINES), c); assert.equal(writeComp(c, listOfNote(c, 'composition', VAULT).list), c);
});

test('undo down to nothing gives back the EMPTY note (0960) byte for byte, and writing the empty list again is a no-op', () => {
  const a = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  const back = writeListNote(a, 'arr_001', 'arrangement', replayGrammar([], 'arrangement', ctx));
  assert.ok(back.ok); assert.equal((back as { text: string }).text, emptyArrangementNote('arr_001'));
  const c = writeComp(emptyCompositionNote('comp_001', ['root: true']), C6_LINES);
  const cb = writeListNote(c, 'comp_001', 'composition', replayGrammar([], 'composition', ctx)); assert.ok(cb.ok); assert.equal((cb as { text: string }).text, emptyCompositionNote('comp_001', ['root: true']));
  assert.equal(writeListNote(emptyCompositionNote('comp_001'), 'comp_001', 'composition', replayGrammar([], 'composition', ctx)).ok && (writeListNote(emptyCompositionNote('comp_001'), 'comp_001', 'composition', replayGrammar([], 'composition', ctx)) as { text: string }).text, emptyCompositionNote('comp_001'));
});

test('a line the grammar cannot read is KEPT in the Description and the note shows the lines before it (the json cache is the prefix); the stamps still say "in sync" so nothing rewrites it again', () => {
  const lines = [C5_LINES[0], 'this is not a sentence', C5_LINES[1]];
  const note = writeArr(emptyArrangementNote('arr_001'), lines);
  assert.equal(extractDescription(note), render(lines));
  const r = readArrangementNote(note); assert.ok(r.ok); assert.deepEqual((r as { value: ArrangementParams }).value.tracks, [{ kit: 'rock', phrase: 'phrase_001' }]);
  assert.equal(descriptionState(note, 'arrangement', VAULT).kind, 'synced');
  assert.equal(writeArr(note, lines), note);
});

test('the eol of the note is kept between the list lines: a CRLF note gets CRLF there (and reads back the same)', () => {
  const crlf = emptyArrangementNote('arr_001').replace(/\n/g, '\r\n');
  const w = writeListNote(crlf, 'arr_001', 'arrangement', replayGrammar(C5_LINES, 'arrangement', ctx));
  assert.ok(w.ok); const text = (w as { text: string }).text;
  assert.ok(/1\. Play \[\[phrase_001\]\] on the \[\[rock\]\] kit\.\r\n2\. Play /.test(text), 'CRLF between the list lines'); assert.deepEqual(listOfNote(text, 'arrangement', VAULT).list, C5_LINES);
});

test('a note with no json block cannot be written (a message, nothing thrown)', () => {
  const w = writeListNote('no frontmatter here', 'x', 'arrangement', replayGrammar(C5_LINES, 'arrangement', ctx));
  assert.equal(w.ok, false);
});

// ---- migration: the first recompute splits the paragraph -----------------------------------------------------------------------------------------------------------------------------------
test('a note whose Description is a paragraph is NOT touched by reading it (opening writes nothing: the state is "synced") and is split into a list on its first recompute, with the same facets', () => {
  assert.equal(descriptionState(ARR_001, 'arrangement', VAULT).kind, 'synced', 'opening: nothing to do');
  const pr = listOfNote(ARR_001, 'arrangement', VAULT); assert.equal(pr.shape, 'paragraph');
  const next = writeArr(ARR_001, pr.list);
  assert.equal(listOfNote(next, 'arrangement', VAULT).shape, 'list');
  assert.equal(extractRecipeSection(next), extractRecipeSection(ARR_001)); assert.equal(extractPythonSection(next), extractPythonSection(ARR_001));
});

// ---- a hand edit of the list is re-read on save ----------------------------------------------------------------------------------------------------------------------------------------------
const edited = (note: string, body: string): string => note.replace(/(# Description\n\n)[\s\S]*?(\n\n# Recipe)/, `$1${body}$2`);

test('a hand edit: a deleted MIDDLE line is an "apply" of the shorter list; applying it rewrites the list (renumbered), the Recipe, Python and json in one go', () => {
  const note = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  const hand = edited(note, '1. Play [[phrase_001]] on the [[rock]] kit.\n3. Play the [[latin]] kit at 60 percent volume.');
  const st = descriptionState(hand, 'arrangement', VAULT);
  assert.equal(st.kind, 'apply');
  // the volume line is about a kit that plays nothing now: it is the unreadable one, the replay stops before it
  assert.ok(st.kind === 'apply' && st.stop !== undefined && st.stop.index === 1);
  const hand2 = edited(note, '1. Play [[phrase_001]] on the [[rock]] kit.\n2. Play [[phrase_002]] on the [[latin]] kit.');
  const st2 = descriptionState(hand2, 'arrangement', VAULT);
  assert.ok(st2.kind === 'apply' && st2.stop === undefined && st2.list?.length === 2);
  const w = applyDescriptionText(hand2, 'arr_001', 'arrangement', VAULT, extractDescription(hand2)); assert.ok(w.ok);
  const next = (w as { text: string }).text;
  assert.equal(extractDescription(next), '1. Play [[phrase_001]] on the [[rock]] kit.\n2. Play [[phrase_002]] on the [[latin]] kit.');
  assert.deepEqual((readArrangementNote(next) as { value: ArrangementParams }).value.tracks.map((t) => t.kit), ['rock', 'latin']);
  assert.equal(descriptionState(next, 'arrangement', VAULT).kind, 'synced');
  const again = applyDescriptionText(next, 'arr_001', 'arrangement', VAULT, extractDescription(next)); assert.equal(again.ok, false, 'applying it again has nothing to do');
});

test('a hand edit with an unreadable line in the middle applies the lines before it, keeps the rest as written, and says where it stopped', () => {
  const note = writeComp(emptyCompositionNote('comp_001'), C6_LINES);
  const hand = edited(note, '1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars\n3. blah blah\n4. Repeat that once more.');
  const st = descriptionState(hand, 'composition', VAULT);
  assert.ok(st.kind === 'apply' && st.stop !== undefined && st.stop.index === 2 && st.stop.reason === 'unreadable' && st.list?.length === 4);
  const w = applyDescriptionText(hand, 'comp_001', 'composition', VAULT, extractDescription(hand)); assert.ok(w.ok);
  const next = (w as { text: string }).text;
  assert.equal(extractDescription(next), '1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.\n3. blah blah\n4. Repeat that once more.', 'the line 2 canonicalized, line 3 and 4 as written');
  assert.deepEqual((readCompositionNote(next) as { value: CompositionParams }).value.sections.map((s) => s.source), ['phrases/phrase_001', 'phrases/phrase_002']);
});

test('a hand edit where NO line can be read is "rejected" as before (nothing is written; the note keeps what it shows), and so is an emptied Description', () => {
  const note = writeComp(emptyCompositionNote('comp_001'), C6_LINES);
  const st = descriptionState(edited(note, '1. blah\n2. Play [[phrase_001]].'), 'composition', VAULT);
  assert.ok(st.kind === 'rejected' && /line 1/.test(st.message), st.kind === 'rejected' ? st.message : st.kind);
  assert.equal(descriptionState(edited(note, ''), 'composition', VAULT).kind, 'rejected');
  assert.equal(descriptionState(edited(note, '1. Play [[phrase_001]] on the [[rock]] kit.'), 'composition', VAULT).kind, 'rejected', 'an arrangement line in a composition is the wrong kind');
});

test('a legacy PARAGRAPH written by hand is applied as before and comes out as a list (the migration happens on this first recompute)', () => {
  const note = writeComp(emptyCompositionNote('comp_001'), ['Play [[phrase_001]].']);
  const hand = edited(note, C6_PARAGRAPH);
  const w = applyDescriptionText(hand, 'comp_001', 'composition', VAULT, extractDescription(hand)); assert.ok(w.ok);
  assert.equal(extractDescription((w as { text: string }).text), render(C6_LINES));
});

test('applyDescriptionText applies at most `limit` lines (the loop check cut the list there) and still keeps every line in the Description', () => {
  const hand = edited(writeComp(emptyCompositionNote('comp_001'), ['Play [[phrase_001]].']), render(C6_LINES));
  const w = applyDescriptionText(hand, 'comp_001', 'composition', VAULT, extractDescription(hand), undefined, 2); assert.ok(w.ok);
  const next = (w as { text: string }).text;
  assert.equal(extractDescription(next), render(C6_LINES)); assert.equal((readCompositionNote(next) as { value: CompositionParams }).value.sections.length, 2);
  assert.equal((readCompositionNote(next) as { value: CompositionParams }).value.sections[1].repeat, undefined, 'the third line (the repeat) was not applied');
});

// ---- the other writers of the controller write a list too ---------------------------------------------------------------------------------------------------------------------------------------
test('writeFromParams (Revert, Update from Recipe, Update from Python) writes the Description as a list for an arrangement and a composition, in the sentences the paragraph had', () => {
  const p = params<ArrangementParams>(C5_PARAGRAPH);
  const w = writeFromParams(emptyArrangementNote('arr_001'), 'arr_001', 'arrangement', p); assert.ok(w.ok);
  assert.equal(extractDescription((w as { text: string }).text), render(linesOfParams(p, 'arrangement')));
  assert.equal(extractDescription((w as { text: string }).text), render(C5_LINES));
  const c = writeFromParams(emptyCompositionNote('comp_001'), 'comp_001', 'composition', params<CompositionParams>(C6_PARAGRAPH)); assert.ok(c.ok);
  assert.equal(extractDescription((c as { text: string }).text), render(C6_LINES));
});

// ---- the controls and Refresh note links ------------------------------------------------------------------------------------------------------------------------------------------------------
test('Refresh note links keeps a list Description as it is (it does not flatten it back into a paragraph); a paragraph note is refreshed as before', () => {
  const note = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  const r = refreshArrangementNoteText(note, 'arr_001'); assert.ok(r.ok); assert.equal((r as { changed: boolean }).changed, false); assert.equal((r as { text: string }).text, note);
  const c = writeComp(emptyCompositionNote('comp_001'), C6_LINES);
  const rc = refreshCompositionNoteText(c, 'comp_001'); assert.ok(rc.ok); assert.equal((rc as { text: string }).text, c);
  const para = refreshArrangementNoteText(ARR_001, 'arr_001'); assert.ok(para.ok);
  assert.equal(extractDescription((para as { text: string }).text), extractDescription(ARR_001), 'a paragraph note keeps its paragraph until its first recompute');
});

test('a control that changes a kit\'s mute rewrites the Description as the paragraph the grammar says (a legacy paragraph: still readable, split again on the next recompute)', () => {
  const note = writeArr(emptyArrangementNote('arr_001'), C5_LINES);
  const w = applySettingsPatches(note, 'arr_001', [[0, { mute: true }]]); assert.ok(w.ok);
  const text = (w as { text: string }).text;
  assert.equal(listOfNote(text, 'arrangement', VAULT).shape, 'paragraph');
  assert.deepEqual(listOfNote(text, 'arrangement', VAULT).list, [...C5_LINES, 'Mute the [[rock]] kit.']);
});

// ---- P3: phrases, bars and notes that are not music are untouched ----------------------------------------------------------------------------------------------------------------------------
test('P3: a PHRASE is written exactly as before (a paragraph Description, no list); the phrase and the empty phrase are not read as lists', () => {
  const ext: PhraseParams = { kind: 'extend', source: 'bar_007', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
  const note = newPhraseNote('phrase_003', ext, formatPhraseJson(ext));
  const next: PhraseParams = { ...ext, bars: 6 };
  const w = writeFromParams(note, 'phrase_003', 'phrase', next); const old = applyPhraseWrite(note, next, 'phrase_003', true);
  assert.ok(w.ok && old.ok); assert.equal((w as { text: string }).text, (old as { text: string }).text, 'byte for byte the old writer\'s');
  const d = applyDescriptionText(note, 'phrase_003', 'phrase', VAULT, extractDescription(note));
  assert.equal(d.ok, false, 'a synced phrase has nothing to apply');
  const edit = note.replace(/(# Description\n\n)[\s\S]*?(\n\n# Recipe)/, '$1Extend [[bar_007]] to 6 bars, repeating with fills, 20 percent slower.$2');
  const a = applyDescriptionText(edit, 'phrase_003', 'phrase', VAULT, 'Extend [[bar_007]] to 6 bars, repeating with fills, 20 percent slower.'); assert.ok(a.ok);
  assert.ok(!/^1\. /m.test(extractDescription((a as { text: string }).text)), 'a phrase\'s Description stays a sentence');
  assert.equal(descriptionState(emptyPhraseNote('phrase_001'), 'phrase', VAULT).kind, 'synced');
});

test('P3: a note that is not music (no frontmatter, no json block, a plain note) is "synced" for every family: nothing to read, nothing to write', () => {
  for (const family of ['phrase', 'arrangement', 'composition'] as const) for (const text of ['', '# Just a note\n\nHello.', '---\ntitle: x\n---\n\n# Description\n\n1. Play [[phrase_001]].\n']) assert.equal(descriptionState(text, family, VAULT).kind, 'synced');
});
