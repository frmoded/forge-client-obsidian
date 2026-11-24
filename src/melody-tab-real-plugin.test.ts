// 2026-11-23-1030 (pitch in bars, Stage 1a) - THE TAB OF A MELODY BAR, in the REAL plugin (the real ForgePlugin.onload from the real music bundle, the real RhythmEditView, the real description controller, composer and dialog, an in-memory vault that delivers `modify`
// after a write as Obsidian does): the tab shows the list's composer and the Score of the bar (ONE staff, drawn from the engine's answer for the melody data) and NO Beat Box (no iframe, no refusal); a sentence rewrites the note and the Score is asked again
// for the new notes (src/rhythm-edit-view.ts `mountMelody` draws the Score: naming the file here is what makes the mutation runner's map run this slow test for a mutant of that file); a rhythm bar's tab is what it was (its Beat Box iframe); "New melody bar" makes `bars/bar_NNN.md` with the template; the default view opens a melody bar in this tab.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RHYTHM_EDIT_VIEW_TYPE } from './rhythm-edit-core.ts';
import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const MELODY = 'bars/bar_021.md';
const tabText = (view: any): string => String(view.contentEl.textContent ?? '');

async function world(real: Awaited<ReturnType<typeof realMusicPlugin>>) {
  const w = await musicTabsWorld(real, { [MELODY]: melodyNoteTemplate('bar_021') });
  const computed: Array<{ data: any; title: string }> = [];
  real.setPyodideHostSingleton({ getInstance: async () => ({ computeRhythmScore: async (data: any, title: string) => { computed.push({ data: JSON.parse(JSON.stringify(data)), title }); return { type: 'musicxml', content: `<score-partwise><x>${data.notes.length}</x></score-partwise>` }; } }) });
  return { w, computed };
}

test('[real plugin] a melody bar\'s tab: the Score area and the composer, NO Beat Box (no iframe) and no refusal; the engine is asked for the melody data (no channels)', async () => {
  const real = await realMusicPlugin(); const { w, computed } = await world(real);
  try {
    const leaf = await w.restoreTab(RHYTHM_EDIT_VIEW_TYPE, MELODY); const tab = w.viewOf(leaf);
    assert.ok(tab.contentEl.querySelector('.forge-rhythm-edit-score'), 'the Score area is in the tab');
    assert.equal(tab.contentEl.querySelector('iframe'), null, 'no Beat Box');
    assert.equal(tab.contentEl.querySelector('.forge-rhythm-edit-refusal'), null, 'no refusal');
    assert.doesNotMatch(tabText(tab), /Not rhythm data|Edit rhythm:/);
    assert.ok(w.field(tab) !== null, 'the composer is in the tab');
    await w.settle(600);
    assert.ok(computed.length >= 1, 'the engine was asked for the Score');
    assert.equal(computed[0].data.instrument, 'piano'); assert.equal('channels' in computed[0].data, false); assert.deepEqual(computed[0].data.notes, []);
    assert.deepEqual(w.writes, [], 'OPENING WRITES NOTHING');
  } finally { w.done(); }
});

test('[real plugin] a sentence in the composer rewrites the note (`lines:` and the fence) and the Score is asked again for the new notes; Cmd/Ctrl+Z takes it back and the Score follows', async () => {
  const real = await realMusicPlugin(); const { w, computed } = await world(real);
  try {
    const leaf = await w.restoreTab(RHYTHM_EDIT_VIEW_TYPE, MELODY); const tab = w.viewOf(leaf);
    await w.settle(600);
    await w.say(tab, 'Set the instrument to cello.'); await w.say(tab, 'Note G3 on step 1 for 1 step.');
    await w.settle(1500);
    const note = w.store.get(MELODY)!;
    assert.match(note, /lines:\n  - "Set the instrument to cello\."\n  - "Note G3 on step 1 for 1 step\."/);
    assert.match(note, /"instrument": "cello"/); assert.match(note, /\{ "step": 1, "pitch": "G3", "length": 1 \}/);
    const last = computed[computed.length - 1];
    assert.equal(last.data.instrument, 'cello'); assert.deepEqual(last.data.notes, [{ step: 1, pitch: 'G3', length: 1 }]);
    assert.equal(tab.contentEl.querySelector('iframe'), null);
    assert.ok(w.field(tab) !== null, 'the composer survived the redraws');
    await w.press(tab, { key: 'z', metaKey: true }); await w.settle(1500);
    assert.deepEqual(computed[computed.length - 1].data.notes, [], 'undone: the Score is asked for the bar without the note');
  } finally { w.done(); }
});

test('[real plugin] a rhythm bar\'s tab next to it is what it was: the Beat Box iframe, no melody branch', async () => {
  const real = await realMusicPlugin(); const { w } = await world(real);
  try {
    const leaf = await w.restoreTab(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_007.md'); const tab = w.viewOf(leaf);
    // 2026-11-23-1030 (deliberate): the Beat Box iframe needs the widget file, which the generated assets carry in the music build; the lean matrix worktree stubs generated assets, so there the same rhythm path says the widget is missing. Either way it is the RHYTHM path (never the melody branch, never a Beat Box refusal about the NOTE).
    const refusal = tab.contentEl.querySelector('.forge-rhythm-edit-refusal')?.textContent ?? '';
    assert.ok(tab.contentEl.querySelector('iframe') !== null || /Rhythm Box widget/.test(refusal), `the Beat Box, or its widget missing: ${refusal}`);
    assert.doesNotMatch(refusal, /Not rhythm data|melody/i);
  } finally { w.done(); }
});

test('[real plugin] a note that is neither a rhythm bar nor a melody bar is still refused in the Beat Box\'s words (the refusal is not swallowed)', async () => {
  const real = await realMusicPlugin();
  const w = await musicTabsWorld(real, { 'bars/bar_030.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"a": 1}\n```\n' });
  try {
    const leaf = await w.restoreTab(RHYTHM_EDIT_VIEW_TYPE, 'bars/bar_030.md'); const tab = w.viewOf(leaf);
    assert.match(tabText(tab), /Edit rhythm: Not rhythm data/);
  } finally { w.done(); }
});

test('[real plugin] "New melody bar": the command makes bars/bar_NNN.md (one past the highest) with the melody template, empty list, and opens it in this tab', async () => {
  const real = await realMusicPlugin(); const { w } = await world(real);
  try {
    const cmd = w.plugin.commands.get('new-melody-bar');
    assert.ok(cmd, 'the command is registered in the music edition of a music vault');
    assert.equal(cmd!.checkCallback!(true), true);
    cmd!.checkCallback!(false); await w.settle(800);
    const made = [...w.store.keys()].filter((k) => k.startsWith('bars/') && !['bars/bar_007.md', 'bars/bar_008.md', MELODY].includes(k));
    assert.deepEqual(made, ['bars/bar_022.md']);
    assert.equal(w.store.get('bars/bar_022.md'), melodyNoteTemplate('bar_022'));
    assert.ok(w.leaves.some((l: any) => l.view?.file?.path === 'bars/bar_022.md' && l.view.getViewType() === RHYTHM_EDIT_VIEW_TYPE), 'it opened in the bar tab');
  } finally { w.done(); }
});

test('[real plugin] a phrase sentence that names a melody bar (its front matter says `melody: true`) is refused at once in one plain sentence', async () => {
  const real = await realMusicPlugin(); const { w } = await world(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_001.md'); const tab = w.viewOf(leaf);
    const n0 = tab.contentEl.querySelectorAll('.forge-chat-msg').length;
    await w.say(tab, 'Extend [[bar_021]] to 4 bars, repeating with fills.');
    const said = [...tab.contentEl.querySelectorAll('.forge-chat-msg')].slice(n0).map((m: any) => m.querySelector('.forge-chat-text')?.textContent ?? '').join(' | ');
    assert.match(said, /A melody bar cannot be used in a phrase yet\./);
    assert.doesNotMatch(said, /Not rhythm data/);
  } finally { w.done(); }
});
