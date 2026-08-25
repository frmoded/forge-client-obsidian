// Drain 2026-08-25-1000 — what actually flipped `source_facet` on
// cheer.md, reproduced against the real cores.
//
// I reported this at 0945 §2 as an unprompted plugin write-back on a
// synced note. That framing was wrong in its most important word.
// The flip WAS prompted: by my own `git restore .` during drain 0130.
//
// `identifyEditedFacet` compares the file's CURRENT facet hashes to
// the last hashes the plugin observed. A git restore rewrites the file
// underneath it, so the plugin sees "several facets just changed" and
// attributes the change — exactly the external-rewrite case the
// CW-1800 upstream-wins tiebreak was built for.
//
// The bodies below are the real ones, byte for byte: HEAD's cheer.md
// and the working-tree cheer.md that 0130 discarded.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { identifyEditedFacet, decideSourceWrite } from './facet-edit-tracker-core.ts';
import type { FacetHashes } from './facet-edit-tracker-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import {
  extractDescription, extractRecipeSection, extractPythonSection,
} from './v2-note-core.ts';

const HEAD_CHEER = `---
type: action
description_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
recipe_hash: 3999e92fca4f67ced2665eaeebfab25cbdcc6db7f0e0667b1aeecb474c94eddd
python_hash: e2232fee8be2b8e639dc4e76e03969b572cf018df71d40c2aae9337f7645c8c0
recipe_derived_from_source_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
source_facet: description
recipe_derived_from_description_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
python_derived_from_source_hash: ce2515094c395ede82d33206df5bfc333790ef638a6d9bd3be97ec9c38aeb5ca
python_derived_from_recipe_hash: 3999e92fca4f67ced2665eaeebfab25cbdcc6db7f0e0667b1aeecb474c94eddd
---

# Description

Chapter 3 — calls the excited note and returns the result.

**What's next:** [[excited]]

# Recipe

Let shout = Call [[excited]] with word="hooray".
Return shout.

# Python

\`\`\`python
def compute(context):
  shout = excited(word='hooray')
  return shout

\`\`\`
`;

// The working-tree version 0130 discarded. Description IDENTICAL to
// HEAD; Recipe and Python both differ ("cheer" vs "hooray").
const DIRTY_CHEER = HEAD_CHEER
  .replace(/Let shout = Call \[\[excited\]\] with word="hooray"\.\nReturn shout\./,
           'Let result = Call [[excited]] with word="cheer".\nReturn result.')
  .replace(/  shout = excited\(word='hooray'\)\n  return shout/,
           "  result = excited(word='cheer')\n  return result");

async function hashesOf(body: string): Promise<FacetHashes> {
  return {
    desc: await computeFacetHash(extractDescription(body)),
    recipe: await computeFacetHash(extractRecipeSection(body) ?? ''),
    python: await computeFacetHash(extractPythonSection(body) ?? ''),
  };
}

test('the fixtures differ in Recipe and Python only — Description is untouched', async () => {
  const head = await hashesOf(HEAD_CHEER);
  const dirty = await hashesOf(DIRTY_CHEER);
  assert.equal(head.desc, dirty.desc, 'Description must be identical, or the repro is not the incident');
  assert.notEqual(head.recipe, dirty.recipe);
  assert.notEqual(head.python, dirty.python);
});

test('REPRODUCTION: a git restore flips source_facet description -> recipe', async () => {
  // The plugin last observed the dirty file; the restore makes HEAD current.
  const cached = await hashesOf(DIRTY_CHEER);
  const current = await hashesOf(HEAD_CHEER);

  const edited = identifyEditedFacet(current, cached);
  assert.equal(edited, 'recipe',
    'upstream-most CHANGED facet — Description did not move, so Recipe wins');

  assert.equal(decideSourceWrite(edited, 'description'), 'recipe',
    'and that is written straight to source_facet');
});

test('BLAST RADIUS: a whole-file external rewrite can never land on python', async () => {
  // §3. `python` is the value drain 0110 promotes to engine routing, so
  // an unprompted flip TO python would change which code executes.
  // Upstream-wins makes that unreachable whenever Description or Recipe
  // also moved — which is every whole-file rewrite (cp, git checkout,
  // a sync tool).
  const cached: FacetHashes = { desc: 'a', recipe: 'b', python: 'c' };
  assert.equal(identifyEditedFacet({ desc: 'A', recipe: 'B', python: 'C' }, cached), 'description');
  assert.equal(identifyEditedFacet({ desc: 'a', recipe: 'B', python: 'C' }, cached), 'recipe');
  assert.equal(identifyEditedFacet({ desc: 'A', recipe: 'b', python: 'C' }, cached), 'description');

  // python is reachable ONLY when python is the sole facet that moved —
  // i.e. a genuine, targeted Python edit. That is the intended meaning.
  assert.equal(identifyEditedFacet({ desc: 'a', recipe: 'b', python: 'C' }, cached), 'python');

  // Non-vacuity: this guard is worthless if the tiebreak silently became
  // downstream-wins, so assert the ordering it depends on rather than
  // just the outcomes above.
  assert.notEqual(
    identifyEditedFacet({ desc: 'A', recipe: 'B', python: 'C' }, cached),
    'python',
    'downstream-wins would return python here — the CW-1800 regression',
  );
});

test('no baseline means no write — the bootstrap case cannot flip anything', async () => {
  const current = await hashesOf(HEAD_CHEER);
  assert.equal(identifyEditedFacet(current, null), null);
  assert.equal(decideSourceWrite(null, 'description'), null);
});
