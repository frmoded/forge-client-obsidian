import test from 'node:test';
import assert from 'node:assert/strict';

import { findFallbackMarkdownView } from './find-fallback-markdown-view-core.ts';
import type {
  MarkdownLeafLike,
  MarkdownViewLike,
  WorkspaceLeafFinder,
} from './find-fallback-markdown-view-core.ts';

// v0.2.69 — Bug 2 regression coverage. Each test exercises one rung
// of the fallback chain.

function makeView(path: string | null): MarkdownViewLike {
  return { file: path === null ? null : { path } };
}

function makeLeaf(viewPath: string | null | undefined): MarkdownLeafLike {
  if (viewPath === undefined) return { view: null };
  return { view: makeView(viewPath) };
}

function makeFinder(opts: {
  active?: MarkdownViewLike | null;
  leaves?: MarkdownLeafLike[];
  recent?: MarkdownLeafLike | null;
  withRecentHelper?: boolean;
}): WorkspaceLeafFinder {
  const finder: WorkspaceLeafFinder = {
    getActiveMarkdownView: () => opts.active ?? null,
    getMarkdownLeaves: () => opts.leaves ?? [],
  };
  if (opts.withRecentHelper !== false) {
    finder.getMostRecentLeaf = () => opts.recent ?? null;
  }
  return finder;
}

test('findFallbackMarkdownView: live active view wins when present', () => {
  const live = makeView('A.md');
  const stale = makeView('B.md');
  const result = findFallbackMarkdownView(
    makeFinder({ active: live, leaves: [makeLeaf('C.md')] }),
    stale,
  );
  assert.strictEqual(result, live);
});

test('findFallbackMarkdownView: falls back to lastSeen when no live view', () => {
  const stale = makeView('B.md');
  const result = findFallbackMarkdownView(
    makeFinder({ active: null, leaves: [makeLeaf('C.md')] }),
    stale,
  );
  assert.strictEqual(result, stale);
});

test('findFallbackMarkdownView: falls back to most-recent leaf when lastSeen is null', () => {
  const recent = makeLeaf('R.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: null,
      recent,
      leaves: [makeLeaf('C.md')],
    }),
    null,
  );
  assert.strictEqual(result, recent.view);
});

test('findFallbackMarkdownView: falls back to first markdown leaf when most-recent missing', () => {
  const first = makeLeaf('C.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: null,
      recent: null,
      leaves: [first, makeLeaf('D.md')],
    }),
    null,
  );
  assert.strictEqual(result, first.view);
});

test('findFallbackMarkdownView: returns null when no markdown leaves at all', () => {
  const result = findFallbackMarkdownView(
    makeFinder({ active: null, recent: null, leaves: [] }),
    null,
  );
  assert.strictEqual(result, null);
});

test('findFallbackMarkdownView: skips leaves whose view.file is null', () => {
  const realLeaf = makeLeaf('C.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: null,
      recent: null,
      leaves: [makeLeaf(null), makeLeaf(undefined), realLeaf],
    }),
    null,
  );
  assert.strictEqual(result, realLeaf.view);
});

test('findFallbackMarkdownView: lastSeen with null file does NOT win over a valid leaf', () => {
  const stale = makeView(null);
  const realLeaf = makeLeaf('C.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: null,
      recent: null,
      leaves: [realLeaf],
    }),
    stale,
  );
  assert.strictEqual(result, realLeaf.view);
});

test('findFallbackMarkdownView: tolerates Obsidian without getMostRecentLeaf helper', () => {
  const first = makeLeaf('C.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: null,
      leaves: [first],
      withRecentHelper: false,
    }),
    null,
  );
  assert.strictEqual(result, first.view);
});

test('findFallbackMarkdownView: live active view with null file does NOT win — falls through', () => {
  // Active view exists but has no file (rare — e.g. brand-new unsaved
  // tab). Should still fall through to other tiers.
  const recent = makeLeaf('R.md');
  const result = findFallbackMarkdownView(
    makeFinder({
      active: makeView(null),
      recent,
      leaves: [makeLeaf('C.md')],
    }),
    null,
  );
  assert.strictEqual(result, recent.view);
});
