// 2026-11-04-1171 (Scale Explorer 2 of 4): the TypeScript chord-name table against the engine's music21 (real Pyodide, the vendored wheels and the engine bundle, as scale-explorer-engine.test.ts boots them).
// For all 12 roots (the dropdown's names for the quality) x every one of the vault's twelve qualities:
//   * the engine's own chips (`build_triad_chord`, `build_chord`: what the vault's notes call) give the pitch list buildChord gives;
//   * for the chord in root position and in EVERY inversion (the voicing rotated so each chord tone is the bass in turn), music21's `chord.Chord(...).root()` is the TS root, `.inversion()` is the TS inversion, `.quality` (triads) and `.commonName` (sevenths) agree with the TS quality;
//   * where music21's own name is odd (the extended chords, the double-flat spellings) the pair is listed in ODD below, pinned, with music21's word - never silently different.
// Skipped (visibly) without the music wheels. Pins the MECHANISM (TS table == music21 for these inputs); if music21's naming changes this SHOULD go red - reassess, don't just rewrite.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { CHORD_QUALITIES, buildChord, chordNotes, chordRootNamesFor, nameChord, type ChordQuality } from './chord-names-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);

const TRIADS = new Set<ChordQuality>(['major', 'minor', 'diminished', 'augmented']);
const COMMON: Partial<Record<ChordQuality, string>> = { maj7: 'major seventh chord', dom7: 'dominant seventh chord', min7: 'minor seventh chord', half_dim7: 'half-diminished seventh chord', dim7: 'diminished seventh chord' };
const PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const rootPcOf = (n: string): number => (((PCS[n[0]] + [...n.slice(1)].reduce((a, c) => a + (c === '#' ? 1 : -1), 0)) % 12) + 12) % 12;
const midiOfName = (n: string): number => { const m = /^([A-G])([#b]*)(\d+)$/.exec(n)!; return 12 * (Number(m[3]) + 1) + PCS[m[1]] + [...m[2]].reduce((a, c) => a + (c === '#' ? 1 : -1), 0); };
const m21name = (n: string) => n.replace(/-/g, 'b');
const toM21 = (n: string) => n.replace(/b/g, '-').replace(/^-/, 'b');     // a bare "b" letter is a note; a flat is "-"

async function engineBuild(py: any, root: string, quality: ChordQuality): Promise<string[]> {
  py.globals.set('_r', `${toM21(root)}4`);
  py.globals.set('_q', quality);
  const fn = TRIADS.has(quality) ? 'build_triad_chord' : 'build_chord';
  return (JSON.parse(py.runPython(['import json as _j', `from forge.music.lib import ${fn} as _f`, '_j.dumps(_f(_r, _q))'].join('\n'))) as string[]).map(m21name);
}

/** music21's reading of a voicing. */
async function m21Read(py: any, pitches: string[]): Promise<{ root: string; inversion: number | null; quality: string; common: string; pitchedCommon: string }> {
  py.globals.set('_p', pitches.map(toM21));
  return JSON.parse(py.runPython([
    'import json as _j', 'from music21 import chord as _c',
    'try:', '  _ch = _c.Chord(list(_p))',
    '  try: _inv = _ch.inversion()',
    '  except Exception: _inv = None',
    '  _o = {"root": _ch.root().name, "inversion": _inv, "quality": _ch.quality, "common": _ch.commonName, "pitchedCommon": _ch.pitchedCommonName}',
    'except Exception as _e:', '  _o = {"root": "?", "inversion": None, "quality": "?", "common": str(_e), "pitchedCommon": "?"}',
    '_j.dumps(_o)',
  ].join('\n')));
}

/** The voicing with chord tone `k` as the bass: each tone below it moves up by octaves until it is above the bass (a ninth sits an octave above the root, so the root has to climb two). */
function inversionVoicing(root: string, quality: ChordQuality, k: number): string[] {
  const notes = chordNotes(root, quality, 3);
  const bass = notes[k].midi;
  return notes.map((n, i) => {
    if (i >= k) return n.name;
    let octave = n.octave;
    let midi = n.midi;
    while (midi <= bass) { octave++; midi += 12; }
    return `${n.step}${n.alter > 0 ? '#'.repeat(n.alter) : 'b'.repeat(-n.alter)}${octave}`;
  });
}

test('the engine\'s build_triad_chord / build_chord give the pitch list buildChord gives: 12 roots x 12 qualities (144)', async () => {
  const py = await engine();
  let compared = 0;
  for (const q of CHORD_QUALITIES) for (const root of chordRootNamesFor(q)) {
    assert.deepEqual(await engineBuild(py, root, q), buildChord(root, q, 4), `${root} ${q}`);
    compared++;
  }
  assert.equal(compared, 144);
});

test('music21 agrees with the table on the root and the inversion of every voicing: 144 chords x every inversion (the odd names are pinned below)', async () => {
  const py = await engine();
  const disagreements: string[] = [];
  const odd: { quality: ChordQuality; k: number; theirRootIsBass: boolean }[] = [];
  let read = 0;
  for (const q of CHORD_QUALITIES) for (const root of chordRootNamesFor(q)) {
    const tones = chordNotes(root, q, 3).length;
    for (let k = 0; k < tones; k++) {
      const voicing = inversionVoicing(root, q, k);
      const ts = nameChord(voicing);
      assert.ok(ts.name !== null, `${voicing.join(' ')} is named`);
      // A symmetric chord (augmented, dim7) is the same notes with several roots: the intended reading (this root, this quality, this inversion) must be among the readings, and exactly one reading says so.
      const readings = [ts, ...ts.alternatives];
      const mine = readings.filter((r) => rootPcOf(r.root) === rootPcOf(root) && r.quality === q);
      assert.equal(mine.length, 1, `${voicing.join(' ')}: the intended reading is listed once`);
      assert.equal(mine[0].inversion, k, `${voicing.join(' ')}: inversion`);
      if (readings.length === 1) assert.equal(ts.root, root);
      const m = await m21Read(py, voicing);
      read++;
      const theirs = readings.find((r) => m.root !== '?' && rootPcOf(r.root) === rootPcOf(m.root.replace(/-/g, 'b')));
      if (!theirs) { disagreements.push(`${voicing.join(' ')}: music21 root ${m.root} is none of ${readings.map((r) => r.root).join(', ')}`); odd.push({ quality: q, k, theirRootIsBass: rootPcOf(m.root.replace(/-/g, 'b')) === rootPcOf(voicing.reduce((lo, n) => (midiOfName(n) < midiOfName(lo) ? n : lo)).replace(/\d+$/, '')) }); continue; }
      if (m.root.replace(/-/g, 'b') !== theirs.root) disagreements.push(`${voicing.join(' ')}: root spelled ${theirs.root} / music21 ${m.root}`);
      if (m.inversion !== theirs.inversion) disagreements.push(`${voicing.join(' ')}: inversion ${theirs.inversion} (${theirs.name}) / music21 ${m.inversion} (root ${m.root})`);
      if (TRIADS.has(q) && m.quality !== q) disagreements.push(`${voicing.join(' ')}: quality ${q} / music21 ${m.quality}`);
      const want = COMMON[q];
      if (want && m.common !== want) disagreements.push(`${voicing.join(' ')}: ${q} / music21 "${m.common}"`);
    }
  }
  assert.ok(read > 500, `read ${read} voicings (non-vacuity)`);
  // THE ONE PLACE music21 and the table differ, pinned: a 13th chord is seven stacked thirds (the whole mixolydian scale), so any of its notes is "a root" - music21's root() answers the BASS of each inversion; the table reads
  // the set as what the vault teaches, a C dom13 (one root). Every other chord - all 132 triads, sevenths, 9ths and 11ths, in root position and every inversion - agrees on root, inversion, quality and common name.
  assert.equal(odd.length, disagreements.length, `every disagreement is of the music21-has-no-root kind:\n${disagreements.join('\n')}`);
  assert.ok(odd.every((o) => o.quality === 'dom13' && o.k >= 1 && o.theirRootIsBass), 'only dom13 inversions, and music21 answered the bass');
  assert.equal(odd.length, 12 * 6, '12 roots x inversions 1 to 6');
});
