// New Forge note (beat_as_data Phase 0.5, drain 2026-10-04-1200). New-feature discipline: coverage of every
// observable behavior, plus can-fail proof (see the FEEDBACK for the mutants run against these).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FALLBACK_CONTENT_TYPES,
  TEXT_CONTENT_TYPES,
  checkNewNotePath,
  dataTemplate,
  describeNewNoteLocation,
  isBinaryContentType,
  newNoteFolder,
  newNotePath,
} from './new-note-core.ts';
import { actionTemplate } from './modal-templates-core.ts';
import { EDITION_VAULT_NAMES } from './edition-core.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LEAN_MANAGED: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.lean);
const MUSIC_MANAGED: ReadonlySet<string> = new Set(EDITION_VAULT_NAMES.music);

/** Frontmatter keys of a note, in order. */
function frontmatterKeys(note: string): string[] {
  const m = note.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, 'note has no frontmatter block');
  return m[1].split('\n').map((l) => l.match(/^([A-Za-z_][\w-]*):/)?.[1]).filter((k): k is string => !!k);
}

// ---- content types ---------------------------------------------------------------------------------------

test('DRIFT GUARD: the dialog\'s text content types equal the engine\'s TEXT_CONTENT_TYPES (read from the bundled serialization.py)', () => {
  const src = read('assets/engine/forge/core/serialization.py');
  const m = src.match(/^TEXT_CONTENT_TYPES\s*=\s*\(([^)]*)\)/m);
  assert.ok(m, 'could not find TEXT_CONTENT_TYPES in the bundled engine');
  const engine = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
  assert.ok(engine.length > 0);
  assert.deepEqual([...TEXT_CONTENT_TYPES], engine);
});

test('offline fallback: every text type, json first (the default), plus the one pre-existing binary entry, no duplicates', () => {
  assert.equal(FALLBACK_CONTENT_TYPES[0], 'json');
  for (const t of TEXT_CONTENT_TYPES) assert.ok(FALLBACK_CONTENT_TYPES.includes(t), `fallback is missing ${t}`);
  assert.ok(FALLBACK_CONTENT_TYPES.includes('jpeg'));
  assert.equal(new Set(FALLBACK_CONTENT_TYPES).size, FALLBACK_CONTENT_TYPES.length);
  // The two types the old fallback silently lacked:
  assert.ok(FALLBACK_CONTENT_TYPES.includes('yaml'));
  assert.ok(FALLBACK_CONTENT_TYPES.includes('musicxml'));
});

test('binary detection is unchanged (the binary path is out of scope and untouched)', () => {
  for (const b of ['image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'video/mp4', 'jpeg']) {
    assert.equal(isBinaryContentType(b), true, b);
  }
  for (const t of TEXT_CONTENT_TYPES) assert.equal(isBinaryContentType(t), false, t);
});

// ---- Data Note content -----------------------------------------------------------------------------------

test('Data Note: json -> exact frontmatter + empty-object body', () => {
  assert.equal(
    dataTemplate('beat', 'json'),
    ['---', 'type: data', 'content_type: json', 'description: beat', '---', '', '```json', '{}', '```', ''].join('\n'),
  );
});

test('Data Note: markdown -> same frontmatter shape, empty body', () => {
  assert.equal(
    dataTemplate('glossary', 'markdown'),
    ['---', 'type: data', 'content_type: markdown', 'description: glossary', '---', '', '```markdown', '', '```', ''].join('\n'),
  );
});

test('Data Note: yaml and musicxml get their own fence language and an empty body', () => {
  const y = dataTemplate('cfg', 'yaml');
  assert.match(y, /content_type: yaml\n/);
  assert.match(y, /\n```yaml\n\n```\n$/);
  const x = dataTemplate('score', 'musicxml');
  assert.match(x, /content_type: musicxml\n/);
  assert.match(x, /\n```xml\n\n```\n$/);
});

test('Data Note: svg keeps its instructive seed; text is empty; unknown types fall back to a text fence', () => {
  assert.match(dataTemplate('pic', 'svg'), /<svg xmlns=/);
  assert.match(dataTemplate('t', 'text'), /\n```text\n\n```\n$/);
  assert.match(dataTemplate('u', 'something-new'), /content_type: something-new\n[\s\S]*```text\n\n```/);
});

test('Data Note frontmatter carries ONLY type, content_type, description — nothing invented', () => {
  for (const ct of TEXT_CONTENT_TYPES) {
    assert.deepEqual(frontmatterKeys(dataTemplate('n', ct)), ['type', 'content_type', 'description'], ct);
  }
});

test('explicit content (the "Save as data snippet" path) replaces the seed inside the same block', () => {
  assert.match(dataTemplate('n', 'json', '{"a":1}'), /```json\n\{"a":1\}\n```/);
});

// ---- Action Note content ---------------------------------------------------------------------------------

test('Action Note uses the plugin\'s own scaffold (actionTemplate): type: action first, a Description heading, no content_type', async () => {
  const note = await actionTemplate('my_action');
  assert.match(note, /^---\ntype: action\n/);
  assert.match(note, /\n# Description\n/);
  const keys = frontmatterKeys(note);
  assert.ok(!keys.includes('content_type'), 'an action note must not carry content_type');
  // The dialog invents NOTHING on top of what actionTemplate emits: its output is the note, byte for byte
  // (see the source pin below). actionTemplate itself stamps the REAL facet hashes at creation (drain
  // 2026-08-03-1610) — SHA-256 of the actual facet text, not placeholders — and is covered by modal.test.ts.
  for (const k of keys) assert.match(k, /^(type|description|source_facet|[a-z_]+_hash|[a-z_]+_derived_from_[a-z_]+)$/, `unexpected key ${k}`);
});

test('the dialog builds notes through those two functions and nothing else (no hand-built template in modal.ts)', () => {
  const modal = read('src/modal.ts');
  assert.match(modal, /await actionTemplate\(this\.snippetName\)/);
  assert.match(modal, /dataTemplate\(this\.snippetName, this\.contentType\)/);
});

// ---- placement -------------------------------------------------------------------------------------------

test('placement: the active file\'s parent folder', () => {
  assert.equal(newNoteFolder('rhythm_data/a.md'), 'rhythm_data');
  assert.equal(newNoteFolder('notes/deep/er/x.md'), 'notes/deep/er');
  assert.equal(newNotePath('rhythm_data/a.md', 'beat'), 'rhythm_data/beat.md');
  assert.equal(newNotePath('notes/deep/er/x.md', 'beat'), 'notes/deep/er/beat.md');
});

test('placement: vault root when nothing is open, or the open file is at the root', () => {
  assert.equal(newNoteFolder(null), '');
  assert.equal(newNoteFolder(undefined), '');
  assert.equal(newNoteFolder(''), '');
  assert.equal(newNoteFolder('top.md'), '');
  assert.equal(newNotePath(null, 'beat'), 'beat.md');
  assert.equal(newNotePath('top.md', 'beat'), 'beat.md');
});

test('placement: never inside a plugin-managed bundled library folder (it would be shadowed or overwritten) — both editions', () => {
  for (const [label, managed] of [['lean', LEAN_MANAGED], ['music', MUSIC_MANAGED]] as const) {
    assert.equal(newNoteFolder('forge-moda/sim/x.md', managed), '', `${label}: forge-moda`);
    assert.equal(newNoteFolder('forge-tutorial/01-hello/Hello.md', managed), '', `${label}: forge-tutorial`);
    assert.equal(newNotePath('forge-moda/sim/x.md', 'mine', managed), 'mine.md', label);
  }
  // music libraries are managed ONLY in the music edition; lean has no such bundle, so a folder of that name is the user's
  assert.equal(newNoteFolder('music-theory/a.md', MUSIC_MANAGED), '');
  assert.equal(newNoteFolder('music-theory/a.md', LEAN_MANAGED), 'music-theory');
  // a user folder that merely CONTAINS a managed name deeper down is not managed
  assert.equal(newNoteFolder('mine/forge-moda/x.md', MUSIC_MANAGED), 'mine/forge-moda');
});

test('location text names the folder, or the vault root', () => {
  assert.equal(describeNewNoteLocation(''), 'Creates in: vault root');
  assert.equal(describeNewNoteLocation('rhythm_data'), 'Creates in: rhythm_data/');
});

// ---- collisions ------------------------------------------------------------------------------------------

test('collision: an existing note at the exact path is an error that names the note and the path', () => {
  const r = checkNewNotePath('rhythm_data/beat.md', 'beat', (p) => p === 'rhythm_data/beat.md');
  assert.equal(r.ok, false);
  if (r.ok === false) {
    assert.match(r.message, /"beat"/);
    assert.match(r.message, /rhythm_data\/beat\.md/);
    assert.match(r.message, /Choose a different name/);
  }
});

test('collision is path-scoped: the same name in a different folder is fine', () => {
  const taken = new Set(['a/beat.md']);
  assert.deepEqual(checkNewNotePath('b/beat.md', 'beat', (p) => taken.has(p)), { ok: true });
});

test('collision check asks about the EXACT path once, and has no side effects (never overwrites)', () => {
  const asked: string[] = [];
  checkNewNotePath('x/y.md', 'y', (p) => { asked.push(p); return false; });
  assert.deepEqual(asked, ['x/y.md']);
});

// ---- load-bearing user-facing strings (pinned, per L43 condition 4) ------------------------------------------

test('command: Forge Actions palette entry "New Forge note" is registered, calls the existing dialog, and has no ribbon icon', () => {
  const main = read('src/main.ts');
  const m = main.match(/id:\s*'forge-new-note',\s*name:\s*'([^']+)',\s*callback:\s*\(\)\s*=>\s*\{\s*void this\.createNewSnippet\(\);\s*\}/);
  assert.ok(m, 'forge-new-note is not registered with a createNewSnippet() callback');
  assert.equal(m[1], 'New Forge note');
  assert.ok(!/addRibbonIcon\([^)]*New (Forge )?(note|Snippet)/i.test(main),
    'a New-note ribbon icon was added — the menu cleanup (84ee2f9) made the Forge package icon the single ribbon entry');
});

test('dialog + toolbar copy is content-type-agnostic: "New Forge note", "Note name", "Note type"', () => {
  const modal = read('src/modal.ts');
  assert.match(modal, /createEl\('h2', \{ text: 'New Forge note' \}\)/);
  assert.match(modal, /\.setName\('Note name'\)/);
  assert.match(modal, /\.setName\('Note type'\)/);
  assert.ok(!/text: 'New action note'/.test(modal), 'the old action-specific title is back');
  assert.match(read('src/main.ts'), /view\.addAction\('file-plus', 'New Forge note'/);
});

test('the dialog places notes via newNotePath and checks collisions via checkNewNotePath (no ad-hoc path literal for the text path)', () => {
  const modal = read('src/modal.ts');
  assert.match(modal, /const path = newNotePath\(/);
  assert.match(modal, /checkNewNotePath\(/);
});
