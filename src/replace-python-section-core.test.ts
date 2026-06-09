// Pure-core tests for replacePythonSection.
//
// v0.2.42 — the inline main.ts:31 implementation discards everything
// after the `# Python` fence: it sliced `before = lines.slice(0, idx)`
// and appended only the new code, so any `# Dependencies` block, user
// notes, or custom trailing sections were silently wiped on every
// Forge-click. The user-visible regression: in smoke-v0.2.13 (v0.2.41
// wikilink right-click freeze surface), Forge-clicking hello_random.md
// dropped the Dependencies block containing the wikilinks that produce
// the right-click freeze menu — disabling the affordance.
//
// These tests lock in the symmetric-to-replaceEnglishSection contract:
// preserve EVERYTHING before AND after the Python fence; swap only
// what's inside the fence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replacePythonSection } from './replace-python-section-core.ts';

// Helper that builds a snippet body with the standard
// frontmatter/English/Python/Dependencies layout the smoke vault uses.
function makeSnippet(opts: {
  english?: string;
  python: string;
  trailing?: string;
}): string {
  const english = opts.english ?? 'A test snippet.';
  const trailing = opts.trailing ?? '';
  return `---
type: action
description: test
---

# English

${english}

---

# Python

\`\`\`python
${opts.python}
\`\`\`
${trailing}`;
}

test('replacePythonSection: replaces python body verbatim', () => {
  const before = makeSnippet({ python: 'def compute(context):\n    return 1' });
  const result = replacePythonSection(before, 'def compute(context):\n    return 2');
  assert.match(result, /return 2/);
  assert.doesNotMatch(result, /return 1/);
});

test('replacePythonSection: preserves YAML frontmatter', () => {
  const before = makeSnippet({ python: 'def compute(context):\n    return 1' });
  const after = replacePythonSection(before, 'def compute(context):\n    return 2');
  assert.match(after, /^---\ntype: action\ndescription: test\n---/);
});

test('replacePythonSection: preserves the # English facet', () => {
  const before = makeSnippet({
    english: 'Generates a 5-letter name via [[random_name]].',
    python: 'def compute(context):\n    pass',
  });
  const after = replacePythonSection(before, 'def compute(context):\n    return None');
  assert.match(after, /# English/);
  assert.match(after, /\[\[random_name\]\]/);
});

test('replacePythonSection: preserves a # Dependencies block AFTER the python fence (load-bearing)', () => {
  // The bug: pre-v0.2.42, this assertion failed because the helper
  // discarded everything after `# Python`. The Dependencies block —
  // which holds the wikilinks the v0.2.41 right-click freeze surface
  // depends on — was silently wiped on every Forge-click.
  const before = makeSnippet({
    python: 'def compute(context):\n    return None',
    trailing: '\n# Dependencies\n\n[[random_name]] [[Greet]]\n',
  });
  const after = replacePythonSection(before, 'def compute(context):\n    return 42');
  assert.match(after, /# Dependencies/);
  assert.match(after, /\[\[random_name\]\] \[\[Greet\]\]/);
});

test('replacePythonSection: preserves arbitrary trailing content (user notes, custom sections)', () => {
  const before = makeSnippet({
    python: 'def compute(context):\n    pass',
    trailing: '\n# Dependencies\n\n[[foo]]\n\n# Notes\n\nA private note from the author.\n',
  });
  const after = replacePythonSection(before, 'def compute(context):\n    return 99');
  assert.match(after, /# Dependencies/);
  assert.match(after, /\[\[foo\]\]/);
  assert.match(after, /# Notes/);
  assert.match(after, /private note from the author/);
});

test('replacePythonSection: returns input unchanged when no # Python heading is present (legacy contract — main.ts routes through replaceOrInsertPythonHeading instead since v0.2.99)', () => {
  const noPython = `---
type: action
---

# English

A note with no Python facet yet.
`;
  const result = replacePythonSection(noPython, 'def compute(context):\n    pass');
  assert.equal(result, noPython);
});

test('replacePythonSection: idempotent (replacing with identical content twice yields the same output)', () => {
  // No-op-should-remain-no-op assertion per the cc-prompt-queue.md
  // "idempotent helper" rider — catches future regressions where the
  // helper accumulates whitespace, drops a trailing newline on each
  // call, etc.
  const original = makeSnippet({
    python: 'def compute(context):\n    return 1',
    trailing: '\n# Dependencies\n\n[[x]]\n',
  });
  const once = replacePythonSection(original, 'def compute(context):\n    return 1');
  const twice = replacePythonSection(once, 'def compute(context):\n    return 1');
  assert.equal(twice, once, 'second replace with identical code should produce identical output');
});

test('replacePythonSection: preserves trailing content even when python has no language marker (```py vs ```python)', () => {
  // Pre-v0.2.42 the inline helper didn't distinguish — it always
  // wrapped output in ```python regardless of input. The post-fix
  // contract: trailing content survives whichever fence flavor the
  // input uses.
  const before = `---
type: action
---

# English

note

---

# Python

\`\`\`py
def compute(context):
    pass
\`\`\`

# Dependencies

[[x]]
`;
  const after = replacePythonSection(before, 'def compute(context):\n    return 1');
  assert.match(after, /# Dependencies/, 'Dependencies must survive even when input fence is ```py');
  assert.match(after, /\[\[x\]\]/);
});
