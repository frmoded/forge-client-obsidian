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
  const tabs = ['tabExplore', 'tabChart', 'tabTrainer'].map((i) => p.doc.getElementById(i));
  assert.deepEqual(tabs.map((t: any) => t.getAttribute('role')), ['tab', 'tab', 'tab']);
  tabs[0].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  tabs[1].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  tabs[0].dispatchEvent(new p.win.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true', 'wraps round');
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
