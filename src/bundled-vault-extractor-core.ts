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
// NO OBSIDIAN IMPORTS (pure-core convention).

import { copyDirRecursive, type CopyAdapter } from './copy-dir-core.ts';
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
}

/** The decision table. Pure: the caller supplies the two file listings (only read for `match`). */
export function planAutoExtraction(input: {
  status: BundledVaultVersionStatus['kind'];
  bundleId: string;
  recordedId: string | null;
  bundledFiles: readonly string[];
  extractedFiles: readonly string[];
}): ExtractionPlan {
  switch (input.status) {
    case 'no-extracted': return { action: 'copy-all', files: [] };
    case 'drift': return { action: 'backup-and-reextract', files: [] };
    case 'no-bundled': return { action: 'skip-no-bundled', files: [] };
    case 'unparseable': return { action: 'skip-unparseable', files: [] };
    case 'match': {
      if (input.recordedId === input.bundleId) return { action: 'skip-same-identity', files: [] };
      const have = new Set(input.extractedFiles);
      const missing = input.bundledFiles.filter((f) => !have.has(f));
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

export async function ensureBundledVaultCore(
  adapter: ExtractorAdapter,
  opts: { sourceDir: string; targetDir: string; label: string; bundleId: string; recordedId: string | null },
): Promise<ExtractionOutcome> {
  const { sourceDir, targetDir, label, bundleId, recordedId } = opts;
  const skip = (action: ExtractionAction): ExtractionOutcome => ({ action, copied: [], record: false });

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

  const lists = status.kind === 'match'
    ? { bundled: await listFilesRelative(adapter, sourceDir), extracted: await listFilesRelative(adapter, targetDir) }
    : { bundled: [] as string[], extracted: [] as string[] };
  const plan = planAutoExtraction({
    status: status.kind,
    bundleId,
    recordedId,
    bundledFiles: lists.bundled,
    extractedFiles: lists.extracted,
  });

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
    case 'add-missing': {
      for (const rel of plan.files) {
        const to = `${targetDir}/${rel}`;
        const slash = to.lastIndexOf('/');
        if (slash > 0) await mkdirP(adapter, to.slice(0, slash));
        await adapter.writeBinary(to, await adapter.readBinary(`${sourceDir}/${rel}`));
      }
      console.log(
        `Forge: ${label} bundle content changed at version ${status.kind === 'match' ? status.version : '?'}; ` +
        `added ${plan.files.length} missing file(s), left existing files untouched`,
      );
      return { action: 'add-missing', copied: plan.files, record: true };
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
  return { action: plan.action, copied: [], record: true };
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
