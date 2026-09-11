// Drain 2026-08-24-2350 — the plugin half of the persistent slot cache.
// Drain 2026-09-11-1200 (CW 1200) — moved from a body `# Slots` heading
// to a `slots_cache` frontmatter field. See slots-section-writer-core.ts's
// file header for the full "why" and the read-compat reasoning.
//
// The two things that can go wrong here are (1) emitting a shape the
// engine's parser does not accept, and (2) disturbing the facets. Both
// have their own section below. A third, new to this drain: (3) an old
// body `# Slots` remnant must survive a frontmatter-only write
// untouched, since the engine still reads it as a fallback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { writeSlotsSection, parseSlotsCache } from './slots-section-writer-core.ts';
import { writePythonAndEnglishHash } from './python-cache-writer-core.ts';
import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
} from './v2-note-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';

const KEY = '84969ce9e7c2e4dd621aba5c163386ceef5082f4f19a5d06206c3fb6a27f1e56';
const EXPR = "__import__('random').random()";

const NOTE = [
  '---',
  'type: action',
  'source_facet: description',
  '---',
  '',
  '# Description',
  '',
  'A random number between 0 and 2, multiplied by an input scale.',
  '',
  '# Recipe',
  '',
  'Input scale: float = 1.0.',
  'Let raw = {{ a random float between 0 and 1 }}.',
  'Return raw.',
  '',
  '# Python',
  '',
  '```python',
  'def compute(context):',
  '    return 41',
  '```',
  '',
].join('\n');

// --- the wire shape the engine must be able to read -----------------

test('emits the exact shape serialize_slots_section emits, nested in frontmatter', () => {
  // CROSS-LANGUAGE HARDCODED EXPECTATION, the same discipline the
  // english_hash parity test uses. The engine's Python writer produces
  // this byte-for-byte (as the value it serializes under the
  // `slots_cache` frontmatter key); if either side drifts, one of the
  // two pinned literals fails and names itself. A "live extract"
  // mirror is not available here — this runs in node, the parser is
  // Python.
  const out = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const lines = out.split('\n');
  const fmEnd = lines.indexOf('---', 1);
  const fmBlock = lines.slice(0, fmEnd + 1).join('\n');
  assert.ok(fmBlock.includes(
    'slots_cache:\n'
    + `  "${KEY}": "${EXPR}"`,
  ), `frontmatter block missing expected slots_cache shape:\n${fmBlock}`);
});

test('a body with no frontmatter is left unchanged (defensive no-op)', () => {
  // Mirrors replaceOrInsertEnglishHash's own precedent: production
  // snippets always have frontmatter, so this only guards a malformed
  // file, not a real vault note.
  const noFrontmatter = '# Python\n\nbody\n';
  assert.equal(writeSlotsSection(noFrontmatter, { [KEY]: EXPR }), noFrontmatter);
});

test('keys are emitted in sorted order, for diff-friendliness', () => {
  const out = writeSlotsSection(NOTE, { bbb: 'B', aaa: 'A' });
  assert.ok(out.indexOf('"aaa"') < out.indexOf('"bbb"'));
});

test('quotes and backslashes in an expression survive the round trip', () => {
  // A resolved expression is arbitrary Python. `"` and `\` are the two
  // characters that can break out of a YAML double-quoted scalar.
  const nasty = 'json.loads("{\\"k\\": 1}")';
  const out = writeSlotsSection(NOTE, { [KEY]: nasty });
  assert.deepEqual(parseSlotsCache(out), { [KEY]: nasty });
});

test('an empty map adds no slots_cache field at all', () => {
  // Matches serialize_slots_section, which returns '' for {}. An empty
  // `slots_cache: {}` is noise on every note that has no slots.
  assert.equal(writeSlotsSection(NOTE, {}), NOTE);
});

// --- idempotence and accumulation -----------------------------------

test('writing twice yields the same body', () => {
  const once = writeSlotsSection(NOTE, { [KEY]: EXPR });
  assert.equal(writeSlotsSection(once, { [KEY]: EXPR }), once);
});

test('a second resolution round MERGES rather than replacing', () => {
  // Load-bearing. /resolve-slot returns only the slots that MISSED
  // this round; entries served from the existing cache are not in that
  // response. Replacing would delete a live entry every time a
  // multi-slot note resolved a subset — the note would still run, but
  // it would re-hit the LLM forever.
  const first = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const second = writeSlotsSection(first, { other: "'x'" });
  assert.deepEqual(parseSlotsCache(second), { [KEY]: EXPR, other: "'x'" });
});

test('a re-resolved key OVERWRITES its stale expression', () => {
  // The repair path. If a cached expression goes bad, re-resolving has
  // to be able to correct it — mirrors the engine's inline-wins rule.
  const first = writeSlotsSection(NOTE, { [KEY]: "'STALE'" });
  const second = writeSlotsSection(first, { [KEY]: EXPR });
  assert.deepEqual(parseSlotsCache(second), { [KEY]: EXPR });
});

test('a second frontmatter write replaces its own prior slots_cache block, not duplicates it', () => {
  // The frontmatter analog of "exactly one heading, always" — a
  // re-write must replace the block it wrote last time, not append a
  // second slots_cache: key (which would be invalid YAML — duplicate
  // mapping keys).
  const first = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const second = writeSlotsSection(first, { other: "'x'" });
  const occurrences = second.split('\n').filter((l) => /^slots_cache\s*:\s*$/.test(l)).length;
  assert.equal(occurrences, 1);
});

// --- read-compat: an old body remnant must survive untouched --------

test('an old body # Slots remnant is left untouched by a frontmatter-only write', () => {
  // THE MIGRATION-SAFETY PROPERTY. octopus_fact.md (and possibly
  // others) already has a real body `# Slots` section on disk. This
  // writer must never touch it — the engine's own read merges body +
  // frontmatter (frontmatter wins on collision), so leaving the old
  // section alone is what keeps its keys resolvable rather than
  // silently orphaned. Deleting it here would require re-implementing
  // that merge decision in two places and risks losing a live entry
  // if this writer's opinion of "current" ever drifts from the
  // engine's.
  const withBodyRemnant = NOTE + '\n# Slots\n\n```yaml\nslots:\n  "old_key": "1"\n```\n';
  const out = writeSlotsSection(withBodyRemnant, { [KEY]: EXPR });
  assert.ok(
    out.includes('# Slots\n\n```yaml\nslots:\n  "old_key": "1"\n```\n'),
    'old body # Slots section must survive byte-for-byte',
  );
  // AND the new frontmatter entry must also be present — both coexist.
  assert.deepEqual(parseSlotsCache(out), { [KEY]: EXPR });
});

// --- the facets must not notice -------------------------------------

test('adding slots_cache changes no facet body', async () => {
  // THE REGRESSION THIS DRAIN COULD EASILY CAUSE. Facet hashes are the
  // note's lineage. Frontmatter sits outside every facet extractor's
  // hash-relevant text already (each stops at the next top-level
  // heading in the BODY; frontmatter is a separate block entirely) —
  // this test is the concrete proof that claim actually holds for this
  // specific field, not just an assumption carried over from the
  // body-heading design it replaces.
  const after = writeSlotsSection(NOTE, { [KEY]: EXPR });
  assert.equal(extractDescription(after), extractDescription(NOTE));
  assert.equal(extractRecipeSection(after), extractRecipeSection(NOTE));
  assert.equal(extractPythonSection(after), extractPythonSection(NOTE));
});

test('adding slots_cache changes no facet HASH', async () => {
  // The same fact stated in the currency the lineage stamps actually
  // use, so this cannot pass on an extractor whose output merely
  // looks equal.
  const after = writeSlotsSection(NOTE, { [KEY]: EXPR });
  for (const extract of [extractDescription, extractRecipeSection, extractPythonSection]) {
    assert.equal(
      await computeFacetHash(extract(after) ?? ''),
      await computeFacetHash(extract(NOTE) ?? ''),
    );
  }
});

// --- the wiring, pinned at the source -------------------------------
//
// The tests above prove the writer is correct. These prove it is
// CALLED — without them the write path could revert to discarding
// resolutions and every test above would still pass.

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('the slot-miss handler persists its resolutions', () => {
  // Drain 2026-08-30-0945 — was a substring count of `slotResolutions,`
  // asserted to equal exactly 1. That coincidentally matched this
  // drain's own destructuring syntax (`const { slotResolutions,
  // responseCount } = ...`) two lines it was never meant to count,
  // turning a correct refactor into a false failure. Counting the
  // actual invocation (`writeSlotsSection(`) instead is precise
  // regardless of what a caller names its local variable.
  //
  // TWO real call sites are now correct, not a regression: the
  // original in handleSlotCacheMiss (the RUN path's second-pass
  // persistence), and a new one in writeSourcePythonBack (the
  // transpile-only write-back path's own self-heal, added by drain
  // 0945 — see slot-cache-miss-python-error-core.test.ts for its own
  // wiring test).
  const callSites = MAIN.split('\n').filter((l) => l.includes('writeSlotsSection(')).length;
  assert.equal(callSites, 2, 'expected exactly two writeSlotsSection call sites');
});

test('no production call site strips # Slots any more', () => {
  // The whole defect in one line: `stripStaleSlots: true` deleted the
  // cache entry the LLM call had just paid for. Still relevant post-
  // migration: `stripStaleSlots` only ever touched the BODY heading
  // (python-cache-writer-core.ts's own, separate mechanism), and this
  // drain doesn't change that file — a production call site opting
  // into it would still be the same defect it always was, just now
  // against a body section that's legacy-only rather than live.
  //
  // Comment lines are excluded deliberately. The first cut of this
  // test counted any mention and failed on the comment that EXPLAINS
  // the retirement — a guard that forbids describing the thing it
  // guards is a guard nobody can document around.
  const offenders = MAIN.split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .filter((l) => /stripStaleSlots:\s*true/.test(l));
  assert.deepEqual(offenders, []);
});

test('the shared writer no longer strips by DEFAULT', () => {
  // The trap the flip removes: a caller who omits the flag entirely
  // used to delete every resolution on the note, with an LLM bill as
  // the only symptom. Also verifies the NEW regression risk this
  // drain introduces doesn't exist: writePythonAndEnglishHash's own
  // frontmatter edit (english_hash) must not corrupt a coexisting
  // slots_cache block in the same frontmatter — it operates line-by-
  // line and only touches lines matching `english_hash:`, so a nested
  // slots_cache entry line never matches and passes through untouched.
  const body = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const after = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.deepEqual(parseSlotsCache(after), { [KEY]: EXPR });
});

test('opting IN to the strip removes only the OLD body remnant, never the new frontmatter cache', () => {
  // REPURPOSED for this drain. Pre-migration, `writeSlotsSection` and
  // `stripStaleSlots` both targeted the body, so opting in erased what
  // the writer had just written — that was the point, for the one
  // consumer that wants a clean slate. Post-migration the two target
  // different places entirely: this test demonstrates the two can
  // coexist correctly during migration — a note carrying BOTH an old
  // body remnant AND a new frontmatter cache gets the body remnant
  // stripped (the investigation suite's actual intent) while the live
  // frontmatter cache survives untouched (stripping it would delete a
  // resolution the LLM call just paid for, the exact defect drain 2350
  // fixed).
  const withBodyRemnant = NOTE + '\n# Slots\n\n```yaml\nslots:\n  "old_key": "1"\n```\n';
  const withFrontmatterToo = writeSlotsSection(withBodyRemnant, { [KEY]: EXPR });
  const after = writePythonAndEnglishHash(withFrontmatterToo, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
    stripStaleSlots: true,
  });
  assert.ok(!after.includes('# Slots'), 'old body remnant must be stripped');
  assert.deepEqual(
    parseSlotsCache(after), { [KEY]: EXPR },
    'new frontmatter cache must survive the body-only strip',
  );
});

test('parseSlotsCache tolerates a malformed slots_cache block', () => {
  // Mirrors the engine's tolerance: garbage reads as a cold cache, so
  // a hand-mangled block costs a re-resolve, not a crash.
  const mangled = NOTE.replace(
    '---\n\n# Description',
    'slots_cache:\n  not a valid entry line at all\n---\n\n# Description',
  );
  assert.deepEqual(parseSlotsCache(mangled), {});
  assert.deepEqual(parseSlotsCache(NOTE), {});
});
