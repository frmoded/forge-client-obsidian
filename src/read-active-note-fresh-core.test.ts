// v0.2.217 — Pure-core tests for readActiveNoteFresh.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

import { readActiveNoteFresh } from './read-active-note-fresh-core.ts';

describe('readActiveNoteFresh', () => {
  test('editor present + non-empty buffer → returns buffer', async () => {
    const view = {
      editor: { getValue: () => 'fresh editor content' },
      file: { path: 'foo.md' },
    };
    const vault = {
      async read() { return 'STALE disk content'; },
    };
    const out = await readActiveNoteFresh(view, vault);
    assert.equal(out, 'fresh editor content');
  });

  test('editor returns empty string → still uses editor (not disk)', async () => {
    // The user might have intentionally deleted all content. Falling
    // through to disk on empty would silently restore deleted text.
    const view = {
      editor: { getValue: () => '' },
      file: { path: 'foo.md' },
    };
    const vault = {
      async read() { return 'STALE disk content'; },
    };
    const out = await readActiveNoteFresh(view, vault);
    assert.equal(out, '');
  });

  test('editor missing (null) → falls back to vault.read', async () => {
    const view = {
      editor: null,
      file: { path: 'foo.md' },
    };
    const vault = {
      async read(f: { path: string }) {
        assert.equal(f.path, 'foo.md');
        return 'disk content';
      },
    };
    const out = await readActiveNoteFresh(view, vault);
    assert.equal(out, 'disk content');
  });

  test('editor missing (undefined) → falls back to vault.read', async () => {
    const view = { file: { path: 'foo.md' } };
    const vault = {
      async read() { return 'disk content'; },
    };
    const out = await readActiveNoteFresh(view, vault);
    assert.equal(out, 'disk content');
  });

  test('editor without getValue function → falls back to vault.read', async () => {
    // Defensive: view.editor exists but the duck-typed contract is
    // broken (e.g., a custom view subclass that exposes a different
    // editor shape). Don't crash; just use disk.
    const view = {
      editor: {} as any,
      file: { path: 'foo.md' },
    };
    const vault = {
      async read() { return 'disk fallback'; },
    };
    const out = await readActiveNoteFresh(view, vault);
    assert.equal(out, 'disk fallback');
  });

  test('no editor AND no file → throws clearly', async () => {
    const view = {} as any;
    const vault = { async read() { return ''; } };
    await assert.rejects(
      async () => await readActiveNoteFresh(view, vault),
      /cannot determine source/,
    );
  });

  test('Recipe edit race: editor buffer is what the user sees', async () => {
    // Reproduces the v0.2.215 driver smoke: user edits Recipe to
    // `[[print]] "Hello, world 3!".` and Forge-clicks IMMEDIATELY.
    // The editor buffer has the new Recipe; disk still has the old
    // Recipe because autosave hasn't fired. We must return the
    // editor buffer so the engine transpiles + runs the NEW Recipe
    // on the FIRST click — closing the "click twice" trap.
    const EDITED_RECIPE = `---
type: action
---

# Description

Print Hello, world 3!.

# Recipe

[[print]] "Hello, world 3!".
Return.
`;
    const STALE_DISK_RECIPE = `---
type: action
---

# Description

Print Hello, world 2!.

# Recipe

[[print]] "Hello, world 2!".
Return.
`;
    const view = {
      editor: { getValue: () => EDITED_RECIPE },
      file: { path: 'forge-tutorial/01-hello/hello_world.md' },
    };
    const vault = { async read() { return STALE_DISK_RECIPE; } };
    const out = await readActiveNoteFresh(view, vault);
    assert.match(out, /Hello, world 3!/);
    assert.doesNotMatch(out, /Hello, world 2!/);
  });
});
