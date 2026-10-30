// 2026-10-30-1000 (M10 slice 3) - navigation in an arrangement, the pure part: the engine's lineage read and checked, the note a row sends the notes pane to (the pair's own rule for each kind of phrase), the map of ROWS tied to the
// engine's MusicXML, the words of the inspector, and which rows a kit or a phrase lights. The drawn parts of the MusicXML are made by test-support/morph-xml.ts (one part per channel in canonical order, as the engine writes them).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARRANGEMENT_INSPECTOR_HINT, ARRANGEMENT_ROW_ROLE, FORGE_PHRASES_KEY, annotateArrangementPayload, arrangementLineageOf, barsPlayedBy, chipsOfRow, readLineage, rowId, rowIdsPlayedBy, rowSource, type LineageBar,
} from './arrangement-nav-core.ts';
import type { PhraseParams } from './phrase-core.ts';
import { morphXml } from './test-support/morph-xml.ts';

const bar = (channels: string[], tempo = 100): any => ({ time_signature: '4/4', steps: 4, group_size: 1, tempo_bpm: tempo, channels: Object.fromEntries(channels.map((c) => [c, [true, false, true, false]])) });
const ROCK = ['kick', 'snare'], LATIN = ['bell', 'claves'];
/** rock plays phrase_003 for 4 bars, latin plays phrase_009 for 2 bars (then rests); the arrangement plays at 100 bpm, latin's own bars came with 120. */
const BARS = [bar([...ROCK, ...LATIN]), bar([...ROCK, ...LATIN]), bar([...ROCK, ...LATIN]), bar([...ROCK, ...LATIN])];
const lineage = (): any[] => [1, 2, 3, 4].map((n) => ({
  bar: n, tempo_bpm: 100,
  channels: { kick: { kit: 'rock', phrase: 'phrase_003', bar: n }, snare: { kit: 'rock', phrase: 'phrase_003', bar: n }, bell: { kit: 'latin', phrase: 'phrase_009', bar: n <= 2 ? n : null }, claves: { kit: 'latin', phrase: 'phrase_009', bar: n <= 2 ? n : null } },
  retimed_from: n <= 2 ? { latin: 120 } : {},
}));
const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ multi_staff_content: morphXml(BARS, [100, 100, 100, 100]), bars_data: BARS, arrangement_lineage: lineage(), ...over });
const PHRASES: Record<string, PhraseParams> = {
  phrase_003: { kind: 'extend', source: 'bar_007', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '3': 'bars/bar_010' } },
  phrase_009: { kind: 'morph', a: 'bar_008', b: 'bar_011', bars: 2, order: 'musical', seed: 0 } as any,
};

// ---- the lineage the engine gives ---------------------------------------------------------------------------------------------------------------------------------------------

test('readLineage: the engine\'s lineage becomes bars of {kit, phrase, bar}; a phrase that has ended is bar null; only numbers survive in retimed_from', () => {
  const r = readLineage(lineage(), 4) as LineageBar[];
  assert.equal(r.length, 4);
  assert.deepEqual(r[2].channels.bell, { kit: 'latin', phrase: 'phrase_009', bar: null });
  assert.deepEqual(r[0].retimed_from, { latin: 120 });
  assert.deepEqual(r[3].retimed_from, {});
  const odd = lineage(); odd[0].retimed_from = { latin: 'fast', rock: 90 }; odd[0].tempo_bpm = 'x';
  const o = readLineage(odd, 4) as LineageBar[];
  assert.deepEqual(o[0].retimed_from, { rock: 90 });
  assert.equal(o[0].tempo_bpm, null);
});

test('readLineage: every way the lineage can be wrong is a sentence, never a throw and never a guess', () => {
  assert.match(readLineage(undefined, 4) as string, /did not say which kit and phrase/);
  assert.match(readLineage(lineage().slice(0, 3), 4) as string, /gave 3 bar\(s\) of lineage for 4 bar\(s\)/);
  const wrongBar = lineage(); wrongBar[1].bar = 5;
  assert.match(readLineage(wrongBar, 4) as string, /lineage of bar 2 is not in the shape/);
  const noKit = lineage(); delete noKit[2].channels.kick.kit;
  assert.match(readLineage(noKit, 4) as string, /bar 3, kick, names no kit/);
  const badBar = lineage(); badBar[0].channels.snare.bar = 'two';
  assert.match(readLineage(badBar, 4) as string, /bar 1, snare, has a bar that is not a number/);
  const noChannels = lineage(); noChannels[3] = { bar: 4 };
  assert.match(readLineage(noChannels, 4) as string, /lineage of bar 4/);
  const missing = lineage(); delete missing[0].channels.bell.phrase;
  assert.equal((readLineage(missing, 4) as LineageBar[])[0].channels.bell.phrase, null, 'a track with no phrase name has phrase null');
});

test('rowId is the measure id of the phrase tab, the channel after it', () => {
  assert.equal(rowId(3, 'kick'), 'ph_bar_3_kick');
  assert.equal(rowId(12, 'conga_low'), 'ph_bar_12_conga_low');
});

// ---- the note a row sends the notes pane to -----------------------------------------------------------------------------------------------------------------------------------

test('rowSource: the bar note the phrase got this bar from when the pair\'s rule gives one (a fork first, then extend\'s source, a morph\'s nearer end, a mix by vote)', () => {
  assert.deepEqual(rowSource('phrase_003', 2, PHRASES), { noteId: 'bars/bar_007', reason: 'pinned bar 2' }, 'an extend: its source');
  assert.deepEqual(rowSource('phrase_003', 3, PHRASES), { noteId: 'bars/bar_010', reason: 'forked' }, 'bar 3 is a fork: the fork note, whatever the source says');
  assert.deepEqual(rowSource('phrase_009', 1, PHRASES), { noteId: 'bars/bar_008', reason: 'pinned bar 1' }, 'a morph: bar a up to the middle');
  assert.deepEqual(rowSource('phrase_009', 2, PHRASES), { noteId: 'bars/bar_011', reason: 'pinned bar 2' }, 'a morph: bar b after it');
  const vote: Record<string, PhraseParams> = { m: { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.7, threshold: 0.5, ghost: false } };
  assert.equal(rowSource('m', 1, vote)?.noteId, 'bars/bar_001');
  assert.equal(rowSource('m', 1, { m: { ...(vote.m as any), weight: 0.4 } })?.noteId, 'bars/bar_002');
  assert.equal(rowSource('m', 1, { m: { ...(vote.m as any), weight: 0.5 } })?.noteId, 'bars/bar_001', 'a tie goes to a, as the strip lights it');
});

test('rowSource: where the pair\'s rule gives no bar note the row sends the pane to the phrase\'s own note (a transform, a mix by path, a phrase that could not be read)', () => {
  const t: Record<string, PhraseParams> = { t: { kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 } as any] } };
  assert.deepEqual(rowSource('t', 2, t), { noteId: 'phrases/t', reason: 'pinned bar 2' });
  const forked: Record<string, PhraseParams> = { t: { ...(t.t as any), overrides: { '2': 'bars/bar_020' } } };
  assert.deepEqual(rowSource('t', 2, forked), { noteId: 'bars/bar_020', reason: 'forked' }, 'a transform\'s fork is a bar note');
  const path: Record<string, PhraseParams> = { p: { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.7, threshold: 0.5, ghost: false, mode: 'path' } };
  assert.equal(rowSource('p', 1, path)?.noteId, 'phrases/p', 'a path mix\'s bar depends on a state the arrangement does not have');
  assert.equal(rowSource('phrase_404', 1, PHRASES)?.noteId, 'phrases/phrase_404', 'a phrase the producer did not read');
  assert.equal(rowSource('phrase_404', 1, {})?.noteId, 'phrases/phrase_404');
});

test('rowSource: a phrase that has ended is its own note saying so; a track with no phrase name has no source', () => {
  assert.deepEqual(rowSource('phrase_009', null, PHRASES), { noteId: 'phrases/phrase_009', reason: 'phrase ended' });
  assert.equal(rowSource(null, 1, PHRASES), null);
  assert.equal(rowSource(null, null, PHRASES), null);
});

test('rowSource: a fork value written as a bare name or as a path is the same bar note', () => {
  const a: Record<string, PhraseParams> = { x: { kind: 'extend', source: 'bar_007', bars: 2, style: 'repeat', tempo_change_pct: 0, overrides: { '1': 'bar_031' } } as any };
  const b: Record<string, PhraseParams> = { x: { ...(a.x as any), overrides: { '1': 'bars/bar_031' } } };
  assert.equal(rowSource('x', 1, a)?.noteId, 'bars/bar_031');
  assert.equal(rowSource('x', 1, b)?.noteId, 'bars/bar_031');
});

// ---- the map of rows ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('annotate: a row for every channel of every bar, tied to the kit, the phrase and the phrase bar the engine said; the measures carry the phrase tab\'s ids; the first row of the map is bar 1\'s first staff', () => {
  const r = annotateArrangementPayload('arrangements/arr_001', payload({ [FORGE_PHRASES_KEY]: PHRASES }));
  assert.deepEqual(r.problems, []);
  assert.equal(Object.keys(r.map).length, 16, '4 bars x 4 channels');
  assert.equal(Object.keys(r.map)[0], 'ph_bar_1_kick');
  assert.deepEqual(Object.keys(r.map).slice(0, 5), ['ph_bar_1_kick', 'ph_bar_1_snare', 'ph_bar_1_bell', 'ph_bar_1_claves', 'ph_bar_2_kick']);
  for (const n of [1, 2, 3, 4]) assert.match(r.payload.multi_staff_content as string, new RegExp(`<measure number="${n}" id="ph_bar_${n}">`));
  const bell2 = r.map['ph_bar_2_bell'];
  assert.equal(bell2.role, ARRANGEMENT_ROW_ROLE);
  assert.equal(bell2.noteId, 'arrangements/arr_001');
  assert.deepEqual(bell2.params, { bar: 2, bars: 4, staff: 2, channel: 'bell', kit: 'latin', phrase: 'phrase_009', phraseBar: 2, ended: false, tempo: 100, tempoBpm: 100, cameWith: 120, sourceNote: 'bars/bar_011', sourceReason: 'pinned bar 2' });
  const rock3 = r.map['ph_bar_3_kick'].params;
  assert.deepEqual([rock3.sourceNote, rock3.sourceReason, rock3.cameWith], ['bars/bar_010', 'forked', null], 'rock came with 100 (not re-timed): cameWith is null');
  const gone = r.map['ph_bar_3_claves'].params;
  assert.deepEqual([gone.ended, gone.phraseBar, gone.sourceNote, gone.sourceReason], [true, null, 'phrases/phrase_009', 'phrase ended']);
});

test('annotate: the staff index of a row is its place among the channels the Score draws (a muted kit\'s channels are not drawn and leave no gap)', () => {
  const bars = BARS.map((b) => ({ ...b, channels: { kick: b.channels.kick, claves: b.channels.claves } }));
  const lin = lineage().map((l) => ({ ...l, channels: { kick: l.channels.kick, claves: l.channels.claves } }));
  const r = annotateArrangementPayload('arrangements/arr_001', { multi_staff_content: morphXml(bars), bars_data: bars, arrangement_lineage: lin });
  assert.deepEqual(r.problems, []);
  assert.equal(r.map['ph_bar_1_kick'].params.staff, 0);
  assert.equal(r.map['ph_bar_1_claves'].params.staff, 1);
  assert.equal(Object.keys(r.map).length, 8);
});

test('annotate: a payload that cannot be tied says why and ties NOTHING (no map, the payload unchanged)', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['no bars', payload({ bars_data: undefined }), /did not return the bars it drew/],
    ['empty bars', payload({ bars_data: [] }), /did not return the bars it drew/],
    ['no lineage (an engine before 0910)', payload({ arrangement_lineage: undefined }), /did not say which kit and phrase/],
    ['lineage of another length', payload({ arrangement_lineage: lineage().slice(1) }), /3 bar\(s\) of lineage for 4/],
    ['no MusicXML', payload({ multi_staff_content: undefined }), /carries no MusicXML/],
    ['a channel the map does not know', payload({ bars_data: BARS.map((b) => ({ ...b, channels: { ...b.channels, cowbell: [true] } })) }), /channel\(s\) the provenance map does not know: cowbell/],
    ['fewer parts than channels', payload({ multi_staff_content: morphXml(BARS.map((b) => ({ ...b, channels: { kick: b.channels.kick } }))) }), /1 part\(s\) but the bars have 4 channel\(s\)/],
    ['fewer bars than the data', payload({ multi_staff_content: morphXml(BARS.slice(0, 3)) }), /3 bars but the phrase asks for 4/],
    ['a measure that already has an id', payload({ multi_staff_content: (morphXml(BARS) as string).replace('<measure number="1">', '<measure number="1" id="x">') }), /already carries an id/],
  ];
  for (const [what, p, expected] of cases) {
    const r = annotateArrangementPayload('arrangements/arr_001', p);
    assert.match(r.problems[0] ?? '(no problem)', expected, what);
    assert.deepEqual(r.map, {}, what);
    assert.equal(r.payload, p, `${what}: the very same payload comes back`);
  }
});

test('annotate: the Kit view is never tied, and says so (one quiet line, never a blocker); without the producer\'s phrases every source is the phrase\'s own note', () => {
  const r = annotateArrangementPayload('arrangements/arr_001', payload({ kit_content: morphXml(BARS) }));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.kitProblems, ['the rows of an arrangement are not tied in the Kit view']);
  assert.match(r.payload.kit_content as string, /id="ph_bar_1"/, 'the Kit view\'s measures carry the bar ids as a phrase\'s do');
  assert.equal(r.map['ph_bar_1_kick'].params.sourceNote, 'phrases/phrase_003');
  assert.deepEqual(annotateArrangementPayload('arrangements/arr_001', payload()).kitProblems, []);
});

test('annotate never throws: a MusicXML the scanner cannot read is a sentence', () => {
  const r = annotateArrangementPayload('arrangements/arr_001', payload({ multi_staff_content: '<score-partwise><part id="P1"><measure number="1"><note><rest/></note></measure></part></score-partwise>' }));
  assert.equal(r.problems.length, 1);
  assert.deepEqual(r.map, {});
});

// ---- the words of the inspector -------------------------------------------------------------------------------------------------------------------------------------------------

const row = (bar: number, channel: string): any => annotateArrangementPayload('arrangements/arr_001', payload({ [FORGE_PHRASES_KEY]: PHRASES })).map[rowId(bar, channel)];

test('the stack of a row: the one line, the row, the phrase, the bar note it came from and the kit, each a link; a re-timed kit says what it came with', () => {
  const s = arrangementLineageOf(row(2, 'bell'));
  assert.equal(s[0].text, 'bar 2 of 4 · latin kit · phrase_009 bar 2 · played at 100 bpm (came with 120)');
  assert.equal(s[0].kind, 'bar'); assert.equal(s[0].covers, 'self');
  assert.deepEqual(s.slice(1).map((e) => [e.kind, e.text, e.noteId, e.openLabel]), [
    ['hit', 'bell row', undefined, undefined],
    ['note', 'phrase phrase_009', 'phrases/phrase_009', 'Open phrase_009'],
    ['note', 'bar made from bar_011', 'bars/bar_011', 'Open bar_011'],
    ['note', 'latin kit', 'kits/latin', 'Open latin'],
  ]);
  const rock = arrangementLineageOf(row(2, 'kick'));
  assert.equal(rock[0].text, 'bar 2 of 4 · rock kit · phrase_003 bar 2 · played at 100 bpm', 'a kit that was not re-timed says only the tempo');
});

test('the stack of a forked bar says it was edited in its own note; a whole-number tempo has no decimals and a fractional one has one', () => {
  const forked = arrangementLineageOf(row(3, 'snare'));
  assert.deepEqual(forked.find((e) => e.noteId === 'bars/bar_010'), { kind: 'note', text: 'forked: edited in bar_010', noteId: 'bars/bar_010', openLabel: 'Open bar_010' });
  const p = row(2, 'bell'); p.params = { ...p.params, tempoBpm: 97.5, cameWith: 120 };
  assert.match(arrangementLineageOf(p)[0].text, /played at 97\.5 bpm \(came with 120\)$/);
});

test('a bar past a shorter phrase\'s end says so in plain words and plays at no tempo', () => {
  const s = arrangementLineageOf(row(3, 'bell'));
  assert.equal(s[0].text, 'bar 3 of 4 · latin kit · the latin phrase has ended: the kit rests');
  assert.deepEqual(s.filter((e) => e.kind === 'note').map((e) => e.noteId), ['phrases/phrase_009', 'kits/latin'], 'its phrase and its kit; no bar note: it plays none');
});

test('a track with no phrase name has the kit only; anything that is not a row falls back to the plain stack', () => {
  const p = row(1, 'kick'); p.params = { ...p.params, phrase: null, phraseBar: null, sourceNote: undefined };
  const s = arrangementLineageOf(p);
  assert.equal(s[0].text, 'bar 1 of 4 · rock kit');
  assert.deepEqual(s.filter((e) => e.kind === 'note').map((e) => e.noteId), ['kits/rock']);
  assert.deepEqual(arrangementLineageOf({ noteId: 'bars/bar_001', role: 'hit', params: {} }).map((e) => e.kind), ['hit', 'note']);
});

// ---- who lights what --------------------------------------------------------------------------------------------------------------------------------------------------------------

test('barsPlayedBy and rowIdsPlayedBy: a kit or a phrase lights its rows in the bars where it sounds, and only there; a note that is neither lights nothing', () => {
  const l = readLineage(lineage(), 4) as LineageBar[];
  assert.deepEqual(barsPlayedBy(l, 'kits/rock'), [1, 2, 3, 4]);
  assert.deepEqual(barsPlayedBy(l, 'kits/latin'), [1, 2], 'latin rests from bar 3');
  assert.deepEqual(barsPlayedBy(l, 'phrases/phrase_009'), [1, 2]);
  assert.deepEqual(barsPlayedBy(l, 'phrases/phrase_003'), [1, 2, 3, 4]);
  assert.deepEqual(rowIdsPlayedBy(l, 'kits/latin'), ['ph_bar_1_bell', 'ph_bar_1_claves', 'ph_bar_2_bell', 'ph_bar_2_claves']);
  assert.deepEqual(rowIdsPlayedBy(l, 'phrases/phrase_003').length, 8);
  for (const other of ['arrangements/arr_001', 'bars/bar_007', 'kits', 'phrases']) { assert.deepEqual(barsPlayedBy(l, other), [], other); assert.deepEqual(rowIdsPlayedBy(l, other), [], other); }
  assert.deepEqual(barsPlayedBy(l, 'kits/brush'), [], 'a kit that is not in the arrangement');
});

test('chipsOfRow: the phrase chip and the kit chip a pinned row came from; a track with no phrase has the kit only; not a row = none', () => {
  assert.deepEqual(chipsOfRow(row(2, 'bell')), ['phrases/phrase_009', 'kits/latin']);
  const p = row(1, 'kick'); p.params = { ...p.params, phrase: null };
  assert.deepEqual(chipsOfRow(p), ['kits/rock']);
  assert.deepEqual(chipsOfRow({ noteId: 'bars/bar_001', role: 'hit', params: { kit: 'x' } }), []);
});


// ---- gaps the mutation pass found (2026-10-30-1000) ---------------------------------------------------------------------------------------------------------------------------------------

test('readLineage: an older engine that omits retimed_from (or gives null) and a tempo that is not a finite number are read as "nothing re-timed" and "no tempo", not as a failure; only finite numbers survive in retimed_from', () => {
  const l = lineage(); delete l[0].retimed_from; l[1].retimed_from = null; l[2].retimed_from = { latin: Infinity, rock: 90, bell: Number.NaN }; l[3].tempo_bpm = Infinity;
  const r = readLineage(l, 4) as LineageBar[];
  assert.deepEqual(r[0].retimed_from, {});
  assert.deepEqual(r[1].retimed_from, {});
  assert.deepEqual(r[2].retimed_from, { rock: 90 }, 'Infinity and NaN are not a tempo');
  assert.equal(r[3].tempo_bpm, null);
});

test('rowSource: a morph\'s fork is the fork note too (the fork is looked for in extends, morphs and transforms alike)', () => {
  const morphForked: Record<string, PhraseParams> = { m: { kind: 'morph', a: 'bar_008', b: 'bar_011', bars: 4, order: 'musical', seed: 0, overrides: { '2': 'bars/bar_040' } } as any };
  assert.deepEqual(rowSource('m', 2, morphForked), { noteId: 'bars/bar_040', reason: 'forked' });
  assert.equal(rowSource('m', 1, morphForked)?.noteId, 'bars/bar_008', 'and a bar that is not forked is the nearer end, as ever');
});

test('annotate: the Score payload may carry its MusicXML as `content` when it has no multi_staff_content (the single-part form); and what is not a bar of the drawn bars is refused in a sentence', () => {
  const plain = { ...payload() } as Record<string, unknown>; plain.content = plain.multi_staff_content; delete plain.multi_staff_content;
  const r = annotateArrangementPayload('arrangements/arr_001', plain);
  assert.deepEqual(r.problems, []);
  assert.match(r.payload.content as string, /id="ph_bar_1"/, 'tagged where it was found');
  assert.equal('multi_staff_content' in r.payload, false);
  const noChannels = annotateArrangementPayload('arrangements/arr_001', payload({ bars_data: [{ tempo_bpm: 100 }, ...BARS.slice(1)] }));
  assert.match(noChannels.problems[0], /did not return the bars it drew/, 'a bar with no channels at all');
  const notBar = annotateArrangementPayload('arrangements/arr_001', payload({ bars_data: [{ channels: 'kick' }, ...BARS.slice(1)] }));
  assert.match(notBar.problems[0], /did not return the bars it drew/, 'channels that are not an object');
});

test('annotate: it names every channel it does not know, comma separated; a MusicXML with no readable divisions and a lineage that leaves out a drawn channel are sentences that tie nothing', () => {
  const two = annotateArrangementPayload('arrangements/arr_001', payload({ bars_data: BARS.map((b) => ({ ...b, channels: { ...b.channels, cowbell: [true], maracas: [true] } })) }));
  assert.match(two.problems[0], /channel\(s\) the provenance map does not know: cowbell, maracas$/);
  const noDivisions = annotateArrangementPayload('arrangements/arr_001', payload({ multi_staff_content: (morphXml(BARS) as string).replace('<divisions>4</divisions>', '') }));
  assert.equal(noDivisions.problems[0], 'the multi-staff MusicXML could not be scanned');
  assert.deepEqual(noDivisions.map, {});
  const l = lineage(); delete l[1].channels.snare;
  const missing = annotateArrangementPayload('arrangements/arr_001', payload({ arrangement_lineage: l }));
  assert.equal(missing.problems[0], 'the lineage of bar 2 does not say who plays snare');
  assert.deepEqual(missing.map, {});
});

test('annotate: no Kit view in the payload means no kit_content key in the result (not a null one); and a phrase the producer sent that cannot be read is a sentence, logged, never a throw', () => {
  const r = annotateArrangementPayload('arrangements/arr_001', payload());
  assert.equal('kit_content' in r.payload, false);
  const logged: unknown[][] = []; const saved = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const bad = annotateArrangementPayload('arrangements/arr_001', payload({ [FORGE_PHRASES_KEY]: { phrase_003: null } }));
    assert.match(bad.problems[0], /^the rows could not be tied to the arrangement \(/);
    assert.deepEqual(bad.map, {});
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], 'annotateArrangementPayload failed');
  } finally { console.error = saved; }
});

test('the stack reads what it is given with care: an empty name is no name, a tempo that is not finite is no tempo, a missing kit is a question mark', () => {
  const p = row(2, 'bell');
  p.params = { ...p.params, kit: '', phrase: '', tempoBpm: Infinity, cameWith: Infinity };
  const s = arrangementLineageOf(p);
  assert.equal(s[0].text, 'bar 2 of 4 · ? kit', 'no kit name, no phrase name, no tempo to play at');
  assert.deepEqual(s.filter((e) => e.kind === 'note').map((e) => e.noteId), ['bars/bar_011', 'kits/?'], 'the bar note stays; the phrase note needs a name');
  const infinite = row(2, 'bell'); infinite.params = { ...infinite.params, tempoBpm: Infinity };
  assert.equal(arrangementLineageOf(infinite)[0].text, 'bar 2 of 4 · latin kit · phrase_009 bar 2', 'a tempo that is not finite is not printed');
  const noBar = row(2, 'bell'); noBar.params = { ...noBar.params, phraseBar: Infinity };
  assert.match(arrangementLineageOf(noBar)[0].text, /the latin phrase has ended/, 'a phrase bar that is not finite counts as no bar');
});

test('a one-letter kit or phrase name is a name (the stack reads names by "not empty", not by "longer than one")', () => {
  const p = row(2, 'bell'); p.params = { ...p.params, kit: 'x', phrase: 'y' };
  const s = arrangementLineageOf(p);
  assert.match(s[0].text, /^bar 2 of 4 · x kit · y bar 2 /);
  assert.deepEqual(s.filter((e) => e.kind === 'note').map((e) => e.noteId), ['phrases/y', 'bars/bar_011', 'kits/x']);
});

test('barsPlayedBy and rowIdsPlayedBy: only a note under kits/ or phrases/ names a kit or a phrase (a bar note or an arrangement with the same name lights nothing), and a track with no phrase name is never lit by a note that is neither', () => {
  const l = readLineage(lineage(), 4) as LineageBar[];
  for (const lookalike of ['bars/phrase_003', 'arrangements/phrase_009', 'notes/rock', 'kits-old/rock']) { assert.deepEqual(barsPlayedBy(l, lookalike), [], lookalike); assert.deepEqual(rowIdsPlayedBy(l, lookalike), [], lookalike); }
  const anonymous = lineage().map((b) => ({ ...b, channels: { kick: { kit: 'rock', phrase: undefined, bar: b.bar } } }));
  const a = readLineage(anonymous, 4) as LineageBar[];
  assert.deepEqual(barsPlayedBy(a, 'bars/bar_001'), [], 'a track with no phrase name is not lit by a bar note');
  assert.deepEqual(rowIdsPlayedBy(a, 'bars/bar_001'), []);
  assert.deepEqual(barsPlayedBy(a, 'kits/rock'), [1, 2, 3, 4], 'but its kit lights it');
});

test('the hint says what to do in plain words', () => {
  assert.equal(ARRANGEMENT_INSPECTOR_HINT, 'Click a row of a bar to see which kit and which phrase played it. Arrow keys move between rows; Esc lets go.');
});
