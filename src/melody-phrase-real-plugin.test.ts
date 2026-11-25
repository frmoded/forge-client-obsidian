// 2026-11-24-1031 (pitch in bars, Stage 1b) - A MELODY PHRASE AND A COMPOSITION OF IT in the REAL plugin (the real ForgePlugin.onload from the real music bundle, the real phrase and composition views, the real description controller, composer and dialog, an in-memory vault
// that delivers `modify` after a write as Obsidian does, a metadata cache that reads the notes' front matter): in a phrase tab `Repeat [[bar_021]] for 3 bars.` and `Bar 2 is replaced by [[bar_022]].` write the note (with `melody: true`) and the
// Score is asked for the melody data (named here so the mutation runner's map runs this slow test for a mutant of src/phrase-dom.ts, src/phrase-core.ts and src/phrase-grammar-core.ts); what works on hits is refused in the dialog in plain words; a composition tab
// plays the phrase and an arrangement tab refuses it in words; a rhythm phrase tab next to them is what it was.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PHRASE_VIEW_TYPE } from './phrase-core.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { musicTabsWorld, realMusicPlugin } from './test-support/music-tabs-world.ts';

const withNotes = (name: string, notes: string): string => melodyNoteTemplate(name).replace('"notes": []', `"notes": ${notes}`);
const FILES = { 'bars/bar_021.md': withNotes('bar_021', '[{ "step": 1, "pitch": "G3", "length": 2 }]'), 'bars/bar_022.md': withNotes('bar_022', '[{ "step": 1, "pitch": "A3", "length": 2 }]'), 'phrases/phrase_101.md': emptyPhraseNote('phrase_101'), 'compositions/comp_101.md': emptyCompositionNote('comp_101') };
const said = (tab: any, n0: number): string => [...tab.contentEl.querySelectorAll('.forge-chat-msg')].slice(n0).map((m: any) => m.querySelector('.forge-chat-text')?.textContent ?? '').join(' | ');
const count = (tab: any): number => tab.contentEl.querySelectorAll('.forge-chat-msg').length;

async function world(real: Awaited<ReturnType<typeof realMusicPlugin>>) {
  const w = await musicTabsWorld(real, FILES);
  const asked: Array<{ data: any; params: any }> = [];
  real.setPyodideHostSingleton({ getInstance: async () => ({
    computePhraseScore: async (data: any, params: any) => { asked.push({ data: JSON.parse(JSON.stringify(data)), params: JSON.parse(JSON.stringify(params)) }); const bars = params.kind === 'composition' ? data.sections.flatMap((s: any) => s.bars) : Array.from({ length: params.bars ?? 1 }, () => data); return { type: 'musicxml', content: '<score-partwise><x/></score-partwise>', bars_data: bars }; },
    computeRhythmScore: async () => ({ type: 'musicxml', content: '<score-partwise><x/></score-partwise>' }),
  }) });
  return { w, asked };
}

test('[real plugin] a phrase tab: Repeat [[bar_021]] for 3 bars. and a replaced bar write the note (`melody: true`, the list, style repeat) and the Score is asked for the melody data with the repeat', async () => {
  const real = await realMusicPlugin(); const { w, asked } = await world(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_101.md'); const tab = w.viewOf(leaf);
    await w.say(tab, 'Repeat [[bar_021]] for 3 bars.'); await w.say(tab, 'Bar 2 is replaced by [[bar_022]].');
    await w.settle(1500);
    const note = w.store.get('phrases/phrase_101.md')!;
    assert.match(note, /\nmelody: true\n/); assert.match(note, /1\. Repeat \[\[bar_021\]\] for 3 bars\.\n2\. Bar 2 is replaced by \[\[bar_022\]\]\./);
    assert.match(note, /"style": "repeat"/); assert.match(note, /"overrides": \{\n?\s*"2": "bars\/bar_022"/);
    const last = asked[asked.length - 1];
    assert.ok(last, 'the engine was asked for the phrase');
    assert.equal(last.params.style, 'repeat'); assert.equal('channels' in last.data, false); assert.deepEqual(last.data.notes, [{ step: 1, pitch: 'G3', length: 2 }]);
    assert.deepEqual(last.params.override_bars['2'].notes, [{ step: 1, pitch: 'A3', length: 2 }]);
    assert.doesNotMatch(String(tab.contentEl.textContent ?? ''), /Not rhythm data/);
  } finally { w.done(); }
});

test('[real plugin] in the phrase tab what works on hits is refused in the dialog in plain words, nothing is written, and the Beat Box\'s words are never said', async () => {
  const real = await realMusicPlugin(); const { w } = await world(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_101.md'); const tab = w.viewOf(leaf);
    await w.say(tab, 'Repeat [[bar_021]] for 3 bars.'); await w.settle(800);
    const written = w.store.get('phrases/phrase_101.md')!;
    for (const s of ['Extend [[bar_021]] to 4 bars, repeating with fills.', 'Make it 20 percent slower.', 'Thin out bars 1 to 2, by half, keeping the downbeat.', 'Bar 2 is replaced by [[bar_007]].']) {
      const n0 = count(tab); await w.say(tab, s);
      const text = said(tab, n0);
      assert.match(text, /That works on beats, not on notes\.|A phrase is all rhythm bars or all melody bars/, `${s}: ${text}`);
      assert.doesNotMatch(text, /Not rhythm data|channels|Beat Box|cannot be used in a phrase yet/i, s);
    }
    assert.equal(w.store.get('phrases/phrase_101.md'), written, 'nothing was written');
  } finally { w.done(); }
});

test('[real plugin] a COMPOSITION tab plays the melody phrase through the existing sentence; the engine is asked for the melody bars', async () => {
  const real = await realMusicPlugin(); const { w, asked } = await world(real);
  try {
    const p = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_101.md'); await w.say(w.viewOf(p), 'Repeat [[bar_021]] for 3 bars.'); await w.settle(800);
    const { COMPOSITION_VIEW_TYPE } = await import('./composition-core.ts');
    const leaf = await w.restoreTab(COMPOSITION_VIEW_TYPE, 'compositions/comp_101.md'); const tab = w.viewOf(leaf);
    await w.say(tab, 'Play [[phrase_101]] for 2 bars.'); await w.settle(1500);
    assert.match(w.store.get('compositions/comp_101.md')!, /1\. Play \[\[phrase_101\]\] for 2 bars\./);
    const comp = asked.filter((a) => a.params.kind === 'composition').pop();
    assert.ok(comp, 'the engine was asked for the composition'); assert.equal(comp!.data.sections[0].bars.length, 3); assert.ok(comp!.data.sections[0].bars.every((b: any) => Array.isArray(b.notes) && !('channels' in b)));
    const n0 = count(tab); await w.say(tab, 'Then play [[phrase_001]] for 2 bars.');
    assert.match(said(tab, n0), /A composition plays beats or notes, not both/);
  } finally { w.done(); }
});

test('[real plugin] a rhythm phrase tab next to them is what it was: its sentences, its note (no `melody` line), the engine asked for the bar as rhythm data', async () => {
  const real = await realMusicPlugin(); const { w, asked } = await world(real);
  try {
    const leaf = await w.restoreTab(PHRASE_VIEW_TYPE, 'phrases/phrase_001.md'); const tab = w.viewOf(leaf);
    await w.settle(800);
    await w.say(tab, 'Make it 20 percent slower.'); await w.settle(1200);
    const note = w.store.get('phrases/phrase_001.md')!;
    assert.doesNotMatch(note, /melody/); assert.match(note, /"style": "repeat_with_fills"/); assert.match(note, /"tempo_change_pct": -20/);
    assert.ok(asked.some((a) => a.params.style === 'repeat_with_fills' && 'channels' in a.data));
  } finally { w.done(); }
});
