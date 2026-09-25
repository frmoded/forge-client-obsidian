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

// --- drain 2026-09-25-1910: the create-time gate was too narrow -------------
// main.ts only checked `.html` creates whose path started with `assets/`, but
// forge_create_asset writes to ANY vault-relative path (e.g. the monochord
// gadget at music_instruments/resources/html/monochord.html), so the Notice
// silently never fired for it. The path decision now lives in the pure core.
import { readFileSync } from 'node:fs';
import { isHtmlEmbedCandidatePath } from './html-embed-plugin-check-core.ts';

test('isHtmlEmbedCandidatePath: a nested (non-assets/-root) .html create IS a candidate', () => {
  assert.equal(isHtmlEmbedCandidatePath('music_instruments/resources/html/monochord.html'), true);
  assert.equal(isHtmlEmbedCandidatePath('notes/resources/html/widget.html'), true);
});

test('isHtmlEmbedCandidatePath: assets/ and vault-root .html are still candidates', () => {
  assert.equal(isHtmlEmbedCandidatePath('assets/cc-html-embed-test.html'), true);
  assert.equal(isHtmlEmbedCandidatePath('page.html'), true);
});

test('isHtmlEmbedCandidatePath: extension match is case-insensitive and exact', () => {
  assert.equal(isHtmlEmbedCandidatePath('a/B.HTML'), true);
  assert.equal(isHtmlEmbedCandidatePath('a/b.htmlx'), false);
  assert.equal(isHtmlEmbedCandidatePath('a/b.md'), false);
  assert.equal(isHtmlEmbedCandidatePath('a/b.svg'), false);
  assert.equal(isHtmlEmbedCandidatePath('a/html'), false);
});

test('isHtmlEmbedCandidatePath: hidden directories (.obsidian plugin files etc.) are not', () => {
  assert.equal(isHtmlEmbedCandidatePath('.obsidian/plugins/forge/assets/iframe/index.html'), false);
  assert.equal(isHtmlEmbedCandidatePath('notes/.cache/x.html'), false);
});

test("main.ts's vault 'create' handler uses the predicate, not an assets/ prefix gate", () => {
  const src = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const i = src.indexOf('maybeNotifyHtmlEmbedPluginState(file.path)');
  assert.ok(i > 0, 'could not find the create-handler call site');
  const handler = src.slice(Math.max(0, i - 400), i + 60);
  assert.match(handler, /isHtmlEmbedCandidatePath\(file\.path\)/);
  assert.doesNotMatch(handler, /startsWith\('assets\/'\)/);
});
