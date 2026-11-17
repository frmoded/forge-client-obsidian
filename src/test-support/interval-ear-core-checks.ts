// 2026-11-16-0900 - the interval ear gadget's PURE checks, shared by the old three-game page (interval_ear.html) and the three one-game pages split from it: the same rules, so the same checks.
import vm from 'node:vm';

export function seeded(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function pureOf(source: string): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }
export const SHAPES = [[4, 7], [3, 7], [3, 6], [4, 8]];
export const LEVELS = ['easy', 'medium', 'hard'];
export const WANT_ATTEMPTS: Record<number, number[]> = { 1: [5, 3, 1], 2: [5, 3, 1], 3: [6, 4, 2] };

export function coreFailures(g: any): string[] {
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
  eq('hint: Press Play when idle or over; the attempts left while a question is open (never the answer)', [g.hintText(g.initial()), g.hintText(g.ask(q1, 3)), g.hintText(g.guess(g.ask(q1, 3), 66).state), g.hintText(g.guess(g.guess(g.ask(q1, 3), 66).state, 65).state), g.hintText(g.guess(g.ask(q1, 3), 67).state)], ['Press Play', '3 attempts left', '2 attempts left', '1 attempt left', 'Press Play']);
  return bad;
}
