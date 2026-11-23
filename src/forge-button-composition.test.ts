// 2026-11-23-1018 PART B on the REAL plugin (music-tabs-world.ts: the real ForgePlugin.onload, real leaves, the host's own events), the driver's case: comp_001, its Description edited BY HAND (a line that links a phrase): the note was not forged
// by itself and the Score did not redraw. Now the strip says the Description was edited and its Forge button does the replay; a sentence typed in the composer still applies at once; the setting restores the old behaviour.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { NEW_COMPOSITION_COMMAND_ID } from './composition-flow-core.ts';

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });

const COMP = 'compositions/comp_001.md';
const PENDING = 'The Description was edited. Click Forge to apply it.';
const descOf = (t: string): string => /# Description\n+([\s\S]*?)\n+# Recipe/.exec(t)?.[1]?.trim() ?? '';
const recipeOf = (t: string): string => /# Recipe\n+([\s\S]*?)\n+# Python/.exec(t)?.[1]?.trim() ?? '';
const editDescription = (t: string, from: string, to: string): string => t.replace(/(# Description\n+[\s\S]*?)(# Recipe)/, (_m, d: string, tail: string) => d.replace(from, to) + tail);
const strip = (w: MusicTabsWorld, leaf: any): { message: string; buttons: string[] } => ({ message: leaf.view.contentEl.querySelector('.forge-description-message')?.textContent ?? '', buttons: [...leaf.view.contentEl.querySelectorAll('.forge-description-button')].map((b: any) => b.textContent ?? '') });

async function composition(w: MusicTabsWorld) {
  await w.newNote(NEW_COMPOSITION_COMMAND_ID);
  const tab = w.leaves.find((l) => w.typeOf(l) === COMPOSITION_VIEW_TYPE)!;
  await w.say(tab.view, 'Play [[phrase_001]].'); await w.say(tab.view, 'Then play [[phrase_002]] for 4 bars.');      // sentences typed in the composer: applied at once, as ever
  return tab;
}

test('B7 the composer path is untouched: the typed sentences are in the note and the Score was asked, with the setting at its default (off); no model call', async () => {
  const w = await musicTabsWorld(real);
  try {
    await composition(w);
    assert.match(descOf(w.store.get(COMP)!), /1\. Play \[\[phrase_001\]\]\.\n2\. Then play \[\[phrase_002\]\] for 4 bars\./);
    assert.ok(w.asked.some((a) => a.params.kind === 'composition' && (a.data.sections ?? []).length === 2), 'the Score drew both parts');
  } finally { w.done(); }
});

test('B8 the driver\'s case: a hand-edited Description of a composition (a link to a phrase) is NOT forged by itself: the strip says so with a Forge button; Forge writes the note and the Score is asked again; the Recipe follows', async () => {
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w);
    const before = w.store.get(COMP)!; const askedBefore = w.asked.length;
    await w.handEdit(COMP, (t) => editDescription(t, 'for 4 bars', 'for 2 bars'));
    assert.equal(w.store.get(COMP), editDescription(before, 'for 4 bars', 'for 2 bars'), 'nothing was written by itself: the note is the hand edit, byte for byte');
    assert.equal(recipeOf(w.store.get(COMP)!), recipeOf(before), 'the Recipe is still the one the list made: nothing was forged');
    const s = strip(w, tab); assert.equal(s.message, PENDING); assert.deepEqual(s.buttons, ['Forge', 'Revert']);
    (tab.view.contentEl.querySelector('[data-action="update"]') as HTMLElement).click(); await w.settle(1500);
    assert.match(recipeOf(w.store.get(COMP)!), /for 2 bars/, 'the Recipe is made again from the Description');
    assert.ok(w.asked.length > askedBefore, 'the Score was asked (redrawn)');
    assert.equal(strip(w, tab).message, '', 'the strip is gone');
  } finally { w.done(); }
});

test('B9 reload keeps the pending mark (the stamps, not memory): the note as it was saved comes up with the same strip', async () => {
  let saved = '';
  { const x = await musicTabsWorld(real); try { await composition(x); await x.handEdit(COMP, (t) => editDescription(t, 'for 4 bars', 'for 2 bars')); saved = x.store.get(COMP)!; } finally { x.done(); } }
  const w = await musicTabsWorld(real, { [COMP]: saved }, { restoredText: [COMP] });
  try {
    await w.settle(1500);
    const leaf = w.leaves.find((l) => l.view.file?.path === COMP);
    assert.ok(leaf, 'the composition tab came back');
    assert.equal(strip(w, leaf).message, PENDING);
    assert.equal(w.store.get(COMP), saved, 'opening writes nothing');
  } finally { w.done(); }
});

test('B10 the setting `Forge Description edits at once` ON restores the old behaviour: the hand edit is replayed by itself', async () => {
  const w = await musicTabsWorld(real);
  try {
    (w.plugin as any).target.settings.forgeDescriptionAtOnce = true;
    await composition(w);
    await w.handEdit(COMP, (t) => editDescription(t, 'for 4 bars', 'for 2 bars'));
    assert.match(recipeOf(w.store.get(COMP)!), /for 2 bars/, 'forged by itself, as before');
  } finally { w.done(); }
});
