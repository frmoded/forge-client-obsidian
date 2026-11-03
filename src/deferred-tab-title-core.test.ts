// 2026-11-03-1155-8 (D1): the pure part - which saved states give a tab title. The wiring (a deferred leaf on the real plugin gets its note's name when the layout settles) is in description-apply-wiring.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deferredTabName } from './deferred-tab-title-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';

test('a phrase, arrangement or composition leaf is named after its note; anything else, or a state without a file, is left to Obsidian', () => {
  assert.equal(deferredTabName(PHRASE_VIEW_TYPE, { file: 'phrases/phrase_003.md' }), 'phrase_003');
  assert.equal(deferredTabName(ARRANGEMENT_VIEW_TYPE, { file: 'arrangements/arrangement_001.md' }), 'arrangement_001');
  assert.equal(deferredTabName(COMPOSITION_VIEW_TYPE, { file: 'compositions/composition_002.md' }), 'composition_002');
  assert.equal(deferredTabName('markdown', { file: 'phrases/phrase_003.md' }), null);
  assert.equal(deferredTabName(PHRASE_VIEW_TYPE, {}), null);
  assert.equal(deferredTabName(PHRASE_VIEW_TYPE, undefined), null);
  assert.equal(deferredTabName(PHRASE_VIEW_TYPE, { file: '' }), null);
  assert.equal(deferredTabName(PHRASE_VIEW_TYPE, { file: 42 }), null);
});
