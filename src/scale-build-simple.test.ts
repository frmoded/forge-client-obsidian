// 2026-11-18-0930 - the two single-scale build exercises, scale_build_major.html and scale_build_natural_minor.html, are the SIMPLE variant (driver, on `scales/what a scale is`: "remove easy / medium / hard buttons; remove the New Excercise button; remove the random button").
// No levels, no New exercise, no Random, no selects. ONE rule (the former medium): the THIRD wrong tap ends the build as failed (the answer is shown, the key is not counted); all notes found within 3 wrong taps = completed. The twelve home-note chips at the top are
// the chooser: a tap on a chip starts that key at once, a FRESH build (a tap on ANY chip restarts that key: the current one, a completed one, a failed one, a new one; the answer of a finished build stays on screen until a chip is tapped). On first open nothing is
// started: "Pick a home note." A completed chip stays filled. Reset clears the count AND the build on screen. The three other build files (modes and minor, other scales, ear build the scale) are NOT changed (pinned by hash below).
// Pinned here: the controls are gone; first open; a chip starts a build; the one rule through real clicks; fills; Reset; all twelve; Play; the words; no hover and no tooltip; the shared blocks; the pure core; the three other files unchanged; the generator.
// How TALL the two files are (no vertical scroll at 800 and 360 px, every state) is measured in real Chrome: scripts/dev/measure-scale-build-simple.mjs. The FULL files' flows are in src/scale-build-exercise.test.ts; the completed count in src/scale-exercise-completed.test.ts.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripGadgetCaption } from '../scripts/dev/caption-core.mjs';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { EXERCISE_DIR } from './test-support/scale-exercise-dir.ts';
import { pureOf } from './test-support/interval-ear-core-checks.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = EXERCISE_DIR;                                   // the bundled vault, or the vault source when SCALE_EXERCISE_VAULT is set
const SIMPLE: Array<[string, string, string]> = [['scale_build_major.html', 'major', 'C major'], ['scale_build_natural_minor.html', 'natural_minor', 'C natural minor']];
// the three FULL files must stay byte-identical (sha-256 of their committed content at 2026-11-18; a deliberate change of one of them updates its line here, in the same commit)
const FULL_SHA: Record<string, string> = {
  'scale_build_modes_and_minor.html': '77d971e6c6cdba6e72550eebc597a2521f2b1e944e32e35bba26f01e53eb07b0',
  'scale_build_other_scales.html': '45ceb25ffd7274d12177763c4a830a2cc045e1376a09fca1c3c095facf1c54ad',
  'scale_ear_build_the_scale.html': '6e1fb30dec39516582af3f6b6ed6e5f83c5e720d0fc6649ffe8af484f38e69e5',
};
const ALL_FIVE = [...SIMPLE.map((s) => s[0]), ...Object.keys(FULL_SHA)];
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const block = (h: string, name: string): string => { const a = h.indexOf(`  // ==== ${name} BEGIN`), e = h.indexOf(`  // ==== ${name} END`); assert.ok(a > 0 && e > a, `no "${name}" block`); return h.slice(a, h.indexOf('\n', e)); };
const player = read('scale_player.html');
const g = (f: string) => pureOf(scriptOf(read(f)));
/** the source without comments (the words and the controls are judged on what runs and what shows) */
const codeOf = (h: string): string => h.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/[^\n]*/g, '$1');
/** the page's OWN code: without the three blocks shared with the player (the piano voice has a `level` of its own: the loudness) */
const ownCodeOf = (h: string): string => codeOf(['scale core', 'piano voice', 'scale view'].reduce((t, n) => t.replace(block(h, n), ''), h));

// ---- the pages: real DOM, real clicks ---------------------------------------------------------------------------------------------------------------------------------------
function open(file: string) {
  const h = read(file); const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  const queue: Array<{ fn: () => void; ms: number }> = [];
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  win.__schedule = (fn: () => void, ms: number) => { queue.push({ fn, ms }); return queue.length; }; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const x = pureOf(m[1]);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const chips = (): any[] => [...doc.querySelectorAll('#homes .home')];
  const current = (): number => chips().findIndex((c: any) => c.classList.contains('current'));
  const text = (id: string): string => doc.getElementById(id).textContent.trim();
  const p = {
    win, doc, stub, errors, x, click, key, queue, h, chips, current, text,
    chip: (t: number) => click(chips()[t]),                                            // THE way to start a key
    tap: (midi: number) => click(key(midi)),
    scale: x.SCALES[0] as string,
    model: () => x.exStart(current(), x.SCALES[0]),                                  // the build on screen (its notes), from the chip marked current
    targets: (): number[] => x.exTargets(p.model()),
    /** keys of the octave that are not in the scale (each is a wrong tap) */
    wrongKeys: (): number[] => { const mo = p.model(); const out: number[] = []; for (let k = mo.notes[0] + 1; k < mo.notes[mo.notes.length - 1]; k++) if (mo.notes.indexOf(k) < 0) out.push(k); return out; },
    finish: () => { for (const mm of p.targets()) { const k = key(mm); if (k && !k.classList.contains('lit')) click(k); } },
    fail: () => { for (const mm of p.wrongKeys().slice(0, 3)) click(key(mm)); },
    heads: () => doc.querySelectorAll('#staff .head').length, ghosts: () => doc.querySelectorAll('#staff .head.ghost').length, accs: () => [...doc.querySelectorAll('#staff .acc')].map((a: any) => a.textContent),
    done: (): number[] => chips().map((c: any, i: number) => (c.classList.contains('done') ? i : -1)).filter((i: number) => i >= 0),
    playDisabled: (): boolean => (doc.getElementById('play') as any).disabled,
  };
  return p;
}

// ---- the controls are gone ----------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: no level buttons, no New exercise, no Random, no tonic or scale select, no level or score board: absent from the page and from the code (the dead code and CSS are removed too)`, () => {
    const h = read(f); const code = codeOf(h);
    for (const id of ['levels', 'again', 'random', 'tonic', 'scale', 'scale-label', 'choose', 'counter', 'board']) assert.doesNotMatch(h, new RegExp(`id="${id}"`), `${f}: #${id} is gone from the markup`);
    assert.doesNotMatch(ownCodeOf(h), /level-|"level|\blevel\b|EX_LEVELS|exAttempts|EX_ATTEMPTS|exRandom|__earRandom|exEmptyScores|exCounterText|exBoardText|exTried|exBuilt|exLevelName/, `${f}: no level machinery`);
    assert.doesNotMatch(code, /<select|<option|<label|\$\("(tonic|scale|random|again|levels|counter|board)"\)|#choose|#tonic|#scale|#counter|#board|\.switch|aria-pressed/, `${f}: no controls code or CSS`);
    assert.doesNotMatch(code, /\b(Easy|Medium|Hard|Random|New exercise)\b/i, `${f}: the words of the removed controls are gone`);
    const p = open(f); same(p.errors, []);
    for (const id of ['levels', 'again', 'random', 'tonic', 'scale', 'choose', 'counter', 'board']) assert.equal(p.doc.getElementById(id), null, `${f}: no #${id} in the DOM`);
    assert.equal(p.doc.querySelectorAll('select').length, 0); assert.equal(p.doc.querySelectorAll('[id^="level-"]').length, 0);
    const buttons = [...p.doc.querySelectorAll('button')].map((b: any) => b.textContent.trim());
    assert.equal(buttons.length, 14, 'twelve home notes, Play and Reset: nothing else is a button'); same(buttons.slice(12), ['Play', 'Reset']);
    assert.doesNotMatch(p.doc.body.textContent, /\b(easy|medium|hard|random|new exercise|levels?)\b/i);
  });
}

// ---- first open ---------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: on first open NOTHING is started: "Pick a home note.", no tonic marked on the strip or the staff, the bare staff with its clef, Play off, no steps or letters, the keys ignore taps (and make no sound)`, () => {
    const p = open(f); same(p.errors, []);
    assert.equal(p.text('prompt'), 'Pick a home note.'); assert.equal(p.text('hint'), ''); assert.equal(p.text('completed'), 'Completed 0 of 12');
    assert.equal(p.doc.querySelectorAll('.key').length, 25); assert.equal(p.doc.querySelectorAll('.key.tonic, .key.lit, .key.wrong, .key.reveal').length, 0, 'no tonic marked');
    assert.equal(p.doc.querySelectorAll('.key.idle').length, 25, 'every key is idle');
    assert.equal(p.heads(), 0, 'no note on the staff'); assert.equal(p.doc.querySelectorAll('#staff .staffline').length, 5); assert.equal(p.doc.querySelectorAll('#staff path').length, 1, 'the treble clef is drawn'); assert.equal(p.doc.getElementById('staff').getAttribute('aria-label'), 'Treble staff');
    assert.equal(p.doc.querySelectorAll('#letters .letter').length, 0); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 0);
    assert.equal(p.playDisabled(), true); assert.equal(p.chips().length, 12); assert.equal(p.current(), -1, 'no chip is the current key'); same(p.done(), []);
    const before = p.doc.body.innerHTML;
    for (let m = 60; m <= 72; m++) p.tap(m);
    assert.equal(p.doc.body.innerHTML, before, 'key taps change nothing'); assert.equal(p.stub.osc.length, 0, 'and sound nothing'); assert.equal(p.stub.all.length, 0);
    p.click(p.doc.getElementById('play')); assert.equal(p.stub.osc.length, 0, 'Play is off');
    assert.equal(p.text('sr'), '', 'nothing is announced before a home note is picked');
  });
}

// ---- a chip starts a build at once ----------------------------------------------------------------------------------------------------------------------------------------
for (const [f, scale] of SIMPLE) {
  test(`${f}: tapping a home-note chip starts that key at once (all twelve): the prompt, the tonic on the strip and on the staff, "N to find", "Wrong taps: 0 of 3", the chip marked, the key announced`, () => {
    const p = open(f);
    for (let t = 0; t < 12; t++) {
      p.chip(t); same(p.errors, []);
      assert.equal(p.current(), t); assert.equal(p.chips()[t].getAttribute('aria-current'), 'true'); assert.equal(p.doc.querySelectorAll('#homes [aria-current]').length, 1);
      assert.equal(p.text('prompt'), `Exercise: build ${p.x.scaleTitle(t, scale)}. Tap the other 6 notes on the keys, in any order.`);
      assert.equal(p.doc.querySelectorAll('.key.tonic').length, 1); assert.ok(p.key(60 + t).classList.contains('tonic') && p.key(60 + t).classList.contains('lit'), `the tonic ${t} is marked on the strip`);
      assert.equal(p.doc.querySelectorAll('.key.idle').length, 0, 'the keys answer now');
      assert.equal(p.heads(), 1, 'only the tonic is on the staff'); assert.equal(p.doc.querySelectorAll('#staff .head.tonic').length, 1);
      assert.equal(p.text('hint'), '6 to find'); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3'); assert.equal(p.playDisabled(), true);
      assert.equal(p.doc.querySelectorAll('#letters .letter').length, 0); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 0);
      assert.equal(p.text('sr'), `Exercise: build ${p.x.scaleWords(t, scale)}. The tonic is marked. Wrong taps: 0 of 3.`);
      assert.equal(p.chips()[t].textContent, p.x.tonicName(t, scale), 'the chip says the home note as the page names it');
    }
    assert.equal(p.chips().filter((c: any) => c.getAttribute('aria-label')).length, 12, 'every chip has a name for a screen reader'); assert.match(p.chips()[1].getAttribute('aria-label'), /^C sharp|^D flat/);
  });
}

test('a chip tap in the middle of a build starts a fresh one of the new key (nothing of the old build is left on the keys, the staff or the count of wrong taps)', () => {
  const p = open('scale_build_major.html'); p.chip(0); p.tap(62); p.tap(61); assert.equal(p.text('wrongs'), 'Wrong taps: 1 of 3'); assert.equal(p.heads(), 2);
  p.chip(7); assert.equal(p.current(), 7); assert.equal(p.heads(), 1); assert.equal(p.doc.querySelectorAll('.key.wrong, .key.lit:not(.tonic)').length, 0); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3'); assert.equal(p.text('hint'), '6 to find');
  assert.ok(p.key(67).classList.contains('tonic'), 'G is the home note now');
});

// ---- the one rule: 3 wrong taps ----------------------------------------------------------------------------------------------------------------------------------------------
for (const [f, scale] of SIMPLE) {
  test(`${f}: the single rule, with real clicks: two wrong taps keep it going; the THIRD ends it as failed (the answer is shown, the missed notes dashed, the key is NOT counted, the chip does not fill); nothing after the end`, () => {
    const p = open(f); p.chip(2); const wrongs = p.wrongKeys(); assert.ok(wrongs.length >= 3);
    p.tap(wrongs[0]); assert.equal(p.text('wrongs'), 'Wrong taps: 1 of 3'); assert.ok(p.key(wrongs[0]).classList.contains('wrong')); assert.equal(p.key(wrongs[0]).querySelector('text.mark')!.textContent, '×'); assert.equal(p.heads(), 1, 'a wrong tap puts nothing on the staff');
    assert.equal(p.text('sr'), 'Not in the scale. Wrong taps: 1 of 3.');
    p.tap(wrongs[1]); assert.equal(p.text('wrongs'), 'Wrong taps: 2 of 3'); assert.equal(p.playDisabled(), true, 'two wrong taps: still building'); assert.match(p.text('prompt'), /^Exercise: build /); assert.equal(p.doc.querySelectorAll('.key.idle').length, 0);
    p.tap(wrongs[1]); assert.equal(p.text('wrongs'), 'Wrong taps: 2 of 3', 'a key already marked costs nothing');
    p.tap(wrongs[2]);
    assert.equal(p.text('wrongs'), 'Wrong taps: 3 of 3'); assert.match(p.text('prompt'), /^Exercise over: out of wrong taps\. The notes you missed are dashed\.$/);
    assert.equal(p.heads(), 8, 'the whole scale is on the staff'); assert.equal(p.ghosts(), 6, 'the six notes between the tonic and the octave are missed: dashed'); assert.equal(p.doc.querySelectorAll('.key.reveal').length, 6);
    assert.equal(p.doc.querySelectorAll('#letters .letter').length, 7); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 7); assert.equal(p.playDisabled(), false); assert.equal(p.text('hint'), 'Press Play to hear it.');
    assert.equal(p.text('completed'), 'Completed 0 of 12', 'a failed key is not counted'); same(p.done(), []); assert.equal(p.chips()[2].classList.contains('done'), false);
    assert.equal(p.text('sr'), `Out of wrong taps. Wrong taps: 3 of 3. The scale is ${p.x.scaleWords(2, scale)}. Press Play to hear it.`);
    const html = p.doc.body.innerHTML; p.tap(p.targets()[0]); p.tap(wrongs[3] ?? wrongs[0]); assert.equal(p.doc.body.innerHTML, html, 'the keys are idle after the end: nothing changes');
  });

  test(`${f}: the single rule: all notes found within 3 wrong taps = completed (counted once, its chip filled), with 0, 1 or 2 wrong taps on the way; the end shows the letters and the steps and turns Play on`, () => {
    for (const wrongCount of [0, 1, 2]) {
      const p = open(f); p.chip(5); const wrongs = p.wrongKeys(); for (let i = 0; i < wrongCount; i++) p.tap(wrongs[i]);
      const order = [...p.targets()].reverse(); order.forEach((m, i) => { p.tap(m); if (i < order.length - 1) assert.equal(p.playDisabled(), true); });
      assert.match(p.text('prompt'), /^Exercise done: you built /); assert.equal(p.text('wrongs'), `Wrong taps: ${wrongCount} of 3`); assert.equal(p.text('completed'), 'Completed 1 of 12'); same(p.done(), [5]);
      assert.equal(p.ghosts(), 0); assert.equal(p.heads(), 8); assert.equal(p.doc.querySelectorAll('#letters .letter').length, 7); assert.equal(p.doc.querySelectorAll('#chips .chip').length, 7); assert.equal(p.playDisabled(), false);
      assert.equal(p.text('hint'), 'Press Play to hear it.'); assert.match(p.text('sr'), /^You built /);
      assert.equal(p.chips()[5].classList.contains('done') && p.chips()[5].classList.contains('current'), true, 'filled, and still the current key');
    }
  });
}

test('a right key lights, is marked, and puts its note on the staff with the scale\'s spelling (F sharp for D major); a wrong key is marked and puts nothing on the staff; the tonic, the octave note and the keys outside the octave do nothing', () => {
  const p = open('scale_build_major.html'); p.chip(2);                                // D major: D E F# G A B C# D
  assert.equal(p.text('prompt').startsWith('Exercise: build D major'), true);
  p.tap(66); assert.ok(p.key(66).classList.contains('lit')); assert.equal(p.key(66).querySelector('text.mark')!.textContent, '✓');
  assert.equal(p.heads(), 2); same(p.accs(), ['♯'], 'the F sharp has its sharp'); assert.equal(p.text('hint'), '5 to find');
  p.tap(63); assert.ok(p.key(63).classList.contains('wrong')); assert.equal(p.key(63).querySelector('text.mark')!.textContent, '×');
  assert.equal(p.heads(), 2, 'a wrong tap puts nothing on the staff'); assert.equal(p.text('hint'), '5 to find'); assert.equal(p.text('wrongs'), 'Wrong taps: 1 of 3');
  const before = p.doc.body.innerHTML; for (const m of [62, 74, 61, 75, 84]) p.tap(m); assert.equal(p.doc.body.innerHTML, before, 'the tonic, the octave note and keys outside the octave cost nothing');
  assert.equal(p.doc.getElementById('staff').getAttribute('aria-label')!.includes('C sharp'), false, 'the staff label does not name notes that are not found'); assert.match(p.doc.getElementById('staff').getAttribute('aria-label')!, /F sharp/);
  assert.ok(p.stub.osc.length >= 1, 'a tapped key sounds, right or wrong, and never says which');
});

// ---- the chips: fills, restarts, retries ------------------------------------------------------------------------------------------------------------------------------------
test('a completed chip stays filled: while another key is built, when the same key is started again, and when it is failed later; the chip of the key being built is marked current (border colour), the filled one keeps its fill', () => {
  const p = open('scale_build_major.html'); p.chip(0); p.finish(); same(p.done(), [0]); assert.equal(p.text('completed'), 'Completed 1 of 12');
  p.chip(4); same(p.done(), [0], 'another key is being built: C stays filled'); assert.equal(p.current(), 4); assert.equal(p.chips()[0].classList.contains('current'), false);
  p.fail(); assert.match(p.text('prompt'), /^Exercise over/); same(p.done(), [0]); assert.equal(p.text('completed'), 'Completed 1 of 12');
  p.chip(0); same(p.done(), [0], 'the chip of a completed key keeps its fill when its key is started again'); assert.equal(p.current(), 0); assert.ok(p.chips()[0].classList.contains('done') && p.chips()[0].classList.contains('current'));
  assert.equal(p.heads(), 1, 'a FRESH build: only the tonic is on the staff'); assert.equal(p.text('prompt').startsWith('Exercise: build C major'), true); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3'); assert.equal(p.doc.querySelectorAll('.key.lit:not(.tonic)').length, 0);
  p.fail(); same(p.done(), [0], 'failing a completed key later does not uncount it'); assert.equal(p.text('completed'), 'Completed 1 of 12'); assert.ok(p.chips()[0].classList.contains('done'));
  p.chip(0); p.finish(); assert.equal(p.text('completed'), 'Completed 1 of 12', 'the same key built again counts once');
});

test('a tap on the chip of the CURRENT key restarts it (a finished build: its answer leaves the screen); a failed key can be tried again by tapping its chip and then completes', () => {
  const p = open('scale_build_natural_minor.html'); p.chip(9); p.fail(); assert.match(p.text('prompt'), /^Exercise over/); assert.equal(p.heads(), 8); same(p.done(), []);
  p.chip(9); assert.equal(p.heads(), 1, 'the answer left the screen'); assert.equal(p.doc.querySelectorAll('#letters .letter').length, 0); assert.equal(p.doc.querySelectorAll('.key.reveal, .key.wrong').length, 0); assert.equal(p.playDisabled(), true); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3');
  p.finish(); same(p.done(), [9]); assert.equal(p.text('completed'), 'Completed 1 of 12'); assert.equal(p.chips()[9].textContent, p.x.tonicName(9, 'natural_minor'));
  p.chip(3); p.tap(p.targets()[0]); p.chip(3); assert.equal(p.heads(), 1, 'a restart in the middle of a build too');
});

test('Reset clears the count AND the build on screen: back to "Pick a home note.", the chips unfilled and none current, the keys idle, Play off, the staff bare; the chips work again after it', () => {
  for (const [f] of SIMPLE) {
    const p = open(f); p.chip(1); p.finish(); p.chip(6); p.finish(); p.chip(8); p.tap(p.wrongKeys()[0]); same(p.done(), [1, 6]); assert.equal(p.text('completed'), 'Completed 2 of 12');
    p.click(p.doc.getElementById('reset'));
    assert.equal(p.text('completed'), 'Completed 0 of 12'); same(p.done(), []); assert.equal(p.current(), -1); assert.equal(p.text('prompt'), 'Pick a home note.'); assert.equal(p.text('wrongs'), ''); assert.equal(p.text('hint'), '');
    assert.equal(p.doc.querySelectorAll('.key.tonic, .key.lit, .key.wrong').length, 0); assert.equal(p.doc.querySelectorAll('.key.idle').length, 25); assert.equal(p.heads(), 0); assert.equal(p.playDisabled(), true); assert.equal(p.doc.querySelectorAll('#letters .letter, #chips .chip').length, 0);
    assert.equal(p.text('sr'), 'Count cleared. Pick a home note.');
    p.tap(64); assert.equal(p.heads(), 0, 'the keys ignore taps again'); p.chip(8); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3'); assert.equal(p.current(), 8);
  }
});

test('all twelve completed says "All twelve built." (one gentle line), in both files; a later failure does not take it back', () => {
  for (const [f] of SIMPLE) {
    const p = open(f); for (let t = 0; t < 12; t++) { assert.equal(p.text('completed'), `Completed ${t} of 12`); p.chip(t); p.finish(); }
    assert.equal(p.text('completed'), 'All twelve built.'); assert.equal(p.done().length, 12);
    p.chip(0); p.fail(); assert.equal(p.text('completed'), 'All twelve built.');
  }
});

// ---- Play ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: Play after a build ends (completed or failed) still sounds the whole scale up with the piano voice (every note, the octave note too) and lights each note in turn; before that the button is off and does nothing`, () => {
    for (const how of ['completed', 'failed'] as const) {
      const p = open(f); p.click(p.doc.getElementById('play')); assert.equal(p.stub.osc.length, 0, 'disabled: nothing sounds'); p.chip(0);
      p.click(p.doc.getElementById('play')); assert.equal(p.stub.osc.length, 0, 'building: nothing sounds');
      if (how === 'completed') p.finish(); else p.fail();
      p.stub.osc.length = 0; p.queue.length = 0; p.click(p.doc.getElementById('play'));
      assert.ok(p.stub.osc.length >= 8, `${how}: at least one oscillator per note`); assert.equal(p.queue.length, 9, 'one highlight per note and the end');
      same(p.stub.osc.slice(0, 8).map((hz) => Math.round(69 + 12 * Math.log2(hz / 440))), p.model().notes, `${how}: the scale, from the tonic up to its octave`);
      p.queue[2].fn(); assert.ok(p.key(p.model().notes[2]).classList.contains('sounding')); assert.equal(p.doc.querySelectorAll('#staff .head.sounding').length, 1); assert.equal(p.doc.querySelectorAll('#letters .letter.sounding').length, 1);
      p.queue[8].fn(); assert.equal(p.doc.querySelectorAll('.key.sounding').length, 0);
      assert.match(p.text('sr'), /^Playing /);
    }
  });
}

test('keyboard: a key answers Enter and Space; the keys are buttons with names; a chip is a button reached by Tab (a focus ring like the other buttons)', () => {
  const p = open('scale_build_major.html'); p.chip(0); const k = p.key(64); assert.equal(k.getAttribute('role'), 'button'); assert.equal(k.getAttribute('aria-label'), 'E 4');
  k.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); assert.ok(k.classList.contains('lit'));
  const k2 = p.key(67); k2.dispatchEvent(new p.win.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); assert.ok(k2.classList.contains('lit'));
  assert.ok(p.chips().every((c: any) => c.tagName === 'BUTTON' && c.getAttribute('type') === 'button' && c.getAttribute('tabindex') === null), 'native buttons: focusable and Enter/Space by themselves');
  assert.match(p.h, /button:focus-visible \{ outline: 3px solid var\(--accent\)/);
});

// ---- the words, no hover, no tooltip, no storage, the look ---------------------------------------------------------------------------------------------------------------
test('the words: an exercise, never a test, quiz, game or question; "completed", never "passed"; not in the code, the page text, the labels or the announcements, in any state', () => {
  const FORBIDDEN = /\b(tests?|quiz(zes)?|games?|questions?|passed|levels?)\b/i;
  for (const [f] of SIMPLE) {
    const code = codeOf(read(f)); assert.doesNotMatch(code, /\b(tests?|quiz(zes)?|games?|questions?|passed)\b/i, `${f}: a forbidden word in the code`); assert.doesNotMatch(ownCodeOf(read(f)), /\blevels?\b/i, `${f}: no level`); assert.doesNotMatch(read(f), /Next/, `${f}: no Next`);
    const p = open(f);
    const seen = (): string => [p.doc.body.textContent, ...[...p.doc.querySelectorAll('[aria-label],[aria-description],[title]')].map((e: any) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('aria-description') ?? ''} ${e.getAttribute('title') ?? ''}`), p.text('sr')].join(' ');
    assert.doesNotMatch(seen(), FORBIDDEN, `${f}: fresh`); p.chip(3); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: started`);
    p.tap(p.targets()[0]); p.tap(p.wrongKeys()[0]); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: after taps`);
    p.finish(); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: completed`); p.chip(5); p.fail(); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: failed`);
    p.click(p.doc.getElementById('reset')); assert.doesNotMatch(seen(), FORBIDDEN, `${f}: reset`);
  }
});

test('no hover behaviour and no native tooltip: no :hover rule, no title attribute, no mouse-over or pointer-enter handler (nothing appears, changes or opens because the pointer rests on a chip or a key)', () => {
  for (const [f] of SIMPLE) {
    const h = read(f);
    assert.doesNotMatch(h, /:hover|\btitle=|\.title\s*=|mouseover|mouseenter|mouseout|mouseleave|pointerover|pointerenter|pointermove|onmouse|\bonpointer|setAttribute\(\s*["']title/i, `${f}: nothing reacts to a resting pointer`);
    assert.equal(codeOf(h).match(/<title>/g)!.length, 1, 'the only title is the page\'s own <title>');
    const p = open(f); p.chip(0); assert.equal(p.doc.querySelectorAll('[title]').length, 0);
    assert.doesNotMatch(h, /localStorage|sessionStorage|indexedDB|XMLHttpRequest|fetch\(|https?:\/\/(?!www\.w3\.org)/); assert.doesNotMatch(h, /\bForge\b|forge-/i);
  }
});

test('the look and the height rules: no margin or padding on the page, no fixed or vertical-scroll height, ONE row of twelve chips (a grid) at every width, a focus ring on chips, the completed fill, the current border; the page is exactly its content (measured in real Chrome at 800 and 360 px: scripts/dev/measure-scale-build-simple.mjs)', () => {
  for (const [f] of SIMPLE) {
    const h = read(f); const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1];
    assert.match(h, /html, body \{ margin: 0; padding: 0;/);
    const sizes = css.split('\n').filter((l) => !/^\s*\.sr \{/.test(l)).join('\n').replace(/(min|max|line)-(height|width)\s*:[^;}]*/g, '');
    assert.doesNotMatch(sizes, /overflow|(^|[\s;{])height:\s*(\d|calc)/, `${f}: no fixed height, no scroll box`);
    assert.match(css, /#homes \{ display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/); assert.match(css, /\.home\.done \{ background: #BFE6CD;/); assert.match(css, /\.home\.current \{ border-color: var\(--accent\); \}/);
    assert.match(css, /button:focus-visible \{ outline: 3px solid var\(--accent\)/); assert.match(h, /<div id="homes" role="group" aria-label="Home notes: tap one to build its scale"><\/div>/);
    // the chips come BEFORE the prompt (where the choose row was)
    assert.ok(h.indexOf('id="homes"') < h.indexOf('id="prompt"') && h.indexOf('id="prompt"') < h.indexOf('id="strip"'), 'chips on top, then the prompt, the strip');
  }
});

// ---- the shared blocks, the core, the three other files, the generator ----------------------------------------------------------------------------------------------------
test('the scale core, the piano voice and the scale view are byte-identical with scale_player.html in both SIMPLE files (shared, not re-implemented); the exercise core is identical in the two, pure, and has no level machinery', () => {
  for (const name of ['scale core', 'piano voice', 'scale view']) { const ref = block(player, name); assert.ok(ref.length > 1500); for (const [f] of SIMPLE) assert.equal(block(read(f), name), ref, `${f}: ${name}`); }
  const a = block(read(SIMPLE[0][0]), 'exercise core'); assert.equal(block(read(SIMPLE[1][0]), 'exercise core'), a); assert.ok(a.length > 3500); assert.doesNotMatch(a, /document|window/, 'pure'); assert.doesNotMatch(a, /EX_LEVELS|exAttempts|exRandom|level/);
});

test('the pure core of the simple variant: ONE rule EX_WRONG_TAPS = 3; no levels, no scores, no random; exWrongText; the words for a page with nothing started', () => {
  for (const [f] of SIMPLE) {
    const x = g(f); assert.equal(x.EX_WRONG_TAPS, 3);
    for (const gone of ['EX_LEVELS', 'EX_DEFAULT_LEVEL', 'exAttempts', 'exRandom', 'exEmptyScores', 'exTried', 'exBuilt', 'exCounterText', 'exBoardText']) assert.equal(x[gone], undefined, `${gone} is gone`);
    assert.equal(x.exPrompt(null), 'Pick a home note.'); assert.equal(x.exHint(null), ''); assert.equal(x.exWrongText(null), ''); same(x.exPlayPlan(null), []);
    const s0 = x.exStart(0, x.SCALES[0]); same([s0.phase, s0.left, s0.found, s0.wrong, s0.outcome], ['building', 3, [], [], null]); assert.equal(x.exWrongText(s0), 'Wrong taps: 0 of 3'); assert.equal(x.exHint(s0), '6 to find');
    for (const m of [s0.notes[0], s0.notes[7], 59, 73, 84, 0]) assert.equal(x.exTap(s0, m).state, s0, `a tap on ${m} changes nothing`);
    const wrongs = [] as number[]; for (let k = 61; k < 72; k++) if (s0.notes.indexOf(k) < 0) wrongs.push(k);
    let s = s0; const events: string[] = []; for (let i = 0; i < 3; i++) { const r = x.exTap(s, wrongs[i]); events.push(r.event); s = r.state; assert.equal(s.left, 2 - i); assert.equal(x.exWrongText(s), `Wrong taps: ${i + 1} of 3`); }
    same(events, ['wrong', 'wrong', 'gaveup']); same([s.phase, s.outcome], ['done', 'gaveup']); assert.equal(x.exTap(s, s0.notes[1]).event, 'ignored', 'nothing after the end'); assert.equal(x.exTap(s, wrongs[3]).event, 'ignored');
    // a right key is free, any order; the last builds it; with 0, 1 or 2 wrong taps on the way
    for (const pre of [0, 1, 2]) { let t = s0; for (let i = 0; i < pre; i++) t = x.exTap(t, wrongs[i]).state; const order = [...x.exTargets(s0)].reverse(); order.forEach((m, i) => { const r = x.exTap(t, m); t = r.state; assert.equal(r.event, i === order.length - 1 ? 'built' : 'right'); assert.equal(t.left, 3 - pre, 'a right key is free'); }); same([t.phase, t.outcome], ['done', 'built']); }
    assert.match(x.exPrompt(x.exTap(s0, wrongs[0]).state), /^Exercise: build /); assert.match(x.exPrompt(s), /^Exercise over: out of wrong taps/);
    const sr = x.exAnnounce(x.exTap(s0, wrongs[0]).state, 'wrong'); assert.equal(sr, 'Not in the scale. Wrong taps: 1 of 3.'); assert.doesNotMatch([sr, x.exAnnounce(s0, 'start'), x.exAnnounce(s, 'gaveup')].join(' '), /left/);
  }
});

test('every tonic of both SIMPLE files: the finished build puts on the staff exactly the player\'s spelling (one letter per degree) with the octave note; the staff never shows an answer early (only the tonic at the start; missed notes are ghosts at the end)', () => {
  const playerCore = pureOf(scriptOf(player));
  for (const [f, scale] of SIMPLE) {
    const x = g(f);
    for (let t = 0; t < 12; t++) {
      let s = x.exStart(t, scale); const flags = (st: any): string => x.exStaffNotes(st).map((n: any) => (n.hidden ? 'h' : n.ghost ? 'g' : 'n')).join('');
      assert.equal(flags(s), 'nhhhhhhh'); const gone = x.exTap(s, s.notes[3]).state; assert.equal(flags(gone), 'nhhnhhhh');
      let failed = s; for (const m of [61, 63, 66, 68, 70, 71, 62, 64, 65, 67, 69].filter((m) => s.notes.indexOf(m + t) < 0 && m + t < s.notes[7]).slice(0, 3)) failed = x.exTap(failed, m + t).state; assert.equal(failed.outcome, 'gaveup', `${f} ${t}`); assert.equal(flags(failed), 'ngggggggn'.slice(0, 1) + 'gggggg' + 'n');
      s = x.exTargets(s).reduce((st: any, m: number) => x.exTap(st, m).state, s); assert.equal(s.outcome, 'built', `${scale} ${t}`);
      const want = playerCore.spellScale(t, scale, 'up').map((n: any) => `${n.l}:${n.a}`); want.push(want[0]); same(x.exStaffNotes(s).map((n: any) => `${n.l}:${n.a}`), want, `${scale} from ${t}`);
      assert.equal(new Set(x.exStaffNotes(s).slice(0, 7).map((n: any) => n.l)).size, 7, `${scale} from ${t}: one letter per degree`);
    }
  }
});

test('the three other build files are NOT changed (byte for byte: sha-256 of their committed content), and the generator still reproduces all five files from the two templates and the player', () => {
  for (const [f, sha] of Object.entries(FULL_SHA)) assert.equal(crypto.createHash('sha256').update(stripGadgetCaption(fs.readFileSync(path.join(DIR, f), 'utf8'))).digest('hex'), sha, `${f} changed (apart from its caption block, which 2026-11-19-0940 put inside the figure)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-simple-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scales/resources/html'), { recursive: true }); fs.copyFileSync(path.join(DIR, 'scale_player.html'), path.join(tmp, 'scales/resources/html/scale_player.html'));
    fs.copyFileSync(path.join(DIR, '../../../captions.json'), path.join(tmp, 'captions.json'));                                  // the caption inside the figure (2026-11-19-0940): the generator writes it
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/dev/make-scale-exercises.mjs'), '--vault', tmp], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
    for (const f of ALL_FIVE) assert.equal(fs.readFileSync(path.join(tmp, 'scales/resources/html', f), 'utf8'), read(f), `${f}: the generator's output differs from the file`);
    for (const [f, sha] of Object.entries(FULL_SHA)) assert.equal(crypto.createHash('sha256').update(stripGadgetCaption(fs.readFileSync(path.join(tmp, 'scales/resources/html', f), 'utf8'))).digest('hex'), sha, `${f}: the generator's output changed (apart from its caption block)`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
