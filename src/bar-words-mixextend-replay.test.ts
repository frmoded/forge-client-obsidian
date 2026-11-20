// 2026-11-19-0999b (MIX AND EXTEND AS STEPS INSIDE A PHRASE) - the REPLAY half, written RED first: the list of a phrase (sentence-list-core.ts) with a Mix step or an Extend step, over the GOLDEN fixtures (the 14 playground phrase notes of test-support/phrase-list-fixtures.ts and the 12 extra
// paragraphs): each line is accepted, replays (never throws), is written as its canonical sentence, and the note the list writes draws, through the real producePhraseNote (a stub ENGINE that does what mix_rhythm / extend_rhythm do in shape), exactly the bars an independent model of the step says:
//   * `Mix bars A and B.` makes ONE bar (the Mix head's own call: kind mix, the two bars as data {a, b}) and INSERTS it at the place; bars A and B stay; the phrase is ONE bar longer;
//   * `Extend bar K to N bars.` makes N bars (the Extend head's own call: kind extend, the one bar as data) and REPLACES bar K by them (the phrase is N - 1 bars longer); with a place word the original STAYS and the N bars are inserted (N bars longer).
// Replay == note == Score. The order refusal after a Thin out, the head refusal, the refusals at draw time (a bar past the end, a place past the end, two bars on different grids, a bar that is not on the 16-step grid) are words. A random mix path stores its seed in the sentence at the preview.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, validatePhrase } from './phrase-core.ts';
import { planNewBar } from './score-first-core.ts';
import { canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { barCount } from './structure-strip-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { EXTRA_PARAGRAPHS, PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const K = 'phrase' as const;
const ctx: L.ReplayCtx = { vault: V };
const BAR = JSON.parse(/```json\n([\s\S]*?)\n```/.exec((planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content)![1]) as Record<string, unknown>;
type Bar = Record<string, unknown> & { tempo_bpm: number };
type Call = { kind: string; data: any; params: any; title: string };

/** The stub engine: the shapes of extend_rhythm / mix_rhythm / morph_rhythm / the take. Bars are told apart by their tempo: the head's extend 100 + i, a mixed bar 300 (and, like the real engine, it comes back as `mixed_bar` only), an Extend STEP's bars 700 + i (its source label is `bar_a`), a morph's middle 500 + i. */
function engine(calls: Call[] = []) {
  return async (data: any, params: any, title = 't'): Promise<unknown> => {
    calls.push({ kind: params.kind, data, params, title });
    if (params.kind === 'mix') {
      if (data.a.steps !== data.b.steps) throw new Error(`Traceback ...\nValueError: mix_rhythm: a and b must agree on steps, but a has ${data.a.steps} and b has ${data.b.steps}`);
      return { type: 'musicxml', content: '<score-partwise/>', mixed_bar: { ...data.a, tempo_bpm: 300 } };
    }
    let bars: Bar[];
    if (params.kind === 'extend') {
      if (data.steps !== 16) throw new Error(`Traceback ...\nValueError: extend_rhythm: every style needs a 16-step grid (steps == 16, group_size == 4, i.e. 4/4 in sixteenths); got steps=${data.steps}, group_size=${data.group_size}`);
      bars = Array.from({ length: params.bars }, (_, i) => ({ ...data, tempo_bpm: (params.source === 'bar_a' ? 700 : 100) + i }));
    } else if (params.kind === 'morph') bars = Array.from({ length: params.bars }, (_, i) => (i === 0 ? { ...data.a } : i === params.bars - 1 ? { ...data.b } : { ...data.a, tempo_bpm: 500 + i }));
    else bars = [...data.bars];
    for (const [n, forked] of Object.entries(params.override_bars ?? {})) bars[Number(n) - 1] = forked as Bar;
    return { type: 'musicxml', content: '<score-partwise/>', bars_data: bars };
  };
}
function deps(calls: Call[] = [], bar: Record<string, unknown> = {}, compute?: (data: any, params: any, title: string) => Promise<unknown>) {
  const files = (p: string): string | undefined => {
    const bm = /^bars\/(bar_\d+)\.md$/.exec(p); if (bm) return `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({ ...BAR, ...bar, tempo_bpm: 100 })}\n\`\`\`\n`;
    const pm = /^phrases\/(phrase_\d+)\.md$/.exec(p); if (pm) return PLAYGROUND_PHRASES[pm[1]];
    return undefined;
  };
  return { readNote: async (p: string) => { const t = files(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: (compute ?? engine(calls)) as never };
}
const drawn = async (note: string, calls: Call[] = [], bar: Record<string, unknown> = {}, compute?: (data: any, params: any, title: string) => Promise<unknown>): Promise<Bar[] | string> => {
  const out = await producePhraseNote(deps(calls, bar, compute) as never, note, 'phrase_020');
  if (out.kind !== 'score') return out.message;
  return barsOfPayload(out.payload) as Bar[];
};
const BASE = noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
const noteFor = (list: string[]): string => {
  const rp = L.replayGrammar(list, K, ctx);
  assert.equal(rp.stop, null, `${list.join(' | ')}: ${rp.stop?.message}`);
  const w = writeListNote(BASE, 'phrase_020', K, { params: rp.params, list: rp.list });
  assert.ok(w.ok, w.ok ? '' : w.message);
  return (w as { ok: true; text: string }).text;
};
const sentences = (paragraph: string): string[] => L.sentencesOfText(paragraph, K);
const EXT8 = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const tempos = (bars: Bar[] | string): number[] => { assert.ok(typeof bars !== 'string', String(bars)); return (bars as Bar[]).map((b) => b.tempo_bpm); };

/** An independent model of each step on the bars. */
const model = {
  mix: (b: Bar[], a: number, after: number): Bar[] => [...b.slice(0, after), { ...b[a - 1], tempo_bpm: 300 }, ...b.slice(after)],
  extendReplace: (b: Bar[], k: number, n: number): Bar[] => [...b.slice(0, k - 1), ...Array.from({ length: n }, (_, i) => ({ ...b[k - 1], tempo_bpm: 700 + i })), ...b.slice(k)],
  extendInsert: (b: Bar[], k: number, n: number, after: number): Bar[] => [...b.slice(0, after), ...Array.from({ length: n }, (_, i) => ({ ...b[k - 1], tempo_bpm: 700 + i })), ...b.slice(after)],
};

const FIXTURES: Array<[string, string]> = [...Object.entries(PLAYGROUND_PHRASES).map(([n, note]) => [n, extractDescription(note).trim()] as [string, string]), ...Object.entries(EXTRA_PARAGRAPHS)];
const drawable = (paragraph: string): boolean => !/\[\[(?:arr_001|song_1)\]\]/.test(paragraph);

test('GOLDEN: over the 14 playground phrases and the 12 extra paragraphs, a Mix step and an Extend step (replace and insert) are accepted after the paragraph, replay in full, are written as their canonical sentence, and the note draws what the model says', async () => {
  assert.equal(FIXTURES.length, 26);
  let checked = 0;
  for (const [name, paragraph] of FIXTURES) {
    const base = sentences(paragraph);
    const head = await drawn(noteFor(base));
    if (typeof head === 'string' || !drawable(paragraph)) { if (drawable(paragraph)) assert.fail(`${name}: the head draws (${head})`); continue; }
    if (/Thin out|Double up/.test(paragraph)) {            // a structure step after a density step is refused (0980), for every new word: counted, not skipped
      for (const t of ['Mix bars 1 and 2.', 'Extend bar 1 to 3 bars.', 'Extend bar 1 to 3 bars and put them at the end.']) { const r = await L.planAppend(base, K, [t], ctx); assert.ok(!r.ok && r.reason === 'order', `${name}: ${t}`); checked++; }
      continue;
    }
    const forks = /is replaced by/.test(paragraph);       // forks number the FINAL bars, so the head's bars are not the model's input: only the length is compared
    const n = head.length;
    const steps: Array<{ typed: string; canonical: string; want: Bar[] }> = [
      { typed: 'Extend bar 1 to 3 bars.', canonical: 'Extend bar 1 to 3 bars, repeating with fills.', want: model.extendReplace(head, 1, 3) },
      { typed: 'Extend bar 1 to 1 bar.', canonical: 'Extend bar 1 to 1 bar, repeating with fills.', want: model.extendReplace(head, 1, 1) },
      { typed: `Extend bar ${n} to 2 bars and put them at the end.`, canonical: `Extend bar ${n} to 2 bars, repeating with fills, and put them at the end.`, want: model.extendInsert(head, n, 2, n) },
      { typed: 'Extend bar 1 to 4 bars, building up, and put them at the start.', canonical: 'Extend bar 1 to 4 bars, building up, and put them at the start.', want: model.extendInsert(head, 1, 4, 0) },
      ...(n >= 2 ? [
        { typed: 'Mix bars 1 and 2.', canonical: 'Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it between bars 1 and 2.', want: model.mix(head, 1, 1) },
        { typed: 'Mix bars 2 and 1, 70 percent bar 2, as a path, in musical order.', canonical: 'Mix bars 2 and 1, 70 percent bar 2, as a path, in musical order, and put it between bars 1 and 2.', want: model.mix(head, 2, 1) },
      ] : []),
      ...(n >= 3 ? [{ typed: `Mix bars 1 and ${n} and put it at the start.`, canonical: `Mix bars 1 and ${n}, 50 percent bar 1, as a vote, and put it at the start.`, want: model.mix(head, 1, 0) }] : []),
    ];
    for (const s of steps) {
      const plan = await L.planAppend(base, K, [s.typed], ctx);
      assert.ok(plan.ok, `${name}: "${s.typed}" ${plan.ok ? '' : plan.message}`);
      if (!plan.ok) continue;
      assert.equal(plan.replay.stop, null, `${name}: ${s.typed}`); assert.equal(plan.replay.applied, base.length + 1, `${name}: ${s.typed}`);
      assert.deepEqual(plan.added, [s.canonical], `${name}: the canonical line`);
      assert.equal(plan.list.length, base.length + 1, `${name}: one line added, none replaced`); assert.equal(plan.list[plan.list.length - 1], s.canonical, name);
      const again = L.replayGrammar(plan.list, K, ctx); assert.deepEqual(again.list, plan.list, `${name}: the canonical list replays to itself`);
      const bars = await drawn(noteFor(plan.list));
      assert.ok(typeof bars !== 'string', `${name}: ${s.typed} -> ${bars}`);
      if (forks) assert.equal((bars as Bar[]).length, s.want.length, `${name}: "${s.typed}" draws as many bars as the model says`); else assert.deepEqual(bars, s.want, `${name}: "${s.typed}" draws what the model says`);
      const json = validatePhrase(JSON.parse(plan.replay.json)); assert.ok(json.ok);
      assert.deepEqual(canonical((json as { ok: true; value: GrammarParams }).value), canonical(plan.replay.params!), `${name}: the json cache is the replay`);
      checked++;
    }
  }
  assert.ok(checked >= 120, `checked ${checked} step replays`);
});

test('MIX, the count: ONE bar is inserted (the Mix head\'s one bar), bars 2 and 3 stay, the phrase is ONE bar longer; the engine is asked once, with the Mix head\'s own call (kind mix, the two bars as data {a, b})', async () => {
  const calls: Call[] = [];
  const bars = await drawn(noteFor([EXT8, 'Mix bars 2 and 3.']), calls) as Bar[];
  assert.equal(bars.length, 9, '8 + 1');
  assert.deepEqual(tempos(bars), [100, 101, 300, 102, 103, 104, 105, 106, 107], 'the mix sits between bars 2 and 3; both stay');
  const mixes = calls.filter((c) => c.kind === 'mix'); assert.equal(mixes.length, 1);
  assert.deepEqual(mixes[0].params, { kind: 'mix', a: 'bar_a', b: 'bar_b', weight: 0.5, threshold: 0.5, ghost: false });
  assert.deepEqual(Object.keys(mixes[0].data), ['a', 'b']); assert.equal(mixes[0].data.a.tempo_bpm, 101); assert.equal(mixes[0].data.b.tempo_bpm, 102);
  assert.equal(mixes[0].title, 'phrase_020');
  assert.deepEqual(calls.map((c) => c.kind), ['extend', 'mix', 'transform'], 'the head, the new bar, then the final draw');
});
test('MIX asks the engine exactly what the Mix head asks: the share (a\'s weight), the threshold, the ghost notes, a path with its order and seed (only a seeded order has a seed); a is the bar said first', async () => {
  const cases: Array<[string, Record<string, unknown>, [number, number]]> = [
    ['Mix bars 2 and 3, 70 percent bar 2.', { weight: 0.7, threshold: 0.5, ghost: false }, [101, 102]],
    ['Mix bars 3 and 2, 70 percent bar 2.', { weight: 0.3, threshold: 0.5, ghost: false }, [102, 101]],
    ['Mix bars 2 and 5, 25 percent the first, threshold 40 percent, with ghost notes.', { weight: 0.25, threshold: 0.4, ghost: true }, [101, 104]],
    ['Mix bars 2 and 3, as a path, in seeded order, seed 17.', { weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded', seed: 17 }, [101, 102]],
    ['Mix bars 2 and 3, as a path, in musical order.', { weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 }, [101, 102]],
    ['Mix bars 2 and 3, 0 percent bar 2, as a path, in by-channel order.', { weight: 0, threshold: 0.5, ghost: false, mode: 'path', order: 'by_channel', seed: 0 }, [101, 102]],
  ];
  for (const [words, want, [ta, tb]] of cases) {
    const calls: Call[] = []; const bars = await drawn(noteFor([EXT8, words]), calls);
    assert.ok(typeof bars !== 'string', `${words}: ${bars}`);
    const mixes = calls.filter((c) => c.kind === 'mix'); assert.equal(mixes.length, 1, words);
    assert.deepEqual(mixes[0].params, { kind: 'mix', a: 'bar_a', b: 'bar_b', ...want }, words);
    assert.equal(mixes[0].data.a.tempo_bpm, ta, `${words}: a`); assert.equal(mixes[0].data.b.tempo_bpm, tb, `${words}: b`);
  }
});
test('MIX places: after bar 6, before bar 2, at the start, at the end, between; always ONE new bar and the bars around it untouched', async () => {
  const at = async (words: string): Promise<number[]> => { const bars = await drawn(noteFor([EXT8, `Mix bars 2 and 3${words}.`])) as Bar[]; assert.equal(bars.length, 9, words); return bars.map((b, i) => (b.tempo_bpm === 300 ? i + 1 : 0)).filter(Boolean); };
  assert.deepEqual(await at(''), [3]); assert.deepEqual(await at(' and put it before bar 2'), [2]); assert.deepEqual(await at(' and put it at the start'), [1]); assert.deepEqual(await at(' and put it at the end'), [9]); assert.deepEqual(await at(' and put it after bar 6'), [7]); assert.deepEqual(await at(' and put it after bar 8'), [9]);
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Mix bars 1 and 8.'])) as Bar[]), [100, 101, 102, 103, 104, 105, 106, 107, 300], 'far apart: after the later bar');
});
test('EXTEND, the count: with NO place the bar is REPLACED by the N bars (the phrase is N - 1 longer), with a place word it STAYS and the N bars are inserted (N longer); the engine is asked once with the Extend head\'s own call (kind extend, the one bar as data)', async () => {
  const calls: Call[] = [];
  const replaced = await drawn(noteFor([EXT8, 'Extend bar 2 to 4 bars.']), calls) as Bar[];
  assert.equal(replaced.length, 11, '8 - 1 + 4');
  assert.deepEqual(tempos(replaced), [100, 700, 701, 702, 703, 102, 103, 104, 105, 106, 107], 'bar 2 (101) is gone: its 4 bars (700 to 703) are in its place');
  const ext = calls.filter((c) => c.kind === 'extend' && c.params.source === 'bar_a'); assert.equal(ext.length, 1);
  assert.deepEqual(ext[0].params, { kind: 'extend', source: 'bar_a', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
  assert.equal(ext[0].data.tempo_bpm, 101, 'the data is the phrase\'s own bar 2, not a note'); assert.equal(ext[0].title, 'phrase_020');
  assert.deepEqual(calls.map((c) => c.kind), ['extend', 'extend', 'transform'], 'the head, the new bars, the final draw');
  const inserted = await drawn(noteFor([EXT8, 'Extend bar 2 to 4 bars and put them at the end.'])) as Bar[];
  assert.equal(inserted.length, 12, '8 + 4'); assert.deepEqual(tempos(inserted), [100, 101, 102, 103, 104, 105, 106, 107, 700, 701, 702, 703], 'bar 2 stays, the 4 bars are at the end');
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Extend bar 2 to 4 bars and put them after bar 2.'])) as Bar[]), [100, 101, 700, 701, 702, 703, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Extend bar 2 to 4 bars and put them before bar 2.'])) as Bar[]), [100, 700, 701, 702, 703, 101, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Extend bar 8 to 2 bars.'])) as Bar[]), [100, 101, 102, 103, 104, 105, 106, 700, 701], 'the last bar replaced');
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Extend bar 1 to 1 bar.'])) as Bar[]), [700, 101, 102, 103, 104, 105, 106, 107], 'N = 1 replaces the bar by its one-bar extend');
});
test('EXTEND asks the engine exactly what the Extend head asks: the style, the tempo change, N; the label bar_a', async () => {
  for (const [words, want] of [
    ['Extend bar 2 to 4 bars, building up.', { bars: 4, style: 'building', tempo_change_pct: 0 }], ['Extend bar 2 to 6 bars, adding ghost notes, 20 percent slower.', { bars: 6, style: 'ghost_notes', tempo_change_pct: -20 }],
    ['Extend bar 2 to 64 bars, 15 percent faster.', { bars: 64, style: 'repeat_with_fills', tempo_change_pct: 15 }], ['Extend bar 3 to 1 bar and put it at the end.', { bars: 1, style: 'repeat_with_fills', tempo_change_pct: 0 }],
  ] as Array<[string, Record<string, unknown>]>) {
    const calls: Call[] = []; await drawn(noteFor([EXT8, words]), calls);
    assert.deepEqual(calls.filter((c) => c.params.source === 'bar_a').map((c) => c.params), [{ kind: 'extend', source: 'bar_a', ...want }], words);
  }
});
test('Extend of a bar the phrase made by a step (a copy, a morph\'s new bar, a mix) works: the data is that bar as it is NOW', async () => {
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Mix bars 2 and 3.', 'Extend bar 3 to 2 bars.'])) as Bar[]), [100, 101, 700, 701, 102, 103, 104, 105, 106, 107], 'bar 3 is the mixed bar (300): replaced by its 2 bars');
  const calls: Call[] = []; await drawn(noteFor([EXT8, 'Mix bars 2 and 3.', 'Extend bar 3 to 2 bars.']), calls);
  assert.equal(calls.find((c) => c.params.source === 'bar_a')!.data.tempo_bpm, 300, 'the data of the extend is the mixed bar');
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Copy bar 2.', 'Extend bar 3 to 2 bars.'])) as Bar[]), [100, 101, 700, 701, 102, 103, 104, 105, 106, 107]);
  assert.deepEqual(tempos(await drawn(noteFor([EXT8, 'Morph bars 2 and 3 across 2 bars.', 'Extend bar 3 to 2 bars.'])) as Bar[]), [100, 101, 700, 701, 502, 102, 103, 104, 105, 106, 107], 'the first new bar of the morph (501) is extended');
});
test('steps run in the order of the lines on the bars the earlier steps left: Delete bar 1, then Mix bars 1 and 2 (the old bars 2 and 3), then Extend bar 1, then Copy bar 1', async () => {
  const list = [EXT8, 'Delete bar 1.', 'Mix bars 1 and 2.', 'Extend bar 1 to 2 bars and put them at the end.', 'Duplicate bar 1.'];
  assert.deepEqual(tempos(await drawn(noteFor(list))), [101, 101, 300, 102, 103, 104, 105, 106, 107, 700, 701], 'old bar 2 (101), its copy, the mix, old bar 3 ... old bar 8, the 2 bars of old bar 2 at the end');
});
test('a Mix or an Extend step after a Take (a phrase\'s own bars); forks lie over the FINAL bars, as after any step', async () => {
  assert.equal((await drawn(noteFor(['Take [[phrase_001]].', 'Mix bars 1 and 2.'])) as Bar[]).length, 12 + 1);
  assert.equal((await drawn(noteFor(['Take [[phrase_001]].', 'Extend bar 1 to 3 bars.'])) as Bar[]).length, 12 + 2);
  const forked = await drawn(noteFor(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Extend bar 2 to 3 bars.', 'Bar 2 is replaced by [[bar_009]].'])) as Bar[];
  assert.equal(forked.length, 6); assert.equal(forked[1].tempo_bpm, 100, 'the fork note\'s own bar (tempo 100) lies over final bar 2');
});
test('after a Mix HEAD (one bar) the steps work on that one bar: Extend bar 1 grows it, Mix bars 1 and 2 is refused in words', async () => {
  const head = 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.';
  assert.deepEqual(tempos(await drawn(noteFor([head, 'Extend bar 1 to 3 bars.']))), [700, 701, 702], 'a mix is one bar (300 in the head draw; replaced here)');
  assert.deepEqual(tempos(await drawn(noteFor([head, 'Extend bar 1 to 3 bars and put them at the end.']))).length, 4);
  assert.match(await drawn(noteFor([head, 'Mix bars 1 and 2.'])) as string, /bar 2 asked for, but there is 1 bar/);
});

// ---- refusals at draw time are words ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('refusals at draw time: a bar past the end (Mix and Extend), a place past the end, a bar of another grid, two bars on different grids, all in exact words and none reaches the engine when the bar is not there', async () => {
  const head = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
  const P = 'Phrase: the extend has 4 bars; ';
  const calls: Call[] = [];
  assert.equal(await drawn(noteFor([head, 'Mix bars 2 and 9.']), calls), `${P}ops[0]: bar 9 asked for, but there are 4 bars.`);
  assert.equal(await drawn(noteFor([head, 'Mix bars 2 and 3 and put it after bar 9.']), calls), `${P}ops[0]: after bar 9 asked for, but there are 4 bars.`);
  assert.equal(await drawn(noteFor([head, 'Extend bar 9 to 3 bars.']), calls), `${P}ops[0]: bar 9 asked for, but there are 4 bars.`);
  assert.equal(await drawn(noteFor([head, 'Extend bar 2 to 3 bars and put them after bar 9.']), calls), `${P}ops[0]: after bar 9 asked for, but there are 4 bars.`);
  assert.equal(await drawn(noteFor([head, 'Delete bar 1.', 'Delete bar 1.', 'Delete bar 1.', 'Mix bars 1 and 2.']), calls), `${P}ops[3]: bar 2 asked for, but there is 1 bar.`);
  assert.equal(calls.filter((c) => c.kind === 'mix').length, 0, 'the engine was never asked for a mix of a bar the phrase does not have');
  assert.equal(calls.filter((c) => c.params.source === 'bar_a').length, 0, 'nor for an extend of one');
  const grid = await drawn(noteFor([head, 'Mix bars 2 and 3.']), [], {}, async (data: any, params: any) => { if (params.kind === 'mix') throw new Error("Traceback (most recent call last):\n  File \"x.py\", line 1\nValueError: mix_rhythm: a and b must agree on time_signature, but a has '4/4' and b has '3/4'"); return engine()(data, params); });
  assert.equal(grid, `${P}ops[0]: bars 2 and 3 cannot be mixed: mix_rhythm: a and b must agree on time_signature, but a has '4/4' and b has '3/4'`);
  const path = await drawn(noteFor([head, 'Mix bars 2 and 3, as a path.']), [], {}, async (data: any, params: any) => { if (params.kind === 'mix') throw new Error('ValueError: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12'); return engine()(data, params); });
  assert.equal(path, `${P}ops[0]: bars 2 and 3 cannot be mixed: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12`, 'a path mix is refused by the morph\'s own function');
  const twelve = await drawn(noteFor([head, 'Extend bar 2 to 3 bars.']), [], {}, async (data: any, params: any) => { if (params.source === 'bar_a') throw new Error('Traceback ...\nValueError: extend_rhythm: every style needs a 16-step grid (steps == 16, group_size == 4, i.e. 4/4 in sixteenths); got steps=12, group_size=3'); return engine()(data, params); });
  assert.equal(twelve, `${P}ops[0]: bar 2 has 12 steps; extend needs a 16-step bar.`, 'the grid sentence of the head, naming the bar by its number');
  const unknown = await drawn(noteFor([head, 'Extend bar 2 to 3 bars.']), [], {}, async (data: any, params: any) => { if (params.source === 'bar_a') throw new Error("Traceback ...\nValueError: extend_rhythm: unknown channel(s) ['cowbell']; supported: ['bell', 'kick']"); return engine()(data, params); });
  assert.equal(unknown, `${P}ops[0]: bar 2 cannot be extended: extend_rhythm: unknown channel(s) ['cowbell']; supported: ['bell', 'kick']`);
});
test('the engine\'s other answers are said with the counts: a wrong number of bars, no bars, any other engine error stays an engine error (not a "cannot be mixed" sentence)', async () => {
  const head = 'Extend [[bar_005]] to 4 bars, repeating with fills.'; const P = 'Phrase: the extend has 4 bars; ';
  const ext = (f: (data: any, params: any) => unknown) => async (data: any, params: any) => (params.source === 'bar_a' ? f(data, params) : engine()(data, params));
  const mix = (f: (data: any, params: any) => unknown) => async (data: any, params: any) => (params.kind === 'mix' ? f(data, params) : engine()(data, params));
  const note = (w: string) => noteFor([head, w]);
  assert.equal(await drawn(note('Extend bar 2 to 3 bars.'), [], {}, ext(() => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: [{}, {}] }))), `${P}ops[0]: the engine gave 2 bars for the extend of bar 2 (it was asked for 3).`);
  assert.equal(await drawn(note('Extend bar 2 to 3 bars.'), [], {}, ext(() => ({ type: 'musicxml', content: '<score-partwise/>' }))), `${P}ops[0]: the engine gave no bars for the extend of bar 2 (it was asked for 3).`);
  assert.equal(await drawn(note('Mix bars 2 and 3.'), [], {}, mix(() => ({ type: 'musicxml', content: '<score-partwise/>' }))), `${P}ops[0]: the engine gave no bars for the mix of bars 2 and 3 (it was asked for 1).`);
  assert.equal(await drawn(note('Mix bars 2 and 3.'), [], {}, mix((d: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: [d.a, d.b] }))), `${P}ops[0]: the engine gave 2 bars for the mix of bars 2 and 3 (it was asked for 1).`);
  for (const [words, f, not] of [['Mix bars 2 and 3.', mix, 'cannot be mixed'], ['Extend bar 2 to 3 bars.', ext, 'cannot be extended']] as const) {
    const boom = await drawn(note(words), [], {}, f(() => { throw new Error('Traceback (most recent call last):\n  File "x.py", line 1\nValueError: something else went wrong'); })) as string;
    assert.match(boom, /^Phrase: the extend has 4 bars; ops\[0\]: Score: the engine could not build the score \(/); assert.ok(!boom.includes(not)); assert.match(boom, /something else went wrong/);
    const nothing = await drawn(note(words), [], {}, f(() => null)) as string; assert.equal(nothing, `${P}ops[0]: Score: the engine returned no score for this note.`);
  }
});

// ---- the list: seeds, canonical lines, heads ---------------------------------------------------------------------------------------------------------------------------------------------------
test('a random mix path stores its seed in the sentence at the preview (drawSeeds) and the stored line draws the same twice; a said seed is kept; Extend draws nothing', async () => {
  const drawnSeed = L.drawSeeds(['Mix bars 2 and 3, as a path, in seeded order.'], K, () => 17);
  assert.deepEqual(drawnSeed, ['Mix bars 2 and 3, as a path, in seeded order, seed 17.']);
  assert.deepEqual(L.drawSeeds(['Mix bars 2 and 3, as a path, in seeded order, seed 4, and put it after bar 3.'], K, () => 99), ['Mix bars 2 and 3, as a path, in seeded order, seed 4, and put it after bar 3.']);
  assert.deepEqual(L.drawSeeds(['Mix bars 2 and 3, as a path, in seeded order and put it at the end.'], K, () => 5), ['Mix bars 2 and 3, as a path, in seeded order, seed 5 and put it at the end.'], 'the seed is written right after the order');
  assert.deepEqual(L.drawSeeds(['Mix bars 2 and 3, as a vote.', 'Extend bar 2 to 4 bars, building up.'], K, () => { throw new Error('nothing to draw'); }), ['Mix bars 2 and 3, as a vote.', 'Extend bar 2 to 4 bars, building up.']);
  const plan = await L.planAppend([EXT8], K, drawnSeed, ctx);
  assert.ok(plan.ok); if (!plan.ok) return;
  assert.equal(plan.list[1], 'Mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed 17, and put it between bars 2 and 3.');
  const c1: Call[] = [], c2: Call[] = [];
  assert.deepEqual(await drawn(noteFor(plan.list), c1), await drawn(noteFor(plan.list), c2));
  assert.equal(c1.find((c) => c.kind === 'mix')!.params.seed, 17); assert.equal(((plan.replay.params as { ops: Array<{ seed: number }> }).ops[0]).seed, 17);
});
test('canonical lines in the list: a Mix and an Extend never conflict with another line, typing again replaces nothing, the list renders and parses back', async () => {
  let list: string[] = ['Take [[phrase_003]].'];
  for (const t of ['Mix bars 1 and 2.', 'Mix bars 1 and 2.', 'Extend bar 2 to 3 bars.', 'Extend bar 2 to 3 bars.', 'mix bar 3 with bar 4, 30 percent bar 3 and put it at the end']) { const p = await L.planAppend(list, K, [t], ctx); assert.ok(p.ok, t); if (p.ok) { assert.deepEqual(p.replaced, [], t); list = p.list; } }
  assert.deepEqual(list, ['Take [[phrase_003]].', 'Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it between bars 1 and 2.', 'Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it between bars 1 and 2.', 'Extend bar 2 to 3 bars, repeating with fills.', 'Extend bar 2 to 3 bars, repeating with fills.', 'Mix bars 3 and 4, 30 percent bar 3, as a vote, and put it at the end.']);
  const back = L.parseList(L.render(list), K, V); assert.deepEqual(back.list, list); assert.equal(back.shape, 'list');
});
test('a Mix step and an Extend step are not HEADS: they do not replace line 1 (isHeadLine / the conflict subject), the heads still do', async () => {
  const list = [EXT8];
  for (const t of ['Mix bars 2 and 3.', 'Extend bar 2 to 4 bars.']) {
    const p = await L.planAppend(list, K, [t], ctx); assert.ok(p.ok, t);
    if (p.ok) { assert.deepEqual(p.replaced, [], t); assert.equal(p.list[0], list[0]); assert.equal(p.list.length, 2); assert.equal(p.replay.params?.kind, 'extend'); }
  }
  const h = await L.planAppend(list, K, ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.'], ctx); assert.ok(h.ok); if (h.ok) assert.equal(h.replaced[0]?.index, 0);
  const e = await L.planAppend(['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.'], K, ['Extend [[bar_005]] to 3 bars.'], ctx); assert.ok(e.ok); if (e.ok) assert.equal(e.replaced[0]?.index, 0);
});
test('refusals through planAppend: after a Thin out the order refusal, no head yet, Extend of several bars in words; none of them is `unreadable` (the service is not asked); a damaged sentence IS unreadable (the service is asked)', async () => {
  const dense = ['Take [[phrase_003]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.'];
  for (const t of ['Mix bars 1 and 2.', 'Extend bar 1 to 3 bars.', 'Extend bar 1 to 3 bars and put them at the end.']) {
    const r = await L.planAppend(dense, K, [t], ctx); assert.ok(!r.ok, t); if (!r.ok) { assert.equal(r.reason, 'order', t); assert.match(r.message, /Do the structure steps first/); assert.ok(r.message.includes(`"${t}"`) || r.message.includes('Do the structure steps first')); }
  }
  for (const t of ['Mix bars 2 and 3.', 'Extend bar 2 to 4 bars.']) {
    const none = await L.planAppend([], K, [t], ctx); assert.ok(!none.ok, t);
    if (!none.ok) { assert.equal(none.reason, 'head', t); assert.match(none.message, /Extend, Mix, Morph or Take/); }
  }
  const several = await L.planAppend(['Take [[phrase_003]].'], K, ['Extend bars 2 and 3 to 4 bars.'], ctx); assert.ok(!several.ok);
  if (!several.ok) { assert.equal(several.reason, 'refused'); assert.match(several.message, /Say "Extend bar 2 to 4 bars\."/); }
  for (const t of ['Mix bars 2 and 2.', 'Mix bars 2 and 3 across 5 bars.', 'Extend bar 2 to 99 bars.', 'Extend bar ZZZ to 4 bars.']) { const r = await L.planAppend(['Take [[phrase_003]].'], K, [t], ctx); assert.ok(!r.ok, t); if (!r.ok) assert.equal(r.reason, 'unreadable', t); }
});
test('barCount of a transform names the bars its Mix and Extend steps use (the strip\'s count before the Score says)', () => {
  assert.equal(barCount({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'mix_bars', a: 2, b: 7, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 7 }] }), 7);
  assert.equal(barCount({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'extend_bar', bar: 9, bars: 3, style: 'building', tempo_change_pct: 0 }] }), 9);
  assert.equal(barCount({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'extend_bar', bar: 3, bars: 3, style: 'building', tempo_change_pct: 0 }, { op: 'copy', runs: [[1, 4]] }] }), 4);
});

// ---- never throws, corruption, over the fixtures -------------------------------------------------------------------------------------------------------------------------------------------------
test('NEVER THROWS: replays of shuffled, cut and repeated lines of every fixture mixed with the new words return a result; a damaged new line stops the replay AT it', async () => {
  const pool = [...FIXTURES.flatMap(([, p]) => sentences(p)), 'Copy bar 2.', 'Delete bar 1.', 'Mix bars 1 and 2, 50 percent bar 1, as a vote, and put it between bars 1 and 2.', 'Mix bars 2 and 1, as a path, in seeded order, seed 3, and put it at the end.', 'Extend bar 1 to 3 bars, building up.', 'Extend bar 2 to 2 bars, repeating with fills, 10 percent slower, and put them at the start.'];
  let seed = 11; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 150; i++) {
    const list = Array.from({ length: 1 + rnd(6) }, () => pool[rnd(pool.length)]);
    const rp = await L.replay(list, K, ctx); assert.ok(rp.applied <= list.length); assert.equal(rp.list.length, list.length);
    await L.replay(list.map((l) => l.slice(0, Math.max(1, l.length - rnd(12)))), K, ctx);
    if (rp.params !== null) await drawn(noteFor(list.slice(0, rp.applied)));
  }
  for (const bad of ['Mix bars 2 and ZZZ.', 'Mix bars 2 and 2.', 'Mix bars 2 and 3, put it somewhere.', 'Extend bar 2 to 0 bars.', 'Extend bars 2 and 3 to 4 bars.', 'Extend bar 2 to 4 bars, 99 percent slower.']) {
    const rp = await L.replay([EXT8, 'Copy bar 1.', bad], K, ctx);
    assert.equal(rp.applied, 2, bad); assert.equal(rp.stop?.index, 2, bad); assert.equal(rp.list[2], bad, 'the line is kept as written');
  }
});
