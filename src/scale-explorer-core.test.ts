// 2026-11-04-1170 (Scale Explorer 1 of 4): the pure half of the `forge-scale` block — the parser, the scale table, the spelling rule, the degree numbers, the staff input and the sound plan. Pure: no DOM, no engine, no Obsidian.
// The table is checked against music21 in scale-explorer-engine.test.ts. Pins the PROPERTY (spelling follows the key signature, no double accidentals for the 24 plain keys), not the table's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCALE_OPTIONS,
  SCALE_TYPES,
  degreeLabels,
  keySignatureFifths,
  parseScaleExplorerSource,
  playEndMs,
  playEvents,
  SCALE_TYPE_LABELS,
  scaleMusicXML,
  scaleNotes,
  scalePitches,
  tonicNamesFor,
  type ScaleType,
} from './scale-explorer-core.ts';

const names = (tonic: string, type: ScaleType): string => scaleNotes(tonic, type, 4).slice(0, 7).map((n) => n.name.replace(/\d+$/, '')).join(' ');

// ---- the parser -------------------------------------------------------------------------------------------------------------------------------------------------

test('an empty block is the defaults: C major, octave 4, piano + staff + numbers, controls on', () => {
  const r = parseScaleExplorerSource('');
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.options, DEFAULT_SCALE_OPTIONS);
  assert.deepEqual(DEFAULT_SCALE_OPTIONS, { tonic: 'C', scale: 'major', octave: 4, show: { piano: true, staff: true, numbers: true }, controls: true, mode: 'scale', chord: 'major' });
});

test('every option, in any order, case-insensitive, blank lines and CRLF ignored', () => {
  const r = parseScaleExplorerSource('\r\nScale: Harmonic Minor\r\n\r\ntonic: A\r\noctave: 3\r\nshow: staff, numbers, piano\r\ncontrols: no\r\n');
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.options, { tonic: 'A', scale: 'harmonic minor', octave: 3, show: { piano: true, staff: true, numbers: true }, controls: false, mode: 'scale', chord: 'major' });
});

test('show picks the parts; "numbers" alone is refused (it labels the piano)', () => {
  const only = parseScaleExplorerSource('show: staff');
  assert.ok(only.ok);
  if (only.ok) assert.deepEqual(only.options.show, { piano: false, staff: true, numbers: false });
  const pn = parseScaleExplorerSource('show: piano');
  assert.ok(pn.ok);
  if (pn.ok) assert.deepEqual(pn.options.show, { piano: true, staff: false, numbers: false });
  const bad = parseScaleExplorerSource('show: numbers');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.message, /numbers.*piano/);
});

test('tonics: a letter and at most one # or b (also ♯ ♭), lower-case letter allowed, kept as spelled', () => {
  for (const [src, want] of [['C', 'C'], ['c#', 'C#'], ['Db', 'Db'], ['bb', 'Bb'], ['b', 'B'], ['F♯', 'F#'], ['E♭', 'Eb']] as const) {
    const r = parseScaleExplorerSource(`tonic: ${src}`);
    assert.ok(r.ok, src);
    if (r.ok) assert.equal(r.options.tonic, want, src);
  }
});

test('scale names and their aliases', () => {
  const want: Record<string, ScaleType> = {
    major: 'major', ionian: 'major', minor: 'natural minor', 'natural minor': 'natural minor', aeolian: 'natural minor',
    'harmonic minor': 'harmonic minor', 'melodic minor': 'melodic minor', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian',
  };
  for (const [src, type] of Object.entries(want)) {
    const r = parseScaleExplorerSource(`scale: ${src}`);
    assert.ok(r.ok, src);
    if (r.ok) assert.equal(r.options.scale, type, src);
  }
  assert.deepEqual([...SCALE_TYPES], ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'natural minor', 'locrian', 'harmonic minor', 'melodic minor']);
});

test('every bad line is refused with a message that quotes the line or the value', () => {
  const bad = (src: string, re: RegExp): void => {
    const r = parseScaleExplorerSource(src);
    assert.equal(r.ok, false, src);
    if (!r.ok) assert.match(r.message, re, src);
  };
  bad('tonic C', /Unrecognised line "tonic C"/);
  bad('just words', /Unrecognised line "just words"/);
  bad('key: C', /Unknown option "key"/);
  bad('tonic: C\ntonic: D', /"tonic" is given twice/);
  bad('tonic: H', /tonic.*"H"/);
  bad('tonic: C##', /tonic.*"C##"/);
  bad('tonic: ', /tonic.*""/);
  bad('scale: bogus', /scale.*"bogus"/);
  bad('scale: blues', /scale.*"blues"/);
  bad('octave: x', /octave.*"x"/);
  bad('octave: 0', /octave.*"0"/);
  bad('octave: 7', /octave.*"7"/);
  bad('octave: 4.5', /octave.*"4.5"/);
  bad('show: piano, drums', /show.*"drums"/);
  bad('show: ', /show.*""/);
  bad('controls: maybe', /controls.*"maybe"/);
});

test('controls: yes / no / true / false', () => {
  for (const [v, want] of [['yes', true], ['no', false], ['true', true], ['false', false], ['YES', true]] as const) {
    const r = parseScaleExplorerSource(`controls: ${v}`);
    assert.ok(r.ok, v);
    if (r.ok) assert.equal(r.options.controls, want, v);
  }
});

// ---- the scale table ------------------------------------------------------------------------------------------------------------------------------------------

test('C major and the pitch list the staff is built from', () => {
  assert.deepEqual(scalePitches('C', 'major', 4), ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
  assert.deepEqual(scalePitches('C', 'major', 3), ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']);
});

test('the octave number moves at C, not at the tonic: A major from A4 reaches C#5', () => {
  assert.deepEqual(scalePitches('A', 'major', 4), ['A4', 'B4', 'C#5', 'D5', 'E5', 'F#5', 'G#5', 'A5']);
});

test('midi numbers: middle C is 60, Cb4 is B3 (59), B#4 is C5 (72)', () => {
  assert.equal(scaleNotes('C', 'major', 4)[0].midi, 60);
  assert.equal(scaleNotes('Cb', 'major', 4)[0].midi, 59);
  assert.equal(scaleNotes('B#', 'major', 4)[0].midi, 72);
  assert.deepEqual(scaleNotes('C', 'major', 4).map((n) => n.midi), [60, 62, 64, 65, 67, 69, 71, 72]);
});

test('the 12 major keys are spelled by their key signature: letters in order, no double accidentals', () => {
  const want: Record<string, string> = {
    C: 'C D E F G A B', Db: 'Db Eb F Gb Ab Bb C', D: 'D E F# G A B C#', Eb: 'Eb F G Ab Bb C D', E: 'E F# G# A B C# D#', F: 'F G A Bb C D E',
    'F#': 'F# G# A# B C# D# E#', G: 'G A B C D E F#', Ab: 'Ab Bb C Db Eb F G', A: 'A B C# D E F# G#', Bb: 'Bb C D Eb F G A', B: 'B C# D# E F# G# A#',
  };
  for (const [tonic, scale] of Object.entries(want)) assert.equal(names(tonic, 'major'), scale, `${tonic} major`);
  for (const [tonic, scale] of [['C#', 'C# D# E# F# G# A# B#'], ['Gb', 'Gb Ab Bb Cb Db Eb F']] as const) assert.equal(names(tonic, 'major'), scale, `${tonic} major (typed)`);
});

test('the 12 natural-minor keys are spelled by their key signature', () => {
  const want: Record<string, string> = {
    C: 'C D Eb F G Ab Bb', 'C#': 'C# D# E F# G# A B', D: 'D E F G A Bb C', 'D#': 'D# E# F# G# A# B C#', E: 'E F# G A B C D', F: 'F G Ab Bb C Db Eb',
    'F#': 'F# G# A B C# D E', G: 'G A Bb C D Eb F', 'G#': 'G# A# B C# D# E F#', A: 'A B C D E F G', Bb: 'Bb C Db Eb F Gb Ab', B: 'B C# D E F# G A',
  };
  for (const [tonic, scale] of Object.entries(want)) assert.equal(names(tonic, 'natural minor'), scale, `${tonic} natural minor`);
  assert.equal(names('Eb', 'natural minor'), 'Eb F Gb Ab Bb Cb Db', 'Eb minor (typed)');
});

test('the other scale types, spelled with one letter per degree', () => {
  assert.equal(names('C', 'harmonic minor'), 'C D Eb F G Ab B');
  assert.equal(names('A', 'harmonic minor'), 'A B C D E F G#');
  assert.equal(names('A', 'melodic minor'), 'A B C D E F# G#');
  assert.equal(names('C', 'melodic minor'), 'C D Eb F G A B');
  assert.equal(names('D', 'dorian'), 'D E F G A B C');
  assert.equal(names('E', 'phrygian'), 'E F G A B C D');
  assert.equal(names('F', 'lydian'), 'F G A B C D E');
  assert.equal(names('G', 'mixolydian'), 'G A B C D E F');
  assert.equal(names('B', 'locrian'), 'B C D E F G A');
  assert.equal(names('C', 'dorian'), 'C D Eb F G A Bb');
  assert.equal(names('C', 'locrian'), 'C Db Eb F Gb Ab Bb');
});

test('every scale of every type has 8 pitches, one letter per degree, the last an octave above the first', () => {
  for (const type of SCALE_TYPES) {
    for (const tonic of tonicNamesFor(type)) {
      const n = scaleNotes(tonic, type, 4);
      assert.equal(n.length, 8, `${tonic} ${type}`);
      const letters = n.slice(0, 7).map((x) => x.step);
      assert.equal(new Set(letters).size, 7, `${tonic} ${type}: seven different letters`);
      assert.equal(n[7].step, n[0].step);
      assert.equal(n[7].midi - n[0].midi, 12);
      assert.equal(n[7].octave, n[0].octave + 1);
      assert.ok(n.every((x) => Math.abs(x.alter) <= 1), `${tonic} ${type}: no double accidentals`);
    }
  }
});

// ---- the tonic names the dropdown offers -----------------------------------------------------------------------------------------------------------------------------

test('the dropdown names: 12, one per pitch class, the key-signature spelling (major: F#, Db; minor: D#, C#, G#, Bb)', () => {
  assert.deepEqual(tonicNamesFor('major'), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  assert.deepEqual(tonicNamesFor('natural minor'), ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);
  for (const type of SCALE_TYPES) {
    const list = tonicNamesFor(type);
    assert.equal(list.length, 12, type);
    const pcs = new Set(list.map((t) => scaleNotes(t, type, 4)[0].midi % 12));
    assert.equal(pcs.size, 12, `${type}: every pitch class once`);
  }
});

// ---- the key signature the staff gets --------------------------------------------------------------------------------------------------------------------------------

test('key signatures: C# major 7 sharps, F major 1 flat, A minor none, D dorian none, C dorian 2 flats', () => {
  assert.equal(keySignatureFifths('C#', 'major'), 7);
  assert.equal(keySignatureFifths('F', 'major'), -1);
  assert.equal(keySignatureFifths('A', 'natural minor'), 0);
  assert.equal(keySignatureFifths('D', 'dorian'), 0);
  assert.equal(keySignatureFifths('C', 'dorian'), -2);
  assert.equal(keySignatureFifths('F', 'lydian'), 0);
  assert.equal(keySignatureFifths('B', 'locrian'), 0);
  assert.equal(keySignatureFifths('C', 'harmonic minor'), -3, 'harmonic minor wears the natural-minor signature');
  assert.equal(keySignatureFifths('A', 'melodic minor'), 0);
});

test('the 24 plain key signatures', () => {
  const major: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
  for (const [t, f] of Object.entries(major)) assert.equal(keySignatureFifths(t, 'major'), f, `${t} major`);
  const minor: Record<string, number> = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };
  for (const [t, f] of Object.entries(minor)) assert.equal(keySignatureFifths(t, 'natural minor'), f, `${t} minor`);
});

// ---- the degree numbers ---------------------------------------------------------------------------------------------------------------------------------------------

test('degree numbers 1-7 and 8 on top, for each of the 12 majors', () => {
  for (const tonic of tonicNamesFor('major')) {
    const notes = scaleNotes(tonic, 'major', 4);
    assert.deepEqual(notes.map((n) => n.degree), [1, 2, 3, 4, 5, 6, 7, 8], tonic);
    assert.deepEqual(degreeLabels(notes), ['1', '2', '3', '4', '5', '6', '7', '8'], tonic);
  }
});

// ---- the staff input -----------------------------------------------------------------------------------------------------------------------------------------------

const noteTags = (xml: string): { step: string; alter: number; octave: number; accidental: string | null }[] =>
  [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => ({
    step: /<step>(\w)<\/step>/.exec(m[1])![1],
    alter: Number(/<alter>(-?\d)<\/alter>/.exec(m[1])?.[1] ?? 0),
    octave: Number(/<octave>(\d)<\/octave>/.exec(m[1])![1]),
    accidental: /<accidental>([\w-]+)<\/accidental>/.exec(m[1])?.[1] ?? null,
  }));

test('the staff input is one bar of 8 whole notes, the scale\'s own pitch list, a treble clef from octave 4', () => {
  const xml = scaleMusicXML('C', 'major', 4);
  assert.match(xml, /^<\?xml/);
  assert.equal((xml.match(/<measure /g) ?? []).length, 1);
  assert.equal((xml.match(/<type>whole<\/type>/g) ?? []).length, 8);
  assert.match(xml, /<fifths>0<\/fifths>/);
  assert.match(xml, /<sign>G<\/sign>\s*<line>2<\/line>/);
  assert.deepEqual(noteTags(xml).map((n) => `${n.step}${n.octave}`), ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
});

test('the staff pitches are exactly scaleNotes for every type and tonic (the pitch list is the single source)', () => {
  for (const type of SCALE_TYPES) {
    for (const tonic of tonicNamesFor(type)) {
      const want = scaleNotes(tonic, type, 4).map((n) => `${n.step}${n.alter}${n.octave}`);
      assert.deepEqual(noteTags(scaleMusicXML(tonic, type, 4)).map((n) => `${n.step}${n.alter}${n.octave}`), want, `${tonic} ${type}`);
    }
  }
});

test('bass clef below octave 4', () => {
  assert.match(scaleMusicXML('C', 'major', 3), /<sign>F<\/sign>\s*<line>4<\/line>/);
  assert.match(scaleMusicXML('C', 'major', 4), /<sign>G<\/sign>/);
});

test('the key signature carries the accidentals: C# major writes <fifths>7</fifths> and NO accidental on a note; F major <fifths>-1</fifths> and the B is a flat without a sign', () => {
  const cs = scaleMusicXML('C#', 'major', 4);
  assert.match(cs, /<fifths>7<\/fifths>/);
  assert.ok(noteTags(cs).every((n) => n.accidental === null), 'no accidental signs: the signature has them');
  const f = scaleMusicXML('F', 'major', 4);
  assert.match(f, /<fifths>-1<\/fifths>/);
  assert.ok(noteTags(f).every((n) => n.accidental === null));
  assert.equal(noteTags(f).find((n) => n.step === 'B')!.alter, -1);
});

test('what the signature does not cover is written once: A harmonic minor shows the G sharp, A melodic minor the F sharp and G sharp; a natural after a signature accidental is a natural sign', () => {
  const hm = noteTags(scaleMusicXML('A', 'harmonic minor', 4));
  assert.deepEqual(hm.filter((n) => n.accidental).map((n) => `${n.step}:${n.accidental}`), ['G:sharp']);
  const mm = noteTags(scaleMusicXML('A', 'melodic minor', 4));
  assert.deepEqual(mm.filter((n) => n.accidental).map((n) => `${n.step}:${n.accidental}`), ['F:sharp', 'G:sharp']);
  // C melodic minor: signature 3 flats (Bb Eb Ab); A and B natural are written, the Ab/Bb are not raised away.
  const cm = noteTags(scaleMusicXML('C', 'melodic minor', 4));
  assert.deepEqual(cm.filter((n) => n.accidental).map((n) => `${n.step}:${n.accidental}`), ['A:natural', 'B:natural']);
});

test('a key past seven sharps or flats (G# major) is written with no signature and a sign on every altered note', () => {
  const xml = scaleMusicXML('G#', 'major', 4);
  assert.match(xml, /<fifths>0<\/fifths>/);
  assert.ok(noteTags(xml).filter((n) => n.alter !== 0).every((n) => n.accidental !== null));
  assert.ok(noteTags(xml).some((n) => n.accidental === 'double-sharp'), 'F## is there');
});

// ---- the sound plan ------------------------------------------------------------------------------------------------------------------------------------------------

test('play up sounds the 8 midi numbers in order, one after the other; down is the reverse; together is all at once', () => {
  const midis = scaleNotes('C', 'major', 4).map((n) => n.midi);
  const up = playEvents(midis, 'up');
  assert.deepEqual(up.map((e) => e.midi), midis);
  assert.ok(up.every((e, i) => i === 0 || e.startMs > up[i - 1].startMs), 'strictly later each time');
  assert.equal(up[0].startMs, 0);
  const down = playEvents(midis, 'down');
  assert.deepEqual(down.map((e) => e.midi), [...midis].reverse());
  assert.ok(down.every((e, i) => i === 0 || e.startMs > down[i - 1].startMs));
  const together = playEvents(midis, 'together');
  assert.deepEqual(together.map((e) => e.midi).sort((a, b) => a - b), midis);
  assert.ok(together.every((e) => e.startMs === 0));
  assert.ok(together.every((e) => e.durMs > 0) && up.every((e) => e.durMs > 0));
});

// ---- the gaps the mutation pass found (2026-11-04-1170, 464 mutants: 63 survived at first) ---------------------------------------------------------------------------------

test('PROPERTY: a diatonic scale (major, the six other modes) needs NO accidental sign on the staff, for every tonic the dropdown offers: its key signature IS its own accidentals', () => {
  for (const type of ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'natural minor', 'locrian'] as const) {
    for (const tonic of tonicNamesFor(type)) {
      const xml = scaleMusicXML(tonic, type, 4);
      assert.deepEqual(noteTags(xml).filter((n) => n.accidental !== null), [], `${tonic} ${type} (fifths ${keySignatureFifths(tonic, type)})`);
    }
  }
});

test('key signatures of the modes are their parent major\'s: E phrygian 0 (C major), G mixolydian 0, C mixolydian -1 (F major), D phrygian -2 (Bb major), A lydian 4 (E major)', () => {
  assert.equal(keySignatureFifths('E', 'phrygian'), 0);
  assert.equal(keySignatureFifths('G', 'mixolydian'), 0);
  assert.equal(keySignatureFifths('C', 'mixolydian'), -1);
  assert.equal(keySignatureFifths('D', 'phrygian'), -2);
  assert.equal(keySignatureFifths('A', 'lydian'), 4);
  assert.equal(keySignatureFifths('G', 'major'), 1);
  assert.equal(keySignatureFifths('D', 'major'), 2);
  assert.match(scaleMusicXML('G', 'major', 4), /<fifths>1<\/fifths>/);
});

test('octave bounds: 1 and 6 are accepted, 0 and 7 are not', () => {
  for (const o of [1, 6]) { const r = parseScaleExplorerSource(`octave: ${o}`); assert.ok(r.ok, String(o)); if (r.ok) assert.equal(r.options.octave, o); }
  for (const o of [0, 7]) assert.equal(parseScaleExplorerSource(`octave: ${o}`).ok, false, String(o));
  assert.equal(scaleNotes('B#', 'major', 6)[7].midi, 108, 'the highest scale the block can draw ends on the top key of the piano (C8)');
});

test('a key past seven flats (Fb major) writes flat and double-flat signs: Fb Gb Ab Bbb Cb Db Eb Fb', () => {
  const tags = noteTags(scaleMusicXML('Fb', 'major', 4));
  assert.deepEqual(tags.map((n) => `${n.step}${n.alter}`), ['F-1', 'G-1', 'A-1', 'B-2', 'C-1', 'D-1', 'E-1', 'F-1']);
  assert.deepEqual(tags.map((n) => n.accidental), ['flat', 'flat', 'flat', 'flat-flat', 'flat', 'flat', 'flat', 'flat']);
});

test('the staff input is well-formed MusicXML: balanced tags, one part, one measure, divisions and a hidden 8/1 time, whole notes of 4 divisions', () => {
  const xml = scaleMusicXML('Eb', 'major', 4);
  const stack: string[] = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w-]+)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') assert.equal(stack.pop(), m[2], `closing ${m[2]}`);
    else stack.push(m[2]);
  }
  assert.deepEqual(stack, [], 'every tag closed');
  assert.match(xml, /<score-partwise version="3\.1">[\s\S]*<\/score-partwise>/);
  assert.match(xml, /<part-list><score-part id="P1">/);
  assert.equal((xml.match(/<part id="P1">/g) ?? []).length, 1);
  assert.match(xml, /<attributes>[\s\S]*<divisions>1<\/divisions>[\s\S]*<key><fifths>-3<\/fifths><\/key>[\s\S]*<time print-object="no"><beats>8<\/beats><beat-type>1<\/beat-type><\/time>[\s\S]*<\/attributes>/);
  assert.equal((xml.match(/<duration>4<\/duration>/g) ?? []).length, 8);
});

test('every scale type has its own non-empty label', () => {
  const labels = SCALE_TYPES.map((t) => SCALE_TYPE_LABELS[t]);
  assert.ok(labels.every((l) => typeof l === 'string' && l.length > 3));
  assert.equal(new Set(labels).size, SCALE_TYPES.length);
});

test('the plan ends when its last note ends; an empty plan ends at 0', () => {
  assert.equal(playEndMs([]), 0);
  const midis = scaleNotes('C', 'major', 4).map((n) => n.midi);
  assert.equal(playEndMs(playEvents(midis, 'up')), 7 * 450 + 420);
  assert.equal(playEndMs(playEvents(midis, 'together')), 1800);
});

// ---- 2026-11-04-1171: chord mode in the block ---------------------------------------------------------------------------------------------------------------------------------

test('mode: chord and chord: <quality> (the vault\'s twelve names, m7b5 for half_dim7); a chord block defaults to C major', () => {
  const def = parseScaleExplorerSource('mode: chord');
  assert.ok(def.ok);
  if (def.ok) assert.deepEqual([def.options.mode, def.options.chord, def.options.tonic, def.options.scale], ['chord', 'major', 'C', 'major']);
  for (const q of ['major', 'minor', 'diminished', 'augmented', 'maj7', 'dom7', 'min7', 'half_dim7', 'dim7', 'dom9', 'dom11', 'dom13']) {
    const r = parseScaleExplorerSource(`mode: chord\nchord: ${q}\ntonic: Bb`);
    assert.ok(r.ok, q);
    if (r.ok) assert.deepEqual([r.options.chord, r.options.tonic], [q, 'Bb']);
  }
  const alias = parseScaleExplorerSource('chord: M7B5\nmode: Chord');
  assert.ok(alias.ok);
  if (alias.ok) assert.deepEqual([alias.options.mode, alias.options.chord], ['chord', 'half_dim7']);
});

test('chord-mode bad lines: an unknown mode, an unknown quality, a chord without mode: chord, a scale in a chord block, a repeated mode', () => {
  const bad = (src: string, re: RegExp): void => {
    const r = parseScaleExplorerSource(src);
    assert.equal(r.ok, false, src);
    if (!r.ok) assert.match(r.message, re, src);
  };
  bad('mode: arpeggio', /mode must be scale or chord \(got "arpeggio"\)/);
  bad('mode: chord\nchord: sus4', /chord must be one of major, minor.*\(got "sus4"\)/);
  bad('chord: dom7', /needs "mode: chord"/);
  bad('mode: scale\nchord: dom7', /needs "mode: chord"/);
  bad('mode: chord\nscale: dorian', /"scale" belongs to mode: scale/);
  bad('mode: chord\nmode: scale', /"mode" is given twice/);
});

test('a scale block is unchanged by the new options: the same defaults, scale mode, and "scale:" still works there', () => {
  const r = parseScaleExplorerSource('mode: scale\nscale: dorian');
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.options.mode, r.options.scale], ['scale', 'dorian']);
});

test('the arpeggio plan is the notes one after the other, upward: the same events as up', () => {
  const midis = [60, 64, 67, 70];
  assert.deepEqual(playEvents(midis, 'arpeggio'), playEvents(midis, 'up'));
});
