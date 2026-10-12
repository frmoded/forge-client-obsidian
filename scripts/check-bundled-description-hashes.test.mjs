// Drain 2026-10-12-1700 §2 — a shipped note's stored `description_hash` must be the hash of its own Description, by THE PLUGIN'S OWN
// algorithm (src/description-hash-core.ts + src/v2-note-core.ts extractDescription). Observed (CCQA, 2026-10-12): 17 of 49 bundled notes
// with a hash + Description disagree, so a freshly extracted `hello_world` reports "Description source / out of date" and its first
// hammer click calls the LLM and rewrites the library note.
//
// WHAT THE INVESTIGATION FOUND (git history of all 17, algorithm replayed on every version):
//   - the stamping algorithm is not wrong: `hello_world` MATCHED at da09e5e and the plugin's own re-stamp of the dirty working tree
//     writes exactly sha256(Description) — 9df03186…;
//   - the hashes went stale because the Description was EDITED afterwards and the edit did not restamp: `forge_edit_markdown_note
//     (facet=description)` deliberately never restamps (its own docstring), and a hand/git edit never does;
//   - in 10 of the 14 music-theory exercises the stored hash equals the hash of the prose BEFORE the first `##` sub-heading — a
//     `## Inputs` section was added to the Description (drain "Declare typed Input … HARD RULE 2b") and the hash was left behind.
//   Nothing checked the invariant at ship time. This is that check (and the tool that re-stamps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  checkNote, checkVault, descriptionHashOf, restampNote,
} from './check-bundled-description-hashes-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, 'check-bundled-description-hashes.mjs');

const note = (hash, desc, extraFm = '') => `---
type: action
description_hash: ${hash}
recipe_hash: aaaa1111
recipe_derived_from_description_hash: ${hash}
recipe_derived_from_source_hash: ${hash}
python_hash: bbbb2222
python_derived_from_source_hash: aaaa1111
python_derived_from_recipe_hash: aaaa1111
source_facet: recipe
${extraFm}---

# Description

${desc}

# Recipe

Print "hi".
`;

const PROSE = 'Print hello.';
const WITH_INPUTS = 'Print hello.\n\n## Inputs\n\n- name — who to greet';

test('descriptionHashOf: the plugin\'s algorithm — the whole Description INCLUDING ## sub-sections, trailing-whitespace normalised', async () => {
  const a = await descriptionHashOf(note('x', WITH_INPUTS));
  const prose = await descriptionHashOf(note('x', PROSE));
  assert.notEqual(a, prose, 'a ## Inputs sub-section is part of the Description');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await descriptionHashOf(note('x', 'Print hello.   \n\n## Inputs\n\n- name — who to greet  ')), a, 'trailing whitespace per line is ignored');
});

test('descriptionHashOf agrees with the plugin\'s own computeFacetHash over extractDescription (parity, not a copy)', async () => {
  const { computeFacetHash } = await import('../src/facet-hash-core.ts');
  const { extractDescription } = await import('../src/v2-note-core.ts');
  for (const d of [PROSE, WITH_INPUTS, 'a\n\n\nb\n']) {
    const body = note('x', d);
    assert.equal(await descriptionHashOf(body), await computeFacetHash(extractDescription(body)));
  }
});

test('checkNote: matching stored hash passes; a stale one is reported with stored and actual', async () => {
  const good = await descriptionHashOf(note('x', PROSE));
  assert.equal((await checkNote(note(good, PROSE))).ok, true);
  const stale = await checkNote(note('deadbeef'.repeat(8), PROSE));
  assert.equal(stale.ok, false);
  assert.equal(stale.stored, 'deadbeef'.repeat(8));
  assert.equal(stale.actual, good);
});

test('checkNote: the OBSERVED failure — hash taken before a ## Inputs section was added — is caught', async () => {
  const proseOnly = await descriptionHashOf(note('x', PROSE));
  const r = await checkNote(note(proseOnly, WITH_INPUTS));
  assert.equal(r.ok, false);
  assert.equal(r.stored, proseOnly);
});

test('checkNote: notes the check does not apply to are skipped, never failed (no hash, no Description, not a note with frontmatter)', async () => {
  assert.equal((await checkNote('just prose, no frontmatter\n')).skipped, true);
  assert.equal((await checkNote('---\ntype: data\n---\n\nbody\n')).skipped, true);
  assert.equal((await checkNote('---\ntype: action\ndescription_hash: abc\n---\n\n# Recipe\n\nx\n')).skipped, true, 'a hash but no # Description facet');
  assert.equal((await checkNote('---\ntype: action\n---\n\n# Description\n\nx\n')).skipped, true, 'a Description but no stored hash');
});

test('restampNote: sets description_hash AND the lineage fields that named the OLD hash; touches nothing else, byte for byte', async () => {
  const old = 'deadbeef'.repeat(8);
  const before = note(old, WITH_INPUTS);
  const after = await restampNote(before);
  const actual = await descriptionHashOf(before);
  assert.equal(after.includes(`description_hash: ${actual}`), true);
  assert.equal(after.includes(`recipe_derived_from_description_hash: ${actual}`), true);
  assert.equal(after.includes(`recipe_derived_from_source_hash: ${actual}`), true);
  assert.equal(after.includes(old), false, 'no trace of the stale hash is left in the frontmatter');
  // unrelated hashes and every body byte unchanged
  assert.equal(after.includes('recipe_hash: aaaa1111'), true);
  assert.equal(after.includes('python_hash: bbbb2222'), true);
  assert.equal(after.includes('python_derived_from_recipe_hash: aaaa1111'), true);
  assert.equal(after.includes('python_derived_from_source_hash: aaaa1111'), true, 'a lineage field that names the RECIPE hash is not ours to rewrite');
  assert.equal(after.slice(after.indexOf('\n---\n', 4)), before.slice(before.indexOf('\n---\n', 4)), 'everything after the frontmatter is identical');
  assert.equal((await checkNote(after)).ok, true);
});

test('restampNote is idempotent, and a note that already matches is returned unchanged', async () => {
  const once = await restampNote(note('deadbeef'.repeat(8), PROSE));
  assert.equal(await restampNote(once), once);
  const good = note(await descriptionHashOf(note('x', PROSE)), PROSE);
  assert.equal(await restampNote(good), good);
});

test('restampNote never rewrites a hash that merely looks like the old one inside the BODY', async () => {
  const old = 'deadbeef'.repeat(8);
  const before = note(old, PROSE).replace('Print "hi".', `Print "${old}".`);
  const after = await restampNote(before);
  assert.equal(after.includes(`Print "${old}".`), true, 'the body keeps its own text');
});

test('restampNote keeps CRLF files CRLF', async () => {
  const before = note('deadbeef'.repeat(8), PROSE).replace(/\n/g, '\r\n');
  const after = await restampNote(before);
  assert.equal(after.includes('\r\n'), true);
  assert.equal(/[^\r]\n/.test(after), false, 'no bare LF introduced');
});

function tmpVault(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desc-hash-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return dir;
}

test('checkVault walks .md files, skips dot-dirs and rolling backups, and lists every stale note by relative path', async () => {
  const good = await descriptionHashOf(note('x', PROSE));
  const dir = tmpVault({
    'ok.md': note(good, PROSE),
    'sub/stale.md': note('deadbeef'.repeat(8), PROSE),
    '.forge/hidden.md': note('deadbeef'.repeat(8), PROSE),
    'lib.bak.previous/old.md': note('deadbeef'.repeat(8), PROSE),
    'readme.txt': 'not a note',
  });
  try {
    const r = await checkVault(dir);
    assert.deepEqual(r.stale.map((s) => s.path), ['sub/stale.md']);
    assert.equal(r.checked, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: exit 1 and a message naming each stale note and the fix when anything is stale; exit 0 when clean; --fix rewrites and then passes', async () => {
  const good = await descriptionHashOf(note('x', PROSE));
  const dir = tmpVault({ 'a.md': note(good, PROSE), 'b.md': note('deadbeef'.repeat(8), WITH_INPUTS) });
  try {
    const bad = spawnSync('node', [CLI, dir], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr + bad.stdout, /b\.md/);
    assert.match(bad.stderr + bad.stdout, /--fix/);
    assert.doesNotMatch(bad.stderr + bad.stdout, /a\.md/);

    const fixed = spawnSync('node', [CLI, '--fix', dir], { encoding: 'utf8' });
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.equal(spawnSync('node', [CLI, dir], { encoding: 'utf8' }).status, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'a.md'), 'utf8'), note(good, PROSE), 'a clean note is not rewritten');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: a vault dir that does not exist is an error (a typo must not read as "clean")', () => {
  const r = spawnSync('node', [CLI, '/nonexistent/vault/dir'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('wiring: the gate is in the build (prebuild), the release preflight and an npm script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.scripts['check-description-hashes'], /check-bundled-description-hashes\.mjs/);
  assert.match(pkg.scripts.prebuild, /check-description-hashes/);
  const release = fs.readFileSync(path.join(__dirname, 'release.sh'), 'utf8');
  assert.match(release, /check-bundled-description-hashes\.mjs/);
});
