// Pure-core decision: given the extracted (in-vault) state of a
// bundled library + the bundled-canonical state, decide which files
// need to be trashed before re-extract.
//
// Used by the "Forge: Re-extract bundled library vault" command. The
// command lists files under `<vault>/` (extracted side) and under
// `plugin-assets/vaults/<vault>/` (bundled side), maps each path to
// its sha256, hands both maps to this function, and acts on the
// returned plan.
//
// Pure-core extraction No. 33 in the series. Same `node --test`
// pattern — no `obsidian` import, no I/O, just a Map → Map → plan
// transform.

/** Decision plan for a re-extract operation. All paths are
 *  vault-relative (no leading slash, no library-dir prefix), so
 *  callers can prepend `<libraryDirName>/` when actually touching
 *  the vault. */
export interface ReExtractDecision {
  /** Extracted files whose content drifted from the bundled
   *  canonical. These are the user's local edits — they get
   *  trashed (recoverable) before re-extract overwrites them. */
  filesToTrash: string[];

  /** Extracted files that already match bundled-canonical byte-for-
   *  byte. The re-extract will re-copy them; trashing isn't strictly
   *  required, but is also unnecessary. Caller skips trash for these. */
  filesUntouched: string[];

  /** Extracted files that DON'T exist in the bundle at all. The bundle
   *  is authoritative for the library subdir, so these are treated as
   *  bundle-dropped (the bundle had them in a prior version and a
   *  newer version dropped them, OR cohort manually authored them
   *  inside the library subdir).
   *
   *  v0.2.229 contract change (closes Pebble 1, drain 2026-07-02-0930):
   *  prior name was `filesPreserved` — caller left them untouched.
   *  Result: stragglers persisted across vault version bumps.
   *  forge-music v0.7.0 dropped 8 engineer-mode files; cohort vaults
   *  kept the old copies, breaking the v0.2.228 smoke. New contract:
   *  caller TRASHES these via system trash (recoverable). If cohort
   *  had local content, recovery from system trash. Notice surfaces
   *  the names so cohort knows what was moved. */
  filesBundleDropped: string[];

  /** Bundled files not present in the extracted side. These will be
   *  created by the re-extract. Surfaced for counts. */
  filesToCreate: string[];
}

/** Decide what to do for each file in the extracted + bundled snapshots.
 *
 *  Both maps are keyed by vault-relative path (no leading slash, no
 *  library-dir prefix) and valued by a content fingerprint — any
 *  string that the caller can compute consistently for both sides.
 *  sha256 is the obvious choice; the function doesn't care which
 *  hash, just that equal contents map to equal strings.
 *
 *  Decision matrix per path:
 *  - In both, fingerprints match  → filesUntouched
 *  - In both, fingerprints differ → filesToTrash (= edited locally)
 *  - In extracted only            → filesBundleDropped (= bundle no longer ships)
 *  - In bundled only              → filesToCreate (= new in bundle)
 *
 *  Paths are returned in sorted order in each list so the modal's
 *  count/preview is deterministic across runs. */
export function decideReExtractActions(
  extractedFiles: Map<string, string>,
  bundledFiles: Map<string, string>,
): ReExtractDecision {
  const filesToTrash: string[] = [];
  const filesUntouched: string[] = [];
  const filesBundleDropped: string[] = [];
  const filesToCreate: string[] = [];

  for (const [path, extractedHash] of extractedFiles) {
    const bundledHash = bundledFiles.get(path);
    if (bundledHash === undefined) {
      filesBundleDropped.push(path);
    } else if (bundledHash === extractedHash) {
      filesUntouched.push(path);
    } else {
      filesToTrash.push(path);
    }
  }

  for (const path of bundledFiles.keys()) {
    if (!extractedFiles.has(path)) {
      filesToCreate.push(path);
    }
  }

  filesToTrash.sort();
  filesUntouched.sort();
  filesBundleDropped.sort();
  filesToCreate.sort();

  return { filesToTrash, filesUntouched, filesBundleDropped, filesToCreate };
}
