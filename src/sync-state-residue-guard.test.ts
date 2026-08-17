// Drain 2026-08-17-0700 — sync_state retirement, Phase 3.
//
// `sync_state` is a DERIVED value as of Phase 2 (drain 2026-08-17-0100):
// every writer was removed from the plugin and forge-mcp reads it via
// `derive_sync_state` at read time. Phase 3 strips the leftover
// `sync_state:` frontmatter line from the bundled vault content.
//
// This guard keeps it stripped. A persisted `sync_state:` line in a
// shipped note is residue, and residue reads as truth to anyone looking
// at raw frontmatter (the wizard's readbacks, the driver, a git diff) —
// which is exactly how the field lied four different ways in the three
// days that motivated the retirement.
//
// TWO SURFACES, because a note ships through both and they can drift:
//   1. `assets/vaults/**/*.md`   — the on-disk bundle.
//   2. `BUNDLED_ASSETS` in `src/bundled-assets.generated.ts` — the
//      inlined copy compiled into main.js.
// (2) is regenerated from (1) by `npm run inline-assets`, so a stale
// regeneration shows up here as (1) clean and (2) dirty.
//
// NOT in scope: `engine/forge/core/sync_state.py`, the vendored
// derivation module. It is live code, keyed under a `.py` path, and
// this guard only ever inspects `.md` entries.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUNDLED_ASSETS } from './bundled-assets.generated.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULTS = path.join(ROOT, 'assets', 'vaults');

/** Every `.md` under `assets/vaults/`, as repo-relative paths. */
function bundledNotes(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) bundledNotes(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(path.relative(ROOT, full));
  }
  return acc;
}

/** The frontmatter line, anchored — a prose mention of the word in a
 *  note body is not residue and must not fail this guard. */
const RESIDUE = /^sync_state:/m;

test('no bundled note carries a persisted sync_state: line', () => {
  const notes = bundledNotes(VAULTS);

  // Guard the guard: an empty walk would pass vacuously, which is the
  // failure mode L32 names for set-difference sweeps.
  assert.ok(
    notes.length > 100,
    `expected the bundled-vault walk to find the shipped notes, found ${notes.length}`,
  );

  const offenders = notes.filter((rel) =>
    RESIDUE.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
  );

  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} bundled note(s) still carry sync_state:. ` +
      `Strip the line at SOURCE (~/projects/<vault>/), then ` +
      `\`npm run sync-bundled-vaults\`.`,
  );
});

test('no inlined note asset carries a persisted sync_state: line', () => {
  const noteKeys = Object.keys(BUNDLED_ASSETS).filter((k) => k.endsWith('.md'));

  assert.ok(
    noteKeys.length > 100,
    `expected inlined note assets, found ${noteKeys.length}`,
  );

  const offenders = noteKeys.filter((k) => RESIDUE.test(BUNDLED_ASSETS[k]));

  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} inlined note asset(s) still carry sync_state:. ` +
      `Re-run \`npm run inline-assets\` after stripping assets/vaults/.`,
  );
});
