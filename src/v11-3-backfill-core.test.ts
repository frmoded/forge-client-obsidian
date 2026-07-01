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

const FULL_V113_NOTE = `---
type: action
description: foo
description_hash: aaa
recipe_hash: bbb
python_hash: ccc
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
  // Python section now present
  assert.match(result.newBody, /^# Python$/m);
  // Python stub inserted
  assert.match(result.newBody, /def compute\(context\):/);
  assert.match(result.newBody, /return None/);
  // Frontmatter now has all three hashes
  assert.notEqual(getFrontmatterField(result.newBody, 'description_hash'), null);
  assert.notEqual(getFrontmatterField(result.newBody, 'recipe_hash'), null);
  assert.notEqual(getFrontmatterField(result.newBody, 'python_hash'), null);
});

test('preserves existing Python section content; only stamps missing hashes', async () => {
  const result = await backfillV113Shape(PRE_V113_NOTE_WITH_PYTHON_NO_HASHES, HELPERS);
  assert.equal(result.changed, true);
  assert.equal(result.actions.pythonSection, false);
  assert.deepEqual(result.actions.hashes, [
    'description_hash', 'recipe_hash', 'python_hash',
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
