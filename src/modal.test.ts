// v0.2.77 — pure-function tests for the snippet-template emitters in
// modal.ts. The modal UI itself depends on the obsidian runtime; we
// test only the body-emission functions, which are static + pure.
//
// Covers #6 from the v0.2.77 bundle prompt — modal canonical option.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actionTemplate, canonicalActionTemplate } from './modal-templates-core.ts';

test('actionTemplate (legacy free-English) declares type: action', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^type:\s*action$/m);
});

test('actionTemplate emits # English heading', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^# English$/m);
});

test('actionTemplate emits # Python stub (legacy shape)', () => {
  const body = actionTemplate('my_snippet');
  assert.match(body, /^# Python$/m);
  assert.match(body, /def compute\(context\):/);
});

test('actionTemplate does NOT declare facet_form: canonical', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^facet_form:\s*canonical$/m);
});

test('canonicalActionTemplate declares facet_form: canonical', () => {
  const body = canonicalActionTemplate('my_snippet');
  assert.match(body, /^facet_form:\s*canonical$/m);
});

test('canonicalActionTemplate emits # English heading', () => {
  const body = canonicalActionTemplate('my_snippet');
  assert.match(body, /^# English$/m);
});

test('canonicalActionTemplate does NOT emit # Python stub', () => {
  // Canonical compiles fresh via resolve_action_code per B7.3 — the
  // # Python heading appears only after the first Forge-click writes
  // the cache. Authoring template MUST NOT pre-seed it.
  const body = canonicalActionTemplate('my_snippet');
  assert.doesNotMatch(body, /^# Python$/m);
});

test('canonicalActionTemplate declares type: action', () => {
  const body = canonicalActionTemplate('my_snippet');
  assert.match(body, /^type:\s*action$/m);
});

test('canonicalActionTemplate seed body uses canonical [[print]] call', () => {
  // Demonstrates the call syntax + a builtin sibling reference.
  const body = canonicalActionTemplate('my_snippet');
  assert.match(body, /Do \[\[print\]\]\("hello, world"\)\./);
});

test('canonicalActionTemplate description echoes the snippet name', () => {
  const body = canonicalActionTemplate('greeter');
  assert.match(body, /^description:\s*greeter$/m);
});

test('actionTemplate description echoes the snippet name', () => {
  const body = actionTemplate('printer');
  assert.match(body, /^description:\s*printer$/m);
});
