// v0.2.77 — pure-function tests for the snippet-template emitters in
// modal.ts. The modal UI itself depends on the obsidian runtime; we
// test only the body-emission functions, which are static + pure.
//
// v0.2.231 — actionTemplate now emits V2 shape (Description + Recipe).
// canonicalActionTemplate retired in favor of the unified V2 template.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actionTemplate } from './modal-templates-core.ts';

test('actionTemplate declares type: action', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^type:\s*action$/m);
});

test('actionTemplate emits # Description heading (V2 shape)', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^# Description$/m);
});

test('actionTemplate emits # Recipe heading (V2 shape)', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^# Recipe$/m);
});

test('actionTemplate does NOT emit # English heading (V1 retired)', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^# English$/m);
});

test('actionTemplate does NOT emit # Python stub (implicit-locking generates it)', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^# Python$/m);
  assert.doesNotMatch(body, /def compute\(context\):/);
});

test('actionTemplate does NOT declare inputs: [] (V1 frontmatter retired)', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^inputs:\s*\[\]$/m);
});

test('actionTemplate does NOT declare facet_form (v0.2.121 — field retired)', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^facet_form:/m);
});

test('actionTemplate description echoes the snippet name', () => {
  const body = actionTemplate('printer');
  assert.match(body, /^description:\s*printer$/m);
});
