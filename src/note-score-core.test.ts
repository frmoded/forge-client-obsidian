// 2026-11-19-0990 - the pure pieces of "a composition and an arrangement reopen as their Score": which Score tab a path has (note-score-core.ts), what a note with no or two json fences is and says (cache-fence-core.ts), and how a note with no
// cache gets one (note-open-repair-core.ts, writeListNote). Strings in, strings out: no obsidian, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FAMILY_WORD, SCORE_VIEW_TYPES, isScoreNotePath, rhythmRefusalWords, scoreViewTypeOf } from './note-score-core.ts';
import { NO_SCORE_YET, OPEN_BLOCK_WORDS, TWO_BLOCKS_WORDS, cacheWords, hasNoCacheFence, jsonFenceCount, withCacheFence } from './cache-fence-core.ts';
import { repairForOpen } from './note-open-repair-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { emptyArrangementNote, emptyCompositionNote, isEmptyNote } from './empty-note-core.ts';
import { extractPhraseJsonBlock } from './phrase-notes-core.ts';
import { readCompositionNote, readCompositionNote as readComp, COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { readArrangementNote, ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { descriptionState } from './description-apply-core.ts';
import { extractRecipeSection } from './v2-note-core.ts';

const VAULT = { bars: ['bar_007'], phrases: ['phrase_001', 'phrase_002'], arrangements: [], compositions: [], kits: ['rock', 'latin'] };
const FRONT = '---\ntype: data\ncontent_type: json\n---\n';
const FENCEWORDS = /fenced|exactly one/i;

test('scoreViewTypeOf: the Score tab of a phrase, an arrangement and a composition; nothing else', () => {
  assert.equal(scoreViewTypeOf('phrases/phrase_001.md'), PHRASE_VIEW_TYPE);
  assert.equal(scoreViewTypeOf('arrangements/arr_001.md'), ARRANGEMENT_VIEW_TYPE);
  assert.equal(scoreViewTypeOf('compositions/A.md'), COMPOSITION_VIEW_TYPE);
  for (const p of ['compositions/README.md', 'compositions/a/b.md', 'bars/bar_001.md', 'kits/rock.md', 'x.md', '', null, undefined]) { assert.equal(scoreViewTypeOf(p), null, String(p)); assert.equal(isScoreNotePath(p), false); }
  assert.deepEqual([...SCORE_VIEW_TYPES].sort(), [ARRANGEMENT_VIEW_TYPE, COMPOSITION_VIEW_TYPE, PHRASE_VIEW_TYPE].sort());
  assert.equal(FAMILY_WORD.composition, 'a composition');
});

test('rhythmRefusalWords: a bar keeps the gate\'s own words; a phrase, an arrangement and a composition are told what they are, with no fence count', () => {
  const gate = 'The note body must be exactly one fenced ```json block (found something else before it, or no json block).';
  assert.equal(rhythmRefusalWords('bars/bar_001.md', 'Score', gate), `Score: ${gate}`);
  assert.equal(rhythmRefusalWords('notes/x.md', 'Edit rhythm', 'm'), 'Edit rhythm: m');
  for (const [p, word] of [['compositions/A.md', 'a composition'], ['arrangements/a.md', 'an arrangement'], ['phrases/phrase_001.md', 'a phrase']] as const) {
    const s = rhythmRefusalWords(p, 'Score', gate);
    assert.ok(s.includes(`This is ${word}, not a bar`), s);
    assert.ok(s.includes('"Open as Score"'), 'says where the Score is');
    assert.ok(!FENCEWORDS.test(s) && !s.includes('json block'), s);
  }
});

test('jsonFenceCount / hasNoCacheFence: the python fence is not a json fence; frontmatter is not a body; a note with no frontmatter is not a data note', () => {
  assert.equal(jsonFenceCount(`${FRONT}\n# Python\n\n\`\`\`python\n\`\`\`\n`), 0);
  assert.equal(jsonFenceCount(emptyCompositionNote('x')), 1);
  assert.equal(jsonFenceCount(`${FRONT}\n\`\`\`json\n{}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\`\n`), 2);
  assert.equal(hasNoCacheFence(`${FRONT}\n# Description\n`), true);
  assert.equal(hasNoCacheFence(emptyCompositionNote('x')), false);
  assert.equal(hasNoCacheFence('# no frontmatter\n'), false);
  assert.equal(hasNoCacheFence(''), false);
});

test('withCacheFence: a data note with no json fence gets an EMPTY cache, last; any other note is returned as it is (no-op stays no-op)', () => {
  const text = `${FRONT}\n# Description\n\n1. Play [[phrase_001]].\n`;
  const out = withCacheFence(text);
  assert.ok(out.startsWith(text.replace(/\s+$/, '')), 'what the note said is kept');
  assert.equal(jsonFenceCount(out), 1);
  assert.equal(extractPhraseJsonBlock(out).ok, true);
  assert.equal(isEmptyNote(out), true, 'valid, and empty');
  assert.equal(withCacheFence(out), out, 'idempotent');
  const two = `${FRONT}\n\`\`\`json\n{}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\`\n`;
  assert.equal(withCacheFence(two), two, 'two fences are not touched');
  assert.equal(withCacheFence('# plain\n'), '# plain\n');
  const crlf = withCacheFence(text.replace(/\n/g, '\r\n'));
  assert.ok(!/[^\r]\n/.test(crlf), 'a CRLF note stays CRLF');
  assert.equal(extractPhraseJsonBlock(crlf).ok, true);
});

test('cacheWords: the three refusals of the fence reader are plain sentences with no fence count; every other message is returned as it is', () => {
  const two = extractPhraseJsonBlock(`${FRONT}\n\`\`\`json\n{}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\`\n`);
  assert.equal(two.ok, false);
  assert.equal(cacheWords((two as { message: string }).message), TWO_BLOCKS_WORDS);
  const open = extractPhraseJsonBlock(`${FRONT}\n\`\`\`json\n{}\n`);
  assert.equal(cacheWords((open as { message: string }).message), OPEN_BLOCK_WORDS);
  const none = extractPhraseJsonBlock(`${FRONT}\n# Description\n`);
  assert.equal(cacheWords((none as { message: string }).message), NO_SCORE_YET);
  assert.equal(cacheWords('The note has no frontmatter, so it is not a data note.'), NO_SCORE_YET);
  for (const s of [TWO_BLOCKS_WORDS, OPEN_BLOCK_WORDS, NO_SCORE_YET]) assert.ok(!FENCEWORDS.test(s), s);
  assert.ok(/type a sentence in the box below/.test(NO_SCORE_YET), 'says what to do');
  assert.equal(cacheWords('The json block is not valid JSON: Unexpected token'), 'The json block is not valid JSON: Unexpected token');
});

test('repairForOpen: a note that has its fence is returned byte for byte (an open writes nothing)', () => {
  for (const t of [emptyCompositionNote('x'), emptyArrangementNote('x'), `${FRONT}\n\`\`\`json\n{}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\`\n`, '# plain\n', '']) assert.equal(repairForOpen(t, 'x', 'composition', VAULT), t);
});

test('repairForOpen: no fence and nothing to read = an empty cache only; a Description list is the source; else a readable Recipe; an unreadable one is kept and nothing is guessed', () => {
  const sections = (desc: string, recipe: string) => `${FRONT}\n# Description\n\n${desc}\n\n# Recipe\n\n${recipe}\n\n# Python\n\n\`\`\`python\n\`\`\`\n`;
  const bare = repairForOpen(`${FRONT}\n# Description\n\n`, 'bare', 'composition', VAULT);
  assert.equal(isEmptyNote(bare), true);
  const fromList = repairForOpen(sections('1. Play [[phrase_001]].\n2. Then play [[phrase_002]] for 4 bars.', ''), 'x', 'composition', VAULT);
  const r1 = readComp(fromList);
  assert.ok(r1.ok, JSON.stringify(r1));
  assert.deepEqual((r1 as { value: { sections: unknown[] } }).value.sections, [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_002', length: 4 }]);
  assert.equal(jsonFenceCount(fromList), 1);
  assert.match(fromList, /^1\. Play \[\[phrase_001\]\]\.$/m, 'the list is what the person sees');
  const fromRecipe = repairForOpen(sections('', 'Play [[phrase_001]].\nThen play [[phrase_002]] for 4 bars.'), 'x', 'composition', VAULT);
  const r2 = readCompositionNote(fromRecipe);
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal((r2 as { value: { sections: unknown[] } }).value.sections.length, 2);
  assert.match(fromRecipe, /source_facet: recipe/, 'a Recipe-sourced note: the Recipe is what it says');
  assert.match(fromRecipe, /^2\. Then play \[\[phrase_002\]\] for 4 bars\.$/m, 'and the Description list is made from it');
  const garbage = sections('1. Sing a song.', 'Sprinkle glitter.');
  const kept = repairForOpen(garbage, 'x', 'composition', VAULT);
  assert.equal(isEmptyNote(kept), true, 'nothing readable: an empty cache, nothing guessed');
  assert.ok(kept.includes('1. Sing a song.') && kept.includes('Sprinkle glitter.'), 'what the person wrote is kept');
  const wrongKind = repairForOpen(sections('', 'Play [[phrase_001]] on the [[rock]] kit.\nTogether.'), 'x', 'composition', VAULT);
  assert.equal(isEmptyNote(wrongKind), true, 'an arrangement\'s Recipe in a composition is not applied');
  const arr = repairForOpen(sections('1. Play [[phrase_001]] on the [[rock]] kit.', ''), 'x', 'arrangement', VAULT);
  assert.ok(readArrangementNote(arr).ok);
  assert.equal(repairForOpen(arr, 'x', 'arrangement', VAULT), arr, 'idempotent: the repaired note has its fence, a second open writes nothing');
  assert.equal(descriptionState(arr, 'arrangement', VAULT).kind, 'synced', 'the repaired note is in sync with its stamps: nothing is offered to update');
  assert.ok(extractRecipeSection(arr) !== null);
});

test('writeListNote: a note with no json fence is written from the list as any note is (the first sentence of a fenceless note)', () => {
  const t = `${FRONT}\n# Description\n\n`;
  const w = writeListNote(t, 'x', 'composition', { params: { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] } as never, list: ['Play [[phrase_001]].'] });
  assert.ok(w.ok);
  const text = (w as { text: string }).text;
  assert.equal(jsonFenceCount(text), 1);
  assert.ok(readCompositionNote(text).ok);
  const empty = writeListNote(t, 'x', 'composition', { params: null, list: [] });
  assert.ok(empty.ok && isEmptyNote((empty as { text: string }).text));
  const withFence = emptyCompositionNote('x');
  const again = writeListNote(withFence, 'x', 'composition', { params: null, list: [] });
  assert.ok(again.ok && (again as { text: string }).text === withFence, 'a note that has its fence: no-op stays no-op');
});
