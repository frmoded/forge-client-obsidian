// Pure-core tests for chips v2. Runs under `node --test` — no
// obsidian shim needed because chips-core.ts has no obsidian imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChipsBody,
  mergeChipSources,
  insertChipText,
  CHIPS_NO_ENGLISH_SECTION,
} from './chips-core.ts';

test('parseChipsBody: valid array → chips', () => {
  const r = parseChipsBody('[{"label":"a","insertion":"Call a."}]');
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('parseChipsBody: empty array → empty chips list', () => {
  const r = parseChipsBody('[]');
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, []);
});

test('parseChipsBody: malformed JSON → ChipsParseError', () => {
  const r = parseChipsBody('not json');
  assert.ok('error' in r);
});

test('parseChipsBody: non-array JSON → error', () => {
  const r = parseChipsBody('{"label":"a","insertion":"x"}');
  assert.ok('error' in r);
});

test('parseChipsBody: entry missing label dropped, others kept', () => {
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.' },
    { insertion: 'Call b.' },                   // missing label
    { label: 'c', insertion: 'Call c.' },
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [
    { label: 'a', insertion: 'Call a.' },
    { label: 'c', insertion: 'Call c.' },
  ]);
});

test('parseChipsBody: entry missing insertion dropped', () => {
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.' },
    { label: 'b' },                              // missing insertion
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('parseChipsBody: unknown fields tolerated and stripped', () => {
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.', refs: ['x'], future: 42 },
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('mergeChipSources: empty input → empty groups', () => {
  assert.deepEqual(mergeChipSources([]), []);
});

test('mergeChipSources: single source preserved', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
  assert.deepEqual(out, [
    { sourceName: 'foo', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
});

test('mergeChipSources: duplicate labels across sources kept separate', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [{ label: 'set ink mass', insertion: 'Call set_ink_mass.' }] },
    { sourceName: 'bar', chips: [{ label: 'set ink mass', insertion: 'Call other.' }] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].sourceName, 'foo');
  assert.equal(out[1].sourceName, 'bar');
});

test('mergeChipSources: empty-chip sources dropped', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [] },
    { sourceName: 'bar', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceName, 'bar');
});

test('insertChipText: appends to # English section, body unchanged elsewhere', () => {
  const body = [
    '---', 'type: action', '---',
    '', '# English', '', 'Inputs: x', '', 'Call a.', '',
    '# Python', '', '```python\ndef compute(...): ...\n```', '',
  ].join('\n');
  const r = insertChipText(body, 'Call set_ink_mass.');
  assert.ok(r.ok);
  assert.match(r.body, /Call a\.\nCall set_ink_mass\.\n\n# Python/);
  // Python section content untouched.
  assert.ok(r.body.includes('def compute(...): ...'));
});

test('insertChipText: empty English section inserts directly after heading', () => {
  const body = '# English\n\n# Python\n';
  const r = insertChipText(body, 'Call X.');
  assert.ok(r.ok);
  assert.match(r.body, /^# English\nCall X\.\n\n# Python\n$/);
});

test('insertChipText: no # English → sentinel + body unchanged', () => {
  const body = 'just a regular note with no facets';
  const r = insertChipText(body, 'Call X.');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, CHIPS_NO_ENGLISH_SECTION);
  }
});

test('insertChipText: insertion lands in English even when Python is longer', () => {
  const body = [
    '# English', 'a', 'b',
    '# Python', 'lots', 'of', 'lines', 'here',
  ].join('\n');
  const r = insertChipText(body, 'NEW');
  assert.ok(r.ok);
  // Insertion sits between English content and Python heading.
  const idxIns = r.body.indexOf('NEW');
  const idxPy = r.body.indexOf('# Python');
  assert.ok(idxIns < idxPy && idxIns > r.body.indexOf('# English'));
});
