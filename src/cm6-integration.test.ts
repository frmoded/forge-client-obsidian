// v0.2.116 — integration tests for the v0.2.116 CSS-class gating
// approach (replaced v0.2.111's Decoration.replace which Obsidian
// overrode across v0.2.108→v0.2.115).
//
// The new mechanism: EditorView.editorAttributes.compute reads
// `type:` from the doc's YAML inline and emits a class="forge-
// snippet" attribute on the editor root when the file declares
// `type: action | data`. CSS in styles.css then hides
// `.cm-line:has(.cm-hmd-frontmatter)` inside `.forge-snippet`.
//
// These tests verify the CLASS APPLICATION (CSS isn't part of the
// happy-dom render, only HTML attribute application is). The CSS
// works in Obsidian; the integration tests confirm the class
// shows up correctly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { makeFrontmatterFoldExtension } from './frontmatter-fold-view-plugin.ts';

const SNIPPET_CONTENT = `---
type: action
inputs: []
description: test snippet
---

# English

Some body text here.
`;

test('CM6 integration: extension mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount(SNIPPET_CONTENT, [ext]);
    await harness.flush();
    assert.ok(view, 'view must be created');
    assert.ok(view.dom, 'view.dom must be set');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: snippet file gets `forge-snippet` class on editor root', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount(SNIPPET_CONTENT, [ext]);
    await harness.flush();
    const rootClass = view.dom.getAttribute('class') ?? '';
    assert.ok(rootClass.split(/\s+/).includes('forge-snippet'),
      `editor root must include 'forge-snippet' class for type:action snippets; got class="${rootClass}"`);
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: plain notes (no frontmatter) do NOT get `forge-snippet` class', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount('# Plain note\n\nNo frontmatter here.\n', [ext]);
    await harness.flush();
    const rootClass = view.dom.getAttribute('class') ?? '';
    assert.ok(!rootClass.split(/\s+/).includes('forge-snippet'),
      `plain notes must NOT have 'forge-snippet' class; got class="${rootClass}"`);
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: type field absent → no `forge-snippet` class', async () => {
  const harness = createIntegrationHarness();
  try {
    const noTypeContent = `---
title: Some other note
tags: [foo]
---

# Body

Plain content.
`;
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount(noTypeContent, [ext]);
    await harness.flush();
    const rootClass = view.dom.getAttribute('class') ?? '';
    assert.ok(!rootClass.split(/\s+/).includes('forge-snippet'),
      `notes lacking type:action|data must NOT have 'forge-snippet' class; got class="${rootClass}"`);
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: type: data also gets `forge-snippet` class', async () => {
  const harness = createIntegrationHarness();
  try {
    const dataContent = `---
type: data
content_type: yaml
---

\`\`\`yaml
foo: bar
\`\`\`
`;
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount(dataContent, [ext]);
    await harness.flush();
    const rootClass = view.dom.getAttribute('class') ?? '';
    assert.ok(rootClass.split(/\s+/).includes('forge-snippet'),
      `type:data files must get 'forge-snippet' class; got class="${rootClass}"`);
  } finally {
    harness.destroy();
  }
});
