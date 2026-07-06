// Obsidian-coupled chip reader. Pure parse + merge + auto-derive
// live in chips-core.ts; this module wires them to the vault
// adapter.
//
// v0.2.48 — schema v2 adoption. Loader now:
//   1. Walks each library subdir for action/data snippets.
//   2. Auto-derives chips per spec (every non-`_`-prefixed action +
//      data snippet without `chip: false` becomes a chip).
//   3. Reads `_chips.md` (canonical: `<lib>/_meta/_chips.md`)
//      and parses as v2 if it declares `schema_version: 2`.
//   4. Merges auto-derived list with v2 overrides per spec.
//   5. Falls through to v1 path (curator-authored chip list) when
//      `_chips.md` lacks `schema_version: 2` — preserves back-compat.
//   6. Vault-root `_chips.md` keeps the v1 path (no auto-derive at
//      vault root since libraries own the auto-discovery surface).
//
// v0.2.49 — buildSnippetInventory swaps `metadataCache.getFileCache`
// for a fresh `vault.cachedRead` + inline YAML parse of each
// snippet's frontmatter block. metadataCache is async-indexed and
// can lag behind on-disk content after a `chip: false` ↔ `chip:
// true` toggle. Trades a per-snippet read (cheap — cachedRead hits
// the in-memory text cache) for cache-freshness guarantees.
//
// v0.2.50 added per-library diagnostic console.logs to investigate
// the v0.2.48 B.3 smoke failure (root-caused to v1 `_chips.md`
// stuck in cohort vaults; see chip-palette-schema-v2-adoption
// feedback §4). v0.2.51 — diagnostic logs removed; the loader is
// now production-quiet again.

import { App, parseYaml, TFile } from 'obsidian';
import { snippetIdFromPath } from './snippet-id-from-path.ts';
import {
  ChipPaletteGroup,
  chipSourcesFor,
  type ChipsManifest,
  type SnippetMetaForChips,
} from './chips-core.ts';
import { isSourceVault } from './source-vault-core.ts';
// v0.2.262 drain 1310 — `_chips.md` reader stack retired.
// chips-walk-up-core.ts, synthetic-chips-core.ts, and portions of
// chips-core.ts (parseChipsV2Config / mergeChipsWithOverrides /
// autoDeriveChips / etc.) deleted in this drain. Live palette
// discovery lives in palette-discovery-core.ts.

// v0.2.62 — names of bundled libraries the plugin knows how to extract
// (matches welcome.ts's ensureBundledForgeModa + ensureBundledForgeMusic
// surface). Used by isSourceVault detection: when the vault root's
// forge.toml `name` equals one of these, the vault IS that library's
// source repo (Path A workflow), and chip discovery walks vault-root
// subdirs as the library's content.
// v0.2.76 — forge-tutorial added as Tier 1 default-on onboarding library.
const KNOWN_BUNDLED_LIBRARIES = new Set([
  'forge-moda', 'forge-music', 'forge-tutorial',
]);

// Re-export so existing import sites in the codebase keep working
// without churn.
export { chipSourcesFor };
export type { ChipsManifest };

async function buildSnippetInventory(
  app: App,
  libDir: string,
  scopePrefix?: string,
): Promise<SnippetMetaForChips[]> {
  // v0.2.67 — `scopePrefix` (optional) narrows the snippet inventory
  // to a subdir per v3.1 walk-up's auto-discovery scope rule. Caller
  // passes the most-specific `_chips.md`-containing dir + '/'. When
  // omitted, behavior is identical to v0.2.65 (full library walk).
  const prefix = `${libDir}/`;
  const filterPrefix = scopePrefix ?? prefix;
  const libraryDirNames = new Set([libDir]);
  const out: SnippetMetaForChips[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(filterPrefix)) continue;
    const fm = await readSnippetFrontmatter(app, file);
    if (!fm) continue;                                  // not a snippet
    const type = typeof fm.type === 'string' ? fm.type : undefined;
    // Auto-discovery applies to action + data snippets per the spec.
    // Snapshots and untyped files are excluded here too (deriveChip
    // also drops them, but skipping early avoids a needless entry).
    if (type !== 'action' && type !== 'data') continue;
    const id = snippetIdFromPath(file.path, libraryDirNames);
    // Strip the leading `libDir/` from the id to produce the
    // user-facing snippet_id (e.g. `forge-moda/setup` → `setup`,
    // `forge-music/blues/song` → `blues/song`).
    const bareId = id.startsWith(prefix) ? id.slice(prefix.length) : id;
    const basename = file.basename;
    // parentDir relative to libDir. `forge-moda/setup.md` → "".
    // `forge-music/blues/song.md` → "blues".
    const relPath = file.path.slice(prefix.length);     // e.g. "blues/song.md"
    const lastSlash = relPath.lastIndexOf('/');
    const parentDir = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
    const inputs = Array.isArray(fm.inputs)
      ? fm.inputs.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const chip = typeof fm.chip === 'boolean' ? fm.chip : undefined;
    // v0.2.77 — thread facet_form so deriveChip can emit keyword-form
    // insertions for canonical input-takers (avoids the v0.2.77
    // positional foot-gun by steering authoring to the keyword form).
    const facet_form = typeof fm.facet_form === 'string'
      ? fm.facet_form : undefined;
    out.push({
      id: bareId,
      basename,
      type,
      inputs,
      chip,
      parentDir,
      facet_form,
    });
  }
  return out;
}

/** Read `file`'s frontmatter block from the vault and parse it as
 *  YAML. Returns null when the file has no `---` frontmatter (not a
 *  snippet) or when the YAML doesn't parse to an object. Uses
 *  vault.cachedRead for the read (text cache; invalidated on file
 *  modify) so a freshly-edited file's frontmatter is returned
 *  current, not the metadataCache's possibly-stale snapshot. */
async function readSnippetFrontmatter(
  app: App,
  file: TFile,
): Promise<Record<string, unknown> | null> {
  let content: string;
  try {
    content = await app.vault.cachedRead(file);
  } catch {
    return null;
  }
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const fmYaml = content.slice(4, end);  // strip leading "---\n"
  let parsed: unknown;
  try {
    parsed = parseYaml(fmYaml);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Resolve a chip's `refs:` entry (a snippet basename like
 *  `set_ink_mass`) to an actual vault-relative path, following A4
 *  shadow resolution: check the vault root first (user-edited
 *  shadow wins), then each declared library subdir. Returns null if
 *  the snippet isn't found anywhere — caller surfaces that as a
 *  broken-ref tooltip / hidden context menu item. Synchronous via
 *  Obsidian's in-memory file index. */
export function resolveSnippetPath(
  app: App,
  basename: string,
  manifest: ChipsManifest,
): string | null {
  const rootPath = `${basename}.md`;
  if (app.vault.getAbstractFileByPath(rootPath)) return rootPath;
  // v0.2.47: iterate installed library subdirs directly (the
  // manifest's libraryDirNames already include the `forge-` prefix).
  // Previously domains-driven, which missed forge-moda for vaults
  // with `domains = ["music"]` even though moda content is
  // unconditionally extracted.
  for (const libDir of manifest.libraryDirNames) {
    const libPath = `${libDir}/${basename}.md`;
    if (app.vault.getAbstractFileByPath(libPath)) return libPath;
  }
  return null;
}

// v0.2.258 drain 2026-07-03-1300 — auto-discovery palette loader
// replacing the `_chips.md`-schema `loadChipsForActiveVault` above.
// Data source model:
//   1. LANGUAGE_PRIMITIVES (hardcoded in palette-discovery-core.ts).
//   2. Every action/data snippet in every installed library subdir.
//   3. Every action/data snippet at vault root (personal group).
//   4. Source-vault content (when the vault IS a bundled library repo).
// Order: libraries first (so library wins on A4-shadow dedup per
// driver Choice 4), then personal, then source-vault.

import {
  computePalette,
  type SnippetMetaForPalette,
} from './palette-discovery-core.ts';

/** Read the vault root's `forge.toml` and check whether the vault IS
 *  the source repo for a known bundled library. Returns the matched
 *  library name (e.g. `"forge-music"`) when Path A is detected,
 *  otherwise null. Defensive: missing/unreadable `forge.toml` → null.
 *  v0.2.262 drain 1310 — reintroduced after chips-md-legacy sweep
 *  removed the original in the same file. Only caller is
 *  `loadPaletteForActiveVault` below. */
async function detectSourceVault(app: App): Promise<string | null> {
  const adapter = app.vault.adapter;
  try {
    if (!(await adapter.exists('forge.toml'))) return null;
    const body = await adapter.read('forge.toml');
    return isSourceVault(body, KNOWN_BUNDLED_LIBRARIES);
  } catch (e) {
    console.error('Forge chips: detectSourceVault read failed', e);
    return null;
  }
}

export async function loadPaletteForActiveVault(
  app: App,
  manifest: ChipsManifest,
): Promise<ChipPaletteGroup[]> {
  const inventory: SnippetMetaForPalette[] = [];

  // Libraries first: A4 shadowing means library-note chips win when a
  // library and a vault note share a basename (driver Choice 4).
  for (const libDir of manifest.libraryDirNames) {
    try {
      const libSnippets = await buildSnippetInventory(app, libDir);
      // Read chip_insertion frontmatter for library notes (per driver
      // Choice 3 option a). Reuse readSnippetFrontmatter to get the
      // extra field without a second file read.
      for (const snippet of libSnippets) {
        const libRelPath = `${libDir}/${snippet.id.replace(/^[^/]+\//, '')}.md`;
        // Actually simpler: build the path from libDir + snippet.id
        // directly (snippet.id is the bare id relative to libDir).
        const filePath = `${libDir}/${snippet.id}.md`;
        const file = app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const fm = await readSnippetFrontmatter(app, file);
          if (fm && typeof fm.chip_insertion === 'string') {
            (snippet as SnippetMetaForPalette).chip_insertion =
              fm.chip_insertion;
          }
        }
        inventory.push(snippet as SnippetMetaForPalette);
        void libRelPath;
      }
    } catch (e) {
      console.error(`Forge palette: library '${libDir}' inventory failed`, e);
    }
  }

  // Personal (vault-root snippets) — skip when source-vault detected
  // (avoids double-count of the source repo's own content).
  const sourceVaultName = await detectSourceVault(app);
  if (sourceVaultName === null) {
    try {
      const personalSnippets = await buildPersonalInventory(
        app, new Set(manifest.libraryDirNames));
      inventory.push(...(personalSnippets as SnippetMetaForPalette[]));
    } catch (e) {
      console.error('Forge palette: personal inventory failed', e);
    }
  } else {
    // Source-vault: walk the vault root as if it IS the library.
    try {
      const sourceSnippets = await buildSourceVaultInventory(
        app, sourceVaultName, new Set(manifest.libraryDirNames));
      inventory.push(...(sourceSnippets as SnippetMetaForPalette[]));
    } catch (e) {
      console.error('Forge palette: source-vault inventory failed', e);
    }
  }

  return computePalette(inventory);
}

/** Vault-root snippet inventory (personal group). Mirrors the shape
 *  of `buildSnippetInventory` but reads from vault root without a
 *  libDir prefix. */
async function buildPersonalInventory(
  app: App,
  excludeTopDirs: Set<string>,
): Promise<SnippetMetaForChips[]> {
  const out: SnippetMetaForChips[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    // Only vault-root files (no `/` in path).
    if (file.path.includes('/')) continue;
    // Skip files whose top-level is an excluded library.
    void excludeTopDirs;
    const fm = await readSnippetFrontmatter(app, file);
    if (!fm) continue;
    const type = typeof fm.type === 'string' ? fm.type : undefined;
    if (type !== 'action' && type !== 'data') continue;
    const basename = file.basename;
    const inputs = Array.isArray(fm.inputs)
      ? fm.inputs.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const chip = typeof fm.chip === 'boolean' ? fm.chip : undefined;
    const facet_form = typeof fm.facet_form === 'string'
      ? fm.facet_form : undefined;
    out.push({
      id: basename,
      basename,
      type,
      inputs,
      chip,
      parentDir: '',
      facet_form,
    });
  }
  return out;
}

/** Source-vault snippet inventory (vault root IS the library). */
async function buildSourceVaultInventory(
  app: App,
  libraryName: string,
  excludeTopDirs: Set<string>,
): Promise<SnippetMetaForChips[]> {
  void libraryName;
  const out: SnippetMetaForChips[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const firstSlash = file.path.indexOf('/');
    const topDir = firstSlash === -1 ? '' : file.path.slice(0, firstSlash);
    if (topDir.startsWith('.')) continue;
    if (topDir !== '' && excludeTopDirs.has(topDir)) continue;
    const fm = await readSnippetFrontmatter(app, file);
    if (!fm) continue;
    const type = typeof fm.type === 'string' ? fm.type : undefined;
    if (type !== 'action' && type !== 'data') continue;
    const basename = file.basename;
    const relPath = file.path;
    const lastSlash = relPath.lastIndexOf('/');
    const parentDir = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
    const inputs = Array.isArray(fm.inputs)
      ? fm.inputs.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const chip = typeof fm.chip === 'boolean' ? fm.chip : undefined;
    const facet_form = typeof fm.facet_form === 'string'
      ? fm.facet_form : undefined;
    out.push({
      id: file.path.replace(/\.md$/, ''),
      basename,
      type,
      inputs,
      chip,
      parentDir,
      facet_form,
    });
  }
  return out;
}
