// 2026-11-17-1200 - the per-note "build the scale" widgets: scale_build_major_and_minor / scale_build_modes_and_minor / scale_build_other_scales, three siblings of scale_ear_build_the_scale.html (the general one, all scales,
// stays). Each file limits the scales to those of one page through ONE config constant at the top (`var BUILD = [...]`, between the config markers); everything else is an identical block, pinned here: the only
// difference between the files is that line. The pitch classes of every scale for all twelve tonics are checked against the recipes written in the prompt (not against the widget's own table).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
const GENERAL = 'scale_ear_build_the_scale.html';
const FILES: { file: string; scales: string[]; title: RegExp }[] = [
  { file: 'scale_build_major_and_minor.html', scales: ['major', 'natural_minor'], title: /<title>Build the scale: major and minor<\/title>/ },
  { file: 'scale_build_modes_and_minor.html', scales: ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'natural_minor', 'harmonic_minor', 'melodic_minor'], title: /<title>Build the scale: modes and minor scales<\/title>/ },
  { file: 'scale_build_other_scales.html', scales: ['major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'], title: /<title>Build the scale: other scales<\/title>/ },
];
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (got: unknown, want: unknown, why = ''): void => assert.equal(JSON.stringify(got), JSON.stringify(want), why);   // the page's pure core runs in a vm realm: compare by value
const CONFIG = /^[ \t]*\/\/ ==== config BEGIN[\s\S]*?\/\/ ==== config END[^\n]*\n/m;

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

for (const { file, scales, title } of FILES) {
  test(`${file}: the config constant is exactly the scales of its page, in ONE marked block at the top of the script, and the page has its own <title>`, () => {
    const h = read(file); const g = pureOf(scriptOf(h));
    same(g.BUILD, scales); assert.match(h, title);
    const m = CONFIG.exec(scriptOf(h)); assert.ok(m, 'a config block'); assert.equal((m![0].match(/var BUILD = /g) || []).length, 1, 'ONE config constant');
    assert.ok(scriptOf(h).indexOf(m![0]) < 600, 'at the top of the script');
    assert.equal((scriptOf(h).replace(CONFIG, '').match(/var BUILD = /g) || []).length, 0, 'the core no longer holds a second list');
  });

  test(`${file}: every scale of the page, all twelve tonics: the pitch classes and the midis follow the recipe (first note the tonic, the last one an octave above), and the spelling gives one name per note`, () => {
    const g = pureOf(scriptOf(read(file)));
    for (const id of scales) for (let t = 0; t < 12; t++) {
      const recipe = RECIPE[id]; const want = [t]; for (const st of recipe.slice(0, -1)) want.push((want[want.length - 1] + st) % 12);
      same(g.scaleNotes(t, id), want, `${id} from ${t}`);
      const midis = g.scaleMidis(t, id, 'up', g.BASE) as number[];
      assert.equal(midis.length, recipe.length + 1, `${id} from ${t}: notes`); assert.equal(midis[0] % 12, t); assert.equal(midis[midis.length - 1] - midis[0], 12, 'the octave note');
      same(midis.slice(1).map((m, i) => m - midis[i]), recipe, `${id} from ${t}: the steps`);
      assert.ok(midis[0] >= g.BASE && midis[midis.length - 1] <= g.HIGH, `${id} from ${t}: inside the strip`);
      const q = g.pickQuestion(2, () => 0.5, null); assert.ok(q.notes.length >= 6, 'a question has its notes');
    }
  });

  test(`${file}: pickQuestion only asks the scales of the page, reaches every one of them and all twelve tonics, never the same pair twice in a row, and the targets are the notes between the tonic and its octave`, () => {
    const g = pureOf(scriptOf(read(file))); const seenScales = new Set<string>(), seenTonics = new Set<number>(); const rng = seeded(3); let prev: any = null;
    for (let i = 0; i < 6000; i++) {
      const q = g.pickQuestion(2, rng, prev); if (prev) assert.ok(!(prev.tonic === q.tonic && prev.scale === q.scale), 'no immediate repeat');
      assert.ok(scales.includes(q.scale), `${q.scale} is not a scale of ${file}`); seenScales.add(q.scale); seenTonics.add(q.tonic);
      assert.equal(g.targetsOf(q).length, RECIPE[q.scale].length - 1, `${q.scale}: targets`); prev = q;
    }
    same([...seenScales].sort(), [...scales].sort()); assert.equal(seenTonics.size, 12);
  });
}

test('the three files are byte-identical but for the config block, and equal the general widget with its own scale list removed (a copy that drifts is a failure)', () => {
  const stripped = (f: string): string => scriptOf(read(f)).replace(CONFIG, '');
  const ref = stripped(FILES[0].file); assert.ok(ref.length > 30000, 'non-vacuity: the whole script');
  for (const { file } of FILES) assert.equal(stripped(file), ref, `${file} differs from ${FILES[0].file}`);
  const general = scriptOf(read(GENERAL)).replace(/^[ \t]*var BUILD = \[.*\];[^\n]*\n/m, '');
  assert.equal(general, ref, 'the per-note files carry exactly the general widget, minus its list');
  // and the markup around the script (the page, its CSS, the controls) is the same too, but for the title
  const shell = (f: string): string => read(f).replace(/<title>[^<]*<\/title>/, '<title>T</title>').replace(/<script>[\s\S]*?<\/script>/, '<script></script>');
  for (const { file } of FILES) assert.equal(shell(file), shell(GENERAL), `${file}: the page shell differs from the general widget`);
});

test('the piano voice block is byte-identical in the three files and in the general widget (the voice is not touched)', () => {
  const voice = (h: string): string => { const i = h.indexOf('// ==== piano voice BEGIN'), j = h.indexOf('// ==== piano voice END'); return h.slice(i, h.indexOf('\n', j)); };
  const ref = voice(read(GENERAL)); assert.ok(ref.length > 2000);
  for (const { file } of FILES) assert.equal(voice(read(file)), ref, file);
});

// ---- the pages (happy-dom) ----------------------------------------------------------------------------------------------------------------------------------------------------------
function open(file: string, rng: () => number) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = rng;
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pureOf(scriptOf(h));
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const text = (id: string) => doc.getElementById(id).textContent.trim();
  return { doc, g, errors, text, h, level: (l: string) => click(doc.getElementById('level-' + l)), next: () => click(doc.getElementById('next')), tap: (m2: number) => click(doc.querySelector(`.key[data-midi="${m2}"]`)), reset: () => click(doc.getElementById('reset')),
    q: (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi')) };
}
/** An rng that makes pickQuestion choose `tonic` and the index-th scale of the file's list (pickQuestion draws the tonic first, then the scale). */
const choose = (tonic: number, index: number, n: number): (() => number) => { let i = 0; return () => (i++ % 2 === 0 ? (tonic + 0.5) / 12 : (index + 0.5) / n); };

for (const { file, scales } of FILES) {
  test(`${file} (page): it asks "Build <tonic> <scale>" with the name and the tonic of the question for every scale of the page, the tonic key is lit, and only this page's scales ever show up`, () => {
    for (const [i, id] of scales.entries()) {
      const tonic = (i * 5) % 12; const p = open(file, choose(tonic, i, scales.length)); p.next();
      const want = `${p.g.scaleTitle(tonic, id)}`; assert.match(p.text('prompt'), new RegExp('^Build ' + want.replace(/[()]/g, '\\$&')), `${id}: ${p.text('prompt')}`);
      assert.equal(p.q('.key.tonic').length, 1); assert.equal(p.q('.key.tonic')[0] % 12, tonic);
      if (id === 'melodic_minor') assert.match(p.text('prompt'), /ascending/, 'melodic minor says it is built going up');
      else assert.doesNotMatch(p.text('prompt'), /ascending/);
      assert.deepEqual(p.errors, []);
    }
    const p = open(file, seeded(21)); for (let i = 0; i < 80; i++) { p.next(); const t = p.text('prompt'); assert.ok(scales.some((id) => t.includes(p.g.SC_SCALES.find((s: any) => s.id === id).name)), `a scale of this page: ${t}`); }
  });

  test(`${file} (page): the levels (5 / 3 / 1 wrong taps), a right key is free, the question scores when every note is found, Reset clears every level, no game switch: exactly as the general widget`, () => {
    const p = open(file, seeded(7)); const g = p.g; assert.equal(p.doc.getElementById('games'), null); assert.deepEqual([...p.doc.querySelectorAll('#levels button')].map((b: any) => b.textContent.trim()), ['Easy', 'Medium', 'Hard']);
    const WANT: Record<string, number> = { easy: 5, medium: 3, hard: 1 };
    const info = () => {                                                      // what the open question asks: its notes, the keys to find, the keys that would be wrong
      const tonic = p.q('.key.tonic')[0]; const sc = p.g.SC_SCALES.find((s: any) => p.text('prompt').includes(s.name)); assert.ok(sc, p.text('prompt'));
      const notes = g.scaleMidis(tonic % 12, sc.id, 'up', g.BASE) as number[]; const targets = notes.slice(1, -1);
      const wrong: number[] = []; for (let m = notes[0] + 1; m < notes[notes.length - 1]; m++) if (!targets.includes(m)) wrong.push(m);
      return { targets, wrong };
    };
    for (const level of ['easy', 'medium', 'hard']) {
      p.level(level); p.next(); const hint = p.text('hint'); assert.equal(hint, `${WANT[level]} ${WANT[level] === 1 ? 'attempt' : 'attempts'} left`, level);
      let q = info(); p.tap(q.targets[0]); assert.equal(p.text('hint'), hint, `${level}: a right key is free`);
      for (const m of q.targets.slice(1)) p.tap(m); assert.match(p.text('counter'), new RegExp(`^${level[0].toUpperCase() + level.slice(1)}: score 1 of 1 asked`), `${level}: found them all`);
      p.next(); q = info(); p.tap(q.wrong[0]);
      if (WANT[level] > 1) assert.equal(p.text('hint'), `${WANT[level] - 1} ${WANT[level] - 1 === 1 ? 'attempt' : 'attempts'} left`, `${level}: a wrong tap uses one`);
      else assert.match(p.text('sr'), /Out of attempts/);
    }
    p.reset(); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0'); assert.deepEqual(p.errors, []);
  });
}
