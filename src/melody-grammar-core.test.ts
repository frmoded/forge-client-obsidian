// 2026-11-23-1030 (pitch in bars, Stage 1a): the SENTENCES of a melody bar's list: read, said and applied by pure functions. Every sentence the grammar says reads back to itself (`renderMelodyLine(parseMelodySentence(s)) === s`),
// every refusal is in words, nothing throws, and the input data is never changed. A melody bar's sentences are not the rhythm bar's: `Hit kick on step 1.` is refused here, `Note G3 on step 1 for 1 step.` is refused there.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MELODY_BASE, type MelodyData } from './melody-bar-core.ts';
import { MELODY_FORMS, applyMelodyLine, headSentence, melodySentencesOf, parseMelodySentence, renderMelodyLine } from './melody-grammar-core.ts';
import { parseBarSentence } from './bar-grammar-core.ts';

const line = (s: string) => { const p = parseMelodySentence(s); if (!p.ok) throw new Error(`${s}: ${p.message}`); return p.line; };
const run = (data: MelodyData, ...sentences: string[]): MelodyData => { let d = data; for (const s of sentences) { const a = applyMelodyLine(d, line(s)); if (!a.ok) throw new Error(`${s}: ${a.message}`); d = a.data; } return d; };
const refused = (data: MelodyData, s: string): string => { const a = applyMelodyLine(data, line(s)); assert.equal(a.ok, false, `${s} should be refused`); return a.ok ? '' : a.message; };
const notes = (d: MelodyData) => d.notes.map((n) => `${n.pitch}@${n.step}x${n.length}`).join(' ');

test('every example form reads, and says itself back (the refusals name these; this is the table the sentence service is given)', () => {
  assert.ok(MELODY_FORMS.length >= 6);
  for (const f of MELODY_FORMS) { const p = parseMelodySentence(f); assert.equal(p.ok, true, f); if (p.ok) assert.equal(renderMelodyLine(p.line), f, `${f} is not canonical`); }
});

test('the head: a melody bar of N steps, with the signature, the tempo and the instrument said or left to their defaults, and its notes after a colon', () => {
  const a = line('Start with a melody bar of 16 steps.');
  assert.equal(renderMelodyLine(a), 'Start with a melody bar of 16 steps in 4/4 at 100 beats per minute for the piano.');
  const b = run(MELODY_BASE, 'Start with a melody bar of 12 steps in 3/4 at 90 beats per minute for the cello: G3 on step 1 for 2 steps, D4 on step 3 for 1 step.');
  assert.equal(b.steps, 12); assert.equal(b.time_signature, '3/4'); assert.equal(b.tempo_bpm, 90); assert.equal(b.instrument, 'cello'); assert.equal(notes(b), 'G3@1x2 D4@3x1');
  assert.equal(run(MELODY_BASE, 'Start with a melody bar of 12 steps.').time_signature, '3/4');             // a grid's usual signature
  assert.equal(run(MELODY_BASE, 'Start with a melody bar of 6 steps.').time_signature, '6/8');
  assert.equal(run(MELODY_BASE, 'Start with a melody bar of 8 steps in groups of 2.').group_size, 2);
  const c = run(MELODY_BASE, 'Start with a melody bar of 16 steps for the Mandolin.');
  assert.equal(c.instrument, 'mandolin');
});

test('the head says a whole bar: headSentence(data) replays to exactly that data (with notes, with a non-default group, with the piano left out of no word)', () => {
  const data: MelodyData = { time_signature: '4/4', steps: 8, group_size: 4, tempo_bpm: 84, instrument: 'violin', notes: [{ step: 1, pitch: 'Bb4', length: 2 }, { step: 5, pitch: 'F#3', length: 4 }] };
  const h = headSentence(data);
  assert.equal(h, 'Start with a melody bar of 8 steps in 4/4 in groups of 4 at 84 beats per minute for the violin: Bb4 on step 1 for 2 steps, F#3 on step 5 for 4 steps.');
  assert.deepEqual(run(MELODY_BASE, h as string), data);
  assert.equal(headSentence({ ...data, group_size: 2 }), 'Start with a melody bar of 8 steps in 4/4 at 84 beats per minute for the violin: Bb4 on step 1 for 2 steps, F#3 on step 5 for 4 steps.');          // the grid's own group is not said
  assert.equal(headSentence({ ...MELODY_BASE, tempo_bpm: 0 }), null);          // data the sentences cannot say
  assert.equal(headSentence(MELODY_BASE), 'Start with a melody bar of 16 steps in 4/4 at 100 beats per minute for the piano.');
});

test('a note: pitch, steps, length; several steps at once; the pitch spelled any way, said one way', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 1 step.', 'Note D4 on steps 2, 6, 10 and 14 for 1 step.', 'note bb4 on step 3', 'Note F#3 on step 4 for 2 steps.');
  assert.equal(notes(d), 'G3@1x1 D4@2x1 Bb4@3x1 F#3@4x2 D4@6x1 D4@10x1 D4@14x1');
  assert.equal(renderMelodyLine(line('Note B-4 on step 5.')), 'Note Bb4 on step 5 for 1 step.');
  assert.equal(renderMelodyLine(line('Note D4 on steps 10, 2 and 6 for 1 step.')), 'Note D4 on steps 2, 6 and 10 for 1 step.');
  assert.equal(renderMelodyLine(line('Note C4 on step 1 for 4 steps.')), 'Note C4 on step 1 for 4 steps.');
});

test('a note that crosses the barline, lies beyond the bar, or meets another note is refused in words, and nothing is changed', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 4 steps.');
  assert.match(refused(d, 'Note C4 on step 15 for 3 steps.'), /must end inside the bar.*tie across the barline/);
  assert.match(refused(d, 'Note C4 on step 17 for 1 step.'), /beyond.*16 steps/);
  assert.match(refused(d, 'Note C4 on step 1 for 1 step.'), /one voice.*step 1 already has G3/);
  assert.match(refused(d, 'Note C4 on step 3 for 1 step.'), /one voice.*starts while G3.*still sounds/);
  assert.match(refused(d, 'Note C4 on steps 5 and 6 for 2 steps.'), /one voice/);           // the new notes meet each other
  assert.equal(notes(d), 'G3@1x4');
  assert.equal(notes(run(d, 'Note G3 on step 1 for 4 steps.')), 'G3@1x4');                    // the very note that is there is not a second one: it says nothing new
  assert.match(refused(MELODY_BASE, 'Note C4 on step 9 for 9 steps.'), /must end inside the bar/);
});

test('a rest silences steps (a note that starts inside goes, one that sounds into it is cut short); clear takes away the note that STARTS on a step', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 4 steps.', 'Note D4 on step 5 for 2 steps.', 'Note B4 on step 9 for 1 step.');
  assert.equal(notes(run(d, 'Rest on step 3.')), 'G3@1x2 D4@5x2 B4@9x1');
  assert.equal(notes(run(d, 'Rest on step 5 for 2 steps.')), 'G3@1x4 B4@9x1');
  assert.equal(notes(run(d, 'Rest on step 2 for 7 steps.')), 'G3@1x1 B4@9x1');
  assert.equal(notes(run(d, 'Rest on step 1.')), 'D4@5x2 B4@9x1');
  assert.equal(notes(run(d, 'Rest on step 12.')), notes(d));                                // nothing sounds there: the same bar
  assert.equal(renderMelodyLine(line('Rest on step 3.')), 'Rest on step 3.');
  assert.equal(renderMelodyLine(line('rest on step 3 for 2 steps')), 'Rest on step 3 for 2 steps.');
  assert.match(refused(d, 'Rest on step 17.'), /beyond.*16 steps/);
  assert.match(refused(d, 'Rest on step 15 for 3 steps.'), /beyond|inside the bar/);
  assert.equal(notes(run(d, 'Clear step 5.')), 'G3@1x4 B4@9x1');
  assert.equal(notes(run(d, 'Clear steps 5 and 9.')), 'G3@1x4');
  assert.equal(renderMelodyLine(line('clear steps 9, 5')), 'Clear steps 5 and 9.');
  assert.match(refused(d, 'Clear step 2.'), /No note starts on step 2/);
  assert.match(refused(d, 'Clear step 20.'), /beyond.*16 steps/);
});

test('instrument and tempo: the table, the range the Beat Box plays', () => {
  assert.equal(run(MELODY_BASE, 'Set the instrument to cello.').instrument, 'cello');
  assert.equal(run(MELODY_BASE, 'set the instrument to the Violin').instrument, 'violin');
  const kazoo = parseMelodySentence('Set the instrument to kazoo.'); assert.equal(kazoo.ok, false); if (!kazoo.ok) assert.match(kazoo.message, /piano, guitar, mandolin, violin and cello/);
  assert.equal(run(MELODY_BASE, 'Set the tempo to 72.').tempo_bpm, 72);
  assert.match(refused(MELODY_BASE, 'Set the tempo to 300.'), /40 to 240/);
  assert.match(refused(MELODY_BASE, 'Set the tempo to 72.5.'.replace(/\.$/, '')), /whole number/);
  assert.equal(renderMelodyLine(line('Set the instrument to the cello.')), 'Set the instrument to cello.');
});

test('the head replaces everything; a head whose notes do not fit is refused in the head\'s own words', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 1 step.', 'Start with a melody bar of 8 steps.');
  assert.equal(d.steps, 8); assert.equal(notes(d), '');
  const p = parseMelodySentence('Start with a melody bar of 8 steps in 4/4 at 100 beats per minute for the piano: G3 on step 8 for 2 steps.');
  assert.equal(p.ok, false);
  if (!p.ok) assert.match(p.message, /must end inside the bar/);
  const q = parseMelodySentence('Start with a melody bar of 7 steps.');
  assert.equal(q.ok, false);
  if (!q.ok) assert.match(q.message, /no grid of 7 steps/);
});

test('what is not read: a rhythm bar\'s words, other verbs, half a sentence; each in words naming what to say instead; never a throw', () => {
  for (const s of ['Hit kick on steps 1, 5 and 9.', 'Clear kick.', 'Add the channel hihat.', 'Shift every channel one step to the left.', 'Mirror every channel.']) {
    const p = parseMelodySentence(s);
    assert.equal(p.ok, false, s);
    if (!p.ok) assert.match(p.message, /melody bar/i, s);
  }
  assert.equal(parseBarSentence('Note G3 on step 1 for 1 step.').ok, false, 'and the rhythm bar does not read a melody word');
  const cases: Array<[string, RegExp]> = [
    ['Note H3 on step 1.', /note name with an octave/], ['Note G3 on step 0.', /Steps count from 1/], ['Note G3.', /could not read/], ['Note G3 on step 1 for 0 steps.', /at least 1 step/],
    ['Rest on step 0.', /Steps count from 1/], ['Clear step.', /could not read/], ['Set the instrument to .', /instrument/], ['Dance on step 1.', /do not know how to read/], ['', /nothing to read/],
  ];
  for (const [s, re] of cases) { const p = parseMelodySentence(s); assert.equal(p.ok, false, s); if (!p.ok) assert.match(p.message, re, s); }
  for (const junk of [null, undefined, 5, {}, '\u0000', 'Note '.repeat(1000)]) assert.doesNotThrow(() => parseMelodySentence(junk as never));
});

test('typed text splits into sentences; a full stop between digits stays; the line numbers stay with the sentence', () => {
  assert.deepEqual(melodySentencesOf('Note G3 on step 1. Set the tempo to 72.5. Rest on step 3'), ['Note G3 on step 1.', 'Set the tempo to 72.5.', 'Rest on step 3.']);
});

test('applying never changes its input and never throws', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 1 step.');
  const before = JSON.stringify(d);
  for (const s of ['Note C4 on step 2.', 'Clear step 1.', 'Rest on step 1.', 'Set the tempo to 80.', 'Set the instrument to cello.', 'Start with a melody bar of 8 steps.']) applyMelodyLine(d, line(s));
  assert.equal(JSON.stringify(d), before);
  assert.doesNotThrow(() => applyMelodyLine(null as never, { kind: 'tempo', bpm: 80 }));
  assert.equal(applyMelodyLine(null as never, { kind: 'tempo', bpm: 80 }).ok, false);
});

// 2026-11-23-1030 (mutation drain): where a refusal points (the column the strip underlines), what a head says about an instrument it does not know, and the words of a clear that names the note sounding there.
test('a refusal points at the word that is wrong: the column of the length, of the step, of the instrument; a head that is not read points at its start', () => {
  const at = (s: string) => { const p = parseMelodySentence(s); assert.equal(p.ok, false, s); return p.ok ? null : p; };
  assert.deepEqual([at('Note G3 on step 1 for 0 steps.')?.message, at('Note G3 on step 1 for 0 steps.')?.column], ['A note is at least 1 step long.', 19]);
  assert.deepEqual([at('Note G3 on step 0.')?.message, at('Note G3 on step 0.')?.column], ['Steps count from 1.', 12]);
  assert.deepEqual([at('Rest on step 0.')?.message, at('Rest on step 0.')?.column], ['Steps count from 1.', 9]);
  assert.deepEqual([at('Rest on step 1 for 0 steps.')?.message, at('Rest on step 1 for 0 steps.')?.column], ['A rest is at least 1 step long.', 16]);
  assert.deepEqual([at('Clear step 0.')?.message, at('Clear step 0.')?.column], ['Steps count from 1.', 7]);
  const kazoo = at('Set the instrument to kazoo.');
  assert.deepEqual([kazoo?.message, kazoo?.column], ['kazoo is not an instrument here; the instruments are piano, guitar, mandolin, violin and cello.', 23]);
  const head = at('Start with a melody bar.');
  assert.equal(head?.column, 1); assert.match(head?.message ?? '', /^A melody bar's head reads like: Start with a melody bar of 16 steps/);
  const grid = at('Start with a melody bar of 7 steps.');
  assert.equal(grid?.column, 1);
});

test('a head with an instrument that is not in the table is refused in the instrument words, at the instrument; a tempo out of range in the tempo words', () => {
  const p = parseMelodySentence('Start with a melody bar of 16 steps for the kazoo.');
  assert.equal(p.ok, false);
  if (!p.ok) { assert.equal(p.message, 'kazoo is not an instrument here; the instruments are piano, guitar, mandolin, violin and cello.'); assert.equal(p.column, 45); }
  const q = parseMelodySentence('Start with a melody bar of 16 steps at 300 beats per minute.');
  assert.equal(q.ok, false);
  if (!q.ok) assert.equal(q.message, 'The tempo is a whole number of beats per minute from 40 to 240.');
  assert.equal(parseMelodySentence('Start with a melody bar of 16 steps at 40 beats per minute.').ok, true);
  assert.equal(parseMelodySentence('Start with a melody bar of 16 steps at 240 beats per minute.').ok, true);
  assert.equal(parseMelodySentence('Start with a melody bar of 16 steps at 39 beats per minute.').ok, false);
  assert.equal(parseMelodySentence('Start with a melody bar of 16 steps at 72.5 beats per minute.').ok, false);
});

test('clear names the note that sounds on a step no note starts on (the one that sounds THERE, not an earlier one), and says nothing more when none sounds', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 1 step.', 'Note D4 on step 3 for 4 steps.');
  assert.equal(refused(d, 'Clear step 5.'), 'No note starts on step 5; the D4 sounding there starts on step 3.');
  assert.equal(refused(d, 'Clear step 2.'), 'No note starts on step 2.');                                    // G3 starts earlier but has ended
  assert.equal(refused(d, 'Clear step 9.'), 'No note starts on step 9.');
  assert.equal(refused(d, 'Clear steps 3 and 5.'), 'No note starts on step 5; the D4 sounding there starts on step 3.');
});

test('a rest keeps every note that starts before it and cuts the one sounding into it; a note starting exactly on the rest goes', () => {
  const d = run(MELODY_BASE, 'Note G3 on step 1 for 1 step.', 'Note D4 on step 3 for 2 steps.', 'Note B4 on step 6 for 1 step.');
  assert.equal(notes(run(d, 'Rest on step 3.')), 'G3@1x1 B4@6x1');                                            // the note that starts ON the rest goes
  assert.equal(notes(run(d, 'Rest on step 4.')), 'G3@1x1 D4@3x1 B4@6x1');                                     // the one sounding into it is cut where it begins
  assert.equal(notes(run(d, 'Rest on step 2.')), 'G3@1x1 D4@3x2 B4@6x1');                                    // nothing sounds at step 2: nothing changes
});
