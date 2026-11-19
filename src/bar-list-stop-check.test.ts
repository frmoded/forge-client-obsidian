// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - the STOP CHECK of the investigation, as a test: every reader and writer of a bar note that exists TODAY ignores or keeps an unknown front matter key `lines:` (a YAML list of sentences,
// or `lines: []`). These are characterization tests of the code as it stands: they are GREEN against the unchanged code on purpose (the list model is built on them: if one of them ever goes red, the `lines:` home is wrong and 11d.1's
// alternative - the list inside the json under a `lines` key - is the way). The Python read-back is checked by ~/.forge-mem-evidence/p0993/stop_check_python.py (the engine's own parse_frontmatter and read_data_snippet).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applySave, editabilityProblem, extractJsonBlock, formatRhythmJson, parseFrontmatter, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { barOriginOf, keepBarProvenance, withBarProvenance } from './bar-provenance-core.ts';
import { refreshBarNoteText } from './phrase-notes-core.ts';
import { forkNoteContent } from './phrase-fork-core.ts';
import { planNewBar } from './score-first-core.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const LINES = ['Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.', 'Hit hihat on steps 1, 3, 5 and 7.'];
const block = (lines: readonly string[]): string => (lines.length === 0 ? 'lines: []' : `lines:\n${lines.map((l) => `  - ${JSON.stringify(l)}`).join('\n')}`);
/** A note with a `lines:` key put just before the closing `---` of its front matter. */
const withLines = (text: string, lines: readonly string[]): string => text.replace(/\n---\n/, `\n${block(lines)}\n---\n`);
const BAR_001 = PLAYGROUND_BARS['bar_001'];
const data = (text: string): RhythmData => { const r = readRhythmNote(text); assert.equal(r.ok, true); return (r as Extract<typeof r, { ok: true }>).value.data; };

test('the Beat Box reader reads a bar with a `lines:` list or an empty list exactly as a bar without one', () => {
  const plain = data(BAR_001);
  for (const lines of [LINES, [] as string[]]) {
    const note = withLines(BAR_001, lines);
    assert.notEqual(note, BAR_001);
    assert.deepEqual(data(note), plain);
    const fm = parseFrontmatter(note)!;
    assert.equal(editabilityProblem(fm.fields), null);
    assert.equal(fm.fields.type, 'data');
    assert.deepEqual(Object.keys(fm.fields).sort(), ['content_type', 'description', 'lines', 'type']);          // the key is seen as a scalar and nothing else leaks out of the list items
    assert.equal(extractJsonBlock(note).ok, true);
  }
});

test('the Beat Box save replaces ONLY the json fence of a bar with `lines:`: the list is kept byte for byte', () => {
  const note = withLines(BAR_001, LINES);
  const edited: RhythmData = { ...data(note), tempo_bpm: 120 };
  const r = applySave(note, readRhythmNote(note).ok ? (readRhythmNote(note) as { value: { fingerprint: string } }).value.fingerprint : '', edited, keepBarProvenance);
  assert.equal(r.ok, true);
  const out = (r as { text: string }).text;
  assert.ok(out.includes(block(LINES)), 'the lines block is still there, byte for byte');
  assert.equal(out.replace(formatRhythmJson(edited), formatRhythmJson(data(note))), note, 'only the json changed');
});

test('a bar with provenance sections and a `lines:` list: the save keeps the list; a fork or a copy keeps it beside its `links:` block', () => {
  const planned = planNewBar({ existingBasenames: [], exists: () => false });
  assert.equal(planned.ok, true);
  const fresh = (planned as { content: string }).content;
  const note = withLines(fresh, LINES);
  const d = data(note);
  const saved = keepBarProvenance(note.replace(formatRhythmJson(d), formatRhythmJson({ ...d, tempo_bpm: 99 })), { ...d, tempo_bpm: 99 });
  assert.ok(saved.includes(block(LINES)));
  assert.match(saved, /Bar made in the Beat Box; \d+ hits in 16 steps, tempo 99\./, 'the derived sentence follows the data as it always did');
  const fork = withLines(forkNoteContent('bar_020', 'phrases/phrase_006', 9, d), LINES);
  const rewritten = withBarProvenance(fork, barOriginOf(fork), d);
  assert.ok(rewritten.includes(block(LINES)), 'a fork rewrites its links: block and leaves the lines: block alone');
  assert.equal((rewritten.match(/^links:/gm) ?? []).length, 1);
  assert.deepEqual(barOriginOf(rewritten), { kind: 'fork', phrase: 'phrase_006', bar: 9 });
});

test('"Refresh note links" keeps the `lines:` list of a bar and does not touch its json', () => {
  const note = withLines(BAR_001, LINES);
  const r = refreshBarNoteText(note, 'bar_001');
  assert.equal(r.ok, true);
  const out = (r as { text: string }).text;
  assert.ok(out.includes(block(LINES)));
  assert.equal(extractJsonBlock(out).ok, true);
  assert.deepEqual(data(out), data(note));
});
