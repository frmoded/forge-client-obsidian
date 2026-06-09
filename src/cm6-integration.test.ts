// v0.2.112 Item B — integration tests for the CM6 harness.
//
// Two assertions on the frontmatter-fold extension (v0.2.111
// implementation) when run in PURE CM6 + happy-dom (no Obsidian):
//
//   1. The extension is wired without throwing — confirms no CM6
//      structural violation. Catches the v0.2.109 ViewPlugin-cannot-
//      line-break-span surprise.
//   2. The Decoration.replace actually renders — the YAML text is
//      replaced in the DOM by a placeholder widget.
//
// If both pass against v0.2.111 here, but cohort still sees expanded
// frontmatter, the issue is Obsidian-specific (renderer override,
// compartment timing, or workspace-pointer race that doesn't have
// an analog in plain CM6). Per the prompt §3.2 Plan B, that
// confirmation authorizes shipping CSS de-emphasis as v0.2.112
// Item C interim while the harness gets extended.

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

test('CM6 integration: makeFrontmatterFoldExtension mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    // The mount itself would throw the v0.2.109 RangeError if any
    // included ViewPlugin tried to provide a line-break-spanning
    // decoration. Since v0.2.110 we route through a StateField, so
    // this should mount cleanly.
    const view = harness.mount(SNIPPET_CONTENT, [ext]);
    await harness.flush();
    assert.ok(view, 'view must be created');
    assert.ok(view.dom, 'view.dom must be set');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: frontmatter range is hidden via Decoration.replace placeholder', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount(SNIPPET_CONTENT, [ext]);
    await harness.flush();

    // The CM6 DOM contains line elements. After the
    // Decoration.replace, the YAML lines should not appear as
    // visible content but the placeholder widget should.
    const html = view.dom.outerHTML;
    const hasPlaceholder = html.includes('forge-frontmatter-placeholder');
    const hasTypeAction = html.includes('type: action');

    // Sanity check first: confirm CM6 mounted the doc.
    assert.ok(html.includes('# English'),
      'CM6 should render the # English heading line');

    // The two real assertions:
    assert.ok(hasPlaceholder,
      'Decoration.replace should have produced our placeholder widget in the DOM');
    assert.ok(!hasTypeAction,
      'YAML line "type: action" must NOT appear in the rendered DOM (the placeholder replaces the range)');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: plain notes (no frontmatter) render normally — no placeholder added', async () => {
  const harness = createIntegrationHarness();
  try {
    const ext = makeFrontmatterFoldExtension(() => null);
    const view = harness.mount('# Plain note\n\nNo frontmatter here.\n', [ext]);
    await harness.flush();

    const html = view.dom.outerHTML;
    assert.ok(html.includes('Plain note'), 'body must render');
    assert.ok(!html.includes('forge-frontmatter-placeholder'),
      'no placeholder widget should render for plain notes');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: type field absent → no fold (gate respects readFrontmatterType)', async () => {
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
    const html = view.dom.outerHTML;
    assert.ok(html.includes('title: Some other note'),
      'frontmatter without type: action|data should remain visible');
    assert.ok(!html.includes('forge-frontmatter-placeholder'),
      'no placeholder for notes lacking type:action|data');
  } finally {
    harness.destroy();
  }
});
