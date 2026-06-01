// v0.2.26 — derive the qualified snippet_id from a vault-relative
// file path. Files inside a library-vault subdirectory (declared by
// the user's `forge.toml` and surfaced via the plugin's
// libraryDirNames() Set) get qualified IDs like
// "forge-music/blues/song"; vault-root files keep the basename
// behavior ("song" for "song.md").
//
// This is the source-of-truth for snippet_id derivation. Any place
// in the plugin that resolved a snippet via basename pre-v0.2.26 is
// a candidate for migration — but the load-bearing call site is
// runSnippet() in main.ts; other view.file.basename uses are
// user-facing message strings, not snippet IDs.
//
// Why qualified IDs matter: the engine's SnippetRegistry indexes
// library-vault contents via os.walk (snippet_registry.py:168-178),
// producing bare IDs like `blues/song`. The resolver's `/`-branch
// hits `registry.get_in_vault(vault_name, bare)`; the no-`/` branch
// walks vault top-level bare keys. If the plugin sends "song" for
// a file at forge-music/blues/song.md, the no-`/` branch misses
// because no vault has top-level bare "song" — only
// `forge-music/blues/song`. Sending "forge-music/blues/song" hits
// the `/`-branch and resolves cleanly.

export function snippetIdFromPath(
  filePath: string,
  libraryDirNames: Set<string>,
): string {
  // Strip .md extension if present (caller is expected to gate by
  // file.extension === 'md'; helper is lenient about the suffix so
  // callers can pass either path or basename-without-extension).
  const withoutExt = filePath.replace(/\.md$/i, "");
  const firstSlash = withoutExt.indexOf("/");
  if (firstSlash === -1) {
    // Vault root.
    return withoutExt;
  }
  const topDir = withoutExt.slice(0, firstSlash);
  if (libraryDirNames.has(topDir)) {
    // Library subdir — keep the full qualified path.
    return withoutExt;
  }
  // Non-library subdir — fall back to basename (legacy behavior).
  return withoutExt.slice(withoutExt.lastIndexOf("/") + 1);
}
