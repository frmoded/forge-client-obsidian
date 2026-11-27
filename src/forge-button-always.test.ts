// 2026-11-23-1023 PART A on the REAL plugin (music-tabs-world.ts: the real ForgePlugin.onload, real leaves): the Forge button is ALWAYS there on a phrase, an arrangement and a composition, in the note's text view and in its Score tab,
// not only while an edit is pending (the driver, on comp_001 with nothing pending: "I do not see a forge button in either note view or score view"). With nothing pending a click replays the Description and redraws the Score; with a pending
// edit it is the 1018 button; 2026-11-26-1047 (deliberate): with a hand-edited Recipe it makes the Recipe again from the Description and asks nothing (it asked once before). No model call.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { musicTabsWorld, realMusicPlugin, type MusicTabsWorld } from './test-support/music-tabs-world.ts';
import type { RealPlugin } from './test-support/bundle-real-plugin.ts';
import { COMPOSITION_VIEW_TYPE } from './composition-core.ts';
import { NEW_COMPOSITION_COMMAND_ID } from './composition-flow-core.ts';
import { ARRANGEMENT_VIEW_TYPE } from './arrangement-core.ts';
import { NEW_ARRANGEMENT_COMMAND_ID } from './kit-arrangement-flow-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { dialogLast } from './test-support/dialog-view.ts';

let real: RealPlugin;
before(async () => { real = await realMusicPlugin(); });
after(() => { /* the bundle is per process */ });

const COMP = 'compositions/comp_001.md';
const PHRASE = 'phrases/phrase_001.md';
const PENDING = 'The Description was edited. Click Forge to apply it.';
const recipeOf = (t: string): string => /# Recipe\n+([\s\S]*?)\n+# Python/.exec(t)?.[1]?.trim() ?? '';
const editDescription = (t: string, from: string, to: string): string => t.replace(/(# Description\n+[\s\S]*?)(# Recipe)/, (_m, d: string, tail: string) => d.replace(from, to) + tail);
const editRecipe = (t: string, from: string, to: string): string => t.replace(/(# Recipe\n+[\s\S]*?)(# Python)/, (_m, d: string, tail: string) => d.replace(from, to) + tail);
const forgeAction = (view: any) => (view.actions ?? []).find((a: any) => a.title === 'Forge');
const strip = (leaf: any): { message: string; buttons: string[]; labels: string[] } => ({ message: leaf.view.contentEl.querySelector('.forge-description-message')?.textContent ?? '', buttons: [...leaf.view.contentEl.querySelectorAll('.forge-description-button')].map((b: any) => b.getAttribute('data-action') ?? ''), labels: [...leaf.view.contentEl.querySelectorAll('.forge-description-button')].map((b: any) => b.textContent ?? '') });

async function composition(w: MusicTabsWorld) {
  await w.newNote(NEW_COMPOSITION_COMMAND_ID);
  const tab = w.leaves.find((l) => w.typeOf(l) === COMPOSITION_VIEW_TYPE)!;
  await w.say(tab.view, 'Play [[phrase_001]].'); await w.say(tab.view, 'Then play [[phrase_002]] for 4 bars.');
  return tab;
}

test('A1 the Score tab of a composition, of a phrase and of an arrangement carries a Forge button (hammer) with NOTHING pending', async () => {
  const w = await musicTabsWorld(real);
  try {
    const comp = await composition(w); assert.equal(strip(comp).message, '', 'nothing is pending');
    const f = forgeAction(comp.view); assert.ok(f, `the composition tab's actions: ${(comp.view.actions ?? []).map((a: any) => a.title).join(', ')}`); assert.equal(f.icon, 'hammer');
    const phrase = await w.restoreTab(PHRASE_VIEW_TYPE, PHRASE); assert.ok(forgeAction(phrase.view), 'the phrase tab');
    await w.newNote(NEW_ARRANGEMENT_COMMAND_ID); const arr = w.leaves.find((l) => w.typeOf(l) === ARRANGEMENT_VIEW_TYPE)!; assert.ok(arr, 'an arrangement tab'); assert.ok(forgeAction(arr.view), 'the arrangement tab');
  } finally { w.done(); }
});

/** The driver's way to the text of a list note in a score-first vault: the Score tab's `Open as Forge note` (the tab then shows the note's text; the Forge button is added to ITS header, taken from the Score view's). */
async function textOf(w: MusicTabsWorld, tab: any) {
  (tab.view.actions as any[]).find((a) => a.title === 'Open as Forge note').cb(); await w.settle(1500);
  assert.equal(w.typeOf(tab), 'markdown', 'the tab shows the note\'s text now'); return tab;
}

test('A2 the TEXT view of a list note carries the Forge button too (where the hammer sits on other notes), added when the tab shows the text; a bar\'s text view does not', async () => {
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w); const text = await textOf(w, tab);
    const f = forgeAction(text.view); assert.ok(f, `the text view's actions: ${(text.view.actions ?? []).map((a: any) => a.title).join(', ')}`); assert.equal(f.icon, 'hammer');
    const bar = await w.openFromList('bars/bar_007.md', { newTab: true }); assert.equal(forgeAction(bar.view), undefined, 'a bar tab has no Forge button');
  } finally { w.done(); }
});

test('A3 a click with nothing pending writes NOTHING, redraws the Score and says `Forged. Nothing changed.` in the dialog; no undo entry; no model call', async () => {
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w);
    const before = w.store.get(COMP)!; const writes = w.writes.length; const askedBefore = w.asked.length;
    forgeAction(tab.view).cb(); await w.settle(800);
    assert.equal(w.store.get(COMP), before, 'the note is byte for byte what it was'); assert.equal(w.writes.length, writes, 'no write');
    assert.ok(w.asked.length > askedBefore, 'the Score was asked again (redrawn)');
    assert.equal(dialogLast(tab.view.contentEl), 'Forged. Nothing changed.');
    assert.equal(strip(tab).message, '', 'no strip');
  } finally { w.done(); }
});

test('A4 a click on a PENDING Description edit is the 1018 button: the note is forged and the Recipe follows; the same click from the TEXT view works', async () => {
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w);
    await w.handEdit(COMP, (t) => editDescription(t, 'for 4 bars', 'for 2 bars'));
    assert.equal(strip(tab).message, PENDING); assert.deepEqual(strip(tab).labels, ['Forge', 'Revert']);
    forgeAction(tab.view).cb(); await w.settle(1500);
    assert.match(recipeOf(w.store.get(COMP)!), /for 2 bars/, 'the Recipe is made again from the Description'); assert.equal(strip(tab).message, '');
  } finally { w.done(); }
});

test('A4b the same click from the TEXT view forges a pending Description edit', async () => {
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w); const text = await textOf(w, tab);
    await w.handEdit(COMP, (t) => editDescription(t, 'for 4 bars', 'for 2 bars'));
    forgeAction(text.view).cb(); await w.settle(1500);
    assert.match(recipeOf(w.store.get(COMP)!), /for 2 bars/, 'the text view\'s button forged it');
  } finally { w.done(); }
});

test('A5 a click while the Recipe holds hand edits asks nothing: the strip says the one line, Forge makes the Recipe again from the Description, and the line goes', async () => {          // 2026-11-26-1047 (deliberate): was the ask-once of 1016
  const w = await musicTabsWorld(real);
  try {
    const tab = await composition(w);
    const start = w.store.get(COMP)!;
    await w.handEdit(COMP, (t) => editRecipe(t, 'for 4 bars', 'for 2 bars'));
    assert.notEqual(w.store.get(COMP), start);
    assert.equal(strip(tab).message, 'This Recipe/Python is generated. Edit the Description, or Detach.'); assert.deepEqual(strip(tab).labels, ['Detach', 'OK']);
    forgeAction(tab.view).cb(); await w.settle(1500);
    assert.equal(recipeOf(w.store.get(COMP)!), recipeOf(start), 'the Recipe is the one the Description makes');
    assert.equal(strip(tab).message, ''); assert.equal(dialogLast(tab.view.contentEl), 'Forged.');
  } finally { w.done(); }
});

test('A6 the setting `Forge Description edits at once` ON keeps the button working (nothing pending: Forged. Nothing changed.)', async () => {
  const w = await musicTabsWorld(real);
  try {
    (w.plugin as any).target.settings.forgeDescriptionAtOnce = true;
    const tab = await composition(w);
    const before = w.store.get(COMP)!; forgeAction(tab.view).cb(); await w.settle(800);
    assert.equal(w.store.get(COMP), before); assert.equal(dialogLast(tab.view.contentEl), 'Forged. Nothing changed.');
  } finally { w.done(); }
});
