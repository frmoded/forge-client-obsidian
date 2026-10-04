// New Forge note (beat_as_data Phase 0.5, drain 2026-10-04-1200) — the pure, testable half of the
// "New Forge note" dialog (ForgeSnippetModal in modal.ts).
//
// Why this exists as its own module: the dialog already existed ("New action note", reached from the
// per-note toolbar) but its decision logic — the data-note template, the offline content-type list, where
// the new note lands, the duplicate-name check — lived inside an obsidian-coupled file and could not be
// unit-tested. Per the repo's pure-core convention it is extracted here VERBATIM where it already existed
// (dataTemplate, FENCE_LANG, SEED, isBinaryContentType, the duplicate-name message) and extended only where
// this drain's scope adds behavior (yaml/musicxml, active-folder placement, location text).

/** Text content types the engine can deserialize — MUST stay equal to TEXT_CONTENT_TYPES in
 *  forge/core/serialization.py (pinned by new-note-core.test.ts, which reads the engine file the plugin
 *  bundles, so drift fails the suite instead of silently hiding a type from the dialog). */
export const TEXT_CONTENT_TYPES = ['json', 'yaml', 'text', 'markdown', 'musicxml', 'svg'] as const;

/** Used when /connect doesn't carry a content_types list (older backend, or connect failed). The text
 *  types first (so the default is `json`), then the one binary entry the dialog has always offered.
 *  Binary notes are out of scope for this drain — `jpeg` is the pre-existing entry, untouched. */
export const FALLBACK_CONTENT_TYPES: readonly string[] = [...TEXT_CONTENT_TYPES, 'jpeg'];

// Fence language tag per content_type. Obsidian's preview renders these nicely.
export const FENCE_LANG: Record<string, string> = {
  json: 'json',
  yaml: 'yaml',
  text: 'text',
  markdown: 'markdown',
  musicxml: 'xml',
  svg: 'xml',
  jpeg: 'text',
};

// Seed payload per content_type — short and instructive where possible, blank where any concrete seed
// would feel arbitrary.
export const SEED: Record<string, string> = {
  json: '{}',
  yaml: '',
  text: '',
  markdown: '',
  musicxml: '',
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>',
  jpeg: '',
};

// When `content` is provided (e.g., from "Save as data snippet"), it replaces the per-content_type seed
// payload and lands inside the same fenced block.
export function dataTemplate(name: string, contentType: string, content?: string): string {
  const lang = FENCE_LANG[contentType] ?? 'text';
  const body = content ?? SEED[contentType] ?? '';
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `description: ${name}`,
    '---',
    '',
    '```' + lang,
    body,
    '```',
    '',
  ].join('\n');
}

export function isBinaryContentType(ct: string): boolean {
  return ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/') || ct === 'jpeg';
}

/** The folder a new note should land in: the ACTIVE file's parent folder, else the vault root ('').
 *
 *  One deliberate exception: if the active file sits inside a plugin-MANAGED bundled library folder
 *  (forge-moda/, music-theory/, …) the note goes to the vault root instead. Those folders are extracted
 *  and re-extracted by the plugin ("Customize" / "Reset to bundled"), so a user's new note written into
 *  one would be shadowed, overwritten or swept — not a place to create authoring notes.
 *
 *  `managedTopLevelDirs` is passed in (BUNDLED_VAULT_NAME_SET at the call site) so this stays pure and so
 *  tests can pin both editions' managed sets. */
export function newNoteFolder(
  activeFilePath: string | null | undefined,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): string {
  if (!activeFilePath) return '';
  const parts = activeFilePath.split('/');
  if (parts.length < 2) return '';          // file at the vault root -> vault root
  if (managedTopLevelDirs.has(parts[0])) return '';
  return parts.slice(0, -1).join('/');
}

/** Vault-relative path for a new note named `name`. */
export function newNotePath(
  activeFilePath: string | null | undefined,
  name: string,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): string {
  const folder = newNoteFolder(activeFilePath, managedTopLevelDirs);
  return folder === '' ? `${name}.md` : `${folder}/${name}.md`;
}

/** "Creates in: …" line shown under the name field so the (now variable) location is never a surprise. */
export function describeNewNoteLocation(folder: string): string {
  return folder === '' ? 'Creates in: vault root' : `Creates in: ${folder}/`;
}

export type NewNoteCheck = { ok: true } | { ok: false; message: string };

/** Pre-flight duplicate check (v0.2.236). Path-scoped only: the same name in another folder is fine —
 *  only the EXACT path the new note would land at is checked. A collision is surfaced in the dialog; the
 *  note is never overwritten or auto-suffixed. `exists` is the vault lookup, injected so this is testable. */
export function checkNewNotePath(
  path: string,
  name: string,
  exists: (path: string) => boolean,
): NewNoteCheck {
  if (exists(path)) {
    return {
      ok: false,
      message:
        `A note named "${name}" already exists at ${path}. `
        + 'Choose a different name or open the existing note.',
    };
  }
  return { ok: true };
}

/** Wrapper .md for a binary data note. The bytes live at `contentRef`; the body is intentionally empty (the
 *  backend rejects content_ref + body content in the same note).
 *
 *  content_type is written UNQUOTED, exactly as dataTemplate does. It was quoted here from the first commit
 *  (4469de9) with no recorded reason; nothing depends on it (the engine reads frontmatter with yaml.safe_load, where
 *  `jpeg` and `"jpeg"` are the same string) so it was an oversight, fixed for consistency (drain 2026-10-04-2200 F5). */
export function binaryTemplate(name: string, contentType: string, contentRef: string): string {
  return [
    '---',
    'type: data',
    `content_type: ${contentType}`,
    `content_ref: ${contentRef}`,
    `description: ${name}`,
    '---',
    '',
  ].join('\n');
}

/** Where a binary data note's two files land. The wrapper .md follows the SAME folder-aware rule as every other
 *  new note (newNotePath), so it lands where the dialog's "Creates in:" line says; the asset bytes stay at
 *  `_assets/<name><ext>` at the vault root. */
export function binaryNotePaths(
  activeFilePath: string | null | undefined,
  name: string,
  ext: string,
  managedTopLevelDirs: ReadonlySet<string> = new Set(),
): { mdRel: string; assetRel: string } {
  return {
    assetRel: `_assets/${name}${ext}`,
    mdRel: newNotePath(activeFilePath, name, managedTopLevelDirs),
  };
}

/** Obsidian's own wording for a forbidden character in a file name (app.js, validator `jD`: it checks each
 *  "/"-separated segment against `\ / :` on macOS/Linux, and throws "File name cannot contain any of the
 *  following characters: \ / :"). Obsidian never raises it for "/" itself — it treats "/" as a folder
 *  separator — so a "/" in the name used to pass through and fail much later in the file write with a raw
 *  `ENOENT: ... open '/Users/...'` (absolute path leaked). We reject it BEFORE any write, with Obsidian's text. */
export const FORBIDDEN_NAME_CHARS_MESSAGE = 'File name cannot contain any of the following characters: \\ / :';

/** Pre-flight name check for the "New Forge note" dialog. Only "/" is rejected here; ":" and "\\" are still
 *  rejected (with the same message) by Obsidian's own validator inside vault.create. */
export function validateNoteName(name: string): NewNoteCheck {
  if (name.includes('/')) return { ok: false, message: FORBIDDEN_NAME_CHARS_MESSAGE };
  return { ok: true };
}
