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
import { LEVELS, SHAPES, WANT_ATTEMPTS, coreFailures } from './test-support/interval-ear-core-checks.ts';
void SHAPES; void WANT_ATTEMPTS;

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
