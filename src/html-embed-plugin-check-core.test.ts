// Drain 2026-09-22-1840 — failing-first-not-mandatory (new feature, not
// a bug fix) tests for decideHtmlEmbedPluginNotice's truth table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHtmlEmbedPluginNotice } from './html-embed-plugin-check-core.ts';

test('decideHtmlEmbedPluginNotice: installed + enabled -> no Notice', () => {
  const r = decideHtmlEmbedPluginNotice(true, true);
  assert.equal(r.state, 'installed-enabled');
  assert.ok(!('noticeMessage' in r));
});

test('decideHtmlEmbedPluginNotice: installed, not enabled -> toggle-on message', () => {
  const r = decideHtmlEmbedPluginNotice(true, false);
  assert.equal(r.state, 'installed-disabled');
  if (r.state === 'installed-disabled') {
    assert.match(r.noticeMessage, /installed but not enabled/);
    assert.match(r.noticeMessage, /Community plugins/);
    assert.match(r.noticeMessage, /toggle it on/);
    // THE distinction that cost the diagnostic round-trip: this must
    // NOT tell the user to search/install — it's already installed.
    assert.doesNotMatch(r.noticeMessage, /search/i);
  }
});

test('decideHtmlEmbedPluginNotice: not installed -> search-and-install message', () => {
  const r = decideHtmlEmbedPluginNotice(false, false);
  assert.equal(r.state, 'not-installed');
  if (r.state === 'not-installed') {
    assert.match(r.noticeMessage, /Community plugins/);
    assert.match(r.noticeMessage, /search/);
    assert.match(r.noticeMessage, /install/);
    // Must not falsely suggest a toggle exists to find.
    assert.doesNotMatch(r.noticeMessage, /toggle it on/);
  }
});

test('decideHtmlEmbedPluginNotice: enabled-but-somehow-not-installed reads as not-installed', () => {
  // Defensive: the two reads aren't atomic with each other. This isn't
  // a real Obsidian state, but the decision must not throw or invent
  // a fourth state for it.
  const r = decideHtmlEmbedPluginNotice(false, true);
  assert.equal(r.state, 'not-installed');
});

test('decideHtmlEmbedPluginNotice: the three states are actually distinct', () => {
  // Non-vacuity — the whole point is that these don't collapse.
  const states = new Set([
    decideHtmlEmbedPluginNotice(true, true).state,
    decideHtmlEmbedPluginNotice(true, false).state,
    decideHtmlEmbedPluginNotice(false, false).state,
  ]);
  assert.deepEqual(states, new Set(['installed-enabled', 'installed-disabled', 'not-installed']));
});

test('decideHtmlEmbedPluginNotice: plugin display name is named plainly, not by id', () => {
  // The user reads "local-html-embed" (the id) nowhere as helpful; the
  // display name is what they'd search for in Community Plugins.
  const notInstalled = decideHtmlEmbedPluginNotice(false, false);
  const disabled = decideHtmlEmbedPluginNotice(true, false);
  if (notInstalled.state === 'not-installed') {
    assert.match(notInstalled.noticeMessage, /Local HTML Embed/);
  }
  if (disabled.state === 'installed-disabled') {
    assert.match(disabled.noticeMessage, /Local HTML Embed/);
  }
});
