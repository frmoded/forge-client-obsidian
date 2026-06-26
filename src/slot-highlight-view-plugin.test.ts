// v0.2.202 — pure-core unit tests for the V2.1 Slot Phase 3 highlight
// extension's range / pattern helpers. The CM6 integration coverage
// lives in slot-highlight-view-plugin.integration.test.ts per the
// CM6 HARD RULE.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  findRecipeHeadingOffset,
  findNextH1OffsetAfter,
  recipeSectionRange,
  buildSlotHighlightDecorations,
} from './slot-highlight-view-plugin.ts';

const SAMPLE_V2 = `---
type: action
---

# Description

A note about {{octopus}}. Slots in Description should NOT be
highlighted; cohort may use {{...}} in prose without meaning a slot.

# Recipe

Let fact = {{a random fun fact about octopuses}}.
Let greeting = "Hi, " + {{a friendly name}}.
[[print]] greeting.
Return.

# Python

something
`;

describe('findRecipeHeadingOffset', () => {
  test('returns the byte offset of # Recipe', () => {
    const off = findRecipeHeadingOffset(SAMPLE_V2);
    assert.ok(off > 0);
    assert.equal(SAMPLE_V2.slice(off, off + 9), '# Recipe\n');
  });

  test('returns -1 when # Recipe absent', () => {
    assert.equal(findRecipeHeadingOffset('# Description\nfoo\n'), -1);
  });

  test('matches only the exact heading line, not a heading-substring elsewhere', () => {
    const body = 'Some prose mentioning # Recipe inline.\n# Recipe\nactual body.\n';
    const off = findRecipeHeadingOffset(body);
    // Must point at the *second* occurrence (the actual H1), not the
    // inline prose mention.
    assert.equal(body.slice(off, off + 9), '# Recipe\n');
  });
});

describe('findNextH1OffsetAfter', () => {
  test('returns offset of next H1 after a given offset', () => {
    const recipeAt = findRecipeHeadingOffset(SAMPLE_V2);
    const next = findNextH1OffsetAfter(SAMPLE_V2, recipeAt);
    assert.equal(SAMPLE_V2.slice(next, next + 9), '# Python\n');
  });

  test('returns body length when no next H1', () => {
    const body = '# Recipe\njust the recipe, no Python heading\n';
    const recipeAt = findRecipeHeadingOffset(body);
    assert.equal(findNextH1OffsetAfter(body, recipeAt), body.length);
  });
});

describe('recipeSectionRange', () => {
  test('returns the byte range covering # Recipe content (excludes heading)', () => {
    const range = recipeSectionRange(SAMPLE_V2);
    assert.ok(range);
    const body = SAMPLE_V2.slice(range!.from, range!.to);
    assert.ok(body.startsWith('\nLet fact ='));
    assert.ok(body.includes('Return.\n'));
    // Must NOT include the # Python heading.
    assert.ok(!body.includes('# Python'));
  });

  test('returns null when no # Recipe heading', () => {
    assert.equal(recipeSectionRange('# Description\nfoo\n'), null);
  });
});

describe('buildSlotHighlightDecorations (pure logic surface)', () => {
  test('highlights every {{...}} inside # Recipe', () => {
    const decos = buildSlotHighlightDecorations(SAMPLE_V2);
    // CM6 RangeSet exposes .size for the count of decorated ranges.
    assert.equal(decos.size, 2);
  });

  test('does NOT highlight {{...}} in # Description', () => {
    const body = `# Description\n\nProse with {{octopus}} word.\n\n# Recipe\n\nReturn.\n`;
    const decos = buildSlotHighlightDecorations(body);
    assert.equal(decos.size, 0);
  });

  test('returns empty DecorationSet when no # Recipe section', () => {
    const body = `# Description\n\nProse only.\n`;
    const decos = buildSlotHighlightDecorations(body);
    assert.equal(decos.size, 0);
  });

  test('ignores multi-line {{...}} blocks (parse contract)', () => {
    // The Phase 1 parser rejects multi-line slot text; the highlight
    // mirrors that so the visual signal matches what the parser will
    // accept.
    const body = `# Recipe\n\nLet x = {{\n  multi\n  line\n}}.\nReturn.\n`;
    const decos = buildSlotHighlightDecorations(body);
    assert.equal(decos.size, 0);
  });

  test('matches adjacent slots independently (non-greedy)', () => {
    const body = `# Recipe\n\nLet x = {{first}} + {{second}}.\nReturn.\n`;
    const decos = buildSlotHighlightDecorations(body);
    assert.equal(decos.size, 2);
  });
});
