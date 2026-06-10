// v0.2.113 — Tests for findEnglishFacetBounds + isLineInsideEnglishBody.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findEnglishFacetBounds,
  isLineInsideEnglishBody,
} from './find-english-facet-bounds.ts';

test('findEnglishFacetBounds: standard snippet shape', () => {
  const doc = `---
type: action
inputs: []
---

# English

Body line A.
Body line B.

# Python

\`\`\`python
def compute(context): pass
\`\`\`
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  // # English is at line 5 (0-indexed). Next heading # Python at line 10.
  assert.equal(b!.englishStart, 5);
  assert.equal(b!.englishEnd, 10);
});

test('findEnglishFacetBounds: no English heading', () => {
  const doc = `---
type: action
---

# Python

\`\`\`python
pass
\`\`\`
`;
  assert.equal(findEnglishFacetBounds(doc), null);
});

test('findEnglishFacetBounds: English at start (no frontmatter)', () => {
  const doc = `# English

Body.

# Python

pass
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 0);
  assert.equal(b!.englishEnd, 4);
});

test('findEnglishFacetBounds: English-only doc (no following section)', () => {
  const doc = `---
type: action
---

# English

Body line A.
Body line B.
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 4);
  // No further heading; englishEnd = lines.length.
  assert.equal(b!.englishEnd, doc.split('\n').length);
});

test('findEnglishFacetBounds: empty English body followed by Python', () => {
  const doc = `# English
# Python
pass
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 0);
  assert.equal(b!.englishEnd, 1);
});

test('findEnglishFacetBounds: --- separator counts as section boundary', () => {
  const doc = `# English

Body.

---

trailing matter
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 0);
  assert.equal(b!.englishEnd, 4);
});

test('findEnglishFacetBounds: multiple English headings → first wins', () => {
  const doc = `# English

First.

# Python
pass

# English

Second.
`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 0);
  assert.equal(b!.englishEnd, 4);
});

test('findEnglishFacetBounds: case-insensitive heading match', () => {
  const doc = `# english\n\nBody.\n`;
  const b = findEnglishFacetBounds(doc);
  assert.ok(b);
  assert.equal(b!.englishStart, 0);
});

test('isLineInsideEnglishBody: cursor on heading is NOT inside body', () => {
  const doc = `# English\nA\nB\n# Python\n`;
  assert.equal(isLineInsideEnglishBody(doc, 0), false);
  assert.equal(isLineInsideEnglishBody(doc, 1), true);
  assert.equal(isLineInsideEnglishBody(doc, 2), true);
  assert.equal(isLineInsideEnglishBody(doc, 3), false);  // # Python
});

test('isLineInsideEnglishBody: no English heading → always false', () => {
  const doc = `# Python\npass\n`;
  assert.equal(isLineInsideEnglishBody(doc, 0), false);
  assert.equal(isLineInsideEnglishBody(doc, 1), false);
});

test('isLineInsideEnglishBody: cursor past doc-end → false', () => {
  const doc = `# English\nbody\n`;
  assert.equal(isLineInsideEnglishBody(doc, 99), false);
});
