// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - THE GRAMMAR of a bar's list: the exact words (11d.3), every one parse-able and canonical, applied to the bar's data by a pure function, never throwing on garbage. Written RED first (the module did not exist).
// No obsidian, no DOM, no model call. The widget's own pure functions (rotate, mirror, move ring, the loader's limits) are the ORACLE for what a transform sentence and a limit mean: they are read from the real rhythm_box.html, and the test FAILS
// (never skips) when that file cannot be found.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  BAR_FORMS, applyBarLine, barSentencesOf, canonicalBarLine, defaultGroup, headSentence, loadableGrid, parseBarSentence, renderBarLine, type BarLine,
} from './bar-grammar-core.ts';
import { RHYTHM_CHANNELS, formatRhythmJson, validateRhythmData, type RhythmData } from './rhythm-edit-core.ts';
import { WIDGET_FILE } from './test-support/rhythm-widget-harness.ts';

const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const BAR: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 118, channels: { kick: row(0, 8), snare: row(4, 12) } };
const parsed = (s: string): BarLine => { const r = parseBarSentence(s); assert.equal(r.ok, true, `${s} -> ${JSON.stringify(r)}`); return (r as { line: BarLine }).line; };
const applied = (d: RhythmData, s: string): RhythmData => { const r = applyBarLine(d, parsed(s)); assert.equal(r.ok, true, `${s} -> ${JSON.stringify(r)}`); return (r as { data: RhythmData }).data; };
const refusal = (d: RhythmData, s: string): string => { const p = parseBarSentence(s); if (!p.ok) return p.message; const r = applyBarLine(d, p.line); assert.equal(r.ok, false, `${s} was accepted`); return (r as { message: string }).message; };

// ---- the words: every canonical sentence parses and renders back to itself --------------------------------------------------------------------------------------------------------------------------

const CANONICAL = [
  'Hit kick on step 1.',
  'Hit kick on steps 1 and 5.',
  'Hit kick on steps 1, 5 and 9.',
  'Hit kick on steps 1, 3, 5, 7 and 9.',
  'Hit conga_high on steps 5, 9 and 13 at velocity 80.',
  'Hit snare on step 5 at velocity 0.',
  'Clear kick on step 5.',
  'Clear kick on steps 5 and 13.',
  'Clear kick.',
  'Set the tempo to 118.',
  'Set the tempo to 87.5.',
  'Set the swing to 20 percent.',
  'Use 16 steps in 4/4.',
  'Use 8 steps in 4/4.',
  'Use 8 steps in 4/4 in groups of 4.',
  'Use 12 steps in 12/8.',
  'Use 12 steps in 3/4.',
  'Add the channel hihat.',
  'Remove the channel hihat.',
  'Shift every channel one step to the left.',
  'Shift every channel one step to the right.',
  'Mirror every channel.',
  'Rotate the kick channel one step to the left.',
  'Rotate the snare channel one step to the right.',
  'Move the snare channel one place earlier.',
  'Move the kick channel one place later.',
  'Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.',
  'Start with 12 steps in 12/8 at 120 beats per minute: bell on steps 1, 3, 5, 6, 8, 10 and 12.',
  'Start with 12 steps in 3/4 in groups of 3 at 90 beats per minute with 20 percent swing: kick on step 1, hihat with no hits.',
  'Start with 20 steps in 5/4 at 90 beats per minute: conga_high on steps 5, 9 and 13 at velocity 80 and on step 1 at velocity 112, conga_low on step 17 at velocity 112.',
  'Start with 16 steps in 4/4 at 100 beats per minute: kick on steps 1 and 9 and on step 5 at velocity 60, snare with no hits.',
];

test('every canonical sentence parses and renders back to exactly itself (the words are a fixpoint)', () => {
  for (const s of CANONICAL) {
    const line = parsed(s);
    const out = line.kind === 'grid' ? renderBarLine(line) : renderBarLine(line);
    assert.equal(out, s, `canonical: ${s}`);
    assert.equal(renderBarLine(parsed(out)), out, 'and again');
  }
});

test('a typed sentence is read leniently and said canonically (case, the, step/steps, order, repeats, the stop, hi-hat)', () => {
  const same: Array<[string, string]> = [
    ['hit kick on steps 9, 1 and 5', 'Hit kick on steps 1, 5 and 9.'],
    ['HIT THE KICK ON STEP 1', 'Hit kick on step 1.'],
    ['Hit kick on steps 5, 1, 1 and 5.', 'Hit kick on steps 1 and 5.'],
    ['Hit kick on steps 1 and 5', 'Hit kick on steps 1 and 5.'],
    ['Hit hi-hat on step 3.', 'Hit hihat on step 3.'],
    ['Hit hi hat on steps 3 and 7.', 'Hit hihat on steps 3 and 7.'],
    ['Hit the conga high on step 3.', 'Hit conga_high on step 3.'],
    ['Hit kick on step 1 at velocity 100', 'Hit kick on step 1 at velocity 100.'],
    ['Clear the snare', 'Clear snare.'],
    ['clear snare on step 5', 'Clear snare on step 5.'],
    ['Set tempo to 118', 'Set the tempo to 118.'],
    ['Set the tempo to 118 beats per minute.', 'Set the tempo to 118.'],
    ['Set the swing to 20%', 'Set the swing to 20 percent.'],
    ['Set swing to 20 percent', 'Set the swing to 20 percent.'],
    ['Add channel hihat', 'Add the channel hihat.'],
    ['Remove the hihat channel.', 'Remove the channel hihat.'],
    ['Mirror the pattern.', 'Mirror every channel.'],
    ['Shift everything one step left.', 'Shift every channel one step to the left.'],
    ['Rotate the kick one step to the right.', 'Rotate the kick channel one step to the right.'],
    ['Move the kick channel one place earlier', 'Move the kick channel one place earlier.'],
  ];
  for (const [typed, canon] of same) assert.equal(canonicalBarLine(parsed(typed), BAR), canon, typed);
});

test('"Use 16 steps." is read: the signature of the moment is kept, the group is the default one; said in full', () => {
  assert.equal(canonicalBarLine(parsed('Use 8 steps.'), BAR), 'Use 8 steps in 4/4.');
  assert.equal(canonicalBarLine(parsed('Use 12 steps.'), { ...BAR, time_signature: '12/8', steps: 12, group_size: 3, channels: {} } as RhythmData), 'Use 12 steps in 12/8.');
  assert.equal(canonicalBarLine(parsed('Use 16 steps in 4/4 in groups of 4.'), BAR), 'Use 16 steps in 4/4.', 'a group that is the default one is not said');
  assert.equal(defaultGroup('4/4', 16), 4); assert.equal(defaultGroup('4/4', 8), 2); assert.equal(defaultGroup('3/4', 12), 4); assert.equal(defaultGroup('12/8', 12), 3); assert.equal(defaultGroup('6/8', 6), 3); assert.equal(defaultGroup('5/4', 20), 4);
});

test('the typed text is split into sentences (a decimal is not a stop; a missing last stop is added)', () => {
  assert.deepEqual(barSentencesOf('Set the tempo to 87.5. Hit kick on step 1'), ['Set the tempo to 87.5.', 'Hit kick on step 1.']);
  assert.deepEqual(barSentencesOf('  Hit kick on steps 1 and 5.   Clear snare.  '), ['Hit kick on steps 1 and 5.', 'Clear snare.']);
  assert.deepEqual(barSentencesOf(''), []);
  assert.deepEqual(barSentencesOf('   '), []);
  assert.deepEqual(barSentencesOf('Start with 16 steps in 4/4 at 118.5 beats per minute: kick on step 1.'), ['Start with 16 steps in 4/4 at 118.5 beats per minute: kick on step 1.']);
});

// ---- what each sentence does to a bar ----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('Hit, Clear: cells of the named channel (steps count from 1); a velocity is kept; Clear with no steps clears the channel', () => {
  const a = applied(BAR, 'Hit kick on steps 3 and 5.');
  assert.deepEqual(a.channels.kick, row(0, 2, 4, 8));
  assert.deepEqual(BAR.channels.kick, row(0, 8), 'the input is never changed');
  assert.deepEqual(applied(a, 'Clear kick on step 1.').channels.kick, row(2, 4, 8));
  assert.deepEqual(applied(a, 'Clear kick.').channels.kick, row());
  const v = applied(BAR, 'Hit kick on steps 2 and 3 at velocity 80.');
  assert.equal(v.channels.kick[1], 80); assert.equal(v.channels.kick[2], 80); assert.equal(v.channels.kick[0], true);
  assert.equal(applied(v, 'Hit kick on step 2.').channels.kick[1], true, 'a plain hit over a velocity cell is a plain hit');
});

test('Set the tempo, Set the swing: whole numbers the Beat Box loads (40 to 240, 0 to 100)', () => {
  assert.equal(applied(BAR, 'Set the tempo to 90.').tempo_bpm, 90);
  assert.equal(applied(BAR, 'Set the swing to 20 percent.').swing_pct, 20);
  assert.match(refusal(BAR, 'Set the tempo to 39.'), /40 to 240/);
  assert.match(refusal(BAR, 'Set the tempo to 241.'), /40 to 240/);
  assert.match(refusal(BAR, 'Set the tempo to 100.5.'), /whole number/);
  assert.match(refusal(BAR, 'Set the swing to 101 percent.'), /0 to 100/);
  assert.match(refusal(BAR, 'Set the swing to 2.5 percent.'), /whole number/);
});

test('Use N steps in SIG: the grid changes and EVERY channel is cleared, as the widget does; only grids the Beat Box has', () => {
  const g = applied(BAR, 'Use 12 steps in 3/4.');
  assert.deepEqual([g.time_signature, g.steps, g.group_size], ['3/4', 12, 4]);
  assert.deepEqual(Object.keys(g.channels), ['kick', 'snare']);
  assert.deepEqual(g.channels.kick, new Array(12).fill(false));
  const e = applied(BAR, 'Use 8 steps in 4/4.');
  assert.deepEqual([e.steps, e.group_size], [8, 2]);
  assert.equal(applied(BAR, 'Use 8 steps in 4/4 in groups of 4.').group_size, 4);
  assert.match(refusal(BAR, 'Use 10 steps in 4/4.'), /Beat Box/);
  assert.match(refusal(BAR, 'Use 16 steps in 7/8.'), /Beat Box/);
  assert.match(refusal(BAR, 'Use 12 steps in 3/4 in groups of 3.'), /Beat Box/);
});

test('Add the channel, Remove the channel: the channel list is data, in order; no repeats, never the last one', () => {
  const a = applied(BAR, 'Add the channel hihat.');
  assert.deepEqual(Object.keys(a.channels), ['kick', 'snare', 'hihat']);
  assert.deepEqual(a.channels.hihat, row());
  assert.match(refusal(BAR, 'Add the channel kick.'), /already/);
  assert.match(refusal(BAR, 'Add the channel cowbell.'), /not a channel.*kick, snare, hihat, bell, claves, conga_high and conga_low/);
  assert.deepEqual(Object.keys(applied(a, 'Remove the channel snare.').channels), ['kick', 'hihat']);
  assert.match(refusal(BAR, 'Remove the channel hihat.'), /no hihat channel/);
  assert.match(refusal({ ...BAR, channels: { kick: row(0) } }, 'Remove the channel kick.'), /last channel/);
});

test('refusals are in plain words: a channel the bar has not, a step the bar has not, a verb nobody knows', () => {
  assert.match(refusal(BAR, 'Hit hihat on step 3.'), /no hihat channel in this bar.*Add the channel hihat\./);
  assert.match(refusal(BAR, 'Hit kick on step 17.'), /Step 17 is beyond this bar's 16 steps/);
  assert.match(refusal(BAR, 'Hit kick on steps 3 and 20.'), /Step 20/);
  assert.match(refusal(BAR, 'Hit kick on step 0.'), /count from 1/);
  assert.match(refusal(BAR, 'Hit cowbell on step 1.'), /cowbell is not a channel/);
  assert.match(refusal(BAR, 'Hit kick on step 1 at velocity 128.'), /0 to 127/);
  assert.match(refusal(BAR, 'Clear hihat.'), /no hihat channel/);
  const unknown = parseBarSentence('Frobnicate the kick.');
  assert.equal(unknown.ok, false);
  assert.match((unknown as { message: string }).message, /Hit, Clear/);
  assert.ok(BAR_FORMS.length >= 10 && BAR_FORMS.every((f) => parseBarSentence(f).ok), 'the forms the refusal lists all parse');
  assert.equal(parseBarSentence('').ok, false);
  assert.equal(parseBarSentence('   ').ok, false);
});

// ---- the transforms mean what the widget's own functions mean (the widget is the oracle) --------------------------------------------------------------------------------------------------------

function widget(): any {
  assert.ok(WIDGET_FILE, 'rhythm_box.html must be found (sibling or bundled vault): this test never skips');
  const html = fs.readFileSync(WIDGET_FILE!, 'utf-8');
  const script = (/<script>([\s\S]*?)<\/script>/.exec(html) ?? [])[1];
  const mod: { exports: any } = { exports: {} };
  new Function('module', script)(mod);
  return mod.exports;
}
const cell = (r: number): boolean | number => (r < 0.45 ? false : r < 0.8 ? true : 1 + Math.floor((r - 0.8) * 5 * 126));
function randomData(seed: number, steps = 16): RhythmData {
  let x = seed * 2654435761 % 4294967296;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const names = [...RHYTHM_CHANNELS].sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * 4));
  return { time_signature: '4/4', steps, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: Object.fromEntries(names.map((n) => [n, Array.from({ length: steps }, () => cell(rnd()))])) };
}

test('Shift, Mirror, Rotate, Move mean exactly what the Beat Box widget does (read from the real rhythm_box.html), over 200 random bars incl. velocities', () => {
  const w = widget();
  for (let seed = 1; seed <= 200; seed++) {
    const d = randomData(seed, seed % 3 === 0 ? 12 : 16);
    const rows = Object.keys(d.channels); const ch = rows[seed % rows.length];
    const pat = (x: RhythmData) => x.channels;
    const cases: Array<[string, string, string?]> = [
      ['Shift every channel one step to the left.', 'shiftLeft'], ['Shift every channel one step to the right.', 'shiftRight'], ['Mirror every channel.', 'mirror'],
      [`Rotate the ${ch} channel one step to the left.`, 'rotateCcw', ch], [`Rotate the ${ch} channel one step to the right.`, 'rotateCw', ch],
    ];
    for (const [sentence, id, sel] of cases) {
      const expected = JSON.parse(JSON.stringify(w.applyTransform(id, pat(d), rows, d.steps, sel)));
      const got = applied(d, sentence);
      for (const name of rows) assert.deepEqual(got.channels[name], expected[name], `${sentence} on ${name} (seed ${seed})`);
      assert.deepEqual(Object.keys(got.channels), rows);
    }
    for (const dir of [-1, 1] as const) {
      const expected = w.moveRing(rows, ch, dir) as string[];
      const sentence = `Move the ${ch} channel one place ${dir === -1 ? 'earlier' : 'later'}.`;
      if (expected.join() === rows.join()) { assert.match(refusal(d, sentence), /already the (first|last) channel/, `at an end the widget does nothing and the sentence says so (${sentence})`); continue; }
      assert.deepEqual(Object.keys(applied(d, sentence).channels), expected, `move ${dir}`);
    }
  }
});

test('the limits a typed line is held to are the widget loader\'s own: tempo, swing, grid (parseRhythmLoad is the oracle)', () => {
  const w = widget();
  for (const tempo of [39, 40, 100, 240, 241]) {
    const next = applyBarLine(BAR, { kind: 'tempo', bpm: tempo });
    assert.equal(next.ok, w.parseRhythmLoad({ ...BAR, tempo_bpm: tempo }).ok, `tempo ${tempo}`);
  }
  for (const swing of [0, 50, 100, 101]) {
    const next = applyBarLine(BAR, { kind: 'swing', pct: swing });
    assert.equal(next.ok, w.parseRhythmLoad({ ...BAR, swing_pct: swing }).ok, `swing ${swing}`);
  }
  for (const [sig, steps, group] of [['4/4', 16, 4], ['4/4', 8, 2], ['4/4', 8, 4], ['4/4', 8, 3], ['3/4', 12, 4], ['12/8', 12, 3], ['6/8', 6, 3], ['5/4', 20, 4], ['7/8', 14, 2], ['3/4', 12, 3], ['4/4', 12, 4]] as const) {
    const next = applyBarLine(BAR, { kind: 'grid', steps, signature: sig, group });
    const load = w.parseRhythmLoad({ time_signature: sig, steps, group_size: group, swing_pct: 0, tempo_bpm: 100, channels: { kick: new Array(steps).fill(false) } });
    assert.equal(next.ok, load.ok, `${sig} ${steps} ${group}`);
  }
});

// ---- the head: synthesized from the data a bar has today ---------------------------------------------------------------------------------------------------------------------------------------------

test('the head says the whole bar and replays to exactly that bar: the example of 11d.2, a swing, a group, velocities, an empty channel, a fraction', () => {
  assert.equal(headSentence(BAR), 'Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.');
  const odd: RhythmData[] = [
    { time_signature: '3/4', steps: 12, group_size: 3, swing_pct: 20, tempo_bpm: 90, channels: { kick: [true, ...new Array(11).fill(false)], hihat: new Array(12).fill(false) } },
    { time_signature: '4/4', steps: 8, group_size: 4, swing_pct: 33, tempo_bpm: 87.5, channels: { snare: [100, 0, 60, false, true, false, 60, 0] } },
    { time_signature: '5/4', steps: 20, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { conga_high: [112, ...new Array(3).fill(false), 80, ...new Array(3).fill(false), 80, ...new Array(3).fill(false), 80, ...new Array(7).fill(false)], conga_low: [...new Array(16).fill(false), 112, false, false, false] } },
    { time_signature: '4/4', steps: 64, group_size: 4, swing_pct: 100, tempo_bpm: 240, channels: { kick: new Array(64).fill(true) } },
  ];
  for (const d of odd) {
    const h = headSentence(d); assert.ok(h, JSON.stringify(d));
    const back = applied({ ...BAR }, h!);
    assert.equal(formatRhythmJson(back), formatRhythmJson(d), h!);
    assert.equal(renderBarLine(parsed(h!)), h!, 'the head is canonical');
  }
  assert.equal(headSentence({ ...BAR, time_signature: 'common time' }), null, 'a signature the grammar cannot say has no head');
  assert.equal(headSentence({ ...BAR, steps: 99 } as RhythmData), null, 'data the Beat Box would refuse has no head');
});

test('a head is refused in words when it says a step twice, a channel twice, a step beyond the bar, or is not rhythm data', () => {
  const s = (t: string) => parseBarSentence(t);
  assert.equal(s('Start with 16 steps in 4/4 at 118 beats per minute: kick on step 1, kick on step 2.').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 at 118 beats per minute: kick on step 1 and on step 1.').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 at 118 beats per minute: kick on step 17.').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 at 118 beats per minute: cowbell on step 1.').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 at 118 beats per minute: .').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 at 0 beats per minute: kick on step 1.').ok, false);
  assert.equal(s('Start with 16 steps in 4/4 in groups of 5 at 100 beats per minute: kick on step 1.').ok, false);
  assert.equal(s('Start with 100 steps in 4/4 at 100 beats per minute: kick on step 1.').ok, false);
});

// ---- never throws -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('never throws and never hangs: corrupted versions of every canonical sentence, and garbage', () => {
  let x = 12345;
  const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const junk = ['', ' ', '.', '..', '1', '-1', '1e999', 'NaN', 'null', '{}', '[[x]]', '\u0000', '😀', 'Hit', 'Hit .', 'Hit kick on', 'Hit kick on step', 'Hit kick on steps and', 'Hit kick on steps 1,,2', 'Start with', 'Start with : :', 'Set the tempo to', 'Set the tempo to 99999999999999999999999.', 'Hit kick on step 99999999999999999999999.', 'x'.repeat(20000), 'Hit kick on steps ' + '1, '.repeat(5000) + '2.'];
  for (const j of junk) { const r = parseBarSentence(j); assert.equal(typeof r.ok, 'boolean'); assert.ok(barSentencesOf(j).length >= 0); }
  for (const s of CANONICAL) {
    for (let k = 0; k < 120; k++) {
      let t = s;
      const op = Math.floor(rnd() * 4);
      const at = Math.floor(rnd() * t.length);
      if (op === 0) t = t.slice(0, at);
      else if (op === 1) t = t.slice(0, at) + t.slice(at + 1 + Math.floor(rnd() * 3));
      else if (op === 2) t = t.slice(0, at) + String.fromCharCode(32 + Math.floor(rnd() * 95)) + t.slice(at);
      else t = t.split(' ').sort(() => rnd() - 0.5).join(' ');
      const r = parseBarSentence(t);
      assert.equal(typeof r.ok, 'boolean');
      if (r.ok) {
        const out = applyBarLine(BAR, r.line);                      // whatever it read, applying it never throws either
        assert.equal(typeof out.ok, 'boolean');
        const said = renderBarLine(r.line);
        assert.equal(parseBarSentence(said).ok, true, `what the grammar says it can read again: ${said}`);
      }
    }
  }
});

test('every channel name of the engine is one the grammar knows (the list is the Beat Box\'s own)', () => {
  for (const c of RHYTHM_CHANNELS) assert.equal(validateRhythmData({ ...BAR, channels: { [c]: row() } }).ok, true);
  for (const c of RHYTHM_CHANNELS) assert.equal(canonicalBarLine(parsed(`Add the channel ${c}.`), BAR), `Add the channel ${c}.`);
});

// =====================================================================================================================================================================================================
// 2026-11-19-0993 MUTATION SURVIVORS (triage of ~/.forge-mem-evidence/p0993/mutate-bar-grammar-core.log): every test below FAILS against the mutant it names (checked on a scratch copy of the source) and passes on the real code.
// =====================================================================================================================================================================================================

const failOf = (s: string): { message: string; column: number } => { const r = parseBarSentence(s); assert.equal(r.ok, false, `${s} was read`); return r as { ok: false; message: string; column: number }; };
const CHANNELS_SAID = 'kick, snare, hihat, bell, claves, conga_high and conga_low';
const HEAD_PREFIX = 'Start with 16 steps in 4/4 at 100 beats per minute: ';

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:45 "&&" -> "||"; :46 early-return, eq-flip x2, number+1 (4->5, 3->4)
test('defaultGroup: the six grids say their own group; every other grid falls back to 4 (divisible by 4), else 3 (by 3), else 1; the 2 of the 8-step grid belongs to 4/4 only', () => {
  const table: Array<[string, number, number]> = [
    ['4/4', 16, 4], ['4/4', 8, 2], ['3/4', 12, 4], ['12/8', 12, 3], ['6/8', 6, 3], ['5/4', 20, 4],
    ['4/4', 12, 4], ['4/4', 6, 3], ['4/4', 9, 3], ['4/4', 7, 1], ['4/4', 10, 1], ['4/4', 1, 1], ['4/4', 2, 1], ['3/4', 8, 4], ['6/8', 8, 4], ['12/8', 8, 4],
    ['7/8', 14, 1], ['7/8', 12, 4], ['7/8', 9, 3], ['constructor', 12, 4], ['__proto__', 3, 3],
  ];
  for (const [sig, steps, want] of table) assert.equal(defaultGroup(sig, steps), want, `${sig} ${steps}`);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:51 "return false;" -> "return;"
test('loadableGrid answers true or false (never undefined): the six grids and the 8-step 4/4 in groups of 2 or 4, nothing else, whatever the signature is called', () => {
  for (const [sig, steps, group] of [['4/4', 16, 4], ['4/4', 8, 2], ['4/4', 8, 4], ['3/4', 12, 4], ['12/8', 12, 3], ['6/8', 6, 3], ['5/4', 20, 4]] as const) assert.equal(loadableGrid(sig, steps, group), true, `${sig} ${steps} ${group}`);
  for (const [sig, steps, group] of [['7/8', 14, 2], ['4/4', 16, 2], ['4/4', 8, 3], ['4/4', 12, 4], ['3/4', 12, 3], ['3/4', 8, 2], ['12/8', 12, 4], ['constructor', 12, 4], ['__proto__', 16, 4], ['toString', 1, 1], ['', 16, 4]] as const) assert.equal(loadableGrid(sig, steps, group), false, `${sig} ${steps} ${group}`);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:61 "return null;" -> "return;" and "&&" -> "||" (parseNum); :137 early-return, :133 :168 :169 columns and wording
test('a tempo or swing that is not a plain number (1.2.3, an exponent form, 16 digits) is refused AT THE READING, in words, pointing at the number', () => {
  for (const s of ['Set the tempo to 1.2.3.', 'Set the tempo to 0.0000001.', 'Set the tempo to 1234567890123456.']) {
    const f = failOf(s);
    assert.equal(f.message, 'The tempo is a number of beats per minute, like 118.', s);
    assert.equal(f.column, 18, s);
  }
  for (const s of ['Set the swing to 1.2.3 percent.', 'Set the swing to 0.0000001 percent.', 'Set the swing to 1234567890123456%.']) {
    const f = failOf(s);
    assert.equal(f.message, 'The swing is a number of percent, like 20.', s);
    assert.equal(f.column, 18, s);
  }
  assert.equal(parseBarSentence('Set the tempo to 0.000001.').ok, true, 'six decimals are still a plain number');
  assert.equal(parseBarSentence('Set the tempo to 999999999999999.').ok, true, 'fifteen digits are still a plain number');
  const head = (extra: string, swing = ''): string => `Start with 16 steps in 4/4 at ${extra} beats per minute${swing}: kick on step 1.`;
  const t = failOf(head('1.2.3'));
  assert.deepEqual(t, { ok: false, message: 'The tempo is a number of beats per minute, like 118.', column: head('1.2.3').indexOf('1.2.3') + 1 } as never);
  const sw = failOf(head('100', ' with 1.2.3 percent swing'));
  assert.deepEqual(sw, { ok: false, message: 'The swing is a number of percent, like 20.', column: head('100', ' with 1.2.3 percent swing').indexOf('1.2.3') + 1 } as never);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:97 "1" -> "2" (the decimal-point test looks at the character just before the stop)
test('a stop is a decimal point only between two DIGITS: a digit two characters back does not make it one', () => {
  assert.deepEqual(barSentencesOf('x1 .5'), ['x1 .', '5.']);
  assert.deepEqual(barSentencesOf('Hit kick on step 1 .5 steps'), ['Hit kick on step 1 .', '5 steps.']);
  assert.deepEqual(barSentencesOf('Set the tempo to 87.5.'), ['Set the tempo to 87.5.']);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:110 empty-string (wording of the catch in parseBarSentence); :115 if-false (wording of "nothing to read")
test('parseBarSentence never throws, even for a value that cannot be turned into text; an empty text says so', () => {
  assert.deepEqual(parseBarSentence(Object.create(null) as never), { ok: false, message: 'That could not be read as a Beat Box sentence.', column: 1 });
  for (const s of ['', '   ', '.', ' . ']) assert.deepEqual(parseBarSentence(s), { ok: false, message: 'There is nothing to read.', column: 1 }, JSON.stringify(s));
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:122 :129 :133 :137 :147 :148 :151 :152 number+1 / plus-minus (the COLUMN of "x is not a channel" points at the name)
test('an unknown channel is refused in plain words and the column points at the name, for every verb that takes a channel', () => {
  const said = `cowbell is not a channel; the channels are ${CHANNELS_SAID}.`;
  const table: Array<[string, number]> = [
    ['Hit cowbell on step 1.', 5], ['hit the cowbell on step 1', 9], ['Clear cowbell.', 7], ['Clear the cowbell on step 1.', 11], ['Add the channel cowbell.', 17], ['add channel cowbell', 13],
    ['Remove the channel cowbell.', 20], ['Remove the cowbell channel.', 12], ['Rotate the cowbell channel one step to the left.', 12], ['Move the cowbell channel one place later.', 10],
  ];
  for (const [s, column] of table) assert.deepEqual(failOf(s), { ok: false, message: said, column } as never, s);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:125 if-false, boundary ">" -> ">=", empty-string 'velocity', number+1 (the velocity is refused AT THE READING, with its column)
test('a velocity above 127 is refused when the sentence is READ (the column points at the word velocity); 0 and 127 are read', () => {
  const s = 'Hit kick on step 1 at velocity 128.';
  assert.deepEqual(failOf(s), { ok: false, message: 'A velocity is a whole number from 0 to 127.', column: s.indexOf('velocity') + 1 } as never);
  assert.equal(failOf('Hit kick on step 1 at velocity 99999999999999999999999.').message, 'A velocity is a whole number from 0 to 127.');
  assert.deepEqual(parsed('Hit kick on step 1 at velocity 127.'), { kind: 'hit', channel: 'kick', steps: [1], velocity: 127 });
  assert.deepEqual(parsed('Hit kick on step 1 at velocity 0.'), { kind: 'hit', channel: 'kick', steps: [1], velocity: 0 });
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:142 if-false, boundary, logic, empty-string; :143 if-false, boundary, logic, empty-string, plus-minus; :144 if-false, eq-flip, drop-statement
test('Use N steps: 1 to 64 steps and a group that divides them are checked at the READING (in words, with the column); a group that is the default one is not kept', () => {
  assert.deepEqual(failOf('Use 0 steps in 4/4.'), { ok: false, message: 'A bar has 1 to 64 steps.', column: 5 } as never);
  assert.deepEqual(failOf('Use 65 steps.'), { ok: false, message: 'A bar has 1 to 64 steps.', column: 5 } as never);
  assert.deepEqual(parsed('Use 64 steps in 4/4.'), { kind: 'grid', steps: 64, signature: '4/4', group: null });
  assert.deepEqual(parsed('Use 1 step.'), { kind: 'grid', steps: 1, signature: null, group: null });
  const g = 'Use 16 steps in 4/4 in groups of 5.';
  assert.deepEqual(failOf(g), { ok: false, message: 'The group size must divide the 16 steps.', column: g.indexOf('groups') + 1 } as never);
  assert.equal(failOf('Use 16 steps in 4/4 in groups of 0.').message, 'The group size must divide the 16 steps.');
  assert.deepEqual(parsed('Use 16 steps in 4/4 in groups of 1.'), { kind: 'grid', steps: 16, signature: '4/4', group: 1 }, 'a group of 1 divides every bar: it is read (the Beat Box then refuses the grid)');
  assert.deepEqual(parsed('Use 16 steps in 4/4 in groups of 4.'), { kind: 'grid', steps: 16, signature: '4/4', group: null }, 'the default group is not kept');
  assert.equal(renderBarLine(parsed('Use 16 steps in 4/4 in groups of 4.')), 'Use 16 steps in 4/4.');
  assert.deepEqual(parsed('Use 8 steps in 4/4 in groups of 4.'), { kind: 'grid', steps: 8, signature: '4/4', group: 4 }, 'a group that is not the default one is kept');
  assert.deepEqual(parsed('Use 8 steps in 4/4 in groups of 2.'), { kind: 'grid', steps: 8, signature: '4/4', group: null });
  assert.deepEqual(parsed('Use 16 steps in groups of 4.'), { kind: 'grid', steps: 16, signature: null, group: 4 }, 'with no signature there is no default to compare with: the group stays');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:154 number+1 (the verb is the FIRST word); :155 empty-string 'clear' 'use' 'remove' 'mirror' 'move'; :157 wording
test('a sentence that starts with a verb the grammar knows but cannot be read gets that verb\'s example; any other first word gets the list of the verbs', () => {
  const table: Array<[string, string]> = [
    ['Hit', 'Hit kick on steps 1, 5 and 9.'], ['Clear', 'Clear kick on step 5.'], ['Set', 'Set the tempo to 118.'], ['Use', 'Use 16 steps in 4/4.'], ['Add', 'Add the channel hihat.'],
    ['Remove', 'Remove the channel hihat.'], ['Shift sideways', 'Shift every channel one step to the left.'], ['Mirror the moon', 'Mirror every channel.'], ['Rotate', 'Rotate the kick channel one step to the right.'],
    ['Move it', 'Move the kick channel one place earlier.'],
  ];
  for (const [s, example] of table) assert.deepEqual(failOf(s), { ok: false, message: `I could not read "${s}". For example: ${example}`, column: 1 } as never, s);
  assert.equal(failOf('Frobnicate the kick.').message, 'I do not know how to read "Frobnicate the kick". A bar\'s sentences start with: Hit, Clear, Set the tempo, Set the swing, Use N steps, Add the channel, Remove the channel, Shift, Mirror, Rotate, Move, Start with. For example: Hit kick on steps 1, 5 and 9.');
  assert.equal(failOf('Please hit the kick').message.startsWith('I do not know how to read "Please hit the kick"'), true, 'the FIRST word decides (a verb later in the sentence does not)');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:160 empty-string 'hi hat'; :161 empty-string '\\-' (the hyphen of hi-hat in a head)
test('a head says its channels by every name a typed head may use: hi-hat, hi hat, hihat, conga_high ...', () => {
  for (const name of ['hi-hat', 'hi hat', 'hihat']) {
    const r = parseBarSentence(`${HEAD_PREFIX}${name} on steps 1 and 9, snare with no hits.`);
    assert.equal(r.ok, true, name);
    assert.deepEqual(Object.keys((r as { line: { data: RhythmData } }).line.data.channels), ['hihat', 'snare'], name);
  }
  const c = parseBarSentence(`${HEAD_PREFIX}conga_low on step 1, conga_high with no hits, claves on step 2, bell on step 3.`);
  assert.equal(c.ok, true);
  assert.deepEqual(Object.keys((c as { line: { data: RhythmData } }).line.data.channels), ['conga_low', 'conga_high', 'claves', 'bell']);
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:165 empty-string, :168 if-false/plus-minus/empty-string, :169 early-return/number+1 x3, :170 logic, number+1 x2, :171 number+1 x2/empty-string, :173 if-false,
// :177 plus-minus/number+1, :182 empty-string, :192 logic, :194 empty-string, :208 if-false/empty-string, :213 number+1
test('a head that cannot be read is refused in words and the column points at the place (table of every refusal of a head)', () => {
  const colAt = (s: string, token: string, from = 0): number => s.toLowerCase().indexOf(token, from) + 1;
  const h = (rest: string): string => `${HEAD_PREFIX}${rest}`;
  const cases: Array<[string, string, number]> = [];
  const add = (s: string, message: string, column: number): void => { cases.push([s, message, column]); };
  add('Start with sixteen steps.', 'A head reads like: Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.', 1);
  add('Start with 16 steps in 4/4 at 1.2.3 beats per minute: kick on step 1.', 'The tempo is a number of beats per minute, like 118.', colAt('Start with 16 steps in 4/4 at 1.2.3 beats per minute: kick on step 1.', '1.2.3'));
  const sw = 'Start with 16 steps in 4/4 at 100 beats per minute with 1.2.3 percent swing: kick on step 1.';
  add(sw, 'The swing is a number of percent, like 20.', colAt(sw, '1.2.3'));
  add('Start with 0 steps in 4/4 at 100 beats per minute: kick on step 1.', 'A bar has 1 to 64 steps.', 12);
  add('Start with 65 steps in 4/4 at 100 beats per minute: kick on step 1.', 'A bar has 1 to 64 steps.', 12);
  const gr = 'Start with 16 steps in 4/4 in groups of 5 at 100 beats per minute: kick on step 1.';
  add(gr, 'The group size must divide the 16 steps.', colAt(gr, 'groups'));
  add('Start with 16 steps in 4/4 at 100 beats per minute:', 'A head says at least one channel, like: kick on steps 1 and 9.', 'Start with 16 steps in 4/4 at 100 beats per minute:'.length);
  add(h('cowbell on step 1.'), `Expected a channel name here (${CHANNELS_SAID}).`, colAt(h('cowbell on step 1.'), 'cowbell'));
  const later = h('kick on step 1, cowbell on step 2.');
  add(later, `Expected a channel name here (${CHANNELS_SAID}).`, colAt(later, 'cowbell'));
  const twice = h('kick on step 1, kick on step 2.');
  add(twice, 'The channel kick is said twice.', colAt(twice, 'kick', colAt(twice, 'kick')));
  const said = h('kick on step 1 and on step 1.');
  add(said, 'Step 1 of kick is said twice.', colAt(said, 'on step', colAt(said, 'on step')));
  const far = h('kick on step 17.');
  add(far, 'Step 17 is beyond the 16 steps of this bar.', colAt(far, 'on step'));
  const zero = h('snare with no hits, kick on step 0.');
  add(zero, 'Steps count from 1.', colAt(zero, 'on step'));
  const vel = h('kick on step 1 at velocity 128.');
  add(vel, 'A velocity is a whole number from 0 to 127.', colAt(vel, 'on step'));
  const noOn = h('kick with 3 hits.');
  add(noOn, 'Expected "on step 1" or "with no hits" after kick.', colAt(noOn, 'with', HEAD_PREFIX.length));
  const comma = h('kick on step 1 snare on step 5.');
  add(comma, 'Expected a comma and the next channel, or the end of the sentence.', colAt(comma, ' snare'));
  for (const [s, message, column] of cases) assert.deepEqual(failOf(s), { ok: false, message, column } as never, s);
  const bad = failOf('Start with 16 steps in 4/4 at 0 beats per minute: kick on step 1.');
  assert.equal(bad.column, 1); assert.match(bad.message, /^tempo_bpm must be a positive number/, 'the engine\'s own words, without its "Not rhythm data:" lead');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:170 number+1 "1" -> "2" ; :171 number+1 "1" -> "2" (a bar of ONE step is a bar); :236 number+1 (the word step/steps of a head); :248 number+1 (the word of a grid line)
test('one step is a bar: its head, its grid line and the words "1 step" / "2 steps" (singular only for one)', () => {
  const one = { time_signature: '4/4', steps: 1, group_size: 1, swing_pct: 0, tempo_bpm: 100, channels: { kick: [true] } } as RhythmData;
  const two = { time_signature: '4/4', steps: 2, group_size: 1, swing_pct: 0, tempo_bpm: 100, channels: { kick: [true, false] } } as RhythmData;
  assert.equal(headSentence(one), 'Start with 1 step in 4/4 at 100 beats per minute: kick on step 1.');
  assert.equal(headSentence(two), 'Start with 2 steps in 4/4 at 100 beats per minute: kick on step 1.');
  assert.deepEqual((parsed('Start with 1 step in 4/4 at 100 beats per minute: kick on step 1.') as Extract<BarLine, { kind: 'start' }>).data, one);
  assert.deepEqual((parsed('Start with 2 steps in 4/4 at 100 beats per minute: kick on step 1.') as Extract<BarLine, { kind: 'start' }>).data, two);
  assert.equal(renderBarLine({ kind: 'grid', steps: 1, signature: null, group: null }), 'Use 1 step.');
  assert.equal(renderBarLine({ kind: 'grid', steps: 2, signature: null, group: null }), 'Use 2 steps.');
  assert.equal(renderBarLine({ kind: 'grid', steps: 1, signature: '4/4', group: 1 }), 'Use 1 step in 4/4 in groups of 1.');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:224 logic "||" -> "&&" and early-return; :237 early-return (the head of a bar that cannot be said is null, never undefined)
test('headSentence is null (strictly) when a number cannot be said plainly (exponent form), and when saying it throws', () => {
  assert.equal(headSentence({ ...BAR, tempo_bpm: 1e-7 }), null, 'a tempo in exponent form');
  assert.equal(headSentence({ ...BAR, swing_pct: 1e-7 }), null, 'a swing in exponent form');
  assert.equal(headSentence({ ...BAR, tempo_bpm: 1e21 }), null);
  assert.equal(headSentence({ ...BAR, tempo_bpm: 87.5, swing_pct: 12.5 }) !== null, true, 'a fraction is plain');
  const { swing_pct: _s, ...noSwing } = BAR; void _s;
  assert.equal(headSentence(noSwing as RhythmData), 'Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.', 'no swing is said as none');
  const boom = new Proxy(row(0), { get: (t, p, r) => { if (p === 'map') throw new Error('boom'); return Reflect.get(t, p, r); } });
  assert.equal(headSentence({ ...BAR, channels: { kick: boom as never } }), null, 'a bar that throws while it is said has no head (and does not throw)');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:278 early-return "return refuse('That sentence could not be applied to this bar.')"
test('applyBarLine never throws: a bar that is not a bar is refused in words', () => {
  assert.deepEqual(applyBarLine(null as never, { kind: 'tempo', bpm: 100 }), { ok: false, message: 'That sentence could not be applied to this bar.' });
  assert.deepEqual(applyBarLine(BAR, undefined as never), { ok: false, message: 'That sentence could not be applied to this bar.' });
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:289 logic "||" -> "&&", number+1 "0" -> "1", boundary ">" -> ">=", early-return
test('the velocity of a Hit: whole numbers 0 to 127 are set (0 and 127 included); a negative, a fraction, 128 and NaN are refused in words', () => {
  const hit = (velocity: number): ReturnType<typeof applyBarLine> => applyBarLine(BAR, { kind: 'hit', channel: 'kick', steps: [2], velocity });
  for (const v of [0, 1, 64, 127]) { const r = hit(v); assert.equal(r.ok, true, `velocity ${v}`); assert.equal((r as { data: RhythmData }).data.channels.kick[1], v); }
  for (const v of [-1, -128, 128, 200, 80.5, 0.5, NaN, Infinity]) assert.deepEqual(hit(v), { ok: false, message: 'A velocity is a whole number from 0 to 127.' }, `velocity ${v}`);
  assert.deepEqual(BAR.channels.kick, row(0, 8), 'the input is never changed');
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:62 logic#1 "&&" -> "||", logic#2, number+1 "127" -> "128" (cellOf: what a transform copies of a cell)
test('a transform copies a cell the way the widget reads it: true stays, a whole velocity 1 to 127 stays, every other thing (0, 128, a negative, a fraction) is a rest', () => {
  const odd = [0, 2.5, 128, -3, 200, 1.5, 127, 1, 60, true, false, 0.5, 100, 99, 1000, 5];
  const norm = (v: unknown): boolean | number => (v === true ? true : typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 127 ? v : false);
  const d = { ...BAR, channels: { kick: odd } } as unknown as RhythmData;
  assert.deepEqual(applied(d, 'Mirror every channel.').channels.kick, [...odd].reverse().map(norm));
  assert.deepEqual(applied(d, 'Shift every channel one step to the left.').channels.kick, [...odd.slice(1), odd[0]].map(norm));
  assert.deepEqual(applied(d, 'Rotate the kick channel one step to the right.').channels.kick, [odd[15], ...odd.slice(0, 15)].map(norm));
});

// 2026-11-19-0993 mutation survivor: bar-grammar-core.ts:311 empty-string (the " in groups of G" of the refusal of a grid); :324 empty-string 'rotate' (a Rotate of a channel the bar has not)
test('refusals of a grid and of a Rotate/Move/Remove/Add are in plain words, with the right names in them', () => {
  const grids = 'It has 16 steps in 4/4, 8 steps in 4/4 (groups of 2 or 4), 12 in 3/4, 12 in 12/8, 6 in 6/8 and 20 in 5/4.';
  assert.equal(refusal(BAR, 'Use 12 steps in 3/4 in groups of 3.'), `The Beat Box has no grid of 12 steps in 3/4 in groups of 3. ${grids}`);
  assert.equal(refusal(BAR, 'Use 10 steps in 4/4.'), `The Beat Box has no grid of 10 steps in 4/4. ${grids}`, 'the default group is not said');
  assert.equal(refusal(BAR, 'Use 16 steps in 4/4 in groups of 2.'), `The Beat Box has no grid of 16 steps in 4/4 in groups of 2. ${grids}`);
  const none = 'There is no hihat channel in this bar; add it first: Add the channel hihat.';
  assert.equal(refusal(BAR, 'Rotate the hihat channel one step to the left.'), none);
  assert.equal(refusal(BAR, 'Move the hihat channel one place later.'), none);
  assert.equal(refusal(BAR, 'Hit hihat on step 1.'), none);
  assert.equal(refusal(BAR, 'Remove the channel hihat.'), 'There is no hihat channel in this bar.');
  assert.equal(refusal(BAR, 'Add the channel kick.'), 'This bar already has a kick channel.');
  assert.equal(refusal({ ...BAR, channels: { kick: row(0) } }, 'Remove the channel kick.'), 'kick is the last channel; a bar keeps at least one.');
  assert.equal(refusal(BAR, 'Move the kick channel one place earlier.'), 'kick is already the first channel.');
  assert.equal(refusal(BAR, 'Move the snare channel one place later.'), 'snare is already the last channel.');
  assert.equal(refusal(BAR, 'Set the tempo to 100.5.'), 'The tempo is a whole number from 40 to 240 beats per minute (the Beat Box plays no other).');
  assert.equal(refusal(BAR, 'Set the tempo to 241.'), 'The Beat Box plays 40 to 240 beats per minute, not 241.');
  assert.equal(refusal(BAR, 'Set the swing to 2.5 percent.'), 'The swing is a whole number from 0 to 100 percent (the Beat Box has no other).');
  assert.equal(refusal(BAR, 'Set the swing to 101 percent.'), 'The swing is from 0 to 100 percent, not 101.');
});

// 2026-11-19-0993 (boundary table, not a survivor: the ends the tempo and swing refusals are held to, said once)
test('tempo 40 / 41 / 239 / 240 and swing 0 / 100 are taken; 39, 241, 101 are not', () => {
  for (const t of [40, 41, 239, 240]) assert.equal(applied(BAR, `Set the tempo to ${t}.`).tempo_bpm, t);
  for (const t of [0, 39, 241, 1000]) assert.equal(applyBarLine(BAR, { kind: 'tempo', bpm: t }).ok, false, `tempo ${t}`);
  for (const p of [0, 1, 99, 100]) assert.equal(applied(BAR, `Set the swing to ${p} percent.`).swing_pct, p);
  for (const p of [-1, 101]) assert.equal(applyBarLine(BAR, { kind: 'swing', pct: p }).ok, false, `swing ${p}`);
});
