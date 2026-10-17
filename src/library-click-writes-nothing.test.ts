// Drain 2026-10-15-2100 §1 — the hammer on a SHIPPED recipe-canonical note must not dirty it.
//
// CCQA (build 39a273e): clicking the hammer on `forge-tutorial/01-hello/hello_world` (`source_facet: recipe`, every hash consistent)
// rewrote `python_derived_from_source_hash` from the RECIPE hash to the DESCRIPTION hash. Mechanism, read off the real bytes: the
// canonical probe `whichLayerIsSource` answers `synced` for a hash-consistent note, and the stamper treated `synced` as Description
// ("the §3.1 convention") whatever the note's stored `source_facet` said. A hash-consistent note is exactly what a shipped library
// note is, so every library note whose source is the Recipe was re-stamped with a lineage root that is not its source.
//
// Two properties are pinned here, over the REAL shipped bytes (assets/vaults — not a hand-built twin):
//   (a) the stamper roots the lineage at the SOURCE facet: for source_facet=recipe that is the Recipe hash, probe verdict or not;
//   (b) a Run/transpile write on a library-directory note whose ONLY difference is derived lineage or whitespace writes NOTHING.
// (b) is the guard that holds even where (a) is wrong again some other way; (a) is the reason the shipped bytes are already a fixed point.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { applyPythonWriteBack, planPythonWriteBack } from './python-write-back-core.ts';
import { computeFacetHash, whichLayerIsSource } from './facet-hash-core.ts';
import {
  extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape,
} from './v2-note-core.ts';

const VAULTS = path.resolve(import.meta.dirname, '..', 'assets', 'vaults');
const str = (b: string, k: string) => { const v = getFrontmatterField(b, k); return typeof v === 'string' ? v : null; };
const H = { extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: str };
const HELLO = path.join(VAULTS, 'forge-tutorial', '01-hello', 'hello_world.md');

async function inputFor(body: string) {
  const python = extractPythonSection(body)!;
  return {
    python,
    pythonHash: await computeFacetHash(python),
    englishHash: null,
    sourceLayer: await whichLayerIsSource(body, H),
    resolvedSlots: null,
  };
}

test('the real hello_world: a hash-consistent note the probe calls synced, whose source_facet is recipe', async () => {
  const body = fs.readFileSync(HELLO, 'utf8');
  assert.equal(str(body, 'source_facet'), 'recipe');
  assert.equal(await whichLayerIsSource(body, H), 'synced', 'the premise: the probe cannot tell a recipe-source note from a description-source one here');
});

test('(a) the stamper roots the lineage at the SOURCE facet — the real hello_world comes back byte-identical', async () => {
  const body = fs.readFileSync(HELLO, 'utf8');
  const after = applyPythonWriteBack(body, await inputFor(body));
  assert.equal(str(after, 'python_derived_from_source_hash'), str(body, 'recipe_hash'),
    'source_facet: recipe → the lineage root is the RECIPE hash (it was rewritten to the Description hash)');
  assert.equal(after, body);
});

test('(a) the same note with source_facet: description is rooted at the DESCRIPTION hash (the other half of the rule)', async () => {
  const recipeBody = fs.readFileSync(HELLO, 'utf8');
  const body = recipeBody.replace('source_facet: recipe', 'source_facet: description');
  const after = applyPythonWriteBack(body, await inputFor(body));
  assert.equal(str(after, 'python_derived_from_source_hash'), str(body, 'description_hash'));
});

test('(b) a library-directory Run on the real hello_world writes NOTHING', async () => {
  const body = fs.readFileSync(HELLO, 'utf8');
  const plan = planPythonWriteBack(body, await inputFor(body), { library: true });
  assert.equal(plan.write, false);
  assert.equal(plan.next, body);
});

test('(b) a lineage-only difference on a library note writes nothing; the same difference on a cohort note IS restamped', async () => {
  const good = fs.readFileSync(HELLO, 'utf8');
  const drifted = good.replace(/^python_derived_from_source_hash: .*$/m, 'python_derived_from_source_hash: 9df031860fb368ecd04845772ec8b455a9d729bbcd475a13539da92fd25b5942');
  assert.notEqual(drifted, good);
  // Pass the CORRECT lineage root explicitly, so only (b) is under test here, not (a).
  const input = { ...(await inputFor(good)), sourceLayer: 'recipe' as const };
  const lib = planPythonWriteBack(drifted, input, { library: true });
  assert.equal(lib.write, false, 'library note: lineage is not worth a write');
  assert.equal(lib.next, drifted);
  const cohort = planPythonWriteBack(drifted, input, { library: false });
  assert.equal(cohort.write, true, 'a cohort note keeps its lineage maintenance');
  assert.equal(cohort.next, good);
});

test('(b) a trailing-whitespace-only difference on a library note writes nothing (the appended blank line CCQA saw)', async () => {
  const good = fs.readFileSync(HELLO, 'utf8');
  const input = await inputFor(good);
  for (const dirty of [good + '\n', good + '\n\n', good.replace('hello, world\')\n```', "hello, world')  \n```")]) {
    assert.notEqual(dirty, good);
    const plan = planPythonWriteBack(dirty, input, { library: true });
    assert.equal(plan.write, false, JSON.stringify(dirty.slice(-30)));
    assert.equal(plan.next, dirty);
  }
});

test('(b) non-vacuity: a REAL change still writes, on a library note too — the guard hides cosmetics, not content', async () => {
  const good = fs.readFileSync(HELLO, 'utf8');
  const input = await inputFor(good);
  const newPython = "def compute(context):\n  print('hello, again')";
  const changed = await planPythonWriteBack(good, { ...input, python: newPython, pythonHash: await computeFacetHash(newPython) }, { library: true });
  assert.equal(changed.write, true, 'the transpile produced different Python: persist it');
  assert.ok(changed.next.includes('hello, again'));
  // a stale python_hash is a real (non-lineage) difference
  const stale = good.replace(/^python_hash: .*$/m, 'python_hash: 00');
  assert.equal(planPythonWriteBack(stale, input, { library: true }).write, true);
});

test('across EVERY shipped action note: a library Run writes only a note that was never stamped (no python_hash) — never a stamped one', async () => {
  const wroteStamped: string[] = [];
  const wroteUnstamped: string[] = [];
  let checked = 0;
  for (const vault of ['forge-moda', 'music-theory', 'forge-tutorial', 'music-core']) {
    const dir = path.join(VAULTS, vault);
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []);
    for (const file of walk(dir)) {
      const body = fs.readFileSync(file, 'utf8');
      if (str(body, 'type') !== 'action' || !isV2Shape(body) || extractPythonSection(body) === null) continue;
      checked++;
      const plan = planPythonWriteBack(body, await inputFor(body), { library: true });
      if (!plan.write) continue;
      (str(body, 'python_hash') === null ? wroteUnstamped : wroteStamped).push(`${vault}/${path.relative(dir, file)}`);
    }
  }
  assert.ok(checked > 20, `only ${checked} notes examined — the walk is broken or the bundle moved`);
  assert.deepEqual(wroteStamped, [], 'a hammer click / Run would rewrite these although every stamp on them is already consistent');
  // Not a failure — a finding. A note shipped with NO stamps at all gets its first python_hash on its first Run: that is a real
  // (non-cosmetic) difference, so it is written. Listed so the number is visible in the suite output and cannot grow silently.
  console.log(`library Run on ${checked} shipped notes: only these unstamped ones would write (first stamp):`, wroteUnstamped);
  assert.ok(wroteUnstamped.length <= 2, 'the set of shipped notes carrying no stamps grew — restamp them in the content repo');
});
