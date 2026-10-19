// Drain 2026-10-20-1100 §2 — the old-vs-new OUTPUT comparison for the four hand-written library notes, kept as a committed fixture.
//
// scripts/compare-rederived-output.py (run with the forge engine's virtualenv, music21 8.3) ran the Python each note SHIPPED and the Python the real
// engine transpiles from its Recipe through the engine's own executor under two random seeds, and wrote test/fixtures/engine-transpile/rederive-comparison.json.
// That is the evidence the 1530 review's "re-derive" recommendation rested on; this file pins it and ties it to what now ships:
//   chorus, solo_chorus, loom   — IDENTICAL output (staves, note count and a digest of every note event), seed for seed
//   slow_burn                   — the SAME structure (9 staves, 715 notes) with different contents; and the OLD Python differs from ITSELF across seeds, so the
//                                 difference is the order the random draws are consumed (the engine builds all drum parts, then the vocals), not a change of music
// A fixture, not a live run: node has no music21. The numbers come from a run on the pre-Phase-B vault HEADs (the fixture records them); the pinned `old_note`
// bytes are the notes as they shipped, so this file does not expire when the source is re-derived.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { extractPythonSection } from './v2-note-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
interface Summary { staves: number; notes: number; digest: string }
interface Entry {
  old_note: string; old_python: string; new_python: string; recipe: string;
  old: Record<string, Summary>; new: Record<string, Summary>; old_depends_on_seed: boolean; verdict: string;
}
const CMP = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'rederive-comparison.json'), 'utf8')) as {
  engine_sha: string; seeds: number[]; vault_shas: Record<string, string>; notes: Record<string, Entry>;
};
const REC = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'), 'utf8')) as {
  engine_sha: string; notes: Record<string, { recipe: string; python: string; note?: string }>;
};
const IDENTICAL = ['music-theory/slow_burn/chorus', 'music-theory/slow_burn/solo_chorus', 'music-theory/percussion/loom'];
const SAME_STRUCTURE = 'music-theory/slow_burn/slow_burn';
const norm = (s: string | null | undefined) => (s ?? '').trim();

test('the comparison covers exactly the four notes, under two seeds, against the engine the recording was made with', () => {
  assert.deepEqual(Object.keys(CMP.notes).sort(), [...IDENTICAL, SAME_STRUCTURE].sort());
  assert.equal(CMP.seeds.length, 2);
  assert.equal(CMP.engine_sha, REC.engine_sha, 'the comparison and the recording are of the same engine commit');
});

for (const rel of IDENTICAL) {
  test(`${rel}: old and new output are IDENTICAL under every seed (staves, note count, every note event)`, () => {
    const e = CMP.notes[rel];
    assert.equal(e.verdict, 'identical');
    for (const s of CMP.seeds) {
      assert.deepEqual(e.new[String(s)], e.old[String(s)], `seed ${s}`);
      assert.ok(e.old[String(s)].notes > 0 && e.old[String(s)].staves > 0, 'and it is not an empty comparison');
    }
  });
}

test('slow_burn: the SAME structure (staves and note count) but different contents — and the old Python also differs from itself across seeds', () => {
  const e = CMP.notes[SAME_STRUCTURE];
  assert.equal(e.verdict, 'same-structure');
  for (const s of CMP.seeds) {
    assert.equal(e.new[String(s)].staves, e.old[String(s)].staves);
    assert.equal(e.new[String(s)].notes, e.old[String(s)].notes);
    assert.notEqual(e.new[String(s)].digest, e.old[String(s)].digest, `seed ${s}: contents differ (draw order)`);
  }
  assert.equal(e.old[String(CMP.seeds[0])].staves, 9);
  assert.equal(e.old[String(CMP.seeds[0])].notes, 715);
  assert.equal(e.old_depends_on_seed, true, 'the premise of "draw order, not music": the OLD python is itself seed-dependent');
  assert.notEqual(e.old[String(CMP.seeds[0])].digest, e.old[String(CMP.seeds[1])].digest);
});

test('NON-VACUITY: the digest can tell outputs apart (slow_burn differs) and the identical ones are not identical because everything is the same text', () => {
  const all = Object.values(CMP.notes).flatMap((e) => Object.values(e.new).map((x) => x.digest));
  assert.ok(new Set(all).size >= 4, 'distinct notes / seeds give distinct digests');
  for (const rel of [...IDENTICAL, SAME_STRUCTURE]) {
    assert.notEqual(norm(CMP.notes[rel].old_python), norm(CMP.notes[rel].new_python), `${rel}: the two Pythons are different text (so "identical output" means something)`);
  }
});

test('the "new" side IS what the engine returns: new_python equals the recorded engine transpile, and the recorded Recipe is the one compared', () => {
  for (const [rel, e] of Object.entries(CMP.notes)) {
    assert.equal(norm(e.new_python), norm(REC.notes[rel].python), `${rel}: new_python is the recorded engine Python`);
    assert.equal(norm(e.recipe), norm(REC.notes[rel].recipe), `${rel}: same Recipe`);
  }
});

test('the old side is the pinned hand-written Python the notes SHIPPED — and what ships NOW is the engine\'s (the comparison was of the real before and after)', () => {
  for (const [rel, e] of Object.entries(CMP.notes)) {
    assert.equal(norm(extractPythonSection(e.old_note)), norm(e.old_python), `${rel}: old_note carries old_python`);
    const shipped = REC.notes[rel].note;
    assert.ok(shipped, `${rel}: recorded with its committed bytes`);
    assert.equal(norm(extractPythonSection(shipped!)), norm(e.new_python), `${rel}: the shipped Python is now exactly what was compared as "new"`);
    assert.notEqual(shipped, e.old_note, `${rel}: and it is no longer the hand-written note`);
  }
});
