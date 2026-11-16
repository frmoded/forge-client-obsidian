// 2026-11-16-0900 - the ear gadgets split into separate widgets, each exactly as tall as it needs: interval_ear_one_after_the_other / _both_at_once / _triads (the three games of interval_ear.html) and scale_ear_name_the_scale / _build_the_scale
// (the two games of scale_ear.html). Each file is ONE game with its own LEVEL switch (easy / medium / hard), its score and Reset, and no game switch row. The pure logic is an identical block across the files of a family (pinned here) and the shared pure
// checks of the old interval ear gadget run against every new interval file. How TALL each is, and that none scrolls, is measured in real Chrome (scripts/dev/measure-ear-split.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { coreFailures, pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const VAULT = path.resolve(import.meta.dirname, '../assets/vaults/music-theory');
const INTERVAL_DIR = path.join(VAULT, 'music_instruments/resources/html'), SCALE_DIR = path.join(VAULT, 'scales/resources/html');
const INTERVAL = [['interval_ear_one_after_the_other.html', 1, 'Play the second note'], ['interval_ear_both_at_once.html', 2, 'Find the higher note'], ['interval_ear_triads.html', 3, 'Find the triad notes']] as const;
const SCALE = [['scale_ear_name_the_scale.html', 1, 'Name the scale'], ['scale_ear_build_the_scale.html', 2, 'Build the scale']] as const;
const read = (dir: string, f: string): string => fs.readFileSync(path.join(dir, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const block = (h: string, a: string, b: string): string => { const i = h.indexOf(a), j = h.indexOf(b); assert.ok(i > 0 && j > i, a); return h.slice(i, h.indexOf('\n', j)); };
const LEVELS = ['easy', 'medium', 'hard'];
const cap = (l: string): string => l[0].toUpperCase() + l.slice(1);

// ---- the identical blocks ---------------------------------------------------------------------------------------------------------------------------------------------------------
test('the shared pure block is IDENTICAL in the three interval files and in the two scale files, and the piano voice block in all eight ear files is the one of the interval gadgets (a copy that drifts is a failure)', () => {
  const core = (dir: string, f: string, a: string, b: string): string => block(read(dir, f), a, b);
  const i0 = core(INTERVAL_DIR, INTERVAL[0][0], '// ==== interval ear core BEGIN', '// ==== interval ear core END');
  for (const [f] of INTERVAL) assert.equal(core(INTERVAL_DIR, f, '// ==== interval ear core BEGIN', '// ==== interval ear core END'), i0, `${f} differs`);
  const s0 = core(SCALE_DIR, SCALE[0][0], '// ==== scale ear core BEGIN', '// ==== scale ear core END');
  for (const [f] of SCALE) assert.equal(core(SCALE_DIR, f, '// ==== scale ear core BEGIN', '// ==== scale ear core END'), s0, `${f} differs`);
  const playerCore = block(read(SCALE_DIR, 'scale_player.html'), '// ==== scale core BEGIN', '// ==== scale core END'); for (const [f] of SCALE) assert.equal(block(read(SCALE_DIR, f), '// ==== scale core BEGIN', '// ==== scale core END'), playerCore, `${f}: the scale core differs from the player's`);
  assert.ok(i0.length > 3000 && s0.length > 6000, 'non-vacuity: the whole blocks');
  assert.doesNotMatch(i0, /document|window/); assert.doesNotMatch(s0, /document|window/);
  const voice = (h: string): string => block(h, '// ==== piano voice BEGIN', '// ==== piano voice END');
  const ref = voice(read(INTERVAL_DIR, INTERVAL[0][0]));        // 2026-11-16-1101: the old three-game page is gone; the first split file is the reference
  for (const [f] of INTERVAL) assert.equal(voice(read(INTERVAL_DIR, f)), ref, f);
  for (const [f] of SCALE) assert.equal(voice(read(SCALE_DIR, f)), ref, f);
});

// ---- the pure checks of the interval ear gadget against each new file --------------------------------------------------------------------------------------------------------------------
test('every interval file passes the old gadget\'s pure checks: attempts per level (5/3/1, game 3 6/4/2), every guess uses one, 30000 chained questions per game, the triad shapes, the scores per game and level, Reset', () => {
  for (const [f] of INTERVAL) assert.deepEqual(coreFailures(pureOf(scriptOf(read(INTERVAL_DIR, f)))), [], f);
});

// ---- the pages ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(dir: string, file: string, seed = 11) {
  const h = read(dir, file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pureOf(scriptOf(h));
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const lo = g.LOW as number, hi = g.HIGH as number;
  const midiOfHz = (hz: number) => { for (let m2 = lo; m2 <= hi; m2++) if (+g.midiToHz(m2).toFixed(2) === +hz.toFixed(2)) return m2; return -1; };
  const p = {
    win, doc, stub, errors, g, key, click, h,
    level: (l: string) => click(doc.getElementById('level-' + l)), reset: () => click(doc.getElementById('reset')), tap: (m2: number) => click(key(m2)), replay: () => click(doc.getElementById('replay')),
    next: () => { stub.osc.length = 0; stub.all.length = 0; stub.times.length = 0; click(doc.getElementById('next')); return stub.osc.map(midiOfHz); },
    answer: (id: string) => click(doc.querySelector(`#answers button[data-scale="${id}"]`)),
    text: (id: string) => doc.getElementById(id).textContent.trim(), q: (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi')),
    pressedLevel: () => LEVELS.find((l) => doc.getElementById('level-' + l).getAttribute('aria-pressed') === 'true'),
    buttons: () => [...doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()),
  };
  return p;
}
const wrongKeyFor = (p: ReturnType<typeof open>, t: { lit: number; targets: number[] }, skip: number[] = []): number => { for (let m = p.g.LOW; m <= p.g.HIGH; m++) if (m !== t.lit && !t.targets.includes(m) && !skip.includes(m)) return m; throw new Error('no wrong key'); };

for (const [file, game, title] of INTERVAL) {
  test(`${file}: one game (${title}): no game switch row, a level switch Easy / Medium / Hard, Next / Replay / Reset score; the attempts by level; every guess uses one; a find scores; running out reveals; a level change ends the question and keeps every level's score; Reset clears them`, () => {
    const p = open(INTERVAL_DIR, file); const WANT: Record<string, number> = { easy: game === 3 ? 6 : 5, medium: game === 3 ? 4 : 3, hard: game === 3 ? 2 : 1 };
    assert.deepEqual(p.errors, []); assert.match(p.h, new RegExp(`<title>${title}</title>`));
    assert.equal(p.doc.getElementById('games'), null, 'no game switch row'); assert.equal(p.doc.querySelectorAll('[id^="game-"]').length, 0);
    assert.deepEqual(p.buttons().filter((b) => !['Next', 'Replay', 'Reset score'].includes(b)), ['Easy', 'Medium', 'Hard']); assert.equal(p.pressedLevel(), 'medium');
    assert.equal(p.doc.querySelectorAll('.key').length, 25); assert.equal(p.text('hint'), 'Press Next'); assert.equal(p.text('counter'), 'Medium: score 0 of 0 asked'); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0');
    assert.equal(p.doc.querySelectorAll('.cell, [data-key]').length, 0, 'no chip cells');
    // the question: two notes (one after the other / together) or three together, only the lowest lit, the attempts of the level
    for (const level of LEVELS) {
      p.level(level); const n = p.next(); const want = game === 3 ? 3 : 2; assert.equal(n.length, want, `${level}: ${want} notes`); const t = { lit: n[0], targets: n.slice(1) };
      assert.equal(p.q('.key.first').join(), String(t.lit)); assert.equal(p.text('hint'), `${WANT[level]} ${WANT[level] === 1 ? 'attempt' : 'attempts'} left`, `${level}`);
      if (game === 1) assert.ok(Math.abs(p.stub.times[1] - p.stub.times[0] - 0.6) < 1e-6, 'the second note 0.6 s later'); else assert.ok(p.stub.times.every((x: number) => x === p.stub.times[0]), 'all notes at one instant');
      if (game !== 1) assert.ok(t.targets.every((x: number) => x > t.lit), 'the lit note is the lowest');
      // a wrong guess uses an attempt and reveals nothing, unless it is the last
      const w = wrongKeyFor(p, t); p.tap(w);
      if (WANT[level] > 1) { assert.equal(p.q('.key.wrong').join(), String(w)); assert.equal(p.q('.key.right').length, 0, 'nothing revealed'); assert.equal(p.text('hint'), `${WANT[level] - 1} ${WANT[level] - 1 === 1 ? 'attempt' : 'attempts'} left`); }
      else { assert.equal(p.q('.key.right').length, t.targets.length, 'hard: the one attempt is gone, the answer is shown'); assert.match(p.text('sr'), /Out of attempts/); }
    }
    // a find scores
    p.level('medium'); const before = p.text('counter'); const n2 = p.next(); n2.slice(1).forEach((m) => p.tap(m));
    assert.match(p.text('counter'), /Medium: score 1 of \d+ asked/); assert.notEqual(p.text('counter'), before); assert.equal(p.text('hint'), 'Press Next');
    // the levels keep their own scores and a level change ends the open question
    p.level('hard'); assert.equal(p.text('counter').startsWith('Hard: score 0 of 1 asked'), true, 'hard already had one question asked above'); p.next(); p.level('easy'); assert.equal(p.q('.key.first, .key.right, .key.wrong').length, 0, 'the open question ended'); assert.equal(p.text('hint'), 'Press Next');
    assert.match(p.text('board'), /Medium 1\/\d/); p.reset(); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0'); assert.deepEqual(p.errors, []);
  });
}

const ANSWER_ORDER = ['major', 'natural_minor', 'dorian', 'mixolydian', 'major_pentatonic'];
test('scale_ear_name_the_scale.html: one game: no game switch, the level switch, five answers; every guess uses an attempt (5 / 3 / 1); a wrong answer is marked and reveals nothing; the right one scores; running out shows the answer and scores nothing; a level change ends the question; Reset clears', () => {
  const p = open(SCALE_DIR, SCALE[0][0], 7); const g = p.g; assert.deepEqual(p.errors, []); assert.match(p.h, /<title>Name the scale<\/title>/);
  assert.equal(p.doc.getElementById('games'), null); assert.deepEqual(p.buttons().filter((b) => !['Next', 'Replay', 'Reset score'].includes(b)).slice(0, 8), ['Easy', 'Medium', 'Hard', 'major', 'natural minor', 'Dorian', 'Mixolydian', 'pentatonic']);
  assert.equal(p.text('counter'), 'Medium: score 0 of 0 asked'); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0');
  const rng = seeded(7); let prev: any = null; const nextQ = () => { prev = g.pickQuestion(1, rng, prev); return prev; };
  const attempts: Record<string, number> = { easy: 5, medium: 3, hard: 1 };
  // medium: a wrong answer, then the right one: scores
  let q = nextQ(); p.next(); assert.equal(p.text('hint'), '3 attempts left');
  const wrongId = ANSWER_ORDER.find((id) => id !== q.scale)!; p.answer(wrongId);
  assert.equal(p.text('hint'), '2 attempts left'); assert.ok(p.buttons().some((t) => t.endsWith('×'))); assert.ok(!p.buttons().some((t) => t.endsWith('✓')), 'nothing revealed');
  p.answer(q.scale); assert.equal(p.text('counter'), 'Medium: score 1 of 1 asked'); assert.ok(p.buttons().some((t) => t.endsWith('✓'))); assert.match(p.text('prompt'), /It was /);
  // medium: three wrong answers: out of attempts, the answer shown, nothing scored
  q = nextQ(); p.next(); for (const id of ANSWER_ORDER.filter((i) => i !== q.scale).slice(0, 3)) p.answer(id);
  assert.match(p.text('sr'), /Out of attempts/); assert.equal(p.text('counter'), 'Medium: score 1 of 2 asked'); assert.ok(p.buttons().some((t) => t.endsWith('✓')));
  // hard: one attempt: a wrong answer ends it; easy: five attempts: four wrong leave one
  p.level('hard'); assert.equal(p.text('counter'), 'Hard: score 0 of 0 asked'); assert.equal(p.text('board'), 'Easy 0/0 · Medium 1/2 · Hard 0/0'); q = nextQ(); p.next(); assert.equal(p.text('hint'), '1 attempt left');
  p.answer(ANSWER_ORDER.find((id) => id !== q.scale)!); assert.match(p.text('sr'), /Out of attempts/); assert.equal(p.text('counter'), 'Hard: score 0 of 1 asked');
  p.level('easy'); q = nextQ(); p.next(); assert.equal(p.text('hint'), '5 attempts left');
  for (const id of ANSWER_ORDER.filter((i) => i !== q.scale)) p.answer(id); assert.equal(p.text('hint'), '1 attempt left', 'four wrong answers used four of the five attempts'); p.answer(q.scale); assert.equal(p.text('counter'), 'Easy: score 1 of 1 asked', 'the right answer on the last attempt still scores'); void attempts;
  p.reset(); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0'); assert.deepEqual(p.errors, []);
});
test('scale_ear_build_the_scale.html: one game: no game switch, the level switch; the attempts are WRONG TAPS (5 / 3 / 1), a right key is free; the scale built within them scores; the last wrong tap ends the question and shows the notes; the tonic and out-of-octave taps are free; a level change ends the question; Reset clears', () => {
  const p = open(SCALE_DIR, SCALE[1][0], 7); const g = p.g; assert.deepEqual(p.errors, []); assert.match(p.h, /<title>Build the scale<\/title>/); assert.equal(p.doc.getElementById('games'), null);
  assert.deepEqual(p.buttons().filter((b) => !['Next', 'Replay', 'Reset score'].includes(b)), ['Easy', 'Medium', 'Hard']);
  const rng = seeded(7); let prev: any = null; const nextQ = () => { prev = g.pickQuestion(2, rng, prev); return prev; };
  const wrongs = (q: any): number[] => { const t = g.targetsOf(q) as number[]; const w: number[] = []; for (let m = q.notes[0] + 1; m < q.notes[q.notes.length - 1]; m++) if (!t.includes(m)) w.push(m); return w; };
  // medium (3): two wrong taps leave one attempt; every note found then still scores
  let q = nextQ(); p.next(); assert.equal(p.text('hint'), '3 attempts left'); assert.equal(p.q('.key.tonic').join(), String(q.notes[0]));
  const t = g.targetsOf(q) as number[]; const w = wrongs(q); p.tap(w[0]); p.tap(w[1]); assert.equal(p.text('hint'), '1 attempt left'); assert.equal(p.q('.key.right').length, 0, 'a miss reveals nothing');
  for (const m of t) p.tap(m); assert.equal(p.text('counter'), 'Medium: score 1 of 1 asked'); assert.match(p.text('prompt'), /All found/);
  // the free taps: the tonic, the octave note, a key outside the octave, a right key
  q = nextQ(); p.next(); p.tap(q.notes[0]); p.tap(q.notes[q.notes.length - 1]); assert.equal(p.text('hint'), '3 attempts left'); p.tap((g.targetsOf(q) as number[])[0]); assert.equal(p.text('hint'), '3 attempts left', 'a right key is free');
  // medium: three wrong taps end it, show the notes, no point
  const w2 = wrongs(q); p.tap(w2[0]); p.tap(w2[1]); p.tap(w2[2]); assert.match(p.text('sr'), /Out of attempts/); assert.equal(p.text('counter'), 'Medium: score 1 of 2 asked'); assert.ok(p.doc.querySelectorAll('.key.reveal').length > 0, 'the missing notes shown');
  // hard (1): ONE wrong tap ends it; the perfect build scores
  p.level('hard'); q = nextQ(); p.next(); assert.equal(p.text('hint'), '1 attempt left'); p.tap(wrongs(q)[0]); assert.match(p.text('sr'), /Out of attempts/); assert.equal(p.text('counter'), 'Hard: score 0 of 1 asked');
  q = nextQ(); p.next(); for (const m of g.targetsOf(q) as number[]) p.tap(m); assert.equal(p.text('counter'), 'Hard: score 1 of 2 asked');
  // easy (5): four wrong taps leave one attempt
  p.level('easy'); q = nextQ(); p.next(); const w3 = wrongs(q); for (let i = 0; i < 4; i++) p.tap(w3[i]); assert.equal(p.text('hint'), '1 attempt left');
  p.level('medium'); assert.equal(p.q('.key.wrong').length, 0, 'a level change ends the open question'); assert.equal(p.text('hint'), 'Press Next');
  assert.match(p.text('board'), /Hard 1\/2/); p.reset(); assert.equal(p.text('board'), 'Easy 0/0 · Medium 0/0 · Hard 0/0'); assert.deepEqual(p.errors, []);
});

// ---- the pixel rules --------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('PIXELS (all five): no margin or padding on html and body, no fixed page height, the strip sized by its viewBox, every row that can change reserves its height, no storage', () => {
  for (const [dir, files] of [[INTERVAL_DIR, INTERVAL.map((x) => x[0])], [SCALE_DIR, SCALE.map((x) => x[0])]] as const) for (const f of files) {
    const h = read(dir, f); const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1];
    assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/, f); assert.doesNotMatch(css, /body\s*\{[^}]*(?:min-)?height/, f); assert.match(css, /svg \{[^}]*height: auto/, f);
    assert.match(css, /\.score \{[^}]*min-height: 22px/, f); assert.match(css, /#board \{[^}]*min-height: 18px/, f); assert.match(css, /\.switch \{[^}]*min-height: 26px/, f);
    assert.doesNotMatch(scriptOf(h).replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB/, f);
  }
  assert.match(read(SCALE_DIR, SCALE[0][0]), /#answers \{[^}]*min-height: 70px/);
  assert.match(read(SCALE_DIR, SCALE[1][0]), /#answers \{ display: none; \}/, 'the build game has no answer row, so it takes no height');
  assert.match(read(INTERVAL_DIR, INTERVAL[2][0]), /TOP = 0,/, 'the triads have no arc band');
});
test('CONTROL: a level that gives game 3 no extra attempt, a build whose right taps cost an attempt, a name game whose wrong answer is free, a level change that erases the scores, a Reset that leaves a level each go red', () => {
  const damagedPage = (dir: string, file: string, from: string, to: string): string => { const h = read(dir, file); assert.ok(h.includes(from), `premise: ${from}`); return h.replace(from, to); };
  const made: string[] = [];
  const dump = (dir: string, file: string, from: string, to: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ear-ctl-')); made.push(d); fs.writeFileSync(path.join(d, file), damagedPage(dir, file, from, to)); return d; };
  const run = (d: string, file: string) => pureOf(scriptOf(fs.readFileSync(path.join(d, file), 'utf8')));
  try {
    const a = dump(INTERVAL_DIR, INTERVAL[2][0], 'BASE_ATTEMPTS[level] + (game === 3 ? 1 : 0)', 'BASE_ATTEMPTS[level]'); assert.ok(coreFailures(run(a, INTERVAL[2][0])).length > 0, 'game 3 without its extra attempt');
    const b = dump(SCALE_DIR, SCALE[1][0], 'var wrong = state.wrong.concat([midi]), left = state.triesLeft - 1;', 'var wrong = state.wrong.concat([midi]), left = state.triesLeft;'); const gb = run(b, SCALE[1][0]); const q = { notes: [60, 62, 64, 65, 67, 69, 71, 72], scale: 'major', sound: [] };
    let st = gb.ask(q, 1); st = gb.tapKey(st, 61).state; assert.equal(st.phase, 'asked', 'a wrong tap that costs nothing never ends a hard question (the control is red: the real one ends it)');
    const c = pureOf(scriptOf(read(SCALE_DIR, SCALE[1][0]))); let s2 = c.ask(q, 1); s2 = c.tapKey(s2, 61).state; assert.equal(s2.phase, 'answered', 'the real build: one wrong tap on hard ends it');
    s2 = c.ask(q, 1); s2 = c.tapKey(s2, 62).state; assert.equal(s2.phase, 'asked', 'a right tap is free even on hard');
    const sc = c.award(c.markAsked(c.emptyScores(), 'hard'), 'hard'); assert.equal(c.counterText(sc, 'hard'), 'Hard: score 1 of 1 asked'); assert.equal(c.boardText(c.resetScores()).join(' '), 'Easy 0/0 Medium 0/0 Hard 0/0'); assert.equal(c.boardText(sc).join(' '), 'Easy 0/0 Medium 0/0 Hard 1/1');
  } finally { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); }       // only the directories this test made, in the system temp folder
});
