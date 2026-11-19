// 2026-11-19-0992 - DUPLICATE: THE EFFECT, the pure part (no obsidian, no vault): a new bar note `bars/bar_NNN` (the next free number by the plugin's own rule), a BYTE-FOR-BYTE copy of the source bar's data (the json block: steps, kit rows,
// tempo, swing), fresh front matter and a description that says it is a copy; the source note is never written; a phrase, an arrangement and a composition are copied under the next free name by their own rule (a list note: the copy is its own
// list; a composition copy is never the root of the piece); a note with a hand edit or custom Python is refused in words; unknown or unreadable sources are refused in words; undo is NOT claimed (the words say how to delete a copy).
// Written RED first. Every text is a string; the "source untouched" assertions compare the string held before and after, and count the writes the ports saw (exactly ONE: the create).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { copyBarNote, copyListNote, copyNoteText, copyUndoNote, createdLine, duplicateNote, type DuplicatePorts } from './duplicate-note-core.ts';
import { resolveDuplicateTarget, type ResolvedDuplicate } from './duplicate-sentence-core.ts';
import { barOriginOf, hasBarProvenance, keepBarProvenance } from './bar-provenance-core.ts';
import { applySave, extractJsonBlock, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { planNewBar } from './score-first-core.ts';
import { withRoot, isRootNote } from './composition-root-core.ts';
import { emptyCompositionNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { replayGrammar } from './sentence-list-core.ts';
import { listOfNote, writeListNote } from './sentence-list-note-core.ts';
import { readCompositionNote } from './composition-core.ts';
import { readPhraseNote } from './phrase-core.ts';
import { PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { ARR_001, C6_LINES, VAULT } from './test-support/sentence-list-fixtures.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
/** A bar with everything a copy must keep: a swing, a tempo with a fraction, a velocity in a kit row, an empty row. */
const DATA: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 33, tempo_bpm: 87.5, channels: { kick: row(0, 8), snare: row(4, 12), hihat: [100, 0, 60, 0, 100, 0, 60, 0, 100, 0, 60, 0, 100, 0, 60, 0] as never, bell: row() } };
/** A real bar note: the one "New bar" writes (provenance sections and all), with DATA in its fence. */
function barNote(name: string, d: RhythmData = DATA): string {
  const plan = planNewBar({ existingBasenames: [], exists: () => false });
  assert.equal(plan.ok, true); const t = (plan as { content: string }).content;
  const b = extractJsonBlock(t); assert.equal(b.ok, true); const blk = b as Extract<typeof b, { ok: true }>;
  return (t.slice(0, blk.contentStart) + formatRhythmJson(d) + t.slice(blk.contentEnd)).replace(/bar_001/g, name);
}
const BAR_007 = barNote('bar_007');

// ---- the in-memory vault the ports stand on -------------------------------------------------------------------------------------------------------------------------------------------------
function world(files: Record<string, string>) {
  const store = new Map(Object.entries(files)); const creates: Array<{ path: string; content: string }> = []; let writesToExisting = 0; const takenInRace = new Set<string>();
  const ports: DuplicatePorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    listBasenames: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    exists: (p) => store.has(p),
    create: async (p, content) => { if (store.has(p) || takenInRace.has(p)) { throw new Error('File already exists.'); } if (store.has(p)) writesToExisting++; store.set(p, content); creates.push({ path: p, content }); },
    isAlreadyExists: (e) => /already exists/i.test((e as Error)?.message ?? ''),
  };
  return { store, creates, ports, takenInRace, existingWrites: () => writesToExisting, snapshot: () => new Map(store) };
}
const target = (name: string, v = VAULT): ResolvedDuplicate => { const r = resolveDuplicateTarget(name, v); assert.equal(r.ok, true, name); return r as ResolvedDuplicate; };
const BARS_VAULT = { ...VAULT, bars: ['bar_001', 'bar_002', 'bar_007'] };

// ---- a bar ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('copyBarNote: the json block is the source\'s BYTE FOR BYTE (steps, kit rows, tempo, swing, every velocity); the copy reads as a rhythm note with the same data', () => {
  const r = copyBarNote(BAR_007, 'bar_010', 'bar_007'); assert.equal(r.ok, true); const text = (r as { text: string }).text;
  const a = extractJsonBlock(BAR_007), b = extractJsonBlock(text); assert.ok(a.ok && b.ok);
  const fenceOf = (t: string, blk: { fenceStart: number }) => t.slice(blk.fenceStart);
  assert.equal(fenceOf(text, b as never), fenceOf(BAR_007, a as never), 'from the opening fence line to the end of the note: the same bytes');
  const src = readRhythmNote(BAR_007), cp = readRhythmNote(text); assert.ok(src.ok && cp.ok);
  assert.deepEqual((cp as never as { value: { data: RhythmData } }).value.data, DATA); assert.deepEqual((cp as never as { value: { data: RhythmData } }).value.data, (src as never as { value: { data: RhythmData } }).value.data);
  assert.ok(text.includes('"swing_pct": 33') && text.includes('"tempo_bpm": 87.5'));
});

test('copyBarNote: FRESH front matter, a description that says it is a copy, the copy\'s own provenance sections; nothing of the source\'s front matter is carried; it is a data note the Beat Box opens', () => {
  const src = BAR_007.replace('type: data\n', 'type: data\nsome_property: from the source\nlinks:\n  - "[[phrase_001]]"\n');
  const text = (copyBarNote(src, 'bar_010', 'bar_007') as { text: string }).text;
  const fm = parseFrontmatter(text)!;
  assert.equal(fm.fields.type, 'data'); assert.equal(fm.fields.content_type, 'json');
  assert.ok(String(fm.fields.description).includes('bar_010') && /a copy of \[\[bar_007\]\]/.test(String(fm.fields.description)), String(fm.fields.description));
  assert.ok(!('some_property' in fm.fields), 'fresh front matter: the source\'s own properties do not travel');
  assert.ok(!text.includes('phrase_001'), 'nor does its links list');
  assert.match(text, /# Description\s+A copy of \[\[bar_007\]\]/, 'the provenance sentence says it is a copy');
  assert.equal(hasBarProvenance(text), true); assert.equal(readRhythmNote(text).ok, true);
});

test('a copy knows where it came from (barOriginOf), and the Beat Box save keeps that: the sections are rewritten for the data saved, with the SAME origin, and a second write changes nothing', () => {
  const text = (copyBarNote(BAR_007, 'bar_010', 'bar_007') as { text: string }).text;
  assert.deepEqual(barOriginOf(text), { kind: 'copy', of: 'bar_007' });
  const d2: RhythmData = { ...DATA, tempo_bpm: 90, swing_pct: 10 };
  const saved = applySave(text, (readRhythmNote(text) as never as { value: { fingerprint: string } }).value.fingerprint, d2, keepBarProvenance);
  assert.equal(saved.ok, true); const after = (saved as { text: string }).text;
  assert.deepEqual(barOriginOf(after), { kind: 'copy', of: 'bar_007' }, 'a save does not turn a copy into "made by hand"');
  assert.match(after, /# Description\s+A copy of \[\[bar_007\]\]/); assert.ok(after.includes('"tempo_bpm": 90'));
  assert.equal(keepBarProvenance(after, d2), after, 'idempotent');
});

test('copyBarNote: a source that is not a readable bar is refused in plain words (no copy is made of an unreadable note)', () => {
  const bad = (t: string): string => { const r = copyBarNote(t, 'bar_010', 'bar_007'); assert.equal(r.ok, false); return (r as { message: string }).message; };
  assert.match(bad('just some text'), /bar_007/); assert.match(bad(BAR_007.replace('```json', '```text')), /bar_007/);
  assert.match(bad(BAR_007.replace('"steps": 16', '"steps": "many"')), /bar_007/);
  for (const t of ['just some text']) assert.ok(!/undefined|\[object/.test(bad(t)));
});

test('duplicateNote of a bar: ONE create, at the next free number by the plugin\'s own rule (one past the highest, not the first gap); the source and every other note are untouched', async () => {
  const w = world({ 'bars/bar_001.md': barNote('bar_001'), 'bars/bar_002.md': barNote('bar_002'), 'bars/bar_007.md': BAR_007, 'bars/README.md': 'readme', 'phrases/phrase_001.md': emptyPhraseNote('phrase_001') });
  const before = w.snapshot();
  const r = await duplicateNote(w.ports, target('bar_007', BARS_VAULT), BARS_VAULT);
  assert.equal(r.ok, true); const ok = r as Extract<typeof r, { ok: true }>;
  assert.equal(ok.name, 'bar_008', 'one past the highest bar_NNN (the gaps at 003 to 006 are not reused)'); assert.equal(ok.path, 'bars/bar_008.md'); assert.equal(ok.id, 'bars/bar_008'); assert.equal(ok.sourceName, 'bar_007');
  assert.deepEqual(w.creates.map((c) => c.path), ['bars/bar_008.md'], 'exactly one write: the create'); assert.equal(w.existingWrites(), 0);
  for (const [p, t] of before) assert.equal(w.store.get(p), t, `${p} is byte for byte what it was`);
  assert.equal(w.store.size, before.size + 1);
  assert.equal(copyOf(w.store.get('bars/bar_008.md')!), copyOf(BAR_007));
});
const copyOf = (t: string): string => { const b = extractJsonBlock(t); assert.ok(b.ok); return t.slice((b as { fenceStart: number }).fenceStart); };

test('the number rule is the plugin\'s own: bar_009 taken by a name that is not a bar still counts nothing; a race for the name ("File already exists") tries the next number, and the retries are DIFFERENT names', async () => {
  const w = world({ 'bars/bar_007.md': BAR_007, 'bars/bar_099x.md': 'not a bar_NNN name' });
  w.takenInRace.add('bars/bar_008.md'); w.takenInRace.add('bars/bar_009.md');
  const r = await duplicateNote(w.ports, target('bar_007', BARS_VAULT), BARS_VAULT);
  assert.equal(r.ok, true); assert.equal((r as { name: string }).name, 'bar_010', 'two names were taken in the same instant: the third attempt');
  const w2 = world({ 'bars/bar_007.md': BAR_007 }); for (const n of [8, 9, 10, 11]) w2.takenInRace.add(`bars/bar_0${String(n).padStart(2, '0')}.md`);
  const r2 = await duplicateNote(w2.ports, target('bar_007', BARS_VAULT), BARS_VAULT);
  assert.equal(r2.ok, false); assert.match((r2 as { message: string }).message, /name kept being taken|try again/i); assert.equal(w2.creates.length, 0);
});

test('a source that is gone, unreadable, or not a bar is refused in plain words and NOTHING is created; the failure is logged with console.error', async () => {
  const errs: unknown[][] = []; const orig = console.error; console.error = (...a: unknown[]) => { errs.push(a); };
  try {
    const gone = world({}); const r1 = await duplicateNote(gone.ports, target('bar_007', BARS_VAULT), BARS_VAULT);
    assert.equal(r1.ok, false); assert.match((r1 as { message: string }).message, /Could not read \[\[bar_007\]\]/); assert.equal(gone.creates.length, 0);
    const junk = world({ 'bars/bar_007.md': 'not a bar at all' }); const r2 = await duplicateNote(junk.ports, target('bar_007', BARS_VAULT), BARS_VAULT);
    assert.equal(r2.ok, false); assert.equal(junk.creates.length, 0); assert.ok(!/undefined|\[object/.test((r2 as { message: string }).message));
    assert.ok(errs.length >= 1, 'a caught error goes to console.error');
  } finally { console.error = orig; }
});

test('the words: the dialog line, and how to delete a copy (undo is NOT claimed: the words say Cmd/Ctrl+Z does not take a copy back)', () => {
  const info = { family: 'bar' as const, name: 'bar_010', id: 'bars/bar_010', path: 'bars/bar_010.md', sourceName: 'bar_007', sourceId: 'bars/bar_007' };
  assert.equal(createdLine(info), 'Created [[bar_010]], a copy of [[bar_007]].');
  const undo = copyUndoNote(info);
  assert.match(undo, /Cmd\/Ctrl\+Z does not take/); assert.match(undo, /delete/i); assert.ok(undo.includes('bars/bar_010'));
  for (const t of [createdLine(info)]) assert.ok(!/undo|take.*back/i.test(t), 'the line that says it was made does not offer an undo');
});

// ---- a phrase, an arrangement, a composition ---------------------------------------------------------------------------------------------------------------------------------------------
const PH_008 = asListNote(PLAYGROUND_PHRASES.phrase_008, 'phrase_008');
const COMP_VAULT = { ...VAULT, arrangements: ['arr_001'], compositions: ['comp_001', 'comp_002', 'comp_004'] };
const PHRASE_VAULT = { bars: ['bar_001'], phrases: ['phrase_003', 'phrase_008'], arrangements: ['arr_001'], compositions: ['comp_001', 'comp_002'], kits: ['rock', 'latin'] };
function compNote(name: string, root: boolean): string {
  const rp = replayGrammar(C6_LINES, 'composition', { vault: VAULT }); assert.ok(rp.params !== null);
  const w = writeListNote(emptyCompositionNote(name, root ? ['root: true'] : []), name, 'composition', rp); assert.ok(w.ok); return (w as { text: string }).text;
}

test('a PHRASE is copied under the next free phrase_NNN: its list is the copy\'s own list (same lines), its json cache is equal, the source is byte for byte what it was', async () => {
  const w = world({ 'phrases/phrase_003.md': asListNote(PLAYGROUND_PHRASES.phrase_003, 'phrase_003'), 'phrases/phrase_008.md': PH_008 });
  const before = w.snapshot();
  const r = await duplicateNote(w.ports, target('phrase_008', PHRASE_VAULT), PHRASE_VAULT);
  assert.equal(r.ok, true); assert.equal((r as { name: string }).name, 'phrase_009');
  const copy = w.store.get('phrases/phrase_009.md')!;
  assert.deepEqual(listOfNote(copy, 'phrase', PHRASE_VAULT).list, listOfNote(PH_008, 'phrase', PHRASE_VAULT).list, 'the copy has the same lines, as its own list');
  assert.deepEqual(readPhraseNote(copy), readPhraseNote(PH_008)); assert.ok(extractDescription(copy).startsWith('1. '), 'a numbered list');
  assert.equal(w.store.get('phrases/phrase_008.md'), PH_008); for (const [p, t] of before) assert.equal(w.store.get(p), t);
  assert.deepEqual(w.creates.map((c) => c.path), ['phrases/phrase_009.md']);
  assert.ok(String(parseFrontmatter(copy)!.fields.description).startsWith('phrase_009'), 'its derived description carries ITS name');
});

test('an EMPTY phrase is copied as an empty phrase (byte for byte what a new empty note is)', async () => {
  const w = world({ 'phrases/phrase_001.md': emptyPhraseNote('phrase_001') });
  const r = await duplicateNote(w.ports, target('phrase_001', { ...PHRASE_VAULT, phrases: ['phrase_001'] }), { ...PHRASE_VAULT, phrases: ['phrase_001'] });
  assert.equal(r.ok, true); assert.equal(w.store.get('phrases/phrase_002.md'), emptyPhraseNote('phrase_002'));
});

test('an ARRANGEMENT is copied under the next free arr_NNN, a COMPOSITION under the next free comp_NNN (the first number not taken, as their own "New" does); the sources are untouched', async () => {
  const w = world({ 'arrangements/arr_001.md': ARR_001, 'compositions/comp_001.md': compNote('comp_001', false), 'compositions/comp_002.md': compNote('comp_002', false), 'compositions/comp_004.md': compNote('comp_004', false) });
  const before = w.snapshot();
  const ra = await duplicateNote(w.ports, target('arr_001', COMP_VAULT), COMP_VAULT); assert.equal(ra.ok, true); assert.equal((ra as { name: string }).name, 'arr_002');
  const rc = await duplicateNote(w.ports, target('comp_002', COMP_VAULT), COMP_VAULT); assert.equal(rc.ok, true); assert.equal((rc as { name: string }).name, 'comp_003', 'the first number not taken (the gap), as New composition does');
  for (const [p, t] of before) assert.equal(w.store.get(p), t);
  const copy = readCompositionNote(w.store.get('compositions/comp_003.md')!); assert.ok(copy.ok); assert.deepEqual((copy as never as { value: unknown }).value, (readCompositionNote(w.store.get('compositions/comp_002.md')!) as never as { value: unknown }).value);
  assert.deepEqual(listOfNote(w.store.get('arrangements/arr_002.md')!, 'arrangement', COMP_VAULT).list, listOfNote(ARR_001, 'arrangement', COMP_VAULT).list);
});

test('a composition copy is NEVER the root of the piece (the mark does not travel), and the root keeps its mark', async () => {
  const root = withRoot(compNote('comp_001', true), true); assert.equal(isRootNote(root), true);
  const w = world({ 'compositions/comp_001.md': root });
  const r = await duplicateNote(w.ports, target('comp_001', COMP_VAULT), COMP_VAULT); assert.equal(r.ok, true);
  assert.equal(isRootNote(w.store.get('compositions/comp_002.md')!), false); assert.equal(w.store.get('compositions/comp_001.md'), root);
});

test('a phrase with a hand edit (Description, Recipe or Python changed, or a custom note) is refused in plain words and nothing is created; so is one whose lines no grammar reads', async () => {
  const edited = PH_008.replace('Thin out bars 3 to 5', 'Thin out bars 1 to 2');          // the Description changed by hand: its hash no longer matches
  const custom = PH_008.replace('source_facet: description', 'source_facet: python\npython_custom: true');
  for (const [label, text] of [['edited', edited], ['custom', custom]] as const) {
    const w = world({ 'phrases/phrase_008.md': text }); const r = await duplicateNote(w.ports, target('phrase_008', PHRASE_VAULT), PHRASE_VAULT);
    assert.equal(r.ok, false, label); assert.equal(w.creates.length, 0, label);
    assert.match((r as { message: string }).message, /\[\[phrase_008\]\]/, label); assert.ok(!/undefined|\[object/.test((r as { message: string }).message), label);
  }
  const unreadable = replaceList(PH_008, 'Fly me to the moon.'); const w2 = world({ 'phrases/phrase_008.md': unreadable });
  const r2 = await duplicateNote(w2.ports, target('phrase_008', PHRASE_VAULT), PHRASE_VAULT); assert.equal(r2.ok, false); assert.equal(w2.creates.length, 0);
});
const replaceList = (note: string, line: string): string => note.replace(/# Description\n\n[\s\S]*?\n\n# Recipe/, `# Description\n\n1. ${line}\n\n# Recipe`);

test('copyNoteText / copyListNote with a placeholder name is the DRY RUN the preview asks: ok or the plain refusal, no side effect', () => {
  assert.equal(copyNoteText(BAR_007, { family: 'bar', name: 'bar_007' }, 'bar_999', BARS_VAULT).ok, true);
  assert.equal(copyNoteText('x', { family: 'bar', name: 'bar_007' }, 'bar_999', BARS_VAULT).ok, false);
  assert.equal(copyListNote(PH_008, 'phrase_999', 'phrase', PHRASE_VAULT).ok, true);
  assert.equal(copyListNote('not a note', 'phrase_999', 'phrase', PHRASE_VAULT).ok, false);
});
