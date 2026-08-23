// Drain 2026-08-24-1610 — the strip's Run button, and the strip's
// follow logic. CCQA v0.2.365 bundle, check 2.
//
// Both halves are the same mistake in two places: RE-DERIVING state at
// the moment of use instead of using the state already in hand.
//
// (a) The strip's Run failed 3/3 with "No active note to run", while
//     the toolbar ▶ worked on the same notes. The host's run callback
//     called runSnippet with fallbackFile === undefined, so runSnippet
//     re-queried the workspace — and clicking a button inside the panel
//     makes the PANEL the active leaf, so there is no active markdown
//     note to find. The strip must run the note it is DISPLAYING.
//
//     This is the third instance of the class: v0.2.288 fixed it for
//     the auto-forge path (the LLM roundtrip shifting focus) and drain
//     1600 fixed a dropped facet argument next door. Same shape.
//
// (b) Tab-switching to a non-action note left the strip stale instead
//     of greying, while URI-navigation updated correctly. The refresh
//     handler ignored the event's payload and re-queried
//     `getActiveViewOfType`, whose pointer has not settled when
//     active-leaf-change fires — the documented hazard behind the
//     StateField rule in cc-prompt-queue.md. It read the PREVIOUS
//     note, so the strip stayed 'active' on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function mainSrc(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
}

test('(a) the strip run binds to the displayed note, not the active leaf', () => {
  const src = mainSrc();
  const cb = src.split('run: (snippetId, kwargs, raw) => {')[1] ?? '';
  const body = cb.slice(0, 1400);
  assert.ok(
    !/this\.runSnippet\(\s*'Forge failed during execution',\s*undefined,\s*undefined,/.test(body),
    'the strip run still passes no target file — it will re-derive the active leaf',
  );
  assert.match(body, /stripRunTarget|fileForSnippetId/, body);
});

test('(a) non-vacuity: the extractor found the run callback', () => {
  // A split that missed would make the assertion above pass over an
  // empty string, which is exactly the green-for-nothing failure.
  const src = mainSrc();
  assert.ok(src.includes('run: (snippetId, kwargs, raw) => {'), 'callback shape moved');
});

test('(b) the strip refresh uses the event payload, not a re-query', () => {
  const src = mainSrc();
  // The two registrations that feed the strip must hand their payload
  // through rather than dropping it.
  assert.match(src, /on\('active-leaf-change', \(leaf\) => \{\s*void this\.refreshForgePanelStrip\(leaf/);
  assert.match(src, /on\('file-open', \(file\) => \{\s*void this\.refreshForgePanelStrip\(undefined, file/);
});

test('(b) refreshForgePanelStrip accepts the payload', () => {
  assert.match(
    mainSrc(),
    /private async refreshForgePanelStrip\(\s*leaf\?[^)]*file\?[^)]*\)/s,
  );
});
