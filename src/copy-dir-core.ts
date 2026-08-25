// Pure-core recursive directory copy. Lives in its own file so
// `node --test` can exercise it without importing `obsidian` —
// same pattern as closed-beta-ux.ts. The structural adapter type
// captures exactly the four methods the copy walk touches; the
// real Obsidian DataAdapter is a superset.

export interface CopyAdapter {
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
}

/** Recursively copy `src` → `dst` through a CopyAdapter. Walks files
 *  and folders returned by `adapter.list`; mkdir's the target dir
 *  first, then mirrors each child with the same name suffix.
 *
 *  Used by welcome.ts's bundled-vault extraction to copy a bundled
 *  library from plugin assets into the user's vault root.
 *  Implementation is structural — no Obsidian-specific knowledge,
 *  so it survives Obsidian API drift unless `list` itself changes
 *  shape.
 *
 *  `skipDirName` (drain 2026-08-25-1010) — OPT-IN directory filter.
 *  Callers extracting a bundle into a user vault pass
 *  `isReservedDirName`, so Forge-managed state (`.forge/`,
 *  `.obsidian/`, `.git/`) and backup dirs never travel from the
 *  bundle into someone's vault.
 *
 *  Opt-in and not the default ON PURPOSE. The rolling-backup copy
 *  (main.ts `snapshotToRollingBackup`) uses this same function to
 *  preserve the outgoing extracted tree, and a backup that silently
 *  drops the user's runtime state is not a backup. One function, two
 *  legitimate jobs, and the caller says which.
 *
 *  Why this argument exists at all: drain 0140 found `.forge/`
 *  snapshots shipping in every release zip because the zip's bulk-add
 *  was unfiltered while the exclusion lived only in the bundle-sync
 *  walker. Extraction is the same shape one step further down — it
 *  copies the bundle into the user's vault. Nothing leaks today only
 *  because 0140 emptied the bundle, which is a property of the input,
 *  not a guarantee of the copier. */
export async function copyDirRecursive(
  adapter: CopyAdapter,
  src: string,
  dst: string,
  skipDirName?: (name: string) => boolean,
): Promise<void> {
  await adapter.mkdir(dst);
  const listing = await adapter.list(src);
  for (const filePath of listing.files) {
    // `adapter.list` returns paths from vault root; the path under
    // src is everything after the prefix + the trailing slash.
    const name = filePath.slice(src.length + 1);
    const data = await adapter.readBinary(filePath);
    await adapter.writeBinary(`${dst}/${name}`, data);
  }
  for (const dirPath of listing.folders) {
    const name = dirPath.slice(src.length + 1);
    if (skipDirName?.(name)) continue;
    await copyDirRecursive(adapter, dirPath, `${dst}/${name}`, skipDirName);
  }
}
