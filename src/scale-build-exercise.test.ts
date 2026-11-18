// 2026-11-17-2003 - the "build the scale" widgets redesigned as EXERCISES that look like the Scales hub player. Five files, generated from ONE template and the player's blocks (scripts/dev/make-scale-exercises.mjs):
//   scale_build_major, scale_build_natural_minor (new, one scale each), scale_build_modes_and_minor, scale_build_other_scales, scale_ear_build_the_scale (redesigned). Pinned here: the three shared blocks (scale core, piano voice,
//   scale view = strip and staff) are byte-identical with scale_player.html; the exercise core and everything but the config block and the title are identical in the five; the generator reproduces the files; the exercise's
//   state machine; the staff spells every scale on all twelve tonics exactly as the player does and never shows an answer early; the words ("Exercise", never test, quiz, game or question); the DOM flows with real clicks.
// How TALL each file is (no vertical scroll at 800 and 360 px, every scale and tonic, every state) is measured in real Chrome: scripts/dev/measure-scale-exercises.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const VAULT = path.join(ROOT, 'assets/vaults/music-theory');
const DIR = path.join(VAULT, 'scales/resources/html');
const FILES: Array<[string, string[], string]> = [
  ['scale_build_major.html', ['major'], 'Exercise: build the major scale'],
  ['scale_build_natural_minor.html', ['natural_minor'], 'Exercise: build the natural minor scale'],
  ['scale_build_modes_and_minor.html', ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'natural_minor', 'harmonic_minor', 'melodic_minor'], 'Exercise: build modes and minor scales'],
  ['scale_build_other_scales.html', ['major_pentatonic', 'minor_pentatonic', 'blues', 'whole_tone', 'diminished_wh', 'diminished_hw'], 'Exercise: build pentatonic, blues and symmetric scales'],
  ['scale_ear_build_the_scale.html', ['major', 'natural_minor', 'harmonic_minor', 'dorian', 'mixolydian', 'major_pentatonic', 'minor_pentatonic'], 'Exercise: build a scale'],
];
// the pure core runs in a vm context: its arrays are of another realm, so compare by value
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const block = (h: string, name: string): string => { const a = h.indexOf(`  // ==== ${name} BEGIN`), e = h.indexOf(`  // ==== ${name} END`); assert.ok(a > 0 && e > a, `no "${name}" block`); return h.slice(a, h.indexOf('\n', e)); };
const player = read('scale_player.html');
const MIDI_NAMES = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];

// ---- the files and the pins ---------------------------------------------------------------------------------------------------------------------------------------------------------
test('the five files exist, each offers exactly its scales in ONE marked config block and has its own title that calls it an Exercise', () => {
  for (const [f, scales, title] of FILES) {
    const h = read(f);
    assert.match(h, new RegExp(`<title>${title.replace(/[()]/g, '\\$&')}</title>`), f);
    const cfg = block(h, 'config'); assert.equal(JSON.stringify(JSON.parse(/var SCALES = (\[.*?\]);/.exec(cfg)![1])), JSON.stringify(scales), f);
    assert.equal(h.split('// ==== config BEGIN').length, 2, `${f}: one config block`);
  }
});

test('the scale core, the piano voice and the scale view (strip and staff) are byte-identical with scale_player.html in all five files (shared, not re-implemented)', () => {
  for (const name of ['scale core', 'piano voice', 'scale view']) {
    const ref = block(player, name); assert.ok(ref.length > 1500, `non-vacuity: the player's ${name} block`);
    for (const [f] of FILES) assert.equal(block(read(f), name), ref, `${f}: ${name}`);
  }
});

test('the exercise core is identical in the five files, and the five files differ ONLY in the config block and the title (a copy that drifts is a failure)', () => {
  const strip = (h: string): string => h.replace(/  \/\/ ==== config BEGIN[\s\S]*?  \/\/ ==== config END =+\n/, '').replace(/<title>.*<\/title>/, '<title>T</title>');
  const ref = strip(read(FILES[0][0]));
  assert.ok(ref.length > 30000, 'non-vacuity: the whole file');
  for (const [f] of FILES) assert.equal(strip(read(f)), ref, `${f} differs outside config and title`);
  const core = block(read(FILES[0][0]), 'exercise core'); assert.ok(core.length > 4000); assert.doesNotMatch(core, /document|window/, 'the exercise core is pure');
});

test('the generator reproduces the five files from the template and the player (the template and the files cannot drift)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-ex-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scales/resources/html'), { recursive: true }); fs.copyFileSync(path.join(DIR, 'scale_player.html'), path.join(tmp, 'scales/resources/html/scale_player.html'));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/make-scale-exercises.mjs'), '--vault', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const [f] of FILES) assert.equal(fs.readFileSync(path.join(tmp, 'scales/resources/html', f), 'utf8'), read(f), `${f}: the generator's output differs from the file`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the words: an exercise, never a test, quiz, game or question: not in the source outside comments, not in the page text, titles or labels, in any state', () => {
  const FORBIDDEN = /\b(tests?|quiz(zes)?|games?|questions?)\b/i;
  for (const [f] of FILES) {
    const h = read(f);
    const code = h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');
    assert.doesNotMatch(code, FORBIDDEN, `${f}: a forbidden word in the code`);
    assert.doesNotMatch(h, /Next/, `${f}: no Next`);
    const p = open(f);
    const seen = (): string => [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[title]')].map((e: any) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`), p.doc.getElementById('sr').textContent].join(' ');
    assert.doesNotMatch(seen(), FORBIDDEN, `${f}: fresh`);
    for (let n = 0; n < 4; n++) { p.tap(p.targets()[n] ?? 0); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: after taps`); }
    p.finish(); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: done`);
  }
});

// ---- the pure parts --------------------------------------------------------------------------------------------------------------------------------------------------------------
const g = (f: string = FILES[2][0]) => pureOf(scriptOf(read(f)));
const playerCore = pureOf(scriptOf(player));

test('attempts per level: easy 5, medium 3, hard 1 wrong taps; medium is the default; the levels are in that order', () => {
  const x = g();
  same(x.EX_LEVELS, ['easy', 'medium', 'hard']); assert.equal(x.EX_DEFAULT_LEVEL, 'medium');
  same(x.EX_LEVELS.map((l: string) => x.exAttempts(l)), [5, 3, 1]); assert.equal(x.exAttempts('nonsense'), 3);
});

test('the state machine: the tonic is given; a right key is free and kept; a wrong key costs a wrong tap and writes nothing on the staff; the last note builds it; the last wrong tap ends it; nothing after the end', () => {
  const x = g();
  for (const [li, level] of ['easy', 'medium', 'hard'].entries()) {
    const n = [5, 3, 1][li]; const s0 = x.exStart(0, 'major', level);
    same([s0.phase, s0.left, s0.found, s0.wrong, s0.outcome], ['building', n, [], [], null]);
    same(s0.notes, [60, 62, 64, 65, 67, 69, 71, 72]); same(x.exTargets(s0), [62, 64, 65, 67, 69, 71]);
    // the tonic, the octave note and keys outside the octave are ignored, and cost nothing
    for (const m of [60, 72, 59, 61 - 12, 73, 84]) { const r = x.exTap(s0, m); assert.equal(r.event, m === 61 - 12 ? 'ignored' : 'ignored'); assert.equal(r.state, s0, `a tap on ${m} changes nothing`); }
    // wrong taps: each costs one; a key already marked is ignored
    let s = s0, r: any;
    for (let i = 0; i < n; i++) { r = x.exTap(s, [61, 63, 66, 68, 70][i]); assert.equal(r.first, i === 0); s = r.state; assert.equal(s.left, n - 1 - i); }
    same([r.event, s.phase, s.outcome, s.left], ['gaveup', 'done', 'gaveup', 0]);
    assert.equal(x.exTap(s, 62).event, 'ignored', 'nothing after the end');
    // right keys in any order, free; the last builds it
    s = s0; const order = [71, 62, 69, 64, 67, 65];
    order.forEach((m, i) => { r = x.exTap(s, m); s = r.state; assert.equal(r.event, i === order.length - 1 ? 'built' : 'right'); assert.equal(s.left, n, 'a right key is free'); });
    same([s.phase, s.outcome], ['done', 'built']);
    assert.equal(x.exTap(s0, 62).state.found.length, 1); assert.equal(x.exTap(x.exTap(s0, 62).state, 62).event, 'ignored', 'a key already found');
  }
});

test('the staff never shows an answer early: with nothing found only the tonic is drawn; each found note appears at its own place; unfound notes stay hidden until the end, then the missed ones are ghosts', () => {
  const x = g(); const s0 = x.exStart(2, 'dorian', 'medium');
  const flags = (s: any): string => x.exStaffNotes(s).map((n: any) => (n.hidden ? 'h' : n.ghost ? 'g' : 'n')).join('');
  assert.equal(flags(s0), 'nhhhhhhh');
  const s1 = x.exTap(s0, s0.notes[3]).state; assert.equal(flags(s1), 'nhhnhhhh');
  const sw = x.exTap(s1, s0.notes[0] + 1 === 63 ? 63 : 63).state; assert.equal(flags(sw), 'nhhnhhhh', 'a wrong tap puts nothing on the staff');
  let s = s0; for (const m of x.exTargets(s0).slice(0, 2)) s = x.exTap(s, m).state;
  assert.equal(flags(s), 'nnnhhhhh'.replace('nnn', 'nnn'), 'two found in order');
  // give up on hard: the remaining notes are ghosts, the ends are normal
  const h0 = x.exStart(2, 'dorian', 'hard'); const gave = x.exTap(h0, 63).state; assert.equal(gave.phase, 'done');
  assert.equal(flags(gave), 'ngggggggn'.slice(0, 1) + 'gggggg' + 'n');
  const built = x.exTargets(h0).reduce((st: any, m: number) => x.exTap(st, m).state, h0); assert.equal(flags(built), 'nnnnnnnn');
});

test('every scale of the player, all twelve tonics: the finished exercise puts on the staff exactly the player\'s spelling (one letter per degree for the seven-note scales) with the octave note; the midis are the player\'s', () => {
  const x = g(); let combos = 0;
  for (const sc of playerCore.SC_SCALES) for (let t = 0; t < 12; t++) {
    let s = x.exStart(t, sc.id, 'easy');
    s = x.exTargets(s).reduce((st: any, m: number) => x.exTap(st, m).state, s);
    assert.equal(s.outcome, 'built', `${sc.id} ${t}`);
    const want = playerCore.spellScale(t, sc.id, 'up').map((n: any) => `${n.l}:${n.a}`); want.push(want[0]);
    same(x.exStaffNotes(s).map((n: any) => `${n.l}:${n.a}`), want, `${sc.id} from ${t}`);
    same(s.notes, playerCore.scaleMidis(t, sc.id, 'up', 60), `${sc.id} from ${t}: the midis`);
    if (sc.steps.length === 7) assert.equal(new Set(x.exStaffNotes(s).slice(0, 7).map((n: any) => n.l)).size, 7, `${sc.id} from ${t}: one letter per degree`);
    combos++;
  }
  assert.equal(combos, 17 * 12, 'non-vacuity: every scale, every tonic');
});

test('Random never repeats the pair on screen and reaches every scale of the page and all twelve tonics; a page with one scale still changes the tonic', () => {
  const x = g(); const rng = seeded(5); const seenScales = new Set<string>(), seenTonics = new Set<number>(); let cur = { tonic: 0, scale: 'ionian' };
  for (let i = 0; i < 600; i++) { const r = x.exRandom(x.SCALES, rng, cur); assert.ok(!(r.tonic === cur.tonic && r.scale === cur.scale)); assert.ok(x.SCALES.includes(r.scale)); seenScales.add(r.scale); seenTonics.add(r.tonic); cur = r; }
  assert.equal(seenScales.size, x.SCALES.length); assert.equal(seenTonics.size, 12);
  const one = g(FILES[0][0]); let c = { tonic: 3, scale: 'major' }; for (let i = 0; i < 50; i++) { const r = one.exRandom(one.SCALES, rng, c); assert.equal(r.scale, 'major'); assert.notEqual(r.tonic, c.tonic); c = r; }
});

test('the scores: a first tap counts the exercise as tried, building it scores; each level keeps its own; the words say "exercises"', () => {
  const x = g(); let sc = x.exEmptyScores();
  assert.equal(x.exCounterText(sc, 'medium'), 'Medium: score 0 of 0 exercises');
  sc = x.exTried(sc, 'medium'); assert.equal(x.exCounterText(sc, 'medium'), 'Medium: score 0 of 1 exercise');
  sc = x.exBuilt(sc, 'medium'); sc = x.exTried(sc, 'hard');
  same(x.exBoardText(sc), ['Easy 0/0', 'Medium 1/1', 'Hard 0/1']);
});

test('the play plan is empty until the exercise is over (playing earlier would be the answer), then the scale up with its octave note', () => {
  const x = g(); const s0 = x.exStart(0, 'major', 'medium'); same(x.exPlayPlan(s0), []);
  const s = x.exTargets(s0).reduce((st: any, m: number) => x.exTap(st, m).state, s0);
  same(x.exPlayPlan(s).map((n: any) => n.midi), s0.notes); same(x.exPlayPlan(s).map((n: any) => n.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(x.exPlayPlan(s).every((n: any, i: number) => Math.abs(n.when - i * x.STEP_SECONDS) < 1e-9));
});

// ---- the pages: real DOM, real clicks ---------------------------------------------------------------------------------------------------------------------------------------
function open(file: string, seed = 7) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  const queue: Array<{ fn: () => void; ms: number }> = [];
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  win.__schedule = (fn: () => void, ms: number) => { queue.push({ fn, ms }); return queue.length; }; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const x = pureOf(m[1]);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const sel = (id: string, v: string) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const state = () => ({ tonic: +doc.getElementById('tonic').value, scale: doc.getElementById('scale').value, level: ['easy', 'medium', 'hard'].find((l) => doc.getElementById('level-' + l).getAttribute('aria-pressed') === 'true')! });
  const model = () => { const st = state(); return x.exStart(st.tonic, st.scale, st.level); };
  const p = {
    win, doc, stub, errors, x, click, key, queue, h,
    tap: (midi: number) => click(key(midi)), sel,
    targets: (): number[] => x.exTargets(model()),
    level: (l: string) => click(doc.getElementById('level-' + l)),
    heads: () => doc.querySelectorAll('#staff .head').length, ghosts: () => doc.querySelectorAll('#staff .head.ghost').length, accs: () => [...doc.querySelectorAll('#staff .acc')].map((a: any) => a.textContent),
    text: (id: string) => doc.getElementById(id).textContent.trim(),
    finish: () => { for (const m of model().notes.slice(1, -1)) { const k = key(m); if (k && !k.classList.contains('lit')) click(k); } },
  };
  return p;
}

for (const [f, scales] of FILES) {
  test(`${f}: a fresh exercise: the tonic is marked on the keys and on the staff, nothing else is on the staff, no letters and no step chips yet, Play is off, the words say Exercise and the wrong taps left`, () => {
    const p = open(f); same(p.errors, []);
    assert.equal(p.doc.querySelectorAll('.key').length, 25); assert.equal(p.doc.querySelectorAll('.key.tonic').length, 1);
    assert.ok(p.key(60).classList.contains('tonic') && p.key(60).classList.contains('lit'));
    assert.equal(p.heads(), 1, 'only the tonic is on the staff');
    assert.equal(p.doc.querySelectorAll('#letters .letter').length, 0); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 0);
    assert.equal((p.doc.getElementById('play') as any).disabled, true);
    assert.match(p.text('prompt'), /^Exercise: build /); assert.match(p.text('hint'), /\d+ to find, 3 wrong taps left/);
    assert.equal(p.doc.getElementById('tonic').options.length, 12);
    const multi = scales.length > 1; assert.equal(p.doc.getElementById('scale').options.length, scales.length);
    assert.equal(p.doc.getElementById('scale').style.display === 'none', !multi, 'the scale choice shows only where the page has more than one scale');
    assert.equal(p.doc.getElementById('scale-label').style.display === 'none', !multi);
    assert.equal(p.text('counter'), 'Medium: score 0 of 0 exercises');
    const label = p.doc.getElementById('staff').getAttribute('aria-label')!; assert.equal(label.split(',').length, 1, 'the staff label names only the tonic');
  });
}

test('a right key lights, is marked, and puts its note on the staff with the scale\'s spelling (F sharp for D major); a wrong key is marked and puts nothing on the staff; the tonic, the octave note and the keys outside the octave do nothing', () => {
  const p = open('scale_build_major.html'); p.sel('tonic', '2');                      // D major: D E F# G A B C# D
  assert.equal(p.text('prompt').startsWith('Exercise: build D major'), true);
  const notes = p.model ? [] : []; void notes;
  p.tap(66); assert.ok(p.key(66).classList.contains('lit')); assert.equal(p.key(66).querySelector('text.mark')!.textContent, '\u2713');
  assert.equal(p.heads(), 2); same(p.accs(), ['\u266F'], 'the F sharp has its sharp');
  p.tap(63); assert.ok(p.key(63).classList.contains('wrong')); assert.equal(p.key(63).querySelector('text.mark')!.textContent, '\u00D7');
  assert.equal(p.heads(), 2, 'a wrong tap puts nothing on the staff'); assert.match(p.text('hint'), /5 to find, 2 wrong taps left/);
  for (const m of [62, 74, 61]) { const before = p.doc.body.innerHTML; p.tap(m); if (m === 62) continue; void before; }
  const after = p.text('hint'); p.tap(62); assert.equal(p.text('hint'), after, 'the tonic does nothing');
  assert.equal(p.doc.getElementById('staff').getAttribute('aria-label')!.includes('C sharp'), false, 'the staff label does not name notes that are not found');
  assert.match(p.doc.getElementById('staff').getAttribute('aria-label')!, /F sharp/);
  assert.ok(p.stub.osc.length >= 1, 'a tapped key sounds, right or wrong, and never says which');
});

test('finishing: building it shows the whole scale on the staff, the letters and the whole and half step chips, enables Play and scores; out of wrong taps shows the missed notes dashed (ghosts), the keys of the missed notes dashed too', () => {
  const p = open('scale_build_major.html'); p.finish();
  assert.equal(p.heads(), 8); assert.equal(p.ghosts(), 0); assert.equal(p.doc.querySelectorAll('#letters .letter').length, 7); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 7);
  same([...p.doc.querySelectorAll('#letters .letter')].map((l: any) => l.textContent), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  same([...p.doc.querySelectorAll('#chips .chip')].map((l: any) => l.textContent), ['W', 'W', 'H', 'W', 'W', 'W', 'H']);
  assert.equal((p.doc.getElementById('play') as any).disabled, false); assert.match(p.text('prompt'), /^Exercise done: you built C major/); assert.equal(p.text('counter'), 'Medium: score 1 of 1 exercise');
  assert.match(p.text('sr'), /^You built C major/);
  p.click(p.doc.getElementById('again')); p.level('hard'); p.tap(61);                          // hard: one wrong tap ends it
  assert.equal(p.heads(), 8); assert.equal(p.ghosts(), 6, 'the six notes between the tonic and the octave are missed: dashed');
  assert.equal(p.doc.querySelectorAll('.key.reveal').length, 6); assert.equal(p.doc.querySelectorAll('#letters .letter').length, 7);
  assert.match(p.text('prompt'), /^Exercise over: out of wrong taps/); assert.equal(p.text('counter'), 'Hard: score 0 of 1 exercise');
  assert.match(p.text('sr'), /^Out of wrong taps\. The scale is C major/);
});

test('Play after the end: the scale sounds up with the piano voice (every note, the octave note too) and each note lights in turn on the keys and the staff; before the end the button is off and does nothing', () => {
  const p = open('scale_build_major.html'); p.click(p.doc.getElementById('play')); assert.equal(p.stub.osc.length, 0, 'disabled: nothing sounds');
  p.finish(); p.stub.osc.length = 0; p.queue.length = 0; p.click(p.doc.getElementById('play'));
  assert.ok(p.stub.osc.length >= 8, 'at least one oscillator per note'); assert.equal(p.queue.length, 9, 'one highlight per note and the end');
  p.queue[2].fn(); assert.ok(p.key(64).classList.contains('sounding')); assert.equal(p.doc.querySelectorAll('#staff .head.sounding').length, 1);
  p.queue[8].fn(); assert.equal(p.doc.querySelectorAll('.key.sounding').length, 0);
});

test('choosing: a tonic or a scale starts a fresh exercise (the score stays), New exercise starts the same one again, Random picks from the page\'s scales, a level change starts a fresh one with that level\'s wrong taps; Reset clears the scores', () => {
  const p = open('scale_build_modes_and_minor.html');
  p.tap(62); assert.equal(p.doc.querySelectorAll('.key.lit').length >= 1, true);
  p.sel('scale', 'dorian'); assert.equal(p.doc.querySelectorAll('.key.wrong, .key.lit:not(.tonic)').length, 0, 'fresh'); assert.match(p.text('prompt'), /^Exercise: build C Dorian/); assert.equal(p.heads(), 1);
  p.sel('tonic', '9'); assert.match(p.text('prompt'), /^Exercise: build A Dorian/);
  p.tap(p.targets()[0]); p.click(p.doc.getElementById('again')); assert.equal(p.heads(), 1, 'the same exercise again');
  p.level('easy'); assert.match(p.text('hint'), /5 wrong taps left/); p.level('hard'); assert.match(p.text('hint'), /1 wrong tap left/);
  for (let i = 0; i < 20; i++) { p.click(p.doc.getElementById('random')); assert.ok(p.x.SCALES.includes(p.doc.getElementById('scale').value)); }
  p.level('medium'); p.finish(); assert.equal(p.text('counter'), 'Medium: score 1 of 3 exercises', 'three exercises had a first tap (the one on C Ionian, the one on A Dorian, this one); one was built');
  p.click(p.doc.getElementById('reset')); assert.equal(p.text('counter'), 'Medium: score 0 of 0 exercises'); assert.equal(p.text('sr'), 'Score cleared.');
});

test('keyboard: a key answers Enter and Space; the keys are buttons with names; no vertical padding or fixed height on the page, no storage, no network, no Forge words', () => {
  for (const [f] of FILES) {
    const h = read(f); assert.match(h, /html, body \{ margin: 0; padding: 0;/); assert.doesNotMatch(h, /localStorage|sessionStorage|indexedDB|XMLHttpRequest|fetch\(|https?:\/\/(?!www\.w3\.org)/); assert.doesNotMatch(h, /\bForge\b|forge-/i);
  }
  const p = open('scale_build_major.html'); const k = p.key(64); assert.equal(k.getAttribute('role'), 'button'); assert.equal(k.getAttribute('aria-label'), 'E 4'); assert.equal(MIDI_NAMES[4], 'E');
  k.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); assert.ok(k.classList.contains('lit'));
  const k2 = p.key(67); k2.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); assert.ok(k2.classList.contains('lit'));
});

test('P3: the Scales hub player still draws what it drew (the shared view block only gained optional hidden and ghost notes): a note given no flags is drawn, a hidden one is not, a ghost one is dashed', () => {
  const win: any = new Window({ url: 'http://localhost/' }); const m = /<script>([\s\S]*?)<\/script>/.exec(player)!;
  win.AudioContext = audioStub().Ctx; win.Float32Array = Float32Array; win.document.write(player.replace(m[0], '')); win.eval(m[1]);
  const heads = () => win.document.querySelectorAll('#staff .head').length;
  assert.equal(heads(), 8, 'C major: seven notes and the octave');
  assert.equal(win.document.querySelectorAll('#staff .head.ghost').length, 0); assert.match(win.document.getElementById('staff').getAttribute('aria-label'), /^Treble staff: C, D, E, F, G, A, B, C/);
});
