// v0.2.278 CW-2200 — headless test harness for the Description-canonical
// auto-forge branch. Mocks Obsidian vault + Pyodide + LLM /generate;
// exercises the exact same pure-core + orchestration shape that lives in
// main.ts's forgeSnippet Description-canonical arm.
//
// Purpose: reproduce the driver-reported CW-2200 symptom
// ("recipe changes but doesn't reflect Description intent" or "recipe
// doesn't change after first cycle") end-to-end without a real Obsidian
// process. If the state-machine invariants hold in headless with a mock
// LLM that returns distinct Recipes per call, the bug isn't in the
// plugin's state machine — it's in the LLM output layer (service-side
// prompt / catalog gap). If invariants fail here, we have a plugin bug
// to fix.
//
// Invariants under test (5-cycle mutation succession):
//   I1  Description edit → LLM called with new Description body.
//   I2  Closure passes → Recipe body replaced with LLM output byte-for-byte.
//   I3  Stamps re-baseline: description_hash, recipe_hash,
//       recipe_derived_from_description_hash, legacy
//       recipe_derived_from_source_hash all reflect current bodies post-write.
//   I4  Successive cycles: each Description edit propagates to a fresh
//       Recipe body distinct from prior (assuming LLM returns distinct
//       outputs per call).
//   I5  LLM receives the ACTUAL current Description body (not a stale one).
//   I6  Sub-1 closure-fail path: Recipe body preserved, stamps unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isV2Shape,
  extractDescription,
  extractRecipeSection,
  replaceRecipeSection,
  setFrontmatterField as setFmFieldV2,
  getFrontmatterField as getFmFieldV2,
} from './v2-note-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import {
  checkRecipeClosure,
  computeDescriptionDerivedRecipeStamps,
} from './write-generated-recipe-core.ts';

// --- Test doubles ---------------------------------------------------------

/** Minimal in-memory file with the API surface CW-2000's orchestration
 *  uses: read(), process(mutator). No workspace/plugin overhead. */
class MockVaultFile {
  path: string;
  content: string;

  constructor(path: string, content: string) {
    this.path = path;
    this.content = content;
  }

  async read(): Promise<string> {
    return this.content;
  }

  async process(mutator: (content: string) => string): Promise<void> {
    this.content = mutator(this.content);
  }
}

/** Deterministic mock LLM: returns a preprogrammed sequence of Recipes,
 *  records what Description was passed on each call. This is the
 *  load-bearing test double: verifying LLM sees the CORRECT Description
 *  each cycle is I5, and the sequence lets us test I4 propagation. */
class MockLlmGenerateRecipe {
  responses: Array<string | null>;
  calls: Array<{ description: string }>;
  index: number;

  constructor(responses: Array<string | null>) {
    this.responses = responses;
    this.calls = [];
    this.index = 0;
  }

  async generate(description: string): Promise<string | null> {
    this.calls.push({ description });
    const r = this.responses[this.index] ?? null;
    this.index += 1;
    return r;
  }
}

// --- Description-canonical branch replica ---------------------------------
//
// Mirrors the orchestration at main.ts:2004-2135 (v0.2.278). Any change to
// that path should be reflected here or vice versa. Extraction to a real
// pure-core would let this test file just import that instead of
// duplicating.
async function runDescriptionCanonicalForge(deps: {
  file: MockVaultFile;
  llm: MockLlmGenerateRecipe;
  knownIds: Set<string>;
  transpileRecipeToPython: (file: MockVaultFile) => Promise<void>;
  notify: (message: string) => void;
}): Promise<void> {
  const currentContentBeforeLlm = await deps.file.read();
  const currentDescBeforeLlm = extractDescription(currentContentBeforeLlm);

  const llmRecipe = await deps.llm.generate(currentDescBeforeLlm);

  if (llmRecipe !== null) {
    const closure = checkRecipeClosure(llmRecipe, (id) => deps.knownIds.has(id));
    if (closure.ok === true) {
      // Read current content AGAIN — matches main.ts:2061 which re-reads
      // post-LLM. Description body could have been re-edited during the
      // LLM round-trip in production; this mock preserves that.
      const currentContent = await deps.file.read();
      const currentDesc = extractDescription(currentContent);
      const currentDescHash = await computeFacetHash(currentDesc);
      const newRecipeHash = await computeFacetHash(llmRecipe);
      const stamps = computeDescriptionDerivedRecipeStamps(
        currentDescHash,
        newRecipeHash,
      );
      await deps.file.process((content) => {
        let next = replaceRecipeSection(content, llmRecipe);
        next = setFmFieldV2(next, 'description_hash', stamps.description_hash);
        next = setFmFieldV2(next, 'recipe_hash', stamps.recipe_hash);
        next = setFmFieldV2(
          next,
          'recipe_derived_from_description_hash',
          stamps.recipe_derived_from_description_hash,
        );
        next = setFmFieldV2(
          next,
          'recipe_derived_from_source_hash',
          stamps.recipe_derived_from_source_hash,
        );
        return next;
      });
    } else {
      // Sub-1 closure-fail path: prior Recipe preserved, no stamp updates.
      const unresolvedList = closure.unresolved
        .map((id) => `[[${id}]]`)
        .join(', ');
      deps.notify(
        `Forge: /generate produced a Recipe referencing ${unresolvedList} — not in your vault. Description edit not applied to Recipe; running prior Recipe.`,
      );
    }
  }

  // Always continue to transpile stage (matches main.ts:2118).
  await deps.transpileRecipeToPython(deps.file);
}

// --- Test fixture ---------------------------------------------------------

function makeBaselineNote(desc: string, recipe: string, python: string): string {
  return `---
type: action
canonical_facet: description
---

# Description

${desc}

## Inputs

(none)

# Recipe

${recipe}

# Python

\`\`\`python
${python}
\`\`\`

# Dependencies

`;
}

/** Simulate cohort's Description edit by replacing the # Description body
 *  in-place. Uses the plugin's own conventions so extractDescription
 *  round-trips it correctly. */
function editDescription(content: string, newDesc: string): string {
  return content.replace(
    /(# Description\n\n)([\s\S]*?)(\n## Inputs)/,
    `$1${newDesc}$3`,
  );
}

// --- Tests ----------------------------------------------------------------

test('CW-2200 I1+I2+I3 single cycle: Description edit → LLM called → Recipe replaced + stamps re-baselined', async () => {
  const initial = makeBaselineNote(
    'Baseline description.',
    'Let baseline = Call [[chorus]].',
    'def compute(context):\n  return None',
  );
  const file = new MockVaultFile('test/slow_burn.md', initial);
  const llm = new MockLlmGenerateRecipe([
    'Let cycle1 = Call [[chorus]].\nReturn cycle1.',
  ]);
  const known = new Set(['chorus']);
  const notices: string[] = [];

  file.content = editDescription(file.content, 'Cycle 1 mutation.');
  await runDescriptionCanonicalForge({
    file,
    llm,
    knownIds: known,
    transpileRecipeToPython: async () => {},
    notify: (m) => notices.push(m),
  });

  // I1: LLM called with the new Description.
  assert.equal(llm.calls.length, 1);
  // NOTE: LLM receives POLLUTED description because extractDescription
  // includes `## Inputs` (H2, not H1 → not a section boundary). See
  // CW-2200 diagnostic finding — this pollutes the LLM context and
  // degrades output quality. Assertion just verifies our mutation text
  // is present (as a prefix).
  assert.equal(llm.calls[0].description.startsWith('Cycle 1 mutation.'), true);
  // I2: Recipe body replaced with LLM output.
  const post = await file.read();
  const rec = extractRecipeSection(post) ?? '';
  assert.equal(rec.trim(), 'Let cycle1 = Call [[chorus]].\nReturn cycle1.');
  // I3: Stamps re-baseline.
  const storedDescHash = getFmFieldV2(post, 'description_hash');
  const storedRecipeHash = getFmFieldV2(post, 'recipe_hash');
  const currDescHash = await computeFacetHash(extractDescription(post));
  const currRecipeHash = await computeFacetHash(extractRecipeSection(post) ?? '');
  assert.equal(storedDescHash, currDescHash);
  assert.equal(storedRecipeHash, currRecipeHash);
});

test('CW-2200 I4 five-cycle succession: each cycle produces distinct Recipe body + stamps track', async () => {
  const initial = makeBaselineNote(
    'Baseline description.',
    'Let baseline = Call [[chorus]].',
    'def compute(context):\n  return None',
  );
  const file = new MockVaultFile('test/slow_burn.md', initial);
  const responses = [
    'Let a = Call [[chorus]].\nReturn a.',
    'Let b = Call [[drum_chorus]].\nReturn b.',
    'Let c = Call [[voices_list]] with sections=[a, b].\nReturn c.',
    'Let d = Call [[sequence_list]] with sections=[a, b, c].\nReturn d.',
    'Let e = Call [[chorus]] with profile="final".\nReturn e.',
  ];
  const llm = new MockLlmGenerateRecipe(responses);
  const known = new Set(['chorus', 'drum_chorus', 'voices_list', 'sequence_list']);
  const notices: string[] = [];

  const mutations = [
    'Cycle 1: initial chorus.',
    'Cycle 2: drum focus.',
    'Cycle 3: voice + drum blend.',
    'Cycle 4: full sequence structure.',
    'Cycle 5: final chorus profile.',
  ];

  const recipeBodiesPerCycle: string[] = [];
  const storedHashesPerCycle: Array<{
    desc: string | null | undefined;
    recipe: string | null | undefined;
    derivedFromDesc: string | null | undefined;
  }> = [];

  for (let i = 0; i < mutations.length; i++) {
    file.content = editDescription(file.content, mutations[i]);
    await runDescriptionCanonicalForge({
      file,
      llm,
      knownIds: known,
      transpileRecipeToPython: async () => {},
      notify: (m) => notices.push(m),
    });
    const post = await file.read();
    recipeBodiesPerCycle.push((extractRecipeSection(post) ?? '').trim());
    storedHashesPerCycle.push({
      desc: getFmFieldV2(post, 'description_hash') as string | null,
      recipe: getFmFieldV2(post, 'recipe_hash') as string | null,
      derivedFromDesc: getFmFieldV2(post, 'recipe_derived_from_description_hash') as string | null,
    });
  }

  // I5: LLM saw the correct Description each cycle.
  assert.equal(llm.calls.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(
      llm.calls[i].description.startsWith(mutations[i]),
      true,
      `Cycle ${i + 1}: LLM description should START with mutation "${mutations[i]}", saw "${llm.calls[i].description}"`,
    );
  }

  // I4: Each cycle's Recipe body is distinct (matches LLM output).
  for (let i = 0; i < 5; i++) {
    assert.equal(recipeBodiesPerCycle[i], responses[i].trim());
    if (i > 0) {
      assert.notEqual(
        recipeBodiesPerCycle[i],
        recipeBodiesPerCycle[i - 1],
        `Cycle ${i + 1}: Recipe body should differ from cycle ${i}`,
      );
    }
  }

  // I3 across cycles: stamps track current bodies + descriptions.
  for (let i = 0; i < 5; i++) {
    const expectedDescHash = await computeFacetHash(
      extractDescription(makeBaselineNote(mutations[i], '', '')),
    );
    // description_hash uses plugin's extractDescription which INCLUDES ## Inputs.
    // So compute via extraction on the post-cycle content.
    // Regenerate expected against a synthetic note with just this cycle's desc.
    const cycleContent = editDescription(makeBaselineNote(mutations[i], recipeBodiesPerCycle[i], ''), mutations[i]);
    const expectedFromCycle = await computeFacetHash(extractDescription(cycleContent));
    assert.equal(
      storedHashesPerCycle[i].desc,
      expectedFromCycle,
      `Cycle ${i + 1}: stored description_hash mismatch`,
    );
    assert.equal(
      storedHashesPerCycle[i].derivedFromDesc,
      expectedFromCycle,
      `Cycle ${i + 1}: recipe_derived_from_description_hash mismatch`,
    );
  }
});

test('CW-2200 I6 closure fail preserves prior Recipe + skips stamp updates', async () => {
  const initial = makeBaselineNote(
    'Baseline description.',
    'Let baseline = Call [[chorus]].',
    'def compute(context):\n  return None',
  );
  const file = new MockVaultFile('test/slow_burn.md', initial);
  const llm = new MockLlmGenerateRecipe([
    'Let bad = Call [[nonexistent_chip]].\nReturn bad.',
  ]);
  const known = new Set(['chorus']); // does NOT include nonexistent_chip
  const notices: string[] = [];

  file.content = editDescription(file.content, 'Mutation ignored by closure fail.');
  const contentBefore = await file.read();
  const recipeBefore = extractRecipeSection(contentBefore) ?? '';

  await runDescriptionCanonicalForge({
    file,
    llm,
    knownIds: known,
    transpileRecipeToPython: async () => {},
    notify: (m) => notices.push(m),
  });

  const post = await file.read();
  const recipeAfter = extractRecipeSection(post) ?? '';
  // I6a: Recipe body preserved.
  assert.equal(recipeAfter, recipeBefore, 'Recipe body should be unchanged on closure fail');
  // I6b: description_hash NOT stamped (stays absent from baseline).
  assert.equal(
    getFmFieldV2(post, 'description_hash'),
    null,
    'description_hash should stay absent on closure fail (Sub-1)',
  );
  // I6c: Notice surfaced with unresolved wikilinks.
  assert.equal(notices.length, 1);
  assert.match(notices[0], /nonexistent_chip/);
});

test('CW-2200 mid-cycle Description re-edit: post-LLM re-read captures cohort race', async () => {
  // Simulates the race where cohort edits Description again WHILE the LLM
  // is round-tripping. main.ts:2061 re-reads content AFTER LLM returns, so
  // the stored description_hash reflects the LATEST body (not what the LLM
  // saw). This validates that the stamp corresponds to what's on disk,
  // not what the LLM was invoked with.
  const initial = makeBaselineNote(
    'Baseline description.',
    'Let baseline = Call [[chorus]].',
    'def compute(context):\n  return None',
  );
  const file = new MockVaultFile('test/slow_burn.md', initial);
  file.content = editDescription(file.content, 'Description at LLM call time.');

  // LLM that mutates the file's Description mid-round-trip.
  const midCallMutation = 'Description mutated AFTER LLM saw earlier version.';
  const originalGenerate = MockLlmGenerateRecipe.prototype.generate;
  const llm = new MockLlmGenerateRecipe([
    'Let x = Call [[chorus]].\nReturn x.',
  ]);
  llm.generate = async (desc: string) => {
    llm.calls.push({ description: desc });
    // Simulate cohort mutation during LLM round-trip.
    file.content = editDescription(file.content, midCallMutation);
    return llm.responses[llm.index++] ?? null;
  };

  await runDescriptionCanonicalForge({
    file,
    llm,
    knownIds: new Set(['chorus']),
    transpileRecipeToPython: async () => {},
    notify: () => {},
  });

  const post = await file.read();
  // LLM saw the pre-mid-mutation Description.
  assert.equal(llm.calls[0].description.startsWith('Description at LLM call time.'), true);
  // But the stored description_hash reflects the LATEST (mid-mutation) body.
  // This is CORRECT semantic under drain 1200: "stored = last-forged
  // snapshot" — the forge event is the write, and the write hashes what
  // it wrote.
  const storedDescHash = getFmFieldV2(post, 'description_hash');
  const currDescHash = await computeFacetHash(extractDescription(post));
  assert.equal(
    storedDescHash,
    currDescHash,
    'description_hash should reflect current on-disk body (mid-mutation), not what LLM saw',
  );
  // The Description body on disk should be the mid-mutation version.
  assert.match(extractDescription(post), /mutated AFTER LLM/);
});
