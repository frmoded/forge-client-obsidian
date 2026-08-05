// Facet-heading copy augmentation. Drain 2026-07-23-1100 (attempt 2).
//
// The five §5 cases from the drain prompt, plus the edges the prepend
// rule creates. The load-bearing pair: case 2 (Cmd-A is byte-exact —
// prepending must NOT double headings that the source slice already
// carries) and case 1 (a body-only selection gains exactly its own
// facet's heading, no one else's).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  augmentFacetHeadingCopy,
  findFacetHeadings,
} from './facet-heading-copy-augment-core.ts';

const BODY = [
  '---',
  'type: action',
  'inputs: [x]',
  '---',
  '',
  '# Description',
  '',
  'Say hello to x.',
  '',
  '# Recipe',
  '',
  'Let msg = "hello".',
  'Return msg.',
  '',
  '# Python',
  '',
  '```python',
  'def compute(context):',
  '  return "hello"',
  '```',
  '',
].join('\n');

function rangeOf(needle: string): { from: number; to: number } {
  const from = BODY.indexOf(needle);
  assert.ok(from >= 0, `fixture must contain ${JSON.stringify(needle)}`);
  return { from, to: from + needle.length };
}

// ------------------------------------------------ heading discovery

test('findFacetHeadings: locates the three facet H1s with body extents', () => {
  const hs = findFacetHeadings(BODY);
  assert.deepEqual(hs.map(h => h.name), ['Description', 'Recipe', 'Python']);
  // Each body extends to the next H1 (or EOF for the last).
  assert.equal(hs[0].bodyEnd, hs[1].from);
  assert.equal(hs[1].bodyEnd, hs[2].from);
  assert.equal(hs[2].bodyEnd, BODY.length);
  // `to` is the end of the heading text, before the newline.
  assert.equal(BODY.slice(hs[1].from, hs[1].to), '# Recipe');
});

test('findFacetHeadings: H2s and non-facet H1s are not facet headings but DO bound bodies', () => {
  const body = '# Description\n\nd\n\n## Inputs\n\nx\n\n# Recipe\n\nr\n\n# Notes\n\nn\n';
  const hs = findFacetHeadings(body);
  assert.deepEqual(hs.map(h => h.name), ['Description', 'Recipe']);
  // `## Inputs` does not end Description's body...
  assert.equal(hs[0].bodyEnd, body.indexOf('# Recipe'));
  // ...but the non-facet H1 `# Notes` ends Recipe's.
  assert.equal(hs[1].bodyEnd, body.indexOf('# Notes'));
});

// ------------------------------------------------ the five §5 cases

test('§5 case 1: Recipe-body-only selection gains # Recipe and nothing else', () => {
  const r = rangeOf('Let msg = "hello".\nReturn msg.');
  const got = augmentFacetHeadingCopy(BODY, [r]);
  assert.equal(got, '# Recipe\n\nLet msg = "hello".\nReturn msg.');
  assert.ok(!got!.includes('# Description'));
  assert.ok(!got!.includes('# Python'));
});

test('§5 case 2: Cmd-A round-trips byte-for-byte (headings in slice, none prepended)', () => {
  const got = augmentFacetHeadingCopy(BODY, [{ from: 0, to: BODY.length }]);
  assert.equal(got, BODY);
});

test('§5 case 3: multi-range selection prepends per range', () => {
  const desc = rangeOf('Say hello to x.');
  const py = rangeOf('  return "hello"');
  const got = augmentFacetHeadingCopy(BODY, [desc, py]);
  // Each range gets ITS facet's heading; ranges joined with \n, the
  // same join CM6 uses for multi-range copy.
  assert.equal(
    got,
    '# Description\n\nSay hello to x.\n# Python\n\n  return "hello"',
  );
});

test('§5 case 4: empty selection returns empty string (caller falls through)', () => {
  const p = BODY.indexOf('Return');
  assert.equal(augmentFacetHeadingCopy(BODY, [{ from: p, to: p }]), '');
  assert.equal(augmentFacetHeadingCopy(BODY, []), '');
});

test('§5 case 5: non-V2a body returns null', () => {
  assert.equal(augmentFacetHeadingCopy('just some prose\n', [{ from: 0, to: 4 }]), null);
  // A data note with no facet headings is not V2a-shaped either.
  const dataNote = '---\ntype: data\ncontent_type: json\n---\n\n```json\n{}\n```\n';
  assert.equal(augmentFacetHeadingCopy(dataNote, [{ from: 0, to: 10 }]), null);
});

// ------------------------------------------------ adjacency edges

test('selection spanning Description body into Recipe body carries BOTH headings', () => {
  // Driver-smoke step 3's shape: # Description arrives as a prepend,
  // # Recipe arrives inside the slice (it sits between the bodies).
  const from = BODY.indexOf('Say hello to x.');
  const to = BODY.indexOf('Return msg.') + 'Return msg.'.length;
  const got = augmentFacetHeadingCopy(BODY, [{ from, to }]);
  assert.ok(got!.startsWith('# Description\n\n'));
  assert.equal(occurrences(got!, '# Description'), 1, 'no duplicate Description');
  assert.equal(occurrences(got!, '# Recipe'), 1, 'Recipe present exactly once (in-slice)');
});

test('selection of ONLY a heading line prepends nothing (slice already is the heading)', () => {
  const r = rangeOf('# Recipe');
  assert.equal(augmentFacetHeadingCopy(BODY, [r]), '# Recipe');
});

test('selection inside frontmatter only touches no facet body — slice unchanged', () => {
  const r = rangeOf('type: action');
  assert.equal(augmentFacetHeadingCopy(BODY, [r]), 'type: action');
});

test('mixed empty + non-empty ranges: empty ones are dropped, not joined as blanks', () => {
  const p = BODY.indexOf('# Python');
  const r = rangeOf('Say hello to x.');
  const got = augmentFacetHeadingCopy(BODY, [{ from: p, to: p }, r]);
  assert.equal(got, '# Description\n\nSay hello to x.');
});

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
