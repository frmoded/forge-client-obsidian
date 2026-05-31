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
 *  Used by welcome.ts:ensureBundledForgeModa to extract the bundled
 *  forge-moda library from plugin assets into the user's vault root.
 *  Implementation is structural — no Obsidian-specific knowledge,
 *  so it survives Obsidian API drift unless `list` itself changes
 *  shape. */
export async function copyDirRecursive(
  adapter: CopyAdapter,
  src: string,
  dst: string,
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
    await copyDirRecursive(adapter, dirPath, `${dst}/${name}`);
  }
}
