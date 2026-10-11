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

test('welcome.ts: extraction passes the baked bundle id and the vault\'s RECORDED id, and records the id only when a pass says to', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/welcome.ts'), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(src, /bundleId: BUNDLED_ASSETS_CONTENT_ID/);
  assert.match(src, /recordedId: recorded\[name\] \?\? null/);
  assert.match(src, /if \(outcome\.record\) next\[name\] = BUNDLED_ASSETS_CONTENT_ID;/);
  assert.match(src, /const idsPath = extractedIdsPath\(pluginDir\)/);
  assert.match(src, /await adapter\.write\(idsPath, body\)/);
  assert.match(src, /sourceDir: `\$\{bundledVaultsRoot\(pluginDir\)\}\/\$\{name\}`/, 'the SOURCE is the folder Obsidian loaded the plugin from');
});
