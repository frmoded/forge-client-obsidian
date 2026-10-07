import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideRightLeafPlacement,
  FORGE_RIGHT_SIDEBAR_VIEW_TYPES,
} from './right-leaf-eviction-core.ts';

// ---------------------------------------------------------------------
// Drain 2026-08-28-0910 §3 (R5) / §4 (R6) — the leaf-reuse eviction bug.
//
// Confirmed via code reading + Obsidian's documented `getRightLeaf`
// contract (obsidian.d.ts:7002), not live reproduction — this session
// has no tool that drives the Obsidian desktop app. The mechanism is
// deterministic given the API's own semantics, unlike §1's timing race.

test('0910 THE BUG: a Forge panel already in the leaf forces a split for a different Forge view', () => {
  assert.equal(
    decideRightLeafPlacement('forge-output', 'forge-edges-view'),
    'split',
    'opening the edges panel would evict the Forge panel',
  );
});

test('0910 the reverse direction also splits (R5 is symmetric with R6)', () => {
  // R5 was "another panel evicts the Forge panel"; the identical mechanism runs in
  // reverse whenever getOutputView() is called while the edges panel is open.
  assert.equal(decideRightLeafPlacement('forge-edges-view', 'forge-output'), 'split');
});

test('0910 the 3D view is covered too — forge-core flagged it as the same bug shape', () => {
  assert.equal(decideRightLeafPlacement('forge-output', 'forge-three'), 'split');
  assert.equal(decideRightLeafPlacement('forge-three', 'forge-edges-view'), 'split');
});

test('0910 NON-VACUITY: reopening the SAME view type still reuses (no split spam)', () => {
  // Clicking the edges button again while the edges panel is already open must not
  // spawn a second leaf every time.
  assert.equal(decideRightLeafPlacement('forge-edges-view', 'forge-edges-view'), 'reuse');
  assert.equal(decideRightLeafPlacement('forge-output', 'forge-output'), 'reuse');
});

test('0910 NON-VACUITY: an empty right sidebar reuses (creates the first leaf, nothing to evict)', () => {
  assert.equal(decideRightLeafPlacement(null, 'forge-edges-view'), 'reuse');
  assert.equal(decideRightLeafPlacement(null, 'forge-output'), 'reuse');
});

test('0910 SCOPE PIN: an unrelated, non-Forge pane still reuses — unchanged pre-fix behaviour', () => {
  // This fix's job is Forge-vs-Forge eviction only. A community plugin's
  // panel, the file explorer, search, backlinks, etc. keep whatever
  // behaviour they had before this drain — not this drain's call to
  // change, and driver R5/R6 never complained about it.
  assert.equal(decideRightLeafPlacement('file-explorer', 'forge-edges-view'), 'reuse');
  assert.equal(decideRightLeafPlacement('search', 'forge-output'), 'reuse');
  assert.equal(decideRightLeafPlacement('some-other-plugin-view', 'forge-three'), 'reuse');
});

test('0910 the known-types list contains the three remaining sites (the palette\'s forge-chips left with its retirement, 2026-10-07)', () => {
  // forge-output/forge-three were named by the prompt. forge-edges-view
  // was found via a full sweep of getRightLeaf(false) call sites and has
  // the identical bug shape (see FEEDBACK). forge-chips is gone.
  assert.deepEqual(
    [...FORGE_RIGHT_SIDEBAR_VIEW_TYPES].sort(),
    ['forge-edges-view', 'forge-output', 'forge-three'].sort(),
  );
});

test('0910 the edges panel (found beyond the prompt) splits against the others too', () => {
  assert.equal(decideRightLeafPlacement('forge-output', 'forge-edges-view'), 'split');
  assert.equal(decideRightLeafPlacement('forge-edges-view', 'forge-three'), 'split');
});

test('0910 a caller-supplied type list is honoured (no hidden global state)', () => {
  assert.equal(
    decideRightLeafPlacement('some-view', 'forge-edges-view', ['some-view']),
    'split',
    'a caller-supplied knownForgeViewTypes list was ignored',
  );
  assert.equal(
    decideRightLeafPlacement('forge-output', 'forge-edges-view', []),
    'reuse',
    'an EMPTY caller-supplied list should never split — nothing is known to be a Forge view',
  );
});

// ---------------------------------------------------------------------
// WIRING — the half a pure-core assertion cannot see (drain 1700/1830/
// 0900's own precedent). Confirms all call sites actually route
// through pickRightLeaf, not just that the decision function exists.

import { readFileSync } from 'node:fs';

test('0910 WIRED: pickRightLeaf exists and consults decideRightLeafPlacement', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const fn = main.slice(
    main.indexOf('private pickRightLeaf('),
    main.indexOf('private pickRightLeaf(') + main.slice(main.indexOf('private pickRightLeaf(')).indexOf('\n  }\n') + 4,
  );
  assert.match(fn, /getViewType\?\.\(\)/, 'the candidate leaf\'s current view type is never read');
  assert.match(fn, /decideRightLeafPlacement\(/, 'the pure-core decision is never consulted');
  assert.match(fn, /getRightLeaf\(true\)/, 'a split is never actually requested');
});

test('0910 WIRED: the remaining call sites route through pickRightLeaf, not a raw getRightLeaf(false)', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  // Exactly TWO raw getRightLeaf(false) calls should remain in the whole
  // file: pickRightLeaf's own probe, and the unrelated onload-timing
  // comment at ~line 534 documenting a DIFFERENT historical bug (that
  // comment contains the literal text but is prose, not code — sliced
  // out below by excluding comment-only lines).
  const codeLines = main.split('\n').filter(l => !l.trim().startsWith('//'));
  const rawCalls = codeLines.filter(l => l.includes('getRightLeaf(false)')).length;
  assert.equal(rawCalls, 1, `expected exactly 1 raw getRightLeaf(false) call (inside pickRightLeaf itself), found ${rawCalls}`);

  for (const [label, wantType] of [
    ['THREE_VIEW_TYPE', 'THREE_VIEW_TYPE'],
    ['EDGES_VIEW_TYPE', 'EDGES_VIEW_TYPE'],
    ['OUTPUT_VIEW_TYPE', 'OUTPUT_VIEW_TYPE'],
  ]) {
    assert.match(
      main, new RegExp(`this\\.pickRightLeaf\\(${wantType}\\)`),
      `${label} does not route through pickRightLeaf`,
    );
  }
});
