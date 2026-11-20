// 2026-11-20-1000 (THE INSPECTOR THROUGH THE STEP LINES) - the REAL ENGINE (Pyodide with the vendored music wheels, test-support/real-rhythm-engine.ts; the same Python the plugin runs) and its REAL MusicXML. The pure half (phrase-steps-lineage-core.test.ts) uses a stub engine
// with stand-in MusicXML; here the Score the steps make is what the engine really engraves into MusicXML: one <measure> per bar in every part, the ids go on the FIRST part's measures, and for EVERY bar of the Score the provenance names a note or says "made by step N",
// whatever the head (Extend, Morph, Mix, Take) and whatever the steps (every kind, one, two and three of them in mixed orders). Skipped (visibly) without the music wheels. Written RED first (the core did not exist; against 97496cc the same Scores are refused).
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { barsOfPayload, noteContentFor, producePhraseNote, readPhraseNote, type PhraseParams, type StructureOp } from './phrase-core.ts';
import { isStructureOp, structureSentence } from './bar-structure-core.ts';
import { annotateWithSteps, stepLineageOf } from './phrase-steps-lineage-core.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import { barNumberOf } from './duplicate-sentence-core.ts';
import * as L from './sentence-list-core.ts';
import { writeListNote } from './sentence-list-note-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';
import { modelSteps } from './test-support/phrase-steps-rig.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 600_000 }, fn);
const FIXTURES = path.resolve(import.meta.dirname, '../test/fixtures/score-first');
const vault = (): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const n of ['bar_005', 'bar_006', 'bar_007', 'bar_008']) files[`bars/${n}.md`] = fs.readFileSync(path.join(FIXTURES, `${n}.md`), 'utf8');
  return files;
};
const deps = (py: any, files: Record<string, string>) => ({
  readNote: async (p: string) => { const t = files[p]; if (t === undefined) throw new Error('File not found'); return t; },
  compute: async (data: any, params: PhraseParams, title: string) => computePhrase(py, data, params, title),
});
const noteFor = (lines: string[]): string => {
  const rp = L.replayGrammar(lines, 'phrase', { vault: PHRASE_VAULT });
  assert.equal(rp.stop, null, `${lines.join(' | ')}: ${rp.stop?.message}`);
  const w = writeListNote(noteContentFor('phrase_020', { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'phrase_020', 'phrase', { params: rp.params, list: rp.list });
  assert.ok(w.ok); return (w as { ok: true; text: string }).text;
};
const HEADS: Array<{ name: string; line: string; prefix: string[]; notes(h: number, n: number): string[] }> = [
  { name: 'extend', line: 'Extend [[bar_005]] to 4 bars, repeating with fills.', prefix: [], notes: () => ['bars/bar_005'] },
  { name: 'morph', line: 'Morph [[bar_005]] into [[bar_006]] over 5 bars, in musical order.', prefix: [], notes: (h, n) => [h <= (n + 1) / 2 ? 'bars/bar_005' : 'bars/bar_006'] },
  { name: 'mix', line: 'Mix [[bar_005]] and [[bar_006]].', prefix: ['Extend bar 1 to 3 bars.'], notes: () => ['bars/bar_005', 'bars/bar_006'] },
];
const STEPS = ['Keep bars 1 to 3.', 'Delete bar 2.', 'Copy bars 2 to 3.', 'Move bar 3 one bar left.', 'Move bar 2 one bar right.', 'Morph bars 1 and 2 across 2 bars.', 'Mix bars 1 and 2.', 'Extend bar 1 to 2 bars.', 'Extend bar 2 to 2 bars and put them at the end.'];

test('the REAL engine\'s Score of a phrase with a head and one, two and three step lines of every kind: every measure of the real MusicXML gets its id, every bar a note or "made by step N", the number of bars is the trace\'s', async () => {
  const py = await engine();
  const d = deps(py, vault());
  let drawn = 0, refused = 0, bars = 0;
  const sequences: string[][] = [...STEPS.map((a) => [a]), ...STEPS.map((a, i) => [a, STEPS[(i + 4) % STEPS.length]]), ...STEPS.map((a, i) => [a, STEPS[(i + 2) % STEPS.length], STEPS[(i + 7) % STEPS.length]])];
  for (const head of HEADS) for (const steps of sequences) {
    const list = [head.line, ...head.prefix, ...steps];
    const note = noteFor(list);
    const out = await producePhraseNote(d as never, note, 'phrase_020');
    if (out.kind !== 'score') { refused++; continue; }
    drawn++;
    const headOut = await producePhraseNote(d as never, noteFor([head.line]), 'phrase_020');
    assert.equal(headOut.kind, 'score');
    const headCount = barsOfPayload((headOut as { payload: Record<string, unknown> }).payload)!.length;
    const params = (readPhraseNote(note) as { ok: true; value: PhraseParams }).value;
    const ops = (params.ops ?? []) as StructureOp[];
    const payload = out.payload as Record<string, unknown>;
    const res = annotateWithSteps('phrases/phrase_020', params, payload);
    const where = list.join(' | ');
    assert.ok(res !== null && res.problems.length === 0, `${where}: ${res?.problems[0]}`);
    const N = barsOfPayload(payload)!.length;
    assert.equal(Object.keys(res!.map).length, N, where);
    assert.equal(N, modelSteps(headCount, ops).length, `${where}: the engine's bars are the model's`);
    const ids = [...String(res!.payload.multi_staff_content).matchAll(/<measure\b[^>]*\bid="(ph_bar_\d+)"/g)].map((m) => m[1]);
    assert.ok(ids.length >= N && new Set(ids).size === N, `${where}: ph_bar_1 .. ph_bar_${N} are on the real measures (${ids.length})`);
    const model = modelSteps(headCount, ops);
    for (let i = 1; i <= N; i++) {
      const p = res!.map[`ph_bar_${i}`]; const m = model[i - 1];
      assert.equal(barNumberOf(p.params, false), i, `${where} / bar ${i}`);
      const notes = m.head !== null ? head.notes(m.head, headCount) : [...new Set(m.made!.heads.flatMap((h) => head.notes(h, headCount)))];
      assert.equal(pinnedNoteFor(p)?.noteId, notes[0], `${where} / bar ${i}: a note`);
      const texts = stepLineageOf(p).map((l) => l.text);
      if (m.made !== null) assert.ok(texts.includes(`made by step ${m.made.step}: ${structureSentence(ops[m.made.step - 1])}`), `${where} / bar ${i}: ${texts.join(' / ')}`);
      else assert.ok(texts.some((t) => t.startsWith('from ')), `${where} / bar ${i}`);
      bars++;
    }
  }
  assert.ok(drawn >= 50 && bars >= 300, `drawn ${drawn} (refused at draw time ${refused}), ${bars} bars`);
});
