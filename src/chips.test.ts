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
  humanizeSnippetId,
  deriveChip,
  autoDeriveChips,
  parseChipsV2Config,
  mergeChipsWithOverrides,
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

// ===========================================================================
// Schema v2 — auto-discovery + signature-sourcing + overrides
// ===========================================================================

// --- humanizeSnippetId ---

test('humanizeSnippetId: snake_case basename → words with capitalized first letter', () => {
  assert.equal(humanizeSnippetId('create_water_particles'), 'Create water particles');
});

test('humanizeSnippetId: path-qualified id → last path segment only', () => {
  assert.equal(humanizeSnippetId('forge-music/blues/song'), 'Song');
});

test('humanizeSnippetId: already-capitalized single word stays sensible', () => {
  assert.equal(humanizeSnippetId('setup'), 'Setup');
});

test('humanizeSnippetId: empty input → empty string (defensive)', () => {
  assert.equal(humanizeSnippetId(''), '');
});

// --- deriveChip: action snippets ---

test('deriveChip: action snippet with inputs → B7.1-canonical insertion with <placeholders>', () => {
  const chip = deriveChip({
    id: 'greet', basename: 'greet', type: 'action',
    inputs: ['name'], parentDir: 'greetings',
  });
  assert.deepEqual(chip, {
    label: 'Greet',
    insertion: 'Do [[greet]](<name>).',
    group: 'greetings',
  });
});

test('deriveChip: action snippet with no inputs → empty parens', () => {
  const chip = deriveChip({
    id: 'banner', basename: 'banner', type: 'action', parentDir: 'common',
  });
  assert.deepEqual(chip, {
    label: 'Banner',
    insertion: 'Do [[banner]]().',
    group: 'common',
  });
});

test('deriveChip: action snippet with multiple inputs → comma-separated placeholders', () => {
  const chip = deriveChip({
    id: 'render', basename: 'render', type: 'action',
    inputs: ['x', 'y', 'color'],
  });
  assert.equal(chip?.insertion, 'Do [[render]](<x>, <y>, <color>).');
});

// v0.2.77 — canonical input-takers emit keyword form.
test('deriveChip: canonical action with inputs → keyword form insertion', () => {
  const chip = deriveChip({
    id: 'double', basename: 'double', type: 'action',
    inputs: ['n'], facet_form: 'canonical',
  });
  assert.equal(chip?.insertion, 'Do [[double]](n=<n>).');
});

test('deriveChip: canonical action with multiple inputs → keyword-form list', () => {
  const chip = deriveChip({
    id: 'add', basename: 'add', type: 'action',
    inputs: ['a', 'b'], facet_form: 'canonical',
  });
  assert.equal(chip?.insertion, 'Do [[add]](a=<a>, b=<b>).');
});

test('deriveChip: canonical action with NO inputs → empty parens (no kw=)', () => {
  // No declared inputs → empty parens like the legacy shape; the
  // keyword form only applies when there's something to bind.
  const chip = deriveChip({
    id: 'banner', basename: 'banner', type: 'action',
    facet_form: 'canonical',
  });
  assert.equal(chip?.insertion, 'Do [[banner]]().');
});

test('deriveChip: free-English action keeps positional form (regression)', () => {
  // No facet_form → free-English shape → positional placeholders.
  const chip = deriveChip({
    id: 'greet', basename: 'greet', type: 'action',
    inputs: ['name'],
  });
  assert.equal(chip?.insertion, 'Do [[greet]](<name>).');
});

test('deriveChip: facet_form="free" treated as non-canonical (positional)', () => {
  // Explicit free-English form behaves identically to undefined.
  const chip = deriveChip({
    id: 'greet', basename: 'greet', type: 'action',
    inputs: ['name'], facet_form: 'free',
  });
  assert.equal(chip?.insertion, 'Do [[greet]](<name>).');
});

test('deriveChip: action snippet with `chip: false` → null', () => {
  const chip = deriveChip({
    id: 'helper', basename: 'helper', type: 'action', chip: false,
  });
  assert.equal(chip, null);
});

test('deriveChip: basename starting with underscore → null (S7)', () => {
  const chip = deriveChip({
    id: '_meta/_chips', basename: '_chips', type: 'data',
  });
  assert.equal(chip, null);
});

// --- deriveChip: data + snapshot ---

test('deriveChip: data snippet → Set <name> to [[id]]() form', () => {
  const chip = deriveChip({
    id: 'water_color', basename: 'water_color', type: 'data',
    parentDir: 'palette',
  });
  assert.deepEqual(chip, {
    label: 'Water color',
    insertion: 'Set <name> to [[water_color]]().',
    group: 'palette',
  });
});

test('deriveChip: snapshot type → null (S6 — system-managed, never a chip)', () => {
  const chip = deriveChip({
    id: 'some_snapshot', basename: 'some_snapshot', type: 'snapshot',
  });
  assert.equal(chip, null);
});

test('deriveChip: unknown type → null', () => {
  const chip = deriveChip({
    id: 'mystery', basename: 'mystery', type: 'experimental',
  });
  assert.equal(chip, null);
});

test('deriveChip: missing parentDir → group `(library)` default', () => {
  const chip = deriveChip({
    id: 'top_level_snippet', basename: 'top_level_snippet', type: 'action',
  });
  assert.equal(chip?.group, '(library)');
});

// --- autoDeriveChips ---

test('autoDeriveChips: walks inventory, attaches target to each, drops null derivations', () => {
  const inventory = [
    { id: 'a', basename: 'a', type: 'action' as const, inputs: ['x'], parentDir: 'g' },
    { id: '_meta/_chips', basename: '_chips', type: 'data' as const, parentDir: 'meta' },
    { id: 'b', basename: 'b', type: 'data' as const, parentDir: 'g' },
    { id: 'opt_out', basename: 'opt_out', type: 'action' as const, chip: false },
  ];
  const out = autoDeriveChips(inventory);
  assert.equal(out.length, 2);
  assert.equal(out[0].target, 'a');
  assert.equal(out[1].target, 'b');
});

// --- parseChipsV2Config ---

test('parseChipsV2Config: schema_version: 2 + empty body → valid empty config', () => {
  const cfg = parseChipsV2Config({ schema_version: 2 });
  assert.deepEqual(cfg, { schema_version: 2 });
});

test('parseChipsV2Config: schema_version missing → error', () => {
  const result = parseChipsV2Config({ overrides: [] });
  assert.ok('error' in result);
});

test('parseChipsV2Config: schema_version 3 ACCEPTED (v3 spec adoption 2026-06-06)', () => {
  // v3 spec authorized 2026-06-06 — schema_version 2 OR 3 are valid;
  // 4+ remain rejected as the forward-compat hook.
  const result = parseChipsV2Config({ schema_version: 3 });
  assert.ok(!('error' in result));
  if (!('error' in result)) assert.equal(result.schema_version, 3);
});

test('parseChipsV2Config: schema_version 4+ → error (forward-compat hook)', () => {
  const result = parseChipsV2Config({ schema_version: 4 });
  assert.ok('error' in result);
});

test('parseChipsV2Config: schema_version: 3 + synthetic_chips[] → parsed and integrated', () => {
  // v3 file with synthetic_chips emits them through chips-core into
  // the config (lazy-loaded from synthetic-chips-core).
  const cfg = parseChipsV2Config({
    schema_version: 3,
    synthetic_chips: [
      { label: 'print', insertion: 'Do [[print]]("<msg>").', group: 'Builtins' },
    ],
  });
  assert.ok(!('error' in cfg));
  if (!('error' in cfg)) {
    assert.equal(cfg.synthetic_chips?.length, 1);
    assert.equal(cfg.synthetic_chips?.[0].label, 'print');
  }
});

test('parseChipsV2Config: overrides + groups + hide all preserved when well-formed', () => {
  const cfg = parseChipsV2Config({
    schema_version: 2,
    overrides: [
      { target: 'a', label: 'A label', group: 'G1', insertion: 'Do [[a]]().' },
    ],
    groups: [{ id: 'G1', order: 1, label: 'Group One' }],
    hide: ['debug'],
  });
  if ('error' in cfg) {
    assert.fail(`unexpected error: ${cfg.error}`);
  } else {
    assert.equal(cfg.overrides?.length, 1);
    assert.equal(cfg.groups?.length, 1);
    assert.deepEqual(cfg.hide, ['debug']);
  }
});

test('parseChipsV2Config: malformed overrides entry dropped silently', () => {
  const cfg = parseChipsV2Config({
    schema_version: 2,
    overrides: [
      { target: 'good', label: 'Good' },
      { label: 'No target!' },   // missing target — drop
      'not an object',           // wrong shape — drop
    ],
  });
  if ('error' in cfg) {
    assert.fail(`unexpected error: ${cfg.error}`);
  } else {
    assert.equal(cfg.overrides?.length, 1);
    assert.equal(cfg.overrides?.[0].target, 'good');
  }
});

// --- mergeChipsWithOverrides ---

test('mergeChipsWithOverrides: no config → groups by auto-derived `group` field', () => {
  const autoChips = [
    { target: 'a', label: 'Aaa', insertion: 'Do [[a]]().', group: 'G1' },
    { target: 'b', label: 'Bbb', insertion: 'Do [[b]]().', group: 'G2' },
    { target: 'c', label: 'Ccc', insertion: 'Do [[c]]().', group: 'G1' },
  ];
  const result = mergeChipsWithOverrides(autoChips, null);
  // G1 first (first appearance), then G2.
  assert.equal(result.length, 2);
  assert.equal(result[0].sourceName, 'G1');
  assert.equal(result[0].chips.length, 2);
  assert.equal(result[1].sourceName, 'G2');
});

test('mergeChipsWithOverrides: override replaces specified fields, preserves unspecified', () => {
  const autoChips = [
    { target: 'a', label: 'Aaa', insertion: 'Do [[a]]().', group: 'G1' },
  ];
  const cfg: ChipsV2Config = {
    schema_version: 2,
    overrides: [{ target: 'a', label: 'Custom A' }],  // only label
  };
  const result = mergeChipsWithOverrides(autoChips, cfg);
  assert.equal(result[0].chips[0].label, 'Custom A');
  assert.equal(result[0].chips[0].insertion, 'Do [[a]]().');  // preserved
});

test('mergeChipsWithOverrides: hide[] removes matching targets', () => {
  const autoChips = [
    { target: 'a', label: 'A', insertion: 'Do [[a]]().', group: 'G' },
    { target: 'b', label: 'B', insertion: 'Do [[b]]().', group: 'G' },
  ];
  const cfg: ChipsV2Config = { schema_version: 2, hide: ['a'] };
  const result = mergeChipsWithOverrides(autoChips, cfg);
  assert.equal(result[0].chips.length, 1);
  assert.equal(result[0].chips[0].label, 'B');
});

test('mergeChipsWithOverrides: override on non-existent target logged + dropped', () => {
  const autoChips = [
    { target: 'a', label: 'A', insertion: 'Do [[a]]().', group: 'G' },
  ];
  const cfg: ChipsV2Config = {
    schema_version: 2,
    overrides: [{ target: 'ghost', label: 'Phantom' }],
  };
  const result = mergeChipsWithOverrides(autoChips, cfg);
  // 'ghost' shouldn't materialize as a chip.
  assert.equal(result[0].chips.length, 1);
  assert.equal(result[0].chips[0].label, 'A');
});

test('mergeChipsWithOverrides: groups[] controls group order + display label', () => {
  const autoChips = [
    { target: 'a', label: 'Aaa', insertion: 'Do [[a]]().', group: 'second' },
    { target: 'b', label: 'Bbb', insertion: 'Do [[b]]().', group: 'first' },
  ];
  const cfg: ChipsV2Config = {
    schema_version: 2,
    groups: [
      { id: 'first',  order: 1, label: 'First Things' },
      { id: 'second', order: 2, label: 'Second Things' },
    ],
  };
  const result = mergeChipsWithOverrides(autoChips, cfg);
  assert.equal(result[0].sourceName, 'First Things');  // declared label
  assert.equal(result[1].sourceName, 'Second Things');
});

test('mergeChipsWithOverrides: chips within group sorted by `order` then alphabetical', () => {
  const autoChips = [
    { target: 'c', label: 'Charlie', insertion: 'Do [[c]]().', group: 'G' },
    { target: 'a', label: 'Alpha', insertion: 'Do [[a]]().', group: 'G' },
    { target: 'b', label: 'Bravo', insertion: 'Do [[b]]().', group: 'G' },
  ];
  const cfg: ChipsV2Config = {
    schema_version: 2,
    overrides: [
      { target: 'b', order: 1 },  // bravo forced to top
    ],
  };
  const result = mergeChipsWithOverrides(autoChips, cfg);
  const labels = result[0].chips.map(c => c.label);
  // bravo (order=1) first; then Alpha + Charlie alphabetical.
  assert.deepEqual(labels, ['Bravo', 'Alpha', 'Charlie']);
});

test('mergeChipsWithOverrides: idempotent (no-op stays no-op)', () => {
  const autoChips = [
    { target: 'a', label: 'A', insertion: 'Do [[a]]().', group: 'G' },
  ];
  const cfg: ChipsV2Config = {
    schema_version: 2,
    overrides: [{ target: 'a', label: 'A overridden' }],
  };
  const once = mergeChipsWithOverrides(autoChips, cfg);
  const twice = mergeChipsWithOverrides(autoChips, cfg);
  assert.deepEqual(once, twice);
});

// Add ChipsV2Config import for the merge tests above.
import type { ChipsV2Config } from './chips-core.ts';

// ===========================================================================
// v0.2.54 — top-level snippet auto-discovery + dedupe duplicate group headers
// ===========================================================================

import {
  discoverTopLevelSnippets,
  shouldRenderSubgroupHeader,
  PERSONAL_GROUP_NAME,
} from './chips-core.ts';

// --- discoverTopLevelSnippets (Option A) ---

test('discoverTopLevelSnippets: empty input → empty output', () => {
  assert.deepEqual(discoverTopLevelSnippets([], new Set()), []);
});

test('discoverTopLevelSnippets: top-level .md passes', () => {
  const files = [{ path: 'foo.md' }];
  assert.deepEqual(
    discoverTopLevelSnippets(files, new Set(['forge-moda'])),
    [{ path: 'foo.md' }],
  );
});

test('discoverTopLevelSnippets: library-subdir file is excluded', () => {
  const files = [{ path: 'forge-moda/setup.md' }];
  assert.deepEqual(
    discoverTopLevelSnippets(files, new Set(['forge-moda'])),
    [],
  );
});

test('discoverTopLevelSnippets: vault-root _underscore.md skipped per S7', () => {
  const files = [{ path: '_chips.md' }, { path: '_meta_notes.md' }];
  assert.deepEqual(
    discoverTopLevelSnippets(files, new Set(['forge-moda'])),
    [],
  );
});

test('discoverTopLevelSnippets: nested-non-library file excluded under Option A', () => {
  // Per prompt §Phase1A Option A: vault-root only; nested-non-library
  // subdir files are NOT included. Default-conservative; Option C is
  // a future expansion.
  const files = [{ path: 'foo/bar.md' }];
  assert.deepEqual(
    discoverTopLevelSnippets(files, new Set(['forge-moda'])),
    [],
  );
});

test('discoverTopLevelSnippets: mix of top-level + library + nested + underscore', () => {
  const files = [
    { path: 'snippet_a.md' },                  // top-level → keep
    { path: 'forge-moda/setup.md' },           // library subdir → drop
    { path: 'forge-music/blues/song.md' },     // library subdir nested → drop
    { path: 'misc/draft.md' },                 // nested non-library → drop (Option A)
    { path: '_internal.md' },                  // S7 → drop
    { path: 'snippet_b.md' },                  // top-level → keep
  ];
  assert.deepEqual(
    discoverTopLevelSnippets(files, new Set(['forge-moda', 'forge-music'])),
    [{ path: 'snippet_a.md' }, { path: 'snippet_b.md' }],
  );
});

test('discoverTopLevelSnippets: idempotent (same input → same output)', () => {
  const files = [
    { path: 'a.md' },
    { path: 'forge-moda/x.md' },
    { path: '_skip.md' },
  ];
  const dirs = new Set(['forge-moda']);
  const a = discoverTopLevelSnippets(files, dirs);
  const b = discoverTopLevelSnippets(files, dirs);
  assert.deepEqual(a, b);
});

test('discoverTopLevelSnippets: preserves caller-defined extra fields on T', () => {
  // The helper is generic on T extends {path}; extra fields ride
  // through untouched.
  const files = [
    { path: 'a.md', extra: 'kept', basename: 'a' },
    { path: 'forge-moda/b.md', extra: 'dropped' },
  ];
  const out = discoverTopLevelSnippets(files, new Set(['forge-moda']));
  assert.equal(out.length, 1);
  assert.equal((out[0] as { extra: string }).extra, 'kept');
  assert.equal((out[0] as { basename: string }).basename, 'a');
});

test('PERSONAL_GROUP_NAME exported as the synthetic library name', () => {
  assert.equal(PERSONAL_GROUP_NAME, 'Personal');
});

// --- shouldRenderSubgroupHeader (Finding 2 fix) ---

test('shouldRenderSubgroupHeader: null label → false (no header)', () => {
  assert.equal(shouldRenderSubgroupHeader(null, 'Anything'), false);
});

test('shouldRenderSubgroupHeader: label matches sourceName → false (dedupe)', () => {
  // v2 forge-moda per-library case. sourceName "Setup" comes from
  // groups[].label; chip.group "Setup" comes from overrides[].group.
  // They duplicate visually; h5 must skip.
  assert.equal(shouldRenderSubgroupHeader('Setup', 'Setup'), false);
});

test('shouldRenderSubgroupHeader: label differs from sourceName → true (render)', () => {
  // v1 vault-root _chips.md case. Source "myvault" (the vault name),
  // chip.group "Setup" (the v1 group field). Sub-header still useful.
  assert.equal(shouldRenderSubgroupHeader('Setup', 'myvault'), true);
});

test('shouldRenderSubgroupHeader: case-sensitive match (different case → render)', () => {
  // Defensive: case mismatch is preserved as a distinct sub-group.
  // CSS uppercase makes 'Setup' and 'SETUP' visually identical at the
  // h4 layer, but the data carries the distinction.
  assert.equal(shouldRenderSubgroupHeader('Setup', 'setup'), true);
});

test('shouldRenderSubgroupHeader: empty string label → false', () => {
  // Per chips-view's render loop, sub.label is null when chip.group is
  // undefined. An empty string is also defensively treated as null-equivalent.
  assert.equal(shouldRenderSubgroupHeader('', 'Setup'), false);
});


// ============================================================================
// End-to-end pipeline coverage — autoDeriveChips → mergeChipsWithOverrides →
// chip.insertion (the value chips-view.ts:onChipClick passes to insertChipText).
// v0.2.63 (per 2026-06-06-1015 brief (d) Phase 1): the unit-level pipeline
// produces B7.1-canonical insertions exactly as the spec prescribes. These
// regression tests lock in the spec-correct shape so any future drift surfaces
// at suite time, not at user smoke.
// ============================================================================

test('end-to-end pipeline: action snippet with inputs → canonical insertion preserved through merge', () => {
  const inventory = [
    { id: 'peak', basename: 'peak', type: 'action' as const, inputs: ['bars'], parentDir: 'percussion_lab' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].chips.length, 1);
  assert.equal(groups[0].chips[0].insertion, 'Do [[peak]](<bars>).');
});

test('end-to-end pipeline: action snippet with no inputs → empty parens preserved through merge', () => {
  const inventory = [
    { id: 'solitary', basename: 'solitary', type: 'action' as const, inputs: [], parentDir: 'percussion_lab' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  assert.equal(groups[0].chips[0].insertion, 'Do [[solitary]]().');
});

test('end-to-end pipeline: action snippet with multiple inputs → comma-separated placeholders preserved through merge', () => {
  const inventory = [
    { id: 'render', basename: 'render', type: 'action' as const, inputs: ['x', 'y', 'color'], parentDir: 'graphics' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  assert.equal(groups[0].chips[0].insertion, 'Do [[render]](<x>, <y>, <color>).');
});

test('end-to-end pipeline: data snippet → "Set <name> to [[id]]()." form preserved through merge', () => {
  const inventory = [
    { id: 'twelve_bar_blues_progression', basename: 'twelve_bar_blues_progression', type: 'data' as const, parentDir: 'blues' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  assert.equal(groups[0].chips[0].insertion, 'Set <name> to [[twelve_bar_blues_progression]]().');
});

test('end-to-end pipeline: forge-moda v2 override does NOT override insertion → auto-derived canonical wins', () => {
  // Mirrors forge-moda/_meta/_chips.md's actual v2 shape — overrides set
  // group + label + order but intentionally leave `insertion` unset so
  // auto-derive's B7.1-canonical form is the surface. Regression coverage
  // that the v2 merge path doesn't accidentally strip the insertion.
  const inventory = [
    { id: 'create_water_particles', basename: 'create_water_particles', type: 'action' as const, inputs: [], parentDir: '' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const cfg: ChipsV2Config = {
    schema_version: 2,
    groups: [{ id: 'Setup', order: 1, label: 'Setup' }],
    overrides: [
      { target: 'create_water_particles', group: 'Setup', order: 1 },
    ],
  };
  const groups = mergeChipsWithOverrides(autoChips, cfg);
  assert.equal(groups[0].sourceName, 'Setup');
  assert.equal(groups[0].chips[0].insertion, 'Do [[create_water_particles]]().');
});

test('end-to-end pipeline: explicit insertion override wins over auto-derive (curator-authored bespoke form)', () => {
  const inventory = [
    { id: 'custom', basename: 'custom', type: 'action' as const, inputs: ['x'], parentDir: 'g' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const cfg: ChipsV2Config = {
    schema_version: 2,
    overrides: [
      { target: 'custom', insertion: 'Call [[custom]] with curated note.' },
    ],
  };
  const groups = mergeChipsWithOverrides(autoChips, cfg);
  assert.equal(groups[0].chips[0].insertion, 'Call [[custom]] with curated note.');
});

test('end-to-end pipeline: insertion makes it through end-to-end without being stripped to bare wikilink', () => {
  // Regression for brief (d) — assert directly that no path emits the
  // bare `[[name]]` shape. Lock in the spec-correct form across both
  // auto-derive and the merge step's chip emission.
  const inventory = [
    { id: 'murmuration', basename: 'murmuration', type: 'action' as const, inputs: [], parentDir: 'percussion' },
    { id: 'solitary', basename: 'solitary', type: 'action' as const, inputs: [], parentDir: 'percussion_lab' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  for (const group of groups) {
    for (const chip of group.chips) {
      // Must not be bare `[[id]]` — must carry the `Do ... ().` shell.
      assert.match(chip.insertion, /^Do \[\[[^\]]+\]\]\(\)\.$|^Do \[\[[^\]]+\]\]\(<[^>]+(, <[^>]+)*>\)\.$/,
        `unexpected insertion shape: ${chip.insertion}`);
    }
  }
});

test('end-to-end pipeline: forge-music chip click simulation — peak with inputs:[bars] produces canonical insertion', () => {
  // Brief (d)'s exact example: clicking a `peak` chip whose underlying
  // snippet has `inputs: [bars]` should produce `Do [[peak]](<bars>).`.
  const inventory = [
    { id: 'peak', basename: 'peak', type: 'action' as const, inputs: ['bars'], parentDir: 'percussion_lab' },
  ];
  const autoChips = autoDeriveChips(inventory);
  const groups = mergeChipsWithOverrides(autoChips, null);
  const peakChip = groups[0].chips[0];
  assert.equal(peakChip.label, 'Peak');
  assert.equal(peakChip.insertion, 'Do [[peak]](<bars>).');

  // Simulate the chips-view click path: aria-label + onClick arg.
  // chips-view.ts:255 → btn.setAttribute('aria-label', chip.insertion).
  // chips-view.ts:257 → void this.onChipClick(chip.insertion).
  // The value passed to onChipClick (which then reaches insertChipText)
  // is exactly chip.insertion — no transformation between palette and
  // insert. The canonical form makes it all the way through.
  const clickedValue = peakChip.insertion;
  assert.equal(clickedValue, 'Do [[peak]](<bars>).');
});


// ===========================================================================
// v0.2.67 — v3.1 walk-up: mergeChipsConfigsWalkUp integration cases.
// Pure-core helper that the chips.ts loader uses to fuse per-walk-level
// configs into a single merged config before passing to mergeChipsWithOverrides.
// ===========================================================================

import { mergeChipsConfigsWalkUp } from './chips-core.ts';

test('walk-up merge: empty input → minimal v2 config', () => {
  const merged = mergeChipsConfigsWalkUp([]);
  assert.equal(merged.schema_version, 2);
  assert.equal(merged.overrides, undefined);
  assert.equal(merged.hide, undefined);
});

test('walk-up merge: higher-specificity overrides[].target wins', () => {
  // Walk: chapter (specific) first, library (general) second.
  const chapter: ChipsV2Config = {
    schema_version: 3,
    overrides: [{ target: 'solitary', label: 'Chapter-specific Solitary' }],
  };
  const library: ChipsV2Config = {
    schema_version: 3,
    overrides: [{ target: 'solitary', label: 'Library-wide Solitary' }],
  };
  const merged = mergeChipsConfigsWalkUp([chapter, library]);
  assert.equal(merged.overrides?.length, 1);
  assert.equal(merged.overrides?.[0].label, 'Chapter-specific Solitary');
});

test('walk-up merge: hide[] unions across levels (once hidden, hidden)', () => {
  const chapter: ChipsV2Config = { schema_version: 3, hide: ['Set'] };
  const library: ChipsV2Config = { schema_version: 3, hide: ['print', 'Set'] };
  const merged = mergeChipsConfigsWalkUp([chapter, library]);
  const hideSet = new Set(merged.hide);
  assert.equal(hideSet.size, 2);
  assert.ok(hideSet.has('Set'));
  assert.ok(hideSet.has('print'));
});

test('walk-up merge: same-id groups[] — higher-specificity wins', () => {
  const chapter: ChipsV2Config = {
    schema_version: 3,
    groups: [{ id: 'Setup', label: 'Chapter Setup', order: 1 }],
  };
  const library: ChipsV2Config = {
    schema_version: 3,
    groups: [{ id: 'Setup', label: 'Library Setup', order: 9 }],
  };
  const merged = mergeChipsConfigsWalkUp([chapter, library]);
  assert.equal(merged.groups?.length, 1);
  assert.equal(merged.groups?.[0].label, 'Chapter Setup');
  assert.equal(merged.groups?.[0].order, 1);
});

test('walk-up merge: same-label synthetic_chips[] — higher-specificity wins', () => {
  const chapter: ChipsV2Config = {
    schema_version: 3,
    synthetic_chips: [
      { label: 'print', insertion: 'Chapter print', group: 'Builtins' },
    ],
  };
  const library: ChipsV2Config = {
    schema_version: 3,
    synthetic_chips: [
      { label: 'print', insertion: 'Library print', group: 'Builtins' },
      { label: 'Set', insertion: 'Library Set', group: 'Statements' },
    ],
  };
  const merged = mergeChipsConfigsWalkUp([chapter, library]);
  assert.equal(merged.synthetic_chips?.length, 2);
  // Chapter's `print` insertion wins; library's `Set` survives.
  const byLabel = new Map(merged.synthetic_chips!.map(c => [c.label, c.insertion]));
  assert.equal(byLabel.get('print'), 'Chapter print');
  assert.equal(byLabel.get('Set'), 'Library Set');
});

test('walk-up merge: schema_version promotes to 3 when any input is v3', () => {
  const v2: ChipsV2Config = { schema_version: 2 };
  const v3: ChipsV2Config = { schema_version: 3 };
  assert.equal(mergeChipsConfigsWalkUp([v2, v3]).schema_version, 3);
  assert.equal(mergeChipsConfigsWalkUp([v2]).schema_version, 2);
  assert.equal(mergeChipsConfigsWalkUp([v3]).schema_version, 3);
});

test('walk-up merge: distinct targets accumulate across levels', () => {
  // Chapter overrides `solitary`; library overrides `peak` — both survive.
  const chapter: ChipsV2Config = {
    schema_version: 3,
    overrides: [{ target: 'solitary', label: 'Chapter Solitary' }],
  };
  const library: ChipsV2Config = {
    schema_version: 3,
    overrides: [{ target: 'peak', label: 'Library Peak' }],
  };
  const merged = mergeChipsConfigsWalkUp([chapter, library]);
  assert.equal(merged.overrides?.length, 2);
  const targets = new Set(merged.overrides!.map(o => o.target));
  assert.ok(targets.has('solitary'));
  assert.ok(targets.has('peak'));
});

test('walk-up merge: idempotent (same input → same output)', () => {
  const cfg: ChipsV2Config = {
    schema_version: 3,
    overrides: [{ target: 'a', label: 'A' }],
    hide: ['x'],
    synthetic_chips: [{ label: 'print', insertion: 'Do.', group: 'Synthetic' }],
  };
  const a = mergeChipsConfigsWalkUp([cfg]);
  const b = mergeChipsConfigsWalkUp([cfg]);
  assert.deepEqual(a, b);
});

// v0.2.113 — insertChipTextAtLine: cursor-aware variant.
import { insertChipTextAtLine } from './chips-core.ts';

test('insertChipTextAtLine: cursor in English body inserts at cursor+1', () => {
  const body = `---
type: action
---

# English

Body line A.
Body line B.

# Python

pass
`;
  // # English is at line 4. Body lines at 6, 7. # Python at 9.
  // Cursor on line 6 ("Body line A") should insert at line 7.
  const r = insertChipTextAtLine(body, 'CHIP', 6);
  assert.ok(r.ok);
  const lines = (r as { ok: true; body: string }).body.split('\n');
  assert.equal(lines[6], 'Body line A.');
  assert.equal(lines[7], 'CHIP');
  assert.equal(lines[8], 'Body line B.');
});

test('insertChipTextAtLine: cursor on # English heading → falls back to end-of-section', () => {
  const body = `# English

Body.

# Python
pass
`;
  // Cursor on line 0 (# English heading) — falls back to legacy append.
  const r = insertChipTextAtLine(body, 'CHIP', 0);
  assert.ok(r.ok);
  // Legacy behavior: append after last non-blank in English body.
  // Body = ["", "Body.", "", "# Python", "pass", ""] indexed from #
  // English line 0. Last non-blank in section is "Body." at line 2.
  // CHIP lands at line 3.
  const out = (r as { ok: true; body: string }).body;
  assert.ok(out.includes('Body.\nCHIP\n'),
    `expected CHIP appended after Body.; got:\n${out}`);
});

test('insertChipTextAtLine: cursor in Python facet → falls back to end-of-English', () => {
  const body = `# English

Body.

# Python

pass
`;
  // # Python at line 4, body at 6. Cursor on line 6 (Python body).
  const r = insertChipTextAtLine(body, 'CHIP', 6);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body;
  // CHIP should land in English body, not Python.
  const pythonIdx = out.indexOf('# Python');
  const chipIdx = out.indexOf('CHIP');
  assert.ok(chipIdx >= 0);
  assert.ok(chipIdx < pythonIdx,
    `CHIP must land before # Python; got CHIP@${chipIdx}, Python@${pythonIdx}`);
});

test('insertChipTextAtLine: cursor in frontmatter → falls back to end-of-English', () => {
  const body = `---
type: action
---

# English

Body.
`;
  // Frontmatter is lines 0-2; # English at 4; cursor on line 1.
  const r = insertChipTextAtLine(body, 'CHIP', 1);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body;
  // CHIP should land in the English section, not in frontmatter.
  assert.ok(out.includes('Body.\nCHIP'),
    `expected CHIP after Body. (English-body append); got:\n${out}`);
  // Frontmatter must be unchanged.
  assert.ok(out.startsWith('---\ntype: action\n---\n'));
});

test('insertChipTextAtLine: cursor at last body line inserts at end of body', () => {
  const body = `# English

A
B

# Python
`;
  // English at 0; body at 2 (A), 3 (B); # Python at 5.
  // Cursor on B (line 3) → insert at line 4.
  const r = insertChipTextAtLine(body, 'CHIP', 3);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  assert.equal(out[3], 'B');
  assert.equal(out[4], 'CHIP');
});

test('insertChipTextAtLine: no English heading returns NO_ENGLISH error', () => {
  const body = `# Python\npass\n`;
  const r = insertChipTextAtLine(body, 'CHIP', 0);
  assert.equal(r.ok, false);
});

// v0.2.120 — empty-line polish.
test('insertChipTextAtLine: cursor on empty line in English body replaces the empty line', () => {
  const body = `# English

Foo

Bar

# Python
`;
  // # English at 0. Body: empty(1), Foo(2), empty(3), Bar(4), empty(5).
  // Cursor on line 3 (the empty line between Foo and Bar).
  const r = insertChipTextAtLine(body, 'CHIP', 3);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  // The empty line at index 3 should be replaced (not appended after).
  assert.equal(out[2], 'Foo');
  assert.equal(out[3], 'CHIP');
  assert.equal(out[4], 'Bar');
  // Total line count must not increase (replace, not insert).
  assert.equal(out.length, body.split('\n').length,
    `line count unchanged when replacing empty; got ${out.length} from ${body.split('\n').length}`);
});

test('insertChipTextAtLine: empty-line polish only triggers for whitespace-only lines (non-empty lines keep v0.2.113 below-cursor behavior)', () => {
  const body = `# English

Foo bar

# Python
`;
  // Cursor on "Foo bar" line (line 2). v0.2.113 behavior: insert at line 3.
  const r = insertChipTextAtLine(body, 'CHIP', 2);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  assert.equal(out[2], 'Foo bar');
  assert.equal(out[3], 'CHIP');
  // Line count grew by 1 (insert, not replace).
  assert.equal(out.length, body.split('\n').length + 1);
});

test('insertChipTextAtLine: cursor on whitespace-only (spaces/tabs) line also triggers replace', () => {
  // The English body has a line containing just spaces — should be
  // treated as empty for the polish purpose.
  const body = '# English\n\n  \t  \n\n# Python\n';
  // Body lines (0-indexed): [0] # English, [1] '', [2] '  \t  ', [3] '', [4] # Python.
  const r = insertChipTextAtLine(body, 'CHIP', 2);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  assert.equal(out[2], 'CHIP');
  // Line count unchanged.
  assert.equal(out.length, body.split('\n').length);
});

// =================================================================
// v0.2.135 — applyIndentToChipBody + extractLeadingWhitespace
// =================================================================
// Per v0334 §2 driver-flagged bug: multi-line chip insertions into
// indented contexts (e.g., inside a list item or fenced block)
// produced lines 2..N at column 0 instead of matching the cursor-
// line's leading whitespace. Pure-core helpers added in v0.2.135
// (chips-core.ts) close the gap; integration tests for the wiring
// live in the existing insertChipTextAtLine test block above.

import {
  applyIndentToChipBody,
  extractLeadingWhitespace,
} from './chips-core.ts';

test('applyIndentToChipBody: single-line chip returns unchanged', () => {
  const result = applyIndentToChipBody('Do [[print]]("hello").', '    ');
  assert.equal(result, 'Do [[print]]("hello").');
});

test('applyIndentToChipBody: cursor at column 0 returns chip unchanged', () => {
  const result = applyIndentToChipBody('def f():\n  return 1', '');
  assert.equal(result, 'def f():\n  return 1');
});

test('applyIndentToChipBody: multi-line chip with 4-space indent indents lines 2..N', () => {
  const result = applyIndentToChipBody('If <c>:\n    <body>', '    ');
  assert.equal(result, 'If <c>:\n        <body>');
});

test('applyIndentToChipBody: tab indent matches tabs', () => {
  const result = applyIndentToChipBody('For each <x>:\n  <body>', '\t');
  assert.equal(result, 'For each <x>:\n\t  <body>');
});

test('applyIndentToChipBody: preserves true-blank lines at column 0', () => {
  // Blank lines in chip body shouldn't get whitespace prepended —
  // that would create whitespace-only lines that look messy + may
  // trigger linters.
  const result = applyIndentToChipBody('line1\n\nline3', '  ');
  assert.equal(result, 'line1\n\n  line3');
});

test('applyIndentToChipBody: 3-line chip indents both subsequent lines', () => {
  const result = applyIndentToChipBody('a\nb\nc', '  ');
  assert.equal(result, 'a\n  b\n  c');
});

test('extractLeadingWhitespace: empty string returns ""', () => {
  assert.equal(extractLeadingWhitespace(''), '');
});

test('extractLeadingWhitespace: null returns ""', () => {
  assert.equal(extractLeadingWhitespace(null), '');
});

test('extractLeadingWhitespace: 4 spaces returns "    "', () => {
  assert.equal(extractLeadingWhitespace('    foo'), '    ');
});

test('extractLeadingWhitespace: tab + space mix returns the mix verbatim', () => {
  assert.equal(extractLeadingWhitespace('\t  \tx'), '\t  \t');
});

test('extractLeadingWhitespace: no leading whitespace returns ""', () => {
  assert.equal(extractLeadingWhitespace('foo bar'), '');
});

test('insertChipTextAtLine: multi-line chip into indented cursor line gets matched indent', () => {
  // Cursor is on an indented non-empty line; multi-line chip should
  // get lines 2..N prefixed with the same indent. Verifies the
  // wiring + the v0.2.135 helper integration.
  const body = '# English\n\n    First line indented\n\n# Python\n';
  // Lines: [0] # English, [1] '', [2] '    First line indented', [3] '', [4] # Python.
  const r = insertChipTextAtLine(body, 'If <c>:\n    <body>', 2);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  // Chip inserted at line 3 (after cursor line 2). First line of
  // chip lands at out[3]; the cursor-line indent is "    " so the
  // chip body's second line should be "    " + "    <body>" =
  // "        <body>".
  assert.equal(out[3], 'If <c>:');
  assert.equal(out[4], '        <body>');
});

test('insertChipTextAtLine: multi-line chip on empty indented line gets matched indent (replace polish)', () => {
  // Cursor on empty line that has trailing whitespace from manual
  // indent — the v0.2.120 polish replaces the line with the chip,
  // and the v0.2.135 wiring should still apply the indent.
  const body = '# English\n\n    \n\n# Python\n';
  // Lines: [0] # English, [1] '', [2] '    ' (whitespace-only), [3] '', [4] # Python.
  const r = insertChipTextAtLine(body, 'For each <x>:\n  <body>', 2);
  assert.ok(r.ok);
  const out = (r as { ok: true; body: string }).body.split('\n');
  // Empty-line replaced AT cursor line 2 (not after). Chip's first
  // line lands there; second line gets the leading whitespace prefix.
  assert.equal(out[2], 'For each <x>:');
  assert.equal(out[3], '      <body>');
});
