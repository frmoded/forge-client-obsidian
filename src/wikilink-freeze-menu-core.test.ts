// Pure-core tests for wikilink-freeze-menu-core.ts.
//
// Decides whether the editor-menu handler should surface "Freeze edge"
// / "Unfreeze edge" items when the user right-clicks a wikilink inside
// a Forge snippet. Inputs: current file basename, wikilink target
// string, registry lookup. Output: showMenu + qualified caller/callee.
//
// v0.2.41 — bypasses the modal's bare-ID-typing UX surfaced by the
// URGENT 2026-06-03-0000 freeze bug. The wikilink target is what the
// user clicked; caller is inferred from the current file; both
// auto-qualify via the registry. Zero typing, zero modal.
//
// Pure-core extraction No. 12. Same `node --test` + `node:assert/strict`
// convention as forge-music-gate, copy-dir-core, forge-toml-stub,
// engine-bundle-drift, chips, closed-beta-ux, forge-action, freeze-
// edge, install-md-pin, compute-kwargs, bundled-vault-version.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideWikilinkFreezeMenu,
  findWikilinkAtCursor,
  type SnippetRegistryLike,
} from './wikilink-freeze-menu-core.ts';

/** Tiny fake registry that knows about a fixed set of qualified IDs.
 *  Mirrors the resolution-order semantics of the real
 *  SnippetRegistry.get_bare (snippet_registry.py:106) by returning
 *  the first match in declaration order. */
function makeRegistry(entries: Array<[string, string]>): SnippetRegistryLike {
  return {
    qualifyBareId(bareId: string): string | null {
      for (const [bare, qualified] of entries) {
        if (bare === bareId) return qualified;
      }
      return null;
    },
  };
}

test('decideWikilinkFreezeMenu: target is a known snippet → menu offered with qualified caller + callee', () => {
  const registry = makeRegistry([
    ['hello_random', 'authoring/hello_random'],
    ['random_name',  'authoring/random_name'],
  ]);
  const decision = decideWikilinkFreezeMenu('hello_random', 'random_name', registry);
  assert.deepEqual(decision, {
    showMenu: true,
    caller: 'authoring/hello_random',
    callee: 'authoring/random_name',
  });
});

test('decideWikilinkFreezeMenu: target is NOT a known snippet → menu suppressed', () => {
  // Caller resolves, callee does not — common case for plain-markdown
  // wikilinks to non-snippet notes.
  const registry = makeRegistry([
    ['hello_random', 'authoring/hello_random'],
    // random_name intentionally absent
  ]);
  const decision = decideWikilinkFreezeMenu('hello_random', 'random_name', registry);
  assert.equal(decision.showMenu, false);
});

test('decideWikilinkFreezeMenu: current file is NOT a snippet → menu suppressed', () => {
  // User opened a plain markdown note (not in the registry) and
  // right-clicked a wikilink in its body. No caller context exists,
  // so no edge to freeze.
  const registry = makeRegistry([
    ['random_name', 'authoring/random_name'],
    // hello_random (the would-be caller) intentionally absent
  ]);
  const decision = decideWikilinkFreezeMenu('plain_note', 'random_name', registry);
  assert.equal(decision.showMenu, false);
});

test('decideWikilinkFreezeMenu: target equals current file (self-reference) → menu suppressed', () => {
  // Defensive: freezing a self-edge is undefined. Even if both bare
  // names resolve to the same qualified ID, suppress the menu.
  const registry = makeRegistry([
    ['hello_random', 'authoring/hello_random'],
  ]);
  const decision = decideWikilinkFreezeMenu('hello_random', 'hello_random', registry);
  assert.equal(decision.showMenu, false);
});

// --- findWikilinkAtCursor ---

test('findWikilinkAtCursor: cursor inside `[[target]]` returns target', () => {
  const line = 'See [[random_name]] for details.';
  // Cursor on 'a' of 'random' (index 8 of the line).
  assert.equal(findWikilinkAtCursor(line, 8), 'random_name');
});

test('findWikilinkAtCursor: cursor outside any wikilink returns null', () => {
  const line = 'See [[random_name]] for details.';
  // Cursor at start of 'for' (index 20).
  assert.equal(findWikilinkAtCursor(line, 25), null);
});

test('findWikilinkAtCursor: piped wikilink `[[target|alias]]` returns target only', () => {
  const line = 'Call [[random_name|the random helper]] here.';
  assert.equal(findWikilinkAtCursor(line, 10), 'random_name');
});

test('findWikilinkAtCursor: heading anchor `[[target#heading]]` returns target only', () => {
  const line = 'See [[song#chorus]] for the chorus.';
  assert.equal(findWikilinkAtCursor(line, 7), 'song');
});

test('findWikilinkAtCursor: block anchor `[[target^block]]` returns target only', () => {
  const line = 'Ref [[song^abc]] block.';
  assert.equal(findWikilinkAtCursor(line, 7), 'song');
});

test('findWikilinkAtCursor: multiple wikilinks on one line picks the bracketing one', () => {
  const line = '[[caller]] calls [[callee]].';
  // Cursor on '[[callee]]' (index 18).
  assert.equal(findWikilinkAtCursor(line, 20), 'callee');
  // Cursor on '[[caller]]' (index 3).
  assert.equal(findWikilinkAtCursor(line, 3), 'caller');
});

test('findWikilinkAtCursor: empty wikilink `[[]]` returns null', () => {
  const line = 'broken [[]] here';
  assert.equal(findWikilinkAtCursor(line, 9), null);
});

test('decideWikilinkFreezeMenu: ambiguous bare match → first-match-wins per registry semantics', () => {
  // Design call: the helper delegates ambiguity to the registry's
  // resolution-order semantics (same as context.compute('bare_id')).
  // Whatever the registry's qualifyBareId returns IS the chosen
  // qualified ID; explicit ambiguity UI deferred to a future drain.
  //
  // Fake registry returns the first match (forge-music namespace
  // before authoring), simulating a resolution order where music
  // libraries are searched first.
  const registry = makeRegistry([
    ['random_name', 'forge-music/random_name'],  // resolution-order winner
    ['random_name', 'authoring/random_name'],    // second match — never seen
    ['hello_random', 'authoring/hello_random'],
  ]);
  const decision = decideWikilinkFreezeMenu('hello_random', 'random_name', registry);
  assert.deepEqual(decision, {
    showMenu: true,
    caller: 'authoring/hello_random',
    callee: 'forge-music/random_name',  // registry's first-match
  });
});


// --- v0.2.84 multi-match decision tests ----------------------------

import {
  decideWikilinkFreezeMenuMulti,
  type SnippetRegistryLikeMulti,
} from './wikilink-freeze-menu-core.ts';

function makeMultiRegistry(
  entries: Array<[string, string]>,
): SnippetRegistryLikeMulti {
  // qualifyBareId returns first match (same as single-match helper).
  // qualifyBareIdAll returns all matches in declaration order.
  return {
    qualifyBareId(bareId: string): string | null {
      for (const [bare, qualified] of entries) {
        if (bare === bareId) return qualified;
      }
      return null;
    },
    qualifyBareIdAll(bareId: string): string[] {
      const out: string[] = [];
      for (const [bare, qualified] of entries) {
        if (bare === bareId) out.push(qualified);
      }
      return out;
    },
  };
}

test('decideWikilinkFreezeMenuMulti: single match → showMenu with 1 callee', () => {
  const r = makeMultiRegistry([
    ['song', 'forge-music/song'],
    ['chorus', 'forge-music/blues/chorus'],
  ]);
  const decision = decideWikilinkFreezeMenuMulti('song', 'chorus', r);
  assert.deepEqual(decision, {
    showMenu: true,
    caller: 'forge-music/song',
    callees: ['forge-music/blues/chorus'],
  });
});

test('decideWikilinkFreezeMenuMulti: multi-match → showMenu with N callees', () => {
  const r = makeMultiRegistry([
    ['song', 'forge-music/song'],
    ['chorus', 'forge-music/blues/chorus'],
    ['chorus', 'forge-music/jazz/chorus'],
  ]);
  const decision = decideWikilinkFreezeMenuMulti('song', 'chorus', r);
  assert.deepEqual(decision, {
    showMenu: true,
    caller: 'forge-music/song',
    callees: ['forge-music/blues/chorus', 'forge-music/jazz/chorus'],
  });
});

test('decideWikilinkFreezeMenuMulti: caller unresolved → no menu', () => {
  const r = makeMultiRegistry([
    ['chorus', 'forge-music/blues/chorus'],
  ]);
  const decision = decideWikilinkFreezeMenuMulti('unknown', 'chorus', r);
  assert.equal(decision.showMenu, false);
});

test('decideWikilinkFreezeMenuMulti: no callee candidates → no menu', () => {
  const r = makeMultiRegistry([
    ['song', 'forge-music/song'],
    // 'chorus' intentionally absent
  ]);
  const decision = decideWikilinkFreezeMenuMulti('song', 'chorus', r);
  assert.equal(decision.showMenu, false);
});

test('decideWikilinkFreezeMenuMulti: candidate self-reference filtered out', () => {
  // `song` wikilinks itself (self-edge); the only candidate matches
  // the caller. Filtered → no menu.
  const r = makeMultiRegistry([
    ['song', 'forge-music/song'],
  ]);
  const decision = decideWikilinkFreezeMenuMulti('song', 'song', r);
  assert.equal(decision.showMenu, false);
});

test('decideWikilinkFreezeMenuMulti: mixed self-ref + valid → valid kept', () => {
  // 2 candidates; one is the caller (self-ref, drop), one is distinct.
  const r = makeMultiRegistry([
    ['song', 'forge-music/song'],
    ['song', 'forge-music/jazz/song'],  // distinct match
  ]);
  const decision = decideWikilinkFreezeMenuMulti('song', 'song', r);
  assert.deepEqual(decision, {
    showMenu: true,
    caller: 'forge-music/song',
    callees: ['forge-music/jazz/song'],
  });
});
