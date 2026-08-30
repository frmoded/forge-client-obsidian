// Drain 2026-08-24-2350 — the plugin half of the persistent slot cache.
//
// The engine has read `# Slots` since this drain wired
// `parse_slots_section` into the V2 transpile path. Nothing wrote one.
// This is the "plugin-side cache write path" slot_cache.py's docstring
// promised in v0.2.70 and never got.
//
// The two things that can go wrong here are (1) emitting a shape the
// engine's parser does not accept, and (2) disturbing the facets. Both
// have their own section below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { writeSlotsSection, parseSlotsSection } from './slots-section-writer-core.ts';
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

test('emits the exact shape serialize_slots_section emits', () => {
  // CROSS-LANGUAGE HARDCODED EXPECTATION, the same discipline the
  // english_hash parity test uses. The engine's Python writer produces
  // this byte-for-byte; if either side drifts, one of the two pinned
  // literals fails and names itself. A "live extract" mirror is not
  // available here — this runs in node, the parser is Python.
  const out = writeSlotsSection('# Python\n\nbody\n', { [KEY]: EXPR });
  assert.ok(out.endsWith(
    '# Slots\n'
    + '\n'
    + '```yaml\n'
    + 'slots:\n'
    + `  "${KEY}": "${EXPR}"\n`
    + '```\n',
  ), `unexpected tail:\n${JSON.stringify(out.slice(-160))}`);
});

test('keys are emitted in sorted order, for diff-friendliness', () => {
  const out = writeSlotsSection('# Python\n\nbody\n', { bbb: 'B', aaa: 'A' });
  assert.ok(out.indexOf('"aaa"') < out.indexOf('"bbb"'));
});

test('quotes and backslashes in an expression survive the round trip', () => {
  // A resolved expression is arbitrary Python. `"` and `\` are the two
  // characters that can break out of a YAML double-quoted scalar.
  const nasty = 'json.loads("{\\"k\\": 1}")';
  const out = writeSlotsSection(NOTE, { [KEY]: nasty });
  assert.deepEqual(parseSlotsSection(out), { [KEY]: nasty });
});

test('an empty map writes no heading at all', () => {
  // Matches serialize_slots_section, which returns '' for {}. An empty
  // `# Slots` heading is noise on every note that has no slots.
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
  assert.deepEqual(parseSlotsSection(second), { [KEY]: EXPR, other: "'x'" });
});

test('a re-resolved key OVERWRITES its stale expression', () => {
  // The repair path. If a cached expression goes bad, re-resolving has
  // to be able to correct it — mirrors the engine's inline-wins rule.
  const first = writeSlotsSection(NOTE, { [KEY]: "'STALE'" });
  const second = writeSlotsSection(first, { [KEY]: EXPR });
  assert.deepEqual(parseSlotsSection(second), { [KEY]: EXPR });
});

test('a v0.2.70/71 remnant heading is replaced, not duplicated', () => {
  // The concern `stripStaleSlots: true` served. Retiring the strip
  // must not resurrect the accumulation it prevented: exactly one
  // `# Slots` heading, always.
  const withRemnant = NOTE + '\n# Slots\n\n```yaml\nslots:\n  "old": "1"\n```\n';
  const out = writeSlotsSection(withRemnant, { [KEY]: EXPR });
  assert.equal(out.split('\n').filter((l) => /^#\s+Slots\s*$/i.test(l)).length, 1);
});

// --- the facets must not notice -------------------------------------

test('adding # Slots changes no facet body', async () => {
  // THE REGRESSION THIS DRAIN COULD EASILY CAUSE. Facet hashes are the
  // note's lineage. If a cache write shifted any facet's extracted
  // text by one byte, every synced note would start reading as
  // hand-edited the moment its slot resolved — the same class of
  // failure drain 1610 fixed in the template.
  const after = writeSlotsSection(NOTE, { [KEY]: EXPR });
  assert.equal(extractDescription(after), extractDescription(NOTE));
  assert.equal(extractRecipeSection(after), extractRecipeSection(NOTE));
  assert.equal(extractPythonSection(after), extractPythonSection(NOTE));
});

test('adding # Slots changes no facet HASH', async () => {
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
// CALLED, and that the strip it replaces is really gone — without them
// the write path could revert to discarding resolutions and every test
// above would still pass.

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
  // cache entry the LLM call had just paid for.
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
  // the only symptom.
  const body = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const after = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.deepEqual(parseSlotsSection(after), { [KEY]: EXPR });
});

test('opting IN to the strip still works', () => {
  // NON-VACUITY for the flip: the capability is retained, only its
  // default changed. Removing it outright would break the consumer
  // that legitimately wants it.
  const body = writeSlotsSection(NOTE, { [KEY]: EXPR });
  const after = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
    stripStaleSlots: true,
  });
  assert.deepEqual(parseSlotsSection(after), {});
});

test('parseSlotsSection tolerates a mangled heading', () => {
  // Mirrors the engine's tolerance: garbage reads as a cold cache, so
  // a hand-mangled heading costs a re-resolve, not a crash.
  assert.deepEqual(parseSlotsSection(NOTE + '\n# Slots\n\n```yaml\n: : :\n```\n'), {});
  assert.deepEqual(parseSlotsSection(NOTE), {});
});
