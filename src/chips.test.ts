// Pure-core tests for chips v2. Runs under `node --test` — no
// obsidian shim needed because chips-core.ts has no obsidian imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChipsBody,
  validateChipsList,
  mergeChipSources,
  insertChipText,
  chipSourcesFor,
  CHIPS_NO_ENGLISH_SECTION,
} from './chips-core.ts';

test('parseChipsBody: valid array → chips', () => {
  const r = parseChipsBody('[{"label":"a","insertion":"Call a."}]');
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('parseChipsBody: empty array → empty chips list', () => {
  const r = parseChipsBody('[]');
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, []);
});

test('parseChipsBody: malformed JSON → ChipsParseError', () => {
  const r = parseChipsBody('not json');
  assert.ok('error' in r);
});

test('parseChipsBody: non-array JSON → error', () => {
  const r = parseChipsBody('{"label":"a","insertion":"x"}');
  assert.ok('error' in r);
});

test('parseChipsBody: entry missing label dropped, others kept', () => {
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.' },
    { insertion: 'Call b.' },                   // missing label
    { label: 'c', insertion: 'Call c.' },
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [
    { label: 'a', insertion: 'Call a.' },
    { label: 'c', insertion: 'Call c.' },
  ]);
});

test('parseChipsBody: entry missing insertion dropped', () => {
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.' },
    { label: 'b' },                              // missing insertion
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('parseChipsBody: refs preserved, other unknown fields stripped', () => {
  // v2: `refs` is now a recognized optional field (preserved on the
  // chip for future graph-view linking). Other fields stay stripped.
  const r = parseChipsBody(JSON.stringify([
    { label: 'a', insertion: 'Call a.', refs: ['x'], future: 42 },
  ]));
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.', refs: ['x'] }]);
});

test('mergeChipSources: empty input → empty groups', () => {
  assert.deepEqual(mergeChipSources([]), []);
});

test('mergeChipSources: single source preserved', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
  assert.deepEqual(out, [
    { sourceName: 'foo', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
});

test('mergeChipSources: duplicate labels across sources kept separate', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [{ label: 'set ink mass', insertion: 'Call set_ink_mass.' }] },
    { sourceName: 'bar', chips: [{ label: 'set ink mass', insertion: 'Call other.' }] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].sourceName, 'foo');
  assert.equal(out[1].sourceName, 'bar');
});

test('mergeChipSources: empty-chip sources dropped', () => {
  const out = mergeChipSources([
    { sourceName: 'foo', chips: [] },
    { sourceName: 'bar', chips: [{ label: 'a', insertion: 'x' }] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceName, 'bar');
});

test('insertChipText: appends to # English section, body unchanged elsewhere', () => {
  const body = [
    '---', 'type: action', '---',
    '', '# English', '', 'Inputs: x', '', 'Call a.', '',
    '# Python', '', '```python\ndef compute(...): ...\n```', '',
  ].join('\n');
  const r = insertChipText(body, 'Call set_ink_mass.');
  assert.ok(r.ok);
  assert.match(r.body, /Call a\.\nCall set_ink_mass\.\n\n# Python/);
  // Python section content untouched.
  assert.ok(r.body.includes('def compute(...): ...'));
});

test('insertChipText: empty English section inserts directly after heading', () => {
  const body = '# English\n\n# Python\n';
  const r = insertChipText(body, 'Call X.');
  assert.ok(r.ok);
  assert.match(r.body, /^# English\nCall X\.\n\n# Python\n$/);
});

test('insertChipText: no # English → sentinel + body unchanged', () => {
  const body = 'just a regular note with no facets';
  const r = insertChipText(body, 'Call X.');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, CHIPS_NO_ENGLISH_SECTION);
  }
});

test('insertChipText: insertion lands in English even when Python is longer', () => {
  const body = [
    '# English', 'a', 'b',
    '# Python', 'lots', 'of', 'lines', 'here',
  ].join('\n');
  const r = insertChipText(body, 'NEW');
  assert.ok(r.ok);
  // Insertion sits between English content and Python heading.
  const idxIns = r.body.indexOf('NEW');
  const idxPy = r.body.indexOf('# Python');
  assert.ok(idxIns < idxPy && idxIns > r.body.indexOf('# English'));
});


// validateChipsList — exercises the pure validation directly on
// already-decoded JS values. chips.ts's YAML decode path calls this
// after parseYaml; these tests cover the shapes Tamar's _chips.md
// can take without needing a YAML parser in the test process.

test('validateChipsList: bare array (v1 shape) accepted', () => {
  const r = validateChipsList([
    { label: 'a', insertion: 'Call a.' },
  ]);
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('validateChipsList: {chips: [...]} wrapper unwrapped (v2 YAML shape)', () => {
  const r = validateChipsList({
    chips: [{ label: 'a', insertion: 'Call a.' }],
  });
  assert.ok('chips' in r);
  assert.deepEqual(r.chips, [{ label: 'a', insertion: 'Call a.' }]);
});

test('validateChipsList: group field preserved', () => {
  const r = validateChipsList([
    { label: 'a', insertion: 'Call a.', group: 'Setup' },
    { label: 'b', insertion: 'Call b.', group: 'Click' },
  ]);
  assert.ok('chips' in r);
  assert.equal(r.chips[0].group, 'Setup');
  assert.equal(r.chips[1].group, 'Click');
});

test('validateChipsList: refs preserved when present, dropped when malformed', () => {
  const r = validateChipsList([
    { label: 'a', insertion: 'Call a.', refs: ['x', 'y'] },
    { label: 'b', insertion: 'Call b.', refs: [123, 'z'] },     // non-strings stripped
    { label: 'c', insertion: 'Call c.', refs: 'not-an-array' }, // wrong shape dropped
    { label: 'd', insertion: 'Call d.' },                       // no refs OK
  ]);
  assert.ok('chips' in r);
  assert.deepEqual(r.chips[0].refs, ['x', 'y']);
  assert.deepEqual(r.chips[1].refs, ['z']);
  assert.equal(r.chips[2].refs, undefined);
  assert.equal(r.chips[3].refs, undefined);
});

test('validateChipsList: non-array non-wrapped object → error', () => {
  const r = validateChipsList({ label: 'a', insertion: 'x' });
  assert.ok('error' in r);
});

test('validateChipsList: empty group string ignored (treats as no-group)', () => {
  const r = validateChipsList([
    { label: 'a', insertion: 'Call a.', group: '' },
  ]);
  assert.ok('chips' in r);
  assert.equal(r.chips[0].group, undefined);
});

// --- chipSourcesFor (v0.2.47 — moved to pure-core, signature
// changed from `domains` to `libraryDirNames`) ---

test('chipSourcesFor: empty libraryDirNames → just the vault-root entry', () => {
  const out = chipSourcesFor('myvault', []);
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceName, 'myvault');
  assert.deepEqual(out[0].paths, ['_meta/_chips.md', '_chips.md']);
});

test('chipSourcesFor: includes forge-moda chips even when moda is NOT in declared domains (the v0.2.47 fix)', () => {
  // Bug surfaced in the v0.2.46 smoke: smoke vault has
  // `domains = ["music"]` and forge-moda unconditionally extracted.
  // Pre-v0.2.47 chipSourcesFor was driven by declared domains, so
  // forge-moda chips never loaded — leaving the chips view empty
  // even when the user was in forge-moda/simulation.md.
  // Post-fix: signature takes on-disk library subdirs (the
  // libraryDirNames set from main.ts), so forge-moda contributes
  // chips whenever its directory is present, regardless of
  // declared-domains content.
  const out = chipSourcesFor('myvault', ['forge-moda', 'forge-music']);
  const moda = out.find(s => s.sourceName === 'forge-moda');
  assert.ok(moda, 'forge-moda source should be present');
  assert.deepEqual(
    moda.paths,
    ['forge-moda/_meta/_chips.md', 'forge-moda/_chips.md'],
  );
});

test('chipSourcesFor: vault-root entry precedes library entries (declaration-order matters for mergeChipSources)', () => {
  const out = chipSourcesFor('myvault', ['forge-music', 'forge-moda']);
  assert.equal(out[0].sourceName, 'myvault', 'vault-root must come first');
  assert.equal(out[1].sourceName, 'forge-music');
  assert.equal(out[2].sourceName, 'forge-moda');
});

test('chipSourcesFor: libraryDirNames preserved verbatim (no forge- prefix re-added)', () => {
  // Defensive: the helper consumes literal directory names with
  // their forge- prefix already present (per ChipsManifest
  // docstring). Don't accidentally double-prefix to
  // `forge-forge-moda/...`.
  const out = chipSourcesFor('myvault', ['forge-moda']);
  const moda = out.find(s => s.sourceName === 'forge-moda');
  assert.ok(moda);
  for (const p of moda.paths) {
    assert.ok(p.startsWith('forge-moda/'), `unexpected path prefix: ${p}`);
    assert.ok(!p.startsWith('forge-forge-'), `double-prefix bug: ${p}`);
  }
});

test('chipSourcesFor: idempotent (same input → same output, no-op stays no-op)', () => {
  const input = ['forge-moda', 'forge-music'];
  const a = chipSourcesFor('v', input);
  const b = chipSourcesFor('v', input);
  assert.deepEqual(a, b);
});
