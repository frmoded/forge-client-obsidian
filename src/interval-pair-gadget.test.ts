// 2026-11-13-1215 - GADGET 1, interval_pair.html: "two notes, and the distance between them". 13 keys C4..C5, a Play button, a one-line readout, nothing else. Pure functions (halfSteps, the wording, the selection state machine, the play plan) and the page in a DOM
// with a Web Audio stand-in; the expected values are the prompt's published ones, not read back from the page. The sound is the shared piano voice (src/piano-voice.test.ts pins the block identical in every gadget).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';

const DIR = path.resolve(import.meta.dirname, '../assets/vaults/music-theory/music_instruments/resources/html');
const html = fs.readFileSync(path.join(DIR, 'interval_pair.html'), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
function pure(source: string = scriptOf(html)): any { const mod: { exports: any } = { exports: {} }; vm.runInNewContext(source, { module: mod, Math, Float32Array }); return mod.exports; }

/** Every claim about the pure functions, as failures (empty = all hold). */
function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  for (let a = 60; a <= 72; a++) for (let b = 60; b <= 72; b++) eq(`halfSteps(${a}, ${b})`, g.halfSteps(a, b), Math.abs(a - b));         // the distance, either way round
  // the wording, by the published table: singular for 1, "the same note" for 0, "an octave" for 12, plain plural otherwise
  const WORDS: Record<number, string> = { 0: '0 half steps: the same note', 1: '1 half step', 2: '2 half steps', 3: '3 half steps', 4: '4 half steps', 5: '5 half steps', 6: '6 half steps', 7: '7 half steps', 8: '8 half steps', 9: '9 half steps', 10: '10 half steps', 11: '11 half steps', 12: '12 half steps: an octave' };
  for (const [n, w] of Object.entries(WORDS)) eq(`readout of ${n}`, g.readout({ a: 60, b: 60 + +n }), w);
  eq('the readout goes by the distance, not the order', [g.readout({ a: 64, b: 60 }), g.readout({ a: 72, b: 60 })], ['4 half steps', '12 half steps: an octave']);
  eq('no interval NAMES anywhere in the readouts', Object.values(WORDS).some((w) => /third|fifth|second|fourth|sixth|seventh|tritone|unison|major|minor|perfect/i.test(w)), false);
  eq('hints before two keys', [g.readout({ a: null, b: null }), g.readout({ a: 60, b: null })], ['Click a key, then a second key.', 'Now click a second key.']);
  // the selection state machine, as a truth table
  const E = { a: null, b: null };
  eq('first key', g.select(E, 62), { a: 62, b: null });
  eq('a second, different key', g.select({ a: 62, b: null }, 67), { a: 62, b: 67 });
  eq('a second key lower than the first keeps the order of choosing', g.select({ a: 67, b: null }, 62), { a: 67, b: 62 });
  eq('the lone first key again clears it', g.select({ a: 62, b: null }, 62), E);
  eq('a third click starts over with that key as the first', g.select({ a: 62, b: 67 }, 70), { a: 70, b: null });
  eq('... even on one of the two chosen', [g.select({ a: 62, b: 67 }, 62), g.select({ a: 62, b: 67 }, 67)], [{ a: 62, b: null }, { a: 67, b: null }]);
  // what Play sounds
  eq('no plan until two keys', [g.planPlay(E), g.planPlay({ a: 60, b: null })], [[], []]);
  const plan = g.planPlay({ a: 67, b: 60 });
  eq('the LOWER note first, the higher 0.6 s later, then both together', plan.map((n: any) => [n.midi, +n.when.toFixed(2)]), [[60, 0], [67, 0.6], [60, 1.5], [67, 1.5]]);
  eq('equal temperament Hz', plan.slice(0, 2).map((n: any) => +n.hz.toFixed(2)), [261.63, 392]);
  eq('range', [g.LOW, g.HIGH], [60, 72]);
  eq('names', [g.midiToName(60), g.midiToName(61), g.midiToName(72)], ['C4', 'C#4', 'C5']);
  return bad;
}
test('pure functions: halfSteps for every pair of the 13 keys, the readout wording (1 half step, 0 = the same note, 12 = an octave, no names), the selection state machine, what Play sounds', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------
function open(h: string = html) {
  const stub = audioStub(); const errors: string[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document;
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const pick = (midi: number) => click(key(midi));
  const lit = () => [...doc.querySelectorAll('.key.held')].map((k: any) => +k.getAttribute('data-midi')).sort((a: number, b: number) => a - b);
  return { win, doc, stub, errors, key, pick, lit, click, readout: () => doc.getElementById('readout').textContent.trim(), play: doc.getElementById('play') };
}
/** Every claim about the page, as failures. */
function pageFailures(h: string): string[] {
  const bad: string[] = []; const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const p = open(h);
  ok('loads clean', p.errors.length === 0);
  const keys = [...p.doc.querySelectorAll('.key')];
  ok('13 keys C4..C5: 8 white and 5 black', keys.length === 13 && p.doc.querySelectorAll('.key.white').length === 8 && p.doc.querySelectorAll('.key.black').length === 5 && !!p.key(60) && !!p.key(72) && !p.key(59) && !p.key(73));
  ok('the black keys are the sharps of C D F G A', [61, 63, 66, 68, 70].every((m) => p.key(m).classList.contains('black')));
  ok('every key is keyboard operable with an aria-label of its note name and number', keys.every((k: any) => k.getAttribute('tabindex') === '0' && k.getAttribute('role') === 'button' && /^[A-G]#?\d, note number \d+$/.test(k.getAttribute('aria-label'))) && p.key(60).getAttribute('aria-label') === 'C4, note number 60');
  ok('nothing else on the page: one button (Play), no dropdown, no tabs, no Clear, no input', p.doc.querySelectorAll('button').length === 1 && p.doc.querySelectorAll('select, input, textarea, [role="tab"]').length === 0 && p.play.textContent.trim() === 'Play');
  ok('opens idle: hint, Play disabled, nothing playing', p.readout() === 'Click a key, then a second key.' && p.play.disabled === true && p.stub.all.length === 0 && p.lit().length === 0);
  p.pick(64);
  ok('one key chosen: it is lit, the hint changes, Play is still disabled, nothing played', JSON.stringify(p.lit()) === '[64]' && p.readout() === 'Now click a second key.' && p.play.disabled === true && p.stub.all.length === 0);
  p.pick(64);
  ok('clicking the lone first key again clears it', p.lit().length === 0 && p.readout() === 'Click a key, then a second key.');
  p.pick(60); p.pick(64);
  ok('two keys: both lit, "4 half steps", Play enabled, STILL nothing played by the clicks', JSON.stringify(p.lit()) === '[60,64]' && p.readout() === '4 half steps' && p.play.disabled === false && p.stub.all.length === 0);
  p.pick(70);
  ok('a third click starts over: only that key is lit, the hint is back, Play off', JSON.stringify(p.lit()) === '[70]' && p.readout() === 'Now click a second key.' && p.play.disabled === true);
  p.pick(71);
  ok('1 half step (singular)', p.readout() === '1 half step');
  p.pick(66); p.pick(66); ok('0 half steps is only reachable by choosing the same key twice, which clears it (so never shown)', p.lit().length === 0);
  p.pick(60); p.pick(72);
  ok('12 half steps: an octave', p.readout() === '12 half steps: an octave');
  p.pick(67); p.pick(60);
  ok('the readout is the distance, whichever key is higher', p.readout() === '7 half steps');
  p.play.dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  ok('Play sounds four notes: the lower, the higher, then both (the first oscillator of each note = its pitch)', JSON.stringify(p.stub.osc.map((x) => +x.toFixed(2))) === JSON.stringify([261.63, 392, 261.63, 392]) && p.stub.all.length === 4 * 20);
  p.key(64).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  ok('a key is operated by Enter and by Space too, and that plays nothing either', p.lit().join() === '64' && p.stub.all.length === 80);
  p.key(66).dispatchEvent(new p.win.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  ok('Space', p.lit().join() === '64,66' && p.readout() === '2 half steps');
  ok('no error', p.errors.length === 0);
  return bad;
}
test('the page in a DOM: 13 keys, one Play button and one line, the selection rules, nothing plays on a bare click, Play = lower, higher, together', () => {
  assert.deepEqual(pageFailures(html), []);
});

// ---- pixels: the page is exactly its content --------------------------------------------------------------------------------------------------------------------------------
test('PIXELS: no margin or padding on html and body, no fixed or minimum height on the page, the strip is sized by its viewBox (a measured height in real Chrome is in the FEEDBACK)', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1];
  assert.match(css, /html,\s*body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/);
  assert.doesNotMatch(css.replace(/button\s*\{[^}]*\}/g, '').replace(/\.row\s*\{[^}]*\}/g, ''), /(?:^|[;{\s])(?:min-)?height:\s*\d/m, 'no fixed height outside the button and the control row');
  assert.doesNotMatch(css, /\.wrap|padding:\s*\d+px\s+\d+px\s+\d+px/, 'no wrapper with padding');
  assert.match(html, /svg \{[^}]*height: auto/);
});

// ---- CONTROL: the checks can fail -------------------------------------------------------------------------------------------------------------------------------------------
test('CONTROL: a wording that says "1 half steps", a state machine that never starts over, a first-key-again that does not clear, a Play that plays the higher note first, a bare click that plays each go red', () => {
  assert.deepEqual(coreFailures(pure()), []); assert.deepEqual(pageFailures(html), []);
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `premise: ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('(n === 1 ? " half step" : " half steps")', '" half steps"')))).length > 0, 'singular');
  assert.ok(coreFailures(pure(scriptOf(damaged('return { a: m, b: null };\n  }\n  // What Play', 'return state;\n  }\n  // What Play')))).length > 0, 'never starts over');
  assert.ok(coreFailures(pure(scriptOf(damaged('return m === state.a ? { a: null, b: null } : { a: state.a, b: m };', 'return { a: state.a, b: m };')))).length > 0, 'first key again does not clear');
  assert.ok(coreFailures(pure(scriptOf(damaged('var lo = Math.min(state.a, state.b), hi = Math.max(state.a, state.b);', 'var lo = Math.max(state.a, state.b), hi = Math.min(state.a, state.b);')))).length > 0, 'higher first');
  assert.ok(pageFailures(damaged('function choose(m) { state = select(state, m); render(); }', 'function choose(m) { state = select(state, m); render(); $("play").click(); }')).length > 0, 'a bare click plays');
  assert.ok(pageFailures(damaged('return "12 half steps: an octave"', 'return "12 half steps"')).length > 0 || coreFailures(pure(scriptOf(damaged('return "12 half steps: an octave"', 'return "12 half steps"')))).length > 0, 'the octave wording');
});
