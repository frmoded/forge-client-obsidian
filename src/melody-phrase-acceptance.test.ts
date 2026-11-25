// 2026-11-24-1031 (pitch in bars, Stage 1b) - THE ACCEPTANCE TEST: the first TEN measures of Bach's Cello Suite No. 1 (BWV 1007, the Prelude) as ten melody bars (bar_101 .. bar_110) written ONLY by sentences, ONE phrase (phrase_101: `Repeat [[bar_101]] for 10 bars.`
// and nine `Bar N is replaced by [[bar_10N]].`) and ONE composition (comp_101: `Play [[phrase_101]].`), all through the REAL description controller and composer (the in-memory vault of melody-acceptance.test.ts), the REAL engine (Pyodide with the vendored
// music21 and the bundled lib.py, the Python text the plugin runs) and the REAL Verovio (the plugin's own `prepareScore`):
//   * the Score of the phrase AND of the composition has ONE staff, ten bars, 160 notes, the cello's program; the MIDI note numbers Verovio writes are the MusicXML's first ten measures, in order (read from the real file when this machine has it);
//   * undo, redo and a reload of the phrase and of the composition; Keep and Copy (with its place words) on the melody phrase draw the bars the list says;
//   * the Inspector: the bar map (annotatePhraseXml) ties each of the ten bars to the phrase and to the bar it was forked to, and says nothing about channels; the single-bar map (provenance-core) is never reached;
//   * an ARRANGEMENT of a melody phrase (written by hand, bypassing the sentence) is the engine's plain refusal; a rhythm phrase and a rhythm composition next to them are what they were (the engine's digest and the bars).
// The notes are read from scores/prelude_bwv1007_trimmed.md of the scratch vault bwv1007-mock (read, never written; the data check skips with a reason when it is not on this machine).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as baseTest } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { melodyNoteTemplate } from './melody-bar-core.ts';
import { inspectMelodyNote } from './melody-list-core.ts';
import { emptyCompositionNote, emptyPhraseNote, emptyArrangementNote } from './empty-note-core.ts';
import { PHRASE_STYLES, barsOfPayload, noteContentFor, producePhraseNote, type PhraseParams } from './phrase-core.ts';
import { annotatePhraseXml, phraseLineageOf, phraseProvenance } from './phrase-lineage-core.ts';
import { annotateCompositionPayload } from './composition-nav-core.ts';
import { phraseDepsWithSources, produceComposition, type CompositionDeps } from './composition-core.ts';
import { produceArrangement, newArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { newKitNote } from './kit-core.ts';
import { readPhraseNote } from './phrase-core.ts';
import { renumberMeasures } from './bar-numbers-core.ts';
import { dedupeTempoMarks } from './tempo-marks-core.ts';
import { WHEELS_PRESENT, computePhrase, engine } from './test-support/real-rhythm-engine.ts';
import { dialogLast } from './test-support/dialog-view.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 600_000 }, fn);
const win: any = new Window({ url: 'http://localhost/' });

const PRELUDE = [
  'G3 D4 B4 A4 B4 D4 B4 D4 G3 D4 B4 A4 B4 D4 B4 D4', 'G3 E4 C5 B4 C5 E4 C5 E4 G3 E4 C5 B4 C5 E4 C5 E4', 'G3 F#4 C5 B4 C5 F#4 C5 F#4 G3 F#4 C5 B4 C5 F#4 C5 F#4',
  'G3 G4 B4 A4 B4 G4 B4 G4 G3 G4 B4 A4 B4 G4 B4 F#4', 'G3 E4 B4 A4 B4 G4 F#4 G4 E4 G4 F#4 G4 B3 D4 C#4 B3', 'C#4 G4 A4 G4 A4 G4 A4 G4 C#4 G4 A4 G4 A4 G4 A4 G4',
  'F#4 A4 D5 C#5 D5 A4 G4 A4 F#4 A4 G4 A4 D4 F#4 E4 D4', 'E3 B3 G4 F#4 G4 B3 G4 B3 E3 B3 G4 F#4 G4 B3 G4 B3', 'E3 C#4 D4 E4 D4 C#4 B3 A3 G4 F#4 E4 D5 C#5 B4 A4 G4', 'F#4 E4 D4 D5 A4 D5 F#4 A4 D4 E4 F#4 A4 G4 F#4 E4 D4',
].map((l) => l.split(' '));
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (p: string): number => (Number(p[p.length - 1]) + 1) * 12 + SEMI[p[0]] + (p[1] === '#' ? 1 : p[1] === 'b' ? -1 : 0);
const EXPECTED_MIDI = PRELUDE.flat().map(midiOf);
const BARS = PRELUDE.map((_, i) => `bar_${101 + i}`);
const MELODY_VAULT = { ...PHRASE_VAULT, bars: [...(PHRASE_VAULT.bars as string[]), ...BARS], phrases: [...(PHRASE_VAULT.phrases as string[]), 'phrase_101'], compositions: [...(PHRASE_VAULT.compositions as string[]), 'comp_101'], melody: BARS, melodyPhrases: ['phrase_101'] };

function rigOver(store: Map<string, string>, notePath: string) {
  let calls = 0; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { calls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    vault: () => MELODY_VAULT, barNames: () => MELODY_VAULT.bars as string[], phraseNames: () => MELODY_VAULT.phrases as string[],
    setTimer: () => 0, clearTimer: () => {}, trace: () => {}, panes: () => panes, composerMenu: () => ({ items: [], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: notePath, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const say = async (s: string) => { field().value = s; field().dispatchEvent(new win.Event('input', { bubbles: true })); await press({ key: 'Enter' }); await press({ key: 'Enter' }); };
  const undo = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  return { say, undo, ready: async () => { await ctl.inspect(notePath); await flush(); }, calls: () => calls, said: () => dialogLast(el) };
}

/** The sentences of a bar of sixteenths: the cello, then one `Note` per pitch (the steps of a pitch said once, in a list). */
function sentencesFor(pitches: string[]): string[] {
  const at = new Map<string, number[]>(); pitches.forEach((p, i) => at.set(p, [...(at.get(p) ?? []), i + 1]));
  return ['Set the instrument to cello.', ...[...at].map(([p, steps]) => `Note ${p} on ${steps.length === 1 ? `step ${steps[0]}` : `steps ${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`} for 1 step.`)];
}

// ---- MIDI and Verovio, as melody-acceptance.test.ts reads them -------------------------------------------------------------------------------------------------------------------------------------------------
function midiEvents(base64: string): { notes: number[]; programs: number[] } {
  const b = Buffer.from(base64, 'base64'); let o = 14; const ons: Array<{ t: number; n: number; i: number }> = []; const programs: number[] = []; let seq = 0;
  const vlq = (): number => { let v = 0, c: number; do { c = b[o++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80); return v; };
  while (o < b.length) {
    if (b.toString('latin1', o, o + 4) !== 'MTrk') break;
    const end = o + 8 + b.readUInt32BE(o + 4); o += 8; let t = 0, running = 0;
    while (o < end) {
      t += vlq(); let s = b[o];
      if (s === 0xff) { o += 2; const len = vlq(); o += len; continue; }
      if (s === 0xf0 || s === 0xf7) { o += 1; const len = vlq(); o += len; continue; }
      if (s & 0x80) { running = s; o++; } else s = running;
      const kind = s & 0xf0;
      if (kind === 0xc0) { programs.push(b[o]); o += 1; } else if (kind === 0xd0) o += 1;
      else { if (kind === 0x90 && b[o + 1] > 0) ons.push({ t, n: b[o], i: seq++ }); o += 2; }
    }
    o = end;
  }
  return { notes: ons.sort((a, c) => a.t - c.t || a.i - c.i).map((x) => x.n), programs };
}
let _toolkit: Promise<any> | null = null;
async function verovio(): Promise<any> {
  _toolkit ??= (async () => { const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any; return new VerovioToolkit(await create()); })();
  return _toolkit;
}
interface Engraved { xml: string; staves: number; noteHeads: number; measures: number; midi: { notes: number[]; programs: number[] } }
async function engrave(payload: any): Promise<Engraved> {
  assert.equal(payload.type, 'musicxml'); assert.equal(payload.has_percussion ?? false, false, 'a melody Score is not a percussion Score');
  const xml: string = payload.content; const tk = await verovio();
  tk.setOptions({ adjustPageHeight: true, breaks: 'none', pageWidth: 6000, scale: 40 }); tk.loadData(dedupeTempoMarks(renumberMeasures(xml)));
  let svg = ''; for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  const measures = (xml.match(/<measure /g) ?? []).length;
  return { xml, staves: (svg.match(/class="staff"/g) ?? []).length / measures, noteHeads: (svg.match(/class="notehead"/g) ?? []).length, measures, midi: midiEvents(tk.renderToMIDI()) };          // a staff is drawn once per bar: its count over the bars is the number of staves
}

function depsOf(py: any, files: Map<string, string>): CompositionDeps {
  const base = { readNote: async (p: string) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title) };
  const computeArrangement = async (data: unknown, title: string) => computePhrase(py, data, { kind: 'arrangement' }, title);
  const compute = async (data: unknown, title: string) => computePhrase(py, data, { kind: 'composition' }, title);
  return { phrases: phraseDepsWithSources(base, { computeArrangement, computeComposition: compute }), compute, computeArrangement };
}

test('the data check: the first ten measures of the real MusicXML are the bars below (read-only; skipped with a plain reason when the scratch vault is not on this machine)', async (t) => {
  const file = path.join(os.homedir(), 'forge-vaults/bwv1007-mock/scores/prelude_bwv1007_trimmed.md');
  if (!fs.existsSync(file)) { t.skip('the bwv1007-mock vault is not on this machine'); return; }
  const xml = /```xml\n([\s\S]*?)```/.exec(fs.readFileSync(file, 'utf8'))![1];
  const measures = [...xml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].slice(0, 10).map((m) => [...m[2].matchAll(/<note>([\s\S]*?)<\/note>/g)].map((n) => `${/<step>(\w)/.exec(n[1])![1]}${/<alter>1</.test(n[1]) ? '#' : ''}${/<alter>-1</.test(n[1]) ? 'b' : ''}${/<octave>(\d)/.exec(n[1])![1]}`));
  assert.deepEqual(measures, PRELUDE);
});

test('ACCEPTANCE: ten melody bars, one phrase, one composition: ONE staff, ten bars, 160 notes, the MIDI numbers of the real measures in order; undo, redo, reload; Keep and Copy; the Inspector maps ten bars; a rhythm phrase is unchanged', async () => {
  const py = await engine();
  const store = new Map<string, string>([['bars/bar_001.md', PLAYGROUND_BARS['bar_001']], ['bars/bar_005.md', PLAYGROUND_BARS['bar_005']], ['phrases/phrase_001.md', noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 3, style: 'repeat_with_fills', tempo_change_pct: 0 })]]);
  const rhythmBefore = [...store].map(([k, v]) => [k, v]);

  // 1. the ten melody bars, by sentences only
  for (const [i, pitches] of PRELUDE.entries()) {
    const p = `bars/${BARS[i]}.md`; store.set(p, melodyNoteTemplate(BARS[i]));
    const r = rigOver(store, p); await r.ready();
    for (const s of sentencesFor(pitches)) await r.say(s);
    const insp = inspectMelodyNote(store.get(p)!);
    assert.equal(insp.inSync, true, BARS[i]); assert.deepEqual(insp.replay.data.notes.map((n) => n.pitch), pitches, BARS[i]);
  }

  // 2. the phrase: the plain repeat and nine replaced bars
  const PH = 'phrases/phrase_101.md'; store.set(PH, emptyPhraseNote('phrase_101'));
  const ph = rigOver(store, PH); await ph.ready();
  await ph.say('Repeat [[bar_101]] for 10 bars.');
  for (let n = 2; n <= 10; n++) await ph.say(`Bar ${n} is replaced by [[bar_${100 + n}]].`);
  const phraseNote = store.get(PH)!;
  assert.match(phraseNote, /\nmelody: true\n/);
  const read = readPhraseNote(phraseNote); assert.equal(read.ok, true);
  assert.equal((read as any).value.style, 'repeat'); assert.equal(Object.keys((read as any).value.overrides).length, 9);

  const deps = depsOf(py, store).phrases;
  const drawn = await producePhraseNote(deps, phraseNote, 'phrase_101');
  assert.equal(drawn.kind, 'score', drawn.kind === 'score' ? '' : (drawn as any).message);
  const payload = (drawn as any).payload;
  const e = await engrave(payload);
  assert.equal((e.xml.match(/<part id=/g) ?? []).length, 1, 'ONE part'); assert.equal(e.staves, 1, 'ONE staff in the engraving');
  assert.equal(e.measures, 10, 'ten bars'); assert.equal(e.noteHeads, 160, '160 notes');
  assert.deepEqual(e.midi.notes, EXPECTED_MIDI, 'the MIDI note numbers are the real measures, in order');
  assert.deepEqual(e.midi.programs, [42], 'the cello, once');
  assert.match(e.xml, /<midi-program>43<\/midi-program>/); assert.equal((e.xml.match(/<clef>/g) ?? []).length, 1, 'one clef for the whole line');
  assert.equal((e.xml.match(/<per-minute>/g) ?? []).length, 1, 'the tempo is written once (it never changes)');

  // 3. the composition plays it
  const CO = 'compositions/comp_101.md'; store.set(CO, emptyCompositionNote('comp_101'));
  const co = rigOver(store, CO); await co.ready();
  await co.say('Play [[phrase_101]].');
  const compNote = store.get(CO)!;
  const comp = await produceComposition(depsOf(py, store), compNote, 'comp_101');
  assert.equal(comp.kind, 'score', comp.kind === 'score' ? '' : (comp as any).message);
  const ce = await engrave((comp as any).payload);
  assert.equal(ce.staves, 1, 'the composition: ONE staff'); assert.equal(ce.measures, 10); assert.equal(ce.noteHeads, 160);
  assert.deepEqual(ce.midi.notes, EXPECTED_MIDI); assert.deepEqual(ce.midi.programs, [42]);
  // twice through, and cut: Play for 4 bars then repeat
  await co.say('Repeat that once more.');
  const twice = await produceComposition(depsOf(py, store), store.get(CO)!, 'comp_101'); assert.equal(twice.kind, 'score');
  assert.equal((await engrave((twice as any).payload)).midi.notes.length, 320);
  await co.undo(); assert.equal(store.get(CO), compNote, 'undo takes the repeat back');

  // 4. undo, redo, reload of the phrase
  await ph.undo();
  const undone = await producePhraseNote(deps, store.get(PH)!, 'phrase_101');
  assert.equal(undone.kind, 'score');
  const un = await engrave((undone as any).payload);
  assert.deepEqual(un.midi.notes, [...EXPECTED_MIDI.slice(0, 144), ...EXPECTED_MIDI.slice(0, 16)], 'undone: bar 10 is bar 1 again, one staff');
  assert.equal(un.staves, 1);
  await ph.undo(true); assert.equal(store.get(PH), phraseNote, 'redone: the very same note');
  const again = rigOver(store, PH); await again.ready();
  assert.equal(again.calls(), 0, 'opening writes nothing'); assert.equal(store.get(PH), phraseNote);
  assert.deepEqual((await engrave(((await producePhraseNote(deps, store.get(PH)!, 'phrase_101')) as any).payload)).midi.notes, EXPECTED_MIDI, 'the reloaded phrase draws the same');
  // Keep and Copy (with its place words) on a melody phrase: bar_103 six times, bar 2 replaced by bar_104, then the steps (forks number the bars AFTER the steps, as for every phrase)
  const P2 = 'phrases/phrase_102.md'; store.set(P2, emptyPhraseNote('phrase_102'));
  const steps = rigOver(store, P2); await steps.ready();
  await steps.say('Repeat [[bar_103]] for 6 bars.'); await steps.say('Bar 2 is replaced by [[bar_104]].'); await steps.say('Keep bars 1 to 4.');
  const b103 = PRELUDE[2].map(midiOf), b104 = PRELUDE[3].map(midiOf);
  const kept = await producePhraseNote(deps, store.get(P2)!, 'phrase_102'); assert.equal(kept.kind, 'score', (kept as any).message);
  const ke = await engrave((kept as any).payload);
  assert.deepEqual(ke.midi.notes, [...b103, ...b104, ...b103, ...b103]); assert.equal(ke.staves, 1); assert.equal(ke.measures, 4);
  await steps.say('Copy bar 1 and put it at the end.'); await steps.say('Bar 5 is replaced by [[bar_105]].');
  const copied = await producePhraseNote(deps, store.get(P2)!, 'phrase_102'); assert.equal(copied.kind, 'score', (copied as any).message);
  const b105 = PRELUDE[4].map(midiOf);
  assert.deepEqual((await engrave((copied as any).payload)).midi.notes, [...b103, ...b104, ...b103, ...b103, ...b105], 'five bars: the copy is at the end, and the fork lies over the bars the steps made');
  await steps.say('Move bar 1 one bar right.');
  const moved = await producePhraseNote(deps, store.get(P2)!, 'phrase_102'); assert.equal(moved.kind, 'score', (moved as any).message);
  assert.equal((await engrave((moved as any).payload)).measures, 5);
  const listed = store.get(P2)!;
  for (let i = 0; i < 3; i++) await steps.undo();
  assert.notEqual(store.get(P2), listed, 'three undos took three lines back');
  assert.equal((await engrave(((await producePhraseNote(deps, store.get(P2)!, 'phrase_102')) as any).payload)).measures, 4, 'back to the Keep: four bars');

  // 5. the Inspector: the bar map of the phrase's Score (what the phrase tab and the composition tab build) ties each of the ten bars; nothing is said about channels
  const params = (read as any).value;
  const tagged = annotatePhraseXml(payload.content, null, 10);
  assert.equal(tagged.ok, true, tagged.ok ? '' : tagged.problems.join(' | '));
  if (tagged.ok) {
    const map = phraseProvenance('phrases/phrase_101', params, tagged.bars);
    assert.equal(Object.keys(map).length, 10, 'ten bars, ten entries');
    const lineage = (n: number) => phraseLineageOf(map[tagged.bars[n - 1].id]).map((x) => x.text).join(' | ');
    assert.match(lineage(1), /bar 1 of 10/); assert.match(lineage(3), /forked: edited in bar_103 \(was made by phrase_101, repeat\)/);
    for (let n = 1; n <= 10; n++) assert.doesNotMatch(lineage(n), /channel|hit|kick|snare/i);
    console.info(`[1031 inspector] bar 3 of the melody phrase says: ${lineage(3)}`);
  }
  const cmap = annotateCompositionPayload('compositions/comp_101', (comp as any).payload);
  assert.deepEqual(cmap.problems, [], 'the composition\'s Inspector maps its ten bars'); assert.equal(Object.keys(cmap.map).length, 10);
  assert.equal(barsOfPayload(payload)!.length, 10);

  // 6. an ARRANGEMENT of a melody phrase (the sentence refuses it; written by hand it reaches the engine, which refuses in plain words)
  const arrFiles = new Map(store); arrFiles.set('kits/rock.md', newKitNote({ kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] }));
  const arr: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_101' }] };
  const arrOut = await produceArrangement({ phrases: depsOf(py, arrFiles).phrases, compute: depsOf(py, arrFiles).computeArrangement }, newArrangementNote('arr_101', arr), 'arr_101');
  assert.notEqual(arrOut.kind, 'score');
  assert.match((arrOut as any).message, /a kit plays beats, not notes/); assert.doesNotMatch((arrOut as any).message, /Not rhythm data|channels/);
  const arrSay = rigOver(new Map([['arrangements/arr_101.md', emptyArrangementNote('arr_101')]]), 'arrangements/arr_101.md'); await arrSay.ready();
  await arrSay.say('Play [[phrase_101]] on the [[rock]] kit.'); assert.match(arrSay.said(), /A melody phrase cannot be played on a kit/);
  console.info(`[1031 arrangement] the engine says: ${(arrOut as any).message}`);

  // 7. a rhythm phrase and a rhythm composition next to them: the rhythm notes were never touched, and they draw as the rhythm path always did
  assert.deepEqual([...store].filter(([k]) => rhythmBefore.some(([b]) => b === k)).map(([k, v]) => [k, v]), rhythmBefore, 'the rhythm bar and phrase notes are byte for byte what they were');
  const rhythm = await producePhraseNote(deps, store.get('phrases/phrase_001.md')!, 'phrase_001'); assert.equal(rhythm.kind, 'score');
  assert.equal((rhythm as any).payload.has_percussion, true); assert.equal(barsOfPayload((rhythm as any).payload)!.length, 3);
  assert.deepEqual([...PHRASE_STYLES], ['repeat_with_fills', 'building', 'ghost_notes']);
  store.set('compositions/comp_002.md', emptyCompositionNote('comp_002'));
  const rc = rigOver(store, 'compositions/comp_002.md'); await rc.ready(); await rc.say('Play [[phrase_001]] for 4 bars.');
  const rcomp = await produceComposition(depsOf(py, store), store.get('compositions/comp_002.md')!, 'comp_002'); assert.equal(rcomp.kind, 'score');
  assert.equal(barsOfPayload((rcomp as any).payload)!.length, 4); assert.equal((rcomp as any).payload.has_percussion, true);
});
