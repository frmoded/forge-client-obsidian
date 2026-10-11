// Drain 2026-10-10-2100 (b) — the AUTOMATIC extraction of a bundled library vault from the plugin folder into the user's vault,
// moved out of welcome.ts (which imports `obsidian`) so a real extraction can be exercised with `node --test` against an in-memory
// adapter. Behaviour that existed before this drain is unchanged; what is new is the content-identity trigger below.
//
// What the automatic path does, per vault (`status` is compareBundledVaultVersion over the two forge.toml files):
//
//   no-extracted  first install            → copy the whole bundle.
//   drift         bundled ≠ extracted ver. → move the outgoing tree to the ONE rolling backup (`<vault>.bak.previous/`), re-copy.
//                                            THIS is the only protection a drifting vault's local edits have: they survive in the
//                                            backup, not in place, and the next drift replaces that backup.   (unchanged)
//   match         same version             → NEW: if the bundle's CONTENT IDENTITY differs from the one recorded at the last
//                                            extraction (or none was recorded), ADD the bundle files the vault is missing.
//                                            Never overwrite, never delete: an edited file and a user-added file are untouched.
//                                            Same identity → no work, so a file the user deliberately deleted stays deleted.
//   no-bundled / unparseable               → skip, record nothing (avoid data loss; unchanged).
//
// Why a content identity and not just the version: forge.toml's version moves only when a library author bumps it, and the plugin
// version (the `.bundle-version` sentinel's old value) is the same across many builds. A bundle with new notes at the same version
// never reached an existing vault. The identity is baked at build time (scripts/inline-bundled-assets.mjs) and recorded per vault
// in the PLUGIN folder — never inside the user's vault.
//
// Drain 2026-10-11-0900 §2 + §3 — the extraction MANIFEST (bundled-library-manifest-core.ts) turns "may I touch this file?" into a fact:
//   drift + manifest        → PER-FILE update: unedited files update in place, new files are added, edited files are left (the new
//                             bundle version is written beside them as `<name>.bundled`), deleted files stay deleted, bundle-dropped
//                             files go only if unedited. The one-generation rolling backup is kept as a COPY, as a safety net.
//   drift, no manifest      → today's wholesale path (rolling backup + re-extract), then a manifest is recorded.
//   same version, new id    → add-missing as before, except a file the manifest says we extracted and the user deleted stays deleted.
//   same version, same id, no manifest → adopt-manifest: no vault write; files byte-identical to the bundle are recorded.
// `manifest: undefined` means "this caller does not use manifests" and gives exactly the pre-manifest behaviour.
//
// NO OBSIDIAN IMPORTS (pure-core convention).

import { copyDirRecursive, type CopyAdapter } from './copy-dir-core.ts';
import {
  findDroppedCandidates, hashBytes, planFileDrift, planManifestSweep, type Manifest,
} from './bundled-library-manifest-core.ts';
import { compareBundledVaultVersion, type BundledVaultVersionStatus } from './bundled-vault-version-core.ts';
import { planRollingBackup } from './rolling-backup-core.ts';
import { isReservedDirName } from './vault-mount-exclusions-core.ts';

/** The adapter surface extraction touches: CopyAdapter plus the five methods the version check, backup and record need. */
export interface ExtractorAdapter extends CopyAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
}

export type ExtractionAction =
  | 'copy-all'
  | 'backup-and-reextract'
  | 'per-file-update'
  | 'adopt-manifest'
  | 'add-missing'
  | 'skip-same-identity'
  | 'skip-no-source'
  | 'skip-no-bundled'
  | 'skip-unparseable';

export interface ExtractionPlan {
  action: ExtractionAction;
  /** Vault-relative-to-the-library paths to add — only for 'add-missing'. */
  files: string[];
}

export interface ExtractionOutcome {
  action: ExtractionAction;
  /** Paths added by an 'add-missing' pass (relative to the library root). */
  copied: string[];
  /** True when this pass left the vault matching the bundle identity, so the caller should record it. */
  record: boolean;
  /** The vault's manifest after this pass, or null when this pass did not produce one (the caller keeps what it had). */
  manifest: Manifest | null;
  /** Per-file drift only: files updated in place / newly added / left because edited / trashed because dropped+unedited / dropped but edited. */
  updated: string[];
  added: string[];
  leftEdited: string[];
  removed: string[];
  keptEdited: string[];
}

/** The decision table. Pure: the caller supplies the two file listings (only read for `match`). */
export function planAutoExtraction(input: {
  status: BundledVaultVersionStatus['kind'];
  bundleId: string;
  recordedId: string | null;
  bundledFiles: readonly string[];
  extractedFiles: readonly string[];
  /** 'off' = this caller predates manifests (legacy behaviour); 'none' = manifests are used but this vault has none yet. */
  manifest?: 'off' | 'none' | 'present';
  /** The paths the manifest says were extracted — a missing one of these was DELETED BY THE USER and is not re-added. */
  manifestPaths?: ReadonlySet<string>;
}): ExtractionPlan {
  const m = input.manifest ?? 'off';
  switch (input.status) {
    case 'no-extracted': return { action: 'copy-all', files: [] };
    case 'drift': return { action: m === 'present' ? 'per-file-update' : 'backup-and-reextract', files: [] };
    case 'no-bundled': return { action: 'skip-no-bundled', files: [] };
    case 'unparseable': return { action: 'skip-unparseable', files: [] };
    case 'match': {
      if (input.recordedId === input.bundleId) {
        return { action: m === 'none' ? 'adopt-manifest' : 'skip-same-identity', files: [] };
      }
      const have = new Set(input.extractedFiles);
      const known = input.manifestPaths ?? new Set<string>();
      const missing = input.bundledFiles.filter((f) => !have.has(f) && !known.has(f));
      return { action: 'add-missing', files: [...missing].sort() };
    }
  }
}

/** Every file under `root`, relative to it, skipping Forge-managed state and backup dirs at any depth (the same filter the copier uses). */
async function listFilesRelative(adapter: ExtractorAdapter, root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const listing = await adapter.list(dir);
    for (const f of listing.files) out.push(f.slice(root.length + 1));
    for (const d of listing.folders) {
      const name = d.slice(dir.length + 1);
      if (isReservedDirName(name)) continue;
      await walk(d);
    }
  };
  await walk(root);
  return out;
}

async function mkdirP(adapter: ExtractorAdapter, dir: string): Promise<void> {
  const parts = dir.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const d = parts.slice(0, i).join('/');
    if (await adapter.exists(d)) continue;
    try { await adapter.mkdir(d); } catch { /* raced into existence */ }
  }
}

/** Drain 2026-08-25-0120 — move the outgoing extracted vault into its ONE rolling backup dir, replacing any previous backup.
 *  Replace-then-move, not move-onto: `rename` onto an existing directory is not portable across adapters. The `.bak.previous` name is
 *  load-bearing: the engine walk and the plugin mount both exclude `\.bak\.` segments (rolling-backup-core.ts). */
async function backupExtractedDir(adapter: ExtractorAdapter, targetDir: string): Promise<void> {
  let folders: string[] = [];
  try {
    folders = (await adapter.list('/'))?.folders ?? [];
  } catch (e) {
    console.error('backupExtractedDir: vault root list failed', e);
  }
  const plan = planRollingBackup(targetDir, folders);
  if (plan.removeExistingFirst) {
    try {
      await adapter.rmdir(plan.backupDir, true);
    } catch (e) {
      console.error(`backupExtractedDir: rmdir ${plan.backupDir} failed`, e);
    }
  }
  try {
    await adapter.rename(targetDir, plan.backupDir);
    console.log(`Forge: ${targetDir} → ${plan.backupDir} (rolling backup)`);
  } catch (e) {
    // The re-extract must still happen. Fall back to the v0.2.106 behaviour rather than copying the new bundle on top of the old
    // tree, which would leave bundle-dropped files behind.
    console.error(`backupExtractedDir: rename ${targetDir} → ${plan.backupDir} failed; falling back to delete`, e);
    try {
      await adapter.rmdir(targetDir, true);
    } catch (e2) {
      console.error(`backupExtractedDir: fallback rmdir ${targetDir} failed`, e2);
    }
  }
}

/** `{ <path relative to the library root>: <hash> }` of every file in a bundle directory. */
export async function manifestOfBundleDir(adapter: ExtractorAdapter, sourceDir: string): Promise<Manifest> {
  const out: Manifest = {};
  if (!(await adapter.exists(sourceDir))) return out;
  for (const rel of await listFilesRelative(adapter, sourceDir)) out[rel] = hashBytes(await adapter.readBinary(`${sourceDir}/${rel}`));
  return out;
}

const emptyOutcome = (action: ExtractionAction): ExtractionOutcome => ({
  action, copied: [], record: false, manifest: null, updated: [], added: [], leftEdited: [], removed: [], keptEdited: [],
});

async function hashFile(adapter: ExtractorAdapter, path: string): Promise<string> {
  return hashBytes(await adapter.readBinary(path));
}

/** Hash every named file under `root` (null when it is not there). */
async function hashMany(adapter: ExtractorAdapter, root: string, rels: readonly string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const rel of rels) {
    const p = `${root}/${rel}`;
    out[rel] = (await adapter.exists(p)) ? await hashFile(adapter, p) : null;
  }
  return out;
}

async function writeCopy(adapter: ExtractorAdapter, from: string, to: string): Promise<void> {
  const slash = to.lastIndexOf('/');
  if (slash > 0) await mkdirP(adapter, to.slice(0, slash));
  await adapter.writeBinary(to, await adapter.readBinary(from));
}

/** The ONE rolling backup as a COPY of the vault (the vault stays in place). Best effort: a failed backup must not block the update. */
async function snapshotToRollingBackupCore(adapter: ExtractorAdapter, targetDir: string): Promise<void> {
  try {
    let folders: string[] = [];
    try { folders = (await adapter.list('/'))?.folders ?? []; } catch { /* the plan below copes with an empty list */ }
    const plan = planRollingBackup(targetDir, folders);
    if (plan.removeExistingFirst) await adapter.rmdir(plan.backupDir, true);
    await copyDirRecursive(adapter, targetDir, plan.backupDir);
    console.log(`Forge: ${targetDir} → ${plan.backupDir} (rolling backup, copy)`);
  } catch (e) {
    console.error('snapshotToRollingBackupCore failed; the update continues', e);
  }
}

export async function ensureBundledVaultCore(
  adapter: ExtractorAdapter,
  opts: {
    sourceDir: string; targetDir: string; label: string; bundleId: string; recordedId: string | null;
    /** The vault's manifest: an object, `null` (manifests in use, none recorded yet) or `undefined` (a caller that predates manifests). */
    manifest?: Manifest | null;
    /** How a bundle-dropped, unedited file is removed (Obsidian: leaf-detach + system trash). Defaults to a plain remove. */
    trash?: (path: string) => Promise<void>;
  },
): Promise<ExtractionOutcome> {
  const { sourceDir, targetDir, label, bundleId, recordedId } = opts;
  const mState: 'off' | 'none' | 'present' = opts.manifest === undefined ? 'off' : opts.manifest === null ? 'none' : 'present';
  const skip = (action: ExtractionAction): ExtractionOutcome => emptyOutcome(action);

  if (!(await adapter.exists(sourceDir))) {
    console.warn(`Forge: bundled ${label} missing from plugin assets; skipping extraction`);
    return skip('skip-no-source');
  }

  const bundledTomlPath = `${sourceDir}/forge.toml`;
  const extractedTomlPath = `${targetDir}/forge.toml`;
  const bundledBody = (await adapter.exists(bundledTomlPath)) ? await adapter.read(bundledTomlPath) : null;
  const extractedBody =
    (await adapter.exists(targetDir)) && (await adapter.exists(extractedTomlPath))
      ? await adapter.read(extractedTomlPath)
      : null;
  const status = compareBundledVaultVersion(bundledBody, extractedBody);

  const needLists = status.kind === 'match' || (status.kind === 'drift' && mState === 'present');
  const lists = needLists
    ? { bundled: await listFilesRelative(adapter, sourceDir), extracted: await listFilesRelative(adapter, targetDir) }
    : { bundled: [] as string[], extracted: [] as string[] };
  const plan = planAutoExtraction({
    status: status.kind,
    bundleId,
    recordedId,
    bundledFiles: lists.bundled,
    extractedFiles: lists.extracted,
    manifest: mState,
    manifestPaths: opts.manifest ? new Set(Object.keys(opts.manifest)) : undefined,
  });

  /** The manifest of a tree we just wrote from the bundle: every bundle file's hash. */
  const manifestOfBundle = (): Promise<Manifest> => manifestOfBundleDir(adapter, sourceDir);

  switch (plan.action) {
    case 'skip-no-bundled':
      console.warn(`Forge: bundled ${label} forge.toml missing or unreadable; skipping`);
      return skip('skip-no-bundled');
    case 'skip-unparseable':
      console.warn(
        `Forge: cannot compare ${label} versions (${status.kind === 'unparseable' ? status.reason : 'unparseable'}); skipping to avoid data loss`,
      );
      return skip('skip-unparseable');
    case 'skip-same-identity':
      console.log(`Forge: ${label} already at version ${status.kind === 'match' ? status.version : '?'} with this bundle's content; skipping`);
      return skip('skip-same-identity');

    case 'adopt-manifest': {
      // No vault write at all: record which files are byte-identical to the bundle, so later passes can tell edited from untouched.
      const both = lists.bundled.filter((rel) => lists.extracted.includes(rel));
      const bundleH = await hashMany(adapter, sourceDir, both);
      const diskH = await hashMany(adapter, targetDir, both);
      const adopted: Manifest = {};
      for (const rel of both) if (bundleH[rel] !== null && bundleH[rel] === diskH[rel]) adopted[rel] = bundleH[rel] as string;
      console.log(`Forge: ${label} manifest recorded for ${Object.keys(adopted).length} unedited file(s); no vault files were written`);
      return { ...emptyOutcome('adopt-manifest'), record: true, manifest: adopted };
    }

    case 'add-missing': {
      for (const rel of plan.files) await writeCopy(adapter, `${sourceDir}/${rel}`, `${targetDir}/${rel}`);
      console.log(
        `Forge: ${label} bundle content changed at version ${status.kind === 'match' ? status.version : '?'}; ` +
        `added ${plan.files.length} missing file(s), left existing files untouched`,
      );
      let next: Manifest | null = null;
      if (mState !== 'off') {
        next = { ...(opts.manifest ?? {}) };
        // adopt files that are byte-identical to the bundle (a vault extracted before manifests), plus what was just added
        const both = lists.bundled.filter((rel) => lists.extracted.includes(rel) && !(rel in next!));
        const bundleH = await hashMany(adapter, sourceDir, both);
        const diskH = await hashMany(adapter, targetDir, both);
        for (const rel of both) if (bundleH[rel] !== null && bundleH[rel] === diskH[rel]) next[rel] = bundleH[rel] as string;
        for (const rel of plan.files) next[rel] = await hashFile(adapter, `${sourceDir}/${rel}`);
      }
      return { ...emptyOutcome('add-missing'), copied: plan.files, record: true, manifest: next };
    }

    case 'per-file-update': {
      const manifest = opts.manifest as Manifest;
      const bundleH = await hashMany(adapter, sourceDir, lists.bundled);
      const bundleHashes = Object.fromEntries(Object.entries(bundleH).map(([k, v]) => [k, v as string]));
      const dropped = findDroppedCandidates(manifest, new Set(lists.bundled));
      const diskRels = [...new Set([...lists.bundled, ...dropped])];
      const diskHashes = await hashMany(adapter, targetDir, diskRels);
      const drift = planFileDrift({ manifest, bundleHashes, diskHashes });
      if (status.kind === 'drift') {
        console.log(`Forge: ${label} drift detected (extracted ${status.extracted} → bundled ${status.bundled}); updating per file`);
      }
      const willWrite = drift.update.length + drift.add.length + drift.remove.length + drift.leftEdited.length > 0;
      if (willWrite) await snapshotToRollingBackupCore(adapter, targetDir);
      for (const rel of [...drift.update, ...drift.add]) await writeCopy(adapter, `${sourceDir}/${rel}`, `${targetDir}/${rel}`);
      const sidecars: string[] = [];
      for (const rel of drift.leftEdited) {
        try {
          await writeCopy(adapter, `${sourceDir}/${rel}`, `${targetDir}/${rel}.bundled`);   // the new version, beside the user's file
          sidecars.push(`${rel}.bundled`);
        } catch (e) {
          console.error(`Forge: could not write ${rel}.bundled`, e);
        }
      }
      const removed: string[] = [];
      const keptEdited = [...drift.keptEdited];
      const next = { ...drift.next };
      for (const rel of drift.remove) {
        try {
          await (opts.trash ?? ((p: string) => adapter.rmdir(p, false)))(`${targetDir}/${rel}`);
          removed.push(rel);
        } catch (e) {
          console.error(`Forge: could not remove bundle-dropped ${rel}`, e);
          next[rel] = manifest[rel];                       // still ours: retried on the next pass
        }
      }
      console.log(
        `Forge: ${label} per-file drift: ${drift.update.length} updated, ${drift.add.length} added, ${drift.leftEdited.length} edited (left), ` +
        `${removed.length} dropped removed, ${keptEdited.length} dropped-but-edited kept`,
      );
      return {
        ...emptyOutcome('per-file-update'), record: true, manifest: next,
        updated: drift.update, added: drift.add, leftEdited: drift.leftEdited, removed, keptEdited,
      };
    }

    case 'backup-and-reextract':
      if (status.kind === 'drift') {
        console.log(`Forge: ${label} drift detected (extracted ${status.extracted} → bundled ${status.bundled}); re-extracting`);
      }
      await backupExtractedDir(adapter, targetDir);
      break;
    case 'copy-all':
      break;
  }

  // Drain 2026-08-25-1010 — `isReservedDirName` so Forge-managed state and backup dirs in the bundle never travel into a user's vault.
  await copyDirRecursive(adapter, sourceDir, targetDir, isReservedDirName);
  console.log(`Forge: extracted bundled ${label} into vault`);
  return { ...emptyOutcome(plan.action), record: true, manifest: mState === 'off' ? null : await manifestOfBundle() };
}

// ---- the launch sweep ------------------------------------------------------------------------------------------------------

export interface SweepResult {
  /** Paths (relative to the library root) trashed: in the manifest, absent from the bundle, byte-identical to what was extracted. */
  removed: string[];
  /** Dropped from the bundle but edited since: left alone and relinquished. */
  keptEdited: string[];
  /** The manifest after the sweep, or null when there was none (nothing is ever trashed without one). */
  next: Manifest | null;
}

/** The bundle-dropped sweep, manifest-based (drain 2026-10-11-0900 §2). With no manifest it does nothing. */
export async function sweepBundleDroppedCore(
  adapter: ExtractorAdapter,
  opts: { sourceDir: string; targetDir: string; manifest: Manifest | null; trash: (path: string) => Promise<void> },
): Promise<SweepResult> {
  const { sourceDir, targetDir, manifest, trash } = opts;
  if (manifest === null) return { removed: [], keptEdited: [], next: null };
  const bundleFiles = new Set((await adapter.exists(sourceDir)) ? await listFilesRelative(adapter, sourceDir) : []);
  const candidates = findDroppedCandidates(manifest, bundleFiles);
  const diskHashes = bundleFiles.size === 0 ? {} : await hashMany(adapter, targetDir, candidates);
  const plan = planManifestSweep({ manifest, bundleFiles, diskHashes });
  if (plan.bailedEmptyBundle) {
    console.error(`[sweep] ${targetDir}: the bundle listing is empty but the manifest is not; refusing to sweep (${sourceDir})`);
    return { removed: [], keptEdited: [], next: manifest };
  }
  const removed: string[] = [];
  const next = { ...plan.next };
  for (const rel of plan.remove) {
    try {
      await trash(`${targetDir}/${rel}`);
      removed.push(rel);
    } catch (e) {
      console.error(`[sweep] ${targetDir}: could not trash ${rel}`, e);
      next[rel] = manifest[rel];                         // still ours: retried on the next launch
    }
  }
  return { removed, keptEdited: plan.keptEdited, next };
}

// ---- the identity record ------------------------------------------------------------------------------------------

/** `{ <vault name>: <bundle content id at its last extraction> }`, kept beside the plugin's own restored assets. */
export const EXTRACTED_IDS_FILE = '.extracted-bundle-ids.json';

export function extractedIdsPath(pluginDir: string): string {
  return `${pluginDir.replace(/\/+$/, '')}/assets/${EXTRACTED_IDS_FILE}`;
}

/** Tolerant: anything that is not a JSON object of string values yields only its string-valued entries (a corrupt record means
 *  "no record", which costs one add-missing pass — never a destructive action). */
export function parseExtractedIds(text: string | null | undefined): Record<string, string> {
  if (!text) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch { return {}; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

export function serializeExtractedIds(ids: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(ids).sort()) sorted[k] = ids[k];
  return JSON.stringify(sorted, null, 2);
}
