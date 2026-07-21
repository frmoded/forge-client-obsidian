// CW-slot-cache-panel-treatment tests. Mirror of
// `llm-rejection-guidance-core.test.ts` for the sibling load-bearing
// diagnostic path.

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  deriveSlotCacheNotFoundGuidance,
} from './slot-cache-not-found-guidance-core.ts';
import type { LocateAttempt } from './locate-snippet-file-core.ts';

const missBoth: LocateAttempt[] = [
  { step: 'exact-path', tried: 'create_scale_take_2.md', matched: false },
  { step: 'basename', tried: 'create_scale_take_2', matched: false },
];

describe('deriveSlotCacheNotFoundGuidance', () => {
  it('names each attempted lookup in the guidance body', () => {
    // §5.1 — the three-attempt trace is what makes the guidance
    // actionable. The user must be able to see WHICH lookup missed.
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'create_scale_take_2',
      providedFilePath: null,
      attempts: missBoth,
      markdownFileCount: 42,
    });
    assert.match(g.likelyCause, /create_scale_take_2\.md/);
    assert.match(g.likelyCause, /create_scale_take_2/);
    assert.match(g.likelyCause, /42/);
  });

  it('empty vault produces distinct "no .md files" guidance', () => {
    // §5.3 — Case A. The user needs to know the vault-selection lane
    // is the issue, not the snippet-authoring lane.
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'anything',
      providedFilePath: null,
      attempts: [
        { step: 'exact-path', tried: 'anything.md', matched: false },
        { step: 'basename', tried: 'anything', matched: false },
      ],
      markdownFileCount: 0,
    });
    assert.match(g.likelyCause, /no \.md files/i);
    // Fix options include the vault-selection guidance.
    const joined = g.fixOptions.join(' ');
    assert.match(joined, /vault/i);
  });

  it('populated-vault miss guidance names the stale-wikilink pattern', () => {
    // §5.2 — Case B. The most common root cause for this failure
    // is a stale wikilink to a renamed/deleted note; the guidance
    // must call that out.
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'renamed_note',
      providedFilePath: null,
      attempts: [
        { step: 'exact-path', tried: 'renamed_note.md', matched: false },
        { step: 'basename', tried: 'renamed_note', matched: false },
      ],
      markdownFileCount: 12,
    });
    // Prose calls out stale wikilink / rename.
    assert.match(g.likelyCause, /wikilink|rename/i);
    // Fix options give ≥2 concrete actions.
    assert.ok(g.fixOptions.length >= 2);
  });

  it('provided-file path (when non-null) appears in the guidance', () => {
    // Robustness: if the caller supplied a path but it was falsy at
    // some later check, the diagnostic must surface the value so the
    // user can debug the threading.
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'weird_case',
      providedFilePath: 'experiments/weird_case.md',
      attempts: missBoth,
      markdownFileCount: 5,
    });
    assert.match(g.likelyCause, /experiments\/weird_case\.md/);
  });

  it('provided-file path null does NOT invent a fake path in prose', () => {
    // Regression guard: if providedFilePath is null, the prose must
    // say "caller did not supply a source file" — NOT "supplied null".
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'no_provided',
      providedFilePath: null,
      attempts: missBoth,
      markdownFileCount: 8,
    });
    assert.doesNotMatch(g.likelyCause, /null/i);
    assert.match(g.likelyCause, /did not supply|fell back/i);
  });

  it('nested-path snippetId keeps the qualified path in guidance', () => {
    // If the snippetId is a qualified path (`experiments/foo`),
    // the exact-path attempt should show `experiments/foo.md` and
    // the basename attempt should show `foo`.
    const g = deriveSlotCacheNotFoundGuidance({
      snippetId: 'experiments/foo',
      providedFilePath: null,
      attempts: [
        { step: 'exact-path', tried: 'experiments/foo.md', matched: false },
        { step: 'basename', tried: 'foo', matched: false },
      ],
      markdownFileCount: 30,
    });
    assert.match(g.likelyCause, /experiments\/foo\.md/);
    assert.match(g.likelyCause, /foo/);
  });

  it('always provides ≥2 fix options', () => {
    // Contract: the user should never see an empty fix-options list.
    for (const md of [0, 1, 100]) {
      const g = deriveSlotCacheNotFoundGuidance({
        snippetId: 'test',
        providedFilePath: null,
        attempts: missBoth,
        markdownFileCount: md,
      });
      assert.ok(g.fixOptions.length >= 2, `md=${md} had ${g.fixOptions.length} options`);
    }
  });
});
