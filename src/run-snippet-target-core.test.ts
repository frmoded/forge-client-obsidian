// v0.2.288 — regression tests for the CW-2300-C lost-view bug.
//
// Pre-v0.2.288 runSnippet silently emitted "No active note to run."
// when the /generate LLM roundtrip caused focus to shift off the
// forged note. These cases lock in the fallback behavior.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { resolveRunTarget } from './run-snippet-target-core.ts';

describe('resolveRunTarget', () => {
  it('active view with file → use view (editor buffer path)', () => {
    const view = { file: { path: 'blues/slow_burn.md' } };
    const t = resolveRunTarget(view, null);
    assert.equal(t.file?.path, 'blues/slow_burn.md');
    assert.equal(t.view, view);
  });

  it('active view without file → fall back to caller file', () => {
    const view = { file: null as any };
    const fallback = { path: 'blues/slow_burn.md' };
    const t = resolveRunTarget(view as any, fallback);
    assert.equal(t.file?.path, 'blues/slow_burn.md');
    assert.equal(t.view, null);
  });

  it('no active view + fallback file → use fallback (disk-read path)', () => {
    // CW-2300-C smoke scenario: /generate ran, LLM returned, view is
    // null (focus shifted during LLM call). Caller passes its captured
    // file. Pre-v0.2.288 this silently returned "No active note".
    const fallback = { path: 'blues/slow_burn.md' };
    const t = resolveRunTarget(null, fallback);
    assert.equal(t.file?.path, 'blues/slow_burn.md');
    assert.equal(t.view, null);
  });

  it('no active view + no fallback → null (surface "No active note" notice)', () => {
    const t = resolveRunTarget(null, null);
    assert.equal(t.file, null);
    assert.equal(t.view, null);
  });

  it('undefined args are treated as null', () => {
    const t = resolveRunTarget(undefined, undefined);
    assert.equal(t.file, null);
    assert.equal(t.view, null);
  });

  it('active view with file takes priority over fallback', () => {
    // Ensures we prefer the freshest editor buffer when both are
    // available. Caller's fallback is a safety net, not a preference.
    const view = { file: { path: 'a.md' } };
    const fallback = { path: 'b.md' };
    const t = resolveRunTarget(view, fallback);
    assert.equal(t.file?.path, 'a.md');
    assert.equal(t.view, view);
  });

  it('CW-2300-D: view.file getter that became null after capture', () => {
    // v0.2.289 root cause: `view.file` is a live getter on MarkdownView.
    // Between capture at forgeSnippet's start and the runSnippet call
    // ~seconds later (post-LLM), Obsidian may have detached the file
    // from the view. Reading `view.file` again returns null. The fix
    // is to capture the TFile reference INTO A LOCAL CONST at forge-
    // Snippet's start and thread that through — the TFile itself is
    // stable, only the view's getter goes stale.
    //
    // This test simulates the scenario: the view we hand in has file
    // null (getter went stale). The fallbackFile is the caller's
    // early-captured TFile. Correct behavior: use the fallback.
    const staleView = { file: null as any };
    const capturedFile = { path: 'blues/slow_burn.md' };
    const t = resolveRunTarget(staleView as any, capturedFile);
    assert.equal(t.file?.path, 'blues/slow_burn.md');
    assert.equal(t.view, null,
      'view must be null (skip view.save, read from disk instead)');
  });
});
