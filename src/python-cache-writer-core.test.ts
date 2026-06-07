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
