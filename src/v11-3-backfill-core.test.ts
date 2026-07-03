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
  replacePythonSection,
} from './v2-note-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';

const HELPERS = {
  extractDescription,
  extractRecipeSection,
  extractPythonSection,
  getFrontmatterField: (b: string, k: string) => {
    const v = getFrontmatterField(b, k);
    return typeof v === 'string' ? v : null;
  },
  setFrontmatterField,
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
const FULL_V113_NOTE = `---
type: action
description: foo
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
recipe_derived_from_source_hash: aaa
python_derived_from_source_hash: aaa
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
  // v0.2.243 (v11.4) — downstream derived_from_source_hash stamped
  // from current description hash (assume-freshly-forged option a).
  assert.deepEqual(result.actions.derivedFromFields, [
    'recipe_derived_from_source_hash',
    'python_derived_from_source_hash',
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
  // v0.2.243 (v11.4) — derived_from stamps === description_hash
  assert.equal(
    getFrontmatterField(result.newBody, 'recipe_derived_from_source_hash'),
    descHash,
  );
  assert.equal(
    getFrontmatterField(result.newBody, 'python_derived_from_source_hash'),
    descHash,
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

test('stamped hashes match current facet contents (drift detection wakes up)', async () => {
  // After backfill, whichLayerIsCanonical should return 'synced'
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
  assert.equal(result.changed, false);
  assert.deepEqual(result.actions.canonicalHashRepairs, []);
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
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
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
