// 2026-11-05-1185 (b) - the interval-pattern row of the Scale Explorer: the steps between consecutive degrees as letters AND semitones (major W W H W W W H over 2 2 1 2 2 2 1), derived from the semitone table by ONE pure function
// (`intervalPattern`), a row of chips under the piano in scale mode that follows the scale TYPE (never the tonic), `show: ..., intervals` in the block, on by default in scale mode, off by `show:` without it, never in chord or free mode.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { SCALE_TYPES, intervalPattern, parseScaleExplorerSource, scaleNotes, type ScaleType } from './scale-explorer-core.ts';
import { mountScaleBlock } from './scale-explorer-dom.ts';

const TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const letters = (t: ScaleType): string => intervalPattern(t).map((s) => s.letter).join(' ');
const semis = (t: ScaleType): string => intervalPattern(t).map((s) => s.semitones).join(' ');

// ---- the pure function -------------------------------------------------------------------------------------------------------------------------------------

test('the pattern of every scale type, as letters over semitones (harmonic minor writes its three-semitone step W+H)', () => {
  const want: Record<ScaleType, [string, string]> = {
    major: ['W W H W W W H', '2 2 1 2 2 2 1'],
    'natural minor': ['W H W W H W W', '2 1 2 2 1 2 2'],
    dorian: ['W H W W W H W', '2 1 2 2 2 1 2'],
    phrygian: ['H W W W H W W', '1 2 2 2 1 2 2'],
    lydian: ['W W W H W W H', '2 2 2 1 2 2 1'],
    mixolydian: ['W W H W W H W', '2 2 1 2 2 1 2'],
    locrian: ['H W W H W W W', '1 2 2 1 2 2 2'],
    'harmonic minor': ['W H W W H W+H H', '2 1 2 2 1 3 1'],
    'melodic minor': ['W H W W W W H', '2 1 2 2 2 2 1'],
  };
  assert.deepEqual([...SCALE_TYPES].sort(), Object.keys(want).sort(), 'all nine types, none missing');
  for (const t of SCALE_TYPES) assert.deepEqual([letters(t), semis(t)], want[t], t);
});

test('derived from the semitone table, not retyped: for every type and EVERY tonic the pattern is the steps between the scale\'s own notes, and the seven steps make an octave', () => {
  for (const t of SCALE_TYPES) {
    const steps = intervalPattern(t);
    assert.equal(steps.length, 7, t);
    assert.equal(steps.reduce((n, s) => n + s.semitones, 0), 12, `${t} makes an octave`);
    for (const tonic of TONICS) {
      const notes = scaleNotes(tonic, t, 4).map((n) => n.midi);
      assert.equal(notes.length, 8, `${tonic} ${t}`);
      assert.deepEqual(notes.slice(1).map((m, i) => m - notes[i]), steps.map((s) => s.semitones), `${tonic} ${t}`);
    }
  }
});

test('the pattern belongs to the TYPE, not the tonic: C major and F# major have the same pattern (while their notes differ)', () => {
  const steps = (tonic: string) => { const n = scaleNotes(tonic, 'major', 4).map((x) => x.midi); return n.slice(1).map((m, i) => m - n[i]); };
  assert.deepEqual(steps('C'), steps('F#'));
  assert.deepEqual(intervalPattern('major').map((s) => s.semitones), steps('C'));
  assert.notDeepEqual(scaleNotes('C', 'major', 4).map((n) => n.name), scaleNotes('F#', 'major', 4).map((n) => n.name));
  assert.notEqual(letters('dorian'), letters('major'), 'CONTROL: a different TYPE is a different pattern');
});

test('a step\'s letter follows its semitones: 1 is H, 2 is W, 3 is W+H', () => {
  for (const t of SCALE_TYPES) for (const s of intervalPattern(t)) assert.equal(s.letter, s.semitones === 1 ? 'H' : s.semitones === 2 ? 'W' : 'W+H', `${t}: ${s.semitones}`);
});

// ---- the block option --------------------------------------------------------------------------------------------------------------------------------------

const opts = (source: string) => { const r = parseScaleExplorerSource(source); assert.ok(r.ok, r.ok ? '' : r.message); return (r as { ok: true; options: ReturnType<typeof parseScaleExplorerSource> extends infer X ? any : never }).options; };

test('scale mode: `intervals` is ON by default; a `show:` line turns it off unless it lists intervals', () => {
  assert.equal(opts('').show.intervals, true);
  assert.equal(opts('tonic: D\nscale: dorian').show.intervals, true);
  assert.equal(opts('show: piano, staff, numbers').show.intervals, false, 'show: without intervals turns it off');
  assert.equal(opts('show: piano, numbers, staff, intervals').show.intervals, true);
  assert.equal(opts('show: intervals').show.intervals, true, 'it needs no piano: it is a row of its own');
  assert.equal(opts('SHOW: Piano, Intervals').show.intervals, true, 'case-insensitive, like every other part');
  assert.equal(opts('show: staff').show.intervals, false);
});

test('chord and free mode never show it: off by default, and listing it there is refused with one sentence', () => {
  assert.equal(opts('mode: chord').show.intervals, false);
  assert.equal(opts('mode: free').show.intervals, false);
  assert.equal(opts('mode: chord\nshow: piano, staff').show.intervals, false);
  for (const source of ['mode: chord\nshow: piano, intervals', 'mode: free\nshow: piano, intervals']) {
    const r = parseScaleExplorerSource(source);
    assert.ok(!r.ok && /"intervals" is the interval pattern of a scale, so the block needs "mode: scale"/.test(r.message), source);
  }
});

test('the parser still refuses what it refused: an unknown part, an empty list, numbers without piano', () => {
  for (const [source, re] of [['show: banjo', /show lists piano, staff, numbers, diatonic, guitar and intervals \(got "banjo"/], ['show:', /show must list what to show: piano, staff, numbers, diatonic, guitar, intervals/], ['show: numbers', /"numbers" labels the piano keys/]] as const) {
    const r = parseScaleExplorerSource(source);
    assert.ok(!r.ok && re.test(r.message), `${source}: ${r.ok ? 'ok' : r.message}`);
  }
});

// ---- the DOM -------------------------------------------------------------------------------------------------------------------------------------------------

function mount(source: string) {
  const win: any = new Window({ url: 'http://localhost/' });
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  mountScaleBlock(el, source, { sound: { play() {}, stop() {} }, renderStaff: async () => {} });
  const row = () => el.querySelector('.forge-scale-intervals') as any;
  const read = () => ({
    letters: [...el.querySelectorAll('.forge-scale-intervals .forge-scale-step-letter')].map((e: any) => e.textContent).join(' '),
    semitones: [...el.querySelectorAll('.forge-scale-intervals .forge-scale-step-semis')].map((e: any) => e.textContent).join(' '),
  });
  const pick = (selector: string, value: string) => { const s = el.querySelector(selector) as any; s.value = value; s.dispatchEvent(new win.Event('change')); };
  return { win, el, row, read, pick };
}

test('a default scale block has the row, directly under the piano and before the staff, with the pattern of its type', () => {
  const m = mount('');
  assert.ok(m.row(), 'the row is there');
  assert.deepEqual(m.read(), { letters: 'W W H W W W H', semitones: '2 2 1 2 2 2 1' });
  const order = [...m.el.querySelector('.forge-scale').children].map((c: any) => String(c.className).split(' ')[0]);
  assert.ok(order.indexOf('forge-scale-intervals') === order.indexOf('forge-scale-piano') + 1, `right under the piano: ${order.join(' | ')}`);
  assert.ok(order.indexOf('forge-scale-intervals') < order.indexOf('forge-scale-staff'), 'before the staff');
  assert.equal(m.row().getAttribute('role'), 'group');
  assert.equal(m.el.querySelectorAll('.forge-scale-step').length, 7);
});

test('the DOM text for all nine types (a block written with each, and the dropdown walked through them all)', () => {
  const m = mount('');
  for (const t of SCALE_TYPES) {
    assert.deepEqual(mount(`scale: ${t}`).read(), { letters: letters(t), semitones: semis(t) }, `a block written with ${t}`);
    m.pick('.forge-scale-type', t);
    assert.deepEqual(m.read(), { letters: letters(t), semitones: semis(t) }, `the dropdown at ${t}`);
  }
});

test('it follows a change of TYPE (dorian differs from major) and does NOT change with the tonic', () => {
  const m = mount('');
  const major = m.read();
  m.pick('.forge-scale-tonic', 'F#');
  assert.deepEqual(m.read(), major, 'F# major has the same pattern as C major');
  m.pick('.forge-scale-type', 'dorian');
  assert.deepEqual(m.read(), { letters: 'W H W W W H W', semitones: '2 1 2 2 2 1 2' });
  assert.notDeepEqual(m.read(), major, 'CONTROL: the type changed the row');
  m.pick('.forge-scale-tonic', 'A');
  assert.deepEqual(m.read(), { letters: 'W H W W W H W', semitones: '2 1 2 2 2 1 2' }, 'a tonic change again leaves it');
});

test('the off switch: `show:` without intervals has no row; `show:` with it has; chord and free mode never have one', () => {
  assert.equal(mount('show: piano, staff, numbers').row(), null);
  assert.equal(mount('show: piano, staff, numbers, intervals').row() !== null, true);
  assert.equal(mount('mode: chord').row(), null);
  assert.equal(mount('mode: chord\nshow: piano, staff').row(), null);
  assert.equal(mount('mode: free\nshow: piano, staff, diatonic').row(), null);
  assert.equal(mount('mode: free').row(), null);
});

test('a fixed picture (controls: no) has the row too; a bad block shows the error and no row', () => {
  const fixed = mount('tonic: A\nscale: harmonic minor\ncontrols: no');
  assert.deepEqual(fixed.read(), { letters: 'W H W W H W+H H', semitones: '2 1 2 2 1 3 1' });
  assert.equal(mount('scale: blues').row(), null);
});
