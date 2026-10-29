// 2026-10-29-0820 (M10 slice 1): an ARRANGEMENT note - Forge shape above one json fence - and its Score producer, with the engine and the vault stood in (the real engine runs in arrangement-engine.test.ts). Pins the MECHANISM of the derived text
// (the goldens) and the PROPERTIES (the json is the only parsed data, the wikilinks are real and unique, refresh is idempotent and keeps the fence and the person's own lines, every unusable input is a refusal in a sentence that names it); if the
// derived text's design moves the goldens SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { DERIVED_NOTE } from './phrase-notes-core.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import {
  arrangementCreatedLine, arrangementDescription, arrangementLinks, arrangementPath, arrangementPython, arrangementRecipeSteps, combineRefusal, formatArrangementJson, isArrangementPath, newArrangementNote, nextArrangementName,
  ARRANGEMENT_VIEW_TYPE, produceArrangement, readArrangementNote, refreshArrangementNoteText, validateArrangement, type ArrangementInput, type ArrangementParams,
} from './arrangement-core.ts';

const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
const parses = (src: string): boolean => spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: src, encoding: 'utf8' }).status === 0;

test('the arrangement note, golden: Description naming the tracks and the rest rule, Recipe ("Play [[phrase]] on the [[kit]] kit." per track, then "Together."), Python (kits and phrases called by name, combine_tracks, the bars returned), links, then the json fence LAST', () => {
  const desc = 'arr_001 — 2 tracks played together: [[phrase_003]] on the [[rock]] kit, [[phrase_009]] on the [[latin]] kit. A phrase that is shorter than the others rests until the longest one ends.';
  assert.equal(arrangementDescription('arr_001', ARR), desc);
  assert.deepEqual(arrangementRecipeSteps(ARR), ['Play [[phrase_003]] on the [[rock]] kit.', 'Play [[phrase_009]] on the [[latin]] kit.', 'Together.']);
  assert.deepEqual(arrangementLinks(ARR), ['phrase_003', 'rock', 'phrase_009', 'latin']);
  const python = [
    'def compute(context):', '  tracks = []',
    "  tracks.append({'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_003()})",
    "  tracks.append({'kit': 'latin', 'channels': latin()['channels'], 'bars': phrase_009()})",
    '  bars = combine_tracks(tracks=tracks)', '  return bars', '  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)',
  ].join('\n');
  assert.equal(arrangementPython(ARR), python);
  assert.equal(newArrangementNote('arr_001', ARR), [
    '---', 'type: data', 'content_type: json', `description: ${JSON.stringify(desc)}`, 'links:', '  - "[[phrase_003]]"', '  - "[[rock]]"', '  - "[[phrase_009]]"', '  - "[[latin]]"', '---', '',
    DERIVED_NOTE, '', '# Description', '', desc, '', '# Recipe', '', 'Play [[phrase_003]] on the [[rock]] kit.', 'Play [[phrase_009]] on the [[latin]] kit.', 'Together.', '',
    '# Python', '', '```python', python, '```', '',
    '```json', '{', '  "kind": "arrangement",', '  "tracks": [', '    {"kit": "rock", "phrase": "phrase_003"},', '    {"kit": "latin", "phrase": "phrase_009"}', '  ]', '}', '```', '',
  ].join('\n'));
});

test('one track reads as one track; a kit or phrase name that is not a Python identifier is called through globals() and every block parses (and the parse check can fail)', () => {
  const one: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] };
  assert.ok(arrangementDescription('arr_001', one).startsWith('arr_001 — one track: '));
  const odd: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'my-kit', phrase: 'my-phrase' }, { kit: 'rock', phrase: 'phrase_001' }] };
  assert.match(arrangementPython(odd), /globals\(\)\['my-kit'\]\(\)\['channels'\]/);
  for (const p of [ARR, one, odd]) assert.equal(parses(arrangementPython(p)), true, JSON.stringify(p));
  assert.equal(parses('def compute(context)\n  return 1'), false, 'non-vacuity');
});

test('validation: exactly kind and tracks; each track exactly kit and phrase, safe names; a kit plays one phrase; the same phrase may be on two kits', () => {
  assert.deepEqual(validateArrangement({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p' }, { kit: 'latin', phrase: 'p' }] }).ok, true);
  const bad: Array<[unknown, RegExp]> = [
    [null, /object/], [{ kind: 'kit' }, /kind must be "arrangement"/], [{ kind: 'arrangement', tracks: [], x: 1 }, /Unexpected field "x"/], [{ kind: 'arrangement' }, /at least one track/], [{ kind: 'arrangement', tracks: [] }, /at least one track/],
    [{ kind: 'arrangement', tracks: [3] }, /tracks\[0\] must be an object/], [{ kind: 'arrangement', tracks: [{ kit: 'rock' }] }, /phrase/], [{ kind: 'arrangement', tracks: [{ phrase: 'p' }] }, /kit/],
    [{ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p', x: 1 }] }, /unexpected field "x"/], [{ kind: 'arrangement', tracks: [{ kit: '../x', phrase: 'p' }] }, /not a kit name/], [{ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a/b' }] }, /not a phrase name/],
    [{ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a' }, { kit: 'rock', phrase: 'b' }] }, /kit "rock" plays two tracks/],
  ];
  for (const [raw, re] of bad) {
    const r = validateArrangement(raw);
    assert.equal(r.ok, false, JSON.stringify(raw));
    if (r.ok === false) assert.match(r.message, re, JSON.stringify(raw));
  }
});

test('the round trip, the links, and "Refresh note links": json -> note -> json byte for byte; links: lists each note once; a hand-edited derived text is regenerated, the fence and the person\'s own line survive, a second run changes nothing', () => {
  const text = newArrangementNote('arr_001', ARR);
  const read = readArrangementNote(text);
  assert.ok(read.ok);
  if (read.ok) assert.equal(formatArrangementJson(read.value), formatArrangementJson(ARR));
  assert.equal((text.match(/^  - "\[\[/gm) ?? []).length, 4);
  const twice: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_001' }] };
  assert.deepEqual(arrangementLinks(twice), ['phrase_001', 'rock', 'latin'], 'a phrase on two kits is linked once');
  const edited = text.replace('Together.', 'Somebody typed here.').replace('type: data', 'type: data\nread_only: false');
  const r = refreshArrangementNoteText(edited, 'arr_001');
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.ok(!r.text.includes('Somebody typed here.') && r.text.includes('read_only: false'));
  assert.equal(r.text.slice(r.text.indexOf('```json')), text.slice(text.indexOf('```json')), 'the fence: byte-identical');
  const again = refreshArrangementNoteText(r.text, 'arr_001');
  assert.ok(again.ok && !again.changed && again.text === r.text);
  assert.equal((refreshArrangementNoteText(text, 'arr_001') as { changed: boolean }).changed, false, 'a fresh note is already current');
  assert.equal(readArrangementNote('no frontmatter').ok, false);
  assert.equal(readArrangementNote('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "kit"}\n```\n').ok, false);
});

test('paths, names and the evidence line: arrangements/<name>.md, README is not one, the next name is arr_001, arr_002 ...', () => {
  assert.equal(arrangementPath('arr_001'), 'arrangements/arr_001.md');
  assert.equal(isArrangementPath('arrangements/arr_001.md'), true);
  assert.equal(isArrangementPath('arrangements/README.md'), false);
  assert.equal(isArrangementPath('phrases/phrase_001.md'), false);
  assert.equal(nextArrangementName(() => false), 'arr_001');
  const taken = new Set(['arrangements/arr_001.md', 'arrangements/arr_002.md']);
  assert.equal(nextArrangementName((p) => taken.has(p)), 'arr_003');
  assert.equal(arrangementCreatedLine('arr_001', ARR), '[forge-arrangement] created arrangements/arr_001.md tracks=phrase_003@rock,phrase_009@latin');
});

// ---- the Score producer, engine and vault stood in ---------------------------------------------------------------------------------------------------------------------------

const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const barText = (n: string): string => fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
const barData = (n: string) => { const r = readRhythmNote(barText(n)); if (r.ok === false) throw new Error(r.message); return r.value.data; };
const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const LATIN: KitParams = { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] };
const EXTEND = (source: string): PhraseParams => ({ kind: 'extend', source, bars: 2, style: 'repeat_with_fills', tempo_change_pct: 0 });
const SCORE = { type: 'musicxml', content: '<score-partwise/>' };

function world(over: { notes?: Record<string, string>; combine?: (input: ArrangementInput) => unknown; phrasePayload?: (data: any) => unknown } = {}) {
  const notes: Record<string, string> = {
    'bars/bar_007.md': barText('bar_007'), 'bars/bar_008.md': barText('bar_008'),
    'kits/rock.md': newKitNote(ROCK), 'kits/latin.md': newKitNote(LATIN),
    'phrases/phrase_003.md': noteContentFor('phrase_003', EXTEND('bar_007')), 'phrases/phrase_009.md': noteContentFor('phrase_009', EXTEND('bar_008')),
    ...over.notes,
  };
  const received: ArrangementInput[] = [];
  const deps = {
    phrases: {
      readNote: async (p: string) => { const t = notes[p]; if (t === undefined) throw new Error('File not found'); return t; },
      // a phrase: the extend of its source bar twice (what the engine would draw), carried as the payload's bars_data
      compute: async (data: any, _params: unknown, _title: string) => over.phrasePayload ? over.phrasePayload(data) : ({ ...SCORE, bars_data: [data, data] }),
    },
    compute: async (input: ArrangementInput, _title: string) => { received.push(input); return over.combine ? over.combine(input) : { ...SCORE, bars_data: [] }; },
  };
  return { deps, received, notes };
}

test('the producer reads every kit and phrase fresh, draws each phrase by the phrase code, and hands the engine each kit with its channels and the bars of its phrase, in track order', async () => {
  const w = world();
  const out = await produceArrangement(w.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.equal(out.kind, 'score');
  assert.equal(w.received.length, 1);
  assert.deepEqual(w.received[0].tracks.map((t) => [t.kit, t.channels, t.bars.length]), [['rock', ['kick', 'snare', 'hihat'], 2], ['latin', ['bell', 'claves', 'conga_high', 'conga_low'], 2]]);
  assert.deepEqual(w.received[0].tracks[0].bars[0], barData('bar_007'), 'the rock track plays bar_007\'s bars');
  assert.deepEqual(w.received[0].tracks[1].bars[0], barData('bar_008'));
});

test('a missing or unusable note is a refusal in one sentence that names it: the arrangement itself, a kit, a phrase, a phrase that cannot be drawn', async () => {
  const note = newArrangementNote('arr_001', ARR);
  const cases: Array<[string, Parameters<typeof world>[0], string | { unreadable: string }, RegExp]> = [
    ['unreadable note', {}, { unreadable: 'locked' }, /^Arrangement: the arrangement note could not be read \(locked\)\.$/],
    ['not an arrangement', {}, newKitNote(ROCK), /^Arrangement: The kind must be "arrangement"/],
    ['missing kit', { notes: { 'kits/latin.md': undefined as never } }, note, /^Arrangement: the kit latin \(kits\/latin\.md\) was not found/],
    ['unusable kit', { notes: { 'kits/latin.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "kit", "name": "latin", "channels": ["triangle"]}\n```\n' } }, note, /^Arrangement: the kit latin is not usable: Unknown channel "triangle"/],
    ['missing phrase', { notes: { 'phrases/phrase_009.md': undefined as never } }, note, /^Arrangement: the phrase phrase_009 \(phrases\/phrase_009\.md\) was not found/],
    ['unusable phrase', { notes: { 'phrases/phrase_009.md': '---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "nope"}\n```\n' } }, note, /^Arrangement: the phrase phrase_009 is not usable:/],
    ['undrawable phrase', { notes: { 'bars/bar_008.md': 'gone' } }, note, /^Arrangement: the phrase phrase_009 could not be drawn: /],
  ];
  for (const [label, over, text, re] of cases) {
    const notes = { ...(over.notes ?? {}) };
    for (const k of Object.keys(notes)) if ((notes as Record<string, unknown>)[k] === undefined) delete (notes as Record<string, unknown>)[k];
    const w = world({ notes });
    for (const k of Object.keys(over.notes ?? {})) if ((over.notes as Record<string, unknown>)[k] === undefined) delete w.notes[k];
    const out = await produceArrangement(w.deps, text, 'arr_001');
    assert.equal(out.kind, 'refusal', label);
    if (out.kind === 'refusal') assert.match(out.message, re, label);
    assert.equal(w.received.length, 0, `${label}: the engine is never asked`);
  }
});

test('the engine\'s own combine_tracks refusal (two kits with one channel, another tempo) is the person\'s data, not a fault: a refusal line; any other engine failure is an error', async () => {
  assert.equal(combineRefusal("Traceback...\nValueError: combine_tracks: channel 'kick' is claimed by kit 'rock' and by kit 'latin'; give each channel to one kit"), "combine_tracks: channel 'kick' is claimed by kit 'rock' and by kit 'latin'; give each channel to one kit");
  assert.equal(combineRefusal('KeyError: nothing'), null);
  const refuse = world({ combine: () => { throw new Error("PythonError: ValueError: combine_tracks: kit 'latin' bar 1 has tempo_bpm 120 but kit 'rock' bar 1 has 100; tracks played together must share the same tempo"); } });
  const r = await produceArrangement(refuse.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.equal(r.kind, 'refusal');
  if (r.kind === 'refusal') assert.match(r.message, /^Arrangement: combine_tracks: kit 'latin' bar 1 has tempo_bpm 120/);
  const broken = world({ combine: () => { throw new Error('KeyError: boom'); } });
  const e = await produceArrangement(broken.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.equal(e.kind, 'error');
  const noScore = world({ combine: () => ({ nothing: true }) });
  assert.equal((await produceArrangement(noScore.deps, newArrangementNote('arr_001', ARR), 'arr_001')).kind, 'error', 'an engine that answers with no score is an error, as for every Score');
});

test('reading an arrangement note: every way a note can fail to be one is one sentence, from the reader and from "Refresh note links" alike; a track that is not an object is named by its place; the view type is the one the plugin registers', () => {
  const head = '---\ntype: data\ncontent_type: json\n---\n\n';
  const cases: Array<[string, string, string | RegExp]> = [
    ['no frontmatter', 'no frontmatter', 'The note has no frontmatter, so it is not a data note.'],
    ['no json block', `${head}prose only\n`, 'The note body must end with one fenced ```json block (no json block found).'],
    ['unclosed block', `${head}\`\`\`json\n{"kind": "arrangement",\n`, 'The json block is not closed.'],
    ['not json', `${head}\`\`\`json\n{nope\n\`\`\`\n`, /^The json block is not valid JSON: /],
  ];
  for (const [label, text, want] of cases) {
    for (const r of [readArrangementNote(text), refreshArrangementNoteText(text, 'arr_001')]) {
      assert.equal(r.ok, false, label);
      if (r.ok === false) typeof want === 'string' ? assert.equal(r.message, want, label) : assert.match(r.message, want, label);
    }
  }
  for (const [raw, where] of [[[null], 0], [[[]], 0], [[{ kit: 'rock', phrase: 'p' }, 'x'], 1]] as Array<[unknown[], number]>) {
    const r = validateArrangement({ kind: 'arrangement', tracks: raw });
    assert.ok(r.ok === false && r.message === `tracks[${where}] must be an object with a kit and a phrase.`, JSON.stringify(raw));
  }
  assert.deepEqual(validateArrangement({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p' }] }), { ok: true, value: { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p' }] } });
  assert.equal(ARRANGEMENT_VIEW_TYPE, 'forge-arrangement-view');
});

test('a phrase the phrase code drew but that carries no bars is a refusal naming it; any other engine failure keeps the engine\'s own words', async () => {
  const w = world({ phrasePayload: () => ({ ...SCORE }) });
  const out = await produceArrangement(w.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Arrangement: the phrase phrase_003 gave no bars to play.');
  assert.equal(w.received.length, 0);
  const broken = world({ combine: () => { throw new Error('KeyError: boom'); } });
  const e = await produceArrangement(broken.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.equal(e.kind, 'error');
  if (e.kind === 'error') assert.match(e.message, /KeyError: boom/, 'a fault in the engine is reported as the engine\'s, not swallowed as a refusal');
});
