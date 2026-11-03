// 2026-11-03-1155-8 (D3): the comment above the json cache was false for a Recipe- or Python-sourced note ("derived from the Description above"). One sentence that is true for every source, written by the one renderer, so a note
// of any source carries it, and "Refresh note links" brings an older note to it (the comment sits outside every hashed section: no stamp moves).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_DEFAULTS, noteContentFor, refreshPhraseNoteText, type PhraseParams } from './phrase-core.ts';
import { CACHE_NOTE, asPythonSourced, asRecipeSourced } from './phrase-notes-core.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const OLD = '<!-- derived from the Description above; edit the Description, not this -->';
const description = noteContentFor('phrase_001', EXTEND);
const sources: Array<[string, string]> = [['description', description], ['recipe', asRecipeSourced(description)], ['python', asPythonSourced(description)]];
const commentOf = (t: string): string => (/# Cache\n\n(<!--[^\n]*-->)\n/.exec(t) ?? [])[1] ?? '';

test('the cache comment names no single facet as the source: it is the same, true sentence in a Description-, a Recipe- and a Python-sourced note', () => {
  for (const [label, text] of sources) {
    assert.equal(commentOf(text), CACHE_NOTE, label);
    const refreshed = refreshPhraseNoteText(text, 'phrase_001');
    assert.ok(refreshed.ok, label);
    assert.equal(commentOf((refreshed as { text: string }).text), CACHE_NOTE, `${label}: and still after a refresh`);
  }
  assert.doesNotMatch(CACHE_NOTE, /Description above/);
  assert.match(CACHE_NOTE, /Description, Recipe or Python/);
});

test('an older note that carries the old sentence is brought to the new one by "Refresh note links", nothing else in it moves (the stamps are the same), and a second refresh is a no-op', () => {
  for (const [label, text] of sources) {
    const old = text.replace(CACHE_NOTE, OLD);
    assert.notEqual(old, text, `${label}: the fixture really carries the old sentence`);
    const r = refreshPhraseNoteText(old, 'phrase_001');
    assert.ok(r.ok && r.changed, `${label}: rewritten`);
    assert.equal((r as { text: string }).text, text, `${label}: byte for byte the note a new write makes`);
    const again = refreshPhraseNoteText((r as { text: string }).text, 'phrase_001');
    assert.ok(again.ok && !again.changed, `${label}: idempotent`);
  }
});
