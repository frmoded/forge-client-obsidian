// v0.2.240 — tests for the v11.3 backfill pure-core.
// Drain 2026-07-02-2300 regression harness.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  backfillV113Shape,
  DEFAULT_PYTHON_STUB,
} from './v11-3-backfill-core.ts';
import {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField,
  setFrontmatterField,
  removeFrontmatterField,
  replacePythonSection,
} from './v2-note-core.ts';
import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';

const HELPERS = {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField: (b: string, k: string) => {
    const v = getFrontmatterField(b, k);
    return typeof v === 'string' ? v : null;
  },
  setFrontmatterField,
  removeFrontmatterField,
  replacePythonSection,
  computeFacetHash,
};

const PRE_V113_NOTE_NO_PYTHON = `---
type: action
description: greeting
---

# Description

Print a greeting with the given name.

# Recipe

Call [[print]] with text="hello world".
`;

const PRE_V113_NOTE_WITH_PYTHON_NO_HASHES = `---
type: action
description: greeting
---

# Description

Print a greeting.

# Recipe

Call [[print]] with text="hello".

# Python

\`\`\`python
def compute(context):
    print("hello")
    return None
\`\`\`
`;

// v0.2.243 — "fully populated" now includes v11.4 derived_from_source_hash
// fields on downstream facets. Notes populated by pre-v11.4 code paths
// will get those stamped on next backfill run.
// v0.2.256 drain 1200 — also includes source_facet (seed field).
// v0.2.264 drain 1500 — also includes v11.6 parent-hash fields
// (recipe_derived_from_description_hash, python_derived_from_recipe_hash).
const FULL_V113_NOTE = `---
type: action
description: foo
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
recipe_derived_from_source_hash: aaa
python_derived_from_source_hash: aaa
recipe_derived_from_description_hash: aaa
python_derived_from_recipe_hash: bbb
source_facet: description
---

# Description

# Recipe

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;

test('backfills missing # Python section AND all three hashes on pre-v113 note without Python', async () => {
  const result = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, true);
  assert.deepEqual(result.actions.hashes, [
    'description_hash', 'recipe_hash', 'python_hash',
  ]);
  // v0.2.243 (v11.4) — recipe derived_from_source_hash stamped from
  // current description hash (assume-freshly-forged option a).
  // Drain 2026-08-09-0400 — python lineage NO LONGER stamped when the
  // body is the backfill's own stub: there is no derivation to record.
  assert.deepEqual(result.actions.derivedFromFields, [
    'recipe_derived_from_source_hash',
  ]);
  // Python section now present
  assert.match(result.newBody, /^# Python$/m);
  // Python stub inserted
  assert.match(result.newBody, /def compute\(context\):/);
  assert.match(result.newBody, /return None/);
  // Frontmatter now has all three hashes
  const descHash = getFrontmatterField(result.newBody, 'description_hash');
  assert.notEqual(descHash, null);
  assert.notEqual(getFrontmatterField(result.newBody, 'recipe_hash'), null);
  assert.notEqual(getFrontmatterField(result.newBody, 'python_hash'), null);
  // v0.2.243 (v11.4) — recipe derived_from stamp === description_hash
  assert.equal(
    getFrontmatterField(result.newBody, 'recipe_derived_from_source_hash'),
    descHash,
  );
  // Drain 2026-08-09-0400 — absent is the honest state for the stub.
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    null,
  );
});

test('preserves existing Python section content; only stamps missing hashes', async () => {
  const result = await backfillV113Shape(PRE_V113_NOTE_WITH_PYTHON_NO_HASHES, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, false);
  assert.deepEqual(result.actions.hashes, [
    'description_hash', 'recipe_hash', 'python_hash',
  ]);
  // v0.2.243 (v11.4) — derived_from also stamped for downstream.
  assert.deepEqual(result.actions.derivedFromFields, [
    'recipe_derived_from_source_hash',
    'python_derived_from_source_hash',
  ]);
  // Original Python body preserved
  assert.match(result.newBody, /print\("hello"\)/);
  // Stub NOT inserted (cohort's real body kept)
  assert.doesNotMatch(result.newBody, /def compute\(context\):\s*\n\s*return None/);
});

test('fully-populated v113 note → no change', async () => {
  const result = await backfillV113Shape(FULL_V113_NOTE, HELPERS);
  assert.equal(result.changed, false);
  assert.equal(result.actions.pythonSection, false);
  assert.deepEqual(result.actions.hashes, []);
  assert.equal(result.newBody, FULL_V113_NOTE);
});

test('idempotent: second call after backfill is a no-op', async () => {
  const first = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  assert.equal(first.changed, true);
  const second = await backfillV113Shape(first.newBody, HELPERS);
  assert.equal(second.changed, false);
  assert.equal(second.newBody, first.newBody);
});

test('v0.2.256 drain 1200: seeds source_facet on first backfill; stub-inserted note gets recipe seed (drain 2026-08-09-0400)', async () => {
  const result = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  // All hashes stamped fresh in this call → no drift — but the Python
  // body is the backfill's own stub, so 'synced' would be a lie
  // (drain 2026-08-09-0400). Recipe (the authored frontier) is the
  // honest seed; forge-click transpiles it into real Python.
  assert.equal(result.actions.canonicalFacetSeeded, 'recipe');
  assert.equal(getFrontmatterField(result.newBody, 'source_facet'), 'recipe');
});

test('v0.2.256 drain 1200: seeds source_facet: description when Description drifts against pre-stamped hashes', async () => {
  // Fixture with all hashes stamped but Description body edited so
  // description_hash mismatches. Backfill seeds source_facet:
  // description (upstream-wins).
  const preStampedButDescDrifted = `---
type: action
description_hash: bogus_old_hash
recipe_hash: bogus_recipe_hash
python_hash: bogus_python_hash
recipe_derived_from_source_hash: bogus_old_hash
python_derived_from_source_hash: bogus_old_hash
---

# Description

edited description body

# Recipe

recipe body

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  // Compute what the actual hashes would be for the bodies:
  const dHash = await computeFacetHash('edited description body');
  const rHash = await computeFacetHash('recipe body');
  const pHash = await computeFacetHash(
    '```python\ndef compute(context):\n    return None\n```',
  );
  // Since fixture stored hashes are bogus, ALL three facets drift.
  // Upstream-wins → 'description'.
  const result = await backfillV113Shape(preStampedButDescDrifted, HELPERS);
  assert.equal(result.actions.canonicalFacetSeeded, 'description');
  assert.equal(getFrontmatterField(result.newBody, 'source_facet'), 'description');
  // Sanity: existing hash values were not overwritten by the backfill
  // (backfill only stamps ABSENT hashes; drift correction happens in
  // separate paths). Verify the bogus hashes remain.
  assert.notEqual(getFrontmatterField(result.newBody, 'description_hash'), dHash);
  assert.notEqual(getFrontmatterField(result.newBody, 'recipe_hash'), rHash);
  assert.notEqual(getFrontmatterField(result.newBody, 'python_hash'), pHash);
});

test('v0.2.256 drain 1200: source_facet seed is idempotent — second call is no-op', async () => {
  const first = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  // 'recipe' since drain 2026-08-09-0400 (stub body cannot be synced).
  assert.equal(first.actions.canonicalFacetSeeded, 'recipe');
  const second = await backfillV113Shape(first.newBody, HELPERS);
  assert.equal(second.actions.canonicalFacetSeeded, null);
  assert.equal(second.changed, false);
});

test('stamped hashes match current facet contents (drift detection wakes up)', async () => {
  // After backfill, whichLayerIsSource should return 'synced'
  // (all hashes present and matching). Verify by directly checking
  // stored vs current-content hash.
  const result = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  const b = result.newBody;
  const storedDesc = getFrontmatterField(b, 'description_hash');
  const storedRecipe = getFrontmatterField(b, 'recipe_hash');
  const storedPython = getFrontmatterField(b, 'python_hash');
  const currentDesc = await computeFacetHash(extractDescription(b));
  const currentRecipe = await computeFacetHash(extractRecipeSection(b) ?? '');
  const currentPython = await computeFacetHash(extractPythonSection(b) ?? '');
  assert.equal(storedDesc, currentDesc);
  assert.equal(storedRecipe, currentRecipe);
  assert.equal(storedPython, currentPython);
});

test('partial hashes: only stamps the missing one (respects existing)', async () => {
  const partial = `---
type: action
recipe_hash: EXISTING_RECIPE
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(partial, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, false);
  assert.deepEqual(result.actions.hashes, ['description_hash', 'python_hash']);
  // The existing recipe_hash preserved verbatim
  assert.equal(getFrontmatterField(result.newBody, 'recipe_hash'), 'EXISTING_RECIPE');
});

test('DEFAULT_PYTHON_STUB is stable for regression pins', () => {
  assert.equal(DEFAULT_PYTHON_STUB, 'def compute(context):\n    return None');
});

test('v114-canonical-hash-repair: rewrites python_derived_from = recipe_hash → description_hash', async () => {
  // Drain 2026-07-03-0600 §3.4b: v0.2.243 shortcut stamped
  // python_derived_from_source_hash with recipe_hash on
  // Description-canonical forge. Detect the residue and repair.
  const bugResidue = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: RRR
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(bugResidue, HELPERS);
  assert.equal(result.changed, true);
  assert.deepEqual(result.actions.canonicalHashRepairs, [
    'python_derived_from_source_hash',
  ]);
  // Repair rewrites python's field to description_hash
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    'DDD',
  );
  // Recipe's derived-from preserved verbatim
  assert.equal(
    getFrontmatterField(result.newBody, 'recipe_derived_from_source_hash'),
    'DDD',
  );
});

test('v114-canonical-hash-repair: does NOT fire on correctly-stamped notes (idempotent)', async () => {
  // Post-fix note with python_derived_from = description_hash: no
  // repair action. Idempotent + doesn't touch correctly-stamped
  // notes.
  const correctlyStamped = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: DDD
recipe_derived_from_description_hash: DDD
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(correctlyStamped, HELPERS);
  // v0.2.264 drain 1500: NOT changed for canonical_hash_repair or v11.6
  // parent-hash seed (Python's legacy points at description_hash, which
  // is the CW-1500-B leave-absent case; Recipe's v11.6 field pre-stamped).
  assert.equal(result.changed, false);
  assert.deepEqual(result.actions.canonicalHashRepairs, []);
  assert.deepEqual(result.actions.derivedFromParentSeeded, []);
});

test('v0.2.252 drain 1000: english_hash present on V2 note is PRESERVED (not stripped)', async () => {
  // Reverts drain 0800. english_hash is the v0.2.72 slot-cache-key
  // wire-contract identifier; still written by writePythonAndEnglishHash
  // (v0.2.251 drain 0900 audit). Stripping caused strip → write → strip
  // churn on slot-resolution paths.
  const withEnglishHash = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: DDD
recipe_derived_from_description_hash: DDD
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(withEnglishHash, HELPERS);
  assert.equal(result.changed, false);
  assert.equal(
    getFrontmatterField(result.newBody, 'english_hash'),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('v114-canonical-hash-repair: does NOT fire on Recipe-canonical forge (recipe derived-from ≠ description_hash)', async () => {
  // If python_derived_from = recipe_hash but recipe_derived_from is
  // ALSO recipe_hash (not description_hash), this is a Recipe-canonical
  // forge where Python correctly derives from Recipe. Don't repair.
  const recipeCanonicalForge = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: RRR
python_derived_from_source_hash: RRR
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(recipeCanonicalForge, HELPERS);
  // No repair fires; but derivedFromFields may still be empty since
  // all fields present. changed remains false.
  assert.deepEqual(result.actions.canonicalHashRepairs, []);
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    'RRR',
  );
});

// Drain 2026-07-03-0000 — driver's greeting.md exact scenario.
// 2 of 3 hashes already present in frontmatter (description_hash +
// recipe_hash from an earlier code path), python_hash missing. Python
// section IS on disk with real cohort content. Backfill must stamp
// python_hash — nothing else.

const GREETING_MD_LIKE = `---
type: action
description: greeting
description_hash: DESC_STAMP
recipe_hash: RECIPE_STAMP
---

# Description

Print a greeting.

# Recipe

Call [[print]] with text="hello".

# Python

\`\`\`python
def compute(context):
    name = 'Ada2'
    greeting = ('Hello, ' + name)
    print(greeting)
\`\`\`
`;

test('drain 2026-07-03-0000: greeting.md scenario (2/3 hashes → stamp python_hash only)', async () => {
  const result = await backfillV113Shape(GREETING_MD_LIKE, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, false);
  assert.deepEqual(result.actions.hashes, ['python_hash']);
  // description_hash + recipe_hash preserved verbatim
  assert.equal(getFrontmatterField(result.newBody, 'description_hash'), 'DESC_STAMP');
  assert.equal(getFrontmatterField(result.newBody, 'recipe_hash'), 'RECIPE_STAMP');
  // python_hash stamped and matches the actual Python facet content
  const pyHash = getFrontmatterField(result.newBody, 'python_hash');
  assert.notEqual(pyHash, null);
  const currentPython = extractPythonSection(result.newBody) ?? '';
  const expectedPyHash = await computeFacetHash(currentPython);
  assert.equal(pyHash, expectedPyHash);
});

// -----------------------------------------------------------------------
// v0.2.264 drain 1500 — v11.6 parent-hash migration tests (§4.2 of prompt)
// -----------------------------------------------------------------------

test('v11.6 §4.2 case 1: recipe_derived_from_source === description_hash → seeds v11.6 field with same value', async () => {
  const v11_5_note = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: DDD
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(v11_5_note, HELPERS);
  assert.equal(
    getFrontmatterField(result.newBody, 'recipe_derived_from_description_hash'),
    'DDD',
  );
  assert.ok(
    result.actions.derivedFromParentSeeded.includes('recipe_derived_from_description_hash'),
    `expected seed action; got: ${result.actions.derivedFromParentSeeded.join(', ')}`,
  );
});

test('v11.6 §4.2 CW-1500-B: python_derived_from_source === description_hash → DOES NOT seed python_derived_from_recipe_hash', async () => {
  // Two-hop Description-canonical case. Safe default per CW-1500-B:
  // leave the v11.6 python field ABSENT. Python renders `— derived
  // from Recipe, out of date` until cohort re-forges.
  const v11_5_note = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: DDD
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(v11_5_note, HELPERS);
  // Recipe: seeded (unambiguous parent = Description).
  assert.equal(
    getFrontmatterField(result.newBody, 'recipe_derived_from_description_hash'),
    'DDD',
  );
  // Python: NOT seeded (CW-1500-B safe default).
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_recipe_hash'),
    null,
  );
  assert.ok(
    !result.actions.derivedFromParentSeeded.includes('python_derived_from_recipe_hash'),
    'CW-1500-B: python_derived_from_recipe_hash must NOT be seeded in two-hop case',
  );
});

test('v11.6 §4.2 case 3: python_derived_from_source === recipe_hash → seeds v11.6 field with same value', async () => {
  // Recipe-canonical forge case. python_derived_from_source_hash points
  // at recipe_hash directly (one-hop). Unambiguous → seed.
  const v11_5_recipe_canonical = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: RRR
python_derived_from_source_hash: RRR
source_facet: recipe
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(v11_5_recipe_canonical, HELPERS);
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_recipe_hash'),
    'RRR',
  );
  assert.ok(
    result.actions.derivedFromParentSeeded.includes('python_derived_from_recipe_hash'),
    `expected python seed action; got: ${result.actions.derivedFromParentSeeded.join(', ')}`,
  );
});

test('v11.6 §4.2 case 4: idempotent — running backfill twice yields no additional writes', async () => {
  const v11_5_note = `---
type: action
description_hash: DDD
recipe_hash: RRR
python_hash: PPP
recipe_derived_from_source_hash: DDD
python_derived_from_source_hash: DDD
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const first = await backfillV113Shape(v11_5_note, HELPERS);
  assert.equal(first.changed, true);
  const second = await backfillV113Shape(first.newBody, HELPERS);
  assert.equal(second.changed, false);
  assert.deepEqual(second.actions.derivedFromParentSeeded, []);
  assert.equal(second.newBody, first.newBody);
});


// ---------- v0.2.286 drain 2026-07-09-1600: source_facet rename ------

test('v0.2.286: legacy canonical_facet is migrated to source_facet on backfill', async () => {
  // Legacy note carrying only `canonical_facet` (pre-v0.2.286 shape).
  // Backfill should: keep the value, write it under `source_facet`,
  // and delete the legacy field.
  const legacy = `---
type: action
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
recipe_derived_from_description_hash: aaa
python_derived_from_recipe_hash: bbb
canonical_facet: recipe
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(legacy, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(
    getFrontmatterField(result.newBody, 'source_facet'),
    'recipe',
    'source_facet must carry the migrated value',
  );
  assert.equal(
    getFrontmatterField(result.newBody, 'canonical_facet'),
    null,
    'canonical_facet must be gone after migration',
  );
});

test('v0.2.286: notes with only source_facet are untouched (idempotent)', async () => {
  // A note already on v0.2.286 shape backfills to no-op.
  const modern = `---
type: action
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
recipe_derived_from_description_hash: aaa
python_derived_from_recipe_hash: bbb
source_facet: description
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(modern, HELPERS);
  // Migration branch is a no-op on modern shape: source_facet survives
  // and canonical_facet is not introduced. Other pipeline steps may
  // still touch the note for unrelated reasons (hash re-baselining,
  // etc.); this test asserts only the source_facet invariants.
  assert.equal(
    getFrontmatterField(result.newBody, 'source_facet'),
    'description',
    'source_facet must be preserved across backfill',
  );
  assert.equal(
    getFrontmatterField(result.newBody, 'canonical_facet'),
    null,
    'canonical_facet must NOT be reintroduced by backfill',
  );
});

test('v0.2.286: notes carrying BOTH fields have canonical_facet flushed', async () => {
  // Transitional shape: two writes racing across a version boundary
  // could leave both. Backfill drops the legacy one; new one wins.
  const both = `---
type: action
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
recipe_derived_from_description_hash: aaa
python_derived_from_recipe_hash: bbb
source_facet: description
canonical_facet: python
---

# Description

x

# Recipe

y

# Python

\`\`\`python
def compute(context):
    return None
\`\`\`
`;
  const result = await backfillV113Shape(both, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(getFrontmatterField(result.newBody, 'source_facet'), 'description');
  assert.equal(getFrontmatterField(result.newBody, 'canonical_facet'), null);
});

// ---------------------------------------------------------------------------
// CW-generate-persist-path-fix-backfill-and-write (drain 2026-07-29-2230).
//
// Composition tests: backfill → routing. Drain 1305 fixed fresh-note
// routing in `whichLayerIsSource` but was tested only against the RAW
// note shell. In a live vault the file-open backfill always runs first
// (main.ts:maybeBackfillV113Shape on 'file-open'), and pre-2230 it
// stamped `recipe_hash` = hash('') + seeded `source_facet: 'synced'`
// on a Description-only note — making drain 1305's `noStoredHashes`
// trigger unreachable. Routing then fell into the dialect='python'
// /generate path and the executor died with "Empty or missing Python
// code" (drain 2100 investigation, hops 2-4).
//
// These tests close that composition gap: they run the REAL backfill
// and then the REAL routing, which is the interleaving production has.
// ---------------------------------------------------------------------------

// EXACT output of forge-mcp VaultFS.create_note_shell (vault_fs.py:783-793)
// for a fresh wizard-authored Description-only note. No `# Recipe`, no
// `# Python`, no hashes.
const FRESH_DESCRIPTION_ONLY_SHELL = `---
type: action
inputs: []
recipe_version: 0
---

# Description

Make the computer say hello, world.
`;

test('CW-2230 composition: fresh Description-only note routes description AFTER backfill', async () => {
  const routingHelpers = {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: HELPERS.getFrontmatterField,
  };

  // Pre-backfill: drain 1305's content-inference gate fires correctly.
  assert.equal(
    await whichLayerIsSource(FRESH_DESCRIPTION_ONLY_SHELL, routingHelpers),
    'description',
    'baseline: drain 1305 gate works on the raw shell',
  );

  // Run the backfill exactly as file-open does.
  const result = await backfillV113Shape(
    FRESH_DESCRIPTION_ONLY_SHELL, HELPERS);
  assert.equal(result.changed, true);

  // THE REGRESSION GUARD: post-backfill the note must STILL route
  // Description-canonical, so Forge-click reaches the
  // Description → Recipe (LLM) → Python pipeline instead of the
  // dialect='python' /generate fallback.
  assert.equal(
    await whichLayerIsSource(result.newBody, routingHelpers),
    'description',
    'post-backfill routing must stay Description-canonical',
  );
});

test('CW-2230 Option 1: backfill does not invent a Recipe lineage', async () => {
  const emptySha = await computeFacetHash('');
  const result = await backfillV113Shape(
    FRESH_DESCRIPTION_ONLY_SHELL, HELPERS);

  // No `# Recipe` section exists → stamping recipe_hash at the
  // empty-string SHA asserts a Recipe facet that isn't there. Leave
  // the field absent instead.
  const storedRecipe = getFrontmatterField(result.newBody, 'recipe_hash');
  assert.notEqual(
    storedRecipe, emptySha,
    'recipe_hash must not be stamped at the empty-string SHA '
    + '(this is the CCQA-reported e3b0c442… value)',
  );
  assert.equal(
    storedRecipe, null,
    'recipe_hash should be absent when the note has no # Recipe section',
  );

  // And the seed must be honest: Description is the only facet with
  // content, so Description is the source.
  assert.equal(result.actions.canonicalFacetSeeded, 'description');
  assert.equal(
    getFrontmatterField(result.newBody, 'source_facet'), 'description');
});

test('CW-2230 Option 2 self-heal: pre-wedged cohort note re-routes description', async () => {
  // Shape of a note already wedged in a cohort vault by the pre-2230
  // backfill: source_facet: synced + recipe_hash at the empty-string
  // SHA + a populated Description and Python but NO # Recipe body.
  // Must self-heal on the next routing call without a migration pass.
  const emptySha = await computeFacetHash('');
  const descBody = 'Make the computer say hello, world.';
  const pythonBody = 'print("Hello, world.")';
  const wedged = `---
type: action
inputs: []
recipe_version: 0
source_facet: synced
description_hash: ${await computeFacetHash(descBody)}
recipe_hash: ${emptySha}
python_hash: ${await computeFacetHash(pythonBody)}
python_derived_from_recipe_hash: ${emptySha}
---

# Description

${descBody}

# Python

\`\`\`python
${pythonBody}
\`\`\`
`;
  const routingHelpers = {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: HELPERS.getFrontmatterField,
  };
  assert.equal(
    await whichLayerIsSource(wedged, routingHelpers),
    'description',
    'wedged note must self-heal to Description-canonical',
  );
});

test('CW-2230 Option 2 does not hijack an explicit python source_facet', async () => {
  // Guard against over-reach: a cohort member who took over the
  // Python facet (source_facet: python) on a note with no Recipe must
  // KEEP python as source. The rescue only applies when the stored
  // source is absent / 'synced' / 'description'.
  const descBody = 'Say hello.';
  const pythonBody = 'print("hi")';
  const pythonAuthored = `---
type: action
inputs: []
source_facet: python
description_hash: ${await computeFacetHash(descBody)}
python_hash: ${await computeFacetHash(pythonBody)}
---

# Description

${descBody}

# Python

\`\`\`python
${pythonBody}
\`\`\`
`;
  const routingHelpers = {
    extractDescription,
    extractRecipeSection,
    extractPythonSection,
    getFrontmatterField: HELPERS.getFrontmatterField,
  };
  // NB: pre-existing behavior returns 'synced' here, not 'python' — the
  // drift-flip at facet-hash-core.ts:246-257 deliberately downgrades any
  // explicit stored source to 'synced' when no facet has drifted ("No
  // drift anywhere → note is actually synced; honor that"). CW-2230 does
  // not change that. The invariant this test pins is narrower: the
  // Option-2 rescue must not HIJACK such a note into 'description' and
  // re-derive over the cohort member's hand-authored Python.
  assert.notEqual(
    await whichLayerIsSource(pythonAuthored, routingHelpers),
    'description',
    'Option-2 rescue must not hijack an explicit python source_facet',
  );
});

// ---------------------------------------------------------------------
// Drain 2026-08-09-0400 — return-None stub with synced metadata.
// Wizard sweep 2026-08-09-0348 found notes whose # Python the backfill
// itself stubbed (DEFAULT_PYTHON_STUB) yet whose frontmatter claims
// source_facet: synced + python_derived_from_source_hash =
// description_hash — certifying a derivation that never happened.
// Census 2026-08-09: 8 live notes across ClaudeQA / bluh /
// music-theory. Same honesty principle as CW-2230's no-Recipe seed:
// a Python body the backfill just manufactured cannot honestly be
// "synced" or "derived".

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'vault');

test('stub-inserted note with a real Recipe seeds source_facet=recipe (not synced) and leaves python lineage absent', async () => {
  const result = await backfillV113Shape(PRE_V113_NOTE_NO_PYTHON, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, true);
  // The backfill wrote the stub itself — Python has no derivation
  // lineage and the note cannot honestly be synced. Recipe is the
  // most-downstream AUTHORED facet → it is the source; forge-click
  // then transpiles the (preserved) Recipe into real Python.
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'recipe');
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    null,
  );
});

/** Build the observed broken artifact dynamically with production
 *  helpers: stub + all hashes stamped + synced + python lineage =
 *  description_hash (what the pre-fix backfill produced). */
async function buildStubSyncedNote(python: string = DEFAULT_PYTHON_STUB): Promise<string> {
  let body = replacePythonSection(PRE_V113_NOTE_NO_PYTHON, python);
  const descHash = await computeFacetHash(extractDescription(body));
  const recipeHash = await computeFacetHash(extractRecipeSection(body) ?? '');
  const pythonHash = await computeFacetHash(extractPythonSection(body) ?? '');
  body = setFrontmatterField(body, 'description_hash', descHash);
  body = setFrontmatterField(body, 'recipe_hash', recipeHash);
  body = setFrontmatterField(body, 'python_hash', pythonHash);
  body = setFrontmatterField(body, 'recipe_derived_from_source_hash', descHash);
  body = setFrontmatterField(body, 'python_derived_from_source_hash', descHash);
  body = setFrontmatterField(body, 'recipe_derived_from_description_hash', descHash);
  body = setFrontmatterField(body, 'source_facet', 'synced');
  return body;
}

test('repair: already-stamped stub+synced note is healed on next backfill run', async () => {
  const broken = await buildStubSyncedNote();
  const result = await backfillV113Shape(broken, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'recipe');
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    null,
  );
});

test('repair: the verbatim driver-observed fixture (bluh forge-moda/setup.md) is healed', async () => {
  const fixture = readFileSync(
    join(FIXTURE_DIR, 'stub_python_synced_metadata.md'), 'utf8');
  const result = await backfillV113Shape(fixture, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'recipe');
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    null,
  );
});

test('repair does NOT fire on a real (non-stub) Python that is synced', async () => {
  const healthy = await buildStubSyncedNote('def compute(context):\n    return [1, 2, 3]');
  const result = await backfillV113Shape(healthy, HELPERS);
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'synced');
});

test('repair does NOT fire when python_derived_from_recipe_hash is present (genuinely forged stub)', async () => {
  let genuine = await buildStubSyncedNote();
  const recipeHash = HELPERS.getFrontmatterField(genuine, 'recipe_hash');
  genuine = setFrontmatterField(genuine, 'python_derived_from_recipe_hash', recipeHash ?? '');
  const result = await backfillV113Shape(genuine, HELPERS);
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'synced');
});

test('stub-inserted note with NO recipe still seeds description (CW-2230 behavior preserved)', async () => {
  const noRecipe = `---
type: action
---

# Description

Say hello to the world.
`;
  const result = await backfillV113Shape(noRecipe, HELPERS);
  assert.equal(HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'description');
});

// ---------------------------------------------------------------------------
// Drain 2026-08-17-1200 — the v11.4 backfill must never elect its own stub
// as a note's source, nor leave a derivation stamped for content it replaced.
//
// The prompt's hypothesis (a FRESH Recipe-bearing, Python-less note gets
// lineage stamped and derives `synced`) does NOT reproduce — drain
// 2026-08-09-0400 closed it, and `backfills missing # Python section AND all
// three hashes...` above is its guard. The surviving path is a note that ONCE
// had real Python and has since lost its `# Python` section: step 3 stamps
// hashes ONLY IF ABSENT, so `python_hash` keeps the OLD body's value while the
// body becomes the stub. That mismatch reads as a hand-edit, `pMismatch` wins
// the seed before the stub branch is reached, and `source_facet: python` makes
// `derive_sync_state` short-circuit to `synced` — the manufactured-freshness
// lie, now machine-readable. The pre-existing
// `python_derived_from_recipe_hash` still equals `recipe_hash` too, so the
// python link reads current even without the short-circuit.
// ---------------------------------------------------------------------------

const LOST_DESC = 'Quiz the player on scale qualities.';
const LOST_RECIPE =
  'Call [[mcq]] with prompt="Which quality?", choices=["major","minor"].';
const LOST_REAL_PYTHON =
  'def compute(context):\n    return mcq(prompt="Which quality?")';

/** A note whose `# Python` section was removed but whose python frontmatter
 *  (hash + lineage, both stamped against the REAL body that is now gone)
 *  survives. `source_facet` is absent so the seeding branch runs. */
async function buildLostPythonSectionNote(realPython = LOST_REAL_PYTHON) {
  const descHash = await computeFacetHash(LOST_DESC);
  const recipeHash = await computeFacetHash(LOST_RECIPE);
  const pyHash = await computeFacetHash(realPython);
  return `---
type: action
description_hash: ${descHash}
recipe_hash: ${recipeHash}
python_hash: ${pyHash}
recipe_derived_from_description_hash: ${descHash}
python_derived_from_recipe_hash: ${recipeHash}
---

# Description

${LOST_DESC}

# Recipe

${LOST_RECIPE}
`;
}

test('lost-# Python note: the backfill stub is NEVER elected as source_facet', async () => {
  const result = await backfillV113Shape(await buildLostPythonSectionNote(), HELPERS);
  assert.equal(result.actions.pythonSection, true, 'stub was inserted');
  assert.equal(
    extractPythonSection(result.newBody), DEFAULT_PYTHON_STUB,
    'body really is the backfill stub',
  );
  const seed = HELPERS.getFrontmatterField(result.newBody, 'source_facet');
  assert.notEqual(
    seed, 'python',
    'the stub is content the backfill manufactured; it cannot be the source',
  );
  // A real Recipe body exists, so Recipe is the honest source.
  assert.equal(seed, 'recipe');
});

test('lost-# Python note: stale python lineage is dropped, not carried onto the stub', async () => {
  const result = await backfillV113Shape(await buildLostPythonSectionNote(), HELPERS);
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_derived_from_recipe_hash'),
    null,
    'lineage certifies a derivation of a body that no longer exists (I18)',
  );
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    null,
  );
});

test('lost-# Python note: python_hash is re-stamped to describe the stub actually on disk', async () => {
  const result = await backfillV113Shape(await buildLostPythonSectionNote(), HELPERS);
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'python_hash'),
    await computeFacetHash(DEFAULT_PYTHON_STUB),
    'a stored hash must describe the body that is there now',
  );
});

test('lost-# Python note: the healed shape is exactly the fresh-stub shape (derives stale-python)', async () => {
  const healed = await backfillV113Shape(await buildLostPythonSectionNote(), HELPERS);
  // The engine derives from stored values only. Absent python lineage on a
  // present python facet is `stale-python` per
  // tests/core/test_sync_state.py::test_absent_lineage_on_a_present_facet_is_stale_not_synced.
  // Assert the three inputs that decision reads.
  assert.equal(HELPERS.getFrontmatterField(healed.newBody, 'source_facet'), 'recipe');
  assert.notEqual(HELPERS.getFrontmatterField(healed.newBody, 'recipe_hash'), null);
  assert.equal(
    HELPERS.getFrontmatterField(healed.newBody, 'python_derived_from_recipe_hash'), null,
  );
});

test('lost-# Python heal is idempotent — second pass is a no-op', async () => {
  const first = await backfillV113Shape(await buildLostPythonSectionNote(), HELPERS);
  const second = await backfillV113Shape(first.newBody, HELPERS);
  assert.equal(second.changed, false, 'no churn on re-open');
  assert.equal(second.newBody, first.newBody);
});

test('REGRESSION: a real hand-edited Python body with a stale hash still elects python (I5)', async () => {
  // Same stale-hash signature, but the body is genuine cohort content, not the
  // stub. The drift branches must keep winning here — this is the hand-edit
  // case the stub guard must not swallow.
  const descHash = await computeFacetHash(LOST_DESC);
  const recipeHash = await computeFacetHash(LOST_RECIPE);
  const staleHash = await computeFacetHash('def compute(context):\n    return 1');
  const handEdited = `---
type: action
description_hash: ${descHash}
recipe_hash: ${recipeHash}
python_hash: ${staleHash}
recipe_derived_from_description_hash: ${descHash}
---

# Description

${LOST_DESC}

# Recipe

${LOST_RECIPE}

# Python

\`\`\`python
def compute(context):
    return mcq(prompt="Which quality?")
\`\`\`
`;
  const result = await backfillV113Shape(handEdited, HELPERS);
  assert.equal(result.actions.pythonSection, false, 'no stub inserted');
  assert.equal(
    HELPERS.getFrontmatterField(result.newBody, 'source_facet'), 'python',
    'a genuine hand-edit still makes Python the source',
  );
});
