// Drain 2026-10-13-2100 §2 — "Run on a shipped note writes nothing", provable through the plugin's own write function.
//
// `applyPythonWriteBack` is the body of `writeSourcePythonBack`'s `vault.process` callback (the write that follows a Cmd-P Run and a
// Forge click): the `# Python` section, `python_hash`, and the two lineage stamps. It was inline in main.ts, so "does Run rewrite this
// note?" could only be answered by running Obsidian. Pure now: the same function the plugin calls is the one these tests call.
//
// These pin the PROPERTY (a note that is already what the writer would produce is returned byte-for-byte), plus the stamping
// contract the extraction must not have changed. The wiring pin at the bottom pins the MECHANISM (main.ts calls the core) — if the
// call moves, reassess rather than rewrite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { applyPythonWriteBack } from './python-write-back-core.ts';
import { computeFacetHash } from './facet-hash-core.ts';
import { extractPythonSection, getFrontmatterField } from './v2-note-core.ts';

const NOTE = (fm: string, python: string | null) => `---
type: action
${fm}
---

# Description

Say hello.

# Recipe

Print "hello".
${python === null ? '' : `
# Python

\`\`\`python
${python}
\`\`\`
`}`;

const PY = "def compute(context):\n  print('hello')";

async function stamp(body: string, o: Partial<Parameters<typeof applyPythonWriteBack>[1]> = {}) {
  const python = o.python ?? PY;
  return applyPythonWriteBack(body, {
    python,
    pythonHash: await computeFacetHash(python),
    englishHash: null,
    sourceLayer: 'description',
    resolvedSlots: null,
    ...o,
  });
}

test('a note with no # Python gains the section and the three stamps', async () => {
  const before = NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: description', null);
  const after = await stamp(before);
  assert.equal(extractPythonSection(after)?.trim(), PY);
  assert.equal(getFrontmatterField(after, 'python_hash'), await computeFacetHash(PY));
  assert.equal(getFrontmatterField(after, 'python_derived_from_source_hash'), 'd1', 'description-source → the DESCRIPTION hash');
  assert.equal(getFrontmatterField(after, 'python_derived_from_recipe_hash'), 'r1', 'the immediate parent is the Recipe');
});

test('no-op stays no-op — applying the writer to its own output returns the identical bytes', async () => {
  const once = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: description', null));
  const twice = await stamp(once);
  assert.equal(twice, once);
});

test('recipe-source → the lineage root is the RECIPE hash', async () => {
  const after = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: recipe', null), { sourceLayer: 'recipe' });
  assert.equal(getFrontmatterField(after, 'python_derived_from_source_hash'), 'r1');
});

test("'synced' is treated as Description (the §3.1 convention)", async () => {
  const after = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: description', null), { sourceLayer: 'synced' });
  assert.equal(getFrontmatterField(after, 'python_derived_from_source_hash'), 'd1');
});

test("python-source → no lineage stamps (Python driving itself is terminal), the hash is still stamped", async () => {
  const after = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: python', null), { sourceLayer: 'python' });
  assert.equal(getFrontmatterField(after, 'python_derived_from_source_hash'), null);
  assert.equal(getFrontmatterField(after, 'python_derived_from_recipe_hash'), null);
  assert.equal(getFrontmatterField(after, 'python_hash'), await computeFacetHash(PY));
});

test('an english_hash of null writes none, and heals the known-bad empty-SHA remnant', async () => {
  const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const after = await stamp(NOTE(`description_hash: d1\nrecipe_hash: r1\nsource_facet: description\nenglish_hash: ${EMPTY}`, null));
  assert.equal(getFrontmatterField(after, 'english_hash'), null, 'the empty-SHA remnant is what the writer strips — a shipped note must not carry it');
});

test('resolved slots are persisted into the note; absent slots write no cache', async () => {
  const withSlots = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: description', null), { resolvedSlots: { k1: "'x'" } });
  assert.match(withSlots, /slots_cache:/);
  const without = await stamp(NOTE('description_hash: d1\nrecipe_hash: r1\nsource_facet: description', null));
  assert.doesNotMatch(without, /slots_cache:/);
});

test('MECHANISM pin — writeSourcePythonBack hands its process callback to the core, not an inline copy', () => {
  const main = fs.readFileSync(path.resolve(import.meta.dirname, 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const start = main.indexOf('private async writeSourcePythonBack(');
  const end = main.indexOf('private async', start + 10);
  const method = main.slice(start, end);
  // Drain 2026-10-15-2100 §1 — the call became `planPythonWriteBack` (which calls `applyPythonWriteBack`, then decides whether a library
  // note should be touched at all). Still the MECHANISM pin: the write goes through the pure core, not an inline copy.
  assert.match(method, /planPythonWriteBack\(/, 'the write goes through the pure core');
  assert.doesNotMatch(method, /setFmFieldV2\(next, 'python_hash'/, 'no inline copy of the stamping remains');
});
