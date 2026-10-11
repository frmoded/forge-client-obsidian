// Drain 2026-10-11-0900 §2 + §3 — the extraction MANIFEST: for every file the plugin extracted into a user's vault, its relative path and
// content hash AS EXTRACTED. It turns "is this file mine to touch?" from a guess into a fact:
//   - the bundle-dropped sweep may remove a file only if it is in the manifest, absent from the new bundle, and byte-identical to its
//     recorded hash — so a user's own note (never in the manifest) survives every launch;
//   - a bundle drift updates a file in place only if it is still byte-identical to its recorded hash (unedited).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MANIFESTS_FILE, findDroppedCandidates, formatLibraryNotice, hashBytes, manifestsPath, parseManifests, planFileDrift, planManifestSweep, serializeManifests,
} from './bundled-library-manifest-core.ts';

const enc = (s: string) => new TextEncoder().encode(s);

// ---- hashing and the record -----------------------------------------------------------------------------------------------

test('hashBytes: deterministic, sensitive to a one-byte change and to length, and the same for equal bytes however they are held', () => {
  const a = hashBytes(enc('hello world'));
  assert.equal(hashBytes(enc('hello world')), a);
  assert.notEqual(hashBytes(enc('hello worle')), a);
  assert.notEqual(hashBytes(enc('hello world ')), a);
  assert.equal(hashBytes(enc('hello world').buffer.slice(0) as ArrayBuffer), a, 'an ArrayBuffer hashes like its Uint8Array');
  assert.match(a, /^\d+:[0-9a-f]{16}$/, 'length:hash');
});

test('manifest record: lives in the plugin folder, round-trips sorted, and tolerates garbage (no record = no ownership)', () => {
  assert.equal(manifestsPath('.obsidian/plugins/forge-actions/'), `.obsidian/plugins/forge-actions/assets/${MANIFESTS_FILE}`);
  const store = { 'music-theory': { 'b.md': '3:aa', 'a.md': '3:bb' }, 'forge-moda': { 'x.md': '1:cc' } };
  assert.deepEqual(parseManifests(serializeManifests(store)), store);
  assert.ok(serializeManifests(store).indexOf('"a.md"') < serializeManifests(store).indexOf('"b.md"'), 'sorted for stable diffs');
  for (const bad of [null, '', 'nope', '[]', 'null', '{"v":1}', '{"music-theory":[]}', '{"music-theory":{"a.md":3}}']) {
    const p = parseManifests(bad);
    assert.equal(typeof p, 'object');
    for (const m of Object.values(p)) for (const h of Object.values(m)) assert.equal(typeof h, 'string');
  }
  assert.deepEqual(parseManifests('{"music-theory":{"a.md":"1:aa","b.md":7}}'), { 'music-theory': { 'a.md': '1:aa' } });
});

// ---- the sweep (§2) -------------------------------------------------------------------------------------------------------

test('sweep: only a file that is in the manifest, absent from the bundle and unedited is removed', () => {
  const manifest = { 'gone.md': 'h1', 'kept.md': 'h2', 'edited_gone.md': 'h3', 'deleted_gone.md': 'h4' };
  const bundle = new Set(['kept.md']);
  assert.deepEqual(findDroppedCandidates(manifest, bundle).sort(), ['deleted_gone.md', 'edited_gone.md', 'gone.md']);
  const plan = planManifestSweep({
    manifest, bundleFiles: bundle,
    diskHashes: { 'gone.md': 'h1', 'edited_gone.md': 'CHANGED', 'deleted_gone.md': null },
  });
  assert.deepEqual(plan.remove, ['gone.md']);
  assert.deepEqual(plan.keptEdited, ['edited_gone.md']);
  assert.deepEqual(plan.next, { 'kept.md': 'h2' }, 'removed, relinquished-edited and already-deleted entries leave the manifest');
});

test('sweep: a user\'s own note is not in the manifest, so it is never removed, whatever the bundle holds', () => {
  const manifest = { 'rhythm_data/a.md': 'h1' };
  const bundle = new Set(['rhythm_data/a.md']);
  const plan = planManifestSweep({ manifest, bundleFiles: bundle, diskHashes: {} });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(findDroppedCandidates(manifest, bundle), [], 'the user note is not even a candidate (it is not listed anywhere)');
});

test('sweep: run it twice — the second pass is a no-op and the user note is still there', () => {
  let manifest: Record<string, string> = { 'old.md': 'h1', 'keep.md': 'h2' };
  const disk: Record<string, string | null> = { 'old.md': 'h1', 'keep.md': 'h2', 'rhythm_data/my_note.md': 'USER' };
  const bundle = new Set(['keep.md']);
  const pass = () => {
    const cands = findDroppedCandidates(manifest, bundle);
    const plan = planManifestSweep({ manifest, bundleFiles: bundle, diskHashes: Object.fromEntries(cands.map((c) => [c, disk[c] ?? null])) });
    for (const r of plan.remove) delete disk[r];
    manifest = plan.next;
    return plan;
  };
  const first = pass();
  assert.deepEqual(first.remove, ['old.md']);
  const second = pass();
  assert.deepEqual(second.remove, []);
  assert.deepEqual(second.keptEdited, []);
  assert.equal(disk['rhythm_data/my_note.md'], 'USER');
});

test('sweep: an empty bundle listing with a non-empty manifest is refused (a bad listing must not wipe a library)', () => {
  const plan = planManifestSweep({ manifest: { 'a.md': 'h' }, bundleFiles: new Set(), diskHashes: { 'a.md': 'h' } });
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.bailedEmptyBundle, true);
  assert.deepEqual(plan.next, { 'a.md': 'h' }, 'the manifest is left exactly as it was');
});

// ---- per-file drift (§3) --------------------------------------------------------------------------------------------------

test('drift: unedited files update in place, new files are added, edited files are left, user deletions are respected', () => {
  const plan = planFileDrift({
    manifest: { 'same.md': 'S0', 'stale.md': 'T0', 'edited.md': 'E0', 'deleted.md': 'D0' },
    bundleHashes: { 'same.md': 'S0', 'stale.md': 'T1', 'edited.md': 'E1', 'deleted.md': 'D1', 'new.md': 'N1' },
    diskHashes: { 'same.md': 'S0', 'stale.md': 'T0', 'edited.md': 'MINE', 'deleted.md': null, 'new.md': null },
  });
  assert.deepEqual(plan.update, ['stale.md']);
  assert.deepEqual(plan.add, ['new.md']);
  assert.deepEqual(plan.leftEdited, ['edited.md']);
  assert.deepEqual(plan.keptDeleted, ['deleted.md']);
  assert.equal(plan.next['stale.md'], 'T1');
  assert.equal(plan.next['new.md'], 'N1');
  assert.equal(plan.next['same.md'], 'S0');
  assert.equal('edited.md' in plan.next, false, 'an edited file is relinquished: bundle updates never touch it again');
  assert.equal(plan.next['deleted.md'], 'D0', 'a deliberate deletion is remembered so a later bundle does not bring it back');
});

test('drift: a file with no manifest entry that differs from the bundle is treated as the user\'s (never overwritten)', () => {
  const plan = planFileDrift({ manifest: {}, bundleHashes: { 'x.md': 'B' }, diskHashes: { 'x.md': 'UNKNOWN' } });
  assert.deepEqual(plan.update, []);
  assert.deepEqual(plan.leftEdited, ['x.md']);
});

test('drift: a file already equal to the bundle is adopted into the manifest with no write', () => {
  const plan = planFileDrift({ manifest: {}, bundleHashes: { 'x.md': 'B' }, diskHashes: { 'x.md': 'B' } });
  assert.deepEqual([plan.update, plan.add, plan.leftEdited], [[], [], []]);
  assert.equal(plan.next['x.md'], 'B');
});

test('drift: bundle-dropped files follow the sweep rules — unedited removed, edited kept, user notes untouched', () => {
  const plan = planFileDrift({
    manifest: { 'dropped.md': 'D', 'dropped_edited.md': 'E', 'stays.md': 'S' },
    bundleHashes: { 'stays.md': 'S' },
    diskHashes: { 'stays.md': 'S', 'dropped.md': 'D', 'dropped_edited.md': 'MINE', 'user_note.md': 'U' },
  });
  assert.deepEqual(plan.remove, ['dropped.md']);
  assert.deepEqual(plan.keptEdited, ['dropped_edited.md']);
  assert.equal(JSON.stringify(plan).includes('user_note.md'), false);
  assert.deepEqual(plan.next, { 'stays.md': 'S' });
});

// ---- the one Notice -------------------------------------------------------------------------------------------------------

test('notice: null when there is nothing to say; otherwise ONE message that lists edited-and-left and trashed files, never user notes', () => {
  assert.equal(formatLibraryNotice({ leftEdited: {}, keptEdited: {}, removed: {} }), null);
  assert.equal(formatLibraryNotice({ leftEdited: { 'music-theory': [] }, keptEdited: {}, removed: {} }), null);
  const n = formatLibraryNotice({
    leftEdited: { 'music-theory': ['a.md', 'b.md', 'c.md', 'd.md'] },
    keptEdited: { 'music-theory': ['old.md'] },
    removed: { 'forge-moda': ['dropped.md'] },
  })!;
  assert.match(n, /^Forge: library update — /);
  assert.match(n, /music-theory: 4 \(a\.md, b\.md, c\.md, \+1 more\)/);
  assert.match(n, /\.bundled/);
  assert.match(n, /forge-moda: 1 \(dropped\.md\)/);
  assert.match(n, /kept because you edited them/);
  assert.equal([...n.matchAll(/Forge: library update/g)].length, 1);
});
