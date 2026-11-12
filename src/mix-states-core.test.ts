// 2026-11-12-1201 - how many different results a mix of two bars can give (mix-states-core.ts). The driver's question: in phrase_002 (a VOTE mix of bar_007 and bar_001) the Weight slider only ever gives 100 % bar_007
// or 100 % bar_001. bar_001's 4 hits are a SUBSET of bar_007's 12 (8 hits only in bar_007, none only in bar_001), and a vote can only give bar a, bar b, their union and their intersection; with a subset pair the
// union IS a and the intersection IS b, so there are 2 results at every weight and threshold (3 with ghost notes on). A PATH mix (one hit at a time) gives d + 1 = 9.
//   * REAL ENGINE (skipped, visibly, without the music wheels): the engine's own `mix_rhythm` over the whole 21 x 21 grid, ghost off and on, on the REAL bars (byte copies in test/fixtures/score-first/, checked against the
//     playground vault at its pinned commit): the number of distinct bars is 2 and 3, and the pure port (`votePattern`) agrees with the engine on EVERY cell of the grid, not only in the count;
//   * the pure function on those fixtures and on constructed pairs (identical, disjoint, partly overlapping); the hint's words and when it is silent.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine } from './test-support/real-rhythm-engine.ts';
import { pinnedSiblingFile } from './test-support/sibling-pin.ts';
import { MIX_FEW_STATES, MIX_GRID, mixStateCount, mixStatesHint, votePattern } from './mix-states-core.ts';
import { morphEditCount } from './phrase-core.ts';
import { readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const engineTest = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const BARS: Record<string, string> = {
  bar_001: fs.readFileSync(path.join(FIXTURES, 'bar_001.md'), 'utf8'),
  bar_007: fs.readFileSync(path.join(FIXTURES, 'bar_007.md'), 'utf8'),
};
const dataOf = (name: string): RhythmData => { const r = readRhythmNote(BARS[name]); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const A = (): RhythmData => dataOf('bar_007'), B = (): RhythmData => dataOf('bar_001');
/** A one-channel bar from the steps that hit. */
const bar = (hits: number[], channel = 'kick'): RhythmData => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { [channel]: Array.from({ length: 16 }, (_, i) => hits.includes(i)) } } as unknown as RhythmData);

baseTest('the fixtures are the playground vault\'s own bars at the pinned commit (when it is checked out)', async (t) => {
  for (const name of Object.keys(BARS)) {
    const pinned = pinnedSiblingFile('music-playground', `bars/${name}.md`);
    if ('skip' in pinned) { t.skip(pinned.skip); return; }
    assert.equal(pinned.text, BARS[name], name);
  }
});

baseTest('the pair: bar_001\'s 4 hits are a SUBSET of bar_007\'s 12 (8 only in bar_007, none only in bar_001), so a path between them has 8 changes', () => {
  const hits = (d: RhythmData) => new Set(Object.entries(d.channels).flatMap(([c, row]) => (row as unknown[]).flatMap((v, i) => (v ? [`${c}:${i}`] : []))));
  const a = hits(A()), b = hits(B());
  assert.equal(a.size, 12); assert.equal(b.size, 4);
  assert.equal([...b].filter((h) => !a.has(h)).length, 0, 'nothing only in bar_001');
  assert.equal([...a].filter((h) => !b.has(h)).length, 8, 'eight only in bar_007');
  assert.equal(morphEditCount(A(), B()), 8);
});

engineTest('REAL ENGINE: over weights 0..1 and thresholds 0..1 in steps of 0.05 the engine\'s own mix of bar_007 and bar_001 gives 2 distinct bars (3 with ghost notes on) and the pure port agrees with it on every cell', async () => {
  const py = await engine();
  const a = A(), b = B();
  py.globals.set('_a', JSON.stringify(a)); py.globals.set('_b', JSON.stringify(b));
  const engineRows = (w: number, t: number, g: boolean): string => {
    py.globals.set('_w', w); py.globals.set('_t', t); py.globals.set('_g', g);
    const out = JSON.parse(py.runPython('import json as _j\nfrom forge.music.lib import mix_rhythm as _mix\n_j.dumps(_mix(_j.loads(_a), _j.loads(_b), weight=_w, threshold=_t, ghost=_g))')) as { channels: Record<string, unknown[]> };
    // a plain hit is `true`, a ghost hit is the number 36 (the bars carry no velocities), a rest is false
    return Object.keys(out.channels).map((c) => out.channels[c].map((v) => (v === true ? '1' : typeof v === 'number' ? 'g' : '.')).join('') + '|').join('');
  };
  for (const ghost of [false, true]) {
    const engineSet = new Set<string>(), portSet = new Set<string>();
    let cells = 0;
    for (const w of MIX_GRID) for (const t of MIX_GRID) {
      const e = engineRows(w, t, ghost), p = votePattern(a, b, w, t, ghost);
      assert.equal(p, e, `weight ${w} threshold ${t} ghost ${ghost}: the port and the engine disagree`);
      engineSet.add(e); portSet.add(p); cells++;
    }
    assert.equal(cells, 441);
    assert.equal(engineSet.size, ghost ? 3 : 2, `the engine's distinct bars, ghost ${ghost ? 'on' : 'off'}`);
    assert.equal(portSet.size, engineSet.size);
    assert.equal(mixStateCount(a, b, 'vote', ghost), engineSet.size);
  }
});

baseTest('mixStateCount on the real pair: vote 2 (ghost off), 3 (ghost on); path 9 (d + 1 = 8 + 1)', () => {
  assert.equal(mixStateCount(A(), B(), 'vote'), 2);
  assert.equal(mixStateCount(A(), B(), 'vote', true), 3);
  assert.equal(mixStateCount(A(), B(), 'path'), 9);
  assert.equal(mixStateCount(B(), A(), 'vote'), 2, 'the other way round');
  assert.equal(mixStateCount(B(), A(), 'path'), 9);
});

baseTest('mixStateCount on constructed pairs: identical bars, disjoint bars, bars that overlap in part (4 results by vote: a, b, union, intersection)', () => {
  assert.equal(mixStateCount(bar([0, 8]), bar([0, 8]), 'vote'), 1);
  assert.equal(mixStateCount(bar([0, 8]), bar([0, 8]), 'path'), 1);
  assert.equal(mixStateCount(bar([0, 4]), bar([1, 5]), 'vote'), 4, 'disjoint: a, b, the union, and the empty intersection');
  assert.equal(mixStateCount(bar([0, 4]), bar([1, 5]), 'path'), 5);
  assert.equal(mixStateCount(bar([0, 4]), bar([0, 8]), 'vote'), 4, 'partly overlapping: a, b, union {0,4,8}, intersection {0}');
  assert.equal(mixStateCount(bar([0, 4]), bar([0, 8]), 'path'), 3);
  assert.equal(mixStateCount(bar([0, 4]), bar([0, 8], 'snare'), 'vote') >= MIX_FEW_STATES, true, 'channels the other bar lacks count as rests');
});

baseTest('the hint: its words, silent from 3 results up, and silent when the path would not give more', () => {
  assert.equal(mixStatesHint(2, 9), 'These two bars can only give 2 different results by vote. Try Path: 9 steps.');
  assert.equal(mixStatesHint(1, 5), 'These two bars can only give 1 different result by vote. Try Path: 5 steps.');
  assert.equal(mixStatesHint(2, 3), 'These two bars can only give 2 different results by vote. Try Path: 3 steps.');
  assert.equal(mixStatesHint(MIX_FEW_STATES, 9), null, 'three or more: no hint');
  assert.equal(mixStatesHint(4, 3), null);
  assert.equal(mixStatesHint(1, 1), null, 'identical bars: the path gives nothing more');
  assert.equal(mixStatesHint(2, 2), null);
});

baseTest('CONTROL: the checks can fail - a vote rule that ignores the threshold gives a different count (on a pair where the threshold matters), and so does a count that forgets the ghost notes', () => {
  const x = bar([0, 4]), y = bar([0, 8]);
  const noThreshold = new Set<string>();
  for (const w of MIX_GRID) noThreshold.add(votePattern(x, y, w, 0.5, false));
  assert.equal(mixStateCount(x, y, 'vote'), 4);
  assert.notEqual(noThreshold.size, 4, 'fixing the threshold at 0.5 loses the intersection');
  assert.notEqual(mixStateCount(A(), B(), 'vote', true), mixStateCount(A(), B(), 'vote', false), 'ghost notes add a result');
});
