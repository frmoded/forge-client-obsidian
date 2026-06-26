// v0.2.202 — CM6 integration test for the V2.1 Slot Phase 3 highlight
// extension. Per the prompt's CM6 HARD RULE: mount the ViewPlugin
// inside a CM6 EditorView and verify the decorations actually paint
// the `forge-slot-unresolved` class on the rendered cm-content.
//
// happy-dom doesn't render CSS, but it DOES apply attribute mutations
// from CM6 decorations to the DOM. We assert the class shows up on
// the rendered slot text spans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationHarness } from './test-helpers/cm6-harness.ts';
import { slotHighlightViewPlugin } from './slot-highlight-view-plugin.ts';

const V2_NOTE_WITH_TWO_SLOTS = `---
type: action
---

# Description

A note about something.

# Recipe

Let fact = {{a fun fact about octopuses}}.
Let greet = {{a friendly greeting}}.
[[print]] fact.
Return.
`;

const V2_NOTE_NO_SLOTS = `---
type: action
---

# Description

Plain note.

# Recipe

[[print]] "hello".
Return.
`;

const V1_NOTE_WITH_BRACES_IN_PROSE = `---
type: action
---

# English

Just prose with {{looks-like-a-slot}} which should not highlight
because there's no # Recipe section in V1 notes.
`;

const V2_NOTE_WITH_SLOT_IN_DESCRIPTION = `---
type: action
---

# Description

This Description mentions {{a slot-like thing}} but slots in
prose Description aren't actually parsed as slots.

# Recipe

Let x = {{the actual slot}}.
Return x.
`;

test('CM6 integration: slot highlight mounts without throwing', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2_NOTE_WITH_TWO_SLOTS, [slotHighlightViewPlugin]);
    await harness.flush();
    assert.ok(view, 'view must be created');
    assert.ok(view.dom, 'view.dom must be set');
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: {{...}} in # Recipe gets forge-slot-unresolved class', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2_NOTE_WITH_TWO_SLOTS, [slotHighlightViewPlugin]);
    await harness.flush();
    const html = view.contentDOM.innerHTML;
    // The class must appear at least once — both slots are in Recipe.
    assert.ok(
      html.includes('forge-slot-unresolved'),
      `expected forge-slot-unresolved in rendered DOM, got: ${html.slice(0, 500)}`,
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: title attribute (tooltip) applied alongside class', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2_NOTE_WITH_TWO_SLOTS, [slotHighlightViewPlugin]);
    await harness.flush();
    const html = view.contentDOM.innerHTML;
    assert.ok(
      html.includes('title="LLM blank'),
      `expected tooltip title attribute, got: ${html.slice(0, 500)}`,
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: V2 note with no slots has NO forge-slot-unresolved class', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2_NOTE_NO_SLOTS, [slotHighlightViewPlugin]);
    await harness.flush();
    const html = view.contentDOM.innerHTML;
    assert.ok(
      !html.includes('forge-slot-unresolved'),
      'slot-less Recipe must not produce any highlight decorations',
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: V1 note (no # Recipe heading) does NOT highlight {{...}} in prose', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V1_NOTE_WITH_BRACES_IN_PROSE, [slotHighlightViewPlugin]);
    await harness.flush();
    const html = view.contentDOM.innerHTML;
    assert.ok(
      !html.includes('forge-slot-unresolved'),
      'V1 note must not get slot-highlight (no # Recipe section to scope to)',
    );
  } finally {
    harness.destroy();
  }
});

test('CM6 integration: {{...}} in # Description does NOT highlight; only the # Recipe slot does', async () => {
  const harness = createIntegrationHarness();
  try {
    const view = harness.mount(V2_NOTE_WITH_SLOT_IN_DESCRIPTION, [slotHighlightViewPlugin]);
    await harness.flush();
    const html = view.contentDOM.innerHTML;
    // Should contain "the actual slot" wrapped, not "a slot-like thing".
    assert.ok(
      html.includes('forge-slot-unresolved'),
      'recipe-section slot must highlight',
    );
    // Spot the slot count: exactly one decoration span. Count
    // occurrences of the class to verify.
    const matches = html.match(/forge-slot-unresolved/g) ?? [];
    assert.equal(
      matches.length,
      1,
      `expected exactly 1 highlight (recipe slot), got ${matches.length}: ${html.slice(0, 600)}`,
    );
  } finally {
    harness.destroy();
  }
});
