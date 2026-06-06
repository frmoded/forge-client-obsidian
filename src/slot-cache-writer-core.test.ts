import test from 'node:test';
import assert from 'node:assert/strict';

import {
  insertSlotsHeading,
  mergeSlotCacheUpdates,
  parseSlotsSection,
  removeSlotsSection,
  serializeSlotsSection,
} from './slot-cache-writer-core.ts';

// v0.2.70 Phase 2 §1.3 — pure-core tests for the plugin-side slot
// cache writer. Mirrors the Python helpers' tolerance shape; covers
// merge, insert-when-absent, preserve-other-headings, idempotence.

// --- mergeSlotCacheUpdates -----------------------------------------

test('mergeSlotCacheUpdates: empty updates is a no-op', () => {
  const body = '# English\n\nDo [[print]]("hi").\n';
  assert.strictEqual(mergeSlotCacheUpdates(body, {}), body);
});

test('mergeSlotCacheUpdates: inserts # Slots heading when absent', () => {
  const body = '# English\n\nSet x to {{the answer}}.\nDo [[print]](x).\n';
  const result = mergeSlotCacheUpdates(body, { abc123: '42' });
  assert.ok(result.includes('# Slots'));
  assert.ok(result.includes('"abc123": "42"'));
  // English section preserved verbatim.
  assert.ok(result.includes('Set x to {{the answer}}.'));
});

test('mergeSlotCacheUpdates: inserts # Slots BEFORE # Dependencies if present', () => {
  const body = (
    '# English\n\n'
    + 'Do [[other]]().\n\n'
    + '# Dependencies\n\n'
    + '[[other]]\n'
  );
  const result = mergeSlotCacheUpdates(body, { abc123: '42' });
  const slotsIdx = result.indexOf('# Slots');
  const depsIdx = result.indexOf('# Dependencies');
  assert.ok(slotsIdx >= 0);
  assert.ok(depsIdx >= 0);
  assert.ok(slotsIdx < depsIdx, '# Slots must come before # Dependencies');
});

test('mergeSlotCacheUpdates: merges into existing # Slots heading', () => {
  const body = (
    '# English\n\n'
    + 'Set x to {{a}}.\n'
    + 'Set y to {{b}}.\n\n'
    + '# Slots\n\n'
    + '```yaml\n'
    + 'slots:\n'
    + '  "k_a": "1"\n'
    + '```\n'
  );
  const result = mergeSlotCacheUpdates(body, { k_b: '2' });
  // Both entries should be present in the merged heading.
  assert.ok(result.includes('"k_a": "1"'));
  assert.ok(result.includes('"k_b": "2"'));
  // Only ONE # Slots heading.
  const matches = result.match(/# Slots/g);
  assert.strictEqual(matches?.length, 1);
});

test('mergeSlotCacheUpdates: same key overwrites existing value', () => {
  const body = (
    '# Slots\n\n'
    + '```yaml\n'
    + 'slots:\n'
    + '  "k": "old"\n'
    + '```\n'
  );
  const result = mergeSlotCacheUpdates(body, { k: 'new' });
  assert.ok(result.includes('"k": "new"'));
  assert.ok(!result.includes('"k": "old"'));
});

test('mergeSlotCacheUpdates: idempotent — applying same updates twice yields same body', () => {
  const body = '# English\n\nSet x to {{a}}.\n';
  const after1 = mergeSlotCacheUpdates(body, { k_a: '1' });
  const after2 = mergeSlotCacheUpdates(after1, { k_a: '1' });
  assert.strictEqual(after1, after2);
});

test('mergeSlotCacheUpdates: stable asciibetical ordering across runs', () => {
  // Order of insertion doesn't matter; output is deterministic.
  const body = '# English\n\nbody.\n';
  const a = mergeSlotCacheUpdates(body, { zzz: 'v1', aaa: 'v2', mmm: 'v3' });
  const b = mergeSlotCacheUpdates(body, { aaa: 'v2', mmm: 'v3', zzz: 'v1' });
  assert.strictEqual(a, b);
});

test('mergeSlotCacheUpdates: preserves other headings (English, Python, Dependencies)', () => {
  const body = (
    '# English\n\n'
    + 'eng text\n\n'
    + '# Python\n\n'
    + '```python\n'
    + 'def compute(context):\n'
    + '    pass\n'
    + '```\n\n'
    + '# Dependencies\n\n'
    + '[[other]]\n'
  );
  const result = mergeSlotCacheUpdates(body, { k: 'v' });
  assert.ok(result.includes('# English'));
  assert.ok(result.includes('eng text'));
  assert.ok(result.includes('# Python'));
  assert.ok(result.includes('def compute(context):'));
  assert.ok(result.includes('# Dependencies'));
  assert.ok(result.includes('[[other]]'));
});

// --- parseSlotsSection ---------------------------------------------

test('parseSlotsSection: no heading returns empty dict', () => {
  assert.deepStrictEqual(parseSlotsSection('# English\n\nbody.\n'), {});
});

test('parseSlotsSection: valid YAML heading parses', () => {
  const body = (
    '# Slots\n\n'
    + '```yaml\n'
    + 'slots:\n'
    + '  "abc": "42"\n'
    + '  "def": "\\"red\\""\n'
    + '```\n'
  );
  const result = parseSlotsSection(body);
  assert.deepStrictEqual(result, { abc: '42', def: '"red"' });
});

test('parseSlotsSection: empty heading returns empty dict', () => {
  assert.deepStrictEqual(parseSlotsSection('# Slots\n\n'), {});
});

test('parseSlotsSection: roundtrip with serializeSlotsSection', () => {
  const original = { k1: '42', k2: '"hello"', k3: '[1, 2, 3]' };
  const rendered = serializeSlotsSection(original);
  // serializeSlotsSection produces the heading + body; wrap in a
  // dummy snippet so parseSlotsSection finds the heading.
  const body = '# English\n\nbody.\n\n' + rendered;
  const reparsed = parseSlotsSection(body);
  assert.deepStrictEqual(reparsed, original);
});

// --- serializeSlotsSection -----------------------------------------

test('serializeSlotsSection: empty dict returns empty string', () => {
  assert.strictEqual(serializeSlotsSection({}), '');
});

test('serializeSlotsSection: stable ordering by key (asciibetical)', () => {
  const a = serializeSlotsSection({ zzz: 'v1', aaa: 'v2', mmm: 'v3' });
  const b = serializeSlotsSection({ aaa: 'v2', mmm: 'v3', zzz: 'v1' });
  assert.strictEqual(a, b);
  const aaaPos = a.indexOf('aaa');
  const mmmPos = a.indexOf('mmm');
  const zzzPos = a.indexOf('zzz');
  assert.ok(aaaPos < mmmPos);
  assert.ok(mmmPos < zzzPos);
});

test('serializeSlotsSection: escapes backslash and quote in keys and values', () => {
  const rendered = serializeSlotsSection({ 'k"with"quotes': 'v\\with\\back' });
  assert.ok(rendered.includes('"k\\"with\\"quotes"'));
  assert.ok(rendered.includes('"v\\\\with\\\\back"'));
});

// --- removeSlotsSection --------------------------------------------

test('removeSlotsSection: removes the heading and its YAML block', () => {
  const body = (
    '# English\n\n'
    + 'eng\n\n'
    + '# Slots\n\n'
    + '```yaml\n'
    + 'slots:\n'
    + '  "k": "v"\n'
    + '```\n\n'
    + '# Dependencies\n\n'
    + '[[other]]\n'
  );
  const result = removeSlotsSection(body);
  assert.ok(!result.includes('# Slots'));
  assert.ok(!result.includes('"k": "v"'));
  assert.ok(result.includes('# English'));
  assert.ok(result.includes('# Dependencies'));
});

test('removeSlotsSection: idempotent (no # Slots → returns body unchanged)', () => {
  const body = '# English\n\neng\n\n# Dependencies\n\n[[other]]\n';
  assert.strictEqual(removeSlotsSection(body), body);
});

// --- insertSlotsHeading --------------------------------------------

test('insertSlotsHeading: empty serialized heading is no-op', () => {
  const body = '# English\n\neng\n';
  assert.strictEqual(insertSlotsHeading(body, ''), body);
});

test('insertSlotsHeading: appends at end when no # Dependencies', () => {
  const body = '# English\n\neng\n';
  const heading = '# Slots\n\n```yaml\nslots:\n  "k": "v"\n```\n';
  const result = insertSlotsHeading(body, heading);
  assert.ok(result.endsWith(heading));
});
