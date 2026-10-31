// 2026-10-30-1050 (M15b, design 4.14) - the CONTROLS WRITE THE DESCRIPTION; the json fence is a cache. A phrase or arrangement note carries the Forge source chain (`source_facet: description`, the three hashes and the two derived-from
// stamps); `# Description` is the grammar's sentence for the note's params, `# Recipe` and `# Python` derive from them, the json is a CACHE no reader had to change for. Everything here is HEADLESS and runs the production functions:
//   * the round trip on EVERY writer path (New phrase / mix / morph / transform / arrangement, the strip's control write, the fork write, Re-run, the sentence dialogs, the arrangement controls, Refresh note links): the Description
//     the note carries parses back to the same params as its json, and describe(params) is that Description, byte for byte;
//   * freshness through the REUSED functions (`sourceLayerStatusOf`, `computeFacetStates`, the stale-facet plugin and the status bar read that one function): a fresh note has no stale facet, a changed word in the Description does;
//   * a control never overwrites a Description that was edited by hand (one sentence, the note untouched), and a whitespace-only change is not an edit;
//   * Refresh note links rewrites an old note into the new shape (idempotent, the json byte-identical, the person's own frontmatter kept);
//   * the ONE renderer is the only way a phrase or arrangement note is written (a mechanism pin).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  MORPH_ORDERS, PHRASE_STYLES, TRANSFORM_KEEPS, applyPhraseWrite, formatPhraseJson, mixNoteContent, morphNoteContent, noteContentFor, phraseNoteContent, readPhraseNote, refreshPhraseNoteText, transformNoteContent, validatePhrase,
  type PhraseParams, type TransformOp,
} from './phrase-core.ts';
import { applyArrangementWrite, applySettingsPatches, formatArrangementJson, newArrangementNote, readArrangementNote, refreshArrangementNoteText, validateArrangement, type ArrangementParams } from './arrangement-core.ts';
import { descriptionEditedByHand, extractPhraseJsonBlock, sourceChainStamps, SOURCE_CHAIN_KEYS } from './phrase-notes-core.ts';
import { canonical, describe, parse, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { sourceLayerStatusOf } from './source-layer-status-of-body-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';
import { facetSha } from './test-support/source-chain-golden.ts';

// ---- a seeded generator of valid params (small, deterministic: the same cases on every run) -------------------------------------------------------------------------------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
const BARS = Array.from({ length: 12 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`);
const PHRASES = ['phrase_001', 'phrase_002', 'phrase_006'];
const ARRS = ['arr_001', 'arr_002'];
const KITS = ['rock', 'latin', 'jazz'];
const VAULT: GrammarVault = { bars: BARS, phrases: PHRASES, arrangements: ARRS, kits: KITS };
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const two = (r: () => number): number => Math.round(r() * 100) / 100;
function forks(r: () => number, bars: number): Record<string, string> | undefined {
  if (r() < 0.6) return undefined;
  const out: Record<string, string> = {};
  for (let i = 0; i < int(r, 1, 3); i++) out[String(int(r, 1, bars))] = `bars/${pick(r, BARS)}`;
  return out;
}
function genOp(r: () => number): TransformOp {
  const first = int(r, 1, 6), last = first + int(r, 0, 4);
  const row = r() < 0.5 ? pick(r, ['kick', 'snare', 'hihat']) : undefined;
  const base = { first, last, ...(row !== undefined ? { row } : {}) };
  if (r() < 0.4) return { op: 'double_up', ...base, grid: pick(r, [4, 8, 16, 32]) };
  return r() < 0.3 ? { op: 'thin_out', ...base, amount: two(r), keep: 'seeded', seed: int(r, 0, 99) } : { op: 'thin_out', ...base, amount: pick(r, [0.5, 0.25, 1, two(r)]) };
}
function genPhrase(r: () => number, kind: PhraseParams['kind']): PhraseParams {
  if (kind === 'extend') { const bars = int(r, 1, 16); return { kind, source: pick(r, BARS), bars, style: pick(r, PHRASE_STYLES), tempo_change_pct: pick(r, [0, 0, -20, 15, 12.5, int(r, -90, 100)]), ...(() => { const o = forks(r, bars); return o ? { overrides: o } : {}; })() }; }
  if (kind === 'mix') {
    const a = pick(r, BARS), b = pick(r, BARS.filter((x) => x !== a));
    const common = { kind, a, b, weight: pick(r, [0, 1, 0.5, 0.7, two(r)]), threshold: pick(r, [0.5, 0.4, two(r)]), ghost: r() < 0.5 } as const;
    if (r() < 0.5) return common;
    const order = pick(r, MORPH_ORDERS);
    return { ...common, mode: 'path', order, seed: order === 'seeded' ? int(r, 0, 99) : 0 };
  }
  if (kind === 'morph') {
    const bars = pick(r, [1, 5, 8, int(r, 2, 20)]);
    const order = pick(r, MORPH_ORDERS);
    const a = pick(r, BARS), b = pick(r, BARS);
    return { kind, a, b, bars, order, seed: order === 'seeded' ? int(r, 0, 99) : 0, ...(bars === 1 ? { position: int(r, 0, 3) } : {}), ...(() => { const o = forks(r, bars); return o ? { overrides: o } : {}; })() };
  }
  const source = r() < 0.5 ? `phrases/${pick(r, PHRASES)}` : `arrangements/${pick(r, ARRS)}`;
  return { kind: 'transform', source, ops: Array.from({ length: int(r, 1, 3) }, () => genOp(r)), ...(() => { const o = forks(r, 8); return o ? { overrides: o } : {}; })() };
}
function genArrangement(r: () => number): ArrangementParams {
  const kits = [...KITS].sort(() => r() - 0.5).slice(0, int(r, 1, 3));
  return { kind: 'arrangement', tracks: kits.map((kit) => ({ kit, phrase: pick(r, PHRASES), ...(r() < 0.3 ? { mute: true } : {}), ...(r() < 0.2 ? { solo: true } : {}), ...(r() < 0.4 ? { volume: int(r, 0, 100) } : {}) })) };
}

const KINDS: Array<PhraseParams['kind']> = ['extend', 'mix', 'morph', 'transform'];
const CASES = 120;

// ---- the properties every note written by any path must have --------------------------------------------------------------------------------------------------------------------------------------------------------------

async function assertChain(note: string, p: GrammarParams, label: string): Promise<void> {
  // the cache is the json of the params, the Description is the grammar's sentence for them, and the sentence parses back to the params the json carries
  const sentence = extractDescription(note);
  assert.equal(sentence, describe(p), `${label}: the Description is describe(params)`);
  const back = parse(sentence, VAULT);
  assert.ok(back.ok, `${label}: the Description parses (${back.ok ? '' : back.error.message})`);
  if (back.ok) assert.deepEqual(back.params, canonical(p), `${label}: ... back to the params the json holds`);
  // the stamps are the ones the plugin computes from the finished text with its own extractors, and no facet is stale by the functions every Forge note is judged by
  const fields = parseFrontmatter(note)!.fields;
  const stamps = sourceChainStamps(note);
  for (const key of SOURCE_CHAIN_KEYS) assert.equal(fields[key], stamps[key], `${label}: ${key}`);
  assert.equal(fields.source_facet, 'description', label);
  assert.equal(fields.recipe_derived_from_description_hash, fields.description_hash, label);
  assert.equal(fields.python_derived_from_recipe_hash, fields.recipe_hash, label);
  const status = await sourceLayerStatusOf(note);
  assert.equal(status.isV2, true, label);
  assert.equal(status.effective, 'description', label);
  assert.deepEqual(status.staleFacets, [], `${label}: nothing is stale`);
  assert.deepEqual(status.states, { description: 'source', recipe: 'derived_from_description', python: 'derived_from_recipe' }, label);
  assert.equal(descriptionEditedByHand(note), false, label);
}

test('NEW phrase / mix / morph / transform, every kind over a seeded table: the cache is the params\' json byte for byte, the Description parses back to them, the stamps are the plugin\'s own hashes, nothing is stale', async () => {
  for (const kind of KINDS) {
    const r = rng(1050 + kind.length);
    for (let i = 0; i < CASES; i++) {
      const p = genPhrase(r, kind);
      assert.ok(validatePhrase(p).ok, `the generator makes valid params: ${JSON.stringify(p)}`);
      const note = noteContentFor('phrase_007', p);
      const read = readPhraseNote(note);
      assert.ok(read.ok, `${kind} #${i}`);
      const block = extractPhraseJsonBlock(note);
      assert.ok(block.ok);
      if (block.ok) assert.equal(note.slice(block.contentStart, block.contentEnd), formatPhraseJson(p), `${kind} #${i}: the cache is formatPhraseJson(params)`);
      await assertChain(note, p, `${kind} #${i} ${JSON.stringify(p)}`);
    }
  }
});

test('the STRIP\'s control write (Weight, Bars, Order, Seed, Position, Threshold, Ghost, Style, Tempo, a fork): the note after the write IS the note a new phrase of the new params would be, byte for byte, and its Description says the new params', async () => {
  for (const kind of KINDS) {
    const r = rng(77 + kind.length);
    for (let i = 0; i < CASES; i++) {
      const before = genPhrase(r, kind), after = genPhrase(r, kind);
      const w = applyPhraseWrite(noteContentFor('phrase_007', before), after, 'phrase_007');
      assert.ok(w.ok, `${kind} #${i}`);
      if (!w.ok) continue;
      assert.equal(w.text, noteContentFor('phrase_007', after), `${kind} #${i}: written == made new`);
      await assertChain(w.text, after, `${kind} #${i} write`);
      const again = applyPhraseWrite(w.text, after, 'phrase_007');
      assert.ok(again.ok && again.text === w.text, `${kind} #${i}: writing what is there changes no byte`);
    }
  }
});

test('ARRANGEMENTS: New arrangement, the controls row (Mute, Solo, Volume) and the full write all give a note whose Description parses back to the tracks, with the stamps and nothing stale', async () => {
  const r = rng(4242);
  for (let i = 0; i < CASES; i++) {
    const before = genArrangement(r), after = genArrangement(r);
    assert.ok(validateArrangement(after).ok);
    const made = newArrangementNote('arr_001', before);
    await assertChain(made, before, `arrangement #${i} new`);
    const w = applyArrangementWrite(made, 'arr_001', after);
    assert.ok(w.ok);
    if (!w.ok) continue;
    assert.equal(w.text, newArrangementNote('arr_001', after), `arrangement #${i}: written == made new`);
    await assertChain(w.text, after, `arrangement #${i} write`);
    const patched = applySettingsPatches(made, 'arr_001', [[0, { mute: true }], [0, { volume: 70 }], [0, { solo: true }], [0, { mute: false }]]);
    assert.ok(patched.ok);
    if (patched.ok) {
      const read = readArrangementNote(patched.text);
      assert.ok(read.ok);
      if (read.ok) await assertChain(patched.text, read.value, `arrangement #${i} patched`);
    }
  }
});

test('the other entry points: New mix / New morph (with made_from), a transform made by the notebook (Run, Re-run) and the starter extend all carry the chain; the person\'s own starter lines stay', async () => {
  const mix = mixNoteContent('phrase_002', 'bar_005', 'bar_006');
  await assertChain(mix, (readPhraseNote(mix) as { value: PhraseParams }).value, 'new mix');
  const morph = morphNoteContent('phrase_003', 'bar_001', 'bar_002', { from: 'phrase_002', bars: 7 });
  await assertChain(morph, (readPhraseNote(morph) as { value: PhraseParams }).value, 'new morph');
  assert.match(morph, /\nmade_from: "\[\[phrase_002\]\]"\n/, 'made_from stays');
  const ops: TransformOp[] = [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }];
  const transform = transformNoteContent('phrase_010', 'phrases/phrase_006', ops);
  await assertChain(transform, { kind: 'transform', source: 'phrases/phrase_006', ops }, 'new transform');
  const extend = phraseNoteContent('phrase_001', 'bar_005');
  await assertChain(extend, (readPhraseNote(extend) as { value: PhraseParams }).value, 'new extend');
});

// ---- freshness: through the reused functions -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('freshness is the plugin\'s own: a changed word in the Description makes the Recipe and the Python out of date, an edited Recipe makes the Python out of date, a whitespace-only change to the Description is no change; the json cache is not a facet', async () => {
  const note = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: 0 });
  assert.deepEqual((await sourceLayerStatusOf(note)).staleFacets, []);
  const word = await sourceLayerStatusOf(note.replace('Extend [[bar_005]] to 8 bars', 'Extend [[bar_005]] to 9 bars'));
  assert.deepEqual(word.staleFacets, ['recipe', 'python']);
  assert.equal(word.effective, 'description');
  const recipe = await sourceLayerStatusOf(note.replace('Take [[bar_005]].', 'Take [[bar_006]].'));
  assert.deepEqual(recipe.staleFacets, ['python']);
  const spaces = note.replace('# Description\n\n', '# Description\n\n\n').replace('building up.\n', 'building up.   \n');
  assert.deepEqual((await sourceLayerStatusOf(spaces)).staleFacets, [], 'blank lines and trailing blanks are not an edit (the normalization every Forge hash uses)');
  assert.equal(descriptionEditedByHand(spaces), false);
  assert.equal(descriptionEditedByHand(note.replace('Extend [[bar_005]] to 8 bars', 'Extend [[bar_005]] to 9 bars')), true);
});

test('non-vacuity: the stamps are the HASH of the facet, not a constant - each of the six moves when its facet moves (the golden helper computes them with node:crypto, apart from the writer)', () => {
  const a = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: 0 });
  const b = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 9, style: 'building', tempo_change_pct: 0 });
  const fa = parseFrontmatter(a)!.fields, fb = parseFrontmatter(b)!.fields;
  for (const key of ['description_hash', 'recipe_hash', 'python_hash', 'recipe_derived_from_description_hash', 'python_derived_from_recipe_hash'] as const) assert.notEqual(fa[key], fb[key], key);
  assert.equal(fa.description_hash, facetSha('Extend [[bar_005]] to 8 bars, building up.'));
  assert.equal(fa.source_facet, fb.source_facet);
});

// ---- a control never overwrites a hand edit -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const EDITED = 'Not saved: the Description was edited by hand; press Update from Description first or revert it.';

test('a control write on a note whose Description was edited by hand is REFUSED in one sentence and the note is not touched; revert the Description and the write goes through', () => {
  const p: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false };
  const note = noteContentFor('phrase_002', p);
  const edited = note.replace('70 percent [[bar_005]]', '80 percent [[bar_005]]');
  assert.notEqual(edited, note);
  assert.deepEqual(applyPhraseWrite(edited, { ...p, weight: 0.3 }, 'phrase_002'), { ok: false, message: EDITED });
  const reverted = edited.replace('80 percent [[bar_005]]', '70 percent [[bar_005]]');
  const ok = applyPhraseWrite(reverted, { ...p, weight: 0.3 }, 'phrase_002');
  assert.ok(ok.ok && ok.text === noteContentFor('phrase_002', { ...p, weight: 0.3 }));
  assert.deepEqual(refreshPhraseNoteText(edited, 'phrase_002'), { ok: false, message: 'The Description was edited by hand; press Update from Description first or revert it.' });
  // the legacy fence-only write (no name) is not a control write: it never touched the Description and still does not look at it
  const bare = applyPhraseWrite(edited, { ...p, weight: 0.3 });
  assert.ok(bare.ok && bare.text.includes('"weight": 0.3'));
});

test('the same for an arrangement: the controls row and the full write are refused, in the bare sentence the notice leads with; Refresh note links too', () => {
  const p: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002' }] };
  const note = newArrangementNote('arr_001', p);
  const edited = note.replace('Together.', 'Together, loudly.');
  const sentence = 'The Description was edited by hand; press Update from Description first or revert it.';
  assert.deepEqual(applySettingsPatches(edited, 'arr_001', [[0, { mute: true }]]), { ok: false, message: sentence });
  assert.deepEqual(applyArrangementWrite(edited, 'arr_001', p), { ok: false, message: sentence });
  assert.deepEqual(refreshArrangementNoteText(edited, 'arr_001'), { ok: false, message: sentence });
  const ok = applySettingsPatches(edited.replace('Together, loudly.', 'Together.'), 'arr_001', [[0, { mute: true }]]);
  assert.ok(ok.ok && ok.changed);
});

test('a note written BEFORE the source chain (no description_hash) has nothing to disagree with: a control write brings it to the new shape, whatever its old Description said', async () => {
  const OLD = '---\ntype: data\ncontent_type: json\ndescription: "phrase_003 — old."\nread_only: false\n---\n\n## Description\n\nsomething somebody typed\n\n## Recipe\n\nmorph_rhythm([[bar_007]], [[bar_001]], bars=8, order="musical", seed=0)\n\n```json\n' + formatPhraseJson({ kind: 'morph', a: 'bar_007', b: 'bar_001', bars: 8, order: 'musical', seed: 0 }) + '\n```\n';
  const p: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_001', bars: 6, order: 'musical', seed: 0 };
  const w = applyPhraseWrite(OLD, p, 'phrase_003');
  assert.ok(w.ok);
  if (w.ok) { await assertChain(w.text, p, 'upgraded by a control'); assert.ok(w.text.includes('read_only: false'), 'the person\'s own line stays'); }
});

// ---- Refresh note links: the migration ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const OLD_1260 = (json: string) => `---\ntype: data\ncontent_type: json\ndescription: "phrase_003 — a morph from [[bar_003]] to [[bar_001]] in 8 bars, musical order."\nlinks:\n  - "[[bar_003]]"\n  - "[[bar_001]]"\nread_only: false\n---\n\n<!-- derived from the json below; edit the controls, not this text -->\n\n## Description\n\nphrase_003 — a morph from [[bar_003]] to [[bar_001]] in 8 bars, musical order.\n\n## Recipe\n\nmorph_rhythm([[bar_003]], [[bar_001]], bars=8, order="musical", seed=0)\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const OLD_1020 = (json: string) => `---\ntype: data\ncontent_type: json\ndescription: "phrase_003 — a morph from [[bar_003]] to [[bar_001]] in 8 bars, musical order."\nlinks:\n  - "[[bar_003]]"\n  - "[[bar_001]]"\n---\n\n<!-- derived from the json below; edit the controls, not this text -->\n\n# Description\n\nphrase_003 — a morph from [[bar_003]] to [[bar_001]] in 8 bars, musical order.\n\n# Recipe\n\nTake [[bar_003]] and [[bar_001]].\nMorph from the first to the second over 8 bars, in musical order.\n\n# Python\n\n\`\`\`python\ndef compute(context):\n  a = bar_003()\n  b = bar_001()\n  return rhythm_bars_to_stream(bars=morph_rhythm(a=a, b=b, bars=8, order='musical', seed=0))\n\`\`\`\n\n\`\`\`json\n${json}\n\`\`\`\n`;

test('Refresh note links on OLD notes (the 1260 shape with ## headings, the 1020 shape without hashes): the new shape, the json fence byte-identical, the person\'s own frontmatter kept, nothing stale, a second run changes nothing', async () => {
  const p: PhraseParams = { kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 8, order: 'musical', seed: 0 };
  // the json exactly as an older plugin (or a person) wrote it: key order and spacing of its own, NOT formatPhraseJson's
  const odd = '{"kind": "morph", "a": "bar_003", "b": "bar_001", "bars": 8, "order": "musical", "seed": 0}';
  for (const [label, old] of [['1260', OLD_1260(formatPhraseJson(p))], ['1020', OLD_1020(formatPhraseJson(p))], ['1260 json spaced by hand', OLD_1260(odd)]] as const) {
    const r = refreshPhraseNoteText(old, 'phrase_003');
    assert.ok(r.ok && r.changed, label);
    if (!r.ok) continue;
    assert.equal(r.text.slice(r.text.indexOf('```json')), old.slice(old.indexOf('```json')), `${label}: the cache is the old json, byte for byte (and everything after it)`);
    await assertChain(r.text, p, label);
    if (label.startsWith('1260')) assert.ok(r.text.includes('read_only: false'), `${label}: the person's own line stays`);
    const again = refreshPhraseNoteText(r.text, 'phrase_003');
    assert.ok(again.ok && !again.changed && again.text === r.text, `${label}: a second run changes nothing`);
  }
});

test('Refresh note links on an old ARRANGEMENT note: the new shape, the fence byte-identical, idempotent', async () => {
  const p: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 70 }] };
  const old = `---\ntype: data\ncontent_type: json\ndescription: "arr_001 — old"\nlinks:\n  - "[[phrase_001]]"\n---\n\n<!-- derived from the json below; edit the controls, not this text -->\n\n# Description\n\narr_001 — old\n\n# Recipe\n\nPlay [[phrase_001]] on the [[rock]] kit.\nTogether.\n\n# Python\n\n\`\`\`python\ndef compute(context):\n  return None\n\`\`\`\n\n\`\`\`json\n${formatArrangementJson(p)}\n\`\`\`\n`;
  const r = refreshArrangementNoteText(old, 'arr_001');
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.equal(r.text.slice(r.text.indexOf('```json')), old.slice(old.indexOf('```json')));
  await assertChain(r.text, p, 'old arrangement');
  const again = refreshArrangementNoteText(r.text, 'arr_001');
  assert.ok(again.ok && !again.changed && again.text === r.text);
});

test('the stamps stay where they are and the person\'s lines stay in their order: a note whose own line comes AFTER the stamps is already current (no churn), a stamp the person deleted comes back at the end', () => {
  const note = noteContentFor('phrase_001', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
  const withTags = note.replace('\n---\n\n<!--', '\ntags: [demo]\n---\n\n<!--');
  assert.ok(withTags.includes('python_derived_from_recipe_hash:') && withTags.includes('tags: [demo]\n---'));
  const r = refreshPhraseNoteText(withTags, 'phrase_001');
  assert.ok(r.ok && !r.changed && r.text === withTags, 'nothing to change, nothing written');
  const twice = withTags.replace('python_hash:', 'python_hash: 0000\npython_hash:');
  const dedup = refreshPhraseNoteText(twice, 'phrase_001');
  assert.ok(dedup.ok && dedup.changed && dedup.text === withTags, 'a stamp written twice is one again, the right one');
  const noPython = withTags.replace(/^python_hash: .*\n/m, '');
  const back = refreshPhraseNoteText(noPython, 'phrase_001');
  assert.ok(back.ok && back.changed);
  if (back.ok) {
    const lines = back.text.slice(4, back.text.indexOf('\n---', 4)).split('\n');
    assert.equal(lines.filter((l) => l.startsWith('python_hash:')).length, 1);
    assert.ok(lines.indexOf('tags: [demo]') < lines.indexOf(lines.find((l) => l.startsWith('python_hash:'))!), 'the missing stamp is added at the end, after the person\'s line');
  }
});

// ---- the choke point -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('MECHANISM PIN 2026-10-30-1050 (if the design moves this SHOULD go red: reassess, do not just rewrite): the ONE renderer - renderSourceChainNote - is how a phrase and an arrangement note are written; only kits still use renderDerivedNote; no module outside phrase-notes-core.ts hashes a facet for a note by hand', () => {
  const dir = import.meta.dirname;
  const production = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
  const calling = (name: string) => production.filter((f) => new RegExp(`\\b${name}\\(`).test(read(f)) && !new RegExp(`function ${name}\\b`).test(read(f))).sort();
  assert.deepEqual(calling('renderDerivedNote'), ['kit-core.ts'], 'phrases and arrangements do not render by the old derived-sections path');
  assert.deepEqual(calling('renderSourceChainNote'), ['arrangement-core.ts', 'composition-core.ts'], 'arrangements and (M17b, deliberate) compositions go through the one renderer ...');
  assert.match(read('phrase-notes-core.ts'), /export function renderPhraseNote\([^)]*\): string \{\s*return renderSourceChainNote\(/, '... and so do phrases (renderPhraseNote is its one-line caller)');
  assert.deepEqual(production.filter((f) => /\bfacetHashSync\(/.test(read(f))).sort(), ['facet-sync-hash-core.ts', 'phrase-notes-core.ts'], 'the synchronous hash is used by the note renderer only');
  const src = read('phrase-notes-core.ts');
  assert.ok(!/derivedSections/.test(src), 'the old sections builder is gone');
  assert.match(src, /extractDescription\(finished\)/, 'the stamps are taken from the FINISHED text with the plugin\'s own extractors');
});

test('the keys the chain owns are exactly the six Forge fields, in the order they are written; TRANSFORM_KEEPS / PHRASE_STYLES are still the lists the generator draws from (a new style would be exercised here)', () => {
  assert.deepEqual([...SOURCE_CHAIN_KEYS], ['source_facet', 'description_hash', 'recipe_hash', 'python_hash', 'recipe_derived_from_description_hash', 'python_derived_from_recipe_hash']);
  assert.ok(PHRASE_STYLES.length >= 3 && TRANSFORM_KEEPS.length >= 2);
});

test('the DRY-RUN script over a vault writes nothing: it opens no file for writing, and it reports the verdict per note (a pin on the script, and a run over a temporary vault with the files compared before and after)', async () => {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const script = path.resolve(import.meta.dirname, '../scripts/dev/refresh-dry-run.ts');
  const text = fs.readFileSync(script, 'utf8');
  assert.ok(!/writeFile|appendFile|createWriteStream|openSync|renameSync|unlinkSync|rmSync|mkdirSync|copyFile/.test(text), 'the script has no way to write');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-dry-run-'));
  try {
    for (const d of ['phrases', 'bars']) fs.mkdirSync(path.join(root, d));
    fs.writeFileSync(path.join(root, 'bars/bar_005.md'), '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n');
    const p = { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: 0 } as const;
    fs.writeFileSync(path.join(root, 'phrases/phrase_001.md'), noteContentFor('phrase_001', p));                                  // current
    fs.writeFileSync(path.join(root, 'phrases/phrase_002.md'), `---\ntype: data\ncontent_type: json\nread_only: false\n---\n\n## Description\n\nold\n\n\`\`\`json\n${formatPhraseJson(p)}\n\`\`\`\n`);   // old
    fs.writeFileSync(path.join(root, 'phrases/phrase_003.md'), noteContentFor('phrase_003', p).replace('Extend [[bar_005]] to 8 bars', 'Extend [[bar_005]] to 9 bars'));      // hand-edited Description
    const snapshot = () => fs.readdirSync(path.join(root, 'phrases')).map((f) => [f, fs.readFileSync(path.join(root, 'phrases', f), 'utf8')]);
    const before = snapshot();
    const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    assert.equal(run.status, 1, 'one note is refused, so the exit is non-zero');
    assert.match(run.stdout, /phrases\/phrase_001\.md\s+already current\s+yes\s+yes\s+yes\s+yes\s+none/);
    assert.match(run.stdout, /phrases\/phrase_002\.md\s+would update\s+yes\s+yes\s+yes\s+yes\s+none/);
    assert.match(run.stdout, /phrases\/phrase_003\.md\s+REFUSED: The Description was edited by hand; press Update from Description first or revert it\./);
    assert.match(run.stdout, /3 note\(s\) looked at, 1 problem\(s\)\. Nothing was written\./);
    assert.deepEqual(snapshot(), before, 'not a byte of the vault changed');
    assert.equal(spawnSync(process.execPath, [script, path.join(root, 'nope')], { encoding: 'utf8' }).status, 2, 'no such vault: a usage error');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
