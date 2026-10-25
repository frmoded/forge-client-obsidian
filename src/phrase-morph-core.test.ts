// score_first M7c Phase A (drain 2026-10-24-1200) — the morph phrase, pure: its JSON (defaults, refusal lines naming the field, the position rule, a round trip), the helpers the strip uses, the sentence, "New morph from
// this bar", the Score of a morph with the engine injected, and the evidence lines. The REAL engine runs the same path in phrase-morph-engine.test.ts; the strip in phrase-morph-dom.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MORPH_DEFAULTS, MORPH_KEYS, MORPH_ORDERS, applyPhraseWrite, clampMorphPosition, clampMorphSeed, createNewMorph, formatPhraseJson, isPhrasePath, morphEditCount, morphNoteContent, morphRhythmRefusal, morphSentence,
  morphTraceEngine, morphTraceWritten, newMorphAvailable, normalizeMorph, planNewMorph, producePhrase, producePhraseNote, readPhraseKind, readPhraseNote, validatePhrase,
  type MorphPhrase, type PhraseParams,
} from './phrase-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

const note = (json: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n`;
const MORPH: MorphPhrase = { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 };
const bar = (hits: Record<string, Array<number | [number, number]>>, extra: Partial<RhythmData> = {}): RhythmData => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: Object.fromEntries(Object.entries(hits).map(([name, at]) => [name, Array.from({ length: 16 }, (_, i) => { const h = at.find((x) => (Array.isArray(x) ? x[0] : x) === i); return h === undefined ? false : Array.isArray(h) ? h[1] : true; })])),
  ...extra,
} as RhythmData);
const barText = (data: RhythmData) => note(data);

// ---- the JSON ---------------------------------------------------------------------------------------------------------

test('a morph with only its bars gets the defaults: 5 bars, musical order, seed 0, no position', () => {
  assert.deepEqual(validatePhrase({ kind: 'morph', a: 'bar_005', b: 'bar_006' }), { ok: true, value: MORPH });
  assert.deepEqual(MORPH_DEFAULTS, { bars: 5, order: 'musical', seed: 0 });
});

test('every field round-trips through the note text, the position only with bars = 1', () => {
  for (const p of [MORPH, { ...MORPH, bars: 12, order: 'seeded' as const, seed: 7 }, { ...MORPH, bars: 1, order: 'by_channel' as const, position: 3 }, { ...MORPH, bars: 64 }]) {
    const text = note(JSON.parse(formatPhraseJson(p)));
    assert.deepEqual(readPhraseNote(text), { ok: true, value: p });
  }
  assert.equal(formatPhraseJson(MORPH), '{\n  "kind": "morph",\n  "a": "bar_005",\n  "b": "bar_006",\n  "bars": 5,\n  "order": "musical",\n  "seed": 0\n}');
  assert.equal(formatPhraseJson({ ...MORPH, bars: 1, position: 2 }), '{\n  "kind": "morph",\n  "a": "bar_005",\n  "b": "bar_006",\n  "bars": 1,\n  "order": "musical",\n  "seed": 0,\n  "position": 2\n}');
});

test('hand-edited morph JSON that is wrong is refused naming the field (never corrected)', () => {
  const m = (raw: object) => validatePhrase({ kind: 'morph', a: 'bar_005', b: 'bar_006', ...raw });
  const refusal = (raw: object): string => { const r = m(raw); assert.equal(r.ok, false, JSON.stringify(raw)); return (r as { message: string }).message; };
  assert.match(refusal({ bars: 0 }), /^bars must be a whole number from 1 to 64, got 0\.$/);
  assert.match(refusal({ bars: 65 }), /^bars must be a whole number from 1 to 64, got 65\.$/);
  assert.match(refusal({ bars: 2.5 }), /^bars must be a whole number/);
  assert.match(refusal({ bars: '5' }), /^bars must be a whole number/);
  assert.match(refusal({ order: 'random' }), /^order must be one of musical, seeded, by_channel, got "random"\.$/);
  assert.match(refusal({ seed: -1 }), /^seed must be a whole number, 0 or more, got -1\.$/);
  assert.match(refusal({ seed: 1.5 }), /^seed must be a whole number/);
  assert.match(refusal({ seed: '1' }), /^seed must be a whole number/);
  assert.match(refusal({ seed: 2 ** 60 }), /^seed must be a whole number/);
  assert.match(refusal({ bars: 1 }), /^position is needed when bars is 1/);
  assert.match(refusal({ bars: 1, position: -1 }), /^position must be a whole number, 0 or more, got -1\.$/);
  assert.match(refusal({ bars: 1, position: 0.5 }), /^position must be a whole number/);
  assert.match(refusal({ bars: 3, position: 1 }), /^position only applies when bars is 1\.$/);
  assert.match(refusal({ speed: 3 }), /^Unexpected field "speed" \(a morph holds only kind, a, b, bars, order, seed, position, overrides\)\.$/);
  assert.match(refusal({ a: 'bars/bar_005' }), /^a must be the name of a bar/);
  assert.match(refusal({ b: undefined }), /^b must be the name of a bar/);
  assert.deepEqual([...MORPH_KEYS], ['kind', 'a', 'b', 'bars', 'order', 'seed', 'position', 'overrides']);
  assert.deepEqual([...MORPH_ORDERS], ['musical', 'seeded', 'by_channel']);
});

test('the kind refusal names all three kinds; a mix and an extend are read exactly as before', () => {
  const bad = validatePhrase({ kind: 'blend', a: 'x' });
  assert.deepEqual(bad, { ok: false, message: 'kind must be "extend", "mix" or "morph", got "blend".' });
  assert.deepEqual(validatePhrase({ kind: 'mix', a: 'bar_005', b: 'bar_006' }), { ok: true, value: { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } });
  assert.deepEqual(validatePhrase({ kind: 'extend', source: 'bar_005' }), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  assert.equal(formatPhraseJson({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost: true }), '{\n  "kind": "mix",\n  "a": "bar_005",\n  "b": "bar_006",\n  "weight": 0.4,\n  "threshold": 0.5,\n  "ghost": true\n}');
  assert.equal(formatPhraseJson({ kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: -20, overrides: { '3': 'bars/bar_009' } }), '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 8,\n  "style": "building",\n  "tempo_change_pct": -20,\n  "overrides": {\n    "3": "bars/bar_009"\n  }\n}');
});

test('readPhraseKind sees a morph even when the rest of it is wrong; isPhrasePath is unchanged', () => {
  assert.equal(readPhraseKind(note({ kind: 'morph', a: 'x', bars: 0 })), 'morph');
  assert.equal(readPhraseKind(note({ kind: 'blend' })), null);
  assert.equal(isPhrasePath('phrases/phrase_004.md'), true);
  assert.equal(isPhrasePath('phrases/morph_004.md'), false);
});

test('a control-strip write is a rewrite of the json block only, and a read-only morph note refuses', () => {
  const text = note({ kind: 'morph', a: 'bar_005', b: 'bar_006' });
  const w = applyPhraseWrite(text, { ...MORPH, bars: 9 });
  assert.equal(w.ok, true);
  assert.deepEqual(readPhraseNote((w as { text: string }).text), { ok: true, value: { ...MORPH, bars: 9 } });
  const ro = text.replace('content_type: json', 'content_type: json\nread_only: true');
  assert.equal(applyPhraseWrite(ro, MORPH).ok, false);
});

// ---- the helpers the strip uses -----------------------------------------------------------------------------------------

test('a position lives only while bars = 1: normalizeMorph adds 0 when it is missing and drops it otherwise', () => {
  assert.deepEqual(normalizeMorph({ ...MORPH, bars: 1 }), { ...MORPH, bars: 1, position: 0 });
  assert.deepEqual(normalizeMorph({ ...MORPH, bars: 1, position: 3 }), { ...MORPH, bars: 1, position: 3 });
  assert.deepEqual(normalizeMorph({ ...MORPH, bars: 4, position: 3 }), { ...MORPH, bars: 4 });
  assert.equal('position' in normalizeMorph({ ...MORPH, bars: 4, position: 3 }), false);
});

test('the seed and the position are written as whole numbers in range', () => {
  assert.equal(clampMorphSeed(-5), 0); assert.equal(clampMorphSeed(2.6), 3); assert.equal(clampMorphSeed(NaN), 0); assert.equal(clampMorphSeed(7), 7);
  assert.equal(clampMorphSeed(1e300), Number.MAX_SAFE_INTEGER);
  assert.equal(clampMorphPosition(-1, 4), 0); assert.equal(clampMorphPosition(9, 4), 4); assert.equal(clampMorphPosition(2.4, 4), 2); assert.equal(clampMorphPosition(NaN, 4), 0); assert.equal(clampMorphPosition(3, 0), 0);
});

test('morphEditCount: the cells with a hit in exactly one bar, over the union of the channels', () => {
  const a = bar({ kick: [0, 2, 3, 6, 8], snare: [4, 6, 12] });
  const b = bar({ kick: [0, 8], snare: [4, 12] });
  assert.equal(morphEditCount(a, b), 4);
  assert.equal(morphEditCount(b, a), 4, 'symmetric');
  assert.equal(morphEditCount(a, a), 0);
  assert.equal(morphEditCount(bar({ kick: [0] }), bar({ hihat: [0] })), 2, 'a channel only one bar has: its hits are edits, the other bar\'s hit on another channel too');
  assert.equal(morphEditCount(bar({ kick: [[0, 64]] }), bar({ kick: [[0, 127]] })), 0, 'a hit in both with different velocities is no edit');
  assert.equal(morphEditCount(bar({ kick: [0, 4] }), bar({ kick: [0, 4], snare: [] })), 0, 'an empty channel is no edit');
  const zeros = bar({ kick: [0, 4] }); zeros.channels.kick = zeros.channels.kick.map((v: unknown, i: number) => (v === false ? 0 : v)) as typeof zeros.channels.kick;
  assert.equal(morphEditCount(zeros, bar({ kick: [0, 4] })), 0, 'a 0 step is a rest, like false (the engine reads it so)');
});

// ---- the sentence --------------------------------------------------------------------------------------------------------

test('the sentence names the bars, the bar count, the number of single-hit changes and the order', () => {
  assert.equal(morphSentence(MORPH, 4), 'Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (musical order).');
  assert.equal(morphSentence(MORPH, 1), 'Morph from bar_005 to bar_006 in 5 bars: 1 single-hit change (musical order).');
  assert.equal(morphSentence(MORPH, 0), 'Morph from bar_005 to bar_006 in 5 bars: 0 single-hit changes (musical order).');
  assert.equal(morphSentence({ ...MORPH, order: 'seeded', seed: 3 }, 4), 'Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (seeded order, seed 3).');
  assert.equal(morphSentence({ ...MORPH, order: 'by_channel' }, 4), 'Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (by-channel order).');
  assert.equal(morphSentence(MORPH, null), 'Morph from bar_005 to bar_006 in 5 bars (musical order).', 'before the number of changes is known it leaves it out');
  assert.equal(morphSentence({ ...MORPH, bars: 1, position: 2 }, 4), 'Morph from bar_005 to bar_006: one bar, after 2 of 4 single-hit changes (musical order).');
  assert.equal(morphSentence({ ...MORPH, bars: 1, position: 2 }, null), 'Morph from bar_005 to bar_006: one bar, at step 2 (musical order).');
});

// ---- New morph from this bar ---------------------------------------------------------------------------------------------

test('"New morph from this bar" is offered exactly like "New mix from this bar": score-first vault, active file is a bar', () => {
  assert.equal(newMorphAvailable({ scoreFirst: true, activePath: 'bars/bar_005.md' }), true);
  assert.equal(newMorphAvailable({ scoreFirst: false, activePath: 'bars/bar_005.md' }), false);
  assert.equal(newMorphAvailable({ scoreFirst: true, activePath: 'phrases/phrase_001.md' }), false);
  assert.equal(newMorphAvailable({ scoreFirst: true, activePath: null }), false);
});

test('the new morph morphs from the active bar to the first OTHER bar, with the defaults, in the next free phrase name', () => {
  const plan = planNewMorph({ activePath: 'bars/bar_007.md', existingBasenames: ['phrase_001', 'phrase_003', 'README'], exists: () => false, barBasenames: ['bar_009', 'bar_007', 'bar_005', 'notes'] });
  assert.equal(plan.ok, true);
  const p = plan as { name: string; path: string; content: string; notice?: string };
  assert.equal(p.path, 'phrases/phrase_004.md');
  assert.equal(p.notice, undefined);
  assert.deepEqual(readPhraseNote(p.content), { ok: true, value: { kind: 'morph', a: 'bar_007', b: 'bar_005', bars: 5, order: 'musical', seed: 0 } });
  assert.match(p.content, /^description: ".*phrase_004 — a morph from bar_007 to bar_005/m);
  assert.equal(p.content, morphNoteContent('phrase_004', 'bar_007', 'bar_005'));
});

test('with only one bar the morph is that bar to itself, and says so; away from a bar it refuses naming why', () => {
  const one = planNewMorph({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_005'] });
  assert.equal(one.ok, true);
  assert.match((one as { notice: string }).notice, /only one bar in bars\/ \(bar_005\), so this morph is bar_005 to itself/);
  assert.deepEqual(planNewMorph({ activePath: 'notes/x.md', existingBasenames: [], exists: () => false, barBasenames: [] }), { ok: false, message: 'New morph: open a bar from bars/ first (the note you are on is not a bar).' });
});

test('createNewMorph runs the shared loop: makes the folder, creates the note, opens it; a taken name is retried', async () => {
  const made: string[] = []; const opened: string[] = []; const notices: string[] = [];
  let folder = false; let taken = true;
  const ports = {
    activePath: () => 'bars/bar_005.md', folderExists: () => folder, createFolder: async () => { folder = true; },
    listPhraseBasenames: () => [], listBarBasenames: () => ['bar_005', 'bar_006'], exists: () => false,
    create: async (p: string, c: string) => { if (taken) { taken = false; throw new Error('File already exists.'); } made.push(p, c); return p; },
    open: async (f: string) => { opened.push(f); }, notify: (m: string) => { notices.push(m); }, isAlreadyExists: (e: unknown) => /already exists/.test((e as Error).message),
  };
  const r = await createNewMorph(ports);
  assert.deepEqual(r, { ok: true, path: 'phrases/phrase_001.md' });
  assert.equal(folder, true);
  assert.deepEqual(opened, ['phrases/phrase_001.md']);
  assert.deepEqual(notices, []);
  const off = await createNewMorph({ ...ports, activePath: () => 'notes/x.md' });
  assert.deepEqual(off, { ok: false, message: 'New morph: open a bar from bars/ first (the note you are on is not a bar).' });
  assert.deepEqual(notices, ['New morph: open a bar from bars/ first (the note you are on is not a bar).']);
});

// ---- the Score of a morph --------------------------------------------------------------------------------------------------

const A = bar({ kick: [0, 2, 3, 6, 8], snare: [4, 6, 12] });
const B = bar({ kick: [0, 8], snare: [4, 12] }, { tempo_bpm: 120 });
function deps(over: Partial<{ files: Record<string, string>; compute: (data: unknown, params: PhraseParams, title: string) => Promise<unknown>; reads: string[] }> = {}) {
  const files: Record<string, string> = { 'bars/bar_005.md': barText(A), 'bars/bar_006.md': barText(B), ...(over.files ?? {}) };
  const reads: string[] = over.reads ?? [];
  const calls: Array<{ data: any; params: PhraseParams; title: string }> = [];
  return {
    reads, calls,
    deps: {
      readNote: async (p: string) => { reads.push(p); const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
      compute: over.compute ?? (async (data: unknown, params: PhraseParams, title: string) => { calls.push({ data: data as any, params, title }); return { type: 'musicxml', content: '<score-partwise/>' }; }),
    },
  };
}

test('the Score of a morph reads both bars FRESH (once each) and asks the engine for {a, b} with the phrase\'s parameters', async () => {
  const d = deps();
  const out = await producePhrase(d.deps, MORPH, 'phrase_004');
  assert.equal(out.kind, 'score');
  assert.deepEqual(d.reads, ['bars/bar_005.md', 'bars/bar_006.md']);
  assert.equal(d.calls.length, 1);
  assert.deepEqual(d.calls[0].params, MORPH);
  assert.equal(d.calls[0].data.a.tempo_bpm, 100);
  assert.equal(d.calls[0].data.b.tempo_bpm, 120);
  const same = deps();
  await producePhrase(same.deps, { ...MORPH, b: 'bar_005' }, 't');
  assert.deepEqual(same.reads, ['bars/bar_005.md'], 'a morph of a bar to itself reads it once');
});

test('a morph note goes through producePhraseNote like any phrase; a note that is wrong is the same refusal line', async () => {
  const d = deps();
  const ok = await producePhraseNote(d.deps, note({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 3 }), 'p');
  assert.equal(ok.kind, 'score');
  assert.deepEqual(d.calls[0].params, { ...MORPH, bars: 3 });
  assert.deepEqual(await producePhraseNote(d.deps, note({ kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 0 }), 'p'), { kind: 'refusal', message: 'Phrase: bars must be a whole number from 1 to 64, got 0.' });
});

test('a missing or unusable bar is a refusal naming which one (a or b) and why', async () => {
  const gone = await producePhrase(deps({ files: { 'bars/bar_006.md': '' } }).deps, { ...MORPH, b: 'bar_099' }, 't');
  assert.deepEqual(gone, { kind: 'refusal', message: 'Phrase: the bar for b, bar_099 (bars/bar_099.md), was not found or could not be read (File not found).' });
  const bad = await producePhrase(deps({ files: { 'bars/bar_005.md': 'not a note' } }).deps, MORPH, 't');
  assert.equal(bad.kind, 'refusal');
  assert.match((bad as { message: string }).message, /^Phrase: the bar for a, bar_005, is not usable: /);
});

test('a fork note is read FRESH, checked against bar a\'s grid (not bar b\'s), and handed to the engine as override_bars', async () => {
  const twelve: RhythmData = { time_signature: '4/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 12 }, (_, i) => i === 0 || i === 3) } };
  const fork16 = bar({ kick: [0, 1, 8] });
  const d = deps({ files: { 'bars/bar_009.md': barText(fork16), 'bars/bar_012.md': barText(twelve), 'bars/bar_007.md': barText(twelve) } });
  const ok = await producePhrase(d.deps, { ...MORPH, overrides: { '3': 'bars/bar_009' } }, 't');
  assert.equal(ok.kind, 'score');
  assert.deepEqual((d.calls[0].params as unknown as { override_bars: Record<string, unknown> }).override_bars['3'], fork16);
  assert.ok(d.reads.includes('bars/bar_009.md'));
  // bar a is 16 steps, bar b (here bar_007) and the fork are 12: the fork matches b's grid but not a's, and a's is the one that counts
  const odd = deps({ files: { 'bars/bar_007.md': barText(twelve), 'bars/bar_012.md': barText(twelve) } });
  const refused = await producePhrase(odd.deps, { ...MORPH, b: 'bar_007', overrides: { '3': 'bars/bar_012' } }, 't');
  assert.equal(refused.kind, 'refusal');
  assert.match((refused as { message: string }).message, /^Phrase: bar 3 \(bars\/bar_012\) differs from bar a bar_005 in steps \(it has 4\/4, 12 steps, group 4; the phrase has 4\/4, 16 steps, group 4\)\.$/);
  assert.equal(odd.calls.length, 0, 'the engine is never asked');
});

test('the engine\'s own morph_rhythm refusal (a position past the last change, two grids) is a refusal line; any other engine failure stays an error', async () => {
  const refuse = (msg: string) => deps({ compute: async () => { throw new Error(msg); } }).deps;
  const traceback = 'Traceback (most recent call last):\n  File "<exec>", line 3, in <module>\nValueError: morph_rhythm: position must be an int from 0 to 4, got 9\n';
  assert.deepEqual(await producePhrase(refuse(traceback), { ...MORPH, bars: 1, position: 9 }, 't'), { kind: 'refusal', message: 'Phrase: morph_rhythm: position must be an int from 0 to 4, got 9' });
  assert.deepEqual(await producePhrase(refuse('morph_rhythm: a and b must agree on steps, but a has 16 and b has 12'), MORPH, 't'), { kind: 'refusal', message: 'Phrase: morph_rhythm: a and b must agree on steps, but a has 16 and b has 12' });
  const other = await producePhrase(refuse('the engine fell over'), MORPH, 't');
  assert.equal(other.kind, 'error');
  assert.equal(morphRhythmRefusal('ValueError: mix_rhythm: weight must be…'), null, 'a mix refusal is not a morph refusal');
  assert.equal(morphRhythmRefusal('boom'), null);
});

// ---- evidence ------------------------------------------------------------------------------------------------------------------

test('evidence lines: what was written and what the engine returned; nothing for the other kinds', () => {
  assert.equal(morphTraceWritten(MORPH), '[forge-morph] wrote a=bar_005 b=bar_006 bars=5 order=musical seed=0');
  assert.equal(morphTraceWritten({ ...MORPH, bars: 1, order: 'seeded', seed: 2, position: 3 }), '[forge-morph] wrote a=bar_005 b=bar_006 bars=1 order=seeded seed=2 position=3');
  assert.equal(morphTraceWritten({ kind: 'mix', a: 'x', b: 'y', weight: 0.5, threshold: 0.5, ghost: false }), null);
  assert.equal(morphTraceWritten({ kind: 'extend', source: 'x', bars: 4, style: 'building', tempo_change_pct: 0 }), null);
  assert.equal(morphTraceEngine(MORPH, { morph_info: { d: 4, bars: 5, edits: [] } }), '[forge-morph] engine asked a=bar_005 b=bar_006 bars=5 order=musical seed=0 -> bars 5, d 4');
  assert.equal(morphTraceEngine(MORPH, { content: 'x' }), '[forge-morph] engine asked a=bar_005 b=bar_006 bars=5 order=musical seed=0 -> no morph info');
  assert.equal(morphTraceEngine(MORPH, null), '[forge-morph] engine asked a=bar_005 b=bar_006 bars=5 order=musical seed=0 -> no morph info');
  assert.equal(morphTraceEngine({ kind: 'mix', a: 'x', b: 'y', weight: 0.5, threshold: 0.5, ghost: false }, { morph_info: { d: 1, bars: 1 } }), null);
});
