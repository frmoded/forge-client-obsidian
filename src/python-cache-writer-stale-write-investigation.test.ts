// v0.2.73 — Investigation test for Hypothesis A (writePythonAndEnglishHash
// body-merge defect). Reproduces the exact body shape the user surfaced
// after Step 5 of the v0.2.72 smoke (English edited to Victorian; first
// compute wrote storybook code; second compute should replace it).
//
// If this test PASSES, Hypothesis A is refuted — the body-merge logic
// is correct and the bug lives elsewhere (Hypothesis B: engine returns
// stale code; or Hypothesis C: Obsidian dropped facet_form).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  writePythonAndEnglishHash,
} from './python-cache-writer-core.ts';

// Body shape: post-Step-2 (first compute) state of slot_demo.md.
// Frontmatter has storybook english_hash; # English has been UPDATED
// to Victorian on disk (user edited it); # Python still has storybook
// code from the first compute. This is what the engine reads on the
// second compute → cache miss → /resolve-slot → write back.
const STALE_BODY = `---
type: action
inputs: []
facet_form: canonical
english_hash: 43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54
---

# English

Set greeting to {{a formal hello message in the style of a Victorian letter}}.
Do [[print]](greeting).

# Python

\`\`\`python
def compute(context):
    greeting = "Hello, dear reader!"
    print(greeting)
\`\`\`
`;

const NEW_PYTHON = `def compute(context):
    greeting = "Good day to you, esteemed reader."
    print(greeting)`;

const NEW_HASH =
  '5fe21a3d85ff8df536854a08a8c22556b249a236858f2d7d5737b98b4b6ccada';


test('Hypothesis A: writePythonAndEnglishHash replaces stale # Python body, not just english_hash', () => {
  const result = writePythonAndEnglishHash(STALE_BODY, {
    pythonCode: NEW_PYTHON,
    englishHash: NEW_HASH,
    stripStaleSlots: true,
  });

  assert.ok(
    result.includes(`english_hash: ${NEW_HASH}`),
    `expected new english_hash in result, got body:\n${result}`);
  assert.ok(
    !result.includes(
      'english_hash: 43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54'),
    `stale english_hash should be replaced, got body:\n${result}`);

  assert.ok(
    result.includes('"Good day to you, esteemed reader."'),
    `expected new Python code in result, got body:\n${result}`);
  assert.ok(
    !result.includes('"Hello, dear reader!"'),
    `STALE storybook code should NOT survive — but it did. Body:\n${result}`);
});


test('Hypothesis A: only ONE # Python heading after the write (no duplicate)', () => {
  const result = writePythonAndEnglishHash(STALE_BODY, {
    pythonCode: NEW_PYTHON,
    englishHash: NEW_HASH,
    stripStaleSlots: true,
  });
  const matches = result.match(/^# Python/gm);
  assert.strictEqual(matches?.length, 1,
    `expected exactly 1 # Python heading, got ${matches?.length}\n${result}`);
});


test('Hypothesis A: # English section preserved verbatim', () => {
  const result = writePythonAndEnglishHash(STALE_BODY, {
    pythonCode: NEW_PYTHON,
    englishHash: NEW_HASH,
    stripStaleSlots: true,
  });
  assert.ok(
    result.includes(
      'Set greeting to {{a formal hello message in the style of a Victorian letter}}.'),
    `English facet must be preserved, got:\n${result}`);
});


// --- Hypothesis C: snippet lost facet_form: canonical ----------------
//
// If Obsidian's YAML serializer drops the facet_form field between the
// first compute (which raised SlotCacheMissError, requiring
// facet_form: canonical to enter the canonical compile path) and the
// second compute (which writes the cache, requiring the same engine
// path to re-transpile), the engine takes the legacy "no facet_form"
// branch at executor.py:511 and returns the cached # Python (storybook)
// without consulting slot_resolutions. The plugin then writes storybook
// to # Python (no visible change) + Victorian to english_hash. Matches
// the user's observation EXACTLY.

const BODY_NO_FACET_FORM = `---
type: action
inputs: []
english_hash: 43415de15a03032addd6f759f30d51718c451c52f3d31e56e00a1526cbc33a54
---

# English

Set greeting to {{a formal hello message in the style of a Victorian letter}}.
Do [[print]](greeting).

# Python

\`\`\`python
def compute(context):
    greeting = "Hello, dear reader!"
    print(greeting)
\`\`\`
`;

test('Hypothesis C scaffold: writePythonAndEnglishHash works the same regardless of facet_form (plugin side is innocent)', () => {
  // Plugin side correctly writes pythonCode into the body. The bug
  // surfaces engine-side if engine returns stale code as `python` —
  // see the Python investigation file at
  // forge/tests/core/test_executor_stale_python_investigation.py and
  // the docs/investigations/v0.2.73-slot-resolution-stale-python.md
  // note.
  const result = writePythonAndEnglishHash(BODY_NO_FACET_FORM, {
    pythonCode: NEW_PYTHON,
    englishHash: NEW_HASH,
    stripStaleSlots: true,
  });
  assert.ok(result.includes('"Good day to you, esteemed reader."'));
  assert.ok(!result.includes('"Hello, dear reader!"'));
});
