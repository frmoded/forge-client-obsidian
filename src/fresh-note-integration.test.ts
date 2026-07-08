// v0.2.283 drain 1520 — fresh-note edge case rehearsal.
//
// Scenario: cohort mints a new action note with only a Description
// (Recipe empty, Python is a `return None` stub) and immediately clicks
// Forge. CW-2200's Sub-1 fallback preserves "prior Recipe" on LLM
// failure — but a fresh note has no prior. This test suite documents
// the resulting behavior for the load-bearing MCP arc where every
// agent-created sub-note is fresh.
//
// Two scenarios:
//   S1  LLM produces a valid Recipe → sanitizer passes → Recipe replaces
//       the empty section → transpile → Python executes.
//   S2  LLM returns prose-only output → sanitizer returns null → Sub-1
//       fallback fires. What happens on a note with an EMPTY Recipe
//       to preserve? Document behavior; do not hand-fix (L54).
//
// Following the CW-2200 harness pattern:
// src/cw-2200-description-canonical-mutation-cycle.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
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
import { sanitizeLlmRecipe } from './sanitize-llm-recipe-core.ts';

// --- Test doubles ---------------------------------------------------------

class MockVaultFile {
  path: string;
  content: string;
  constructor(p: string, content: string) {
    this.path = p;
    this.content = content;
  }
  async read(): Promise<string> {
    return this.content;
  }
  async process(mutator: (content: string) => string): Promise<void> {
    this.content = mutator(this.content);
  }
}

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
// Mirrors main.ts:2004-2135 (v0.2.283).

async function runDescriptionCanonicalForge(deps: {
  file: MockVaultFile;
  llm: MockLlmGenerateRecipe;
  knownIds: Set<string>;
  libraryCatalogLoaded: boolean;
  notify: (message: string) => void;
}): Promise<{
  wroteNewRecipe: boolean;
  sanitizerResult: string | null;
  notices: string[];
}> {
  const notices: string[] = [];
  let wroteNewRecipe = false;
  const beforeContent = await deps.file.read();
  const currentDescBefore = extractDescription(beforeContent);
  const llmRecipe = await deps.llm.generate(currentDescBefore);
  let sanitized: string | null = null;
  if (llmRecipe !== null) {
    const closure = deps.libraryCatalogLoaded
      ? checkRecipeClosure(llmRecipe, (id) => deps.knownIds.has(id))
      : { ok: true as const, wikilinks: [] };
    sanitized = sanitizeLlmRecipe(llmRecipe);
    const hasValidStmt = sanitized !== null;
    if (closure.ok === true && hasValidStmt) {
      const currentContent = await deps.file.read();
      const currentDesc = extractDescription(currentContent);
      const currentDescHash = await computeFacetHash(currentDesc);
      const newRecipeHash = await computeFacetHash(sanitized!);
      const stamps = computeDescriptionDerivedRecipeStamps(
        currentDescHash,
        newRecipeHash,
      );
      await deps.file.process((content) => {
        let next = replaceRecipeSection(content, sanitized!);
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
      wroteNewRecipe = true;
    } else if (!hasValidStmt) {
      notices.push(
        `Forge: /generate couldn't produce a valid Recipe for this Description (LLM likely lacks the needed chips). Description edit not applied to Recipe; running prior Recipe.`,
      );
      deps.notify(notices[notices.length - 1]);
    } else if (closure.ok === false) {
      const unresolved = closure.unresolved.map((id) => `[[${id}]]`).join(', ');
      notices.push(
        `Forge: /generate produced a Recipe referencing ${unresolved} — not in your vault. Description edit not applied to Recipe; running prior Recipe.`,
      );
      deps.notify(notices[notices.length - 1]);
    }
  }
  return { wroteNewRecipe, sanitizerResult: sanitized, notices };
}

// --- Fixture -------------------------------------------------------------

function loadFreshNoteFixture(): string {
  const fixturePath = path.resolve(
    process.cwd(),
    'test/fixtures/vault/fresh_note_description_only.md',
  );
  return fs.readFileSync(fixturePath, 'utf8');
}

// --- Tests ---------------------------------------------------------------

test('drain-1520 S1: fresh note + valid LLM Recipe → Recipe section populated, stamps written', async () => {
  const fixture = loadFreshNoteFixture();
  const file = new MockVaultFile('test/fresh_note.md', fixture);
  const llm = new MockLlmGenerateRecipe(['Return 42.']);
  const result = await runDescriptionCanonicalForge({
    file,
    llm,
    knownIds: new Set(),
    libraryCatalogLoaded: true,
    notify: () => {},
  });
  assert.equal(result.wroteNewRecipe, true, 'S1 must write the LLM Recipe');
  assert.equal(result.sanitizerResult, 'Return 42.');
  const post = await file.read();
  const rec = (extractRecipeSection(post) ?? '').trim();
  assert.equal(rec, 'Return 42.');
  assert.notEqual(
    getFmFieldV2(post, 'description_hash'),
    null,
    'stamps should be written on S1',
  );
  assert.notEqual(getFmFieldV2(post, 'recipe_hash'), null);
});

test('drain-1520 S2: fresh note + prose-only LLM → sanitizer null → NO write; Recipe stays empty', async () => {
  const fixture = loadFreshNoteFixture();
  const file = new MockVaultFile('test/fresh_note.md', fixture);
  const proseOnly = [
    'Let me think through this deep philosophical question.',
    'The answer to life, the universe, and everything is famously 42.',
    'But I need a specific chip to return 42 as an integer.',
    'I could not find a suitable chip in the available catalog.',
  ].join('\n');
  const llm = new MockLlmGenerateRecipe([proseOnly]);
  const notices: string[] = [];
  const result = await runDescriptionCanonicalForge({
    file,
    llm,
    knownIds: new Set(),
    libraryCatalogLoaded: true,
    notify: (m) => notices.push(m),
  });
  // Observation 1: sanitizer returns null (no Let/Return/[[wikilink]]).
  assert.equal(result.sanitizerResult, null, 'sanitizer must reject pure prose');
  // Observation 2: NO Recipe write happens.
  assert.equal(result.wroteNewRecipe, false, 'Sub-1 must not write on null sanitizer output');
  // Observation 3: Recipe section stays EMPTY (fixture had blank Recipe).
  const post = await file.read();
  const rec = extractRecipeSection(post);
  assert.equal(
    rec?.trim() ?? '',
    '',
    'Sub-1 preserves prior Recipe — which is empty on fresh note',
  );
  // Observation 4: user-facing notice surfaced.
  assert.equal(notices.length, 1);
  assert.match(notices[0], /couldn't produce a valid Recipe/);
  // Observation 5: no stamps written on fail path.
  assert.equal(getFmFieldV2(post, 'description_hash'), null);
  assert.equal(getFmFieldV2(post, 'recipe_hash'), null);
});

test('drain-1520 S2 gap: fresh-note + Sub-1 → downstream transpile of EMPTY Recipe has no defined behavior', async () => {
  // This test DOCUMENTS the gap explicitly rather than exercising it.
  // In production, after Sub-1 fires, forgeSnippet still calls
  // writeCanonicalPythonBack which transpiles the current Recipe body.
  // For a fresh note with an EMPTY Recipe, the Recipe → Python
  // transpile is undefined:
  //   - `resolve_action_code` may return None → Python facet stays
  //     at its `return None` stub, cohort sees no output.
  //   - E-- parser MAY raise on empty input.
  //   - The `# Python` section's existing `def compute(context):
  //     return None` still runs at execution time.
  //
  // Recommended followup drains (not this one — L54):
  //   1. Explicit "empty Recipe" branch in forgeSnippet's Description-
  //      canonical arm: if sanitizer null AND current Recipe is empty,
  //      surface a stronger notice + skip transpile step.
  //   2. Alternative: fresh-note first-forge should REQUIRE a valid
  //      LLM Recipe (no Sub-1 fallback path) since there is nothing
  //      to preserve.
  //
  // For this test: assert the current Recipe body IS empty on a fresh
  // note fixture, so the followup drain's precondition is confirmed.
  const fixture = loadFreshNoteFixture();
  const file = new MockVaultFile('test/fresh_note.md', fixture);
  const rec = extractRecipeSection(await file.read());
  assert.equal(rec?.trim() ?? '', '', 'fresh-note fixture Recipe body is empty');
});
