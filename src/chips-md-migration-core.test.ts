// Pure-core tests for chips-md-migration. Runs under `node --test` —
// no obsidian shim needed because chips-md-migration-core has no
// obsidian imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChipsMd,
  chooseBackupName,
  DEFAULT_BACKUP_NAME,
} from './chips-md-migration-core.ts';

// --- classifyChipsMd ---

test('classifyChipsMd: null body → absent', () => {
  assert.deepEqual(classifyChipsMd(null), { kind: 'absent' });
});

test('classifyChipsMd: v1 shape (no schema_version, has chips: block) → v1 with default backup name', () => {
  const body = [
    '---',
    'type: data',
    'content_type: yaml',
    '---',
    '',
    '# Body',
    '',
    '```yaml',
    'chips:',
    '  - label: "Create water particles"',
    '    insertion: "Call [[create_water_particles]]."',
    '```',
  ].join('\n');
  assert.deepEqual(classifyChipsMd(body), {
    kind: 'v1',
    preservedAs: '_chips.md.bak.v1',
  });
});

test('classifyChipsMd: v2 shape (schema_version: 2 in frontmatter) → v2', () => {
  const body = [
    '---',
    'type: data',
    'content_type: yaml',
    'schema_version: 2',
    '---',
    '',
    '# Body',
    '',
    '```yaml',
    'overrides:',
    '  - target: foo',
    '    label: "Foo"',
    '```',
  ].join('\n');
  assert.deepEqual(classifyChipsMd(body), { kind: 'v2' });
});

test('classifyChipsMd: explicit schema_version: 1 → v1 (defensive)', () => {
  const body = [
    '---',
    'type: data',
    'schema_version: 1',
    '---',
    '',
    'chips: []',
  ].join('\n');
  assert.deepEqual(classifyChipsMd(body), {
    kind: 'v1',
    preservedAs: '_chips.md.bak.v1',
  });
});

test('classifyChipsMd: no frontmatter delimiter → unparseable', () => {
  assert.deepEqual(classifyChipsMd('not-valid-yaml-no-frontmatter'),
    { kind: 'unparseable' });
});

test('classifyChipsMd: opening --- but no closing --- → unparseable', () => {
  const body = '---\ntype: data\nschema_version: 2\nno-closing-delimiter\n';
  assert.deepEqual(classifyChipsMd(body), { kind: 'unparseable' });
});

test('classifyChipsMd: schema_version: "2" (quoted) → v2', () => {
  // YAML lets you quote scalars; the migration should accept both.
  const body = '---\ntype: data\nschema_version: "2"\n---\n\nbody';
  assert.deepEqual(classifyChipsMd(body), { kind: 'v2' });
});

test('classifyChipsMd: schema_version commented out → v1 (active line wins)', () => {
  // # schema_version: 2 is a comment, not active. Body has no real
  // schema_version → classified as v1.
  const body = '---\ntype: data\n# schema_version: 2\n---\n\nchips: []';
  assert.deepEqual(classifyChipsMd(body), {
    kind: 'v1',
    preservedAs: '_chips.md.bak.v1',
  });
});

test('classifyChipsMd: idempotent (same body twice → equal result)', () => {
  const body = '---\nschema_version: 2\n---\n\nbody';
  const a = classifyChipsMd(body);
  const b = classifyChipsMd(body);
  assert.deepEqual(a, b);
});

// --- chooseBackupName ---

test('chooseBackupName: empty set → default name', () => {
  assert.equal(chooseBackupName(new Set()), '_chips.md.bak.v1');
});

test('chooseBackupName: default name taken → .2 suffix', () => {
  assert.equal(
    chooseBackupName(new Set(['_chips.md.bak.v1'])),
    '_chips.md.bak.v1.2',
  );
});

test('chooseBackupName: .2 also taken → .3 suffix', () => {
  assert.equal(
    chooseBackupName(new Set(['_chips.md.bak.v1', '_chips.md.bak.v1.2'])),
    '_chips.md.bak.v1.3',
  );
});

test('chooseBackupName: gap in suffix counter still picks lowest free (defensive)', () => {
  // Real-world collision rarely shapes like this (sequential adds),
  // but if a user manually renamed .v1.3 → .v1.5, we still pick .v1.2
  // because it's free. NOT skipping to .v1.6.
  assert.equal(
    chooseBackupName(new Set([
      '_chips.md.bak.v1',
      '_chips.md.bak.v1.5',
    ])),
    '_chips.md.bak.v1.2',
  );
});

test('chooseBackupName: unrelated files in set don\'t affect output', () => {
  assert.equal(
    chooseBackupName(new Set([
      'README.md',
      '_chips.md',
      'something_else.md',
    ])),
    '_chips.md.bak.v1',
  );
});

test('chooseBackupName: idempotent (same input → same output)', () => {
  const files = new Set(['_chips.md.bak.v1', '_chips.md.bak.v1.2']);
  assert.equal(
    chooseBackupName(files),
    chooseBackupName(files),
  );
});

test('DEFAULT_BACKUP_NAME constant exported and matches expectations', () => {
  assert.equal(DEFAULT_BACKUP_NAME, '_chips.md.bak.v1');
});
