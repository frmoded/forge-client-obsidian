// score_first M9 (drain 2026-10-23-0330) — modify ONE bar of an extend phrase: fork on edit. The phrase stays parameters only; `overrides` names the fork notes (`bars/bar_NNN`) that stand in for generated bars.
// The pure core, with the vault and the UI injected: the data model and its refusals, the fork note, the Score of a phrase with overrides (fresh reads, grid checks, the engine call), the "Edit this bar" /
// "Revert to generated" actions (atomic, no deletions), and the Inspector stack of a forked bar.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatPhraseJson, producePhrase, validatePhrase, type ExtendPhrase } from './phrase-core.ts';
import { editThisBar, forkNoteContent, forkable, revertThisBar, withOverride, withoutOverride } from './phrase-fork-core.ts';
import { phraseLineageOf, phraseProvenance } from './phrase-lineage-core.ts';
import { applySave, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const BASE: ExtendPhrase = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const bar = (kick: number[], over: Partial<RhythmData> = {}): RhythmData => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => kick.includes(i)) }, ...over } as RhythmData);
const note = (data: unknown, fm = 'type: data\ncontent_type: json') => `---\n${fm}\n---\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;

// ---- the data model ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('overrides are optional: without them everything is as before, and the JSON text is byte-for-byte the M5 text', () => {
  assert.deepEqual(validatePhrase(BASE), { ok: true, value: BASE });
  assert.equal(formatPhraseJson(BASE), '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 8,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": -20\n}');
  assert.deepEqual(validatePhrase({ ...BASE, overrides: {} }), { ok: true, value: BASE }, 'an empty object is no override at all');
});

test('a valid override is read back and written after the other fields, one line per bar', () => {
  const v = validatePhrase({ ...BASE, overrides: { '3': 'bars/bar_009' } });
  assert.deepEqual(v, { ok: true, value: { ...BASE, overrides: { '3': 'bars/bar_009' } } });
  assert.equal(formatPhraseJson({ ...BASE, overrides: { '3': 'bars/bar_009', '5': 'bars/bar_010' } }), '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 8,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": -20,\n  "overrides": {\n    "3": "bars/bar_009",\n    "5": "bars/bar_010"\n  }\n}');
});

test('refused, each naming overrides and the bad key or value: not an object, a key that is not a bar number of this phrase, a value that is not a bar note', () => {
  const cases: Array<[unknown, RegExp]> = [
    [[], /overrides/], ['bars/bar_009', /overrides/], [null, /overrides/],
    [{ '0': 'bars/bar_009' }, /overrides.*"0"/], [{ '9': 'bars/bar_009' }, /overrides.*"9".*1 to 8/], [{ '2.5': 'bars/bar_009' }, /overrides.*"2.5"/], [{ three: 'bars/bar_009' }, /overrides.*"three"/], [{ '03': 'bars/bar_009' }, /overrides.*"03"/],
    [{ '3': 'bar_009' }, /overrides.*bar 3/], [{ '3': 'bars/bar_009.md' }, /overrides.*bar 3/], [{ '3': '../bars/bar_009' }, /overrides.*bar 3/], [{ '3': 'phrases/phrase_001' }, /overrides.*bar 3/], [{ '3': 7 }, /overrides.*bar 3/], [{ '3': null }, /overrides.*bar 3/],
  ];
  for (const [overrides, re] of cases) {
    const v = validatePhrase({ ...BASE, overrides });
    assert.equal(v.ok, false, JSON.stringify(overrides));
    if (v.ok === false) assert.match(v.message, re, JSON.stringify(overrides));
  }
  assert.equal(validatePhrase({ ...BASE, bars: 4, overrides: { '5': 'bars/bar_009' } }).ok, false, 'in range of THIS phrase\'s bars');
  assert.equal(validatePhrase({ kind: 'mix', a: 'bar_005', b: 'bar_006', overrides: {} }).ok, false, 'a mix has one bar: no overrides');
});

test('withOverride / withoutOverride are pure; the last revert removes the key so the phrase is exactly what it was', () => {
  const forked = withOverride(BASE, 3, 'bars/bar_009');
  assert.deepEqual(forked.overrides, { '3': 'bars/bar_009' });
  assert.equal(BASE.overrides, undefined, 'the input is not touched');
  const two = withOverride(forked, 5, 'bars/bar_010');
  assert.deepEqual(two.overrides, { '3': 'bars/bar_009', '5': 'bars/bar_010' });
  assert.deepEqual(withoutOverride(two, 3).overrides, { '5': 'bars/bar_010' });
  assert.deepEqual(withoutOverride(forked, 3), BASE);
  assert.equal('overrides' in withoutOverride(forked, 3), false);
  assert.equal(formatPhraseJson(withoutOverride(forked, 3)), formatPhraseJson(BASE));
  assert.equal(forkable(BASE, 3), true);
  assert.equal(forkable(forked, 3), false, 'a bar that is already a fork has no Edit this bar');
  assert.equal(forkable(forked, 4), true);
});

// ---- the fork note -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the fork note is an ordinary rhythm data note the Beat Box opens, holding that bar\'s data, with the lineage line in the FRONTMATTER (the body must be exactly one json block)', () => {
  const data = bar([0, 3, 8]);
  const text = forkNoteContent('bar_009', 'phrases/phrase_001', 3, data);
  assert.match(text, /^---\ntype: data\ncontent_type: json\n/);
  assert.match(text, /\nforked_from: "\[\[phrase_001\]\]"\nforked_bar: 3\n/);
  assert.match(text, /\ndescription: ".*bar_009.*phrase_001.*bar 3.*"\n/);
  const read = readRhythmNote(text);
  assert.equal(read.ok, true, read.ok ? '' : read.message);
  if (read.ok) assert.deepEqual(read.value.data, data);
  assert.ok(text.endsWith('```\n'));
});

test('the Beat Box\'s own save (applySave) keeps the lineage line: only the json block changes', () => {
  const data = bar([0, 3, 8]);
  const text = forkNoteContent('bar_009', 'phrases/phrase_001', 3, data);
  const read = readRhythmNote(text);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const saved = applySave(text, read.value.fingerprint, bar([0, 4, 8]));
  assert.equal(saved.ok, true);
  if (saved.ok) { assert.match(saved.text, /\nforked_from: "\[\[phrase_001\]\]"\nforked_bar: 3\n/); assert.equal((readRhythmNote(saved.text) as { value: { data: RhythmData } }).value.data.channels.kick[4], true); }
});

// ---- the Score of a phrase with overrides ----------------------------------------------------------------------------------------------------------------------------------------------

const SOURCE = note(bar([0, 8]));
const FORK = note(bar([0, 3, 8], { tempo_bpm: 140 }));
const OVER: ExtendPhrase = { ...BASE, overrides: { '3': 'bars/bar_009' } };
const ok = async () => ({ type: 'musicxml', content: '<score-partwise/>' });

test('producePhrase with overrides reads the fork notes FRESH and hands their data to the engine as override_bars; the extend\'s own call is exactly what it was', async () => {
  const reads: string[] = []; const seen: Array<{ data: any; params: any }> = [];
  const out = await producePhrase({ readNote: async (p) => { reads.push(p); return p === 'bars/bar_009.md' ? FORK : SOURCE; }, compute: async (data, params) => { seen.push({ data, params }); return ok(); } }, OVER, 'phrase_001');
  assert.equal(out.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md', 'bars/bar_009.md']);
  assert.equal(seen[0].data.tempo_bpm, 100, 'the SOURCE bar still goes in as the seed');
  assert.deepEqual(Object.keys(seen[0].params.override_bars), ['3']);
  assert.equal(seen[0].params.override_bars['3'].tempo_bpm, 140, 'the fork\'s own data, tempo included');
  assert.equal(seen[0].params.overrides['3'], 'bars/bar_009');
  // without overrides: the params object is the validated phrase and nothing more
  const plain: any[] = [];
  await producePhrase({ readNote: async () => SOURCE, compute: async (_d, params) => { plain.push(params); return ok(); } }, BASE, 'phrase_001');
  assert.deepEqual(plain[0], BASE);
  assert.equal('override_bars' in plain[0], false);
});

test('a missing, unusable or mismatched fork is a refusal line naming the bar and the note; the engine is never reached', async () => {
  let calls = 0;
  const compute = async () => { calls++; return ok(); };
  const missing = await producePhrase({ readNote: async (p) => { if (p === 'bars/bar_009.md') throw new Error('File not found'); return SOURCE; }, compute }, OVER, 'p');
  assert.equal(missing.kind, 'refusal');
  if (missing.kind === 'refusal') assert.match(missing.message, /^Phrase: bar 3 is forked to bars\/bar_009 .*(not found|could not be read)/);
  const junk = await producePhrase({ readNote: async (p) => (p === 'bars/bar_009.md' ? note({ nope: 1 }) : SOURCE), compute }, OVER, 'p');
  assert.equal(junk.kind, 'refusal');
  if (junk.kind === 'refusal') assert.match(junk.message, /^Phrase: bar 3 .*bars\/bar_009.* not usable/);
  const twelve = note({ time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 0, tempo_bpm: 90, channels: { kick: Array(12).fill(false) } });
  const grid = await producePhrase({ readNote: async (p) => (p === 'bars/bar_009.md' ? twelve : SOURCE), compute }, OVER, 'p');
  assert.equal(grid.kind, 'refusal');
  if (grid.kind === 'refusal') assert.match(grid.message, /^Phrase: bar 3 \(bars\/bar_009\).*time_signature.*steps.*3\/4.*12/);
  assert.equal(calls, 0);
});

test('an invalid override in the phrase is refused naming overrides before any bar is read', async () => {
  let reads = 0;
  const out = await producePhrase({ readNote: async () => { reads++; return SOURCE; }, compute: ok }, { ...BASE, overrides: { '9': 'bars/bar_009' } }, 'p');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.match(out.message, /^Phrase: .*overrides/);
  assert.equal(reads, 0);
});

// ---- Edit this bar / Revert to generated -----------------------------------------------------------------------------------------------------------------------------------------------

function forkPorts(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const ports = {
    listBarBasenames: () => ['bar_005', 'bar_006'],
    exists: () => false,
    create: async (path: string, content: string) => { log.push(`create ${path}`); log.push(`content ${content.length}`); return { path }; },
    writePhrase: async (p: ExtendPhrase) => { log.push(`write ${JSON.stringify(p.overrides ?? null)}`); return { ok: true as const }; },
    open: (noteId: string) => { log.push(`open ${noteId}`); },
    notify: (m: string) => { log.push(`notify ${m}`); },
    isAlreadyExists: (e: unknown) => /already exists/i.test(String((e as Error)?.message ?? e)),
    ...over,
  };
  return { ports, log };
}
const input = { params: BASE, barNumber: 3, phraseNoteId: 'phrases/phrase_001', barData: bar([0, 3, 8]) };

test('Edit this bar: the fork note first (the next free bar number), then the phrase JSON, then the fork opens in the Beat Box', async () => {
  const { ports, log } = forkPorts();
  const r = await editThisBar(ports, input);
  assert.deepEqual(r, { ok: true, path: 'bars/bar_007.md', params: { ...BASE, overrides: { '3': 'bars/bar_007' } } });
  assert.deepEqual(log.filter((l) => !l.startsWith('content')), ['create bars/bar_007.md', 'write {"3":"bars/bar_007"}', 'open bars/bar_007']);
});

test('Edit this bar: a name taken in the same instant takes the next; a refused create writes NOTHING to the phrase', async () => {
  let n = 0;
  const { ports, log } = forkPorts({ create: async (path: string) => { if (n++ === 0) throw new Error('File already exists.'); log.push(`create ${path}`); return { path }; } });
  const r = await editThisBar(ports, input);
  assert.equal(r.ok, true);
  assert.ok(log.includes('create bars/bar_008.md'));
  const failing = forkPorts({ create: async () => { throw new Error('disk full'); } });
  const origErr = console.error; console.error = () => {};
  try {
    const bad = await editThisBar(failing.ports, input);
    assert.equal(bad.ok, false);
    assert.equal(failing.log.some((l) => l.startsWith('write ')), false, 'the phrase was not touched');
    assert.match(failing.log.join('\n'), /notify Edit this bar: .*disk full/);
  } finally { console.error = origErr; }
});

test('Edit this bar: if the phrase write fails after the note was created, nothing is deleted and the Notice NAMES the leftover note', async () => {
  const { ports, log } = forkPorts({ writePhrase: async () => ({ ok: false as const, message: 'Not saved: the note is read_only.' }) });
  const r = await editThisBar(ports, input);
  assert.equal(r.ok, false);
  if (r.ok === false) assert.equal(r.leftover, 'bars/bar_007.md');
  assert.match(log.join('\n'), /notify Edit this bar: the phrase was not changed, but bars\/bar_007\.md was created \(use it or delete it\): Not saved: the note is read_only\./);
  assert.equal(log.some((l) => l.startsWith('open ')), false, 'nothing opens on a failure');
});

test('Edit this bar refuses a bar that is already a fork, or out of range, and touches nothing', async () => {
  const { ports, log } = forkPorts();
  assert.equal((await editThisBar(ports, { ...input, params: OVER })).ok, false);
  assert.equal((await editThisBar(ports, { ...input, barNumber: 9 })).ok, false);
  assert.equal(log.some((l) => l.startsWith('create ') || l.startsWith('write ')), false);
});

test('Revert to generated removes the override and nothing else: the fork note is neither touched nor deleted', async () => {
  const { ports, log } = forkPorts();
  const r = await revertThisBar(ports, { params: OVER, barNumber: 3 });
  assert.deepEqual(r, { ok: true, params: BASE });
  assert.deepEqual(log, ['write null']);
  const failed = forkPorts({ writePhrase: async () => ({ ok: false as const, message: 'Not saved: nope.' }) });
  assert.equal((await revertThisBar(failed.ports, { params: OVER, barNumber: 3 })).ok, false);
  assert.match(failed.log.join('\n'), /notify Revert to generated: Not saved: nope\./);
  assert.equal((await revertThisBar(forkPorts().ports, { params: BASE, barNumber: 3 })).ok, false, 'a bar that is not a fork has nothing to revert');
});

// ---- the Inspector stack of a bar ---------------------------------------------------------------------------------------------------------------------------------------------------------

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `ph_bar_${i + 1}`, index: i + 1, tempo: 100 - i }));

test('a generated bar\'s stack is the M6 stack plus an Edit this bar action; a forked bar says where it is edited, whose tempo it has, and offers Revert to generated', () => {
  const generated = phraseLineageOf(phraseProvenance('phrases/phrase_001', BASE, infos(8))['ph_bar_3']);
  assert.deepEqual(generated.map((e) => e.text), ['bar 3 of 8', 'made by phrase_001 (extend, slowing 20 %, style repeat_with_fills)', 'from bar_005', 'tempo 98', 'Edit this bar']);
  assert.equal(generated.at(-1)?.kind, 'action');
  assert.deepEqual(generated.at(-1)?.action, { id: 'fork', barNumber: 3 });
  const forked = phraseLineageOf(phraseProvenance('phrases/phrase_001', OVER, infos(8))['ph_bar_3']);
  assert.deepEqual(forked.map((e) => e.text), ['bar 3 of 8', 'forked: edited in bar_009 (was made by phrase_001, repeat_with_fills)', 'tempo 98 (the fork\'s own)', 'Revert to generated']);
  assert.equal(forked[1].noteId, 'bars/bar_009');
  assert.equal(forked[1].openLabel, 'Open bar_009');
  assert.deepEqual(forked.at(-1)?.action, { id: 'revert', barNumber: 3 });
  const other = phraseLineageOf(phraseProvenance('phrases/phrase_001', OVER, infos(8))['ph_bar_4']);
  assert.equal(other.at(-1)?.text, 'Edit this bar', 'the other bars are still generated');
});

test('a phrase without overrides: the stack of every bar is the M6 stack with the one added action, and nothing else moved', () => {
  const map = phraseProvenance('phrases/phrase_001', BASE, infos(8));
  for (const id of Object.keys(map)) assert.equal(phraseLineageOf(map[id]).slice(0, 4).length, 4);
  assert.equal(Object.keys(map).length, 8);
  assert.equal(map['ph_bar_1'].params.fork, undefined);
});

// ---- gaps found by the mutants ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('forkable: the LAST bar can be forked, bar 0 and the bar after the last cannot', () => {
  assert.equal(forkable(BASE, 8), true);
  assert.equal(forkable(BASE, 1), true);
  assert.equal(forkable(BASE, 9), false);
  assert.equal(forkable(BASE, 0), false);
});

test('withOverride keeps the overrides in bar order whatever order they were made in', () => {
  const later = withOverride(withOverride(BASE, 5, 'bars/bar_010'), 3, 'bars/bar_009');
  assert.deepEqual(Object.keys(later.overrides!), ['3', '5']);
});

test('Edit this bar skips a name that exists even when the vault listing has not caught up with it', async () => {
  const { ports, log } = forkPorts({ exists: (p: string) => p === 'bars/bar_007.md' });
  const r = await editThisBar(ports, input);
  assert.equal(r.ok, true);
  assert.ok(log.includes('create bars/bar_008.md'));
  assert.equal(log.includes('create bars/bar_007.md'), false);
});

test('a fork on a grid that differs ONLY in group size is refused naming group_size', async () => {
  const sameButGroup = note({ ...bar([0, 8]), group_size: 2 });
  const out = await producePhrase({ readNote: async (p) => (p === 'bars/bar_009.md' ? sameButGroup : SOURCE), compute: ok }, OVER, 'p');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.match(out.message, /^Phrase: bar 3 \(bars\/bar_009\) differs from the source bar_005 in group_size \(/);
});

test('two bars forked to the SAME note read that note once, and both get its data', async () => {
  const reads: string[] = []; const seen: any[] = [];
  const out = await producePhrase({ readNote: async (p) => { reads.push(p); return p === 'bars/bar_009.md' ? FORK : SOURCE; }, compute: async (_d, params) => { seen.push(params); return ok(); } }, { ...BASE, overrides: { '3': 'bars/bar_009', '5': 'bars/bar_009' } }, 'p');
  assert.equal(out.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md', 'bars/bar_009.md']);
  assert.deepEqual(Object.keys(seen[0].override_bars), ['3', '5']);
});

test('the evidence lines: one per step of Edit this bar (created, overrides, opened) and one for Revert; none when no trace port is given', async () => {
  const lines: string[] = [];
  const { ports } = forkPorts({ trace: (l: string) => { lines.push(l); } });
  await editThisBar(ports, input);
  assert.deepEqual(lines, ['[forge-fork] bar 3: created bars/bar_007.md (forked from phrases/phrase_001 bar 3)', '[forge-fork] bar 3: phrase overrides now {"3":"bars/bar_007"}', '[forge-fork] bar 3: opened bars/bar_007']);
  lines.length = 0;
  await revertThisBar(ports, { params: OVER, barNumber: 3 });
  assert.deepEqual(lines, ['[forge-fork] bar 3: reverted to generated; bars/bar_009 stays in the vault']);
});
