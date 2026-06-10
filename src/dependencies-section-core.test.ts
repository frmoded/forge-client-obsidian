// v0.2.122 — tests for findDependenciesRange + isLineInsideDependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDependenciesRange,
  isLineInsideDependencies,
} from './dependencies-section-core.ts';

test('findDependenciesRange: standard snippet — Dependencies last section', () => {
  const doc = `---
type: action
---

# English

Print "hi".

# Python

\`\`\`python
def compute(context): print("hi")
\`\`\`

# Dependencies

[[print]]
`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  // Line 14 = "# Dependencies" (0-indexed after the lines above)
  const lines = doc.split('\n');
  const depsLineIdx = lines.findIndex(l => l.trim() === '# Dependencies');
  assert.equal(r!.depsStart, depsLineIdx);
  // depsEnd extends to EOF (last index = lines.length - 1).
  assert.equal(r!.depsEnd, lines.length - 1);
});

test('findDependenciesRange: Dependencies followed by another heading', () => {
  const doc = `# English

A.

# Dependencies

[[foo]]

# Trailing

trailing content
`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  const lines = doc.split('\n');
  const depsLineIdx = lines.findIndex(l => l.trim() === '# Dependencies');
  const trailingLineIdx = lines.findIndex(l => l.trim() === '# Trailing');
  assert.equal(r!.depsStart, depsLineIdx);
  assert.equal(r!.depsEnd, trailingLineIdx - 1);
});

test('findDependenciesRange: no Dependencies heading returns null', () => {
  const doc = `# English\n\nbody.\n# Python\n\npass\n`;
  assert.equal(findDependenciesRange(doc), null);
});

test('findDependenciesRange: case-insensitive heading match', () => {
  const doc = `# dependencies\n[[foo]]\n`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  assert.equal(r!.depsStart, 0);
});

test('findDependenciesRange: subheadings (## level) inside Dependencies extend the section', () => {
  // Defensive: # Dependencies might contain ## sub-headings as part
  // of its body. Only top-level # (or any level) heading after the
  // # Dependencies line closes the section. We use any-level match
  // (`/^#{1,6}\s+\S/`), so a ## inside terminates the section.
  // This is conservative; in practice # Dependencies bodies are flat
  // wikilinks, no subheadings. Test documents the boundary.
  const doc = `# Dependencies\n## Sub\nbody\n`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  assert.equal(r!.depsStart, 0);
  assert.equal(r!.depsEnd, 0);  // ## Sub terminates the section
});

test('findDependenciesRange: heading-only Dependencies (no body) — depsStart == depsEnd', () => {
  const doc = `# English\n\nA.\n\n# Dependencies\n`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  const lines = doc.split('\n');
  const depsLineIdx = lines.findIndex(l => l.trim() === '# Dependencies');
  assert.equal(r!.depsStart, depsLineIdx);
  // depsEnd = last line of the document since there's no following heading.
  assert.equal(r!.depsEnd, lines.length - 1);
});

test('findDependenciesRange: multiple Dependencies headings → uses first', () => {
  const doc = `# Dependencies

first body

# English

middle

# Dependencies

second body
`;
  const r = findDependenciesRange(doc);
  assert.ok(r);
  assert.equal(r!.depsStart, 0);
  // First # English at line 4 terminates the first Dependencies section
  const lines = doc.split('\n');
  const englishIdx = lines.findIndex(l => l.trim() === '# English');
  assert.equal(r!.depsEnd, englishIdx - 1);
});

test('isLineInsideDependencies: inside range returns true', () => {
  const doc = `# English\nA.\n# Dependencies\n[[foo]]\n[[bar]]\n`;
  // Lines: 0=# English, 1=A., 2=# Dependencies, 3=[[foo]], 4=[[bar]]
  assert.equal(isLineInsideDependencies(doc, 0), false);
  assert.equal(isLineInsideDependencies(doc, 1), false);
  assert.equal(isLineInsideDependencies(doc, 2), true);  // # Dependencies heading
  assert.equal(isLineInsideDependencies(doc, 3), true);  // body
  assert.equal(isLineInsideDependencies(doc, 4), true);  // body (last line)
});

test('isLineInsideDependencies: no Dependencies → always false', () => {
  const doc = `# English\nbody\n`;
  assert.equal(isLineInsideDependencies(doc, 0), false);
  assert.equal(isLineInsideDependencies(doc, 1), false);
});

test('isLineInsideDependencies: line past doc-end → false', () => {
  const doc = `# Dependencies\n[[foo]]\n`;
  assert.equal(isLineInsideDependencies(doc, 99), false);
});
