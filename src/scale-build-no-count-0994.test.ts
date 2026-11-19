// 2026-11-19-0994 (driver R1, on `scales/what a scale is (the major scale)`): "1. Do not count wrong taps. 2. Do not show the W W H below the score and above the note names (C D E)."
// The two single-scale exercises (scale_build_major, scale_build_natural_minor: the SIMPLE template) carry two flags in their `config` block, both false there:
//   var COUNT_WRONG_TAPS = false;   no limit, no "gaveup", no counter text anywhere; a wrong tap keeps its quiet mark and the plain hint "Not in the scale."; a pair is completed when it is built
//   var SHOW_STEP_CHIPS = false;    the #chips row (W W H W W W H) is not drawn: the letters row sits directly under the staff
// The other three files (modes and minor, other scales, ear build the scale) are the FULL template: they do not have the flags and stay byte for byte (src/scale-build-simple.test.ts pins their sha-256).
// A flag set to true gives the older behaviour back (3 wrong taps end the build, "Wrong taps: n of 3", the step chips): proved here by flipping the two config lines of the generated page.
// Where the pages are read: src/test-support/scale-exercise-dir.ts (the bundled vault, or SCALE_EXERCISE_VAULT=~/projects/music-theory).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { audioStub } from './test-support/web-audio-stub.ts';
import { EXERCISE_DIR } from './test-support/scale-exercise-dir.ts';
import { pureOf } from './test-support/interval-ear-core-checks.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIMPLE: Array<[string, string]> = [['scale_build_major.html', 'major'], ['scale_build_natural_minor.html', 'natural_minor']];
const FULL = ['scale_build_modes_and_minor.html', 'scale_build_other_scales.html', 'scale_ear_build_the_scale.html'];
/** like assert.doesNotMatch, but a failure names only what matched (the page text is long: a full diff of it is slow) */
const noMatch = (str: string, re: RegExp, msg: string): void => { const m = re.exec(str); assert.ok(!m, `${msg}: found "${m?.[0]}" near "${m ? str.slice(Math.max(0, m.index - 40), m.index + 60) : ''}"`); };
/** no wrong-tap mark of any kind: no .key.wrong, no cross text */
const noWrongMarks = (p: { doc: any }, where: string): void => { assert.equal(p.doc.querySelectorAll('.key.wrong').length, 0, `${where}: no .key.wrong`); assert.ok([...p.doc.querySelectorAll('text.mark')].every((t: any) => t.textContent !== '\u00D7'), `${where}: no cross`); };
const same = (a: unknown, b: unknown, m?: string): void => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const read = (f: string): string => fs.readFileSync(path.join(EXERCISE_DIR, f), 'utf8');
/** the page with the two flags turned on (the older behaviour) */
const flagsOn = (h: string): string => h.replace('var COUNT_WRONG_TAPS = false;', 'var COUNT_WRONG_TAPS = true;').replace('var SHOW_STEP_CHIPS = false;', 'var SHOW_STEP_CHIPS = true;');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];
const configOf = (h: string): string => { const a = h.indexOf('  // ==== config BEGIN'), e = h.indexOf('  // ==== config END'); assert.ok(a > 0 && e > a, 'no config block'); return h.slice(a, h.indexOf('\n', e)); };

function open(h: string) {
  const stub = audioStub(); const errors: string[] = []; const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); }; win.AudioContext = stub.Ctx; win.Float32Array = Float32Array;
  win.__schedule = () => 1; win.__unschedule = () => {};
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!; win.document.write(h.replace(m[0], '')); win.eval(m[1]);
  const doc = win.document; const x = pureOf(m[1]);
  const click = (e: any) => e.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const key = (midi: number) => doc.querySelector(`.key[data-midi="${midi}"]`);
  const slots = (): any[] => [...doc.querySelectorAll('#shelf .slot')];
  const text = (id: string): string => (doc.getElementById(id)?.textContent ?? '').trim();
  const p = {
    win, doc, stub, errors, x, click, key, slots, text, scale: x.SCALES[0] as string,
    start: (t: number) => click(slots()[t]), tap: (midi: number) => click(key(midi)),
    current: (): number => slots().findIndex((c: any) => c.classList.contains('current')),
    model: () => x.exStart(p.current(), x.SCALES[0]),
    targets: (): number[] => x.exTargets(p.model()),
    wrongKeys: (): number[] => { const mo = p.model(); const out: number[] = []; for (let k = mo.notes[0] + 1; k < mo.notes[mo.notes.length - 1]; k++) if (mo.notes.indexOf(k) < 0) out.push(k); return out; },
    finish: () => { for (const mm of p.targets()) { const k = key(mm); if (k && !k.classList.contains('lit')) click(k); } },
    heads: () => doc.querySelectorAll('#staff .head').length, ghosts: () => doc.querySelectorAll('#staff .head.ghost').length,
    done: (): number[] => slots().map((c: any, i: number) => (c.classList.contains('done') ? i : -1)).filter((i: number) => i >= 0),
    visible: (): string => [doc.querySelector('.wrap').textContent, text('sr'), ...[...doc.querySelectorAll('[aria-label],[aria-description]')].map((e: any) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('aria-description') ?? ''}`)].join(' | '),
    chipCount: (): number => doc.querySelectorAll('#chips .chip').length,
  };
  return p;
}

// ---- the flags --------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: the two flags are lines of the config block, both false (they are the only lines the rules hang on, so they may differ between files)`, () => {
    const c = configOf(read(f));
    assert.match(c, /^\s*var COUNT_WRONG_TAPS = false;\s*$/m, `${f}: COUNT_WRONG_TAPS = false in the config block`); assert.match(c, /^\s*var SHOW_STEP_CHIPS = false;\s*$/m, `${f}: SHOW_STEP_CHIPS = false in the config block`);
    assert.equal(read(f).match(/var COUNT_WRONG_TAPS/g)!.length, 1, 'declared once'); assert.equal(read(f).match(/var SHOW_STEP_CHIPS/g)!.length, 1, 'declared once');
  });
}

test('the other three files are the FULL template: no flags, still the count ("wrong taps left"), the limit per level and the step chips; their bytes are pinned in src/scale-build-simple.test.ts', () => {
  for (const f of FULL) {
    const h = read(f); assert.doesNotMatch(h, /COUNT_WRONG_TAPS|SHOW_STEP_CHIPS/, `${f}: no flag`); assert.match(h, /wrong taps? left/); assert.match(h, /EX_ATTEMPTS/); assert.match(h, /id="chips"/);
    const p = open(h); p.start(0); assert.match(p.text('hint'), /to find, 3 wrong taps left/, `${f}: still counts`);
  }
});

// ---- 1. no count, no limit ------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: NO counter text anywhere: not on a fresh page, not when a tonic starts, not after wrong taps, not at the end; no #wrongs span; the start and wrong announcements carry no count`, () => {
    const p = open(read(f)); same(p.errors, []);
    const COUNT = /wrong taps|\bof 3\b|\bleft\b/i;
    assert.ok(p.doc.getElementById('wrongs') === null, 'no #wrongs span'); noMatch(p.visible(), COUNT, 'fresh');
    p.start(2); assert.equal(p.text('sr'), `Exercise: build ${p.x.scaleWords(2, p.scale)}. The tonic is marked.`); noMatch(p.visible(), COUNT, 'started'); assert.equal(p.text('hint'), '6 to find');
    for (const k of p.wrongKeys()) { p.tap(k); noMatch(p.visible(), COUNT, `after a wrong tap on ${k}`); }
    assert.equal(p.text('sr'), 'Not in the scale.'); p.finish(); noMatch(p.visible(), COUNT, 'built'); assert.match(p.text('prompt'), /^Exercise done: you built /); assert.match(p.text('sr'), /^You built /);
  });

  test(`${f}: a wrong tap gets its quiet mark and the hint exactly "Not in the scale." (the same words for a screen reader), no red text; the next right tap brings "N to find" back; a wrong tap puts nothing on the staff`, () => {
    const p = open(read(f)); p.start(0); const wk = p.wrongKeys(); const tg = p.targets();
    p.tap(wk[0]); assert.ok(p.key(wk[0]).classList.contains('wrong')); assert.equal(p.key(wk[0]).querySelector('text.mark')!.textContent, '×'); assert.equal(p.text('hint'), 'Not in the scale.'); assert.equal(p.text('sr'), 'Not in the scale.'); assert.equal(p.heads(), 1);
    p.tap(wk[0]); assert.equal(p.text('hint'), 'Not in the scale.', 'a key already marked changes nothing');
    p.tap(wk[1]); assert.equal(p.text('hint'), 'Not in the scale.'); assert.equal(p.doc.querySelectorAll('.key.wrong').length, 2);
    p.tap(tg[0]); assert.equal(p.text('hint'), '5 to find'); assert.equal(p.text('sr'), 'That note is in the scale. 5 to find.'); assert.equal(p.doc.querySelectorAll('.key.wrong').length, 2, 'the quiet marks stay while the build goes on');
    const hint = p.doc.getElementById('hint')!; assert.equal(hint.getAttribute('class'), null); assert.equal(hint.getAttribute('style'), null);
    const css = /<style>([\s\S]*?)<\/style>/.exec(read(f))![1]; const rule = /#hint \{([^}]*)\}/.exec(css)![1]; assert.doesNotMatch(rule, /--wrong|--accent|red|#D72027/i, 'the hint is in ink colour: no red text');
    assert.doesNotMatch(css, /#wrongs \{[^}]*(--wrong|--accent|red)/);
  });

  test(`${f}: NO LIMIT: every wrong key of the octave tapped (more than three) does not end the build: no "gaveup", no ghosts, the keys still answer, Play stays off, the prompt still asks; the build ends only when every note is found`, () => {
    for (const t of [0, 7, 11]) {
      const p = open(read(f)); p.start(t); const wk = p.wrongKeys(); assert.ok(wk.length >= 4, `${t}: at least four wrong keys`); const tg = p.targets();
      wk.forEach((k, i) => { p.tap(k); assert.match(p.text('prompt'), /^Exercise: build /, `after wrong tap ${i + 1}`); assert.equal(p.doc.querySelectorAll('.key.idle').length, 0, 'the keys answer'); assert.equal((p.doc.getElementById('play') as any).disabled, true); assert.equal(p.ghosts(), 0); assert.equal(p.chipCount(), 0); });
      assert.equal(p.doc.querySelectorAll('.key.wrong').length, wk.length); assert.equal(p.heads(), 1, 'still only the tonic on the staff'); assert.equal(p.text('hint'), 'Not in the scale.'); assert.equal(p.text('completed'), 'Completed 0 of 12');
      tg.forEach((m, i) => { assert.match(p.text('prompt'), /^Exercise: build /); p.tap(m); if (i < tg.length - 1) assert.equal((p.doc.getElementById('play') as any).disabled, true); });
      assert.match(p.text('prompt'), /^Exercise done: you built /); assert.equal(p.text('hint'), 'Press Play to hear it.'); assert.equal((p.doc.getElementById('play') as any).disabled, false); assert.equal(p.text('completed'), 'Completed 1 of 12'); same(p.done(), [t]); assert.equal(p.heads(), 8); assert.equal(p.ghosts(), 0); noWrongMarks(p, `${t}: the end screen`);
      assert.equal(p.doc.querySelectorAll('#letters .letter').length, 7); assert.match(p.text('sr'), /^You built /); assert.ok(p.slots()[t].classList.contains('done') && p.slots()[t].classList.contains('current'));
      noMatch(p.visible(), /out of wrong taps|gave ?up|failed|Exercise over/i, 'no failed state');
    }
  });

  test(`${f}: a pair is COMPLETED when it is built, whatever the wrong taps before; there is no failed state: no build ever leaves its slot empty by wrong taps; all twelve with many wrong taps each says "All twelve built."`, () => {
    const p = open(read(f)); for (let t = 0; t < 12; t++) { p.start(t); for (const k of p.wrongKeys()) p.tap(k); p.finish(); assert.equal(p.text('completed'), t === 11 ? 'All twelve built.' : `Completed ${t + 1} of 12`); }
    assert.equal(p.done().length, 12);
  });

  test(`${f}: the end screen of a build that took wrong taps (2026-11-19-0994, supervisor follow-up) has NO wrong-tap marks either (the quiet marks and the hint live DURING the build only), and neither has the finished view of its slot: ticks, the scale and Play, no crosses; a tap on the slot of the screen already shown changes nothing`, () => {
    const p = open(read(f)); p.start(3); for (const k of p.wrongKeys().slice(0, 4)) p.tap(k); assert.equal(p.doc.querySelectorAll('.key.wrong').length, 4, 'the quiet marks are there during the build'); assert.equal(p.text('hint'), 'Not in the scale.'); p.finish(); same(p.done(), [3]);
    noWrongMarks(p, 'the end screen'); assert.equal(p.doc.querySelectorAll('text.mark').length, 6, 'the end screen: the six ticks only');
    const atTheEnd = p.doc.body.innerHTML; p.start(3); assert.ok(p.doc.body.innerHTML === atTheEnd, 'a tap on the slot whose build is on screen changes nothing');
    p.start(8); assert.equal(p.heads(), 1); p.tap(p.wrongKeys()[0]); assert.equal(p.doc.querySelectorAll('.key.wrong').length, 1);
    p.start(3); noWrongMarks(p, 'the finished view'); assert.equal(p.doc.querySelectorAll('.key.reveal').length, 0); assert.equal(p.doc.querySelectorAll('text.mark').length, 6, 'the six ticks'); assert.equal(p.heads(), 8); assert.equal(p.ghosts(), 0);
    assert.equal(p.doc.querySelectorAll('.key.lit:not(.tonic)').length, 6); assert.equal((p.doc.getElementById('play') as any).disabled, false); assert.match(p.text('prompt'), /^Exercise done: you built /); assert.match(p.text('sr'), /^Showing the scale you built: /);
    assert.equal(p.text('completed'), 'Completed 1 of 12'); const shown = p.doc.body.innerHTML; p.start(3); assert.ok(p.doc.body.innerHTML === shown, 'a second tap changes nothing');
  });

  test(`${f}: the pure core: with the flag off there is no limit (a long run of wrong taps stays "building" and "wrong", never "gaveup"), exWrongText says nothing, the words carry no count; EX_WRONG_TAPS and left do not end anything`, () => {
    const x = pureOf(scriptOf(read(f))); const s0 = x.exStart(0, x.SCALES[0]); let s = s0; const events: string[] = [];
    const wrongs: number[] = []; for (let k = 61; k < 72; k++) if (s0.notes.indexOf(k) < 0) wrongs.push(k);
    for (const k of wrongs) { const r = x.exTap(s, k); events.push(r.event); s = r.state; }
    assert.ok(events.length >= 5); assert.ok(events.every((e) => e === 'wrong'), `only wrong: ${events}`); same([s.phase, s.outcome], ['building', null]); assert.equal(s.wrong.length, wrongs.length);
    assert.equal(x.exWrongText(s), ''); assert.equal(x.exWrongText(null), ''); assert.equal(x.exHint(s), 'Not in the scale.'); assert.equal(x.exHint(s0), '6 to find'); assert.equal(x.exAnnounce(s, 'wrong'), 'Not in the scale.');
    assert.equal(x.exAnnounce(s0, 'start'), `Exercise: build ${x.scaleWords(0, x.SCALES[0])}. The tonic is marked.`); assert.doesNotMatch(x.exPrompt(s), /wrong/i);
    const order = [...x.exTargets(s0)]; order.forEach((m, i) => { const r = x.exTap(s, m); s = r.state; assert.equal(r.event, i === order.length - 1 ? 'built' : 'right'); });
    same([s.phase, s.outcome], ['done', 'built']); assert.equal(x.exHint(s), 'Press Play to hear it.');
    // the BUILT state itself has no wrong taps left (the quiet marks live during the build only: the end screen and the kept finished view are the same state); the first completion stays
    assert.equal(s.wrong.length, 0, 'built: the wrong taps are cleared'); assert.equal(s.missed, false); assert.equal(s.found.length, 6);
    const kept = x.exKeepFinished({}, s); const v = x.exFinishedView(kept, 0, x.SCALES[0]); assert.equal(v, s, 'the finished view is the state that ended'); assert.equal(v.wrong.length, 0); assert.equal(v.outcome, 'built');
    const mid = (() => { let t = s0; t = x.exTap(t, wrongs[0]).state; t = x.exTap(t, wrongs[1]).state; return t; })(); assert.equal(mid.wrong.length, 2, 'under way: the quiet marks are kept');
    for (const m of [s0.notes[0], s0.notes[7], 59, 73, 84, 0]) assert.equal(x.exTap(s0, m).state, s0, `a tap on ${m} changes nothing`);
  });
}

// ---- Play ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: Play after a build that took wrong taps still sounds the whole scale up (every note, the octave note too) and lights each note in turn; before the build ends it is off`, () => {
    const p = open(read(f)); const play = () => p.click(p.doc.getElementById('play')); play(); assert.equal(p.stub.osc.length, 0); p.start(0); for (const k of p.wrongKeys()) p.tap(k); p.stub.osc.length = 0; play(); assert.equal(p.stub.osc.length, 0, 'still building: nothing sounds');
    p.finish(); p.stub.osc.length = 0; play(); assert.ok(p.stub.osc.length >= 8, 'at least one oscillator per note'); same(p.stub.osc.slice(0, 8).map((hz) => Math.round(69 + 12 * Math.log2(hz / 440))), p.model().notes.slice(0, 8));
  });
}

// ---- Reset and the score row --------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: the Reset link stays; the .score row keeps ONLY it, and keeps its reserved height (one page height whatever the state)`, () => {
    const h = read(f); const p = open(h); const row = p.doc.querySelector('.score')!; same([...row.children].map((c: any) => c.id), ['reset']); assert.equal(row.textContent.trim(), 'Reset');
    const css = /<style>([\s\S]*?)<\/style>/.exec(h)![1]; assert.match(/\.score \{([^}]*)\}/.exec(css)![1], /min-height: 22px/, 'the row reserves its room');
    p.start(1); same([...row.children].map((c: any) => c.id), ['reset']); p.tap(p.wrongKeys()[0]); p.finish(); same([...row.children].map((c: any) => c.id), ['reset']);
    p.click(p.doc.getElementById('reset')); assert.equal(p.text('completed'), 'Completed 0 of 12'); assert.equal(p.text('prompt'), 'Pick a tonic (home note).'); assert.equal(p.text('sr'), 'Count cleared. Pick a tonic.'); same(p.done(), []);
    p.start(9); p.tap(p.wrongKeys()[0]); assert.equal(p.text('hint'), 'Not in the scale.');
  });
}

// ---- 2. no step chips ---------------------------------------------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: NO W W H row: no #chips row in any state (fresh, started, built, a completed slot shown, Play), nothing of the steps in the page; the letters row stays directly under the staff and nothing with a reserved height sits between them; the row order is prompt, strip, staff, letters, Play, score, completed, shelf`, () => {
    const p = open(read(f)); const order = (): string[] => [...p.doc.querySelector('.wrap')!.children].map((c: any) => c.id || c.tagName.toLowerCase());
    const want = ['prompt', 'strip', 'staff', 'letters', 'div', 'div', 'completed', 'shelf-name', 'shelf', 'sr']; same(order(), want, 'fresh'); assert.ok(p.doc.getElementById('chips') === null);
    p.start(4); p.tap(p.wrongKeys()[0]); same(order(), want, 'started'); p.finish(); same(order(), want, 'built'); assert.equal(p.chipCount(), 0); assert.equal(p.doc.querySelectorAll('.chip').length, 0);
    const letters = p.doc.getElementById('letters')!; assert.equal(letters.previousElementSibling!.id, 'staff', 'the letters are directly under the staff'); assert.equal(letters.children.length, 7);
    p.start(0); p.start(4); p.click(p.doc.getElementById('play')); assert.ok(p.doc.getElementById('chips') === null); noMatch(p.visible(), /whole step|half step|steps of the scale/i, 'nothing of the steps');
    const css = /<style>([\s\S]*?)<\/style>/.exec(read(f))![1]; assert.match(css, /\.letters \{[^}]*min-height: 28px/, 'the letters row reserves its own room: one height from the start');
    assert.equal(p.doc.getElementById('staff')!.nextElementSibling!.id, 'letters'); p.start(11); assert.equal(p.doc.getElementById('staff')!.nextElementSibling!.id, 'letters');
  });
}

// ---- a flag set to true: the older behaviour is still there ------------------------------------------------------------------------------------------------------------------------
for (const [f] of SIMPLE) {
  test(`${f}: with both flags set to true (a simple-template file may still choose so) the page counts again: "Wrong taps: n of 3", the third wrong tap ends the build as failed (gaveup, the missed notes dashed, the key is not counted), the finished view keeps its crosses, the W W H chips are drawn`, () => {
    const p = open(flagsOn(read(f))); same(p.errors, []); assert.ok(p.doc.getElementById('wrongs')); assert.ok(p.doc.getElementById('chips'));
    p.start(2); assert.equal(p.text('wrongs'), 'Wrong taps: 0 of 3'); assert.equal(p.text('sr'), `Exercise: build ${p.x.scaleWords(2, p.scale)}. The tonic is marked. Wrong taps: 0 of 3.`); const wk = p.wrongKeys();
    p.tap(wk[0]); assert.equal(p.text('wrongs'), 'Wrong taps: 1 of 3'); assert.equal(p.text('sr'), 'Not in the scale. Wrong taps: 1 of 3.'); assert.equal(p.text('hint'), '6 to find'); p.tap(wk[1]); p.tap(wk[2]);
    assert.match(p.text('prompt'), /^Exercise over: out of wrong taps/); assert.equal(p.ghosts(), 6); assert.equal(p.chipCount(), 7); assert.equal(p.text('completed'), 'Completed 0 of 12'); assert.equal(p.text('sr'), `Out of wrong taps. Wrong taps: 3 of 3. The scale is ${p.x.scaleWords(2, p.scale)}. Press Play to hear it.`);
    p.start(0); p.tap(p.wrongKeys()[0]); p.finish(); p.start(5); p.start(0); assert.equal(p.doc.querySelectorAll('.key.wrong').length, 1, 'the finished view keeps its cross'); assert.equal(p.chipCount(), 7); same([...p.doc.querySelectorAll('#chips .chip')].map((c: any) => c.textContent), p.x.recipeOf(p.scale, 'up'));
    const x = pureOf(scriptOf(flagsOn(read(f)))); let s = x.exStart(0, x.SCALES[0]); const ev: string[] = []; const ws = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].filter((m) => s.notes.indexOf(m) < 0); for (let i = 0; i < 3; i++) { const r = x.exTap(s, ws[i]); ev.push(r.event); s = r.state; } same(ev, ['wrong', 'wrong', 'gaveup']);
  });
}

test('the generator gives the two simple files their flags from its FILES entries (and none to the full template): the config block of the generated simple pages and the templates agree', () => {
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/dev/make-scale-exercises.mjs'), 'utf8'); const simple = fs.readFileSync(path.join(ROOT, 'scripts/dev/templates/scale-exercise-simple.template.html'), 'utf8'); const full = fs.readFileSync(path.join(ROOT, 'scripts/dev/templates/scale-exercise.template.html'), 'utf8');
  assert.match(simple, /var COUNT_WRONG_TAPS = @@COUNT_WRONG_TAPS@@;/); assert.match(simple, /var SHOW_STEP_CHIPS = @@SHOW_STEP_CHIPS@@;/); assert.doesNotMatch(full, /COUNT_WRONG_TAPS|SHOW_STEP_CHIPS/);
  for (const f of ['scale_build_major.html', 'scale_build_natural_minor.html']) assert.match(gen, new RegExp(`file: '${f}'[^\\n]*countWrongTaps: false[^\\n]*showStepChips: false`), `${f}: its FILES entry carries both flags`);
  for (const f of FULL) assert.doesNotMatch(gen, new RegExp(`file: '${f}'[^\\n]*(countWrongTaps|showStepChips)`), `${f}: no flag`);
});
