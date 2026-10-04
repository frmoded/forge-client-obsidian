// Drain 2026-08-09-2300 — music-theory vault flatten guard.
//
// The nested `music_theory/` section was flattened into the vault root
// (note/, scales/, chord/, theory_exercises/, theory.md) and all
// assets consolidated into top-level resources/ (ADJ-1=c, ADJ-2=a,
// ADJ-3=a, locked 2026-08-09). These pins keep the bundled copy from
// regressing to the nested layout: a re-sync from a stale source
// checkout would silently reintroduce `music_theory/` paths that no
// shipped wikilink resolves anymore.

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE_ROOT = path.join(HERE, '..', 'assets', 'vaults', 'music-theory');

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

describe('bundled music-theory is flat (drain 2026-08-09-2300)', () => {
  test('no music_theory/ subdirectory in the bundled vault', () => {
    assert.ok(fs.existsSync(BUNDLE_ROOT), `bundle missing at ${BUNDLE_ROOT}`);
    const nested = path.join(BUNDLE_ROOT, 'music_theory');
    assert.ok(
      !fs.existsSync(nested),
      'bundled music-theory still contains a nested music_theory/ directory',
    );
  });

  test('zero music_theory/ string references in bundled .md files', () => {
    const offenders: string[] = [];
    for (const file of walkFiles(BUNDLE_ROOT)) {
      if (!file.endsWith('.md')) continue;
      const body = fs.readFileSync(file, 'utf-8');
      if (body.includes('music_theory/')) {
        offenders.push(path.relative(BUNDLE_ROOT, file));
      }
    }
    assert.deepEqual(
      offenders, [],
      `bundled .md files still reference music_theory/ paths`,
    );
  });
});
