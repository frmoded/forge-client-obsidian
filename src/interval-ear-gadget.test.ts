// 2026-11-13-1216 / 2026-11-15-1219 / 2026-11-15-2099 - interval_ear.html: three games, scored BY LEVEL. A level gives a number of ATTEMPTS a question (easy 5, medium 3, hard 1; game 3, two notes to find, one more: 6, 4, 2); EVERY click on a key,
// right or wrong, uses one attempt; finding the answer within the attempts adds 1 to the score, running out adds 0 and reveals the answer. The score (with the number of questions asked) is kept per game and per level, in memory only.
// Expected values are the prompt's, not read back from the code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const html = fs.readFileSync(path.join(DIR, 'interval_ear.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(source: string = scriptOf(html)): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }
function seeded(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SHAPES = [[4, 7], [3, 7], [3, 6], [4, 8]];
const LEVELS = ['easy', 'medium', 'hard'];
const WANT_ATTEMPTS: Record<number, number[]> = { 1: [5, 3, 1], 2: [5, 3, 1], 3: [6, 4, 2] };

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the strip is C3..C5', [g.LOW, g.HIGH], [48, 72]);
  eq('the levels, medium by default', [g.LEVELS, g.DEFAULT_LEVEL], [LEVELS, 'medium']);
  for (const game of [1, 2, 3]) eq(`attempts per level, game ${game}`, LEVELS.map((l) => g.attemptsFor(game, l)), WANT_ATTEMPTS[game]);
  // ---- games 1 and 2: one target; EVERY guess uses an attempt; the answer found within the attempts scores
  for (const game of [1, 2]) for (const [li, level] of LEVELS.entries()) {
    const n = WANT_ATTEMPTS[game][li], q = { game, lit: 60, targets: [67], key: '7', sound: [] };
    // the answer found on guess k (1..n) scores; k wrong guesses before it
    for (let k = 1; k <= n; k++) {
      let s = g.ask(q, n); let wrongs = 0, r: any = null;
      for (let i = 0; i < k - 1; i++) { r = g.guess(s, 49 + i); eq(`${level} game ${game}: wrong guess ${i + 1} keeps the question open and reveals nothing`, [r.event, r.state.phase, r.state.found, r.scored], ['wrong', 'asked', [], false]); s = r.state; wrongs++; }
      r = g.guess(s, 67); eq(`${level} game ${game}: the answer on guess ${k} of ${n} scores`, [r.event, r.scored, r.state.outcome, r.state.attemptsLeft], ['solved', true, 'solved', n - k]);
    }
    // n wrong guesses: the question ends, nothing scores, the answer is revealed
    let s = g.ask(q, n), r: any = null; for (let i = 0; i < n; i++) { r = g.guess(s, 49 + i); s = r.state; }
    eq(`${level} game ${game}: ${n} wrong guesses end the question, reveal the answer, score nothing`, [r.event, r.scored, s.phase, s.outcome, s.found, s.attemptsLeft], [n === 0 ? 'wrong' : 'gaveup', false, 'answered', 'gaveup', [67], 0]);
    eq(`${level} game ${game}: nothing after the question is over`, [g.guess(s, 67).event, g.guess(s, 50).event], ['ignored', 'ignored']);
  }
  // ---- game 3: two targets, every guess (right ones too) uses an attempt
  for (const [li, level] of LEVELS.entries()) {
    const n = WANT_ATTEMPTS[3][li], q = { game: 3, lit: 60, targets: [64, 67], key: '4,7', sound: [] };
    let s = g.ask(q, n), r = g.guess(s, 64);
    eq(`${level} game 3: a right note is kept at once (green), uses an attempt, scores nothing yet`, [r.event, r.state.found, r.state.attemptsLeft, r.scored], [n === 2 ? 'right' : 'right', [64], n - 1, false]);
    r = g.guess(r.state, 67); eq(`${level} game 3: both notes in two guesses solve it (any order)`, [r.event, r.scored, r.state.attemptsLeft], ['solved', true, n - 2]);
    r = g.guess(g.guess(g.ask(q, n), 67).state, 64); eq(`${level} game 3: the other order solves it too`, [r.event, r.scored], ['solved', true]);
    // all the attempts used with only one note found: given up
    let t = g.ask(q, n); t = g.guess(t, 64).state; for (let i = 0; i < n - 1; i++) { const x = g.guess(t, 49 + i); t = x.state; if (i === n - 2) eq(`${level} game 3: the attempts run out with one note found: the answer is revealed, nothing scores`, [x.event, x.scored, t.found, t.outcome], ['gaveup', false, [64, 67], 'gaveup']); }
  }
  { // the extra attempt of game 3 is exactly what two right guesses need: medium (4): right, wrong, wrong, right solves; right, wrong, wrong, wrong gives up. hard (2): right, wrong gives up.
    const q = { game: 3, lit: 60, targets: [64, 67], key: '4,7', sound: [] };
    let s = g.ask(q, 4); s = g.guess(s, 64).state; s = g.guess(s, 49).state; s = g.guess(s, 50).state; eq('game 3 medium: the fourth guess can still solve it', g.guess(s, 67).event, 'solved');
    eq('game 3 medium: the fourth guess a miss gives up', g.guess(s, 51).event, 'gaveup');
    let h = g.ask(q, 2); h = g.guess(h, 64).state; eq('game 3 hard: right then wrong gives up', g.guess(h, 49).event, 'gaveup'); eq('game 3 hard: right then right solves', g.guess(h, 67).event, 'solved');
    eq('game 3 hard: wrong then right gives up (the second guess cannot find both)', g.guess(g.guess(g.ask(q, 2), 49).state, 64).event, 'gaveup');
  }
  { const q = { game: 1, lit: 60, targets: [67], key: '7', sound: [] }, s = g.ask(q, 3);
    eq('ignored clicks use no attempt: the lit note, a key already marked, no question open', [g.guess(s, 60).event, g.guess(s, 60).state.attemptsLeft, g.guess(g.guess(s, 66).state, 66).event, g.guess(g.guess(s, 66).state, 66).state.attemptsLeft, g.guess(g.initial(), 60).event], ['ignored', 3, 'ignored', 2, 'ignored']); }
  // ---- the scores: per game and level, with questions asked
  let sc = g.emptyScores();
  eq('the scoreboard starts at 0 of 0 for every game and level', [1, 2, 3].map((x) => LEVELS.map((l) => g.counterText(sc, x, l))), [1, 2, 3].map(() => ['Easy: score 0 of 0 asked', 'Medium: score 0 of 0 asked', 'Hard: score 0 of 0 asked']));
  const before = JSON.stringify(sc);
  sc = g.markAsked(sc, 1, 'medium'); sc = g.markAsked(sc, 1, 'medium'); sc = g.award(sc, 1, 'medium'); sc = g.markAsked(sc, 1, 'hard'); sc = g.markAsked(sc, 2, 'medium'); sc = g.award(sc, 3, 'easy');
  eq('asked and score are counted per game AND per level', [g.boardText(sc, 1), g.boardText(sc, 2), g.boardText(sc, 3)], [['Easy 0/0', 'Medium 1/2', 'Hard 0/1'], ['Easy 0/0', 'Medium 0/1', 'Hard 0/0'], ['Easy 1/0', 'Medium 0/0', 'Hard 0/0']]);
  eq('the counter line is the current level', g.counterText(sc, 1, 'medium'), 'Medium: score 1 of 2 asked');
  eq('the functions do not mutate', JSON.stringify(g.emptyScores()), before);
  const kept = g.resetGame(sc, 1); eq('Reset clears the current game (all three levels) and no other game', [g.boardText(kept, 1), g.boardText(kept, 2), g.boardText(kept, 3)], [['Easy 0/0', 'Medium 0/0', 'Hard 0/0'], ['Easy 0/0', 'Medium 0/1', 'Hard 0/0'], ['Easy 1/0', 'Medium 0/0', 'Hard 0/0']]);
  eq('resetGame does not mutate', g.boardText(sc, 1), ['Easy 0/0', 'Medium 1/2', 'Hard 0/1']);
  // ---- pickQuestion (no per-cell state any more): never repeat, in range, every delta / shape occurs
  for (const game of [1, 2, 3]) {
    const rng = seeded(2099 + game); let prev: any = null, repeats = 0, outside = 0, notLowest = 0; const keys = new Set<string>(), roots = new Set<number>();
    for (let i = 0; i < 30000; i++) {
      const q = g.pickQuestion(game, rng, prev, 48, 72);
      if ([q.lit, ...q.targets].some((n: number) => n < 48 || n > 72)) outside++;
      if (prev && prev.key === q.key && (game !== 3 || prev.lit === q.lit)) repeats++;
      if (game !== 1 && q.targets.some((t: number) => t <= q.lit)) notLowest++;
      keys.add(q.key); roots.add(q.lit); prev = q;
    }
    eq(`game ${game}, 30000 chained questions: no repeat`, repeats, 0); eq(`game ${game}: every note in range`, outside, 0); eq(`game ${game}: the lit note is the lowest (games 2 and 3)`, notLowest, 0);
    eq(`game ${game}: every delta / shape occurs`, keys.size, game === 1 ? 24 : game === 2 ? 12 : 4);
  }
  eq('game 3: the shapes are exactly 0-4-7, 0-3-7, 0-3-6, 0-4-8 above the lowest note', (() => { const rng = seeded(7); let ok = true; let prev: any = null; for (let i = 0; i < 4000; i++) { const q = g.pickQuestion(3, rng, prev, 48, 72); if (!SHAPES.some((s) => s[0] === q.targets[0] - q.lit && s[1] === q.targets[1] - q.lit)) ok = false; prev = q; } return ok; })(), true);
  eq('game 1 goes both ways, game 2 only up, the key is the signed delta', (() => { const r1 = seeded(5), r2 = seeded(6); let p1: any = null, p2: any = null, down = false, up = false, up2 = true, key = true; for (let i = 0; i < 2000; i++) { const a = g.pickQuestion(1, r1, p1, 48, 72), b = g.pickQuestion(2, r2, p2, 48, 72); if (a.targets[0] < a.lit) down = true; if (a.targets[0] > a.lit) up = true; if (b.targets[0] <= b.lit) up2 = false; if (a.targets[0] - a.lit !== +a.key || b.targets[0] - b.lit !== +b.key) key = false; p1 = a; p2 = b; } return [down, up, up2, key]; })(), [true, true, true, true]);
  eq('the sounds: game 1 two notes 0.6 s apart, games 2 and 3 all at once', [1, 2, 3].map((x) => g.pickQuestion(x, seeded(1), null, 48, 72).sound.map((n: any) => n.when)), [[0, 0.6], [0, 0], [0, 0, 0]]);
  for (let i = 0; i < 200; i++) { const q = g.pickQuestion(1, seeded(i), null, 60, 64); if ([q.lit, ...q.targets].some((n: number) => n < 60 || n > 64)) { bad.push(`narrow strip: ${JSON.stringify(q)}`); break; } }
  const q1 = { game: 1, lit: 60, targets: [67], key: '7', sound: [{ midi: 60, when: 0 }, { midi: 67, when: 0.6 }] };
  eq('feedback: a click plays the clicked note, an ignored click nothing, running out of attempts plays the question again', [g.planFeedback(q1, 66, 'wrong'), g.planFeedback(q1, 67, 'solved'), g.planFeedback(q1, 60, 'ignored'), g.planFeedback(q1, 66, 'gaveup')], [[{ midi: 66, when: 0 }], [{ midi: 67, when: 0 }], [], [{ midi: 60, when: 0 }, { midi: 67, when: 0.6 }]]);
  eq('hint: Press Next when idle or over; the attempts left while a question is open (never the answer)', [g.hintText(g.initial()), g.hintText(g.ask(q1, 3)), g.hintText(g.guess(g.ask(q1, 3), 66).state), g.hintText(g.guess(g.guess(g.ask(q1, 3), 66).state, 65).state), g.hintText(g.guess(g.ask(q1, 3), 67).state)], ['Press Next', '3 attempts left', '2 attempts left', '1 attempt left', 'Press Next']);
  return bad;
}
test('pure functions: attempts per level (5/3/1, game 3 6/4/2), every guess uses one attempt, found within the attempts scores 1 and running out scores 0, game 3 needs both notes, the scores per game and level, Reset, pickQuestion (30000 chained questions per game)', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html, seed = 11) {
  const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pure(scriptOf(h));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const q = (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi'));
  const midiOfHz = (hz: number) => [...Array(25)].map((_, i) => 48 + i).find((m2) => +g.midiToHz(m2).toFixed(2) === +hz.toFixed(2))!;
  const p = {
    win, doc, stub, errors, key, click, q, g,
    game: (n: number) => click(doc.getElementById('game-' + n)), level: (l: string) => click(doc.getElementById('level-' + l)),
    next: () => { stub.osc.length = 0; stub.all.length = 0; stub.times.length = 0; click(doc.getElementById('next')); return p.truth(); },
    replay: () => click(doc.getElementById('replay')), press: (m: number) => click(key(m)), reset: () => click(doc.getElementById('reset')),
    truth: () => { const notes = stub.osc.map(midiOfHz); return { lit: notes[0], targets: notes.slice(1) }; },
    hint: () => doc.getElementById('hint').textContent.trim(), sr: () => doc.getElementById('sr').textContent.trim(), counter: () => doc.getElementById('counter').textContent.trim(), board: () => doc.getElementById('board').textContent.trim(),
    pressedGame: () => [1, 2, 3].find((n) => doc.getElementById('game-' + n).getAttribute('aria-pressed') === 'true'), pressedLevel: () => LEVELS.find((l) => doc.getElementById('level-' + l).getAttribute('aria-pressed') === 'true'),
    wrongKey: (t: { lit: number; targets: number[] }, skip: number[] = []) => { for (let m2 = 48; m2 <= 72; m2++) if (m2 !== t.lit && !t.targets.includes(m2) && !skip.includes(m2)) return m2; throw new Error('no wrong key'); },
  };
  return p;
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = open(h); const g = p.g;
  ok('loads clean', p.errors.length === 0);
  ok('25 keys C3..C5, every key has an aria-label, tabindex 0, role button', p.doc.querySelectorAll('.key').length === 25 && [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label') && k.getAttribute('tabindex') === '0' && k.getAttribute('role') === 'button'));
  ok('two switch rows: the games ("1 One after the other", "2 Both at once", "3 Three at once") and the levels (Easy, Medium, Hard); game 1 and medium pressed', [...p.doc.querySelectorAll('#games button')].map((b: any) => b.textContent.trim()).join('|') === '1 One after the other|2 Both at once|3 Three at once' && [...p.doc.querySelectorAll('#levels button')].map((b: any) => b.textContent.trim()).join('|') === 'Easy|Medium|Hard' && p.pressedGame() === 1 && p.pressedLevel() === 'medium');
  ok('Next, Replay and Reset score are the other buttons (no dropdown, no input)', [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()).filter((t: string) => !/^\d /.test(t) && !LEVELS.includes(t.toLowerCase())).join('|') === 'Next|Replay|Reset score' && p.doc.querySelectorAll('select, input').length === 0);
  ok('the chip-like cells are GONE (no cell, no data-key, no found or first-try state anywhere)', p.doc.querySelectorAll('.cell, [data-key], .found, .first').length === 0 && !/\.cell|first try|first-try/i.test(/<style>([\s\S]*?)<\/style>/.exec(h)![1]));
  ok('idle: Press Next, Replay off, nothing lit, nothing played, "Medium: score 0 of 0 asked", the board "Easy 0/0 · Medium 0/0 · Hard 0/0"', p.hint() === 'Press Next' && (p.doc.getElementById('replay') as any).disabled === true && p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0 && p.counter() === 'Medium: score 0 of 0 asked' && p.board() === 'Easy 0/0 · Medium 0/0 · Hard 0/0');
  p.press(60); ok('a click while no question is open does nothing (no mark, no sound, no status text)', p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0 && p.sr() === '');
  // ---- medium (3 attempts), game 1
  let t = p.next();
  ok('Next: ONE key lit, two notes, 3 attempts left, the question counts as asked', p.q('.key.first').join() === String(t.lit) && p.stub.osc.length === 2 && p.stub.all.length === 40 && p.hint() === '3 attempts left' && p.counter() === 'Medium: score 0 of 1 asked' && p.q('.key.right, .key.wrong').length === 0 && p.doc.querySelectorAll('.arc').length === 0);
  p.stub.osc.length = 0; p.replay(); ok('Replay plays the same two notes, reveals nothing, uses no attempt', p.stub.osc.length === 2 && p.q('.key.right, .key.wrong').length === 0 && p.hint() === '3 attempts left');
  const w1 = p.wrongKey(t); p.stub.osc.length = 0; p.press(w1);
  ok('a wrong guess uses an attempt and reveals nothing (the key red with a cross, 2 attempts left, no arc), and sounds only the clicked note', p.q('.key.wrong').join() === String(w1) && p.key(w1).textContent.includes('×') && p.q('.key.right').length === 0 && p.doc.querySelectorAll('.arc').length === 0 && p.hint() === '2 attempts left' && p.stub.osc.length === 1 && p.counter() === 'Medium: score 0 of 1 asked');
  ok('the status never names the answer', !p.sr().includes(g.plainName(t.targets[0]).replace('-flat', ' flat') + ' ' + (Math.floor(t.targets[0] / 12) - 1)) && /Not that one/.test(p.sr()));
  const srB = p.sr(); p.stub.osc.length = 0; p.press(w1); p.press(t.lit); ok('the same wrong key again, and the lit note: nothing (no sound, no attempt used)', p.stub.osc.length === 0 && p.hint() === '2 attempts left' && p.sr() === srB);
  p.press(t.targets[0]);
  ok('the right key on the second guess: green with a check, the arc, score 1 of 1, board Medium 1/1, "Press Next"', p.q('.key.right').join() === String(t.targets[0]) && p.key(t.targets[0]).textContent.includes('✓') && p.doc.querySelectorAll('.arc').length === 1 && p.counter() === 'Medium: score 1 of 1 asked' && p.board() === 'Easy 0/0 · Medium 1/1 · Hard 0/0' && p.hint() === 'Press Next');
  p.stub.all.length = 0; p.press(60 === t.lit ? 61 : 60); ok('a click after the question is over does nothing', p.stub.all.length === 0);
  // out of attempts (medium: 3 wrong)
  t = p.next(); const a = p.wrongKey(t), b = p.wrongKey(t, [a]), c = p.wrongKey(t, [a, b]); p.press(a); p.press(b); p.stub.osc.length = 0; p.press(c);
  ok('three wrong guesses on medium: the answer is revealed (green, the arc), score stays 1 of 2, the question is played again', p.q('.key.right').join() === String(t.targets[0]) && p.q('.key.wrong').length === 3 && p.doc.querySelectorAll('.arc').length === 1 && p.counter() === 'Medium: score 1 of 2 asked' && p.stub.osc.length === 2 && /Out of attempts/.test(p.sr()));
  // ---- hard (1 attempt): changing the level ends the open question and keeps every level's own score
  t = p.next(); p.level('hard');
  ok('changing the level: every open question ends (idle), Hard has its own score 0 of 0, the other levels keep theirs on the board', p.pressedLevel() === 'hard' && p.q('.key.first, .key.right, .key.wrong').length === 0 && p.hint() === 'Press Next' && p.counter() === 'Hard: score 0 of 0 asked' && p.board() === 'Easy 0/0 · Medium 1/3 · Hard 0/0');
  t = p.next(); ok('hard: one attempt', p.hint() === '1 attempt left' && p.counter() === 'Hard: score 0 of 1 asked');
  p.press(p.wrongKey(t)); ok('hard, one wrong guess: the question is over and the answer is shown', p.q('.key.right').join() === String(t.targets[0]) && p.counter() === 'Hard: score 0 of 1 asked' && /Out of attempts/.test(p.sr()));
  t = p.next(); p.press(t.targets[0]); ok('hard, the right key at once: score 1 of 2', p.counter() === 'Hard: score 1 of 2 asked' && p.board() === 'Easy 0/0 · Medium 1/3 · Hard 1/2');
  // ---- easy (5 attempts)
  p.level('easy'); t = p.next(); ok('easy: five attempts', p.hint() === '5 attempts left'); let skip: number[] = []; for (let i = 0; i < 4; i++) { const w = p.wrongKey(t, skip); skip.push(w); p.press(w); } ok('easy: four wrong guesses leave one attempt and the question open', p.hint() === '1 attempt left' && p.q('.key.right').length === 0); p.press(t.targets[0]); ok('easy: the right key on the fifth guess still scores', p.counter() === 'Easy: score 1 of 1 asked');
  // ---- game 2 (own score, own board) and game 3 (one more attempt)
  p.game(2); ok('game 2: its own scores (nothing yet), the level stays', p.pressedGame() === 2 && p.pressedLevel() === 'easy' && p.counter() === 'Easy: score 0 of 0 asked' && p.board() === 'Easy 0/0 · Medium 0/0 · Hard 0/0');
  t = p.next(); ok('game 2: two notes at the SAME time, only the LOWER lit, the target above it, 5 attempts on easy', p.stub.osc.length === 2 && p.stub.times[0] === p.stub.times[1] && p.q('.key.first').join() === String(t.lit) && t.targets[0] > t.lit && p.hint() === '5 attempts left');
  p.game(3); ok('game 3: its own scores, easy has SIX attempts to come', p.pressedGame() === 3 && p.counter() === 'Easy: score 0 of 0 asked');
  t = p.next(); ok('game 3 Next: three notes at the same time, only the lowest lit, six attempts on easy', p.stub.osc.length === 3 && p.stub.all.length === 60 && p.stub.times[0] === p.stub.times[1] && p.stub.times[1] === p.stub.times[2] && p.q('.key.first').join() === String(t.lit) && t.targets.length === 2 && p.hint() === '6 attempts left');
  p.press(t.targets[1]); ok('game 3: a right note is green at once and uses an attempt (5 left), nothing scored', p.q('.key.right').join() === String(t.targets[1]) && p.hint() === '5 attempts left' && p.counter() === 'Easy: score 0 of 1 asked' && p.doc.querySelectorAll('.arc').length === 0);
  p.press(p.wrongKey(t)); p.press(t.targets[0]); ok('game 3: a miss then the other note solves it: score 1 of 1', p.counter() === 'Easy: score 1 of 1 asked' && p.q('.key.right').length === 2);
  p.level('hard'); t = p.next(); ok('game 3 hard: two attempts', p.hint() === '2 attempts left'); p.press(t.targets[0]); p.press(p.wrongKey(t)); ok('game 3 hard: a right note then a miss ends the question (answer shown, score 0 of 1)', p.counter() === 'Hard: score 0 of 1 asked' && p.q('.key.right').length === 2);
  t = p.next(); p.press(t.targets[1]); p.press(t.targets[0]); ok('game 3 hard: both notes in two guesses scores', p.counter() === 'Hard: score 1 of 2 asked');
  // ---- switching games keeps scores; Reset clears only the current game
  p.game(1); ok('back to game 1: its scores are kept (Easy 1/1, Medium 1/3, Hard 1/2)', p.board() === 'Easy 1/1 · Medium 1/3 · Hard 1/2');
  p.game(3); p.reset(); ok('Reset score clears the current game (all levels) only', p.board() === 'Easy 0/0 · Medium 0/0 · Hard 0/0' && (p.game(1), p.board() === 'Easy 1/1 · Medium 1/3 · Hard 1/2') && (p.game(2), p.board() === 'Easy 0/1 · Medium 0/0 · Hard 0/0'));
  // ---- Replay never reveals
  p.game(3); t = p.next(); p.stub.osc.length = 0; p.replay(); ok('Replay (game 3): the same three notes, nothing revealed', p.stub.osc.length === 3 && p.q('.key.right, .key.wrong').length === 0);
  // ---- keyboard
  p.game(1); t = p.next(); p.key(t.targets[0]).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); ok('a key is operated by Enter', p.q('.key.right').length === 1);
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: two switch rows, no chip cells, attempts by level (5/3/1, game 3 6/4/2), every guess uses one, a right find scores, running out reveals and scores nothing, level change ends open questions and keeps every level\'s score, Reset clears the current game only', () => {
  assert.deepEqual(pageFailures(html), []);
});
test('the words: no interval names, no "higher/lower/up/down" claims about the answer, no streak or points; nothing is stored (no localStorage)', () => {
  const p = open(); p.next(); p.press(p.wrongKey(p.truth()));
  const texts = [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[title]')].map((e: any) => (e.getAttribute('aria-label') ?? '') + ' ' + (e.getAttribute('title') ?? '')), p.sr(), p.hint()].join(' | ');
  assert.doesNotMatch(texts, /half step|semitone|\bthird\b|fifth|octave|unison|tritone|streak|points/i, texts);
  assert.doesNotMatch(scriptOf(html).replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB/);
});
test('a player who answers every question right: 40 questions per game and level, the score equals the questions asked, every note in C3..C5', () => {
  for (const game of [1, 2, 3]) for (const level of LEVELS) {
    const p = open(html, 99 + game); p.game(game); p.level(level);
    for (let i = 0; i < 40; i++) { const t = p.next(); assert.ok(t.lit >= 48 && t.targets.every((m: number) => m <= 72), `game ${game} ${level}`); t.targets.forEach((m: number) => p.press(m)); }
    assert.equal(p.counter(), `${level[0].toUpperCase()}${level.slice(1)}: score 40 of 40 asked`, `game ${game} ${level}`);
  }
});
test('PIXELS: no margin or padding on html and body, no fixed page height, the strip sized by its viewBox, both switch rows and the score lines have a reserved height, the switch rows are allowed 360 px so that they stay on one row', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css, /body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*height: auto/);
  assert.match(css, /\.row \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.switch \{[^}]*min-height: 26px/); assert.match(css, /\.score \{[^}]*min-height: 22px/); assert.match(css, /#board \{[^}]*min-height: 18px/);
  assert.match(css, /\.wrap \{ max-width: 360px; \}/);
});
test('CONTROL: a right guess that costs no attempt, a game 3 without its extra attempt, a hard level with three attempts, a given-up question that scores, a Reset that clears every game, a level change that erases the scores, a wrong guess that names the answer, a repeated delta each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('var left = state.attemptsLeft - 1, hit = q.targets.indexOf(midi) >= 0;', 'var hit = q.targets.indexOf(midi) >= 0, left = state.attemptsLeft - (hit ? 0 : 1);')))).length > 0, 'a right guess is free');
  assert.ok(coreFailures(pure(scriptOf(damaged('BASE_ATTEMPTS[level] + (game === 3 ? 1 : 0)', 'BASE_ATTEMPTS[level]')))).length > 0, 'game 3 without the extra attempt');
  assert.ok(coreFailures(pure(scriptOf(damaged('hard: 1 }', 'hard: 3 }')))).length > 0, 'hard with three attempts');
  assert.ok(coreFailures(pure(scriptOf(damaged('outcome: "gaveup" }, event: "gaveup", scored: false }', 'outcome: "gaveup" }, event: "gaveup", scored: true }')))).length > 0, 'a given-up question scores');
  assert.ok(coreFailures(pure(scriptOf(damaged('function resetGame(scores, game) { var out = bump(scores, game, "easy", 0, 0); LEVELS.forEach(function (l) { out[game][l] = { score: 0, asked: 0 }; }); return out; }', 'function resetGame(scores, game) { return emptyScores(); }')))).length > 0, 'a Reset that clears every game');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (d === 0 || (previous && previous.key === String(d))) continue;', 'if (d === 0) continue;')))).length > 0, 'the same delta twice in a row');
  assert.ok(pageFailures(damaged('level = l; GAMES.forEach(function (g) { games[g.id].state = initial(); });', 'level = l; scores = emptyScores(); GAMES.forEach(function (g) { games[g.id].state = initial(); });')).length > 0, 'a level change erases the scores');
  assert.ok(pageFailures(damaged('else text = "Not that one. " + attemptsText(gm.state);', 'else text = "Not that one, it was " + q.targets.map(nameOf).join(" and ") + ". " + attemptsText(gm.state);')).length > 0, 'a wrong guess says the answer');
  assert.ok(pageFailures(damaged('if (r.event === "ignored") return;', 'if (false) return;')).length > 0, 'an ignored click acts');
  assert.ok(pageFailures(damaged('if (state.phase === "answered" && q.game !== 3) {', 'if (q.game !== 3) {')).length > 0, 'the arc is drawn before the answer');
  assert.ok(pageFailures(damaged('scores = markAsked(scores, current, level);', '')).length > 0, 'questions asked not counted');
});
