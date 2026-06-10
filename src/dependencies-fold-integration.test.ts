// v0.2.122 — integration test for makeDependenciesFoldExtension.
// Per the v0.2.120 HARD RULE: CM6 extension changes need an
// integration test against createIntegrationHarness().
//
// The harness uses happy-dom + a real CM6 EditorView. We verify that
// Decoration.line with class `forge-deps-line` actually lands on the
// rendered `.cm-line` DOM elements for lines inside the
// `# Dependencies` section, and NOT on lines outside it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { makeDependenciesFoldExtension } from './dependencies-fold-view-plugin.ts';

const SNIPPET_WITH_DEPS = `# English

Print "hi".

# Dependencies

[[print]]
`;

test('CM6 integration: lines inside # Dependencies get the `forge-deps-line` class', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(SNIPPET_WITH_DEPS, [makeDependenciesFoldExtension()]);
    await harness.flush();

    // Each rendered line is a `.cm-line` element. The Decoration.line
    // should have added `forge-deps-line` class to the lines from
    // `# Dependencies` onward (which are lines 4-6 in this doc:
    // empty, # Dependencies, empty, [[print]], empty... actually
    // 0-indexed: 0=# English, 1=empty, 2=Print "hi"., 3=empty,
    // 4=# Dependencies, 5=empty, 6=[[print]], 7=empty).
    const lines = view.dom.querySelectorAll('.cm-line');
    assert.ok(lines.length > 0, 'CM6 must render some .cm-line elements');

    // The total lines is doc.split('\n').length; CM6 typically
    // collapses trailing empty lines into one. We verify:
    // - At least one line has the `forge-deps-line` class.
    // - Lines BEFORE # Dependencies (e.g. "# English") do NOT.
    const linesWithDepsClass = view.dom.querySelectorAll('.cm-line.forge-deps-line');
    assert.ok(linesWithDepsClass.length > 0,
      `expected at least one .cm-line to have .forge-deps-line; got ${linesWithDepsClass.length}`);

    // Verify the # English heading line does NOT have the class.
    let englishLine: Element | null = null;
    for (const line of Array.from(lines)) {
      if (line.textContent?.includes('# English')) { englishLine = line; break; }
    }
    if (englishLine) {
      assert.ok(!englishLine.classList.contains('forge-deps-line'),
        '# English line MUST NOT have .forge-deps-line class');
    }

    // Verify the # Dependencies line DOES have the class.
    let depsLine: Element | null = null;
    for (const line of Array.from(lines)) {
      if (line.textContent?.includes('# Dependencies')) { depsLine = line; break; }
    }
    if (depsLine) {
      assert.ok(depsLine.classList.contains('forge-deps-line'),
        '# Dependencies line MUST have .forge-deps-line class');
    }
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: doc without # Dependencies → no `forge-deps-line` class anywhere', async () => {
  const harness = createIntegrationHarness();
  try {
    const noDeps = `# English\n\nPrint "hi".\n# Python\n\npass\n`;
    const view = harness.mount(noDeps, [makeDependenciesFoldExtension()]);
    await harness.flush();
    const lines = view.dom.querySelectorAll('.cm-line.forge-deps-line');
    assert.equal(lines.length, 0,
      `no # Dependencies → no .forge-deps-line class should appear; got ${lines.length}`);
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: extension mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(SNIPPET_WITH_DEPS, [makeDependenciesFoldExtension()]);
    await harness.flush();
    assert.ok(view, 'view must be created');
    assert.ok(view.dom, 'view.dom must be set');
  } finally {
    harness.destroy();
  }
});
