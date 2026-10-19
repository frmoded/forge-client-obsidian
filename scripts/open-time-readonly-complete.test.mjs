// Drain 2026-10-21-0900 — the read-only ratchet (scripts/open-time-readonly.txt) is COMPLETE: every shipped note the recorded-engine gate calls clean is pinned.
//
// The ratchet says "a Run on these notes writes nothing, and it can never regress silently". It only protects the notes on it. Iteration 88 re-derived thirteen notes and put back
// only the five the prompt named; eight more (build_seventh_chord, guitar_play_smoke, scale_construction_{a_minor,f_major,g_major}_piano, loom, slow_burn, weather) were clean and
// unpinned — free to regress without a red gate. The driver confirmed every design choice (Iterations 87 §11, 89 §7, 88 §9) and asked for all of them. Now a clean note that is not
// pinned FAILS THIS TEST, naming it: pin it (add it to the list) or, if there is a reason it cannot be, say so here in UNPINNED_ON_PURPOSE.
//
// What counts as clean is the RECORDED-engine verdict (the gate's default): Run modelled with the Python the real engine returns. A note the engine cannot transpile on this machine
// (it needs an LLM for a slot) is "unrecorded": the gate falls back to its own Python for it, which is blind to a shipped Python the engine would not produce — its cleanliness is not the
// claim the ratchet makes, so a new unrecorded note is never pinned without a named decision (UNRECORDED_PINNED).
//
// Reads the BUNDLE (assets/vaults), like the gate itself: it is meaningful on a tree synced to the vault HEADs (npm test's documented precondition).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditVault, parseRequiredList, ratchetGaps } from './check-open-time-writes-core.mjs';
import { loadRecording } from './engine-recording.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VAULTS = path.join(ROOT, 'assets', 'vaults');
const LISTED = parseRequiredList(fs.readFileSync(path.join(__dirname, 'open-time-readonly.txt'), 'utf8'));
const RECORDING = loadRecording(path.join(ROOT, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'));

/** Clean notes that are deliberately NOT pinned, each with its reason. Empty: every clean recorded note is pinned. */
const UNPINNED_ON_PURPOSE = {};
/** Notes on the ratchet whose cleanliness is NOT recorded-engine (the engine cannot transpile them here — a slot needs the LLM) — pinned by an earlier decision, kept, and named so a third cannot slip in. */
const UNRECORDED_PINNED = ['music-theory/exercises/melodic_line_demo.md', 'music-theory/exercises/rhythmic_line_demo.md'];

async function auditBundle() {
  const clean = [], unrecorded = [];
  for (const v of fs.readdirSync(VAULTS, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name).sort()) {
    const r = await auditVault(path.join(VAULTS, v), { libraryGated: true, recording: RECORDING });
    clean.push(...r.clean.map((x) => `${v}/${x}`));
    unrecorded.push(...r.unrecorded.map((x) => `${v}/${x}`));
  }
  return { clean, unrecorded };
}

test('ratchetGaps (pure): reports the clean recorded notes that are not pinned, the pinned notes that are not clean, and unrecorded notes pinned without a decision', () => {
  const g = ratchetGaps({
    clean: ['v/a.md', 'v/b.md', 'v/c.md', 'v/d.md'], unrecorded: ['v/d.md'], listed: ['v/a.md', 'v/d.md', 'v/e.md', 'v/f.md'], unpinnedOnPurpose: ['v/c.md'], unrecordedPinned: [],
  });
  assert.deepEqual(g.missing, ['v/b.md'], 'clean, recorded, not pinned, not excused');
  assert.deepEqual(g.pinnedButNotClean, ['v/e.md', 'v/f.md']);
  assert.deepEqual(g.unrecordedPinnedWithoutDecision, ['v/d.md']);
  // an UNRECORDED clean note that is not pinned is not "missing" (its verdict is the weak one; pinning it is a decision), and a named exception is not flagged
  const u = ratchetGaps({ clean: ['v/u.md', 'v/n.md'], unrecorded: ['v/u.md', 'v/n.md'], listed: ['v/n.md'], unpinnedOnPurpose: [], unrecordedPinned: ['v/n.md'] });
  assert.deepEqual(u, { missing: [], pinnedButNotClean: [], unrecordedPinnedWithoutDecision: [] });
  const none = ratchetGaps({ clean: ['v/a.md'], unrecorded: [], listed: ['v/a.md'], unpinnedOnPurpose: [], unrecordedPinned: [] });
  assert.deepEqual(none, { missing: [], pinnedButNotClean: [], unrecordedPinnedWithoutDecision: [] });
});

test('THE RATCHET IS COMPLETE: every shipped note the recorded-engine gate calls clean is on scripts/open-time-readonly.txt', async () => {
  const { clean, unrecorded } = await auditBundle();
  const g = ratchetGaps({ clean, unrecorded, listed: LISTED, unpinnedOnPurpose: Object.keys(UNPINNED_ON_PURPOSE), unrecordedPinned: UNRECORDED_PINNED });
  assert.deepEqual(g.missing, [], 'clean but not pinned — add to scripts/open-time-readonly.txt (or name it, with a reason, in UNPINNED_ON_PURPOSE)');
});

test('every pinned note is clean (the gate says so too), and the only pinned notes that are not recorded are the two named', async () => {
  const { clean, unrecorded } = await auditBundle();
  const g = ratchetGaps({ clean, unrecorded, listed: LISTED, unpinnedOnPurpose: Object.keys(UNPINNED_ON_PURPOSE), unrecordedPinned: UNRECORDED_PINNED });
  assert.deepEqual(g.pinnedButNotClean, []);
  assert.deepEqual(g.unrecordedPinnedWithoutDecision, [], 'a pinned note whose cleanliness is the weak (own-Python) model, without a decision naming it');
  assert.deepEqual(UNRECORDED_PINNED.filter((n) => !LISTED.includes(n)), [], 'the named exceptions are really on the ratchet');
});

test('the eight notes Iteration 88 left off are pinned, and the ratchet has the count the driver confirmed (29 + 8 = 37)', () => {
  for (const n of [
    'music-theory/exercises/build_seventh_chord.md', 'music-theory/exercises/guitar_play_smoke.md', 'music-theory/exercises/scale_construction_a_minor_piano.md',
    'music-theory/exercises/scale_construction_f_major_piano.md', 'music-theory/exercises/scale_construction_g_major_piano.md', 'music-theory/percussion/loom.md',
    'music-theory/slow_burn/slow_burn.md', 'forge-tutorial/05-conditionals/weather.md',
  ]) assert.ok(LISTED.includes(n), n);
  assert.equal(LISTED.length, 37);
  assert.equal(new Set(LISTED).size, LISTED.length, 'no duplicates');
  assert.ok(!LISTED.includes('forge-tutorial/06-loops/countdown.md'), 'countdown stays unpinned: it ships no # Python, so a first Run adds one (the driver\'s decision)');
});

test('NON-VACUITY: the audit really finds clean notes, and the notes that ship no # Python are NOT clean (so they cannot be pinned by accident)', async () => {
  const { clean } = await auditBundle();
  assert.ok(clean.length >= 37, `the audit found ${clean.length} clean notes`);
  assert.ok(!clean.includes('forge-tutorial/06-loops/countdown.md'));
  assert.ok(!clean.includes('forge-moda/simulation.md'));
});
