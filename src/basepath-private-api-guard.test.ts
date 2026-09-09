// Drain 2026-09-09-0015 — no production file may read Obsidian's
// undocumented `adapter.basePath` property.
//
// `FileSystemAdapter` declares a PUBLIC `getBasePath(): string` method
// (confirmed against node_modules/obsidian/obsidian.d.ts, and against
// Obsidian's own shipped implementation — see below) that returns the
// identical value. `basePath` itself never appears in obsidian.d.ts at
// all; reading it required an `as any` (or an inline `{ basePath?:
// string }`) cast at every site. Drain 2355's private-API audit found
// 11 such sites via `as any`; this drain's own fresh grep found a
// 12th (moda-view.ts, via the narrower inline-type variant) that the
// audit's `as any`-scoped grep missed.
//
// BEHAVIORAL EQUIVALENCE, verified against the real shipped
// implementation, not just the type declaration: Obsidian's own
// compiled app bundle (obsidian.asar) contains
// `getBasePath=function(){return this.basePath}` verbatim — the
// public method is a direct passthrough to the same field this drain
// removed every direct read of. Not a behavior change, a private-API
// cleanup.
//
// This guard prevents the pattern from being reintroduced: any future
// `.basePath` read on the vault adapter must go through the public
// method instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The bare property-access substring. No other `.basePath` exists
// anywhere in Forge's own vocabulary (vaults, notes, snippets, facets)
// — every historical site (both the `as any` cast and the narrower
// inline `{ basePath?: string }` variant) reduces to this same
// literal text; a regex trying to also match the surrounding cast
// shape would need to special-case both, and would still miss a third
// shape nobody's written yet. The property name itself is the
// invariant.
const FORBIDDEN = '.basePath';

test('no production file reads the private adapter.basePath property', () => {
  const srcDir = path.join(process.cwd(), 'src');
  const offenders: string[] = [];
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    const src = fs.readFileSync(path.join(srcDir, name), 'utf8');
    const hits = src.split(FORBIDDEN).length - 1;
    if (hits > 0) offenders.push(`${name} (${hits})`);
  }
  assert.deepEqual(
    offenders,
    [],
    `adapter.basePath read(s) found in: ${offenders.join(', ')}; `
      + 'use adapter.getBasePath() (public FileSystemAdapter method, '
      + 'identical return value — Obsidian\'s own shipped '
      + '`getBasePath=function(){return this.basePath}` confirms it) '
      + 'instead.',
  );
});

test('non-vacuity: the guard fires on every historical shape this drain removed', () => {
  const asAnyShape = 'const vaultPath = (this.app.vault.adapter as any).basePath as string;';
  assert.ok(asAnyShape.includes(FORBIDDEN));
  const inlineTypeShape = '(this.app.vault.adapter as { basePath?: string }).basePath';
  assert.ok(inlineTypeShape.includes(FORBIDDEN));
});

test('non-vacuity: the guard does not false-positive on the public replacement', () => {
  const sample = '(this.app.vault.adapter as FileSystemAdapter).getBasePath()';
  assert.ok(!sample.includes(FORBIDDEN));
});
