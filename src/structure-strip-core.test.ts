// score_first M13 / design 4.12 phase C (drain 2026-10-26-1270, DEMO profile) — the structure strip above the Score: chips naming the notes behind what is drawn, which bars each chip contributed to, the bars a note
// contributed to (the notes pane -> Score direction), the chips of a bar tab (the phrases that use it). Pure: golden texts per kind, and a cross-check against the rule the Inspector's pin uses (pinnedNoteFor), so the
// two cannot drift apart.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { barParent, barsContributedBy, chipsFor, litBarIds, stripText, usedByChips, litEvidence } from './structure-strip-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import type { PhraseParams } from './phrase-core.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 };
const VOTE: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0.6, threshold: 0.65, ghost: true };
const PATH: PhraseParams = { ...VOTE, mode: 'path', order: 'musical', seed: 0, weight: 1 } as PhraseParams;

test('chips per kind, golden (the lineage order): extend, morph, vote mix, path mix, and a fork adds its own chip', () => {
  assert.equal(stripText(chipsFor('phrase_001', EXTEND)), '[bar_005] -> [phrase_001 extend 8 bars]');
  assert.equal(stripText(chipsFor('phrase_004', MORPH)), '[bar_007] -> [phrase_004 morph, 17 bars] -> [bar_008]');
  assert.equal(stripText(chipsFor('phrase_002', PATH)), '[bar_005] [bar_001] -> [phrase_002 mix, path]');
  assert.equal(stripText(chipsFor('phrase_002', VOTE)), '[bar_005] [bar_001] -> [phrase_002 mix, vote]');
  const forked = { ...MORPH, overrides: { '9': 'bars/bar_009' } } as PhraseParams;
  assert.equal(stripText(chipsFor('phrase_004', forked)), '[bar_007] -> [phrase_004 morph, 17 bars] -> [bar_008] [bar_009 fork of bar 9]');
  assert.equal(stripText(chipsFor('phrase_002', { ...VOTE, b: 'bar_005' })), '[bar_005] -> [phrase_002 mix, vote]', 'the same bar twice is one chip');
});

test('every chip names the note it opens (a lineage id) and its kind', () => {
  const c = chipsFor('phrase_004', { ...MORPH, overrides: { '9': 'bars/bar_009' } } as PhraseParams);
  assert.deepEqual(c.map((x) => [x.kind, x.noteId]), [['bar', 'bars/bar_007'], ['phrase', 'phrases/phrase_004'], ['bar', 'bars/bar_008'], ['fork', 'bars/bar_009']]);
});

test('which bars a note contributed to: a source bar of an extend = all bars; a morph\'s a = the bars at or before the middle, b = the later ones ("the later bars light"); the phrase = all; a fork = its bar; a stranger = none', () => {
  assert.deepEqual(barsContributedBy(EXTEND, 'bar_005'), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(barsContributedBy(MORPH, 'bar_007'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(barsContributedBy(MORPH, 'bar_008'), [10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(barsContributedBy(MORPH, 'phrase_004', 'phrase_004'), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.deepEqual(barsContributedBy({ ...MORPH, overrides: { '9': 'bars/bar_009' } } as PhraseParams, 'bar_009'), [9]);
  assert.deepEqual(barsContributedBy({ ...MORPH, overrides: { '9': 'bars/bar_009' } } as PhraseParams, 'bar_007'), [1, 2, 3, 4, 5, 6, 7, 8], 'bar 9 is the fork\'s now');
  assert.deepEqual(barsContributedBy(MORPH, 'bar_999'), []);
  assert.deepEqual(barsContributedBy(PATH, 'bar_005'), [1], 'a mix has one bar: the heavier parent (weight 1 = all of a)');
  assert.deepEqual(barsContributedBy(PATH, 'bar_001'), []);
  assert.deepEqual(barsContributedBy({ ...VOTE, weight: 0.2 }, 'bar_001'), [1]);
});

test('the bar ids to light: bar n of any phrase is ph_bar_n', () => {
  assert.deepEqual(litBarIds([2, 5]), ['ph_bar_2', 'ph_bar_5']);
  assert.deepEqual(litBarIds([]), []);
});

test('CROSS-CHECK with the rule the pin uses (pinnedNoteFor): for every bar of every kind the strip\'s parent is the note a pin on that bar sends the notes pane to', () => {
  const prov = (role: string, params: Record<string, unknown>) => ({ noteId: 'phrases/phrase_x', role, params });
  const forked = { ...MORPH, overrides: { '3': 'bars/bar_009' } } as PhraseParams;
  for (const p of [EXTEND, MORPH, forked, { ...MORPH, bars: 4 } as PhraseParams, { ...MORPH, bars: 1 } as PhraseParams]) {
    const bars = p.kind === 'mix' ? 1 : p.bars;
    for (let n = 1; n <= bars; n++) {
      const params = p.kind === 'extend' ? { bar: n, bars: p.bars, source: p.source, ...(p.overrides?.[String(n)] ? { fork: p.overrides[String(n)] } : {}) }
        : p.kind === 'morph' ? { a: p.a, b: p.b, bar: n, bars: p.bars, ...(p.overrides?.[String(n)] ? { fork: p.overrides[String(n)] } : {}) } : {};
      const pin = pinnedNoteFor(prov(p.kind === 'extend' ? 'phrase-bar' : 'morph-bar', params));
      assert.equal(`bars/${barParent(p, n)}`, pin?.noteId, `${p.kind} bar ${n} of ${bars}`);
    }
  }
  for (const w of [0, 0.2, 0.5, 0.51, 1]) {
    const vote = pinnedNoteFor(prov('mix-bar', { a: 'bar_005', b: 'bar_001', weight: w }));
    assert.equal(`bars/${barParent({ ...VOTE, weight: w }, 1)}`, vote?.noteId, `vote weight ${w}`);
    const d = 8, k = Math.floor((1 - w) * d + 0.5);
    const path = pinnedNoteFor(prov('mix-bar', { a: 'bar_005', b: 'bar_001', mode: 'path', k, d, weight: w }));
    assert.equal(`bars/${barParent({ ...PATH, weight: w } as PhraseParams, 1)}`, path?.noteId, `path weight ${w} (k ${k} of ${d})`);
  }
});

test('a bar tab shows the phrases that use it, from the vault\'s resolved links (only phrases/, only links to THIS bar), in name order; none = no chips', () => {
  const resolved = { 'phrases/phrase_003.md': { 'bars/bar_005.md': 1, 'bars/bar_001.md': 1 }, 'phrases/phrase_001.md': { 'bars/bar_005.md': 2 }, 'phrases/phrase_002.md': { 'bars/bar_006.md': 1 }, 'notes/other.md': { 'bars/bar_005.md': 1 }, 'phrases/README.md': { 'bars/bar_005.md': 1 } };
  const c = usedByChips('bar_005', resolved);
  assert.deepEqual(c.map((x) => [x.text, x.noteId, x.kind]), [['phrase_001', 'phrases/phrase_001', 'phrase'], ['phrase_003', 'phrases/phrase_003', 'phrase']]);
  assert.equal(stripText(c), 'used by: [phrase_001] [phrase_003]');
  assert.deepEqual(usedByChips('bar_099', resolved), []);
  assert.equal(stripText([]), '');
});

test('the evidence line: the note the pane went to and the bars it lights', () => {
  assert.equal(litEvidence('bars/bar_008.md', [10, 11, 12]), '[forge-strip] note pane -> bars/bar_008.md lights bars 10, 11, 12');
  assert.equal(litEvidence('notes/other.md', []), '[forge-strip] note pane -> notes/other.md lights bars none');
});
