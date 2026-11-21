// 2026-11-20-1005 (F6) - `Platform browser has already been set. Overwriting the platform with [object Object].` at every start: tfjs-core (2.8.6, pulled in by html-midi-player / @magenta/music) registers a 'browser' platform when IS_BROWSER and a
// 'node' platform when IS_NODE; Obsidian's renderer has BOTH, so the second registration warns. ONE copy of tfjs-core is in the bundle (checked), the warning is harmless (the node platform wins; the MIDI player does not use tfjs models), and
// the one message is swallowed while the library loads (nothing else: every other warning passes through). Written RED first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { swallowTfPlatformWarning } from './tf-platform-warning-core.ts';

const MSG = 'Platform browser has already been set. Overwriting the platform with [object Object].';
const fakeConsole = () => { const seen: unknown[][] = []; const c = { warn: (...a: unknown[]) => { seen.push(a); } }; return { c, seen }; };

test('during the load the platform warning is swallowed and every other warning passes through; afterwards console.warn is the original again', async () => {
  const { c, seen } = fakeConsole(); const original = c.warn;
  const out = await swallowTfPlatformWarning(async () => { c.warn(MSG); c.warn('something else'); c.warn(MSG, { extra: 1 }); c.warn('Platform node has already been set. Overwriting the platform with [object Object].'); return 'loaded'; }, c);
  assert.equal(out, 'loaded'); assert.deepEqual(seen, [['something else'], ['Platform node has already been set. Overwriting the platform with [object Object].']].map((x) => x)); assert.equal(c.warn, original);
  c.warn(MSG); assert.equal(seen.length, 3, 'outside the load the message is NOT swallowed');
});

test('it restores console.warn when the load throws, returns the load\'s value, and nests: two loads at once leave the ORIGINAL in place when the last one ends', async () => {
  const { c } = fakeConsole(); const original = c.warn;
  await assert.rejects(swallowTfPlatformWarning(async () => { throw new Error('import failed'); }, c), /import failed/); assert.equal(c.warn, original);
  let release!: () => void; const gate = new Promise<void>((res) => { release = res; });
  const a = swallowTfPlatformWarning(async () => { await gate; return 1; }, c); const b = swallowTfPlatformWarning(async () => 2, c);
  assert.equal(await b, 2); assert.notEqual(c.warn, original, 'the first load is still running: the filter is still on'); release(); assert.equal(await a, 1); assert.equal(c.warn, original);
});

test('MECHANISM PIN: both dynamic imports of the MIDI player libraries in music-edition.full.ts go through swallowTfPlatformWarning', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, 'music-edition.full.ts'), 'utf8');
  const imports = [...src.matchAll(/await import\('(html-midi-player|@magenta\/music[^']*)'\)/g)];
  assert.ok(imports.length >= 2, `found ${imports.length}`);
  for (const m of imports) { const before = src.slice(Math.max(0, m.index! - 120), m.index!); assert.match(before, /swallowTfPlatformWarning\(/, `the import of ${m[1]} is wrapped`); }
});

test('overlapping loads that end in the WRONG order: the filter stays on until the LAST one ends, and the original is restored exactly once', async () => {
  const { c, seen } = fakeConsole(); const original = c.warn;
  let releaseA!: () => void, releaseB!: () => void; const ga = new Promise<void>((r) => { releaseA = r; }), gb = new Promise<void>((r) => { releaseB = r; });
  const a = swallowTfPlatformWarning(async () => { await ga; }, c); const b = swallowTfPlatformWarning(async () => { await gb; }, c);
  releaseA(); await a; c.warn(MSG); assert.equal(seen.length, 0, 'b is still loading: the message is still swallowed'); assert.notEqual(c.warn, original);
  releaseB(); await b; assert.equal(c.warn, original); c.warn(MSG); assert.equal(seen.length, 1);
});
