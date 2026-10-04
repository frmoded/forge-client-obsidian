// The lean edition is the default build and must behave exactly like `main` did before the seam:
// no music features, and every render hook declines so the caller falls back to plain text.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { musicEdition } from './music-edition-selected.ts';
import { musicEdition as leanEdition } from './music-edition.lean.ts';
import { registeredWidgetTypes, resetWidgetRegistry } from './input-widget-core.ts';

test('the committed selector points at the lean implementation (so tsc / node --test / plain build are lean)', () => {
  assert.equal(musicEdition, leanEdition);
  assert.equal(musicEdition.id, 'lean');
});

test('lean edition registers no music input widgets', () => {
  resetWidgetRegistry();
  musicEdition.registerInputWidgets();
  assert.deepEqual(registeredWidgetTypes(), []);
});

test('lean edition declines to render MusicXML (caller shows text), in both payload shapes', () => {
  const entry = {} as HTMLElement;   // must not be touched
  assert.equal(musicEdition.renderMusicXML(entry, '<score-partwise/>', 'snip'), false);
  assert.equal(musicEdition.renderTaggedMusicXML(entry, { type: 'musicxml', content: '<x/>' }, 'snip'), false);
  assert.equal(
    musicEdition.renderTaggedMusicXML(entry, {
      type: 'musicxml', has_percussion: true, kit_content: '<k/>', multi_staff_content: '<m/>',
    }, 'snip'),
    false,
  );
});

test('lean stopPlayers is a harmless no-op and never reports an error', () => {
  let errors = 0;
  assert.doesNotThrow(() => musicEdition.stopPlayers({} as HTMLElement, () => { errors++; }));
  assert.equal(errors, 0);
});
