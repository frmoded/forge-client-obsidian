import test from 'node:test';
import assert from 'node:assert/strict';

import {
  removeSlotsSection,
  replaceOrInsertEnglishHash,
  replaceOrInsertPythonHeading,
  writePythonAndEnglishHash,
} from './python-cache-writer-core.ts';

// v0.2.72 — pure-core tests for the unified-cache write helper.
// Covers the body-rewrite contract: # Python insertion/replacement
// + english_hash frontmatter management + # Slots migration strip.

// --- writePythonAndEnglishHash --------------------------------------

test('writePythonAndEnglishHash: empty-ish body + Python + hash adds heading + field', () => {
  const body = '---\ntype: action\nfacet_form: canonical\ninputs: []\n---\n\n# English\n\nSet x to 7.\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    print(7)',
    englishHash: 'abc123',
  });
  assert.ok(result.includes('english_hash: abc123'));
  assert.ok(result.includes('# Python'));
  assert.ok(result.includes('def compute(context):'));
  // English section preserved.
  assert.ok(result.includes('Set x to 7.'));
});

test('writePythonAndEnglishHash: replaces existing # Python heading', () => {
  const body = (
    '---\ntype: action\n---\n\n'
    + '# English\n\nold english.\n\n'
    + '# Python\n\n```python\ndef compute(context):\n    print("old")\n```\n'
  );
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    print("new")',
    englishHash: 'xyz789',
  });
  assert.ok(result.includes('print("new")'));
  assert.ok(!result.includes('print("old")'));
  // Only ONE # Python heading.
  const matches = result.match(/# Python/g);
  assert.strictEqual(matches?.length, 1);
});

test('writePythonAndEnglishHash: strips pre-existing # Slots heading by default', () => {
  const body = (
    '---\ntype: action\nfacet_form: canonical\n---\n\n'
    + '# English\n\nSet x to 7.\n\n'
    + '# Slots\n\n```yaml\nslots:\n  "abc": "7"\n```\n'
  );
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    print(7)',
    englishHash: 'abc',
  });
  assert.ok(!result.includes('# Slots'));
  assert.ok(!result.includes('"abc": "7"'));
  assert.ok(result.includes('# Python'));
});

test('writePythonAndEnglishHash: stripStaleSlots=false preserves # Slots', () => {
  const body = (
    '---\ntype: action\n---\n\n'
    + '# English\n\nSet x to 7.\n\n'
    + '# Slots\n\n```yaml\nslots:\n  "abc": "7"\n```\n'
  );
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    print(7)',
    englishHash: 'abc',
    stripStaleSlots: false,
  });
  assert.ok(result.includes('# Slots'));
  assert.ok(result.includes('"abc": "7"'));
});

test('writePythonAndEnglishHash: inserts # Python BEFORE # Dependencies', () => {
  const body = (
    '---\ntype: action\n---\n\n'
    + '# English\n\nDo [[other]]().\n\n'
    + '# Dependencies\n\n[[other]]\n'
  );
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    pass',
    englishHash: 'k',
  });
  const pyIdx = result.indexOf('# Python');
  const depIdx = result.indexOf('# Dependencies');
  assert.ok(pyIdx >= 0 && depIdx >= 0);
  assert.ok(pyIdx < depIdx);
});

test('writePythonAndEnglishHash: replaces existing english_hash', () => {
  const body = (
    '---\ntype: action\nenglish_hash: old\n---\n\n'
    + '# English\n\nSet x to 7.\n'
  );
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    pass',
    englishHash: 'new',
  });
  assert.ok(result.includes('english_hash: new'));
  assert.ok(!result.includes('english_hash: old'));
});

test('writePythonAndEnglishHash: idempotent — same call twice = same body', () => {
  const body = (
    '---\ntype: action\nfacet_form: canonical\n---\n\n'
    + '# English\n\nSet x to 7.\n'
  );
  const update = {
    pythonCode: 'def compute(context):\n    print(7)',
    englishHash: 'abc',
  };
  const first = writePythonAndEnglishHash(body, update);
  const second = writePythonAndEnglishHash(first, update);
  assert.strictEqual(first, second);
});

test('writePythonAndEnglishHash: no frontmatter → english_hash NOT inserted (defensive)', () => {
  const body = '# English\n\nSet x to 7.\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    pass',
    englishHash: 'abc',
  });
  // No frontmatter to insert hash into; helper degrades gracefully.
  assert.ok(!result.includes('english_hash:'));
  // But # Python still added.
  assert.ok(result.includes('# Python'));
});

// --- replaceOrInsertEnglishHash --------------------------------------

test('replaceOrInsertEnglishHash: insert when absent', () => {
  const body = '---\ntype: action\n---\n\n# English\n\nbody.\n';
  const result = replaceOrInsertEnglishHash(body, 'newhash');
  assert.ok(result.includes('english_hash: newhash'));
  // Inserted INSIDE the frontmatter block.
  const lines = result.split('\n');
  const hashIdx = lines.findIndex((l) => l.startsWith('english_hash:'));
  const closingIdx = lines.findIndex(
    (l, i) => i > 0 && l === '---');
  assert.ok(hashIdx > 0);
  assert.ok(hashIdx < closingIdx);
});

test('replaceOrInsertEnglishHash: replace when present', () => {
  const body = '---\ntype: action\nenglish_hash: old\n---\n\nbody.\n';
  const result = replaceOrInsertEnglishHash(body, 'new');
  assert.ok(result.includes('english_hash: new'));
  assert.ok(!result.includes('english_hash: old'));
});

test('replaceOrInsertEnglishHash: no frontmatter → no-op', () => {
  const body = '# English\n\nbody.\n';
  const result = replaceOrInsertEnglishHash(body, 'anything');
  assert.strictEqual(result, body);
});

// --- replaceOrInsertPythonHeading -----------------------------------

test('replaceOrInsertPythonHeading: appends at end when no # Dependencies', () => {
  const body = '---\n---\n\n# English\n\nbody.\n';
  const result = replaceOrInsertPythonHeading(
    body, 'def compute(context):\n    pass');
  assert.ok(result.endsWith('```\n') || result.endsWith('```'));
  assert.ok(result.includes('# Python'));
});

test('replaceOrInsertPythonHeading: replaces existing block cleanly', () => {
  const body = (
    '# English\n\neng.\n\n'
    + '# Python\n\n```python\nold\n```\n'
  );
  const result = replaceOrInsertPythonHeading(body, 'new');
  assert.ok(!result.includes('old'));
  assert.ok(result.includes('new'));
});

// --- removeSlotsSection ---------------------------------------------

test('removeSlotsSection: removes heading + YAML block', () => {
  const body = (
    '# English\n\neng.\n\n'
    + '# Slots\n\n```yaml\nslots:\n  "k": "v"\n```\n\n'
    + '# Dependencies\n\n[[other]]\n'
  );
  const result = removeSlotsSection(body);
  assert.ok(!result.includes('# Slots'));
  assert.ok(!result.includes('"k": "v"'));
  assert.ok(result.includes('# English'));
  assert.ok(result.includes('# Dependencies'));
});

test('removeSlotsSection: idempotent on body without # Slots', () => {
  const body = '# English\n\neng.\n\n# Python\n\n```python\nx\n```\n';
  assert.strictEqual(removeSlotsSection(body), body);
});

// ---------------------------------------------------------------------------
// CW-generate-persist-path-fix-backfill-and-write (drain 2026-07-29-2230)
// Option 3 — null englishHash means "no # English facet; write nothing".
//
// Pre-fix, writeGeneratedCode passed `computeEnglishHash('')` for every V2
// note (V2 notes carry `# Description`, never `# English`), stamping the
// empty-string hash. In the engine that is strictly worse than absent: an
// ABSENT english_hash means "no invalidation contract → serve the cached
// `# Python`" (executor.py:956-957), while present-but-empty fails the
// equality check at executor.py:961 and drops into a doomed E--
// re-transpile → `SnippetExecError: Empty or missing Python code` despite
// populated Python on disk. Drain 2100 investigation, "additional bug 1".
// ---------------------------------------------------------------------------

test('CW-2230: null englishHash does not insert an english_hash field', () => {
  const body = '---\ntype: action\n---\n\n# Description\n\nSay hello.\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'print("hi")',
    englishHash: null,
    stripStaleSlots: false,
  });
  assert.ok(
    !/^english_hash\s*:/m.test(result),
    'no english_hash should be written when the note has no # English facet',
  );
  // The Python still lands — only the hash write is skipped.
  assert.ok(result.includes('print("hi")'));
});

test('CW-2230: null englishHash leaves an EXISTING english_hash untouched', () => {
  // Drain 1000.1 reverted an english_hash strip; that decision stands.
  // CW-2230 only declines to WRITE an empty hash — it never removes one.
  const body =
    '---\ntype: action\nenglish_hash: preexisting\n---\n\n# Description\n\nSay hello.\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'print("hi")',
    englishHash: null,
    stripStaleSlots: false,
  });
  assert.match(result, /^english_hash: preexisting$/m);
});

test('CW-2230: a real englishHash is still written (V1 path unchanged)', () => {
  const body =
    '---\ntype: action\n---\n\n# English\n\nPrint "hi".\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'print("hi")',
    englishHash: 'abc123',
    stripStaleSlots: false,
  });
  assert.match(result, /^english_hash: abc123$/m);
});

// --- [2026-08-06-1900] empty-SHA remnant heal ------------------------
//
// CCQA v0.2.331 smoke: test3.md carried english_hash = sha256("")
// stamped by pre-drain-2100 writers; the CW-2230 null-skip preserved
// it forever ("we skip the write, we do not strip"). The heal below is
// VALUE-scoped: stamping null over the literal empty-SHA constant
// removes the line; any other existing value (real hash) stays
// untouched, so drain 1000.1's revert rationale (churn against the
// slot-cache writer's real values) does not apply.

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('null englishHash + existing EMPTY-SHA remnant → line removed (heal)', () => {
  const body = `---\ntype: action\nsource_facet: description\nenglish_hash: ${EMPTY_SHA}\n---\n\n# Description\n\nPlay D major scale.\n`;
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.ok(!result.includes('english_hash'),
    `empty-SHA remnant should be healed to ABSENT, got:\n${result}`);
  assert.ok(result.includes('source_facet: description'), 'other fields intact');
});

test('null englishHash + existing REAL hash → preserved (no strip of legit values)', () => {
  const realHash = 'a'.repeat(64);
  const body = `---\ntype: action\nenglish_hash: ${realHash}\n---\n\n# English\n\nSet x to 7.\n`;
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.ok(result.includes(`english_hash: ${realHash}`),
    'real english_hash values must never be stripped by the null path');
});

test('null englishHash + no existing field → no-op stays no-op', () => {
  const body = '---\ntype: action\n---\n\n# Description\n\nHello.\n';
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.ok(!result.includes('english_hash'));
});

test('test3.md-shaped reproducer: full V2 frontmatter heals english_hash only', () => {
  const body = [
    '---',
    'type: action',
    'description: test3',
    'recipe_version: 0',
    'source_facet: description',
    'sync_state: stale-recipe',
    'description_hash: d935a5dcf5d3fb8bbec2873d03d0be71c2633b4cb235fa014161b539e4d57f77',
    'recipe_hash: fdc8a50cd3929d56c6f7b9e9004ef0697aa17a9b4f8592a1fe5f51f642cb561c',
    `english_hash: ${EMPTY_SHA}`,
    '---',
    '',
    '# Description',
    '',
    'Play D major scale. ..',
    '',
    '# Recipe',
    '',
    'Let scale = Call [[major_scale]] with tonic="D".',
    '',
  ].join('\n');
  const result = writePythonAndEnglishHash(body, {
    pythonCode: 'def compute(context):\n    return 1',
    englishHash: null,
  });
  assert.ok(!result.includes('english_hash'), 'remnant healed');
  assert.ok(result.includes('description_hash: d935a5dc'), 'sibling hashes intact');
  assert.ok(result.includes('sync_state: stale-recipe'), 'sync_state intact');
});
