// 2026-11-17-1200 (rewritten 2026-11-17-2003) - the per-note "build the scale" widgets. 1200 made three siblings of scale_ear_build_the_scale.html, each limited to the scales of one page through ONE config constant; 2003 redesigned them as
// EXERCISES that look like the Scales hub player (src/scale-build-exercise.test.ts pins the design: the shared blocks, the state machine, the staff, the words, the pages). What stays here is the INDEPENDENT ORACLE: the recipe of every
// scale for all twelve tonics, written in this test from the prompt (not read from the widget's own table), checked against what each of the five files builds: the pitch classes, the midis (the tonic placed from C4, the octave note last)
// and the notes the learner has to find.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { pureOf } from './test-support/interval-ear-core-checks.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
const FILES: { file: string; scales: string[] }[] = [
  { file: 'scale_build_major.html', scales: ['major'] },
  { file: 'scale_build_natural_minor.html', scales: ['natural_minor'] },
  { file: 'scale_build_modes_and_minor.html', scales: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'natural_minor', 'harmonic_minor', 'melodic_minor'] },
  { file: 'scale_build_other_scales.html', scales: ['major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'] },
  { file: 'scale_ear_build_the_scale.html', scales: ['major', 'natural_minor', 'harmonic_minor', 'dorian', 'mixolydian', 'major_pentatonic', 'minor_pentatonic'] },
];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (got: unknown, want: unknown, why = ''): void => assert.equal(JSON.stringify(got), JSON.stringify(want), why);   // the page's pure core runs in a vm realm: compare by value

// The recipes, as the prompt states them (half steps from the tonic to each next note, the octave note included at the end).
const MAJOR = [2, 2, 1, 2, 2, 2, 1];
const rotate = (r: number[], k: number): number[] => r.slice(k).concat(r.slice(0, k));
const RECIPE: Record<string, number[]> = {
  major: MAJOR, natural_minor: rotate(MAJOR, 5), harmonic_minor: [2, 1, 2, 2, 1, 3, 1], melodic_minor: [2, 1, 2, 2, 2, 2, 1],
  ionian: rotate(MAJOR, 0), dorian: rotate(MAJOR, 1), phrygian: rotate(MAJOR, 2), lydian: rotate(MAJOR, 3), mixolydian: rotate(MAJOR, 4), aeolian: rotate(MAJOR, 5), locrian: rotate(MAJOR, 6),
  major_pentatonic: [2, 2, 3, 2, 3], minor_pentatonic: [3, 2, 2, 3, 2], blues: [3, 2, 1, 1, 3, 2], whole_tone: [2, 2, 2, 2, 2, 2],
  diminished_wh: [2, 1, 2, 1, 2, 1, 2, 1], diminished_hw: [1, 2, 1, 2, 1, 2, 1, 2],
};

test('the recipes written in the test are the ones in the prompt (non-vacuity: the table itself)', () => {
  same(RECIPE.dorian, [2, 1, 2, 2, 2, 1, 2]); same(RECIPE.locrian, [1, 2, 2, 1, 2, 2, 2]); same(RECIPE.natural_minor, [2, 1, 2, 2, 1, 2, 2]);
  for (const [id, r] of Object.entries(RECIPE)) assert.equal(r.reduce((a, b) => a + b, 0), 12, `${id} adds up to an octave`);
});

for (const { file, scales } of FILES) {
  test(`${file}: every scale of the page, all twelve tonics: the pitch classes and the midis follow the recipe (first note the tonic, the last one an octave above), inside the strip, and the exercise asks for exactly the notes between them`, () => {
    const g = pureOf(scriptOf(read(file)));
    same(g.SCALES, scales);
    for (const id of scales) for (let t = 0; t < 12; t++) {
      const recipe = RECIPE[id]; const want = [t]; for (const st of recipe.slice(0, -1)) want.push((want[want.length - 1] + st) % 12);
      same(g.scaleNotes(t, id), want, `${id} from ${t}`);
      const s = g.exStart(t, id, 'medium'); const midis = s.notes as number[];
      assert.equal(midis.length, recipe.length + 1, `${id} from ${t}: notes`); assert.equal(midis[0] % 12, t); assert.equal(midis[midis.length - 1] - midis[0], 12, 'the octave note');
      same(midis.slice(1).map((m, i) => m - midis[i]), recipe, `${id} from ${t}: the steps`);
      assert.ok(midis[0] >= g.BASE && midis[midis.length - 1] <= g.HIGH, `${id} from ${t}: inside the strip`);
      same(g.exTargets(s), midis.slice(1, -1), `${id} from ${t}: the learner finds the notes between the tonic and its octave`);
    }
  });
}
