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
import { extractDataBody } from './data-snippet';
import { snippetIdFromPath } from './snippet-id-from-path';
import {
  Chip,
  ChipPaletteGroup,
  ChipsParseError,
  parseChipsBody,
  validateChipsList,
  mergeChipSources,
  chipSourcesFor,
  CHIPS_RELATIVE_PATHS,
  autoDeriveChips,
  parseChipsV2Config,
  mergeChipsWithOverrides,
  type ChipsManifest,
  type SnippetMetaForChips,
} from './chips-core';

// Re-export so existing import sites in the codebase keep working
// without churn.
export { chipSourcesFor };
export type { ChipsManifest };

/** True iff `path` could be a chips source file the plugin loads
 *  from. Used by the file-watch handler in main.ts to decide
 *  whether a modify event should trigger a palette reload. */
export function isChipsFilePath(path: string): boolean {
  for (const rel of CHIPS_RELATIVE_PATHS) {
    if (path === rel || path.endsWith(`/${rel}`)) return true;
  }
  return false;
}

/** Top-level entry. Builds palette groups for the active vault by:
 *  (a) auto-deriving from each library subdir's snippets + v2
 *  `_chips.md` curation; (b) layering vault-root `_chips.md` (v1
 *  authored shape) on top. Per-source failures are logged and the
 *  source is skipped so the rest of the palette still renders. */
export async function loadChipsForActiveVault(
  app: App,
  manifest: ChipsManifest,
): Promise<ChipPaletteGroup[]> {
  const collected: ChipPaletteGroup[] = [];

  // Vault-root v1 chip list (user-authored curation; pre-v2 shape).
  // Loaded first so it appears at the top of the palette per the
  // declaration-order rule from chipSourcesFor.
  const rootGroups = await loadVaultRootV1Chips(app, manifest.vaultName);
  collected.push(...rootGroups);

  // Per-library auto-discovery + v2 `_chips.md` curation.
  for (const libDir of manifest.libraryDirNames) {
    const libGroups = await loadLibraryChips(app, libDir);
    collected.push(...libGroups);
  }
  return collected;
}

/** Load the vault-root `_chips.md` (v1-shaped: bare `chips: [...]`).
 *  Vault root doesn't have auto-discovery (no library context); this
 *  preserves the v1 user-curated path so existing vault-root
 *  `_chips.md` files keep working. */
async function loadVaultRootV1Chips(
  app: App,
  vaultName: string,
): Promise<ChipPaletteGroup[]> {
  const adapter = app.vault.adapter;
  for (const rel of CHIPS_RELATIVE_PATHS) {
    try {
      if (!(await adapter.exists(rel))) continue;
      const raw = await adapter.read(rel);
      const parsed = parseChipsFile(raw, rel);
      if (isParseError(parsed)) {
        console.warn(`Forge chips: ${rel} parse error: ${parsed.error}`);
        return [];
      }
      return mergeChipSources([{ sourceName: vaultName, chips: parsed.chips }]);
    } catch (e) {
      console.warn(`Forge chips: read failed for ${rel}`, e);
    }
  }
  return [];
}

/** Load chips for one library subdir. Auto-derives from every
 *  action/data snippet in the subdir, then layers `_chips.md`
 *  curation (v2 overrides) on top. Falls back to v1 path when
 *  `_chips.md` is present but lacks `schema_version: 2`. */
async function loadLibraryChips(
  app: App,
  libDir: string,
): Promise<ChipPaletteGroup[]> {
  // Step 1: build the snippet inventory by reading each candidate
  // file's frontmatter via vault.cachedRead. v0.2.49 — switched from
  // metadataCache.getFileCache to fresh-read because the cache is
  // async-indexed and can return stale frontmatter after the user
  // edits `chip: false` ↔ `chip: true`. cachedRead hits Obsidian's
  // in-memory text cache so this is cheap.
  const inventory = await buildSnippetInventory(app, libDir);
  const autoChips = autoDeriveChips(inventory);

  // Step 2: look for `_chips.md` (canonical or legacy path).
  const adapter = app.vault.adapter;
  let raw: string | null = null;
  let chosenPath: string | null = null;
  for (const rel of CHIPS_RELATIVE_PATHS) {
    const candidate = `${libDir}/${rel}`;
    try {
      if (await adapter.exists(candidate)) {
        raw = await adapter.read(candidate);
        chosenPath = candidate;
        break;
      }
    } catch (e) {
      console.warn(`Forge chips: read failed for ${candidate}`, e);
    }
  }

  // Step 3: no `_chips.md` → pure auto-discovery output.
  if (raw === null || chosenPath === null) {
    return mergeChipsWithOverrides(autoChips, null);
  }

  // Step 4: try to parse as v2. If schema_version isn't 2, fall
  // through to v1 path (preserves curator-authored v1 files until
  // they migrate).
  const body = extractDataBody(raw);
  const contentType =
    (readFrontmatterField(raw, 'content_type') || '').toLowerCase();
  let v2Result: unknown = null;
  if (contentType === 'yaml') {
    try {
      v2Result = parseYaml(body);
    } catch (e) {
      console.warn(
        `Forge chips: ${chosenPath} YAML parse failed: ${(e as Error).message}`,
      );
    }
  }
  if (v2Result !== null && typeof v2Result === 'object') {
    const sv = (v2Result as Record<string, unknown>).schema_version;
    if (sv === 2) {
      const cfg = parseChipsV2Config(v2Result);
      if (isParseError(cfg)) {
        console.warn(
          `Forge chips: ${chosenPath} v2 parse error: ${cfg.error} — ` +
          `falling through to auto-discovery only`,
        );
        return mergeChipsWithOverrides(autoChips, null);
      }
      return mergeChipsWithOverrides(autoChips, cfg);
    }
    if (sv !== undefined) {
      console.warn(
        `Forge chips: ${chosenPath} schema_version=${JSON.stringify(sv)} ` +
        `is not 2 — skipping file, using pure auto-discovery`,
      );
      return mergeChipsWithOverrides(autoChips, null);
    }
  }

  // Step 5: no schema_version → v1 curator-authored shape. Parse the
  // v1 chip list and emit it under the library's sourceName.
  const parsed = parseChipsFile(raw, chosenPath);
  if (isParseError(parsed)) {
    console.warn(
      `Forge chips: ${chosenPath} v1 parse error: ${parsed.error} — ` +
      `falling through to auto-discovery`,
    );
    return mergeChipsWithOverrides(autoChips, null);
  }
  // v1 curator-authored list takes precedence over auto-derive for
  // back-compat. (Curators who want both must migrate to v2.)
  return mergeChipSources([{ sourceName: libDir, chips: parsed.chips }]);
}

/** Walk Obsidian's markdown file index for files inside `libDir/`
 *  and build a SnippetMetaForChips per file by reading each file's
 *  frontmatter via vault.cachedRead. Files at any depth under libDir
 *  are included (e.g. `forge-music/blues/song.md`). The snippet's
 *  `id` follows the v0.2.26 qualified-id rule (full library-relative
 *  path); the `parentDir` is the subdir relative to libDir (or
 *  empty for files at libDir root).
 *
 *  v0.2.49 — fresh-read via cachedRead instead of metadataCache to
 *  dodge a B.5-smoke staleness bug: when the user toggled `chip:
 *  false` → `chip: true`, the metadata cache hadn't re-indexed yet,
 *  so deriveChip still saw the stale `chip: false` and silently
 *  dropped the chip from the palette. cachedRead always returns
 *  current file content (it's a text cache invalidated on modify),
 *  so the inline parseYaml of the frontmatter block sees the live
 *  on-disk values. */
async function buildSnippetInventory(
  app: App,
  libDir: string,
): Promise<SnippetMetaForChips[]> {
  const prefix = `${libDir}/`;
  const libraryDirNames = new Set([libDir]);
  const out: SnippetMetaForChips[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.startsWith(prefix)) continue;
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
    out.push({
      id: bareId,
      basename,
      type,
      inputs,
      chip,
      parentDir,
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

/** Decode a chips-file's body via its frontmatter `content_type`,
 *  then validate the resulting structure via the pure core. YAML and
 *  JSON are both supported — choose whichever reads better when
 *  authoring `_chips.md`. Unknown content_type falls back to a JSON
 *  parse attempt (back-compat with the v1 single-chip shape that
 *  predates content_type being a meaningful hint here). */
function parseChipsFile(
  raw: string,
  filePath: string,
): { chips: Chip[] } | ChipsParseError {
  const body = extractDataBody(raw);
  const contentType = (readFrontmatterField(raw, 'content_type') || '').toLowerCase();
  if (contentType === 'yaml') {
    let parsed: unknown;
    try {
      parsed = parseYaml(body);
    } catch (e) {
      return { error: `chips YAML parse failed: ${(e as Error).message}` };
    }
    return validateChipsList(parsed);
  }
  // JSON path (explicit content_type: json, or unspecified — same
  // shape as the v1 single-chip _chips.md).
  return parseChipsBody(body);
}

/** Minimal scalar-only frontmatter probe — avoids dragging in a YAML
 *  dependency just to read one field. Used here to discover
 *  content_type before deciding which body decoder to run. */
function readFrontmatterField(raw: string, key: string): string | null {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return null;
  const fm = raw.slice(0, end);
  const re = new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm');
  const m = fm.match(re);
  return m ? m[1].trim() : null;
}

function isParseError<T>(
  x: T | ChipsParseError,
): x is ChipsParseError {
  return (x as ChipsParseError).error !== undefined;
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
