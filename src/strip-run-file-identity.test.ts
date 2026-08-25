// TDD failing-test-first — drain 2026-08-25-1030 (P1).
//
// Driver, live on v0.2.369 with `shouldRebindStrip` verified in the
// published bundle: forging `hello_world` in his smoke vault, then
// clicking the panel's Run, still gives "No active note to run." plus
// the grey-out. Drain 0100 did not cover his path.
//
// It did not, because 0100 fixed the strip's BINDING and this is the
// strip's RUN. Two different mechanisms behind one symptom.
//
// The run callback is handed a snippetId and re-derives the file from
// it via `fileForSnippetId` — `<id>.md` from the vault root. But the id
// was produced by `snippetIdFromPath`, which for a note in a
// NON-LIBRARY subfolder (a folder with no forge.toml — any ordinary
// folder a cohort member makes) discards the path and keeps only the
// basename. So the round trip is not inverse, `fileForSnippetId`
// returns null, `fallbackFile` goes undefined, runSnippet re-queries a
// workspace whose active leaf is now the PANEL, and the run dies with
// exactly that notice.
//
// CCQA's check-2 passed because mood / factorial / simulation all live
// in library dirs, where the id stays fully qualified and the round
// trip happens to work.
//
// FOURTH instance of one class. The comment at the run callback
// already names three (v0.2.288 auto-forge, drain 1600's dropped
// facet, drain 1610's own re-query) and states the lesson — "use what
// you were handed". It then hands itself an id and re-derives a file.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { snippetIdFromPath } from './snippet-id-from-path.ts';
import { resolveStripRunFile } from './strip-run-file-core.ts';

/** Mirrors `fileForSnippetId`: `<id>.md` from the vault root, nothing
 *  else. Given the set of paths a vault actually holds, does the id
 *  resolve back? */
function fileForSnippetId(snippetId: string, vaultPaths: Set<string>): string | null {
  const p = `${snippetId}.md`;
  return vaultPaths.has(p) ? p : null;
}

const LIBRARY_DIRS = new Set(['forge-tutorial', 'forge-moda', 'music-theory']);

function roundTrips(notePath: string): boolean {
  const id = snippetIdFromPath(notePath, LIBRARY_DIRS);
  return fileForSnippetId(id, new Set([notePath])) === notePath;
}

test('library-subdir notes round-trip — this is why CCQA check-2 passed', () => {
  assert.equal(roundTrips('forge-tutorial/01-hello/hello_world.md'), true);
  assert.equal(roundTrips('forge-tutorial/03-functions/mood.md'), true);
  assert.equal(roundTrips('forge-moda/simulation.md'), true);
});

test('vault-root notes round-trip', () => {
  assert.equal(roundTrips('hello_world.md'), true);
  assert.equal(roundTrips('random_2.md'), true);
});

test('THE INCIDENT: a note in an ordinary subfolder does NOT round-trip', () => {
  // Any folder without a forge.toml — which is every folder a cohort
  // member makes for themselves.
  assert.equal(roundTrips('smoke/hello_world.md'), false);
  assert.equal(roundTrips('my notes/hello_world.md'), false);
  assert.equal(roundTrips('a/b/hello_world.md'), false);

  // And the id it produces is the bare basename, so the lookup goes to
  // the vault root and finds nothing — `fileForSnippetId` returns null,
  // the run callback passes `undefined` as fallbackFile, and runSnippet
  // falls through to "No active note to run."
  assert.equal(snippetIdFromPath('smoke/hello_world.md', LIBRARY_DIRS), 'hello_world');
  assert.equal(fileForSnippetId('hello_world', new Set(['smoke/hello_world.md'])), null);
});

test('THE FIX: the strip carries the bound file, so the id is never re-derived', () => {
  // `activeStripNote` already HAS the TFile when it binds. Keeping it
  // makes the lossy round trip irrelevant — which is the same lesson
  // the run callback's own comment states and then does not follow.
  const vault = new Set(['smoke/hello_world.md']);
  const byPath = (p: string) => (vault.has(p) ? { path: p } : null);
  const bound = { path: 'smoke/hello_world.md' };
  assert.equal(resolveStripRunFile('hello_world', bound, byPath)?.path, 'smoke/hello_world.md');
});

test('the fix falls back to id lookup when the binding is missing or stale', () => {
  const vault = new Set(['forge-tutorial/01-hello/hello_world.md']);
  const byPath = (p: string) => (vault.has(p) ? { path: p } : null);
  // No binding at all (first run after a reload).
  assert.equal(
    resolveStripRunFile('forge-tutorial/01-hello/hello_world', null, byPath)?.path,
    'forge-tutorial/01-hello/hello_world.md');
  // Binding for a DIFFERENT note than the strip is dispatching — trust
  // the id, not a stale pointer.
  assert.equal(
    resolveStripRunFile('forge-tutorial/01-hello/hello_world',
      { path: 'forge-tutorial/03-functions/mood.md' }, byPath)?.path,
    'forge-tutorial/01-hello/hello_world.md');
});

