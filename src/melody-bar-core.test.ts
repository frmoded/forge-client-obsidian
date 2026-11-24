// 2026-11-23-1030 (pitch in bars, Stage 1a): the DATA of a melody bar: its pitch names (the person's `Bb4` and music21's `B-4` are one note), its json (the five keys and `notes`, never `channels`), the validator
// (words for every refusal), the pretty-printer (one note a line, byte for byte what the list writes), the note reader and the new-note template. Pure: no Obsidian, no vault.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MELODY_BASE, MELODY_INSTRUMENTS, formatMelodyJson, melodyNoteTemplate, parsePitch, readMelodyNote, validateMelodyData } from './melody-bar-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';

const data = (over: Record<string, unknown> = {}) => ({ time_signature: '4/4', steps: 16, group_size: 4, tempo_bpm: 100, instrument: 'piano', notes: [], ...over });
const note = (step: number, pitch: string, length = 1) => ({ step, pitch, length });

test('a pitch is a letter, an optional # or b (or music21\'s -), and an octave; it is said one way: `Bb4`, `F#3`, `C4`', () => {
  const say = (t: string) => { const p = parsePitch(t); return p.ok ? [p.name, p.midi] : p.message; };
  assert.deepEqual(say('C4'), ['C4', 60]);
  assert.deepEqual(say('G3'), ['G3', 55]);
  assert.deepEqual(say('Bb4'), ['Bb4', 70]);
  assert.deepEqual(say('B-4'), ['Bb4', 70]);            // music21's name for the same note
  assert.deepEqual(say('F#3'), ['F#3', 54]);
  assert.deepEqual(say('C#4'), ['C#4', 61]);
  assert.deepEqual(say('E-3'), ['Eb3', 51]);
  assert.deepEqual(say('Eb3'), ['Eb3', 51]);
  assert.deepEqual(say('bb4'), ['Bb4', 70]);            // the letter's case does not matter, the second b is the flat
  assert.deepEqual(say('b4'), ['B4', 71]);              // a lone b is the note B
  assert.deepEqual(say('a4'), ['A4', 69]);
});

// 2026-11-23-1030 (mutation drain): every letter has its own semitone (D and E were only ever asserted by name), and the top of MIDI is G9 (127): a note above it is refused in words, never given a midi number.
test('every letter is its own semitone, and the notes MIDI does not have are refused in words', () => {
  const midi = (t: string) => { const p = parsePitch(t); return p.ok ? p.midi : p.message; };
  assert.deepEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].map(midi), [60, 62, 64, 65, 67, 69, 71]);
  assert.equal(midi('C0'), 12); assert.equal(midi('Cb0'), 11);
  assert.equal(midi('G9'), 127);                                                   // the highest note MIDI has
  for (const over of ['G#9', 'Ab9', 'A9', 'B9']) { const p = parsePitch(over); assert.equal(p.ok, false, over); if (!p.ok) assert.equal(p.message, `"${over}" is outside the 128 notes MIDI has.`); }
});

test('a name that is not a note with an octave is refused in words that name it', () => {
  for (const bad of ['H4', 'C', '4', 'C#', 'C##4', 'Cbb4', 'C 4', '', 'C10', 'middle C']) {
    const p = parsePitch(bad);
    assert.equal(p.ok, false, bad);
    if (!p.ok) assert.match(p.message, /note name with an octave/, bad);
  }
});

test('the instruments are the small table; the data of a bar validates as a melody bar and comes back with its pitches said one way', () => {
  assert.deepEqual([...MELODY_INSTRUMENTS], ['piano', 'guitar', 'mandolin', 'violin', 'cello']);
  const v = validateMelodyData(data({ instrument: 'cello', notes: [note(9, 'B-4'), note(1, 'G3', 2)] }));
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.value.notes, [note(1, 'G3', 2), note(9, 'Bb4')]);         // sorted by step, canonical names
});

test('every refusal of the validator is in words', () => {
  const bad = (raw: unknown): string => { const v = validateMelodyData(raw); return v.ok ? 'ok' : v.message; };
  assert.match(bad(null), /must be an object/);
  assert.match(bad({ ...data(), channels: {} }), /channels/);                                                     // a melody bar has no channels: it says so
  for (const k of ['time_signature', 'steps', 'group_size', 'tempo_bpm', 'instrument', 'notes']) { const d: Record<string, unknown> = data(); delete d[k]; assert.match(bad(d), new RegExp(`missing required field "${k}"`), k); }
  assert.match(bad(data({ extra: 1 })), /Unexpected field "extra"/);
  assert.match(bad(data({ steps: 0 })), /steps/);
  assert.match(bad(data({ steps: 65 })), /steps/);
  assert.match(bad(data({ group_size: 5 })), /group_size/);
  assert.match(bad(data({ tempo_bpm: 0 })), /tempo_bpm/);
  assert.match(bad(data({ instrument: 'kazoo' })), /piano, guitar, mandolin, violin and cello/);
  assert.match(bad(data({ time_signature: '' })), /time_signature/);
  assert.match(bad(data({ notes: 'G3' })), /notes must be a list/);
  assert.match(bad(data({ notes: [5] })), /note 1/);
  assert.match(bad(data({ notes: [{ step: 1, pitch: 'G3' }] })), /note 1.*length/);
  assert.match(bad(data({ notes: [{ step: 1, pitch: 'G3', length: 1, velocity: 90 }] })), /note 1.*velocity/);
  assert.match(bad(data({ notes: [note(0, 'G3')] })), /note 1.*step/);
  assert.match(bad(data({ notes: [note(17, 'G3')] })), /note 1.*step/);
  assert.match(bad(data({ notes: [note(1, 'G3', 0)] })), /note 1.*length/);
  assert.match(bad(data({ notes: [note(1, 'H3')] })), /note 1.*note name with an octave/);
  assert.match(bad(data({ notes: [note(15, 'G3', 3)] })), /must end inside the bar.*tie across the barline/);
  assert.match(bad(data({ notes: [note(1, 'G3'), note(1, 'D4')] })), /one voice/);
  assert.match(bad(data({ notes: [note(1, 'G3', 4), note(3, 'D4')] })), /one voice/);
  assert.equal(bad(data({ tempo_bpm: 1 })), 'ok');                                                               // the slowest whole tempo is 1; only 0 and below are refused
  assert.equal(bad(data({ tempo_bpm: 0.5 })), 'ok');
  assert.match(bad(data({ tempo_bpm: -3 })), /tempo_bpm must be a positive number, got -3/);
  assert.equal(bad(data({ notes: [note(13, 'G3', 4)] })), 'ok');                                                // ending exactly on the barline is inside the bar
});

test('the pretty-printer: the five keys, then notes, one note a line (the Rhythm Box never reads this)', () => {
  assert.equal(formatMelodyJson(MELODY_BASE), '{\n  "time_signature": "4/4",\n  "steps": 16,\n  "group_size": 4,\n  "tempo_bpm": 100,\n  "instrument": "piano",\n  "notes": []\n}');
  const d = { ...MELODY_BASE, instrument: 'cello', notes: [note(1, 'G3'), note(2, 'D4', 2)] };
  assert.equal(formatMelodyJson(d), '{\n  "time_signature": "4/4",\n  "steps": 16,\n  "group_size": 4,\n  "tempo_bpm": 100,\n  "instrument": "cello",\n  "notes": [\n    { "step": 1, "pitch": "G3", "length": 1 },\n    { "step": 2, "pitch": "D4", "length": 2 }\n  ]\n}');
  assert.deepEqual(JSON.parse(formatMelodyJson(d)), d);
});

test('the new-note template reads back as the base melody bar, carries the list key and the melody mark, and is NOT a rhythm note', () => {
  const t = melodyNoteTemplate('bar_017');
  assert.match(t, /^---\ntype: data\ncontent_type: json\nmelody: true\n/);
  assert.match(t, /\nlines: \[\]\n---/);
  const r = readMelodyNote(t);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.data, MELODY_BASE);
  assert.equal(readRhythmNote(t).ok, false, 'the Beat Box does not read it');
});

test('reading a note: a rhythm bar is not a melody bar, and a melody bar says why it cannot be read', () => {
  const rhythm = '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"time_signature":"4/4","steps":16,"group_size":4,"swing_pct":0,"tempo_bpm":100,"channels":{"kick":[true,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]}}\n```\n';
  const r = readMelodyNote(rhythm);
  assert.equal(r.ok, false);
  assert.equal(readMelodyNote('no front matter').ok, false);
  assert.equal(readMelodyNote(melodyNoteTemplate('bar_001').replace('content_type: json', 'content_type: yaml')).ok, false);
  assert.equal(readMelodyNote(melodyNoteTemplate('bar_001').replace('melody: true', 'melody: true\nread_only: true')).ok, false);
  const broken = melodyNoteTemplate('bar_001').replace('"instrument": "piano"', '"instrument": "kazoo"');
  const b = readMelodyNote(broken);
  assert.equal(b.ok, false);
  if (!b.ok) assert.match(b.message, /instrument/);
  const comma = readMelodyNote(melodyNoteTemplate('bar_001').replace('{', '{,'));
  assert.equal(comma.ok, false);
  if (!comma.ok) assert.match(comma.message, /^The json block is not valid JSON: ./);                         // the parser's own reason follows the words
});
