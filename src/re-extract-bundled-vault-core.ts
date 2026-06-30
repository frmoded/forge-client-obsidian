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

  /** Extracted files that DON'T exist in the bundle at all. These are
   *  user-authored notes the cohort dropped into the library subdir.
   *  Preserved — re-extract won't touch them (copyDirRecursive only
   *  walks the bundled-side tree). Surfaced here so the caller can
   *  report them in the success Notice. */
  filesPreserved: string[];

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
 *  - In extracted only            → filesPreserved (= user-authored)
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
  const filesPreserved: string[] = [];
  const filesToCreate: string[] = [];

  for (const [path, extractedHash] of extractedFiles) {
    const bundledHash = bundledFiles.get(path);
    if (bundledHash === undefined) {
      filesPreserved.push(path);
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
  filesPreserved.sort();
  filesToCreate.sort();

  return { filesToTrash, filesUntouched, filesPreserved, filesToCreate };
}
