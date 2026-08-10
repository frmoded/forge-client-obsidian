// Pure-core tests for snippet-id-from-path.ts. The v0.2.26 fix that
// derives qualified snippet IDs from file paths inside library-vault
// subdirs (e.g. `forge-music/blues/song.md` → `forge-music/blues/song`)
// so the engine's resolver hits the `/`-branch and finds the snippet
// via `get_in_vault`. Pre-v0.2.26 the plugin used `view.file.basename`
// which produced bare `song` — invisible to the registry whose blues
// snippets are indexed under `blues/<name>`.
//
// Test 7 ("integration shape assertion") reads main.ts at test-start
// and confirms the production wire-up uses snippetIdFromPath — per
// cc-prompt-queue.md §80 drift protection.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { snippetIdFromPath } from './snippet-id-from-path.ts';

test('vault root .md returns basename', () => {
  assert.equal(
    snippetIdFromPath('song.md', new Set(['forge-music'])),
    'song',
  );
});

test('library subdir top-level returns qualified', () => {
  assert.equal(
    snippetIdFromPath('forge-music/form.md', new Set(['forge-music'])),
    'forge-music/form',
  );
});

test('library subdir nested returns qualified path', () => {
  // The prod case that motivated v0.2.26.
  assert.equal(
    snippetIdFromPath(
      'forge-music/blues/song.md', new Set(['forge-music']),
    ),
    'forge-music/blues/song',
  );
});

test('library subdir deeply nested returns qualified path', () => {
  // Arbitrary depth — registry's os.walk handles any nesting; helper
  // must too.
  assert.equal(
    snippetIdFromPath(
      'forge-music/blues/regional/delta.md', new Set(['forge-music']),
    ),
    'forge-music/blues/regional/delta',
  );
});

test('non-library subdir returns basename', () => {
  // Folders that aren't library vaults (no forge.toml inside) get
  // treated like vault root for snippet-ID purposes — legacy basename
  // behavior preserved.
  assert.equal(
    snippetIdFromPath('misc-folder/note.md', new Set(['forge-music'])),
    'note',
  );
});

test('multiple libraries — match the right one', () => {
  assert.equal(
    snippetIdFromPath(
      'forge-moda/setup.md', new Set(['forge-moda', 'forge-music']),
    ),
    'forge-moda/setup',
  );
  assert.equal(
    snippetIdFromPath(
      'forge-music/form.md', new Set(['forge-moda', 'forge-music']),
    ),
    'forge-music/form',
  );
});

test('no library set — every file uses basename', () => {
  // A vault with no library deps treats everything as authoring.
  assert.equal(
    snippetIdFromPath('song.md', new Set()),
    'song',
  );
  assert.equal(
    snippetIdFromPath('forge-music/blues/song.md', new Set()),
    'song',
  );
});

test('integration: main.ts runSnippet wires snippetIdFromPath', () => {
  // §80 drift protection. Read main.ts at test-start and assert the
  // production call site exists. If a future refactor silently moves
  // back to view.file.basename, this test fails before anything ships.
  const mainTs = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main.ts'),
    'utf-8',
  );

  // The runSnippet method's snippetId derivation. Match the production
  // pattern: `snippetIdFromPath(view.file.path, this.libraryDirNames())`.
  // Whitespace-tolerant; argument order strict.
  const pattern =
    /snippetIdFromPath\s*\(\s*view\.file\.path\s*,\s*this\.libraryDirNames\(\)\s*\)/;
  assert.match(
    mainTs,
    pattern,
    'main.ts runSnippet should derive snippetId via snippetIdFromPath' +
    '(view.file.path, this.libraryDirNames())',
  );

  // Belt-and-suspenders: confirm the import lands too.
  assert.match(
    mainTs,
    /import\s*\{\s*snippetIdFromPath\s*\}\s*from\s*['"]\.\/snippet-id-from-path(?:\.ts)?['"]/,
    'main.ts should import snippetIdFromPath from ./snippet-id-from-path',
  );
});

// --- Drain 2026-08-05-0810 — snippetId does NOT round-trip to a path ---
//
// `_llmGenerateRecipe` used to freshen Pyodide's MEMFS by looking up
// `${snippetId}.md`. For a note in a non-library subdirectory that
// lookup resolves to the vault ROOT and returns null, the
// `instanceof TFile` guard skips the sync silently, and the inventory
// is built from whatever MEMFS last held — which is how a Recipe
// reverts to an older version byte-for-byte.
//
// The call site now uses the active `TFile` directly. These tests pin
// WHY that was necessary, so nobody reintroduces the round trip on the
// reasonable-looking assumption that it works.

test('drain-1810: non-library subdir loses its directory — round trip breaks', () => {
  const libs = new Set(['music_theory']);
  const id = snippetIdFromPath('exercises/scale_quality_quiz.md', libs);
  assert.equal(id, 'scale_quality_quiz');
  // The reconstructed path is NOT the original. A vault lookup for it
  // finds nothing, which is the silent-skip this drain removed.
  assert.notEqual(`${id}.md`, 'exercises/scale_quality_quiz.md');
});

test('drain-1810: wizard\'s reverted note is exactly this case', () => {
  const libs = new Set(['forge-music']);
  const id = snippetIdFromPath(
    'theory_exercises/complete_this_scale_submit.md', libs);
  assert.equal(id, 'complete_this_scale_submit');
  assert.notEqual(
    `${id}.md`, 'theory_exercises/complete_this_scale_submit.md');
});

test('drain-1810: library-dir notes DO round trip — why it looked fine', () => {
  // Library-dir paths keep their full qualified form, so the old code
  // worked for every note anyone tested it on. (Example was
  // music_theory/scales/scale.md until drain 2026-08-09-2300 flattened
  // that vault; forge-moda is a real extracted library dir today.)
  const libs = new Set(['forge-moda']);
  const id = snippetIdFromPath('forge-moda/setup.md', libs);
  assert.equal(`${id}.md`, 'forge-moda/setup.md');
});

test('drain-1810: vault-root notes round trip too', () => {
  const id = snippetIdFromPath('welcome.md', new Set());
  assert.equal(`${id}.md`, 'welcome.md');
});
