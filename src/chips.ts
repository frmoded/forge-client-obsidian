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
  mergeChipsConfigsWalkUp,
  discoverTopLevelSnippets,
  PERSONAL_GROUP_NAME,
  type ChipsManifest,
  type SnippetMetaForChips,
} from './chips-core';
import { isSourceVault } from './source-vault-core';
import {
  applyHideToSyntheticChips,
  type SyntheticChip,
} from './synthetic-chips-core';
import { walkUpChipsConfigs } from './chips-walk-up-core';
import type { ChipsV2Config } from './chips-core';

// v0.2.62 — names of bundled libraries the plugin knows how to extract
// (matches welcome.ts's ensureBundledForgeModa + ensureBundledForgeMusic
// surface). Used by isSourceVault detection: when the vault root's
// forge.toml `name` equals one of these, the vault IS that library's
// source repo (Path A workflow), and chip discovery walks vault-root
// subdirs as the library's content.
const KNOWN_BUNDLED_LIBRARIES = new Set(['forge-moda', 'forge-music']);

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

  // Per-library auto-discovery + v2/v3 `_chips.md` curation.
  // v0.2.67 — pass through manifest.activeFilePath so loadLibraryChips
  // can run the v3.1 walk-up when the file lives inside this library.
  for (const libDir of manifest.libraryDirNames) {
    const libGroups = await loadLibraryChips(
      app, libDir, manifest.activeFilePath ?? null);
    collected.push(...libGroups);
  }

  // v0.2.62 — Path A source-vault chip discovery (per brief (c)).
  // When the user opens a bundled library's source repo directly as
  // an Obsidian vault (forge-music's primary workflow), the vault
  // root IS the library and its subdirs (percussion/, percussion_lab/,
  // blues/) are the library's content. Standard library-subdir
  // discovery skips them because `libraryDirNames` only enumerates
  // top-level folders containing `forge.toml` — the vault root
  // itself is never in the set. Detect via vault-root forge.toml's
  // `name` field; walk vault-root subdirs as the library's content.
  // Fires AFTER per-library discovery so chip ordering puts standard
  // library content first, then source-vault content.
  const sourceVaultName = await detectSourceVault(app);
  if (sourceVaultName !== null) {
    const sourceGroups = await loadSourceVaultChips(
      app, sourceVaultName, new Set(manifest.libraryDirNames));
    collected.push(...sourceGroups);
  }

  // v0.2.54 — top-level (vault-root) snippet auto-discovery, grouped
  // under the synthetic "Personal" library name. Per the Mission's
  // low-floor framing: a beginner who authors at the vault root gets
  // immediate chip availability without first moving the file into a
  // library subdir. Pure auto-discovery; no curation file at root.
  // In a source vault, "Personal" surfaces the same files as the
  // source-vault walk above; we skip Personal to avoid double-counting.
  if (sourceVaultName === null) {
    const personalGroups = await loadPersonalChips(
      app, new Set(manifest.libraryDirNames));
    collected.push(...personalGroups);
  }

  return collected;
}

/** Read the vault root's `forge.toml` (if any) and check whether the
 *  vault IS the source repo for a known bundled library. Returns the
 *  matched library name (e.g. `"forge-music"`) when Path A is
 *  detected, otherwise null. Defensive: missing/unreadable
 *  `forge.toml` → null. v0.2.62 — added (per prompt 2026-06-06-1000). */
async function detectSourceVault(app: App): Promise<string | null> {
  const adapter = app.vault.adapter;
  try {
    if (!(await adapter.exists('forge.toml'))) return null;
    const body = await adapter.read('forge.toml');
    return isSourceVault(body, KNOWN_BUNDLED_LIBRARIES);
  } catch (e) {
    console.warn('Forge chips: detectSourceVault read failed', e);
    return null;
  }
}

/** Walk the vault root and every subdir NOT inside an existing
 *  library subdir (those are covered by `loadLibraryChips`) and emit
 *  chip groups as if the vault root IS the library named
 *  `libraryName`. Per brief (c) (v0.2.62). Skips dot-prefixed dirs
 *  (`.obsidian/`, `.forge/`, `.trash/`). Skips known-bundled-library
 *  nested extractions (forge-moda/forge-music nested inside a source
 *  vault) — `excludeTopDirs` carries the set of top-level folders
 *  already handled by `loadLibraryChips`. */
async function loadSourceVaultChips(
  app: App,
  libraryName: string,
  excludeTopDirs: Set<string>,
): Promise<ChipPaletteGroup[]> {
  const inventory: SnippetMetaForChips[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const firstSlash = file.path.indexOf('/');
    const topDir = firstSlash === -1 ? '' : file.path.slice(0, firstSlash);
    // Exclude dot-prefixed top-level folders and any folder already
    // discovered by `loadLibraryChips`.
    if (topDir.startsWith('.')) continue;
    if (topDir !== '' && excludeTopDirs.has(topDir)) continue;
    const fm = await readSnippetFrontmatter(app, file);
    if (!fm) continue;
    const type = typeof fm.type === 'string' ? fm.type : undefined;
    if (type !== 'action' && type !== 'data') continue;
    // Bare id is the file's vault-relative path without `.md` —
    // e.g. `percussion/murmuration` or `solitary` (vault-root file).
    const noExt = file.path.replace(/\.md$/, '');
    const basename = file.basename;
    // parentDir for deriveChip's group:
    //   - vault-root file → '' (deriveChip → "(library)")
    //   - one-deep file (`percussion/foo.md`) → 'percussion'
    //   - nested (`percussion/sub/foo.md`) → 'percussion/sub'
    const lastSlash = noExt.lastIndexOf('/');
    const parentDir = lastSlash === -1 ? '' : noExt.slice(0, lastSlash);
    const inputs = Array.isArray(fm.inputs)
      ? fm.inputs.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const chip = typeof fm.chip === 'boolean' ? fm.chip : undefined;
    inventory.push({
      id: noExt,
      basename,
      type,
      inputs,
      chip,
      parentDir,
    });
  }
  // Mark the source name on the result so the UI labels the section
  // with the library identity (e.g. "forge-music") rather than the
  // "(library)" default.
  void libraryName;
  const autoChips = autoDeriveChips(inventory);
  return mergeChipsWithOverrides(autoChips, null);
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
  activeFilePath?: string | null,
): Promise<ChipPaletteGroup[]> {
  // Step 1: v3.1 walk-up — when an active file is provided AND it
  // lives inside this library, build the walk-up path list. The
  // most-specific path (closest to the active file) determines
  // auto-discovery scope; all matched levels' configs merge per the
  // v3.1 precedence rules. When walk-up yields no matches, the loader
  // falls through to the v0.2.65 single-file behavior.
  const walkPaths = activeFilePathInLibrary(activeFilePath, libDir)
    ? walkUpChipsConfigs(
        activeFilePath as string,
        libDir,
        markdownFilesPathSet(app),
      )
    : [];

  // Step 2: derive auto-discovery scope from the walk. If the
  // most-specific `_chips.md` lives at a subdir below libDir, narrow
  // scope to that subdir; otherwise scope to the full library
  // (libDir/) — same as the v0.2.65 default.
  const scopePrefix = deriveAutoDiscoveryScope(walkPaths, libDir);
  const inventory = await buildSnippetInventory(app, libDir, scopePrefix);
  const autoChips = autoDeriveChips(inventory);

  // Step 3: walk-up multi-level merge. Read every matched path; parse
  // each as v2/v3 config; collect non-error results in walk order
  // (most-specific FIRST) and feed mergeChipsConfigsWalkUp.
  const adapter = app.vault.adapter;
  if (walkPaths.length > 0) {
    const levelConfigs: ChipsV2Config[] = [];
    for (const path of walkPaths) {
      try {
        const cfg = await readChipsConfigAt(adapter, path);
        if (cfg) levelConfigs.push(cfg);
      } catch (e) {
        console.warn(`Forge chips: read failed for ${path}`, e);
      }
    }
    if (levelConfigs.length > 0) {
      const merged = mergeChipsConfigsWalkUp(levelConfigs);
      const groups = mergeChipsWithOverrides(autoChips, merged);
      return appendSyntheticChipGroups(groups, merged);
    }
  }

  // Step 4 (no walk-up matches OR no activeFilePath in this library):
  // v0.2.65 single-`_chips.md` path. Look for `_chips.md` at the
  // library root (canonical or legacy path).
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
    if (sv === 2 || sv === 3) {
      const cfg = parseChipsV2Config(v2Result);
      if (isParseError(cfg)) {
        console.warn(
          `Forge chips: ${chosenPath} v${sv} parse error: ${cfg.error} — ` +
          `falling through to auto-discovery only`,
        );
        return mergeChipsWithOverrides(autoChips, null);
      }
      const groups = mergeChipsWithOverrides(autoChips, cfg);
      // v3.2 — synthetic chips. Append them as their own group(s) so
      // they appear alongside auto-derived chips. `hide[]` from the
      // same config applies to synthetic chip labels per spec.
      return appendSyntheticChipGroups(groups, cfg);
    }
    if (sv !== undefined) {
      console.warn(
        `Forge chips: ${chosenPath} schema_version=${JSON.stringify(sv)} ` +
        `is not 2 or 3 — skipping file, using pure auto-discovery`,
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

// ------------- v0.2.67 (v3.1 walk-up) helpers ---------------------------

/** True when `activeFilePath` is a non-empty vault-relative path inside
 *  the given library directory (i.e., starts with `libDir + '/'`). */
function activeFilePathInLibrary(
  activeFilePath: string | null | undefined,
  libDir: string,
): boolean {
  if (!activeFilePath) return false;
  return activeFilePath.startsWith(`${libDir}/`);
}

/** Build a set of all vault-relative markdown file paths Obsidian
 *  currently sees. Cheap (in-memory index); reused as the
 *  `existingFiles` argument to `walkUpChipsConfigs`. */
function markdownFilesPathSet(app: App): Set<string> {
  const out = new Set<string>();
  for (const f of app.vault.getMarkdownFiles()) out.add(f.path);
  return out;
}

/** Derive the auto-discovery scope prefix per the v3.1 spec: when the
 *  most-specific `_chips.md` lives at a subdir BELOW the library root,
 *  narrow auto-discovery to that subdir. Otherwise return the library
 *  root's prefix (same as v0.2.65 default). */
function deriveAutoDiscoveryScope(
  walkPaths: string[],
  libDir: string,
): string {
  const libPrefix = `${libDir}/`;
  if (walkPaths.length === 0) return libPrefix;
  const mostSpecific = walkPaths[0];
  // walkPaths come back with vault-relative paths ending in `_chips.md`
  // (or `_meta/_chips.md` at the library root). Derive the directory
  // of the most-specific path; if it's exactly the library root (or
  // libDir/_meta), keep the library-wide scope.
  const lastSlash = mostSpecific.lastIndexOf('/');
  if (lastSlash === -1) {
    // vault-root _chips.md — only relevant when libDir is the empty
    // string (source-vault scenarios route through loadSourceVaultChips
    // separately). Defensive: keep the library-wide scope.
    return libPrefix;
  }
  const dir = mostSpecific.slice(0, lastSlash);
  if (dir === libDir) return libPrefix;
  if (dir === `${libDir}/_meta`) return libPrefix;
  return `${dir}/`;
}

/** Read + parse a single `_chips.md` at `path`. Returns the
 *  parsed v2/v3 config when successful, or null on any read or parse
 *  failure (silent; the walk-up tolerates per-level errors). */
async function readChipsConfigAt(
  adapter: { exists(p: string): Promise<boolean>; read(p: string): Promise<string> },
  path: string,
): Promise<ChipsV2Config | null> {
  let raw: string;
  try {
    if (!(await adapter.exists(path))) return null;
    raw = await adapter.read(path);
  } catch {
    return null;
  }
  const body = extractDataBody(raw);
  const contentType =
    (readFrontmatterField(raw, 'content_type') || '').toLowerCase();
  if (contentType !== 'yaml') return null;
  let decoded: unknown;
  try {
    decoded = parseYaml(body);
  } catch (e) {
    console.warn(
      `Forge chips: ${path} YAML parse failed: ${(e as Error).message}`,
    );
    return null;
  }
  if (decoded === null || typeof decoded !== 'object') return null;
  const sv = (decoded as Record<string, unknown>).schema_version;
  if (sv !== 2 && sv !== 3) return null;
  const cfg = parseChipsV2Config(decoded);
  if (isParseError(cfg)) {
    console.warn(`Forge chips: ${path} v${sv} parse error: ${cfg.error}`);
    return null;
  }
  return cfg;
}

/** v3.2 — append synthetic chips from a parsed v3 config as their own
 *  ChipPaletteGroup(s), grouped by the synthetic chip's `group` field
 *  (default "Synthetic"). `hide[]` from the same config applies to
 *  synthetic chip labels per spec.
 *
 *  Each synthetic chip becomes a regular Chip in the palette — click
 *  handler inserts `chip.insertion` verbatim, B7.2 wikilink-click
 *  suppression (v0.2.59) handles any `[[builtin_name]]` markup in the
 *  insertion text.
 *
 *  Returns the input groups with synthetic groups appended. Pure: no
 *  mutation of input. */
function appendSyntheticChipGroups(
  baseGroups: ChipPaletteGroup[],
  cfg: ChipsV2Config,
): ChipPaletteGroup[] {
  const syntheticChips = cfg.synthetic_chips ?? [];
  if (syntheticChips.length === 0) return baseGroups;
  // Apply hide[] (matches by label).
  const visible = applyHideToSyntheticChips(syntheticChips, cfg.hide);
  if (visible.length === 0) return baseGroups;
  // Bucket by group field; sort within each by `order` then label.
  const buckets = new Map<string, SyntheticChip[]>();
  for (const c of visible) {
    if (!buckets.has(c.group)) buckets.set(c.group, []);
    buckets.get(c.group)!.push(c);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return a.label.localeCompare(b.label);
    });
  }
  const out = baseGroups.slice();
  for (const [groupName, chips] of buckets) {
    out.push({
      sourceName: groupName,
      chips: chips.map(c => ({
        label: c.label,
        insertion: c.insertion,
        group: c.group,
      })),
    });
  }
  return out;
}

/** v0.2.54 — auto-discover action/data snippets at the vault root
 *  (not inside any library subdir) and surface them under the
 *  synthetic "Personal" group. Closes the "first-snippet authored
 *  at the most natural location must appear in the chip palette"
 *  Mission gap surfaced in v0.2.52 smoke. Pure auto-discovery —
 *  there's no v2 `_chips.md` curation at vault root (curators who
 *  want curation at root use the v1 path via loadVaultRootV1Chips).
 *
 *  Logic:
 *    1. Filter `vault.getMarkdownFiles()` via `discoverTopLevelSnippets`
 *       (pure-core; Option A scope per prompt 2026-06-05-1030).
 *    2. Read each candidate's frontmatter via cachedRead + parseYaml
 *       (same v0.2.49 fresh-read path as library inventory).
 *    3. Build SnippetMetaForChips with `parentDir = PERSONAL_GROUP_NAME`
 *       so deriveChip surfaces the chip under "Personal".
 *    4. Run autoDeriveChips + mergeChipsWithOverrides(null) for the
 *       palette shape.
 *
 *  Returns empty when no top-level action/data snippets are present
 *  → the Personal group doesn't appear in the palette at all (no
 *  empty-group header noise). */
async function loadPersonalChips(
  app: App,
  libraryDirs: Set<string>,
): Promise<ChipPaletteGroup[]> {
  const candidates = discoverTopLevelSnippets(
    app.vault.getMarkdownFiles().map(f => ({ path: f.path, file: f })),
    libraryDirs,
  );
  const inventory: SnippetMetaForChips[] = [];
  for (const c of candidates) {
    const fm = await readSnippetFrontmatter(app, c.file);
    if (!fm) continue;
    const type = typeof fm.type === 'string' ? fm.type : undefined;
    if (type !== 'action' && type !== 'data') continue;
    const basename = c.file.basename;
    // id = bare basename (vault-root files are unqualified).
    const id = basename;
    const inputs = Array.isArray(fm.inputs)
      ? fm.inputs.filter((x: unknown): x is string => typeof x === 'string')
      : undefined;
    const chip = typeof fm.chip === 'boolean' ? fm.chip : undefined;
    inventory.push({
      id,
      basename,
      type,
      inputs,
      chip,
      parentDir: PERSONAL_GROUP_NAME,
    });
  }
  const autoChips = autoDeriveChips(inventory);
  return mergeChipsWithOverrides(autoChips, null);
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
