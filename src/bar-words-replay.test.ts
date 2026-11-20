// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - the REPLAY half, written RED first: the list of a phrase (sentence-list-core.ts) with a Duplicate, a Move back / forward, a Delete / Remove or a Morph-between line, over the GOLDEN fixtures (the 14 playground
// phrase notes of test-support/phrase-list-fixtures.ts and the 12 extra paragraphs): each line is accepted, replays (never throws), is written as its canonical sentence, and the note the list writes draws, through the real producePhraseNote (a stub ENGINE that
// does what morph_rhythm / extend_rhythm do in shape), exactly the bars an independent model of the step says: Duplicate adds the bar right after itself, Move swaps with the neighbour, Delete closes up, Morph-between puts EXACTLY N NEW bars between,
// the two ends untouched, the phrase N bars longer; the engine is asked for N + 2 bars (the ends are part of morph_rhythm's count) and the middle N are kept. Replay == note == Score. A refusal at draw time (a delete that leaves no bars, a bar past the end, two
// bars on different grids) is a refusal line in words. The seed of a random morph order is stored in the sentence at the preview (drawSeeds) and the stored line draws the same bars twice.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, validatePhrase } from './phrase-core.ts';
import { planNewBar } from './score-first-core.ts';
import { canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { EXTRA_PARAGRAPHS, PHRASE_VAULT, PLAYGROUND_PHRASES } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const K = 'phrase' as const;
const ctx: L.ReplayCtx = { vault: V };
const BAR = JSON.parse(/```json\n([\s\S]*?)\n```/.exec((planNewBar({ existingBasenames: [], exists: () => false }) as { content: string }).content)![1]) as Record<string, unknown>;
type Bar = Record<string, unknown> & { tempo_bpm: number };
const barOfNote = (text: string): Bar => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)![1]);

/** The stub engine: the shapes of extend_rhythm / mix_rhythm / morph_rhythm / the take, with bars told apart by their tempo (extend 100 + i, mix 300, morph middle 500 + i, a and b at the ends of a morph as they are). */
function engine(log: Array<{ kind: string; bars?: number; a?: number; b?: number }> = []) {
  return async (data: any, params: any): Promise<unknown> => {
    let bars: Bar[];
    if (params.kind === 'extend') bars = Array.from({ length: params.bars }, (_, i) => ({ ...data, tempo_bpm: 100 + i }));
    else if (params.kind === 'mix') bars = [{ ...data.a, tempo_bpm: 300 }];
    else if (params.kind === 'morph') {
      log.push({ kind: 'morph', bars: params.bars, a: data.a.tempo_bpm, b: data.b.tempo_bpm });
      if (data.a.steps !== data.b.steps) throw new Error('Traceback ...\nValueError: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12');
      bars = params.bars === 1 ? [{ ...data.a, tempo_bpm: 500 }] : Array.from({ length: params.bars }, (_, i) => (i === 0 ? { ...data.a } : i === params.bars - 1 ? { ...data.b } : { ...data.a, tempo_bpm: 500 + i }));
    } else bars = [...data.bars];
    for (const [n, forked] of Object.entries(params.override_bars ?? {})) bars[Number(n) - 1] = forked as Bar;
    return { type: 'musicxml', content: '<score-partwise/>', bars_data: bars };
  };
}
function deps(log: Array<{ kind: string; bars?: number; a?: number; b?: number }> = [], extra: Record<string, string> = {}, bar: Record<string, unknown> = {}) {
  const files = (p: string): string | undefined => {
    if (extra[p] !== undefined) return extra[p];
    const bm = /^bars\/(bar_\d+)\.md$/.exec(p); if (bm) return `\`\`\`json\n${JSON.stringify({ ...BAR, ...bar, tempo_bpm: 100 })}\n\`\`\`\n`.replace(/^/, '---\ntype: data\ncontent_type: json\n---\n\n');
    const pm = /^phrases\/(phrase_\d+)\.md$/.exec(p); if (pm) return PLAYGROUND_PHRASES[pm[1]];
    return undefined;
  };
  return { readNote: async (p: string) => { const t = files(p); if (t === undefined) throw new Error('File not found'); return t; }, compute: engine(log) as never };
}
const drawn = async (note: string, log: Array<{ kind: string; bars?: number; a?: number; b?: number }> = [], extra: Record<string, string> = {}, bar: Record<string, unknown> = {}): Promise<Bar[] | string> => {
  const out = await producePhraseNote(deps(log, extra, bar) as never, note, 'phrase_020');
  if (out.kind !== 'score') return out.message;
  return barsOfPayload(out.payload) as Bar[];
};
const BASE = noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
const noteFor = (list: string[], kind = K, base = BASE): string => {
  const rp = L.replayGrammar(list, kind, ctx);
  assert.equal(rp.stop, null, `${list.join(' | ')}: ${rp.stop?.message}`);
  const w = writeListNote(base, 'phrase_020', kind, { params: rp.params, list: rp.list });
  assert.ok(w.ok, w.ok ? '' : w.message);
  return (w as { ok: true; text: string }).text;
};
const sentences = (paragraph: string): string[] => L.sentencesOfText(paragraph, K);

/** An independent model of a step on the bars. */
const model = {
  copy: (b: Bar[], k: number): Bar[] => [...b.slice(0, k), b[k - 1], ...b.slice(k)],
  back: (b: Bar[], k: number): Bar[] => { const o = [...b]; [o[k - 2], o[k - 1]] = [o[k - 1], o[k - 2]]; return o; },
  forward: (b: Bar[], k: number): Bar[] => { const o = [...b]; [o[k - 1], o[k]] = [o[k], o[k - 1]]; return o; },
  del: (b: Bar[], k: number): Bar[] => b.filter((_, i) => i !== k - 1),
  morph: (b: Bar[], a: number, z: number, n: number, after: number): Bar[] => {
    const mids = Array.from({ length: n }, (_, i) => ({ ...b[a - 1], tempo_bpm: 500 + (i + 1) }));
    return [...b.slice(0, after), ...mids, ...b.slice(after)];
  },
};

const FIXTURES: Array<[string, string]> = [...Object.entries(PLAYGROUND_PHRASES).map(([n, note]) => [n, extractDescription(note).trim()] as [string, string]), ...Object.entries(EXTRA_PARAGRAPHS)];
const drawable = (paragraph: string): boolean => !/\[\[(?:arr_001|song_1)\]\]/.test(paragraph);       // an arrangement or a composition source needs the host's own drawers (not the stub)

test('GOLDEN: over the 14 playground phrases and the 12 extra paragraphs, Duplicate / Move back / Move forward / Remove / Morph-between are accepted after the paragraph, replay in full, are written as their canonical sentence, and the note draws what the model says', async () => {
  assert.equal(FIXTURES.length, 26);
  let checked = 0;
  for (const [name, paragraph] of FIXTURES) {
    const base = sentences(paragraph);
    const head = await drawn(noteFor(base));
    if (typeof head === 'string' || !drawable(paragraph)) { if (drawable(paragraph)) assert.fail(`${name}: the head draws (${head})`); continue; }
    if (/Thin out|Double up/.test(paragraph)) {            // a structure step after a density step is refused (0980), for every new word: counted, not skipped
      for (const t of ['Duplicate bar 1.', 'Remove bar 1.', 'Move bar 1 forward.', 'Morph bars 1 and 2 across 5 bars.']) { const r = await L.planAppend(base, K, [t], ctx); assert.ok(!r.ok && r.reason === 'order', `${name}: ${t}`); checked++; }
      continue;
    }
    const forks = /is replaced by/.test(paragraph);       // forks number the FINAL bars, so the head's bars are not the model's input: only the length is compared
    const n = head.length;
    const steps: Array<{ typed: string; canonical: string; want: Bar[] }> = [
      { typed: 'Duplicate bar 1.', canonical: 'Copy bar 1.', want: model.copy(head, 1) },
      ...(n >= 2 ? [
        { typed: 'Move bar 1 forward.', canonical: 'Move bar 1 one bar right.', want: model.forward(head, 1) },
        { typed: 'Move bar 2 back.', canonical: 'Move bar 2 one bar left.', want: model.back(head, 2) },
        { typed: 'Remove bar 1.', canonical: 'Delete bar 1.', want: model.del(head, 1) },
        { typed: 'Morph bars 1 and 2 across 5 bars.', canonical: 'Morph bars 1 and 2 across 5 bars, in musical order, and put them between bars 1 and 2.', want: model.morph(head, 1, 2, 5, 1) },
      ] : []),
      ...(n >= 3 ? [{ typed: `Morph bars 1 and ${n} across 2 bars.`, canonical: `Morph bars 1 and ${n} across 2 bars, in musical order, and put them after bar ${n}.`, want: model.morph(head, 1, n, 2, n) }] : []),
    ];
    for (const s of steps) {
      const plan = await L.planAppend(base, K, [s.typed], ctx);
      assert.ok(plan.ok, `${name}: "${s.typed}" ${plan.ok ? '' : plan.message}`);
      if (!plan.ok) continue;
      assert.equal(plan.replay.stop, null, `${name}: ${s.typed}`); assert.equal(plan.replay.applied, base.length + 1, `${name}: ${s.typed}`);
      assert.deepEqual(plan.added, [s.canonical], `${name}: the canonical line`);
      assert.equal(plan.list.length, base.length + 1, `${name}: one line added, none replaced`); assert.equal(plan.list[plan.list.length - 1], s.canonical, name);
      const again = L.replayGrammar(plan.list, K, ctx); assert.deepEqual(again.list, plan.list, `${name}: the canonical list replays to itself`);
      const text = noteFor(plan.list);
      const bars = await drawn(text);
      assert.ok(typeof bars !== 'string', `${name}: ${s.typed} -> ${bars}`);
      if (forks) assert.equal((bars as Bar[]).length, s.want.length, `${name}: "${s.typed}" draws as many bars as the model says`); else assert.deepEqual(bars, s.want, `${name}: "${s.typed}" draws what the model says`);
      const json = validatePhrase(JSON.parse(plan.replay.json)); assert.ok(json.ok);
      assert.deepEqual(canonical((json as { ok: true; value: GrammarParams }).value), canonical(plan.replay.params!), `${name}: the json cache is the replay`);
      checked++;
    }
  }
  assert.ok(checked >= 60, `checked ${checked} step replays`);
});

test('MORPH-BETWEEN, the count: the engine is asked for N + 2 bars of the two bars (the ends are part of morph_rhythm\'s count), the middle N are inserted, the ends stay the originals, the phrase is N bars longer', async () => {
  const note = noteFor(['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Morph bars 2 and 3 across 5 bars.']);
  const log: Array<{ kind: string; bars?: number; a?: number; b?: number }> = [];
  const bars = await drawn(note, log) as Bar[];
  assert.equal(bars.length, 13, '8 + 5');
  assert.deepEqual(log.filter((l) => l.kind === 'morph'), [{ kind: 'morph', bars: 7, a: 101, b: 102 }], 'asked once, for 7 bars, of bar 2 and bar 3 of the phrase (their tempos 101 and 102 tell them)');
  assert.deepEqual(bars.slice(0, 2).map((b) => b.tempo_bpm), [100, 101]); assert.deepEqual(bars.slice(7).map((b) => b.tempo_bpm), [102, 103, 104, 105, 106, 107]);
  assert.deepEqual(bars.slice(2, 7).map((b) => b.tempo_bpm), [501, 502, 503, 504, 505], 'bars 3 to 7 are the five new ones: the engine\'s states 1 to 5 of 0 to 6');
});
test('MORPH-BETWEEN, N = 1 asks for 3 bars and keeps the middle one; the place words move the new bars: before bar 2, at the start, at the end, after bar 6', async () => {
  const at = async (words: string): Promise<number[]> => {
    const bars = await drawn(noteFor(['Extend [[bar_005]] to 8 bars, repeating with fills.', `Morph bars 2 and 3 across 1 bar ${words}.`])) as Bar[];
    assert.equal(bars.length, 9, words);
    return bars.map((b, i) => (b.tempo_bpm >= 500 ? i + 1 : 0)).filter(Boolean);
  };
  assert.deepEqual(await at(''), [3]); assert.deepEqual(await at('and put it before bar 2'), [2]); assert.deepEqual(await at('and put it at the start'), [1]); assert.deepEqual(await at('and put it at the end'), [9]); assert.deepEqual(await at('and put it after bar 6'), [7]);
  const log: Array<{ kind: string; bars?: number }> = []; await drawn(noteFor(['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Morph bars 2 and 3 across 1 bar.']), log);
  assert.deepEqual(log.map((l) => l.bars), [3]);
});
test('steps run in the order of the lines on the bars the earlier steps left: Delete bar 1, then Morph bars 1 and 2 (the old bars 2 and 3), then Copy bar 1', async () => {
  const list = ['Extend [[bar_005]] to 6 bars, repeating with fills.', 'Delete bar 1.', 'Morph bars 1 and 2 across 2 bars.', 'Duplicate bar 1.'];
  const bars = await drawn(noteFor(list)) as Bar[];
  assert.deepEqual(bars.map((b) => b.tempo_bpm), [101, 101, 501, 502, 102, 103, 104, 105], 'old bar 2 (101), copy of it, two new, old bar 3 (102) ... old bar 6 (105)');
});
test('a morph-between after a Take (a phrase\'s own bars) and after a Morph head; forks lie over the FINAL bars, as after any step', async () => {
  const take = await drawn(noteFor(['Take [[phrase_001]].', 'Morph bars 1 and 2 across 3 bars.'])) as Bar[];
  assert.equal(take.length, 12 + 3);
  const forked = await drawn(noteFor(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Morph bars 1 and 2 across 2 bars.', 'Bar 2 is replaced by [[bar_009]].'])) as Bar[];
  assert.equal(forked.length, 6); assert.equal(forked[1].tempo_bpm, 100, 'the fork note\'s own bar (tempo 100) lies over final bar 2');
});
test('refusals at draw time are words: a delete that leaves no bars, a bar past the end (every step), a Move off the end, two bars on different grids', async () => {
  const one = ['Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote.'];
  assert.match(await drawn(noteFor([...one, 'Remove bar 1.'])) as string, /would leave no bars/);
  assert.match(await drawn(noteFor([...one, 'Duplicate bar 3.'])) as string, /bar 3 asked for, but there is 1 bar/);
  assert.match(await drawn(noteFor([...one, 'Move bar 1 forward.'])) as string, /cannot move right/);
  assert.match(await drawn(noteFor([...one, 'Move bar 1 back.'])) as string, /cannot move left/);
  assert.match(await drawn(noteFor([...one, 'Morph bars 1 and 2 across 5 bars.'])) as string, /bar 2 asked for, but there is 1 bar/);
  const e = noteFor(['Extend [[bar_005]] to 4 bars, repeating with fills.', 'Morph bars 2 and 3 across 5 bars and put them after bar 9.']);
  assert.match(await drawn(e) as string, /after bar 9.*but there are 4 bars|bar 9 asked for, but there are 4 bars/);
  const grid = noteFor(['Take [[phrase_001]].', 'Morph bars 1 and 2 across 5 bars.']);
  const odd = await producePhraseNote({ ...deps(), compute: (async (data: any, params: any) => { if (params.kind === 'morph') throw new Error('Traceback ...\nValueError: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12'); return engine()(data, params); }) as never } as never, grid, 'x');
  assert.equal(odd.kind, 'refusal'); assert.match((odd as { message: string }).message, /morph_rhythm: a and b must agree on steps/);
});
test('a random order stores its seed in the sentence at the preview (drawSeeds) and the stored line draws the same twice; a said seed is kept', async () => {
  const drawnSeed = L.drawSeeds(['Morph bars 2 and 3 across 5 bars, in seeded order.'], K, () => 17);
  assert.deepEqual(drawnSeed, ['Morph bars 2 and 3 across 5 bars, in seeded order, seed 17.']);
  assert.deepEqual(L.drawSeeds(['Morph bars 2 and 3 across 5 bars, in seeded order, seed 4, and put them after bar 3.'], K, () => 99), ['Morph bars 2 and 3 across 5 bars, in seeded order, seed 4, and put them after bar 3.']);
  const plan = await L.planAppend(['Extend [[bar_005]] to 8 bars, repeating with fills.'], K, drawnSeed, ctx);
  assert.ok(plan.ok); if (!plan.ok) return;
  assert.deepEqual(plan.list[1], 'Morph bars 2 and 3 across 5 bars, in seeded order, seed 17, and put them between bars 2 and 3.');
  const log1: Array<{ kind: string }> = [], log2: Array<{ kind: string }> = [];
  const one = await drawn(noteFor(plan.list), log1), two = await drawn(noteFor(plan.list), log2);
  assert.deepEqual(one, two); assert.equal(((plan.replay.params as { ops: Array<{ seed: number }> }).ops[0]).seed, 17);
});
test('canonical lines in the list: Duplicate is written Copy, Remove is written Delete, Move back is written one bar left; typing again replaces nothing (structure steps never conflict)', async () => {
  let list: string[] = ['Take [[phrase_003]].'];
  for (const t of ['Duplicate bar 2.', 'Duplicate bar 2.', 'Remove bar 1.', 'Move bar 3 back.']) { const p = await L.planAppend(list, K, [t], ctx); assert.ok(p.ok, t); if (p.ok) { assert.deepEqual(p.replaced, [], t); list = p.list; } }
  assert.deepEqual(list, ['Take [[phrase_003]].', 'Copy bar 2.', 'Copy bar 2.', 'Delete bar 1.', 'Move bar 3 one bar left.']);
  assert.equal(L.render(list), '1. Take [[phrase_003]].\n2. Copy bar 2.\n3. Copy bar 2.\n4. Delete bar 1.\n5. Move bar 3 one bar left.');
  const back = L.parseList(L.render(list), K, V); assert.deepEqual(back.list, list); assert.equal(back.shape, 'list');
});
test('a Morph-between line is not a HEAD: it does not replace line 1 (isHeadLine / the conflict subject), the head Morph still does', async () => {
  assert.equal(L.isHeadLine('Morph bars 2 and 3 across 5 bars.'), false); assert.equal(L.isHeadLine('Morph bar 2 and bar 3 across 5 bars.'), false);
  assert.equal(L.isHeadLine('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.'), true);
  const list = ['Extend [[bar_005]] to 4 bars, repeating with fills.'];
  const p = await L.planAppend(list, K, ['Morph bars 2 and 3 across 5 bars.'], ctx); assert.ok(p.ok);
  if (p.ok) { assert.deepEqual(p.replaced, []); assert.equal(p.list[0], list[0]); assert.equal(p.list.length, 2); assert.equal(p.replay.params?.kind, 'extend'); }
  const h = await L.planAppend(list, K, ['Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order.'], ctx); assert.ok(h.ok); if (h.ok) assert.equal(h.replaced[0]?.index, 0);
});
test('refusals through planAppend: after a Thin out the order refusal ("Do the structure steps first"), no head yet, and Move two places say the hint in words; none of them is `unreadable` (the service is not asked)', async () => {
  const dense = ['Take [[phrase_003]].', 'Thin out bars 1 to 2, by half, keeping the downbeat.'];
  for (const t of ['Duplicate bar 1.', 'Remove bar 1.', 'Move bar 2 back.', 'Morph bars 1 and 2 across 5 bars.']) {
    const r = await L.planAppend(dense, K, [t], ctx); assert.ok(!r.ok, t); if (!r.ok) { assert.equal(r.reason, 'order', t); assert.match(r.message, /Do the structure steps first/); }
  }
  const two = await L.planAppend(['Take [[phrase_003]].'], K, ['Move bar 3 two bars left.'], ctx); assert.ok(!two.ok);
  if (!two.ok) { assert.equal(two.reason, 'refused'); assert.match(two.message, /Say "Move bar 3 one bar left\." twice\./); }
  const none = await L.planAppend([], K, ['Morph bars 2 and 3 across 5 bars.'], ctx); assert.ok(!none.ok);
  if (!none.ok) { assert.equal(none.reason, 'head'); assert.match(none.message, /Extend, Mix, Morph or Take/); }
});

// ---- never throws, corruption, over the fixtures --------------------------------------------------------------------------------------------------------------------------------------------------
test('NEVER THROWS: replays of shuffled, cut and repeated lines of every fixture mixed with the new words return a result; a damaged new line stops the replay AT it', async () => {
  const pool = [...FIXTURES.flatMap(([, p]) => sentences(p)), 'Copy bar 2.', 'Delete bar 1.', 'Move bar 2 one bar left.', 'Morph bars 1 and 2 across 5 bars, in musical order, and put them between bars 1 and 2.', 'Morph bars 2 and 1 across 1 bar, in seeded order, seed 3, and put it at the end.'];
  let seed = 11; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 150; i++) {
    const list = Array.from({ length: 1 + rnd(6) }, () => pool[rnd(pool.length)]);
    const rp = await L.replay(list, K, ctx); assert.ok(rp.applied <= list.length); assert.equal(rp.list.length, list.length);
    await L.replay(list.map((l) => l.slice(0, Math.max(1, l.length - rnd(12)))), K, ctx);
    if (rp.params !== null) await drawn(noteFor(list.slice(0, rp.applied)));
  }
  for (const bad of ['Morph bars 2 and 3 across ZZZ bars.', 'Morph bars 2 and 2 across 5 bars.', 'Morph bars 2 and 3 across 5 bars, put them somewhere.', 'Move bar 3 two bars left.', 'Duplicate ZZZ 3.']) {
    const rp = await L.replay(['Extend [[bar_005]] to 8 bars, repeating with fills.', 'Copy bar 1.', bad], K, ctx);
    assert.equal(rp.applied, 2, bad); assert.equal(rp.stop?.index, 2, bad); assert.equal(rp.list[2], bad, 'the line is kept as written');
  }
});

// ---- 2026-11-19-0996b mutation triage: morphNewBars (phrase-core.ts), the call to the engine and every answer it can give, in exact words ------------------------------------------------------------------------------------------
const EXT8 = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
type Call = { kind: string; data: any; params: any; title: string };
/** The deps of the replay stub, with every compute call recorded and an optional answer for the morph call (the engine's own is the stub's). */
function spied(calls: Call[], onMorph?: (data: any, params: any) => unknown | Promise<unknown>) {
  const base = deps();
  return { readNote: base.readNote, compute: (async (data: any, params: any, title: string) => { calls.push({ kind: params.kind, data, params, title }); if (params.kind === 'morph' && onMorph) return onMorph(data, params); return engine()(data, params); }) as never };
}
const phraseOf = async (note: string, calls: Call[], onMorph?: (data: any, params: any) => unknown | Promise<unknown>) => producePhraseNote(spied(calls, onMorph) as never, note, 'phrase_020');
const messageOf = (o: { kind: string }): string => (o as { message: string }).message;

// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:1059 "'bar_a'" -> "''" and "'bar_b'" -> "''" (and every other part of the asked params): the call is EXACTLY the one a Morph head makes, asked for N + 2 bars of the two bars as data
test('morphNewBars asks the engine exactly: kind morph, the two bars of the phrase as data {a, b}, the placeholder names bar_a / bar_b, N + 2 bars, the order and its seed (the seed only of a seeded order), under the title of the phrase', async () => {
  const note = (words: string) => noteFor([EXT8, words]);
  const cases: Array<[string, { bars: number; order: string; seed: number }, [number, number]]> = [
    ['Morph bars 2 and 3 across 5 bars.', { bars: 7, order: 'musical', seed: 0 }, [101, 102]],
    ['Morph bars 6 and 1 across 1 bar.', { bars: 3, order: 'musical', seed: 0 }, [105, 100]],
    ['Morph bars 2 and 5 across 64 bars, in seeded order, seed 17.', { bars: 66, order: 'seeded', seed: 17 }, [101, 104]],
    ['Morph bars 2 and 5 across 3 bars, in seeded order.', { bars: 5, order: 'seeded', seed: 0 }, [101, 104]],
    ['Morph bars 7 and 8 across 2 bars, in by-channel order.', { bars: 4, order: 'by_channel', seed: 0 }, [106, 107]],
  ];
  for (const [words, want, [ta, tb]] of cases) {
    const calls: Call[] = []; const out = await phraseOf(note(words), calls);
    assert.equal(out.kind, 'score', `${words}: ${out.kind === 'score' ? '' : messageOf(out)}`);
    const morphs = calls.filter((c) => c.kind === 'morph'); assert.equal(morphs.length, 1, words);
    assert.deepEqual(morphs[0].params, { kind: 'morph', a: 'bar_a', b: 'bar_b', bars: want.bars, order: want.order, seed: want.seed }, words);
    assert.deepEqual(Object.keys(morphs[0].data), ['a', 'b'], words);
    assert.equal(morphs[0].data.a.tempo_bpm, ta, `${words}: a is the bar the sentence names first`); assert.equal(morphs[0].data.b.tempo_bpm, tb, `${words}: b is the second`);
    assert.equal(morphs[0].title, 'phrase_020', 'the title of the phrase goes to the engine');
    assert.deepEqual(calls.map((c) => c.kind), ['extend', 'morph', 'transform'], `${words}: the head, the new bars, then the final draw`);
  }
});

// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:1064 `line !== null` -> true / false (a morph_rhythm refusal is the person's data, said in words; ANY OTHER engine error is not)
// 2026-11-19-0996b mutation survivor: src/phrase-core.ts:1062..1072 the exact refusal words of every way the new bars can fail
test('morphNewBars: the engine\'s own refusal (two bars on different grids) is said as "bars A and B cannot be morphed: ...", any other engine error stays an engine error in the one-line words of the Score, a wrong number of bars and no bars are said with the counts; the whole message is exact', async () => {
  const note = noteFor([EXT8, 'Delete bar 1.', 'Morph bars 2 and 3 across 5 bars.']);
  const PREFIX = 'Phrase: the extend has 8 bars; ';
  const grid = await phraseOf(note, [], () => { throw new Error('Traceback (most recent call last):\n  File "x.py", line 1\nValueError: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12'); });
  assert.equal(grid.kind, 'refusal'); assert.equal(messageOf(grid), `${PREFIX}ops[1]: bars 2 and 3 cannot be morphed: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12`);
  const bare = await phraseOf(note, [], () => { throw new Error('morph_rhythm: bars must be at least 2'); });
  assert.equal(messageOf(bare), `${PREFIX}ops[1]: bars 2 and 3 cannot be morphed: morph_rhythm: bars must be at least 2`, 'a message without a traceback');
  const boom = await phraseOf(note, [], () => { throw new Error('Traceback (most recent call last):\n  File "x.py", line 1\nValueError: something else went wrong'); });
  assert.equal(boom.kind, 'refusal'); assert.match(messageOf(boom), /^Phrase: the extend has 8 bars; ops\[1\]: Score: the engine could not build the score \(/); assert.ok(!/cannot be morphed/.test(messageOf(boom)), 'not a morph refusal');
  assert.match(messageOf(boom), /something else went wrong/);
  const plain = await phraseOf(note, [], () => { throw 'a bare string'; });
  assert.ok(!/cannot be morphed/.test(messageOf(plain)), 'a thrown string is not a morph refusal'); assert.match(messageOf(plain), /^Phrase: the extend has 8 bars; ops\[1\]: Score: the engine could not build the score \(a bare string\)/);
  const none = await phraseOf(note, [], () => ({ type: 'musicxml', content: '<score-partwise/>' }));
  assert.equal(messageOf(none), `${PREFIX}ops[1]: the engine gave no bars for the morph of bars 2 and 3 (it was asked for 7).`);
  const fewer = await phraseOf(note, [], (data: any, params: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: Array.from({ length: params.bars - 1 }, () => data.a) }));
  assert.equal(messageOf(fewer), `${PREFIX}ops[1]: the engine gave 6 bars for the morph of bars 2 and 3 (it was asked for 7).`);
  const more = await phraseOf(note, [], (data: any, params: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: Array.from({ length: params.bars + 1 }, () => data.a) }));
  assert.equal(messageOf(more), `${PREFIX}ops[1]: the engine gave 8 bars for the morph of bars 2 and 3 (it was asked for 7).`);
  const empty = await phraseOf(note, [], () => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: [] }));
  assert.equal(messageOf(empty), `${PREFIX}ops[1]: the engine gave no bars for the morph of bars 2 and 3 (it was asked for 7).`, 'an empty list is no bars');
  const nothing = await phraseOf(note, [], () => null);
  assert.equal(nothing.kind, 'refusal'); assert.equal(messageOf(nothing), `${PREFIX}ops[1]: Score: the engine returned no score for this note.`);
  const one = await phraseOf(noteFor([EXT8, 'Morph bars 2 and 3 across 1 bar.']), [], (data: any, params: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: Array.from({ length: params.bars + 1 }, () => data.a) }));
  assert.equal(messageOf(one), `${PREFIX}ops[0]: the engine gave 4 bars for the morph of bars 2 and 3 (it was asked for 3).`);
  assert.equal(messageOf(await phraseOf(noteFor([EXT8, 'Morph bars 2 and 9 across 1 bar.']), [], undefined)), `${PREFIX}ops[0]: bar 9 asked for, but there are 8 bars.`, 'a bar the phrase does not have never reaches the engine');
});

test('morphNewBars: the bars it keeps are EXACTLY the middle N (never the ends, never one too many or too few), whatever N; the phrase draws N bars more', async () => {
  for (const n of [1, 2, 3, 7, 20]) {
    const calls: Call[] = [];
    const out = await phraseOf(noteFor([EXT8, `Morph bars 2 and 3 across ${n} bars.`]), calls, (data: any, params: any) => ({ type: 'musicxml', content: '<score-partwise/>', bars_data: Array.from({ length: params.bars }, (_, i) => ({ ...data.a, tempo_bpm: 900 + i })) }));
    assert.equal(out.kind, 'score', String(n)); const bars = barsOfPayload((out as { payload: Record<string, unknown> }).payload) as Bar[];
    assert.equal(bars.length, 8 + n, String(n));
    assert.deepEqual(bars.slice(2, 2 + n).map((b) => b.tempo_bpm), Array.from({ length: n }, (_, i) => 901 + i), `${n}: states 1 to ${n} of 0 to ${n + 1}: the first (900) and the last (${900 + n + 1}) are dropped`);
    assert.ok(!bars.some((b) => b.tempo_bpm === 900 || b.tempo_bpm === 901 + n), `${n}: neither end of the engine's answer is in the phrase`);
  }
});

// ---- 2026-11-19-0996b mutation triage: sentence-list-core.ts (the head line, the `refused` answer of planAppend) ------------------------------------------------------------------------------------------------------------------------------
// 2026-11-19-0996b mutation survivor: src/sentence-list-core.ts:97 HEAD_LINE (every alternative, the `morph(?!\s+bars?\s+\d)` look-ahead, `\b`, the leading white space, the case flag)
test('isHeadLine / subjectOf: Extend, Mix, Take and Morph [[a]] are heads; a Morph of BARS WITH A NUMBER is a step (not a head, no subject); the look-ahead needs the word bar(s), white space and a digit; whole words only; any case; leading white space', () => {
  const rows: Array<[string, boolean]> = [
    ['Extend [[bar_005]].', true], ['extend [[bar_005]]', true], ['EXTEND', true], ['  Extend [[bar_005]]', true], ['Mix [[bar_005]] and [[bar_006]].', true], ['mix', true], ['Take [[phrase_003]].', true], ['TAKE [[x]]', true], ['  Take [[x]]', true], ['\tTake [[x]]', true], ['\nTake [[x]]', true],
    ['Morph [[bar_003]] into [[bar_001]] over 5 bars.', true], ['morph [[a]] into [[b]]', true], ['MORPH', true], ['Morph', true], ['Morph bars', true], ['Morph bar', true], ['Morph bars x', true], ['Morph barsx 2', true], ['Morph bar2', true], ['Morph bars,2', true], ['Morph  bars x', true], ['Morph [[bar_003]] and bars 2 and 3', true],
    ['Morph bars 2 and 3 across 5 bars.', false], ['Morph bar 2 and bar 3', false], ['morph bars 12', false], ['MORPH BAR 2', false], ['  morph  bars  2', false], ['Morph\tbars\t2', false], ['Morph\nbars 2', false], ['Morph bars\n2', false], ['morph bars 0', false], ['Morph bar 9', false], ['  Morph bars 2 to 3', false],
    ['Morphing', false], ['Morphing bars 2', false], ['Takes [[x]]', false], ['Taken', false], ['Mixed', false], ['Mixer', false], ['Extended', false], ['Extends', false], ['Duplicate bar 1.', false], ['Copy bar 1.', false], ['Keep bars 1 to 2.', false], ['Thin out bars 1 to 2, by half, keeping the downbeat.', false], ['Make it 8 bars long.', false], ['Bar 3 is replaced by [[bar_009]].', false], ['Please take [[x]]', false], ['', false], ['  ', false],
  ];
  for (const [t, want] of rows) {
    assert.equal(L.isHeadLine(t), want, JSON.stringify(t));
    assert.equal(L.subjectOf(t, K), want ? 'head' : L.subjectOf(t, K), JSON.stringify(t));
    if (!want) assert.notEqual(L.subjectOf(t, K), 'head', `${JSON.stringify(t)} has no head subject`);
  }
  assert.equal(L.subjectOf('Morph bars 2 and 3 across 5 bars.', K), null, 'a morph between two bars is a step of the list: no conflict subject, so it never replaces a line');
});

// 2026-11-19-0996b mutation survivor: src/sentence-list-core.ts:309 `rep.stop.code === 'refused'` and every field of its answer (reason, message, line = the typed sentence, column)
test('planAppend: a refusal in words ("refused") names the TYPED sentence that was refused (its line in the new list, not its place among the typed ones) with the grammar\'s own column and words; the other classes (order, unreadable, head, empty) keep their own reason', async () => {
  const T = 'Take [[phrase_003]].'; const DENSE = 'Thin out bars 1 to 2, by half, keeping the downbeat.';
  const twice = 'Move takes one bar at a time. Say "Move bar 3 one bar left." twice.';
  const plan = (list: string[], typed: string[]) => L.planAppend(list, K, typed, ctx);
  assert.deepEqual(await plan([T], ['Move bar 3 two bars left.']), { ok: false, reason: 'refused', message: twice, line: 1, column: 12 });
  assert.deepEqual(await plan([T], ['Copy bar 1.', 'Move bar 3 two bars left.']), { ok: false, reason: 'refused', message: twice, line: 2, column: 12 }, 'the second typed sentence is the second line');
  assert.deepEqual(await plan([T], ['Move bar 3 two bars left.', 'Copy bar 1.']), { ok: false, reason: 'refused', message: twice, line: 1, column: 12 });
  assert.deepEqual(await plan([T, 'Copy bar 2.'], ['Copy bar 1.', 'Move bars 3 to 5 4 bars right.']), { ok: false, reason: 'refused', message: 'Move takes one bar at a time. Say "Move bars 3 to 5 one bar right." 4 times.', line: 2, column: 18 });
  assert.deepEqual(await plan([T], ['Move bar 3 0 bars left.']), { ok: false, reason: 'refused', message: 'Expected a move of one bar, but found 0 bars.', line: 1, column: 12 });
  const ORDER = (s: string) => `Do the structure steps first: "${s}" changes which bars there are, and this phrase already has a Thin out or a Double up before it (a Keep, Delete, Copy or Move comes before them). The list is unchanged.`;
  assert.deepEqual(await plan([T, DENSE], ['Copy bar 1.']), { ok: false, reason: 'order', message: ORDER('Copy bar 1.'), line: 1, column: 1 });
  assert.deepEqual(await plan([T], ['Morph bars 2 and 2 across 5 bars.']), { ok: false, reason: 'unreadable', message: 'Expected two different bars to morph between, but found bar 2 twice.', line: 1, column: 18 });
  assert.deepEqual(await plan([T], ['Move bar 3 sideways.']), { ok: false, reason: 'unreadable', message: 'Expected "one bar left", "one bar right", "back" or "forward", but found "sideways".', line: 1, column: 12 }, 'a word the grammar does not know is unreadable, not refused');
  assert.deepEqual(await plan([T], ['Move bar 3.']), { ok: false, reason: 'unreadable', message: 'Expected "one bar left", "one bar right", "back" or "forward", but found the end of the sentence.', line: 1, column: 11 });
  assert.deepEqual(await plan([], ['Morph bars 2 and 3 across 5 bars.']), { ok: false, reason: 'head', message: 'A phrase starts with Extend, Mix, Morph or Take: "Morph bars N and M across K bars" works on the bars the phrase already has, so it comes after the first line.', line: 1, column: 1 });
  assert.deepEqual(await plan([], ['Move bar 3 two bars left.']), { ok: false, reason: 'unreadable', message: 'Expected a description that starts with Extend, Mix, Morph, Take or Play, but found "Move".', line: 1, column: 1 });
  assert.deepEqual(await plan([T], ['']), { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 });
  assert.deepEqual(await plan([T], ['Copy bar 1.', 'Foo bar.']), { ok: false, reason: 'unreadable', message: 'Expected "Thin out ...", "Double up ...", "Keep ...", "Delete ...", "Copy ...", "Move ..." or "Bar N is replaced by [[a bar]]", but found "Foo".', line: 2, column: 1 });
});
