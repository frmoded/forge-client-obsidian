// 2026-11-24-1031 (pitch in bars, Stage 1b) - the mutation pass of the melody phrase answered (phrase-view.ts and score-first.ts, in the REAL plugin): the lists of names the plugin hands the grammar. A melody bar and a melody phrase are the notes whose front matter says
// `melody: true`; README is no note; a folder holds the notes of its own folder. (The review queue's list is melody-phrase-mutation-review-queue.test.ts.)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { emptyArrangementNote, emptyCompositionNote } from './empty-note-core.ts';
import { newPhraseNote, } from './phrase-notes-core.ts';
import { formatPhraseJson, type PhraseParams } from './phrase-core.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const melodyBar = (name: string): string => melodyNoteTemplate(name).replace('"notes": []', '"notes": [{ "step": 1, "pitch": "G3", "length": 2 }]');
const REPEAT: PhraseParams = { kind: 'extend', source: 'bar_021', bars: 2, style: 'repeat', tempo_change_pct: 0 };
const melodyPhrase = (name: string): string => newPhraseNote(name, REPEAT, formatPhraseJson(REPEAT));
const READMES = { 'bars/README.md': '# bars\n', 'phrases/README.md': '# phrases\n', 'compositions/README.md': '# compositions\n', 'kits/README.md': '# kits\n' };

/** A composition note that has NO json cache (a note someone wrote by hand): opening it computes the cache from its Description list. */
const noCache = (name: string, lines: string[]): string => emptyCompositionNote(name).replace(/\n*# Cache[\s\S]*$/, '\n').replace(/# Description\n+/, `# Description\n\n${lines.join('\n')}\n\n`);
const sectionsOf = (text: string): string[] => { const m = /```json\n([\s\S]*?)\n```/.exec(text); return m === null ? [] : (JSON.parse(m[1]).sections ?? []).map((s: { source: string }) => s.source); };

test('[real plugin] the phrase tab names the notes a sentence of its list may name: the bars and phrases of their folders, the melody ones by their front matter, and never a README', async () => {
  const real = await realMusicPlugin();
  const w = await musicTabsWorld(real, { 'bars/bar_021.md': melodyBar('bar_021'), 'bars/bar_022.md': melodyBar('bar_022'), 'phrases/phrase_101.md': melodyPhrase('phrase_101'), 'compositions/comp_101.md': emptyCompositionNote('comp_101'), ...READMES });
  try {
    const tab = w.viewOf(await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_001.md'));
    const names = tab.vaultNames();
    assert.deepEqual(names.bars, ['bar_007', 'bar_008', 'bar_021', 'bar_022'], 'every bar of the bars folder, no README');
    assert.deepEqual(names.melody, ['bar_021', 'bar_022'], 'the bars whose front matter says melody: true, and only those');
    assert.deepEqual(names.phrases, ['phrase_001', 'phrase_002', 'phrase_101'], 'every phrase of the phrases folder, no README');
    assert.deepEqual(names.melodyPhrases, ['phrase_101'], 'the phrases whose front matter says melody: true, and only those');
    assert.deepEqual(names.compositions, ['comp_101']); assert.deepEqual(names.kits, ['rock', 'latin']);
  } finally { w.done(); }
});

test('[real plugin] a composition opened with no cache has it computed with the lists of the plugin: melody phrases by their front matter, beats and notes never mixed, and no README to play', async () => {
  const real = await realMusicPlugin();
  const files = {
    'bars/bar_021.md': melodyBar('bar_021'), 'phrases/phrase_101.md': melodyPhrase('phrase_101'), 'phrases/phrase_102.md': melodyPhrase('phrase_102'), ...READMES,
    'compositions/notes.md': noCache('notes', ['1. Play [[phrase_101]] for 2 bars.', '2. Then play [[phrase_102]] for 3 bars.']),
    'compositions/beats.md': noCache('beats', ['1. Play [[phrase_001]] for 2 bars.', '2. Then play [[phrase_002]] for 3 bars.']),
    'compositions/mixed.md': noCache('mixed', ['1. Play [[phrase_101]] for 2 bars.', '2. Then play [[phrase_001]] for 3 bars.']),
    'compositions/readme.md': noCache('readme', ['1. Play [[README]] for 2 bars.']),
  };
  const w = await musicTabsWorld(real, files);
  try {
    for (const n of ['notes', 'beats', 'mixed', 'readme']) await w.restoreTab(COMPOSITION_VIEW_TYPE, `compositions/${n}.md`);
    await w.settle(800);
    assert.deepEqual(sectionsOf(w.store.get('compositions/notes.md')!), ['phrases/phrase_101', 'phrases/phrase_102'], 'two melody phrases');
    assert.deepEqual(sectionsOf(w.store.get('compositions/beats.md')!), ['phrases/phrase_001', 'phrases/phrase_002'], 'two rhythm phrases');
    assert.deepEqual(sectionsOf(w.store.get('compositions/mixed.md')!), ['phrases/phrase_101'], 'a melody phrase, then a rhythm phrase: the second is refused, so the cache has the first only');
    assert.deepEqual(sectionsOf(w.store.get('compositions/readme.md')!), [], 'README is no phrase: nothing to play, the cache stays empty');
  } finally { w.done(); }
});

test('[real plugin] an arrangement opened with no cache has it computed with the kits of the vault, and a kits/README.md is no kit', async () => {
  const real = await realMusicPlugin();
  const noCacheArr = (lines: string[]): string => emptyArrangementNote('x').replace(/\n*# Cache[\s\S]*$/, '\n').replace(/# Description\n+/, `# Description\n\n${lines.join('\n')}\n\n`);
  const w = await musicTabsWorld(real, { ...READMES, 'arrangements/real.md': noCacheArr(['1. Play [[phrase_001]] on the [[rock]] kit.']), 'arrangements/readme.md': noCacheArr(['1. Play [[phrase_001]] on the [[README]] kit.']) });
  try {
    for (const n of ['real', 'readme']) await w.restoreTab(ARRANGEMENT_VIEW_TYPE, `arrangements/${n}.md`);
    await w.settle(800);
    const tracks = (text: string): string[] => { const m = /```json\n([\s\S]*?)\n```/.exec(text); return m === null ? [] : (JSON.parse(m[1]).tracks ?? []).map((t: { kit: string }) => t.kit); };
    assert.deepEqual(tracks(w.store.get('arrangements/real.md')!), ['rock'], 'a kit of the kits folder is read');
    assert.deepEqual(tracks(w.store.get('arrangements/readme.md')!), [], 'README is no kit: nothing to play, the cache stays empty');
  } finally { w.done(); }
});
