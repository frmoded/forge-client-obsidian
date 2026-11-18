// 2026-11-19-0910 - BUG (CCQA weekly 2026-11-18, screenshot 07-C6): a composition LOOP was applied, not refused. comp_002 plays comp_001 (applied); in comp_001 the sentence `Play [[comp_002]]` showed "The grammar read your sentence. This is what would be
// written" and was applied, and the Score then said the composition could not be drawn. The 1206 contract: the loop is refused BEFORE any preview, naming both notes. The check (compositionLoopRefusal) was asked on ONE path only, the SERVICE's answer
// (askNewKind); every other path that can write a composition recipe skipped it. This file pins that EVERY path runs the same check once, before any preview and before any write:
//   1. a sentence typed in the box and read by the GRAMMAR (the screenshot's path)      2. the Description edited in the note (the debounced auto-apply: "Update from Description")
//   3. the RECIPE edited by hand ("Update from Recipe")                                 4. the PYTHON edited by hand (a known shape maps back)       5. the SERVICE's plan (already checked: pinned so it stays)
// plus the deep chain (more than 6), P3 (a composition that does not loop, and a vault without compositions, are unchanged on every path), and the wording that names both notes. The draw-time message of composition-core.ts stays as the second guard.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogButtons, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { newCompositionNote, readCompositionNote, type CompositionParams } from './composition-core.ts';
import { formatPhraseJson, type PhraseParams } from './phrase-core.ts';
import { newPhraseNote } from './phrase-notes-core.ts';
import { compositionLoopRefusal } from './sentence-plan-families-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const COMP = 'compositions/song_1.md';
const song = (name: string, ...plays: string[]): string => newCompositionNote(name, { kind: 'composition', sections: plays.map((source) => ({ source })) });
const sectionsOf = (text: string): string[] => { const r = readCompositionNote(text); assert.ok(r.ok, 'the note still reads'); return (r as any).value.sections.map((s: any) => s.source); };
const replaceSection = (text: string, heading: string, body: string): string => text.replace(new RegExp(`(# ${heading}\\n\\n)[\\s\\S]*?(\\n\\n# )`), `$1${body}$2`);

function rig(opts: { extra: Record<string, string>; own?: string; compositions?: string[]; service?: () => Promise<{ status: number; json: unknown }> }) {
  const store = new Map<string, string>([[COMP, opts.own ?? song('song_1', 'phrases/phrase_003')], ...Object.entries(opts.extra)]);
  const writes: string[] = [], reads: string[] = [], timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { reads.push(p); const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007'], phrases: ['phrase_001', 'phrase_003'], arrangements: [], compositions: opts.compositions ?? ['song_1', 'song_2', 'song_3', 'song_4', 'song_5', 'song_6', 'song_7', 'song_8'], kits: ['rock'] }),
    barNames: () => ['bar_007'], phraseNames: () => ['phrase_001', 'phrase_003'],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
    trace: () => {}, panes: () => panes,
    ...(opts.service !== undefined ? { askPlan: async () => opts.service!(), configured: () => true } : {}),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path: COMP, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 120; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  const runTimers = async () => { const t = timers.splice(0); for (const fn of t) fn(); await flush(); };
  return { ctl, store, writes, reads, el, flush, type, enter, runTimers, ready: async () => { await ctl.inspect(COMP); await flush(); }, strip: () => dialogLast(el), buttons: () => dialogButtons(el), entries: () => dialogEntries(el), own: () => store.get(COMP)! };
}

const LOOPS_BACK = /song_2.*song_1|song_1.*song_2/;                                   // the refusal names BOTH notes
const song2PlaysSong1 = { 'compositions/song_2.md': song('song_2', 'compositions/song_1') };

// ---- the five paths ---------------------------------------------------------------------------------------------------------------------------------------------------------------
test('PATH 1, the screenshot: a sentence typed in the box and read by the GRAMMAR is refused BEFORE any preview, naming both notes; nothing is written, not even by a second Enter', async () => {
  const r = rig({ extra: song2PlaysSong1 }); await r.ready();
  r.type('Play [[song_2]].'); await r.enter();
  assert.match(r.strip(), /^Refused: The composition song_2 loops back to this composition: song_1 → song_2 → song_1\.$/); assert.match(r.strip(), LOOPS_BACK);
  assert.ok(!r.entries().some((e) => /The grammar read your sentence/.test(e.text)), 'no "this is what would be written" for a loop'); assert.deepEqual(r.buttons(), []);
  await r.enter(); assert.deepEqual(r.writes, [], 'a second Enter writes nothing'); assert.deepEqual(sectionsOf(r.own()), ['phrases/phrase_003']);
  assert.ok(r.reads.includes('compositions/song_2.md'), 'the vault was asked for song_2\'s sections');
});

test('PATH 2: the Description edited in the note (the debounced "Update from Description") is not applied when it loops: the note keeps its sections, nothing is written for the sentence', async () => {
  const r = rig({ extra: song2PlaysSong1 }); await r.ready();
  r.store.set(COMP, replaceDescriptionSection(r.own(), 'Play [[song_2]].')!); r.ctl.modified(COMP); await r.runTimers();
  assert.deepEqual(sectionsOf(r.own()), ['phrases/phrase_003'], 'the json cache still says what the note played before'); assert.deepEqual(r.writes, [], 'no write at all');
});

test('PATH 3: the Recipe edited by hand ("Update from Recipe") is not applied when it loops', async () => {
  const r = rig({ extra: song2PlaysSong1 }); await r.ready();
  r.store.set(COMP, replaceSection(r.own(), 'Recipe', 'Play [[song_2]].')); r.ctl.modified(COMP); await r.runTimers();
  assert.deepEqual(sectionsOf(r.own()), ['phrases/phrase_003']); assert.deepEqual(r.writes, []);
});

test('PATH 4: the Python edited by hand (a shape the grammar knows maps back) is not applied when it loops', async () => {
  const r = rig({ extra: song2PlaysSong1 }); await r.ready();
  r.store.set(COMP, r.own().replace("sections.append({'source': 'phrase_003', 'bars': phrase_003()})", "sections.append({'source': 'song_2', 'bars': song_2()})")); r.ctl.modified(COMP); await r.runTimers();
  assert.deepEqual(sectionsOf(r.own()), ['phrases/phrase_003']); assert.deepEqual(r.writes, []);
});

test('PATH 5, the service (already checked since 1206): the plan is refused before the preview, with the same words', async () => {
  const plan = { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'composition', sections: [{ source: 'compositions/song_2' }] }, error: null, version: '0.2.48' } };
  const r = rig({ extra: song2PlaysSong1, service: async () => plan }); await r.ready();
  r.type('first song two, whatever that is, then nothing at all'); await r.enter();
  assert.match(r.strip(), /^The service refused: The composition song_2 loops back to this composition: song_1 → song_2 → song_1\.$/); assert.deepEqual(r.writes, []); assert.deepEqual(r.buttons(), []);
});

test('the same pure check, once per path: a three-note loop (song_1 plays song_2, song_2 plays song_3, song_3 plays song_1) names the whole trail; a self loop keeps its own words; the deep rule (more than 6) is refused the same way', async () => {
  const three = rig({ extra: { 'compositions/song_2.md': song('song_2', 'compositions/song_3'), 'compositions/song_3.md': song('song_3', 'compositions/song_1') } }); await three.ready();
  three.type('Play [[song_2]].'); await three.enter();
  assert.match(three.strip(), /^Refused: The composition song_2 loops back to this composition: song_1 → song_2 → song_3 → song_1\.$/);
  const self = rig({ extra: {} }); await self.ready(); self.type('Play [[song_1]].'); await self.enter();
  assert.match(self.strip(), /^Refused: The composition "song_1" cannot play itself; that would loop\.$/);
  const chain: Record<string, string> = {}; for (let i = 2; i <= 7; i++) chain[`compositions/song_${i}.md`] = song(`song_${i}`, `compositions/song_${i + 1}`); chain['compositions/song_8.md'] = song('song_8', 'phrases/phrase_001');
  const deep = rig({ extra: chain }); await deep.ready(); deep.type('Play [[song_2]].'); await deep.enter();
  assert.match(deep.strip(), /^Refused: The composition song_\d is nested more than 6 deep: song_1 → song_2 → .*\.$/); assert.deepEqual(deep.writes, []);
});

// ---- P3: nothing changes for what does not loop ---------------------------------------------------------------------------------------------------------------------------------------
test('P3: a composition that does NOT loop (song_1 plays song_2, song_2 plays a phrase) is unchanged on every path: the grammar previews and applies, the Description, Recipe and Python edits apply', async () => {
  const fine = { 'compositions/song_2.md': song('song_2', 'phrases/phrase_001') };
  const box = rig({ extra: fine }); await box.ready(); box.type('Play [[song_2]].'); await box.enter();
  assert.match(box.strip(), /The grammar read your sentence\. This is what would be written\./); assert.deepEqual(box.buttons(), ['apply-preview', 'cancel-preview']); assert.deepEqual(box.writes, []);
  await box.enter(); assert.deepEqual(sectionsOf(box.own()), ['compositions/song_2'], 'the second Enter writes it');
  const desc = rig({ extra: fine }); await desc.ready(); desc.store.set(COMP, replaceDescriptionSection(desc.own(), 'Play [[song_2]].')!); desc.ctl.modified(COMP); await desc.runTimers(); assert.deepEqual(sectionsOf(desc.own()), ['compositions/song_2']);
  const rec = rig({ extra: fine }); await rec.ready(); rec.store.set(COMP, replaceSection(rec.own(), 'Recipe', 'Play [[song_2]].')); rec.ctl.modified(COMP); await rec.runTimers(); assert.deepEqual(sectionsOf(rec.own()), ['compositions/song_2']);
  const py = rig({ extra: fine }); await py.ready(); py.store.set(COMP, py.own().replace("sections.append({'source': 'phrase_003', 'bars': phrase_003()})", "sections.append({'source': 'song_2', 'bars': song_2()})")); py.ctl.modified(COMP); await py.runTimers(); assert.deepEqual(sectionsOf(py.own()), ['compositions/song_2']);
});

test('P3: a vault without compositions and a PHRASE note are unaffected (no composition is read, a phrase sentence still previews and applies)', async () => {
  const ext: PhraseParams = { kind: 'extend', source: 'bar_007', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }; const note = newPhraseNote('phrase_003', ext, formatPhraseJson(ext));
  const store = new Map<string, string>([['phrases/phrase_003.md', note]]); const reads: string[] = []; const panes: any[] = [];
  const ports: DescriptionPorts = { read: async (p) => { reads.push(p); return store.get(p)!; }, process: async (p, fn) => { store.set(p, fn(store.get(p)!)); }, vault: () => ({ bars: [], phrases: ['phrase_003'], arrangements: [], compositions: [], kits: ['rock'] }), barNames: () => [], phraseNames: () => ['phrase_003'], setTimer: () => 0, clearTimer: () => {}, trace: () => {}, panes: () => panes };
  const ctl = createDescriptionController(ports); await ctl.inspect('phrases/phrase_003.md');
  assert.ok(reads.every((p) => p.startsWith('phrases/')), 'no composition note is read for a phrase');
});

test('the wording is the pure function\'s: both notes and the trail, composed once (pinned on the function itself, so no path can say it differently)', async () => {
  const read = async (id: string) => (id === 'compositions/song_2' ? [{ source: 'compositions/song_1' }] : null);
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: [{ source: 'compositions/song_2' }] }, read), 'The composition song_2 loops back to this composition: song_1 → song_2 → song_1.');
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: [{ source: 'compositions/song_1' }] }, read), 'The composition "song_1" cannot play itself; that would loop.');
  assert.equal(await compositionLoopRefusal('compositions/song_1', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }, read), null, 'a phrase never loops');
});
