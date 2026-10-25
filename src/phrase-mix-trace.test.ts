// 2026-10-23-0130 — evidence lines for the mix path in the REAL Obsidian (the Ghost-notes report could not be reproduced anywhere else). A mix change travels write -> note on disk -> the Score's re-read of the note ->
// the engine -> the engraving; the ghost value can only be lost at one of those hand-offs, so each one prints ONE `[forge-mix]` line carrying the values it saw. Pure formatters (no console here), like the
// [forge-profile] and [forge-header] lines before them. An extend phrase prints nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mixTraceEngine, mixTraceRead, mixTraceWritten, type MixPhrase, type PhraseParams } from './phrase-core.ts';

const MIX: MixPhrase = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.4, threshold: 0.5, ghost: true };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
const note = (obj: object) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;
const xml = (notes: number) => `<score-partwise>${'<note><unpitched/></note>'.repeat(notes)}<note-extra/></score-partwise>`;

test('written: one line naming every field of the mix that was handed to the vault; nothing for an extend', () => {
  assert.equal(mixTraceWritten(MIX), '[forge-mix] wrote a=bar_005 b=bar_006 weight=0.4 threshold=0.5 ghost=true');
  assert.equal(mixTraceWritten({ ...MIX, ghost: false }), '[forge-mix] wrote a=bar_005 b=bar_006 weight=0.4 threshold=0.5 ghost=false');
  assert.equal(mixTraceWritten(EXTEND), null);
});

test('read: what the Score parsed out of the note text it re-read (a stale or odd read shows here); invalid or extend notes say so or stay silent', () => {
  assert.equal(mixTraceRead(note(MIX)), '[forge-mix] Score read a=bar_005 b=bar_006 weight=0.4 threshold=0.5 ghost=true');
  assert.equal(mixTraceRead(note({ ...MIX, ghost: false })), '[forge-mix] Score read a=bar_005 b=bar_006 weight=0.4 threshold=0.5 ghost=false');
  assert.equal(mixTraceRead(note(EXTEND)), null);
  assert.match(mixTraceRead(note({ ...MIX, weight: 3 })) ?? '', /^\[forge-mix\] Score read a mix note that is not valid: .*weight/);
  assert.equal(mixTraceRead('not a note at all'), null);
});

test('engine: the parameters the engine was asked for and how many notes each engraved view got back (the engine side of "no extra notes")', () => {
  const payload = { type: 'musicxml', multi_staff_content: xml(9), kit_content: xml(9), content: xml(1) };
  assert.equal(mixTraceEngine(MIX, payload), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=true -> notes: multi-staff 9, kit 9');
  assert.equal(mixTraceEngine({ ...MIX, ghost: false }, { type: 'musicxml', multi_staff_content: xml(5), kit_content: xml(5) }), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=false -> notes: multi-staff 5, kit 5');
  assert.equal(mixTraceEngine(MIX, { type: 'musicxml', content: xml(4) }), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=true -> notes: single score 4');
  assert.equal(mixTraceEngine(MIX, null), '[forge-mix] engine asked weight=0.4 threshold=0.5 ghost=true -> no payload');
  assert.equal(mixTraceEngine(EXTEND, { type: 'musicxml', content: xml(4) }), null);
});

test('the notes are counted as <note> elements only (not <note-extra> or <notations>)', () => {
  const payload = { type: 'musicxml', multi_staff_content: '<a><note id="n1"/><note><x/></note><notations/><note-extra/></a>', kit_content: '<a/>' };
  assert.match(mixTraceEngine(MIX, payload) ?? '', /multi-staff 2, kit 0$/);
});

test('MECHANISM PIN: the phrase tab prints the three lines — after a successful write, on every read of the phrase note, and after every engine call — and only through the pure formatters', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const view = fs.readFileSync(path.join(import.meta.dirname, 'phrase-view.ts'), 'utf8');
  // M7c Phase A (drain 2026-10-24-1200), deliberate: the write path prints the morph's line beside the mix's (each formatter is null for the other kinds)
  assert.match(view, /if \(refusal === null\) \{ trace\(mixTraceWritten\(params\)\); trace\(morphTraceWritten\(params\)\); \}/);
  assert.match(view, /if \(p === file\.path\) trace\(mixTraceRead\(text\)\);/);
  assert.match(view, /trace\(mixTraceEngine\(params, payload\)\);/);
  assert.match(view, /trace\(morphTraceEngine\(params, payload\)\);/);
  assert.match(view, /if \(line\) console\.info\(line\)/);
});

// ---- M8 (drain 2026-10-23-0230): the Inspector's own evidence line (operating card section 9: evidence ships with the feature) ----------------------------------------------------------------

import { mixTraceInspector } from './phrase-core.ts';

test('inspector: one line saying the bar and how many hits were mapped, or the reason the Score could not be mapped', () => {
  const map = { ph_bar_1: { noteId: 'phrases/phrase_002', role: 'mix-bar', params: {} }, mx_kick_0: { noteId: 'phrases/phrase_002', role: 'mix-hit', params: {} }, mx_kick_8: { noteId: 'phrases/phrase_002', role: 'mix-hit', params: {} } };
  assert.equal(mixTraceInspector([], map), '[forge-mix] inspector mapped the bar and 2 hits');
  assert.equal(mixTraceInspector([], { ph_bar_1: map.ph_bar_1, mx_kick_0: map.mx_kick_0 }), '[forge-mix] inspector mapped the bar and 1 hit');
  assert.equal(mixTraceInspector(['the engine did not return the mixed bar'], {}), '[forge-mix] inspector could not map the Score: the engine did not return the mixed bar');
});

test('MECHANISM PIN: the tab prints the inspector line from annotateForMix', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const tab = fs.readFileSync(path.join(import.meta.dirname, 'phrase-dom.ts'), 'utf8');
  assert.match(tab, /console\.info\(mixTraceInspector\(result\.problems, result\.map\)\);/);
});
