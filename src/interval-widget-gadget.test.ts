// 2026-11-12-1200 - the interval widget gadget (music-theory: music_instruments/resources/html/interval_widget.html, synced into the bundle): Explore, Chart and Trainer in one page.
// Read from the CLIENT's own bundled copy (assets/vaults/music-theory/...), never from the sibling vault's working tree or HEAD (the sibling-pin rule); the matrix's bundle-lag step ties that copy to its source.
//   * the pure functions (the page's own fenced block, run as the page runs it): the 13-row name table, range clipping, the song-cue array, the readings, the Explore state machine and its play plans, the Chart plan, the Trainer's next question / streak rules (random source injected);
//   * the tuning math is the Piano gadget's, copied: a test compares it with piano_keyboard.html AT A PINNED COMMIT of this repo for every key and tuning;
//   * the page in a DOM (happy-dom): the three tabs, the Explore flows (two keys, a picked name, clipping, the tritone's two names, more than an octave, nothing plays on a bare click), the Chart rows and cues, the Trainer (a wrong and a right answer, streak, Hide/Reveal, Widen, the Done badge);
//   * a CONTROL that fails: the same checks on pages with the name table, the clipping, the repeat rule, the Done threshold or the play order damaged go red;
//   * P3: every other gadget is byte-identical to the commit this drain started from.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { Window } from 'happy-dom';

import { pinSkipReason } from './test-support/sibling-pin.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_DIR = 'assets/vaults/music-theory/music_instruments/resources/html';
const GADGET = path.join(ROOT, HTML_DIR, 'interval_widget.html');
const html = fs.readFileSync(GADGET, 'utf8');
const scriptOf = (h: string): string => /<script>([\s\S]*?)<\/script>/.exec(h)![1];

/** The page's pure block as the node harness sees it (no `document`, so the script exports it). `source` lets a control run a damaged copy. */
function pure(source: string = scriptOf(html)): any {
  const mod: { exports: any } = { exports: {} };
  vm.runInNewContext(source, { module: mod, Math, Array, Set, Float32Array });
  return mod.exports;
}
/** A small seeded random source (mulberry32): the page's trainer takes its random source as an argument, so a test can fix it. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- the pure functions ---------------------------------------------------------------------------------------------------------------------------------------

const TABLE: Array<[number, string, string[]]> = [
  [0, 'unison', ['P1']], [1, 'minor second', ['m2']], [2, 'major second', ['M2']], [3, 'minor third', ['m3']], [4, 'major third', ['M3']], [5, 'perfect fourth', ['P4']],
  [6, 'tritone', ['d5', 'A4']], [7, 'perfect fifth', ['P5']], [8, 'minor sixth', ['m6']], [9, 'major sixth', ['M6']], [10, 'minor seventh', ['m7']], [11, 'major seventh', ['M7']], [12, 'octave', ['P8']],
];
const CUES = ['Happy Birthday (its first two notes)', 'Jaws', 'Frère Jacques', 'Greensleeves', 'When the Saints Go Marching In', 'Here Comes the Bride', 'Maria (West Side Story)', 'Twinkle Twinkle Little Star', '', 'My Bonnie Lies Over the Ocean', 'Somewhere (West Side Story)', '', 'Somewhere Over the Rainbow'];

/** Every claim about the pure functions, as a list of failures (empty = all hold). The expected values are the published ones (the interval names and symbols, the cue titles of the prompt), not read back from the page. */
function coreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  for (const [n, name, symbols] of TABLE) {
    const i = g.intervalInfo(n);
    eq(`interval ${n}`, [i.count, i.name, i.symbols, i.symbol, i.over], [n, name, symbols, symbols.join(' / '), false]);
  }
  eq('only the tritone has two symbols', TABLE.filter(([, , s]) => s.length > 1).map(([n]) => n), [6]);
  eq('more than an octave is not named', [g.intervalInfo(13).name, g.intervalInfo(13).symbol, g.intervalInfo(13).over, g.intervalInfo(24).over], [null, null, true, true]);
  // range clipping: a target outside C3..C5 (MIDI 48..72) is null, never drawn
  eq('C4 + P5 both ways', g.targetsFor(60, 7), { up: 67, down: 53 });
  eq('C3 + P5: the down target is off the strip', g.targetsFor(48, 7), { up: 55, down: null });
  eq('C5 + M3: the up target is off the strip', g.targetsFor(72, 4), { up: null, down: 68 });
  eq('C4 + octave both ways', g.targetsFor(60, 12), { up: 72, down: 48 });
  eq('C4 + 13: both off', g.targetsFor(60, 13), { up: null, down: null });
  eq('the edge keys are inside', [g.targetsFor(48, 0), g.targetsFor(72, 0)], [{ up: 48, down: 48 }, { up: 72, down: 72 }]);
  eq('the span is inclusive, either order', [g.spanKeys(60, 64), g.spanKeys(64, 60)], [[60, 61, 62, 63, 64], [60, 61, 62, 63, 64]]);
  eq('the cue list is the 13 titles of the prompt, blanks at 8 and 11', [...g.SONG_CUES], CUES);
  eq('readings (flats for black keys)', [g.reading(60, 63), g.reading(60, 57), g.reading(60, 61), g.reading(60, 60), g.reading(48, 66), g.reading(61, 64)],
    ['3 half steps up from C: E-flat', '3 half steps down from C: A', '1 half step up from C: D-flat', '0 half steps: the same note, C', '18 half steps up from C: G-flat (more than an octave)', '3 half steps up from D-flat: E']);
  eq('a picked name shows both targets', [g.readingForPick(60, 3), g.readingForPick(48, 7), g.readingForPick(72, 4)], ['3 half steps up from C: E-flat; down: A', '7 half steps up from C: G', '4 half steps down from C: A-flat']);
  // Explore: the state machine
  const none = { root: null, target: null, pick: null };
  eq('the first click is the root', g.exploreClick(none, 60), { root: 60, target: null, pick: null });
  eq('the second click is the target', g.exploreClick({ root: 60, target: null, pick: null }, 64), { root: 60, target: 64, pick: null });
  eq('the root again clears it', g.exploreClick({ root: 60, target: null, pick: null }, 60), none);
  eq('with both chosen the next click starts over', g.exploreClick({ root: 60, target: 64, pick: null }, 50), { root: 50, target: null, pick: null });
  eq('a picked name keeps the root, or takes C4', [g.explorePick({ root: 55, target: 60, pick: null }, 7), g.explorePick(none, 5)], [{ root: 55, target: null, pick: 7 }, { root: 60, target: null, pick: 5 }]);
  const plan = (st: any, mode: string, sys = 'equal') => g.explorePlan(st, mode, sys).map((n: any) => [n.midi, n.when]);
  eq('two keys: Up = root then target, Down = target then root, Together = both', [plan({ root: 60, target: 64, pick: null }, 'up'), plan({ root: 60, target: 64, pick: null }, 'down'), plan({ root: 60, target: 64, pick: null }, 'together')], [[[60, 0], [64, 0.6]], [[64, 0], [60, 0.6]], [[60, 0], [64, 0]]]);
  eq('a picked name: Up = the note above, Down = the note below; a side off the strip plays nothing', [plan({ root: 60, target: null, pick: 7 }, 'up'), plan({ root: 60, target: null, pick: 7 }, 'down'), plan({ root: 48, target: null, pick: 7 }, 'down'), plan({ root: null, target: null, pick: null }, 'up')], [[[60, 0], [67, 0.6]], [[60, 0], [53, 0.6]], [], []]);
  eq('the tuning is passed to the sound', +g.explorePlan({ root: 69, target: 76, pick: null }, 'together', 'pythagorean')[1].hz.toFixed(2), +g.midiToHz(76, 'pythagorean').toFixed(2));
  eq('the chart plan: up, then together', g.chartPlan(7, 'equal').map((n: any) => [n.midi, n.when]), [[60, 0], [67, 0.6], [60, 1.6], [67, 1.6]]);
  // Trainer: levels, never the same twice, both notes on the strip, the streak rules
  eq('the levels', [g.LEVELS.easy, g.LEVELS.all.length], [[3, 4, 7], 13]);
  const rand = seeded(7);
  let prev: number | null = null, repeated = 0, off = 0; const seen = new Set<number>();
  for (let i = 0; i < 400; i++) {
    const level = i < 200 ? 'easy' : 'all', dir = ['up', 'down', 'together'][i % 3];
    const q = g.nextQuestion(level, dir, prev, rand);
    if (q.count === prev) repeated++;
    if (q.root < 48 || q.root > 72 || q.target < 48 || q.target > 72) off++;
    if (level === 'easy' && ![3, 4, 7].includes(q.count)) bad.push(`easy asked ${q.count}`);
    if (Math.abs(q.target - q.root) !== q.count) bad.push(`the target is not ${q.count} half steps from the root`);
    if (dir === 'down' && q.target >= q.root && q.count > 0) bad.push('a down question whose target is not below');
    if (level === 'all') seen.add(q.count);
    prev = q.count;
  }
  eq('the same interval is never asked twice in a row', repeated, 0);
  eq('both notes always on the strip', off, 0);
  eq('the All level reaches every interval', seen.size, 13);
  eq('a fixed random source gives a fixed question', g.nextQuestion('easy', 'up', null, () => 0), { count: 3, root: 48, target: 51, direction: 'up' });
  let s = { streak: 0, best: 0, allStreak: 0, done: false };
  s = g.scoreAnswer(s, true, 'easy'); s = g.scoreAnswer(s, true, 'easy'); s = g.scoreAnswer(s, true, 'easy');
  eq('three right on Easy: streak 3, best 3, no All streak', s, { streak: 3, best: 3, allStreak: 0, done: false });
  s = g.scoreAnswer(s, false, 'easy');
  eq('a wrong answer resets the streak, keeps the best', s, { streak: 0, best: 3, allStreak: 0, done: false });
  for (let i = 0; i < 9; i++) s = g.scoreAnswer(s, true, 'all');
  eq('nine right on All: not done', [s.streak, s.allStreak, s.done], [9, 9, false]);
  s = g.scoreAnswer(s, true, 'all');
  eq('ten right on All: done', [s.streak, s.best, s.allStreak, s.done], [10, 10, 10, true]);
  let e = { streak: 0, best: 0, allStreak: 0, done: false };
  for (let i = 0; i < 12; i++) e = g.scoreAnswer(e, true, 'easy');
  eq('ten right on Easy is not Done', [e.streak, e.done], [12, false]);
  eq('answer texts', [g.answerText({ count: 7 }, 7), g.answerText({ count: 3 }, 7)], ['Right: perfect fifth (P5), 7 half steps.', 'Not quite: that was a minor third (m3), 3 half steps, not a perfect fifth.']);
  return bad;
}

test('the interval names and symbols (0 to 12, two only for the tritone), range clipping, cues, readings, the Explore state machine and plans, the Chart plan, the Trainer rules (never a repeat, both notes on the strip, streak and Done)', () => {
  assert.deepEqual(coreFailures(pure()), []);
});

test('the tuning math is the Piano gadget\'s: every key C3-C5 in every tuning sounds at the same Hz as piano_keyboard.html at the commit this drain started from', { skip: pinSkipReason(ROOT, 'c6285f9', 'this repo') ?? false }, () => {
  const pianoSrc = execFileSync('git', ['-C', ROOT, 'show', `c6285f9:${HTML_DIR}/piano_keyboard.html`], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const piano = pure(scriptOf(pianoSrc)), g = pure();
  for (const sys of ['equal', 'pythagorean', 'meantone', 'well']) for (let m = 48; m <= 72; m++) assert.equal(g.midiToHz(m, sys), piano.midiToHz(m, sys), `${sys} ${m}`);
  assert.deepEqual([g.LOW, g.HIGH], [piano.LOW, piano.HIGH]);
  assert.match(html, /COPIED from piano_keyboard\.html/, 'the comment says the pure functions are copied');
});

// ---- the page, in a DOM ---------------------------------------------------------------------------------------------------------------------------------------

type Page = { win: any; doc: any; errors: string[]; osc: number[] };
function openPage(h: string = html, rand?: () => number): Page {
  const errors: string[] = [], osc: number[] = [];
  const win: any = new Window({ url: 'http://localhost/' });
  win.console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  win.addEventListener('error', (e: any) => errors.push(String(e.message ?? e)));
  class Ctx {
    currentTime = 0; state = 'running'; destination = {};
    createPeriodicWave() { return {}; }
    createGain() { const p = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }); return { gain: p(), connect() {} }; }
    createOscillator() { const o = { frequency: { value: 0 }, setPeriodicWave() {}, connect() {}, start() { osc.push(o.frequency.value); }, stop() {} }; return o; }
    resume() {}
  }
  win.AudioContext = Ctx; win.Float32Array = Float32Array;
  if (rand) win.__intervalRandom = rand;                    // the injected random source (the page reads it on every question)
  const m = /<script>([\s\S]*?)<\/script>/.exec(h)!;
  win.document.write(h.replace(m[0], ''));
  win.eval(m[1]);
  return { win, doc: win.document, errors, osc };
}
const click = (p: Page, sel: string) => p.doc.querySelector(sel).dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
const hz = (g: any, ...ms: number[]) => ms.map((m) => +g.midiToHz(m, 'equal').toFixed(2));
const cls = (p: Page, scope: string, m: number): string[] => [...p.doc.querySelector(`${scope} .key[data-midi="${m}"]`).classList];
const text = (p: Page, sel: string): string => p.doc.querySelector(sel).textContent.replace(/\s+/g, ' ').trim();
const oscHz = (p: Page): number[] => p.osc.map((x) => +x.toFixed(2));

/** Every claim about the page in a DOM, as a list of failures (empty = all hold). */
function pageFailures(h: string): string[] {
  const bad: string[] = [];
  const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const g = pure(scriptOf(h));
  const p = openPage(h, () => 0);                     // a fixed random source: the first Trainer question is C3 up 3 half steps, then 4, 3, 4 ...
  ok('loads clean', p.errors.length === 0);
  ok('three tabs, Explore selected, the other panels hidden', ['tabExplore', 'tabChart', 'tabTrainer'].map((i) => p.doc.getElementById(i).getAttribute('aria-selected')).join() === 'true,false,false' && p.doc.getElementById('pChart').hidden && p.doc.getElementById('pTrainer').hidden && !p.doc.getElementById('pExplore').hidden);
  ok('four tunings', [...p.doc.getElementById('tuning').options].map((o: any) => o.value).join() === 'equal,pythagorean,meantone,well');
  // ---- Explore
  ok('Explore starts with C4 as the root', cls(p, '#exSvg', 60).includes('root'));
  click(p, '#exSvg .key[data-midi="64"]');
  ok('a bare key click plays nothing', p.osc.length === 0);
  ok('C4 then E4: 4 half steps, major third, M3', text(p, '#exBig') === '4 half steps · major third · M3' && text(p, '#exPlain') === '4 half steps up from C: E');
  ok('root, target and the span are lit', cls(p, '#exSvg', 64).includes('up') && [61, 62, 63].every((m) => cls(p, '#exSvg', m).includes('span')) && !cls(p, '#exSvg', 65).includes('span'));
  click(p, '#exT'); ok('Together: both notes at once', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 60, 64)));
  p.osc.length = 0; click(p, '#exD'); ok('Down: the target, then the root', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 64, 60)));
  click(p, '#exN7');
  ok('picking P5 lights BOTH targets: G4 up, F3 down', cls(p, '#exSvg', 67).includes('up') && cls(p, '#exSvg', 53).includes('down') && !cls(p, '#exSvg', 64).includes('up'));
  ok('the reading names both', text(p, '#exPlain') === '7 half steps up from C: G; down: F' && /perfect fifth · P5/.test(text(p, '#exBig')));
  p.osc.length = 0; click(p, '#exD'); ok('after a name, Down = the root then the note BELOW', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 60, 53)));
  click(p, '#exC'); click(p, '#exSvg .key[data-midi="48"]'); click(p, '#exN7');
  ok('range clipping: with C3 as the root the down target is not drawn', cls(p, '#exSvg', 55).includes('up') && p.doc.querySelectorAll('#exSvg .key.down').length === 0 && !/down/.test(text(p, '#exPlain')));
  click(p, '#exN6'); ok('the tritone shows both names', /tritone · d5 \/ A4/.test(text(p, '#exBig')));
  click(p, '#exN3'); ok('other intervals show ONE name', !/\//.test(text(p, '#exBig')));
  click(p, '#exC'); click(p, '#exSvg .key[data-midi="48"]'); click(p, '#exSvg .key[data-midi="72"]');
  ok('more than an octave: counted, not named', text(p, '#exBig') === '24 half steps · more than an octave' && !/third|fifth|octave\b.*P8/.test(text(p, '#exPlain')));
  // ---- Chart
  click(p, '#tabChart');
  ok('the Chart tab shows its panel', !p.doc.getElementById('pChart').hidden && p.doc.getElementById('pExplore').hidden);
  const rows = [...p.doc.querySelectorAll('#chartTable tbody tr')];
  ok('13 rows: half steps, name, symbol, cue', rows.length === 13 && rows.every((r: any, i: number) => {
    const c = [...r.querySelectorAll('td')].map((t: any) => t.textContent.trim());
    return c[0] === String(i) && c[1] === TABLE[i][1] && c[2] === TABLE[i][2].join(' / ') && c[5] === CUES[i];
  }));
  ok('the blank cues stay blank', rows[8].querySelector('td.cue').textContent === '' && rows[11].querySelector('td.cue').textContent === '');
  const r4 = rows[4], span = [...r4.querySelectorAll('.key')].filter((k: any) => k.classList.contains('span')).map((k: any) => +k.getAttribute('data-midi')).sort((x: number, y: number) => x - y);
  ok('a row\'s strip: C4 to E4 lit, the span between', r4.querySelectorAll('.key').length === 13 && JSON.stringify(span) === '[61,62,63]' && r4.querySelector('.key[data-midi="64"]').classList.contains('up'));
  p.osc.length = 0; r4.querySelector('svg.minisvg').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  ok('clicking a row\'s strip plays it up, then together', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 60, 64, 60, 64)));
  const sel = p.doc.getElementById('tuning'); sel.value = 'pythagorean'; sel.dispatchEvent(new p.win.Event('change'));
  p.osc.length = 0; rows[7].querySelector('button.rowplay').dispatchEvent(new p.win.MouseEvent('click', { bubbles: true }));
  ok('the tuning dropdown changes the Chart\'s sound', +p.osc[1].toFixed(2) === +g.midiToHz(67, 'pythagorean').toFixed(2) && +p.osc[1].toFixed(2) !== +g.midiToHz(67, 'equal').toFixed(2));
  sel.value = 'equal'; sel.dispatchEvent(new p.win.Event('change'));
  // ---- Trainer
  click(p, '#tabTrainer');
  ok('the Trainer tab shows its panel, the Easy level, no Done badge', !p.doc.getElementById('pTrainer').hidden && /Easy: 3, 4 and 7/.test(text(p, '#tLevel')) && p.doc.getElementById('tDone').hidden);
  ok('13 answer buttons', p.doc.querySelectorAll('#tNames button').length === 13);
  p.osc.length = 0; click(p, '#tP');
  ok('Play sounds the question: C3 then D#3 (3 half steps up)', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 48, 51)));
  ok('Reveal mode (the default): labels visible and the root marked, the target not lit', !p.doc.getElementById('trSvg').classList.contains('masked') && cls(p, '#trSvg', 48).includes('root') && p.doc.querySelectorAll('#trSvg .key.up').length === 0);
  click(p, '#tH');
  ok('Hide: the labels are masked and nothing is lit until the answer', p.doc.getElementById('tH').getAttribute('aria-pressed') === 'true' && p.doc.getElementById('trSvg').classList.contains('masked') && p.doc.querySelectorAll('#trSvg .key.root').length === 0);
  click(p, '#tA7');
  ok('a wrong answer: says so, names the right one, lights the span, streak 0', /^Not quite: that was a minor third \(m3\), 3 half steps, not a perfect fifth\.$/.test(text(p, '#tFb')) && p.doc.getElementById('tA3').classList.contains('right-answer') && p.doc.getElementById('tA7').classList.contains('wrong-answer')
    && cls(p, '#trSvg', 51).includes('up') && cls(p, '#trSvg', 49).includes('span') && !p.doc.getElementById('trSvg').classList.contains('masked') && text(p, '#tScore') === 'Streak 0 · Best 0');
  click(p, '#tA4'); ok('a second answer to the same question is ignored', text(p, '#tScore') === 'Streak 0 · Best 0');
  p.osc.length = 0; click(p, '#tN');
  ok('Next asks a different interval (4) and plays it', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, 48, 52)) && text(p, '#tFb') === 'Which interval was that?');
  click(p, '#tA4');
  ok('a right answer: streak 1, best 1', /^Right: major third \(M3\), 4 half steps\.$/.test(text(p, '#tFb')) && text(p, '#tScore') === 'Streak 1 · Best 1' && p.doc.getElementById('tFb').classList.contains('right'));
  click(p, '#tW');
  ok('Widen goes to All (0 to 12)', /All: 0 to 12/.test(text(p, '#tLevel')) && text(p, '#tW') === 'Narrow');
  for (let i = 0; i < 10; i++) {                       // with the random source fixed at 0 the All level asks 0, 1, 0, 1 ...
    ok('no Done before ten', i === 0 || p.doc.getElementById('tDone').hidden);
    click(p, `#tA${i % 2}`);
    if (i < 9) click(p, '#tN');
  }
  ok('ten right in a row on All: the Done badge shows', !p.doc.getElementById('tDone').hidden && /Streak 11/.test(text(p, '#tScore')));
  ok('the page still loads clean after all that', p.errors.length === 0);
  return bad;
}

test('the page in a DOM: tabs, the Explore flows (two keys, a picked name, clipping, the tritone, more than an octave, nothing plays on a bare click), the Chart rows and cues, the Trainer (wrong and right answers, streak, Hide/Reveal, Widen, Done)', () => {
  assert.deepEqual(pageFailures(html), []);
});

test('tabs are keyboard-operable (arrow keys), every control has an accessible name, and the keys are roving Tab stops', () => {
  const p = openPage();
  const tabs = ['tabExplore', 'tabChart', 'tabTrainer', 'tabShift'].map((i) => p.doc.getElementById(i));         // 2026-11-12-1207: a fourth tab, Shift; the arrow keys wrap over four
  assert.deepEqual(tabs.map((t: any) => t.getAttribute('role')), ['tab', 'tab', 'tab', 'tab']);
  tabs[0].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  tabs[1].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  tabs[0].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(tabs[3].getAttribute('aria-selected'), 'true', 'wraps round (to the last tab, Shift)');
  tabs[3].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true', 'and round again');
  for (const b of p.doc.querySelectorAll('button')) assert.ok((b.getAttribute('aria-label') ?? b.textContent).trim().length > 0, `a button without a name: ${b.outerHTML.slice(0, 80)}`);
  const keys = [...p.doc.querySelectorAll('#exSvg .key')];
  assert.equal(keys.length, 25, 'C3..C5 = 25 keys');
  assert.ok(keys.every((k: any) => k.getAttribute('role') === 'button' && /^[A-G]#?\d/.test(k.getAttribute('aria-label'))));
  assert.equal(new Set(keys.map((k: any) => k.getAttribute('tabindex'))).size, 25, 'each key has its own tabindex, in pitch order');
  keys.find((k: any) => k.getAttribute('data-midi') === '64').dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.match(p.doc.getElementById('exBig').textContent, /major third/, 'Enter on a key selects it');
});

test('self-contained: no network, no storage, no import; mirrors the Piano gadget (palette, fence), and says the aliases other than the tritone\'s are not shown', () => {
  const noNs = html.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  assert.ok(!/https?:|fetch\(|XMLHttpRequest|localStorage|sessionStorage|import\(|<script[^>]+src/i.test(noNs), 'nothing is loaded from anywhere and nothing is stored');
  assert.match(html, /typeof document === "undefined"[^\n]*\n\s*module\.exports/, 'the node-harness fence');
  assert.match(html, /--highlight: #F8C54B/, 'the shared palette block');
  assert.match(html, /only the tritone shows two names|spelling page covers them/i, 'the aliases comment');
});

test('CONTROL: the checks can fail - a wrong name in the table, no range clipping, a repeat allowed, Done at nine, Down played in the wrong order each go red', () => {
  assert.deepEqual(coreFailures(pure()), [], 'the undamaged page passes');
  assert.deepEqual(pageFailures(html), [], 'the undamaged page passes');
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `the control's premise: the page contains ${from}`); return html.replace(from, to); };
  assert.ok(coreFailures(pure(scriptOf(damaged('{ n: 4,  name: "major third",    short: "major 3rd", symbols: ["M3"] }', '{ n: 4,  name: "minor third",    short: "major 3rd", symbols: ["M3"] }')))).length > 0, 'a wrong name');
  assert.ok(coreFailures(pure(scriptOf(damaged('return { up: up <= high ? up : null, down: down >= low ? down : null };', 'return { up: up, down: down };')))).length > 0, 'no range clipping');
  assert.ok(coreFailures(pure(scriptOf(damaged('return c !== prevCount; });', 'return true; });')))).length > 0, 'a repeat allowed');
  assert.ok(coreFailures(pure(scriptOf(damaged('var DONE_STREAK = 10;', 'var DONE_STREAK = 9;')))).length > 0, 'Done at nine');
  assert.ok(coreFailures(pure(scriptOf(damaged('notes = mode === "down" ? [st.target, st.root] : [st.root, st.target];', 'notes = [st.root, st.target];')))).length > 0, 'Down in the wrong order');
  assert.ok(pageFailures(damaged('"Frère Jacques",', '"Twinkle",')).length > 0, 'a wrong cue');
  assert.ok(pageFailures(damaged('if (tr.answered) view =', 'if (true) view =')).length > 0, 'the answer shown before it is given');
});

// ---- 2026-11-12-1207: the SHIFT tab - "a tune shifted across the piano up and down and still recognized: the interval is the only thing that matters" -------------------------------------------------------
// Public-domain tunes as MIDI lists; shiftTune / canShift / tuneIntervals / breakOne / noteNames / tunePlan are the page's own pure functions; the intervals NEVER change with a shift, a broken tune changes exactly one note
// (+1 half step, the middle one) and exactly two interval sizes. Expected values are the prompt's published ones, not read back from the page.
const TUNES: Array<[string, number[]]> = [
  ['Twinkle Twinkle Little Star', [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]],
  ['Frère Jacques', [60, 62, 64, 60, 60, 62, 64, 60, 64, 65, 67, 64, 65, 67]],
  ['Ode to Joy', [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62]],
  // 2026-11-13-1213 (was 1212's repeat of bar 1): Bach, Cello Suite No. 1, Prelude, bar 1 (Mutopia LilyPond, Schirmer 1916, public domain: g d' b' a b d, b' d,) = G D B A B D B D, then bar 2 (g, e' c' b c e, c' e,) = G E C B C E C E; the cello sounds it an octave lower, the page writes it one octave UP (G3..B4), twice in a row.
  ['Bach: Cello Suite No. 1, Prelude (bars 1-2)', [55, 62, 71, 69, 71, 62, 71, 62, 55, 64, 72, 71, 72, 64, 72, 64]],
];
const BACH = TUNES[3][1];
const TWINKLE_INTERVALS = [0, 7, 0, 2, 0, -2, -2, 0, -1, 0, -2, 0, -2];
const FLATS = ['C', 'D-flat', 'D', 'E-flat', 'E', 'F', 'G-flat', 'G', 'A-flat', 'A', 'B-flat', 'B'];

/** Every claim about the Shift tab's pure functions, as a list of failures (empty = all hold). */
function shiftCoreFailures(g: any): string[] {
  const bad: string[] = [];
  const eq = (what: string, got: unknown, want: unknown) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`); };
  eq('four tunes, the titles', (g.TUNES ?? []).map((t: any) => t.title), TUNES.map(([title]) => title));
  eq('the tunes\' notes, as the prompt lists them', (g.TUNES ?? []).map((t: any) => t.notes), TUNES.map(([, n]) => n));
  eq('note counts 14, 14, 15, 16', (g.TUNES ?? []).map((t: any) => t.notes.length), [14, 14, 15, 16]);
  for (const [title, notes] of TUNES) {
    eq(`${title}: inside C3..C5 (48..72)`, [Math.min(...notes) >= 48, Math.max(...notes) <= 72], [true, true]);
    const input = notes.slice(); g.shiftTune(input, 3);
    eq(`${title}: shiftTune does not change its input`, input, notes);
    eq(`${title}: shiftTune +3`, g.shiftTune(notes, 3), notes.map((m) => m + 3));
    eq(`${title}: shiftTune 0 is the tune`, g.shiftTune(notes, 0), notes);
    const lo = Math.min(...notes), hi = Math.max(...notes);
    eq(`${title}: canShift at the edges`, [g.canShift(notes, 72 - hi, 48, 72), g.canShift(notes, 73 - hi, 48, 72), g.canShift(notes, 48 - lo, 48, 72), g.canShift(notes, 47 - lo, 48, 72)], [true, false, true, false]);
    eq(`${title}: canShift 0`, g.canShift(notes, 0, 48, 72), true);
    const base = g.tuneIntervals(notes);
    eq(`${title}: one interval fewer than notes`, base.length, notes.length - 1);
    let allowed = 0;
    for (let d = -30; d <= 30; d++) {
      if (!g.canShift(notes, d, 48, 72)) continue;
      allowed++;
      const sh = g.shiftTune(notes, d);
      eq(`${title}: the intervals do not change at shift ${d}`, g.tuneIntervals(sh), base);
      const broken = g.breakOne(sh), idx = g.breakIndex(sh);
      const diff = broken.map((m: number, i: number) => m - sh[i]);
      eq(`${title}: breakOne at shift ${d}: exactly one note, +1, the middle one`, [diff.filter((x: number) => x !== 0).length, diff[idx], idx], [1, 1, Math.floor(sh.length / 2)]);
      const bi = g.tuneIntervals(broken), changed = bi.map((v: number, i: number) => v - base[i]);
      eq(`${title}: breakOne at shift ${d}: exactly two interval sizes differ, by +1 into the note and -1 out of it`, [changed.filter((x: number) => x !== 0).length, changed[idx - 1], changed[idx]], [2, 1, -1]);
      eq(`${title}: the broken note stays on the strip at shift ${d}`, Math.max(...broken) <= 72 && Math.min(...broken) >= 48, true);
      eq(`${title}: breakOne does not change its input at shift ${d}`, sh, g.shiftTune(notes, d));
    }
    if (allowed < 8) bad.push(`${title}: only ${allowed} allowed shifts - the invariance was barely tested`);                // Bach spans 55..72: exactly 8 positions (-7..0), so the floor is 8
  }
  // 2026-11-13-1212: Bach. Eight pitches from the Mutopia LilyPond, twice; the row is COMPUTED from the list (the sign pattern is read off it, not typed); only -7..+1 half steps keep it on the strip.
  eq('Bach: bar 1 is the source\'s G D B A B D B D and bar 2 is G E C B C E C E, each an octave above the cello (G2 D3 ... / G2 E3 ...)', [BACH.slice(0, 8), BACH.slice(8)], [[55, 62, 71, 69, 71, 62, 71, 62], [55, 64, 72, 71, 72, 64, 72, 64]]);
  eq('Bach: 16 notes, range 55..72, inside C3..C5 (the top key)', [BACH.length, Math.min(...BACH), Math.max(...BACH)], [16, 55, 72]);
  eq('Bach: the signed row is the neighbour differences of the list, and its sign pattern (computed from the list)', [g.tuneIntervals(BACH), g.tuneIntervals(BACH).map((d: number) => (d > 0 ? '+' : d < 0 ? '-' : '0')).join('')], [BACH.slice(1).map((m, i) => m - BACH[i]), BACH.slice(1).map((m, i) => (m > BACH[i] ? '+' : m < BACH[i] ? '-' : '0')).join('')]);
  eq('Bach: the row, from the list (bar 1: 7 9 -2 2 -9 9 -9; the join -7; bar 2: 9 8 -1 1 -8 8 -8)', g.tuneIntervals(BACH).join(' '), '7 9 -2 2 -9 9 -9 -7 9 8 -1 1 -8 8 -8');
  eq('Bach may go down 7 and not further, and not up at all (the top note is already C5)', [0, 1, -7, -8].map((d) => g.canShift(BACH, d, 48, 72)), [true, false, true, false]);
  eq('Bach: the octave shifts are both off the strip', [g.canShift(BACH, 12, 48, 72), g.canShift(BACH, -12, 48, 72)], [false, false]);
  eq('Bach: break one raises the 9th note (the G that starts bar 2), 55 -> 56, and nothing else', [g.breakIndex(BACH), g.breakOne(BACH)[8], g.breakOne(BACH).filter((m: number, i: number) => m !== BACH[i]).length], [8, 56, 1]);
  eq('Bach carries its own short step, 0.2 s; the other three have none', (g.TUNES ?? []).map((t: any) => t.step ?? null), [null, null, null, 0.2]);
  const bachPlan = g.tunePlan(BACH, 'equal', (g.TUNES ?? [])[3]?.step);
  eq('Bach plays short equal notes, the last one longer', [bachPlan.length, bachPlan.map((n: any) => +n.when.toFixed(2)).slice(0, 3), new Set(bachPlan.slice(0, 15).map((n: any) => +n.dur.toFixed(2))).size, +bachPlan[15].dur.toFixed(2), +bachPlan[0].dur.toFixed(2)], [16, [0, 0.2, 0.4], 1, 0.4, 0.2]);
  eq('a tune with no step keeps the 0.45 s of the other three', g.tunePlan(BACH, 'equal').map((n: any) => +n.when.toFixed(2)).slice(0, 3), [0, 0.45, 0.9]);
  eq('Twinkle\'s interval row, as the prompt gives it', g.tuneIntervals(TUNES[0][1]), TWINKLE_INTERVALS);
  eq('Twinkle may go up 3 and down 12 and not further', [g.canShift(TUNES[0][1], 3, 48, 72), g.canShift(TUNES[0][1], 4, 48, 72), g.canShift(TUNES[0][1], -12, 48, 72), g.canShift(TUNES[0][1], -13, 48, 72)], [true, false, true, false]);
  eq('noteNames: flats for black keys (Twinkle up 3)', g.noteNames(g.shiftTune(TUNES[0][1], 3)), ['E-flat', 'E-flat', 'B-flat', 'B-flat', 'C', 'C', 'B-flat', 'A-flat', 'A-flat', 'G', 'G', 'F', 'F', 'E-flat']);
  eq('noteNames: every pitch class', g.noteNames([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]), FLATS);
  eq('noteNames agrees with Explore\'s plain reading', [60, 61, 66, 70].map((m) => g.plainName(m)), g.noteNames([60, 61, 66, 70]));
  const plan = g.tunePlan(TUNES[0][1], 'equal');
  eq('tunePlan: onsets every 0.45 s, the last note twice as long', [plan.map((n: any) => +n.when.toFixed(2)), plan.map((n: any) => +n.dur.toFixed(2))], [TUNES[0][1].map((_, i) => +(i * 0.45).toFixed(2)), TUNES[0][1].map((_, i) => (i === TUNES[0][1].length - 1 ? 0.9 : 0.45))]);
  eq('tunePlan: the Hz are the page\'s tuning', plan.map((n: any) => +n.hz.toFixed(2)), TUNES[0][1].map((m) => +g.midiToHz(m, 'equal').toFixed(2)));
  eq('tunePlan follows the tuning dropdown', +g.tunePlan([67], 'pythagorean')[0].hz.toFixed(2), +g.midiToHz(67, 'pythagorean').toFixed(2));
  return bad;
}

test('SHIFT, the pure functions: four public-domain tunes, shiftTune / canShift, the interval row that never changes (every allowed shift of every tune), breakOne (one note +1, two intervals), flats, the play plan', () => {
  assert.deepEqual(shiftCoreFailures(pure()), []);
  assert.match(html, /public domain/i, 'the tunes\' array says each tune is public domain');
  assert.match(html, /BWV 1007/, 'Bach\'s entry names the work');
  assert.match(html, /Mutopia/, 'and the source its pitches were read from');
  assert.match(html, /one octave UP from the cello/, 'and says it is transposed up an octave');
  assert.match(html, /Bar 2: g, e' c' b c e, c' e, = G E C B C E C E/, 'and names bar 2 with its source line');
  assert.doesNotMatch(html, /second bar is NOT a repeat|Bach's real second bar/, 'the old "bar 2 differs" caveat is gone');
  assert.match(html, /not the full two bars/, 'and says honestly that it is each bar\'s first half');
  assert.doesNotMatch(html, /Hey Jude/i, 'no tune that is in copyright');
});

const TWINKLE_ROW = '0 +7 0 +2 0 -2 -2 0 -1 0 -2 0 -2';
const rowText = (p: Page): string => text(p, '#shIntervals').replace(/\s*\(.*$/, '');
const litKeys = (p: Page, cl: string): number[] => [...p.doc.querySelectorAll(`#shSvg .key.${cl}`)].map((k: any) => +k.getAttribute('data-midi')).sort((a: number, b: number) => a - b);

/** Every claim about the Shift tab in a DOM, as a list of failures (empty = all hold). */
function shiftPageFailures(h: string): string[] {
  const bad: string[] = [];
  const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  const g = pure(scriptOf(h));
  const p = openPage(h, () => 0);
  ok('loads clean', p.errors.length === 0);
  ok('four tabs, Shift last, its panel hidden until chosen', ['tabExplore', 'tabChart', 'tabTrainer', 'tabShift'].map((i) => p.doc.getElementById(i)?.getAttribute('role')).join() === 'tab,tab,tab,tab' && p.doc.getElementById('pShift').hidden);
  ok('the page opens on Explore', p.doc.getElementById('tabExplore').getAttribute('aria-selected') === 'true' && p.osc.length === 0);
  click(p, '#tabShift');
  ok('the Shift tab shows its panel and hides the others', !p.doc.getElementById('pShift').hidden && p.doc.getElementById('pExplore').hidden && p.doc.getElementById('pChart').hidden && p.doc.getElementById('pTrainer').hidden && p.doc.getElementById('tabShift').getAttribute('aria-selected') === 'true');
  ok('nothing plays on tab open', p.osc.length === 0);
  ok('the picker lists the four tunes, Twinkle first, Bach fourth (after Ode to Joy)', [...p.doc.querySelectorAll('#shTune option')].map((o: any) => o.textContent.trim()).join('|') === TUNES.map(([t]) => t).join('|') && p.doc.getElementById('shTune').value === 'twinkle');
  ok('at the start: starts on C, the whole name line, the interval row', /^starts on C\b/.test(text(p, '#shStart')) && text(p, '#shNames') === 'C C G G A A G F F E E D D C' && rowText(p) === TWINKLE_ROW);
  ok('the strip is the Explore strip: 25 keys, C3 to C5', p.doc.querySelectorAll('#shSvg .key').length === 25 && !!p.doc.querySelector('#shSvg .key[data-midi="48"]') && !!p.doc.querySelector('#shSvg .key[data-midi="72"]'));
  ok('the tune\'s notes are lit at the start position', JSON.stringify(litKeys(p, 'tune')) === JSON.stringify([60, 62, 64, 65, 67, 69]) && litKeys(p, 'broken').length === 0);
  ok('the caption is not shown before a shift', p.doc.getElementById('shCaption').hidden);
  ok('at the start Shift up, Shift down and Octave down are possible; Octave up is not (A4 + 12 would leave the strip) and says why', ['shUp', 'shDn', 'shOd'].every((i) => !p.doc.getElementById(i).disabled) && p.doc.getElementById('shOu').disabled && /C5|highest|top|outside/i.test(p.doc.getElementById('shOu').getAttribute('title')));
  // ---- three half steps up: the names change, the intervals do not
  for (let i = 0; i < 3; i++) click(p, '#shUp');
  ok('shifting plays nothing', p.osc.length === 0);
  ok('up 3: starts on E-flat, the name line changed', /^starts on E-flat\b/.test(text(p, '#shStart')) && text(p, '#shNames') === 'E-flat E-flat B-flat B-flat C C B-flat A-flat A-flat G G F F E-flat');
  ok('up 3: the interval row is the same', rowText(p) === TWINKLE_ROW);
  ok('up 3: the strip moved with it', JSON.stringify(litKeys(p, 'tune')) === JSON.stringify([63, 65, 67, 68, 70, 72]));
  ok('the caption says it, once shifted', !p.doc.getElementById('shCaption').hidden && text(p, '#shCaption') === 'the notes changed, the intervals did not');
  ok('at the top edge Shift up is disabled with a title that says why, Shift down is not', p.doc.getElementById('shUp').disabled && /C5|highest|top|outside/i.test(p.doc.getElementById('shUp').getAttribute('title')) && !p.doc.getElementById('shDn').disabled && p.doc.getElementById('shOu').disabled);
  click(p, '#shUp'); ok('a disabled Shift up changes nothing', /^starts on E-flat\b/.test(text(p, '#shStart')));
  for (let i = 0; i < 8; i++) click(p, '#shDn');
  ok('down 8 more (net down 5): starts on G, the row is still the same', /^starts on G\b/.test(text(p, '#shStart')) && text(p, '#shNames') === 'G G D D E E D C C B B A A G' && rowText(p) === TWINKLE_ROW);
  ok('down 5: Octave down is disabled (G3 - 12 would leave the strip) and a click changes nothing', p.doc.getElementById('shOd').disabled && (click(p, '#shOd'), /^starts on G\b/.test(text(p, '#shStart'))));
  // ---- the buttons play
  click(p, '#shReset');
  ok('Back to start: the tune is where it began', /^starts on C\b/.test(text(p, '#shStart')) && JSON.stringify(litKeys(p, 'tune')) === JSON.stringify([60, 62, 64, 65, 67, 69]) && p.doc.getElementById('shOu').disabled);
  p.osc.length = 0; click(p, '#shPlay');
  ok('Play sounds the whole tune from its position, in order', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, ...TUNES[0][1])));
  click(p, '#shOd');
  ok('Octave down: an octave lower on the strip, the same letters, the octave said, the same row', JSON.stringify(litKeys(p, 'tune')) === JSON.stringify([48, 50, 52, 53, 55, 57]) && /^starts on C\b.*octave 3/.test(text(p, '#shStart')) && text(p, '#shNames') === 'C C G G A A G F F E E D D C' && rowText(p) === TWINKLE_ROW && p.doc.getElementById('shDn').disabled);
  click(p, '#shOu');
  ok('Octave up: back where it was', JSON.stringify(litKeys(p, 'tune')) === JSON.stringify([60, 62, 64, 65, 67, 69]) && /octave 4/.test(text(p, '#shStart')));
  // ---- break one interval
  p.osc.length = 0; click(p, '#shBreak');
  ok('Break one interval plays the tune with its middle note raised a half step', JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, ...g.breakOne(TUNES[0][1]))));
  ok('the changed note is marked in a second colour (one key), the tune still lit', JSON.stringify(litKeys(p, 'broken')) === JSON.stringify([66]) && litKeys(p, 'tune').includes(65));
  ok('the row shows the two changed sizes, as text, marked', rowText(p) === '0 +7 0 +2 0 -2 -1 -1 -1 0 -2 0 -2' && p.doc.querySelectorAll('#shIntervals .chg').length === 2 && [...p.doc.querySelectorAll('#shIntervals .chg')].every((e: any) => /changed/i.test(e.getAttribute('aria-label') ?? e.getAttribute('title') ?? '')));
  ok('the button says it is on', p.doc.getElementById('shBreak').getAttribute('aria-pressed') === 'true');
  ok('while the tune is broken the caption is gone (the intervals DID change) - it comes back with the true tune', p.doc.getElementById('shCaption').hidden);
  p.osc.length = 0; click(p, '#shBreak');
  ok('pressing it again restores the true tune: no marked key, the true row, and it plays the true tune', litKeys(p, 'broken').length === 0 && !p.doc.getElementById('shCaption').hidden && rowText(p) === TWINKLE_ROW && p.doc.querySelectorAll('#shIntervals .chg').length === 0 && p.doc.getElementById('shBreak').getAttribute('aria-pressed') === 'false' && JSON.stringify(oscHz(p)) === JSON.stringify(hz(g, ...TUNES[0][1])));
  // ---- another tune
  click(p, '#shUp');
  const sel = p.doc.getElementById('shTune'); sel.value = 'ode'; sel.dispatchEvent(new p.win.Event('change'));
  ok('Ode to Joy: its own names and row, back at its start, the caption gone', text(p, '#shNames') === 'E E F G G F E D C C D E E D D' && rowText(p) === g.tuneIntervals(TUNES[2][1]).map((v: number) => (v > 0 ? '+' + v : String(v))).join(' ') && /^starts on E\b/.test(text(p, '#shStart')) && p.doc.getElementById('shCaption').hidden);
  sel.value = 'jacques'; sel.dispatchEvent(new p.win.Event('change'));
  ok('Frère Jacques: 14 names', text(p, '#shNames').split(' ').length === 14 && /^starts on C\b/.test(text(p, '#shStart')));
  // ---- the tuning dropdown reaches the tune
  const tun = p.doc.getElementById('tuning'); tun.value = 'pythagorean'; tun.dispatchEvent(new p.win.Event('change'));
  p.osc.length = 0; click(p, '#shPlay');
  ok('the tuning dropdown changes the tune\'s sound', +p.osc[1].toFixed(2) === +g.midiToHz(62, 'pythagorean').toFixed(2));
  // ---- accessibility
  ok('the interval row is text with its own accessible name, not colour alone', /Interval sizes/i.test(p.doc.getElementById('shIntervals').getAttribute('aria-label') ?? '') && /^[-+0-9 ]+$/.test(rowText(p)));
  ok('the Shift controls have accessible names', ['shTune', 'shDn', 'shUp', 'shOd', 'shOu', 'shPlay', 'shReset', 'shBreak'].every((i) => ((p.doc.getElementById(i).getAttribute('aria-label') ?? p.doc.getElementById(i).textContent) ?? '').trim().length > 0));
  ok('the page still loads clean after all that', p.errors.length === 0);
  return bad;
}

test('SHIFT, the page in a DOM: the fourth tab, the picker, the strip, shifts (names change, the interval row does not, the caption appears), disabled edges with a reason, Play, Back to start, Break one interval (and again), the tuning dropdown, accessibility', () => {
  assert.deepEqual(shiftPageFailures(html), []);
});

test('SHIFT, every allowed position of every tune in the page: the names line moves with a half-step shift and the interval row never does', () => {
  const g = pure();
  for (const t of g.TUNES) {
    const p = openPage(html, () => 0);
    click(p, '#tabShift'); p.doc.getElementById('shTune').value = t.id; p.doc.getElementById('shTune').dispatchEvent(new p.win.Event('change'));
    const row = rowText(p); let seen = new Set<string>([text(p, '#shNames')]);
    for (let i = 0; i < 40 && !p.doc.getElementById('shUp').disabled; i++) { click(p, '#shUp'); assert.equal(rowText(p), row, `${t.id}: row after up ${i + 1}`); seen.add(text(p, '#shNames')); }
    for (let i = 0; i < 80 && !p.doc.getElementById('shDn').disabled; i++) { click(p, '#shDn'); assert.equal(rowText(p), row, `${t.id}: row after down ${i + 1}`); seen.add(text(p, '#shNames')); }
    assert.ok(seen.size >= 8, `${t.id}: the name line took ${seen.size} different values across the strip`);                  // Bach has 8 positions on the strip (-7..0)
    assert.equal(p.errors.length, 0);
  }
});

test('SHIFT, the Bach tune in the page (2026-11-13-1212): picked fourth, its own names, row and start; down 7 is the last shift down (names change, the row does not), no shift up (the top note is C5), each disabled button says why; Play sounds 16 short notes; Break one raises the 9th', () => {
  const g = pure(); const p = openPage(html, () => 0);
  click(p, '#tabShift');
  const sel = p.doc.getElementById('shTune'); sel.value = 'bwv1007'; sel.dispatchEvent(new p.win.Event('change'));
  const row = BACH.slice(1).map((m, i) => { const d = m - BACH[i]; return d > 0 ? '+' + d : String(d); }).join(' ');
  assert.equal(rowText(p), row);
  assert.equal(text(p, '#shNames'), 'G D B A B D B D G E C B C E C E');
  assert.match(text(p, '#shStart'), /^starts on G \(octave 3\)/);
  assert.deepEqual(litKeys(p, 'tune'), [55, 62, 64, 69, 71, 72]);
  assert.ok(p.doc.getElementById('shUp').disabled && /highest note would go above C5/.test(p.doc.getElementById('shUp').getAttribute('title')), 'no shift up, and it says why');
  assert.equal(p.osc.length, 0, 'picking a tune is silent');
  // octave buttons: both off the strip, with their reasons
  assert.ok(p.doc.getElementById('shOd').disabled && /go an octave down/.test(p.doc.getElementById('shOd').getAttribute('title')));
  assert.ok(p.doc.getElementById('shOu').disabled && /go an octave up/.test(p.doc.getElementById('shOu').getAttribute('title')));
  for (let i = 0; i < 7; i++) { assert.equal(p.doc.getElementById('shDn').disabled, false, `down ${i + 1} is allowed`); click(p, '#shDn'); assert.equal(rowText(p), row, `the row after down ${i + 1}`); }
  assert.equal(text(p, '#shNames'), g.noteNames(g.shiftTune(BACH, -7)).join(' '), 'down 7: the names are the tune moved');
  assert.equal(text(p, '#shNames').split(' ')[0], 'C');
  assert.notEqual(text(p, '#shNames'), 'G D B A B D B D G E C B C E C E');
  assert.ok(p.doc.getElementById('shDn').disabled && /lowest note would go below C3/.test(p.doc.getElementById('shDn').getAttribute('title')), 'an 8th shift down is off, and says why');
  assert.equal(litKeys(p, 'tune').join(), [48, 55, 57, 62, 64, 65].join());
  assert.match(text(p, '#shStart'), /^starts on C \(octave 3\)/);
  assert.equal(p.doc.getElementById('shCaption').hidden, false, 'the caption: the notes changed, the intervals did not');
  // Play: 16 notes, in order, from the shifted position
  click(p, '#shReset'); p.osc.length = 0; click(p, '#shPlay');
  assert.deepEqual(oscHz(p), hz(g, ...BACH), 'Play sounds all 16 pitches in order');
  // Break one interval: the 9th note raised a half step, exactly two interval sizes change, it sounds
  p.osc.length = 0; click(p, '#shBreak');
  assert.deepEqual(litKeys(p, 'broken'), [56]);
  assert.equal(p.doc.querySelectorAll('#shIntervals .chg').length, 2);
  assert.deepEqual(oscHz(p), hz(g, ...g.breakOne(BACH)));
  assert.equal(p.errors.length, 0);
});

test('SHIFT CONTROL: the checks can fail - a broken note that is not raised, a break note that is not the middle one, a shift that ignores the strip, intervals that follow the shift each go red', () => {
  assert.deepEqual(shiftCoreFailures(pure()), [], 'the undamaged page passes');
  assert.deepEqual(shiftPageFailures(html), [], 'the undamaged page passes');
  const damaged = (from: string, to: string): string => { assert.ok(html.includes(from), `the control's premise: the page contains ${from}`); return html.replace(from, to); };
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('out[i] = notes[i] + 1;', 'out[i] = notes[i];')))).length > 0, 'a break that raises nothing');
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('notes: [55, 62, 71, 69, 71, 62, 71, 62, 55, 64,', 'notes: [55, 62, 71, 69, 71, 62, 71, 62, 55, 65,')))).length > 0, 'a Bach pitch that is not the source\'s');
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('step: 0.2, ', '')))).length > 0, 'a Bach tune that plays at the slow 0.45 s');
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('notes: [55, 62, 71, 69, 71, 62, 71, 62, 55, 64, 72, 71, 72, 64, 72, 64] }', 'notes: [55, 62, 71, 69, 71, 62, 71, 62, 55, 64, 72, 71, 72, 64, 72, 74] }')))).length > 0, 'a note above the strip');
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('return Math.floor(notes.length / 2);', 'return 1;')))).length > 0, 'a break note that is not the middle one');
  assert.ok(shiftCoreFailures(pure(scriptOf(damaged('return Math.min.apply(null, notes) + semitones >= low && Math.max.apply(null, notes) + semitones <= high;', 'return true;')))).length > 0, 'a shift that ignores the strip');
  assert.ok(shiftPageFailures(damaged('function signed(d) { return (d > 0 ? "+" : "") + d; }', 'function signed(d) { return String(Math.abs(d)); }')).length > 0, 'an interval row without its signs');
  assert.ok(shiftPageFailures(damaged('$("shCaption").hidden = !sh.shifted || sh.broken;', '$("shCaption").hidden = true;')).length > 0, 'a caption that never shows');
  assert.ok(shiftPageFailures(damaged('$("shCaption").hidden = !sh.shifted || sh.broken;', '$("shCaption").hidden = !sh.shifted;')).length > 0, 'a caption that stays while the tune is broken');
  assert.ok(shiftPageFailures(damaged('sh.offset += d; sh.shifted = true; renderShift();', 'sh.offset += d; renderShift();')).length > 0, 'a caption that does not know a shift happened');
  assert.ok(shiftPageFailures(damaged('b.disabled = !ok;', 'b.disabled = false;')).length > 0, 'edges that are never disabled');
  assert.ok(shiftPageFailures(damaged('title: "Twinkle Twinkle Little Star"', 'title: "Twinkle"')).length > 0, 'a wrong tune title');
});

// ---- P3: the other gadgets are untouched --------------------------------------------------------------------------------------------------------------------

/** The commit of THIS repo the drain started from: the other gadgets are compared with their text there, never with a moving tree. */
const START_SHA = 'c6285f9';
const skipReason = pinSkipReason(ROOT, START_SHA, 'this repo');
for (const other of ['guitar_fretboard.html', 'lute_fretboard.html', 'monochord.html', 'piano_keyboard.html', 'piano_keyboard_c_major_triad.html', 'rhythm_box.html', 'mandolin_fretboard.html']) {
  test(`P3: ${other} is byte-identical to the commit the drain started from`, { skip: skipReason ?? false }, () => {
    const was = execFileSync('git', ['-C', ROOT, 'show', `${START_SHA}:${HTML_DIR}/${other}`], { maxBuffer: 64 * 1024 * 1024 });
    assert.ok(Buffer.compare(was, fs.readFileSync(path.join(ROOT, HTML_DIR, other))) === 0, `${other} changed`);
  });
}
test('P3 control: the comparison can fail - a gadget compared with a DIFFERENT gadget\'s text is not byte-identical', { skip: skipReason ?? false }, () => {
  const lute = execFileSync('git', ['-C', ROOT, 'show', `${START_SHA}:${HTML_DIR}/lute_fretboard.html`], { maxBuffer: 64 * 1024 * 1024 });
  assert.ok(Buffer.compare(lute, fs.readFileSync(path.join(ROOT, HTML_DIR, 'guitar_fretboard.html'))) !== 0);
});
