// Drain 2026-10-10-2100 (b) — the AUTOMATIC bundled-vault extraction, exercised against an in-memory adapter (a real copy, not a
// mock of the decision).
//
// Observed (CCQA, ClaudeQA, build 094f10a5b+dirty): the extracted `music-theory/` held 108 files vs 166 in the bundle and no
// `music_instruments/`; `.bundle-version` read `0.6.1` across many different builds. Two causes, both fixed:
//   1. the extractor read from `.obsidian/plugins/forge/assets/vaults` — the PRE-0.5.0 plugin id; the plugin is `forge-actions`
//      now, so it kept re-reading a stale folder (see bundled-vault-extraction-core.test.ts for the root derivation);
//   2. the trigger was the forge.toml VERSION only: a bundle with new files at the same version never reached an existing vault.
// The trigger is now version drift (unchanged: rolling backup + re-extract) OR a changed bundle CONTENT IDENTITY, and an identity
// change alone only ever ADDS MISSING FILES — it never overwrites or removes anything the user has.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXTRACTED_IDS_FILE,
  ensureBundledVaultCore,
  extractedIdsPath,
  parseExtractedIds,
  planAutoExtraction,
  serializeExtractedIds,
  type ExtractorAdapter,
} from './bundled-vault-extractor-core.ts';

// ---- in-memory adapter --------------------------------------------------------------------------------------------
class MemAdapter implements ExtractorAdapter {
  files = new Map<string, string>();
  writes: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(initial)) this.files.set(p, c);
  }
  private dirSet(): Set<string> {
    const d = new Set<string>();
    for (const p of this.files.keys()) {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) d.add(parts.slice(0, i).join('/'));
    }
    return d;
  }
  async exists(p: string) { return this.files.has(p) || this.dirSet().has(p); }
  async read(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return v;
  }
  async write(p: string, data: string) { this.writes.push(p); this.files.set(p, data); }
  async mkdir(_p: string) { /* directories are implied by file paths */ }
  async readBinary(p: string) {
    const v = await this.read(p);
    return new TextEncoder().encode(v).buffer as ArrayBuffer;
  }
  async writeBinary(p: string, data: ArrayBuffer) { this.writes.push(p); this.files.set(p, new TextDecoder().decode(data)); }
  async list(dir: string) {
    const base = dir === '/' ? '' : `${dir}/`;
    const files: string[] = [];
    const folders = new Set<string>();
    for (const p of this.files.keys()) {
      if (!p.startsWith(base)) continue;
      const rest = p.slice(base.length);
      const slash = rest.indexOf('/');
      if (slash === -1) files.push(p);
      else folders.add(base + rest.slice(0, slash));
    }
    return { files, folders: [...folders] };
  }
  async rename(a: string, b: string) {
    for (const p of [...this.files.keys()]) {
      if (p === a || p.startsWith(`${a}/`)) {
        this.files.set(b + p.slice(a.length), this.files.get(p)!);
        this.files.delete(p);
      }
    }
  }
  async rmdir(p: string, _recursive: boolean) {
    for (const k of [...this.files.keys()]) if (k === p || k.startsWith(`${p}/`)) this.files.delete(k);
  }
}

const SRC = '.obsidian/plugins/forge-actions/assets/vaults/music-theory';
const DST = 'music-theory';
const toml = (v: string) => `name = "music-theory"\nversion = "${v}"\n`;

function bundle(version = '0.11.28', extra: Record<string, string> = {}): Record<string, string> {
  return {
    [`${SRC}/forge.toml`]: toml(version),
    [`${SRC}/notes/a.md`]: 'bundled a',
    [`${SRC}/music_instruments/rhythm_box.md`]: 'bundled rhythm box',
    [`${SRC}/music_instruments/resources/html/rhythm_box.html`]: '<html>widget</html>',
    [`${SRC}/rhythm_data/rhythm_pattern_straight_rock.md`]: 'bundled straight rock',
    ...extra,
  };
}
const run = (a: MemAdapter, o: { bundleId: string; recordedId: string | null }) =>
  ensureBundledVaultCore(a, { sourceDir: SRC, targetDir: DST, label: 'music-theory', ...o });

test('first install: the whole bundle is copied, identity is recorded', async () => {
  const a = new MemAdapter(bundle());
  const r = await run(a, { bundleId: 'id-2', recordedId: null });
  assert.equal(r.action, 'copy-all');
  assert.equal(r.record, true);
  assert.equal(a.files.get(`${DST}/music_instruments/resources/html/rhythm_box.html`), '<html>widget</html>');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'bundled a');
});

test('same version, NEW bundle identity: missing files are ADDED (the CCQA case: no music_instruments/, same 0.6.1-era version)', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.28'),
    [`${DST}/notes/a.md`]: 'bundled a',
  });
  const r = await run(a, { bundleId: 'id-2', recordedId: 'id-1' });
  assert.equal(r.action, 'add-missing');
  assert.equal(r.record, true);
  assert.deepEqual([...r.copied].sort(), [
    'music_instruments/resources/html/rhythm_box.html',
    'music_instruments/rhythm_box.md',
    'rhythm_data/rhythm_pattern_straight_rock.md',
  ]);
  assert.equal(a.files.get(`${DST}/music_instruments/rhythm_box.md`), 'bundled rhythm box');
});

test('same version, NEW identity: a locally EDITED file is not overwritten, a user-added file is not removed', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.28'),
    [`${DST}/notes/a.md`]: 'MY LOCAL EDIT',
    [`${DST}/my_own_note.md`]: 'mine',
  });
  const r = await run(a, { bundleId: 'id-2', recordedId: 'id-1' });
  assert.equal(r.action, 'add-missing');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'MY LOCAL EDIT', 'the edit survives, byte for byte');
  assert.equal(a.files.get(`${DST}/my_own_note.md`), 'mine', 'a user-added file is untouched');
  assert.ok(!a.writes.includes(`${DST}/notes/a.md`), 'the edited path is never even written');
  assert.ok(!a.writes.some((p) => p === `${DST}/forge.toml`), 'forge.toml is not rewritten either');
});

test('same version, SAME identity: no work at all — and a file the user deleted stays deleted', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.28'),
    // notes/a.md deliberately absent: the user deleted it
  });
  const before = a.writes.length;
  const r = await run(a, { bundleId: 'id-2', recordedId: 'id-2' });
  assert.equal(r.action, 'skip-same-identity');
  assert.equal(r.record, false);
  assert.equal(a.writes.length, before, 'zero writes');
  assert.equal(a.files.has(`${DST}/notes/a.md`), false, 'a deliberate deletion is respected until the bundle changes');
});

test('no recorded identity (an install from before this fix) behaves like a changed identity', async () => {
  const a = new MemAdapter({ ...bundle('0.11.28'), [`${DST}/forge.toml`]: toml('0.11.28') });
  const r = await run(a, { bundleId: 'id-2', recordedId: null });
  assert.equal(r.action, 'add-missing');
  assert.ok(r.copied.length > 0);
});

test('version DRIFT keeps today\'s protection: the outgoing tree moves to the ONE rolling backup, then the bundle is copied', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.18'),
    [`${DST}/notes/a.md`]: 'MY LOCAL EDIT',
  });
  const r = await run(a, { bundleId: 'id-2', recordedId: 'id-2' });
  assert.equal(r.action, 'backup-and-reextract');
  assert.equal(r.record, true);
  assert.equal(a.files.get(`${DST}.bak.previous/notes/a.md`), 'MY LOCAL EDIT', 'the edit is preserved in the backup');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'bundled a');
  assert.equal(a.files.get(`${DST}/forge.toml`), toml('0.11.28'));
});

test('add-missing never copies Forge-managed state or backup dirs out of the bundle', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28', {
      [`${SRC}/.forge/state.json`]: '{}',
      [`${SRC}/old.bak.previous/x.md`]: 'x',
      [`${SRC}/.obsidian/app.json`]: '{}',
    }),
    [`${DST}/forge.toml`]: toml('0.11.28'),
  });
  await run(a, { bundleId: 'id-2', recordedId: 'id-1' });
  assert.equal(a.files.has(`${DST}/.forge/state.json`), false);
  assert.equal(a.files.has(`${DST}/old.bak.previous/x.md`), false);
  assert.equal(a.files.has(`${DST}/.obsidian/app.json`), false);
});

test('safe skips: bundle source missing, bundled forge.toml unreadable, or an unparseable version — nothing written, nothing recorded', async () => {
  const none = new MemAdapter({});
  const r1 = await run(none, { bundleId: 'x', recordedId: null });
  assert.deepEqual([r1.action, r1.record], ['skip-no-source', false]);

  const noToml = new MemAdapter({ [`${SRC}/notes/a.md`]: 'a', [`${DST}/forge.toml`]: toml('1.0.0') });
  const r2 = await run(noToml, { bundleId: 'x', recordedId: null });
  assert.deepEqual([r2.action, r2.record], ['skip-no-bundled', false]);

  const bad = new MemAdapter({ ...bundle(), [`${DST}/forge.toml`]: 'name = "music-theory"\n' });
  const before = bad.writes.length;
  const r3 = await run(bad, { bundleId: 'x', recordedId: null });
  assert.deepEqual([r3.action, r3.record], ['skip-unparseable', false]);
  assert.equal(bad.writes.length, before);
});

// ---- the pure decision --------------------------------------------------------------------------------------------
test('planAutoExtraction: the decision table', () => {
  const base = { bundledFiles: ['a.md', 'b.md'], extractedFiles: ['a.md'] };
  assert.deepEqual(planAutoExtraction({ ...base, status: 'no-extracted', bundleId: 'n', recordedId: 'n' }), { action: 'copy-all', files: [] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'drift', bundleId: 'n', recordedId: 'n' }), { action: 'backup-and-reextract', files: [] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'match', bundleId: 'n', recordedId: 'n' }), { action: 'skip-same-identity', files: [] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'match', bundleId: 'n', recordedId: 'o' }), { action: 'add-missing', files: ['b.md'] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'match', bundleId: 'n', recordedId: null }), { action: 'add-missing', files: ['b.md'] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'no-bundled', bundleId: 'n', recordedId: null }), { action: 'skip-no-bundled', files: [] });
  assert.deepEqual(planAutoExtraction({ ...base, status: 'unparseable', bundleId: 'n', recordedId: null }), { action: 'skip-unparseable', files: [] });
});

test('planAutoExtraction: add-missing lists ONLY what is absent — a present file is never in the list, whatever its content', () => {
  const p = planAutoExtraction({
    status: 'match', bundleId: 'n', recordedId: 'o',
    bundledFiles: ['a.md', 'b.md', 'c/d.md'], extractedFiles: ['a.md', 'c/d.md', 'mine.md'],
  });
  assert.deepEqual(p, { action: 'add-missing', files: ['b.md'] });
});

// ---- the identity record ------------------------------------------------------------------------------------------
test('identity record: lives in the PLUGIN folder (never the user\'s vault), round-trips, and tolerates garbage', () => {
  assert.equal(extractedIdsPath('.obsidian/plugins/forge-actions'), `.obsidian/plugins/forge-actions/assets/${EXTRACTED_IDS_FILE}`);
  const m = { 'music-theory': 'abc', 'forge-moda': 'abc' };
  assert.deepEqual(parseExtractedIds(serializeExtractedIds(m)), m);
  for (const bad of [null, '', 'not json', '[]', '{"a":1}', 'null']) {
    const parsed = parseExtractedIds(bad);
    assert.equal(typeof parsed, 'object');
    assert.ok(Object.values(parsed).every((v) => typeof v === 'string'));
  }
  assert.deepEqual(parseExtractedIds('{"a":1,"b":"x"}'), { b: 'x' });
});

// ---- the glue (welcome.ts is Obsidian-coupled, so its wiring is pinned from source, comments stripped) ----------------------
import fs from 'node:fs';
import path from 'node:path';

test('welcome.ts: extraction passes the baked bundle id, the vault\'s RECORDED id and manifest, and records both only when a pass says to', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/welcome.ts'), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(src, /bundleId: BUNDLED_ASSETS_CONTENT_ID/);
  assert.match(src, /recordedId: recorded\[name\] \?\? null/);
  assert.match(src, /manifest: manifestsBefore\[name\] \?\? null/);
  assert.match(src, /if \(outcome\.record\) next\[name\] = BUNDLED_ASSETS_CONTENT_ID;/);
  assert.match(src, /if \(outcome\.manifest !== null\) manifests\[name\] = outcome\.manifest;/);
  assert.match(src, /const idsPath = extractedIdsPath\(pluginDir\)/);
  assert.match(src, /await adapter\.write\(idsPath, body\)/);
  assert.match(src, /sourceDir: `\$\{bundledVaultsRoot\(pluginDir\)\}\/\$\{name\}`/, 'the SOURCE is the folder Obsidian loaded the plugin from');
  // the manifest store is written back by BOTH the extraction pass and the sweep (a pass that forgets leaves the next one blind)
  assert.equal([...src.matchAll(/await writeManifestStore\(adapter, pluginDir, manifestsBefore, manifests\);/g)].length, 2);
  assert.match(src, /await writeManifestStore\(adapter, pluginDir, manifestsBefore, manifests\);\s*return summary;/);
});

test('welcome.ts: the launch sweep is manifest-based — no listing-diff trash, one Notice, the manifest written back', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/welcome.ts'), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/computeSweepTrashList/.test(src), 'the "not in the bundle = trash it" classification is gone from the runtime path');
  assert.match(src, /sweepBundleDroppedCore\(adapter as ExtractorAdapter, \{/);
  assert.match(src, /manifestsBefore\[lib\] \?\? null/);
  assert.match(src, /formatLibraryNotice\(\{ leftEdited: libraryPass\.leftEdited, keptEdited, removed \}\)/);
  assert.equal([...src.matchAll(/new Notice\(notice, 14000\)/g)].length, 1, 'exactly one Notice for the pass');
  assert.match(src, /if \(manifest === null\) \{[\s\S]*?return none;/, 'no manifest -> nothing is swept');
});

// ============================================================================================================================
// Drain 2026-10-11-0900 §2 + §3 — manifest-based sweep and per-file drift (the manifest: bundled-library-manifest-core.ts)
// ============================================================================================================================
import { hashBytes, type Manifest } from './bundled-library-manifest-core.ts';
import { sweepBundleDroppedCore } from './bundled-vault-extractor-core.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const hs = (s: string) => hashBytes(bytes(s));
const FILE_A = `${DST}/notes/a.md`;

function manifestOf(files: Record<string, string>): Manifest {
  return Object.fromEntries(Object.entries(files).map(([rel, c]) => [rel, hs(c)]));
}
const runM = (a: MemAdapter, o: { bundleId: string; recordedId: string | null; manifest: Manifest | null }) =>
  ensureBundledVaultCore(a, { sourceDir: SRC, targetDir: DST, label: 'music-theory', ...o });

test('manifest: a first install records the hash of every file it extracted', async () => {
  const a = new MemAdapter(bundle());
  const r = await runM(a, { bundleId: 'id-2', recordedId: null, manifest: null });
  assert.equal(r.action, 'copy-all');
  assert.deepEqual(r.manifest, manifestOf({
    'forge.toml': toml('0.11.28'),
    'notes/a.md': 'bundled a',
    'music_instruments/rhythm_box.md': 'bundled rhythm box',
    'music_instruments/resources/html/rhythm_box.html': '<html>widget</html>',
    'rhythm_data/rhythm_pattern_straight_rock.md': 'bundled straight rock',
  }));
});

test('per-file drift: an UNEDITED file updates in place, a new file is added, an EDITED file is untouched (new version written beside it)', async () => {
  const oldBundleFiles = { 'forge.toml': toml('0.11.18'), 'notes/a.md': 'old a', 'notes/b.md': 'old b' };
  const a = new MemAdapter({
    // the NEW bundle
    [`${SRC}/forge.toml`]: toml('0.11.28'),
    [`${SRC}/notes/a.md`]: 'new a',
    [`${SRC}/notes/b.md`]: 'new b',
    [`${SRC}/notes/c.md`]: 'brand new c',
    // the vault: a.md unedited (== manifest), b.md EDITED by the user, plus the user's own note
    [`${DST}/forge.toml`]: toml('0.11.18'),
    [`${DST}/notes/a.md`]: 'old a',
    [`${DST}/notes/b.md`]: 'MY EDIT of b',
    [`${DST}/rhythm_data/my_note.md`]: 'USER NOTE',
  });
  const r = await runM(a, { bundleId: 'id-2', recordedId: 'id-1', manifest: manifestOf(oldBundleFiles) });
  assert.equal(r.action, 'per-file-update');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'new a', 'unedited -> updated in place');
  assert.equal(a.files.get(`${DST}/notes/c.md`), 'brand new c', 'new file added');
  assert.equal(a.files.get(`${DST}/notes/b.md`), 'MY EDIT of b', 'edited file untouched');
  assert.equal(a.files.get(`${DST}/notes/b.md.bundled`), 'new b', 'the new bundle version is written beside it');
  assert.equal(a.files.get(`${DST}/rhythm_data/my_note.md`), 'USER NOTE', 'a user note is untouched');
  assert.equal(a.files.get(`${DST}/forge.toml`), toml('0.11.28'), 'forge.toml is itself an unedited bundle file: updated, so the version moves');
  assert.deepEqual(r.updated.sort(), ['forge.toml', 'notes/a.md']);
  assert.deepEqual(r.added, ['notes/c.md']);
  assert.deepEqual(r.leftEdited, ['notes/b.md']);
  assert.equal(r.record, true);
  // the manifest now describes the new state; the edited file is relinquished
  assert.equal(r.manifest!['notes/a.md'], hs('new a'));
  assert.equal(r.manifest!['notes/c.md'], hs('brand new c'));
  assert.equal('notes/b.md' in r.manifest!, false);
});

test('per-file drift keeps the one-generation rolling backup as a safety net (a COPY: the vault stays in place)', async () => {
  const a = new MemAdapter({
    [`${SRC}/forge.toml`]: toml('0.11.28'), [`${SRC}/notes/a.md`]: 'new a',
    [`${DST}/forge.toml`]: toml('0.11.18'), [`${DST}/notes/a.md`]: 'old a', [`${DST}/mine.md`]: 'USER',
  });
  await runM(a, { bundleId: 'id-2', recordedId: 'id-1', manifest: manifestOf({ 'forge.toml': toml('0.11.18'), 'notes/a.md': 'old a' }) });
  assert.equal(a.files.get(`${DST}.bak.previous/notes/a.md`), 'old a', 'the backup holds the PRE-update tree');
  assert.equal(a.files.get(`${DST}.bak.previous/mine.md`), 'USER');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'new a');
  assert.equal(a.files.get(`${DST}/mine.md`), 'USER');
});

test('per-file drift: a file the user DELETED stays deleted, and is remembered', async () => {
  const a = new MemAdapter({
    [`${SRC}/forge.toml`]: toml('0.11.28'), [`${SRC}/notes/a.md`]: 'new a', [`${SRC}/notes/gone.md`]: 'new gone',
    [`${DST}/forge.toml`]: toml('0.11.18'), [`${DST}/notes/a.md`]: 'old a',   // gone.md was extracted earlier, then deleted
  });
  const r = await runM(a, {
    bundleId: 'id-2', recordedId: 'id-1',
    manifest: manifestOf({ 'forge.toml': toml('0.11.18'), 'notes/a.md': 'old a', 'notes/gone.md': 'old gone' }),
  });
  assert.equal(a.files.has(`${DST}/notes/gone.md`), false);
  assert.equal(r.manifest!['notes/gone.md'], hs('old gone'), 'remembered, so a later bundle does not bring it back either');
});

test('per-file drift: a file dropped from the bundle is removed only if unedited; an edited one is kept (and reported)', async () => {
  const removed: string[] = [];
  const a = new MemAdapter({
    [`${SRC}/forge.toml`]: toml('0.11.28'), [`${SRC}/notes/stays.md`]: 's',
    [`${DST}/forge.toml`]: toml('0.11.18'), [`${DST}/notes/stays.md`]: 's',
    [`${DST}/notes/dropped.md`]: 'orig dropped', [`${DST}/notes/dropped_edited.md`]: 'MINE', [`${DST}/notes/user_only.md`]: 'USER',
  });
  const r = await ensureBundledVaultCore(a, {
    sourceDir: SRC, targetDir: DST, label: 'music-theory', bundleId: 'id-2', recordedId: 'id-1',
    manifest: manifestOf({ 'forge.toml': toml('0.11.18'), 'notes/stays.md': 's', 'notes/dropped.md': 'orig dropped', 'notes/dropped_edited.md': 'orig edited' }),
    trash: async (p) => { removed.push(p); await a.rmdir(p, false); },
  });
  assert.deepEqual(removed, [`${DST}/notes/dropped.md`]);
  assert.equal(a.files.get(`${DST}/notes/dropped_edited.md`), 'MINE');
  assert.equal(a.files.get(`${DST}/notes/user_only.md`), 'USER');
  assert.deepEqual(r.keptEdited, ['notes/dropped_edited.md']);
});

test('legacy (a vault extracted before manifests) on DRIFT keeps today\'s protection: rolling backup + re-extract, then a manifest is recorded', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.18'),
    [`${DST}/notes/a.md`]: 'MY LOCAL EDIT',
  });
  const r = await runM(a, { bundleId: 'id-2', recordedId: 'id-2', manifest: null });
  assert.equal(r.action, 'backup-and-reextract');
  assert.equal(a.files.get(`${DST}.bak.previous/notes/a.md`), 'MY LOCAL EDIT');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'bundled a');
  assert.equal(r.manifest!['notes/a.md'], hs('bundled a'));
});

test('same version, same identity, NO manifest yet: the vault is not written to; the manifest adopts only files byte-identical to the bundle', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28'),
    [`${DST}/forge.toml`]: toml('0.11.28'),
    [`${DST}/notes/a.md`]: 'bundled a',            // identical to the bundle: adoptable
    [`${DST}/music_instruments/rhythm_box.md`]: 'I EDITED THIS',   // differs: NOT adopted (never auto-touched either)
  });
  const before = a.writes.length;
  const r = await runM(a, { bundleId: 'id-2', recordedId: 'id-2', manifest: null });
  assert.equal(r.action, 'adopt-manifest');
  assert.equal(a.writes.length, before, 'not a single vault write');
  assert.equal(r.manifest!['notes/a.md'], hs('bundled a'));
  assert.equal(r.manifest!['forge.toml'], hs(toml('0.11.28')));
  assert.equal('music_instruments/rhythm_box.md' in r.manifest!, false);
  assert.equal(r.record, true);
});

test('add-missing with a manifest: a file the user deleted is NOT brought back; a genuinely new file is added; an edit is untouched', async () => {
  const a = new MemAdapter({
    ...bundle('0.11.28', { [`${SRC}/notes/new_in_bundle.md`]: 'fresh' }),
    [`${DST}/forge.toml`]: toml('0.11.28'),
    [`${DST}/notes/a.md`]: 'MY EDIT',
    // music_instruments/* were extracted before, then the user deleted them (they are in the manifest, not on disk)
  });
  const manifest = manifestOf({
    'notes/a.md': 'bundled a', 'music_instruments/rhythm_box.md': 'bundled rhythm box',
    'music_instruments/resources/html/rhythm_box.html': '<html>widget</html>',
    'rhythm_data/rhythm_pattern_straight_rock.md': 'bundled straight rock',
  });
  const r = await runM(a, { bundleId: 'id-3', recordedId: 'id-2', manifest });
  assert.equal(r.action, 'add-missing');
  assert.deepEqual(r.copied, ['notes/new_in_bundle.md']);
  assert.equal(a.files.has(`${DST}/music_instruments/rhythm_box.md`), false, 'a remembered deletion stays deleted');
  assert.equal(a.files.get(`${DST}/notes/a.md`), 'MY EDIT');
  assert.equal(r.manifest!['notes/new_in_bundle.md'], hs('fresh'));
});

// ---- the launch sweep, orchestrated (what welcome.ts wires to Obsidian's trash) ------------------------------------------------

test('SWEEP: a user note in rhythm_data/ survives two launches; only an unedited, manifest-listed, bundle-dropped file is trashed', async () => {
  const trashed: string[] = [];
  const a = new MemAdapter({
    [`${SRC}/forge.toml`]: toml('0.11.28'), [`${SRC}/notes/stays.md`]: 's',
    [`${DST}/notes/stays.md`]: 's',
    [`${DST}/notes/dropped.md`]: 'orig',
    [`${DST}/rhythm_data/my_pattern.md`]: 'MY OWN RHYTHM NOTE',
  });
  let manifest: Manifest = manifestOf({ 'notes/stays.md': 's', 'notes/dropped.md': 'orig' });
  const launch = async () => {
    const r = await sweepBundleDroppedCore(a, {
      sourceDir: SRC, targetDir: DST, manifest,
      trash: async (p) => { trashed.push(p); await a.rmdir(p, false); },
    });
    manifest = r.next;
    return r;
  };
  const first = await launch();
  const second = await launch();
  assert.deepEqual(first.removed, ['notes/dropped.md']);
  assert.deepEqual(second.removed, []);
  assert.deepEqual(trashed, [`${DST}/notes/dropped.md`]);
  assert.equal(a.files.get(`${DST}/rhythm_data/my_pattern.md`), 'MY OWN RHYTHM NOTE', 'survived both launches');
});

test('SWEEP: with NO manifest (a legacy vault) nothing is ever trashed', async () => {
  const a = new MemAdapter({
    [`${SRC}/forge.toml`]: toml('0.11.28'), [`${SRC}/notes/stays.md`]: 's',
    [`${DST}/notes/stays.md`]: 's', [`${DST}/notes/old_extracted.md`]: 'x', [`${DST}/mine.md`]: 'USER',
  });
  const r = await sweepBundleDroppedCore(a, { sourceDir: SRC, targetDir: DST, manifest: null, trash: async () => { throw new Error('must not trash'); } });
  assert.deepEqual(r.removed, []);
  assert.equal(r.next, null);
});

test('SWEEP: an unreadable/empty bundle listing trashes nothing', async () => {
  const a = new MemAdapter({ [`${DST}/notes/a.md`]: 'a' });
  const r = await sweepBundleDroppedCore(a, {
    sourceDir: SRC, targetDir: DST, manifest: manifestOf({ 'notes/a.md': 'a' }),
    trash: async () => { throw new Error('must not trash'); },
  });
  assert.deepEqual(r.removed, []);
});

// ---- the manual "Re-extract bundled library vault" command shares the rule (drain 2026-10-11-0900 §2) ---------------------------

test('main.ts: the manual re-extract trashes a bundle-dropped file only if the manifest lists it, and refreshes the manifest afterwards', () => {
  const main = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(main, /const libraryManifest = await readLibraryManifest\(this\.app, this\.manifest\.dir, vaultName\);/);
  assert.match(main, /if \(!libraryManifest \|\| !\(relPath in libraryManifest\)\) \{\s*notOurs\.push\(relPath\);\s*continue;\s*\}/);
  assert.match(main, /await recordLibraryManifestFromBundle\(this\.app, this\.manifest\.dir, vaultName\);/);
  // the order matters: trash decisions are made BEFORE the overlay, the manifest is refreshed AFTER it
  const overlay = main.indexOf('await copyBundledOverlay(adapter, bundledRoot, extractedRoot);');
  const refresh = main.indexOf('await recordLibraryManifestFromBundle(');
  const read = main.indexOf('await readLibraryManifest(');
  assert.ok(read > 0 && overlay > read && refresh > overlay);
});
