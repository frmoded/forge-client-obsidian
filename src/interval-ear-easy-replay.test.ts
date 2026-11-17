// 2026-11-17-1100 - the three interval ear gadgets (interval_ear_one_after_the_other / _both_at_once / _triads): (1) EASY uses white keys only (the lit note, the answers, every note of a question; the black keys stay drawn but are
// inactive: greyed, silent, no attempt), (2) in easy and medium a repeated click on a key already clicked in this question (or on the lit note) plays that note again, uses no attempt and changes no score; in hard it stays silent.
// The pure functions (pickQuestion's whiteOnly flag, isInactive, replayPlan) are tested from the page's own script; the pages in happy-dom with the Web Audio stub; the heights in real Chrome (scripts/dev/measure-ear-split.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { coreFailures, pureOf, seeded } from './test-support/interval-ear-core-checks.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const FILES = [['interval_ear_one_after_the_other.html', 1], ['interval_ear_both_at_once.html', 2], ['interval_ear_triads.html', 3]] as const;
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const same = (got: unknown, want: unknown, why = ''): void => assert.equal(JSON.stringify(got), JSON.stringify(want), why);   // the pure core runs in a vm realm: compare by value, not by prototype
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

for (const [file, game] of FILES) {
  test(`${file}: pickQuestion(..., whiteOnly) never yields a black key (lit, targets, every note), over many seeds and 20000 chained questions; WITHOUT the flag black keys do come up (non-vacuity)`, () => {
    const g = pureOf(scriptOf(read(file)));
    let blackWithout = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed); let prev: any = null;
      for (let i = 0; i < 500; i++) {
        const q = g.pickQuestion(game, rng, prev, g.LOW, g.HIGH, true); prev = q;
        for (const m of [q.lit, ...q.targets]) assert.equal(g.isBlack(m), false, `seed ${seed} question ${i}: ${m} is black`);
        assert.equal(q.sound.every((n: any) => !g.isBlack(n.midi)), true);
        assert.ok(q.targets.every((m: number) => m >= g.LOW && m <= g.HIGH) && q.lit >= g.LOW && q.lit <= g.HIGH, 'inside the strip');
      }
      const rng2 = seeded(seed); let p2: any = null;
      for (let i = 0; i < 50; i++) { const q = g.pickQuestion(game, rng2, p2, g.LOW, g.HIGH); p2 = q; if ([q.lit, ...q.targets].some((m: number) => g.isBlack(m))) blackWithout++; }
    }
    assert.ok(blackWithout > 100, `non-vacuity: without the flag ${blackWithout} of 2000 questions used a black key`);
  });

  test(`${file}: with whiteOnly the same signed delta / same triad is never asked twice in a row, and the old call (no flag) behaves exactly as before`, () => {
    const g = pureOf(scriptOf(read(file)));
    const rng = seeded(5); let prev: any = null;
    for (let i = 0; i < 3000; i++) { const q = g.pickQuestion(game, rng, prev, g.LOW, g.HIGH, true); if (prev) assert.ok(!(q.key === prev.key && (game !== 3 || q.lit === prev.lit)), 'no immediate repeat'); prev = q; }
    const a = seeded(9), b = seeded(9); let pa: any = null, pb: any = null;
    for (let i = 0; i < 500; i++) { pa = g.pickQuestion(game, a, pa, g.LOW, g.HIGH); pb = g.pickQuestion(game, b, pb, g.LOW, g.HIGH, false); assert.deepEqual(pa, pb); }
  });
}

test('triads in easy: exactly the seven white-key root-position triads (C, F, G major; D, E, A minor; B diminished), each reached, with the white root lit', () => {
  const g = pureOf(scriptOf(read('interval_ear_triads.html')));
  const seen = new Set<string>(); const rng = seeded(3); let prev: any = null;
  for (let i = 0; i < 4000; i++) { const q = g.pickQuestion(3, rng, prev, g.LOW, g.HIGH, true); prev = q; seen.add(`${NAMES[q.lit % 12]} ${q.key}`); assert.equal(g.isBlack(q.lit), false); }
  assert.deepEqual([...seen].sort(), ['A 3,7', 'B 3,6', 'C 4,7', 'D 3,7', 'E 3,7', 'F 4,7', 'G 4,7']);
});

test('games 1 and 2 in easy: white-to-white deltas of every size appear (the delta may be anything that lands on a white key), and the answer is never the lit note', () => {
  for (const [file, game] of FILES.slice(0, 2)) {
    const g = pureOf(scriptOf(read(file))); const deltas = new Set<number>(); const rng = seeded(2); let prev: any = null;
    for (let i = 0; i < 4000; i++) { const q = g.pickQuestion(game, rng, prev, g.LOW, g.HIGH, true); prev = q; deltas.add(q.targets[0] - q.lit); assert.notEqual(q.targets[0], q.lit); }
    assert.ok(deltas.has(1) && deltas.has(2) && deltas.has(12) && (game === 1 ? deltas.has(-12) && deltas.has(-1) : !deltas.has(-1)), `${file}: ${[...deltas].sort((a, b) => a - b)}`);
  }
});

for (const [file] of FILES) {
  test(`${file}: isInactive(level, midi): a black key in easy only; replayPlan(state, midi, level): the note again for the lit key or a key already clicked while a question is open, in easy and medium; never in hard, never with no question open`, () => {
    const g = pureOf(scriptOf(read(file)));
    assert.equal(g.isInactive('easy', 49), true); assert.equal(g.isInactive('easy', 48), false); assert.equal(g.isInactive('medium', 49), false); assert.equal(g.isInactive('hard', 49), false);
    const q = { game: 1, lit: 60, targets: [67], key: '7', sound: [] };
    let s = g.ask(q, 5); s = g.guess(s, 62).state; s = g.guess(s, 64).state;                          // two wrong keys marked
    for (const level of ['easy', 'medium']) {
      same(g.replayPlan(s, 60, level), [{ midi: 60, when: 0 }], `${level}: the lit note`);
      same(g.replayPlan(s, 62, level), [{ midi: 62, when: 0 }], `${level}: a wrong key already clicked`);
      same(g.replayPlan(s, 65, level), [], `${level}: a key not clicked yet is a normal guess, not a replay`);
    }
    same(g.replayPlan(s, 60, 'hard'), []); same(g.replayPlan(s, 62, 'hard'), []);
    const found = g.guess(s, 67).state;                                                                // solved: the question is over
    same(g.replayPlan(found, 62, 'easy'), [], 'no question open: silent, as before');
    same(g.replayPlan(g.initial(), 60, 'easy'), []);
    const right = g.guess(g.ask({ game: 3, lit: 60, targets: [64, 67], key: '4,7', sound: [] }, 6), 64).state;
    same(g.replayPlan(right, 64, 'medium'), [{ midi: 64, when: 0 }], 'a right key already found');
    // the attempts arithmetic is unchanged: replaying is not a guess
    same(coreFailures(g), []);
  });
}

// ---- the pages -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(file: string, seed = 11) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array; win.__earRandom = seeded(seed);
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const g = pureOf(scriptOf(h));
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const midiOfHz = (hz: number) => { for (let m2 = g.LOW; m2 <= g.HIGH; m2++) if (+g.midiToHz(m2).toFixed(2) === +hz.toFixed(2)) return m2; return -1; };
  const heard = () => [...new Set<number>(stub.osc.map(midiOfHz))];
  const clear = () => { stub.osc.length = 0; stub.all.length = 0; stub.times.length = 0; };
  return {
    win, doc, errors, g, key, stub, heard,
    level: (l: string) => click(doc.getElementById('level-' + l)),
    next: () => { clear(); click(doc.getElementById('next')); return heard(); },
    tap: (m2: number) => { clear(); click(key(m2)); return heard(); },
    hint: () => doc.getElementById('hint').textContent.trim(), counter: () => doc.getElementById('counter').textContent.trim(),
    q: (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi')),
  };
}

for (const [file, game] of FILES) {
  test(`${file} (page): in easy every question is white keys only (lit key, notes heard, 60 questions, both levels switched at runtime); the black keys are inactive: greyed, aria-disabled, silent, no attempt; medium and hard keep the black keys active`, () => {
    const p = open(file, 7); assert.deepEqual(p.errors, []);
    p.level('easy');
    const blackKeys = [...p.doc.querySelectorAll('.key.black')]; assert.equal(blackKeys.length, 10); assert.equal(p.doc.querySelectorAll('.key.white').length, 15);
    for (const k of blackKeys) { assert.match(k.getAttribute('class'), /\binactive\b/); assert.equal(k.getAttribute('aria-disabled'), 'true'); assert.equal(k.getAttribute('tabindex'), '-1'); }
    for (const k of p.doc.querySelectorAll('.key.white')) { assert.doesNotMatch(k.getAttribute('class'), /\binactive\b/); assert.notEqual(k.getAttribute('aria-disabled'), 'true'); }
    for (let i = 0; i < 60; i++) {
      const midis = p.next(); assert.ok(midis.length >= 2 && midis.every((m) => !p.g.isBlack(m)), `question ${i}: ${midis}`);
      assert.equal(p.q('.key.first').length, 1); assert.ok(!p.g.isBlack(p.q('.key.first')[0]));
      if (i === 0) { const before = p.hint(); assert.deepEqual(p.tap(49), [], 'a click on a black key: no sound'); assert.equal(p.hint(), before, 'no attempt used'); assert.equal(p.q('.key.wrong').length, 0, 'no mark'); }
      if (i % 20 === 19) { p.level('medium'); p.level('easy'); }                                   // switching levels at runtime ends the question and the next one is still white
    }
    p.level('medium'); for (const k of p.doc.querySelectorAll('.key.black')) { assert.doesNotMatch(k.getAttribute('class'), /\binactive\b/); assert.notEqual(k.getAttribute('aria-disabled'), 'true'); assert.equal(k.getAttribute('tabindex'), '0'); }
    p.next(); const w = p.tap(49); assert.ok(w.length > 0, 'medium: a black key sounds'); p.level('hard'); assert.equal(p.doc.querySelectorAll('.key.inactive').length, 0);
    assert.deepEqual(p.errors, []);
  });

  test(`${file} (page): a repeated click replays the note in easy and medium (the lit note too), uses no attempt and changes no score; in hard it stays silent`, () => {
    for (const level of ['easy', 'medium']) {
      const p = open(file, 4); p.level(level); const notes = p.next(); const lit = notes[0];
      const wrong = (() => { for (let m = p.g.LOW; m <= p.g.HIGH; m++) if (m !== lit && !notes.includes(m) && !p.g.isInactive(level, m)) return m; throw new Error('no wrong key'); })();
      const attempts = p.hint(), counter = p.counter();
      assert.deepEqual(p.tap(wrong), [wrong], `${level}: the first click sounds the note`);
      const afterFirst = p.hint(); assert.notEqual(afterFirst, attempts, 'the first click used an attempt');
      assert.deepEqual(p.tap(wrong), [wrong], `${level}: the repeated click plays it again`); assert.deepEqual(p.tap(wrong), [wrong], `${level}: and again`);
      assert.deepEqual(p.tap(lit), [lit], `${level}: the lit note plays`); assert.deepEqual(p.tap(lit), [lit], `${level}: and again`);
      assert.equal(p.hint(), afterFirst, `${level}: the repeats used no attempt`); assert.equal(p.counter(), counter, `${level}: no score change`); assert.equal(p.q('.key.wrong').join(), String(wrong), 'the marks are unchanged');
      assert.deepEqual(p.errors, []);
    }
    // a right note already found (game 3 keeps it open): replays too
    if (game === 3) { const p = open(file, 4); p.level('medium'); const n = p.next(); p.tap(n[1]); const left = p.hint(); assert.deepEqual(p.tap(n[1]), [n[1]], 'a right key already found plays again'); assert.equal(p.hint(), left); }
    // hard: silent. The lit note (question open, no attempt used), then the first wrong key (game 3 has two attempts in hard: the question stays open)
    const h = open(file, 4); h.level('hard'); const hn = h.next(); const hhint = h.hint();
    assert.deepEqual(h.tap(hn[0]), [], 'hard: the lit note is silent'); assert.equal(h.hint(), hhint);
    if (game === 3) { const wrong = (() => { for (let m = h.g.LOW; m <= h.g.HIGH; m++) if (!hn.includes(m)) return m; throw new Error('x'); })(); assert.deepEqual(h.tap(wrong), [wrong]); const after = h.hint(); assert.deepEqual(h.tap(wrong), [], 'hard: a repeated click is silent'); assert.equal(h.hint(), after, 'and uses no attempt'); }
    assert.deepEqual(h.errors, []);
  });
}

test('the piano voice block stays byte-identical in the three interval files (the voice is not touched)', () => {
  const voice = (h: string) => { const i = h.indexOf('// ==== piano voice BEGIN'), j = h.indexOf('// ==== piano voice END'); return h.slice(i, h.indexOf('\n', j)); };
  const ref = voice(read(FILES[0][0])); assert.ok(ref.length > 2000);
  for (const [f] of FILES) assert.equal(voice(read(f)), ref, f);
});
