// 2026-11-19-0970 (THE LIST MODEL, stage 1: compositions and arrangements; checklists/music_tabs_chat_ui_design.md section 11) - the PURE core of the list: parseList / render / append (the conflict rule) / removeAt / replay (every line through the kind's
// EXISTING grammar, local only) / the undo stack. No Obsidian, no vault, no DOM: the tests import the core only. What is pinned:
//   - the round trip of the numbered list, and the legacy paragraph split (lossless when every sentence is readable, one legacy line otherwise)
//   - the conflict rule: an arrangement line REPLACES an earlier line about the same kit or the same volume target, in place; a composition never conflicts; what was replaced is returned
//   - replay EQUALS what today's single sentence produced (a golden test over C5 and C6 of the 1206 checklist and over arr_001 / comp_001): the same params, Recipe, Python and json
//   - an unreadable line stops the replay BEFORE it (earlier lines still apply) and says where, in plain words; the loop check (0910) runs inside the replay of a composition
//   - a line that draws random choices keeps its seed in its canonical text, so a replay twice gives the same result
//   - the undo stack: undo, redo, a new sentence clears redo, undo after a hand edit removes the last item, redo is only offered while it still fits
//   - property tests for the parser (a corruption fuzz and a never-throws fuzz: operating card 24)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UNDO_CAP, append, createUndoStack, linesOfParams, parseList, planAppend, removeAt, render, replay, replayGrammar, stopNotice, subjectOf, type ListKind, type ReplayCtx,
} from './sentence-list-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { arrangementPython, arrangementRecipeSteps, formatArrangementJson, type ArrangementParams } from './arrangement-core.ts';
import { compositionPython, compositionRecipeSteps, formatCompositionJson, type CompositionParams } from './composition-core.ts';
import { compositionLoopRefusal } from './sentence-plan-families-core.ts';
import { ARR_001, C5_LINES, C5_PARAGRAPH, C6_LINES, C6_PARAGRAPH, VAULT } from './test-support/sentence-list-fixtures.ts';
import { extractDescription } from './v2-note-core.ts';

const ctx: ReplayCtx = { vault: VAULT };
const arr = (lines: string[]) => replayGrammar(lines, 'arrangement', ctx);
const comp = (lines: string[]) => replayGrammar(lines, 'composition', ctx);

// ---- the round trip ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('render writes a numbered Markdown list, one sentence per item, and an empty list writes nothing', () => {
  assert.equal(render(['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.']), '1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.');
  assert.equal(render([]), '');
  assert.equal(render(['a'], '\r\n'), '1. a');
  assert.equal(render(['a', 'b'], '\r\n'), '1. a\r\n2. b');
});

test('parseList(render(list)) gives the list back, for arrangements and compositions, and the shape is "list"', () => {
  for (const [kind, lines] of [['arrangement', C5_LINES], ['composition', C6_LINES], ['composition', ['Play [[phrase_001]].']], ['arrangement', []]] as Array<[ListKind, string[]]>) {
    const back = parseList(render(lines), kind, VAULT);
    assert.deepEqual(back.list, lines);
    assert.equal(back.shape, lines.length === 0 ? 'empty' : 'list');
  }
});

test('parseList reads the shapes a person types: "1)" numbers, wrong numbers, a wrapped item, two sentences in one item, blank lines and CRLF', () => {
  assert.deepEqual(parseList('1) Play [[phrase_001]].\n\n7. Then play [[phrase_002]]\n   for 4 bars.', 'composition', VAULT).list, ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.']);
  assert.deepEqual(parseList('1. Play [[phrase_001]]. Then play [[phrase_002]].\r\n2. Repeat that once more.\r\n', 'composition', VAULT).list, ['Play [[phrase_001]].', 'Then play [[phrase_002]].', 'Repeat that once more.']);
  assert.deepEqual(parseList('', 'composition', VAULT), { list: [], shape: 'empty' });
  assert.deepEqual(parseList('  \n \n', 'arrangement', VAULT), { list: [], shape: 'empty' });
});

// ---- the legacy paragraph -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the legacy paragraph is split into its sentences, same sentences and same order, when every sentence is readable (C5 and C6; the arrangement\'s "Together." is the end of the description, not a sentence of the list)', () => {
  const c5 = parseList(C5_PARAGRAPH, 'arrangement', VAULT);
  assert.equal(c5.shape, 'paragraph'); assert.deepEqual(c5.list, C5_LINES);
  const c6 = parseList(C6_PARAGRAPH, 'composition', VAULT);
  assert.equal(c6.shape, 'paragraph'); assert.deepEqual(c6.list, C6_LINES);
  assert.equal(`${c5.list.join(' ')} Together.`, C5_PARAGRAPH, 'lossless: joined again (plus the closing "Together.") it is the paragraph');
  assert.equal(c6.list.join(' '), C6_PARAGRAPH);
  assert.deepEqual(parseList(extractDescription(ARR_001), 'arrangement', VAULT).list, ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 58 percent volume.']);
});

test('a paragraph with a sentence the grammar cannot read stays ONE legacy line (nothing is split, nothing is lost)', () => {
  const para = 'Play [[phrase_001]]. Then play [[nobody_here]] for 4 bars.';
  const r = parseList(para, 'composition', VAULT);
  assert.equal(r.shape, 'legacy'); assert.deepEqual(r.list, [para]);
  const multi = parseList('Play [[phrase_001]].\nThen play [[nobody_here]].', 'composition', VAULT);
  assert.equal(multi.shape, 'legacy'); assert.deepEqual(multi.list, ['Play [[phrase_001]]. Then play [[nobody_here]].'], 'line breaks of a legacy paragraph become single spaces');
});

// ---- the conflict rule --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('subjectOf: an arrangement line is about a kit (its phrase), a kit\'s volume, a kit\'s mute or the solo; a composition line has no subject', () => {
  assert.equal(subjectOf('Play [[phrase_001]] on the [[rock]] kit.', 'arrangement'), 'play:rock');
  assert.equal(subjectOf('play phrase_002 on latin kit', 'arrangement'), 'play:latin');
  assert.equal(subjectOf('Play the [[rock]] kit at 70 percent volume.', 'arrangement'), 'volume:rock');
  assert.equal(subjectOf('Mute the [[latin]] kit.', 'arrangement'), 'mute:latin');
  assert.equal(subjectOf('Only the [[rock]] kit plays.', 'arrangement'), 'only');
  assert.equal(subjectOf('Something else entirely.', 'arrangement'), null);
  for (const s of ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.']) assert.equal(subjectOf(s, 'composition'), null);
});

test('append: a new arrangement line is added at the end and replaces nothing', () => {
  const r = append(C5_LINES, 'Mute the [[latin]] kit.', 'arrangement');
  assert.deepEqual(r.list, [...C5_LINES, 'Mute the [[latin]] kit.']); assert.equal(r.replaced, null); assert.equal(r.at, 3);
});

test('append, the same KIT twice: the later "Play ... on the K kit." REPLACES the earlier line, in place (the lines that came after it still follow), and says what it replaced', () => {
  const before = [...C5_LINES, 'Mute the [[rock]] kit.'];
  const r = append(before, 'Play [[phrase_003]] on the [[rock]] kit.', 'arrangement');
  assert.deepEqual(r.list, ['Play [[phrase_003]] on the [[rock]] kit.', C5_LINES[1], C5_LINES[2], 'Mute the [[rock]] kit.']);
  assert.deepEqual(r.replaced, { index: 0, sentence: C5_LINES[0] }); assert.equal(r.at, 0);
  assert.deepEqual(before, [...C5_LINES, 'Mute the [[rock]] kit.'], 'the list it was given is not changed');
  assert.ok(arr(r.list).stop === null, 'and the result is still a list the grammar reads');
});

test('append, the same VOLUME target twice: the later volume replaces the earlier one', () => {
  const r = append(C5_LINES, 'Play the [[latin]] kit at 30 percent volume.', 'arrangement');
  assert.deepEqual(r.list, [C5_LINES[0], C5_LINES[1], 'Play the [[latin]] kit at 30 percent volume.']);
  assert.deepEqual(r.replaced, { index: 2, sentence: C5_LINES[2] });
  const other = append(C5_LINES, 'Play the [[rock]] kit at 30 percent volume.', 'arrangement');
  assert.equal(other.replaced, null, 'a volume for ANOTHER kit is not a conflict'); assert.equal(other.list.length, 4);
});

test('append: a line about the same kit but not the same thing is no conflict (a phrase on the kit, its volume and its mute are three different subjects); a mute twice and a second solo line are', () => {
  let l: string[] = ['Play [[phrase_001]] on the [[rock]] kit.'];
  for (const s of ['Play the [[rock]] kit at 70 percent volume.', 'Mute the [[rock]] kit.']) { const r = append(l, s, 'arrangement'); assert.equal(r.replaced, null, s); l = r.list; }
  assert.equal(l.length, 3);
  assert.deepEqual(append(l, 'Mute the [[rock]] kit.', 'arrangement').replaced, { index: 2, sentence: 'Mute the [[rock]] kit.' });
  const solo = append([...l, 'Only the [[rock]] kit plays.'], 'Only the [[rock]] and [[latin]] kits play.', 'arrangement');
  assert.deepEqual(solo.replaced, { index: 3, sentence: 'Only the [[rock]] kit plays.' });
});

test('append, compositions never conflict: the same note twice, the same length, a second "Repeat that" are all just more lines', () => {
  let l: string[] = [];
  for (const s of ['Play [[phrase_001]].', 'Then play [[phrase_001]].', 'Then play [[phrase_001]] for 4 bars.', 'Repeat that once more.', 'Repeat that once more.']) { const r = append(l, s, 'composition'); assert.equal(r.replaced, null, s); assert.equal(r.at, l.length); l = r.list; }
  assert.equal(l.length, 5);
});

test('removeAt: a middle line, the first, the last; an index outside the list changes nothing; the list it was given is not changed', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(removeAt(l, 1), ['a', 'c']); assert.deepEqual(removeAt(l, 0), ['b', 'c']); assert.deepEqual(removeAt(l, 2), ['a', 'b']);
  assert.deepEqual(removeAt(l, 3), l); assert.deepEqual(removeAt(l, -1), l); assert.deepEqual(removeAt(l, 1.5), l); assert.deepEqual(l, ['a', 'b', 'c']);
});

// ---- replay equals what today's single sentence produced (the golden test) ---------------------------------------------------------------------------------------------------------------------------
test('GOLDEN, C5: the replay of the list is the note today\'s single sentence made: the same params, Recipe, Python and json cache', () => {
  const today = parse(C5_PARAGRAPH, VAULT); assert.ok(today.ok); const p = (today as { params: ArrangementParams }).params;
  const r = arr(parseList(C5_PARAGRAPH, 'arrangement', VAULT).list);
  assert.deepEqual(r.params, p); assert.deepEqual(r.recipe, arrangementRecipeSteps(p)); assert.equal(r.python, arrangementPython(p)); assert.equal(r.json, formatArrangementJson(p));
  assert.deepEqual(r.recipe, ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 60 percent volume.', 'Together.'], 'the Recipe of the 1206 checklist, line for line');
  assert.equal(r.applied, 3); assert.equal(r.stop, null); assert.deepEqual(r.list, C5_LINES);
});

test('GOLDEN, C6: the replay of the list is the composition today\'s single sentence made', () => {
  const today = parse(C6_PARAGRAPH, VAULT); assert.ok(today.ok); const p = (today as { params: CompositionParams }).params;
  const r = comp(parseList(C6_PARAGRAPH, 'composition', VAULT).list);
  assert.deepEqual(r.params, p); assert.deepEqual(r.recipe, compositionRecipeSteps(p)); assert.equal(r.python, compositionPython(p)); assert.equal(r.json, formatCompositionJson(p));
  assert.deepEqual(r.params, { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_002', length: 4, repeat: 1 }] });
  assert.equal(r.applied, 3); assert.deepEqual(r.list, C6_LINES);
});

test('GOLDEN, arr_001 of music-playground (copied): its Description paragraph replays to the very params, Recipe, Python and json cache the note carries', () => {
  const lines = parseList(extractDescription(ARR_001), 'arrangement', VAULT).list; const r = arr(lines);
  assert.deepEqual(r.params, { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 58 }] });
  const recipe = /# Recipe\n\n([\s\S]*?)\n\n# Python/.exec(ARR_001)![1]; assert.equal(r.recipe.join('\n'), recipe);
  const py = /```python\n([\s\S]*?)\n```/.exec(ARR_001)![1]; assert.equal(r.python, py);
  const json = /```json\n([\s\S]*?)\n```/.exec(ARR_001)![1]; assert.equal(r.json, json);
});

test('the replay canonicalizes a line the grammar accepts in another wording (every line the grammar accepts is canonical once replayed), and replaying the canonical list changes nothing (idempotent)', () => {
  const r = arr(['play phrase_001 on rock kit', 'PLAY phrase_002 ON THE latin KIT.', 'play the latin kit at 60% volume']);
  assert.deepEqual(r.list, C5_LINES); assert.equal(r.stop, null);
  assert.deepEqual(arr(r.list).list, r.list);
  const c = comp(['Play [[phrase_001]].', 'For 4 bars play [[phrase_002]].', 'repeat that once more']);
  assert.deepEqual(c.list, ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.']);
});

test('a composition\'s first line is "Play", the others "Then play", whatever the lines say: deleting the first line by hand leaves a list that still reads', () => {
  const r = comp(['Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.']);
  assert.equal(r.stop, null); assert.deepEqual(r.list, ['Play [[phrase_002]] for 4 bars.', 'Repeat that once more.']);
  const typed = comp(['Play [[phrase_001]].', 'Play [[phrase_002]].']);
  assert.deepEqual(typed.list, ['Play [[phrase_001]].', 'Then play [[phrase_002]].'], 'a second "Play" is the next section');
});

test('an empty list replays to nothing: no params, no Recipe, no Python', () => {
  const r = arr([]);
  assert.equal(r.params, null); assert.equal(r.applied, 0); assert.equal(r.stop, null); assert.deepEqual(r.recipe, []); assert.equal(r.python, '');
});

// ---- the unreadable line ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('an unreadable line STOPS the replay before it: the lines before it still apply, the line is kept as written, the lines after it do not apply', () => {
  const list = ['Play [[phrase_001]].', 'Then play [[nobody_here]] for 4 bars.', 'Then play [[phrase_002]].'];
  const r = comp(list);
  assert.equal(r.applied, 1); assert.ok(r.stop !== null && r.stop.index === 1 && r.stop.reason === 'unreadable' && r.stop.line === 2);
  assert.deepEqual(r.params, { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }, 'the note shows line 1 only');
  assert.deepEqual(r.list, list, 'the unreadable line and the one after it are kept exactly as written');
  assert.match(r.stop!.message, /nobody_here/, 'the grammar\'s own words say why');
  assert.ok(!/\bred\b/i.test(stopNotice(r.stop!, r.applied)));
});

test('stopNotice says it in plain words: "Line 3 is not a sentence I can read; the note shows lines 1 and 2." (with the grammar\'s reason after it)', () => {
  const r = comp(['Play [[phrase_001]].', 'Then play [[phrase_002]].', 'Then play [[nobody_here]].']);
  assert.ok(stopNotice(r.stop!, r.applied).startsWith('Line 3 is not a sentence I can read; the note shows lines 1 and 2.'));
  assert.ok(stopNotice(comp(['Play [[phrase_001]].', 'blah']).stop!, 1).startsWith('Line 2 is not a sentence I can read; the note shows line 1.'));
  assert.ok(stopNotice(comp(['blah']).stop!, 0).startsWith('Line 1 is not a sentence I can read; the note shows nothing yet.'));
  const four = comp(['Play [[phrase_001]].', 'Then play [[phrase_002]].', 'Then play [[phrase_001]].', 'blah']);
  assert.ok(stopNotice(four.stop!, four.applied).startsWith('Line 4 is not a sentence I can read; the note shows lines 1 to 3.'));
});

test('a line of the wrong kind is unreadable HERE: a composition line in an arrangement and an arrangement line in a composition', () => {
  const a = arr(['Play [[phrase_001]] on the [[rock]] kit.', 'Then play [[phrase_002]].']); assert.equal(a.applied, 1); assert.equal(a.stop?.index, 1);
  const c = comp(['Play [[phrase_001]] on the [[rock]] kit.']); assert.equal(c.applied, 0); assert.equal(c.stop?.index, 0); assert.match(c.stop!.message, /composition/);
});

test('a mute of a kit that plays nothing yet is unreadable until the line that makes it play (the order of the list matters, and the grammar says so)', () => {
  const r = arr(['Mute the [[rock]] kit.', 'Play [[phrase_001]] on the [[rock]] kit.']);
  assert.equal(r.applied, 0); assert.equal(r.stop?.index, 0);
  assert.equal(arr(['Play [[phrase_001]] on the [[rock]] kit.', 'Mute the [[rock]] kit.']).stop, null);
});

// ---- the loop check inside the replay -----------------------------------------------------------------------------------------------------------------------------------------------------------
test('the loop check runs INSIDE the replay of a composition: a line that plays a composition that plays this one stops the replay before it, with the 0910 words', async () => {
  const sections: Record<string, Array<{ source: string }>> = { 'compositions/song_2': [{ source: 'compositions/song_1' }], 'compositions/song_3': [{ source: 'phrases/phrase_001' }] };
  const reads: string[] = [];
  const lctx: ReplayCtx = { vault: VAULT, self: 'compositions/song_1', readSections: async (id) => { reads.push(id); return sections[id] ?? null; } };
  const r = await replay(['Play [[phrase_003]].', 'Then play [[song_2]].', 'Then play [[phrase_002]].'], 'composition', lctx);
  const words = await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }, { source: 'compositions/song_2' }] }, async (id) => sections[id] ?? null);
  assert.equal(r.applied, 1); assert.ok(r.stop?.reason === 'loop' && r.stop.index === 1);
  assert.equal(r.stop!.message, words); assert.equal(r.stop!.message, 'The composition song_2 loops back to this composition: song_1 → song_2 → song_1.');
  assert.deepEqual(r.params, { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] });
  assert.ok(reads.includes('compositions/song_2'), 'the vault was asked for song_2\'s sections');
  assert.ok(stopNotice(r.stop!, r.applied).includes('loops back to this composition'));
  const fine = await replay(['Play [[phrase_003]].', 'Then play [[song_3]].'], 'composition', lctx);
  assert.equal(fine.applied, 2); assert.equal(fine.stop, null);
});

test('a list that plays itself is refused at the line that does (the self loop keeps its own words)', async () => {
  const lctx: ReplayCtx = { vault: VAULT, self: 'compositions/song_1', readSections: async () => null };
  const r = await replay(['Play [[song_1]].'], 'composition', lctx);
  assert.equal(r.applied, 0); assert.equal(r.stop?.message, 'The composition "song_1" cannot play itself; that would loop.');
});

test('no loop check for what cannot loop: an arrangement, a composition of phrases and arrangements, and a replay without a vault reader never read a note', async () => {
  let reads = 0; const lctx: ReplayCtx = { vault: VAULT, self: 'compositions/song_1', readSections: async () => { reads++; return null; } };
  await replay(['Play [[phrase_003]].', 'Then play [[arr_001]].'], 'composition', lctx);
  await replay(C5_LINES, 'arrangement', lctx);
  await replay(['Play [[song_2]].'], 'composition', { vault: VAULT });
  assert.equal(reads, 0);
});

// ---- a seed is part of the sentence ---------------------------------------------------------------------------------------------------------------------------------------------------------
test('a line that draws random choices keeps its SEED in its canonical text, and replaying it twice gives the same result (the grammar of phrases is the stage-2 pipeline; its lines are replayed by the same core)', () => {
  const line = 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in seeded order, seed 3.';
  const a = replayGrammar([line], 'phrase', ctx), b = replayGrammar([line], 'phrase', ctx);
  assert.equal(a.stop, null); assert.deepEqual(a.list, [line], 'the seed is in the canonical sentence');
  assert.deepEqual(a.params, b.params); assert.equal(a.python, b.python); assert.equal(a.json, b.json);
  assert.equal((a.params as { seed: number }).seed, 3);
  const other = replayGrammar([line.replace('seed 3', 'seed 4')], 'phrase', ctx);
  assert.notDeepEqual(other.params, a.params, 'a different seed is a different sentence and a different result');
  const mix = 'Mix [[bar_001]] and [[bar_003]], 70 percent [[bar_001]], as a path, in seeded order, seed 5.';
  const m = replayGrammar([mix], 'phrase', ctx); assert.equal(m.stop, null); assert.deepEqual(m.list, [mix], 'a seeded mix keeps its seed too');
  assert.deepEqual(replayGrammar(m.list, 'phrase', ctx).params, m.params, 'replaying the canonical list is the same replay');
  const alone = replayGrammar(['Take [[phrase_001]].'], 'phrase', ctx);
  assert.equal(alone.applied, 1, 'a phrase\'s "Take" line alone is a copy of its source');       // 2026-11-19-0980 (deliberate): it said nothing yet (stage 1: "what a phrase\'s first line must be" was stage 2\'s question); `Take [[x]].` alone is a copy now
});

// ---- planAppend: what a typed sentence becomes ------------------------------------------------------------------------------------------------------------------------------------------------------
test('planAppend: a typed sentence the grammar reads becomes ONE canonical line appended; "Together." is not a line', async () => {
  const p = await planAppend(C5_LINES.slice(0, 2), 'arrangement', ['play the latin kit at 60 percent volume', 'Together.'], ctx);
  assert.ok(p.ok); if (p.ok) { assert.deepEqual(p.added, [C5_LINES[2]]); assert.deepEqual(p.list, C5_LINES); assert.deepEqual(p.replaced, []); assert.equal(p.unchanged, false); assert.equal(p.replay.applied, 3); }
});

test('planAppend: the first sentence of an empty list makes a list of one', async () => {
  const p = await planAppend([], 'composition', ['then play phrase_001'], ctx);
  assert.ok(p.ok); if (p.ok) assert.deepEqual(p.list, ['Play [[phrase_001]].']);
});

test('planAppend: a conflicting sentence says what it replaces; the SAME sentence again changes nothing', async () => {
  const p = await planAppend(C5_LINES, 'arrangement', ['Play the [[latin]] kit at 30 percent volume.'], ctx);
  assert.ok(p.ok); if (p.ok) { assert.deepEqual(p.replaced, [{ index: 2, sentence: C5_LINES[2] }]); assert.deepEqual(p.list, [C5_LINES[0], C5_LINES[1], 'Play the [[latin]] kit at 30 percent volume.']); assert.equal(p.unchanged, false); }
  const same = await planAppend(C5_LINES, 'arrangement', [C5_LINES[2]], ctx);
  assert.ok(same.ok); if (same.ok) { assert.equal(same.unchanged, true); assert.deepEqual(same.list, C5_LINES); assert.deepEqual(same.replaced, [], 'replacing a sentence with itself replaces nothing'); }
});

test('planAppend: a sentence of several parts appends each one (and each is checked against the line before it)', async () => {
  const p = await planAppend([], 'arrangement', ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Together.'], ctx);
  assert.ok(p.ok); if (p.ok) assert.deepEqual(p.list, C5_LINES.slice(0, 2));
});

test('planAppend: a sentence the grammar cannot read is "unreadable", with the line and column IN THE TYPED TEXT; nothing is planned', async () => {
  const p = await planAppend(C6_LINES, 'composition', ['Then play [[phrase_001]].', 'Then play [[nobody_here]].'], ctx);
  assert.ok(!p.ok); if (!p.ok) { assert.equal(p.reason, 'unreadable'); assert.equal(p.line, 2); assert.ok(p.column >= 1); assert.match(p.message, /nobody_here/); }
  const first = await planAppend([], 'arrangement', ['Mute the [[rock]] kit.'], ctx);
  assert.ok(!first.ok); if (!first.ok) { assert.equal(first.reason, 'unreadable'); assert.equal(first.line, 1); }
  const empty = await planAppend(C5_LINES, 'arrangement', ['Together.', '  '], ctx);
  assert.ok(!empty.ok); if (!empty.ok) assert.equal(empty.reason, 'empty');
});

test('planAppend refuses to add to a list that has an unreadable line: it is "blocked", and the message names the line', async () => {
  const p = await planAppend(['Play [[phrase_001]].', 'Then play [[nobody_here]].'], 'composition', ['Then play [[phrase_002]].'], ctx);
  assert.ok(!p.ok); if (!p.ok) { assert.equal(p.reason, 'blocked'); assert.ok(p.message.startsWith('Line 2 is not a sentence I can read; the note shows line 1.')); }
});

test('planAppend asks the loop check for a composition: a typed sentence that loops is refused with the 0910 words and nothing is planned', async () => {
  const lctx: ReplayCtx = { vault: VAULT, self: 'compositions/song_1', readSections: async (id) => (id === 'compositions/song_2' ? [{ source: 'compositions/song_1' }] : null) };
  const p = await planAppend(['Play [[phrase_003]].'], 'composition', ['Play [[song_2]].'], lctx);
  assert.ok(!p.ok); if (!p.ok) { assert.equal(p.reason, 'loop'); assert.equal(p.message, 'The composition song_2 loops back to this composition: song_1 → song_2 → song_1.'); }
});

test('linesOfParams: the canonical sentences of params, one per line ("Together." is not one): what the sentence service\'s answer becomes', () => {
  const a = parse(C5_PARAGRAPH, VAULT); assert.ok(a.ok); assert.deepEqual(linesOfParams((a as { params: ArrangementParams }).params, 'arrangement'), C5_LINES);
  const c = parse(C6_PARAGRAPH, VAULT); assert.ok(c.ok); assert.deepEqual(linesOfParams((c as { params: CompositionParams }).params, 'composition'), C6_LINES);
});

// ---- the undo stack -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const entry = (before: string[], after: string[], added: string[], replaced: Array<{ index: number; sentence: string }> = []) => ({ before, after, added, replaced });

test('undo removes what the last apply added and gives the list before it; redo puts it back; a new sentence clears redo', () => {
  const s = createUndoStack();
  const l1 = ['a'], l2 = ['a', 'b'];
  s.push(entry([], l1, ['a'])); s.push(entry(l1, l2, ['b']));
  assert.equal(s.canUndo(l2), true); assert.equal(s.canRedo(l2), false);
  const u = s.undo(l2)!; assert.deepEqual(u.list, l1); assert.deepEqual(u.removed, ['b']); assert.deepEqual(u.restored, []);
  assert.equal(s.canRedo(l1), true);
  const r = s.redo(l1)!; assert.deepEqual(r.list, l2); assert.deepEqual(r.added, ['b']);
  s.undo(l2); s.push(entry(l1, ['a', 'c'], ['c']));
  assert.equal(s.canRedo(['a', 'c']), false, 'a new sentence clears redo');
  assert.equal(s.redo(['a', 'c']), null);
});

test('undo of a REPLACE puts the replaced sentence back where it was; redo replaces again', () => {
  const s = createUndoStack(); const before = ['x', 'old', 'z'], after = ['x', 'new', 'z'];
  s.push(entry(before, after, ['new'], [{ index: 1, sentence: 'old' }]));
  const u = s.undo(after)!; assert.deepEqual(u.list, before); assert.deepEqual(u.removed, ['new']); assert.deepEqual(u.restored, ['old']);
  assert.deepEqual(s.redo(before)!.list, after);
});

test('undo with nothing to undo is null (the menu item is disabled); an empty list has nothing to undo even with a history', () => {
  const s = createUndoStack();
  assert.equal(s.canUndo([]), false); assert.equal(s.undo([]), null);
  s.push(entry([], ['a'], ['a'])); assert.equal(s.canUndo([]), false); assert.equal(s.undo([]), null);
});

test('undo after a HAND EDIT removes the last item of the list as it is now (the history of the apply no longer fits), and redo is only offered while the list is what the undo left', () => {
  const s = createUndoStack(); s.push(entry([], ['a', 'b'], ['a', 'b']));
  const edited = ['a', 'b', 'c'];                                              // the person typed a third line in the note
  assert.equal(s.canUndo(edited), true);
  const u = s.undo(edited)!; assert.deepEqual(u.list, ['a', 'b']); assert.deepEqual(u.removed, ['c']);
  assert.equal(s.canRedo(['a', 'b']), true); assert.deepEqual(s.redo(['a', 'b'])!.list, edited);
  s.undo(edited);
  assert.equal(s.canRedo(['a']), false, 'a hand edit after the undo: redo does not fit any more'); assert.equal(s.redo(['a']), null);
});

test('a deleted MIDDLE line: undo still removes the last item, never a line the person deleted', () => {
  const s = createUndoStack(); s.push(entry(['a', 'b'], ['a', 'b', 'c'], ['c']));
  const afterHand = ['a', 'c'];
  const u = s.undo(afterHand)!; assert.deepEqual(u.list, ['a']); assert.deepEqual(u.removed, ['c']);
});

test('the history is capped (a long session does not grow without end) and a cleared stack has nothing', () => {
  const s = createUndoStack(); let l: string[] = [];
  for (let i = 0; i < 300; i++) { const next = [...l, `s${i}`]; s.push(entry(l, next, [`s${i}`])); l = next; }
  let n = 0; for (let cur = l; s.canUndo(cur) && n < 1000; n++) { const u = s.undo(cur)!; cur = u.list; }
  assert.ok(n >= 300 - 1, 'undo still removes lines one at a time down to the empty list (the history is gone but the list is not)');
  s.clear(); assert.equal(s.canRedo(l), false);
});

// ---- property tests (operating card 24): a corruption fuzz and a never-throws fuzz ---------------------------------------------------------------------------------------------------------
const LISTS: Array<[ListKind, string[]]> = [['arrangement', [...C5_LINES, 'Mute the [[latin]] kit.', 'Only the [[rock]] kit plays.']], ['composition', ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that 2 more times.', 'Then play [[arr_001]].']]];

test('FUZZ, corruption: damage ANY one line of a good list (a name that is not in the vault, the verb gone, the line cut in half, a stray word) and the replay stops AT that line, applies every line before it and none after it', () => {
  for (const [kind, lines] of LISTS) {
    assert.equal(replayGrammar(lines, kind, ctx).stop, null, 'the list itself is good');
    lines.forEach((line, i) => {
      const damages = [
        line.replace(/\[\[[^\]]+\]\]/, '[[zz_no_such_note]]'),
        line.replace(/^\S+(\s+\S+)?\s*/, ''),
        line.slice(0, Math.floor(line.length / 2)),
        `${line.replace(/\.$/, '')} banana split.`,
        line.replace(/[A-Za-z]+/, 'Zork'),
      ];
      for (const bad of damages) {
        if (bad === line) continue;
        const damaged = lines.map((l, j) => (j === i ? bad : l));
        const r = replayGrammar(damaged, kind, ctx);
        assert.ok(r.stop !== null && r.stop.index === i, `${kind} line ${i + 1} damaged as ${JSON.stringify(bad)}: stopped at ${r.stop?.index}`);
        assert.equal(r.applied, i); assert.deepEqual(r.list.slice(i), damaged.slice(i), 'the damaged line and the ones after it are kept as written');
      }
    });
  }
});

test('FUZZ, never throws: any cut, repeated, shuffled or garbled list replays (and plans, and parses) without throwing, and always answers a prefix', async () => {
  const garbage = ['', ' ', '.', '..', '[[', ']]', '[[]]', 'Play', 'Then play', 'Repeat that', 'Together.', '1.', '\u0000', 'Play [[phrase_001]] on', '\n', '"quoted"', 'Mute', 'Only', 'x'.repeat(5000), '日本語。'];
  let seed = 7; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (const [kind, lines] of LISTS) {
    const pool = [...lines, ...garbage];
    for (let t = 0; t < 120; t++) {
      const n = rnd(7); const picked = Array.from({ length: n }, () => pool[rnd(pool.length)]);
      const cut = picked.map((l) => (rnd(4) === 0 ? l.slice(0, rnd(l.length + 1)) : l));
      const r = replayGrammar(cut, kind, ctx);
      assert.ok(r.applied >= 0 && r.applied <= cut.length); assert.equal(r.list.length, cut.length);
      assert.ok(r.stop === null ? r.applied === cut.length : r.stop.index === r.applied);
      await replay(cut, kind, { ...ctx, self: 'compositions/song_1', readSections: async () => null });
      await planAppend(cut, kind, [pool[rnd(pool.length)]], ctx);
      parseList(cut.join(rnd(2) === 0 ? ' ' : '\n'), kind, VAULT); parseList(render(cut), kind, VAULT);
      let l = cut; for (let i = 0; i < 3; i++) l = removeAt(append(l, pool[rnd(pool.length)], kind).list, rnd(l.length + 1));
    }
  }
});

test('FUZZ, round trip: for every list of good lines, render then parseList gives it back and replaying it twice is the same', () => {
  for (const [kind, lines] of LISTS) for (let n = 0; n <= lines.length; n++) {
    const l = lines.slice(0, n);
    assert.deepEqual(parseList(render(l), kind, VAULT).list, l);
    const a = replayGrammar(l, kind, ctx), b = replayGrammar(a.list, kind, ctx);
    assert.deepEqual(a, b, 'the replay of the canonical list is the replay of the list');
  }
});

// ---- the edges (what a mutation pass would poke at) ----------------------------------------------------------------------------------------------------------------------------------------------------
test('subjectOf reads names with or without brackets, in any case, and a bare "Together." or an unknown sentence has no subject', () => {
  assert.equal(subjectOf('MUTE the [[Latin]] kit.', 'arrangement'), 'mute:latin');
  assert.equal(subjectOf('play the Latin kit at 20% volume', 'arrangement'), 'volume:latin');
  assert.equal(subjectOf('Play [[my groove]] on the [[Rock]] kit.', 'arrangement'), 'play:rock');
  assert.equal(subjectOf('  Only the [[rock]] kit plays.', 'arrangement'), 'only');
  assert.equal(subjectOf('Together.', 'arrangement'), null); assert.equal(subjectOf('', 'arrangement'), null);
  assert.equal(subjectOf('Play [[phrase_001]] on the [[rock]] kit.', 'phrase'), null, 'only an arrangement has the conflict rule in stage 1');
});

test('append replaces the LAST earlier line about the subject when a hand edit left two', () => {
  const l = ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play [[phrase_003]] on the [[rock]] kit.'];
  const r = append(l, 'Play [[phrase_002]] on the [[rock]] kit.', 'arrangement');
  assert.deepEqual(r.replaced, { index: 2, sentence: l[2] }); assert.equal(r.at, 2); assert.deepEqual(r.list.slice(0, 2), l.slice(0, 2));
});

test('replayGrammar with maxApplied applies at most that many lines and keeps the rest as written (the loop check of the caller cut the list there); a negative or fractional cap is clamped', () => {
  const two = replayGrammar(C6_LINES, 'composition', { vault: VAULT, maxApplied: 2 });
  assert.equal(two.applied, 2); assert.equal(two.stop, null); assert.deepEqual(two.list, C6_LINES);
  assert.deepEqual(two.params, { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_002', length: 4 }] });
  assert.equal(replayGrammar(C6_LINES, 'composition', { vault: VAULT, maxApplied: 0 }).params, null);
  assert.equal(replayGrammar(C6_LINES, 'composition', { vault: VAULT, maxApplied: -3 }).applied, 0);
  assert.equal(replayGrammar(C6_LINES, 'composition', { vault: VAULT, maxApplied: 1.9 }).applied, 1);
  assert.equal(replayGrammar(C6_LINES, 'composition', { vault: VAULT, maxApplied: 99 }).applied, 3);
});

test('a line that is a whole legacy paragraph (it parses as a whole, its closing "Together." included) replays as before, as one line', () => {
  const r = replayGrammar([C5_PARAGRAPH], 'arrangement', ctx);
  assert.equal(r.stop, null); assert.equal(r.applied, 1); assert.deepEqual(r.list, [C5_PARAGRAPH]);
  assert.deepEqual(r.params, (parse(C5_PARAGRAPH, VAULT) as { params: ArrangementParams }).params);
});

test('stopNotice says a LOOP in its own words: the line, the check\'s sentence, then what the note shows', () => {
  const stop = { index: 1, reason: 'loop' as const, message: 'The composition song_2 loops back to this composition: song_1 → song_2 → song_1.', line: 2, column: 1 };
  assert.equal(stopNotice(stop, 1), 'Line 2 is not played: The composition song_2 loops back to this composition: song_1 → song_2 → song_1. The note shows line 1.');
  assert.equal(stopNotice({ ...stop, index: 0, line: 1 }, 0), 'Line 1 is not played: The composition song_2 loops back to this composition: song_1 → song_2 → song_1. The note shows nothing yet.');
  assert.equal(stopNotice({ index: 0, reason: 'unreadable', message: '', line: 1, column: 1 }, 0), 'Line 1 is not a sentence I can read; the note shows nothing yet.', 'no reason, no trailing space');
});

test('a loop stops the replay at the line that makes it, and the "Repeat that" line after a looping section is not applied either', async () => {
  const lctx: ReplayCtx = { vault: VAULT, self: 'compositions/song_1', readSections: async (id) => (id === 'compositions/song_2' ? [{ source: 'compositions/song_1' }] : null) };
  const r = await replay(['Play [[song_2]].', 'Repeat that once more.'], 'composition', lctx);
  assert.equal(r.applied, 0); assert.equal(r.stop?.index, 0); assert.equal(r.params, null); assert.deepEqual(r.list, ['Play [[song_2]].', 'Repeat that once more.']);
  const fine = await replay(['Play [[phrase_001]].', 'Repeat that once more.'], 'composition', lctx);
  assert.equal(fine.stop, null, 'a repeat does not start a loop');
});

test('the undo history keeps UNDO_CAP entries: older ones are gone, undo then removes the last item of the list as it is', () => {
  const s = createUndoStack(); let l: string[] = [];
  for (let i = 0; i < UNDO_CAP + 20; i++) { const next = [...l.slice(0, 1), `s${i}`]; s.push({ before: l, after: next, added: [`s${i}`], replaced: l.length > 0 ? [{ index: 1, sentence: `s${i - 1}` }] : [] }); l = next; }
  let restored = 0, plain = 0;
  for (let i = 0; i < UNDO_CAP + 10; i++) { const u = s.undo(l)!; if (u.restored.length > 0) restored++; else plain++; l = u.list; if (l.length === 0) break; }
  assert.ok(restored >= UNDO_CAP - 1 && restored <= UNDO_CAP, `the last ${UNDO_CAP} applies can be undone with their replaced sentence (${restored})`);
  assert.ok(plain >= 1, 'the ones older than the cap fall back to removing the last item');
});

test('redo needs the list the undo left: a redo entry made by a fallback undo is offered only while the list is exactly what that undo left', () => {
  const s = createUndoStack();
  const u = s.undo(['a', 'b'])!; assert.deepEqual(u.list, ['a']);
  assert.equal(s.canRedo(['a', 'x']), false); assert.equal(s.canRedo(['a']), true); assert.equal(s.canRedo([]), false);
  const r = s.redo(['a'])!; assert.deepEqual(r.list, ['a', 'b']); assert.deepEqual(r.added, ['b']);
  assert.equal(s.canRedo(['a', 'b']), false, 'a redo is used once');
  assert.equal(s.canUndo(['a', 'b']), true); assert.deepEqual(s.undo(['a', 'b'])!.removed, ['b']);
});

test('parseList: a list of items with only "Together." is empty; an item of one sentence is kept to the letter (even a line the grammar cannot read); an item of several is split', () => {
  assert.deepEqual(parseList('1. Together.', 'arrangement', VAULT), { list: [], shape: 'empty' });
  assert.deepEqual(parseList('1. play me something nice\n2. Mute the [[latin]] kit', 'arrangement', VAULT).list, ['play me something nice', 'Mute the [[latin]] kit']);
  assert.deepEqual(parseList('1. Play [[phrase_001]] on the [[rock]] kit. Together.', 'arrangement', VAULT).list, ['Play [[phrase_001]] on the [[rock]] kit.']);
  assert.deepEqual(parseList(null as unknown as string, 'composition', VAULT), { list: [], shape: 'empty' });
});

test('a paragraph of ONE readable sentence is "paragraph" (a list of one); two sentences on two lines without numbers are the paragraph too', () => {
  assert.deepEqual(parseList('Play [[phrase_001]].', 'composition', VAULT), { list: ['Play [[phrase_001]].'], shape: 'paragraph' });
  assert.deepEqual(parseList('Play [[phrase_001]].\nThen play [[phrase_002]].', 'composition', VAULT), { list: ['Play [[phrase_001]].', 'Then play [[phrase_002]].'], shape: 'paragraph' });
  assert.deepEqual(parseList('Play [[phrase_001]]', 'composition', VAULT), { list: ['Play [[phrase_001]].'], shape: 'paragraph' }, 'a missing full stop is added to a split sentence');
});

test('planAppend keeps what it was given: the list passed in is not changed, the typed sentences are trimmed and an empty one is not a sentence', async () => {
  const l = [...C5_LINES]; const typed = ['  Mute the [[latin]] kit.  ', ' ', ''];
  const p = await planAppend(l, 'arrangement', typed, ctx);
  assert.deepEqual(l, C5_LINES); assert.ok(p.ok && p.added.length === 1 && p.added[0] === 'Mute the [[latin]] kit.');
});
