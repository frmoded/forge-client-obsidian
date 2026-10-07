// Retire-the-library-note-palette drain (2026-10-07-0200). The UX (side panel, header icon, refresh command, ribbon entry, CSS, tests) is
// gone; the CATALOG that feeds /generate's callable inventory and the Cmd-click reference view stays. These tests pin both sides:
//   * REMOVED: files that must not exist, identifiers and user-facing strings that must not appear anywhere in shipped source.
//   * KEPT: the catalog chain still produces library notes end to end (real engine lib.py -> parseEngineLib -> index -> the inventory
//     /generate receives), and main.ts still wires it to the two consumers (inventory + Cmd-click lookup).
// Keep-side tests carry mutants in the drain's FEEDBACK (catalog returns empty / a domain lost / a removed command re-registered).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ENGINE_LIB_DOMAINS, buildLibraryNoteIndex, parseEngineLib, type LibraryNote } from './library-note-catalog-core.ts';
import { buildCallableInventory } from './callable-inventory-core.ts';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf-8');
const code = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const srcFiles = fs.readdirSync(path.resolve(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'bundled-assets.generated.ts');
const shipped = Object.fromEntries(srcFiles.map((f) => [f, code(read(`src/${f}`))]));
const main = shipped['main.ts'];

// ---- REMOVED --------------------------------------------------------------------------------------------------------

test('removed: the palette view, its loader, helpers and their tests are gone from src/', () => {
  for (const f of ['chips-view.ts', 'chips.ts', 'chips.test.ts', 'chips-core.ts', 'chip-folding-core.ts', 'chip-folding-core.test.ts',
    'chip-toolbar-button-core.ts', 'chip-toolbar-button-core.test.ts', 'library-chip-merge-core.ts', 'library-chip-merge-core.test.ts',
    'palette-discovery-core.ts', 'palette-discovery-core.test.ts']) {
    assert.equal(fs.existsSync(path.resolve(ROOT, 'src', f)), false, `${f} must be deleted`);
  }
});

test('removed: no shipped source refers to the palette view, header icon, refresh command or ribbon entry', () => {
  const banned = [
    'ChipsView', 'CHIPS_VIEW_TYPE', 'openChipsView', 'chipPalette', 'reloadChipPalette', 'CHIPS_BTN_CLASS', 'chipsHost', 'chipsManifest',
    'shouldShowChipsToolbarButton', 'loadPaletteForActiveVault', 'loadImportedVaultChips', 'filterActiveDomainNotes',
    'buildImportChipGroup', 'forge-refresh-chips', 'Refresh library note palette', 'Open library note palette', 'Forge library notes',
    "'puzzle'",
  ];
  for (const [file, text] of Object.entries(shipped)) {
    for (const b of banned) assert.ok(!text.includes(b), `${file} still contains ${b}`);
  }
});

test('removed: the only surviving mention of the retired view type is the legacy-layout sweep', () => {
  const hits = Object.entries(shipped).filter(([, t]) => t.includes("'forge-chips'")).map(([f]) => f);
  assert.deepEqual(hits, ['legacy-view-cleanup-core.ts']);
});

test('removed: no stylesheet rule styles the palette', () => {
  const css = read('styles.css');
  for (const cls of ['forge-chips-', 'forge-chip-row', 'forge-chip ', 'forge-chip:', 'forge-moda-chips-view']) {
    assert.ok(!css.includes(cls), `styles.css still styles ${cls}`);
  }
});

test('removed: no palette wording in user-facing plugin strings (welcome note, parse-error hint, ribbon menu)', () => {
  const user = ['welcome.ts', 'recipe-parse-error-friendly.ts', 'forge-action.ts'].map((f) => shipped[f]).join('\n');
  assert.ok(!/palette/i.test(user.replace(/command palette/gi, '')), 'user-facing text still says "palette"');
});

test('removed: palette-only state — no setting, no stored key: settings.ts has nothing chip/palette related', () => {
  assert.ok(!/chip|palette/i.test(read('src/settings.ts')));
});

test('migration: a saved forge-chips pane is swept once at layout-ready, behind the pure helper', () => {
  assert.match(main, /import \{ detachLegacyViewLeaves \} from '\.\/legacy-view-cleanup-core\.ts';/);
  assert.match(main, /onLayoutReady\(\(\) => \{\s*detachLegacyViewLeaves\(this\.app\.workspace\);/);
});

test('migration: the sweep of stale header buttons keeps recognising the retired button class (an old session may have left one)', () => {
  assert.ok(main.includes('.forge-chips-btn'));
});

// ---- KEPT -----------------------------------------------------------------------------------------------------------

function loadCatalog(): Record<string, LibraryNote[]> {
  const perDomain: Record<string, LibraryNote[]> = {};
  for (const d of ENGINE_LIB_DOMAINS) perDomain[d] = parseEngineLib(read(`assets/engine/forge/${d}/lib.py`));
  return perDomain;
}

test('kept: the real engine lib.py files still parse into a non-empty catalog for every domain', () => {
  const cat = loadCatalog();
  for (const d of ENGINE_LIB_DOMAINS) assert.ok(cat[d].length > 0, `domain ${d} lost its library notes`);
  assert.ok(cat.music.some((n) => n.name === 'bar'), 'music/bar is in the catalog');
});

test('kept: /generate\'s callable inventory still sees library notes end to end (real lib.py -> catalog index -> buildCallableInventory)', () => {
  const index = buildLibraryNoteIndex(loadCatalog());
  const entries = buildCallableInventory([], Array.from(index.values()));
  const names = new Set(entries.map((e) => e.name));
  for (const expected of ['random_float', 'bar', 'voices', 'repeat', 'create_chamber']) {
    assert.ok(names.has(expected), `inventory is missing library note ${expected} (one per domain: core, music, moda)`);
  }
  assert.ok(entries.length >= 60, `inventory suspiciously small (${entries.length}; baseline 73)`);
});

test('kept: main.ts still builds libraryNoteIndex from the engine domains and feeds it to the inventory and to Cmd-click', () => {
  assert.match(main, /const domains = ENGINE_LIB_DOMAINS;/);
  assert.match(main, /perDomain\[domain\] = parseEngineLib\(src\);/);
  assert.match(main, /this\.libraryNoteIndex = buildLibraryNoteIndex\(perDomain\);/);
  assert.match(main, /const chips = Array\.from\(this\.libraryNoteIndex\.values\(\)\);\s*return labelSelfInInventory\(\s*buildCallableInventory\(vaultNotes, chips\),/);
  assert.match(main, /LibraryNoteView\.lookup = \(name: string\) =>\s*this\.libraryNoteIndex\.get\(name\) \?\? null;/);
  assert.match(main, /registerView\(LIBRARY_NOTE_VIEW_TYPE, leaf => new LibraryNoteView\(leaf\)\)/);
  assert.match(main, /void this\.loadLibraryNoteCatalog\(\);/);
});

test('kept: the domain gate for the moda commands, and the engine-bundle diagnostic command, are still registered', () => {
  assert.match(main, /if \(this\.isDomainActive\('moda'\)\) \{\s*this\.registerDomainCommands\('moda'\);/);
  assert.match(main, /id: 'forge-log-chip-inventory',\s*name: 'Log library note inventory',/);
});

test('kept: the right-sidebar eviction guard still protects the Output / Edges / 3D / MoDa panels, without the retired panel', () => {
  const core = read('src/right-leaf-eviction-core.ts');
  assert.ok(!core.includes("'forge-chips'"));
  for (const t of ['forge-output', 'forge-three']) assert.ok(core.includes(`'${t}'`), t);
});
