// v0.2.233 — tests for the welcome-shape classifier (drain
// 2026-07-02-1630).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyWelcomeShape,
  shouldRefreshWelcome,
} from './welcome-shape-classifier-core.ts';

test('V1 shape: # English present, no # Description', () => {
  const body = '---\ntype: action\ninputs: []\n---\n\n# English\n\nWelcome to Forge.\n\n# Python\n';
  assert.equal(classifyWelcomeShape(body), 'v1');
  assert.equal(shouldRefreshWelcome('v1'), true);
});

test('V2 shape: # Description present', () => {
  const body = '---\ntype: action\n---\n\n# Description\n\nIntent prose.\n\n# Recipe\n\nCall [[print]] with x="ok".\n';
  assert.equal(classifyWelcomeShape(body), 'v2');
  assert.equal(shouldRefreshWelcome('v2'), false);
});

test('Obsidian default: matches the literal Obsidian boilerplate', () => {
  const body = 'This is your new *vault*.\n\nMake some changes and try the search!\n';
  assert.equal(classifyWelcomeShape(body), 'obsidian-default');
  assert.equal(shouldRefreshWelcome('obsidian-default'), true);
});

test('Custom: cohort-authored body with no markers', () => {
  const body = '# My Welcome\n\nHand-authored note from a long-time user.\n';
  assert.equal(classifyWelcomeShape(body), 'custom');
  assert.equal(shouldRefreshWelcome('custom'), false);
});

test('Empty content classifies as custom (do not touch)', () => {
  assert.equal(classifyWelcomeShape(''), 'custom');
  assert.equal(classifyWelcomeShape('   \n  \t\n'), 'custom');
  assert.equal(shouldRefreshWelcome('custom'), false);
});

test('Transition state: both V1 and V2 markers → V2 (preserve in-progress)', () => {
  // A user partway through hand-migrating from V1 to V2: keep V2 to
  // avoid clobbering their work.
  const body = '# English\n\nold\n\n# Description\n\nnew\n';
  assert.equal(classifyWelcomeShape(body), 'v2');
});

test('Obsidian default + V1 markers → V1 wins (cohort edited beyond boilerplate)', () => {
  const body = 'This is your new *vault*.\n\n# English\n\ncohort added v1 facet\n';
  assert.equal(classifyWelcomeShape(body), 'v1');
});

test('V2 shape matches even when other body content is present', () => {
  // Real bundled welcome.md will have prose around the heading.
  const body = '---\ntype: action\ndescription: welcome\n---\n\n# Description\n\nWelcome to Forge.\n\n# Recipe\n\nCall [[print]] with text="Welcome".\nCall [[greet]] with name="world".\n\n# Dependencies\n\n[[print]] [[greet]]\n';
  assert.equal(classifyWelcomeShape(body), 'v2');
});

test('V1-marker false positive guard: substring match should not fire', () => {
  // `# English something` is not the V1 marker (must be a heading line).
  const body = '# English version notes\n\nProse without V1 facet structure.\n';
  // This DOES still classify as v1 because the regex matches `# English`
  // as a heading line (`^# English$` — the regex is anchored). Actually,
  // `# English version notes` does NOT match `^# English$` since the
  // line has extra text. Verify behavior.
  assert.equal(classifyWelcomeShape(body), 'custom');
});

test('shouldRefreshWelcome covers the two refresh cases', () => {
  assert.equal(shouldRefreshWelcome('v1'), true);
  assert.equal(shouldRefreshWelcome('obsidian-default'), true);
  assert.equal(shouldRefreshWelcome('v2'), false);
  assert.equal(shouldRefreshWelcome('custom'), false);
});
