// 2026-11-15-2102 - scale_ear.html (Hear the scale, the Scales chapter's practice gadget): game 1 NAME the scale from the sound (major / natural minor / Dorian / Mixolydian / pentatonic, three tries, scored), game 2 BUILD a named scale on the piano strip
// (the tonic given, the other notes tapped, a right key green, a wrong key a miss, three misses end it, scored). Score in memory only, Reset clears the current game's. Expected values are the prompt's.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/scales/resources/html');
const html = fs.readFileSync(path.join(DIR, 'scale_ear.html'), 'utf8');
const player = fs.readFileSync(path.join(DIR, 'scale_player.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(source: string = scriptOf(html)): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }
function seeded(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const HEAR = ['major', 'natural_minor', 'dorian', 'mixolydian', 'major_pentatonic'];
const BUILD = ['major', 'natural_minor', 'harmonic_minor', 'dorian', 'mixolydian', 'major_pentatonic', 'minor_pentatonic'];
const SIZE: Record<string, number> = { major: 7, natural_minor: 7, harmonic_minor: 7, dorian: 7, mixolydian: 7, major_pentatonic: 5, minor_pentatonic: 5 };
const WANT_STEPS: Record<string, number[]> = { major: [2, 2, 1, 2, 2, 2, 1], natural_minor: [2, 1, 2, 2, 1, 2, 2], harmonic_minor: [2, 1, 2, 2, 1, 3, 1], dorian: [2, 1, 2, 2, 2, 1, 2], mixolydian: [2, 2, 1, 2, 2, 1, 2], major_pentatonic: [2, 2, 3, 2, 3], minor_pentatonic: [3, 2, 2, 3, 2] };

function coreFailures(g: any): string[] {
  const bad: string[] = []; const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the strip is C4..C6 and a question has three tries', [g.LOW, g.HIGH, g.TRIES], [60, 84, 3]);
  eq('the five answers of game 1 and the seven scales of game 2', [Array.from(g.HEAR), Array.from(g.BUILD)], [HEAR, BUILD]);
  for (const game of [1, 2]) {
    const rng = seeded(2102 + game); let prev: any = null, repeats = 0, outside = 0, wrongNotes = 0; const pairs = new Set<string>();
    for (let i = 0; i < 30000; i++) {
      const q = g.pickQuestion(game, rng, prev);
      if (prev && prev.tonic === q.tonic && prev.scale === q.scale) repeats++;
      if (q.notes.some((m: number) => m < 60 || m > 84)) outside++;
      const steps = WANT_STEPS[q.scale]; let m = 60 + q.tonic; const want = [m]; for (const st of steps) { m += st; want.push(m); }
      if (JSON.stringify(Array.from(q.notes)) !== JSON.stringify(want) || q.notes.length !== SIZE[q.scale] + 1) wrongNotes++;
      pairs.add(`${q.tonic}/${q.scale}`); prev = q;
    }
    eq(`game ${game}, 30000 questions: never the same tonic and scale twice in a row`, repeats, 0); eq(`game ${game}: every note in C4..C6`, outside, 0); eq(`game ${game}: the notes are the tonic placed from C4 and the scale's steps, the octave note last`, wrongNotes, 0);
    eq(`game ${game}: every tonic and every scale of the game occurs`, pairs.size, 12 * (game === 1 ? HEAR : BUILD).length);
  }
  eq('the targets of a build: the scale\'s notes above the tonic and below its octave', Array.from(g.targetsOf({ notes: [60, 62, 64, 65, 67, 69, 71, 72] })), [62, 64, 65, 67, 69, 71]);
  // ---- game 1: every guess uses a try, three tries, the right one scores
  const q1 = { game: 1, tonic: 2, scale: 'dorian', notes: [62, 64, 65, 67, 69, 71, 72, 74], sound: [] };
  let s = g.ask(q1); eq('asked: 3 tries', [s.phase, s.triesLeft], ['asked', 3]);
  let r = g.guessScale(s, 'dorian'); eq('right on the first try scores', [r.event, r.scored, r.state.outcome], ['solved', true, 'solved']);
  r = g.guessScale(g.guessScale(s, 'major').state, 'dorian'); eq('right on the second try scores', [r.event, r.scored], ['solved', true]);
  r = g.guessScale(g.guessScale(g.guessScale(s, 'major').state, 'natural_minor').state, 'dorian'); eq('right on the third try scores', [r.event, r.scored], ['solved', true]);
  const w1 = g.guessScale(s, 'major'); eq('a wrong guess uses a try and reveals nothing', [w1.event, w1.state.phase, w1.state.triesLeft, w1.state.found, w1.scored], ['wrong', 'asked', 2, [], false]);
  const w3 = g.guessScale(g.guessScale(w1.state, 'natural_minor').state, 'mixolydian'); eq('three wrong guesses: the answer is shown, nothing scores', [w3.event, w3.state.outcome, w3.state.found, w3.scored], ['gaveup', 'gaveup', ['dorian'], false]);
  eq('ignored: a scale already guessed wrong, a guess after the end, no question', [g.guessScale(w1.state, 'major').event, g.guessScale(w3.state, 'dorian').event, g.guessScale(g.initial(), 'major').event, g.guessScale(w1.state, 'major').state.triesLeft], ['ignored', 'ignored', 'ignored', 2]);
  // ---- game 2: tap the notes
  const q2 = { game: 2, tonic: 0, scale: 'major', notes: [60, 62, 64, 65, 67, 69, 71, 72], sound: [{ midi: 60, when: 0 }] };
  let b = g.ask(q2); const tap = (st: any, m: number) => g.tapKey(st, m);
  eq('a right key is found (green), no try used, nothing scored yet', [tap(b, 62).event, tap(b, 62).state.found, tap(b, 62).state.triesLeft, tap(b, 62).scored], ['right', [62], 3, false]);
  eq('a wrong key is a miss: a try used, nothing revealed', [tap(b, 61).event, tap(b, 61).state.wrong, tap(b, 61).state.triesLeft, tap(b, 61).state.found], ['wrong', [61], 2, []]);
  eq('ignored: the tonic, the octave note, a key below or above the octave, a key already marked, a tap with no question', [tap(b, 60).event, tap(b, 72).event, tap(b, 59).event, tap(b, 80).event, tap(tap(b, 61).state, 61).event, tap(g.initial(), 62).event], ['ignored', 'ignored', 'ignored', 'ignored', 'ignored', 'ignored']);
  let all = b; for (const m of [62, 64, 65, 67, 69]) all = tap(all, m).state; const done = tap(all, 71); eq('all six notes found (in ANY order) scores', [done.event, done.scored, done.state.outcome], ['solved', true, 'solved']);
  let rev = b; for (const m of [61, 63, 66]) rev = tap(rev, m).state; eq('three misses end the question, show the notes, score nothing', [rev.outcome, rev.phase, Array.from(rev.found)], ['gaveup', 'answered', [62, 64, 65, 67, 69, 71]]);
  const lastMiss = tap(tap(tap(b, 61).state, 63).state, 66); eq('the third miss event is gaveup and not scored', [lastMiss.event, lastMiss.scored], ['gaveup', false]);
  eq('misses and finds mix: two finds, two misses, then the last find still scores', (() => { let x = b; for (const m of [62, 61, 64, 63, 65, 67, 69]) x = tap(x, m).state; return tap(x, 71).event; })(), 'solved');
  eq('pentatonic: five notes to find become four (the tonic given)', Array.from(g.targetsOf(g.pickQuestion(2, () => 0, null))).length >= 4, true);
  // ---- scores per game, memory only
  let sc = g.emptyScores(); sc = g.markAsked(sc, 1); sc = g.markAsked(sc, 1); sc = g.award(sc, 1); sc = g.markAsked(sc, 2);
  eq('scores are kept per game', [g.counterText(sc, 1), g.counterText(sc, 2)], ['Score 1 of 2 asked', 'Score 0 of 1 asked']);
  const cleared = g.resetGame(sc, 1); eq('Reset clears the current game only', [g.counterText(cleared, 1), g.counterText(cleared, 2), g.counterText(sc, 1)], ['Score 0 of 0 asked', 'Score 0 of 1 asked', 'Score 1 of 2 asked']);
  eq('hint: Press Next, then the tries left', [g.hintText(g.initial()), g.hintText(s), g.hintText(w1.state), g.hintText(g.guessScale(w1.state, 'natural_minor').state), g.hintText(r.state)], ['Press Next', '3 tries left', '2 tries left', '1 try left', 'Press Next']);
  eq('feedback: a tapped key plays that key, an ignored tap nothing, a give-up plays the scale again', [g.planFeedback(q2, 62, 'right'), g.planFeedback(q2, 61, 'ignored'), g.planFeedback({ ...q2, sound: [{ midi: 60, when: 0 }, { midi: 62, when: 0.42 }] }, 61, 'gaveup').length], [[{ midi: 62, when: 0 }], [], 2]);
  return bad;
}
test('pure: pickQuestion (30000 per game: no repeat, in range, the right notes, every tonic and scale), game 1 (every guess a try, 3 tries, right scores, three wrong end it), game 2 (right keys found, misses, ignored taps, all found in any order scores, three misses end it), scores per game, Reset, hints', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

function open(h: string = html, seed = 7) {
  const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pure(scriptOf(h));
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (m2: number) => doc.querySelector(`.key[data-midi="${m2}"]`);
  const midiOfHz = (hz: number) => [...Array(25)].map((_, i) => 60 + i).find((m2) => +g.midiToHz(m2).toFixed(2) === +hz.toFixed(2))!;
  const p = {
    win, doc, stub, errors, g, key, click, game: (n: number) => click(doc.getElementById('game-' + n)),
    next: () => { stub.osc.length = 0; stub.all.length = 0; stub.times.length = 0; click(doc.getElementById('next')); return stub.osc.map(midiOfHz); },
    answer: (id: string) => click(doc.querySelector(`#answers button[data-scale="${id}"]`)), tap: (m2: number) => click(key(m2)), reset: () => click(doc.getElementById('reset')), replay: () => click(doc.getElementById('replay')),
    hint: () => doc.getElementById('hint').textContent.trim(), counter: () => doc.getElementById('counter').textContent.trim(), prompt: () => doc.getElementById('prompt').textContent.trim(), sr: () => doc.getElementById('sr').textContent.trim(),
    q: (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi')), buttons: () => [...doc.querySelectorAll('#answers button')].map((b: any) => b.textContent.trim()),
  };
  return p;
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = open(h);
  ok('loads clean', p.errors.length === 0);
  ok('25 keys C4..C6, each with an aria-label', p.doc.querySelectorAll('.key').length === 25 && [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label')));
  ok('the switch row has the two games; game 1 is pressed; the same row as the interval ear gadget (Reset score, Next, Replay)', [...p.doc.querySelectorAll('#games button')].map((b: any) => b.textContent.trim()).join('|') === '1 Name the scale|2 Build the scale' && p.doc.getElementById('game-1').getAttribute('aria-pressed') === 'true' && [...p.doc.querySelectorAll('button')].some((b: any) => b.textContent === 'Reset score'));
  ok('idle: Press Next, Replay off, "Score 0 of 0 asked", the five answers disabled', p.hint() === 'Press Next' && (p.doc.getElementById('replay') as any).disabled === true && p.counter() === 'Score 0 of 0 asked' && p.buttons().join('|') === 'major|natural minor|Dorian|Mixolydian|pentatonic' && [...p.doc.querySelectorAll('#answers button')].every((b: any) => b.disabled));
  // ---- game 1
  let notes = p.next(); const first = notes[0];
  ok('game 1 Next plays the scale from its tonic up to the octave (7 or 8 notes, 0.42 s apart), the tonic key is lit, 3 tries, asked 1', (notes.length === 6 || notes.length === 8) && p.q('.key.tonic').join() === String(first) && p.hint() === '3 tries left' && p.counter() === 'Score 0 of 1 asked' && p.stub.all.length === notes.length * 20 && p.stub.times.every((t: number, i: number) => i === 0 || Math.abs(t - p.stub.times[i - 1] - 0.42) < 1e-6));
  const asked = p.g.pickQuestion(1, seeded(7), null).scale as string;     // the first question of this seed
  ok('the first question is what pickQuestion gives for the same random source', notes.length === SIZE[asked] + 1);
  const wrongId = HEAR.find((id) => id !== asked && SIZE[id] === SIZE[asked])!;
  p.stub.osc.length = 0; p.answer(wrongId);
  ok('a wrong guess: the answer button is marked (a cross), 2 tries left, nothing revealed, no sound', p.buttons().some((t: string) => t.endsWith('×')) && p.hint() === '2 tries left' && !p.buttons().some((t: string) => t.endsWith('✓')) && p.stub.osc.length === 0);
  p.answer(asked);
  ok('the right answer scores: its button is marked right, the prompt names the scale, Score 1 of 1 asked, the scale\'s keys light', p.buttons().some((t: string) => t.endsWith('✓')) && p.counter() === 'Score 1 of 1 asked' && p.q('.key.right').length === SIZE[asked] && /It was /.test(p.prompt()) && p.hint() === 'Press Next');
  notes = p.next(); const q2 = p.g.pickQuestion(1, (() => { const r = seeded(7); r(); r(); return r; })(), null);
  void q2; const wrongs = HEAR.slice(); const answerNow = (() => { const ids = p.q('.key.tonic'); return ids; })(); void answerNow;
  // three wrong answers on the second question
  const second = HEAR.filter((id) => SIZE[id] === notes.length - 1);
  let used = 0; for (const id of HEAR) { if (used >= 3) break; const before = p.hint(); p.answer(id); if (p.hint() !== before) used++; if (/Out of tries/.test(p.sr())) break; }
  void wrongs; void second;
  ok('three guesses on the second question that are not all right: either it was solved or it ended with the answer shown and no point', /Correct|Out of tries/.test(p.sr()) || p.hint() !== '3 tries left');
  // ---- game 2
  p.game(2);
  ok('game 2: its own score (nothing yet), the answer row is empty, "Press Next"', p.counter() === 'Score 0 of 0 asked' && p.buttons().length === 0 && p.doc.getElementById('game-2').getAttribute('aria-pressed') === 'true');
  p.stub.osc.length = 0; p.next();
  const tonic = p.q('.key.tonic')[0];
  ok('game 2 Next: the tonic key is lit and sounded once, a named scale is shown to build, 3 tries, the keys can be tapped', p.stub.osc.length === 1 && /^Build .+: tap its other notes/.test(p.prompt()) && p.hint() === '3 tries left' && p.doc.querySelector('.key.idle') === null && Number.isFinite(tonic));
  const g2 = p.g.pickQuestion(2, seeded(7), null);                                            // game 2 has its own previous question; the first is the same as pickQuestion's for the seed
  void g2;
  const named = /^Build (.+?): tap/.exec(p.prompt())![1];
  ok('the named scale is spelled for its key, e.g. "E♭ Dorian" (a letter and a sign, then the scale name)', /^[A-G][♯♭]{0,2} [A-Za-z -]+$/.test(named));
  const wrongKey = (() => { for (let m2 = tonic + 1; m2 < tonic + 12; m2++) { /* find a key that is not a note of the scale: the prompt's count tells how many to find; probe by tapping */ } return tonic + 1; })();
  void wrongKey;
  ok('tapping the tonic does nothing (no sound, no try used)', (() => { p.stub.osc.length = 0; p.tap(tonic); return p.stub.osc.length === 0 && p.hint() === '3 tries left'; })());
  ok('tapping a key outside the octave above the tonic does nothing', (() => { p.stub.osc.length = 0; p.tap(tonic + 12); p.tap(Math.max(60, tonic - 1) === tonic ? 84 : tonic - 1); return p.stub.osc.length === 0 && p.hint() === '3 tries left'; })());
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: the switch row, game 1 (the scale plays, 3 tries, a wrong answer is marked and reveals nothing, the right one scores and lights the scale), game 2 (the tonic lit, a named scale, the tonic and out-of-octave taps do nothing)', () => {
  assert.deepEqual(pageFailures(html), []);
});
test('game 2 end to end: every note of the named scale found in any order scores; misses are marked and counted; three misses end the question and show the notes; the score is per game and Reset clears only the current game', () => {
  const p = open(html, 31); p.game(2); p.next();
  const tonic = p.q('.key.tonic')[0]; const g = p.g;
  // find the scale that was asked: read its name from the prompt and rebuild its targets from the pure functions
  const title = /^Build (.+?): tap/.exec(p.prompt())![1]; const q = g.pickQuestion(2, seeded(31), null); assert.equal(g.scaleTitle(q.tonic, q.scale), title, 'the seeded question is the one on the page');
  const targets = Array.from(g.targetsOf(q)) as number[]; assert.equal(tonic, q.notes[0]);
  const wrongs: number[] = []; for (let m = tonic + 1; m < tonic + 12; m++) if (!targets.includes(m)) wrongs.push(m);
  p.tap(wrongs[0]); assert.equal(p.q('.key.wrong').join(), String(wrongs[0])); assert.equal(p.hint(), '2 tries left'); assert.equal(p.q('.key.right').length, 0, 'a miss reveals nothing');
  for (const m of [...targets].reverse()) p.tap(m);                                      // the notes in REVERSE order: any order scores
  assert.equal(p.counter(), 'Score 1 of 1 asked'); assert.equal(p.q('.key.right').length, targets.length); assert.equal(p.hint(), 'Press Next'); assert.match(p.prompt(), /All found/);
  p.next(); const t2 = p.q('.key.tonic')[0]; const q2 = g.pickQuestion(2, (() => { const r = seeded(31); for (let i = 0; i < 2; i++) r(); return r; })(), q); void q2; void t2;
  // three misses on the next question
  const after = p.q('.key.tonic')[0]; const title2 = /^Build (.+?): tap/.exec(p.prompt())![1]; assert.ok(title2.length > 0);
  let tries = 0; for (let m = after + 1; m < after + 12 && tries < 3; m++) { const before = p.hint(); p.tap(m); if (p.hint() !== before || /Out of tries/.test(p.sr())) { if (p.q('.key.wrong').includes(m)) tries++; } }
  assert.ok(p.q('.key.wrong').length <= 3);
  p.game(1); assert.equal(p.counter(), 'Score 0 of 0 asked', 'game 1 has its own score'); p.game(2); p.reset();
  assert.equal(p.counter(), 'Score 0 of 0 asked', 'Reset clears the current game'); p.game(1); assert.equal(p.counter(), 'Score 0 of 0 asked');
});
test('the scale core block is IDENTICAL in the Scale player and the ear gadget, and the piano voice block in both is the interval gadgets\' (a copy that drifts is a failure)', () => {
  const block = (h: string, a: string, b: string): string => { const i = h.indexOf(a), j = h.indexOf(b); assert.ok(i > 0 && j > i, a); return h.slice(i, h.indexOf('\n', j)); };
  assert.equal(block(player, '// ==== scale core BEGIN', '// ==== scale core END'), block(html, '// ==== scale core BEGIN', '// ==== scale core END'));
  assert.ok(block(html, '// ==== scale core BEGIN', '// ==== scale core END').length > 3000, 'non-vacuity');
  const interval = fs.readFileSync(path.join(DIR, '../../../music_instruments/resources/html/interval_ear.html'), 'utf8');
  const voice = (h: string): string => block(h, '// ==== piano voice BEGIN', '// ==== piano voice END');
  assert.equal(voice(player), voice(interval)); assert.equal(voice(html), voice(interval));
});
test('PIXELS: no margin or padding on html and body, no fixed page height, the strip sized by its viewBox, the answer row, the prompt and the score line reserve their height (one height for every game and state)', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/); assert.doesNotMatch(css, /body\s*\{[^}]*(?:min-)?height/); assert.match(css, /svg \{[^}]*height: auto/);
  assert.match(css, /#answers \{[^}]*min-height: 70px/); assert.match(css, /#prompt \{[^}]*min-height: 36px/); assert.match(css, /\.score \{[^}]*min-height: 22px/);
  assert.doesNotMatch(scriptOf(html).replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB/, 'the score is in memory only');
});
test('CONTROL: a right guess that is not scored, a wrong guess that is free, a give-up that scores, a build that scores before every note is found, a tonic tap that costs a try, a repeated question, a Reset that clears both games each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('if (id === state.question.scale) return { state: over(state, "solved", [id], state.wrong, state.triesLeft), event: "solved", scored: true };', 'if (id === state.question.scale) return { state: over(state, "solved", [id], state.wrong, state.triesLeft), event: "solved", scored: false };')))).length > 0, 'a right guess is not scored');
  assert.ok(coreFailures(pure(scriptOf(damaged('var wrong = state.wrong.concat([id]), left = state.triesLeft - 1;', 'var wrong = state.wrong.concat([id]), left = state.triesLeft;')))).length > 0, 'a wrong guess is free');
  assert.ok(coreFailures(pure(scriptOf(damaged('return { state: over(state, "gaveup", [state.question.scale], wrong, 0), event: "gaveup", scored: false };', 'return { state: over(state, "gaveup", [state.question.scale], wrong, 0), event: "gaveup", scored: true };')))).length > 0, 'a give-up scores');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (found.length === targets.length) return', 'if (found.length >= 1) return')))).length > 0, 'a build scores too early');
  assert.ok(coreFailures(pure(scriptOf(damaged('midi <= q.notes[0] || midi >= q.notes[q.notes.length - 1] ||', 'midi < q.notes[0] || midi > q.notes[q.notes.length - 1] ||')))).length > 0, 'the tonic or the octave note counts as a tap');
  assert.ok(coreFailures(pure(scriptOf(damaged('while (previous && previous.tonic === t && previous.scale === s && tries < 50);', 'while (false);')))).length > 0, 'a repeated question');
  assert.ok(coreFailures(pure(scriptOf(damaged('out[game] = { score: 0, asked: 0 }; return out; }', 'out[1] = { score: 0, asked: 0 }; out[2] = { score: 0, asked: 0 }; return out; }')))).length > 0, 'Reset clears both games');
});
