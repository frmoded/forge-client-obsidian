// 2026-11-24-1031 (pitch in bars, Stage 1b) - the mutation pass of the melody phrase answered (phrase-core.ts): the WHOLE sentence of the refusal of a fork of the other kind at draw time, in both directions (the earlier tests pinned its first half).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { producePhrase, type ExtendPhrase } from './phrase-core.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const melodyBar = (): string => melodyNoteTemplate('bar_101').replace('"notes": []', '"notes": [{ "step": 1, "pitch": "G3", "length": 1 }]');
function rig(files: Record<string, string>) {
  const asked: unknown[] = [];
  return { asked, deps: { readNote: async (p: string) => { if (!(p in files)) throw new Error('File not found'); return files[p]; }, compute: async (_data: unknown, params: unknown) => { asked.push(params); return { type: 'musicxml', content: '<score-partwise/>', bars_data: [] }; } } };
}
const message = (out: { kind: string }): string => { assert.equal(out.kind, 'refusal'); return (out as unknown as { message: string }).message; };

test('a rhythm bar forked into a melody phrase is refused in the whole sentence: it names the bar, its kind, and the kind of the source', async () => {
  const r = rig({ 'bars/bar_101.md': melodyBar(), 'bars/bar_001.md': PLAYGROUND_BARS['bar_001'] });
  const phrase: ExtendPhrase = { kind: 'extend', source: 'bar_101', bars: 3, style: 'repeat', tempo_change_pct: 0, overrides: { 2: 'bars/bar_001' } };
  assert.equal(message(await producePhrase(r.deps, phrase, 'p')),
    'Phrase: bar 2 (bars/bar_001) is a rhythm bar, and a phrase is all rhythm bars or all melody bars (the source bar_101 is a melody bar).');
  assert.equal(r.asked.length, 0, 'the engine was never asked');
});

test('a melody bar forked into a rhythm phrase is refused in the whole sentence the same way', async () => {
  const r = rig({ 'bars/bar_001.md': PLAYGROUND_BARS['bar_001'], 'bars/bar_101.md': melodyBar() });
  const phrase: ExtendPhrase = { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { 2: 'bars/bar_101' } };
  assert.equal(message(await producePhrase(r.deps, phrase, 'p')),
    'Phrase: bar 2 (bars/bar_101) is a melody bar, and a phrase is all rhythm bars or all melody bars (the source bar_001 is a rhythm bar).');
  assert.equal(r.asked.length, 0, 'the engine was never asked');
});
