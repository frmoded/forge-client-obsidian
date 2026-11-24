// 2026-11-23-1030 (pitch in bars, Stage 1a) - THE ACCEPTANCE TEST: the first two bars of Bach's Cello Suite No. 1 (BWV 1007, the Prelude), as TWO melody bars written ONLY by sentences, through the REAL description controller and composer (the in-memory vault of
// melody-list-wiring.test.ts), then the REAL engine (Pyodide with the vendored music21 and the bundled lib.py, the very Python text the plugin runs) and the REAL Verovio (the plugin's own `prepareScore`):
//   * the list replays; the Score has ONE staff with those pitches and durations (sixteenths) and the treble clef; the MusicXML carries the cello's `midi-program` (43: MusicXML counts from 1);
//   * the MIDI Verovio writes has those note numbers in order (G3 = 55, D4 = 62, B4 = 71, A4 = 69) and the cello's program change (42);
//   * undo and redo; a reload (a NEW controller over the same vault) keeps it; a rhythm bar next to it is byte for byte what it was.
// The notes are those of the MusicXML of prompt 1029 (the scratch vault bwv1007-mock, scores/prelude_bwv1007_trimmed.md, bars 1 and 2: read, never written, by the data check at the top).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as baseTest } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { melodyNoteTemplate, readMelodyNote, type MelodyData } from './melody-bar-core.ts';
import { inspectMelodyNote } from './melody-list-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { renumberMeasures } from './bar-numbers-core.ts';
import { dedupeTempoMarks } from './tempo-marks-core.ts';
import { WHEELS_PRESENT, compute, engine } from './test-support/real-rhythm-engine.ts';
import { dialogEntries } from './test-support/dialog-view.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const win: any = new Window({ url: 'http://localhost/' });

const BAR_1 = 'G3 D4 B4 A4 B4 D4 B4 D4'.split(' '), BAR_2 = 'G3 E4 C5 B4 C5 E4 C5 E4'.split(' ');
const MIDI_1 = [55, 62, 71, 69, 71, 62, 71, 62], MIDI_2 = [55, 64, 72, 71, 72, 64, 72, 64];
const P1 = 'bars/bar_021.md', P2 = 'bars/bar_022.md', RHYTHM = 'bars/bar_001.md';

/** The sentences of a bar of sixteenths, one per pitch (a pitch repeated is one sentence with the steps in a list): what a person types. */
function sentencesFor(pitches: string[]): string[] {
  const at = new Map<string, number[]>();
  [...pitches, ...pitches].forEach((p, i) => at.set(p, [...(at.get(p) ?? []), i + 1]));
  return [...at].map(([p, steps]) => `Note ${p} on ${steps.length === 1 ? `step ${steps[0]}` : `steps ${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}`} for 1 step.`);
}

function vault() {
  const store = new Map<string, string>([[P1, melodyNoteTemplate('bar_021')], [P2, melodyNoteTemplate('bar_022')], [RHYTHM, PLAYGROUND_BARS['bar_001']]]);
  return store;
}
function rigOver(store: Map<string, string>, path: string) {
  let calls = 0; const timers: Array<() => void> = []; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { calls++; await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    vault: () => PHRASE_VAULT, barNames: () => PHRASE_VAULT.bars as string[], phraseNames: () => PHRASE_VAULT.phrases as string[],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, panes: () => panes,
    composerMenu: () => ({ items: [], run: () => {} }),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const say = async (sentence: string) => { field().value = sentence; field().dispatchEvent(new win.Event('input', { bubbles: true })); await press({ key: 'Enter' }); await press({ key: 'Enter' }); };
  const undo = (shift = false) => press({ key: shift ? 'Z' : 'z', metaKey: true, shiftKey: shift });
  return { ctl, say, undo, ready: async () => { await ctl.inspect(path); await flush(); }, said: () => dialogEntries(el).map((e) => e.text), calls: () => calls, el };
}

// ---- a MIDI file, read: the note-ons in time order and the program changes ---------------------------------------------------------------------------------------------------------------------------------------
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
async function verovio(): Promise<any> {
  const create = ((await import('verovio/wasm')) as any).default; const { VerovioToolkit } = (await import('verovio/esm')) as any;
  return new VerovioToolkit(await create());
}
interface Engraved { xml: string; svg: string; staves: number; noteHeads: number; midi: { notes: number[]; programs: number[] } }
async function engrave(note: string, title: string): Promise<Engraved> {
  const r = readMelodyNote(note); assert.equal(r.ok, true); const data = (r as { value: { data: MelodyData } }).value.data;
  const payload = compute(await engine(), data, title);
  assert.equal(payload.type, 'musicxml'); assert.equal(payload.has_percussion ?? false, false, 'a melody Score is not a percussion Score');
  const xml: string = payload.content;
  const tk = await verovio();
  tk.setOptions({ adjustPageHeight: true, breaks: 'none', pageWidth: 2400, scale: 40 }); tk.loadData(dedupeTempoMarks(renumberMeasures(xml)));
  let svg = ''; for (let p = 1; p <= tk.getPageCount(); p++) svg += tk.renderToSVG(p);
  return { xml, svg, staves: (svg.match(/class="staff"/g) ?? []).length, noteHeads: (svg.match(/class="notehead"/g) ?? []).length, midi: midiEvents(tk.renderToMIDI()) };
}
/** The notes of the MusicXML in order: [step+alter, octave, duration-in-divisions, type]. */
function xmlNotes(xml: string): string[] { return [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => { const g = (re: RegExp) => re.exec(m[1])?.[1] ?? ''; return m[1].includes('<rest') ? 'rest' : `${g(/<step>(\w)/)}${({ '1': '#', '-1': 'b' } as Record<string, string>)[g(/<alter>(-?\d)/)] ?? ''}${g(/<octave>(\d)/)} ${g(/<type>(\w+)/)}`; }); }

test('the data check: bars 1 and 2 of the Prelude in the MusicXML of prompt 1029 are the notes below (read-only, skipped with a plain reason when the scratch vault is not on this machine)', async (t) => {
  const file = path.join(os.homedir(), 'forge-vaults/bwv1007-mock/scores/prelude_bwv1007_trimmed.md');
  if (!fs.existsSync(file)) { t.skip('the bwv1007-mock vault is not on this machine'); return; }
  const xml = /```xml\n([\s\S]*?)```/.exec(fs.readFileSync(file, 'utf8'))![1];
  const measures = [...xml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].slice(0, 2).map((m) => [...m[2].matchAll(/<note>([\s\S]*?)<\/note>/g)].map((n) => `${/<step>(\w)/.exec(n[1])![1]}${/<alter>1</.test(n[1]) ? '#' : ''}${/<alter>-1</.test(n[1]) ? 'b' : ''}${/<octave>(\d)/.exec(n[1])![1]}`));
  assert.deepEqual(measures[0], [...BAR_1, ...BAR_1]); assert.deepEqual(measures[1], [...BAR_2, ...BAR_2]);
});

test('ACCEPTANCE: bars 1 and 2 of BWV 1007 by sentences only: the list replays, ONE staff, the pitches and sixteenths, the treble clef, the cello\'s program, the MIDI note numbers in order, undo and redo, reload, and the rhythm bar untouched', async () => {
  const store = vault(); const rhythmBefore = store.get(RHYTHM);
  const bars: Array<[string, string, string[], number[]]> = [[P1, 'bar_021', BAR_1, MIDI_1], [P2, 'bar_022', BAR_2, MIDI_2]];
  for (const [p, name, pitches, midi] of bars) {
    const r = rigOver(store, p); await r.ready();
    await r.say('Set the instrument to cello.');
    for (const s of sentencesFor(pitches)) await r.say(s);
    const note = store.get(p)!;
    const lines = readBarLines(note)!.lines;
    assert.equal(lines.length, 1 + new Set(pitches).size, `${name}: the cello line and one line per pitch: ${lines.join(' | ')}`);
    assert.match(lines[0], /^Set the instrument to cello\./);
    const insp = inspectMelodyNote(note);
    assert.equal(insp.inSync, true); assert.equal(insp.replay.stop, null);
    assert.deepEqual(insp.replay.data.notes.map((n) => n.pitch), [...pitches, ...pitches]);
    assert.ok(insp.replay.data.notes.every((n, i) => n.step === i + 1 && n.length === 1));

    const e = await engrave(note, name);
    assert.equal((e.xml.match(/<part id=/g) ?? []).length, 1, `${name}: ONE part`);
    assert.equal(e.staves, 1, `${name}: ONE staff in the engraving`);
    assert.equal(e.noteHeads, 16, `${name}: sixteen notes`);
    assert.deepEqual(xmlNotes(e.xml), [...pitches, ...pitches].map((p) => `${p} 16th`), `${name}: the pitches, each a sixteenth`);
    assert.match(e.xml, /<clef>\s*<sign>G<\/sign>\s*<line>2<\/line>/, `${name}: the treble clef`);
    assert.match(e.xml, /<midi-program>43<\/midi-program>/, `${name}: the cello`);
    assert.deepEqual(e.midi.notes, [...midi, ...midi], `${name}: the MIDI note numbers, in order`);
    assert.deepEqual(e.midi.programs, [42], `${name}: Verovio's MIDI carries the cello program change (42, zero-based)`);
    assert.match(e.xml, /<per-minute>100<\/per-minute>/);

    // undo takes the last sentence back and the Score follows; redo puts it back, byte for byte
    await r.undo();
    const undone = await engrave(store.get(p)!, name);
    assert.ok(undone.midi.notes.length < e.midi.notes.length, `${name}: undone: fewer notes`); assert.equal(undone.staves, 1);
    await r.undo(true);
    assert.equal(store.get(p), note, `${name}: redone: the very same note`);
    assert.deepEqual((await engrave(store.get(p)!, name)).midi.notes, e.midi.notes);

    // a RELOAD: a new controller over the same vault (the plugin restarted): the list is what it was, the bar replays the same, and writing nothing
    const again = rigOver(store, p); await again.ready();
    assert.equal(again.calls(), 0, `${name}: opening writes nothing`); assert.equal(store.get(p), note);
    assert.deepEqual(inspectMelodyNote(store.get(p)!).replay.data, insp.replay.data);
    await again.say('Set the tempo to 80.');
    assert.equal(inspectMelodyNote(store.get(p)!).replay.data.tempo_bpm, 80); assert.equal(inspectMelodyNote(store.get(p)!).replay.data.notes.length, 16);
    await again.undo(); assert.equal(store.get(p), note, `${name}: after a reload Cmd+Z still takes the new sentence back (the list kept the history it can: the last line)`);
  }
  assert.equal(store.get(RHYTHM), rhythmBefore, 'the rhythm bar next to them is byte for byte what it was');
});

test('the melody bar names its notes the way a person writes them: Bb4, B-4, F#3, C#4, E-3 reach the engine as the same MIDI numbers (70, 70, 54, 61, 51) and the Score spells them', async () => {
  const store = new Map([[P1, melodyNoteTemplate('bar_021')]]); const r = rigOver(store, P1); await r.ready();
  for (const s of ['Note Bb4 on step 1.', 'Note B-4 on step 2.', 'Note F#3 on step 3.', 'Note C#4 on step 4.', 'Note E-3 on step 5.']) await r.say(s);
  const e = await engrave(store.get(P1)!, 'spelling');
  assert.deepEqual(e.midi.notes, [70, 70, 54, 61, 51]);
  assert.deepEqual(xmlNotes(e.xml).slice(0, 5), ['Bb4 16th', 'Bb4 16th', 'F#3 16th', 'C#4 16th', 'Eb3 16th']);
});
