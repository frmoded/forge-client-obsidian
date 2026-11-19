// 2026-11-19-0980 (THE LIST MODEL, stage 2: PHRASES) - the NOTE side of a phrase's list: the whole note (Description list, frontmatter summary, links, Recipe, Python, the six stamps, the json cache) is written from a replay in ONE go (`writeListNote`,
// kind 'phrase'), idempotently; and the STRIP's write (`writePhraseStrip`: a slider changed the params) goes through the same list (a slider produces or replaces the modifier line or the head segment) instead of replacing the Description with one
// sentence. Written RED first against the stage-1 code (`writeListNote` said "A phrase is not written from a list yet."; the strip replaced the whole Description). Pure strings in, strings out.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyPhraseNote } from './empty-note-core.ts';
import * as N from './sentence-list-note-core.ts';
import { replay, replayGrammar } from './sentence-list-core.ts';
import { applyPhraseWrite, readPhraseNote, refreshPhraseNoteText, formatPhraseJson, type PhraseParams } from './phrase-core.ts';
import { barCount } from './structure-strip-core.ts';
import { descriptionState } from './description-apply-core.ts';
import { extractDescription, extractPythonSection, extractRecipeSection } from './v2-note-core.ts';
import { phrasePython, phraseRecipeSteps, descriptionEditedByHand, sourceChainStamps } from './phrase-notes-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const NAME = 'phrase_020';
const HEAD = 'Extend [[bar_005]] to 4 bars, repeating with fills.';

async function noteOf(lines: string[], start = emptyPhraseNote(NAME)): Promise<string> {
  const rp = await replay(lines, 'phrase', { vault: V });
  const w = N.writeListNote(start, NAME, 'phrase', rp); assert.ok(w.ok, w.ok ? '' : w.message); return (w as { ok: true; text: string }).text;
}

test('writeListNote, phrase: ONE write makes the Description a numbered list, the json cache, the Recipe, the Python, the links and the six stamps; the stamps are the hashes of the FINISHED text (the note is "synced")', async () => {
  const text = await noteOf([HEAD, 'Make it 20 percent slower.', 'Keep bars 1 to 3.']);
  assert.equal(extractDescription(text), `1. ${HEAD}\n2. Make it 20 percent slower.\n3. Keep bars 1 to 3.`);
  const read = readPhraseNote(text); assert.ok(read.ok);
  const p = (read as { ok: true; value: PhraseParams }).value as unknown as { kind: string; tempo_change_pct: number; ops: unknown[] };
  assert.equal(p.kind, 'extend'); assert.equal(p.tempo_change_pct, -20); assert.equal(p.ops.length, 1);
  assert.equal((extractRecipeSection(text) ?? '').trim(), phraseRecipeSteps(p as never).join('\n')); assert.equal((extractPythonSection(text) ?? '').trim(), phrasePython(p as never).trim());
  assert.match(text, /^description: ".*bar_005.*"$/m); assert.match(text, /^links:\n {2}- "\[\[bar_005\]\]"$/m);
  const stamps = sourceChainStamps(text); for (const [k, v] of Object.entries(stamps)) assert.match(text, new RegExp(`^${k}: ${v}$`, 'm'), k);
  assert.equal(descriptionEditedByHand(text), false); assert.equal(descriptionState(text, 'phrase', V).kind, 'synced', 'nothing offers to update, revert or repair it');
});

test('IDEMPOTENT: writing the replay of the list a note already has gives the note\'s own text; an EMPTY list writes the 0960 empty note byte for byte', async () => {
  const lines = [HEAD, 'Bar 2 is replaced by [[bar_009]].'];
  const once = await noteOf(lines); const twice = await noteOf(lines, once); assert.equal(twice, once);
  const emptied = N.writeListNote(once, NAME, 'phrase', await replay([], 'phrase', { vault: V })); assert.ok(emptied.ok); assert.equal((emptied as { ok: true; text: string }).text, emptyPhraseNote(NAME));
});

test('an unreadable line is KEPT in the Description and the json shows only the lines before it (the replay stopped there)', async () => {
  const text = await noteOf([HEAD, 'Make it 20 percent slower.', 'make it groovy', 'Keep bars 1 to 2.']);
  assert.equal(extractDescription(text), `1. ${HEAD}\n2. Make it 20 percent slower.\n3. make it groovy\n4. Keep bars 1 to 2.`);
  const p = (readPhraseNote(text) as { ok: true; value: unknown }).value as { tempo_change_pct: number; ops?: unknown[] }; assert.equal(p.tempo_change_pct, -20); assert.equal(p.ops, undefined);
});

test('listOfNote reads a phrase note: a numbered list, a legacy paragraph (split, every sentence readable), a legacy paragraph that cannot be split (one line), an empty note', async () => {
  assert.deepEqual(N.listOfNote(await noteOf([HEAD, 'Keep bars 1 to 2.']), 'phrase', V).list, [HEAD, 'Keep bars 1 to 2.']);
  const legacy = N.listOfNote(PLAYGROUND_PHRASES.phrase_002, 'phrase', V); assert.equal(legacy.shape, 'paragraph'); assert.equal(legacy.list.length, 2);
  assert.equal(N.listOfNote(emptyPhraseNote(NAME), 'phrase', V).shape, 'empty');
});

// ---- the strip ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const stripNote = async (lines: string[]): Promise<string> => noteOf(lines);
const paramsOf = (text: string): Record<string, unknown> => (readPhraseNote(text) as { ok: true; value: Record<string, unknown> }).value;

test('writePhraseStrip: a Bars slider on an Extend writes the length modifier LINE (replaced in place on the next move), the json and every derived part follow, in one write, and the note is synced', async () => {
  let text = await stripNote([HEAD]);
  const w1 = N.writePhraseStrip(text, NAME, { ...paramsOf(text), bars: 8 } as unknown as PhraseParams, V); assert.ok(w1.ok); text = (w1 as { ok: true; text: string }).text;
  assert.equal(extractDescription(text), `1. ${HEAD}\n2. Make it 8 bars long.`); assert.equal(paramsOf(text).bars, 8); assert.equal(descriptionState(text, 'phrase', V).kind, 'synced');
  const w2 = N.writePhraseStrip(text, NAME, { ...paramsOf(text), bars: 6 } as unknown as PhraseParams, V); assert.ok(w2.ok);
  assert.equal(extractDescription((w2 as { ok: true; text: string }).text), `1. ${HEAD}\n2. Make it 6 bars long.`);
  const same = N.writePhraseStrip(text, NAME, paramsOf(text) as unknown as PhraseParams, V); assert.ok(same.ok); assert.equal((same as { ok: true; text: string }).text, text, 'a strip write that changes nothing writes the same bytes');
});

test('writePhraseStrip: a Tempo slider writes the tempo line; a Style or a Source picker rewrites the HEAD line; the other lines (a Keep, a fork) stay where they are', async () => {
  let text = await stripNote([HEAD, 'Keep bars 1 to 3.', 'Bar 2 is replaced by [[bar_009]].']);
  const t = N.writePhraseStrip(text, NAME, { ...paramsOf(text), tempo_change_pct: 12 } as unknown as PhraseParams, V); assert.ok(t.ok); text = (t as { ok: true; text: string }).text;
  assert.equal(extractDescription(text), `1. ${HEAD}\n2. Keep bars 1 to 3.\n3. Bar 2 is replaced by [[bar_009]].\n4. Make it 12 percent faster.`);
  const s = N.writePhraseStrip(text, NAME, { ...paramsOf(text), style: 'building', source: 'bar_006' } as unknown as PhraseParams, V); assert.ok(s.ok);
  assert.equal(extractDescription((s as { ok: true; text: string }).text).split('\n')[0], '1. Extend [[bar_006]] to 4 bars, building up.');
  assert.equal(descriptionState((s as { ok: true; text: string }).text, 'phrase', V).kind, 'synced');
});

test('writePhraseStrip on a LEGACY paragraph note: the first write splits it into a list (the strip is a recompute): the sentences are the paragraph\'s, plus the line the slider made', async () => {
  const legacy = PLAYGROUND_PHRASES.phrase_001;      // "Extend [[bar_007]] to 12 bars, repeating with fills, 12 percent faster."
  const w = N.writePhraseStrip(legacy, 'phrase_001', { ...paramsOf(legacy), bars: 6 } as unknown as PhraseParams, V); assert.ok(w.ok);
  assert.equal(extractDescription((w as { ok: true; text: string }).text), '1. Extend [[bar_007]] to 12 bars, repeating with fills, 12 percent faster.\n2. Make it 6 bars long.');
  assert.equal(paramsOf((w as { ok: true; text: string }).text).bars, 6);
});

test('writePhraseStrip keeps the refusals of every control write: a Description edited by hand is never overwritten ("Not saved: ..."), a note that is not a data note is refused', async () => {
  const text = (await stripNote([HEAD])).replace(`1. ${HEAD}`, `1. ${HEAD} I changed this.`);
  const w = N.writePhraseStrip(text, NAME, { ...paramsOf(text), bars: 8 } as unknown as PhraseParams, V); assert.equal(w.ok, false); assert.match((w as { ok: false; message: string }).message, /^Not saved: the Description was edited by hand/);
  assert.equal(N.writePhraseStrip('no frontmatter here', NAME, { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, V).ok, false);
});

test('applyPhraseWrite (the legacy single-sentence writer, used when a note is first made from params) is unchanged: one paragraph, byte for byte', () => {
  const p: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
  const note = ['---', 'type: data', 'content_type: json', '---', '', '```json', formatPhraseJson(p), '```', ''].join('\n');
  const w = applyPhraseWrite(note, p, NAME); assert.ok(w.ok); assert.equal(extractDescription((w as { ok: true; text: string }).text).trim(), HEAD);
  assert.ok(replayGrammar([HEAD], 'phrase', { vault: V }).params !== null);
});

test('"Refresh note links" keeps a phrase\'s LIST (it makes the derived parts again, never the sentences) and is idempotent; a legacy paragraph stays a paragraph until a sentence is applied', async () => {
  const text = await noteOf([HEAD, 'Make it 8 bars long.', 'Keep bars 1 to 6.']);
  const r = refreshPhraseNoteText(text, NAME); assert.ok(r.ok); assert.equal((r as { ok: true; changed: boolean }).changed, false, 'a list note is already what a refresh would make'); assert.equal((r as { ok: true; text: string }).text, text);
  const stale = text.replace(/^links:\n(  - .*\n)+/m, '');                     // the links went missing: the refresh puts them back and the list is still there
  const again = refreshPhraseNoteText(stale, NAME); assert.ok(again.ok); assert.equal(extractDescription((again as { ok: true; text: string }).text), extractDescription(text)); assert.match((again as { ok: true; text: string }).text, /^links:/m);
  const legacy = refreshPhraseNoteText(PLAYGROUND_PHRASES.phrase_001, 'phrase_001'); assert.ok(legacy.ok); assert.equal(extractDescription((legacy as { ok: true; text: string }).text).trim(), extractDescription(PLAYGROUND_PHRASES.phrase_001).trim());
});

test('barCount: a copy of its source has no change to count (0 until the Score says; never -Infinity), and a head with structure steps has the bars the Score has', () => {
  assert.equal(barCount({ kind: 'transform', source: 'phrases/phrase_003', ops: [] }), 0);
  assert.equal(barCount({ kind: 'transform', source: 'phrases/phrase_003', ops: [] }, 5), 5);
  assert.equal(barCount({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, ops: [{ op: 'keep', runs: [[1, 3]] }] }, 3), 3);
  assert.equal(barCount({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 }), 8);
});
