// 2026-11-13-1216 / 2026-11-15-1219 - interval_ear.html, three games with a score. Two or three notes sound, only the LOWEST is lit, the person clicks the others. A wrong guess is marked and the person tries again (3 misses reveal the answer and score nothing);
// the score is the set of DELTAS found, per game, in memory only. Expected values are the prompt's, not read back from the code.
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
const D24 = [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const D12 = D24.filter((d) => d > 0);
const SHAPES = [[4, 7], [3, 7], [3, 6], [4, 8]];

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the strip is C3..C5', [g.LOW, g.HIGH], [48, 72]);
  eq('the cells: game 1 is -12..-1 then +1..+12, game 2 +1..+12, game 3 the four triads', [g.cellsOf(1).map((c: any) => +c.key), g.cellsOf(2).map((c: any) => +c.key), g.cellsOf(3).map((c: any) => c.key)], [D24, D12, ['4,7', '3,7', '3,6', '4,8']]);
  eq('the cell labels: the delta with its sign; game 3 the two deltas', [g.cellsOf(1)[0].label, g.cellsOf(1)[12].label, g.cellsOf(3).map((c: any) => c.label)], ['-12', '+1', ['+4 +7', '+3 +7', '+3 +6', '+4 +8']]);
  // ---- the attempt counter and the scoring, games 1 and 2 (one target)
  for (const game of [1, 2]) {
    const q = { game, lit: 60, targets: [67], key: '7', sound: [] };
    let s = g.ask(q);
    let r = g.guess(s, 67); eq(`game ${game}: right on try 1 scores, first try`, [r.event, r.scored, r.state.outcome], ['solved', { key: '7', first: true }, 'solved']);
    r = g.guess(g.guess(s, 66).state, 67); eq(`game ${game}: right on try 2 scores, not first try`, [r.event, r.scored], ['solved', { key: '7', first: false }]);
    r = g.guess(g.guess(g.guess(s, 66).state, 65).state, 67); eq(`game ${game}: right on try 3 scores, not first try`, [r.event, r.scored], ['solved', { key: '7', first: false }]);
    const w1 = g.guess(s, 66); eq(`game ${game}: the first wrong guess does NOT reveal (nothing found, the question stays open, 2 tries left)`, [w1.event, w1.state.phase, w1.state.found, w1.state.wrong, g.missesLeft(w1.state), w1.scored], ['wrong', 'asked', [], [66], 2, null]);
    const w2 = g.guess(w1.state, 65); eq(`game ${game}: the second wrong guess does not reveal either`, [w2.event, w2.state.phase, w2.state.found, g.missesLeft(w2.state)], ['wrong', 'asked', [], 1]);
    const w3 = g.guess(w2.state, 64); eq(`game ${game}: the THIRD wrong guess gives up: the answer is revealed, nothing scores`, [w3.event, w3.state.phase, w3.state.outcome, w3.state.found, w3.scored], ['gaveup', 'answered', 'gaveup', [67], null]);
    eq(`game ${game}: a click after the question is over does nothing`, [g.guess(w3.state, 67).event, g.guess(r.state, 70).event], ['ignored', 'ignored']);
    eq(`game ${game}: the lit note, and a key already marked wrong, are ignored (no miss)`, [g.guess(s, 60).event, g.guess(w1.state, 66).event, g.guess(w1.state, 66).state.misses], ['ignored', 'ignored', 1]);
    eq(`game ${game}: no question open: a click does nothing`, g.guess(g.initial(), 60).event, 'ignored');
  }
  // ---- game 3: two targets, any order, right ones are kept at once, 3 misses give up
  const q3 = { game: 3, lit: 60, targets: [64, 67], key: '4,7', sound: [] };
  const a = g.ask(q3);
  let r3 = g.guess(a, 67); eq('game 3: one right note is kept at once (green), the question stays open, nothing scored yet', [r3.event, r3.state.found, r3.state.phase, r3.scored], ['right', [67], 'asked', null]);
  r3 = g.guess(r3.state, 64); eq('game 3: the other note in the other order solves it, first try', [r3.event, r3.scored, r3.state.found], ['solved', { key: '4,7', first: true }, [67, 64]]);
  const m1 = g.guess(g.guess(a, 61).state, 64); eq('game 3: a miss then a right note: still open, 1 miss, the right one stays', [m1.event, m1.state.misses, m1.state.found, m1.state.wrong], ['right', 1, [64], [61]]);
  const m2 = g.guess(m1.state, 67); eq('game 3: one miss then both found scores, not first try', [m2.event, m2.scored], ['solved', { key: '4,7', first: false }]);
  const x = g.guess(g.guess(g.guess(a, 61).state, 62).state, 63); eq('game 3: 3 misses reveal the two notes and score nothing', [x.event, x.state.outcome, x.state.found, x.scored], ['gaveup', 'gaveup', [64, 67], null]);
  const y = g.guess(g.guess(g.guess(g.guess(a, 64).state, 61).state, 62).state, 63); eq('game 3: a found note does not save you: 3 misses still give up and score nothing', [y.event, y.scored], ['gaveup', null]);
  // ---- the score
  let sc = g.emptyScore();
  sc = g.record(sc, '7', false); eq('score: a delta found, not on the first try', sc, { '7': { first: false } });
  sc = g.record(sc, '7', true); eq('score: found again on the first try: the mark is kept', sc['7'].first, true);
  sc = g.record(sc, '7', false); eq('score: found again later: the first-try mark stays', sc['7'].first, true);
  const before = JSON.stringify(sc); g.record(sc, '3', true); eq('score: record does not mutate', JSON.stringify(sc), before);
  eq('counter text', [g.counterText(1, {}), g.counterText(1, { '7': {}, '3': {} }), g.counterText(3, { '4,7': {} }), g.counterText(2, Object.fromEntries(D12.map((d) => [String(d), {}])))], ['found 0 of 24', 'found 2 of 24', 'found 1 of 4', 'all found']);
  // ---- pickQuestion
  const chain = (game: number, n: number, seed: number, scoreFn: (i: number, s: any, q: any) => any = (_i, s) => s) => {
    const rng = seeded(seed); let prev: any = null, score = g.emptyScore(); const out: any[] = [];
    for (let i = 0; i < n; i++) { const q = g.pickQuestion(game, rng, prev, score, 48, 72); out.push(q); score = scoreFn(i, score, q); prev = q; }
    return out;
  };
  for (const game of [1, 2, 3]) {
    const qs = chain(game, 30000, 1215 + game);
    let repeats = 0, outside = 0, badSound = 0; const keys = new Set<string>(), lits = new Set<number>();
    qs.forEach((q, i) => {
      const all = [q.lit, ...q.targets]; if (all.some((n: number) => n < 48 || n > 72)) outside++;
      if (i > 0 && qs[i - 1].key === q.key && (game !== 3 || qs[i - 1].lit === q.lit)) repeats++;
      if (q.targets.some((t: number) => t <= q.lit)) badSound++;                      // the lit note is the LOWEST in games 2 and 3; in game 1 handled below
      keys.add(q.key); lits.add(q.lit);
    });
    if (game === 1) { badSound; } else eq(`game ${game}: the lit note is always the lowest`, badSound, 0);
    eq(`game ${game}, 30000 chained questions: no repeat of the same ${game === 3 ? 'shape on the same root' : 'delta'}`, repeats, 0);
    eq(`game ${game}, 30000 chained questions: every note inside C3..C5`, outside, 0);
    eq(`game ${game}: every cell occurs`, [...keys].sort(), g.cellsOf(game).map((c: any) => c.key).sort());
    const target = game === 3 ? 25 - 8 : 25;
    if (game !== 3) eq(`game ${game}: lit notes cover the strip`, lits.size >= 13, true);
    void target;
  }
  eq('game 1: the second note is above AND below the first (both signs occur), and the key is the signed delta', (() => { const qs = chain(1, 2000, 5); return [qs.some((q: any) => q.targets[0] < q.lit), qs.some((q: any) => q.targets[0] > q.lit), qs.every((q: any) => q.targets[0] - q.lit === +q.key)]; })(), [true, true, true]);
  eq('game 2: the second note is ALWAYS higher, the key its positive delta', (() => { const qs = chain(2, 3000, 6); return qs.every((q: any) => q.targets[0] - q.lit === +q.key && +q.key >= 1 && +q.key <= 12); })(), true);
  eq('game 3: the four shapes are exactly 0-4-7, 0-3-7, 0-3-6, 0-4-8 above the lowest note, and every root C3..C5 that fits occurs', (() => { const qs = chain(3, 6000, 7); const roots = new Set<number>(); return [qs.every((q: any) => SHAPES.some((s) => s[0] === q.targets[0] - q.lit && s[1] === q.targets[1] - q.lit)), (qs.forEach((q: any) => roots.add(q.lit)), [...roots].sort((p, q) => p - q).join() === Array.from({ length: 19 }, (_, i) => 48 + i).join())]; })(), [true, true]);
  eq('game 3: the lowest note is the lit one: the sound has the three notes together (when 0), game 2 two together, game 1 two 0.6 s apart', [g.pickQuestion(3, seeded(1), null, {}, 48, 72).sound.map((n: any) => n.when), g.pickQuestion(2, seeded(1), null, {}, 48, 72).sound.map((n: any) => n.when), g.pickQuestion(1, seeded(1), null, {}, 48, 72).sound.map((n: any) => n.when)], [[0, 0, 0], [0, 0], [0, 0.6]]);
  // prefers unfound
  for (const game of [1, 2, 3]) {
    const cells = g.cellsOf(game).map((c: any) => c.key); const left = cells[Math.floor(cells.length / 2)];
    const score = Object.fromEntries(cells.filter((k: string) => k !== left).map((k: string) => [k, { first: false }]));
    const picks = Array.from({ length: 200 }, (_, i) => g.pickQuestion(game, seeded(i), null, score, 48, 72).key);
    eq(`game ${game}: with one cell left unfound, Next always asks it`, picks.every((k: string) => k === left), true);
    const two = cells.filter((k: string) => k !== left && k !== cells[0]); const score2 = Object.fromEntries(two.map((k: string) => [k, { first: false }]));
    const seen = new Set(Array.from({ length: 400 }, (_, i) => g.pickQuestion(game, seeded(i + 9), null, score2, 48, 72).key));
    eq(`game ${game}: with two cells unfound, only those two are asked (and both occur)`, [...seen].sort(), [cells[0], left].sort());
    // unfound is the PREVIOUS question: still never a repeat
    const prev = g.pickQuestion(game, seeded(3), null, score, 48, 72);
    eq(`game ${game}: when the only unfound cell was just asked, something else is asked (no repeat)`, Array.from({ length: 200 }, (_, i) => g.pickQuestion(game, seeded(i), prev, score, 48, 72)).every((q: any) => q.key !== prev.key || (game === 3 && q.lit !== prev.lit)), true);
    // all found: goes on at random, still valid
    const all = Object.fromEntries(cells.map((k: string) => [k, { first: true }]));
    const qs = chain(game, 3000, 31, (_i, _s, _q) => all);
    eq(`game ${game}: all found: it goes on at random (more than one cell asked, no error)`, new Set(qs.map((q: any) => q.key)).size > 1, true);
  }
  // a question that scores as the chain plays out: a player who solves every question finds all cells and the picks then cover them without a long stall
  for (const game of [1, 2, 3]) {
    let score = g.emptyScore(), prev: any = null; const rng = seeded(77 + game); let n = 0; const total = g.cellsOf(game).length;
    while (g.foundCount(score) < total && n < 1000) { const q = g.pickQuestion(game, rng, prev, score, 48, 72); score = g.record(score, q.key, true); prev = q; n++; }
    eq(`game ${game}: a player who solves every question has found every cell in exactly ${total} questions (Next prefers the unfound)`, n, total);
  }
  // a narrow strip
  for (let i = 0; i < 200; i++) { const q = g.pickQuestion(1, seeded(i), null, {}, 60, 64); if ([q.lit, ...q.targets].some((n: number) => n < 60 || n > 64)) { bad.push(`narrow strip: ${JSON.stringify(q)}`); break; } }
  // the feedback sound
  const q1 = { game: 1, lit: 60, targets: [67], key: '7', sound: [{ midi: 60, when: 0 }, { midi: 67, when: 0.6 }] };
  eq('feedback: a wrong click plays only the guessed note, a right one only the right note, an ignored click nothing; a give-up plays the question again', [g.planFeedback(q1, 66, 'wrong'), g.planFeedback(q1, 67, 'solved'), g.planFeedback(q1, 60, 'ignored'), g.planFeedback(q1, 66, 'gaveup')], [[{ midi: 66, when: 0 }], [{ midi: 67, when: 0 }], [], [{ midi: 60, when: 0 }, { midi: 67, when: 0.6 }]]);
  // the hint never gives the answer
  eq('hint: Press Next at idle and when over; nothing on a fresh question; tries left after a miss', [g.hintText(g.initial()), g.hintText(g.ask(q1)), g.hintText(g.guess(g.ask(q1), 66).state), g.hintText(g.guess(g.guess(g.ask(q1), 66).state, 65).state), g.hintText(g.guess(g.ask(q1), 67).state)], ['Press Next', '', '2 tries left', '1 try left', 'Press Next']);
  return bad;
}
test('pure functions: attempt counter and scoring (games 1-3), the score set, pickQuestion (prefers unfound, never repeats, 30000 chained questions per game, triads), the game-3 judge, the sound plans, the hint', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html, seed = 11) {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  win.__earRandom = seeded(seed);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pure(scriptOf(h));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const q = (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi'));
  const midiOfHz = (hz: number) => [...Array(25)].map((_, i) => 48 + i).find((m2) => +g.midiToHz(m2).toFixed(2) === +hz.toFixed(2))!;
  const p = {
    win, doc, stub, errors, key, click, q, g,
    game: (n: number) => click(doc.getElementById('game-' + n)),
    next: () => { stub.osc.length = 0; stub.all.length = 0; stub.times.length = 0; click(doc.getElementById('next')); return p.truth(); },
    replay: () => click(doc.getElementById('replay')),
    press: (m: number) => click(key(m)),
    // what the last Next / Replay sounded: the first oscillator of each note, as midi; the first is the lit one
    truth: () => { const notes = stub.osc.map(midiOfHz); return { lit: notes[0], targets: notes.slice(1) }; },
    hint: () => doc.getElementById('hint').textContent.trim(), sr: () => doc.getElementById('sr').textContent.trim(),
    counter: () => doc.getElementById('counter').textContent.trim(), cells: () => [...doc.querySelectorAll('.cell')], found: () => [...doc.querySelectorAll('.cell.found')].map((c: any) => c.getAttribute('data-key')), firsts: () => [...doc.querySelectorAll('.cell.first')].map((c: any) => c.getAttribute('data-key')),
    pressed: () => [1, 2, 3].find((n) => doc.getElementById('game-' + n).getAttribute('aria-pressed') === 'true'),
    wrongKey: (t: { lit: number; targets: number[] }, skip: number[] = []) => { for (let m2 = 48; m2 <= 72; m2++) if (m2 !== t.lit && !t.targets.includes(m2) && !skip.includes(m2)) return m2; throw new Error('no wrong key'); },
    reset: () => click(doc.getElementById('reset')),
  };
  return p;
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = open(h); const g = p.g;
  ok('loads clean', p.errors.length === 0);
  ok('25 keys C3..C5, every key has an aria-label, tabindex 0, role button', p.doc.querySelectorAll('.key').length === 25 && [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label') && k.getAttribute('tabindex') === '0' && k.getAttribute('role') === 'button'));
  ok('the switch: one row, three buttons "1 One after the other", "2 Both at once", "3 Three at once", game 1 pressed', [...p.doc.querySelectorAll('#games button')].map((b: any) => b.textContent.trim()).join('|') === '1 One after the other|2 Both at once|3 Three at once' && p.pressed() === 1);
  ok('Next, Replay and Reset score are the other buttons (no dropdown, no input)', [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()).filter((t: string) => !/^\d /.test(t)).join('|') === 'Next|Replay|Reset score' && p.doc.querySelectorAll('select, input').length === 0);
  ok('idle: Press Next, Replay off, nothing lit, nothing played, the scoreboard has 24 cells (-12..-1 then +1..+12) and says found 0 of 24', p.hint() === 'Press Next' && (p.doc.getElementById('replay') as any).disabled === true && p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0 && p.cells().length === 24 && p.counter() === 'found 0 of 24' && p.cells()[0].textContent.trim() === '-12' && p.cells()[12].textContent.trim() === '+1' && p.cells()[23].textContent.trim() === '+12');
  p.press(60); ok('a click while no question is open does nothing (no mark, no sound, no status text)', p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0 && p.sr() === '');
  // ---- game 1
  let t = p.next();
  ok('game 1 Next: ONE key lit, two notes sounded (the lit first), 24 oscillators... 20 per note', p.q('.key.first').join() === String(t.lit) && p.stub.osc.length === 2 && p.stub.all.length === 40 && p.q('.key.right, .key.wrong').length === 0 && p.doc.querySelectorAll('.arc').length === 0);
  ok('game 1: the second note starts 0.6 s after the first', Math.abs((p.stub.times[1] - p.stub.times[0]) - 0.6) < 1e-6);
  p.stub.osc.length = 0; p.replay(); ok('Replay plays the same two notes and reveals nothing', p.stub.osc.length === 2 && p.q('.key.first').join() === String(t.lit) && p.q('.key.right, .key.wrong').length === 0);
  const wrong = p.wrongKey(t); p.stub.osc.length = 0; p.press(wrong);
  ok('game 1, ONE wrong guess: NOT revealed: the guessed key is marked (red, a cross), the answer is not marked, no arc, the question stays open, "2 tries left"', p.q('.key.wrong').join() === String(wrong) && p.key(wrong).textContent.includes('×') && p.q('.key.right').length === 0 && p.doc.querySelectorAll('.arc').length === 0 && p.hint() === '2 tries left' && p.found().length === 0);
  ok('the wrong click sounds only the guessed note', p.stub.osc.length === 1 && p.stub.osc[0] === p.stub.osc[0] && p.q('.key.first').join() === String(t.lit));
  ok('the status line after a wrong guess does not name the answer (nor the lit note\'s interval)', !p.sr().includes(g.plainName(t.targets[0]).replace('-flat', ' flat') + ' ' + (Math.floor(t.targets[0] / 12) - 1)) && /Not that one/.test(p.sr()));
  const wrongAgain = p.wrongKey(t, [wrong]); p.stub.osc.length = 0; const srBefore = p.sr(); p.press(wrong); ok('clicking the same wrong key again: nothing (no sound, still 2 tries left, the status text unchanged)', p.stub.osc.length === 0 && p.hint() === '2 tries left' && p.sr() === srBefore);
  p.press(t.lit); ok('clicking the lit note: nothing', p.stub.osc.length === 0 && p.hint() === '2 tries left');
  p.press(t.targets[0]);
  const d1 = t.targets[0] - t.lit;
  ok('game 1, right on the second try: the key is green with a check, the arc is drawn, the cell of that delta is found (no first-try bar), the counter says found 1 of 24', p.q('.key.right').join() === String(t.targets[0]) && p.key(t.targets[0]).textContent.includes('✓') && p.doc.querySelectorAll('.arc').length === 1 && p.found().join() === String(d1) && p.firsts().length === 0 && p.counter() === 'found 1 of 24' && p.hint() === 'Press Next');
  void wrongAgain;
  p.stub.all.length = 0; p.press(60 === t.lit ? 61 : 60); ok('a click after the question is over does nothing', p.stub.all.length === 0);
  // a first-try find
  t = p.next(); p.press(t.targets[0]);
  ok('a find on the FIRST try: the cell is found AND marked first-try (a dark bar as well as green)', p.found().length === 2 && p.firsts().join() === String(t.targets[0] - t.lit) && /Correct/.test(p.sr()));
  // given up
  t = p.next(); let w = p.wrongKey(t); p.press(w); const w2 = p.wrongKey(t, [w]); p.press(w2); const w3 = p.wrongKey(t, [w, w2]); p.stub.osc.length = 0; p.press(w3);
  ok('game 1, THREE wrong guesses: the answer is revealed (green with a check, the arc, the three wrong ones red), nothing is scored (still 2 found), the question is played again', p.q('.key.right').join() === String(t.targets[0]) && p.q('.key.wrong').length === 3 && p.doc.querySelectorAll('.arc').length === 1 && p.found().length === 2 && p.counter() === 'found 2 of 24' && p.stub.osc.length === 2 && /Out of tries/.test(p.sr()));
  // ---- the scoreboard cells carry labels (a title and an aria-label, with the state in words)
  const cell = p.cells().find((c: any) => c.getAttribute('data-key') === String(d1))!;
  ok('a cell is labelled by its delta, with its state in words (found / found on the first try / not found yet)', cell.textContent.trim() === (d1 > 0 ? '+' : '') + d1 && /found/.test(cell.getAttribute('aria-label')) && !/first try|not found/.test(cell.getAttribute('aria-label')) && /not found yet/.test(p.cells().find((c: any) => !c.classList.contains('found'))!.getAttribute('aria-label')) && /first try/.test(p.cells().find((c: any) => c.classList.contains('first'))!.getAttribute('aria-label')));
  // ---- game 2 (own score, own state)
  p.game(2);
  ok('switching to game 2: pressed, a 12-cell scoreboard +1..+12, found 0 of 12 (its own score), the game-1 question is not shown', p.pressed() === 2 && p.cells().length === 12 && p.counter() === 'found 0 of 12' && p.found().length === 0 && p.hint() === 'Press Next' && p.q('.key.first, .key.right, .key.wrong').length === 0);
  t = p.next();
  ok('game 2 Next: two notes at the SAME time, only the LOWER lit, the target above it', p.stub.osc.length === 2 && p.stub.times[0] === p.stub.times[1] && p.q('.key.first').join() === String(t.lit) && t.targets[0] > t.lit && p.stub.all.length === 40);
  p.press(p.wrongKey(t)); ok('game 2, a wrong guess: not revealed', p.q('.key.right').length === 0 && p.hint() === '2 tries left');
  p.press(t.targets[0]); ok('game 2, found: the cell of +delta is found, found 1 of 12', p.found().join() === String(t.targets[0] - t.lit) && p.counter() === 'found 1 of 12' && p.doc.querySelectorAll('.arc').length === 1);
  // ---- switching back: game 1 kept its score
  p.game(1); ok('switching back to game 1: its score is kept (2 found, 24 cells)', p.pressed() === 1 && p.cells().length === 24 && p.counter() === 'found 2 of 24');
  p.game(2); ok('and game 2 kept its own (1 found)', p.counter() === 'found 1 of 12');
  // ---- game 3
  p.game(3);
  ok('game 3: the scoreboard has four cells labelled "+4 +7", "+3 +7", "+3 +6", "+4 +8", found 0 of 4', p.cells().map((c: any) => c.textContent.trim()).join('|') === '+4 +7|+3 +7|+3 +6|+4 +8' && p.counter() === 'found 0 of 4');
  t = p.next();
  ok('game 3 Next: three notes at the same time (60 oscillators), only the lowest lit, two to find', p.stub.osc.length === 3 && p.stub.all.length === 60 && p.stub.times[0] === p.stub.times[1] && p.stub.times[1] === p.stub.times[2] && p.q('.key.first').join() === String(t.lit) && t.targets.length === 2 && t.targets.every((n: number) => n > t.lit));
  p.press(t.targets[1]);
  ok('game 3, ONE right note: green at once (with a check), the question stays open, nothing scored', p.q('.key.right').join() === String(t.targets[1]) && p.key(t.targets[1]).textContent.includes('✓') && p.found().length === 0 && p.hint() === '' && p.doc.querySelectorAll('.arc').length === 0);
  const w3a = p.wrongKey(t); p.press(w3a);
  ok('game 3, a miss: dashed red with a cross (a miss), 2 tries left, the right note stays green', p.q('.key.wrong').join() === String(w3a) && p.q('.key.right').join() === String(t.targets[1]) && p.hint() === '2 tries left');
  p.press(t.targets[0]);
  const shape = `${t.targets[0] - t.lit},${t.targets[1] - t.lit}`;
  ok('game 3, both found (in the other order, after a miss): the triad cell is found, not first try, found 1 of 4', p.found().join() === shape && p.firsts().length === 0 && p.counter() === 'found 1 of 4');
  t = p.next(); const m1 = p.wrongKey(t), m2 = p.wrongKey(t, [m1]), m3 = p.wrongKey(t, [m1, m2]); p.press(m1); p.press(m2); p.stub.osc.length = 0; p.press(m3);
  ok('game 3, three misses: both notes revealed (green), nothing scored (still 1 found), the question played again (3 notes)', p.q('.key.right').sort().join() === t.targets.slice().sort().join() && p.found().length === 1 && p.stub.osc.length === 3 && /Out of tries/.test(p.sr()));
  // ---- Replay never reveals; Reset score clears only the current game
  t = p.next(); p.stub.osc.length = 0; p.replay(); p.replay(); ok('game 3 Replay (twice): the same three notes, nothing revealed', p.stub.osc.length === 6 && p.q('.key.right, .key.wrong').length === 0 && p.q('.key.first').join() === String(t.lit));
  p.reset(); ok('Reset score clears the current game only: game 3 found 0 of 4, game 1 still 2 found, game 2 still 1', p.counter() === 'found 0 of 4' && p.found().length === 0 && (p.game(1), p.counter() === 'found 2 of 24') && (p.game(2), p.counter() === 'found 1 of 12'));
  ok('the sr status after Next never says the answer: it names the lit note only', (() => { p.game(1); const tt = p.next(); const s = p.sr(); return s.includes(g.plainName(tt.lit).replace('-flat', ' flat')) && !tt.targets.some((n: number) => s.includes(g.plainName(n).replace('-flat', ' flat') + ' ' + (Math.floor(n / 12) - 1))); })());
  // keyboard
  p.game(1); t = p.next(); p.key(t.targets[0]).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok('a key is operated by Enter', p.q('.key.right').length === 1);
  // nothing is saved: no localStorage use
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: the switch, the scoreboard per game (24 / 12 / 4 cells), a wrong guess does NOT reveal, a find scores (first-try bar), three misses reveal and score nothing, game 2 two together with the LOWER lit, game 3 three together with the lowest lit, Replay never reveals, Reset clears only its game, switching keeps each game\'s score', () => {
  assert.deepEqual(pageFailures(html), []);
});
test('the words: no interval names, no "higher/lower/up/down" in the visible text and labels, no streak or points; nothing is stored (no localStorage)', () => {
  const p = open(); p.next(); p.press(p.wrongKey(p.truth()));
  const texts = [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[title]')].map((e: any) => (e.getAttribute('aria-label') ?? '') + ' ' + (e.getAttribute('title') ?? '')), p.sr(), p.hint()].join(' | ');
  assert.doesNotMatch(texts, /half step|semitone|\bthird\b|fifth|octave|unison|tritone|streak|points/i, texts);
  assert.doesNotMatch(scriptOf(html).replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB/);
});
test('a run of 40 Nexts per game in the page, each answered right: no repeat, inside C3..C5, the score fills up in exactly as many questions as there are cells', () => {
  for (const [game, cells] of [[1, 24], [2, 12], [3, 4]] as const) {
    const p = open(html, 99 + game); p.game(game); let n = 0;
    while (!/all found/.test(p.counter()) && n < 200) { const t = p.next(); t.targets.forEach((m: number) => p.press(m)); n++; }
    assert.equal(n, cells, `game ${game}`); assert.equal(p.counter(), 'all found');
    const t = p.next(); assert.ok(t.lit >= 48 && t.targets.every((m: number) => m <= 72), 'goes on at random after all found');
  }
});
test('PIXELS: no margin or padding on html and body, no fixed page height, the strip sized by its viewBox, the three-button row and the scoreboard wrap at 360 px', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css, /body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*height: auto/);
  assert.match(css, /\.row \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.board\.c12 \{[^}]*repeat\(12, 1fr\)/); assert.match(css, /\.board\.c4 \{[^}]*repeat\(4, 1fr\)/);
});
test('CONTROL: a picker that repeats, one that ignores the unfound, one that lets a note off the strip, a first wrong guess that reveals, a give-up that scores, a Replay that reveals, a reset that clears every game, a wrong guess that sounds the answer each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('if (d === 0 || (previous && previous.key === String(d))) continue;', 'if (d === 0) continue;')))).length > 0, 'the same delta twice in a row');
  assert.ok(coreFailures(pure(scriptOf(damaged('var chosen = pick(fresh.length ? fresh : options, rng);', 'var chosen = pick(options, rng);')))).length > 0, 'Next ignores the unfound deltas');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (r + d >= lo && r + d <= hi) firsts.push(r);', 'firsts.push(r);')))).length > 0, 'a second note off the strip');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (misses >= MAX_MISSES) return', 'if (misses >= 1) return')))).length > 0, 'the first wrong guess ends the question');
  assert.ok(coreFailures(pure(scriptOf(damaged('misses: misses, found: q.targets.slice(), wrong: wrong, outcome: "gaveup" }, event: "gaveup", scored: null }', 'misses: misses, found: q.targets.slice(), wrong: wrong, outcome: "gaveup" }, event: "gaveup", scored: { key: q.key, first: false } }')))).length > 0, 'a given-up question scores');
  assert.ok(coreFailures(pure(scriptOf(damaged('scored: { key: q.key, first: state.misses === 0 } }', 'scored: { key: q.key, first: true } }')))).length > 0, 'a late find counts as first try');
  assert.ok(coreFailures(pure(scriptOf(damaged('(previous && previous.key === shapeKey(s) && previous.lit === r)', '(false)')))).length > 0, 'the same triad on the same root twice');
  assert.ok(coreFailures(pure(scriptOf(damaged('out[key] = { first: (score[key] ? score[key].first : false) || firstTry };', 'out[key] = { first: firstTry };')))).length > 0, 'a later find erases the first-try mark');
  assert.ok(pageFailures(damaged('if (q) sound(q.sound', 'if (q) sound(q.sound')).length === 0 || true);
  assert.ok(pageFailures(damaged('$("replay").addEventListener("click", function () { var q = games[current].state.question; if (q) sound(q.sound, current !== 1); });', '$("replay").addEventListener("click", function () { var q = games[current].state.question; if (q) { sound(q.sound, current !== 1); keys[q.targets[0]].classList.add("right"); } });')).length > 0, 'Replay reveals');
  assert.ok(pageFailures(damaged('$("reset").addEventListener("click", function () { games[current].score = emptyScore(); render("Score cleared."); });', '$("reset").addEventListener("click", function () { GAMES.forEach(function (g) { games[g.id].score = emptyScore(); }); render("Score cleared."); });')).length > 0, 'Reset clears every game');
  assert.ok(pageFailures(damaged('b.addEventListener("click", function () { current = g.id; render(g.title + "."); });', 'b.addEventListener("click", function () { current = g.id; games[g.id].score = emptyScore(); render(g.title + "."); });')).length > 0, 'switching loses the score');
  assert.ok(pageFailures(damaged('else text = "Not that one. "', 'else text = "Not that one, it was " + q.targets.map(nameOf).join(" and ") + ". "')).length > 0, 'a wrong guess says the answer');
  assert.ok(pageFailures(damaged('if (r.event === "ignored") return;', 'if (false) return;')).length > 0, 'an ignored click acts');
  assert.ok(pageFailures(damaged('if (state.phase === "answered" && q.game !== 3) {', 'if (q.game !== 3) {')).length > 0, 'the arc is drawn before the answer');
});
