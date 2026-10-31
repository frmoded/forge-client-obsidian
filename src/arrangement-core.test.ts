// 2026-10-29-0820 (M10 slice 1): an ARRANGEMENT note - Forge shape above one json fence - and its Score producer, with the engine and the vault stood in (the real engine runs in arrangement-engine.test.ts). Pins the MECHANISM of the derived text
// (the goldens) and the PROPERTIES (the json is the only parsed data, the wikilinks are real and unique, refresh is idempotent and keeps the fence and the person's own lines, every unusable input is a refusal in a sentence that names it); if the
// derived text's design moves the goldens SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { CACHE_NOTE, SOURCE_CHAIN_NOTE } from './phrase-notes-core.ts';
import { chainStampLines } from './test-support/source-chain-golden.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { readRhythmNote } from './rhythm-edit-core.ts';
import { newKitNote, type KitParams } from './kit-core.ts';
import {
  applyArrangementWrite, setTrackSetting, trackSettingsSteps,
  arrangementCreatedLine, arrangementDescription, arrangementLinks, arrangementPath, arrangementPython, arrangementRecipeSteps, combineRefusal, formatArrangementJson, isArrangementPath, newArrangementNote, nextArrangementName,
  ALL_MUTED, ARRANGEMENT_VIEW_TYPE, nothingPlays, produceArrangement, readArrangementNote, refreshArrangementNoteText, validateArrangement, type ArrangementInput, type ArrangementParams,
} from './arrangement-core.ts';

const ARR: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }, { kit: 'latin', phrase: 'phrase_009' }] };
const parses = (src: string): boolean => spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: src, encoding: 'utf8' }).status === 0;

test('the arrangement note, golden: Description naming the tracks and the rest rule, Recipe ("Play [[phrase]] on the [[kit]] kit." per track, then "Together."), Python (kits and phrases called by name, combine_tracks, the bars returned), links, then the json fence LAST', () => {
  // 2026-10-29-0910 (deliberate): two or more tracks now also say whose tempo they play at (the first track's phrase); the bpm itself is the engine's output and is added to the TAB HEADER live, never stored.
  const desc = 'arr_001 — 2 tracks played together: [[phrase_003]] on the [[rock]] kit, [[phrase_009]] on the [[latin]] kit. A phrase that is shorter than the others rests until the longest one ends. All tracks play at the tempo of [[phrase_003]].';
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
  // 2026-10-30-1050 (M15b, deliberate): the # Description of the note is the grammar's sentences (the source); the frontmatter description above stays the words with wikilinks for the graph
  const said = 'Play [[phrase_003]] on the [[rock]] kit. Play [[phrase_009]] on the [[latin]] kit. Together.';
  const steps = ['Play [[phrase_003]] on the [[rock]] kit.', 'Play [[phrase_009]] on the [[latin]] kit.', 'Together.'];
  assert.equal(newArrangementNote('arr_001', ARR), [
    '---', 'type: data', 'content_type: json', `description: ${JSON.stringify(desc)}`, 'links:', '  - "[[phrase_003]]"', '  - "[[rock]]"', '  - "[[phrase_009]]"', '  - "[[latin]]"',
    ...chainStampLines(said, steps, python), '---', '',
    SOURCE_CHAIN_NOTE, '', '# Description', '', said, '', '# Recipe', '', ...steps, '',
    '# Python', '', '```python', python, '```', '',
    '# Cache', '', CACHE_NOTE, '',
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
  const edited = text.replace('# Recipe\n\nPlay', '# Recipe\n\nSomebody typed here.\nPlay').replace('type: data', 'type: data\nread_only: false');
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


// ---- 2026-10-29-0910: tempo sentence, mute / solo / volume ----------------------------------------------------------------------------------------------------------------------------

const SETTINGS: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', volume: 70, solo: true }, { kit: 'latin', phrase: 'phrase_009', mute: true }] };

test('the Description says whose tempo the tracks play at, computed from the first track (one track: nothing to say); with the engine\'s bpm known it adds "a to b bpm" (one number when they are equal)', () => {
  assert.ok(!/tempo/.test(arrangementDescription('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] })));
  const flip: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'latin', phrase: 'phrase_009' }, { kit: 'rock', phrase: 'phrase_003' }] };
  assert.match(arrangementDescription('arr_001', flip), /All tracks play at the tempo of \[\[phrase_009\]\]\.$/, 'the FIRST track, not the longest or the first by name');
  assert.match(arrangementDescription('arr_001', ARR, { from: 100, to: 90 }), /All tracks play at the tempo of \[\[phrase_003\]\]: 100 to 90 bpm\.$/);
  assert.match(arrangementDescription('arr_001', ARR, { from: 120, to: 120 }), /All tracks play at the tempo of \[\[phrase_003\]\]: 120 bpm\.$/);
});

test('mute, solo and volume are optional per-track fields: validated, kept, written only when set (a note without them is byte-identical to a slice 1 note)', () => {
  const ok = validateArrangement({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p', mute: true, solo: false, volume: 0 }, { kit: 'latin', phrase: 'q', volume: 100 }] });
  assert.equal(ok.ok, true);
  const bad: Array<[unknown, RegExp]> = [
    [{ mute: 1 }, /tracks\[0\]: mute must be true or false/], [{ solo: 'yes' }, /tracks\[0\]: solo must be true or false/],
    [{ volume: 101 }, /tracks\[0\]: volume must be a whole number from 0 to 100/], [{ volume: -1 }, /volume must be a whole number/], [{ volume: 50.5 }, /volume must be a whole number/], [{ volume: true }, /volume must be a whole number/], [{ volume: '70' }, /volume must be a whole number/],
    [{ loud: 1 }, /unexpected field "loud"/],
  ];
  for (const [extra, re] of bad) {
    const r = validateArrangement({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'p', ...(extra as object) }] });
    assert.equal(r.ok, false, JSON.stringify(extra));
    if (r.ok === false) assert.match(r.message, re);
  }
  const json = formatArrangementJson(SETTINGS);
  assert.match(json, /\{"kit": "rock", "phrase": "phrase_003", "solo": true, "volume": 70\},/);
  assert.match(json, /\{"kit": "latin", "phrase": "phrase_009", "mute": true\}\n/);
  assert.equal(formatArrangementJson(ARR).includes('mute'), false);
  const back = readArrangementNote(newArrangementNote('arr_001', SETTINGS));
  assert.deepEqual(back.ok && back.value, SETTINGS, 'round trip');
});

test('the Recipe says it in English ("Mute the [[latin]] kit.", "Play the [[rock]] kit at 70 percent volume.", "Only the [[rock]] kit plays."), the Python passes the fields to combine_tracks, and the links are unchanged', () => {
  assert.deepEqual(trackSettingsSteps(SETTINGS), ['Play the [[rock]] kit at 70 percent volume.', 'Mute the [[latin]] kit.', 'Only the [[rock]] kit plays.']);
  assert.deepEqual(arrangementRecipeSteps(SETTINGS), ['Play [[phrase_003]] on the [[rock]] kit.', 'Play [[phrase_009]] on the [[latin]] kit.', 'Play the [[rock]] kit at 70 percent volume.', 'Mute the [[latin]] kit.', 'Only the [[rock]] kit plays.', 'Together.']);
  const two: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a', solo: true }, { kit: 'latin', phrase: 'b', solo: true }, { kit: 'brush', phrase: 'c' }] };
  assert.ok(trackSettingsSteps(two).includes('Only the [[rock]] and [[latin]] kits play.'));
  const py = arrangementPython(SETTINGS);
  assert.match(py, /tracks\.append\(\{'kit': 'rock', 'channels': rock\(\)\['channels'\], 'bars': phrase_003\(\), 'solo': True, 'volume': 70\}\)/);
  assert.match(py, /tracks\.append\(\{'kit': 'latin', 'channels': latin\(\)\['channels'\], 'bars': phrase_009\(\), 'mute': True\}\)/);
  assert.equal(parses(py), true);
  assert.deepEqual(arrangementLinks(SETTINGS), ['phrase_003', 'rock', 'phrase_009', 'latin']);
  assert.ok(arrangementDescription('arr_001', SETTINGS).includes('Muted: [[latin]].') && arrangementDescription('arr_001', SETTINGS).includes('Volume 70 percent: [[rock]].'));
});

test('setTrackSetting changes ONE field of ONE track and drops a field that is back at its default (mute off, solo off, volume 100), so an undone change leaves the note byte-identical; an unknown track or a bad value changes nothing', () => {
  const muted = setTrackSetting(ARR, 1, { mute: true });
  assert.deepEqual(muted.tracks[1], { kit: 'latin', phrase: 'phrase_009', mute: true });
  assert.deepEqual(muted.tracks[0], ARR.tracks[0]);
  assert.deepEqual(setTrackSetting(muted, 1, { mute: false }), ARR, 'back to default = the field is gone');
  assert.deepEqual(setTrackSetting(ARR, 0, { volume: 100 }), ARR);
  assert.equal(setTrackSetting(ARR, 0, { volume: 50 }).tracks[0].volume, 50);
  assert.deepEqual(setTrackSetting(ARR, 5, { mute: true }), ARR);
  assert.deepEqual(setTrackSetting(ARR, 0, { volume: 500 }), ARR);
  assert.deepEqual(setTrackSetting(ARR, 0, { volume: 12.5 }), ARR);
  assert.notEqual(setTrackSetting(ARR, 0, { solo: true }), ARR, 'a new object; the input is never changed');
  assert.equal(ARR.tracks[0].solo, undefined);
});

test('the write path of the controls is the one New arrangement uses: applying a change to a fresh note gives exactly the note New arrangement would have made for the changed arrangement, keeps the person\'s own frontmatter lines, and is idempotent', () => {
  const fresh = newArrangementNote('arr_001', ARR);
  const w = applyArrangementWrite(fresh, 'arr_001', SETTINGS);
  assert.equal(w.ok, true);
  assert.equal(w.ok && w.text, newArrangementNote('arr_001', SETTINGS));
  const again = applyArrangementWrite(w.ok ? w.text : '', 'arr_001', SETTINGS);
  assert.equal(again.ok && again.text, w.ok && w.text, 'a second write of the same arrangement changes nothing');
  const own = fresh.replace('type: data\n', 'type: data\ncolour: red\n');
  const kept = applyArrangementWrite(own, 'arr_001', SETTINGS);
  assert.ok(kept.ok && kept.text.includes('colour: red'), 'the person\'s own frontmatter line stays');
  const broken = applyArrangementWrite('not a note', 'arr_001', SETTINGS);
  assert.equal(broken.ok, false);
});

test('the producer hands the engine each track\'s phrase name, mute, solo and volume (only those set); a track without them is handed exactly what it was before', async () => {
  const w = world();
  await produceArrangement(w.deps, newArrangementNote('arr_001', SETTINGS), 'arr_001');
  assert.deepEqual(w.received[0].tracks.map((t) => [t.kit, t.phrase, t.mute, t.solo, t.volume]), [['rock', 'phrase_003', undefined, true, 70], ['latin', 'phrase_009', true, undefined, undefined]]);
  const plain = world();
  await produceArrangement(plain.deps, newArrangementNote('arr_001', ARR), 'arr_001');
  assert.deepEqual(Object.keys(plain.received[0].tracks[0]).sort(), ['bars', 'channels', 'kit', 'phrase']);
});

test('every kit muted is ONE plain sentence, not an empty Score and not the engine\'s jargon', async () => {
  const w = world({ combine: () => { throw new Error('PythonError: ValueError: combine_tracks: every track is muted, so nothing plays; unmute a kit'); } });
  const out = await produceArrangement(w.deps, newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', mute: true }, { kit: 'latin', phrase: 'phrase_009', mute: true }] }), 'arr_001');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Every kit is muted, so nothing plays. Unmute one of them.');
});

// ---- 2026-10-29-0910: what the controls do to the note, and the bpm the tab header shows ------------------------------------------------------------------------------------------------

import { applySettingsPatches, tempoRangeOf } from './arrangement-core.ts';

test('a batch of control changes is applied to the CURRENT text of the note (one atomic read-modify-write in the view); the second change to the same track wins; an unreadable note changes nothing', () => {
  const fresh = newArrangementNote('arr_001', ARR);
  const w = applySettingsPatches(fresh, 'arr_001', [[1, { mute: true }], [0, { volume: 70 }], [0, { volume: 60 }]]);
  assert.equal(w.ok && w.text, newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003', volume: 60 }, { kit: 'latin', phrase: 'phrase_009', mute: true }] }));
  const undone = applySettingsPatches(w.ok ? w.text : '', 'arr_001', [[1, { mute: false }], [0, { volume: 100 }]]);
  assert.equal(undone.ok && undone.text, fresh, 'every change undone = the note as it was, byte for byte');
  const same = applySettingsPatches(fresh, 'arr_001', [[0, { mute: false }]]);
  assert.equal(same.ok && same.changed, false, 'a change that changes nothing writes nothing');
  assert.equal(applySettingsPatches('nope', 'arr_001', [[0, { mute: true }]]).ok, false);
});

test('tempoRangeOf: the first bar\'s bpm to the last bar\'s (a ritardando reads 100 to 80), null when there are no bars or no tempo', () => {
  const bar = (tempo_bpm?: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, channels: {}, ...(tempo_bpm === undefined ? {} : { tempo_bpm }) }) as never;
  assert.deepEqual(tempoRangeOf([bar(100), bar(90), bar(80)]), { from: 100, to: 80 });
  assert.deepEqual(tempoRangeOf([bar(120)]), { from: 120, to: 120 });
  assert.equal(tempoRangeOf([]), null);
  assert.equal(tempoRangeOf([bar()]), null);
});

// ---- gaps the mutation pass found (2026-10-29-0910) --------------------------------------------------------------------------------------------------------------------------------------

test('the Description says every setting once, in the same words each time: who is muted, who is solo, who is at which volume (grouped, in order of first appearance); 100 percent says nothing', () => {
  const three: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a', solo: true, volume: 70 }, { kit: 'latin', phrase: 'b', mute: true }, { kit: 'brush', phrase: 'c', volume: 70 }] };
  assert.equal(arrangementDescription('arr_001', three),
    'arr_001 — 3 tracks played together: [[a]] on the [[rock]] kit, [[b]] on the [[latin]] kit, [[c]] on the [[brush]] kit. A phrase that is shorter than the others rests until the longest one ends. All tracks play at the tempo of [[a]]. Muted: [[latin]]. Solo: [[rock]]. Volume 70 percent: [[rock]], [[brush]].');
  const two: ArrangementParams = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a', mute: true, volume: 40 }, { kit: 'latin', phrase: 'b', mute: true, volume: 70 }, { kit: 'brush', phrase: 'c', volume: 100 }, { kit: 'bells', phrase: 'd', mute: false, solo: false }] };
  assert.ok(arrangementDescription('arr_001', two).endsWith('Muted: [[rock]], [[latin]]. Volume 40 percent: [[rock]]. Volume 70 percent: [[latin]].'), arrangementDescription('arr_001', two));
});

test('the English steps for the settings, exactly: solo of two or three kits reads as a sentence, volume 0 and 99 are said, volume 100 and "off" flags are not', () => {
  const kits = (extra: object[]): ArrangementParams => ({ kind: 'arrangement', tracks: extra.map((e, i) => ({ kit: ['rock', 'latin', 'brush'][i], phrase: `p${i}`, ...e })) });
  assert.deepEqual(trackSettingsSteps(kits([{ solo: true }, { solo: true }])), ['Only the [[rock]] and [[latin]] kits play.']);
  assert.deepEqual(trackSettingsSteps(kits([{ solo: true }, { solo: true }, { solo: true }])), ['Only the [[rock]], [[latin]] and [[brush]] kits play.']);
  assert.deepEqual(trackSettingsSteps(kits([{ volume: 0 }, { volume: 99 }, { volume: 100 }])), ['Play the [[rock]] kit at 0 percent volume.', 'Play the [[latin]] kit at 99 percent volume.']);
  assert.deepEqual(trackSettingsSteps(kits([{ mute: false, solo: false }, {}])), []);
});

test('the Python passes only what is on: volume 0 and 99 yes, volume 100 and false flags no', () => {
  const py = arrangementPython({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'a', volume: 0 }, { kit: 'latin', phrase: 'b', volume: 99 }, { kit: 'brush', phrase: 'c', volume: 100, mute: false, solo: false }] });
  assert.match(py, /'bars': a\(\), 'volume': 0\}\)/);
  assert.match(py, /'bars': b\(\), 'volume': 99\}\)/);
  assert.match(py, /'bars': c\(\)\}\)/);
});

test('setTrackSetting at the edges: first and last track yes, one past either end no; volume 0 and 100 are the ends of the range, 101 and -1 are outside; only true or false is a flag; a flag set back to false is dropped', () => {
  assert.equal(setTrackSetting(ARR, 1, { mute: true }).tracks[1].mute, true, 'the last track');
  for (const bad of [-1, 2, 0.5, Number.NaN]) assert.equal(setTrackSetting(ARR, bad, { mute: true }), ARR, `track ${bad}`);
  assert.equal(setTrackSetting(ARR, 0, { volume: 0 }).tracks[0].volume, 0);
  assert.equal(setTrackSetting(ARR, 0, { volume: 99 }).tracks[0].volume, 99);
  for (const bad of [101, -1, 0.5, '50' as unknown as number, Number.NaN]) assert.equal(setTrackSetting(ARR, 0, { volume: bad }), ARR, `volume ${String(bad)}`);
  for (const bad of ['yes', 1, null]) { assert.equal(setTrackSetting(ARR, 0, { mute: bad as unknown as boolean }), ARR); assert.equal(setTrackSetting(ARR, 0, { solo: bad as unknown as boolean }), ARR); }
  const solo = setTrackSetting(ARR, 0, { solo: true });
  assert.equal(solo.tracks[0].solo, true);
  assert.equal('solo' in setTrackSetting(solo, 0, { solo: false }).tracks[0], false, 'solo off = the field is gone');
});

test('tempoRangeOf needs a tempo on BOTH the first and the last bar', () => {
  const bar = (tempo_bpm?: number) => ({ time_signature: '4/4', steps: 16, group_size: 4, channels: {}, ...(tempo_bpm === undefined ? {} : { tempo_bpm }) }) as never;
  assert.equal(tempoRangeOf([bar(100), bar()]), null);
  assert.equal(tempoRangeOf([bar(), bar(100)]), null);
});

// ---- 2026-10-31-1110 item 3 (CCQA smoke 9): "Every kit is muted" at once, decided from the note alone (no phrase read, no engine) ---------------------------------------------------------------------
const withTracks = (tracks: ArrangementParams['tracks']): ArrangementParams => ({ kind: 'arrangement', tracks });
test('nothingPlays mirrors the engine\'s rule (combine_tracks `sounds`): volume 0 never sounds, a solo track always does, otherwise a track sounds only when no track is solo and it is not muted', () => {
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003', mute: true }, { kit: 'latin', phrase: 'phrase_009', mute: true }])), true, 'both muted');
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003', mute: true }, { kit: 'latin', phrase: 'phrase_009' }])), false, 'one muted: the other plays');
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003', mute: true, solo: true }, { kit: 'latin', phrase: 'phrase_009', mute: true }])), false, 'solo wins over mute');
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003', volume: 0 }, { kit: 'latin', phrase: 'phrase_009', volume: 0 }])), true, 'volume 0 on every track');
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003', solo: true, volume: 0 }, { kit: 'latin', phrase: 'phrase_009' }])), true, 'a solo track at volume 0 does not sound, and solo silences the other');
  assert.equal(nothingPlays(withTracks([{ kit: 'rock', phrase: 'phrase_003' }])), false, 'a plain track');
  assert.equal(nothingPlays(withTracks([])), false, 'no tracks is a different refusal (the validator\'s), not "muted"');
});

test('produceArrangement with every kit muted answers ALL_MUTED from the note alone: no kit or phrase is read and the engine is not called; an unreadable or invalid note keeps its own refusal', async () => {
  const text = newArrangementNote('arr_001', withTracks([{ kit: 'rock', phrase: 'phrase_003', mute: true }, { kit: 'latin', phrase: 'phrase_009', mute: true }]));
  const touched: string[] = [];
  const deps: any = { phrases: { readNote: async (p: string) => { touched.push(p); throw new Error('must not be read'); } }, compute: async () => { touched.push('engine'); throw new Error('must not be called'); } };
  const out = await produceArrangement(deps, text, 'arr_001');
  assert.deepEqual(out, { kind: 'refusal', message: ALL_MUTED });
  assert.deepEqual(touched, []);
  const bad = await produceArrangement(deps, text.replace('"kind": "arrangement"', '"kind": "nope"'), 'arr_001');
  assert.equal(bad.kind, 'refusal'); assert.notEqual((bad as { message: string }).message, ALL_MUTED);
});
