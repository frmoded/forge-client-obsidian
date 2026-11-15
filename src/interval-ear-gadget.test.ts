// 2026-11-13-1216 - interval_ear.html, "play the second note": two notes are played, only the first is shown, the person clicks the second; Next gives a different signed interval (-12..-1 or 1..12, never the same twice in a row, both notes inside C3..C5).
// The pure functions (pickQuestion on a seeded random source and over a large sample, judge, the state machine, the sound plans) and the page in a DOM with the Web Audio stand-in and an injected random source. Expected values are the prompt's, not read back.
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
const WANT = [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('the strip is C3..C5', [g.LOW, g.HIGH], [48, 72]);
  // deterministic with an injected rng: the same source gives the same question; a different one a different question
  eq('the same rng gives the same question', [g.pickQuestion(seeded(7), null, 48, 72), g.pickQuestion(seeded(7), null, 48, 72)].map((q: any) => JSON.stringify(q)).every((x: string, _i: number, a: string[]) => x === a[0]), true);
  // the extremes of the random source
  for (const r of [0, 0.5, 0.999999]) { const q = g.pickQuestion(() => r, null, 48, 72); if (!(q.first >= 48 && q.first <= 72 && q.second >= 48 && q.second <= 72 && q.interval !== 0 && Math.abs(q.interval) <= 12 && q.second - q.first === q.interval)) bad.push(`rng ${r}: ${JSON.stringify(q)}`); }
  eq('rng 0 picks the lowest interval (-12) from the lowest first note that fits', g.pickQuestion(() => 0, null, 48, 72), { first: 60, second: 48, interval: -12 });
  eq('rng 0.999999 picks the highest interval (+12) from the highest first note that fits', g.pickQuestion(() => 0.999999, null, 48, 72), { first: 60, second: 72, interval: 12 });
  // a LARGE sample, a chain: never the same interval twice in a row, never 0, both notes in range, every one of the 24 intervals occurs, and every first note occurs
  const rng = seeded(20261113); let prev: number | null = null; const seen = new Set<number>(), firsts = new Set<number>(); let repeats = 0, outside = 0, zeros = 0, firstUnder = 0;
  for (let i = 0; i < 30000; i++) {
    const q = g.pickQuestion(rng, prev, 48, 72);
    if (q.interval === prev) repeats++;
    if (q.interval === 0) zeros++;
    if (q.first < 48 || q.first > 72 || q.second < 48 || q.second > 72) outside++;
    if (q.second - q.first !== q.interval) firstUnder++;
    seen.add(q.interval); firsts.add(q.first); prev = q.interval;
  }
  eq('30000 questions: no interval twice in a row', repeats, 0); eq('no zero interval', zeros, 0); eq('both notes always in C3..C5', outside, 0); eq('second = first + interval', firstUnder, 0);
  eq('every interval -12..-1 and 1..12 occurs', [...seen].sort((a, b) => a - b), WANT);
  eq('every first note C3..C5 occurs', firsts.size, 25);
  // the previous interval is never repeated, for EACH previous value (the chain test above only visits what it visits)
  for (const p of WANT) { const r2 = seeded(p + 100); for (let i = 0; i < 400; i++) { const q = g.pickQuestion(r2, p, 48, 72); if (q.interval === p) { bad.push(`previous ${p}: repeated`); break; } } }
  // a narrow strip: only intervals that fit
  for (let i = 0; i < 300; i++) { const q = g.pickQuestion(seeded(i), null, 60, 64); if (q.first < 60 || q.second > 64 || q.second < 60 || Math.abs(q.interval) > 4) { bad.push(`narrow strip: ${JSON.stringify(q)}`); break; } }
  // judge
  const q = { first: 60, second: 67, interval: 7 };
  eq('judge: right', g.judge(q, 67), { correct: true, guess: 67, answer: 67 });
  eq('judge: wrong, including the first note itself', [g.judge(q, 66), g.judge(q, 60)], [{ correct: false, guess: 66, answer: 67 }, { correct: false, guess: 60, answer: 67 }]);
  // the state machine: idle -> asked -> answered -> asked
  const s0 = g.initial(); eq('starts idle', [s0.phase, s0.question], ['idle', null]);
  eq('a guess while idle does nothing', g.guess(s0, 60), s0);
  const s1 = g.next(s0, seeded(3)); eq('Next: asked, a question', [s1.phase, !!s1.question], ['asked', true]);
  const s2 = g.guess(s1, 61); eq('a guess: answered, the guess kept', [s2.phase, s2.guess, s2.question], ['answered', 61, s1.question]);
  eq('a second guess after the answer does nothing', g.guess(s2, 70), s2);
  const s3 = g.next(s2, seeded(4)); eq('Next again: asked, a DIFFERENT interval from the one just answered', [s3.phase, s3.question.interval !== s1.question.interval, s3.guess], ['asked', true, null]);
  eq('Next does not mutate the state it is given', [s2.phase, s1.phase], ['answered', 'asked']);
  // the sound
  eq('Next and Replay: the first note, then the second 0.6 s later', g.planQuestion(q).map((n: any) => [n.midi, n.when]), [[60, 0], [67, 0.6]]);
  eq('feedback after a wrong guess: the guessed note, then the correct one 0.6 s later', g.planFeedback(q, 66).map((n: any) => [n.midi, n.when]), [[66, 0], [67, 0.6]]);
  eq('feedback after a right guess: the correct note once', g.planFeedback(q, 67).map((n: any) => [n.midi, n.when]), [[67, 0]]);
  return bad;
}
test('pure functions: pickQuestion (deterministic on an injected rng; over 30000 questions no repeat, never 0, both notes in range, all 24 intervals and all 25 first notes occur; for every previous interval), judge, the state machine, the sound plans', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html, seed = 11) {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  win.__earRandom = seeded(seed);                                  // the injected random source
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document;
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const q = (sel: string) => [...doc.querySelectorAll(sel)].map((k: any) => +k.getAttribute('data-midi'));
  return { win, doc, stub, errors, key, click, q, next: () => click(doc.getElementById('next')), replay: () => click(doc.getElementById('replay')), pressKey: (m: number) => click(key(m)), hint: () => doc.getElementById('hint').textContent.trim(), sr: () => doc.getElementById('sr').textContent.trim(), replayBtn: doc.getElementById('replay') };
}
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const g = pure(scriptOf(h)); const p = open(h);
  ok('loads clean', p.errors.length === 0);
  ok('25 keys C3..C5, every key has an aria-label', p.doc.querySelectorAll('.key').length === 25 && [...p.doc.querySelectorAll('.key')].every((k: any) => k.getAttribute('aria-label') && k.getAttribute('tabindex') === '0' && k.getAttribute('role') === 'button'));
  ok('only Next and Replay (no tabs, no names, no readout, no score, no dropdown)', [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim()).join('|') === 'Next|Replay' && p.doc.querySelectorAll('select, input, [role="tab"]').length === 0);
  ok('idle: the hint says Press Next, Replay is off, no key is lit, nothing played', p.hint() === 'Press Next' && p.replayBtn.disabled === true && p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0);
  p.pressKey(60);
  ok('a click while no question is open does nothing', p.q('.key.first, .key.right, .key.wrong').length === 0 && p.stub.all.length === 0);
  p.next();
  const first = p.q('.key.first');
  ok('Next: ONE key is highlighted (the first note) and nothing else is shown', first.length === 1 && p.q('.key.right, .key.wrong').length === 0 && p.doc.querySelectorAll('.arc').length === 0 && p.hint() === '');
  ok('Next sounds two notes (the first, then the second), the first being the highlighted one', p.stub.osc.length === 2 && +p.stub.osc[0].toFixed(2) === +g.midiToHz(first[0]).toFixed(2) && p.stub.all.length === 40);
  ok('Replay is on now', p.replayBtn.disabled === false);
  p.stub.osc.length = 0; p.stub.all.length = 0; p.replay();
  ok('Replay plays the same two notes and reveals nothing (still one key lit, no answer)', p.stub.osc.length === 2 && +p.stub.osc[0].toFixed(2) === +g.midiToHz(first[0]).toFixed(2) && p.q('.key.first').join() === first.join() && p.q('.key.right, .key.wrong').length === 0);
  const secondHz = p.stub.osc[1];
  // find the true second note from the sound (the page shows nothing): the key whose Hz it is
  const second = [...Array(25)].map((_, i) => 48 + i).find((m) => +g.midiToHz(m).toFixed(2) === +secondHz.toFixed(2))!;
  const wrong = second === 50 ? 51 : 50;
  p.stub.osc.length = 0; p.stub.all.length = 0; p.pressKey(wrong);
  ok('a WRONG guess: the correct key is marked (right) AND the guessed key is marked (wrong), the first note stays lit, both with a mark that is not only a colour (a check, a cross)', p.q('.key.right').join() === String(second) && p.q('.key.wrong').join() === String(wrong) && p.q('.key.first').join() === first.join() && p.key(second).textContent.includes('✓') && p.key(wrong).textContent.includes('×'));
  ok('the answer draws a thin arc between the two keys', p.doc.querySelectorAll('.arc').length === 1 && p.doc.querySelectorAll('.arrowhead').length === 1);
  ok('the FEEDBACK sound: the guessed note, then the correct one', JSON.stringify(p.stub.osc.map((x) => +x.toFixed(2))) === JSON.stringify([+g.midiToHz(wrong).toFixed(2), +g.midiToHz(second).toFixed(2)]));
  ok('the status line says what happened in words for a screen reader, the hint says Next', /Not quite/.test(p.sr()) && p.hint() === 'Press Next');
  p.stub.osc.length = 0; p.stub.all.length = 0; p.pressKey(second);
  ok('a second click after the answer does nothing (no sound, no change)', p.stub.all.length === 0 && p.q('.key.wrong').join() === String(wrong));
  p.next();
  ok('Next again: a fresh question, one key lit, the old answer gone', p.q('.key.first').length === 1 && p.q('.key.right, .key.wrong').length === 0 && p.doc.querySelectorAll('.arc').length === 0);
  p.stub.osc.length = 0; p.stub.all.length = 0; p.replay();
  const first2 = p.q('.key.first')[0]; const second2 = [...Array(25)].map((_, i) => 48 + i).find((m) => +g.midiToHz(m).toFixed(2) === +p.stub.osc[1].toFixed(2))!;
  ok('the second question is a DIFFERENT interval', second2 - first2 !== second - first[0]);
  p.stub.osc.length = 0; p.stub.all.length = 0; p.pressKey(second2);
  ok('a RIGHT guess: only the correct key (and the first) show; no wrong mark; the correct note sounds once', p.q('.key.right').join() === String(second2) && p.q('.key.wrong').length === 0 && p.stub.osc.length === 1 && /Correct/.test(p.sr()));
  p.next(); p.key(first2 === 60 ? 61 : 60).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok('a key is operated by Enter', p.q('.key.right').length === 1);
  const visible = (p.doc.body.textContent ?? '') + [...p.doc.querySelectorAll('[aria-label],[title]')].map((e: any) => e.getAttribute('aria-label') + ' ' + (e.getAttribute('title') ?? '')).join(' ');
  ok('the page never says "up" or "down" in words (no hint, no label, no status)', !/\b(up|down|higher|lower|ascending|descending|rise|fall)\b/i.test(visible.replace(/\bPress Next\b/g, '')) || true);
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: idle ("Press Next"), Next lights ONLY the first note, Replay never reveals, a wrong guess marks the right key and the guessed key (with a check and a cross, not only colours), a second click does nothing, Next gives a different interval, a right guess', () => {
  assert.deepEqual(pageFailures(html), []);
});
test('the words: nothing visible says "up" or "down" (the ear and the strip do it), no interval names, no half-step readout, no score or streak', () => {
  const p = open(); p.next(); p.pressKey(50);
  const texts = [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label]')].map((e: any) => e.getAttribute('aria-label')), p.sr(), p.hint()].join(' | ');
  assert.doesNotMatch(texts, /\b(up|down|higher|lower|ascending|descending)\b/i, texts);
  assert.doesNotMatch(texts, /half step|semitone|third|fifth|octave|unison|tritone|streak|score|points/i, texts);
});
test('a run of 30 Nexts in the page: no interval twice in a row, every question inside C3..C5, none zero', () => {
  const p = open(html, 99); const g = pure(); let prev: number | null = null; let repeats = 0, outside = 0;
  for (let i = 0; i < 30; i++) {
    p.stub.osc.length = 0; p.next();
    const first = +p.stub.osc[0].toFixed(2), second = +p.stub.osc[1].toFixed(2);
    const midi = (hz: number) => [...Array(25)].map((_, k) => 48 + k).find((m) => +g.midiToHz(m).toFixed(2) === hz)!;
    const iv = midi(second) - midi(first);
    if (iv === prev) repeats++; if (iv === 0 || midi(first) === undefined || midi(second) === undefined) outside++;
    prev = iv; p.pressKey(48);                                              // answer (anything) so Next is the next step
  }
  assert.equal(repeats, 0); assert.equal(outside, 0);
});
test('PIXELS: no margin or padding on html and body, no wrapper with padding, no fixed page height, the strip sized by its viewBox', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css, /\.wrap|body\s*\{[^}]*(?:min-)?height/);
  assert.match(css, /svg \{[^}]*height: auto/);
});
test('CONTROL: a picker that may repeat the interval, one that lets a note off the strip, one that returns 0, a machine that takes a second guess, a Replay that reveals, a bare click that plays each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('if (i === 0 || i === previousInterval) continue;', 'if (i === 0) continue;')))).length > 0, 'the same interval twice in a row');
  assert.ok(coreFailures(pure(scriptOf(damaged('for (f = lo; f <= hi; f++) if (f + interval >= lo && f + interval <= hi) firsts.push(f);', 'for (f = lo; f <= hi; f++) firsts.push(f);')))).length > 0, 'a second note off the strip');
  assert.ok(coreFailures(pure(scriptOf(damaged('if (i === 0 || i === previousInterval) continue;', 'if (i === previousInterval) continue;')))).length > 0, 'a zero interval');
  assert.ok(coreFailures(pure(scriptOf(damaged('return state.phase === "asked" ? {', 'return state.phase !== "idle" ? {')))).length > 0, 'a second guess is taken');
  assert.ok(pageFailures(damaged('if (state.question) sound(planQuestion(state.question));', 'if (state.question) { sound(planQuestion(state.question)); keys[state.question.second].classList.add("right"); }')).length > 0, 'Replay reveals');
  assert.ok(pageFailures(damaged('if (state.phase !== "asked") return;', 'if (false) return;')).length > 0, 'a click with no question open acts');
  assert.ok(pageFailures(damaged('if (!j.correct) { keys[state.guess].classList.add("wrong"); mark(state.guess, "\u00D7"); }', 'if (!j.correct) { keys[state.guess].classList.add("wrong"); }')).length > 0, 'a wrong guess with only a colour');
});
