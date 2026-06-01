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
    /import\s*\{\s*snippetIdFromPath\s*\}\s*from\s*['"]\.\/snippet-id-from-path['"]/,
    'main.ts should import snippetIdFromPath from ./snippet-id-from-path',
  );
});
