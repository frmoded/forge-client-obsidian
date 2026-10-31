// 2026-10-27-1020 (driver 2026-10-26: "in the notes panel we want Description, script and Python"): a phrase note reads in the Forge shape. Above the ONE json fence (still the source of truth, P4, and still last) the derived text is
// `# Description` (the sentence), `# Recipe` (English steps, one per line, bars as [[wikilinks]]) and `# Python` (a fenced python block, `def compute(context):`, that calls the engine functions with the note's own arguments and reads a bar by
// calling its note by name, the convention of music-theory/rhythm_data/rhythm_extended_fills.md). Derived, never hand-edited; the first line is still the derived-note comment. Bar notes are unchanged (data + Description).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { formatPhraseJson, readPhraseNote, refreshPhraseNoteText, type PhraseParams } from './phrase-core.ts';
import { CACHE_NOTE, DERIVED_NOTE, SOURCE_CHAIN_NOTE, extractPhraseJsonBlock, newPhraseNote, phraseParts, phrasePython, phraseRecipeSteps, sourceChainSections } from './phrase-notes-core.ts';
import { chainStampLines } from './test-support/source-chain-golden.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 };
const VOTE: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.6, threshold: 0.65, ghost: true };
const PATH: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 };

// ---- the Recipe: English, one step per line -----------------------------------------------------------------------------------------------------------------------------------

test('Recipe, golden, per kind: English steps with the bars as wikilinks, one step per line', () => {
  assert.deepEqual(phraseRecipeSteps(EXTEND), ['Take [[bar_005]].', 'Repeat it for 8 bars with fills, 20 % slower.']);
  assert.deepEqual(phraseRecipeSteps({ ...EXTEND, style: 'building', tempo_change_pct: 0 }), ['Take [[bar_005]].', 'Build it up over 8 bars.']);
  assert.deepEqual(phraseRecipeSteps({ ...EXTEND, style: 'ghost_notes', tempo_change_pct: 15 }), ['Take [[bar_005]].', 'Repeat it for 8 bars with ghost notes, 15 % faster.']);
  assert.deepEqual(phraseRecipeSteps(MORPH), ['Take [[bar_007]] and [[bar_008]].', 'Morph from the first to the second over 17 bars, in musical order.']);
  assert.deepEqual(phraseRecipeSteps({ ...MORPH, order: 'seeded', seed: 7 }), ['Take [[bar_007]] and [[bar_008]].', 'Morph from the first to the second over 17 bars, in seeded order (seed 7).']);
  assert.deepEqual(phraseRecipeSteps({ ...MORPH, order: 'by_channel' }), ['Take [[bar_007]] and [[bar_008]].', 'Morph from the first to the second over 17 bars, in by_channel order.']);
  assert.deepEqual(phraseRecipeSteps({ ...MORPH, bars: 1, position: 3 }), ['Take [[bar_007]] and [[bar_008]].', 'Morph from the first to the second and keep the bar at position 3, in musical order.']);
  assert.deepEqual(phraseRecipeSteps(VOTE), ['Take [[bar_005]] and [[bar_006]].', 'Mix them by vote: 60 % [[bar_005]] and 40 % [[bar_006]], threshold 0.65, ghost notes on.']);
  assert.deepEqual(phraseRecipeSteps({ ...VOTE, weight: 0.25, threshold: 0.5, ghost: false }), ['Take [[bar_005]] and [[bar_006]].', 'Mix them by vote: 25 % [[bar_005]] and 75 % [[bar_006]], threshold 0.50, ghost notes off.']);
  assert.deepEqual(phraseRecipeSteps(PATH), ['Take [[bar_005]] and [[bar_006]].', 'Mix them as a path of single-hit changes from the first to the second, in musical order.', 'Keep the state at weight 1 (1 is all of [[bar_005]], 0 is all of [[bar_006]]).']);
  assert.deepEqual(phraseRecipeSteps({ ...PATH, weight: 0.4, order: 'seeded', seed: 2 }), ['Take [[bar_005]] and [[bar_006]].', 'Mix them as a path of single-hit changes from the first to the second, in seeded order (seed 2).', 'Keep the state at weight 0.4 (1 is all of [[bar_005]], 0 is all of [[bar_006]]).']);
});

test('a fork override is a sentence of its own, in bar order, whatever the kind', () => {
  const forked: PhraseParams = { ...EXTEND, overrides: { '9': 'bars/bar_009', '3': 'bars/bar_011' } } as never;
  assert.deepEqual(phraseRecipeSteps(forked), ['Take [[bar_005]].', 'Repeat it for 8 bars with fills, 20 % slower.', 'Bar 3 is replaced by [[bar_011]].', 'Bar 9 is replaced by [[bar_009]].']);
  assert.deepEqual(phraseRecipeSteps({ ...MORPH, overrides: { '2': 'bars/bar_020' } } as never).slice(-1), ['Bar 2 is replaced by [[bar_020]].']);
});

// ---- the Python: the engine's own calls, a bar read by calling its note -------------------------------------------------------------------------------------------------------

test('Python, golden, per kind: def compute(context), the engine function with the note\'s own arguments, a bar read by calling its note by name', () => {
  assert.equal(phrasePython(EXTEND), [
    'def compute(context):',
    '  base = bar_005()',
    "  bars = extend_rhythm(data=base, bars=8, style='repeat_with_fills', tempo_change_pct=-20)",
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
  assert.equal(phrasePython(MORPH), [
    'def compute(context):',
    '  a = bar_007()',
    '  b = bar_008()',
    "  bars = morph_rhythm(a=a, b=b, bars=17, order='musical', seed=0)",
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
  assert.equal(phrasePython({ ...MORPH, bars: 1, position: 3 }), [
    'def compute(context):',
    '  a = bar_007()',
    '  b = bar_008()',
    "  bars = [morph_rhythm(a=a, b=b, bars=1, order='musical', seed=0, position=3)]",
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
  assert.equal(phrasePython(VOTE), [
    'def compute(context):',
    '  a = bar_005()',
    '  b = bar_006()',
    '  mixed = mix_rhythm(a=a, b=b, weight=0.6, threshold=0.65, ghost=True)',
    '  return [mixed]',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=[mixed])',
  ].join('\n'));
  assert.equal(phrasePython(PATH), [
    'def compute(context):',
    '  a = bar_005()',
    '  b = bar_006()',
    "  changes = morph_rhythm_info(a=a, b=b, order='musical', seed=0)['d']",
    '  stop = min(changes, max(0, ((1000000 - 1000000) * changes + 500000) // 1000000))',
    "  bar = morph_rhythm(a=a, b=b, bars=1, order='musical', seed=0, position=stop)",
    '  return [bar]',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=[bar])',
  ].join('\n'));
  assert.match(phrasePython({ ...PATH, weight: 0.45, order: 'seeded', seed: 3 }), /\(\(1000000 - 450000\) \* changes \+ 500000\)/, 'the weight in millionths, the rule pathStopOf uses');
});

test('a fork replaces its bar in the list, by index (bar n is index n - 1), after the engine call and before the return', () => {
  const forked = { ...EXTEND, overrides: { '9': 'bars/bar_009', '3': 'bars/bar_011' } } as never;
  assert.equal(phrasePython(forked), [
    'def compute(context):',
    '  base = bar_005()',
    "  bars = extend_rhythm(data=base, bars=8, style='repeat_with_fills', tempo_change_pct=-20)",
    '  bars[2] = bar_011()',
    '  bars[8] = bar_009()',
    '  return bars',
    '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n'));
});

test('a bar name that is not a Python identifier is read through globals(), so the block still parses; a quote in a name cannot break out of the string', () => {
  const odd: PhraseParams = { kind: 'extend', source: 'my-bar', bars: 4, style: 'building', tempo_change_pct: 0 };
  assert.match(phrasePython(odd), /base = globals\(\)\['my-bar'\]\(\)/);
  assert.equal(parses(phrasePython(odd)), true);
});

/** Does python3 accept this source (ast.parse)? Isolated mode, source on stdin: nothing is imported from a directory. */
function parses(source: string): boolean {
  return spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: source, encoding: 'utf8' }).status === 0;
}

test('every Python block parses (ast.parse), for every kind and with forks; and the parse check can fail (a broken block does not)', () => {
  const all: PhraseParams[] = [EXTEND, { ...EXTEND, style: 'building' }, MORPH, { ...MORPH, bars: 1, position: 0 }, { ...MORPH, order: 'seeded', seed: 5 }, VOTE, PATH, { ...PATH, weight: 0.45, order: 'by_channel' },
    { ...EXTEND, overrides: { '2': 'bars/bar_009' } } as never, { ...MORPH, overrides: { '17': 'bars/bar_009' } } as never];
  for (const p of all) assert.equal(parses(phrasePython(p)), true, JSON.stringify(p));
  assert.equal(parses('def compute(context)\n  return 1'), false, 'non-vacuity');
});

// ---- the note ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the whole note, golden: frontmatter (description + whole-value links), the comment, # Description, # Recipe, # Python, then the json fence LAST', () => {
  const p = { ...EXTEND, overrides: { '3': 'bars/bar_011' } } as never as PhraseParams;
  const json = formatPhraseJson(p);
  assert.equal(newPhraseNote('phrase_001', p, json), [
    '---', 'type: data', 'content_type: json',
    'description: "phrase_001 — [[bar_005]] extended to 8 bars: repeat with fills, slowing 20 %. Edited by hand: bar 3 is [[bar_011]]."',
    'links:', '  - "[[bar_005]]"', '  - "[[bar_011]]"',
    ...chainStampLines('Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower. Bar 3 is replaced by [[bar_011]].', ['Take [[bar_005]].', 'Repeat it for 8 bars with fills, 20 % slower.', 'Bar 3 is replaced by [[bar_011]].'], phrasePython(p)),
    '---', '',
    SOURCE_CHAIN_NOTE, '',
    '# Description', '', 'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower. Bar 3 is replaced by [[bar_011]].', '',
    '# Recipe', '', 'Take [[bar_005]].', 'Repeat it for 8 bars with fills, 20 % slower.', 'Bar 3 is replaced by [[bar_011]].', '',
    '# Python', '', '```python', phrasePython(p), '```', '',
    '# Cache', '', CACHE_NOTE, '',
    '```json', json, '```', '',
  ].join('\n'));
});

test('sourceChainSections: the comment first, four level-one headings in this order (the Cache heading closes the Python section), no level-two heading and no "Bars made" any more', () => {
  const lines = sourceChainSections(phraseParts('phrase_001', EXTEND));
  assert.equal(lines[0], SOURCE_CHAIN_NOTE);
  assert.deepEqual(lines.filter((l) => /^#{1,6} /.test(l)), ['# Description', '# Recipe', '# Python', '# Cache']);
  assert.ok(!lines.some((l) => /^## |Bars made/.test(l)));
  assert.equal(lines.filter((l) => l === '```python').length, 1);
  assert.equal(lines.filter((l) => l === '```').length, 1);
  assert.ok(!lines.some((l) => l.startsWith('```json')), 'the json fence is not part of the derived text');
});

test('the json fence stays THE fence: the python fence above it is not mistaken for it, and the note reads back to the same value (the round trip, JSON -> note -> JSON)', () => {
  for (const p of [EXTEND, MORPH, VOTE, PATH, { ...EXTEND, overrides: { '3': 'bars/bar_011' } } as never as PhraseParams]) {
    const text = newPhraseNote('phrase_001', p, formatPhraseJson(p));
    const block = extractPhraseJsonBlock(text);
    assert.ok(block.ok);
    if (!block.ok) return;
    assert.equal(text.slice(block.fenceStart).startsWith('```json'), true);
    assert.deepEqual(JSON.parse(text.slice(block.contentStart, block.contentEnd)), JSON.parse(formatPhraseJson(p)));
    const read = readPhraseNote(text);
    assert.ok(read.ok);
    assert.equal(formatPhraseJson((read as { value: PhraseParams }).value), formatPhraseJson(p), 'JSON -> note -> JSON, byte for byte');
  }
});

// ---- an old note ------------------------------------------------------------------------------------------------------------------------------------------------------------------

const OLD = [
  '---', 'type: data', 'content_type: json', 'description: "phrase_003 — a morph."', 'links:', '  - "[[bar_007]]"', '  - "[[bar_008]]"', 'read_only: false', '---', '',
  DERIVED_NOTE, '', '## Description', '', 'phrase_003 — a morph.', '', '## Recipe', '', 'morph_rhythm([[bar_007]], [[bar_008]], bars=17, order="musical", seed=0)', '', '## Bars made', '', '- bar 2: [[bar_020]]', '',
  '```json', formatPhraseJson({ ...MORPH, overrides: { '2': 'bars/bar_020' } } as never), '```', '',
].join('\n');

test('an OLD-format note (## headings, the call as Recipe, Bars made) still reads, and "bring every note up to date" rewrites it to the new shape: idempotent, the json byte-identical, the person\'s own frontmatter lines kept', () => {
  const read = readPhraseNote(OLD);
  assert.ok(read.ok, 'the old note reads');
  const r = refreshPhraseNoteText(OLD, 'phrase_003');
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.ok(!/^## |Bars made|morph_rhythm\(\[\[/m.test(r.text), 'nothing of the old shape is left');
  assert.deepEqual(r.text.split('\n').filter((l) => /^# /.test(l)), ['# Description', '# Recipe', '# Python', '# Cache']);
  assert.ok(r.text.includes('Bar 2 is replaced by [[bar_020]].'));
  assert.ok(r.text.includes('read_only: false'), 'the person\'s own line stays');
  assert.equal(r.text.slice(r.text.indexOf('```json')), OLD.slice(OLD.indexOf('```json')), 'the json fence and everything after it: byte-identical');
  const again = refreshPhraseNoteText(r.text, 'phrase_003');
  assert.ok(again.ok && !again.changed && again.text === r.text, 'a second run changes nothing');
});

// ---- 2026-10-29-0810: a phrase's compute RETURNS BARS ---------------------------------------------------------------------------------------------------------------------------

/** The lines of a Python block that CALL the stream helper (a mention in a comment is not a call). */
const streamCalls = (src: string): string[] => src.split('\n').filter((l) => l.includes('rhythm_bars_to_stream') && !l.trimStart().startsWith('#'));

test('every kind\'s compute returns the BAR LIST (so a transform\'s Python can call its source phrase and get bars); the stream helper is only in a trailing comment, never called', () => {
  const all: PhraseParams[] = [EXTEND, { ...EXTEND, style: 'building' }, { ...EXTEND, overrides: { '3': 'bars/bar_011' } } as never, MORPH, { ...MORPH, bars: 1, position: 2 }, VOTE, PATH,
    { kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 2, last: 3, row: 'kick', amount: 0.5 }] } as PhraseParams];
  for (const p of all) {
    const lines = phrasePython(p).split('\n');
    assert.match(lines[lines.length - 2], /^  return (bars|\[mixed\]|\[bar\])$/, `${p.kind}: the last statement hands back the bars`);
    assert.match(lines[lines.length - 1], /^  # for a Score of these bars: rhythm_bars_to_stream\(bars=(bars|\[mixed\]|\[bar\])\)$/, `${p.kind}: the stream is a comment for people who want a Score`);
    assert.deepEqual(streamCalls(phrasePython(p)), [], `${p.kind}: the stream helper is never called`);
  }
  assert.notDeepEqual(streamCalls('def compute(context):\n  bars = x()\n  return rhythm_bars_to_stream(bars=bars)'), [], 'non-vacuity: the 1020 text IS caught by the same check');
});

/** A note as the 1020 plugin wrote it (compute returned the Score), PINNED here: the "before" of the rewrite is a fixed text, never the moving tree. */
const NOTE_1020 = [
  '---', 'type: data', 'content_type: json',
  'description: "phrase_002 — a transform of [[phrase_001]]: thin out bars 2 to 3, kick row: remove half of the hits, keeping the strongest beats."',
  'links:', '  - "[[phrase_001]]"', 'read_only: false', '---', '',
  DERIVED_NOTE, '', '# Description', '', 'phrase_002 — a transform of [[phrase_001]]: thin out bars 2 to 3, kick row: remove half of the hits, keeping the strongest beats.', '',
  '# Recipe', '', 'Take [[phrase_001]].', 'Thin out bars 2 to 3, kick row: remove half of the hits, keeping the strongest beats.', '',
  '# Python', '', '```python', 'def compute(context):', '  bars = phrase_001()', "  bars = thin_out_bars(bars=bars, first=2, last=3, row='kick', amount=0.5)", '  return rhythm_bars_to_stream(bars=bars)', '```', '',
  '```json', '{', '  "kind": "transform",', '  "source": "phrases/phrase_001",', '  "ops": [', '    {"op": "thin_out", "first": 2, "last": 3, "row": "kick", "amount": 0.5}', '  ]', '}', '```', '',
].join('\n');

test('a note the 1020 plugin wrote (compute returns the Score) still reads, and "bring every note up to date" rewrites its Python to return the bars: idempotent, the json byte-identical, the person\'s own line kept', () => {
  assert.ok(readPhraseNote(NOTE_1020).ok, 'the 1020 note reads');
  assert.equal(streamCalls(NOTE_1020).length, 1, 'the pinned note really has the old return');
  const r = refreshPhraseNoteText(NOTE_1020, 'phrase_002');
  assert.ok(r.ok && r.changed, 'the rewrite changes it');
  if (!r.ok) return;
  assert.deepEqual(streamCalls(r.text), [], 'no call to the stream helper is left');
  assert.ok(r.text.includes("  bars = phrase_001()\n  bars = thin_out_bars(bars=bars, first=2, last=3, row='kick', amount=0.5)\n  return bars\n  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)\n```"), 'the transform calls its source, applies the op, returns the bars');
  assert.ok(r.text.includes('read_only: false'), 'the person\'s own line stays');
  assert.equal(r.text.slice(r.text.indexOf('```json')), NOTE_1020.slice(NOTE_1020.indexOf('```json')), 'the json fence and everything after it: byte-identical');
  const again = refreshPhraseNoteText(r.text, 'phrase_002');
  assert.ok(again.ok && !again.changed && again.text === r.text, 'a second run changes nothing');
});

test('a hand edit of the derived text (a new Recipe line, a changed Python body) is overwritten on the next write, the json is not', () => {
  const text = newPhraseNote('phrase_001', EXTEND, formatPhraseJson(EXTEND));
  const edited = text.replace('Take [[bar_005]].', 'Take my own thing.').replace("style='repeat_with_fills'", "style='building'");
  const r = refreshPhraseNoteText(edited, 'phrase_001');
  assert.ok(r.ok && r.text === text);
});

// ---- P3 and the bars ----------------------------------------------------------------------------------------------------------------------------------------------------------

test('wikilinks stay properties only as WHOLE values: links entries and a made_from are "[[x]]", never a sentence around one', () => {
  const text = newPhraseNote('phrase_002', MORPH, formatPhraseJson(MORPH), ['made_from: "[[phrase_001]]"']);
  const front = text.slice(0, text.indexOf('\n---', 4));
  for (const l of front.split('\n').filter((x) => /^\s+- /.test(x) || /^made_from:/.test(x))) assert.match(l, /"\[\[[A-Za-z0-9_-]+\]\]"$/, l);
});

// ---- the edges (mutation pass) --------------------------------------------------------------------------------------------------------------------------------------------------

test('edges of the Recipe: one percent either way is still "slower" / "faster"; a seeded order without a seed says seed 0; a one-bar morph without a position says 0', () => {
  assert.equal(phraseRecipeSteps({ ...EXTEND, tempo_change_pct: 1 })[1], 'Repeat it for 8 bars with fills, 1 % faster.');
  assert.equal(phraseRecipeSteps({ ...EXTEND, tempo_change_pct: -1 })[1], 'Repeat it for 8 bars with fills, 1 % slower.');
  assert.equal(phraseRecipeSteps({ ...PATH, order: 'seeded', seed: undefined } as never)[1], 'Mix them as a path of single-hit changes from the first to the second, in seeded order (seed 0).');
  assert.equal(phraseRecipeSteps({ ...MORPH, bars: 1 })[1], 'Morph from the first to the second and keep the bar at position 0, in musical order.');
});

test('edges of the Python: a ghost-free vote says False, a one-bar morph without a position says 0, a weight outside 0..1 is held to the ends, a hostile string is escaped and the block still parses', () => {
  assert.match(phrasePython({ ...VOTE, ghost: false }), /ghost=False\)/);
  assert.match(phrasePython({ ...MORPH, bars: 1 }), /seed=0, position=0\)\]/);
  assert.match(phrasePython({ ...PATH, weight: 1.5 }), /\(\(1000000 - 1000000\) \* changes/);
  assert.match(phrasePython({ ...PATH, weight: -0.5 }), /\(\(1000000 - 0\) \* changes/);
  const hostile = { ...EXTEND, style: "x'y\\z" } as never as PhraseParams;
  assert.match(phrasePython(hostile), /style='x\\'y\\\\z'/);
  assert.equal(parses(phrasePython(hostile)), true);
});
